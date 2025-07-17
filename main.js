import { SoundTouch, SimpleFilter, WebAudioBufferSource, getWebAudioNode } from "./soundtouch.js";
// Basic LoopMe logic using Wavesurfer.js and SoundTouch library
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
  wavesurfer.playPause();
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

// Region creation for loop
wavesurfer.on('ready', () => {
  // Setup soundtouch when audio ready
  const context = wavesurfer.backend.getAudioContext();
  const buffer = wavesurfer.backend.buffer;
  source = new WebAudioBufferSource(buffer);
  soundtouch = new SoundTouch(context.sampleRate);
  soundtouch.tempo = tempoControl.value / 100;
  soundtouch.pitch = Math.pow(2, pitchControl.value / 12);
  tempoProcessor = new SimpleFilter(source, soundtouch);
  filterNode = getWebAudioNode(context, tempoProcessor);

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

// Loop playback
wavesurfer.on('region-out', (region) => {
  if (looping && region.id === currentRegion.id) {
    // Reset filter processing for the new loop cycle
    const startSample = Math.floor(region.start * wavesurfer.backend.buffer.sampleRate);
    if (tempoProcessor && source) {
      // Reset positions so SoundTouch processes from the loop start
      source.position = startSample;
      tempoProcessor.sourcePosition = startSample;
      tempoProcessor.position = 0;
      tempoProcessor.clear();
    }

    // Reconnect filter node to restart ScriptProcessorNode
    wavesurfer.backend.setFilter();
    wavesurfer.backend.setFilter(filterNode);

    region.play();
  }
});

// Use soundtouch for playback
wavesurfer.on('play', () => {
  if (!tempoProcessor) return;
  wavesurfer.backend.setFilter(filterNode);
});

wavesurfer.on('pause', () => {
  // Clear filters by calling setFilter with no arguments
  wavesurfer.backend.setFilter();
});
