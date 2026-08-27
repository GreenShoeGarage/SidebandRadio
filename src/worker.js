import core, { handleRequest as handleCore } from "./worker-core.js";
import { requireOperator, enforceOrigin } from "./auth.js";
import { correlationId, errorResponse, HttpError, json } from "./errors.js";
import { readState, transition } from "./station-state.js";
import { STATION_ID, cleanText, opaque, readJson } from "./validation.js";

export { StationStateDurableObject } from "./station-durable-object.js";

async function realtimeRequest(env, path, { method = "POST", body } = {}) {
  if (!env.REALTIME_APP_ID || !env.REALTIME_API_TOKEN) {
    throw new HttpError(503, "REALTIME_NOT_CONFIGURED", "Cloudflare Realtime is not configured. Scheduled broadcasting remains available.", "Set REALTIME_APP_ID and REALTIME_API_TOKEN as Worker secrets.");
  }
  const response = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(env.REALTIME_APP_ID)}${path}`, {
    method,
    headers: { authorization: `Bearer ${env.REALTIME_API_TOKEN}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    throw new HttpError(502, "REALTIME_REQUEST_FAILED", payload.errorDescription || payload.message || "Cloudflare Realtime rejected the session request.", "Check the Realtime application identifier, secret, and current Connection API requirements.");
  }
  return payload;
}

async function stationLog(env, type, message, operatorId, metadata, requestId) {
  if (!env.DB) return;
  await env.DB.prepare("INSERT INTO station_logs (id,station_id,event_type,message,operator_id,correlation_id,metadata_json,created_at_utc) VALUES (?,?,?,?,?,?,?,?)")
    .bind(opaque("log"), STATION_ID, type, message, operatorId, requestId, JSON.stringify(metadata), new Date().toISOString()).run();
}

async function publishLive(request, env, operator, requestId) {
  const body = await readJson(request, 524288);
  const description = body.sessionDescription;
  if (!description?.sdp || description.type !== "offer") throw new HttpError(400, "WEBRTC_OFFER_REQUIRED", "A valid Web Real-Time Communication (WebRTC) offer is required.");
  const created = await realtimeRequest(env, "/sessions/new", { body: {} });
  if (!created.sessionId) throw new HttpError(502, "REALTIME_SESSION_INVALID", "Cloudflare Realtime did not return a session identifier.");
  const trackName = `sideband-live-${crypto.randomUUID()}`;
  const result = await realtimeRequest(env, `/sessions/${encodeURIComponent(created.sessionId)}/tracks/new`, { body: {
    sessionDescription: description,
    tracks: [{ location: "local", trackName, kind: "audio" }],
  } });
  const liveSessionId = opaque("live");
  const stamp = new Date().toISOString();
  if (env.DB) {
    await env.DB.prepare("INSERT INTO live_sessions (id,station_id,operator_id,status,provider_session_id,started_at_utc,resume_rule,created_at_utc,updated_at_utc) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(liveSessionId, STATION_ID, operator.id, "LIVE", created.sessionId, stamp, cleanText(body.resumeRule || "schedule", { max: 30 }), stamp, stamp).run();
  }
  const liveSource = { providerSessionId: created.sessionId, trackName: result.tracks?.[0]?.trackName || trackName };
  const state = await transition(env, "live", { liveSessionId, liveSource, nextTransitionAtUtc: new Date(Date.now() + 20000).toISOString() });
  await stationLog(env, "LIVE_SESSION", "Live microphone placed on air.", operator.id, { liveSessionId }, requestId);
  return json({ liveSessionId, sessionDescription: result.sessionDescription, trackName: liveSource.trackName, state }, 201);
}

async function subscribeLive(request, env) {
  const current = await readState(env);
  if (current.mode !== "LIVE" || !current.liveSource) throw new HttpError(409, "LIVE_SOURCE_UNAVAILABLE", "The station is not carrying a live microphone source.");
  const body = await readJson(request, 524288);
  if (!body.sessionDescription?.sdp) throw new HttpError(400, "WEBRTC_OFFER_REQUIRED", "A listener WebRTC offer is required.");
  const created = await realtimeRequest(env, "/sessions/new", { body: {} });
  const result = await realtimeRequest(env, `/sessions/${encodeURIComponent(created.sessionId)}/tracks/new`, { body: {
    sessionDescription: body.sessionDescription,
    tracks: [{ location: "remote", sessionId: current.liveSource.providerSessionId, trackName: current.liveSource.trackName }],
  } });
  return json({ sessionId: created.sessionId, sessionDescription: result.sessionDescription, tracks: result.tracks || [], serverNowUtc: new Date().toISOString() }, 201);
}

async function endLive(env, operator, requestId) {
  const current = await readState(env);
  if (current.mode !== "LIVE") throw new HttpError(409, "NOT_LIVE", "The station is not currently in live microphone mode.");
  if (current.liveSource) {
    try {
      await realtimeRequest(env, `/sessions/${encodeURIComponent(current.liveSource.providerSessionId)}/tracks/close`, { method: "PUT", body: { tracks: [{ location: "local", trackName: current.liveSource.trackName }] } });
    } catch {}
  }
  const next = await transition(env, "fallback", {});
  const stamp = new Date().toISOString();
  if (env.DB) await env.DB.prepare("UPDATE live_sessions SET status='ENDED',ended_at_utc=?,updated_at_utc=? WHERE id=? AND station_id=?").bind(stamp, stamp, current.liveSessionId, STATION_ID).run();
  await stationLog(env, "LIVE_SESSION", "Live microphone ended; configured fallback started.", operator.id, { liveSessionId: current.liveSessionId }, requestId);
  return json({ state: next });
}

function withSecurity(response, requestId) {
  const headers = new Headers(response.headers);
  headers.set("x-correlation-id", requestId);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function draftRevision(env, playlistId, operatorId) {
  const playlist = await env.DB.prepare("SELECT * FROM playlists WHERE id=? AND station_id=? AND archived_at_utc IS NULL").bind(playlistId, STATION_ID).first();
  if (!playlist) throw new HttpError(404, "PLAYLIST_NOT_FOUND", "That playlist was not found.");
  let revision = await env.DB.prepare("SELECT * FROM playlist_revisions WHERE playlist_id=? ORDER BY revision DESC LIMIT 1").bind(playlistId).first();
  if (!revision || revision.state === "PUBLISHED") {
    const stamp = new Date().toISOString(), id = opaque("plr"), number = Number(revision?.revision || 0) + 1;
    const statements = [env.DB.prepare("INSERT INTO playlist_revisions (id,playlist_id,revision,state,total_duration_seconds,created_by_operator_id,created_at_utc,updated_at_utc) VALUES (?,?,?,?,?,?,?,?)").bind(id, playlistId, number, "DRAFT", revision?.total_duration_seconds || 0, operatorId, stamp, stamp)];
    if (revision) {
      const prior = await env.DB.prepare("SELECT * FROM playlist_items WHERE revision_id=? AND archived_at_utc IS NULL ORDER BY position").bind(revision.id).all();
      for (const item of prior.results || []) statements.push(env.DB.prepare("INSERT INTO playlist_items (id,revision_id,asset_id,position,item_type,rotation_pool_json,segue_type,segue_seconds,notes,created_at_utc,updated_at_utc) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(opaque("pli"), id, item.asset_id, item.position, item.item_type, item.rotation_pool_json, item.segue_type, item.segue_seconds, item.notes, stamp, stamp));
    }
    await env.DB.batch(statements); revision = { id, revision: number, state: "DRAFT" };
  }
  return revision;
}

async function playlistItemsRoute(request, env, operator, requestId, playlistId, itemId) {
  if (!env.DB) throw new HttpError(503, "D1_UNAVAILABLE", "Playlist storage is unavailable.");
  const revision = await draftRevision(env, playlistId, operator.id);
  if (request.method === "GET") {
    const result = await env.DB.prepare("SELECT pi.id,pi.position,pi.segue_type,pi.segue_seconds,a.id asset_id,a.title,a.artist,a.duration_seconds,a.mime_type FROM playlist_items pi LEFT JOIN audio_assets a ON a.id=pi.asset_id WHERE pi.revision_id=? AND pi.archived_at_utc IS NULL ORDER BY pi.position").bind(revision.id).all();
    return json({ revisionId: revision.id, revision: revision.revision, items: result.results || [] });
  }
  if (request.method === "POST" && !itemId) {
    const body = await readJson(request), asset = await env.DB.prepare("SELECT * FROM audio_assets WHERE id=? AND station_id=? AND archived_at_utc IS NULL").bind(cleanText(body.assetId, { required: true, max: 100 }), STATION_ID).first();
    if (!asset) throw new HttpError(404, "ASSET_NOT_FOUND", "That audio asset was not found.");
    const position = Number((await env.DB.prepare("SELECT COALESCE(MAX(position),-1)+1 position FROM playlist_items WHERE revision_id=? AND archived_at_utc IS NULL").bind(revision.id).first()).position), stamp = new Date().toISOString(), id = opaque("pli");
    await env.DB.batch([env.DB.prepare("INSERT INTO playlist_items (id,revision_id,asset_id,position,item_type,segue_type,segue_seconds,created_at_utc,updated_at_utc) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, revision.id, asset.id, position, "FIXED", cleanText(body.segueType || "hard", { max: 20 }), Number(body.segueSeconds || 0), stamp, stamp), env.DB.prepare("UPDATE playlist_revisions SET total_duration_seconds=(SELECT COALESCE(SUM(a.duration_seconds),0) FROM playlist_items pi JOIN audio_assets a ON a.id=pi.asset_id WHERE pi.revision_id=? AND pi.archived_at_utc IS NULL),updated_at_utc=? WHERE id=?").bind(revision.id, stamp, revision.id)]);
    await stationLog(env, "PLAYLIST_UPDATE", `Added ${asset.title} to playlist.`, operator.id, { playlistId, assetId: asset.id }, requestId);
    return json({ itemId: id, revision: revision.revision }, 201);
  }
  if (request.method === "DELETE" && itemId) {
    const stamp = new Date().toISOString();
    await env.DB.prepare("UPDATE playlist_items SET archived_at_utc=?,updated_at_utc=? WHERE id=? AND revision_id=?").bind(stamp, stamp, itemId, revision.id).run();
    return new Response(null, { status: 204 });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "That playlist-item operation is not supported.");
}

async function normalizeSchedulePublish(request, env) {
  const body = await readJson(request, 1048576);
  for (const occurrence of body.occurrences || []) {
    if (!occurrence.playlistRevisionId && occurrence.playlistId && env.DB) {
      const row = await env.DB.prepare("SELECT id FROM playlist_revisions WHERE playlist_id=? ORDER BY revision DESC LIMIT 1").bind(occurrence.playlistId).first();
      occurrence.playlistRevisionId = row?.id || null;
    }
  }
  return new Request(request.url, { method: request.method, headers: request.headers, body: JSON.stringify(body) });
}

async function clocksRoute(request, env, operator, requestId) {
  if (!env.DB) throw new HttpError(503, "D1_UNAVAILABLE", "Program-clock storage is unavailable.");
  if (request.method === "GET") {
    const result = await env.DB.prepare("SELECT * FROM program_clocks WHERE station_id=? AND archived_at_utc IS NULL ORDER BY updated_at_utc DESC").bind(STATION_ID).all();
    return json({ items: result.results || [] });
  }
  if (request.method === "POST") {
    const body = await readJson(request), id = opaque("clk"), stamp = new Date().toISOString(), name = cleanText(body.name, { required: true, max: 120 });
    const statements = [env.DB.prepare("INSERT INTO program_clocks (id,station_id,name,description,duration_seconds,schema_version,created_at_utc,updated_at_utc) VALUES (?,?,?,?,?,?,?,?)").bind(id, STATION_ID, name, cleanText(body.description || "", { max: 500 }), Number(body.durationSeconds || 3600), 1, stamp, stamp)];
    const defaults = [["MUSIC", 0], ["IDENTIFICATION", 900], ["MUSIC", 930], ["ANNOUNCEMENT", 2700]];
    defaults.forEach(([type, offset], position) => statements.push(env.DB.prepare("INSERT INTO clock_slots (id,clock_id,position,slot_type,duration_seconds,created_at_utc,updated_at_utc) VALUES (?,?,?,?,?,?,?)").bind(opaque("cls"), id, position, type, position % 2 ? 30 : offset === 0 ? 900 : 1770, stamp, stamp)));
    await env.DB.batch(statements); await stationLog(env, "CLOCK_CREATE", `Program clock created: ${name}`, operator.id, { clockId: id }, requestId);
    return json({ clock: { id, name, durationSeconds: Number(body.durationSeconds || 3600), slotCount: defaults.length } }, 201);
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "That program-clock operation is not supported.");
}

async function cartsRoute(request, env, operator, requestId, fire = false) {
  if (!env.DB) throw new HttpError(503, "D1_UNAVAILABLE", "Cart assignments are unavailable.");
  if (request.method === "GET") {
    const result = await env.DB.prepare("SELECT c.*,a.title,a.artist,a.duration_seconds,a.mime_type FROM cart_assignments c LEFT JOIN audio_assets a ON a.id=c.asset_id WHERE c.station_id=? AND c.archived_at_utc IS NULL ORDER BY c.slot").bind(STATION_ID).all();
    return json({ items: (result.results || []).map(x => ({ slot: x.slot, label: x.label, assetId: x.asset_id, color: x.color, hotkey: x.hotkey, requiresConfirmation: Boolean(x.requires_confirmation), asset: x.asset_id ? { id: x.asset_id, title: x.title, artist: x.artist, durationSeconds: x.duration_seconds, mimeType: x.mime_type, mediaUrl: `/media/${x.asset_id}` } : null })) });
  }
  const body = await readJson(request), slot = Number(body.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 8) throw new HttpError(400, "CART_SLOT_INVALID", "Cart slot must be between 1 and 8.");
  if (fire && request.method === "POST") {
    const row = await env.DB.prepare("SELECT c.*,a.title,a.artist,a.duration_seconds,a.mime_type FROM cart_assignments c LEFT JOIN audio_assets a ON a.id=c.asset_id WHERE c.station_id=? AND c.slot=? AND c.archived_at_utc IS NULL").bind(STATION_ID, slot).first();
    if (!row?.asset_id) throw new HttpError(409, "CART_UNASSIGNED", "This cart has no audio asset assigned.", "Configure the cart in the Cart Wall before firing it on air.");
    const item = { id: row.asset_id, title: row.title, artist: row.artist, durationSeconds: row.duration_seconds, mimeType: row.mime_type, mediaUrl: `/media/${row.asset_id}` };
    const state = await transition(env, "skip", { item }); await stationLog(env, "CART_FIRE", `On-air cart ${slot}: ${row.label}`, operator.id, { slot, assetId: row.asset_id, note: cleanText(body.note || "", { max: 500 }) }, requestId);
    return json({ state });
  }
  if (request.method === "PATCH") {
    const stamp = new Date().toISOString(), label = cleanText(body.label || `CART ${slot}`, { max: 80 }), assetId = body.assetId ? cleanText(body.assetId, { max: 100 }) : null;
    if (assetId && !(await env.DB.prepare("SELECT id FROM audio_assets WHERE id=? AND station_id=? AND archived_at_utc IS NULL").bind(assetId, STATION_ID).first())) throw new HttpError(404, "ASSET_NOT_FOUND", "The selected cart audio asset was not found.");
    await env.DB.prepare("INSERT INTO cart_assignments (id,station_id,slot,label,asset_id,color,hotkey,requires_confirmation,created_at_utc,updated_at_utc) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(station_id,slot) DO UPDATE SET label=excluded.label,asset_id=excluded.asset_id,color=excluded.color,hotkey=excluded.hotkey,requires_confirmation=excluded.requires_confirmation,updated_at_utc=excluded.updated_at_utc,archived_at_utc=NULL").bind(opaque("cart"), STATION_ID, slot, label, assetId, cleanText(body.color || "#496042", { max: 20 }), String(slot), body.requiresConfirmation === false ? 0 : 1, stamp, stamp).run();
    await stationLog(env, "CART_CONFIG", `Cart ${slot} configured.`, operator.id, { slot, assetId }, requestId); return json({ ok: true });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "That cart operation is not supported.");
}

async function importCommit(request, env, operator, requestId) {
  if (!env.DB || !env.BUCKET) throw new HttpError(503, "IMPORT_RECOVERY_UNAVAILABLE", "Import commit requires both D1 and R2 so SIDEBAND can create a recovery checkpoint first.");
  const body = await readJson(request, 1048576);
  if (body.confirmation !== "IMPORT") throw new HttpError(400, "IMPORT_CONFIRMATION_REQUIRED", "Type IMPORT to commit a validated configuration backup.");
  const backup = body.backup;
  if (backup?.format !== "sideband-backup" || !String(backup.version || "").startsWith("1.")) throw new HttpError(409, "BACKUP_VERSION_INCOMPATIBLE", "Only compatible SIDEBAND 1.x backups can be committed.");
  const currentStation = await env.DB.prepare("SELECT s.*,ss.history_visible,ss.sync_tolerance_seconds,ss.default_transition,ss.rights_notice FROM stations s LEFT JOIN station_settings ss ON ss.station_id=s.id WHERE s.id=?").bind(STATION_ID).first();
  const checkpointKey = `stations/${STATION_ID}/recovery/${new Date().toISOString().replaceAll(":", "-")}-${opaque("checkpoint")}.json`;
  await env.BUCKET.put(checkpointKey, JSON.stringify({ format: "sideband-recovery-checkpoint", version: "1.0", createdAtUtc: new Date().toISOString(), station: currentStation }), { httpMetadata: { contentType: "application/json" } });
  const station = backup.station || {}, stamp = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE stations SET name=?,call_sign=?,description=?,time_zone=?,public_url=?,accent_color=?,updated_at_utc=? WHERE id=?").bind(cleanText(station.name || "SIDEBAND Radio", { required: true, max: 100 }), cleanText(station.callSign || "SIDEBAND", { required: true, max: 16 }), cleanText(station.description || "", { max: 500 }), cleanText(station.timeZone || "UTC", { required: true, max: 80 }), cleanText(station.publicUrl || "", { max: 300 }), cleanText(station.accentColor || "#8fc46f", { max: 20 }), stamp, STATION_ID),
    env.DB.prepare("UPDATE station_settings SET sync_tolerance_seconds=?,default_transition=?,history_visible=?,rights_notice=?,updated_at_utc=? WHERE station_id=?").bind(Number(station.syncToleranceSeconds || 3), cleanText(station.defaultTransition || "hard", { max: 20 }), station.historyVisible === false ? 0 : 1, cleanText(station.rightsNotice || "", { max: 1000 }), stamp, STATION_ID),
  ]);
  await stationLog(env, "IMPORT_COMMIT", "Validated station configuration imported after recovery checkpoint.", operator.id, { checkpointKey, sourceVersion: backup.version }, requestId);
  return json({ committed: true, checkpointKey, summary: { stationSettingsUpdated: true, mediaChanged: false, publishedScheduleChanged: false } });
}

export async function handleRequest(request, env = {}, ctx = { waitUntil() {} }) {
  const url = new URL(request.url);
  const requestId = correlationId(request);
  if (url.pathname.endsWith("/publish") && url.pathname.startsWith("/api/admin/schedules/") && request.method === "POST") return handleCore(await normalizeSchedulePublish(request, env), env, ctx);
  const itemMatch = url.pathname.match(/^\/api\/admin\/playlists\/([^/]+)\/items(?:\/([^/]+))?$/);
  if (itemMatch) {
    try {
      const operator = await requireOperator(request, env); enforceOrigin(request, env);
      return withSecurity(await playlistItemsRoute(request, env, operator, requestId, itemMatch[1], itemMatch[2]), requestId);
    } catch (error) { return withSecurity(errorResponse(error, requestId), requestId); }
  }
  if (url.pathname === "/api/admin/clocks") {
    try { const operator = await requireOperator(request, env); enforceOrigin(request, env); return withSecurity(await clocksRoute(request, env, operator, requestId), requestId); }
    catch (error) { return withSecurity(errorResponse(error, requestId), requestId); }
  }
  if (url.pathname === "/api/admin/carts" || url.pathname === "/api/admin/carts/fire") {
    try { const operator = await requireOperator(request, env); enforceOrigin(request, env); return withSecurity(await cartsRoute(request, env, operator, requestId, url.pathname.endsWith("/fire")), requestId); }
    catch (error) { return withSecurity(errorResponse(error, requestId), requestId); }
  }
  if (url.pathname === "/api/admin/import/commit" && request.method === "POST") {
    try { const operator = await requireOperator(request, env); enforceOrigin(request, env); return withSecurity(await importCommit(request, env, operator, requestId), requestId); }
    catch (error) { return withSecurity(errorResponse(error, requestId), requestId); }
  }
  if (!url.pathname.startsWith("/api/admin/live/") && url.pathname !== "/api/public/live/subscribe") return handleCore(request, env, ctx);
  try {
    if (url.pathname === "/api/public/live/subscribe" && request.method === "POST") return withSecurity(await subscribeLive(request, env), requestId);
    const operator = await requireOperator(request, env);
    enforceOrigin(request, env);
    if (url.pathname === "/api/admin/live/session" && request.method === "POST") return withSecurity(await publishLive(request, env, operator, requestId), requestId);
    if (url.pathname === "/api/admin/live/heartbeat" && request.method === "POST") {
      const body = await readJson(request);
      const state = await transition(env, "live-heartbeat", { liveSessionId: cleanText(body.liveSessionId, { required: true, max: 100 }), nextTransitionAtUtc: new Date(Date.now() + 20000).toISOString() });
      return withSecurity(json({ state }), requestId);
    }
    if (url.pathname === "/api/admin/live/end" && request.method === "POST") return withSecurity(await endLive(env, operator, requestId), requestId);
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "That live-audio request method is not supported.");
  } catch (error) {
    return withSecurity(errorResponse(error, requestId), requestId);
  }
}

async function scheduled(_controller, env) {
  const current = await readState(env);
  if (current.mode === "LIVE" && current.nextTransitionAtUtc && Date.parse(current.nextTransitionAtUtc) <= Date.now()) {
    const next = await transition(env, "fallback", {});
    await stationLog(env, "LIVE_FAILURE", "Live broadcaster heartbeat expired; fallback started.", null, { revision: next.revision }, crypto.randomUUID());
  }
}

const worker = { ...core, fetch: handleRequest, scheduled };

export default worker;
