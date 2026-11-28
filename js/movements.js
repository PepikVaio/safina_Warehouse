function movementElement(name, mode=movementMode) {
  const prefix = mode === "in" ? "receipt" : "issue";

  const suffix = {
    view: "View",
    eyebrow: "Eyebrow",
    title: "Title",
    description: "Description",
    form: "Form",
    part: "Part",
    location: "Location",
    newLocationFields: "NewLocationFields",
    rack: "NewRack",
    box: "NewBox",
    qty: "Qty",
    error: "Error",
    cancel: "Cancel",
    submit: "Submit"
  };

  const ending = suffix[name];
  return ending ? $(`${prefix}${ending}`) : null;
}

// PŘÍJEM A VÝDEJ – UMÍSTĚNÍ
// =========================================================

function updateMovementLocations(mode=movementMode) {
  const partSelect=movementElement("part",mode);
  const locationSelect=movementElement("location",mode);
  const newFields=movementElement("newLocationFields",mode);

  const p=parts.find(x=>x.id===partSelect.value);

  if(newFields) {
    newFields.classList.add("hidden");
  }

  if(!p) {
    locationSelect.innerHTML='<option value="">Nejdříve vyber díl</option>';
    return;
  }

  locationSelect.innerHTML=(p.locations||[])
    .map((l,i)=>
      `<option value="${i}">${esc(l.rack)} / ${esc(l.box)} – ${l.qty} ks</option>`
    )
    .join("");

  if(mode==="in") {
    locationSelect.innerHTML+='<option value="new">＋ Zadat nové umístění</option>';
  }

  if(!p.locations?.length) {
    locationSelect.value=mode==="in"?"new":"";
  }

  if(newFields&&locationSelect.value==="new") {
    newFields.classList.remove("hidden");
  }
}


// =========================================================
// PŘÍJEM A VÝDEJ – ULOŽENÍ POHYBU
// =========================================================

async function saveMovement(e,mode=movementMode) {
  e.preventDefault();

  if(!requireWriter()) return;

  const partSelect=movementElement("part",mode);
  const locationSelect=movementElement("location",mode);
  const qtyInput=movementElement("qty",mode);
  const error=movementElement("error",mode);

  const p=parts.find(x=>x.id===partSelect.value);
  const v=locationSelect.value;
  const qty=Number(qtyInput.value);

  error.textContent="";

  if(!p) {
    error.textContent="Vyber náhradní díl.";
    return;
  }

  if(!Number.isInteger(qty)||qty<1) {
    error.textContent="Zadej celé kladné množství.";
    return;
  }

  let loc=null;

  if(v==="new") {
    const rackInput=movementElement("rack",mode);
    const boxInput=movementElement("box",mode);

    const rack=rackInput?.value.trim()||"";
    const box=boxInput?.value.trim()||"";

    if(mode!=="in"||!rack||!box) {
      error.textContent="Vyplň regál a box.";
      return;
    }

    let idx=p.locations.findIndex(
      l=>
        l.rack.toLowerCase()===rack.toLowerCase()&&
        l.box.toLowerCase()===box.toLowerCase()
    );

    if(idx<0) {
      p.locations.push({
        rack,
        box,
        qty:0,
        stockedAt:""
      });

      idx=p.locations.length-1;
    }

    loc=p.locations[idx];

  } else {
    loc=p.locations[Number(v)];
  }

  if(!loc) {
    error.textContent="Vyber platné umístění.";
    return;
  }

  if(mode==="out"&&loc.qty<qty) {
    error.textContent="Na vybraném místě není dostatečné množství.";
    return;
  }

  loc.qty=Number(loc.qty||0)+(mode==="in"?qty:-qty);

  if(mode==="in") {
    loc.stockedAt=today();
  }

  const user=currentUser
    ? `${currentUser.firstName} ${currentUser.lastName}`
    : "Neznámý uživatel";

  const h={
    at:new Date().toISOString(),
    user,
    type:mode,
    partId:p.id,
    partName:p.name,
    location:`${loc.rack} / ${loc.box}`,
    qty
  };

  try {
    await commitAll(
      parts.map(x=>({
        ...x,
        locations:(x.locations||[]).map(l=>({...l}))
      })),
      [...historyItems,h]
    );

    qtyInput.value=1;

    const rackInput=movementElement("rack",mode);
    const boxInput=movementElement("box",mode);

    if(rackInput) rackInput.value="";
    if(boxInput) boxInput.value="";

    toast(
      mode==="in"
        ? "Příjem uložen."
        : "Výdej uložen."
    );

    switchView("stock");

  } catch(err) {
    toast(err.message);
    setState("Chyba ukládání");
  }
}


// =========================================================
// POHYB Z DETAILU DÍLU
// =========================================================

function openMovementFromDetail(mode) {
  if(!requireWriter()) return;

  const id=currentDetailId;

  $("detailDialog").close();

  selectedPartId=id;

  switchView(mode);

  movementElement("part",mode).value=id;

  updateMovementLocations(mode);
}


