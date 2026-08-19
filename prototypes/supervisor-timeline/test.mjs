import assert from "node:assert/strict";
import test from "node:test";
import { createPreviewServer } from "./server.mjs";

test("serves project routes and assets with restrictive headers", async (context) => {
  const server = createPreviewServer();
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  context.after(() => new Promise((resolvePromise) => server.close(resolvePromise)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const page = await fetch(`${base}/factures_platform`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/u);
  assert.match(page.headers.get("content-security-policy") ?? "", /connect-src 'none'/u);
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  const html = await page.text();
  assert.match(html, /Événements en direct/u);
  assert.match(html, /data-demo-only="true"/u);
  assert.doesNotMatch(html, /class="skip-link"/u);
  assert.doesNotMatch(html, /Données de démonstration/u);

  const script = await fetch(`${base}/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type") ?? "", /javascript/u);
  assert.match(await script.text(), /HUMAN_REQUIRED/u);

  const robots = await fetch(`${base}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get("content-type") ?? "", /text\/plain/u);
  assert.equal(await robots.text(), "User-agent: *\nDisallow: /\n");

  for (const privatePath of ["/README.md", "/server.mjs", "/deploy/nginx/supervisor-preview.conf"]) {
    const privateFile = await fetch(`${base}${privatePath}`);
    assert.equal(privateFile.status, 404);
  }

  const rejected = await fetch(`${base}/factures_platform`, { method: "POST" });
  assert.equal(rejected.status, 405);
});
