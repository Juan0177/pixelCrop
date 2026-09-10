# PixelCrop

Utility web per rimuovere lo sfondo dalle immagini direttamente nel browser.

PixelCrop usa un modello AI eseguito localmente tramite JavaScript, WebAssembly e ONNX Runtime. L’immagine selezionata non viene caricata su un backend: GitHub Pages distribuisce soltanto i file statici dell’applicazione.

## Funzionalità

- upload tramite selezione file o drag and drop;
- supporto per PNG, JPG e WEBP fino a 20 MB;
- anteprima originale e risultato trasparente;
- download in PNG;
- elaborazione locale nel browser;
- tema scuro predefinito con possibilità di passare al tema chiaro;
- layout responsive per desktop e dispositivi mobili.

## Avvio locale

È sufficiente servire la cartella con un server statico. Ad esempio, con Python:

```powershell
python -m http.server 8000
```

Aprire quindi [http://localhost:8000](http://localhost:8000).

Non è consigliato aprire direttamente `index.html` con `file://`, perché il browser può bloccare il caricamento dei moduli e degli asset locali.

## Pubblicazione su GitHub Pages

Il workflow in `.github/workflows/pages.yml` pubblica automaticamente il contenuto del repository a ogni push sul branch `main`.

Nel repository GitHub:

1. aprire **Settings → Pages**;
2. impostare **Source** su **GitHub Actions**;
3. eseguire il push sul branch `main`.

Per questo repository l’indirizzo previsto è:

```text
https://juan0177.github.io/pixelCrop/
```

## Struttura degli asset

```text
assets/
├── js/       bundle locale del motore di rimozione sfondo
├── models/   modello ONNX e resources.json
└── wasm/     runtime WebAssembly di ONNX Runtime
```

Il primo utilizzo può richiedere il download del modello. Dopo il caricamento iniziale, il browser può riutilizzare gli asset dalla cache. Il modello completo occupa circa 221 MB, quindi il repository e il primo caricamento sono più pesanti di una normale pagina statica.

## Rigenerazione degli asset

Le dipendenze di build sono dichiarate in `package.json` e il lockfile in `package-lock.json` mantiene le versioni installate. Gli asset già presenti in `assets/` sono quelli utilizzati dal sito pubblicato.

```powershell
npm install
```

## Privacy

L’immagine viene letta dal browser, trasformata localmente e convertita in un PNG trasparente. PixelCrop non include un server applicativo e non invia l’immagine a GitHub o a un servizio di elaborazione remoto.

Prima di distribuire l’app in un contesto commerciale, verificare le licenze del modello, del runtime e delle relative dipendenze.