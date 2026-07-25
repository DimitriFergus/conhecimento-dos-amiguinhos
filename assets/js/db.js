/* ============================================================
   CONHECIMENTO DOS AMIGUINHOS — Banco de dados + Autenticação
   BACKEND: Firebase (Authentication + Firestore)
   ------------------------------------------------------------
   • Contas reais no servidor do Google (seguras, cross-device).
   • Verificação de e-mail nativa (link de confirmação).
   • Login por NOME (mapeia nome -> e-mail no Firestore).
   • Nomes ÚNICOS (coleção 'usernames' + regras de segurança).
   • Dados do usuário (pontos/estante/histórico) no Firestore,
     com cache síncrono em memória para o app seguir rápido.

   A API pública (window.CDA) mantém o MESMO formato do resto do
   app: CDA.auth.* / CDA.data.* / CDA.me() — mais CDA.boot().
   ============================================================ */
(function () {
  "use strict";

  var firebaseConfig = {
    apiKey: "AIzaSyA8wxE5Vzhapx-uYQeoYv7t9FijohE9w70",
    authDomain: "conhecimento-amiguinhos.firebaseapp.com",
    projectId: "conhecimento-amiguinhos",
    storageBucket: "conhecimento-amiguinhos.firebasestorage.app",
    messagingSenderId: "937598406418",
    appId: "1:937598406418:web:df74830b9bbb4a0da06dcb",
    measurementId: "G-DRNR6VGGFN",
  };

  var CACHE_KEY = "cda_cache_v1";

  /* ---------- validação de nome (chave de login) ---------- */
  function normName(name) {
    return String(name || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
  }
  var NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?: [A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;
  function validName(name) {
    var n = String(name || "").trim();
    if (n.length < 2) return { ok: false, error: "O nome precisa de pelo menos 2 letras." };
    if (n.length > 20) return { ok: false, error: "O nome pode ter no máximo 20 letras." };
    if (/[0-9]/.test(n)) return { ok: false, error: "O nome não pode conter números." };
    if (!NAME_RE.test(n)) return { ok: false, error: "Use apenas letras (sem números ou símbolos)." };
    return { ok: true, value: n };
  }
  function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim()); }
  function normEmail(email) { return String(email || "").trim().toLowerCase(); }

  /* Senha forte: 8+ caracteres, 1 maiúscula, 1 número e 1 símbolo. */
  function validPassword(pw) {
    var p = String(pw || "");
    if (p.length < 8) return { ok: false, error: "A senha precisa de pelo menos 8 caracteres." };
    if (!/[A-Z]/.test(p)) return { ok: false, error: "A senha precisa de pelo menos 1 letra maiúscula." };
    if (!/[0-9]/.test(p)) return { ok: false, error: "A senha precisa de pelo menos 1 número." };
    if (!/[^A-Za-z0-9]/.test(p)) return { ok: false, error: "A senha precisa de pelo menos 1 caractere especial." };
    return { ok: true };
  }

  /* ---------- mensagens de erro amigáveis ---------- */
  function mapAuthError(e) {
    var c = (e && e.code) || "";
    switch (c) {
      case "auth/email-already-in-use": return "Já existe uma conta com esse e-mail.";
      case "auth/invalid-email": return "E-mail inválido.";
      case "auth/weak-password": return "Senha muito fraca (mínimo 6 caracteres).";
      case "auth/wrong-password":
      case "auth/invalid-credential":
      case "auth/invalid-login-credentials": return "Senha incorreta.";
      case "auth/user-not-found": return "Conta não encontrada.";
      case "auth/user-disabled": return "Essa conta foi desativada.";
      case "auth/too-many-requests": return "Muitas tentativas. Aguarde um pouco e tente de novo.";
      case "auth/network-request-failed": return "Sem conexão. Verifique sua internet.";
      default: return "Não foi possível continuar. Tente novamente.";
    }
  }

  /* ============================================================
     Firebase (guardado: se o SDK não carregar, o site não quebra)
     ============================================================ */
  if (typeof firebase === "undefined" || !firebase.initializeApp) {
    window.CDA = makeStub("O sistema de contas não carregou (sem conexão?). Recarregue a página.");
    return;
  }

  var app = firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var fdb = firebase.firestore();
  try { auth.useDeviceLanguage(); } catch (e) {}

  function userDoc(uid) { return fdb.collection("users").doc(uid); }
  function nameDoc(key) { return fdb.collection("usernames").doc(key); }

  /* ---------- cache síncrono do usuário atual ---------- */
  var cache = null; // { uid, name, email, emailVerified, points, quizDone, avatar, shelf, history }

  function saveCacheLocal() { try { if (cache) localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {} }
  function loadCacheLocal(uid) { try { var c = JSON.parse(localStorage.getItem(CACHE_KEY)); return (c && c.uid === uid) ? c : null; } catch (e) { return null; } }
  function clearCacheLocal() { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }

  function blankCache(fbUser, name) {
    return { uid: fbUser.uid, name: name || "Amiguinho", email: fbUser.email, emailVerified: !!fbUser.emailVerified,
      points: 0, quizDone: 0, avatar: null, shelf: [], history: {} };
  }

  async function hydrate(fbUser) {
    var snap = await userDoc(fbUser.uid).get();
    var d = snap.exists ? (snap.data() || {}) : {};
    cache = {
      uid: fbUser.uid,
      name: d.name || (fbUser.displayName || "Amiguinho"),
      email: fbUser.email,
      emailVerified: !!fbUser.emailVerified,
      points: d.points || 0,
      quizDone: d.quizDone || 0,
      avatar: d.avatar || null,
      shelf: Array.isArray(d.shelf) ? d.shelf : [],
      history: d.history && typeof d.history === "object" ? d.history : {},
    };
    saveCacheLocal();
  }

  /* ---------- sincronização (debounce) para o Firestore ---------- */
  var syncTimer = null;
  function scheduleSync() {
    saveCacheLocal();
    if (!cache) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(flush, 700);
  }
  function flush() {
    if (!cache) return;
    clearTimeout(syncTimer); syncTimer = null;
    userDoc(cache.uid).set({
      points: cache.points, quizDone: cache.quizDone, avatar: cache.avatar,
      shelf: cache.shelf, history: cache.history,
    }, { merge: true }).catch(function () {});
  }
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });

  /* ============================================================
     AUTENTICAÇÃO
     ============================================================ */
  async function register(input) {
    var nameCheck = validName(input.name);
    if (!nameCheck.ok) return { ok: false, error: nameCheck.error };
    var name = nameCheck.value;
    var key = normName(name);
    var email = normEmail(input.email);
    var password = String(input.password || "");
    if (!validEmail(email)) return { ok: false, error: "E-mail inválido." };
    var pwCheck = validPassword(password);
    if (!pwCheck.ok) return { ok: false, error: pwCheck.error };

    // 1) nome disponível? (checagem rápida antes de criar a conta)
    try {
      var pre = await nameDoc(key).get();
      if (pre.exists) return { ok: false, error: "Esse nome já está em uso. Escolha outro." };
    } catch (e) { return { ok: false, error: "Erro de conexão com o banco. Tente de novo." }; }

    // 2) cria a conta no Firebase Auth (garante e-mail único)
    var cred;
    try { cred = await auth.createUserWithEmailAndPassword(email, password); }
    catch (e) { return { ok: false, error: mapAuthError(e) }; }
    var uid = cred.user.uid;

    // 3) reserva o nome + cria o doc do usuário de forma ATÔMICA (transação)
    try {
      await fdb.runTransaction(async function (tx) {
        var nSnap = await tx.get(nameDoc(key));
        if (nSnap.exists) { var err = new Error("NAME_TAKEN"); err._taken = true; throw err; }
        tx.set(nameDoc(key), { uid: uid, email: email, name: name });
        tx.set(userDoc(uid), {
          name: name, nameKey: key, email: email,
          points: 0, quizDone: 0, avatar: null, shelf: [], history: {},
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      });
    } catch (e) {
      // desfaz a conta recém-criada se o nome foi tomado numa corrida
      try { await cred.user.delete(); } catch (e2) {}
      if (e && e._taken) return { ok: false, error: "Esse nome já está em uso. Escolha outro." };
      return { ok: false, error: "Erro ao criar a conta. Verifique se o Firestore está ativado." };
    }

    // 4) dispara o e-mail de confirmação
    try { await cred.user.sendEmailVerification(); } catch (e) {}

    cache = blankCache(cred.user, name);
    saveCacheLocal();
    return { ok: true, needsVerification: !cred.user.emailVerified, user: publicUser() };
  }

  async function login(input) {
    var name = String(input.name != null ? input.name : (input.identifier || "")).trim();
    var password = String(input.password || "");
    if (!name) return { ok: false, error: "Informe seu nome." };

    // resolve nome -> e-mail no Firestore
    var email;
    try {
      var snap = await nameDoc(normName(name)).get();
      if (!snap.exists) return { ok: false, error: "Não encontramos uma conta com esse nome." };
      email = snap.data().email;
    } catch (e) { return { ok: false, error: "Erro de conexão. Tente de novo." }; }

    var cred;
    try { cred = await auth.signInWithEmailAndPassword(email, password); }
    catch (e) { return { ok: false, error: mapAuthError(e) }; }

    try { await hydrate(cred.user); } catch (e) { cache = blankCache(cred.user, name); }
    return { ok: true, needsVerification: !cred.user.emailVerified, user: publicUser() };
  }

  function logout() {
    flush();
    cache = null; clearCacheLocal();
    return auth.signOut();
  }

  async function nameAvailable(name) {
    var c = validName(name);
    if (!c.ok) return { ok: false, error: c.error };
    try {
      var snap = await nameDoc(normName(c.value)).get();
      return snap.exists ? { ok: false, error: "Esse nome já está em uso." } : { ok: true };
    } catch (e) { return { ok: false, error: "Sem conexão para verificar o nome." }; }
  }

  async function resendVerification() {
    var u = auth.currentUser;
    if (!u) return { ok: false, error: "Ninguém está logado." };
    try { await u.sendEmailVerification(); return { ok: true }; }
    catch (e) { return { ok: false, error: mapAuthError(e) }; }
  }
  // recarrega o usuário do servidor e devolve se o e-mail já foi verificado
  async function reloadVerified() {
    var u = auth.currentUser;
    if (!u) return false;
    try { await u.reload(); } catch (e) {}
    if (cache) { cache.emailVerified = !!auth.currentUser.emailVerified; saveCacheLocal(); }
    return !!auth.currentUser.emailVerified;
  }

  function publicUser() {
    return cache ? { id: cache.uid, name: cache.name, email: cache.email, emailVerified: cache.emailVerified } : null;
  }

  /* ============================================================
     BOOT — resolve o estado de auth, hidrata o cache, e chama cb
     Deve ser usado nas páginas protegidas antes de rodar o app.
     ============================================================ */
  function boot(cb) {
    var settled = false;
    auth.onAuthStateChanged(function (fbUser) {
      if (settled) {
        // mudanças posteriores (ex.: logout em outra aba) — recarrega a página
        if (!fbUser && cache) { cache = null; clearCacheLocal(); }
        return;
      }
      settled = true;
      if (!fbUser) { cache = null; cb(null); return; }
      var local = loadCacheLocal(fbUser.uid);
      if (local) { cache = local; cache.emailVerified = !!fbUser.emailVerified; }
      hydrate(fbUser).then(function () { cb(publicUser()); })
        .catch(function () { if (!cache) cache = blankCache(fbUser); cb(publicUser()); });
    });
  }

  /* ============================================================
     DADOS DO USUÁRIO (síncrono, backed pelo cache; sync no Firestore)
     ============================================================ */
  var dataAPI = {
    meta: function () {
      if (!cache) return null;
      return { id: cache.uid, name: cache.name, email: cache.email, emailVerified: cache.emailVerified,
        avatar: cache.avatar, points: cache.points || 0, quizDone: cache.quizDone || 0 };
    },
    setMeta: function (patch) {
      if (!cache) return;
      if (patch.name != null) cache.name = String(patch.name).trim() || cache.name;
      if (patch.avatar !== undefined) cache.avatar = patch.avatar;
      if (patch.points != null) cache.points = Math.max(0, Math.round(patch.points));
      if (patch.quizDone != null) cache.quizDone = patch.quizDone;
      scheduleSync();
    },
    addPoints: function (n) { if (!cache) return; cache.points = Math.max(0, Math.round((cache.points || 0) + n)); scheduleSync(); },
    shelf: function () { return cache ? (cache.shelf || []).slice() : []; },
    setShelf: function (list) { if (!cache) return; cache.shelf = Array.isArray(list) ? list.slice() : []; scheduleSync(); },
    inShelf: function (t) { return cache ? (cache.shelf || []).indexOf(t) >= 0 : false; },
    addToShelf: function (t) { if (!cache) return; if ((cache.shelf || []).indexOf(t) < 0) cache.shelf.push(t); scheduleSync(); },
    removeFromShelf: function (t) { if (!cache) return; cache.shelf = (cache.shelf || []).filter(function (x) { return x !== t; }); scheduleSync(); },
    history: function () { return cache ? (cache.history || {}) : {}; },
    hist: function (t) { var h = cache && cache.history ? cache.history[t] : null; return { progress: (h && h.progress) || 0, awarded: (h && h.awarded) || 0, bookmark: (h && h.bookmark) || 0 }; },
    setHist: function (t, patch) {
      if (!cache) return;
      var cur = cache.history[t] || { progress: 0, awarded: 0, bookmark: 0 };
      cache.history[t] = {
        progress: patch.progress != null ? patch.progress : cur.progress,
        awarded: patch.awarded != null ? patch.awarded : cur.awarded,
        bookmark: patch.bookmark != null ? patch.bookmark : cur.bookmark,
      };
      scheduleSync();
    },
  };

  /* ---------- stub caso o Firebase não esteja disponível ---------- */
  function makeStub(msg) {
    function fail() { return Promise.resolve({ ok: false, error: msg }); }
    return {
      ready: false, backend: "none", error: msg,
      auth: { register: fail, login: fail, logout: function () {}, isLoggedIn: function () { return false; },
        userId: function () { return null; }, nameAvailable: function () { return Promise.resolve({ ok: false, error: msg }); },
        validName: validName, resendVerification: fail, reloadVerified: function () { return Promise.resolve(false); },
        isEmailVerified: function () { return false; } },
      me: function () { return null; },
      data: { meta: function () { return null; }, setMeta: function () {}, addPoints: function () {}, shelf: function () { return []; },
        setShelf: function () {}, inShelf: function () { return false; }, addToShelf: function () {}, removeFromShelf: function () {},
        history: function () { return {}; }, hist: function () { return { progress: 0, awarded: 0, bookmark: 0 }; }, setHist: function () {} },
      boot: function (cb) { cb(null); },
    };
  }

  /* ============================================================
     Exposição global
     ============================================================ */
  window.CDA = {
    ready: true, backend: "firebase",
    auth: {
      register: register, login: login, logout: logout,
      isLoggedIn: function () { return !!cache; },
      userId: function () { return cache ? cache.uid : null; },
      nameAvailable: nameAvailable,
      validName: validName,
      validPassword: validPassword,
      resendVerification: resendVerification,
      reloadVerified: reloadVerified,
      isEmailVerified: function () { return !!(cache && cache.emailVerified); },
    },
    me: publicUser,
    data: dataAPI,
    boot: boot,
  };
})();
