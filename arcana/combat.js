// Real-time arena combat. The student fights with buttons against enemies that each carry a "knowledge shard": a fact from the
// student's own material. Techniques: 4-hit strike chain, kicks, charged guard-breaker, launcher + air juggles, dive kick, ground slam,
// sweep, grab and throw, dash strike, perfect parry (reflects bolts), executions, and four powers. Bosses and quests stay question-based.
const Combat = (() => {
  const GROUND = Art.GROUND;
  const hex = (s) => Phaser.Display.Color.HexStringToColor(s).color, rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const HERO = hex(People.NEON);
  const T = {}; // touch buttons
  let C = null, keys = null, built = false;

  // ------------------------------------------------------------------ extra animations on the shared skeleton
  const M = (d, p, ev) => ({ d, p, ev });
  Object.assign(People.MOVES, {
    hook: [M(0.09, { tr: -0.5, bS: -0.8, bE: -1.9, br: -0.06, fS: -0.4, fE: -1.9 }), M(0.07, { tr: 0.8, bS: -1.45, bE: -1.3, bx: 14, br: 0.16, hd: 0.08 }, "hit"), M(0.06, {}), M(0.14, null)],
    elbow: [M(0.06, { tr: -0.3, fS: -0.9, fE: -2.5 }), M(0.06, { tr: 0.55, fS: -1.25, fE: -2.6, bx: 22, br: 0.2 }, "hit"), M(0.06, {}), M(0.14, null)],
    knee: [M(0.08, { fS: -1.1, fE: -1.3, bS: -1.1, bE: -1.3, by: -2 }), M(0.07, { by: -10, bH: -1.75, bK: 2.3, fS: -1.2, fE: -1.2, bS: -1.2, bE: -1.2, bx: 10, br: 0.1 }, "hit"), M(0.08, {}), M(0.12, null)],
    palm: [M(0.1, { tr: -0.35, fS: -0.5, fE: -1.9, bS: -0.5, bE: -1.9, bx: -4 }), M(0.07, { bx: 22, tr: 0.2, fS: -1.6, fE: -0.08, bS: -1.5, bE: -0.15, br: 0.12 }, "hit"), M(0.1, {}), M(0.16, null)],
    sweep: [M(0.1, { by: 28, fK: 1.7, fH: -0.7, bH: 0.2, bK: 1.2, br: 0.12, fS: 0.3, bS: -0.4 }), M(0.08, { by: 34, br: -0.18, tr: -0.45, bH: -1.55, bK: 0.08, fH: -0.6, fK: 1.8 }, "hit"), M(0.1, {}), M(0.16, null)],
  });
  People.HELD.dive = { br: 0.55, tr: -0.2, fH: -1.35, fK: 0.05, bH: 0.7, bK: 1.5, fS: 0.5, fE: -0.6, bS: -0.8, bE: -1.0 };

  const TECH = { chain: "4-hit chain", launcher: "Launcher", juggle: "Air juggle", breaker: "Guard breaker", dive: "Dive kick", slam: "Ground slam", sweep: "Sweep", throw: "Throw", dash: "Dash strike", parry: "Perfect parry", execute: "Execution", power: "Power" };

  // ------------------------------------------------------------------ plan: turn a chapter's own content into an encounter
  const clip = (t, n = 150) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, t.lastIndexOf(" ", n - 1)).replace(/[,;:]$/, "") + "..." : t; };
  function plan(ch, index, adapt) {
    const names = {}; (ch.concepts || []).forEach((c) => (names[c.id] = c.name));
    const facts = [];
    for (const s of ch.scenes) {
      if (s.type === "tablet") for (const pt of s.tablet.points || []) facts.push({ concept: s.tablet.title, text: clip(pt) });
      if (s.type === "npc") for (const l of s.dialogue || []) { const hit = (ch.concepts || []).find((c) => l.text.toLowerCase().includes(c.name.toLowerCase())); facts.push({ concept: hit ? hit.name : s.npc.name, text: clip(l.text) }); }
      for (const q of s.question ? [s.question] : s.questions || []) if (q.explanation) facts.push({ concept: names[q.conceptId] || "Key idea", text: clip(q.explanation) });
    }
    const seen = new Set(), uniq = facts.filter((f) => !seen.has(f.text) && seen.add(f.text));
    for (let i = uniq.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uniq[i], uniq[j]] = [uniq[j], uniq[i]]; }
    // waves: an ambush is 2 waves, an elite fight 3 waves and a champion. Difficulty follows the student's mastery, so it stays winnable.
    const d = (adapt && adapt.difficulty) || 3, cidx = G.chapterIdx || 0, first = cidx < 1 && index === 0, adj = (d >= 4 ? 1 : 0) - (d <= 2 ? 1 : 0);
    const sizes = (index === 0 ? (first ? [2, 3] : [3, 4]) : [3, 4, 4]).map((n) => Math.max(2, n + adj));
    const kinds = first ? ["brute"] : index === 0 ? ["brute", "caster", "brute", "guardian", "dasher"] : ["brute", "caster", "guardian", "dasher", "brute", "dasher", "caster"];
    const suffix = { brute: ["Thrall", "Revenant"], caster: ["Wraith", "Shade"], dasher: ["Stalker", "Blade"], guardian: ["Sentinel", "Bulwark"] };
    const STOP = new Set(["of", "the", "and", "in", "to", "a", "an", "for", "on", "with", "by", "is"]);
    const two = (c) => { const w = c.split(/\s+/).slice(0, 3); while (w.length > 1 && (w.length > 2 || STOP.has(w[w.length - 1].toLowerCase()))) w.pop(); return w.join(" "); };   // "Products of X" -> "Products"
    const fact = (i) => uniq[i % Math.max(1, uniq.length)] || { concept: "Knowledge", text: "Keep learning: every fact you collect makes the next fight easier." };
    const enemies = []; let i = 0;
    sizes.forEach((n, w) => { for (let j = 0; j < n; j++, i++) { const f = fact(i), k = kinds[(i + w) % kinds.length]; enemies.push({ kind: k, wave: w, name: (two(f.concept) + " " + suffix[k][(i + index) % 2]).toUpperCase(), fact: f }); } });
    if (index > 0) { const f = fact(i); enemies.push({ kind: d >= 3 ? "guardian" : "brute", wave: sizes.length - 1, champion: true, name: (two(f.concept) + " Warlord").toUpperCase(), fact: { ...f, big: true } }); }
    return { title: index === 0 ? "Ambush" : "Elite ambush", waves: sizes.length, enemies };
  }

  // ------------------------------------------------------------------ HUD
  const $ = (s) => document.querySelector(s);
  const MOVES_HTML = `<b>TECHNIQUES</b><span><kbd>J</kbd> strike chain (4th hit launches)</span><span><kbd>K</kbd> kick / <kbd>hold K</kbd> guard breaker</span><span><kbd>U</kbd> launcher, then <kbd>J</kbd> in the air</span>
    <span><kbd>L</kbd> grab and throw</span><span><kbd>S</kbd>+<kbd>J</kbd> sweep</span><span><kbd>Shift</kbd> dodge, then <kbd>J</kbd> dash strike</span><span>air <kbd>K</kbd> dive kick / air <kbd>S</kbd>+<kbd>K</kbd> slam</span>
    <span>tap <kbd>S</kbd> as a hit lands: parry</span><span><kbd>E</kbd> execute a stunned, weak enemy</span><span><kbd>1</kbd>-<kbd>4</kbd> powers &middot; <kbd>H</kbd> hide</span>`;
  function build() {
    if (built) return; built = true;
    const el = document.createElement("div"); el.id = "cb"; el.className = "hidden";
    el.innerHTML = `<div class="cb-hero"><div class="cb-tag"><b id="cb-lv">LV 1</b><span id="cb-name">RANGER</span></div><div class="cb-bar hp"><i id="cb-hp"></i><b id="cb-hpt"></b></div><div class="cb-bar en"><i id="cb-en"></i></div></div>
      <div class="cb-foes"><span id="cb-wave">HOSTILES</span><b id="cb-left">0</b></div>
      <div class="cb-combo hidden" id="cb-combo"><b id="cb-cn">x1</b><span>COMBO</span></div>
      <div class="cb-meter"><i id="cb-mt"></i><span>KNOWLEDGE</span></div>
      <div class="cb-slots" id="cb-slots"></div><div id="fact" class="hidden"></div><div id="cb-moves"></div><div id="cb-call" class="hidden"></div>
      <div id="ctouch"><button data-a="strike">J<small>STRIKE</small></button><button data-a="kick" data-k="1">K<small>KICK/HOLD</small></button><button data-a="launch">U<small>LAUNCH</small></button><button data-a="grab">L<small>THROW</small></button>
        <button data-a="guard" data-hold="1">S<small>GUARD</small></button><button data-a="dodge">&#8679;<small>DODGE</small></button><button data-a="exec">E<small>EXECUTE</small></button><button data-a="a1">1<small>BOLT</small></button><button data-a="a2">2<small>SHOCK</small></button><button data-a="a3">3<small>SURGE</small></button></div>`;
    $("#frame").appendChild(el);
    $("#cb-moves").innerHTML = MOVES_HTML;
    el.querySelectorAll("#ctouch button").forEach((b) => {
      const a = b.dataset.a, hold = b.dataset.hold, kk = b.dataset.k;
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); if (hold) T.guardHeld = true; else if (kk) T.kHeld = true; else T[a] = true; b.classList.add("on"); });
      const up = () => { if (hold) T.guardHeld = false; if (kk) T.kHeld = false; b.classList.remove("on"); };
      b.addEventListener("pointerup", up); b.addEventListener("pointerleave", up); b.addEventListener("pointercancel", up);
    });
  }
  function buildSlots(L) {
    $("#cb-slots").innerHTML = L.abilities.filter((a) => !["strike", "kick"].includes(a.id)).map((a) => `<div class="slot ${a.unlocked ? "" : "locked"}" data-id="${a.id}"><kbd>${a.key}</kbd><span>${a.name.toUpperCase()}</span>${a.unlocked ? (a.cost ? `<em>${a.cost}</em>` : "") : `<em class="lv">LV ${a.unlock}</em>`}<i class="cd"></i></div>`).join("");
  }
  function hud() {
    const pct = (v, m) => Math.max(0, Math.min(100, (v / m) * 100));
    $("#cb-hp").style.width = pct(C.hp, C.maxHp) + "%"; $("#cb-hpt").textContent = Math.ceil(C.hp) + " / " + C.maxHp;
    $("#cb-en").style.width = C.energy + "%"; $("#cb-mt").style.height = C.meter + "%"; $("#cb-left").textContent = C.enemies.filter((e) => e.state !== "dead").length + C.pending; $("#cb-wave").textContent = C.waves > 1 ? `WAVE ${C.wave + 1}/${C.waves}` : "HOSTILES";
    $("#cb-mt").parentElement.classList.toggle("full", C.meter >= 100);
    const cb = $("#cb-combo"); cb.classList.toggle("hidden", C.combo < 2); $("#cb-cn").textContent = "x" + C.combo;
    document.querySelectorAll("#cb-slots .slot").forEach((s) => {
      const a = C.L.abilities.find((x) => x.id === s.dataset.id), cd = Math.max(0, C.cd[a.id] || 0), cdMax = { bolt: 0.9, shock: 3, surge: 9 }[a.id] || 0;
      const lack = a.unlocked && ((a.cost && C.energy < a.cost) || (a.id === "nova" && C.meter < 100));
      s.classList.toggle("dim", lack); s.classList.toggle("ready", (a.unlocked && !lack && a.cost > 0) || (a.id === "nova" && C.meter >= 100)); s.querySelector(".cd").style.height = cdMax ? pct(cd, cdMax) + "%" : "0";
    });
  }
  function call(text, cls = "") {                     // big technique callout ("LAUNCHER!", "PERFECT PARRY")
    const el = $("#cb-call"); el.textContent = text; el.className = "show " + cls; clearTimeout(call.t); call.t = setTimeout(() => (el.className = "hidden"), 900);
  }
  const FQ = { q: [], busy: false };
  function showFact(f, big) {
    FQ.q.push({ ...f, big }); if (FQ.busy) return; FQ.busy = true;
    const next = () => {
      const x = FQ.q.shift(); const el = $("#fact"); if (!x) { FQ.busy = false; el.classList.add("hidden"); return; }
      el.innerHTML = `<div class="k">${x.big ? "KNOWLEDGE STRIKE" : "KNOWLEDGE SHARD"} <span>// ${UI.esc(x.concept.toUpperCase())}</span></div><p>${UI.esc(x.text)}</p>`; el.className = x.big ? "big" : ""; void el.offsetWidth; el.classList.add("pop");
      setTimeout(next, x.big ? 5200 : 4200);
    };
    next();
  }

  // ------------------------------------------------------------------ helpers
  function hitstop(scene, ms) { if (scene.frozen) return; scene.frozen = true; scene.tweens.pauseAll(); setTimeout(() => { scene.frozen = false; scene.tweens.resumeAll(); }, ms); }
  function slowmo(scene, f, ms) { scene.tscale = f; setTimeout(() => (scene.tscale = 1), ms); }
  const take = (k) => { const v = !!T[k]; T[k] = false; return v; };
  const just = (k) => Phaser.Input.Keyboard.JustDown(k);
  const alive = () => C.enemies.filter((e) => e.state !== "dead");
  const airborne = (scene) => scene.hy < GROUND - 30;
  const used = (id) => { if (!C.tech.has(id)) { C.tech.add(id); } };

  // ------------------------------------------------------------------ enemies
  const LOOK = { brute: "enforcer", caster: "overlord", dasher: "rival", guardian: "colossus" }, SCALE = { brute: 1.28, caster: 1.2, dasher: 1.18, guardian: 1.22 };
  function spawn(scene, spec, i, adapt) {
    const d = (adapt && adapt.difficulty) || 3, sc = (SCALE[spec.kind] || 1.25) * (spec.champion ? 1.22 : 1);
    const rig = People.make(scene, LOOK[spec.kind] || "enforcer", sc); rig.guard = true;
    const side = i % 2 ? -1 : 1, x = side > 0 ? C.AR + 120 + (i % 3) * 70 : C.AL - 120 - (i % 3) * 70;
    rig.root.setPosition(x, GROUND + 6).setDepth(10);
    const label = scene.add.text(0, -(170 * sc) - 26, spec.name, { fontFamily: '"Orbitron", sans-serif', fontSize: "12px", color: spec.champion ? "#ffd36a" : spec.kind === "guardian" ? "#ffb347" : "#ff8da1", stroke: "#000", strokeThickness: 4 }).setOrigin(0.5);
    const tip = scene.add.text(0, -(170 * sc) - 52, "", { fontFamily: '"Orbitron", sans-serif', fontSize: "14px", fontStyle: "900", color: "#ffd36a", stroke: "#000", strokeThickness: 5 }).setOrigin(0.5);
    const bar = scene.add.graphics(), ui = scene.add.container(x, GROUND + 6).setDepth(12); ui.add([label, bar, tip]);
    const base = { brute: 10, caster: 9, dasher: 13, guardian: 18 }[spec.kind] || 10, cidx = G.chapterIdx || 0;
    const e = { spec, kind: spec.kind, rig, sc, x, vx: 0, ay: 0, avy: 0, avx: 0, label, bar, tip, ui, state: "spawn", t: 0, cool: rnd(0.8, 1.8), tint: false, hit: false, hits: 0, hitT: 0, block: 0, broken: 0,
      speed: ({ caster: 120, guardian: 78 }[spec.kind] || 105) * (0.85 + 0.07 * d), dmg: base * (0.7 + 0.15 * d) * (1 + 0.05 * cidx),
      wind: spec.kind === "guardian" ? Math.max(0.6, 1.0 - 0.06 * d) : Math.max(0.32, 0.72 - 0.06 * d) };
    e.maxHp = e.hp = Math.round(({ caster: 55, guardian: 130 }[spec.kind] || 80) * (0.8 + 0.12 * d) * (1 + 0.1 * cidx) * (spec.champion ? 2.4 : 1));
    if (spec.champion) { e.dmg *= 1.25; e.wind *= 0.9; e.champion = true; rig.all.forEach((im) => im.setTint(0xffe2b0)); }
    return e;
  }
  function drawBar(e) {
    const w = e.champion ? 120 : 74, y = -(170 * e.sc) - 8 - e.ay;
    e.bar.clear().fillStyle(0x000000, 0.7).fillRect(-w / 2, y, w, 6).fillStyle(e.broken > 0 ? 0xffd36a : 0xff3b5c, 1).fillRect(-w / 2 + 1, y + 1, (w - 2) * Math.max(0, e.hp / e.maxHp), 4);
    if (e.kind === "guardian" && e.broken <= 0 && e.state !== "dead") e.bar.lineStyle(2, 0xffb347, 1).strokeRect(-w / 2 - 2, y - 2, w + 4, 10);
    e.label.y = -(170 * e.sc) - 26 - e.ay; e.tip.y = -(170 * e.sc) - 52 - e.ay;
  }
  function setTint(e, on, col = 0xff7070) { e.rig.all.forEach((i) => (on ? i.setTint(col) : e.champion ? i.setTint(0xffe2b0) : i.clearTint())); }
  const canExecute = (e) => e.state !== "dead" && e.hp <= e.maxHp * 0.35 && ["stagger", "down", "getup"].includes(e.state);
  const guarding = (e, scene) => e.state !== "dead" && e.broken <= 0 && ((e.kind === "guardian" && ["approach", "windup"].includes(e.state)) || e.block > 0) && (scene.hx - e.x) * (e.dir || Math.sign(scene.hx - e.x)) > 0;

  function launch(e, up, side) { if (e.state === "dead") return; if (e.state === "windup" || e.state === "strike") C.attackers = Math.max(0, C.attackers - 1); e.state = "air"; e.t = 0; e.avy = up; e.avx = side; setTint(e, false); e.rig.release(); e.rig.play("hurt"); }
  function knockDown(e) { if (e.state === "dead") return; if (e.state === "windup" || e.state === "strike") C.attackers = Math.max(0, C.attackers - 1); e.state = "down"; e.t = 0; e.ay = 0; e.avy = 0; setTint(e, false); e.rig.release(); e.rig.play("ko"); }

  function updateEnemy(scene, e, dt, time) {
    const hx = scene.hx, dx = hx - e.x, dir = dx >= 0 ? 1 : -1, dist = Math.abs(dx);
    e.t += dt; e.cool -= dt; e.vx = 0; if (e.block > 0) e.block -= dt; if (e.broken > 0) e.broken -= dt; e.hitT -= dt; if (e.hitT <= 0) e.hits = 0;
    if (!["dead", "air", "down"].includes(e.state)) { e.rig.root.setScale(dir * e.sc, e.sc); e.dir = dir; }
    if (e.state === "spawn") { e.vx = dir * e.speed * 1.5; e.x += e.vx * dt; if (e.x > C.AL && e.x < C.AR) e.state = "approach"; }
    else if (e.state === "approach") {
      const want = e.kind === "caster" ? 380 : e.kind === "dasher" ? 260 : 86 + 24 * e.sc;
      if (e.kind === "caster" && dist < 300) e.vx = -dir * e.speed; else if (dist > want) e.vx = dir * e.speed;
      e.x += e.vx * dt;
      const slots = C.hard ? 2 : 1;
      if (e.cool <= 0 && dist < (e.kind === "brute" || e.kind === "guardian" ? want + 30 : 560) && C.attackers < slots) {
        e.state = "windup"; e.t = 0; C.attackers++;
        if (e.kind === "dasher") e.rig.hold("dash"); if (e.kind === "caster") e.rig.glowPulse(1);
        if (e.kind === "guardian") { e.tip.setText("UNBLOCKABLE"); }
      }
    } else if (e.state === "windup") {
      const on = Math.floor(e.t * 14) % 2 === 0; if (on !== e.tint) { e.tint = on; setTint(e, on, e.kind === "guardian" ? 0xffb347 : 0xff7070); }
      if (e.t >= e.wind) {
        setTint(e, false); e.state = "strike"; e.t = 0; e.hit = false; e.tint = false; e.tip.setText("");
        if (e.kind === "brute") e.rig.play(pick(["jab", "cross", "kick", "hook"]), { hit: () => enemyStrike(scene, e, e.dmg, 100 + 30 * e.sc, false) });
        else if (e.kind === "guardian") e.rig.play("slam", { hit: () => { Fight.shockwave(scene, e.x + e.dir * 90, 0xffb347); enemyStrike(scene, e, e.dmg, 210, true); } });
        else if (e.kind === "caster") { e.rig.release(); e.rig.play("cast", { hit: () => { const o = e.rig.orbWorld(); projectile(scene, o.x, GROUND - 110, e.dir * 430, e.dmg, "enemy", hex(People.SPECS.overlord.glow)); } }); }
        else { e.rig.release(); Sound.whoosh(); }
      }
    } else if (e.state === "strike") {
      if (e.kind === "dasher") { e.x += e.dir * 760 * dt; if (!e.hit && Math.abs(scene.hx - e.x) < 70) { e.hit = true; enemyStrike(scene, e, e.dmg, 9999, false); } if (e.t > 0.38) endAttack(e, 0.9); }
      else if (e.t > ({ caster: 0.7, guardian: 0.95 }[e.kind] || 0.62)) endAttack(e, { caster: 1.6, guardian: 1.9 }[e.kind] || 1.1);
    } else if (e.state === "stagger") { if (e.t > e.stagger) { e.state = "approach"; e.cool = Math.max(e.cool, 0.4); e.tip.setText(""); } }
    else if (e.state === "air") {
      e.avy -= 2100 * dt; e.ay += e.avy * dt; e.x += e.avx * dt; e.avx *= 0.985; e.rig.root.setAngle(-e.dir * Math.min(70, e.ay * 0.25));
      if (e.thrown) for (const o of alive()) if (o !== e && !o.bumped && o.state !== "air" && Math.abs(o.x - e.x) < 70 && e.ay < 140) { o.bumped = true; damage(scene, o, 14, 120, true, 1, "throw"); knockDown(o); }
      if (e.ay <= 0 && e.t > 0.1) { e.ay = 0; e.thrown = false; C.enemies.forEach((o) => (o.bumped = false)); e.rig.root.setAngle(0); Fight.impact(scene, e.x, GROUND - 20, 0xffffff, 0.7); scene.cameras.main.shake(90, 0.005); if (e.hp > 0) knockDown(e); }
    } else if (e.state === "down") { if (e.t > 1.1) { e.state = "getup"; e.t = 0; e.rig.recover(); } }
    else if (e.state === "getup") { if (e.t > 0.35) { e.state = "approach"; e.cool = Math.max(e.cool, 0.5); } }
    else if (e.state === "dead") { e.rig.root.alpha = Math.max(0, 1 - Math.max(0, e.t - 0.9) * 1.4); if (e.t > 1.8) e.gone = true; }
    if (e.state !== "dead") {
      e.x = Phaser.Math.Clamp(e.x, C.AL - 260, C.AR + 260); e.rig.root.setPosition(e.x, GROUND + 6 - e.ay); e.ui.setPosition(e.x, GROUND + 6); drawBar(e);
      if (canExecute(e) && Math.abs(scene.hx - e.x) < 220) e.tip.setText("E  EXECUTE"); else if (e.tip.text === "E  EXECUTE") e.tip.setText("");
    }
    e.rig.update(dt, time, { vx: e.vx * dir, vy: 0, grounded: e.ay <= 0 });
  }
  function endAttack(e, cool) { if (e.state === "strike" || e.state === "windup") C.attackers = Math.max(0, C.attackers - 1); e.state = "approach"; e.cool = cool * rnd(0.8, 1.3); e.rig.release(); if (e.kind === "caster") e.rig.glowPulse(0); setTint(e, false); e.tip.setText(""); }

  function enemyStrike(scene, e, dmg, reach, unblockable) {
    const dx = (scene.hx - e.x) * (e.dir || 1);
    if (dx < -30 || dx > reach) return;
    if (e.kind === "guardian" && airborne(scene)) { scene.popup(scene.hx, GROUND - 260, "JUMPED", "#5eead4"); return; }   // jumping clears the shockwave
    hurtHero(scene, dmg, e.x, { melee: true, from: e, unblockable });
  }
  function hurtHero(scene, dmg, fromX, o = {}) {
    if (C.over) return;
    if (C.invuln > 0) { if (C.dodging) { scene.popup(scene.hx, GROUND - 230, "DODGE", "#5eead4"); C.energy = Math.min(100, C.energy + 8); } return; }
    const facing = (fromX - scene.hx) * scene.face > 0, fresh = C.t - C.guardAt < 0.2;
    if (o.melee && fresh && facing && !o.unblockable && o.from) {                    // perfect parry: no damage, attacker stunned
      const e = o.from; if (e.state === "strike" || e.state === "windup") C.attackers = Math.max(0, C.attackers - 1);
      e.state = "stagger"; e.t = 0; e.stagger = 1.4; e.rig.release(); e.rig.play("hurt"); e.tip.setText("PARRIED"); setTint(e, false);
      Fight.impact(scene, scene.hx + scene.face * 50, GROUND - 120, 0xffffff, 1.4); scene.cameras.main.flash(120, 200, 255, 200); slowmo(scene, 0.4, 450); Sound.click();
      C.energy = Math.min(100, C.energy + 25); used("parry"); call("PERFECT PARRY", "gold"); return;
    }
    if (C.guarding && facing && !o.unblockable) { scene.popup(scene.hx, GROUND - 230, "BLOCK", "#bef264"); Sound.click(); Fight.impact(scene, scene.hx + scene.face * 40, GROUND - 110, 0xbef264, 0.7); C.energy = Math.min(100, C.energy + 10); dmg *= 0.12; scene.tweens.add({ targets: scene, hx: scene.hx - scene.face * 14, duration: 90 }); }
    else { Fight.impact(scene, scene.hx, GROUND - 110, 0xff3b5c, 1.1); if (!C.busy) scene.hero.play("hurt"); scene.hero.flash(); Sound.hit(); UI.flash(); scene.cameras.main.shake(150, 0.008); hitstop(scene, 60); C.combo = 0; scene.tweens.add({ targets: scene, hx: scene.hx - Math.sign(fromX - scene.hx) * 26, duration: 110 }); }
    if (C.buff > 0) dmg *= 0.6;
    C.hp -= dmg; if (dmg >= 1) scene.popup(scene.hx + 24, GROUND - 250, "-" + Math.round(dmg), "#ff8da1");
    if (C.hp <= 0 && !C.over) { C.hp = 0; C.over = "lost"; }
  }

  // ------------------------------------------------------------------ projectiles
  function projectile(scene, x, y, vx, dmg, from, tint) {
    const img = scene.add.image(x, y, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(2.3).setDepth(16);
    C.proj.push({ x, y, vx, dmg, from, img, life: 3, trail: 0 }); Sound.cast();
  }
  function updateProj(scene, dt) {
    for (const p of C.proj) {
      p.x += p.vx * dt; p.life -= dt; p.trail -= dt; p.img.setPosition(p.x, p.y).setRotation(p.img.rotation + dt * 9);
      if (p.trail <= 0) { p.trail = 0.04; scene.burstTint = p.img.tintTopLeft; scene.burstE.explode(1, p.x, p.y); }
      if (p.from === "enemy") {
        if (Math.abs(p.x - scene.hx) < 36 && scene.hy > GROUND - 70) {
          const facing = (p.x - scene.hx) * scene.face > 0;
          if (C.t - C.guardAt < 0.25 && facing) { p.vx = -p.vx * 1.4; p.from = "hero"; p.dmg *= 2.5; p.img.setTint(HERO); used("parry"); call("REFLECTED", "gold"); Sound.click(); continue; }
          hurtHero(scene, p.dmg, p.x); p.life = 0;
        }
      } else for (const e of alive()) if (e.state !== "spawn" && Math.abs(p.x - e.x) < 44 + 12 * e.sc && e.ay < 160) { damage(scene, e, p.dmg, 60, true, 1.2, "power"); p.life = 0; break; }
      if (p.x < C.AL - 300 || p.x > C.AR + 300) p.life = 0;
    }
    C.proj = C.proj.filter((p) => (p.life > 0 ? true : (p.img.destroy(), false)));
  }

  // ------------------------------------------------------------------ hero damage dealing
  function damage(scene, e, dmg, knock, big, size = 1, kind = "") {
    if (e.state === "dead") return false;
    if (guarding(e, scene) && !["breaker", "throw", "sweep", "power", "execute", "dive", "slam"].includes(kind)) {
      e.hp -= dmg * 0.12; scene.popup(e.x, GROUND - 270 - e.ay, "GUARDED", "#ffb347"); Sound.click(); Fight.impact(scene, e.x - e.dir * 30, GROUND - 120, 0xffb347, 0.6);
      if (!C.hintGuard) { C.hintGuard = true; call(e.kind === "guardian" ? "HOLD K TO BREAK THE GUARD" : "TRY A THROW OR SWEEP", "hint"); } return false;
    }
    if (kind === "breaker" && (e.kind === "guardian" || e.block > 0)) { e.broken = 3; e.block = 0; call("GUARD BREAK", "gold"); used("breaker"); }
    const air = e.state === "air", down = e.state === "down";
    dmg *= C.L.mult.damage * (C.buff > 0 ? 1.6 : 1) * (1 + Math.min(0.5, C.combo * 0.04)) * (air ? 1.3 : 1) * (down ? 0.6 : 1);
    e.hp -= dmg; e.rig.flash(); if (!["strike", "air", "down"].includes(e.state)) e.rig.play("hurt");
    Fight.impact(scene, e.x, GROUND - 120 * e.sc - e.ay, HERO, big ? 1.3 * size : size); Sound.hit();
    scene.popup(e.x, GROUND - 270 - e.ay, String(Math.round(dmg)), big ? "#ffd36a" : "#e8ffe0");
    const dir = Math.sign(e.x - scene.hx) || 1;
    if (air) { e.avy = Math.max(e.avy, 380); e.avx = dir * 60; if (++C.air >= 2) { used("juggle"); if (C.air === 2) call("AIR COMBO", "gold"); } }
    else if (!down) { e.x += dir * knock * 0.35; scene.tweens.add({ targets: e, x: e.x + dir * knock, duration: 140, ease: "Cubic.out" }); }
    if (big) { scene.cameras.main.shake(130, 0.007); hitstop(scene, 70); } else hitstop(scene, 35);
    if (!air && !down && (e.state === "windup" || (big && e.state !== "strike"))) { if (e.state === "windup") C.attackers = Math.max(0, C.attackers - 1); e.state = "stagger"; e.t = 0; e.stagger = big ? 0.6 : 0.32; setTint(e, false); e.rig.release(); e.tip.setText(""); }
    e.hits++; e.hitT = 1.5; if (e.kind === "brute" && e.hits >= 3 && e.state === "approach" && Math.random() < 0.5) { e.block = 0.9; e.tip.setText("BLOCKING"); setTimeout(() => e.tip && e.tip.text === "BLOCKING" && e.tip.setText(""), 900); }
    C.combo++; C.comboT = 2.2; C.maxCombo = Math.max(C.maxCombo, C.combo); C.energy = Math.min(100, C.energy + 3.5); C.meter = Math.min(100, C.meter + 1.2);
    if (e.hp <= 0) kill(scene, e, kind === "execute");
    return true;
  }
  function kill(scene, e, executed) {
    if (e.state === "windup" || e.state === "strike") C.attackers = Math.max(0, C.attackers - 1);
    e.state = "dead"; e.t = 0; setTint(e, false); e.bar.clear(); e.label.setVisible(false); e.tip.setVisible(false); e.rig.release(); e.rig.glowPulse(0); e.rig.root.setAngle(0); e.ay = 0;
    e.rig.root.setPosition(e.x, GROUND + 6); e.rig.play("ko"); Fight.impact(scene, e.x, GROUND - 130 * e.sc, 0xffffff, executed ? 2.4 : 1.6); scene.cameras.main.shake(executed ? 380 : 220, executed ? 0.02 : 0.012); hitstop(scene, executed ? 160 : 110);
    C.kills++; C.attackers = alive().filter((x) => x.state === "windup" || x.state === "strike").length;
    const orb = scene.add.container(e.x, GROUND - 120).setDepth(15); orb.add([scene.add.image(0, 0, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(executed ? 0xffd36a : 0x5eead4).setScale(executed ? 3 : 2.2), scene.add.image(0, 0, "gem").setScale(0.45)]);
    scene.tweens.add({ targets: orb, y: orb.y - 60, duration: 500, ease: "Cubic.out" });
    C.orbs.push({ o: orb, f: e.spec.fact, t: 0, big: executed });
    if (C.L.equipped.includes("siphon")) { C.hp = Math.min(C.maxHp, C.hp + 12); scene.popup(scene.hx, GROUND - 280, "+12", "#bef264"); }
  }
  function updateOrbs(scene, dt) {
    for (const o of C.orbs) {
      o.t += dt; if (o.t > 0.6) { const dx = scene.hx - o.o.x, dy = (scene.hy - 100) - o.o.y, k = Math.min(1, dt * 7); o.o.x += dx * k; o.o.y += dy * k; }
      if (o.t > 0.7 && Math.abs(o.o.x - scene.hx) < 46 && Math.abs(o.o.y - (scene.hy - 100)) < 70) {
        o.done = true; o.o.destroy(); Sound.collect(); Fight.impact(scene, scene.hx, scene.hy - 110, 0x5eead4, 0.8);
        const gain = Math.max(1, Math.round((1 + Math.random()) * C.L.mult.shards * (o.big ? 2 : 1))); C.shards += gain; C.learned.push(o.f);
        C.meter = Math.min(100, C.meter + (o.big ? 34 : 22)); C.energy = Math.min(100, C.energy + 18); scene.popup(scene.hx, GROUND - 270, "+" + gain + " SHARD", "#5eead4"); showFact(o.f, o.big);
      }
    }
    C.orbs = C.orbs.filter((o) => !o.done);
  }

  // ------------------------------------------------------------------ hero techniques
  function strikeArea(scene, reach, fn, height = 150) {
    let n = 0; const hh = GROUND - scene.hy;
    for (const e of alive()) { const dx = (e.x - scene.hx) * scene.face; if (e.state !== "spawn" && dx > -26 && dx < reach + 28 * e.sc && Math.abs(hh - e.ay) < height) { if (fn(e) !== false) n++; } }
    return n;
  }
  function busy(scene, sec) { C.busy = true; C.busyUntil = C.t + sec; }
  function melee(scene, name, dmg, reach, knock, big, kind = "", after) {
    busy(scene, 1); Sound.whoosh();
    if (!airborne(scene)) scene.tweens.add({ targets: scene, hx: scene.hx + scene.face * 34, duration: 110, ease: "Cubic.out" });
    scene.hero.play(name, { hit: () => { const n = strikeArea(scene, reach, (e) => { const ok = damage(scene, e, dmg, knock, big, 1, kind); if (ok && after) after(e); return ok; }); if (!n) C.combo = Math.max(0, C.combo - 1); } }).then(() => { C.busy = false; });
  }
  function strike(scene) {
    if (airborne(scene)) { scene.hero.hold("air"); melee(scene, C.airChain++ % 2 ? "kick" : "cross", 11, 130, 0, false, "air"); return; }
    const n = C.chain % 4; C.chain++; C.chainT = 0.9;
    if (n === 3) { melee(scene, "uppercut", 16, 125, 0, true, "chain", (e) => { if (e.kind !== "guardian" || e.broken > 0) launch(e, 760, scene.face * 40); }); used("chain"); used("launcher"); call("LAUNCHER", "gold"); }
    else melee(scene, ["jab", "cross", "hook"][n], [8, 10, 12][n], 120, [10, 14, 22][n], false);
  }
  function kickTap(scene) {
    if (airborne(scene)) return diveKick(scene);
    const big = C.chain >= 2; melee(scene, big ? "spinkick" : "kick", big ? 26 : 15, 150, big ? 140 : 60, true); C.chain = 0;
  }
  function breaker(scene) {
    C.chain = 0; scene.hero.glowPulse(0); busy(scene, 1.1); Sound.boss();
    scene.tweens.add({ targets: scene, hx: scene.hx + scene.face * 50, duration: 120 });
    scene.hero.play("spinkick", { hit: () => { strikeArea(scene, 170, (e) => { const ok = damage(scene, e, 34, 210, true, 1.4, "breaker"); if (ok && e.state !== "dead") { e.state = "stagger"; e.t = 0; e.stagger = 1.0; } return ok; }); scene.cameras.main.shake(200, 0.012); } }).then(() => { C.busy = false; });
    if (!C.tech.has("breaker")) used("breaker");
  }
  function launcher(scene) {
    if ((C.cd.launch || 0) > 0 || airborne(scene)) return; C.cd.launch = 0.6; used("launcher");
    melee(scene, "uppercut", 14, 130, 0, true, "launch", (e) => { if (e.kind === "guardian" && e.broken <= 0) return; launch(e, 780, scene.face * 30); call("LAUNCHER", "gold"); });
    setTimeout(() => { if (C && !C.over) { scene.vy = -760; scene.onGround = false; } }, 160);          // follow them up for the juggle
  }
  function diveKick(scene) {
    if (C.diving) return; C.diving = true; C.hitSet = new Set(); busy(scene, 1.2); Sound.whoosh(); scene.hero.hold("dive"); scene.vy = 980; scene.vx = scene.face * 560; used("dive");
  }
  function groundSlam(scene) {
    if (C.slamming) return; C.slamming = true; busy(scene, 1.4); Sound.whoosh(); scene.vy = 1500; scene.vx = 0; scene.hero.hold("air");
  }
  function landed(scene) {
    if (C.diving) { C.diving = false; scene.hero.release(); C.busy = false; scene.vx *= 0.3; }
    if (C.slamming) {
      C.slamming = false; scene.hero.release(); used("slam"); call("GROUND SLAM", "gold");
      scene.hero.play("slam", { hit: () => { Fight.shockwave(scene, scene.hx, HERO); for (const e of alive()) if (Math.abs(e.x - scene.hx) < 230 && e.state !== "spawn" && e.ay < 120) { if (damage(scene, e, 16, 120, true, 1.1, "slam")) knockDown(e); } } }).then(() => { C.busy = false; });
    }
    C.air = 0; C.airChain = 0;
  }
  function sweep(scene) {
    if ((C.cd.sweep || 0) > 0) return; C.cd.sweep = 0.7; used("sweep");
    melee(scene, "sweep", 12, 165, 0, true, "sweep", (e) => { if (e.ay < 30) knockDown(e); });
    call("SWEEP");
  }
  function grab(scene) {
    if ((C.cd.grab || 0) > 0 || airborne(scene)) return; C.cd.grab = 0.9;
    let t = null, best = 1e9;
    for (const e of alive()) { const dx = (e.x - scene.hx) * scene.face; if (dx > -10 && dx < 140 && e.ay < 30 && !["spawn", "down", "air"].includes(e.state) && dx < best) { best = dx; t = e; } }
    if (!t) { scene.popup(scene.hx, GROUND - 250, "NO ONE TO GRAB", "#ffd36a"); return; }
    busy(scene, 1.2); used("throw"); if (t.state === "windup" || t.state === "strike") C.attackers = Math.max(0, C.attackers - 1); t.state = "stagger"; t.t = 0; t.stagger = 2; setTint(t, false); t.rig.release();
    scene.hero.play("knee", { hit: () => damage(scene, t, 8, 0, false, 1, "throw") }).then(() => scene.hero.play("palm", { hit: () => {
      if (t.state === "dead") return; call("THROW", "gold"); damage(scene, t, 14, 0, true, 1.2, "throw"); if (t.state !== "dead") { launch(t, 520, scene.face * 620); t.thrown = true; }
    } })).then(() => { C.busy = false; });
  }
  function dashStrike(scene) {
    used("dash"); call("DASH STRIKE"); C.dodging = false; scene.hero.release(); busy(scene, 0.8); C.invuln = 0.3;
    const hitSet = new Set(), x0 = scene.hx;
    scene.tweens.add({ targets: scene, hx: Phaser.Math.Clamp(scene.hx + scene.face * 280, C.AL + 40, C.AR - 40), duration: 220, ease: "Cubic.out", onUpdate: () => {
      for (const e of alive()) if (!hitSet.has(e) && Math.abs(e.x - scene.hx) < 70 && e.ay < 60 && Math.sign(e.x - x0) === scene.face) { hitSet.add(e); damage(scene, e, 16, 80, true, 1.1, "dash"); }
    } });
    scene.hero.play("elbow", {}).then(() => { C.busy = false; });
  }
  function execute(scene) {
    let t = null, best = 1e9; for (const e of alive()) { const d = Math.abs(e.x - scene.hx); if (canExecute(e) && d < 220 && d < best) { best = d; t = e; } }
    if (!t) return false;
    busy(scene, 2.2); used("execute"); C.invuln = 2.2; slowmo(scene, 0.45, 1300); Sound.cast(); scene.hero.glowPulse(1.3); call("EXECUTION", "gold");
    t.state = "stagger"; t.t = 0; t.stagger = 9; t.tip.setText("");
    scene.face = t.x > scene.hx ? 1 : -1;
    scene.tweens.add({ targets: scene, hx: t.x - scene.face * 90, duration: 160, ease: "Cubic.out" });
    scene.hero.play("uppercut", { hit: () => { Fight.impact(scene, t.x, GROUND - 140, HERO, 1.6); t.rig.play("hurt"); t.ay = 0; scene.tweens.add({ targets: t, ay: 170, duration: 360, ease: "Cubic.out" }); } })
      .then(() => scene.hero.play("spinkick", { hit: () => { Fight.impact(scene, t.x, GROUND - 260, HERO, 1.8); scene.cameras.main.shake(260, 0.014); } }))
      .then(() => { let beam = Promise.resolve(); return scene.hero.play("cast", { hit: () => { const o = scene.hero.orbWorld(); beam = scene.shoot(o.x, o.y, t.x, GROUND - 120 * t.sc - t.ay, HERO, 2.6, 260); } }).then(() => beam); })
      .then(() => { t.ay = 0; t.state = "approach"; damage(scene, t, 9999, 0, true, 2, "execute"); scene.hero.glowPulse(0); C.busy = false; });
    return true;
  }
  function power(scene, id) {
    const A = C.L.abilities.find((a) => a.id === id); if (!A || !A.unlocked || (C.cd[id] || 0) > 0) { if (A && !A.unlocked) scene.popup(scene.hx, GROUND - 250, "UNLOCKS AT LV " + A.unlock, "#ffd36a"); return; }
    if (A.cost && C.energy < A.cost) { scene.popup(scene.hx, GROUND - 250, "NEED ENERGY", "#ffd36a"); C.cd[id] = 0.3; return; }
    used("power");
    if (id === "bolt") { C.energy -= A.cost; C.cd.bolt = 0.9; busy(scene, 1); scene.hero.glowPulse(1); scene.hero.play("cast", { hit: () => { const o = scene.hero.orbWorld(); projectile(scene, o.x, o.y, scene.face * 760, 30, "hero", HERO); } }).then(() => { C.busy = false; scene.hero.glowPulse(0); }); }
    else if (id === "shock") { C.energy -= A.cost; C.cd.shock = 3; busy(scene, 1.2); Sound.boss(); scene.hero.play("slam", { hit: () => { Fight.shockwave(scene, scene.hx + scene.face * 50, HERO); for (const e of alive()) if (Math.abs(e.x - scene.hx) < 360 && e.state !== "spawn") { if (damage(scene, e, 20, 150, true, 1.1, "power") && e.state !== "dead" && e.state !== "air") { e.state = "stagger"; e.t = 0; e.stagger = 1.5; } } } }).then(() => { C.busy = false; }); }
    else if (id === "surge") { C.energy -= A.cost; C.cd.surge = 9; C.buff = 6; busy(scene, 1); scene.hero.glowPulse(1.4); Sound.cast(); call("OVERCHARGE", "gold"); scene.hero.play("charge").then(() => { C.busy = false; }); }
    else if (id === "nova") {
      if (C.meter < 100) { scene.popup(scene.hx, GROUND - 250, "METER NOT FULL", "#ffd36a"); C.cd.nova = 0.3; return; }
      C.meter = 0; busy(scene, 1.5); Sound.boss(); scene.cameras.main.flash(420, 255, 255, 255); scene.cameras.main.shake(500, 0.02); scene.hero.glowPulse(1.6); call("KNOWLEDGE NOVA", "gold");
      scene.hero.play("charge").then(() => { scene.hero.glowPulse(0); C.busy = false; });
      setTimeout(() => C && alive().forEach((e) => damage(scene, e, 9999, 200, true, 2, "power")), 380);
    }
  }
  function dodge(scene) {
    if ((C.cd.dodge || 0) > 0 || C.busy) return; C.cd.dodge = 0.7; C.dodging = true; C.dodgeAt = C.t; C.invuln = 0.28; C.dodgeDir = scene.face; Sound.whoosh(); scene.hero.hold("dash");
    setTimeout(() => { if (C && C.dodging) { C.dodging = false; scene.hero.release(); } }, 240);
  }

  // ------------------------------------------------------------------ per-frame step (called by the world scene)
  function step(scene, dt, time) {
    if (!C || C.paused) return;
    C.t += dt; for (const k in C.cd) C.cd[k] -= dt; if (C.invuln > 0) C.invuln -= dt; if (C.buff > 0) { C.buff -= dt; if (C.buff <= 0) scene.hero.glowPulse(0); }
    if (C.comboT > 0) { C.comboT -= dt; if (C.comboT <= 0) C.combo = 0; } if (C.chainT > 0) { C.chainT -= dt; if (C.chainT <= 0) C.chain = 0; }
    if (C.busy && C.t > C.busyUntil) C.busy = false;
    C.energy = Math.min(100, C.energy + 5 * C.L.mult.energy * dt);
    const k = keys, h = scene.hero;
    if (just(k.H)) { C.showMoves = !C.showMoves; $("#cb-moves").classList.toggle("off", !C.showMoves); }
    if (!C.over) {
      const ax = (k.D.isDown || k.RIGHT.isDown || V.right ? 1 : 0) - (k.A.isDown || k.LEFT.isDown || V.left ? 1 : 0);
      const sDown = k.S.isDown || k.DOWN.isDown || !!T.guardHeld;
      if (sDown && !C.sWas) C.guardAt = C.t; C.sWas = sDown;
      const kDown = k.K.isDown || !!T.kHeld;
      let kTap = false, kCharged = false;
      if (kDown && !C.kWas) { C.kAt = C.t; C.chargeShown = false; }
      if (kDown && C.kAt != null && C.t - C.kAt > 0.42 && !C.chargeShown && !airborne(scene)) { C.chargeShown = true; h.glowPulse(1.2); scene.popup(scene.hx, GROUND - 260, "CHARGED", "#ffd36a"); }
      if ((!kDown && C.kWas && C.kAt != null) || (kDown && C.kAt != null && C.t - C.kAt > 1.1)) { if (C.t - C.kAt > 0.42 && !airborne(scene)) kCharged = true; else kTap = true; C.kAt = null; }
      C.kWas = kDown;
      C.guarding = !C.busy && !C.dodging && scene.onGround && sDown;
      const J = just(k.J) | take("strike"), U = just(k.U) | take("launch"), Lk = just(k.L) | take("grab"), E = just(k.E) | take("exec");
      const P1 = just(k.ONE) | take("a1"), P2 = just(k.TWO) | take("a2"), P3 = just(k.THREE) | take("a3"), P4 = just(k.FOUR) | take("a4"), SH = just(k.SHIFT) | take("dodge");
      if (C.dodging && J && C.t - C.dodgeAt < 0.35) dashStrike(scene);
      else if (!C.busy && !C.dodging) {
        if (E && execute(scene)) { /* finisher */ }
        else if (J && sDown && scene.onGround) sweep(scene);
        else if (J) strike(scene);
        else if (kCharged) breaker(scene);
        else if (kTap && airborne(scene) && sDown) groundSlam(scene);
        else if (kTap) kickTap(scene);
        else if (U) launcher(scene);
        else if (Lk) grab(scene);
        else if (P1) power(scene, "bolt"); else if (P2) power(scene, "shock"); else if (P3) power(scene, "surge"); else if (P4) power(scene, "nova");
        else if (SH) dodge(scene);
      } else if (kCharged || kTap) h.glowPulse(0);
      if (C.diving) for (const e of alive()) if (!C.hitSet.has(e) && Math.abs(e.x - scene.hx) < 80 && e.ay < 150) { C.hitSet.add(e); if (damage(scene, e, 18, 90, true, 1.1, "dive")) knockDown(e); }
      if ((just(k.SPACE) | just(k.W) | just(k.UP) | V.jump) && scene.onGround && !C.busy) { scene.vy = -820; scene.onGround = false; Sound.jump(); } V.jump = false;
      if (C.dodging) scene.vx = C.dodgeDir * 640;
      else if (C.diving || C.slamming) { /* momentum set by the move */ }
      else if (!C.busy) { const sp = C.guarding ? 70 : 300; scene.vx += (ax * sp - scene.vx) * Math.min(1, dt * 11); if (ax) scene.face = ax; else { const n = nearest(scene); if (n) scene.face = n.x > scene.hx ? 1 : -1; } }
      else scene.vx *= 0.88;
      h.guard = true;
    } else scene.vx *= 0.8;
    scene.vy += 2300 * dt; scene.hy += scene.vy * dt;
    if (scene.hy >= GROUND) { const was = !scene.onGround; scene.hy = GROUND; scene.vy = 0; scene.onGround = true; if (was) landed(scene); }
    scene.hx = Phaser.Math.Clamp(scene.hx + scene.vx * dt, C.AL + 40, C.AR - 40);
    for (const e of C.enemies) updateEnemy(scene, e, dt, time); C.enemies = C.enemies.filter((e) => !(e.gone && (e.rig.root.destroy(), e.ui.destroy(), true)));
    if (C.pending > 0) {
      const nx = C.queue[0], live = alive().length;
      if ((nx.wave || 0) > C.wave) {
        if (live === 0 && C.orbs.length === 0) { C.wave = nx.wave; C.spawnT = 2.4; C.hp = Math.min(C.maxHp, C.hp + C.maxHp * 0.2); C.energy = Math.min(100, C.energy + 30); call(C.queue.some((q) => q.champion && q.wave === C.wave) ? `FINAL WAVE ${C.wave + 1}/${C.waves}` : `WAVE ${C.wave + 1}/${C.waves}`, "gold"); Sound.boss(); }
      } else if (live < C.maxActive) { C.spawnT -= dt; if (C.spawnT <= 0) { C.pending--; C.spawnT = nx.champion ? 0.5 : 1.5; const e = spawn(scene, C.queue.shift(), C.spawned++, C.adapt); C.enemies.push(e); if (e.champion) { call("CHAMPION: " + e.spec.name, "gold"); scene.cameras.main.shake(260, 0.006); } } }
    }
    updateProj(scene, dt); updateOrbs(scene, dt); hud();
    if (!C.over && C.pending === 0 && alive().length === 0 && C.orbs.length === 0) { C.over = "won"; }
    if (C.over && !C.resolved) { C.resolved = true; setTimeout(() => C && C.resolve(C.over), C.over === "won" ? 900 : 1200); if (C.over === "lost") { Sound.wrong(); h.play("ko"); } else { Sound.win(); h.play("victory"); } }
  }
  function nearest(scene) { let b = null, d = 1e9; for (const e of alive()) { const x = Math.abs(e.x - scene.hx); if (x < d) { d = x; b = e; } } return b; }

  // ------------------------------------------------------------------ one fight
  function grade() {
    const hp = C.hp / C.maxHp, variety = C.tech.size, time = C.t;
    const pts = hp * 40 + Math.min(variety, 8) * 6 + Math.min(C.maxCombo, 15) + (time < 40 ? 10 : time < 70 ? 5 : 0);
    return pts >= 80 ? "S" : pts >= 62 ? "A" : pts >= 44 ? "B" : "C";
  }
  function fightOnce(scene, ent, enc, L, adapt) {
    return new Promise((resolve) => {
      const cx = ent.x, d = (adapt && adapt.difficulty) || 3;
      C = { L, adapt, AL: cx - 560, AR: cx + 560, enemies: [], proj: [], orbs: [], cd: {}, t: 0, busy: false, busyUntil: 0, chain: 0, chainT: 0, combo: 0, comboT: 0, maxCombo: 0, energy: 60, meter: G.meter || 0, buff: 0, invuln: 0,
        guarding: false, dodging: false, attackers: 0, hard: d >= 3, guardAt: -9, dodgeAt: -9, kAt: null, kWas: false, sWas: false, air: 0, airChain: 0, tech: new Set(), showMoves: (G.fights || 0) < 3,
        maxHp: Math.round(100 * L.mult.health), kills: 0, shards: 0, learned: [], over: null, resolved: false, queue: enc.enemies.slice(), pending: enc.enemies.length, spawned: 0, spawnT: 0.4, wave: 0, waves: enc.waves || 1, maxActive: d <= 2 ? 2 : 3, resolve };
      C.hp = C.maxHp;
      scene.combat = Combat; scene.fighting = true; scene.fightMid = cx; scene.hero.guard = true; scene.hx = Math.min(scene.hx, cx - 200);
      $("#cb-lv").textContent = "LV " + L.level; $("#cb-name").textContent = (G.name || "RANGER").toUpperCase(); buildSlots(L); $("#cb").classList.remove("hidden");
      $("#cb-moves").classList.toggle("off", !C.showMoves); UI.hideHud && UI.hideHud(); if (matchMedia("(pointer: coarse)").matches) UI.touch(true);
    });
  }
  function stopFight(scene) {
    $("#cb").classList.add("hidden"); FQ.q = []; $("#fact").classList.add("hidden"); scene.combat = null; scene.fighting = false; scene.fightMid = null; scene.tscale = 1;
    scene.hero.guard = false; scene.hero.release(); scene.hero.recover(); scene.hy = GROUND; scene.vy = 0; scene.vx = 0; scene.onGround = true; scene.hero.glowPulse(0);
    for (const e of C.enemies) { e.rig.root.destroy(); e.ui.destroy(); } for (const p of C.proj) p.img.destroy(); for (const o of C.orbs) o.o.destroy();
    G.meter = C.meter; G.fights = (G.fights || 0) + 1;
    const out = { shards: C.shards, kills: C.kills, learned: C.learned, grade: C.over === "won" ? grade() : null, techniques: [...C.tech].map((t) => TECH[t]), maxCombo: C.maxCombo }; C = null; return out;
  }

  async function run(scene, ent, enc, L, adapt) {
    build(); keys = scene.combatKeys || (scene.combatKeys = scene.input.keyboard.addKeys("J,K,L,U,H,S,DOWN,ONE,TWO,THREE,FOUR"));
    Object.assign(keys, { D: scene.k.D, A: scene.k.A, W: scene.k.W, UP: scene.k.UP, LEFT: scene.k.LEFT, RIGHT: scene.k.RIGHT, SPACE: scene.k.SPACE, SHIFT: scene.k.SHIFT, E: scene.k.E });
    let defeats = 0;
    for (;;) {
      const res = await fightOnce(scene, ent, enc, L, adapt); const out = stopFight(scene);
      if (res === "won") return { won: true, ...out };
      defeats++;
      const html = `<div class="kicker">Defeated</div><h1>Overwhelmed</h1><p>${defeats >= 2 ? "Hard fight. You can try again or skip it; skipping earns no shards." : "Tip: tap S just as a hit lands to parry, throw guarded enemies with L, and hold K to break a shield. Kills drop shards that refill your energy."}</p>`;
      const idx = await UI.choice(html, defeats >= 2 ? ["Skip fight", "Fight again"] : ["Fight again"]);
      if (defeats >= 2 && idx === 0) return { won: false, skipped: true, shards: 0, kills: 0, learned: [], techniques: [] };
      scene.hero.recover(); scene.hx = ent.x - 300;
    }
  }
  return { plan, run, step, state: () => C, TECH };
})();
