/* ============================================================
   CÓDICE — Open Library API (window.OL)
   Busca de livros em pt-BR para a Biblioteca de Alexandria.
   Só metadados + capas (uso público da API). Sem chave.
   Docs: https://openlibrary.org/developers/api
   ============================================================ */
(function () {
  "use strict";

  var BASE = "https://openlibrary.org/search.json";
  // Campos mínimos = resposta leve e rápida.
  var FIELDS = "key,title,author_name,cover_i,first_publish_year,ebook_access,ia,language,edition_count";

  // Capa a partir do cover_i. size: S | M | L.
  function cover(id, size) {
    if (!id) return "";
    return "https://covers.openlibrary.org/b/id/" + id + "-" + (size || "M") + ".jpg";
  }

  // Normaliza um "doc" da Open Library para o formato do app.
  function norm(doc) {
    return {
      t: doc.title || "Sem título",
      a: (doc.author_name && doc.author_name[0]) || "Autor desconhecido",
      cover: cover(doc.cover_i, "M"),
      coverId: doc.cover_i || null,
      year: doc.first_publish_year || null,
      key: doc.key || null,             // ex.: /works/OL123W
      access: doc.ebook_access || null, // public | borrowable | printdisabled | no_ebook
      ia: (doc.ia && doc.ia[0]) || null,
      editions: doc.edition_count || 0,
    };
  }

  // Busca genérica. Resolve com { total, books }.
  // opts: { lang='por', limit=24, page=1, sort }
  function search(query, opts) {
    opts = opts || {};
    var lang = opts.lang || "por";
    var limit = opts.limit || 24;
    var page = opts.page || 1;
    var url = BASE +
      "?q=" + encodeURIComponent(query) +
      "&language=" + encodeURIComponent(lang) +
      "&limit=" + limit +
      "&page=" + page +
      "&fields=" + FIELDS;
    if (opts.sort) url += "&sort=" + encodeURIComponent(opts.sort);

    // Timeout defensivo (rede lenta não deixa a UI travada).
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 12000) : null;

    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        if (timer) clearTimeout(timer);
        var docs = (d && d.docs) || [];
        // Só o que tem capa fica bonito na grade; sem capa vai pro fim.
        var books = docs.map(norm);
        books.sort(function (x, y) { return (y.coverId ? 1 : 0) - (x.coverId ? 1 : 0); });
        return { total: (d && d.numFound) || 0, books: books };
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      });
  }

  window.OL = { cover: cover, norm: norm, search: search, BASE: BASE };
})();
