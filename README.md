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

PixelCrop è un'app React costruita con Vite: non aprire `index.html` direttamente né servirlo con un server statico generico (es. Live Server), perché fa riferimento a `/src/main.jsx`, un sorgente che Vite trasforma solo tramite il proprio server di sviluppo.

```powershell
npm install
npm run dev
```

Aprire quindi l'indirizzo mostrato in console (tipicamente [http://localhost:5173](http://localhost:5173)).

Per verificare la build di produzione localmente:

```powershell
npm run build
npm run preview
```

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
├── js/       bundle locale del motore di rimozione sfondo e coi-serviceworker.js
├── models/   modello ONNX e resources.json
└── icons/    favicon
```

Lo script `scripts/copy-assets.mjs` copia `assets/` dentro `dist/assets` dopo ogni `npm run build`, così il bundle Vite e i file statici locali (modello, WASM, favicon) convivono nella stessa cartella pubblicata.

Il primo utilizzo può richiedere il download del modello. Dopo il caricamento iniziale, il browser può riutilizzare gli asset dalla cache. Il modello completo occupa circa 175 MB, quindi il repository e il primo caricamento sono più pesanti di una normale pagina statica.

## Stack

React, Vite, Tailwind CSS e Lucide per le icone. Le dipendenze sono dichiarate in `package.json` e il lockfile in `package-lock.json` mantiene le versioni installate.

```powershell
npm install
```

## Privacy

L’immagine viene letta dal browser, trasformata localmente e convertita in un PNG trasparente. PixelCrop non include un server applicativo e non invia l’immagine a GitHub o a un servizio di elaborazione remoto.

Prima di distribuire l’app in un contesto commerciale, verificare le licenze del modello, del runtime e delle relative dipendenze.