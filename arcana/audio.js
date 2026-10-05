// Synthesised arcade SFX + a soft generative music bed (no audio files). Starts on first user gesture.
const Sound = (() => {
  let ctx = null, master = null, musicBus = null, muted = false, musicTimer = null, mood = "forest";
  const MOODS = { forest: [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 330]], cave: [[174, 208, 262], [155, 196, 233], [165, 208, 247], [147, 185, 220]], volcano: [[110, 165, 207], [98, 147, 185], [104, 156, 196], [92, 138, 175]] };

  function init() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master); startMusic();
  }
  const ok = () => ctx && !muted;
  function tone(f, dur = 0.12, { type = "square", vol = 0.12, slide = 0, delay = 0, bus = master } = {}) {
    if (!ok()) return; const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur = 0.2, vol = 0.1, freq = 1200, delay = 0) {
    if (!ok()) return; const t = ctx.currentTime + delay, n = ctx.sampleRate * dur, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  function startMusic() {
    const play = () => {
      if (!ctx) return; const chords = MOODS[mood] || MOODS.forest; const ch = chords[Math.floor(performance.now() / 6000) % chords.length], t = ctx.currentTime;
      ch.forEach((f, i) => { for (const det of [-6, 6]) { const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = "sawtooth"; o.frequency.value = f / (i ? 1 : 2); o.detune.value = det; lp.type = "lowpass"; lp.frequency.value = 520; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 2.2); g.gain.linearRampToValueAtTime(0.0001, t + 6.2); o.connect(lp); lp.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 6.4); } });
      for (let i = 0; i < 3; i++) tone(ch[Math.floor(Math.random() * 3)] * 4, 1.2, { type: "sine", vol: 0.025, delay: 1 + i * 1.7, bus: musicBus });
    };
    play(); musicTimer = setInterval(play, 6000);
  }
  const bus = { init, setMood(m) { mood = m; },
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; return muted; }, isMuted: () => muted,
    hover: () => tone(1400, 0.04, { vol: 0.04, type: "square" }),
    click: () => { tone(660, 0.07, { vol: 0.09 }); tone(990, 0.09, { vol: 0.07, delay: 0.05 }); },
    open: () => { tone(300, 0.2, { type: "sawtooth", vol: 0.06, slide: 500 }); noise(0.18, 0.05, 2400); },
    jump: () => tone(300, 0.18, { vol: 0.08, slide: 380 }),
    land: () => noise(0.08, 0.05, 300),
    collect: () => { tone(880, 0.08, { vol: 0.09 }); tone(1320, 0.14, { vol: 0.09, delay: 0.07 }); },
    correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { vol: 0.1, delay: i * 0.07 })),
    wrong: () => { tone(200, 0.28, { type: "sawtooth", vol: 0.12, slide: -90 }); noise(0.2, 0.08, 400); },
    cast: () => { tone(500, 0.3, { type: "sawtooth", vol: 0.07, slide: 900 }); noise(0.3, 0.05, 3000); },
    hit: () => { noise(0.25, 0.14, 500); tone(120, 0.25, { type: "sawtooth", vol: 0.12, slide: -60 }); },
    boss: () => { tone(70, 1.2, { type: "sawtooth", vol: 0.16, slide: -20 }); tone(105, 1.2, { type: "square", vol: 0.07, slide: -30 }); noise(0.8, 0.1, 200); },
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.28, { vol: 0.11, delay: i * 0.1 })),
    whoosh: () => noise(0.5, 0.07, 1800),
    tick: () => tone(1800, 0.02, { vol: 0.025 }),
  };
  const wake = () => { bus.init(); };
  addEventListener("pointerdown", wake); addEventListener("keydown", wake);
  return bus;
})();
