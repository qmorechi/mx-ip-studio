// ╔══════════════════════════════════════════════════════════════╗
// ║  auth.js — 共用登入層（方案 C，已上線）                        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// 全站共用（index / roles / console / ray-upload / timeline）：Google 登入
// （限 MX 公司 Workspace，比對主要網域 @minimax.com.tw —— mx.design 是其網域別名，
// OIDC 回傳的是主要地址）、session 管理、把請求帶上使用者 JWT。
//
// 載入順序（頁面 inline script 之前；用 ?v= 做快取破壞，改版要 bump）：
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="auth.js?v=N"></script>
//
// 主要能力：
//   MXIPAuth.init({ gate:true })  受保護頁：未登入導回 index 門面（記住來源頁，登入後返回）
//   authHeaders()                 REST headers：登入帶 JWT、否則 anon
//   guardWrite(opts)              寫入前擋未登入
//   onChange(cb)                  登入/登出時通知頁面重載/清資料
//   hasAnyRole([...]) / showForbidden()  頁面層角色門檻（console 限 admin+backend 等）
//   閒置 30 分自動登出；登出歸位 index。
//
// 安全模型（伺服器端為準，RLS 已全表 ENABLE）：讀=要登入（anon 已收回 SELECT）；
// 寫=登入 + RLS 依角色限縮（本人/admin/backend）。前端 gate/隱藏只是體驗層，硬擋靠 RLS。

(function (global) {
  'use strict';

  const SB_URL = 'https://cpzbwxgokmvayhzrvkqm.supabase.co';
  // anon key 與三頁相同（公開可見、設計上即如此；真正防護靠 RLS）
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwemJ3eGdva212YXloenJ2a3FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTY1NTYsImV4cCI6MjA5NDkzMjU1Nn0.7d_pasAywneqOxOHFGlc1dpMJcUv1BDCvhV2jYLaAGE';
  // mx.design 是 minimax.com.tw 的網域別名 → Google OIDC 回傳的 email 一律是主要地址
  // @minimax.com.tw（不是別名 @mx.design）。故允許網域 = minimax.com.tw。
  const ALLOWED_DOMAIN = 'minimax.com.tw';
  const HOME_URL = 'index.html';   // 單一入口/登出歸位點
  const NEXT_KEY = 'mxip_next';    // 登入後要返回的頁。
  // 用 localStorage：① 不靠網址 query（Supabase OAuth 帶 query 的 redirect 可能被丟回乾淨
  // Site URL 而掉參數）② localStorage 才撐得過 Google OAuth 跨站跳轉（Supabase session 本身
  // 也存這裡才登得進來）；sessionStorage 在這趟跳轉會掉。用完即刪。
  function rememberNext(path) { try { localStorage.setItem(NEXT_KEY, path); } catch (e) { /* noop */ } }
  const WRITE_VERBS = ['POST', 'PATCH', 'PUT', 'DELETE'];

  if (!global.supabase || !global.supabase.createClient) {
    console.error('[auth] supabase-js 未載入 —— 請先放 @supabase/supabase-js CDN script');
  }

  const sb = global.supabase.createClient(SB_URL, SB_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  let _session = null;

  async function refreshSession() {
    const { data } = await sb.auth.getSession();
    _session = data.session || null;
    return _session;
  }

  function currentUser() { return _session && _session.user ? _session.user : null; }
  function accessToken() { return _session ? _session.access_token : null; }
  function currentEmail() {
    const u = currentUser();
    return u && u.email ? u.email.toLowerCase() : null;
  }
  function isAllowed() {
    const e = currentEmail();
    return !!e && e.endsWith('@' + ALLOWED_DOMAIN);
  }

  // REST 用 headers：登入且網域對 → 帶使用者 JWT；否則退回 anon（讀公開）。
  // apikey 永遠帶 anon key（Supabase 要求，登入後也要）。
  function authHeaders(extra) {
    const tok = (isAllowed() && accessToken()) ? accessToken() : SB_ANON;
    return Object.assign(
      { apikey: SB_ANON, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      extra || {}
    );
  }

  // ── 角色門檻（頁面層級存取控制）──
  // 查登入者在 user_roles 的角色（email 帳號名＝member_id）。RLS 下 authenticated 可讀。
  async function myRoles() {
    if (!(currentUser() && isAllowed())) return [];
    const id = currentEmail().split('@')[0];
    try {
      const res = await fetch(SB_URL + '/rest/v1/user_roles?member_id=eq.' + encodeURIComponent(id) + '&select=role', { headers: authHeaders() });
      if (!res.ok) return [];
      return (await res.json()).map(function (r) { return r.role; });
    } catch (e) { return []; }
  }
  async function hasAnyRole(roles) {
    const mine = await myRoles();
    return roles.some(function (r) { return mine.indexOf(r) !== -1; });
  }
  // 非授權頁面用：整頁換成「無權限」提示 + 回首頁連結（不渲染原內容）。
  function showForbidden(msg) {
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;'
      + 'font:15px/1.6 system-ui,sans-serif;color:#e7edf3;background:#0d0d0f;text-align:center;padding:24px">'
      + '<div style="font-size:40px">🔒</div><div>' + (msg || '此頁僅限授權人員') + '</div>'
      + '<a href="' + HOME_URL + '" style="color:#c5a46b;text-decoration:none">← 回首頁</a></div>';
  }

  function isWrite(opts) {
    const m = (opts && opts.method ? opts.method : 'GET').toUpperCase();
    return WRITE_VERBS.indexOf(m) !== -1;
  }

  // 把前次失敗殘留的 OAuth error 參數與 hash 從 URL 清掉，回傳乾淨的網址字串。
  // 否則帶 error= 的網址當 redirectTo，會讓 Supabase 把成功回呼也誤判為失敗、拒收 token。
  function cleanUrl(href) {
    const u = new URL(href);
    ['error', 'error_description', 'error_code'].forEach(function (k) { u.searchParams.delete(k); });
    u.hash = '';
    return u.toString();
  }

  async function signIn() {
    await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: cleanUrl(location.href),
        queryParams: { hd: ALLOWED_DOMAIN, prompt: 'select_account' },
      },
    });
  }

  async function signOut() {
    await sb.auth.signOut();
    _session = null;
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
    // 單一入口：登出回首頁門面（除非已在首頁），並記住當前頁（localStorage），
    // 重新登入後由 index 自動送回。
    if (!/(^|\/)index\.html?($|\?|#)/.test(location.pathname) && location.pathname !== '/') {
      rememberNext(location.pathname + location.search + location.hash);
      location.href = HOME_URL;
      return;
    }
    renderBar();
  }

  // ── 閒置自動登出（座位/共用裝置防護）──
  // 成員在公司外用個人/共用裝置登入後若離開，閒置超過 IDLE_MS 自動 signOut，
  // 避免登入態被留著讓非相關的人接手寫入。核心安全仍是 RLS，此為額外一層。
  const IDLE_MS = 30 * 60 * 1000; // 30 分鐘
  let _idleTimer = null;
  function resetIdle() {
    if (_idleTimer) clearTimeout(_idleTimer);
    if (!currentUser()) return;          // 沒登入不用計時
    _idleTimer = setTimeout(async function () {
      if (!currentUser()) return;
      await signOut();
      alert('因閒置過久已自動登出，請重新登入');
    }, IDLE_MS);
  }
  function startIdleWatch() {
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) {
      window.addEventListener(ev, resetIdle, { passive: true });
    });
  }

  // 寫入前呼叫：未登入 → 觸發登入並回 false（呼叫端應中止本次寫入）。
  // 登入了但非允許網域 → 登出 + 提示。允許網域 → true。
  async function requireLogin() {
    if (!_session) await refreshSession();
    if (currentUser() && isAllowed()) return true;
    if (currentUser() && !isAllowed()) {
      alert('請改用 MX 公司的 Google 帳號登入');
      await signOut();
      return false;
    }
    await signIn(); // 會跳轉 OAuth，回來後 session 就緒
    return false;
  }

  // 給 sbFetch 包一層：寫入且未登入 → 擋下並引導登入；其餘照常。
  // 用法：sbFetch 內 `if (await MXIPAuth.guardWrite(opts)) return;` 後再發 request。
  async function guardWrite(opts) {
    if (!isWrite(opts)) return false;       // 讀：放行
    if (!_session) await refreshSession();
    if (currentUser() && isAllowed()) return false; // 已登入：放行
    await requireLogin();
    return true; // 已攔截（觸發登入或提示），呼叫端中止
  }

  // ── 登入列 UI（右上角浮動）──
  function renderBar() {
    let bar = document.getElementById('mxip-authbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'mxip-authbar';
      bar.style.cssText = 'position:fixed;top:8px;right:12px;z-index:9999;font:13px/1.4 system-ui,sans-serif;display:flex;gap:8px;align-items:center;background:rgba(20,24,30,.82);color:#e7edf3;padding:6px 10px;border-radius:8px;backdrop-filter:blur(6px)';
      document.body.appendChild(bar);
    }
    const u = currentUser();
    if (u && isAllowed()) {
      const md = u.user_metadata || {};
      // 顯示 email 帳號名（= 系統 member_id，如 qmore），不顯示 Google 全名。
      const nm = (u.email ? u.email.split('@')[0] : '') || md.full_name || md.name || '已登入';
      bar.innerHTML = '<span>✅ ' + nm + '</span><button id="mxip-signout" style="cursor:pointer;border:0;border-radius:6px;padding:3px 8px;background:#33405a;color:#cfe">登出</button>';
      bar.querySelector('#mxip-signout').onclick = signOut;
    } else if (u && !isAllowed()) {
      bar.innerHTML = '<span>⚠️ 非公司帳號</span><button id="mxip-signout" style="cursor:pointer;border:0;border-radius:6px;padding:3px 8px;background:#5a3340;color:#fcc">換帳號</button>';
      bar.querySelector('#mxip-signout').onclick = signOut;
    } else {
      bar.innerHTML = '<button id="mxip-signin" style="cursor:pointer;border:0;border-radius:6px;padding:4px 10px;background:#2d6cdf;color:#fff">用 MX 公司帳號登入</button>';
      bar.querySelector('#mxip-signin').onclick = signIn;
    }
  }

  // ── 置中登入浮層（壓暗背景）──
  // 給「邀請落地頁」用（如 Slack 寄出的 roles 連結）：未登入時不把人導走、不顯示任何
  // 指派資料，而是原地壓暗背景 + 在畫面正中央放登入卡。登入後自動移除、頁面接著載入資料。
  // 比「閃一下內容又被踢回 index」直覺，符合「需要登入就置中壓暗、登入完即可開始作業」原則。
  // 由 init({ gate:'overlay' }) 啟用；登入/登出狀態變更會自動重算（登入即移除）。
  function renderLoginOverlay() {
    const loggedIn = currentUser() && isAllowed();
    let ov = document.getElementById('mxip-login-overlay');
    if (loggedIn) { if (ov) ov.remove(); return; }   // 已登入：撤掉浮層
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'mxip-login-overlay';
      // inset:0 全屏壓暗 + 置中；z-index 高於右上角登入列（9999），蓋住整頁、擋住互動。
      ov.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;'
        + 'justify-content:center;padding:24px;background:rgba(8,9,12,.82);'
        + 'backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);'
        + 'font:14px/1.6 system-ui,-apple-system,sans-serif';
      document.body.appendChild(ov);
    }
    // 兩種狀態：① 完全未登入 → 引導登入；② 登入了但非公司帳號 → 引導換帳號。
    const wrong = currentUser() && !isAllowed();
    const c = wrong
      ? { icon: '⚠️', title: '請改用 MX 公司帳號',
          desc: '你登入的不是公司 Google 帳號（@' + ALLOWED_DOMAIN + '）。請換帳號後再開始。',
          btn: '換帳號', handler: signOut }
      : { icon: '🔐', title: '登入後開始選擇角色',
          desc: '用 MX 公司的 Google 帳號登入，即可在這頁認領你負責的角色。',
          btn: '用 MX 公司帳號登入', handler: signIn };
    ov.innerHTML =
      '<div style="max-width:360px;width:100%;text-align:center;background:#16161a;'
      + 'border:1px solid rgba(197,164,107,.28);border-radius:16px;padding:32px 28px;'
      + 'box-shadow:0 20px 60px rgba(0,0,0,.5)">'
      + '<div style="font-size:40px;margin-bottom:12px">' + c.icon + '</div>'
      + '<div style="font-size:18px;font-weight:600;color:#e8e6e0;margin-bottom:8px">' + c.title + '</div>'
      + '<div style="color:#a3a097;margin-bottom:22px">' + c.desc + '</div>'
      + '<button id="mxip-overlay-btn" style="cursor:pointer;border:0;border-radius:10px;'
      + 'padding:11px 20px;width:100%;font:600 15px/1 system-ui,sans-serif;'
      + 'background:#2d6cdf;color:#fff">' + c.btn + '</button>'
      + '</div>';
    const b = ov.querySelector('#mxip-overlay-btn');
    if (b) b.onclick = c.handler;
  }

  // 登入狀態變更通知：頁面註冊 callback，登入/登出時被呼叫（帶 session，登出為 null）。
  // 用途：未登入時頁面該清掉/不顯示敏感資料（如角色指派），登入後再載。
  const _changeListeners = [];
  function onChange(cb) { if (typeof cb === 'function') _changeListeners.push(cb); }
  function notifyChange() {
    _changeListeners.forEach(function (cb) { try { cb(_session); } catch (e) { console.error('[auth] onChange listener error', e); } });
  }

  // 給 index 門面用：已登入且 localStorage 有記住的頁就送回去。回傳是否已跳轉。
  function consumeNext() {
    if (!(currentUser() && isAllowed())) return false;
    try {
      const next = localStorage.getItem(NEXT_KEY);
      if (next) { localStorage.removeItem(NEXT_KEY); location.replace(next); return true; }
    } catch (e) { /* noop */ }
    return false;
  }

  // 頁面載入呼叫一次。回傳 session（可能為 null）。
  // opts.gate=true：受保護頁，未登入（或非公司帳號）一律導回 index.html 登入，
  // 並把原本要去的網址記住（localStorage），登入後由 index 送回。
  async function init(opts) {
    opts = opts || {};
    await refreshSession();
    // gate:true     → 未登入導回 index 門面登入（單一入口，舊行為）。
    // gate:'overlay' → 未登入原地壓暗 + 置中登入卡（邀請落地頁，不導走、不洩漏資料）。
    if (opts.gate && opts.gate !== 'overlay' && !(currentUser() && isAllowed())) {
      rememberNext(location.pathname + location.search + location.hash);
      location.replace(HOME_URL);
      return _session;
    }
    // 清掉網址列殘留的 OAuth error 參數（前次失敗留下的，會擋住下次登入）。
    // 在 refreshSession 之後做，確保 detectSessionInUrl 已先處理過 hash token。
    try {
      const u = new URL(location.href);
      if (u.searchParams.has('error')) {
        ['error', 'error_description', 'error_code'].forEach(function (k) { u.searchParams.delete(k); });
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      }
    } catch (e) { /* noop */ }
    sb.auth.onAuthStateChange(function (_evt, session) {
      _session = session || null;
      renderBar();
      if (opts.gate === 'overlay') renderLoginOverlay();   // 登入即撤浮層、登出即重壓暗
      resetIdle();              // 登入後開始計時、登出後清掉
      notifyChange();           // 通知頁面重載/清空資料
    });
    startIdleWatch();
    resetIdle();                // 若一進來就是登入態，立即起算
    if (document.body) renderBar();
    else document.addEventListener('DOMContentLoaded', renderBar);
    // overlay 模式：未登入時立即壓暗 + 置中登入卡（登入態則 renderLoginOverlay 自會略過）。
    if (opts.gate === 'overlay') {
      if (document.body) renderLoginOverlay();
      else document.addEventListener('DOMContentLoaded', renderLoginOverlay);
    }
    return _session;
  }

  global.MXIPAuth = {
    init, signIn, signOut, requireLogin, guardWrite, authHeaders, onChange, consumeNext,
    myRoles, hasAnyRole, showForbidden, renderLoginOverlay,
    currentUser, currentEmail, accessToken, isAllowed, refreshSession,
    SB_URL, SB_ANON, HOME_URL,
  };
})(window);
