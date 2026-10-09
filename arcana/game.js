// Arcana engine: a fixed 2D side-scroller that plays any GameScript.
// The player walks, jumps and interacts; the script decides what each station teaches or asks.
let SCRIPT = null;
let LIVE = null; // job id while an uploaded game is still being generated
const { W, H, GROUND } = Art;
const FIRST = 1100, SPACING = 940, FONT = '"Orbitron", sans-serif';
const NEON_HEX = 0x39ff14;
const V = { left: false, right: false, jump: false, act: false }; // touch / virtual keys

const DEFAULT_HERO = { level: 1, shards: 0, kills: 0, slots: 2, equipped: [], mult: { damage: 1, health: 1, energy: 1, shards: 1, score: 1 }, abilities: [{ id: "strike", name: "Strike", key: "J", unlock: 1, cost: 0, unlocked: true }, { id: "kick", name: "Heavy kick", key: "K", unlock: 1, cost: 0, unlocked: true }], enchants: [], upgrades: [] };
const G = { missed: [], gameId: null, name: "Ranger", gender: "m", adapt: null, hp: 5, maxHp: 5, score: 0, mistakes: {}, chapterMistakes: 0, finalResult: null, chapterIdx: 0, total: 1 };
// Every answer and the chapter progress go to this student's private record; the server turns them into mastery.
const Track = {
  on: false, q: [], gameId: null, ctx: { kind: "", chapter: "" },
  start(gameId) { this.on = true; this.gameId = gameId; setInterval(() => this.flush(), 6000); addEventListener("pagehide", () => this.flush(true)); },
  add(q, ok, x = {}) { if (!this.on || !q) return; this.q.push({ qid: q.id, concept: q.conceptId, correct: !!ok, difficulty: q.difficulty || 2, ms: x.ms || 0, hints: x.hints || 0, kind: this.ctx.kind, chapter: this.ctx.chapter }); if (this.q.length >= 8) this.flush(); },
  send(path, body, beacon) {
    const json = JSON.stringify(body);
    if (beacon && navigator.sendBeacon) return navigator.sendBeacon(path, new Blob([json], { type: "application/json" }));
    return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true }).catch(() => {});
  },
  flush(beacon) { if (!this.on || !this.q.length) return Promise.resolve(); return this.send("/api/events", { gameId: this.gameId, events: this.q.splice(0) }, beacon); },
  async progress(chapterIdx, finished) { if (!this.on) return; await this.flush(); await this.send("/api/progress", { gameId: this.gameId, chapterIdx, score: G.score, finished: !!finished }); },
};
// The personal setup the server worked out for this student (difficulty, hearts, hints, practice...).
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const A = () => G.adapt || { difficulty: 3, style: "balanced", maxHearts: 5, rivalBonus: 0, bossRatioDelta: 0, bossCountDelta: 0, testPassDelta: 0, targetDifficulty: 2, showHints: true, explainAlways: false, scoreBonus: 1, weak: [], practice: [] };
async function loadHero() { try { const r = await fetch("/api/hero"); G.hero = r.ok ? await r.json() : DEFAULT_HERO; } catch (e) { G.hero = DEFAULT_HERO; } }
const enchanted = (id) => !!(G.hero && G.hero.equipped.includes(id));
async function loadAdapt() {
  try { G.adapt = await UI.api("/api/adapt?game=" + encodeURIComponent(G.gameId)); } catch (e) { /* keep the previous setup */ }
  G.maxHp = A().maxHearts; G.hp = G.maxHp;
}
function pickQs(pool, n) {                                    // favour weak topics and the student's target difficulty
  const weak = new Set((A().weak || []).map((w) => w.id)), t = A().targetDifficulty;
  return pool.map((q) => ({ q, s: Math.random() + (weak.has(q.conceptId) ? 1.2 : 0) - 0.35 * Math.abs((q.difficulty || 2) - t) })).sort((x, y) => y.s - x.s).slice(0, n).map((x) => x.q);
}
const questionsOf = (ch) => ch.scenes.flatMap((s) => (s.question ? [s.question] : s.questions || []));

class World extends Phaser.Scene {
  constructor() { super("world"); }

  create() {
    this.mode = "none"; this.themeObjs = []; this.layers = []; this.entities = []; this.orbs = []; this.control = false;
    this.camX = 0; this.hx = 140; this.hy = GROUND; this.vx = 0; this.vy = 0; this.onGround = true; this.face = 1;
    this.limitX = 1e9; this.active = null; this.exitX = 1e9; this.interactCb = null; this.exitCb = null; this.burstTint = NEON_HEX;
    const kb = this.input.keyboard; this.k = kb.addKeys("W,A,S,D,UP,LEFT,RIGHT,SPACE,SHIFT,E,ENTER"); kb.addCapture("SPACE,UP,DOWN,LEFT,RIGHT");
    this.shadow = this.add.ellipse(0, GROUND + 4, 96, 16, 0x000000, 0.5).setDepth(11);
    Art.buildTheme(this, "neon_grid"); People.props(this); People.dress(G.hero && G.hero.look); this.heroes = { m: People.make(this, "hero_m", 1.32), f: People.make(this, "hero_f", 1.32) }; this.hero = this.heroes.m; this.focus = null; Object.values(this.heroes).forEach((h) => h.root.setDepth(12)); this.tscale = 1; this.frozen = false; this.fighting = false; this.fightMid = null;
    this.burstE = this.add.particles(0, 0, "spark", { lifespan: 650, speed: { min: 90, max: 300 }, scale: { start: 0.55, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: "ADD", gravityY: 160, emitting: false, tint: { onEmit: () => this.burstTint } }).setDepth(16);
    Chars.props(this); this.makePrompt();
    if (this.renderer.type === Phaser.WEBGL && !Art.LOW) { const fx = this.cameras.main.postFX; fx.addVignette(0.5, 0.5, 0.92, 0.3); fx.addBloom(0xffffff, 1, 1, 1.0, 0.75, 4); }   // bloom is the most expensive effect: high quality only
    UI.setScene(this); this.heroVisible(false);
    setTimeout(() => main(this), 0);
  }

  heroVisible(v) { Object.values(this.heroes).forEach((h) => h.root.setVisible(v && (this.mode === "title" || h === this.hero))); this.shadow.setVisible(false); }
  setHero(gender) { this.hero = this.heroes[gender] || this.heroes.m; this.focus = null; Object.values(this.heroes).forEach((h) => h.root.setAlpha(1)); this.heroVisible(true); }
  previewHero(gender) { this.focus = gender; }

  // ---- theme / layers ----
  setTheme(name, variant = 0) {
    const th = Art.buildTheme(this, name); this.theme = th;
    this.themeObjs.forEach((o) => o.destroy()); this.themeObjs = [];
    const add = (o) => (this.themeObjs.push(o), o);
    add(this.add.image(0, 0, th.sky).setOrigin(0).setScrollFactor(0).setDepth(0));
    this.layers = th.layers.map((L) => ({ f: L.f, o: add(this.add.tileSprite(0, Art.LAYER_BOTTOM - L.h, W, L.h, L.key).setOrigin(0).setScrollFactor(0).setDepth(L.d)) }));
    if (th.ceil) this.layers.push({ f: th.ceil.f, o: add(this.add.tileSprite(0, 0, W, th.ceil.h, th.ceil.key).setOrigin(0).setScrollFactor(0).setDepth(5)) });
    this.layers.push({ f: 1, o: add(this.add.tileSprite(0, GROUND, W, H - GROUND, th.ground).setOrigin(0).setScrollFactor(0).setDepth(6)) });
    this.layers.push({ f: 1.35, o: add(this.add.tileSprite(0, H - 260, W, 260, th.fg).setOrigin(0).setScrollFactor(0).setDepth(20)) });
    const tint = Phaser.Display.Color.HexStringToColor(th.rays).color, fog = Phaser.Display.Color.HexStringToColor(th.fog).color;
    const LOW = Art.LOW;                                       // phones: every full-screen layer costs a whole screen of pixels each frame
    if (!LOW) { const rays = add(this.add.tileSprite(0, 0, W, H, "rays").setOrigin(0).setScrollFactor(0).setDepth(8).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setAlpha(0.55));
      this.layers.push({ f: 0.2, o: rays }); this.tweens.add({ targets: rays, alpha: 0.25, duration: 3200, yoyo: true, repeat: -1, ease: "Sine.inOut" }); }
    const f1 = add(this.add.tileSprite(0, GROUND - 200, W, 260, "fogbank").setOrigin(0).setScrollFactor(0).setDepth(5.5).setTint(fog).setAlpha(0.35));
    this.fogs = [{ o: f1, f: 0.7, drift: 6 }]; this.fogT = 0;
    if (!LOW) this.fogs.push({ o: add(this.add.tileSprite(0, GROUND - 120, W, 260, "fogbank").setOrigin(0).setScrollFactor(0).setDepth(19).setTint(fog).setAlpha(0.2)), f: 1.15, drift: -9 });
    const P = th.particles;
    add(this.add.particles(0, 0, "spark", { x: { min: 0, max: W }, y: { min: 0, max: H }, lifespan: { min: P.life[0], max: P.life[1] }, speedY: { min: P.vy[0], max: P.vy[1] }, speedX: { min: P.vx[0], max: P.vx[1] }, scale: { start: P.scale[0], end: P.scale[1] }, alpha: { start: P.alpha, end: 0 }, tint: P.tints, blendMode: "ADD", frequency: P.freq * (Art.LOW ? 2.5 : 1), quantity: 1 }).setScrollFactor(0).setDepth(15));
    this.accent = Phaser.Display.Color.HexStringToColor(th.accent).color;
    this.drifts = [];                                         // slowly moving cloud / aurora / mist layers
    for (const d of (LOW ? (th.drift || []).slice(0, 1) : th.drift || [])) {
      const t = add(this.add.tileSprite(0, d.y, W, d.h, d.key).setOrigin(0).setScrollFactor(0).setDepth(d.d).setAlpha(d.alpha));
      if (d.add) t.setBlendMode(Phaser.BlendModes.ADD);
      if (d.pulse) this.tweens.add({ targets: t, alpha: d.alpha * 0.45, duration: 3500 + Math.random() * 2500, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.drifts.push({ o: t, f: d.f, speed: d.speed, t: 0 });
    }
    const V = VARIANTS[variant % VARIANTS.length];          // dusk, night, storm, ...: tint the painted layers and add weather
    if (V.tint) for (const o of this.themeObjs) if (o.setTint && o.blendMode !== Phaser.BlendModes.ADD && o.type !== "ParticleEmitter") o.setTint(V.tint);
    if (V.weather === "rain") add(this.add.particles(0, 0, "spark", { x: { min: -200, max: W + 200 }, y: -20, lifespan: 900, speedY: { min: 900, max: 1200 }, speedX: -160, scaleX: 0.06, scaleY: { start: 1.6, end: 1.2 }, alpha: 0.35, tint: 0xbfdfff, frequency: LOW ? 40 : 14, quantity: 2 }).setScrollFactor(0).setDepth(21));
    if (V.weather === "snow") add(this.add.particles(0, 0, "spark", { x: { min: 0, max: W }, y: -10, lifespan: 7000, speedY: { min: 40, max: 90 }, speedX: { min: -30, max: 30 }, scale: { min: 0.12, max: 0.3 }, alpha: 0.8, tint: 0xffffff, frequency: LOW ? 160 : 60 }).setScrollFactor(0).setDepth(21));
    if (V.weather === "embers") add(this.add.particles(0, 0, "spark", { x: { min: 0, max: W }, y: H + 10, lifespan: 5000, speedY: { min: -120, max: -50 }, speedX: { min: -20, max: 20 }, scale: { start: 0.3, end: 0 }, blendMode: "ADD", tint: [0xff7a1a, 0xffd36a], frequency: LOW ? 160 : 70 }).setScrollFactor(0).setDepth(21));
    if (V.flash) { const f = add(this.add.rectangle(0, 0, W, H, 0xdfe8ff, 0).setOrigin(0).setScrollFactor(0).setDepth(22)); this.time.addEvent({ delay: 5200, loop: true, callback: () => { if (Math.random() < 0.6) this.tweens.add({ targets: f, fillAlpha: { from: 0.35, to: 0 }, duration: 380 }); } }); }
    this.birds = [];
    if (th.birds && !V.weather) for (let i = 0; i < (LOW ? 3 : 7); i++) this.birds.push({ o: add(this.add.image(0, 0, "bird").setScrollFactor(0).setDepth(2.5).setAlpha(0.75).setScale(0.8 + Math.random() * 0.6)), x0: Math.random() * (W + 300), y0: 90 + Math.random() * 230, v: 18 + Math.random() * 22, ph: Math.random() * 6 });
  }

  startTitle() {
    this.mode = "title"; this.setTheme("neon_grid"); this.clearLevel(); this.camX = 0; this.heroVisible(true); this.control = false;
  }

  clearLevel() { this.entities.forEach((e) => e.root.destroy()); this.entities = []; this.orbs.forEach((o) => o.g.destroy()); this.orbs = []; if (this.exit) { this.exit.destroy(); this.exit = null; } this.prompt.setVisible(false); }

  build(ch) {
    this.mode = "play"; this.setTheme(ch.theme.background, ch.theme.variant != null ? ch.theme.variant : (G.chapterIdx || 0) >= 6 ? 1 : 0); this.clearLevel(); this.chapter = ch;
    this.hx = 140; this.hy = GROUND; this.vx = 0; this.vy = 0; this.camX = 0; this.face = 1; this.heroVisible(true); this.control = false; this.cinematic = false;
    ch.scenes.forEach((s, i) => { const e = this.makeEntity(s, FIRST + i * SPACING); e.i = i; this.entities.push(e); });
    this.exitX = FIRST + ch.scenes.length * SPACING; this.makeExit(this.exitX); this.makeOrbs(ch.scenes.length);
    this.active = null; this.limitX = FIRST - 200; Sound.setMood(this.theme.music);
  }

  // ---- entities ----
  label(root, text, y, color = "#39ff14") {
    return this.add.text(0, y, text, { fontFamily: FONT, fontSize: "15px", color, stroke: "#000", strokeThickness: 4 }).setOrigin(0.5).setAlpha(0.9);
  }
  makeEntity(s, x) {
    const root = this.add.container(x, GROUND + 6).setDepth(10);
    const e = { s, x, root, upd: () => {}, stopX: x - 120, auto: false, verb: "Interact", top: 240, done: false };
    const add = (o) => (root.add(o), o);
    if (s.type === "npc") {
      const a = People.make(this, s.npc.look, 1.3); a.root.setScale(-1.3, 1.3); add(a.root); e.upd = (dt, t) => a.update(dt, t, {});
      e.verb = "Talk"; e.top = 370; add(this.label(root, s.npc.name.toUpperCase(), -300));
    } else if (s.type === "tablet") {
      const g = add(this.add.graphics());
      g.fillStyle(0x000000, 0.45).fillEllipse(0, 4, 190, 26);
      g.fillStyle(0x1b2420, 1).fillRoundedRect(-62, -250, 124, 250, { tl: 52, tr: 52, bl: 6, br: 6 }).lineStyle(4, 0x39ff14, 0.9).strokeRoundedRect(-62, -250, 124, 250, { tl: 52, tr: 52, bl: 6, br: 6 });
      g.fillStyle(0x2a3630, 1).fillRoundedRect(-48, -232, 96, 214, { tl: 40, tr: 40, bl: 4, br: 4 });
      g.lineStyle(3, 0x5eead4, 0.95); for (let r = 0; r < 6; r++) { const y = -196 + r * 30, w = 56 - (r % 3) * 12; g.lineBetween(-w / 2, y, w / 2, y); }
      const glow = add(this.add.image(0, -130, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0x5eead4).setScale(5.5).setAlpha(0.35));
      add(this.label(root, (s.tablet.title || "KNOWLEDGE TABLET").toUpperCase().slice(0, 34), -290, "#5eead4"));
      e.verb = "Read the tablet"; e.top = 300; e.stopX = x - 150; e.upd = (dt, t) => glow.setAlpha(0.28 + 0.16 * Math.sin(t * 0.004));
    } else if (s.type === "obstacle") {
      const field = add(this.add.image(0, -10, "gate_field").setOrigin(0.5, 1).setScale(1.2, 1.1).setBlendMode(Phaser.BlendModes.ADD));
      add(this.add.image(0, 0, "gate_pillars").setOrigin(0.5, 1).setScale(1.2)); e.field = field; e.verb = "Break the seal"; e.top = 410; e.stopX = x - 150;
      e.upd = (dt, t) => { field.alpha = 0.55 + 0.3 * Math.sin(t * 0.006); field.scaleX = 1.2 + 0.05 * Math.sin(t * 0.01); };
    } else if (s.type === "match") {
      const a = People.make(this, "rival", 1.3); a.root.setScale(-1.3, 1.3); a.guard = true; add(a.root); e.rig = a;
      e.c = { root: a.root, flash: () => a.flash() }; e.upd = (dt, t) => a.update(dt, t, {}); e.verb = "Challenge"; e.top = 370; e.stopX = x - 180;
      add(this.label(root, s.opponent.name.toUpperCase(), -300, "#ff6b8b"));
    } else if (s.type === "mission") {
      add(this.add.image(0, 0, "altar").setOrigin(0.5, 1).setScale(1.2)); const gem = add(this.add.image(0, -200, "gem")), gl = add(this.add.image(0, -200, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(NEON_HEX).setScale(2.4));
      e.verb = "Begin mission"; e.top = 300; e.gem = [gem, gl]; e.upd = (dt, t) => { const b = Math.sin(t * 0.003) * 10; gem.y = -200 + b; gl.y = -200 + b; gem.rotation = Math.sin(t * 0.002) * 0.1; gl.alpha = 0.6 + 0.3 * Math.sin(t * 0.007); };
    } else if (s.type === "combat") {
      const r1 = add(this.add.ellipse(0, 6, 420, 70, 0xff3b5c, 0.12).setStrokeStyle(3, 0xff3b5c, 0.9)), r2 = add(this.add.ellipse(0, 6, 270, 44, 0xff3b5c, 0.18).setStrokeStyle(2, 0xff8da1, 0.8));
      const sk = add(this.add.image(0, -60, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff3b5c).setScale(3.4));
      add(this.label(root, "AMBUSH", -190, "#ff3b5c")); e.auto = true; e.stopX = x - 380; e.top = 200; e.verb = "Fight";
      e.upd = (dt, t) => { r1.setAlpha(0.6 + 0.4 * Math.sin(t * 0.006)); r2.scaleX = 1 + 0.08 * Math.sin(t * 0.009); sk.setAlpha(0.25 + 0.2 * Math.sin(t * 0.007)); };
    } else if (s.type === "level_test") {
      const sw = add(this.add.image(0, -150, "swirl").setBlendMode(Phaser.BlendModes.ADD).setScale(0.62)); add(this.add.image(0, 0, "door_frame").setOrigin(0.5, 1).setScale(1.05));
      e.verb = s.practice ? "Practice session" : "Enter trial"; e.top = 380; e.stopX = x - 140; e.sw = sw; e.upd = (dt) => { sw.rotation += dt * 1.2; };
    } else if (ARCADE_INFO[s.type]) {
      const cab = add(this.add.image(0, 0, "cabinet").setOrigin(0.5, 1).setScale(0.64)), gl = add(this.add.image(0, -210, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(NEON_HEX).setScale(3.2).setAlpha(0.35));
      e.verb = "Play " + ARCADE_INFO[s.type].name; e.top = 400; e.stopX = x - 140; e.upd = (dt, t) => gl.setAlpha(0.28 + 0.14 * Math.sin(t * 0.005));
      add(this.label(root, (s.title || ARCADE_INFO[s.type].name).toUpperCase(), -345));
    } else {
      const kind = s.boss.kind || "enforcer", sc = { enforcer: 1.5, colossus: 1.75, overlord: 1.9 }[kind] || 1.3, rig = People.make(this, kind, sc);
      rig.root.setScale(-sc, sc); add(rig.root); rig.guard = true; e.rig = rig; e.heavy = kind === "colossus"; e.sc = sc;
      e.c = { root: rig.root, update: (dt, t) => rig.update(dt, t, {}), flash: () => rig.flash(), robot: rig };
      e.upd = (dt, t) => rig.update(dt, t, {}); e.auto = true; e.stopX = x - 470; e.top = 175 * sc + 60; e.boss = true;
      add(this.label(root, s.boss.name.toUpperCase(), -(175 * sc + 30), "#ff3b5c"));
    }
    return e;
  }
  makeExit(x) {
    const root = this.add.container(x, GROUND + 6).setDepth(9);
    const a = this.add.image(0, -170, "swirl").setBlendMode(Phaser.BlendModes.ADD).setScale(1.1), b = this.add.image(0, -170, "swirl").setBlendMode(Phaser.BlendModes.ADD).setScale(0.7).setFlipX(true);
    const t = this.label(root, "NEXT ZONE", -330); root.add([a, b, t]); this.exit = root;
    this.tweens.add({ targets: [a, b], rotation: { from: 0, to: Math.PI * 2 }, duration: 5000, repeat: -1 });
  }
  makeOrbs(n) {
    const make = (x, y) => { const g = this.add.container(x, y).setDepth(11); g.add([this.add.image(0, 0, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(NEON_HEX).setScale(1.3), this.add.image(0, 0, "gem").setScale(0.34)]); this.orbs.push({ g, x, y, got: false, ph: Math.random() * 6 }); };
    for (let i = -1; i < n; i++) {
      const base = FIRST + i * SPACING + 330, arc = i % 2 === 0;
      for (let j = 0; j < 5; j++) { const x = base + j * 78; make(x, GROUND - (arc ? 70 + Math.sin((j / 4) * Math.PI) * 120 : 70)); }
    }
  }
  makePrompt() {
    const g = this.add.graphics(); g.fillStyle(0x020a04, 0.9).fillRoundedRect(-22, -22, 44, 44, 6).lineStyle(2, NEON_HEX, 1).strokeRoundedRect(-22, -22, 44, 44, 6);
    const k = this.add.text(0, -2, "E", { fontFamily: FONT, fontSize: "24px", color: "#39ff14", fontStyle: "900" }).setOrigin(0.5);
    const l = this.add.text(0, 40, "", { fontFamily: FONT, fontSize: "15px", color: "#e8ffe0", stroke: "#000", strokeThickness: 4 }).setOrigin(0.5);
    this.prompt = this.add.container(0, 0, [g, k, l]).setDepth(25).setVisible(false); this.promptLabel = l;
    this.tweens.add({ targets: g, scale: 1.12, duration: 600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
  }

  // ---- flow hooks ----
  setControl(on) { this.control = on; if (on) Object.values(this.k).forEach((k) => Phaser.Input.Keyboard.JustDown(k)); V.jump = V.act = false; if (!on) { this.vx = 0; this.prompt.setVisible(false); } }
  waitInteract(i) {
    return new Promise((res) => { this.active = i; this.limitX = this.entities[i].stopX; this.interactCb = res; this.setControl(true); });
  }
  waitExit() { return new Promise((res) => { this.active = null; this.limitX = this.exitX - 40; this.exitCb = res; this.setControl(true); }); }
  trigger() { const cb = this.interactCb; this.interactCb = null; this.setControl(false); this.prompt.setVisible(false); this.face = 1; cb && cb(); }

  // ---- visual effects (all return promises) ----
  burst(x, y, tint = NEON_HEX, n = 18) { this.burstTint = tint; this.burstE.explode(n, x, y); }
  popup(x, y, text, color = "#39ff14") {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: "26px", fontStyle: "900", color, stroke: "#000", strokeThickness: 5 }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 900, ease: "Cubic.out", onComplete: () => t.destroy() });
  }
  tw(cfg) { return new Promise((res) => this.tweens.add({ ...cfg, onComplete: res })); }
  shoot(x0, y0, x1, y1, tint, size = 1, dur = 380) {
    const s = this.add.image(x0, y0, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(1.8 * size).setDepth(16);
    const trail = this.time.addEvent({ delay: 30, loop: true, callback: () => { this.burstTint = tint; this.burstE.explode(2, s.x, s.y); } });
    return this.tw({ targets: s, x: x1, y: y1, scale: 2.4 * size, duration: dur, ease: "Cubic.in" }).then(() => { trail.remove(); s.destroy(); });
  }
  hurtFx() { this.hero.flash(); this.cameras.main.shake(200, 0.008); UI.flash(); Sound.hit(); }
  shatter(x, y, tint) {
    for (let i = 0; i < 16; i++) {
      const r = this.add.rectangle(x + Phaser.Math.Between(-30, 30), y - Phaser.Math.Between(0, 220), Phaser.Math.Between(8, 24), Phaser.Math.Between(8, 24), tint).setDepth(16).setAlpha(0.9);
      this.tweens.add({ targets: r, x: r.x + Phaser.Math.Between(-220, 220), y: GROUND + 4, angle: Phaser.Math.Between(-360, 360), alpha: 0, duration: Phaser.Math.Between(500, 900), ease: "Quad.in", onComplete: () => r.destroy() });
    }
  }
  finish(ent) {
    const t = ent.s.type, X = ent.x;
    if (t === "combat") { this.tweens.add({ targets: ent.root, alpha: 0, duration: 700 }); }
    else if (t === "obstacle") { Sound.hit(); this.cameras.main.shake(260, 0.01); this.burst(X, GROUND - 160, NEON_HEX, 40); this.shatter(X, GROUND, NEON_HEX); ent.root.destroy(); }
    else if (ent.exploded) { /* already blown apart by the finisher */ }
    else if (ent.boss || t === "match") { this.burst(X, GROUND - 180, ent.boss ? 0xff3b5c : 0xff6b8b, 60); this.tweens.add({ targets: ent.root, alpha: 0, scaleY: 0.2, y: GROUND + 40, duration: 900, ease: "Cubic.in" }); Sound.hit(); }
    else { this.tweens.add({ targets: ent.root, alpha: 0.5, duration: 500 }); const c = this.add.text(X, GROUND - ent.top - 40, "✔", { fontFamily: FONT, fontSize: "30px", color: "#39ff14", stroke: "#000", strokeThickness: 4 }).setOrigin(0.5).setDepth(25); this.tweens.add({ targets: c, y: c.y - 14, yoyo: true, repeat: -1, duration: 900 }); }
    ent.done = true;
  }

  // ---- main loop ----
  update(time, delta) {
    this.perfT = (this.perfT || 0) + delta;                    // auto quality: 3 slow seconds in a row switch the bloom off
    if (this.perfT > 1000) { this.perfT = 0; this.warm = (this.warm || 0) + 1; if (this.warm > 6 && !document.hidden) this.slow = this.game.loop.actualFps < 45 ? (this.slow || 0) + 1 : 0; if (this.slow >= 3 && !Art.LOW) { Art.LOW = true; this.cameras.main.postFX.clear(); } }
    const dt = this.frozen ? 0 : Math.min(delta / 1000, 0.05) * (this.tscale || 1), k = this.k;
    if (this.mode === "title") {
      this.camX += 230 * dt; this.hx = this.camX + 960; this.hy = GROUND; this.vx = 240; this.face = 1; this.onGround = true;
    } else if (this.mode === "play") this.stepPlay(dt, time);
    this.cameras.main.scrollX = this.camX;
    for (const L of this.layers) L.o.tilePositionX = this.camX * L.f;
    for (const d of this.drifts || []) { d.t += dt; d.o.tilePositionX = this.camX * d.f + d.t * d.speed; }
    for (const b of this.birds || []) { b.o.x = ((b.x0 + time * 0.001 * b.v) % (W + 300)) - 100; b.o.y = b.y0 + Math.sin(time * 0.0015 + b.ph) * 16; b.o.scaleY = (0.5 + 0.6 * Math.abs(Math.sin(time * 0.011 + b.ph))) * 0.9; }
    this.fogT += dt; for (const f of this.fogs || []) f.o.tilePositionX = this.camX * f.f + this.fogT * f.drift;
    if (this.mode === "title") {
      for (const [gd, h] of Object.entries(this.heroes)) {
        const k = this.focus === gd ? 1.1 : 1; h.root.setAlpha(this.focus && this.focus !== gd ? 0.5 : 1);
        h.root.setPosition(this.hx + (gd === "f" ? -200 : 0), this.hy + 6).setScale(this.face * h.scale * k, h.scale * k); h.update(dt, time, { vx: this.vx, vy: 0, grounded: true });
      }
    } else this.hero.root.setPosition(this.hx, this.hy + 6).setScale(this.face * this.hero.scale, this.hero.scale);
    this.shadow.setPosition(this.hx, GROUND + 4).setScale(1 - Math.min(0.5, (GROUND - this.hy) / 300), 1);
    if (this.mode !== "title") this.hero.update(dt, time, { vx: this.vx, vy: this.vy, grounded: this.onGround });
    const cx = this.camX + W / 2;                              // only stations near the screen are drawn and animated (big saving on phones)
    for (const e of this.entities) { const near = Math.abs(e.x - cx) < W * 0.85; if (!e.root.scene) continue; if (e.root.visible !== near && !e.hidden) e.root.setVisible(near); if (near) e.upd(dt, time); }
  }

  stepPlay(dt, time) {
    const k = this.k; let ax = 0, jump = false, act = false;
    if (this.control) {
      ax = (k.D.isDown || k.RIGHT.isDown || V.right ? 1 : 0) - (k.A.isDown || k.LEFT.isDown || V.left ? 1 : 0);
      jump = Phaser.Input.Keyboard.JustDown(k.SPACE) | Phaser.Input.Keyboard.JustDown(k.W) | Phaser.Input.Keyboard.JustDown(k.UP) | V.jump;
      act = Phaser.Input.Keyboard.JustDown(k.E) | Phaser.Input.Keyboard.JustDown(k.ENTER) | V.act; V.jump = V.act = false;
    }
    if (this.combat) Combat.step(this, dt, time);
    if (this.fighting) { this.camX += ((this.fightMid != null ? this.fightMid - 640 : this.camX) - this.camX) * Math.min(1, dt * 5); return; }
    const target = ax * (k.SHIFT.isDown ? 400 : 270);
    this.vx += (target - this.vx) * Math.min(1, dt * (ax ? 10 : 13)); if (Math.abs(this.vx) < 4) this.vx = 0; if (ax) this.face = ax;
    if (jump && this.onGround) { this.vy = -840; this.onGround = false; Sound.jump(); this.burst(this.hx, GROUND, 0x9aff7a, 6); }
    this.vy += 2300 * dt; this.hy += this.vy * dt;
    if (this.hy >= GROUND) { if (!this.onGround && this.vy > 350) { Sound.land(); this.burst(this.hx, GROUND, 0x9aff7a, 8); } this.hy = GROUND; this.vy = 0; this.onGround = true; }
    this.hx += this.vx * dt; if (this.hx < 70) this.hx = 70; if (this.hx > this.limitX) { this.hx = this.limitX; this.vx = 0; }
    const want = this.hx - 440 + this.vx * 0.22; this.camX += (want - this.camX) * Math.min(1, dt * 5); if (this.camX < 0) this.camX = 0;
    // orbs
    for (const o of this.orbs) {
      if (o.got) continue; o.g.y = o.y + Math.sin(time * 0.004 + o.ph) * 6; o.g.setScale(1 + 0.12 * Math.sin(time * 0.008 + o.ph));
      if (Math.abs(o.x - this.hx) < 54 && Math.abs(o.y - (this.hy - 70)) < 90) { o.got = true; o.g.destroy(); G.score += 5; Sound.collect(); this.burst(o.x, o.y, NEON_HEX, 10); this.popup(o.x, o.y - 30, "+5"); refreshHud(); }
    }
    // interaction
    const ent = this.active != null && this.entities[this.active];
    if (this.control && ent && !ent.done) {
      const near = this.hx >= ent.stopX - 170;
      if (ent.auto) { if (this.hx >= ent.stopX - 4) this.trigger(); }
      else {
        this.prompt.setVisible(near); if (near) { this.prompt.setPosition(ent.x, GROUND - ent.top - 20); this.promptLabel.setText(ent.verb.toUpperCase()); }
        if (near && act) { Sound.click(); this.trigger(); }
      }
    } else if (!this.control) this.prompt.setVisible(false);
    if (this.control && this.exitCb && this.hx >= this.exitX - 60) { const cb = this.exitCb; this.exitCb = null; this.setControl(false); cb(); }
  }
}

// ---- gameplay helpers ----
const NEXT = { tablet: (s) => "Read: " + s.tablet.title, npc: (s) => (s.role === "recap" ? "Recap with " : "Learn from ") + s.npc.name, obstacle: () => "Break the seal", match: (s) => "Challenge " + s.opponent.name, mission: () => "Complete the mission", maze: () => "Play Maze Run", shooter: () => "Play Invaders", snake: () => "Play Snake Trail", hill: () => "Play Hill Climb Rally", combat: () => "Survive the ambush", level_test: (s) => (s.practice ? "Practise your weak topics" : "Pass the trial"), mini_boss: (s) => "Defeat " + s.boss.name, final_boss: (s) => "Defeat " + s.boss.name };
function refreshHud() {
  const ch = G.ch || { scenes: [] }, done = G.done || 0, nx = ch.scenes[done];
  UI.hud({ title: ch.title || "", hp: G.hp, maxHp: G.maxHp, score: G.score, done, total: G.total, types: ch.scenes.map((s) => s.type), next: done >= ch.scenes.length ? "Head to the portal" : nx ? NEXT[nx.type](nx) : "", streak: G.streak || 0 });
}
// Returns true when the player ran out of hearts (and revives them).
function hurt(scene, conceptId, silent) {
  if (conceptId) G.mistakes[conceptId] = (G.mistakes[conceptId] || 0) + 1;
  G.chapterMistakes++;
  if (G.shield > 0) { G.shield--; UI.toast("Aegis blocked that mistake"); Sound.click(); refreshHud(); return false; }
  G.hp--; if (!silent) scene.hurtFx();
  if (G.hp <= 0) { G.hp = G.maxHp; G.score = Math.max(0, G.score - 20); UI.toast("Out of hearts: restored (-20 score)"); refreshHud(); return true; }
  refreshHud(); return false;
}
const gain = (n) => { G.score += Math.round(n * A().scoreBonus * ((G.hero && G.hero.mult.score) || 1)); refreshHud(); };

async function playObstacle(scene, ent) {
  const s = ent.s;
  for (;;) {
    const r = await UI.ask(s.question, { explain: A().explainAlways, reveal: false, hint: A().showHints ? s.hint : "" });
    if (r.correct) { gain(10); return; }
    hurt(scene, r.conceptId);
  }
}
async function playMatch(scene, ent) {
  const s = ent.s, n = s.questions.length;
  for (;;) {
    let me = 0, bot = 0;
    for (let i = 0; i < n; i++) {
      const header = UI.bars([{ label: "You", cls: "me", pct: (me / n) * 100, val: me }, { label: s.opponent.name, cls: "foe", pct: (bot / n) * 100, val: bot }]);
      const r = await UI.ask(s.questions[i], { explain: A().explainAlways, header, counter: `Match // question ${i + 1} of ${n}` });
      if (r.correct) { me++; gain(10); } else hurt(scene, r.conceptId, true);
      if (Math.random() < clamp(s.opponent.skill + A().rivalBonus, 0.2, 0.95)) bot++;
    }
    const win = me > bot; const html = `<div class="kicker">Match result</div><h1>${win ? "You win!" : me === bot ? "Draw" : "Defeated"}</h1><p>You ${me} : ${bot} ${UI.esc(s.opponent.name)}</p>`;
    if (win) { gain(50); await UI.card(html); return; }
    if ((await UI.choice(html + `<p class="muted">Win the rematch for a bonus, or move on.</p>`, ["Move on", "Rematch"])) === 0) return;
  }
}
async function playMission(scene, ent) {
  const hooks = { wrong: () => hurt(scene, null) }, m = ent.s.mission;
  m.kind === "order" ? await UI.missionOrder(m, hooks) : await UI.missionPairs(m, hooks); gain(30);
}
async function playTest(scene, ent) {
  const s = ent.s; G.shield = enchanted("aegis") ? 1 : 0;
  for (;;) {
    const qs = UI.shuffle(s.questions); let right = 0, pass = s.practice ? 0 : Math.max(1, s.passMark + A().testPassDelta);
    for (let i = 0; i < qs.length; i++) { const r = await UI.ask(qs[i], { explain: s.practice || A().explainAlways, counter: `${s.practice ? "Practice" : "Trial"} // question ${i + 1} of ${qs.length}` }); r.correct ? right++ : hurt(scene, r.conceptId, true); }
    if (s.practice) { gain(20 + 5 * right); await UI.card(`<div class="kicker">Practice</div><h1>Nice work</h1><p>${right} of ${qs.length} correct. ARCANA picked these from the topics you found hardest, and it keeps score of how they go.</p>`); return; }
    if (right >= pass) { gain(40); await UI.card(`<div class="kicker">Trial</div><h1>Cleared!</h1><p>${right} of ${qs.length} correct.</p>`); return; }
    await UI.card(`<div class="kicker">Trial</div><h1>Almost</h1><p>${right} of ${qs.length} correct. You need ${pass}. Try again.</p>`, "Retry");
  }
}
async function fightBoss(scene, ent, questions, passRatio, label) {
  G.shield = enchanted("aegis") ? 1 : 0;
  const s = ent.s, n = questions.length, need = Math.ceil(n * passRatio);
  await UI.chapterCard({ kicker: label, title: s.boss.name, sub: `Answer ${need} of ${n} correctly to win`, boss: true });
  for (;;) {
    const qs = UI.shuffle(questions); let right = 0, fainted = false; G.hp = G.maxHp; refreshHud(); Fight.begin(scene, ent);
    for (let i = 0; i < n; i++) {
      UI.bossBar(true, { name: s.boss.name, pct: ((n - right) / n) * 100, left: `Question ${i + 1} / ${n}`, right: `Need ${need} correct` });
      const r = await UI.ask(qs[i], { explain: A().explainAlways, dock: true, eliminate: enchanted("insight") ? 1 : 0, counter: `${label} // question ${i + 1} of ${n}` });
      if (r.correct) { right++; gain(15); UI.bossBar(true, { name: s.boss.name, pct: ((n - right) / n) * 100, left: `Question ${i + 1} / ${n}`, right: `Need ${need} correct` }); await Fight.heroAttack(scene, ent); }
      else { const out = hurt(scene, r.conceptId, true); await Fight.enemyAttack(scene, ent); if (out) { fainted = true; break; } }
    }
    UI.bossBar(false);
    if (!fainted && right >= need) {
      gain(100); if (label === "Final boss") G.finalResult = { right, n };
      await Fight.finale(scene, ent); Fight.end(scene, ent);
      await UI.card(`<div class="kicker">Victory</div><h1>${UI.esc(s.boss.name)} destroyed</h1><p>${right} of ${n} correct.</p>`, "Continue"); return;
    }
    if (fainted) await Fight.heroKO(scene);
    Fight.end(scene, ent); ent.root.x = ent.homeEnemy;
    await UI.card(`<div class="kicker">Defeat</div><h1>${UI.esc(s.boss.name)} survived</h1><p>${fainted ? "You ran out of hearts." : `${right} of ${n} correct. You needed ${need}.`} Review and try again.</p>`, "Fight again");
  }
}
async function playCombat(scene, ent) {
  const enc = ent.s.enc;
  await UI.chapterCard({ kicker: enc.title, title: "Hostiles incoming", sub: "J strike  //  K kick (hold to break guards)  //  U launch  //  L throw  //  S guard, tap to parry  //  Shift dodge  //  E execute", boss: true });
  const res = await Combat.run(scene, ent, enc, G.hero || DEFAULT_HERO, A());
  if (window.Arc) res.learned.forEach((f) => Arc.addNote({ kind: "tablet", title: "Shard: " + f.concept, points: [f.text] }));
  Sound.setMood(scene.theme.music); refreshHud();
  if (!res.won) return;
  gain(25 + 10 * res.kills);
  Track.send("/api/hero/earn", { shards: res.shards, kills: res.kills }); setTimeout(loadHero, 800);
  const facts = res.learned.slice(0, 4).map((f) => `<li><b>${UI.esc(f.concept)}</b><span>${UI.esc(f.text)}</span></li>`).join("");
  const bonus = { S: 60, A: 35, B: 15, C: 0 }[res.grade] || 0; if (bonus) gain(bonus);
  const tech = res.techniques.length ? `<p class="muted">Techniques used: ${res.techniques.map((t) => `<span class="techchip">${UI.esc(t)}</span>`).join(" ")}</p>` : "";
  await UI.card(`<div class="kicker">Area cleared</div><div class="gradebig g${res.grade}">${res.grade}</div><h1>+${res.shards} knowledge shards</h1>${tech}<p class="muted">Best combo x${res.maxCombo}${bonus ? ` &middot; grade bonus +${bonus}` : ""}. What you learned${res.learned.length > 4 ? " (all of it is saved in Arc Search, My notes)" : ""}:</p><ul class="facts">${facts}</ul>`, "Continue");
}
const ARCADE_INFO = {
  maze: { name: "Maze Run", sub: "Reach the terminal with the right answer. Dodge the sentries." },
  shooter: { name: "Invaders", sub: "Shoot the block with the right answer. Dodge the return fire." },
  snake: { name: "Snake Trail", sub: "Steer the snake into the right answer to grow. Wrong answers shrink you; walls and your own tail hurt." },
  hill: { name: "Hill Climb Rally", sub: "Drive through the gate with the right answer. Hit the ramp fast to jump over the wrong ones. Land on your wheels and watch your fuel." },
};
async function playArcade(scene, ent) {
  const s = ent.s, key = s.type, info = ARCADE_INFO[key];
  await UI.chapterCard({ kicker: "Arcade level", title: s.title || info.name, sub: info.sub });
  Sound.setMood("volcano"); UI.hideHud();
  await new Promise((res) => {
    const data = { questions: s.questions, seed: (G.chapterIdx + 1) * 5 + 3, ghosts: s.ghosts || 2, maxHp: G.maxHp, getScore: () => G.score, getHp: () => G.hp,
      addScore: (n) => { G.score += n; refreshHud(); }, onRight: () => gain(20), onWrong: (q) => hurt(scene, q.conceptId, true), onHit: () => { UI.flash(); hurt(scene, null, true); },
      done: () => { scene.scene.stop(key); scene.scene.resume("world"); res(); } };
    scene.scene.pause("world"); scene.scene.launch(key, data);
  });
  Sound.setMood(scene.theme.music); refreshHud();
}
const TEACHING = new Set(["npc", "tablet"]);
// world variants: index 0 is the world as painted; later passes through the worlds use another time of day or weather
const VARIANTS = [{}, { tint: 0xffb48a, weather: "embers" }, { tint: 0x8fa6ff, weather: "rain", flash: true }, { tint: 0xd8f0ff, weather: "snow" }, { tint: 0xc9a0ff }, { tint: 0xa8ffb0, weather: "rain" }, { tint: 0xff9a9a, weather: "embers" }];
async function playScene(scene, ch, ent) {
  const s = ent.s; Track.ctx = { kind: s.type, chapter: ch.id };
  const quest = !TEACHING.has(s.type);
  if (quest && window.Arc) Arc.setLocked(true, s.type === "combat" ? "Arc Search unlocks after the fight." : "Arc Search unlocks after this question or quest.");
  try { await runScene(scene, ch, ent, s); } finally { if (quest && window.Arc) Arc.setLocked(false); }
}
async function runScene(scene, ch, ent, s) {
  if (s.type === "npc") await UI.dialogue(s.npc, s.dialogue, { teacherNote: s.teacherNote, keyIdea: s.keyIdea, role: s.role });
  else if (s.type === "tablet") await UI.tablet(s.tablet);
  else if (s.type === "obstacle") await playObstacle(scene, ent);
  else if (s.type === "match") await playMatch(scene, ent);
  else if (s.type === "mission") await playMission(scene, ent);
  else if (s.type === "level_test") await playTest(scene, ent);
  else if (ARCADE_INFO[s.type]) await playArcade(scene, ent);
  else if (s.type === "combat") await playCombat(scene, ent);
  else if (s.type === "mini_boss") await fightBoss(scene, ent, pickQs(questionsOf(ch), clamp(Math.min(s.count, 5) + A().bossCountDelta, 3, 7)), clamp(0.6 + A().bossRatioDelta, 0.4, 0.85), "Mini-boss");
  else if (s.type === "final_boss") await fightBoss(scene, ent, pickQs([...SCRIPT.chapters.flatMap(questionsOf), ...(SCRIPT.finalBoss.extraQuestions || [])], Math.min(s.count, 15)), clamp(s.passMarkRatio + A().bossRatioDelta, 0.5, 0.9), "Final boss");
}

// Personal review: when a topic keeps going wrong, the server writes a short extra lesson + fresh questions from the stored source.
G.reviewed = new Set(); G.reviewJob = null;
async function startReview() {
  try {
    const w = (A().weak || []).filter((x) => x.mastery < 0.5 && !G.reviewed.has(x.id))[0]; if (!w) return null;
    G.reviewed.add(w.id);
    let s = await UI.api("/api/remedial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId: Track.gameId, concept: w.id }) }).catch(() => null);
    for (let i = 0; i < 30 && s && s.status === "running"; i++) { await UI.sleep(2500); s = await UI.api("/api/remedial?game=" + encodeURIComponent(Track.gameId) + "&concept=" + encodeURIComponent(w.id)).catch(() => null); }
    return s && s.status === "done" ? s : null;
  } catch (e) { return null; }
}
async function playChapter(scene, ch, idx, total, at = 0) {
  await Track.flush(); await loadAdapt(); await loadHero();                       // the setup follows the latest performance
  if (ch.id !== "final" && !ch._practiced) {                    // add a practice station for this student's weak topics
    ch._practiced = true;
    const pool = SCRIPT.chapters.flatMap(questionsOf), qs = (A().practice || []).map((id) => pool.find((q) => q.id === id)).filter(Boolean).slice(0, 4);
    if (qs.length >= 2) ch.scenes = [...ch.scenes.slice(0, -1), { type: "level_test", id: ch.id + "-practice", practice: true, questions: qs, passMark: 0 }, ch.scenes[ch.scenes.length - 1]];
  }
  if (ch.id !== "final" && !ch._review && G.reviewJob) {        // the review written while the last chapter ended
    ch._review = true; const rv = await Promise.race([G.reviewJob, UI.sleep(20000).then(() => null)]); G.reviewJob = null;
    if (rv && rv.scenes) { ch.scenes.splice(0, 0, rv.scenes[0]); ch.scenes.splice(ch.scenes.length - 1, 0, rv.scenes[1]); UI.toast("Personal review added: " + rv.concept); }
  }
  if (ch.id !== "final" && !ch._combat) {                       // real-time fights built from this chapter's own material
    ch._combat = true; const sc = ch.scenes, t1 = sc.findIndex((s) => s.type === "tablet"), n1 = t1 >= 0 ? t1 : sc.findIndex((s) => s.type === "npc");
    for (const s of sc) {                                         // older games: lighter question load so teaching leads
      if (s.type === "match" && s.questions.length > 3) s.questions = s.questions.slice(0, 3);
      if (s.type === "level_test" && !s.practice && s.questions.length > 4) { s.questions = s.questions.slice(0, 4); s.passMark = Math.min(s.passMark, 3); }
    }
    if (sc.filter((s) => s.type === "obstacle").length > 1) { const i2 = sc.map((s) => s.type).lastIndexOf("obstacle"); sc.splice(i2, 1); }
    // older games: make sure this chapter has its mini-games (short games get two per chapter so every game has all four)
    const KINDS = ["maze", "snake", "hill", "shooter"], nch = (SCRIPT.chapters || []).length || 1;
    const want = nch <= 2 ? [KINDS[(2 * idx) % 4], KINDS[(2 * idx + 1) % 4]] : [KINDS[idx % 4]];
    const qpool = sc.flatMap((s) => s.type === "obstacle" ? [s.question] : ["match", "level_test", ...KINDS].includes(s.type) ? s.questions || [] : []).filter(Boolean);
    const at2 = () => { const k = sc.findIndex((s) => s.type === "level_test" || s.type === "mini_boss"); return k >= 0 ? k : sc.length; };
    want.forEach((k, n) => { if (!sc.some((s) => s.type === k) && qpool.length) sc.splice(at2(), 0, { type: k, id: ch.id + "-a" + n, title: ARCADE_INFO[k].name, questions: qpool.slice(n * 3, n * 3 + 3).length ? qpool.slice(n * 3, n * 3 + 3) : qpool.slice(0, 3), ghosts: 2 }); });
    const e1 = { type: "combat", id: ch.id + "-c1", enc: Combat.plan(ch, 0, A()) }, e2 = { type: "combat", id: ch.id + "-c2", enc: Combat.plan(ch, 1, A()) };
    sc.splice(Math.max(1, n1 + 1), 0, e1); sc.splice(sc.length - 1, 0, e2);
  }
  G.ch = ch; G.done = at; G.total = ch.scenes.length; G.chapterMistakes = 0; G.chapterIdx = idx;
  await UI.wipe(async () => { UI.hideTitle(); scene.build(ch); if (at) { scene.entities.slice(0, at).forEach((e) => { e.hidden = true; e.root.setVisible(false); }); scene.hx = scene.entities[at].stopX - 420; scene.camX = scene.hx - 440; scene.orbs.forEach((o) => (o.got = true, o.g.setVisible(false))); } refreshHud(); });
  await UI.chapterCard({ kicker: ch.id === "final" ? "Final stage" : `Chapter ${idx + 1} of ${total - 1}`, title: ch.title, sub: ch.goal });
  if (idx === 0) UI.hint(true, `<span><span class="kc">A</span><span class="kc">D</span>Move</span><span><span class="kc">W</span>Jump</span><span><span class="kc">SHIFT</span>Sprint</span><span><span class="kc">E</span>Interact</span>`);
  for (let i = at; i < ch.scenes.length; i++) {
    await scene.waitInteract(i); const ent = scene.entities[i];
    await playScene(scene, ch, ent); scene.finish(ent); G.done = i + 1; refreshHud(); await UI.sleep(450);
  }
  await scene.waitExit();
  if (ch.id === "final") return;
  const stars = G.chapterMistakes === 0 ? 3 : G.chapterMistakes <= 3 ? 2 : 1;
  await Track.flush(); await loadAdapt(); G.reviewJob = startReview();                 // written in the background while the chapter summary is read
  Sound.win(); await UI.card(`<div class="kicker">Chapter complete</div><h1>${UI.esc(ch.title)}</h1><div class="stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div><p>Score ${G.score}</p>`, "Next zone");
}

async function ending() {
  UI.hideHud(); const names = {}; SCRIPT.chapters.forEach((c) => c.concepts.forEach((k) => (names[k.id] = k.name)));
  const weak = Object.entries(G.mistakes).sort((a, b) => b[1] - a[1]).slice(0, 4), fr = G.finalResult; Sound.win(); await Track.flush();
  for (;;) {
    const labels = G.missed.length ? [`Review ${G.missed.length} missed`, "Play again", "Roadmap"] : ["Play again", "Roadmap"];
    const pick = labels[await UI.choice(`<div class="kicker">Quest complete</div><h1>${UI.esc(SCRIPT.title)} mastered</h1><p>Total score <mark>${G.score}</mark>${fr ? ` // Final boss ${fr.right}/${fr.n}` : ""}</p>
      ${weak.length ? `<p class="muted">Topics ARCANA will practise with you next</p><ul class="weak">${weak.map(([id, c]) => `<li>${UI.esc(names[id] || id)} <span class="muted">(${c} miss${c > 1 ? "es" : ""})</span></li>`).join("")}</ul>` : "<p>Flawless run. No weak topics.</p>"}`, labels)];
    if (pick === "Roadmap") { location.href = "/"; return; }
    if (pick === "Play again") break;
    await UI.card(`<div class="kicker">Revision</div><h1>Questions to revisit</h1><div class="review">${G.missed.map((q) => `<div class="rv"><b>${UI.esc(q.prompt)}</b><div class="ans">${UI.esc(q.options[q.correctIndex])}</div>${q.explanation ? `<div class="muted">${UI.esc(q.explanation)}</div>` : ""}</div>`).join("")}</div>`, "Back", "modal", "wide");
  }
  location.reload();
}

// ---- uploaded games: chapters arrive while the player is already playing ----
async function syncLive() {
  const j = await UI.api("/api/jobs/" + LIVE);
  if (j.status === "error") { await UI.card(`<div class="kicker">Generation stopped</div><h1>Could not finish the game</h1><p>${UI.esc(j.error || "Unknown error")}</p>`, "Back to menu"); location.reload(); await new Promise(() => {}); }
  if (j.script) j.script.chapters.forEach((c, n) => (SCRIPT.chapters[n] = c));
  return j;
}
async function waitFor(ready, label) {
  if (!LIVE) return;
  let j = await syncLive();
  if (ready(j)) return;
  UI.show(`<div class="kicker">Please wait</div><h1>${UI.esc(label)}</h1><div class="pbar"><i id="wf" style="width:${j.pct}%"></i></div><p class="muted" id="wm">${UI.esc(j.message)}</p>`, "modal");
  while (!ready(j)) { await UI.sleep(1200); j = await syncLive(); const f = document.getElementById("wf"); if (f) f.style.width = j.pct + "%"; const m = document.getElementById("wm"); if (m) m.textContent = j.message; }
  UI.hide(); await UI.sleep(250);
}
const ensureChapter = async (i) => { if (!SCRIPT.chapters[i]) await waitFor((j) => !!SCRIPT.chapters[i], `Forging chapter ${i + 1}...`); return SCRIPT.chapters[i]; };
const ensureDone = () => waitFor((j) => j.status === "done", "Preparing the final boss...");

async function main(scene) {
  scene.startTitle();
  let me = null; try { me = (await UI.api("/api/me")).user; } catch (e) { /* offline */ }
  const qp = new URLSearchParams(location.search), jid = qp.get("job"), gid = jid || qp.get("game");
  if (!me || !gid) { location.href = "/"; return; }                   // log in on the dashboard first
  G.name = me.username; G.gender = me.gender; G.gameId = gid; scene.previewHero(G.gender);
  let resume = null;
  try {
    if (jid) { const j = await UI.api("/api/jobs/" + jid); if (!j.script) throw new Error("This game is not ready yet."); SCRIPT = j.script; SCRIPT.chapters = SCRIPT.chapters.slice(); LIVE = j.status === "done" ? null : jid; }
    else SCRIPT = await UI.api("/api/scripts/" + encodeURIComponent(gid));
    resume = (await UI.api("/api/progress?game=" + encodeURIComponent(gid))).progress;
  } catch (e) { await UI.card(`<div class="kicker">Cannot open</div><h1>Game unavailable</h1><p>${UI.esc(e.message)}</p>`, "Back to dashboard"); location.href = "/"; return; }
  if (resume && resume.finished) resume = null;                        // a finished game starts over; mastery is kept
  if (resume) G.score = resume.score || 0;
  await UI.title(SCRIPT, { name: me.username, resume });
  UI.onAnswer = (ok, q, x) => { Track.add(q, ok, x); if (!ok && q && !G.missed.find((m) => m.id === q.id)) G.missed.push(q); G.streak = ok ? (G.streak || 0) + 1 : 0; if (ok && G.streak >= 3) UI.combo(G.streak); refreshHud(); };
  UI.onReport = (q) => { Track.send("/api/report", { gameId: Track.gameId, qid: q.id, prompt: q.prompt }); UI.toast("Thanks. It is removed from your practice and we will check it."); };
  UI.onLearn = (n) => window.Arc && Arc.addNote(n);
  if (window.Arc) Arc.mount({ anchor: document.getElementById("frame"), gameId: jid ? "" : gid, getContext: () => ({ game: SCRIPT.title, chapter: G.ch && G.ch.title, concepts: ((G.ch && G.ch.concepts) || []).map((c) => c.name) }),
    onOpen: () => { scene.input.keyboard.enabled = false; scene.input.keyboard.disableGlobalCapture(); scene.vx = 0; },
    onClose: () => { scene.input.keyboard.enabled = true; scene.input.keyboard.enableGlobalCapture(); } });
  UI.hideTitle(); scene.setHero(G.gender); UI.setPlayer(me.username, G.gender); Track.start(gid);
  let total = SCRIPT.chapters.length;
  if (LIVE) { const j = await UI.api("/api/jobs/" + LIVE); total = j.total || total; if (j.status === "done") LIVE = null; }
  const c0 = +qp.get("ch") || (resume ? Math.min(resume.chapter, total) : 0);   // dev shortcuts: ?ch=1&at=7
  if (window.Arc) for (const ch of SCRIPT.chapters.slice(0, c0)) for (const s of ch.scenes) {   // notes from chapters already played
    if (s.type === "npc") Arc.addNote({ kind: "lesson", from: s.npc.name, role: s.role, lines: s.dialogue.map((l) => l.text), keyIdea: s.keyIdea });
    if (s.type === "tablet") Arc.addNote({ kind: "tablet", ...s.tablet });
  }
  for (let i = c0; i <= total; i++) {
    let ch;
    if (i < total) ch = await ensureChapter(i);
    else { await ensureDone(); const fb = SCRIPT.finalBoss; ch = { id: "final", title: fb.title, goal: fb.goal, theme: fb.theme, concepts: [], scenes: [{ type: "final_boss", id: "fin", boss: fb.boss, count: fb.count, passMarkRatio: fb.passMarkRatio }] }; }
    await playChapter(scene, ch, i, total + 1, i === c0 ? +qp.get("at") || 0 : 0);
    await Track.progress(i + 1, i === total);
  }
  await ending();
}

// phones: one tap goes full screen and turns the game sideways (Android; on iPhone the player rotates by hand)
async function goLandscape() {
  try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: "hide" }); } catch (e) {}
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock("landscape"); } catch (e) {}
}
{ const b = document.getElementById("gofull"); if (b) b.onclick = goLandscape; }
if (matchMedia("(pointer: coarse)").matches) {
  const app = matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
  if (app && screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});   // installed app: the game turns sideways on its own
  addEventListener("pointerdown", () => { if (!document.fullscreenElement) goLandscape(); }, { once: true });     // browser: the first tap goes full screen sideways
}

// touch controls
if (matchMedia("(pointer: coarse)").matches) {
  UI.touch(true);
  document.querySelectorAll("#touch button").forEach((b) => {
    const k = b.dataset.k, set = (v) => { if (k === "left") V.left = v; else if (k === "right") V.right = v; else if (v && k === "jump") V.jump = true; else if (v && k === "act") V.act = true; };
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); set(true); }); ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => set(false)));
  });
}

(async () => {
  try { await Promise.race([Promise.all([document.fonts.load('900 20px Orbitron'), document.fonts.load('700 20px Rajdhani')]), new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
  try { await Promise.race([loadHero(), new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}   // the ranger's suit and trim
  const game = new Phaser.Game({ type: Phaser.AUTO, parent: "game", width: W, height: H, backgroundColor: "#000", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [World, MazeScene, ShooterScene, SnakeScene, HillScene], render: { antialias: true, antialiasGL: !Art.LOW, powerPreference: "high-performance" }, fps: { target: 60, limit: 60, smoothStep: true }, disableContextMenu: true });
  window.__arcana = { game, G, V };
})();
