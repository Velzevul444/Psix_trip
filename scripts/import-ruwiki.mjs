import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { finished } from 'node:stream/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import pgPackage from 'pg';
import copyStreamsPackage from 'pg-copy-streams';

const { Client } = pgPackage;
const { from: copyFrom } = copyStreamsPackage;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wiki:wiki@localhost:5432/postgres';
const MIN_VIEW_COUNT = Number(process.env.MIN_VIEW_COUNT || 1000);
const RUWIKI_INDEX_URL =
  process.env.RUWIKI_INDEX_URL ||
  'https://dumps.wikimedia.org/ruwiki/latest/ruwiki-latest-pages-articles-multistream-index.txt.bz2';
const PAGEVIEWS_MONTHLY_BASE_URL =
  process.env.PAGEVIEWS_MONTHLY_BASE_URL ||
  'https://dumps.wikimedia.org/other/pageview_complete/monthly/';
const PAGEVIEWS_DUMP_URL = process.env.PAGEVIEWS_DUMP_URL || '';
const PAGEVIEWS_MONTH = process.env.PAGEVIEWS_MONTH || '';
const CACHE_DIR = process.env.WIKIMEDIA_CACHE_DIR || path.resolve('tmp/wikimedia-cache');
const USER_AGENT = 'psyh-trip-full-importer/1.0';
const FINAL_TABLE = 'wiki_articles';
const RAW_PAGEVIEWS_STAGE_TABLE = 'wiki_pageviews_raw_stage';
const FILTERED_PAGEVIEWS_STAGE_TABLE = 'wiki_pageviews_filtered_stage';
const ARTICLES_STAGE_TABLE = 'wiki_articles_stage';
const PAGEVIEWS_LOG_INTERVAL = 500_000;
const ARTICLES_LOG_INTERVAL = 500_000;
const CONTROL_CHARS_PATTERN = /[\u0000-\u001F\u007F]/g;

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function printHelp() {
  console.log(`Usage: npm run import:ruwiki

Environment variables:
  DATABASE_URL               PostgreSQL connection string
  MIN_VIEW_COUNT             Minimum total views required, default: 1000
  RUWIKI_INDEX_URL           Optional override for the article index dump
  PAGEVIEWS_MONTHLY_BASE_URL Optional override for the monthly dump directory
  PAGEVIEWS_DUMP_URL         Optional override for a конкретный pageviews dump
  PAGEVIEWS_MONTH            Optional month label used in logs with PAGEVIEWS_DUMP_URL
  WIKIMEDIA_CACHE_DIR        Directory for downloaded dump files

What it does:
  1. Downloads the latest Russian Wikipedia article index dump
  2. Downloads the latest monthly Wikimedia pageviews dump
  3. Aggregates all ru.wikipedia article views
  4. Keeps every article with total views > MIN_VIEW_COUNT
  5. Saves them to wiki_articles using real Wikipedia page ids
`);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function discoverLatestPageviewsDump() {
  if (PAGEVIEWS_DUMP_URL) {
    return {
      month: PAGEVIEWS_MONTH || 'custom',
      url: PAGEVIEWS_DUMP_URL
    };
  }

  const rootHtml = await fetchText(PAGEVIEWS_MONTHLY_BASE_URL);
  const years = Array.from(rootHtml.matchAll(/href="(\d{4})\/"/g), (match) => match[1]);

  if (years.length === 0) {
    throw new Error('Could not discover available pageviews years.');
  }

  const latestYear = years.sort().at(-1);
  const yearUrl = new URL(`${latestYear}/`, PAGEVIEWS_MONTHLY_BASE_URL);
  const yearHtml = await fetchText(yearUrl);
  const monthPattern = new RegExp(`href="(${latestYear}-\\d{2})/"`, 'g');
  const months = Array.from(yearHtml.matchAll(monthPattern), (match) => match[1]);

  if (months.length === 0) {
    throw new Error(`Could not discover available pageviews months for ${latestYear}.`);
  }

  const latestMonth = months.sort().at(-1);
  const monthUrl = new URL(`${latestMonth}/`, yearUrl);
  const monthHtml = await fetchText(monthUrl);
  const filenames = Array.from(
    monthHtml.matchAll(/href="(pageviews-\d{6}-user\.bz2)"/g),
    (match) => match[1]
  );

  if (filenames.length === 0) {
    throw new Error(`Could not find a user pageviews dump for ${latestMonth}.`);
  }

  const filename = filenames.sort().at(-1);

  return {
    month: latestMonth,
    url: new URL(filename, monthUrl).toString()
  };
}

function ensureBinary(name) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-lc', `command -v ${name}`], {
      stdio: 'ignore'
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Required binary not found: ${name}`));
      }
    });
  });
}

function waitForSingleProcess(child, label, stderrChunks) {
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim();
      reject(new Error(`${label} exited with code ${code}${stderrText ? `: ${stderrText}` : ''}`));
    });
  });
}

function waitForProcess(child, label, stderrChunks) {
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim();
      reject(new Error(`${label} exited with code ${code}${stderrText ? `: ${stderrText}` : ''}`));
    });
  });
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function downloadFile(url, destinationPath) {
  await ensureDirectory(path.dirname(destinationPath));

  try {
    const stats = await fs.stat(destinationPath);
    if (stats.size > 0) {
      log(`Using cached dump: ${destinationPath}`);
      return;
    }
  } catch {}

  log(`Downloading dump to ${destinationPath}`);
  const tempPath = `${destinationPath}.part`;
  await fs.rm(tempPath, { force: true });

  const stderrChunks = [];
  const curl = spawn(
    'curl',
    [
      '-fL',
      '--retry', '8',
      '--retry-all-errors',
      '--retry-delay', '5',
      '-A', USER_AGENT,
      '-o', tempPath,
      url
    ],
    {
      stdio: ['ignore', 'ignore', 'pipe']
    }
  );

  curl.stderr.on('data', (chunk) => stderrChunks.push(chunk));
  try {
    await waitForSingleProcess(curl, 'curl', stderrChunks);
    await fs.rename(tempPath, destinationPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

function getCachePathForUrl(url) {
  const filename = path.basename(new URL(url).pathname);
  return path.join(CACHE_DIR, filename);
}

async function withDecompressedLines(filePath, onLine) {
  const bunzip = spawn('bunzip2', ['-c', filePath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const bunzipStderr = [];
  bunzip.stderr.on('data', (chunk) => bunzipStderr.push(chunk));

  const lineReader = readline.createInterface({
    input: bunzip.stdout,
    crlfDelay: Infinity
  });

  try {
    for await (const line of lineReader) {
      await onLine(line);
    }

    lineReader.close();
    await waitForProcess(bunzip, 'bunzip2', bunzipStderr);
  } catch (error) {
    lineReader.close();
    bunzip.kill('SIGTERM');
    throw error;
  }
}

function encodeCopyField(value) {
  const stringValue = String(value);

  if (/["\t\r\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

async function writeCopyRow(stream, fields) {
  const line = `${fields.map(encodeCopyField).join('\t')}\n`;

  if (!stream.write(line)) {
    await new Promise((resolve) => stream.once('drain', resolve));
  }
}

function sanitizeTitle(title) {
  const cleaned = title.replace(CONTROL_CHARS_PATTERN, '').trim();
  return cleaned || null;
}

function decodePageviewTitle(rawTitle) {
  try {
    return sanitizeTitle(decodeURIComponent(rawTitle).replaceAll('_', ' '));
  } catch {
    return sanitizeTitle(rawTitle.replaceAll('_', ' '));
  }
}

function parsePageviewsLine(line) {
  if (!line.startsWith('ru.wikipedia ')) {
    return null;
  }

  const parts = line.split(' ');
  let rawTitle;
  let totalViews;

  if (parts.length === 6) {
    [, rawTitle, , , totalViews] = parts;
  } else if (parts.length === 5) {
    [, rawTitle, , totalViews] = parts;
  } else {
    return null;
  }

  if (!rawTitle || rawTitle === '-' || !/^\d+$/.test(totalViews)) {
    return null;
  }

  const title = decodePageviewTitle(rawTitle);
  if (!title) {
    return null;
  }

  return {
    title,
    viewCount: Number(totalViews)
  };
}

function parseArticleIndexLine(line) {
  if (!line) {
    return null;
  }

  const firstColonIndex = line.indexOf(':');
  const secondColonIndex = line.indexOf(':', firstColonIndex + 1);

  if (firstColonIndex === -1 || secondColonIndex === -1) {
    return null;
  }

  const rawId = line.slice(firstColonIndex + 1, secondColonIndex);
  const title = line.slice(secondColonIndex + 1);

  if (!/^\d+$/.test(rawId) || !title.trim()) {
    return null;
  }

  const sanitizedTitle = sanitizeTitle(title);
  if (!sanitizedTitle) {
    return null;
  }

  return {
    id: Number(rawId),
    title: sanitizedTitle
  };
}

async function ensureSchema(client) {
  await client.query(`
    DROP TABLE IF EXISTS ${RAW_PAGEVIEWS_STAGE_TABLE};
    DROP TABLE IF EXISTS ${FILTERED_PAGEVIEWS_STAGE_TABLE};
    DROP TABLE IF EXISTS ${ARTICLES_STAGE_TABLE};

    CREATE TABLE IF NOT EXISTS ${FINAL_TABLE} (
      id BIGINT PRIMARY KEY,
      title TEXT NOT NULL UNIQUE,
      view_count BIGINT NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS ${FINAL_TABLE}_view_count_idx
      ON ${FINAL_TABLE} (view_count DESC);

    CREATE UNLOGGED TABLE ${RAW_PAGEVIEWS_STAGE_TABLE} (
      title TEXT NOT NULL,
      view_count BIGINT NOT NULL
    );
  `);
}

async function importRawPageviews(client, pageviewsFilePath, pageviewsMonth) {
  log(`Importing raw ru.wikipedia pageviews for ${pageviewsMonth}...`);

  const copyStream = client.query(
    copyFrom(
      `COPY ${RAW_PAGEVIEWS_STAGE_TABLE} (title, view_count) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t')`
    )
  );
  const copyFinished = finished(copyStream);

  let importedRows = 0;
  let skippedRows = 0;

  try {
    await withDecompressedLines(pageviewsFilePath, async (line) => {
      const parsed = parsePageviewsLine(line);
      if (!parsed) {
        skippedRows += 1;
        return;
      }

      await writeCopyRow(copyStream, [parsed.title, parsed.viewCount]);
      importedRows += 1;

      if (importedRows % PAGEVIEWS_LOG_INTERVAL === 0) {
        log(`Raw pageview rows imported: ${importedRows}`);
      }
    });

    copyStream.end();
    await copyFinished;
    log(`Raw pageview rows imported: ${importedRows}`);
    log(`Raw pageview rows skipped: ${skippedRows}`);
  } catch (error) {
    copyStream.destroy(error);
    throw error;
  }
}

async function aggregatePageviews(client) {
  log(`Aggregating titles with more than ${MIN_VIEW_COUNT} total views...`);

  await client.query(`
    CREATE UNLOGGED TABLE ${FILTERED_PAGEVIEWS_STAGE_TABLE} AS
    SELECT
      title,
      SUM(view_count)::BIGINT AS view_count
    FROM ${RAW_PAGEVIEWS_STAGE_TABLE}
    GROUP BY title
    HAVING SUM(view_count) > ${MIN_VIEW_COUNT};

    CREATE INDEX ${FILTERED_PAGEVIEWS_STAGE_TABLE}_title_idx
      ON ${FILTERED_PAGEVIEWS_STAGE_TABLE} (title);

    DROP TABLE ${RAW_PAGEVIEWS_STAGE_TABLE};
  `);

  const result = await client.query(`SELECT COUNT(*)::BIGINT AS count FROM ${FILTERED_PAGEVIEWS_STAGE_TABLE}`);
  log(`Filtered titles above threshold: ${result.rows[0].count}`);
}

async function importArticles(client, articleIndexFilePath) {
  log('Importing Russian Wikipedia article ids and titles...');

  await client.query(`
    CREATE UNLOGGED TABLE ${ARTICLES_STAGE_TABLE} (
      id BIGINT NOT NULL,
      title TEXT NOT NULL
    );
  `);

  const copyStream = client.query(
    copyFrom(
      `COPY ${ARTICLES_STAGE_TABLE} (id, title) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t')`
    )
  );
  const copyFinished = finished(copyStream);

  let importedRows = 0;
  let skippedRows = 0;

  try {
    await withDecompressedLines(articleIndexFilePath, async (line) => {
      const parsed = parseArticleIndexLine(line);
      if (!parsed) {
        skippedRows += 1;
        return;
      }

      await writeCopyRow(copyStream, [parsed.id, parsed.title]);
      importedRows += 1;

      if (importedRows % ARTICLES_LOG_INTERVAL === 0) {
        log(`Article index rows imported: ${importedRows}`);
      }
    });

    copyStream.end();
    await copyFinished;
    log(`Article index rows imported: ${importedRows}`);
    log(`Article index rows skipped: ${skippedRows}`);
  } catch (error) {
    copyStream.destroy(error);
    throw error;
  }
}

async function buildFinalTable(client) {
  log(`Filling ${FINAL_TABLE}...`);

  const duplicateTitlesResult = await client.query(`
    SELECT COUNT(*)::BIGINT AS count
    FROM (
      SELECT title
      FROM ${ARTICLES_STAGE_TABLE}
      GROUP BY title
      HAVING COUNT(*) > 1
    ) AS duplicate_titles
  `);
  const duplicateTitles = Number(duplicateTitlesResult.rows[0].count);

  if (duplicateTitles > 0) {
    log(
      `Duplicate article titles found in ${ARTICLES_STAGE_TABLE}: ${duplicateTitles}. ` +
        'Keeping the smallest page id for each title.'
    );
  }

  await client.query('BEGIN');

  try {
    await client.query(`TRUNCATE TABLE ${FINAL_TABLE}`);

    await client.query(`
      WITH deduplicated_articles AS (
        SELECT
          MIN(id) AS id,
          title
        FROM ${ARTICLES_STAGE_TABLE}
        GROUP BY title
      )
      INSERT INTO ${FINAL_TABLE} (id, title, view_count)
      SELECT
        articles.id,
        articles.title,
        pageviews.view_count
      FROM deduplicated_articles AS articles
      INNER JOIN ${FILTERED_PAGEVIEWS_STAGE_TABLE} AS pageviews
        ON pageviews.title = articles.title
    `);

    await client.query(`ANALYZE ${FINAL_TABLE}`);
    await client.query(`DROP TABLE ${FILTERED_PAGEVIEWS_STAGE_TABLE}`);
    await client.query(`DROP TABLE ${ARTICLES_STAGE_TABLE}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  const result = await client.query(`SELECT COUNT(*)::BIGINT AS count FROM ${FINAL_TABLE}`);
  log(`Rows saved to ${FINAL_TABLE}: ${result.rows[0].count}`);
}

async function main() {
  if (process.argv.includes('--help')) {
    printHelp();
    return;
  }

  await Promise.all([ensureBinary('curl'), ensureBinary('bunzip2')]);

  const { month, url } = await discoverLatestPageviewsDump();
  log(`Using PostgreSQL at ${DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`);
  log(`Using pageviews dump for ${month}`);
  log(`Import threshold: total views > ${MIN_VIEW_COUNT}`);

  const pageviewsFilePath = getCachePathForUrl(url);
  const articleIndexFilePath = getCachePathForUrl(RUWIKI_INDEX_URL);

  await downloadFile(url, pageviewsFilePath);
  await downloadFile(RUWIKI_INDEX_URL, articleIndexFilePath);

  const client = new Client({
    connectionString: DATABASE_URL
  });

  await client.connect();

  try {
    await ensureSchema(client);
    await importRawPageviews(client, pageviewsFilePath, month);
    await aggregatePageviews(client);
    await importArticles(client, articleIndexFilePath);
    await buildFinalTable(client);
    log(`Done. ${FINAL_TABLE} now contains all matching ru.wikipedia articles for ${month}.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
