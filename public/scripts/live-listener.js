import { get, post } from "./api.js";
import { cancelPlayback, requestPlayback, wantsPlayback } from "./playback-intent.js";

const $ = id => document.getElementById(id);
let peer = null;
let activeLiveId = null;
let latestState = null;
let checking = false;

function sessionDescription(description) {
  return { type: description?.type || "", sdp: description?.sdp || "" };
}

function playbackChanged(playing) {
  dispatchEvent(new CustomEvent("sideband-live-playback", { detail: { playing } }));
}

function cleanup() {
  peer?.close();
  peer = null;
  activeLiveId = null;
  const audio = $("stationAudio");
  if (audio) audio.srcObject = null;
  document.body.classList.remove("listening-live");
  playbackChanged(false);
}

async function subscribe(state) {
  const audio = $("stationAudio");
  if (!audio || !wantsPlayback() || checking) return;
  if (activeLiveId === state.liveSessionId && audio.srcObject) {
    if (audio.paused) await audio.play();
    document.body.classList.add("listening-live");
    playbackChanged(true);
    return;
  }

  checking = true;
  try {
    peer?.close();
    peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      bundlePolicy: "max-bundle",
    });
    peer.addTransceiver("audio", { direction: "recvonly" });
    peer.ontrack = async event => {
      audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      try {
        await audio.play();
        document.body.classList.add("listening-live");
        $("playerMessage").textContent = "You are listening live to the studio microphone.";
        playbackChanged(true);
      } catch (error) {
        $("playerMessage").textContent = `The live microphone is on air. Choose Listen Live to hear it: ${error.message}`;
        playbackChanged(false);
      }
    };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const result = await post("/api/public/live/subscribe", { sessionDescription: sessionDescription(offer) });
    if (!result.sessionDescription) throw new Error("Realtime did not return a listener answer.");
    await peer.setRemoteDescription(result.sessionDescription);
    activeLiveId = state.liveSessionId;
  } finally {
    checking = false;
  }
}

async function check() {
  try {
    const snapshot = await get("/api/public/state");
    latestState = snapshot.state || snapshot;
    if (latestState.mode === "LIVE") {
      if (wantsPlayback()) await subscribe(latestState);
    } else if (activeLiveId) {
      cleanup();
    }
  } catch (error) {
    checking = false;
    if (wantsPlayback() && $("playerMessage")) $("playerMessage").textContent = `Live audio reconnecting: ${error.message}`;
  }
}

$("listenButton")?.addEventListener("click", async () => {
  if (latestState?.mode !== "LIVE") return;
  const audio = $("stationAudio");
  if (wantsPlayback() && audio?.srcObject && !audio.paused) {
    cancelPlayback();
    audio.pause();
    document.body.classList.remove("listening-live");
    $("playerMessage").textContent = "Live audio paused. The microphone remains on air.";
    playbackChanged(false);
    return;
  }
  requestPlayback();
  $("playerMessage").textContent = "Connecting to the live microphone…";
  try {
    await subscribe(latestState);
  } catch (error) {
    $("playerMessage").textContent = `Live audio reconnecting: ${error.message}`;
  }
});

$("returnLiveButton")?.addEventListener("click", () => {
  requestPlayback();
  check();
});

addEventListener("sideband-state", event => {
  latestState = event.detail;
  if (latestState?.mode === "LIVE") {
    if (wantsPlayback()) subscribe(latestState).catch(() => {});
  } else if (activeLiveId) {
    cleanup();
  }
});

setInterval(check, 6000);
check();
