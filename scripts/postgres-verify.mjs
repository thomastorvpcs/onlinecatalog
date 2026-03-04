#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { Client } from "pg";

const SQLITE_DB_PATH = resolve(process.env.SQLITE_DB_PATH || "backend/db/catalog.sqlite");
const POSTGRES_URL = String(process.env.DATABASE_URL || "").trim();
const PG_SCHEMA = String(process.env.PG_SCHEMA || "public").trim() || "public";

if (!POSTGRES_URL) {
  console.error("Missing DATABASE_URL.");
  process.exit(1);
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, "\"\"")}"`;
}

async function main() {
  const sqlite = new DatabaseSync(SQLITE_DB_PATH);
  const pg = new Client({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  try {
    const tableRows = sqlite.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    const tables = tableRows.map((r) => String(r.name || "").trim()).filter(Boolean);
    if (!tables.length) {
      console.log("No tables found.");
      return;
    }
    let mismatch = 0;
    for (const table of tables) {
      const sqliteCount = Number(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`).get().count || 0);
      const pgCountRes = await pg.query(`SELECT COUNT(*)::bigint AS count FROM ${quoteIdent(PG_SCHEMA)}.${quoteIdent(table)}`);
      const pgCount = Number(pgCountRes.rows?.[0]?.count || 0);
      const ok = sqliteCount === pgCount;
      if (!ok) mismatch += 1;
      console.log(`${ok ? "OK" : "MISMATCH"} ${table}: sqlite=${sqliteCount} postgres=${pgCount}`);
    }
    if (mismatch > 0) {
      console.error(`Verification failed: ${mismatch} table(s) mismatched.`);
      process.exit(2);
    }
    console.log("Verification succeeded.");
  } finally {
    await pg.end();
    sqlite.close();
  }
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});

