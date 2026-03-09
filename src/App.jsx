import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";

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
  { key: "dashboard", label: "Dashboard", icon: "dashboard" },
  { key: "products", label: "Products", icon: "phone" },
  { key: "requests", label: "Requests", icon: "R" }
];

const CATEGORY_ORDER = ["Smartphones", "Tablets", "Laptops", "Wearables", "Accessories"];
const CATEGORY_PAGE_SIZE = 40;
const INVENTORY_DISPLAY_CAP = 100;
const ALL_CATEGORIES_KEY = "__ALL__";
const ALL_CATEGORIES_LABEL = "All Categories";
const KNOWN_BROKEN_IMAGE_URL_PATTERNS = [
  /p3-ofp\.static\.pub\/fes\/cms\/\d{4}\/\d{2}\/\d{2}\//i,
  /images\.samsung\.com\/is\/image\/samsung\/.+\?\$216_216_PNG\$/i
];
const DIALOG_FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']"
].join(",");
const dialogA11yStack = [];
const getSpeechRecognitionCtor = () => {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

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

function normalizeUserRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin" || role === "buyer" || role === "sales_rep") return role;
  return "buyer";
}

function userRoleLabel(value) {
  const role = normalizeUserRole(value);
  if (role === "admin") return "Admin";
  if (role === "sales_rep") return "Sales Rep";
  return "Buyer";
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const chatTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit"
});

function formatUsd(value) {
  return usdFormatter.format(Number(value || 0));
}

function normalizeChatTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatChatTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return chatTimeFormatter.format(parsed);
}

function formatDurationMs(value) {
  const ms = Math.max(0, Number(value || 0));
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  return `${mins}m ${String(seconds).padStart(2, "0")}s`;
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

function totalInventoryDisplayFromLocations(rawLocations) {
  const quantities = Object.values(rawLocations || {}).map((qty) => normalizeInventoryQuantity(qty));
  const rawTotal = quantities.reduce((sum, qty) => sum + qty, 0);
  if (rawTotal > INVENTORY_DISPLAY_CAP) {
    const cappedTotal = Math.floor(rawTotal / INVENTORY_DISPLAY_CAP) * INVENTORY_DISPLAY_CAP;
    return {
      available: cappedTotal,
      availableDisplay: `${cappedTotal}+`
    };
  }
  return { available: rawTotal, availableDisplay: String(rawTotal) };
}

function sanitizeDeviceImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (KNOWN_BROKEN_IMAGE_URL_PATTERNS.some((pattern) => pattern.test(raw))) return "";
  return raw;
}

function registerDialogLayer(layerId) {
  dialogA11yStack.push(layerId);
  return () => {
    const idx = dialogA11yStack.lastIndexOf(layerId);
    if (idx >= 0) dialogA11yStack.splice(idx, 1);
  };
}

function isTopDialogLayer(layerId) {
  return dialogA11yStack.length > 0 && dialogA11yStack[dialogA11yStack.length - 1] === layerId;
}

function getFocusableDialogElements(dialogEl) {
  if (!dialogEl) return [];
  return Array.from(dialogEl.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR))
    .filter((node) => node instanceof HTMLElement)
    .filter((node) => !node.hasAttribute("disabled") && node.getAttribute("aria-hidden") !== "true");
}

function useDialogA11y({ isOpen, dialogRef, onClose, closeOnEscape = true }) {
  const layerIdRef = useRef(null);
  if (layerIdRef.current === null) layerIdRef.current = Symbol("dialog-layer");

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;
    const dialogEl = dialogRef?.current;
    if (!dialogEl) return undefined;

    const unregisterLayer = registerDialogLayer(layerIdRef.current);
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = getFocusableDialogElements(dialogEl);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      if (!dialogEl.hasAttribute("tabindex")) dialogEl.setAttribute("tabindex", "-1");
      dialogEl.focus();
    }

    const handleKeyDown = (event) => {
      if (!isTopDialogLayer(layerIdRef.current)) return;
      if (event.key === "Escape") {
        if (closeOnEscape && typeof onClose === "function") {
          event.preventDefault();
          onClose();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const dialogFocusables = getFocusableDialogElements(dialogEl);
      if (!dialogFocusables.length) {
        event.preventDefault();
        dialogEl.focus();
        return;
      }
      const first = dialogFocusables[0];
      const last = dialogFocusables[dialogFocusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !dialogEl.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last || !dialogEl.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      unregisterLayer();
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, dialogRef, onClose, closeOnEscape]);
}

function normalizeDevice(p) {
  const images = Array.isArray(p.images) ? p.images.map((image) => sanitizeDeviceImageUrl(image)).filter(Boolean) : [];
  const primaryImage = sanitizeDeviceImageUrl(p.image);
  const fallbackImage = primaryImage || (images.length ? images[0] : "");
  const rawLocations = p.locations && typeof p.locations === "object" ? p.locations : {};
  const locations = {};
  const locationDisplay = {};
  for (const [name, qty] of Object.entries(rawLocations)) {
    locations[name] = capInventoryQuantity(qty);
    locationDisplay[name] = inventoryDisplayValue(qty);
  }
  const hasLocations = Object.keys(rawLocations).length > 0;
  const totalInventory = hasLocations
    ? totalInventoryDisplayFromLocations(rawLocations)
    : {
      available: capInventoryQuantity(p.available),
      availableDisplay: inventoryDisplayValue(p.available)
    };
  const available = totalInventory.available;
  const availableDisplay = totalInventory.availableDisplay;
  const availableRegions = Object.entries(locations)
    .filter(([, qty]) => Number(qty || 0) > 0)
    .map(([name]) => name)
    .sort((a, b) => String(a).localeCompare(String(b)));
  return {
    ...p,
    modelFamily: p.modelFamily || modelFamilyOf(p.model),
    image: fallbackImage,
    images: images.length ? images : (fallbackImage ? [fallbackImage] : []),
    carrier: p.carrier || "N/A",
    screenSize: p.screenSize || "N/A",
    modular: p.modular || "N/A",
    color: p.color || "N/A",
    kitType: p.kitType || "N/A",
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
const DEMO_USERS_KEY = "pcs.demo.users";
const DEMO_SESSIONS_KEY = "pcs.demo.sessions";
const DEMO_REFRESH_TOKENS_KEY = "pcs.demo.refreshTokens";
const DEMO_SALES_REP_ASSIGNMENTS_KEY = "pcs.demo.salesRepAssignments";
const DEMO_ACCESS_TTL_MS = 30 * 60 * 1000;
const DEMO_REFRESH_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_WARNING_MS = 5 * 60 * 1000;
const DEMO_WEEKLY_BANNER_KEY = "pcs.demo.weeklySpecialBanner";
const DEMO_WEEKLY_FLAGS_KEY = "pcs.demo.weeklySpecialFlags";
const UI_VIEW_STATE_KEY = "pcs.ui.viewState";
const AI_COPILOT_STATE_KEY_PREFIX = "pcs.aiCopilot.";
const AUTH0_LOGOUT_MARKER_KEY = "pcs.auth0.logoutRequestedAt";
const AUTH0_LOGOUT_MARKER_TTL_MS = 2 * 60 * 1000;
const AUTH0_INTERACTIVE_LOGIN_KEY = "pcs.auth0.interactiveLoginPending";
const AUTH0_INTERACTIVE_LOGIN_TTL_MS = 10 * 60 * 1000;
const AI_COPILOT_DEFAULT_PANEL_HEIGHT = 360;
const DEFAULT_DEMO_BUYER_EMAIL = "ekrem.ersayin@pcsww.com";
const DEFAULT_DEMO_BUYER_COMPANY = "PCSWW";
const DEFAULT_DEMO_BUYER_PASSWORD = "TestPassword123!";
const DEMO_REQUESTS_PREFIX = "pcs.demo.requests.";
const DEMO_SAVED_FILTERS_PREFIX = "pcs.demo.savedFilters.";
const DEMO_CART_DRAFTS_PREFIX = "pcs.demo.cartDrafts.";
const DEMO_CART_ACTIVITY_PREFIX = "pcs.demo.cartActivity.";
const AI_COPILOT_TOPICS = new Set(["general", "product_discovery", "weekly_specials", "order_history", "requested_items", "fulfillment", "pricing"]);
const FILTER_FIELD_KEYS = ["manufacturer", "modelFamily", "grade", "region", "storage"];
const GRADE_DEFINITIONS = [
  {
    code: "C2",
    title: "Cosmetic Category C2",
    summary: "Heavy cosmetic wear and/or visible damage, typically including deep scratches and chips.",
    details: "Based on common secondary-market interpretations of REC/CTIA cosmetic mappings. Confirm acceptance thresholds with your internal QA SOP.",
    source: "CTIA Wireless Device Grading Scales v5.0 (REC mapping context)"
  },
  {
    code: "C4",
    title: "Cosmetic Category C4",
    summary: "Fair condition with significant cosmetic wear, but generally not severe structural breakage.",
    details: "Commonly treated as lower resale cosmetic quality. Exact defect limits vary by trading partner.",
    source: "CTIA Wireless Device Grading Scales v5.0 (REC mapping context)"
  },
  {
    code: "C5",
    title: "Cosmetic Category C5",
    summary: "Good/used condition with visible but moderate wear and tear.",
    details: "Often accepted for value-tier resale where cosmetic perfection is not required.",
    source: "CTIA Wireless Device Grading Scales v5.0 (REC mapping context)"
  },
  {
    code: "C6",
    title: "Cosmetic Category C6",
    summary: "Very good to like-new cosmetic appearance with light wear.",
    details: "Frequently mapped near top cosmetic classes in secondary markets, depending on strictness.",
    source: "CTIA Wireless Device Grading Scales v5.0 (REC mapping context)"
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
    source: "Common industry usage (CPO programs)"
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
    details: "Often used operationally before a final cosmetic/functional grade is assigned. Confirm your internal workflow definition.",
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
const GRADE_DEFINITION_BY_CODE = new Map(GRADE_DEFINITIONS.map((item) => [item.code.toUpperCase(), item]));

function normalizeGradeCode(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function isGradeDefinitionQuestion(messageRaw) {
  const text = String(messageRaw || "").toLowerCase();
  if (!text) return false;
  if (/(grade|grading|condition|cpo|open box|c2|c4|c5|c6|cob|crc|crd|crx|d2|d3|d4|md a|md b|tbg|tbg fin|tbg2)/.test(text)) return true;
  return false;
}

function buildGradeDefinitionReply(messageRaw) {
  const text = String(messageRaw || "").toLowerCase();
  const matches = GRADE_DEFINITIONS.filter((item) => {
    const code = item.code.toLowerCase();
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
        loginCount: 0,
        lastLoginAt: null,
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
      loginCount: 0,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      resetCode: null,
      resetCodeExpiresAt: null
    });
  }
  users = users.map((u) => ({
    ...u,
    loginCount: Math.max(0, Number(u.loginCount || 0)),
    lastLoginAt: u.lastLoginAt || null
  }));
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

function getDemoSalesRepAssignments() {
  const raw = readJson(localStorage, DEMO_SALES_REP_ASSIGNMENTS_KEY, {});
  return raw && typeof raw === "object" ? raw : {};
}

function setDemoSalesRepAssignments(assignments) {
  const safe = assignments && typeof assignments === "object" ? assignments : {};
  writeJson(localStorage, DEMO_SALES_REP_ASSIGNMENTS_KEY, safe);
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

function demoCartDraftsKey(userId) {
  return `${DEMO_CART_DRAFTS_PREFIX}${Number(userId || 0)}`;
}

function getDemoCartDraft(userId) {
  return readJson(localStorage, demoCartDraftsKey(userId), null);
}

function setDemoCartDraft(userId, draft) {
  writeJson(localStorage, demoCartDraftsKey(userId), draft);
}

function demoCartActivityKey(userId) {
  return `${DEMO_CART_ACTIVITY_PREFIX}${Number(userId || 0)}`;
}

function getDemoCartActivity(userId) {
  return readJson(localStorage, demoCartActivityKey(userId), []);
}

function setDemoCartActivity(userId, rows) {
  writeJson(localStorage, demoCartActivityKey(userId), Array.isArray(rows) ? rows : []);
}

function demoCartLineKey(line) {
  return [
    String(line?.productId || line?.deviceId || "").trim().toLowerCase(),
    String(line?.model || "").trim().toLowerCase(),
    String(line?.grade || "").trim().toLowerCase(),
    String(line?.note || "").trim().toLowerCase()
  ].join("|");
}

function computeDemoCartAddedEvents(previousLines, nextLines) {
  const previous = Array.isArray(previousLines) ? previousLines : [];
  const next = Array.isArray(nextLines) ? nextLines : [];
  const prevMap = new Map();
  for (const line of previous) prevMap.set(demoCartLineKey(line), line);
  const events = [];
  for (const line of next) {
    const prev = prevMap.get(demoCartLineKey(line));
    const nextQty = Math.max(0, Math.floor(Number(line.quantity || 0)));
    const prevQty = prev ? Math.max(0, Math.floor(Number(prev.quantity || 0))) : 0;
    const deltaQty = !prev ? nextQty : Math.max(0, nextQty - prevQty);
    if (deltaQty < 1) continue;
    events.push({
      id: crypto.randomUUID(),
      productId: String(line.productId || line.deviceId || "").trim(),
      model: String(line.model || "").trim(),
      grade: String(line.grade || "").trim(),
      quantity: deltaQty,
      offerPrice: Number(line.offerPrice || 0),
      note: String(line.note || "").trim(),
      addedAt: new Date().toISOString(),
      everRequested: false
    });
  }
  return events;
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
  const selectedCategory = String(input.selectedCategory || "").trim() || ALL_CATEGORIES_KEY;
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
  if (String(category || "").trim() === ALL_CATEGORIES_KEY) {
    return "cat_all";
  }
  const slug = String(category || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return `cat_${slug || "general"}`;
}

function categorySavedFilterViewKeys(category) {
  const primary = categorySavedFilterViewKey(category);
  if (String(category || "").trim() !== ALL_CATEGORIES_KEY) return [primary];
  return [...new Set([primary, "cat___all__", "cat__all__", "category"])];
}

function mergeSavedFiltersById(entries) {
  const map = new Map();
  for (const row of Array.isArray(entries) ? entries : []) {
    if (!row || row.id === undefined || row.id === null) continue;
    map.set(String(row.id), row);
  }
  return [...map.values()].sort((a, b) => {
    const aTs = Date.parse(String(a?.updatedAt || a?.updated_at || ""));
    const bTs = Date.parse(String(b?.updatedAt || b?.updated_at || ""));
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });
}

function parseFiltersWithHeuristics(promptRaw, selectedCategoryRaw, allProducts) {
  const prompt = String(promptRaw || "").trim();
  const selectedCategory = String(selectedCategoryRaw || "").trim() || ALL_CATEGORIES_KEY;
  if (!prompt) {
    return { selectedCategory, search: "", filters: {}, warnings: ["Enter a prompt to parse filters."] };
  }
  const text = prompt.toLowerCase();
  const categories = [...new Set((allProducts || []).map((p) => p.category))];
  const manufacturers = [...new Set((allProducts || []).map((p) => p.manufacturer))];
  const modelFamilies = [...new Set((allProducts || []).map((p) => p.modelFamily || modelFamilyOf(p.model)))];
  const modelFamilyToCategory = new Map(
    (allProducts || [])
      .map((p) => [String(p.modelFamily || modelFamilyOf(p.model)).toLowerCase(), p.category])
      .filter(([family, category]) => family && category)
  );
  const storages = [...new Set((allProducts || []).map((p) => p.storage))];
  const regions = [...new Set((allProducts || []).flatMap((p) => Object.keys(p.locations || {})))];
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
  const nextCategory = allCategoryRequested
    ? ALL_CATEGORIES_KEY
    : (categoryByMatch || categoryByModelFamily || categoryByKeyword || selectedCategory);

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
    selectedCategory: nextCategory,
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

function hasExplicitCategoryIntent(promptRaw) {
  const text = String(promptRaw || "").toLowerCase();
  return /\bsmart\s?phones?\b|\bphones?\b|\btablet(s)?\b|\blaptop(s)?\b|\bnotebook(s)?\b|\bwearable(s)?\b|\bwatch(es)?\b|\baccessor(y|ies)\b/.test(text)
    || /\bmacbook\b|\bthinkpad\b|\bxps\b|\bsurface laptop\b|\byoga\b|\bipad\b|\bgalaxy tab\b|\bapple watch\b|\bwatch ultra\b|\bsmartwatch\b|\bairpods\b|\bcharger\b|\bkeyboard\b|\bheadset\b|\biphone\b|\bpixel\b/.test(text);
}

function resolveDemoCopilotSelectedCategoryContext(messageRaw, selectedCategoryRaw) {
  const selectedCategory = String(selectedCategoryRaw || "").trim() || ALL_CATEGORIES_KEY;
  const message = String(messageRaw || "");
  if (selectedCategory === "Smartphones" && !hasExplicitCategoryIntent(message)) {
    return ALL_CATEGORIES_KEY;
  }
  return selectedCategory;
}

function deviceMatchesFilterPayload(device, payload) {
  const normalized = sanitizeFilterPayload(payload);
  const selectedCategory = String(normalized.selectedCategory || "").trim();
  const search = String(normalized.search || "").trim().toLowerCase();
  const activeFilters = normalized.filters && typeof normalized.filters === "object" ? normalized.filters : {};
  const availableRegions = device && device.locations && typeof device.locations === "object"
    ? Object.entries(device.locations).filter(([, qty]) => Number(qty || 0) > 0).map(([name]) => name)
    : [];
  const text = `${device.manufacturer} ${device.model} ${device.modelFamily || modelFamilyOf(device.model)} ${device.category}`.toLowerCase();
  if (selectedCategory && selectedCategory !== ALL_CATEGORIES_KEY && device.category !== selectedCategory) return false;
  if (search && !text.includes(search)) return false;
  if (Array.isArray(activeFilters.manufacturer) && activeFilters.manufacturer.length && !activeFilters.manufacturer.includes(device.manufacturer)) return false;
  if (Array.isArray(activeFilters.modelFamily) && activeFilters.modelFamily.length && !activeFilters.modelFamily.includes(device.modelFamily || modelFamilyOf(device.model))) return false;
  if (Array.isArray(activeFilters.grade) && activeFilters.grade.length && !activeFilters.grade.includes(device.grade)) return false;
  if (Array.isArray(activeFilters.storage) && activeFilters.storage.length && !activeFilters.storage.includes(device.storage)) return false;
  if (Array.isArray(activeFilters.region) && activeFilters.region.length && !activeFilters.region.some((regionName) => availableRegions.includes(regionName))) return false;
  return true;
}

function buildCopilotNoMatchReply(payloadRaw, allProducts) {
  const payload = sanitizeFilterPayload(payloadRaw);
  const filters = payload.filters && typeof payload.filters === "object" ? payload.filters : {};
  const manufacturers = Array.isArray(filters.manufacturer) ? filters.manufacturer : [];
  const regions = Array.isArray(filters.region) ? filters.region : [];
  const hasModelConstraints = Boolean((Array.isArray(filters.modelFamily) && filters.modelFamily.length) || (Array.isArray(filters.storage) && filters.storage.length) || (Array.isArray(filters.grade) && filters.grade.length));

  const primaryManufacturer = manufacturers.length === 1 ? manufacturers[0] : "";
  const primaryRegion = regions.length === 1 ? regions[0] : "";
  const categoryPhrase = payload.selectedCategory === "Smartphones"
    ? "phones"
    : (payload.selectedCategory === ALL_CATEGORIES_KEY ? "devices" : String(payload.selectedCategory || "devices").toLowerCase());

  let intro = "I cannot find any matching devices right now.";
  if (primaryManufacturer && primaryRegion) {
    intro = `I cannot find any ${primaryManufacturer} ${categoryPhrase} in ${primaryRegion} right now.`;
  } else if (primaryManufacturer) {
    intro = `I cannot find any ${primaryManufacturer} ${categoryPhrase} right now.`;
  } else if (primaryRegion) {
    intro = `I cannot find any ${categoryPhrase} in ${primaryRegion} right now.`;
  }

  const suggestions = [];

  if (regions.length) {
    const relaxedFilters = { ...filters };
    delete relaxedFilters.region;
    const relaxedPayload = { ...payload, filters: relaxedFilters };
    const relaxedMatches = (allProducts || []).filter((p) => deviceMatchesFilterPayload(p, relaxedPayload));
    if (relaxedMatches.length) {
      const suggestedRegions = [...new Set(relaxedMatches.flatMap((p) => p.availableRegions || []))].slice(0, 3);
      if (suggestedRegions.length) {
        suggestions.push(`try another location like ${suggestedRegions.join(", ")}`);
      } else {
        suggestions.push("remove the location filter");
      }
    }
  }

  if (manufacturers.length) {
    const relaxedFilters = { ...filters };
    delete relaxedFilters.manufacturer;
    const relaxedPayload = { ...payload, filters: relaxedFilters };
    const relaxedMatches = (allProducts || []).filter((p) => deviceMatchesFilterPayload(p, relaxedPayload));
    if (relaxedMatches.length) {
      const altBrands = [...new Set(relaxedMatches.map((p) => p.manufacturer).filter(Boolean))].slice(0, 3);
      if (altBrands.length) {
        suggestions.push(`try other brands in this search, such as ${altBrands.join(", ")}`);
      }
    }
  }

  if (hasModelConstraints) {
    suggestions.push("remove model/grade/storage filters to broaden the search");
  }
  if (payload.search) {
    suggestions.push("clear the keyword text search");
  }
  if (!suggestions.length) {
    suggestions.push("broaden the request, for example by searching only by brand or category");
  }

  const topSuggestions = suggestions.slice(0, 3).map((item, index) => `${index + 1}) ${item}`).join("; ");
  return `${intro} You can ${topSuggestions}.`;
}

function buildCopilotFilterOptions(promptRaw, parsedRaw, allProducts) {
  const parsed = sanitizeFilterPayload(parsedRaw);
  const categories = [...new Set((allProducts || []).map((p) => p.category))];
  if (categories.length < 2) return [];
  const shouldOfferChoices = parsed.selectedCategory === ALL_CATEGORIES_KEY || !hasExplicitCategoryIntent(promptRaw);
  if (!shouldOfferChoices) return [];
  const categoryOptions = categories
    .map((categoryName) => {
      const payload = {
        selectedCategory: categoryName,
        search: parsed.search,
        filters: parsed.filters
      };
      const matchCount = (allProducts || []).filter((p) => deviceMatchesFilterPayload(p, payload)).length;
      return { categoryName, payload, matchCount };
    })
    .filter((entry) => entry.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount || a.categoryName.localeCompare(b.categoryName));
  if (categoryOptions.length < 2) return [];
  return categoryOptions.slice(0, 5).map((entry) => ({
    id: `cat-${entry.categoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: `${entry.categoryName} (${entry.matchCount})`,
    description: `${entry.matchCount} matching device${entry.matchCount === 1 ? "" : "s"}`,
    payload: {
      ...entry.payload,
      suggestedName: buildCopilotSuggestedFilterName(entry.payload)
    }
  }));
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
          message: Math.max(0, available) <= 0
            ? `Remove ${model} from this request for ${selectedLocation}.`
            : `Set quantity to ${Math.max(0, available)} for ${model} at ${selectedLocation}.`
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
    loginCount: Math.max(0, Number(user.loginCount || 0)),
    lastLoginAt: user.lastLoginAt || null,
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
    throwApiError("Legacy auth disabled. Use Auth0.", 410);
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    throwApiError("Legacy auth disabled. Use Auth0.", 410);
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
    throwApiError("Legacy auth disabled. Use Auth0.", 410);
  }

  if (method === "POST" && pathname === "/api/auth/reset-password") {
    throwApiError("Legacy auth disabled. Use Auth0.", 410);
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
    const categoryContext = resolveDemoCopilotSelectedCategoryContext(body.prompt, body.selectedCategory);
    return parseFiltersWithHeuristics(body.prompt, categoryContext, all);
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
    const auth = requireAuth();
    const all = productsSeed.map((p) => normalizeDevice(p));
    const selectedCategory = resolveDemoCopilotSelectedCategoryContext(body.message, body.selectedCategory);
    const cartActivity = getDemoCartActivity(auth.id);
    const msgText = String(body.message || "").trim();
    const lowered = msgText.toLowerCase();
    if (isGradeDefinitionQuestion(msgText)) {
      return { reply: buildGradeDefinitionReply(msgText), action: null };
    }
    const addFromHistoryIntent = /(add|include|reorder|repeat|same as|use)/.test(lowered)
      && /(last order|previous order|historic|history|past order|before|req-\d{4}-\d{4}|est-\d{4}-\d{4})/.test(lowered);
    if (addFromHistoryIntent) {
      const requests = getDemoRequests(auth.company)
        .slice()
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      const target = requests[0] || null;
      if (!target) {
        return { reply: "I couldn't find previous orders to copy from.", action: null };
      }
      const addLines = [];
      const unavailable = [];
      for (const line of Array.isArray(target.lines) ? target.lines : []) {
        const model = String(line.model || "").trim();
        const match = all
          .filter((d) => String(d.model || "").toLowerCase() === model.toLowerCase())
          .sort((a, b) => Number(b.available || 0) - Number(a.available || 0))[0];
        const available = Number(match?.available || 0);
        if (!match || available <= 0) {
          unavailable.push(model);
          continue;
        }
        addLines.push({
          deviceId: match.id,
          quantity: Math.min(Math.max(1, Number(line.quantity || 1)), available),
          offerPrice: Number(line.offerPrice || match.price || 0),
          note: `From historical order ${target.requestNumber}`
        });
      }
      if (!addLines.length) {
        return {
          reply: `I found ${target.requestNumber}, but none of its items are currently available in inventory.${unavailable.length ? ` Unavailable: ${unavailable.slice(0, 5).join(", ")}.` : ""}`,
          action: null
        };
      }
      return {
        reply: `I prepared ${addLines.length} item${addLines.length === 1 ? "" : "s"} from ${target.requestNumber}. I skipped unavailable items${unavailable.length ? `: ${unavailable.slice(0, 5).join(", ")}` : ""}.`,
        action: {
          type: "add_lines_to_request",
          payload: {
            sourceOrder: target.requestNumber,
            lines: addLines
          }
        }
      };
    }
    if (/(cart|added|promotion|promotions|upsell|follow up|follow-up)/.test(lowered) && cartActivity.length) {
      const topByModel = new Map();
      for (const row of cartActivity) {
        const key = String(row.model || "").trim();
        if (!key) continue;
        const entry = topByModel.get(key) || { model: key, qty: 0, pending: 0 };
        entry.qty += Number(row.quantity || 0);
        if (!row.everRequested) entry.pending += Number(row.quantity || 0);
        topByModel.set(key, entry);
      }
      const top = [...topByModel.values()].sort((a, b) => b.qty - a.qty).slice(0, 3);
      if (top.length) {
        const preview = top.map((row) => `${row.model} (${row.qty} added, ${row.pending} not yet requested)`).join("; ");
        return { reply: `From cart activity, top items are: ${preview}. These are good promotion/follow-up candidates.`, action: null };
      }
    }
    const parsed = parseFiltersWithHeuristics(body.message, selectedCategory, all);
    const hasFilters = Object.keys(parsed.filters || {}).length > 0 || String(parsed.search || "").trim().length > 0;
    const suggestedName = buildCopilotSuggestedFilterName(parsed);
    const options = buildCopilotFilterOptions(body.message, parsed, all);
    return hasFilters
      ? {
        reply: options.length > 1
          ? "I found matches in multiple categories. Choose one to apply."
          : "I parsed your request and prepared filters you can apply.",
        action: options.length > 1
          ? { type: "choose_filters", options }
          : {
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

  if (method === "GET" && pathname === "/api/cart-draft") {
    const auth = requireAuth();
    const draft = getDemoCartDraft(auth.id);
    if (!draft) {
      return { status: "active", lines: [], lineCount: 0, totalAmount: 0 };
    }
    return draft;
  }

  if (method === "PUT" && pathname === "/api/cart-draft") {
    const auth = requireAuth();
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    const lines = rawLines
      .map((line) => ({
        productId: String(line.productId || line.deviceId || "").trim(),
        model: String(line.model || "").trim(),
        grade: String(line.grade || "").trim(),
        quantity: Number(line.quantity || 0),
        offerPrice: Number(line.offerPrice || 0),
        note: String(line.note || "").trim()
      }))
      .filter((line) => line.model && line.grade && Number.isFinite(line.quantity) && line.quantity >= 1 && Number.isFinite(line.offerPrice) && line.offerPrice >= 0);
    const totalAmount = Number(lines.reduce((sum, line) => sum + (line.quantity * line.offerPrice), 0).toFixed(2));
    const existing = getDemoCartDraft(auth.id);
    const activity = getDemoCartActivity(auth.id);
    const addedEvents = computeDemoCartAddedEvents(existing?.lines || [], lines);
    const now = new Date().toISOString();
    const next = {
      id: Number(existing?.id || auth.id),
      userId: auth.id,
      company: auth.company,
      email: auth.email,
      status: "active",
      lineCount: lines.length,
      totalAmount,
      lines,
      lastActivityAt: now,
      updatedAt: now,
      createdAt: existing?.createdAt || now,
      submittedAt: null,
      submittedRequestId: null
    };
    setDemoCartDraft(auth.id, next);
    if (addedEvents.length) {
      setDemoCartActivity(auth.id, [...addedEvents, ...activity]);
    }
    return next;
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
    const existingActivity = getDemoCartActivity(auth.id);
    const markedActivity = existingActivity.map((entry) => {
      const matched = lines.some((line) => (
        String(line.model || "").trim().toLowerCase() === String(entry.model || "").trim().toLowerCase()
        && String(line.grade || "").trim().toLowerCase() === String(entry.grade || "").trim().toLowerCase()
      ));
      return matched ? { ...entry, everRequested: true } : entry;
    });
    setDemoCartActivity(auth.id, markedActivity);
    const existingDraft = getDemoCartDraft(auth.id);
    if (existingDraft) {
      setDemoCartDraft(auth.id, {
        ...existingDraft,
        status: "submitted",
        submittedRequestId: request.id,
        submittedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    return request;
  }

  const demoUserCartActivityMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/cart-activity$/);
  if (method === "GET" && demoUserCartActivityMatch) {
    requireAdmin();
    const targetUserId = Number(demoUserCartActivityMatch[1]);
    if (!Number.isInteger(targetUserId) || targetUserId < 1) throwApiError("Invalid user id.", 400);
    return getDemoCartActivity(targetUserId);
  }

  if (method === "GET" && pathname === "/api/admin/cart-drafts") {
    requireAdmin();
    const users = getDemoUsers();
    const drafts = users
      .map((u) => {
        const draft = getDemoCartDraft(u.id);
        if (!draft) return null;
        const fullName = [String(u.firstName || "").trim(), String(u.lastName || "").trim()].filter(Boolean).join(" ") || null;
        return { ...draft, fullName, isActiveUser: u.isActive === true };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.lastActivityAt || 0).getTime() - new Date(a.lastActivityAt || 0).getTime());
    return drafts;
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
    const company = String(body.company || "").trim();
    const isActive = body.isActive === true;
    const role = normalizeUserRole(body.role || (body.isAdmin === true ? "admin" : "buyer"));
    if (!email || !company) throwApiError("Email and company are required.", 400);
    if (users.some((u) => u.email === email)) throwApiError("User already exists.", 409);
    const nextId = users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1;
    users.push({
      id: nextId,
      email,
      company,
      role,
      password: crypto.randomUUID(),
      isActive,
      loginCount: 0,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      resetCode: null,
      resetCodeExpiresAt: null
    });
    setDemoUsers(users);
    return { ok: true };
  }

  if (method === "GET" && pathname === "/api/admin/sales-reps/assignments") {
    requireAdmin();
    const assignmentsMap = getDemoSalesRepAssignments();
    const salesReps = users
      .filter((u) => normalizeUserRole(u.role) === "sales_rep")
      .map((u) => makeDemoPublicUser(u));
    const companies = [...new Set(users.map((u) => String(u.company || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const assignments = companies.map((company) => {
      const salesRepUserId = Number(assignmentsMap[company] || 0) || null;
      const rep = salesReps.find((u) => Number(u.id) === Number(salesRepUserId)) || null;
      return {
        company,
        salesRepUserId,
        salesRepEmail: rep?.email || "",
        salesRepFirstName: rep?.firstName || "",
        salesRepLastName: rep?.lastName || "",
        salesRepIsActive: rep?.isActive === true,
        updatedAt: new Date().toISOString()
      };
    });
    return { salesReps, assignments };
  }

  if (method === "PUT" && pathname === "/api/admin/sales-reps/assignments") {
    requireAdmin();
    const company = String(body.company || "").trim();
    if (!company) throwApiError("Company is required.", 400);
    const assignmentsMap = getDemoSalesRepAssignments();
    const salesRepUserId = Number(body.salesRepUserId || 0);
    if (!Number.isInteger(salesRepUserId) || salesRepUserId < 1) {
      delete assignmentsMap[company];
      setDemoSalesRepAssignments(assignmentsMap);
      return { ok: true, company, salesRepUserId: null };
    }
    const rep = users.find((u) => Number(u.id) === salesRepUserId);
    if (!rep || normalizeUserRole(rep.role) !== "sales_rep") {
      throwApiError("Selected user must be a sales rep.", 400);
    }
    assignmentsMap[company] = salesRepUserId;
    setDemoSalesRepAssignments(assignmentsMap);
    return { ok: true, company, salesRepUserId };
  }

  if (method === "GET" && pathname === "/api/sales-rep/dashboard") {
    const auth = requireAuth();
    if (normalizeUserRole(auth.role) !== "sales_rep") throwApiError("Forbidden", 403);
    const assignmentsMap = getDemoSalesRepAssignments();
    const assignedCompanies = Object.entries(assignmentsMap)
      .filter(([, userId]) => Number(userId || 0) === Number(auth.id))
      .map(([company]) => String(company || "").trim())
      .filter(Boolean);
    const requests = assignedCompanies.flatMap((company) => getDemoRequests(company).map((req) => ({ ...req, company })));
    const completedRequests = requests.filter((r) => String(r.status || "").toLowerCase() === "completed").length;
    const totalValue = requests.reduce((sum, r) => sum + Number(r.total || 0), 0);
    const companyStats = assignedCompanies.map((company) => {
      const rows = requests.filter((r) => String(r.company || "") === company);
      const completed = rows.filter((r) => String(r.status || "").toLowerCase() === "completed").length;
      return {
        company,
        requestCount: rows.length,
        openRequests: Math.max(0, rows.length - completed),
        completedRequests: completed,
        totalValue: rows.reduce((sum, r) => sum + Number(r.total || 0), 0),
        lastRequestAt: rows.length ? rows.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].createdAt : null
      };
    }).sort((a, b) => b.totalValue - a.totalValue);
    const recentRequests = requests
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12)
      .map((r) => ({
        id: r.id,
        requestNumber: r.requestNumber,
        company: r.company,
        status: r.status,
        total: Number(r.total || 0),
        createdAt: r.createdAt
      }));
    return {
      summary: {
        assignedCompanies: assignedCompanies.length,
        totalRequests: requests.length,
        openRequests: Math.max(0, requests.length - completedRequests),
        completedRequests,
        totalValue,
        avgRequestValue: requests.length ? (totalValue / requests.length) : 0
      },
      companyStats,
      recentRequests
    };
  }

  const demoSeedHistoryMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/seed-history$/);
  if (demoSeedHistoryMatch && method === "POST") {
    requireAdmin();
    const targetId = Number(demoSeedHistoryMatch[1]);
    const targetUser = users.find((u) => Number(u.id) === targetId);
    if (!targetUser) throwApiError("User not found.", 404);
    const count = Math.max(1, Math.min(100, Math.floor(Number(body.count || 20))));
    const all = productsSeed.map((p) => normalizeDevice(p));
    if (!all.length) throwApiError("No devices available for seeding.", 400);
    const byCategory = new Map();
    for (const device of all) {
      const key = String(device.category || "Other");
      const list = byCategory.get(key) || [];
      list.push(device);
      byCategory.set(key, list);
    }
    const categories = [...byCategory.keys()];
    if (!categories.length) throwApiError("No categories available for seeding.", 400);

    const requests = getDemoRequests(targetUser.company);
    const year = new Date().getFullYear();
    for (let i = 0; i < count; i += 1) {
      const requestCount = requests.filter((r) => String(r.requestNumber || "").startsWith(`REQ-${year}-`)).length + 1;
      const estimateCount = requests.filter((r) => String(r.netsuiteEstimateNumber || "").startsWith(`EST-${year}-`)).length + 1;
      const lineCount = 3 + ((i + targetId) % 3);
      const lines = [];
      let total = 0;
      for (let j = 0; j < lineCount; j += 1) {
        const categoryName = categories[(i + j) % categories.length];
        const list = byCategory.get(categoryName) || all;
        const device = list[(i * 7 + j * 5 + targetId) % list.length];
        const quantity = 50 + ((i * 11 + j * 17 + targetId) % 120);
        const multiplier = 0.64 + (((i + j + targetId) % 8) * 0.05);
        const offerPrice = Number((Number(device.price || 100) * multiplier).toFixed(2));
        total += quantity * offerPrice;
        lines.push({
          productId: device.id,
          model: device.model,
          grade: device.grade,
          quantity,
          offerPrice,
          note: `Admin seeded history (${categoryName}).`
        });
      }
      const createdAt = new Date(Date.now() - ((count - i + 3) * 24 * 60 * 60 * 1000)).toISOString();
      requests.push({
        id: crypto.randomUUID(),
        requestNumber: `REQ-${year}-${String(requestCount).padStart(4, "0")}`,
        company: targetUser.company,
        createdBy: targetUser.email,
        createdAt,
        updatedAt: createdAt,
        status: "Completed",
        total: Number(total.toFixed(2)),
        currencyCode: "USD",
        netsuiteEstimateId: `dummy-est-${crypto.randomUUID().slice(0, 8)}`,
        netsuiteEstimateNumber: `EST-${year}-${String(estimateCount).padStart(4, "0")}`,
        netsuiteStatus: "Completed",
        netsuiteUpdatedAt: createdAt,
        lines
      });
    }
    setDemoRequests(targetUser.company, requests);
    return {
      ok: true,
      created: count,
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        company: targetUser.company
      }
    };
  }

  const demoSeedCartActivityMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/seed-cart-activity$/);
  if (demoSeedCartActivityMatch && method === "POST") {
    requireAdmin();
    const targetId = Number(demoSeedCartActivityMatch[1]);
    const targetUser = users.find((u) => Number(u.id) === targetId);
    if (!targetUser) throwApiError("User not found.", 404);
    const count = Math.max(1, Math.min(200, Math.floor(Number(body.count || 20))));
    const all = productsSeed.map((p) => normalizeDevice(p));
    if (!all.length) throwApiError("No devices available for seeding.", 400);
    const activity = getDemoCartActivity(targetId);
    const next = [...activity];
    for (let i = 0; i < count; i += 1) {
      const device = all[(i * 11 + targetId) % all.length];
      const quantity = 1 + ((i * 5 + targetId) % 25);
      const multiplier = 0.58 + (((i + targetId) % 9) * 0.06);
      const offerPrice = Number((Number(device.price || 100) * multiplier).toFixed(2));
      const addedAt = new Date(Date.now() - ((count - i) * 6 * 60 * 60 * 1000)).toISOString();
      next.push({
        id: crypto.randomUUID(),
        productId: String(device.id || "").trim(),
        model: String(device.model || "").trim(),
        grade: String(device.grade || "A").trim(),
        quantity,
        offerPrice,
        note: "Admin seeded cart activity.",
        addedAt,
        everRequested: false
      });
    }
    next.sort((a, b) => new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime());
    setDemoCartActivity(targetId, next);
    return {
      ok: true,
      created: count,
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        company: targetUser.company
      }
    };
  }

  const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (userMatch && method === "PATCH") {
    const actingUser = requireAdmin();
    const targetId = Number(userMatch[1]);
    const target = users.find((u) => u.id === targetId);
    if (!target) throwApiError("User not found.", 404);
    if (typeof body.isActive === "boolean") target.isActive = body.isActive;
    if (typeof body.role === "string" && String(body.role || "").trim()) target.role = normalizeUserRole(body.role);
    else if (typeof body.isAdmin === "boolean") target.role = body.isAdmin ? "admin" : "buyer";
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
  if (response.status === 401 && !skipRefresh && refreshToken && path !== "/api/auth/refresh") {
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
        onAuthFail({ reason: "expired" });
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

function DashboardNavIcon() {
  return (
    <svg className="nav-icon-svg" viewBox="0 0 24 24">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 15.5v-3.2M12 15.5V9.8M16 15.5V7.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const {
    loginWithRedirect,
    logout: auth0Logout,
    isAuthenticated: auth0IsAuthenticated,
    getAccessTokenSilently,
    error: auth0SdkError,
    isLoading: auth0SdkLoading
  } = useAuth0();
  const persistedViewState = readJson(localStorage, UI_VIEW_STATE_KEY, {});
  const logoUrl = `${import.meta.env.BASE_URL}logo.png`;
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("pcs.authToken") || "");
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem("pcs.refreshToken") || "");
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState(() => localStorage.getItem("pcs.accessTokenExpiresAt") || "");
  const [authBootstrapError, setAuthBootstrapError] = useState("");
  const [authPendingApprovalEmail, setAuthPendingApprovalEmail] = useState("");
  const [authProfileRequired, setAuthProfileRequired] = useState(false);
  const [authProfilePrefill, setAuthProfilePrefill] = useState({ firstName: "", lastName: "", company: "", email: "" });
  const [sessionTimeLeftMs, setSessionTimeLeftMs] = useState(null);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loggedOutReason, setLoggedOutReason] = useState("");
  const [products, setProducts] = useState(productsSeed.map(normalizeDevice));
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [categoryDevices, setCategoryDevices] = useState([]);
  const [categoryTotal, setCategoryTotal] = useState(0);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [route, setRoute] = useState(() => persistedViewState.route || "dashboard");
  const [productsView, setProductsView] = useState(() => persistedViewState.productsView || "home");
  const [selectedCategory, setSelectedCategory] = useState(() => persistedViewState.selectedCategory || ALL_CATEGORIES_KEY);
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
  const [gradeGuideOpen, setGradeGuideOpen] = useState(false);
  const [gradeGuideSelectedCode, setGradeGuideSelectedCode] = useState("");
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
  const [historySeedUserId, setHistorySeedUserId] = useState("");
  const [historySeedLoading, setHistorySeedLoading] = useState(false);
  const [historySeedNotice, setHistorySeedNotice] = useState("");
  const [cartActivitySeedLoading, setCartActivitySeedLoading] = useState(false);
  const [cartActivitySeedNotice, setCartActivitySeedNotice] = useState("");
  const [historyChatResetLoading, setHistoryChatResetLoading] = useState(false);
  const [historyChatResetNotice, setHistoryChatResetNotice] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserCompany, setNewUserCompany] = useState("");
  const [newUserIsActive, setNewUserIsActive] = useState(false);
  const [newUserRole, setNewUserRole] = useState("buyer");
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState("");
  const [syncStatus, setSyncStatus] = useState(null);
  const [adminCatalogLoading, setAdminCatalogLoading] = useState(false);
  const [adminCatalogResult, setAdminCatalogResult] = useState("");
  const [adminCatalogError, setAdminCatalogError] = useState("");
  const [adminRealSeedStatus, setAdminRealSeedStatus] = useState(null);
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
  const [aiCopilotGreetingTyping, setAiCopilotGreetingTyping] = useState(false);
  const [aiCopilotError, setAiCopilotError] = useState("");
  const [aiCopilotOpen, setAiCopilotOpen] = useState(false);
  const [aiCopilotUnreadCount, setAiCopilotUnreadCount] = useState(0);
  const [aiCopilotWelcomePending, setAiCopilotWelcomePending] = useState(false);
  const [aiCopilotPanelHeight, setAiCopilotPanelHeight] = useState(0);
  const [aiCopilotMinPanelHeight, setAiCopilotMinPanelHeight] = useState(0);
  const [aiCopilotOptionVisibleCountByMessage, setAiCopilotOptionVisibleCountByMessage] = useState({});
  const [aiCopilotCurrentTopic, setAiCopilotCurrentTopic] = useState("general");
  const [aiCopilotListening, setAiCopilotListening] = useState(false);
  const [aiCopilotVoiceError, setAiCopilotVoiceError] = useState("");
  const [adminAiAnomaliesLoading, setAdminAiAnomaliesLoading] = useState(false);
  const [adminAiAnomalies, setAdminAiAnomalies] = useState([]);
  const [adminAiInsightsLoading, setAdminAiInsightsLoading] = useState(false);
  const [adminAiInsights, setAdminAiInsights] = useState(null);
  const [adminAiError, setAdminAiError] = useState("");
  const [adminCartDraftsLoading, setAdminCartDraftsLoading] = useState(false);
  const [adminCartDraftsError, setAdminCartDraftsError] = useState("");
  const [adminCartDrafts, setAdminCartDrafts] = useState([]);
  const [adminUserCartActivityLoading, setAdminUserCartActivityLoading] = useState(false);
  const [adminUserCartActivityError, setAdminUserCartActivityError] = useState("");
  const [adminUserCartActivity, setAdminUserCartActivity] = useState([]);
  const [salesRepAssignmentsLoading, setSalesRepAssignmentsLoading] = useState(false);
  const [salesRepAssignmentsError, setSalesRepAssignmentsError] = useState("");
  const [salesRepAssignments, setSalesRepAssignments] = useState([]);
  const [salesRepUsers, setSalesRepUsers] = useState([]);
  const [selectedAssignmentCompany, setSelectedAssignmentCompany] = useState("");
  const [selectedSalesRepUserId, setSelectedSalesRepUserId] = useState("");
  const [salesRepAssignmentNotice, setSalesRepAssignmentNotice] = useState("");
  const [salesRepDashboardLoading, setSalesRepDashboardLoading] = useState(false);
  const [salesRepDashboardError, setSalesRepDashboardError] = useState("");
  const [salesRepDashboard, setSalesRepDashboard] = useState(null);
  const [cartNotice, setCartNotice] = useState("");
  const skipInitialCategoryResetRef = useRef(true);
  const cartNoticeTimerRef = useRef(null);
  const aiCopilotFeedRef = useRef(null);
  const aiCopilotPanelRef = useRef(null);
  const aiCopilotResizeRef = useRef({ active: false, startY: 0, startHeight: 0 });
  const gradeGuideItemRefs = useRef(new Map());
  const sessionExpiryModalRef = useRef(null);
  const gradeGuideModalRef = useRef(null);
  const productModalRef = useRef(null);
  const cartModalRef = useRef(null);
  const aiCopilotStateLoadedRef = useRef(false);
  const aiCopilotPendingResultCheckRef = useRef(null);
  const aiCopilotLastSeenMessageCountRef = useRef(0);
  const aiCopilotSpeechRef = useRef(null);
  const aiCopilotVoiceAutoSendTextRef = useRef("");
  const aiCopilotInputRef = useRef("");
  const aiCopilotVoiceAutoSendTimerRef = useRef(null);
  const aiCopilotVoiceHasSentRef = useRef(false);
  const auth0ExchangeInFlightRef = useRef(false);
  const auth0LogoutInProgressRef = useRef(false);
  const postLoginLandingSetRef = useRef("");
  const cartLoadedFromBackendRef = useRef(false);
  const cartDraftSyncTimerRef = useRef(null);

  const markAuth0LogoutRequested = () => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(AUTH0_LOGOUT_MARKER_KEY, String(Date.now()));
  };

  const clearAuth0LogoutRequested = () => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(AUTH0_LOGOUT_MARKER_KEY);
  };

  const hasRecentAuth0LogoutRequest = () => {
    if (typeof window === "undefined") return false;
    const raw = sessionStorage.getItem(AUTH0_LOGOUT_MARKER_KEY);
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return false;
    if ((Date.now() - ts) > AUTH0_LOGOUT_MARKER_TTL_MS) {
      sessionStorage.removeItem(AUTH0_LOGOUT_MARKER_KEY);
      return false;
    }
    return true;
  };

  const markAuth0InteractiveLoginPending = () => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(AUTH0_INTERACTIVE_LOGIN_KEY, String(Date.now()));
  };

  const clearAuth0InteractiveLoginPending = () => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(AUTH0_INTERACTIVE_LOGIN_KEY);
  };

  const hasAuth0InteractiveLoginPending = () => {
    if (typeof window === "undefined") return false;
    const raw = sessionStorage.getItem(AUTH0_INTERACTIVE_LOGIN_KEY);
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return false;
    if ((Date.now() - ts) > AUTH0_INTERACTIVE_LOGIN_TTL_MS) {
      sessionStorage.removeItem(AUTH0_INTERACTIVE_LOGIN_KEY);
      return false;
    }
    return true;
  };

  const cartKey = user ? `pcs.cart.${normalizeEmail(user.email)}` : "";
  const requestPrefsKey = user ? `pcs.requestPrefs.${normalizeEmail(user.email)}` : "";
  const aiCopilotStateKey = user
    ? `${AI_COPILOT_STATE_KEY_PREFIX}${String(user.id || "anon")}.${normalizeEmail(user.email)}`
    : "";
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
    setLoggedOutReason("");
    setAuthProfileRequired(false);
    setAuthProfilePrefill({ firstName: "", lastName: "", company: "", email: "" });
    if (data.user) {
      setUser(data.user);
    }
  };

  const resetViewStateToHome = () => {
    setRoute("dashboard");
    setProductsView("home");
    setSelectedCategory(ALL_CATEGORIES_KEY);
    setSearch("");
    setFilters({});
    setWeeklySearch("");
    setWeeklyFilters({});
    setExpandedFilters({});
    setWeeklyExpandedFilters({});
    setCategoryPage(1);
    localStorage.removeItem(UI_VIEW_STATE_KEY);
  };

  const clearAuthState = (options = {}) => {
    const reason = typeof options === "string" ? options : String(options?.reason || "");
    const expiresAtMs = new Date(accessTokenExpiresAt).getTime();
    const tokenExpiredByClock = Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
    const nextLoggedOutReason = (reason === "expired" || tokenExpiredByClock) ? "expired" : "";
    localStorage.removeItem("pcs.authToken");
    localStorage.removeItem("pcs.refreshToken");
    localStorage.removeItem("pcs.accessTokenExpiresAt");
    setAuthToken("");
    setRefreshToken("");
    setAccessTokenExpiresAt("");
    setAuthBootstrapError("");
    setAuthPendingApprovalEmail("");
    clearAuth0InteractiveLoginPending();
    setAuthProfileRequired(false);
    setAuthProfilePrefill({ firstName: "", lastName: "", company: "", email: "" });
    setSessionTimeLeftMs(null);
    setUser(null);
    setAuthLoading(false);
    setLoggedOutReason(nextLoggedOutReason);
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
    setAiRequestReview(null);
    setAiRequestReviewError("");
    setAiCopilotMessages([]);
    setAiCopilotInput("");
    setAiCopilotGreetingTyping(false);
    setAiCopilotError("");
    setAiCopilotOpen(false);
    setAiCopilotWelcomePending(false);
    setAiCopilotCurrentTopic("general");
    setAiCopilotListening(false);
    setAiCopilotVoiceError("");
    setAiCopilotPanelHeight(0);
    setAiCopilotMinPanelHeight(0);
    aiCopilotPendingResultCheckRef.current = null;
    setAdminAiAnomalies([]);
    setAdminAiInsights(null);
    setAdminAiError("");
    setSalesRepAssignments([]);
    setSalesRepUsers([]);
    setSelectedAssignmentCompany("");
    setSelectedSalesRepUserId("");
    setSalesRepAssignmentsError("");
    setSalesRepAssignmentNotice("");
    setSalesRepDashboard(null);
    setSalesRepDashboardError("");
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
      clearAuthState({ reason: "expired" });
    } finally {
      setRefreshingSession(false);
    }
  };

  useEffect(() => {
    if (!auth0IsAuthenticated) {
      auth0LogoutInProgressRef.current = false;
      clearAuth0LogoutRequested();
    }
  }, [auth0IsAuthenticated]);

  useEffect(() => {
    if (!user?.id) {
      postLoginLandingSetRef.current = "";
      return;
    }
    const currentUserId = String(user.id);
    if (postLoginLandingSetRef.current === currentUserId) return;
    postLoginLandingSetRef.current = currentUserId;
    setRoute("dashboard");
    setProductsView("home");
  }, [user?.id]);

  useEffect(() => {
    let ignore = false;
    async function exchangeAuth0Session() {
      if (!auth0IsAuthenticated) return;
      if (authToken || refreshToken || user) return;
      if (auth0LogoutInProgressRef.current) return;
      if (hasRecentAuth0LogoutRequest()) return;
      if (!hasAuth0InteractiveLoginPending()) return;
      if (auth0ExchangeInFlightRef.current) return;
      try {
        auth0ExchangeInFlightRef.current = true;
        setAuthLoading(true);
        setAuthBootstrapError("");
        const accessToken = await getAccessTokenSilently();
        const issued = await apiRequest("/api/auth/auth0-exchange", {
          method: "POST",
          body: { accessToken },
          skipRefresh: true
        });
        if (ignore) return;
        if (issued?.profileSetupRequired) {
          setAuthProfilePrefill({
            firstName: String(issued.firstName || ""),
            lastName: String(issued.lastName || ""),
            company: String(issued.company || ""),
            email: String(issued.email || "")
          });
          setAuthProfileRequired(true);
          setAuthPendingApprovalEmail("");
          setAuthBootstrapError("");
          setAuthLoading(false);
          return;
        }
        if (issued?.pendingApproval) {
          setAuthPendingApprovalEmail(String(issued.email || ""));
          setAuthBootstrapError("");
          setAuthLoading(false);
          return;
        }
        applyAuthTokens(issued);
        setAuthProfileRequired(false);
        setAuthProfilePrefill({ firstName: "", lastName: "", company: "", email: "" });
        setAuthPendingApprovalEmail("");
        clearAuth0InteractiveLoginPending();
        setAiCopilotOpen(false);
        setAiCopilotGreetingTyping(false);
        setAiCopilotWelcomePending(true);
        resetViewStateToHome();
      } catch (error) {
        clearAuth0InteractiveLoginPending();
        if (!ignore) {
          setAuthProfileRequired(false);
          setAuthPendingApprovalEmail("");
          setAuthBootstrapError(error.message || "Auth0 sign-in exchange failed.");
          setAuthLoading(false);
          setUser(null);
        }
      } finally {
        auth0ExchangeInFlightRef.current = false;
      }
    }
    exchangeAuth0Session();
    return () => {
      ignore = true;
    };
  }, [auth0IsAuthenticated, authToken, refreshToken, user, getAccessTokenSilently]);

  useEffect(() => {
    let ignore = false;
    async function loadMe() {
      if (!authToken && !refreshToken) {
        if (auth0IsAuthenticated) {
          if (auth0LogoutInProgressRef.current) {
            setAuthLoading(false);
            setUser(null);
            return;
          }
          if (hasRecentAuth0LogoutRequest()) {
            setAuthLoading(false);
            setUser(null);
            return;
          }
          if (!hasAuth0InteractiveLoginPending()) {
            setAuthLoading(false);
            setUser(null);
            return;
          }
          setAuthLoading(true);
          return;
        }
        setAuthLoading(false);
        setUser(null);
        return;
      }
      try {
        const data = await apiRequest("/api/auth/me", {
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: () => clearAuthState({ reason: "expired" })
        });
        if (!ignore) {
          setUser(data.user);
        }
      } catch {
        clearAuthState({ reason: "expired" });
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
  }, [authToken, refreshToken, auth0IsAuthenticated]);

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
    if (!gradeGuideOpen) return;
    const selectedCode = normalizeGradeCode(gradeGuideSelectedCode);
    if (!selectedCode) return;
    const target = gradeGuideItemRefs.current.get(selectedCode);
    if (!target) return;
    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [gradeGuideOpen, gradeGuideSelectedCode]);

  useEffect(() => {
    if (!user) return;
    if (sessionTimeLeftMs === null) return;
    if (sessionTimeLeftMs <= 0) {
      clearAuthState({ reason: "expired" });
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
      } catch (error) {
        if (!ignore) {
          setProducts([]);
          const message = String(error?.message || "").trim();
          setProductsError(message ? `Failed to load devices: ${message}` : "Failed to load devices from backend API.");
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
    let ignore = false;
    async function loadCartDraft() {
      if (!cartKey || !user || !authToken) {
        cartLoadedFromBackendRef.current = false;
        setCart([]);
        return;
      }
      const fallbackCart = readJson(sessionStorage, cartKey, []);
      try {
        const payload = await apiRequest("/api/cart-draft", {
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState
        });
        const lines = Array.isArray(payload?.lines) ? payload.lines : [];
        const next = lines.length
          ? lines.map((line) => ({
            id: crypto.randomUUID(),
            productId: String(line.productId || line.deviceId || "").trim(),
            model: String(line.model || "").trim(),
            grade: String(line.grade || "").trim(),
            quantity: Math.max(1, Math.floor(Number(line.quantity || 1))),
            offerPrice: Number(line.offerPrice || 0),
            note: String(line.note || "").trim()
          }))
          : fallbackCart;
        if (!ignore) {
          setCart(next);
          if (cartKey) writeJson(sessionStorage, cartKey, next);
          cartLoadedFromBackendRef.current = true;
        }
      } catch {
        if (!ignore) {
          setCart(fallbackCart);
          cartLoadedFromBackendRef.current = true;
        }
      }
    }
    loadCartDraft();
    return () => {
      ignore = true;
    };
  }, [authToken, refreshToken, user, cartKey]);

  useEffect(() => {
    if (!user || !authToken || !cartLoadedFromBackendRef.current) return;
    if (cartDraftSyncTimerRef.current) {
      clearTimeout(cartDraftSyncTimerRef.current);
    }
    cartDraftSyncTimerRef.current = setTimeout(async () => {
      try {
        await apiRequest("/api/cart-draft", {
          method: "PUT",
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState,
          body: {
            lines: cart.map((line) => ({
              productId: line.productId,
              model: line.model,
              grade: line.grade,
              quantity: Number(line.quantity || 0),
              offerPrice: Number(line.offerPrice || 0),
              note: line.note || ""
            }))
          }
        });
      } catch {
        // best-effort telemetry save
      }
    }, 700);
    return () => {
      if (cartDraftSyncTimerRef.current) {
        clearTimeout(cartDraftSyncTimerRef.current);
        cartDraftSyncTimerRef.current = null;
      }
    };
  }, [cart, authToken, refreshToken, user]);

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
        const viewKeys = categorySavedFilterViewKeys(selectedCategory);
        const payloads = await Promise.all(viewKeys.map(async (viewKey) => {
          try {
            return await apiRequest(`/api/filters/saved?view=${encodeURIComponent(viewKey)}`, {
              token: authToken,
              refreshToken,
              onAuthUpdate: applyAuthTokens,
              onAuthFail: clearAuthState
            });
          } catch {
            return [];
          }
        }));
        if (!ignore) {
          const merged = mergeSavedFiltersById(payloads.flatMap((entry) => (Array.isArray(entry) ? entry : [])));
          setSavedFilters(merged);
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
      if (!user || !authToken) {
        if (!ignore) {
          setShortcutFiltersByCategory({});
        }
        return;
      }
      const shortcutCategoryKeys = [...new Set([...categoryNames, ALL_CATEGORIES_KEY])];
      const entries = await Promise.all(shortcutCategoryKeys.map(async (categoryName) => {
        try {
          const viewKeys = categorySavedFilterViewKeys(categoryName);
          const payloads = await Promise.all(viewKeys.map(async (viewKey) => {
            try {
              return await apiRequest(`/api/filters/saved?view=${encodeURIComponent(viewKey)}`, {
                token: authToken,
                refreshToken,
                onAuthUpdate: applyAuthTokens,
                onAuthFail: clearAuthState
              });
            } catch {
              return [];
            }
          }));
          return [categoryName, mergeSavedFiltersById(payloads.flatMap((entry) => (Array.isArray(entry) ? entry : [])))];
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
    if (selectedCategory === ALL_CATEGORIES_KEY) return;
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
    aiCopilotInputRef.current = String(aiCopilotInput || "");
  }, [aiCopilotInput]);

  useEffect(() => {
    if (!aiCopilotStateKey) {
      aiCopilotStateLoadedRef.current = false;
      aiCopilotLastSeenMessageCountRef.current = 0;
      setAiCopilotMessages([]);
      setAiCopilotOpen(false);
      setAiCopilotUnreadCount(0);
      setAiCopilotCurrentTopic("general");
      return;
    }
    const state = readJson(localStorage, aiCopilotStateKey, {});
    const messages = Array.isArray(state?.messages)
      ? state.messages
        .filter((msg) => msg && (msg.role === "user" || msg.role === "assistant"))
        .map((msg) => ({
          role: msg.role,
          text: String(msg.text || ""),
          action: msg.action && typeof msg.action === "object" ? msg.action : null,
          topic: AI_COPILOT_TOPICS.has(String(msg.topic || "").trim().toLowerCase()) ? String(msg.topic || "").trim().toLowerCase() : "general",
          timestamp: normalizeChatTimestamp(msg.timestamp)
        }))
        .slice(-30)
      : [];
    setAiCopilotMessages(messages);
    setAiCopilotOpen(false);
    aiCopilotLastSeenMessageCountRef.current = messages.length;
    setAiCopilotUnreadCount(0);
    const persistedTopic = String(state?.currentTopic || "").trim().toLowerCase();
    setAiCopilotCurrentTopic(AI_COPILOT_TOPICS.has(persistedTopic) ? persistedTopic : "general");
    setAiCopilotPanelHeight(Number.isFinite(Number(state?.panelHeight)) ? Math.max(0, Math.round(Number(state.panelHeight))) : 0);
    setAiCopilotMinPanelHeight(0);
    setAiCopilotGreetingTyping(false);
    aiCopilotStateLoadedRef.current = true;
  }, [aiCopilotStateKey]);

  useEffect(() => {
    if (!aiCopilotStateKey || !aiCopilotStateLoadedRef.current) return;
    writeJson(localStorage, aiCopilotStateKey, {
      open: aiCopilotOpen,
      messages: aiCopilotMessages.slice(-30),
      currentTopic: aiCopilotCurrentTopic,
      panelHeight: Number.isFinite(Number(aiCopilotPanelHeight)) ? Math.max(0, Math.round(Number(aiCopilotPanelHeight))) : 0
    });
  }, [aiCopilotStateKey, aiCopilotOpen, aiCopilotMessages, aiCopilotCurrentTopic, aiCopilotPanelHeight]);

  useEffect(() => {
    if (!aiCopilotOpen || !aiCopilotWelcomePending) return;
    setAiCopilotGreetingTyping(true);
    const timer = window.setTimeout(() => {
      setAiCopilotMessages((prev) => [...prev, {
        role: "assistant",
        text: "Hi! Great to see you. I can help you find products, check promotions and weekly specials, and add matching items to your request. Try asking things like: \"Show me iPhone 15 Pro devices in Grade A\", \"What weekly specials are available right now?\", or \"Add 5 Samsung Galaxy S23 devices to my request.\"",
        action: null,
        topic: "general",
        timestamp: new Date().toISOString()
      }]);
      setAiCopilotGreetingTyping(false);
      setAiCopilotWelcomePending(false);
    }, 850);
    return () => {
      window.clearTimeout(timer);
      setAiCopilotGreetingTyping(false);
    };
  }, [aiCopilotOpen, aiCopilotWelcomePending]);

  useEffect(() => {
    if (aiCopilotOpen) {
      aiCopilotLastSeenMessageCountRef.current = aiCopilotMessages.length;
      if (aiCopilotUnreadCount !== 0) {
        setAiCopilotUnreadCount(0);
      }
      return;
    }
    const startIndex = Math.max(0, Number(aiCopilotLastSeenMessageCountRef.current || 0));
    const nextUnread = aiCopilotMessages
      .slice(startIndex)
      .filter((msg) => msg?.role === "assistant")
      .length;
    setAiCopilotUnreadCount(nextUnread);
  }, [aiCopilotMessages, aiCopilotOpen, aiCopilotUnreadCount]);

  useEffect(() => {
    if (!aiCopilotOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const maxAllowed = Math.max(260, Math.floor(window.innerHeight - 24));
      const baseline = Math.max(260, Math.min(AI_COPILOT_DEFAULT_PANEL_HEIGHT, maxAllowed));
      setAiCopilotMinPanelHeight((prev) => (prev > 0 ? prev : baseline));
      setAiCopilotPanelHeight((prev) => {
        if (prev > 0) return Math.min(Math.max(prev, baseline), maxAllowed);
        return baseline;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [aiCopilotOpen]);

  useEffect(() => () => {
    window.removeEventListener("mousemove", handleAiCopilotResizeMouseMove);
    window.removeEventListener("mouseup", stopAiCopilotResize);
    window.removeEventListener("touchmove", handleAiCopilotResizeTouchMove);
    window.removeEventListener("touchend", stopAiCopilotResize);
    window.removeEventListener("touchcancel", stopAiCopilotResize);
  }, []);

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
      ? new Set(["dashboard", "products", "requests", "users"])
      : new Set(["dashboard", "products", "requests"]);
    if (!allowedRoutes.has(route)) {
      setRoute("dashboard");
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
        if (selectedCategory === ALL_CATEGORIES_KEY) {
          const searchText = search.trim().toLowerCase();
          const manufacturers = Array.isArray(filters.manufacturer) ? filters.manufacturer : [];
          const modelFamilies = Array.isArray(filters.modelFamily) ? filters.modelFamily : [];
          const grades = Array.isArray(filters.grade) ? filters.grade : [];
          const regions = Array.isArray(filters.region) ? filters.region : [];
          const storages = Array.isArray(filters.storage) ? filters.storage : [];
          const filtered = products.filter((p) => {
            const text = `${p.manufacturer} ${p.model} ${p.modelFamily} ${p.category}`.toLowerCase();
            const availableRegions = p.locations && typeof p.locations === "object"
              ? Object.entries(p.locations).filter(([, qty]) => Number(qty || 0) > 0).map(([name]) => name)
              : [];
            if (searchText && !text.includes(searchText)) return false;
            if (manufacturers.length && !manufacturers.includes(p.manufacturer)) return false;
            if (modelFamilies.length && !modelFamilies.includes(p.modelFamily || modelFamilyOf(p.model))) return false;
            if (grades.length && !grades.includes(p.grade)) return false;
            if (regions.length && !regions.some((regionName) => availableRegions.includes(regionName))) return false;
            if (storages.length && !storages.includes(p.storage)) return false;
            return true;
          });
          const total = filtered.length;
          const start = (categoryPage - 1) * CATEGORY_PAGE_SIZE;
          if (!ignore) {
            setProductsError("");
            setCategoryDevices(filtered.slice(start, start + CATEGORY_PAGE_SIZE));
            setCategoryTotal(total);
          }
          return;
        }
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
  }, [authToken, refreshToken, productsView, selectedCategory, search, filters, categoryPage, products]);

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
      if (!user || user.role !== "admin" || (route !== "users" && route !== "dashboard")) return;
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

  useEffect(() => {
    if (route !== "users" || user?.role !== "admin" || !authToken) return;
    loadAdminCartDrafts();
    loadSalesRepAssignments();
  }, [route, user, authToken]);

  useEffect(() => {
    if (route !== "dashboard" || normalizeUserRole(user?.role) !== "sales_rep" || !authToken) return;
    loadSalesRepDashboard();
  }, [route, authToken, user]);

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

  const loadAdminCartDrafts = async () => {
    if (!user || user.role !== "admin" || !authToken) return;
    setAdminCartDraftsLoading(true);
    setAdminCartDraftsError("");
    try {
      const payload = await apiRequest("/api/admin/cart-drafts?limit=200", {
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      setAdminCartDrafts(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setAdminCartDraftsError(error.message || "Failed to load cart tracking.");
    } finally {
      setAdminCartDraftsLoading(false);
    }
  };

  async function loadSalesRepAssignments() {
    if (!user || user.role !== "admin" || !authToken) return;
    setSalesRepAssignmentsLoading(true);
    setSalesRepAssignmentsError("");
    try {
      const payload = await apiRequest("/api/admin/sales-reps/assignments", {
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      const assignments = Array.isArray(payload?.assignments) ? payload.assignments : [];
      const reps = Array.isArray(payload?.salesReps) ? payload.salesReps : [];
      setSalesRepAssignments(assignments);
      setSalesRepUsers(reps);
      if (!selectedAssignmentCompany && assignments.length) {
        setSelectedAssignmentCompany(String(assignments[0].company || ""));
      }
    } catch (error) {
      setSalesRepAssignmentsError(error.message || "Failed to load sales rep assignments.");
    } finally {
      setSalesRepAssignmentsLoading(false);
    }
  }

  async function saveSalesRepAssignment() {
    if (!selectedAssignmentCompany) return;
    try {
      setSalesRepAssignmentsLoading(true);
      setSalesRepAssignmentsError("");
      setSalesRepAssignmentNotice("");
      await apiRequest("/api/admin/sales-reps/assignments", {
        method: "PUT",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: {
          company: selectedAssignmentCompany,
          salesRepUserId: selectedSalesRepUserId ? Number(selectedSalesRepUserId) : null
        }
      });
      setSalesRepAssignmentNotice(`Assignment updated for ${selectedAssignmentCompany}.`);
      await loadSalesRepAssignments();
    } catch (error) {
      setSalesRepAssignmentsError(error.message || "Failed to save assignment.");
    } finally {
      setSalesRepAssignmentsLoading(false);
    }
  }

  async function loadSalesRepDashboard() {
    if (!authToken || !user || normalizeUserRole(user.role) !== "sales_rep") return;
    setSalesRepDashboardLoading(true);
    setSalesRepDashboardError("");
    try {
      const payload = await apiRequest("/api/sales-rep/dashboard", {
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      setSalesRepDashboard(payload || null);
    } catch (error) {
      setSalesRepDashboardError(error.message || "Failed to load sales dashboard.");
      setSalesRepDashboard(null);
    } finally {
      setSalesRepDashboardLoading(false);
    }
  }

  const loadAdminUserCartActivity = async (targetUserId = historySeedUserId) => {
    if (!user || user.role !== "admin" || !authToken || !targetUserId) return;
    setAdminUserCartActivityLoading(true);
    setAdminUserCartActivityError("");
    try {
      const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(targetUserId)}/cart-activity?limit=400`, {
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      setAdminUserCartActivity(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setAdminUserCartActivityError(error.message || "Failed to load user cart activity.");
    } finally {
      setAdminUserCartActivityLoading(false);
    }
  };

  const updateCart = (next) => {
    setCart(next);
    if (cartKey) {
      writeJson(sessionStorage, cartKey, next);
    }
  };

  useEffect(() => {
    if (!users.length) {
      if (historySeedUserId) setHistorySeedUserId("");
      return;
    }
    const exists = users.some((u) => String(u.id) === String(historySeedUserId));
    if (!historySeedUserId || !exists) {
      setHistorySeedUserId(String(users[0].id));
    }
  }, [users, historySeedUserId]);

  useEffect(() => {
    if (!selectedAssignmentCompany) {
      setSelectedSalesRepUserId("");
      return;
    }
    const match = salesRepAssignments.find((row) => String(row.company || "") === String(selectedAssignmentCompany));
    setSelectedSalesRepUserId(match?.salesRepUserId ? String(match.salesRepUserId) : "");
  }, [selectedAssignmentCompany, salesRepAssignments]);

  useEffect(() => {
    if (route !== "users" || user?.role !== "admin" || !authToken || !historySeedUserId) return;
    loadAdminUserCartActivity(historySeedUserId);
  }, [route, user, authToken, historySeedUserId]);

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
      const viewKeys = categorySavedFilterViewKeys(selectedCategory);
      const payloads = await Promise.all(viewKeys.map(async (viewKey) => {
        try {
          return await apiRequest(`/api/filters/saved?view=${encodeURIComponent(viewKey)}`, {
            token: authToken,
            refreshToken,
            onAuthUpdate: applyAuthTokens,
            onAuthFail: clearAuthState
          });
        } catch {
          return [];
        }
      }));
      setSavedFilters(mergeSavedFiltersById(payloads.flatMap((entry) => (Array.isArray(entry) ? entry : []))));
    } catch (error) {
      setSavedFilters([]);
      setSavedFiltersError(error.message || "Failed to load saved filters.");
    } finally {
      setSavedFiltersLoading(false);
    }
  };

  const refreshShortcutFilters = async () => {
    if (!user || !authToken) {
      setShortcutFiltersByCategory({});
      return;
    }
    const shortcutCategoryKeys = [...new Set([...categoryNames, ALL_CATEGORIES_KEY])];
    const entries = await Promise.all(shortcutCategoryKeys.map(async (categoryName) => {
      try {
        const viewKeys = categorySavedFilterViewKeys(categoryName);
        const payloads = await Promise.all(viewKeys.map(async (viewKey) => {
          try {
            return await apiRequest(`/api/filters/saved?view=${encodeURIComponent(viewKey)}`, {
              token: authToken,
              refreshToken,
              onAuthUpdate: applyAuthTokens,
              onAuthFail: clearAuthState
            });
          } catch {
            return [];
          }
        }));
        return [categoryName, mergeSavedFiltersById(payloads.flatMap((entry) => (Array.isArray(entry) ? entry : [])))];
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
    if (!action || typeof action !== "object") return;
    if (action.type === "add_lines_to_request") {
      const lines = Array.isArray(action?.payload?.lines) ? action.payload.lines : [];
      if (!lines.length) {
        setAiCopilotMessages((prev) => [...prev, {
          role: "assistant",
          text: "I couldn't find any available items to add from that historical order.",
          action: null,
          topic: "requested_items",
          timestamp: new Date().toISOString()
        }]);
        return;
      }
      let next = [...cart];
      let applied = 0;
      for (const rawLine of lines) {
        const deviceId = String(rawLine?.deviceId || rawLine?.productId || "").trim();
        const product = products.find((p) => String(p.id) === deviceId);
        if (!product) continue;
        const quantity = Math.max(1, Math.min(9999, Math.floor(Number(rawLine.quantity || 1))));
        const offerPrice = Number.isFinite(Number(rawLine.offerPrice)) ? Number(rawLine.offerPrice) : Number(product.price || 0);
        const note = String(rawLine.note || "Added by AI copilot").slice(0, 200);
        const existing = next.find((i) => i.productId === product.id && i.note === note);
        if (existing) {
          next = next.map((i) => (i.id === existing.id
            ? { ...i, quantity: Math.min(9999, Number(i.quantity || 0) + quantity), offerPrice }
            : i));
        } else {
          next.push({
            id: crypto.randomUUID(),
            productId: product.id,
            model: product.model,
            grade: product.grade,
            quantity,
            offerPrice,
            note
          });
        }
        applied += 1;
      }
      if (!applied) {
        setAiCopilotMessages((prev) => [...prev, {
          role: "assistant",
          text: "I couldn't add those historical items because none were found in the current catalog.",
          action: null,
          topic: "requested_items",
          timestamp: new Date().toISOString()
        }]);
        return;
      }
      setAiCopilotCurrentTopic("requested_items");
      updateCart(next);
      setCartNotice(`Added ${applied} historical item${applied === 1 ? "" : "s"} to Requested items.`);
      if (cartNoticeTimerRef.current) {
        clearTimeout(cartNoticeTimerRef.current);
      }
      cartNoticeTimerRef.current = setTimeout(() => {
        setCartNotice("");
      }, 2200);
      return;
    }
    if (action.type === "add_to_request") {
      const payload = action.payload && typeof action.payload === "object" ? action.payload : {};
      const deviceId = String(payload.deviceId || payload.productId || "").trim();
      const product = products.find((p) => String(p.id) === deviceId);
      if (!product) {
        setAiCopilotMessages((prev) => [...prev, {
          role: "assistant",
          text: "I couldn't find that device in the current catalog, so I could not add it.",
          action: null,
          topic: "requested_items",
          timestamp: new Date().toISOString()
        }]);
        return;
      }
      setAiCopilotCurrentTopic("requested_items");
      const quantity = Math.max(1, Math.min(9999, Math.floor(Number(payload.quantity || 1))));
      const offerPrice = Number.isFinite(Number(payload.offerPrice)) ? Number(payload.offerPrice) : Number(product.price || 0);
      const note = String(payload.note || "Added by AI copilot").slice(0, 200);
      addToCart(product, quantity, note, offerPrice);
      return;
    }
    if (action.type !== "apply_filters") return;
    setAiCopilotCurrentTopic("product_discovery");
    const payload = sanitizeFilterPayload(action.payload);
    const matchingCount = products.filter((p) => deviceMatchesFilterPayload(p, payload)).length;
    if (matchingCount <= 0) {
      aiCopilotPendingResultCheckRef.current = null;
      setAiCopilotMessages((prev) => [...prev, {
        role: "assistant",
        text: "These suggested filters would return no devices, so I did not apply them. Try broader filters or another category.",
        action: null,
        topic: "product_discovery",
        timestamp: new Date().toISOString()
      }]);
      return;
    }
    aiCopilotPendingResultCheckRef.current = {
      waitingForLoadStart: true
    };
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
    const pending = aiCopilotPendingResultCheckRef.current;
    if (!pending || productsView !== "category") return;
    if (categoryLoading) {
      pending.waitingForLoadStart = false;
      return;
    }
    if (pending.waitingForLoadStart) return;
    aiCopilotPendingResultCheckRef.current = null;
    if (productsError || categoryTotal > 0) return;
    setAiCopilotMessages((prev) => [...prev, {
      role: "assistant",
      text: "I applied the suggested filters, but no devices matched. Try broadening the filters or selecting another category.",
      action: null,
      topic: "product_discovery",
      timestamp: new Date().toISOString()
    }]);
  }, [productsView, categoryLoading, categoryTotal, productsError]);

  useEffect(() => {
    if (!aiCopilotOpen) return;
    const node = aiCopilotFeedRef.current;
    if (!node) return;
    const frame = window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [aiCopilotOpen, aiCopilotMessages, aiCopilotLoading]);

  function handleAiCopilotResizeAtY(clientY) {
    const state = aiCopilotResizeRef.current;
    if (!state.active) return;
    const minHeight = Math.max(1, Math.round(aiCopilotMinPanelHeight || state.startHeight));
    const maxHeight = Math.max(minHeight, Math.floor(window.innerHeight - 24));
    const delta = state.startY - Number(clientY || 0);
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, Math.round(state.startHeight + delta)));
    setAiCopilotPanelHeight(nextHeight);
  }

  function handleAiCopilotResizeMouseMove(event) {
    handleAiCopilotResizeAtY(event.clientY);
  }

  function handleAiCopilotResizeTouchMove(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    handleAiCopilotResizeAtY(touch.clientY);
  }

  function stopAiCopilotResize() {
    aiCopilotResizeRef.current = { active: false, startY: 0, startHeight: 0 };
    window.removeEventListener("mousemove", handleAiCopilotResizeMouseMove);
    window.removeEventListener("mouseup", stopAiCopilotResize);
    window.removeEventListener("touchmove", handleAiCopilotResizeTouchMove);
    window.removeEventListener("touchend", stopAiCopilotResize);
    window.removeEventListener("touchcancel", stopAiCopilotResize);
  }

  function beginAiCopilotResize(startY) {
    if (!aiCopilotOpen) return;
    const panelNode = aiCopilotPanelRef.current;
    if (!panelNode) return;
    const measured = Math.max(1, Math.round(panelNode.getBoundingClientRect().height));
    const startHeight = Math.max(aiCopilotMinPanelHeight || measured, aiCopilotPanelHeight || measured);
    aiCopilotResizeRef.current = {
      active: true,
      startY: Number(startY || 0),
      startHeight
    };
    window.addEventListener("mousemove", handleAiCopilotResizeMouseMove);
    window.addEventListener("mouseup", stopAiCopilotResize);
    window.addEventListener("touchmove", handleAiCopilotResizeTouchMove, { passive: true });
    window.addEventListener("touchend", stopAiCopilotResize);
    window.addEventListener("touchcancel", stopAiCopilotResize);
  }

  function startAiCopilotResizeMouse(event) {
    event.preventDefault();
    beginAiCopilotResize(event.clientY);
  }

  function startAiCopilotResizeTouch(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    beginAiCopilotResize(touch.clientY);
  }

  function isCopilotShowMoreFollowUp(messageRaw) {
    const message = String(messageRaw || "").trim().toLowerCase();
    if (!message) return false;
    return /^(more|more\?|show more|next|next page|continue)$/i.test(message);
  }

  function isCopilotDirectAddIntent(messageRaw) {
    const message = String(messageRaw || "").trim().toLowerCase();
    if (!message) return false;
    return /\b(add|include|put)\b/.test(message)
      && /\b(request|requested items?|quote|order|cart)\b/.test(message);
  }

  function polishCopilotOutgoingMessage(messageRaw) {
    const base = String(messageRaw || "").replace(/\s+/g, " ").trim();
    if (!base) return "";
    let next = base;
    if (/^[a-z]/.test(next)) {
      next = `${next.charAt(0).toUpperCase()}${next.slice(1)}`;
    }
    if (/[.!?]$/.test(next)) return next;
    const looksLikeQuestion = /^(who|what|when|where|why|how|is|are|am|do|does|did|can|could|would|should|will|won't|have|has|had|which)\b/i.test(next)
      || /\b(can you|could you|would you|will you)\b/i.test(next);
    return `${next}${looksLikeQuestion ? "?" : "."}`;
  }

  function findLatestExpandableCopilotMessage(messages, visibleCountByMessage) {
    const recent = Array.isArray(messages) ? messages.slice(-10) : [];
    for (let idx = recent.length - 1; idx >= 0; idx -= 1) {
      const message = recent[idx];
      if (message?.role !== "assistant") continue;
      const actionType = String(message?.action?.type || "");
      if (actionType !== "choose_devices" && actionType !== "choose_filters") continue;
      const optionList = Array.isArray(message?.action?.options) ? message.action.options : [];
      if (!optionList.length) continue;
      const messageKey = `${String(message.timestamp || "")}:${String(message.text || "").slice(0, 80)}:${idx}`;
      const visible = Math.max(10, Number(visibleCountByMessage?.[messageKey] || 10));
      if (optionList.length > visible) {
        return {
          messageKey,
          nextVisibleCount: Math.min(optionList.length, visible + 10),
          total: optionList.length
        };
      }
    }
    return null;
  }

  const runAiCopilot = async (messageOverride = null) => {
    if (!authToken || !user || aiCopilotLoading) return;
    if (aiCopilotListening) {
      stopAiCopilotVoice();
    }
    const safeOverride = typeof messageOverride === "string" ? messageOverride : null;
    const message = polishCopilotOutgoingMessage(String((safeOverride ?? aiCopilotInput) || ""));
    if (!message) {
      setAiCopilotError("Enter a message first.");
      return;
    }
    if (isCopilotShowMoreFollowUp(message)) {
      const expandable = findLatestExpandableCopilotMessage(aiCopilotMessages, aiCopilotOptionVisibleCountByMessage);
      if (expandable) {
        const now = new Date().toISOString();
        setAiCopilotError("");
        setAiCopilotMessages((prev) => [...prev, {
          role: "user",
          text: message,
          topic: aiCopilotCurrentTopic,
          timestamp: now
        }, {
          role: "assistant",
          text: `Showing more options (${expandable.nextVisibleCount}/${expandable.total}).`,
          action: null,
          topic: aiCopilotCurrentTopic,
          timestamp: now
        }]);
        setAiCopilotOptionVisibleCountByMessage((prev) => ({
          ...prev,
          [expandable.messageKey]: expandable.nextVisibleCount
        }));
        setAiCopilotInput("");
        return;
      }
    }
    setAiCopilotLoading(true);
    setAiCopilotError("");
    setAiCopilotVoiceError("");
    setAiCopilotMessages((prev) => [...prev, {
      role: "user",
      text: message,
      topic: aiCopilotCurrentTopic,
      timestamp: new Date().toISOString()
    }]);
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
          selectedCategory,
          topicHint: aiCopilotCurrentTopic,
          chatHistory: aiCopilotMessages
            .slice(-12)
            .map((entry) => ({
              role: entry?.role === "assistant" ? "assistant" : "user",
              text: String(entry?.text || "").trim(),
              topic: AI_COPILOT_TOPICS.has(String(entry?.topic || "").trim().toLowerCase()) ? String(entry.topic).trim().toLowerCase() : "general",
              timestamp: entry?.timestamp || null
            }))
            .filter((entry) => entry.text)
        }
      });
      await new Promise((resolve) => {
        window.setTimeout(resolve, 650);
      });
      const nextTopic = String(payload?.topic || "").trim().toLowerCase();
      if (AI_COPILOT_TOPICS.has(nextTopic)) {
        setAiCopilotCurrentTopic(nextTopic);
      }
      const suggestedAction = payload.action && typeof payload.action === "object" ? payload.action : null;
      const shouldAutoApplyAddAction = isCopilotDirectAddIntent(message)
        && (suggestedAction?.type === "add_to_request" || suggestedAction?.type === "add_lines_to_request");
      if (shouldAutoApplyAddAction) {
        applyCopilotAction(suggestedAction);
      }
      if (suggestedAction?.type === "apply_filters") {
        const suggestedPayload = sanitizeFilterPayload(suggestedAction.payload);
        const suggestedCount = products.filter((p) => deviceMatchesFilterPayload(p, suggestedPayload)).length;
        if (suggestedCount <= 0) {
          setAiCopilotMessages((prev) => [...prev, {
            role: "assistant",
            text: buildCopilotNoMatchReply(suggestedPayload, products),
            action: null,
            topic: AI_COPILOT_TOPICS.has(nextTopic) ? nextTopic : aiCopilotCurrentTopic,
            timestamp: new Date().toISOString()
          }]);
          return;
        }
      }
      setAiCopilotMessages((prev) => [...prev, {
        role: "assistant",
        text: payload.reply || "I could not generate a response.",
        action: shouldAutoApplyAddAction ? null : suggestedAction,
        topic: AI_COPILOT_TOPICS.has(nextTopic) ? nextTopic : aiCopilotCurrentTopic,
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      setAiCopilotError(error.message || "AI copilot failed.");
    } finally {
      setAiCopilotLoading(false);
    }
  };

  const stopAiCopilotVoice = useCallback(() => {
    if (aiCopilotVoiceAutoSendTimerRef.current) {
      clearTimeout(aiCopilotVoiceAutoSendTimerRef.current);
      aiCopilotVoiceAutoSendTimerRef.current = null;
    }
    const recognition = aiCopilotSpeechRef.current;
    if (!recognition) {
      setAiCopilotListening(false);
      return;
    }
    try {
      recognition.stop();
    } catch {
      // ignore stop errors from already-stopped recognizer
    }
    aiCopilotSpeechRef.current = null;
    setAiCopilotListening(false);
  }, []);

  const toggleAiCopilotVoice = useCallback(() => {
    if (aiCopilotListening) {
      const autoMessage = String(aiCopilotVoiceAutoSendTextRef.current || aiCopilotInputRef.current || "").trim();
      stopAiCopilotVoice();
      if (autoMessage && !aiCopilotVoiceHasSentRef.current && !aiCopilotLoading) {
        aiCopilotVoiceHasSentRef.current = true;
        runAiCopilot(autoMessage);
      }
      return;
    }
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      setAiCopilotVoiceError("Voice input is not supported in this browser.");
      return;
    }
    setAiCopilotVoiceError("");
    const recognition = new SpeechRecognitionCtor();
    const baseInput = String(aiCopilotInput || "").trim();
    aiCopilotVoiceAutoSendTextRef.current = "";
    aiCopilotVoiceHasSentRef.current = false;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let transcript = "";
      let hasFinalResult = false;
      for (let idx = event.resultIndex; idx < event.results.length; idx += 1) {
        transcript += String(event.results[idx]?.[0]?.transcript || "");
        if (event.results[idx]?.isFinal) hasFinalResult = true;
      }
      const cleanTranscript = transcript.trim();
      if (!cleanTranscript) return;
      const nextInput = baseInput ? `${baseInput} ${cleanTranscript}` : cleanTranscript;
      setAiCopilotInput(nextInput);
      aiCopilotVoiceAutoSendTextRef.current = nextInput;
      if (hasFinalResult && !aiCopilotVoiceHasSentRef.current && !aiCopilotLoading) {
        aiCopilotVoiceHasSentRef.current = true;
        runAiCopilot(nextInput);
      }
    };
    recognition.onerror = (event) => {
      const code = String(event?.error || "").toLowerCase();
      if (code === "not-allowed" || code === "service-not-allowed") {
        setAiCopilotVoiceError("Microphone permission was denied.");
      } else if (code === "no-speech") {
        setAiCopilotVoiceError("No speech detected. Try again.");
      } else {
        setAiCopilotVoiceError("Voice input failed. Please try again.");
      }
    };
    recognition.onend = () => {
      aiCopilotSpeechRef.current = null;
      setAiCopilotListening(false);
      if (aiCopilotVoiceAutoSendTimerRef.current) {
        clearTimeout(aiCopilotVoiceAutoSendTimerRef.current);
      }
      aiCopilotVoiceAutoSendTimerRef.current = setTimeout(() => {
        const autoMessage = String(aiCopilotVoiceAutoSendTextRef.current || aiCopilotInputRef.current || "").trim();
        aiCopilotVoiceAutoSendTextRef.current = "";
        aiCopilotVoiceAutoSendTimerRef.current = null;
        if (autoMessage && !aiCopilotVoiceHasSentRef.current && !aiCopilotLoading) {
          aiCopilotVoiceHasSentRef.current = true;
          runAiCopilot(autoMessage);
        }
      }, 260);
    };
    aiCopilotSpeechRef.current = recognition;
    setAiCopilotListening(true);
    try {
      recognition.start();
    } catch {
      aiCopilotSpeechRef.current = null;
      setAiCopilotListening(false);
      setAiCopilotVoiceError("Could not start voice input.");
    }
  }, [aiCopilotInput, aiCopilotListening, aiCopilotLoading, stopAiCopilotVoice, runAiCopilot]);

  useEffect(() => () => {
    if (aiCopilotVoiceAutoSendTimerRef.current) {
      clearTimeout(aiCopilotVoiceAutoSendTimerRef.current);
      aiCopilotVoiceAutoSendTimerRef.current = null;
    }
    const recognition = aiCopilotSpeechRef.current;
    if (!recognition) return;
    try { recognition.stop(); } catch {}
    aiCopilotSpeechRef.current = null;
  }, []);

  useEffect(() => {
    if (!aiCopilotOpen && aiCopilotListening) {
      stopAiCopilotVoice();
    }
  }, [aiCopilotOpen, aiCopilotListening, stopAiCopilotVoice]);

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
      const defaultViewKey = categorySavedFilterViewKey(selectedCategory);
      const activeViewKey = String(activeEditedSavedFilter?.viewKey || "").trim() || defaultViewKey;
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
            viewKey: activeViewKey,
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
            viewKey: defaultViewKey,
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
      const viewKey = String(savedFilter?.viewKey || "").trim() || categorySavedFilterViewKey(selectedCategory);
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

  const openRequestLineProduct = (line) => {
    const productId = String(line?.productId || "").trim();
    const model = String(line?.model || "").trim().toLowerCase();
    const grade = String(line?.grade || "").trim().toLowerCase();
    const matched = products.find((p) => String(p.id || "") === productId)
      || products.find((p) => (
        String(p.model || "").trim().toLowerCase() === model
        && String(p.grade || "").trim().toLowerCase() === grade
      ))
      || products.find((p) => String(p.model || "").trim().toLowerCase() === model)
      || null;
    if (!matched) return;
    setActiveImageIndex(0);
    setActiveProduct(matched);
  };

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

  const openGradeGuide = (code) => {
    const normalized = normalizeGradeCode(code);
    setGradeGuideSelectedCode(normalized);
    setGradeGuideOpen(true);
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
      const created = await apiRequest("/api/requests", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { lines, preferredLocation: selectedRequestLocation }
      });
      try {
        const netsuitePayloadValidation = await apiRequest("/api/ai/validate-netsuite-payload", {
          method: "POST",
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState,
          body: {
            payload: {
              requestId: created.id || "",
              requestNumber: created.requestNumber || "",
              company: user.company,
              currencyCode: "USD",
              lines
            }
          }
        });
        if (netsuitePayloadValidation?.valid) {
          await apiRequest("/api/integrations/netsuite/estimates/dummy", {
            method: "POST",
            token: authToken,
            refreshToken,
            onAuthUpdate: applyAuthTokens,
            onAuthFail: clearAuthState,
            body: { requestId: created.id }
          });
        } else {
          const firstError = Array.isArray(netsuitePayloadValidation?.errors) && netsuitePayloadValidation.errors.length
            ? netsuitePayloadValidation.errors[0]
            : "NetSuite payload validation failed.";
          setRequestsError(`Request created, but estimate sync was skipped: ${firstError}`);
        }
      } catch (syncError) {
        setRequestsError(`Request created, but estimate sync failed: ${syncError.message || "Unknown error"}`);
      }
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

  const handleAuth0Login = async () => {
    auth0LogoutInProgressRef.current = false;
    clearAuth0LogoutRequested();
    markAuth0InteractiveLoginPending();
    setAuthPendingApprovalEmail("");
    setAuthProfileRequired(false);
    await loginWithRedirect({
      authorizationParams: {
        prompt: "login"
      }
    });
  };

  const handleAuth0Signup = async () => {
    auth0LogoutInProgressRef.current = false;
    clearAuth0LogoutRequested();
    markAuth0InteractiveLoginPending();
    setAuthPendingApprovalEmail("");
    setAuthProfileRequired(false);
    await loginWithRedirect({
      authorizationParams: {
        prompt: "login",
        screen_hint: "signup"
      }
    });
  };

  const returnToLoginAfterAuth0PendingFlow = async () => {
    auth0LogoutInProgressRef.current = true;
    markAuth0LogoutRequested();
    clearAuth0InteractiveLoginPending();
    setAuthProfileRequired(false);
    setAuthProfilePrefill({ firstName: "", lastName: "", company: "", email: "" });
    setAuthPendingApprovalEmail("");
    setAuthBootstrapError("");
    clearAuthState();
    try {
      await auth0Logout({
        logoutParams: {
          returnTo: window.location.origin
        }
      });
    } catch {}
  };

  const handleCompleteAuth0Profile = async ({ firstName, lastName, company }) => {
    const accessToken = await getAccessTokenSilently();
    const payload = await apiRequest("/api/auth/complete-profile", {
      method: "POST",
      body: { accessToken, firstName, lastName, company },
      skipRefresh: true
    });
    setAuthProfileRequired(false);
    setAuthProfilePrefill({ firstName: "", lastName: "", company: "", email: "" });
    if (payload?.pendingApproval) {
      setAuthPendingApprovalEmail(String(payload.email || ""));
      return { pendingApproval: true, email: payload.email || "" };
    }
    return { pendingApproval: false };
  };

  const handleAuth0ProfileContinueLater = async () => {
    await returnToLoginAfterAuth0PendingFlow();
  };

  const handleAuth0CancelRegistration = async () => {
    const accessToken = await getAccessTokenSilently();
    await apiRequest("/api/auth/cancel-registration", {
      method: "POST",
      body: { accessToken },
      skipRefresh: true
    });
    await returnToLoginAfterAuth0PendingFlow();
  };

  const logout = () => {
    auth0LogoutInProgressRef.current = true;
    markAuth0LogoutRequested();
    clearAuth0InteractiveLoginPending();
    apiRequest("/api/auth/logout", {
      method: "POST",
      token: authToken,
      body: { refreshToken },
      skipRefresh: true
    }).catch(() => {});
    clearAuthState();
    resetViewStateToHome();
    auth0Logout({
      logoutParams: {
        returnTo: window.location.origin
      }
    }).catch(() => {});
  };

  const createUserAsAdmin = async (e) => {
    e.preventDefault();
    if (!newUserEmail || !newUserCompany) return;
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
          role: newUserRole,
          isActive: newUserIsActive,
        }
      });
      setNewUserEmail("");
      setNewUserCompany("");
      setNewUserIsActive(false);
      setNewUserRole("buyer");
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

  const showSessionWarning = Boolean(user && sessionTimeLeftMs !== null && sessionTimeLeftMs > 0 && sessionTimeLeftMs <= SESSION_WARNING_MS);
  const closeGradeGuide = useCallback(() => setGradeGuideOpen(false), []);
  const closeActiveProduct = useCallback(() => setActiveProduct(null), []);
  const closeCartDialog = useCallback(() => setCartOpen(false), []);
  useDialogA11y({ isOpen: showSessionWarning, dialogRef: sessionExpiryModalRef, closeOnEscape: false });
  useDialogA11y({ isOpen: gradeGuideOpen, dialogRef: gradeGuideModalRef, onClose: closeGradeGuide });
  useDialogA11y({ isOpen: Boolean(activeProduct), dialogRef: productModalRef, onClose: closeActiveProduct });
  useDialogA11y({ isOpen: cartOpen, dialogRef: cartModalRef, onClose: closeCartDialog });

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
    if (loggedOutReason === "expired") {
      return (
        <LoggedOutScreen onBackToSignIn={() => setLoggedOutReason("")} />
      );
    }
    return (
      <Login
        onAuth0Login={handleAuth0Login}
        onAuth0Signup={handleAuth0Signup}
        onAuth0CompleteProfile={handleCompleteAuth0Profile}
        onAuth0ProfileContinueLater={handleAuth0ProfileContinueLater}
        onAuth0CancelRegistration={handleAuth0CancelRegistration}
        onClearPendingApproval={() => {
          setAuthPendingApprovalEmail("");
          setAuthBootstrapError("");
          setAuthProfileRequired(false);
        }}
        auth0Loading={auth0SdkLoading}
        auth0ErrorText={authBootstrapError || auth0SdkError?.message || ""}
        auth0PendingApprovalEmail={authPendingApprovalEmail}
        auth0ProfileRequired={authProfileRequired}
        auth0ProfilePrefill={authProfilePrefill}
      />
    );
  }

  const navItems = user.role === "admin"
    ? [...baseNavItems, { key: "users", label: "Users", icon: "U" }]
    : baseNavItems;

  const categories = categoryNames;
  const weeklySpecialDevices = products.filter((p) => p.weeklySpecial === true);
  const weeklySpecialAdminDevices = products
    .filter((p) => `${p.manufacturer} ${p.model}`.toLowerCase().includes(weeklySpecialSearch.toLowerCase()))
    .slice(0, 120);
  const source = selectedCategory === ALL_CATEGORIES_KEY
    ? products
    : products.filter((p) => p.category === selectedCategory);
  const selectedCategoryLabel = selectedCategory === ALL_CATEGORIES_KEY ? ALL_CATEGORIES_LABEL : selectedCategory;
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

  const seedHistoryForUserAsAdmin = async () => {
    if (!historySeedUserId) {
      setUsersError("Select a user first.");
      return;
    }
    try {
      setHistorySeedLoading(true);
      setUsersError("");
      setHistorySeedNotice("");
      const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(historySeedUserId)}/seed-history`, {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { count: 20 }
      });
      const created = Number(payload?.created || 0);
      const email = String(payload?.targetUser?.email || "");
      setHistorySeedNotice(`Created ${created} completed historical estimates for ${email || "selected user"}.`);
      await Promise.all([refreshRequests(), loadAdminAiInsights()]);
    } catch (error) {
      setUsersError(error.message || "Failed to seed user estimate history.");
    } finally {
      setHistorySeedLoading(false);
    }
  };

  const seedCartActivityForUserAsAdmin = async () => {
    if (!historySeedUserId) {
      setUsersError("Select a user first.");
      return;
    }
    try {
      setCartActivitySeedLoading(true);
      setUsersError("");
      setCartActivitySeedNotice("");
      const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(historySeedUserId)}/seed-cart-activity`, {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { count: 20 }
      });
      const created = Number(payload?.created || 0);
      const email = String(payload?.targetUser?.email || "");
      setCartActivitySeedNotice(`Added ${created} not-requested cart items for ${email || "selected user"}.`);
      await loadAdminUserCartActivity(historySeedUserId);
    } catch (error) {
      setUsersError(error.message || "Failed to seed cart activity.");
    } finally {
      setCartActivitySeedLoading(false);
    }
  };

  const resetAiChatHistoryForUserAsAdmin = () => {
    if (!historySeedUserId) {
      setUsersError("Select a user first.");
      return;
    }
    try {
      setHistoryChatResetLoading(true);
      setUsersError("");
      setHistoryChatResetNotice("");
      const target = users.find((u) => String(u.id) === String(historySeedUserId));
      if (!target) {
        setUsersError("Selected user was not found.");
        return;
      }
      const targetEmail = normalizeEmail(target.email);
      const targetStateKey = `${AI_COPILOT_STATE_KEY_PREFIX}${String(target.id || "anon")}.${targetEmail}`;
      localStorage.removeItem(targetStateKey);

      if (String(user?.id || "") === String(target.id || "") && normalizeEmail(user?.email) === targetEmail) {
        setAiCopilotMessages([]);
        setAiCopilotInput("");
        setAiCopilotGreetingTyping(false);
        setAiCopilotError("");
        setAiCopilotOpen(false);
        setAiCopilotWelcomePending(false);
        setAiCopilotCurrentTopic("general");
        setAiCopilotPanelHeight(0);
        setAiCopilotMinPanelHeight(0);
      }

      setHistoryChatResetNotice(`AI chat history was cleared for ${target.email}.`);
    } catch (error) {
      setUsersError(error.message || "Failed to clear AI chat history.");
    } finally {
      setHistoryChatResetLoading(false);
    }
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
      setSyncStatus(null);
      await apiRequest("/api/integrations/boomi/inventory/sync", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState
      });
      const pollStartedAt = Date.now();
      const pollTimeoutMs = 10 * 60 * 1000;
      while (Date.now() - pollStartedAt < pollTimeoutMs) {
        const payload = await apiRequest("/api/integrations/boomi/inventory/sync/status", {
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState
        });
        const status = payload?.status || {};
        setSyncStatus(status);
        if (!status.running) {
          if (status.error) {
            throw new Error(status.error);
          }
          setSyncResult({
            fetched: Number(status.fetched || 0),
            processed: Number(status.processed || 0),
            skipped: Number(status.skipped || 0),
            durationMs: Number(status.durationMs || 0)
          });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      throw new Error("Sync timed out while waiting for completion.");
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

  const seedRealDevicesForAdmin = async () => {
    try {
      setAdminCatalogLoading(true);
      setAdminCatalogError("");
      setAdminCatalogResult("");
      setAdminRealSeedStatus(null);
      const payload = await apiRequest("/api/admin/catalog/seed-real", {
        method: "POST",
        token: authToken,
        refreshToken,
        onAuthUpdate: applyAuthTokens,
        onAuthFail: clearAuthState,
        body: { countPerCategory: 100 }
      });
      const pollStartedAt = Date.now();
      const pollTimeoutMs = 10 * 60 * 1000;
      while (Date.now() - pollStartedAt < pollTimeoutMs) {
        const statusPayload = await apiRequest("/api/admin/catalog/seed-real/status", {
          token: authToken,
          refreshToken,
          onAuthUpdate: applyAuthTokens,
          onAuthFail: clearAuthState
        });
        const status = statusPayload?.status || {};
        setAdminRealSeedStatus(status);
        if (!status.running) {
          if (status.error) {
            throw new Error(status.error);
          }
          setAdminCatalogResult(
            `Realistic seed complete. Processed ${Number(status.processed || 0)} of ${Number(status.totalPlanned || 0)} devices.`
          );
          return;
        }
        setAdminCatalogResult(
          `Seeding realistic devices... ${Number(status.processed || 0)} / ${Math.max(1, Number(status.totalPlanned || 0))}`
        );
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      throw new Error("Seed operation timed out while waiting for completion.");
    } catch (error) {
      setAdminCatalogError(error.message || "Failed to seed realistic devices.");
    } finally {
      setAdminCatalogLoading(false);
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
          if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
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
  const totalInventoryUnits = products.reduce((sum, p) => sum + Math.max(0, Number(p.available || 0)), 0);
  const inStockProducts = products.filter((p) => Number(p.available || 0) > 0).length;
  const lowStockProducts = products.filter((p) => {
    const available = Number(p.available || 0);
    return available > 0 && available <= 10;
  }).length;
  const completedRequestsCount = requests.filter((r) => String(r.status || "").toLowerCase() === "completed").length;
  const openRequestsCount = Math.max(0, requests.length - completedRequestsCount);
  const requestsTotalValue = requests.reduce((sum, r) => sum + Number(r.total || 0), 0);
  const averageRequestValue = requests.length ? (requestsTotalValue / requests.length) : 0;
  const last30DaysCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const requestsLast30Days = requests.filter((r) => {
    const ts = new Date(r.createdAt).getTime();
    return Number.isFinite(ts) && ts >= last30DaysCutoff;
  });
  const recentRequests = [...requests]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);
  const requestStatusSummary = Array.from(requests.reduce((map, request) => {
    const status = String(request.status || "Unknown").trim() || "Unknown";
    map.set(status, (map.get(status) || 0) + 1);
    return map;
  }, new Map()).entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
  const requestStatusMax = Math.max(1, ...requestStatusSummary.map((entry) => entry.count));
  const categoryInventorySummary = Array.from(products.reduce((map, product) => {
    const category = String(product.category || "Other");
    const entry = map.get(category) || { category, units: 0, products: 0 };
    entry.units += Math.max(0, Number(product.available || 0));
    entry.products += 1;
    map.set(category, entry);
    return map;
  }, new Map()).values())
    .sort((a, b) => b.units - a.units);
  const categoryInventoryMax = Math.max(1, ...categoryInventorySummary.map((entry) => entry.units));
  const topWeeklySpecials = weeklySpecialDevices
    .slice()
    .sort((a, b) => Number(b.available || 0) - Number(a.available || 0))
    .slice(0, 5);
  const dashboardUserCount = user.role === "admin" ? users.length : null;
  const dashboardConversionRate = requests.length
    ? Math.round((completedRequestsCount / requests.length) * 100)
    : 0;
  const salesSummary = salesRepDashboard?.summary || {};
  const salesCompanyStats = Array.isArray(salesRepDashboard?.companyStats) ? salesRepDashboard.companyStats : [];
  const salesRecentRequests = Array.isArray(salesRepDashboard?.recentRequests) ? salesRepDashboard.recentRequests : [];
  const salesDashboardConversionRate = Number(salesSummary.totalRequests || 0) > 0
    ? Math.round((Number(salesSummary.completedRequests || 0) / Number(salesSummary.totalRequests || 1)) * 100)
    : 0;
  const dashboardInventoryLoading = productsLoading;
  const dashboardRequestsLoading = requestsLoading;
  const dashboardUsersLoading = user.role === "admin" && usersLoading;
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
  const aiCopilotVoiceSupported = Boolean(getSpeechRecognitionCtor());
  const modalImages = activeProduct ? (activeProduct.images?.length ? activeProduct.images : [imageFor(activeProduct)]) : [];
  const canCarousel = modalImages.length > 1;
  const activeModalImage = modalImages[activeImageIndex] || modalImages[0] || "";
  const modalProductUnavailable = activeProduct ? activeProduct.available < 1 : false;
  const modalAvailableLocations = activeProduct && activeProduct.locations && typeof activeProduct.locations === "object"
    ? Object.entries(activeProduct.locations).filter(([, qty]) => Number(qty || 0) > 0)
    : [];
  const modalOfferPriceInvalid = productOfferPrice === "" || Number(productOfferPrice) < 0;
  const modalQtyInvalid = productQty === "" || !Number.isFinite(Number(productQty)) || Number(productQty) < 1;
  const sessionSecondsLeft = showSessionWarning ? Math.max(0, Math.ceil(sessionTimeLeftMs / 1000)) : 0;
  const sessionCountdown = showSessionWarning
    ? `${Math.floor(sessionSecondsLeft / 60)}:${String(sessionSecondsLeft % 60).padStart(2, "0")}`
    : "0:00";
  const canManageRequests = normalizeUserRole(user?.role) !== "sales_rep";
  const shortcutEntries = [...new Set([...categories, ALL_CATEGORIES_KEY])].flatMap((categoryName) =>
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

  const openWeeklySpecialsFromDashboard = () => {
    setRoute("products");
    setProductsView("weekly");
    setWeeklySearch("");
    setWeeklyFilters({});
    setWeeklyExpandedFilters({});
  };

  return (
    <div className="app-shell">
      <aside className="left-rail">
        <div className="rail-logo"><img className="brand-logo-img" src={logoUrl} alt="Company logo" /></div>
        <nav className="rail-nav">
          {navItems.map((n) => (
            <button key={n.key} className={n.key === route ? "active" : ""} onClick={() => { setRoute(n.key); if (n.key === "products") { setProductsView("home"); setSearch(""); setFilters({}); } }}>
              <span className="nav-icon-wrap">
                {n.icon === "phone" ? <PhoneNavIcon /> : n.icon === "dashboard" ? <DashboardNavIcon /> : <span className="nav-icon">{n.icon}</span>}
              </span>
              <span className="nav-label">{n.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div className="brand-wrap"><span className="dot" /><strong>PCS Wireless</strong></div>
          <div className="top-actions"><span className="muted">{user.fullName || user.email}</span><span className="user-chip">{user.company}</span><button className="ghost-btn" onClick={logout}>Logout</button></div>
        </header>
        <main className="view">
          {route === "dashboard" && (
            <section className="dashboard-wrap">
              {normalizeUserRole(user.role) === "sales_rep" ? (
                <>
                  <div className="dashboard-head panel">
                    <div>
                      <h1 className="page-title" style={{ marginBottom: 6 }}>Sales Rep Dashboard</h1>
                      <p className="small" style={{ margin: 0 }}>Assigned customer performance and pipeline overview.</p>
                    </div>
                    <div className="dashboard-head-actions">
                      <button type="button" className="ghost-btn" style={{ width: "auto" }} onClick={loadSalesRepDashboard} disabled={salesRepDashboardLoading}>
                        {salesRepDashboardLoading ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                  </div>

                  {salesRepDashboardError ? <section className="panel"><p className="small" style={{ color: "#b91c1c", margin: 0 }}>{salesRepDashboardError}</p></section> : null}

                  <div className="dashboard-kpi-grid">
                    <article className="dashboard-kpi-card panel">
                      <div className="dashboard-kpi-label">Assigned Companies</div>
                      {salesRepDashboardLoading ? <div className="skeleton skeleton-line" style={{ width: "44%", height: 24 }} /> : <div className="dashboard-kpi-value">{Number(salesSummary.assignedCompanies || 0)}</div>}
                    </article>
                    <article className="dashboard-kpi-card panel">
                      <div className="dashboard-kpi-label">Total Requests</div>
                      {salesRepDashboardLoading ? <div className="skeleton skeleton-line" style={{ width: "50%", height: 24 }} /> : <div className="dashboard-kpi-value">{Number(salesSummary.totalRequests || 0)}</div>}
                    </article>
                    <article className="dashboard-kpi-card panel">
                      <div className="dashboard-kpi-label">Open Requests</div>
                      {salesRepDashboardLoading ? <div className="skeleton skeleton-line" style={{ width: "48%", height: 24 }} /> : <div className="dashboard-kpi-value">{Number(salesSummary.openRequests || 0)}</div>}
                    </article>
                    <article className="dashboard-kpi-card panel">
                      <div className="dashboard-kpi-label">Completed</div>
                      {salesRepDashboardLoading ? <div className="skeleton skeleton-line" style={{ width: "46%", height: 24 }} /> : <div className="dashboard-kpi-value">{Number(salesSummary.completedRequests || 0)}</div>}
                    </article>
                    <article className="dashboard-kpi-card panel">
                      <div className="dashboard-kpi-label">Portfolio Value</div>
                      {salesRepDashboardLoading ? <div className="skeleton skeleton-line" style={{ width: "66%", height: 24 }} /> : <div className="dashboard-kpi-value">{formatUsd(Number(salesSummary.totalValue || 0))}</div>}
                    </article>
                    <article className="dashboard-kpi-card panel">
                      <div className="dashboard-kpi-label">Completion Rate</div>
                      {salesRepDashboardLoading ? <div className="skeleton skeleton-line" style={{ width: "42%", height: 24 }} /> : <div className="dashboard-kpi-value">{salesDashboardConversionRate}%</div>}
                    </article>
                  </div>

                  <div className="dashboard-grid">
                    <article className="panel dashboard-card">
                      <h3 className="dashboard-card-title">Assigned Companies</h3>
                      {salesRepDashboardLoading ? (
                        <div className="dashboard-bars">
                          {Array.from({ length: 5 }).map((_, idx) => (
                            <div key={`sales-company-sk-${idx}`} className="dashboard-bar-row">
                              <div className="skeleton skeleton-line" style={{ width: `${58 + (idx % 2) * 10}%` }} />
                              <div className="skeleton dashboard-bar-track" />
                            </div>
                          ))}
                        </div>
                      ) : salesCompanyStats.length ? (
                        <ul className="dashboard-list">
                          {salesCompanyStats.slice(0, 12).map((row) => (
                            <li key={`sales-company-${row.company}`}>
                              <span>{row.company} ({Number(row.requestCount || 0)} req)</span>
                              <span>{formatUsd(Number(row.totalValue || 0))}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="small">No assigned companies yet. Ask an admin to assign customers to your profile.</p>
                      )}
                    </article>

                    <article className="panel dashboard-card">
                      <h3 className="dashboard-card-title">Recent Requests</h3>
                      {salesRepDashboardLoading ? (
                        <ul className="dashboard-list">
                          {Array.from({ length: 6 }).map((_, idx) => (
                            <li key={`sales-recent-sk-${idx}`}>
                              <div className="skeleton skeleton-line" style={{ width: `${60 - (idx % 3) * 8}%` }} />
                              <div className="skeleton skeleton-line" style={{ width: "30%" }} />
                            </li>
                          ))}
                        </ul>
                      ) : salesRecentRequests.length ? (
                        <ul className="dashboard-list">
                          {salesRecentRequests.map((requestItem) => (
                            <li key={`sales-recent-${requestItem.id}`}>
                              <span>{requestItem.requestNumber} | {requestItem.company}</span>
                              <span>{new Date(requestItem.createdAt).toLocaleDateString()} | {formatUsd(requestItem.total)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="small">No requests yet for assigned companies.</p>
                      )}
                    </article>
                  </div>
                </>
              ) : (
              <>
              <div className="dashboard-head panel">
                <div>
                  <h1 className="page-title" style={{ marginBottom: 6 }}>Welcome back{user.firstName ? `, ${user.firstName}` : ""}</h1>
                </div>
                <div className="dashboard-head-actions">
                  <button type="button" className="ghost-btn" style={{ width: "auto" }} onClick={() => setRoute("products")}>Browse Products</button>
                  <button type="button" style={{ width: "auto" }} onClick={() => setRoute("requests")}>Open Requests</button>
                </div>
              </div>

              <div className="dashboard-kpi-grid">
                <article className="dashboard-kpi-card panel">
                  <div className="dashboard-kpi-label">Total Inventory Units</div>
                  {dashboardInventoryLoading ? (
                    <div className="dashboard-kpi-skeleton">
                      <div className="skeleton skeleton-line" style={{ width: "60%", height: 24 }} />
                      <div className="skeleton skeleton-line" style={{ width: "72%" }} />
                    </div>
                  ) : (
                    <>
                      <div className="dashboard-kpi-value">{totalInventoryUnits.toLocaleString()}</div>
                      <div className="dashboard-kpi-sub">{inStockProducts} products in stock</div>
                    </>
                  )}
                </article>
                <article className="dashboard-kpi-card panel">
                  <div className="dashboard-kpi-label">Open Requests</div>
                  {dashboardRequestsLoading ? (
                    <div className="dashboard-kpi-skeleton">
                      <div className="skeleton skeleton-line" style={{ width: "56%", height: 24 }} />
                      <div className="skeleton skeleton-line" style={{ width: "68%" }} />
                    </div>
                  ) : (
                    <>
                      <div className="dashboard-kpi-value">{openRequestsCount.toLocaleString()}</div>
                      <div className="dashboard-kpi-sub">{completedRequestsCount} completed</div>
                    </>
                  )}
                </article>
                <article className="dashboard-kpi-card panel">
                  <div className="dashboard-kpi-label">Request Value</div>
                  {dashboardRequestsLoading ? (
                    <div className="dashboard-kpi-skeleton">
                      <div className="skeleton skeleton-line" style={{ width: "74%", height: 24 }} />
                      <div className="skeleton skeleton-line" style={{ width: "84%" }} />
                    </div>
                  ) : (
                    <>
                      <div className="dashboard-kpi-value">{formatUsd(requestsTotalValue)}</div>
                      <div className="dashboard-kpi-sub">Avg {formatUsd(averageRequestValue)} per request</div>
                    </>
                  )}
                </article>
                <article className="dashboard-kpi-card panel">
                  <div className="dashboard-kpi-label">30-Day Activity</div>
                  {dashboardRequestsLoading ? (
                    <div className="dashboard-kpi-skeleton">
                      <div className="skeleton skeleton-line" style={{ width: "52%", height: 24 }} />
                      <div className="skeleton skeleton-line" style={{ width: "62%" }} />
                    </div>
                  ) : (
                    <>
                      <div className="dashboard-kpi-value">{requestsLast30Days.length.toLocaleString()}</div>
                      <div className="dashboard-kpi-sub">{dashboardConversionRate}% completion rate</div>
                    </>
                  )}
                </article>
                <article className="dashboard-kpi-card panel">
                  <div className="dashboard-kpi-label">Weekly Specials</div>
                  {dashboardInventoryLoading ? (
                    <div className="dashboard-kpi-skeleton">
                      <div className="skeleton skeleton-line" style={{ width: "48%", height: 24 }} />
                      <div className="skeleton skeleton-line" style={{ width: "58%" }} />
                    </div>
                  ) : (
                    <>
                      <div className="dashboard-kpi-value">{weeklySpecialDevices.length.toLocaleString()}</div>
                      <div className="dashboard-kpi-sub">{lowStockProducts} low-stock products</div>
                    </>
                  )}
                </article>
                {user.role === "admin" ? (
                  <article className="dashboard-kpi-card panel">
                    <div className="dashboard-kpi-label">Active Users</div>
                    {dashboardUsersLoading ? (
                      <div className="dashboard-kpi-skeleton">
                        <div className="skeleton skeleton-line" style={{ width: "46%", height: 24 }} />
                        <div className="skeleton skeleton-line" style={{ width: "52%" }} />
                      </div>
                    ) : (
                      <>
                        <div className="dashboard-kpi-value">{dashboardUserCount !== null ? dashboardUserCount.toLocaleString() : "-"}</div>
                        <div className="dashboard-kpi-sub">Admin view</div>
                      </>
                    )}
                  </article>
                ) : null}
              </div>

              <div className="dashboard-grid">
                <article className="panel dashboard-card">
                  <h3 className="dashboard-card-title">Inventory by Category</h3>
                  {dashboardInventoryLoading ? (
                    <div className="dashboard-bars">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <div key={`dash-cat-sk-${idx}`} className="dashboard-bar-row">
                          <div className="skeleton skeleton-line" style={{ width: `${58 + (idx % 3) * 8}%` }} />
                          <div className="skeleton dashboard-bar-track" />
                          <div className="skeleton skeleton-line" style={{ width: "26%" }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard-bars">
                      {categoryInventorySummary.length ? categoryInventorySummary.map((entry) => (
                        <div key={`dash-category-${entry.category}`} className="dashboard-bar-row">
                          <div className="dashboard-bar-head">
                            <span>{entry.category}</span>
                            <span>{entry.units.toLocaleString()} units</span>
                          </div>
                          <div className="dashboard-bar-track">
                            <div className="dashboard-bar-fill" style={{ width: `${Math.max(4, Math.round((entry.units / categoryInventoryMax) * 100))}%` }} />
                          </div>
                          <div className="small">{entry.products} products</div>
                        </div>
                      )) : <p className="small">No category data yet.</p>}
                    </div>
                  )}
                </article>

                <article className="panel dashboard-card">
                  <h3 className="dashboard-card-title">Request Status Mix</h3>
                  {dashboardRequestsLoading ? (
                    <div className="dashboard-bars">
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <div key={`dash-status-sk-${idx}`} className="dashboard-bar-row">
                          <div className="skeleton skeleton-line" style={{ width: `${44 + (idx % 3) * 10}%` }} />
                          <div className="skeleton dashboard-bar-track" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard-bars">
                      {requestStatusSummary.length ? requestStatusSummary.map((entry) => (
                        <div key={`dash-status-${entry.status}`} className="dashboard-bar-row">
                          <div className="dashboard-bar-head">
                            <span>{entry.status}</span>
                            <span>{entry.count}</span>
                          </div>
                          <div className="dashboard-bar-track">
                            <div className="dashboard-bar-fill dashboard-bar-fill-alt" style={{ width: `${Math.max(6, Math.round((entry.count / requestStatusMax) * 100))}%` }} />
                          </div>
                        </div>
                      )) : <p className="small">No requests found yet.</p>}
                    </div>
                  )}
                </article>

                <article className="panel dashboard-card">
                  <div className="dashboard-card-head">
                    <h3 className="dashboard-card-title">Top Weekly Specials</h3>
                    <button type="button" className="ghost-btn" style={{ width: "auto" }} onClick={openWeeklySpecialsFromDashboard}>
                      View Weekly Specials
                    </button>
                  </div>
                  {dashboardInventoryLoading ? (
                    <ul className="dashboard-list">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <li key={`dash-weekly-sk-${idx}`}>
                          <div className="skeleton skeleton-line" style={{ width: `${56 + (idx % 2) * 10}%` }} />
                          <div className="skeleton skeleton-line" style={{ width: "30%" }} />
                        </li>
                      ))}
                    </ul>
                  ) : topWeeklySpecials.length ? (
                    <ul className="dashboard-list">
                      {topWeeklySpecials.map((device) => (
                        <li key={`dash-weekly-${device.id}`}>
                          <span>{device.manufacturer} {device.model}</span>
                          <span>{device.availableDisplay || device.available} in stock</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small">No weekly specials are currently flagged.</p>
                  )}
                </article>

                <article className="panel dashboard-card">
                  <h3 className="dashboard-card-title">Recent Requests</h3>
                  {dashboardRequestsLoading ? (
                    <ul className="dashboard-list">
                      {Array.from({ length: 6 }).map((_, idx) => (
                        <li key={`dash-request-sk-${idx}`}>
                          <div className="skeleton skeleton-line" style={{ width: `${62 - (idx % 3) * 8}%` }} />
                          <div className="skeleton skeleton-line" style={{ width: "34%" }} />
                        </li>
                      ))}
                    </ul>
                  ) : recentRequests.length ? (
                    <ul className="dashboard-list">
                      {recentRequests.map((requestItem) => (
                        <li key={`dash-request-${requestItem.id}`}>
                          <span>{requestItem.requestNumber} ({requestItem.status})</span>
                          <span>{new Date(requestItem.createdAt).toLocaleDateString()} | {formatUsd(requestItem.total)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small">No requests yet.</p>
                  )}
                </article>
              </div>
              </>
              )}
            </section>
          )}

          {route === "products" && productsError && (
            <section className="panel" style={{ marginBottom: 10 }}>
              <p className="small" style={{ margin: 0 }}>{productsError}</p>
            </section>
          )}

          {route === "products" && productsView === "home" && (
            <>
              <div className="products-home-top">
                <h1 className="page-title" style={{ margin: 0 }}>Products</h1>
                {canManageRequests ? <button className="request-btn" onClick={() => setCartOpen(true)}>Requested items ({cart.length})</button> : null}
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
                        title={`${categoryName === ALL_CATEGORIES_KEY ? ALL_CATEGORIES_LABEL : categoryName} | ${savedFilter.name}`}
                        onClick={() => openSavedFilterShortcut(categoryName, savedFilter)}
                      >
                        {categoryName === ALL_CATEGORIES_KEY ? ALL_CATEGORIES_LABEL : categoryName} | {savedFilter.name}
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
                      <ProductCard key={`weekly-${p.id}`} p={p} image={imageFor(p)} onOpen={setActiveProduct} onAdd={addToCart} onOpenGrade={openGradeGuide} />
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
                    <div className="products-grid home-products-grid">{products.filter((p) => p.category === cat).slice(0, 8).map((p) => <ProductCard key={p.id} p={p} image={imageFor(p)} onOpen={setActiveProduct} onAdd={addToCart} onOpenGrade={openGradeGuide} />)}</div>
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
                    <div><p className="small"><span className="crumb-link" onClick={() => setProductsView("home")}>Home</span> &gt; {selectedCategoryLabel}</p><h2 style={{ margin: "4px 0 0", fontSize: "2.6rem", fontWeight: 400 }}>{selectedCategoryLabel}</h2></div>
                    <div className="right-actions"><input className="catalog-search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by model" />{canManageRequests ? <button className="request-btn" onClick={() => setCartOpen(true)}>Requested items ({cart.length})</button> : null}</div>
                  </div>
                  <div className="small" style={{ marginBottom: 8 }}>
                    Showing {categoryTotal ? categoryStartIndex + 1 : 0}-{Math.min(categoryTotal, categoryStartIndex + CATEGORY_PAGE_SIZE)} of {categoryTotal} devices
                  </div>
                  {categoryLoading ? (
                    <div className="products-grid">{Array.from({ length: 8 }).map((_, idx) => <ProductCardSkeleton key={`page-card-sk-${idx}`} />)}</div>
                  ) : (
                    <>
                      <div className="products-grid">{categoryDevices.map((p) => <ProductCard key={p.id} p={p} image={imageFor(p)} onOpen={setActiveProduct} onAdd={addToCart} onOpenGrade={openGradeGuide} />)}</div>
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
                      {canManageRequests ? <button className="request-btn" onClick={() => setCartOpen(true)}>Requested items ({cart.length})</button> : null}
                    </div>
                  </div>
                  <div className="small" style={{ marginBottom: 8 }}>
                    Showing {weeklyFilteredDevices.length} weekly special devices
                  </div>
                  {weeklyFilteredDevices.length ? (
                    <div className="products-grid">
                      {weeklyFilteredDevices.map((p) => (
                        <ProductCard key={`weekly-page-${p.id}`} p={p} image={imageFor(p)} onOpen={setActiveProduct} onAdd={addToCart} onOpenGrade={openGradeGuide} />
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
                <table className="table">
                  <thead>
                    <tr><th>Request #</th><th>Status</th><th>Created</th><th>Total</th><th /></tr>
                  </thead>
                  <tbody>
                    {requestsLoading ? (
                      <tr><td colSpan={5} className="small">Loading requests...</td></tr>
                    ) : filteredRequests.length ? (
                      filteredRequests.map((r) => (
                        <React.Fragment key={r.id}>
                          <tr>
                            <td>{r.requestNumber}</td>
                            <td>{r.status}</td>
                            <td>{new Date(r.createdAt).toLocaleString()}</td>
                            <td>{formatUsd(r.total)}</td>
                            <td>
                              <button className="ghost-btn" onClick={() => setActiveRequestId((prev) => (prev === r.id ? null : r.id))}>
                                {activeRequestId === r.id ? "Hide" : "View"}
                              </button>
                            </td>
                          </tr>
                          {activeRequestId === r.id ? (
                            <tr>
                              <td colSpan={5}>
                                <div className="small" style={{ marginBottom: 8 }}>
                                  Dummy estimate: {r.netsuiteEstimateNumber || "Not created yet"}
                                  {r.netsuiteStatus ? ` | Sync status: ${r.netsuiteStatus}` : ""}
                                </div>
                                {user?.role === "admin" ? (
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                                    {["New", "Received", "Estimate Created", "Completed"].map((s) => (
                                      <button
                                        key={`req-status-${r.id}-${s}`}
                                        className="ghost-btn"
                                        style={r.status === s ? { borderColor: "#256fd6", color: "#256fd6" } : {}}
                                        disabled={requestStatusUpdateLoading}
                                        onClick={() => setDummyRequestStatusAsAdmin(r.id, s)}
                                      >
                                        {requestStatusUpdateLoading && r.status !== s ? "Updating..." : `Set ${s}`}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                                {requestStatusUpdateError && activeRequestId === r.id ? <p className="small" style={{ color: "#b91c1c", marginTop: 0 }}>{requestStatusUpdateError}</p> : null}
                                <table className="table" style={{ margin: 0 }}>
                                  <thead><tr><th>Product</th><th>Grade</th><th>Qty</th><th>Offer</th><th>Total</th></tr></thead>
                                  <tbody>
                                    {r.lines.map((l, i) => (
                                      <tr key={`${r.id}-${l.productId}-${i}`}>
                                        <td>
                                          <button
                                            type="button"
                                            className="link-btn"
                                            style={{ padding: 0, fontSize: "inherit" }}
                                            onClick={() => openRequestLineProduct(l)}
                                            title={l.productId ? "Open product details" : "Open product details (best match)"}
                                          >
                                            {l.model}
                                          </button>
                                        </td>
                                        <td>
                                          <button
                                            type="button"
                                            className="grade-link-btn grade-link-btn-inline"
                                            onClick={() => openGradeGuide(l.grade)}
                                            title={`Open ${l.grade} definition`}
                                          >
                                            {l.grade}
                                          </button>
                                        </td>
                                        <td>{l.quantity}</td>
                                        <td>{formatUsd(l.offerPrice)}</td>
                                        <td>{formatUsd(Number(l.quantity || 0) * Number(l.offerPrice || 0))}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      ))
                    ) : (
                      <tr><td colSpan={5} className="small">No requests found.</td></tr>
                    )}
                  </tbody>
                </table>
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
                  {syncLoading
                    ? `Syncing... ${String(syncStatus?.stage || "starting")} (${Math.round(((Number(syncStatus?.processed || 0) + Number(syncStatus?.skipped || 0)) / Math.max(1, Number(syncStatus?.fetched || 0))) * 100)}%)`
                    : "Sync Boomi Inventory"}
                </button>
                {syncLoading && syncStatus ? (
                  <p className="small" style={{ marginTop: 8 }}>
                    Stage: {String(syncStatus.stage || "starting")}. Progress: {Number(syncStatus.processed || 0) + Number(syncStatus.skipped || 0)} / {Math.max(1, Number(syncStatus.fetched || 0))} ({Math.round(((Number(syncStatus.processed || 0) + Number(syncStatus.skipped || 0)) / Math.max(1, Number(syncStatus.fetched || 0))) * 100)}%). Processed: {Number(syncStatus.processed || 0)}, Skipped: {Number(syncStatus.skipped || 0)}. Elapsed: {formatDurationMs(syncStatus.durationMs || 0)}.
                  </p>
                ) : null}
                {syncResult ? (
                  <p className="small" style={{ marginTop: 8, color: "#166534" }}>
                    Sync complete. Fetched: {Number(syncResult.fetched || 0)}, Processed: {Number(syncResult.processed || 0)}, Skipped: {Number(syncResult.skipped || 0)}. Total time: {formatDurationMs(syncResult.durationMs || 0)}.
                  </p>
                ) : null}
                {syncError ? <p className="small" style={{ marginTop: 8, color: "#b91c1c" }}>{syncError}</p> : null}
              </div>
              <div className="admin-user-form" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: "0 0 8px" }}>Catalog Admin Tools</h3>
                <p className="small" style={{ marginTop: 0 }}>Clear current catalog data or seed realistic devices per category.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="delete-btn" style={{ width: "auto" }} disabled={adminCatalogLoading} onClick={clearCatalogForAdmin}>
                    {adminCatalogLoading ? "Working..." : "Clear Catalog DB"}
                  </button>
                  <button type="button" style={{ width: "auto" }} disabled={adminCatalogLoading} onClick={seedRealDevicesForAdmin}>
                    {adminCatalogLoading ? `Seeding... ${Number(adminRealSeedStatus?.processed || 0)}/${Number(adminRealSeedStatus?.totalPlanned || 0)}` : "Add 100 Real Devices/Category"}
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
              <div className="admin-user-form" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: "0 0 8px" }}>Seed Estimate History</h3>
                <p className="small" style={{ marginTop: 0 }}>Create 20 completed historical estimates for a selected user.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    value={historySeedUserId}
                    onChange={(e) => setHistorySeedUserId(e.target.value)}
                    disabled={historySeedLoading || usersLoading || !users.length}
                    style={{ minWidth: 260 }}
                  >
                    {users.map((u) => (
                      <option key={`seed-user-${u.id}`} value={String(u.id)}>
                        {u.email} ({u.company})
                      </option>
                    ))}
                  </select>
                  <button type="button" style={{ width: "auto" }} onClick={seedHistoryForUserAsAdmin} disabled={historySeedLoading || historyChatResetLoading || !historySeedUserId}>
                    {historySeedLoading ? "Creating..." : "Create 20 Completed Estimates"}
                  </button>
                  <button type="button" style={{ width: "auto" }} onClick={seedCartActivityForUserAsAdmin} disabled={historySeedLoading || historyChatResetLoading || cartActivitySeedLoading || !historySeedUserId}>
                    {cartActivitySeedLoading ? "Adding..." : "Add 20 Not-Requested Cart Items"}
                  </button>
                  <button type="button" className="delete-btn" style={{ width: "auto" }} onClick={resetAiChatHistoryForUserAsAdmin} disabled={historySeedLoading || historyChatResetLoading || !historySeedUserId}>
                    {historyChatResetLoading ? "Clearing..." : "Clear AI Chat History"}
                  </button>
                </div>
                {historySeedNotice ? <p className="small" style={{ marginTop: 8, color: "#166534" }}>{historySeedNotice}</p> : null}
                {cartActivitySeedNotice ? <p className="small" style={{ marginTop: 8, color: "#166534" }}>{cartActivitySeedNotice}</p> : null}
                {historyChatResetNotice ? <p className="small" style={{ marginTop: 8, color: "#166534" }}>{historyChatResetNotice}</p> : null}
              </div>
              <div className="admin-user-form" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: "0 0 8px" }}>User Cart Item Activity</h3>
                <p className="small" style={{ marginTop: 0 }}>
                  Tracks each quantity added to cart with date, offer price, and whether it was ever submitted in a request.
                </p>
                <button
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => loadAdminUserCartActivity(historySeedUserId)}
                  disabled={adminUserCartActivityLoading || !historySeedUserId}
                >
                  {adminUserCartActivityLoading ? "Refreshing..." : "Refresh User Cart Activity"}
                </button>
                {adminUserCartActivityError ? <p className="small" style={{ marginTop: 8, color: "#b91c1c" }}>{adminUserCartActivityError}</p> : null}
                {adminUserCartActivity.length ? (
                  <div style={{ overflowX: "auto", marginTop: 8 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Added At</th>
                          <th>Model</th>
                          <th>Grade</th>
                          <th>Qty</th>
                          <th>Offer Price</th>
                          <th>Ever Requested</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUserCartActivity.map((row) => (
                          <tr key={`cart-activity-${row.id}`}>
                            <td>{row.addedAt ? new Date(row.addedAt).toLocaleString() : "-"}</td>
                            <td>{row.model || "-"}</td>
                            <td>{row.grade || "-"}</td>
                            <td>{Number(row.quantity || 0)}</td>
                            <td>{formatUsd(Number(row.offerPrice || 0))}</td>
                            <td>{row.everRequested ? "Yes" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="small" style={{ marginTop: 8 }}>
                    {adminUserCartActivityLoading ? "Loading activity..." : "No cart activity tracked for this user yet."}
                  </p>
                )}
              </div>
              <div className="admin-user-form" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: "0 0 8px" }}>Cart Tracking</h3>
                <p className="small" style={{ marginTop: 0 }}>
                  Track users with saved carts so sales can follow up before request submission.
                </p>
                <button type="button" style={{ width: "auto" }} onClick={loadAdminCartDrafts} disabled={adminCartDraftsLoading}>
                  {adminCartDraftsLoading ? "Refreshing..." : "Refresh Cart Tracking"}
                </button>
                {adminCartDraftsError ? <p className="small" style={{ marginTop: 8, color: "#b91c1c" }}>{adminCartDraftsError}</p> : null}
                {adminCartDrafts.length ? (
                  <div style={{ overflowX: "auto", marginTop: 8 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Company</th>
                          <th>Status</th>
                          <th>Lines</th>
                          <th>Total</th>
                          <th>Last Activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminCartDrafts.map((draft) => (
                          <tr key={`cart-draft-${draft.userId}`}>
                            <td>{draft.fullName || "-"}</td>
                            <td>{draft.email}</td>
                            <td>{draft.company}</td>
                            <td>{draft.status}</td>
                            <td>{Number(draft.lineCount || 0)}</td>
                            <td>{formatUsd(Number(draft.totalAmount || 0))}</td>
                            <td>{draft.lastActivityAt ? new Date(draft.lastActivityAt).toLocaleString() : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="small" style={{ marginTop: 8 }}>No tracked carts yet.</p>
                )}
              </div>
              <div className="admin-user-form" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: "0 0 8px" }}>Company Sales Rep Assignment</h3>
                <p className="small" style={{ marginTop: 0 }}>
                  Link each customer company to one sales rep. Sales reps will only see assigned companies in their dashboard.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    value={selectedAssignmentCompany}
                    onChange={(e) => setSelectedAssignmentCompany(e.target.value)}
                    disabled={salesRepAssignmentsLoading || !salesRepAssignments.length}
                    style={{ minWidth: 260 }}
                  >
                    {salesRepAssignments.map((row) => (
                      <option key={`assignment-company-${row.company}`} value={row.company}>
                        {row.company}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedSalesRepUserId}
                    onChange={(e) => setSelectedSalesRepUserId(e.target.value)}
                    disabled={salesRepAssignmentsLoading}
                    style={{ minWidth: 240 }}
                  >
                    <option value="">Unassigned</option>
                    {salesRepUsers.map((rep) => (
                      <option key={`assignment-rep-${rep.id}`} value={String(rep.id)}>
                        {rep.fullName || rep.email} ({rep.email})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    style={{ width: "auto" }}
                    onClick={saveSalesRepAssignment}
                    disabled={salesRepAssignmentsLoading || !selectedAssignmentCompany}
                  >
                    {salesRepAssignmentsLoading ? "Saving..." : "Save Assignment"}
                  </button>
                </div>
                {salesRepAssignmentsError ? <p className="small" style={{ marginTop: 8, color: "#b91c1c" }}>{salesRepAssignmentsError}</p> : null}
                {salesRepAssignmentNotice ? <p className="small" style={{ marginTop: 8, color: "#166534" }}>{salesRepAssignmentNotice}</p> : null}
                {salesRepAssignments.length ? (
                  <div style={{ overflowX: "auto", marginTop: 8 }}>
                    <table className="table">
                      <thead><tr><th>Company</th><th>Sales Rep</th><th>Status</th></tr></thead>
                      <tbody>
                        {salesRepAssignments.map((row) => (
                          <tr key={`assignment-row-${row.company}`}>
                            <td>{row.company}</td>
                            <td>{row.salesRepEmail ? `${row.salesRepFirstName || ""} ${row.salesRepLastName || ""}`.trim() || row.salesRepEmail : "-"}</td>
                            <td>{row.salesRepEmail ? (row.salesRepIsActive ? "Assigned" : "Assigned (inactive user)") : "Unassigned"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="small" style={{ marginTop: 8 }}>
                    {salesRepAssignmentsLoading ? "Loading assignments..." : "No companies available for assignment yet."}
                  </p>
                )}
              </div>
              <form onSubmit={createUserAsAdmin} className="admin-user-form">
                <div className="admin-user-form-grid">
                  <input type="email" placeholder="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required />
                  <input type="text" placeholder="Company" value={newUserCompany} onChange={(e) => setNewUserCompany(e.target.value)} required />
                  <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}>
                    <option value="buyer">Buyer</option>
                    <option value="sales_rep">Sales Rep</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="admin-user-form-checks">
                  <label><input type="checkbox" checked={newUserIsActive} onChange={(e) => setNewUserIsActive(e.target.checked)} /> Active</label>
                </div>
                <button type="submit" style={{ width: "auto" }} disabled={userActionLoading}>Create user</button>
              </form>
              {usersLoading ? (
                <UsersTableSkeleton />
              ) : (
                <table className="table">
                  <thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Role</th><th>Registered</th><th>Active</th><th>Logins</th><th>Created</th><th /></tr></thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.fullName || "-"}</td>
                        <td>{u.email}</td>
                        <td>{u.company}</td>
                        <td>
                          <select
                            value={normalizeUserRole(u.role)}
                            disabled={userActionLoading}
                            onChange={(e) => toggleUserField(u, "role", e.target.value)}
                          >
                            <option value="buyer">Buyer</option>
                            <option value="sales_rep">Sales Rep</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td><input type="checkbox" checked={u.registrationCompleted === true} disabled={userActionLoading} onChange={(e) => toggleUserField(u, "registrationCompleted", e.target.checked)} /></td>
                        <td><input type="checkbox" checked={u.isActive} disabled={userActionLoading} onChange={(e) => toggleUserField(u, "isActive", e.target.checked)} /></td>
                        <td>{Math.max(0, Number(u.loginCount || 0))}</td>
                        <td>{new Date(u.createdAt).toLocaleString()}</td>
                        <td>{u.email === user.email ? <span className="small">Current</span> : <button className="delete-btn" style={{ width: "auto" }} disabled={userActionLoading} onClick={() => deleteUser(u)}>Delete</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {route !== "dashboard" && route !== "products" && route !== "requests" && route !== "users" && <section className="panel"><h2 className="page-title" style={{ fontSize: "2rem", marginBottom: 8 }}>{navItems.find((n) => n.key === route)?.label || "Page"}</h2><p className="muted">This section is not part of MVP flow in this demo build.</p></section>}
        </main>
      </div>

      {route === "products" && canManageRequests ? (
        <button className="request-btn request-btn-floating" onClick={() => setCartOpen(true)}>
          Requested items ({cart.length})
        </button>
      ) : null}

      <div className={`ai-chatbot ${aiCopilotOpen ? "open" : "closed"}`}>
        {aiCopilotOpen ? (
          <div
            className="ai-chatbot-panel"
            ref={aiCopilotPanelRef}
            style={{
              ...(aiCopilotPanelHeight > 0 ? { height: aiCopilotPanelHeight } : {}),
              ...(aiCopilotMinPanelHeight > 0 ? { minHeight: aiCopilotMinPanelHeight } : {})
            }}
          >
            <button
              type="button"
              className="ai-chatbot-resize-handle"
              onMouseDown={startAiCopilotResizeMouse}
              onTouchStart={startAiCopilotResizeTouch}
              aria-label="Resize chat box height"
              title="Drag up or down to resize"
            />
            <div className="ai-chatbot-head">
              <div className="ai-chatbot-head-title">
                <span className="ai-chatbot-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="img" focusable="false">
                    <path d="M4.75 4.5h14.5a2.25 2.25 0 0 1 2.25 2.25v8.5a2.25 2.25 0 0 1-2.25 2.25h-8.39l-4.58 3.4c-.57.43-1.39.02-1.39-.69V17.5H4.75A2.25 2.25 0 0 1 2.5 15.25v-8.5A2.25 2.25 0 0 1 4.75 4.5zm2.1 4.5a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.15 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.15 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z" />
                  </svg>
                </span>
                <div className="small">Available across the app</div>
              </div>
              <button
                type="button"
                className="ai-chatbot-minimize-btn"
                onClick={() => setAiCopilotOpen(false)}
                aria-label="Minimize chatbot"
                title="Minimize"
              >
                <svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true">
                  <path d="M5 12.75h14a.75.75 0 0 0 0-1.5H5a.75.75 0 0 0 0 1.5z" />
                </svg>
              </button>
            </div>
            <div className="ai-copilot-feed" ref={aiCopilotFeedRef}>
              {aiCopilotMessages.length ? aiCopilotMessages.slice(-10).map((message, idx) => {
                const messageKey = `${String(message.timestamp || "")}:${String(message.text || "").slice(0, 80)}:${idx}`;
                const optionList = Array.isArray(message?.action?.options) ? message.action.options : [];
                const visibleOptionCount = Math.max(10, Number(aiCopilotOptionVisibleCountByMessage[messageKey] || 10));
                const visibleOptions = optionList.slice(0, visibleOptionCount);
                const canShowMoreOptions = optionList.length > visibleOptionCount;
                return (
                <div key={`copilot-msg-global-${idx}`} className={`ai-copilot-row ${message.role}`}>
                  {message.role === "assistant" ? (
                    <span className="ai-copilot-avatar" aria-hidden="true">
                      <svg viewBox="0 0 24 24" role="img" focusable="false">
                        <path d="M4.75 4.5h14.5a2.25 2.25 0 0 1 2.25 2.25v8.5a2.25 2.25 0 0 1-2.25 2.25h-8.39l-4.58 3.4c-.57.43-1.39.02-1.39-.69V17.5H4.75A2.25 2.25 0 0 1 2.5 15.25v-8.5A2.25 2.25 0 0 1 4.75 4.5zm2.1 4.5a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.15 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.15 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z" />
                      </svg>
                    </span>
                  ) : null}
                  <div className={`ai-copilot-msg ${message.role}`}>
                    <div style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>
                    {message.timestamp ? <div className="ai-copilot-msg-time">{formatChatTimestamp(message.timestamp)}</div> : null}
                    {message.role === "assistant" && message.action?.type === "apply_filters" ? (
                      <button type="button" className="ghost-btn" style={{ width: "auto", marginTop: 6 }} onClick={() => applyCopilotAction(message.action)}>
                        Apply Suggested Filters
                      </button>
                    ) : null}
                    {message.role === "assistant" && message.action?.type === "add_to_request" ? (
                      <button type="button" className="ghost-btn" style={{ width: "auto", marginTop: 6 }} onClick={() => applyCopilotAction(message.action)}>
                        Add To Requested Items
                      </button>
                    ) : null}
                    {message.role === "assistant" && message.action?.type === "add_lines_to_request" ? (
                      <button type="button" className="ghost-btn" style={{ width: "auto", marginTop: 6 }} onClick={() => applyCopilotAction(message.action)}>
                        Add Available Items
                      </button>
                    ) : null}
                    {message.role === "assistant" && (message.action?.type === "choose_filters" || message.action?.type === "choose_devices") && optionList.length ? (
                      <div className="ai-copilot-choice-list">
                        {visibleOptions.map((option) => (
                          <button
                            key={`${option.id}-${option.label}`}
                            type="button"
                            className="ai-copilot-choice-btn"
                            title={option.description || option.label}
                            onClick={() => {
                              const nextAction = option?.payload && typeof option.payload === "object" && option.payload.type
                                ? option.payload
                                : { type: "apply_filters", payload: option.payload };
                              applyCopilotAction(nextAction);
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                        {canShowMoreOptions ? (
                          <button
                            type="button"
                            className="ghost-btn"
                            style={{ width: "auto", marginTop: 4 }}
                            onClick={() => {
                              setAiCopilotOptionVisibleCountByMessage((prev) => ({
                                ...prev,
                                [messageKey]: visibleOptionCount + 10
                              }));
                            }}
                          >
                            Show 10 more
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                );
              }) : (
                <div className="small">Try: "Find Apple CPO in Miami 128GB".</div>
              )}
              {(aiCopilotLoading || aiCopilotGreetingTyping) ? (
                <div className="ai-copilot-row assistant">
                  <span className="ai-copilot-avatar" aria-hidden="true">
                    <svg viewBox="0 0 24 24" role="img" focusable="false">
                      <path d="M4.75 4.5h14.5a2.25 2.25 0 0 1 2.25 2.25v8.5a2.25 2.25 0 0 1-2.25 2.25h-8.39l-4.58 3.4c-.57.43-1.39.02-1.39-.69V17.5H4.75A2.25 2.25 0 0 1 2.5 15.25v-8.5A2.25 2.25 0 0 1 4.75 4.5zm2.1 4.5a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.15 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.15 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z" />
                    </svg>
                  </span>
                  <div className="ai-copilot-msg assistant typing">
                    <span>Writing</span>
                    <span className="ai-typing-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
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
              <button
                type="button"
                className={`ghost-btn ai-copilot-voice-btn${aiCopilotListening ? " listening" : ""}`}
                onClick={toggleAiCopilotVoice}
                disabled={!aiCopilotVoiceSupported || aiCopilotLoading}
                title={aiCopilotVoiceSupported ? (aiCopilotListening ? "Stop voice input" : "Start voice input") : "Voice input not supported"}
                aria-label={aiCopilotListening ? "Stop voice input" : "Start voice input"}
              >
                <svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true">
                  <path d="M12 15.25a3.75 3.75 0 0 0 3.75-3.75V6.75a3.75 3.75 0 1 0-7.5 0v4.75A3.75 3.75 0 0 0 12 15.25z" />
                  <path d="M6.5 11.5a.75.75 0 0 1 1.5 0 4 4 0 1 0 8 0 .75.75 0 0 1 1.5 0A5.5 5.5 0 0 1 12.75 17v2h2.25a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1 0-1.5h2.25v-2A5.5 5.5 0 0 1 6.5 11.5z" />
                </svg>
              </button>
              <button type="button" className="saved-filter-save-btn" onClick={() => runAiCopilot()} disabled={aiCopilotLoading}>
                {aiCopilotLoading ? "Thinking..." : "Send"}
              </button>
            </div>
            {aiCopilotError ? <div className="saved-filter-error">{aiCopilotError}</div> : null}
            {aiCopilotVoiceError ? <div className="saved-filter-error">{aiCopilotVoiceError}</div> : null}
          </div>
        ) : (
          <button
            type="button"
            className={`ai-chatbot-toggle ${aiCopilotUnreadCount > 0 ? "has-unread" : ""}`}
            onClick={() => setAiCopilotOpen(true)}
            aria-label={aiCopilotUnreadCount > 0 ? `Open AI chatbot (${aiCopilotUnreadCount} unread)` : "Open AI chatbot"}
          >
            <span className="ai-chatbot-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img" focusable="false">
                <path d="M4.75 4.5h14.5a2.25 2.25 0 0 1 2.25 2.25v8.5a2.25 2.25 0 0 1-2.25 2.25h-8.39l-4.58 3.4c-.57.43-1.39.02-1.39-.69V17.5H4.75A2.25 2.25 0 0 1 2.5 15.25v-8.5A2.25 2.25 0 0 1 4.75 4.5zm2.1 4.5a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.15 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.15 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z" />
              </svg>
            </span>
            {aiCopilotUnreadCount > 0 ? (
              <span className="ai-chatbot-unread-badge" aria-hidden="true">
                {aiCopilotUnreadCount > 99 ? "99+" : aiCopilotUnreadCount}
              </span>
            ) : null}
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
          <article
            ref={sessionExpiryModalRef}
            className="modal session-expiry-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-expiry-title"
          >
            <h3 id="session-expiry-title" style={{ margin: "0 0 8px", fontSize: "1.6rem" }}>Session expiring soon</h3>
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

      {gradeGuideOpen ? (
        <div className="app-overlay grade-guide-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeGradeGuide(); }}>
          <article
            ref={gradeGuideModalRef}
            className="modal grade-guide-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="grade-guide-title"
            aria-describedby="grade-guide-description"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button className="close-btn grade-guide-close-btn" onClick={closeGradeGuide} aria-label="Close grade definitions">X</button>
            <div className="modal-head">
              <div>
                <h3 id="grade-guide-title" style={{ margin: 0, fontSize: "1.5rem" }}>Grade Definitions</h3>
                <p id="grade-guide-description" className="small" style={{ margin: "4px 0 0" }}>
                  Industry-based references are included where available. Placeholder entries should be replaced with your internal SOP definitions.
                </p>
                {gradeGuideSelectedCode ? (
                  <p className="small" style={{ margin: "4px 0 0", color: "#0f4fbf", fontWeight: 700 }}>
                    Viewing: {normalizeGradeCode(gradeGuideSelectedCode)}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grade-guide-list">
              {GRADE_DEFINITIONS.map((grade) => (
                <section
                  key={`grade-def-${grade.code}`}
                  className={`grade-guide-item ${normalizeGradeCode(gradeGuideSelectedCode) === normalizeGradeCode(grade.code) ? "selected" : ""}`}
                  ref={(node) => {
                    const key = normalizeGradeCode(grade.code);
                    if (!key) return;
                    if (node) gradeGuideItemRefs.current.set(key, node);
                    else gradeGuideItemRefs.current.delete(key);
                  }}
                >
                  <div className="grade-guide-head">
                    <strong>{grade.code}</strong>
                    <span className="small">{grade.title}</span>
                  </div>
                  <p style={{ margin: "6px 0 4px" }}>{grade.summary}</p>
                  <p className="small" style={{ margin: "0 0 6px" }}>{grade.details}</p>
                  <p className="small" style={{ margin: 0 }}>
                    Source: {grade.source}
                    {grade.placeholder ? " | Placeholder" : ""}
                  </p>
                </section>
              ))}
            </div>
          </article>
        </div>
      ) : null}

      {activeProduct && (
        <div className="app-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeActiveProduct(); }}>
          <article
            ref={productModalRef}
            className="modal product-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head"><div><p className="small" style={{ margin: 0 }}>{activeProduct.manufacturer.toUpperCase()}</p><h3 id="product-modal-title" style={{ margin: "2px 0", fontSize: "2rem" }}>{activeProduct.model}</h3><div style={{ fontSize: "2rem", fontWeight: 700 }}>{formatUsd(activeProduct.price)}</div></div><button className="close-btn" onClick={closeActiveProduct}>X</button></div>
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
                    <div className="spec-item"><div className="spec-key">Grade</div><div className="spec-val"><button type="button" className="grade-link-btn grade-link-btn-inline" onClick={() => openGradeGuide(activeProduct.grade)} title={`Open ${activeProduct.grade} definition`}>{activeProduct.grade}</button></div></div>
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
                <div className="modal-box" style={{ background: "#eef9f3", marginTop: modalProductUnavailable ? 10 : 0 }}><h4 style={{ marginTop: 0 }}>Availability</h4><p className="small">Total across all locations <strong>{activeProduct.availableDisplay || activeProduct.available}</strong></p><table className="table"><tbody>{modalAvailableLocations.map(([loc, q]) => <tr key={loc}><td>{loc}</td><td>{activeProduct.locationDisplay?.[loc] || q}</td></tr>)}</tbody></table>{!modalAvailableLocations.length ? <p className="small" style={{ marginTop: 8 }}>No locations currently have available inventory for this device.</p> : null}</div>
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
        <div className="app-overlay cart-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeCartDialog(); }}>
          <article
            ref={cartModalRef}
            className="modal cart-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="requested-items-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head"><h3 id="requested-items-title" style={{ margin: 0, fontSize: "2rem", fontWeight: 500 }}>Requested items</h3><button className="close-btn" onClick={closeCartDialog}>X</button></div>
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
                              <div>Only {fulfillmentIssue.available} available at {selectedRequestLocation}.</div>
                            </div>
                          ) : null}
                        </td>
                        <td className="cart-col-grade"><button type="button" className="grade-link-btn grade-link-btn-inline" onClick={() => openGradeGuide(r.grade)} title={`Open ${r.grade} definition`}>{r.grade}</button></td>
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
            <div className="cart-footer"><div className="cart-grand-total"><div className="cart-grand-total-label">Grand Total</div><div className="cart-grand-total-value">{formatUsd(cart.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.offerPrice || 0), 0))}</div><div className="small">{cart.reduce((s, i) => s + Number(i.quantity || 0), 0)} units</div></div><div className="cart-actions"><button className="delete-btn" onClick={() => updateCart([])} disabled={requestSubmitLoading}>Remove all</button><button className="submit-btn" disabled={!canManageRequests || requestSubmitLoading || !selectedRequestLocation || cartHasFulfillmentIssues || !cart.length || !cart.every((i) => i.offerPrice !== "" && Number(i.quantity) >= 1 && Number(i.offerPrice) >= 0)} onClick={submitRequest}>{!canManageRequests ? "Sales rep view only" : (requestSubmitLoading ? "Submitting..." : "Submit request")}</button></div></div>
          </article>
        </div>
      )}
    </div>
  );
}

function Login({
  onAuth0Login,
  onAuth0Signup,
  onAuth0CompleteProfile,
  onAuth0ProfileContinueLater,
  onAuth0CancelRegistration,
  onClearPendingApproval,
  auth0Loading,
  auth0ErrorText,
  auth0PendingApprovalEmail = "",
  auth0ProfileRequired = false,
  auth0ProfilePrefill = { firstName: "", lastName: "", company: "", email: "" }
}) {
  const logoUrl = `${import.meta.env.BASE_URL}logo.png`;
  const [pendingEmail, setPendingEmail] = useState("");
  const [auth0FirstName, setAuth0FirstName] = useState("");
  const [auth0LastName, setAuth0LastName] = useState("");
  const [auth0Company, setAuth0Company] = useState("");
  const [auth0ProfileError, setAuth0ProfileError] = useState("");
  const [auth0ProfileSaving, setAuth0ProfileSaving] = useState(false);
  const [auth0CancelConfirmOpen, setAuth0CancelConfirmOpen] = useState(false);
  const [auth0CancelSubmitting, setAuth0CancelSubmitting] = useState(false);
  const [auth0CancelError, setAuth0CancelError] = useState("");
  const auth0CancelModalRef = useRef(null);
  const activePendingEmail = pendingEmail || auth0PendingApprovalEmail;

  useEffect(() => {
    if (!auth0ProfileRequired) return;
    setAuth0FirstName(String(auth0ProfilePrefill?.firstName || ""));
    setAuth0LastName(String(auth0ProfilePrefill?.lastName || ""));
    setAuth0Company("");
    setAuth0ProfileError("");
    setAuth0CancelConfirmOpen(false);
    setAuth0CancelSubmitting(false);
    setAuth0CancelError("");
  }, [auth0ProfileRequired, auth0ProfilePrefill]);

  const submitAuth0Profile = async () => {
    if (typeof onAuth0CompleteProfile !== "function") return;
    const firstName = String(auth0FirstName || "").trim();
    const lastName = String(auth0LastName || "").trim();
    const company = String(auth0Company || "").trim();
    if (!firstName || !lastName || !company) {
      setAuth0ProfileError("First name, last name and company are required.");
      return;
    }
    try {
      setAuth0ProfileSaving(true);
      setAuth0ProfileError("");
      const result = await onAuth0CompleteProfile({ firstName, lastName, company });
      if (result?.pendingApproval) {
        setPendingEmail(result.email || auth0ProfilePrefill?.email || "");
      }
    } catch (error) {
      setAuth0ProfileError(error.message || "Could not complete registration.");
    } finally {
      setAuth0ProfileSaving(false);
    }
  };

  const pendingApprovalView = (
    <div className="auth-approval-card" role="status" aria-live="polite">
      <div className="auth-approval-icon" aria-hidden="true">?</div>
      <h2 className="auth-approval-title">Account Created</h2>
      <p className="auth-approval-text">
        {activePendingEmail || "This account"} is waiting for admin approval.
      </p>
      <p className="auth-approval-subtext">
        You will be able to sign in as soon as an admin activates your account.
      </p>
      <button
        type="button"
        className="ghost-btn auth-approval-btn"
        onClick={() => {
          setPendingEmail("");
          if (typeof onClearPendingApproval === "function") {
            onClearPendingApproval();
          }
        }}
      >
        Back to sign in
      </button>
    </div>
  );

  const handleAuth0ContinueLater = async () => {
    if (typeof onAuth0ProfileContinueLater !== "function") {
      setAuth0CancelConfirmOpen(false);
      return;
    }
    try {
      setAuth0CancelSubmitting(true);
      setAuth0CancelError("");
      await onAuth0ProfileContinueLater();
    } catch (error) {
      setAuth0CancelError(error.message || "Could not return to sign in.");
    } finally {
      setAuth0CancelSubmitting(false);
    }
  };

  const handleAuth0CancelRegistration = async () => {
    if (typeof onAuth0CancelRegistration !== "function") {
      setAuth0CancelConfirmOpen(false);
      return;
    }
    try {
      setAuth0CancelSubmitting(true);
      setAuth0CancelError("");
      await onAuth0CancelRegistration();
    } catch (error) {
      setAuth0CancelError(error.message || "Could not cancel registration.");
    } finally {
      setAuth0CancelSubmitting(false);
    }
  };

  const closeAuth0CancelDialog = useCallback(() => {
    if (!auth0CancelSubmitting) setAuth0CancelConfirmOpen(false);
  }, [auth0CancelSubmitting]);

  useDialogA11y({ isOpen: auth0CancelConfirmOpen, dialogRef: auth0CancelModalRef, onClose: closeAuth0CancelDialog });

  if (auth0ProfileRequired) {
    return (
      <div className="auth-shell">
        <div className="auth-layout">
          <aside className="auth-hero">
            <div className="auth-hero-logo-wrap">
              <img className="auth-hero-logo" src={logoUrl} alt="PCS Wireless" />
            </div>
            <h2 className="auth-hero-title">Complete Registration</h2>
            <p className="auth-hero-text">Please provide your profile details to continue.</p>
          </aside>
          <div className="auth-card auth0-card">
            {auth0ProfilePrefill?.email ? <p className="small">Email: {auth0ProfilePrefill.email}</p> : null}
            <div style={{ display: "grid", gap: 8 }}>
              <input type="text" placeholder="First name" value={auth0FirstName} onChange={(e) => setAuth0FirstName(e.target.value)} />
              <input type="text" placeholder="Last name" value={auth0LastName} onChange={(e) => setAuth0LastName(e.target.value)} />
              <input type="text" placeholder="Company" value={auth0Company} onChange={(e) => setAuth0Company(e.target.value)} />
              <button type="button" className="auth-submit-btn auth0-primary-btn" onClick={submitAuth0Profile} disabled={auth0ProfileSaving}>
                {auth0ProfileSaving ? "Saving..." : "Complete Registration"}
              </button>
              <button
                type="button"
                className="ghost-btn auth0-cancel-registration-btn"
                onClick={() => {
                  setAuth0CancelError("");
                  setAuth0CancelConfirmOpen(true);
                }}
                disabled={auth0ProfileSaving}
              >
                Cancel
              </button>
            </div>
            {auth0ProfileError ? <p className="auth-error auth0-error">{auth0ProfileError}</p> : null}
            {auth0CancelConfirmOpen ? (
              <div className="auth0-cancel-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !auth0CancelSubmitting) closeAuth0CancelDialog(); }}>
                <div
                  ref={auth0CancelModalRef}
                  className="auth0-cancel-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="auth0-cancel-title"
                  aria-describedby="auth0-cancel-description"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <h3 id="auth0-cancel-title">Finish Registration?</h3>
                  <p id="auth0-cancel-description">You can continue now, continue later, or cancel registration completely.</p>
                  <div className="auth0-cancel-modal-actions">
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={handleAuth0ContinueLater}
                      disabled={auth0CancelSubmitting}
                    >
                      {auth0CancelSubmitting ? "Working..." : "Continue Later"}
                    </button>
                    <button
                      type="button"
                      className="auth-submit-btn auth0-primary-btn"
                      onClick={closeAuth0CancelDialog}
                      disabled={auth0CancelSubmitting}
                    >
                      Continue Now
                    </button>
                    <button
                      type="button"
                      className="delete-btn auth0-danger-btn"
                      onClick={handleAuth0CancelRegistration}
                      disabled={auth0CancelSubmitting}
                    >
                      {auth0CancelSubmitting ? "Cancelling..." : "Cancel Registration"}
                    </button>
                  </div>
                  {auth0CancelError ? <p className="auth-error auth0-error">{auth0CancelError}</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (auth0PendingApprovalEmail) {
    return (
      <div className="auth-shell">
        <div className="auth-layout">
          <aside className="auth-hero">
            <div className="auth-hero-logo-wrap">
              <img className="auth-hero-logo" src={logoUrl} alt="PCS Wireless" />
            </div>
            <h2 className="auth-hero-title">PCS Online Catalog</h2>
            <p className="auth-hero-text">Your account request was received successfully.</p>
          </aside>
          <div className="auth-card auth0-card">
            {pendingApprovalView}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <aside className="auth-hero">
          <div className="auth-hero-logo-wrap">
            <img className="auth-hero-logo" src={logoUrl} alt="PCS Wireless" />
          </div>
          <h2 className="auth-hero-title">PCS Online Catalog</h2>
          <p className="auth-hero-text">AI-assisted sourcing and request management.</p>
        </aside>
        <div className="auth-card auth0-card">
          <div className="auth0-meta-row">
            <div className="auth0-ai-pill" aria-label="AI powered">AI Powered</div>
          </div>
          <h1 className="auth-title auth0-title">PCS Online Catalog</h1>
          <p className="auth0-subtitle">Sign in to continue.</p>
          <div className="auth0-actions">
            <button type="button" className="auth-submit-btn auth0-primary-btn" onClick={onAuth0Login} disabled={Boolean(auth0Loading)}>
              {auth0Loading ? "Redirecting..." : "Sign in"}
            </button>
            <button type="button" className="ghost-btn auth0-secondary-btn" onClick={onAuth0Signup} disabled={Boolean(auth0Loading)}>
              {auth0Loading ? "Redirecting..." : "Create account"}
            </button>
          </div>
          <p className="auth0-note">Secure sign-in by Auth0</p>
          {auth0ErrorText ? <p className="auth-error auth0-error">Auth0 error: {auth0ErrorText}</p> : null}
        </div>
      </div>
    </div>
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

const failedImageSources = new Set();

function ImageWithFallback({ src, alt = "", className = "", loading = "lazy" }) {
  const fallback = `${import.meta.env.BASE_URL}device-fallback.png`;
  const incomingSrc = sanitizeDeviceImageUrl(src);
  const [resolvedSrc, setResolvedSrc] = useState(incomingSrc && !failedImageSources.has(incomingSrc) ? incomingSrc : fallback);

  useEffect(() => {
    const nextSrc = incomingSrc && !failedImageSources.has(incomingSrc) ? incomingSrc : fallback;
    setResolvedSrc(nextSrc);
  }, [incomingSrc, fallback]);

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      loading={loading}
      onError={(event) => {
        const failedSrc = String(event?.currentTarget?.src || resolvedSrc || "").trim();
        if (incomingSrc) failedImageSources.add(incomingSrc);
        if (failedSrc) failedImageSources.add(failedSrc);
        if (resolvedSrc !== fallback) setResolvedSrc(fallback);
      }}
    />
  );
}

function LoggedOutScreen({ onBackToSignIn }) {
  const logoUrl = `${import.meta.env.BASE_URL}logo.png`;
  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <aside className="auth-hero">
          <div className="auth-hero-logo-wrap">
            <img className="auth-hero-logo" src={logoUrl} alt="PCS Wireless" />
          </div>
          <h2 className="auth-hero-title">You are logged out</h2>
          <p className="auth-hero-text">Your session expired for security reasons.</p>
        </aside>
        <div className="auth-card auth0-card">
          <h1 className="auth-title auth0-title">Session Ended</h1>
          <p className="auth0-subtitle">Please sign in again to continue using the catalog.</p>
          <button type="button" className="auth-submit-btn auth0-primary-btn" onClick={onBackToSignIn}>
            Go to sign in
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductCard({ p, image, onOpen, onAdd, onOpenGrade }) {
  const unavailable = p.available < 1;
  const cardPrice = Math.round(Number(p.price || 0)).toLocaleString("en-US");
  const availableDisplay = p.availableDisplay || String(p.available || 0);
  const maxSelectableQty = Math.max(1, Math.min(9999, Math.floor(Number(p.available || 1))));
  const [cardQty, setCardQty] = useState("1");

  useEffect(() => {
    setCardQty("1");
  }, [p.id]);

  const normalizeCardQty = (value) => {
    const asText = String(value ?? "").trim();
    if (!asText) return 1;
    const numeric = Math.floor(Number(asText));
    if (!Number.isFinite(numeric) || numeric < 1) return 1;
    return Math.min(maxSelectableQty, numeric);
  };

  const currentQty = normalizeCardQty(cardQty);
  return (
    <article className="card product-card">
      <div className="thumb product-thumb" onClick={() => onOpen(p)}><ImageWithFallback src={image} alt={p.model} /></div>
      <div className="brand product-brand">{p.manufacturer}</div>
      <div className="name product-name" onClick={() => onOpen(p)}>{p.model}</div>
      <div className="price">${cardPrice}</div>
      <div className="product-meta">
        Device Grade{" "}
        <button
          type="button"
          className="grade-link-btn"
          onClick={() => onOpenGrade?.(p.grade)}
          title={`Open ${p.grade} definition`}
        >
          {p.grade}
        </button>
      </div>
      <div className={`avail ${unavailable ? "bad" : "ok"}`}>{unavailable ? "Currently not available" : `${availableDisplay} items available`}</div>
      <div className="card-qty-row">
        <label className="card-qty-label" htmlFor={`card-qty-${p.id}`}>Qty</label>
        <div className="card-qty-control">
          <button
            type="button"
            className="card-qty-btn"
            disabled={unavailable || currentQty <= 1}
            onClick={() => setCardQty(String(Math.max(1, currentQty - 1)))}
          >
            -
          </button>
          <input
            id={`card-qty-${p.id}`}
            className="card-qty-input"
            type="number"
            min="1"
            max={maxSelectableQty}
            value={cardQty}
            onChange={(e) => setCardQty(e.target.value)}
            onBlur={() => setCardQty(String(normalizeCardQty(cardQty)))}
            disabled={unavailable}
          />
          <button
            type="button"
            className="card-qty-btn"
            disabled={unavailable || currentQty >= maxSelectableQty}
            onClick={() => setCardQty(String(Math.min(maxSelectableQty, currentQty + 1)))}
          >
            +
          </button>
        </div>
      </div>
      <button className="add-btn" disabled={unavailable} onClick={() => onAdd(p, currentQty, "")}>Add to request</button>
    </article>
  );
}

