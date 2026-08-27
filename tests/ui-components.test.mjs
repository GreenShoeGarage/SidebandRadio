import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("public listener identifies audio-only playback and the exact version", async () => {
  const html = await read("public/index.html");
  assert.match(html, /AUDIO ONLY/);
  assert.match(html, /v0\.5\.3/);
  assert.match(html, /id="listenButton"/);
  assert.match(html, /id="returnLiveButton"/);
  assert.match(html, /<audio[^>]+id="stationAudio"/);
  assert.match(html, /id="widgetGenerator"/);
  assert.match(html, /id="widgetCopy"/);
  assert.match(html, /id="liveSignalBanner"/);
  assert.match(html, /LIVE NOW/);
});

test("station studio exposes every required work area", async () => {
  const html = await read("public/studio.html");
  for (const label of ["ON AIR", "AUDIO LIBRARY", "PLAYLISTS + CLOCKS", "SCHEDULE", "CART WALL", "SETTINGS", "LOGS + HISTORY", "DIAGNOSTICS"]) {
    assert.match(html, new RegExp(label.replace("+", "\\+")));
  }
  assert.match(html, /Disruptive actions require confirmation/);
  assert.match(html, /NOT CONFIGURED/);
  assert.match(html, /id="studioLiveBanner"/);
  assert.match(html, /BROADCASTING TO PUBLIC LISTENERS/);
  assert.match(html, /scripts\/studio-live-ui\.js/);
  assert.match(html, /id="studioModeToggle"/);
  assert.match(html, /id="easyBroadcastPanel"/);
  assert.match(html, /SELECT FILES\. HIT BROADCAST\./);
  assert.match(html, /scripts\/easy-broadcast\.js/);
});

test("Easy Broadcast presents a two-step workflow and retains Advanced mode", async () => {
  const [html, script, css, worker] = await Promise.all([
    read("public/studio.html"),
    read("public/scripts/easy-broadcast.js"),
    read("public/styles/easy-broadcast.css"),
    read("src/worker.js"),
  ]);
  assert.match(html, /CHOOSE AUDIO FILES/);
  assert.match(html, /BROADCAST SELECTED FILES/);
  assert.match(html, /id="easyTransport"/);
  assert.match(html, /id="easyPause"/);
  assert.match(html, /id="easySkip"/);
  assert.match(script, /\/api\/admin\/easy-broadcast\/start/);
  assert.match(script, /sideband-studio-mode/);
  assert.match(css, /\.easy-mode \.nav-button\[data-panel="playlists"\]/);
  assert.match(css, /\.advanced-mode #easyBroadcastPanel/);
  assert.match(worker, /EASY_BROADCAST_START/);
});

test("listener, studio, and widget render live microphone state as on air", async () => {
  const [listener, studio, embed, liveCss] = await Promise.all([
    read("public/scripts/listener.js"),
    read("public/scripts/studio-live-ui.js"),
    read("public/embed.html"),
    read("public/styles/live-state.css"),
  ]);
  assert.match(listener, /LIVE MICROPHONE — ON AIR/);
  assert.match(listener, /station-live/);
  assert.doesNotMatch(listener, /Live audio requires a configured Cloudflare Realtime session/);
  assert.match(studio, /ON AIR — LIVE MICROPHONE/);
  assert.match(studio, /studio-is-live/);
  assert.match(embed, /class="embed-live-banner"/);
  assert.match(liveCss, /\.station-live \.embed-player/);
});

test("interface includes focus, reduced-motion, and responsive rules", async () => {
  const css = `${await read("public/styles/shared.css")}\n${await read("public/styles/studio.css")}\n${await read("public/styles/live-state.css")}`;
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /@media\(max-width:/);
});
