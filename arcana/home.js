// ARCANA student home: login, performance, the personal adaptive setup, the learning roadmap, uploads and games.
// All text that comes from the server or from uploaded material is escaped before it is shown.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app");
const S = { user: null, rm: null, games: [], sel: null, job: null };

async function api(path, method = "GET", body) {
  const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed (" + r.status + ")");
  return j;
}
const toast = (m) => { const t = document.createElement("div"); t.className = "toast"; t.textContent = m; $("#toasts").appendChild(t); setTimeout(() => t.remove(), 3200); };
const pct = (m) => (m == null ? "-" : Math.round(m * 100) + "%");
const tone = (m) => (m == null ? "" : m >= 0.7 ? "" : m >= 0.45 ? "mid" : "bad");

// ------------------------------------------------------------------ account
function authView(msg = "") {
  let mode = "login", gender = "m";
  const draw = () => {
    app.innerHTML = `<div class="card auth"><h1>Your personal ARCANA</h1><p class="muted">Upload your own notes. A game is built just for you, and it learns how you study: it changes its difficulty, hints and practice to fit you, and draws a roadmap of what to learn next.</p>
      <div class="tabs"><button class="${mode === "login" ? "on" : ""}" data-m="login">Log in</button><button class="${mode === "register" ? "on" : ""}" data-m="register">Create account</button></div>
      <form id="f">${mode === "register" ? `<h3>Choose your ranger</h3><div class="pick"><button type="button" class="pickc ${gender === "m" ? "sel" : ""}" data-g="m"><i>&#9794;</i><b>Man</b></button><button type="button" class="pickc ${gender === "f" ? "sel" : ""}" data-g="f"><i>&#9792;</i><b>Woman</b></button></div>` : ""}
      <label>Username<input name="username" maxlength="20" autocomplete="username" required></label>
      <label>Password<input name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="${mode === "register" ? 8 : 1}" required></label>
      <div id="e">${msg ? `<div class="err">${esc(msg)}</div>` : ""}</div><button class="primary" style="width:100%">${mode === "login" ? "Log in" : "Create account"}</button>
      <p class="muted small">You stay logged in on this device until you log out.${mode === "register" ? " There is no email, so keep your password safe: it cannot be reset." : ""}</p></form></div>`;
    app.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { mode = b.dataset.m; msg = ""; draw(); }));
    app.querySelectorAll(".pickc").forEach((b) => (b.onclick = () => { gender = b.dataset.g; draw(); }));
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); if (mode === "register") d.gender = gender;
      try { await api(mode === "login" ? "/api/login" : "/api/register", "POST", d); await boot(); } catch (er) { $("#e").innerHTML = `<div class="err">${esc(er.message)}</div>`; }
    };
  };
  draw();
}
async function logout() { await api("/api/logout", "POST"); S.user = null; $("#who").innerHTML = ""; authView(); }

function profileDialog() {
  const d = document.createElement("dialog");
  d.innerHTML = `<h2>${esc(S.user.username)}</h2><h3>Your ranger</h3><div class="pick"><button class="pickc ${S.user.gender === "m" ? "sel" : ""}" data-g="m"><i>&#9794;</i><b>Man</b></button><button class="pickc ${S.user.gender === "f" ? "sel" : ""}" data-g="f"><i>&#9792;</i><b>Woman</b></button></div>
    <h3>Danger zone</h3><p class="muted small">Deleting your account permanently removes your games, answers, mastery and roadmap.</p><div class="row between"><button class="danger" id="del">Delete my account</button><button id="close">Close</button></div>`;
  document.body.appendChild(d); d.showModal();
  d.querySelectorAll(".pickc").forEach((b) => (b.onclick = async () => { await api("/api/profile", "POST", { gender: b.dataset.g }); S.user.gender = b.dataset.g; d.close(); d.remove(); toast("Ranger updated"); }));
  $("#close", d).onclick = () => { d.close(); d.remove(); };
  $("#del", d).onclick = async () => { if (confirm("Delete your account and everything in it? This cannot be undone.")) { await api("/api/account", "DELETE"); d.close(); d.remove(); S.user = null; $("#who").innerHTML = ""; authView(); } };
}

// ------------------------------------------------------------------ dashboard
async function load() {
  [S.rm, S.games] = await Promise.all([api("/api/roadmap"), api("/api/games")]);
}
function dash() {
  const { stats: st, adaptation: ad, next, achievements, games } = S.rm;
  $("#who").innerHTML = `<button class="ghost" id="prof">${S.user.gender === "f" ? "&#9792;" : "&#9794;"} ${esc(S.user.username)}</button><button class="ghost" id="out">Log out</button>`;
  $("#prof").onclick = profileDialog; $("#out").onclick = logout;
  const diffDots = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= ad.difficulty ? "on" : ""}"></i>`).join("");
  app.innerHTML = `
  <section class="card hero"><div class="lvl">${st.level}<small>LEVEL</small></div><div>
    <h1>Welcome back, ${esc(S.user.username)}</h1><div class="xp"><i style="width:${Math.round(st.xpInLevel / 5)}%"></i></div><div class="muted small">${st.xpInLevel} / 500 XP to level ${st.level + 1}</div>
    <div class="next">${next.length ? next.map((n, i) => `<div class="nx"><span><span class="k">${esc(n.kind.toUpperCase())}</span>${esc(n.text)}</span>${n.game ? `<a class="btn ${i === 0 ? "primary" : ""}" href="/play.html?game=${encodeURIComponent(n.game)}">${n.kind === "continue" ? "Continue" : "Go"}</a>` : `<button data-up>Upload</button>`}</div>`).join("") : '<div class="nx"><span>Upload notes to start your personal path</span><button data-up class="primary">Upload</button></div>'}</div></div></section>
  <div class="grid2">
    <section class="card"><h2>Your performance</h2><div class="stats">
      <div class="stat"><b>${st.accuracy == null ? "-" : st.accuracy + "%"}</b><span>Accuracy</span><em>${st.recentAccuracy == null ? "" : "recent: " + st.recentAccuracy + "%"}${st.trend == null ? "" : " (" + (st.trend >= 0 ? "+" : "") + st.trend + ")"}</em></div>
      <div class="stat"><b>${st.answers}</b><span>Answers</span></div><div class="stat"><b>${st.pace == null ? "-" : st.pace + "s"}</b><span>Pace per answer</span></div>
      <div class="stat"><b>${st.bestStreak}</b><span>Best streak</span></div><div class="stat"><b>${st.topics}</b><span>Topics tracked</span></div><div class="stat"><b>${st.gamesFinished}</b><span>Games finished</span></div></div>
      <h3>Weak topics</h3><div class="chips">${st.weak.length ? st.weak.map((t) => `<span class="chip weak">${esc(t.name)} ${pct(t.mastery)}</span>`).join("") : '<span class="muted small">None yet. Weak topics appear after a few mistakes.</span>'}</div>
      <h3>Strong topics</h3><div class="chips">${st.strong.length ? st.strong.map((t) => `<span class="chip strong">${esc(t.name)} ${pct(t.mastery)}</span>`).join("") : '<span class="muted small">Keep playing to build mastery.</span>'}</div></section>
    <section class="card"><h2>How ARCANA teaches you</h2><div class="row"><span class="badge ${esc(ad.style)}">${esc(ad.style)}</span><span class="muted small">difficulty ${ad.difficulty} of 5 // ${ad.maxHearts} hearts</span></div><div class="dots">${diffDots}</div>
      <p>${esc(ad.why)}</p><p class="muted small">This setup is only yours and updates every chapter: hearts, boss size, rival skill, hints, explanations and extra practice on your weak topics.</p></section>
  </div>
  <section class="card"><div class="row between"><h2>Your learning roadmap</h2><span class="muted small">click a stop for details</span></div>${games.map((g, gi) => roadBlock(g, gi)).join("")}
    <div class="legend"><span><i style="background:var(--neon)"></i>done</span><span><i style="background:var(--gold)"></i>mastered</span><span><i style="background:var(--bad)"></i>needs review</span><span><i style="background:#fff"></i>you are here</span><span><i style="background:#1d5a14"></i>locked</span></div><div id="detail"></div></section>
  <div class="grid2">
    <section class="card"><h2>Your games</h2><div class="list">${S.games.map((g) => `<div class="item"><div><b>${esc(g.title)}</b><div class="tag">${g.starter ? "STARTER // " : ""}${g.progress ? (g.progress.finished ? "FINISHED" : "CHAPTER " + (g.progress.chapter + 1)) + " // " + g.progress.score + " PTS" : "NEW"}</div></div><div class="row"><a class="btn" href="/play.html?game=${encodeURIComponent(g.id)}">${g.progress && !g.progress.finished ? "Continue" : "Play"}</a>${g.starter ? "" : `<button class="danger" data-del="${esc(g.id)}">Delete</button>`}</div></div>`).join("")}</div></section>
    <section class="card" id="upcard"><h2>Make a game from your notes</h2><p class="muted small" id="note"></p>
      <label class="drop" id="drop"><input type="file" id="file" hidden accept=".pdf,.docx,.pptx,.txt,.md,.html,.htm,.csv,.png,.jpg,.jpeg,.webp"><b id="dropt">Click to choose a file, or drop it here</b><span class="muted small">PDF, DOCX, PPTX, TXT, MD, HTML or an image (max 25 MB)</span></label>
      <label>...or paste your notes<textarea id="paste" rows="3" placeholder="Paste at least a few paragraphs"></textarea></label><div id="msg"></div><button class="primary" id="go">Create my game</button></section>
  </div>
  <section class="card"><h2>Achievements</h2><div class="ach">${achievements.map((a) => `<span class="a ${a.earned ? "on" : ""}">${a.earned ? "&#9733; " : ""}${esc(a.name)}</span>`).join("")}</div></section>`;
  app.querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => $("#upcard").scrollIntoView({ behavior: "smooth" })));
  app.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { if (confirm("Delete this game and your progress in it?")) { await api("/api/games/" + b.dataset.del, "DELETE"); await refresh(); } }));
  wireRoad(); wireUpload();
}

// ------------------------------------------------------------------ roadmap (SVG snake path, one per game)
function roadBlock(g, gi) {
  const per = 5, dx = 190, dy = 150, x0 = 90, y0 = 64, n = g.nodes.length, rows = Math.ceil(n / per), W = x0 * 2 + dx * (per - 1), H = y0 + dy * (rows - 1) + 96;
  const pos = (i) => { const r = Math.floor(i / per), c = i % per; return [r % 2 ? x0 + dx * (per - 1 - c) : x0 + dx * c, y0 + dy * r]; };
  let paths = "", nodes = "";
  g.nodes.forEach((nd, i) => {
    const [x, y] = pos(i);
    if (i < n - 1) {
      const [x2, y2] = pos(i + 1), d = y2 === y ? `M${x} ${y}L${x2} ${y2}` : `M${x} ${y}C${x + (x > W / 2 ? 90 : -90)} ${y + 20} ${x2 + (x2 > W / 2 ? 90 : -90)} ${y2 - 20} ${x2} ${y2}`;
      paths += `<path class="rpath ${["done", "mastered", "review"].includes(nd.status) ? "done" : ""}" d="${d}"/>`;
    }
    const label = nd.title.length > 20 ? nd.title.slice(0, 19) + "…" : nd.title;
    nodes += `<g class="node ${nd.status}" data-g="${gi}" data-i="${i}" transform="translate(${x} ${y})">${nd.status === "current" ? '<circle class="ring" r="26"/>' : ""}<circle class="b" r="26"/><text class="n" y="6">${nd.final ? "&#9733;" : i + 1}</text><text class="t" y="48">${esc(label)}</text><text class="m" y="64">${nd.mastery == null ? "" : pct(nd.mastery)}</text></g>`;
  });
  const cur = g.nodes.find((x) => x.status === "current");
  return `<div class="road"><div class="row between" style="margin-top:6px"><h3 style="margin:0">${esc(g.title)}</h3>${g.finished ? '<span class="badge">finished</span>' : cur ? `<a class="btn" href="/play.html?game=${encodeURIComponent(g.id)}">Continue</a>` : ""}</div><svg viewBox="0 0 ${W} ${H}">${paths}${nodes}</svg></div>`;
}
function wireRoad() {
  app.querySelectorAll(".node").forEach((el) => (el.onclick = () => {
    const g = S.rm.games[+el.dataset.g], nd = g.nodes[+el.dataset.i]; if (nd.status === "locked") return toast("Finish the earlier chapters to unlock this one");
    const say = { done: "Completed.", mastered: "Completed and mastered. Great work.", review: "Completed, but your mastery here is low. ARCANA will queue practice for it.", current: "This is your next stop." }[nd.status];
    $("#detail").innerHTML = `<div class="detail"><div class="row between"><h2 style="margin:0">${esc(nd.title)}</h2><a class="btn ${nd.status === "current" ? "primary" : ""}" href="/play.html?game=${encodeURIComponent(g.id)}${nd.status === "current" ? "" : "&ch=" + nd.index}">${nd.status === "current" ? "Play now" : "Replay"}</a></div>
      <p class="muted">${esc(nd.goal)}</p><p>${say}</p><h3>Topics in this stop</h3>${nd.concepts.length ? nd.concepts.map((c) => `<div class="cbar"><span>${esc(c.name)}</span><div class="bar ${tone(c.mastery)}"><i style="width:${Math.round((c.mastery || 0) * 100)}%"></i></div><b>${pct(c.mastery)}</b></div>`).join("") : '<p class="muted small">No topics yet.</p>'}
      ${nd.concepts.some((c) => c.mastery == null) ? '<p class="muted small">Topics without a bar have not been asked yet.</p>' : ""}</div>`;
    $("#detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }));
}

// ------------------------------------------------------------------ upload
function wireUpload() {
  let file = null;
  api("/api/status").then((s) => { $("#note").textContent = s.llm ? `AI is on (${s.model}). If one service is busy, the next one takes over.` : "No AI key is set on this server, so a simpler offline game will be made."; }).catch(() => {});
  const setFile = (f) => { file = f; $("#dropt").textContent = f ? `${f.name} (${Math.round(f.size / 1024)} KB)` : "Click to choose a file, or drop it here"; };
  $("#file").onchange = (e) => setFile(e.target.files[0] || null);
  const drop = $("#drop"); drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); }; drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); };
  $("#go").onclick = async () => {
    const text = $("#paste").value.trim();
    if (!file && text.length < 200) return ($("#msg").innerHTML = '<div class="err">Choose a file or paste at least a few paragraphs.</div>');
    if (file && file.size > 25 * 1024 * 1024) return ($("#msg").innerHTML = '<div class="err">That file is over 25 MB.</div>');
    $("#go").disabled = true; $("#msg").innerHTML = "";
    try {
      const data = file ? await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(file); }) : null;
      const job = await api("/api/jobs", "POST", file ? { filename: file.name, data } : { filename: "pasted-notes.txt", text });
      $("#msg").innerHTML = '<div class="pbar"><i id="pf"></i></div><p id="pm" class="muted small"></p><div id="pb"></div>';
      const tick = async () => {
        const j = await api("/api/jobs/" + job.id);
        $("#pf").style.width = j.pct + "%"; $("#pm").textContent = j.error ? j.error : j.message + (j.total ? ` (${j.ready}/${j.total} chapters)` : "");
        if (j.ready >= 1 && j.script && j.status !== "done") $("#pb").innerHTML = `<a class="btn primary" href="/play.html?job=${encodeURIComponent(job.id)}">Play chapter 1 now</a>`;
        if (j.status === "done") { toast("Game ready: " + (j.title || "")); await refresh(); return; }
        if (j.status === "error") { $("#msg").innerHTML = `<div class="err">${esc(j.error)}</div>`; $("#go").disabled = false; return; }
        setTimeout(tick, 1500);
      };
      tick();
    } catch (e) { $("#msg").innerHTML = `<div class="err">${esc(e.message)}</div>`; $("#go").disabled = false; }
  };
}

async function refresh() { await load(); dash(); }
async function boot() {
  try { S.user = (await api("/api/me")).user; } catch (e) { app.innerHTML = '<div class="card auth"><div class="err">Cannot reach the server.</div></div>'; return; }
  if (!S.user) return authView();
  await refresh();
}
boot();
