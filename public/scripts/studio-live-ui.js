import { get } from "./api.js";

const $ = id => document.getElementById(id);
let state = null;
let clockSkew = 0;
let wasLive = false;

function text(id, value) {
  const node = $(id);
  if (node && value !== undefined && value !== null) node.textContent = value;
}

function secondsSince(timestamp) {
  const parsed = Date.parse(timestamp || "");
  return Number.isFinite(parsed) ? Math.max(0, (Date.now() + clockSkew - parsed) / 1000) : 0;
}

function fmt(seconds, hours = false) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  const hourValue = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const clock = `${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
  return hours ? `${String(hourValue).padStart(2, "0")}:${clock}` : hourValue ? `${String(hourValue).padStart(2, "0")}:${clock}` : clock;
}

function render(nextState) {
  if (!nextState) return;
  state = nextState;
  const live = state.mode === "LIVE";
  const quick = state.source === "QUICK_BROADCAST";
  const item = state.item || {};
  const mode = state.mode || "OFFLINE";

  document.body.classList.toggle("studio-is-live", live);
  document.body.classList.toggle("studio-is-quick", quick);
  const banner = $("studioLiveBanner");
  const headerStatus = $("headerLiveStatus");
  if (banner) banner.hidden = !live;
  if (headerStatus) {
    headerStatus.hidden = !(live || quick);
    headerStatus.innerHTML = live ? '<span class="lamp lamp-red"></span>MIC LIVE' : '<span class="lamp lamp-green"></span>ON AIR';
  }

  text("navMode", live ? "LIVE" : quick ? "ON AIR" : mode);
  text("modeText", live ? "LIVE ON AIR" : quick ? "ON AIR · EASY" : mode);
  text("onAirTitle", live ? "ON AIR — LIVE MICROPHONE" : quick ? "ON AIR — EASY BROADCAST" : "ON AIR");
  text("listenerCount", `${Number(state.listenerCount || 0)} APPROX. LISTENER${Number(state.listenerCount || 0) === 1 ? "" : "S"}${live ? " · LIVE" : ""}`);

  const lamp = $("modeLamp");
  if (lamp) lamp.className = `lamp lamp-${live ? "red" : mode === "OFFLINE" || mode === "PAUSED" ? "amber" : "green"}`;

  if (live) {
    document.title = "● LIVE — SIDEBAND Studio";
    text("deckSource", "SOURCE MICROPHONE · REALTIME");
    text("deckTitle", "LIVE MICROPHONE");
    text("deckCreator", "BROADCASTING NOW THROUGH CLOUDFLARE REALTIME");
    text("deckRemaining", "LIVE");
    text("nextTitle", "LIVE SESSION ACTIVE");
    text("nextStart", "Automatic fallback protection is armed");
    text("liveConfigBadge", "ON AIR");
    text("liveExplanation", "YOUR MICROPHONE IS LIVE. Public listeners and embedded widgets can hear this broadcast now.");
    $("liveConfigBadge")?.classList.remove("warning");
    if ($("takeLive")) $("takeLive").disabled = true;
    if ($("endLive")) $("endLive").disabled = false;
  } else {
    document.title = quick ? "● ON AIR — SIDEBAND Studio" : "SIDEBAND Station Studio";
    text("deckSource", `SOURCE ${state.source || "—"}`);
    text("deckTitle", item.title || (mode === "OFFLINE" ? "No audio on air" : `${mode} source active`));
    text("deckCreator", item.artist || item.creator || (mode === "OFFLINE" ? "Start the station after publishing a playable program." : "Station automation"));
    if (quick) {
      text("deckSource", "SOURCE EASY BROADCAST");
      text("deckCreator", item.artist || item.creator || `FILE ${state.queuePosition || 1} OF ${state.queueLength || 1}`);
      text("nextTitle", state.nextItem?.title || "END OF SELECTED FILES");
      text("nextStart", state.nextItem ? `Next · file ${Number(state.queuePosition || 0) + 1} of ${state.queueLength}` : "Station stops after this file");
    }
    if (wasLive) {
      text("liveConfigBadge", "READY");
      text("liveExplanation", "Live session ended. Microphone preflight remains local and muted.");
      text("nextTitle", mode === "FALLBACK" ? "EMERGENCY FALLBACK" : "SCHEDULE RESUMED");
      text("nextStart", mode === "FALLBACK" ? "Select a configured fallback source to continue audio" : "Published station programming is active");
    }
  }

  wasLive = live;
  tick();
}

function tick() {
  if (!state) return;
  const live = state.mode === "LIVE";
  const itemSeconds = state.pausedAtUtc || state.mode === "PAUSED" ? Number(state.mediaOffsetSeconds || 0) : secondsSince(state.startedAtUtc) + Number(state.mediaOffsetSeconds || 0);
  const stationSeconds = secondsSince(state.stationStartedAtUtc || state.startedAtUtc);
  text("deckPlayhead", fmt(itemSeconds));
  text("broadcastTimer", fmt(stationSeconds, true));
  if (live) {
    text("studioLiveElapsed", fmt(itemSeconds, true));
    text("deckRemaining", "LIVE");
    const deadline = Date.parse(state.nextTransitionAtUtc || "");
    text("deckTransition", Number.isFinite(deadline) ? `HEARTBEAT · ${Math.max(0, Math.ceil((deadline - Date.now() - clockSkew) / 1000))}s` : "LIVE");
  } else {
    const duration = Number(state.durationSeconds || state.item?.durationSeconds);
    text("deckRemaining", Number.isFinite(duration) ? fmt(Math.max(0, duration - itemSeconds)) : "--:--");
    text("deckTransition", state.nextTransitionAtUtc ? new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(state.nextTransitionAtUtc)) : "—");
  }
}

async function refresh() {
  try {
    const snapshot = await get("/api/public/state");
    if (snapshot.serverNowUtc) clockSkew = Date.parse(snapshot.serverNowUtc) - Date.now();
    render(snapshot.state || snapshot);
  } catch {
    // The existing Studio diagnostics surface reports connectivity failures.
  }
}

addEventListener("sideband-studio-state", event => render(event.detail));
setInterval(tick, 1000);
setInterval(refresh, 3000);
refresh();
