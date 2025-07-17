// Migrated to AudioWorkletNode for SoundTouch processing
// Basic LoopMe logic using Wavesurfer.js and SoundTouch library
// Procesamiento de audio a traves de AudioWorklet para tempo y pitch
let wavesurfer = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#a0a0a0',
  progressColor: '#333',
  plugins: [
    WaveSurfer.Regions.create({})
  ]
});

let currentRegion = null;
let looping = false;
let filterNode = null;
let loopRAF = null;
let workletLoaded = false;
let currentSourcePosition = 0;
// Nivel de zoom en px por segundo aplicado a la onda
let zoomLevel = 100;

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
    alert("AudioWorklet no soportado en este navegador.");
    return false;
  }
  if (!workletLoaded) {
    try {
      await context.audioWorklet.addModule("soundtouch-processor.js");
      workletLoaded = true;
    } catch (e) {
      console.error(e);
      alert("No se pudo cargar el procesador de audio.");
      return false;
    }
  }
  return true;
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

// ----- Precise loop control -----
function startSync() {
  if (loopRAF) cancelAnimationFrame(loopRAF);
  const buffer = wavesurfer.backend.buffer;
  const sampleRate = buffer.sampleRate;
  const duration = wavesurfer.getDuration();
  const step = async () => {
    if (!wavesurfer.isPlaying()) return;
    let current = filterNode
      ? currentSourcePosition / sampleRate
      : wavesurfer.getCurrentTime();

    if (looping && currentRegion) {
      const { start, end } = currentRegion;
      if (current >= end) {
        await createSoundTouchFilter(start);
        wavesurfer.seekTo(start / duration);
        current = start;
      }
    }

    wavesurfer.drawer.progress(current / duration);
    loopRAF = requestAnimationFrame(step);
  };
  step();
}

function stopSync() {
  if (loopRAF) cancelAnimationFrame(loopRAF);
  loopRAF = null;
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
