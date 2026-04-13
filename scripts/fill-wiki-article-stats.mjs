import { finished } from 'node:stream/promises';
import pgPackage from 'pg';
import copyStreamsPackage from 'pg-copy-streams';
import '../server/lib/load-env.mjs';
import { generateDeterministicCardStats, STAT_KEYS } from '../shared/card-stats.mjs';
import { buildRarityLevels, DEFAULT_RARITY_THRESHOLDS, getRarityByViewCount } from '../shared/rarity.mjs';

const { Client } = pgPackage;
const { from: copyFrom } = copyStreamsPackage;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wiki:wiki@localhost:5432/postgres';
const FINAL_TABLE = process.env.WIKI_TABLE_NAME || 'wiki_articles';
const STAGE_TABLE = 'wiki_article_stats_stage';
const LOG_INTERVAL = Number(process.env.STATS_LOG_INTERVAL || 10000);
const rarityLevels = buildRarityLevels(DEFAULT_RARITY_THRESHOLDS);

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function printHelp() {
  console.log(`Usage: npm run fill:article-stats

Environment variables:
  DATABASE_URL       PostgreSQL connection string
  WIKI_TABLE_NAME    Target wiki articles table, default: wiki_articles
  STATS_LOG_INTERVAL Progress logging interval, default: 10000

What it does:
  1. Reads article ids and view_count from wiki_articles
  2. Determines rarity from fixed thresholds
  3. Generates six stats using the same ranges as the frontend
  4. Updates hp, stamina, strength, dexterity, intelligence, charisma in PostgreSQL
`);
}

function buildStatsForArticle(articleId, viewCount) {
  const rarity = getRarityByViewCount(viewCount, rarityLevels);
  return generateDeterministicCardStats(rarity, articleId);
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

async function ensureTargetColumns(client) {
  await client.query(`
    ALTER TABLE ${FINAL_TABLE}
    ADD COLUMN IF NOT EXISTS hp INTEGER,
    ADD COLUMN IF NOT EXISTS stamina INTEGER,
    ADD COLUMN IF NOT EXISTS strength INTEGER,
    ADD COLUMN IF NOT EXISTS dexterity INTEGER,
    ADD COLUMN IF NOT EXISTS intelligence INTEGER,
    ADD COLUMN IF NOT EXISTS charisma INTEGER
  `);
}

async function createStageTable(client) {
  await client.query(`
    DROP TABLE IF EXISTS ${STAGE_TABLE};

    CREATE UNLOGGED TABLE ${STAGE_TABLE} (
      id BIGINT PRIMARY KEY,
      hp INTEGER NOT NULL,
      stamina INTEGER NOT NULL,
      strength INTEGER NOT NULL,
      dexterity INTEGER NOT NULL,
      intelligence INTEGER NOT NULL,
      charisma INTEGER NOT NULL
    )
  `);
}

async function fillStageTable(client) {
  const source = await client.query(`
    SELECT id, view_count
    FROM ${FINAL_TABLE}
    ORDER BY id
  `);

  const copyStream = client.query(
    copyFrom(
      `COPY ${STAGE_TABLE} (id, hp, stamina, strength, dexterity, intelligence, charisma) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t')`
    )
  );
  const copyFinished = finished(copyStream);

  let processed = 0;

  try {
    for (const row of source.rows) {
      const stats = buildStatsForArticle(Number(row.id), Number(row.view_count));

      await writeCopyRow(copyStream, [
        row.id,
        stats.hp,
        stats.stamina, //танк
        stats.strength, //воин
        stats.dexterity, //разбойник
        stats.intelligence, //маг
        stats.charisma //бард
      ]);

      processed += 1;
      if (processed % LOG_INTERVAL === 0) {
        log(`Stats prepared: ${processed}`);
      }
    }

    copyStream.end();
    await copyFinished;
    log(`Stats prepared: ${processed}`);
  } catch (error) {
    copyStream.destroy(error);
    throw error;
  }
}

async function applyStats(client) {
  await client.query(`
    UPDATE ${FINAL_TABLE} AS articles
    SET
      hp = stage.hp,
      stamina = stage.stamina,
      strength = stage.strength,
      dexterity = stage.dexterity,
      intelligence = stage.intelligence,
      charisma = stage.charisma
    FROM ${STAGE_TABLE} AS stage
    WHERE stage.id = articles.id
  `);

  const result = await client.query(`
    SELECT COUNT(*)::BIGINT AS count
    FROM ${FINAL_TABLE}
    WHERE ${STAT_KEYS.map((key) => `${key} IS NOT NULL`).join(' AND ')}
  `);

  log(`Rows updated with stats: ${result.rows[0].count}`);
}

async function main() {
  if (process.argv.includes('--help')) {
    printHelp();
    return;
  }

  const client = new Client({
    connectionString: DATABASE_URL
  });

  await client.connect();
  log(`Using PostgreSQL at ${DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`);

  try {
    await ensureTargetColumns(client);
    await createStageTable(client);
    await fillStageTable(client);
    await applyStats(client);
    await client.query(`DROP TABLE ${STAGE_TABLE}`);
    log(`Done. ${FINAL_TABLE} now has hp, stamina, strength, dexterity, intelligence and charisma.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
