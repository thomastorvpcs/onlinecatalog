#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function requiredArg(args, name) {
  const value = String(args[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required arg: --${name}`);
  }
  return value;
}

async function requestJson(baseUrl, authHeader, path, init = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!res.ok) {
    const details = payload?.message || payload?.data?.message || payload?.raw || text || `HTTP ${res.status}`;
    throw new Error(`Confluence API ${res.status} ${res.statusText}: ${details}`);
  }
  return payload;
}

async function findPageByTitle(baseUrl, authHeader, spaceKey, title) {
  const qs = new URLSearchParams({
    spaceKey,
    title,
    expand: "version"
  });
  const payload = await requestJson(baseUrl, authHeader, `/wiki/rest/api/content?${qs.toString()}`);
  const page = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!page) return null;
  return {
    id: page.id,
    title: page.title,
    version: Number(page?.version?.number || 1)
  };
}

async function createPage(baseUrl, authHeader, spaceKey, title, storageValue, parentId) {
  const body = {
    type: "page",
    title,
    space: { key: spaceKey },
    body: {
      storage: {
        value: storageValue,
        representation: "storage"
      }
    }
  };
  if (parentId) {
    body.ancestors = [{ id: String(parentId) }];
  }
  return requestJson(baseUrl, authHeader, "/wiki/rest/api/content", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

async function updatePage(baseUrl, authHeader, id, title, nextVersion, storageValue) {
  const body = {
    id: String(id),
    type: "page",
    title,
    version: { number: Number(nextVersion) },
    body: {
      storage: {
        value: storageValue,
        representation: "storage"
      }
    }
  };
  return requestJson(baseUrl, authHeader, `/wiki/rest/api/content/${encodeURIComponent(String(id))}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`
Usage:
  node scripts/confluence-upsert.mjs --space <SPACE_KEY> --title "<PAGE_TITLE>" --file <STORAGE_HTML_FILE> [--parent <PARENT_PAGE_ID>] [--dry-run]

Required env vars:
  CONFLUENCE_BASE_URL   e.g. https://your-domain.atlassian.net
  CONFLUENCE_EMAIL
  CONFLUENCE_API_TOKEN
`);
    process.exit(0);
  }

  const baseUrlRaw = requiredEnv("CONFLUENCE_BASE_URL");
  const email = requiredEnv("CONFLUENCE_EMAIL");
  const apiToken = requiredEnv("CONFLUENCE_API_TOKEN");
  const spaceKey = requiredArg(args, "space");
  const title = requiredArg(args, "title");
  const filePath = resolve(requiredArg(args, "file"));
  const parentId = args.parent ? String(args.parent).trim() : "";
  const dryRun = Boolean(args["dry-run"]);

  const storageValue = readFileSync(filePath, "utf8");
  const baseUrl = baseUrlRaw.replace(/\/+$/, "");
  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

  const existing = await findPageByTitle(baseUrl, authHeader, spaceKey, title);
  if (!existing) {
    if (dryRun) {
      console.log(`[dry-run] Would create page "${title}" in space "${spaceKey}"${parentId ? ` under parent ${parentId}` : ""}.`);
      return;
    }
    const created = await createPage(baseUrl, authHeader, spaceKey, title, storageValue, parentId);
    console.log(`Created page: id=${created.id}, title="${created.title}"`);
    return;
  }

  const nextVersion = existing.version + 1;
  if (dryRun) {
    console.log(`[dry-run] Would update page "${existing.title}" (id=${existing.id}) to version ${nextVersion}.`);
    return;
  }
  const updated = await updatePage(baseUrl, authHeader, existing.id, title, nextVersion, storageValue);
  console.log(`Updated page: id=${updated.id}, title="${updated.title}", version=${nextVersion}`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});

