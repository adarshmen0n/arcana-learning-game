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
function signedOut() { if (typeof stopStage === "function") stopStage(); S.user = null; S.view = null; $("#nav").innerHTML = ""; $("#who").innerHTML = ""; authView(); }
async function logout() { await api("/api/logout", "POST"); signedOut(); }

function profileDialog() {
  const u = S.user, d = document.createElement("dialog");
  d.innerHTML = `<div class="row between"><h2 style="margin:0">${esc(u.username)}</h2><button id="close">Close</button></div><p class="muted small">${esc(u.email || "No email on this account")}</p>
    <h3>Your ranger</h3><div class="pick"><button class="pickc ${u.gender === "m" ? "sel" : ""}" data-g="m"><i>&#9794;</i><b>Man</b></button><button class="pickc ${u.gender === "f" ? "sel" : ""}" data-g="f"><i>&#9792;</i><b>Woman</b></button></div>
    <h3>${u.hasPassword ? "Change password" : "Set a password"}</h3><form id="pf" novalidate>${u.hasPassword ? pwField("current", "Current password", "current-password") : ""}${pwField("password", "New password", "new-password")}<div id="meter" class="meter s0"><i></i><i></i><i></i><i></i><span></span></div><div id="pe"></div><button class="primary">Save password</button></form>
    <h3>Leaderboard</h3><label class="check"><input type="checkbox" id="onboard" ${u.onBoard !== false ? "checked" : ""}><span>Show my display name, level and XP on the global leaderboard</span></label>
    <h3>Your data</h3><div class="row"><button id="exp">Download my data</button><button id="all">Log out of all devices</button></div>
    <h3>Danger zone</h3><p class="muted small">Deleting your account permanently removes your games, answers, mastery and roadmap. Type DELETE to confirm.</p><div class="row"><input id="dc" placeholder="DELETE" style="max-width:140px"><button class="danger" id="del" disabled>Delete my account</button></div>
    <p class="muted small" style="margin-top:14px"><a href="/help.html">Help and support</a> &middot; <a href="/terms.html">Terms</a> &middot; <a href="/privacy.html">Privacy</a></p>`;
  document.body.appendChild(d); d.showModal(); wirePw(d);
  const shut = () => { d.close(); d.remove(); };
  d.querySelectorAll(".pickc").forEach((b) => (b.onclick = async () => { await api("/api/profile", "POST", { gender: b.dataset.g }); S.user.gender = b.dataset.g; shut(); toast("Ranger updated"); if (window.Lobby) Lobby.setGender(S.user.gender); shell(); }));
  $("#close", d).onclick = shut;
  $("#onboard", d).onchange = async (e) => { await api("/api/profile", "POST", { onBoard: e.target.checked }); S.user.onBoard = e.target.checked; S.lb = null; toast(e.target.checked ? "You are on the leaderboard" : "You are hidden from the leaderboard"); };
  $("#pf", d).onsubmit = async (e) => { e.preventDefault(); const f = e.target; try { await api("/api/password", "POST", { current: f.current ? f.current.value : "", new: f.password.value }); S.user.hasPassword = true; shut(); toast("Password updated"); } catch (er) { $("#pe", d).innerHTML = `<div class="err">${esc(er.message)}</div>`; } };
  $("#exp", d).onclick = async () => { try { const j = await api("/api/export"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: "application/json" })); a.download = "arcana-my-data.json"; a.click(); } catch (er) { toast(er.message); } };
  $("#all", d).onclick = async () => { await api("/api/logout-all", "POST"); shut(); signedOut(); };
  $("#dc", d).oninput = (e) => ($("#del", d).disabled = e.target.value.trim() !== "DELETE");
  $("#del", d).onclick = async () => { await api("/api/account", "DELETE"); shut(); signedOut(); };
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
  if (!c || c.answers < 5) return `<div class="glass" id="coach">${sh("01", "AI coach")}<p class="muted">Answer about 10 questions and the coach will study your habits: speed, guessing, hints, forgetting and weak spots.</p></div>`;
  const bd = c.byDifficulty ? Object.entries(c.byDifficulty).map(([d, v]) => `<div class="cbar"><span>${["", "Easy", "Medium", "Hard"][d] || d}</span><div class="bar ${tone(v.accuracy / 100)}"><i style="width:${v.accuracy}%"></i></div><b>${v.accuracy}%</b></div>`).join("") : "";
  const steps = c.ai ? c.ai.advice : c.plan;
  return `<div class="glass" id="coach">${sh("01", "AI coach")}<div style="margin-bottom:8px"><span class="styletag">${c.ai ? "AI plan" : c.aiPending ? "AI is thinking..." : "analysis"}</span></div>
    ${c.ai ? `<p><b>${esc(c.ai.headline)}</b></p>` : ""}<h3>Accuracy by difficulty</h3>${bd}
    ${c.findings.length ? "<h3>What I noticed</h3><ul class='ul'>" + c.findings.map((f) => `<li>${esc(f.text)}</li>`).join("") + "</ul>" : ""}
    <h3>Your next steps</h3><ul class="ul">${steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
}

// ------------------------------------------------------------------ dashboard
async function load() {
  [S.rm, S.games, S.coach, S.hero] = await Promise.all([api("/api/roadmap"), api("/api/games"), api("/api/coach").catch(() => null), api("/api/hero").catch(() => null)]);
}

// ------------------------------------------------------------------ the hub: a clean arena x learning-platform dashboard
const VIEWS = [["arena", "Arena"], ["quests", "Quests"], ["arc", "Arc Search"], ["armory", "Armory"], ["progress", "Progress"]];
let sfxCtx = null, lastBlip = 0;
function blip(f = 520, d = 0.04, v = 0.02) { const n = performance.now(); if (n - lastBlip < 60) return; lastBlip = n; try { sfxCtx = sfxCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = sfxCtx.createOscillator(), g = sfxCtx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(sfxCtx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, sfxCtx.currentTime + d); o.stop(sfxCtx.currentTime + d); } catch (e) {} }
document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(".gbtn,#nav button,.qgame > button,.tn")) blip(660, 0.05); });
function stopStage() { document.body.classList.remove("hub"); }
const sh = (n, t) => `<div class="sh"><i>${n}</i>${t}</div>`;

function shell() {
  const u = S.user, st = S.rm.stats;
  $("#nav").innerHTML = VIEWS.map(([k, l]) => `<button data-v="${k}" class="${S.view === k ? "on" : ""}">${l}</button>`).join("");
  $("#nav").querySelectorAll("button").forEach((b) => (b.onclick = () => go(b.dataset.v)));
  $("#who").innerHTML = `<span class="pill cy hide-sm" title="Knowledge shards"><i>&#9670;</i>${S.hero ? S.hero.shards : 0}</span><span class="pill hide-sm"><i>LV</i>${st.level}</span>
    <button class="userbtn" id="prof" title="Profile and settings"><span class="avatar">${esc((u.username[0] || "?").toUpperCase())}</span>${esc(u.username)}</button><button class="iconbtn2" id="out">Log out</button>`;
  $("#prof").onclick = profileDialog; $("#out").onclick = logout;
}
function go(v) {
  if (!VIEW_FN[v]) v = "arena";
  S.view = v; shell();
  const view = $("#view"); if (!view) return; view.className = "view"; view.innerHTML = VIEW_FN[v](); void view.offsetWidth; AFTER[v] && AFTER[v](); scrollTo(0, 0);
}
function dash() {
  document.body.classList.add("hub"); app.innerHTML = '<div id="view" class="view"></div>'; S.view = S.view && VIEW_FN[S.view] ? S.view : "arena";
  go(S.view);
  if (S.user.admin) { const d = document.createElement("div"); d.id = "adminbox"; d.style.marginTop = "20px"; app.appendChild(d); adminInbox(); }
}
function uploadBlock(title, first) {
  return `<div class="glass accent" id="upcard"><div class="lbl">${first ? "<b>FIRST QUEST</b>" : "NEW QUEST"}</div><h2 style="margin:8px 0 4px">${title}</h2><p class="muted small" id="note"></p>
    <label class="drop" id="drop"><input type="file" id="file" hidden accept=".pdf,.docx,.pptx,.txt,.md,.html,.htm,.csv,.png,.jpg,.jpeg,.webp"><b id="dropt">Drop a file here or click to choose</b><span class="muted small">PDF, DOCX, PPTX, TXT, MD, HTML or an image &middot; up to 25 MB</span></label>
    <label>Or paste your notes<textarea id="paste" rows="3" placeholder="Paste at least a few paragraphs"></textarea></label><div id="msg"></div>
    <div class="acts"><button class="gbtn hero" id="go">Create my game</button></div>
    <p class="muted small" style="margin:12px 0 0">Your material is read by AI services to build the game, so avoid confidential files. <a href="/privacy.html">Privacy</a></p></div>`;
}

// ---- pieces
const curGame = () => { const gs = S.rm.games; if (!gs.length) return null; S.sel = Math.min(S.sel ?? Math.max(0, gs.findIndex((g) => g.nodes.some((n) => n.status === "current"))), gs.length - 1); return gs[S.sel]; };
const gamePct = (g) => Math.round(100 * g.nodes.filter((n) => ["done", "mastered", "review"].includes(n.status)).length / g.nodes.length);
function playerCard() {
  const st = S.rm.stats, u = S.user, off = 220 * (1 - st.xpInLevel / 500);
  return `<div class="glass player"><div class="ring"><svg viewBox="0 0 78 78"><circle class="t" cx="39" cy="39" r="35"/><circle class="a" cx="39" cy="39" r="35" stroke-dasharray="220" stroke-dashoffset="${off}"/></svg><b>${st.level}</b><small>LEVEL</small></div>
    <div class="meta"><div class="row1"><h1>${esc(u.username)}</h1><span class="muted small">${st.xpInLevel} / 500 XP to level ${st.level + 1}</span></div>
      <div class="bar2" style="margin-top:10px"><i style="width:${Math.round(st.xpInLevel / 5)}%"></i></div>
      <div class="tags"><span class="pill"><i>&#10003;</i>${st.accuracy == null ? "no answers yet" : st.accuracy + "% accuracy"}</span><span class="pill"><i>&#9889;</i>best streak ${st.bestStreak}</span><span class="pill"><i>&#9673;</i>${st.topics} topics</span><span class="pill cy"><i>&#9670;</i>${S.hero ? S.hero.shards : 0} shards</span></div></div></div>`;
}
function questLog() {
  const gs = S.rm.games;
  if (!gs.length) return `<div class="glass"><div class="ch"><div class="lbl">Quest log</div></div><div class="empty">No quests yet. Upload your notes to start one.</div><div class="acts"><button class="gbtn" data-go="quests">+ New quest</button></div></div>`;
  const icon = { done: "&#10003;", mastered: "&#9733;", review: "!", current: "&#9654;", locked: "&#8226;" };
  return `<div class="glass"><div class="ch"><div class="lbl">Quest log</div><button class="gbtn sm" data-go="quests">+ New</button></div>
    ${gs.map((g, gi) => `<div class="qgame ${gi === S.sel ? "on" : ""}"><button data-sel="${gi}"><span>${esc(g.title)}</span><span class="pct">${gamePct(g)}%</span><span class="bar2"><i style="width:${gamePct(g)}%"></i></span></button>
      ${gi === S.sel ? `<ul class="qch">${g.nodes.map((n, ni) => `<li class="${n.status}" data-node="${ni}"><span class="st">${icon[n.status] || ""}</span><span>${esc(n.title)}</span><em>${n.mastery == null ? "" : pct(n.mastery)}</em></li>`).join("")}</ul>` : ""}</div>`).join("")}</div>`;
}
function skillTree(g) {
  const nodes = g.nodes, W = Math.max(560, nodes.length * 230), colW = W / nodes.length, y0 = 64, y1 = 200, yc = 300, dy = 66, maxC = 4;
  const tall = Math.min(maxC, Math.max(1, ...nodes.filter((n) => !n.final).map((n) => n.concepts.length))), more = nodes.some((n) => !n.final && n.concepts.length > maxC);
  const H = yc + (tall - 1) * dy + (more ? 92 : 70);
  const cx = (i) => colW * i + colW / 2, short = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
  let lines = "", nodesSvg = "";
  nodes.forEach((n, i) => {
    const x = cx(i), lit = ["done", "mastered", "review", "current"].includes(n.status);
    lines += `<path class="tl ${lit ? "lit" : ""}" d="M${W / 2} ${y0 + 26}C${W / 2} ${y0 + 90} ${x} ${y1 - 90} ${x} ${y1 - 30}"/>`;
    if (i < nodes.length - 1) lines += `<path class="tl path ${["done", "mastered", "review"].includes(n.status) ? "lit" : ""}" d="M${x + 32} ${y1}L${cx(i + 1) - 32} ${y1}"/>`;
    const cs = n.final ? [] : n.concepts.slice(0, maxC);
    cs.forEach((c, k) => {
      const yy = yc + k * dy; lines += `<path class="tl ${c.mastery != null && c.mastery >= 0.45 ? "lit" : ""}" d="M${x} ${(k ? yy - dy : y1) + (k ? 16 : 30)}L${x} ${yy - 16}"/>`;
      const m = c.mastery == null ? 0 : c.mastery >= 0.75 ? 3 : c.mastery >= 0.45 ? 2 : 1;
      nodesSvg += `<g class="tn cn m${m} ${n.status === "locked" ? "lock" : ""}" data-node="${i}" data-c="${k}" transform="translate(${x} ${yy})"><circle class="core" r="14"/><text y="34">${esc(short(c.name, 22))}</text></g>`;
    });
    if (!n.final && n.concepts.length > maxC) nodesSvg += `<text x="${x}" y="${yc + (maxC - 1) * dy + 62}" fill="#8b949e" font-size="13" text-anchor="middle">+${n.concepts.length - maxC} more</text>`;
    const sym = n.final ? "&#9733;" : String(i + 1);
    nodesSvg += `<g class="tn ${n.status} ${S.node === i ? "sel" : ""}" data-node="${i}" transform="translate(${x} ${y1})">${n.status === "current" ? '<circle class="pulse" r="30"/>' : ""}<circle class="core" r="30"/><text class="ico" y="6">${sym}</text><text y="54">${esc(short(n.title, 24))}</text></g>`;
  });
  const root = `<g class="tn root" transform="translate(${W / 2} ${y0})"><rect class="core" x="-${Math.min(170, W / 2 - 20)}" y="-26" width="${Math.min(340, W - 40)}" height="52" rx="14"/><text y="6">${esc(short(g.title.toUpperCase(), 26))}</text></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Skill tree for ${esc(g.title)}"><defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${lines}${root}${nodesSvg}</svg>`;
}
function nodeCard(g, i, ci) {
  const n = g.nodes[i]; if (!n) return "";
  if (ci != null && n.concepts[ci]) {
    const c = n.concepts[ci];
    return `<div class="nodecard"><div class="lbl">Skill &middot; ${esc(n.title)}</div><h2>${esc(c.name)}</h2>
      <div class="cbar"><span>Mastery</span><div class="bar ${tone(c.mastery)}"><i style="width:${Math.round((c.mastery || 0) * 100)}%"></i></div><b>${pct(c.mastery)}</b></div>
      <p class="muted small">${c.mastery == null ? "Not tested yet." : c.mastery >= 0.75 ? "Mastered. Nice work." : c.mastery >= 0.45 ? "Getting there. A replay will lock it in." : "Weak spot. ARCANA adds practice for it."}</p>
      <div class="acts"><button class="gbtn" data-ask="${esc("Explain " + c.name + " simply with an example")}">Ask Arc to explain</button>${n.status !== "locked" ? `<a class="gbtn" href="/play.html?game=${encodeURIComponent(g.id)}&ch=${n.index}">Practise this chapter</a>` : ""}</div></div>`;
  }
  const say = { done: "Completed.", mastered: "Completed and mastered.", review: "Completed, but mastery is low here: worth a replay.", current: "This is your next quest.", locked: "Finish the earlier chapters to unlock it." }[n.status];
  return `<div class="nodecard"><div class="lbl">${n.final ? "Final boss" : "Chapter " + (i + 1)}</div><h2>${esc(n.title)}</h2><p class="muted">${n.goal ? esc(n.goal.replace(/[.!?]*$/, ".")) + " " : ""}${say}</p>
    ${n.concepts.slice(0, 6).map((c) => `<div class="cbar"><span>${esc(c.name)}</span><div class="bar ${tone(c.mastery)}"><i style="width:${Math.round((c.mastery || 0) * 100)}%"></i></div><b>${pct(c.mastery)}</b></div>`).join("")}
    <div class="acts">${n.status === "locked" ? "" : `<a class="gbtn hero" href="/play.html?game=${encodeURIComponent(g.id)}${n.status === "current" ? "" : "&ch=" + n.index}">${n.status === "current" ? "Enter the arena" : "Replay"}</a>`}</div></div>`;
}
function leaderboard() {
  const lb = S.lb;
  if (!lb) return `<div class="glass"><div class="ch"><div class="lbl">Leaderboard</div></div><p class="muted small">Loading ranks...</p></div>`;
  return `<div class="glass"><div class="ch"><div class="lbl">Global <b>leaderboard</b></div><span class="muted small">${lb.players} players</span></div>
    ${lb.top.length ? `<ol class="lb">${lb.top.map((r) => `<li class="${r.me ? "me" : ""}"><span class="rk">${r.rank}</span><span class="av">${esc(r.name[0].toUpperCase())}</span><span class="nm">${esc(r.name)}<small>LEVEL ${r.level}</small></span><span class="xp">${r.xp.toLocaleString()}</span></li>`).join("")}</ol>` : '<p class="muted small">Be the first on the board: answer questions and clear chapters to earn XP.</p>'}
    <div class="lbme"><span>Your rank</span><b>${lb.me.rank ? "#" + lb.me.rank : "unranked"} &middot; ${lb.me.xp.toLocaleString()} XP</b></div></div>`;
}
function nextUp() {
  const next = S.rm.next;
  return `<div class="glass"><div class="ch"><div class="lbl">Next up</div></div><div class="nextlist">${next.length ? next.slice(0, 4).map((n) => `<div class="nx"><span><span class="k">${esc(n.kind.toUpperCase())}</span>${esc(n.text)}</span>${n.game ? `<a class="gbtn sm" href="/play.html?game=${encodeURIComponent(n.game)}">Go</a>` : '<button class="gbtn sm" data-go="quests">Upload</button>'}</div>`).join("") : '<div class="muted small">Nothing queued. Upload new material.</div>'}</div></div>`;
}
function adaptCard() {
  const ad = S.rm.adaptation, dots = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= ad.difficulty ? "on" : ""}"></i>`).join("");
  return `<div class="glass"><div class="ch"><div class="lbl">Your setup</div><span class="styletag ${esc(ad.style)}">${esc(ad.style)}</span></div><div class="muted small">Difficulty ${ad.difficulty}/5 &middot; ${ad.maxHearts} hearts</div><div class="pips">${dots}</div><p class="small" style="margin:0">${esc(ad.why)}</p></div>`;
}

const VIEW_FN = {
  arena() {
    const g = curGame();
    const center = g ? `<div class="glass arena"><div class="top ch" style="margin:0"><div class="lbl">Skill tree &middot; <b>${esc(g.title)}</b></div><span class="muted small">${gamePct(g)}% complete</span></div>
        <div class="holo"><div class="scan"></div>${skillTree(g)}</div>
        <div class="legend2"><span><i style="background:#00ff00"></i>Mastered</span><span><i style="background:rgba(0,255,0,.35)"></i>Learning</span><span><i style="background:#ffb020"></i>Weak spot</span><span><i style="background:#2a3038"></i>Not tested yet</span></div>
        <div id="nodebox">${S.node != null ? nodeCard(g, S.node, S.cnode) : ""}</div>
        ${(() => { const cur = g.nodes.find((n) => n.status === "current"); return `<div class="cta"><div class="next"><span>${g.finished ? "Completed" : "Next quest"}</span><b>${esc(cur ? cur.title : "All chapters cleared")}</b></div><a class="gbtn hero" href="/play.html?game=${encodeURIComponent(g.id)}">${g.finished ? "Play again" : "Enter the arena"}</a></div>`; })()}</div>`
      : uploadBlock("Turn your notes into a game", true);
    return `<div class="arena-grid"><div class="stack">${questLog()}${adaptCard()}</div><div class="stack">${playerCard()}${center}</div><div class="stack">${leaderboard()}${nextUp()}</div></div>`;
  },
  quests() {
    const rows = S.games.map((g) => `<div class="rowi"><div class="cap">${g.progress && g.progress.finished ? "&#10003;" : "&#9654;"}</div><div><h3>${esc(g.title)}</h3><p>${g.progress ? (g.progress.finished ? "Finished" : "Chapter " + (g.progress.chapter + 1)) + " &middot; " + g.progress.score + " pts" : "New"}</p></div>
      <div class="acts" style="margin:0"><a class="gbtn sm" href="/play.html?game=${encodeURIComponent(g.id)}">${g.progress && !g.progress.finished ? "Continue" : "Play"}</a>${g.hasSource ? `<button class="gbtn sm" data-rebuild="${esc(g.id)}" title="Make a new version with the new lessons, tablets and fewer questions">Rebuild</button>` : ""}<button class="gbtn sm danger" data-del="${esc(g.id)}">Delete</button></div></div>`).join("");
    return `<div class="two">${uploadBlock("Make a game from your notes", false)}<div class="glass"><div class="ch"><div class="lbl">Your quests</div><span class="muted small">${S.games.length}</span></div><div class="rows">${rows || '<div class="empty">No quests yet.</div>'}</div></div></div>`;
  },
  arc() {
    const gs = S.games;
    S.arcGame = S.arcGame && gs.some((g) => g.id === S.arcGame) ? S.arcGame : "";
    return `<div class="glass" style="margin-bottom:16px"><div class="ch" style="margin-bottom:8px"><div class="lbl"><b>Arc Search</b> &middot; your AI study assistant</div></div><p class="muted small" style="margin:0 0 12px">Ask anything. Arc checks live sources for facts that change, and when you pick a game it also uses the notes you uploaded.</p>
      <div class="gtabs" style="margin:0"><button data-ag="" class="${S.arcGame ? "" : "on"}">General</button>${gs.map((g) => `<button data-ag="${esc(g.id)}" class="${S.arcGame === g.id ? "on" : ""}">${esc(g.title.slice(0, 28))}</button>`).join("")}</div></div><div id="arcbox"></div>`;
  },
  armory() {
    const h = S.hero; if (!h) return `<div class="empty">Loading your hero...</div>`;
    const abil = h.abilities.map((a) => `<div class="rowi ${a.unlocked ? "" : "locked"}"><div class="cap">${esc(a.key)}</div><div><h3>${esc(a.name)}</h3><p>${esc(a.desc)}</p></div><div class="tagx ${a.unlocked ? "" : "lock"}">${a.unlocked ? (a.cost ? a.cost + " EN" : "READY") : "LV " + a.unlock}</div></div>`).join("");
    const ench = h.enchants.map((e) => `<div class="rowi eq ${e.equipped ? "on" : ""} ${e.unlocked ? "" : "locked"}" data-ench="${esc(e.id)}"><div class="cap">${e.equipped ? "&#10003;" : "&#9671;"}</div><div><h3>${esc(e.name)}</h3><p>${esc(e.desc)}</p></div><div class="tagx ${e.unlocked ? "" : "lock"}">${e.unlocked ? (e.equipped ? "ON" : "EQUIP") : "LV " + e.unlock}</div></div>`).join("");
    const ups = h.upgrades.map((u) => `<div class="upgrade"><div><h3>${esc(u.name)} <span class="tagx">LV ${u.level}/${u.max}</span></h3><p>${esc(u.desc)}</p><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < u.level ? "on" : ""}"></i>`).join("")}</div></div>${u.cost == null ? '<span class="tagx">MAX</span>' : `<button class="gbtn sm" data-up="${esc(u.id)}" ${h.shards < u.cost ? "disabled" : ""}>&#9670; ${u.cost}</button>`}</div>`).join("");
    return `<div class="glass accent" style="margin-bottom:20px"><div class="ch"><div class="lbl">Armory</div></div><div class="shardbig">${h.shards}<small>KNOWLEDGE SHARDS</small></div><p class="muted small" style="margin:6px 0 0">Every enemy you defeat drops a shard that teaches a fact from your notes. Spend shards on enhancements; powers and enchantments unlock as your level rises.</p></div>
      <div class="three"><div class="glass">${sh("01", "Powers")}<div class="rows">${abil}</div></div><div class="glass">${sh("02", `Enchantments ${h.equipped.length}/${h.slots}`)}<div class="rows">${ench}</div></div><div class="glass">${sh("03", "Enhancements")}<div class="rows">${ups}</div></div></div>`;
  },
  progress() {
    const st = S.rm.stats, ach = S.rm.achievements;
    return `<div class="glass" style="margin-bottom:20px"><div class="ch"><div class="lbl">Performance</div></div><div class="kv"><div><b>${st.accuracy == null ? "-" : st.accuracy + "%"}</b><span>Accuracy</span></div><div><b>${st.answers}</b><span>Answers</span></div><div><b>${st.pace == null ? "-" : st.pace + "s"}</b><span>Pace</span></div><div><b>${st.bestStreak}</b><span>Best streak</span></div><div><b>${st.topics}</b><span>Topics</span></div><div><b>${st.gamesFinished}</b><span>Games cleared</span></div></div></div>
      <div class="two"><div class="stack">${coachCard(S.coach)}${adaptCard()}</div><div class="stack"><div class="glass">${sh("02", "Weak and strong topics")}<h3 style="margin-top:0">Needs work</h3><div class="chips">${st.weak.length ? st.weak.map((t) => `<span class="chip weak">${esc(t.name)} ${pct(t.mastery)}</span>`).join("") : '<span class="muted small">None yet.</span>'}</div><h3>Strong</h3><div class="chips">${st.strong.length ? st.strong.map((t) => `<span class="chip strong">${esc(t.name)} ${pct(t.mastery)}</span>`).join("") : '<span class="muted small">Keep playing to build mastery.</span>'}</div></div>
      <div class="glass">${sh("03", "Achievements")}<div class="ach">${ach.map((a) => `<span class="a ${a.earned ? "on" : ""}">${a.earned ? "&#9733; " : ""}${esc(a.name)}</span>`).join("")}</div></div></div></div>`;
  },
};
const AFTER = {
  arena() {
    document.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));
    document.querySelectorAll("[data-sel]").forEach((b) => (b.onclick = () => { S.sel = +b.dataset.sel; S.node = null; go("arena"); }));
    const pickNode = (i, c) => { const g = curGame(); S.node = i; S.cnode = c; const box = $("#nodebox"); if (box) { box.innerHTML = nodeCard(g, i, c); box.scrollIntoView({ behavior: "smooth", block: "nearest" }); wireAsk(); } document.querySelectorAll(".tn").forEach((t) => t.classList.toggle("sel", +t.dataset.node === i && t.dataset.c == null && c == null)); };
    document.querySelectorAll(".tn[data-node]").forEach((t) => (t.onclick = () => { const i = +t.dataset.node, n = curGame().nodes[i]; if (n.status === "locked" && t.dataset.c == null) return toast("Finish the earlier chapters to unlock this one"); pickNode(i, t.dataset.c == null ? null : +t.dataset.c); }));
    document.querySelectorAll(".qch li[data-node]").forEach((li) => (li.onclick = () => { if (li.classList.contains("locked")) return; pickNode(+li.dataset.node, null); }));
    if ($("#upcard")) wireUpload();
    wireAsk();
    if (!S.lb) api("/api/leaderboard").then((lb) => { S.lb = lb; if (S.view === "arena") go("arena"); }).catch(() => {});
  },
  quests() {
    document.querySelectorAll("[data-rebuild]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Build a new version of this game with the new lessons and knowledge tablets? Your current game stays as it is.")) return;
      b.disabled = true;
      try {
        const job = await api("/api/games/" + b.dataset.rebuild + "/rebuild", "POST", {}); toast("Rebuilding: it appears in your quests when it is ready (a few minutes).");
        const tick = async () => { const j = await api("/api/jobs/" + job.id).catch(() => null); if (!j) return; if (j.status === "done") { toast("New version ready: " + (j.title || "")); refresh(); } else if (j.status === "error") toast(j.error); else setTimeout(tick, 4000); };
        tick();
      } catch (e) { toast(e.message); b.disabled = false; }
    }));
    if ($("#upcard")) wireUpload();
    document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { if (confirm("Delete this game and your progress in it?")) { await api("/api/games/" + b.dataset.del, "DELETE"); await refresh(); } }));
  },
  arc() {
    Arc.mount({ inline: true, container: $("#arcbox"), gameId: S.arcGame });
    document.querySelectorAll("[data-ag]").forEach((b) => (b.onclick = () => { S.arcGame = b.dataset.ag; go("arc"); }));
    if (S.arcAsk) { const q = S.arcAsk; S.arcAsk = null; setTimeout(() => Arc.ask(q), 300); }
  },
  armory() {
    document.querySelectorAll("[data-ench]").forEach((b) => (b.onclick = async () => {
      const e = S.hero.enchants.find((x) => x.id === b.dataset.ench); if (!e.unlocked) return toast("Reach level " + e.unlock + " to unlock " + e.name);
      let ids = S.hero.enchants.filter((x) => x.equipped).map((x) => x.id); ids = e.equipped ? ids.filter((i) => i !== e.id) : [...ids, e.id].slice(-S.hero.slots);
      try { S.hero = await api("/api/hero/equip", "POST", { enchants: ids }); go("armory"); } catch (er) { toast(er.message); }
    }));
    document.querySelectorAll("[data-up]").forEach((b) => (b.onclick = async () => { try { S.hero = await api("/api/hero/upgrade", "POST", { id: b.dataset.up }); toast("Enhancement upgraded"); go("armory"); } catch (er) { toast(er.message); } }));
  },
  progress() {},
};
function wireAsk() { document.querySelectorAll("[data-ask]").forEach((b) => (b.onclick = () => { S.arcAsk = b.dataset.ask; const g = curGame(); S.arcGame = g ? g.id : ""; go("arc"); })); }

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
        if ($("#pf")) { $("#pf").style.width = j.pct + "%"; $("#pm").textContent = j.error ? j.error : j.message + (j.total ? ` (${j.ready}/${j.total} chapters)` : ""); }
        if (j.ready >= 1 && j.script && j.status !== "done" && $("#pb")) $("#pb").innerHTML = `<a class="gbtn hero" href="/play.html?job=${encodeURIComponent(job.id)}">Play chapter 1 now</a>`;
        if (j.status === "done") { toast("Game ready: " + (j.title || "")); await refresh(); return; }
        if (j.status === "error") { if ($("#msg")) $("#msg").innerHTML = `<div class="err">${esc(j.error)}</div>`; if ($("#go")) $("#go").disabled = false; toast(j.error); return; }
        setTimeout(tick, 1500);
      };
      tick();
    } catch (e) { $("#msg").innerHTML = `<div class="err">${esc(e.message)}</div>`; $("#go").disabled = false; }
  };
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
  S.lb = null; await load(); dash();
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
