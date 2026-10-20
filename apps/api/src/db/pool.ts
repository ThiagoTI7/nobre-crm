import 'dotenv/config';
import { Pool, types } from 'pg';

// DATE (1082) como string "YYYY-MM-DD": sem conversão de fuso.
types.setTypeParser(1082, (v) => v);
// NUMERIC (1700) como number (valores em R$ cabem com folga em double).
types.setTypeParser(1700, (v) => Number(v));
// BIGINT (20) como number (ids de histórico).
types.setTypeParser(20, (v) => Number(v));

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL não definida. Copie apps/api/.env.example para apps/api/.env.');
  }
  return new Pool({ connectionString, max: 10 });
}
