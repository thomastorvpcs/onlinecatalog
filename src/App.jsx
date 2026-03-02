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
const INVENTORY_DISPLAY_CAP = 100;

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

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatUsd(value) {
  return usdFormatter.format(Number(value || 0));
}

function normalizeInventoryQuantity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function capInventoryQuantity(value) {
  return Math.min(INVENTORY_DISPLAY_CAP, normalizeInventoryQuantity(value));
}

function inventoryDisplayValue(value) {
  const normalized = normalizeInventoryQuantity(value);
  return normalized > INVENTORY_DISPLAY_CAP ? `${INVENTORY_DISPLAY_CAP}+` : String(Math.min(INVENTORY_DISPLAY_CAP, normalized));
}

function normalizeDevice(p) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  const fallbackImage = p.image || (images.length ? images[0] : "");
  const rawLocations = p.locations && typeof p.locations === "object" ? p.locations : {};
  const locations = {};
  const locationDisplay = {};
  for (const [name, qty] of Object.entries(rawLocations)) {
    locations[name] = capInventoryQuantity(qty);
    locationDisplay[name] = inventoryDisplayValue(qty);
  }
  const rawAvailable = p.available !== undefined
    ? normalizeInventoryQuantity(p.available)
    : Object.values(rawLocations).reduce((sum, qty) => sum + normalizeInventoryQuantity(qty), 0);
  const available = Math.min(INVENTORY_DISPLAY_CAP, rawAvailable);
  const availableDisplay = inventoryDisplayValue(rawAvailable);
  const availableRegions = Object.entries(locations)
    .filter(([, qty]) => Number(qty || 0) > 0)
    .map(([name]) => name)
    .sort((a, b) => String(a).localeCompare(String(b)));
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
    weeklySpecial: p.weeklySpecial === true,
    locations,
    locationDisplay,
    available,
    availableDisplay,
    availableRegions
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
const DEMO_SAVED_FILTERS_PREFIX = "pcs.demo.savedFilters.";
const FILTER_FIELD_KEYS = ["manufacturer", "modelFamily", "grade", "region", "storage"];

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

function demoSavedFiltersKey(userId, viewKey = "category") {
  return `${DEMO_SAVED_FILTERS_PREFIX}${Number(userId || 0)}.${String(viewKey || "category").trim().toLowerCase() || "category"}`;
}

function getDemoSavedFilters(userId, viewKey = "category") {
  return readJson(localStorage, demoSavedFiltersKey(userId, viewKey), []);
}

function setDemoSavedFilters(userId, viewKey, savedFilters) {
  writeJson(localStorage, demoSavedFiltersKey(userId, viewKey), savedFilters);
}

function sanitizeFilterPayload(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const selectedCategory = String(input.selectedCategory || "").trim() || "Smartphones";
  const search = String(input.search || "").slice(0, 200);
  const sourceFilters = input.filters && typeof input.filters === "object" ? input.filters : {};
  const filters = {};
  for (const key of FILTER_FIELD_KEYS) {
    const values = Array.isArray(sourceFilters[key])
      ? sourceFilters[key].map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    if (values.length) {
      filters[key] = [...new Set(values)];
    }
  }
  return { selectedCategory, search, filters };
}

function categorySavedFilterViewKey(category) {
  const slug = String(category || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return `cat_${slug || "general"}`;
}

function parseFiltersWithHeuristics(promptRaw, selectedCategoryRaw, allProducts) {
  const prompt = String(promptRaw || "").trim();
  const selectedCategory = String(selectedCategoryRaw || "").trim() || "Smartphones";
  if (!prompt) {
    return { selectedCategory, search: "", filters: {}, warnings: ["Enter a prompt to parse filters."] };
  }
  const text = prompt.toLowerCase();
  const categories = [...new Set((allProducts || []).map((p) => p.category))];
  const manufacturers = [...new Set((allProducts || []).map((p) => p.manufacturer))];
  const modelFamilies = [...new Set((allProducts || []).map((p) => p.modelFamily || modelFamilyOf(p.model)))];
  const storages = [...new Set((allProducts || []).map((p) => p.storage))];
  const regions = [...new Set((allProducts || []).flatMap((p) => Object.keys(p.locations || {})))];
  const filters = {};
  const warnings = [];

  const categoryByMatch = categories.find((name) => text.includes(String(name).toLowerCase()))
    || (text.includes("phone") ? "Smartphones" : "")
    || (text.includes("tablet") ? "Tablets" : "")
    || (text.includes("laptop") ? "Laptops" : "")
    || (text.includes("wear") || text.includes("watch") ? "Wearables" : "")
    || (text.includes("accessor") ? "Accessories" : "");

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

  if (/\$?\s*(\d{2,6})(?:\s*usd|\s*dollars?)?/i.test(prompt)) {
    warnings.push("Price constraints were detected but not auto-applied because price filter is not configured.");
  }
  return {
    selectedCategory: categoryByMatch || selectedCategory,
    search: Object.keys(filters).length ? "" : prompt,
    filters,
    warnings
  };
}

function buildCopilotSuggestedFilterName(payloadRaw) {
  const payload = sanitizeFilterPayload(payloadRaw);
  const filters = payload.filters && typeof payload.filters === "object" ? payload.filters : {};
  const search = String(payload.search || "").trim();
  const parts = [];
  const orderedKeys = ["manufacturer", "modelFamily", "grade", "region", "storage"];
  for (const key of orderedKeys) {
    const values = Array.isArray(filters[key]) ? filters[key] : [];
    const cleaned = values.map((v) => String(v || "").trim()).filter(Boolean);
    if (!cleaned.length) continue;
    parts.push(cleaned.slice(0, 2).join(" + "));
  }
  if (search) parts.push(search);
  if (!parts.length) return "AI Suggested Filter";
  return parts.join(" | ").slice(0, 80);
}

function validateRequestWithHeuristics(body, allProducts) {
  const lines = Array.isArray(body?.lines) ? body.lines : [];
  const selectedLocation = String(body?.selectedLocation || "").trim();
  const warnings = [];
  const suggestions = [];
  if (!lines.length) {
    warnings.push({ code: "EMPTY_REQUEST", message: "Request has no lines." });
    return { warnings, suggestions };
  }
  const byId = new Map((allProducts || []).map((p) => [p.id, p]));
  lines.forEach((line, index) => {
    const quantity = Number(line.quantity);
    const offerPrice = Number(line.offerPrice);
    const model = String(line.model || "").trim();
    const grade = String(line.grade || "").trim();
    const productId = String(line.productId || line.deviceId || "").trim();
    if (!model) warnings.push({ code: "MISSING_MODEL", lineIndex: index, message: `Line ${index + 1}: model is missing.` });
    if (!grade) warnings.push({ code: "MISSING_GRADE", lineIndex: index, message: `Line ${index + 1}: grade is missing.` });
    if (!Number.isInteger(quantity) || quantity < 1) warnings.push({ code: "INVALID_QTY", lineIndex: index, message: `Line ${index + 1}: quantity must be >= 1.` });
    if (!Number.isFinite(offerPrice) || offerPrice < 0) warnings.push({ code: "INVALID_PRICE", lineIndex: index, message: `Line ${index + 1}: offer price must be >= 0.` });
    if (selectedLocation && productId) {
      const device = byId.get(productId);
      const available = Number(device?.locations?.[selectedLocation] || 0);
      if (Number.isInteger(quantity) && quantity > available) {
        warnings.push({ code: "LOCATION_SHORTAGE", lineIndex: index, message: `Line ${index + 1}: ${model} exceeds available inventory at ${selectedLocation} (requested ${quantity}, available ${available}).` });
        suggestions.push({
          type: "ADJUST_QTY",
          lineIndex: index,
          action: { type: "set_quantity", lineIndex: index, suggestedQuantity: Math.max(0, available) },
          message: `Set quantity to ${Math.max(0, available)} for ${model} at ${selectedLocation}.`
        });
      }
    }
  });
  if (!selectedLocation) suggestions.push({ type: "SELECT_LOCATION", message: "Select an order location before submitting." });
  return { warnings, suggestions, inventorySource: "local" };
}

function validateNetsuitePayloadHeuristics(body) {
  const payload = body && typeof body.payload === "object" ? body.payload : {};
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const errors = [];
  const fixes = [];
  if (!payload.requestNumber && !payload.requestId) {
    errors.push("Missing request identifier.");
    fixes.push("Provide requestId or requestNumber in payload.");
  }
  if (!payload.company) {
    errors.push("Missing company.");
    fixes.push("Provide company for NetSuite customer mapping.");
  }
  if (!payload.currencyCode) {
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
  return { valid: errors.length === 0, errors, fixes };
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
      const availableRegions = p.locations && typeof p.locations === "object"
        ? Object.entries(p.locations).filter(([, qty]) => Number(qty || 0) > 0).map(([name]) => name)
        : [];
      if (search && !text.includes(search)) return false;
      if (categories.length && !categories.includes(p.category)) return false;
      if (manufacturers.length && !manufacturers.includes(p.manufacturer)) return false;
      if (modelFamilies.length && !modelFamilies.includes(p.modelFamily)) return false;
      if (grades.length && !grades.includes(p.grade)) return false;
      if (regions.length && !regions.some((regionName) => availableRegions.includes(regionName))) return false;
      if (storages.length && !storages.includes(p.storage)) return false;
      return true;
    });

    if (!pageSize) return filtered;
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return { items, total, page, pageSize };
  }

  if (method === "POST" && pathname === "/api/ai/parse-filters") {
    requireAuth();
    const all = productsSeed.map((p) => normalizeDevice(p));
    return parseFiltersWithHeuristics(body.prompt, body.selectedCategory, all);
  }

  if (method === "POST" && pathname === "/api/ai/validate-request") {
    requireAuth();
    const all = productsSeed.map((p) => normalizeDevice(p));
    return validateRequestWithHeuristics(body, all);
  }

  if (method === "POST" && pathname === "/api/ai/validate-netsuite-payload") {
    requireAuth();
    return validateNetsuitePayloadHeuristics(body);
  }

  if (method === "POST" && pathname === "/api/ai/copilot") {
    requireAuth();
    const all = productsSeed.map((p) => normalizeDevice(p));
    const parsed = parseFiltersWithHeuristics(body.message, body.selectedCategory, all);
    const hasFilters = Object.keys(parsed.filters || {}).length > 0 || String(parsed.search || "").trim().length > 0;
    const suggestedName = buildCopilotSuggestedFilterName(parsed);
    return hasFilters
      ? {
        reply: "I parsed your request and prepared filters you can apply.",
        action: {
          type: "apply_filters",
          payload: {
            ...parsed,
            suggestedName: suggestedName || "AI Suggested Filter"
          }
        }
      }
      : {
        reply: "Try asking for a concrete product query like: Apple CPO in Miami 128GB.",
        action: null
      };
  }

  if (method === "GET" && pathname === "/api/ai/admin/anomalies") {
    requireAdmin();
    const all = productsSeed.map((p) => normalizeDevice(p));
    const lowStock = all.filter((p) => Number(p.available || 0) > 0 && Number(p.available || 0) <= 5).map((p) => ({
      type: "low_stock",
      severity: "medium",
      message: `${p.model} is low stock (${Number(p.available || 0)} units total).`,
      timestamp: null
    }));
    return { anomalies: lowStock.length ? lowStock : [{ type: "none", severity: "info", message: "No significant anomalies detected in demo snapshot.", timestamp: null }] };
  }

  if (method === "GET" && pathname === "/api/ai/admin/sales-insights") {
    const auth = requireAdmin();
    const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") || 30)));
    const fromTs = Date.now() - (days * 24 * 60 * 60 * 1000);
    const requests = getDemoRequests(auth.company).filter((r) => new Date(r.createdAt).getTime() >= fromTs);
    const byStatusMap = new Map();
    const modelQtyMap = new Map();
    let totalRevenue = 0;
    for (const r of requests) {
      byStatusMap.set(r.status, Number(byStatusMap.get(r.status) || 0) + 1);
      totalRevenue += Number(r.total || 0);
      for (const line of Array.isArray(r.lines) ? r.lines : []) {
        modelQtyMap.set(line.model, Number(modelQtyMap.get(line.model) || 0) + Number(line.quantity || 0));
      }
    }
    const byStatus = [...byStatusMap.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
    const topModels = [...modelQtyMap.entries()].map(([model, quantity]) => ({ model, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 8);
    return {
      rangeDays: days,
      requestCount: requests.length,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      byStatus,
      topModels
    };
  }

  if (method === "GET" && pathname === "/api/filters/saved") {
    const auth = requireAuth();
    const viewKey = String(url.searchParams.get("view") || "category").trim().toLowerCase() || "category";
    return getDemoSavedFilters(auth.id, viewKey)
      .slice()
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
  }

  if (method === "POST" && pathname === "/api/filters/saved") {
    const auth = requireAuth();
    const name = String(body.name || "").trim();
    const viewKey = String(body.viewKey || "category").trim().toLowerCase() || "category";
    if (!name) throwApiError("name is required.", 400);
    if (name.length > 80) throwApiError("name must be 80 characters or less.", 400);
    const payload = sanitizeFilterPayload(body.payload);
    const saved = getDemoSavedFilters(auth.id, viewKey);
    const now = new Date().toISOString();
    const existingIndex = saved.findIndex((f) => String(f.name || "").toLowerCase() === name.toLowerCase());
    if (existingIndex >= 0) {
      const current = saved[existingIndex];
      saved[existingIndex] = {
        ...current,
        name,
        payload,
        updatedAt: now
      };
      setDemoSavedFilters(auth.id, viewKey, saved);
      return saved[existingIndex];
    }
    const created = {
      id: crypto.randomUUID(),
      viewKey,
      name,
      payload,
      createdAt: now,
      updatedAt: now
    };
    saved.push(created);
    setDemoSavedFilters(auth.id, viewKey, saved);
    return created;
  }

  const savedFilterByIdMatch = pathname.match(/^\/api\/filters\/saved\/([^/]+)$/);
  if (method === "PATCH" && savedFilterByIdMatch) {
    const auth = requireAuth();
    const filterId = decodeURIComponent(savedFilterByIdMatch[1]);
    const viewKey = String(body.viewKey || url.searchParams.get("view") || "category").trim().toLowerCase() || "category";
    const name = String(body.name || "").trim();
    if (!name) throwApiError("name is required.", 400);
    if (name.length > 80) throwApiError("name must be 80 characters or less.", 400);
    const payload = sanitizeFilterPayload(body.payload);
    const saved = getDemoSavedFilters(auth.id, viewKey);
    const idx = saved.findIndex((f) => String(f.id) === filterId);
    if (idx < 0) throwApiError("Saved filter not found.", 404);
    const duplicate = saved.find((f, i) => i !== idx && String(f.name || "").toLowerCase() === name.toLowerCase());
    if (duplicate) throwApiError("Saved filter name already exists.", 409);
    saved[idx] = {
      ...saved[idx],
      name,
      payload,
      updatedAt: new Date().toISOString()
    };
    setDemoSavedFilters(auth.id, viewKey, saved);
    return saved[idx];
  }

  if (method === "DELETE" && savedFilterByIdMatch) {
    const auth = requireAuth();
    const filterId = decodeURIComponent(savedFilterByIdMatch[1]);
    const viewKey = String(url.searchParams.get("view") || "category").trim().toLowerCase() || "category";
    const saved = getDemoSavedFilters(auth.id, viewKey);
    const next = saved.filter((f) => String(f.id) !== filterId);
    if (next.length === saved.length) throwApiError("Saved filter not found.", 404);
    setDemoSavedFilters(auth.id, viewKey, next);
    return { ok: true };
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
  return (
    <svg className="accessories-icon" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M7 25v-3a9 9 0 0 1 18 0v3h-3.5v-3a5.5 5.5 0 0 0-11 0v3H7z" fill="#147bd1" />
      <rect x="7" y="25" width="3.6" height="8.5" rx="1.6" fill="#147bd1" />
      <rect x="21.4" y="25" width="3.6" height="8.5" rx="1.6" fill="#147bd1" />
      <rect x="8.2" y="26.6" width="1.2" height="5.2" rx="0.6" fill="#eef0f3" />
      <rect x="22.6" y="26.6" width="1.2" height="5.2" rx="0.6" fill="#eef0f3" />

      <rect x="38" y="13" width="16.5" height="16.5" rx="2.8" fill="#147bd1" />
      <rect x="41.2" y="10.7" width="2.6" height="3.2" rx="0.8" fill="#147bd1" />
      <rect x="48.7" y="10.7" width="2.6" height="3.2" rx="0.8" fill="#147bd1" />
      <path d="M46.8 17.8l-2 3h1.8l-1.9 3.5 4.2-4.9h-2.1l1.6-1.6h-1.6z" fill="#eef0f3" />
      <path d="M54.5 21.5h2.1a1.9 1.9 0 0 1 1.9 1.9v1.8a1.9 1.9 0 0 1-1.9 1.9h-2.1z" fill="#147bd1" />

      <rect x="7" y="40" width="50" height="14" rx="3.4" fill="#147bd1" />
      <rect x="9.2" y="42.3" width="45.6" height="9.2" rx="1.9" fill="#eef0f3" />
      <g fill="#147bd1">
        <rect x="11" y="44" width="3.5" height="2.5" rx="0.6" />
        <rect x="16" y="44" width="3.5" height="2.5" rx="0.6" />
        <rect x="21" y="44" width="3.5" height="2.5" rx="0.6" />
        <rect x="26" y="44" width="3.5" height="2.5" rx="0.6" />
        <rect x="31" y="44" width="3.5" height="2.5" rx="0.6" />
        <rect x="36" y="44" width="3.5" height="2.5" rx="0.6" />
        <rect x="41" y="44" width="3.5" height="2.5" rx="0.6" />
        <rect x="46" y="44" width="3.5" height="2.5" rx="0.6" />
        <rect x="11" y="47.4" width="3.5" height="2.5" rx="0.6" />
        <rect x="16" y="47.4" width="3.5" height="2.5" rx="0.6" />
        <rect x="21" y="47.4" width="3.5" height="2.5" rx="0.6" />
        <rect x="26" y="47.4" width="3.5" height="2.5" rx="0.6" />
        <rect x="31" y="47.4" width="3.5" height="2.5" rx="0.6" />
        <rect x="36" y="47.4" width="3.5" height="2.5" rx="0.6" />
        <rect x="41" y="47.4" width="3.5" height="2.5" rx="0.6" />
        <rect x="46" y="47.4" width="3.5" height="2.5" rx="0.6" />
      </g>
      <rect x="25" y="51" width="14" height="1.4" rx="0.7" fill="#147bd1" />
    </svg>
  );
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
  const [selectedRequestLocation, setSelectedRequestLocation] = useState("");
  const [allowPartialRequestLocation, setAllowPartialRequestLocation] = useState(false);
  const [productQty, setProductQty] = useState(1);
  const [productOfferPrice, setProductOfferPrice] = useState(0);
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
  const [savedFilters, setSavedFilters] = useState([]);
  const [savedFiltersLoading, setSavedFiltersLoading] = useState(false);
  const [savedFiltersError, setSavedFiltersError] = useState("");
  const [shortcutFiltersByCategory, setShortcutFiltersByCategory] = useState({});
  const [newSavedFilterName, setNewSavedFilterName] = useState("");
  const [savingFilter, setSavingFilter] = useState(false);
  const [savedFilterNotice, setSavedFilterNotice] = useState("");
  const [editingSavedFilterId, setEditingSavedFilterId] = useState(null);
  const [isEditingSavedFilter, setIsEditingSavedFilter] = useState(false);
  const [weeklyExpandedFilters, setWeeklyExpandedFilters] = useState({});
  const [weeklyBannerEnabled, setWeeklyBannerEnabled] = useState(false);
  const [weeklyBannerSaving, setWeeklyBannerSaving] = useState(false);
  const [weeklyBannerError, setWeeklyBannerError] = useState("");
  const [weeklyDeviceSavingId, setWeeklyDeviceSavingId] = useState("");
  const [weeklyDeviceError, setWeeklyDeviceError] = useState("");
  const [weeklySpecialSearch, setWeeklySpecialSearch] = useState("");
  const [aiRequestReviewLoading, setAiRequestReviewLoading] = useState(false);
  const [aiRequestReview, setAiRequestReview] = useState(null);
  const [aiRequestReviewError, setAiRequestReviewError] = useState("");
  const [aiCopilotMessages, setAiCopilotMessages] = useState([]);
  const [aiCopilotInput, setAiCopilotInput] = useState("");
  const [aiCopilotLoading, setAiCopilotLoading] = useState(false);
  const [aiCopilotError, setAiCopilotError] = useState("");
  const [aiCopilotOpen, setAiCopilotOpen] = useState(false);
  const [adminAiAnomaliesLoading, setAdminAiAnomaliesLoading] = useState(false);
  const [adminAiAnomalies, setAdminAiAnomalies] = useState([]);
  const [adminAiInsightsLoading, setAdminAiInsightsLoading] = useState(false);
  const [adminAiInsights, setAdminAiInsights] = useState(null);
  const [adminAiError, setAdminAiError] = useState("");
  const [cartNotice, setCartNotice] = useState("");
  const skipInitialCategoryResetRef = useRef(true);
  const cartNoticeTimerRef = useRef(null);
  const aiCopilotFeedRef = useRef(null);

  const cartKey = user ? `pcs.cart.${normalizeEmail(user.email)}` : "";
  const requestPrefsKey = user ? `pcs.requestPrefs.${normalizeEmail(user.email)}` : "";
  const categoryNames = useMemo(() => [...new Set(products.map((p) => p.category))].sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a);
    const bIndex = CATEGORY_ORDER.indexOf(b);
    const aOrder = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const bOrder = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b);
  }), [products]);

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
    setSelectedRequestLocation("");
    setAllowPartialRequestLocation(false);
    setRequests([]);
    setRequestsError("");
    setRequestStatusUpdateError("");
    setActiveRequestId(null);
    setCartOpen(false);
    setSavedFilters([]);
    setShortcutFiltersByCategory({});
    setSavedFiltersError("");
    setNewSavedFilterName("");
    setSavedFilterNotice("");
    setEditingSavedFilterId(null);
    setIsEditingSavedFilter(false);
    setAiFilterPrompt("");
    setAiFilterError("");
    setAiRequestReview(null);
    setAiRequestReviewError("");
    setAiCopilotMessages([]);
    setAiCopilotInput("");
    setAiCopilotError("");
    setAiCopilotOpen(false);
    setAdminAiAnomalies([]);
    setAdminAiInsights(null);
    setAdminAiError("");
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
    if (!requestPrefsKey) {
      setSelectedRequestLocation("");
      setAllowPartialRequestLocation(false);
      return;
    }
    const prefs = readJson(localStorage, requestPrefsKey, {});
    setSelectedRequestLocation(String(prefs?.selectedRequestLocation || ""));
    setAllowPartialRequestLocation(Boolean(prefs?.allowPartialRequestLocation));
  }, [requestPrefsKey]);

  useEffect(() => {
    if (!requestPrefsKey) return;
    writeJson(localStorage, requestPrefsKey, {
      selectedRequestLocation,
      allowPartialRequestLocation
    });
  }, [requestPrefsKey, selectedRequestLocation, allowPartialRequestLocation]);

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
    let ignore = false;
    async function loadSavedFilters() {
      if (!user || !authToken) {
        if (!ignore) {
          setSavedFilters([]);
          setSavedFiltersLoading(false);
        }
        return;
      }
      try {
        if (!ignore) {
          setSavedFiltersLoading(true);
          setSavedFiltersError("");
        }
        const viewKey = categorySavedFilterViewKey(selectedCategory);
        const payload = await apiRequest(`/api/filters/saved?view=${encodeURIComponent(viewKey)}`, {
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState
        });
        if (!ignore) {
          setSavedFilters(Array.isArray(payload) ? payload : []);
        }
      } catch (error) {
        if (!ignore) {
          setSavedFilters([]);
          setSavedFiltersError(error.message || "Failed to load saved filters.");
        }
      } finally {
        if (!ignore) {
          setSavedFiltersLoading(false);
        }
      }
    }
    loadSavedFilters();
    return () => {
      ignore = true;
    };
  }, [authToken, refreshToken, user, selectedCategory]);

  useEffect(() => {
    let ignore = false;
    async function loadShortcutFilters() {
      if (!user || !authToken || !categoryNames.length) {
        if (!ignore) {
          setShortcutFiltersByCategory({});
        }
        return;
      }
      const entries = await Promise.all(categoryNames.map(async (categoryName) => {
        try {
          const viewKey = categorySavedFilterViewKey(categoryName);
          const payload = await apiRequest(`/api/filters/saved?view=${encodeURIComponent(viewKey)}`, {
            token: authToken,
            refreshToken,
            onAuthUpdate: applyAuthTokens,
            onAuthFail: clearAuthState
          });
          return [categoryName, Array.isArray(payload) ? payload : []];
        } catch {
          return [categoryName, []];
        }
      }));
      if (ignore) return;
      const next = {};
      for (const [categoryName, filtersForCategory] of entries) {
        if (filtersForCategory.length) {
          next[categoryName] = filtersForCategory;
        }
      }
      setShortcutFiltersByCategory(next);
    }
    loadShortcutFilters();
    return () => {
      ignore = true;
    };
  }, [authToken, refreshToken, user, categoryNames]);

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

  useEffect(() => () => {
    if (cartNoticeTimerRef.current) {
      clearTimeout(cartNoticeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!savedFilterNotice) return;
    const timer = setTimeout(() => setSavedFilterNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [savedFilterNotice]);

  useEffect(() => {
    setAiRequestReview(null);
    setAiRequestReviewError("");
  }, [cart, selectedRequestLocation]);

  useEffect(() => {
    if (!editingSavedFilterId) {
      if (isEditingSavedFilter) setIsEditingSavedFilter(false);
      return;
    }
    const exists = savedFilters.some((f) => String(f.id) === String(editingSavedFilterId));
    if (!exists) {
      setEditingSavedFilterId(null);
      setIsEditingSavedFilter(false);
    }
  }, [savedFilters, editingSavedFilterId, isEditingSavedFilter]);

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
    setProductOfferPrice(Number(activeProduct?.price || 0));
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

  const refreshSavedFilters = async () => {
    if (!user || !authToken) return;
    setSavedFiltersLoading(true);
    setSavedFiltersError("");
    try {
      const viewKey = categorySavedFilterViewKey(selectedCategory);
      const payload = await apiRequest(`/api/filters/saved?view=${encodeURIComponent(viewKey)}`, {
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      setSavedFilters(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setSavedFilters([]);
      setSavedFiltersError(error.message || "Failed to load saved filters.");
    } finally {
      setSavedFiltersLoading(false);
    }
  };

  const refreshShortcutFilters = async () => {
    if (!user || !authToken || !categoryNames.length) {
      setShortcutFiltersByCategory({});
      return;
    }
    const entries = await Promise.all(categoryNames.map(async (categoryName) => {
      try {
        const viewKey = categorySavedFilterViewKey(categoryName);
        const payload = await apiRequest(`/api/filters/saved?view=${encodeURIComponent(viewKey)}`, {
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState
        });
        return [categoryName, Array.isArray(payload) ? payload : []];
      } catch {
        return [categoryName, []];
      }
    }));
    const next = {};
    for (const [categoryName, filtersForCategory] of entries) {
      if (filtersForCategory.length) {
        next[categoryName] = filtersForCategory;
      }
    }
    setShortcutFiltersByCategory(next);
  };

  const runAiRequestReview = async () => {
    if (!authToken || !user || aiRequestReviewLoading) return;
    setAiRequestReviewLoading(true);
    setAiRequestReviewError("");
    try {
      const payload = await apiRequest("/api/ai/validate-request", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: {
          selectedLocation: selectedRequestLocation,
          lines: cart.map((x) => ({
            productId: x.productId,
            model: x.model,
            grade: x.grade,
            quantity: Number(x.quantity),
            offerPrice: Number(x.offerPrice)
          }))
        }
      });
      setAiRequestReview(payload);
    } catch (error) {
      setAiRequestReview(null);
      setAiRequestReviewError(error.message || "AI request review failed.");
    } finally {
      setAiRequestReviewLoading(false);
    }
  };

  const applyAiRequestSuggestions = () => {
    if (!aiRequestReview || !Array.isArray(aiRequestReview.suggestions) || !aiRequestReview.suggestions.length) return;
    let next = [...cart];
    let appliedCount = 0;
    for (const item of aiRequestReview.suggestions) {
      const action = item?.action;
      if (!action || action.type !== "set_quantity") continue;
      const lineIndex = Number(action.lineIndex);
      if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= next.length) continue;
      const suggestedQuantity = Math.max(0, Math.floor(Number(action.suggestedQuantity || 0)));
      if (suggestedQuantity <= 0) {
        next = next.filter((_, idx) => idx !== lineIndex);
      } else {
        next = next.map((line, idx) => (idx === lineIndex ? { ...line, quantity: suggestedQuantity } : line));
      }
      appliedCount += 1;
    }
    if (!appliedCount) return;
    updateCart(next);
    setCartNotice(`Applied ${appliedCount} AI suggestion${appliedCount === 1 ? "" : "s"}.`);
    if (cartNoticeTimerRef.current) {
      clearTimeout(cartNoticeTimerRef.current);
    }
    cartNoticeTimerRef.current = setTimeout(() => {
      setCartNotice("");
    }, 2200);
    setAiRequestReview(null);
  };

  const applyCopilotAction = (action) => {
    if (!action || action.type !== "apply_filters") return;
    const payload = sanitizeFilterPayload(action.payload);
    if (payload.selectedCategory) {
      setSelectedCategory(payload.selectedCategory);
    }
    setSearch(payload.search || "");
    setFilters(payload.filters || {});
    setProductsView("category");
    setIsEditingSavedFilter(false);
    setEditingSavedFilterId(null);
    setNewSavedFilterName(String(action?.payload?.suggestedName || "AI Suggested Filter").slice(0, 80));
    setSavedFiltersError("");
    setCategoryPage(1);
  };

  useEffect(() => {
    if (!aiCopilotOpen) return;
    const node = aiCopilotFeedRef.current;
    if (!node) return;
    const frame = window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [aiCopilotOpen, aiCopilotMessages, aiCopilotLoading]);

  const runAiCopilot = async () => {
    if (!authToken || !user || aiCopilotLoading) return;
    const message = aiCopilotInput.trim();
    if (!message) {
      setAiCopilotError("Enter a message first.");
      return;
    }
    setAiCopilotLoading(true);
    setAiCopilotError("");
    setAiCopilotMessages((prev) => [...prev, { role: "user", text: message }]);
    setAiCopilotInput("");
    try {
      const payload = await apiRequest("/api/ai/copilot", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: {
          message,
          selectedCategory
        }
      });
      await new Promise((resolve) => {
        window.setTimeout(resolve, 650);
      });
      setAiCopilotMessages((prev) => [...prev, {
        role: "assistant",
        text: payload.reply || "I could not generate a response.",
        action: payload.action || null
      }]);
    } catch (error) {
      setAiCopilotError(error.message || "AI copilot failed.");
    } finally {
      setAiCopilotLoading(false);
    }
  };

  const loadAdminAiAnomalies = async () => {
    if (!authToken || !user || user.role !== "admin" || adminAiAnomaliesLoading) return;
    setAdminAiAnomaliesLoading(true);
    setAdminAiError("");
    try {
      const payload = await apiRequest("/api/ai/admin/anomalies", {
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      setAdminAiAnomalies(Array.isArray(payload?.anomalies) ? payload.anomalies : []);
    } catch (error) {
      setAdminAiError(error.message || "Failed to load anomalies.");
    } finally {
      setAdminAiAnomaliesLoading(false);
    }
  };

  const loadAdminAiInsights = async () => {
    if (!authToken || !user || user.role !== "admin" || adminAiInsightsLoading) return;
    setAdminAiInsightsLoading(true);
    setAdminAiError("");
    try {
      const payload = await apiRequest("/api/ai/admin/sales-insights?days=30", {
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      setAdminAiInsights(payload || null);
    } catch (error) {
      setAdminAiError(error.message || "Failed to load sales insights.");
    } finally {
      setAdminAiInsightsLoading(false);
    }
  };

  const activeEditedSavedFilter = editingSavedFilterId
    ? savedFilters.find((f) => String(f.id) === String(editingSavedFilterId)) || null
    : null;
  const currentFilterDraftPayload = sanitizeFilterPayload({
    selectedCategory,
    search,
    filters
  });
  const hasEditedFilterChanges = !!activeEditedSavedFilter && (
    newSavedFilterName.trim() !== String(activeEditedSavedFilter.name || "") ||
    JSON.stringify(currentFilterDraftPayload) !== JSON.stringify(sanitizeFilterPayload(activeEditedSavedFilter.payload))
  );

  const saveCurrentFilters = async () => {
    if (!authToken || !user || savingFilter) return;
    const name = newSavedFilterName.trim();
    if (!name) {
      setSavedFiltersError("Enter a name before saving.");
      return;
    }
    setSavingFilter(true);
    setSavedFiltersError("");
    try {
      const viewKey = categorySavedFilterViewKey(selectedCategory);
      if (isEditingSavedFilter && editingSavedFilterId && !hasEditedFilterChanges) {
        setSavedFilterNotice("No changes to update.");
        return;
      }
      const payload = (isEditingSavedFilter && editingSavedFilterId)
        ? await apiRequest(`/api/filters/saved/${encodeURIComponent(editingSavedFilterId)}`, {
          method: "PATCH",
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState,
          body: {
            name,
            viewKey,
            payload: currentFilterDraftPayload
          }
        })
        : await apiRequest("/api/filters/saved", {
          method: "POST",
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState,
          body: {
            name,
            viewKey,
            payload: currentFilterDraftPayload
          }
        });
      setSavedFilterNotice((isEditingSavedFilter && editingSavedFilterId) ? `Updated "${name}".` : `Saved "${name}".`);
      if (isEditingSavedFilter && editingSavedFilterId) {
        setEditingSavedFilterId(payload?.id || editingSavedFilterId || null);
        setNewSavedFilterName(payload?.name || name);
      } else {
        setEditingSavedFilterId(null);
        setIsEditingSavedFilter(false);
        setNewSavedFilterName("");
      }
      await Promise.all([refreshSavedFilters(), refreshShortcutFilters()]);
    } catch (error) {
      setSavedFiltersError(error.message || "Failed to save filter.");
    } finally {
      setSavingFilter(false);
    }
  };

  const applySavedFilter = (savedFilter) => {
    const payload = sanitizeFilterPayload(savedFilter?.payload);
    setProductsView("category");
    setSelectedCategory(payload.selectedCategory);
    setSearch(payload.search);
    setFilters(payload.filters);
    setCategoryPage(1);
    setIsEditingSavedFilter(false);
    setEditingSavedFilterId(null);
    setNewSavedFilterName("");
    setSavedFiltersError("");
    setSavedFilterNotice(`Applied "${savedFilter.name}".`);
  };

  const deleteSavedFilter = async (savedFilter) => {
    if (!authToken || !user) return;
    setSavedFiltersError("");
    try {
      const viewKey = categorySavedFilterViewKey(selectedCategory);
      await apiRequest(`/api/filters/saved/${encodeURIComponent(savedFilter.id)}?view=${encodeURIComponent(viewKey)}`, {
        method: "DELETE",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      if (String(editingSavedFilterId) === String(savedFilter.id)) {
        setEditingSavedFilterId(null);
        setIsEditingSavedFilter(false);
        setNewSavedFilterName("");
      }
      setSavedFilterNotice(`Deleted "${savedFilter.name}".`);
      await Promise.all([refreshSavedFilters(), refreshShortcutFilters()]);
    } catch (error) {
      setSavedFiltersError(error.message || "Failed to delete saved filter.");
    }
  };

  const imageFor = (p) => p.image || p.images?.[0] || categoryImagePlaceholders[p.category] || "";

  const addToCart = (p, qty, note, offerPriceOverride) => {
    const requestedOfferPrice = Number.isFinite(Number(offerPriceOverride)) ? Number(offerPriceOverride) : Number(p.price || 0);
    const existing = cart.find((i) => i.productId === p.id && i.note === note);
    let next = [...cart];
    if (existing) {
      next = next.map((i) => (i.id === existing.id
        ? { ...i, quantity: Math.min(9999, i.quantity + qty), offerPrice: requestedOfferPrice }
        : i));
    } else {
      next.push({ id: crypto.randomUUID(), productId: p.id, model: p.model, grade: p.grade, quantity: qty, offerPrice: requestedOfferPrice, note });
    }
    updateCart(next);
    setCartNotice(`${qty} x ${p.model} added to Requested items.`);
    if (cartNoticeTimerRef.current) {
      clearTimeout(cartNoticeTimerRef.current);
    }
    cartNoticeTimerRef.current = setTimeout(() => {
      setCartNotice("");
    }, 2200);
  };

  const openCategory = (c) => {
    setSelectedCategory(c);
    setProductsView("category");
    setSearch("");
    setFilters({});
    setExpandedFilters({});
    setIsEditingSavedFilter(false);
    setEditingSavedFilterId(null);
    setNewSavedFilterName("");
    setCategoryPage(1);
  };

  const submitRequest = async () => {
    if (!cart.length || !user) return;
    if (!selectedRequestLocation) {
      setRequestsError("Select an order location before submitting.");
      return;
    }
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
      const netsuitePayloadValidation = await apiRequest("/api/ai/validate-netsuite-payload", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: {
          payload: {
            requestId: "",
            requestNumber: "",
            company: user.company,
            currencyCode: "USD",
            lines
          }
        }
      });
      if (!netsuitePayloadValidation?.valid) {
        const firstError = Array.isArray(netsuitePayloadValidation.errors) && netsuitePayloadValidation.errors.length
          ? netsuitePayloadValidation.errors[0]
          : "NetSuite payload validation failed.";
        setRequestsError(firstError);
        return;
      }
      const created = await apiRequest("/api/requests", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { lines, preferredLocation: selectedRequestLocation }
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

  const adjustLineToLocationAvailability = (lineId, availableQty, model) => {
    const normalizedAvailable = Math.max(0, Math.floor(Number(availableQty || 0)));
    if (normalizedAvailable <= 0) {
      updateCart(cart.filter((i) => i.id !== lineId));
      setCartNotice(`${model} removed because selected location has no inventory.`);
      if (cartNoticeTimerRef.current) {
        clearTimeout(cartNoticeTimerRef.current);
      }
      cartNoticeTimerRef.current = setTimeout(() => {
        setCartNotice("");
      }, 2200);
      return;
    }
    updateCart(cart.map((i) => (i.id === lineId ? { ...i, quantity: normalizedAvailable } : i)));
    setCartNotice(`${model} quantity set to ${normalizedAvailable} for ${selectedRequestLocation}.`);
    if (cartNoticeTimerRef.current) {
      clearTimeout(cartNoticeTimerRef.current);
    }
    cartNoticeTimerRef.current = setTimeout(() => {
      setCartNotice("");
    }, 2200);
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

  const categories = categoryNames;
  const weeklySpecialDevices = products.filter((p) => p.weeklySpecial === true);
  const weeklySpecialAdminDevices = products
    .filter((p) => `${p.manufacturer} ${p.model}`.toLowerCase().includes(weeklySpecialSearch.toLowerCase()))
    .slice(0, 120);
  const source = products.filter((p) => p.category === selectedCategory);
  const fields = [{ key: "manufacturer", title: "Manufacturers" }, { key: "modelFamily", title: "Models" }, { key: "grade", title: "Grade" }, { key: "region", title: "Region / Location" }, { key: "storage", title: "Storage Capacity" }];
  const valuesForField = (device, fieldKey) => {
    if (fieldKey === "region") {
      if (Array.isArray(device.availableRegions) && device.availableRegions.length) {
        return device.availableRegions;
      }
      return device.region ? [device.region] : [];
    }
    const value = fieldKey === "modelFamily" ? (device.modelFamily || modelFamilyOf(device.model)) : device[fieldKey];
    return value ? [value] : [];
  };
  const matchesOtherFilters = (device, excludedField, activeFilters) => {
    for (const field of fields) {
      if (field.key === excludedField) continue;
      const selected = activeFilters[field.key] || [];
      if (!selected.length) continue;
      const values = valuesForField(device, field.key);
      if (!selected.some((entry) => values.includes(entry))) return false;
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
      const allValues = [...new Set(devices.flatMap((p) => valuesForField(p, field.key)))].sort((a, b) => String(a).localeCompare(String(b)));
      const enabledValues = new Set(
        devices
          .filter((p) => matchesOtherFilters(p, field.key, activeFilters))
          .flatMap((p) => valuesForField(p, field.key))
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
      const values = valuesForField(p, field.key);
      if (!selected.some((entry) => values.includes(entry))) return false;
    }
    return true;
  });
  const totalCategoryPages = Math.max(1, Math.ceil(categoryTotal / CATEGORY_PAGE_SIZE));
  const safeCategoryPage = Math.min(categoryPage, totalCategoryPages);
  const categoryStartIndex = (safeCategoryPage - 1) * CATEGORY_PAGE_SIZE;

  const filteredRequests = requests
    .filter((r) => requestStatusFilter === "All" || r.status === requestStatusFilter)
    .filter((r) => String(r.requestNumber || "").toLowerCase().includes(requestSearch.toLowerCase()));
  const productById = new Map(products.map((p) => [p.id, p]));
  const allRequestLocations = (() => {
    const names = new Set();
    for (const p of products) {
      const locations = p.locations && typeof p.locations === "object" ? Object.keys(p.locations) : [];
      for (const loc of locations) names.add(loc);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  })();
  const fullFulfillmentLocations = allRequestLocations.filter((locationName) => cart.every((line) => {
    const device = productById.get(line.productId);
    const available = Number(device?.locations?.[locationName] || 0);
    return Number(line.quantity || 0) <= available;
  }));
  const selectableRequestLocations = allowPartialRequestLocation ? allRequestLocations : fullFulfillmentLocations;
  const cartFulfillmentIssues = !selectedRequestLocation
    ? []
    : cart
      .map((line) => {
        const device = productById.get(line.productId);
        const requested = Number(line.quantity || 0);
        const available = Number(device?.locations?.[selectedRequestLocation] || 0);
        const shortage = Math.max(0, requested - available);
        return {
          id: line.id,
          productId: line.productId,
          model: line.model,
          requested,
          available,
          shortage
        };
      })
      .filter((row) => row.shortage > 0);
  const cartFulfillmentIssueByLineId = (() => {
    const map = new Map();
    for (const row of cartFulfillmentIssues) {
      map.set(row.id, row);
    }
    return map;
  })();
  const cartHasFulfillmentIssues = cartFulfillmentIssues.length > 0;
  const activeRequest = requests.find((r) => r.id === activeRequestId) || null;
  const modalImages = activeProduct ? (activeProduct.images?.length ? activeProduct.images : [imageFor(activeProduct)]) : [];
  const canCarousel = modalImages.length > 1;
  const activeModalImage = modalImages[activeImageIndex] || modalImages[0] || "";
  const modalProductUnavailable = activeProduct ? activeProduct.available < 1 : false;
  const modalOfferPriceInvalid = productOfferPrice === "" || Number(productOfferPrice) < 0;
  const modalQtyInvalid = productQty === "" || !Number.isFinite(Number(productQty)) || Number(productQty) < 1;
  const showSessionWarning = Boolean(user && sessionTimeLeftMs !== null && sessionTimeLeftMs > 0 && sessionTimeLeftMs <= SESSION_WARNING_MS);
  const sessionSecondsLeft = showSessionWarning ? Math.max(0, Math.ceil(sessionTimeLeftMs / 1000)) : 0;
  const sessionCountdown = showSessionWarning
    ? `${Math.floor(sessionSecondsLeft / 60)}:${String(sessionSecondsLeft % 60).padStart(2, "0")}`
    : "0:00";
  const shortcutEntries = categories.flatMap((categoryName) =>
    (shortcutFiltersByCategory[categoryName] || []).map((savedFilter) => ({
      categoryName,
      savedFilter
    }))
  );

  const openSavedFilterShortcut = (categoryName, savedFilter) => {
    const payload = sanitizeFilterPayload(savedFilter?.payload);
    setRoute("products");
    setProductsView("category");
    setSelectedCategory(categoryName);
    setSearch(payload.search);
    setFilters(payload.filters);
    setCategoryPage(1);
    setIsEditingSavedFilter(false);
    setEditingSavedFilterId(null);
    setNewSavedFilterName("");
    setSavedFiltersError("");
    setSavedFilterNotice(`Applied "${savedFilter.name}".`);
  };

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
          <div className="brand-wrap"><span className="dot" /><strong>PCS Wireless</strong></div>
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
              {shortcutEntries.length ? (
                <section className="panel shortcuts-panel">
                  <div className="category-header">
                    <h2 style={{ margin: 0, fontSize: "1.7rem", fontWeight: 500 }}>Favorites</h2>
                    <p className="small" style={{ margin: 0 }}>Saved filters</p>
                  </div>
                  <div className="shortcut-chips">
                    {shortcutEntries.map(({ categoryName, savedFilter }) => (
                      <button
                        key={`shortcut-${categoryName}-${savedFilter.id}`}
                        type="button"
                        className="shortcut-chip"
                        title={`${categoryName} | ${savedFilter.name}`}
                        onClick={() => openSavedFilterShortcut(categoryName, savedFilter)}
                      >
                        {categoryName} | {savedFilter.name}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
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
                  <div className="saved-filters-box">
                    <div className="saved-filters-form">
                      <input
                        className="saved-filter-input"
                        value={newSavedFilterName}
                        onChange={(e) => setNewSavedFilterName(e.target.value)}
                        placeholder="Save current filters as..."
                        maxLength={80}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveCurrentFilters();
                          }
                        }}
                      />
                      <button type="button" className="saved-filter-save-btn" disabled={savingFilter} onClick={saveCurrentFilters}>
                        {savingFilter ? (isEditingSavedFilter && editingSavedFilterId ? "Updating..." : "Saving...") : (isEditingSavedFilter && editingSavedFilterId ? "Update" : "Save")}
                      </button>
                      {isEditingSavedFilter && editingSavedFilterId ? (
                        <button
                          type="button"
                          className="saved-filter-cancel-btn"
                          onClick={() => {
                            setEditingSavedFilterId(null);
                            setIsEditingSavedFilter(false);
                            setNewSavedFilterName("");
                            setSavedFiltersError("");
                          }}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                    {isEditingSavedFilter && editingSavedFilterId ? <div className="small">Editing selected filter. Change filters/name and click Update.</div> : null}
                    {savedFilterNotice ? <div className="saved-filter-notice">{savedFilterNotice}</div> : null}
                    {savedFiltersError ? <div className="saved-filter-error">{savedFiltersError}</div> : null}
                    <div className="saved-filter-list">
                      {savedFiltersLoading ? (
                        <div className="small">Loading saved filters...</div>
                      ) : savedFilters.length ? (
                        savedFilters.map((saved) => (
                          <div key={saved.id} className="saved-filter-item">
                            <button
                              type="button"
                              className={`saved-filter-apply-btn${isEditingSavedFilter && String(editingSavedFilterId) === String(saved.id) ? " active" : ""}`}
                              title={saved.name}
                              onClick={() => applySavedFilter(saved)}
                            >
                              {saved.name}
                            </button>
                            <div className="saved-filter-item-actions">
                              <button
                                type="button"
                                className="saved-filter-edit-btn"
                                aria-label={`Edit ${saved.name}`}
                                title="Edit filter"
                                onClick={() => {
                                  setIsEditingSavedFilter(true);
                                  setEditingSavedFilterId(saved.id);
                                  setNewSavedFilterName(saved.name);
                                  setSavedFilterNotice(`Editing "${saved.name}".`);
                                  setSavedFiltersError("");
                                }}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M4 20h4l10-10-4-4L4 16v4zm12.7-12.3 1.6-1.6a1.1 1.1 0 0 1 1.6 0l1 1a1.1 1.1 0 0 1 0 1.6l-1.6 1.6-2.6-2.6z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="saved-filter-delete-btn"
                                aria-label={`Delete ${saved.name}`}
                                title="Delete filter"
                                onClick={() => deleteSavedFilter(saved)}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M8 4h8l1 2h4v2H3V6h4l1-2zm1 6h2v8H9v-8zm4 0h2v8h-2v-8zM7 10h2v8H7v-8zm0 10h10a2 2 0 0 0 2-2V8H5v10a2 2 0 0 0 2 2z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="small">No saved filters yet.</div>
                      )}
                    </div>
                  </div>
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
                <table className="table"><thead><tr><th>Request #</th><th>Status</th><th>Created</th><th>Total</th><th /></tr></thead><tbody>{requestsLoading ? <tr><td colSpan={5} className="small">Loading requests...</td></tr> : filteredRequests.length ? filteredRequests.map((r) => <tr key={r.id}><td>{r.requestNumber}</td><td>{r.status}</td><td>{new Date(r.createdAt).toLocaleString()}</td><td>{formatUsd(r.total)}</td><td><button className="ghost-btn" onClick={() => setActiveRequestId(r.id)}>View</button></td></tr>) : <tr><td colSpan={5} className="small">No requests found.</td></tr>}</tbody></table>
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
                    <table className="table"><thead><tr><th>Product</th><th>Grade</th><th>Qty</th><th>Offer</th><th>Total</th></tr></thead><tbody>{activeRequest.lines.map((l, i) => <tr key={`${l.productId}-${i}`}><td>{l.model}</td><td>{l.grade}</td><td>{l.quantity}</td><td>{formatUsd(l.offerPrice)}</td><td>{formatUsd(Number(l.quantity || 0) * Number(l.offerPrice || 0))}</td></tr>)}</tbody></table>
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
                <h3 style={{ margin: "0 0 8px" }}>AI Operations Insights</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" style={{ width: "auto" }} onClick={loadAdminAiAnomalies} disabled={adminAiAnomaliesLoading}>
                    {adminAiAnomaliesLoading ? "Scanning..." : "Run Anomaly Scan"}
                  </button>
                  <button type="button" style={{ width: "auto" }} onClick={loadAdminAiInsights} disabled={adminAiInsightsLoading}>
                    {adminAiInsightsLoading ? "Generating..." : "Generate 30d Sales Insights"}
                  </button>
                </div>
                {adminAiError ? <p className="small" style={{ marginTop: 8, color: "#b91c1c" }}>{adminAiError}</p> : null}
                {adminAiAnomalies.length ? (
                  <div className="small" style={{ marginTop: 8 }}>
                    {adminAiAnomalies.slice(0, 8).map((item, idx) => (
                      <div key={`ai-anomaly-${idx}`}>- [{String(item.severity || "info").toUpperCase()}] {item.message}</div>
                    ))}
                  </div>
                ) : null}
                {adminAiInsights ? (
                  <div className="small" style={{ marginTop: 8 }}>
                    <div><strong>Requests ({adminAiInsights.rangeDays}d):</strong> {Number(adminAiInsights.requestCount || 0)}</div>
                    <div><strong>Total Revenue:</strong> {formatUsd(adminAiInsights.totalRevenue || 0)}</div>
                    {Array.isArray(adminAiInsights.byStatus) && adminAiInsights.byStatus.length ? (
                      <div style={{ marginTop: 4 }}>
                        <strong>Status Mix:</strong> {adminAiInsights.byStatus.map((s) => `${s.status}: ${s.count}`).join(", ")}
                      </div>
                    ) : null}
                    {Array.isArray(adminAiInsights.topModels) && adminAiInsights.topModels.length ? (
                      <div style={{ marginTop: 4 }}>
                        <strong>Top Models:</strong> {adminAiInsights.topModels.map((m) => `${m.model} (${m.quantity})`).join(", ")}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
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

      {route === "products" ? (
        <button className="request-btn request-btn-floating" onClick={() => setCartOpen(true)}>
          Requested items ({cart.length})
        </button>
      ) : null}

      <div className={`ai-chatbot ${aiCopilotOpen ? "open" : "closed"}`}>
        {aiCopilotOpen ? (
          <div className="ai-chatbot-panel">
            <div className="ai-chatbot-head">
              <div className="ai-chatbot-head-title">
                <span className="ai-chatbot-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="img" focusable="false">
                    <path d="M4.75 4.5h14.5a2.25 2.25 0 0 1 2.25 2.25v8.5a2.25 2.25 0 0 1-2.25 2.25h-8.39l-4.58 3.4c-.57.43-1.39.02-1.39-.69V17.5H4.75A2.25 2.25 0 0 1 2.5 15.25v-8.5A2.25 2.25 0 0 1 4.75 4.5zm2.1 4.5a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.15 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.15 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z" />
                  </svg>
                </span>
                <div className="small">Available across the app</div>
              </div>
              <button type="button" className="ghost-btn" style={{ width: "auto" }} onClick={() => setAiCopilotOpen(false)}>Minimize</button>
            </div>
            <div className="ai-copilot-feed" ref={aiCopilotFeedRef}>
              {aiCopilotMessages.length ? aiCopilotMessages.slice(-10).map((message, idx) => (
                <div key={`copilot-msg-global-${idx}`} className={`ai-copilot-msg ${message.role}`}>
                  <div>{message.text}</div>
                  {message.role === "assistant" && message.action?.type === "apply_filters" ? (
                    <button type="button" className="ghost-btn" style={{ width: "auto", marginTop: 6 }} onClick={() => applyCopilotAction(message.action)}>
                      Apply Suggested Filters
                    </button>
                  ) : null}
                </div>
              )) : (
                <div className="small">Try: "Find Apple CPO in Miami 128GB".</div>
              )}
              {aiCopilotLoading ? (
                <div className="ai-copilot-msg assistant typing">
                  <span>Writing</span>
                  <span className="ai-typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              ) : null}
            </div>
            <div className="saved-filters-form" style={{ marginTop: 8 }}>
              <input
                className="saved-filter-input"
                value={aiCopilotInput}
                onChange={(e) => setAiCopilotInput(e.target.value)}
                placeholder="Ask AI Copilot..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runAiCopilot();
                  }
                }}
              />
              <button type="button" className="saved-filter-save-btn" onClick={runAiCopilot} disabled={aiCopilotLoading}>
                {aiCopilotLoading ? "Thinking..." : "Send"}
              </button>
            </div>
            {aiCopilotError ? <div className="saved-filter-error">{aiCopilotError}</div> : null}
          </div>
        ) : (
          <button type="button" className="ai-chatbot-toggle" onClick={() => setAiCopilotOpen(true)} aria-label="Open AI chatbot">
            <span className="ai-chatbot-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img" focusable="false">
                <path d="M4.75 4.5h14.5a2.25 2.25 0 0 1 2.25 2.25v8.5a2.25 2.25 0 0 1-2.25 2.25h-8.39l-4.58 3.4c-.57.43-1.39.02-1.39-.69V17.5H4.75A2.25 2.25 0 0 1 2.5 15.25v-8.5A2.25 2.25 0 0 1 4.75 4.5zm2.1 4.5a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.15 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.15 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z" />
              </svg>
            </span>
          </button>
        )}
      </div>

      {cartNotice ? (
        <div
          style={{
            position: "fixed",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1400,
            background: "#14532d",
            color: "#fff",
            border: "2px solid #bbf7d0",
            padding: "14px 20px",
            borderRadius: 12,
            boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
            fontSize: "1.02rem",
            fontWeight: 600,
            textAlign: "center",
            minWidth: 360,
            maxWidth: "min(92vw, 760px)"
          }}
        >
          {cartNotice}
        </div>
      ) : null}

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
            <div className="modal-head"><div><p className="small" style={{ margin: 0 }}>{activeProduct.manufacturer.toUpperCase()}</p><h3 style={{ margin: "2px 0", fontSize: "2rem" }}>{activeProduct.model}</h3><div style={{ fontSize: "2rem", fontWeight: 700 }}>{formatUsd(activeProduct.price)}</div></div><button className="close-btn" onClick={() => setActiveProduct(null)}>X</button></div>
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
                <div className="modal-box" style={{ background: "#eef9f3", marginTop: modalProductUnavailable ? 10 : 0 }}><h4 style={{ marginTop: 0 }}>Availability</h4><p className="small">Total across all locations <strong>{activeProduct.availableDisplay || activeProduct.available}</strong></p><table className="table"><tbody>{Object.entries(activeProduct.locations).map(([loc, q]) => <tr key={loc}><td>{loc}</td><td>{activeProduct.locationDisplay?.[loc] || q}</td></tr>)}</tbody></table></div>
                <div className="modal-box" style={{ marginTop: 10 }}>
                  <h4 style={{ marginTop: 0 }}>Product notes</h4>
                  <p className="small" style={{ margin: 0 }}>{activeProduct.productNotes || "No notes provided."}</p>
                </div>
                <div className="modal-box" style={{ marginTop: 10 }}><h4 style={{ marginTop: 0 }}>Create request for this product</h4><label>Quantity</label><div className="qty-control"><input type="number" min="1" max={Math.max(1, activeProduct.available)} value={productQty} onChange={(e) => setProductQty(e.target.value === "" ? "" : e.target.value)} onBlur={(e) => setProductQty(Math.max(1, Math.min(9999, Math.floor(Number(e.target.value || productQty || 1)))))} /><button type="button" onClick={() => setProductQty((v) => Math.min(9999, Math.max(1, Math.floor(Number(v || 0) + 1))))} disabled={modalProductUnavailable}>+</button><button type="button" onClick={() => setProductQty((v) => Math.max(1, Math.min(9999, Math.floor(Number(v || 1) - 1))))} disabled={modalProductUnavailable}>-</button></div><label>Request price</label><input type="number" min="0" step="0.01" value={productOfferPrice} onChange={(e) => setProductOfferPrice(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Set request price" /><label>Additional request note (optional)</label><input value={productNote} onChange={(e) => setProductNote(e.target.value)} placeholder="Write note" /><button style={{ marginTop: 10 }} disabled={modalProductUnavailable || modalOfferPriceInvalid || modalQtyInvalid} onClick={() => { addToCart(activeProduct, Math.max(1, Math.min(9999, Math.floor(Number(productQty || 1)))), productNote.trim(), Number(productOfferPrice)); setActiveProduct(null); setProductQty(1); setProductOfferPrice(0); setProductNote(""); }}>Add to request</button></div>
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
                    const fulfillmentIssue = cartFulfillmentIssueByLineId.get(r.id);
                    return (
                      <tr key={r.id}>
                        <td className="cart-col-name" title={r.model}>
                          {r.model}
                          {fulfillmentIssue ? (
                            <div className="small cart-line-warning">
                              <div>Only {fulfillmentIssue.available} available at {selectedRequestLocation}. Reduce by {fulfillmentIssue.shortage}.</div>
                              <button
                                type="button"
                                className="cart-line-fix-link"
                                onClick={() => adjustLineToLocationAvailability(r.id, fulfillmentIssue.available, r.model)}
                              >
                                Set qty to {fulfillmentIssue.available}
                              </button>
                            </div>
                          ) : null}
                        </td>
                        <td className="cart-col-grade">{r.grade}</td>
                        <td className="cart-col-offer"><input className="cart-input" type="number" min="0" step="0.01" value={r.offerPrice} onChange={(e) => updateCart(cart.map((i) => i.id === r.id ? { ...i, offerPrice: e.target.value === "" ? "" : Number(e.target.value) } : i))} /></td>
                        <td className="cart-col-qty"><input className="cart-input" type="number" min="1" max="9999" value={r.quantity} onChange={(e) => updateCart(cart.map((i) => i.id === r.id ? { ...i, quantity: e.target.value === "" ? "" : e.target.value } : i))} onBlur={(e) => updateCart(cart.map((i) => { if (i.id !== r.id) return i; const normalized = Math.max(1, Math.min(9999, Math.floor(Number(e.target.value || i.quantity || 1)))); return { ...i, quantity: normalized }; }))} /></td>
                        <td className="cart-col-total">{formatUsd(lineTotal)}</td>
                        <td className="cart-col-action">
                          <button
                            className="delete-btn cart-delete-btn"
                            aria-label={`Remove ${r.model} from requested items`}
                            title="Remove item"
                            onClick={() => updateCart(cart.filter((i) => i.id !== r.id))}
                          >
                            <TrashIcon />
                          </button>
                        </td>
                      </tr>
                    );
                  }) : <tr><td colSpan={6} className="small">No requested items yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="cart-location-panel">
              <label className="cart-location-label">Order location</label>
              <select
                className="cart-location-select"
                value={selectedRequestLocation}
                onChange={(e) => setSelectedRequestLocation(e.target.value)}
                disabled={!selectableRequestLocations.length}
              >
                <option value="">Select location</option>
                {selectableRequestLocations.map((locationName) => {
                  const isPartialOnly = !fullFulfillmentLocations.includes(locationName);
                  const label = allowPartialRequestLocation && isPartialOnly
                    ? `${locationName} (Partial)`
                    : locationName;
                  return <option key={`req-location-${locationName}`} value={locationName}>{label}</option>;
                })}
              </select>
              <label className="small cart-location-toggle">
                <input
                  type="checkbox"
                  checked={allowPartialRequestLocation}
                  onChange={(e) => setAllowPartialRequestLocation(e.target.checked)}
                />
                Show locations that cannot fully fulfill this order
              </label>
              <div style={{ marginTop: 8 }}>
                <button type="button" className="ghost-btn" style={{ width: "auto" }} onClick={runAiRequestReview} disabled={aiRequestReviewLoading || !cart.length}>
                  {aiRequestReviewLoading ? "Reviewing..." : "AI Review Request"}
                </button>
                {aiRequestReview?.suggestions?.some((item) => item?.action?.type === "set_quantity") ? (
                  <button type="button" className="ghost-btn" style={{ width: "auto", marginLeft: 8 }} onClick={applyAiRequestSuggestions}>
                    Apply AI Suggestions
                  </button>
                ) : null}
              </div>
              {!allowPartialRequestLocation && cart.length > 0 && !fullFulfillmentLocations.length ? (
                <p className="small cart-location-warning">
                  No single location can fully fulfill this request. Enable partial locations to inspect shortages.
                </p>
              ) : null}
              {selectedRequestLocation && cartHasFulfillmentIssues ? (
                <p className="small cart-location-warning">
                  Some items cannot be fully fulfilled at {selectedRequestLocation}. Adjust quantities before submitting.
                </p>
              ) : null}
              {aiRequestReviewError ? <p className="small cart-location-warning">{aiRequestReviewError}</p> : null}
              {aiRequestReview?.warnings?.length ? (
                <div className="small cart-location-warning" style={{ marginTop: 6 }}>
                  {aiRequestReview.warnings.slice(0, 4).map((warning, idx) => (
                    <div key={`ai-warning-${idx}`}>- {warning.message || String(warning)}</div>
                  ))}
                </div>
              ) : null}
              {aiRequestReview?.suggestions?.length ? (
                <div className="small" style={{ marginTop: 6, color: "#1d4ed8" }}>
                  {aiRequestReview.suggestions.slice(0, 4).map((item, idx) => (
                    <div key={`ai-suggestion-${idx}`}>- {item.message || String(item)}</div>
                  ))}
                </div>
              ) : null}
              {aiRequestReview?.inventorySource ? (
                <p className="small" style={{ marginTop: 6 }}>Inventory source: {String(aiRequestReview.inventorySource).toUpperCase()}</p>
              ) : null}
            </div>
            <div className="cart-footer"><div className="cart-grand-total"><div className="cart-grand-total-label">Grand Total</div><div className="cart-grand-total-value">{formatUsd(cart.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.offerPrice || 0), 0))}</div><div className="small">{cart.reduce((s, i) => s + Number(i.quantity || 0), 0)} units</div></div><div className="cart-actions"><button className="delete-btn" onClick={() => updateCart([])} disabled={requestSubmitLoading}>Remove all</button><button className="submit-btn" disabled={requestSubmitLoading || !selectedRequestLocation || cartHasFulfillmentIssues || !cart.length || !cart.every((i) => i.offerPrice !== "" && Number(i.quantity) >= 1 && Number(i.offerPrice) >= 0)} onClick={submitRequest}>{requestSubmitLoading ? "Submitting..." : "Submit request"}</button></div></div>
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 7h16" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 7V5h6v2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 7l1 12h8l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 11v5M14 11v5" fill="none" stroke="currentColor" strokeWidth="1.8" />
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
  const availableDisplay = p.availableDisplay || String(p.available || 0);
  return (
    <article className="card product-card">
      <div className="thumb product-thumb" onClick={() => onOpen(p)}><ImageWithFallback src={image} alt={p.model} /></div>
      <div className="brand product-brand">{p.manufacturer}</div>
      <div className="name product-name" onClick={() => onOpen(p)}>{p.model}</div>
      <div className="price">${cardPrice}</div>
      <div className="product-meta">Device Grade {p.grade}</div>
      <div className={`avail ${unavailable ? "bad" : "ok"}`}>{unavailable ? "Currently not available" : `${availableDisplay} items available`}</div>
      <button className="add-btn" disabled={unavailable} onClick={() => onAdd(p, 1, "")}>Add to request</button>
    </article>
  );
}
