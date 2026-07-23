/* ============================================================
   LEITOR DE PDF — Conhecimento dos Amiguinhos
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
  async function renderPage(num) {
    const page = await pdfDoc.getPage(num);
    const base = page.getViewport({ scale: 1 });
    const maxW = Math.min(pagesEl.clientWidth || 840, 840);
    const cssScale = maxW / base.width;
    const viewport = page.getViewport({ scale: cssScale * dpr });

    const wrap = document.createElement("div");
    wrap.className = "rd-page-wrap";
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = "100%";
    const tag = document.createElement("span");
    tag.className = "rd-page-num";
    tag.textContent = num;
    wrap.appendChild(canvas);
    wrap.appendChild(tag);
    pagesEl.appendChild(wrap);

    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  }

  async function renderPDF(source) {
    emptyEl.hidden = true;
    pagesEl.innerHTML = "";
    try {
      // guarda a fonte para o botão de download
      if (source && source.data) currentBytes = source.data;
      else if (typeof source === "string") currentUrl = source;

      pdfDoc = await pdfjsLib.getDocument(source).promise;
      for (let n = 1; n <= pdfDoc.numPages; n++) await renderPage(n);

      downloadBtn.hidden = false;
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
     INÍCIO — decide a fonte do PDF
     ============================================================ */
  function resolveSource() {
    // 1) PDF embutido (base64) — funciona offline / file://
    if (bookTitle && window.CDA_PDF && window.CDA_PDF[bookTitle]) {
      return { data: base64ToBytes(window.CDA_PDF[bookTitle]) };
    }
    // 2) por parâmetro ?src=
    if (srcParam) return srcParam;
    // 3) por URL cadastrada
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

  if (!pdfjsLib) {
    emptyEl.hidden = false;
    showToast("Leitor indisponível (falha ao carregar o motor de PDF).");
  } else {
    const source = resolveSource();
    if (source) renderPDF(source);
    else emptyEl.hidden = false;
  }

})();
