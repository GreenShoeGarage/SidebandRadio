import { get, patch, post } from "./api.js";
import { apiUrl } from "./runtime-config.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let assignments = new Map(), assets = [], audition = new Audio(); audition.preload = "metadata";
function notify(message) { const node = document.createElement("div"); node.className = "toast"; node.textContent = message; $("toastRegion").append(node); setTimeout(() => node.remove(), 4000); }

async function loadCarts() {
  const [cartData, assetData] = await Promise.all([get("/api/admin/carts"), get("/api/admin/assets?limit=200")]);
  assignments = new Map((cartData.items || []).map(x => [Number(x.slot), x])); assets = assetData.items || [];
  decoratePads();
}

function decoratePads() {
  $("cartGrid")?.querySelectorAll("[data-cart]").forEach(button => {
    const slot = Number(button.dataset.cart) + 1, assignment = assignments.get(slot);
    if (assignment) {
      button.querySelector("strong").textContent = assignment.label;
      button.querySelector("small").textContent = assignment.asset ? assignment.asset.title : "UNASSIGNED";
      button.style.borderColor = assignment.color;
    } else button.querySelector("small").textContent = "UNASSIGNED · CONFIGURE CARTS";
  });
}

async function activateCart(event) {
  const button = event.target.closest("[data-cart]"); if (!button) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const slot = Number(button.dataset.cart) + 1, assignment = assignments.get(slot);
  if (!assignment?.asset) return notify(`Cart ${slot} is unassigned. Use Configure Carts.`);
  const mode = document.querySelector("[data-cart-mode].active")?.dataset.cartMode || "audition";
  if (mode === "audition") { audition.src = apiUrl(assignment.asset.mediaUrl); audition.currentTime = 0; await audition.play(); notify(`${assignment.label} is playing only through this browser.`); return; }
  if (assignment.requiresConfirmation && !confirm(`Play ${assignment.label} on the public station now? The schedule will be overridden and the activation logged.`)) return;
  await post("/api/admin/carts/fire", { slot, note: $("operatorNote").value }); notify(`${assignment.label} is on air.`);
}

function configurationDialog() {
  let dialog = $("cartConfigDialog"); if (dialog) return dialog;
  dialog = document.createElement("dialog"); dialog.id = "cartConfigDialog";
  dialog.innerHTML = `<form method="dialog"><p class="eyebrow">CART ASSIGNMENT</p><h2>Configure a cart</h2><label>SLOT<select id="cartSlot">${Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}">Cart ${i + 1}</option>`).join("")}</select></label><label>LABEL<input id="cartLabel" maxlength="80"></label><label>AUDIO ASSET<select id="cartAsset"></select></label><label>COLOR<input id="cartColor" type="color" value="#496042"></label><label><input id="cartConfirm" type="checkbox" checked> Confirm before on-air activation</label><div class="dialog-actions"><button value="cancel" class="secondary-button">CANCEL</button><button value="save" class="primary-action">SAVE CART</button></div></form>`;
  document.body.append(dialog); dialog.addEventListener("close", async () => { if (dialog.returnValue !== "save") return; try { await patch("/api/admin/carts", { slot: Number($("cartSlot").value), label: $("cartLabel").value, assetId: $("cartAsset").value || null, color: $("cartColor").value, requiresConfirmation: $("cartConfirm").checked }); await loadCarts(); notify("Cart assignment saved."); } catch (error) { notify(error.message); } });
  return dialog;
}

function openCartConfig() {
  const dialog = configurationDialog(), slot = Number($("cartSlot").value), assignment = assignments.get(slot);
  $("cartAsset").innerHTML = '<option value="">Unassigned</option>' + assets.map(x => `<option value="${esc(x.id)}">${esc(x.title)} — ${esc(x.artist || x.mimeType)}</option>`).join("");
  $("cartLabel").value = assignment?.label || `CART ${slot}`; $("cartAsset").value = assignment?.assetId || ""; $("cartColor").value = assignment?.color || "#496042"; $("cartConfirm").checked = assignment?.requiresConfirmation ?? true;
  $("cartSlot").onchange = openCartConfigValues; dialog.showModal();
}
function openCartConfigValues() { const assignment = assignments.get(Number($("cartSlot").value)); $("cartLabel").value = assignment?.label || `CART ${$("cartSlot").value}`; $("cartAsset").value = assignment?.assetId || ""; $("cartColor").value = assignment?.color || "#496042"; $("cartConfirm").checked = assignment?.requiresConfirmation ?? true; }

const configure = document.createElement("button"); configure.className = "secondary-button"; configure.type = "button"; configure.textContent = "CONFIGURE CARTS";
document.querySelector('[data-panel-id="carts"] .work-heading')?.append(configure); configure.addEventListener("click", openCartConfig);
$("cartGrid")?.addEventListener("click", event => activateCart(event).catch(error => notify(error.message)), true);
new MutationObserver(decoratePads).observe($("cartGrid"), { childList: true });

$("newClock")?.addEventListener("click", async event => { event.stopImmediatePropagation(); const name = prompt("Name this 60-minute program clock:", "Hourly workshop clock"); if (!name) return; try { const result = await post("/api/admin/clocks", { name, durationSeconds: 3600 }); notify(`${result.clock.name} created with ${result.clock.slotCount} editable clock slots.`); } catch (error) { notify(error.message); } }, true);
loadCarts().catch(() => {});
