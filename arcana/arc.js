// Arc Search: ARCANA's built-in AI assistant. A slide-in panel in the game (locked while a question or quest is on screen)
// and a full screen in the hub. Answers anything; when a game is open it also uses the student's own notes.
const Arc = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const st = { gameId: "", locked: false, reason: "", open: false, busy: false, notes: [], loaded: false, ctx: () => null, onOpen: null, onClose: null, inline: false, root: null };

  // ---- tiny, safe Markdown (input is escaped first) ----
  function md(src) {
    const blocks = [], lines = esc(src).replace(/\r/g, "").split("\n");
    let i = 0;
    const inline = (t) => t.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; blocks.push(`<pre><code>${buf.join("\n")}</code></pre>`); continue; }
      const h = l.match(/^(#{1,4})\s+(.*)/); if (h) { blocks.push(`<h${Math.min(4, h[1].length + 2)}>${inline(h[2])}</h${Math.min(4, h[1].length + 2)}>`); i++; continue; }
      if (/^\s*[-*•]\s+/.test(l)) { const it = []; while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) it.push(`<li>${inline(lines[i++].replace(/^\s*[-*•]\s+/, ""))}</li>`); blocks.push(`<ul>${it.join("")}</ul>`); continue; }
      if (/^\s*\d+[.)]\s+/.test(l)) { const it = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) it.push(`<li>${inline(lines[i++].replace(/^\s*\d+[.)]\s+/, ""))}</li>`); blocks.push(`<ol>${it.join("")}</ol>`); continue; }
      if (/^&gt;\s?/.test(l)) { blocks.push(`<blockquote>${inline(l.replace(/^&gt;\s?/, ""))}</blockquote>`); i++; continue; }
      if (!l.trim()) { i++; continue; }
      const para = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*[-*•]\s|\s*\d+[.)]\s|&gt;)/.test(lines[i])) para.push(lines[i++]);
      blocks.push(`<p>${inline(para.join("<br>"))}</p>`);
    }
    return blocks.join("");
  }

  async function api(path, method = "GET", body) {
    const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Request failed (" + r.status + ")");
    return j;
  }

  // ---- DOM ----
  const SUGGEST = ["Explain this chapter simply", "Give me a real-life example", "What are the key terms I should know?", "Make me a 5-point summary"];
  function panelHTML() {
    return `<div class="arc-head"><div><b>ARC</b> SEARCH<span>Ask anything</span></div>${st.inline ? "" : '<button class="arc-x" title="Close (Esc)">&times;</button>'}</div>
      <div class="arc-tabs"><button data-t="ask" class="on">Ask</button><button data-t="notes">My notes</button></div>
      <div class="arc-body" data-pane="ask"><div class="arc-msgs" aria-live="polite"></div>
        <div class="arc-sugg">${SUGGEST.map((s) => `<button>${esc(s)}</button>`).join("")}</div>
        <form class="arc-form"><textarea rows="2" maxlength="2000" placeholder="Ask Arc anything... (Enter to send, Shift+Enter for a new line)"></textarea><button class="arc-send" title="Send">&#10148;</button></form>
        <div class="arc-foot"><span class="arc-use"></span><button class="arc-clear">Clear chat</button></div></div>
      <div class="arc-body hidden" data-pane="notes"><input class="arc-find" placeholder="Search your notes"><div class="arc-notes"></div></div>
      <div class="arc-lock hidden"><b>&#128274; Locked</b><span></span></div>`;
  }
  function mount(o = {}) {
    Object.assign(st, { gameId: o.gameId || "", ctx: o.getContext || (() => null), onOpen: o.onOpen, onClose: o.onClose, inline: !!o.inline, loaded: false, busy: false });
    const el = document.createElement("aside"); el.id = "arc"; el.className = st.inline ? "inline" : "drawer"; el.innerHTML = panelHTML(); st.root = el;
    if (st.inline) { o.container.innerHTML = ""; o.container.appendChild(el); st.open = true; }
    else {
      document.body.appendChild(el);
      const b = document.createElement("button"); b.id = "arc-btn"; b.innerHTML = '<i>&#9672;</i><span>ARC SEARCH</span><kbd>Q</kbd>'; b.title = "Arc Search: ask anything (Q)";
      if (o.anchor) { b.classList.add("ingame"); o.anchor.appendChild(b); } else document.body.appendChild(b);
      b.onclick = () => toggle();
      window.addEventListener("keydown", (e) => {
        if (e.target && e.target.closest && e.target.closest("input,textarea")) { if (e.key === "Escape" && st.open) close(); return; }
        if ((e.key === "q" || e.key === "Q") && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggle(); }
        else if (e.key === "Escape" && st.open) close();
      });
    }
    const $ = (s) => el.querySelector(s);
    if ($(".arc-x")) $(".arc-x").onclick = close;
    el.querySelectorAll(".arc-tabs button").forEach((b) => (b.onclick = () => tab(b.dataset.t)));
    el.querySelectorAll(".arc-sugg button").forEach((b) => (b.onclick = () => send(b.textContent)));
    const ta = $("textarea");
    $(".arc-form").onsubmit = (e) => { e.preventDefault(); send(ta.value); };
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(ta.value); } });
    $(".arc-clear").onclick = async () => { if (!confirm("Clear this chat?")) return; await api("/api/arc?game=" + encodeURIComponent(st.gameId), "DELETE").catch(() => {}); $(".arc-msgs").innerHTML = ""; greet(); };
    $(".arc-find").oninput = renderNotes;
    if (st.inline) load();
  }
  function tab(t) {
    st.root.querySelectorAll(".arc-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
    st.root.querySelectorAll(".arc-body").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== t));
    if (t === "notes") renderNotes();
  }
  function greet() { bubble("assistant", "Hi, I'm **Arc**. Ask me anything: a concept from your notes, homework help, a quick explanation or an example. " + (st.gameId ? "I can also use the notes you uploaded for this game." : "")); }
  function bubble(role, text, extra = "") {
    const m = st.root.querySelector(".arc-msgs"), d = document.createElement("div");
    d.className = "arc-m " + role; d.innerHTML = (role === "assistant" ? md(text) : `<p>${esc(text)}</p>`) + extra;
    m.appendChild(d); m.scrollTop = m.scrollHeight; return d;
  }
  async function load() {
    if (st.loaded) return; st.loaded = true;
    try {
      const j = await api("/api/arc?game=" + encodeURIComponent(st.gameId));
      if (!j.messages.length) greet(); else j.messages.forEach((m) => bubble(m.role, m.content));
      usage(j.usedToday, j.dailyLimit);
      if (!j.ai) bubble("assistant", "*Arc Search needs an AI key on the server, so it cannot answer right now.*");
    } catch (e) { greet(); }
  }
  function usage(n, max) { const u = st.root.querySelector(".arc-use"); if (u && max) u.textContent = `${n} / ${max} questions today`; }
  async function send(text) {
    text = String(text || "").trim(); if (!text || st.busy) return;
    if (st.locked) return;
    const ta = st.root.querySelector("textarea"); ta.value = ""; st.busy = true;
    bubble("user", text); const wait = bubble("assistant", "", '<div class="arc-typing"><i></i><i></i><i></i></div>');
    try {
      const j = await api("/api/arc", "POST", { message: text, gameId: st.gameId || undefined, context: st.ctx() || undefined });
      wait.innerHTML = md(j.answer) + (j.notesUsed ? '<div class="arc-src">Used your notes</div>' : j.sources && j.sources.length ? '<div class="arc-src">Checked live sources</div>' : "");
      const u = st.root.querySelector(".arc-use"); if (u) { const m = u.textContent.match(/(\d+) \/ (\d+)/); if (m) usage(+m[1] + 1, +m[2]); }
    } catch (e) { wait.innerHTML = `<p class="arc-err">${esc(e.message)}</p>`; }
    st.busy = false; st.root.querySelector(".arc-msgs").scrollTop = 1e9; ta.focus();
  }
  // ---- notes (everything the game has taught so far) ----
  function addNote(n) { if (!st.notes.some((x) => JSON.stringify(x) === JSON.stringify(n))) st.notes.push(n); }
  function renderNotes() {
    const box = st.root.querySelector(".arc-notes"), q = (st.root.querySelector(".arc-find").value || "").toLowerCase();
    const list = st.notes.filter((n) => !q || JSON.stringify(n).toLowerCase().includes(q));
    box.innerHTML = list.length ? list.slice().reverse().map((n, i) => n.kind === "tablet"
      ? `<div class="arc-note"><b>&#9638; ${esc(n.title)}</b><ul>${(n.points || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>${n.example ? `<p><i>Example:</i> ${esc(n.example)}</p>` : ""}<button data-ask="${esc("Explain this more simply with an example: " + n.title + ". " + (n.points || []).join(" "))}">Ask Arc about this</button></div>`
      : `<div class="arc-note"><b>&#9673; ${esc(n.from)}${n.role ? " &middot; " + esc(n.role) : ""}</b>${n.keyIdea ? `<p class="k">${esc(n.keyIdea)}</p>` : ""}<details><summary>Full lesson</summary>${n.lines.map((l) => `<p>${esc(l)}</p>`).join("")}</details><button data-ask="${esc("Explain this more simply: " + (n.keyIdea || n.lines.join(" ")))}">Ask Arc about this</button></div>`).join("")
      : `<p class="arc-empty">${st.notes.length ? "Nothing matches that search." : "Lessons and tablets you complete appear here so you can review them any time."}</p>`;
    box.querySelectorAll("[data-ask]").forEach((b) => (b.onclick = () => { tab("ask"); send(b.dataset.ask); }));
  }
  // ---- open / close / lock ----
  function open() {
    if (st.inline || st.open) return;
    if (st.locked) { flashLock(); return; }
    st.open = true; st.root.classList.add("open"); document.getElementById("arc-btn").classList.add("on"); load(); st.onOpen && st.onOpen();
    setTimeout(() => st.root.querySelector("textarea").focus(), 220);
  }
  function close() { if (st.inline || !st.open) return; st.open = false; st.root.classList.remove("open"); document.getElementById("arc-btn").classList.remove("on"); st.onClose && st.onClose(); }
  function toggle() { st.open ? close() : open(); }
  function flashLock() { const b = document.getElementById("arc-btn"); if (!b) return; b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); b.title = "Arc Search is locked: " + st.reason; }
  function setLocked(on, reason = "Finish the current question or quest first.") {
    st.locked = on; st.reason = reason; const b = document.getElementById("arc-btn"); if (b) b.classList.toggle("locked", on);
    const l = st.root && st.root.querySelector(".arc-lock"); if (l) { l.classList.toggle("hidden", !on); l.querySelector("span").textContent = reason; }
    if (on && st.open) close();
  }
  return { mount, open, close, toggle, setLocked, addNote, md, ask: (t) => send(t), get isOpen() { return st.open; } };
})();
window.Arc = Arc;
