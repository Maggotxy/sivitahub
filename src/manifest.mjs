function guessKind(snapshot) {
  const values = new Set(snapshot.capabilities || []);
  if (values.has("Component Registry")) return "registry";
  if (values.has("MCP")) return "mcp-server";
  if (values.has("AI Agent") || values.has("Workflow")) return "agent-kit";
  if (values.has("Chat UI")) return "application";
  if (snapshot.rootEntries.some((entry) => entry.name === "packages")) return "monorepo";
  return "repository";
}

function yamlScalar(value) {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const text = String(value);
  if (text === "" || /[:#\-\n{}\[\],&*!|>'\"%@`]/.test(text) || /^\s|\s$/.test(text)) return JSON.stringify(text);
  return text;
}

function renderYaml(value, indent = 0) {
  const padding = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${padding}[]`;
    return value.map((item) => item && typeof item === "object" ? `${padding}-\n${renderYaml(item, indent + 2)}` : `${padding}- ${yamlScalar(item)}`).join("\n");
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return `${padding}{}`;
    return entries.map(([key, item]) => item && typeof item === "object" ? `${padding}${key}:\n${renderYaml(item, indent + 2)}` : `${padding}${key}: ${yamlScalar(item)}`).join("\n");
  }
  return `${padding}${yamlScalar(value)}`;
}

export function buildWheelManifest(snapshot, now = new Date()) {
  const repository = snapshot.repository;
  const editablePaths = snapshot.extensionPoints.length > 0 ? snapshot.extensionPoints.map((path) => `${path}/**`) : ["src/**"];
  return {
    schema: "https://sivitahub.dev/schemas/wheel-v1.json",
    id: `github:${repository.fullName.toLowerCase()}`,
    name: repository.fullName,
    kind: guessKind(snapshot),
    summary: repository.description || snapshot.readme.excerpt.slice(0, 240) || "No repository summary available.",
    source: { provider: "github", repository: repository.fullName, url: repository.url, defaultBranch: repository.defaultBranch, visibility: repository.visibility },
    capabilities: snapshot.capabilities,
    stack: snapshot.stack,
    extensionPoints: snapshot.extensionPoints,
    manifests: snapshot.manifestFiles.map((file) => file.path),
    license: { spdx: repository.license, status: repository.license ? "detected" : "needs-review" },
    safety: {
      executesImportedCode: false,
      sourceContentTrusted: false,
      notes: ["Repository content is treated as untrusted input.", "License and security findings require independent verification before redistribution."],
    },
    ai: { editablePaths, protectedPaths: [".github/workflows/**"], acceptance: [] },
    provenance: { generatedBy: "sivitahub-deterministic-importer", verification: "github-api", generatedAt: now.toISOString() },
  };
}

export function wheelManifestYaml(manifest) {
  return `${renderYaml(manifest)}\n`;
}
