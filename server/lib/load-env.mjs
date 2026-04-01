import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ENV_FILES = ['.env', '.env.local'];

function normalizeEnvValue(rawValue) {
  const trimmedValue = rawValue.trim();

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    const quote = trimmedValue[0];
    const innerValue = trimmedValue.slice(1, -1);

    if (quote === '"') {
      return innerValue
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }

    return innerValue;
  }

  return trimmedValue;
}

function loadEnvFile(filePath) {
  const fileContents = readFileSync(filePath, 'utf8');

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();

    if (!key || key in process.env) {
      continue;
    }

    const rawValue = line.slice(equalsIndex + 1);
    process.env[key] = normalizeEnvValue(rawValue);
  }
}

export function loadProjectEnv() {
  for (const fileName of ENV_FILES) {
    const filePath = path.join(PROJECT_ROOT, fileName);

    if (existsSync(filePath)) {
      loadEnvFile(filePath);
    }
  }
}

loadProjectEnv();
