
const PROFILE_KEY = "sklad-profile-v1";
const REPO_OWNER = "PepikVaio";
const REPO_NAME = "safina_Warehouse_Data";
const $ = id => document.getElementById(id);

let parts = [], historyItems = [], selectedPartId = null, movementMode = "in", currentDetailId = null;
let fileState = { data: null, history: null };
let currentRole = "read";
let currentUser = null;
let usersData = { users: [] }, usersFileSha = null, pendingInvite = null;
let currentImageData = null;
let lastPartTap = { id: null, at: 0 };
let currentLastLogin = null;

const total = p => (p.locations || []).reduce((n,l)=>n + (Number(l.qty)||0),0);

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
const isWriter = () => currentRole === "write" || currentRole === "admin";
const isAdmin = () => currentRole === "admin";

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
      await loadAll();
    } catch(e) {
      setState("Chyba připojení");
      toast(e.message);
    }
  } else {
    setState("Nastav připojení");
    openSettings();
  }

  render();

  if(pendingInvite) {
    $("inviteDescription").textContent =
      `Pozvánka pro ${pendingInvite.firstName} ${pendingInvite.lastName} · ${roleLabel(pendingInvite.role)}.`;

    $("inviteSaveStatus").textContent="";
    $("inviteDialog").showModal();
  }
}


// =========================================================
// UDÁLOSTI
// =========================================================

function bind() {
  $("settingsBtn").onclick=openSettings;
  $("userManagementBtn").onclick=openUsers;
  $("closeUsers").onclick=()=>$("usersDialog").close();
  $("userForm").onsubmit=saveUser;
  $("copyInvite").onclick=shareInviteLink;
  $("copyInviteOnly").onclick=copyInviteLink;
  $("logoutBtn").onclick=logout;
  $("saveInvite").onclick=saveInvite;

  $("closeSettings").onclick=$("closeSettings2").onclick=()=>$("settingsDialog").close();

  $("settingsForm").onsubmit=saveSettings;

  // Uložení nového GitHub tokenu v profilu.
  $("saveProfileToken").onclick=saveProfileToken;

  // Z pole tokenu není možné kopírovat ani vyjímat.
  // Vkládání nového tokenu zůstává povolené.
  const profileTokenField=$("profileToken");

  if(profileTokenField) {
    profileTokenField.oncopy=e=>e.preventDefault();
    profileTokenField.oncut=e=>e.preventDefault();
  }

  $("newPartBtn").onclick=()=>{
    if(requireWriter()) openPart();
  };

  $("closeDialog").onclick=$("cancelPart").onclick=()=>$("partDialog").close();
  $("partForm").onsubmit=savePart;

  $("addSupplier").onclick=()=>addSupplierRow();
  $("partImage").onchange=previewImage;

  $("searchInput").oninput=render;
  $("stockFilter").onchange=render;

  document.querySelectorAll(".nav-btn").forEach(b=>{
    b.onclick=()=>switchView(b.dataset.view);
  });

  // Samostatné události pro příjem a výdej.
  ["in","out"].forEach(mode=>{
    movementElement("form",mode).onsubmit=e=>saveMovement(e,mode);

    movementElement("cancel",mode).onclick=()=>switchView("stock");

    movementElement("part",mode).onchange=()=>updateMovementLocations(mode);

    movementElement("location",mode).onchange=()=>{
      const fields=movementElement("newLocationFields",mode);
      if(fields) {
        fields.classList.toggle(
          "hidden",
          movementElement("location",mode).value!=="new"
        );
      }
    };
  });

  $("closeDetail").onclick=$("detailClose2").onclick=()=>$("detailDialog").close();

  $("detailEdit").onclick=()=>{
    const id=currentDetailId;
    $("detailDialog").close();
    if(requireWriter()) openPart(id);
  };

  $("detailStockIn").onclick=()=>openMovementFromDetail("in");
  $("detailStockOut").onclick=()=>openMovementFromDetail("out");

  $("detailPrint").onclick=()=>showPrint(currentDetailId);
  $("closePrint").onclick=()=>$("printDialog").close();
  $("printBtn").onclick=()=>window.print();

  $("historySearch").oninput=renderHistory;
  $("historyFilter").onchange=renderHistory;
}


// =========================================================
// STAV A UŽIVATEL
// =========================================================

function setState(s) {
  $("saveState").textContent=s;
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

  $("userProfileInfo").classList.toggle("hidden",!configured);
  $("loginFields").classList.toggle("hidden",configured);
  $("saveSettingsButton").classList.toggle("hidden",configured);

  // Dynamické jméno v horním pásu – příjmení a potom jméno.
  const nameField=$("settingsUserName");
  if(nameField) {
    nameField.textContent=configured
      ? `${currentUser.lastName} ${currentUser.firstName}`
      : "Uživatel";
  }

  // Označení typu účtu pod horním pásem.
  const accountType=$("settingsAccountType");
  if(accountType) {
    accountType.textContent=currentRole==="admin"
      ? "Správce skladu"
      : "Uživatel skladu";
  }

  $("settingsFirstName").textContent=currentUser?.firstName||"—";
  $("settingsLastName").textContent=currentUser?.lastName||"—";
  $("settingsRole").textContent=roleLabel(currentRole);

  // Pole pro nový token zůstává prázdné.
  // Stávající token se do něj nikdy nevypisuje.
  const tokenField=$("profileToken");
  if(tokenField&&!configured) {
    tokenField.value="";
  }

  // Poslední přihlášení.
  const loginField=$("settingsLastLogin");
  if(loginField) {
    loginField.textContent=currentLastLogin
      ? dateTimeText(currentLastLogin)
      : "—";
  }

  // Počet operací aktuálního uživatele.
  const operationField=$("settingsOperationCount");
  if(operationField) {
    const userName=currentUser
      ? `${currentUser.firstName} ${currentUser.lastName}`
      : "";

    const count=historyItems.filter(h=>h.user===userName).length;
    operationField.textContent=configured ? String(count) : "—";
  }

  // Verze aplikace není zatím v projektu definována.
  const versionField=$("appVersion");
  if(versionField) {
    versionField.textContent="—";
  }

  $("logoutBtn").classList.toggle("hidden",!configured);
}

function toast(s) {
  const t=$("toast");
  t.textContent=s;
  t.classList.add("show");

  setTimeout(()=>t.classList.remove("show"),2800);
}

function requireWriter() {
  if(!isConfigured(profile())) {
    openSettings();
    toast("Nejdříve nastav připojení ke skladu.");
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
  $("accessToken").value=p.token||"";
}

function openSettings() {
  fillSettings(profile());

  const tokenField=$("profileToken");
  const statusField=$("profileTokenStatus");

  if(tokenField) {
    tokenField.value="";
  }

  if(statusField) {
    statusField.textContent="";
  }

  updateUserSettings();
  $("settingsDialog").showModal();
}

function saveSettings(e) {
  e.preventDefault();

  const token=$("accessToken").value.trim();

  if(!token) {
    toast("Vlož GitHub token.");
    return;
  }

  localStorage.setItem(PROFILE_KEY,JSON.stringify({token}));

  loadAll().then(()=>{
    $("settingsDialog").close();
    updateUserSettings();
    toast("Přístup byl uložen.");
  }).catch(e=>{
    setState("Chyba připojení");
    toast(e.message);
    openSettings();
  });
}


// =========================================================
// ZMĚNA GITHUB TOKENU
// =========================================================

async function saveProfileToken() {
  const tokenField=$("profileToken");
  const button=$("saveProfileToken");
  const statusField=$("profileTokenStatus");

  if(!currentUser) {
    toast("Nejdříve se přihlas.");
    return;
  }

  const newToken=tokenField.value.trim();

  if(!newToken) {
    statusField.textContent="Vlož nový GitHub token.";
    tokenField.focus();
    return;
  }

  const oldProfile=profile();

  if(newToken===oldProfile.token) {
    statusField.textContent="Zadaný token je stejný jako současný.";
    tokenField.value="";
    return;
  }

  const originalButtonText=button.textContent;

  button.disabled=true;
  button.textContent="Ověřuji…";
  statusField.textContent="Ověřuji nový token na GitHubu…";

  try {
    // Nový token se dočasně nastaví jako aktivní.
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({...oldProfile,token:newToken})
    );

    // Načtení ověří přístup k repozitáři i registraci v users.json.
    await loadAll();

    tokenField.value="";
    statusField.textContent="Nový token byl ověřen a uložen.";
    toast("Nový GitHub token byl úspěšně uložen.");

  } catch(error) {
    // Při neúspěchu se obnoví původní token.
    if(oldProfile.token) {
      localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify(oldProfile)
      );
    } else {
      localStorage.removeItem(PROFILE_KEY);
    }

    // Obnovení původního přihlášení a dat.
    try {
      await loadAll();
    } catch(restoreError) {
      console.error("Obnovení původního přihlášení selhalo:",restoreError);
    }

    tokenField.value="";
    statusField.textContent=
      `Nový token se nepodařilo uložit. Původní přístup zůstal zachován. ${error.message}`;

    toast(`Nový token nebyl uložen: ${error.message}`);

  } finally {
    button.disabled=false;
    button.textContent=originalButtonText;
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
// OVĚŘENÍ ROLE
// =========================================================

async function loadRole() {
  currentRole="read";
  currentUser=null;
  currentLastLogin=null;

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

  if(!match) {
    throw new Error("Tento GitHub token není zaregistrován v users.json. Kontaktuj správce skladu.");
  }

  if(!match.firstName||!match.lastName) {
    throw new Error("Uživatel v users.json nemá vyplněné jméno a příjmení.");
  }

  if(!["read","write","admin"].includes(match.role)) {
    throw new Error("Uživatel v users.json má neplatnou roli.");
  }

  usersData=data;
  usersFileSha=usersFile.sha;

  currentUser={
    firstName:match.firstName,
    lastName:match.lastName
  };

  currentRole=match.role;

  // Uloží čas úspěšného ověření přihlášení pro tento účet na tomto zařízení.
  const loginKey=`sklad-last-login-${tokenHash}`;
  currentLastLogin=new Date().toISOString();
  localStorage.setItem(loginKey,currentLastLogin);

  updateIdentity();
}


// =========================================================
// NAČTENÍ DAT
// =========================================================

async function loadAll() {
  setState("Načítám GitHub…");

  const [d,h]=await Promise.all([
    readJson("data.json",{parts:[]}),
    readJson("history.json",{items:[]})
  ]);

  await loadRole();

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

async function saveInvite() {
  if(!pendingInvite) return;

  const button=$("saveInvite");
  const oldProfile=profile();

  button.disabled=true;
  button.textContent="Ukládám…";

  $("inviteSaveStatus").textContent="Ověřuji přístup k soukromému skladu…";

  try {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({token:pendingInvite.token})
    );

    await loadAll();

    const name=`${pendingInvite.firstName} ${pendingInvite.lastName}`;

    pendingInvite=null;

    $("inviteDialog").close();

    toast(`Přístup pro ${name} byl uložen.`);

    updateUserSettings();

  } catch(e) {
    if(oldProfile.token) {
      localStorage.setItem(PROFILE_KEY,JSON.stringify(oldProfile));
    } else {
      localStorage.removeItem(PROFILE_KEY);
    }

    $("inviteSaveStatus").textContent=
      `Přístup se nepodařilo uložit: ${e.message}`;

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

  currentUser=null;
  currentRole="read";
  currentLastLogin=null;
  usersData={users:[]};
  usersFileSha=null;

  updateIdentity();
  applyPermissions();

  setState("Odhlášeno");

  openSettings();
}


// =========================================================
// SPRÁVA UŽIVATELŮ
// =========================================================

async function openUsers() {
  if(!isAdmin()) {
    toast("Správa uživatelů je dostupná pouze správci.");
    return;
  }

  try {
    await refreshUsers();
    renderUsers();

    $("inviteResult").classList.add("hidden");
    $("userForm").reset();

    $("usersDialog").showModal();

  } catch(e) {
    toast(`Uživatelé se nepodařilo načíst: ${e.message}`);
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

function renderUsers() {
  const list=$("usersList");

  const sorted=usersData.users
    .map((u,index)=>({u,index}))
    .sort((a,b)=>{
      const ar=a.u.role==="admin"?0:1;
      const br=b.u.role==="admin"?0:1;

      if(ar!==br) return ar-br;

      const aw=(a.u.firstName==="Josef"&&a.u.lastName==="Wajsar")?0:1;
      const bw=(b.u.firstName==="Josef"&&b.u.lastName==="Wajsar")?0:1;

      return aw-bw||a.u.lastName.localeCompare(b.u.lastName,"cs");
    });

  list.innerHTML=sorted.map(({u,index})=>`
    <div class="user-row" data-index="${index}">
      <div class="user-row-info">
        <strong>${esc(u.firstName)} ${esc(u.lastName)}</strong>
        <small>${roleLabel(u.role)}</small>
      </div>

      <select class="user-role" aria-label="Role uživatele">
        <option value="read" ${u.role==="read"?"selected":""}>Read</option>
        <option value="write" ${u.role==="write"?"selected":""}>Write</option>
        <option value="admin" ${u.role==="admin"?"selected":""}>Admin</option>
      </select>

      <button type="button" class="btn btn-light user-remove">
        Odebrat
      </button>
    </div>
  `).join("")||'<p class="muted">Zatím nejsou přidáni žádní uživatelé.</p>';

  list.querySelectorAll(".user-role").forEach(el=>{
    el.onchange=async()=>{
      const i=Number(el.closest(".user-row").dataset.index);

      if(!isAdmin()) return;

      const user=usersData.users[i];
      const old=user.role;
      const ownHash=await sha256Token(profile().token);

      if(user.tokenHash===ownHash&&el.value!=="admin") {
        el.value=old;
        toast("Roli právě přihlášeného správce nelze změnit.");
        return;
      }

      if(
        old==="admin"&&
        el.value!=="admin"&&
        usersData.users.filter(x=>x.role==="admin").length===1
      ) {
        el.value=old;
        toast("Nelze odebrat roli poslednímu správci.");
        return;
      }

      user.role=el.value;

      try {
        await saveUsers();
        renderUsers();
        toast("Role uživatele byla změněna.");
      } catch(e) {
        user.role=old;
        el.value=old;
        toast(e.message);
      }
    };
  });

  list.querySelectorAll(".user-remove").forEach(el=>{
    el.onclick=async()=>{
      const i=Number(el.closest(".user-row").dataset.index);
      const u=usersData.users[i];

      if(!confirm(`Odebrat uživatele ${u.firstName} ${u.lastName}?`)) {
        return;
      }

      if(u.tokenHash===await sha256Token(profile().token)) {
        toast("Nemůžeš odebrat právě přihlášený účet.");
        return;
      }

      if(
        u.role==="admin"&&
        usersData.users.filter(x=>x.role==="admin").length===1
      ) {
        toast("Nelze odebrat posledního správce.");
        return;
      }

      const previous=usersData.users.slice();

      usersData.users.splice(i,1);

      try {
        await saveUsers();
        renderUsers();
        toast("Uživatel byl odebrán.");
      } catch(e) {
        usersData.users=previous;
        renderUsers();
        toast(e.message);
      }
    };
  });
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

    const user={tokenHash,firstName,lastName,role};

    usersData.users.push(user);

    try {
      await saveUsers();
    } catch(writeError) {
      usersData.users.pop();
      throw writeError;
    }

    const invite=base64UrlEncode(
      JSON.stringify({token,firstName,lastName,role})
    );

    const url=`${location.origin}${location.pathname}${location.search}#invite=${invite}`;

    $("inviteLink").value=url;
    $("inviteResult").classList.remove("hidden");
    $("newUserToken").value="";

    $("userSaveStatus").textContent=
      `Uživatel ${firstName} ${lastName} byl uložen do soukromého GitHub repozitáře. Nyní můžeš pozvánku sdílet.`;

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

  const name=`${$("newUserFirst").value.trim()} ${$("newUserLast").value.trim()}`.trim();

  const shareData={
    title:"Pozvánka do skladové aplikace",
    text:`Ahoj${name?` ${name}`:""}, zde je tvůj přístup do skladové aplikace. Otevři odkaz a klikni na Uložit přístup.`,
    url
  };

  try {
    if(navigator.share) {
      await navigator.share(shareData);
      toast("Pozvánka byla předána ke sdílení.");
    } else {
      await navigator.clipboard.writeText(url);
      toast("Odkaz byl zkopírován. Můžeš jej vložit do zprávy.");
    }
  } catch(e) {
    if(e.name!=="AbortError") {
      await copyInviteLink();
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
  const writer=isWriter();

  $("userManagementBtn").classList.toggle("hidden",!isAdmin());

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

  $("newPartBtn").classList.toggle("permission-disabled",!writer);
  $("detailEdit").classList.toggle("permission-disabled",!writer);

  $("detailStockIn").disabled=!writer;
  $("detailStockOut").disabled=!writer;
}


// =========================================================
// PŘEPÍNÁNÍ OBRAZOVEK
// =========================================================

function switchView(view) {
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
// QR KÓD A TISK
// =========================================================

function showPrint(id) {
  const p=parts.find(x=>x.id===id);

  if(!p) return;

  $("printQr").innerHTML="";

  if(window.QRCode) {
    new QRCode($("printQr"),{
      text:p.id,
      width:190,
      height:190,
      correctLevel:QRCode.CorrectLevel.M
    });
  } else {
    $("printQr").textContent=p.id;
  }

  $("printDialog").showModal();
}


// =========================================================
// SPUŠTĚNÍ APLIKACE
// =========================================================

init();
