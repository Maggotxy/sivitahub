const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validate(owner, repo) {
  const cleanRepo = repo.replace(/\.git$/i, "");
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(cleanRepo)) {
    throw invalid("GitHub repository must use a valid owner/name pair.");
  }
  return {
    owner,
    repo: cleanRepo,
    fullName: `${owner}/${cleanRepo}`,
    url: `https://github.com/${owner}/${cleanRepo}`,
  };
}

export function parseGitHubRepository(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw invalid("A GitHub repository URL or owner/name value is required.");
  }
  const value = input.trim();
  const scpMatch = value.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
  if (scpMatch) return validate(scpMatch[1], scpMatch[2]);
  const sshMatch = value.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+)$/i);
  if (sshMatch) return validate(sshMatch[1], sshMatch[2]);
  if (!value.includes("://") && !value.startsWith("git@")) {
    const parts = value.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length === 2) return validate(parts[0], parts[1]);
  }
  let url;
  try { url = new URL(value); } catch { throw invalid("Only GitHub repository URLs are supported."); }
  if (url.hostname.toLowerCase() !== "github.com") {
    throw invalid("Only github.com repositories are supported in this MVP.");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw invalid("GitHub URL must include both owner and repository name.");
  return validate(decodeURIComponent(parts[0]), decodeURIComponent(parts[1]));
}
