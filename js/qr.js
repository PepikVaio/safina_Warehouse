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
  dialog.className="dialog qr-scanner-dialog";

  dialog.innerHTML=`
    <div class="qr-scanner-header">
      <h2>Skenovat štítek</h2>

      <button
        type="button"
        id="closeQrScanner"
        class="btn btn-light"
        aria-label="Zavřít"
      >×</button>
    </div>

    <div class="qr-scanner-stage">
      <video
        id="qrScannerVideo"
        autoplay
        muted
        playsinline
        class="qr-scanner-video"
      ></video>

      <div class="qr-scanner-frame"></div>
    </div>

    <p id="qrScannerStatus" class="qr-scanner-status">
      Připravuji kameru…
    </p>

    <button
      type="button"
      id="qrScannerCancel"
      class="btn btn-light qr-scanner-cancel"
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

  if(!p) {
    toast("Položka nebyla nalezena.");
    return;
  }

  const dialog=$("printDialog");

  if(!dialog) {
    toast("Tiskový dialog nebyl nalezen.");
    return;
  }

  $("printName").textContent=p.name||"";
  $("printInfo").innerHTML="";
  $("printQr").innerHTML="";

  function addPrintField(label,value) {
    if(!value||!String(value).trim()) return;

    const field=document.createElement("div");
    field.className="print-field";

    const title=document.createElement("div");
    title.className="print-field-label";
    title.textContent=label;

    const text=document.createElement("div");
    text.className="print-field-value";
    text.textContent=value;

    field.append(title,text);
    $("printInfo").appendChild(field);
  }

  addPrintField("OBJEDNACÍ ČÍSLO",p.partNumber);

  const supplier=(p.suppliers||[])
    .find(s=>s?.name?.trim());

  if(supplier) {
    addPrintField("DODAVATEL",supplier.name);
  }

  addPrintField("TYP ZAŘÍZENÍ",p.machine);

  if(!window.QRCode) {
    toast("Knihovna QR kódů není dostupná.");
    return;
  }

  new QRCode($("printQr"),{
    text:String(p.id),
    width:300,
    height:300,
    correctLevel:QRCode.CorrectLevel.M
  });

  if(!dialog.open) {
    dialog.showModal();
  }
}


function closePrintDialog() {
  $("printDialog")?.close();
}


function printLabel() {
  const dialog=$("printDialog");

  if(!dialog?.open) return;

  window.print();
}





