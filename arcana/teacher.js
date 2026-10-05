// Teacher portal: accounts, classes, games, assignments and class reports. All text from the server is escaped.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app");
let state = { me: null, classes: [], games: [], sel: null, game: null, report: null, status: null };

async function api(path, method = "GET", body) {
  const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed (" + r.status + ")");
  return j;
}
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; $("#toasts").appendChild(t); setTimeout(() => t.remove(), 3200); }
const ago = (t) => { if (!t) return "never"; const s = Math.floor(Date.now() / 1000 - t); return s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 129600 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; };
const cls = (pct) => (pct >= 70 ? "" : pct >= 45 ? "mid" : "bad");

// ------------------------------------------------------------------ auth
function authView(msg = "") {
  let mode = "login";
  const draw = () => {
    app.innerHTML = `<div class="card auth"><h1>Teacher portal</h1><p class="muted">Create games from your notes, put them in a class, and see which topics your students find hard. Students only need a class code and a nickname.</p>
      <div class="tabs"><button class="${mode === "login" ? "on" : ""}" data-m="login">Log in</button><button class="${mode === "register" ? "on" : ""}" data-m="register">Create account</button></div>
      <form id="f">${mode === "register" ? '<label>Your name<input name="name" maxlength="60" autocomplete="name" required></label>' : ""}
      <label>Email<input name="email" type="email" autocomplete="email" required></label>
      <label>Password<input name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="${mode === "register" ? 8 : 1}" required></label>
      <div id="e">${msg ? `<div class="err">${esc(msg)}</div>` : ""}</div><button class="primary" style="width:100%">${mode === "login" ? "Log in" : "Create account"}</button></form></div>`;
    app.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { mode = b.dataset.m; msg = ""; draw(); }));
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
      try { await api(mode === "login" ? "/api/teacher/login" : "/api/teacher/register", "POST", d); await boot(); } catch (er) { $("#e").innerHTML = `<div class="err">${esc(er.message)}</div>`; }
    };
  };
  draw();
}

// ------------------------------------------------------------------ dashboard
async function load() {
  [state.classes, state.games] = await Promise.all([api("/api/classes"), api("/api/teacher/games")]);
  if (!state.classes.find((c) => c.id === state.sel)) state.sel = state.classes[0]?.id ?? null;
}
function dash() {
  $("#who").innerHTML = `<span class="muted small">${esc(state.me.name)}</span> &nbsp; <button class="ghost" id="out">Log out</button>`;
  $("#out").onclick = async () => { await api("/api/teacher/logout", "POST"); state.me = null; $("#who").innerHTML = ""; authView(); };
  app.innerHTML = `<div class="grid cols">
    <div class="grid">
      <div class="card"><div class="row between"><h2>My classes</h2><button id="newc">+ New</button></div><div class="list" id="clist">${state.classes.length ? state.classes.map((c) => `<div class="item ${c.id === state.sel ? "sel" : ""}" data-id="${c.id}"><div><b>${esc(c.name)}</b><div class="tag">${c.students} STUDENTS // ${c.games.length} GAMES</div></div><span class="tag">${esc(c.code)}</span></div>`).join("") : '<div class="empty">No classes yet.<br>Create one to get a join code.</div>'}</div></div>
      <div class="card"><div class="row between"><h2>My games</h2><button class="primary" id="newg">+ Create</button></div><div class="list">${state.games.length ? state.games.map((g) => `<div class="item" style="cursor:default"><div><b>${esc(g.title)}</b></div><div class="row"><a class="btn" href="/?script=${esc(g.id)}" target="_blank" rel="noopener">Play</a><button class="danger" data-del="${esc(g.id)}">Delete</button></div></div>`).join("") : '<div class="empty">No games yet.<br>Upload your notes to make one.</div>'}</div></div>
    </div><div id="detail"></div></div>`;
  $("#newc").onclick = newClass; $("#newg").onclick = newGame;
  app.querySelectorAll("#clist .item").forEach((i) => (i.onclick = () => { state.sel = +i.dataset.id; state.game = null; state.report = null; dash(); }));
  app.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { if (confirm("Delete this game and remove it from every class?")) { await api("/api/games/" + b.dataset.del, "DELETE"); await load(); dash(); } }));
  detail();
}
async function newClass() {
  const name = prompt("Class name (for example: Grade 9 Biology)"); if (!name) return;
  try { const r = await api("/api/classes", "POST", { name }); await load(); state.sel = r.id; dash(); toast("Class created"); } catch (e) { toast(e.message); }
}

async function detail() {
  const c = state.classes.find((x) => x.id === state.sel), box = $("#detail");
  if (!c) { box.innerHTML = '<div class="card empty"><h1>Welcome</h1><p>1. Create a class<br>2. Create a game from your notes<br>3. Assign the game to the class<br>4. Share the class code with students</p></div>'; return; }
  const free = state.games.filter((g) => !c.games.find((x) => x.id === g.id));
  box.innerHTML = `<div class="card"><div class="row between"><div><h3>Class code: students type this</h3><div class="code" id="code">${esc(c.code)}</div></div><div class="row"><button id="copy">Copy code</button><button class="danger" id="delc">Delete class</button></div></div>
    <p class="muted small">Students open the game, press <b>Join class</b>, and enter this code with a nickname. No email or password is needed.</p>
    <h3>Games in this class</h3><div class="list">${c.games.length ? c.games.map((g) => `<div class="item ${state.game === g.id ? "sel" : ""}" data-g="${esc(g.id)}"><b>${esc(g.title)}</b><div class="row"><span class="tag">VIEW REPORT</span><button class="ghost danger" data-un="${esc(g.id)}">Remove</button></div></div>`).join("") : '<div class="empty">No game assigned yet.</div>'}</div>
    <div class="row" style="margin-top:12px">${free.length ? `<select id="pick" style="max-width:320px">${free.map((g) => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join("")}</select><button id="assign" class="primary">Assign to class</button>` : '<span class="muted small">Create a game first, then assign it here.</span>'}</div></div><div id="rep"></div>`;
  $("#copy").onclick = () => { navigator.clipboard?.writeText(c.code); toast("Code copied: " + c.code); };
  $("#delc").onclick = async () => { if (confirm("Delete this class, its students and their results?")) { await api("/api/classes/" + c.id, "DELETE"); await load(); dash(); } };
  $("#assign")?.addEventListener("click", async () => { try { await api(`/api/classes/${c.id}/assign`, "POST", { gameId: $("#pick").value }); await load(); state.game = $("#pick")?.value || null; dash(); toast("Game assigned"); } catch (e) { toast(e.message); } });
  box.querySelectorAll("[data-g]").forEach((i) => (i.onclick = (e) => { if (e.target.closest("[data-un]")) return; state.game = i.dataset.g; detail(); }));
  box.querySelectorAll("[data-un]").forEach((b) => (b.onclick = async () => { await api(`/api/classes/${c.id}/assign`, "POST", { gameId: b.dataset.un, on: false }); state.game = null; await load(); dash(); }));
  const gid = state.game || c.games[0]?.id; if (gid) { state.game = gid; report(c, gid); }
}

async function report(c, gid) {
  const box = $("#rep"); box.innerHTML = '<div class="card muted">Loading report...</div>';
  let r; try { r = await api(`/api/classes/${c.id}/report?game=${encodeURIComponent(gid)}`); } catch (e) { box.innerHTML = `<div class="card"><div class="err">${esc(e.message)}</div></div>`; return; }
  const s = r.summary;
  box.innerHTML = `<div class="card"><div class="row between"><h2>Report: ${esc(r.game.title)}</h2><div class="row"><button id="csv">Export CSV</button><button id="ref">Refresh</button></div></div>
    <div class="stats"><div class="stat"><b>${s.students}</b><span>Students joined</span></div><div class="stat"><b>${s.started}</b><span>Started playing</span></div><div class="stat"><b>${s.finished}</b><span>Finished</span></div><div class="stat"><b>${s.accuracy == null ? "-" : s.accuracy + "%"}</b><span>Class accuracy</span></div></div>
    <h3>Topics ranked from hardest to easiest</h3>${r.concepts.length ? r.concepts.map((k) => `<div class="cbar"><span>${esc(k.name)}</span><div class="bar ${cls(k.accuracy)}"><i style="width:${k.accuracy}%"></i></div><b>${k.accuracy}%</b></div>`).join("") + '<p class="muted small">Re-teach the red topics first.</p>' : '<p class="muted">No answers yet. Results appear here as students play.</p>'}
    ${r.hardest.length ? "<h3>Questions students miss most</h3>" + r.hardest.map((h) => `<div class="hard"><b>${esc(h.prompt)}</b><br><span>Correct answer: ${esc(h.answer)} // ${h.accuracy}% got it right (${h.attempts} tries)</span></div>`).join("") : ""}
    <h3>Students</h3><div class="scroll"><table><tr><th>Nickname</th><th>Progress</th><th>Accuracy</th><th>Answers</th><th>Score</th><th>Last seen</th><th></th></tr>${r.students.length ? r.students.map((x) => `<tr><td><b>${esc(x.nickname)}</b></td><td><div class="bar"><i style="width:${Math.round(100 * (x.finished ? r.totalChapters : x.chapter) / r.totalChapters)}%"></i></div></td><td>${x.accuracy == null ? "-" : x.accuracy + "%"}</td><td>${x.answered}</td><td>${x.score}</td><td>${ago(x.last_seen)}</td><td><button class="ghost danger" data-rm="${x.id}">Remove</button></td></tr>`).join("") : '<tr><td colspan="7" class="muted">Nobody has joined yet. Share the class code.</td></tr>'}</table></div></div>`;
  $("#ref").onclick = () => report(c, gid);
  $("#csv").onclick = () => {
    const rows = [["Nickname", "Progress chapters", "Finished", "Accuracy %", "Answers", "Score", "Last seen"], ...r.students.map((x) => [x.nickname, x.chapter, x.finished ? "yes" : "no", x.accuracy ?? "", x.answered, x.score, x.last_seen ? new Date(x.last_seen * 1000).toISOString() : ""])];
    const safe = (v) => { v = String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };    // blocks spreadsheet formula injection
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((x) => x.map(safe).join(",")).join("\n")], { type: "text/csv" })); a.download = "arcana-report.csv"; a.click();
  };
  box.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => { if (confirm("Remove this student and their results?")) { await api(`/api/classes/${c.id}/students/${b.dataset.rm}`, "DELETE"); report(c, gid); } }));
}

// ------------------------------------------------------------------ create a game
function newGame() {
  const dlg = document.createElement("dialog");
  dlg.innerHTML = `<h2>Create a game</h2><p class="muted small" id="note"></p>
    <label>Upload a file (PDF, DOCX, PPTX, TXT, MD, HTML or an image)<input type="file" id="file" accept=".pdf,.docx,.pptx,.txt,.md,.html,.htm,.csv,.png,.jpg,.jpeg,.webp"></label>
    <label>...or paste your notes<textarea id="paste" rows="5" placeholder="Paste at least a few paragraphs"></textarea></label>
    <div id="msg"></div><div class="row" style="justify-content:flex-end"><button id="cancel">Close</button><button class="primary" id="go">Create game</button></div>`;
  document.body.appendChild(dlg); dlg.showModal();
  api("/api/status").then((s) => { $("#note", dlg).textContent = s.llm ? "AI is on (" + s.model + "). If one service is busy, the next one takes over." : "No AI key is set, so a simpler offline game will be made."; });
  $("#cancel", dlg).onclick = () => { dlg.close(); dlg.remove(); };
  $("#go", dlg).onclick = async () => {
    const f = $("#file", dlg).files[0], text = $("#paste", dlg).value.trim();
    if (!f && text.length < 200) return ($("#msg", dlg).innerHTML = '<div class="err">Choose a file or paste at least a few paragraphs.</div>');
    $("#go", dlg).disabled = true;
    try {
      const data = f ? await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(f); }) : null;
      const job = await api("/api/jobs", "POST", f ? { filename: f.name, data } : { filename: "pasted-notes.txt", text });
      $("#msg", dlg).innerHTML = '<div class="pbar"><i id="pf"></i></div><p id="pm" class="muted"></p>';
      const tick = async () => {
        const j = await api("/api/jobs/" + job.id); $("#pf", dlg).style.width = j.pct + "%"; $("#pm", dlg).textContent = j.error ? j.error : j.message + (j.total ? ` (${j.ready}/${j.total} chapters)` : "");
        if (j.status === "done") { await load(); dlg.close(); dlg.remove(); dash(); toast("Game ready: " + (j.title || "")); return; }
        if (j.status === "error") { $("#msg", dlg).innerHTML = `<div class="err">${esc(j.error)}</div>`; $("#go", dlg).disabled = false; return; }
        setTimeout(tick, 1500);
      };
      tick();
    } catch (e) { $("#msg", dlg).innerHTML = `<div class="err">${esc(e.message)}</div>`; $("#go", dlg).disabled = false; }
  };
}

async function boot() {
  try { const m = await api("/api/me"); state.me = m.teacher; } catch (e) { app.innerHTML = '<div class="card auth"><div class="err">Cannot reach the server. Start it with: python server/server.py</div></div>'; return; }
  if (!state.me) return authView();
  await load(); dash();
}
boot();
