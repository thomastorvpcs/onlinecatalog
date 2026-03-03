# Deployment Flow (Render Staging + Production)

This project uses two Render services:
- `onlinecatalog-staging` (staging)
- `onlinecatalog` (production)

Use separate branches, separate env vars, and separate persistent disks.

## Branch Strategy

- `develop` -> staging deploys
- `main` -> production deploys

Recommended workflow:
1. Create feature branch from `develop`.
2. Open PR into `develop`.
3. Merge after review/tests.
4. Validate in staging.
5. Open PR `develop -> main`.
6. Merge to promote same code to production.

## Render Service Setup

For each service (staging and production):
1. Use same build/start commands:
   - Build: `npm ci && npm run build`
   - Start: `npm run start`
2. Configure a dedicated persistent disk:
   - Example mount: `/var/data`
3. Set `DB_PATH` to service-local disk:
   - `DB_PATH=/var/data/catalog.sqlite`
4. Keep `AUTO_SEED_REAL_ON_STARTUP=false` for stable inventory.
5. Set service-specific env vars (never share secrets between environments).

## Environment Variable Policy

Staging and production must each have their own values for:
- `OPENAI_API_KEY`
- `AI_COPILOT_REAL_MODEL_ENABLED`
- `AI_COPILOT_MODEL`
- Inventory integration credentials (`INVENTORY_*` / `BOOMI_*`)
- Any future external integration keys

Optional for debugging only:
- `AI_COPILOT_DEBUG_ERRORS=true` (staging preferred, production usually `false`)

## Pre-Deploy Checklist (Staging)

1. Auth works (login/refresh/logout).
2. Catalog and filters load.
3. AI copilot:
   - filter suggestions
   - add-to-request actions
   - order-history questions
4. Request flow:
   - add/edit/remove lines
   - submit request
   - status updates
5. Database writes persist after manual restart/redeploy.

## Promotion Checklist (Production)

1. Confirm `develop` was validated in staging.
2. Merge `develop -> main` with no extra commits.
3. Trigger/confirm Render production deploy.
4. Smoke test in production:
   - health endpoint `/api/health`
   - login
   - load devices
   - submit one test request (if allowed)

## Rollback Plan

If production deploy fails:
1. Revert the `main` merge commit (or deploy previous commit).
2. Redeploy production.
3. Re-run smoke tests.

## Data Safety Notes

- Production and staging must not share the same disk or database file.
- Startup seeding is designed to avoid inventory resets on each restart.
- Before schema-impacting changes, take a DB backup snapshot from `/var/data/catalog.sqlite`.

