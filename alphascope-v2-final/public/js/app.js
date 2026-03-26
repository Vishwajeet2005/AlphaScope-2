// ── CONFIG ──────────────────────────────────────────────────────────────────
// Map /api/X → /.netlify/functions/X  (works both locally and on Netlify)
function apiUrl(path) {
  // path is like "/bookmarks" or "/bookmarks/SYMBOL" or "/signals?force=true"
  // split off query string first
  const [pathname, qs] = path.split('?');
  // first segment is the function name, rest is sub-path
  const parts = pathname.replace(/^\//, '').split('/');
  const fnName = parts[0];
  const subPath = parts.slice(1).join('/');
  const base = `/.netlify/functions/${fnName}${subPath ? '/' + subPath : ''}`;
  return qs ? base + '?' + qs : base;
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
const Auth = {
  getToken()   { return localStorage.getItem('as_token'); },
  getUser()    { try { return JSON.parse(localStorage.getItem('as_user')); } catch { return null; } },
  setSession(token, user) {
    localStorage.setItem('as_token', token);
    localStorage.setItem('as_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('as_token');
    localStorage.removeItem('as_user');
  },
  isLoggedIn() { return !!this.getToken(); },
  requireAuth() {
    if (!this.isLoggedIn()) { window.location.href = '/'; return false; }
    return true;
  },
  authHeaders() {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
    };
  }
};

// ── API CALLS ─────────────────────────────────────────────────────────────────
async function apiFetch(path, method = 'GET', body = null) {
  try {
    const res = await fetch(apiUrl(path), {
      method,
      headers: Auth.authHeaders(),
      ...(body !== null ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { Auth.clear(); window.location.href = '/'; return null; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    console.error('apiFetch error:', path, e);
    return { ok: false, status: 0, data: { error: e.message } };
  }
}

async function apiGet(path)        { return apiFetch(path, 'GET'); }
async function apiPost(path, body) { return apiFetch(path, 'POST', body); }
async function apiDel(path)        { return apiFetch(path, 'DELETE'); }

// ── THEME ─────────────────────────────────────────────────────────────────────
const Theme = {
  current() { return localStorage.getItem('as_theme') || 'dark'; },
  apply(t) {
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : '');
    localStorage.setItem('as_theme', t);
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.textContent = t === 'light' ? '🌙' : '☀️';
    });
  },
  toggle() { this.apply(this.current() === 'dark' ? 'light' : 'dark'); },
  init()   { this.apply(this.current()); }
};

// ── TOAST ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success', dur = 2500) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast'; el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast t-${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), dur);
}

// ── NAV RENDERING ─────────────────────────────────────────────────────────────
function renderNav(activePage = '') {
  const user = Auth.getUser();
  const bmCount = parseInt(localStorage.getItem('as_bm_count') || '0');
  const nav = document.getElementById('navbar');
  if (!nav) return;

  nav.innerHTML = `
    <a href="/pages/dashboard.html" class="nav-logo">
      <div class="nav-logo-dot"></div>AlphaScope
    </a>

    ${user ? `
    <div class="nav-search-wrap">
      <span class="nav-search-icon">⌕</span>
      <input class="nav-search" id="navSearch" placeholder="Search NSE stocks..." autocomplete="off" spellcheck="false">
      <div class="search-results" id="searchResults"></div>
    </div>` : ''}

    <div class="nav-right">
      ${user ? `
      <div class="nav-links">
        <a href="/pages/dashboard.html" class="nav-link ${activePage==='dashboard'?'active':''}">Dashboard</a>
        <a href="/pages/bookmarks.html" class="nav-link ${activePage==='bookmarks'?'active':''}">
          ★ Bookmarks <span class="bm-count" id="navBmCount">${bmCount||''}</span>
        </a>
      </div>
      <button class="scan-btn" id="navScanBtn" onclick="triggerScan()">▶ SCAN</button>
      <div class="user-badge">
        <div class="user-avatar">${(user.username||'?')[0].toUpperCase()}</div>
        <span>${user.username}</span>
        <button class="logout-btn" onclick="logout()">Sign out</button>
      </div>` : ''}
      <button class="theme-toggle" onclick="Theme.toggle()" title="Toggle theme">☀️</button>
    </div>
  `;
  Theme.apply(Theme.current());
  if (user) initNavSearch();
}

function logout() {
  Auth.clear();
  window.location.href = '/';
}

// ── SEARCH ────────────────────────────────────────────────────────────────────
let _searchTimer = null;
function initNavSearch() {
  const input = document.getElementById('navSearch');
  const dd    = document.getElementById('searchResults');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    const q = input.value.trim();
    if (!q) { dd.classList.remove('open'); return; }
    _searchTimer = setTimeout(() => doNavSearch(q), 200);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dd.classList.remove('open'); input.value = ''; }
  });
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dd.contains(e.target)) dd.classList.remove('open');
  });
}

async function doNavSearch(q) {
  const dd = document.getElementById('searchResults');
  const res = await apiGet('/stocks/search?q=' + encodeURIComponent(q));
  if (!res?.data) return;
  const results = res.data;
  if (!results.length) {
    dd.innerHTML = `<div class="sr-empty">No stocks found for "${q}"</div>`;
    dd.classList.add('open'); return;
  }
  const alphaSyms = new Set((window._alphaSignals || []).map(s => s.symbol));
  dd.innerHTML = results.map(r => `
    <div class="sr-item" onclick="goToStock('${r.symbol}','${r.name}','${r.sector}')">
      <div>
        <div class="sr-sym">${r.symbol}</div>
        <div class="sr-name">${r.name}</div>
      </div>
      <div style="display:flex;gap:5px;align-items:center">
        ${alphaSyms.has(r.symbol) ? '<span class="sr-badge alpha">ALPHA</span>' : ''}
        <span class="sr-badge sector">${r.sector}</span>
      </div>
    </div>
  `).join('');
  dd.classList.add('open');
}

function goToStock(symbol, name, sector) {
  const dd = document.getElementById('searchResults');
  const inp = document.getElementById('navSearch');
  if (dd) dd.classList.remove('open');
  if (inp) inp.value = '';
  window.location.href = `/pages/stock.html?symbol=${symbol}&name=${encodeURIComponent(name)}&sector=${encodeURIComponent(sector)}`;
}

// ── CHART RENDERING ───────────────────────────────────────────────────────────
let _chartInstances = {};
function destroyCharts() {
  Object.values(_chartInstances).forEach(c => { try { c.destroy(); } catch {} });
  _chartInstances = {};
}

function drawChart(canvasId, type, stockData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  try { _chartInstances[canvasId]?.destroy(); } catch {}

  const ohlcv  = stockData.ohlcv || [];
  const sma20  = stockData.sma20  || [];
  const sma50  = stockData.sma50  || [];
  const rsiArr = stockData.rsi    || [];
  const labels = ohlcv.map((_, i) => i % 15 === 0 ? `D${i+1}` : '');
  const closes = ohlcv.map(d => d.c);
  const isDark = Theme.current() === 'dark';
  const gridC  = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const textC  = isDark ? '#8b949e' : '#57606a';
  const MONO   = 'JetBrains Mono';

  const base = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: gridC }, ticks: { color: textC, font: { family: MONO, size: 10 } } },
      y: { grid: { color: gridC }, ticks: { color: textC, font: { family: MONO, size: 10 } }, position: 'right' },
    },
    animation: { duration: 350 },
  };

  const ctx = canvas.getContext('2d');
  let cfg;

  if (type === 'price') {
    const trend = closes[closes.length-1] >= closes[0] ? '#3fb950' : '#f85149';
    const grad  = ctx.createLinearGradient(0, 0, 0, 260);
    grad.addColorStop(0, trend === '#3fb950' ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    cfg = {
      type: 'line',
      data: { labels, datasets: [
        { data: closes, borderColor: trend, borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: grad, tension: 0.3 },
        { data: sma20,  borderColor: isDark ? '#58a6ff' : '#0969da', borderWidth: 1, pointRadius: 0, tension: 0.3 },
        { data: sma50,  borderColor: isDark ? '#f0883e' : '#bc4c00', borderWidth: 1, pointRadius: 0, tension: 0.3 },
      ]},
      options: base,
    };
  } else if (type === 'rsi') {
    cfg = {
      type: 'line',
      data: { labels, datasets: [{ data: rsiArr, borderColor: '#e3b341', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 }] },
      options: { ...base, scales: { ...base.scales, y: { ...base.scales.y, min: 0, max: 100,
        ticks: { color: textC, font: { family: MONO, size: 10 }, callback: v => [30,50,70].includes(v) ? v : '' } } } },
    };
  } else {
    const cols = ohlcv.map(d => d.c >= d.o ? 'rgba(63,185,80,0.7)' : 'rgba(248,81,73,0.7)');
    cfg = {
      type: 'bar',
      data: { labels, datasets: [{ data: ohlcv.map(d=>d.v), backgroundColor: cols, borderWidth: 0 }] },
      options: base,
    };
  }
  _chartInstances[canvasId] = new Chart(ctx, cfg);
}

// ── CONVICTION HELPERS ────────────────────────────────────────────────────────
function convBadgeClass(c) {
  return {  'STRONG BUY':'badge-sb', 'BUY':'badge-b', 'WATCH':'badge-w' }[c] || 'badge-n';
}
function convColor(c) {
  return { 'STRONG BUY':'var(--green)', 'BUY':'var(--green)', 'WATCH':'var(--amber)' }[c] || 'var(--text3)';
}
function convPct(c) {
  return { 'STRONG BUY':92, 'BUY':72, 'WATCH':45, 'NEUTRAL':20 }[c] || 20;
}

// ── BOOKMARKS COUNTER ─────────────────────────────────────────────────────────
async function refreshBmCount() {
  const res = await apiGet('/bookmarks');
  if (res?.ok) {
    const n = res.data.length || 0;
    localStorage.setItem('as_bm_count', n);
    const el = document.getElementById('navBmCount');
    if (el) el.textContent = n || '';
    return res.data;
  }
  return [];
}

// ── SCAN TRIGGER ─────────────────────────────────────────────────────────────
async function triggerScan() {
  if (typeof window.runScan === 'function') { window.runScan(); return; }
  window.location.href = '/pages/dashboard.html?scan=1';
}

// ── INIT ──────────────────────────────────────────────────────────────────────
Theme.init();
