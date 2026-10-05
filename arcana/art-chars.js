// Procedural characters, creatures and props, drawn on canvases and animated as rigged parts.
const Chars = (() => {
  const { mk, lg, glow, rgba, mix, R, setSeed } = Art.util;
  const NEON = "#39ff14";

  // ---- character specs (palette + look). Hero uses the brand black + neon green. ----
  const SPECS = {
    hero:   { c1: "#1d2c25", c2: "#060a08", trim: NEON, skin: "#d9a984", glow: NEON, head: "hood", cape: true, staff: true },
    lumen:  { c1: "#1f6a60", c2: "#0a2926", trim: "#ffd36a", skin: "#e2b48f", glow: "#5eead4", head: "wizhat", robe: true, hair: "#e8f0f0", staff: true },
    thyla:  { c1: "#5b21b6", c2: "#1e0a3f", trim: "#f0abfc", skin: "#f1c9a8", glow: "#e879f9", head: "elf", robe: true, hair: "#f5d0fe", staff: true },
    ranger: { c1: "#2f6b34", c2: "#0f2a14", trim: "#bef264", skin: "#d9a984", glow: "#bef264", head: "elf", cape: true, hair: "#8a5a2b", staff: true },
    sage:   { c1: "#7c2d12", c2: "#2a0e06", trim: "#fbbf24", skin: "#e8bf9a", glow: "#fbbf24", head: "sage", robe: true, hair: "#f3f4f6", staff: true },
  };

  const face = (c, cx, cy, s, rx = 14, ry = 17) => {
    c.fillStyle = lg(c, cx - rx, cy - ry, cx + rx, cy + ry, [[0, mix(s.skin, "#ffffff", 0.2)], [1, mix(s.skin, "#000000", 0.4)]]);
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, 6.28); c.fill();
    c.fillStyle = "#1a1210";
    for (const dx of [-6, 6]) { c.beginPath(); c.ellipse(cx + dx, cy - 1, 1.7, 2.2, 0, 0, 6.28); c.fill(); }
    c.strokeStyle = "rgba(40,20,10,.7)"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(cx - 9, cy - 6); c.lineTo(cx - 3, cy - 5); c.moveTo(cx + 3, cy - 5); c.lineTo(cx + 9, cy - 6); c.stroke();
    c.fillStyle = "rgba(0,0,0,.18)"; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx - 3, cy + 6); c.lineTo(cx + 3, cy + 6); c.fill();
  };

  const headSize = { hood: [64, 66], wizhat: [80, 104], elf: [64, 72], sage: [66, 76] };

  function drawHead(c, s, w, h) {
    if (s.head === "hood") {
      c.fillStyle = lg(c, 8, 4, 56, 62, [[0, mix(s.c1, "#ffffff", 0.22)], [1, s.c2]]);
      c.beginPath(); c.moveTo(8, 62); c.quadraticCurveTo(0, 28, 22, 8); c.quadraticCurveTo(34, 0, 46, 10); c.quadraticCurveTo(64, 30, 56, 62); c.quadraticCurveTo(32, 70, 8, 62); c.fill();
      c.strokeStyle = rgba(s.trim, 0.8); c.lineWidth = 2; c.stroke();
      c.fillStyle = "#020403"; c.beginPath(); c.ellipse(34, 38, 15, 19, 0.1, 0, 6.28); c.fill();
      c.save(); c.shadowColor = s.glow; c.shadowBlur = 14; c.fillStyle = s.glow;
      c.beginPath(); c.ellipse(29, 37, 3.4, 2.1, 0.15, 0, 6.28); c.fill(); c.beginPath(); c.ellipse(40, 36, 3.4, 2.1, -0.15, 0, 6.28); c.fill(); c.restore();
    } else if (s.head === "wizhat") {
      face(c, 40, 68, s);
      c.fillStyle = lg(c, 0, 70, 0, 100, [[0, mix(s.hair, "#ffffff", 0.1)], [1, mix(s.hair, "#000000", 0.35)]]);
      c.beginPath(); c.moveTo(24, 70); c.quadraticCurveTo(22, 96, 40, 102); c.quadraticCurveTo(58, 96, 56, 70); c.quadraticCurveTo(48, 82, 40, 78); c.quadraticCurveTo(32, 82, 24, 70); c.fill();
      c.fillStyle = lg(c, 10, 2, 66, 46, [[0, mix(s.c1, "#ffffff", 0.2)], [1, s.c2]]);
      c.beginPath(); c.moveTo(12, 50); c.quadraticCurveTo(30, 36, 34, 4); c.quadraticCurveTo(52, 8, 64, 50); c.closePath(); c.fill();
      c.beginPath(); c.ellipse(40, 50, 36, 9, 0, 0, 6.28); c.fill();
      c.strokeStyle = rgba(s.trim, 0.9); c.lineWidth = 3; c.beginPath(); c.moveTo(16, 44); c.quadraticCurveTo(40, 52, 62, 44); c.stroke();
      c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(40, 58, 15, 6, 0, 0, 6.28); c.fill();
    } else if (s.head === "elf") {
      c.fillStyle = s.hair; c.beginPath(); c.moveTo(14, 20); c.quadraticCurveTo(32, -4, 52, 20); c.lineTo(56, 66); c.lineTo(8, 66); c.closePath(); c.fill();
      c.fillStyle = mix(s.skin, "#000000", 0.2);
      for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(32 + sx * 13, 34); c.lineTo(32 + sx * 28, 26); c.lineTo(32 + sx * 14, 44); c.closePath(); c.fill(); }
      face(c, 32, 38, s, 13, 17);
      c.fillStyle = s.hair; c.beginPath(); c.moveTo(18, 30); c.quadraticCurveTo(32, 8, 48, 30); c.quadraticCurveTo(32, 22, 18, 30); c.fill();
      c.strokeStyle = s.trim; c.lineWidth = 2.4; c.beginPath(); c.moveTo(18, 27); c.quadraticCurveTo(32, 20, 47, 27); c.stroke();
      c.save(); c.shadowColor = s.glow; c.shadowBlur = 10; c.fillStyle = s.glow; c.beginPath(); c.arc(32, 23, 2.4, 0, 6.28); c.fill(); c.restore();
    } else {
      face(c, 33, 36, s, 14, 18);
      c.fillStyle = lg(c, 0, 0, 0, 40, [[0, mix(s.skin, "#ffffff", 0.3)], [1, s.skin]]); c.beginPath(); c.ellipse(33, 22, 14, 9, 0, Math.PI, 0); c.fill();
      c.fillStyle = s.hair;
      for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(33 + sx * 17, 30, 5, 10, 0, 0, 6.28); c.fill(); }
      c.beginPath(); c.moveTo(16, 42); c.quadraticCurveTo(14, 72, 33, 76); c.quadraticCurveTo(52, 72, 50, 42); c.quadraticCurveTo(42, 56, 33, 52); c.quadraticCurveTo(24, 56, 16, 42); c.fill();
      c.fillRect(22, 26, 9, 3); c.fillRect(35, 26, 9, 3);
    }
  }

  function ensureActorTex(scene, id) {
    const s = SPECS[id], T = (p) => `${id}_${p}`; setSeed(id.length * 77);
    const [hw, hh] = headSize[s.head];
    mk(scene, T("head"), hw, hh, (c) => drawHead(c, s, hw, hh));
    const tw = s.robe ? 88 : 72, th = s.robe ? 130 : 60;
    mk(scene, T("torso"), tw, th, (c) => {
      c.fillStyle = lg(c, 0, 0, tw, 0, [[0, mix(s.c1, "#000000", 0.3)], [0.55, s.c1], [1, mix(s.c1, "#ffffff", 0.22)]]);
      c.beginPath();
      if (s.robe) { c.moveTo(16, 14); c.quadraticCurveTo(44, 0, 72, 14); c.lineTo(86, th - 4); c.quadraticCurveTo(44, th + 4, 2, th - 4); }
      else { c.moveTo(8, 14); c.quadraticCurveTo(36, 0, 64, 14); c.lineTo(58, th); c.lineTo(14, th); }
      c.closePath(); c.fill();
      c.fillStyle = lg(c, 0, 0, 0, th, [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.45)"]]); c.fill();
      c.strokeStyle = rgba(s.trim, 0.85); c.lineWidth = 2; c.beginPath(); c.moveTo(tw / 2, 8); c.lineTo(tw / 2, th - 2); c.stroke();
      const beltY = s.robe ? 58 : 44; c.fillStyle = rgba(s.trim, 0.9); c.fillRect(tw * 0.14, beltY, tw * 0.72, 6);
      if (s.robe) { c.fillRect(2, th - 8, tw - 4, 4); c.fillRect(6, th - 18, tw - 12, 2); }
      glow(c, tw / 2, 26, 15, s.glow, 0.7); c.fillStyle = s.glow; c.save(); c.shadowColor = s.glow; c.shadowBlur = 10; c.beginPath(); c.moveTo(tw / 2, 19); c.lineTo(tw / 2 + 5, 26); c.lineTo(tw / 2, 33); c.lineTo(tw / 2 - 5, 26); c.fill(); c.restore();
      for (const x of [s.robe ? 16 : 8, s.robe ? 72 : 64]) { c.fillStyle = lg(c, x - 11, 4, x + 11, 24, [[0, mix(s.c1, "#ffffff", 0.3)], [1, s.c2]]); c.beginPath(); c.arc(x, 14, 11, 0, 6.28); c.fill(); c.strokeStyle = rgba(s.trim, 0.8); c.lineWidth = 1.5; c.stroke(); }
    });
    mk(scene, T("leg"), 24, 50, (c) => {
      c.fillStyle = lg(c, 0, 0, 24, 0, [[0, mix(s.c2, "#000000", 0.3)], [1, mix(s.c1, "#ffffff", 0.05)]]);
      c.beginPath(); c.moveTo(5, 0); c.lineTo(19, 0); c.lineTo(17, 34); c.lineTo(7, 34); c.fill();
      c.fillStyle = mix(s.c2, "#000000", 0.4); c.beginPath(); c.moveTo(6, 32); c.lineTo(18, 32); c.lineTo(23, 46); c.quadraticCurveTo(24, 50, 18, 50); c.lineTo(2, 50); c.quadraticCurveTo(1, 42, 6, 32); c.fill();
      c.fillStyle = rgba(s.trim, 0.85); c.fillRect(5, 32, 13, 2.5);
    });
    mk(scene, T("arm"), 20, 50, (c) => {
      c.fillStyle = lg(c, 0, 0, 20, 0, [[0, mix(s.c1, "#000000", 0.3)], [1, mix(s.c1, "#ffffff", 0.15)]]);
      c.beginPath(); c.moveTo(4, 0); c.lineTo(16, 0); c.lineTo(15, 34); c.lineTo(5, 34); c.fill();
      c.fillStyle = rgba(s.trim, 0.85); c.fillRect(4, 30, 12, 3);
      c.fillStyle = s.head === "hood" ? mix(s.c2, "#000000", 0.2) : s.skin; c.beginPath(); c.arc(10, 40, 7, 0, 6.28); c.fill();
    });
    mk(scene, T("staff"), 28, 180, (c) => {
      c.fillStyle = lg(c, 11, 0, 17, 0, [[0, "#3b2a1a"], [0.5, "#8a6a3c"], [1, "#2a1c10"]]); c.fillRect(11, 26, 6, 154);
      c.strokeStyle = s.trim; c.lineWidth = 3; c.shadowColor = s.glow; c.shadowBlur = 8;
      c.beginPath(); c.moveTo(14, 30); c.quadraticCurveTo(0, 22, 4, 8); c.moveTo(14, 30); c.quadraticCurveTo(28, 22, 24, 8); c.stroke();
      for (const y of [44, 100]) { c.fillStyle = s.trim; c.fillRect(9, y, 10, 4); }
    });
    mk(scene, T("cape"), 84, 130, (c) => {
      c.fillStyle = lg(c, 0, 0, 0, 130, [[0, mix(s.c1, "#ffffff", 0.05)], [1, s.c2]]);
      c.beginPath(); c.moveTo(24, 0); c.lineTo(60, 0); c.quadraticCurveTo(80, 60, 80, 126); for (let x = 80; x > 6; x -= 12) c.lineTo(x - 6, 130 - ((x / 12) % 2) * 14); c.quadraticCurveTo(4, 60, 24, 0); c.fill();
      c.strokeStyle = rgba(s.trim, 0.8); c.lineWidth = 2; c.stroke();
      c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.moveTo(34, 4); c.quadraticCurveTo(42, 60, 40, 120); c.lineTo(48, 120); c.quadraticCurveTo(52, 60, 46, 4); c.fill();
    });
  }

  // ---- rigged actor ----
  function actor(scene, id, scale = 1.1) {
    const s = SPECS[id]; ensureActorTex(scene, id);
    const T = (p) => `${id}_${p}`, img = (p, ox, oy, x, y) => scene.add.image(x, y, T(p)).setOrigin(ox, oy);
    const neckY = s.robe ? -118 : -88, shY = neckY + 6, torsoY = s.robe ? 4 : -36, hh = headSize[s.head][1];
    const root = scene.add.container(0, 0), parts = [];
    root.add(scene.add.image(0, -70, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(Phaser.Display.Color.HexStringToColor(s.glow).color).setScale(4).setAlpha(id === "hero" ? 0.28 : 0.14));
    const cape = s.cape ? img("cape", 0.5, 0, -10, shY) : null;
    const legB = s.robe ? null : img("leg", 0.5, 0.06, -9, -40), legF = s.robe ? null : img("leg", 0.5, 0.06, 9, -40);
    const armB = img("arm", 0.5, 0.08, -18, shY);
    const torso = img("torso", 0.5, 1, 0, torsoY), head = img("head", 0.5, (hh - 8) / hh, 3, neckY);
    const armF = scene.add.container(18, shY), armImg = img("arm", 0.5, 0.08, 0, 0), staffC = scene.add.container(0, 42), orb = scene.add.image(0, -138, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(Phaser.Display.Color.HexStringToColor(s.glow).color).setScale(1.1);
    armF.add(armImg);
    if (s.staff) { staffC.add([img("staff", 0.5, 0.78, 0, 0), orb]); staffC.rotation = 0.18; armF.add(staffC); }
    [cape, legB, armB, torso, legF, head, armF].forEach((p) => p && root.add(p));
    root.setScale(scale); let ph = 0, flashT = 0;
    const all = [cape, legB, legF, armB, torso, head, armImg].filter(Boolean);
    return {
      root, id, orb,
      update(dt, t, st = {}) {
        const vx = st.vx || 0, g = st.grounded !== false, vy = st.vy || 0, run = Math.min(1, Math.abs(vx) / 230);
        ph += dt * (7 + 9 * run); const sw = Math.sin(ph) * run, bob = g ? Math.abs(Math.sin(ph)) * 5 * run : 0, br = Math.sin(t * 0.003) * 1.3;
        torso.y = torsoY - bob; head.y = neckY - bob + br * 0.5; armB.y = shY - bob; armF.y = shY - bob;
        if (legF) { legF.rotation = g ? sw * 0.95 : 0.6; legB.rotation = g ? -sw * 0.95 : -0.4; }
        armB.rotation = g ? -sw * 0.8 : -1.0; armF.rotation = g ? sw * 0.28 - 0.08 : 0.7; torso.rotation = 0.09 * run; head.rotation = 0.04 * run;
        if (cape) { cape.rotation = -0.14 * run - Phaser.Math.Clamp(vy, -600, 600) * 0.0004 + Math.sin(t * 0.004) * 0.04; cape.scaleY = 1 + 0.06 * Math.sin(t * 0.01 + 1) + 0.12 * run; cape.y = shY - bob; }
        orb.setScale(1.05 + 0.18 * Math.sin(t * 0.006)).setAlpha(0.8 + 0.2 * Math.sin(t * 0.009));
        if (flashT > 0) { flashT -= dt; if (flashT <= 0) all.forEach((p) => p.clearTint()); }
      },
      hurtFlash() { flashT = 0.22; all.forEach((p) => p.setTint(0xff3355)); },
      cast() { scene.tweens.add({ targets: armF, rotation: -1.5, duration: 120, yoyo: true, ease: "Sine.out" }); },
      orbWorld() { const m = orb.getWorldTransformMatrix(); return { x: m.tx, y: m.ty }; },
    };
  }

  // ---- creatures ----
  const sentinelTex = (scene, col) => {
    mk(scene, `sentinel_${col}`, 150, 150, (c) => {
      glow(c, 75, 75, 74, col, 0.2);
      const g = c.createRadialGradient(56, 50, 4, 75, 75, 62); g.addColorStop(0, "#8c9a94"); g.addColorStop(0.55, "#1d2622"); g.addColorStop(1, "#050807");
      c.fillStyle = g; c.beginPath(); c.arc(75, 75, 58, 0, 6.28); c.fill();
      c.strokeStyle = rgba(col, 0.35); c.lineWidth = 1.5; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(75, 75, 58 - i * 10, 0.4 + i, 2 + i); c.stroke(); }
      c.fillStyle = "#020403"; c.beginPath(); c.roundRect(32, 60, 86, 30, 14); c.fill(); c.strokeStyle = col; c.lineWidth = 2; c.shadowColor = col; c.shadowBlur = 12; c.stroke();
      c.fillStyle = col; c.fillRect(46, 72, 58, 6);
    });
    mk(scene, `sentinel_ring_${col}`, 220, 60, (c) => { c.strokeStyle = col; c.shadowColor = col; c.shadowBlur = 14; c.lineWidth = 4; c.beginPath(); c.ellipse(110, 30, 100, 20, 0, 0, 6.28); c.stroke(); });
  };

  function wraithTex(scene) {
    mk(scene, "wraith", 260, 320, (c) => {
      glow(c, 130, 130, 130, "#a21caf", 0.28);
      c.fillStyle = lg(c, 0, 20, 0, 320, [[0, "#3b1760"], [0.55, "#14061f"], [1, "rgba(5,2,10,0)"]]);
      c.beginPath(); c.moveTo(130, 14); c.quadraticCurveTo(200, 30, 196, 120); c.quadraticCurveTo(230, 220, 250, 318);
      for (let x = 250; x > 10; x -= 24) c.quadraticCurveTo(x - 6, 280, x - 12, 318 - ((x / 24) % 2) * 28);
      c.quadraticCurveTo(30, 220, 64, 120); c.quadraticCurveTo(60, 30, 130, 14); c.fill();
      c.strokeStyle = "rgba(192,132,252,.55)"; c.lineWidth = 2; c.stroke();
      c.fillStyle = "#010102"; c.beginPath(); c.ellipse(130, 92, 36, 48, 0, 0, 6.28); c.fill();
      c.save(); c.shadowColor = "#ff3df2"; c.shadowBlur = 22; c.fillStyle = "#ff7df5";
      c.beginPath(); c.ellipse(115, 88, 9, 5, 0.25, 0, 6.28); c.fill(); c.beginPath(); c.ellipse(145, 88, 9, 5, -0.25, 0, 6.28); c.fill(); c.restore();
      c.strokeStyle = "#c084fc"; c.lineWidth = 3; c.lineCap = "round";
      for (const sx of [-1, 1]) { const x0 = 130 + sx * 50; c.beginPath(); c.moveTo(x0, 150); c.quadraticCurveTo(130 + sx * 100, 160, 130 + sx * 118, 190); c.stroke(); for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(130 + sx * 118, 190); c.lineTo(130 + sx * 130, 206 + i * 12); c.stroke(); } }
    });
  }
  function golemTex(scene) {
    mk(scene, "golem", 300, 340, (c) => {
      const stone = (x, y, w, h, r = 8) => {
        c.fillStyle = lg(c, x, y, x + w, y + h, [[0, "#9aa39d"], [0.5, "#616b66"], [1, "#2c3330"]]); c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
        c.strokeStyle = "rgba(0,0,0,.55)"; c.lineWidth = 2; c.stroke();
        c.strokeStyle = "rgba(0,0,0,.4)"; c.lineWidth = 1.5; c.beginPath(); let px = x + R(4, w - 4), py = y; c.moveTo(px, py); for (let i = 0; i < 4; i++) { px += R(-10, 10); py += h / 4; c.lineTo(px, py); } c.stroke();
      };
      stone(78, 230, 54, 100); stone(168, 230, 54, 100); stone(88, 90, 124, 160, 14); stone(36, 100, 56, 70, 26); stone(208, 100, 56, 70, 26);
      stone(18, 150, 46, 120); stone(236, 150, 46, 120); stone(8, 250, 66, 60, 14); stone(226, 250, 66, 60, 14); stone(106, 18, 88, 84, 12);
      c.fillStyle = "#3c6b2a"; for (let i = 0; i < 14; i++) { c.beginPath(); c.ellipse(R(40, 260), R(95, 110) + (i % 3) * 6, R(8, 20), 5, 0, 0, 6.28); c.fill(); }
      c.save(); c.shadowColor = "#7dff3a"; c.shadowBlur = 20; c.fillStyle = "#b6ff5a";
      c.fillRect(124, 52, 16, 9); c.fillRect(160, 52, 16, 9);
      c.strokeStyle = "#7dff3a"; c.lineWidth = 3; c.beginPath(); c.moveTo(150, 130); c.lineTo(150, 200); c.moveTo(126, 160); c.lineTo(174, 160); c.moveTo(130, 130); c.lineTo(170, 200); c.stroke(); c.restore();
    });
  }
  function ringTex(scene, key, col, glyphs) {
    mk(scene, key, 420, 420, (c) => {
      c.save(); c.translate(210, 210); c.strokeStyle = col; c.shadowColor = col; c.shadowBlur = 14;
      c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 196, 0, 6.28); c.stroke(); c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 170, 0, 6.28); c.stroke();
      for (let i = 0; i < glyphs; i++) { c.rotate((Math.PI * 2) / glyphs); c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, -196); c.lineTo(0, -170); c.stroke(); if (i % 2) { c.fillStyle = col; c.fillRect(-4, -164, 8, 12); } else { c.beginPath(); c.moveTo(-8, -150); c.lineTo(0, -162); c.lineTo(8, -150); c.stroke(); } }
      c.restore();
    });
  }
  function archmageTex(scene) {
    ringTex(scene, "ring_a", "#ff2d4a", 16); ringTex(scene, "ring_b", "#ffb347", 10);
    mk(scene, "archmage", 320, 400, (c) => {
      glow(c, 160, 150, 150, "#ff2d4a", 0.3);
      c.fillStyle = lg(c, 0, 0, 0, 400, [[0, "#2b0a14"], [0.5, "#0c0306"], [1, "rgba(0,0,0,0)"]]);
      c.beginPath(); c.moveTo(160, 40); c.quadraticCurveTo(220, 56, 214, 150); c.quadraticCurveTo(262, 280, 296, 398); for (let x = 296; x > 24; x -= 34) c.quadraticCurveTo(x - 10, 360, x - 17, 398 - ((x / 34) % 2) * 34); c.quadraticCurveTo(58, 280, 106, 150); c.quadraticCurveTo(100, 56, 160, 40); c.fill();
      c.strokeStyle = "#ffb347"; c.lineWidth = 3; c.stroke();
      c.fillStyle = "#010101"; c.beginPath(); c.ellipse(160, 112, 36, 46, 0, 0, 6.28); c.fill();
      c.save(); c.shadowColor = "#ff2d4a"; c.shadowBlur = 24; c.fillStyle = "#ff6b7d"; c.beginPath(); c.ellipse(146, 106, 10, 5, 0.2, 0, 6.28); c.fill(); c.beginPath(); c.ellipse(174, 106, 10, 5, -0.2, 0, 6.28); c.fill(); c.restore();
      c.fillStyle = lg(c, 0, 0, 0, 70, [[0, "#ffd36a"], [1, "#b8741a"]]);
      c.beginPath(); c.moveTo(112, 70); c.lineTo(96, 8); c.lineTo(128, 44); c.lineTo(144, 0); c.lineTo(160, 38); c.lineTo(176, 0); c.lineTo(192, 44); c.lineTo(224, 8); c.lineTo(208, 70); c.closePath(); c.fill();
      c.strokeStyle = "rgba(255,179,71,.9)"; c.lineWidth = 3; c.beginPath(); c.moveTo(160, 150); c.lineTo(160, 380); c.stroke(); c.fillStyle = "#ffb347"; c.fillRect(96, 214, 128, 8);
    });
  }

  function creature(scene, kind) {
    const root = scene.add.container(0, 0); let upd, extra = {}, bodies = [];
    if (kind === "sentinel") {
      const col = "#ff3b6b"; sentinelTex(scene, col);
      const body = scene.add.image(0, -120, `sentinel_${col}`), ring = scene.add.image(0, -120, `sentinel_ring_${col}`).setBlendMode(Phaser.BlendModes.ADD);
      const jet = scene.add.image(0, -28, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff3b6b).setScale(1.6, 0.5);
      const orbs = [0, 1].map(() => scene.add.image(0, 0, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff6b8b).setScale(0.7));
      root.add([jet, body, ring, ...orbs]); bodies = [body];
      upd = (dt, t) => { const b = Math.sin(t * 0.003) * 8; body.y = -120 + b; ring.y = -120 + b; ring.scaleX = 1 + Math.sin(t * 0.004) * 0.08; jet.alpha = 0.6 + 0.3 * Math.sin(t * 0.02); orbs.forEach((o, i) => { const a = t * 0.004 + i * Math.PI; o.x = Math.cos(a) * 100; o.y = -120 + b + Math.sin(a) * 18; o.setDepth(Math.sin(a) > 0 ? 1 : -1); }); };
    } else if (kind === "wraith") {
      wraithTex(scene); const body = scene.add.image(0, 10, "wraith").setOrigin(0.5, 1); root.add(body); bodies = [body];
      const wisps = [0, 1, 2].map(() => scene.add.image(0, 0, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0xd946ef).setScale(0.8)); root.add(wisps);
      upd = (dt, t) => { body.y = 10 - 30 + Math.sin(t * 0.0025) * 14; body.rotation = Math.sin(t * 0.0018) * 0.04; wisps.forEach((w, i) => { const a = t * 0.0025 + (i * Math.PI * 2) / 3; w.x = Math.cos(a) * 130; w.y = -150 + Math.sin(a * 1.3) * 60; w.alpha = 0.5 + 0.4 * Math.sin(t * 0.01 + i); }); };
    } else if (kind === "golem") {
      golemTex(scene); const body = scene.add.image(0, 14, "golem").setOrigin(0.5, 1); root.add(body); bodies = [body];
      const eye = scene.add.image(0, -270, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0x7dff3a).setScale(1.4, 0.7); root.add(eye);
      upd = (dt, t) => { body.scaleY = 1 + Math.sin(t * 0.0022) * 0.012; body.scaleX = 1 - Math.sin(t * 0.0022) * 0.006; eye.alpha = 0.6 + 0.4 * Math.sin(t * 0.006); };
    } else {
      archmageTex(scene);
      const ra = scene.add.image(0, -230, "ring_a").setBlendMode(Phaser.BlendModes.ADD).setScale(1.05), rb = scene.add.image(0, -230, "ring_b").setBlendMode(Phaser.BlendModes.ADD).setScale(0.75);
      const body = scene.add.image(0, 0, "archmage").setOrigin(0.5, 1);
      const orbs = [-1, 1].map(() => scene.add.image(0, 0, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff3355).setScale(1.5));
      root.add([ra, rb, body, ...orbs]); bodies = [body];
      upd = (dt, t) => { const f = Math.sin(t * 0.002) * 16; body.y = -30 + f; ra.y = -230 + f; rb.y = -230 + f; ra.rotation += dt * 0.5; rb.rotation -= dt * 0.8; orbs.forEach((o, i) => { o.x = (i ? 1 : -1) * 150; o.y = -170 + f + Math.sin(t * 0.004 + i * 2) * 20; o.setScale(1.3 + 0.3 * Math.sin(t * 0.008 + i)); }); };
    }
    return {
      root, update: upd, bodies,
      flash() { bodies.forEach((b) => b.setTint(0xffffff)); scene.time.delayedCall(90, () => bodies.forEach((b) => b.clearTint())); },
    };
  }

  // ---- props ----
  function props(scene) {
    mk(scene, "gate_pillars", 240, 300, (c) => {
      for (const x of [20, 170]) {
        c.fillStyle = lg(c, x, 0, x + 50, 0, [[0, "#0a0f0c"], [0.6, "#1c2822"], [1, "#2c3d34"]]); c.fillRect(x, 40, 50, 260);
        c.strokeStyle = rgba(NEON, 0.8); c.lineWidth = 2; c.shadowColor = NEON; c.shadowBlur = 10; c.strokeRect(x, 40, 50, 260);
        c.beginPath(); for (let y = 80; y < 280; y += 46) { c.moveTo(x + 14, y); c.lineTo(x + 36, y); c.lineTo(x + 25, y + 18); c.closePath(); } c.stroke();
      }
      c.shadowBlur = 0; c.fillStyle = lg(c, 0, 0, 0, 60, [[0, "#2c3d34"], [1, "#0a0f0c"]]); c.fillRect(8, 6, 224, 44);
      c.strokeStyle = rgba(NEON, 0.9); c.shadowColor = NEON; c.shadowBlur = 12; c.lineWidth = 2; c.strokeRect(8, 6, 224, 44); c.beginPath(); c.arc(120, 28, 12, 0, 6.28); c.stroke();
    });
    mk(scene, "gate_field", 130, 250, (c) => {
      for (let i = 0; i < 18; i++) { const x = 6 + i * 7; c.fillStyle = lg(c, 0, 0, 0, 250, [[0, "rgba(57,255,20,0)"], [0.5, rgba(NEON, R(0.25, 0.7))], [1, "rgba(57,255,20,0)"]]); c.fillRect(x, 0, 3, 250); }
      glow(c, 65, 125, 90, NEON, 0.35);
    });
    mk(scene, "altar", 150, 160, (c) => {
      c.fillStyle = lg(c, 0, 80, 150, 160, [[0, "#2c3d34"], [1, "#0a0f0c"]]); c.beginPath(); c.moveTo(20, 160); c.lineTo(34, 70); c.lineTo(116, 70); c.lineTo(130, 160); c.fill();
      c.fillStyle = "#1c2822"; c.fillRect(10, 56, 130, 20); c.strokeStyle = rgba(NEON, 0.9); c.shadowColor = NEON; c.shadowBlur = 10; c.lineWidth = 2; c.strokeRect(10, 56, 130, 20);
      c.beginPath(); c.moveTo(75, 96); c.lineTo(95, 120); c.lineTo(75, 144); c.lineTo(55, 120); c.closePath(); c.stroke();
    });
    mk(scene, "gem", 50, 80, (c) => {
      c.save(); c.shadowColor = NEON; c.shadowBlur = 18; c.fillStyle = lg(c, 0, 0, 50, 80, [[0, "#d9ffb0"], [0.5, NEON], [1, "#0b6a1d"]]);
      c.beginPath(); c.moveTo(25, 2); c.lineTo(46, 30); c.lineTo(25, 78); c.lineTo(4, 30); c.closePath(); c.fill(); c.restore();
      c.fillStyle = "rgba(255,255,255,.35)"; c.beginPath(); c.moveTo(25, 2); c.lineTo(46, 30); c.lineTo(25, 40); c.closePath(); c.fill();
    });
    mk(scene, "door_frame", 240, 320, (c) => {
      c.fillStyle = "#0a0f0c"; c.beginPath(); c.moveTo(10, 320); c.lineTo(10, 110); c.quadraticCurveTo(10, 8, 120, 8); c.quadraticCurveTo(230, 8, 230, 110); c.lineTo(230, 320); c.lineTo(190, 320); c.lineTo(190, 118); c.quadraticCurveTo(190, 48, 120, 48); c.quadraticCurveTo(50, 48, 50, 118); c.lineTo(50, 320); c.closePath(); c.fill();
      c.strokeStyle = rgba(NEON, 0.95); c.shadowColor = NEON; c.shadowBlur = 14; c.lineWidth = 3; c.stroke();
      c.fillStyle = NEON; c.beginPath(); c.moveTo(120, 14); c.lineTo(132, 30); c.lineTo(120, 44); c.lineTo(108, 30); c.fill();
    });
    mk(scene, "swirl", 300, 300, (c) => {
      c.translate(150, 150); glow(c, 0, 0, 150, NEON, 0.45); c.translate(-150, -150);
      c.save(); c.translate(150, 150); c.strokeStyle = rgba(NEON, 0.8); c.lineWidth = 3; c.shadowColor = NEON; c.shadowBlur = 10;
      for (let arm = 0; arm < 3; arm++) { c.beginPath(); for (let a = 0; a < 12; a += 0.12) { const r = a * 11, th = a + arm * 2.09; const x = Math.cos(th) * r, y = Math.sin(th) * r; a === 0 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); }
      c.restore();
    });
  }

  return { actor, creature, props, SPECS, NEON };
})();
