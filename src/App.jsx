import React, { useEffect, useMemo, useRef, useState } from "react";

const productsSeed = [
  { id: "p1", manufacturer: "Apple", model: "iPhone 15 Pro Max 128GB", category: "Smartphones", grade: "A", region: "Miami", storage: "128GB", price: 100, available: 100, image: "images/iphone_15_Pro.png", locations: { Miami: 40, Dubai: 20, "Hong Kong": 25, Japan: 15 } },
  { id: "p2", manufacturer: "Apple", model: "iPhone 15 Pro Max 256GB", category: "Smartphones", grade: "A", region: "Dubai", storage: "256GB", price: 110, available: 0, image: "images/iphone_15_Pro.png", locations: { Miami: 0, Dubai: 0, "Hong Kong": 0, Japan: 0 } },
  { id: "p9", manufacturer: "Apple", model: "iPhone 15 Pro 128GB", category: "Smartphones", grade: "A", region: "Miami", storage: "128GB", price: 98, available: 52, image: "images/iphone_15_Pro.png", locations: { Miami: 20, Dubai: 14, "Hong Kong": 10, Japan: 8 } },
  { id: "p10", manufacturer: "Apple", model: "iPhone 15 128GB", category: "Smartphones", grade: "A", region: "Japan", storage: "128GB", price: 88, available: 46, image: "images/iphone_15_Pro.png", locations: { Miami: 16, Dubai: 10, "Hong Kong": 8, Japan: 12 } },
  { id: "p3", manufacturer: "Samsung", model: "Galaxy A07 64GB", category: "Smartphones", grade: "A", region: "Miami", storage: "64GB", price: 100, available: 100, locations: { Miami: 55, Dubai: 15, "Hong Kong": 10, Japan: 20 } },
  { id: "p4", manufacturer: "Google", model: "Pixel 8 128GB", category: "Smartphones", grade: "B", region: "Japan", storage: "128GB", price: 90, available: 65, locations: { Miami: 20, Dubai: 15, "Hong Kong": 10, Japan: 20 } },
  { id: "p5", manufacturer: "Apple", model: "iPad Pro 11 256GB", category: "Tablets", grade: "A", region: "Miami", storage: "256GB", price: 180, available: 45, locations: { Miami: 15, Dubai: 10, "Hong Kong": 12, Japan: 8 } },
  { id: "p6", manufacturer: "Lenovo", model: "Yoga Slim 9i", category: "Laptops", grade: "A", region: "Dubai", storage: "512GB", price: 300, available: 12, locations: { Miami: 4, Dubai: 2, "Hong Kong": 3, Japan: 3 } },
  { id: "p7", manufacturer: "Apple", model: "Watch Ultra 47mm", category: "Wearables", grade: "A", region: "Hong Kong", storage: "32GB", price: 220, available: 22, locations: { Miami: 4, Dubai: 7, "Hong Kong": 9, Japan: 2 } },
  { id: "p8", manufacturer: "Apple", model: "AirPods Pro", category: "Accessories", grade: "A", region: "Miami", storage: "N/A", price: 75, available: 80, locations: { Miami: 25, Dubai: 25, "Hong Kong": 10, Japan: 20 } }
];

const categoryImagePlaceholders = {
  Smartphones: "https://unsplash.com/photos/HpZrngfKpG8/download?force=true&w=900",
  Tablets: "https://unsplash.com/photos/6AA9MDixOYM/download?force=true&w=900",
  Laptops: "https://unsplash.com/photos/fJdEMpA83NM/download?force=true&w=900",
  Wearables: "https://unsplash.com/photos/zIkV81RVwYY/download?force=true&w=900",
  Accessories: "https://unsplash.com/photos/KSmo3sxapCo/download?force=true&w=900"
};

const baseNavItems = [
  { key: "products", label: "Products", icon: "phone" },
  { key: "requests", label: "Requests", icon: "R" }
];

const CATEGORY_ORDER = ["Smartphones", "Tablets", "Laptops", "Wearables", "Accessories"];
const CATEGORY_PAGE_SIZE = 40;

function readJson(area, key, fallback) {
  try {
    const raw = area.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(area, key, value) {
  area.setItem(key, JSON.stringify(value));
}

function modelFamilyOf(model) {
  return model.split(" ").filter((t) => !/^\d+(gb|tb)$/i.test(t)).join(" ");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDevice(p) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  const fallbackImage = p.image || (images.length ? images[0] : "");
  return {
    ...p,
    modelFamily: p.modelFamily || modelFamilyOf(p.model),
    image: fallbackImage,
    images: images.length ? images : (fallbackImage ? [fallbackImage] : []),
    carrier: p.carrier || "Unlocked",
    screenSize: p.screenSize || "N/A",
    modular: p.modular || "No",
    color: p.color || "N/A",
    kitType: p.kitType || "Full Kit",
    productNotes: p.productNotes || "",
    weeklySpecial: p.weeklySpecial === true
  };
}

const IS_GITHUB_PAGES = typeof window !== "undefined" && window.location.hostname.endsWith("github.io");
const DEMO_VERIFICATION_CODE = "123456";
const DEMO_USERS_KEY = "pcs.demo.users";
const DEMO_SESSIONS_KEY = "pcs.demo.sessions";
const DEMO_REFRESH_TOKENS_KEY = "pcs.demo.refreshTokens";
const DEMO_ACCESS_TTL_MS = 30 * 60 * 1000;
const DEMO_REFRESH_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_WARNING_MS = 5 * 60 * 1000;
const DEMO_WEEKLY_BANNER_KEY = "pcs.demo.weeklySpecialBanner";
const DEMO_WEEKLY_FLAGS_KEY = "pcs.demo.weeklySpecialFlags";
const UI_VIEW_STATE_KEY = "pcs.ui.viewState";
const DEFAULT_DEMO_BUYER_EMAIL = "ekrem.ersayin@pcsww.com";
const DEFAULT_DEMO_BUYER_COMPANY = "PCSWW";
const DEFAULT_DEMO_BUYER_PASSWORD = "TestPassword123!";
const DEMO_REQUESTS_PREFIX = "pcs.demo.requests.";

function passwordMeetsPolicy(password) {
  return /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password || "");
}

function initDemoState() {
  let users = readJson(localStorage, DEMO_USERS_KEY, null);
  if (!users) {
    users = [
      {
        id: 1,
        email: "thomas.torvund@pcsww.com",
        company: "PCSWW",
        role: "admin",
        password: "AdminPassword123!",
        isActive: true,
        createdAt: new Date().toISOString(),
        resetCode: null,
        resetCodeExpiresAt: null
      }
    ];
  }
  if (!users.some((u) => normalizeEmail(u.email) === normalizeEmail(DEFAULT_DEMO_BUYER_EMAIL))) {
    const nextId = users.length ? Math.max(...users.map((u) => Number(u.id || 0))) + 1 : 1;
    users.push({
      id: nextId,
      email: DEFAULT_DEMO_BUYER_EMAIL,
      company: DEFAULT_DEMO_BUYER_COMPANY,
      role: "buyer",
      password: DEFAULT_DEMO_BUYER_PASSWORD,
      isActive: true,
      createdAt: new Date().toISOString(),
      resetCode: null,
      resetCodeExpiresAt: null
    });
  }
  writeJson(localStorage, DEMO_USERS_KEY, users);
  const sessions = readJson(localStorage, DEMO_SESSIONS_KEY, null);
  if (!sessions) {
    writeJson(localStorage, DEMO_SESSIONS_KEY, {});
  }
  const refreshTokens = readJson(localStorage, DEMO_REFRESH_TOKENS_KEY, null);
  if (!refreshTokens) {
    writeJson(localStorage, DEMO_REFRESH_TOKENS_KEY, {});
  }
}

function getDemoUsers() {
  initDemoState();
  return readJson(localStorage, DEMO_USERS_KEY, []);
}

function setDemoUsers(users) {
  writeJson(localStorage, DEMO_USERS_KEY, users);
}

function getDemoSessions() {
  initDemoState();
  return readJson(localStorage, DEMO_SESSIONS_KEY, {});
}

function setDemoSessions(sessions) {
  writeJson(localStorage, DEMO_SESSIONS_KEY, sessions);
}

function getDemoRefreshTokens() {
  initDemoState();
  return readJson(localStorage, DEMO_REFRESH_TOKENS_KEY, {});
}

function setDemoRefreshTokens(tokens) {
  writeJson(localStorage, DEMO_REFRESH_TOKENS_KEY, tokens);
}

function demoRequestsKey(company) {
  return `${DEMO_REQUESTS_PREFIX}${String(company || "anon").trim().toLowerCase()}`;
}

function getDemoRequests(company) {
  return readJson(localStorage, demoRequestsKey(company), []);
}

function setDemoRequests(company, requests) {
  writeJson(localStorage, demoRequestsKey(company), requests);
}

function makeDemoPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    company: user.company,
    role: user.role,
    isActive: !!user.isActive,
    createdAt: user.createdAt
  };
}

function throwApiError(message, code, payload = {}) {
  const err = new Error(message);
  err.code = code;
  err.payload = payload;
  throw err;
}

async function demoApiRequest(path, options = {}) {
  const { token, method = "GET", body = {} } = options;
  const url = new URL(path, "https://demo.local");
  const pathname = url.pathname;
  const users = getDemoUsers();
  const sessions = getDemoSessions();
  const refreshTokens = getDemoRefreshTokens();
  const session = token ? sessions[token] : null;
  const authUserId = session?.userId || null;
  const authUser = authUserId ? users.find((u) => u.id === authUserId) : null;

  const requireAuth = () => {
    if (!authUser || !session || Number(session.expiresAt || 0) < Date.now()) {
      if (token && sessions[token]) {
        delete sessions[token];
        setDemoSessions(sessions);
      }
      throwApiError("Unauthorized", 401);
    }
    return authUser;
  };
  const requireAdmin = () => {
    const user = requireAuth();
    if (user.role !== "admin") throwApiError("Forbidden", 403);
    return user;
  };

  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireAuth();
    return { user: makeDemoPublicUser(user) };
  }

  if (method === "POST" && pathname === "/api/auth/register") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const company = String(body.company || "").trim();
    if (!email || !password || !company) throwApiError("Email, company and password are required.", 400);
    if (!passwordMeetsPolicy(password)) throwApiError("Password must be at least 8 chars and include uppercase, number, and special character.", 400);
    if (users.some((u) => u.email === email)) throwApiError("User already exists.", 409);
    const nextId = users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1;
    users.push({
      id: nextId,
      email,
      company,
      role: "buyer",
      password,
      isActive: false,
      createdAt: new Date().toISOString(),
      resetCode: null,
      resetCodeExpiresAt: null
    });
    setDemoUsers(users);
    return { ok: true };
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = users.find((u) => u.email === email && u.password === password);
    if (!user) throwApiError("Invalid email or password.", 401);
    if (!user.isActive) return { pendingApproval: true, email: user.email, company: user.company };
    const nextToken = crypto.randomUUID();
    const nextRefreshToken = crypto.randomUUID();
    const accessExpiresAt = Date.now() + DEMO_ACCESS_TTL_MS;
    sessions[nextToken] = { userId: user.id, expiresAt: accessExpiresAt };
    refreshTokens[nextRefreshToken] = { userId: user.id, expiresAt: Date.now() + DEMO_REFRESH_TTL_MS };
    setDemoSessions(sessions);
    setDemoRefreshTokens(refreshTokens);
    return { token: nextToken, refreshToken: nextRefreshToken, accessTokenExpiresAt: new Date(accessExpiresAt).toISOString(), user: makeDemoPublicUser(user) };
  }

  if (method === "POST" && pathname === "/api/auth/refresh") {
    const providedRefreshToken = String(body.refreshToken || "").trim();
    if (!providedRefreshToken) throwApiError("Refresh token is required.", 400);
    const entry = refreshTokens[providedRefreshToken];
    if (!entry || Number(entry.expiresAt || 0) < Date.now()) {
      if (entry) {
        delete refreshTokens[providedRefreshToken];
        setDemoRefreshTokens(refreshTokens);
      }
      throwApiError("Invalid or expired refresh token.", 401);
    }
    const user = users.find((u) => u.id === entry.userId && u.isActive);
    if (!user) throwApiError("Unauthorized", 401);
    delete refreshTokens[providedRefreshToken];
    const nextRefreshToken = crypto.randomUUID();
    const nextToken = crypto.randomUUID();
    refreshTokens[nextRefreshToken] = { userId: user.id, expiresAt: Date.now() + DEMO_REFRESH_TTL_MS };
    const accessExpiresAt = Date.now() + DEMO_ACCESS_TTL_MS;
    sessions[nextToken] = { userId: user.id, expiresAt: accessExpiresAt };
    setDemoRefreshTokens(refreshTokens);
    setDemoSessions(sessions);
    return { token: nextToken, refreshToken: nextRefreshToken, accessTokenExpiresAt: new Date(accessExpiresAt).toISOString(), user: makeDemoPublicUser(user) };
  }

  if (method === "POST" && pathname === "/api/auth/logout") {
    if (token && sessions[token]) {
      delete sessions[token];
      setDemoSessions(sessions);
    }
    const providedRefreshToken = String(body.refreshToken || "").trim();
    if (providedRefreshToken && refreshTokens[providedRefreshToken]) {
      delete refreshTokens[providedRefreshToken];
      setDemoRefreshTokens(refreshTokens);
    }
    return { ok: true };
  }

  if (method === "POST" && pathname === "/api/auth/request-password-reset") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) throwApiError("Email is required.", 400);
    const user = users.find((u) => u.email === email);
    if (user) {
      user.resetCode = DEMO_VERIFICATION_CODE;
      user.resetCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      setDemoUsers(users);
    }
    return {
      ok: true,
      message: "If the email exists, a verification code has been sent.",
      demoCode: DEMO_VERIFICATION_CODE
    };
  }

  if (method === "POST" && pathname === "/api/auth/reset-password") {
    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || "").trim();
    const newPassword = String(body.newPassword || "");
    if (!email || !code || !newPassword) throwApiError("Email, verification code and new password are required.", 400);
    if (!/^\d{6}$/.test(code)) throwApiError("Verification code must be 6 digits.", 400);
    if (!passwordMeetsPolicy(newPassword)) throwApiError("Password must be at least 8 chars and include uppercase, number, and special character.", 400);
    const user = users.find((u) => u.email === email);
    if (!user || user.resetCode !== code) throwApiError("Invalid verification code.", 400);
    if (!user.resetCodeExpiresAt || new Date(user.resetCodeExpiresAt).getTime() < Date.now()) {
      throwApiError("Verification code expired. Please request a new code.", 400);
    }
    user.password = newPassword;
    user.resetCode = null;
    user.resetCodeExpiresAt = null;
    setDemoUsers(users);
    return { ok: true };
  }

  if (method === "GET" && pathname === "/api/devices") {
    requireAuth();
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSizeRaw = Number(url.searchParams.get("pageSize") || 0);
    const pageSize = pageSizeRaw > 0 ? Math.min(200, pageSizeRaw) : 0;

    const csv = (key) => (url.searchParams.get(key) || "").split(",").map((x) => x.trim()).filter(Boolean);
    const categories = csv("category");
    const manufacturers = csv("manufacturer");
    const modelFamilies = csv("modelFamily");
    const grades = csv("grade");
    const regions = csv("region");
    const storages = csv("storage");

    const weeklyFlags = readJson(localStorage, DEMO_WEEKLY_FLAGS_KEY, {});
    const all = productsSeed.map((p) => normalizeDevice({
      ...p,
      weeklySpecial: Boolean(weeklyFlags[p.id]) || p.weeklySpecial === true
    }));
    const filtered = all.filter((p) => {
      const text = `${p.manufacturer} ${p.model} ${p.modelFamily} ${p.category}`.toLowerCase();
      if (search && !text.includes(search)) return false;
      if (categories.length && !categories.includes(p.category)) return false;
      if (manufacturers.length && !manufacturers.includes(p.manufacturer)) return false;
      if (modelFamilies.length && !modelFamilies.includes(p.modelFamily)) return false;
      if (grades.length && !grades.includes(p.grade)) return false;
      if (regions.length && !regions.includes(p.region)) return false;
      if (storages.length && !storages.includes(p.storage)) return false;
      return true;
    });

    if (!pageSize) return filtered;
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return { items, total, page, pageSize };
  }

  if (method === "GET" && pathname === "/api/weekly-special-banner") {
    requireAuth();
    return { enabled: readJson(localStorage, DEMO_WEEKLY_BANNER_KEY, false) === true };
  }

  if (method === "PUT" && pathname === "/api/admin/weekly-special-banner") {
    requireAdmin();
    if (typeof body.enabled !== "boolean") throwApiError("enabled must be boolean.", 400);
    writeJson(localStorage, DEMO_WEEKLY_BANNER_KEY, body.enabled);
    return { ok: true, enabled: body.enabled };
  }

  const demoWeeklySpecialMatch = pathname.match(/^\/api\/admin\/devices\/([^/]+)\/weekly-special$/);
  if (method === "PATCH" && demoWeeklySpecialMatch) {
    requireAdmin();
    if (typeof body.weeklySpecial !== "boolean") throwApiError("weeklySpecial must be boolean.", 400);
    const deviceId = decodeURIComponent(demoWeeklySpecialMatch[1]);
    const exists = productsSeed.some((p) => p.id === deviceId);
    if (!exists) throwApiError("Device not found.", 404);
    const weeklyFlags = readJson(localStorage, DEMO_WEEKLY_FLAGS_KEY, {});
    weeklyFlags[deviceId] = body.weeklySpecial;
    writeJson(localStorage, DEMO_WEEKLY_FLAGS_KEY, weeklyFlags);
    return { ok: true, deviceId, weeklySpecial: body.weeklySpecial };
  }

  if (method === "GET" && pathname === "/api/requests") {
    const auth = requireAuth();
    return getDemoRequests(auth.company)
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  if (method === "POST" && pathname === "/api/requests") {
    const auth = requireAuth();
    const linesRaw = Array.isArray(body.lines) ? body.lines : [];
    if (!linesRaw.length) throwApiError("At least one request line is required.", 400);
    const lines = linesRaw.map((line, index) => {
      const model = String(line.model || "").trim();
      const grade = String(line.grade || "").trim();
      const quantity = Number(line.quantity);
      const offerPrice = Number(line.offerPrice);
      if (!model) throwApiError(`Line ${index + 1}: model is required.`, 400);
      if (!grade) throwApiError(`Line ${index + 1}: grade is required.`, 400);
      if (!Number.isInteger(quantity) || quantity < 1) throwApiError(`Line ${index + 1}: quantity must be >= 1.`, 400);
      if (!Number.isFinite(offerPrice) || offerPrice < 0) throwApiError(`Line ${index + 1}: offerPrice must be >= 0.`, 400);
      return {
        productId: String(line.productId || line.deviceId || "").trim(),
        model,
        grade,
        quantity,
        offerPrice: Number(offerPrice.toFixed(2)),
        note: String(line.note || "").trim()
      };
    });
    const requests = getDemoRequests(auth.company);
    const year = new Date().getFullYear();
    const requestNumber = `REQ-${year}-${String(requests.length + 1).padStart(4, "0")}`;
    const total = Number(lines.reduce((sum, line) => sum + (line.quantity * line.offerPrice), 0).toFixed(2));
    const request = {
      id: crypto.randomUUID(),
      requestNumber,
      company: auth.company,
      createdBy: auth.email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "New",
      total,
      currencyCode: "USD",
      netsuiteEstimateId: null,
      netsuiteEstimateNumber: null,
      netsuiteStatus: null,
      netsuiteUpdatedAt: null,
      lines
    };
    setDemoRequests(auth.company, [...requests, request]);
    return request;
  }

  if (method === "POST" && pathname === "/api/integrations/netsuite/estimates/dummy") {
    const auth = requireAuth();
    const requestId = String(body.requestId || "").trim();
    if (!requestId) throwApiError("requestId is required.", 400);
    const requests = getDemoRequests(auth.company);
    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx < 0) throwApiError("Request not found.", 404);
    if (!requests[idx].netsuiteEstimateId) {
      const year = new Date().getFullYear();
      const estimateCount = requests.filter((r) => r.netsuiteEstimateNumber && String(r.netsuiteEstimateNumber).startsWith(`EST-${year}-`)).length + 1;
      requests[idx] = {
        ...requests[idx],
        status: "Estimate Created",
        updatedAt: new Date().toISOString(),
        netsuiteEstimateId: `dummy-est-${crypto.randomUUID().slice(0, 8)}`,
        netsuiteEstimateNumber: `EST-${year}-${String(estimateCount).padStart(4, "0")}`,
        netsuiteStatus: "Estimate Created",
        netsuiteUpdatedAt: new Date().toISOString()
      };
      setDemoRequests(auth.company, requests);
    }
    return { ok: true, request: requests[idx] };
  }

  if (method === "POST" && pathname === "/api/integrations/netsuite/estimates/dummy/status") {
    const auth = requireAuth();
    const requestId = String(body.requestId || "").trim();
    const status = String(body.status || "").trim();
    if (!requestId) throwApiError("requestId is required.", 400);
    if (!["New", "Received", "Estimate Created", "Completed"].includes(status)) {
      throwApiError("status must be one of: New, Received, Estimate Created, Completed.", 400);
    }
    const requests = getDemoRequests(auth.company);
    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx < 0) throwApiError("Request not found.", 404);
    requests[idx] = {
      ...requests[idx],
      status,
      updatedAt: new Date().toISOString(),
      netsuiteStatus: status,
      netsuiteUpdatedAt: new Date().toISOString()
    };
    setDemoRequests(auth.company, requests);
    return { ok: true, request: requests[idx] };
  }

  if (method === "GET" && pathname === "/api/users") {
    requireAdmin();
    return users.map(makeDemoPublicUser).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  if (method === "POST" && pathname === "/api/users") {
    requireAdmin();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const company = String(body.company || "").trim();
    const isActive = body.isActive === true;
    const isAdmin = body.isAdmin === true;
    if (!email || !password || !company) throwApiError("Email, company and password are required.", 400);
    if (!passwordMeetsPolicy(password)) throwApiError("Password must be at least 8 chars and include uppercase, number, and special character.", 400);
    if (users.some((u) => u.email === email)) throwApiError("User already exists.", 409);
    const nextId = users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1;
    users.push({
      id: nextId,
      email,
      company,
      role: isAdmin ? "admin" : "buyer",
      password,
      isActive,
      createdAt: new Date().toISOString(),
      resetCode: null,
      resetCodeExpiresAt: null
    });
    setDemoUsers(users);
    return { ok: true };
  }

  if (method === "POST" && pathname === "/api/admin/catalog/apply-image-mapping") {
    requireAdmin();
    return { ok: true, mappedFamilies: 0, updatedFamilies: 0, updatedDeviceRows: 0, unmatchedFamilies: [] };
  }

  const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (userMatch && method === "PATCH") {
    const actingUser = requireAdmin();
    const targetId = Number(userMatch[1]);
    const target = users.find((u) => u.id === targetId);
    if (!target) throwApiError("User not found.", 404);
    if (typeof body.isActive === "boolean") target.isActive = body.isActive;
    if (typeof body.isAdmin === "boolean") target.role = body.isAdmin ? "admin" : "buyer";
    if (target.id === actingUser.id && target.role !== "admin") throwApiError("You cannot remove your own admin role.", 400);
    setDemoUsers(users);
    return { ok: true };
  }

  if (userMatch && method === "DELETE") {
    const actingUser = requireAdmin();
    const targetId = Number(userMatch[1]);
    if (actingUser.id === targetId) throwApiError("You cannot delete your own admin user.", 400);
    const filtered = users.filter((u) => u.id !== targetId);
    setDemoUsers(filtered);
    return { ok: true };
  }

  throwApiError("Not found", 404);
}

async function apiRequest(path, options = {}) {
  if (IS_GITHUB_PAGES) {
    return demoApiRequest(path, options);
  }
  const { token, method = "GET", body, refreshToken, onAuthUpdate, onAuthFail, skipRefresh = false } = options;
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && !skipRefresh && refreshToken && path !== "/api/auth/refresh" && path !== "/api/auth/login" && path !== "/api/auth/register") {
    try {
      const refreshed = await apiRequest("/api/auth/refresh", {
        method: "POST",
        body: { refreshToken },
        skipRefresh: true
      });
      if (typeof onAuthUpdate === "function") {
        onAuthUpdate(refreshed);
      }
      return apiRequest(path, {
        ...options,
        token: refreshed.token,
        refreshToken: refreshed.refreshToken,
        skipRefresh: true
      });
    } catch (refreshErr) {
      if (typeof onAuthFail === "function") {
        onAuthFail();
      }
      throw refreshErr;
    }
  }
  if (!response.ok) {
    const err = new Error(payload.error || `Request failed (${response.status})`);
    err.code = payload.code;
    err.payload = payload;
    throw err;
  }
  return payload;
}

function iconForCategory(category) {
  const base = { fill: "#147bd1" };
  const screen = { fill: "#eef0f3" };
  if (category === "Smartphones") {
    return <svg viewBox="0 0 64 64"><rect x="16" y="4" width="32" height="56" rx="6" {...base} /><rect x="21" y="12" width="22" height="38" {...screen} /></svg>;
  }
  if (category === "Tablets") {
    return <svg viewBox="0 0 64 64"><rect x="12" y="4" width="40" height="56" rx="6" {...base} /><rect x="18" y="12" width="28" height="38" {...screen} /></svg>;
  }
  if (category === "Laptops") {
    return <svg viewBox="0 0 64 64"><rect x="8" y="13" width="48" height="26" rx="2" {...base} /><rect x="13" y="18" width="38" height="16" {...screen} /><path d="M5 41h54c-1.2 6.2-5.4 10-13.5 10h-27C10.4 51 6.2 47.2 5 41z" {...base} /></svg>;
  }
  if (category === "Wearables") {
    return <svg viewBox="0 0 64 64"><rect x="22" y="2" width="20" height="60" rx="5" {...base} /><rect x="14" y="12" width="36" height="40" rx="8" {...base} /><rect x="19" y="18" width="26" height="28" rx="5" {...screen} /></svg>;
  }
  return <svg className="accessories-icon" viewBox="0 0 64 64"><path d="M8 24a8 8 0 0 1 16 0" fill="none" stroke="#147bd1" strokeWidth="3.4" /><rect x="6.5" y="23.2" width="3.9" height="10.2" rx="1.9" {...base} /><rect x="21.6" y="23.2" width="3.9" height="10.2" rx="1.9" {...base} /><rect x="39.2" y="18" width="13.6" height="15.2" rx="2.1" {...base} /><rect x="6.3" y="38.8" width="51.4" height="13.4" rx="2.4" {...base} /></svg>;
}

function PhoneNavIcon() {
  return <svg className="nav-icon-svg" viewBox="0 0 24 24"><rect x="7.2" y="3" width="9.6" height="18" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="18.1" r="1" fill="currentColor" /></svg>;
}

export default function App() {
  const persistedViewState = readJson(localStorage, UI_VIEW_STATE_KEY, {});
  const logoUrl = `${import.meta.env.BASE_URL}logo.png`;
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("pcs.authToken") || "");
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem("pcs.refreshToken") || "");
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState(() => localStorage.getItem("pcs.accessTokenExpiresAt") || "");
  const [sessionTimeLeftMs, setSessionTimeLeftMs] = useState(null);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [products, setProducts] = useState(productsSeed.map(normalizeDevice));
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [categoryDevices, setCategoryDevices] = useState([]);
  const [categoryTotal, setCategoryTotal] = useState(0);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [route, setRoute] = useState(() => persistedViewState.route || "products");
  const [productsView, setProductsView] = useState(() => persistedViewState.productsView || "home");
  const [selectedCategory, setSelectedCategory] = useState(() => persistedViewState.selectedCategory || "Smartphones");
  const [search, setSearch] = useState(() => persistedViewState.search || "");
  const [filters, setFilters] = useState(() => (persistedViewState.filters && typeof persistedViewState.filters === "object" ? persistedViewState.filters : {}));
  const [weeklySearch, setWeeklySearch] = useState(() => persistedViewState.weeklySearch || "");
  const [weeklyFilters, setWeeklyFilters] = useState(() => (persistedViewState.weeklyFilters && typeof persistedViewState.weeklyFilters === "object" ? persistedViewState.weeklyFilters : {}));
  const [categoryPage, setCategoryPage] = useState(() => {
    const n = Number(persistedViewState.categoryPage || 1);
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
  const [cart, setCart] = useState([]);
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [requestSubmitLoading, setRequestSubmitLoading] = useState(false);
  const [requestStatusUpdateLoading, setRequestStatusUpdateLoading] = useState(false);
  const [requestStatusUpdateError, setRequestStatusUpdateError] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("All");
  const [requestSearch, setRequestSearch] = useState("");
  const [activeRequestId, setActiveRequestId] = useState(null);
  const [activeProduct, setActiveProduct] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [productQty, setProductQty] = useState(1);
  const [productNote, setProductNote] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserCompany, setNewUserCompany] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserIsActive, setNewUserIsActive] = useState(false);
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState("");
  const [adminCatalogLoading, setAdminCatalogLoading] = useState(false);
  const [adminCatalogResult, setAdminCatalogResult] = useState("");
  const [adminCatalogError, setAdminCatalogError] = useState("");
  const [adminImageMapLoading, setAdminImageMapLoading] = useState(false);
  const [expandedFilters, setExpandedFilters] = useState({});
  const [weeklyExpandedFilters, setWeeklyExpandedFilters] = useState({});
  const [weeklyBannerEnabled, setWeeklyBannerEnabled] = useState(false);
  const [weeklyBannerSaving, setWeeklyBannerSaving] = useState(false);
  const [weeklyBannerError, setWeeklyBannerError] = useState("");
  const [weeklyDeviceSavingId, setWeeklyDeviceSavingId] = useState("");
  const [weeklyDeviceError, setWeeklyDeviceError] = useState("");
  const [weeklySpecialSearch, setWeeklySpecialSearch] = useState("");
  const skipInitialCategoryResetRef = useRef(true);

  const cartKey = user ? `pcs.cart.${normalizeEmail(user.email)}` : "";

  const applyAuthTokens = (data) => {
    if (!data?.token || !data?.refreshToken) return;
    localStorage.setItem("pcs.authToken", data.token);
    localStorage.setItem("pcs.refreshToken", data.refreshToken);
    if (data.accessTokenExpiresAt) {
      localStorage.setItem("pcs.accessTokenExpiresAt", data.accessTokenExpiresAt);
      setAccessTokenExpiresAt(data.accessTokenExpiresAt);
    }
    setAuthToken(data.token);
    setRefreshToken(data.refreshToken);
    if (data.user) {
      setUser(data.user);
    }
  };

  const resetViewStateToHome = () => {
    setRoute("products");
    setProductsView("home");
    setSelectedCategory("Smartphones");
    setSearch("");
    setFilters({});
    setWeeklySearch("");
    setWeeklyFilters({});
    setExpandedFilters({});
    setWeeklyExpandedFilters({});
    setCategoryPage(1);
    localStorage.removeItem(UI_VIEW_STATE_KEY);
  };

  const clearAuthState = () => {
    localStorage.removeItem("pcs.authToken");
    localStorage.removeItem("pcs.refreshToken");
    localStorage.removeItem("pcs.accessTokenExpiresAt");
    setAuthToken("");
    setRefreshToken("");
    setAccessTokenExpiresAt("");
    setSessionTimeLeftMs(null);
    setUser(null);
    setCart([]);
    setRequests([]);
    setRequestsError("");
    setRequestStatusUpdateError("");
    setActiveRequestId(null);
    setCartOpen(false);
    localStorage.removeItem(UI_VIEW_STATE_KEY);
  };

  const refreshSessionNow = async () => {
    if (!refreshToken || refreshingSession) return;
    try {
      setRefreshingSession(true);
      const refreshed = await apiRequest("/api/auth/refresh", {
        method: "POST",
        body: { refreshToken },
        skipRefresh: true
      });
      applyAuthTokens(refreshed);
    } catch {
      clearAuthState();
    } finally {
      setRefreshingSession(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function loadMe() {
      if (!authToken && !refreshToken) {
        setAuthLoading(false);
        setUser(null);
        return;
      }
      try {
        const data = await apiRequest("/api/auth/me", {
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState
        });
        if (!ignore) {
          setUser(data.user);
        }
      } catch {
        clearAuthState();
        if (!ignore) {
          setUser(null);
        }
      } finally {
        if (!ignore) {
          setAuthLoading(false);
        }
      }
    }
    loadMe();
    return () => {
      ignore = true;
    };
  }, [authToken, refreshToken]);

  useEffect(() => {
    if (!accessTokenExpiresAt) {
      setSessionTimeLeftMs(null);
      return;
    }
    const update = () => {
      const ms = new Date(accessTokenExpiresAt).getTime() - Date.now();
      setSessionTimeLeftMs(ms);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [accessTokenExpiresAt]);

  useEffect(() => {
    if (!user) return;
    if (sessionTimeLeftMs === null) return;
    if (sessionTimeLeftMs <= 0) {
      clearAuthState();
    }
  }, [sessionTimeLeftMs, user]);

  useEffect(() => {
    let ignore = false;
    async function loadProducts() {
      if (!user || !authToken) {
        setProductsLoading(false);
        return;
      }
      try {
        setProductsLoading(true);
        setProductsError("");
        const payload = await apiRequest("/api/devices", {
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState
        });
        if (!Array.isArray(payload)) {
          throw new Error("Invalid payload");
        }
        if (!ignore) {
          setProducts(payload.map(normalizeDevice));
        }
      } catch {
        if (!ignore) {
          setProductsError("Using local demo data because the backend API is unavailable.");
        }
      } finally {
        if (!ignore) {
          setProductsLoading(false);
        }
      }
    }

    loadProducts();
    return () => {
      ignore = true;
    };
  }, [authToken, refreshToken, user]);

  useEffect(() => {
    if (!cartKey) {
      setCart([]);
      return;
    }
    setCart(readJson(sessionStorage, cartKey, []));
  }, [cartKey]);

  useEffect(() => {
    let ignore = false;
    async function loadRequests() {
      if (!user || !authToken) {
        if (!ignore) {
          setRequests([]);
          setRequestsLoading(false);
        }
        return;
      }
      try {
        if (!ignore) {
          setRequestsLoading(true);
          setRequestsError("");
        }
        const payload = await apiRequest("/api/requests", {
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState
        });
        if (!ignore) {
          setRequests(Array.isArray(payload) ? payload : []);
        }
      } catch (error) {
        if (!ignore) {
          setRequests([]);
          setRequestsError(error.message || "Failed to load requests.");
        }
      } finally {
        if (!ignore) {
          setRequestsLoading(false);
        }
      }
    }
    loadRequests();
    return () => {
      ignore = true;
    };
  }, [authToken, refreshToken, user]);

  useEffect(() => {
    let ignore = false;
    async function loadWeeklyBannerSetting() {
      if (!user || !authToken) return;
      try {
        const payload = await apiRequest("/api/weekly-special-banner", {
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState
        });
        if (!ignore) {
          setWeeklyBannerEnabled(payload.enabled === true);
          setWeeklyBannerError("");
        }
      } catch (error) {
        if (!ignore) {
          setWeeklyBannerEnabled(false);
          setWeeklyBannerError(error.message || "Failed to load weekly special banner setting.");
        }
      }
    }
    loadWeeklyBannerSetting();
    return () => {
      ignore = true;
    };
  }, [authToken, refreshToken, user]);

  useEffect(() => {
    if (!products.length) return;
    const categorySet = new Set(products.map((p) => p.category));
    if (!categorySet.has(selectedCategory)) {
      setSelectedCategory(products[0].category);
    }
  }, [products, selectedCategory]);

  useEffect(() => {
    if (!activeRequestId) return;
    if (!requests.some((r) => r.id === activeRequestId)) {
      setActiveRequestId(null);
    }
  }, [requests, activeRequestId]);

  useEffect(() => {
    if (skipInitialCategoryResetRef.current) {
      skipInitialCategoryResetRef.current = false;
      return;
    }
    if (productsView === "category") {
      setCategoryPage(1);
    }
  }, [selectedCategory, search, filters, productsView]);

  useEffect(() => {
    if (!user) return;
    const allowedRoutes = user.role === "admin"
      ? new Set(["products", "requests", "users"])
      : new Set(["products", "requests"]);
    if (!allowedRoutes.has(route)) {
      setRoute("products");
      setProductsView("home");
    }
  }, [user, route]);

  useEffect(() => {
    if (!user) return;
    writeJson(localStorage, UI_VIEW_STATE_KEY, {
      route,
      productsView,
      selectedCategory,
      search,
      filters,
      weeklySearch,
      weeklyFilters,
      categoryPage
    });
  }, [user, route, productsView, selectedCategory, search, filters, weeklySearch, weeklyFilters, categoryPage]);

  useEffect(() => {
    let ignore = false;
    async function loadCategoryPage() {
      if (!authToken || productsView !== "category") return;
      try {
        setCategoryLoading(true);
        const qs = new URLSearchParams();
        qs.set("category", selectedCategory);
        qs.set("page", String(categoryPage));
        qs.set("pageSize", String(CATEGORY_PAGE_SIZE));
        if (search.trim()) qs.set("search", search.trim());
        if (filters.manufacturer?.length) qs.set("manufacturer", filters.manufacturer.join(","));
        if (filters.modelFamily?.length) qs.set("modelFamily", filters.modelFamily.join(","));
        if (filters.grade?.length) qs.set("grade", filters.grade.join(","));
        if (filters.region?.length) qs.set("region", filters.region.join(","));
        if (filters.storage?.length) qs.set("storage", filters.storage.join(","));
        const payload = await apiRequest(`/api/devices?${qs.toString()}`, {
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState
        });
        if (!payload || !Array.isArray(payload.items)) {
          throw new Error("Invalid paged payload");
        }
        if (!ignore) {
          setCategoryDevices(payload.items.map(normalizeDevice));
          setCategoryTotal(Number(payload.total || 0));
        }
      } catch (error) {
        if (!ignore) {
          setProductsError(error.message || "Failed loading category page.");
      setCategoryDevices([]);
          setCategoryTotal(0);
        }
      } finally {
        if (!ignore) {
          setCategoryLoading(false);
        }
      }
    }
    loadCategoryPage();
    return () => {
      ignore = true;
    };
  }, [authToken, refreshToken, productsView, selectedCategory, search, filters, categoryPage]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [activeProduct?.id]);

  useEffect(() => {
    if (productsView !== "home") return;

    const rows = Array.from(document.querySelectorAll(".home-products-grid"));
    const cleanups = [];

    rows.forEach((row) => {
      let isDragging = false;
      let didDrag = false;
      let startX = 0;
      let startScrollLeft = 0;

      const onMouseDown = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest("button, input, a, textarea, label")) return;
        isDragging = true;
        didDrag = false;
        startX = e.clientX;
        startScrollLeft = row.scrollLeft;
        row.classList.add("is-dragging");
      };

      const onMouseMove = (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - startX;
        if (Math.abs(deltaX) > 6) {
          didDrag = true;
        }
        row.scrollLeft = startScrollLeft - deltaX;
        if (didDrag) e.preventDefault();
      };

      const stopDragging = () => {
        if (!isDragging) return;
        isDragging = false;
        row.classList.remove("is-dragging");
      };

      const onClickCapture = (e) => {
        if (!didDrag) return;
        e.preventDefault();
        e.stopPropagation();
        didDrag = false;
      };

      row.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", stopDragging);
      row.addEventListener("click", onClickCapture, true);

      cleanups.push(() => {
        row.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", stopDragging);
        row.removeEventListener("click", onClickCapture, true);
      });
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [productsView, productsLoading, products]);

  useEffect(() => {
    let ignore = false;
    async function loadUsers() {
      if (!user || user.role !== "admin" || route !== "users") return;
      try {
        setUsersLoading(true);
        setUsersError("");
        const payload = await apiRequest("/api/users", {
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState
        });
        if (!ignore) {
          setUsers(payload);
        }
      } catch (error) {
        if (!ignore) {
          setUsersError(error.message);
        }
      } finally {
        if (!ignore) {
          setUsersLoading(false);
        }
      }
    }
    loadUsers();
    return () => {
      ignore = true;
    };
  }, [authToken, refreshToken, route, user]);

  const refreshUsers = async () => {
    if (!user || user.role !== "admin") return;
    setUsersLoading(true);
    setUsersError("");
    try {
      const payload = await apiRequest("/api/users", {
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      setUsers(payload);
    } catch (error) {
      setUsersError(error.message);
    } finally {
      setUsersLoading(false);
    }
  };

  const updateCart = (next) => {
    setCart(next);
    if (cartKey) {
      writeJson(sessionStorage, cartKey, next);
    }
  };

  const refreshRequests = async () => {
    if (!user || !authToken) return;
    try {
      setRequestsLoading(true);
      setRequestsError("");
      const payload = await apiRequest("/api/requests", {
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      setRequests(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setRequestsError(error.message || "Failed to load requests.");
    } finally {
      setRequestsLoading(false);
    }
  };

  const imageFor = (p) => p.image || p.images?.[0] || categoryImagePlaceholders[p.category] || "";

  const addToCart = (p, qty, note) => {
    const existing = cart.find((i) => i.productId === p.id && i.note === note);
    let next = [...cart];
    if (existing) {
      next = next.map((i) => (i.id === existing.id ? { ...i, quantity: Math.min(9999, i.quantity + qty) } : i));
    } else {
      next.push({ id: crypto.randomUUID(), productId: p.id, model: p.model, grade: p.grade, quantity: qty, offerPrice: p.price, note });
    }
    updateCart(next);
  };

  const openCategory = (c) => {
    setSelectedCategory(c);
    setProductsView("category");
    setSearch("");
    setFilters({});
    setExpandedFilters({});
    setCategoryPage(1);
  };

  const submitRequest = async () => {
    if (!cart.length || !user) return;
    const valid = cart.every((i) => i.offerPrice !== "" && Number(i.quantity) >= 1 && Number(i.offerPrice) >= 0);
    if (!valid) return;
    const lines = cart.map((x) => ({
      productId: x.productId,
      model: x.model,
      grade: x.grade,
      quantity: Number(x.quantity),
      offerPrice: Number(x.offerPrice),
      note: x.note || ""
    }));

    try {
      setRequestSubmitLoading(true);
      setRequestsError("");
      const created = await apiRequest("/api/requests", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { lines }
      });
      await apiRequest("/api/integrations/netsuite/estimates/dummy", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { requestId: created.id }
      });
      await refreshRequests();
      updateCart([]);
      setCartOpen(false);
      setRoute("requests");
      if (created?.id) {
        setActiveRequestId(created.id);
      }
    } catch (error) {
      setRequestsError(error.message || "Failed to submit request.");
    } finally {
      setRequestSubmitLoading(false);
    }
  };

  const setDummyRequestStatusAsAdmin = async (requestId, status) => {
    if (!user || user.role !== "admin") return;
    try {
      setRequestStatusUpdateLoading(true);
      setRequestStatusUpdateError("");
      await apiRequest("/api/integrations/netsuite/estimates/dummy/status", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { requestId, status }
      });
      await refreshRequests();
      setActiveRequestId(requestId);
    } catch (error) {
      setRequestStatusUpdateError(error.message || "Failed to update status.");
    } finally {
      setRequestStatusUpdateLoading(false);
    }
  };

  const handleLogin = async (email, password) => {
    const data = await apiRequest("/api/auth/login", { method: "POST", body: { email, password } });
    if (data.pendingApproval) {
      return { pendingApproval: true, email: data.email };
    }
    applyAuthTokens(data);
    resetViewStateToHome();
    return { pendingApproval: false };
  };

  const handleRegister = async (email, password, company) => {
    await apiRequest("/api/auth/register", { method: "POST", body: { email, password, company } });
  };

  const handleRequestPasswordReset = async (email) => {
    return apiRequest("/api/auth/request-password-reset", { method: "POST", body: { email } });
  };

  const handleResetPassword = async (email, code, newPassword) => {
    return apiRequest("/api/auth/reset-password", { method: "POST", body: { email, code, newPassword } });
  };

  const logout = () => {
    apiRequest("/api/auth/logout", {
      method: "POST",
      token: authToken,
      body: { refreshToken },
      skipRefresh: true
    }).catch(() => {});
    clearAuthState();
    resetViewStateToHome();
  };

  const createUserAsAdmin = async (e) => {
    e.preventDefault();
    if (!newUserEmail || !newUserCompany || !newUserPassword) return;
    try {
      setUserActionLoading(true);
      setUsersError("");
      await apiRequest("/api/users", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: {
          email: newUserEmail.trim(),
          company: newUserCompany.trim(),
          password: newUserPassword,
          isActive: newUserIsActive,
          isAdmin: newUserIsAdmin
        }
      });
      setNewUserEmail("");
      setNewUserCompany("");
      setNewUserPassword("");
      setNewUserIsActive(false);
      setNewUserIsAdmin(false);
      await refreshUsers();
    } catch (error) {
      setUsersError(error.message);
    } finally {
      setUserActionLoading(false);
    }
  };

  const toggleUserField = async (targetUser, field, value) => {
    try {
      setUserActionLoading(true);
      setUsersError("");
      await apiRequest(`/api/users/${targetUser.id}`, {
        method: "PATCH",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { [field]: value }
      });
      await refreshUsers();
    } catch (error) {
      setUsersError(error.message);
    } finally {
      setUserActionLoading(false);
    }
  };

  const deleteUser = async (targetUser) => {
    try {
      setUserActionLoading(true);
      setUsersError("");
      await apiRequest(`/api/users/${targetUser.id}`, {
        method: "DELETE",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      await refreshUsers();
    } catch (error) {
      setUsersError(error.message);
    } finally {
      setUserActionLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="skeleton skeleton-line" style={{ width: "52%", height: 28, marginBottom: 12 }} />
          <div className="skeleton skeleton-line" style={{ width: "70%", marginBottom: 18 }} />
          <div className="skeleton skeleton-input" />
          <div className="skeleton skeleton-input" />
          <div className="skeleton skeleton-button" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} onRegister={handleRegister} onRequestPasswordReset={handleRequestPasswordReset} onResetPassword={handleResetPassword} />;
  }

  const navItems = user.role === "admin"
    ? [...baseNavItems, { key: "users", label: "Users", icon: "U" }]
    : baseNavItems;

  const categories = [...new Set(products.map((p) => p.category))].sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a);
    const bIndex = CATEGORY_ORDER.indexOf(b);
    const aOrder = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const bOrder = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b);
  });
  const weeklySpecialDevices = products.filter((p) => p.weeklySpecial === true);
  const weeklySpecialAdminDevices = products
    .filter((p) => `${p.manufacturer} ${p.model}`.toLowerCase().includes(weeklySpecialSearch.toLowerCase()))
    .slice(0, 120);
  const source = products.filter((p) => p.category === selectedCategory);
  const fields = [{ key: "manufacturer", title: "Manufacturers" }, { key: "modelFamily", title: "Models" }, { key: "grade", title: "Grade" }, { key: "region", title: "Region / Location" }, { key: "storage", title: "Storage Capacity" }];
  const valueForField = (device, fieldKey) => (fieldKey === "modelFamily" ? (device.modelFamily || modelFamilyOf(device.model)) : device[fieldKey]);
  const matchesOtherFilters = (device, excludedField, activeFilters) => {
    for (const field of fields) {
      if (field.key === excludedField) continue;
      const selected = activeFilters[field.key] || [];
      if (!selected.length) continue;
      const value = valueForField(device, field.key);
      if (!selected.includes(value)) return false;
    }
    return true;
  };

  const triggerBoomiSync = async () => {
    try {
      setSyncLoading(true);
      setSyncError("");
      setSyncResult(null);
      const payload = await apiRequest("/api/integrations/boomi/inventory/sync", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      setSyncResult(payload);
    } catch (error) {
      setSyncError(error.message || "Sync failed.");
    } finally {
      setSyncLoading(false);
    }
  };

  const clearCatalogForAdmin = async () => {
    try {
      setAdminCatalogLoading(true);
      setAdminCatalogError("");
      setAdminCatalogResult("");
      const payload = await apiRequest("/api/admin/catalog/clear", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      setAdminCatalogResult(`Catalog cleared. Removed ${Number(payload.removedDevices || 0)} devices and ${Number(payload.removedRawRows || 0)} raw sync rows.`);
    } catch (error) {
      setAdminCatalogError(error.message || "Failed to clear catalog.");
    } finally {
      setAdminCatalogLoading(false);
    }
  };

  const seedTestDevicesForAdmin = async () => {
    try {
      setAdminCatalogLoading(true);
      setAdminCatalogError("");
      setAdminCatalogResult("");
      const payload = await apiRequest("/api/admin/catalog/seed-test", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { countPerCategory: 500 }
      });
      setAdminCatalogResult(`Seed complete. Added ${Number(payload.countPerCategory || 0)} test devices per category (${Number(payload.categoriesSeeded || 0)} categories).`);
    } catch (error) {
      setAdminCatalogError(error.message || "Failed to seed test devices.");
    } finally {
      setAdminCatalogLoading(false);
    }
  };

  const seedRealDevicesForAdmin = async () => {
    try {
      setAdminCatalogLoading(true);
      setAdminCatalogError("");
      setAdminCatalogResult("");
      const payload = await apiRequest("/api/admin/catalog/seed-real", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { countPerCategory: 100 }
      });
      setAdminCatalogResult(`Realistic seed complete. Added ${Number(payload.countPerCategory || 0)} devices per category (${Number(payload.categoriesSeeded || 0)} categories).`);
    } catch (error) {
      setAdminCatalogError(error.message || "Failed to seed realistic devices.");
    } finally {
      setAdminCatalogLoading(false);
    }
  };
  const applyImageMappingForAdmin = async () => {
    try {
      setAdminImageMapLoading(true);
      setAdminCatalogError("");
      setAdminCatalogResult("");
      const payload = await apiRequest("/api/admin/catalog/apply-image-mapping", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      setAdminCatalogResult(
        `Image mapping applied. Updated ${Number(payload.updatedDeviceRows || 0)} devices across ${Number(payload.updatedFamilies || 0)} families.`
      );
      const refreshed = await apiRequest("/api/devices", {
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      if (Array.isArray(refreshed)) {
        setProducts(refreshed.map(normalizeDevice));
      }
    } catch (error) {
      setAdminCatalogError(error.message || "Failed to apply image mapping.");
    } finally {
      setAdminImageMapLoading(false);
    }
  };
  const updateWeeklyBannerForAdmin = async (enabled) => {
    try {
      setWeeklyBannerSaving(true);
      setWeeklyBannerError("");
      const payload = await apiRequest("/api/admin/weekly-special-banner", {
        method: "PUT",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { enabled }
      });
      setWeeklyBannerEnabled(payload.enabled === true);
    } catch (error) {
      setWeeklyBannerError(error.message || "Failed updating weekly special banner.");
    } finally {
      setWeeklyBannerSaving(false);
    }
  };

  const setDeviceWeeklySpecialForAdmin = async (device, weeklySpecial) => {
    try {
      setWeeklyDeviceSavingId(device.id);
      setWeeklyDeviceError("");
      await apiRequest(`/api/admin/devices/${encodeURIComponent(device.id)}/weekly-special`, {
        method: "PATCH",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { weeklySpecial }
      });
      setProducts((prev) => prev.map((p) => (p.id === device.id ? { ...p, weeklySpecial } : p)));
      setCategoryDevices((prev) => prev.map((p) => (p.id === device.id ? { ...p, weeklySpecial } : p)));
    } catch (error) {
      setWeeklyDeviceError(error.message || "Failed updating weekly special device flag.");
    } finally {
      setWeeklyDeviceSavingId("");
    }
  };
  const buildFilterOptions = (devices, activeFilters) => {
    const optionsByField = {};
    for (const field of fields) {
      const selected = activeFilters[field.key] || [];
      const allValues = [...new Set(devices.map((p) => valueForField(p, field.key)))].sort((a, b) => String(a).localeCompare(String(b)));
      const enabledValues = new Set(
        devices
          .filter((p) => matchesOtherFilters(p, field.key, activeFilters))
          .map((p) => valueForField(p, field.key))
      );
      optionsByField[field.key] = allValues
        .map((value) => {
          const isSelected = selected.includes(value);
          const isEnabled = enabledValues.has(value) || isSelected;
          return { value, isEnabled, isSelected };
        })
        .sort((a, b) => {
          if (a.isEnabled !== b.isEnabled) return a.isEnabled ? -1 : 1;
          return String(a.value).localeCompare(String(b.value));
        });
    }
    return optionsByField;
  };
  const filterOptions = buildFilterOptions(source, filters);
  const weeklySource = weeklySpecialDevices;
  const weeklyFilterOptions = buildFilterOptions(weeklySource, weeklyFilters);
  const weeklyFilteredDevices = weeklySource.filter((p) => {
    const text = `${p.manufacturer} ${p.model} ${p.modelFamily} ${p.category}`.toLowerCase();
    if (weeklySearch && !text.includes(weeklySearch.toLowerCase())) return false;
    for (const field of fields) {
      const selected = weeklyFilters[field.key] || [];
      if (!selected.length) continue;
      const value = valueForField(p, field.key);
      if (!selected.includes(value)) return false;
    }
    return true;
  });
  const totalCategoryPages = Math.max(1, Math.ceil(categoryTotal / CATEGORY_PAGE_SIZE));
  const safeCategoryPage = Math.min(categoryPage, totalCategoryPages);
  const categoryStartIndex = (safeCategoryPage - 1) * CATEGORY_PAGE_SIZE;

  const filteredRequests = requests
    .filter((r) => requestStatusFilter === "All" || r.status === requestStatusFilter)
    .filter((r) => String(r.requestNumber || "").toLowerCase().includes(requestSearch.toLowerCase()));
  const activeRequest = requests.find((r) => r.id === activeRequestId) || null;
  const modalImages = activeProduct ? (activeProduct.images?.length ? activeProduct.images : [imageFor(activeProduct)]) : [];
  const canCarousel = modalImages.length > 1;
  const activeModalImage = modalImages[activeImageIndex] || modalImages[0] || "";
  const modalProductUnavailable = activeProduct ? activeProduct.available < 1 : false;
  const showSessionWarning = Boolean(user && sessionTimeLeftMs !== null && sessionTimeLeftMs > 0 && sessionTimeLeftMs <= SESSION_WARNING_MS);
  const sessionSecondsLeft = showSessionWarning ? Math.max(0, Math.ceil(sessionTimeLeftMs / 1000)) : 0;
  const sessionCountdown = showSessionWarning
    ? `${Math.floor(sessionSecondsLeft / 60)}:${String(sessionSecondsLeft % 60).padStart(2, "0")}`
    : "0:00";

  return (
    <div className="app-shell">
      <aside className="left-rail">
        <div className="rail-logo"><img className="brand-logo-img" src={logoUrl} alt="Company logo" /></div>
        <nav className="rail-nav">
          {navItems.map((n) => (
            <button key={n.key} className={n.key === route ? "active" : ""} onClick={() => { setRoute(n.key); if (n.key === "products") { setProductsView("home"); setSearch(""); setFilters({}); } }}>
              <span className="nav-icon-wrap">{n.icon === "phone" ? <PhoneNavIcon /> : <span className="nav-icon">{n.icon}</span>}</span>
              <span className="nav-label">{n.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div className="brand-wrap"><span className="dot" /><strong>Gadget Crazy</strong></div>
          <div className="top-actions"><span className="muted">{user.email}</span><span className="user-chip">{user.company}</span><button className="ghost-btn" onClick={logout}>Logout</button></div>
        </header>
        <main className="view">
          {route === "products" && productsError && (
            <section className="panel" style={{ marginBottom: 10 }}>
              <p className="small" style={{ margin: 0 }}>{productsError}</p>
            </section>
          )}

          {route === "products" && productsView === "home" && (
            <>
              <div className="products-home-top">
                <h1 className="page-title" style={{ margin: 0 }}>Products</h1>
                <button className="request-btn" onClick={() => setCartOpen(true)}>Requested items ({cart.length})</button>
              </div>
              <section className="panel home-hero">
                <div><h2 style={{ margin: 0, fontSize: "2rem", fontWeight: 400 }}>Categories</h2><p className="muted" style={{ marginTop: 6 }}>Browse device classes and open a filtered catalog view.</p></div>
                {productsLoading ? (
                  <div className="category-strip">{Array.from({ length: 5 }).map((_, idx) => <CategoryTileSkeleton key={`cat-sk-${idx}`} />)}</div>
                ) : (
                  <div className="category-strip">{categories.map((c) => <button key={c} className="category-btn" onClick={() => openCategory(c)}><span className="cat-icon">{iconForCategory(c)}</span><span className="cat-label">{c}</span></button>)}</div>
                )}
              </section>
              {!productsLoading && weeklyBannerEnabled && weeklySpecialDevices.length > 0 ? (
                <section className="panel weekly-special-banner">
                  <div className="category-header">
                    <div>
                      <h3 style={{ margin: 0, fontSize: "2rem", fontWeight: 400 }}>Weekly Special</h3>
                      <p className="muted" style={{ margin: "6px 0 0" }}>Featured devices flagged by admin for this week.</p>
                    </div>
                    <button
                      className="ghost-btn"
                      onClick={() => {
                        setProductsView("weekly");
                      }}
                    >
                      Browse specials
                    </button>
                  </div>
                  <div className="products-grid home-products-grid">
                    {weeklySpecialDevices.slice(0, 8).map((p) => (
                      <ProductCard key={`weekly-${p.id}`} p={p} image={imageFor(p)} onOpen={setActiveProduct} onAdd={addToCart} />
                    ))}
                  </div>
                </section>
              ) : null}
              {(productsLoading ? CATEGORY_ORDER : categories).map((cat) => (
                <section key={cat} className="panel">
                  <div className="category-header"><h3 style={{ margin: 0, fontSize: "2rem", fontWeight: 400 }}>{cat}</h3><button className="ghost-btn" onClick={() => openCategory(cat)}>View all</button></div>
                  {productsLoading ? (
                    <div className="products-grid home-products-grid">{Array.from({ length: 8 }).map((_, idx) => <ProductCardSkeleton key={`${cat}-card-sk-${idx}`} />)}</div>
                  ) : (
                    <div className="products-grid home-products-grid">{products.filter((p) => p.category === cat).slice(0, 8).map((p) => <ProductCard key={p.id} p={p} image={imageFor(p)} onOpen={setActiveProduct} onAdd={addToCart} />)}</div>
                  )}
                </section>
              ))}
            </>
          )}

          {route === "products" && productsView === "category" && (
            <>
              <div className="products-shell">
                <aside className="filters-panel">
                  <div className="filter-head"><h3 style={{ margin: 0, fontWeight: 500 }}>Filters</h3><button className="pill-clear" onClick={() => { setFilters({}); setSearch(""); }}>Clear</button></div>
                  {categoryLoading ? (
                    <FilterSkeleton />
                  ) : fields.map((f) => {
                    const options = filterOptions[f.key] || [];
                    const isExpanded = expandedFilters[f.key] === true;
                    const visibleOptions = isExpanded ? options : options.slice(0, 10);
                    return (
                      <div key={f.key} className="filter-row">
                        <h4>{f.title}</h4>
                        {visibleOptions.map((option) => (
                          <label key={option.value} className={`checkbox-item${option.isEnabled ? "" : " disabled"}`}>
                            <input
                              type="checkbox"
                              disabled={!option.isEnabled}
                              checked={(filters[f.key] || []).includes(option.value)}
                              onChange={(e) => {
                                const set = new Set(filters[f.key] || []);
                                if (e.target.checked) set.add(option.value); else set.delete(option.value);
                                setFilters({ ...filters, [f.key]: [...set] });
                              }}
                            />
                            <span>{option.value}</span>
                          </label>
                        ))}
                        {options.length > 10 ? (
                          <button
                            type="button"
                            className="filter-show-more-btn"
                            onClick={() => setExpandedFilters((prev) => ({ ...prev, [f.key]: !isExpanded }))}
                          >
                            {isExpanded ? "Show less" : `Show more (${options.length - 10})`}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </aside>
                <section className="products-main">
                  <div className="products-top">
                    <div><p className="small"><span className="crumb-link" onClick={() => setProductsView("home")}>Home</span> &gt; {selectedCategory}</p><h2 style={{ margin: "4px 0 0", fontSize: "2.6rem", fontWeight: 400 }}>{selectedCategory}</h2></div>
                    <div className="right-actions"><input className="catalog-search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by model" /><button className="request-btn" onClick={() => setCartOpen(true)}>Requested items ({cart.length})</button></div>
                  </div>
                  <div className="small" style={{ marginBottom: 8 }}>
                    Showing {categoryTotal ? categoryStartIndex + 1 : 0}-{Math.min(categoryTotal, categoryStartIndex + CATEGORY_PAGE_SIZE)} of {categoryTotal} devices
                  </div>
                  {categoryLoading ? (
                    <div className="products-grid">{Array.from({ length: 8 }).map((_, idx) => <ProductCardSkeleton key={`page-card-sk-${idx}`} />)}</div>
                  ) : (
                    <>
                      <div className="products-grid">{categoryDevices.map((p) => <ProductCard key={p.id} p={p} image={imageFor(p)} onOpen={setActiveProduct} onAdd={addToCart} />)}</div>
                      {totalCategoryPages > 1 ? (
                        <div className="pagination-bar">
                          <button className="ghost-btn pagination-btn" disabled={safeCategoryPage <= 1} onClick={() => setCategoryPage((p) => Math.max(1, p - 1))}>Prev</button>
                          <span className="small pagination-status">Page {safeCategoryPage} / {totalCategoryPages}</span>
                          <button className="ghost-btn pagination-btn" disabled={safeCategoryPage >= totalCategoryPages} onClick={() => setCategoryPage((p) => Math.min(totalCategoryPages, p + 1))}>Next</button>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>
              </div>
            </>
          )}

          {route === "products" && productsView === "weekly" && (
            <>
              <div className="products-shell">
                <aside className="filters-panel">
                  <div className="filter-head">
                    <h3 style={{ margin: 0, fontWeight: 500 }}>Filters</h3>
                    <button className="pill-clear" onClick={() => { setWeeklyFilters({}); setWeeklySearch(""); }}>Clear</button>
                  </div>
                  {fields.map((f) => {
                    const options = weeklyFilterOptions[f.key] || [];
                    const isExpanded = weeklyExpandedFilters[f.key] === true;
                    const visibleOptions = isExpanded ? options : options.slice(0, 10);
                    return (
                      <div key={`weekly-${f.key}`} className="filter-row">
                        <h4>{f.title}</h4>
                        {visibleOptions.map((option) => (
                          <label key={`weekly-${f.key}-${option.value}`} className={`checkbox-item${option.isEnabled ? "" : " disabled"}`}>
                            <input
                              type="checkbox"
                              disabled={!option.isEnabled}
                              checked={(weeklyFilters[f.key] || []).includes(option.value)}
                              onChange={(e) => {
                                const set = new Set(weeklyFilters[f.key] || []);
                                if (e.target.checked) set.add(option.value); else set.delete(option.value);
                                setWeeklyFilters({ ...weeklyFilters, [f.key]: [...set] });
                              }}
                            />
                            <span>{option.value}</span>
                          </label>
                        ))}
                        {options.length > 10 ? (
                          <button
                            type="button"
                            className="filter-show-more-btn"
                            onClick={() => setWeeklyExpandedFilters((prev) => ({ ...prev, [f.key]: !isExpanded }))}
                          >
                            {isExpanded ? "Show less" : `Show more (${options.length - 10})`}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </aside>
                <section className="products-main">
                  <div className="products-top">
                    <div>
                      <p className="small">
                        <span className="crumb-link" onClick={() => setProductsView("home")}>Home</span> &gt; Weekly Special
                      </p>
                      <h2 style={{ margin: "4px 0 0", fontSize: "2.6rem", fontWeight: 400 }}>Weekly Special</h2>
                    </div>
                    <div className="right-actions">
                      <input className="catalog-search-input" value={weeklySearch} onChange={(e) => setWeeklySearch(e.target.value)} placeholder="Search by model" />
                      <button className="request-btn" onClick={() => setCartOpen(true)}>Requested items ({cart.length})</button>
                    </div>
                  </div>
                  <div className="small" style={{ marginBottom: 8 }}>
                    Showing {weeklyFilteredDevices.length} weekly special devices
                  </div>
                  {weeklyFilteredDevices.length ? (
                    <div className="products-grid">
                      {weeklyFilteredDevices.map((p) => (
                        <ProductCard key={`weekly-page-${p.id}`} p={p} image={imageFor(p)} onOpen={setActiveProduct} onAdd={addToCart} />
                      ))}
                    </div>
                  ) : (
                    <p className="small" style={{ marginTop: 8 }}>No weekly special devices match your filters.</p>
                  )}
                </section>
              </div>
            </>
          )}

          {route === "requests" && (
            <>
              <section className="panel">
                <h2 className="page-title" style={{ fontSize: "2rem", marginBottom: 10 }}>Requests</h2>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  {["All", "New", "Received", "Estimate Created", "Completed"].map((s) => <button key={s} className="ghost-btn" style={requestStatusFilter === s ? { borderColor: "#256fd6", color: "#256fd6" } : {}} onClick={() => setRequestStatusFilter(s)}>{s}</button>)}
                  <input className="request-search-input" placeholder="Search request #" value={requestSearch} onChange={(e) => setRequestSearch(e.target.value)} />
                  <button className="ghost-btn" onClick={refreshRequests} disabled={requestsLoading}>Refresh</button>
                </div>
                {requestsError ? <p className="small" style={{ color: "#b91c1c", marginTop: 0 }}>{requestsError}</p> : null}
                <table className="table"><thead><tr><th>Request #</th><th>Status</th><th>Created</th><th>Total</th><th /></tr></thead><tbody>{requestsLoading ? <tr><td colSpan={5} className="small">Loading requests...</td></tr> : filteredRequests.length ? filteredRequests.map((r) => <tr key={r.id}><td>{r.requestNumber}</td><td>{r.status}</td><td>{new Date(r.createdAt).toLocaleString()}</td><td>${Number(r.total || 0).toFixed(2)}</td><td><button className="ghost-btn" onClick={() => setActiveRequestId(r.id)}>View</button></td></tr>) : <tr><td colSpan={5} className="small">No requests found.</td></tr>}</tbody></table>
              </section>
              <section className="panel">
                <h3 style={{ marginTop: 0 }}>Request details</h3>
                {activeRequest ? (
                  <>
                    <p className="small" style={{ marginTop: 0 }}>
                      Dummy estimate: {activeRequest.netsuiteEstimateNumber || "Not created yet"}
                      {activeRequest.netsuiteStatus ? ` | Sync status: ${activeRequest.netsuiteStatus}` : ""}
                    </p>
                    {user?.role === "admin" ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        {["New", "Received", "Estimate Created", "Completed"].map((s) => (
                          <button
                            key={`req-status-${s}`}
                            className="ghost-btn"
                            style={activeRequest.status === s ? { borderColor: "#256fd6", color: "#256fd6" } : {}}
                            disabled={requestStatusUpdateLoading}
                            onClick={() => setDummyRequestStatusAsAdmin(activeRequest.id, s)}
                          >
                            {requestStatusUpdateLoading && activeRequest.status !== s ? "Updating..." : `Set ${s}`}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {requestStatusUpdateError ? <p className="small" style={{ color: "#b91c1c", marginTop: 0 }}>{requestStatusUpdateError}</p> : null}
                    <table className="table"><thead><tr><th>Product</th><th>Grade</th><th>Qty</th><th>Offer</th><th>Total</th></tr></thead><tbody>{activeRequest.lines.map((l, i) => <tr key={`${l.productId}-${i}`}><td>{l.model}</td><td>{l.grade}</td><td>{l.quantity}</td><td>${Number(l.offerPrice || 0).toFixed(2)}</td><td>${(Number(l.quantity || 0) * Number(l.offerPrice || 0)).toFixed(2)}</td></tr>)}</tbody></table>
                  </>
                ) : <p className="small">Choose a request above.</p>}
              </section>
            </>
          )}

          {route === "users" && user.role === "admin" && (
            <section className="panel">
              <h2 className="page-title" style={{ fontSize: "2rem", marginBottom: 10 }}>User Management</h2>
              {usersError ? <p className="small" style={{ color: "#b91c1c" }}>{usersError}</p> : null}
              <div className="admin-user-form" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: "0 0 8px" }}>Inventory Sync</h3>
                <p className="small" style={{ marginTop: 0 }}>Fetch and map inventory from Boomi/NetSuite into the local database.</p>
                <button type="button" style={{ width: "auto" }} disabled={syncLoading} onClick={triggerBoomiSync}>
                  {syncLoading ? "Syncing..." : "Sync Boomi Inventory"}
                </button>
                {syncResult ? (
                  <p className="small" style={{ marginTop: 8, color: "#166534" }}>
                    Sync complete. Fetched: {Number(syncResult.fetched || 0)}, Processed: {Number(syncResult.processed || 0)}, Skipped: {Number(syncResult.skipped || 0)}.
                  </p>
                ) : null}
                {syncError ? <p className="small" style={{ marginTop: 8, color: "#b91c1c" }}>{syncError}</p> : null}
              </div>
              <div className="admin-user-form" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: "0 0 8px" }}>Catalog Admin Tools</h3>
                <p className="small" style={{ marginTop: 0 }}>Clear current catalog data or seed 500 test devices per category.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="delete-btn" style={{ width: "auto" }} disabled={adminCatalogLoading} onClick={clearCatalogForAdmin}>
                    {adminCatalogLoading ? "Working..." : "Clear Catalog DB"}
                  </button>
                  <button type="button" style={{ width: "auto" }} disabled={adminCatalogLoading} onClick={seedTestDevicesForAdmin}>
                    {adminCatalogLoading ? "Working..." : "Add 500 Test Devices/Category"}
                  </button>
                  <button type="button" style={{ width: "auto" }} disabled={adminCatalogLoading} onClick={seedRealDevicesForAdmin}>
                    {adminCatalogLoading ? "Working..." : "Add 100 Real Devices/Category"}
                  </button>
                  <button type="button" style={{ width: "auto" }} disabled={adminImageMapLoading} onClick={applyImageMappingForAdmin}>
                    {adminImageMapLoading ? "Working..." : "Apply Product Image Mapping"}
                  </button>
                </div>
                {adminCatalogResult ? <p className="small" style={{ marginTop: 8, color: "#166534" }}>{adminCatalogResult}</p> : null}
                {adminCatalogError ? <p className="small" style={{ marginTop: 8, color: "#b91c1c" }}>{adminCatalogError}</p> : null}
              </div>
              <div className="admin-user-form" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: "0 0 8px" }}>Weekly Special Banner</h3>
                <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px" }}>
                  <input
                    type="checkbox"
                    checked={weeklyBannerEnabled}
                    disabled={weeklyBannerSaving}
                    onChange={(e) => updateWeeklyBannerForAdmin(e.target.checked)}
                  />
                  <span>Show weekly special banner on products home page</span>
                </label>
                <p className="small" style={{ marginTop: 0 }}>
                  Flag devices as weekly special. Active flagged devices: {weeklySpecialDevices.length}
                </p>
                <input
                  placeholder="Search devices to flag"
                  value={weeklySpecialSearch}
                  onChange={(e) => setWeeklySpecialSearch(e.target.value)}
                />
                <div className="weekly-device-list">
                  {weeklySpecialAdminDevices.map((device) => (
                    <label key={`weekly-flag-${device.id}`} className="weekly-device-item">
                      <input
                        type="checkbox"
                        checked={device.weeklySpecial === true}
                        disabled={weeklyDeviceSavingId === device.id}
                        onChange={(e) => setDeviceWeeklySpecialForAdmin(device, e.target.checked)}
                      />
                      <span>{device.manufacturer} {device.model}</span>
                    </label>
                  ))}
                  {!weeklySpecialAdminDevices.length ? <p className="small" style={{ margin: 0 }}>No devices match your search.</p> : null}
                </div>
                {weeklyBannerError ? <p className="small" style={{ marginTop: 8, color: "#b91c1c" }}>{weeklyBannerError}</p> : null}
                {weeklyDeviceError ? <p className="small" style={{ marginTop: 8, color: "#b91c1c" }}>{weeklyDeviceError}</p> : null}
              </div>
              <form onSubmit={createUserAsAdmin} className="admin-user-form">
                <div className="admin-user-form-grid">
                  <input type="email" placeholder="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required />
                  <input type="text" placeholder="Company" value={newUserCompany} onChange={(e) => setNewUserCompany(e.target.value)} required />
                  <input type="password" placeholder="Password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} required />
                </div>
                <div className="admin-user-form-checks">
                  <label><input type="checkbox" checked={newUserIsActive} onChange={(e) => setNewUserIsActive(e.target.checked)} /> Active</label>
                  <label><input type="checkbox" checked={newUserIsAdmin} onChange={(e) => setNewUserIsAdmin(e.target.checked)} /> Admin rights</label>
                </div>
                <button type="submit" style={{ width: "auto" }} disabled={userActionLoading}>Create user</button>
              </form>
              {usersLoading ? (
                <UsersTableSkeleton />
              ) : (
                <table className="table">
                  <thead><tr><th>Email</th><th>Company</th><th>Active</th><th>Admin</th><th>Created</th><th /></tr></thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td>{u.company}</td>
                        <td><input type="checkbox" checked={u.isActive} disabled={userActionLoading} onChange={(e) => toggleUserField(u, "isActive", e.target.checked)} /></td>
                        <td><input type="checkbox" checked={u.role === "admin"} disabled={userActionLoading} onChange={(e) => toggleUserField(u, "isAdmin", e.target.checked)} /></td>
                        <td>{new Date(u.createdAt).toLocaleString()}</td>
                        <td>{u.email === user.email ? <span className="small">Current</span> : <button className="delete-btn" style={{ width: "auto" }} disabled={userActionLoading} onClick={() => deleteUser(u)}>Delete</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {route !== "products" && route !== "requests" && route !== "users" && <section className="panel"><h2 className="page-title" style={{ fontSize: "2rem", marginBottom: 8 }}>{navItems.find((n) => n.key === route)?.label || "Page"}</h2><p className="muted">This section is not part of MVP flow in this demo build.</p></section>}
        </main>
      </div>

      {showSessionWarning ? (
        <div className="app-overlay session-expiry-overlay">
          <article className="modal session-expiry-modal">
            <h3 style={{ margin: "0 0 8px", fontSize: "1.6rem" }}>Session expiring soon</h3>
            <p className="muted" style={{ margin: "0 0 6px" }}>
              Your session will expire in:
            </p>
            <div className="session-expiry-countdown">{sessionCountdown}</div>
            <p className="small" style={{ marginTop: 8 }}>
              Choose <strong>Stay signed in</strong> to refresh your session.
            </p>
            <div className="session-expiry-actions">
              <button className="ghost-btn" type="button" onClick={logout} disabled={refreshingSession}>Log out now</button>
              <button type="button" onClick={refreshSessionNow} disabled={refreshingSession}>{refreshingSession ? "Refreshing..." : "Stay signed in"}</button>
            </div>
          </article>
        </div>
      ) : null}

      {activeProduct && (
        <div className="app-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setActiveProduct(null); }}>
          <article className="modal product-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><div><p className="small" style={{ margin: 0 }}>{activeProduct.manufacturer.toUpperCase()}</p><h3 style={{ margin: "2px 0", fontSize: "2rem" }}>{activeProduct.model}</h3><div style={{ fontSize: "2rem", fontWeight: 700 }}>${activeProduct.price.toFixed(2)}</div></div><button className="close-btn" onClick={() => setActiveProduct(null)}>X</button></div>
            <div className="modal-grid">
              <div>
                <div className="modal-box">
                  <div className="thumb modal-main-image" style={{ height: 230 }}>
                    <ImageWithFallback src={activeModalImage} alt={activeProduct.model} />
                    {canCarousel ? <button type="button" className="modal-image-nav left" onClick={() => setActiveImageIndex((i) => (i - 1 + modalImages.length) % modalImages.length)}>‹</button> : null}
                    {canCarousel ? <button type="button" className="modal-image-nav right" onClick={() => setActiveImageIndex((i) => (i + 1) % modalImages.length)}>›</button> : null}
                  </div>
                  {canCarousel ? (
                    <div className="modal-thumbs">
                      {modalImages.map((img, idx) => (
                        <button type="button" key={`${activeProduct.id}-img-${idx}`} className={`modal-thumb-btn ${idx === activeImageIndex ? "active" : ""}`} onClick={() => setActiveImageIndex(idx)}>
                          <ImageWithFallback src={img} alt={`${activeProduct.model} ${idx + 1}`} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="modal-box" style={{ marginTop: 10 }}>
                  <h4 style={{ marginTop: 0 }}>Device Specifications</h4>
                  <div className="spec-grid">
                    <div className="spec-item"><div className="spec-key">Device Class</div><div className="spec-val">{activeProduct.category}</div></div>
                    <div className="spec-item"><div className="spec-key">Grade</div><div className="spec-val">{activeProduct.grade}</div></div>
                    <div className="spec-item"><div className="spec-key">Manufacturer</div><div className="spec-val">{activeProduct.manufacturer}</div></div>
                    <div className="spec-item"><div className="spec-key">Model</div><div className="spec-val">{activeProduct.modelFamily}</div></div>
                    <div className="spec-item"><div className="spec-key">Storage</div><div className="spec-val">{activeProduct.storage}</div></div>
                    <div className="spec-item"><div className="spec-key">Carrier</div><div className="spec-val">{activeProduct.carrier}</div></div>
                    <div className="spec-item"><div className="spec-key">Screen Size</div><div className="spec-val">{activeProduct.screenSize}</div></div>
                    <div className="spec-item"><div className="spec-key">Modular</div><div className="spec-val">{activeProduct.modular}</div></div>
                    <div className="spec-item"><div className="spec-key">Color</div><div className="spec-val">{activeProduct.color}</div></div>
                    <div className="spec-item"><div className="spec-key">Kit Type</div><div className="spec-val">{activeProduct.kitType}</div></div>
                  </div>
                </div>
              </div>
              <div>
                {modalProductUnavailable ? <div className="modal-box modal-warning-box"><p style={{ margin: 0, color: "#dc2626", fontWeight: 600 }}>Currently not available.</p></div> : null}
                <div className="modal-box" style={{ background: "#eef9f3", marginTop: modalProductUnavailable ? 10 : 0 }}><h4 style={{ marginTop: 0 }}>Availability</h4><p className="small">Total across all locations <strong>{activeProduct.available}</strong></p><table className="table"><tbody>{Object.entries(activeProduct.locations).map(([loc, q]) => <tr key={loc}><td>{loc}</td><td>{q}</td></tr>)}</tbody></table></div>
                <div className="modal-box" style={{ marginTop: 10 }}>
                  <h4 style={{ marginTop: 0 }}>Product notes</h4>
                  <p className="small" style={{ margin: 0 }}>{activeProduct.productNotes || "No notes provided."}</p>
                </div>
                <div className="modal-box" style={{ marginTop: 10 }}><h4 style={{ marginTop: 0 }}>Create request for this product</h4><label>Quantity</label><div className="qty-control"><input type="number" min="1" max={Math.max(1, activeProduct.available)} value={productQty} onChange={(e) => setProductQty(Math.max(1, Math.min(9999, Number(e.target.value || 1))))} /><button type="button" onClick={() => setProductQty((v) => v + 1)} disabled={modalProductUnavailable}>+</button><button type="button" onClick={() => setProductQty((v) => Math.max(1, v - 1))} disabled={modalProductUnavailable}>-</button></div><label>Additional request note (optional)</label><input value={productNote} onChange={(e) => setProductNote(e.target.value)} placeholder="Write note" /><button style={{ marginTop: 10 }} disabled={modalProductUnavailable} onClick={() => { addToCart(activeProduct, productQty, productNote.trim()); setActiveProduct(null); setProductQty(1); setProductNote(""); }}>Add to request</button></div>
              </div>
            </div>
          </article>
        </div>
      )}

      {cartOpen && (
        <div className="app-overlay cart-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setCartOpen(false); }}>
          <article className="modal cart-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3 style={{ margin: 0, fontSize: "2rem", fontWeight: 500 }}>Requested items</h3><button className="close-btn" onClick={() => setCartOpen(false)}>X</button></div>
            <div className="cart-scroll">
              <table className="table cart-table">
                <colgroup><col className="cart-col-name-col" /><col className="cart-col-grade-col" /><col className="cart-col-offer-col" /><col className="cart-col-qty-col" /><col className="cart-col-total-col" /><col className="cart-col-action-col" /></colgroup>
                <thead><tr><th>Product Name</th><th>Grade</th><th>Offer Price</th><th>Qty</th><th>Total</th><th /></tr></thead>
                <tbody>
                  {cart.length ? cart.map((r) => {
                    const lineTotal = Number(r.offerPrice || 0) * Number(r.quantity || 0);
                    return (
                      <tr key={r.id}>
                        <td className="cart-col-name" title={r.model}>{r.model}</td>
                        <td className="cart-col-grade">{r.grade}</td>
                        <td className="cart-col-offer"><input className="cart-input" type="number" min="0" step="0.01" value={r.offerPrice} onChange={(e) => updateCart(cart.map((i) => i.id === r.id ? { ...i, offerPrice: e.target.value === "" ? "" : Number(e.target.value) } : i))} /></td>
                        <td className="cart-col-qty"><input className="cart-input" type="number" min="1" max="9999" value={r.quantity} onChange={(e) => updateCart(cart.map((i) => i.id === r.id ? { ...i, quantity: Math.max(1, Math.min(9999, Math.floor(Number(e.target.value || 1)))) } : i))} /></td>
                        <td className="cart-col-total">${lineTotal.toFixed(2)}</td>
                        <td className="cart-col-action"><button className="delete-btn cart-delete-btn" onClick={() => updateCart(cart.filter((i) => i.id !== r.id))}>Delete</button></td>
                      </tr>
                    );
                  }) : <tr><td colSpan={6} className="small">No requested items yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="cart-footer"><div><strong>Grand Total</strong><div className="small">{cart.reduce((s, i) => s + Number(i.quantity || 0), 0)} units | ${cart.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.offerPrice || 0), 0).toFixed(2)}</div></div><div className="cart-actions"><button className="delete-btn" onClick={() => updateCart([])} disabled={requestSubmitLoading}>Delete all</button><button className="submit-btn" disabled={requestSubmitLoading || !cart.length || !cart.every((i) => i.offerPrice !== "" && Number(i.quantity) >= 1 && Number(i.offerPrice) >= 0)} onClick={submitRequest}>{requestSubmitLoading ? "Submitting..." : "Submit request"}</button></div></div>
          </article>
        </div>
      )}
    </div>
  );
}

function Login({ onLogin, onRegister, onRequestPasswordReset, onResetPassword }) {
  const logoUrl = `${import.meta.env.BASE_URL}logo.png`;
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [demoCodeHint, setDemoCodeHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (mode === "approval") return;
    if (mode === "login" && (!email || !password)) return;
    if (mode === "register" && (!email || !password || !company)) return;
    if (mode === "reset-request" && !email) return;
    if (mode === "reset-confirm" && (!email || !resetCode || !resetPassword)) return;
    try {
      setLoading(true);
      setError("");
      setNotice("");
      if (mode === "login") {
        const result = await onLogin(email.trim(), password);
        if (result?.pendingApproval) {
          setPendingEmail(result.email || email.trim());
          setMode("approval");
          return;
        }
      } else if (mode === "register") {
        await onRegister(email.trim(), password, company.trim());
        setMode("login");
        setPassword("");
        setNotice("User created. You can now sign in.");
      } else if (mode === "reset-request") {
        const result = await onRequestPasswordReset(email.trim());
        setMode("reset-confirm");
        setDemoCodeHint(result.demoCode || "");
        setNotice("Verification code sent. Enter it below with your new password.");
      } else if (mode === "reset-confirm") {
        await onResetPassword(email.trim(), resetCode.trim(), resetPassword);
        setMode("login");
        setResetCode("");
        setResetPassword("");
        setNotice("Password has been reset. You can now sign in.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <aside className="auth-hero">
          <div className="auth-hero-logo-wrap">
            <img className="auth-hero-logo" src={logoUrl} alt="PCS Wireless" />
          </div>
          <h2 className="auth-hero-title">PCS Online Catalog</h2>
          <p className="auth-hero-text">PCS Wireless: powering smarter sourcing with trusted device lifecycle solutions.</p>
        </aside>
        <div className="auth-card">
        <h1 className="auth-title">{mode === "register" ? "Create Account" : mode === "reset-confirm" ? "Reset Password" : mode === "reset-request" ? "Forgot Password" : "Login"}</h1>
        {mode === "approval" ? (
          <>
            <h3 style={{ marginBottom: 6 }}>Waiting for approval</h3>
            <p className="small" style={{ marginTop: 0 }}>
              {pendingEmail || "This account"} has been created and is waiting for admin approval.
            </p>
            <button type="button" onClick={() => { setMode("login"); setError(""); setNotice(""); }} style={{ marginTop: 8 }}>
              Back to sign in
            </button>
          </>
        ) : (
          <>
        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-notice">{notice}</p> : null}
        <form onSubmit={submit}>
          <label>Email Address *</label>
          <div className="auth-input-wrap">
            <span className="auth-input-icon">✉</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="buyer@company.com" />
          </div>
          {(mode === "login" || mode === "register") ? (
            <>
              <label>Password *</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">⌨</span>
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Password" />
                <button type="button" className="auth-toggle-btn" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOpenIcon /> : <EyeClosedIcon />}
                </button>
              </div>
              {mode === "login" ? (
                <div className="auth-inline-link-row">
                  <button type="button" className="link-btn" onClick={() => { setMode("reset-request"); setError(""); setNotice(""); }}>Forgot password?</button>
                </div>
              ) : null}
            </>
          ) : null}
          {mode === "register" ? (
            <>
              <label>Company</label><input type="text" value={company} onChange={(e) => setCompany(e.target.value)} required placeholder="Test Company" />
              <p className="small">Password: 8+ chars, one uppercase, one number, one special character.</p>
            </>
          ) : null}
          {mode === "reset-confirm" ? (
            <>
              <label>Verification code</label><input type="text" inputMode="numeric" maxLength={6} value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required placeholder="123456" />
              <label>New password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">⌨</span>
                <input type={showResetPassword ? "text" : "password"} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} required placeholder="New password" />
                <button type="button" className="auth-toggle-btn" onClick={() => setShowResetPassword((v) => !v)} aria-label={showResetPassword ? "Hide password" : "Show password"} title={showResetPassword ? "Hide password" : "Show password"}>
                  {showResetPassword ? <EyeOpenIcon /> : <EyeClosedIcon />}
                </button>
              </div>
              <p className="small">Code must be 6 digits. Password policy still applies.</p>
              {demoCodeHint ? <p className="small">Demo verification code: {demoCodeHint}</p> : null}
            </>
          ) : null}
          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : mode === "register" ? "Create User" : mode === "reset-request" ? "Send verification code" : "Reset password"}
          </button>
        </form>
        <div className="auth-links">
          {mode === "login" ? <p className="auth-link-text">Don&apos;t have an account? <button type="button" className="link-btn auth-inline-link" onClick={() => { setMode("register"); setError(""); setNotice(""); }}>Create user</button></p> : null}
          {(mode === "register" || mode === "reset-request" || mode === "reset-confirm") ? <button type="button" className="link-btn" onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Back to sign in</button> : null}
        </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

function EyeOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M2 12s3.5-6 10-6c2 0 3.8.6 5.3 1.5M22 12s-3.5 6-10 6c-2 0-3.8-.6-5.3-1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CategoryTileSkeleton() {
  return (
    <div className="category-btn category-btn-skeleton">
      <div className="skeleton skeleton-circle" />
      <div className="skeleton skeleton-line" style={{ width: "66%" }} />
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <article className="card card-skeleton">
      <div className="skeleton skeleton-thumb" />
      <div className="skeleton skeleton-line" style={{ width: "34%", marginTop: 8 }} />
      <div className="skeleton skeleton-line" style={{ width: "92%", marginTop: 7 }} />
      <div className="skeleton skeleton-line" style={{ width: "46%", height: 26, marginTop: 8 }} />
      <div className="skeleton skeleton-line" style={{ width: "56%", marginTop: 8 }} />
      <div className="skeleton skeleton-line" style={{ width: "52%", marginTop: 6 }} />
      <div className="skeleton skeleton-button" style={{ marginTop: 10 }} />
    </article>
  );
}

function FilterSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, groupIdx) => (
        <div key={`filter-sk-${groupIdx}`} className="filter-row">
          <div className="skeleton skeleton-line" style={{ width: "54%", marginBottom: 8 }} />
          {Array.from({ length: 4 }).map((__, itemIdx) => (
            <div key={`filter-sk-${groupIdx}-${itemIdx}`} className="skeleton-row">
              <div className="skeleton skeleton-checkbox" />
              <div className="skeleton skeleton-line" style={{ width: `${58 + (itemIdx % 3) * 12}%` }} />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function UsersTableSkeleton() {
  return (
    <div className="users-skeleton">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={`user-sk-${idx}`} className="users-skeleton-row">
          <div className="skeleton skeleton-line" style={{ width: "30%" }} />
          <div className="skeleton skeleton-line" style={{ width: "18%" }} />
          <div className="skeleton skeleton-checkbox" />
          <div className="skeleton skeleton-checkbox" />
          <div className="skeleton skeleton-line" style={{ width: "20%" }} />
          <div className="skeleton skeleton-button" style={{ width: 86, height: 30 }} />
        </div>
      ))}
    </div>
  );
}

function ImageWithFallback({ src, alt = "", className = "", loading = "lazy" }) {
  const fallback = `${import.meta.env.BASE_URL}device-fallback.png`;
  const [resolvedSrc, setResolvedSrc] = useState(src || fallback);

  useEffect(() => {
    setResolvedSrc(src || fallback);
  }, [src, fallback]);

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        if (resolvedSrc !== fallback) setResolvedSrc(fallback);
      }}
    />
  );
}

function ProductCard({ p, image, onOpen, onAdd }) {
  const unavailable = p.available < 1;
  const cardPrice = Math.round(Number(p.price || 0)).toLocaleString("en-US");
  return (
    <article className="card product-card">
      <div className="thumb product-thumb" onClick={() => onOpen(p)}><ImageWithFallback src={image} alt={p.model} /></div>
      <div className="brand product-brand">{p.manufacturer}</div>
      <div className="name product-name" onClick={() => onOpen(p)}>{p.model}</div>
      <div className="price">${cardPrice}</div>
      <div className="product-meta">Device Grade {p.grade}</div>
      <div className={`avail ${unavailable ? "bad" : "ok"}`}>{unavailable ? "Currently not available" : `${p.available} items available`}</div>
      <button className="add-btn" disabled={unavailable} onClick={() => onAdd(p, 1, "")}>Add to request</button>
    </article>
  );
}
