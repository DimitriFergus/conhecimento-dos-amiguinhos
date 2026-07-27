/* ============================================================
   CÓDICE — Project Gutenberg via Gutendex (window.GB)
   Clássicos em PORTUGUÊS, texto integral e domínio público.
   Leitura dentro do site pelo HTML do Gutenberg (iframe).
   API: https://gutendex.com  (tem CORS)
   ============================================================ */
(function () {
  "use strict";

  var BASE = "https://gutendex.com/books/";

  // URL de leitura (HTML do próprio Gutenberg) a partir do id.
  function readUrl(gid) {
    return "https://www.gutenberg.org/ebooks/" + gid + ".html.images";
  }

  // Pega a capa (imagem) que o próprio livro tem no Gutenberg.
  function coverOf(formats) {
    for (var k in formats) {
      if (k.indexOf("image/") === 0) return formats[k];
    }
    return "";
  }
  function hasReadable(formats) {
    for (var k in formats) {
      if (k.indexOf("text/html") === 0) return true;
    }
    return false;
  }

  // Normaliza um livro da Gutendex para o formato do app.
  function norm(b) {
    var au = (b.authors && b.authors[0]) || null;
    var year = au && au.death_year ? au.death_year : (au && au.birth_year ? au.birth_year : null);
    return {
      t: b.title || "Sem título",
      a: au ? au.name : "Autor desconhecido",
      gid: b.id,                       // id do Gutenberg (permite LER)
      cover: coverOf(b.formats || {}), // capa = o próprio livro
      year: year,
      downloads: b.download_count || 0,
    };
  }

  // Busca. Sem query = os mais lidos (a Gutendex já ordena por popularidade).
  // Resolve com { total, books }.
  function search(query, opts) {
    opts = opts || {};
    var page = opts.page || 1;
    var url = BASE + "?languages=pt&page=" + page;
    if (query && query.trim()) url += "&search=" + encodeURIComponent(query.trim());

    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 12000) : null;

    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        if (timer) clearTimeout(timer);
        var results = (d && d.results) || [];
        // só livros realmente legíveis (com HTML)
        var books = results.filter(function (b) { return hasReadable(b.formats || {}); }).map(norm);
        return { total: (d && d.count) || 0, books: books };
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      });
  }

  window.GB = { search: search, norm: norm, readUrl: readUrl, BASE: BASE };
})();
