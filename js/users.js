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
      const userSaveStatus=$("userSaveStatus");

      if(!userForm) {
        throw new Error("Chybí formulář pro přidání uživatele.");
      }

      userForm.reset();

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
    .map((u,index)=>{
      const original=usersDraft
        ? usersData.users.find(x=>x.tokenHash===u.tokenHash)
        : u;

      return {
        u,
        index,
        originalActive:isUserActive(original),
        originalRole:original?.role
      };
    })
    .sort((a,b)=>{
      const isWajsarA=
        a.u.firstName==="Josef"&&a.u.lastName==="Wajsar";

      const isWajsarB=
        b.u.firstName==="Josef"&&b.u.lastName==="Wajsar";

      if(isWajsarA!==isWajsarB) return isWajsarA?-1:1;

      if(a.originalActive!==b.originalActive) {
        return a.originalActive?-1:1;
      }

      const roleOrder={
        admin:0,
        write:1,
        supervisor:2,
        read:3
      };

      const ar=roleOrder[a.originalRole]??99;
      const br=roleOrder[b.originalRole]??99;

      if(ar!==br) return ar-br;

      return a.u.lastName.localeCompare(b.u.lastName,"cs")
        ||a.u.firstName.localeCompare(b.u.firstName,"cs");
    });

  list.innerHTML=sorted.map(({u,index,originalActive},position)=>{
    const active=isUserActive(u);

    const previous=sorted[position-1];

    const separator=
      position>0 &&
      !originalActive &&
      previous?.originalActive
        ? '<div class="user-list-separator"></div>'
        : '';

    return `
      ${separator}
      <div class="user-row" data-index="${index}">
        <div class="user-row-info">
          <strong>${esc(u.lastName)} ${esc(u.firstName)}</strong>
          <small>
            <span class="user-status ${active?"active":"inactive"}">
              <span class="user-status-dot"></span>
              ${active?"Aktivní":"Deaktivováno"}
            </span>
            <span class="user-role-label">| ${roleLabel(u.role)}</span>
          </small>
        </div>

        <select class="user-role" aria-label="Role uživatele">
          <option value="admin" ${u.role==="admin"?"selected":""}>Admin</option>
          <option value="write" ${u.role==="write"?"selected":""}>Write</option>
          <option value="supervisor" ${u.role==="supervisor"?"selected":""}>Supervisor</option>
          <option value="read" ${u.role==="read"?"selected":""}>Read</option>
        </select>

        <div class="user-actions">
          <button type="button" class="btn btn-light user-toggle">
            ${active?"Deaktivovat":"Aktivovat"}
          </button>

          <button type="button" class="btn btn-remove user-remove" title="Odebrat uživatele" aria-label="Odebrat uživatele">
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

  try {
    await withButtonLoading(button,"Ukládám…",async()=>{

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

      const inviteUrl=new URL("invite.html",location.href);
      inviteUrl.hash=`invite=${invite}`;
      const url=inviteUrl.href;

      $("inviteLink").value=url;
      $("newUserToken").value="";

      $("addUserDialog")?.close();
      $("sendInviteDialog")?.showModal();

      $("userSaveStatus").textContent=
        `Uživatel ${firstName} ${lastName} byl uložen do soukromého GitHub repozitáře. Pozvánka je platná 5 minut.`;

      renderUsers();

      toast("Uživatel byl uložen do GitHubu. Pozvánka je připravena.");

    });

  } catch(err) {
    $("userSaveStatus").textContent=`Uložení se nezdařilo: ${err.message}`;
    toast(`Uložení se nezdařilo: ${err.message}`);
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


