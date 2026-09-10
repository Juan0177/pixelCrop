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

import { removeBackground } from './assets/js/background-removal.js';

// URL assoluto richiesto dalla libreria: new URL(relative, base) rifiuta basi relative.
const modelsPublicPath = new URL('./assets/models/dist/', import.meta.url).href;

let originalUrl;
let resultUrl;

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
    const blob = await removeBackground(file, {
      publicPath: modelsPublicPath,
      model: 'medium',
      progress: (key, current, total) => {
        const percent = total ? 15 + (current / total) * 78 : 30;
        setProgress(percent, key.startsWith('fetch:') ? 'Preparazione modello' : 'Rimozione sfondo');
      },
    });
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    resultImage.src = resultUrl;
    downloadButton.href = resultUrl;
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
document.querySelector('#reset-button').addEventListener('click', () => { result.hidden = true; errorBox.hidden = true; fileInput.value = ''; dropzone.focus(); });