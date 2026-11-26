// Sound, all synthesised with WebAudio — no audio files. Engine hum follows the
// throttle, wind follows speed, and rings, landings and crashes get their own cues.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windSource = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    // Engine: two detuned saws through a lowpass, quiet at idle, louder with throttle.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 58;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    engineOsc2.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    engineOsc2.start();
    // Wind: looped noise buffer through a bandpass.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    windSource = ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSource.start();
    return true;
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function update(throttle, speed, flying) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    engineGain.gain.setTargetAtTime(flying ? 0.02 + throttle * 0.05 : 0.012, t, 0.1);
    engineOsc.frequency.setTargetAtTime(52 + throttle * 95, t, 0.1);
    engineOsc2.frequency.setTargetAtTime(55 + throttle * 98, t, 0.1);
    windGain.gain.setTargetAtTime(flying ? Math.min(0.09, speed * 0.0016) : 0, t, 0.15);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  return {
    unlock,
    update,
    ring() {
      blip(660, 0.16, 'sine', 0.18);
      blip(880, 0.2, 'sine', 0.18, 0.09);
      blip(1320, 0.3, 'sine', 0.14, 0.18);
    },
    land() {
      blip(440, 0.25, 'triangle', 0.18);
      blip(587, 0.35, 'triangle', 0.18, 0.12);
    },
    crash() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const len = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(t);
      blip(70, 0.5, 'sine', 0.4);
    },
    toggleMute() {
      muted = !muted;
      if (ctx) {
        engineGain.gain.value = 0;
        windGain.gain.value = 0;
      }
      return muted;
    },
  };
}
