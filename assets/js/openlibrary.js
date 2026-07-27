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

  // Capa a partir do cover_i (Open Library). size: S | M | L.
  function cover(id, size) {
    if (!id) return "";
    return "https://covers.openlibrary.org/b/id/" + id + "-" + (size || "M") + ".jpg";
  }

  // Capa a partir do PRÓPRIO item do Internet Archive. Garante que a
  // capa exibida seja exatamente o livro que será aberto no leitor.
  function iaCover(ia) {
    if (!ia) return "";
    return "https://archive.org/services/img/" + encodeURIComponent(ia);
  }

  // URL do leitor embutível do Internet Archive (iframe).
  function embed(ia) {
    if (!ia) return "";
    return "https://archive.org/embed/" + encodeURIComponent(ia);
  }

  // Normaliza um "doc" da Open Library para o formato do app.
  // ia = identificador do Internet Archive (é o que permite LER o livro).
  function norm(doc) {
    var ia = (doc.ia && doc.ia[0]) || null;
    return {
      t: doc.title || "Sem título",
      a: (doc.author_name && doc.author_name[0]) || "Autor desconhecido",
      ia: ia,
      cover: ia ? iaCover(ia) : cover(doc.cover_i, "M"), // capa = o próprio item lido
      coverId: doc.cover_i || null,
      year: doc.first_publish_year || null,
      key: doc.key || null,             // ex.: /works/OL123W
      access: doc.ebook_access || null, // public | borrowable | printdisabled | no_ebook
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
        // Só entram livros REALMENTE legíveis: com item do Internet Archive.
        // Assim todo card do acervo pode ser aberto no leitor.
        var books = docs.map(norm).filter(function (b) { return !!b.ia; });
        return { total: (d && d.numFound) || 0, books: books };
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      });
  }

  window.OL = { cover: cover, iaCover: iaCover, embed: embed, norm: norm, search: search, BASE: BASE };
})();
