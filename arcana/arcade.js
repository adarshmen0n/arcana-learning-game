// Retro arcade levels: a Pac-Man style maze, Snake, a Hill Climb rally and a Space-Invaders style shooter.
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
    this.add.particles(0, 0, "spark", { x: { min: 0, max: W }, y: { min: 0, max: H }, lifespan: 5000, speedY: { min: -14, max: -4 }, scale: { start: 0.25, end: 0 }, alpha: { start: 0.7, end: 0 }, tint: [G, 0xb6ff5a], blendMode: "ADD", frequency: Art.LOW ? 360 : 140 });
  }
  header(kicker, question) {
    const { W, FONT, BODY } = ARC;
    this.add.text(40, 10, kicker, { fontFamily: FONT, fontSize: "13px", color: "#39ff14", letterSpacing: 5 }).setAlpha(0.9).setDepth(42);
    this.qBack = this.add.graphics().setDepth(40);           // the question sits on its own panel above the game, so the board can never cover it
    this.qText = this.add.text(W / 2, 70, question, { fontFamily: BODY, fontSize: "26px", fontStyle: "700", color: "#e8ffe0", align: "center", wordWrap: { width: 1040 } }).setOrigin(0.5, 0.5).setDepth(41);
    this.scoreText = this.add.text(W - 40, 8, "", { fontFamily: FONT, fontSize: "17px", color: "#39ff14" }).setOrigin(1, 0).setDepth(42);
  }
  setQuestion(t) {
    const q = this.qText;
    for (const size of [26, 23, 20, 18, 16]) {             // shrink long questions until they fit in two or three lines
      q.setFontSize(size + "px").setText(t);
      if (q.height <= 62) break;
    }
    const h = Math.max(40, q.height + 12);                  // the panel spans y 34-106; every game's board starts below it
    this.qBack.clear().fillStyle(0x020a04, 0.92).fillRoundedRect(ARC.W / 2 - 560, 70 - h / 2, 1120, h, 10).lineStyle(1.5, ARC.G, 0.5).strokeRoundedRect(ARC.W / 2 - 560, 70 - h / 2, 1120, h, 10);
    this.tweens.add({ targets: q, alpha: { from: 0, to: 1 }, duration: 300 });
  }
  banner(text, color = "#39ff14", ms = 900) {
    const t = this.add.text(ARC.W / 2, ARC.H / 2, text, { fontFamily: ARC.FONT, fontSize: "64px", fontStyle: "900", color, stroke: "#000", strokeThickness: 8 }).setOrigin(0.5).setDepth(50).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, scale: { from: 0.6, to: 1 }, duration: 220, yoyo: false, onComplete: () => this.tweens.add({ targets: t, alpha: 0, delay: ms, duration: 260, onComplete: () => t.destroy() }) });
  }
  burst(x, y, tint, n = 20) {
    if (!this._b) this._b = this.add.particles(0, 0, "spark", { lifespan: 650, speed: { min: 80, max: 320 }, scale: { start: 0.55, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: "ADD", emitting: false, tint: { onEmit: () => this._bt } }).setDepth(40);
    this._bt = tint; this._b.explode(n, x, y);
  }
  learn(q) {                                    // after a right answer, show why: every mini-game teaches, not just tests
    if (!q || !q.explanation) return; if (this._learn) this._learn.destroy();
    const t = this._learn = this.add.text(ARC.W / 2, ARC.H - 96, "WHY: " + q.explanation, { fontFamily: ARC.BODY, fontSize: "20px", fontStyle: "700", color: "#e8ffe0", align: "center", wordWrap: { width: 1000 }, backgroundColor: "#03140aee", padding: { x: 16, y: 10 } }).setOrigin(0.5, 1).setDepth(60).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 200, onComplete: () => this.tweens.add({ targets: t, alpha: 0, delay: 3800, duration: 400, onComplete: () => t.destroy() }) });
  }
  finish(result) { if (this.finished) return; this.finished = true; this.time.delayedCall(this._learn && this._learn.active ? 2600 : 700, () => this.d.done(result)); }
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
    if (n.correct) { this.right++; this.d.onRight(this.q); Sound.correct(); this.burst(x, y, n.color, 50); this.banner("CORRECT!", "#b6ff5a", 500); this.learn(this.q); this.ready = 99; this.round++; this.time.delayedCall(1100, () => { if (this.round >= this.d.questions.length) this.finish({ right: this.right, wrong: this.wrong }); else { this.ready = 0; this.startRound(); } }); }
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
      this.right++; this.d.onRight(this.q); Sound.correct(); this.banner("CORRECT!", "#b6ff5a", 400); this.learn(this.q); this.ready = 99; this.blocks.forEach((o) => { if (o.alive) { o.alive = false; o.t.setVisible(false); this.burst(o.x + o.w / 2, o.y + o.h / 2, o.color, 22); } });
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

// ======================================================================= SNAKE TRAIL
// Classic snake on a neon grid. Four answer cores (A-D) sit on the board: eat the right one to grow and move on.
class SnakeScene extends ArcadeBase {
  constructor() { super("snake"); }
  init(d) { this.d = d; this.finished = false; }
  create() {
    this.backdrop(); this.header("ARCADE // SNAKE TRAIL", ""); this.T = 36; this.COLS = 24; this.ROWS = 14; this.ox = 30; this.oy = 140;
    this.k = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT"); this.input.keyboard.addCapture("UP,DOWN,LEFT,RIGHT,SPACE");
    this.input.on("pointerdown", (p) => (this.sw = { x: p.x, y: p.y }));
    this.input.on("pointerup", (p) => { if (!this.sw) return; const dx = p.x - this.sw.x, dy = p.y - this.sw.y; if (Math.hypot(dx, dy) > 24) this.turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]); this.sw = null; });
    this.round = 0; this.right = 0; this.wrong = 0; this.board = this.add.graphics(); this.g = this.add.graphics().setDepth(10); this.legend = []; this.foodLabels = [];
    const x0 = this.ox + this.COLS * this.T + 26; this.lx = x0;
    this.add.graphics().fillStyle(0x03140a, 0.85).fillRoundedRect(x0, 140, 1250 - x0, 420, 10).lineStyle(2, ARC.G, 0.8).strokeRoundedRect(x0, 140, 1250 - x0, 420, 10);
    this.add.text(x0 + 16, 152, "EAT THE RIGHT ANSWER", { fontFamily: ARC.FONT, fontSize: "14px", color: "#39ff14", letterSpacing: 2 });
    this.add.text(x0 + 16, 584, "ARROWS / WASD / swipe  steer\nWrong answers shrink you.\nWalls and your tail hurt.", { fontFamily: ARC.BODY, fontSize: "17px", color: "#7fa87a", lineSpacing: 4 });
    this.hearts = this.add.text(40, 680, "", { fontFamily: ARC.FONT, fontSize: "16px", color: "#39ff14" });
    this.drawBoard(); this.reset(); this.startRound(); this.syncScore();
  }
  drawBoard() {
    const g = this.board, T = this.T; g.clear(); g.fillStyle(0x010804, 0.9).fillRect(this.ox, this.oy, this.COLS * T, this.ROWS * T);
    g.lineStyle(1, ARC.G, 0.08); for (let x = 0; x <= this.COLS; x++) g.lineBetween(this.ox + x * T, this.oy, this.ox + x * T, this.oy + this.ROWS * T); for (let y = 0; y <= this.ROWS; y++) g.lineBetween(this.ox, this.oy + y * T, this.ox + this.COLS * T, this.oy + y * T);
    g.lineStyle(8, ARC.G, 0.14).strokeRect(this.ox, this.oy, this.COLS * T, this.ROWS * T); g.lineStyle(3, ARC.G, 1).strokeRect(this.ox, this.oy, this.COLS * T, this.ROWS * T);
  }
  reset() {
    const cx = Math.floor(this.COLS / 2) - 4, cy = Math.floor(this.ROWS / 2);
    this.body = [[cx + 3, cy], [cx + 2, cy], [cx + 1, cy], [cx, cy]]; this.dir = [1, 0]; this.next = [1, 0]; this.grow = 0; this.tick = 0; this.ready = 1.1; this.inv = 1.2; this.idle = 3;   // waits for the first steer (or 3 s)
  }
  turn(d) { this.idle = 0; if (d[0] === -this.dir[0] && d[1] === -this.dir[1]) return; this.next = d; }
  free() {
    for (let n = 0; n < 400; n++) {
      const x = 1 + Math.floor(Math.random() * (this.COLS - 2)), y = 1 + Math.floor(Math.random() * (this.ROWS - 2)), h = this.body[0];
      if (this.body.some((b) => b[0] === x && b[1] === y) || (this.foods || []).some((f) => !f.off && Math.abs(f.x - x) + Math.abs(f.y - y) < 3) || Math.abs(h[0] - x) + Math.abs(h[1] - y) < 5) continue;
      return [x, y];
    }
    return [1, 1];
  }
  startRound() {
    const q = this.d.questions[this.round]; this.q = q; this.setQuestion(q.prompt); this.foods = [];
    arcShuffle(q.options.map((_, i) => i)).forEach((oi, n) => { const [x, y] = this.free(); this.foods.push({ x, y, letter: ARC_LETTERS[n], text: q.options[oi], correct: oi === q.correctIndex, color: ARC_COLORS[n], off: false }); });
    this.bits = []; for (let i = 0; i < 3; i++) { const [x, y] = this.free(); this.bits.push({ x, y }); }
    this.legend.forEach((t) => t.destroy()); this.legend = [];
    this.foods.forEach((f, i) => { const y = 186 + i * 92; this.legend.push(this.add.text(this.lx + 16, y, f.letter, { fontFamily: ARC.FONT, fontSize: "28px", fontStyle: "900", color: hexStr(f.color) }), this.add.text(this.lx + 56, y + 2, f.text, { fontFamily: ARC.BODY, fontSize: "19px", fontStyle: "700", color: "#e8ffe0", wordWrap: { width: 1250 - this.lx - 76 } })); });
    this.foodLabels.forEach((t) => t.destroy()); this.foodLabels = this.foods.map((f) => this.add.text(this.ox + (f.x + 0.5) * this.T, this.oy + (f.y + 0.5) * this.T, f.letter, { fontFamily: ARC.FONT, fontSize: "18px", fontStyle: "900", color: "#000" }).setOrigin(0.5).setDepth(12));
    this.ready = Math.max(this.ready, 0.8); this.banner("ROUND " + (this.round + 1), "#b6ff5a", 400);
  }
  update(time, delta) {
    if (this.finished) return; const dt = Math.min(delta / 1000, 0.05), k = this.k, V = window.__arcana && window.__arcana.V;
    if (k.A.isDown || k.LEFT.isDown || (V && V.left)) this.turn([-1, 0]); else if (k.D.isDown || k.RIGHT.isDown || (V && V.right)) this.turn([1, 0]); else if (k.W.isDown || k.UP.isDown) this.turn([0, -1]); else if (k.S.isDown || k.DOWN.isDown) this.turn([0, 1]);
    this.syncScore(); this.hearts.setText("HEARTS " + "◆".repeat(Math.max(0, this.d.getHp())) + "◇".repeat(Math.max(0, this.d.maxHp - this.d.getHp())));
    this.inv = Math.max(0, this.inv - dt);
    if (this.ready > 0) { this.ready -= dt; this.render(time); return; }
    if (this.idle > 0) { this.idle -= dt; this.render(time); return; }
    const step = Math.max(0.075, 0.13 - this.round * 0.008); this.tick += dt;
    while (this.tick >= step && !this.finished && this.ready <= 0) { this.tick -= step; this.move(); }
    this.render(time);
  }
  move() {
    this.dir = this.next; const h = this.body[0], nx = h[0] + this.dir[0], ny = h[1] + this.dir[1];
    if (nx < 0 || ny < 0 || nx >= this.COLS || ny >= this.ROWS || this.body.slice(0, -1).some((b) => b[0] === nx && b[1] === ny)) {
      if (this.inv > 0) return; Sound.wrong(); this.cameras.main.shake(220, 0.012); this.burst(this.ox + (h[0] + 0.5) * this.T, this.oy + (h[1] + 0.5) * this.T, 0xff3b5c, 34); this.d.onHit(); this.reset(); return;
    }
    this.body.unshift([nx, ny]); if (this.grow > 0) this.grow--; else this.body.pop();
    const cx = this.ox + (nx + 0.5) * this.T, cy = this.oy + (ny + 0.5) * this.T;
    const bit = this.bits.findIndex((b) => b.x === nx && b.y === ny);
    if (bit >= 0) { this.grow += 1; this.d.addScore(2); Sound.tick(); this.burst(cx, cy, 0xb6ff5a, 10); const [x, y] = this.free(); this.bits[bit] = { x, y }; }
    const f = this.foods.find((f) => !f.off && f.x === nx && f.y === ny); if (!f) return;
    if (f.correct) {
      this.right++; this.grow += 3; this.d.onRight(this.q); Sound.correct(); this.burst(cx, cy, f.color, 50); this.banner("CORRECT!", "#b6ff5a", 400); this.learn(this.q);
      this.round++; this.ready = 99; this.time.delayedCall(900, () => { if (this.round >= this.d.questions.length) this.finish({ right: this.right, wrong: this.wrong }); else { this.ready = 0; this.startRound(); } });
    } else {
      f.off = true; this.wrong++; this.d.onWrong(this.q); Sound.wrong(); this.burst(cx, cy, 0xff3b5c, 30); this.cameras.main.shake(160, 0.01);
      this.body.splice(Math.max(3, this.body.length - 2)); const i = this.foods.indexOf(f); this.foodLabels[i].setColor("#333"); this.legend[i * 2 + 1].setAlpha(0.35);
    }
  }
  render(time) {
    const g = this.g, T = this.T; g.clear();
    for (const b of this.bits) { const x = this.ox + (b.x + 0.5) * T, y = this.oy + (b.y + 0.5) * T; g.fillStyle(0xb6ff5a, 0.25).fillCircle(x, y, 9); g.fillStyle(0xb6ff5a, 0.9).fillCircle(x, y, 4 + Math.sin(time * 0.01 + b.x) * 1); }
    for (const f of this.foods) {
      const x = this.ox + (f.x + 0.5) * T, y = this.oy + (f.y + 0.5) * T, p = 1 + 0.08 * Math.sin(time * 0.008 + f.x);
      if (f.off) { g.fillStyle(0x222222, 0.6).fillRoundedRect(x - 14, y - 14, 28, 28, 6); continue; }
      g.fillStyle(f.color, 0.18).fillCircle(x, y, 24 * p); g.fillStyle(f.color, 1).fillRoundedRect(x - 15 * p, y - 15 * p, 30 * p, 30 * p, 7); g.lineStyle(2, 0xffffff, 0.7).strokeRoundedRect(x - 15 * p, y - 15 * p, 30 * p, 30 * p, 7);
    }
    const n = this.body.length, blink = this.inv > 0 && Math.floor(time / 90) % 2;
    if (!blink) for (let i = n - 1; i >= 0; i--) {
      const [bx, by] = this.body[i], x = this.ox + (bx + 0.5) * T, y = this.oy + (by + 0.5) * T, t = i / Math.max(1, n - 1), r = (i === 0 ? 16 : 14 - t * 5);
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0x39ff14), Phaser.Display.Color.ValueToColor(0x0b6b2a), 100, t * 100);
      g.fillStyle(0x39ff14, 0.12).fillCircle(x, y, r + 6); g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1).fillCircle(x, y, r);
      if (i % 3 === 1) g.fillStyle(0x021a06, 0.5).fillCircle(x, y, r * 0.35);
    }
    if (!blink) {
      const [hx, hy] = this.body[0], x = this.ox + (hx + 0.5) * T, y = this.oy + (hy + 0.5) * T, [dx, dy] = this.dir, px = -dy, py = dx;
      g.fillStyle(0xffffff, 1).fillCircle(x + dx * 6 + px * 6, y + dy * 6 + py * 6, 4.5).fillCircle(x + dx * 6 - px * 6, y + dy * 6 - py * 6, 4.5);
      g.fillStyle(0x020a04, 1).fillCircle(x + dx * 8 + px * 6, y + dy * 8 + py * 6, 2.2).fillCircle(x + dx * 8 - px * 6, y + dy * 8 - py * 6, 2.2);
      if (Math.floor(time / 300) % 3 === 0) { g.lineStyle(2, 0xff3b5c, 1).lineBetween(x + dx * 16, y + dy * 16, x + dx * 24, y + dy * 24); }
    }
  }
}

// ======================================================================= HILL CLIMB RALLY
// Side-view rally over rolling hills. Answer gates sit after jump ramps: DRIVE THROUGH the right gate on the ground,
// hit the ramp fast to FLY OVER a wrong one. Land on your wheels, watch the fuel, grab cans.
class HillScene extends ArcadeBase {
  constructor() { super("hill"); }
  init(d) { this.d = d; this.finished = false; }
  create() {
    const { W, H } = ARC; this.backdrop(); this.header("ARCADE // HILL CLIMB RALLY", "");
    this.k = this.input.keyboard.addKeys("A,D,W,S,LEFT,RIGHT,UP,DOWN,SPACE"); this.input.keyboard.addCapture("LEFT,RIGHT,UP,DOWN,SPACE");
    this.ptr = 0; this.input.on("pointerdown", (p) => (this.ptr = p.x > W / 2 ? 1 : -1)); this.input.on("pointerup", () => (this.ptr = 0));
    this.sky = this.add.graphics().setDepth(1); this.g = this.add.graphics().setDepth(5); this.fx = this.add.graphics().setDepth(8);
    this.round = 0; this.right = 0; this.wrong = 0; this.gates = []; this.zones = []; this.cans = []; this.gateTexts = [];
    this.car = { x: 200, y: 0, vx: 0, vy: 0, ang: 0, av: 0, ground: true, spin: 0 }; this.car.y = this.ty(200); this.fuel = 100; this.lastSafe = 200; this.camX = 0;
    this.opts = this.add.text(W / 2, 112, "", { fontFamily: ARC.BODY, fontSize: "17px", fontStyle: "700", color: "#b6ffb0", align: "center", wordWrap: { width: 1180 }, backgroundColor: "#020a04cc", padding: { x: 10, y: 4 } }).setOrigin(0.5, 0).setDepth(40);
    this.hud = this.add.text(40, H - 42, "", { fontFamily: ARC.FONT, fontSize: "15px", color: "#39ff14" }).setDepth(20);
    this.add.text(W - 40, H - 42, "D / RIGHT gas   A / LEFT brake   tilt in the air", { fontFamily: ARC.FONT, fontSize: "13px", color: "#7fa87a" }).setOrigin(1, 0).setDepth(20);
    this.fuelBar = this.add.graphics().setDepth(20); this.startRound(); this.syncScore();
  }
  // terrain: rolling hills that grow with distance, flattened around gate zones, plus the jump ramps
  hills(x) { const a = Math.min(1, 0.35 + x / 9000); return a * (70 * Math.sin(x * 0.0021) + 38 * Math.sin(x * 0.0057 + 1.3) + 16 * Math.sin(x * 0.013 + 0.4)); }
  ty(x) {
    let flat = 1, ramp = 0;
    for (const g of this.zones) {
      const d = Math.max(g.x - 520 - x, x - (g.x + 180), 0); flat = Math.min(flat, Math.min(1, d / 220));
      if (x > g.x - 330 && x < g.x - 160) ramp = Math.max(ramp, ((x - (g.x - 330)) / 170) * 62);
    }
    const s = flat * flat * (3 - 2 * flat); return 540 - this.hills(x) * s - ramp;
  }
  startRound() {
    const q = this.d.questions[this.round]; this.q = q; this.setQuestion(q.prompt);
    const order = arcShuffle(q.options.map((_, i) => i)), x0 = Math.max(this.car.x + 1200, (this.gates.length ? this.gates[this.gates.length - 1].x : 0) + 900);
    this.gateTexts.forEach((t) => t.destroy()); this.gateTexts = [];
    this.gates = order.map((oi, n) => ({ x: x0 + n * 760, letter: ARC_LETTERS[n], text: q.options[oi], correct: oi === q.correctIndex, color: ARC_COLORS[n], state: "open" }));
    this.zones = this.zones.filter((z) => z.x > this.car.x - 1500).concat(this.gates); this.gates.forEach((g) => { g.t = this.add.text(0, 0, g.letter + "  " + g.text, { fontFamily: ARC.BODY, fontSize: "17px", fontStyle: "700", color: "#ffffff", align: "center", wordWrap: { width: 230 }, backgroundColor: "#03140acc", padding: { x: 8, y: 5 } }).setOrigin(0.5, 1).setDepth(9); this.gateTexts.push(g.t); });
    this.opts.setText(this.gates.map((g) => g.letter + ": " + g.text).join("     "));
    for (let x = this.car.x + 700; x < x0 + 3000; x += 1250) if (!this.cans.some((c) => Math.abs(c.x - x) < 400) && !this.gates.some((g) => Math.abs(g.x - x) < 420)) this.cans.push({ x, taken: false });
    this.banner(this.round ? "NEXT CHECKPOINT" : "GO!", "#b6ff5a", 500);
  }
  update(time, delta) {
    if (this.finished) return; const dt = Math.min(delta / 1000, 0.033), k = this.k, V = window.__arcana && window.__arcana.V, c = this.car;
    const gas = k.D.isDown || k.RIGHT.isDown || k.W.isDown || k.UP.isDown || (V && (V.right || V.jump)) || this.ptr > 0, brake = k.A.isDown || k.LEFT.isDown || k.S.isDown || k.DOWN.isDown || (V && V.left) || this.ptr < 0;
    this.syncScore();
    const GRAV = 1150;
    if (this.fuel > 0 && gas) this.fuel -= 6.5 * dt; else this.fuel -= 0.8 * dt;
    if (c.ground) {
      const ax = c.x + 1, slope = Math.atan2(this.ty(ax + 12) - this.ty(ax - 12), 24);
      let a = (gas && this.fuel > 0 ? 560 : 0) - (brake ? (c.vx > 0 ? 900 : 300) : 0) + GRAV * Math.sin(slope) * 0.9;
      c.vx += a * dt; c.vx *= 1 - 0.35 * dt; c.vx = Phaser.Math.Clamp(c.vx, -220, 580);
      const nx = c.x + c.vx * dt * Math.cos(slope), ny = this.ty(nx), vyG = (ny - c.y) / dt;
      if (vyG > c.vy + GRAV * dt * 1.6 && c.vx > 60) {          // the ground falls away (crest or ramp lip): take off
        c.ground = false; const lip = this.gates.find((g) => Math.abs(nx - (g.x - 160)) < 24);
        c.vy = lip ? Math.min(c.vy, 0) - Math.max(0, c.vx - 240) * 1.55 : c.vy; c.av = lip ? -0.6 : 0; c.x = nx;
      } else { c.x = nx; c.vy = vyG; c.y = ny; c.ang += (slope - c.ang) * Math.min(1, dt * 14); }
      if (c.x > this.lastSafe + 300) this.lastSafe = c.x;
    } else {
      c.vy += GRAV * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.av += ((gas ? -2.5 : 0) + (brake ? 2.5 : 0) - (gas || brake ? 0 : Math.sin(c.ang) * 2.2)) * dt;   // gas tips the nose up, brake tips it down, hands-off slowly levels out c.av *= 1 - 0.8 * dt; c.ang += c.av * dt;
      const gy = this.ty(c.x);
      if (c.y >= gy) {
        const slope = Math.atan2(this.ty(c.x + 12) - this.ty(c.x - 12), 24), diff = Math.atan2(Math.sin(c.ang - slope), Math.cos(c.ang - slope));
        c.y = gy; c.ground = true; c.av = 0; this.burst(c.x - this.camX, gy, 0xb6ff5a, 8);
        if (Math.abs(diff) > 1.3) this.crash(); else { c.ang = slope; c.vx *= Math.cos(diff) * 0.92; if (c.vy > 700) this.cameras.main.shake(120, 0.006); c.vy = 0; }
      }
    }
    c.spin += c.vx * dt / 17;
    // gates: driving through on the ground picks the answer; flying over skips it
    for (const g of this.gates) {
      if (g.state !== "open" || c.x < g.x) continue;
      if (!c.ground && c.y < this.ty(g.x) - 70) { g.state = "skipped"; this.flash(g, "JUMPED", "#7fa87a"); continue; }
      if (g.correct) {
        g.state = "right"; this.right++; this.d.onRight(this.q); Sound.correct(); this.fuel = Math.min(100, this.fuel + 40); c.vx = Math.min(640, c.vx + 160); this.burst(g.x - this.camX, this.ty(g.x) - 90, g.color, 60); this.banner("CORRECT!", "#b6ff5a", 400); this.learn(this.q);
        this.gates.forEach((o) => { if (o.state === "open") o.state = "skipped"; });
        this.round++; if (this.round >= this.d.questions.length) { this.banner("FINISH!", "#b6ff5a", 900); this.finish({ right: this.right, wrong: this.wrong }); return; }
        this.time.delayedCall(700, () => this.startRound());
      } else { g.state = "wrong"; this.wrong++; this.d.onWrong(this.q); Sound.wrong(); this.fuel = Math.max(0, this.fuel - 15); this.cameras.main.shake(180, 0.01); this.burst(g.x - this.camX, this.ty(g.x) - 90, 0xff3b5c, 40); }
    }
    if (this.gates.length && this.gates.every((g) => g.state !== "open") && !this.gates.some((g) => g.state === "right")) { this.banner("MISSED IT: AGAIN", "#ffb347", 600); this.startRound(); }
    for (const can of this.cans) if (!can.taken && Math.abs(c.x - can.x) < 40 && Math.abs(c.y - (this.ty(can.x) - 30)) < 70) { can.taken = true; this.fuel = Math.min(100, this.fuel + 35); Sound.collect(); this.burst(can.x - this.camX, this.ty(can.x) - 30, 0xffb347, 24); }
    this.cans = this.cans.filter((n) => n.x > c.x - 900);
    if (this.fuel <= 0 && c.ground && Math.abs(c.vx) < 20 && !this.dry) { this.dry = true; this.banner("OUT OF FUEL", "#ff3b5c", 600); this.d.onHit(); Sound.wrong(); this.time.delayedCall(800, () => { this.fuel = 65; this.dry = false; }); }
    this.camX += (c.x - 330 - this.camX) * Math.min(1, dt * 6);
    this.render(time);
  }
  flash(g, text, col) { const t = this.add.text(g.x - this.camX, this.ty(g.x) - 200, text, { fontFamily: ARC.FONT, fontSize: "18px", fontStyle: "900", color: col, stroke: "#000", strokeThickness: 5 }).setOrigin(0.5).setDepth(30); this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 900, onComplete: () => t.destroy() }); }
  crash() {
    const c = this.car; Sound.hit(); this.cameras.main.shake(300, 0.016); this.burst(c.x - this.camX, c.y - 20, 0xff3b5c, 44); this.banner("CRASH!", "#ff3b5c", 500); this.d.onHit();
    c.x = Math.max(200, this.lastSafe - 250); this.gates.forEach((g) => { if (g.state === "open" && g.x < c.x + 400) c.x = g.x - 700; }); c.y = this.ty(c.x); c.vx = 0; c.vy = 0; c.ang = 0; c.ground = true;
  }
  render(time) {
    const { W, H } = ARC, g = this.g, s = this.sky, cx = this.camX, c = this.car; g.clear(); s.clear(); this.fx.clear();
    for (let L = 0; L < 2; L++) { const p = 0.2 + L * 0.25, col = L ? 0x062a12 : 0x041a0c; s.fillStyle(col, 1); s.beginPath(); s.moveTo(0, H); for (let x = 0; x <= W; x += 20) s.lineTo(x, 400 - L * -40 - 90 * Math.sin((x + cx * p) * (0.0032 + L * 0.0012) + L) - 40 * Math.sin((x + cx * p) * 0.009)); s.lineTo(W, H); s.closePath(); s.fillPath(); }
    g.fillStyle(0x03140a, 1); g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W + 16; x += 16) g.lineTo(x, this.ty(x + cx)); g.lineTo(W + 16, H); g.closePath(); g.fillPath();
    g.lineStyle(10, ARC.G, 0.12); g.beginPath(); for (let x = 0; x <= W + 16; x += 16) { const y = this.ty(x + cx); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokePath();
    g.lineStyle(3, ARC.G, 1); g.beginPath(); for (let x = 0; x <= W + 16; x += 16) { const y = this.ty(x + cx); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokePath();
    for (let m = Math.ceil(cx / 400) * 400; m < cx + W; m += 400) { const y = this.ty(m); g.fillStyle(0x39ff14, 0.35).fillRect(m - cx - 1, y - 14, 2, 14); }
    for (const gt of this.gates) {
      const x = gt.x - cx, y = this.ty(gt.x), col = gt.state === "wrong" ? 0x552222 : gt.state === "skipped" ? 0x2a3a2a : gt.color, a = gt.state === "open" ? 1 : 0.5;
      if (x < -300 || x > W + 300) { gt.t.setVisible(false); continue; }
      g.fillStyle(0x0a0f0c, 1).fillRect(x - 46, y - 140, 10, 140).fillRect(x + 36, y - 140, 10, 140); g.lineStyle(3, col, a).strokeRect(x - 46, y - 140, 10, 140).strokeRect(x + 36, y - 140, 10, 140);
      g.fillStyle(col, gt.state === "open" ? 0.12 + 0.06 * Math.sin(time * 0.006) : 0.05).fillRect(x - 36, y - 132, 72, 132); g.fillStyle(col, a).fillRect(x - 50, y - 152, 100, 14);
      const r0 = gt.x - 330 - cx; g.fillStyle(0x0b2a16, 1).fillTriangle(r0, this.ty(gt.x - 330), gt.x - 160 - cx, this.ty(gt.x - 161), gt.x - 160 - cx, this.ty(gt.x - 150) + 2); g.lineStyle(2, 0xffb347, 0.9).lineBetween(r0, this.ty(gt.x - 330), gt.x - 160 - cx, this.ty(gt.x - 161));
      gt.t.setVisible(true).setPosition(x, y - 160).setAlpha(gt.state === "open" ? 1 : 0.4);
    }
    for (const can of this.cans) { if (can.taken) continue; const x = can.x - cx, y = this.ty(can.x) - 30 + Math.sin(time * 0.006) * 4; g.fillStyle(0xffb347, 0.2).fillCircle(x, y, 22); g.fillStyle(0xd9480f, 1).fillRoundedRect(x - 11, y - 15, 22, 30, 4); g.fillStyle(0xffd36a, 1).fillRect(x - 6, y - 6, 12, 4).fillRect(x - 2, y - 10, 4, 12); }
    // the rally car, drawn rotated around its centre
    const X = c.x - cx, Y = c.y, ca = Math.cos(c.ang), sa = Math.sin(c.ang), P = (px, py) => [X + px * ca - py * sa, Y + px * sa + py * ca];
    const poly = (pts, col, alpha = 1) => { g.fillStyle(col, alpha); g.beginPath(); pts.forEach(([px, py], i) => { const [qx, qy] = P(px, py); i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }); g.closePath(); g.fillPath(); };
    poly([[-44, -22], [40, -22], [50, -12], [48, -2], [-46, -2]], 0x0d1f14); poly([[-44, -22], [40, -22], [50, -12], [48, -9], [-46, -9]], 0x1f3d29);
    poly([[-22, -22], [-12, -44], [16, -44], [28, -22]], 0x0a120d); poly([[-16, -24], [-9, -40], [13, -40], [22, -24]], 0x22d3ee, 0.35);
    const [hx, hy] = P(0, -34); g.fillStyle(0x1a2420, 1).fillCircle(hx, hy, 8); g.fillStyle(ARC.G, 1).fillRect(hx + 1, hy - 2, 7, 3);
    g.lineStyle(2, ARC.G, 1); g.beginPath(); [[-46, -9], [48, -9]].forEach(([px, py], i) => { const [qx, qy] = P(px, py); i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }); g.strokePath();
    const [lx, ly] = P(49, -12); g.fillStyle(0xffffcc, 1).fillCircle(lx, ly, 3); this.fx.fillStyle(0xffffcc, 0.08).fillTriangle(lx, ly, lx + ca * 160 - sa * 30, ly + sa * 160 + ca * 30, lx + ca * 160 + sa * 30, ly + sa * 160 - ca * 30);
    for (const wx of [-30, 32]) {
      const [qx, qy] = P(wx, 0); g.fillStyle(0x050505, 1).fillCircle(qx, qy, 15); g.lineStyle(3, 0x333333, 1).strokeCircle(qx, qy, 15); g.fillStyle(0x777777, 1).fillCircle(qx, qy, 6);
      g.lineStyle(2, 0xaaaaaa, 1); for (let i = 0; i < 3; i++) { const a = c.spin + i * 2.09; g.lineBetween(qx, qy, qx + Math.cos(a) * 12, qy + Math.sin(a) * 12); }
    }
    if (c.ground && Math.abs(c.vx) > 300) { const [qx, qy] = P(-46, -2); this.fx.fillStyle(0xb6ff5a, 0.25).fillCircle(qx - 10 - Math.random() * 14, qy + 4 + Math.random() * 6, 3 + Math.random() * 4); }
    // fuel + speed HUD
    const f = Math.max(0, this.fuel) / 100; this.fuelBar.clear().fillStyle(0x000000, 0.6).fillRoundedRect(W - 260, 140, 220, 16, 6).fillStyle(f < 0.25 ? 0xff3b5c : 0xffb347, 1).fillRoundedRect(W - 258, 142, 216 * f, 12, 5);
    this.hud.setText(`FUEL ${Math.round(f * 100)}%   SPEED ${Math.round(Math.abs(c.vx) / 6)} KM/H   CHECKPOINT ${Math.min(this.round + 1, this.d.questions.length)}/${this.d.questions.length}   HEARTS ${"◆".repeat(Math.max(0, this.d.getHp()))}`);
  }
}
