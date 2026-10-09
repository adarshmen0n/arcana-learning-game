// Neon arcade DOM UI. Every flow function returns a Promise so the game can simply `await` it.
const UI = (() => {
  const $ = (s) => document.querySelector(s);
  const ov = $("#overlay"), frame = $("#frame");
  let keyFn = null, hideTimer = null, sceneRef = null;
  window.addEventListener("keydown", (e) => { if (e.target && e.target.closest && e.target.closest("input,textarea,[contenteditable],#arc")) return; keyFn && keyFn(e); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const isGo = (e) => e.key === "Enter" || e.key === " ";
  const mark = (text, words = []) => {
    let out = esc(text);
    for (const w of words) out = out.replace(new RegExp(esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), (m) => `<mark>${m}</mark>`);
    return out;
  };

  // button sounds via delegation
  document.addEventListener("mouseover", (e) => { const b = e.target.closest(".btn,.opt,.iconbtn,.seg button"); if (b && !b.disabled && b !== document._lastHover) { document._lastHover = b; Sound.hover(); } });
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".btn,.opt,.iconbtn,.seg button,.pickcard"); if (!b || b.disabled) return; Sound.click();
    const r = b.getBoundingClientRect(), s = document.createElement("span"); s.className = "rip"; s.style.left = e.clientX - r.left + "px"; s.style.top = e.clientY - r.top + "px"; b.appendChild(s); setTimeout(() => s.remove(), 650);
  });

  // ---- panels ----
  function show(html, mode = "modal", cls = "") {
    clearTimeout(hideTimer);
    const fresh = ov.classList.contains("hidden");
    ov.className = mode; ov.innerHTML = `<div class="panel ${cls}"><div class="in">${html}</div></div>`;
    if (fresh) Sound.open();
    return ov.firstElementChild;
  }
  function hide() {
    keyFn = null; const p = ov.querySelector(".panel"); if (p) p.classList.add("ghost");
    hideTimer = setTimeout(() => { ov.className = "hidden"; ov.innerHTML = ""; }, 210);
  }
  const onKey = (fn) => { keyFn = fn; };

  function card(html, cta = "Continue", mode = "modal", cls = "") {
    return new Promise((resolve) => {
      const p = show(`${html}<div class="row end"><button class="btn primary" id="go">${esc(cta)}</button></div>`, mode, cls);
      const go = () => { hide(); resolve(); };
      p.querySelector("#go").onclick = go; p.querySelector("#go").focus();
      onKey((e) => isGo(e) && (e.preventDefault(), go()));
    });
  }
  function choice(html, labels) {
    return new Promise((resolve) => {
      const p = show(`${html}<div class="row end">${labels.map((l, i) => `<button class="btn ${i === labels.length - 1 ? "primary" : ""}" data-i="${i}">${esc(l)}</button>`).join("")}</div>`);
      p.querySelectorAll("button").forEach((b) => (b.onclick = () => { hide(); resolve(+b.dataset.i); }));
      p.querySelector("button:last-child").focus();
    });
  }

  // ---- logo (uses assets/logo.png if present, otherwise an SVG recreation) ----
  const logoSVG = `
  <svg viewBox="0 0 640 560" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <linearGradient id="tx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8ff9a"/><stop offset=".5" stop-color="#6bff2a"/><stop offset="1" stop-color="#1fb80c"/></linearGradient>
      <linearGradient id="sc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6ff5a"/><stop offset="1" stop-color="#2fd10f"/></linearGradient>
    </defs>
    <g filter="url(#g)" stroke="#39ff14" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M178 360 L320 36 L462 360"/><path d="M222 360 L320 140 L418 360"/><path d="M150 360 L490 360" stroke-width="2" opacity=".7"/>
      <path d="M170 300 Q150 160 280 70" opacity=".8"/><path d="M470 300 Q490 160 360 70" opacity=".8"/>
      <path d="M142 330 Q118 170 262 52" opacity=".5"/><path d="M498 330 Q522 170 378 52" opacity=".5"/>
      <path d="M96 240 H130 L150 270 M96 240 V150 M96 150 H118" opacity=".8"/><circle cx="96" cy="140" r="5" fill="#39ff14"/>
      <path d="M544 240 H510 L490 270 M544 240 V150 M544 150 H522" opacity=".8"/><circle cx="544" cy="140" r="5" fill="#39ff14"/>
      <path d="M70 320 H120 L142 340 M70 320 V300" opacity=".6"/><path d="M570 320 H520 L498 340 M570 320 V300" opacity=".6"/>
      <path d="M210 380 Q320 330 430 380" stroke="#b6ff5a" stroke-width="3"/>
    </g>
    <g filter="url(#g)">
      <rect x="276" y="150" width="88" height="210" rx="6" fill="#06150a" stroke="#39ff14" stroke-width="3"/>
      <rect x="284" y="162" width="72" height="22" fill="#0b2a10" stroke="#39ff14" stroke-width="1.5"/>
      <rect x="288" y="194" width="64" height="48" rx="4" fill="url(#sc)" opacity=".9" stroke="#b6ff5a" stroke-width="2"/>
      <path d="M270 262 H370 L380 280 H260 Z" fill="#0b2a10" stroke="#39ff14" stroke-width="2"/>
      <circle cx="298" cy="270" r="4" fill="#b6ff5a"/><rect x="296" y="272" width="4" height="9" fill="#39ff14"/>
      <circle cx="328" cy="272" r="3" fill="#39ff14"/><circle cx="342" cy="272" r="3" fill="#39ff14"/><circle cx="356" cy="272" r="3" fill="#39ff14"/>
      <rect x="302" y="304" width="36" height="42" rx="3" fill="#06150a" stroke="#39ff14" stroke-width="2"/><rect x="312" y="316" width="6" height="6" fill="#39ff14"/><rect x="322" y="316" width="6" height="6" fill="#39ff14"/>
    </g>
    <g filter="url(#g)">
      <text x="320" y="468" text-anchor="middle" font-family="Orbitron, sans-serif" font-weight="900" font-size="108" letter-spacing="2" fill="url(#tx)" stroke="#0a6a05" stroke-width="2">ARCANA</text>
      <text x="320" y="534" text-anchor="middle" font-family="Orbitron, sans-serif" font-weight="800" font-size="52" letter-spacing="6" fill="url(#tx)">AI</text>
      <path d="M130 520 H262 M378 520 H510" stroke="#39ff14" stroke-width="3"/>
    </g>
  </svg>`;
  const logoHTML = () => `<img src="logo-title.png" alt="Arcana AI" onerror="this.outerHTML=window.__logoSVG">`;
  window.__logoSVG = logoSVG;

  // ---- server API (upload -> game) ----
  async function api(path, opt) {
    let r; try { r = await fetch(path, opt); } catch (e) { throw new Error("Cannot reach the Arcana server. Start it with: python server/server.py"); }
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Request failed (" + r.status + ")"); return j;
  }
  const readB64 = (file) => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1]); f.onerror = () => rej(new Error("Could not read the file")); f.readAsDataURL(file); });

  // ---- title screen (the student's own game) ----
  function title(script, info = {}) {
    return new Promise((resolve) => {
      const t = $("#title"); t.classList.remove("hidden");
      t.innerHTML = `
        <div class="logo">${logoHTML()}</div>
        <div class="menu">
          <button class="btn primary" id="play">${info.resume ? "Continue" : "Start"} <span class="tag">ENTER</span></button>
          <button class="btn" id="dash">Dashboard</button>
          <button class="btn ghost" id="controls">Controls</button>
        </div>
        <div class="foot">${esc(info.name || "")} // ${esc(script.title)}${info.resume ? " // chapter " + (info.resume.chapter + 1) : ""}</div>
        <div class="press">PRESS ENTER TO START</div>`;
      const go = () => { keyFn = null; resolve({}); };
      t.querySelector("#play").onclick = go;
      t.querySelector("#dash").onclick = () => { location.href = "/"; };
      t.querySelector("#controls").onclick = () => { keyFn = null; card(`<div class="kicker">Controls</div><h1>How to play</h1>${controlsHTML()}`, "Got it").then(rearm); };
      const rearm = () => onKey((e) => { if (e.key === "Enter" && ov.classList.contains("hidden")) go(); });
      rearm();
    });
  }
  const hideTitle = () => { const t = $("#title"); t.classList.add("hidden"); t.innerHTML = ""; };
  const controlsHTML = () => `<div class="keys-grid">
    <div><span class="kc">A</span><span class="kc">D</span> / <span class="kc">&larr;</span><span class="kc">&rarr;</span></div><div>Move</div>
    <div><span class="kc">W</span> / <span class="kc">SPACE</span></div><div>Jump</div>
    <div><span class="kc">SHIFT</span></div><div>Sprint (dodge in a fight)</div>
    <div><span class="kc">E</span></div><div>Talk, read a tablet, enter. In a fight: execute a stunned enemy</div>
    <div><span class="kc">J</span></div><div>Strike chain (4th hit launches)</div>
    <div><span class="kc">K</span> / hold <span class="kc">K</span></div><div>Kick / charged guard breaker</div>
    <div><span class="kc">U</span> &middot; <span class="kc">L</span></div><div>Launcher &middot; grab and throw</div>
    <div><span class="kc">S</span>+<span class="kc">J</span> &middot; tap <span class="kc">S</span></div><div>Sweep &middot; perfect parry as a hit lands</div>
    <div>air <span class="kc">J</span> / <span class="kc">K</span> / <span class="kc">S</span>+<span class="kc">K</span></div><div>Air combo / dive kick / ground slam</div>
    <div><span class="kc">1</span>-<span class="kc">4</span></div><div>Powers in a fight; answers in a quiz</div>
    <div><span class="kc">Q</span></div><div>Open Arc Search (locked during quests)</div>
    <div><span class="kc">M</span></div><div>Mute sound</div></div>`;

  // ---- HUD ----
  const IC = {
    heart: '<path d="M12 21s-7.5-4.8-9.6-9.4A5.4 5.4 0 0 1 12 6.1a5.4 5.4 0 0 1 9.6 5.5C19.500 16.200 12 21 12 21z"/>',
    star: '<path d="M12 2.8l2.9 5.9 6.5.9-4.700 4.600 1.100 6.500L12 17.600l-5.800 3.100 1.100-6.500L2.600 9.600l6.500-.9z"/>',
    flame: '<path d="M12 22c4 0 7-2.800 7-6.800 0-3-1.800-5-3.500-7.200-.4 1.400-1.200 2.300-2.200 2.700C13.500 7.200 12.500 4.500 10 2c.2 3.600-5 6.200-5 12.200C5 19.200 8 22 12 22z"/>',
    talk: '<path d="M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    swords: '<path d="M4 4l9 9M20 4l-9 9M3 21l4-4M21 21l-4-4M13 13l-3 3M11 13l3 3"/>',
    scroll: '<path d="M7 3h11a2 2 0 0 1 2 2v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    pad: '<rect x="2.500" y="7" width="19" height="11" rx="5"/><path d="M7 10v5M4.500 12.500h5"/><circle cx="16" cy="11.500" r=".9"/><circle cx="18.500" cy="13.500" r=".9"/>',
    book: '<path d="M4 4.500A2.500 2.500 0 0 1 6.500 2H20v17H6.500A2.500 2.500 0 0 0 4 21.500z"/><path d="M8 7h8M8 11h6"/>',
    skull: '<path d="M12 2.500c-4.700 0-8 3.200-8 7.300 0 2.500 1.300 4.300 3 5.300V19h3v-2h4v2h3v-3.900c1.700-1 3-2.800 3-5.300 0-4.100-3.300-7.300-8-7.300z"/><circle cx="8.800" cy="10.500" r="1.500"/><circle cx="15.200" cy="10.500" r="1.500"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.500a5 5 0 0 1 0 7"/>',
    muted: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  };
  const icon = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${IC[name] || ""}</svg>`;
  const STATION = { npc: "talk", obstacle: "lock", match: "swords", mission: "scroll", maze: "pad", shooter: "pad", snake: "pad", hill: "pad", level_test: "book", mini_boss: "skull", final_boss: "skull", combat: "swords", tablet: "book" };
  let player = { name: "Ranger", gender: "m" };
  function setPlayer(name, gender) { player = { name, gender }; const n = $("#pname"); if (n) n.textContent = name.toUpperCase(); const a = $("#avatar"); if (a) a.style.backgroundImage = ""; }
  let hudBuilt = false, shownScore = 0, scoreTarget = 0, scoreRaf = 0, lastScore = 0, lastHp = null, lastLevel = 1;
  function buildHud() {
    $("#hud").innerHTML = `
      <div class="hp"><div class="avwrap"><svg class="ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" class="trk"/><circle id="xpring" cx="32" cy="32" r="29" class="arc"/></svg><div class="avatar" id="avatar"></div><div class="lvl" id="lvl">1</div></div>
        <div class="hpcol"><div class="name" id="pname">RANGER</div><div class="hearts" id="hearts"></div></div></div>
      <div class="mid"><div id="chapter-name"></div><div id="track"></div><div id="objective"></div></div>
      <div class="right"><div id="streak" class="hidden">${icon("flame")}<b id="streakn">0</b></div><div id="score">${icon("star", "gold")}<span id="scoreval">0</span><div id="pops"></div></div><button class="iconbtn menubtn" id="pausebtn" title="Pause menu: save, exit, sound (Esc)"><b>II</b><span>MENU</span></button><button class="iconbtn" id="full" title="Fullscreen">${icon("full")}</button><button class="iconbtn" id="mute" title="Mute (M)">${icon("sound")}</button></div>`;
    $("#mute").onclick = toggleMute; $("#full").onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }; hudBuilt = true; setPlayer(player.name, player.gender);
  }
  function toggleMute() { const m = Sound.toggle(); $("#mute").classList.toggle("off", m); $("#mute").innerHTML = icon(m ? "muted" : "sound"); }
  addEventListener("keydown", (e) => { if (e.key.toLowerCase() === "m" && hudBuilt && !$("#hud").classList.contains("hidden")) toggleMute(); });
  function setAvatar() { try { const c = sceneRef.textures.get(sceneRef.hero.id + "_head").getSourceImage(), cv = document.createElement("canvas"); cv.width = cv.height = 120; const x = cv.getContext("2d"), s = Math.min(100 / c.width, 100 / c.height); x.drawImage(c, (120 - c.width * s) / 2, 12, c.width * s, c.height * s); $("#avatar").style.backgroundImage = `url(${cv.toDataURL()})`; } catch (e) {} }
  const lvlOf = (s) => 1 + Math.floor(s / 250);
  function scorePop(txt, cls = "") { const p = document.createElement("i"); p.className = "pop " + cls; p.textContent = txt; $("#pops").appendChild(p); setTimeout(() => p.remove(), 1100); }
  function hud({ title, hp, maxHp, score, done, total, types = [], next = "", streak = 0 }) {
    if (!hudBuilt) buildHud(); const h = $("#hud"); h.classList.remove("hidden");
    $("#chapter-name").textContent = title;
    const hearts = $("#hearts"); if (hearts.children.length !== maxHp) hearts.innerHTML = Array.from({ length: maxHp }, () => `<span class="hrt">${icon("heart")}</span>`).join("");
    [...hearts.children].forEach((s, i) => { const on = i < hp, was = s.classList.contains("on"); if (was && !on) { s.classList.add("lost"); setTimeout(() => s.classList.remove("lost"), 700); } s.classList.toggle("on", on); });
    if (lastHp !== null && hp > lastHp) toast("Hearts restored", true); lastHp = hp;
    const track = $("#track"); if (track.children.length !== types.length) track.innerHTML = types.map((t) => `<div class="stn"><i>${icon(STATION[t] || "star")}</i></div>`).join("");
    track.classList.toggle("dense", types.length > 11); track.classList.toggle("xdense", types.length > 16);   // long chapters: smaller step icons so the bar fits
    [...track.children].forEach((n, i) => { n.classList.toggle("done", i < done); n.classList.toggle("cur", i === done); });
    const cur = track.children[done]; if (cur && track.scrollWidth > track.clientWidth) track.scrollLeft = cur.offsetLeft - track.clientWidth / 2;
    const obj = $("#objective"); if (obj.dataset.txt !== next) { obj.dataset.txt = next; obj.innerHTML = next ? `<span>OBJECTIVE</span> ${esc(next)}` : ""; obj.classList.remove("flash"); void obj.offsetWidth; obj.classList.add("flash"); }
    const d = score - lastScore; if (d > 0) scorePop("+" + d, d >= 50 ? "big" : ""); lastScore = score;
    const lv = lvlOf(score); $("#lvl").textContent = lv; $("#xpring").style.strokeDashoffset = String(182 * (1 - (score % 250) / 250));
    if (lv > lastLevel) { toast("LEVEL UP: " + lv, true); Sound.win(); $("#lvl").classList.add("up"); setTimeout(() => $("#lvl").classList.remove("up"), 1200); } lastLevel = lv;
    const st = $("#streak"); st.classList.toggle("hidden", streak < 2); $("#streakn").textContent = "x" + streak;
    scoreTarget = score; cancelAnimationFrame(scoreRaf);
    const tick = () => { shownScore += Math.ceil((scoreTarget - shownScore) * 0.15) || 0; if (Math.abs(scoreTarget - shownScore) < 1) shownScore = scoreTarget; $("#scoreval").textContent = String(shownScore).padStart(5, "0"); if (shownScore !== scoreTarget) scoreRaf = requestAnimationFrame(tick); };
    tick(); if (!$("#avatar").style.backgroundImage) setAvatar();
  }
  function combo(n) { const c = document.createElement("div"); c.className = "combo"; c.innerHTML = `${icon("flame")}<b>x${n}</b><span>${n >= 8 ? "UNSTOPPABLE" : n >= 5 ? "ON FIRE" : "COMBO"}</span>`; frame.appendChild(c); Sound.collect(); setTimeout(() => c.remove(), 1500); }
  const hideHud = () => { $("#hud").classList.add("hidden"); };
  function hint(on, html) { const h = $("#hint"); if (on) { h.className = ""; h.innerHTML = html; setTimeout(() => h.classList.add("fade"), 9000); } else h.className = "hidden"; }
  function bossBar(on, d = {}) {
    const b = $("#bossbar"); $("#hud").classList.toggle("boss", !!on); if (!on) { b.className = "hidden"; return; }
    b.className = ""; b.innerHTML = `<div class="bname">${esc(d.name)}</div><div class="track"><div class="fill boss" style="width:${d.pct}%"></div></div><div class="sub"><span>${esc(d.left)}</span><span>${esc(d.right)}</span></div>`;
  }
  function toast(msg, good) { const t = document.createElement("div"); t.className = "toast" + (good ? " good" : ""); t.textContent = msg; frame.appendChild(t); setTimeout(() => t.remove(), 2400); }
  function flash() { const f = $("#flash"); f.className = ""; void f.offsetWidth; f.className = "hit"; }
  const touch = (on) => $("#touch").classList.toggle("hidden", !on);

  // ---- cinematic transitions ----
  async function wipe(mid) {
    const w = $("#wipe"); Sound.whoosh(); w.className = "in"; await sleep(700);
    if (mid) await mid(); w.className = "out"; await sleep(750); w.className = "";
  }
  const cine = (on) => $("#cine").classList.toggle("on", on);
  async function chapterCard({ kicker, title, sub, boss }) {
    cine(true); await sleep(500);
    const c = $("#card"); c.innerHTML = `<div class="card ${boss ? "boss" : ""}"><div><div class="k">${esc(kicker)}</div><div class="big">${esc(title)}</div><div class="ln"></div><div class="sub">${esc(sub || "")}</div></div></div>`;
    boss ? Sound.boss() : Sound.win();
    await new Promise((r) => { const done = () => { removeEventListener("keydown", done); r(); }; setTimeout(done, boss ? 3000 : 3400); addEventListener("keydown", done); });
    c.firstElementChild.classList.add("out"); cine(false); await sleep(520); c.innerHTML = "";
  }

  // ---- dialogue (typewriter) ----
  function portraitURL(id) {
    try { const src = sceneRef.textures.get(`${id}_head`).getSourceImage(); const cv = document.createElement("canvas"); cv.width = cv.height = 128; const x = cv.getContext("2d"); const s = Math.min(112 / src.width, 112 / src.height); x.drawImage(src, (128 - src.width * s) / 2, (128 - src.height * s) / 2, src.width * s, src.height * s); return cv.toDataURL(); } catch (e) { return ""; }
  }
  const ROLE = { intro: "INTRODUCTION", core: "CORE LESSON", deep: "DEEP DIVE", recap: "RECAP", review: "PERSONAL REVIEW", more: "MORE TO KNOW" };
  function dialogue(npc, lines, { teacherNote, keyIdea, role } = {}) {
    return new Promise((resolve) => {
      let i = 0, timer = null, full = "", pos = 0;
      const p = show(`
        <div class="who"><div class="portrait"><img src="${portraitURL(npc.look)}" alt=""></div><div><div class="name">${esc(npc.name)}</div><div class="hintkey">${ROLE[role] || "LESSON"}</div></div>
          <div class="lprog">${lines.map((_, n) => `<i data-n="${n}"></i>`).join("")}</div></div>
        <p id="txt" class="lesson" style="min-height:3.6em"></p><div id="note"></div>
        <div class="row between"><button class="btn" id="back">&larr; Back</button><span class="hintkey">SPACE NEXT &middot; &larr; BACK</span><button class="btn primary" id="go">Next</button></div>`, "dock", "compact lessonbox");
      const txt = p.querySelector("#txt"), go = p.querySelector("#go"), back = p.querySelector("#back"), note = p.querySelector("#note"), dots = [...p.querySelectorAll(".lprog i")];
      const typing = () => pos < full.length;
      const paint = () => { dots.forEach((d, n) => { d.classList.toggle("on", n < i); d.classList.toggle("cur", n === i); }); back.disabled = i === 0; };
      const finish = () => {
        clearInterval(timer); pos = full.length; txt.innerHTML = mark(lines[i].text, lines[i].highlight); go.textContent = i === lines.length - 1 ? "Got it" : "Next";
        if (i === lines.length - 1) note.innerHTML = (keyIdea ? `<div class="keyidea"><b>KEY IDEA</b>${esc(keyIdea)}</div>` : "") + (teacherNote ? `<div class="study-tip"><b>Study tip:</b> ${esc(teacherNote)}</div>` : "");
      };
      const start = () => { full = lines[i].text; pos = 0; txt.textContent = ""; note.innerHTML = ""; go.textContent = "Skip"; paint(); clearInterval(timer); timer = setInterval(() => { pos += 2; txt.innerHTML = esc(full.slice(0, pos)) + '<span class="caret"></span>'; if (!typing()) finish(); }, 16); };
      const advance = () => { if (typing()) return finish(); if (i < lines.length - 1) { i++; start(); } else { clearInterval(timer); hide(); if (self.onLearn) self.onLearn({ kind: "lesson", from: npc.name, role, lines: lines.map((l) => l.text), keyIdea }); resolve(); } };
      const prev = () => { if (i > 0) { i--; start(); finish(); } };
      go.onclick = advance; back.onclick = prev;
      onKey((e) => { if (isGo(e)) { e.preventDefault(); advance(); } else if (e.key === "ArrowLeft" || e.key === "Backspace") { e.preventDefault(); prev(); } }); start();
    });
  }
  function tablet(t) {
    return new Promise((resolve) => {
      const terms = (t.terms || []).map(([k, v]) => k);
      const p = show(`<div class="kicker">Knowledge tablet</div><h1 class="tab-title">${esc(t.title)}</h1>
        <ol class="tpoints">${t.points.map((x, n) => `<li style="--i:${n}">${mark(x, terms)}</li>`).join("")}</ol>
        ${t.example ? `<div class="tbox ex"><b>EXAMPLE</b>${esc(t.example)}</div>` : ""}
        ${t.mistake ? `<div class="tbox warn"><b>COMMON MISTAKE</b>${esc(t.mistake)}</div>` : ""}
        ${(t.terms || []).length ? `<div class="tterms">${t.terms.map(([k, v]) => `<span><b>${esc(k)}</b>${esc(v)}</span>`).join("")}</div>` : ""}
        <div class="row end"><button class="btn primary" id="go">I have read it</button></div>`, "modal", "wide tabletbox");
      const go = () => { hide(); if (self.onLearn) self.onLearn({ kind: "tablet", title: t.title, points: t.points, example: t.example, mistake: t.mistake, terms: t.terms }); resolve(); };
      p.querySelector("#go").onclick = go; onKey((e) => isGo(e) && (e.preventDefault(), go()));
    });
  }

  // ---- questions ----
  function ask(q, opts = {}) {
    const { header = "", explain = false, reveal = true, hint = "", counter = "", cta, dock = false, eliminate = 0 } = opts;
    return new Promise((resolve) => {
      const t0 = Date.now(), order = shuffle(q.options.map((_, i) => i));
      const p = show(`${header}${counter ? `<div class="qcount">${esc(counter)}</div>` : ""}
        <h2>${esc(q.prompt)}</h2>
        <div class="opts">${order.map((oi, n) => `<button class="opt" style="--i:${n}" data-i="${oi}"><span class="key">${n + 1}</span>${esc(q.options[oi])}</button>`).join("")}</div>
        <div id="fb"></div><div class="row end" id="actions"></div>`, dock ? "dock" : "modal", dock ? "wide compact" : "wide");
      const btns = [...p.querySelectorAll(".opt")]; let done = false;
      if (eliminate) { const wrong = shuffle(btns.filter((b) => +b.dataset.i !== q.correctIndex)).slice(0, eliminate); wrong.forEach((b) => { b.disabled = true; b.classList.add("struck"); }); }
      const pick = (btn) => {
        if (done) return; done = true;
        const idx = +btn.dataset.i, correct = idx === q.correctIndex; btns.forEach((b) => (b.disabled = true));
        btn.classList.add(correct ? "correct" : "wrong"); if (reveal || correct) btns.find((b) => +b.dataset.i === q.correctIndex).classList.add("correct");
        correct ? Sound.correct() : Sound.wrong(); if (self.onAnswer) self.onAnswer(correct, q, { ms: Date.now() - t0, hints: !correct && hint && !reveal ? 1 : 0 });
        let fb = correct ? "✔ Correct!" : "✖ Not quite."; if (!correct && hint && !reveal) fb += ` Hint: ${esc(hint)}`;
        if (q.explanation && (correct || reveal || explain)) fb += ` ${esc(q.explanation)}`;
        if (q.evidence && (correct || reveal || explain)) fb += `<div class="evi"><b>From your notes</b> &ldquo;${esc(q.evidence)}&rdquo;</div>`;
        p.querySelector("#fb").innerHTML = `<div class="feedback ${correct ? "" : "bad"}">${fb}</div>`;
        p.querySelector("#actions").innerHTML = `<button class="btn" id="rep" title="Tell us this question is wrong or unclear">Report</button><button class="btn primary" id="go">${cta || (!correct && !reveal ? "Try again" : "Continue")}</button>`;
        p.querySelector("#rep").onclick = (ev) => { ev.currentTarget.disabled = true; ev.currentTarget.textContent = "Thanks"; self.onReport && self.onReport(q); };
        const go = () => { hide(); resolve({ correct, conceptId: q.conceptId }); };
        p.querySelector("#go").onclick = go; p.querySelector("#go").focus(); onKey((e) => isGo(e) && (e.preventDefault(), go()));
      };
      btns.forEach((b) => (b.onclick = () => pick(b)));
      onKey((e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= btns.length && !btns[n - 1].disabled) pick(btns[n - 1]); });
    });
  }

  // ---- missions ----
  function missionOrder(m, { wrong }) {
    return new Promise((resolve) => {
      let next = 0; const items = shuffle(m.items.map((t, i) => ({ t, i })));
      const p = show(`<div class="kicker">Mission</div><p>${esc(m.instruction)}</p>
        <div class="order-list">${m.items.map((_, n) => `<div class="slot" data-n="${n}">${n + 1}.</div>`).join("")}</div>
        <div class="opts" id="pool">${items.map((it) => `<button class="opt" data-i="${it.i}">${esc(it.t)}</button>`).join("")}</div>`, "modal", "wide");
      p.querySelectorAll("#pool .opt").forEach((b) => (b.onclick = () => {
        if (+b.dataset.i === next) { const s = p.querySelector(`.slot[data-n="${next}"]`); s.textContent = `${next + 1}. ${m.items[next]}`; s.classList.add("filled"); Sound.collect(); b.remove(); next++; if (next === m.items.length) setTimeout(() => card(`<div class="kicker">Mission</div><h1>Complete!</h1><p>Perfect order.</p>`).then(resolve), 350); }
        else { b.classList.add("wrong"); Sound.wrong(); wrong(); setTimeout(() => b.classList.remove("wrong"), 360); }
      }));
    });
  }
  function missionPairs(m, { wrong }) {
    return new Promise((resolve) => {
      const L0 = shuffle(m.pairs.map((pr, i) => ({ t: pr[0], i }))), R0 = shuffle(m.pairs.map((pr, i) => ({ t: pr[1], i }))); let sel = null, left = m.pairs.length;
      const p = show(`<div class="kicker">Mission</div><p>${esc(m.instruction)}</p><div class="pairs"><div class="opts" id="L">${L0.map((x) => `<button class="opt" data-i="${x.i}">${esc(x.t)}</button>`).join("")}</div><div class="opts" id="R">${R0.map((x) => `<button class="opt" data-i="${x.i}">${esc(x.t)}</button>`).join("")}</div></div>`, "modal", "wide");
      const L = [...p.querySelectorAll("#L .opt")], Rr = [...p.querySelectorAll("#R .opt")];
      L.forEach((b) => (b.onclick = () => { if (b.classList.contains("done")) return; L.forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); sel = b; }));
      Rr.forEach((b) => (b.onclick = () => {
        if (!sel || b.classList.contains("done")) return;
        if (sel.dataset.i === b.dataset.i) { sel.classList.remove("sel"); sel.classList.add("done"); b.classList.add("done"); sel = null; Sound.collect(); if (--left === 0) setTimeout(() => card(`<div class="kicker">Mission</div><h1>Complete!</h1><p>All pairs matched.</p>`).then(resolve), 350); }
        else { b.classList.add("wrong"); Sound.wrong(); wrong(); setTimeout(() => b.classList.remove("wrong"), 360); }
      }));
    });
  }
  const bars = (rows) => `<div class="bars">${rows.map((r) => `<div class="bar"><span>${esc(r.label)}</span><div class="track"><div class="fill ${r.cls}" style="width:${r.pct}%"></div></div><span>${esc(r.val)}</span></div>`).join("")}</div>`;

  const self = { onAnswer: null, onReport: null, onLearn: null, tablet, combo, icon, setPlayer, api, $, sleep, esc, shuffle, show, hide, card, choice, title, hideTitle, hud, hideHud, hint, bossBar, toast, flash, touch, wipe, cine, chapterCard, dialogue, ask, missionOrder, missionPairs, bars, controlsHTML, setScene: (s) => (sceneRef = s) };
  return self;
})();
