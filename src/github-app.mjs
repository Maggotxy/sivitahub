import { createHmac, randomBytes, sign, timingSafeEqual } from "node:crypto";
import { parseCookies, serializeCookie } from "./http.mjs";

const SESSION_COOKIE = "sivitahub_session";
const STATE_COOKIE = "sivitahub_install_state";
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const sessions = new Map();

function base64url(value) { return Buffer.from(value).toString("base64url"); }
function normalizePrivateKey(value) { return String(value || "").replace(/\\n/g, "\n"); }

export function githubAppConfig() {
  return {
    appId: process.env.GITHUB_APP_ID?.trim() || "",
    slug: process.env.GITHUB_APP_SLUG?.trim() || "",
    privateKey: normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY),
    sessionSecret: process.env.SESSION_SECRET?.trim() || "",
  };
}

export function isGitHubAppConfigured() {
  const config = githubAppConfig();
  return Boolean(config.appId && config.slug && config.privateKey && config.sessionSecret.length >= 32);
}

export function signInstallState(payload, secret) {
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

export function verifyInstallState(value, secret, now = Date.now()) {
  if (typeof value !== "string") return null;
  const [encoded, suppliedSignature] = value.split(".");
  if (!encoded || !suppliedSignature) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest();
  let supplied;
  try { supplied = Buffer.from(suppliedSignature, "base64url"); } catch { return null; }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { return null; }
  if (!payload.expiresAt || payload.expiresAt < now) return null;
  return payload;
}

export function createInstallationStart({ secure = false, returnTo = "/" } = {}) {
  const config = githubAppConfig();
  if (!isGitHubAppConfigured()) {
    const error = new Error("GitHub App is not configured on this server.");
    error.statusCode = 503;
    throw error;
  }
  const payload = { nonce: randomBytes(18).toString("base64url"), returnTo: returnTo.startsWith("/") ? returnTo : "/", expiresAt: Date.now() + 10 * 60 * 1000 };
  const state = signInstallState(payload, config.sessionSecret);
  return {
    url: `https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new?state=${encodeURIComponent(state)}`,
    cookie: serializeCookie(STATE_COOKIE, state, { path: "/api/github/callback", maxAge: 600, httpOnly: true, secure, sameSite: "Lax" }),
  };
}

function createAppJwt(config, now = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 8 * 60, iss: config.appId }));
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), config.privateKey).toString("base64url")}`;
}

async function createInstallationToken(installationId) {
  const config = githubAppConfig();
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${createAppJwt(config)}`, "x-github-api-version": "2022-11-28", "user-agent": "SivitaHub/0.1" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.token) {
    const error = new Error(payload.message || "Unable to create a GitHub installation token.");
    error.statusCode = response.status || 502;
    throw error;
  }
  return payload.token;
}

function cleanupSessions(now = Date.now()) {
  for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id);
}

export async function completeInstallation(request, url, { secure = false } = {}) {
  const config = githubAppConfig();
  if (!isGitHubAppConfigured()) {
    const error = new Error("GitHub App is not configured on this server.");
    error.statusCode = 503;
    throw error;
  }
  const installationId = Number.parseInt(url.searchParams.get("installation_id") || "", 10);
  const cookies = parseCookies(request);
  const state = verifyInstallState(url.searchParams.get("state") || cookies[STATE_COOKIE], config.sessionSecret);
  if (!state || !Number.isSafeInteger(installationId) || installationId <= 0) {
    const error = new Error("GitHub installation callback could not be verified.");
    error.statusCode = 400;
    throw error;
  }
  await createInstallationToken(installationId);
  cleanupSessions();
  const sessionId = randomBytes(32).toString("base64url");
  sessions.set(sessionId, { installationId, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 });
  return {
    returnTo: state.returnTo || "/",
    cookies: [
      serializeCookie(SESSION_COOKIE, sessionId, { path: "/", maxAge: SESSION_TTL_SECONDS, httpOnly: true, secure, sameSite: "Lax" }),
      serializeCookie(STATE_COOKIE, "", { path: "/api/github/callback", maxAge: 0, httpOnly: true, secure, sameSite: "Lax" }),
    ],
  };
}

function getSession(request) {
  cleanupSessions();
  const sessionId = parseCookies(request)[SESSION_COOKIE];
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return { sessionId, ...session };
}

export async function installationTokenForRequest(request) {
  const session = getSession(request);
  return session ? createInstallationToken(session.installationId) : null;
}

export async function connectedGitHubSession(request) {
  if (!isGitHubAppConfigured()) return { configured: false, connected: false, repositories: [] };
  const session = getSession(request);
  if (!session) return { configured: true, connected: false, repositories: [] };
  const token = await createInstallationToken(session.installationId);
  const response = await fetch("https://api.github.com/installation/repositories?per_page=100", {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "user-agent": "SivitaHub/0.1" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "Unable to list connected GitHub repositories.");
    error.statusCode = response.status;
    throw error;
  }
  return {
    configured: true,
    connected: true,
    installationId: session.installationId,
    repositories: (payload.repositories || []).map((repo) => ({ id: repo.id, fullName: repo.full_name, private: Boolean(repo.private), url: repo.html_url, defaultBranch: repo.default_branch })),
  };
}

export function clearGitHubSession(request, { secure = false } = {}) {
  const session = getSession(request);
  if (session) sessions.delete(session.sessionId);
  return serializeCookie(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, secure, sameSite: "Lax" });
}
