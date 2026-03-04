# PostgreSQL 16 Migration Runbook (Rollback-Safe)

This runbook moves data from SQLite to PostgreSQL with a safe rollback path.

## 1. Principles
- Keep production runtime on SQLite until migration parity is confirmed.
- Perform migration in staging first.
- Use environment toggles for instant rollback.

## 2. Pre-Checks
1. Ensure SQLite DB file is persisted and backed up.
2. Provision Render PostgreSQL 16.
3. Set `DATABASE_URL` in Render (staging first).
4. Keep:
   - `DB_ENGINE=sqlite`
   - `POSTGRES_RUNTIME_EXPERIMENTAL=false`

## 3. Migrate Data
From project root:

```bash
npm run db:pg:migrate
```

Optional env vars:
- `SQLITE_DB_PATH` (defaults to `backend/db/catalog.sqlite`)
- `PG_SCHEMA` (defaults to `public`)

Example:

```bash
DATABASE_URL="postgres://..." SQLITE_DB_PATH="/var/data/catalog.sqlite" npm run db:pg:migrate
```

## 4. Verify Parity
Run:

```bash
npm run db:pg:verify
```

Success means row counts match table-by-table between SQLite and Postgres.

## 5. Staging Validation
1. Deploy app to staging with:
   - `DB_ENGINE=sqlite`
   - `POSTGRES_RUNTIME_EXPERIMENTAL=false`
2. Validate normal app flows.
3. Run migration and verification scripts against staging DBs.
4. Validate data sanity in Postgres manually (spot-check key tables):
   - `users`
   - `devices`
   - `device_inventory`
   - `quote_requests`
   - `quote_request_lines`

## 6. Production Cutover (Future Step)
Current build includes migration tooling and runtime guardrails, but not a full Postgres runtime query layer.

When full runtime support is implemented, cutover should be:
1. Snapshot/backup SQLite.
2. Run migration.
3. Run verification.
4. Set production:
   - `DB_ENGINE=postgres`
   - `POSTGRES_RUNTIME_EXPERIMENTAL=true`
5. Restart service and run smoke tests.

## 7. Rollback
If any issue occurs, revert immediately:
1. Set:
   - `DB_ENGINE=sqlite`
   - `POSTGRES_RUNTIME_EXPERIMENTAL=false`
2. Restart service.
3. Confirm `/api/health`, `/api/auth/me`, `/api/devices`, `/api/requests`.

Because SQLite remains intact, rollback is configuration-only and immediate.

## 8. Notes
- Scripts intentionally truncate/reload target Postgres tables each run.
- Use staging first; do not run on production without backups.
- If table-level mismatches occur, re-run migration after stopping writes for a clean snapshot.

