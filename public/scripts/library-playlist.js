import { api, get, post } from "./api.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let selectedPlaylistId = null, playlists = [];
function notify(message) { const node = document.createElement("div"); node.className = "toast"; node.textContent = message; $("toastRegion").append(node); setTimeout(() => node.remove(), 4000); }

async function refreshTargets() {
  const data = await get("/api/admin/playlists"); playlists = data.items || [];
  let select = $("libraryPlaylistTarget");
  if (!select) {
    select = document.createElement("select"); select.id = "libraryPlaylistTarget"; select.setAttribute("aria-label", "Target playlist");
    $("libraryCompatibility").after(select);
  }
  select.innerHTML = '<option value="">Choose target playlist…</option>' + playlists.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  if (selectedPlaylistId && playlists.some(p => p.id === selectedPlaylistId)) select.value = selectedPlaylistId;
  select.onchange = () => { selectedPlaylistId = select.value || null; };
}

function enhanceAssetRows() {
  $("assetRows")?.querySelectorAll("[data-audition]").forEach(audition => {
    if (audition.parentElement.querySelector("[data-add-asset]")) return;
    const add = document.createElement("button"); add.className = "table-action"; add.dataset.addAsset = audition.dataset.audition; add.textContent = "ADD TO PLAYLIST";
    add.addEventListener("click", async () => {
      if (!selectedPlaylistId) return notify("Choose a target playlist above the library table.");
      try { await post(`/api/admin/playlists/${selectedPlaylistId}/items`, { assetId: add.dataset.addAsset }); notify("Audio added to the playlist draft."); await showItems(selectedPlaylistId); } catch (error) { notify(error.message); }
    });
    audition.after(add);
  });
}

async function showItems(playlistId) {
  selectedPlaylistId = playlistId; if ($("libraryPlaylistTarget")) $("libraryPlaylistTarget").value = playlistId;
  const data = await get(`/api/admin/playlists/${playlistId}/items`), panel = $("playlistItems");
  panel.innerHTML = data.items.length ? data.items.map((item, index) => `<article class="playlist-line"><span>${index + 1}</span><div><strong>${esc(item.title || "Missing asset")}</strong><small>${esc(item.artist || item.mime_type || "")}</small></div><time>${Math.floor(Number(item.duration_seconds || 0) / 60).toString().padStart(2, "0")}:${Math.floor(Number(item.duration_seconds || 0) % 60).toString().padStart(2, "0")}</time><button data-remove-item="${esc(item.id)}">REMOVE</button></article>`).join("") : '<p class="empty-note">This playlist draft is empty. Choose it above the Library table, then add audio.</p>';
  panel.querySelectorAll("[data-remove-item]").forEach(button => button.onclick = async () => { if (!confirm("Remove this item from the playlist draft? Published revisions are not changed.")) return; await api(`/api/admin/playlists/${playlistId}/items/${button.dataset.removeItem}`, { method: "DELETE" }); await showItems(playlistId); });
  $("playlistItemsCount").textContent = data.items.length; $("playlistRevision").textContent = `DRAFT r${data.revision}`;
}

document.addEventListener("click", event => { const button = event.target.closest("[data-playlist]"); if (button) setTimeout(() => showItems(button.dataset.playlist).catch(error => notify(error.message)), 0); });
new MutationObserver(enhanceAssetRows).observe($("assetRows"), { childList: true, subtree: true });
new MutationObserver(() => refreshTargets().catch(() => {})).observe($("playlistList"), { childList: true });
refreshTargets().then(enhanceAssetRows).catch(() => {});
