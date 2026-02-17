# PCS Online Catalog MVP (Local Demo)

This project is a working local MVP demo of the "PCS Online Catalog & Request Management Platform" based on your uploaded PDF.

## Implemented Scope
- Authenticated access (demo login gate)
- Dashboard with company-level request visibility
- Product catalog home with category tiles and highlighted products
- Category page with filter groups and real-time filtering
- Filter logic: AND across groups, OR within each group
- Saved filters (user-specific; persisted)
- Product detail modal with availability by location
- Add to request from card/detail with unavailable-item handling
- Request builder with:
  - editable quantity
  - buyer-entered offer price (required numeric)
  - line total and grand total calculations
  - remove line item
  - submit validation and no-partial-submission behavior
- Requests page with:
  - status tabs (New, Received, Estimate Created, Completed)
  - request-number search
  - read-only request detail view
- Company-level request visibility model in storage keys

## Technical Notes
- Frontend: React + Vite
- Backend: Node.js API (`backend/server.mjs`) with SQLite database (`backend/db`)
- Catalog data source:
  - Frontend fetches `/api/devices` from backend
  - If backend is unavailable, frontend falls back to local demo seed data
- Authentication:
  - Create user: `POST /api/auth/register`
  - Sign in: `POST /api/auth/login`
  - Current user: `GET /api/auth/me`
  - Admin users list: `GET /api/users`
  - Seeded admin account:
    - Email: `thomas.torvund@pcsww.com`
    - Password: `AdminPassword123!`
- GitHub Pages mode:
  - On `*.github.io`, the app runs in a built-in demo mode (no backend server required).
  - Demo admin account is the same:
    - Email: `thomas.torvund@pcsww.com`
    - Password: `AdminPassword123!`
  - Demo reset verification code: `123456`
- Current storage model for request flow:
  - `sessionStorage` for in-session request builder state
  - `localStorage` for user session, saved filters, and submitted requests
- In production, request/auth persistence should move fully server-side.

## Run
1. Start API:
   - `npm run api`
2. Start frontend:
   - `npm run dev`
3. Open the Vite URL shown in terminal.

## Deploy (GitHub Pages)
Push to `main`. The workflow `.github/workflows/deploy-pages.yml` builds and deploys `dist` automatically.

## Deploy (Render)
This repo includes `render.yaml` for a single Node web service that serves:
- API endpoints at `/api/*`
- Built frontend from `dist`

Steps:
1. In Render, create **New + > Blueprint** and select this repo.
2. Confirm service from `render.yaml`.
3. Deploy.

Render will run:
- Build: `npm ci && npm run build`
- Start: `npm run start`

## Inventory API
See docs/inventory-api.md for inventory update endpoint design and examples.

## Swagger / OpenAPI
- OpenAPI file: `docs/openapi.yaml`
- Raw spec endpoint: `/api/openapi.yaml`
- Swagger UI endpoint: `/api/docs`


