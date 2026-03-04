# Product Requirements Document (PRD)
## PCS Online Catalog + AI Copilot

- **Version:** 1.0
- **Date:** March 4, 2026
- **Owner:** Product / Engineering
- **Status:** Draft for implementation alignment

---

## 1. Product Overview

PCS Online Catalog is a web application for internal/admin and buyer users to discover inventory, build request estimates, and use an AI Copilot to accelerate sourcing and order workflows.

The product combines:
- Inventory browsing across categories and locations
- Request creation and lifecycle tracking
- Role-based admin tooling
- Auth0-based authentication
- AI Copilot for discovery, recommendations, historical insights, and request line actions

---

## 2. Goals

1. Reduce time to build accurate purchase requests.
2. Improve inventory visibility by location and fulfillment constraints.
3. Provide AI-assisted guidance for filters, specials, and historical orders.
4. Maintain operational control through admin approvals and audit-friendly flows.
5. Ensure deploy-safe persistence of catalog and image data.

---

## 3. Non-Goals

- Full ERP replacement
- Native mobile app
- Public customer-facing commerce checkout
- Real-time streaming inventory from all external systems

---

## 4. Personas

1. **Buyer**
- Finds products, compares availability, builds requests.
- Uses AI Copilot for discovery and historical references.

2. **Admin**
- Manages users and account activation.
- Seeds data, reviews requests, controls statuses.
- Runs integration sync operations.

3. **Operations/Integrator**
- Maintains inventory sync and external integration setup.
- Reviews logs and deployment behavior.

---

## 5. Scope

## In Scope
- Auth0 login/signup + local role mapping
- Pending-approval access gating
- Product catalog browsing and filtering
- Weekly specials support
- Request creation and line management
- AI Copilot in-chat actions
- Admin user operations
- Boomi inventory sync ingestion
- Persistent SQLite deployment behavior (Render)
- Confluence docs sync content updates

## Out of Scope
- Payment processing
- Customer shipment tracking portal
- Multi-tenant custom branding per company

---

## 6. Functional Requirements

## 6.1 Authentication & Access
- Use Auth0 for identity.
- Create local user records on first Auth0 login.
- New Auth0 users must default to `inactive`.
- Inactive users must see a styled “Account Created / Waiting for Approval” page.
- Admin can activate/deactivate users.
- Logout must clear local session and prevent silent auto-login on refresh.
- Login requires explicit interaction each session (no silent re-auth on refresh).

## 6.2 User Management (Admin)
- List users with role and active status.
- Toggle active/admin fields.
- Delete users.
- Deleting a user should:
  - Delete in Auth0 (if linked by `auth0_sub`)
  - Delete locally with dependency-safe cleanup
  - Fail clearly if Auth0 management credentials/scopes are missing

## 6.3 Catalog Browsing
- Display categories, products, pricing, and availability.
- Show location-specific availability by mapped PCS physical location names.
- Hide zero-stock locations in device detail availability table.
- Use image fallback when product image fails.

## 6.4 Request Workflow
- Add products to request with quantity and offer price.
- Select fulfillment location with warnings for shortages.
- Inline request details expansion in requests list.
- Request line product name click opens product detail modal.
- Status lifecycle: New, Received, Estimate Created, Completed.
- Admin can update status from UI.

## 6.5 AI Copilot
- Chatbot UI with timestamps and typing indicator.
- User-scoped chat state persistence.
- Default welcome message behavior per login/session rules.
- Parse user prompts into filters/actions.
- Warn before applying filters with zero results.
- Offer correction suggestions on no-match.
- Weekly specials query/selection support independent of strict category filter.
- Add-to-request actions:
  - Single match: direct add
  - Multi-match: user disambiguation options
- Historical order intelligence:
  - Answer prior order detail/price/average questions
  - Add available items from historical order; skip unavailable with explanation
- Grade Q&A support using grade definition catalog.

## 6.6 Grade Definitions
- Provide grade definitions modal for codes:
  - C2, C4, C5, C6, COB, CPO, CRC, CRD, CRX, D2, D3, D4, MD A, MD B, TBG, TBG FIN, TBG2
- Accessible by clicking grade in:
  - Product cards/pages
  - Product detail modal
  - Request modal
  - Request line details
- Modal behavior:
  - Always top-most over other modals
  - Selected grade highlighted
  - Auto-scroll selected grade into view
  - Persistent visible top-right `X` close button while content scrolls

## 6.7 Integrations
- Boomi sync endpoint with robust payload-shape handling.
- OAuth + subscription key support with configurable headers.
- Legacy auth fallback support where needed.
- Error responses must be explicit and actionable.

## 6.8 Persistence & Startup
- Use Render persistent disk path for SQLite.
- Startup seeding must not overwrite existing persisted inventory.
- Device images and catalog data must remain stable across deploys.
- Include hard guard preventing accidental reseed when data exists.

---

## 7. Non-Functional Requirements

- **Security:** Role checks server-side; secrets via env vars only.
- **Reliability:** Request flows and syncs fail with clear diagnostics.
- **Performance:** Catalog interactions should feel responsive for common dataset sizes.
- **Usability:** Key actions accessible in 1-3 clicks.
- **Maintainability:** Clear separation of frontend UI logic and backend business rules.
- **Observability:** Useful logs for startup path, auth exchange, integration failures.

---

## 8. Data Requirements

Core entities:
- `users`, `refresh_tokens`
- `devices`, `device_inventory`, `device_images`
- `locations` (+ `external_id`)
- `quote_requests`, `quote_request_lines`, `quote_request_events`
- `app_settings`
- integration raw tables (e.g. boomi raw)

Special mapping:
- Internal location ID -> PCS Physical Location via `Locations936.csv`.

---

## 9. API Requirements (High Level)

- Auth:
  - `/api/auth/login`
  - `/api/auth/auth0-exchange`
  - `/api/auth/logout`
  - `/api/auth/me`
  - `/api/auth/refresh`
- Users:
  - `/api/users` (GET/POST)
  - `/api/users/:id` (PATCH/DELETE)
- Catalog:
  - `/api/devices`
  - `/api/categories`
- Requests:
  - `/api/requests`
- AI:
  - `/api/ai/copilot`
  - `/api/ai/validate-request`
- Integrations:
  - `/api/integrations/boomi/inventory/sync`

---

## 10. Success Metrics

1. % of requests created with AI assistance
2. Median time from login to first valid request submission
3. Request submission failure rate (validation/inventory mismatch)
4. AI “no results” recovery rate (user succeeds after suggestions)
5. User management SLA (activation/deletion completion)
6. Inventory persistence incident rate after deploy (target: 0)

---

## 11. Risks & Mitigations

1. **Auth0 management misconfiguration**
- Mitigation: explicit setup docs + clear 5xx messaging + preflight checks.

2. **Inventory overwrite on deploy**
- Mitigation: startup hard guard + persistent DB path validation.

3. **AI incorrect recommendations**
- Mitigation: deterministic guardrails, inventory validation, transparent messages.

4. **Unclear grade semantics**
- Mitigation: placeholders clearly labeled; replace with internal SOP definitions.

---

## 12. Dependencies

- Auth0 tenant/app configuration
- Auth0 Management API M2M app + scopes
- Render environment variables and persistent disk
- Boomi/API credentials for external sync
- Confluence sync workflow/secrets

---

## 13. Rollout Plan

1. Deploy backend auth/user deletion and activation rules.
2. Deploy login UX + pending approval page.
3. Deploy grade modal and click-entry points.
4. Deploy AI copilot improvements and weekly specials logic.
5. Validate data persistence + startup behavior in production.
6. Publish documentation updates to Confluence.

---

## 14. Open Questions

1. Should local delete proceed if Auth0 delete fails (configurable fallback)?
2. What are final authoritative definitions for placeholder grade codes?
3. Should pending-approval users receive automatic email notifications on activation?
4. Should AI actions be logged as audit events per request line mutation?

---

## 15. Acceptance Criteria (Release)

- New Auth0 users are inactive by default.
- Inactive login displays styled approval page (not red error).
- Logout + refresh does not auto-login silently.
- Grade modal is accessible from all required grade touchpoints.
- Grade modal is top-most, highlights selected grade, and keeps close button visible.
- User delete works end-to-end in local DB + Auth0 when configured.
- Catalog and images persist across deploys without reseed resets.
- AI copilot can answer grade and historical order questions and perform add/disambiguation flows.
