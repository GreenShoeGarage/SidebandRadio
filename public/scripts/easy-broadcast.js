import { api, get, post } from "./api.js";

const $ = id => document.getElementById(id);
const entries = [];
let busy = false;
let stationState = null;

const mimeByExtension = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function fmt(seconds) {
  if (!Number.isFinite(seconds)) return "duration unavailable";
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function setMode(easy) {
  document.body.classList.toggle("easy-mode", easy);
  document.body.classList.toggle("advanced-mode", !easy);
  const toggle = $("studioModeToggle");
  toggle.setAttribute("aria-pressed", String(!easy));
  toggle.querySelector("strong").textContent = easy ? "EASY MODE" : "ADVANCED MODE";
  toggle.querySelector("small").textContent = easy ? "SELECT FILES → BROADCAST" : "LIBRARY · PLAYLISTS · SCHEDULE";
  localStorage.setItem("sideband-studio-mode", easy ? "easy" : "advanced");
  if (easy && !document.querySelector('[data-panel-id="on-air"]')?.classList.contains("active")) {
    document.querySelector('.nav-button[data-panel="on-air"]')?.click();
  }
}

function durationOf(file) {
  return new Promise(resolve => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const done = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = done;
    audio.onerror = done;
    audio.src = url;
  });
}

function mimeType(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  return mimeByExtension[extension] || file.type || "application/octet-stream";
}

function statusFor(entry, index) {
  if (entry.error) return `ERROR · ${entry.error}`;
  if (entry.status) return entry.status;
  if (stationState?.source === "QUICK_BROADCAST" && entry.assetId) {
    const position = Number(stationState.queuePosition || 0) - 1;
    if (index < position) return "PLAYED";
    if (index === position) return "ON AIR NOW";
    return "QUEUED";
  }
  return entry.duration ? "READY" : "INSPECTING";
}

function render() {
  const active = stationState?.source === "QUICK_BROADCAST";
  const liveMicrophone = stationState?.mode === "LIVE";
  const list = $("easyBroadcastQueue");
  if (!entries.length) {
    list.innerHTML = '<li class="easy-empty">No files selected yet.</li>';
  } else {
    list.innerHTML = entries.map((entry, index) => `<li data-easy-entry="${escapeHtml(entry.id)}"><span class="easy-queue-number">${index + 1}</span><div class="easy-queue-file"><strong>${escapeHtml(entry.file.name)}</strong><small>${(entry.file.size / 1048576).toFixed(1)} MB · ${fmt(entry.duration)}</small><progress max="100" value="${Number(entry.progress || 0)}"></progress></div><span class="easy-queue-state">${escapeHtml(statusFor(entry, index))}</span><button class="easy-remove-file" type="button" data-remove-easy="${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(entry.file.name)}" ${busy || active ? "disabled" : ""}>×</button></li>`).join("");
  }
  document.querySelectorAll("[data-remove-easy]").forEach(button => button.addEventListener("click", () => {
    const index = entries.findIndex(entry => entry.id === button.dataset.removeEasy);
    if (index >= 0 && !busy && !active) entries.splice(index, 1);
    render();
  }));

  $("easyBroadcastPanel").classList.toggle("on-air", active);
  $("easyBroadcastBadge").textContent = active ? "ON AIR" : busy ? "UPLOADING" : entries.some(entry => entry.error) ? "NEEDS ATTENTION" : "READY";
  $("easyClearFiles").disabled = busy || active || !entries.length;
  $("easyFileDrop").disabled = busy || active;
  $("easyBroadcastNow").disabled = busy || active || liveMicrophone || !entries.length || entries.some(entry => !entry.duration);
  $("easyEndBroadcast").hidden = !active;
  $("easyTransport").hidden = !active;
  $("easyPause").disabled = busy || !active || stationState?.mode === "PAUSED";
  $("easyResume").disabled = busy || !active || stationState?.mode !== "PAUSED";
  $("easyRestart").disabled = busy || !active;
  $("easySkip").disabled = busy || !active;
  $("easyBroadcastNow").textContent = active ? `${stationState.mode === "PAUSED" ? "PAUSED" : "BROADCASTING"} · FILE ${stationState.queuePosition || 1} OF ${stationState.queueLength || 1}` : busy ? "UPLOADING AND PREPARING…" : "BROADCAST SELECTED FILES";

  if (active) {
    $("easyBroadcastStatus").textContent = `${stationState.mode === "PAUSED" ? "PAUSED" : "ON AIR NOW"}: ${stationState.item?.title || "Selected audio"} · file ${stationState.queuePosition || 1} of ${stationState.queueLength || 1}.`;
  } else if (liveMicrophone) {
    $("easyBroadcastStatus").textContent = "The microphone is live. End Live before starting prerecorded Easy Broadcast audio.";
  } else if (busy) {
    $("easyBroadcastStatus").textContent = "Uploading selected files. Broadcasting will begin automatically when they are ready.";
  } else if (entries.some(entry => entry.error)) {
    $("easyBroadcastStatus").textContent = entries.some(entry => entry.duration && entry.error) ? "An upload stopped. Press Broadcast again to retry without re-uploading completed files." : "One or more files could not be inspected. Remove or replace the failed file.";
  } else if (entries.length) {
    const total = entries.reduce((sum, entry) => sum + Number(entry.duration || 0), 0);
    $("easyBroadcastStatus").textContent = `${entries.length} file${entries.length === 1 ? "" : "s"} selected · ${fmt(total)} total · ready to broadcast in this order.`;
  } else {
    $("easyBroadcastStatus").textContent = "Choose one or more audio files to begin.";
  }
}

async function addFiles(files) {
  const available = Math.max(0, 100 - entries.length);
  const added = [...files].slice(0, available).map(file => {
    const type = mimeType(file);
    const entry = { id: crypto.randomUUID(), file, duration: null, progress: 0, status: "INSPECTING", error: null, assetId: null };
    entries.push(entry);
    if (!Object.values(mimeByExtension).includes(type)) {
      entry.error = "unsupported audio type";
      entry.status = null;
    } else if (file.size <= 0 || file.size > 512 * 1024 * 1024) {
      entry.error = "file must be between 1 byte and 512 MB";
      entry.status = null;
    }
    return entry;
  });
  render();
  await Promise.all(added.filter(entry => !entry.error).map(async entry => {
    entry.duration = await durationOf(entry.file);
    entry.status = entry.duration ? "READY" : null;
    entry.error = entry.duration ? null : "duration could not be read";
    render();
  }));
}

async function upload(entry) {
  if (entry.assetId) return entry.assetId;
  entry.error = null;
  entry.status = "STARTING UPLOAD";
  entry.progress = 0;
  render();
  const start = await post("/api/admin/uploads/start", {
    filename: entry.file.name,
    size: entry.file.size,
    mimeType: mimeType(entry.file),
    durationSeconds: entry.duration,
  });
  const partSize = start.partSize || 5 * 1024 * 1024;
  const parts = [];
  for (let offset = 0, partNumber = 1; offset < entry.file.size; offset += partSize, partNumber++) {
    const body = entry.file.slice(offset, Math.min(entry.file.size, offset + partSize));
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        entry.status = attempt > 1 ? `RETRYING PART ${partNumber}` : `UPLOADING PART ${partNumber}`;
        render();
        const part = await api(`/api/admin/uploads/${start.uploadId}/parts/${partNumber}`, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body, timeout: 120000 });
        parts.push({ partNumber, etag: part.etag });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    entry.progress = Math.round(Math.min(entry.file.size, offset + partSize) / entry.file.size * 100);
    render();
  }
  entry.status = "FINALIZING";
  render();
  const completed = await post(`/api/admin/uploads/${start.uploadId}/complete`, { parts, title: entry.file.name.replace(/\.[^.]+$/, "") });
  entry.assetId = completed.asset.id;
  entry.status = "READY TO AIR";
  entry.progress = 100;
  render();
  return entry.assetId;
}

async function broadcast() {
  if (busy || !entries.length || stationState?.source === "QUICK_BROADCAST") return;
  busy = true;
  render();
  try {
    const assetIds = [];
    for (const entry of entries) assetIds.push(await upload(entry));
    const result = await post("/api/admin/easy-broadcast/start", { assetIds });
    stationState = result.state || result;
    entries.forEach(entry => { entry.status = null; entry.error = null; });
    dispatchEvent(new CustomEvent("sideband-studio-state", { detail: stationState }));
  } catch (error) {
    const pending = entries.find(entry => !entry.assetId);
    if (pending) { pending.error = error.message; pending.status = null; }
    $("easyBroadcastStatus").textContent = `Broadcast did not start: ${error.message}`;
  } finally {
    busy = false;
    render();
  }
}

async function endBroadcast() {
  if (busy || stationState?.source !== "QUICK_BROADCAST") return;
  busy = true;
  render();
  try {
    const result = await post("/api/admin/easy-broadcast/end", {});
    stationState = result.state || result;
    dispatchEvent(new CustomEvent("sideband-studio-state", { detail: stationState }));
  } catch (error) {
    $("easyBroadcastStatus").textContent = `Could not end broadcast: ${error.message}`;
  } finally {
    busy = false;
    render();
  }
}

async function controlBroadcast(action) {
  if (busy || stationState?.source !== "QUICK_BROADCAST") return;
  busy = true;
  render();
  try {
    const result = await post(`/api/admin/on-air/${action}`, { note: "Easy Broadcast control" });
    stationState = result.state || result;
    dispatchEvent(new CustomEvent("sideband-studio-state", { detail: stationState }));
  } catch (error) {
    $("easyBroadcastStatus").textContent = `${action} failed: ${error.message}`;
  } finally {
    busy = false;
    render();
  }
}

async function refreshState() {
  try {
    const snapshot = await get("/api/public/state");
    stationState = snapshot.state || snapshot;
    render();
  } catch {}
}

$("studioModeToggle")?.addEventListener("click", () => setMode(!document.body.classList.contains("easy-mode")));
$("easyFileDrop")?.addEventListener("click", () => $("easyFileInput").click());
$("easyFileInput")?.addEventListener("change", event => { addFiles(event.target.files); event.target.value = ""; });
for (const type of ["dragenter", "dragover"]) $("easyFileDrop")?.addEventListener(type, event => { event.preventDefault(); $("easyFileDrop").classList.add("dragging"); });
for (const type of ["dragleave", "drop"]) $("easyFileDrop")?.addEventListener(type, event => { event.preventDefault(); $("easyFileDrop").classList.remove("dragging"); });
$("easyFileDrop")?.addEventListener("drop", event => addFiles(event.dataTransfer.files));
$("easyClearFiles")?.addEventListener("click", () => { if (!busy) { entries.length = 0; render(); } });
$("easyBroadcastNow")?.addEventListener("click", broadcast);
$("easyEndBroadcast")?.addEventListener("click", endBroadcast);
$("easyPause")?.addEventListener("click", () => controlBroadcast("pause"));
$("easyResume")?.addEventListener("click", () => controlBroadcast("resume"));
$("easyRestart")?.addEventListener("click", () => controlBroadcast("restart"));
$("easySkip")?.addEventListener("click", () => controlBroadcast("skip"));
addEventListener("sideband-studio-state", event => { stationState = event.detail; render(); });

setMode(localStorage.getItem("sideband-studio-mode") !== "advanced");
setInterval(refreshState, 3000);
refreshState();
render();
