// Sound, synthesised live with WebAudio — no audio files, no network. The
// engine is a low sawtooth pair whose pitch follows the throttle, with wind
// noise through a low-pass filter that grows with speed. Rings chime, fuel
// cells ping, the low-fuel alarm beeps, and a crash is a burst of noise.
// Nothing starts until the pilot's first gesture: browsers forbid sound
// before that, and the game honours it.

// Notes: every sound is made by the browser, never fetched. The engine and
// the wind are the only continuous sounds; everything else is a short tone
// or burst fired once per event, so the soundscape stays out of the way of
// the flying.
export function createAudio() {
  let context = null;
  let engine = null;
  let engineGain = null;
  let wind = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let alarmTimer = 0;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
    } catch {
      return false;
    }
    // Engine: two detuned sawtooths, quiet, through a gentle low-pass.
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engine = [context.createOscillator(), context.createOscillator()];
    engine[0].type = 'sawtooth';
    engine[1].type = 'sawtooth';
    engine[0].frequency.value = 52;
    engine[1].frequency.value = 78;
    engine[0].connect(engineFilter);
    engine[1].connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(context.destination);
    engine[0].start();
    engine[1].start();
    // Wind: looped noise through a low-pass that opens with speed.
    const noiseLength = context.sampleRate * 2;
    const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseLength; index += 1) data[index] = Math.random() * 2 - 1;
    wind = context.createBufferSource();
    wind.buffer = noiseBuffer;
    wind.loop = true;
    windFilter = context.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 300;
    windGain = context.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(context.destination);
    wind.start();
    return true;
  }

  function tone(frequency, duration, type, volume, when) {
    if (!context || muted) return;
    const start = context.currentTime + (when || 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  return {
    /** Call from the first user gesture; safe to call any number of times. */
    unlock() {
      ensure();
    },
    /** The engine follows the throttle (0..1) and the speed (0..1 of max). */
    engine(throttle, speed01) {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      const base = 46 + throttle * 58 + speed01 * 22;
      engine[0].frequency.setTargetAtTime(base, now, 0.08);
      engine[1].frequency.setTargetAtTime(base * 1.5, now, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + throttle * 0.05, now, 0.1);
      windFilter.frequency.setTargetAtTime(240 + speed01 * 900, now, 0.1);
      windGain.gain.setTargetAtTime(speed01 * 0.06, now, 0.1);
    },
    ring() {
      tone(880, 0.35, 'sine', 0.16);
      tone(1318, 0.5, 'sine', 0.12, 0.07);
    },
    cell() {
      tone(1174, 0.25, 'sine', 0.14);
      tone(1568, 0.3, 'sine', 0.1, 0.06);
    },
    hit() {
      tone(140, 0.3, 'square', 0.16);
      tone(90, 0.4, 'sawtooth', 0.14, 0.02);
    },
    alarm(dt) {
      if (!context || muted) return;
      alarmTimer -= dt;
      if (alarmTimer <= 0) {
        alarmTimer = 0.9;
        tone(660, 0.16, 'square', 0.08);
      }
    },
    crash() {
      if (!context || muted) return;
      const duration = 0.7;
      const noiseBuffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
      }
      const source = context.createBufferSource();
      source.buffer = noiseBuffer;
      const gain = context.createGain();
      gain.gain.value = 0.3;
      source.connect(gain);
      gain.connect(context.destination);
      source.start();
      if (engineGain) engineGain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      if (windGain) windGain.gain.setTargetAtTime(0, context.currentTime, 0.05);
    },
    land() {
      tone(523, 0.3, 'sine', 0.14);
      tone(659, 0.3, 'sine', 0.14, 0.12);
      tone(784, 0.5, 'sine', 0.14, 0.24);
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
  };
}
