import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Download, ImagePlus, Moon, RotateCcw, SlidersHorizontal, Sun, Upload, WandSparkles } from 'lucide-react';
import { segmentForeground } from '../assets/js/background-removal.js';
import './styles.css';

// I dati binari del modello vivono in public/models: Vite li serve as-is, senza passarli dal transform di import-analysis.
const modelsPublicPath = new URL('./models/dist/', window.location.href).href;

function shapeAlpha(alpha, value) {
  const t = value / 100;
  const threshold = 0.5 + t * 0.16;
  const softness = 0.24 - t * 0.2;
  const normalized = Math.max(0, Math.min(1, (alpha - threshold + softness) / (softness * 2)));
  return normalized * normalized * (3 - 2 * normalized);
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('pixelcrop-theme') || 'dark');
  const [showAdvanced, setShowAdvanced] = useState(() => localStorage.getItem('pixelcrop-advanced') === 'true');
  const [file, setFile] = useState(null);
  const [originalUrl, setOriginalUrl] = useState('');
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [aggressiveness, setAggressiveness] = useState(50);
  const [mode, setMode] = useState('remove');
  const [brushSize, setBrushSize] = useState(40);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [device, setDevice] = useState(() => (typeof navigator !== 'undefined' && 'gpu' in navigator ? 'gpu' : 'cpu'));
  const [capabilities, setCapabilities] = useState(() => ({
    cores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1,
    gpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
    gpuName: '',
    isolated: typeof window !== 'undefined' && window.crossOriginIsolated === true,
  }));
  const originalData = useRef(null);
  const maskData = useRef(null);
  const initialMask = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const drawing = useRef(false);
  const [liveStats, setLiveStats] = useState(null);
  const liveStatsTimer = useRef(null);
  const processingStart = useRef(0);
  const [modelCached, setModelCached] = useState(false);
  const downloadedThisRun = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('pixelcrop-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('pixelcrop-advanced', String(showAdvanced));
  }, [showAdvanced]);

  // Il nome della GPU si ottiene solo dopo aver richiesto un adattatore: WebGPU non lo espone in modo sincrono.
  useEffect(() => {
    if (!capabilities.gpu) return;
    navigator.gpu.requestAdapter().then(async (adapter) => {
      if (!adapter) return;
      const info = adapter.info ?? (await adapter.requestAdapterInfo?.().catch(() => null));
      const name = [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(' · ');
      if (name) setCapabilities((previous) => ({ ...previous, gpuName: name }));
    }).catch(() => {});
  }, [capabilities.gpu]);

  useEffect(() => () => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [originalUrl, downloadUrl]);

  // I browser non espongono l'uso reale di CPU/GPU in percentuale (mitigazioni Spectre): mostriamo tempo e memoria JS, le uniche metriche misurabili da pagina.
  const startLiveStats = () => {
    processingStart.current = performance.now();
    setLiveStats({ elapsedMs: 0, heapUsedMB: null, heapLimitMB: null });
    liveStatsTimer.current = window.setInterval(() => {
      const elapsedMs = performance.now() - processingStart.current;
      const memory = performance.memory;
      setLiveStats({
        elapsedMs,
        heapUsedMB: memory ? memory.usedJSHeapSize / (1024 * 1024) : null,
        heapLimitMB: memory ? memory.jsHeapSizeLimit / (1024 * 1024) : null,
      });
    }, 200);
  };

  const stopLiveStats = () => {
    if (liveStatsTimer.current) window.clearInterval(liveStatsTimer.current);
    liveStatsTimer.current = null;
  };

  useEffect(() => () => stopLiveStats(), []);

  const renderComposite = () => {
    if (!originalData.current || !maskData.current || !canvasRef.current) return;
    const { width, height } = originalData.current;
    const output = new ImageData(width, height);
    const source = originalData.current.data;
    const mask = maskData.current.data;
    for (let i = 0; i < width * height; i += 1) {
      const offset = i * 4;
      output.data[offset] = source[offset];
      output.data[offset + 1] = source[offset + 1];
      output.data[offset + 2] = source[offset + 2];
      output.data[offset + 3] = Math.round(shapeAlpha(mask[offset + 3] / 255, aggressiveness) * 255);
    }
    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').putImageData(output, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setDownloadUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
    }, 'image/png');
  };

  useEffect(() => { renderComposite(); }, [aggressiveness]);

  // Il canvas esiste nel DOM solo quando status === 'ready': disegnare qui evita la corsa con il commit di React.
  useEffect(() => { if (status === 'ready') renderComposite(); }, [status]);

  const processImage = async (selectedFile) => {
    if (!selectedFile || !selectedFile.type.startsWith('image/')) {
      setError('Seleziona un file immagine in formato PNG, JPG o WEBP.');
      return;
    }
    if (selectedFile.size > 20 * 1024 * 1024) {
      setError('L’immagine supera il limite di 20 MB.');
      return;
    }
    setFile(selectedFile);
    setError('');
    setStatus('processing');
    setProgress(5);
    startLiveStats();
    downloadedThisRun.current = false;
    setOriginalUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(selectedFile);
    });
    try {
      const runSegmentation = (targetDevice) => segmentForeground(selectedFile, {
        publicPath: modelsPublicPath,
        model: 'medium',
        device: targetDevice,
        progress: (key, current, total) => {
          if (key.startsWith('fetch:')) downloadedThisRun.current = true;
          setProgress(total ? 15 + (current / total) * 78 : 30);
        },
      });
      let maskBlob;
      try {
        maskBlob = await runSegmentation(device);
      } catch (gpuError) {
        if (device !== 'gpu') throw gpuError;
        // Alcuni browser/driver non supportano ancora il backend WebGPU di onnxruntime-web: ripiega su CPU senza far fallire l'utente.
        console.warn('GPU non disponibile in questo browser, ripiego su CPU:', gpuError);
        setDevice('cpu');
        setCapabilities((previous) => ({ ...previous, gpu: false }));
        maskBlob = await runSegmentation('cpu');
      }
      const [sourceBitmap, maskBitmap] = await Promise.all([createImageBitmap(selectedFile), createImageBitmap(maskBlob)]);
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = sourceBitmap.width;
      sourceCanvas.height = sourceBitmap.height;
      const sourceContext = sourceCanvas.getContext('2d');
      sourceContext.drawImage(sourceBitmap, 0, 0);
      originalData.current = sourceContext.getImageData(0, 0, sourceBitmap.width, sourceBitmap.height);
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = sourceBitmap.width;
      maskCanvas.height = sourceBitmap.height;
      const maskContext = maskCanvas.getContext('2d');
      maskContext.drawImage(maskBitmap, 0, 0, sourceBitmap.width, sourceBitmap.height);
      maskData.current = maskContext.getImageData(0, 0, sourceBitmap.width, sourceBitmap.height);
      initialMask.current = new Uint8ClampedArray(maskData.current.data);
      setProgress(100);
      stopLiveStats();
      setModelCached(true);
      setStatus('ready');
    } catch (processingError) {
      console.error(processingError);
      stopLiveStats();
      setStatus(null);
      setError('Non è stato possibile elaborare questa immagine. Controlla la connessione e riprova.');
    }
  };

  const paint = (event) => {
    if (!maskData.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = maskData.current.width / rect.width;
    const scaleY = maskData.current.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const radius = brushSize * ((scaleX + scaleY) / 2) / 2;
    const data = maskData.current.data;
    for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(maskData.current.height - 1, Math.ceil(y + radius)); py += 1) {
      for (let px = Math.max(0, Math.floor(x - radius)); px <= Math.min(maskData.current.width - 1, Math.ceil(x + radius)); px += 1) {
        const distance = Math.hypot(px - x, py - y);
        if (distance > radius) continue;
        const edge = Math.min(1, (radius - distance) / Math.max(1, radius * 0.25));
        const index = (py * maskData.current.width + px) * 4 + 3;
        const target = mode === 'remove' ? 0 : 255;
        data[index] = Math.round(data[index] * (1 - edge) + target * edge);
      }
    }
    renderComposite();
  };

  const reset = () => {
    if (!maskData.current || !initialMask.current) return;
    maskData.current.data.set(initialMask.current);
    renderComposite();
  };

  const clear = () => {
    setFile(null);
    setStatus(null);
    setError('');
    originalData.current = null;
    maskData.current = null;
    initialMask.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <main className="app-shell">
      <nav className="topbar">
        <a className="brand" href="./" aria-label="PixelCrop home"><span className="brand-mark"><i /><i /><i /><i /></span><span>pixel<span>crop</span></span></a>
        <div className="topbar-actions">
          <span className="privacy-note"><span className="status-dot" /> elaborazione locale</span>
          <button className="icon-button" onClick={() => setShowAdvanced((previous) => !previous)} aria-label={showAdvanced ? 'Nascondi opzioni' : 'Mostra opzioni'} aria-pressed={showAdvanced} title={showAdvanced ? 'Nascondi opzioni' : 'Mostra opzioni'}><SlidersHorizontal size={17} /></button>
          <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Cambia tema">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
        </div>
      </nav>
      <section className="intro">
        <p className="eyebrow">strumento 01 / scontorno</p>
        <h1>Via lo sfondo.<br /><em>Resta il soggetto.</em></h1>
        <p className="lede">Un editor privato per scontornare, rifinire e scaricare immagini direttamente dal browser.</p>
        {showAdvanced && <div className="engine-panel">
          <div className="engine-row">
            <span>Motore</span>
            <div className="engine-toggle">
              <button className={device === 'cpu' ? 'is-active' : ''} onClick={() => { setDevice('cpu'); setModelCached(false); }}>CPU</button>
              <button className={device === 'gpu' ? 'is-active' : ''} onClick={() => { setDevice('gpu'); setModelCached(false); }} disabled={!capabilities.gpu}>GPU</button>
            </div>
          </div>
          <p className="engine-explainer">
            CPU esegue il modello su {capabilities.cores} core della tua macchina in parallelo (WASM multi-thread); GPU delega il calcolo alla scheda grafica tramite WebGPU, di solito più veloce sulle immagini grandi. Elaborazione sempre locale, nessun dato lascia il browser.
          </p>
          <p className="engine-hint">
            CPU: {capabilities.cores} core logici · isolamento cross-origin {capabilities.isolated ? 'attivo (multi-thread abilitato)' : 'non attivo (ricarica la pagina una volta)'}<br />
            GPU: {capabilities.gpu ? (capabilities.gpuName || 'WebGPU disponibile, nome adattatore non esposto dal browser') : 'WebGPU non disponibile su questo browser/dispositivo'}
          </p>
        </div>}
      </section>
      {!file && <label className="dropzone" onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add('is-dragging'); }} onDragLeave={(event) => event.currentTarget.classList.remove('is-dragging')} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove('is-dragging'); processImage(event.dataTransfer.files[0]); }}>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => processImage(event.target.files[0])} />
        <span className="upload-icon"><Upload size={23} /></span><strong>Trascina qui un’immagine</strong><span>oppure <u>scegli un file</u></span><small>PNG, JPG o WEBP · massimo 20 MB</small>
      </label>}
      {status === 'processing' && <section className="progress-panel">
        <div className="progress-head"><span><WandSparkles size={15} /> Elaborazione locale</span><span>{Math.round(progress)}%</span></div>
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        {showAdvanced ? (
          <>
            <p>
              {modelCached
                ? `Modello già in cache in questa sessione: solo il calcolo sull'immagine viene rieseguito (motore ${device.toUpperCase()}).`
                : `Primo utilizzo in questa sessione: scaricamento e preparazione del modello, poi calcolo (motore ${device.toUpperCase()}).`}
            </p>
            {liveStats && <div className="live-stats">
              <div><span>Tempo trascorso</span><strong>{(liveStats.elapsedMs / 1000).toFixed(1)} s</strong></div>
              <div><span>Memoria JS</span><strong>{liveStats.heapUsedMB != null ? `${liveStats.heapUsedMB.toFixed(0)} / ${liveStats.heapLimitMB.toFixed(0)} MB` : 'non esposta da questo browser'}</strong></div>
              <div><span>Calcolo pianificato</span><strong>{device === 'gpu' ? 'WebGPU' : `${capabilities.isolated ? capabilities.cores : 1} thread WASM`}</strong></div>
              <p className="live-stats-note">La cache evita solo il ri-download e la ri-creazione della sessione del modello: il calcolo della rete neurale sui pixel dell'immagine va sempre rieseguito, anche ripetendo la stessa immagine, quindi la durata resta simile da qui in poi. I browser inoltre non espongono l'uso reale di CPU/GPU in percentuale (mitigazioni contro attacchi Spectre): questi restano gli unici valori misurabili da una pagina web.</p>
            </div>}
          </>
        ) : (
          liveStats && <p className="elapsed-only">Tempo impiegato: {(liveStats.elapsedMs / 1000).toFixed(1)} s</p>
        )}
      </section>}
      {error && <div className="error" role="alert">{error}</div>}
      {status === 'ready' && <section className="editor-result"><div className="result-head"><div><p className="eyebrow">risultato pronto</p><h2>Prima / dopo</h2></div><button className="secondary-button" onClick={clear}>Nuova immagine</button></div>
        <div className="comparison"><figure><div className="image-frame original-frame"><img src={originalUrl} alt="Immagine originale" /></div><figcaption>originale</figcaption></figure><figure><div className="image-frame checker-frame editor-frame"><canvas ref={canvasRef} onPointerDown={(event) => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); paint(event); }} onPointerMove={(event) => drawing.current && paint(event)} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} aria-label="Editor manuale della maschera" /></div><figcaption>editor trasparente</figcaption></figure></div>
        <div className="editor-tools"><div className="tool-row"><button className={`tool-button ${mode === 'remove' ? 'is-active' : ''}`} onClick={() => setMode('remove')}>Rimuovi</button><button className={`tool-button ${mode === 'restore' ? 'is-active' : ''}`} onClick={() => setMode('restore')}>Ripristina</button><button className="secondary-button" onClick={reset}><RotateCcw size={14} /> Reset maschera</button></div><label className="brush-control">Dimensione pennello <output>{brushSize} px</output></label><input type="range" min="5" max="240" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /><p className="editor-hint">Disegna sul risultato per rifinire i bordi.</p></div>
        <div className="aggressiveness"><div className="aggressiveness-head"><label>Aggressività rimozione</label><span>{aggressiveness}%</span></div><input type="range" min="0" max="100" value={aggressiveness} onChange={(event) => setAggressiveness(Number(event.target.value))} /><div className="aggressiveness-labels"><span>delicato</span><span>aggressivo</span></div></div>
        <a className="download-button" href={downloadUrl} download="pixelcrop-senza-sfondo.png"><Download size={18} /> Scarica PNG trasparente</a>
      </section>}
      <footer><span>pixelcrop</span><span>immagini private, risultato tuo</span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
