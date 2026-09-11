import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Download, ImagePlus, Moon, RotateCcw, Sun, Upload, WandSparkles } from 'lucide-react';
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
  const [capabilities] = useState(() => ({
    cores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1,
    gpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
    isolated: typeof window !== 'undefined' && window.crossOriginIsolated === true,
  }));
  const originalData = useRef(null);
  const maskData = useRef(null);
  const initialMask = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('pixelcrop-theme', theme);
  }, [theme]);

  useEffect(() => () => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [originalUrl, downloadUrl]);

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
    setOriginalUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(selectedFile);
    });
    try {
      const maskBlob = await segmentForeground(selectedFile, {
        publicPath: modelsPublicPath,
        model: 'medium',
        device,
        progress: (key, current, total) => setProgress(total ? 15 + (current / total) * 78 : 30),
      });
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
      setStatus('ready');
      requestAnimationFrame(renderComposite);
    } catch (processingError) {
      console.error(processingError);
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
        <div className="topbar-actions"><span className="privacy-note"><span className="status-dot" /> elaborazione locale</span><button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Cambia tema">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button></div>
      </nav>
      <section className="intro">
        <p className="eyebrow">strumento 01 / scontorno</p>
        <h1>Via lo sfondo.<br /><em>Resta il soggetto.</em></h1>
        <p className="lede">Un editor privato per scontornare, rifinire e scaricare immagini direttamente dal browser.</p>
        <div className="engine-panel">
          <div className="engine-row">
            <span>Motore</span>
            <div className="engine-toggle">
              <button className={device === 'cpu' ? 'is-active' : ''} onClick={() => setDevice('cpu')}>CPU</button>
              <button className={device === 'gpu' ? 'is-active' : ''} onClick={() => setDevice('gpu')} disabled={!capabilities.gpu}>GPU</button>
            </div>
          </div>
          <p className="engine-hint">
            {capabilities.cores} core rilevati · WebGPU {capabilities.gpu ? 'disponibile' : 'non disponibile'} · isolamento cross-origin {capabilities.isolated ? 'attivo (multi-thread WASM abilitato)' : 'non attivo (primo avvio: ricarica la pagina una volta)'}
          </p>
        </div>
      </section>
      {!file && <label className="dropzone" onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add('is-dragging'); }} onDragLeave={(event) => event.currentTarget.classList.remove('is-dragging')} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove('is-dragging'); processImage(event.dataTransfer.files[0]); }}>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => processImage(event.target.files[0])} />
        <span className="upload-icon"><Upload size={23} /></span><strong>Trascina qui un’immagine</strong><span>oppure <u>scegli un file</u></span><small>PNG, JPG o WEBP · massimo 20 MB</small>
      </label>}
      {status === 'processing' && <section className="progress-panel"><div className="progress-head"><span><WandSparkles size={15} /> Elaborazione locale</span><span>{Math.round(progress)}%</span></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><p>Il modello viene eseguito sul tuo dispositivo.</p></section>}
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
