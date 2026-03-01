PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS manufacturers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  external_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  manufacturer_id INTEGER NOT NULL REFERENCES manufacturers(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  model_name TEXT NOT NULL,
  model_family TEXT NOT NULL,
  storage_capacity TEXT NOT NULL,
  grade TEXT NOT NULL,
  base_price REAL NOT NULL CHECK (base_price >= 0),
  image_url TEXT,
  carrier TEXT,
  screen_size TEXT,
  modular TEXT,
  color TEXT,
  kit_type TEXT,
  product_notes TEXT,
  source_external_id TEXT UNIQUE,
  source_sku TEXT,
  currency_code TEXT,
  country_code TEXT,
  effective_date TEXT,
  weekly_special INTEGER NOT NULL DEFAULT 0 CHECK (weekly_special IN (0, 1)),
  default_location_id INTEGER REFERENCES locations(id),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_inventory (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (device_id, location_id)
);

CREATE TABLE IF NOT EXISTS device_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS boomi_inventory_raw (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_external_id TEXT,
  sku TEXT,
  manufacturer TEXT,
  model TEXT,
  color TEXT,
  grade TEXT,
  storage_capacity TEXT,
  price REAL,
  quantity_on_hand INTEGER,
  carrier TEXT,
  currency_code TEXT,
  country TEXT,
  effective_date TEXT,
  source_location_id TEXT,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'buyer')),
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quote_requests (
  id TEXT PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id),
  created_by_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',
  total_amount REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'USD',
  netsuite_estimate_id TEXT,
  netsuite_estimate_number TEXT,
  netsuite_status TEXT,
  netsuite_last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quote_request_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  device_id TEXT,
  model TEXT NOT NULL,
  grade TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  offer_price REAL NOT NULL CHECK (offer_price >= 0),
  note TEXT
);

CREATE TABLE IF NOT EXISTS quote_request_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_devices_category ON devices(category_id);
CREATE INDEX IF NOT EXISTS idx_devices_manufacturer ON devices(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_devices_model_family ON devices(model_family);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON device_inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_device_images_device ON device_images(device_id);
CREATE INDEX IF NOT EXISTS idx_boomi_raw_source_external_id ON boomi_inventory_raw(source_external_id);
CREATE INDEX IF NOT EXISTS idx_quote_requests_company ON quote_requests(company);
CREATE INDEX IF NOT EXISTS idx_quote_requests_created_at ON quote_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_quote_request_lines_request ON quote_request_lines(request_id);
CREATE INDEX IF NOT EXISTS idx_quote_request_events_request ON quote_request_events(request_id);

CREATE VIEW IF NOT EXISTS v_device_catalog AS
SELECT
  d.id,
  d.model_name,
  d.model_family,
  d.storage_capacity,
  d.grade,
  d.base_price,
  d.image_url,
  c.name AS category,
  m.name AS manufacturer,
  dl.name AS default_region,
  COALESCE(SUM(di.quantity), 0) AS total_available
FROM devices d
JOIN categories c ON c.id = d.category_id
JOIN manufacturers m ON m.id = d.manufacturer_id
LEFT JOIN locations dl ON dl.id = d.default_location_id
LEFT JOIN device_inventory di ON di.device_id = d.id
GROUP BY d.id, d.model_name, d.model_family, d.storage_capacity, d.grade, d.base_price, d.image_url, c.name, m.name, dl.name;
