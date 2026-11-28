// PŘEPÍNÁNÍ OBRAZOVEK
// =========================================================

function switchView(view) {
  if(!hasActiveAccess()) {
    openSettings();
    return;
  }

  if((view==="in"||view==="out")&&!requireWriter()) {
    return;
  }

  document.querySelectorAll(".nav-btn").forEach(b=>{
    b.classList.toggle("active",b.dataset.view===view);
  });

  document.querySelectorAll("#appView .view").forEach(screen=>{
    screen.classList.add("hidden");
  });

  const activeScreen={
    stock: "stockView",
    in: "receiptView",
    out: "issueView",
    history: "historyView"
  }[view];

  $(activeScreen)?.classList.remove("hidden");

  const pageCopy={
    stock:{
      eyebrow:"SKLADOVÁ EVIDENCE",
      title:"Přehled skladu",
      description:"Sdílený sklad synchronizovaný přes soukromý GitHub."
    },
    in:{
      eyebrow:"PŘÍJEM MATERIÁLU",
      title:"Příjem",
      description:"Vyber díl a umístění, kam materiál ukládáš."
    },
    out:{
      eyebrow:"VÝDEJ MATERIÁLU",
      title:"Výdej",
      description:"Vyber díl a umístění, odkud materiál vydáváš."
    },
    history:{
      eyebrow:"SKLADOVÁ EVIDENCE",
      title:"Historie pohybů",
      description:"Přehled zaznamenaných příjmů a výdejů ve skladu."
    }
  }[view];

  $("pageEyebrow").textContent=pageCopy.eyebrow;
  $("pageTitle").textContent=pageCopy.title;
  $("pageDescription").textContent=pageCopy.description;

  if(view==="in"||view==="out") {
    movementMode=view;

    movementElement("eyebrow").textContent=
      view==="in" ? "PŘÍJEM MATERIÁLU" : "VÝDEJ MATERIÁLU";

    movementElement("title").textContent=
      view==="in" ? "Příjem" : "Výdej";

    movementElement("description").textContent=
      view==="in"
        ? "Vyber díl a umístění, kam materiál ukládáš."
        : "Vyber díl a umístění, odkud materiál vydáváš.";

    movementElement("submit").textContent=
      view==="in" ? "Potvrdit příjem" : "Potvrdit výdej";

    movementElement("part").innerHTML=
      '<option value="">Vyber náhradní díl</option>'+
      parts.map(p=>
        `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.id)})</option>`
      ).join("");

    movementElement("part").value=selectedPartId||"";

    updateMovementLocations(view);
  }

  if(view==="history") {
    renderHistory();
  }
}


// =========================================================
// SKLAD
// =========================================================

function render() {
  const q=$("searchInput").value.toLocaleLowerCase("cs-CZ");
  const f=$("stockFilter").value;

  const filtered=parts.filter(p=>{
    const t=[
      p.name,
      p.partNumber,
      p.id,
      p.internalCard,
      p.costCenter,
      p.machine,
      p.note,
      ...(p.suppliers||[]).flatMap(s=>[s.name,s.price])
    ].join(" ").toLocaleLowerCase("cs-CZ");

    const qty=total(p);
    const min=Number(p.minimumQty)||0;

    return t.includes(q)&&(
      f==="all"||
      (f==="in"&&qty>0)||
      (f==="empty"&&qty===0)||
      (f==="low"&&min>0&&qty<min)
    );
  });

  $("partsTable").innerHTML=filtered.map(p=>{
    const qty=total(p);
    const min=Number(p.minimumQty)||0;
    const s=p.suppliers?.[0]||{};

    const loc=(p.locations||[])
      .map(l=>`${esc(l.rack)} / ${esc(l.box)} (${Number(l.qty)||0})`)
      .join("<br>");

    const dates=(p.locations||[])
      .filter(l=>l.stockedAt)
      .map(l=>dateText(l.stockedAt))
      .join(", ")||"—";

    return `
      <tr data-id="${esc(p.id)}" class="${selectedPartId===p.id?"selected":""} ${min>0&&qty<min?"below-minimum":""}">
        <td><strong>${esc(p.name)}</strong><br><small>${esc(p.id)}</small></td>
        <td>${esc(p.partNumber||"—")}</td>
        <td class="qty ${qty===0?"zero":""}">${qty} ks</td>
        <td>${min||"—"}</td>
        <td>${loc||"—"}</td>
        <td>${esc(s.name||"—")}</td>
        <td>${esc(s.price||"—")}</td>
        <td>${dates}</td>
      </tr>
    `;
  }).join("")||'<tr><td colspan="8">Žádné položky neodpovídají filtru.</td></tr>';

  $("partsTable").querySelectorAll("tr[data-id]").forEach(r=>{
    r.onclick=()=>{
      const id=r.dataset.id;
      const now=Date.now();

      selectedPartId=id;

      if(lastPartTap.id===id&&now-lastPartTap.at<850) {
        lastPartTap={id:null,at:0};
        showDetail(id);
      } else {
        lastPartTap={id,at:now};
        render();
      }
    };
  });

  $("statParts").textContent=parts.length;

  $("statQty").textContent=parts.reduce(
    (n,p)=>n+total(p),
    0
  );

  $("statLow").textContent=parts.filter(
    p=>(Number(p.minimumQty)||0)>0&&total(p)<Number(p.minimumQty)
  ).length;
}


// =========================================================
// HISTORIE
// =========================================================

function renderHistory() {
  const q=$("historySearch").value.toLocaleLowerCase("cs-CZ");
  const f=$("historyFilter").value;

  const rows=historyItems
    .filter(h=>
      (f==="all"||h.type===f)&&
      [h.user,h.partName,h.partId,h.location,h.type]
        .join(" ")
        .toLocaleLowerCase("cs-CZ")
        .includes(q)
    )
    .slice()
    .reverse();

  $("historyTable").innerHTML=rows.map(h=>`
    <tr>
      <td>${dateTimeText(h.at)}</td>
      <td>${esc(h.user||"—")}</td>
      <td>${esc(h.partName)}<br><small>${esc(h.partId)}</small></td>
      <td>${h.type==="in"?"Naskladnění":"Vyskladnění"}</td>
      <td>${esc(h.location)}</td>
      <td class="qty">${h.type==="in"?"+":"−"}${h.qty} ks</td>
    </tr>
  `).join("")||'<tr><td colspan="6">Historie je prázdná.</td></tr>';
}


