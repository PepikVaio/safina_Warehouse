
const PROFILE_KEY = "sklad-profile-v1";
const REPO_OWNER = "PepikVaio";
const REPO_NAME = "safina_Warehouse_Data";
const $ = id => document.getElementById(id);

let parts = [], historyItems = [], selectedPartId = null, movementMode = "in", currentDetailId = null;
let fileState = { data: null, history: null };
let currentRole = "read";
let currentUser = null;
let usersData = { users: [] }, usersFileSha = null, pendingInvite = null;
let usersDraft = null;
let currentImageData = null;
let lastPartTap = { id: null, at: 0 };
let currentLastLogin = null;
let currentAccessStatus = "";

let qrScannerStream = null;
let qrScannerFrame = null;
let qrScannerLibrary = null;

const total = p => (p.locations || []).reduce((n,l)=>n + (Number(l.qty)||0),0);
const isUserActive = u => u?.status !== "deactive";

const today = () => {
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

const dateText = d => d ? new Date(`${d}T00:00:00`).toLocaleDateString("cs-CZ") : "—";
const dateTimeText = d => d ? new Date(d).toLocaleString("cs-CZ") : "—";

const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({
  "&":"&amp;",
  "<":"&lt;",
  ">":"&gt;",
  '"':"&quot;",
  "'":"&#39;"
}[c]));

const profile = () => {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)||"{}");
  } catch {
    return {};
  }
};

const isConfigured = p => !!p.token;

const hasActiveAccess = () =>
  !!currentUser &&
  currentAccessStatus !== "deactive" &&
  currentAccessStatus !== "removed";

const isWriter = () =>
  hasActiveAccess() &&
  (currentRole === "write" || currentRole === "admin");

const isAdmin = () =>
  hasActiveAccess() &&
  currentRole === "admin";

const roleLabel = role => ({
  read:"Read – pouze prohlížení",
  write:"Write – úpravy skladu",
  admin:"Admin – správce"
})[role] || role;


// =========================================================
// POHYBY – SPOLEČNÉ POMOCNÉ FUNKCE
// =========================================================

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


// =========================================================
// START A INICIALIZACE
// =========================================================

async function init() {
  try {
    bind();
    readInviteFromUrl();
    updateIdentity();
    applyPermissions();

    const p=profile();
    fillSettings(p);

    if(pendingInvite) {
      setState("Čeká se na potvrzení pozvánky");

    } else if(isConfigured(p)) {
      try {
        const allowed=await loadAll();

        if(!allowed) {
          openSettings();
        }

      } catch(e) {
        setState("Chyba připojení");
        toast(e.message);
        openSettings();
      }

    } else {
      setState("Nastav připojení");
      openSettings();
    }

    render();

    if(pendingInvite) {
      await showPendingInviteDialog();
    }

  } catch(e) {
    console.error("Chyba inicializace:",e);
    setState("Chyba inicializace");
    toast(`Aplikaci se nepodařilo spustit: ${e.message}`);
  }
}


// =========================================================
// UDÁLOSTI
// =========================================================

function bind() {
  const on=(id,event,fn)=>{
    const el=$(id);
    if(el) el.addEventListener(event,fn);
  };

  // Přihlášení a profil
  on("settingsBtn","click",openSettings);
  on("userManagementBtn","click",()=>openUsers("list"));

  on("listUsersBtn","click",()=>openUsers("list"));
  on("addUserBtn","click",()=>openUsers("add"));

  on("logoutBtn","click",logout);
  on("settingsForm","submit",saveSettings);

  on("closeSettings","click",()=>$("settingsDialog")?.close());
  on("closeSettings2","click",()=>$("settingsDialog")?.close());
  on("cancelSettings","click",()=>$("settingsDialog")?.close());

  // Seznam uživatelů
  on("closeUsers","click",closeUsersDialog);
  on("closeUsersList","click",closeUsersDialog);
  on("saveUsersList","click",saveUsersDraft);
  on("listUsersDialog","close",()=> {
    usersDraft=null;
  });

  // Přidání uživatele
  on("userForm","submit",saveUser);
  on("closeAddUser","click",()=>$("addUserDialog")?.close());
  on("closeAddUser2","click",()=>$("addUserDialog")?.close());

  on("copyInvite","click",shareInviteLink);
  on("copyInviteOnly","click",copyInviteLink);
  on("saveInvite","click",saveInvite);

  // Karty náhradních dílů
  on("newPartBtn","click",()=>{
    if(requireWriter()) openPart();
  });

  on("closeDialog","click",()=>$("partDialog")?.close());
  on("cancelPart","click",()=>$("partDialog")?.close());
  on("partForm","submit",savePart);

  on("addSupplier","click",()=>addSupplierRow());
  on("partImage","change",previewImage);

  // Vyhledávání, filtry a QR skener
  on("searchInput","input",render);
  on("stockFilter","change",render);
  on("takePhotoBtn","click",openQrScanner);

  document.querySelectorAll(".nav-btn").forEach(b=>{
    b.addEventListener("click",()=>switchView(b.dataset.view));
  });

  // Příjem a výdej
  ["in","out"].forEach(mode=>{
    const form=movementElement("form",mode);
    const cancel=movementElement("cancel",mode);
    const part=movementElement("part",mode);
    const location=movementElement("location",mode);

    if(form) {
      form.addEventListener("submit",e=>saveMovement(e,mode));
    }

    if(cancel) {
      cancel.addEventListener("click",()=>switchView("stock"));
    }

    if(part) {
      part.addEventListener("change",()=>updateMovementLocations(mode));
    }

    if(location) {
      location.addEventListener("change",()=>{
        const fields=movementElement("newLocationFields",mode);

        if(fields) {
          fields.classList.toggle("hidden",location.value!=="new");
        }
      });
    }
  });

  // Detail dílu
  on("closeDetail","click",()=>$("detailDialog")?.close());
  on("detailClose2","click",()=>$("detailDialog")?.close());

  on("detailEdit","click",()=>{
    const id=currentDetailId;
    $("detailDialog")?.close();

    if(requireWriter()) openPart(id);
  });

  on("detailStockIn","click",()=>openMovementFromDetail("in"));
  on("detailStockOut","click",()=>openMovementFromDetail("out"));

  // Tisk
  on("detailPrint","click",()=>showPrint(currentDetailId));
  on("closePrint","click",()=>$("printDialog")?.close());
  on("printBtn","click",()=>window.print());

  // Historie
  on("historySearch","input",renderHistory);
  on("historyFilter","change",renderHistory);
}


// =========================================================
// STAV A UŽIVATEL
// =========================================================

function setState(s) {
  const el=$("saveState");
  if(el) el.textContent=s;
}

function updateIdentity() {
  const el=$("userIdentity");
  if(!el) return;

  el.textContent=currentUser
    ? `${currentUser.firstName} ${currentUser.lastName}`
    : "";

  updateUserSettings();
}

function updateUserSettings() {
  const configured=!!currentUser;

  const profileInfo=$("userProfileInfo");
  if(profileInfo) profileInfo.classList.toggle("hidden",!configured);

  const loginFields=$("loginFields");
  if(loginFields) loginFields.classList.toggle("hidden",configured);

  const saveButton=$("saveSettingsButton");
  if(saveButton) saveButton.classList.toggle("hidden",configured);

  const nameField=$("settingsUserName");
  if(nameField) {
    nameField.textContent=configured
      ? `${currentUser.lastName} ${currentUser.firstName}`
      : "Přihlásit";
  }

  const accountType=$("settingsAccountType");
  if(accountType) {
    accountType.textContent=configured
      ? (currentRole==="admin" ? "Administrátor" : "Uživatel skladu")
      : "";
  }

  const firstName=$("settingsFirstName");
  if(firstName) {
    firstName.textContent=configured
      ? currentUser.firstName
      : "Přihlásit";
  }

  const lastName=$("settingsLastName");
  if(lastName) {
    lastName.textContent=configured
      ? currentUser.lastName
      : "";
  }

  const role=$("settingsRole");
  if(role) {
    role.textContent=
      currentAccessStatus==="deactive"
        ? "Deaktivováno"
        : currentAccessStatus==="removed"
          ? "Přístup odebrán"
          : roleLabel(currentRole);
  }

  const loginField=$("settingsLastLogin");
  if(loginField) {
    loginField.textContent=currentLastLogin
      ? dateTimeText(currentLastLogin)
      : "—";
  }

  const operationField=$("settingsOperationCount");
  if(operationField) {
    const userName=currentUser
      ? `${currentUser.firstName} ${currentUser.lastName}`
      : "";

    const count=historyItems.filter(h=>h.user===userName).length;

    operationField.textContent=
      !configured || currentAccessStatus==="deactive"
        ? "—"
        : String(count);
  }

  const versionField=$("appVersion");
  if(versionField) {
    versionField.textContent="—";
  }

  const logoutButton=$("logoutBtn");
  if(logoutButton) {
    logoutButton.classList.toggle("hidden",!configured);
  }
}

function toast(s) {
  const t=$("toast");
  if(!t) {
    console.warn(s);
    return;
  }

  t.textContent=s;
  t.classList.add("show");

  setTimeout(()=>t.classList.remove("show"),2800);
}

function requireWriter() {
  if(!currentUser) {
    openSettings();
    toast("Nejdříve se přihlas ke skladu.");
    return false;
  }

  if(!hasActiveAccess()) {
    openSettings();
    toast("Tvůj účet je deaktivován.");
    return false;
  }

  if(!isWriter()) {
    toast("Tento přístupový klíč umožňuje pouze prohlížení.");
    return false;
  }

  return true;
}


// =========================================================
// NASTAVENÍ A PŘIHLÁŠENÍ
// =========================================================

function fillSettings(p) {
  const token=$("accessToken");
  if(token) token.value=p.token||"";
}

function openSettings() {
  fillSettings(profile());
  updateUserSettings();

  const dialog=currentUser
    ? $("settingsDialog")
    : $("loginDialog");

  if(dialog && !dialog.open) {
    dialog.showModal();
  }
}

async function saveSettings(e) {
  e.preventDefault();

  const token=$("accessToken")?.value.trim();

  if(!token) {
    toast("Vlož GitHub token.");
    return;
  }

  localStorage.setItem(PROFILE_KEY,JSON.stringify({token}));

  try {
    const allowed=await loadAll();

    if(!allowed) {
      openSettings();
      return;
    }

    $("loginDialog")?.close();
    updateUserSettings();
    toast("Přístup byl uložen.");

  } catch(err) {
    setState("Chyba připojení");
    toast(err.message);
    openSettings();
  }
}


// =========================================================
// GITHUB API
// =========================================================

function apiHeaders() {
  const p=profile();

  return {
    "Accept":"application/vnd.github+json",
    "Authorization":`Bearer ${p.token}`,
    "X-GitHub-Api-Version":"2022-11-28",
    "Content-Type":"application/json"
  };
}

function apiUrl(path,repoName=REPO_NAME) {
  return `https://api.github.com/repos/${encodeURIComponent(REPO_OWNER)}/${encodeURIComponent(repoName)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
}

async function apiGet(path,repoName=REPO_NAME) {
  const r=await fetch(apiUrl(path,repoName),{headers:apiHeaders()});

  if(r.status===404) return null;

  const j=await r.json();

  if(!r.ok) throw new Error(j.message||`GitHub API: ${r.status}`);

  return j;
}

function decodeContent(s) {
  const binary=atob(s.replace(/\n/g,""));
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

function encodeContent(s) {
  const bytes=new TextEncoder().encode(s);
  let binary="";

  bytes.forEach(b=>binary+=String.fromCharCode(b));

  return btoa(binary);
}

async function readJson(path,fallback) {
  const f=await apiGet(path);

  if(!f) return {value:fallback,sha:null};

  return {
    value:JSON.parse(decodeContent(f.content)),
    sha:f.sha
  };
}

async function sha256Token(token) {
  if(!window.crypto?.subtle) {
    throw new Error("Pro výpočet SHA-256 je potřeba zabezpečené připojení HTTPS.");
  }

  const bytes=new TextEncoder().encode(token);
  const digest=await crypto.subtle.digest("SHA-256",bytes);

  return [...new Uint8Array(digest)]
    .map(b=>b.toString(16).padStart(2,"0"))
    .join("");
}


// =========================================================
// OVĚŘENÍ ROLE A STAVU ÚČTU
// =========================================================

async function loadRole() {
  currentRole="read";
  currentUser=null;
  currentLastLogin=null;
  currentAccessStatus="";

  const p=profile();

  const repoResponse=await fetch(
    `https://api.github.com/repos/${encodeURIComponent(REPO_OWNER)}/${encodeURIComponent(REPO_NAME)}`,
    {headers:apiHeaders()}
  );

  if(repoResponse.status===404) {
    throw new Error("GitHub token nemá přístup k soukromému repozitáři safina_Warehouse_Data. Zkontroluj, že token má v Repository access vybraný tento repozitář a oprávnění Contents: Read-only nebo Read and write.");
  }

  const repoInfo=await repoResponse.json();

  if(!repoResponse.ok) {
    throw new Error(repoInfo.message||`Nelze ověřit přístup k repozitáři (${repoResponse.status}). Zkontroluj oprávnění tokenu.`);
  }

  const [usersFile,tokenHash]=await Promise.all([
    apiGet("users.json"),
    sha256Token(p.token)
  ]);

  if(!usersFile?.content) {
    throw new Error(`Repozitář je dostupný, ale GitHub nenašel users.json v kořeni výchozí větve (${repoInfo.default_branch||"neznámá větev"}). Zkontroluj název souboru, jeho umístění a výchozí větev.`);
  }

  const data=JSON.parse(decodeContent(usersFile.content));

  const match=(Array.isArray(data.users)?data.users:[]).find(
    u=>typeof u.tokenHash==="string"&&u.tokenHash.toLowerCase()===tokenHash
  );

  usersData=data;
  usersFileSha=usersFile.sha;

  if(!match) {
    currentAccessStatus="removed";
    updateIdentity();
    return false;
  }

  if(!match.firstName||!match.lastName) {
    throw new Error("Uživatel v users.json nemá vyplněné jméno a příjmení.");
  }

  if(!["read","write","admin"].includes(match.role)) {
    throw new Error("Uživatel v users.json má neplatnou roli.");
  }

  currentUser={
    firstName:match.firstName,
    lastName:match.lastName
  };

  currentRole=match.role;

  const loginKey=`sklad-last-login-${tokenHash}`;

  if(!isUserActive(match)) {
    currentAccessStatus="deactive";
    currentLastLogin=localStorage.getItem(loginKey);
    updateIdentity();
    return false;
  }

  currentLastLogin=new Date().toISOString();
  localStorage.setItem(loginKey,currentLastLogin);

  updateIdentity();
  return true;
}


// =========================================================
// NAČTENÍ DAT
// =========================================================

async function loadAll() {
  setState("Ověřuji přístup…");

  const allowed=await loadRole();

  if(!allowed) {
    parts=[];
    historyItems=[];
    fileState={data:null,history:null};

    setState(
      currentAccessStatus==="deactive"
        ? "Deaktivováno"
        : "Přístup odebrán"
    );

    applyPermissions();
    render();
    updateUserSettings();

    return false;
  }

  setState("Načítám GitHub…");

  const [d,h]=await Promise.all([
    readJson("data.json",{parts:[]}),
    readJson("history.json",{items:[]})
  ]);

  parts=(d.value.parts||[]).map(p=>({
    ...p,
    locations:(p.locations||[]).map(l=>({
      ...l,
      stockedAt:l.stockedAt||p.stockedAt||""
    }))
  }));

  historyItems=h.value.items||[];

  fileState={
    data:d.sha,
    history:h.sha
  };

  setState(`GitHub · ${isWriter()?"Správa":"Pouze prohlížení"}`);

  applyPermissions();
  render();
  updateUserSettings();

  return true;
}


// =========================================================
// POZVÁNKY
// =========================================================

function base64UrlEncode(value) {
  const bytes=new TextEncoder().encode(value);
  let binary="";

  bytes.forEach(b=>binary+=String.fromCharCode(b));

  return btoa(binary)
    .replace(/\+/g,"-")
    .replace(/\//g,"_")
    .replace(/=+$/g,"");
}

function base64UrlDecode(value) {
  const raw=value.replace(/-/g,"+").replace(/_/g,"/");
  const binary=atob(raw+"=".repeat((4-raw.length%4)%4));

  return new TextDecoder().decode(
    Uint8Array.from(binary,c=>c.charCodeAt(0))
  );
}

function readInviteFromUrl() {
  const raw=location.hash.startsWith("#invite=")
    ? location.hash.slice(8)
    : "";

  if(!raw) return;

  try {
    const data=JSON.parse(base64UrlDecode(raw));

    if(
      data&&
      typeof data.token==="string"&&
      data.token&&
      data.firstName&&
      data.lastName&&
      ["read","write","admin"].includes(data.role)
    ) {
      pendingInvite=data;
    }
  } catch(e) {
    console.warn("Neplatná pozvánka.");
  }

  history.replaceState(null,"",location.pathname+location.search);
}









async function verifyPendingInvite() {
  if(!pendingInvite?.inviteExpiresAt) {
    throw new Error("Pozvánka nemá nastavenou platnost. Požádej správce o novou.");
  }

  const expires=Date.parse(pendingInvite.inviteExpiresAt);

  if(!Number.isFinite(expires)||Date.now()>expires) {
    throw new Error("Platnost pozvánky vypršela. Požádej správce o novou.");
  }

  const file=await apiGet("users.json");

  if(!file?.content) {
    throw new Error("Nelze ověřit pozvánku v users.json.");
  }

  const data=JSON.parse(decodeContent(file.content));
  const hash=await sha256Token(pendingInvite.token);

  const match=(Array.isArray(data.users)?data.users:[]).find(
    u=>typeof u.tokenHash==="string"&&u.tokenHash.toLowerCase()===hash
  );

  if(!match) {
    throw new Error("Pozvánka již není platná nebo byl uživatel odebrán.");
  }

  if(!isUserActive(match)) {
    throw new Error("Tento účet je deaktivován.");
  }

  if(match.inviteExpiresAt!==pendingInvite.inviteExpiresAt) {
    throw new Error("Pozvánka neodpovídá záznamu v users.json.");
  }

  if(
    match.firstName!==pendingInvite.firstName||
    match.lastName!==pendingInvite.lastName||
    match.role!==pendingInvite.role
  ) {
    throw new Error("Údaje pozvánky neodpovídají záznamu uživatele.");
  }
}


async function showPendingInviteDialog() {
  if(!pendingInvite) return;

  const dialog=$("inviteDialog");

  if(!dialog) {
    console.warn("Pozvánkový dialog nebyl nalezen.");
    setState("Pozvánka čeká na zobrazení");
    return;
  }

  const description=$("inviteDescription");
  const saveStatus=$("inviteSaveStatus");

  if(description) {
    description.textContent=
      `Pozvánka pro ${pendingInvite.firstName} ${pendingInvite.lastName} · ${roleLabel(pendingInvite.role)}.`;
  }

  if(saveStatus) {
    saveStatus.textContent="";
  }

  if(!dialog.open) {
    dialog.showModal();
  }
}




async function saveInvite() {
  if(!pendingInvite) return;

  const button=$("saveInvite");
  if(!button) return;

  const oldProfile=profile();

  button.disabled=true;
  button.textContent="Ukládám…";

  const saveStatus=$("inviteSaveStatus");
  if(saveStatus) {
    saveStatus.textContent="Ověřuji platnost pozvánky…";
  }

  try {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({token:pendingInvite.token})
    );

    await verifyPendingInvite();

    if(saveStatus) {
      saveStatus.textContent="Ověřuji přístup ke skladu…";
    }

    const allowed=await loadAll();

    if(!allowed) {
      throw new Error(
        currentAccessStatus==="deactive"
          ? "Účet je deaktivován."
          : "Přístup k účtu byl odebrán."
      );
    }

    const name=`${pendingInvite.firstName} ${pendingInvite.lastName}`;

    pendingInvite=null;

    $("inviteDialog")?.close();

    toast(`Přístup pro ${name} byl uložen.`);

    updateUserSettings();

  } catch(e) {
    if(oldProfile.token) {
      localStorage.setItem(PROFILE_KEY,JSON.stringify(oldProfile));
    } else {
      localStorage.removeItem(PROFILE_KEY);
    }

    if(saveStatus) {
      saveStatus.textContent=
        `Přístup se nepodařilo uložit: ${e.message}`;
    }

    toast(`Pozvánku se nepodařilo aktivovat: ${e.message}`);

  } finally {
    button.disabled=false;
    button.textContent="Uložit přístup";
  }
}

function logout() {
  if(!confirm("Opravdu se chceš odhlásit z tohoto zařízení? Pro další přihlášení bude potřeba znovu vložit GitHub token.")) {
    return;
  }

  localStorage.removeItem(PROFILE_KEY);
  window.location.reload();
}


// =========================================================
// SPRÁVA UŽIVATELŮ
// =========================================================

async function openUsers(mode="list") {
  if(!isAdmin()) {
    toast("Správa uživatelů je dostupná pouze správci.");
    return;
  }

  const settingsDialog=$("settingsDialog");
  const listDialog=$("listUsersDialog");
  const addDialog=$("addUserDialog");

  if(!listDialog||!addDialog) {
    toast("Chybí dialog správy uživatelů. Zkontroluj list-users.html a add-user.html.");
    return;
  }

  try {
    await refreshUsers();

    if(settingsDialog?.open) {
      settingsDialog.close();
    }

    if(mode==="list") {
      if(addDialog.open) {
        addDialog.close();
      }

      usersDraft=JSON.parse(JSON.stringify(usersData));

      renderUsers();

      if(!listDialog.open) {
        listDialog.showModal();
      }

      return;
    }

    if(mode==="add") {
      if(listDialog.open) {
        listDialog.close();
      }

      usersDraft=null;

      const userForm=$("userForm");
      const inviteResult=$("inviteResult");
      const userSaveStatus=$("userSaveStatus");

      if(!userForm||!inviteResult) {
        throw new Error("Chybí formulář pro přidání uživatele.");
      }

      userForm.reset();
      userForm.classList.remove("hidden");

      inviteResult.classList.add("hidden");

      if(userSaveStatus) {
        userSaveStatus.textContent="";
      }

      if(!addDialog.open) {
        addDialog.showModal();
      }

      const firstName=$("newUserFirst");

      if(firstName) {
        firstName.focus();
        firstName.scrollIntoView({
          behavior:"smooth",
          block:"center"
        });
      }
    }

  } catch(e) {
    toast(`Uživatele se nepodařilo načíst: ${e.message}`);
  }
}

async function refreshUsers() {
  const f=await apiGet("users.json");

  if(!f?.content) {
    throw new Error("Nelze načíst users.json.");
  }

  usersData=JSON.parse(decodeContent(f.content));
  usersFileSha=f.sha;

  if(!Array.isArray(usersData.users)) {
    usersData.users=[];
  }
}

function closeUsersDialog() {
  $("listUsersDialog")?.close();
  usersDraft=null;
}

function renderUsers() {
  const list=$("usersList");

  if(!list) {
    toast("Chybí seznam uživatelů.");
    return;
  }

  const data=usersDraft||usersData;

  const sorted=data.users
    .map((u,index)=>({u,index}))
    .sort((a,b)=>{
      const ar=a.u.role==="admin"?0:1;
      const br=b.u.role==="admin"?0:1;

      if(ar!==br) return ar-br;

      const aw=(a.u.firstName==="Josef"&&a.u.lastName==="Wajsar")?0:1;
      const bw=(b.u.firstName==="Josef"&&b.u.lastName==="Wajsar")?0:1;

      return aw-bw||a.u.lastName.localeCompare(b.u.lastName,"cs");
    });

  list.innerHTML=sorted.map(({u,index})=>{
    const active=isUserActive(u);

    return `
      <div class="user-row" data-index="${index}">
        <div class="user-row-info">
          <strong>${esc(u.firstName)} ${esc(u.lastName)}</strong>
          <small>${roleLabel(u.role)} · ${active?"Aktivní":"Deaktivováno"}</small>
        </div>

        <select class="user-role" aria-label="Role uživatele">
          <option value="read" ${u.role==="read"?"selected":""}>Read</option>
          <option value="write" ${u.role==="write"?"selected":""}>Write</option>
          <option value="admin" ${u.role==="admin"?"selected":""}>Admin</option>
        </select>

        <div class="user-actions">
          <button type="button" class="btn btn-light user-toggle">
            ${active?"Deaktivovat":"Aktivovat"}
          </button>

          <button type="button" class="btn btn-light user-remove" title="Odebrat uživatele" aria-label="Odebrat uživatele">
            ×
          </button>
        </div>
      </div>
    `;
  }).join("")||'<p class="muted">Zatím nejsou přidáni žádní uživatelé.</p>';

  list.querySelectorAll(".user-role").forEach(el=>{
    el.onchange=async()=>{
      const i=Number(el.closest(".user-row").dataset.index);
      const user=data.users[i];
      const ownHash=await sha256Token(profile().token);

      if(user.tokenHash===ownHash&&el.value!=="admin") {
        el.value=user.role;
        toast("Roli právě přihlášeného správce nelze změnit.");
        return;
      }

      if(
        user.role==="admin"&&
        el.value!=="admin"&&
        isUserActive(user)&&
        data.users.filter(x=>x.role==="admin"&&isUserActive(x)).length===1
      ) {
        el.value=user.role;
        toast("Nelze odebrat roli poslednímu aktivnímu správci.");
        return;
      }

      user.role=el.value;

      renderUsers();
      toast("Změna role čeká na uložení.");
    };
  });

  list.querySelectorAll(".user-toggle").forEach(el=>{
    el.onclick=async()=>{
      const i=Number(el.closest(".user-row").dataset.index);
      const user=data.users[i];
      const ownHash=await sha256Token(profile().token);

      if(user.tokenHash===ownHash) {
        toast("Vlastní účet správce nelze deaktivovat.");
        return;
      }

      const active=isUserActive(user);

      if(
        active&&
        user.role==="admin"&&
        data.users.filter(x=>x.role==="admin"&&isUserActive(x)).length===1
      ) {
        toast("Nelze deaktivovat posledního aktivního správce.");
        return;
      }

      user.status=active?"deactive":"active";

      renderUsers();

      toast(
        active
          ? "Deaktivace čeká na uložení."
          : "Aktivace čeká na uložení."
      );
    };
  });

  list.querySelectorAll(".user-remove").forEach(el=>{
    el.onclick=async()=>{
      const i=Number(el.closest(".user-row").dataset.index);
      const u=data.users[i];

      if(!confirm(`Odebrat uživatele ${u.firstName} ${u.lastName}?`)) {
        return;
      }

      if(u.tokenHash===await sha256Token(profile().token)) {
        toast("Nemůžeš odebrat právě přihlášený účet.");
        return;
      }

      if(
        u.role==="admin"&&
        isUserActive(u)&&
        data.users.filter(x=>x.role==="admin"&&isUserActive(x)).length===1
      ) {
        toast("Nelze odebrat posledního aktivního správce.");
        return;
      }

      data.users.splice(i,1);

      renderUsers();
      toast("Odebrání uživatele čeká na uložení.");
    };
  });
}

async function saveUsersDraft() {
  if(!isAdmin()) {
    toast("Pouze správce může měnit uživatele.");
    return;
  }

  if(!usersDraft) {
    toast("Nejsou připraveny žádné změny.");
    return;
  }

  const button=$("saveUsersList");

  if(button) {
    button.disabled=true;
    button.textContent="Ukládám…";
  }

  const original=usersData;

  try {
    const ownHash=await sha256Token(profile().token);

    const ownUser=usersDraft.users.find(
      u=>u.tokenHash===ownHash
    );

    if(!ownUser||ownUser.role!=="admin"||!isUserActive(ownUser)) {
      throw new Error("Vlastní účet správce nelze odebrat, deaktivovat ani mu změnit roli.");
    }

    const activeAdmins=usersDraft.users.filter(
      u=>u.role==="admin"&&isUserActive(u)
    );

    if(activeAdmins.length===0) {
      throw new Error("Nelze uložit seznam bez alespoň jednoho aktivního správce.");
    }

    usersData=usersDraft;

    await saveUsers();

    usersDraft=null;

    $("listUsersDialog")?.close();

    toast("Změny uživatelů byly uloženy.");

  } catch(e) {
    usersData=original;

    renderUsers();
    toast(`Změny se nepodařilo uložit: ${e.message}`);

  } finally {
    if(button) {
      button.disabled=false;
      button.textContent="Uložit";
    }
  }
}

async function saveUsers() {
  if(!isAdmin()) {
    throw new Error("Pouze správce může měnit uživatele.");
  }

  const sha=await writeFile(
    "users.json",
    JSON.stringify(usersData,null,2),
    usersFileSha
  );

  usersFileSha=sha;
}

async function saveUser(e) {
  e.preventDefault();

  if(!isAdmin()) {
    toast("Pouze správce může přidávat uživatele.");
    return;
  }

  const firstName=$("newUserFirst").value.trim();
  const lastName=$("newUserLast").value.trim();
  const role=$("newUserRole").value;
  const token=$("newUserToken").value.trim();
  const button=$("saveUserButton");

  $("userSaveStatus").textContent="";

  if(!firstName||!lastName||!token) {
    $("userSaveStatus").textContent="Vyplň jméno, příjmení a GitHub token.";
    return;
  }

  button.disabled=true;
  button.textContent="Ukládám na GitHub…";

  try {
    const tokenHash=await sha256Token(token);

    if(usersData.users.some(u=>u.tokenHash===tokenHash)) {
      throw new Error("Tento token už je přiřazen jinému uživateli.");
    }

    const inviteExpiresAt=new Date(
      Date.now()+5*60*1000
    ).toISOString();

    const user={
      tokenHash,
      firstName,
      lastName,
      role,
      status:"active",
      inviteExpiresAt
    };

    usersData.users.push(user);

    try {
      await saveUsers();
    } catch(writeError) {
      usersData.users.pop();
      throw writeError;
    }

    const invite=base64UrlEncode(
      JSON.stringify({
        token,
        firstName,
        lastName,
        role,
        inviteExpiresAt
      })
    );

    const inviteUrl = new URL("invite.html", location.href); inviteUrl.hash = `invite=${invite}`;  const url = inviteUrl.href;

    $("inviteLink").value=url;
    $("newUserToken").value="";

    $("userForm").classList.add("hidden");
    $("inviteResult").classList.remove("hidden");

    $("userSaveStatus").textContent=
      `Uživatel ${firstName} ${lastName} byl uložen do soukromého GitHub repozitáře. Pozvánka je platná 5 minut.`;

    renderUsers();

    toast("Uživatel byl uložen do GitHubu. Pozvánka je připravena.");

  } catch(err) {
    $("userSaveStatus").textContent=`Uložení se nezdařilo: ${err.message}`;
    toast(`Uložení se nezdařilo: ${err.message}`);

  } finally {
    button.disabled=false;
    button.textContent="Uložit uživatele";
  }
}

async function copyInviteLink() {
  const value=$("inviteLink").value;

  if(!value) return;

  try {
    await navigator.clipboard.writeText(value);
    toast("Odkaz na pozvánku byl zkopírován.");

  } catch(e) {
    $("inviteLink").focus();
    $("inviteLink").select();

    const ok=document.execCommand("copy");

    toast(
      ok
        ? "Odkaz na pozvánku byl zkopírován."
        : "Odkaz označen. Zkopíruj jej ručně."
    );
  }
}


async function shareInviteLink() {
  const url=$("inviteLink").value;

  if(!url) return;

  if(!url.includes("#invite=")) {
    toast("Pozvánkový odkaz není platný.");
    return;
  }

  const name=`${$("newUserFirst").value.trim()} ${$("newUserLast").value.trim()}`.trim();

  const shareData={
    title:"Pozvánka do skladové aplikace",
    text:`Ahoj${name?` ${name}`:""}, zde je tvůj přístup do skladové aplikace.

Otevři odkaz a klikni na Připojit:

${url}`
  };

  try {
    if(navigator.share) {
      await navigator.share(shareData);
      toast("Pozvánka byla předána ke sdílení.");
    } else {
      await navigator.clipboard.writeText(shareData.text);
      toast("Pozvánka byla zkopírována.");
    }
  } catch(e) {
    if(e.name!=="AbortError") {
      await navigator.clipboard.writeText(shareData.text);
      toast("Pozvánka byla zkopírována.");
    }
  }
}


// =========================================================
// UKLÁDÁNÍ SOUBORŮ
// =========================================================

async function writeFile(path,content,expectedSha) {
  if(!requireWriter()) {
    throw new Error("Nemáš oprávnění k zápisu.");
  }

  const current=await apiGet(path);

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
  const current=await apiGet(path);

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

  document.querySelectorAll("#suppliers .remove-btn").forEach(b=>{
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


// =========================================================
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

  $("stockView").classList.toggle("hidden",view!=="stock");

  movementElement("view","in").classList.toggle("hidden",view!=="in");
  movementElement("view","out").classList.toggle("hidden",view!=="out");

  $("historyView").classList.toggle("hidden",view!=="history");

  $("pageTitle").textContent=({
    stock:"Přehled skladu",
    in:"Příjem",
    out:"Výdej",
    history:"Historie pohybů"
  })[view];

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


// =========================================================
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
    <button type="button" class="remove-btn">×</button>
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
}


// =========================================================
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


// =========================================================
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


// =========================================================
// QR KÓD, SKENER A TISK
// =========================================================

function loadQrScannerLibrary() {
  if(window.jsQR) {
    return Promise.resolve();
  }

  if(qrScannerLibrary) {
    return qrScannerLibrary;
  }

  qrScannerLibrary=new Promise((resolve,reject)=>{
    const script=document.createElement("script");

    script.src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";

    script.onload=()=>{
      if(window.jsQR) {
        resolve();
      } else {
        qrScannerLibrary=null;
        reject(new Error("Knihovna QR skeneru se nenačetla."));
      }
    };

    script.onerror=()=>{
      qrScannerLibrary=null;
      reject(new Error("Nepodařilo se načíst knihovnu QR skeneru."));
    };

    document.head.appendChild(script);
  });

  return qrScannerLibrary;
}

function createQrScannerDialog() {
  let dialog=$("qrScannerDialog");

  if(dialog) return dialog;

  dialog=document.createElement("dialog");
  dialog.id="qrScannerDialog";

  dialog.style.cssText=`
    width:min(440px,calc(100% - 32px));
    max-height:90vh;
    padding:20px;
    border:0;
    border-radius:16px;
    background:white;
    color:#172033;
  `;

  dialog.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;">
      <h2 style="margin:0;font-size:20px;">Skenovat štítek</h2>

      <button
        type="button"
        id="closeQrScanner"
        class="btn btn-light"
        aria-label="Zavřít"
      >×</button>
    </div>

    <div style="position:relative;overflow:hidden;border-radius:12px;background:#111;">
      <video
        id="qrScannerVideo"
        autoplay
        muted
        playsinline
        style="display:block;width:100%;min-height:220px;object-fit:cover;"
      ></video>

      <div style="
        position:absolute;
        left:15%;
        top:20%;
        width:70%;
        height:60%;
        border:3px solid #22c55e;
        border-radius:12px;
        pointer-events:none;
      "></div>
    </div>

    <p id="qrScannerStatus" style="margin:16px 0 0;text-align:center;">
      Připravuji kameru…
    </p>

    <button
      type="button"
      id="qrScannerCancel"
      class="btn btn-light"
      style="width:100%;margin-top:12px;"
    >Zavřít skener</button>

    <canvas id="qrScannerCanvas" hidden></canvas>
  `;

  document.body.appendChild(dialog);

  $("closeQrScanner").addEventListener("click",()=>{
    dialog.close();
  });

  $("qrScannerCancel").addEventListener("click",()=>{
    dialog.close();
  });

  dialog.addEventListener("close",stopQrScanner);

  return dialog;
}

async function openQrScanner() {
  if(!hasActiveAccess()) {
    openSettings();
    return;
  }

  if(!navigator.mediaDevices?.getUserMedia) {
    toast("Kamera není dostupná. Aplikaci otevři přes HTTPS.");
    return;
  }

  const dialog=createQrScannerDialog();

  if(dialog.open) return;

  dialog.showModal();

  const status=$("qrScannerStatus");
  const video=$("qrScannerVideo");

  status.textContent="Načítám skener…";

  try {
    await loadQrScannerLibrary();

    if(!dialog.open) return;

    status.textContent="Čekám na povolení kamery…";

    qrScannerStream=await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{
        facingMode:{ideal:"environment"}
      }
    });

    if(!dialog.open) {
      stopQrScanner();
      return;
    }

    video.srcObject=qrScannerStream;

    await video.play();

    status.textContent="Namiř kameru na QR kód štítku.";

    scanQrFrame();

  } catch(e) {
    console.error("QR skener:",e);

    if(!dialog.open) return;

    status.textContent=
      e.name==="NotAllowedError"
        ? "Přístup ke kameře byl zamítnut. Povol kameru v nastavení prohlížeče."
        : e.name==="NotFoundError"
          ? "Nepodařilo se najít kameru."
          : `Skener se nepodařilo spustit: ${e.message}`;

    stopQrScanner();
  }
}

function scanQrFrame() {
  const video=$("qrScannerVideo");
  const canvas=$("qrScannerCanvas");

  if(!video||!canvas||!video.srcObject) return;

  if(video.readyState===video.HAVE_ENOUGH_DATA) {
    const context=canvas.getContext("2d",{
      willReadFrequently:true
    });

    canvas.width=video.videoWidth;
    canvas.height=video.videoHeight;

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const image=context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

    const code=window.jsQR(
      image.data,
      image.width,
      image.height,
      {
        inversionAttempts:"attemptBoth"
      }
    );

    if(code?.data) {
      const id=code.data.trim();

      stopQrScanner();

      $("qrScannerDialog")?.close();

      const part=parts.find(p=>p.id===id);

      if(part) {
        selectedPartId=part.id;
        render();
        showDetail(part.id);
      } else {
        toast(`QR kód obsahuje ID ${id}, ale karta nebyla nalezena.`);
      }

      return;
    }
  }

  qrScannerFrame=requestAnimationFrame(scanQrFrame);
}

function stopQrScanner() {
  if(qrScannerFrame!==null) {
    cancelAnimationFrame(qrScannerFrame);
    qrScannerFrame=null;
  }

  if(qrScannerStream) {
    qrScannerStream.getTracks().forEach(track=>track.stop());
    qrScannerStream=null;
  }

  const video=$("qrScannerVideo");

  if(video) {
    video.pause();
    video.srcObject=null;
  }
}


function showPrint(id) {
  const p=parts.find(x=>x.id===id);

  if(!p) return;

  const labelData={
    id:p.id,
    name:p.name||"",
    partNumber:p.partNumber||"",
    suppliers:(p.suppliers||[])
      .filter(s=>s?.name)
      .map(s=>({name:s.name})),
    machine:p.machine||""
  };

  localStorage.setItem(
    "sklad-print-label",
    JSON.stringify(labelData)
  );

  const printWindow=window.open(
    new URL("print-label.html",window.location.href).href,
    "_blank"
  );

  if(!printWindow) {
    localStorage.removeItem("sklad-print-label");
    toast("Povol vyskakovací okna pro tisk štítku.");
  }
}


// =========================================================
// SPUŠTĚNÍ APLIKACE
// =========================================================

init();
