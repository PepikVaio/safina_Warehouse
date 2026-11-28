// KARTY NÁHRADNÍCH DÍLŮ
// =========================================================

function nextId() {
  return "ND-"+String(
    parts.reduce(
      (m,p)=>Math.max(m,Number((p.id||"").replace("ND-",""))||0),
      0
    )+1
  ).padStart(5,"0");
}

function addSupplierRow(s={name:"",price:""}) {
  const row=document.createElement("div");

  row.className="supplier-row";

  row.innerHTML=`
    <input placeholder="Název dodavatele" value="${esc(s.name)}">
    <input placeholder="Např. 125 Kč" value="${esc(s.price)}">
    <button type="button" class="btn btn-remove supplier-remove" title="Odebrat dodavatele" aria-label="Odebrat dodavatele">×</button>
  `;

  row.querySelector("button").onclick=()=>row.remove();
  row.querySelector("button").disabled=!isWriter();

  $("suppliers").append(row);
}

function openPart(id) {
  if(!requireWriter()) return;

  const p=parts.find(x=>x.id===id);

  currentImageData=null;

  $("partForm").reset();

  $("partId").value=p?.id||"";
  $("dialogTitle").textContent=p?"Upravit kartu":"Nová karta";

  $("partName").value=p?.name||"";
  $("partNumber").value=p?.partNumber||"";
  $("partInternalId").value=p?.id||nextId();

  $("partCard").value=p?.internalCard||"";
  $("partCostCenter").value=p?.costCenter||"";
  $("partMachine").value=p?.machine||"";
  $("partMinimum").value=p?.minimumQty??0;
  $("partNote").value=p?.note||"";

  $("suppliers").innerHTML="";

  (p?.suppliers?.length?p.suppliers:[{name:"",price:""}])
    .forEach(addSupplierRow);

  $("imagePreview").classList.toggle("hidden",!p?.image);

  if(p?.image) {
    githubImageData(p.image).then(src=>{
      $("imagePreview").src=src;
    }).catch(()=>{});
  }

  $("partDialog").showModal();
}

async function githubImageData(path) {
  const f=await apiGet(path);

  if(!f?.content) {
    throw new Error("Obrázek se nepodařilo načíst z GitHubu.");
  }

  const ext=(path.split(".").pop()||"jpg").toLowerCase();

  const mime=
    ext==="png"?"image/png":
    ext==="webp"?"image/webp":
    ext==="gif"?"image/gif":
    "image/jpeg";

  return `data:${mime};base64,${f.content.replace(/\n/g,"")}`;
}

async function optimizeImage(file) {
  const bitmap=await createImageBitmap(file);

  const scale=Math.min(
    1,
    1200/Math.max(bitmap.width,bitmap.height)
  );

  const canvas=document.createElement("canvas");

  canvas.width=Math.round(bitmap.width*scale);
  canvas.height=Math.round(bitmap.height*scale);

  canvas.getContext("2d").drawImage(
    bitmap,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const data=canvas.toDataURL("image/jpeg",0.78).split(",")[1];

  if(data.length>1300000) {
    throw new Error("Obrázek je i po zmenšení příliš velký. Vyber menší obrázek.");
  }

  return data;
}

function previewImage(e) {
  const f=e.target.files?.[0];

  if(!f) return;

  if(!f.type.startsWith("image/")) {
    toast("Vyber obrázek.");
    return;
  }

  currentImageData=f;

  $("imagePreview").src=URL.createObjectURL(f);
  $("imagePreview").classList.remove("hidden");
}

async function savePart(e) {
  e.preventDefault();

  if(!requireWriter()) return;

  const id=$("partId").value||$("partInternalId").value;
  const old=parts.find(p=>p.id===id);

  const p={
    ...(old||{}),
    id,
    name:$("partName").value.trim(),
    partNumber:$("partNumber").value.trim(),
    internalCard:$("partCard").value.trim(),
    costCenter:$("partCostCenter").value.trim(),
    machine:$("partMachine").value.trim(),
    minimumQty:Math.max(0,Number($("partMinimum").value)||0),
    note:$("partNote").value.trim(),

    suppliers:[...$("suppliers").children]
      .map(r=>({
        name:r.children[0].value.trim(),
        price:r.children[1].value.trim()
      }))
      .filter(s=>s.name||s.price),

    locations:old?.locations||[]
  };

  const button=$("partForm").querySelector('button[type="submit"]');

  await withButtonLoading(button,"Ukládám…",async()=>{
    try {
      if(currentImageData) {
        setState("Nahrávám obrázek…");
        p.image=await uploadImage(currentImageData,id);
      }

      const next=parts.slice();
      const i=next.findIndex(x=>x.id===id);

      if(i>=0) {
        next[i]=p;
      } else {
        next.push(p);
      }

      await commitAll(next,historyItems);

      $("partDialog").close();

      toast("Karta byla uložena do GitHubu.");

    } catch(err) {
      toast(err.message);
      setState("Chyba ukládání");
    }
  });
}


