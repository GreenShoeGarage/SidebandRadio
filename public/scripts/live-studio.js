import { get, post } from "./api.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let stream, context, analyser, peer, liveSessionId, meterFrame, heartbeat;

function broadcastState(value) {
  if (value) dispatchEvent(new CustomEvent("sideband-studio-state", { detail: value }));
}

function startHeartbeat() {
  clearInterval(heartbeat);
  heartbeat = setInterval(async () => {
    try {
      const result = await post("/api/admin/live/heartbeat", { liveSessionId });
      broadcastState(result.state || result);
    } catch {}
  }, 7000);
}

function sessionDescription(description) {
  return { type: description?.type || "", sdp: description?.sdp || "" };
}

function installControls() {
  const row = document.querySelector(".live-controls");
  if (!row || $("micChannels")) return;
  const channels = document.createElement("select");
  channels.id = "micChannels"; channels.setAttribute("aria-label", "Microphone channels");
  channels.innerHTML = '<option value="1">Mono</option><option value="2">Stereo when supported</option>';
  row.prepend(channels);
}

async function listInputs() {
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "audioinput");
  $("micSelect").innerHTML = devices.length ? devices.map((device, index) => `<option value="${esc(device.deviceId)}">${esc(device.label || `Microphone ${index + 1}`)}</option>`).join("") : "<option>Default microphone</option>";
}

async function stopPreflight() {
  cancelAnimationFrame(meterFrame);
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  await context?.close().catch(() => {}); context = null;
  $("micMeter").style.width = "0";
}

async function preflight() {
  await stopPreflight();
  const constraints = { audio: {
    deviceId: $("micSelect").value ? { exact: $("micSelect").value } : undefined,
    channelCount: { ideal: Number($("micChannels").value) }, echoCancellation: true, noiseSuppression: true,
  }, video: false };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  context = new AudioContext(); await context.resume();
  const source = context.createMediaStreamSource(stream); analyser = context.createAnalyser();
  analyser.fftSize = 256; source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const draw = () => { analyser.getByteTimeDomainData(data); let sum = 0; for (const value of data) sum += ((value - 128) / 128) ** 2; $("micMeter").style.width = `${Math.min(100, Math.sqrt(sum / data.length) * 180)}%`; meterFrame = requestAnimationFrame(draw); };
  draw(); await listInputs(); $("takeLive").disabled = Boolean(liveSessionId); $("liveExplanation").textContent = liveSessionId ? "A live microphone is already on air. End that session before taking another microphone live." : "Microphone preflight is active and locally muted. Confirm Take Live to publish the microphone track.";
}

async function takeLive() {
  const microphoneTrack = stream?.getAudioTracks()[0];
  if (!microphoneTrack) return;
  if (!confirm("Put this microphone on the public station now? Scheduled audio will stop and the live session will be logged.")) return;
  try {
    peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], bundlePolicy: "max-bundle" });
    peer.addTrack(microphoneTrack, stream);
    const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
    const result = await post("/api/admin/live/session", { sessionDescription: sessionDescription(offer), resumeRule: "schedule", clientTrackMode: "raw-microphone" });
    if (!result.sessionDescription) throw new Error("Realtime did not return a WebRTC answer.");
    await peer.setRemoteDescription(result.sessionDescription); liveSessionId = result.liveSessionId;
    broadcastState(result.state);
  } catch (error) {
    peer?.close(); peer = null;
    throw error;
  }
  $("takeLive").disabled = true; $("endLive").disabled = false; $("liveConfigBadge").textContent = "ON AIR"; $("liveExplanation").textContent = "YOUR MICROPHONE IS LIVE. Public listeners and embedded widgets can hear this broadcast now.";
  startHeartbeat();
  peer.addEventListener("connectionstatechange", () => { if (["failed", "closed"].includes(peer.connectionState)) $("liveExplanation").textContent = "Live connection failed. The station will move to fallback when the grace period expires."; });
}

function liveErrorMessage(error) {
  const provider = error?.detail?.details?.provider;
  if (!provider) return `Take Live failed: ${error.message}`;
  const status = provider.httpStatus ? `, HTTP ${provider.httpStatus}` : "";
  const code = provider.errorCode ? `, ${provider.errorCode}` : "";
  return `Take Live failed at ${provider.stage || "Cloudflare Realtime"}${status}${code}: ${error.message}. Export diagnostics for the privacy-safe handshake report.`;
}

async function endLive() {
  if (!confirm("End the live microphone now and start the configured resume or fallback behavior?")) return;
  clearInterval(heartbeat); const result = await post("/api/admin/live/end", { liveSessionId }); broadcastState(result.state || result); peer?.close(); peer = null; liveSessionId = null;
  $("takeLive").disabled = false; $("endLive").disabled = true; $("liveConfigBadge").textContent = "READY"; $("liveExplanation").textContent = "Live session ended. Microphone preflight remains local and muted.";
}

async function initialize() {
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) return;
  try {
    const data = await get("/api/admin/bootstrap");
    if (!data.capabilities?.realtime) return;
    installControls(); $("micSelect").disabled = false; $("micPreflight").disabled = false; $("liveConfigBadge").textContent = "READY"; $("liveConfigBadge").classList.remove("warning");
    $("micSelect").innerHTML = "<option value=''>Default microphone</option>";
    if (data.onAir?.mode === "LIVE") {
      liveSessionId = data.onAir.liveSessionId;
      $("takeLive").disabled = true;
      $("endLive").disabled = false;
      $("liveConfigBadge").textContent = "ON AIR";
      broadcastState(data.onAir);
    }
  } catch {}
}

$("micPreflight")?.addEventListener("click", () => preflight().catch(error => { $("liveExplanation").textContent = `Microphone preflight failed: ${error.message}`; }));
$("takeLive")?.addEventListener("click", () => takeLive().catch(error => { $("liveExplanation").textContent = liveErrorMessage(error); }));
$("endLive")?.addEventListener("click", () => endLive().catch(error => { $("liveExplanation").textContent = `End Live failed: ${error.message}`; }));
addEventListener("pagehide", () => { clearInterval(heartbeat); peer?.close(); stopPreflight(); });
initialize();
