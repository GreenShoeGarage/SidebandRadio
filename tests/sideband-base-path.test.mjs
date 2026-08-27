import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/worker.js";

function assetsEnvironment() {
  return {
    ASSETS: {
      fetch(request) {
        return new Response(new URL(request.url).pathname, {
          headers: { "content-type": "text/html" },
        });
      },
    },
  };
}

test("prefixed static requests are stripped before asset lookup", async () => {
  const response = await handleRequest(
    new Request("https://greenshoegarage.com/radio/index.html"),
    assetsEnvironment(),
  );
  assert.equal(await response.text(), "/index.html");
});

test("prefixed listener root explicitly serves index without an asset redirect", async () => {
  const response = await handleRequest(
    new Request("https://greenshoegarage.com/radio/"),
    assetsEnvironment(),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "/index.html");
});

test("prefixed Studio route still requires operator authentication", async () => {
  const response = await handleRequest(
    new Request("https://greenshoegarage.com/radio/studio.html"),
    { ...assetsEnvironment(), ENVIRONMENT: "production" },
  );
  assert.equal(response.status, 401);
});

test("extensionless Studio route requires authentication", async () => {
  const response = await handleRequest(
    new Request("https://greenshoegarage.com/radio/studio"),
    { ...assetsEnvironment(), ENVIRONMENT: "production" },
  );
  assert.equal(response.status, 401);
});

test("extensionless Studio route serves the Studio asset after authentication", async () => {
  const response = await handleRequest(
    new Request("https://greenshoegarage.com/radio/studio", {
      headers: { "oai-authenticated-user-email": "operator@example.com" },
    }),
    {
      ...assetsEnvironment(),
      ENVIRONMENT: "development",
      ALLOW_WORKSPACE_AUTH: "true",
    },
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "/studio.html");
});

test("production rejects a forged preview-host identity header", async () => {
  const response = await handleRequest(
    new Request("https://greenshoegarage.com/radio/studio.html", {
      headers: { "oai-authenticated-user-email": "attacker@example.com" },
    }),
    { ...assetsEnvironment(), ENVIRONMENT: "production", ALLOW_WORKSPACE_AUTH: "true" },
  );
  assert.equal(response.status, 401);
});

test("explicit non-production preview identity remains available", async () => {
  const response = await handleRequest(
    new Request("http://localhost/studio.html", {
      headers: { "oai-authenticated-user-email": "operator@example.com" },
    }),
    { ...assetsEnvironment(), ENVIRONMENT: "development", ALLOW_WORKSPACE_AUTH: "true" },
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "/studio.html");
});

test("local root development remains available", async () => {
  const response = await handleRequest(
    new Request("http://localhost/index.html"),
    assetsEnvironment(),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "/index.html");
});

test("browser runtime uses the current radio directory as its API base", async () => {
  globalThis.location = {
    origin: "https://greenshoegarage.com",
    href: "https://greenshoegarage.com/radio/index.html",
  };
  globalThis.SIDEBAND_CONFIG = { apiBaseUrl: "" };
  try {
    const runtime = await import(`../public/scripts/runtime-config.js?test=${Date.now()}`);
    assert.equal(runtime.apiUrl("/api/public/state"), "https://greenshoegarage.com/radio/api/public/state");
    assert.equal(runtime.apiUrl("/media/asset-1"), "https://greenshoegarage.com/radio/media/asset-1");
    assert.equal(runtime.webSocketUrl(), "wss://greenshoegarage.com/radio/api/public/ws");
  } finally {
    delete globalThis.location;
    delete globalThis.SIDEBAND_CONFIG;
  }
});

test("prefixed MP3 requests preserve byte ranges through the Worker route", async () => {
  const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);
  const env = {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                return { id: "audio-1", object_key: "private/audio-1.mp3", mime_type: "audio/mpeg" };
              },
            };
          },
        };
      },
    },
    BUCKET: {
      async head(key) {
        assert.equal(key, "private/audio-1.mp3");
        return { size: bytes.length, etag: "mp3", uploaded: new Date("2026-08-27T12:00:00Z"), httpMetadata: { contentType: "audio/mpeg" } };
      },
      async get(key, options) {
        assert.equal(key, "private/audio-1.mp3");
        const offset = options?.range?.offset || 0;
        const length = options?.range?.length || bytes.length;
        return { body: bytes.slice(offset, offset + length) };
      },
    },
  };
  const response = await handleRequest(new Request("https://greenshoegarage.com/radio/media/audio-1", {
    headers: { range: "bytes=0-2" },
  }), env);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(response.headers.get("content-range"), "bytes 0-2/6");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes.slice(0, 3));
});
