import assert from "node:assert/strict";
import test from "node:test";
import { buildEmbedCode, buildWidgetUrl, normalizeWidgetSettings, readWidgetSettings, widgetDimensions } from "../public/scripts/widget-config.js";
import { handleRequest } from "../src/worker.js";

test("widget settings accept supported choices and reject unsafe values", () => {
  assert.deepEqual(normalizeWidgetSettings({ layout: "wide", theme: "light", accent: "#12Abef", artwork: false, details: "0", stationLink: "1" }), {
    layout: "wide",
    theme: "light",
    accent: "#12abef",
    artwork: false,
    details: false,
    stationLink: true,
  });
  assert.equal(normalizeWidgetSettings({ layout: "giant", accent: "red;position:fixed" }).layout, "standard");
  assert.equal(normalizeWidgetSettings({ accent: "red;position:fixed" }).accent, "#8fc46f");
});

test("widget URL and iframe code carry only normalized public options", () => {
  const settings = readWidgetSettings("?layout=compact&theme=system&accent=%23abcdef&artwork=0&details=1&stationLink=0");
  const url = buildWidgetUrl("https://radio.example", settings);
  assert.match(url, /^https:\/\/radio\.example\/embed\.html\?/);
  assert.match(url, /accent=%23abcdef/);
  assert.deepEqual(widgetDimensions(settings.layout), { width: 360, height: 280 });
  const code = buildEmbedCode("https://radio.example", settings, 'Mike\'s "Radio"');
  assert.match(code, /width="360" height="280"/);
  assert.match(code, /allow="autoplay"/);
  assert.match(code, /Mike&#39;s &quot;Radio&quot;/);
  assert.match(code, /&amp;theme=system/);
});

test("only the compact player permits third-party framing", async () => {
  const env = { ASSETS: { fetch: () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) } };
  const widget = await handleRequest(new Request("https://radio.example/embed.html?theme=dark"), env);
  assert.match(widget.headers.get("content-security-policy"), /frame-ancestors \*/);
  assert.equal(widget.headers.get("x-frame-options"), null);
  const listener = await handleRequest(new Request("https://radio.example/index.html"), env);
  assert.match(listener.headers.get("content-security-policy"), /frame-ancestors 'self'/);
  assert.equal(listener.headers.get("x-frame-options"), "SAMEORIGIN");
});
