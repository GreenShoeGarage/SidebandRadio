import { get } from "./api.js";
import { AudioEngine } from "./audio-engine.js";
import { apiUrl } from "./runtime-config.js";
import { cancelPlayback, requestPlayback, wantsPlayback } from "./playback-intent.js";

const $ = id => document.getElementById(id);
const audio = $("stationAudio");
const listen = $("listenButton");
let state = null;
let clockSkew = 0;
let pollTimer = 0;

const engine = audio ? new AudioEngine(audio, (left, right) => {
  $("vuLeft")?.style.setProperty("width", `${Math.min(100, left * 145)}%`);
  $("vuRight")?.style.setProperty("width", `${Math.min(100, right * 145)}%`);
}) : null;

function text(id, value) {
  const node = $(id);
  if (node && value !== undefined && value !== null) node.textContent = value;
}

function fmt(seconds) {
  if (!Number.isFinite(seconds)) return "--:--";
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function fmtClock(seconds) {
  if (!Number.isFinite(seconds)) return "00:00:00";
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function expected() {
  if (!state) return 0;
  const base = Number(state.mediaOffsetSeconds || 0);
  if (state.pausedAtUtc || state.mode === "PAUSED") return base;
  return base + Math.max(0, (Date.now() + clockSkew - Date.parse(state.startedAtUtc || Date.now())) / 1000);
}

function isLive() {
  return state?.mode === "LIVE";
}

function setConnection(label, tone = "amber") {
  const pill = $("connectionPill");
  if (pill) pill.innerHTML = `<span class="lamp lamp-${tone}"></span>${label}`;
  text("footerState", label);
}

function renderStation(station) {
  text("stationName", station.name);
  text("callSign", station.callSign);
  text("stationDescription", station.description);
  text("timezoneLabel", station.timeZone || "UTC");
  if (station.callSign) text("stationArt", station.callSign.slice(0, 2).toUpperCase());
}

function renderState(nextState) {
  state = nextState;
  const item = state.item || {};
  const live = state.mode === "LIVE";
  const quick = state.source === "QUICK_BROADCAST";
  const online = state.mode !== "OFFLINE";
  const liveSeconds = expected();

  document.body.classList.toggle("station-live", live);
  document.body.classList.toggle("station-quick", quick);
  document.body.classList.toggle("station-offline", !online);
  document.title = live ? "● LIVE — SIDEBAND Radio" : quick ? "● ON AIR — SIDEBAND Radio" : "SIDEBAND — Audio Broadcast Workbench";

  const liveBanner = $("liveSignalBanner");
  if (liveBanner) liveBanner.hidden = !live;
  text("liveSignalTitle", live ? "MICROPHONE BROADCAST" : "");
  text("liveElapsed", fmtClock(liveSeconds));

  text("trackTitle", live ? "LIVE MICROPHONE" : item.title || "No programmed audio");
  text("trackCreator", live ? "Broadcasting now from SIDEBAND Studio" : item.artist || item.creator || "The station has not started yet.");
  text("programName", live ? "LIVE BROADCAST" : state.program?.name || "NO PUBLISHED PROGRAM");
  text("programDescription", live ? "You are hearing a live microphone transmission from the station studio." : state.program?.description || "The station is ready for the operator to publish a schedule.");
  text("programHeading", live ? "Live from SIDEBAND Studio" : state.program?.name || "About this program");
  text("hostLine", live ? "Source: Live studio microphone" : `Host: ${state.program?.host || "Station automation"}`);
  text("showNotes", live ? "This program is being transmitted live. Choose Listen Live to hear the current microphone feed." : state.program?.description || "Program notes will appear when the station publishes a schedule.");
  text("duration", live ? "LIVE" : fmt(item.durationSeconds));
  text("elapsed", live ? fmt(liveSeconds) : fmt(expected()));

  const trackArt = $("trackArt");
  if (trackArt && live) trackArt.innerHTML = "<span>LIVE<br>NOW</span>";
  else if (trackArt && item.artworkUrl) trackArt.innerHTML = `<img src="${escapeHtml(apiUrl(item.artworkUrl))}" alt="">`;
  else if (trackArt) trackArt.innerHTML = item.title ? "<span>ON<br>AIR</span>" : "<span>NO<br>AUDIO</span>";

  const badge = $("onAirBadge");
  if (badge) badge.innerHTML = `<span class="lamp lamp-${live ? "red" : online ? "green" : "amber"}"></span><span>${live ? "LIVE MICROPHONE — ON AIR" : quick ? "EASY BROADCAST — ON AIR" : online ? `${state.mode} PROGRAM` : "STATION OFFLINE"}</span>`;
  text("syncLabel", live ? `LIVE · REALTIME AUDIO · REV ${state.revision || 0}` : quick ? `FILE ${state.queuePosition || 1} OF ${state.queueLength || 1} · SYNCHRONIZED` : `REV ${state.revision || 0} · ${online ? "SYNCHRONIZED" : "NO ACTIVE SOURCE"}`);
  setConnection(live ? "ON AIR — LIVE" : online ? "CONNECTED" : "STATION OFFLINE", live ? "red" : online ? "green" : "amber");

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: live ? "LIVE MICROPHONE" : item.title || "SIDEBAND",
      artist: live ? "SIDEBAND live broadcast" : item.artist || item.creator || "Audio Broadcast Workbench",
      album: live ? "LIVE NOW" : state.program?.name || "On air",
      artwork: item.artworkUrl ? [{ src: apiUrl(item.artworkUrl) }] : [],
    });
  }
  updateButton();
}

async function refresh() {
  try {
    const [station, snapshot, schedule] = await Promise.all([
      get("/api/public/station"),
      get("/api/public/state"),
      get("/api/public/schedule?limit=3"),
    ]);
    clockSkew = Date.parse(snapshot.serverNowUtc) - Date.now();
    renderStation(station.station || station);
    renderState(snapshot.state || snapshot);
    const items = schedule.items || [];
    const list = $("upNextList");
    if (list) {
      list.innerHTML = state.source === "QUICK_BROADCAST" ? (state.nextItem ? `<li><span>NEXT</span><div><strong>${escapeHtml(state.nextItem.title)}</strong><small>File ${Number(state.queuePosition || 0) + 1} of ${state.queueLength}</small></div></li>` : '<li class="empty-row"><span>END</span><div><strong>Final selected file</strong><small>The station stops when this file finishes.</small></div></li>') : items.length ? items.map(entry => `<li><span>${new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", timeZone: station.station?.timeZone || "UTC" }).format(new Date(entry.startAtUtc))}</span><div><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.program || entry.artist || "Program item")}</small></div></li>`).join("") : '<li class="empty-row"><span>--:--</span><div><strong>No upcoming items</strong><small>The published schedule is empty.</small></div></li>';
    }
    if (wantsPlayback() && !isLive()) await joinLive();
  } catch (error) {
    setConnection(navigator.onLine ? "RECONNECTING" : "OFFLINE", "amber");
    text("playerMessage", error.message || "The station is temporarily unavailable.");
  } finally {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(refresh, 15000);
  }
}

async function joinLive() {
  if (!engine || !state) return;
  if (isLive()) {
    text("playerMessage", "Connecting to the live microphone…");
    updateButton();
    return;
  }
  const item = state.item;
  if (!item?.mediaUrl) {
    text("playerMessage", wantsPlayback() ? "Listening is armed. SIDEBAND will join the next playable station source automatically." : "The station is not broadcasting a playable item.");
    updateButton();
    return;
  }
  try {
    text("playerMessage", "Loading the active item…");
    if (audio.srcObject) audio.srcObject = null;
    await engine.attach(apiUrl(item.mediaUrl), expected());
    await engine.start();
    requestPlayback();
    text("playerMessage", "Playing live. SIDEBAND will correct meaningful drift automatically.");
    setConnection("PLAYING", "green");
  } catch (error) {
    text("playerMessage", error.message || "The audio could not start.");
    setConnection("UNAVAILABLE", "amber");
  }
  updateButton();
}

function updateButton() {
  if (!listen) return;
  const requested = wantsPlayback();
  const playing = Boolean(audio && !audio.paused && (requested || audio.srcObject));
  listen.setAttribute("aria-pressed", String(playing));
  listen.querySelector(".play-icon").textContent = playing ? "Ⅱ" : isLive() ? "●" : "▶";
  listen.querySelector("strong").textContent = playing ? (isLive() ? "PAUSE LIVE" : "PAUSE") : requested && !state?.item ? "WAITING" : isLive() ? "LISTEN LIVE" : "LISTEN";
  listen.querySelector("small").textContent = isLive() ? "Microphone is on air" : playing ? "Stay behind live" : requested && !state?.item ? "Next source will play" : "Tap to join live";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

listen?.addEventListener("click", async () => {
  if (!audio || isLive()) return;
  if (wantsPlayback() && !state?.item?.mediaUrl) {
    cancelPlayback();
    text("playerMessage", "Stopped waiting for the next station source.");
    updateButton();
    return;
  }
  if (!audio.paused) {
    audio.pause();
    cancelPlayback();
    text("playerMessage", "Paused — you are now behind live.");
    if ($("returnLiveButton")) $("returnLiveButton").disabled = false;
    updateButton();
    return;
  }
  requestPlayback();
  await joinLive();
});

$("returnLiveButton")?.addEventListener("click", async () => {
  if (isLive()) return;
  requestPlayback();
  await joinLive();
  $("returnLiveButton").disabled = true;
});

$("volume")?.addEventListener("input", event => engine?.setVolume(event.target.value));
$("muteButton")?.addEventListener("click", event => {
  audio.muted = !audio.muted;
  event.currentTarget.setAttribute("aria-pressed", String(audio.muted));
  event.currentTarget.textContent = audio.muted ? "MUTED" : "VOL";
});
$("shareButton")?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(location.href);
  text("playerMessage", "Listen link copied.");
});
$("historyButton")?.addEventListener("click", async () => {
  const panel = $("historyPanel");
  panel.hidden = false;
  try {
    const data = await get("/api/public/history");
    const list = $("historyList");
    list.innerHTML = (data.items || []).map(entry => `<li>${escapeHtml(entry.title)} — ${escapeHtml(entry.artist || "")}</li>`).join("") || "<li>No recent history is available.</li>";
  } catch (error) {
    text("playerMessage", error.message);
  }
});
$("closeHistory")?.addEventListener("click", () => { $("historyPanel").hidden = true; });

audio?.addEventListener("timeupdate", () => {
  if (isLive()) return;
  const position = audio.currentTime || 0;
  const duration = audio.duration || state?.item?.durationSeconds || 0;
  text("elapsed", fmt(position));
  $("progressFill")?.style.setProperty("width", duration ? `${Math.min(100, position / duration * 100)}%` : "0");
  const drift = Math.abs(position - expected());
  if (drift > 8 && wantsPlayback()) audio.currentTime = expected();
  else if (drift > 1.5 && wantsPlayback()) audio.playbackRate = position < expected() ? 1.03 : 0.97;
  else audio.playbackRate = 1;
});
audio?.addEventListener("playing", () => {
  if (isLive()) setConnection("LISTENING LIVE", "red");
  updateButton();
});
audio?.addEventListener("pause", () => {
  engine?.stopMeter();
  if (isLive()) setConnection("LIVE — PAUSED", "amber");
  updateButton();
});
audio?.addEventListener("waiting", () => setConnection(isLive() ? "LIVE — BUFFERING" : "BUFFERING", "amber"));
audio?.addEventListener("error", () => {
  setConnection("AUDIO FAILED", "red");
  text("playerMessage", "This audio source failed. SIDEBAND will ask the station for a recovery source.");
});

addEventListener("sideband-state", event => {
  if (!event.detail) return;
  const previousItemId = state?.item?.id;
  renderState(event.detail);
  if (wantsPlayback() && !isLive() && state.item?.id && state.item.id !== previousItemId) joinLive();
});
addEventListener("sideband-live-playback", () => updateButton());

setInterval(() => {
  text("stationClock", new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: state?.timeZone || "UTC" }).format(new Date()));
  if (isLive()) {
    const seconds = expected();
    text("liveElapsed", fmtClock(seconds));
    text("elapsed", fmt(seconds));
    text("duration", "LIVE");
    $("progressFill")?.style.setProperty("width", "100%");
  }
}, 1000);

refresh();
