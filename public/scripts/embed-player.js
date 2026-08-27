import { readWidgetSettings } from "./widget-config.js";

const settings = readWidgetSettings(location.search);
const body = document.body;
const player = document.getElementById("embedPlayer");

body.classList.remove("widget-theme-dark", "widget-theme-light", "widget-theme-system");
body.classList.add(`widget-theme-${settings.theme}`);
document.documentElement.style.setProperty("--green", settings.accent);
player.dataset.layout = settings.layout;
document.getElementById("stationArt").hidden = !settings.artwork;
document.getElementById("embedProgramDetails").hidden = !settings.details;
document.getElementById("playerMessage").hidden = !settings.details;
document.getElementById("fullStationLink").hidden = !settings.stationLink;
document.getElementById("fullStationLink").href = new URL("/index.html", location.href).toString();

await import("./listener.js");
await Promise.all([import("./live-listener.js"), import("./state-sync.js")]);
