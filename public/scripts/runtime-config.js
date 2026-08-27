const supplied = globalThis.SIDEBAND_CONFIG || {};
const currentOrigin = globalThis.location?.origin || "http://localhost";
const currentPage = globalThis.location?.href || `${currentOrigin}/index.html`;
const publicBaseUrl = new URL("./", currentPage).toString();
const apiBaseUrl = new URL(String(supplied.apiBaseUrl || publicBaseUrl), currentPage).toString();

function join(base, path) {
  if (/^(?:https?:|wss?:|blob:|data:)/i.test(String(path))) return String(path);
  return new URL(String(path).replace(/^\/+/, ""), base.endsWith("/") ? base : `${base}/`).toString();
}

export function apiUrl(path) {
  return join(apiBaseUrl, path);
}

export function publicUrl(path) {
  return join(publicBaseUrl, path);
}

export function webSocketUrl(path = "/api/public/ws") {
  const url = new URL(apiUrl(path));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export const runtimeConfig = Object.freeze({ apiBaseUrl, publicBaseUrl });
