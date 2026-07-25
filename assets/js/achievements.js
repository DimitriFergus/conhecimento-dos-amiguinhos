/* ============================================================
   CÓDICE — Conquistas (compartilhado: dashboard + perfil público)
   Cada conquista testa um "stats": { started, finished, shelf,
   points, quiz, pages, favs, cat:{categoria:qtd} }.
   ============================================================ */
window.CDA_ACHIEVEMENTS = [
  { ic: "📖", t: "Primeira página", d: "Comece a ler 1 livro", f: function (s) { return s.started >= 1; } },
  { ic: "🏁", t: "Ponto final", d: "Termine 1 livro", f: function (s) { return s.finished >= 1; } },
  { ic: "📚", t: "Estante viva", d: "5 livros na estante", f: function (s) { return s.shelf >= 5; } },
  { ic: "🗃️", t: "Colecionador", d: "10 livros na estante", f: function (s) { return s.shelf >= 10; } },
  { ic: "🐀", t: "Rato de biblioteca", d: "Leia ~500 páginas", f: function (s) { return s.pages >= 500; } },
  { ic: "📄", t: "Mil páginas", d: "Leia ~1000 páginas", f: function (s) { return s.pages >= 1000; } },
  { ic: "🧠", t: "Filósofo", d: "Leia um livro de filosofia", f: function (s) { return (s.cat.filosofia || 0) >= 1; } },
  { ic: "🚀", t: "Sonhador", d: "Leia ficção científica", f: function (s) { return (s.cat.ficcao || 0) >= 1; } },
  { ic: "⏳", t: "Viajante do tempo", d: "Leia um livro de história", f: function (s) { return (s.cat.historia || 0) >= 1; } },
  { ic: "⭐", t: "Curador", d: "Favorite 3 livros", f: function (s) { return s.favs >= 3; } },
  { ic: "✦", t: "Pensador", d: "Complete 1 desafio", f: function (s) { return s.quiz >= 1; } },
  { ic: "🔥", t: "Pontuador", d: "Junte 100 pontos", f: function (s) { return s.points >= 100; } },
  { ic: "💯", t: "Centurião", d: "Leia 100 livros", f: function (s) { return s.started >= 100; } },
];
