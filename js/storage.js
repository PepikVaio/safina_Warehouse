// UKLÁDÁNÍ SOUBORŮ
// =========================================================

async function writeFile(path,content,expectedSha) {
  if(!requireWriter()) {
    throw new Error("Nemáš oprávnění k zápisu.");
  }

  const current=await apiGet(path,REPO_NAME,false);

  if((current?.sha||null)!==(expectedSha||null)) {
    throw new Error(`Soubor ${path} byl mezitím změněn.\nObnov data a opakuj akci.`);
  }

  const body={
    message:`Aktualizace ${path}`,
    content:encodeContent(content),
    branch:profile().branch||"main"
  };

  if(current?.sha) {
    body.sha=current.sha;
  }

  const r=await fetch(apiUrl(path),{
    method:"PUT",
    headers:apiHeaders(),
    body:JSON.stringify(body)
  });

  const j=await r.json();

  if(!r.ok) {
    throw new Error(j.message||`Zápis ${path} selhal (${r.status}).`);
  }

  return j.content?.sha||null;
}

async function commitAll(newParts,newHistory) {
  if(!requireWriter()) {
    throw new Error("Nemáš oprávnění k zápisu.");
  }

  setState("Ukládám na GitHub…");

  const dataSha=await writeFile(
    "data.json",
    JSON.stringify({parts:newParts},null,2),
    fileState.data
  );

  fileState.data=dataSha;

  try {
    const historySha=await writeFile(
      "history.json",
      JSON.stringify({items:newHistory},null,2),
      fileState.history
    );

    fileState.history=historySha;

  } catch(e) {
    await loadAll();

    throw new Error(
      `Sklad byl uložen, ale historii se nepodařilo uložit: ${e.message}`
    );
  }

  parts=newParts;
  historyItems=newHistory;

  setState(`GitHub · ${isWriter()?"Správa":"Pouze prohlížení"}`);

  applyPermissions();
  render();
  updateUserSettings();
}

async function uploadImage(file,id) {
  if(!requireWriter()) {
    throw new Error("Nemáš oprávnění k zápisu.");
  }

  const optimized=await optimizeImage(file);
  const path=`images/${id}.jpg`;
  const current=await apiGet(path,REPO_NAME,false);

  const body={
    message:`Nahrání obrázku ${id}`,
    content:optimized,
    branch:profile().branch||"main"
  };

  if(current?.sha) {
    body.sha=current.sha;
  }

  const r=await fetch(apiUrl(path),{
    method:"PUT",
    headers:apiHeaders(),
    body:JSON.stringify(body)
  });

  const j=await r.json();

  if(!r.ok) {
    throw new Error(j.message||"Obrázek se nepodařilo nahrát.");
  }

  return path;
}


// =========================================================
// OPRÁVNĚNÍ
// =========================================================

function applyPermissions() {
  const writer=!!currentUser&&isWriter();
  const admin=isAdmin();

  const userManagementBtn=$("userManagementBtn");
  if(userManagementBtn) {
    userManagementBtn.classList.toggle("hidden",!admin);
  }

  const listUsersBtn=$("listUsersBtn");
  if(listUsersBtn) {
    listUsersBtn.disabled=!admin;
  }

  const addUserBtn=$("addUserBtn");
  if(addUserBtn) {
    addUserBtn.disabled=!admin;
  }

  updateUserSettings();

  [
    "newPartBtn",
    "detailEdit",
    "detailStockIn",
    "detailStockOut",
    "partSaveButton",
    "addSupplier"
  ].forEach(id=>{
    const el=$(id);
    if(el) el.disabled=!writer;
  });

  ["in","out"].forEach(mode=>{
    const submit=movementElement("submit",mode);

    if(submit) {
      submit.disabled=!writer;
      submit.classList.toggle("permission-disabled",!writer);
    }
  });

  document.querySelectorAll(
    '.nav-btn[data-view="in"],.nav-btn[data-view="out"]'
  ).forEach(b=>{
    b.disabled=!writer;
    b.classList.toggle("permission-disabled",!writer);
  });

  document.querySelectorAll(
    "#partForm input,#partForm textarea,#partForm select"
  ).forEach(el=>{
    if(el.id!=="partId"&&el.id!=="partInternalId") {
      el.disabled=!writer;
    }
  });

  document.querySelectorAll("#suppliers .supplier-remove").forEach(b=>{
    b.disabled=!writer;
  });

  const newPartBtn=$("newPartBtn");
  if(newPartBtn) newPartBtn.classList.toggle("permission-disabled",!writer);

  const detailEdit=$("detailEdit");
  if(detailEdit) detailEdit.classList.toggle("permission-disabled",!writer);

  const detailStockIn=$("detailStockIn");
  if(detailStockIn) detailStockIn.disabled=!writer;

  const detailStockOut=$("detailStockOut");
  if(detailStockOut) detailStockOut.disabled=!writer;
}


