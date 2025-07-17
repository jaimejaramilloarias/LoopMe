import { SoundTouch, SimpleFilter } from './soundtouch.js';

class WorkletBufferSource {
  constructor(channels) {
    this.channels = channels;
    this._position = 0;
  }
  get position() {
    return this._position;
  }
  set position(val) {
    this._position = val;
  }
  get dualChannel() {
    return this.channels.length > 1;
  }
  extract(target, numFrames = 0, position = 0) {
    this._position = position;
    const left = this.channels[0];
    const right = this.dualChannel ? this.channels[1] : left;
    for (let i = 0; i < numFrames; i++) {
      const idx = i + position;
      if (idx < left.length) {
        target[i * 2] = left[idx];
        target[i * 2 + 1] = right[idx];
      } else {
        target[i * 2] = 0;
        target[i * 2 + 1] = 0;
      }
    }
    return Math.min(numFrames, left.length - position);
  }
}

class SoundTouchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.filter = null;
    this.samples = new Float32Array(128 * 2);
    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const data = event.data;
    if (data.type === 'init') {
      const { channels, tempo, pitch, startPosition } = data;
      const source = new WorkletBufferSource(channels);
      const st = new SoundTouch(sampleRate);
      st.tempo = tempo;
      st.pitch = pitch;
      this.filter = new SimpleFilter(source, st, () => {
        this.port.postMessage({ type: 'ended' });
      });
      this.filter.sourcePosition = startPosition;
      this.filter.position = 0;
    } else if (data.type === 'params' && this.filter) {
      if (typeof data.tempo === 'number') this.filter._pipe.tempo = data.tempo;
      if (typeof data.pitch === 'number') this.filter._pipe.pitch = data.pitch;
    }
  }

  process(inputs, outputs) {
    if (!this.filter) return true;
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || left;
    const frames = left.length;
    if (this.samples.length < frames * 2) {
      this.samples = new Float32Array(frames * 2);
    }
    const extracted = this.filter.extract(this.samples, frames);
    for (let i = 0; i < frames; i++) {
      left[i] = this.samples[i * 2];
      right[i] = this.samples[i * 2 + 1];
    }
    if (extracted === 0) {
      this.filter.onEnd();
    }
    this.port.postMessage({ type: 'position', position: this.filter.sourcePosition });
    return true;
  }
}

registerProcessor('soundtouch-processor', SoundTouchProcessor);
