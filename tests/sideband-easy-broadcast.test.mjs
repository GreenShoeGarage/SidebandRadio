import assert from "node:assert/strict";
import test from "node:test";
import { StationStateDurableObject } from "../src/station-durable-object.js";
import { applyTransition, initialState } from "../src/station-state.js";
import { handleRequest } from "../src/worker.js";

const files = [
  { id: "audio_1", title: "First file", durationSeconds: 120, mediaUrl: "/media/audio_1", objectKey: "private/first" },
  { id: "audio_2", title: "Second file", durationSeconds: 90, mediaUrl: "/media/audio_2", objectKey: "private/second" },
];

test("Easy Broadcast starts immediately and advances its selected queue", () => {
  const started = applyTransition(initialState(), "quick-broadcast", { items: files, quickBroadcastId: "quick_1" }, "2026-08-27T12:00:00Z");
  assert.equal(started.mode, "MANUAL");
  assert.equal(started.source, "QUICK_BROADCAST");
  assert.equal(started.item.id, "audio_1");
  assert.equal(started.quickQueue.length, 2);
  assert.equal(started.nextTransitionAtUtc, "2026-08-27T12:02:00.000Z");

  const advanced = applyTransition(started, "quick-next", { index: 1 }, "2026-08-27T12:02:00Z");
  assert.equal(advanced.item.id, "audio_2");
  assert.equal(advanced.quickQueueIndex, 1);
  assert.equal(advanced.nextTransitionAtUtc, "2026-08-27T12:03:30.000Z");

  const completed = applyTransition(advanced, "quick-complete", {}, "2026-08-27T12:03:30Z");
  assert.equal(completed.mode, "OFFLINE");
  assert.equal(completed.source, "NONE");
  assert.equal(completed.item, null);
  assert.deepEqual(completed.quickQueue, []);
});

test("pausing Easy Broadcast holds its place and resume restores the automatic deadline", () => {
  const started = applyTransition(initialState(), "quick-broadcast", { items: files }, "2026-08-27T12:00:00Z");
  const paused = applyTransition(started, "pause", {}, "2026-08-27T12:00:30Z");
  assert.equal(paused.mode, "PAUSED");
  assert.equal(paused.mediaOffsetSeconds, 30);
  assert.equal(paused.nextTransitionAtUtc, null);
  const resumed = applyTransition(paused, "resume", {}, "2026-08-27T12:01:00Z");
  assert.equal(resumed.mode, "MANUAL");
  assert.equal(resumed.source, "QUICK_BROADCAST");
  assert.equal(resumed.nextTransitionAtUtc, "2026-08-27T12:02:30.000Z");
});

test("Durable Object alarm advances and completes an Easy Broadcast queue", async () => {
  const priorPair = globalThis.WebSocketRequestResponsePair;
  globalThis.WebSocketRequestResponsePair = class {};
  let stored = applyTransition(initialState(), "quick-broadcast", { items: files, quickBroadcastId: "quick_alarm" }, "2026-08-27T12:00:00Z");
  stored.nextTransitionAtUtc = "2026-08-27T12:00:01Z";
  let alarm = null;
  const ctx = {
    setWebSocketAutoResponse() {},
    getWebSockets() { return []; },
    storage: {
      async get() { return stored; },
      async put(_key, value) { stored = value; },
      async setAlarm(value) { alarm = value; },
      async deleteAlarm() { alarm = null; },
    },
  };
  try {
    const object = new StationStateDurableObject(ctx, {});
    await object.alarm();
    assert.equal(stored.item.id, "audio_2");
    assert.ok(alarm instanceof Date);
    stored.nextTransitionAtUtc = "2026-08-27T12:00:01Z";
    await object.alarm();
    assert.equal(stored.mode, "OFFLINE");
    assert.equal(alarm, null);
  } finally {
    globalThis.WebSocketRequestResponsePair = priorPair;
  }
});

test("public state exposes queue progress without private storage keys", async () => {
  const quick = applyTransition(initialState(), "quick-broadcast", { items: files, quickBroadcastId: "quick_public" }, "2026-08-27T12:00:00Z");
  const env = {
    STATION_STATE: {
      idFromName() { return "station"; },
      get() { return { fetch() { return Response.json(quick); } }; },
    },
  };
  const response = await handleRequest(new Request("http://localhost/api/public/state"), env);
  const body = await response.json();
  assert.equal(body.state.queuePosition, 1);
  assert.equal(body.state.queueLength, 2);
  assert.equal(body.state.nextItem.title, "Second file");
  assert.equal(JSON.stringify(body).includes("private/first"), false);
  assert.equal("quickQueue" in body.state, false);
});

test("protected Easy Broadcast endpoint validates uploaded assets and starts the queue", async () => {
  let state = initialState();
  const rows = new Map(files.map(file => [file.id, {
    id: file.id,
    title: file.title,
    artist: null,
    duration_seconds: file.durationSeconds,
    mime_type: "audio/mpeg",
    availability: "AVAILABLE",
  }]));
  const durable = {
    idFromName() { return "station"; },
    get() {
      return {
        async fetch(request, options = {}) {
          const url = new URL(typeof request === "string" ? request : request.url);
          if (url.pathname === "/state") return Response.json(state);
          const { action, payload } = typeof request === "string" ? JSON.parse(options.body) : await request.json();
          state = applyTransition(state, action, payload, "2026-08-27T12:00:00Z");
          return Response.json(state);
        },
      };
    },
  };
  const env = {
    ENVIRONMENT: "development",
    ALLOW_WORKSPACE_AUTH: "true",
    STATION_STATE: durable,
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              async first() { return sql.startsWith("SELECT * FROM audio_assets") ? rows.get(values[0]) || null : null; },
              async run() { return { success: true }; },
            };
          },
        };
      },
    },
  };
  const response = await handleRequest(new Request("http://localhost/api/admin/easy-broadcast/start", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      "oai-authenticated-user-email": "operator@example.com",
    },
    body: JSON.stringify({ assetIds: ["audio_1", "audio_2"] }),
  }), env);
  const responseText = await response.text();
  assert.equal(response.status, 201, responseText);
  const body = JSON.parse(responseText);
  assert.equal(body.state.source, "QUICK_BROADCAST");
  assert.equal(body.state.item.id, "audio_1");
  assert.equal(body.queueLength, 2);
});
