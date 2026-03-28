import { createAppServer } from './app.mjs';
import { API_PORT, pool } from './lib/config.mjs';

const server = createAppServer();

server.listen(API_PORT, () => {
  console.log(
    `[${new Date().toISOString()}] Wiki API is listening on http://localhost:${API_PORT}`
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await pool.end();
    server.close(() => process.exit(0));
  });
}
