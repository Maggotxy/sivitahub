import { parseGitHubRepository } from "./github-url.mjs";

const API_ROOT = "https://api.github.com";
const KNOWN_MANIFESTS = ["package.json", "pnpm-workspace.yaml", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod", "composer.json", "Gemfile", "pom.xml", "build.gradle", "Dockerfile", "docker-compose.yml", "docker-compose.yaml"];

export class GitHubApiError extends Error {
  constructor(message, { status = 500, details = null, rateLimit = null } = {}) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.details = details;
    this.rateLimit = rateLimit;
  }
}

function rateLimitFromHeaders(headers) {
  return {
    limit: Number(headers.get("x-ratelimit-limit") || 0) || null,
    remaining: Number(headers.get("x-ratelimit-remaining") || 0),
    resetAt: headers.get("x-ratelimit-reset") ? new Date(Number(headers.get("x-ratelimit-reset")) * 1000).toISOString() : null,
  };
}

export async function requestGitHub(path, { token, accept, timeoutMs = 12_000 } = {}) {
  if (!path.startsWith("/")) throw new Error("GitHub API path must be absolute.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_ROOT}${path}`, {
      headers: {
        accept: accept || "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "SivitaHub/0.1",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    const rateLimit = rateLimitFromHeaders(response.headers);
    if (!response.ok) {
      const message = typeof payload === "object" && payload?.message ? payload.message : `GitHub API returned ${response.status}.`;
      throw new GitHubApiError(message, { status: response.status, details: payload, rateLimit });
    }
    return { payload, rateLimit };
  } catch (error) {
    if (error?.name === "AbortError") throw new GitHubApiError("GitHub did not respond before the request deadline.", { status: 504 });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function decodeBase64Content(value) {
  return value ? Buffer.from(String(value).replace(/\n/g, ""), "base64").toString("utf8") : "";
}

function excerpt(value, maxLength = 1200) {
  const text = String(value || "").replace(/```[\s\S]*?```/g, " ").replace(/<[^>]+>/g, " ").replace(/[#>*_`~\[\]()!]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}

async function fetchOptionalFile(owner, repo, path, token) {
  try {
    const { payload } = await requestGitHub(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`, { token });
    if (!payload || Array.isArray(payload) || payload.type !== "file") return null;
    return { path, sha: payload.sha, size: payload.size, content: decodeBase64Content(payload.content) };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  }
}

function parsePackageJson(file) {
  if (!file?.content) return null;
  try { return JSON.parse(file.content); } catch { return null; }
}

export function detectStack({ repository, files }) {
  const stack = new Set();
  if (repository.language) stack.add(repository.language);
  const byPath = new Map(files.map((file) => [file.path, file]));
  const packageJson = parsePackageJson(byPath.get("package.json"));
  if (packageJson) {
    stack.add("Node.js");
    const names = new Set(Object.keys({ ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) }));
    if (names.has("next")) stack.add("Next.js");
    if (names.has("react")) stack.add("React");
    if (names.has("vue")) stack.add("Vue");
    if (names.has("svelte")) stack.add("Svelte");
    if (names.has("express")) stack.add("Express");
    if (names.has("fastify")) stack.add("Fastify");
    if (names.has("hono")) stack.add("Hono");
    if (names.has("tailwindcss")) stack.add("Tailwind CSS");
    if (names.has("prisma") || names.has("@prisma/client")) stack.add("Prisma");
    if (names.has("drizzle-orm")) stack.add("Drizzle ORM");
  }
  const pythonText = [byPath.get("pyproject.toml")?.content, byPath.get("requirements.txt")?.content].filter(Boolean).join("\n").toLowerCase();
  if (pythonText) {
    stack.add("Python");
    if (pythonText.includes("fastapi")) stack.add("FastAPI");
    if (pythonText.includes("django")) stack.add("Django");
    if (pythonText.includes("flask")) stack.add("Flask");
    if (pythonText.includes("langchain")) stack.add("LangChain");
  }
  if (byPath.has("go.mod")) stack.add("Go");
  if (byPath.has("Cargo.toml")) stack.add("Rust");
  if (byPath.has("Gemfile")) stack.add("Ruby");
  if (byPath.has("composer.json")) stack.add("PHP");
  if (byPath.has("pom.xml") || byPath.has("build.gradle")) stack.add("Java");
  if (byPath.has("Dockerfile") || byPath.has("docker-compose.yml") || byPath.has("docker-compose.yaml")) stack.add("Docker");
  return [...stack].slice(0, 12);
}

export function detectCapabilities({ repository, readme }) {
  const source = ` ${[repository.name, repository.description, ...(repository.topics || []), readme].join(" ").toLowerCase()} `;
  const candidates = [
    ["MCP", ["model context protocol", " mcp ", "mcp-server"]],
    ["AI Agent", ["agent", "tool calling", "tool-calling"]],
    ["RAG", ["retrieval augmented", " rag ", "vector search"]],
    ["Chat UI", ["chat ui", "chatbot", "conversation"]],
    ["Authentication", ["authentication", "oauth", "login", " auth "]],
    ["Multi-tenant", ["multi-tenant", "multitenant", "tenant"]],
    ["Payments", ["payment", "billing", "stripe", "subscription"]],
    ["Component Registry", ["registry", "components", "component library"]],
    ["Workflow", ["workflow", "orchestration", "state machine"]],
    ["Observability", ["observability", "tracing", "telemetry"]],
    ["CLI", ["command line", " cli "]],
    ["API", [" rest api", "graphql", " api "]],
  ];
  return candidates.filter(([, terms]) => terms.some((term) => source.includes(term))).map(([label]) => label).slice(0, 10);
}

function detectExtensionPoints(rootEntries) {
  const preferred = new Set(["apps", "components", "examples", "extensions", "packages", "plugins", "src", "templates", "tools"]);
  return rootEntries.filter((entry) => entry.type === "dir" && preferred.has(entry.name.toLowerCase())).map((entry) => entry.path).slice(0, 8);
}

export async function fetchRepositorySnapshot(input, { token } = {}) {
  const parsed = parseGitHubRepository(input);
  const owner = encodeURIComponent(parsed.owner);
  const repo = encodeURIComponent(parsed.repo);
  const [repositoryResult, readmeResult, rootResult] = await Promise.allSettled([
    requestGitHub(`/repos/${owner}/${repo}`, { token }),
    requestGitHub(`/repos/${owner}/${repo}/readme`, { token }),
    requestGitHub(`/repos/${owner}/${repo}/contents/`, { token }),
  ]);
  if (repositoryResult.status === "rejected") throw repositoryResult.reason;
  const repositoryPayload = repositoryResult.value.payload;
  const readmePayload = readmeResult.status === "fulfilled" ? readmeResult.value.payload : null;
  const rootEntries = rootResult.status === "fulfilled" && Array.isArray(rootResult.value.payload)
    ? rootResult.value.payload.map((entry) => ({ name: entry.name, path: entry.path, type: entry.type, size: entry.size, sha: entry.sha }))
    : [];
  const rootNames = new Set(rootEntries.filter((entry) => entry.type === "file").map((entry) => entry.name));
  const files = (await Promise.all(KNOWN_MANIFESTS.filter((name) => rootNames.has(name)).map((name) => fetchOptionalFile(parsed.owner, parsed.repo, name, token)))).filter(Boolean);
  const readme = readmePayload?.content ? decodeBase64Content(readmePayload.content) : "";
  const repository = {
    id: repositoryPayload.id,
    name: repositoryPayload.name,
    fullName: repositoryPayload.full_name,
    url: repositoryPayload.html_url,
    description: repositoryPayload.description || "",
    defaultBranch: repositoryPayload.default_branch,
    archived: Boolean(repositoryPayload.archived),
    fork: Boolean(repositoryPayload.fork),
    visibility: repositoryPayload.visibility || (repositoryPayload.private ? "private" : "public"),
    language: repositoryPayload.language || null,
    topics: repositoryPayload.topics || [],
    license: repositoryPayload.license?.spdx_id || null,
    stars: repositoryPayload.stargazers_count || 0,
    forks: repositoryPayload.forks_count || 0,
    openIssues: repositoryPayload.open_issues_count || 0,
    updatedAt: repositoryPayload.updated_at,
    pushedAt: repositoryPayload.pushed_at,
    owner: { login: repositoryPayload.owner?.login, avatarUrl: repositoryPayload.owner?.avatar_url, type: repositoryPayload.owner?.type },
  };
  return {
    source: parsed,
    repository,
    readme: { path: readmePayload?.path || null, excerpt: excerpt(readme), sha: readmePayload?.sha || null },
    rootEntries,
    manifestFiles: files.map((file) => ({ path: file.path, sha: file.sha, size: file.size })),
    stack: detectStack({ repository, files }),
    capabilities: detectCapabilities({ repository, readme }),
    extensionPoints: detectExtensionPoints(rootEntries),
    rateLimit: repositoryResult.value.rateLimit,
  };
}
