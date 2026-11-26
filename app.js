const DATA_URL = "./data.json";
const STORAGE_KEY = "sklad-prototype-data-v1";
let parts = [];
let movementMode = "in";
let selectedPartId = null;

const $ = id => document.getElementById(id);
const total = p => (p.locations || []).reduce((n, x) => n + Number(x.qty || 0), 0);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

async function init() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) parts = JSON.parse(saved);
    else {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error("Nepodařilo se načíst data.json");
      parts = await res.json().then(x => x.parts || []);
    }
  } catch (e) {
    console.error(e);
    parts = [];
    toast("Data se nepodařilo načíst. Zkontroluj data.json.");
  }
  bind();
  render();
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parts));
  $("saveState").textContent = "Uloženo v tomto prohlížeči";
  render();
}
function bind() {
  $("newPartBtn").onclick = () => openPart();
  $("closeDialog").onclick = closePart;
  $("cancelPart").onclick = closePart;
  $("partForm").onsubmit = savePart;
  $("addSupplier").onclick = () => addSupplierRow();
  $("addLocation").onclick = () => addLocationRow();
  $("searchInput").oninput = render;
  $("stockFilter").onchange = render;
  document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => switchView(b.dataset.view));
  $("movementForm").onsubmit = saveMovement;
  $("cancelMovement").onclick = () => switchView("stock");
  $("movementPart").onchange = updateMovementLocations;
  $("movementLocation").onchange = () => $("newLocationFields").classList.toggle("hidden", $("movementLocation").value !== "new");
  $("closeQr").onclick = $("closeQr2").onclick = () => $("qrDialog").close();
  $("printBtn").onclick = () => window.print();
}
function switchView(view) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $("stockView").classList.toggle("hidden", view !== "stock");
  $("movementView").classList.toggle("hidden", view !== "in" && view !== "out");
  if (view === "in" || view === "out") {
    movementMode = view;
    $("movementEyebrow").textContent = view === "in" ? "PŘÍJEM MATERIÁLU" : "VÝDEJ MATERIÁLU";
    $("movementTitle").textContent = view === "in" ? "Naskladnění" : "Vyskladnění";
    $("movementDescription").textContent = view === "in" ? "Vyber díl, umístění a množství, které přidáváš." : "Vyber díl, umístění a množství, které vydáváš.";
    $("movementSubmit").textContent = view === "in" ? "Potvrdit naskladnění" : "Potvrdit vyskladnění";
    $("movementError").textContent = "";
    $("movementPart").innerHTML = `<option value="">Vyber náhradní díl</option>` + parts.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.id)})</option>`).join("");
    $("movementPart").value = selectedPartId && parts.some(p => p.id === selectedPartId) ? selectedPartId : "";
    updateMovementLocations();
  }
}
function render() {
  const q = $("searchInput").value.toLocaleLowerCase("cs-CZ");
  const f = $("stockFilter").value;
  const filtered = parts.filter(p => {
    const text = [p.name,p.partNumber,p.id,p.internalCard,p.costCenter,p.machine,p.note,...(p.suppliers||[]).flatMap(s=>[s.name,s.price])].join(" ").toLocaleLowerCase("cs-CZ");
    const qty = total(p);
    return text.includes(q) && (f === "all" || (f === "in" && qty > 0) || (f === "empty" && qty === 0));
  });
  $("partsTable").innerHTML = filtered.map(p => {
    const locs = (p.locations||[]).map(l => `Regál ${esc(l.rack)} / Box ${esc(l.box)} (${Number(l.qty)||0})`).join("<br>");
    const s = (p.suppliers||[])[0] || {};
    const qty = total(p);
    return `<tr data-select="${esc(p.id)}" class="${selectedPartId===p.id ? "selected" : ""}">
      <td><span class="part-name">${esc(p.name)}</span><br><small>${esc(p.id)}</small></td>
      <td>${esc(p.partNumber)}</td><td>${p.stockedAt ? new Date(p.stockedAt + "T00:00:00").toLocaleDateString("cs-CZ") : "—"}</td><td class="qty ${qty===0?'zero':''}">${qty} ks</td>
      <td>${locs || "—"}</td><td>${esc(s.name||"—")}</td><td>${esc(s.price||"—")}</td>
      <td>${esc(p.internalCard||"—")}</td><td>${esc(p.costCenter||"—")}</td><td>${esc(p.machine||"—")}</td>
      <td><div class="actions"><button class="mini-btn" data-edit="${esc(p.id)}">Upravit</button><button class="mini-btn" data-qr="${esc(p.id)}">QR</button></div></td>
    </tr>`;
  }).join("") || `<tr><td colspan="11">Žádné položky neodpovídají filtru.</td></tr>`;
  $("partsTable").querySelectorAll("[data-select]").forEach(r => r.onclick = e => { if (e.target.closest("button")) return; selectedPartId = r.dataset.select; render(); });
  $("partsTable").querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openPart(b.dataset.edit));
  $("partsTable").querySelectorAll("[data-qr]").forEach(b => b.onclick = () => showQr(b.dataset.qr));
  $("statParts").textContent = parts.length;
  $("statQty").textContent = parts.reduce((n,p)=>n+total(p),0);
  $("statEmpty").textContent = parts.filter(p=>total(p)===0).length;
}
function openPart(id) {
  const p = parts.find(x=>x.id===id);
  $("partForm").reset();
  $("partId").value = p?.id || "";
  $("partCreatedAt").value = p ? (p.stockedAt || "") : "";
  $("dialogTitle").textContent = p ? "Upravit kartu" : "Nová karta";
  $("partName").value = p?.name || "";
  $("partNumber").value = p?.partNumber || "";
  $("partInternalId").value = p?.id || nextId();
  $("partCard").value = p?.internalCard || "";
  $("partCostCenter").value = p?.costCenter || "";
  $("partMachine").value = p?.machine || "";
  $("partNote").value = p?.note || "";
  $("suppliers").innerHTML = "";
  $("locations").innerHTML = "";
  (p?.suppliers?.length ? p.suppliers : [{name:"",price:""}]).forEach(addSupplierRow);
  (p?.locations?.length ? p.locations : [{rack:"",box:"",qty:0}]).forEach(addLocationRow);
  $("qrCode").innerHTML = "";
  makeQr($("qrCode"), p?.id || $("partInternalId").value, 88);
  $("partDialog").showModal();
}
function closePart(){ $("partDialog").close(); }
function nextId() {
  const max = parts.reduce((m,p)=>Math.max(m,Number((p.id||"").replace("ND-",""))||0),0);
  return "ND-" + String(max+1).padStart(5,"0");
}
function addSupplierRow(s={name:"",price:""}) {
  const row = document.createElement("div"); row.className="supplier-row";
  row.innerHTML = `<input aria-label="Dodavatel" placeholder="Název dodavatele" value="${esc(s.name)}"><input aria-label="Cena" placeholder="Např. 125 Kč" value="${esc(s.price)}"><button type="button" class="remove-btn" aria-label="Odebrat">×</button>`;
  row.querySelector("button").onclick=()=>row.remove(); $("suppliers").append(row);
}
function addLocationRow(l={rack:"",box:"",qty:0}) {
  const row=document.createElement("div");row.className="location-row";
  row.innerHTML=`<input aria-label="Regál" placeholder="Regál" value="${esc(l.rack)}"><input aria-label="Box" placeholder="Box" value="${esc(l.box)}"><input aria-label="Množství" type="number" min="0" step="1" value="${Number(l.qty)||0}"><button type="button" class="remove-btn" aria-label="Odebrat">×</button>`;
  row.querySelector("button").onclick=()=>row.remove();$("locations").append(row);
}
function savePart(e) {
  e.preventDefault();
  const id=$("partId").value || $("partInternalId").value;
  const existing=parts.find(x=>x.id===id);
  const locations=[...$("locations").children].map(r=>({rack:r.children[0].value.trim(),box:r.children[1].value.trim(),qty:Math.max(0,Number(r.children[2].value)||0)})).filter(x=>x.rack||x.box||x.qty>0);
  const p={id,stockedAt:existing ? (existing.stockedAt || "") : (locations.some(x=>x.qty>0) ? today() : ""),name:$("partName").value.trim(),partNumber:$("partNumber").value.trim(),internalCard:$("partCard").value.trim(),costCenter:$("partCostCenter").value.trim(),machine:$("partMachine").value.trim(),note:$("partNote").value.trim(),
    suppliers:[...$("suppliers").children].map(r=>({name:r.children[0].value.trim(),price:r.children[1].value.trim()})).filter(x=>x.name||x.price),
    locations};
  const idx=parts.findIndex(x=>x.id===id); if(idx>=0)parts[idx]=p;else parts.push(p);
  persist();closePart();toast("Karta byla uložena.");
}
function updateMovementLocations() {
  const p=parts.find(x=>x.id===$("movementPart").value);
  $("newLocationFields").classList.add("hidden");
  if (!p) { $("movementLocation").innerHTML = '<option value="">Nejdříve vyber díl</option>'; return; }
  $("movementLocation").innerHTML=(p.locations||[]).map((l,i)=>`<option value="${i}">Regál ${esc(l.rack)} / Box ${esc(l.box)} – ${l.qty} ks</option>`).join("");
  if (movementMode === "in") $("movementLocation").innerHTML += '<option value="new">＋ Zadat nové umístění</option>';
  if (!p.locations?.length) $("movementLocation").value = movementMode === "in" ? "new" : "";
  if ($( "movementLocation").value === "new") $("newLocationFields").classList.remove("hidden");
}
function saveMovement(e) {
  e.preventDefault();
  const p=parts.find(x=>x.id===$("movementPart").value), locationValue=$("movementLocation").value, i=Number(locationValue), qty=Number($("movementQty").value);
  $("movementError").textContent="";
  if(!p) { $("movementError").textContent="Vyber náhradní díl.";return; }
  if(!Number.isInteger(qty)||qty<1){$("movementError").textContent="Zadej celé kladné množství.";return;}
  if(locationValue === "new") {
    const rack=$("newRack").value.trim(), box=$("newBox").value.trim();
    if(movementMode !== "in" || !rack || !box) { $("movementError").textContent="Vyplň regál a box nového umístění.";return; }
    p.locations ||= [];
    const existingIndex=p.locations.findIndex(l=>l.rack.toLocaleLowerCase("cs-CZ")===rack.toLocaleLowerCase("cs-CZ") && l.box.toLocaleLowerCase("cs-CZ")===box.toLocaleLowerCase("cs-CZ"));
    if(existingIndex>=0) p.locations[existingIndex].qty += qty; else p.locations.push({rack,box,qty});
    p.stockedAt = today();
    persist(); $("movementQty").value=1; $("newRack").value=""; $("newBox").value=""; toast("Materiál byl naskladněn do nového umístění."); switchView("stock"); return;
  }
  if(!p.locations?.[i]) { $("movementError").textContent="Vyber platné umístění.";return; }
  if(movementMode==="out" && p.locations[i].qty<qty){$("movementError").textContent="Na vybraném místě není dostatečné množství.";return;}
  p.locations[i].qty += movementMode==="in" ? qty : -qty;
  if(movementMode==="in") p.stockedAt = today();
  persist();$("movementQty").value=1;toast(movementMode==="in"?"Materiál byl naskladněn.":"Materiál byl vyskladněn.");switchView("stock");
}
function makeQr(target,text,size) {
  target.innerHTML="";
  if(window.QRCode) new QRCode(target,{text:String(text),width:size,height:size,correctLevel:QRCode.CorrectLevel.M});
  else target.innerHTML='<span class="muted small">QR knihovna není dostupná</span>';
}
function showQr(id) {
  const p=parts.find(x=>x.id===id); if(!p)return;
  $("printName").textContent=p.name;$("printNumber").textContent=p.partNumber||"";$("printId").textContent=p.id;
  makeQr($("printQr"),p.id,112);$("qrDialog").showModal();
}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2300);}
init();
