# Device Database (SQLite)

This folder contains the first backend database setup for devices.

## Files

- `schema.sql`: Tables, indexes, and `v_device_catalog` view.
- `seed.sql`: Seed data matching the current frontend catalog.

## Data model

Core tables:

- `categories`
- `manufacturers`
- `locations`
- `devices`
- `device_inventory`
- `users`

`devices.model_family` is stored separately so you can filter by model name without capacity (for example `iPhone 15 Pro` instead of `iPhone 15 Pro 128GB`).

`users` supports app authentication with roles (`admin`, `buyer`).

## Create DB locally

If you have SQLite CLI installed:

```bash
sqlite3 backend/db/catalog.sqlite ".read backend/db/schema.sql"
sqlite3 backend/db/catalog.sqlite ".read backend/db/seed.sql"
```

Quick verification query:

```sql
SELECT id, manufacturer, model_name, total_available
FROM v_device_catalog
ORDER BY category, manufacturer, model_name;
```
