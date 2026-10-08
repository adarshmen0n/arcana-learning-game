// Procedural environment art: painted-style parallax worlds with lighting, haze and atmosphere.
// Everything is drawn once per theme on 2D canvases, then reused as textures (no downloads).
const Art = (() => {
  const W = 1280, H = 720, GROUND = 600, TW = 1536, LAYER_BOTTOM = GROUND + 30;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const R = (a, b) => a + (b - a) * rnd();
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
  const mk = (scene, key, w, h, draw) => {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, w, h); draw(t.getContext("2d", { willReadFrequently: true }), w, h); t.refresh();
  };
  const lg = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
  const glow = (c, x, y, r, hex, a = 1) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(hex, a)); g.addColorStop(1, rgba(hex, 0));
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const wrap = (w, x, pad, fn) => { for (const o of [0, -w, w]) if (x + o > -pad && x + o < w + pad) fn(x + o); };
  const fade = (c, w, h, hex, a0, a1, y0 = 0, y1 = h) => { c.fillStyle = lg(c, 0, y0, 0, y1, [[0, rgba(hex, a0)], [1, rgba(hex, a1)]]); c.fillRect(0, y0, w, y1 - y0); };
  const grain = (c, w, h, amt = 12) => {
    const d = c.getImageData(0, 0, w, h), a = d.data;
    for (let i = 0; i < a.length; i += 4) { if (a[i + 3] === 0) continue; const n = (rnd() - 0.5) * amt; a[i] = clamp(a[i] + n, 0, 255); a[i + 1] = clamp(a[i + 1] + n, 0, 255); a[i + 2] = clamp(a[i + 2] + n, 0, 255); }
    c.putImageData(d, 0, 0);
  };
  const dots = (c, n, w, h, col, r0, r1, a0, a1) => { for (let i = 0; i < n; i++) { c.fillStyle = rgba(col, R(a0, a1)); c.beginPath(); c.arc(R(0, w), R(0, h), R(r0, r1), 0, 6.28); c.fill(); } };

  // ---------------------------------------------------------------- shared painters
  function cloud(c, x, y, rx, ry, lit, shade, a) {
    const n = Math.max(5, Math.round(rx / 8));
    for (let i = 0; i < n; i++) {
      const px = x + R(-rx, rx) * 0.9, py = y + R(-ry, ry) * 0.45, r = R(ry * 0.7, ry * 1.5) * (1 - Math.min(0.7, Math.abs(px - x) / (rx * 1.4)));
      const g = c.createRadialGradient(px + r * 0.15, py - r * 0.35, r * 0.05, px, py, r);
      g.addColorStop(0, rgba(lit, a)); g.addColorStop(0.55, rgba(mix(lit, shade, 0.55), a * 0.85)); g.addColorStop(1, rgba(shade, 0));
      c.fillStyle = g; c.beginPath(); c.arc(px, py, r, 0, 6.28); c.fill();
    }
  }
  // mountain range with sun-lit faces and optional snow caps
  function range(c, w, h, o) {
    const ph = o.octs.map(() => R(0, 6.28)), ys = [];
    for (let x = 0; x <= w; x += 2) {
      let y = 0; o.octs.forEach(([k, a], i) => { let s = Math.sin((2 * Math.PI * k * x) / w + ph[i]); s = 1 - 2 * Math.abs(s) * (o.sharp ?? 1) - (o.sharp === 0 ? 0 : 0); y += a * s; });
      ys.push(o.base - y * o.amp);
    }
    c.beginPath(); c.moveTo(0, h); ys.forEach((y, i) => c.lineTo(i * 2, y)); c.lineTo(w, h); c.closePath();
    c.fillStyle = lg(c, 0, o.base - o.amp, 0, h, [[0, o.top], [1, o.bot]]); c.fill();
    for (let i = 1; i < ys.length - 1; i++) {                                    // sun-lit ridge faces
      const sl = ys[i + 1] - ys[i - 1];
      if (sl > 0.6) { const len = Math.min(70, sl * 14); c.fillStyle = lg(c, 0, ys[i], 0, ys[i] + len, [[0, rgba(o.lit, 0.55)], [1, rgba(o.lit, 0)]]); c.fillRect(i * 2 - 1, ys[i], 3, len); }
      else if (sl < -0.6) { const len = Math.min(60, -sl * 12); c.fillStyle = lg(c, 0, ys[i], 0, ys[i] + len, [[0, rgba("#000010", 0.28)], [1, "rgba(0,0,16,0)"]]); c.fillRect(i * 2 - 1, ys[i], 3, len); }
    }
    if (o.snow) {                                                                // snow caps above a snow line
      const line = o.base - o.amp * o.snow;
      for (let i = 1; i < ys.length - 1; i++) if (ys[i] < line) { const d = (line - ys[i]) * (0.5 + 0.5 * Math.sin(i * 0.9)); c.fillStyle = rgba(o.snowCol || "#f4f7ff", 0.92); c.fillRect(i * 2 - 1, ys[i], 3, Math.min(d, 90)); }
    }
    return ys;
  }
  function leafCrown(c, x, y, r, pal, n = 14) {
    for (let k = 0; k < n; k++) {
      const a = R(0, 6.28), d = R(0, r * 0.75), cx = x + Math.cos(a) * d * 1.25, cy = y + Math.sin(a) * d * 0.8, cr = R(r * 0.22, r * 0.4);
      for (let j = 0; j < 22; j++) {
        const lx = cx + R(-cr, cr), ly = cy + R(-cr * 0.8, cr * 0.8), lit = clamp(((lx - x) / r) * 0.5 - ((ly - y) / r) * 0.6 + R(-0.25, 0.25) + 0.45, 0, 1);
        c.fillStyle = lit < 0.5 ? mix(pal[0], pal[1], lit * 2) : mix(pal[1], pal[2], (lit - 0.5) * 2); c.beginPath(); c.ellipse(lx, ly, R(2.5, 5.5), R(1.8, 3.6), R(-1, 1), 0, 6.28); c.fill();
      }
    }
    const g = c.createRadialGradient(x, y + r * 0.45, 0, x, y + r * 0.45, r * 0.9); g.addColorStop(0, "rgba(0,0,0,.38)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.beginPath(); c.ellipse(x, y + r * 0.45, r * 0.95, r * 0.55, 0, 0, 6.28); c.fill();
  }
  function trunk(c, x, base, h, w, dark, light) {
    c.fillStyle = lg(c, x - w, 0, x + w, 0, [[0, dark], [0.55, mix(dark, light, 0.4)], [1, light]]);
    c.beginPath(); c.moveTo(x - w, base); c.bezierCurveTo(x - w * 0.7, base - h * 0.4, x - w * 0.5, base - h * 0.7, x - w * 0.4, base - h); c.lineTo(x + w * 0.4, base - h); c.bezierCurveTo(x + w * 0.5, base - h * 0.7, x + w * 0.7, base - h * 0.4, x + w, base); c.closePath(); c.fill();
    c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = 1; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(x + R(-w, w) * 0.7, base); c.lineTo(x + R(-w, w) * 0.4, base - h * R(0.5, 1)); c.stroke(); }
  }
  function oak(c, x, base, h, pal, tr) { trunk(c, x, base, h * 0.55, h * 0.05, tr[0], tr[1]); leafCrown(c, x, base - h * 0.68, h * 0.34, pal, 16); }
  function pine(c, x, base, h, pal, snow) {
    c.fillStyle = pal[0]; c.fillRect(x - h * 0.018, base - h * 0.16, h * 0.036, h * 0.16);
    const tiers = 9;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers, y = base - h * (0.08 + t * 0.84), tw = h * 0.2 * (1 - t * 0.82) + 3, th = h * 0.15;
      c.fillStyle = mix(pal[0], pal[1], t * 0.35 + R(0, 0.1)); c.beginPath(); c.moveTo(x, y - th);
      for (let s = 1; s <= 5; s++) c.lineTo(x - tw * (s / 5) - R(0, 3), y - th + th * (s / 5) + (s % 2 ? 3 : -1));
      c.lineTo(x - tw, y); c.lineTo(x + tw, y); for (let s = 5; s >= 1; s--) c.lineTo(x + tw * (s / 5) + R(0, 3), y - th + th * (s / 5) + (s % 2 ? 3 : -1)); c.closePath(); c.fill();
      c.fillStyle = rgba(pal[2], 0.55); c.beginPath(); c.moveTo(x, y - th); c.lineTo(x + tw * 0.9, y - 2); c.lineTo(x + tw * 0.15, y - 2); c.closePath(); c.fill();
      if (snow) { c.fillStyle = "rgba(240,248,255,.85)"; c.beginPath(); c.moveTo(x, y - th); c.lineTo(x + tw * 0.55, y - th * 0.4); c.lineTo(x - tw * 0.55, y - th * 0.4); c.closePath(); c.fill(); }
    }
  }
  function rock(c, x, base, w, h, col, lit) {
    const pts = [[x - w / 2, base], [x - w * 0.42, base - h * 0.55], [x - w * 0.15, base - h], [x + w * 0.2, base - h * 0.85], [x + w * 0.45, base - h * 0.4], [x + w / 2, base]];
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fillStyle = lg(c, x - w / 2, 0, x + w / 2, 0, [[0, mix(col, "#000000", 0.45)], [0.6, col], [1, lit]]); c.fill();
    c.strokeStyle = "rgba(0,0,0,.4)"; c.lineWidth = 1.2; c.stroke(); c.fillStyle = "rgba(255,255,255,.1)"; c.beginPath(); c.moveTo(x - w * 0.15, base - h); c.lineTo(x + w * 0.2, base - h * 0.85); c.lineTo(x + w * 0.1, base - h * 0.5); c.closePath(); c.fill();
  }
  function crystal(c, x, base, h, hex, n = 4, blur = 22) {
    for (let i = 0; i < n; i++) {
      const cx = x + R(-h * 0.35, h * 0.35), ch = h * R(0.45, 1), cw = ch * R(0.11, 0.19), lean = R(-0.22, 0.22) * ch, tipx = cx + lean;
      c.save(); c.shadowColor = hex; c.shadowBlur = blur;
      c.fillStyle = lg(c, cx - cw, base, cx + cw, base - ch, [[0, mix(hex, "#000000", 0.8)], [0.55, mix(hex, "#000000", 0.2)], [1, mix(hex, "#ffffff", 0.6)]]);
      c.beginPath(); c.moveTo(cx - cw, base); c.lineTo(cx - cw * 0.9 + lean * 0.3, base - ch * 0.72); c.lineTo(tipx, base - ch); c.lineTo(cx + cw * 0.9 + lean * 0.3, base - ch * 0.72); c.lineTo(cx + cw, base); c.closePath(); c.fill(); c.restore();
      c.fillStyle = "rgba(255,255,255,.22)"; c.beginPath(); c.moveTo(cx, base); c.lineTo(tipx, base - ch); c.lineTo(cx + cw * 0.9 + lean * 0.3, base - ch * 0.72); c.lineTo(cx + cw, base); c.closePath(); c.fill();
      c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 1; c.beginPath(); c.moveTo(cx - cw * 0.9 + lean * 0.3, base - ch * 0.72); c.lineTo(cx, base); c.moveTo(cx + cw * 0.9 + lean * 0.3, base - ch * 0.72); c.lineTo(cx, base); c.stroke();
    }
  }
  function pillar(c, x, base, h, w, col, hi) {
    const top = base - h;
    c.fillStyle = lg(c, x - w / 2, 0, x + w / 2, 0, [[0, mix(col, "#000000", 0.4)], [0.55, col], [1, hi]]);
    c.beginPath(); c.moveTo(x - w / 2, base); c.lineTo(x - w / 2, top + R(0, h * 0.12)); c.lineTo(x - w * 0.15, top - R(0, h * 0.05)); c.lineTo(x + w * 0.2, top + R(0, h * 0.1)); c.lineTo(x + w / 2, top + R(0, h * 0.05)); c.lineTo(x + w / 2, base); c.closePath(); c.fill();
    c.fillStyle = "rgba(0,0,0,.24)"; for (let i = 1; i < 5; i++) c.fillRect(x - w / 2, base - h * i * 0.2, w, 2);
    c.strokeStyle = "rgba(0,0,0,.3)"; c.lineWidth = 1; c.beginPath(); c.moveTo(x - w * 0.15, top + 8); c.lineTo(x - w * 0.25, base); c.stroke();
    c.fillStyle = col; c.fillRect(x - w * 0.68, base - h * 0.05, w * 1.36, h * 0.05);
  }
  function blades(c, w, y0, count, hmin, hmax, cols, tipCol) {
    for (let i = 0; i < count; i++) {
      const x = R(-10, w + 10), bh = R(hmin, hmax), lean = R(-0.5, 0.5) * bh * 0.5, bw = R(2.5, 6);
      wrap(w, x, 40, (xx) => { c.fillStyle = lg(c, 0, y0, 0, y0 - bh, [[0, cols[0]], [0.7, mix(cols[0], cols[1], R(0, 1))], [1, tipCol ? mix(cols[1], tipCol, R(0.3, 0.9)) : cols[1]]]); c.beginPath(); c.moveTo(xx - bw, y0); c.quadraticCurveTo(xx + lean * 0.3, y0 - bh * 0.6, xx + lean, y0 - bh); c.quadraticCurveTo(xx + lean * 0.4 + bw, y0 - bh * 0.5, xx + bw, y0); c.fill(); });
    }
  }
  const bokeh = (c, w, h, col, n) => { c.save(); c.globalCompositeOperation = "lighter"; for (let i = 0; i < n; i++) { const x = R(0, w), y = R(0, h), r = R(12, 44); wrap(w, x, 50, (xx) => { const g = c.createRadialGradient(xx, y, r * 0.2, xx, y, r); g.addColorStop(0, rgba(col, 0.0)); g.addColorStop(0.75, rgba(col, R(0.04, 0.1))); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(xx, y, r, 0, 6.28); c.fill(); }); } c.restore(); };

  // Shared textures (glow sprite, light rays, fog banks, bird, snow).
  function common(scene) {
    mk(scene, "spark", 64, 64, (c) => glow(c, 32, 32, 29, "#ffffff", 1));
    mk(scene, "dot", 8, 8, (c) => { c.fillStyle = "#fff"; c.beginPath(); c.arc(4, 4, 3, 0, 6.28); c.fill(); });
    mk(scene, "fogbank", 1024, 260, (c, w, h) => { seed = 5; for (let i = 0; i < 28; i++) { const x = R(0, w); wrap(w, x, 220, (xx) => glow(c, xx, R(90, 190), R(110, 230), "#ffffff", R(0.05, 0.16))); } });
    mk(scene, "rays", 1024, H, (c, w, h) => {
      seed = 9;
      for (let i = 0; i < 8; i++) {
        const x = R(0, w), bw = R(30, 110), sk = R(120, 280);
        c.fillStyle = lg(c, 0, 0, 0, h * 0.9, [[0, "rgba(255,255,255,.24)"], [1, "rgba(255,255,255,0)"]]);
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x + bw, 0); c.lineTo(x + bw + sk, h * 0.9); c.lineTo(x + sk * 0.7, h * 0.9); c.closePath(); c.fill();
      }
    });
    mk(scene, "bird", 28, 14, (c) => { c.strokeStyle = "#0b0b14"; c.lineWidth = 2.2; c.lineCap = "round"; c.beginPath(); c.moveTo(2, 9); c.quadraticCurveTo(8, 1, 14, 9); c.quadraticCurveTo(20, 1, 26, 9); c.stroke(); });
    mk(scene, "flake", 12, 12, (c) => glow(c, 6, 6, 5.5, "#ffffff", 1));
  }

  // ------------------------------------------------------------ Misty Highlands: golden-hour forest, lake, snowy peaks
  function forest(scene) {
    const n = "ancient_forest", k = (s) => `${n}_${s}`; seed = 101;
    mk(scene, k("sky"), W, H, (c) => {
      c.fillStyle = lg(c, 0, 0, 0, H, [[0, "#16214f"], [0.22, "#3e4f95"], [0.44, "#b27fa0"], [0.58, "#f2a276"], [0.72, "#ffd08e"], [1, "#fff3d4"]]); c.fillRect(0, 0, W, H);
      dots(c, 120, W, 230, "#ffffff", 0.6, 1.6, 0.2, 0.8);
      glow(c, 960, 410, 700, "#ff9a55", 0.5); glow(c, 960, 410, 300, "#ffe0a0", 0.9);
      c.fillStyle = "#fffaf0"; c.beginPath(); c.arc(960, 410, 50, 0, 6.28); c.fill(); glow(c, 960, 410, 90, "#ffffff", 0.7);
      for (let i = 0; i < 8; i++) cloud(c, R(0, W), R(70, 380), R(160, 340), R(18, 44), "#ffd6ae", "#8a6aa6", R(0.4, 0.7));
    });
    mk(scene, k("far"), TW, 560, (c, w, h) => {
      range(c, w, h, { base: 330, amp: 150, octs: [[2, 0.5], [5, 0.3], [11, 0.14]], top: "#aab0da", bot: "#f0c3a4", lit: "#fff0d8", snow: 0.55, snowCol: "#fff7ee" });
      range(c, w, h, { base: 410, amp: 120, octs: [[3, 0.5], [7, 0.3], [13, 0.12]], top: "#7684ba", bot: "#e2aa92", lit: "#ffe2c0", snow: 0.62, snowCol: "#f6e9ea" });
      range(c, w, h, { base: 470, amp: 80, octs: [[4, 0.5], [9, 0.3], [17, 0.1]], top: "#546a9e", bot: "#c8908a", lit: "#f0c8a8" });
      fade(c, w, h, "#ffdcb0", 0, 0.85, 340, h); grain(c, w, h, 8);
    });
    mk(scene, k("mid"), TW, 420, (c, w, h) => {                                // far shore + lake with reflections
      const shore = h - 180;
      for (let i = 0; i < 70; i++) { const x = R(0, w); wrap(w, x, 60, (xx) => pine(c, xx, shore + 8, R(70, 130), ["#35506b", "#5d7f95", "#a8b8c0"])); }
      fade(c, w, h, "#e9c7a8", 0.0, 0.55, shore - 100, shore + 10);
      c.fillStyle = lg(c, 0, shore, 0, h, [[0, "#d4a58c"], [0.25, "#8f8cae"], [1, "#4c5f86"]]); c.fillRect(0, shore + 6, w, h - shore);
      c.save(); c.globalAlpha = 0.5; c.translate(0, shore * 2 + 12); c.scale(1, -1); c.filter = "blur(1.5px)"; c.drawImage(c.canvas, 0, 0, w, shore + 6, 0, 0, w, shore + 6); c.restore();
      c.fillStyle = lg(c, 0, shore, 0, h, [[0, "rgba(220,165,130,.55)"], [1, "rgba(60,80,120,.25)"]]); c.fillRect(0, shore + 6, w, h - shore);
      for (let i = 0; i < 160; i++) { const y = R(shore + 14, h - 6), x = R(0, w), l = R(20, 120) * (0.4 + (y - shore) / 200); c.fillStyle = rgba(rnd() > 0.5 ? "#fff1d0" : "#2a3b64", R(0.05, 0.28)); c.fillRect(x, y, l, 1.3); }
      grain(c, w, h, 6);
    });
    mk(scene, k("mid2"), TW, 380, (c, w, h) => {
      for (let i = 0; i < 40; i++) { const x = R(0, w); wrap(w, x, 100, (xx) => pine(c, xx, h - R(10, 50), R(120, 235), ["#1b3238", "#35585c", "#7aa496"])); }
      fade(c, w, h, "#e8c598", 0.0, 0.5, 90, h); grain(c, w, h, 8);
    });
    mk(scene, k("near"), TW, 340, (c, w, h) => {
      for (let i = 0; i < 9; i++) { const x = (i + R(0.1, 0.9)) * (w / 9); wrap(w, x, 200, (xx) => (rnd() > 0.45 ? oak : (c2, x2, b, hh, p) => pine(c2, x2, b, hh, p))(c, xx, h - 6, R(300, 420), rnd() > 0.5 ? ["#0f2f23", "#2a6a3e", "#8fcf6a"] : ["#102a22", "#2d5f45", "#7fbf7a"], ["#1b120c", "#6a4a30"])); }
      for (let i = 0; i < 7; i++) wrap(w, R(0, w), 80, (xx) => rock(c, xx, h, R(60, 140), R(30, 70), "#4a4f55", "#a8b0b4"));
      fade(c, w, h, "#bfe3c0", 0, 0.22, 140, h); grain(c, w, h, 6);
    });
    mk(scene, k("ground"), 1024, H - GROUND, (c, w, h) => {
      c.fillStyle = lg(c, 0, 0, 0, h, [[0, "#52672a"], [0.1, "#4a3a22"], [1, "#150f0a"]]); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(0,0,0,${R(0.08, 0.3)})`; c.fillRect(R(0, w), R(16, h), R(2, 12), R(1, 4)); }
      for (let i = 0; i < 40; i++) rock(c, R(0, w), R(36, h), R(8, 26), R(5, 14), "#5a5448", "#a79f90");
      blades(c, w, 6, 420, 8, 26, ["#2f6b2a", "#a9dc5e"], "#fff0a0");
      for (let i = 0; i < 40; i++) { const x = R(0, w), y = R(-14, 2); c.fillStyle = ["#fff6c8", "#fff", "#f6a8e0", "#ffd24a"][RI(0, 3)]; c.beginPath(); c.arc(x, y, R(1.4, 2.6), 0, 6.28); c.fill(); }
      c.fillStyle = "rgba(255,226,150,.5)"; c.fillRect(0, 4, w, 2); grain(c, w, h, 14);
    });
    mk(scene, k("fg"), TW, 260, (c, w, h) => {
      blades(c, w, h + 6, 110, 90, 240, ["#04100a", "#1a4a2a"], "#e6c070");
      for (let i = 0; i < 10; i++) { const x = R(0, w); wrap(w, x, 160, (xx) => { c.save(); c.translate(xx, h + 12); c.rotate(R(-1, 1)); c.fillStyle = lg(c, 0, 0, 0, -150, [[0, "#02100a"], [1, "#15462a"]]); c.beginPath(); c.ellipse(0, -66, 22, 96, 0, 0, 6.28); c.fill(); c.strokeStyle = "rgba(120,200,120,.3)"; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -150); c.stroke(); c.restore(); }); }
      bokeh(c, w, h, "#ffd9a0", 16);
    });
    mk(scene, k("clouds"), TW, 280, (c, w, h) => { seed = 777; for (let i = 0; i < 6; i++) wrap(w, R(0, w), 300, (xx) => cloud(c, xx, R(60, 220), R(200, 360), R(22, 50), "#ffe4c4", "#a07ab0", R(0.28, 0.5))); });
    return { name: n, label: "Misty Highlands", sky: k("sky"), ground: k("ground"), fg: k("fg"), accent: "#ffcf7a", fog: "#ffe7c0", rays: "#ffe0a0", music: "forest", birds: true,
      layers: [{ key: k("far"), f: 0.05, h: 560, d: 1 }, { key: k("mid"), f: 0.12, h: 420, d: 2 }, { key: k("mid2"), f: 0.26, h: 380, d: 3 }, { key: k("near"), f: 0.52, h: 340, d: 4 }],
      drift: [{ key: k("clouds"), f: 0.03, speed: 7, y: 20, h: 280, alpha: 0.9, d: 0.5 }],
      particles: { tints: [0xffe9a0, 0xfff2c4, 0xb6e36a], vy: [-18, -4], vx: [-14, 10], scale: [0.35, 0.05], life: [4000, 8000], freq: 90, alpha: 0.8 } };
  }

  // ------------------------------------------------------------ Crystal Caverns: bioluminescent cave with a glowing lake
  function cave(scene) {
    const n = "crystal_cave", k = (s) => `${n}_${s}`; seed = 202;
    mk(scene, k("sky"), W, H, (c) => {
      c.fillStyle = lg(c, 0, 0, 0, H, [[0, "#03040c"], [0.5, "#0b0d2e"], [1, "#1b1260"]]); c.fillRect(0, 0, W, H);
      glow(c, 300, 430, 560, "#22d3ee", 0.25); glow(c, 1000, 300, 600, "#c026d3", 0.22); glow(c, 640, 560, 640, "#4f46e5", 0.32);
      dots(c, 200, W, H, "#a5f3fc", 0.5, 1.8, 0.2, 0.8);
    });
    mk(scene, k("far"), TW, 560, (c, w, h) => {
      range(c, w, h, { base: 340, amp: 150, octs: [[2, 0.5], [5, 0.32], [9, 0.14]], top: "#2d2d78", bot: "#12123e", lit: "#6a6aff", sharp: 1 });
      c.strokeStyle = "rgba(120,140,255,.1)"; c.lineWidth = 1; for (let i = 0; i < 30; i++) { const y = R(250, 520); c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= w; x += 40) c.lineTo(x, y + Math.sin(x * 0.01 + i) * 10); c.stroke(); }
      c.save(); c.globalCompositeOperation = "lighter"; for (let i = 0; i < 12; i++) wrap(w, R(0, w), 200, (xx) => glow(c, xx, R(300, 470), R(90, 170), i % 2 ? "#22d3ee" : "#c026d3", 0.14)); c.restore();
      fade(c, w, h, "#2a2a7a", 0, 0.5, 300, h); grain(c, w, h, 8);
    });
    mk(scene, k("mid"), TW, 420, (c, w, h) => {                                // crystal ridge over a glowing lake
      const shore = h - 130;
      range(c, w, h, { base: shore - 30, amp: 50, octs: [[3, 0.5], [7, 0.4]], top: "#17185a", bot: "#0d0e3a", lit: "#5a6aff" });
      for (let i = 0; i < 22; i++) { const x = R(0, w); wrap(w, x, 150, (xx) => crystal(c, xx, shore, R(110, 210), i % 3 ? "#38bdf8" : "#d946ef", RI(3, 5), 16)); }
      c.fillStyle = lg(c, 0, shore, 0, h, [[0, "#0b3a5a"], [1, "#04101f"]]); c.fillRect(0, shore, w, h - shore);
      c.save(); c.globalAlpha = 0.55; c.translate(0, shore * 2); c.scale(1, -1); c.filter = "blur(2px)"; c.drawImage(c.canvas, 0, 0, w, shore, 0, 0, w, shore); c.restore();
      for (let i = 0; i < 140; i++) { c.fillStyle = rgba(rnd() > 0.5 ? "#7dd3fc" : "#f0abfc", R(0.05, 0.3)); c.fillRect(R(0, w), R(shore + 6, h), R(20, 100), 1.2); }
      fade(c, w, h, "#1a1a60", 0, 0.45, 100, shore); grain(c, w, h, 6);
    });
    mk(scene, k("mid2"), TW, 380, (c, w, h) => {
      for (let i = 0; i < 14; i++) { const x = R(0, w); wrap(w, x, 220, (xx) => crystal(c, xx, h - R(20, 50), R(180, 330), i % 2 ? "#22d3ee" : "#a855f7", RI(3, 6), 28)); }
      for (let i = 0; i < 6; i++) wrap(w, R(0, w), 100, (xx) => rock(c, xx, h, R(120, 220), R(70, 150), "#16183f", "#3a3f8a"));
      fade(c, w, h, "#0b0c30", 0, 0.5, 100, h); grain(c, w, h, 8);
    });
    mk(scene, k("near"), TW, 340, (c, w, h) => {
      for (let i = 0; i < 9; i++) { const x = (i + R(0.1, 0.9)) * (w / 9); wrap(w, x, 200, (xx) => { c.fillStyle = lg(c, xx - 80, 0, xx + 80, 0, [[0, "#04041a"], [0.7, "#0a0a28"], [1, "#2a3070"]]); c.beginPath(); c.moveTo(xx - R(60, 110), h); c.lineTo(xx - R(10, 40), h - R(180, 300)); c.lineTo(xx + R(5, 30), h - R(220, 340)); c.lineTo(xx + R(60, 110), h); c.fill(); }); }
      for (let i = 0; i < 7; i++) wrap(w, R(0, w), 200, (xx) => crystal(c, xx, h - 10, R(120, 230), "#67e8f9", 3, 32));
      grain(c, w, h, 6);
    });
    mk(scene, k("ceil"), TW, 260, (c, w, h) => {
      c.fillStyle = "#03030c"; c.fillRect(0, 0, w, 24);
      for (let i = 0; i < 44; i++) { const x = R(0, w), len = R(40, 230), bw = R(18, 58); wrap(w, x, 80, (xx) => { c.fillStyle = lg(c, xx - bw, 0, xx + bw, 0, [[0, "#03030c"], [0.7, mix("#03030c", "#15174a", R(0.2, 0.8))], [1, "#2b3070"]]); c.beginPath(); c.moveTo(xx - bw, 10); c.quadraticCurveTo(xx - bw * 0.2, len * 0.6, xx + R(-5, 5), len); c.quadraticCurveTo(xx + bw * 0.2, len * 0.6, xx + bw, 10); c.fill(); if (rnd() > 0.6) glow(c, xx, len, 26, "#38bdf8", 0.6); }); }
    });
    mk(scene, k("ground"), 1024, H - GROUND, (c, w, h) => {
      c.fillStyle = lg(c, 0, 0, 0, h, [[0, "#262a72"], [0.1, "#14163f"], [1, "#05050f"]]); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 220; i++) { c.fillStyle = `rgba(0,0,0,${R(0.15, 0.4)})`; c.fillRect(R(0, w), R(12, h), R(2, 14), R(1, 4)); }
      for (let i = 0; i < 30; i++) rock(c, R(0, w), R(30, h), R(8, 24), R(5, 12), "#232660", "#5a60b0");
      c.save(); c.globalCompositeOperation = "lighter"; for (let i = 0; i < 20; i++) glow(c, R(0, w), R(4, 40), R(16, 40), i % 2 ? "#22d3ee" : "#d946ef", 0.35); c.restore();
      c.fillStyle = "rgba(94,234,212,.75)"; c.fillRect(0, 2, w, 2); for (let i = 0; i < 14; i++) crystal(c, R(0, w), 6, R(14, 32), i % 2 ? "#22d3ee" : "#d946ef", 2, 10); grain(c, w, h, 10);
    });
    mk(scene, k("fg"), TW, 260, (c, w, h) => {
      for (let i = 0; i < 28; i++) { const x = R(0, w), bh = R(60, 230), bw = R(18, 46); wrap(w, x, 100, (xx) => { c.fillStyle = "#020208"; c.beginPath(); c.moveTo(xx - bw, h); c.lineTo(xx + R(-8, 8), h - bh); c.lineTo(xx + bw, h); c.fill(); c.strokeStyle = "rgba(100,160,255,.25)"; c.lineWidth = 1.2; c.stroke(); }); }
      for (let i = 0; i < 16; i++) { const x = R(0, w); wrap(w, x, 60, (xx) => { glow(c, xx, h - 24, 46, "#38bdf8", 0.55); c.fillStyle = "#06101a"; c.beginPath(); c.ellipse(xx, h - 20, 15, 11, 0, Math.PI, 0); c.fill(); c.fillStyle = "#9bd8ff"; c.fillRect(xx - 2, h - 20, 4, 20); c.fillStyle = "rgba(125,211,252,.8)"; c.beginPath(); c.arc(xx - 5, h - 26, 1.6, 0, 6.28); c.arc(xx + 4, h - 28, 1.2, 0, 6.28); c.fill(); }); }
      bokeh(c, w, h, "#7dd3fc", 14);
    });
    mk(scene, k("mist"), TW, 260, (c, w, h) => { seed = 55; for (let i = 0; i < 18; i++) wrap(w, R(0, w), 300, (xx) => glow(c, xx, R(80, 200), R(120, 260), "#6d6cff", R(0.08, 0.18))); });
    return { name: n, label: "Crystal Caverns", sky: k("sky"), ground: k("ground"), fg: k("fg"), accent: "#5eead4", fog: "#6d6cff", rays: "#7dd3fc", music: "cave",
      ceil: { key: k("ceil"), f: 0.35, h: 260 },
      layers: [{ key: k("far"), f: 0.05, h: 560, d: 1 }, { key: k("mid"), f: 0.12, h: 420, d: 2 }, { key: k("mid2"), f: 0.26, h: 380, d: 3 }, { key: k("near"), f: 0.52, h: 340, d: 4 }],
      drift: [{ key: k("mist"), f: 0.2, speed: 10, y: 360, h: 260, alpha: 0.9, d: 4.5, add: true }],
      particles: { tints: [0x67e8f9, 0xe879f9, 0xa5b4fc], vy: [-26, -6], vx: [-12, 12], scale: [0.4, 0.05], life: [4000, 9000], freq: 80, alpha: 0.9 } };
  }

  // ------------------------------------------------------------ Ember Citadel: volcano, lava river, ruined fortress
  function volcano(scene) {
    const n = "ember_citadel", k = (s) => `${n}_${s}`; seed = 303;
    mk(scene, k("sky"), W, H, (c) => {
      c.fillStyle = lg(c, 0, 0, 0, H, [[0, "#080204"], [0.3, "#250a0c"], [0.62, "#7a1d0b"], [0.85, "#d4531a"], [1, "#ff9a3a"]]); c.fillRect(0, 0, W, H);
      glow(c, 640, 480, 760, "#ff7a1a", 0.5);
      for (let i = 0; i < 14; i++) cloud(c, R(0, W), R(40, 400), R(180, 380), R(24, 56), "#7a2a1a", "#120505", R(0.55, 0.9));
      c.fillStyle = lg(c, 0, 250, 0, 560, [[0, "#1a0808"], [1, "#321008"]]);
      c.beginPath(); c.moveTo(220, 560); c.lineTo(500, 280); c.lineTo(580, 250); c.lineTo(700, 262); c.lineTo(790, 300); c.lineTo(1120, 560); c.closePath(); c.fill();
      glow(c, 640, 262, 190, "#ff9a3a", 1); c.fillStyle = "#ffd37a"; c.beginPath(); c.ellipse(640, 258, 56, 10, 0, 0, 6.28); c.fill();
      c.save(); c.globalCompositeOperation = "lighter"; c.strokeStyle = "rgba(255,120,30,.85)"; c.lineWidth = 3.2; c.shadowColor = "#ff6a00"; c.shadowBlur = 16;
      for (let i = 0; i < 6; i++) { c.beginPath(); let x = 610 + R(-20, 60), y = 266; c.moveTo(x, y); for (let j = 0; j < 8; j++) { x += R(-26, 32); y += R(24, 38); c.lineTo(x, y); } c.stroke(); } c.restore();
      for (let i = 0; i < 20; i++) glow(c, 640 + R(-50, 190), R(40, 250), R(40, 120), "#2a0c0a", 0.7);
      dots(c, 60, W, 300, "#ffb060", 0.8, 2, 0.2, 0.7);
    });
    mk(scene, k("far"), TW, 560, (c, w, h) => {
      range(c, w, h, { base: 350, amp: 140, octs: [[2, 0.5], [6, 0.3], [12, 0.12]], top: "#3a1210", bot: "#8a2c12", lit: "#ff9a50" });
      range(c, w, h, { base: 430, amp: 100, octs: [[3, 0.5], [8, 0.3], [14, 0.1]], top: "#220a09", bot: "#5a1b0e", lit: "#ff7a30" });
      fade(c, w, h, "#ff6a1a", 0, 0.55, 360, h); grain(c, w, h, 8);
    });
    const tower = (c, x, base, h, w, col) => {
      c.fillStyle = lg(c, x - w / 2, 0, x + w / 2, 0, [[0, mix(col, "#000", 0.3)], [1, mix(col, "#7a3a20", 0.4)]]); c.fillRect(x - w / 2, base - h, w, h);
      for (let i = 0; i < 4; i++) c.fillRect(x - w / 2 + i * (w / 4), base - h - 14, w / 6, 14);
      c.beginPath(); c.moveTo(x - w * 0.7, base - h); c.lineTo(x, base - h - w * 1.2); c.lineTo(x + w * 0.7, base - h); c.fill();
      for (let i = 0; i < 4; i++) if (rnd() > 0.35) { c.save(); c.fillStyle = "#ffb347"; c.shadowColor = "#ff7a00"; c.shadowBlur = 14; c.fillRect(x - 3, base - h + 20 + i * (h / 5), 6, 13); c.restore(); }
    };
    mk(scene, k("mid"), TW, 420, (c, w, h) => {                                // fortress cliffs above a lava river
      const shore = h - 100;
      range(c, w, h, { base: shore - 70, amp: 60, octs: [[3, 0.6], [7, 0.3]], top: "#220b0a", bot: "#12050a", lit: "#ff8a40" });
      for (let i = 0; i < 10; i++) { const x = R(0, w); wrap(w, x, 120, (xx) => tower(c, xx, shore - 20, R(120, 250), R(34, 58), "#1a0a08")); }
      c.fillStyle = lg(c, 0, shore, 0, h, [[0, "#ff9a3a"], [0.4, "#e0480f"], [1, "#6a1405"]]); c.fillRect(0, shore, w, h - shore);
      c.save(); c.globalCompositeOperation = "lighter"; for (let i = 0; i < 90; i++) { c.fillStyle = rgba(rnd() > 0.5 ? "#ffd070" : "#ff6a1a", R(0.25, 0.7)); c.fillRect(R(0, w), R(shore + 4, h), R(30, 140), R(1.5, 3)); } c.restore();
      c.save(); c.globalAlpha = 0.4; c.translate(0, shore * 2); c.scale(1, -1); c.drawImage(c.canvas, 0, shore - 130, w, 130, 0, 0, w, 130); c.restore();
      fade(c, w, h, "#ff6a1a", 0, 0.45, 160, shore); grain(c, w, h, 8);
    });
    mk(scene, k("mid2"), TW, 380, (c, w, h) => {
      for (let i = 0; i < 18; i++) { const x = R(0, w); wrap(w, x, 120, (xx) => pillar(c, xx, h - 20, R(140, 300), R(36, 66), "#1c0d0c", "#6a3020")); }
      for (let i = 0; i < 6; i++) wrap(w, R(0, w), 100, (xx) => rock(c, xx, h, R(90, 180), R(50, 120), "#1a0c0a", "#7a3a20"));
      fade(c, w, h, "#ff4a10", 0, 0.45, 110, h); grain(c, w, h, 8);
    });
    mk(scene, k("near"), TW, 340, (c, w, h) => {
      for (let i = 0; i < 12; i++) { const x = (i + R(0.1, 0.9)) * (w / 12); wrap(w, x, 160, (xx) => { c.fillStyle = lg(c, xx - 60, 0, xx + 60, 0, [[0, "#050202"], [0.8, "#140808"], [1, "#4a1c10"]]); c.beginPath(); c.moveTo(xx - R(40, 80), h); c.lineTo(xx - R(8, 22), h - R(180, 320)); c.lineTo(xx + R(5, 20), h - R(200, 340)); c.lineTo(xx + R(40, 80), h); c.fill(); c.strokeStyle = "rgba(255,110,30,.6)"; c.lineWidth = 2; c.stroke(); }); }
      grain(c, w, h, 6);
    });
    mk(scene, k("ground"), 1024, H - GROUND, (c, w, h) => {
      c.fillStyle = lg(c, 0, 0, 0, h, [[0, "#35190f"], [0.15, "#1c0c0a"], [1, "#060202"]]); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 200; i++) { c.fillStyle = `rgba(0,0,0,${R(0.15, 0.4)})`; c.fillRect(R(0, w), R(12, h), R(2, 14), R(1, 4)); }
      c.save(); c.globalCompositeOperation = "lighter"; c.shadowColor = "#ff6a00"; c.shadowBlur = 14; c.strokeStyle = "rgba(255,130,40,.95)"; c.lineWidth = 2.2;
      for (let i = 0; i < 18; i++) { c.beginPath(); let x = R(0, w), y = R(8, 26); c.moveTo(x, y); for (let j = 0; j < 6; j++) { x += R(-26, 32); y = Math.min(h - 4, y + R(-6, 16)); c.lineTo(x, y); } c.stroke(); } c.restore();
      c.fillStyle = "rgba(255,160,80,.7)"; c.fillRect(0, 2, w, 2); grain(c, w, h, 12);
    });
    mk(scene, k("fg"), TW, 260, (c, w, h) => {
      for (let i = 0; i < 26; i++) { const x = R(0, w), bh = R(60, 230), bw = R(20, 52); wrap(w, x, 100, (xx) => { c.fillStyle = "#050202"; c.beginPath(); c.moveTo(xx - bw, h); c.lineTo(xx - R(2, 14), h - bh); c.lineTo(xx + R(2, 18), h - bh * R(0.6, 1)); c.lineTo(xx + bw, h); c.fill(); c.strokeStyle = "rgba(255,120,40,.35)"; c.lineWidth = 1.4; c.stroke(); }); }
      bokeh(c, w, h, "#ff8a40", 14);
    });
    mk(scene, k("ash"), TW, 300, (c, w, h) => { seed = 66; for (let i = 0; i < 8; i++) wrap(w, R(0, w), 340, (xx) => cloud(c, xx, R(60, 240), R(220, 400), R(26, 56), "#4a2018", "#0a0404", R(0.4, 0.6))); });
    return { name: n, label: "Ember Citadel", sky: k("sky"), ground: k("ground"), fg: k("fg"), accent: "#fb923c", fog: "#ff7a2a", rays: "#ff9a50", music: "volcano",
      layers: [{ key: k("far"), f: 0.05, h: 560, d: 1 }, { key: k("mid"), f: 0.12, h: 420, d: 2 }, { key: k("mid2"), f: 0.26, h: 380, d: 3 }, { key: k("near"), f: 0.52, h: 340, d: 4 }],
      drift: [{ key: k("ash"), f: 0.04, speed: 14, y: 0, h: 300, alpha: 0.85, d: 0.6 }],
      particles: { tints: [0xff7a1a, 0xffb347, 0xff4a10], vy: [-90, -30], vx: [-30, 30], scale: [0.35, 0.03], life: [2500, 5000], freq: 40, alpha: 1 } };
  }

  // ------------------------------------------------------------ Desert Canyon: sunset mesas, ancient ruins
  function desert(scene) {
    const n = "desert_canyon", k = (s) => `${n}_${s}`; seed = 404;
    mk(scene, k("sky"), W, H, (c) => {
      c.fillStyle = lg(c, 0, 0, 0, H, [[0, "#2a1c52"], [0.25, "#7a3d7a"], [0.45, "#e0655a"], [0.62, "#ff9b5a"], [0.8, "#ffd08a"], [1, "#ffeab8"]]); c.fillRect(0, 0, W, H);
      dots(c, 60, W, 160, "#ffffff", 0.5, 1.4, 0.15, 0.6);
      glow(c, 360, 420, 760, "#ff7a3a", 0.5); glow(c, 360, 420, 320, "#ffd890", 0.9); c.fillStyle = "#fff4d8"; c.beginPath(); c.arc(360, 420, 78, 0, 6.28); c.fill(); glow(c, 360, 420, 130, "#ffffff", 0.6);
      for (let i = 0; i < 7; i++) cloud(c, R(0, W), R(70, 360), R(180, 360), R(16, 36), "#ffc79a", "#7a3d7a", R(0.4, 0.7));
    });
    const mesa = (c, w, h, base, hgt, top, bot, lit) => {
      for (let i = 0; i < 7; i++) {
        const x = R(0, w), mw = R(160, 380), mh = hgt * R(0.5, 1), top_ = base - mh;
        wrap(w, x, mw, (xx) => {
          c.beginPath(); c.moveTo(xx - mw / 2, h); c.lineTo(xx - mw / 2 + 14, top_ + 30); c.lineTo(xx - mw / 2 + 40, top_); c.lineTo(xx + mw / 2 - 40, top_ + R(-6, 6)); c.lineTo(xx + mw / 2 - 12, top_ + 34); c.lineTo(xx + mw / 2, h); c.closePath();
          c.fillStyle = lg(c, xx - mw / 2, 0, xx + mw / 2, 0, [[0, top], [0.55, mix(top, bot, 0.4)], [1, lit]]); c.fill();
          c.strokeStyle = "rgba(60,20,20,.18)"; c.lineWidth = 1.4; for (let s = 0; s < 6; s++) { const y = top_ + 30 + s * (mh / 6.5); c.beginPath(); c.moveTo(xx - mw / 2 + 10, y); c.lineTo(xx + mw / 2 - 10, y + R(-3, 3)); c.stroke(); }
        });
      }
    };
    mk(scene, k("far"), TW, 560, (c, w, h) => {
      range(c, w, h, { base: 360, amp: 70, octs: [[3, 0.5], [8, 0.3]], top: "#b4607a", bot: "#e8906a", lit: "#ffd0a0" });
      mesa(c, w, h, 440, 190, "#a8505a", "#d98060", "#ffc79a"); fade(c, w, h, "#ffcf9a", 0, 0.8, 330, h); grain(c, w, h, 8);
    });
    mk(scene, k("mid"), TW, 420, (c, w, h) => {
      mesa(c, w, h, h - 20, 260, "#8c3f3a", "#c0634a", "#f0a070");
      const pyr = (x, b, s) => { c.beginPath(); c.moveTo(x - s, b); c.lineTo(x, b - s * 0.9); c.lineTo(x + s, b); c.closePath(); c.fillStyle = lg(c, x - s, 0, x + s, 0, [[0, "#9a4a3a"], [0.5, "#c8785a"], [1, "#f2b080"]]); c.fill(); c.fillStyle = "rgba(90,30,20,.35)"; c.beginPath(); c.moveTo(x, b - s * 0.9); c.lineTo(x + s, b); c.lineTo(x, b); c.closePath(); c.fill(); };
      for (let i = 0; i < 3; i++) wrap(w, R(100, w - 100), 200, (xx) => pyr(xx, h - 20, R(90, 170)));
      fade(c, w, h, "#ffb98a", 0, 0.5, 120, h); grain(c, w, h, 8);
    });
    mk(scene, k("mid2"), TW, 380, (c, w, h) => {                                // ancient ruins
      for (let i = 0; i < 12; i++) { const x = R(0, w); wrap(w, x, 160, (xx) => { const n2 = RI(2, 4); for (let j = 0; j < n2; j++) pillar(c, xx + j * 50, h - 16, R(110, 250), R(30, 44), "#a0644a", "#e4a878"); if (rnd() > 0.5) { c.fillStyle = "#a0644a"; c.fillRect(xx - 8, h - 280, (n2 - 1) * 50 + 56, 18); } }); }
      for (let i = 0; i < 10; i++) wrap(w, R(0, w), 100, (xx) => rock(c, xx, h, R(60, 150), R(30, 80), "#8a4a38", "#e0a070"));
      fade(c, w, h, "#ffb080", 0, 0.45, 100, h); grain(c, w, h, 8);
    });
    mk(scene, k("near"), TW, 340, (c, w, h) => {
      for (let i = 0; i < 9; i++) { const x = (i + R(0.1, 0.9)) * (w / 9); wrap(w, x, 200, (xx) => { const hh = R(160, 330), ww = R(60, 130); c.fillStyle = lg(c, xx - ww, 0, xx + ww, 0, [[0, "#3a1814"], [0.65, "#6a2e22"], [1, "#d8855a"]]); c.beginPath(); c.moveTo(xx - ww, h); c.lineTo(xx - ww * 0.8, h - hh * 0.7); c.lineTo(xx - ww * 0.3, h - hh); c.lineTo(xx + ww * 0.4, h - hh * 0.9); c.lineTo(xx + ww * 0.9, h - hh * 0.5); c.lineTo(xx + ww, h); c.fill(); }); }
      for (let i = 0; i < 5; i++) wrap(w, R(0, w), 60, (xx) => { const bh = R(90, 170); c.fillStyle = "#1c2a1c"; c.beginPath(); c.roundRect(xx - 9, h - bh, 18, bh, 9); c.fill(); c.beginPath(); c.roundRect(xx - 32, h - bh * 0.7, 16, bh * 0.4, 8); c.fill(); c.beginPath(); c.roundRect(xx + 16, h - bh * 0.8, 16, bh * 0.4, 8); c.fill(); });
      grain(c, w, h, 6);
    });
    mk(scene, k("ground"), 1024, H - GROUND, (c, w, h) => {
      c.fillStyle = lg(c, 0, 0, 0, h, [[0, "#d9a066"], [0.1, "#b87a48"], [1, "#4a2a18"]]); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { c.strokeStyle = rgba(rnd() > 0.5 ? "#fff0c0" : "#5a3418", R(0.08, 0.3)); c.lineWidth = 1.4; c.beginPath(); const y = R(6, h), x = R(0, w); c.moveTo(x, y); c.quadraticCurveTo(x + 40, y - 3, x + R(60, 160), y + 1); c.stroke(); }
      for (let i = 0; i < 36; i++) rock(c, R(0, w), R(24, h), R(8, 28), R(5, 14), "#8a5a3a", "#e0b080");
      c.fillStyle = "rgba(255,235,180,.6)"; c.fillRect(0, 3, w, 2); grain(c, w, h, 14);
    });
    mk(scene, k("fg"), TW, 260, (c, w, h) => {
      blades(c, w, h + 6, 60, 70, 180, ["#2a1408", "#6a4a20"], "#e8c070");
      for (let i = 0; i < 9; i++) wrap(w, R(0, w), 80, (xx) => rock(c, xx, h + 10, R(80, 190), R(50, 120), "#1c0c08", "#6a3a22"));
      bokeh(c, w, h, "#ffd6a0", 12);
    });
    mk(scene, k("dust"), TW, 280, (c, w, h) => { seed = 88; for (let i = 0; i < 16; i++) wrap(w, R(0, w), 300, (xx) => glow(c, xx, R(100, 220), R(120, 260), "#ffc890", R(0.08, 0.16))); });
    return { name: n, label: "Desert Canyon", sky: k("sky"), ground: k("ground"), fg: k("fg"), accent: "#ffb066", fog: "#ffcf9a", rays: "#ffd29a", music: "forest", birds: true,
      layers: [{ key: k("far"), f: 0.05, h: 560, d: 1 }, { key: k("mid"), f: 0.12, h: 420, d: 2 }, { key: k("mid2"), f: 0.26, h: 380, d: 3 }, { key: k("near"), f: 0.52, h: 340, d: 4 }],
      drift: [{ key: k("dust"), f: 0.3, speed: 26, y: 340, h: 280, alpha: 0.7, d: 4.5, add: true }],
      particles: { tints: [0xffd9a0, 0xffc080, 0xfff0c8], vy: [-6, 6], vx: [-60, -20], scale: [0.25, 0.04], life: [3000, 6000], freq: 50, alpha: 0.7 } };
  }

  // ------------------------------------------------------------ Aurora Peaks: arctic night under northern lights
  function arctic(scene) {
    const n = "aurora_peaks", k = (s) => `${n}_${s}`; seed = 505;
    mk(scene, k("sky"), W, H, (c) => {
      c.fillStyle = lg(c, 0, 0, 0, H, [[0, "#02040f"], [0.4, "#07123a"], [0.75, "#12306a"], [1, "#2a5a8a"]]); c.fillRect(0, 0, W, H);
      dots(c, 380, W, 460, "#ffffff", 0.5, 1.9, 0.25, 1); glow(c, 1020, 150, 260, "#cfe6ff", 0.5); c.fillStyle = "#f4f8ff"; c.beginPath(); c.arc(1020, 150, 34, 0, 6.28); c.fill();
      c.fillStyle = "rgba(190,210,235,.25)"; for (const [x, y, r] of [[1008, 142, 8], [1032, 160, 6], [1016, 164, 4]]) { c.beginPath(); c.arc(x, y, r, 0, 6.28); c.fill(); }
      glow(c, 640, 640, 700, "#5aa8e0", 0.25);
    });
    mk(scene, k("far"), TW, 560, (c, w, h) => {
      range(c, w, h, { base: 330, amp: 170, octs: [[2, 0.5], [5, 0.3], [11, 0.14]], top: "#7c9ac8", bot: "#2a4a80", lit: "#e6f2ff", snow: 0.4, snowCol: "#eef6ff" });
      range(c, w, h, { base: 410, amp: 130, octs: [[3, 0.5], [7, 0.3], [13, 0.12]], top: "#5c7cb0", bot: "#223e72", lit: "#d6e8ff", snow: 0.5, snowCol: "#e2eeff" });
      range(c, w, h, { base: 480, amp: 80, octs: [[4, 0.5], [9, 0.3], [17, 0.1]], top: "#3c5a90", bot: "#1a2f5c", lit: "#b8d2f0" });
      fade(c, w, h, "#7eb0e0", 0, 0.55, 360, h); grain(c, w, h, 8);
    });
    mk(scene, k("mid"), TW, 420, (c, w, h) => {                                // frozen lake mirroring the aurora
      const shore = h - 150;
      for (let i = 0; i < 80; i++) { const x = R(0, w); wrap(w, x, 60, (xx) => pine(c, xx, shore + 8, R(70, 140), ["#14304a", "#2c5a82", "#8ab8d8"], true)); }
      c.fillStyle = lg(c, 0, shore, 0, h, [[0, "#6a98c8"], [0.4, "#2f5a8e"], [1, "#12294d"]]); c.fillRect(0, shore + 6, w, h - shore);
      c.save(); c.globalAlpha = 0.4; c.translate(0, shore * 2 + 12); c.scale(1, -1); c.filter = "blur(1.5px)"; c.drawImage(c.canvas, 0, 0, w, shore + 6, 0, 0, w, shore + 6); c.restore();
      c.save(); c.globalCompositeOperation = "lighter"; for (let i = 0; i < 18; i++) wrap(w, R(0, w), 200, (xx) => glow(c, xx, R(shore + 20, h - 10), R(60, 150), i % 2 ? "#4ade80" : "#60a5fa", 0.12)); c.restore();
      for (let i = 0; i < 90; i++) { c.fillStyle = rgba("#e8f6ff", R(0.05, 0.3)); c.fillRect(R(0, w), R(shore + 10, h), R(20, 100), 1.2); }
      grain(c, w, h, 6);
    });
    mk(scene, k("mid2"), TW, 380, (c, w, h) => {
      for (let i = 0; i < 36; i++) { const x = R(0, w); wrap(w, x, 100, (xx) => pine(c, xx, h - R(10, 50), R(110, 220), ["#0c2236", "#1f4a6e", "#7aa8cc"], true)); }
      for (let i = 0; i < 7; i++) wrap(w, R(0, w), 100, (xx) => rock(c, xx, h, R(90, 180), R(50, 110), "#27425e", "#cfe4f6"));
      fade(c, w, h, "#9ac8f0", 0, 0.4, 100, h); grain(c, w, h, 8);
    });
    mk(scene, k("near"), TW, 340, (c, w, h) => {
      for (let i = 0; i < 9; i++) { const x = (i + R(0.1, 0.9)) * (w / 9); wrap(w, x, 200, (xx) => pine(c, xx, h - 6, R(300, 420), ["#081a2c", "#17405f", "#8cc0e6"], true)); }
      for (let i = 0; i < 6; i++) wrap(w, R(0, w), 100, (xx) => rock(c, xx, h, R(80, 170), R(40, 100), "#2a4a68", "#e8f4ff"));
      grain(c, w, h, 6);
    });
    mk(scene, k("ground"), 1024, H - GROUND, (c, w, h) => {
      c.fillStyle = lg(c, 0, 0, 0, h, [[0, "#e6f2ff"], [0.08, "#a8c8e8"], [1, "#2a4a78"]]); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 200; i++) { c.fillStyle = `rgba(40,80,140,${R(0.08, 0.25)})`; c.beginPath(); c.ellipse(R(0, w), R(10, h), R(4, 22), R(1, 3), 0, 0, 6.28); c.fill(); }
      c.save(); c.globalCompositeOperation = "lighter"; for (let i = 0; i < 80; i++) { c.fillStyle = rgba("#ffffff", R(0.3, 0.9)); c.fillRect(R(0, w), R(2, h), 1.6, 1.6); } c.restore();
      c.fillStyle = "rgba(255,255,255,.85)"; c.fillRect(0, 2, w, 2); grain(c, w, h, 10);
    });
    mk(scene, k("fg"), TW, 260, (c, w, h) => {
      for (let i = 0; i < 9; i++) wrap(w, R(0, w), 100, (xx) => { rock(c, xx, h + 10, R(90, 200), R(60, 140), "#0a1626", "#8ab8dc"); });
      blades(c, w, h + 6, 50, 60, 150, ["#050c18", "#1a3a5a"], "#dff0ff"); bokeh(c, w, h, "#9fd0ff", 12);
    });
    mk(scene, k("aur1"), TW, 420, (c, w, h) => {
      seed = 71;
      for (let b = 0; b < 4; b++) {
        const col = ["#34d399", "#4ade80", "#60a5fa", "#a78bfa"][b], y0 = 90 + b * 38;
        for (let x = 0; x <= w; x += 4) { const ph = (x / w) * 6.283 * (2 + b % 2), y = y0 + Math.sin(ph + b) * 40 + Math.sin(ph * 2.7) * 14, len = 140 + Math.sin(ph * 1.3 + b) * 60;
          c.fillStyle = lg(c, 0, y, 0, y + len, [[0, rgba(col, 0)], [0.12, rgba(col, 0.38)], [0.5, rgba(col, 0.12)], [1, rgba(col, 0)]]); c.fillRect(x, y, 5, len); }
      }
    });
    mk(scene, k("aur2"), TW, 420, (c, w, h) => {
      seed = 83;
      for (let b = 0; b < 3; b++) {
        const col = ["#2dd4bf", "#86efac", "#818cf8"][b], y0 = 60 + b * 50;
        for (let x = 0; x <= w; x += 4) { const ph = (x / w) * 6.283 * (3 - b % 2), y = y0 + Math.sin(ph * 1.2 + b * 2) * 34, len = 120 + Math.sin(ph * 0.9) * 50;
          c.fillStyle = lg(c, 0, y, 0, y + len, [[0, rgba(col, 0)], [0.15, rgba(col, 0.3)], [1, rgba(col, 0)]]); c.fillRect(x, y, 5, len); }
      }
    });
    return { name: n, label: "Aurora Peaks", sky: k("sky"), ground: k("ground"), fg: k("fg"), accent: "#7dd3fc", fog: "#9ac8f0", rays: "#a5f3fc", music: "cave",
      layers: [{ key: k("far"), f: 0.05, h: 560, d: 1 }, { key: k("mid"), f: 0.12, h: 420, d: 2 }, { key: k("mid2"), f: 0.26, h: 380, d: 3 }, { key: k("near"), f: 0.52, h: 340, d: 4 }],
      drift: [{ key: k("aur1"), f: 0.02, speed: 9, y: 0, h: 420, alpha: 0.95, d: 0.4, add: true, pulse: true }, { key: k("aur2"), f: 0.03, speed: -6, y: 20, h: 420, alpha: 0.8, d: 0.45, add: true, pulse: true }],
      particles: { tints: [0xffffff, 0xcfe8ff, 0xeaf6ff], vy: [20, 60], vx: [-30, 10], scale: [0.3, 0.12], life: [5000, 9000], freq: 28, alpha: 0.9 } };
  }

  // ------------------------------------------------------------ Neon Grid (title backdrop, matches the logo)
  function neon(scene) {
    const n = "neon_grid", k = (s) => `${n}_${s}`, G = "#39ff14"; seed = 606;
    const circuit = (c, w, h, a) => {
      c.save(); c.strokeStyle = rgba(G, a); c.fillStyle = rgba(G, a); c.lineWidth = 1.6;
      for (let i = 0; i < 26; i++) { let x = R(0, w), y = R(0, h); c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 5; j++) { const d = R(40, 140), dir = Math.floor(R(0, 3)); if (dir === 0) x += d; else if (dir === 1) y += d; else { x += d * 0.7; y += d * 0.7; } c.lineTo(x, y); } c.stroke(); c.beginPath(); c.arc(x, y, 5, 0, 6.28); c.stroke(); }
      c.restore();
    };
    mk(scene, k("sky"), W, H, (c) => {
      c.fillStyle = lg(c, 0, 0, 0, H, [[0, "#000000"], [0.6, "#020a04"], [1, "#04200a"]]); c.fillRect(0, 0, W, H);
      glow(c, 640, 330, 560, G, 0.2); glow(c, 640, 330, 220, "#b6ff5a", 0.18); circuit(c, W, H, 0.1);
      for (let i = 0; i < 90; i++) { c.fillStyle = rgba(G, R(0.1, 0.6)); const s = R(2, 5); c.fillRect(R(0, W), R(0, H * 0.8), s, s); }
    });
    mk(scene, k("far"), TW, 560, (c, w, h) => {
      range(c, w, h, { base: 370, amp: 130, octs: [[2, 0.5], [5, 0.3], [11, 0.12]], top: "#02100a", bot: "#010603", lit: "#39ff14" });
      c.save(); c.strokeStyle = rgba(G, 0.35); c.lineWidth = 2; c.shadowColor = G; c.shadowBlur = 12; for (let i = 0; i < 30; i++) { const x = R(0, w); c.beginPath(); c.moveTo(x, h); c.lineTo(x + R(-60, 60), R(200, 420)); c.stroke(); } c.restore();
      fade(c, w, h, "#041a08", 0, 0.8, 330, h);
    });
    mk(scene, k("mid"), TW, 420, (c, w, h) => {
      for (let i = 0; i < 34; i++) { const x = R(0, w), bw = R(40, 110), bh = R(110, 300); wrap(w, x, 130, (xx) => { c.fillStyle = "#020b05"; c.fillRect(xx - bw / 2, h - bh - 40, bw, bh + 40); c.strokeStyle = rgba(G, 0.4); c.lineWidth = 1.5; c.strokeRect(xx - bw / 2, h - bh - 40, bw, bh + 40); for (let y = h - bh - 20; y < h - 60; y += 22) if (rnd() > 0.55) { c.fillStyle = rgba(G, R(0.3, 0.8)); c.fillRect(xx - bw / 2 + R(6, bw - 16), y, 8, 6); } }); }
      fade(c, w, h, "#06300f", 0, 0.5, 120, h);
    });
    mk(scene, k("mid2"), TW, 380, (c, w, h) => {
      for (let i = 0; i < 12; i++) { const x = R(0, w), bh = R(150, 320); wrap(w, x, 100, (xx) => { c.fillStyle = "#010603"; c.fillRect(xx - 18, h - bh - 30, 36, bh + 30); c.save(); c.strokeStyle = rgba(G, 0.7); c.shadowColor = G; c.shadowBlur = 14; c.lineWidth = 2; c.strokeRect(xx - 18, h - bh - 30, 36, bh + 30); c.beginPath(); c.moveTo(xx - 18, h - bh); c.lineTo(xx - 52, h - bh + 40); c.moveTo(xx + 18, h - bh); c.lineTo(xx + 52, h - bh + 40); c.stroke(); c.restore(); glow(c, xx, h - bh - 30, 36, G, 0.5); }); }
    });
    mk(scene, k("near"), TW, 340, (c, w, h) => {
      for (let i = 0; i < 10; i++) { const x = (i + R(0.1, 0.9)) * (w / 10), bh = R(220, 330), bw = R(36, 70); wrap(w, x, 100, (xx) => { c.fillStyle = "#000"; c.fillRect(xx - bw / 2, h - bh, bw, bh); c.save(); c.strokeStyle = rgba(G, 0.85); c.shadowColor = G; c.shadowBlur = 16; c.lineWidth = 2; c.beginPath(); c.moveTo(xx - bw / 2, h); c.lineTo(xx - bw / 2, h - bh); c.lineTo(xx + bw / 2, h - bh - 14); c.lineTo(xx + bw / 2, h); c.stroke(); c.restore(); }); }
    });
    mk(scene, k("ground"), 1024, H - GROUND, (c, w, h) => {
      c.fillStyle = lg(c, 0, 0, 0, h, [[0, "#06220c"], [0.2, "#020a04"], [1, "#000"]]); c.fillRect(0, 0, w, h);
      c.strokeStyle = rgba(G, 0.18); c.lineWidth = 1; for (let x = 0; x <= w; x += 64) { c.beginPath(); c.moveTo(x, 4); c.lineTo(x, h); c.stroke(); } for (let y = 24; y < h; y += 24) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      c.save(); c.shadowColor = G; c.shadowBlur = 16; c.fillStyle = G; c.fillRect(0, 1, w, 3); c.restore();
    });
    mk(scene, k("fg"), TW, 260, (c, w, h) => {
      for (let i = 0; i < 22; i++) { const x = R(0, w), bh = R(50, 200), bw = R(18, 46); wrap(w, x, 90, (xx) => { c.fillStyle = "#000"; c.beginPath(); c.moveTo(xx - bw, h); c.lineTo(xx, h - bh); c.lineTo(xx + bw, h); c.fill(); c.save(); c.strokeStyle = rgba(G, 0.7); c.shadowColor = G; c.shadowBlur = 12; c.lineWidth = 2; c.beginPath(); c.moveTo(xx - bw, h); c.lineTo(xx, h - bh); c.lineTo(xx + bw, h); c.stroke(); c.restore(); }); }
    });
    return { name: n, label: "Neon Grid", sky: k("sky"), ground: k("ground"), fg: k("fg"), accent: G, fog: "#0b6a1d", rays: "#39ff14", music: "forest",
      layers: [{ key: k("far"), f: 0.05, h: 560, d: 1 }, { key: k("mid"), f: 0.12, h: 420, d: 2 }, { key: k("mid2"), f: 0.26, h: 380, d: 3 }, { key: k("near"), f: 0.52, h: 340, d: 4 }],
      particles: { tints: [0x39ff14, 0xb6ff5a, 0x7cff4a], vy: [-40, -10], vx: [-10, 10], scale: [0.3, 0.04], life: [3000, 7000], freq: 70, alpha: 1 } };
  }

  const builders = { ancient_forest: forest, crystal_cave: cave, ember_citadel: volcano, desert_canyon: desert, aurora_peaks: arctic, neon_grid: neon };
  const cache = {};
  function buildTheme(scene, name) {
    if (!builders[name]) name = "ancient_forest";
    common(scene);
    return (cache[name] = cache[name] || builders[name](scene));
  }

  // LOW quality on phones/tablets and weak machines (or ?gfx=low). The game also drops to LOW by itself if it runs slowly.
  const LOW = (() => {
    try { const q = new URLSearchParams(location.search).get("gfx") || localStorage.getItem("arcana_gfx"); if (q === "high") return false; if (q === "low") return true; } catch (e) {}
    return matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  })();
  return { W, H, GROUND, TW, LAYER_BOTTOM, LOW, buildTheme, util: { mk, lg, glow, rgba, mix, R, rnd, wrap, setSeed: (s) => (seed = s) } };
})();
