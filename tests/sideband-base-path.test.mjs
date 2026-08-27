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
