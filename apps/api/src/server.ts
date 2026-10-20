import 'dotenv/config';
import { buildApp } from './app';
import { createPool } from './db/pool';
import { currentDate } from './domain/dates';

async function main() {
  const pool = createPool();
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const app = await buildApp({ pool, today: () => currentDate(), corsOrigins, logger: true });
  const port = Number(process.env.PORT ?? 3333);

  const shutdown = async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
  if (process.env.REFERENCE_DATE) {
    app.log.info(`REFERENCE_DATE=${process.env.REFERENCE_DATE}: o sistema trata essa data como "hoje".`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
