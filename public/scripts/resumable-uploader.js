import { api, post } from "./api.js";

const $ = id => document.getElementById(id), jobs = new Map();
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function mediaDuration(file) { return new Promise(resolve => { const audio = new Audio(), url = URL.createObjectURL(file), done = () => { const duration = Number.isFinite(audio.duration) ? audio.duration : null; URL.revokeObjectURL(url); resolve(duration); }; audio.onloadedmetadata = done; audio.onerror = done; audio.src = url; }); }
function waitForResume(job) { return new Promise(resolve => { job.resume = resolve; }); }

async function upload(file) {
  const key = crypto.randomUUID(), row = document.createElement("div"); row.className = "upload-item";
  row.innerHTML = `<div><strong>${esc(file.name)}</strong><br><small>${(file.size / 1048576).toFixed(1)} megabytes · inspecting</small></div><progress max="100" value="0"></progress><div><button data-pause class="secondary-button">PAUSE</button><button data-cancel class="secondary-button">CANCEL</button></div>`;
  $("uploadQueue").append(row); const job = { file, row, paused: false, cancelled: false, controller: null, uploadId: null, resume: null }; jobs.set(key, job);
  row.querySelector("[data-pause]").onclick = () => { job.paused = !job.paused; row.querySelector("[data-pause]").textContent = job.paused ? "RESUME" : "PAUSE"; row.querySelector("small").textContent = job.paused ? "Paused safely before retrying the current part" : "Resuming multipart upload"; if (job.paused) job.controller?.abort(); else job.resume?.(); };
  row.querySelector("[data-cancel]").onclick = async () => { job.cancelled = true; job.controller?.abort(); if (job.uploadId) await api(`/api/admin/uploads/${job.uploadId}`, { method: "DELETE" }).catch(() => {}); row.remove(); jobs.delete(key); };
  try {
    const byExtension = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", wav: "audio/wav", webm: "audio/webm" };
    const duration = await mediaDuration(file), start = await post("/api/admin/uploads/start", { filename: file.name, size: file.size, mimeType: file.type || byExtension[file.name.split(".").pop().toLowerCase()] || "application/octet-stream", durationSeconds: duration });
    job.uploadId = start.uploadId; const partSize = start.partSize || 5 * 1024 * 1024, parts = [];
    for (let offset = 0, partNumber = 1; offset < file.size; offset += partSize, partNumber++) {
      if (job.cancelled) return; if (job.paused) await waitForResume(job); if (job.cancelled) return;
      const body = file.slice(offset, Math.min(file.size, offset + partSize)); let uploaded = false;
      while (!uploaded) {
        if (job.paused) await waitForResume(job); if (job.cancelled) return; job.controller = new AbortController();
        try { const part = await api(`/api/admin/uploads/${start.uploadId}/parts/${partNumber}`, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body, signal: job.controller.signal, timeout: 120000 }); parts.push({ partNumber, etag: part.etag }); uploaded = true; }
        catch (error) { if (job.paused || error.code === "TIMEOUT") { if (!job.paused) row.querySelector("small").textContent = "Part timed out · retrying without duplicating it"; continue; } throw error; }
      }
      row.querySelector("progress").value = Math.round(Math.min(file.size, offset + partSize) / file.size * 100); row.querySelector("small").textContent = `Uploaded part ${partNumber} · ${(Math.min(file.size, offset + partSize) / file.size * 100).toFixed(0)}%`;
    }
    await post(`/api/admin/uploads/${start.uploadId}/complete`, { parts, title: file.name.replace(/\.[^.]+$/, "") }); row.querySelector("small").textContent = "Complete · library record created"; row.querySelector("[data-pause]").remove(); row.querySelector("[data-cancel]").textContent = "DISMISS"; row.querySelector("[data-cancel]").onclick = () => row.remove(); $("libraryRefresh").click();
  } catch (error) { if (!job.cancelled) { row.querySelector("small").textContent = `Stopped · ${error.message}`; row.querySelector("[data-pause]").textContent = "RETRY"; row.querySelector("[data-pause]").onclick = () => { row.remove(); upload(file); }; } }
}

$("fileInput")?.addEventListener("change", event => { event.stopImmediatePropagation(); [...event.target.files].forEach(upload); event.target.value = ""; }, true);
$("dropZone")?.addEventListener("drop", event => { event.preventDefault(); event.stopImmediatePropagation(); [...event.dataTransfer.files].forEach(upload); }, true);
