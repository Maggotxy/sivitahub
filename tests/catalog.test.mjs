import assert from "node:assert/strict";
import test from "node:test";
import { catalogStats, getWheel, listCategories, listWheels } from "../src/catalog.mjs";

test("catalog exposes curated wheels and categories", () => {
  assert.ok(catalogStats().wheels >= 8);
  assert.ok(listCategories().some((category) => category.name === "MCP 与工具"));
  assert.equal(getWheel("shadcn-ui")?.repository, "shadcn-ui/ui");
});

test("catalog search matches stack, capability and Chinese category", () => {
  assert.ok(listWheels({ query: "MCP" }).some((wheel) => wheel.slug === "mcp-servers"));
  assert.ok(listWheels({ query: "Next.js" }).some((wheel) => wheel.slug === "cal-com"));
  assert.ok(listWheels({ category: "RAG 与知识库" }).every((wheel) => wheel.category === "RAG 与知识库"));
});
