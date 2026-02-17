import { createServer } from "node:http";
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
const port = Number(process.env.PORT || process.env.API_PORT || 8787);

const ADMIN_EMAIL = "thomas.torvund@pcsww.com";
const ADMIN_PASSWORD = "AdminPassword123!";
const DEMO_RESET_CODE = "123456";
const sessions = new Map();

const db = new DatabaseSync(dbPath);

function initDb() {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(readFileSync(schemaPath, "utf8"));
  ensureUsersColumns();
  const countStmt = db.prepare("SELECT COUNT(*) AS count FROM categories");
  const count = Number(countStmt.get().count || 0);
  if (count === 0) {
    db.exec(readFileSync(seedPath, "utf8"));
  }
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
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(payload));
}

function mimeTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
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
      COALESCE(SUM(di.quantity), 0) AS available
    FROM devices d
    JOIN manufacturers m ON m.id = d.manufacturer_id
    JOIN categories c ON c.id = d.category_id
    LEFT JOIN locations dl ON dl.id = d.default_location_id
    LEFT JOIN device_inventory di ON di.device_id = d.id
    ${whereSql}
    GROUP BY d.id, m.name, d.model_name, d.model_family, c.name, d.grade, dl.name, d.storage_capacity, d.base_price, d.image_url
    ORDER BY c.id, m.name, d.model_name
  `;

  const devices = db.prepare(baseSql).all(params);
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

  return devices.map((d) => {
    const locationRows = locationStmt.all(d.id);
    const locations = {};
    for (const row of locationRows) {
      locations[row.location] = Number(row.quantity || 0);
    }
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
      image: d.image || undefined,
      available: Number(d.available || 0),
      locations
    };
  });
}

function getCategories() {
  return db.prepare("SELECT name FROM categories ORDER BY id").all().map((row) => row.name);
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

    json(res, 404, { error: "Not found" });
  } catch (error) {
    json(res, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`API running on http://127.0.0.1:${port}`);
});
