import { createServer } from "node:http";
import https from "node:https";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

function stripEnvValue(value) {
  const trimmed = String(value || "").trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadLocalEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
    const eqIndex = normalized.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = normalized.slice(0, eqIndex).trim();
    if (!key) continue;
    if (process.env[key] !== undefined) continue;
    const value = normalized.slice(eqIndex + 1);
    process.env[key] = stripEnvValue(value);
  }
}

function loadLocalEnv(rootDir) {
  loadLocalEnvFile(join(rootDir, ".env"));
  loadLocalEnvFile(join(rootDir, ".env.local"));
}

loadLocalEnv(projectRoot);

const dbDir = join(__dirname, "db");
const dbPath = String(process.env.DB_PATH || "").trim() || join(dbDir, "catalog.sqlite");
const schemaPath = join(dbDir, "schema.sql");
const seedPath = join(dbDir, "seed.sql");
const distDir = join(projectRoot, "dist");
const docsDir = join(projectRoot, "docs");
const openApiPath = join(docsDir, "openapi.yaml");
const port = Number(process.env.PORT || process.env.API_PORT || 8787);

const ADMIN_EMAIL = "thomas.torvund@pcsww.com";
const ADMIN_PASSWORD = "AdminPassword123!";
const DEFAULT_BUYER_EMAIL = "ekrem.ersayin@pcsww.com";
const DEFAULT_BUYER_COMPANY = "PCSWW";
const DEFAULT_BUYER_PASSWORD = "TestPassword123!";
const DEMO_RESET_CODE = "123456";
const EXTRA_DEVICES_PER_CATEGORY = 1000;
const DEPLOY_REAL_SEED_COUNT = Math.max(1, Math.min(1000, Number(process.env.DEPLOY_REAL_SEED_COUNT || 100)));
const AUTO_SEED_REAL_ON_STARTUP = String(process.env.AUTO_SEED_REAL_ON_STARTUP || "false").toLowerCase() === "true";
const MODEL_IMAGE_MAP = {
  "iPhone 15": "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15.jpg",
  "iPhone 15 Pro": "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-pro-max.jpg",
  "iPhone 15 Pro Max": "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-pro-max.jpg",
  "Galaxy S24": "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s24-5g-sm-s921.jpg",
  "Galaxy Z Flip5": "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-z-flip5-5g.jpg",
  "Pixel 8": "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-8.jpg",
  "Pixel 8 Pro": "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-8-pro.jpg",
  "Motorola Edge 50": "https://fdn2.gsmarena.com/vv/bigpic/motorola-edge-50-pro.jpg",
  "iPad Pro 11": "https://fdn2.gsmarena.com/vv/bigpic/apple-ipad-pro-11-2024.jpg",
  "iPad Air 11": "https://fdn2.gsmarena.com/vv/bigpic/apple-ipad-air-11-2024.jpg",
  "Galaxy Tab S9": "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-tab-s9.jpg",
  "Galaxy Tab A9+": "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-tab-a9-plus.jpg",
  "Pixel Tablet": "https://lh3.googleusercontent.com/VRPfQml16IJp9tjEr70sOmNcu3eqtRe-LXoOxWJ32CNkOic-wf-TuY5TPIUZ2EO6cpHACrQZsryh_kzb9UD4RbeTchIGMTHwxA=rw-e365-w1200",
  "Lenovo Tab P12": "https://fdn2.gsmarena.com/vv/bigpic/lenovo-tab-p12.jpg",
  "Apple Watch Series 9": "https://www.apple.com/assets-www/en_WW/watch/og/watch_og_1ff2ee953.png",
  "Watch Ultra 2": "https://www.apple.com/assets-www/en_WW/watch/og/watch_og_1ff2ee953.png",
  "Galaxy Watch 6": "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-watch6.jpg",
  "Pixel Watch 2": "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-watch-2.jpg",
  "AirPods Pro": "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/airpods-pro-2-hero-select-202409?wid=890&hei=890&fmt=jpeg&qlt=90&.v=1724041668836",
  "Galaxy Buds2 Pro": "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-buds2-pro.jpg",
  "Apple 20W USB-C Power Adapter": "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/MU7T2?wid=890&hei=890&fmt=jpeg&qlt=90&.v=1542407168808",
  "Sony WH-1000XM5": "https://fdn2.gsmarena.com/vv/bigpic/sony-wh-1000xm5.jpg",
  "MacBook Air 13": "https://www.apple.com/v/macbook-air/x/images/meta/macbook_air_mx__ez5y0k5yy7au_og.png?202602101114",
  "MacBook Pro 14": "https://www.apple.com/v/macbook-pro/av/images/meta/macbook-pro__bmu4mp5lxjiq_og.png?202601201526",
  "Galaxy Book4 Pro": "https://images.samsung.com/is/image/samsung/p6pim/uk/np940xgk-kg1uk/gallery/uk-galaxy-book4-pro-np940xgk-kg1uk-thumb-539526715?$216_216_PNG$",
  "ThinkPad X1 Carbon": "https://p3-ofp.static.pub/fes/cms/2023/10/31/0k4ad9zpyhgh4hywj0v1wflsl58xq8157018.png"
};
const MODEL_VARIANT_IMAGE_POOLS = {
  "iPhone 15": [
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-plus.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-pro-max.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-14.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-14-plus.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-14-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-14-pro-max.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-13.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-13-pro-max.jpg"
  ],
  "iPhone 15 Pro": [
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-pro-max.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-14-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-14-pro-max.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-13-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-13-pro-max.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-12-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-12-pro-max-2.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-11-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-11-pro-max-.jpg"
  ],
  "iPhone 15 Pro Max": [
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-pro-max.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-14-pro-max.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-14-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-13-pro-max.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-13-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-12-pro-max-2.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-11-pro-max-.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-xs-max-new1.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-16-pro-max.jpg"
  ],
  "Galaxy S24": [
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s24-5g-sm-s921.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s24-plus-5g-sm-s926.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s24-ultra-5g-sm-s928.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s23.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s23-plus-5g.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s23-ultra-5g.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s22-5g.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s22-plus-5g.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s22-ultra-5g.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-a55.jpg"
  ],
  "Pixel 8": [
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-8.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-8-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-7.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-7-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-7a-r.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-6.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-6-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-6a.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-5.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-4-xl-.jpg"
  ],
  "Pixel 8 Pro": [
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-8-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-8.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-7-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-7.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-6-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-6.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-6a.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-5.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-4a-5g.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-fold.jpg"
  ],
  "MacBook Air 13": [
    "https://www.apple.com/v/macbook-air/x/images/meta/macbook_air_mx__ez5y0k5yy7au_og.png?202602101114",
    "https://commons.wikimedia.org/wiki/Special:FilePath/MacBook%20Air%20%2813-inch%2C%20M4%2C%20Silver%29.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/MacBook%20Air%20%2815-inch%2C%20M4%2C%20Silver%29.jpg",
    "https://images.unsplash.com/photo-1517336714739-489689fd1ca8?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1593642634367-d91a135587b5?auto=format&fit=crop&w=1200&q=80"
  ],
  "MacBook Pro 14": [
    "https://www.apple.com/v/macbook-pro/av/images/meta/macbook-pro__bmu4mp5lxjiq_og.png?202601201526",
    "https://commons.wikimedia.org/wiki/Special:FilePath/MacBook%20Pro%20%2814-inch%2C%20M5%2C%20Space%20Black%29.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/MacBook%20Pro%20%2816-inch%2C%20M4%20Pro%2C%20Silver%29.jpg",
    "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=1200&q=80"
  ]
};
const IPHONE_IMAGE_POOL = [
  "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15.jpg",
  "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-plus.jpg",
  "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-pro.jpg",
  "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-pro-max.jpg",
  "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-14.jpg",
  "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-14-plus.jpg",
  "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-14-pro.jpg",
  "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-14-pro-max.jpg",
  "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-13.jpg",
  "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-13-pro-max.jpg"
];
const CATEGORY_SEED_IMAGE_POOLS = {
  Smartphones: [
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s24-5g-sm-s921.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s24-plus-5g-sm-s926.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s24-ultra-5g-sm-s928.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-8.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-8-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-7.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/motorola-edge-50-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/motorola-edge-40-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-z-flip5-5g.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-z-fold5.jpg"
  ],
  Tablets: [
    "https://fdn2.gsmarena.com/vv/bigpic/apple-ipad-pro-11-2024.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-ipad-pro-13-2024.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-ipad-air-11-2024.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-ipad-air-13-2024.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-ipad-10-2022.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-tab-s9.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-tab-s9-plus.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-tab-s9-ultra.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/lenovo-tab-p12.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-tablet.jpg"
  ],
  Laptops: [
    "https://www.apple.com/v/macbook-air/x/images/meta/macbook_air_mx__ez5y0k5yy7au_og.png?202602101114",
    "https://www.apple.com/v/macbook-pro/av/images/meta/macbook-pro__bmu4mp5lxjiq_og.png?202601201526",
    "https://images.samsung.com/is/image/samsung/p6pim/uk/np940xgk-kg1uk/gallery/uk-galaxy-book4-pro-np940xgk-kg1uk-thumb-539526715?$216_216_PNG$",
    "https://p3-ofp.static.pub/fes/cms/2023/10/31/0k4ad9zpyhgh4hywj0v1wflsl58xq8157018.png",
    "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1517336714739-489689fd1ca8?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1593642634367-d91a135587b5?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1504707748692-419802cf939d?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80"
  ],
  Wearables: [
    "https://www.apple.com/assets-www/en_WW/watch/og/watch_og_1ff2ee953.png",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-watch6.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-watch6-classic.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-watch-2.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-watch-series-9.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/apple-watch-ultra-2.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-watch5.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/huawei-watch-gt4.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/garmin-venu-3.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/amazfit-gtr-4.jpg"
  ],
  Accessories: [
    "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/airpods-pro-2-hero-select-202409?wid=890&hei=890&fmt=jpeg&qlt=90&.v=1724041668836",
    "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-buds2-pro.jpg",
    "https://fdn2.gsmarena.com/vv/bigpic/sony-wh-1000xm5.jpg",
    "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/MU7T2?wid=890&hei=890&fmt=jpeg&qlt=90&.v=1542407168808",
    "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1585298723682-7115561c51b7?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1545127398-14699f92334b?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1587033411391-5d9e51cce126?auto=format&fit=crop&w=1200&q=80"
  ]
};

function getSeedImagePool(categoryName, modelFamily) {
  const modelImage = MODEL_IMAGE_MAP[modelFamily];
  const modelVariants = MODEL_VARIANT_IMAGE_POOLS[modelFamily] || [];
  const basePool = CATEGORY_SEED_IMAGE_POOLS[categoryName] || [];
  if (String(modelFamily || "").toLowerCase().includes("iphone")) {
    return [...new Set([modelImage, ...modelVariants, ...IPHONE_IMAGE_POOL, ...basePool].filter(Boolean))];
  }
  return [...new Set([modelImage, ...modelVariants, ...basePool].filter(Boolean))];
}
const BOOMI_INVENTORY_URL = process.env.BOOMI_INVENTORY_URL || "https://c01-usa-east-et.integrate-test.boomi.com/ws/rest/masterdealer/inventory/";
const BOOMI_CUSTOMER_ID = process.env.BOOMI_CUSTOMER_ID || "";
const BOOMI_BASIC_USERNAME = process.env.BOOMI_BASIC_USERNAME || "";
const BOOMI_BASIC_PASSWORD = process.env.BOOMI_BASIC_PASSWORD || "";
const BOOMI_EXTRA_AUTH = process.env.BOOMI_EXTRA_AUTH || "";
const BOOMI_TLS_INSECURE = String(process.env.BOOMI_TLS_INSECURE || "false").toLowerCase() === "true";
const INVENTORY_API_URL = process.env.INVENTORY_API_URL || "";
const INVENTORY_SUBSCRIPTION_KEY = process.env.INVENTORY_SUBSCRIPTION_KEY || "";
const INVENTORY_OAUTH_TOKEN_URL = process.env.INVENTORY_OAUTH_TOKEN_URL || "";
const INVENTORY_OAUTH_CLIENT_ID = process.env.INVENTORY_OAUTH_CLIENT_ID || "";
const INVENTORY_OAUTH_CLIENT_SECRET = process.env.INVENTORY_OAUTH_CLIENT_SECRET || "";
const INVENTORY_OAUTH_SCOPE = process.env.INVENTORY_OAUTH_SCOPE || "";
const ACCESS_TOKEN_TTL_MINUTES = Math.max(5, Number(process.env.ACCESS_TOKEN_TTL_MINUTES || 30));
const REFRESH_TOKEN_TTL_DAYS = Math.max(1, Number(process.env.REFRESH_TOKEN_TTL_DAYS || 14));
const CORS_ALLOWED_ORIGINS = (() => {
  const defaults = ["http://localhost:5173", "http://127.0.0.1:5173"];
  const fromEnv = String(process.env.CORS_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origins = new Set([...defaults, ...fromEnv]);
  if (process.env.RENDER_EXTERNAL_URL) {
    origins.add(process.env.RENDER_EXTERNAL_URL);
  }
  return origins;
})();
const sessions = new Map();
const REQUEST_STATUS_VALUES = new Set(["New", "Received", "Estimate Created", "Completed"]);

const db = new DatabaseSync(dbPath);

function initDb() {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(readFileSync(schemaPath, "utf8"));
  ensureUsersColumns();
  ensureLocationsSchema();
  ensureDeviceSchema();
  ensureQuoteSchema();
  ensureSavedFiltersSchema();
  const countStmt = db.prepare("SELECT COUNT(*) AS count FROM categories");
  const count = Number(countStmt.get().count || 0);
  if (count === 0) {
    db.exec(readFileSync(seedPath, "utf8"));
  }
  if (AUTO_SEED_REAL_ON_STARTUP) {
    db.exec("DELETE FROM devices WHERE id LIKE 'gen-%'");
  } else {
    ensureLargeCatalog();
  }
  ensureDeployRealSeed();
  ensureDefaultUsers();
}

function ensureDeployRealSeed() {
  if (!AUTO_SEED_REAL_ON_STARTUP) return;
  seedAdminRealDevicesPerCategory(DEPLOY_REAL_SEED_COUNT);
}

function ensureUsersColumns() {
  const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!cols.includes("reset_code")) {
    db.exec("ALTER TABLE users ADD COLUMN reset_code TEXT");
  }
  if (!cols.includes("reset_code_expires_at")) {
    db.exec("ALTER TABLE users ADD COLUMN reset_code_expires_at TEXT");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT,
      revoked_at TEXT,
      replaced_by_hash TEXT
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)");
}

function ensureQuoteSchema() {
  db.exec(`
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
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS quote_request_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
      device_id TEXT,
      model TEXT NOT NULL,
      grade TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity >= 1),
      offer_price REAL NOT NULL CHECK (offer_price >= 0),
      note TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS quote_request_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_quote_requests_company ON quote_requests(company)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_quote_requests_created_at ON quote_requests(created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_quote_request_lines_request ON quote_request_lines(request_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_quote_request_events_request ON quote_request_events(request_id)");
}

function ensureSavedFiltersSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_saved_filters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      view_key TEXT NOT NULL DEFAULT 'category',
      name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_user_saved_filters_user ON user_saved_filters(user_id)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_saved_filters_unique_name ON user_saved_filters(user_id, view_key, name)");
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

function ensureDefaultUsers() {
  const ensureUser = (emailRaw, company, role, plainPassword, isActive = true) => {
    const email = normalizeEmail(emailRaw);
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing?.id) return;
    const passwordHash = hashPassword(plainPassword);
    db.prepare("INSERT INTO users (email, company, role, password_hash, is_active) VALUES (?, ?, ?, ?, ?)")
      .run(email, company, role, passwordHash, isActive ? 1 : 0);
  };

  ensureUser(ADMIN_EMAIL, "PCSWW", "admin", ADMIN_PASSWORD, true);
  ensureUser(DEFAULT_BUYER_EMAIL, DEFAULT_BUYER_COMPANY, "buyer", DEFAULT_BUYER_PASSWORD, true);
}

function splitCsv(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function getCorsHeaders(req) {
  const requestOrigin = String(req.headers.origin || "").trim();
  const allowAny = CORS_ALLOWED_ORIGINS.has("*");
  let allowOrigin = "null";
  if (allowAny) {
    allowOrigin = "*";
  } else if (requestOrigin && CORS_ALLOWED_ORIGINS.has(requestOrigin)) {
    allowOrigin = requestOrigin;
  } else if (!requestOrigin) {
    allowOrigin = [...CORS_ALLOWED_ORIGINS][0] || "http://localhost:5173";
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin"
  };
}

function json(req, res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...getCorsHeaders(req)
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
  if (!cols.includes("weekly_special")) db.exec("ALTER TABLE devices ADD COLUMN weekly_special INTEGER NOT NULL DEFAULT 0 CHECK (weekly_special IN (0, 1))");
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_device_images_device ON device_images(device_id)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_source_external_id ON devices(source_external_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_boomi_raw_source_external_id ON boomi_inventory_raw(source_external_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_events_device ON inventory_events(device_id)");
}

function getBooleanAppSetting(key, defaultValue = false) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  if (!row) return defaultValue;
  const normalized = String(row.value || "").trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  return defaultValue;
}

function setBooleanAppSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, value ? "1" : "0");
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
  const expiresAt = Date.now() + (ACCESS_TOKEN_TTL_MINUTES * 60 * 1000);
  sessions.set(token, {
    user: makePublicUser(user),
    expiresAt
  });
  return { token, expiresAt };
}

function hashRefreshToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function issueRefreshToken(userId) {
  const refreshToken = randomBytes(48).toString("hex");
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + (REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)).toISOString();
  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, tokenHash, expiresAt);
  return refreshToken;
}

function revokeRefreshToken(refreshToken, replacedByToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  const replacedByHash = replacedByToken ? hashRefreshToken(replacedByToken) : null;
  db.prepare(`
    UPDATE refresh_tokens
    SET revoked_at = CURRENT_TIMESTAMP,
        replaced_by_hash = COALESCE(?, replaced_by_hash),
        last_used_at = CURRENT_TIMESTAMP
    WHERE token_hash = ?
      AND revoked_at IS NULL
  `).run(replacedByHash, tokenHash);
}

function rotateRefreshToken(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  const row = db.prepare(`
    SELECT id, user_id, expires_at, revoked_at
    FROM refresh_tokens
    WHERE token_hash = ?
  `).get(tokenHash);
  if (!row?.id) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
    return null;
  }

  const newRefreshToken = randomBytes(48).toString("hex");
  const newRefreshHash = hashRefreshToken(newRefreshToken);
  const newExpiresAt = new Date(Date.now() + (REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)).toISOString();

  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare(`
      UPDATE refresh_tokens
      SET revoked_at = CURRENT_TIMESTAMP,
          replaced_by_hash = ?,
          last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newRefreshHash, row.id);
    db.prepare(`
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at, last_used_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(row.user_id, newRefreshHash, newExpiresAt);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { userId: row.user_id, refreshToken: newRefreshToken };
}

function getAuthToken(req) {
  const auth = req.headers.authorization || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

function getAuthUser(req) {
  const token = getAuthToken(req);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (!session.expiresAt || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session.user || null;
}

function requireAdmin(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    json(req, res, 401, { error: "Unauthorized" });
    return null;
  }
  if (user.role !== "admin") {
    json(req, res, 403, { error: "Forbidden" });
    return null;
  }
  return user;
}

function getDevices(url) {
  const search = (url.searchParams.get("search") || "").trim();
  const categories = splitCsv(url.searchParams.get("category"));
  const manufacturers = splitCsv(url.searchParams.get("manufacturer"));
  const modelFamilies = splitCsv(url.searchParams.get("modelFamily"));
  const grades = splitCsv(url.searchParams.get("grade"));
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
  addInFilter("d.grade", grades, "grade");
  addInFilter("d.storage_capacity", storages, "storage");
  if (regions.length) {
    const keys = regions.map((_, idx) => `$regionAvail${idx}`);
    regions.forEach((value, idx) => {
      params[`$regionAvail${idx}`] = value;
    });
    filters.push(`
      EXISTS (
        SELECT 1
        FROM device_inventory di_r
        JOIN locations l_r ON l_r.id = di_r.location_id
        WHERE di_r.device_id = d.id
          AND di_r.quantity > 0
          AND l_r.name IN (${keys.join(", ")})
      )
    `);
  }

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
      d.weekly_special AS weeklySpecial,
      COALESCE(SUM(di.quantity), 0) AS available
    FROM devices d
    JOIN manufacturers m ON m.id = d.manufacturer_id
    JOIN categories c ON c.id = d.category_id
    LEFT JOIN locations dl ON dl.id = d.default_location_id
    LEFT JOIN device_inventory di ON di.device_id = d.id
    ${whereSql}
    GROUP BY d.id, m.name, d.model_name, d.model_family, c.name, d.grade, dl.name, d.storage_capacity, d.base_price, d.image_url, d.carrier, d.screen_size, d.modular, d.color, d.kit_type, d.product_notes, d.weekly_special
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
      weeklySpecial: Number(d.weeklySpecial || 0) === 1,
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

function parseAiFilters(promptRaw, selectedCategoryRaw = "") {
  const prompt = String(promptRaw || "").trim();
  if (!prompt) {
    return {
      selectedCategory: selectedCategoryRaw || "Smartphones",
      search: "",
      filters: {},
      warnings: ["Enter a prompt to parse filters."]
    };
  }
  const text = prompt.toLowerCase();
  const categories = getCategories();
  const manufacturers = db.prepare("SELECT name FROM manufacturers ORDER BY name").all().map((r) => r.name);
  const modelFamilies = db.prepare("SELECT DISTINCT model_family AS name FROM devices WHERE is_active = 1 ORDER BY model_family").all().map((r) => r.name);
  const storages = db.prepare("SELECT DISTINCT storage_capacity AS name FROM devices WHERE is_active = 1 ORDER BY storage_capacity").all().map((r) => r.name);
  const regions = db.prepare("SELECT name FROM locations ORDER BY id").all().map((r) => r.name);
  const filters = {};
  const warnings = [];

  const categoryByMatch = categories.find((name) => text.includes(String(name).toLowerCase()))
    || (text.includes("phone") ? "Smartphones" : "")
    || (text.includes("tablet") ? "Tablets" : "")
    || (text.includes("laptop") ? "Laptops" : "")
    || (text.includes("wear") || text.includes("watch") ? "Wearables" : "")
    || (text.includes("accessor") ? "Accessories" : "");
  const selectedCategory = categoryByMatch || selectedCategoryRaw || "Smartphones";

  const matchedManufacturers = manufacturers.filter((name) => text.includes(String(name).toLowerCase()));
  if (matchedManufacturers.length) {
    filters.manufacturer = matchedManufacturers;
  }

  const matchedModels = modelFamilies.filter((name) => text.includes(String(name).toLowerCase()));
  if (matchedModels.length) {
    filters.modelFamily = matchedModels.slice(0, 8);
  }

  const gradeMatches = [];
  if (/\bcpo\b/i.test(prompt)) gradeMatches.push("CPO");
  if (/\bgrade\s*a\b/i.test(prompt)) gradeMatches.push("A");
  if (/\bgrade\s*b\b/i.test(prompt)) gradeMatches.push("B");
  if (/\bgrade\s*c\b/i.test(prompt)) gradeMatches.push("C");
  if (gradeMatches.length) {
    filters.grade = [...new Set(gradeMatches)];
  }

  const matchedRegions = regions.filter((name) => text.includes(String(name).toLowerCase()));
  if (matchedRegions.length) {
    filters.region = matchedRegions;
  }

  const matchedStorages = storages.filter((name) => text.includes(String(name).toLowerCase()));
  if (matchedStorages.length) {
    filters.storage = matchedStorages;
  }

  const priceHintMatch = prompt.match(/\$?\s*(\d{2,6})(?:\s*usd|\s*dollars?)?/i);
  if (priceHintMatch) {
    warnings.push("Price constraints were detected but not auto-applied because price filter is not configured.");
  }

  const usedStructured = Object.keys(filters).length > 0;
  return {
    selectedCategory,
    search: usedStructured ? "" : prompt,
    filters,
    warnings
  };
}

function validateRequestWithAi(body) {
  const lines = Array.isArray(body?.lines) ? body.lines : [];
  const selectedLocation = String(body?.selectedLocation || "").trim();
  const warnings = [];
  const suggestions = [];
  if (!lines.length) {
    warnings.push({ code: "EMPTY_REQUEST", message: "Request has no lines." });
    return { warnings, suggestions };
  }

  const locationByDevice = db.prepare(`
    SELECT COALESCE(di.quantity, 0) AS quantity
    FROM devices d
    JOIN locations l ON l.name = ?
    LEFT JOIN device_inventory di ON di.device_id = d.id AND di.location_id = l.id
    WHERE d.id = ?
    LIMIT 1
  `);

  lines.forEach((line, index) => {
    const quantity = Number(line.quantity);
    const offerPrice = Number(line.offerPrice);
    const model = String(line.model || "").trim();
    const grade = String(line.grade || "").trim();
    const deviceId = String(line.productId || line.deviceId || "").trim();
    if (!model) warnings.push({ code: "MISSING_MODEL", lineIndex: index, message: `Line ${index + 1}: model is missing.` });
    if (!grade) warnings.push({ code: "MISSING_GRADE", lineIndex: index, message: `Line ${index + 1}: grade is missing.` });
    if (!Number.isInteger(quantity) || quantity < 1) warnings.push({ code: "INVALID_QTY", lineIndex: index, message: `Line ${index + 1}: quantity must be >= 1.` });
    if (!Number.isFinite(offerPrice) || offerPrice < 0) warnings.push({ code: "INVALID_PRICE", lineIndex: index, message: `Line ${index + 1}: offer price must be >= 0.` });
    if (selectedLocation && deviceId) {
      const row = locationByDevice.get(selectedLocation, deviceId);
      const available = Number(row?.quantity || 0);
      if (Number.isInteger(quantity) && quantity > available) {
        warnings.push({
          code: "LOCATION_SHORTAGE",
          lineIndex: index,
          message: `Line ${index + 1}: ${model} exceeds available inventory at ${selectedLocation} (requested ${quantity}, available ${available}).`
        });
        suggestions.push({
          type: "ADJUST_QTY",
          lineIndex: index,
          message: `Set quantity to ${Math.max(0, available)} for ${model} at ${selectedLocation}.`
        });
      }
    }
  });

  if (!selectedLocation) {
    suggestions.push({ type: "SELECT_LOCATION", message: "Select an order location before submitting." });
  }
  return { warnings, suggestions };
}

function validateNetsuitePayloadWithAi(body) {
  const payload = body && typeof body.payload === "object" ? body.payload : {};
  const requestId = String(body?.requestId || "").trim();
  let candidate = payload;
  if (requestId) {
    const row = db.prepare("SELECT * FROM quote_requests WHERE id = ?").get(requestId);
    if (!row?.id) {
      return { valid: false, errors: ["Request not found."], fixes: ["Use a valid requestId."] };
    }
    candidate = {
      requestId: row.id,
      requestNumber: row.request_number,
      company: row.company,
      createdBy: row.created_by_email,
      currencyCode: row.currency_code || "USD",
      lines: getRequestLines(row.id)
    };
  }

  const errors = [];
  const fixes = [];
  const lines = Array.isArray(candidate.lines) ? candidate.lines : [];
  if (!candidate.requestNumber && !candidate.requestId) {
    errors.push("Missing request identifier.");
    fixes.push("Provide requestId or requestNumber in payload.");
  }
  if (!candidate.company) {
    errors.push("Missing company.");
    fixes.push("Provide company for NetSuite customer mapping.");
  }
  if (!candidate.currencyCode) {
    errors.push("Missing currency code.");
    fixes.push("Set currencyCode (for example: USD).");
  }
  if (!lines.length) {
    errors.push("Payload has no lines.");
    fixes.push("Include at least one line item.");
  }
  lines.forEach((line, index) => {
    if (!String(line.model || "").trim()) errors.push(`Line ${index + 1}: model is required.`);
    if (!String(line.grade || "").trim()) errors.push(`Line ${index + 1}: grade is required.`);
    if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1) errors.push(`Line ${index + 1}: quantity must be >= 1.`);
    if (!Number.isFinite(Number(line.offerPrice)) || Number(line.offerPrice) < 0) errors.push(`Line ${index + 1}: offerPrice must be >= 0.`);
  });
  return {
    valid: errors.length === 0,
    errors,
    fixes
  };
}

function runAiCopilot(user, body) {
  const message = String(body?.message || "").trim();
  const selectedCategory = String(body?.selectedCategory || "").trim() || "Smartphones";
  if (!message) {
    return { reply: "Please enter a message.", action: null };
  }
  const lowered = message.toLowerCase();
  const parsed = parseAiFilters(message, selectedCategory);
  const hasFilters = Object.keys(parsed.filters || {}).length > 0 || String(parsed.search || "").trim().length > 0;

  if (hasFilters && /(find|show|search|filter|need|looking|want)/.test(lowered)) {
    const parts = [];
    if (Object.keys(parsed.filters || {}).length) parts.push("structured filters");
    if (parsed.search) parts.push("search text");
    return {
      reply: `I parsed your request and prepared ${parts.join(" and ")}. Apply this suggestion to jump to matching products.`,
      action: {
        type: "apply_filters",
        payload: parsed
      }
    };
  }

  if (/best location|fulfill|fulfillment|shortage/.test(lowered)) {
    const locationRows = db.prepare(`
      SELECT l.name AS location, COALESCE(SUM(di.quantity), 0) AS total
      FROM locations l
      LEFT JOIN device_inventory di ON di.location_id = l.id
      GROUP BY l.id, l.name
      ORDER BY total DESC, l.name ASC
    `).all();
    const best = locationRows[0];
    if (best?.location) {
      return {
        reply: `For broad fulfillment, ${best.location} currently has the highest total available inventory (${Number(best.total || 0)}).`,
        action: null
      };
    }
  }

  if (/price|discount|margin|offer/.test(lowered)) {
    return {
      reply: "Use AI Request Review before submitting to catch risky lines and shortages, then adjust quantity and offer price in Requested items.",
      action: null
    };
  }

  return {
    reply: "I can help with product discovery, filter setup, and fulfillment guidance. Try: 'Find Apple CPO in Miami 128GB'.",
    action: null
  };
}

function getAiAdminAnomalies() {
  const anomalies = [];

  const largeAdjustments = db.prepare(`
    SELECT ie.created_at AS createdAt, ie.device_id AS deviceId, ie.delta, ie.change_type AS changeType,
           d.model_name AS model, l.name AS location
    FROM inventory_events ie
    JOIN devices d ON d.id = ie.device_id
    JOIN locations l ON l.id = ie.location_id
    WHERE ABS(ie.delta) >= 50
    ORDER BY ie.created_at DESC
    LIMIT 12
  `).all();
  for (const row of largeAdjustments) {
    anomalies.push({
      type: "inventory_spike",
      severity: "high",
      message: `${row.model} at ${row.location} changed by ${Number(row.delta)} (${row.changeType})`,
      timestamp: row.createdAt
    });
  }

  const lowStock = db.prepare(`
    SELECT d.model_name AS model, COALESCE(SUM(di.quantity), 0) AS total
    FROM devices d
    LEFT JOIN device_inventory di ON di.device_id = d.id
    WHERE d.is_active = 1
    GROUP BY d.id, d.model_name
    HAVING total BETWEEN 1 AND 5
    ORDER BY total ASC, d.model_name ASC
    LIMIT 12
  `).all();
  for (const row of lowStock) {
    anomalies.push({
      type: "low_stock",
      severity: "medium",
      message: `${row.model} is low stock (${Number(row.total)} units total).`,
      timestamp: null
    });
  }

  if (!anomalies.length) {
    anomalies.push({
      type: "none",
      severity: "info",
      message: "No significant anomalies detected in current snapshot.",
      timestamp: null
    });
  }
  return anomalies.slice(0, 20);
}

function getAiSalesInsights(daysRaw) {
  const days = Math.max(1, Math.min(365, Number(daysRaw || 30)));
  const fromIso = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();
  const totals = db.prepare(`
    SELECT COUNT(*) AS requestCount, COALESCE(SUM(total_amount), 0) AS totalRevenue
    FROM quote_requests
    WHERE created_at >= ?
  `).get(fromIso);
  const byStatus = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM quote_requests
    WHERE created_at >= ?
    GROUP BY status
    ORDER BY count DESC, status ASC
  `).all(fromIso).map((r) => ({ status: r.status, count: Number(r.count || 0) }));
  const topModels = db.prepare(`
    SELECT qrl.model AS model, COALESCE(SUM(qrl.quantity), 0) AS qty
    FROM quote_request_lines qrl
    JOIN quote_requests qr ON qr.id = qrl.request_id
    WHERE qr.created_at >= ?
    GROUP BY qrl.model
    ORDER BY qty DESC, qrl.model ASC
    LIMIT 8
  `).all(fromIso).map((r) => ({ model: r.model, quantity: Number(r.qty || 0) }));

  return {
    rangeDays: days,
    requestCount: Number(totals?.requestCount || 0),
    totalRevenue: Number(totals?.totalRevenue || 0),
    byStatus,
    topModels
  };
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

function applyCatalogImageMappings() {
  const familyRows = db.prepare("SELECT model_family, COUNT(*) AS count FROM devices GROUP BY model_family ORDER BY model_family").all();
  const existingFamilies = new Set(familyRows.map((r) => r.model_family));
  const mappedFamilies = Object.keys(MODEL_IMAGE_MAP).filter((family) => existingFamilies.has(family));
  const unmatchedFamilies = [...existingFamilies].filter((family) => !MODEL_IMAGE_MAP[family]);

  const updateDevice = db.prepare("UPDATE devices SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE model_family = ?");
  const selectIds = db.prepare("SELECT id FROM devices WHERE model_family = ?");
  const deleteImages = db.prepare("DELETE FROM device_images WHERE device_id = ?");
  const insertImage = db.prepare("INSERT INTO device_images (device_id, image_url, sort_order) VALUES (?, ?, 0)");

  let updatedFamilies = 0;
  let updatedDeviceRows = 0;

  db.exec("BEGIN TRANSACTION");
  try {
    for (const family of mappedFamilies) {
      const imageUrl = MODEL_IMAGE_MAP[family];
      const updateResult = updateDevice.run(imageUrl, family);
      if (!updateResult.changes) continue;
      updatedFamilies += 1;
      const ids = selectIds.all(family);
      for (const row of ids) {
        deleteImages.run(row.id);
        insertImage.run(row.id, imageUrl);
        updatedDeviceRows += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    mappedFamilies: mappedFamilies.length,
    updatedFamilies,
    updatedDeviceRows,
    unmatchedFamilies
  };
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

function seedAdminRealDevicesPerCategory(countPerCategory) {
  const categories = db.prepare("SELECT id, name FROM categories").all();
  const categoryByName = new Map(categories.map((c) => [c.name, c.id]));
  const locations = db.prepare("SELECT id FROM locations ORDER BY id").all().map((l) => l.id);
  const manufacturerByName = new Map(
    db.prepare("SELECT id, name FROM manufacturers").all().map((m) => [m.name, m.id])
  );
  const ensureManufacturer = db.prepare("INSERT INTO manufacturers (name) VALUES (?)");
  const config = [
    {
      name: "Smartphones",
      models: [
        { family: "iPhone 15", manufacturer: "Apple" },
        { family: "iPhone 15 Pro", manufacturer: "Apple" },
        { family: "iPhone 15 Pro Max", manufacturer: "Apple" },
        { family: "Galaxy S24", manufacturer: "Samsung" },
        { family: "Pixel 8", manufacturer: "Google" },
        { family: "Pixel 8 Pro", manufacturer: "Google" },
        { family: "Motorola Edge 50", manufacturer: "Motorola" }
      ],
      storages: ["128GB", "256GB", "512GB", "1TB"],
      colors: ["Black", "Blue", "Gray", "Silver", "Green", "Pink"],
      grades: ["A", "B", "CPO", "RT"],
      basePrice: 420
    },
    {
      name: "Tablets",
      models: [
        { family: "iPad Pro 11", manufacturer: "Apple" },
        { family: "iPad Air 11", manufacturer: "Apple" },
        { family: "Galaxy Tab S9", manufacturer: "Samsung" },
        { family: "Galaxy Tab A9+", manufacturer: "Samsung" },
        { family: "Pixel Tablet", manufacturer: "Google" },
        { family: "Lenovo Tab P12", manufacturer: "Lenovo" }
      ],
      storages: ["64GB", "128GB", "256GB", "512GB"],
      colors: ["Gray", "Blue", "Silver", "Black", "Gold"],
      grades: ["A", "B", "CPO", "RT"],
      basePrice: 260
    },
    {
      name: "Laptops",
      models: [
        { family: "MacBook Air 13", manufacturer: "Apple" },
        { family: "MacBook Pro 14", manufacturer: "Apple" },
        { family: "Galaxy Book4 Pro", manufacturer: "Samsung" },
        { family: "ThinkPad X1 Carbon", manufacturer: "Lenovo" }
      ],
      storages: ["256GB", "512GB", "1TB", "2TB"],
      colors: ["Black", "Gray", "Silver", "Blue", "White"],
      grades: ["A", "B", "CPO", "RT"],
      basePrice: 740
    },
    {
      name: "Wearables",
      models: [
        { family: "Apple Watch Series 9", manufacturer: "Apple" },
        { family: "Watch Ultra 2", manufacturer: "Apple" },
        { family: "Galaxy Watch 6", manufacturer: "Samsung" },
        { family: "Pixel Watch 2", manufacturer: "Google" }
      ],
      storages: ["32GB", "64GB"],
      colors: ["Black", "Blue", "Silver", "Gray", "White"],
      grades: ["A", "B", "CPO", "RT"],
      basePrice: 180
    },
    {
      name: "Accessories",
      models: [
        { family: "AirPods Pro", manufacturer: "Apple" },
        { family: "Galaxy Buds2 Pro", manufacturer: "Samsung" },
        { family: "Apple 20W USB-C Power Adapter", manufacturer: "Apple" },
        { family: "Sony WH-1000XM5", manufacturer: "Sony" }
      ],
      storages: ["N/A"],
      colors: ["Black", "White", "Blue", "Gray", "Silver", "Green", "Pink"],
      grades: ["A", "B", "CPO", "RT"],
      basePrice: 45
    }
  ];

  const deviceInsert = db.prepare(`
    INSERT INTO devices (
      id, manufacturer_id, category_id, model_name, model_family, storage_capacity, grade, base_price,
      image_url, carrier, screen_size, modular, color, kit_type, product_notes, default_location_id, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
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
    db.exec("DELETE FROM devices WHERE id LIKE 'adminreal-%'");
    for (const cfg of config) {
      const categoryId = categoryByName.get(cfg.name);
      if (!categoryId) continue;
      const variants = [];
      for (let modelIdx = 0; modelIdx < cfg.models.length; modelIdx += 1) {
        const model = cfg.models[modelIdx];
        for (let storageIdx = 0; storageIdx < cfg.storages.length; storageIdx += 1) {
          const storage = cfg.storages[storageIdx];
          for (let colorIdx = 0; colorIdx < cfg.colors.length; colorIdx += 1) {
            const color = cfg.colors[colorIdx];
            for (let gradeIdx = 0; gradeIdx < cfg.grades.length; gradeIdx += 1) {
              const grade = cfg.grades[gradeIdx];
              variants.push({
                modelFamily: model.family,
                manufacturerName: model.manufacturer,
                storage,
                color,
                grade,
                modelIdx,
                storageIdx,
                colorIdx,
                gradeIdx
              });
            }
          }
        }
      }
      for (let i = 0; i < countPerCategory; i += 1) {
        const variant = variants[i % variants.length];
        const cycle = Math.floor(i / variants.length) + 1;
        const manufacturerName = variant.manufacturerName;
        let manufacturerId = manufacturerByName.get(manufacturerName);
        if (!manufacturerId) {
          manufacturerId = Number(ensureManufacturer.run(manufacturerName).lastInsertRowid);
          manufacturerByName.set(manufacturerName, manufacturerId);
        }
        const modelFamily = variant.modelFamily;
        const storage = variant.storage;
        const color = variant.color;
        const grade = variant.grade;
        const defaultLocationId = locations[i % locations.length];
        const id = `adminreal-${cfg.name.toLowerCase()}-${String(i + 1).padStart(4, "0")}`;
        const modelNameBase = storage === "N/A" ? `${modelFamily} - ${color}` : `${modelFamily} ${storage} - ${color}`;
        const modelName = cycle > 1 ? `${modelNameBase} v${cycle}` : modelNameBase;
        const price = Number((cfg.basePrice + (variant.modelIdx * 9) + (variant.storageIdx * 14) + (variant.gradeIdx * 11) + (variant.colorIdx % 7)).toFixed(2));
        const carrier = cfg.name === "Accessories" ? "Bluetooth" : (cfg.name === "Laptops" || cfg.name === "Tablets" ? "WiFi" : "Unlocked");
        const screenSize = cfg.name === "Wearables" ? "47 mm" : cfg.name === "Tablets" ? "11 inches" : cfg.name === "Laptops" ? "14 inches" : (cfg.name === "Accessories" ? "N/A" : "6.1 inches");
        const kitType = cfg.name === "Accessories" ? "Retail Pack" : "Full Kit";
        const uniqueSeed = (variant.modelIdx * 11) + (variant.storageIdx * 7) + (variant.colorIdx * 5) + (variant.gradeIdx * 3) + cycle;
        const seedImagePool = getSeedImagePool(cfg.name, modelFamily);
        const heroImage = seedImagePool.length ? seedImagePool[uniqueSeed % seedImagePool.length] : MODEL_IMAGE_MAP["iPhone 15"];
        const isShortageTestTarget = cfg.name === "Smartphones"
          && modelFamily === "iPhone 15"
          && storage === "128GB"
          && color === "Black"
          && grade === "A"
          && cycle === 1;

        deviceInsert.run(
          id,
          manufacturerId,
          categoryId,
          modelName,
          modelFamily,
          storage,
          grade,
          price,
          heroImage,
          carrier,
          screenSize,
          "No",
          color,
          kitType,
          `Admin realistic test device for ${cfg.name}.`,
          defaultLocationId
        );

        for (let locIdx = 0; locIdx < locations.length; locIdx += 1) {
          const qty = isShortageTestTarget && (locIdx === 0 || locIdx === 1)
            ? 0
            : 10 + ((i * 7 + locIdx * 11) % 120);
          inventoryInsert.run(id, locations[locIdx], qty);
        }
        const gallery = [heroImage];
        if (seedImagePool.length > 1) {
          const alt1 = seedImagePool[(uniqueSeed + 1) % seedImagePool.length];
          if (alt1 && !gallery.includes(alt1)) gallery.push(alt1);
        }
        if (seedImagePool.length > 2) {
          const alt2 = seedImagePool[(uniqueSeed + 2) % seedImagePool.length];
          if (alt2 && !gallery.includes(alt2)) gallery.push(alt2);
        }
        if (seedImagePool.length > 3) {
          const alt3 = seedImagePool[(uniqueSeed + 3) % seedImagePool.length];
          if (alt3 && !gallery.includes(alt3)) gallery.push(alt3);
        }
        gallery.forEach((img, idx) => imageInsert.run(id, img, idx + 1));
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

async function requestJson(url, options = {}) {
  const method = options.method || "GET";
  const headers = options.headers || {};
  const body = options.body || null;
  const contentType = options.contentType || null;

  const payload = await new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: contentType ? { ...headers, "Content-Type": contentType } : headers,
      rejectUnauthorized: !BOOMI_TLS_INSECURE
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        const status = Number(res.statusCode || 0);
        if (status < 200 || status >= 300) {
          reject(new Error(`External inventory request failed (${status}): ${String(data || "").slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(data || "{}"));
        } catch {
          reject(new Error("External inventory response was not valid JSON."));
        }
      });
    });
    req.on("error", (error) => {
      reject(new Error(`External inventory request error: ${error.message}`));
    });
    if (body) req.write(body);
    req.end();
  });

  return payload;
}

async function fetchInventoryOAuthToken() {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: INVENTORY_OAUTH_CLIENT_ID,
    client_secret: INVENTORY_OAUTH_CLIENT_SECRET,
    scope: INVENTORY_OAUTH_SCOPE
  }).toString();

  const tokenPayload = await requestJson(INVENTORY_OAUTH_TOKEN_URL, {
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body,
    headers: { Accept: "application/json" }
  });

  const accessToken = String(tokenPayload?.access_token || "").trim();
  if (!accessToken) {
    throw new Error("OAuth token response did not include access_token.");
  }
  return accessToken;
}

async function fetchBoomiInventory() {
  const oauthConfig = {
    INVENTORY_API_URL,
    INVENTORY_SUBSCRIPTION_KEY,
    INVENTORY_OAUTH_TOKEN_URL,
    INVENTORY_OAUTH_CLIENT_ID,
    INVENTORY_OAUTH_CLIENT_SECRET,
    INVENTORY_OAUTH_SCOPE
  };
  const oauthKeys = Object.keys(oauthConfig);
  const hasAnyOAuthConfig = oauthKeys.some((k) => String(oauthConfig[k] || "").trim().length > 0);
  const missingOAuthKeys = oauthKeys.filter((k) => !String(oauthConfig[k] || "").trim());
  const hasOAuthConfig = missingOAuthKeys.length === 0;

  if (hasAnyOAuthConfig && !hasOAuthConfig) {
    throw new Error(`Incomplete inventory OAuth configuration. Missing: ${missingOAuthKeys.join(", ")}`);
  }

  let payload;
  if (hasOAuthConfig) {
    const accessToken = await fetchInventoryOAuthToken();
    payload = await requestJson(INVENTORY_API_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "subscription-key": INVENTORY_SUBSCRIPTION_KEY
      }
    });
  } else {
    if (!BOOMI_CUSTOMER_ID || !BOOMI_BASIC_USERNAME || !BOOMI_BASIC_PASSWORD) {
      throw new Error("Inventory credentials are not configured. Set INVENTORY_* OAuth values (preferred) or BOOMI_* basic-auth values.");
    }
    payload = await requestJson(BOOMI_INVENTORY_URL, {
      method: "GET",
      headers: buildBoomiHeaders()
    });
  }

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

function normalizeRequestStatus(value, fallback = "New") {
  const normalized = String(value || "").trim();
  if (REQUEST_STATUS_VALUES.has(normalized)) return normalized;
  return fallback;
}

function validateRequestLines(linesRaw) {
  const lines = Array.isArray(linesRaw) ? linesRaw : [];
  if (!lines.length) {
    throw new Error("At least one request line is required.");
  }
  return lines.map((line, index) => {
    const deviceId = String(line.productId || line.deviceId || "").trim();
    const model = String(line.model || "").trim();
    const grade = String(line.grade || "").trim();
    const quantity = Number(line.quantity);
    const offerPrice = Number(line.offerPrice);
    const note = String(line.note || "").trim();
    if (!model) throw new Error(`Line ${index + 1}: model is required.`);
    if (!grade) throw new Error(`Line ${index + 1}: grade is required.`);
    if (!isInteger(quantity) || quantity < 1) throw new Error(`Line ${index + 1}: quantity must be an integer >= 1.`);
    if (!Number.isFinite(offerPrice) || offerPrice < 0) throw new Error(`Line ${index + 1}: offerPrice must be a number >= 0.`);
    return {
      deviceId: deviceId || null,
      model,
      grade,
      quantity,
      offerPrice: Number(offerPrice.toFixed(2)),
      note
    };
  });
}

function getNextRequestNumber() {
  const year = new Date().getFullYear();
  const prefix = `REQ-${year}-`;
  const row = db.prepare("SELECT COUNT(*) AS count FROM quote_requests WHERE request_number LIKE ?").get(`${prefix}%`);
  const next = Number(row?.count || 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

function getNextDummyEstimateNumber() {
  const year = new Date().getFullYear();
  const prefix = `EST-${year}-`;
  const row = db.prepare("SELECT COUNT(*) AS count FROM quote_requests WHERE netsuite_estimate_number LIKE ?").get(`${prefix}%`);
  const next = Number(row?.count || 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

function getRequestLines(requestId) {
  return db.prepare(`
    SELECT device_id, model, grade, quantity, offer_price, note
    FROM quote_request_lines
    WHERE request_id = ?
    ORDER BY id
  `).all(requestId).map((line) => ({
    productId: line.device_id || "",
    model: line.model,
    grade: line.grade,
    quantity: Number(line.quantity || 0),
    offerPrice: Number(line.offer_price || 0),
    note: line.note || ""
  }));
}

function mapRequestRow(row) {
  return {
    id: row.id,
    requestNumber: row.request_number,
    company: row.company,
    createdBy: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    total: Number(row.total_amount || 0),
    currencyCode: row.currency_code || "USD",
    netsuiteEstimateId: row.netsuite_estimate_id || null,
    netsuiteEstimateNumber: row.netsuite_estimate_number || null,
    netsuiteStatus: row.netsuite_status || null,
    netsuiteUpdatedAt: row.netsuite_last_sync_at || null,
    lines: getRequestLines(row.id)
  };
}

function getRequestsForUser(user) {
  const sql = user.role === "admin"
    ? "SELECT * FROM quote_requests ORDER BY created_at DESC"
    : "SELECT * FROM quote_requests WHERE company = ? ORDER BY created_at DESC";
  const rows = user.role === "admin" ? db.prepare(sql).all() : db.prepare(sql).all(user.company);
  return rows.map(mapRequestRow);
}

function getRequestByIdForUser(user, requestId) {
  const row = db.prepare("SELECT * FROM quote_requests WHERE id = ?").get(requestId);
  if (!row?.id) return null;
  if (user.role !== "admin" && row.company !== user.company) return null;
  return mapRequestRow(row);
}

function createRequestForUser(user, body) {
  const lines = validateRequestLines(body.lines);
  const requestId = randomBytes(16).toString("hex");
  const requestNumber = getNextRequestNumber();
  const total = Number(lines.reduce((sum, line) => sum + (line.quantity * line.offerPrice), 0).toFixed(2));

  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare(`
      INSERT INTO quote_requests (
        id, request_number, company, created_by_user_id, created_by_email, status, total_amount, currency_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'New', ?, 'USD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(requestId, requestNumber, user.company, user.id, user.email, total);

    const insertLine = db.prepare(`
      INSERT INTO quote_request_lines (
        request_id, device_id, model, grade, quantity, offer_price, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const line of lines) {
      insertLine.run(requestId, line.deviceId, line.model, line.grade, line.quantity, line.offerPrice, line.note || null);
    }

    db.prepare(`
      INSERT INTO quote_request_events (request_id, event_type, payload_json)
      VALUES (?, 'request_created', ?)
    `).run(requestId, JSON.stringify({ lineCount: lines.length, total }));

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getRequestByIdForUser(user, requestId);
}

function createDummyEstimateForRequest(user, requestId) {
  const row = db.prepare("SELECT * FROM quote_requests WHERE id = ?").get(requestId);
  if (!row?.id) {
    throw new Error("Request not found.");
  }
  if (user.role !== "admin" && row.company !== user.company) {
    throw new Error("Forbidden");
  }
  if (row.netsuite_estimate_id) {
    return mapRequestRow(row);
  }

  const estimateId = `dummy-est-${randomBytes(6).toString("hex")}`;
  const estimateNumber = getNextDummyEstimateNumber();
  const syncAt = new Date().toISOString();
  db.prepare(`
    UPDATE quote_requests
    SET status = 'Estimate Created',
        netsuite_estimate_id = ?,
        netsuite_estimate_number = ?,
        netsuite_status = 'Estimate Created',
        netsuite_last_sync_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(estimateId, estimateNumber, syncAt, requestId);
  db.prepare(`
    INSERT INTO quote_request_events (request_id, event_type, payload_json)
    VALUES (?, 'dummy_estimate_created', ?)
  `).run(requestId, JSON.stringify({ estimateId, estimateNumber, syncedAt: syncAt }));
  return getRequestByIdForUser(user, requestId);
}

function updateDummyEstimateStatus(user, requestId, nextStatus) {
  const row = db.prepare("SELECT * FROM quote_requests WHERE id = ?").get(requestId);
  if (!row?.id) {
    throw new Error("Request not found.");
  }
  if (user.role !== "admin" && row.company !== user.company) {
    throw new Error("Forbidden");
  }
  const status = normalizeRequestStatus(nextStatus, row.status || "New");
  const syncAt = new Date().toISOString();
  db.prepare(`
    UPDATE quote_requests
    SET status = ?,
        netsuite_status = ?,
        netsuite_last_sync_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, status, syncAt, requestId);
  db.prepare(`
    INSERT INTO quote_request_events (request_id, event_type, payload_json)
    VALUES (?, 'dummy_status_update', ?)
  `).run(requestId, JSON.stringify({ status, syncedAt: syncAt }));
  return getRequestByIdForUser(user, requestId);
}

const FILTER_FIELD_KEYS = ["manufacturer", "modelFamily", "grade", "region", "storage"];

function normalizeSavedFilterViewKey(raw) {
  const viewKey = String(raw || "category").trim().toLowerCase();
  if (!viewKey) return "category";
  return /^[a-z0-9_-]{1,32}$/.test(viewKey) ? viewKey : "category";
}

function sanitizeSavedFilterPayload(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const selectedCategory = String(input.selectedCategory || "").trim().slice(0, 80) || "Smartphones";
  const search = String(input.search || "").slice(0, 200);
  const sourceFilters = input.filters && typeof input.filters === "object" ? input.filters : {};
  const filters = {};
  for (const key of FILTER_FIELD_KEYS) {
    const values = Array.isArray(sourceFilters[key])
      ? sourceFilters[key].map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    if (values.length) {
      filters[key] = [...new Set(values)].slice(0, 100);
    }
  }
  return { selectedCategory, search, filters };
}

function mapSavedFilterRow(row) {
  let payload = {};
  try {
    payload = sanitizeSavedFilterPayload(JSON.parse(String(row.payload_json || "{}")));
  } catch {
    payload = sanitizeSavedFilterPayload({});
  }
  return {
    id: Number(row.id),
    viewKey: row.view_key,
    name: row.name,
    payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getSavedFiltersForUser(userId, viewKeyRaw) {
  const viewKey = normalizeSavedFilterViewKey(viewKeyRaw);
  const rows = db.prepare(`
    SELECT id, view_key, name, payload_json, created_at, updated_at
    FROM user_saved_filters
    WHERE user_id = ? AND view_key = ?
    ORDER BY updated_at DESC, name COLLATE NOCASE ASC
  `).all(userId, viewKey);
  return rows.map(mapSavedFilterRow);
}

function upsertSavedFilterForUser(userId, body) {
  const name = String(body.name || "").trim();
  if (!name) {
    throw new Error("name is required.");
  }
  if (name.length > 80) {
    throw new Error("name must be 80 characters or less.");
  }
  const viewKey = normalizeSavedFilterViewKey(body.viewKey);
  const payload = sanitizeSavedFilterPayload(body.payload);
  const payloadJson = JSON.stringify(payload);
  db.prepare(`
    INSERT INTO user_saved_filters (user_id, view_key, name, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, view_key, name)
    DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, viewKey, name, payloadJson);
  const row = db.prepare(`
    SELECT id, view_key, name, payload_json, created_at, updated_at
    FROM user_saved_filters
    WHERE user_id = ? AND view_key = ? AND name = ?
    LIMIT 1
  `).get(userId, viewKey, name);
  return mapSavedFilterRow(row);
}

function updateSavedFilterForUser(userId, filterIdRaw, body) {
  const filterId = Number(filterIdRaw);
  if (!Number.isInteger(filterId) || filterId < 1) {
    throw new Error("Saved filter not found.");
  }
  const existing = db.prepare(`
    SELECT id, view_key, name
    FROM user_saved_filters
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).get(filterId, userId);
  if (!existing?.id) {
    throw new Error("Saved filter not found.");
  }
  const viewKey = normalizeSavedFilterViewKey(body.viewKey || existing.view_key);
  if (viewKey !== existing.view_key) {
    throw new Error("Saved filter not found.");
  }
  const name = String(body.name || "").trim();
  if (!name) {
    throw new Error("name is required.");
  }
  if (name.length > 80) {
    throw new Error("name must be 80 characters or less.");
  }
  const payload = sanitizeSavedFilterPayload(body.payload);
  const payloadJson = JSON.stringify(payload);
  try {
    db.prepare(`
      UPDATE user_saved_filters
      SET name = ?, payload_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(name, payloadJson, filterId, userId);
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("UNIQUE constraint failed")) {
      throw new Error("Saved filter name already exists.");
    }
    throw error;
  }
  const row = db.prepare(`
    SELECT id, view_key, name, payload_json, created_at, updated_at
    FROM user_saved_filters
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).get(filterId, userId);
  return mapSavedFilterRow(row);
}

function deleteSavedFilterForUser(userId, filterIdRaw) {
  const filterId = Number(filterIdRaw);
  if (!Number.isInteger(filterId) || filterId < 1) {
    throw new Error("Saved filter not found.");
  }
  const row = db.prepare("SELECT id FROM user_saved_filters WHERE id = ? AND user_id = ?").get(filterId, userId);
  if (!row?.id) {
    throw new Error("Saved filter not found.");
  }
  db.prepare("DELETE FROM user_saved_filters WHERE id = ? AND user_id = ?").run(filterId, userId);
}

initDb();

const server = createServer(async (req, res) => {
  try {
    if (!req.url) {
      json(req, res, 400, { error: "Bad request" });
      return;
    }

    if (req.method === "OPTIONS") {
      json(req, res, 204, {});
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (tryServeFrontend(req, res, url)) {
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      json(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/openapi.yaml") {
      if (!existsSync(openApiPath)) {
        json(req, res, 404, { error: "OpenAPI spec not found." });
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
        json(req, res, 400, { error: "Email, company and password are required." });
        return;
      }

      if (!isPasswordValid(password)) {
        json(req, res, 400, { error: "Password must be at least 8 chars and include uppercase, number, and special character." });
        return;
      }

      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing?.id) {
        json(req, res, 409, { error: "User already exists." });
        return;
      }

      const passwordHash = hashPassword(password);
      db.prepare("INSERT INTO users (email, company, role, password_hash, is_active) VALUES (?, ?, 'buyer', ?, 0)")
        .run(email, company, passwordHash);
      json(req, res, 201, { ok: true });
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
        json(req, res, 401, { error: "Invalid email or password." });
        return;
      }
      if (Number(row.is_active) !== 1) {
        json(req, res, 200, { pendingApproval: true, email: row.email, company: row.company });
        return;
      }

      const issued = createSession(row);
      const refreshToken = issueRefreshToken(row.id);
      json(req, res, 200, { token: issued.token, refreshToken, accessTokenExpiresAt: new Date(issued.expiresAt).toISOString(), user: makePublicUser(row) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/refresh") {
      const body = await parseBody(req);
      const refreshToken = String(body.refreshToken || "").trim();
      if (!refreshToken) {
        json(req, res, 400, { error: "Refresh token is required." });
        return;
      }

      const rotated = rotateRefreshToken(refreshToken);
      if (!rotated?.userId) {
        json(req, res, 401, { error: "Invalid or expired refresh token." });
        return;
      }

      const row = db.prepare(
        "SELECT id, email, company, role, is_active, created_at FROM users WHERE id = ?"
      ).get(rotated.userId);
      if (!row?.id || Number(row.is_active) !== 1) {
        json(req, res, 401, { error: "User is not active." });
        return;
      }

      const issued = createSession(row);
      json(req, res, 200, { token: issued.token, refreshToken: rotated.refreshToken, accessTokenExpiresAt: new Date(issued.expiresAt).toISOString(), user: makePublicUser(row) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const token = getAuthToken(req);
      if (token) {
        sessions.delete(token);
      }
      const body = await parseBody(req);
      const refreshToken = String(body.refreshToken || "").trim();
      if (refreshToken) {
        revokeRefreshToken(refreshToken);
      }
      json(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/request-password-reset") {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      if (!email) {
        json(req, res, 400, { error: "Email is required." });
        return;
      }
      const row = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (row?.id) {
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        db.prepare("UPDATE users SET reset_code = ?, reset_code_expires_at = ? WHERE id = ?")
          .run(DEMO_RESET_CODE, expiresAt, row.id);
      }
      json(req, res, 200, {
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
        json(req, res, 400, { error: "Email, verification code and new password are required." });
        return;
      }
      if (!/^\d{6}$/.test(code)) {
        json(req, res, 400, { error: "Verification code must be 6 digits." });
        return;
      }
      if (!isPasswordValid(newPassword)) {
        json(req, res, 400, { error: "Password must be at least 8 chars and include uppercase, number, and special character." });
        return;
      }

      const row = db.prepare(
        "SELECT id, reset_code, reset_code_expires_at FROM users WHERE email = ?"
      ).get(email);
      if (!row?.id || !row.reset_code || row.reset_code !== code) {
        json(req, res, 400, { error: "Invalid verification code." });
        return;
      }
      if (!row.reset_code_expires_at || new Date(row.reset_code_expires_at).getTime() < Date.now()) {
        json(req, res, 400, { error: "Verification code expired. Please request a new code." });
        return;
      }

      const passwordHash = hashPassword(newPassword);
      db.prepare("UPDATE users SET password_hash = ?, reset_code = NULL, reset_code_expires_at = NULL WHERE id = ?")
        .run(passwordHash, row.id);
      json(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      json(req, res, 200, { user });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const users = db.prepare(
        "SELECT id, email, company, role, is_active, created_at FROM users ORDER BY created_at DESC"
      ).all().map(makePublicUser);
      json(req, res, 200, users);
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
        json(req, res, 400, { error: "Email, company and password are required." });
        return;
      }
      if (!isPasswordValid(password)) {
        json(req, res, 400, { error: "Password must be at least 8 chars and include uppercase, number, and special character." });
        return;
      }
      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing?.id) {
        json(req, res, 409, { error: "User already exists." });
        return;
      }

      const role = isAdmin ? "admin" : "buyer";
      const hash = hashPassword(password);
      db.prepare("INSERT INTO users (email, company, role, password_hash, is_active) VALUES (?, ?, ?, ?, ?)")
        .run(email, company, role, hash, isActive ? 1 : 0);
      json(req, res, 201, { ok: true });
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
        json(req, res, 400, { error: "No valid fields to update." });
        return;
      }
      params.push(userId);
      db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params);
      json(req, res, 200, { ok: true });
      return;
    }

    const userDeleteMatch = url.pathname.match(/^\/api\/users\/(\d+)$/);
    if (req.method === "DELETE" && userDeleteMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const userId = Number(userDeleteMatch[1]);
      if (user.id === userId) {
        json(req, res, 400, { error: "You cannot delete your own admin user." });
        return;
      }
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      json(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/categories") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      json(req, res, 200, getCategories());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/devices") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      json(req, res, 200, getDevices(url));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ai/parse-filters") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      json(req, res, 200, parseAiFilters(body.prompt, body.selectedCategory));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ai/validate-request") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      json(req, res, 200, validateRequestWithAi(body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ai/validate-netsuite-payload") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      json(req, res, 200, validateNetsuitePayloadWithAi(body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ai/copilot") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      json(req, res, 200, runAiCopilot(user, body));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/ai/admin/anomalies") {
      const user = requireAdmin(req, res);
      if (!user) return;
      json(req, res, 200, { anomalies: getAiAdminAnomalies() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/ai/admin/sales-insights") {
      const user = requireAdmin(req, res);
      if (!user) return;
      json(req, res, 200, getAiSalesInsights(url.searchParams.get("days")));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/filters/saved") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const viewKey = url.searchParams.get("view") || "category";
      json(req, res, 200, getSavedFiltersForUser(user.id, viewKey));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/filters/saved") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      try {
        const savedFilter = upsertSavedFilterForUser(user.id, body);
        json(req, res, 200, savedFilter);
      } catch (error) {
        json(req, res, 400, { error: error.message || "Failed to save filter." });
      }
      return;
    }

    const savedFilterByIdMatch = url.pathname.match(/^\/api\/filters\/saved\/([^/]+)$/);
    if (req.method === "PATCH" && savedFilterByIdMatch) {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      const filterId = decodeURIComponent(savedFilterByIdMatch[1]);
      try {
        const savedFilter = updateSavedFilterForUser(user.id, filterId, body);
        json(req, res, 200, savedFilter);
      } catch (error) {
        const message = error.message || "Failed to update saved filter.";
        const statusCode = message === "Saved filter not found."
          ? 404
          : (message === "Saved filter name already exists." ? 409 : 400);
        json(req, res, statusCode, { error: message });
      }
      return;
    }

    if (req.method === "DELETE" && savedFilterByIdMatch) {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const filterId = decodeURIComponent(savedFilterByIdMatch[1]);
      try {
        deleteSavedFilterForUser(user.id, filterId);
        json(req, res, 200, { ok: true });
      } catch (error) {
        const message = error.message || "Failed to delete saved filter.";
        const statusCode = message === "Saved filter not found." ? 404 : 400;
        json(req, res, statusCode, { error: message });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/requests") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      json(req, res, 200, getRequestsForUser(user));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/requests") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      try {
        const request = createRequestForUser(user, body);
        json(req, res, 201, request);
      } catch (error) {
        json(req, res, 400, { error: error.message || "Failed to create request." });
      }
      return;
    }

    const requestByIdMatch = url.pathname.match(/^\/api\/requests\/([^/]+)$/);
    if (req.method === "GET" && requestByIdMatch) {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const requestId = decodeURIComponent(requestByIdMatch[1]);
      const request = getRequestByIdForUser(user, requestId);
      if (!request) {
        json(req, res, 404, { error: "Request not found." });
        return;
      }
      json(req, res, 200, request);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/integrations/netsuite/estimates/dummy") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      const requestId = String(body.requestId || "").trim();
      if (!requestId) {
        json(req, res, 400, { error: "requestId is required." });
        return;
      }
      try {
        const request = createDummyEstimateForRequest(user, requestId);
        json(req, res, 200, { ok: true, request });
      } catch (error) {
        const message = error.message || "Failed to create dummy estimate.";
        const statusCode = message === "Request not found." ? 404 : (message === "Forbidden" ? 403 : 400);
        json(req, res, statusCode, { error: message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/integrations/netsuite/estimates/dummy/status") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      const requestId = String(body.requestId || "").trim();
      const status = String(body.status || "").trim();
      if (!requestId) {
        json(req, res, 400, { error: "requestId is required." });
        return;
      }
      if (!REQUEST_STATUS_VALUES.has(status)) {
        json(req, res, 400, { error: "status must be one of: New, Received, Estimate Created, Completed." });
        return;
      }
      try {
        const request = updateDummyEstimateStatus(user, requestId, status);
        json(req, res, 200, { ok: true, request });
      } catch (error) {
        const message = error.message || "Failed to update dummy estimate status.";
        const statusCode = message === "Request not found." ? 404 : (message === "Forbidden" ? 403 : 400);
        json(req, res, statusCode, { error: message });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/weekly-special-banner") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      json(req, res, 200, { enabled: getBooleanAppSetting("weekly_special_banner_enabled", false) });
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/admin/weekly-special-banner") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const body = await parseBody(req);
      if (typeof body.enabled !== "boolean") {
        json(req, res, 400, { error: "enabled must be boolean." });
        return;
      }
      setBooleanAppSetting("weekly_special_banner_enabled", body.enabled);
      json(req, res, 200, { ok: true, enabled: body.enabled });
      return;
    }

    const weeklySpecialMatch = url.pathname.match(/^\/api\/admin\/devices\/([^/]+)\/weekly-special$/);
    if (req.method === "PATCH" && weeklySpecialMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const body = await parseBody(req);
      if (typeof body.weeklySpecial !== "boolean") {
        json(req, res, 400, { error: "weeklySpecial must be boolean." });
        return;
      }
      const deviceId = decodeURIComponent(weeklySpecialMatch[1]);
      const result = db.prepare("UPDATE devices SET weekly_special = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(body.weeklySpecial ? 1 : 0, deviceId);
      if (!result.changes) {
        json(req, res, 404, { error: "Device not found." });
        return;
      }
      json(req, res, 200, { ok: true, deviceId, weeklySpecial: body.weeklySpecial });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/integrations/boomi/inventory/sync") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const rows = await fetchBoomiInventory();
      const { processed, skipped } = syncBoomiInventoryRows(rows);
      json(req, res, 200, {
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
      json(req, res, 200, { ok: true, removedDevices: before.devices, removedRawRows: before.raw });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/catalog/seed-test") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const countPerCategory = Math.max(1, Math.min(5000, Number(body.countPerCategory || 500)));
      const result = seedAdminTestDevicesPerCategory(countPerCategory);
      json(req, res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/catalog/seed-real") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const countPerCategory = Math.max(1, Math.min(1000, Number(body.countPerCategory || 100)));
      const result = seedAdminRealDevicesPerCategory(countPerCategory);
      json(req, res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/catalog/apply-image-mapping") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const result = applyCatalogImageMappings();
      json(req, res, 200, { ok: true, ...result });
      return;
    }

    const inventoryByDeviceMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)$/);
    if (req.method === "GET" && inventoryByDeviceMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const deviceId = decodeURIComponent(inventoryByDeviceMatch[1]);
      const inventory = getInventoryByDeviceId(deviceId);
      if (!inventory) {
        json(req, res, 404, { error: "Device not found." });
        return;
      }
      json(req, res, 200, inventory);
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
        json(req, res, 400, { error: "Quantity must be an integer >= 0." });
        return;
      }
      if (!getDeviceExists(deviceId)) {
        json(req, res, 404, { error: "Device not found." });
        return;
      }
      if (!getLocationExists(locationId)) {
        json(req, res, 404, { error: "Location not found." });
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

      json(req, res, 200, { ok: true, deviceId, locationId, quantity });
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
        json(req, res, 400, { error: "Delta must be a non-zero integer." });
        return;
      }
      if (!getDeviceExists(deviceId)) {
        json(req, res, 404, { error: "Device not found." });
        return;
      }
      if (!getLocationExists(locationId)) {
        json(req, res, 404, { error: "Location not found." });
        return;
      }

      const previousQuantity = getInventoryQuantity(deviceId, locationId);
      const newQuantity = previousQuantity + delta;
      if (newQuantity < 0) {
        json(req, res, 400, { error: "Adjustment would result in negative quantity." });
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

      json(req, res, 200, { ok: true, deviceId, locationId, previousQuantity, newQuantity, delta });
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
        json(req, res, 400, { error: "Mode must be 'set' or 'adjust'." });
        return;
      }
      if (!updates.length) {
        json(req, res, 400, { error: "Updates array is required." });
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
        json(req, res, 400, { error: "Validation failed", details: errors });
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

      json(req, res, 200, { ok: true, processed: updates.length, failed: 0 });
      return;
    }

    json(req, res, 404, { error: "Not found" });
  } catch (error) {
    json(req, res, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`API running on http://127.0.0.1:${port}`);
});

