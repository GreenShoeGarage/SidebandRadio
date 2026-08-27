import { WIDGET_DEFAULTS, buildEmbedCode, buildWidgetUrl, normalizeWidgetSettings, widgetDimensions } from "./widget-config.js";

const $ = id => document.getElementById(id);

function readControls() {
  return normalizeWidgetSettings({
    layout: $("widgetLayout").value,
    theme: $("widgetTheme").value,
    accent: $("widgetAccent").value,
    artwork: $("widgetArtwork").checked,
    details: $("widgetDetails").checked,
    stationLink: $("widgetStationLink").checked,
  });
}

function renderWidget() {
  const settings = readControls();
  const dimensions = widgetDimensions(settings.layout);
  const stationName = $("stationName")?.textContent?.trim() || "SIDEBAND Radio";
  $("widgetAccentValue").textContent = settings.accent.toUpperCase();
  $("widgetDimensions").textContent = `${dimensions.width} × ${dimensions.height}`;
  $("widgetPreviewFrame").style.setProperty("--widget-width", `${dimensions.width}px`);
  $("widgetPreview").style.height = `${dimensions.height}px`;
  $("widgetPreview").src = buildWidgetUrl(location.origin, settings);
  $("widgetCode").value = buildEmbedCode(location.origin, settings, stationName);
}

async function copyEmbedCode() {
  const code = $("widgetCode");
  try {
    await navigator.clipboard.writeText(code.value);
  } catch {
    code.focus();
    code.select();
    if (!document.execCommand("copy")) {
      $("widgetCopyStatus").textContent = "Copy was blocked. The code is selected so you can copy it manually.";
      return;
    }
  }
  $("widgetCopyStatus").textContent = "Embed code copied. Paste it into a custom HTML block on your website.";
  $("widgetCopy").firstChild.textContent = "COPIED ";
  setTimeout(() => { $("widgetCopy").firstChild.textContent = "COPY EMBED CODE "; }, 1800);
}

function resetWidget() {
  $("widgetLayout").value = WIDGET_DEFAULTS.layout;
  $("widgetTheme").value = WIDGET_DEFAULTS.theme;
  $("widgetAccent").value = WIDGET_DEFAULTS.accent;
  $("widgetArtwork").checked = WIDGET_DEFAULTS.artwork;
  $("widgetDetails").checked = WIDGET_DEFAULTS.details;
  $("widgetStationLink").checked = WIDGET_DEFAULTS.stationLink;
  $("widgetCopyStatus").textContent = "Widget settings reset to the SIDEBAND defaults.";
  renderWidget();
}

if ($("widgetForm")) {
  $("widgetForm").addEventListener("input", renderWidget);
  $("widgetForm").addEventListener("change", renderWidget);
  $("widgetCopy").addEventListener("click", copyEmbedCode);
  $("widgetReset").addEventListener("click", resetWidget);
  renderWidget();
}
