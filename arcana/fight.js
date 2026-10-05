// Fight choreography: real animated combat between the hero rig and an enemy rig.
// Correct answer = hero attacks. Wrong answer = enemy attacks. Win = cinematic finisher + explosion.
const Fight = (() => {
  const GROUND = Art.GROUND, pick = (a) => a[Math.floor(Math.random() * a.length)], hex = (s) => Phaser.Display.Color.HexStringToColor(s).color;
  const COMBOS = [["jab", "cross", "kick"], ["jab", "jab", "uppercut"], ["cross", "spinkick"], ["kick", "jab", "cross"], ["jab", "cross", "uppercut"]];
  const HERO = hex(People.NEON);

  function hitstop(scene, ms) { if (scene.frozen) return; scene.frozen = true; scene.tweens.pauseAll(); setTimeout(() => { scene.frozen = false; scene.tweens.resumeAll(); }, ms); }
  function slowmo(scene, f, ms) { scene.tscale = f; scene.tweens.timeScale = f; scene.time.timeScale = f; setTimeout(() => { scene.tscale = 1; scene.tweens.timeScale = 1; scene.time.timeScale = 1; }, ms); }
  function ring(scene, x, y, col, size = 1, flat = false) {
    const g = scene.add.circle(x, y, 12, 0x000000, 0).setStrokeStyle(5, col, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(17);
    if (flat) g.scaleY = 0.3; scene.tweens.add({ targets: g, scaleX: 7 * size, scaleY: (flat ? 0.3 : 1) * 7 * size, alpha: 0, duration: 420, ease: "Cubic.out", onComplete: () => g.destroy() });
  }
  function impact(scene, x, y, col, size = 1) {
    scene.burst(x, y, col, Math.round(22 * size)); scene.burst(x, y, 0xffffff, 8); ring(scene, x, y, col, size * 0.8);
    const f = scene.add.image(x, y, "spark").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffffff).setScale(1.5 * size).setDepth(17);
    scene.tweens.add({ targets: f, scale: 6 * size, alpha: 0, duration: 220, onComplete: () => f.destroy() });
    const sl = scene.add.rectangle(x, y, 150 * size, 5, 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(17).setAngle(Phaser.Math.Between(-40, 40));
    scene.tweens.add({ targets: sl, scaleX: 0.1, alpha: 0, duration: 180, onComplete: () => sl.destroy() });
  }
  function shockwave(scene, x, col) { ring(scene, x, GROUND + 4, col, 1.6, true); scene.cameras.main.shake(220, 0.012); }
  const foePos = (ent) => ({ x: ent.root.x - 36 * ent.sc, y: ent.root.y - 108 * ent.sc });

  function begin(scene, ent) {
    scene.fighting = true; ent.home = scene.hx; ent.homeEnemy = ent.root.x; ent.sc = ent.rig.scale; ent.reach = 90 + 46 * ent.sc;
    scene.fightMid = (ent.home + ent.homeEnemy) / 2; scene.hero.guard = true; ent.rig.guard = true;
  }
  function end(scene, ent) {
    scene.fighting = false; scene.fightMid = null; scene.hero.guard = false; scene.hero.release(); scene.hero.recover(); scene.hy = GROUND; scene.vy = 0; scene.hx = ent.home; if (ent.rig) ent.rig.guard = false;
  }

  // ---- hero hits the enemy (correct answer) ----
  function strikeHit(scene, ent, mv) {
    const big = mv === "uppercut" || mv === "spinkick" || mv === "kick", p = foePos(ent);
    impact(scene, p.x, p.y, HERO, big ? 1.5 : 1); ent.rig.play("hurt"); ent.rig.flash(); Sound.hit();
    scene.tweens.add({ targets: ent.root, x: ent.root.x + (big ? 38 : 18), duration: 130, ease: "Cubic.out" });
    scene.cameras.main.shake(big ? 170 : 100, big ? 0.009 : 0.005); hitstop(scene, big ? 95 : 55);
  }
  async function heroAttack(scene, ent) {
    const h = scene.hero, style = ent.s.boss.fight || "martial";
    if (style === "magic") return magicHero(scene, ent, 3);
    Sound.whoosh(); h.hold("dash");
    await scene.tw({ targets: scene, hx: ent.homeEnemy - ent.reach, duration: 210, ease: "Cubic.out" }); h.release();
    for (const mv of pick(COMBOS)) await h.play(mv, { hit: () => strikeHit(scene, ent, mv) });
    h.hold("back"); await Promise.all([scene.tw({ targets: scene, hx: ent.home, duration: 260, ease: "Cubic.inOut" }), scene.tw({ targets: ent.root, x: ent.homeEnemy, duration: 320, ease: "Cubic.inOut" })]); h.release();
  }
  async function magicHero(scene, ent, n) {
    const h = scene.hero; let done = Promise.resolve(); Sound.cast(); h.glowPulse(1);
    await h.play("cast", { hit: () => {
      const o = h.orbWorld(), jobs = [];
      for (let i = 0; i < n; i++) jobs.push(new Promise((res) => setTimeout(() => { const p = foePos(ent); scene.shoot(o.x, o.y, p.x + Phaser.Math.Between(-20, 20), p.y + Phaser.Math.Between(-60, 60), HERO).then(() => { impact(scene, p.x, p.y, HERO, 1.1); ent.rig.play("hurt"); ent.rig.flash(); Sound.hit(); scene.cameras.main.shake(110, 0.006); res(); }); }, i * 120)));
      done = Promise.all(jobs);
    } });
    await done; h.glowPulse(0);
  }

  // ---- enemy hits the hero (wrong answer) ----
  function heroHit(scene, ent, mv) {
    const x = scene.hx + 30, y = GROUND - 110, col = hex(People.SPECS[ent.rig.id].glow);
    impact(scene, x, y, col, 1.3); scene.hero.play("hurt"); scene.hero.flash(); Sound.hit(); UI.flash();
    scene.tweens.add({ targets: scene, hx: scene.hx - 30, duration: 120, ease: "Cubic.out" }); scene.cameras.main.shake(190, 0.011); hitstop(scene, 85);
  }
  async function enemyAttack(scene, ent) {
    const e = ent.rig, style = ent.s.boss.fight || "martial", col = hex(People.SPECS[e.id].glow);
    if (style === "magic") {
      let done = Promise.resolve(); Sound.cast();
      await e.play("cast", { hit: () => { const o = e.orbWorld(); done = scene.shoot(o.x, o.y, scene.hx, GROUND - 100, col, 1.4).then(() => heroHit(scene, ent, "cast")); } }); await done; return;
    }
    Sound.whoosh(); e.hold("dash");
    await scene.tw({ targets: ent.root, x: scene.hx + ent.reach, duration: 240, ease: "Cubic.out" }); e.release();
    const mv = ent.heavy ? "slam" : pick(["jab", "cross", "kick", "uppercut"]);
    await e.play(mv, { hit: () => { heroHit(scene, ent, mv); if (mv === "slam") shockwave(scene, ent.root.x - 100, col); } });
    e.hold("back"); await Promise.all([scene.tw({ targets: ent.root, x: ent.homeEnemy, duration: 320, ease: "Cubic.inOut" }), scene.tw({ targets: scene, hx: ent.home, duration: 300, ease: "Cubic.inOut" })]); e.release();
  }

  // ---- finisher: charge, launcher, air kick, plasma beam, explosion ----
  function explode(scene, ent) {
    const x = ent.root.x, y = ent.root.y - 100 * ent.sc, S = People.SPECS[ent.rig.id], col = hex(S.glow);
    scene.cameras.main.flash(380, 255, 255, 255); scene.cameras.main.shake(700, 0.022); Sound.boss(); Sound.hit();
    for (let i = 0; i < 4; i++) setTimeout(() => ring(scene, x, y, i % 2 ? col : 0xffffff, 1.6 + i * 0.5), i * 110);
    scene.burst(x, y, 0xffffff, 70); scene.burst(x, y, col, 90); scene.burst(x, y, 0xffa63a, 60);
    for (const img of ent.rig.all) {
      const m = img.getWorldTransformMatrix(), r = scene.add.rectangle(m.tx, m.ty, Phaser.Math.Between(10, 22), Phaser.Math.Between(14, 30), hex(Math.random() > 0.5 ? S.plate : S.suit2)).setDepth(18).setStrokeStyle(2, col);
      scene.tweens.add({ targets: r, x: m.tx + Phaser.Math.Between(-420, 420), y: Math.min(GROUND + 6, m.ty + Phaser.Math.Between(-320, 40)), angle: Phaser.Math.Between(-720, 720), duration: Phaser.Math.Between(700, 1200), ease: "Quad.out", onComplete: () => scene.tweens.add({ targets: r, alpha: 0, duration: 500, onComplete: () => r.destroy() }) });
    }
    ent.root.setVisible(false); ent.exploded = true;
  }
  async function finale(scene, ent) {
    const h = scene.hero, e = ent.rig; h.hold(null);
    Sound.cast(); h.glowPulse(1.2); slowmo(scene, 0.55, 1400);
    await h.play("charge"); scene.cameras.main.shake(250, 0.006);
    h.hold("dash"); await scene.tw({ targets: scene, hx: ent.homeEnemy - ent.reach, duration: 170, ease: "Cubic.out" }); h.release();
    await h.play("uppercut", { hit: () => {
      const p = foePos(ent); impact(scene, p.x, p.y, HERO, 2); e.play("hurt"); e.flash(); Sound.hit(); hitstop(scene, 130); scene.cameras.main.shake(260, 0.014);
      scene.tweens.add({ targets: ent.root, y: ent.root.y - 250, x: ent.root.x + 50, angle: 24, duration: 520, ease: "Cubic.out" });
      scene.tweens.add({ targets: scene, hy: GROUND - 210, hx: scene.hx + 40, duration: 420, ease: "Cubic.out" });
    } });
    h.hold("air");
    await h.play("kick", { hit: () => { const p = foePos(ent); impact(scene, p.x, p.y, HERO, 1.8); e.play("hurt"); Sound.hit(); hitstop(scene, 110); scene.cameras.main.shake(240, 0.012); } });
    h.release(); Sound.cast();
    let beam = Promise.resolve();
    await h.play("cast", { hit: () => { const o = h.orbWorld(), p = foePos(ent); beam = scene.shoot(o.x, o.y, p.x, p.y, HERO, 3.2, 300); } });
    await beam; explode(scene, ent); h.glowPulse(0);
    await scene.tw({ targets: scene, hy: GROUND, duration: 360, ease: "Bounce.out" }); await scene.tw({ targets: scene, hx: ent.home, duration: 300, ease: "Cubic.inOut" });
    h.play("victory"); await new Promise((r) => setTimeout(r, 900));
  }
  async function heroKO(scene) { Sound.wrong(); scene.hero.flash(); await scene.hero.play("ko"); await new Promise((r) => setTimeout(r, 600)); scene.hero.recover(); }

  return { begin, end, heroAttack, enemyAttack, finale, heroKO, impact, shockwave, magicHero };
})();
