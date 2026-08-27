import { get, post } from "./api.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let stream, context, analyser, gainNode, destination, peer, liveSessionId, meterFrame, heartbeat;

async function waitForIce(pc) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise(resolve => {
    const done = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", done); resolve(); } };
    pc.addEventListener("icegatheringstatechange", done);
    setTimeout(resolve, 4000);
  });
}

function installControls() {
  const row = document.querySelector(".live-controls");
  if (!row || $("micChannels")) return;
  const channels = document.createElement("select");
  channels.id = "micChannels"; channels.setAttribute("aria-label", "Microphone channels");
  channels.innerHTML = '<option value="1">Mono</option><option value="2">Stereo when supported</option>';
  const gain = document.createElement("label"); gain.className = "live-gain";
  gain.innerHTML = 'INPUT GAIN <input id="micGain" type="range" min="0" max="2" step=".05" value="1">';
  row.prepend(channels); row.append(gain);
  $("micGain").addEventListener("input", event => { if (gainNode) gainNode.gain.value = Number(event.target.value); });
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
  const source = context.createMediaStreamSource(stream); gainNode = context.createGain(); analyser = context.createAnalyser(); destination = context.createMediaStreamDestination();
  analyser.fftSize = 256; source.connect(gainNode); gainNode.connect(analyser); gainNode.connect(destination);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const draw = () => { analyser.getByteTimeDomainData(data); let sum = 0; for (const value of data) sum += ((value - 128) / 128) ** 2; $("micMeter").style.width = `${Math.min(100, Math.sqrt(sum / data.length) * 180)}%`; meterFrame = requestAnimationFrame(draw); };
  draw(); await listInputs(); $("takeLive").disabled = false; $("liveExplanation").textContent = "Microphone preflight is active and locally muted. Confirm Take Live to publish the processed audio track.";
}

async function takeLive() {
  if (!destination?.stream.getAudioTracks()[0]) return;
  if (!confirm("Put this microphone on the public station now? Scheduled audio will stop and the live session will be logged.")) return;
  peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
  peer.addTransceiver(destination.stream.getAudioTracks()[0], { direction: "sendonly" });
  const offer = await peer.createOffer(); await peer.setLocalDescription(offer); await waitForIce(peer);
  const result = await post("/api/admin/live/session", { sessionDescription: peer.localDescription, resumeRule: "schedule" });
  if (!result.sessionDescription) throw new Error("Realtime did not return a WebRTC answer.");
  await peer.setRemoteDescription(result.sessionDescription); liveSessionId = result.liveSessionId;
  $("takeLive").disabled = true; $("endLive").disabled = false; $("liveConfigBadge").textContent = "LIVE"; $("liveExplanation").textContent = "The selected microphone is live through Cloudflare Realtime. Local monitoring remains muted.";
  heartbeat = setInterval(() => post("/api/admin/live/heartbeat", { liveSessionId }).catch(() => {}), 7000);
  peer.addEventListener("connectionstatechange", () => { if (["failed", "closed"].includes(peer.connectionState)) $("liveExplanation").textContent = "Live connection failed. The station will move to fallback when the grace period expires."; });
}

async function endLive() {
  if (!confirm("End the live microphone now and start the configured resume or fallback behavior?")) return;
  clearInterval(heartbeat); await post("/api/admin/live/end", { liveSessionId }); peer?.close(); peer = null; liveSessionId = null;
  $("takeLive").disabled = false; $("endLive").disabled = true; $("liveConfigBadge").textContent = "READY"; $("liveExplanation").textContent = "Live session ended. Microphone preflight remains local and muted.";
}

async function initialize() {
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) return;
  try {
    const data = await get("/api/admin/bootstrap");
    if (!data.capabilities?.realtime) return;
    installControls(); $("micSelect").disabled = false; $("micPreflight").disabled = false; $("liveConfigBadge").textContent = "READY"; $("liveConfigBadge").classList.remove("warning");
    $("micSelect").innerHTML = "<option value=''>Default microphone</option>";
  } catch {}
}

$("micPreflight")?.addEventListener("click", () => preflight().catch(error => { $("liveExplanation").textContent = `Microphone preflight failed: ${error.message}`; }));
$("takeLive")?.addEventListener("click", () => takeLive().catch(error => { $("liveExplanation").textContent = `Take Live failed: ${error.message}`; }));
$("endLive")?.addEventListener("click", () => endLive().catch(error => { $("liveExplanation").textContent = `End Live failed: ${error.message}`; }));
addEventListener("pagehide", () => { clearInterval(heartbeat); peer?.close(); stopPreflight(); });
initialize();
