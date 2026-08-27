export const WIDGET_DEFAULTS = Object.freeze({
  layout: "standard",
  theme: "dark",
  accent: "#8fc46f",
  artwork: true,
  details: true,
  stationLink: true,
});

const DIMENSIONS = Object.freeze({
  compact: { width: 360, height: 280 },
  standard: { width: 480, height: 320 },
  wide: { width: 640, height: 250 },
});

const truthy = value => value === true || value === "1" || value === "true";

export function normalizeWidgetSettings(value = {}) {
  const layout = Object.hasOwn(DIMENSIONS, value.layout) ? value.layout : WIDGET_DEFAULTS.layout;
  const theme = ["dark", "light", "system"].includes(value.theme) ? value.theme : WIDGET_DEFAULTS.theme;
  const accent = /^#[0-9a-f]{6}$/i.test(value.accent || "") ? value.accent.toLowerCase() : WIDGET_DEFAULTS.accent;
  return {
    layout,
    theme,
    accent,
    artwork: value.artwork === undefined ? WIDGET_DEFAULTS.artwork : truthy(value.artwork),
    details: value.details === undefined ? WIDGET_DEFAULTS.details : truthy(value.details),
    stationLink: value.stationLink === undefined ? WIDGET_DEFAULTS.stationLink : truthy(value.stationLink),
  };
}

export function readWidgetSettings(search = "") {
  const params = new URLSearchParams(search);
  return normalizeWidgetSettings({
    layout: params.get("layout") || undefined,
    theme: params.get("theme") || undefined,
    accent: params.get("accent") || undefined,
    artwork: params.has("artwork") ? params.get("artwork") : undefined,
    details: params.has("details") ? params.get("details") : undefined,
    stationLink: params.has("stationLink") ? params.get("stationLink") : undefined,
  });
}

export function widgetDimensions(layout) {
  return DIMENSIONS[layout] || DIMENSIONS.standard;
}

export function buildWidgetUrl(publicBaseUrl, value) {
  const settings = normalizeWidgetSettings(value);
  const url = new URL("embed.html", publicBaseUrl.endsWith("/") ? publicBaseUrl : `${publicBaseUrl}/`);
  Object.entries(settings).forEach(([key, item]) => url.searchParams.set(key, typeof item === "boolean" ? (item ? "1" : "0") : item));
  return url.toString();
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

export function buildEmbedCode(publicBaseUrl, value, stationName = "SIDEBAND Radio") {
  const settings = normalizeWidgetSettings(value);
  const { width, height } = widgetDimensions(settings.layout);
  const src = escapeAttribute(buildWidgetUrl(publicBaseUrl, settings));
  const title = escapeAttribute(`Listen to ${stationName}`);
  return `<iframe src="${src}" title="${title}" width="${width}" height="${height}" loading="lazy" allow="autoplay" style="width:100%;max-width:${width}px;height:${height}px;border:0;overflow:hidden;"></iframe>`;
}
