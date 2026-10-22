import 'dotenv/config';
import { Pool, types } from 'pg';


types.setTypeParser(1082, (v) => v);

types.setTypeParser(1700, (v) => Number(v));

types.setTypeParser(20, (v) => Number(v));

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL não definida. Copie apps/api/.env.example para apps/api/.env.');
  }
  return new Pool({ connectionString, max: 10 });
}
