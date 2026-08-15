import assert from "node:assert/strict";
import test from "node:test";
import { createSivitaHubServer } from "../src/app-server.mjs";

async function withServer(run) {
  const server = createSivitaHubServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("health, catalog and static UI are available", async () => {
  await withServer(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, "ok");
    const wheels = await fetch(`${baseUrl}/api/wheels?q=MCP`);
    assert.equal(wheels.status, 200);
    assert.ok((await wheels.json()).wheels.some((wheel) => wheel.slug === "mcp-servers"));
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /SivitaHub/);
    assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
  });
});

test("import endpoint rejects non-GitHub targets before network access", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/import/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository: "https://example.com/owner/repo" }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error.message, /Only github\.com/);
  });
});
