/* ============================================================
   LEITOR DE PDF — Códice
   Lê o PDF dentro do site, mede a % pelo scroll e dá
   +10 pontos a cada 10% concluído (uma vez por marco).
   ============================================================ */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const LS = window.localStorage;

  /* ---------- Guarda de sessão: precisa estar logado ---------- */
  if (!window.CDA || !CDA.auth.isLoggedIn()) { window.location.href = "../inicio/index.html"; return; }

  // impede o navegador de restaurar o scroll sozinho — nós cuidamos disso (marcador)
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

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

  /* ============================================================
     ⬇️  PDFs POR URL (opcional)  ⬇️
     PDFs embutidos localmente vêm de window.CDA_PDF (base64).
     Para vincular um livro por link https, adicione aqui:
       "Título do Livro": "https://.../arquivo.pdf"
     ============================================================ */
  const PDF_LIBRARY = {};

  // Fontes-padrão do PDF.js hospedadas no próprio site (para os PDFs do acervo
  // renderizarem com a tipografia certa, sem depender de nada externo).
  // URL ABSOLUTA: o motor do PDF.js roda num worker e não resolveria um
  // caminho relativo a partir da página.
  const STD_FONTS = new URL("../../assets/pdfjs-standard-fonts/", location.href).href;
  // Pasta dos PDFs locais do acervo (LIVROS/ na raiz do site).
  const LIVROS_DIR = "../../LIVROS/";

  /* ---------- parâmetros da URL ---------- */
  const params = new URLSearchParams(location.search);
  const bookTitle = (params.get("book") || "").trim();
  const srcParam = (params.get("src") || "").trim();

  /* ---------- elementos ---------- */
  const pagesEl = $("#rdPages");
  const titleEl = $("#rdTitle");
  const topPagesLbl = $("#rdPageInfo");
  const pctEl = $("#rdPct");
  const fillEl = $("#rdFill");
  const ptsWrap = $("#rdPts");
  const ptsNum = $("#rdPtsNum");
  const emptyEl = $("#rdEmpty");
  const fileInput = $("#fileInput");
  const downloadBtn = $("#downloadBtn");

  /* ---------- toast ---------- */
  const toast = $("#toast"); let toastTimer;
  function showToast(m) { toast.textContent = m; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2800); }

  /* ---------- PDF.js ---------- */
  const pdfjsLib = window["pdfjsLib"];
  if (pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  let pdfDoc = null;
  let maxPct = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let currentBytes = null;   // Uint8Array quando vem de arquivo/base64
  let currentUrl = null;     // string quando vem de URL

  titleEl.textContent = bookTitle || "Leitor";

  /* ============================================================
     SESSÃO E PONTOS — da conta logada (banco de dados)
     ============================================================ */
  function loadSession() { const m = CDA.data.meta(); return { name: m.name, email: m.email, points: m.points || 0, avatar: m.avatar || null }; }
  const session = loadSession();

  /* ============================================================
     HISTÓRICO DE LEITURA (por conta) — via banco de dados.
     Progresso, pontos concedidos e marcador ficam aqui e NUNCA
     somem ao tirar/recolocar o livro na estante (anti-farm).
     ============================================================ */
  function getHist(t) { return CDA.data.hist(t); }
  function setHist(t, patch) { CDA.data.setHist(t, patch); }

  const hist0 = getHist(bookTitle);
  maxPct = Math.round(hist0.progress || 0);
  let awardedMilestone = hist0.awarded || 0; // 0,10,20,...,100

  function saveEntry(progress, awarded) {
    if (!bookTitle) return;
    const cur = getHist(bookTitle);
    const patch = { progress: Math.max(cur.progress || 0, Math.round(progress)) };
    if (awarded != null) patch.awarded = Math.max(cur.awarded || 0, awarded);
    setHist(bookTitle, patch);
  }

  /* ---------- marcador de leitura (bookmark automático) ---------- */
  function loadBookmark() { return Math.round(getHist(bookTitle).bookmark || 0); }
  function saveBookmark(pct) { if (bookTitle) setHist(bookTitle, { bookmark: Math.round(pct) }); }

  function refreshPointsBadge() {
    if (!bookTitle) return;
    ptsWrap.hidden = false;
    ptsNum.textContent = session.points.toLocaleString("pt-BR");
  }

  /* concede +10 pontos por cada novo marco de 10% atingido */
  function awardPoints(pct) {
    const milestone = Math.min(100, Math.floor(pct / 10) * 10);
    if (milestone > awardedMilestone) {
      const gained = milestone - awardedMilestone; // 10 pts por 10%
      awardedMilestone = milestone;
      CDA.data.addPoints(gained);               // credita na conta logada
      session.points = CDA.data.meta().points;  // reflete o total atualizado
      saveEntry(Math.round(maxPct), awardedMilestone);
      refreshPointsBadge();
      pulsePoints(gained, milestone);
    }
  }
  function pulsePoints(gained, milestone) {
    showToast(`🎉 Você ganhou ${gained} pontos! (${milestone}% do livro concluído)`);
    ptsWrap.classList.remove("pop"); void ptsWrap.offsetWidth; ptsWrap.classList.add("pop");
  }

  function paintProgress(pct) {
    const p = Math.round(pct);
    pctEl.textContent = p + "%";
    fillEl.style.width = p + "%";
  }

  /* ============================================================
     SCROLL → PROGRESSO + PONTOS
     ============================================================ */
  let ticking = false;
  function onScroll() {
    if (ticking || !pdfDoc) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const pct = scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 100;
      paintProgress(pct);
      saveBookmark(pct); // marcador: guarda a posição atual
      if (pct > maxPct) { maxPct = pct; saveEntry(Math.round(maxPct), null); awardPoints(maxPct); }
      const cur = Math.min(pdfDoc.numPages, Math.floor((pct / 100) * pdfDoc.numPages) + 1);
      if (topPagesLbl) topPagesLbl.textContent = `pág. ${cur} de ${pdfDoc.numPages}`;
    });
  }

  /* ============================================================
     RENDERIZAÇÃO
     ============================================================ */
  /* ---------- Renderização SOB DEMANDA ----------
     Um romance pode ter centenas de páginas (Os Maias tem 779). Desenhar
     todas de uma vez estoura a memória do navegador e trava a aba. Então
     criamos todas as páginas VAZIAS já com a altura certa (o livro fica
     com o tamanho real na hora) e só desenhamos as que estão perto da
     tela — soltando a memória das que ficaram para trás. */
  let pageObserver = null;
  let placeholderH = 0;
  const visiblePages = new Set();   // páginas que estão perto da tela agora

  function pageWidth() { return Math.min(pagesEl.clientWidth || 840, 840); }

  async function buildPages() {
    const first = await pdfDoc.getPage(1);
    const base = first.getViewport({ scale: 1 });
    placeholderH = Math.round(pageWidth() * (base.height / base.width));

    const frag = document.createDocumentFragment();
    for (let n = 1; n <= pdfDoc.numPages; n++) {
      const wrap = document.createElement("div");
      wrap.className = "rd-page-wrap";
      wrap.dataset.page = String(n);
      wrap.style.height = placeholderH + "px";
      const tag = document.createElement("span");
      tag.className = "rd-page-num";
      tag.textContent = String(n);
      wrap.appendChild(tag);
      frag.appendChild(wrap);
    }
    pagesEl.appendChild(frag);

    if (pageObserver) pageObserver.disconnect();
    pageObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { visiblePages.add(e.target); drawPage(e.target); }
        else { visiblePages.delete(e.target); freePage(e.target); }
      });
    }, { rootMargin: "1200px 0px" });
    Array.prototype.forEach.call(pagesEl.querySelectorAll(".rd-page-wrap"), (w) => pageObserver.observe(w));
  }

  async function drawPage(wrap) {
    if (wrap.dataset.state) return;              // já desenhada (ou desenhando)
    wrap.dataset.state = "drawing";
    try {
      const page = await pdfDoc.getPage(Number(wrap.dataset.page));
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (pageWidth() / base.width) * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      // se o leitor já rolou para longe enquanto desenhava, joga fora
      if (!visiblePages.has(wrap)) { canvas.width = 0; canvas.height = 0; wrap.dataset.state = ""; return; }
      wrap.insertBefore(canvas, wrap.firstChild);
      wrap.style.height = "";                       // a altura passa a vir do canvas
      wrap.dataset.state = "done";
    } catch (e) {
      wrap.dataset.state = "";
    }
  }

  /* solta a memória das páginas que ficaram longe da tela */
  function freePage(wrap) {
    if (wrap.dataset.state !== "done") return;
    const canvas = wrap.querySelector("canvas");
    if (!canvas) return;
    wrap.style.height = (wrap.offsetHeight || placeholderH) + "px"; // trava a altura antes
    canvas.width = 0; canvas.height = 0;                            // libera o buffer
    canvas.remove();
    wrap.dataset.state = "";
  }

  /* confere UMA vez se as fontes-padrão do PDF.js estão no ar */
  let stdFontsCheck = null;
  function stdFontsReachable() {
    if (!stdFontsCheck) {
      stdFontsCheck = fetch(STD_FONTS + "FoxitSerif.pfb", { method: "HEAD" })
        .then((r) => r.ok).catch(() => false);
    }
    return stdFontsCheck;
  }

  async function renderPDF(source) {
    emptyEl.hidden = true;
    pagesEl.innerHTML = "";
    try {
      // guarda a fonte para o botão de download
      if (source && source.data) currentBytes = source.data;
      else if (typeof source === "string") currentUrl = source;

      // As fontes-padrão deixam a tipografia certa, mas se elas não estiverem
      // acessíveis é melhor abrir o livro com a fonte reserva do que não abrir.
      // Por isso conferimos antes de passá-las ao PDF.js.
      const params = (typeof source === "string") ? { url: source } : Object.assign({}, source);
      if (await stdFontsReachable()) params.standardFontDataUrl = STD_FONTS;
      pdfDoc = await pdfjsLib.getDocument(params).promise;
      await buildPages();

      // leitura é só no site: nada de baixar o livro
      downloadBtn.hidden = true;
      if (topPagesLbl) topPagesLbl.textContent = `${pdfDoc.numPages} páginas`;
      window.addEventListener("scroll", onScroll, { passive: true });

      // restaura o marcador de leitura (volta pra onde parou)
      const bm = loadBookmark();
      requestAnimationFrame(() => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        if (bm > 0 && scrollable > 0) window.scrollTo(0, (bm / 100) * scrollable);
        onScroll();
      });
    } catch (err) {
      emptyEl.hidden = false;
      showToast("Não consegui abrir esse PDF.");
      console.error(err);
    }
  }

  /* ---------- base64 → bytes ---------- */
  function base64ToBytes(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  /* ---------- download do PDF atual ---------- */
  downloadBtn.addEventListener("click", () => {
    const name = (bookTitle || "livro").replace(/[^\wÀ-ú -]/g, "") + ".pdf";
    let href;
    if (currentBytes) href = URL.createObjectURL(new Blob([currentBytes], { type: "application/pdf" }));
    else if (currentUrl) href = currentUrl;
    else return;
    const a = document.createElement("a");
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    if (currentBytes) setTimeout(() => URL.revokeObjectURL(href), 4000);
    showToast("Baixando o PDF… 📥");
  });

  /* ---------- abrir arquivo do PC (fallback p/ livros sem PDF) ---------- */
  function openLocalFile(file) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { showToast("Selecione um arquivo PDF."); return; }
    if (!bookTitle) titleEl.textContent = file.name.replace(/\.pdf$/i, "");
    const reader = new FileReader();
    reader.onload = (e) => renderPDF({ data: new Uint8Array(e.target.result) });
    reader.readAsArrayBuffer(file);
  }
  fileInput.addEventListener("change", () => openLocalFile(fileInput.files[0]));
  $("#emptyOpen").addEventListener("click", () => fileInput.click());

  /* ============================================================
     INÍCIO — decide a fonte do livro (SEMPRE um PDF local do site)
     Todo livro do acervo é um PDF em LIVROS/, lido aqui pelo PDF.js.
     Nunca há link ou conteúdo externo.
     ============================================================ */
  function resolveSource() {
    // 1) PDF embutido em base64 (ex.: Noites Brancas) — funciona offline
    if (bookTitle && window.CDA_PDF && window.CDA_PDF[bookTitle]) {
      return { data: base64ToBytes(window.CDA_PDF[bookTitle]) };
    }
    // 2) PDF local do acervo (LIVROS/) via catálogo livros.js
    if (bookTitle && window.CDA_LIVROS && window.CDA_LIVROS[bookTitle]) {
      return LIVROS_DIR + window.CDA_LIVROS[bookTitle].slug + ".pdf";
    }
    // 3) por parâmetro ?src= (uso interno) ou URL cadastrada
    if (srcParam) return srcParam;
    if (bookTitle && PDF_LIBRARY[bookTitle]) return PDF_LIBRARY[bookTitle];
    return null;
  }

  // mostra os pontos atuais NA HORA (sem esperar o PDF renderizar)
  refreshPointsBadge();
  paintProgress(loadBookmark() || maxPct);

  // salvamento de segurança do marcador ao sair/fechar/trocar de aba
  function persistOnLeave() {
    if (!pdfDoc) return;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable > 0) saveBookmark(Math.min(100, (window.scrollY / scrollable) * 100));
  }
  window.addEventListener("pagehide", persistOnLeave);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") persistOnLeave(); });

  const localSource = pdfjsLib ? resolveSource() : null;
  if (localSource) {
    // PDF do acervo, lido no site (com medição de progresso e pontos)
    renderPDF(localSource);
  } else if (!pdfjsLib) {
    emptyEl.hidden = false;
    showToast("Leitor indisponível (falha ao carregar o motor de PDF).");
  } else {
    // sem fonte: estado vazio (abrir PDF do PC)
    emptyEl.hidden = false;
  }

})();
