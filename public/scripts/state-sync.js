import { webSocketUrl } from "./runtime-config.js";

const connection = document.getElementById("connectionPill");
let socket, retry = 1000, revision = -1;

function connect() {
  socket = new WebSocket(webSocketUrl());
  socket.onopen = () => { retry = 1000; if (connection) connection.innerHTML = '<span class="lamp lamp-green"></span>LIVE SYNC'; };
  socket.onmessage = event => {
    let message; try { message = JSON.parse(event.data); } catch { return; }
    const state = message.state; if (!state || Number(state.revision) <= revision) return; revision = Number(state.revision);
    const title = document.getElementById("trackTitle"), creator = document.getElementById("trackCreator");
    if (title) title.textContent = state.item?.title || (state.mode === "LIVE" ? "Live microphone" : "No programmed audio");
    if (creator) creator.textContent = state.item?.artist || (state.mode === "LIVE" ? "SIDEBAND live audio" : "Station automation");
    dispatchEvent(new CustomEvent("sideband-state", { detail: state }));
  };
  socket.onclose = () => { if (connection) connection.innerHTML = '<span class="lamp lamp-amber"></span>POLLING'; setTimeout(connect, retry); retry = Math.min(30000, retry * 2); };
  socket.onerror = () => socket.close();
}

connect();
