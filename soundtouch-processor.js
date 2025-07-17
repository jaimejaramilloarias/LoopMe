import { SoundTouch, SimpleFilter } from './soundtouch.js';

class WorkletBufferSource {
  constructor(channels, loopStart = 0, loopEnd = null, position = null) {
    this.channels = channels;
    this.loopStart = loopStart;
    this.loopEnd = loopEnd !== null ? loopEnd : channels[0].length;
    this._position = position !== null ? position : loopStart;
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
  setLoopPoints(start, end, position = start) {
    this.loopStart = start;
    this.loopEnd = end;
    this._position = position;
  }
  extract(target, numFrames = 0, position = 0) {
    this._position = position;
    const left = this.channels[0];
    const right = this.dualChannel ? this.channels[1] : left;
    const loopLen = this.loopEnd - this.loopStart;
    for (let i = 0; i < numFrames; i++) {
      let idx = position + i;
      if (idx >= this.loopEnd) {
        idx = this.loopStart + ((idx - this.loopStart) % loopLen);
      }
      if (idx < left.length) {
        target[i * 2] = left[idx];
        target[i * 2 + 1] = right[idx];
      } else {
        target[i * 2] = 0;
        target[i * 2 + 1] = 0;
      }
    }
    this._position = this.loopStart + (((position + numFrames) - this.loopStart) % loopLen);
    return numFrames;
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
      const { channels, tempo, pitch, position, loopStart, loopEnd } = data;
      const source = new WorkletBufferSource(channels, loopStart, loopEnd, position);
      const st = new SoundTouch(sampleRate);
      st.tempo = tempo;
      st.pitch = pitch;
      this.filter = new SimpleFilter(source, st, () => {
        this.port.postMessage({ type: 'ended' });
      });
      this.filter.sourcePosition = position;
      this.filter.position = 0;
    } else if (data.type === 'params' && this.filter) {
      const params = {};
      if (typeof data.tempo === 'number') params.tempo = data.tempo;
      if (typeof data.pitch === 'number') params.pitch = data.pitch;
      if (Object.keys(params).length) {
        this.filter._pipe.updateParams(params);
        console.log('SoundTouchProcessor params updated', params);
      }
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
      if (i < extracted) {
        left[i] = this.samples[i * 2];
        right[i] = this.samples[i * 2 + 1];
      } else {
        left[i] = 0;
        right[i] = 0;
      }
    }
    if (extracted === 0) {
      this.filter.onEnd();
    }
    const pos = this.filter.sourceSound.position;
    this.port.postMessage({ type: 'position', position: pos });
    return true;
  }
}

registerProcessor('soundtouch-processor', SoundTouchProcessor);
