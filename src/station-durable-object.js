import { applyTransition, initialState } from "./station-state.js";

export class StationStateDurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async state() {
    return (await this.ctx.storage.get("state")) || initialState();
  }

  async store(next) {
    next.listenerCount = this.ctx.getWebSockets().length;
    await this.ctx.storage.put("state", next);
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(JSON.stringify({ type: "station-state", state: next, serverNowUtc: new Date().toISOString() })); } catch {}
    }
  }

  async schedule(next) {
    if (next.nextTransitionAtUtc) await this.ctx.storage.setAlarm(new Date(next.nextTransitionAtUtc));
    else await this.ctx.storage.deleteAlarm();
  }

  async log(eventType, message, metadata = {}) {
    if (!this.env.DB) return;
    try {
      await this.env.DB.prepare("INSERT INTO station_logs (id,station_id,event_type,message,correlation_id,metadata_json,created_at_utc) VALUES (?,?,?,?,?,?,?)")
        .bind(`log_${crypto.randomUUID()}`, (await this.state()).stationId, eventType, message, crypto.randomUUID(), JSON.stringify(metadata), new Date().toISOString()).run();
    } catch {}
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ connectedAtUtc: new Date().toISOString() });
      const current = await this.state();
      current.listenerCount = this.ctx.getWebSockets().length;
      await this.ctx.storage.put("state", current);
      server.send(JSON.stringify({ type: "station-state", state: current, serverNowUtc: new Date().toISOString() }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/state") return Response.json(await this.state());
    if (url.pathname === "/transition" && request.method === "POST") {
      const { action, payload } = await request.json();
      const current = await this.state();
      const next = applyTransition(current, action, payload);
      await this.store(next);
      await this.schedule(next);
      return Response.json(next);
    }
    return new Response("Not found", { status: 404 });
  }

  async alarm() {
    const current = await this.state();
    const due = current.nextTransitionAtUtc && Date.parse(current.nextTransitionAtUtc) <= Date.now();
    if (!due) return;

    let next;
    if (current.source === "QUICK_BROADCAST" && current.mode === "MANUAL") {
      const queue = Array.isArray(current.quickQueue) ? current.quickQueue : [];
      const index = Number(current.quickQueueIndex || 0) + 1;
      if (index < queue.length) {
        next = applyTransition(current, "quick-next", { index, item: queue[index] });
        await this.log("EASY_BROADCAST_TRACK", `Easy Broadcast advanced to ${queue[index].title}.`, { quickBroadcastId: current.quickBroadcastId, queueIndex: index, assetId: queue[index].id });
      } else {
        next = applyTransition(current, "quick-complete", {});
        await this.log("EASY_BROADCAST_COMPLETE", "Easy Broadcast finished its selected file queue.", { quickBroadcastId: current.quickBroadcastId, itemCount: queue.length });
      }
    } else if (current.mode === "LIVE") {
      next = applyTransition(current, "fallback", {});
      await this.log("LIVE_FAILURE", "Live broadcaster heartbeat expired; fallback started.");
    } else {
      return;
    }
    await this.store(next);
    await this.schedule(next);
  }

  async webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch {}
    const current = await this.state();
    current.listenerCount = Math.max(0, this.ctx.getWebSockets().length);
    await this.ctx.storage.put("state", current);
  }
}
