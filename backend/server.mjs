import { createServer } from "node:http";
import https from "node:https";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createRemoteJWKSet, jwtVerify } from "jose";
import pgPkg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const IS_RENDER_RUNTIME = String(process.env.RENDER || "").toLowerCase() === "true" || Boolean(process.env.RENDER_SERVICE_ID);

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
const defaultDbPath = IS_RENDER_RUNTIME ? "/var/data/catalog.sqlite" : join(dbDir, "catalog.sqlite");
const dbPath = String(process.env.DB_PATH || "").trim() || defaultDbPath;
const DB_ENGINE = String(process.env.DB_ENGINE || "sqlite").trim().toLowerCase();
const POSTGRES_URL = String(process.env.DATABASE_URL || "").trim();
const PG_SCHEMA = String(process.env.PG_SCHEMA || "public").trim() || "public";
const schemaPath = join(dbDir, "schema.sql");
const seedPath = join(dbDir, "seed.sql");
const distDir = join(projectRoot, "dist");
const docsDir = join(projectRoot, "docs");
const openApiPath = join(docsDir, "openapi.yaml");
const port = Number(process.env.PORT || process.env.API_PORT || 8787);

const ADMIN_EMAIL = "thomas.torvund@pcsww.com";
const ADMIN_PASSWORD = "AdminPassword123!";
const DEFAULT_BUYER_EMAIL = "ekrem.ersayin@pcsww.com";

if (DB_ENGINE !== "postgres") {
  throw new Error("SQLite runtime has been removed. Set DB_ENGINE=postgres.");
}
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
  "Galaxy Book4 Pro": "/device-fallback.png",
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
    "/device-fallback.png",
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
const INVENTORY_SUBSCRIPTION_HEADER = String(process.env.INVENTORY_SUBSCRIPTION_HEADER || "subscription-key").trim() || "subscription-key";
const INVENTORY_OAUTH_TOKEN_URL = process.env.INVENTORY_OAUTH_TOKEN_URL || "";
const INVENTORY_OAUTH_CLIENT_ID = process.env.INVENTORY_OAUTH_CLIENT_ID || "";
const INVENTORY_OAUTH_CLIENT_SECRET = process.env.INVENTORY_OAUTH_CLIENT_SECRET || "";
const INVENTORY_OAUTH_SCOPE = process.env.INVENTORY_OAUTH_SCOPE || "";
const INVENTORY_OAUTH_RESOURCE = process.env.INVENTORY_OAUTH_RESOURCE || "";
const INVENTORY_OAUTH_AUDIENCE = process.env.INVENTORY_OAUTH_AUDIENCE || "";
const INVENTORY_OAUTH_CLIENT_AUTH_MODE = String(process.env.INVENTORY_OAUTH_CLIENT_AUTH_MODE || "body").trim().toLowerCase();
const NETSUITE_AI_REVIEW_RESTLET_URL = String(process.env.NETSUITE_AI_REVIEW_RESTLET_URL || "").trim();
const NETSUITE_AI_REVIEW_AUTH_HEADER = String(process.env.NETSUITE_AI_REVIEW_AUTH_HEADER || "").trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_BASE_URL = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
const AI_COPILOT_MODEL = String(process.env.AI_COPILOT_MODEL || "gpt-4o-mini").trim();
const AI_COPILOT_REAL_MODEL_ENABLED = String(process.env.AI_COPILOT_REAL_MODEL_ENABLED || (OPENAI_API_KEY ? "true" : "false")).toLowerCase() === "true";
const AI_COPILOT_DEBUG_ERRORS = String(process.env.AI_COPILOT_DEBUG_ERRORS || "false").toLowerCase() === "true";
const AUTH0_DOMAIN = String(process.env.AUTH0_DOMAIN || process.env.VITE_AUTH0_DOMAIN || "").trim();
const AUTH0_AUDIENCE = String(process.env.AUTH0_AUDIENCE || process.env.VITE_AUTH0_AUDIENCE || "").trim();
const AUTH0_ISSUER = String(process.env.AUTH0_ISSUER || (AUTH0_DOMAIN ? `https://${AUTH0_DOMAIN}/` : "")).trim();
const AUTH0_MGMT_CLIENT_ID = String(process.env.AUTH0_MGMT_CLIENT_ID || "").trim();
const AUTH0_MGMT_CLIENT_SECRET = String(process.env.AUTH0_MGMT_CLIENT_SECRET || "").trim();
const AUTH0_MGMT_AUDIENCE = String(process.env.AUTH0_MGMT_AUDIENCE || (AUTH0_DOMAIN ? `https://${AUTH0_DOMAIN}/api/v2/` : "")).trim();
const AUTH0_AUTO_SYNC_USERS = String(process.env.AUTH0_AUTO_SYNC_USERS || "true").toLowerCase() === "true";
const AUTH0_SYNC_PAGE_SIZE = Math.max(1, Math.min(100, Number(process.env.AUTH0_SYNC_PAGE_SIZE || 50)));
const AUTH0_SYNC_THROTTLE_MS = Math.max(10_000, Number(process.env.AUTH0_SYNC_THROTTLE_MS || 120_000));
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
const auth0UserSyncState = {
  running: false,
  lastRunAt: 0,
  lastResult: null
};
let auth0Jwks = null;
const REQUEST_STATUS_VALUES = new Set(["New", "Received", "Estimate Created", "Completed"]);
const HISTORICAL_ESTIMATE_SEED_KEY = "historical_completed_estimates_seed_v1";
const LOCATION_MAPPING_CSV_PATH = String(process.env.LOCATION_MAPPING_CSV_PATH || join(dbDir, "Locations936.csv")).trim();
const GRADE_DEFINITIONS = [
  {
    code: "C2",
    title: "Cosmetic Category C2",
    summary: "Heavy cosmetic wear and/or visible damage, typically including deep scratches and chips.",
    details: "Based on common secondary-market interpretations of REC/CTIA cosmetic mappings. Confirm acceptance thresholds with internal QA SOP.",
    source: "CTIA Wireless Device Grading Scales v5.0 (REC mapping context)",
    placeholder: false
  },
  {
    code: "C4",
    title: "Cosmetic Category C4",
    summary: "Fair condition with significant cosmetic wear, but generally not severe structural breakage.",
    details: "Often treated as lower resale cosmetic quality. Exact defect limits vary by trading partner.",
    source: "CTIA Wireless Device Grading Scales v5.0 (REC mapping context)",
    placeholder: false
  },
  {
    code: "C5",
    title: "Cosmetic Category C5",
    summary: "Good/used condition with visible but moderate wear and tear.",
    details: "Common for value-tier resale where cosmetic perfection is not required.",
    source: "CTIA Wireless Device Grading Scales v5.0 (REC mapping context)",
    placeholder: false
  },
  {
    code: "C6",
    title: "Cosmetic Category C6",
    summary: "Very good to like-new cosmetic appearance with light wear.",
    details: "Frequently mapped near top cosmetic classes in secondary markets, depending on strictness.",
    source: "CTIA Wireless Device Grading Scales v5.0 (REC mapping context)",
    placeholder: false
  },
  {
    code: "COB",
    title: "COB",
    summary: "Placeholder: likely an Open Box-related commercial code.",
    details: "Confirm internal meaning (for example: Customer Open Box vs Certified Open Box) before operational use.",
    source: "Placeholder - internal definition required",
    placeholder: true
  },
  {
    code: "CPO",
    title: "Certified Pre-Owned",
    summary: "Used device restored/tested to a high standard, typically close to like-new and warranty-backed by seller program.",
    details: "CPO meaning depends on seller program rules (testing, cosmetic threshold, battery threshold, accessories, warranty).",
    source: "Common industry usage (CPO programs)",
    placeholder: false
  },
  {
    code: "CRC",
    title: "CRC",
    summary: "Placeholder grade code.",
    details: "No reliable public standard matched this acronym in handset grading. Define internally.",
    source: "Placeholder - internal definition required",
    placeholder: true
  },
  {
    code: "CRD",
    title: "CRD",
    summary: "Placeholder grade code.",
    details: "No reliable public standard matched this acronym in handset grading. Define internally.",
    source: "Placeholder - internal definition required",
    placeholder: true
  },
  {
    code: "CRX",
    title: "CRX",
    summary: "Placeholder grade code.",
    details: "No reliable public standard matched this acronym in handset grading. Define internally.",
    source: "Placeholder - internal definition required",
    placeholder: true
  },
  {
    code: "D2",
    title: "D2",
    summary: "Placeholder: likely a deeper damage/defect tier code.",
    details: "Potentially tied to a partner-specific damage matrix. Confirm exact pass/fail requirements internally.",
    source: "Placeholder - internal definition required",
    placeholder: true
  },
  {
    code: "D3",
    title: "D3",
    summary: "Placeholder: likely a deeper damage/defect tier code.",
    details: "Potentially tied to a partner-specific damage matrix. Confirm exact pass/fail requirements internally.",
    source: "Placeholder - internal definition required",
    placeholder: true
  },
  {
    code: "D4",
    title: "D4",
    summary: "Placeholder: likely a deeper damage/defect tier code.",
    details: "Potentially tied to a partner-specific damage matrix. Confirm exact pass/fail requirements internally.",
    source: "Placeholder - internal definition required",
    placeholder: true
  },
  {
    code: "MD A",
    title: "MD A",
    summary: "Placeholder: likely an internal/partner Master Dealer condition code.",
    details: "No universal public definition found. Confirm internally before exposing in contracts.",
    source: "Placeholder - internal definition required",
    placeholder: true
  },
  {
    code: "MD B",
    title: "MD B",
    summary: "Placeholder: likely an internal/partner Master Dealer condition code.",
    details: "No universal public definition found. Confirm internally before exposing in contracts.",
    source: "Placeholder - internal definition required",
    placeholder: true
  },
  {
    code: "TBG",
    title: "TBG",
    summary: "Placeholder: likely To Be Graded.",
    details: "Often used operationally before a final cosmetic/functional grade is assigned. Confirm internal workflow definition.",
    source: "Placeholder - internal definition required",
    placeholder: true
  },
  {
    code: "TBG FIN",
    title: "TBG FIN",
    summary: "Placeholder code.",
    details: "Likely a finalized step in a TBG flow. Confirm exact process meaning internally.",
    source: "Placeholder - internal definition required",
    placeholder: true
  },
  {
    code: "TBG2",
    title: "TBG2",
    summary: "Placeholder code.",
    details: "Likely a second stage in a To Be Graded workflow. Confirm exact process meaning internally.",
    source: "Placeholder - internal definition required",
    placeholder: true
  }
];
const GRADE_DEFINITION_BY_CODE = new Map(GRADE_DEFINITIONS.map((item) => [String(item.code || "").toUpperCase(), item]));

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function loadPcsLocationMap(csvPath) {
  const map = new Map();
  if (!csvPath || !existsSync(csvPath)) {
    console.warn(`[startup] PCS location mapping file not found at ${csvPath}. Using stored location names.`);
    return map;
  }
  try {
    const raw = readFileSync(csvPath, "utf8");
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return map;
    const headers = parseCsvLine(lines[0]).map((value) => String(value || "").trim().toLowerCase());
    const internalIdIndex = headers.indexOf("internal id");
    const pcsPhysicalLocationIndex = headers.indexOf("pcs physical location");
    if (internalIdIndex < 0 || pcsPhysicalLocationIndex < 0) {
      console.warn("[startup] PCS location mapping CSV is missing required columns: Internal ID and PCS Physical Location.");
      return map;
    }
    for (let i = 1; i < lines.length; i += 1) {
      const values = parseCsvLine(lines[i]);
      const internalId = String(values[internalIdIndex] || "").trim();
      const pcsPhysicalLocation = String(values[pcsPhysicalLocationIndex] || "").trim();
      if (!internalId || !pcsPhysicalLocation) continue;
      map.set(internalId, pcsPhysicalLocation);
    }
    console.log(`[startup] Loaded ${map.size} PCS location mappings from ${csvPath}`);
  } catch (error) {
    console.warn(`[startup] Failed to load PCS location mapping from ${csvPath}: ${error.message || error}`);
  }
  return map;
}

const PCS_LOCATION_BY_INTERNAL_ID = loadPcsLocationMap(LOCATION_MAPPING_CSV_PATH);

function getDisplayLocationName(storedName, externalId) {
  const key = String(externalId || "").trim();
  const mapped = key ? PCS_LOCATION_BY_INTERNAL_ID.get(key) : "";
  return mapped || String(storedName || "").trim();
}

const effectiveDbEngine = DB_ENGINE === "postgres" ? "postgres" : "sqlite";
const POSTGRES_STRICT_RUNTIME = (effectiveDbEngine === "postgres");
if (effectiveDbEngine === "postgres" && !POSTGRES_URL) {
  throw new Error("Postgres runtime requested but DATABASE_URL is missing.");
}
const { Client } = pgPkg;
const sqliteDb = new DatabaseSync(dbPath);
let db = sqliteDb;
let pgClient = null;
const adminSeedRealJob = {
  running: false,
  startedAt: null,
  finishedAt: null,
  error: "",
  totalPlanned: 0,
  processed: 0,
  categoriesSeeded: 0,
  countPerCategory: 0
};
const boomiSyncJob = {
  running: false,
  startedAt: null,
  finishedAt: null,
  stage: "idle",
  error: "",
  fetched: 0,
  processed: 0,
  skipped: 0
};
const BOOMI_SYNC_PROGRESS_EVERY = Math.max(1, Number.parseInt(String(process.env.BOOMI_SYNC_PROGRESS_EVERY || "25"), 10) || 25);
const BOOMI_SYNC_PG_CHUNK_SIZE = Math.max(50, Math.min(1000, Number.parseInt(String(process.env.BOOMI_SYNC_PG_CHUNK_SIZE || "500"), 10) || 500));
if (IS_RENDER_RUNTIME && !String(dbPath).startsWith("/var/data/")) {
  console.warn(`[startup] Render runtime detected but DB_PATH is not using persistent disk: ${dbPath}`);
} else {
  console.log(`[startup] Using SQLite DB path: ${dbPath}`);
}
console.log(`[startup] Database engine: ${effectiveDbEngine}`);
if (POSTGRES_STRICT_RUNTIME) {
  console.log("[startup] Postgres strict runtime: SQLite fallback is disabled.");
}

function createNoSqliteFallbackAdapter() {
  const throwDisabled = () => {
    throw new Error("SQLite fallback is disabled in Postgres strict runtime.");
  };
  return {
    exec: throwDisabled,
    prepare: () => ({
      get: throwDisabled,
      all: throwDisabled,
      run: throwDisabled
    })
  };
}

function quoteIdent(name) {
  return `"${String(name || "").replace(/"/g, "\"\"")}"`;
}

function postgresTableRef(tableName) {
  return `${quoteIdent(PG_SCHEMA)}.${quoteIdent(tableName)}`;
}

async function insertRowsPostgres(tableRef, columns, rows, chunkSize = 250) {
  if (!pgClient) return;
  if (!Array.isArray(rows) || rows.length === 0) return;
  const safeColumns = (Array.isArray(columns) ? columns : []).map((name) => String(name || "").trim()).filter(Boolean);
  if (!safeColumns.length) return;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    if (!chunk.length) continue;
    const values = [];
    const marks = [];
    for (let rowIdx = 0; rowIdx < chunk.length; rowIdx += 1) {
      const row = chunk[rowIdx];
      const rowMarks = [];
      for (let colIdx = 0; colIdx < safeColumns.length; colIdx += 1) {
        values.push(Array.isArray(row) ? row[colIdx] : null);
        rowMarks.push(`$${values.length}`);
      }
      marks.push(`(${rowMarks.join(", ")})`);
    }
    const sql = `INSERT INTO ${tableRef} (${safeColumns.map((c) => quoteIdent(c)).join(", ")}) VALUES ${marks.join(", ")}`;
    await pgClient.query(sql, values);
  }
}

async function ensurePostgresRuntimeSchema() {
  if (!pgClient) return;
  await pgClient.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(PG_SCHEMA)}`);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${postgresTableRef("users")} (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      company TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'buyer')),
      password_hash TEXT NOT NULL,
      is_active BIGINT NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pgClient.query(`ALTER TABLE ${postgresTableRef("users")} ADD COLUMN IF NOT EXISTS reset_code TEXT`);
  await pgClient.query(`ALTER TABLE ${postgresTableRef("users")} ADD COLUMN IF NOT EXISTS reset_code_expires_at TEXT`);
  await pgClient.query(`ALTER TABLE ${postgresTableRef("users")} ADD COLUMN IF NOT EXISTS auth0_sub TEXT`);
  await pgClient.query(`ALTER TABLE ${postgresTableRef("users")} ADD COLUMN IF NOT EXISTS first_name TEXT`);
  await pgClient.query(`ALTER TABLE ${postgresTableRef("users")} ADD COLUMN IF NOT EXISTS last_name TEXT`);
  await pgClient.query(`ALTER TABLE ${postgresTableRef("users")} ADD COLUMN IF NOT EXISTS registration_completed BIGINT NOT NULL DEFAULT 0`);
  await pgClient.query(`ALTER TABLE ${postgresTableRef("users")} ADD COLUMN IF NOT EXISTS login_count BIGINT NOT NULL DEFAULT 0`);
  await pgClient.query(`ALTER TABLE ${postgresTableRef("users")} ADD COLUMN IF NOT EXISTS last_login_at TEXT`);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${postgresTableRef("refresh_tokens")} (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES ${postgresTableRef("users")}(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT,
      revoked_at TEXT,
      replaced_by_hash TEXT
    )
  `);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON ${postgresTableRef("refresh_tokens")} (user_id)`);
  await pgClient.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth0_sub ON ${postgresTableRef("users")} (auth0_sub)`);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${postgresTableRef("quote_requests")} (
      id TEXT PRIMARY KEY,
      request_number TEXT NOT NULL UNIQUE,
      company TEXT NOT NULL,
      created_by_user_id BIGINT REFERENCES ${postgresTableRef("users")}(id),
      created_by_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'New',
      total_amount DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
      currency_code TEXT NOT NULL DEFAULT 'USD',
      netsuite_estimate_id TEXT,
      netsuite_estimate_number TEXT,
      netsuite_status TEXT,
      netsuite_last_sync_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${postgresTableRef("quote_request_lines")} (
      id BIGSERIAL PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES ${postgresTableRef("quote_requests")}(id) ON DELETE CASCADE,
      device_id TEXT,
      model TEXT NOT NULL,
      grade TEXT NOT NULL,
      quantity BIGINT NOT NULL CHECK (quantity >= 1),
      offer_price DOUBLE PRECISION NOT NULL CHECK (offer_price >= 0),
      note TEXT
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${postgresTableRef("quote_request_events")} (
      id BIGSERIAL PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES ${postgresTableRef("quote_requests")}(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${postgresTableRef("user_saved_filters")} (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES ${postgresTableRef("users")}(id) ON DELETE CASCADE,
      view_key TEXT NOT NULL DEFAULT 'category',
      name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${postgresTableRef("cart_drafts")} (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL UNIQUE REFERENCES ${postgresTableRef("users")}(id) ON DELETE CASCADE,
      company TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'abandoned')),
      payload_json TEXT NOT NULL DEFAULT '{"lines":[]}',
      line_count BIGINT NOT NULL DEFAULT 0,
      total_amount DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
      submitted_request_id TEXT REFERENCES ${postgresTableRef("quote_requests")}(id) ON DELETE SET NULL,
      last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submitted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${postgresTableRef("cart_item_activity")} (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES ${postgresTableRef("users")}(id) ON DELETE CASCADE,
      device_id TEXT,
      model TEXT NOT NULL,
      grade TEXT NOT NULL,
      quantity BIGINT NOT NULL CHECK (quantity >= 1),
      offer_price DOUBLE PRECISION NOT NULL CHECK (offer_price >= 0),
      note TEXT,
      ever_requested BIGINT NOT NULL DEFAULT 0 CHECK (ever_requested IN (0, 1)),
      added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${postgresTableRef("app_settings")} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS idx_quote_requests_company ON ${postgresTableRef("quote_requests")} (company)`);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS idx_quote_requests_created_at ON ${postgresTableRef("quote_requests")} (created_at)`);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS idx_quote_request_lines_request ON ${postgresTableRef("quote_request_lines")} (request_id)`);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS idx_quote_request_events_request ON ${postgresTableRef("quote_request_events")} (request_id)`);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS idx_user_saved_filters_user ON ${postgresTableRef("user_saved_filters")} (user_id)`);
  await pgClient.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_saved_filters_unique_name ON ${postgresTableRef("user_saved_filters")} (user_id, view_key, name)`);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS idx_cart_drafts_status_activity ON ${postgresTableRef("cart_drafts")} (status, last_activity_at DESC)`);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS idx_cart_item_activity_user_added ON ${postgresTableRef("cart_item_activity")} (user_id, added_at DESC)`);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS idx_cart_item_activity_user_requested ON ${postgresTableRef("cart_item_activity")} (user_id, ever_requested)`);
}

async function ensurePostgresSerialSequence(tableName, columnName = "id") {
  if (!pgClient) return;
  const relationName = `${PG_SCHEMA}.${tableName}`;
  const seqRes = await pgClient.query(
    "SELECT pg_get_serial_sequence($1, $2) AS seq",
    [relationName, columnName]
  );
  const seqName = String(seqRes.rows?.[0]?.seq || "").trim();
  if (!seqName) return;
  await pgClient.query(
    `
      SELECT setval(
        $1::regclass,
        GREATEST(
          COALESCE((SELECT MAX(${quoteIdent(columnName)})::bigint FROM ${postgresTableRef(tableName)}), 0),
          1
        ),
        true
      )
    `,
    [seqName]
  );
}

async function initializePostgresRuntime() {
  if (effectiveDbEngine !== "postgres") return;
  pgClient = new Client({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });
  await pgClient.connect();
  await ensurePostgresRuntimeSchema();
  await ensurePostgresSerialSequence("quote_request_lines", "id");
  await ensurePostgresSerialSequence("quote_request_events", "id");
  await ensurePostgresSerialSequence("refresh_tokens", "id");
  await ensurePostgresSerialSequence("users", "id");
  await ensurePostgresSerialSequence("device_images", "id");
  await ensurePostgresSerialSequence("locations", "id");
  await ensurePostgresSerialSequence("manufacturers", "id");
  await ensurePostgresSerialSequence("categories", "id");
  await ensurePostgresSerialSequence("user_saved_filters", "id");
  await ensurePostgresSerialSequence("cart_drafts", "id");
  await ensurePostgresSerialSequence("cart_item_activity", "id");
  await ensurePostgresSerialSequence("inventory_events", "id");
  await ensurePostgresSerialSequence("boomi_inventory_raw", "id");
  db = createNoSqliteFallbackAdapter();
}

function getStoredAndDisplayLocations() {
  if (POSTGRES_STRICT_RUNTIME && effectiveDbEngine === "postgres") {
    return [];
  }
  const rows = db.prepare("SELECT name, external_id AS externalId FROM locations ORDER BY id").all();
  return rows.map((row) => {
    const storedName = String(row.name || "").trim();
    return {
      storedName,
      displayName: getDisplayLocationName(storedName, row.externalId)
    };
  });
}

function getDisplayRegions() {
  const names = new Set();
  for (const row of getStoredAndDisplayLocations()) {
    if (row.displayName) names.add(row.displayName);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function resolveStoredLocationNames(regionFilters) {
  const targets = new Set((Array.isArray(regionFilters) ? regionFilters : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean));
  if (!targets.size) return [];
  if (POSTGRES_STRICT_RUNTIME && effectiveDbEngine === "postgres") {
    return [...targets];
  }
  const resolved = new Set();
  for (const row of getStoredAndDisplayLocations()) {
    if (targets.has(row.storedName) || targets.has(row.displayName)) {
      resolved.add(row.storedName);
    }
  }
  return [...resolved];
}

async function resolveStoredLocationNamesPostgres(regionFilters) {
  const targets = new Set((Array.isArray(regionFilters) ? regionFilters : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean));
  if (!targets.size) return [];
  if (effectiveDbEngine !== "postgres") {
    return resolveStoredLocationNames(regionFilters);
  }
  if (!pgClient) {
    throw new Error("Postgres runtime is not initialized.");
  }
  const rowsRes = await pgClient.query(
    `SELECT name, external_id AS "externalId" FROM ${postgresTableRef("locations")} ORDER BY id`
  );
  const rows = Array.isArray(rowsRes.rows) ? rowsRes.rows : [];
  const resolved = new Set();
  for (const row of rows) {
    const storedName = String(row.name || "").trim();
    const displayName = getDisplayLocationName(storedName, row.externalId);
    if (targets.has(storedName) || targets.has(displayName)) {
      resolved.add(storedName);
    }
  }
  return [...resolved];
}

function initDb() {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(readFileSync(schemaPath, "utf8"));
  ensureUsersColumns();
  ensureLocationsSchema();
  ensureDeviceSchema();
  ensureQuoteSchema();
  ensureSavedFiltersSchema();
  const existingDeviceCount = Number(db.prepare("SELECT COUNT(*) AS count FROM devices").get().count || 0);
  const shouldRunCatalogSeed = existingDeviceCount === 0;
  const countStmt = db.prepare("SELECT COUNT(*) AS count FROM categories");
  const count = Number(countStmt.get().count || 0);
  if (count === 0) {
    db.exec(readFileSync(seedPath, "utf8"));
  }
  if (shouldRunCatalogSeed) {
    ensureLargeCatalog();
    ensureDeployRealSeed();
  } else {
    console.log(`[startup] Catalog seeding skipped because ${existingDeviceCount} device(s) already exist.`);
  }
  ensureDefaultUsers();
  ensureHistoricalCompletedEstimates();
}

function ensureDeployRealSeed() {
  if (!AUTO_SEED_REAL_ON_STARTUP) return;
  const existingAdminRealCount = Number(
    db.prepare("SELECT COUNT(*) AS count FROM devices WHERE id LIKE 'adminreal-%'").get().count || 0
  );
  if (existingAdminRealCount > 0) return;
  db.exec("DELETE FROM devices WHERE id LIKE 'gen-%'");
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
  if (!cols.includes("auth0_sub")) {
    db.exec("ALTER TABLE users ADD COLUMN auth0_sub TEXT");
  }
  if (!cols.includes("first_name")) {
    db.exec("ALTER TABLE users ADD COLUMN first_name TEXT");
  }
  if (!cols.includes("last_name")) {
    db.exec("ALTER TABLE users ADD COLUMN last_name TEXT");
  }
  if (!cols.includes("registration_completed")) {
    db.exec("ALTER TABLE users ADD COLUMN registration_completed INTEGER NOT NULL DEFAULT 0 CHECK (registration_completed IN (0, 1))");
  }
  if (!cols.includes("login_count")) {
    db.exec("ALTER TABLE users ADD COLUMN login_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!cols.includes("last_login_at")) {
    db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
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
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth0_sub ON users(auth0_sub)");
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

function ensureHistoricalCompletedEstimates() {
  const seededFlag = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(HISTORICAL_ESTIMATE_SEED_KEY);
  if (String(seededFlag?.value || "") === "1") return;

  const existingCount = Number(
    db.prepare("SELECT COUNT(*) AS count FROM quote_requests WHERE request_number LIKE 'HIST-%'").get().count || 0
  );
  if (existingCount >= 20) {
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, '1', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = CURRENT_TIMESTAMP
    `).run(HISTORICAL_ESTIMATE_SEED_KEY);
    return;
  }

  const seedUser = db.prepare("SELECT id, email, company FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1").get();
  if (!seedUser?.id) return;

  const deviceRows = db.prepare(`
    SELECT
      d.id,
      d.model_name AS model,
      d.grade,
      d.base_price AS price,
      c.name AS category
    FROM devices d
    JOIN categories c ON c.id = d.category_id
    WHERE d.is_active = 1
    ORDER BY c.name ASC, d.model_name ASC
  `).all();
  if (!deviceRows.length) return;

  const byCategory = new Map();
  for (const row of deviceRows) {
    const key = String(row.category || "Other");
    const list = byCategory.get(key) || [];
    list.push(row);
    byCategory.set(key, list);
  }
  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));
  if (!categories.length) return;

  const requestInsert = db.prepare(`
    INSERT INTO quote_requests (
      id, request_number, company, created_by_user_id, created_by_email, status, total_amount, currency_code,
      netsuite_estimate_id, netsuite_estimate_number, netsuite_status, netsuite_last_sync_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'Completed', ?, 'USD', ?, ?, 'Completed', ?, ?, ?)
  `);
  const lineInsert = db.prepare(`
    INSERT INTO quote_request_lines (
      request_id, device_id, model, grade, quantity, offer_price, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const eventInsert = db.prepare(`
    INSERT INTO quote_request_events (request_id, event_type, payload_json, created_at)
    VALUES (?, 'historical_seeded', ?, ?)
  `);
  const requestExistsByIdOrNumber = db.prepare("SELECT id FROM quote_requests WHERE id = ? OR request_number = ? LIMIT 1");

  db.exec("BEGIN TRANSACTION");
  try {
    for (let i = 0; i < 20; i += 1) {
      const requestId = `hist-est-${String(i + 1).padStart(3, "0")}`;
      const requestNumber = `HIST-${String(i + 1).padStart(4, "0")}`;
      const requestExists = requestExistsByIdOrNumber.get(requestId, requestNumber);
      if (requestExists?.id) continue;
      const estimateId = `hist-dummy-est-${String(i + 1).padStart(4, "0")}`;
      const estimateNumber = `HIST-EST-${String(i + 1).padStart(4, "0")}`;
      const createdAt = new Date(Date.now() - ((140 - (i * 5)) * 24 * 60 * 60 * 1000)).toISOString();
      const lineCount = 3 + (i % 2);
      const lines = [];
      let total = 0;

      for (let j = 0; j < lineCount; j += 1) {
        const categoryName = categories[(i + j) % categories.length];
        const list = byCategory.get(categoryName) || deviceRows;
        const device = list[(i * 3 + j * 5) % list.length];
        const quantity = 50 + ((i * 11 + j * 17) % 96);
        const multiplier = 0.68 + (((i + j) % 7) * 0.04);
        const offerPrice = Number((Number(device.price || 100) * multiplier).toFixed(2));
        total += quantity * offerPrice;
        lines.push({
          deviceId: device.id,
          model: device.model,
          grade: device.grade || "A",
          quantity,
          offerPrice,
          note: `Historical completed estimate seed (${categoryName}).`
        });
      }
      total = Number(total.toFixed(2));

      requestInsert.run(
        requestId,
        requestNumber,
        seedUser.company || "PCSWW",
        seedUser.id,
        seedUser.email,
        total,
        estimateId,
        estimateNumber,
        createdAt,
        createdAt,
        createdAt
      );

      for (const line of lines) {
        lineInsert.run(requestId, line.deviceId, line.model, line.grade, line.quantity, line.offerPrice, line.note);
      }

      eventInsert.run(requestId, JSON.stringify({ seeded: true, lineCount: lines.length, total }), createdAt);
    }

    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, '1', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = CURRENT_TIMESTAMP
    `).run(HISTORICAL_ESTIMATE_SEED_KEY);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function seedHistoricalCompletedEstimatesForUserRuntime(targetUserIdRaw, countRaw = 20) {
  if (!pgClient) {
    throw new Error("Postgres runtime is not initialized.");
  }
  const targetUserId = Number(targetUserIdRaw);
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    throw new Error("Valid targetUserId is required.");
  }
  const count = Math.max(1, Math.min(100, Math.floor(Number(countRaw || 20))));
  const userRes = await pgClient.query(
    `SELECT id, email, company FROM ${postgresTableRef("users")} WHERE id = $1 LIMIT 1`,
    [targetUserId]
  );
  const targetUser = userRes.rows?.[0];
  if (!targetUser?.id) {
    throw new Error("User not found.");
  }
  const devicesRes = await pgClient.query(`
    SELECT
      d.id,
      d.model_name AS model,
      d.grade,
      d.base_price AS price,
      c.name AS category
    FROM ${postgresTableRef("devices")} d
    JOIN ${postgresTableRef("categories")} c ON c.id = d.category_id
    WHERE d.is_active = 1
    ORDER BY c.name ASC, d.model_name ASC
  `);
  const deviceRows = devicesRes.rows || [];
  if (!deviceRows.length) {
    throw new Error("No active devices available for seeding.");
  }
  const byCategory = new Map();
  for (const row of deviceRows) {
    const key = String(row.category || "Other");
    const list = byCategory.get(key) || [];
    list.push(row);
    byCategory.set(key, list);
  }
  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));
  if (!categories.length) {
    throw new Error("No categories available for seeding.");
  }

  let created = 0;
  await pgClient.query("BEGIN");
  try {
    for (let i = 0; i < count; i += 1) {
      const requestId = `usrhist-${targetUser.id}-${randomBytes(8).toString("hex")}`;
      const requestNumber = await getNextRequestNumberPostgres();
      const estimateId = `usrhist-est-${randomBytes(8).toString("hex")}`;
      const estimateNumber = await getNextDummyEstimateNumberPostgres();
      const createdAt = new Date(Date.now() - ((count - i + 3) * 24 * 60 * 60 * 1000)).toISOString();
      const lineCount = 3 + ((i + Number(targetUser.id)) % 3);
      const lines = [];
      let total = 0;

      for (let j = 0; j < lineCount; j += 1) {
        const categoryName = categories[(i + j) % categories.length];
        const list = byCategory.get(categoryName) || deviceRows;
        const device = list[(i * 7 + j * 11 + Number(targetUser.id)) % list.length];
        const quantity = 50 + ((i * 13 + j * 19 + Number(targetUser.id)) % 120);
        const multiplier = 0.64 + (((i + j + Number(targetUser.id)) % 8) * 0.05);
        const offerPrice = Number((Number(device.price || 100) * multiplier).toFixed(2));
        total += quantity * offerPrice;
        lines.push({
          deviceId: device.id,
          model: device.model,
          grade: device.grade || "A",
          quantity,
          offerPrice,
          note: `Admin seeded history (${categoryName}).`
        });
      }
      total = Number(total.toFixed(2));

      await pgClient.query(
        `
          INSERT INTO ${postgresTableRef("quote_requests")} (
            id, request_number, company, created_by_user_id, created_by_email, status, total_amount, currency_code,
            netsuite_estimate_id, netsuite_estimate_number, netsuite_status, netsuite_last_sync_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 'Completed', $6, 'USD', $7, $8, 'Completed', $9, $10, $11)
        `,
        [
          requestId,
          requestNumber,
          targetUser.company || "PCSWW",
          targetUser.id,
          targetUser.email,
          total,
          estimateId,
          estimateNumber,
          createdAt,
          createdAt,
          createdAt
        ]
      );

      for (const line of lines) {
        await pgClient.query(
          `
            INSERT INTO ${postgresTableRef("quote_request_lines")} (
              request_id, device_id, model, grade, quantity, offer_price, note
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [requestId, line.deviceId, line.model, line.grade, line.quantity, line.offerPrice, line.note]
        );
      }
      await pgClient.query(
        `
          INSERT INTO ${postgresTableRef("quote_request_events")} (request_id, event_type, payload_json, created_at)
          VALUES ($1, 'admin_seeded_history', $2, $3)
        `,
        [requestId, JSON.stringify({ seededByAdmin: true, lineCount: lines.length, total, targetUserId: targetUser.id }), createdAt]
      );
      created += 1;
    }

    await pgClient.query("COMMIT");
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }

  return {
    ok: true,
    created,
    targetUser: {
      id: Number(targetUser.id),
      email: targetUser.email,
      company: targetUser.company
    }
  };
}

async function seedCartActivityForUserRuntime(targetUserIdRaw, countRaw = 20) {
  if (!pgClient) {
    throw new Error("Postgres runtime is not initialized.");
  }
  const targetUserId = Number(targetUserIdRaw);
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    throw new Error("Valid targetUserId is required.");
  }
  const count = Math.max(1, Math.min(200, Math.floor(Number(countRaw || 20))));
  const userRes = await pgClient.query(
    `SELECT id, email, company FROM ${postgresTableRef("users")} WHERE id = $1 LIMIT 1`,
    [targetUserId]
  );
  const targetUser = userRes.rows?.[0];
  if (!targetUser?.id) {
    throw new Error("User not found.");
  }

  const devicesRes = await pgClient.query(`
    SELECT
      d.id,
      d.model_name AS model,
      d.grade,
      d.base_price AS price,
      c.name AS category
    FROM ${postgresTableRef("devices")} d
    JOIN ${postgresTableRef("categories")} c ON c.id = d.category_id
    WHERE d.is_active = 1
    ORDER BY c.name ASC, d.model_name ASC
  `);
  const deviceRows = devicesRes.rows || [];
  if (!deviceRows.length) {
    throw new Error("No active devices available for seeding.");
  }
  const byCategory = new Map();
  for (const row of deviceRows) {
    const key = String(row.category || "Other");
    const list = byCategory.get(key) || [];
    list.push(row);
    byCategory.set(key, list);
  }
  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));
  if (!categories.length) {
    throw new Error("No categories available for seeding.");
  }

  await pgClient.query("BEGIN");
  try {
    for (let i = 0; i < count; i += 1) {
      const categoryName = categories[i % categories.length];
      const list = byCategory.get(categoryName) || deviceRows;
      const device = list[(i * 17 + Number(targetUser.id)) % list.length];
      const quantity = 1 + ((i * 7 + Number(targetUser.id)) % 25);
      const multiplier = 0.58 + (((i + Number(targetUser.id)) % 9) * 0.06);
      const offerPrice = Number((Number(device.price || 100) * multiplier).toFixed(2));
      const addedAt = new Date(Date.now() - ((count - i) * 6 * 60 * 60 * 1000)).toISOString();
      await pgClient.query(`
        INSERT INTO ${postgresTableRef("cart_item_activity")} (
          user_id, device_id, model, grade, quantity, offer_price, note, ever_requested, added_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)
      `, [
        Number(targetUser.id),
        String(device.id || "").trim() || null,
        String(device.model || "").trim(),
        String(device.grade || "A").trim(),
        quantity,
        offerPrice,
        `Admin seeded cart activity (${categoryName}).`,
        addedAt
      ]);
    }
    await pgClient.query("COMMIT");
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }

  return {
    ok: true,
    created: count,
    targetUser: {
      id: Number(targetUser.id),
      email: targetUser.email,
      company: targetUser.company
    }
  };
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

async function getBooleanAppSettingPostgres(key, defaultValue = false) {
  if (!pgClient) return defaultValue;
  const result = await pgClient.query(
    `SELECT value FROM ${postgresTableRef("app_settings")} WHERE key = $1 LIMIT 1`,
    [key]
  );
  const row = result.rows?.[0];
  if (!row) return defaultValue;
  const normalized = String(row.value || "").trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  return defaultValue;
}

async function setBooleanAppSettingPostgres(key, value) {
  if (!pgClient) return;
  await pgClient.query(
    `
      INSERT INTO ${postgresTableRef("app_settings")} (key, value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `,
    [key, value ? "1" : "0"]
  );
}

async function getBooleanAppSettingRuntime(key, defaultValue = false) {
  if (effectiveDbEngine === "postgres") {
    if (!pgClient) {
      throw new Error("Postgres runtime is not initialized.");
    }
    try {
      return await getBooleanAppSettingPostgres(key, defaultValue);
    } catch (error) {
      throw new Error(`Postgres app setting read failed: ${error?.message || error}`);
    }
  }
  return getBooleanAppSetting(key, defaultValue);
}

async function setBooleanAppSettingRuntime(key, value) {
  if (effectiveDbEngine === "postgres") {
    if (!pgClient) {
      throw new Error("Postgres runtime is not initialized.");
    }
    try {
      await setBooleanAppSettingPostgres(key, value);
      return;
    } catch (error) {
      throw new Error(`Postgres app setting write failed: ${error?.message || error}`);
    }
  }
  setBooleanAppSetting(key, value);
}

function ensureLargeCatalog() {
  const categories = db.prepare("SELECT id, name FROM categories").all();
  const categoryByName = new Map(categories.map((c) => [c.name, c.id]));
  const locations = db.prepare("SELECT id FROM locations ORDER BY id").all().map((l) => l.id);
  const existingGeneratedCount = Number(
    db.prepare("SELECT COUNT(*) AS count FROM devices WHERE id LIKE 'gen-%'").get().count || 0
  );
  const shouldSeedGenerated = existingGeneratedCount === 0;
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
    if (shouldSeedGenerated) {
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
  const firstName = String(row.first_name || row.firstName || "").trim();
  const lastName = String(row.last_name || row.lastName || "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  return {
    id: row.id,
    email: row.email,
    firstName,
    lastName,
    fullName,
    company: row.company,
    role: row.role,
    isActive: Number(row.is_active) === 1,
    registrationCompleted: Number(row.registration_completed || row.registrationCompleted || 0) === 1,
    loginCount: Math.max(0, Number(row.login_count || row.loginCount || 0)),
    lastLoginAt: row.last_login_at || row.lastLoginAt || null,
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

async function issueRefreshTokenPostgres(userId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const refreshToken = randomBytes(48).toString("hex");
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + (REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)).toISOString();
  await pgClient.query(`
    INSERT INTO ${postgresTableRef("refresh_tokens")} (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
  `, [userId, tokenHash, expiresAt]);
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

async function revokeRefreshTokenPostgres(refreshToken, replacedByToken) {
  if (!pgClient) {
    revokeRefreshToken(refreshToken, replacedByToken);
    return;
  }
  const tokenHash = hashRefreshToken(refreshToken);
  const replacedByHash = replacedByToken ? hashRefreshToken(replacedByToken) : null;
  await pgClient.query(`
    UPDATE ${postgresTableRef("refresh_tokens")}
    SET revoked_at = CURRENT_TIMESTAMP,
        replaced_by_hash = COALESCE($1, replaced_by_hash),
        last_used_at = CURRENT_TIMESTAMP
    WHERE token_hash = $2
      AND revoked_at IS NULL
  `, [replacedByHash, tokenHash]);
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

async function rotateRefreshTokenPostgres(refreshToken) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const tokenHash = hashRefreshToken(refreshToken);
  const rowRes = await pgClient.query(`
    SELECT id, user_id, expires_at, revoked_at
    FROM ${postgresTableRef("refresh_tokens")}
    WHERE token_hash = $1
    LIMIT 1
  `, [tokenHash]);
  const row = rowRes.rows?.[0];
  if (!row?.id) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pgClient.query(`UPDATE ${postgresTableRef("refresh_tokens")} SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.id]);
    return null;
  }

  const newRefreshToken = randomBytes(48).toString("hex");
  const newRefreshHash = hashRefreshToken(newRefreshToken);
  const newExpiresAt = new Date(Date.now() + (REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)).toISOString();

  await pgClient.query("BEGIN");
  try {
    await pgClient.query(`
      UPDATE ${postgresTableRef("refresh_tokens")}
      SET revoked_at = CURRENT_TIMESTAMP,
          replaced_by_hash = $1,
          last_used_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [newRefreshHash, row.id]);
    await pgClient.query(`
      INSERT INTO ${postgresTableRef("refresh_tokens")} (user_id, token_hash, expires_at, last_used_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `, [row.user_id, newRefreshHash, newExpiresAt]);
    await pgClient.query("COMMIT");
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
  return { userId: Number(row.user_id), refreshToken: newRefreshToken };
}

async function issueRefreshTokenRuntime(userId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  return issueRefreshTokenPostgres(userId);
}

async function revokeRefreshTokenRuntime(refreshToken, replacedByToken) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  await revokeRefreshTokenPostgres(refreshToken, replacedByToken);
}

async function rotateRefreshTokenRuntime(refreshToken) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  return rotateRefreshTokenPostgres(refreshToken);
}

function getAuthToken(req) {
  const auth = req.headers.authorization || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

function getAuth0Jwks() {
  if (!AUTH0_DOMAIN) {
    throw new Error("Auth0 is not configured (missing AUTH0_DOMAIN).");
  }
  if (!auth0Jwks) {
    auth0Jwks = createRemoteJWKSet(new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`));
  }
  return auth0Jwks;
}

function isAuth0ManagementConfigured() {
  return Boolean(AUTH0_DOMAIN && AUTH0_MGMT_CLIENT_ID && AUTH0_MGMT_CLIENT_SECRET && AUTH0_MGMT_AUDIENCE);
}

async function getAuth0ManagementToken() {
  if (!isAuth0ManagementConfigured()) {
    throw new Error("Auth0 Management API is not configured (AUTH0_MGMT_CLIENT_ID/AUTH0_MGMT_CLIENT_SECRET/AUTH0_MGMT_AUDIENCE).");
  }
  const payload = await requestJsonStrict(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
      client_id: AUTH0_MGMT_CLIENT_ID,
      client_secret: AUTH0_MGMT_CLIENT_SECRET,
      audience: AUTH0_MGMT_AUDIENCE,
      grant_type: "client_credentials"
    }),
    errorPrefix: "Auth0 management token request"
  });
  const accessToken = String(payload?.access_token || "").trim();
  if (!accessToken) {
    throw new Error("Auth0 management token response did not include access_token.");
  }
  return accessToken;
}

async function deleteAuth0UserBySub(auth0Sub) {
  const sub = String(auth0Sub || "").trim();
  if (!sub) return { deleted: false, reason: "no_auth0_sub" };
  const mgmtToken = await getAuth0ManagementToken();
  await requestJsonStrict(`https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(sub)}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${mgmtToken}`
    },
    errorPrefix: "Auth0 user delete request"
  });
  return { deleted: true };
}

async function fetchAuth0UsersPage(mgmtToken, pageNumber = 0) {
  const page = Math.max(0, Number(pageNumber || 0));
  const query = new URLSearchParams({
    per_page: String(AUTH0_SYNC_PAGE_SIZE),
    page: String(page),
    include_totals: "false",
    fields: "user_id,email",
    include_fields: "true"
  });
  const payload = await requestJsonStrict(`https://${AUTH0_DOMAIN}/api/v2/users?${query.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${mgmtToken}`
    },
    errorPrefix: "Auth0 users list request"
  });
  return Array.isArray(payload) ? payload : [];
}

async function syncAuth0UsersToLocalDb(options = {}) {
  const force = options.force === true;
  const reason = String(options.reason || "manual");
  if (!AUTH0_AUTO_SYNC_USERS && !force) return { skipped: true, reason: "disabled" };
  if (!isAuth0ManagementConfigured()) return { skipped: true, reason: "management_not_configured" };
  if (!force && auth0UserSyncState.lastRunAt > 0 && (Date.now() - auth0UserSyncState.lastRunAt) < AUTH0_SYNC_THROTTLE_MS) {
    return auth0UserSyncState.lastResult || { skipped: true, reason: "throttled" };
  }
  if (auth0UserSyncState.running) {
    return auth0UserSyncState.lastResult || { skipped: true, reason: "already_running" };
  }

  auth0UserSyncState.running = true;
  try {
    const mgmtToken = await getAuth0ManagementToken();
    let page = 0;
    let totalFetched = 0;
    let created = 0;
    let linked = 0;
    while (true) {
      const rows = await fetchAuth0UsersPage(mgmtToken, page);
      if (!rows.length) break;
      totalFetched += rows.length;
      for (const row of rows) {
        const auth0Sub = String(row?.user_id || "").trim();
        const email = normalizeEmail(row?.email || "");
        if (!auth0Sub || !email) continue;

        const existingBySub = await getUserByAuth0SubRuntime(auth0Sub, false);
        if (existingBySub?.id) continue;

        const existingByEmail = await getUserByEmailRuntime(email, false);
        if (existingByEmail?.id) {
          if (!String(existingByEmail.auth0_sub || "").trim()) {
            await setUserAuth0SubRuntime(existingByEmail.id, auth0Sub);
            linked += 1;
          }
          continue;
        }

        const company = inferCompanyFromEmail(email);
        const randomPasswordHash = hashPassword(randomBytes(24).toString("hex"));
      await createUserRuntime({
        email,
        company,
        role: "buyer",
        passwordHash: randomPasswordHash,
        isActive: false,
        auth0Sub,
        registrationCompleted: false
      });
        created += 1;
      }
      if (rows.length < AUTH0_SYNC_PAGE_SIZE) break;
      page += 1;
    }
    const result = { ok: true, reason, totalFetched, created, linked, completedAt: new Date().toISOString() };
    auth0UserSyncState.lastRunAt = Date.now();
    auth0UserSyncState.lastResult = result;
    return result;
  } finally {
    auth0UserSyncState.running = false;
  }
}

async function verifyAuth0AccessToken(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) {
    throw new Error("Auth0 access token is required.");
  }
  if (!AUTH0_ISSUER) {
    throw new Error("Auth0 issuer is not configured (AUTH0_ISSUER or AUTH0_DOMAIN).");
  }
  const options = {
    issuer: AUTH0_ISSUER
  };
  if (AUTH0_AUDIENCE) {
    options.audience = AUTH0_AUDIENCE;
  }
  const { payload } = await jwtVerify(token, getAuth0Jwks(), options);
  return payload;
}

async function fetchAuth0UserInfo(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token || !AUTH0_DOMAIN) return null;
  try {
    const userInfo = await requestJson(`https://${AUTH0_DOMAIN}/userinfo`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      },
      errorPrefix: "Auth0 userinfo request"
    });
    return userInfo && typeof userInfo === "object" ? userInfo : null;
  } catch {
    return null;
  }
}

function inferCompanyFromEmail(email) {
  const normalized = normalizeEmail(email);
  const domain = normalized.split("@")[1] || "";
  const root = domain.split(".")[0] || "Unknown";
  return root.slice(0, 60).toUpperCase() || "Unknown";
}

function normalizeCompanyName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function normalizePersonName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

async function getUserByEmailRuntime(email, includePassword = false) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const fields = includePassword
    ? "id, email, company, role, password_hash, is_active, created_at, auth0_sub, reset_code, reset_code_expires_at, first_name, last_name, registration_completed, login_count, last_login_at"
    : "id, email, company, role, is_active, created_at, auth0_sub, reset_code, reset_code_expires_at, first_name, last_name, registration_completed, login_count, last_login_at";
  const sql = `SELECT ${fields} FROM ${postgresTableRef("users")} WHERE email = $1 LIMIT 1`;
  const result = await pgClient.query(sql, [normalized]);
  return result.rows?.[0] || null;
}

async function getUserByIdRuntime(userId, includePassword = false) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return null;
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const fields = includePassword
    ? "id, email, company, role, password_hash, is_active, created_at, auth0_sub, reset_code, reset_code_expires_at, first_name, last_name, registration_completed, login_count, last_login_at"
    : "id, email, company, role, is_active, created_at, auth0_sub, reset_code, reset_code_expires_at, first_name, last_name, registration_completed, login_count, last_login_at";
  const sql = `SELECT ${fields} FROM ${postgresTableRef("users")} WHERE id = $1 LIMIT 1`;
  const result = await pgClient.query(sql, [id]);
  return result.rows?.[0] || null;
}

async function getUserByAuth0SubRuntime(auth0Sub, includePassword = false) {
  const sub = String(auth0Sub || "").trim();
  if (!sub) return null;
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const fields = includePassword
    ? "id, email, company, role, password_hash, is_active, created_at, auth0_sub, reset_code, reset_code_expires_at, first_name, last_name, registration_completed, login_count, last_login_at"
    : "id, email, company, role, is_active, created_at, auth0_sub, reset_code, reset_code_expires_at, first_name, last_name, registration_completed, login_count, last_login_at";
  const sql = `SELECT ${fields} FROM ${postgresTableRef("users")} WHERE auth0_sub = $1 LIMIT 1`;
  const result = await pgClient.query(sql, [sub]);
  return result.rows?.[0] || null;
}

async function createUserRuntime({
  email,
  company,
  role = "buyer",
  passwordHash,
  isActive = false,
  auth0Sub = null,
  firstName = "",
  lastName = "",
  registrationCompleted = false
}) {
  const normalizedEmail = normalizeEmail(email);
  const safeCompany = String(company || "").trim();
  const safeRole = String(role || "").trim() === "admin" ? "admin" : "buyer";
  if (!normalizedEmail || !safeCompany || !passwordHash) throw new Error("Invalid user payload.");
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = await pgClient.query(`
    INSERT INTO ${postgresTableRef("users")} (email, company, role, password_hash, is_active, auth0_sub, first_name, last_name, registration_completed)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, email, company, role, is_active, created_at, auth0_sub, first_name, last_name, registration_completed, login_count, last_login_at
  `, [normalizedEmail, safeCompany, safeRole, passwordHash, isActive ? 1 : 0, auth0Sub ? String(auth0Sub).trim() : null, String(firstName || "").trim(), String(lastName || "").trim(), registrationCompleted ? 1 : 0]);
  return result.rows?.[0] || null;
}

async function setUserResetCodeRuntime(userId, resetCode, expiresAt) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return;
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  await pgClient.query(`UPDATE ${postgresTableRef("users")} SET reset_code = $1, reset_code_expires_at = $2 WHERE id = $3`, [resetCode, expiresAt, id]);
}

async function setUserAuth0SubRuntime(userId, auth0Sub) {
  const id = Number(userId);
  const sub = String(auth0Sub || "").trim();
  if (!Number.isInteger(id) || id < 1 || !sub) return;
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  await pgClient.query(`UPDATE ${postgresTableRef("users")} SET auth0_sub = $1 WHERE id = $2`, [sub, id]);
}

async function updateUserPasswordAndClearResetRuntime(userId, passwordHash) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return;
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  await pgClient.query(`UPDATE ${postgresTableRef("users")} SET password_hash = $1, reset_code = NULL, reset_code_expires_at = NULL WHERE id = $2`, [passwordHash, id]);
}

async function recordUserLoginRuntime(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return;
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  await pgClient.query(`
    UPDATE ${postgresTableRef("users")}
    SET login_count = COALESCE(login_count, 0) + 1,
        last_login_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [id]);
}

async function completeUserRegistrationRuntime(userId, firstName, lastName, company) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) throw new Error("User not found.");
  const normalizedFirstName = normalizePersonName(firstName);
  const normalizedLastName = normalizePersonName(lastName);
  const normalizedCompany = normalizeCompanyName(company);
  if (!normalizedFirstName || !normalizedLastName || !normalizedCompany) {
    throw new Error("First name, last name and company are required.");
  }
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = await pgClient.query(`
    UPDATE ${postgresTableRef("users")}
    SET first_name = $1,
        last_name = $2,
        company = $3,
        registration_completed = 1
    WHERE id = $4
    RETURNING id
  `, [normalizedFirstName, normalizedLastName, normalizedCompany, id]);
  if (!result.rows?.[0]?.id) throw new Error("User not found.");
}

async function listUsersForAdminRuntime() {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = await pgClient.query(
    `SELECT id, email, first_name, last_name, company, role, is_active, registration_completed, login_count, last_login_at, created_at FROM ${postgresTableRef("users")} ORDER BY created_at DESC`
  );
  return (result.rows || []).map(makePublicUser);
}

async function getUserForAdminByIdRuntime(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return null;
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = await pgClient.query(
    `SELECT id, email, auth0_sub, role, is_active, registration_completed, company, first_name, last_name, created_at FROM ${postgresTableRef("users")} WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows?.[0] || null;
}

async function updateUserAdminFieldsRuntime(userId, updates) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) throw new Error("User not found.");
  const pgSet = [];
  const pgParams = [];
  if (typeof updates?.isActive === "boolean") {
    pgSet.push(`is_active = $${pgParams.length + 1}`);
    pgParams.push(updates.isActive ? 1 : 0);
  }
  if (typeof updates?.isAdmin === "boolean") {
    pgSet.push(`role = $${pgParams.length + 1}`);
    pgParams.push(updates.isAdmin ? "admin" : "buyer");
  }
  if (typeof updates?.registrationCompleted === "boolean") {
    pgSet.push(`registration_completed = $${pgParams.length + 1}`);
    pgParams.push(updates.registrationCompleted ? 1 : 0);
  }
  if (!pgSet.length) throw new Error("No valid fields to update.");
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  pgParams.push(id);
  const result = await pgClient.query(
    `UPDATE ${postgresTableRef("users")} SET ${pgSet.join(", ")} WHERE id = $${pgParams.length}`,
    pgParams
  );
  if (Number(result.rowCount || 0) < 1) throw new Error("User not found.");
}

async function deleteUserRuntime(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) throw new Error("User not found.");
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  await pgClient.query("BEGIN");
  try {
    await pgClient.query(`UPDATE ${postgresTableRef("quote_requests")} SET created_by_user_id = NULL WHERE created_by_user_id = $1`, [id]);
    await pgClient.query(`DELETE FROM ${postgresTableRef("refresh_tokens")} WHERE user_id = $1`, [id]);
    const deleted = await pgClient.query(`DELETE FROM ${postgresTableRef("users")} WHERE id = $1`, [id]);
    if (Number(deleted.rowCount || 0) < 1) {
      await pgClient.query("ROLLBACK");
      throw new Error("User not found.");
    }
    await pgClient.query("COMMIT");
  } catch (error) {
    try { await pgClient.query("ROLLBACK"); } catch {}
    throw error;
  }
}

async function upsertUserFromAuth0ClaimsRuntime(claims, fallbackEmail = "", preferredCompany = "") {
  if (!pgClient) {
    throw new Error("Postgres runtime is not initialized.");
  }
  const auth0Sub = String(claims?.sub || "").trim();
  const email = normalizeEmail(claims?.email || fallbackEmail || "");
  if (!auth0Sub) throw new Error("Auth0 token missing subject (sub).");
  if (!email) throw new Error("Auth0 token missing email claim.");

  let result = await pgClient.query(`
    SELECT id, email, company, role, is_active, created_at, auth0_sub, first_name, last_name, registration_completed, login_count, last_login_at
    FROM ${postgresTableRef("users")}
    WHERE auth0_sub = $1
    LIMIT 1
  `, [auth0Sub]);
  let user = result.rows?.[0] || null;
  if (!user) {
    result = await pgClient.query(`
      SELECT id, email, company, role, is_active, created_at, auth0_sub, first_name, last_name, registration_completed, login_count, last_login_at
      FROM ${postgresTableRef("users")}
      WHERE email = $1
      LIMIT 1
    `, [email]);
    user = result.rows?.[0] || null;
  }
  if (user?.id) {
    const normalizedPreferredCompany = normalizeCompanyName(preferredCompany);
    if (!String(user.auth0_sub || "").trim()) {
      await pgClient.query(`UPDATE ${postgresTableRef("users")} SET auth0_sub = $1 WHERE id = $2`, [auth0Sub, user.id]);
    }
    if (normalizedPreferredCompany && normalizedPreferredCompany !== String(user.company || "").trim()) {
      await pgClient.query(`UPDATE ${postgresTableRef("users")} SET company = $1 WHERE id = $2`, [normalizedPreferredCompany, user.id]);
    }
    const finalRes = await pgClient.query(`
      SELECT id, email, company, role, is_active, created_at, first_name, last_name, registration_completed, login_count, last_login_at
      FROM ${postgresTableRef("users")}
      WHERE id = $1
      LIMIT 1
    `, [user.id]);
    return finalRes.rows?.[0] || null;
  }

  const company = normalizeCompanyName(preferredCompany) || inferCompanyFromEmail(email);
  const randomPasswordHash = hashPassword(randomBytes(24).toString("hex"));
  const created = await createUserRuntime({
    email,
    company,
    role: "buyer",
    passwordHash: randomPasswordHash,
    isActive: false,
    auth0Sub,
    registrationCompleted: false
  });
  return created;
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
    const storedRegionNames = resolveStoredLocationNames(regions);
    if (!storedRegionNames.length) {
      filters.push("1 = 0");
    } else {
      const keys = storedRegionNames.map((_, idx) => `$regionAvail${idx}`);
      storedRegionNames.forEach((value, idx) => {
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
    ORDER BY c.name, m.name, d.model_name
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
      l.external_id AS externalId,
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
      const displayLocation = getDisplayLocationName(row.location, row.externalId);
      if (!displayLocation) continue;
      locations[displayLocation] = Number(locations[displayLocation] || 0) + Number(row.quantity || 0);
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
      carrier: d.carrier || "N/A",
      screenSize: d.screenSize || "N/A",
      modular: d.modular || "N/A",
      color: d.color || "N/A",
      kitType: d.kitType || "N/A",
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

async function getCategoriesPostgres() {
  if (!pgClient) return [];
  const result = await pgClient.query(`SELECT name FROM ${postgresTableRef("categories")} ORDER BY id`);
  return result.rows.map((row) => row.name);
}

async function getDevicesPostgres(url) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
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

  const filters = ["d.is_active = 1"];
  const params = [];
  const pushParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (search) {
    const likeValue = `%${search.toLowerCase()}%`;
    const marker = pushParam(likeValue);
    filters.push(`(LOWER(d.model_name) LIKE ${marker} OR LOWER(d.model_family) LIKE ${marker} OR LOWER(m.name) LIKE ${marker} OR LOWER(c.name) LIKE ${marker})`);
  }

  function addArrayFilter(column, values) {
    if (!Array.isArray(values) || !values.length) return;
    const marker = pushParam(values);
    filters.push(`${column} = ANY(${marker}::text[])`);
  }

  addArrayFilter("c.name", categories);
  addArrayFilter("m.name", manufacturers);
  addArrayFilter("d.model_family", modelFamilies);
  addArrayFilter("d.grade", grades);
  addArrayFilter("d.storage_capacity", storages);

  if (regions.length) {
    const storedRegionNames = await resolveStoredLocationNamesPostgres(regions);
    if (!storedRegionNames.length) {
      filters.push("1 = 0");
    } else {
      const marker = pushParam(storedRegionNames);
      filters.push(`
        EXISTS (
          SELECT 1
          FROM ${postgresTableRef("device_inventory")} di_r
          JOIN ${postgresTableRef("locations")} l_r ON l_r.id = di_r.location_id
          WHERE di_r.device_id = d.id
            AND di_r.quantity > 0
            AND l_r.name = ANY(${marker}::text[])
        )
      `);
    }
  }

  const whereSql = `WHERE ${filters.join(" AND ")}`;
  const offset = (page - 1) * (pageSize || 1);

  const countSql = `
    SELECT COUNT(*)::bigint AS count
    FROM (
      SELECT d.id
      FROM ${postgresTableRef("devices")} d
      JOIN ${postgresTableRef("manufacturers")} m ON m.id = d.manufacturer_id
      JOIN ${postgresTableRef("categories")} c ON c.id = d.category_id
      LEFT JOIN ${postgresTableRef("locations")} dl ON dl.id = d.default_location_id
      LEFT JOIN ${postgresTableRef("device_inventory")} di ON di.device_id = d.id
      ${whereSql}
      GROUP BY d.id
    ) x
  `;
  const countRes = await pgClient.query(countSql, params);
  const total = Number(countRes.rows?.[0]?.count || 0);

  const baseSql = `
    SELECT
      d.id,
      m.name AS manufacturer,
      d.model_name AS model,
      d.model_family AS "modelFamily",
      c.name AS category,
      d.grade,
      dl.name AS region,
      d.storage_capacity AS storage,
      d.base_price AS price,
      d.image_url AS image,
      d.carrier AS carrier,
      d.screen_size AS "screenSize",
      d.modular AS modular,
      d.color AS color,
      d.kit_type AS "kitType",
      d.product_notes AS "productNotes",
      d.weekly_special AS "weeklySpecial",
      COALESCE(SUM(di.quantity), 0) AS available
    FROM ${postgresTableRef("devices")} d
    JOIN ${postgresTableRef("manufacturers")} m ON m.id = d.manufacturer_id
    JOIN ${postgresTableRef("categories")} c ON c.id = d.category_id
    LEFT JOIN ${postgresTableRef("locations")} dl ON dl.id = d.default_location_id
    LEFT JOIN ${postgresTableRef("device_inventory")} di ON di.device_id = d.id
    ${whereSql}
    GROUP BY d.id, m.name, d.model_name, d.model_family, c.name, d.grade, dl.name, d.storage_capacity, d.base_price, d.image_url, d.carrier, d.screen_size, d.modular, d.color, d.kit_type, d.product_notes, d.weekly_special
    ORDER BY c.name, m.name, d.model_name
  `;

  const queryParams = [...params];
  let deviceSql = baseSql;
  if (pageSize) {
    const limitMarker = `$${queryParams.length + 1}`;
    const offsetMarker = `$${queryParams.length + 2}`;
    queryParams.push(pageSize, offset);
    deviceSql = `${baseSql} LIMIT ${limitMarker} OFFSET ${offsetMarker}`;
  }
  const deviceRes = await pgClient.query(deviceSql, queryParams);
  const devices = Array.isArray(deviceRes.rows) ? deviceRes.rows : [];
  const deviceIds = devices.map((row) => row.id).filter(Boolean);

  const allLocationsRes = await pgClient.query(`SELECT id, name, external_id AS "externalId" FROM ${postgresTableRef("locations")} ORDER BY id`);
  const allLocations = Array.isArray(allLocationsRes.rows) ? allLocationsRes.rows : [];

  const inventoryByDevice = new Map();
  const imagesByDevice = new Map();
  if (deviceIds.length) {
    const invRes = await pgClient.query(
      `SELECT device_id AS "deviceId", location_id AS "locationId", COALESCE(quantity, 0) AS quantity
       FROM ${postgresTableRef("device_inventory")}
       WHERE device_id = ANY($1::text[])`,
      [deviceIds]
    );
    for (const row of invRes.rows || []) {
      const key = `${row.deviceId}:${row.locationId}`;
      inventoryByDevice.set(key, Number(row.quantity || 0));
    }
    const imgRes = await pgClient.query(
      `SELECT device_id AS "deviceId", image_url AS "imageUrl"
       FROM ${postgresTableRef("device_images")}
       WHERE device_id = ANY($1::text[])
       ORDER BY sort_order, id`,
      [deviceIds]
    );
    for (const row of imgRes.rows || []) {
      const key = String(row.deviceId || "");
      const list = imagesByDevice.get(key) || [];
      if (row.imageUrl) list.push(row.imageUrl);
      imagesByDevice.set(key, list);
    }
  }

  const items = devices.map((row) => {
    const locations = {};
    for (const loc of allLocations) {
      const displayName = getDisplayLocationName(loc.name, loc.externalId);
      if (!displayName) continue;
      const key = `${row.id}:${loc.id}`;
      locations[displayName] = Number(locations[displayName] || 0) + Number(inventoryByDevice.get(key) || 0);
    }
    const imageList = imagesByDevice.get(String(row.id || "")) || [];
    const fallbackImage = row.image || undefined;
    return {
      id: row.id,
      manufacturer: row.manufacturer,
      model: row.model,
      modelFamily: row.modelFamily,
      category: row.category,
      grade: row.grade,
      region: row.region,
      storage: row.storage,
      price: Number(row.price || 0),
      image: imageList[0] || fallbackImage,
      images: imageList.length ? imageList : (fallbackImage ? [fallbackImage] : []),
      carrier: row.carrier || "N/A",
      screenSize: row.screenSize || "N/A",
      modular: row.modular || "N/A",
      color: row.color || "N/A",
      kitType: row.kitType || "N/A",
      productNotes: row.productNotes || "",
      weeklySpecial: Number(row.weeklySpecial || 0) === 1,
      available: Number(row.available || 0),
      locations
    };
  });

  if (!pageSize) return items;
  return { items, total, page, pageSize };
}

async function getCategoriesRuntime() {
  if (effectiveDbEngine === "postgres") {
    if (!pgClient) {
      throw new Error("Postgres runtime is not initialized.");
    }
    try {
      return await getCategoriesPostgres();
    } catch (error) {
      throw new Error(`Postgres categories query failed: ${error?.message || error}`);
    }
  }
  return getCategories();
}

async function getDevicesRuntime(url) {
  if (effectiveDbEngine === "postgres") {
    if (!pgClient) {
      throw new Error("Postgres runtime is not initialized.");
    }
    try {
      return await getDevicesPostgres(url);
    } catch (error) {
      throw new Error(`Postgres devices query failed: ${error?.message || error}`);
    }
  }
  return getDevices(url);
}

function getCategories() {
  return db.prepare("SELECT name FROM categories ORDER BY id").all().map((row) => row.name);
}

function parseAiFilters(promptRaw, selectedCategoryRaw = "") {
  const prompt = String(promptRaw || "").trim();
  if (!prompt) {
    return {
      selectedCategory: selectedCategoryRaw || "__ALL__",
      search: "",
      filters: {},
      warnings: ["Enter a prompt to parse filters."]
    };
  }
  const text = prompt.toLowerCase();
  const categories = getCategories();
  const manufacturers = db.prepare("SELECT name FROM manufacturers ORDER BY name").all().map((r) => r.name);
  const modelFamilies = db.prepare("SELECT DISTINCT model_family AS name FROM devices WHERE is_active = 1 ORDER BY model_family").all().map((r) => r.name);
  const modelFamilyCategoryRows = db.prepare(`
    SELECT DISTINCT d.model_family AS family, c.name AS category
    FROM devices d
    JOIN categories c ON c.id = d.category_id
    WHERE d.is_active = 1
  `).all();
  const modelFamilyToCategory = new Map(
    modelFamilyCategoryRows
      .map((row) => [String(row.family || "").toLowerCase(), String(row.category || "").trim()])
      .filter(([family, category]) => family && category)
  );
  const storages = db.prepare("SELECT DISTINCT storage_capacity AS name FROM devices WHERE is_active = 1 ORDER BY storage_capacity").all().map((r) => r.name);
  const regions = getDisplayRegions();
  const filters = {};
  const warnings = [];

  const allCategoryRequested = /\b(all categories|across categories|across all categories|any category|all device categories|all devices)\b/i.test(prompt);
  const categoryByMatch = categories.find((name) => text.includes(String(name).toLowerCase()))
    || (/\bsmart\s?phones?\b|\bphones?\b/.test(text) ? "Smartphones" : "")
    || (text.includes("tablet") ? "Tablets" : "")
    || (/\blaptop\b|\bnotebook\b/.test(text) ? "Laptops" : "")
    || (text.includes("wear") || text.includes("watch") ? "Wearables" : "")
    || (text.includes("accessor") ? "Accessories" : "");
  const categoryByModelFamily = [...modelFamilyToCategory.entries()].find(([family]) => family && text.includes(family))?.[1] || "";
  const categoryByKeyword = (/\bmacbook\b|\bthinkpad\b|\bxps\b|\bsurface laptop\b|\byoga\b/.test(text) ? "Laptops" : "")
    || (/\bipad\b|\bgalaxy tab\b/.test(text) ? "Tablets" : "")
    || (/\bapple watch\b|\bwatch ultra\b|\bsmartwatch\b/.test(text) ? "Wearables" : "")
    || (/\bairpods\b|\bcharger\b|\bkeyboard\b|\bheadset\b|\baccessor(y|ies)\b/.test(text) ? "Accessories" : "")
    || (/\biphone\b|\bgalaxy\b|\bpixel\b/.test(text) ? "Smartphones" : "");
  const selectedCategory = allCategoryRequested
    ? "__ALL__"
    : (categoryByMatch || categoryByModelFamily || categoryByKeyword || selectedCategoryRaw || "__ALL__");

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

async function parseAiFiltersRuntime(promptRaw, selectedCategoryRaw = "") {
  if (effectiveDbEngine !== "postgres") {
    return parseAiFilters(promptRaw, selectedCategoryRaw);
  }
  if (!pgClient) {
    throw new Error("Postgres runtime is not initialized.");
  }
  const prompt = String(promptRaw || "").trim();
  if (!prompt) {
    return {
      selectedCategory: selectedCategoryRaw || "__ALL__",
      search: "",
      filters: {},
      warnings: ["Enter a prompt to parse filters."]
    };
  }
  const text = prompt.toLowerCase();
  const categoriesRes = await pgClient.query(`SELECT name FROM ${postgresTableRef("categories")} ORDER BY id`);
  const manufacturersRes = await pgClient.query(`SELECT name FROM ${postgresTableRef("manufacturers")} ORDER BY name`);
  const modelFamiliesRes = await pgClient.query(`SELECT DISTINCT model_family AS name FROM ${postgresTableRef("devices")} WHERE is_active = 1 ORDER BY model_family`);
  const modelFamilyCategoryRes = await pgClient.query(`
    SELECT DISTINCT d.model_family AS family, c.name AS category
    FROM ${postgresTableRef("devices")} d
    JOIN ${postgresTableRef("categories")} c ON c.id = d.category_id
    WHERE d.is_active = 1
  `);
  const storagesRes = await pgClient.query(`SELECT DISTINCT storage_capacity AS name FROM ${postgresTableRef("devices")} WHERE is_active = 1 ORDER BY storage_capacity`);
  const regionsRes = await pgClient.query(`SELECT DISTINCT name, external_id AS "externalId" FROM ${postgresTableRef("locations")} ORDER BY name`);

  const categories = (categoriesRes.rows || []).map((r) => r.name);
  const manufacturers = (manufacturersRes.rows || []).map((r) => r.name);
  const modelFamilies = (modelFamiliesRes.rows || []).map((r) => r.name);
  const modelFamilyToCategory = new Map(
    (modelFamilyCategoryRes.rows || [])
      .map((row) => [String(row.family || "").toLowerCase(), String(row.category || "").trim()])
      .filter(([family, category]) => family && category)
  );
  const storages = (storagesRes.rows || []).map((r) => r.name);
  const regions = [...new Set(
    (regionsRes.rows || [])
      .map((row) => getDisplayLocationName(row.name, row.externalId))
      .filter(Boolean)
  )].sort((a, b) => String(a).localeCompare(String(b)));
  const filters = {};
  const warnings = [];

  const allCategoryRequested = /\b(all categories|across categories|across all categories|any category|all device categories|all devices)\b/i.test(prompt);
  const categoryByMatch = categories.find((name) => text.includes(String(name).toLowerCase()))
    || (/\bsmart\s?phones?\b|\bphones?\b/.test(text) ? "Smartphones" : "")
    || (text.includes("tablet") ? "Tablets" : "")
    || (/\blaptop\b|\bnotebook\b/.test(text) ? "Laptops" : "")
    || (text.includes("wear") || text.includes("watch") ? "Wearables" : "")
    || (text.includes("accessor") ? "Accessories" : "");
  const categoryByModelFamily = [...modelFamilyToCategory.entries()].find(([family]) => family && text.includes(family))?.[1] || "";
  const categoryByKeyword = (/\bmacbook\b|\bthinkpad\b|\bxps\b|\bsurface laptop\b|\byoga\b/.test(text) ? "Laptops" : "")
    || (/\bipad\b|\bgalaxy tab\b/.test(text) ? "Tablets" : "")
    || (/\bapple watch\b|\bwatch ultra\b|\bsmartwatch\b/.test(text) ? "Wearables" : "")
    || (/\bairpods\b|\bcharger\b|\bkeyboard\b|\bheadset\b|\baccessor(y|ies)\b/.test(text) ? "Accessories" : "")
    || (/\biphone\b|\bgalaxy\b|\bpixel\b/.test(text) ? "Smartphones" : "");
  const selectedCategory = allCategoryRequested
    ? "__ALL__"
    : (categoryByMatch || categoryByModelFamily || categoryByKeyword || selectedCategoryRaw || "__ALL__");

  const matchedManufacturers = manufacturers.filter((name) => text.includes(String(name).toLowerCase()));
  if (matchedManufacturers.length) filters.manufacturer = matchedManufacturers;

  const matchedModels = modelFamilies.filter((name) => text.includes(String(name).toLowerCase()));
  if (matchedModels.length) filters.modelFamily = matchedModels.slice(0, 8);

  const gradeMatches = [];
  if (/\bcpo\b/i.test(prompt)) gradeMatches.push("CPO");
  if (/\bgrade\s*a\b/i.test(prompt)) gradeMatches.push("A");
  if (/\bgrade\s*b\b/i.test(prompt)) gradeMatches.push("B");
  if (/\bgrade\s*c\b/i.test(prompt)) gradeMatches.push("C");
  if (gradeMatches.length) filters.grade = [...new Set(gradeMatches)];

  const matchedRegions = regions.filter((name) => text.includes(String(name).toLowerCase()));
  if (matchedRegions.length) filters.region = matchedRegions;

  const matchedStorages = storages.filter((name) => text.includes(String(name).toLowerCase()));
  if (matchedStorages.length) filters.storage = matchedStorages;

  const priceHintMatch = prompt.match(/\$?\s*(\d{2,6})(?:\s*usd|\s*dollars?)?/i);
  if (priceHintMatch) warnings.push("Price constraints were detected but not auto-applied because price filter is not configured.");

  const usedStructured = Object.keys(filters).length > 0;
  return {
    selectedCategory,
    search: usedStructured ? "" : prompt,
    filters,
    warnings
  };
}

function resolveCopilotSelectedCategoryContext(messageRaw, selectedCategoryRaw) {
  const selectedCategory = String(selectedCategoryRaw || "").trim() || "__ALL__";
  const message = String(messageRaw || "").trim();
  if (selectedCategory === "Smartphones" && !hasExplicitCategoryIntent(message)) {
    return "__ALL__";
  }
  return selectedCategory;
}

function buildCopilotSuggestedFilterName(parsed) {
  const filters = parsed?.filters && typeof parsed.filters === "object" ? parsed.filters : {};
  const search = String(parsed?.search || "").trim();
  const parts = [];
  const orderedKeys = ["manufacturer", "modelFamily", "grade", "region", "storage"];
  for (const key of orderedKeys) {
    const value = filters[key];
    const asArray = Array.isArray(value) ? value : (value ? [value] : []);
    const cleaned = asArray.map((entry) => String(entry || "").trim()).filter(Boolean);
    if (!cleaned.length) continue;
    parts.push(cleaned.slice(0, 2).join(" + "));
  }
  if (search) parts.push(search);
  if (!parts.length) return "AI Suggested Filter";
  return parts.join(" | ").slice(0, 80);
}

function hasExplicitCategoryIntent(promptRaw) {
  const text = String(promptRaw || "").toLowerCase();
  return /\bsmart\s?phones?\b|\bphones?\b|\btablet(s)?\b|\blaptop(s)?\b|\bnotebook(s)?\b|\bwearable(s)?\b|\bwatch(es)?\b|\baccessor(y|ies)\b/.test(text)
    || /\bmacbook\b|\bthinkpad\b|\bxps\b|\bsurface laptop\b|\byoga\b|\bipad\b|\bgalaxy tab\b|\bapple watch\b|\bwatch ultra\b|\bsmartwatch\b|\bairpods\b|\bcharger\b|\bkeyboard\b|\bheadset\b|\biphone\b|\bpixel\b/.test(text);
}

function deviceMatchesCopilotPayload(device, payload) {
  const selectedCategory = String(payload?.selectedCategory || "").trim();
  const search = String(payload?.search || "").trim().toLowerCase();
  const filters = payload?.filters && typeof payload.filters === "object" ? payload.filters : {};
  const availableRegions = device?.locations && typeof device.locations === "object"
    ? Object.entries(device.locations).filter(([, qty]) => Number(qty || 0) > 0).map(([name]) => name)
    : [];
  const text = `${device.manufacturer} ${device.model} ${device.modelFamily || ""} ${device.category}`.toLowerCase();
  if (selectedCategory && selectedCategory !== "__ALL__" && device.category !== selectedCategory) return false;
  if (search && !text.includes(search)) return false;
  if (Array.isArray(filters.manufacturer) && filters.manufacturer.length && !filters.manufacturer.includes(device.manufacturer)) return false;
  if (Array.isArray(filters.modelFamily) && filters.modelFamily.length && !filters.modelFamily.includes(device.modelFamily)) return false;
  if (Array.isArray(filters.grade) && filters.grade.length && !filters.grade.includes(device.grade)) return false;
  if (Array.isArray(filters.storage) && filters.storage.length && !filters.storage.includes(device.storage)) return false;
  if (Array.isArray(filters.region) && filters.region.length && !filters.region.some((regionName) => availableRegions.includes(regionName))) return false;
  return true;
}

function buildCopilotFilterOptions(promptRaw, parsed, allDevicesInput = null) {
  const allDevices = Array.isArray(allDevicesInput)
    ? allDevicesInput
    : getDevices(new URL("http://localhost/api/devices"));
  const categories = [...new Set(allDevices.map((d) => d.category))];
  if (categories.length < 2) return [];
  const shouldOfferChoices = String(parsed?.selectedCategory || "") === "__ALL__" || !hasExplicitCategoryIntent(promptRaw);
  if (!shouldOfferChoices) return [];
  const options = categories
    .map((categoryName) => {
      const payload = {
        selectedCategory: categoryName,
        search: String(parsed?.search || ""),
        filters: parsed?.filters && typeof parsed.filters === "object" ? parsed.filters : {}
      };
      const matchCount = allDevices.filter((device) => deviceMatchesCopilotPayload(device, payload)).length;
      return { categoryName, payload, matchCount };
    })
    .filter((entry) => entry.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount || a.categoryName.localeCompare(b.categoryName));
  if (options.length < 2) return [];
  return options.slice(0, 5).map((entry) => ({
    id: `cat-${entry.categoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: `${entry.categoryName} (${entry.matchCount})`,
    description: `${entry.matchCount} matching device${entry.matchCount === 1 ? "" : "s"}`,
    payload: {
      ...entry.payload,
      suggestedName: buildCopilotSuggestedFilterName(entry.payload)
    }
  }));
}

async function fetchNetsuiteInventoryForReview(lines, selectedLocation) {
  if (!NETSUITE_AI_REVIEW_RESTLET_URL) {
    return { map: new Map(), source: "local", warning: "NetSuite restlet is not configured. Used local inventory snapshot." };
  }
  const payload = {
    selectedLocation,
    lines: lines.map((line) => ({
      deviceId: String(line.productId || line.deviceId || "").trim(),
      model: String(line.model || "").trim(),
      grade: String(line.grade || "").trim(),
      quantity: Number(line.quantity || 0)
    }))
  };
  try {
    const response = await requestJson(NETSUITE_AI_REVIEW_RESTLET_URL, {
      method: "POST",
      contentType: "application/json",
      headers: {
        Accept: "application/json",
        ...(NETSUITE_AI_REVIEW_AUTH_HEADER ? { Authorization: NETSUITE_AI_REVIEW_AUTH_HEADER } : {})
      },
      body: JSON.stringify(payload)
    });
    const rows = Array.isArray(response?.inventory)
      ? response.inventory
      : (Array.isArray(response?.lines) ? response.lines : (Array.isArray(response?.items) ? response.items : []));
    const map = new Map();
    for (const row of rows) {
      const deviceId = String(row.deviceId || row.productId || "").trim();
      const location = String(row.location || selectedLocation || "").trim();
      const available = Number(row.available ?? row.quantityOnHand ?? row.quantity ?? 0);
      if (!deviceId || !location) continue;
      map.set(`${deviceId}|${location}`, Math.max(0, Math.floor(available)));
    }
    return {
      map,
      source: map.size ? "netsuite" : "local",
      warning: map.size ? "" : "NetSuite restlet response had no usable inventory rows. Used local inventory snapshot."
    };
  } catch (error) {
    return {
      map: new Map(),
      source: "local",
      warning: `NetSuite restlet lookup failed (${error.message || "unknown error"}). Used local inventory snapshot.`
    };
  }
}

function getDeviceQuantityByDisplayLocation(deviceId, displayLocationName) {
  const normalizedDeviceId = String(deviceId || "").trim();
  const normalizedDisplay = String(displayLocationName || "").trim();
  if (!normalizedDeviceId || !normalizedDisplay) return 0;
  const storedNames = resolveStoredLocationNames([normalizedDisplay]);
  if (!storedNames.length) return 0;
  const params = { $deviceId: normalizedDeviceId };
  const placeholders = storedNames.map((_, idx) => `$loc${idx}`);
  storedNames.forEach((name, idx) => {
    params[`$loc${idx}`] = name;
  });
  const row = db.prepare(`
    SELECT COALESCE(SUM(di.quantity), 0) AS quantity
    FROM device_inventory di
    JOIN locations l ON l.id = di.location_id
    WHERE di.device_id = $deviceId
      AND l.name IN (${placeholders.join(", ")})
  `).get(params);
  return Number(row?.quantity || 0);
}

async function getDeviceQuantityByDisplayLocationRuntime(deviceId, displayLocationName) {
  const normalizedDeviceId = String(deviceId || "").trim();
  const normalizedDisplay = String(displayLocationName || "").trim();
  if (!normalizedDeviceId || !normalizedDisplay) return 0;

  if (effectiveDbEngine === "postgres") {
    if (!pgClient) throw new Error("Postgres runtime is not initialized.");
    const storedNames = await resolveStoredLocationNamesPostgres([normalizedDisplay]);
    if (!storedNames.length) return 0;
    const rowRes = await pgClient.query(
      `
      SELECT COALESCE(SUM(di.quantity), 0) AS quantity
      FROM ${postgresTableRef("device_inventory")} di
      JOIN ${postgresTableRef("locations")} l ON l.id = di.location_id
      WHERE di.device_id::text = $1
        AND l.name = ANY($2::text[])
      `,
      [normalizedDeviceId, storedNames]
    );
    return Number(rowRes.rows?.[0]?.quantity || 0);
  }

  return getDeviceQuantityByDisplayLocation(normalizedDeviceId, normalizedDisplay);
}

async function validateRequestWithAi(body) {
  const lines = Array.isArray(body?.lines) ? body.lines : [];
  const selectedLocation = String(body?.selectedLocation || "").trim();
  const warnings = [];
  const suggestions = [];
  if (!lines.length) {
    warnings.push({ code: "EMPTY_REQUEST", message: "Request has no lines." });
    return { warnings, suggestions, inventorySource: "local" };
  }

  const netsuiteInventory = await fetchNetsuiteInventoryForReview(lines, selectedLocation);
  if (netsuiteInventory.warning) {
    warnings.push({ code: "INVENTORY_SOURCE", message: netsuiteInventory.warning });
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
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
      const externalKey = `${deviceId}|${selectedLocation}`;
      const externalAvailable = netsuiteInventory.map.has(externalKey) ? Number(netsuiteInventory.map.get(externalKey)) : null;
      const localAvailable = await getDeviceQuantityByDisplayLocationRuntime(deviceId, selectedLocation);
      const available = externalAvailable !== null ? externalAvailable : localAvailable;
      if (Number.isInteger(quantity) && quantity > available) {
        warnings.push({
          code: "LOCATION_SHORTAGE",
          lineIndex: index,
          message: `Line ${index + 1}: ${model} exceeds available inventory at ${selectedLocation} (requested ${quantity}, available ${available}).`
        });
        suggestions.push({
          type: "ADJUST_QTY",
          lineIndex: index,
          action: {
            type: "set_quantity",
            lineIndex: index,
            suggestedQuantity: Math.max(0, available)
          },
          message: Math.max(0, available) <= 0
            ? `Remove ${model} from this request for ${selectedLocation}.`
            : `Set quantity to ${Math.max(0, available)} for ${model} at ${selectedLocation}.`
        });
      }
    }
  }

  if (!selectedLocation) {
    suggestions.push({ type: "SELECT_LOCATION", message: "Select an order location before submitting." });
  }
  return { warnings, suggestions, inventorySource: netsuiteInventory.source };
}

async function validateNetsuitePayloadWithAi(body) {
  const payload = body && typeof body.payload === "object" ? body.payload : {};
  const requestId = String(body?.requestId || "").trim();
  let candidate = payload;
  if (requestId) {
    if (effectiveDbEngine === "postgres") {
      if (!pgClient) throw new Error("Postgres runtime is not initialized.");
      const rowResult = await pgClient.query(
        `SELECT * FROM ${postgresTableRef("quote_requests")} WHERE id = $1 LIMIT 1`,
        [requestId]
      );
      const row = rowResult.rows?.[0];
      if (!row?.id) {
        return { valid: false, errors: ["Request not found."], fixes: ["Use a valid requestId."] };
      }
      candidate = {
        requestId: row.id,
        requestNumber: row.request_number,
        company: row.company,
        createdBy: row.created_by_email,
        currencyCode: row.currency_code || "USD",
        lines: await getRequestLinesPostgres(row.id)
      };
    } else {
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

function runAiCopilotHeuristic(user, body) {
  const message = String(body?.message || "").trim();
  const selectedCategory = resolveCopilotSelectedCategoryContext(message, body?.selectedCategory);
  if (!message) {
    return { reply: "Please enter a message.", action: null };
  }
  if (isGradeDefinitionQuestion(message)) {
    return { reply: buildGradeDefinitionReply(message), action: null };
  }
  const lowered = message.toLowerCase();
  const parsed = parseAiFilters(message, selectedCategory);
  const hasFilters = Object.keys(parsed.filters || {}).length > 0 || String(parsed.search || "").trim().length > 0;
  const suggestedName = buildCopilotSuggestedFilterName(parsed);
  const options = buildCopilotFilterOptions(message, parsed);

  if (hasFilters && /(find|show|search|filter|need|looking|want)/.test(lowered)) {
    const parts = [];
    if (Object.keys(parsed.filters || {}).length) parts.push("structured filters");
    if (parsed.search) parts.push("search text");
    return {
      reply: options.length > 1
        ? "I found matches in multiple categories. Choose one to apply."
        : `I parsed your request and prepared ${parts.join(" and ")}. Apply this suggestion to jump to matching products.`,
      action: options.length > 1
        ? { type: "choose_filters", options }
        : {
          type: "apply_filters",
          payload: {
            ...parsed,
            suggestedName: suggestedName || "AI Suggested Filter"
          }
        }
    };
  }

  if (/best location|fulfill|fulfillment|shortage/.test(lowered)) {
    const locationRows = db.prepare(`
      SELECT l.name AS location, l.external_id AS externalId, COALESCE(SUM(di.quantity), 0) AS total
      FROM locations l
      LEFT JOIN device_inventory di ON di.location_id = l.id
      GROUP BY l.id, l.name
      ORDER BY total DESC, l.name ASC
    `).all();
    const totalsByDisplay = new Map();
    for (const row of locationRows) {
      const displayLocation = getDisplayLocationName(row.location, row.externalId);
      if (!displayLocation) continue;
      totalsByDisplay.set(
        displayLocation,
        Number(totalsByDisplay.get(displayLocation) || 0) + Number(row.total || 0)
      );
    }
    const best = [...totalsByDisplay.entries()]
      .map(([location, total]) => ({ location, total }))
      .sort((a, b) => b.total - a.total || a.location.localeCompare(b.location))[0];
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

function buildCopilotCatalogContext() {
  const dbGrades = db.prepare("SELECT DISTINCT grade AS name FROM devices WHERE is_active = 1 ORDER BY grade").all()
    .map((r) => String(r.name || "").trim())
    .filter(Boolean);
  const allGrades = [...new Set([...dbGrades, ...GRADE_DEFINITIONS.map((item) => item.code)])].sort((a, b) => a.localeCompare(b));
  return {
    categories: db.prepare("SELECT DISTINCT name FROM categories ORDER BY name").all().map((r) => String(r.name || "").trim()).filter(Boolean),
    manufacturers: db.prepare("SELECT DISTINCT name FROM manufacturers ORDER BY name").all().map((r) => String(r.name || "").trim()).filter(Boolean),
    modelFamilies: db.prepare("SELECT DISTINCT model_family AS name FROM devices WHERE is_active = 1 ORDER BY model_family").all().map((r) => String(r.name || "").trim()).filter(Boolean),
    grades: allGrades,
    storages: db.prepare("SELECT DISTINCT storage_capacity AS name FROM devices WHERE is_active = 1 ORDER BY storage_capacity").all().map((r) => String(r.name || "").trim()).filter(Boolean),
    regions: getDisplayRegions()
  };
}

function buildCopilotCatalogContextFromDevices(allDevices) {
  const devices = Array.isArray(allDevices) ? allDevices : [];
  const categories = [...new Set(devices.map((d) => String(d.category || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const manufacturers = [...new Set(devices.map((d) => String(d.manufacturer || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const modelFamilies = [...new Set(devices.map((d) => String(d.modelFamily || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const storages = [...new Set(devices.map((d) => String(d.storage || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const regions = [...new Set(
    devices.flatMap((device) => Object.entries(device?.locations || {})
      .filter(([, qty]) => Number(qty || 0) > 0)
      .map(([name]) => String(name || "").trim())
      .filter(Boolean))
  )].sort((a, b) => a.localeCompare(b));
  const dbGrades = [...new Set(devices.map((d) => String(d.grade || "").trim()).filter(Boolean))];
  const allGrades = [...new Set([...dbGrades, ...GRADE_DEFINITIONS.map((item) => item.code)])].sort((a, b) => a.localeCompare(b));

  return {
    categories,
    manufacturers,
    modelFamilies,
    grades: allGrades,
    storages,
    regions
  };
}

function buildCopilotHistoricalSalesContext() {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS completedCount,
      COALESCE(SUM(total_amount), 0) AS completedRevenue
    FROM quote_requests
    WHERE status = 'Completed'
  `).get();
  const totalUnits = db.prepare(`
    SELECT COALESCE(SUM(qrl.quantity), 0) AS units
    FROM quote_request_lines qrl
    JOIN quote_requests qr ON qr.id = qrl.request_id
    WHERE qr.status = 'Completed'
  `).get();
  const topCategories = db.prepare(`
    SELECT
      COALESCE(c.name, 'Unknown') AS category,
      COALESCE(SUM(qrl.quantity), 0) AS qty
    FROM quote_request_lines qrl
    JOIN quote_requests qr ON qr.id = qrl.request_id
    LEFT JOIN devices d ON d.id = qrl.device_id
    LEFT JOIN categories c ON c.id = d.category_id
    WHERE qr.status = 'Completed'
    GROUP BY COALESCE(c.name, 'Unknown')
    ORDER BY qty DESC, category ASC
    LIMIT 5
  `).all().map((r) => ({ category: r.category, quantity: Number(r.qty || 0) }));
  const topModels = db.prepare(`
    SELECT
      qrl.model AS model,
      COALESCE(SUM(qrl.quantity), 0) AS qty
    FROM quote_request_lines qrl
    JOIN quote_requests qr ON qr.id = qrl.request_id
    WHERE qr.status = 'Completed'
    GROUP BY qrl.model
    ORDER BY qty DESC, qrl.model ASC
    LIMIT 8
  `).all().map((r) => ({ model: r.model, quantity: Number(r.qty || 0) }));

  return {
    completedEstimateCount: Number(totals?.completedCount || 0),
    completedRevenue: Number(totals?.completedRevenue || 0),
    completedUnits: Number(totalUnits?.units || 0),
    topCategories,
    topModels
  };
}

async function buildCopilotHistoricalSalesContextRuntime() {
  if (effectiveDbEngine !== "postgres") {
    return buildCopilotHistoricalSalesContext();
  }
  if (!pgClient) {
    throw new Error("Postgres runtime is not initialized.");
  }
  const totalsRes = await pgClient.query(`
    SELECT
      COUNT(*)::bigint AS "completedCount",
      COALESCE(SUM(total_amount), 0) AS "completedRevenue"
    FROM ${postgresTableRef("quote_requests")}
    WHERE status = 'Completed'
  `);
  const totalUnitsRes = await pgClient.query(`
    SELECT COALESCE(SUM(qrl.quantity), 0) AS units
    FROM ${postgresTableRef("quote_request_lines")} qrl
    JOIN ${postgresTableRef("quote_requests")} qr ON qr.id = qrl.request_id
    WHERE qr.status = 'Completed'
  `);
  const topCategoriesRes = await pgClient.query(`
    SELECT
      COALESCE(c.name, 'Unknown') AS category,
      COALESCE(SUM(qrl.quantity), 0) AS qty
    FROM ${postgresTableRef("quote_request_lines")} qrl
    JOIN ${postgresTableRef("quote_requests")} qr ON qr.id = qrl.request_id
    LEFT JOIN ${postgresTableRef("devices")} d ON d.id = qrl.device_id
    LEFT JOIN ${postgresTableRef("categories")} c ON c.id = d.category_id
    WHERE qr.status = 'Completed'
    GROUP BY COALESCE(c.name, 'Unknown')
    ORDER BY qty DESC, category ASC
    LIMIT 5
  `);
  const topModelsRes = await pgClient.query(`
    SELECT
      qrl.model AS model,
      COALESCE(SUM(qrl.quantity), 0) AS qty
    FROM ${postgresTableRef("quote_request_lines")} qrl
    JOIN ${postgresTableRef("quote_requests")} qr ON qr.id = qrl.request_id
    WHERE qr.status = 'Completed'
    GROUP BY qrl.model
    ORDER BY qty DESC, qrl.model ASC
    LIMIT 8
  `);
  const totals = totalsRes.rows?.[0] || {};
  const totalUnits = totalUnitsRes.rows?.[0] || {};
  const topCategories = (topCategoriesRes.rows || []).map((r) => ({ category: r.category, quantity: Number(r.qty || 0) }));
  const topModels = (topModelsRes.rows || []).map((r) => ({ model: r.model, quantity: Number(r.qty || 0) }));
  return {
    completedEstimateCount: Number(totals.completedCount || 0),
    completedRevenue: Number(totals.completedRevenue || 0),
    completedUnits: Number(totalUnits.units || 0),
    topCategories,
    topModels
  };
}

function formatUsdValue(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "$0.00";
  return `$${numeric.toFixed(2)}`;
}

function formatBulletList(items, maxItems = 8) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (!values.length) return "";
  const slice = values.slice(0, maxItems);
  const moreCount = Math.max(0, values.length - slice.length);
  const lines = slice.map((item) => `- ${item}`);
  if (moreCount > 0) lines.push(`- +${moreCount} more`);
  return lines.join("\n");
}

function normalizeGradeCode(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function isGradeDefinitionQuestion(messageRaw) {
  const text = String(messageRaw || "").toLowerCase();
  if (!text) return false;
  return /(grade|grading|condition|cpo|open box|c2|c4|c5|c6|cob|crc|crd|crx|d2|d3|d4|md a|md b|tbg|tbg fin|tbg2)/.test(text);
}

function buildGradeDefinitionReply(messageRaw) {
  const text = String(messageRaw || "").toLowerCase();
  const matches = GRADE_DEFINITIONS.filter((item) => {
    const code = String(item.code || "").toLowerCase();
    const codeSpaced = code.replace(/\s+/g, "[\\s-]*");
    const re = new RegExp(`(^|[^a-z0-9])${codeSpaced}([^a-z0-9]|$)`, "i");
    return re.test(text);
  });
  if (matches.length === 1) {
    const grade = matches[0];
    const placeholderSuffix = grade.placeholder ? " This is currently a placeholder and should be replaced with your internal SOP definition." : "";
    return `${grade.code}: ${grade.summary} ${grade.details}${placeholderSuffix}`;
  }
  if (matches.length > 1) {
    const preview = matches.slice(0, 5).map((item) => `${item.code}: ${item.summary}`).join(" | ");
    return `Here are the grade details I found: ${preview}${matches.length > 5 ? " | and more." : "."} You can also click any grade in the UI to open the full grade guide modal.`;
  }
  return "I can explain your grading codes (C2, C4, C5, C6, COB, CPO, CRC, CRD, CRX, D2, D3, D4, MD A, MD B, TBG, TBG FIN, TBG2). Click any grade in the UI for the full guide.";
}

function buildOrderHistoryFiltersFromMessage(message, selectedCategory) {
  const parsed = parseAiFilters(message, selectedCategory);
  return {
    search: String(parsed?.search || "").trim(),
    manufacturers: Array.isArray(parsed?.filters?.manufacturer) ? parsed.filters.manufacturer : [],
    modelFamilies: Array.isArray(parsed?.filters?.modelFamily) ? parsed.filters.modelFamily : [],
    grades: Array.isArray(parsed?.filters?.grade) ? parsed.filters.grade : [],
    storages: Array.isArray(parsed?.filters?.storage) ? parsed.filters.storage : []
  };
}

async function buildOrderHistoryFiltersFromMessageRuntime(message, selectedCategory) {
  const parsed = await parseAiFiltersRuntime(message, selectedCategory);
  return {
    search: String(parsed?.search || "").trim(),
    manufacturers: Array.isArray(parsed?.filters?.manufacturer) ? parsed.filters.manufacturer : [],
    modelFamilies: Array.isArray(parsed?.filters?.modelFamily) ? parsed.filters.modelFamily : [],
    grades: Array.isArray(parsed?.filters?.grade) ? parsed.filters.grade : [],
    storages: Array.isArray(parsed?.filters?.storage) ? parsed.filters.storage : []
  };
}

function queryOrderHistoryLineRows(user, message, selectedCategory, limit = 150) {
  const filters = buildOrderHistoryFiltersFromMessage(message, selectedCategory);
  const clauses = [];
  const params = [];

  if (user?.role !== "admin") {
    clauses.push("qr.company = ?");
    params.push(String(user?.company || "").trim());
  }

  if (filters.search) {
    clauses.push("LOWER(qrl.model) LIKE ?");
    params.push(`%${filters.search.toLowerCase()}%`);
  }
  if (filters.modelFamilies.length) {
    const parts = [];
    for (const family of filters.modelFamilies) {
      parts.push("LOWER(qrl.model) LIKE ?");
      params.push(`%${String(family || "").toLowerCase()}%`);
    }
    clauses.push(`(${parts.join(" OR ")})`);
  }
  if (filters.manufacturers.length) {
    const parts = [];
    for (const manufacturer of filters.manufacturers) {
      parts.push("LOWER(qrl.model) LIKE ?");
      params.push(`%${String(manufacturer || "").toLowerCase()}%`);
    }
    clauses.push(`(${parts.join(" OR ")})`);
  }
  if (filters.grades.length) {
    const marks = filters.grades.map(() => "?").join(", ");
    clauses.push(`qrl.grade IN (${marks})`);
    for (const grade of filters.grades) params.push(grade);
  }
  if (filters.storages.length) {
    const parts = [];
    for (const storage of filters.storages) {
      parts.push("LOWER(qrl.model) LIKE ?");
      params.push(`%${String(storage || "").toLowerCase()}%`);
    }
    clauses.push(`(${parts.join(" OR ")})`);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `
    SELECT
      qrl.model AS model,
      qrl.grade AS grade,
      qrl.quantity AS quantity,
      qrl.offer_price AS offerPrice,
      qr.request_number AS requestNumber,
      qr.created_at AS createdAt,
      qr.status AS status
    FROM quote_request_lines qrl
    JOIN quote_requests qr ON qr.id = qrl.request_id
    ${whereSql}
    ORDER BY qr.created_at DESC, qrl.id DESC
    LIMIT ${Math.max(1, Math.min(500, Number(limit || 150)))}
  `;

  return db.prepare(sql).all(...params).map((row) => ({
    model: String(row.model || "").trim(),
    grade: String(row.grade || "").trim(),
    quantity: Number(row.quantity || 0),
    offerPrice: Number(row.offerPrice || 0),
    requestNumber: String(row.requestNumber || "").trim(),
    createdAt: String(row.createdAt || "").trim(),
    status: String(row.status || "").trim()
  }));
}

async function queryOrderHistoryLineRowsRuntime(user, message, selectedCategory, limit = 150) {
  if (effectiveDbEngine !== "postgres") {
    return queryOrderHistoryLineRows(user, message, selectedCategory, limit);
  }
  if (!pgClient) {
    throw new Error("Postgres runtime is not initialized.");
  }
  const filters = await buildOrderHistoryFiltersFromMessageRuntime(message, selectedCategory);
  const clauses = [];
  const params = [];
  const pushParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (user?.role !== "admin") {
    const marker = pushParam(String(user?.company || "").trim());
    clauses.push(`qr.company = ${marker}`);
  }
  if (filters.search) {
    const marker = pushParam(`%${filters.search.toLowerCase()}%`);
    clauses.push(`LOWER(qrl.model) LIKE ${marker}`);
  }
  if (filters.modelFamilies.length) {
    const parts = [];
    for (const family of filters.modelFamilies) {
      const marker = pushParam(`%${String(family || "").toLowerCase()}%`);
      parts.push(`LOWER(qrl.model) LIKE ${marker}`);
    }
    clauses.push(`(${parts.join(" OR ")})`);
  }
  if (filters.manufacturers.length) {
    const parts = [];
    for (const manufacturer of filters.manufacturers) {
      const marker = pushParam(`%${String(manufacturer || "").toLowerCase()}%`);
      parts.push(`LOWER(qrl.model) LIKE ${marker}`);
    }
    clauses.push(`(${parts.join(" OR ")})`);
  }
  if (filters.grades.length) {
    const marker = pushParam(filters.grades);
    clauses.push(`qrl.grade = ANY(${marker}::text[])`);
  }
  if (filters.storages.length) {
    const parts = [];
    for (const storage of filters.storages) {
      const marker = pushParam(`%${String(storage || "").toLowerCase()}%`);
      parts.push(`LOWER(qrl.model) LIKE ${marker}`);
    }
    clauses.push(`(${parts.join(" OR ")})`);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limitValue = Math.max(1, Math.min(500, Number(limit || 150)));
  const limitMarker = pushParam(limitValue);
  const sql = `
    SELECT
      qrl.model AS model,
      qrl.grade AS grade,
      qrl.quantity AS quantity,
      qrl.offer_price AS "offerPrice",
      qr.request_number AS "requestNumber",
      qr.created_at AS "createdAt",
      qr.status AS status
    FROM ${postgresTableRef("quote_request_lines")} qrl
    JOIN ${postgresTableRef("quote_requests")} qr ON qr.id = qrl.request_id
    ${whereSql}
    ORDER BY qr.created_at DESC, qrl.id DESC
    LIMIT ${limitMarker}
  `;
  const result = await pgClient.query(sql, params);
  return (result.rows || []).map((row) => ({
    model: String(row.model || "").trim(),
    grade: String(row.grade || "").trim(),
    quantity: Number(row.quantity || 0),
    offerPrice: Number(row.offerPrice || 0),
    requestNumber: String(row.requestNumber || "").trim(),
    createdAt: String(row.createdAt || "").trim(),
    status: String(row.status || "").trim()
  }));
}

function buildCopilotUserOrderHistoryContext(user) {
  const lines = queryOrderHistoryLineRows(user, "", "Smartphones", 300);
  const byModel = new Map();
  for (const row of lines) {
    const key = row.model || "Unknown";
    const entry = byModel.get(key) || {
      model: key,
      orders: 0,
      units: 0,
      weightedValue: 0,
      lastOfferPrice: 0,
      lastPurchasedAt: "",
      lastRequestNumber: ""
    };
    entry.orders += 1;
    entry.units += Number(row.quantity || 0);
    entry.weightedValue += Number(row.offerPrice || 0) * Number(row.quantity || 0);
    if (!entry.lastPurchasedAt || new Date(row.createdAt).getTime() > new Date(entry.lastPurchasedAt).getTime()) {
      entry.lastPurchasedAt = row.createdAt;
      entry.lastOfferPrice = Number(row.offerPrice || 0);
      entry.lastRequestNumber = row.requestNumber || "";
    }
    byModel.set(key, entry);
  }

  const topModelPriceStats = [...byModel.values()]
    .map((row) => ({
      model: row.model,
      orders: row.orders,
      units: row.units,
      averageOfferPrice: row.units > 0 ? Number((row.weightedValue / row.units).toFixed(2)) : 0,
      lastOfferPrice: Number((row.lastOfferPrice || 0).toFixed(2)),
      lastPurchasedAt: row.lastPurchasedAt,
      lastRequestNumber: row.lastRequestNumber
    }))
    .sort((a, b) => b.units - a.units || a.model.localeCompare(b.model))
    .slice(0, 40);

  const recentOrders = (() => {
    const clauses = [];
    const params = [];
    if (user?.role !== "admin") {
      clauses.push("qr.company = ?");
      params.push(String(user?.company || "").trim());
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return db.prepare(`
      SELECT
        qr.request_number AS requestNumber,
        qr.status AS status,
        qr.total_amount AS totalAmount,
        qr.currency_code AS currencyCode,
        qr.created_at AS createdAt,
        COUNT(qrl.id) AS lineCount
      FROM quote_requests qr
      LEFT JOIN quote_request_lines qrl ON qrl.request_id = qr.id
      ${whereSql}
      GROUP BY qr.id, qr.request_number, qr.status, qr.total_amount, qr.currency_code, qr.created_at
      ORDER BY qr.created_at DESC
      LIMIT 8
    `).all(...params).map((row) => ({
      requestNumber: String(row.requestNumber || "").trim(),
      status: String(row.status || "").trim(),
      totalAmount: Number(row.totalAmount || 0),
      currencyCode: String(row.currencyCode || "USD").trim(),
      createdAt: String(row.createdAt || "").trim(),
      lineCount: Number(row.lineCount || 0)
    }));
  })();

  return {
    scope: user?.role === "admin" ? "all companies (admin view)" : `company ${String(user?.company || "").trim()}`,
    totalLineItems: lines.length,
    topModelPriceStats,
    recentOrders,
    cartActivity: {
      scope: user?.role === "admin" ? "all users (admin view)" : "current user",
      totalEvents: 0,
      pendingEvents: 0,
      topModels: [],
      recentAdds: []
    }
  };
}

async function buildCopilotCartItemActivityContextRuntime(user) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const params = [];
  let whereSql = "";
  if (user?.role !== "admin") {
    params.push(Number(user?.id || 0));
    whereSql = `WHERE cia.user_id = $${params.length}`;
  }
  const totalsRes = await pgClient.query(`
    SELECT
      COUNT(*)::bigint AS "totalEvents",
      COALESCE(SUM(CASE WHEN cia.ever_requested = 0 THEN 1 ELSE 0 END), 0)::bigint AS "pendingEvents"
    FROM ${postgresTableRef("cart_item_activity")} cia
    ${whereSql}
  `, params);
  const topModelsRes = await pgClient.query(`
    SELECT
      cia.model AS model,
      COALESCE(SUM(cia.quantity), 0)::bigint AS units,
      COALESCE(AVG(cia.offer_price), 0) AS "avgOfferPrice",
      MAX(cia.added_at) AS "lastAddedAt",
      COALESCE(SUM(CASE WHEN cia.ever_requested = 1 THEN cia.quantity ELSE 0 END), 0)::bigint AS "requestedUnits"
    FROM ${postgresTableRef("cart_item_activity")} cia
    ${whereSql}
    GROUP BY cia.model
    ORDER BY units DESC, model ASC
    LIMIT 12
  `, params);
  const recentAddsRes = await pgClient.query(`
    SELECT
      cia.model AS model,
      cia.grade AS grade,
      cia.quantity AS quantity,
      cia.offer_price AS "offerPrice",
      cia.ever_requested AS "everRequested",
      cia.added_at AS "addedAt"
    FROM ${postgresTableRef("cart_item_activity")} cia
    ${whereSql}
    ORDER BY cia.added_at DESC, cia.id DESC
    LIMIT 20
  `, params);
  const totals = totalsRes.rows?.[0] || {};
  return {
    scope: user?.role === "admin" ? "all users (admin view)" : "current user",
    totalEvents: Number(totals.totalEvents || 0),
    pendingEvents: Number(totals.pendingEvents || 0),
    topModels: (topModelsRes.rows || []).map((row) => ({
      model: String(row.model || "").trim(),
      units: Number(row.units || 0),
      avgOfferPrice: Number(Number(row.avgOfferPrice || 0).toFixed(2)),
      requestedUnits: Number(row.requestedUnits || 0),
      lastAddedAt: String(row.lastAddedAt || "").trim()
    })),
    recentAdds: (recentAddsRes.rows || []).map((row) => ({
      model: String(row.model || "").trim(),
      grade: String(row.grade || "").trim(),
      quantity: Number(row.quantity || 0),
      offerPrice: Number(row.offerPrice || 0),
      everRequested: Number(row.everRequested || 0) === 1,
      addedAt: String(row.addedAt || "").trim()
    }))
  };
}

async function buildCopilotUserOrderHistoryContextRuntime(user) {
  if (effectiveDbEngine !== "postgres") {
    return buildCopilotUserOrderHistoryContext(user);
  }
  if (!pgClient) {
    throw new Error("Postgres runtime is not initialized.");
  }
  const lines = await queryOrderHistoryLineRowsRuntime(user, "", "Smartphones", 300);
  const byModel = new Map();
  for (const row of lines) {
    const key = row.model || "Unknown";
    const entry = byModel.get(key) || {
      model: key,
      orders: 0,
      units: 0,
      weightedValue: 0,
      lastOfferPrice: 0,
      lastPurchasedAt: "",
      lastRequestNumber: ""
    };
    entry.orders += 1;
    entry.units += Number(row.quantity || 0);
    entry.weightedValue += Number(row.offerPrice || 0) * Number(row.quantity || 0);
    if (!entry.lastPurchasedAt || new Date(row.createdAt).getTime() > new Date(entry.lastPurchasedAt).getTime()) {
      entry.lastPurchasedAt = row.createdAt;
      entry.lastOfferPrice = Number(row.offerPrice || 0);
      entry.lastRequestNumber = row.requestNumber || "";
    }
    byModel.set(key, entry);
  }
  const topModelPriceStats = [...byModel.values()]
    .map((row) => ({
      model: row.model,
      orders: row.orders,
      units: row.units,
      averageOfferPrice: row.units > 0 ? Number((row.weightedValue / row.units).toFixed(2)) : 0,
      lastOfferPrice: Number((row.lastOfferPrice || 0).toFixed(2)),
      lastPurchasedAt: row.lastPurchasedAt,
      lastRequestNumber: row.lastRequestNumber
    }))
    .sort((a, b) => b.units - a.units || a.model.localeCompare(b.model))
    .slice(0, 40);

  const clauses = [];
  const params = [];
  if (user?.role !== "admin") {
    params.push(String(user?.company || "").trim());
    clauses.push(`qr.company = $${params.length}`);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const recentRes = await pgClient.query(
    `
      SELECT
        qr.request_number AS "requestNumber",
        qr.status AS status,
        qr.total_amount AS "totalAmount",
        qr.currency_code AS "currencyCode",
        qr.created_at AS "createdAt",
        COUNT(qrl.id)::bigint AS "lineCount"
      FROM ${postgresTableRef("quote_requests")} qr
      LEFT JOIN ${postgresTableRef("quote_request_lines")} qrl ON qrl.request_id = qr.id
      ${whereSql}
      GROUP BY qr.id, qr.request_number, qr.status, qr.total_amount, qr.currency_code, qr.created_at
      ORDER BY qr.created_at DESC
      LIMIT 8
    `,
    params
  );
  const recentOrders = (recentRes.rows || []).map((row) => ({
    requestNumber: String(row.requestNumber || "").trim(),
    status: String(row.status || "").trim(),
    totalAmount: Number(row.totalAmount || 0),
    currencyCode: String(row.currencyCode || "USD").trim(),
    createdAt: String(row.createdAt || "").trim(),
    lineCount: Number(row.lineCount || 0)
  }));
  const cartActivity = await buildCopilotCartItemActivityContextRuntime(user);
  return {
    scope: user?.role === "admin" ? "all companies (admin view)" : `company ${String(user?.company || "").trim()}`,
    totalLineItems: lines.length,
    topModelPriceStats,
    recentOrders,
    cartActivity
  };
}

function isOrderHistoryQuestion(messageRaw) {
  const text = String(messageRaw || "").toLowerCase();
  return /(last time|previous order|previously|what price|price did|average price|avg price|paid|bought|historical|order history)/.test(text);
}

function isOrderDetailsQuestion(messageRaw) {
  const text = String(messageRaw || "").toLowerCase();
  return /(entire order|whole order|order details|show order|order summary|what is in order|line items|lines in order|details about order)/.test(text)
    || /\b(req-\d{4}-\d{4}|hist-\d{4}|hist-est-\d{4}|est-\d{4}-\d{4})\b/i.test(text);
}

function extractOrderReference(messageRaw) {
  const message = String(messageRaw || "");
  const match = message.match(/\b(req-\d{4}-\d{4}|hist-\d{4}|hist-est-\d{4}|est-\d{4}-\d{4})\b/i);
  return match ? String(match[1] || "").toUpperCase() : "";
}

async function queryOrdersForCopilotRuntime(user, limit = 8) {
  if (!pgClient) {
    throw new Error("Postgres runtime is not initialized.");
  }
  const safeLimit = Math.max(1, Math.min(40, Number(limit || 8)));
  if (user?.role === "admin") {
    const result = await pgClient.query(
      `SELECT * FROM ${postgresTableRef("quote_requests")} ORDER BY created_at DESC LIMIT ${safeLimit}`
    );
    return Array.isArray(result.rows) ? result.rows : [];
  }
  const result = await pgClient.query(
    `SELECT * FROM ${postgresTableRef("quote_requests")} WHERE company = $1 ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [String(user?.company || "").trim()]
  );
  return Array.isArray(result.rows) ? result.rows : [];
}

async function answerOrderDetailsQuestionRuntime(user, message) {
  if (!pgClient) {
    throw new Error("Postgres runtime is not initialized.");
  }
  const orderRef = extractOrderReference(message);
  const rows = await queryOrdersForCopilotRuntime(user, 15);
  if (!rows.length) return null;
  const targetRow = orderRef
    ? rows.find((r) => String(r.request_number || "").toUpperCase() === orderRef || String(r.netsuite_estimate_number || "").toUpperCase() === orderRef)
    : rows[0];
  if (orderRef && !targetRow) {
    return { reply: `I couldn't find order ${orderRef} in your accessible order history.`, action: null };
  }
  if (!targetRow) return null;
  const mapped = await mapRequestRowPostgres(targetRow);
  const lineDetails = Array.isArray(mapped.lines) ? mapped.lines : [];
  const linePreview = lineDetails.slice(0, 8).map((line) => {
    const qty = Number(line.quantity || 0);
    const price = Number(line.offerPrice || 0);
    return `${line.model} (${line.grade}) x${qty} @ ${formatUsdValue(price)} = ${formatUsdValue(qty * price)}`;
  });
  const moreCount = Math.max(0, lineDetails.length - linePreview.length);
  const header = `Order ${mapped.requestNumber} is ${mapped.status}. Created ${new Date(mapped.createdAt).toLocaleDateString("en-US")}. Total ${formatUsdValue(mapped.total)} (${lineDetails.length} lines).`;
  const linesText = linePreview.length
    ? `\nLines:\n${formatBulletList(linePreview)}${moreCount ? `\n- +${moreCount} more line(s)` : ""}`
    : "\nThis order has no line items.";
  return { reply: `${header}${linesText}`, action: null };
}

function isAddFromHistoryIntent(messageRaw) {
  const text = String(messageRaw || "").toLowerCase();
  const asksToAdd = /\b(add|include|reorder|repeat|same as|use)\b/.test(text);
  const referencesHistory = /\b(last order|previous order|historic|history|past order|before)\b/.test(text)
    || /\b(req-\d{4}-\d{4}|hist-\d{4}|hist-est-\d{4}|est-\d{4}-\d{4})\b/i.test(text);
  return asksToAdd && referencesHistory;
}

async function buildAddFromHistoricalOrderActionRuntime(user, message, allDevicesInput = null) {
  if (!pgClient) {
    throw new Error("Postgres runtime is not initialized.");
  }
  const rows = await queryOrdersForCopilotRuntime(user, 25);
  if (!rows.length) return null;
  const orderRef = extractOrderReference(message);
  const targetRow = orderRef
    ? rows.find((r) => String(r.request_number || "").toUpperCase() === orderRef || String(r.netsuite_estimate_number || "").toUpperCase() === orderRef)
    : rows[0];
  if (!targetRow) {
    return { reply: `I couldn't find order ${orderRef} in your accessible order history.`, action: null };
  }
  const request = await mapRequestRowPostgres(targetRow);
  const allDevices = Array.isArray(allDevicesInput)
    ? allDevicesInput
    : getDevices(new URL("http://localhost/api/devices"));
  const addLines = [];
  const unavailableModels = [];
  const adjustedModels = [];
  for (const line of Array.isArray(request.lines) ? request.lines : []) {
    const lineModel = String(line.model || "").trim();
    const lineGrade = String(line.grade || "").trim();
    if (!lineModel) continue;
    const candidates = allDevices
      .filter((d) => String(d.model || "").toLowerCase() === lineModel.toLowerCase()
        && (!lineGrade || String(d.grade || "").toLowerCase() === lineGrade.toLowerCase()))
      .sort((a, b) => Number(b.available || 0) - Number(a.available || 0));
    const fallbackCandidates = candidates.length
      ? candidates
      : allDevices
        .filter((d) => String(d.model || "").toLowerCase().includes(lineModel.toLowerCase()))
        .sort((a, b) => Number(b.available || 0) - Number(a.available || 0));
    const chosen = fallbackCandidates[0];
    const available = Number(chosen?.available || 0);
    if (!chosen || available <= 0) {
      unavailableModels.push(lineModel);
      continue;
    }
    const requestedQty = Math.max(1, Math.floor(Number(line.quantity || 1)));
    const quantity = Math.min(requestedQty, available);
    if (quantity < requestedQty) adjustedModels.push(`${lineModel} (${requestedQty} requested, ${quantity} added)`);
    addLines.push({
      deviceId: chosen.id,
      quantity,
      offerPrice: Number.isFinite(Number(line.offerPrice)) ? Number(line.offerPrice) : Number(chosen.price || 0),
      note: `From historical order ${request.requestNumber}`
    });
  }
  if (!addLines.length) {
    const unavailableText = unavailableModels.length ? `\nUnavailable:\n${formatBulletList(unavailableModels, 5)}` : "";
    return { reply: `I found ${request.requestNumber}, but none of its items are currently available in inventory.${unavailableText}`, action: null };
  }
  const addedCount = addLines.length;
  const skippedCount = unavailableModels.length;
  const adjustmentsText = adjustedModels.length ? `\nAdjusted quantities:\n${formatBulletList(adjustedModels, 4)}` : "";
  const skippedText = skippedCount ? `\nSkipped unavailable items (${skippedCount}):\n${formatBulletList(unavailableModels, 5)}` : "";
  return {
    reply: `I prepared ${addedCount} item${addedCount === 1 ? "" : "s"} from ${request.requestNumber} and will add only what is currently in inventory.${skippedText}${adjustmentsText}`,
    action: { type: "add_lines_to_request", payload: { sourceOrder: request.requestNumber, lines: addLines } }
  };
}

function answerOrderHistoryQuestion(user, message, selectedCategory) {
  const rows = queryOrderHistoryLineRows(user, message, selectedCategory, 250);
  if (!rows.length) return null;

  const text = String(message || "").toLowerCase();
  const wantsAverage = /\b(average|avg|mean)\b/.test(text);
  const wantsLast = /\b(last|latest|previous|last time)\b/.test(text) || !wantsAverage;

  const distinctModels = [...new Set(rows.map((r) => r.model).filter(Boolean))];
  if (distinctModels.length > 3 && !/\biphone|galaxy|pixel|ipad|watch|airpods|macbook|thinkpad|model\b/.test(text)) {
    const sample = distinctModels.slice(0, 3).join(", ");
    return {
      reply: `I found order history for multiple models. Please specify one model.\nExamples:\n${formatBulletList(distinctModels.slice(0, 3))}`,
      action: null
    };
  }

  const byModel = new Map();
  for (const row of rows) {
    const key = row.model;
    const entry = byModel.get(key) || {
      model: key,
      units: 0,
      weightedValue: 0,
      last: row
    };
    entry.units += Number(row.quantity || 0);
    entry.weightedValue += Number(row.offerPrice || 0) * Number(row.quantity || 0);
    if (new Date(row.createdAt).getTime() > new Date(entry.last.createdAt).getTime()) {
      entry.last = row;
    }
    byModel.set(key, entry);
  }

  const ranked = [...byModel.values()].sort((a, b) => b.units - a.units || a.model.localeCompare(b.model));
  const target = ranked[0];
  const avg = target.units > 0 ? Number((target.weightedValue / target.units).toFixed(2)) : Number(target.last.offerPrice || 0);
  const last = target.last;

  const parts = [];
  if (wantsLast) {
    parts.push(`Last time for ${target.model}: ${formatUsdValue(last.offerPrice)} in ${last.requestNumber} on ${new Date(last.createdAt).toLocaleDateString("en-US")}.`);
  }
  if (wantsAverage) {
    parts.push(`Average historical offer price for ${target.model}: ${formatUsdValue(avg)} across ${target.units} units.`);
  } else {
    parts.push(`Historical average for ${target.model}: ${formatUsdValue(avg)} across ${target.units} units.`);
  }
  return {
    reply: parts.join(" "),
    action: null
  };
}

async function answerOrderHistoryQuestionRuntime(user, message, selectedCategory) {
  if (effectiveDbEngine !== "postgres") {
    return answerOrderHistoryQuestion(user, message, selectedCategory);
  }
  if (!pgClient) {
    throw new Error("Postgres runtime is not initialized.");
  }
  const rows = await queryOrderHistoryLineRowsRuntime(user, message, selectedCategory, 250);
  if (!rows.length) return null;
  const text = String(message || "").toLowerCase();
  const wantsAverage = /\b(average|avg|mean)\b/.test(text);
  const wantsLast = /\b(last|latest|previous|last time)\b/.test(text) || !wantsAverage;
  const distinctModels = [...new Set(rows.map((r) => r.model).filter(Boolean))];
  if (distinctModels.length > 3 && !/\biphone|galaxy|pixel|ipad|watch|airpods|macbook|thinkpad|model\b/.test(text)) {
    return { reply: `I found order history for multiple models. Please specify one model.\nExamples:\n${formatBulletList(distinctModels.slice(0, 3))}`, action: null };
  }
  const byModel = new Map();
  for (const row of rows) {
    const key = row.model;
    const entry = byModel.get(key) || { model: key, units: 0, weightedValue: 0, last: row };
    entry.units += Number(row.quantity || 0);
    entry.weightedValue += Number(row.offerPrice || 0) * Number(row.quantity || 0);
    if (new Date(row.createdAt).getTime() > new Date(entry.last.createdAt).getTime()) {
      entry.last = row;
    }
    byModel.set(key, entry);
  }
  const ranked = [...byModel.values()].sort((a, b) => b.units - a.units || a.model.localeCompare(b.model));
  const target = ranked[0];
  const avg = target.units > 0 ? Number((target.weightedValue / target.units).toFixed(2)) : Number(target.last.offerPrice || 0);
  const last = target.last;
  const parts = [];
  if (wantsLast) parts.push(`Last time for ${target.model}: ${formatUsdValue(last.offerPrice)} in ${last.requestNumber} on ${new Date(last.createdAt).toLocaleDateString("en-US")}.`);
  if (wantsAverage) parts.push(`Average historical offer price for ${target.model}: ${formatUsdValue(avg)} across ${target.units} units.`);
  else parts.push(`Historical average for ${target.model}: ${formatUsdValue(avg)} across ${target.units} units.`);
  return { reply: parts.join(" "), action: null };
}

function normalizeCopilotPlanPayload(plan, fallbackCategory, catalog) {
  const asArray = (value) => (Array.isArray(value) ? value.map((x) => String(x || "").trim()).filter(Boolean) : []);
  const normalizeFromAllowed = (value, allowedValues) => {
    const allowed = new Set((allowedValues || []).map((x) => String(x || "").trim()).filter(Boolean));
    const lowerToCanonical = new Map([...allowed].map((item) => [item.toLowerCase(), item]));
    return asArray(value)
      .map((entry) => lowerToCanonical.get(String(entry || "").toLowerCase()))
      .filter(Boolean)
      .filter((item, idx, arr) => arr.indexOf(item) === idx);
  };

  const selectedRaw = String(plan?.selectedCategory || "").trim();
  const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
  const categoriesLowerMap = new Map(categories.map((item) => [item.toLowerCase(), item]));
  const selectedCategory = selectedRaw === "__ALL__"
    ? "__ALL__"
    : (categoriesLowerMap.get(selectedRaw.toLowerCase()) || String(fallbackCategory || "Smartphones"));

  const filters = {};
  const normalizedManufacturers = normalizeFromAllowed(plan?.filters?.manufacturer, catalog?.manufacturers);
  if (normalizedManufacturers.length) filters.manufacturer = normalizedManufacturers;
  const normalizedModelFamilies = normalizeFromAllowed(plan?.filters?.modelFamily, catalog?.modelFamilies);
  if (normalizedModelFamilies.length) filters.modelFamily = normalizedModelFamilies;
  const normalizedGrades = normalizeFromAllowed(plan?.filters?.grade, catalog?.grades);
  if (normalizedGrades.length) filters.grade = normalizedGrades;
  const normalizedStorages = normalizeFromAllowed(plan?.filters?.storage, catalog?.storages);
  if (normalizedStorages.length) filters.storage = normalizedStorages;
  const normalizedRegions = normalizeFromAllowed(plan?.filters?.region, catalog?.regions);
  if (normalizedRegions.length) filters.region = normalizedRegions;

  return {
    selectedCategory,
    search: String(plan?.search || "").slice(0, 200),
    filters
  };
}

function countCopilotPayloadMatches(payload, allDevicesInput = null) {
  const allDevices = Array.isArray(allDevicesInput)
    ? allDevicesInput
    : getDevices(new URL("http://localhost/api/devices"));
  return allDevices.filter((device) => deviceMatchesCopilotPayload(device, payload)).length;
}

function buildCopilotNoMatchReply(payload) {
  const filters = payload?.filters && typeof payload.filters === "object" ? payload.filters : {};
  const manufacturer = Array.isArray(filters.manufacturer) && filters.manufacturer.length === 1 ? filters.manufacturer[0] : "";
  const region = Array.isArray(filters.region) && filters.region.length === 1 ? filters.region[0] : "";
  const categoryPhrase = payload?.selectedCategory === "Smartphones"
    ? "phones"
    : (payload?.selectedCategory === "__ALL__" ? "devices" : String(payload?.selectedCategory || "devices").toLowerCase());

  if (manufacturer && region) {
    return `I cannot find any ${manufacturer} ${categoryPhrase} in ${region} right now. Try another location, or remove some filters to broaden the search.`;
  }
  if (manufacturer) {
    return `I cannot find any ${manufacturer} ${categoryPhrase} right now. Try another location or broader filters.`;
  }
  if (region) {
    return `I cannot find any ${categoryPhrase} in ${region} right now. Try another location or broader filters.`;
  }
  return "I cannot find matching devices right now. Try broadening your filters or search text.";
}

function parseCopilotRequestedQuantity(messageRaw) {
  const message = String(messageRaw || "");
  const directQty = message.match(/\bqty\s*[:=]?\s*(\d{1,4})\b/i)
    || message.match(/\b(\d{1,4})\s*(x|units?|pcs?|pieces?)\b/i)
    || message.match(/\badd\s+(\d{1,4})\b/i);
  const qty = Number(directQty?.[1] || 1);
  if (!Number.isInteger(qty) || qty < 1) return 1;
  return Math.min(9999, qty);
}

function parseCopilotRequestedOfferPrice(messageRaw) {
  const message = String(messageRaw || "");
  const explicit = message.match(/\b(?:offer\s*price|price|at)\s*[:=]?\s*\$?\s*(\d+(?:\.\d{1,2})?)\b/i);
  const dollar = message.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  const value = Number(explicit?.[1] || dollar?.[1] || NaN);
  if (!Number.isFinite(value) || value < 0) return null;
  return Number(value.toFixed(2));
}

function isCopilotAddToRequestIntent(messageRaw) {
  const message = String(messageRaw || "").toLowerCase();
  return /\b(add|include|put|request|quote|order)\b/.test(message)
    && /\b(device|phone|phones|item|items|tablet|laptop|watch|accessor|airpods|iphone|pixel|galaxy)\b/.test(message);
}

function isCopilotWeeklySpecialIntent(messageRaw) {
  const message = String(messageRaw || "").toLowerCase();
  return /\b(weekly\s*special|weekly\s*deal|specials|promotions?|promo|deals?|offers?)\b/.test(message);
}

function isCopilotAddWeeklySpecialIntent(messageRaw) {
  const message = String(messageRaw || "").toLowerCase();
  return /\b(add|include|put|request|quote|order)\b/.test(message)
    && /\b(weekly\s*special|weekly\s*deal|specials|promotions?|promo|deals?|offers?)\b/.test(message);
}

function getCopilotDeviceCandidates(payload, limit = 6, allDevicesInput = null) {
  const allDevices = Array.isArray(allDevicesInput)
    ? allDevicesInput
    : getDevices(new URL("http://localhost/api/devices"));
  return allDevices
    .filter((device) => deviceMatchesCopilotPayload(device, payload))
    .sort((a, b) => Number(b.available || 0) - Number(a.available || 0) || String(a.model).localeCompare(String(b.model)))
    .slice(0, limit);
}

function getCopilotWeeklySpecialCandidates(message, selectedCategory, limit = 6, allDevicesInput = null) {
  const allDevices = Array.isArray(allDevicesInput)
    ? allDevicesInput
    : getDevices(new URL("http://localhost/api/devices"));
  return allDevices
    .filter((device) => device.weeklySpecial === true)
    .sort((a, b) => Number(b.available || 0) - Number(a.available || 0) || Number(a.price || 0) - Number(b.price || 0))
    .slice(0, limit);
}

function buildWeeklySpecialResponse(message, selectedCategory, allDevicesInput = null) {
  const quantity = parseCopilotRequestedQuantity(message);
  const offerPriceRequested = parseCopilotRequestedOfferPrice(message);
  const isAddIntent = isCopilotAddWeeklySpecialIntent(message);
  const candidates = getCopilotWeeklySpecialCandidates(message, selectedCategory, 8, allDevicesInput);

  if (!candidates.length) {
    return {
      reply: "I cannot find any active weekly specials right now.",
      action: null
    };
  }

  if (isAddIntent && candidates.length === 1) {
    const device = candidates[0];
    return {
      reply: `I found one matching weekly special: ${device.manufacturer} ${device.model}. I can add ${quantity} unit${quantity === 1 ? "" : "s"} to Requested items.`,
      action: {
        type: "add_to_request",
        payload: {
          deviceId: device.id,
          quantity,
          offerPrice: offerPriceRequested !== null ? offerPriceRequested : Number(device.price || 0),
          note: "Added from weekly specials by AI copilot"
        }
      }
    };
  }

  const options = candidates.map((device) => ({
    id: `weekly-${String(device.id).replace(/[^a-zA-Z0-9_-]+/g, "-")}`,
    label: `${device.manufacturer} ${device.model}`,
    description: `${device.category} | ${device.grade} | ${Number(device.available || 0)} available | $${Number(device.price || 0).toFixed(2)}`,
    payload: {
      type: "add_to_request",
      payload: {
        deviceId: device.id,
        quantity,
        offerPrice: offerPriceRequested !== null ? offerPriceRequested : Number(device.price || 0),
        note: "Added from weekly specials by AI copilot"
      }
    }
  }));

  const preview = candidates
    .slice(0, 3)
    .map((d) => `${d.manufacturer} ${d.model}`)
    .join(", ");

  if (isAddIntent) {
    return {
      reply: `I found multiple weekly specials.\nTop matches:\n${formatBulletList(candidates.slice(0, 3).map((d) => `${d.manufacturer} ${d.model}`))}\nChoose one below and I'll add ${quantity} unit${quantity === 1 ? "" : "s"} to Requested items.`,
      action: { type: "choose_devices", options }
    };
  }

  return {
    reply: `Current weekly specials:\n${formatBulletList(candidates.slice(0, 5).map((d) => `${d.manufacturer} ${d.model}`))}${candidates.length > 5 ? "\n- +more available" : ""}\nTap one below to add it to Requested items.`,
    action: { type: "choose_devices", options }
  };
}

function buildCopilotWeeklySpecialContext(limit = 10, allDevicesInput = null) {
  const allDevices = Array.isArray(allDevicesInput)
    ? allDevicesInput
    : getDevices(new URL("http://localhost/api/devices"));
  const weekly = allDevices.filter((device) => device.weeklySpecial === true);
  return {
    totalActiveWeeklySpecials: weekly.length,
    sample: weekly
      .sort((a, b) => Number(b.available || 0) - Number(a.available || 0))
      .slice(0, limit)
      .map((device) => ({
        id: device.id,
        category: device.category,
        manufacturer: device.manufacturer,
        model: device.model,
        grade: device.grade,
        storage: device.storage,
        price: Number(device.price || 0),
        available: Number(device.available || 0)
      }))
  };
}

function buildCopilotAddToRequestAction(message, payload, allDevicesInput = null) {
  const quantity = parseCopilotRequestedQuantity(message);
  const offerPriceRequested = parseCopilotRequestedOfferPrice(message);
  const candidates = getCopilotDeviceCandidates(payload, 6, allDevicesInput);
  if (!candidates.length) return null;

  if (candidates.length === 1) {
    const device = candidates[0];
    return {
      reply: `I found ${device.manufacturer} ${device.model}. I can add ${quantity} unit${quantity === 1 ? "" : "s"} to Requested items.`,
      action: {
        type: "add_to_request",
        payload: {
          deviceId: device.id,
          quantity,
          offerPrice: offerPriceRequested !== null ? offerPriceRequested : Number(device.price || 0),
          note: "Added by AI copilot"
        }
      }
    };
  }

  const options = candidates.map((device) => ({
    id: `dev-${String(device.id).replace(/[^a-zA-Z0-9_-]+/g, "-")}`,
    label: `${device.manufacturer} ${device.model}`,
    description: `${device.category} | ${device.grade} | ${Number(device.available || 0)} available`,
    payload: {
      type: "add_to_request",
      payload: {
        deviceId: device.id,
        quantity,
        offerPrice: offerPriceRequested !== null ? offerPriceRequested : Number(device.price || 0),
        note: "Added by AI copilot"
      }
    }
  }));
  return {
    reply: `I found multiple matching devices. Which one should I add (${quantity} unit${quantity === 1 ? "" : "s"})?`,
    action: { type: "choose_devices", options }
  };
}

async function requestOpenAiCopilotPlan(message, selectedCategory, catalog, history, userHistory, weeklySpecials) {
  const endpoint = `${OPENAI_BASE_URL}/chat/completions`;
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["reply", "intent", "selectedCategory", "search", "filters"],
    properties: {
      reply: { type: "string" },
      intent: { type: "string", enum: ["apply_filters", "choose_filters", "none"] },
      selectedCategory: { type: "string" },
      search: { type: "string" },
      filters: {
        type: "object",
        additionalProperties: false,
        properties: {
          manufacturer: { type: "array", items: { type: "string" } },
          modelFamily: { type: "array", items: { type: "string" } },
          grade: { type: "array", items: { type: "string" } },
          region: { type: "array", items: { type: "string" } },
          storage: { type: "array", items: { type: "string" } }
        },
        required: ["manufacturer", "modelFamily", "grade", "region", "storage"]
      }
    }
  };

  const systemPrompt = [
    "You are a retail device catalog copilot.",
    "Your task is to convert user requests into app filter payloads and a short reply.",
    "Allowed categories: __ALL__, " + catalog.categories.join(", "),
    "Allowed manufacturers: " + catalog.manufacturers.join(", "),
    "Allowed model families: " + catalog.modelFamilies.slice(0, 120).join(", "),
    "Allowed grades: " + catalog.grades.join(", "),
    "Grade definitions context: " + JSON.stringify(GRADE_DEFINITIONS),
    "Allowed regions: " + catalog.regions.join(", "),
    "Allowed storages: " + catalog.storages.join(", "),
    "Historical completed-sales context (for trend/suggestion questions): " + JSON.stringify(history),
    "User order-history context (for previous order pricing questions): " + JSON.stringify(userHistory),
    "Weekly specials context (for promotions/specials questions and proactive suggestions): " + JSON.stringify(weeklySpecials),
    "Only return valid values from the allowed lists; if unknown, omit that filter.",
    "When user asks about historical/completed sales, trends, or suggestions, base your answer on the provided historical context.",
    "When user asks about previous order prices or averages, base your answer on user order-history context.",
    "Use user cart activity context for cart-add trends, unconverted items, and promotion suggestions.",
    "When user asks for order details, summarize full order-level details from user order-history context.",
    "When user asks for promotions, deals, or weekly specials, use the weekly specials context in your reply.",
    "When user asks for recommendations, mention relevant weekly specials when appropriate.",
    "Set intent to apply_filters when the user asks to find/search/filter products.",
    "Set intent to choose_filters when ambiguous across multiple categories.",
    "Set intent to none when no filter action should be suggested.",
    "Keep reply concise and user-facing."
  ].join("\n");

  const payload = {
    model: AI_COPILOT_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Selected category: ${selectedCategory || "Smartphones"}\nUser message: ${message}` }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "copilot_plan",
        strict: true,
        schema
      }
    }
  };

  const response = await requestJsonStrict(endpoint, {
    method: "POST",
    contentType: "application/json",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload),
    errorPrefix: "OpenAI request"
  });

  const content = String(response?.choices?.[0]?.message?.content || "").trim();
  if (!content) {
    throw new Error("OpenAI response did not include structured content.");
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI response content was not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("OpenAI response JSON was empty.");
  }
  return parsed;
}

async function runAiCopilot(user, body) {
  const message = String(body?.message || "").trim();
  const selectedCategory = resolveCopilotSelectedCategoryContext(message, body?.selectedCategory);
  if (!message) {
    return { reply: "Please enter a message.", action: null };
  }
  if (isGradeDefinitionQuestion(message)) {
    return { reply: buildGradeDefinitionReply(message), action: null };
  }
  if (!AI_COPILOT_REAL_MODEL_ENABLED || !OPENAI_API_KEY) {
    return {
      reply: "AI copilot is not configured. Set OPENAI_API_KEY (and enable AI_COPILOT_REAL_MODEL_ENABLED) to use the real model.",
      action: null
    };
  }

  try {
    const allDevicesPayload = await getDevicesRuntime(new URL("http://localhost/api/devices"));
    const allDevices = Array.isArray(allDevicesPayload)
      ? allDevicesPayload
      : (Array.isArray(allDevicesPayload?.items) ? allDevicesPayload.items : []);

    const deterministicWeeklySpecial = isCopilotWeeklySpecialIntent(message)
      ? buildWeeklySpecialResponse(message, selectedCategory, allDevices)
      : null;
    if (deterministicWeeklySpecial) return deterministicWeeklySpecial;

    const deterministicAddFromHistory = isAddFromHistoryIntent(message)
      ? await buildAddFromHistoricalOrderActionRuntime(user, message, allDevices)
      : null;
    if (deterministicAddFromHistory) return deterministicAddFromHistory;

    const deterministicOrderDetailsAnswer = isOrderDetailsQuestion(message)
      ? await answerOrderDetailsQuestionRuntime(user, message)
      : null;
    if (deterministicOrderDetailsAnswer) return deterministicOrderDetailsAnswer;

    const deterministicHistoryAnswer = isOrderHistoryQuestion(message)
      ? await answerOrderHistoryQuestionRuntime(user, message, selectedCategory)
      : null;
    if (deterministicHistoryAnswer) return deterministicHistoryAnswer;

    const catalog = (POSTGRES_STRICT_RUNTIME && effectiveDbEngine === "postgres")
      ? buildCopilotCatalogContextFromDevices(allDevices)
      : buildCopilotCatalogContext();
    const history = await buildCopilotHistoricalSalesContextRuntime();
    const userHistory = await buildCopilotUserOrderHistoryContextRuntime(user);
    const weeklySpecials = buildCopilotWeeklySpecialContext(10, allDevices);
    const plan = await requestOpenAiCopilotPlan(message, selectedCategory, catalog, history, userHistory, weeklySpecials);
    const normalizedPayload = normalizeCopilotPlanPayload(plan, selectedCategory, catalog);
    const hasFilters = Object.keys(normalizedPayload.filters || {}).length > 0 || String(normalizedPayload.search || "").trim().length > 0;
    const heuristicPayload = await parseAiFiltersRuntime(message, selectedCategory);
    const heuristicHasFilters = Object.keys(heuristicPayload.filters || {}).length > 0 || String(heuristicPayload.search || "").trim().length > 0;
    const payloadForAdd = hasFilters ? normalizedPayload : (heuristicHasFilters ? heuristicPayload : normalizedPayload);
    const suggestedName = buildCopilotSuggestedFilterName(normalizedPayload);
    const options = buildCopilotFilterOptions(message, normalizedPayload, allDevices);
    const intent = String(plan?.intent || "none").trim();
    const addIntent = isCopilotAddToRequestIntent(message);

    if (addIntent && (hasFilters || heuristicHasFilters)) {
      const addAction = buildCopilotAddToRequestAction(message, payloadForAdd, allDevices);
      if (!addAction) {
        return {
          reply: buildCopilotNoMatchReply(payloadForAdd),
          action: null
        };
      }
      return addAction;
    }

    let action = null;
    if (intent === "choose_filters" && options.length > 1) {
      action = { type: "choose_filters", options };
    } else if (intent === "apply_filters" && hasFilters) {
      action = {
        type: "apply_filters",
        payload: {
          ...normalizedPayload,
          suggestedName: suggestedName || "AI Suggested Filter"
        }
      };
      const matchCount = countCopilotPayloadMatches(action.payload, allDevices);
      if (matchCount <= 0) {
        action = null;
      }
    }

    if (!action && intent === "apply_filters" && hasFilters) {
      return {
        reply: buildCopilotNoMatchReply(normalizedPayload),
        action: null
      };
    }

    const reply = String(plan?.reply || "").trim() || "I can help with product discovery, filter setup, and fulfillment guidance.";
    return { reply, action };
  } catch (error) {
    console.error("[ai-copilot] OpenAI call failed:", error?.message || error);
    const debugSuffix = AI_COPILOT_DEBUG_ERRORS && error?.message
      ? ` (${String(error.message).slice(0, 180)})`
      : "";
    return {
      reply: `AI copilot is temporarily unavailable right now. Please try again in a moment.${debugSuffix}`,
      action: null
    };
  }
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

async function getAiAdminAnomaliesPostgres() {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const anomalies = [];
  const largeAdjustmentsResult = await pgClient.query(`
    SELECT ie.created_at AS "createdAt", ie.device_id AS "deviceId", ie.delta, ie.change_type AS "changeType",
           d.model_name AS model, l.name AS location
    FROM ${postgresTableRef("inventory_events")} ie
    JOIN ${postgresTableRef("devices")} d ON d.id = ie.device_id
    JOIN ${postgresTableRef("locations")} l ON l.id = ie.location_id
    WHERE ABS(ie.delta) >= 50
    ORDER BY ie.created_at DESC
    LIMIT 12
  `);
  for (const row of (largeAdjustmentsResult.rows || [])) {
    anomalies.push({
      type: "inventory_spike",
      severity: "high",
      message: `${row.model} at ${row.location} changed by ${Number(row.delta)} (${row.changeType})`,
      timestamp: row.createdAt
    });
  }

  const lowStockResult = await pgClient.query(`
    SELECT d.model_name AS model, COALESCE(SUM(di.quantity), 0) AS total
    FROM ${postgresTableRef("devices")} d
    LEFT JOIN ${postgresTableRef("device_inventory")} di ON di.device_id = d.id
    WHERE d.is_active = 1
    GROUP BY d.id, d.model_name
    HAVING COALESCE(SUM(di.quantity), 0) BETWEEN 1 AND 5
    ORDER BY total ASC, d.model_name ASC
    LIMIT 12
  `);
  for (const row of (lowStockResult.rows || [])) {
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

async function getAiAdminAnomaliesRuntime() {
  if (effectiveDbEngine === "postgres") {
    if (!pgClient) {
      throw new Error("Postgres runtime is not initialized.");
    }
    try {
      return await getAiAdminAnomaliesPostgres();
    } catch (error) {
      throw new Error(`Postgres anomalies query failed: ${error?.message || error}`);
    }
  }
  return getAiAdminAnomalies();
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

async function getAiSalesInsightsPostgres(daysRaw) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const days = Math.max(1, Math.min(365, Number(daysRaw || 30)));
  const fromIso = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();
  const totalsResult = await pgClient.query(`
    SELECT COUNT(*) AS "requestCount", COALESCE(SUM(total_amount), 0) AS "totalRevenue"
    FROM ${postgresTableRef("quote_requests")}
    WHERE created_at >= $1
  `, [fromIso]);
  const byStatusResult = await pgClient.query(`
    SELECT status, COUNT(*) AS count
    FROM ${postgresTableRef("quote_requests")}
    WHERE created_at >= $1
    GROUP BY status
    ORDER BY count DESC, status ASC
  `, [fromIso]);
  const topModelsResult = await pgClient.query(`
    SELECT qrl.model AS model, COALESCE(SUM(qrl.quantity), 0) AS qty
    FROM ${postgresTableRef("quote_request_lines")} qrl
    JOIN ${postgresTableRef("quote_requests")} qr ON qr.id = qrl.request_id
    WHERE qr.created_at >= $1
    GROUP BY qrl.model
    ORDER BY qty DESC, qrl.model ASC
    LIMIT 8
  `, [fromIso]);
  const totals = totalsResult.rows?.[0] || {};
  return {
    rangeDays: days,
    requestCount: Number(totals?.requestCount || 0),
    totalRevenue: Number(totals?.totalRevenue || 0),
    byStatus: (byStatusResult.rows || []).map((r) => ({ status: r.status, count: Number(r.count || 0) })),
    topModels: (topModelsResult.rows || []).map((r) => ({ model: r.model, quantity: Number(r.qty || 0) }))
  };
}

async function getAiSalesInsightsRuntime(daysRaw) {
  if (effectiveDbEngine === "postgres") {
    if (!pgClient) {
      throw new Error("Postgres runtime is not initialized.");
    }
    try {
      return await getAiSalesInsightsPostgres(daysRaw);
    } catch (error) {
      throw new Error(`Postgres sales insights query failed: ${error?.message || error}`);
    }
  }
  return getAiSalesInsights(daysRaw);
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

async function clearCatalogDataPostgres() {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const targetTables = ["devices", "boomi_inventory_raw", "inventory_events", "device_inventory", "device_images"];
  const tableRows = await pgClient.query(
    `
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND c.relname = ANY($1::text[])
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    `,
    [targetTables]
  );
  const tableBySchema = new Map();
  for (const row of (tableRows.rows || [])) {
    const schemaName = String(row.schema_name || "").trim();
    const tableName = String(row.table_name || "").trim();
    if (!schemaName || !tableName) continue;
    if (!tableBySchema.has(schemaName)) tableBySchema.set(schemaName, new Set());
    tableBySchema.get(schemaName).add(tableName);
  }

  let beforeDevices = 0;
  let beforeRaw = 0;
  for (const [schemaName, tableSet] of tableBySchema.entries()) {
    if (tableSet.has("devices")) {
      const countRes = await pgClient.query(`SELECT COUNT(*)::bigint AS count FROM ${quoteIdent(schemaName)}.${quoteIdent("devices")}`);
      beforeDevices += Number(countRes.rows?.[0]?.count || 0);
    }
    if (tableSet.has("boomi_inventory_raw")) {
      const countRes = await pgClient.query(`SELECT COUNT(*)::bigint AS count FROM ${quoteIdent(schemaName)}.${quoteIdent("boomi_inventory_raw")}`);
      beforeRaw += Number(countRes.rows?.[0]?.count || 0);
    }
  }
  const before = { devices: beforeDevices, raw: beforeRaw };

  await pgClient.query("BEGIN");
  try {
    for (const [schemaName, tableSet] of tableBySchema.entries()) {
      const orderedDeletes = ["boomi_inventory_raw", "inventory_events", "device_images", "device_inventory", "devices"];
      for (const tableName of orderedDeletes) {
        if (!tableSet.has(tableName)) continue;
        await pgClient.query(`DELETE FROM ${quoteIdent(schemaName)}.${quoteIdent(tableName)}`);
      }
    }
    await pgClient.query("COMMIT");
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
  return before;
}

async function clearCatalogDataRuntime() {
  if (effectiveDbEngine === "postgres") {
    if (!pgClient) {
      throw new Error("Postgres runtime is not initialized.");
    }
    try {
      return await clearCatalogDataPostgres();
    } catch (error) {
      throw new Error(`Postgres catalog clear failed: ${error?.message || error}`);
    }
  }
  return clearCatalogData();
}

async function getCatalogDebugCountsRuntime() {
  if (effectiveDbEngine === "postgres") {
    if (!pgClient) {
      throw new Error("Postgres runtime is not initialized.");
    }
    const [
      devicesRes,
      activeRes,
      joinableRes,
      invRes,
      rawRes,
      manuRes,
      catRes
    ] = await Promise.all([
      pgClient.query(`SELECT COUNT(*)::bigint AS count FROM ${postgresTableRef("devices")}`),
      pgClient.query(`SELECT COUNT(*)::bigint AS count FROM ${postgresTableRef("devices")} WHERE is_active = 1`),
      pgClient.query(`
        SELECT COUNT(*)::bigint AS count
        FROM ${postgresTableRef("devices")} d
        JOIN ${postgresTableRef("manufacturers")} m ON m.id = d.manufacturer_id
        JOIN ${postgresTableRef("categories")} c ON c.id = d.category_id
      `),
      pgClient.query(`SELECT COUNT(*)::bigint AS count FROM ${postgresTableRef("device_inventory")}`),
      pgClient.query(`SELECT COUNT(*)::bigint AS count FROM ${postgresTableRef("boomi_inventory_raw")}`),
      pgClient.query(`SELECT COUNT(*)::bigint AS count FROM ${postgresTableRef("manufacturers")}`),
      pgClient.query(`SELECT COUNT(*)::bigint AS count FROM ${postgresTableRef("categories")}`)
    ]);
    return {
      engine: "postgres",
      devices: Number(devicesRes.rows?.[0]?.count || 0),
      activeDevices: Number(activeRes.rows?.[0]?.count || 0),
      joinableDevices: Number(joinableRes.rows?.[0]?.count || 0),
      inventoryRows: Number(invRes.rows?.[0]?.count || 0),
      boomiRawRows: Number(rawRes.rows?.[0]?.count || 0),
      manufacturers: Number(manuRes.rows?.[0]?.count || 0),
      categories: Number(catRes.rows?.[0]?.count || 0)
    };
  }

  return {
    engine: "sqlite",
    devices: Number(db.prepare("SELECT COUNT(*) AS count FROM devices").get().count || 0),
    activeDevices: Number(db.prepare("SELECT COUNT(*) AS count FROM devices WHERE is_active = 1").get().count || 0),
    joinableDevices: Number(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM devices d
        JOIN manufacturers m ON m.id = d.manufacturer_id
        JOIN categories c ON c.id = d.category_id
      `).get().count || 0
    ),
    inventoryRows: Number(db.prepare("SELECT COUNT(*) AS count FROM device_inventory").get().count || 0),
    boomiRawRows: Number(db.prepare("SELECT COUNT(*) AS count FROM boomi_inventory_raw").get().count || 0),
    manufacturers: Number(db.prepare("SELECT COUNT(*) AS count FROM manufacturers").get().count || 0),
    categories: Number(db.prepare("SELECT COUNT(*) AS count FROM categories").get().count || 0)
  };
}

async function updateWeeklySpecialFlagRuntime(deviceId, weeklySpecial) {
  const nextValue = weeklySpecial ? 1 : 0;
  if (effectiveDbEngine === "postgres") {
    if (!pgClient) {
      throw new Error("Postgres runtime is not initialized.");
    }
    try {
      const qualifiedResult = await pgClient.query(
        `UPDATE ${postgresTableRef("devices")} SET weekly_special = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [nextValue, deviceId]
      );
      return Number(qualifiedResult.rowCount || 0);
    } catch (error) {
      throw new Error(`Postgres weekly special update failed: ${error?.message || error}`);
    }
  }
  const result = db.prepare("UPDATE devices SET weekly_special = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(nextValue, deviceId);
  return Number(result?.changes || 0);
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

async function seedAdminRealDevicesPerCategoryPostgres(countPerCategory, progressCallback = null) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const categoriesResult = await pgClient.query(`SELECT id, name FROM ${postgresTableRef("categories")}`);
  const categories = categoriesResult.rows || [];
  const categoryByName = new Map(categories.map((c) => [c.name, c.id]));
  const locationsResult = await pgClient.query(`SELECT id FROM ${postgresTableRef("locations")} ORDER BY id`);
  const locations = (locationsResult.rows || []).map((l) => Number(l.id));
  const manufacturersResult = await pgClient.query(`SELECT id, name FROM ${postgresTableRef("manufacturers")}`);
  const manufacturerByName = new Map((manufacturersResult.rows || []).map((m) => [m.name, Number(m.id)]));
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

  const totalPlanned = config.length * Number(countPerCategory || 0);
  let processed = 0;
  const reportProgress = () => {
    if (typeof progressCallback === "function") {
      progressCallback({
        processed,
        totalPlanned,
        categoriesSeeded: config.length,
        countPerCategory: Number(countPerCategory || 0)
      });
    }
  };

  await pgClient.query("BEGIN");
  try {
    await pgClient.query(`DELETE FROM ${postgresTableRef("devices")} WHERE id LIKE 'adminreal-%'`);
    for (const cfg of config) {
      const categoryId = Number(categoryByName.get(cfg.name) || 0);
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
              variants.push({ modelFamily: model.family, manufacturerName: model.manufacturer, storage, color, grade, modelIdx, storageIdx, colorIdx, gradeIdx });
            }
          }
        }
      }
      const deviceRows = [];
      const inventoryRows = [];
      const imageRows = [];
      const flushBatches = async () => {
        if (deviceRows.length) {
          await insertRowsPostgres(
            postgresTableRef("devices"),
            [
              "id", "manufacturer_id", "category_id", "model_name", "model_family", "storage_capacity", "grade", "base_price",
              "image_url", "carrier", "screen_size", "modular", "color", "kit_type", "product_notes", "default_location_id", "is_active"
            ],
            deviceRows,
            200
          );
          deviceRows.length = 0;
        }
        if (inventoryRows.length) {
          await insertRowsPostgres(
            postgresTableRef("device_inventory"),
            ["device_id", "location_id", "quantity"],
            inventoryRows,
            500
          );
          inventoryRows.length = 0;
        }
        if (imageRows.length) {
          await insertRowsPostgres(
            postgresTableRef("device_images"),
            ["device_id", "image_url", "sort_order"],
            imageRows,
            500
          );
          imageRows.length = 0;
        }
      };

      for (let i = 0; i < countPerCategory; i += 1) {
        const variant = variants[i % variants.length];
        const cycle = Math.floor(i / variants.length) + 1;
        const manufacturerName = variant.manufacturerName;
        let manufacturerId = manufacturerByName.get(manufacturerName);
        if (!manufacturerId) {
          const inserted = await pgClient.query(
            `INSERT INTO ${postgresTableRef("manufacturers")} (name) VALUES ($1) RETURNING id`,
            [manufacturerName]
          );
          manufacturerId = Number(inserted.rows?.[0]?.id || 0);
          if (!manufacturerId) continue;
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

        deviceRows.push([
          id, manufacturerId, categoryId, modelName, modelFamily, storage, grade, price,
          heroImage, carrier, screenSize, "No", color, kitType, `Admin realistic test device for ${cfg.name}.`, defaultLocationId, 1
        ]);

        for (let locIdx = 0; locIdx < locations.length; locIdx += 1) {
          const qty = isShortageTestTarget && (locIdx === 0 || locIdx === 1)
            ? 0
            : 10 + ((i * 7 + locIdx * 11) % 120);
          inventoryRows.push([id, locations[locIdx], qty]);
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
        for (let idx = 0; idx < gallery.length; idx += 1) {
          imageRows.push([id, gallery[idx], idx + 1]);
        }

        processed += 1;
        if (processed % 25 === 0) {
          reportProgress();
        }
        if (deviceRows.length >= 120 || inventoryRows.length >= 1200 || imageRows.length >= 900) {
          await flushBatches();
        }
      }
      await flushBatches();
      reportProgress();
    }
    await pgClient.query("COMMIT");
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
  reportProgress();
  return {
    categoriesSeeded: config.length,
    countPerCategory
  };
}

async function seedAdminRealDevicesPerCategoryRuntime(countPerCategory, progressCallback = null) {
  if (effectiveDbEngine === "postgres") {
    if (!pgClient) throw new Error("Postgres runtime is not initialized.");
    return seedAdminRealDevicesPerCategoryPostgres(countPerCategory, progressCallback);
  }
  return seedAdminRealDevicesPerCategory(countPerCategory);
}

function getAdminSeedRealJobStatus() {
  return {
    running: adminSeedRealJob.running,
    startedAt: adminSeedRealJob.startedAt,
    finishedAt: adminSeedRealJob.finishedAt,
    error: adminSeedRealJob.error,
    totalPlanned: Number(adminSeedRealJob.totalPlanned || 0),
    processed: Number(adminSeedRealJob.processed || 0),
    categoriesSeeded: Number(adminSeedRealJob.categoriesSeeded || 0),
    countPerCategory: Number(adminSeedRealJob.countPerCategory || 0)
  };
}

function getBoomiSyncJobStatus() {
  const startedTs = boomiSyncJob.startedAt ? Date.parse(boomiSyncJob.startedAt) : NaN;
  const finishedTs = boomiSyncJob.finishedAt ? Date.parse(boomiSyncJob.finishedAt) : NaN;
  const nowTs = Date.now();
  const durationMs = Number.isFinite(startedTs)
    ? Math.max(0, (Number.isFinite(finishedTs) ? finishedTs : nowTs) - startedTs)
    : 0;
  return {
    running: boomiSyncJob.running,
    startedAt: boomiSyncJob.startedAt,
    finishedAt: boomiSyncJob.finishedAt,
    stage: boomiSyncJob.stage,
    error: boomiSyncJob.error,
    fetched: Number(boomiSyncJob.fetched || 0),
    processed: Number(boomiSyncJob.processed || 0),
    skipped: Number(boomiSyncJob.skipped || 0),
    durationMs
  };
}

function startBoomiSyncJob() {
  if (boomiSyncJob.running) {
    return { started: false, status: getBoomiSyncJobStatus() };
  }
  boomiSyncJob.running = true;
  boomiSyncJob.startedAt = new Date().toISOString();
  boomiSyncJob.finishedAt = null;
  boomiSyncJob.stage = "fetching";
  boomiSyncJob.error = "";
  boomiSyncJob.fetched = 0;
  boomiSyncJob.processed = 0;
  boomiSyncJob.skipped = 0;

  void (async () => {
    try {
      const rows = await fetchBoomiInventory();
      boomiSyncJob.fetched = Number(rows?.length || 0);
      boomiSyncJob.stage = "processing";
      const { processed, skipped } = await syncBoomiInventoryRowsRuntime(rows, (progress) => {
        boomiSyncJob.processed = Number(progress?.processed || 0);
        boomiSyncJob.skipped = Number(progress?.skipped || 0);
      });
      boomiSyncJob.processed = Number(processed || 0);
      boomiSyncJob.skipped = Number(skipped || 0);
      boomiSyncJob.stage = "completed";
    } catch (error) {
      boomiSyncJob.error = String(error?.message || error || "Boomi sync failed.");
      boomiSyncJob.stage = "failed";
    } finally {
      boomiSyncJob.running = false;
      boomiSyncJob.finishedAt = new Date().toISOString();
    }
  })();

  return { started: true, status: getBoomiSyncJobStatus() };
}

function startAdminSeedRealJob(countPerCategory) {
  const safeCount = Math.max(1, Math.min(1000, Number(countPerCategory || 100)));
  if (adminSeedRealJob.running) {
    return { started: false, status: getAdminSeedRealJobStatus() };
  }
  adminSeedRealJob.running = true;
  adminSeedRealJob.startedAt = new Date().toISOString();
  adminSeedRealJob.finishedAt = null;
  adminSeedRealJob.error = "";
  adminSeedRealJob.countPerCategory = safeCount;
  adminSeedRealJob.categoriesSeeded = 5;
  adminSeedRealJob.totalPlanned = 5 * safeCount;
  adminSeedRealJob.processed = 0;

  void (async () => {
    try {
      await seedAdminRealDevicesPerCategoryRuntime(safeCount, (progress) => {
        adminSeedRealJob.processed = Number(progress?.processed || adminSeedRealJob.processed || 0);
        adminSeedRealJob.totalPlanned = Number(progress?.totalPlanned || adminSeedRealJob.totalPlanned || 0);
        adminSeedRealJob.categoriesSeeded = Number(progress?.categoriesSeeded || adminSeedRealJob.categoriesSeeded || 0);
        adminSeedRealJob.countPerCategory = Number(progress?.countPerCategory || adminSeedRealJob.countPerCategory || 0);
      });
    } catch (error) {
      adminSeedRealJob.error = String(error?.message || error || "Seed job failed.");
    } finally {
      adminSeedRealJob.running = false;
      adminSeedRealJob.finishedAt = new Date().toISOString();
      adminSeedRealJob.processed = Math.min(adminSeedRealJob.processed, adminSeedRealJob.totalPlanned);
    }
  })();

  return { started: true, status: getAdminSeedRealJobStatus() };
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (m) => m.toUpperCase());
}

function pickFirstDefined(obj, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj || {}, key)) continue;
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function normalizeBoomiRow(rowRaw) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  return {
    sourceExternalId: String(pickFirstDefined(row, ["id", "source_external_id", "external_id", "item_id", "itemId"])).trim(),
    sku: String(pickFirstDefined(row, ["sku", "item_sku", "itemSku", "product_sku", "productSku"])).trim(),
    manufacturerRaw: String(pickFirstDefined(row, ["manufacturer", "manufacturer_name", "manufacturerName", "brand"])).trim(),
    modelRaw: String(pickFirstDefined(row, ["model", "model_name", "modelName", "device_model", "deviceModel"])).trim(),
    colorRaw: String(pickFirstDefined(row, ["color", "colour"])).trim(),
    grade: String(pickFirstDefined(row, ["grade", "condition_grade", "conditionGrade"]) || "A").trim() || "A",
    storage: String(pickFirstDefined(row, ["storage_capacity", "storageCapacity", "storage", "capacity"]) || "N/A").trim() || "N/A",
    carrier: String(pickFirstDefined(row, ["carrier", "network_carrier", "networkCarrier"]) || "N/A").trim() || "N/A",
    currencyCode: String(pickFirstDefined(row, ["currency_code", "currencyCode", "currency"]) || "USD").trim() || "USD",
    countryCode: String(pickFirstDefined(row, ["country", "country_code", "countryCode"]) || "US").trim() || "US",
    effectiveDate: String(pickFirstDefined(row, ["effective_date", "effectiveDate", "as_of_date", "asOfDate"])).trim() || null,
    sourceLocationId: String(pickFirstDefined(row, ["location_id", "locationId", "source_location_id", "sourceLocationId", "internal_location_id", "internalLocationId"])).trim(),
    price: Number(pickFirstDefined(row, ["price", "unit_price", "unitPrice", "base_price", "basePrice"]) || 0),
    quantity: Math.max(0, Number(pickFirstDefined(row, ["quantity_on_hand", "quantityOnHand", "quantity", "qty", "on_hand", "onHand"]) || 0))
  };
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

async function requestJsonStrict(url, options = {}) {
  const method = options.method || "GET";
  const headers = options.headers || {};
  const body = options.body || null;
  const contentType = options.contentType || null;
  const rejectUnauthorized = options.rejectUnauthorized !== false;
  const errorPrefix = String(options.errorPrefix || "External request");

  const payload = await new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: contentType ? { ...headers, "Content-Type": contentType } : headers,
      rejectUnauthorized
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        const status = Number(res.statusCode || 0);
        if (status < 200 || status >= 300) {
          reject(new Error(`${errorPrefix} failed (${status}): ${String(data || "").slice(0, 400)}`));
          return;
        }
        try {
          resolve(JSON.parse(data || "{}"));
        } catch {
          reject(new Error(`${errorPrefix} returned non-JSON payload.`));
        }
      });
    });
    req.on("error", (error) => {
      reject(new Error(`${errorPrefix} error: ${error.message}`));
    });
    if (body) req.write(body);
    req.end();
  });

  return payload;
}

async function fetchInventoryOAuthToken() {
  const tokenParams = new URLSearchParams({
    grant_type: "client_credentials"
  });
  if (INVENTORY_OAUTH_CLIENT_AUTH_MODE === "basic") {
    tokenParams.set("client_id", INVENTORY_OAUTH_CLIENT_ID);
  } else {
    tokenParams.set("client_id", INVENTORY_OAUTH_CLIENT_ID);
    tokenParams.set("client_secret", INVENTORY_OAUTH_CLIENT_SECRET);
  }
  if (String(INVENTORY_OAUTH_SCOPE || "").trim()) {
    tokenParams.set("scope", INVENTORY_OAUTH_SCOPE);
  }
  if (String(INVENTORY_OAUTH_RESOURCE || "").trim()) {
    tokenParams.set("resource", INVENTORY_OAUTH_RESOURCE);
  }
  if (String(INVENTORY_OAUTH_AUDIENCE || "").trim()) {
    tokenParams.set("audience", INVENTORY_OAUTH_AUDIENCE);
  }

  const tokenPayload = await requestJson(INVENTORY_OAUTH_TOKEN_URL, {
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: tokenParams.toString(),
    headers: {
      Accept: "application/json",
      ...(INVENTORY_OAUTH_CLIENT_AUTH_MODE === "basic"
        ? {
          Authorization: `Basic ${Buffer.from(`${INVENTORY_OAUTH_CLIENT_ID}:${INVENTORY_OAUTH_CLIENT_SECRET}`).toString("base64")}`
        }
        : {})
    }
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
    INVENTORY_OAUTH_CLIENT_SECRET
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
    const subscriptionHeaderName = INVENTORY_SUBSCRIPTION_HEADER;
    const requestHeaders = {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      [subscriptionHeaderName]: INVENTORY_SUBSCRIPTION_KEY
    };
    if (subscriptionHeaderName.toLowerCase() !== "ocp-apim-subscription-key") {
      requestHeaders["Ocp-Apim-Subscription-Key"] = INVENTORY_SUBSCRIPTION_KEY;
    }
    if (subscriptionHeaderName.toLowerCase() !== "subscription-key") {
      requestHeaders["subscription-key"] = INVENTORY_SUBSCRIPTION_KEY;
    }
    payload = await requestJson(INVENTORY_API_URL, {
      method: "GET",
      headers: requestHeaders
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

  const extracted = extractBoomiRowsFromPayload(payload);
  if (Array.isArray(extracted)) return extracted;
  if (payload && typeof payload === "object" && !Array.isArray(payload) && Object.keys(payload).length === 0) {
    return [];
  }
  const topLevelKeys = payload && typeof payload === "object"
    ? Object.keys(payload).slice(0, 12).join(", ")
    : typeof payload;
  throw new Error(`Unexpected Boomi payload format. Top-level keys/type: ${topLevelKeys || "none"}`);
}

function extractBoomiRowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;

  const directKeys = ["inventory", "content", "items", "data", "results", "result", "records", "rows", "value"];
  for (const key of directKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  // Breadth-first search for nested arrays of row objects (common Boomi wrapper patterns).
  const queue = [{ value: payload, depth: 0 }];
  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!value || typeof value !== "object" || depth > 4) continue;
    for (const nested of Object.values(value)) {
      if (Array.isArray(nested)) {
        if (!nested.length) return nested;
        const first = nested[0];
        if (first && typeof first === "object" && !Array.isArray(first)) {
          return nested;
        }
      } else if (nested && typeof nested === "object") {
        queue.push({ value: nested, depth: depth + 1 });
      }
    }
  }
  return null;
}

function syncBoomiInventoryRows(rows, progressCallback = null) {
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
      is_active = 1,
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
  const total = Array.isArray(rows) ? rows.length : 0;
  const publishProgress = (force = false) => {
    if (typeof progressCallback !== "function") return;
    const completed = processed + skipped;
    if (!force && completed % BOOMI_SYNC_PROGRESS_EVERY !== 0) return;
    progressCallback({ processed, skipped, total });
  };
  db.exec("BEGIN TRANSACTION");
  try {
    for (const row of rows) {
      const normalized = normalizeBoomiRow(row);
      const sourceExternalId = normalized.sourceExternalId;
      const sku = normalized.sku;
      const manufacturerRaw = normalized.manufacturerRaw;
      const modelRaw = normalized.modelRaw;
      const colorRaw = normalized.colorRaw;
      const grade = normalized.grade;
      const storage = normalized.storage;
      const carrier = normalized.carrier;
      const currencyCode = normalized.currencyCode;
      const countryCode = normalized.countryCode;
      const effectiveDate = normalized.effectiveDate;
      const sourceLocationId = normalized.sourceLocationId;
      const price = normalized.price;
      const quantity = normalized.quantity;

      if (!sourceExternalId || !manufacturerRaw || !modelRaw || !sourceLocationId || Number.isNaN(price) || Number.isNaN(quantity)) {
        skipped += 1;
        publishProgress();
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

      const categoryName = inferCategoryFromBoomi({ sku, model: modelRaw });
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
        carrier || "N/A",
        "N/A",
        "N/A",
        colorRaw ? toTitleCase(colorRaw) : "N/A",
        "N/A",
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
      publishProgress();
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  publishProgress(true);

  return { processed, skipped };
}

async function upsertLocationsPostgres(rows) {
  if (!rows.length) return;
  const values = [];
  const marks = [];
  for (const row of rows) {
    values.push(row.name, row.externalId);
    marks.push(`($${values.length - 1}, $${values.length})`);
  }
  await pgClient.query(
    `
      INSERT INTO ${postgresTableRef("locations")} (name, external_id)
      SELECT src.name, src.external_id
      FROM (VALUES ${marks.join(", ")}) AS src(name, external_id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM ${postgresTableRef("locations")} l
        WHERE l.external_id = src.external_id
      )
    `,
    values
  );
}

async function upsertDevicesPostgres(rows) {
  if (!rows.length) return;
  const cols = [
    "id", "manufacturer_id", "category_id", "model_name", "model_family", "storage_capacity", "grade", "base_price",
    "carrier", "screen_size", "modular", "color", "kit_type", "product_notes", "default_location_id",
    "source_external_id", "source_sku", "currency_code", "country_code", "effective_date"
  ];
  for (let start = 0; start < rows.length; start += BOOMI_SYNC_PG_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + BOOMI_SYNC_PG_CHUNK_SIZE);
    const values = [];
    const marks = [];
    for (let i = 0; i < chunk.length; i += 1) {
      const row = chunk[i];
      const rowMarks = [];
      for (const col of cols) {
        values.push(row[col]);
        rowMarks.push(`$${values.length}`);
      }
      marks.push(`(${rowMarks.join(", ")})`);
    }
    await pgClient.query(
      `
        INSERT INTO ${postgresTableRef("devices")} (
          id, manufacturer_id, category_id, model_name, model_family, storage_capacity, grade, base_price,
          carrier, screen_size, modular, color, kit_type, product_notes, default_location_id,
          is_active, source_external_id, source_sku, currency_code, country_code, effective_date
        ) VALUES ${marks.map((mark) => `${mark.slice(0, -1)}, 1)`).join(", ")}
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
          is_active = 1,
          updated_at = CURRENT_TIMESTAMP
      `,
      values
    );
  }
}

async function upsertDeviceInventoryPostgres(rows) {
  if (!rows.length) return;
  for (let start = 0; start < rows.length; start += BOOMI_SYNC_PG_CHUNK_SIZE) {
    const rawChunk = rows.slice(start, start + BOOMI_SYNC_PG_CHUNK_SIZE);
    const dedup = new Map();
    for (const row of rawChunk) {
      const key = `${row.deviceId}::${row.locationId}`;
      dedup.set(key, row);
    }
    const chunk = [...dedup.values()];
    const values = [];
    const marks = [];
    const deleteValues = [];
    const deleteMarks = [];
    for (const row of chunk) {
      values.push(row.deviceId, row.locationId, row.quantity);
      marks.push(`($${values.length - 2}::text, $${values.length - 1}::bigint, $${values.length}::bigint)`);
      deleteValues.push(row.deviceId, row.locationId);
      deleteMarks.push(`($${deleteValues.length - 1}::text, $${deleteValues.length}::bigint)`);
    }
    await pgClient.query(
      `
        DELETE FROM ${postgresTableRef("device_inventory")} di
        USING (VALUES ${deleteMarks.join(", ")}) AS src(device_id, location_id)
        WHERE di.device_id = src.device_id
          AND di.location_id = src.location_id
      `,
      deleteValues
    );
    await pgClient.query(
      `
        INSERT INTO ${postgresTableRef("device_inventory")} (device_id, location_id, quantity)
        VALUES ${marks.join(", ")}
      `,
      values
    );
  }
}

async function syncBoomiInventoryRowsPostgres(rows, progressCallback = null) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const total = Array.isArray(rows) ? rows.length : 0;
  let processed = 0;
  let skipped = 0;
  const publishProgress = (force = false) => {
    if (typeof progressCallback !== "function") return;
    const completed = processed + skipped;
    if (!force && completed % BOOMI_SYNC_PROGRESS_EVERY !== 0) return;
    progressCallback({ processed, skipped, total });
  };

  await pgClient.query("BEGIN");
  try {
    for (let start = 0; start < rows.length; start += BOOMI_SYNC_PG_CHUNK_SIZE) {
      const chunk = rows.slice(start, start + BOOMI_SYNC_PG_CHUNK_SIZE);
      const normalized = [];
      for (const row of chunk) {
        const parsed = normalizeBoomiRow(row);
        const sourceExternalId = parsed.sourceExternalId;
        const sku = parsed.sku;
        const manufacturerRaw = parsed.manufacturerRaw;
        const modelRaw = parsed.modelRaw;
        const colorRaw = parsed.colorRaw;
        const grade = parsed.grade;
        const storage = parsed.storage;
        const carrier = parsed.carrier;
        const currencyCode = parsed.currencyCode;
        const countryCode = parsed.countryCode;
        const effectiveDate = parsed.effectiveDate;
        const sourceLocationId = parsed.sourceLocationId;
        const price = parsed.price;
        const quantity = parsed.quantity;
        if (!sourceExternalId || !manufacturerRaw || !modelRaw || !sourceLocationId || Number.isNaN(price) || Number.isNaN(quantity)) {
          skipped += 1;
          continue;
        }
        const manufacturerName = toTitleCase(manufacturerRaw);
        const categoryName = inferCategoryFromBoomi({ sku, model: modelRaw });
        const modelUpper = modelRaw.toUpperCase();
        const storageUpper = storage.toUpperCase();
        const hasStorageInModel = storageUpper !== "N/A" && modelUpper.includes(storageUpper);
        const modelWithStorage = hasStorageInModel || storageUpper === "N/A" ? modelRaw : `${modelRaw} ${storage}`;
        const modelName = colorRaw ? `${modelWithStorage} - ${toTitleCase(colorRaw)}` : modelWithStorage;
        normalized.push({
          sourceExternalId,
          sku: sku || null,
          manufacturerRaw,
          manufacturerName,
          modelRaw,
          modelName,
          modelFamily: modelRaw,
          colorRaw: colorRaw || null,
          grade,
          storage,
          price,
          quantity,
          carrier,
          currencyCode,
          countryCode,
          effectiveDate,
          sourceLocationId,
          categoryName
        });
      }
      if (!normalized.length) {
        publishProgress();
        continue;
      }

      await insertRowsPostgres(
        postgresTableRef("boomi_inventory_raw"),
        ["source_external_id", "sku", "manufacturer", "model", "color", "grade", "storage_capacity", "price", "quantity_on_hand", "carrier", "currency_code", "country", "effective_date", "source_location_id"],
        normalized.map((r) => [r.sourceExternalId, r.sku, r.manufacturerRaw, r.modelRaw, r.colorRaw, r.grade, r.storage, r.price, r.quantity, r.carrier, r.currencyCode, r.countryCode, r.effectiveDate, r.sourceLocationId]),
        BOOMI_SYNC_PG_CHUNK_SIZE
      );

      const manufacturerNames = [...new Set(normalized.map((r) => r.manufacturerName).filter(Boolean))];
      const categoryNames = [...new Set(normalized.map((r) => r.categoryName).filter(Boolean))];
      const sourceLocationIds = [...new Set(normalized.map((r) => r.sourceLocationId).filter(Boolean))];
      const sourceExternalIds = [...new Set(normalized.map((r) => r.sourceExternalId).filter(Boolean))];

      if (manufacturerNames.length) {
        await pgClient.query(
          `
            INSERT INTO ${postgresTableRef("manufacturers")} (name)
            SELECT src.name
            FROM (SELECT DISTINCT unnest($1::text[]) AS name) src
            WHERE NOT EXISTS (
              SELECT 1
              FROM ${postgresTableRef("manufacturers")} m
              WHERE m.name = src.name
            )
          `,
          [manufacturerNames]
        );
      }
      if (categoryNames.length) {
        await pgClient.query(
          `
            INSERT INTO ${postgresTableRef("categories")} (name)
            SELECT src.name
            FROM (SELECT DISTINCT unnest($1::text[]) AS name) src
            WHERE NOT EXISTS (
              SELECT 1
              FROM ${postgresTableRef("categories")} c
              WHERE c.name = src.name
            )
          `,
          [categoryNames]
        );
      }
      if (sourceLocationIds.length) {
        const locRows = sourceLocationIds.map((externalId) => {
          const first = normalized.find((item) => item.sourceLocationId === externalId);
          return { externalId, name: `${first?.countryCode || "US"} Location ${externalId}` };
        });
        await upsertLocationsPostgres(locRows);
      }

      const manufacturerMap = new Map();
      if (manufacturerNames.length) {
        const res = await pgClient.query(
          `SELECT id, name FROM ${postgresTableRef("manufacturers")} WHERE name = ANY($1::text[])`,
          [manufacturerNames]
        );
        for (const row of (res.rows || [])) manufacturerMap.set(String(row.name || ""), Number(row.id));
      }
      const categoryMap = new Map();
      if (categoryNames.length) {
        const res = await pgClient.query(
          `SELECT id, name FROM ${postgresTableRef("categories")} WHERE name = ANY($1::text[])`,
          [categoryNames]
        );
        for (const row of (res.rows || [])) categoryMap.set(String(row.name || ""), Number(row.id));
      }
      const locationMap = new Map();
      if (sourceLocationIds.length) {
        const res = await pgClient.query(
          `SELECT id, external_id AS "externalId" FROM ${postgresTableRef("locations")} WHERE external_id = ANY($1::text[])`,
          [sourceLocationIds]
        );
        for (const row of (res.rows || [])) locationMap.set(String(row.externalId || ""), Number(row.id));
      }
      const existingDeviceMap = new Map();
      if (sourceExternalIds.length) {
        const res = await pgClient.query(
          `SELECT id, source_external_id AS "sourceExternalId" FROM ${postgresTableRef("devices")} WHERE source_external_id = ANY($1::text[])`,
          [sourceExternalIds]
        );
        for (const row of (res.rows || [])) existingDeviceMap.set(String(row.sourceExternalId || ""), String(row.id || ""));
      }

      const deviceRows = [];
      const inventoryRows = [];
      const deviceIdsInChunk = [];
      for (const item of normalized) {
        const manufacturerId = Number(manufacturerMap.get(item.manufacturerName) || 0);
        const categoryId = Number(categoryMap.get(item.categoryName) || 0);
        const locationId = Number(locationMap.get(item.sourceLocationId) || 0);
        if (!manufacturerId || !categoryId || !locationId) {
          skipped += 1;
          continue;
        }
        const deviceId = String(existingDeviceMap.get(item.sourceExternalId) || `boomi-${item.sourceExternalId}`);
        deviceRows.push({
          id: deviceId,
          manufacturer_id: manufacturerId,
          category_id: categoryId,
          model_name: item.modelName,
          model_family: item.modelFamily,
          storage_capacity: item.storage,
          grade: item.grade,
          base_price: item.price,
          carrier: item.carrier || "N/A",
          screen_size: "N/A",
          modular: "N/A",
          color: item.colorRaw ? toTitleCase(item.colorRaw) : "N/A",
          kit_type: "N/A",
          product_notes: `Imported from Boomi inventory feed. SKU: ${item.sku || "N/A"}`,
          default_location_id: locationId,
          source_external_id: item.sourceExternalId,
          source_sku: item.sku || null,
          currency_code: item.currencyCode,
          country_code: item.countryCode,
          effective_date: item.effectiveDate
        });
        inventoryRows.push({ deviceId, locationId, quantity: item.quantity });
        deviceIdsInChunk.push(deviceId);
        processed += 1;
      }

      const dedupDeviceMap = new Map();
      for (const row of deviceRows) {
        dedupDeviceMap.set(String(row.id || ""), row);
      }
      const dedupDeviceRows = [...dedupDeviceMap.values()];
      await upsertDevicesPostgres(dedupDeviceRows);
      await upsertDeviceInventoryPostgres(inventoryRows);

      const uniqueDeviceIds = [...new Set(deviceIdsInChunk)];
      if (uniqueDeviceIds.length) {
        const noImageRes = await pgClient.query(
          `
            SELECT d.id
            FROM ${postgresTableRef("devices")} d
            LEFT JOIN ${postgresTableRef("device_images")} di ON di.device_id = d.id
            WHERE d.id = ANY($1::text[])
            GROUP BY d.id
            HAVING COUNT(di.device_id) = 0
          `,
          [uniqueDeviceIds]
        );
        const rowsToInsert = [];
        for (const row of (noImageRes.rows || [])) {
          const id = String(row.id || "");
          rowsToInsert.push([id, `https://picsum.photos/seed/${id}-1/900/700`, 1]);
          rowsToInsert.push([id, `https://picsum.photos/seed/${id}-2/900/700`, 2]);
          rowsToInsert.push([id, `https://picsum.photos/seed/${id}-3/900/700`, 3]);
        }
        await insertRowsPostgres(postgresTableRef("device_images"), ["device_id", "image_url", "sort_order"], rowsToInsert, BOOMI_SYNC_PG_CHUNK_SIZE);
      }

      publishProgress();
    }
    await pgClient.query("COMMIT");
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
  publishProgress(true);
  return { processed, skipped };
}

async function syncBoomiInventoryRowsRuntime(rows, progressCallback = null) {
  if (effectiveDbEngine === "postgres") {
    if (!pgClient) {
      throw new Error("Postgres runtime is not initialized.");
    }
    try {
      return await syncBoomiInventoryRowsPostgres(rows, progressCallback);
    } catch (error) {
      throw new Error(`Postgres boomi sync failed: ${error?.message || error}`);
    }
  }
  return syncBoomiInventoryRows(rows, progressCallback);
}

function isInteger(value) {
  return Number.isInteger(value);
}

async function getInventoryByDeviceIdPostgres(deviceId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const deviceResult = await pgClient.query(
    `SELECT id, model_name FROM ${postgresTableRef("devices")} WHERE id = $1 LIMIT 1`,
    [deviceId]
  );
  const device = deviceResult.rows?.[0];
  if (!device?.id) return null;
  const rowsResult = await pgClient.query(
    `
      SELECT
        l.id AS "locationId",
        l.name AS location,
        l.external_id AS "externalId",
        COALESCE(di.quantity, 0) AS quantity
      FROM ${postgresTableRef("locations")} l
      LEFT JOIN ${postgresTableRef("device_inventory")} di
        ON di.location_id = l.id
        AND di.device_id = $1
      ORDER BY l.id
    `,
    [deviceId]
  );
  const rows = rowsResult.rows || [];
  const total = rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
  return {
    deviceId: device.id,
    model: device.model_name,
    locations: rows.map((r) => ({
      locationId: Number(r.locationId),
      location: getDisplayLocationName(r.location, r.externalId),
      quantity: Number(r.quantity || 0)
    })),
    total
  };
}

async function getInventoryByDeviceIdRuntime(deviceId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  try {
    return await getInventoryByDeviceIdPostgres(deviceId);
  } catch (error) {
    throw new Error(`Postgres inventory-by-device query failed: ${error?.message || error}`);
  }
}

async function upsertInventoryQuantityPostgres(deviceId, locationId, quantity) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  await pgClient.query(
    `
      INSERT INTO ${postgresTableRef("device_inventory")} (device_id, location_id, quantity)
      VALUES ($1, $2, $3)
      ON CONFLICT(device_id, location_id)
      DO UPDATE SET quantity = excluded.quantity
    `,
    [deviceId, locationId, quantity]
  );
}

async function upsertInventoryQuantityRuntime(deviceId, locationId, quantity) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  try {
    await upsertInventoryQuantityPostgres(deviceId, locationId, quantity);
  } catch (error) {
    throw new Error(`Postgres inventory upsert failed: ${error?.message || error}`);
  }
}

async function getInventoryQuantityPostgres(deviceId, locationId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = await pgClient.query(
    `
      SELECT quantity
      FROM ${postgresTableRef("device_inventory")}
      WHERE device_id = $1 AND location_id = $2
      LIMIT 1
    `,
    [deviceId, locationId]
  );
  return Number(result.rows?.[0]?.quantity || 0);
}

async function getInventoryQuantityRuntime(deviceId, locationId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  try {
    return await getInventoryQuantityPostgres(deviceId, locationId);
  } catch (error) {
    throw new Error(`Postgres inventory quantity query failed: ${error?.message || error}`);
  }
}

async function addInventoryEventPostgres({ deviceId, locationId, changeType, previousQuantity, newQuantity, delta, reason, changedByUserId }) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  await pgClient.query(
    `
      INSERT INTO ${postgresTableRef("inventory_events")} (
        device_id, location_id, change_type, previous_quantity, new_quantity, delta, reason, changed_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [deviceId, locationId, changeType, previousQuantity, newQuantity, delta, reason || null, changedByUserId ?? null]
  );
}

async function addInventoryEventRuntime(payload) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  try {
    await addInventoryEventPostgres(payload);
  } catch (error) {
    throw new Error(`Postgres inventory event write failed: ${error?.message || error}`);
  }
}

async function getDeviceExistsRuntime(deviceId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  try {
    const result = await pgClient.query(
      `SELECT id, model_name FROM ${postgresTableRef("devices")} WHERE id = $1 LIMIT 1`,
      [deviceId]
    );
    return result.rows?.[0] || null;
  } catch (error) {
    throw new Error(`Postgres device lookup failed: ${error?.message || error}`);
  }
}

async function getLocationExistsRuntime(locationId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  try {
    const result = await pgClient.query(
      `SELECT id, name FROM ${postgresTableRef("locations")} WHERE id = $1 LIMIT 1`,
      [locationId]
    );
    return result.rows?.[0] || null;
  } catch (error) {
    throw new Error(`Postgres location lookup failed: ${error?.message || error}`);
  }
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

function sanitizeCartDraftLines(linesRaw) {
  const lines = Array.isArray(linesRaw) ? linesRaw : [];
  if (!lines.length) return [];
  return validateRequestLines(lines);
}

function cartTrackingLineKey(line) {
  const productId = String(line?.productId || line?.deviceId || "").trim().toLowerCase();
  const model = String(line?.model || "").trim().toLowerCase();
  const grade = String(line?.grade || "").trim().toLowerCase();
  const note = String(line?.note || "").trim().toLowerCase();
  return `${productId}|${model}|${grade}|${note}`;
}

function computeCartTrackingEvents(previousLines, nextLines) {
  const previous = Array.isArray(previousLines) ? previousLines : [];
  const next = Array.isArray(nextLines) ? nextLines : [];
  const prevMap = new Map();
  for (const line of previous) {
    prevMap.set(cartTrackingLineKey(line), line);
  }
  const events = [];
  for (const line of next) {
    const key = cartTrackingLineKey(line);
    const prev = prevMap.get(key);
    const nextQty = Math.max(0, Math.floor(Number(line.quantity || 0)));
    const prevQty = prev ? Math.max(0, Math.floor(Number(prev.quantity || 0))) : 0;
    const deltaQty = !prev ? nextQty : Math.max(0, nextQty - prevQty);
    if (deltaQty < 1) continue;
    events.push({
      deviceId: String(line.productId || line.deviceId || "").trim() || null,
      model: String(line.model || "").trim(),
      grade: String(line.grade || "").trim(),
      quantity: deltaQty,
      offerPrice: Number(line.offerPrice || 0),
      note: String(line.note || "").trim()
    });
  }
  return events;
}

function mapCartDraftRow(row) {
  if (!row) return null;
  let payload = {};
  try {
    payload = row.payload_json ? JSON.parse(row.payload_json) : {};
  } catch {
    payload = {};
  }
  const lines = Array.isArray(payload?.lines)
    ? payload.lines.map((line) => ({
      productId: String(line?.productId || line?.deviceId || "").trim(),
      model: String(line?.model || "").trim(),
      grade: String(line?.grade || "").trim(),
      quantity: Number(line?.quantity || 0),
      offerPrice: Number(line?.offerPrice || 0),
      note: String(line?.note || "").trim()
    })).filter((line) => line.model && line.grade && Number.isFinite(line.quantity) && line.quantity > 0)
    : [];
  return {
    id: Number(row.id || 0),
    userId: Number(row.user_id || 0),
    company: String(row.company || ""),
    email: String(row.email || ""),
    status: String(row.status || "active"),
    lineCount: Number(row.line_count || 0),
    totalAmount: Number(row.total_amount || 0),
    lastActivityAt: row.last_activity_at || row.updated_at || row.created_at || null,
    submittedAt: row.submitted_at || null,
    submittedRequestId: row.submitted_request_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    lines
  };
}

async function getCartDraftForUserPostgres(user) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const userId = await ensurePostgresUserForRuntime(user);
  if (!userId) return null;
  const result = await pgClient.query(
    `SELECT * FROM ${postgresTableRef("cart_drafts")} WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return mapCartDraftRow(result.rows?.[0] || null);
}

async function recordCartItemActivityForUserPostgres(userId, events) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return;
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return;
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  for (const event of list) {
    const model = String(event?.model || "").trim();
    const grade = String(event?.grade || "").trim();
    const quantity = Math.max(0, Math.floor(Number(event?.quantity || 0)));
    const offerPrice = Number(event?.offerPrice || 0);
    if (!model || !grade || quantity < 1 || !Number.isFinite(offerPrice) || offerPrice < 0) continue;
    await pgClient.query(`
      INSERT INTO ${postgresTableRef("cart_item_activity")} (
        user_id, device_id, model, grade, quantity, offer_price, note, ever_requested, added_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, CURRENT_TIMESTAMP)
    `, [id, String(event?.deviceId || "").trim() || null, model, grade, quantity, Number(offerPrice.toFixed(2)), String(event?.note || "").trim() || null]);
  }
}

async function markCartItemActivityRequestedForUserPostgres(userId, linesRaw) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return;
  const lines = Array.isArray(linesRaw) ? linesRaw : [];
  if (!lines.length) return;
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  for (const line of lines) {
    const model = String(line?.model || "").trim();
    const grade = String(line?.grade || "").trim();
    const deviceId = String(line?.deviceId || line?.productId || "").trim() || null;
    if (!model || !grade) continue;
    const params = [id, model.toLowerCase(), grade.toLowerCase()];
    let sql = `
      UPDATE ${postgresTableRef("cart_item_activity")}
      SET ever_requested = 1
      WHERE user_id = $1
        AND ever_requested = 0
        AND LOWER(model) = $2
        AND LOWER(grade) = $3
    `;
    if (deviceId) {
      params.push(deviceId);
      sql += ` AND (device_id = $4 OR device_id IS NULL)`;
    }
    await pgClient.query(sql, params);
  }
}

async function listCartItemActivityForUserPostgres(userId, limitRaw = 200) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) throw new Error("User not found.");
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const safeLimit = Math.max(1, Math.min(1000, Number(limitRaw || 200)));
  const result = await pgClient.query(`
    SELECT id, user_id, device_id, model, grade, quantity, offer_price, note, ever_requested, added_at
    FROM ${postgresTableRef("cart_item_activity")}
    WHERE user_id = $1
    ORDER BY added_at DESC, id DESC
    LIMIT ${safeLimit}
  `, [id]);
  return (result.rows || []).map((row) => ({
    id: Number(row.id || 0),
    userId: Number(row.user_id || 0),
    productId: String(row.device_id || "").trim(),
    model: String(row.model || "").trim(),
    grade: String(row.grade || "").trim(),
    quantity: Number(row.quantity || 0),
    offerPrice: Number(row.offer_price || 0),
    note: String(row.note || "").trim(),
    everRequested: Number(row.ever_requested || 0) === 1,
    addedAt: row.added_at || null
  }));
}

async function upsertCartDraftForUserPostgres(user, body) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const userId = await ensurePostgresUserForRuntime(user);
  if (!userId) throw new Error("Failed to resolve user for cart draft.");
  const existing = await getCartDraftForUserPostgres(user);
  const lines = sanitizeCartDraftLines(body?.lines);
  const events = computeCartTrackingEvents(existing?.lines || [], lines);
  await recordCartItemActivityForUserPostgres(userId, events);
  const totalAmount = Number(lines.reduce((sum, line) => sum + (Number(line.quantity || 0) * Number(line.offerPrice || 0)), 0).toFixed(2));
  const lineCount = lines.length;
  const payload = JSON.stringify({ lines });
  await pgClient.query(
    `
      INSERT INTO ${postgresTableRef("cart_drafts")} (
        user_id, company, email, status, payload_json, line_count, total_amount, submitted_request_id, last_activity_at, submitted_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'active', $4, $5, $6, NULL, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (user_id) DO UPDATE
      SET company = EXCLUDED.company,
          email = EXCLUDED.email,
          status = 'active',
          payload_json = EXCLUDED.payload_json,
          line_count = EXCLUDED.line_count,
          total_amount = EXCLUDED.total_amount,
          submitted_request_id = NULL,
          submitted_at = NULL,
          last_activity_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
    `,
    [userId, String(user?.company || "").trim(), String(user?.email || "").trim(), payload, lineCount, totalAmount]
  );
  return getCartDraftForUserPostgres(user);
}

async function markCartDraftSubmittedForUserPostgres(user, requestId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const userId = await ensurePostgresUserForRuntime(user);
  if (!userId) return;
  await pgClient.query(
    `
      UPDATE ${postgresTableRef("cart_drafts")}
      SET status = 'submitted',
          submitted_request_id = $1,
          submitted_at = CURRENT_TIMESTAMP,
          last_activity_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
    `,
    [String(requestId || "").trim() || null, userId]
  );
}

async function listCartDraftsForAdminPostgres(limitRaw = 100) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const safeLimit = Math.max(1, Math.min(500, Number(limitRaw || 100)));
  const result = await pgClient.query(
    `
      SELECT
        cd.*,
        u.first_name,
        u.last_name,
        u.is_active
      FROM ${postgresTableRef("cart_drafts")} cd
      LEFT JOIN ${postgresTableRef("users")} u ON u.id = cd.user_id
      ORDER BY cd.last_activity_at DESC
      LIMIT ${safeLimit}
    `
  );
  return (result.rows || []).map((row) => {
    const mapped = mapCartDraftRow(row);
    return {
      ...mapped,
      fullName: [String(row.first_name || "").trim(), String(row.last_name || "").trim()].filter(Boolean).join(" ") || null,
      isActiveUser: Number(row.is_active || 0) === 1
    };
  });
}

async function getRequestLinesPostgres(requestId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = await pgClient.query(`
    SELECT device_id, model, grade, quantity, offer_price, note
    FROM ${postgresTableRef("quote_request_lines")}
    WHERE request_id = $1
    ORDER BY id
  `, [requestId]);
  return (result.rows || []).map((line) => ({
    productId: line.device_id || "",
    model: line.model,
    grade: line.grade,
    quantity: Number(line.quantity || 0),
    offerPrice: Number(line.offer_price || 0),
    note: line.note || ""
  }));
}

function mapRequestRowWithLines(row, lines) {
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
    lines: Array.isArray(lines) ? lines : []
  };
}

async function mapRequestRowPostgres(row) {
  const lines = await getRequestLinesPostgres(row.id);
  return mapRequestRowWithLines(row, lines);
}

async function getRequestsForUserPostgres(user) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = user.role === "admin"
    ? await pgClient.query(`SELECT * FROM ${postgresTableRef("quote_requests")} ORDER BY created_at DESC`)
    : await pgClient.query(`SELECT * FROM ${postgresTableRef("quote_requests")} WHERE company = $1 ORDER BY created_at DESC`, [user.company]);
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const mapped = [];
  for (const row of rows) {
    mapped.push(await mapRequestRowPostgres(row));
  }
  return mapped;
}

async function getRequestByIdForUserPostgres(user, requestId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = await pgClient.query(`SELECT * FROM ${postgresTableRef("quote_requests")} WHERE id = $1 LIMIT 1`, [requestId]);
  const row = result.rows?.[0];
  if (!row?.id) return null;
  if (user.role !== "admin" && row.company !== user.company) return null;
  return mapRequestRowPostgres(row);
}

async function getNextRequestNumberPostgres() {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const year = new Date().getFullYear();
  const prefix = `REQ-${year}-`;
  const result = await pgClient.query(
    `SELECT request_number FROM ${postgresTableRef("quote_requests")} WHERE request_number LIKE $1 ORDER BY request_number DESC LIMIT 1`,
    [`${prefix}%`]
  );
  const latest = String(result.rows?.[0]?.request_number || "");
  const latestMatch = latest.match(/(\d+)$/);
  const next = (latestMatch ? Number(latestMatch[1]) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

async function getNextDummyEstimateNumberPostgres() {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const year = new Date().getFullYear();
  const prefix = `EST-${year}-`;
  const result = await pgClient.query(
    `SELECT netsuite_estimate_number FROM ${postgresTableRef("quote_requests")} WHERE netsuite_estimate_number LIKE $1 ORDER BY netsuite_estimate_number DESC LIMIT 1`,
    [`${prefix}%`]
  );
  const latest = String(result.rows?.[0]?.netsuite_estimate_number || "");
  const latestMatch = latest.match(/(\d+)$/);
  const next = (latestMatch ? Number(latestMatch[1]) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

async function ensurePostgresUserForRuntime(user) {
  if (!pgClient || !user) return null;
  const email = normalizeEmail(user.email);
  if (!email) return null;
  const numericId = Number(user.id);
  const requestedId = Number.isInteger(numericId) && numericId > 0 ? numericId : null;

  if (requestedId !== null) {
    const byId = await pgClient.query(`SELECT id FROM ${postgresTableRef("users")} WHERE id = $1 LIMIT 1`, [requestedId]);
    if (byId.rows?.[0]?.id) return Number(byId.rows[0].id);
  }
  const byEmail = await pgClient.query(`SELECT id FROM ${postgresTableRef("users")} WHERE email = $1 LIMIT 1`, [email]);
  if (byEmail.rows?.[0]?.id) return Number(byEmail.rows[0].id);

  const company = String(user.company || "Unknown").trim() || "Unknown";
  const role = String(user.role || "buyer").trim() === "admin" ? "admin" : "buyer";
  const placeholderPasswordHash = hashPassword(randomBytes(24).toString("hex"));
  if (requestedId !== null) {
    try {
      const inserted = await pgClient.query(`
        INSERT INTO ${postgresTableRef("users")} (id, email, company, role, password_hash, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, 1, CURRENT_TIMESTAMP)
        RETURNING id
      `, [requestedId, email, company, role, placeholderPasswordHash]);
      if (inserted.rows?.[0]?.id) return Number(inserted.rows[0].id);
    } catch {
      const retryById = await pgClient.query(`SELECT id FROM ${postgresTableRef("users")} WHERE id = $1 LIMIT 1`, [requestedId]);
      if (retryById.rows?.[0]?.id) return Number(retryById.rows[0].id);
      const retryByEmail = await pgClient.query(`SELECT id FROM ${postgresTableRef("users")} WHERE email = $1 LIMIT 1`, [email]);
      if (retryByEmail.rows?.[0]?.id) return Number(retryByEmail.rows[0].id);
    }
  }
  const inserted = await pgClient.query(`
    INSERT INTO ${postgresTableRef("users")} (email, company, role, password_hash, is_active, created_at)
    VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP)
    RETURNING id
  `, [email, company, role, placeholderPasswordHash]);
  return Number(inserted.rows?.[0]?.id || 0) || null;
}

async function createRequestForUserPostgres(user, body) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const lines = validateRequestLines(body.lines);
  const requestId = randomBytes(16).toString("hex");
  const createdByUserId = await ensurePostgresUserForRuntime(user);
  let requestNumber = await getNextRequestNumberPostgres();
  const total = Number(lines.reduce((sum, line) => sum + (line.quantity * line.offerPrice), 0).toFixed(2));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await pgClient.query("BEGIN");
    try {
      await pgClient.query(`
        INSERT INTO ${postgresTableRef("quote_requests")} (
          id, request_number, company, created_by_user_id, created_by_email, status, total_amount, currency_code, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'New', $6, 'USD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [requestId, requestNumber, user.company, createdByUserId, user.email, total]);

      for (const line of lines) {
        await pgClient.query(`
          INSERT INTO ${postgresTableRef("quote_request_lines")} (
            request_id, device_id, model, grade, quantity, offer_price, note
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [requestId, line.deviceId, line.model, line.grade, line.quantity, line.offerPrice, line.note || null]);
      }
      if (createdByUserId) {
        await markCartItemActivityRequestedForUserPostgres(createdByUserId, lines);
      }

      await pgClient.query(`
        INSERT INTO ${postgresTableRef("quote_request_events")} (request_id, event_type, payload_json)
        VALUES ($1, 'request_created', $2)
      `, [requestId, JSON.stringify({ lineCount: lines.length, total })]);
      await pgClient.query("COMMIT");
      return getRequestByIdForUserPostgres(user, requestId);
    } catch (error) {
      await pgClient.query("ROLLBACK");
      const message = String(error?.message || "");
      if (message.toLowerCase().includes("request_number") && message.toLowerCase().includes("unique")) {
        requestNumber = await getNextRequestNumberPostgres();
        continue;
      }
      throw error;
    }
  }
  throw new Error("Failed to allocate unique request number.");
}

async function createDummyEstimateForRequestPostgres(user, requestId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = await pgClient.query(`SELECT * FROM ${postgresTableRef("quote_requests")} WHERE id = $1 LIMIT 1`, [requestId]);
  const row = result.rows?.[0];
  if (!row?.id) {
    throw new Error("Request not found.");
  }
  if (user.role !== "admin" && row.company !== user.company) {
    throw new Error("Forbidden");
  }
  if (row.netsuite_estimate_id) {
    return getRequestByIdForUserPostgres(user, requestId);
  }

  const estimateId = `dummy-est-${randomBytes(6).toString("hex")}`;
  const estimateNumber = await getNextDummyEstimateNumberPostgres();
  const syncAt = new Date().toISOString();
  await pgClient.query(`
    UPDATE ${postgresTableRef("quote_requests")}
    SET status = 'Estimate Created',
        netsuite_estimate_id = $1,
        netsuite_estimate_number = $2,
        netsuite_status = 'Estimate Created',
        netsuite_last_sync_at = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
  `, [estimateId, estimateNumber, syncAt, requestId]);
  await pgClient.query(`
    INSERT INTO ${postgresTableRef("quote_request_events")} (request_id, event_type, payload_json)
    VALUES ($1, 'dummy_estimate_created', $2)
  `, [requestId, JSON.stringify({ estimateId, estimateNumber, syncedAt: syncAt })]);
  return getRequestByIdForUserPostgres(user, requestId);
}

async function updateDummyEstimateStatusPostgres(user, requestId, nextStatus) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = await pgClient.query(`SELECT * FROM ${postgresTableRef("quote_requests")} WHERE id = $1 LIMIT 1`, [requestId]);
  const row = result.rows?.[0];
  if (!row?.id) {
    throw new Error("Request not found.");
  }
  if (user.role !== "admin" && row.company !== user.company) {
    throw new Error("Forbidden");
  }
  const status = normalizeRequestStatus(nextStatus, row.status || "New");
  const syncAt = new Date().toISOString();
  await pgClient.query(`
    UPDATE ${postgresTableRef("quote_requests")}
    SET status = $1,
        netsuite_status = $2,
        netsuite_last_sync_at = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
  `, [status, status, syncAt, requestId]);
  await pgClient.query(`
    INSERT INTO ${postgresTableRef("quote_request_events")} (request_id, event_type, payload_json)
    VALUES ($1, 'dummy_status_update', $2)
  `, [requestId, JSON.stringify({ status, syncedAt: syncAt })]);
  return getRequestByIdForUserPostgres(user, requestId);
}

async function getRequestsForUserRuntime(user) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  return getRequestsForUserPostgres(user);
}

async function getRequestByIdForUserRuntime(user, requestId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  return getRequestByIdForUserPostgres(user, requestId);
}

async function createRequestForUserRuntime(user, body) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const created = await createRequestForUserPostgres(user, body);
  if (created?.id) {
    try {
      await markCartDraftSubmittedForUserPostgres(user, created.id);
    } catch (error) {
      console.warn(`[cart-draft] Failed to mark draft submitted: ${error?.message || error}`);
    }
  }
  return created;
}

async function createDummyEstimateForRequestRuntime(user, requestId) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  return createDummyEstimateForRequestPostgres(user, requestId);
}

async function updateDummyEstimateStatusRuntime(user, requestId, status) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  return updateDummyEstimateStatusPostgres(user, requestId, status);
}

async function getCartDraftForUserRuntime(user) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  return getCartDraftForUserPostgres(user);
}

async function upsertCartDraftForUserRuntime(user, body) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  return upsertCartDraftForUserPostgres(user, body);
}

async function listCartDraftsForAdminRuntime(limitRaw = 100) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  return listCartDraftsForAdminPostgres(limitRaw);
}

async function listCartItemActivityForUserRuntime(userId, limitRaw = 200) {
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  return listCartItemActivityForUserPostgres(userId, limitRaw);
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

async function getSavedFiltersForUser(userId, viewKeyRaw) {
  const viewKey = normalizeSavedFilterViewKey(viewKeyRaw);
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = await pgClient.query(
    `
      SELECT id, view_key, name, payload_json, created_at, updated_at
      FROM ${postgresTableRef("user_saved_filters")}
      WHERE user_id = $1 AND view_key = $2
      ORDER BY updated_at DESC, name ASC
    `,
    [userId, viewKey]
  );
  const rows = Array.isArray(result.rows) ? result.rows : [];
  return rows.map(mapSavedFilterRow);
}

async function upsertSavedFilterForUser(userId, body) {
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
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = await pgClient.query(
    `
      INSERT INTO ${postgresTableRef("user_saved_filters")} (user_id, view_key, name, payload_json, created_at, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, view_key, name)
      DO UPDATE SET
        payload_json = excluded.payload_json,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, view_key, name, payload_json, created_at, updated_at
    `,
    [userId, viewKey, name, payloadJson]
  );
  const row = result.rows?.[0] || null;
  return mapSavedFilterRow(row);
}

async function updateSavedFilterForUser(userId, filterIdRaw, body) {
  const filterId = Number(filterIdRaw);
  if (!Number.isInteger(filterId) || filterId < 1) {
    throw new Error("Saved filter not found.");
  }
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const existingResult = await pgClient.query(
    `
      SELECT id, view_key, name
      FROM ${postgresTableRef("user_saved_filters")}
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [filterId, userId]
  );
  const existing = existingResult.rows?.[0] || null;
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
  let row = null;
  try {
    const result = await pgClient.query(
      `
        UPDATE ${postgresTableRef("user_saved_filters")}
        SET name = $1, payload_json = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND user_id = $4
        RETURNING id, view_key, name, payload_json, created_at, updated_at
      `,
      [name, payloadJson, filterId, userId]
    );
    row = result.rows?.[0] || null;
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("UNIQUE constraint failed") || String(error?.code || "") === "23505") {
      throw new Error("Saved filter name already exists.");
    }
    throw error;
  }
  if (!row?.id) {
    throw new Error("Saved filter not found.");
  }
  return mapSavedFilterRow(row);
}

async function deleteSavedFilterForUser(userId, filterIdRaw) {
  const filterId = Number(filterIdRaw);
  if (!Number.isInteger(filterId) || filterId < 1) {
    throw new Error("Saved filter not found.");
  }
  if (!pgClient) throw new Error("Postgres runtime is not initialized.");
  const result = await pgClient.query(
    `
      DELETE FROM ${postgresTableRef("user_saved_filters")}
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
    [filterId, userId]
  );
  if (!result.rows?.[0]?.id) {
    throw new Error("Saved filter not found.");
  }
}

if (effectiveDbEngine !== "postgres") {
  initDb();
}

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
      json(req, res, 200, {
        ok: true,
        dbEngine: effectiveDbEngine
      });
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

      const existing = await getUserByEmailRuntime(email, false);
      if (existing?.id) {
        json(req, res, 409, { error: "User already exists." });
        return;
      }

      const passwordHash = hashPassword(password);
      await createUserRuntime({ email, company, role: "buyer", passwordHash, isActive: false, registrationCompleted: true });
      json(req, res, 201, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const row = await getUserByEmailRuntime(email, true);

      if (!row || !verifyPassword(password, row.password_hash)) {
        json(req, res, 401, { error: "Invalid email or password." });
        return;
      }
      if (Number(row.is_active) !== 1) {
        json(req, res, 200, { pendingApproval: true, email: row.email, company: row.company });
        return;
      }

      await recordUserLoginRuntime(row.id);
      row.login_count = Number(row.login_count || 0) + 1;
      row.last_login_at = new Date().toISOString();
      const issued = createSession(row);
      const refreshToken = await issueRefreshTokenRuntime(row.id);
      json(req, res, 200, { token: issued.token, refreshToken, accessTokenExpiresAt: new Date(issued.expiresAt).toISOString(), user: makePublicUser(row) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/auth0-exchange") {
      const body = await parseBody(req);
      const accessToken = String(body.accessToken || getAuthToken(req) || "").trim();
      const companyFromSignup = normalizeCompanyName(body.company || "");
      try {
        const claims = await verifyAuth0AccessToken(accessToken);
        const userInfo = await fetchAuth0UserInfo(accessToken);
        const row = await upsertUserFromAuth0ClaimsRuntime(claims, String(userInfo?.email || ""), companyFromSignup);
        if (!row?.id) {
          json(req, res, 401, { error: "Unauthorized." });
          return;
        }
        if (Number(row.registration_completed || 0) !== 1) {
          json(req, res, 200, {
            profileSetupRequired: true,
            email: row.email,
            firstName: String(row.first_name || ""),
            lastName: String(row.last_name || ""),
            company: String(row.company || "")
          });
          return;
        }
        if (Number(row.is_active) !== 1) {
          json(req, res, 200, { pendingApproval: true, email: row.email, company: row.company });
          return;
        }
        await recordUserLoginRuntime(row.id);
        row.login_count = Number(row.login_count || 0) + 1;
        row.last_login_at = new Date().toISOString();
        const issued = createSession(row);
        const refreshToken = await issueRefreshTokenRuntime(row.id);
        json(req, res, 200, {
          token: issued.token,
          refreshToken,
          accessTokenExpiresAt: new Date(issued.expiresAt).toISOString(),
          user: makePublicUser(row)
        });
      } catch (error) {
        json(req, res, 401, { error: error.message || "Auth0 token verification failed." });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/complete-profile") {
      const body = await parseBody(req);
      const accessToken = String(body.accessToken || getAuthToken(req) || "").trim();
      const firstName = normalizePersonName(body.firstName || "");
      const lastName = normalizePersonName(body.lastName || "");
      const company = normalizeCompanyName(body.company || "");
      if (!firstName || !lastName || !company) {
        json(req, res, 400, { error: "First name, last name and company are required." });
        return;
      }
      try {
        const claims = await verifyAuth0AccessToken(accessToken);
        const userInfo = await fetchAuth0UserInfo(accessToken);
        const row = await upsertUserFromAuth0ClaimsRuntime(claims, String(userInfo?.email || ""), company);
        if (!row?.id) {
          json(req, res, 401, { error: "Unauthorized." });
          return;
        }
        await completeUserRegistrationRuntime(row.id, firstName, lastName, company);
        const updated = await getUserByIdRuntime(row.id, false);
        if (!updated?.id) {
          json(req, res, 500, { error: "Failed to load user profile after completion." });
          return;
        }
        json(req, res, 200, {
          ok: true,
          pendingApproval: Number(updated.is_active || 0) !== 1,
          email: updated.email,
          company: updated.company,
          profileSetupRequired: false
        });
      } catch (error) {
        json(req, res, 401, { error: error.message || "Profile completion failed." });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/cancel-registration") {
      const body = await parseBody(req);
      const accessToken = String(body.accessToken || getAuthToken(req) || "").trim();
      try {
        const claims = await verifyAuth0AccessToken(accessToken);
        const userInfo = await fetchAuth0UserInfo(accessToken);
        const auth0Sub = String(claims?.sub || "").trim();
        const email = normalizeEmail(claims?.email || userInfo?.email || "");
        if (!auth0Sub) {
          json(req, res, 401, { error: "Auth0 token missing subject (sub)." });
          return;
        }
        const bySub = await getUserByAuth0SubRuntime(auth0Sub, false);
        const byEmail = !bySub?.id && email ? await getUserByEmailRuntime(email, false) : null;
        const localUser = bySub?.id ? bySub : byEmail;

        await deleteAuth0UserBySub(auth0Sub);

        let deletedLocal = false;
        if (localUser?.id) {
          await deleteUserRuntime(localUser.id);
          deletedLocal = true;
          for (const [token, session] of sessions.entries()) {
            if (Number(session?.user?.id || 0) === Number(localUser.id)) {
              sessions.delete(token);
            }
          }
        }

        json(req, res, 200, { ok: true, deletedAuth0: true, deletedLocal });
      } catch (error) {
        json(req, res, 401, { error: error.message || "Cancel registration failed." });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/refresh") {
      const body = await parseBody(req);
      const refreshToken = String(body.refreshToken || "").trim();
      if (!refreshToken) {
        json(req, res, 400, { error: "Refresh token is required." });
        return;
      }

      const rotated = await rotateRefreshTokenRuntime(refreshToken);
      if (!rotated?.userId) {
        json(req, res, 401, { error: "Invalid or expired refresh token." });
        return;
      }

      const row = await getUserByIdRuntime(rotated.userId, false);
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
        await revokeRefreshTokenRuntime(refreshToken);
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
      const row = await getUserByEmailRuntime(email, false);
      if (row?.id) {
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await setUserResetCodeRuntime(row.id, DEMO_RESET_CODE, expiresAt);
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

      const row = await getUserByEmailRuntime(email, false);
      if (!row?.id || !row.reset_code || row.reset_code !== code) {
        json(req, res, 400, { error: "Invalid verification code." });
        return;
      }
      if (!row.reset_code_expires_at || new Date(row.reset_code_expires_at).getTime() < Date.now()) {
        json(req, res, 400, { error: "Verification code expired. Please request a new code." });
        return;
      }

      const passwordHash = hashPassword(newPassword);
      await updateUserPasswordAndClearResetRuntime(row.id, passwordHash);
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

    if (req.method === "GET" && url.pathname === "/api/cart-draft") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const draft = await getCartDraftForUserRuntime(user);
      json(req, res, 200, draft || { status: "active", lines: [], lineCount: 0, totalAmount: 0 });
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/cart-draft") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      try {
        const draft = await upsertCartDraftForUserRuntime(user, body);
        json(req, res, 200, draft || { ok: true });
      } catch (error) {
        const message = String(error?.message || "Failed to save cart draft.");
        json(req, res, 400, { error: message });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      const user = requireAdmin(req, res);
      if (!user) return;
      try {
        await syncAuth0UsersToLocalDb({ reason: "admin_users_list" });
      } catch (error) {
        console.warn(`[auth0-sync] Admin users sync failed: ${error?.message || error}`);
      }
      const users = await listUsersForAdminRuntime();
      json(req, res, 200, users);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/cart-drafts") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const limit = Number(url.searchParams.get("limit") || 100);
      const drafts = await listCartDraftsForAdminRuntime(limit);
      json(req, res, 200, drafts);
      return;
    }

    const userCartActivityMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/cart-activity$/);
    if (req.method === "GET" && userCartActivityMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const targetUserId = Number(userCartActivityMatch[1]);
      if (!Number.isInteger(targetUserId) || targetUserId < 1) {
        json(req, res, 400, { error: "Invalid user id." });
        return;
      }
      const limit = Number(url.searchParams.get("limit") || 300);
      const activity = await listCartItemActivityForUserRuntime(targetUserId, limit);
      json(req, res, 200, activity);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/users") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const company = String(body.company || "").trim();
      const firstName = normalizePersonName(body.firstName || "");
      const lastName = normalizePersonName(body.lastName || "");
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
      const existing = await getUserByEmailRuntime(email, false);
      if (existing?.id) {
        json(req, res, 409, { error: "User already exists." });
        return;
      }

      const role = isAdmin ? "admin" : "buyer";
      const hash = hashPassword(password);
      await createUserRuntime({
        email,
        company,
        role,
        passwordHash: hash,
        isActive,
        firstName,
        lastName,
        registrationCompleted: true
      });
      json(req, res, 201, { ok: true });
      return;
    }

    const userPatchMatch = url.pathname.match(/^\/api\/users\/(\d+)$/);
    if (req.method === "PATCH" && userPatchMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const userId = Number(userPatchMatch[1]);
      const body = await parseBody(req);
      try {
        await updateUserAdminFieldsRuntime(userId, {
          isActive: body.isActive,
          isAdmin: body.isAdmin,
          registrationCompleted: body.registrationCompleted
        });
        json(req, res, 200, { ok: true });
      } catch (error) {
        const message = String(error?.message || "Failed to update user.");
        const status = message === "No valid fields to update." ? 400 : (message === "User not found." ? 404 : 500);
        json(req, res, status, { error: message });
      }
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
      const target = await getUserForAdminByIdRuntime(userId);
      if (!target?.id) {
        json(req, res, 404, { error: "User not found." });
        return;
      }

      const auth0Sub = String(target.auth0_sub || "").trim();
      let auth0Deleted = false;
      if (auth0Sub) {
        try {
          const result = await deleteAuth0UserBySub(auth0Sub);
          auth0Deleted = Boolean(result?.deleted);
        } catch (error) {
          const message = String(error?.message || "Failed to delete user in Auth0.");
          json(req, res, 502, {
            error: `Local delete canceled because Auth0 delete failed: ${message}`
          });
          return;
        }
      }

      try {
        await deleteUserRuntime(userId);
      } catch (error) {
        const message = String(error?.message || "Failed to delete user.");
        const status = message === "User not found." ? 404 : 500;
        json(req, res, status, { error: message });
        return;
      }

      for (const [token, session] of sessions.entries()) {
        if (Number(session?.user?.id || 0) === userId) {
          sessions.delete(token);
        }
      }

      json(req, res, 200, {
        ok: true,
        deletedUserId: userId,
        deletedEmail: target.email,
        auth0Deleted
      });
      return;
    }

    const userSeedHistoryMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/seed-history$/);
    if (req.method === "POST" && userSeedHistoryMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const targetUserId = Number(userSeedHistoryMatch[1]);
      const body = await parseBody(req);
      const count = Number(body?.count || 20);
      try {
        const result = await seedHistoricalCompletedEstimatesForUserRuntime(targetUserId, count);
        json(req, res, 200, result);
      } catch (error) {
        const message = String(error?.message || "Failed to seed historical estimates.");
        const statusCode = message === "User not found." ? 404 : 400;
        json(req, res, statusCode, { error: message });
      }
      return;
    }

    const userSeedCartActivityMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/seed-cart-activity$/);
    if (req.method === "POST" && userSeedCartActivityMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const targetUserId = Number(userSeedCartActivityMatch[1]);
      const body = await parseBody(req);
      const count = Number(body?.count || 20);
      try {
        const result = await seedCartActivityForUserRuntime(targetUserId, count);
        json(req, res, 200, result);
      } catch (error) {
        const message = String(error?.message || "Failed to seed cart activity.");
        const statusCode = message === "User not found." ? 404 : 400;
        json(req, res, statusCode, { error: message });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/categories") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      json(req, res, 200, await getCategoriesRuntime());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/devices") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      json(req, res, 200, await getDevicesRuntime(url));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ai/parse-filters") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      json(req, res, 200, await parseAiFiltersRuntime(body.prompt, body.selectedCategory));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ai/validate-request") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      json(req, res, 200, await validateRequestWithAi(body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ai/validate-netsuite-payload") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      json(req, res, 200, await validateNetsuitePayloadWithAi(body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ai/copilot") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const body = await parseBody(req);
      json(req, res, 200, await runAiCopilot(user, body));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/ai/admin/anomalies") {
      const user = requireAdmin(req, res);
      if (!user) return;
      json(req, res, 200, { anomalies: await getAiAdminAnomaliesRuntime() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/ai/admin/sales-insights") {
      const user = requireAdmin(req, res);
      if (!user) return;
      json(req, res, 200, await getAiSalesInsightsRuntime(url.searchParams.get("days")));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/filters/saved") {
      const user = getAuthUser(req);
      if (!user) {
        json(req, res, 401, { error: "Unauthorized" });
        return;
      }
      const viewKey = url.searchParams.get("view") || "category";
      json(req, res, 200, await getSavedFiltersForUser(user.id, viewKey));
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
        const savedFilter = await upsertSavedFilterForUser(user.id, body);
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
        const savedFilter = await updateSavedFilterForUser(user.id, filterId, body);
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
        await deleteSavedFilterForUser(user.id, filterId);
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
      json(req, res, 200, await getRequestsForUserRuntime(user));
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
        const request = await createRequestForUserRuntime(user, body);
        json(req, res, 201, request);
      } catch (error) {
        const message = String(error?.message || "Failed to create request.");
        const isValidation = message.includes("At least one request line is required.")
          || message.includes("model is required.")
          || message.includes("grade is required.")
          || message.includes("quantity must be an integer >= 1.")
          || message.includes("offerPrice must be a number >= 0.");
        json(req, res, isValidation ? 400 : 500, { error: message });
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
      const request = await getRequestByIdForUserRuntime(user, requestId);
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
        const request = await createDummyEstimateForRequestRuntime(user, requestId);
        json(req, res, 200, { ok: true, request });
      } catch (error) {
        const message = String(error?.message || "Failed to create dummy estimate.");
        const statusCode = message === "Request not found." ? 404 : (message === "Forbidden" ? 403 : 500);
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
        const request = await updateDummyEstimateStatusRuntime(user, requestId, status);
        json(req, res, 200, { ok: true, request });
      } catch (error) {
        const message = String(error?.message || "Failed to update dummy estimate status.");
        const statusCode = message === "Request not found." ? 404 : (message === "Forbidden" ? 403 : 500);
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
      json(req, res, 200, { enabled: await getBooleanAppSettingRuntime("weekly_special_banner_enabled", false) });
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
      await setBooleanAppSettingRuntime("weekly_special_banner_enabled", body.enabled);
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
      const changed = await updateWeeklySpecialFlagRuntime(deviceId, body.weeklySpecial);
      if (!changed) {
        json(req, res, 404, { error: "Device not found." });
        return;
      }
      json(req, res, 200, { ok: true, deviceId, weeklySpecial: body.weeklySpecial });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/integrations/boomi/inventory/sync") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const started = startBoomiSyncJob();
      json(req, res, 202, { ok: true, ...started });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/integrations/boomi/inventory/sync/status") {
      const user = requireAdmin(req, res);
      if (!user) return;
      json(req, res, 200, { ok: true, status: getBoomiSyncJobStatus() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/catalog/clear") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const before = await clearCatalogDataRuntime();
      json(req, res, 200, { ok: true, removedDevices: before.devices, removedRawRows: before.raw });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/catalog/debug-counts") {
      const user = requireAdmin(req, res);
      if (!user) return;
      json(req, res, 200, { ok: true, ...(await getCatalogDebugCountsRuntime()) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/catalog/seed-real") {
      const user = requireAdmin(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const countPerCategory = Math.max(1, Math.min(1000, Number(body.countPerCategory || 100)));
      const started = startAdminSeedRealJob(countPerCategory);
      json(req, res, 202, { ok: true, ...started });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/catalog/seed-real/status") {
      const user = requireAdmin(req, res);
      if (!user) return;
      json(req, res, 200, { ok: true, status: getAdminSeedRealJobStatus() });
      return;
    }

    const inventoryByDeviceMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)$/);
    if (req.method === "GET" && inventoryByDeviceMatch) {
      const user = requireAdmin(req, res);
      if (!user) return;
      const deviceId = decodeURIComponent(inventoryByDeviceMatch[1]);
      const inventory = await getInventoryByDeviceIdRuntime(deviceId);
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
      if (!await getDeviceExistsRuntime(deviceId)) {
        json(req, res, 404, { error: "Device not found." });
        return;
      }
      if (!await getLocationExistsRuntime(locationId)) {
        json(req, res, 404, { error: "Location not found." });
        return;
      }

      const previousQuantity = await getInventoryQuantityRuntime(deviceId, locationId);
      await upsertInventoryQuantityRuntime(deviceId, locationId, quantity);
      await addInventoryEventRuntime({
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
      if (!await getDeviceExistsRuntime(deviceId)) {
        json(req, res, 404, { error: "Device not found." });
        return;
      }
      if (!await getLocationExistsRuntime(locationId)) {
        json(req, res, 404, { error: "Location not found." });
        return;
      }

      const previousQuantity = await getInventoryQuantityRuntime(deviceId, locationId);
      const newQuantity = previousQuantity + delta;
      if (newQuantity < 0) {
        json(req, res, 400, { error: "Adjustment would result in negative quantity." });
        return;
      }

      await upsertInventoryQuantityRuntime(deviceId, locationId, newQuantity);
      await addInventoryEventRuntime({
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
        if (!await getDeviceExistsRuntime(deviceId)) {
          errors.push({ index: i, field: "deviceId", message: "Device not found." });
        }
        if (!await getLocationExistsRuntime(locationId)) {
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
          const current = await getInventoryQuantityRuntime(deviceId, locationId);
          if (current + delta < 0) {
            errors.push({ index: i, field: "delta", message: "Adjustment would result in negative quantity." });
          }
        }
      }
      if (errors.length) {
        json(req, res, 400, { error: "Validation failed", details: errors });
        return;
      }

      if (!pgClient) {
        throw new Error("Postgres runtime is not initialized.");
      }
      await pgClient.query("BEGIN");
      try {
        for (const row of updates) {
          const deviceId = String(row.deviceId).trim();
          const locationId = Number(row.locationId);
          const previousQuantity = await getInventoryQuantityPostgres(deviceId, locationId);
          if (mode === "set") {
            const quantity = Number(row.quantity);
            await upsertInventoryQuantityPostgres(deviceId, locationId, quantity);
            await addInventoryEventPostgres({
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
            await upsertInventoryQuantityPostgres(deviceId, locationId, newQuantity);
            await addInventoryEventPostgres({
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
        await pgClient.query("COMMIT");
      } catch (error) {
        await pgClient.query("ROLLBACK");
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

async function startServer() {
  if (effectiveDbEngine === "postgres") {
    await initializePostgresRuntime();
  }
  if (AUTH0_AUTO_SYNC_USERS) {
    try {
      const syncResult = await syncAuth0UsersToLocalDb({ force: true, reason: "startup" });
      if (syncResult?.ok) {
        console.log(`[startup] Auth0 user sync completed: fetched=${syncResult.totalFetched} created=${syncResult.created} linked=${syncResult.linked}`);
      } else if (syncResult?.skipped) {
        console.log(`[startup] Auth0 user sync skipped: ${syncResult.reason}`);
      }
    } catch (error) {
      console.warn(`[startup] Auth0 user sync failed: ${error?.message || error}`);
    }
  }
  server.listen(port, () => {
    console.log(`API running on http://127.0.0.1:${port}`);
  });
}

startServer().catch((error) => {
  console.error(`[startup] ${error?.message || error}`);
  process.exit(1);
});

