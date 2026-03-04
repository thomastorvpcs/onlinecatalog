#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import pgPkg from "pg";
const { Client } = pgPkg;

const SQLITE_DB_PATH = resolve(process.env.SQLITE_DB_PATH || "backend/db/catalog.sqlite");
const POSTGRES_URL = String(process.env.DATABASE_URL || "").trim();
const PG_SCHEMA = String(process.env.PG_SCHEMA || "public").trim() || "public";

if (!POSTGRES_URL) {
  console.error("Missing DATABASE_URL. Example: postgres://user:pass@host:5432/db");
  process.exit(1);
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, "\"\"")}"`;
}

function mapSqliteTypeToPostgres(typeRaw) {
  const type = String(typeRaw || "").toUpperCase();
  if (type.includes("INT")) return "BIGINT";
  if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) return "DOUBLE PRECISION";
  if (type.includes("BLOB")) return "BYTEA";
  if (type.includes("BOOL")) return "BOOLEAN";
  if (type.includes("DATE") || type.includes("TIME")) return "TIMESTAMPTZ";
  return "TEXT";
}

function buildCreateTableSql(tableName, cols) {
  const lines = [];
  const pkCols = cols.filter((c) => Number(c.pk || 0) > 0).sort((a, b) => Number(a.pk || 0) - Number(b.pk || 0));
  for (const col of cols) {
    const name = quoteIdent(col.name);
    let type = mapSqliteTypeToPostgres(col.type);
    const notNull = Number(col.notnull || 0) === 1 ? " NOT NULL" : "";
    let defaultExpr = "";
    const defaultValue = col.dflt_value;
    if (defaultValue !== null && defaultValue !== undefined) {
      const normalized = String(defaultValue).trim();
      if (/^CURRENT_TIMESTAMP$/i.test(normalized)) {
        defaultExpr = " DEFAULT CURRENT_TIMESTAMP";
      } else {
        defaultExpr = ` DEFAULT ${normalized}`;
      }
    }
    if (pkCols.length === 1 && pkCols[0].name === col.name) {
      if (type === "BIGINT") {
        type = "BIGSERIAL";
        defaultExpr = "";
      }
      lines.push(`${name} ${type}${notNull} PRIMARY KEY`);
    } else {
      lines.push(`${name} ${type}${notNull}${defaultExpr}`);
    }
  }
  if (pkCols.length > 1) {
    const pk = pkCols.map((c) => quoteIdent(c.name)).join(", ");
    lines.push(`PRIMARY KEY (${pk})`);
  }
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(PG_SCHEMA)}.${quoteIdent(tableName)} (\n  ${lines.join(",\n  ")}\n);`;
}

async function main() {
  const sqlite = new DatabaseSync(SQLITE_DB_PATH);
  const pg = new Client({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  try {
    await pg.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(PG_SCHEMA)}`);
    const tableRows = sqlite.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    const tables = tableRows.map((r) => String(r.name || "").trim()).filter(Boolean);
    if (!tables.length) {
      console.log("No SQLite tables found.");
      return;
    }

    console.log(`Migrating ${tables.length} table(s) from ${SQLITE_DB_PATH} to PostgreSQL schema ${PG_SCHEMA}...`);

    // Create/clear target tables.
    for (const table of tables) {
      const cols = sqlite.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all();
      if (!cols.length) continue;
      const createSql = buildCreateTableSql(table, cols);
      await pg.query(createSql);
      await pg.query(`TRUNCATE TABLE ${quoteIdent(PG_SCHEMA)}.${quoteIdent(table)} RESTART IDENTITY CASCADE`);
    }

    // Copy data rows.
    for (const table of tables) {
      const rows = sqlite.prepare(`SELECT * FROM ${quoteIdent(table)}`).all();
      if (!rows.length) {
        console.log(`- ${table}: 0 row(s)`);
        continue;
      }
      const colNames = Object.keys(rows[0]);
      const colList = colNames.map(quoteIdent).join(", ");
      const valueMarks = colNames.map((_, idx) => `$${idx + 1}`).join(", ");
      const sql = `INSERT INTO ${quoteIdent(PG_SCHEMA)}.${quoteIdent(table)} (${colList}) VALUES (${valueMarks})`;
      await pg.query("BEGIN");
      try {
        for (const row of rows) {
          const values = colNames.map((name) => row[name]);
          await pg.query(sql, values);
        }
        await pg.query("COMMIT");
      } catch (error) {
        await pg.query("ROLLBACK");
        throw error;
      }
      console.log(`- ${table}: ${rows.length} row(s)`);
    }

    console.log("Migration complete.");
  } finally {
    await pg.end();
    sqlite.close();
  }
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
