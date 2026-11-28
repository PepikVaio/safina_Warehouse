
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


// STAV UKLÁDACÍCH TLAČÍTEK
// =========================================================

async function withButtonLoading(button, loadingText, action) {
  if(!button) return await action();

  const originalText=button.textContent;
  const wasDisabled=button.disabled;

  button.disabled=true;
  button.textContent=loadingText;

  try {
    return await action();
  } finally {
    button.disabled=wasDisabled;
    button.textContent=originalText;
  }
}

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

  // Tisk QR štítku
on("detailPrint","click",()=>showPrint(currentDetailId));

on("closePrint","click",closePrintDialog);
on("closePrint2","click",closePrintDialog);

on("printBtn","click",printLabel);


  // Historie
  on("historySearch","input",renderHistory);
  on("historyFilter","change",renderHistory);
}


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
    : "Přihlásit";

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

  const dialog=document.querySelector("dialog[open]");

  if(dialog) {
    dialog.append(t);
  } else {
    document.body.append(t);
  }

  t.textContent=s;
  t.classList.add("show");

  clearTimeout(t.toastTimer);

  t.toastTimer=setTimeout(()=>{
    t.classList.remove("show");
    document.body.append(t);
  },2800);
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


