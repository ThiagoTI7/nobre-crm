import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { createPool } from './pool';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');


export async function migrate(pool: Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  const done = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Falha na migration ${file}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}

if (require.main === module) {
  const pool = createPool();
  migrate(pool)
    .then((applied) => {
      console.log(applied.length ? `Migrations aplicadas: ${applied.join(', ')}` : 'Banco já está atualizado.');
    })
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
