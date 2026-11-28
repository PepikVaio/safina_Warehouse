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

async function apiGet(path,repoName=REPO_NAME,includeLargeContent=true) {
  const r=await fetch(apiUrl(path,repoName),{headers:apiHeaders()});

  if(r.status===404) return null;

  const j=await r.json();

  if(!r.ok) throw new Error(j.message||`GitHub API: ${r.status}`);

  // GitHub omits the content for files above 1 MB unless the raw media type is requested.
  if(
    includeLargeContent&&
    j.type==="file"&&
    j.size>1024*1024&&
    (!j.content||j.encoding==="none")
  ) {
    const headers={...apiHeaders(),Accept:"application/vnd.github.raw+json"};
    const raw=await fetch(apiUrl(path,repoName),{headers});

    if(!raw.ok) {
      let message="";
      try {
        message=(await raw.json()).message||"";
      } catch {}
      throw new Error(message||`Stažení většího souboru z GitHubu selhalo (${raw.status}).`);
    }

    j.content=encodeContent(await raw.text());
    j.encoding="base64";
  }

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


