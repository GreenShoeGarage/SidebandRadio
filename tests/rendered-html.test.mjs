import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { handleRequest } from "../src/worker.js";

test("framework-free listener exposes the exact product title", async () => {
  const source = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(source, /<title>SIDEBAND — Audio Broadcast Workbench<\/title>/);
  assert.match(source, /<script type="module" src="\.\/scripts\/listener\.js"><\/script>/);
});

test("health endpoint reports the exact application version", async () => {
  const response = await handleRequest(new Request("http://localhost/api/health/public"), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.version, "0.4.1");
  assert.equal(body.status, "available");
});

test("production health endpoint works beneath the radio base path", async () => {
  const response = await handleRequest(new Request("https://greenshoegarage.com/radio/api/health/public"), {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).version, "0.4.1");
});

test("bare radio path redirects to its trailing-slash form", async () => {
  const response = await handleRequest(new Request("https://greenshoegarage.com/radio"), {});
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://greenshoegarage.com/radio/");
});
