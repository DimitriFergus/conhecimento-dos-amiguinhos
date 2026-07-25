/* ============================================================
   CONHECIMENTO DOS AMIGUINHOS — interações (vanilla JS)
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  /* rede de segurança: se QUALQUER erro acontecer, o conteúdo
     nunca fica preso invisível (revela todos os .reveal). */
  function revealAll() {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
    const h = document.querySelector(".hero-title");
    if (h) h.classList.add("in");
  }
  window.addEventListener("error", revealAll);

  /* ---------- Toast ---------- */
  const toast = $("#toast");
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }

  /* ============================================================
     0. TEMA (claro/escuro)
     ============================================================ */
  (function themeSetup() {
    const tt = document.getElementById("themeToggle");
    const root = document.documentElement;
    function sync() { if (tt) tt.textContent = root.getAttribute("data-theme") === "dark" ? "☀" : "☾"; }
    sync();
    if (tt) tt.addEventListener("click", () => {
      const dark = root.getAttribute("data-theme") === "dark";
      if (dark) { root.removeAttribute("data-theme"); localStorage.setItem("cda_theme", "light"); }
      else { root.setAttribute("data-theme", "dark"); localStorage.setItem("cda_theme", "dark"); }
      sync();
    });
  })();

  /* ============================================================
     1. BOTÕES MAGNÉTICOS
     ============================================================ */
  if (finePointer && !prefersReduced) {
    $$("[data-magnetic]").forEach((el) => {
      const strength = 0.35;
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  }

  /* ============================================================
     3. NAV: scroll state + menu mobile + smooth scroll
     ============================================================ */
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const burger = $("#burger");
  const mobileMenu = $("#mobileMenu");
  function toggleMenu(force) {
    const open = force !== undefined ? force : !mobileMenu.classList.contains("open");
    mobileMenu.classList.toggle("open", open);
    burger.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
    mobileMenu.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = open ? "hidden" : "";
  }
  burger.addEventListener("click", () => toggleMenu());
  $$("#mobileMenu a").forEach((a) => a.addEventListener("click", () => toggleMenu(false)));

  // smooth scroll com compensação da nav fixa
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id === "#" || id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      toggleMenu(false);
      const y = target.getBoundingClientRect().top + window.scrollY - 74;
      window.scrollTo({ top: y, behavior: prefersReduced ? "auto" : "smooth" });
    });
  });

  /* ============================================================
     4. REVEAL ON SCROLL (IntersectionObserver)
     ============================================================ */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  $$(".reveal").forEach((el) => io.observe(el));

  // Hero: revela as linhas do título assim que carrega
  const heroTitle = $(".hero-title");
  requestAnimationFrame(() => {
    setTimeout(() => heroTitle.classList.add("in"), 180);
  });

  /* ============================================================
     5. CONTADORES ANIMADOS
     ============================================================ */
  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || "";
    const dur = 1600;
    let start;
    function tick(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.floor(eased * target).toLocaleString("pt-BR") + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target.toLocaleString("pt-BR") + suffix;
    }
    requestAnimationFrame(tick);
  }
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        countIO.unobserve(entry.target);
      }
    });
  }, { threshold: 0.6 });
  $$(".stat-num").forEach((el) => countIO.observe(el));

  /* ============================================================
     6. BIBLIOTECA — dados + render + filtro
     ============================================================ */
  const BOOKS = [
    { t: "Duna", a: "Frank Herbert", c: "ficcao", cat: "Ficção científica", isbn: "9780441013593" },
    { t: "Fundação", a: "Isaac Asimov", c: "ficcao", cat: "Ficção científica", isbn: "9780553293357" },
    { t: "1984", a: "George Orwell", c: "ficcao", cat: "Ficção científica", isbn: "9780451524935" },
    { t: "Neuromancer", a: "William Gibson", c: "ficcao", cat: "Ficção científica", isbn: "9780441569595" },
    { t: "Hábitos Atômicos", a: "James Clear", c: "autoajuda", cat: "Auto-ajuda", isbn: "9780735211292" },
    { t: "O Poder do Agora", a: "Eckhart Tolle", c: "autoajuda", cat: "Auto-ajuda", isbn: "9781577314806" },
    { t: "Mindset", a: "Carol Dweck", c: "autoajuda", cat: "Auto-ajuda", isbn: "9780345472328" },
    { t: "Assim Falou Zaratustra", a: "F. Nietzsche", c: "filosofia", cat: "Filosofia", isbn: "9780140441185" },
    { t: "O Mal-Estar na Civilização", a: "Sigmund Freud", c: "filosofia", cat: "Filosofia", isbn: "9780393301588" },
    { t: "Meditações", a: "Marco Aurélio", c: "filosofia", cat: "Filosofia", isbn: "9780140449334" },
    { t: "A República", a: "Platão", c: "filosofia", cat: "Filosofia", isbn: "9780140455113" },
    { t: "Sapiens", a: "Yuval N. Harari", c: "historia", cat: "História", isbn: "9780062316097" },
    { t: "A Era dos Extremos", a: "Eric Hobsbawm", c: "historia", cat: "História", isbn: "9780349106717" },
    { t: "Armas, Germes e Aço", a: "Jared Diamond", c: "historia", cat: "História", isbn: "9780393317558" },
    { t: "Dom Casmurro", a: "Machado de Assis", c: "literatura", cat: "Literatura", isbn: "9780195106817" },
    { t: "Grande Sertão: Veredas", a: "Guimarães Rosa", c: "literatura", cat: "Literatura", isbn: "9780394724782" },
    { t: "Crime e Castigo", a: "F. Dostoiévski", c: "literatura", cat: "Literatura", isbn: "9780140449136" },
    { t: "Cem Anos de Solidão", a: "G. García Márquez", c: "literatura", cat: "Literatura", isbn: "9780060883287" },
    { t: "O Homem que Calculava", a: "Malba Tahan", c: "matematica", cat: "Matemática", isbn: "9780393309348" },
    { t: "Alex no País dos Números", a: "Alex Bellos", c: "matematica", cat: "Matemática", isbn: "9781408809594" },
    { t: "Uma História da Matemática", a: "Carl B. Boyer", c: "matematica", cat: "Matemática", isbn: "9780471543978" },
  ];

  const coverURL = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  const booksEl = $("#books");
  const emptyEl = $("#booksEmpty");

  // adiciona um livro à estante da conta logada (via banco de dados)
  // se não estiver logado, convida a criar conta.
  function addToEstante(book) {
    if (window.CDA && CDA.auth.isLoggedIn()) {
      CDA.data.addToShelf(book.t);
      showToast(`"${book.t}" foi para a sua estante 📚`);
    } else {
      showToast("Crie sua conta grátis para salvar na estante 📚");
      setTimeout(() => openModal("cadastro"), 700);
    }
  }

  function renderBooks(filter) {
    const list = filter === "all" ? BOOKS : BOOKS.filter((b) => b.c === filter);
    booksEl.innerHTML = "";
    emptyEl.hidden = list.length !== 0;
    list.forEach((b, i) => {
      const card = document.createElement("article");
      card.className = "book-card card-enter";
      card.style.animationDelay = Math.min(i * 40, 400) + "ms";
      card.innerHTML = `
        <div class="book-cover cov-${b.c}">
          <img class="cover-img" src="${coverURL(b.isbn)}" alt="Capa de ${b.t}" loading="lazy" onerror="this.remove()" />
          <span class="cover-cat">${b.cat}</span>
          <span class="cover-title">${b.t}</span>
          <span class="cover-author">${b.a}</span>
        </div>
        <div class="book-info">
          <button class="book-tag" data-tag="${b.c}">#${b.cat}</button>
          <div class="book-dl">
            <span>Baixar PDF</span>
            <span>↓</span>
          </div>
        </div>`;
      card.querySelector(".book-dl").addEventListener("click", () => {
        addToEstante(b);
      });
      card.querySelector(".book-tag").addEventListener("click", (e) => {
        e.stopPropagation();
        setFilter(b.c);
      });
      booksEl.appendChild(card);
    });
  }

  const filterBtns = $$(".filter");
  function setFilter(filter) {
    filterBtns.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.filter === filter));
    renderBooks(filter);
    const activeBtn = filterBtns.find((b) => b.dataset.filter === filter);
    if (activeBtn) activeBtn.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }
  filterBtns.forEach((btn) => btn.addEventListener("click", () => setFilter(btn.dataset.filter)));
  renderBooks("all");

  /* ============================================================
     7. RANKING
     ============================================================ */
  const RANK = [
    { n: "Bruna Camargo", h: "Filosofia · 14 livros", p: 2380, cor: "var(--vermelho)" },
    { n: "Téo Andrade", h: "Ficção científica · 12 livros", p: 2115, cor: "var(--verde)" },
    { n: "Lia Fontes", h: "Literatura · 11 livros", p: 1960, cor: "var(--ink)" },
    { n: "Rafa Nunes", h: "História · 9 livros", p: 1740, cor: "#2b3a67" },
    { n: "Duda Prado", h: "Matemática · 8 livros", p: 1605, cor: "var(--vermelho-esc)" },
    { n: "Ícaro Melo", h: "Auto-ajuda · 7 livros", p: 1490, cor: "var(--amarelo)" },
  ];
  const board = $("#board");
  RANK.forEach((u, i) => {
    const initials = u.n.split(" ").map((w) => w[0]).slice(0, 2).join("");
    const li = document.createElement("li");
    li.className = "board-row";
    li.innerHTML = `
      <span class="board-rank">${String(i + 1).padStart(2, "0")}</span>
      <span class="board-user">
        <span class="board-ava" style="background:${u.cor};${u.cor === "var(--amarelo)" ? "color:var(--ink)" : ""}">${initials}</span>
        <span class="board-name"><strong>${u.n}</strong><small>${u.h}</small></span>
      </span>
      <span class="board-pts">${u.p.toLocaleString("pt-BR")}<small>pontos</small></span>`;
    board.appendChild(li);
  });

  /* ============================================================
     9. FAQ — animação suave de altura
     ============================================================ */
  $$(".acc-item").forEach((item) => {
    const body = $(".acc-body", item);
    const summary = $("summary", item);
    summary.addEventListener("click", (e) => {
      e.preventDefault();
      const isOpen = item.hasAttribute("open");
      if (isOpen) {
        body.style.height = body.scrollHeight + "px";
        requestAnimationFrame(() => (body.style.height = "0px"));
        body.addEventListener("transitionend", function done() {
          item.removeAttribute("open");
          body.style.height = "";
          body.removeEventListener("transitionend", done);
        });
      } else {
        item.setAttribute("open", "");
        body.style.height = "0px";
        requestAnimationFrame(() => (body.style.height = body.scrollHeight + "px"));
        body.addEventListener("transitionend", function done() {
          body.style.height = "";
          body.removeEventListener("transitionend", done);
        });
      }
    });
  });
  // css helper para animar altura
  $$(".acc-body").forEach((b) => (b.style.transition = "height .4s cubic-bezier(0.16,1,0.3,1)"));

  /* ============================================================
     10. MODAL (login / cadastro)
     ============================================================ */
  const modal = $("#modal");
  const authForm = $("#authForm");
  const modalTitle = $("#modalTitle");
  const modalSub = $("#modalSub");
  const authSubmit = $("#authSubmit");
  const switchTxt = $("#switchTxt");
  const switchMode = $("#switchMode");
  const nomeField = $('.field[data-field="nome"]');
  const emailField = $('.field[data-field="email"]');
  let mode = "login";
  let lastFocused = null;

  function setMode(m) {
    mode = m;
    const isLogin = m === "login";
    modalTitle.textContent = isLogin ? "Entrar no clube" : "Criar sua conta";
    modalSub.textContent = isLogin ? "Bem-vindo de volta, amiguinho." : "Leva 30 segundos. E é de graça, pra sempre.";
    authSubmit.textContent = isLogin ? "Entrar" : "Criar conta grátis";
    switchTxt.textContent = isLogin ? "Ainda não é amiguinho?" : "Já tem conta?";
    switchMode.textContent = isLogin ? "Criar conta" : "Entrar";
    // Login: pede Nome + Senha. Cadastro: pede Nome + E-mail + Senha.
    nomeField.hidden = false;
    nomeField.querySelector("input").required = true;
    emailField.hidden = isLogin;
    emailField.querySelector("input").required = !isLogin;
    const hint = $("#nomeHint");
    if (hint) hint.textContent = "";
  }

  // Checagem do nome em tempo real (só no cadastro): valida e vê se já existe.
  const nomeInput = nomeField.querySelector("input");
  let nameCheckTimer;
  nomeInput.addEventListener("input", () => {
    const hint = $("#nomeHint");
    if (!hint || mode !== "cadastro" || !window.CDA) { if (hint) hint.textContent = ""; return; }
    const v = nomeInput.value.trim();
    clearTimeout(nameCheckTimer);
    if (!v) { hint.textContent = ""; hint.className = "field-hint"; return; }
    nameCheckTimer = setTimeout(async () => {
      hint.textContent = "verificando…"; hint.className = "field-hint";
      const r = await CDA.auth.nameAvailable(v);
      if (nomeInput.value.trim() !== v) return; // o campo mudou enquanto verificava
      hint.textContent = r.ok ? "✓ Nome disponível" : "✕ " + r.error;
      hint.className = "field-hint " + (r.ok ? "ok" : "no");
      nomeInput.classList.toggle("err", !r.ok);
    }, 400);
  });

  /* ---------- painel de verificação de e-mail ---------- */
  const verifyPanel = $("#verifyPanel");
  function showVerify(email) {
    authForm.hidden = true;
    verifyPanel.hidden = false;
    modalTitle.style.display = "none";
    modalSub.style.display = "none";
    const em = $("#verifyEmail"); if (em) em.textContent = email || "seu e-mail";
  }
  function showForm() {
    verifyPanel.hidden = true;
    authForm.hidden = false;
    modalTitle.style.display = "";
    modalSub.style.display = "";
  }

  function openModal(m) {
    showForm();
    setMode(m);
    lastFocused = document.activeElement;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => { const el = authForm.querySelector("input:not([hidden])"); if (el) el.focus(); }, 60);
  }
  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    authForm.reset();
    showForm();
    $$(".field input", authForm).forEach((i) => i.classList.remove("err"));
    if (lastFocused) lastFocused.focus();
  }

  $$("[data-open-modal]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openModal(btn.dataset.openModal);
    })
  );
  $$("[data-close-modal]").forEach((el) => el.addEventListener("click", closeModal));
  switchMode.addEventListener("click", () => setMode(mode === "login" ? "cadastro" : "login"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
  });

  let authBusy = false;
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (authBusy) return;

    let valid = true;
    const fields = $$(".field:not([hidden]) input", authForm);
    fields.forEach((input) => {
      const ok = input.checkValidity();
      input.classList.toggle("err", !ok);
      if (!ok) valid = false;
    });
    if (!valid) { showToast("Confere os campos, amiguinho 👀"); return; }

    if (!window.CDA) { showToast("Banco de dados indisponível. Recarregue a página."); return; }

    const nome = authForm.nome.value.trim();
    const email = authForm.email.value.trim();
    const senha = authForm.senha.value;

    authBusy = true;
    const originalLabel = authSubmit.textContent;
    authSubmit.textContent = mode === "login" ? "Entrando…" : "Criando conta…";
    authSubmit.disabled = true;

    let res;
    if (mode === "cadastro") {
      res = await CDA.auth.register({ name: nome, email, password: senha });
    } else {
      // login APENAS por NOME + senha
      res = await CDA.auth.login({ name: nome, password: senha });
    }

    authBusy = false;
    authSubmit.disabled = false;
    authSubmit.textContent = originalLabel;

    if (!res.ok) {
      authForm.querySelector('input[name="senha"]').classList.add("err");
      showToast(res.error || "Não foi possível continuar.");
      return;
    }

    // conta nova OU login com e-mail ainda não confirmado → pede verificação
    if (res.needsVerification) {
      showToast(mode === "cadastro" ? "Conta criada! Confirme seu e-mail 📧" : "Falta confirmar seu e-mail 📧");
      showVerify(res.user.email);
      return;
    }

    showToast("Bem-vindo de volta! 📖");
    setTimeout(() => { window.location.href = "../painel/dashboard.html"; }, 700);
  });

  /* ---------- botões do painel de verificação ---------- */
  $("#verifyDone").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; const t = btn.textContent; btn.textContent = "Conferindo…";
    const verified = await CDA.auth.reloadVerified();
    btn.disabled = false; btn.textContent = t;
    if (verified) {
      showToast("E-mail confirmado! Entrando… ✅");
      setTimeout(() => { window.location.href = "../painel/dashboard.html"; }, 600);
    } else {
      showToast("Ainda não confirmado. Abra o link no seu e-mail (veja o spam também).");
    }
  });
  $("#verifyResend").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    const r = await CDA.auth.resendVerification();
    btn.disabled = false;
    showToast(r.ok ? "E-mail reenviado 📨" : (r.error || "Não consegui reenviar agora."));
  });
  $("#verifyBack").addEventListener("click", () => {
    CDA.auth.logout();
    showForm();
    setMode("login");
  });

  /* ---------- estado de login (assíncrono via Firebase) ---------- */
  if (window.CDA && CDA.boot) {
    CDA.boot((user) => {
      if (!user) return;
      if (user.emailVerified) {
        // logado e verificado: os botões "Entrar/Criar conta" viram atalho pro painel
        $$("[data-open-modal]").forEach((btn) => {
          btn.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); window.location.href = "../painel/dashboard.html"; }, true);
        });
      } else {
        // logado mas SEM confirmar o e-mail: botões abrem o painel de verificação
        $$("[data-open-modal]").forEach((btn) => {
          btn.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); openModal("login"); showVerify(user.email); }, true);
        });
        const params = new URLSearchParams(location.search);
        if (params.get("verify") === "1") { openModal("login"); showVerify(user.email); }
      }
    });
  }

})();
