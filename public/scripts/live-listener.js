import { get, post } from "./api.js";

const $ = id => document.getElementById(id);
let intent = false, peer = null, activeLiveId = null, checking = false;

async function waitForIce(pc) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise(resolve => {
    const done = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", done); resolve(); } };
    pc.addEventListener("icegatheringstatechange", done); setTimeout(resolve, 4000);
  });
}

async function subscribe(state) {
  if (!intent || activeLiveId === state.liveSessionId || checking) return;
  checking = true; peer?.close(); peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
  const audio = $("stationAudio"); peer.addTransceiver("audio", { direction: "recvonly" });
  peer.ontrack = async event => { audio.srcObject = event.streams[0] || new MediaStream([event.track]); await audio.play(); $("playerMessage").textContent = "Playing the live microphone through Cloudflare Realtime."; };
  const offer = await peer.createOffer(); await peer.setLocalDescription(offer); await waitForIce(peer);
  const result = await post("/api/public/live/subscribe", { sessionDescription: peer.localDescription });
  if (!result.sessionDescription) throw new Error("Realtime did not return a listener answer.");
  await peer.setRemoteDescription(result.sessionDescription); activeLiveId = state.liveSessionId; checking = false;
}

async function check() {
  try {
    const snapshot = await get("/api/public/state"), state = snapshot.state || snapshot;
    if (state.mode === "LIVE") await subscribe(state);
    else if (activeLiveId) { peer?.close(); peer = null; activeLiveId = null; $("stationAudio").srcObject = null; }
  } catch (error) { checking = false; if (intent && $("playerMessage")) $("playerMessage").textContent = `Live audio reconnecting: ${error.message}`; }
}

$("listenButton")?.addEventListener("click", () => { intent = true; setTimeout(check, 0); });
$("returnLiveButton")?.addEventListener("click", () => { intent = true; check(); });
addEventListener("sideband-state", event => { if (event.detail?.mode === "LIVE") subscribe(event.detail).catch(() => {}); });
setInterval(check, 6000); check();
