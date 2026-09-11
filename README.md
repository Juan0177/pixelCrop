# PixelCrop

Utility web per rimuovere lo sfondo dalle immagini direttamente nel browser.

PixelCrop usa un modello AI eseguito localmente tramite JavaScript, WebAssembly e ONNX Runtime. L’immagine selezionata non viene caricata su un backend: GitHub Pages distribuisce soltanto i file statici dell’applicazione.

## Funzionalità

- upload tramite selezione file o drag and drop;
- supporto per PNG, JPG e WEBP fino a 20 MB;
- anteprima originale e risultato trasparente, con editor a pennello per rifinire manualmente la maschera (Rimuovi/Ripristina, dimensione regolabile, reset);
- slider di aggressività per regolare la soglia di trasparenza senza rielaborare l'immagine;
- selettore motore CPU/GPU (WebGPU quando disponibile), con fallback automatico e silenzioso a CPU se il browser non supporta correttamente il backend GPU;
- monitor live durante l'elaborazione (tempo trascorso, memoria JS quando esposta dal browser, thread/motore pianificato);
- isolamento cross-origin abilitato tramite service worker per sbloccare il WASM multi-thread quando il browser lo consente;
- download in PNG;
- elaborazione locale nel browser, nessun upload su server;
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
├── js/       bundle locale del motore di rimozione sfondo (background-removal.js)
└── icons/    favicon

public/
├── coi-serviceworker.js   deve stare alla radice del sito: lo scope di un service worker
│                          copre solo la propria cartella e sottocartelle, quindi da qui
│                          può intercettare l'intera pagina e abilitare l'isolamento
│                          cross-origin (necessario per il WASM multi-thread)
└── models/dist/           modello ONNX (isnet_fp16) e resources.json
```

Vite copia `public/` così com'è dentro `dist/` durante la build (percorsi invariati). Lo script `scripts/copy-assets.mjs` copia invece `assets/` dentro `dist/assets` dopo ogni `npm run build`, per includere anche il bundle del motore AI e la favicon nell'output pubblicato.

Il primo utilizzo in una sessione scarica e inizializza il modello (~170 MB): l'interfaccia lo segnala esplicitamente. Le elaborazioni successive nella stessa sessione riusano modello e sessione già caricati, ma il calcolo della rete neurale sui pixel dell'immagine va comunque rieseguito ogni volta: la cache accelera l'avvio, non il calcolo.

## Stack

React, Vite, Tailwind CSS e Lucide per le icone. Le dipendenze sono dichiarate in `package.json` e il lockfile in `package-lock.json` mantiene le versioni installate.

```powershell
npm install
```

## Privacy

L’immagine viene letta dal browser, trasformata localmente e convertita in un PNG trasparente. PixelCrop non include un server applicativo e non invia l’immagine a GitHub o a un servizio di elaborazione remoto.
