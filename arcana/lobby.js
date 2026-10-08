// The hub's living background: a painted world scrolls slowly behind the menu while the student's ranger trains on a neon platform.
const Lobby = (() => {
  const { W, H, GROUND } = Art;
  let game = null, sc = null, want = { theme: "neon_grid", gender: "m", look: null };

  class LobbyScene extends Phaser.Scene {
    constructor() { super("lobby"); }
    create() {
      sc = this; this.camX = 0; this.objs = []; this.layers = []; this.timer = 2.2; this.busy = false; this.heroX = W * 0.6; this.targetX = W * 0.6;
      People.props(this);
      this.applyTheme(want.theme); this.applyHero(want.gender);
      this.cameras.main.postFX && this.renderer.type === Phaser.WEBGL && (this.cameras.main.postFX.addVignette(0.5, 0.5, 0.95, 0.35), this.cameras.main.postFX.addBloom(0xffffff, 1, 1, 1.0, 0.6, 4));
    }
    applyTheme(name) {
      const th = Art.buildTheme(this, name); this.objs.forEach((o) => o.destroy()); this.objs = []; this.layers = [];
      const add = (o) => (this.objs.push(o), o);
      add(this.add.image(0, 0, th.sky).setOrigin(0).setDepth(0));
      th.layers.forEach((L) => this.layers.push({ f: L.f * 0.35, o: add(this.add.tileSprite(0, Art.LAYER_BOTTOM - L.h, W, L.h, L.key).setOrigin(0).setDepth(L.d)) }));
      this.layers.push({ f: 0.6, o: add(this.add.tileSprite(0, GROUND, W, H - GROUND, th.ground).setOrigin(0).setDepth(6)) });
      this.layers.push({ f: 0.9, o: add(this.add.tileSprite(0, H - 260, W, 260, th.fg).setOrigin(0).setDepth(20)) });
      const tint = Phaser.Display.Color.HexStringToColor(th.rays).color, fog = Phaser.Display.Color.HexStringToColor(th.fog).color;
      const rays = add(this.add.tileSprite(0, 0, W, H, "rays").setOrigin(0).setDepth(8).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setAlpha(0.5)); this.layers.push({ f: 0.1, o: rays });
      this.tweens.add({ targets: rays, alpha: 0.2, duration: 3600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.fogs = [add(this.add.tileSprite(0, GROUND - 200, W, 260, "fogbank").setOrigin(0).setDepth(5.5).setTint(fog).setAlpha(0.35)), add(this.add.tileSprite(0, GROUND - 120, W, 260, "fogbank").setOrigin(0).setDepth(19).setTint(fog).setAlpha(0.2))];
      for (const d of th.drift || []) { const t = add(this.add.tileSprite(0, d.y, W, d.h, d.key).setOrigin(0).setDepth(d.d).setAlpha(d.alpha)); if (d.add) t.setBlendMode(Phaser.BlendModes.ADD); this.layers.push({ f: d.f * 0.3, o: t, speed: d.speed }); }
      if (this.textures.exists("spark")) {
        const P = th.particles || { life: [3000, 6000], vy: [-30, -10], vx: [-10, 10], color: [0x39ff14] };
        add(this.add.particles(0, 0, "spark", { x: { min: 0, max: W }, y: { min: 0, max: H }, lifespan: { min: 3500, max: 7000 }, speedY: { min: -26, max: -8 }, speedX: { min: -8, max: 8 }, scale: { start: 0.35, end: 0 }, alpha: { start: 0.7, end: 0 }, blendMode: "ADD", frequency: 120, tint: Phaser.Display.Color.HexStringToColor(th.accent || "#39ff14").color }).setDepth(21));
      }
      // platform under the hero
      const g = add(this.add.graphics().setDepth(7)); g.fillStyle(0x000000, 0.5).fillEllipse(this.heroX, GROUND + 18, 420, 46); g.lineStyle(3, 0x39ff14, 0.9).strokeEllipse(this.heroX, GROUND + 14, 380, 38); g.lineStyle(1, 0x39ff14, 0.5).strokeEllipse(this.heroX, GROUND + 14, 300, 28);
      const glow = add(this.add.image(this.heroX, GROUND + 6, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0x39ff14).setScale(7, 1.4).setAlpha(0.25).setDepth(7)); this.tweens.add({ targets: glow, alpha: 0.5, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    }
    applyHero(gender) {
      if (this.rig) this.rig.root.destroy(); People.dress(want.look);
      this.rig = People.make(this, gender === "f" ? "hero_f" : "hero_m", 1.85); this.rig.guard = true; this.rig.root.setDepth(10);
    }
    async demo() {
      if (this.busy || !this.rig) return; this.busy = true; const r = this.rig, pickOne = (a) => a[Math.floor(Math.random() * a.length)];
      const seq = pickOne([["jab", "cross", "uppercut"], ["kick", "spinkick"], ["cast"], ["jab", "jab", "cross", "kick"]]);
      for (const m of seq) { await r.play(m, {}); await new Promise((res) => setTimeout(res, 60)); }
      this.busy = false; this.timer = 3.5 + Math.random() * 3;
    }
    update(time, delta) {
      const dt = Math.min(delta / 1000, 0.05); this.camX += 16 * dt;
      for (const L of this.layers) L.o.tilePositionX = this.camX * L.f + (L.speed ? time * 0.001 * L.speed : 0);
      (this.fogs || []).forEach((f, i) => (f.tilePositionX = this.camX * (0.4 + i * 0.5) + time * 0.004 * (i ? -1 : 1)));
      if (this.rig) {
        this.heroX += (this.targetX - this.heroX) * Math.min(1, dt * 3);
        this.rig.root.setPosition(this.heroX, GROUND + 6).setScale(-this.rig.scale, this.rig.scale); this.rig.update(dt, time, { vx: 0, vy: 0, grounded: true });
        this.timer -= dt; if (this.timer <= 0 && !this.busy) this.demo();
      }
    }
  }

  function start(parent, opts) {
    want = { ...want, ...opts };
    if (game) { sc && (sc.applyHero(want.gender)); return; }
    game = new Phaser.Game({ type: Phaser.AUTO, parent, width: W, height: H, transparent: false, backgroundColor: "#020503", scale: { mode: Phaser.Scale.ENVELOP, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [LobbyScene], render: { antialias: true }, audio: { noAudio: true } });
  }
  function celebrate() {                                   // level up / reward: burst of light and a victory pose
    if (!sc || !sc.rig) return; const s = sc, x = s.heroX, y = GROUND - 120, col = Phaser.Display.Color.HexStringToColor(People.SPECS.hero_m.glow || "#39ff14").color;
    const p = s.add.particles(0, 0, "spark", { lifespan: 1400, speed: { min: 120, max: 520 }, scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: "ADD", tint: [col, 0xffffff, 0xffd36a], emitting: false }).setDepth(30);
    p.explode(90, x, y); setTimeout(() => p.explode(60, x, y - 60), 250); setTimeout(() => p.destroy(), 2200);
    const ring = s.add.circle(x, GROUND + 6, 30).setStrokeStyle(6, col, 1).setDepth(9); s.tweens.add({ targets: ring, scaleX: 9, scaleY: 1.6, alpha: 0, duration: 900, onComplete: () => ring.destroy() });
    s.cameras.main.flash(250, 255, 255, 255); s.busy = true; s.rig.play("victory", {}); setTimeout(() => { if (s.rig) { s.rig.release && s.rig.release(); s.rig.recover && s.rig.recover(); } s.busy = false; }, 2200);
  }
  function setLook(look) { want.look = look; if (sc) sc.applyHero(want.gender); }
  function side(x) { if (sc) sc.targetX = x * W; }        // slide the hero left/right (0..1) so panels never cover them
  function setGender(g) { want.gender = g; if (sc) sc.applyHero(g); }
  function stop() { if (game) { game.destroy(true); game = null; sc = null; } }
  return { start, side, setGender, setLook, celebrate, stop, get ready() { return !!sc; }, get game() { return game; } };
})();
window.Lobby = Lobby;
