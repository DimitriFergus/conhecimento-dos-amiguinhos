/* ============================================================
   CÓDICE — Dashboard
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

  /* ---------- Catálogo e classes (compartilhado: catalog.js) ---------- */
  const CATALOG = window.CDA_CATALOG || {};
  const CAT_CLASS = window.CDA_CAT_CLASS || {};
  const initials = (t) => t.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  /* ---------- Registro de metadados de livros ----------
     Além do catálogo curado (catalog.js, com ISBN e sinopse), guardamos
     em localStorage os livros vindos da Open Library que o usuário
     encontrar/adicionar. Assim a estante, o leitor e as recomendações
     conseguem mostrar capa + autor mesmo de livros que não são do acervo. */
  const BOOKMETA_KEY = "cda_bookmeta";
  function readBookMeta() { try { return JSON.parse(LS.getItem(BOOKMETA_KEY)) || {}; } catch (e) { return {}; } }
  function cacheBookMeta(title, m) {
    if (!title || CATALOG[title]) return; // acervo curado tem prioridade
    const all = readBookMeta();
    all[title] = Object.assign({}, all[title], m);
    try { LS.setItem(BOOKMETA_KEY, JSON.stringify(all)); } catch (e) {}
  }
  /* Lookup unificado: catálogo curado > cache da Open Library > genérico. */
  function bookMeta(title) {
    if (CATALOG[title]) return Object.assign({ t: title }, CATALOG[title]);
    const m = readBookMeta()[title];
    if (m) return { t: title, a: m.a || "Autor desconhecido", c: m.c || "literatura", cat: m.cat || "Open Library", isbn: m.isbn || "", cover: m.cover || "", ol: true };
    return { t: title, a: "Autor", c: "literatura", cat: "Literatura", isbn: "" };
  }

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
    return shelf.map((t) => ({ progress: Math.round(getHist(t).progress || 0), ...bookMeta(t) }));
  }
  let estante = loadEstante();

  const slug = (t) => encodeURIComponent(t);
  const readerLink = (t) => {
    let u = `../leitor/reader.html?book=${slug(t)}`;
    const m = bookMeta(t);
    if (m && m.ia) u += `&ia=${encodeURIComponent(m.ia)}`; // livro da Open Library: lê via Internet Archive
    return u;
  };
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
      { n: "Bruna Camargo", h: "Filosofia · 14 livros", p: 2380, cor: "var(--vermelho)", bio: "Nietzsche me quebrou e me reconstruiu.", favs: ["Assim Falou Zaratustra", "O Mal-Estar na Civilização", "Meditações"] },
      { n: "Téo Andrade", h: "Ficção científica · 12 livros", p: 2115, cor: "var(--verde)", bio: "Vivo em Arrakis, só volto pra comer.", favs: ["Duna", "Fundação", "Neuromancer"] },
      { n: "Lia Fontes", h: "Literatura · 11 livros", p: 1960, cor: "var(--ink)", bio: "Capitu traiu sim. Me processa.", favs: ["Dom Casmurro", "Crime e Castigo", "Cem Anos de Solidão"] },
      { n: "Rafa Nunes", h: "História · 9 livros", p: 1740, cor: "#2b3a67", bio: "Entender o passado pra não repetir.", favs: ["Sapiens", "Armas, Germes e Aço", "A Era dos Extremos"] },
      { n: "Duda Prado", h: "Matemática · 8 livros", p: 1605, cor: "var(--vermelho-esc)", bio: "Os números contam histórias.", favs: ["O Homem que Calculava", "Alex no País dos Números", "Uma História da Matemática"] },
      { n: "Ícaro Melo", h: "Auto-ajuda · 7 livros", p: 1490, cor: "var(--amarelo)", bio: "1% melhor todo santo dia.", favs: ["Hábitos Atômicos", "Mindset", "O Poder do Agora"] },
    ];
    const mm = CDA.data.meta() || {};
    const me = { n: session.name, h: `${estante.length} livros na estante`, p: session.points, cor: "var(--vermelho)", me: true, bio: mm.bio || "", favs: CDA.data.favorites() };
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

    // ---- cartão de perfil (social) ----
    const meta = CDA.data.meta() || {};
    const bio = meta.bio || "";
    const bg = meta.bgColor || "var(--ink)";
    setText("#pcName", session.name);
    setText("#pcLvl", "LVL " + level);
    setText("#pcBio", bio || "Sem bio ainda.");
    const bn = $("#pcBanner"); if (bn) bn.style.background = bg;
    const badge = $("#pcBadge"); if (badge) badge.classList.toggle("off", !meta.emailVerified);

    // ---- stats ----
    const pages = estimatePagesRead();
    setText("#pLvl", level);
    setText("#pPts", session.points.toLocaleString("pt-BR"));
    setText("#pBooks", estante.length);
    setText("#pPages", pages.toLocaleString("pt-BR"));
    setText("#pRank", "#" + rank);

    // ---- editor (bio + swatches) ----
    if (bioInput && document.activeElement !== bioInput) { bioInput.value = bio; const c = $("#bioCount"); if (c) c.textContent = bio.length + "/160"; }
    renderSwatches(meta.bgColor || null);

    renderFavorites();
    renderAchievements();
    renderQuotes();
    renderAvatarPop();
  }

  function setText(sel, v) { const el = $(sel); if (el) el.textContent = v; }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])); }

  /* páginas lidas (estimativa: progresso × páginas do livro) */
  function estimatePagesRead() {
    const h = CDA.data.history();
    let total = 0;
    Object.keys(h).forEach((t) => {
      const pages = (DATA[t] && DATA[t].pages) || 200;
      total += (Math.min(100, h[t].progress || 0) / 100) * pages;
    });
    return Math.round(total);
  }

  /* cores de fundo do perfil */
  const BG_COLORS = ["#17130d", "#e8452a", "#2c4b3c", "#2b3a67", "#c5351d", "#7a4b8c", "#1f6f6b", "#b5860b"];
  function renderSwatches(current) {
    const wrap = $("#colorSwatches"); if (!wrap) return;
    if (!current) current = "#17130d";
    wrap.innerHTML = BG_COLORS.map((c) => `<button class="swatch ${c === current ? "is-active" : ""}" style="background:${c}" data-color="${c}" aria-label="cor ${c}"></button>`).join("");
    $$(".swatch", wrap).forEach((sw) => sw.addEventListener("click", () => {
      $$(".swatch", wrap).forEach((x) => x.classList.toggle("is-active", x === sw));
      const bn = $("#pcBanner"); if (bn) bn.style.background = sw.dataset.color; // preview
    }));
  }

  /* livros favoritos */
  function renderFavorites() {
    const grid = $("#favGrid"); if (!grid) return;
    const favs = CDA.data.favorites();
    if (!favs.length) { grid.innerHTML = `<p class="fav-empty">Você ainda não favoritou nenhum livro. Abra um livro e toque no ♥.</p>`; return; }
    grid.innerHTML = favs.map((t) => {
      const b = { t, ...(CATALOG[t] || { a: "", c: "literatura", cat: "", isbn: "" }) };
      return `<article class="fav-card" data-title="${t}"><div class="shelf-cover cov-${b.c}">${coverInner(b, false)}</div><div class="fav-name">${escapeHtml(t)}</div></article>`;
    }).join("");
    $$(".fav-card", grid).forEach((c) => c.addEventListener("click", () => openBookInfo(c.dataset.title)));
  }

  /* conquistas */
  const ACHIEVEMENTS = window.CDA_ACHIEVEMENTS || [];
  function computeStats() {
    const h = CDA.data.history();
    const started = Object.keys(h).filter((t) => (h[t].progress || 0) > 0);
    const finished = Object.keys(h).filter((t) => (h[t].progress || 0) >= 95);
    const cat = {};
    started.forEach((t) => { const c = (CATALOG[t] || {}).c; if (c) cat[c] = (cat[c] || 0) + 1; });
    return { started: started.length, finished: finished.length, shelf: estante.length, points: session.points, quiz: session.quizDone, pages: estimatePagesRead(), favs: CDA.data.favorites().length, cat: cat };
  }
  function renderAchievements() {
    const grid = $("#achvGrid"); if (!grid) return;
    const s = computeStats();
    let unlocked = 0;
    grid.innerHTML = ACHIEVEMENTS.map((a) => {
      const ok = a.f(s); if (ok) unlocked++;
      return `<div class="achv ${ok ? "unlocked" : "locked"}"><span class="achv-ico">${a.ic}</span><span class="achv-txt"><strong>${a.t}</strong><small>${a.d}</small></span></div>`;
    }).join("");
    const c = $("#achvCount"); if (c) c.textContent = unlocked + " de " + ACHIEVEMENTS.length + " desbloqueadas";
  }

  /* frases favoritas */
  function renderQuotes() {
    const list = $("#quotesList"); if (!list) return;
    const qs = CDA.data.quotes();
    if (!qs.length) { list.innerHTML = `<p class="quotes-empty">Nenhuma frase ainda. Adicione trechos que você amou.</p>`; return; }
    list.innerHTML = qs.map((q) => `<div class="quote"><button class="quote-del" data-ts="${q.ts}" aria-label="Remover">×</button><p>“${escapeHtml(q.text)}”</p>${q.book ? `<small>${escapeHtml(q.book)}</small>` : ""}</div>`).join("");
    $$(".quote-del", list).forEach((b) => b.addEventListener("click", () => { CDA.data.removeQuote(Number(b.dataset.ts)); renderQuotes(); }));
  }

  /* popover do avatar (bio rápida + favoritos) */
  function renderAvatarPop() {
    setText("#apName", session.name);
    const apBio = $("#apBio"); if (apBio) apBio.textContent = (CDA.data.meta().bio) || "Sem bio ainda.";
    const apFavs = $("#apFavs"); if (!apFavs) return;
    const favs = CDA.data.favorites().slice(0, 5);
    if (!favs.length) { apFavs.innerHTML = `<span class="ap-empty">Nenhum ainda</span>`; return; }
    apFavs.innerHTML = favs.map((t) => {
      const b = CATALOG[t] || { c: "literatura", isbn: "" };
      const img = b.isbn ? `<img src="${coverURL(b.isbn)}" alt="" loading="lazy" onerror="this.remove()">` : "";
      return `<span class="ap-fav cov-${b.c}">${img}${t[0]}</span>`;
    }).join("");
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
    const src = b.isbn ? coverURL(b.isbn) : (b.cover || "");
    const img = src ? `<img src="${src}" alt="Capa de ${b.t}" loading="lazy" onerror="this.remove()">` : "";
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
     RENDER: Biblioteca de Alexandria — UM acervo só.
     Junta o catálogo curado do clube (catalog.js) + os livros
     famosos e LEGÍVEIS da Open Library (domínio público, cada um
     com item no Internet Archive). Sem divisões: tudo num grid.
     A capa de cada livro da OL é a imagem do PRÓPRIO item lido,
     então a capa sempre bate com o que abre no leitor.
     ============================================================ */
  const CATALOG_LIST = Object.keys(CATALOG).map((t) => ({ t, ...CATALOG[t] }));
  let alexFilter = "all";
  let alexSearch = "";
  const normTxt = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Estado da Open Library (acumula resultados para paginar).
  let olBooks = [];
  let olPage = 1, olTotal = 0, olLoading = false, olToken = 0, olTimer = null;
  const OL_PER = 24;
  // Categoria -> termo de busca (só livros públicos e legíveis entram).
  const OL_TERM = {
    all: "", ficcao: "ficção científica", autoajuda: "autoajuda",
    filosofia: "filosofia", historia: "história", literatura: "romance clássico",
    matematica: "matemática",
  };

  function inEstante(t) { return (readShelf() || []).includes(t); }

  // Monta o HTML de UM card. Serve para o acervo curado e para a Open Library.
  function alexCardHTML(b, i) {
    const added = inEstante(b.t);
    const t = escapeHtml(b.t), a = escapeHtml(b.a || "");
    const catLabel = escapeHtml(b.cat || CAT_NAME[b.c] || "Livro");
    const src = b.isbn ? coverURL(b.isbn) : (b.cover || "");
    const img = src ? `<img class="cover-img" src="${src}" alt="Capa de ${t}" loading="lazy" onerror="this.remove()" />` : "";
    const tagOrYear = b.ol
      ? `<span class="book-year">${b.year ? b.year : "clássico"}</span>`
      : `<button class="book-tag" data-tag="${b.c}">#${catLabel}</button>`;
    return `
      <article class="book-card card-enter" data-title="${t}" style="animation-delay:${Math.min(i * 22, 280)}ms">
        <div class="book-cover cov-${b.c}">
          ${img}
          <span class="cover-cat">${catLabel}</span>
          <span class="cover-title">${t}</span>
          <span class="cover-author">${a}</span>
        </div>
        <div class="book-info">
          <div class="book-meta">
            <strong class="book-title">${t}</strong>
            <small class="book-author">${a}</small>
          </div>
          ${tagOrYear}
          <button class="alex-add ${added ? "is-added" : ""}" data-title="${t}">
            <span class="lbl-in">${added ? "✓ Na estante" : "+ Adicionar à estante"}</span>
            <span class="lbl-out">✕ Tirar da estante</span>
          </button>
        </div>
      </article>`;
  }

  // Liga os eventos de clique dos cards já injetados no grid.
  function wireAlexCards(grid) {
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

  function setAlexStatus(msg) {
    const el = $("#alexStatus"); if (!el) return;
    el.hidden = !msg; el.textContent = msg || "";
  }

  // Livros curados que casam com o filtro/busca atuais.
  function curatedMatches() {
    const q = normTxt(alexSearch);
    return CATALOG_LIST.filter((b) => {
      if (alexFilter !== "all" && b.c !== alexFilter) return false;
      if (q && !(normTxt(b.t).includes(q) || normTxt(b.a).includes(q))) return false;
      return true;
    });
  }

  // Render puro do acervo unificado (curado + OL já buscados). NÃO busca.
  function renderAlexandria() {
    const grid = $("#alexGrid");
    if (!grid) return;
    const curated = curatedMatches();
    const seen = new Set(curated.map((b) => normTxt(b.t)));
    const olShown = olBooks.filter((b) => !seen.has(normTxt(b.t))); // evita duplicar
    const all = curated.concat(olShown);

    const empty = $("#alexEmpty"); if (empty) empty.hidden = all.length !== 0 || olLoading;
    grid.innerHTML = all.map((b, i) => alexCardHTML(b, i)).join("");
    wireAlexCards(grid);

    const more = $("#alexMore");
    if (more) {
      const hasMore = olBooks.length < olTotal;
      more.hidden = !hasMore || olLoading;
      more.textContent = olLoading ? "Carregando…" : "Carregar mais livros";
      more.disabled = olLoading;
    }
    if (olLoading) setAlexStatus(all.length ? `${all.length} livros · carregando mais…` : "Carregando o acervo…");
    else if (all.length) setAlexStatus(`${all.length} livros no acervo`);
    else setAlexStatus("");
  }

  /* ---- Open Library: busca famosos + legíveis (nova ou próxima página) ---- */
  function fetchOL(reset) {
    if (!window.OL) { renderAlexandria(); return; }
    if (reset) { olBooks = []; olPage = 1; olTotal = 0; }
    // Só livros públicos (leem de graça). Sem busca = os mais lidos.
    const base = alexSearch.trim() ? alexSearch.trim() : (OL_TERM[alexFilter] || "");
    const query = (base ? base + " " : "") + "ebook_access:public";
    const cat = alexFilter === "all" ? "literatura" : alexFilter;
    const token = ++olToken;
    olLoading = true;
    renderAlexandria();
    window.OL.search(query, { limit: OL_PER, page: olPage, sort: alexSearch.trim() ? undefined : "readinglog" })
      .then((res) => {
        if (token !== olToken) return; // resposta velha: ignora
        olTotal = res.total;
        res.books.forEach((b) => {
          if (!b.ia) return;                 // sem item = não dá pra ler: fora
          if (CATALOG[b.t]) return;          // já é do acervo curado
          b.c = cat;
          b.cat = CAT_NAME[cat] || "Clássico";
          b.ol = true;
          // guarda metadados p/ estante + LEITOR (ia) mostrarem/abrirem certo
          cacheBookMeta(b.t, { a: b.a, c: b.c, cat: b.cat, cover: b.cover, year: b.year, ia: b.ia });
          olBooks.push(b);
        });
        olLoading = false;
        renderAlexandria();
      })
      .catch(() => {
        if (token !== olToken) return;
        olLoading = false;
        renderAlexandria();
        if (!olBooks.length && !curatedMatches().length) setAlexStatus("Erro ao carregar livros. Verifique a conexão e tente de novo.");
      });
  }

  // Busca com atraso (debounce) enquanto o usuário digita.
  function scheduleOL() {
    renderAlexandria();               // mostra os curados na hora
    if (olTimer) clearTimeout(olTimer);
    olTimer = setTimeout(() => fetchOL(true), 350);
  }

  function setAlexFilter(f) {
    alexFilter = f;
    $$("#alexFilters .filter").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.filter === f));
    fetchOL(true);
  }

  $$("#alexFilters .filter").forEach((btn) => btn.addEventListener("click", () => setAlexFilter(btn.dataset.filter)));
  const alexMoreBtn = $("#alexMore");
  if (alexMoreBtn) alexMoreBtn.addEventListener("click", () => { olPage += 1; fetchOL(false); });
  const alexSearchInput = $("#alexSearch");
  if (alexSearchInput) alexSearchInput.addEventListener("input", () => {
    alexSearch = alexSearchInput.value;
    scheduleOL();
  });

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
    const cat = bookMeta(title);
    const meta = readBookMeta()[title] || {};
    const info = DATA[title] || {
      syn: cat.ol ? "Clássico disponível para leitura gratuita, direto aqui no leitor do clube." : "Sinopse em breve.",
      why: "", themes: [], pages: null, year: meta.year || null, dif: ""
    };
    const h = getHist(title);
    const added = inEstante(title);
    const readable = !!(window.CDA_PDF && window.CDA_PDF[title]) || !!(cat && cat.ia);

    $("#bmCat").textContent = cat.cat || CAT_NAME[cat.c] || "";
    $("#bmTitle").textContent = title;
    $("#bmAuthor").textContent = cat.a;
    $("#bmCover").className = "bookmodal-cover cov-" + cat.c;
    $("#bmCover").innerHTML = coverInner({ t: title, a: cat.a, c: cat.c, cat: cat.cat, isbn: cat.isbn, cover: cat.cover }, false);

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
    const isFav = CDA.data.isFavorite(title);
    acts.push(`<button class="btn btn-solid" data-bm-read>${readable ? readLabel : "Abrir no leitor →"}</button>`);
    acts.push(added
      ? `<button class="btn btn-line" data-bm-remove>✕ Tirar da estante</button>`
      : `<button class="btn btn-line" data-bm-add>+ Adicionar à estante</button>`);
    acts.push(`<button class="btn btn-line bm-fav ${isFav ? "is-fav" : ""}" data-bm-fav>${isFav ? "♥ Favorito" : "♡ Favoritar"}</button>`);
    $("#bmActions").innerHTML = acts.join("");

    const actEl = $("#bmActions");
    const readBtn = actEl.querySelector("[data-bm-read]");
    if (readBtn) readBtn.addEventListener("click", () => openReader(title));
    const addBtn = actEl.querySelector("[data-bm-add]");
    if (addBtn) addBtn.addEventListener("click", () => { addToEstante(title); openBookInfo(title); });
    const remBtn = actEl.querySelector("[data-bm-remove]");
    if (remBtn) remBtn.addEventListener("click", () => { removeFromEstante(title); openBookInfo(title); });
    const favBtn = actEl.querySelector("[data-bm-fav]");
    if (favBtn) favBtn.addEventListener("click", () => {
      CDA.data.toggleFavorite(title);
      renderProfile();
      showToast(CDA.data.isFavorite(title) ? `"${title}" nos favoritos ♥` : `"${title}" saiu dos favoritos`);
      openBookInfo(title);
    });

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
  function popCover(title) {
    const b = bookMeta(title);
    const src = b.isbn ? coverURL(b.isbn) : (b.cover || "");
    const img = src ? `<img src="${src}" alt="" loading="lazy" onerror="this.remove()">` : "";
    return `<span class="rp-book cov-${b.c}">${img}${escapeHtml((title || "?")[0])}</span>`;
  }
  function renderBoard() {
    const board = $("#board");
    board.innerHTML = buildRank().map((u, i) => {
      const isAmarelo = u.cor === "var(--amarelo)";
      const lvl = Math.floor((u.p || 0) / 500) + 1;
      const photo = u.me && session.avatar;
      const avStyle = photo ? `style="background-image:url(${session.avatar})"` : `style="background:${u.cor};${isAmarelo ? "color:var(--ink)" : ""}"`;
      const rpAvStyle = photo ? `style="background-image:url(${session.avatar})"` : `style="background:${u.cor};${isAmarelo ? "color:var(--ink)" : ""}"`;
      const books = (u.favs || []).slice(0, 3).map(popCover).join("") || `<span class="rp-empty">sem favoritos ainda</span>`;
      return `
      <li class="board-row ${u.me ? "is-me" : ""}">
        <span class="board-rank">${String(i + 1).padStart(2, "0")}</span>
        <span class="board-user">
          <span class="board-ava ${photo ? "has-photo" : ""}" ${avStyle}>${photo ? "" : initials(u.n)}</span>
          <span class="board-name"><strong>${escapeHtml(u.n)}${u.me ? " (você)" : ""}</strong><small>${escapeHtml(u.h)}</small></span>
        </span>
        <span class="board-pts">${u.p.toLocaleString("pt-BR")}<small>pontos</small></span>
        <div class="rank-pop" aria-hidden="true">
          <div class="rp-banner" style="background:${isAmarelo ? "#b5860b" : u.cor}"></div>
          <div class="rp-body">
            <span class="rp-avatar ${photo ? "has-photo" : ""}" ${rpAvStyle}>${photo ? "" : initials(u.n)}</span>
            <div class="rp-name-row"><strong>${escapeHtml(u.n)}</strong><span class="rp-badge">✓</span><span class="rp-lvl">LVL ${lvl}</span></div>
            <p class="rp-bio">${u.bio ? escapeHtml(u.bio) : "Sem bio ainda."}</p>
            <div class="rp-books">${books}</div>
          </div>
        </div>
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
    if (name === "comunidade") renderCommunity();
  }

  /* ---------- Comunidade (diretório de perfis públicos) ---------- */
  async function renderCommunity() {
    const grid = $("#communityGrid"), empty = $("#communityEmpty");
    if (!grid) return;
    grid.innerHTML = `<p class="community-loading">Carregando leitores…</p>`;
    if (empty) empty.hidden = true;
    const list = await CDA.listProfiles(60);
    if (!list.length) { grid.innerHTML = ""; if (empty) empty.hidden = false; return; }
    grid.innerHTML = list.map((p) => {
      const inits = initials(p.name || "?");
      const reading = (p.reading || [])[0];
      const av = p.avatar ? `style="background-image:url(${p.avatar})"` : "";
      return `<a class="community-card" href="../perfil/index.html?u=${encodeURIComponent(p.nameKey || p.uid)}">
        <span class="cc-avatar ${p.avatar ? "has-photo" : ""}" ${av}>${p.avatar ? "" : inits}</span>
        <span class="cc-info">
          <strong>${escapeHtml(p.name || "Leitor")}</strong>
          <small>LVL ${p.level || 1} · ${(p.points || 0).toLocaleString("pt-BR")} pts</small>
          ${reading ? `<span class="cc-reading">📖 ${escapeHtml(reading.t)} · ${reading.p}%</span>` : `<span class="cc-reading cc-idle">escolhendo um livro…</span>`}
        </span>
      </a>`;
    }).join("");
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
    if (!/^image\//.test(file.type)) { showToast("Selecione uma imagem."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // redimensiona/comprime para 256x256 (leve o bastante p/ o Firestore)
        const S = 256;
        const canvas = document.createElement("canvas");
        canvas.width = S; canvas.height = S;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(S / img.width, S / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        session.avatar = canvas.toDataURL("image/jpeg", 0.82);
        saveSession(session);
        applyAvatar(session.avatar);
        renderProfile();
        showToast("Foto de perfil atualizada 📸");
      };
      img.onerror = () => showToast("Não consegui abrir essa imagem.");
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  /* ---------- personalizar perfil (bio + cor) ---------- */
  const bioInput = $("#bioInput");
  if (bioInput) bioInput.addEventListener("input", () => { const c = $("#bioCount"); if (c) c.textContent = bioInput.value.length + "/160"; });
  const saveProfileBtn = $("#saveProfile");
  if (saveProfileBtn) saveProfileBtn.addEventListener("click", () => {
    const bio = bioInput ? bioInput.value : "";
    const active = $("#colorSwatches .swatch.is-active");
    const bg = active ? active.dataset.color : null;
    CDA.data.setMeta({ bio: bio, bgColor: bg });
    renderProfile();
    showToast("Perfil atualizado ✅");
  });

  /* ---------- frases favoritas ---------- */
  const quoteAddBtn = $("#quoteAdd"), quoteText = $("#quoteText");
  function addQuoteNow() {
    const v = quoteText.value.trim();
    if (!v) { showToast("Escreva uma frase primeiro."); return; }
    CDA.data.addQuote(v);
    quoteText.value = "";
    renderQuotes();
    showToast("Frase salva ✍️");
  }
  if (quoteAddBtn) quoteAddBtn.addEventListener("click", addQuoteNow);
  if (quoteText) quoteText.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addQuoteNow(); } });

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
  fetchOL(true);        // acervo unificado: curado + Open Library (famosos e legíveis)
  renderRecs();
  renderBoard();
  reobserveReveals();

  // garante que o PERFIL PÚBLICO exista/atualize ao entrar
  if (CDA.syncNow) CDA.syncNow();

  /* ---------- compartilhar meu perfil público ---------- */
  (function setupShare() {
    const meta = CDA.data.meta(); if (!meta) return;
    const rel = "../perfil/index.html?u=" + encodeURIComponent(meta.nameKey || meta.id);
    let abs = rel; try { abs = new URL(rel, location.href).href; } catch (e) {}
    const link = $("#viewPublicProfile"); if (link) link.href = rel;
    const copy = $("#copyProfileLink");
    if (copy) copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(abs); showToast("Link do seu perfil copiado 🔗"); }
      catch (e) { showToast("Seu link: " + abs); }
    });
  })();

  // data amigável no topo
  const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  $("#topDate").textContent = dias[new Date().getDay()] + " · leitura do dia";

})();
