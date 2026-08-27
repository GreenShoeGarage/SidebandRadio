import assert from "node:assert/strict";
import test from "node:test";
import { parseRange } from "../src/media.js";

test("parses bounded, open, and suffix byte ranges", () => {
  assert.deepEqual(parseRange("bytes=0-99", 1000), { start: 0, end: 99, length: 100 });
  assert.deepEqual(parseRange("bytes=900-", 1000), { start: 900, end: 999, length: 100 });
  assert.deepEqual(parseRange("bytes=-50", 1000), { start: 950, end: 999, length: 50 });
});

test("rejects unsatisfiable and multiple ranges", () => {
  assert.throws(() => parseRange("bytes=1000-1001", 1000), /outside/);
  assert.throws(() => parseRange("bytes=0-1,3-4", 1000), /one byte range/);
});
