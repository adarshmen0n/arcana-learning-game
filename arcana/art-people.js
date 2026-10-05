// Articulated human characters: the ranger hero (man or woman), mentors and villains share one skeleton.
// Joints are driven by keyframed "moves" (punch, kick, uppercut, cast...) so fights are real animation.
const People = (() => {
  const { lg, glow, rgba, mix } = Art.util;
  const K = 2; // texture supersampling
  const NEON = "#39ff14";

  // ---------- who is who ----------
  const RANGER = { suit: "#1d2a24", suit2: "#080e0b", plate: "#4a5a52", trim: NEON, glow: NEON, boots: "#0b100e", gloves: "#101815", eye: "#3a2a1c", pack: "bag", pauldrons: true, headband: NEON };
  const SPECS = {
    hero_m: { ...RANGER, gender: "m", skin: "#d6a07a", hair: "#1d1510", hairStyle: "short" },
    hero_f: { ...RANGER, gender: "f", skin: "#e6b593", hair: "#3b2316", hairStyle: "ponytail", tail: true, eye: "#2f4a3a" },
    lumen: { gender: "m", skin: "#e2bb98", hair: "#eceff0", hairStyle: "short", beard: "#f1f4f5", glasses: true, robe: true, robeColor: "#1f6a60", robe2: "#0a2926", trim: "#ffd36a", suit: "#1f6a60", suit2: "#0a2926", plate: "#2c8a7e", glow: "#5eead4", boots: "#2a1c10", eye: "#3f5a6a", npc: true },
    thyla: { gender: "f", skin: "#ecc3a6", hair: "#cdbbe9", hairStyle: "long", robe: true, robeColor: "#5b3a9a", robe2: "#21103f", trim: "#f0abfc", suit: "#5b3a9a", suit2: "#21103f", plate: "#7a54bd", glow: "#e879f9", boots: "#2a1630", eye: "#7a4aa8", npc: true },
    ranger: { gender: "m", skin: "#d2a07c", hair: "#6b4423", hairStyle: "short", suit: "#3e6a3a", suit2: "#14240f", plate: "#6b5333", trim: "#bef264", glow: "#bef264", boots: "#2a1c10", gloves: "#3a2a18", eye: "#4a6a3a", pack: "quiver", cape: "#2c5a2c", pauldrons: true, npc: true },
    sage: { gender: "m", skin: "#dcb28e", hair: "#f4f4f4", hairStyle: "bald", beard: "#f4f4f4", robe: true, robeColor: "#8a5a2b", robe2: "#2a1608", trim: "#fbbf24", suit: "#8a5a2b", suit2: "#2a1608", plate: "#a67a44", glow: "#fbbf24", boots: "#2a1608", eye: "#5a4a3a", npc: true },
    rival: { gender: "f", skin: "#e4b08f", hair: "#0d0d10", hairStyle: "ponytail", tail: true, suit: "#3b1218", suit2: "#12060a", plate: "#5a2a32", trim: "#ff3b5c", glow: "#ff3b5c", boots: "#0d0608", gloves: "#12060a", eye: "#6a1a2a", pack: "bag", pauldrons: true, headband: "#ff3b5c" },
    enforcer: { gender: "m", skin: "#b98458", hair: "#1a120c", hairStyle: "helm_horn", beard: "#241812", suit: "#3c161c", suit2: "#12060a", plate: "#6a707c", trim: "#ff3b5c", glow: "#ff3b5c", boots: "#18090c", gloves: "#2a2a30", eye: "#3a1a10", cape: "#5a0f1c", pauldrons: true, bulk: 1.12, armored: true },
    colossus: { gender: "m", skin: "#a87a58", hair: "#101010", hairStyle: "helm_full", suit: "#4c4636", suit2: "#14110a", plate: "#7c828e", trim: "#ffb347", glow: "#ffb347", boots: "#1a160e", gloves: "#3a352a", eye: "#3a2a1c", pauldrons: true, bulk: 1.5, armored: true, eyeGlow: "#ffb347" },
    overlord: { gender: "m", skin: "#cfc0d3", hair: "#0c0714", hairStyle: "crown", suit: "#241432", suit2: "#0a0610", plate: "#3a2452", trim: "#ffd36a", glow: "#d946ef", boots: "#0a0610", gloves: "#1a1024", eye: "#d946ef", cape: "#2a0f3a", robe: true, robeColor: "#241432", robe2: "#0a0610", pauldrons: true, bulk: 1.15, armored: true, halo: true, eyeGlow: "#d946ef" },
  };

  // ---------- pose model ----------
  const REST = { bx: 0, by: 0, br: 0, sx: 1, tr: 0, hd: 0, fS: 0.08, fE: -0.2, bS: -0.06, bE: -0.15, fH: 0, fK: 0.05, bH: 0, bK: 0.05 };
  const GUARD = { bx: 0, by: 0, br: 0.05, sx: 1, tr: 0.07, hd: 0, fS: -0.55, fE: -1.55, bS: -0.35, bE: -1.85, fH: -0.22, fK: 0.4, bH: 0.28, bK: 0.22 };
  const KEYS = Object.keys(REST);
  const K_ = (d, p, ev, ease) => ({ d, p, ev, ease });
  const MOVES = {
    jab: [K_(0.07, { tr: -0.18, fS: -0.3, fE: -2.1, br: -0.02 }), K_(0.06, { tr: 0.38, fS: -1.55, fE: -0.05, bx: 12, br: 0.1 }, "hit"), K_(0.05, {}), K_(0.13, null)],
    cross: [K_(0.1, { tr: -0.42, bS: -0.3, bE: -2.3, bx: -4, fH: -0.35 }), K_(0.07, { tr: 0.65, bS: -1.6, bE: -0.05, bx: 18, br: 0.18, fH: -0.5, bH: 0.5 }, "hit"), K_(0.06, {}), K_(0.14, null)],
    uppercut: [K_(0.11, { by: 12, br: 0.14, fS: 0.5, fE: -1.2, fH: -0.5, fK: 1.25, bH: 0.6, bK: 0.9 }), K_(0.09, { by: -14, bx: 10, fS: -2.75, fE: -0.4, tr: 0.32, fH: -0.1, fK: 0.3, bH: 0.1 }, "hit"), K_(0.09, {}), K_(0.17, null)],
    kick: [K_(0.11, { br: -0.1, tr: -0.15, bH: -1.05, bK: 1.7, fS: -0.9, fE: -1.2 }), K_(0.08, { br: -0.32, tr: -0.35, bx: 6, bH: -1.6, bK: 0.05, fS: 0.2, fE: -0.8 }, "hit"), K_(0.08, {}), K_(0.17, null)],
    spinkick: [K_(0.14, { by: 10, br: 0.2, tr: -0.5, fH: -0.5, fK: 1.1, bH: 0.4, bK: 0.6 }), K_(0.08, { sx: -0.1, by: -6, tr: 0.2, bH: -1.2, bK: 0.8 }), K_(0.08, { sx: -1, br: -0.25, tr: 0.3, bH: -1.75, bK: 0.05, fS: -1.2, fE: -0.3, bS: 0.5 }, "hit"), K_(0.08, { sx: -0.1 }), K_(0.2, null)],
    slam: [K_(0.28, { by: -10, tr: -0.4, fS: -3.0, fE: -0.3, bS: -3.0, bE: -0.3, fH: -0.3 }), K_(0.09, { by: 16, bx: 22, br: 0.4, tr: 0.7, fS: -0.7, fE: -0.1, bS: -0.7, bE: -0.1 }, "hit"), K_(0.18, {}), K_(0.3, null)],
    cast: [K_(0.2, { by: -4, tr: -0.18, fS: -2.0, fE: -0.5, bS: -2.0, bE: -0.6 }), K_(0.1, { bx: 8, tr: 0.3, fS: -1.55, fE: -0.05, bS: -1.45, bE: -0.05 }, "hit"), K_(0.14, {}), K_(0.2, null)],
    charge: [K_(0.25, { by: 14, br: 0.1, tr: 0.2, fS: 0.5, fE: -2.0, bS: 0.4, bE: -2.2, fH: -0.5, fK: 1.0, bH: 0.6, bK: 0.9 }), K_(0.45, { by: 16, fS: 0.7, bS: 0.6 }), K_(0.1, null)],
    hurt: [K_(0.05, { bx: -20, br: -0.32, tr: -0.5, hd: -0.5, fS: 0.5, bS: 0.6, fE: -0.4, bE: -0.4 }), K_(0.18, {}), K_(0.22, null)],
    ko: [K_(0.08, { bx: -24, br: -0.4, tr: -0.5, hd: -0.5, fS: 0.7, bS: 0.8 }), K_(0.45, { br: -1.45, by: 44, bx: -40, fS: 1.0, bS: 1.4, fE: -0.2, bE: -0.3, fH: 0.4, bH: 0.7, hd: -0.2 }, null, "out"), "stay"],
    victory: [K_(0.25, { fS: -3.05, fE: -0.15, br: -0.05, by: -4, bS: -0.2 }), "stay"],
  };
  const HELD = {
    dash: { br: 0.38, tr: 0.2, bx: 8, fS: -1.3, fE: -0.6, bS: 1.0, bE: -0.5, fH: -1.1, fK: 0.5, bH: 1.0, bK: 0.9 },
    back: { br: -0.14, tr: -0.1, fH: 0.2, bH: -0.3, fK: 0.3, fS: -0.3, fE: -1.8 },
    air: { br: 0.1, fS: -1.2, fE: -1.0, bS: 0.6, bE: -0.6, fH: -0.9, fK: 1.1, bH: 0.5, bK: 0.9 },
  };
  const ease = (t, kind) => (kind === "out" ? 1 - Math.pow(1 - t, 3) : t * t * (3 - 2 * t));

  // ---------- drawing helpers ----------
  function ptex(scene, key, w, h, fn) {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, w * K, h * K), c = t.getContext(); c.scale(K, K); fn(c, w, h); t.refresh();
  }
  const led = (c, x, y, col, r = 2) => { c.save(); c.shadowColor = col; c.shadowBlur = 9; c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.28); c.fill(); c.restore(); };
  const stripe = (c, x, y, w, h, col) => { c.save(); c.shadowColor = col; c.shadowBlur = 8; c.fillStyle = col; c.fillRect(x, y, w, h); c.restore(); };
  const edge = (c, a = 0.7) => { c.lineWidth = 1.3; c.strokeStyle = `rgba(0,0,0,${a})`; c.stroke(); };
  const cloth = (c, x0, y0, x1, y1, base, dark) => lg(c, x0, y0, x1, y1, [[0, mix(base, dark, 0.65)], [0.35, base], [0.7, mix(base, "#ffffff", 0.16)], [1, mix(base, dark, 0.5)]]);
  const metal = (c, x0, y0, x1, y1, base) => lg(c, x0, y0, x1, y1, [[0, mix(base, "#ffffff", 0.38)], [0.4, base], [1, mix(base, "#000000", 0.62)]]);

  // ---------- head ----------
  function drawHead(c, S) {
    const sk = S.skin, shd = mix(sk, "#4a2010", 0.4), hl = mix(sk, "#ffffff", 0.25), hair = S.hair, hairHi = mix(hair, "#ffffff", 0.28), f = S.gender === "f";
    const FACE = () => { c.beginPath(); c.moveTo(10, 22); c.bezierCurveTo(9, 10, 17, 3, 26, 4); c.bezierCurveTo(34, 5, 39, 11, 39, 18); c.lineTo(41.5, 26); c.bezierCurveTo(42.5, 29, 41, 30.5, 39, 31); c.lineTo(39, 33); c.bezierCurveTo(40, 35, 39, 36.5, 37, 37); c.bezierCurveTo(38, 40, 36, 43, 32, 44.5); c.bezierCurveTo(26, 47.5, 16, 46, 12, 38); c.bezierCurveTo(9, 32, 9, 27, 10, 22); c.closePath(); };
    if (S.hairStyle === "long" || S.hairStyle === "crown") {
      c.fillStyle = lg(c, 0, 10, 0, 52, [[0, hairHi], [0.5, hair], [1, mix(hair, "#000000", 0.4)]]);
      c.beginPath(); c.moveTo(9, 16); c.bezierCurveTo(1, 28, 2, 44, 9, 52); c.lineTo(26, 52); c.lineTo(17, 30); c.closePath(); c.fill(); edge(c, 0.4);
    }
    c.fillStyle = lg(c, 0, 36, 0, 52, [[0, shd], [1, mix(shd, "#000000", 0.3)]]);
    c.beginPath(); c.moveTo(17, 36); c.lineTo(31, 36); c.lineTo(32, 52); c.lineTo(15, 52); c.closePath(); c.fill();
    if (S.hairStyle === "helm_full") {                       // closed helmet: no face
      c.fillStyle = metal(c, 8, 0, 42, 50, S.plate); c.beginPath(); c.moveTo(8, 24); c.bezierCurveTo(6, 8, 16, 1, 26, 2); c.bezierCurveTo(37, 3, 44, 12, 43, 26); c.lineTo(42, 42); c.bezierCurveTo(36, 49, 18, 49, 10, 42); c.closePath(); c.fill(); edge(c, 0.85);
      c.strokeStyle = "rgba(255,255,255,.25)"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(14, 8); c.bezierCurveTo(22, 3, 34, 5, 40, 13); c.stroke();
      c.fillStyle = "#04070a"; c.beginPath(); c.moveTo(20, 22); c.lineTo(42, 20); c.lineTo(42, 29); c.lineTo(22, 30); c.closePath(); c.fill();
      c.save(); c.shadowColor = S.eyeGlow; c.shadowBlur = 14; c.fillStyle = S.eyeGlow; c.fillRect(27, 23.5, 14, 3.4); c.restore();
      c.strokeStyle = S.trim; c.lineWidth = 1.6; c.beginPath(); c.moveTo(26, 4); c.lineTo(26, 44); c.stroke();
      return;
    }
    c.save(); FACE(); c.fillStyle = lg(c, 10, 0, 42, 0, [[0, mix(sk, "#3a1a0e", 0.3)], [0.4, sk], [1, hl]]); c.fill(); c.clip();
    c.fillStyle = "rgba(60,20,10,.2)"; c.beginPath(); c.ellipse(26, 47, 19, 8, 0, 0, 6.28); c.fill();
    glow(c, 32, 31, 8, "#e0786a", f ? 0.3 : 0.14);
    if (S.hairStyle === "helm_horn" || (S.beard && !f)) { c.fillStyle = "rgba(20,12,8,.28)"; c.beginPath(); c.ellipse(28, 38, 12, 8, 0, 0, 6.28); c.fill(); }
    c.restore(); FACE(); edge(c, 0.5);
    c.fillStyle = shd; c.beginPath(); c.ellipse(16, 25, 3, 4.2, 0, 0, 6.28); c.fill(); edge(c, 0.45);
    const eyeCol = S.eye || "#3a2a1c", glowEye = S.eyeGlow;
    c.fillStyle = glowEye ? "#fff4ff" : "#fdfdfd"; c.beginPath(); c.ellipse(33, 21, 3.3, 2.2, 0, 0, 6.28); c.fill();
    if (glowEye) { c.save(); c.shadowColor = glowEye; c.shadowBlur = 12; c.fillStyle = glowEye; c.beginPath(); c.arc(34, 21, 2.3, 0, 6.28); c.fill(); c.restore(); }
    else { c.fillStyle = eyeCol; c.beginPath(); c.arc(34.2, 21, 1.85, 0, 6.28); c.fill(); c.fillStyle = "#050505"; c.beginPath(); c.arc(34.6, 21, 0.95, 0, 6.28); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.arc(35.2, 20.2, 0.55, 0, 6.28); c.fill(); }
    c.strokeStyle = "rgba(20,8,4,.9)"; c.lineWidth = 1.3; c.beginPath(); c.moveTo(29.8, 20.6); c.quadraticCurveTo(33, 18.2, 36.6, 20.4); c.stroke();
    if (f) { c.lineWidth = 1; c.beginPath(); c.moveTo(36.6, 20.4); c.lineTo(38.3, 19); c.moveTo(35.8, 19.6); c.lineTo(37.2, 18.2); c.stroke(); }
    c.strokeStyle = S.brow || hair; c.lineWidth = f ? 1.5 : 2.3; c.lineCap = "round"; c.beginPath(); c.moveTo(29, f ? 16.8 : 16.2); c.quadraticCurveTo(33.5, f ? 14 : 14.4, 38, 16.4); c.stroke(); c.lineCap = "butt";
    c.strokeStyle = "rgba(70,25,12,.5)"; c.lineWidth = 1; c.beginPath(); c.moveTo(39.2, 26.5); c.quadraticCurveTo(38, 30, 40.2, 30.8); c.stroke();
    if (f) { c.fillStyle = "#b44a58"; c.beginPath(); c.ellipse(36.6, 35.8, 2.9, 1.5, 0.1, 0, 6.28); c.fill(); c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(35, 35, 2.4, 0.6); }
    else { c.strokeStyle = "rgba(70,25,22,.85)"; c.lineWidth = 1.4; c.beginPath(); c.moveTo(33, 36); c.quadraticCurveTo(36, 37.2, 38.6, 35.6); c.stroke(); }
    // hair
    if (["short", "ponytail", "long", "crown"].includes(S.hairStyle)) {
      c.fillStyle = lg(c, 0, 0, 0, 24, [[0, hairHi], [0.5, hair], [1, mix(hair, "#000000", 0.35)]]);
      c.beginPath(); c.moveTo(9, 25); c.bezierCurveTo(5, 8, 16, -1, 27, 1.5); c.bezierCurveTo(38, 3, 43, 11, 40.5, 18);
      if (f) { c.bezierCurveTo(38, 11, 31, 10, 27, 12); c.bezierCurveTo(22, 13, 19, 17, 18, 25); } else { c.bezierCurveTo(37, 12.5, 33, 10, 28, 10.5); c.bezierCurveTo(22, 11, 18, 15, 17, 24); }
      c.bezierCurveTo(14, 20, 11, 21, 9, 25); c.closePath(); c.fill(); edge(c, 0.5);
      c.strokeStyle = "rgba(255,255,255,.22)"; c.lineWidth = 0.9; for (const [x0, y0, x1, y1] of [[14, 8, 22, 4], [20, 6, 30, 5], [26, 7, 36, 9]]) { c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, y0 - 3, x1, y1); c.stroke(); }
    }
    if (S.hairStyle === "bald") { c.fillStyle = "rgba(255,255,255,.2)"; c.beginPath(); c.ellipse(24, 8, 8, 3, -0.2, 0, 6.28); c.fill(); }
    if (S.hairStyle === "helm_horn") {
      c.fillStyle = metal(c, 8, 0, 42, 20, S.plate); c.beginPath(); c.moveTo(8, 24); c.bezierCurveTo(6, 8, 16, 0, 26, 1); c.bezierCurveTo(37, 2, 44, 10, 42, 18); c.lineTo(36, 14); c.lineTo(20, 16); c.lineTo(16, 28); c.closePath(); c.fill(); edge(c, 0.85);
      c.fillStyle = mix(S.plate, "#000000", 0.2); c.strokeStyle = S.trim; c.lineWidth = 1.2; for (const sx of [0, 1]) { c.beginPath(); c.moveTo(14 + sx * 14, 6); c.quadraticCurveTo(6 + sx * 30, -2, 4 + sx * 38, -6); c.quadraticCurveTo(14 + sx * 18, 2, 22 + sx * 6, 10); c.closePath(); c.fill(); c.stroke(); }
    }
    if (S.hairStyle === "crown") {
      c.fillStyle = lg(c, 0, 0, 0, 14, [[0, "#ffe9a0"], [1, "#b8741a"]]); c.beginPath(); c.moveTo(11, 10); c.lineTo(9, -3); c.lineTo(17, 5); c.lineTo(25, -6); c.lineTo(33, 5); c.lineTo(41, -3); c.lineTo(39, 11); c.closePath(); c.fill(); edge(c, 0.7);
      led(c, 25, 2, S.glow, 1.6);
    }
    if (S.beard) {
      c.fillStyle = lg(c, 0, 34, 0, 52, [[0, mix(S.beard, "#ffffff", 0.2)], [1, mix(S.beard, "#000000", 0.3)]]);
      c.beginPath(); c.moveTo(12, 33); c.bezierCurveTo(10, 44, 19, 53, 31, 51); c.bezierCurveTo(37, 48, 39, 42, 37, 37); c.bezierCurveTo(35, 40, 31, 42, 27, 41); c.bezierCurveTo(20, 40, 15, 37, 12, 33); c.closePath(); c.fill(); edge(c, 0.35);
      c.strokeStyle = "rgba(0,0,0,.18)"; c.lineWidth = 0.8; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(16 + i * 4, 40); c.lineTo(18 + i * 3.4, 50); c.stroke(); }
      c.fillStyle = mix(S.beard, "#ffffff", 0.1); c.beginPath(); c.moveTo(30, 34.4); c.quadraticCurveTo(36, 33, 40, 34.6); c.quadraticCurveTo(36, 37.6, 30, 36); c.closePath(); c.fill();
    }
    if (S.glasses) { c.strokeStyle = "#d9c070"; c.lineWidth = 1.2; c.beginPath(); c.ellipse(33.8, 21, 5.2, 4.6, 0, 0, 6.28); c.stroke(); c.beginPath(); c.moveTo(28.6, 20.5); c.lineTo(17, 22); c.stroke(); c.fillStyle = "rgba(180,230,255,.14)"; c.beginPath(); c.ellipse(33.8, 21, 5, 4.4, 0, 0, 6.28); c.fill(); }
    if (S.headband) { c.save(); c.shadowColor = S.headband; c.shadowBlur = 8; c.strokeStyle = S.headband; c.lineWidth = 2.2; c.beginPath(); c.moveTo(10.5, 17); c.bezierCurveTo(18, 12.5, 32, 11.5, 40, 15); c.stroke(); c.restore(); led(c, 17, 25, S.headband, 1.8); }
  }

  // ---------- body parts ----------
  function drawTorso(c, S) {
    const m = S.gender !== "f", sh = m ? 5 : 11, wa = m ? 15 : 20, W = 68;
    const body = () => { c.beginPath(); c.moveTo(sh, 14); c.quadraticCurveTo(34, 3, W - sh, 14); c.lineTo(W - sh - 2, 34); c.lineTo(W - wa, 57); c.lineTo(W - wa + 2, 70); c.lineTo(wa - 2, 70); c.lineTo(wa, 57); c.lineTo(sh + 2, 34); c.closePath(); };
    body(); c.fillStyle = cloth(c, 0, 0, W, 0, S.suit, S.suit2); c.fill(); edge(c, 0.8);
    c.save(); body(); c.clip();
    c.fillStyle = lg(c, 0, 40, 0, 72, [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.4)"]]); c.fillRect(0, 40, W, 32);
    c.strokeStyle = "rgba(0,0,0,.28)"; c.lineWidth = 1; for (const [x0, y0, x1, y1] of [[30, 44, 34, 58], [40, 44, 36, 58]]) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
    c.restore();
    // chest armour plate
    const px = m ? 17 : 21;
    c.beginPath(); c.moveTo(px, 13); c.lineTo(W - px, 13); c.lineTo(W - px - 3, 36); c.quadraticCurveTo(34, 46, px + 3, 36); c.closePath();
    c.fillStyle = metal(c, px, 13, W - px, 44, S.plate); c.fill(); edge(c, 0.85);
    c.strokeStyle = "rgba(255,255,255,.3)"; c.lineWidth = 1; c.beginPath(); c.moveTo(px + 2, 15.5); c.lineTo(W - px - 2, 15.5); c.stroke();
    if (S.armored) { c.fillStyle = "rgba(255,255,255,.55)"; for (const [x, y] of [[px + 3, 18], [W - px - 3, 18], [px + 5, 32], [W - px - 5, 32]]) { c.beginPath(); c.arc(x, y, 1.1, 0, 6.28); c.fill(); } }
    // emblem
    c.save(); c.shadowColor = S.trim; c.shadowBlur = 10; c.fillStyle = S.trim; c.beginPath(); c.moveTo(34, 18); c.lineTo(39.5, 26); c.lineTo(34, 34); c.lineTo(28.5, 26); c.closePath(); c.fill(); c.restore();
    c.fillStyle = "rgba(0,0,0,.45)"; c.beginPath(); c.moveTo(34, 22); c.lineTo(36.6, 26); c.lineTo(34, 30); c.lineTo(31.4, 26); c.closePath(); c.fill();
    // side stripes
    stripe(c, sh + 1.5, 20, 2, 22, S.trim); stripe(c, W - sh - 3.5, 20, 2, 22, S.trim);
    // belt
    c.fillStyle = lg(c, 0, 56, 0, 64, [[0, mix(S.suit2, "#ffffff", 0.12)], [1, mix(S.suit2, "#000000", 0.4)]]); c.fillRect(wa - 2, 56, W - 2 * wa + 4, 7); edge(c, 0.7);
    c.fillStyle = metal(c, 28, 55, 40, 64, S.plate); c.beginPath(); c.roundRect(29, 55, 10, 9, 2); c.fill(); edge(c, 0.8); led(c, 34, 59.5, S.trim, 1.5);
    c.fillStyle = mix(S.suit, "#ffffff", 0.05); c.beginPath(); c.moveTo(W / 2 - 3, 12); c.lineTo(W / 2 + 3, 12); c.lineTo(W / 2 + 4, 17); c.lineTo(W / 2 - 4, 17); c.closePath(); c.fill();
    // collar
    c.fillStyle = metal(c, 24, 9, 44, 17, S.plate); c.beginPath(); c.roundRect(24, 9, 20, 7, 3); c.fill(); edge(c, 0.7);
  }
  function drawRobe(c, S) {
    const W = 84, H = 150, f = S.gender === "f";
    c.beginPath(); c.moveTo(f ? 22 : 14, 14); c.quadraticCurveTo(42, 3, f ? 62 : 70, 14); c.lineTo(f ? 58 : 66, 70); c.lineTo(80, H - 3); c.quadraticCurveTo(42, H + 5, 4, H - 3); c.lineTo(f ? 26 : 18, 70); c.closePath();
    c.fillStyle = cloth(c, 0, 0, W, 0, S.robeColor, S.robe2); c.fill(); edge(c, 0.8);
    c.save(); c.clip();
    c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = 1.4; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(24 + i * 6, 74); c.quadraticCurveTo(18 + i * 8, 110, 12 + i * 10, H); c.stroke(); }
    c.fillStyle = lg(c, 0, 80, 0, H, [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.45)"]]); c.fillRect(0, 80, W, 80); c.restore();
    c.fillStyle = S.trim; c.fillRect(8, H - 14, 68, 3.4); c.fillRect(6, H - 22, 72, 1.6);
    c.save(); c.shadowColor = S.trim; c.shadowBlur = 6; c.fillStyle = S.trim; c.fillRect(41, 14, 2.4, H - 30); c.restore();
    c.fillStyle = lg(c, 0, 66, 0, 76, [[0, mix(S.trim, "#000000", 0.2)], [1, mix(S.trim, "#000000", 0.55)]]); c.fillRect(f ? 24 : 17, 66, f ? 36 : 50, 8); edge(c, 0.6);
    c.fillStyle = metal(c, 0, 8, 0, 18, S.plate); c.beginPath(); c.roundRect(f ? 28 : 22, 9, f ? 28 : 40, 8, 3); c.fill(); edge(c, 0.7);
    if (S.armored) { c.beginPath(); c.moveTo(24, 14); c.lineTo(60, 14); c.lineTo(56, 40); c.quadraticCurveTo(42, 50, 28, 40); c.closePath(); c.fillStyle = metal(c, 24, 14, 60, 46, S.plate); c.fill(); edge(c, 0.85); led(c, 42, 27, S.glow, 3.2); }
  }
  function drawLimbs(scene, id, S, T) {
    const bare = S.skin;
    ptex(scene, T("pelvis"), 44, 24, (c) => { c.fillStyle = cloth(c, 0, 0, 44, 0, S.suit2, "#000000"); c.beginPath(); c.roundRect(4, 2, 36, 18, 7); c.fill(); edge(c, 0.7); stripe(c, 6, 9, 32, 1.6, S.trim); });
    ptex(scene, T("upper"), 24, 42, (c) => {
      c.fillStyle = cloth(c, 5, 0, 19, 0, S.robe ? S.robeColor : S.suit, S.suit2); c.beginPath(); c.roundRect(6, 10, 12, 28, 5); c.fill(); edge(c, 0.75);
      if (S.pauldrons) { c.fillStyle = metal(c, 2, 1, 22, 22, S.plate); c.beginPath(); c.ellipse(12, 11, 10.5, 9, 0, 0, 6.28); c.fill(); edge(c, 0.85); c.strokeStyle = S.trim; c.lineWidth = 1.4; c.beginPath(); c.arc(12, 11, 7, 3.4, 6); c.stroke(); } else { c.fillStyle = cloth(c, 2, 0, 22, 0, S.suit, S.suit2); c.beginPath(); c.ellipse(12, 12, 8.5, 7.5, 0, 0, 6.28); c.fill(); edge(c, 0.7); }
      stripe(c, 7, 22, 10, 1.6, S.trim);
    });
    ptex(scene, T("fore"), 24, 46, (c) => {
      c.fillStyle = cloth(c, 5, 0, 19, 0, S.robe ? S.robeColor : S.suit, S.suit2); c.beginPath(); c.roundRect(6, 2, 12, 26, 5); c.fill(); edge(c, 0.75);
      c.fillStyle = metal(c, 4, 20, 20, 34, S.plate); c.beginPath(); c.roundRect(4.5, 19, 15, 13, 4); c.fill(); edge(c, 0.8); stripe(c, 6, 25, 12, 1.4, S.trim);
      c.fillStyle = S.gloves ? cloth(c, 3, 30, 21, 44, S.gloves, "#000000") : lg(c, 3, 30, 21, 44, [[0, mix(bare, "#ffffff", 0.2)], [1, mix(bare, "#4a2010", 0.4)]]);
      c.beginPath(); c.ellipse(12, 37, 8, 8.4, 0, 0, 6.28); c.fill(); edge(c, 0.8);
      c.strokeStyle = "rgba(0,0,0,.45)"; c.lineWidth = 1; for (const x of [9, 12, 15]) { c.beginPath(); c.moveTo(x, 34); c.lineTo(x, 40); c.stroke(); }
    });
    ptex(scene, T("thigh"), 28, 46, (c) => { c.fillStyle = cloth(c, 4, 0, 24, 0, S.suit, S.suit2); c.beginPath(); c.moveTo(6, 4); c.lineTo(22, 4); c.lineTo(20, 42); c.lineTo(8, 42); c.closePath(); c.fill(); edge(c, 0.75); stripe(c, 7, 8, 1.8, 30, S.trim); });
    ptex(scene, T("shin"), 26, 48, (c) => {
      c.fillStyle = cloth(c, 3, 0, 23, 0, S.suit, S.suit2); c.beginPath(); c.moveTo(7, 1); c.lineTo(20, 1); c.lineTo(19, 22); c.lineTo(8, 22); c.closePath(); c.fill(); edge(c, 0.7);
      c.fillStyle = metal(c, 5, 0, 22, 12, S.plate); c.beginPath(); c.roundRect(5, 0, 17, 12, 5); c.fill(); edge(c, 0.8);
      c.fillStyle = cloth(c, 4, 20, 22, 46, S.boots, "#000000"); c.beginPath(); c.moveTo(6, 20); c.lineTo(21, 20); c.lineTo(22, 44); c.lineTo(5, 44); c.closePath(); c.fill(); edge(c, 0.8);
      c.fillStyle = S.trim; c.fillRect(5, 22, 16, 2);
    });
    ptex(scene, T("foot"), 40, 18, (c) => { c.fillStyle = cloth(c, 0, 0, 0, 16, S.boots, "#000000"); c.beginPath(); c.moveTo(3, 3); c.lineTo(20, 3); c.lineTo(30, 6); c.quadraticCurveTo(38, 8, 38, 13); c.lineTo(38, 15.5); c.lineTo(3, 15.5); c.closePath(); c.fill(); edge(c, 0.8); c.fillStyle = "rgba(255,255,255,.2)"; c.fillRect(24, 7, 11, 1.4); c.fillStyle = "#050505"; c.fillRect(3, 14, 35, 2); });
    if (S.pack === "bag") ptex(scene, T("pack"), 26, 46, (c) => { c.fillStyle = cloth(c, 3, 0, 23, 0, S.suit2, "#000000"); c.beginPath(); c.roundRect(3, 2, 20, 38, 6); c.fill(); edge(c, 0.8); c.fillStyle = metal(c, 4, 4, 20, 26, S.plate); c.beginPath(); c.roundRect(5, 6, 16, 14, 4); c.fill(); edge(c, 0.7); led(c, 13, 30, S.trim, 2); stripe(c, 4, 24, 18, 1.4, S.trim); });
    if (S.pack === "quiver") ptex(scene, T("pack"), 26, 46, (c) => { c.fillStyle = cloth(c, 6, 0, 20, 0, "#6b4a28", "#1a0f06"); c.beginPath(); c.moveTo(7, 12); c.lineTo(19, 12); c.lineTo(17, 44); c.lineTo(9, 44); c.closePath(); c.fill(); edge(c, 0.8); c.strokeStyle = "#d8cfae"; c.lineWidth = 1.3; for (const x of [9, 13, 17]) { c.beginPath(); c.moveTo(x, 12); c.lineTo(x - 0.5, 2); c.stroke(); c.fillStyle = S.trim; c.beginPath(); c.moveTo(x - 2.4, 4); c.lineTo(x, 0); c.lineTo(x + 2, 4.4); c.closePath(); c.fill(); } });
    if (S.cape) ptex(scene, T("cape"), 84, 130, (c) => { c.fillStyle = lg(c, 0, 0, 0, 130, [[0, mix(S.cape, "#ffffff", 0.08)], [1, mix(S.cape, "#000000", 0.55)]]); c.beginPath(); c.moveTo(26, 0); c.lineTo(62, 0); c.quadraticCurveTo(82, 60, 80, 124); for (let x = 80; x > 6; x -= 12) c.lineTo(x - 6, 130 - ((x / 12) % 2) * 12); c.quadraticCurveTo(4, 60, 26, 0); c.fill(); edge(c, 0.7); c.strokeStyle = S.trim; c.lineWidth = 1.6; c.stroke(); c.fillStyle = "rgba(0,0,0,.22)"; c.beginPath(); c.moveTo(36, 4); c.quadraticCurveTo(44, 60, 40, 122); c.lineTo(48, 122); c.quadraticCurveTo(54, 60, 48, 4); c.fill(); });
    if (S.tail) ptex(scene, T("tail"), 22, 50, (c) => { c.fillStyle = lg(c, 0, 0, 0, 50, [[0, mix(S.hair, "#ffffff", 0.2)], [1, mix(S.hair, "#000000", 0.4)]]); c.beginPath(); c.moveTo(7, 2); c.bezierCurveTo(-2, 16, 2, 40, 9, 49); c.bezierCurveTo(16, 42, 20, 22, 15, 2); c.closePath(); c.fill(); edge(c, 0.45); c.fillStyle = S.trim || S.glow; c.fillRect(6, 1, 10, 4); });
  }
  function ensureTex(scene, id) {
    const S = SPECS[id], T = (p) => `${id}_${p}`;
    ptex(scene, T("head"), 48, 52, (c) => drawHead(c, S));
    if (S.robe) ptex(scene, T("torso"), 84, 150, (c) => drawRobe(c, S)); else ptex(scene, T("torso"), 68, 72, (c) => drawTorso(c, S));
    drawLimbs(scene, id, S, T);
  }

  // ---------- rig ----------
  function make(scene, id, scale = 1) {
    const S = SPECS[id]; ensureTex(scene, id);
    const T = (p) => `${id}_${p}`, im = (p, ox, oy, x = 0, y = 0) => scene.add.image(x, y, T(p)).setOrigin(ox, oy).setScale(1 / K);
    const bulk = S.bulk || 1, all = [], reg = (i) => (all.push(i), i);
    const root = scene.add.container(0, 0), tint = Phaser.Display.Color.HexStringToColor(S.glow).color;
    const aura = scene.add.image(0, -80, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(4.4 * bulk).setAlpha(S.npc ? 0.08 : id.startsWith("hero") ? 0.2 : 0.2);
    const shadow = scene.add.ellipse(0, 3, 88 * bulk, 13, 0x000000, 0.4);
    const halo = S.halo ? [scene.add.image(0, -110, "ring_a").setBlendMode(Phaser.BlendModes.ADD).setScale(0.42), scene.add.image(0, -110, "ring_b").setBlendMode(Phaser.BlendModes.ADD).setScale(0.3)] : [];
    const body = scene.add.container(0, -72);
    const mkLeg = (x) => { const c = scene.add.container(x * bulk, 0), th = reg(im("thigh", 0.5, 0.12)), sc = scene.add.container(0, 34), sh = reg(im("shin", 0.5, 0.1)), ft = reg(im("foot", 0.35, 0.45, 3, 40)); th.setScale(bulk / K, 1 / K); sh.setScale(bulk / K, 1 / K); sc.add([sh, ft]); c.add([th, sc]); return { c, sc }; };
    const legB = mkLeg(-9), legF = mkLeg(9);
    const pelvis = reg(im("pelvis", 0.5, 0.5, 0, -2)); pelvis.setScale(bulk / K, 1 / K);
    const torsoC = scene.add.container(0, -4);
    const torso = S.robe ? reg(im("torso", 0.5, 0.0, 0, -70)) : reg(im("torso", 0.5, 0.97)); torso.setScale(bulk / K, 1 / K);
    const mkArm = (x, y) => { const sh = scene.add.container(x * bulk, y), up = reg(im("upper", 0.5, 0.26)), el = scene.add.container(0, 30), fo = reg(im("fore", 0.5, 0.1)), glowF = scene.add.image(0, 36, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(0.7).setAlpha(0); up.setScale(bulk / K, 1 / K); fo.setScale(bulk / K, 1 / K); el.add([fo, glowF]); sh.add([up, el]); return { sh, el, glowF }; };
    const armB = mkArm(-22, -52), armF = mkArm(22, -52);
    const headC = scene.add.container(0, -60), head = reg(im("head", 0.5, 0.86, 0, 0)); head.setScale(bulk > 1.2 ? 1.12 / K : 1 / K);
    const tail = S.tail ? reg(im("tail", 0.5, 0.06, -11, -17)) : null;
    const eyeGlow = S.eyeGlow ? scene.add.image(10 * head.scaleX * K, -23.7 * head.scaleX * K, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(Phaser.Display.Color.HexStringToColor(S.eyeGlow).color).setScale(0.45) : null;
    headC.add([...(tail ? [tail] : []), head, ...(eyeGlow ? [eyeGlow] : [])]);
    const pack = S.pack ? reg(im("pack", 0.5, 0.5, -19 * bulk, -34)) : null;
    const cape = S.cape ? reg(im("cape", 0.5, 0.0, -8, -66)) : null;
    torsoC.add([...(cape ? [cape] : []), ...(pack ? [pack] : []), armB.sh, torso, headC, armF.sh]);
    body.add([legB.c, legF.c, pelvis, torsoC]); root.add([...halo, aura, shadow, body]); root.setScale(scale);

    const cur = { ...REST }; let ph = 0, t = 0, track = null, held = null, guard = false, flashT = 0, frozenSnap = false;
    const baseOf = () => (guard ? GUARD : REST);
    const merge = (base, p) => { const o = { ...base }; if (p) for (const k in p) o[k] = p[k]; return o; };
    function apply() {
      body.setPosition(cur.bx, -72 + cur.by); body.rotation = cur.br; body.scaleX = cur.sx; torsoC.rotation = cur.tr; headC.rotation = cur.hd;
      armF.sh.rotation = cur.fS; armF.el.rotation = cur.fE; armB.sh.rotation = cur.bS; armB.el.rotation = cur.bE;
      legF.c.rotation = cur.fH; legF.sc.rotation = cur.fK; legB.c.rotation = cur.bH; legB.sc.rotation = cur.bK;
    }
    function loco(run, grounded, vy) {
      const p = { ...baseOf() }, sw = Math.sin(ph);
      if (!grounded) Object.assign(p, HELD.air, { by: vy < 0 ? -5 : 3 });
      else if (run > 0.05) {
        p.fH = sw * 0.95 * run; p.bH = -sw * 0.95 * run; p.fK = (0.15 + Math.max(0, Math.sin(ph + 1.5)) * 1.25) * run; p.bK = (0.15 + Math.max(0, Math.sin(ph + 1.5 + Math.PI)) * 1.25) * run;
        p.fS = -sw * 0.85 * run - 0.1; p.bS = sw * 0.85 * run - 0.1; p.fE = -1.1 * run - 0.2; p.bE = -1.2 * run - 0.15; p.br = 0.17 * run; p.tr = 0.05 * run; p.by = Math.abs(Math.cos(ph)) * -5 * run + 3 * run;
      } else { const b = Math.sin(t * 2.4); p.by = b * 1.4; p.fS += b * 0.03; p.bS += b * 0.03; }
      return p;
    }
    const api = {
      root, id, all, scale,
      get guard() { return guard; }, set guard(v) { guard = v; },
      hold(name) { held = typeof name === "string" ? HELD[name] : name; }, release() { held = null; },
      snap(p) { frozenSnap = true; Object.assign(cur, merge(baseOf(), p)); apply(); },
      unsnap() { frozenSnap = false; },
      play(name, cbs = {}) {
        const mv = MOVES[name]; return new Promise((resolve) => {
          const stay = mv.includes("stay"), frames = mv.filter((f) => f !== "stay").map((f) => ({ d: f.d, p: f.p === null ? merge(baseOf(), null) : merge(baseOf(), f.p), ev: f.ev, ease: f.ease }));
          track = { frames, i: 0, tm: 0, from: { ...cur }, stay, cbs, resolve };
        });
      },
      isPlaying: () => !!track,
      recover() { if (track && track.stay) { const r = track.resolve; track = null; r(); } track = null; held = null; },
      flash() { flashT = 0.1; all.forEach((i) => i.setTintFill(0xffffff)); },
      tintAll(c) { all.forEach((i) => i.setTint(c)); }, clearTint() { all.forEach((i) => i.clearTint()); },
      orbWorld(front = true) { const m = (front ? armF : armB).glowF.getWorldTransformMatrix(); return { x: m.tx, y: m.ty }; },
      glowPulse(v) { armF.glowF.setAlpha(v).setScale(0.8 + v); armB.glowF.setAlpha(v).setScale(0.8 + v); aura.setAlpha(0.2 + v * 0.35).setScale(4.4 * bulk + v * 2); },
      update(dt, time, st = {}) {
        t += dt; const vx = st.vx || 0, grounded = st.grounded !== false, vy = st.vy || 0, run = Math.min(1, Math.abs(vx) / 240);
        ph += dt * (6 + 9 * run);
        if (flashT > 0) { flashT -= dt; if (flashT <= 0) all.forEach((i) => i.clearTint()); }
        if (!frozenSnap) {
          if (track && track.holding) { /* "stay" move: keep the final pose until recover() */ }
          else if (track) {
            const f = track.frames[track.i]; track.tm += dt; const a = Math.min(1, track.tm / f.d), e = ease(a, f.ease);
            for (const k of KEYS) cur[k] = track.from[k] + (f.p[k] - track.from[k]) * e;
            if (a >= 1) {
              if (f.ev && track.cbs[f.ev]) track.cbs[f.ev]();
              track.from = { ...f.p }; track.tm = 0; track.i++;
              if (track.i >= track.frames.length) { if (track.stay) { track.holding = true; } else { const r = track.resolve; track = null; r(); } }
            }
          } else {
            const target = held ? merge(baseOf(), held) : loco(run, grounded, vy), k = Math.min(1, dt * (held ? 22 : 16));
            for (const key of KEYS) cur[key] += (target[key] - cur[key]) * k;
          }
          apply();
        }
        const sway = Math.sin(time * 0.004), spd = Math.min(1, Math.abs(vx) / 240);
        if (cape) { cape.rotation = -0.12 * spd - Phaser.Math.Clamp(vy, -600, 600) * 0.0004 + sway * 0.05; cape.scaleY = (1 + 0.05 * Math.sin(time * 0.01 + 1) + 0.12 * spd) / K; }
        if (tail) tail.rotation = -0.2 * spd + sway * 0.12 + Phaser.Math.Clamp(vy, -600, 600) * -0.0003;
        if (eyeGlow) eyeGlow.setAlpha(0.7 + 0.3 * Math.sin(time * 0.006));
        halo.forEach((h, i) => { h.rotation += dt * (i ? -0.8 : 0.5); h.y = -110 + Math.sin(time * 0.002) * 8; });
      },
    };
    return api;
  }

  // ---------- arcade cabinet prop (nod to the logo) ----------
  function props(scene) {
    ptex(scene, "cabinet", 150, 250, (c) => {
      const G = NEON; c.save(); c.shadowColor = G; c.shadowBlur = 12;
      c.fillStyle = "#050a07"; c.strokeStyle = G; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(24, 246); c.lineTo(24, 56); c.lineTo(36, 6); c.lineTo(114, 6); c.lineTo(126, 56); c.lineTo(126, 246); c.closePath(); c.fill(); c.stroke(); c.restore();
      c.fillStyle = "#0a1a0d"; c.beginPath(); c.roundRect(34, 14, 82, 24, 4); c.fill(); stripe(c, 40, 24, 70, 3, G);
      c.fillStyle = "#020603"; c.beginPath(); c.roundRect(34, 46, 82, 78, 6); c.fill(); c.strokeStyle = G; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = lg(c, 0, 52, 0, 120, [[0, "#b6ff5a"], [1, "#1fb80c"]]); c.globalAlpha = 0.9; c.beginPath(); c.roundRect(40, 52, 70, 66, 3); c.fill(); c.globalAlpha = 1;
      c.fillStyle = "#031006"; c.beginPath(); c.arc(62, 86, 11, 0.5, 5.8); c.lineTo(62, 86); c.fill(); for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(82 + i * 7, 86, 1.8, 0, 6.28); c.fill(); }
      c.fillStyle = "rgba(0,0,0,.12)"; for (let y = 52; y < 118; y += 4) c.fillRect(40, y, 70, 1.5);
      c.fillStyle = "#0b1a0f"; c.beginPath(); c.moveTo(22, 142); c.lineTo(128, 142); c.lineTo(136, 168); c.lineTo(14, 168); c.closePath(); c.fill(); c.strokeStyle = G; c.lineWidth = 1.5; c.stroke();
      led(c, 50, 154, "#ff3b5c", 5); stripe(c, 49, 154, 2, 10, "#9aa"); for (let i = 0; i < 3; i++) led(c, 82 + i * 14, 156, i ? G : "#ffd36a", 4);
      c.fillStyle = "#060d08"; c.fillRect(40, 190, 70, 40); c.strokeStyle = G; c.strokeRect(40, 190, 70, 40); led(c, 75, 214, G, 3);
    });
    const ring = (key, col, glyphs) => ptex(scene, key, 420, 420, (c) => {
      c.save(); c.translate(210, 210); c.strokeStyle = col; c.shadowColor = col; c.shadowBlur = 14; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 196, 0, 6.28); c.stroke(); c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 170, 0, 6.28); c.stroke();
      for (let i = 0; i < glyphs; i++) { c.rotate((Math.PI * 2) / glyphs); c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, -196); c.lineTo(0, -170); c.stroke(); if (i % 2) { c.fillStyle = col; c.fillRect(-4, -164, 8, 12); } else { c.beginPath(); c.moveTo(-8, -150); c.lineTo(0, -162); c.lineTo(8, -150); c.stroke(); } }
      c.restore();
    });
    ring("ring_a", "#d946ef", 16); ring("ring_b", "#ffd36a", 10);
  }

  return { SPECS, MOVES, HELD, make, props, NEON };
})();
