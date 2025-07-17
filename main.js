import { SoundTouch, SimpleFilter } from "./soundtouch.js";
// Basic LoopMe logic using Wavesurfer.js and SoundTouch library
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

// Load local file
const fileInput = document.getElementById('audio-upload');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    wavesurfer.load(url);
  }
});

// Play/pause
const playBtn = document.getElementById('play-btn');
playBtn.addEventListener('click', () => {
  wavesurfer.playPause();
});

// Toggle looping region
const loopBtn = document.getElementById('loop-btn');
loopBtn.addEventListener('click', () => {
  looping = !looping;
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
  source = { extract: (target, numFrames, position) => {
      const l = buffer.getChannelData(0).slice(position, position + numFrames);
      const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).slice(position, position + numFrames) : l;
      target.getChannelData(0).set(l);
      if (target.numberOfChannels > 1) target.getChannelData(1).set(r);
      return Math.min(numFrames, buffer.length - position);
    }
  };
  soundtouch = new SoundTouch(context.sampleRate);
  soundtouch.tempo = tempoControl.value / 100;
  soundtouch.pitch = Math.pow(2, pitchControl.value / 12);
  tempoProcessor = new SimpleFilter(source, soundtouch);

  // Clear previous region
  wavesurfer.clearRegions();
  const duration = wavesurfer.getDuration();
  currentRegion = wavesurfer.addRegion({
    start: 0,
    end: Math.min(5, duration),
    drag: true,
    resize: true,
    loop: false
  });
});

// Loop playback
wavesurfer.on('region-out', (region) => {
  if (looping && region.id === currentRegion.id) {
    region.play();
  }
});

// Use soundtouch for playback
wavesurfer.on('play', () => {
  if (!tempoProcessor) return;
  wavesurfer.backend.setFilter(tempoProcessor);
});

wavesurfer.on('pause', () => {
  wavesurfer.backend.setFilter(null);
});
