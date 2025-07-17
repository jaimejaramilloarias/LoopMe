// Migrated to AudioWorkletNode for SoundTouch processing
// Basic LoopMe logic using Wavesurfer.js and SoundTouch library
// Procesamiento de audio a traves de AudioWorklet para tempo y pitch
let wavesurfer = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#a0a0a0',
  progressColor: '#333',
  plugins: [
    WaveSurfer.regions.create({}),
    WaveSurfer.markers.create({})
  ]
});

let currentRegion = null;
let looping = false;
let filterNode = null;
let workletLoaded = false;
let currentSourcePosition = 0;
// Latencia estimada en samples que introduce el procesamiento SoundTouch
const PROCESS_LATENCY_SAMPLES = 4096;
// Nivel de zoom en px por segundo aplicado a la onda
let zoomLevel = 100;
// Compensación fija para el reinicio del loop en milisegundos
const LOOP_OFFSET_MS = 100;

// Lista de tiempos de ataque detectados en el audio
let transientPoints = [];
// Umbral en segundos para "magnetizar" los límites del loop
const snapThreshold = 0.05; // 50ms

let hasInteracted = false;

function handleInteraction() {
  hasInteracted = true;
  resumeContext();
}
function resumeContext() {
  const ctx = wavesurfer.backend.getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

async function ensureWorklet(context) {
  if (!context || !context.audioWorklet) {
    console.warn("AudioWorklet no soportado en este navegador.");
    return false;
  }

  if (!workletLoaded) {
    // Ruta absoluta al procesador para evitar problemas al usar file:// en Electron
    const moduleUrl = new URL('./soundtouch-processor.js', import.meta.url);
    try {
      await context.audioWorklet.addModule(moduleUrl.href);
      workletLoaded = true;
    } catch (e) {
      console.error(e);
      alert("No se pudo cargar el procesador de audio.");
      return false;
    }
  }

  return true;
}

// Analiza el buffer de audio para detectar transientes.
// Devuelve un arreglo de tiempos (en segundos) donde se han encontrado ataques.
function detectTransients(buffer) {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const frameSize = 1024;
  const hopSize = 512;
  const rms = [];
  for (let i = 0; i < data.length; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < frameSize && i + j < data.length; j++) {
      const val = data[i + j];
      sum += val * val;
    }
    rms.push(Math.sqrt(sum / frameSize));
  }
  const diff = [];
  for (let i = 1; i < rms.length; i++) {
    diff.push(Math.max(0, rms[i] - rms[i - 1]));
  }
  const maxDiff = Math.max(...diff);
  const threshold = maxDiff * 0.3;
  const times = [];
  const searchRadius = 2; // frames around the transient to find the real peak
  for (let i = 1; i < diff.length - 1; i++) {
    if (diff[i] > threshold && diff[i] > diff[i - 1] && diff[i] >= diff[i + 1]) {
      let peakIndex = i;
      let peakValue = rms[i];
      // Busca el valor máximo de RMS cercano para ubicar el snap exactamente en el ataque audible
      for (let j = -searchRadius; j <= searchRadius; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < rms.length && rms[idx] > peakValue) {
          peakValue = rms[idx];
          peakIndex = idx;
        }
      }
      times.push((peakIndex * hopSize) / sampleRate);
    }
  }
  return times;
}

// Devuelve el tiempo de transiente más cercano si está dentro del umbral
function snapToTransient(time) {
  if (!transientPoints.length) return time;
  let nearest = transientPoints[0];
  let minDiff = Math.abs(time - nearest);
  for (let i = 1; i < transientPoints.length; i++) {
    const diff = Math.abs(time - transientPoints[i]);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = transientPoints[i];
    }
  }
  return minDiff <= snapThreshold ? nearest : time;
}

// ensure the AudioContext resumes on the first user interaction
document.addEventListener("click", handleInteraction, { once: true });
document.addEventListener("keydown", handleInteraction, { once: true });
document.addEventListener("touchstart", handleInteraction, { once: true });

// Load local file
const fileInput = document.getElementById('audio-upload');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    handleInteraction();
    const url = URL.createObjectURL(file);
    wavesurfer.load(url);
    wavesurfer.once('decode', () => URL.revokeObjectURL(url));
  }
});

// Play/pause
const playBtn = document.getElementById('play-btn');
playBtn.addEventListener('click', async () => {
  handleInteraction();
  if (wavesurfer.isPlaying()) {
    wavesurfer.pause();
  } else {
    await createSoundTouchFilter(wavesurfer.getCurrentTime());
    wavesurfer.play();
  }
});

// Toggle looping region
const loopBtn = document.getElementById('loop-btn');
loopBtn.textContent = 'Loop Off';
loopBtn.addEventListener('click', () => {
  looping = !looping;
  loopBtn.textContent = looping ? 'Loop On' : 'Loop Off';
  if (currentRegion) {
    currentRegion.update({ loop: looping });
  }
});

// Playback rate control (tempo without pitch change)
const tempoControl = document.getElementById('tempo');
// Control parameters passed to the AudioWorkletProcessor

tempoControl.addEventListener('input', () => {
  const rate = tempoControl.value / 100;
  if (filterNode) {
    filterNode.port.postMessage({ type: 'params', tempo: rate });
  }
});

// Pitch control using soundtouch
const pitchControl = document.getElementById('pitch');
pitchControl.addEventListener('input', () => {
  const semitones = Number(pitchControl.value);
  if (filterNode) {
    filterNode.port.postMessage({
      type: 'params',
      pitch: Math.pow(2, semitones / 12)
    });
  }
});

// Zoom control slider y botones de zoom in/out
const zoomControl = document.getElementById('zoom');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');

// Cambia el nivel de zoom aplicando .zoom(pxPerSec)
function applyZoom(value) {
  zoomLevel = value;
  wavesurfer.zoom(zoomLevel);
  zoomControl.value = zoomLevel;
}

zoomControl.addEventListener('input', () => {
  applyZoom(Number(zoomControl.value));
});

zoomInBtn.addEventListener('click', () => {
  const step = 20;
  const max = Number(zoomControl.max);
  applyZoom(Math.min(zoomLevel + step, max));
});

zoomOutBtn.addEventListener('click', () => {
  const step = 20;
  const min = Number(zoomControl.min);
  applyZoom(Math.max(zoomLevel - step, min));
});

async function createSoundTouchFilter(startTime = 0) {
  const context = wavesurfer.backend.getAudioContext();
  const ok = await ensureWorklet(context);
  if (!ok) return;
  const buffer = wavesurfer.backend.buffer;
  const node = new AudioWorkletNode(context, 'soundtouch-processor');
  node.port.onmessage = (e) => {
    if (e.data.type === 'position') {
      currentSourcePosition = e.data.position;
    }
  };
  const channels = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i).slice());
  }
  node.port.postMessage({
    type: 'init',
    channels,
    tempo: tempoControl.value / 100,
    pitch: Math.pow(2, pitchControl.value / 12),
    startPosition: Math.floor(startTime * buffer.sampleRate)
  });
  filterNode = node;
  wavesurfer.backend.setFilter(filterNode);
}

// Region creation for loop
wavesurfer.on('ready', async () => {
  // Create filter chain when audio is decoded
  await createSoundTouchFilter(0);

  // Detect transients and mostrar marcas
  const buffer = wavesurfer.backend.buffer;
  transientPoints = detectTransients(buffer);
  wavesurfer.clearMarkers();
  transientPoints.forEach((t) => {
    wavesurfer.addMarker({ time: t, color: '#f00' });
  });

  // Clear previous region
  wavesurfer.clearRegions();
  const duration = wavesurfer.getDuration();
  // Activar loop en toda la duración del audio por defecto
  looping = true;
  loopBtn.textContent = 'Loop On';
  currentRegion = wavesurfer.addRegion({
    start: 0,
    end: duration,
    drag: true,
    resize: true,
    loop: true
  });

  // Aplicar el nivel de zoom actual al cargar
  wavesurfer.zoom(zoomLevel);
  zoomControl.value = zoomLevel;
});

// ----- Precise loop control using the audioprocess event -----
let loopHandler = null; // reference to the current audioprocess callback

function startSync() {
  stopSync();
  const context = wavesurfer.backend.getAudioContext();
  const buffer = wavesurfer.backend.buffer;
  const sampleRate = buffer.sampleRate;
  const baseLatency = context.baseLatency || 0;
  const latencyTime = PROCESS_LATENCY_SAMPLES / sampleRate + baseLatency;
  const duration = wavesurfer.getDuration();
  loopHandler = async (time) => {
    let current = filterNode ? currentSourcePosition / sampleRate : time;
    // Aplica la compensación fija en cada reinicio del loop
    const offsetTime = LOOP_OFFSET_MS / 1000; // cambiar LOOP_OFFSET_MS si es necesario

    if (looping && currentRegion) {
      const { start, end } = currentRegion;
      // Reiniciar cerca del final del loop sumando la compensación fija
      if (current >= end + offsetTime - latencyTime) {
        await createSoundTouchFilter(start);
        wavesurfer.seekTo(start / duration); // sincroniza la vista
        current = start;
      }
    }

    wavesurfer.drawer.progress(current / duration);
  };

  wavesurfer.on('audioprocess', loopHandler);
}

function stopSync() {
  if (loopHandler) {
    wavesurfer.un('audioprocess', loopHandler);
    loopHandler = null;
  }
}

// Use soundtouch for playback and begin sync loop
wavesurfer.on('play', () => {
  if (filterNode) {
    wavesurfer.backend.setFilter(filterNode);
  }
  startSync();
});

wavesurfer.on('pause', () => {
  wavesurfer.backend.setFilter();
  stopSync();
});

// Ajuste magnético de los límites del loop al terminar de mover una región
wavesurfer.on('region-update-end', (region) => {
  const start = snapToTransient(region.start);
  const end = snapToTransient(region.end);
  region.update({ start, end });
});
