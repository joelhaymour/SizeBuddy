import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pg from 'pg';

const isPostgres = !!process.env.DATABASE_URL;

export async function getDb() {
  if (!isPostgres) {
    return open({ filename: `${process.cwd()}/database.sqlite`, driver: sqlite3.Database });
  }
  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
  // Provide a minimal wrapper with get/all/run signatures
  return {
    async get(query, params = []) {
      const { rows } = await pool.query(query.replace(/\?/g, (m, i) => `$${i + 1}`), params);
      return rows[0];
    },
    async all(query, params = []) {
      const { rows } = await pool.query(query.replace(/\?/g, (m, i) => `$${i + 1}`), params);
      return rows;
    },
    async run(query, params = []) {
      await pool.query(query.replace(/\?/g, (m, i) => `$${i + 1}`), params);
      return { changes: 1 };
    },
    async prepare(query) {
      const client = await pool.connect();
      return {
        async run(...params) {
          await client.query(query.replace(/\?/g, (m, i) => `$${i + 1}`), params);
        },
        async finalize() {
          client.release();
        }
      };
    }
  };
}
