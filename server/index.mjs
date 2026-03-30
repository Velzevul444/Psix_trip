import { createAppServer } from './app.mjs';
import { initializeDatabaseSchema } from './lib/bootstrap.mjs';
import { API_PORT, pool } from './lib/config.mjs';

const server = createAppServer();

async function startServer() {
  try {
    await initializeDatabaseSchema();

    server.listen(API_PORT, () => {
      console.log(
        `[${new Date().toISOString()}] Wiki API is listening on http://localhost:${API_PORT}`
      );
    });
  } catch (error) {
    console.error('[bootstrap] Failed to initialize database schema:', error);
    await pool.end();
    process.exit(1);
  }
}

void startServer();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await pool.end();
    server.close(() => process.exit(0));
  });
}
