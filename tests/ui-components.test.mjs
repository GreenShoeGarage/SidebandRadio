import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("public listener identifies audio-only playback and the exact version", async () => {
  const html = await read("public/index.html");
  assert.match(html, /AUDIO ONLY/);
  assert.match(html, /v0\.4\.2/);
  assert.match(html, /id="listenButton"/);
  assert.match(html, /id="returnLiveButton"/);
  assert.match(html, /<audio[^>]+id="stationAudio"/);
  assert.match(html, /id="widgetGenerator"/);
  assert.match(html, /id="widgetCopy"/);
});

test("station studio exposes every required work area", async () => {
  const html = await read("public/studio.html");
  for (const label of ["ON AIR", "AUDIO LIBRARY", "PLAYLISTS + CLOCKS", "SCHEDULE", "CART WALL", "SETTINGS", "LOGS + HISTORY", "DIAGNOSTICS"]) {
    assert.match(html, new RegExp(label.replace("+", "\\+")));
  }
  assert.match(html, /Disruptive actions require confirmation/);
  assert.match(html, /NOT CONFIGURED/);
});

test("interface includes focus, reduced-motion, and responsive rules", async () => {
  const css = `${await read("public/styles/shared.css")}\n${await read("public/styles/studio.css")}`;
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /@media\(max-width:/);
});
