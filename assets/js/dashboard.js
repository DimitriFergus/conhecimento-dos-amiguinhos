/* ============================================================
   CONHECIMENTO DOS AMIGUINHOS — Dashboard
   Sessão em localStorage. Capas via OpenLibrary com fallback.
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const LS = window.localStorage;

  /* ---------- Guarda de sessão: precisa estar logado ---------- */
  if (!window.CDA || !CDA.auth.isLoggedIn()) { window.location.href = "../inicio/index.html"; return; }

  const coverURL = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;

  /* ---------- Tema (claro/escuro) ---------- */
  (function themeSetup() {
    const tt = document.getElementById("themeToggle");
    const root = document.documentElement;
    function sync() { if (tt) tt.textContent = root.getAttribute("data-theme") === "dark" ? "☀" : "☾"; }
    sync();
    if (tt) tt.addEventListener("click", () => {
      const dark = root.getAttribute("data-theme") === "dark";
      if (dark) { root.removeAttribute("data-theme"); LS.setItem("cda_theme", "light"); }
      else { root.setAttribute("data-theme", "dark"); LS.setItem("cda_theme", "dark"); }
      sync();
    });
  })();

  /* ---------- Catálogo (com ISBN p/ capas) ---------- */
  const CATALOG = {
    "Noites Brancas": { a: "F. Dostoiévski", c: "literatura", cat: "Literatura", isbn: "9780140445770" },
    "O Mal-Estar na Civilização": { a: "Sigmund Freud", c: "filosofia", cat: "Filosofia", isbn: "9780393301588" },
    "Sapiens": { a: "Yuval N. Harari", c: "historia", cat: "História", isbn: "9780062316097" },
    "Duna": { a: "Frank Herbert", c: "ficcao", cat: "Ficção científica", isbn: "9780441013593" },
    "Fundação": { a: "Isaac Asimov", c: "ficcao", cat: "Ficção científica", isbn: "9780553293357" },
    "1984": { a: "George Orwell", c: "ficcao", cat: "Ficção científica", isbn: "9780451524935" },
    "Neuromancer": { a: "William Gibson", c: "ficcao", cat: "Ficção científica", isbn: "9780441569595" },
    "Hábitos Atômicos": { a: "James Clear", c: "autoajuda", cat: "Auto-ajuda", isbn: "9780735211292" },
    "O Poder do Agora": { a: "Eckhart Tolle", c: "autoajuda", cat: "Auto-ajuda", isbn: "9781577314806" },
    "Mindset": { a: "Carol Dweck", c: "autoajuda", cat: "Auto-ajuda", isbn: "9780345472328" },
    "Assim Falou Zaratustra": { a: "F. Nietzsche", c: "filosofia", cat: "Filosofia", isbn: "9780140441185" },
    "Meditações": { a: "Marco Aurélio", c: "filosofia", cat: "Filosofia", isbn: "9780140449334" },
    "A República": { a: "Platão", c: "filosofia", cat: "Filosofia", isbn: "9780140455113" },
    "A Era dos Extremos": { a: "Eric Hobsbawm", c: "historia", cat: "História", isbn: "9780349106717" },
    "Armas, Germes e Aço": { a: "Jared Diamond", c: "historia", cat: "História", isbn: "9780393317558" },
    "Dom Casmurro": { a: "Machado de Assis", c: "literatura", cat: "Literatura", isbn: "9780195106817" },
    "Grande Sertão: Veredas": { a: "Guimarães Rosa", c: "literatura", cat: "Literatura", isbn: "9780394724782" },
    "Crime e Castigo": { a: "F. Dostoiévski", c: "literatura", cat: "Literatura", isbn: "9780140449136" },
    "Cem Anos de Solidão": { a: "G. García Márquez", c: "literatura", cat: "Literatura", isbn: "9780060883287" },
    "O Homem que Calculava": { a: "Malba Tahan", c: "matematica", cat: "Matemática", isbn: "9780393309348" },
    "Alex no País dos Números": { a: "Alex Bellos", c: "matematica", cat: "Matemática", isbn: "9781408809594" },
    "Uma História da Matemática": { a: "Carl B. Boyer", c: "matematica", cat: "Matemática", isbn: "9780471543978" },
  };

  const CAT_CLASS = { ficcao: "cov-ficcao", autoajuda: "cov-autoajuda", filosofia: "cov-filosofia", historia: "cov-historia", literatura: "cov-literatura", matematica: "cov-matematica" };
  const initials = (t) => t.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  /* ============================================================
     SESSÃO — vem do banco de dados (conta logada)
     ============================================================ */
  function loadSession() {
    const m = CDA.data.meta();
    return { name: m.name, email: m.email, points: m.points || 0, avatar: m.avatar || null, quizDone: m.quizDone || 0 };
  }
  function saveSession(s) { CDA.data.setMeta({ name: s.name, avatar: s.avatar, points: s.points, quizDone: s.quizDone }); }
  const session = loadSession();

  /* ============================================================
     HISTÓRICO DE LEITURA (por conta) + ESTANTE (só filiação)
     Tudo isolado por usuário via o banco de dados (CDA.data).
     O histórico guarda progresso/pontos por livro e NUNCA é
     apagado ao tirar/recolocar — é o que impede farm de pontos.
     ============================================================ */
  function getHist(t) { return CDA.data.hist(t); }
  function readShelf() { return CDA.data.shelf(); }
  function writeShelf(list) { CDA.data.setShelf(list); }

  /* Estante = livros na filiação, com o progresso vindo do histórico */
  function loadEstante() {
    const shelf = readShelf() || [];
    return shelf.map((t) => ({ t, progress: Math.round(getHist(t).progress || 0), ...(CATALOG[t] || { a: "Autor", c: "literatura", cat: "Literatura", isbn: "" }) }));
  }
  let estante = loadEstante();

  const slug = (t) => encodeURIComponent(t);
  const readerLink = (t) => `../leitor/reader.html?book=${slug(t)}`;
  function openReader(t) { window.location.href = readerLink(t); }

  /* ============================================================
     XP / LVL
     ============================================================ */
  const PER_LEVEL = 500;
  function xpData(points) {
    const level = Math.floor(points / PER_LEVEL) + 1;
    const inLevel = points % PER_LEVEL;
    return { level, inLevel, need: PER_LEVEL, pct: (inLevel / PER_LEVEL) * 100 };
  }

  /* ============================================================
     RANKING (usuário inserido pela pontuação)
     ============================================================ */
  function buildRank() {
    const base = [
      { n: "Bruna Camargo", h: "Filosofia · 14 livros", p: 2380, cor: "var(--vermelho)" },
      { n: "Téo Andrade", h: "Ficção científica · 12 livros", p: 2115, cor: "var(--verde)" },
      { n: "Lia Fontes", h: "Literatura · 11 livros", p: 1960, cor: "var(--ink)" },
      { n: "Rafa Nunes", h: "História · 9 livros", p: 1740, cor: "#2b3a67" },
      { n: "Duda Prado", h: "Matemática · 8 livros", p: 1605, cor: "var(--vermelho-esc)" },
      { n: "Ícaro Melo", h: "Auto-ajuda · 7 livros", p: 1490, cor: "var(--amarelo)" },
    ];
    const me = { n: session.name, h: `${estante.length} livros na estante`, p: session.points, cor: "var(--vermelho)", me: true };
    const list = base.filter((u) => u.n !== session.name).concat(me);
    list.sort((a, b) => b.p - a.p);
    return list;
  }
  function myRankPos() {
    return buildRank().findIndex((u) => u.me) + 1;
  }

  /* ============================================================
     RENDER: perfil / topo / stats
     ============================================================ */
  function renderProfile() {
    const first = session.name.split(" ")[0];
    const inits = initials(session.name);
    const { level, inLevel, need, pct } = xpData(session.points);
    const rank = myRankPos();

    $("#profileName").textContent = session.name;
    $("#profileHandle").textContent = "@" + first.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/gi, "");
    $("#topName").textContent = "Olá, " + first;
    $("#topPts").textContent = session.points.toLocaleString("pt-BR");

    // avatares
    $$(".avatar-init").forEach((el) => (el.textContent = inits));
    applyAvatar(session.avatar);

    // XP
    $("#lvlTag").textContent = "LVL " + level;
    $("#xpNums").textContent = `${inLevel} / ${need} XP`;
    $("#xpHint").textContent = `Faltam ${need - inLevel} XP para o LVL ${level + 1}`;
    requestAnimationFrame(() => { $("#xpFill").style.width = pct + "%"; });

    // mini stats
    animateNum($("#mLvl"), level);
    animateNum($("#mPts"), session.points);
    animateNum($("#mBooks"), estante.length);
    $("#mRank").textContent = "#" + rank;

    // perfil view
    $("#pLvl").textContent = level;
    $("#pPts").textContent = session.points.toLocaleString("pt-BR");
    $("#pBooks").textContent = estante.length;
    $("#pQuiz").textContent = session.quizDone;
    $("#pRank").textContent = "#" + rank;
    $("#nameInput").value = session.name;
  }

  function applyAvatar(dataUrl) {
    $$(".avatar").forEach((av) => {
      if (dataUrl) { av.style.backgroundImage = `url(${dataUrl})`; av.classList.add("has-photo"); }
      else { av.style.backgroundImage = ""; av.classList.remove("has-photo"); }
    });
  }

  function animateNum(el, target) {
    if (prefersReduced) { el.textContent = target.toLocaleString("pt-BR"); return; }
    const dur = 1200; let start;
    (function tick(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.floor(e * target).toLocaleString("pt-BR");
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target.toLocaleString("pt-BR");
    })(0);
  }

  /* ============================================================
     RENDER: continue lendo
     ============================================================ */
  function coverInner(b, small) {
    const cls = CAT_CLASS[b.c] || "cov-literatura";
    const img = b.isbn ? `<img src="${coverURL(b.isbn)}" alt="Capa de ${b.t}" loading="lazy" onerror="this.remove()">` : "";
    if (small) {
      return `<div class="read-cover ${cls}">${img}<span class="rc-fallback">${b.t[0]}</span></div>`;
    }
    return `${img}
      <span class="cover-cat">${b.cat}</span>
      <span class="cover-title">${b.t}</span>
      <span class="cover-author">${b.a}</span>`;
  }

  function renderReading() {
    const list = estante.slice().sort((a, b) => b.progress - a.progress).slice(0, 4);
    $("#readingList").innerHTML = list.map((b) => `
      <article class="read-item">
        ${coverInner(b, true)}
        <div class="read-info">
          <strong>${b.t}</strong>
          <small>${b.a} · ${b.cat}</small>
          <div class="read-prog"><span style="width:${b.progress}%"></span></div>
        </div>
        <div>
          <span class="read-pct">${b.progress}%</span>
          <span class="read-cta">continuar →</span>
        </div>
      </article>`).join("");

    $$(".read-item").forEach((item, idx) => item.addEventListener("click", () => {
      openBookInfo(list[idx].t);
    }));
  }

  /* ============================================================
     RENDER: estante
     ============================================================ */
  function renderShelf() {
    const grid = $("#shelfGrid");
    $("#shelfEmpty").hidden = estante.length !== 0;
    grid.innerHTML = estante.map((b) => `
      <article class="shelf-card">
        <button class="shelf-remove" data-title="${b.t}" title="Tirar da estante" aria-label="Tirar da estante">✕ Tirar da estante</button>
        <div class="shelf-cover ${CAT_CLASS[b.c] || "cov-literatura"}">
          ${coverInner(b, false)}
        </div>
        <div class="shelf-body">
          <strong>${b.t}</strong>
          <small>${b.a}</small>
          <div class="shelf-mini"><span style="width:${b.progress}%"></span></div>
          <span class="shelf-pct">${b.progress}% lido</span>
        </div>
      </article>`).join("");

    $$(".shelf-card").forEach((card) => card.addEventListener("click", () => {
      openBookInfo($("strong", card).textContent);
    }));
    $$(".shelf-remove", grid).forEach((btn) => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFromEstante(btn.dataset.title);
    }));
  }

  /* ============================================================
     RENDER: Biblioteca de Alexandria (acervo completo)
     ============================================================ */
  const CATALOG_LIST = Object.keys(CATALOG).map((t) => ({ t, ...CATALOG[t] }));
  let alexFilter = "all";

  function inEstante(t) { return (readShelf() || []).includes(t); }

  function renderAlexandria() {
    const grid = $("#alexGrid");
    const list = alexFilter === "all" ? CATALOG_LIST : CATALOG_LIST.filter((b) => b.c === alexFilter);
    grid.innerHTML = list.map((b, i) => {
      const added = inEstante(b.t);
      return `
      <article class="book-card card-enter" data-title="${b.t}" style="animation-delay:${Math.min(i * 35, 350)}ms">
        <div class="book-cover cov-${b.c}">
          <img class="cover-img" src="${coverURL(b.isbn)}" alt="Capa de ${b.t}" loading="lazy" onerror="this.remove()" />
          <span class="cover-cat">${b.cat}</span>
          <span class="cover-title">${b.t}</span>
          <span class="cover-author">${b.a}</span>
        </div>
        <div class="book-info">
          <button class="book-tag" data-tag="${b.c}">#${b.cat}</button>
          <button class="alex-add ${added ? "is-added" : ""}" data-title="${b.t}">
            <span class="lbl-in">${added ? "✓ Na estante" : "+ Adicionar à estante"}</span>
            <span class="lbl-out">✕ Tirar da estante</span>
          </button>
        </div>
      </article>`;
    }).join("");

    $$(".book-card", grid).forEach((card) => card.addEventListener("click", () => openBookInfo(card.dataset.title)));
    $$(".alex-add", grid).forEach((btn) => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.classList.contains("is-added")) removeFromEstante(btn.dataset.title);
      else addToEstante(btn.dataset.title);
    }));
    $$(".book-tag", grid).forEach((btn) => btn.addEventListener("click", (e) => {
      e.stopPropagation(); setAlexFilter(btn.dataset.tag);
    }));
  }

  function setAlexFilter(f) {
    alexFilter = f;
    $$("#alexFilters .filter").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.filter === f));
    renderAlexandria();
  }
  $$("#alexFilters .filter").forEach((btn) => btn.addEventListener("click", () => setAlexFilter(btn.dataset.filter)));

  function refreshAll() {
    estante = loadEstante();
    renderShelf(); renderReading(); renderAlexandria(); renderRecs(); renderProfile();
  }

  /* adiciona à estante: só mexe na filiação — o histórico é preservado */
  function addToEstante(title) {
    const shelf = readShelf() || [];
    if (!shelf.includes(title)) { shelf.push(title); writeShelf(shelf); }
    refreshAll();
    const h = getHist(title);
    showToast(h.progress > 0 ? `"${title}" voltou à estante em ${h.progress}% 📚` : `"${title}" foi para a sua estante 📚`);
  }

  /* remove da estante: só tira da filiação — progresso e pontos ficam no histórico */
  function removeFromEstante(title) {
    writeShelf((readShelf() || []).filter((t) => t !== title));
    refreshAll();
    showToast(`"${title}" saiu da estante (seu progresso fica guardado)`);
  }

  /* ============================================================
     MODAL DE INFORMAÇÕES DO LIVRO (popup ao clicar)
     ============================================================ */
  const CAT_NAME = { ficcao: "Ficção científica", autoajuda: "Auto-ajuda", filosofia: "Filosofia", historia: "História", literatura: "Literatura", matematica: "Matemática" };
  const DATA = window.CDA_BOOKS || {};
  const bookModal = $("#bookModal");
  let bmLastFocus = null;

  function fmtYear(y) { return y < 0 ? `${Math.abs(y)} a.C.` : `${y}`; }

  function openBookInfo(title) {
    const cat = CATALOG[title] || { a: "Autor", c: "literatura", cat: "Literatura", isbn: "" };
    const info = DATA[title] || { syn: "Sinopse em breve.", why: "", themes: [], pages: null, year: null, dif: "" };
    const h = getHist(title);
    const added = inEstante(title);
    const readable = !!(window.CDA_PDF && window.CDA_PDF[title]);

    $("#bmCat").textContent = cat.cat || CAT_NAME[cat.c] || "";
    $("#bmTitle").textContent = title;
    $("#bmAuthor").textContent = cat.a;
    $("#bmCover").className = "bookmodal-cover cov-" + cat.c;
    $("#bmCover").innerHTML = coverInner({ t: title, a: cat.a, c: cat.c, cat: cat.cat, isbn: cat.isbn }, false);

    const chips = [];
    if (info.year) chips.push(`<span class="bm-chip">📅 <b>${fmtYear(info.year)}</b></span>`);
    if (info.pages) chips.push(`<span class="bm-chip">📖 <b>${info.pages}</b> págs.</span>`);
    if (info.dif) chips.push(`<span class="bm-chip">🎯 Leitura <b>${info.dif}</b></span>`);
    $("#bmChips").innerHTML = chips.join("");

    $("#bmProgress").innerHTML = added && h.progress > 0
      ? `<div class="bmbar"><span style="width:${Math.round(h.progress)}%"></span></div><small>${Math.round(h.progress)}% lido</small>`
      : "";

    $("#bmSyn").textContent = info.syn;
    const whyEl = $("#bmWhy");
    whyEl.textContent = info.why || "";
    whyEl.style.display = info.why ? "" : "none";
    whyEl.previousElementSibling.style.display = info.why ? "" : "none"; // esconde o título "Por que ler"
    $("#bmThemes").innerHTML = (info.themes || []).map((t) => `<span class="bm-theme">${t}</span>`).join("");

    // ações
    const acts = [];
    const readLabel = h.progress > 0 ? "Continuar lendo →" : "Ler agora →";
    acts.push(`<button class="btn btn-solid" data-bm-read>${readable ? readLabel : "Abrir no leitor →"}</button>`);
    acts.push(added
      ? `<button class="btn btn-line" data-bm-remove>✕ Tirar da estante</button>`
      : `<button class="btn btn-line" data-bm-add>+ Adicionar à estante</button>`);
    $("#bmActions").innerHTML = acts.join("");

    const actEl = $("#bmActions");
    const readBtn = actEl.querySelector("[data-bm-read]");
    if (readBtn) readBtn.addEventListener("click", () => openReader(title));
    const addBtn = actEl.querySelector("[data-bm-add]");
    if (addBtn) addBtn.addEventListener("click", () => { addToEstante(title); openBookInfo(title); });
    const remBtn = actEl.querySelector("[data-bm-remove]");
    if (remBtn) remBtn.addEventListener("click", () => { removeFromEstante(title); openBookInfo(title); });

    bmLastFocus = document.activeElement;
    bookModal.classList.add("open");
    bookModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    bookModal.scrollTop = 0;
  }

  function closeBookInfo() {
    bookModal.classList.remove("open");
    bookModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (bmLastFocus && bmLastFocus.focus) bmLastFocus.focus();
  }
  $$("[data-close-book]").forEach((el) => el.addEventListener("click", closeBookInfo));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && bookModal.classList.contains("open")) closeBookInfo(); });

  /* ============================================================
     RECOMENDAÇÕES — algoritmo por afinidade de categoria
     Baseado no histórico (o que já leu + progresso) e na estante.
     ============================================================ */
  function computeRecs(limit) {
    const shelf = readShelf() || [];
    const hist = CDA.data.history();
    const weights = {};
    // o que já leu pesa mais conforme o progresso
    Object.keys(hist).forEach((t) => {
      const c = (CATALOG[t] || {}).c; if (!c) return;
      weights[c] = (weights[c] || 0) + 1 + (hist[t].progress || 0) / 25;
    });
    // livros na estante (mesmo sem ler) também indicam gosto
    shelf.forEach((t) => { const c = (CATALOG[t] || {}).c; if (c) weights[c] = (weights[c] || 0) + 0.6; });

    const hasSignal = Object.keys(weights).length > 0;
    const readSet = new Set(shelf);
    // não recomenda o que já está na estante
    const candidates = CATALOG_LIST.filter((b) => !readSet.has(b.t));

    // categoria favorita (para a justificativa do algoritmo)
    let topCat = null, topW = -1;
    Object.keys(weights).forEach((c) => { if (weights[c] > topW) { topW = weights[c]; topCat = c; } });

    candidates.forEach((b, i) => { b._score = (weights[b.c] || 0) * 10 + ((candidates.length - i) * 0.01); });
    candidates.sort((a, b) => b._score - a._score);

    return { list: candidates.slice(0, limit), topCat, hasSignal };
  }

  function renderRecs() {
    const { list, topCat, hasSignal } = computeRecs(8);
    $("#recoWhy").textContent = hasSignal && topCat
      ? `Porque você tem lido ${CAT_NAME[topCat]}`
      : "Uma seleção pra começar";
    $("#recoGrid").innerHTML = list.map((b) => {
      const reason = topCat && b.c === topCat ? "combina com seu gosto" : `descubra ${CAT_NAME[b.c].toLowerCase()}`;
      return `
      <article class="reco-card" data-title="${b.t}">
        <div class="shelf-cover cov-${b.c}">${coverInner(b, false)}</div>
        <div class="reco-body">
          <strong>${b.t}</strong>
          <small>${b.a}</small>
          <span class="reco-reason">↳ ${reason}</span>
        </div>
      </article>`;
    }).join("");
    $$("#recoGrid .reco-card").forEach((card) => card.addEventListener("click", () => openBookInfo(card.dataset.title)));
  }

  /* ============================================================
     RENDER: ranking
     ============================================================ */
  function renderBoard() {
    const board = $("#board");
    board.innerHTML = buildRank().map((u, i) => {
      const isAmarelo = u.cor === "var(--amarelo)";
      return `
      <li class="board-row ${u.me ? "is-me" : ""}">
        <span class="board-rank">${String(i + 1).padStart(2, "0")}</span>
        <span class="board-user">
          <span class="board-ava" style="background:${u.cor};${isAmarelo ? "color:var(--ink)" : ""}">${initials(u.n)}</span>
          <span class="board-name"><strong>${u.n}${u.me ? " (você)" : ""}</strong><small>${u.h}</small></span>
        </span>
        <span class="board-pts">${u.p.toLocaleString("pt-BR")}<small>pontos</small></span>
      </li>`;
    }).join("");
  }

  /* ============================================================
     QUIZ (desafios do Freud)
     ============================================================ */
  const QUIZ = [
    { w: "Sublimação", options: ["Desviar um impulso para uma atividade socialmente valorizada", "Esquecer um evento traumático por completo", "Sentir prazer com o sofrimento alheio"], correct: 0, note: "Freud usava para artistas e cientistas que canalizam a pulsão em obra." },
    { w: "Recalque", options: ["Repetir um comportamento sem perceber", "Empurrar para o inconsciente algo que causa angústia", "Culpar os outros pelos próprios erros"], correct: 1, note: "O recalcado não some — volta disfarçado em sonhos e atos falhos." },
    { w: "Superego", options: ["A parte instintiva e desejante da mente", "A consciência que julga e impõe regras morais", "A imagem que temos do próprio corpo"], correct: 1, note: "É a voz internalizada da autoridade — os 'deverias' da sua cabeça." },
    { w: "Pulsão", options: ["Uma força interna constante que empurra à ação", "Um medo súbito e irracional", "A lembrança nítida da infância"], correct: 0, note: "Diferente do instinto animal: a pulsão não tem objeto fixo." },
    { w: "Catarse", options: ["Bloqueio total das emoções", "Liberação e alívio de emoções reprimidas", "Divisão da personalidade em duas"], correct: 1, note: "Aristóteles já falava dela no teatro; Freud trouxe para a clínica." },
  ];
  let qi = 0, qscore = 0, qlocked = false, qFinished = false;
  const qWord = $("#quizWord"), qOptions = $("#quizOptions"), qFeedback = $("#quizFeedback");
  const qProgress = $("#quizProgress"), qScoreEl = $("#quizScore"), qNext = $("#quizNext");

  function loadQuestion() {
    qlocked = false;
    const q = QUIZ[qi];
    qProgress.textContent = `Palavra ${qi + 1} de ${QUIZ.length}`;
    qWord.textContent = q.w;
    qFeedback.textContent = ""; qFeedback.className = "quiz-feedback";
    qNext.hidden = true; qOptions.innerHTML = "";
    q.options.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.className = "quiz-opt"; btn.textContent = opt;
      btn.addEventListener("click", () => answer(idx, btn));
      qOptions.appendChild(btn);
    });
  }
  function answer(idx, btn) {
    if (qlocked) return; qlocked = true;
    const q = QUIZ[qi];
    const opts = $$(".quiz-opt", qOptions);
    opts.forEach((o) => (o.disabled = true));
    opts[q.correct].classList.add("correct");
    if (idx === q.correct) {
      qscore += 10; qScoreEl.textContent = `${qscore} pts`;
      qFeedback.textContent = "Mandou bem! " + q.note; qFeedback.className = "quiz-feedback ok";
    } else {
      btn.classList.add("wrong");
      qFeedback.textContent = "Quase! " + q.note; qFeedback.className = "quiz-feedback no";
    }
    qNext.hidden = false;
    qNext.textContent = qi < QUIZ.length - 1 ? "Próxima palavra →" : "Ver resultado →";
  }
  qNext.addEventListener("click", () => {
    if (qFinished) { qFinished = false; qi = 0; qscore = 0; qScoreEl.textContent = "0 pts"; loadQuestion(); return; }
    if (qi < QUIZ.length - 1) { qi++; loadQuestion(); return; }
    // fim: credita pontos
    const max = QUIZ.length * 10;
    session.points += qscore;
    session.quizDone += 1;
    saveSession(session);
    qWord.textContent = `Você fez ${qscore}/${max} pts`;
    qOptions.innerHTML = "";
    qFeedback.className = "quiz-feedback ok";
    qFeedback.textContent = qscore === max ? "Perfeito, amiguinho. O Freud tremia."
      : qscore >= max * 0.6 ? "Bom nível! Já dá pra discutir de igual pra igual."
      : "Bora ler mais — a estante te espera.";
    qProgress.textContent = "Desafio concluído · pontos creditados";
    qNext.textContent = "Jogar de novo ↻";
    qFinished = true;
    showToast(`+${qscore} pontos creditados! 🎉`);
    renderProfile(); renderBoard();
  });
  loadQuestion();

  /* ============================================================
     TROCA DE VIEWS
     ============================================================ */
  const sidebar = $("#sidebar");
  function closeSidebar() { sidebar.classList.remove("open"); $("#sideToggle").classList.remove("open"); $("#sideScrim").classList.remove("show"); }
  function showView(name) {
    $$(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === name));
    $$(".side-link").forEach((l) => l.classList.toggle("is-active", l.dataset.view === name));
    window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
    closeSidebar();
    reobserveReveals();
  }
  $$("[data-view]").forEach((el) => {
    if (el.classList.contains("view")) return;
    el.addEventListener("click", () => showView(el.dataset.view));
  });

  /* ============================================================
     AVATAR (upload de foto)
     ============================================================ */
  const avatarInput = $("#avatarInput");
  $$(".avatar").forEach((av) => av.addEventListener("click", () => avatarInput.click()));
  avatarInput.addEventListener("change", () => {
    const file = avatarInput.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { showToast("Imagem muito grande (máx. 3MB)"); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      session.avatar = e.target.result;
      saveSession(session);
      applyAvatar(session.avatar);
      showToast("Foto de perfil atualizada 📸");
    };
    reader.readAsDataURL(file);
  });

  /* ---------- salvar nome ---------- */
  $("#saveName").addEventListener("click", () => {
    const v = $("#nameInput").value.trim();
    if (v.length < 2) { showToast("Coloca um nome de verdade 🙂"); return; }
    session.name = v; saveSession(session);
    renderProfile(); renderBoard();
    showToast("Nome salvo!");
  });

  /* ---------- logout com confirmação ---------- */
  const logoutConfirm = $("#logoutConfirm");
  function openLogoutConfirm() {
    logoutConfirm.classList.add("open");
    logoutConfirm.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeLogoutConfirm() {
    logoutConfirm.classList.remove("open");
    logoutConfirm.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  // a seta "Sair da conta" E a logo (voltar ao site) pedem confirmação
  $("#logout").addEventListener("click", openLogoutConfirm);
  const sideBrand = $(".side-brand");
  if (sideBrand) sideBrand.addEventListener("click", (e) => { e.preventDefault(); openLogoutConfirm(); });
  $$("[data-confirm-cancel]").forEach((el) => el.addEventListener("click", closeLogoutConfirm));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && logoutConfirm.classList.contains("open")) closeLogoutConfirm(); });
  let leavingAccount = false;
  $("#logoutConfirmYes").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = "Saindo…";
    leavingAccount = true; // libera a saída (não re-prende o "voltar")
    try { await CDA.auth.logout(); } catch (err) {}
    window.location.href = "../inicio/index.html";
  });

  /* ============================================================
     INTERCEPTA O BOTÃO "VOLTAR" (←) DO NAVEGADOR
     Sem isso, o back do Chrome sairia da conta direto. Aqui a
     gente "prende" o voltar e mostra o pop-up de confirmação.
     ============================================================ */
  (function guardBrowserBack() {
    // adiciona um estado-âncora: o 1º "voltar" cai aqui e não sai da página
    history.pushState({ cda: "guard" }, "", location.href);
    window.addEventListener("popstate", function () {
      if (leavingAccount) return;                 // saída já confirmada
      history.pushState({ cda: "guard" }, "", location.href); // re-prende
      if (!logoutConfirm.classList.contains("open")) openLogoutConfirm();
    });
  })();

  /* ============================================================
     MENU MOBILE
     ============================================================ */
  $("#sideToggle").addEventListener("click", () => {
    const open = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", open);
    $("#sideToggle").classList.toggle("open", open);
    $("#sideScrim").classList.toggle("show", open);
  });
  $("#sideScrim").addEventListener("click", closeSidebar);

  /* ============================================================
     MAGNÉTICO + REVEAL + TOAST
     ============================================================ */
  const toast = $("#toast"); let toastTimer;
  function showToast(msg) { toast.textContent = msg; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 3000); }

  if (finePointer && !prefersReduced) {
    $$("[data-magnetic]").forEach((el) => {
      el.addEventListener("mousemove", (e) => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * .35}px,${(e.clientY - (r.top + r.height / 2)) * .35}px)`; });
      el.addEventListener("mouseleave", () => (el.style.transform = ""));
    });
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.1 });
  function reobserveReveals() { $$(".view.is-active .reveal:not(.in)").forEach((el) => io.observe(el)); }

  /* ============================================================
     INIT
     ============================================================ */
  renderProfile();
  renderReading();
  renderShelf();
  renderAlexandria();
  renderRecs();
  renderBoard();
  reobserveReveals();

  // data amigável no topo
  const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  $("#topDate").textContent = dias[new Date().getDay()] + " · leitura do dia";

})();
