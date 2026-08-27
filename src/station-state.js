import { STATION_ID } from "./validation.js";

export const initialState = () => ({
  stationId: STATION_ID,
  mode: "OFFLINE",
  source: "NONE",
  scheduleRevisionId: null,
  occurrenceId: null,
  itemId: null,
  objectKey: null,
  startedAtUtc: null,
  stationStartedAtUtc: null,
  mediaOffsetSeconds: 0,
  durationSeconds: null,
  pausedAtUtc: null,
  transitionId: null,
  nextTransitionAtUtc: null,
  liveSessionId: null,
  listenerCount: 0,
  revision: 0,
  updatedAtUtc: new Date().toISOString(),
  item: null,
  program: null,
  quickBroadcastId: null,
  quickQueue: [],
  quickQueueIndex: -1,
});

export async function readState(env) {
  if (env.STATION_STATE) {
    const id = env.STATION_STATE.idFromName(STATION_ID);
    const response = await env.STATION_STATE.get(id).fetch("https://state.internal/state");
    if (response.ok) return response.json();
  }
  if (env.DB) {
    const row = await env.DB.prepare("SELECT state_json FROM station_runtime WHERE station_id = ?").bind(STATION_ID).first();
    if (row?.state_json) {
      try { return JSON.parse(row.state_json); } catch {}
    }
  }
  return initialState();
}

export async function transition(env, action, payload = {}) {
  if (env.STATION_STATE) {
    const id = env.STATION_STATE.idFromName(STATION_ID);
    const response = await env.STATION_STATE.get(id).fetch("https://state.internal/transition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }
  const current = await readState(env);
  const now = new Date().toISOString();
  const next = applyTransition(current, action, payload, now);
  if (env.DB) {
    await env.DB.prepare("INSERT INTO station_runtime (station_id,state_json,revision,updated_at_utc) VALUES (?,?,?,?) ON CONFLICT(station_id) DO UPDATE SET state_json=excluded.state_json, revision=excluded.revision, updated_at_utc=excluded.updated_at_utc WHERE excluded.revision > station_runtime.revision")
      .bind(STATION_ID, JSON.stringify(next), next.revision, now).run();
  }
  return next;
}

function queueDeadline(item, now) {
  const duration = Number(item?.durationSeconds || 0);
  return duration > 0 ? new Date(Date.parse(now) + duration * 1000).toISOString() : null;
}

function clearQuickQueue() {
  return { quickBroadcastId: null, quickQueue: [], quickQueueIndex: -1 };
}

export function applyTransition(current, action, payload, now = new Date().toISOString()) {
  const next = {
    ...current,
    revision: Number(current.revision || 0) + 1,
    transitionId: payload.transitionId || crypto.randomUUID(),
    updatedAtUtc: now,
  };
  const offset = current.startedAtUtc && !current.pausedAtUtc
    ? Number(current.mediaOffsetSeconds || 0) + (Date.parse(now) - Date.parse(current.startedAtUtc)) / 1000
    : Number(current.mediaOffsetSeconds || 0);

  if (action === "pause") {
    Object.assign(next, {
      mode: "PAUSED",
      mediaOffsetSeconds: offset,
      pausedAtUtc: now,
      nextTransitionAtUtc: null,
    });
  } else if (action === "resume") {
    const quick = current.source === "QUICK_BROADCAST";
    const duration = Number(current.item?.durationSeconds || current.durationSeconds || 0);
    Object.assign(next, {
      mode: payload.resumeMode || (quick ? "MANUAL" : "SCHEDULED"),
      startedAtUtc: now,
      pausedAtUtc: null,
      nextTransitionAtUtc: quick && duration > offset ? new Date(Date.parse(now) + (duration - offset) * 1000).toISOString() : current.nextTransitionAtUtc,
    });
  } else if (action === "start") {
    Object.assign(next, {
      mode: "SCHEDULED",
      source: "SCHEDULE",
      stationStartedAtUtc: current.stationStartedAtUtc || now,
      startedAtUtc: payload.startedAtUtc || now,
      pausedAtUtc: null,
      mediaOffsetSeconds: payload.mediaOffsetSeconds || 0,
      item: payload.item || current.item,
      program: payload.program || current.program,
      ...clearQuickQueue(),
    });
  } else if (action === "skip") {
    Object.assign(next, {
      mode: payload.item ? "MANUAL" : "FALLBACK",
      source: payload.item ? "MANUAL" : "FALLBACK",
      startedAtUtc: now,
      pausedAtUtc: null,
      mediaOffsetSeconds: 0,
      item: payload.item || null,
      nextTransitionAtUtc: null,
      ...clearQuickQueue(),
    });
  } else if (action === "restart") {
    const quick = current.source === "QUICK_BROADCAST";
    Object.assign(next, {
      startedAtUtc: now,
      pausedAtUtc: null,
      mediaOffsetSeconds: 0,
      nextTransitionAtUtc: quick ? queueDeadline(current.item, now) : current.nextTransitionAtUtc,
    });
  } else if (action === "fallback") {
    Object.assign(next, {
      mode: "FALLBACK",
      source: "FALLBACK",
      startedAtUtc: now,
      pausedAtUtc: null,
      mediaOffsetSeconds: 0,
      item: payload.item || null,
      liveSessionId: null,
      liveSource: null,
      nextTransitionAtUtc: null,
      ...clearQuickQueue(),
    });
  } else if (action === "return-to-schedule") {
    Object.assign(next, {
      mode: "SCHEDULED",
      source: "SCHEDULE",
      startedAtUtc: payload.startedAtUtc || now,
      pausedAtUtc: null,
      mediaOffsetSeconds: payload.mediaOffsetSeconds || 0,
      item: payload.item || current.item,
      liveSessionId: null,
      liveSource: null,
      nextTransitionAtUtc: null,
      ...clearQuickQueue(),
    });
  } else if (action === "live") {
    Object.assign(next, {
      mode: "LIVE",
      source: "REALTIME",
      stationStartedAtUtc: current.stationStartedAtUtc || now,
      liveSessionId: payload.liveSessionId,
      liveSource: payload.liveSource,
      startedAtUtc: now,
      pausedAtUtc: null,
      mediaOffsetSeconds: 0,
      item: null,
      nextTransitionAtUtc: payload.nextTransitionAtUtc,
      ...clearQuickQueue(),
    });
  } else if (action === "live-heartbeat" && current.mode === "LIVE" && current.liveSessionId === payload.liveSessionId) {
    Object.assign(next, { nextTransitionAtUtc: payload.nextTransitionAtUtc });
  } else if (action === "quick-broadcast") {
    const queue = Array.isArray(payload.items) ? payload.items : [];
    const item = queue[0] || null;
    Object.assign(next, {
      mode: item ? "MANUAL" : "OFFLINE",
      source: item ? "QUICK_BROADCAST" : "NONE",
      stationStartedAtUtc: item ? now : null,
      startedAtUtc: item ? now : null,
      pausedAtUtc: null,
      mediaOffsetSeconds: 0,
      durationSeconds: item?.durationSeconds || null,
      itemId: item?.id || null,
      item,
      program: item ? { name: payload.programName || "Easy Broadcast", description: `${queue.length} selected file${queue.length === 1 ? "" : "s"}`, host: "Station operator" } : null,
      quickBroadcastId: payload.quickBroadcastId || crypto.randomUUID(),
      quickQueue: queue,
      quickQueueIndex: item ? 0 : -1,
      nextTransitionAtUtc: queueDeadline(item, now),
      liveSessionId: null,
      liveSource: null,
    });
  } else if (action === "quick-next") {
    const queue = Array.isArray(current.quickQueue) ? current.quickQueue : [];
    const index = Number.isInteger(payload.index) ? payload.index : Number(current.quickQueueIndex || 0) + 1;
    const item = payload.item || queue[index] || null;
    Object.assign(next, item ? {
      mode: "MANUAL",
      source: "QUICK_BROADCAST",
      startedAtUtc: now,
      pausedAtUtc: null,
      mediaOffsetSeconds: 0,
      durationSeconds: item.durationSeconds || null,
      itemId: item.id,
      item,
      quickQueueIndex: index,
      nextTransitionAtUtc: queueDeadline(item, now),
    } : {
      mode: "OFFLINE",
      source: "NONE",
      startedAtUtc: null,
      stationStartedAtUtc: null,
      pausedAtUtc: null,
      mediaOffsetSeconds: 0,
      durationSeconds: null,
      itemId: null,
      item: null,
      program: null,
      nextTransitionAtUtc: null,
      ...clearQuickQueue(),
    });
  } else if (action === "quick-complete") {
    Object.assign(next, {
      mode: "OFFLINE",
      source: "NONE",
      startedAtUtc: null,
      stationStartedAtUtc: null,
      pausedAtUtc: null,
      mediaOffsetSeconds: 0,
      durationSeconds: null,
      itemId: null,
      item: null,
      program: null,
      nextTransitionAtUtc: null,
      ...clearQuickQueue(),
    });
  }
  return next;
}
