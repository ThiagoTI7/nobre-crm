import type { Pool } from 'pg';
import { createPool } from './pool';
import { SEED_OPPORTUNITIES } from './seed-data';

/** Carga idempotente: registros existentes (mesmo code) não são alterados. */
export async function seed(pool: Pool, { reset = false }: { reset?: boolean } = {}): Promise<number> {
  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query('BEGIN');
    if (reset) {
      await client.query('TRUNCATE stage_history, opportunity_items, opportunities RESTART IDENTITY');
    }
    for (const o of SEED_OPPORTUNITIES) {
      const res = await client.query(
        `INSERT INTO opportunities
           (code, company, seller, estimated_value, stage, last_contact_at, proposal_valid_until, event_date, loss_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (code) DO NOTHING`,
        [o.code, o.company, o.seller, o.estimatedValue, o.stage, o.lastContactAt, o.proposalValidUntil, o.eventDate, o.lossReason],
      );
      if (res.rowCount === 0) continue;
      inserted++;
      for (const item of o.items) {
        await client.query(
          'INSERT INTO opportunity_items (opportunity_code, name, quantity) VALUES ($1,$2,$3)',
          [o.code, item.name, item.quantity],
        );
      }
      await client.query(
        'INSERT INTO stage_history (opportunity_code, from_stage, to_stage, note) VALUES ($1, NULL, $2, $3)',
        [o.code, o.stage, 'Carga inicial (dados fictícios do case)'],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return inserted;
}

if (require.main === module) {
  const pool = createPool();
  const reset = process.argv.includes('--reset');
  seed(pool, { reset })
    .then((n) => console.log(`Seed concluído: ${n} oportunidade(s) inserida(s)${reset ? ' (após reset)' : ''}.`))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
