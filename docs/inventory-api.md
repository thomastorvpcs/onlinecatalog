# Inventory Update API Documentation

This document defines the API we should expose to update device inventory in the SQLite table `device_inventory`.

## Base URL
- Local: `http://localhost:8787`
- Production: your deployed backend URL

## Auth
All endpoints below require a valid bearer token from login.

Header:
```http
Authorization: Bearer <token>
```

Role requirement:
- `admin` only (recommended)

## NetSuite/Boomi Sync
Use this endpoint to fetch inventory from Boomi and map it into local tables (`devices`, `device_inventory`, `locations`).

- Method: `POST`
- Path: `/api/integrations/boomi/inventory/sync`
- Auth: `admin` bearer token required

### Response
```json
{
  "ok": true,
  "fetched": 1250,
  "processed": 1247,
  "skipped": 3
}
```

### Environment variables used by backend
- `BOOMI_INVENTORY_URL`
- `BOOMI_CUSTOMER_ID`
- `BOOMI_BASIC_USERNAME`
- `BOOMI_BASIC_PASSWORD`
- `BOOMI_EXTRA_AUTH` (optional; sent as `X-Authorization`)
- `BOOMI_TLS_INSECURE` (`true`/`false`, default `true` in this test build for self-signed cert chains)

## Admin Catalog Tools

### Clear catalog data
- Method: `POST`
- Path: `/api/admin/catalog/clear`
- Auth: admin

Response example:
```json
{
  "ok": true,
  "removedDevices": 5200,
  "removedRawRows": 190
}
```

### Seed test catalog devices
- Method: `POST`
- Path: `/api/admin/catalog/seed-test`
- Auth: admin

Request body (optional):
```json
{
  "countPerCategory": 500
}
```

Response example:
```json
{
  "ok": true,
  "categoriesSeeded": 5,
  "countPerCategory": 500
}
```

---

## 1) Get Inventory for a Device
Returns per-location stock for one device.

- Method: `GET`
- Path: `/api/inventory/:deviceId`

### Example request
```http
GET /api/inventory/gen-smartphones-0001 HTTP/1.1
Authorization: Bearer <token>
```

### Example response
```json
{
  "deviceId": "gen-smartphones-0001",
  "model": "iPhone 15 128GB - Black",
  "locations": [
    { "locationId": 1, "location": "Miami", "quantity": 120 },
    { "locationId": 2, "location": "Dubai", "quantity": 80 },
    { "locationId": 3, "location": "Hong Kong", "quantity": 40 },
    { "locationId": 4, "location": "Japan", "quantity": 60 }
  ],
  "total": 300
}
```

---

## 2) Set Quantity (Absolute Update)
Sets an exact quantity for one device at one location.

- Method: `PUT`
- Path: `/api/inventory/:deviceId/:locationId`

### Request body
```json
{
  "quantity": 125,
  "reason": "Cycle count correction"
}
```

### Validation
- `quantity`: integer, `>= 0`
- `deviceId` must exist in `devices`
- `locationId` must exist in `locations`

### Behavior
- If row exists in `device_inventory`, update it.
- If row does not exist, insert it.

### Example response
```json
{
  "ok": true,
  "deviceId": "gen-smartphones-0001",
  "locationId": 1,
  "quantity": 125
}
```

---

## 3) Adjust Quantity (Delta Update)
Adds/subtracts stock for one device at one location.

- Method: `POST`
- Path: `/api/inventory/:deviceId/:locationId/adjust`

### Request body
```json
{
  "delta": -3,
  "reason": "Order shipped #REQ-1043"
}
```

### Validation
- `delta`: integer, non-zero
- Final quantity cannot be negative

### Example response
```json
{
  "ok": true,
  "deviceId": "gen-smartphones-0001",
  "locationId": 1,
  "previousQuantity": 125,
  "newQuantity": 122,
  "delta": -3
}
```

---

## 4) Bulk Inventory Update
Updates multiple rows in one request (recommended for imports).

- Method: `POST`
- Path: `/api/inventory/bulk`

### Request body
```json
{
  "mode": "set",
  "updates": [
    { "deviceId": "gen-smartphones-0001", "locationId": 1, "quantity": 130 },
    { "deviceId": "gen-smartphones-0001", "locationId": 2, "quantity": 84 },
    { "deviceId": "gen-tablets-0007", "locationId": 1, "quantity": 25 }
  ],
  "reason": "Daily ERP sync"
}
```

`mode` values:
- `set` = absolute quantity
- `adjust` = use `delta` in each row

### Transaction behavior
- Process inside one DB transaction.
- If any row fails validation, rollback all updates and return errors.

### Example response
```json
{
  "ok": true,
  "processed": 3,
  "failed": 0
}
```

---

## Error format
```json
{
  "error": "Validation failed",
  "details": [
    { "index": 2, "field": "quantity", "message": "Must be >= 0" }
  ]
}
```

Common status codes:
- `200` success
- `400` validation error
- `401` unauthorized
- `403` forbidden (not admin)
- `404` device/location not found
- `409` inventory conflict
- `500` server error

---

## Suggested audit logging (recommended)
Add table `inventory_events`:
- `id`
- `device_id`
- `location_id`
- `change_type` (`set`/`adjust`)
- `previous_quantity`
- `new_quantity`
- `delta`
- `reason`
- `changed_by_user_id`
- `created_at`

This gives a trace for who changed stock and why.

---

## Mapping to current DB schema
Current table:
- `device_inventory(device_id, location_id, quantity)`

Upsert SQL pattern:
```sql
INSERT INTO device_inventory (device_id, location_id, quantity)
VALUES (?, ?, ?)
ON CONFLICT(device_id, location_id)
DO UPDATE SET quantity = excluded.quantity;
```

