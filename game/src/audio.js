// All sound is synthesized with WebAudio — no audio files, no network.
// The context is created lazily on the first user gesture (browsers block
// audio before that), and every effect is a few oscillators + envelopes.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenTimer = null;
  let sirenOn = false;
  let musicTimer = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol || 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.25, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    unlock() { ensure(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    // Engine hum follows the car's speed (0..1).
    engine(speed01) {
      if (!ensure() || muted) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + speed01 * 130;
      engineGain.gain.value = 0.02 + speed01 * 0.05;
    },
    engineOff() {
      if (engineGain) engineGain.gain.value = 0;
    },
    crash() { noiseBurst(0.25, 0.4, 900); tone(70, 0.2, 'square', 0.2, 40); },
    steal() { tone(520, 0.12, 'square', 0.15); setTimeout(() => tone(760, 0.14, 'square', 0.15), 110); },
    pickup() { tone(880, 0.09, 'sine', 0.2); setTimeout(() => tone(1318, 0.12, 'sine', 0.2), 90); },
    punch() { noiseBurst(0.08, 0.3, 2000); },
    missionDone() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.22), i * 120));
    },
    busted() { tone(392, 0.3, 'sawtooth', 0.2, 196); setTimeout(() => tone(196, 0.5, 'sawtooth', 0.2, 98), 280); },
    // Two-tone police siren while wanted >= 1.
    siren(on) {
      if (on === sirenOn) return;
      sirenOn = on;
      if (on) {
        let high = true;
        sirenTimer = setInterval(() => {
          if (muted) return;
          tone(high ? 720 : 540, 0.32, 'sine', 0.05);
          high = !high;
        }, 340);
      } else if (sirenTimer) {
        clearInterval(sirenTimer);
        sirenTimer = null;
      }
    },
    // A lazy sunset groove: a bass line that loops while the game runs.
    music(on) {
      if (on && !musicTimer) {
        const bass = [110, 110, 130.8, 98, 110, 110, 146.8, 164.8];
        let i = 0;
        musicTimer = setInterval(() => {
          if (!muted) tone(bass[i % bass.length], 0.42, 'triangle', 0.06);
          i++;
        }, 430);
      } else if (!on && musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
  };
}
