// Retro arcade levels: a Pac-Man style maze and a Space-Invaders style shooter.
// Both teach through the same question data as the rest of the game.
const ARC = { W: 1280, H: 720, G: 0x39ff14, FONT: '"Orbitron", sans-serif', BODY: '"Rajdhani", sans-serif' };
const ARC_COLORS = [0x22d3ee, 0xe879f9, 0xffb347, 0xb6ff5a];
const ARC_LETTERS = ["A", "B", "C", "D"];
const arcRng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const arcShuffle = (a, r = Math.random) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hexStr = (n) => "#" + n.toString(16).padStart(6, "0");

class ArcadeBase extends Phaser.Scene {
  backdrop() {
    const { W, H, G } = ARC, g = this.add.graphics();
    g.fillStyle(0x000000, 1).fillRect(0, 0, W, H);
    g.fillGradientStyle(0x001a06, 0x001a06, 0x000000, 0x000000, 0.9).fillRect(0, 0, W, H);
    g.lineStyle(1, G, 0.07); for (let x = 0; x < W; x += 40) g.lineBetween(x, 0, x, H); for (let y = 0; y < H; y += 40) g.lineBetween(0, y, W, y);
    this.add.particles(0, 0, "spark", { x: { min: 0, max: W }, y: { min: 0, max: H }, lifespan: 5000, speedY: { min: -14, max: -4 }, scale: { start: 0.25, end: 0 }, alpha: { start: 0.7, end: 0 }, tint: [G, 0xb6ff5a], blendMode: "ADD", frequency: 140 });
  }
  header(kicker, question) {
    const { W, FONT, BODY } = ARC;
    this.add.text(40, 22, kicker, { fontFamily: FONT, fontSize: "16px", color: "#39ff14", letterSpacing: 6 }).setAlpha(0.9);
    this.qText = this.add.text(W / 2, 62, question, { fontFamily: BODY, fontSize: "26px", fontStyle: "700", color: "#e8ffe0", align: "center", wordWrap: { width: 980 } }).setOrigin(0.5, 0.5);
    this.scoreText = this.add.text(W - 40, 22, "", { fontFamily: FONT, fontSize: "20px", color: "#39ff14" }).setOrigin(1, 0);
  }
  setQuestion(t) { this.qText.setText(t); this.tweens.add({ targets: this.qText, alpha: { from: 0, to: 1 }, duration: 300 }); }
  banner(text, color = "#39ff14", ms = 900) {
    const t = this.add.text(ARC.W / 2, ARC.H / 2, text, { fontFamily: ARC.FONT, fontSize: "64px", fontStyle: "900", color, stroke: "#000", strokeThickness: 8 }).setOrigin(0.5).setDepth(50).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, scale: { from: 0.6, to: 1 }, duration: 220, yoyo: false, onComplete: () => this.tweens.add({ targets: t, alpha: 0, delay: ms, duration: 260, onComplete: () => t.destroy() }) });
  }
  burst(x, y, tint, n = 20) {
    if (!this._b) this._b = this.add.particles(0, 0, "spark", { lifespan: 650, speed: { min: 80, max: 320 }, scale: { start: 0.55, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: "ADD", emitting: false, tint: { onEmit: () => this._bt } }).setDepth(40);
    this._bt = tint; this._b.explode(n, x, y);
  }
  finish(result) { if (this.finished) return; this.finished = true; this.time.delayedCall(700, () => this.d.done(result)); }
  syncScore() { this.scoreText.setText("SCORE " + String(this.d.getScore()).padStart(5, "0")); }
}

// ======================================================================= MAZE RUN
class MazeScene extends ArcadeBase {
  constructor() { super("maze"); }
  init(d) { this.d = d; this.finished = false; }
  create() {
    const { W, H, G } = ARC; this.backdrop(); this.header("ARCADE // MAZE RUN", ""); this.T = 40; this.CW = 9; this.CH = 7; this.COLS = 19; this.ROWS = 15; this.ox = 40; this.oy = 110;
    this.k = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT"); this.input.keyboard.addCapture("UP,DOWN,LEFT,RIGHT,SPACE");
    this.input.on("pointerdown", (p) => (this.sw = { x: p.x, y: p.y })); this.input.on("pointerup", (p) => { if (!this.sw) return; const dx = p.x - this.sw.x, dy = p.y - this.sw.y; if (Math.hypot(dx, dy) > 30) this.want = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]; this.sw = null; });
    this.score = 0; this.round = 0; this.right = 0; this.wrong = 0; this.build(); this.walls = this.add.graphics(); this.drawWalls(); this.dotG = this.add.graphics(); this.drawDots();
    this.actors = this.add.graphics().setDepth(10); this.nodeG = this.add.graphics().setDepth(5); this.legend = [];
    this.panel = this.add.graphics(); this.drawPanel(); this.startRound(); this.syncScore();
  }
  // ---- maze generation (seeded DFS with loops) ----
  build() {
    const r = arcRng((this.d.seed || 7) * 977 + 13), { COLS, ROWS, CW, CH } = this;
    const g = Array.from({ length: ROWS }, () => Array(COLS).fill("#")), seen = Array.from({ length: CH }, () => Array(CW).fill(false)), st = [[Math.floor(CW / 2), Math.floor(CH / 2)]];
    const open = (cx, cy) => (g[cy * 2 + 1][cx * 2 + 1] = " "); open(st[0][0], st[0][1]); seen[st[0][1]][st[0][0]] = true;
    while (st.length) {
      const [cx, cy] = st[st.length - 1], nb = arcShuffle([[1, 0], [-1, 0], [0, 1], [0, -1]], r).filter(([dx, dy]) => cx + dx >= 0 && cx + dx < CW && cy + dy >= 0 && cy + dy < CH && !seen[cy + dy][cx + dx]);
      if (!nb.length) { st.pop(); continue; }
      const [dx, dy] = nb[0]; seen[cy + dy][cx + dx] = true; g[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = " "; open(cx + dx, cy + dy); st.push([cx + dx, cy + dy]);
    }
    for (let n = 0, tries = 0; n < 24 && tries < 400; tries++) { const x = 1 + Math.floor(r() * (COLS - 2)), y = 1 + Math.floor(r() * (ROWS - 2)); if (g[y][x] === "#" && ((x % 2 === 0 && y % 2 === 1 && g[y][x - 1] === " " && g[y][x + 1] === " ") || (x % 2 === 1 && y % 2 === 0 && g[y - 1][x] === " " && g[y + 1][x] === " "))) { g[y][x] = " "; n++; } }
    this.grid = g; this.dots = new Set(); this.pellets = new Set();
    this.nodeTiles = [[1, 1], [COLS - 2, 1], [1, ROWS - 2], [COLS - 2, ROWS - 2]];
    this.start = [CW - 1 > 0 ? 2 * Math.floor(CW / 2) + 1 : 1, 2 * Math.floor(CH / 2) + 1]; this.ghostStarts = [[1 + 2 * 2, 1 + 2 * Math.floor(CH / 2)], [COLS - 2 - 2 * 2, 1 + 2 * Math.floor(CH / 2)], [Math.floor(COLS / 2) | 1, 1]];
    const pel = [[Math.floor(CW / 2) * 2 + 1, 1], [Math.floor(CW / 2) * 2 + 1, ROWS - 2], [1, Math.floor(CH / 2) * 2 + 1], [COLS - 2, Math.floor(CH / 2) * 2 + 1]];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (g[y][x] === " ") this.dots.add(x + "," + y);
    this.nodeTiles.forEach(([x, y]) => this.dots.delete(x + "," + y)); this.dots.delete(this.start.join(","));
    pel.forEach(([x, y]) => { if (g[y][x] === " " && !this.nodeTiles.some((n) => n[0] === x && n[1] === y)) { this.dots.delete(x + "," + y); this.pellets.add(x + "," + y); } });
  }
  px(tx) { return this.ox + (tx + 0.5) * this.T; } py(ty) { return this.oy + (ty + 0.5) * this.T; }
  pass(x, y) { return y >= 0 && y < this.ROWS && x >= 0 && x < this.COLS && this.grid[y][x] !== "#"; }
  drawWalls() {
    const g = this.walls, T = this.T, G = ARC.G; g.clear();
    g.fillStyle(0x021209, 1); for (let y = 0; y < this.ROWS; y++) for (let x = 0; x < this.COLS; x++) if (this.grid[y][x] === "#") g.fillRect(this.ox + x * T, this.oy + y * T, T, T);
    const edge = (w, a) => { g.lineStyle(w, G, a); for (let y = 0; y < this.ROWS; y++) for (let x = 0; x < this.COLS; x++) { if (this.grid[y][x] !== "#") continue; const X = this.ox + x * T, Y = this.oy + y * T; if (!this.pass(x, y - 1)) { if (y === 0 || this.pass(x, y - 1)) {} } const o = (dx, dy) => this.pass(x + dx, y + dy); if (o(0, -1)) g.lineBetween(X, Y, X + T, Y); if (o(0, 1)) g.lineBetween(X, Y + T, X + T, Y + T); if (o(-1, 0)) g.lineBetween(X, Y, X, Y + T); if (o(1, 0)) g.lineBetween(X + T, Y, X + T, Y + T); } };
    edge(8, 0.12); edge(3, 0.95);
    g.lineStyle(3, G, 0.95).strokeRect(this.ox, this.oy, this.COLS * T, this.ROWS * T);
  }
  drawDots() {
    const g = this.dotG; g.clear(); g.fillStyle(0xb6ff5a, 0.9); this.dots.forEach((k) => { const [x, y] = k.split(",").map(Number); g.fillCircle(this.px(x), this.py(y), 3); });
    this.pelletT = 0;
  }
  drawPanel() {
    const g = this.panel, x0 = 840; g.clear(); g.fillStyle(0x03140a, 0.85).fillRoundedRect(x0, 120, 400, 380, 10).lineStyle(2, ARC.G, 0.8).strokeRoundedRect(x0, 120, 400, 380, 10);
    this.add.text(x0 + 20, 134, "REACH THE CORRECT TERMINAL", { fontFamily: ARC.FONT, fontSize: "14px", color: "#39ff14", letterSpacing: 2 });
    this.add.text(x0 + 20, 520, "ARROWS / WASD  move\nEat pellets to scare the sentries", { fontFamily: ARC.BODY, fontSize: "18px", color: "#7fa87a", lineSpacing: 6 });
    this.hearts = this.add.text(x0 + 20, 610, "", { fontFamily: ARC.FONT, fontSize: "18px", color: "#39ff14" });
  }
  startRound() {
    const q = this.d.questions[this.round]; this.q = q; this.setQuestion(q.prompt);
    const order = arcShuffle(q.options.map((_, i) => i)); this.nodeMap = order.map((oi, n) => ({ letter: ARC_LETTERS[n], text: q.options[oi], correct: oi === q.correctIndex, tile: this.nodeTiles[n], color: ARC_COLORS[n], off: false }));
    this.legend.forEach((t) => t.destroy()); this.legend = [];
    this.nodeMap.forEach((n, i) => { const y = 168 + i * 80; this.legend.push(this.add.text(880, y, n.letter, { fontFamily: ARC.FONT, fontSize: "30px", fontStyle: "900", color: hexStr(n.color) }), this.add.text(930, y + 2, n.text, { fontFamily: ARC.BODY, fontSize: "21px", fontStyle: "700", color: "#e8ffe0", wordWrap: { width: 290 } })); });
    this.pl = { tx: this.start[0], ty: this.start[1], nx: 0, ny: 0, p: 0, moving: false, dir: [0, 0], mouth: 0, inv: 1.2 }; this.want = [0, 0];
    const gh = [0xff3b5c, 0x22d3ee, 0xffb347]; this.ghosts = this.ghostStarts.slice(0, this.d.ghosts || 2).map((s, i) => ({ tx: s[0], ty: s[1], nx: 0, ny: 0, p: 0, moving: false, dir: [0, 0], color: gh[i], start: s, dead: 0, delay: 2 + i * 1.2 }));
    this.fright = 0; this.ready = 1.4; this.banner("READY", "#b6ff5a", 600); this.drawNodes();
  }
  drawNodes() {
    const g = this.nodeG, T = this.T; g.clear();
    this.nodeMap.forEach((n) => { const x = this.px(n.tile[0]), y = this.py(n.tile[1]); g.fillStyle(n.off ? 0x222222 : n.color, n.off ? 0.4 : 0.25).fillRoundedRect(x - 17, y - 17, 34, 34, 7).lineStyle(3, n.off ? 0x444444 : n.color, 1).strokeRoundedRect(x - 17, y - 17, 34, 34, 7); });
    (this.nodeLabels || []).forEach((t) => t.destroy()); this.nodeLabels = this.nodeMap.map((n) => this.add.text(this.px(n.tile[0]), this.py(n.tile[1]), n.letter, { fontFamily: ARC.FONT, fontSize: "20px", fontStyle: "900", color: n.off ? "#555" : hexStr(n.color) }).setOrigin(0.5).setDepth(6));
  }
  pos(e) { const f = e.moving ? e.p : 0; return [this.px(e.tx + (e.moving ? (e.nx - e.tx) * f : 0)), this.py(e.ty + (e.moving ? (e.ny - e.ty) * f : 0))]; }
  advance(e, dt, speed, choose, arrive) {
    if (!e.moving) { const d = choose(e); if (d && this.pass(e.tx + d[0], e.ty + d[1])) { e.dir = d; e.nx = e.tx + d[0]; e.ny = e.ty + d[1]; e.p = 0; e.moving = true; } }
    if (e.moving) { e.p += (speed * dt) / this.T; if (e.p >= 1) { e.tx = e.nx; e.ty = e.ny; e.moving = false; e.p = 0; arrive(e); } }
  }
  update(time, delta) {
    if (this.finished) return; const dt = Math.min(delta / 1000, 0.05), k = this.k, V = window.__arcana && window.__arcana.V;
    const kd = (a, b, c) => k[a].isDown || k[b].isDown || (V && c && V[c]);
    if (kd("A", "LEFT", "left")) this.want = [-1, 0]; else if (kd("D", "RIGHT", "right")) this.want = [1, 0]; else if (kd("W", "UP")) this.want = [0, -1]; else if (kd("S", "DOWN")) this.want = [0, 1];
    this.syncScore(); this.hearts.setText("HEARTS " + "◆".repeat(Math.max(0, this.d.getHp())) + "◇".repeat(Math.max(0, this.d.maxHp - this.d.getHp())));
    if (this.ready > 0) { this.ready -= dt; this.render(time); return; }
    const pl = this.pl; pl.inv = Math.max(0, pl.inv - dt); this.fright = Math.max(0, this.fright - dt);
    if (pl.moving && this.want[0] === -pl.dir[0] && this.want[1] === -pl.dir[1] && (this.want[0] || this.want[1])) { const tx = pl.tx, ty = pl.ty; pl.tx = pl.nx; pl.ty = pl.ny; pl.nx = tx; pl.ny = ty; pl.p = 1 - pl.p; pl.dir = this.want; }
    this.advance(pl, dt, 190, (e) => (this.want[0] || this.want[1]) && this.pass(e.tx + this.want[0], e.ty + this.want[1]) ? this.want : this.pass(e.tx + e.dir[0], e.ty + e.dir[1]) ? e.dir : null, (e) => this.arrive(e));
    for (const gh of this.ghosts) {
      if (gh.dead > 0) { gh.dead -= dt; if (gh.dead <= 0) { gh.tx = gh.start[0]; gh.ty = gh.start[1]; gh.moving = false; gh.delay = 1; } continue; }
      if (gh.delay > 0) { gh.delay -= dt; continue; }
      this.advance(gh, dt, this.fright > 0 ? 90 : 128, (e) => this.ghostDir(e), () => {});
      const [gx, gy] = this.pos(gh), [px, py] = this.pos(pl);
      if (Math.hypot(gx - px, gy - py) < this.T * 0.6) {
        if (this.fright > 0) { gh.dead = 4; this.d.addScore(50); Sound.collect(); this.burst(gx, gy, gh.color, 24); this.banner("+50", "#b6ff5a", 200); }
        else if (pl.inv <= 0) { this.hit(); break; }
      }
    }
    this.render(time);
  }
  ghostDir(e) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter((d) => this.pass(e.tx + d[0], e.ty + d[1])), fwd = dirs.filter((d) => !(d[0] === -e.dir[0] && d[1] === -e.dir[1])), opts = fwd.length ? fwd : dirs, pl = this.pl;
    const dist = (d) => Math.abs(e.tx + d[0] - pl.tx) + Math.abs(e.ty + d[1] - pl.ty);
    if (this.fright > 0) return opts.sort((a, b) => dist(b) - dist(a))[0];
    return Math.random() < 0.68 ? opts.sort((a, b) => dist(a) - dist(b))[0] : opts[Math.floor(Math.random() * opts.length)];
  }
  hit() {
    Sound.wrong(); this.cameras.main.shake(220, 0.012); const [px, py] = this.pos(this.pl); this.burst(px, py, 0xff3b5c, 30); this.d.onHit();
    this.pl.tx = this.start[0]; this.pl.ty = this.start[1]; this.pl.moving = false; this.pl.dir = [0, 0]; this.want = [0, 0]; this.pl.inv = 2;
    this.ghosts.forEach((g) => { g.tx = g.start[0]; g.ty = g.start[1]; g.moving = false; g.delay = 2; });
  }
  arrive(e) {
    const key = e.tx + "," + e.ty;
    if (this.dots.has(key)) { this.dots.delete(key); this.d.addScore(1); this.drawDots(); if (Math.random() < 0.3) Sound.tick(); }
    if (this.pellets.has(key)) { this.pellets.delete(key); this.fright = 7; this.d.addScore(10); Sound.cast(); this.burst(this.px(e.tx), this.py(e.ty), 0xb6ff5a, 20); }
    const n = this.nodeMap.find((n) => n.tile[0] === e.tx && n.tile[1] === e.ty && !n.off); if (!n) return;
    const x = this.px(e.tx), y = this.py(e.ty);
    if (n.correct) { this.right++; this.d.onRight(this.q); Sound.correct(); this.burst(x, y, n.color, 50); this.banner("CORRECT!", "#b6ff5a", 500); this.ready = 99; this.round++; this.time.delayedCall(1100, () => { if (this.round >= this.d.questions.length) this.finish({ right: this.right, wrong: this.wrong }); else { this.ready = 0; this.startRound(); } }); }
    else { n.off = true; this.wrong++; this.d.onWrong(this.q); Sound.wrong(); this.burst(x, y, 0xff3b5c, 30); this.cameras.main.shake(180, 0.01); this.drawNodes(); }
  }
  render(time) {
    const g = this.actors; g.clear(); const [px, py] = this.pos(this.pl), r = 15; this.pl.mouth = (Math.sin(time * 0.02) + 1) * 0.5;
    const ang = Math.atan2(this.pl.dir[1] || 0, this.pl.dir[0] || 1), m = 0.12 + this.pl.mouth * 0.5;
    if (!(this.pl.inv > 0 && Math.floor(time / 90) % 2)) {
      g.fillStyle(ARC.G, 0.18).fillCircle(px, py, r + 9); g.fillStyle(ARC.G, 1).slice(px, py, r, ang + m, ang + Math.PI * 2 - m, false).fillPath();
      g.fillStyle(0x021a06, 1).fillCircle(px + Math.cos(ang - 0.9) * 6, py + Math.sin(ang - 0.9) * 6, 2.5); g.lineStyle(2, 0xb6ff5a, 0.9).strokeCircle(px, py, r);
    }
    for (const gh of this.ghosts) {
      if (gh.dead > 0) continue; const [gx, gy] = this.pos(gh), fr = this.fright > 0, flash = fr && this.fright < 2 && Math.floor(time / 120) % 2, col = fr ? (flash ? 0xffffff : 0x2255ff) : gh.color, w = 15;
      g.fillStyle(col, 0.2).fillCircle(gx, gy, w + 8); g.fillStyle(col, 1).fillCircle(gx, gy - 2, w); g.fillRect(gx - w, gy - 2, w * 2, w);
      g.fillStyle(0x03140a, 1); for (let i = 0; i < 3; i++) g.fillTriangle(gx - w + i * (w * 2 / 3), gy + w - 1, gx - w + (i + 1) * (w * 2 / 3), gy + w - 1, gx - w + (i + 0.5) * (w * 2 / 3), gy + w - 8 + Math.sin(time * 0.02 + i) * 2);
      const ex = (gh.dir[0] || 0) * 2.5, ey = (gh.dir[1] || 0) * 2.5; g.fillStyle(0xffffff, 1).fillCircle(gx - 5, gy - 4, 4).fillCircle(gx + 5, gy - 4, 4); g.fillStyle(fr ? 0xff3b5c : 0x021a06, 1).fillCircle(gx - 5 + ex, gy - 4 + ey, 2).fillCircle(gx + 5 + ex, gy - 4 + ey, 2);
    }
    this.pelletT = (this.pelletT || 0) + 1; this.pellets.forEach((k) => { const [x, y] = k.split(",").map(Number); g.fillStyle(0xb6ff5a, 0.5 + 0.4 * Math.sin(time * 0.012)).fillCircle(this.px(x), this.py(y), 8); });
  }
}

// ======================================================================= INVADERS
class ShooterScene extends ArcadeBase {
  constructor() { super("shooter"); }
  init(d) { this.d = d; this.finished = false; }
  create() {
    const { W, H } = ARC; this.backdrop(); this.header("ARCADE // INVADERS", ""); this.k = this.input.keyboard.addKeys("A,D,W,LEFT,RIGHT,UP,SPACE"); this.input.keyboard.addCapture("SPACE,LEFT,RIGHT,UP");
    this.ship = { x: W / 2, y: H - 70, cd: 0, inv: 0 }; this.bolts = []; this.shots = []; this.blocks = []; this.round = 0; this.right = 0; this.wrong = 0; this.g = this.add.graphics().setDepth(10); this.texts = [];
    this.hearts = this.add.text(40, H - 40, "", { fontFamily: ARC.FONT, fontSize: "16px", color: "#39ff14" }); this.add.text(W - 40, H - 40, "A/D MOVE   SPACE FIRE", { fontFamily: ARC.FONT, fontSize: "14px", color: "#7fa87a" }).setOrigin(1, 0);
    this.input.on("pointerdown", () => (this.tapFire = true)); this.startRound(); this.syncScore();
  }
  startRound() {
    const q = this.d.questions[this.round]; this.q = q; this.setQuestion(q.prompt); this.texts.forEach((t) => t.destroy()); this.texts = []; this.shots = []; this.bolts = [];
    const order = arcShuffle(q.options.map((_, i) => i)), bw = 270, gap = 24, x0 = (ARC.W - (bw * 4 + gap * 3)) / 2;
    this.blocks = order.map((oi, n) => ({ x: x0 + n * (bw + gap), y: 150, w: bw, h: 104, correct: oi === q.correctIndex, text: q.options[oi], color: ARC_COLORS[n], alive: true, key: ARC_LETTERS[n] }));
    this.blocks.forEach((b) => { b.t = this.add.text(0, 0, b.text, { fontFamily: ARC.BODY, fontSize: "20px", fontStyle: "700", color: "#e8ffe0", align: "center", wordWrap: { width: bw - 28 } }).setOrigin(0.5).setDepth(11); this.texts.push(b.t); });
    this.dir = 1; this.speed = 70 + this.round * 14; this.fireT = 1.5; this.ready = 1.2; this.banner("INCOMING", "#ffb347", 500);
  }
  update(time, delta) {
    if (this.finished) return; const dt = Math.min(delta / 1000, 0.05), k = this.k, V = window.__arcana && window.__arcana.V, s = this.ship;
    this.syncScore(); this.hearts.setText("HEARTS " + "◆".repeat(Math.max(0, this.d.getHp())) + "◇".repeat(Math.max(0, this.d.maxHp - this.d.getHp())));
    const mv = (k.D.isDown || k.RIGHT.isDown || (V && V.right) ? 1 : 0) - (k.A.isDown || k.LEFT.isDown || (V && V.left) ? 1 : 0); s.x = Phaser.Math.Clamp(s.x + mv * 460 * dt, 50, ARC.W - 50); s.cd -= dt; s.inv -= dt;
    const fire = k.SPACE.isDown || k.W.isDown || k.UP.isDown || this.tapFire || (V && V.jump); this.tapFire = false;
    if (this.ready > 0) this.ready -= dt; else {
      if (fire && s.cd <= 0) { s.cd = 0.26; this.bolts.push({ x: s.x, y: s.y - 24 }); Sound.jump(); }
      const alive = this.blocks.filter((b) => b.alive); let edge = false;
      alive.forEach((b) => { b.x += this.dir * this.speed * dt; if (b.x < 20 || b.x + b.w > ARC.W - 20) edge = true; });
      if (edge) { this.dir *= -1; alive.forEach((b) => (b.y += 40)); }
      this.fireT -= dt; if (this.fireT <= 0 && alive.length) { const b = alive[Math.floor(Math.random() * alive.length)]; this.shots.push({ x: b.x + b.w / 2, y: b.y + b.h, c: b.color }); this.fireT = 1.1 + Math.random() * 0.9; }
      this.bolts.forEach((b) => (b.y -= 900 * dt)); this.shots.forEach((b) => (b.y += 300 * dt));
      for (const bo of this.bolts) for (const b of alive) if (b.alive && !bo.dead && bo.x > b.x && bo.x < b.x + b.w && bo.y > b.y && bo.y < b.y + b.h) { bo.dead = true; this.hitBlock(b); }
      for (const sh of this.shots) if (!sh.dead && s.inv <= 0 && Math.abs(sh.x - s.x) < 26 && sh.y > s.y - 20 && sh.y < s.y + 22) { sh.dead = true; this.shipHit(); }
      if (alive.some((b) => b.y + b.h > s.y - 40) && !this.failing) { this.failing = true; this.d.onWrong(this.q); this.wrong++; this.cameras.main.shake(260, 0.014); Sound.wrong(); this.banner("BREACH", "#ff3b5c", 500); this.time.delayedCall(900, () => { this.failing = false; this.startRound(); }); this.ready = 99; }
    }
    this.bolts = this.bolts.filter((b) => b.y > 100 && !b.dead); this.shots = this.shots.filter((b) => b.y < ARC.H && !b.dead); this.render(time);
  }
  hitBlock(b) {
    b.alive = false; b.t.setVisible(false); this.burst(b.x + b.w / 2, b.y + b.h / 2, b.color, 44); this.cameras.main.shake(120, 0.006);
    if (b.correct) {
      this.right++; this.d.onRight(this.q); Sound.correct(); this.banner("CORRECT!", "#b6ff5a", 400); this.ready = 99; this.blocks.forEach((o) => { if (o.alive) { o.alive = false; o.t.setVisible(false); this.burst(o.x + o.w / 2, o.y + o.h / 2, o.color, 22); } });
      this.round++; this.time.delayedCall(1100, () => { if (this.round >= this.d.questions.length) this.finish({ right: this.right, wrong: this.wrong }); else this.startRound(); });
    } else { this.wrong++; this.d.onWrong(this.q); Sound.wrong(); this.cameras.main.shake(160, 0.01); }
  }
  shipHit() { this.ship.inv = 1.4; this.d.onHit(); Sound.hit(); this.burst(this.ship.x, this.ship.y, 0xff3b5c, 30); this.cameras.main.shake(220, 0.012); }
  render(time) {
    const g = this.g, s = this.ship; g.clear();
    this.blocks.forEach((b) => { if (!b.alive) return; g.fillStyle(0x03140a, 0.92).fillRoundedRect(b.x, b.y, b.w, b.h, 10); g.lineStyle(7, b.color, 0.18).strokeRoundedRect(b.x, b.y, b.w, b.h, 10); g.lineStyle(3, b.color, 1).strokeRoundedRect(b.x, b.y, b.w, b.h, 10); g.fillStyle(b.color, 1).fillRect(b.x + 12, b.y - 6, 54, 12); b.t.setPosition(b.x + b.w / 2, b.y + b.h / 2 + 4); });
    if (!(s.inv > 0 && Math.floor(time / 90) % 2)) {
      g.fillStyle(ARC.G, 0.2).fillCircle(s.x, s.y, 36); g.fillStyle(0x0a1a0d, 1).lineStyle(3, ARC.G, 1); g.beginPath(); g.moveTo(s.x, s.y - 30); g.lineTo(s.x + 30, s.y + 18); g.lineTo(s.x + 12, s.y + 10); g.lineTo(s.x, s.y + 22); g.lineTo(s.x - 12, s.y + 10); g.lineTo(s.x - 30, s.y + 18); g.closePath(); g.fillPath(); g.strokePath();
      g.fillStyle(0xb6ff5a, 0.8).fillCircle(s.x, s.y - 4, 5); g.fillStyle(0xffffff, 0.7).fillTriangle(s.x - 6, s.y + 22, s.x + 6, s.y + 22, s.x, s.y + 22 + 10 + Math.sin(time * 0.05) * 5);
    }
    this.bolts.forEach((b) => { g.fillStyle(0xb6ff5a, 0.3).fillRect(b.x - 6, b.y - 6, 12, 36); g.fillStyle(0xffffff, 1).fillRect(b.x - 2, b.y, 4, 26); });
    this.shots.forEach((b) => { g.fillStyle(b.c, 0.3).fillCircle(b.x, b.y, 12); g.fillStyle(b.c, 1).fillCircle(b.x, b.y, 6); });
  }
}
