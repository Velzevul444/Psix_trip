import { ensureUsersTable, promoteBootstrapAdmins } from './auth.mjs';
import {
  ensureArticlesTable,
  ensureArticleStatsColumns,
  ensureUserArticleDropsTable
} from './articles.mjs';
import { ensureBossCardDefeatsTable, ensureBossesTable } from './bosses.mjs';
import { ensureClansTables } from './clans.mjs';
import { ensureDuelsTable } from './duels.mjs';

export async function initializeDatabaseSchema() {
  await ensureUsersTable();
  await ensureArticlesTable();
  await ensureArticleStatsColumns();
  await ensureUserArticleDropsTable();
  await ensureClansTables();
  await ensureBossesTable();
  await ensureBossCardDefeatsTable();
  await ensureDuelsTable();
  await promoteBootstrapAdmins();
}
