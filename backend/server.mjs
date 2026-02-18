import { createServer } from "node:http";
import https from "node:https";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, "db");
const dbPath = join(dbDir, "catalog.sqlite");
const schemaPath = join(dbDir, "schema.sql");
const seedPath = join(dbDir, "seed.sql");
const distDir = join(__dirname, "..", "dist");
const docsDir = join(__dirname, "..", "docs");
const openApiPath = join(docsDir, "openapi.yaml");
const port = Number(process.env.PORT || process.env.API_PORT || 8787);

const ADMIN_EMAIL = "thomas.torvund@pcsww.com";
const ADMIN_PASSWORD = "AdminPassword123!";
const DEMO_RESET_CODE = "123456";
const EXTRA_DEVICES_PER_CATEGORY = 1000;
const BOOMI_INVENTORY_URL = process.env.BOOMI_INVENTORY_URL || "https://c01-usa-east-et.integrate-test.boomi.com/ws/rest/masterdealer/inventory/";
const BOOMI_CUSTOMER_ID = process.env.BOOMI_CUSTOMER_ID || "";
const BOOMI_BASIC_USERNAME = process.env.BOOMI_BASIC_USERNAME || "";
const BOOMI_BASIC_PASSWORD = process.env.BOOMI_BASIC_PASSWORD || "";
const BOOMI_EXTRA_AUTH = process.env.BOOMI_EXTRA_AUTH || "";
const BOOMI_TLS_INSECURE = String(process.env.BOOMI_TLS_INSECURE || "false").toLowerCase() === "true";
const sessions = new Map();

const db = new DatabaseSync(dbPath);

function initDb() {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(readFileSync(schemaPath, "utf8"));
  ensureUsersColumns();
  ensureLocationsSchema();
  ensureDeviceSchema();
  const countStmt = db.prepare("SELECT COUNT(*) AS count FROM categories");
  const count = Number(countStmt.get().count || 0);
  if (count === 0) {
    db.exec(readFileSync(seedPath, "utf8"));
  }
  ensureLargeCatalog();
  ensureAdminUser();
}

function ensureUsersColumns() {
  const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!cols.includes("reset_code")) {
    db.exec("ALTER TABLE users ADD COLUMN reset_code TEXT");
  }
  if (!cols.includes("reset_code_expires_at")) {
    db.exec("ALTER TABLE users ADD COLUMN reset_code_expires_at TEXT");
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isPasswordValid(password) {
  return /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password || "");
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const calculated = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(calculated, "hex"));
}

function ensureAdminUser() {
  const email = normalizeEmail(ADMIN_EMAIL);
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing?.id) return;
  const passwordHash = hashPassword(ADMIN_PASSWORD);
  db.prepare("INSERT INTO users (email, company, role, password_hash) VALUES (?, ?, ?, ?)")
    .run(email, "PCSWW", "admin", passwordHash);
}

function splitCsv(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(payload));
}

function ensureLocationsSchema() {
  const cols = db.prepare("PRAGMA table_info(locations)").all().map((c) => c.name);
  if (!cols.includes("external_id")) {
    db.exec("ALTER TABLE locations ADD COLUMN external_id TEXT");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_external_id ON locations(external_id)");
}

function ensureDeviceSchema() {
  const cols = db.prepare("PRAGMA table_info(devices)").all().map((c) => c.name);
  if (!cols.includes("carrier")) db.exec("ALTER TABLE devices ADD COLUMN carrier TEXT");
  if (!cols.includes("screen_size")) db.exec("ALTER TABLE devices ADD COLUMN screen_size TEXT");
  if (!cols.includes("modular")) db.exec("ALTER TABLE devices ADD COLUMN modular TEXT");
  if (!cols.includes("color")) db.exec("ALTER TABLE devices ADD COLUMN color TEXT");
  if (!cols.includes("kit_type")) db.exec("ALTER TABLE devices ADD COLUMN kit_type TEXT");
  if (!cols.includes("product_notes")) db.exec("ALTER TABLE devices ADD COLUMN product_notes TEXT");
  if (!cols.includes("source_external_id")) db.exec("ALTER TABLE devices ADD COLUMN source_external_id TEXT");
  if (!cols.includes("source_sku")) db.exec("ALTER TABLE devices ADD COLUMN source_sku TEXT");
  if (!cols.includes("currency_code")) db.exec("ALTER TABLE devices ADD COLUMN currency_code TEXT");
  if (!cols.includes("country_code")) db.exec("ALTER TABLE devices ADD COLUMN country_code TEXT");
  if (!cols.includes("effective_date")) db.exec("ALTER TABLE devices ADD COLUMN effective_date TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`
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
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      change_type TEXT NOT NULL CHECK (change_type IN ('set', 'adjust')),
      previous_quantity INTEGER NOT NULL CHECK (previous_quantity >= 0),
      new_quantity INTEGER NOT NULL CHECK (new_quantity >= 0),
      delta INTEGER NOT NULL,
      reason TEXT,
      changed_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_device_images_device ON device_images(device_id)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_source_external_id ON devices(source_external_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_boomi_raw_source_external_id ON boomi_inventory_raw(source_external_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_events_device ON inventory_events(device_id)");
}

function ensureLargeCatalog() {
  const categories = db.prepare("SELECT id, name FROM categories").all();
  const categoryByName = new Map(categories.map((c) => [c.name, c.id]));
  const locations = db.prepare("SELECT id FROM locations ORDER BY id").all().map((l) => l.id);
  const config = [
    {
      name: "Smartphones",
      slug: "smartphones",
      models: [
        { manufacturerId: 1, family: "iPhone 15" },
        { manufacturerId: 1, family: "iPhone 15 Pro" },
        { manufacturerId: 1, family: "iPhone 15 Pro Max" },
        { manufacturerId: 2, family: "Galaxy S24" },
        { manufacturerId: 2, family: "Galaxy Z Flip5" },
        { manufacturerId: 3, family: "Pixel 8" },
        { manufacturerId: 3, family: "Pixel 8 Pro" },
        { manufacturerId: 4, family: "Motorola Edge 50" }
      ],
      storages: ["128GB", "256GB", "512GB", "1TB"],
      colors: ["Black", "Blue", "Silver", "Gray", "White", "Purple"],
      basePrice: 420,
      grade: "A"
    },
    {
      name: "Tablets",
      slug: "tablets",
      models: [
        { manufacturerId: 1, family: "iPad Pro 11" },
        { manufacturerId: 1, family: "iPad Air 11" },
        { manufacturerId: 2, family: "Galaxy Tab S9" },
        { manufacturerId: 2, family: "Galaxy Tab A9+" },
        { manufacturerId: 3, family: "Pixel Tablet" },
        { manufacturerId: 4, family: "Lenovo Tab P12" }
      ],
      storages: ["64GB", "128GB", "256GB", "512GB"],
      colors: ["Gray", "Blue", "Silver", "Starlight"],
      basePrice: 260,
      grade: "A"
    },
    {
      name: "Laptops",
      slug: "laptops",
      models: [
        { manufacturerId: 1, family: "MacBook Air 13" },
        { manufacturerId: 1, family: "MacBook Pro 14" },
        { manufacturerId: 2, family: "Galaxy Book4 Pro" },
        { manufacturerId: 4, family: "ThinkPad X1 Carbon" },
        { manufacturerId: 4, family: "Yoga Slim 9i" },
        { manufacturerId: 3, family: "Chromebook Plus 14" }
      ],
      storages: ["256GB", "512GB", "1TB", "2TB"],
      colors: ["Black", "Gray", "Silver", "Blue"],
      basePrice: 740,
      grade: "A"
    },
    {
      name: "Wearables",
      slug: "wearables",
      models: [
        { manufacturerId: 1, family: "Apple Watch Series 9" },
        { manufacturerId: 1, family: "Watch Ultra 2" },
        { manufacturerId: 2, family: "Galaxy Watch 6" },
        { manufacturerId: 3, family: "Pixel Watch 2" },
        { manufacturerId: 4, family: "Fit Pro Watch" }
      ],
      storages: ["32GB", "64GB", "128GB"],
      colors: ["Black", "Silver", "Blue", "Rose Gold"],
      basePrice: 180,
      grade: "A"
    },
    {
      name: "Accessories",
      slug: "accessories",
      models: [
        { manufacturerId: 1, family: "AirPods Pro" },
        { manufacturerId: 2, family: "Galaxy Buds2 Pro" },
        { manufacturerId: 4, family: "65W USB-C Charger" },
        { manufacturerId: 4, family: "10000mAh Power Bank" },
        { manufacturerId: 3, family: "Wireless Mouse" },
        { manufacturerId: 3, family: "Mechanical Keyboard" }
      ],
      storages: ["N/A"],
      colors: ["Black", "White", "Blue", "Gray"],
      basePrice: 45,
      grade: "A"
    }
  ];

  const deviceInsert = db.prepare(`
    INSERT INTO devices (
      id, manufacturer_id, category_id, model_name, model_family, storage_capacity,
      grade, base_price, image_url, carrier, screen_size, modular, color, kit_type, product_notes, default_location_id, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const inventoryInsert = db.prepare(`
    INSERT INTO device_inventory (device_id, location_id, quantity) VALUES (?, ?, ?)
  `);
  const imageInsert = db.prepare(`
    INSERT INTO device_images (device_id, image_url, sort_order) VALUES (?, ?, ?)
  `);
  const updateDeviceMeta = db.prepare(`
    UPDATE devices
    SET carrier = ?,
        screen_size = ?,
        modular = ?,
        color = ?,
        kit_type = ?,
        product_notes = ?
    WHERE id = ?
  `);
  const devicesForBackfill = db.prepare(`
    SELECT d.id, d.model_name, d.storage_capacity, d.image_url, d.carrier, d.screen_size, d.modular, d.color, d.kit_type, d.product_notes, c.name AS category
    FROM devices d
    JOIN categories c ON c.id = d.category_id
  `);
  const imageCountStmt = db.prepare("SELECT COUNT(*) AS count FROM device_images WHERE device_id = ?");

  db.exec("BEGIN TRANSACTION");
  try {
    // Clean up previous generated rows so we can repopulate with cleaner realistic variants.
    db.exec("DELETE FROM devices WHERE id LIKE 'gen-%'");

    for (const cfg of config) {
      const categoryId = categoryByName.get(cfg.name);
      if (!categoryId) continue;
      for (let i = 0; i < EXTRA_DEVICES_PER_CATEGORY; i += 1) {
        const id = `gen-${cfg.slug}-${String(i + 1).padStart(4, "0")}`;
        const modelMeta = cfg.models[i % cfg.models.length];
        const storage = cfg.storages[i % cfg.storages.length];
        const color = cfg.colors[i % cfg.colors.length];
        const defaultLocationId = locations[i % locations.length];
        const modelFamily = modelMeta.family;
        const modelName = storage === "N/A"
          ? `${modelFamily} - ${color}`
          : `${modelFamily} ${storage} - ${color}`;
        const storageStep = cfg.storages.indexOf(storage);
        const modelStep = cfg.models.findIndex((m) => m.family === modelFamily);
        const price = Number((cfg.basePrice + (modelStep * 15) + (storageStep * 35) + (i % 10)).toFixed(2));
        const carrier = cfg.name === "Tablets" || cfg.name === "Laptops" ? "WiFi" : (cfg.name === "Wearables" ? "LTE" : (cfg.name === "Accessories" ? "Bluetooth" : "Unlocked"));
        const screenSize = cfg.name === "Smartphones"
          ? (modelFamily.includes("Pro Max") ? "6.7 inches" : "6.1 inches")
          : cfg.name === "Tablets"
            ? "11 inches"
            : cfg.name === "Laptops"
              ? "14 inches"
              : cfg.name === "Wearables"
                ? "47 mm"
                : "N/A";
        const kitType = cfg.name === "Accessories" ? "Retail Pack" : "Full Kit";
        const productNotes = `${modelFamily} variant in ${color} with ${storage}.`;

        deviceInsert.run(
          id,
          modelMeta.manufacturerId,
          categoryId,
          modelName,
          modelFamily,
          storage,
          cfg.grade,
          price,
          carrier,
          screenSize,
          "No",
          color,
          kitType,
          productNotes,
          defaultLocationId
        );

        for (let locIdx = 0; locIdx < locations.length; locIdx += 1) {
          const qty = 8 + ((i * 3 + locIdx * 13) % 140);
          inventoryInsert.run(id, locations[locIdx], qty);
        }
        imageInsert.run(id, `https://picsum.photos/seed/${id}-1/900/700`, 1);
        imageInsert.run(id, `https://picsum.photos/seed/${id}-2/900/700`, 2);
        imageInsert.run(id, `https://picsum.photos/seed/${id}-3/900/700`, 3);
      }
    }

    // Backfill missing metadata and images on non-generated seed rows.
    const rows = devicesForBackfill.all();
    for (const row of rows) {
      const carrier = row.carrier || (row.category === "Tablets" || row.category === "Laptops" ? "WiFi" : (row.category === "Wearables" ? "LTE" : (row.category === "Accessories" ? "Bluetooth" : "Unlocked")));
      const screenSize = row.screen_size || (row.category === "Smartphones" ? "6.1 inches" : row.category === "Tablets" ? "11 inches" : row.category === "Laptops" ? "14 inches" : row.category === "Wearables" ? "47 mm" : "N/A");
      const modular = row.modular || "No";
      const parsedColor = (() => {
        const parts = String(row.model_name || "").split(" - ");
        return parts.length > 1 ? parts[parts.length - 1].trim() : "Gray";
      })();
      const color = row.color || parsedColor || "Gray";
      const kitType = row.kit_type || (row.category === "Accessories" ? "Retail Pack" : "Full Kit");
      const notes = row.product_notes || `${row.model_name} variant with ${row.storage_capacity}.`;
      updateDeviceMeta.run(carrier, screenSize, modular, color, kitType, notes, row.id);

      const existingImages = Number(imageCountStmt.get(row.id).count || 0);
      let sort = existingImages + 1;
      if (existingImages === 0 && row.image_url) {
        imageInsert.run(row.id, row.image_url, sort);
        sort += 1;
      }
      while (sort <= 3) {
        imageInsert.run(row.id, `https://picsum.photos/seed/${row.id}-${sort}/900/700`, sort);
        sort += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function mimeTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) return "application/yaml; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function serveFile(res, filePath) {
  if (!existsSync(filePath)) return false;
  const data = readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypeFor(filePath),
    "Cache-Control": "no-cache"
  });
  res.end(data);
  return true;
}

function tryServeFrontend(req, res, url) {
  if (req.method !== "GET") return false;
  if (!existsSync(distDir)) return false;
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith("/api")) return false;
  const normalized = pathname.replace(/^\/+/, "");
  if (normalized.includes("..")) return false;
  const directPath = join(distDir, normalized);
  if (normalized && serveFile(res, directPath)) return true;
  return serveFile(res, join(distDir, "index.html"));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function makePublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    company: row.company,
    role: row.role,
    isActive: Number(row.is_active) === 1,
    createdAt: row.created_at
  };
}

function createSession(user) {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, makePublicUser(user));
  return token;
}

function getAuthUser(req) {
  const auth = req.headers.authorization || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return sessions.get(token) || null;
}

function requireAdmin(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    json(res, 401, { error: "Unauthorized" });
    return null;
  }
  if (user.role !== "admin") {
    json(res, 403, { error: "Forbidden" });
    return null;
  }
  return user;
}

function getDevices(url) {
  const search = (url.searchParams.get("search") || "").trim();
  const categories = splitCsv(url.searchParams.get("category"));
  const manufacturers = splitCsv(url.searchParams.get("manufacturer"));
  const modelFamilies = splitCsv(url.searchParams.get("modelFamily"));
  const regions = splitCsv(url.searchParams.get("region"));
  const storages = splitCsv(url.searchParams.get("storage"));
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSizeRaw = Number(url.searchParams.get("pageSize") || 0);
  const pageSize = pageSizeRaw > 0 ? Math.min(200, pageSizeRaw) : 0;

  const filters = [];
  const params = {};

  if (search) {
    filters.push("(LOWER(d.model_name) LIKE $search OR LOWER(d.model_family) LIKE $search OR LOWER(m.name) LIKE $search OR LOWER(c.name) LIKE $search)");
    params.$search = `%${search.toLowerCase()}%`;
  }

  function addInFilter(column, values, keyPrefix) {
    if (!values.length) return;
    const keys = values.map((_, idx) => `$${keyPrefix}${idx}`);
    values.forEach((value, idx) => {
      params[`$${keyPrefix}${idx}`] = value;
    });
    filters.push(`${column} IN (${keys.join(", ")})`);
  }

  addInFilter("c.name", categories, "category");
  addInFilter("m.name", manufacturers, "manufacturer");
  addInFilter("d.model_family", modelFamilies, "modelFamily");
  addInFilter("dl.name", regions, "region");
  addInFilter("d.storage_capacity", storages, "storage");

  const whereSql = filters.length ? `WHERE d.is_active = 1 AND ${filters.join(" AND ")}` : "WHERE d.is_active = 1";
  const offset = (page - 1) * (pageSize || 1);

  const baseSql = `
    SELECT
      d.id,
      m.name AS manufacturer,
      d.model_name AS model,
      d.model_family AS modelFamily,
      c.name AS category,
      d.grade,
      dl.name AS region,
      d.storage_capacity AS storage,
      d.base_price AS price,
      d.image_url AS image,
      d.carrier AS carrier,
      d.screen_size AS screenSize,
      d.modular AS modular,
      d.color AS color,
      d.kit_type AS kitType,
      d.product_notes AS productNotes,
      COALESCE(SUM(di.quantity), 0) AS available
    FROM devices d
    JOIN manufacturers m ON m.id = d.manufacturer_id
    JOIN categories c ON c.id = d.category_id
    LEFT JOIN locations dl ON dl.id = d.default_location_id
    LEFT JOIN device_inventory di ON di.device_id = d.id
    ${whereSql}
    GROUP BY d.id, m.name, d.model_name, d.model_family, c.name, d.grade, dl.name, d.storage_capacity, d.base_price, d.image_url, d.carrier, d.screen_size, d.modular, d.color, d.kit_type, d.product_notes
    ORDER BY c.id, m.name, d.model_name
  `;

  const countSql = `
    SELECT COUNT(*) AS count
    FROM (
      SELECT d.id
      FROM devices d
      JOIN manufacturers m ON m.id = d.manufacturer_id
      JOIN categories c ON c.id = d.category_id
      LEFT JOIN locations dl ON dl.id = d.default_location_id
      ${whereSql}
      GROUP BY d.id
    ) x
  `;
  const total = Number(db.prepare(countSql).get(params).count || 0);

  const queryParams = { ...params };
  const pagedSql = pageSize
    ? `${baseSql} LIMIT $pageSize OFFSET $offset`
    : baseSql;
  if (pageSize) {
    queryParams.$pageSize = pageSize;
    queryParams.$offset = offset;
  }
  const devices = db.prepare(pagedSql).all(queryParams);
  const locationStmt = db.prepare(`
    SELECT
      l.name AS location,
      COALESCE(di.quantity, 0) AS quantity
    FROM locations l
    LEFT JOIN device_inventory di
      ON di.location_id = l.id
      AND di.device_id = ?
    ORDER BY l.id
  `);
  const imagesStmt = db.prepare(`
    SELECT image_url
    FROM device_images
    WHERE device_id = ?
    ORDER BY sort_order, id
  `);

  const items = devices.map((d) => {
    const locationRows = locationStmt.all(d.id);
    const imageRows = imagesStmt.all(d.id);
    const locations = {};
    for (const row of locationRows) {
      locations[row.location] = Number(row.quantity || 0);
    }
    const images = imageRows.map((r) => r.image_url).filter(Boolean);
    const fallbackImage = d.image || undefined;
    const image = images[0] || fallbackImage;
    return {
      id: d.id,
      manufacturer: d.manufacturer,
      model: d.model,
      modelFamily: d.modelFamily,
      category: d.category,
      grade: d.grade,
      region: d.region,
      storage: d.storage,
      price: Number(d.price),
      image,
      images: images.length ? images : (fallbackImage ? [fallbackImage] : []),
      carrier: d.carrier || "Unlocked",
      screenSize: d.screenSize || "N/A",
      modular: d.modular || "No",
      color: d.color || "N/A",
      kitType: d.kitType || "Full Kit",
      productNotes: d.productNotes || "",
      available: Number(d.available || 0),
      locations
    };
  });
  if (!pageSize) {
    return items;
  }
  return {
    items,
    total,
    page,
    pageSize
  };
}

function getCategories() {
  return db.prepare("SELECT name FROM categories ORDER BY id").all().map((row) => row.name);
}

function clearCatalogData() {
  const before = {
    devices: Number(db.prepare("SELECT COUNT(*) AS count FROM devices").get().count || 0),
    raw: Number(db.prepare("SELECT COUNT(*) AS count FROM boomi_inventory_raw").get().count || 0)
  };
  db.exec("BEGIN TRANSACTION");
  try {
    db.exec("DELETE FROM boomi_inventory_raw");
    db.exec("DELETE FROM inventory_events");
    db.exec("DELETE FROM devices");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return before;
}

function seedAdminTestDevicesPerCategory(countPerCategory) {
  const categories = db.prepare("SELECT id, name FROM categories").all();
  const categoryByName = new Map(categories.map((c) => [c.name, c.id]));
  const locations = db.prepare("SELECT id FROM locations ORDER BY id").all().map((l) => l.id);
  const manufacturerByName = new Map(
    db.prepare("SELECT id, name FROM manufacturers").all().map((m) => [m.name, m.id])
  );
  const ensureManufacturer = db.prepare("INSERT INTO manufacturers (name) VALUES (?)");
  const config = [
    { name: "Smartphones", manufacturers: ["Apple", "Samsung", "Google", "Lenovo"], models: ["iPhone 15", "iPhone 15 Pro", "Galaxy S24", "Pixel 8"], storages: ["128GB", "256GB", "512GB"], colors: ["Black", "Blue", "Gray", "Silver"], basePrice: 420 },
    { name: "Tablets", manufacturers: ["Apple", "Samsung", "Google", "Lenovo"], models: ["iPad Pro 11", "iPad Air 11", "Galaxy Tab S9", "Pixel Tablet"], storages: ["64GB", "128GB", "256GB"], colors: ["Gray", "Blue", "Silver"], basePrice: 260 },
    { name: "Laptops", manufacturers: ["Apple", "Samsung", "Google", "Lenovo"], models: ["MacBook Air 13", "MacBook Pro 14", "Galaxy Book4 Pro", "ThinkPad X1 Carbon"], storages: ["256GB", "512GB", "1TB"], colors: ["Black", "Gray", "Silver"], basePrice: 740 },
    { name: "Wearables", manufacturers: ["Apple", "Samsung", "Google"], models: ["Apple Watch Series 9", "Watch Ultra 2", "Galaxy Watch 6", "Pixel Watch 2"], storages: ["32GB", "64GB"], colors: ["Black", "Blue", "Silver"], basePrice: 180 },
    { name: "Accessories", manufacturers: ["Apple", "Samsung", "Google", "Lenovo"], models: ["AirPods Pro", "Galaxy Buds2 Pro", "65W USB-C Charger", "Wireless Mouse"], storages: ["N/A"], colors: ["Black", "White", "Blue"], basePrice: 45 }
  ];

  const deviceInsert = db.prepare(`
    INSERT INTO devices (
      id, manufacturer_id, category_id, model_name, model_family, storage_capacity, grade, base_price,
      image_url, carrier, screen_size, modular, color, kit_type, product_notes, default_location_id, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const inventoryInsert = db.prepare(`
    INSERT INTO device_inventory (device_id, location_id, quantity)
    VALUES (?, ?, ?)
  `);
  const imageInsert = db.prepare(`
    INSERT INTO device_images (device_id, image_url, sort_order)
    VALUES (?, ?, ?)
  `);

  db.exec("BEGIN TRANSACTION");
  try {
    db.exec("DELETE FROM devices WHERE id LIKE 'admintest-%'");
    for (const cfg of config) {
      const categoryId = categoryByName.get(cfg.name);
      if (!categoryId) continue;
      for (let i = 0; i < countPerCategory; i += 1) {
        const manufacturerName = cfg.manufacturers[i % cfg.manufacturers.length];
        let manufacturerId = manufacturerByName.get(manufacturerName);
        if (!manufacturerId) {
          manufacturerId = Number(ensureManufacturer.run(manufacturerName).lastInsertRowid);
          manufacturerByName.set(manufacturerName, manufacturerId);
        }
        const modelFamily = cfg.models[i % cfg.models.length];
        const storage = cfg.storages[i % cfg.storages.length];
        const color = cfg.colors[i % cfg.colors.length];
        const defaultLocationId = locations[i % locations.length];
        const id = `admintest-${cfg.name.toLowerCase()}-${String(i + 1).padStart(4, "0")}`;
        const modelName = storage === "N/A" ? `${modelFamily} - ${color}` : `${modelFamily} ${storage} - ${color}`;
        const price = Number((cfg.basePrice + (i % 15)).toFixed(2));
        const carrier = cfg.name === "Accessories" ? "Bluetooth" : (cfg.name === "Laptops" || cfg.name === "Tablets" ? "WiFi" : "Unlocked");
        const screenSize = cfg.name === "Wearables" ? "47 mm" : cfg.name === "Tablets" ? "11 inches" : cfg.name === "Laptops" ? "14 inches" : (cfg.name === "Accessories" ? "N/A" : "6.1 inches");
        const kitType = cfg.name === "Accessories" ? "Retail Pack" : "Full Kit";

        deviceInsert.run(
          id,
          manufacturerId,
          categoryId,
          modelName,
          modelFamily,
          storage,
          "A",
          price,
          carrier,
          screenSize,
          "No",
          color,
          kitType,
          `Admin test device for ${cfg.name}.`,
          defaultLocationId
        );

        for (let locIdx = 0; locIdx < locations.length; locIdx += 1) {
          const qty = 10 + ((i * 7 + locIdx * 11) % 120);
          inventoryInsert.run(id, locations[locIdx], qty);
        }
        imageInsert.run(id, `https://picsum.photos/seed/${id}-1/900/700`, 1);
        imageInsert.run(id, `https://picsum.photos/seed/${id}-2/900/700`, 2);
        imageInsert.run(id, `https://picsum.photos/seed/${id}-3/900/700`, 3);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    categoriesSeeded: config.length,
    countPerCategory
  };
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (m) => m.toUpperCase());
}

function inferCategoryFromBoomi(row) {
  const text = `${row.sku || ""} ${row.model || ""}`.toUpperCase();
  if (/(AIRPODS|BUDS|CHARGER|CABLE|KEYBOARD|MOUSE|SPEAKER|HEADPHONE|POWER BANK|POWERBANK|ACCESSORY)/.test(text)) return "Accessories";
  if (/(WATCH|ULTRA WATCH|SMARTWATCH)/.test(text)) return "Wearables";
  if (/(IPAD|TABLET|TAB)/.test(text)) return "Tablets";
  if (/(MACBOOK|LAPTOP|NOTEBOOK|THINKPAD|YOGA|CHROMEBOOK|GALAXY BOOK)/.test(text)) return "Laptops";
  return "Smartphones";
}

function buildBoomiHeaders() {
  const headers = {
    customerid: BOOMI_CUSTOMER_ID,
    Authorization: `Basic ${Buffer.from(`${BOOMI_BASIC_USERNAME}:${BOOMI_BASIC_PASSWORD}`).toString("base64")}`,
    Accept: "application/json"
  };
  if (BOOMI_EXTRA_AUTH) {
    headers["X-Authorization"] = BOOMI_EXTRA_AUTH;
  }
  return headers;
}

async function fetchBoomiInventory() {
  if (!BOOMI_CUSTOMER_ID || !BOOMI_BASIC_USERNAME || !BOOMI_BASIC_PASSWORD) {
    throw new Error("Boomi credentials are not configured. Set BOOMI_CUSTOMER_ID, BOOMI_BASIC_USERNAME, and BOOMI_BASIC_PASSWORD.");
  }
  const payload = await new Promise((resolve, reject) => {
    const req = https.request(BOOMI_INVENTORY_URL, {
      method: "GET",
      headers: buildBoomiHeaders(),
      rejectUnauthorized: !BOOMI_TLS_INSECURE
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        const status = Number(res.statusCode || 0);
        if (status < 200 || status >= 300) {
          reject(new Error(`Boomi inventory request failed (${status}): ${String(data || "").slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(data || "[]"));
        } catch {
          reject(new Error("Boomi inventory response was not valid JSON."));
        }
      });
    });
    req.on("error", (error) => {
      reject(new Error(`Boomi request error: ${error.message}`));
    });
    req.end();
  });

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.inventory)) return payload.inventory;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  throw new Error("Unexpected Boomi payload format.");
}

function syncBoomiInventoryRows(rows) {
  const getCategoryId = db.prepare("SELECT id FROM categories WHERE name = ?");
  const insertCategory = db.prepare("INSERT INTO categories (name) VALUES (?)");
  const getManufacturerId = db.prepare("SELECT id FROM manufacturers WHERE name = ?");
  const insertManufacturer = db.prepare("INSERT INTO manufacturers (name) VALUES (?)");
  const getLocationByExternal = db.prepare("SELECT id FROM locations WHERE external_id = ?");
  const insertLocation = db.prepare("INSERT INTO locations (name, external_id) VALUES (?, ?)");
  const getDeviceBySourceId = db.prepare("SELECT id FROM devices WHERE source_external_id = ?");
  const upsertDevice = db.prepare(`
    INSERT INTO devices (
      id, manufacturer_id, category_id, model_name, model_family, storage_capacity, grade, base_price,
      image_url, carrier, screen_size, modular, color, kit_type, product_notes, default_location_id, is_active,
      source_external_id, source_sku, currency_code, country_code, effective_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      manufacturer_id = excluded.manufacturer_id,
      category_id = excluded.category_id,
      model_name = excluded.model_name,
      model_family = excluded.model_family,
      storage_capacity = excluded.storage_capacity,
      grade = excluded.grade,
      base_price = excluded.base_price,
      carrier = excluded.carrier,
      color = excluded.color,
      source_sku = excluded.source_sku,
      currency_code = excluded.currency_code,
      country_code = excluded.country_code,
      effective_date = excluded.effective_date,
      default_location_id = excluded.default_location_id,
      updated_at = CURRENT_TIMESTAMP
  `);
  const upsertInventory = db.prepare(`
    INSERT INTO device_inventory (device_id, location_id, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT(device_id, location_id)
    DO UPDATE SET quantity = excluded.quantity
  `);
  const insertImage = db.prepare(`
    INSERT INTO device_images (device_id, image_url, sort_order) VALUES (?, ?, ?)
  `);
  const imageCountByDevice = db.prepare("SELECT COUNT(*) AS count FROM device_images WHERE device_id = ?");
  const insertRaw = db.prepare(`
    INSERT INTO boomi_inventory_raw (
      source_external_id, sku, manufacturer, model, color, grade, storage_capacity,
      price, quantity_on_hand, carrier, currency_code, country, effective_date, source_location_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let processed = 0;
  let skipped = 0;
  db.exec("BEGIN TRANSACTION");
  try {
    for (const row of rows) {
      const sourceExternalId = String(row.id || "").trim();
      const sku = String(row.sku || "").trim();
      const manufacturerRaw = String(row.manufacturer || "").trim();
      const modelRaw = String(row.model || "").trim();
      const colorRaw = String(row.color || "").trim();
      const grade = String(row.grade || "A").trim() || "A";
      const storage = String(row.storage_capacity || "N/A").trim() || "N/A";
      const carrier = String(row.carrier || "Unlocked").trim() || "Unlocked";
      const currencyCode = String(row.currency_code || "USD").trim() || "USD";
      const countryCode = String(row.country || "US").trim() || "US";
      const effectiveDate = String(row.effective_date || "").trim() || null;
      const sourceLocationId = String(row.location_id || "").trim();
      const price = Number(row.price || 0);
      const quantity = Math.max(0, Number(row.quantity_on_hand || 0));

      if (!sourceExternalId || !manufacturerRaw || !modelRaw || !sourceLocationId || Number.isNaN(price) || Number.isNaN(quantity)) {
        skipped += 1;
        continue;
      }

      insertRaw.run(
        sourceExternalId, sku, manufacturerRaw, modelRaw, colorRaw || null, grade, storage, price, quantity, carrier,
        currencyCode, countryCode, effectiveDate, sourceLocationId
      );

      const manufacturerName = toTitleCase(manufacturerRaw);
      let manufacturerId = getManufacturerId.get(manufacturerName)?.id;
      if (!manufacturerId) {
        manufacturerId = Number(insertManufacturer.run(manufacturerName).lastInsertRowid);
      }

      const categoryName = inferCategoryFromBoomi(row);
      let categoryId = getCategoryId.get(categoryName)?.id;
      if (!categoryId) {
        categoryId = Number(insertCategory.run(categoryName).lastInsertRowid);
      }

      let locationId = getLocationByExternal.get(sourceLocationId)?.id;
      if (!locationId) {
        locationId = Number(insertLocation.run(`${countryCode} Location ${sourceLocationId}`, sourceLocationId).lastInsertRowid);
      }

      const modelFamily = modelRaw;
      const modelUpper = modelRaw.toUpperCase();
      const storageUpper = storage.toUpperCase();
      const hasStorageInModel = storageUpper !== "N/A" && modelUpper.includes(storageUpper);
      const modelWithStorage = hasStorageInModel || storageUpper === "N/A" ? modelRaw : `${modelRaw} ${storage}`;
      const modelName = colorRaw ? `${modelWithStorage} - ${toTitleCase(colorRaw)}` : modelWithStorage;
      const existingDeviceId = getDeviceBySourceId.get(sourceExternalId)?.id;
      const deviceId = existingDeviceId || `boomi-${sourceExternalId}`;

      upsertDevice.run(
        deviceId,
        manufacturerId,
        categoryId,
        modelName,
        modelFamily,
        storage,
        grade,
        price,
        carrier,
        categoryName === "Wearables" ? "47 mm" : categoryName === "Tablets" ? "11 inches" : categoryName === "Laptops" ? "14 inches" : "6.1 inches",
        "No",
        colorRaw ? toTitleCase(colorRaw) : "N/A",
        categoryName === "Accessories" ? "Retail Pack" : "Full Kit",
        `Imported from Boomi inventory feed. SKU: ${sku || "N/A"}`,
        locationId,
        sourceExternalId,
        sku || null,
        currencyCode,
        countryCode,
        effectiveDate
      );
      upsertInventory.run(deviceId, locationId, quantity);

      const imageCount = Number(imageCountByDevice.get(deviceId).count || 0);
      if (imageCount === 0) {
        insertImage.run(deviceId, `https://picsum.photos/seed/${deviceId}-1/900/700`, 1);
        insertImage.run(deviceId, `https://picsum.photos/seed/${deviceId}-2/900/700`, 2);
        insertImage.run(deviceId, `https://picsum.photos/seed/${deviceId}-3/900/700`, 3);
      }

      processed += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { processed, skipped };
}

function isInteger(value) {
  return Number.isInteger(value);
}

function getDeviceExists(deviceId) {
  const row = db.prepare("SELECT id, model_name FROM devices WHERE id = ?").get(deviceId);
  return row || null;
}

function getLocationExists(locationId) {
  const row = db.prepare("SELECT id, name FROM locations WHERE id = ?").get(locationId);
  return row || null;
}

function getInventoryByDeviceId(deviceId) {
  const device = db.prepare("SELECT id, model_name FROM devices WHERE id = ?").get(deviceId);
  if (!device?.id) return null;
  const rows = db.prepare(`
    SELECT
      l.id AS locationId,
      l.name AS location,
      COALESCE(di.quantity, 0) AS quantity
    FROM locations l
    LEFT JOIN device_inventory di
      ON di.location_id = l.id
      AND di.device_id = ?
    ORDER BY l.id
  `).all(deviceId);
  const total = rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
  return {
    deviceId: device.id,
    model: device.model_name,
    locations: rows.map((r) => ({
      locationId: Number(r.locationId),
      location: r.location,
      quantity: Number(r.quantity || 0)
    })),
    total
  };
}

function upsertInventoryQuantity(deviceId, locationId, quantity) {
  db.prepare(`
    INSERT INTO device_inventory (device_id, location_id, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT(device_id, location_id)
    DO UPDATE SET quantity = excluded.quantity
  `).run(deviceId, locationId, quantity);
}

function getInventoryQuantity(deviceId, locationId) {
  const row = db.prepare(`
    SELECT quantity
    FROM device_inventory
    WHERE device_id = ? AND location_id = ?
  `).get(deviceId, locationId);
  return Number(row?.quantity || 0);
}

function addInventoryEvent({ deviceId, locationId, changeType, previousQuantity, newQuantity, delta, reason, changedByUserId }) {
  db.prepare(`
    INSERT INTO inventory_events (
      device_id, location_id, change_type, previous_quantity, new_quantity, delta, reason, changed_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(deviceId, locationId, changeType, previousQuantity, newQuantity, delta, reason || null, changedByUserId ?? null);
}

initDb();

const server = createServer(async (req, res) => {
  try {
    if (!req.url) {
      json(res, 400, { error: "Bad request" });
      return;
    }

    if (req.method === "OPTIONS") {
      json(res, 204, {});
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (tryServeFrontend(req, res, url)) {
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/openapi.yaml") {
      if (!existsSync(openApiPath)) {
        json(res, 404, { error: "OpenAPI spec not found." });
        return;
      }
      serveFile(res, openApiPath);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/docs") {
      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PCS Online Catalog API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body style="margin:0;background:#f5f7fb;">
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/api/openapi.yaml",
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: "BaseLayout"
    });
  </script>
</body>
</html>`;
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache"
      });
      res.end(html);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const company = String(body.company || "").trim();

      if (!email || !company || !password) {
        json(res, 400, { error: "Email, company and password are required." });
        return;
      }

      if (!isPasswordValid(password)) {
        json(res, 400, { error: "Password must be at least 8 chars and include uppercase, number, and special character." });
        return;
      }

      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing?.id) {
        json(res, 409, { error: "User already exists." });
        return;
      }

      const passwordHash = hashPassword(password);
      db.prepare("INSERT INTO users (email, company, role, password_hash, is_active) VALUES (?, ?, 'buyer', ?, 0)")
        .run(email, company, passwordHash);
      json(res, 201, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const row = db.prepare(
        "SELECT id, email, company, role, password_hash, is_active, created_at FROM users WHERE email = ?"
      ).get(email);

      if (!row || !verifyPassword(password, row.password_hash)) {
        json(res, 401, { error: "Invalid email or password." });
        return;
      }
      if (Number(row.is_active) !== 1) {
        json(res, 200, { pendingApproval: true, email: row.email, company: row.company });
        return;
      }

      const token = createSession(row);
      json(res, 200, { token, user: makePublicUser(row) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/request-password-reset") {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      if (!email) {
        json(res, 400, { error: "Email is required." });
        return;
      }
      const row = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (row?.id) {
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        db.prepare("UPDATE users SET reset_code = ?, reset_code_expires_at = ? WHERE id = ?")
          .run(DEMO_RESET_CODE, expiresAt, row.id);
      }
      json(res, 200, {
        ok: true,
        message: "If the email exists, a verification code has been sent.",
        demoCode: DEMO_RESET_CODE
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const code = String(body.code || "").trim();
      const newPassword = String(body.newPassword || "");
      if (!email || !code || !newPassword) {
        json(res, 400, { error: "Email, verification code and new password are required." });
        return;
      }
      if (!/^\d{6}$/.test(code)) {
        json(res, 400, { error: "Verification code must be 6 digits." });
        return;
      }
      if (!isPasswordValid(newPassword)) {
        json(res, 400, { error: "Password must be at least 8 chars and include uppercase, number, and special character." });
        return;
      }

      const row = db.prepare(
        "SELECT id, reset_code, reset_code_expires_at FROM users WHERE email = ?"
      ).get(email);
      if (!row?.id || !row.reset_code || row.reset_code !== code) {
        json(res, 400, { error: "Invalid verification code." });
        return;
      }
      if (!row.reset_code_expires_at || new Date(row.reset_code_expires_at).getTime() < Date.now()) {
        json(res, 400, { error: "Verification code expired. Please request a new code." });
        return;
      }

      const passwordHash = hashPassword(newPassword);
      db.prepare("UPDATE users SET password_hash = ?, reset_code = NULL, reset_code_expires_at = NULL WHERE id = ?")
        .run(passwordHash, row.id);
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = getAuthUser(req);
      if (!user) {
        json(res, 401, { error: "Unauthorized" });
        return;
      }
      json(res, 200, { user });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const users = db.prepare(
        "SELECT id, email, company, role, is_active, created_at FROM users ORDER BY created_at DESC"
      ).all().map(makePublicUser);
      json(res, 200, users);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/users") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const company = String(body.company || "").trim();
      const password = String(body.password || "");
      const isActive = body.isActive === true;
      const isAdmin = body.isAdmin === true;

      if (!email || !company || !password) {
        json(res, 400, { error: "Email, company and password are required." });
        return;
      }
      if (!isPasswordValid(password)) {
        json(res, 400, { error: "Password must be at least 8 chars and include uppercase, number, and special character." });
        return;
      }
      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing?.id) {
        json(res, 409, { error: "User already exists." });
        return;
      }

      const role = isAdmin ? "admin" : "buyer";
      const hash = hashPassword(password);
      db.prepare("INSERT INTO users (email, company, role, password_hash, is_active) VALUES (?, ?, ?, ?, ?)")
        .run(email, company, role, hash, isActive ? 1 : 0);
      json(res, 201, { ok: true });
      return;
    }

    const userPatchMatch = url.pathname.match(/^\/api\/users\/(\d+)$/);
    if (req.method === "PATCH" && userPatchMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const userId = Number(userPatchMatch[1]);
      const body = await parseBody(req);
      const updates = [];
      const params = [];

      if (typeof body.isActive === "boolean") {
        updates.push("is_active = ?");
        params.push(body.isActive ? 1 : 0);
      }
      if (typeof body.isAdmin === "boolean") {
        updates.push("role = ?");
        params.push(body.isAdmin ? "admin" : "buyer");
      }
      if (!updates.length) {
        json(res, 400, { error: "No valid fields to update." });
        return;
      }
      params.push(userId);
      db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params);
      json(res, 200, { ok: true });
      return;
    }

    const userDeleteMatch = url.pathname.match(/^\/api\/users\/(\d+)$/);
    if (req.method === "DELETE" && userDeleteMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const userId = Number(userDeleteMatch[1]);
      if (user.id === userId) {
        json(res, 400, { error: "You cannot delete your own admin user." });
        return;
      }
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/categories") {
      const user = getAuthUser(req);
      if (!user) {
        json(res, 401, { error: "Unauthorized" });
        return;
      }
      json(res, 200, getCategories());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/devices") {
      const user = getAuthUser(req);
      if (!user) {
        json(res, 401, { error: "Unauthorized" });
        return;
      }
      json(res, 200, getDevices(url));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/integrations/boomi/inventory/sync") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const rows = await fetchBoomiInventory();
      const { processed, skipped } = syncBoomiInventoryRows(rows);
      json(res, 200, {
        ok: true,
        fetched: rows.length,
        processed,
        skipped
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/catalog/clear") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const before = clearCatalogData();
      json(res, 200, { ok: true, removedDevices: before.devices, removedRawRows: before.raw });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/catalog/seed-test") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const countPerCategory = Math.max(1, Math.min(5000, Number(body.countPerCategory || 500)));
      const result = seedAdminTestDevicesPerCategory(countPerCategory);
      json(res, 200, { ok: true, ...result });
      return;
    }

    const inventoryByDeviceMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)$/);
    if (req.method === "GET" && inventoryByDeviceMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const deviceId = decodeURIComponent(inventoryByDeviceMatch[1]);
      const inventory = getInventoryByDeviceId(deviceId);
      if (!inventory) {
        json(res, 404, { error: "Device not found." });
        return;
      }
      json(res, 200, inventory);
      return;
    }

    const inventorySetMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)\/(\d+)$/);
    if (req.method === "PUT" && inventorySetMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const deviceId = decodeURIComponent(inventorySetMatch[1]);
      const locationId = Number(inventorySetMatch[2]);
      const body = await parseBody(req);
      const quantity = Number(body.quantity);
      const reason = String(body.reason || "").trim();

      if (!isInteger(quantity) || quantity < 0) {
        json(res, 400, { error: "Quantity must be an integer >= 0." });
        return;
      }
      if (!getDeviceExists(deviceId)) {
        json(res, 404, { error: "Device not found." });
        return;
      }
      if (!getLocationExists(locationId)) {
        json(res, 404, { error: "Location not found." });
        return;
      }

      const previousQuantity = getInventoryQuantity(deviceId, locationId);
      upsertInventoryQuantity(deviceId, locationId, quantity);
      addInventoryEvent({
        deviceId,
        locationId,
        changeType: "set",
        previousQuantity,
        newQuantity: quantity,
        delta: quantity - previousQuantity,
        reason,
        changedByUserId: user.id
      });

      json(res, 200, { ok: true, deviceId, locationId, quantity });
      return;
    }

    const inventoryAdjustMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)\/(\d+)\/adjust$/);
    if (req.method === "POST" && inventoryAdjustMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const deviceId = decodeURIComponent(inventoryAdjustMatch[1]);
      const locationId = Number(inventoryAdjustMatch[2]);
      const body = await parseBody(req);
      const delta = Number(body.delta);
      const reason = String(body.reason || "").trim();

      if (!isInteger(delta) || delta === 0) {
        json(res, 400, { error: "Delta must be a non-zero integer." });
        return;
      }
      if (!getDeviceExists(deviceId)) {
        json(res, 404, { error: "Device not found." });
        return;
      }
      if (!getLocationExists(locationId)) {
        json(res, 404, { error: "Location not found." });
        return;
      }

      const previousQuantity = getInventoryQuantity(deviceId, locationId);
      const newQuantity = previousQuantity + delta;
      if (newQuantity < 0) {
        json(res, 400, { error: "Adjustment would result in negative quantity." });
        return;
      }

      upsertInventoryQuantity(deviceId, locationId, newQuantity);
      addInventoryEvent({
        deviceId,
        locationId,
        changeType: "adjust",
        previousQuantity,
        newQuantity,
        delta,
        reason,
        changedByUserId: user.id
      });

      json(res, 200, { ok: true, deviceId, locationId, previousQuantity, newQuantity, delta });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/inventory/bulk") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const mode = String(body.mode || "").trim().toLowerCase();
      const reason = String(body.reason || "").trim();
      const updates = Array.isArray(body.updates) ? body.updates : [];

      if (!["set", "adjust"].includes(mode)) {
        json(res, 400, { error: "Mode must be 'set' or 'adjust'." });
        return;
      }
      if (!updates.length) {
        json(res, 400, { error: "Updates array is required." });
        return;
      }

      const errors = [];
      for (let i = 0; i < updates.length; i += 1) {
        const row = updates[i] || {};
        const deviceId = String(row.deviceId || "").trim();
        const locationId = Number(row.locationId);
        if (!deviceId) {
          errors.push({ index: i, field: "deviceId", message: "deviceId is required." });
          continue;
        }
        if (!isInteger(locationId) || locationId < 1) {
          errors.push({ index: i, field: "locationId", message: "locationId must be a positive integer." });
          continue;
        }
        if (!getDeviceExists(deviceId)) {
          errors.push({ index: i, field: "deviceId", message: "Device not found." });
        }
        if (!getLocationExists(locationId)) {
          errors.push({ index: i, field: "locationId", message: "Location not found." });
        }
        if (mode === "set") {
          const quantity = Number(row.quantity);
          if (!isInteger(quantity) || quantity < 0) {
            errors.push({ index: i, field: "quantity", message: "Must be an integer >= 0." });
          }
        } else {
          const delta = Number(row.delta);
          if (!isInteger(delta) || delta === 0) {
            errors.push({ index: i, field: "delta", message: "Must be a non-zero integer." });
            continue;
          }
          const current = getInventoryQuantity(deviceId, locationId);
          if (current + delta < 0) {
            errors.push({ index: i, field: "delta", message: "Adjustment would result in negative quantity." });
          }
        }
      }
      if (errors.length) {
        json(res, 400, { error: "Validation failed", details: errors });
        return;
      }

      db.exec("BEGIN TRANSACTION");
      try {
        for (const row of updates) {
          const deviceId = String(row.deviceId).trim();
          const locationId = Number(row.locationId);
          const previousQuantity = getInventoryQuantity(deviceId, locationId);
          if (mode === "set") {
            const quantity = Number(row.quantity);
            upsertInventoryQuantity(deviceId, locationId, quantity);
            addInventoryEvent({
              deviceId,
              locationId,
              changeType: "set",
              previousQuantity,
              newQuantity: quantity,
              delta: quantity - previousQuantity,
              reason,
              changedByUserId: user.id
            });
          } else {
            const delta = Number(row.delta);
            const newQuantity = previousQuantity + delta;
            upsertInventoryQuantity(deviceId, locationId, newQuantity);
            addInventoryEvent({
              deviceId,
              locationId,
              changeType: "adjust",
              previousQuantity,
              newQuantity,
              delta,
              reason,
              changedByUserId: user.id
            });
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      json(res, 200, { ok: true, processed: updates.length, failed: 0 });
      return;
    }

    json(res, 404, { error: "Not found" });
  } catch (error) {
    json(res, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`API running on http://127.0.0.1:${port}`);
});
