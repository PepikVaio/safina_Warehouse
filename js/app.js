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
// SPUŠTĚNÍ APLIKACE
// =========================================================

init();
