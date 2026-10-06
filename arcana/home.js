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
const strength = (p) => { let n = 0; if (p.length >= 8) n++; if (p.length >= 12) n++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) n++; if (/\d/.test(p)) n++; if (/[^A-Za-z0-9]/.test(p)) n++; return Math.min(4, Math.max(p ? 1 : 0, n - 1)); };
const STR = ["", "Weak", "Fair", "Good", "Strong"];
const pwField = (name, label, auto) => `<label>${label}<div class="pw"><input name="${name}" type="password" autocomplete="${auto}" required><button type="button" class="eye" data-eye aria-label="Show password">show</button></div></label>`;
function wirePw(root) {
  root.querySelectorAll("[data-eye]").forEach((b) => (b.onclick = () => { const i = b.previousElementSibling; i.type = i.type === "password" ? "text" : "password"; b.textContent = i.type === "password" ? "show" : "hide"; }));
  const m = root.querySelector("#meter"), inp = root.querySelector("input[name=password]");
  if (m && inp) inp.addEventListener("input", () => { const v = strength(inp.value); m.className = "meter s" + v; m.querySelector("span").textContent = inp.value ? STR[v] : ""; });
}
function authView(msg = "", startMode = "login") {
  let mode = startMode, gender = "m", forgot = false, mailOn = false;
  api("/api/status").then((c) => { mailOn = !!c.mail; if (mode === "login") draw(); }).catch(() => {});
  const draw = () => {
    if (!$("#bg")) { app.innerHTML = `<div class="landing"><canvas id="bg"></canvas><section class="intro"><div class="logoline"><span>ARCANA</span><b>AI</b></div><h2 class="tag">Turn your notes into <em id="rot">a game</em></h2>
      <p class="muted">Upload your own study material. ARCANA builds a playable adventure from it, learns how you study, and draws a roadmap of what to learn next.</p>
      <div class="steps"><div><i>1</i><b>Upload</b><span>PDF, notes or text</span></div><div><i>2</i><b>Play</b><span>fight, solve, explore</span></div><div><i>3</i><b>Adapt</b><span>your own difficulty</span></div><div><i>4</i><b>Master</b><span>roadmap to the boss</span></div></div>
      <p class="by">Created by <b>Adarsh Menon</b></p></section><div id="authbox"></div></div>`; startIntro(); }
    const reg = mode === "register";
    $("#authbox").innerHTML = forgot ? `<div class="card auth"><h1>Reset password</h1><p class="muted">Enter your account email and we will send you a link to choose a new password.</p>
      <form id="ff"><label>Email<input name="email" type="email" autocomplete="email" required></label><div id="e"></div><button class="primary" style="width:100%">Send reset link</button></form>
      <p class="muted small"><a href="#" id="back">Back to log in</a></p></div>` : `<div class="card auth"><h1>${reg ? "Create your account" : "Welcome back"}</h1>
      <div class="tabs"><button class="${!reg ? "on" : ""}" data-m="login">Log in</button><button class="${reg ? "on" : ""}" data-m="register">Sign up</button></div>
      <form id="f" novalidate>
      ${reg ? `<label>Display name<input name="username" maxlength="20" autocomplete="nickname" placeholder="3 to 20 letters or numbers" required></label><label>Email<input name="email" type="email" autocomplete="email" required></label>`
            : `<label>Email or display name<input name="login" autocomplete="username" required></label>`}
      ${pwField("password", "Password", reg ? "new-password" : "current-password")}
      ${reg ? `<div id="meter" class="meter s0"><i></i><i></i><i></i><i></i><span></span></div><h3>Choose your ranger</h3><div class="pick"><button type="button" class="pickc ${gender === "m" ? "sel" : ""}" data-g="m"><i>&#9794;</i><b>Man</b></button><button type="button" class="pickc ${gender === "f" ? "sel" : ""}" data-g="f"><i>&#9792;</i><b>Woman</b></button></div>
        <label class="check"><input type="checkbox" name="acceptTerms"><span>I agree to the <a href="/terms.html" target="_blank">Terms of Service</a> and <a href="/privacy.html" target="_blank">Privacy Policy</a>.</span></label>` : ""}
      <div id="e">${msg ? `<div class="err">${esc(msg)}</div>` : ""}</div><button class="primary" style="width:100%">${reg ? "Create account" : "Log in"}</button>
      ${!reg && mailOn ? '<p class="small"><a href="#" id="fg">Forgot your password?</a></p>' : ""}
      </form><div id="gwrap"></div>
      <p class="muted small trust">Your account and progress are stored securely on our servers. Passwords are hashed and never visible to anyone. You stay signed in on this device until you log out. Need help? <a href="/help.html">Help and support</a></p></div>`;
    const box = $("#authbox"); wirePw(box); mountGoogle();
    box.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { mode = b.dataset.m; msg = ""; draw(); }));
    box.querySelectorAll(".pickc").forEach((b) => (b.onclick = () => { gender = b.dataset.g; const keep = Object.fromEntries(new FormData($("#f"))); draw(); const f = $("#f"); for (const k of ["username", "email"]) if (keep[k]) f[k].value = keep[k]; }));
    const fg = $("#fg"); if (fg) fg.onclick = (e) => { e.preventDefault(); forgot = true; draw(); };
    const bk = $("#back"); if (bk) bk.onclick = (e) => { e.preventDefault(); forgot = false; draw(); };
    if ($("#ff")) $("#ff").onsubmit = async (e) => { e.preventDefault(); try { await api("/api/forgot", "POST", { email: e.target.email.value }); $("#authbox .card").innerHTML = '<h1>Check your email</h1><p>If an account exists for that address, a reset link is on its way. It works for 60 minutes.</p><p class="muted small"><a href="/">Back to log in</a></p>'; } catch (er) { $("#e").innerHTML = `<div class="err">${esc(er.message)}</div>`; } };
    if ($("#f")) $("#f").onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)); const btn = f.querySelector("button.primary"); btn.disabled = true;
      if (reg) { d.gender = gender; d.acceptTerms = f.acceptTerms.checked; }
      try { await api(reg ? "/api/register" : "/api/login", "POST", d); await boot(); } catch (er) { $("#e").innerHTML = `<div class="err">${esc(er.message)}</div>`; btn.disabled = false; }
    };
  };
  draw();
}
function resetView(token) {
  app.innerHTML = `<div class="card auth" style="margin:40px auto"><h1>Choose a new password</h1><form id="rf" novalidate>${pwField("password", "New password", "new-password")}<div id="meter" class="meter s0"><i></i><i></i><i></i><i></i><span></span></div><div id="e"></div><button class="primary" style="width:100%">Save and log in</button></form></div>`;
  wirePw(app);
  $("#rf").onsubmit = async (e) => { e.preventDefault(); try { await api("/api/reset", "POST", { token, password: e.target.password.value }); history.replaceState(null, "", "/"); toast("Password changed. You are logged in."); await boot(); } catch (er) { $("#e").innerHTML = `<div class="err">${esc(er.message)}</div>`; } };
}
async function logout() { await api("/api/logout", "POST"); S.user = null; $("#who").innerHTML = ""; authView(); }

function profileDialog() {
  const u = S.user, d = document.createElement("dialog");
  d.innerHTML = `<div class="row between"><h2 style="margin:0">${esc(u.username)}</h2><button id="close">Close</button></div><p class="muted small">${esc(u.email || "No email on this account")}</p>
    <h3>Your ranger</h3><div class="pick"><button class="pickc ${u.gender === "m" ? "sel" : ""}" data-g="m"><i>&#9794;</i><b>Man</b></button><button class="pickc ${u.gender === "f" ? "sel" : ""}" data-g="f"><i>&#9792;</i><b>Woman</b></button></div>
    <h3>${u.hasPassword ? "Change password" : "Set a password"}</h3><form id="pf" novalidate>${u.hasPassword ? pwField("current", "Current password", "current-password") : ""}${pwField("password", "New password", "new-password")}<div id="meter" class="meter s0"><i></i><i></i><i></i><i></i><span></span></div><div id="pe"></div><button class="primary">Save password</button></form>
    <h3>Your data</h3><div class="row"><button id="exp">Download my data</button><button id="all">Log out of all devices</button></div>
    <h3>Danger zone</h3><p class="muted small">Deleting your account permanently removes your games, answers, mastery and roadmap. Type DELETE to confirm.</p><div class="row"><input id="dc" placeholder="DELETE" style="max-width:140px"><button class="danger" id="del" disabled>Delete my account</button></div>
    <p class="muted small" style="margin-top:14px"><a href="/help.html">Help and support</a> &middot; <a href="/terms.html">Terms</a> &middot; <a href="/privacy.html">Privacy</a></p>`;
  document.body.appendChild(d); d.showModal(); wirePw(d);
  const shut = () => { d.close(); d.remove(); };
  d.querySelectorAll(".pickc").forEach((b) => (b.onclick = async () => { await api("/api/profile", "POST", { gender: b.dataset.g }); S.user.gender = b.dataset.g; shut(); toast("Ranger updated"); dash(); }));
  $("#close", d).onclick = shut;
  $("#pf", d).onsubmit = async (e) => { e.preventDefault(); const f = e.target; try { await api("/api/password", "POST", { current: f.current ? f.current.value : "", new: f.password.value }); S.user.hasPassword = true; shut(); toast("Password updated"); } catch (er) { $("#pe", d).innerHTML = `<div class="err">${esc(er.message)}</div>`; } };
  $("#exp", d).onclick = async () => { try { const j = await api("/api/export"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: "application/json" })); a.download = "arcana-my-data.json"; a.click(); } catch (er) { toast(er.message); } };
  $("#all", d).onclick = async () => { await api("/api/logout-all", "POST"); shut(); S.user = null; $("#who").innerHTML = ""; authView(); };
  $("#dc", d).oninput = (e) => ($("#del", d).disabled = e.target.value.trim() !== "DELETE");
  $("#del", d).onclick = async () => { await api("/api/account", "DELETE"); shut(); S.user = null; $("#who").innerHTML = ""; authView(); };
}

// ------------------------------------------------------------------ animated intro (canvas): neon grid road, sun, floating runes, rotating tagline
let introRaf = 0, introTimer = 0;
function startIntro() {
  const cv = $("#bg"); if (!cv) return; const cx = cv.getContext("2d"), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const runes = ["A+B=?", "\u03A3", "\u222B", "\u03C0", "\u2260", "\u2713", "\u26A1", "\u2605", "DNA", "H\u2082O", "E=mc\u00B2", "1789", "x\u00B2", "\u221A", "\u03B1", "\u03B2", "?!"];
  const parts = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), s: 12 + Math.random() * 26, v: 0.02 + Math.random() * 0.06, t: runes[(Math.random() * runes.length) | 0], p: Math.random() * 6 }));
  let W = 0, H = 0; const t0 = performance.now();
  const size = () => { const d = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; cx.setTransform(d, 0, 0, d, 0, 0); };
  size(); addEventListener("resize", size);
  const frame = (now) => {
    if (!document.body.contains(cv)) { removeEventListener("resize", size); return; }
    const t = (now - t0) / 1000, hz = H * 0.52;
    const sky = cx.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, "#010302"); sky.addColorStop(1, "#04170a"); cx.fillStyle = sky; cx.fillRect(0, 0, W, H);
    const sun = cx.createRadialGradient(W / 2, hz, 4, W / 2, hz, Math.min(W, H) * 0.42); sun.addColorStop(0, "rgba(120,255,90,.55)"); sun.addColorStop(0.35, "rgba(40,200,60,.22)"); sun.addColorStop(1, "rgba(0,0,0,0)"); cx.fillStyle = sun; cx.fillRect(0, 0, W, hz + 2);
    cx.save(); cx.beginPath(); cx.arc(W / 2, hz, Math.min(W, H) * 0.17, Math.PI, 0); cx.clip();
    const sg = cx.createLinearGradient(0, hz - 160, 0, hz); sg.addColorStop(0, "#d6ff5c"); sg.addColorStop(1, "#18c93a"); cx.fillStyle = sg; cx.fillRect(0, 0, W, H);
    cx.fillStyle = "#020503"; for (let i = 0; i < 7; i++) { const y = hz - 8 - i * 17 - ((t * 10) % 17); cx.fillRect(0, y, W, 2 + i * 1.3); } cx.restore();
    cx.fillStyle = "#010402"; cx.fillRect(0, hz, W, H - hz);
    cx.strokeStyle = "rgba(57,255,20,.55)"; cx.lineWidth = 1; cx.shadowColor = "#39ff14"; cx.shadowBlur = 6;
    for (let i = -14; i <= 14; i++) { cx.beginPath(); cx.moveTo(W / 2 + i * 14, hz); cx.lineTo(W / 2 + i * W * 0.16, H); cx.stroke(); }
    for (let i = 0; i < 16; i++) { const k = ((i + (still ? 0 : t * 0.45)) % 16) / 16, y = hz + (H - hz) * k * k; cx.globalAlpha = 0.25 + k * 0.75; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
    cx.globalAlpha = 1; cx.shadowBlur = 0; cx.textAlign = "center";
    for (const p of parts) {
      if (!still) { p.y -= p.v * 0.016; if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); } }
      cx.globalAlpha = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.4 + p.p)); cx.fillStyle = "#7dff5f"; cx.font = `700 ${p.s}px Orbitron, monospace`; cx.fillText(p.t, p.x * W + Math.sin(t * 0.6 + p.p) * 14, p.y * hz * 1.9);
    }
    cx.globalAlpha = 1;
    const sw = (t * 0.25) % 1.6 - 0.3, g = cx.createLinearGradient(sw * W - 160, 0, sw * W + 160, 0); g.addColorStop(0, "rgba(57,255,20,0)"); g.addColorStop(0.5, "rgba(57,255,20,.07)"); g.addColorStop(1, "rgba(57,255,20,0)"); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    introRaf = still ? 0 : requestAnimationFrame(frame);
  };
  cancelAnimationFrame(introRaf); introRaf = requestAnimationFrame(frame);
  const words = ["a game", "a boss fight", "a quest", "a roadmap", "mastery"], el = $("#rot"); let wi = 0; clearInterval(introTimer);
  introTimer = setInterval(() => { if (!document.body.contains(el)) return clearInterval(introTimer); el.classList.add("out"); setTimeout(() => { wi = (wi + 1) % words.length; el.textContent = words[wi]; el.classList.remove("out"); }, 350); }, 2300);
}

// ------------------------------------------------------------------ Continue with Google (shown only when the server has a Google client id)
async function mountGoogle() {
  const box = $("#gwrap"); if (!box) return;
  let cfg; try { cfg = await api("/api/status"); } catch (e) { return; }
  if (!cfg.googleClientId) return;
  box.innerHTML = '<div class="or"><span>or</span></div><div id="gbtn"></div>';
  const init = () => { google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: async (res) => { try { await api("/api/google", "POST", { credential: res.credential }); await boot(); } catch (er) { toast(er.message); } } }); google.accounts.id.renderButton($("#gbtn"), { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: 280 }); };
  if (window.google && window.google.accounts) return init();
  const sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = init; document.head.appendChild(sc);
}

// ------------------------------------------------------------------ AI coach card
function coachCard(c) {
  if (!c || c.answers < 5) return `<section class="card" id="coach"><h2>Your AI coach</h2><p class="muted">Answer about 10 questions and the coach will study your habits: speed, guessing, hints, forgetting and weak spots.</p></section>`;
  const bd = c.byDifficulty ? Object.entries(c.byDifficulty).map(([d, v]) => `<div class="cbar"><span>${["", "Easy", "Medium", "Hard"][d] || d}</span><div class="bar ${tone(v.accuracy / 100)}"><i style="width:${v.accuracy}%"></i></div><b>${v.accuracy}%</b></div>`).join("") : "";
  const steps = c.ai ? c.ai.advice : c.plan;
  return `<section class="card" id="coach"><div class="row between"><h2>Your AI coach</h2><span class="badge">${c.ai ? "AI plan" : c.aiPending ? "AI is thinking..." : "analysis"}</span></div>
    ${c.ai ? `<p><b>${esc(c.ai.headline)}</b></p>` : ""}<h3>Accuracy by difficulty</h3>${bd}
    ${c.findings.length ? "<h3>What I noticed</h3><ul class='ul'>" + c.findings.map((f) => `<li>${esc(f.text)}</li>`).join("") + "</ul>" : ""}
    <h3>Your next steps</h3><ul class="ul">${steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>`;
}

// ------------------------------------------------------------------ dashboard
async function load() {
  [S.rm, S.games, S.coach] = await Promise.all([api("/api/roadmap"), api("/api/games"), api("/api/coach").catch(() => null)]);
}
function dash() {
  const { stats: st, adaptation: ad, next, achievements, games } = S.rm;
  $("#who").innerHTML = `<button class="ghost" id="prof">${S.user.gender === "f" ? "&#9792;" : "&#9794;"} ${esc(S.user.username)}</button><button class="ghost" id="out">Log out</button>`;
  $("#prof").onclick = profileDialog; $("#out").onclick = logout;
  if (!S.games.length) { onboarding(); return; }
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
  ${coachCard(S.coach)}
  <section class="card"><div class="row between"><h2>Your learning roadmap</h2><span class="muted small">click a stop for details</span></div>${games.map((g, gi) => roadBlock(g, gi)).join("")}
    <div class="legend"><span><i style="background:var(--neon)"></i>done</span><span><i style="background:var(--gold)"></i>mastered</span><span><i style="background:var(--bad)"></i>needs review</span><span><i style="background:#fff"></i>you are here</span><span><i style="background:#1d5a14"></i>locked</span></div><div id="detail"></div></section>
  <div class="grid2">
    <section class="card"><h2>Your games</h2><div class="list">${S.games.map((g) => `<div class="item"><div><b>${esc(g.title)}</b><div class="tag">${""}${g.progress ? (g.progress.finished ? "FINISHED" : "CHAPTER " + (g.progress.chapter + 1)) + " // " + g.progress.score + " PTS" : "NEW"}</div></div><div class="row"><a class="btn" href="/play.html?game=${encodeURIComponent(g.id)}">${g.progress && !g.progress.finished ? "Continue" : "Play"}</a><button class="danger" data-del="${esc(g.id)}">Delete</button></div></div>`).join("")}</div></section>
    <section class="card" id="upcard"><h2>Make a game from your notes</h2><p class="muted small" id="note"></p>
      <label class="drop" id="drop"><input type="file" id="file" hidden accept=".pdf,.docx,.pptx,.txt,.md,.html,.htm,.csv,.png,.jpg,.jpeg,.webp"><b id="dropt">Click to choose a file, or drop it here</b><span class="muted small">PDF, DOCX, PPTX, TXT, MD, HTML or an image (max 25 MB)</span></label>
      <label>...or paste your notes<textarea id="paste" rows="3" placeholder="Paste at least a few paragraphs"></textarea></label><div id="msg"></div><button class="primary" id="go">Create my game</button></section>
  </div>
  <section class="card"><h2>Achievements</h2><div class="ach">${achievements.map((a) => `<span class="a ${a.earned ? "on" : ""}">${a.earned ? "&#9733; " : ""}${esc(a.name)}</span>`).join("")}</div></section>`;
  app.querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => $("#upcard").scrollIntoView({ behavior: "smooth" })));
  app.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { if (confirm("Delete this game and your progress in it?")) { await api("/api/games/" + b.dataset.del, "DELETE"); await refresh(); } }));
  wireRoad(); wireUpload();
  if (S.user.admin) { const d = document.createElement("div"); d.id = "adminbox"; app.appendChild(d); adminInbox(); }
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

function onboarding() {
  app.innerHTML = `<section class="card welcome"><h1>Welcome, ${esc(S.user.username)}</h1><p class="lead">Your adventure starts with your own study material. Upload a file or paste notes and ARCANA turns them into a game made only for you.</p>
    <div class="steps flat"><div><i>1</i><b>Upload</b><span>a PDF, document, slides, notes or a photo of a page</span></div><div><i>2</i><b>Wait a few minutes</b><span>the AI reads it and builds chapters, bosses and quizzes</span></div><div><i>3</i><b>Play</b><span>the first chapter opens while the rest is still being built</span></div><div><i>4</i><b>Improve</b><span>your roadmap and difficulty adapt to how you do</span></div></div></section>
    <section class="card" id="upcard"><h2>Make your first game</h2><p class="muted small" id="note"></p>
      <label class="drop" id="drop"><input type="file" id="file" hidden accept=".pdf,.docx,.pptx,.txt,.md,.html,.htm,.csv,.png,.jpg,.jpeg,.webp"><b id="dropt">Click to choose a file, or drop it here</b><span class="muted small">PDF, DOCX, PPTX, TXT, MD, HTML or an image (max 25 MB)</span></label>
      <label>...or paste your notes<textarea id="paste" rows="4" placeholder="Paste at least a few paragraphs"></textarea></label><div id="msg"></div><button class="primary" id="go">Create my game</button>
      <p class="muted small">Tip: text-based files work best. Your material is processed by AI services to write the game, so avoid confidential documents. See the <a href="/privacy.html">Privacy Policy</a>.</p></section>
    ${S.user.admin ? '<div id="adminbox"></div>' : ""}`;
  wireUpload(); if (S.user.admin) adminInbox();
}
async function adminInbox() {
  const box = $("#adminbox"); if (!box) return;
  try {
    const t = await api("/api/admin/tickets");
    box.innerHTML = `<section class="card"><h2>Support inbox (admin)</h2>${t.length ? t.map((x) => `<div class="item"><div><b>#${x.id} ${esc(x.subject)}</b><div class="tag">${esc(x.category.toUpperCase())} // ${esc(x.email)} // ${esc(x.status.toUpperCase())}</div><p class="small">${esc(x.message)}</p></div><div class="row">${["open", "answered", "closed"].filter((st) => st !== x.status).map((st) => `<button data-t="${x.id}" data-s="${st}">${st}</button>`).join("")}</div></div>`).join("") : '<p class="muted">No tickets yet.</p>'}</section>`;
    box.querySelectorAll("[data-t]").forEach((b) => (b.onclick = async () => { await api("/api/admin/tickets/" + b.dataset.t, "POST", { status: b.dataset.s }); adminInbox(); }));
  } catch (e) { box.innerHTML = ""; }
}

async function refresh() {
  await load(); dash();
  if (S.coach && S.coach.aiPending) setTimeout(async () => { try { S.coach = await api("/api/coach"); const el = $("#coach"); if (el && S.coach.ai) el.outerHTML = coachCard(S.coach); } catch (e) {} }, 20000);
}
async function boot() {
  try { S.user = (await api("/api/me")).user; } catch (e) { app.innerHTML = '<div class="card auth"><div class="err">Cannot reach the server.</div></div>'; return; }
  const reset = new URLSearchParams(location.search).get("reset");
  if (!S.user && reset) return resetView(reset);
  if (!S.user) return authView();
  await refresh();
}
boot();
