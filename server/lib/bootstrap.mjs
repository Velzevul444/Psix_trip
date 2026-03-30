import { ensureUsersTable, promoteBootstrapAdmins } from './auth.mjs';
import {
  ensureArticlesTable,
  ensureArticleStatsColumns,
  ensureUserArticleDropsTable
} from './articles.mjs';
import { ensureBossCardDefeatsTable, ensureBossesTable } from './bosses.mjs';

export async function initializeDatabaseSchema() {
  await ensureUsersTable();
  await ensureArticlesTable();
  await ensureArticleStatsColumns();
  await ensureUserArticleDropsTable();
  await ensureBossesTable();
  await ensureBossCardDefeatsTable();
  await promoteBootstrapAdmins();
}
