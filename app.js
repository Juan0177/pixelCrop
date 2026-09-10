const fileInput = document.querySelector('#file-input');
const dropzone = document.querySelector('#dropzone');
const progressPanel = document.querySelector('#progress-panel');
const progressLabel = document.querySelector('#progress-label');
const progressValue = document.querySelector('#progress-value');
const progressBar = document.querySelector('#progress-bar');
const result = document.querySelector('#result');
const errorBox = document.querySelector('#error');
const originalImage = document.querySelector('#original-image');
const resultImage = document.querySelector('#result-image');
const downloadButton = document.querySelector('#download-button');
const themeButton = document.querySelector('#theme-button');
const aggressivenessSlider = document.querySelector('#aggressiveness-slider');
const aggressivenessValue = document.querySelector('#aggressiveness-value');

import { segmentForeground } from './assets/js/background-removal.js';

// URL assoluto richiesto dalla libreria: new URL(relative, base) rifiuta basi relative.
const modelsPublicPath = new URL('./assets/models/dist/', import.meta.url).href;

let originalUrl;
let resultUrl;
let cachedOriginalImageData;
let cachedMaskImageData;

const savedTheme = localStorage.getItem('pixelcrop-theme');
if (savedTheme === 'light') document.documentElement.dataset.theme = 'light';

function updateThemeButton() {
  const isLight = document.documentElement.dataset.theme === 'light';
  themeButton.textContent = isLight ? '◐' : '☼';
  themeButton.setAttribute('aria-label', isLight ? 'Attiva tema scuro' : 'Attiva tema chiaro');
}

updateThemeButton();
themeButton.addEventListener('click', () => {
  const isLight = document.documentElement.dataset.theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'dark' : 'light';
  localStorage.setItem('pixelcrop-theme', isLight ? 'dark' : 'light');
  updateThemeButton();
});

function setProgress(value, label) {
  progressBar.style.width = `${value}%`;
  progressValue.textContent = `${Math.round(value)}%`;
  progressLabel.textContent = label;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  progressPanel.hidden = true;
}

// t=0 mantiene i toni incerti (meno aggressivo), t=1 li spinge verso i due estremi (più aggressivo).
function aggressivenessToGamma(sliderValue) {
  const t = sliderValue / 100;
  const minGamma = 1 / 3;
  const maxGamma = 3;
  return minGamma * Math.pow(maxGamma / minGamma, t);
}

function renderComposite() {
  if (!cachedOriginalImageData || !cachedMaskImageData) return;
  const { width, height } = cachedOriginalImageData;
  const gamma = aggressivenessToGamma(Number(aggressivenessSlider.value));
  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d');
  const outImageData = outCtx.createImageData(width, height);
  const srcData = cachedOriginalImageData.data;
  const maskData = cachedMaskImageData.data;
  const dstData = outImageData.data;
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    dstData[o] = srcData[o];
    dstData[o + 1] = srcData[o + 1];
    dstData[o + 2] = srcData[o + 2];
    const shaped = Math.pow(maskData[o + 3] / 255, gamma);
    dstData[o + 3] = Math.max(0, Math.min(255, Math.round(shaped * 255)));
  }
  outCtx.putImageData(outImageData, 0, 0);
  outCanvas.toBlob((blob) => {
    if (!blob) return;
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    resultImage.src = resultUrl;
    downloadButton.href = resultUrl;
  }, 'image/png');
}

async function processImage(file) {
  if (!file || !file.type.startsWith('image/')) return showError('Seleziona un file immagine in formato PNG, JPG o WEBP.');
  if (file.size > 20 * 1024 * 1024) return showError('L’immagine supera il limite di 20 MB.');

  errorBox.hidden = true;
  result.hidden = true;
  progressPanel.hidden = false;
  setProgress(5, 'Caricamento immagine');
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  originalUrl = URL.createObjectURL(file);
  originalImage.src = originalUrl;

  try {
    const maskBlob = await segmentForeground(file, {
      publicPath: modelsPublicPath,
      model: 'medium',
      progress: (key, current, total) => {
        const percent = total ? 15 + (current / total) * 78 : 30;
        setProgress(percent, key.startsWith('fetch:') ? 'Preparazione modello' : 'Rimozione sfondo');
      },
    });

    const [originalBitmap, maskBitmap] = await Promise.all([
      createImageBitmap(file),
      createImageBitmap(maskBlob),
    ]);
    const { width, height } = originalBitmap;

    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = width;
    originalCanvas.height = height;
    const originalCtx = originalCanvas.getContext('2d');
    originalCtx.drawImage(originalBitmap, 0, 0, width, height);
    cachedOriginalImageData = originalCtx.getImageData(0, 0, width, height);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.drawImage(maskBitmap, 0, 0, width, height);
    cachedMaskImageData = maskCtx.getImageData(0, 0, width, height);

    aggressivenessSlider.value = '50';
    aggressivenessValue.textContent = '50%';
    renderComposite();
    setProgress(100, 'Completato');
    window.setTimeout(() => { progressPanel.hidden = true; result.hidden = false; }, 350);
  } catch (error) {
    console.error(error);
    showError('Non è stato possibile elaborare questa immagine. Controlla la connessione e riprova.');
  }
}

fileInput.addEventListener('change', () => processImage(fileInput.files[0]));
['dragenter', 'dragover'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add('is-dragging'); }));
['dragleave', 'drop'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove('is-dragging'); }));
dropzone.addEventListener('drop', (event) => processImage(event.dataTransfer.files[0]));
aggressivenessSlider.addEventListener('input', () => {
  aggressivenessValue.textContent = `${aggressivenessSlider.value}%`;
  renderComposite();
});
document.querySelector('#reset-button').addEventListener('click', () => {
  result.hidden = true;
  errorBox.hidden = true;
  fileInput.value = '';
  cachedOriginalImageData = undefined;
  cachedMaskImageData = undefined;
  dropzone.focus();
});