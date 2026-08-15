import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogStats, getWheel, listCategories, listWheels } from "./catalog.mjs";
import { fetchRepositorySnapshot, GitHubApiError } from "./github-client.mjs";
import { clearGitHubSession, completeInstallation, connectedGitHubSession, createInstallationStart, installationTokenForRequest, isGitHubAppConfigured } from "./github-app.mjs";
import { buildWheelManifest, wheelManifestYaml } from "./manifest.mjs";
import { clientIp, readJson, redirect, requestBaseUrl, securityHeaders, sendJson, sendText, weakEtag } from "./http.mjs";
import { createRateLimiter } from "./rate-limit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const publicRoot = join(root, "public");
const wheelSchemaPath = join(root, "schemas", "wheel-v1.schema.json");
const importLimit = createRateLimiter({ limit: 12, windowMs: 60_000 });
const contentTypes = new Map([[".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"], [".txt", "text/plain; charset=utf-8"]]);

function commonHeaders() { return { ...securityHeaders(), "x-sivitahub-version": "0.1.0" }; }
function secureRequest(request) { return requestBaseUrl(request).startsWith("https://"); }

function apiError(response, error) {
  const status = error.statusCode || (error instanceof GitHubApiError ? error.status : 500);
  const publicMessage = status >= 500 && !(error instanceof GitHubApiError) ? "SivitaHub could not complete the request." : error.message;
  sendJson(response, status, {
    error: {
      code: error.name === "GitHubApiError" ? "github_api_error" : "request_failed",
      message: publicMessage,
      ...(error.rateLimit ? { rateLimit: error.rateLimit } : {}),
    },
  }, commonHeaders());
}

async function handleApi(request, response, url) {
  const method = request.method || "GET";
  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { status: "ok", version: "0.1.0", githubAppConfigured: isGitHubAppConfigured(), time: new Date().toISOString() }, { ...commonHeaders(), "cache-control": "no-store" });
    return true;
  }
  if (method === "GET" && url.pathname === "/api/meta") {
    sendJson(response, 200, { product: "SivitaHub", tagline: "找到轮子，理解轮子，基于轮子做出自己的产品。", principles: ["GitHub is source of truth", "Read-only by default", "No arbitrary code execution"], stats: catalogStats() }, { ...commonHeaders(), "cache-control": "public, max-age=60" });
    return true;
  }
  if (method === "GET" && url.pathname === "/api/categories") {
    sendJson(response, 200, { categories: listCategories() }, { ...commonHeaders(), "cache-control": "public, max-age=60" });
    return true;
  }
  if (method === "GET" && url.pathname === "/api/wheels") {
    const wheels = listWheels({ query: url.searchParams.get("q") || "", category: url.searchParams.get("category") || "all" });
    sendJson(response, 200, { wheels, total: wheels.length }, { ...commonHeaders(), "cache-control": "public, max-age=30" });
    return true;
  }
  if (method === "GET" && url.pathname.startsWith("/api/wheels/")) {
    const wheel = getWheel(decodeURIComponent(url.pathname.slice("/api/wheels/".length)));
    if (!wheel) sendJson(response, 404, { error: { code: "not_found", message: "Wheel not found." } }, commonHeaders());
    else sendJson(response, 200, { wheel }, { ...commonHeaders(), "cache-control": "public, max-age=60" });
    return true;
  }
  if (method === "GET" && url.pathname === "/api/schema/wheel-v1") {
    sendJson(response, 200, JSON.parse(await readFile(wheelSchemaPath, "utf8")), { ...commonHeaders(), "cache-control": "public, max-age=3600" });
    return true;
  }
  if (method === "POST" && url.pathname === "/api/import/preview") {
    const limit = importLimit(clientIp(request));
    if (!limit.allowed) {
      sendJson(response, 429, { error: { code: "rate_limited", message: "Import preview limit reached. Try again after the reset time.", resetAt: new Date(limit.resetAt).toISOString() } }, { ...commonHeaders(), "retry-after": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) });
      return true;
    }
    const body = await readJson(request);
    const repositoryInput = body.repository || body.url;
    if (!repositoryInput || typeof repositoryInput !== "string") {
      const error = new Error("Field 'repository' must contain a GitHub URL or owner/name value.");
      error.statusCode = 400;
      throw error;
    }
    const installationToken = await installationTokenForRequest(request);
    const token = installationToken || process.env.GITHUB_TOKEN?.trim() || undefined;
    const snapshot = await fetchRepositorySnapshot(repositoryInput, { token });
    const manifest = buildWheelManifest(snapshot);
    sendJson(response, 200, { snapshot, manifest, manifestYaml: wheelManifestYaml(manifest), authentication: installationToken ? "github-app-installation" : token ? "server-token" : "anonymous" }, { ...commonHeaders(), "cache-control": "no-store" });
    return true;
  }
  if (method === "GET" && url.pathname === "/api/github/connect") {
    const start = createInstallationStart({ secure: secureRequest(request), returnTo: "/?github=connected" });
    redirect(response, start.url, 302, { ...commonHeaders(), "set-cookie": start.cookie });
    return true;
  }
  if (method === "GET" && url.pathname === "/api/github/callback") {
    const result = await completeInstallation(request, url, { secure: secureRequest(request) });
    redirect(response, result.returnTo, 302, { ...commonHeaders(), "set-cookie": result.cookies });
    return true;
  }
  if (method === "GET" && url.pathname === "/api/github/session") {
    sendJson(response, 200, await connectedGitHubSession(request), { ...commonHeaders(), "cache-control": "no-store" });
    return true;
  }
  if (method === "POST" && url.pathname === "/api/github/logout") {
    sendJson(response, 200, { success: true }, { ...commonHeaders(), "cache-control": "no-store", "set-cookie": clearGitHubSession(request, { secure: secureRequest(request) }) });
    return true;
  }
  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: { code: "not_found", message: "API route not found." } }, commonHeaders());
    return true;
  }
  return false;
}

function safeStaticPath(pathname) {
  const requested = decodeURIComponent(pathname) === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidate = normalize(join(publicRoot, requested));
  const relation = relative(publicRoot, candidate);
  if (relation.startsWith("..") || relation.split(/[\\/]/).includes("..")) return null;
  return candidate;
}

async function serveStatic(request, response, url) {
  let path = safeStaticPath(url.pathname);
  if (!path) return sendText(response, 400, "Invalid path.", commonHeaders());
  let info;
  try {
    info = await stat(path);
    if (info.isDirectory()) { path = join(path, "index.html"); info = await stat(path); }
  } catch {
    path = join(publicRoot, "index.html");
    info = await stat(path);
  }
  const etag = weakEtag(info);
  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304, { ...commonHeaders(), etag });
    return response.end();
  }
  const isIndex = path.endsWith("index.html");
  response.writeHead(200, { ...commonHeaders(), "content-type": contentTypes.get(extname(path).toLowerCase()) || "application/octet-stream", "content-length": info.size, "cache-control": isIndex ? "no-cache" : "public, max-age=300", etag });
  if (request.method === "HEAD") return response.end();
  createReadStream(path).pipe(response);
}

export function createSivitaHubServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", requestBaseUrl(request));
      if (await handleApi(request, response, url)) return;
      if (request.method !== "GET" && request.method !== "HEAD") return sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed." } }, commonHeaders());
      await serveStatic(request, response, url);
    } catch (error) {
      console.error("SivitaHub request failed", { name: error.name, status: error.statusCode || error.status, message: error.message });
      if (!response.headersSent) apiError(response, error);
      else response.destroy();
    }
  });
}
