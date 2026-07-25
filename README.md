# Códice 📚

Clube do livro gratuito — site estático com **cadastro/login por conta**, **biblioteca de PDFs**, **leitor com medição de progresso**, **desafios de vocabulário**, **ranking** e **recomendações**.

## 🌐 Site ao vivo
Publicado via **GitHub Pages** (link na aba _Settings → Pages_ do repositório).

## 🗂️ Estrutura
```
index.html                → ponto de entrada (redireciona para a página inicial)
assets/
  css/   → style.css, dashboard.css, reader.css
  js/    → db.js (banco + login), home.js, dashboard.js, reader.js, booksdata.js
  data/  → PDF embutido (Noites Brancas)
paginas/
  inicio/index.html        → página inicial
  painel/dashboard.html    → área do usuário (estante, desafios, ranking, perfil)
  leitor/reader.html       → leitor de PDF com pontos por leitura
```

## 🔐 Contas
Cada visitante cria sua própria conta (nome + e-mail + senha no cadastro; entra com **nome + senha**). Os dados ficam no navegador do usuário (`localStorage`), com **senhas protegidas por hash PBKDF2-SHA256**. Contas novas começam zeradas, com toda a Biblioteca de Alexandria disponível.

> Observação: por ser um site estático, o "banco" é local ao navegador. Para contas compartilhadas entre dispositivos, o próximo passo é um backend reaproveitando a mesma API (`CDA.auth` / `CDA.data`).

## 🛠️ Tecnologias
HTML, CSS e JavaScript puro (sem frameworks). Fontes via Google Fonts, capas via OpenLibrary, leitor via PDF.js.
