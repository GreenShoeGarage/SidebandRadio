import assert from "node:assert/strict";
import test from "node:test";
import { applyTransition, initialState } from "../src/station-state.js";
import { parseBackup } from "../src/validation.js";

test("station transitions are monotonic and preserve held playhead", () => {
  const started = applyTransition(initialState(), "start", {}, "2026-08-26T12:00:00Z");
  const paused = applyTransition(started, "pause", {}, "2026-08-26T12:00:30Z");
  const resumed = applyTransition(paused, "resume", {}, "2026-08-26T12:01:00Z");
  assert.deepEqual([started.revision, paused.revision, resumed.revision], [1, 2, 3]);
  assert.equal(paused.mediaOffsetSeconds, 30);
  assert.equal(resumed.mediaOffsetSeconds, 30);
});

test("fallback transition ends live mode", () => {
  const live = applyTransition(initialState(), "live", { liveSessionId: "live_1" }, "2026-08-26T12:00:00Z");
  const fallback = applyTransition(live, "fallback", { item: { id: "fallback" } }, "2026-08-26T12:01:00Z");
  assert.equal(fallback.mode, "FALLBACK");
  assert.equal(fallback.liveSessionId, null);
  assert.equal(fallback.item.id, "fallback");
});

test("backup validation accepts 1.x and rejects incompatible major versions", () => {
  assert.equal(parseBackup({ format: "sideband-backup", version: "1.2" }).version, "1.2");
  assert.throws(() => parseBackup({ format: "sideband-backup", version: "2.0" }), /incompatible/);
});
