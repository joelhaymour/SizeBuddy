import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pg from 'pg';

const isPostgres = !!process.env.DATABASE_URL;
let postgresPool = null;
let postgresDb = null;

function getPostgresPool() {
  if (!postgresPool) {
    const { Pool } = pg;
    postgresPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 10000),
    });

    // Prevent unexpected idle client errors from crashing the process.
    postgresPool.on('error', (error) => {
      console.error('Unexpected Postgres pool error:', error);
    });
  }

  return postgresPool;
}

export async function getDb() {
  if (!isPostgres) {
    return open({ filename: `${process.cwd()}/database.sqlite`, driver: sqlite3.Database });
  }

  if (!postgresDb) {
    const pool = getPostgresPool();

    // Provide a minimal wrapper with get/all/run signatures
    const toParams = (query) => {
      let i = 0;
      return query.replace(/\?/g, () => `$${++i}`);
    };

    postgresDb = {
      async get(query, params = []) {
        const { rows } = await pool.query(toParams(query), params);
        return rows[0];
      },
      async all(query, params = []) {
        const { rows } = await pool.query(toParams(query), params);
        return rows;
      },
      async run(query, params = []) {
        const result = await pool.query(toParams(query), params);
        return { changes: result.rowCount };
      },
      async prepare(query) {
        const client = await pool.connect();
        const text = toParams(query);
        return {
          async run(...params) {
            await client.query(text, params);
          },
          async finalize() {
            client.release();
          }
        };
      }
    };
  }

  return postgresDb;
}
