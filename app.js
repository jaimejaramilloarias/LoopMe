// Minimal loop player derived from AudioMass engine logic
// Uses Wavesurfer.js for waveform rendering and region selection
const wavesurfer = WaveSurfer.create({
  container: '#waveform',
  height: 128,
  waveColor: '#999',
  progressColor: '#555',
  cursorColor: '#333',
  plugins: [
    WaveSurfer.regions.create({ dragSelection: { slop: 5 } })
  ]
});

let currentRegion = null;

// load local audio file
const fileInput = document.getElementById('file');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    wavesurfer.loadBlob(file);
  }
});

wavesurfer.on('ready', () => {
  // create full length region on load
  const duration = wavesurfer.getDuration();
  currentRegion = wavesurfer.addRegion({
    start: 0,
    end: duration,
    loop: true,
    drag: true,
    resize: true
  });
});

// update reference when region is changed
wavesurfer.on('region-updated', (region) => {
  currentRegion = region;
});

// simple loop playback
function playLoop() {
  if (!currentRegion) return;
  const start = currentRegion.start;
  const end = currentRegion.end;
  wavesurfer.play(start, end);
}

document.getElementById('play').addEventListener('click', () => {
  if (wavesurfer.isPlaying()) {
    wavesurfer.pause();
  } else {
    playLoop();
  }
});

// toggle loop property from AudioMass code style
// snippet inspired by engine.js (RequestSetLoop)
document.getElementById('toggle-loop').addEventListener('click', () => {
  if (!currentRegion) return;
  currentRegion.loop = !currentRegion.loop;
  if (currentRegion.loop && wavesurfer.isPlaying()) {
    wavesurfer.play(currentRegion.start, currentRegion.end);
  }
});
