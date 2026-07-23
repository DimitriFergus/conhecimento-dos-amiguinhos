/* ============================================================
   CONHECIMENTO DOS AMIGUINHOS — Banco de dados + Autenticação
   ------------------------------------------------------------
   Camada de dados client-side (localStorage) estruturada e
   segura para um site estático:
     • cada conta tem seus próprios dados isolados;
     • senhas NUNCA são guardadas em texto puro — são derivadas
       com PBKDF2-SHA256 (100k iterações + salt aleatório por
       usuário), via Web Crypto, com fallback SHA-256;
     • contas novas nascem zeradas (0 pontos, estante vazia);
     • a Biblioteca de Alexandria é global (catálogo), então
       está disponível para todas as contas.

   Observação honesta: por ser um site estático (file://), o
   "banco" mora no navegador do usuário. Isso é robusto e seguro
   para este contexto, mas NÃO substitui um servidor real — para
   contas compartilhadas entre dispositivos, o próximo passo é
   um backend (Node + SQLite/Postgres) reaproveitando esta mesma
   API (CDA.auth / CDA.data).
   ============================================================ */
(function () {
  "use strict";

  var DB_KEY = "cda_db_v1";
  var SESSION_KEY = "cda_active_session";
  var PBKDF2_ITERATIONS = 100000;

  /* ============================================================
     Utilidades de baixo nível
     ============================================================ */
  function nowISO() { return new Date().toISOString(); }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "u_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }
  function randomBytes(n) {
    var a = new Uint8Array(n);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); });
    return a;
  }
  function bufToB64(buf) {
    var bytes = new Uint8Array(buf), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /* comparação de tempo constante (evita timing attacks bobos) */
  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  /* ============================================================
     SHA-256 puro (fallback caso Web Crypto não exista)
     Implementação compacta de domínio público.
     ============================================================ */
  function sha256Hex(ascii) {
    function rr(n, x) { return (x >>> n) | (x << (32 - n)); }
    var K = [], H = [], maxWord = Math.pow(2, 32), i, j, result = "";
    var words = [], asciiBitLength = ascii.length * 8;
    var hash = sha256Hex.h = sha256Hex.h || [];
    var k = sha256Hex.k = sha256Hex.k || [];
    var primeCounter = k.length, isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return "";
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oldHash = H;
      H = H.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = H[0], e = H[4];
        var temp1 = H[7] + (rr(6, e) ^ rr(11, e) ^ rr(25, e)) + ((e & H[5]) ^ (~e & H[6])) + k[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(7, w15) ^ rr(18, w15) ^ (w15 >>> 3)) + w[i - 7] + (rr(17, w2) ^ rr(19, w2) ^ (w2 >>> 10))) | 0);
        var temp2 = (rr(2, a) ^ rr(13, a) ^ rr(22, a)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]));
        H = [(temp1 + temp2) | 0].concat(H);
        H[4] = (H[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++)
      for (j = 3; j + 1; j--) {
        var b = (H[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : "") + b.toString(16);
      }
    return result;
  }

  /* ============================================================
     Derivação de senha
     ============================================================ */
  var subtle = (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null;

  async function derivePBKDF2(password, saltBytes, iterations) {
    var enc = new TextEncoder();
    var keyMaterial = await subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
    var bits = await subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: iterations, hash: "SHA-256" }, keyMaterial, 256);
    return bufToB64(bits);
  }
  function deriveFallback(password, saltB64, iterations) {
    // PBKDF2 caseiro simplificado sobre o SHA-256 puro
    var acc = saltB64 + ":" + password;
    for (var i = 0; i < Math.min(iterations, 20000); i++) acc = sha256Hex(acc + i);
    return acc;
  }

  async function hashPassword(password) {
    var salt = randomBytes(16);
    var saltB64 = bufToB64(salt.buffer);
    if (subtle) {
      var hash = await derivePBKDF2(password, salt, PBKDF2_ITERATIONS);
      return { algo: "PBKDF2-SHA256", salt: saltB64, iterations: PBKDF2_ITERATIONS, hash: hash };
    }
    return { algo: "SHA256-FALLBACK", salt: saltB64, iterations: 20000, hash: deriveFallback(password, saltB64, 20000) };
  }
  async function verifyPassword(password, passObj) {
    if (!passObj) return false;
    if (passObj.algo === "PBKDF2-SHA256" && subtle) {
      var hash = await derivePBKDF2(password, b64ToBytes(passObj.salt), passObj.iterations || PBKDF2_ITERATIONS);
      return safeEqual(hash, passObj.hash);
    }
    return safeEqual(deriveFallback(password, passObj.salt, passObj.iterations || 20000), passObj.hash);
  }

  /* ============================================================
     Persistência do "banco"
     ============================================================ */
  function loadDB() {
    var db = null;
    try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) {}
    if (!db || typeof db !== "object") db = { version: 1, users: {}, emailIndex: {} };
    if (!db.users) db.users = {};
    if (!db.emailIndex) db.emailIndex = {};
    return db;
  }
  function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

  function normEmail(email) { return String(email || "").trim().toLowerCase(); }
  function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

  function blankData() {
    // conta nova nasce ZERADA (a Biblioteca de Alexandria é global)
    return { points: 0, quizDone: 0, avatar: null, shelf: [], history: {} };
  }

  /* ============================================================
     Sessão
     ============================================================ */
  function setSession(userId) { localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: userId, since: nowISO() })); }
  function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  function currentUserId() { var s = getSession(); return s && s.userId ? s.userId : null; }
  function currentUser() {
    var id = currentUserId(); if (!id) return null;
    var db = loadDB(); return db.users[id] || null;
  }

  /* ============================================================
     API pública — AUTENTICAÇÃO
     ============================================================ */
  async function register(input) {
    var name = String(input.name || "").trim();
    var email = normEmail(input.email);
    var password = String(input.password || "");

    if (name.length < 2) return { ok: false, error: "Coloque seu nome (mín. 2 letras)." };
    if (!validEmail(email)) return { ok: false, error: "E-mail inválido." };
    if (password.length < 6) return { ok: false, error: "A senha precisa de pelo menos 6 caracteres." };

    var db = loadDB();
    if (db.emailIndex[email]) return { ok: false, error: "Já existe uma conta com esse e-mail." };

    var pass = await hashPassword(password);
    var id = uid();
    db.users[id] = { id: id, name: name, email: email, pass: pass, createdAt: nowISO(), updatedAt: nowISO(), data: blankData() };
    db.emailIndex[email] = id;
    saveDB(db);
    setSession(id);
    return { ok: true, user: publicUser(db.users[id]) };
  }

  // Login por NOME ou e-mail. Aceita { identifier, password } ou { email, password }.
  async function login(input) {
    var identifier = String(input.identifier != null ? input.identifier : (input.email || "")).trim();
    var password = String(input.password || "");
    if (!identifier) return { ok: false, error: "Informe seu nome." };

    var db = loadDB();
    var candidates = [];

    // 1) por e-mail (se o identificador for um e-mail)
    var asEmail = normEmail(identifier);
    if (db.emailIndex[asEmail] && db.users[db.emailIndex[asEmail]]) candidates.push(db.users[db.emailIndex[asEmail]]);

    // 2) por nome (case-insensitive) — permite entrar só com o nome
    var lname = identifier.toLowerCase();
    Object.keys(db.users).forEach(function (id) {
      var u = db.users[id];
      if (u && u.name && u.name.trim().toLowerCase() === lname && candidates.indexOf(u) < 0) candidates.push(u);
    });

    if (!candidates.length) return { ok: false, error: "Não encontramos uma conta com esse nome." };

    // verifica a senha contra cada candidato (resolve nomes repetidos: entra na conta certa)
    for (var i = 0; i < candidates.length; i++) {
      if (await verifyPassword(password, candidates[i].pass)) {
        setSession(candidates[i].id);
        return { ok: true, user: publicUser(candidates[i]) };
      }
    }
    return { ok: false, error: "Senha incorreta." };
  }

  function logout() { clearSession(); }

  function publicUser(u) { return u ? { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt } : null; }

  /* guarda de rota: se não houver conta válida na sessão, redireciona */
  function guard(redirectTo) {
    if (!currentUser()) { window.location.href = redirectTo; return false; }
    return true;
  }

  /* ============================================================
     API pública — DADOS DO USUÁRIO ATUAL
     Todas operam sobre a conta logada e persistem o banco.
     ============================================================ */
  function mutateUser(fn) {
    var id = currentUserId(); if (!id) return null;
    var db = loadDB(); var u = db.users[id]; if (!u) return null;
    if (!u.data) u.data = blankData();
    fn(u);
    u.updatedAt = nowISO();
    saveDB(db);
    return u;
  }
  function readUser() {
    var u = currentUser(); if (!u) return null;
    if (!u.data) u.data = blankData();
    return u;
  }

  var dataAPI = {
    meta: function () {
      var u = readUser(); if (!u) return null;
      return { id: u.id, name: u.name, email: u.email, avatar: u.data.avatar || null, points: u.data.points || 0, quizDone: u.data.quizDone || 0, createdAt: u.createdAt };
    },
    setMeta: function (patch) {
      return mutateUser(function (u) {
        if (patch.name != null) u.name = String(patch.name).trim() || u.name;
        if (patch.avatar !== undefined) u.data.avatar = patch.avatar;
        if (patch.points != null) u.data.points = Math.max(0, Math.round(patch.points));
        if (patch.quizDone != null) u.data.quizDone = patch.quizDone;
      });
    },
    addPoints: function (n) { return mutateUser(function (u) { u.data.points = Math.max(0, Math.round((u.data.points || 0) + n)); }); },

    shelf: function () { var u = readUser(); return u ? (u.data.shelf || []).slice() : []; },
    setShelf: function (list) { return mutateUser(function (u) { u.data.shelf = Array.isArray(list) ? list.slice() : []; }); },
    inShelf: function (title) { var u = readUser(); return u ? (u.data.shelf || []).indexOf(title) >= 0 : false; },
    addToShelf: function (title) { return mutateUser(function (u) { if ((u.data.shelf || []).indexOf(title) < 0) u.data.shelf.push(title); }); },
    removeFromShelf: function (title) { return mutateUser(function (u) { u.data.shelf = (u.data.shelf || []).filter(function (t) { return t !== title; }); }); },

    history: function () { var u = readUser(); return u ? (u.data.history || {}) : {}; },
    hist: function (title) {
      var u = readUser(); var h = u && u.data.history ? u.data.history[title] : null;
      return { progress: (h && h.progress) || 0, awarded: (h && h.awarded) || 0, bookmark: (h && h.bookmark) || 0 };
    },
    setHist: function (title, patch) {
      return mutateUser(function (u) {
        var cur = u.data.history[title] || { progress: 0, awarded: 0, bookmark: 0 };
        u.data.history[title] = {
          progress: patch.progress != null ? patch.progress : cur.progress,
          awarded: patch.awarded != null ? patch.awarded : cur.awarded,
          bookmark: patch.bookmark != null ? patch.bookmark : cur.bookmark,
        };
      });
    },
  };

  /* ============================================================
     Exposição global
     ============================================================ */
  window.CDA = {
    ready: true,
    hasWebCrypto: !!subtle,
    auth: {
      register: register,
      login: login,
      logout: logout,
      isLoggedIn: function () { return !!currentUser(); },
      userId: currentUserId,
      guard: guard,
    },
    me: function () { return publicUser(currentUser()); },
    data: dataAPI,
    // utilitário de diagnóstico (não expõe senhas)
    _stats: function () { var db = loadDB(); return { users: Object.keys(db.users).length }; },
  };
})();
