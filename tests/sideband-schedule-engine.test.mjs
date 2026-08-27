import assert from "node:assert/strict";
import test from "node:test";
import { activeOccurrence, reconstructState, resolveLocalTime, validateOccurrences } from "../src/schedule-engine.js";

test("priority deterministically resolves overlapping active occurrences", () => {
  const now = new Date("2026-08-26T12:30:00Z");
  const items = [
    { id: "a", startAtUtc: "2026-08-26T12:00:00Z", endAtUtc: "2026-08-26T13:00:00Z", priority: 1 },
    { id: "b", startAtUtc: "2026-08-26T12:15:00Z", endAtUtc: "2026-08-26T12:45:00Z", priority: 5 },
  ];
  assert.equal(activeOccurrence(items, now).id, "b");
  assert.equal(validateOccurrences(items).conflicts[0].resolution, "b");
});

test("state reconstruction joins the correct item instead of replaying missed items", () => {
  const occurrence = { id: "show", startAtUtc: "2026-08-26T12:00:00Z", endAtUtc: "2026-08-26T13:00:00Z", items: [
    { id: "first", durationSeconds: 600 }, { id: "second", durationSeconds: 600 }, { id: "third", durationSeconds: 600 },
  ] };
  const state = reconstructState({ occurrences: [occurrence], now: new Date("2026-08-26T12:15:00Z") });
  assert.equal(state.item.id, "second");
  assert.equal(state.startedAtUtc, "2026-08-26T12:10:00.000Z");
});

test("daylight-saving gaps and repeated local times are explicit", () => {
  assert.equal(resolveLocalTime("2026-03-08", "02:30:00", "America/New_York").status, "NONEXISTENT");
  assert.equal(resolveLocalTime("2026-11-01", "01:30:00", "America/New_York").status, "AMBIGUOUS");
});
