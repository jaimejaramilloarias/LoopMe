import { SoundTouch, SimpleFilter, WebAudioBufferSource, getWebAudioNode } from "./soundtouch.js";
// Basic LoopMe logic using Wavesurfer.js and SoundTouch library
// Nota: SoundTouch aún utiliza ScriptProcessorNode, que está deprecado en
// navegadores modernos. En un futuro se debería migrar a AudioWorkletNode.
let wavesurfer = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#a0a0a0',
  progressColor: '#333',
  plugins: [
    WaveSurfer.regions.create({})
  ]
});

let currentRegion = null;
let looping = false;
let filterNode = null;
let loopRAF = null;

function resumeContext() {
  const ctx = wavesurfer.backend.getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

// ensure the AudioContext resumes on the first user interaction
document.addEventListener('click', resumeContext, { once: true });
document.addEventListener('keydown', resumeContext, { once: true });
document.addEventListener('touchstart', resumeContext, { once: true });

// Load local file
const fileInput = document.getElementById('audio-upload');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    resumeContext();
    const url = URL.createObjectURL(file);
    wavesurfer.load(url);
    wavesurfer.once('decode', () => URL.revokeObjectURL(url));
  }
});

// Play/pause
const playBtn = document.getElementById('play-btn');
playBtn.addEventListener('click', () => {
  resumeContext();
  if (wavesurfer.isPlaying()) {
    wavesurfer.pause();
  } else {
    createSoundTouchFilter(wavesurfer.getCurrentTime());
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
// We'll use SoundTouch to stretch tempo while preserving pitch
let source = null;
let soundtouch = null;
let tempoProcessor = null;

tempoControl.addEventListener('input', () => {
  const rate = tempoControl.value / 100;
  if (!source) return;
  soundtouch.tempo = rate;
});

// Pitch control using soundtouch
const pitchControl = document.getElementById('pitch');
pitchControl.addEventListener('input', () => {
  if (!source) return;
  const semitones = Number(pitchControl.value);
  soundtouch.pitch = Math.pow(2, semitones / 12);
});

function createSoundTouchFilter(startTime = 0) {
  const context = wavesurfer.backend.getAudioContext();
  const buffer = wavesurfer.backend.buffer;
  source = new WebAudioBufferSource(buffer);
  soundtouch = new SoundTouch(context.sampleRate);
  soundtouch.tempo = tempoControl.value / 100;
  soundtouch.pitch = Math.pow(2, pitchControl.value / 12);
  tempoProcessor = new SimpleFilter(source, soundtouch);
  // posicionar con precisión el inicio del buffer y reiniciar historial
  tempoProcessor.sourcePosition = Math.floor(startTime * buffer.sampleRate);
  tempoProcessor.position = 0;
  // Recreate ScriptProcessorNode every cycle for a clean state
  filterNode = getWebAudioNode(context, tempoProcessor);
  wavesurfer.backend.setFilter(filterNode);
}

// Region creation for loop
wavesurfer.on('ready', () => {
  // Create filter chain when audio is decoded
  createSoundTouchFilter(0);

  // Clear previous region
  wavesurfer.clearRegions();
  const duration = wavesurfer.getDuration();
  currentRegion = wavesurfer.addRegion({
    start: 0,
    end: Math.min(5, duration),
    drag: true,
    resize: true,
    loop: looping
  });
});

// ----- Precise loop control -----
function startSync() {
  if (loopRAF) cancelAnimationFrame(loopRAF);
  const buffer = wavesurfer.backend.buffer;
  const sampleRate = buffer.sampleRate;
  const duration = wavesurfer.getDuration();
  const step = () => {
    if (!wavesurfer.isPlaying()) return;
    let current = tempoProcessor
      ? tempoProcessor.sourcePosition / sampleRate
      : wavesurfer.getCurrentTime();

    if (looping && currentRegion) {
      const { start, end } = currentRegion;
      if (current >= end) {
        createSoundTouchFilter(start);
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
  if (tempoProcessor) {
    wavesurfer.backend.setFilter(filterNode);
  }
  startSync();
});

wavesurfer.on('pause', () => {
  wavesurfer.backend.setFilter();
  stopSync();
});
