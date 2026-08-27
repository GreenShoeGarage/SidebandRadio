import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  cancelPlayback,
  requestPlayback,
  resetPlaybackIntentForTest,
  wantsPlayback,
} from "../public/scripts/playback-intent.js";
import { mediaErrorMessage } from "../public/scripts/audio-engine.js";

test("one playback intention is shared across prerecorded and microphone sources", () => {
  resetPlaybackIntentForTest();
  assert.equal(wantsPlayback(), false);
  requestPlayback();
  assert.equal(wantsPlayback(), true);
  cancelPlayback();
  assert.equal(wantsPlayback(), false);
});

test("listener source handoff detaches a microphone stream before MP3 playback", async () => {
  const [listener, liveListener] = await Promise.all([
    readFile(new URL("../public/scripts/listener.js", import.meta.url), "utf8"),
    readFile(new URL("../public/scripts/live-listener.js", import.meta.url), "utf8"),
  ]);
  assert.match(listener, /from "\.\/playback-intent\.js"/);
  assert.match(liveListener, /from "\.\/playback-intent\.js"/);
  assert.match(listener, /if \(audio\.srcObject\) audio\.srcObject = null/);
  assert.doesNotMatch(listener, /let playingIntent/);
  assert.doesNotMatch(liveListener, /let intent/);
});

test("an armed listener waits through an empty fallback for the next file", async () => {
  const listener = await readFile(new URL("../public/scripts/listener.js", import.meta.url), "utf8");
  const joinLive = listener.slice(listener.indexOf("async function joinLive"), listener.indexOf("function updateButton"));
  assert.match(listener, /Listening is armed/);
  assert.doesNotMatch(joinLive, /cancelPlayback\(\)/);
});

test("browser media failures explain download and decode failures", () => {
  assert.match(mediaErrorMessage({ error: { code: 2 } }), /downloaded from station storage/);
  assert.match(mediaErrorMessage({ error: { code: 3 } }), /could not decode/);
  assert.match(mediaErrorMessage({ error: { code: 4 } }), /not supported/);
});
