/* ==========================================================================
   空曙 · 记忆回廊 —— 全站共享模块（Supabase 登录门）
   整站私有化改造：所有页面都需要账号登录，否则任何内容无法访问。
   账号一共只有两个（空曙 + 她），都在 Supabase Authentication 里创建，
   并登记在 public.members 表（role 填 admin）。权限由 RLS 兜底。

   与 journal-core.js 共用同一套 localStorage key：
     * journal.session.v1  会话
     * journal.supabase.v1 连接设置覆盖
   ========================================================================== */
window.SiteApp = (function () {
    'use strict';

    const SB_DEFAULT = {
        url: 'https://opfqdxkursoetciskvqx.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wZnFkeGt1cnNvZXRjaXNrdnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MDQ2MzksImV4cCI6MjEwNzI4MDYzOX0.zZyQOYZyV2jy-1qZyRw6Pq7UDWSHB0VK8IZuGVOHCx4'
    };

    const K = {
        sb: 'journal.supabase.v1',
        session: 'journal.session.v1'
    };

    /* ====================== 小工具 ====================== */
    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function storeGet(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw == null ? (fallback === undefined ? null : fallback) : JSON.parse(raw);
        } catch (e) { return fallback === undefined ? null : fallback; }
    }
    function storeSet(key, value) {
        try {
            if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { /* 隐私模式：静默失败 */ }
    }
    function decodeJwt(token) {
        try {
            const p = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(decodeURIComponent(escape(atob(p))));
        } catch (e) { return {}; }
    }
    const pad2 = n => String(n).padStart(2, '0');
    function todayStr(d) {
        const x = d || new Date();
        return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
    }
    function newId(prefix) {
        return (prefix || 's') + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    }
    function toast(msg, kind, ms) {
        let host = document.getElementById('toastHost');
        if (!host) {
            host = document.createElement('div');
            host.id = 'toastHost';
            host.className = 'toast-host';
            document.body.appendChild(host);
        }
        const el = document.createElement('div');
        el.className = 'toast' + (kind ? ' ' + kind : '');
        el.textContent = msg;
        host.appendChild(el);
        setTimeout(() => el.remove(), ms || 2800);
    }

    /* ====================== 顶部导航（毛玻璃） ====================== */
    const NAV_ITEMS = [
        { key: 'home', href: 'Secret.html', label: '🏠 主厅' },
        { key: 'articles', href: 'Articles/index.html', label: '📖 朴实文章' },
        { key: 'photo', href: 'Photos/index.html', label: '📷 Love Photo' },
        { key: 'list', href: 'List/index.html', label: '✅ Love List' },
        { key: 'survey', href: 'Questionnaires/index.html', label: '📝 问卷小屋' },
        { key: 'admin', href: 'Admin.html', label: '🛠 后台' }
    ];
    function mountHeader(activeKey) {
        const header = document.createElement('header');
        header.className = 'site-header';
        const here = location.pathname.replace(/\\/g, '/');
        const rel = p => {
            // 根据当前页面深度修正相对链接
            const depth = (here.split('/').filter(Boolean).length
                - here.split('/').filter(Boolean).lastIndexOf(here.split('/').filter(Boolean).slice(-1)[0]) , 0);
            if (/\/(Selects|Thoughts|Questionnaires|Birthdays|Entertainments|Articles|Photos|List)\//.test(here)) return '../' + p;
            return p;
        };
        header.innerHTML =
            '<div class="bar">' +
                '<a class="logo" href="' + rel('Secret.html') + '"><span>📜</span><span>记忆回廊</span></a>' +
                '<span class="slogan">被时光封存的低语 · 每一个选择都会开启一段全新体验</span>' +
                '<nav class="nav-links">' +
                    NAV_ITEMS.map(n => '<a href="' + rel(n.href) + '"' + (n.key === activeKey ? ' class="on"' : '') + '>' + n.label + '</a>').join('') +
                '</nav>' +
                '<span id="accountSlot"></span>' +
            '</div>';
        document.body.insertBefore(header, document.body.firstChild);
        const offset = document.createElement('div');
        offset.className = 'header-offset';
        document.body.insertBefore(offset, header.nextSibling);
        return header;
    }
    function renderAccountSlot(me) {
        const slot = document.getElementById('accountSlot');
        if (!slot) return;
        if (!me) { slot.innerHTML = ''; return; }
        const name = me.display_name || (me.email || '').split('@')[0] || '成员';
        slot.innerHTML = '<button class="btn sm" id="siteSignOut" title="' + esc(me.email || '') + '">👤 ' + esc(name) + ' · 退出</button>';
        const btn = document.getElementById('siteSignOut');
        if (btn) btn.addEventListener('click', () => {
            storeSet(K.session, null);
            location.reload();
        });
    }

    /* ====================== Supabase REST ====================== */
    const state = {
        sb: Object.assign({}, SB_DEFAULT),
        session: { accessToken: '', refreshToken: '', expiresAt: 0 },
        me: null
    };
    const sbBase = () => String(state.sb.url || '').replace(/\/+$/, '');
    function sbHeaders(token) {
        const h = { 'apikey': state.sb.anonKey, 'Accept': 'application/json' };
        h.Authorization = 'Bearer ' + (token || state.session.accessToken || state.sb.anonKey);
        return h;
    }
    function sbErr(data, status) {
        const msg = (data && (data.message || data.error_description || data.msg || data.hint)) || ('请求失败（' + status + '）');
        if (status === 401) return '登录已失效，请重新登录（401）';
        if (status === 403) return '没有权限（403）：' + msg;
        return msg;
    }
    async function sbAuth(grant, payload) {
        const res = await fetch(sbBase() + '/auth/v1/token?grant_type=' + grant, {
            method: 'POST',
            headers: { 'apikey': state.sb.anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(sbErr(data, res.status));
        return data;
    }
    async function sbRest(path, opts) {
        const o = opts || {};
        const res = await fetch(sbBase() + '/rest/v1/' + path, {
            method: o.method || 'GET',
            headers: Object.assign(sbHeaders(), o.headers || {}, o.body ? { 'Content-Type': 'application/json', 'Prefer': o.prefer || 'return=minimal' } : {}),
            body: o.body ? JSON.stringify(o.body) : undefined,
            cache: 'no-store'
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(sbErr(data, res.status));
        }
        if (res.status === 204) return null;
        return res.json().catch(() => null);
    }
    const rpc = (fn, args) => sbRest('rpc/' + fn, { method: 'POST', body: args || {} });

    function saveSession(d) {
        const jwt = decodeJwt(d.access_token || '');
        state.session = {
            accessToken: d.access_token || '',
            refreshToken: d.refresh_token || state.session.refreshToken || '',
            expiresAt: Date.now() + ((d.expires_in || 3600) * 1000),
            email: jwt.email || (d.user && d.user.email) || '',
            uid: jwt.sub || (d.user && d.user.id) || ''
        };
        storeSet(K.session, state.session);
    }
    async function ensureFreshToken() {
        if (!state.session.accessToken) return;
        if (Date.now() < (state.session.expiresAt || 0) - 120000) return;
        if (!state.session.refreshToken) return;
        try {
            saveSession(await sbAuth('refresh_token', { refresh_token: state.session.refreshToken }));
        } catch (e) {
            console.warn('会话刷新失败，需要重新登录', e);
            storeSet(K.session, null);
            state.session = { accessToken: '', refreshToken: '', expiresAt: 0 };
        }
    }
    async function loadProfile() {
        if (!state.session.accessToken) { state.me = null; return; }
        const p = await rpc('my_profile');
        const prof = Array.isArray(p) ? p[0] : p;
        state.me = {
            email: (prof && prof.email) || state.session.email || '',
            role: (prof && prof.role) || 'none',
            display_name: (prof && prof.display_name) || ''
        };
    }
    async function signIn(email, password) {
        saveSession(await sbAuth('password', { email: email, password: password }));
    }

    /* ====================== 登录门 ====================== */
    function loginCardHtml() {
        return '<div class="gate-card">' +
            '<div class="gate-icon">🔐</div>' +
            '<h2>这里是私人领域</h2>' +
            '<p>整站所有内容都需要账号登录后才能访问。<br>账号一共只有两个 —— 空曙的，和她的，都由 Supabase 保管。<br>没有账号的话，就什么也看不到。</p>' +
            '<form id="gateForm">' +
                '<div class="field"><label>邮箱</label><input class="input" type="email" id="gateEmail" placeholder="you@example.com" autocomplete="username"></div>' +
                '<div class="field"><label>密码</label><input class="input" type="password" id="gatePass" placeholder="••••••••" autocomplete="current-password"></div>' +
                '<div class="gate-error" id="gateError"></div>' +
                '<button class="btn blue" type="submit" style="width:100%;justify-content:center">🔑 登录 · 进入记忆回廊</button>' +
            '</form>' +
        '</div>';
    }
    function deniedCardHtml(email) {
        return '<div class="gate-card">' +
            '<div class="gate-icon">🚫</div>' +
            '<h2>这个账号还没有权限</h2>' +
            '<p>你登录的邮箱是 <b>' + esc(email) + '</b>，但它不在授权名单里。<br>' +
            '让空曙在 Supabase 后台把它加进 <code>members</code> 表（role 填 <code>admin</code>）即可。</p>' +
            '<button class="btn ghost" onclick="SiteApp.signOutReload()">换成别的账号</button>' +
        '</div>';
    }
    function bindLoginCard(onOk) {
        const form = document.getElementById('gateForm');
        if (!form) return;
        const emailInput = document.getElementById('gateEmail');
        const passInput = document.getElementById('gatePass');
        const err = document.getElementById('gateError');
        const submit = async ev => {
            ev.preventDefault();
            const email = emailInput.value.trim();
            const pass = passInput.value;
            if (!email || !pass) { err.textContent = '邮箱和密码都要填'; return; }
            const btn = form.querySelector('button[type="submit"]');
            const old = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 登录中…';
            err.textContent = '';
            try {
                await signIn(email, pass);
                if (onOk) onOk(); else location.reload();
            } catch (e) {
                err.textContent = '❌ ' + e.message;
                btn.disabled = false; btn.innerHTML = old;
            }
        };
        form.addEventListener('submit', submit);
        setTimeout(() => emailInput.focus(), 60);
    }
    function signOutReload() {
        storeSet(K.session, null);
        location.reload();
    }

    /**
     * 页面统一入口：
     *   const app = await SiteApp.init({ active: 'home' });
     *   if (!app.me) { ... 已在页面里渲染登录门，直接 return ... }
     * 返回 { me, sbRest, rpc, toast, esc, storeGet, storeSet, newId }
     */
    async function init(opt) {
        const o = opt || {};
        if (!document.querySelector('.site-header')) mountHeader(o.active);
        if (!document.getElementById('toastHost')) {
            const host = document.createElement('div');
            host.id = 'toastHost';
            host.className = 'toast-host';
            document.body.appendChild(host);
        }

        const savedSb = storeGet(K.sb, null);
        if (savedSb && savedSb.url && savedSb.anonKey) state.sb = savedSb;
        const saved = storeGet(K.session, null);
        if (saved && saved.accessToken) state.session = saved;

        const main = o.main ? document.querySelector(o.main) : document.querySelector('main');
        if (main) main.innerHTML = '<div class="gate-card"><span class="spin" style="width:22px;height:22px;border-width:3px;color:var(--blue-2)"></span><h2>正在检查登录状态…</h2></div>';

        if (!state.session.accessToken) {
            if (main) { main.innerHTML = loginCardHtml(); bindLoginCard(); }
            return { me: null, sbRest, rpc, toast, esc, storeGet, storeSet, newId };
        }
        try {
            await ensureFreshToken();
            await loadProfile();
        } catch (e) {
            console.error(e);
            if (main) {
                main.innerHTML = loginCardHtml();
                const err = document.getElementById('gateError');
                if (err) err.textContent = '⚠️ ' + e.message;
                bindLoginCard();
            }
            return { me: null, sbRest, rpc, toast, esc, storeGet, storeSet, newId };
        }
        if (!state.me || state.me.role === 'none') {
            if (main) { main.innerHTML = deniedCardHtml(state.me ? state.me.email : ''); }
            return { me: null, sbRest, rpc, toast, esc, storeGet, storeSet, newId };
        }
        renderAccountSlot(state.me);
        return {
            me: state.me, sbRest, rpc, toast, esc, storeGet, storeSet, newId,
            signOut: signOutReload
        };
    }

    /* 公开 API（轻量守卫 localGuard 供各页面备用） */
    const api = {
        init, sbRest, rpc, toast, esc, signIn, storeGet, storeSet, newId,
        signOutReload,
        session: () => state.session,
        me: () => state.me,
        sbUrl: () => sbBase(),
        sbAnonKey: () => state.sb.anonKey,
        /** 轻量守卫：只查本地会话是否登录（不做网络校验），未登录跳回主厅 */
        localGuard() {
            const s = storeGet(K.session, null);
            if (!s || !s.accessToken) {
                location.replace((/\/(Selects|Thoughts|Questionnaires|Birthdays|Entertainments|Articles|Photos|List)\//.test(location.pathname) ? '../' : '') + 'Secret.html?needlogin=1');
                return false;
            }
            return true;
        }
    };
    return api;
})();
