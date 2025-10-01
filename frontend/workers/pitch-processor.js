class PitchEnergyProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = 0;
    this.buf = new Float32Array(2048);
    this.idx = 0;
  }

  static get parameterDescriptors() { return []; }

  // Simple energy + autocorrelation-based pitch estimate (demo-level)
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    for (let i=0; i<ch.length; i++) {
      this.buf[this.idx++] = ch[i];
      if (this.idx >= this.buf.length) {
        const f0 = this.estimatePitch(this.buf, sampleRate);
        const energy = this.rootMeanSquare(this.buf);
        this.port.postMessage({ type: 'frame', f0, energy, confidence: f0>0?0.8:0.2 });
        this.idx = 0;
      }
    }
    return true;
  }

  rootMeanSquare(buf) {
    let s=0.0; for (let i=0;i<buf.length;i++){ s += buf[i]*buf[i]; }
    return Math.sqrt(s/buf.length);
  }

  estimatePitch(buf, sr) {
    // Basic ACF to find period (not production-ready, good enough for HUD preview)
    const n = buf.length;
    let maxLag = Math.floor(sr/60); // ~60 Hz floor
    let minLag = Math.floor(sr/1000); // ~1 kHz ceil
    let bestLag = -1, best = 0;
    for (let lag=minLag; lag<maxLag; lag++) {
      let sum=0;
      for (let i=0; i<n-lag; i++) sum += buf[i]*buf[i+lag];
      if (sum>best) { best=sum; bestLag=lag; }
    }
    if (bestLag>0) return sr/bestLag;
    return 0;
  }
}

registerProcessor('pitch-energy-processor', PitchEnergyProcessor);