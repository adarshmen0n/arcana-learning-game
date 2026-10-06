// Real-time arena combat. The student fights with buttons (strike, kick, guard, dodge, powers) against enemies that each carry a
// "knowledge shard": a fact taken from the student's own uploaded material. Bosses, missions and trials stay question-based.
const Combat = (() => {
  const GROUND = Art.GROUND;
  const hex = (s) => Phaser.Display.Color.HexStringToColor(s).color, rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const HERO = hex(People.NEON);
  const T = {}; // touch buttons: edge flags + held guard
  let C = null, keys = null, built = false;

  // ------------------------------------------------------------------ plan: turn a chapter's own content into an encounter
  const clip = (t, n = 150) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, t.lastIndexOf(" ", n - 1)).replace(/[,;:]$/, "") + "..." : t; };
  function plan(ch, index, adapt) {
    const names = {}; (ch.concepts || []).forEach((c) => (names[c.id] = c.name));
    const facts = [];
    for (const s of ch.scenes) {
      for (const q of s.question ? [s.question] : s.questions || []) if (q.explanation) facts.push({ concept: names[q.conceptId] || "Key idea", text: clip(q.explanation) });
      if (s.type === "npc") for (const l of s.dialogue || []) facts.push({ concept: (l.highlight && l.highlight[0]) || s.npc.name, text: clip(l.text) });
    }
    const seen = new Set(), uniq = facts.filter((f) => !seen.has(f.text) && seen.add(f.text));
    for (let i = uniq.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uniq[i], uniq[j]] = [uniq[j], uniq[i]]; }
    const d = (adapt && adapt.difficulty) || 3, n = Math.max(2, (index === 0 ? 2 : 3) + (d >= 4 ? 1 : 0) - (d <= 2 ? 1 : 0));
    const kinds = index === 0 && (G.chapterIdx || 0) < 1 ? ["brute", "brute", "brute", "brute"] : ["brute", "caster", "brute", "dasher", "caster"];
    const suffix = ["Thrall", "Wraith", "Sentinel", "Shade", "Revenant"];
    const enemies = Array.from({ length: n }, (_, i) => {
      const f = uniq[i % Math.max(1, uniq.length)] || { concept: "Knowledge", text: "Keep learning: every fact you collect makes the next fight easier." };
      return { kind: kinds[i % kinds.length], name: (f.concept.split(" ").slice(0, 2).join(" ") + " " + suffix[(i + index) % suffix.length]).toUpperCase(), fact: f };
    });
    return { title: index === 0 ? "Ambush" : "Elite ambush", enemies };
  }

  // ------------------------------------------------------------------ HUD
  const $ = (s) => document.querySelector(s);
  function build() {
    if (built) return; built = true;
    const el = document.createElement("div"); el.id = "cb"; el.className = "hidden";
    el.innerHTML = `<div class="cb-hero"><div class="cb-tag"><b id="cb-lv">LV 1</b><span id="cb-name">RANGER</span></div><div class="cb-bar hp"><i id="cb-hp"></i><b id="cb-hpt"></b></div><div class="cb-bar en"><i id="cb-en"></i></div></div>
      <div class="cb-foes"><span>HOSTILES</span><b id="cb-left">0</b></div>
      <div class="cb-combo hidden" id="cb-combo"><b id="cb-cn">x1</b><span>COMBO</span></div>
      <div class="cb-meter"><i id="cb-mt"></i><span>KNOWLEDGE</span></div>
      <div class="cb-slots" id="cb-slots"></div><div id="fact" class="hidden"></div>
      <div id="ctouch"><button data-a="strike">J<small>STRIKE</small></button><button data-a="kick">K<small>KICK</small></button><button data-a="guard" data-hold="1">S<small>GUARD</small></button><button data-a="dodge">&#8679;<small>DODGE</small></button><button data-a="a1">1</button><button data-a="a2">2</button><button data-a="a3">3</button></div>`;
    $("#frame").appendChild(el);
    el.querySelectorAll("#ctouch button").forEach((b) => {
      const a = b.dataset.a, hold = b.dataset.hold;
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); if (hold) T.guardHeld = true; else T[a] = true; b.classList.add("on"); });
      const up = () => { if (hold) T.guardHeld = false; b.classList.remove("on"); };
      b.addEventListener("pointerup", up); b.addEventListener("pointerleave", up); b.addEventListener("pointercancel", up);
    });
  }
  function buildSlots(L) {
    $("#cb-slots").innerHTML = L.abilities.map((a) => `<div class="slot ${a.unlocked ? "" : "locked"}" data-id="${a.id}"><kbd>${a.key}</kbd><span>${a.name.toUpperCase()}</span>${a.unlocked ? (a.cost ? `<em>${a.cost}</em>` : "") : `<em class="lv">LV ${a.unlock}</em>`}<i class="cd"></i></div>`).join("");
  }
  function hud() {
    const pct = (v, m) => Math.max(0, Math.min(100, (v / m) * 100));
    $("#cb-hp").style.width = pct(C.hp, C.maxHp) + "%"; $("#cb-hpt").textContent = Math.ceil(C.hp) + " / " + C.maxHp;
    $("#cb-en").style.width = C.energy + "%"; $("#cb-mt").style.height = C.meter + "%"; $("#cb-left").textContent = C.enemies.filter((e) => e.state !== "dead").length + C.pending;
    $("#cb-mt").parentElement.classList.toggle("full", C.meter >= 100);
    const cb = $("#cb-combo"); cb.classList.toggle("hidden", C.combo < 2); $("#cb-cn").textContent = "x" + C.combo;
    document.querySelectorAll("#cb-slots .slot").forEach((s) => {
      const a = C.L.abilities.find((x) => x.id === s.dataset.id), cd = Math.max(0, C.cd[a.id] || 0), cdMax = { strike: 0, kick: 0, bolt: 0.9, shock: 3, surge: 9, nova: 0 }[a.id] || 0;
      const lack = a.unlocked && ((a.cost && C.energy < a.cost) || (a.id === "nova" && C.meter < 100));
      s.classList.toggle("dim", lack); s.classList.toggle("ready", a.unlocked && !lack && a.cost > 0 || (a.id === "nova" && C.meter >= 100)); s.querySelector(".cd").style.height = cdMax ? pct(cd, cdMax) + "%" : "0";
    });
  }
  const FQ = { q: [], busy: false };
  function showFact(f) {
    FQ.q.push(f); if (FQ.busy) return; FQ.busy = true;
    const next = () => {
      const x = FQ.q.shift(); const el = $("#fact"); if (!x) { FQ.busy = false; el.classList.add("hidden"); return; }
      el.innerHTML = `<div class="k">KNOWLEDGE SHARD <span>// ${UI.esc(x.concept.toUpperCase())}</span></div><p>${UI.esc(x.text)}</p>`; el.classList.remove("hidden"); el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
      setTimeout(next, 4200);
    };
    next();
  }

  // ------------------------------------------------------------------ helpers
  function hitstop(scene, ms) { if (scene.frozen) return; scene.frozen = true; scene.tweens.pauseAll(); setTimeout(() => { scene.frozen = false; scene.tweens.resumeAll(); }, ms); }
  const take = (k) => { const v = !!T[k]; T[k] = false; return v; };
  const just = (k) => Phaser.Input.Keyboard.JustDown(k);
  const alive = () => C.enemies.filter((e) => e.state !== "dead");

  // ------------------------------------------------------------------ enemies
  function spawn(scene, spec, i, adapt) {
    const d = (adapt && adapt.difficulty) || 3, sc = spec.kind === "caster" ? 1.2 : spec.kind === "dasher" ? 1.18 : 1.28;
    const look = spec.kind === "caster" ? "overlord" : spec.kind === "dasher" ? "rival" : "enforcer";
    const rig = People.make(scene, look, sc); rig.guard = true;
    const side = i % 2 ? -1 : 1, x = side > 0 ? C.AR + 120 + i * 60 : C.AL - 120 - i * 60;
    rig.root.setPosition(x, GROUND + 6).setDepth(10);
    const label = scene.add.text(0, -(170 * sc) - 26, spec.name, { fontFamily: '"Orbitron", sans-serif', fontSize: "12px", color: "#ff8da1", stroke: "#000", strokeThickness: 4 }).setOrigin(0.5);
    const bar = scene.add.graphics(), ui = scene.add.container(x, GROUND + 6).setDepth(12); ui.add([label, bar]);
    const e = { spec, kind: spec.kind, rig, sc, x, vx: 0, label, bar, ui, state: "spawn", t: 0, cool: rnd(0.8, 1.8), hp: 0, maxHp: 0, tint: 0, hurtT: 0, hit: false,
      speed: (spec.kind === "caster" ? 120 : 105) * (0.85 + 0.07 * d), dmg: (spec.kind === "dasher" ? 13 : spec.kind === "caster" ? 9 : 10) * (0.7 + 0.15 * d), wind: Math.max(0.32, 0.72 - 0.06 * d) };
    const lvl = 1 + 0.1 * (G.chapterIdx || 0); e.dmg *= 1 + 0.05 * (G.chapterIdx || 0); e.maxHp = e.hp = Math.round((spec.kind === "caster" ? 55 : 80) * (0.8 + 0.12 * d) * lvl);
    return e;
  }
  function drawBar(e) { const w = 70; e.bar.clear().fillStyle(0x000000, 0.7).fillRect(-w / 2, -(170 * e.sc) - 8, w, 6).fillStyle(0xff3b5c, 1).fillRect(-w / 2 + 1, -(170 * e.sc) - 7, (w - 2) * Math.max(0, e.hp / e.maxHp), 4); }
  function setTint(e, on) { e.rig.all.forEach((i) => (on ? i.setTint(0xff7070) : i.clearTint())); }

  function updateEnemy(scene, e, dt, time) {
    const hx = scene.hx, dx = hx - e.x, dir = dx >= 0 ? 1 : -1, dist = Math.abs(dx);
    e.t += dt; e.cool -= dt; e.vx = 0;
    if (e.state !== "dead") e.rig.root.setScale(dir * e.sc, e.sc);
    if (e.state === "spawn") { const goal = dir > 0 ? C.AL + 70 : C.AR - 70; e.vx = dir * e.speed * 1.5; e.x += e.vx * dt; if (e.x > C.AL && e.x < C.AR) e.state = "approach"; }
    else if (e.state === "approach") {
      const want = e.kind === "caster" ? 380 : e.kind === "dasher" ? 260 : 86 + 24 * e.sc;
      if (e.kind === "caster" && dist < 300) e.vx = -dir * e.speed; else if (dist > want) e.vx = dir * e.speed;
      e.x += e.vx * dt;
      const slots = C.hard ? 2 : 1;
      if (e.cool <= 0 && dist < (e.kind === "brute" ? want + 28 : 560) && C.attackers < slots) { e.state = "windup"; e.t = 0; C.attackers++; if (e.kind === "dasher") e.rig.hold("dash"); if (e.kind === "caster") e.rig.glowPulse(1); }
    } else if (e.state === "windup") {
      const on = Math.floor(e.t * 14) % 2 === 0; if (on !== e.tint) { e.tint = on; setTint(e, on); }
      if (e.t >= e.wind) { setTint(e, false); e.state = "strike"; e.t = 0; e.hit = false; e.dir = dir; e.tint = false;
        if (e.kind === "brute") e.rig.play(pick(["jab", "cross", "kick"]), { hit: () => enemyStrike(scene, e, e.dmg, 100 + 30 * e.sc) });
        else if (e.kind === "caster") { e.rig.release(); e.rig.play("cast", { hit: () => { const o = e.rig.orbWorld(); projectile(scene, o.x, GROUND - 110, e.dir * 430, e.dmg, "enemy", hex(People.SPECS.overlord.glow)); } }); }
        else { e.rig.release(); Sound.whoosh(); }
      }
    } else if (e.state === "strike") {
      if (e.kind === "dasher") { e.x += e.dir * 760 * dt; if (!e.hit && Math.abs(scene.hx - e.x) < 70) { e.hit = true; enemyStrike(scene, e, e.dmg, 9999); } if (e.t > 0.38) endAttack(e, 0.9); }
      else if (e.t > (e.kind === "caster" ? 0.7 : 0.62)) endAttack(e, e.kind === "caster" ? 1.6 : 1.1);
    } else if (e.state === "stagger") { if (e.t > e.stagger) { e.state = "approach"; e.cool = Math.max(e.cool, 0.4); } }
    else if (e.state === "dead") { e.rig.root.alpha = Math.max(0, 1 - Math.max(0, e.t - 0.9) * 1.4); if (e.t > 1.8) e.gone = true; }
    if (e.state !== "dead") { e.x = Phaser.Math.Clamp(e.x, C.AL - 260, C.AR + 260); e.rig.root.setPosition(e.x, GROUND + 6); e.ui.setPosition(e.x, GROUND + 6); drawBar(e); }
    e.rig.update(dt, time, { vx: e.vx * dir, vy: 0, grounded: true });
  }
  function endAttack(e, cool) { if (e.state === "strike" || e.state === "windup") C.attackers = Math.max(0, C.attackers - 1); e.state = "approach"; e.cool = cool * rnd(0.8, 1.3); e.rig.release(); if (e.kind === "caster") e.rig.glowPulse(0); setTint(e, false); }

  function enemyStrike(scene, e, dmg, reach) {
    const dx = (scene.hx - e.x) * (e.dir || 1);
    if (dx < -30 || dx > reach) return;
    hurtHero(scene, dmg, e.x);
  }
  function hurtHero(scene, dmg, fromX) {
    if (C.over || C.invuln > 0) { if (C.dodging) { scene.popup(scene.hx, GROUND - 230, "DODGE", "#5eead4"); C.energy = Math.min(100, C.energy + 8); } return; }
    const facing = (fromX - scene.hx) * scene.face > 0;
    if (C.guarding && facing) { scene.popup(scene.hx, GROUND - 230, "BLOCK", "#bef264"); Sound.click(); Fight.impact(scene, scene.hx + scene.face * 40, GROUND - 110, 0xbef264, 0.7); C.energy = Math.min(100, C.energy + 10); dmg *= 0.12; scene.tweens.add({ targets: scene, hx: scene.hx - scene.face * 14, duration: 90 }); }
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
      if (p.from === "enemy") { if (Math.abs(p.x - scene.hx) < 36 && scene.hy > GROUND - 70) { hurtHero(scene, p.dmg, p.x); p.life = 0; } }
      else for (const e of alive()) if (e.state !== "spawn" && Math.abs(p.x - e.x) < 44 + 12 * e.sc) { damage(scene, e, p.dmg, 60, true, 1.2); p.life = 0; break; }
      if (p.x < C.AL - 300 || p.x > C.AR + 300) p.life = 0;
    }
    C.proj = C.proj.filter((p) => (p.life > 0 ? true : (p.img.destroy(), false)));
  }

  // ------------------------------------------------------------------ hero damage dealing
  function damage(scene, e, dmg, knock, big, size = 1) {
    if (e.state === "dead") return;
    dmg *= C.L.mult.damage * (C.buff > 0 ? 1.6 : 1) * (1 + Math.min(0.5, C.combo * 0.04));
    e.hp -= dmg; e.rig.flash(); if (e.state !== "strike") e.rig.play("hurt"); Fight.impact(scene, e.x, GROUND - 120 * e.sc, HERO, big ? 1.3 * size : size); Sound.hit();
    scene.popup(e.x, GROUND - 270, String(Math.round(dmg)), big ? "#ffd36a" : "#e8ffe0");
    const dir = Math.sign(e.x - scene.hx) || 1; e.x += dir * knock * 0.35; scene.tweens.add({ targets: e, x: e.x + dir * knock, duration: 140, ease: "Cubic.out" });
    if (big) { scene.cameras.main.shake(130, 0.007); hitstop(scene, 70); } else hitstop(scene, 35);
    if (e.state === "windup" || (big && e.state !== "strike")) { if (e.state === "windup") C.attackers = Math.max(0, C.attackers - 1); e.state = "stagger"; e.t = 0; e.stagger = big ? 0.55 : 0.32; setTint(e, false); e.rig.release(); }
    C.combo++; C.comboT = 2.2; C.energy = Math.min(100, C.energy + 3.5); C.meter = Math.min(100, C.meter + 1.2);
    if (e.hp <= 0) kill(scene, e);
  }
  function kill(scene, e) {
    e.state = "dead"; e.t = 0; C.attackers = Math.max(0, C.attackers - (e.counted ? 1 : 0)); setTint(e, false); e.bar.clear(); e.label.setVisible(false); e.rig.release(); e.rig.glowPulse(0);
    e.rig.play("ko"); Fight.impact(scene, e.x, GROUND - 130 * e.sc, 0xffffff, 1.6); scene.cameras.main.shake(220, 0.012); hitstop(scene, 110);
    C.kills++; if (e.kind === "caster" || true) C.attackers = alive().filter((x) => x.state === "windup" || x.state === "strike").length;
    const orb = scene.add.container(e.x, GROUND - 120).setDepth(15); orb.add([scene.add.image(0, 0, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0x5eead4).setScale(2.2), scene.add.image(0, 0, "gem").setScale(0.45)]);
    scene.tweens.add({ targets: orb, y: orb.y - 60, duration: 500, ease: "Cubic.out" });
    C.orbs.push({ o: orb, f: e.spec.fact, t: 0 });
    if (C.L.equipped.includes("siphon")) { C.hp = Math.min(C.maxHp, C.hp + 12); scene.popup(scene.hx, GROUND - 280, "+12", "#bef264"); }
  }
  function updateOrbs(scene, dt) {
    for (const o of C.orbs) {
      o.t += dt; if (o.t > 0.6) { const dx = scene.hx - o.o.x, dy = (scene.hy - 100) - o.o.y, k = Math.min(1, dt * 7); o.o.x += dx * k; o.o.y += dy * k; }
      if (o.t > 0.7 && Math.abs(o.o.x - scene.hx) < 46 && Math.abs(o.o.y - (scene.hy - 100)) < 70) {
        o.done = true; o.o.destroy(); Sound.collect(); Fight.impact(scene, scene.hx, scene.hy - 110, 0x5eead4, 0.8);
        const gain = Math.max(1, Math.round((1 + Math.random()) * C.L.mult.shards)); C.shards += gain; C.learned.push(o.f);
        C.meter = Math.min(100, C.meter + 22); C.energy = Math.min(100, C.energy + 18); scene.popup(scene.hx, GROUND - 270, "+" + gain + " SHARD", "#5eead4"); showFact(o.f);
      }
    }
    C.orbs = C.orbs.filter((o) => !o.done);
  }

  // ------------------------------------------------------------------ hero actions
  function melee(scene, name, dmg, reach, knock, big) {
    C.busy = true; C.busyUntil = C.t + 1; Sound.whoosh();
    scene.tweens.add({ targets: scene, hx: scene.hx + scene.face * 34, duration: 110, ease: "Cubic.out" });
    scene.hero.play(name, { hit: () => { let n = 0; for (const e of alive()) { const dx = (e.x - scene.hx) * scene.face; if (e.state !== "spawn" && dx > -26 && dx < reach + 28 * e.sc) { damage(scene, e, dmg, knock, big); n++; } } if (!n) C.combo = Math.max(0, C.combo - 1); } }).then(() => { C.busy = false; });
  }
  function act(scene, id) {
    const A = C.L.abilities.find((a) => a.id === id); if (!A || !A.unlocked || (C.cd[id] || 0) > 0) return false;
    if (A.cost && C.energy < A.cost) { scene.popup(scene.hx, GROUND - 250, "NEED ENERGY", "#ffd36a"); C.cd[id] = 0.3; return false; }
    if (id === "strike") { const n = C.chain % 3; melee(scene, ["jab", "cross", "uppercut"][n], [9, 11, 18][n], 120, [10, 14, 70][n], n === 2); C.chain++; C.chainT = 0.9; }
    else if (id === "kick") { const big = C.chain >= 2; melee(scene, big ? "spinkick" : "kick", big ? 28 : 17, 150, big ? 120 : 60, true); C.chain = 0; }
    else if (id === "bolt") { C.energy -= A.cost; C.cd.bolt = 0.9; C.busy = true; C.busyUntil = C.t + 1; scene.hero.glowPulse(1); scene.hero.play("cast", { hit: () => { const o = scene.hero.orbWorld(); projectile(scene, o.x, o.y, scene.face * 760, 30, "hero", HERO); } }).then(() => { C.busy = false; scene.hero.glowPulse(0); }); }
    else if (id === "shock") { C.energy -= A.cost; C.cd.shock = 3; C.busy = true; C.busyUntil = C.t + 1.2; Sound.boss(); scene.hero.play("slam", { hit: () => { Fight.shockwave(scene, scene.hx + scene.face * 50, HERO); for (const e of alive()) if (Math.abs(e.x - scene.hx) < 360 && e.state !== "spawn") { damage(scene, e, 20, 150, true, 1.1); if (e.state !== "dead") { e.state = "stagger"; e.t = 0; e.stagger = 1.5; } } } }).then(() => { C.busy = false; }); }
    else if (id === "surge") { C.energy -= A.cost; C.cd.surge = 9; C.buff = 6; C.busy = true; C.busyUntil = C.t + 1; scene.hero.glowPulse(1.4); Sound.cast(); scene.popup(scene.hx, GROUND - 290, "OVERCHARGE", "#ffd36a"); scene.hero.play("charge").then(() => { C.busy = false; }); }
    else if (id === "nova") {
      if (C.meter < 100) { scene.popup(scene.hx, GROUND - 250, "METER NOT FULL", "#ffd36a"); C.cd.nova = 0.3; return false; }
      C.meter = 0; C.busy = true; C.busyUntil = C.t + 1.5; Sound.boss(); scene.cameras.main.flash(420, 255, 255, 255); scene.cameras.main.shake(500, 0.02); scene.hero.glowPulse(1.6);
      scene.hero.play("charge").then(() => { scene.hero.glowPulse(0); C.busy = false; });
      setTimeout(() => alive().forEach((e) => damage(scene, e, 9999, 200, true, 2)), 380);
    }
    return true;
  }
  function dodge(scene) {
    if ((C.cd.dodge || 0) > 0 || C.busy) return; C.cd.dodge = 0.75; C.dodging = true; C.invuln = 0.28; C.dodgeDir = scene.face; Sound.whoosh(); scene.hero.hold("dash");
    setTimeout(() => { C.dodging = false; scene.hero.release(); }, 240);
  }

  // ------------------------------------------------------------------ per-frame step (called by the world scene)
  function step(scene, dt, time) {
    if (!C || C.paused) return;
    C.t += dt; for (const k in C.cd) C.cd[k] -= dt; if (C.invuln > 0) C.invuln -= dt; if (C.buff > 0) { C.buff -= dt; if (C.buff <= 0) scene.hero.glowPulse(0); }
    if (C.comboT > 0) { C.comboT -= dt; if (C.comboT <= 0) C.combo = 0; } if (C.chainT > 0) { C.chainT -= dt; if (C.chainT <= 0) C.chain = 0; }
    if (C.busy && C.t > C.busyUntil) C.busy = false;
    C.energy = Math.min(100, C.energy + 5 * C.L.mult.energy * dt);
    const k = keys, h = scene.hero;
    if (!C.over) {
      const ax = (k.D.isDown || k.RIGHT.isDown || V.right ? 1 : 0) - (k.A.isDown || k.LEFT.isDown || V.left ? 1 : 0);
      C.guarding = !C.busy && !C.dodging && scene.onGround && (k.S.isDown || k.DOWN.isDown || !!T.guardHeld);
      if (!C.busy && !C.dodging) {
        if (just(k.J) | take("strike")) act(scene, "strike"); else if (just(k.K) | take("kick")) act(scene, "kick");
        else if (just(k.ONE) | take("a1")) act(scene, "bolt"); else if (just(k.TWO) | take("a2")) act(scene, "shock"); else if (just(k.THREE) | take("a3")) act(scene, "surge"); else if (just(k.FOUR) | take("a4")) act(scene, "nova");
        else if (just(k.SHIFT) | take("dodge")) dodge(scene);
      } else { just(k.J); just(k.K); just(k.SHIFT); take("strike"); take("kick"); take("dodge"); }
      if ((just(k.SPACE) | just(k.W) | just(k.UP) | V.jump) && scene.onGround && !C.busy) { scene.vy = -820; scene.onGround = false; Sound.jump(); } V.jump = false;
      if (C.dodging) scene.vx = C.dodgeDir * 640;
      else if (!C.busy) { const sp = C.guarding ? 70 : 300; scene.vx += (ax * sp - scene.vx) * Math.min(1, dt * 11); if (ax) scene.face = ax; else { const n = nearest(scene); if (n) scene.face = n.x > scene.hx ? 1 : -1; } }
      else scene.vx *= 0.88;
      h.guard = C.guarding || true;
    } else scene.vx *= 0.8;
    scene.vy += 2300 * dt; scene.hy += scene.vy * dt; if (scene.hy >= GROUND) { scene.hy = GROUND; scene.vy = 0; scene.onGround = true; }
    scene.hx = Phaser.Math.Clamp(scene.hx + scene.vx * dt, C.AL + 40, C.AR - 40);
    for (const e of C.enemies) updateEnemy(scene, e, dt, time); C.enemies = C.enemies.filter((e) => !(e.gone && (e.rig.root.destroy(), e.ui.destroy(), true)));
    if (C.pending > 0) { C.spawnT -= dt; if (C.spawnT <= 0) { C.pending--; C.spawnT = 2.2; C.enemies.push(spawn(scene, C.queue.shift(), C.spawned++, C.adapt)); } }
    updateProj(scene, dt); updateOrbs(scene, dt); hud();
    if (!C.over && C.pending === 0 && alive().length === 0 && C.orbs.length === 0) { C.over = "won"; }
    if (C.over && !C.resolved) { C.resolved = true; setTimeout(() => C.resolve(C.over), C.over === "won" ? 900 : 1200); if (C.over === "lost") { Sound.wrong(); h.play("ko"); } else { Sound.win(); h.play("victory"); } }
  }
  function nearest(scene) { let b = null, d = 1e9; for (const e of alive()) { const x = Math.abs(e.x - scene.hx); if (x < d) { d = x; b = e; } } return b; }

  // ------------------------------------------------------------------ one fight
  function fightOnce(scene, ent, enc, L, adapt) {
    return new Promise((resolve) => {
      const cx = ent.x, d = (adapt && adapt.difficulty) || 3;
      C = { L, adapt, AL: cx - 560, AR: cx + 560, enemies: [], proj: [], orbs: [], cd: {}, t: 0, busy: false, busyUntil: 0, chain: 0, chainT: 0, combo: 0, comboT: 0, energy: 60, meter: G.meter || 0, buff: 0, invuln: 0, guarding: false, dodging: false, attackers: 0, hard: d >= 3,
        maxHp: Math.round(100 * L.mult.health), kills: 0, shards: 0, learned: [], over: null, resolved: false, queue: enc.enemies.slice(), pending: enc.enemies.length, spawned: 0, spawnT: 0.4, resolve };
      C.hp = C.maxHp;
      C.paused = false; scene.combat = Combat; scene.fighting = true; scene.fightMid = cx; scene.hero.guard = true; scene.hx = Math.min(scene.hx, cx - 200);
      $("#cb-lv").textContent = "LV " + L.level; $("#cb-name").textContent = (G.name || "RANGER").toUpperCase(); buildSlots(L); $("#cb").classList.remove("hidden"); UI.hideHud && UI.hideHud(); UI.touch(true); $("#ctouch").style.display = "";
    });
  }
  function stopFight(scene, ent) {
    $("#cb").classList.add("hidden"); FQ.q = []; $("#fact").classList.add("hidden"); scene.combat = null; scene.fighting = false; scene.fightMid = null;
    scene.hero.guard = false; scene.hero.release(); scene.hero.recover(); scene.hy = GROUND; scene.vy = 0; scene.vx = 0; scene.onGround = true; scene.hero.glowPulse(0);
    for (const e of C.enemies) { e.rig.root.destroy(); e.ui.destroy(); } for (const p of C.proj) p.img.destroy(); for (const o of C.orbs) o.o.destroy();
    G.meter = C.meter; const out = { shards: C.shards, kills: C.kills, learned: C.learned }; C = null; return out;
  }

  async function run(scene, ent, enc, L, adapt) {
    build(); keys = scene.combatKeys || (scene.combatKeys = scene.input.keyboard.addKeys("J,K,S,DOWN,ONE,TWO,THREE,FOUR"));
    keys.D = scene.k.D; keys.A = scene.k.A; keys.W = scene.k.W; keys.UP = scene.k.UP; keys.LEFT = scene.k.LEFT; keys.RIGHT = scene.k.RIGHT; keys.SPACE = scene.k.SPACE; keys.SHIFT = scene.k.SHIFT;
    let defeats = 0;
    for (;;) {
      const done = fightOnce(scene, ent, enc, L, adapt);
      // the arena bounds are fixed above; fix names used by the step function
      const res = await done; const out = stopFight(scene, ent);
      if (res === "won") return { won: true, ...out };
      defeats++;
      const html = `<div class="kicker">Defeated</div><h1>Overwhelmed</h1><p>${defeats >= 2 ? "Hard fight. You can try again or skip it; skipping earns no shards." : "Tip: guard (S) blocks most damage, dodge (Shift) makes you untouchable for a moment, and kills drop shards that refill your energy."}</p>`;
      const idx = await UI.choice(html, defeats >= 2 ? ["Skip fight", "Fight again"] : ["Fight again"]);
      if (defeats >= 2 && idx === 0) return { won: false, skipped: true, shards: 0, kills: 0, learned: [] };
      scene.hero.recover(); scene.hx = ent.x - 300;
    }
  }
  return { plan, run, step, state: () => C };
})();
