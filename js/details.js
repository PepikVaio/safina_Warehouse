// DETAIL NÁHRADNÍHO DÍLU
// =========================================================

function showDetail(id) {
  if(!hasActiveAccess()) return;

  const p=parts.find(x=>x.id===id);

  if(!p) return;

  currentDetailId=id;

  $("detailTitle").textContent=p.name;

  const qty=total(p);
  const min=Number(p.minimumQty)||0;

  const image=p.image
    ? `<img class="detail-image" id="detailImage" alt="${esc(p.name)}">`
    : "";

  const locs=(p.locations||[]).map(l=>`
    <tr>
      <td>${esc(l.rack)} / ${esc(l.box)}</td>
      <td>${Number(l.qty)||0} ks</td>
      <td>${dateText(l.stockedAt)}</td>
    </tr>
  `).join("");

  $("detailContent").innerHTML=`
    <div class="detail-top">
      ${image}

      <div>
        <p><strong>Interní ID:</strong> ${esc(p.id)}</p>
        <p><strong>Objednací číslo:</strong> ${esc(p.partNumber||"—")}</p>
        <p><strong>Celkové množství:</strong> ${qty} ks</p>
        <p><strong>Minimální množství:</strong> ${min||"—"}</p>

        ${min>0&&qty<min?'<p class="warning-text">Pod minimálním množstvím</p>':""}

        <p><strong>Interní karta:</strong> ${esc(p.internalCard||"—")}</p>
        <p><strong>Středisko:</strong> ${esc(p.costCenter||"—")}</p>
        <p><strong>Zařízení:</strong> ${esc(p.machine||"—")}</p>
        <p><strong>Poznámka:</strong> ${esc(p.note||"—")}</p>
      </div>
    </div>

    <h3>Dodavatelé</h3>

    <ul>
      ${(p.suppliers||[])
        .map(s=>`<li>${esc(s.name)} – ${esc(s.price)}</li>`)
        .join("")||"<li>—</li>"}
    </ul>

    <h3>Umístění</h3>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Umístění</th>
            <th>Množství</th>
            <th>Datum naskladnění</th>
          </tr>
        </thead>

        <tbody>
          ${locs||'<tr><td colspan="3">Zatím bez umístění.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  $("detailEdit").classList.remove("hidden");
  $("detailEdit").disabled=!isWriter();

  $("detailDialog").showModal();

  if(p.image) {
    githubImageData(p.image).then(src=>{
      const el=$("detailImage");
      if(el) el.src=src;
    }).catch(()=>{});
  }
}


