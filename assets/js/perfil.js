/* ============================================================
   CÓDICE — Página de perfil público (somente leitura)
   Lê profiles/{uid} via CDA.getPublicProfile e renderiza.
   ============================================================ */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const CAT = window.CDA_CATALOG || {};
  const CATCLASS = window.CDA_CAT_CLASS || {};
  const ACHV = window.CDA_ACHIEVEMENTS || [];
  const coverURL = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;

  /* ---------- Tema ---------- */
  (function themeSetup() {
    const tt = $("#themeToggle"), root = document.documentElement;
    function sync() { if (tt) tt.textContent = root.getAttribute("data-theme") === "dark" ? "☀" : "☾"; }
    sync();
    if (tt) tt.addEventListener("click", () => {
      const dark = root.getAttribute("data-theme") === "dark";
      if (dark) { root.removeAttribute("data-theme"); localStorage.setItem("cda_theme", "light"); }
      else { root.setAttribute("data-theme", "dark"); localStorage.setItem("cda_theme", "dark"); }
      sync();
    });
  })();

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const initials = (t) => String(t || "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  function coverSmall(title) {
    const b = CAT[title] || { c: "literatura", isbn: "" };
    const cls = CATCLASS[b.c] || "cov-literatura";
    const img = b.isbn ? `<img src="${coverURL(b.isbn)}" alt="" loading="lazy" onerror="this.remove()">` : "";
    return `<div class="read-cover ${cls}">${img}<span class="rc-fallback">${esc((title || "?")[0])}</span></div>`;
  }
  function coverFull(title) {
    const b = CAT[title] || { a: "", c: "literatura", cat: "", isbn: "" };
    const img = b.isbn ? `<img class="cover-img" src="${coverURL(b.isbn)}" alt="" loading="lazy" onerror="this.remove()">` : "";
    return `${img}<span class="cover-cat">${esc(b.cat)}</span><span class="cover-title">${esc(title)}</span><span class="cover-author">${esc(b.a)}</span>`;
  }

  function buildStats(p) {
    const st = p.stats || {};
    const stats = { started: st.started || 0, finished: st.finished || 0, shelf: st.shelf || 0, points: p.points || 0, quiz: st.quizDone || 0, pages: st.pages || 0, favs: (p.favorites || []).length, cat: {} };
    (p.reading || []).forEach((r) => { const c = (CAT[r.t] || {}).c; if (c) stats.cat[c] = (stats.cat[c] || 0) + 1; });
    return stats;
  }

  function metric(n, lbl) { return `<div class="pp-metric"><b>${Number(n || 0).toLocaleString("pt-BR")}</b><span>${lbl}</span></div>`; }

  function render(p) {
    $("#ppLoading").hidden = true;
    $("#ppWrap").hidden = false;
    document.title = (p.name || "Perfil") + " — Códice";

    $("#ppBanner").style.background = p.bgColor || "var(--ink)";
    const av = $("#ppAvatar");
    if (p.avatar) { av.style.backgroundImage = `url(${p.avatar})`; av.classList.add("has-photo"); }
    $("#ppInit").textContent = initials(p.name);
    $("#ppName").textContent = p.name || "Leitor";
    $("#ppLvl").textContent = "LVL " + (p.level || 1);
    $("#ppBio").textContent = p.bio || "Sem bio.";

    const st = p.stats || {};
    $("#ppMetrics").innerHTML = [
      metric(p.points, "pontos"), metric(st.pages, "páginas"),
      metric(st.shelf, "na estante"), metric(st.finished, "terminados"),
    ].join("");

    // lendo agora
    const reading = p.reading || [];
    $("#ppReading").innerHTML = reading.length ? reading.map((x) => {
      const b = CAT[x.t] || { a: "", cat: "" };
      return `<article class="read-item read-item-static">${coverSmall(x.t)}<div class="read-info"><strong>${esc(x.t)}</strong><small>${esc(b.a)}${b.cat ? " · " + esc(b.cat) : ""}</small><div class="read-prog"><span style="width:${x.p}%"></span></div></div><div><span class="read-pct">${x.p}%</span></div></article>`;
    }).join("") : `<p class="fav-empty">Ainda não começou nenhum livro.</p>`;

    // favoritos
    const favs = p.favorites || [];
    $("#ppFavs").innerHTML = favs.length ? favs.map((t) =>
      `<article class="fav-card"><div class="shelf-cover ${CATCLASS[(CAT[t] || {}).c] || "cov-literatura"}">${coverFull(t)}</div><div class="fav-name">${esc(t)}</div></article>`
    ).join("") : `<p class="fav-empty">Nenhum livro favorito ainda.</p>`;

    // conquistas
    const s = buildStats(p);
    let unlocked = 0;
    $("#ppAchv").innerHTML = ACHV.map((a) => { const ok = a.f(s); if (ok) unlocked++; return `<div class="achv ${ok ? "unlocked" : "locked"}"><span class="achv-ico">${a.ic}</span><span class="achv-txt"><strong>${a.t}</strong><small>${a.d}</small></span></div>`; }).join("");
    $("#ppAchvCount").textContent = unlocked + " de " + ACHV.length + " desbloqueadas";

    // frases
    const q = p.quotes || [];
    $("#ppQuotes").innerHTML = q.length ? q.map((x) => `<div class="quote"><p>“${esc(x.text)}”</p>${x.book ? `<small>${esc(x.book)}</small>` : ""}</div>`).join("") : `<p class="quotes-empty">Nenhuma frase compartilhada ainda.</p>`;
  }

  function notFound() {
    $("#ppLoading").hidden = true;
    $("#ppNotFound").hidden = false;
  }

  /* ---------- início ---------- */
  const u = new URLSearchParams(location.search).get("u");
  if (!u || !window.CDA || !CDA.getPublicProfile) { notFound(); return; }
  CDA.getPublicProfile(u).then((p) => { if (p) render(p); else notFound(); }).catch(notFound);
})();
