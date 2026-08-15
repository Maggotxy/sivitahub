import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(await readFile(join(here, "..", "data", "wheels.json"), "utf8"));

function normalize(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim();
}

function searchableText(item) {
  return normalize([item.name, item.repository, item.summary, item.category, item.kind, ...(item.stack || []), ...(item.tags || []), ...(item.capabilities || [])].join(" "));
}

export function listWheels({ query = "", category = "all" } = {}) {
  const terms = normalize(query).split(" ").filter(Boolean);
  const normalizedCategory = normalize(category);
  return catalog.filter((item) => {
    if (normalizedCategory && normalizedCategory !== "all" && normalize(item.category) !== normalizedCategory) return false;
    if (terms.length === 0) return true;
    const haystack = searchableText(item);
    return terms.every((term) => haystack.includes(term));
  }).sort((left, right) => {
    if (Boolean(left.featured) !== Boolean(right.featured)) return left.featured ? -1 : 1;
    return left.name.localeCompare(right.name, "zh-CN");
  });
}

export function getWheel(slug) {
  return catalog.find((item) => item.slug === slug) || null;
}

export function listCategories() {
  const counts = new Map();
  for (const item of catalog) counts.set(item.category, (counts.get(item.category) || 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function catalogStats() {
  return { wheels: catalog.length, categories: listCategories().length, sourceProviders: 1, codeHostedBySivitaHub: 0 };
}
