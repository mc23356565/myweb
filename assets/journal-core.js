/* ==========================================================================
   空曙 · 记忆回廊 —— 前端引擎（Supabase 版）

   数据全部存在 Supabase，权限靠「账号 + 行级安全策略（RLS）」：
     * 整站已经完全私有化：没有账号就什么都看不到
     * 账号一共只有两个（空曙 + 她），两个人权限完全一致：
       看内容、写内容、出问卷、进后台，全都可以
     * 留言模块已按计划移除；互动改为「问卷小屋」

   账号在 Supabase 后台创建，并登记在 public.members 表里（role 填 admin）。
   这个文件不包含任何密钥之外的秘密：anon key 本来就是公开的，安全性由 RLS 保证。
   ========================================================================== */
window.Journal = (function () {
    'use strict';

    /* ====================== 1. 默认配置 ====================== */

    const SB_DEFAULT = {
        url: 'https://opfqdxkursoetciskvqx.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wZnFkeGt1cnNvZXRjaXNrdnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MDQ2MzksImV4cCI6MjEwNzI4MDYzOX0.zZyQOYZyV2jy-1qZyRw6Pq7UDWSHB0VK8IZuGVOHCx4'
    };

    const K = {
        sb: 'journal.supabase.v1',
        session: 'journal.session.v1',
        theme: 'journal.theme.v1',
        draft: 'journal.draft.v1'
    };

    const MOODS = [
        { emoji: '😄', label: '开心', color: '#d99a2b' },
        { emoji: '🥰', label: '喜欢', color: '#d2698f' },
        { emoji: '😌', label: '平静', color: '#6f9d7a' },
        { emoji: '🌱', label: '充实', color: '#4f9d84' },
        { emoji: '💪', label: '振奋', color: '#c96a45' },
        { emoji: '🤔', label: '思考', color: '#8272b5' },
        { emoji: '✨', label: '灵感', color: '#bf9b21' },
        { emoji: '😴', label: '疲惫', color: '#848a95' },
        { emoji: '😔', label: '低落', color: '#5b7ba1' },
        { emoji: '😭', label: '难过', color: '#456a99' },
        { emoji: '😰', label: '焦虑', color: '#a06a58' },
        { emoji: '😡', label: '愤怒', color: '#bd503a' },
        { emoji: '🌫️', label: '孤独', color: '#7b7d8a' },
        { emoji: '🕰️', label: '怀念', color: '#a1875f' },
        { emoji: '🌙', label: '夜想', color: '#6d6fa1' }
    ];

    // 后台初始化 / 升级 SQL：设置面板里可以一键复制
    const SB_SQL = [
        '-- ===== 空曙 · 记忆回廊 后台（可重复执行）=====',
        '-- ① 先在 Authentication → Users 里建账号（两个人的都要建，勾 Auto Confirm）',
        '-- ② 再把邮箱填进 members 表指定角色：现在两个人权限完全一样，role 都填 admin',
        'create table if not exists public.members (',
        '  email        text primary key,',
        "  role         text not null default 'guest' check (role in ('guest','admin')),",
        '  display_name text,',
        '  created_at   timestamptz not null default now()',
        ');',
        'alter table public.members enable row level security;   -- 不建任何策略：只有后台能改',
        "insert into public.members (email, role, display_name) values ('dreemurrdawnlit@outlook.com', 'admin', '空曙') on conflict (email) do update set role = 'admin';",
        "-- 她的账号建好后，把下一行开头的 -- 去掉、邮箱改成她的，再执行一次：",
        "-- insert into public.members (email, role, display_name) values ('她的邮箱', 'admin', '她') on conflict (email) do update set role = 'admin';",
        'update public.members set email = lower(email);   -- 邮箱统一小写（Supabase 里就是小写）',
        '',
        'create or replace function public.my_profile() returns jsonb',
        'language sql stable security definer set search_path = public as $$',
        '  select jsonb_build_object(',
        "    'email', coalesce(auth.jwt() ->> 'email', ''),",
        "    'role', coalesce((select m.role from public.members m where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email',''))), 'none'),",
        "    'display_name', coalesce((select m.display_name from public.members m where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email',''))), '')",
        '  );',
        '$$;',
        'grant execute on function public.my_profile() to anon, authenticated;',
        '',
        'create or replace function public.is_admin() returns boolean',
        'language sql stable security definer set search_path = public as $$',
        "  select coalesce((select m.role from public.members m where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email',''))), 'none') = 'admin';",
        '$$;',
        'grant execute on function public.is_admin() to anon, authenticated;',
        '',
        'create or replace function public.is_member() returns boolean',
        'language sql stable security definer set search_path = public as $$',
        "  select coalesce((select m.role from public.members m where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email',''))), 'none') in ('guest','admin');",
        '$$;',
        'grant execute on function public.is_member() to anon, authenticated;',
        '',
        '-- ===== 内容表（日记 + 思辨）=====',
        'create table if not exists public.entries (',
        '  id         text primary key,',
        "  kind       text not null check (kind in ('journal','philosophy')),",
        '  date       text not null,',
        "  mood       text not null default '',",
        "  title      text not null default '',",
        '  content    text not null,',
        '  created_at timestamptz not null default now(),',
        '  updated_at timestamptz not null default now()',
        ');',
        'create index if not exists entries_kind_date_idx on public.entries (kind, date);',
        'alter table public.entries enable row level security;',
        'drop policy if exists entries_read on public.entries;',
        'drop policy if exists entries_admin_insert on public.entries;',
        'drop policy if exists entries_admin_update on public.entries;',
        'drop policy if exists entries_admin_delete on public.entries;',
        'create policy entries_read on public.entries for select to authenticated using (public.is_member());',
        'create policy entries_admin_insert on public.entries for insert to authenticated with check (public.is_admin());',
        'create policy entries_admin_update on public.entries for update to authenticated using (public.is_admin());',
        'create policy entries_admin_delete on public.entries for delete to authenticated using (public.is_admin());',
        '',
        '-- ===== 问卷表（设计问卷 + 作答，双方互看每题答案）=====',
        'create table if not exists public.surveys (',
        '  id          text primary key,',
        '  title       text not null,',
        "  description text not null default '',",
        "  created_by  text not null default '',",
        '  created_at  timestamptz not null default now()',
        ');',
        'alter table public.surveys enable row level security;',
        'drop policy if exists surveys_read   on public.surveys;',
        'drop policy if exists surveys_insert on public.surveys;',
        'drop policy if exists surveys_update on public.surveys;',
        'drop policy if exists surveys_delete on public.surveys;',
        'create policy surveys_read   on public.surveys for select to authenticated using (public.is_member());',
        'create policy surveys_insert on public.surveys for insert to authenticated with check (public.is_member());',
        'create policy surveys_update on public.surveys for update to authenticated using (public.is_member());',
        'create policy surveys_delete on public.surveys for delete to authenticated using (public.is_member());',
        '',
        'create table if not exists public.survey_questions (',
        '  id        bigint generated by default as identity primary key,',
        '  survey_id text not null references public.surveys(id) on delete cascade,',
        '  idx       int  not null default 0,',
        "  qtype     text not null default 'single' check (qtype in ('single','multi','text')),",
        '  prompt    text not null,',
        "  options   jsonb not null default '[]'::jsonb",
        ');',
        'alter table public.survey_questions enable row level security;',
        'drop policy if exists sq_read   on public.survey_questions;',
        'drop policy if exists sq_insert on public.survey_questions;',
        'drop policy if exists sq_update on public.survey_questions;',
        'drop policy if exists sq_delete on public.survey_questions;',
        'create policy sq_read   on public.survey_questions for select to authenticated using (public.is_member());',
        'create policy sq_insert on public.survey_questions for insert to authenticated with check (public.is_member());',
        'create policy sq_update on public.survey_questions for update to authenticated using (public.is_member());',
        'create policy sq_delete on public.survey_questions for delete to authenticated using (public.is_member());',
        '',
        '-- 每份问卷每人只有一份答卷（unique 约束），重复提交即覆盖更新',
        'create table if not exists public.survey_responses (',
        '  id              bigint generated by default as identity primary key,',
        '  survey_id       text not null references public.surveys(id) on delete cascade,',
        "  responder_email text not null,",
        "  answers         jsonb not null default '{}'::jsonb,",
        '  submitted_at    timestamptz not null default now(),',
        '  updated_at      timestamptz not null default now(),',
        '  unique (survey_id, responder_email)',
        ');',
        'alter table public.survey_responses enable row level security;',
        'drop policy if exists sr_read   on public.survey_responses;',
        'drop policy if exists sr_insert on public.survey_responses;',
        'drop policy if exists sr_update on public.survey_responses;',
        'drop policy if exists sr_delete on public.survey_responses;',
        'create policy sr_read   on public.survey_responses for select to authenticated using (public.is_member());',
        'create policy sr_insert on public.survey_responses for insert to authenticated with check (public.is_member());',
        'create policy sr_update on public.survey_responses for update to authenticated using (public.is_member());',
        'create policy sr_delete on public.survey_responses for delete to authenticated using (public.is_member());',
        '',
        '-- ===== 恋爱相册（photos）=====' ,
        '-- 图片本体存在 Supabase Storage 的公开桶 photos 里，表里只存 URL 和说明',
        'create table if not exists public.photos (',
        '  id         text primary key,',
        '  url        text not null,',
        "  caption    text not null default '',",
        "  date       text not null default '',",
        '  created_at timestamptz not null default now()',
        ');',
        'alter table public.photos enable row level security;',
        'drop policy if exists photos_read   on public.photos;',
        'drop policy if exists photos_insert on public.photos;',
        'drop policy if exists photos_update on public.photos;',
        'drop policy if exists photos_delete on public.photos;',
        'create policy photos_read   on public.photos for select to authenticated using (public.is_member());',
        'create policy photos_insert on public.photos for insert to authenticated with check (public.is_member());',
        'create policy photos_update on public.photos for update to authenticated using (public.is_member());',
        'create policy photos_delete on public.photos for delete to authenticated using (public.is_member());',
        '',
        '-- ===== 恋爱清单（wishlist）=====',
        'create table if not exists public.wishlist (',
        '  id         text primary key,',
        '  event      text not null,',
        "  note       text not null default '',",
        "  image_url  text not null default '',",
        '  done       boolean not null default false,',
        "  done_date  text not null default '',",
        '  created_at timestamptz not null default now(),',
        '  updated_at timestamptz not null default now()',
        ');',
        'alter table public.wishlist enable row level security;',
        'drop policy if exists wishlist_read   on public.wishlist;',
        'drop policy if exists wishlist_insert on public.wishlist;',
        'drop policy if exists wishlist_update on public.wishlist;',
        'drop policy if exists wishlist_delete on public.wishlist;',
        'create policy wishlist_read   on public.wishlist for select to authenticated using (public.is_member());',
        'create policy wishlist_insert on public.wishlist for insert to authenticated with check (public.is_member());',
        'create policy wishlist_update on public.wishlist for update to authenticated using (public.is_member());',
        'create policy wishlist_delete on public.wishlist for delete to authenticated using (public.is_member());',
        '',
        '-- ===== 恋爱相册的图片桶（Storage）=====',
        '-- 公开桶 photos：登录成员可以上传 / 改 / 删，任何人可以带链接访问图片',
        "insert into storage.buckets (id, name, public) values ('photos', 'photos', true)",
        'on conflict (id) do update set public = true;',
        'drop policy if exists photos_bucket_insert on storage.objects;',
        'drop policy if exists photos_bucket_update on storage.objects;',
        'drop policy if exists photos_bucket_delete on storage.objects;',
        'create policy photos_bucket_insert on storage.objects for insert to authenticated',
        "  with check (bucket_id = 'photos');",
        'create policy photos_bucket_update on storage.objects for update to authenticated',
        "  using (bucket_id = 'photos') with check (bucket_id = 'photos');",
        'create policy photos_bucket_delete on storage.objects for delete to authenticated',
        "  using (bucket_id = 'photos');",
        '',
        '-- ===== 情侣配置（site_config：站点名/两人名字/头像/纪念日等）=====',
        'create table if not exists public.site_config (',
        '  key   text primary key,',
        "  value text not null default ''",
        ');',
        'alter table public.site_config enable row level security;',
        'drop policy if exists site_config_read   on public.site_config;',
        'drop policy if exists site_config_write  on public.site_config;',
        'create policy site_config_read  on public.site_config for select to authenticated using (public.is_member());',
        'create policy site_config_write on public.site_config for insert to authenticated with check (public.is_member());',
        'create policy site_config_upd   on public.site_config for update to authenticated using (public.is_member());',
        "insert into public.site_config (key, value) values",
        "  ('site_title', '我们的小窝'),",
        "  ('slogan', '总有些惊奇的际遇 比方说当我遇见你'),",
        "  ('name_a', '他'),",
        "  ('name_b', '她'),",
        "  ('avatar_a', ''),",
        "  ('avatar_b', ''),",
        "  ('since', '2026-04-06')",
        'on conflict (key) do nothing;'
    ].join('\n');

    /* ====================== 2. 小工具 ====================== */

    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    const pad2 = n => String(n).padStart(2, '0');
    function todayStr(d) {
        const x = d || new Date();
        return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
    }
    function localIso(d) {
        const x = d || new Date();
        const off = -x.getTimezoneOffset();
        return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate()) + 'T' +
               pad2(x.getHours()) + ':' + pad2(x.getMinutes()) + ':' + pad2(x.getSeconds()) +
               (off >= 0 ? '+' : '-') + pad2(Math.floor(Math.abs(off) / 60)) + ':' + pad2(Math.abs(off) % 60);
    }
    const newId = (dateStr, prefix) => (prefix || 'e') + dateStr + '-' + Math.random().toString(36).slice(2, 7);
    function parseDate(iso) {
        if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
        const p = iso.split('-').map(Number);
        return new Date(p[0], p[1] - 1, p[2]);
    }
    function fmtDateShort(iso) {
        const d = parseDate(iso);
        if (!d) return iso || '';
        return (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + '日一二三四五六'[d.getDay()];
    }
    function fmtDate(iso) {
        const d = parseDate(iso);
        if (!d) return iso || '';
        return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + '日一二三四五六'[d.getDay()];
    }
    function relTime(iso) {
        if (!iso) return '';
        const t = Date.parse(iso);
        if (isNaN(t)) return '';
        const diff = Date.now() - t, day = 86400000;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
        if (diff < day) return Math.floor(diff / 3600000) + ' 小时前';
        if (diff < day * 30) return Math.floor(diff / day) + ' 天前';
        const d = new Date(t);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    function preview(text, n) {
        const flat = String(text || '').replace(/\s+/g, ' ').trim();
        const max = n || 46;
        return flat.length > max ? flat.slice(0, max) + '…' : flat;
    }
    function renderParagraphs(text) {
        if (!text || !text.trim()) return '<p style="color:var(--ink-3)">（空）</p>';
        const html = esc(text).split(/\n\s*\n/)
            .map(p => p.trim()).filter(p => p !== '')
            .map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
        return html || '<p style="color:var(--ink-3)">（空）</p>';
    }
    function tagColor(tag) {
        if (!tag) return '#70a9ff';
        const hit = MOODS.find(m => tag.indexOf(m.emoji) >= 0 || tag.indexOf(m.label) >= 0);
        if (hit) return hit.color;
        let h = 0;
        for (const ch of tag) h = (h * 31 + ch.codePointAt(0)) % 360;
        return 'hsl(' + h + ' 38% 52%)';
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

    /* ====================== 3. 通用 UI ====================== */

    function toast(msg, kind, ms) {
        const host = $('#toastHost');
        if (!host) { console.log('[toast]', msg); return; }
        const el = document.createElement('div');
        el.className = 'toast' + (kind ? ' ' + kind : '');
        el.textContent = msg;
        host.appendChild(el);
        setTimeout(() => el.remove(), ms || 2800);
    }
    function openMask(id) { const m = $('#' + id); if (m) m.classList.add('show'); }
    function closeMask(id) { const m = $('#' + id); if (m) m.classList.remove('show'); }
    function askConfirm(opt) {
        const o = opt || {};
        return new Promise(resolve => {
            $('#confirmTitle').textContent = o.title || '确认操作';
            $('#confirmText').textContent = o.text || '';
            const okBtn = $('#confirmOk');
            okBtn.textContent = o.ok || '确定';
            okBtn.style.background = o.danger ? 'linear-gradient(180deg,var(--danger),#8f3c28)' : '';
            const mask = $('#confirmMask');
            const done = val => {
                mask.classList.remove('show');
                okBtn.removeEventListener('click', onOk);
                mask.removeEventListener('click', onClick);
                resolve(val);
            };
            const onOk = () => done(true);
            const onClick = e => { if (e.target === mask || e.target.closest('[data-close]')) done(false); };
            okBtn.addEventListener('click', onOk);
            mask.addEventListener('click', onClick);
            mask.classList.add('show');
        });
    }

    /* ====================== 4. 应用 ====================== */

    function init(cfg) {
        const labels = Object.assign({
            itemName: '记录', unit: '条', newItem: '新建', editItem: '编辑',
            countLabel: '📓 记录条数', spanLabel: '🕰 记录跨度',
            charsLabel: '✍️ 累计字数', latestLabel: '🕒 最新一篇',
            emptyText: '还没有任何记录', notFoundText: '没有匹配的记录',
            idPrefix: 'e', kind: 'journal'
        }, cfg.labels || {});
        const KIND = labels.kind;
        // 多类型合并：cfg.kinds 传 ['journal','philosophy'] 时，一页加载两种类型
        const KINDS = (cfg.kinds && cfg.kinds.length ? cfg.kinds : [KIND]);
        const kindLabel = k => (cfg.kindLabels && cfg.kindLabels[k]) || (k === 'philosophy' ? '思辨话题' : '日常想法');

        const state = {
            sb: Object.assign({}, SB_DEFAULT, cfg.sb || {}),
            me: null,                    // { email, role, display_name }
            session: { accessToken: '', refreshToken: '', expiresAt: 0 },
            entries: [],
            gate: 'loading',             // loading | login | denied | ok
            query: '', activeYear: 'all', activeTag: 'all', sort: 'desc',
            editingId: null,
            openIds: new Set()
        };

        const fieldKey = (cfg.field && cfg.field.key) || null;
        const tagOf = cfg.tagOf || null;
        let cmt = null; /* 留言模块已按计划移除 */

        // 整站只有两个账号，权限完全一致：都是「成员」，看、写、进后台都行
        const isAdmin = () => !!(state.me && state.me.role !== 'none');
        const isMember = () => !!(state.me && state.me.role !== 'none');

        /* ---------- Supabase REST ---------- */
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
                headers: Object.assign(sbHeaders(), o.headers || {}, o.body ? { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' } : {}),
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

        async function ensureFreshToken() {
            if (!state.session.accessToken) return;
            if (Date.now() < (state.session.expiresAt || 0) - 120000) return;
            if (!state.session.refreshToken) return;
            try {
                saveSession(await sbAuth('refresh_token', { refresh_token: state.session.refreshToken }));
            } catch (e) {
                console.warn('会话刷新失败，需要重新登录', e);
                clearSession();
            }
        }
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
        function clearSession() {
            state.session = { accessToken: '', refreshToken: '', expiresAt: 0 };
            state.me = null;
            storeSet(K.session, null);
        }
        async function signIn(email, password) {
            saveSession(await sbAuth('password', { email: email, password: password }));
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

        /* ---------- 内容数据 ---------- */
        function normalize(row) {
            const out = {
                id: String(row.id),
                kind: String(row.kind || KIND),
                date: String(row.date || todayStr()),
                content: String(row.content || '')
            };
            if (fieldKey) out[fieldKey] = String(row[fieldKey] || '');
            if (row.created_at) out.createdAt = row.created_at;
            if (row.updated_at) out.updatedAt = row.updated_at;
            return out;
        }
        function toRow(entry) {
            const row = {
                id: entry.id,
                kind: entry.kind || KIND,
                date: entry.date,
                content: entry.content,
                mood: '',
                title: '',
                updated_at: new Date().toISOString()
            };
            if (fieldKey === 'mood') row.mood = entry.mood || '';
            if (fieldKey === 'title') row.title = entry.title || '';
            return row;
        }

        async function loadEntries() {
            if (!isMember()) { state.entries = []; return; }
            const rows = await sbRest('entries?kind=in.(' + KINDS.map(encodeURIComponent).join(',') + ')&select=*&order=date.asc');
            state.entries = (rows || []).map(normalize);
        }
        async function saveEntry(data) {
            const isNew = !state.editingId;
            const id = isNew ? newId(data.date, labels.idPrefix) : state.editingId;
            const row = toRow(Object.assign({}, data, { id: id }));
            if (isNew) {
                row.created_at = new Date().toISOString();
                await sbRest('entries', { method: 'POST', body: row });
                state.entries.push(normalize(row));
            } else {
                await sbRest('entries?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: row });
                const i = state.entries.findIndex(e => e.id === id);
                if (i >= 0) state.entries[i] = normalize(row);
            }
            renderAll();
        }
        async function deleteEntry(id) {
            const entry = state.entries.find(e => e.id === id);
            if (!entry) return;
            const ok = await askConfirm({
                title: '删除这条' + labels.itemName + '？',
                text: fmtDate(entry.date) + '\n\n' + preview(entry.content, 60) + '\n\n删除后无法恢复。',
                ok: '删除', danger: true
            });
            if (!ok) return;
            await sbRest('entries?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
            state.entries = state.entries.filter(e => e.id !== id);
            renderAll();
            toast('已删除 🗑', 'ok');
        }

        /* ---------- 渲染 ---------- */
        function yearList() {
            return Array.from(new Set(state.entries.map(e => String(e.date || '').slice(0, 4)).filter(Boolean)))
                .sort((a, b) => b.localeCompare(a));
        }
        function filtered() {
            const q = state.query.trim().toLowerCase();
            let list = state.entries.slice();
            if (state.activeYear !== 'all') list = list.filter(e => String(e.date || '').indexOf(state.activeYear) === 0);
            if (tagOf && state.activeTag !== 'all') {
                list = state.activeTag === '' ? list.filter(e => !tagOf(e)) : list.filter(e => tagOf(e) === state.activeTag);
            }
            if (q) {
                list = list.filter(e => {
                    const extra = cfg.searchExtra ? cfg.searchExtra(e).join(' ') : '';
                    return (e.content || '').toLowerCase().indexOf(q) >= 0 ||
                           String(e.date || '').indexOf(q) >= 0 ||
                           extra.toLowerCase().indexOf(q) >= 0;
                });
            }
            return list.sort((a, b) => state.sort === 'desc'
                ? b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))
                : a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
        }

        function renderGate() {
            const host = $('#gateHost');
            const rest = ['#statsHost', '#toolbarHost', '#timelineHost'];
            if (state.gate === 'ok') {
                host.hidden = true; host.innerHTML = '';
                rest.forEach(s => { const el = $(s); if (el) el.hidden = false; });
                const fab = $('#fab');
                if (fab) fab.hidden = !isAdmin();
                return;
            }
            rest.forEach(s => { const el = $(s); if (el) el.hidden = true; });
            const fab = $('#fab');
            if (fab) fab.hidden = true;
            // 登出后不要把这些内容留在 DOM 里（哪怕只是藏起来）
            const tl = $('#timelineHost'); if (tl) tl.innerHTML = '';
            const st = $('#statsHost'); if (st) st.innerHTML = '';
            const ml = $('#metaLine'); if (ml) ml.innerHTML = '';
            host.hidden = false;
            if (state.gate === 'loading') {
                host.innerHTML = '<div class="gate"><div class="spin" style="width:22px;height:22px;border-width:3px"></div>'
                    + '<h2>正在检查登录状态…</h2></div>';
                return;
            }
            if (state.gate === 'denied') {
                host.innerHTML = '<div class="gate"><div class="gate-icon">🚫</div>'
                    + '<h2>这个账号还没有权限</h2>'
                    + '<p>你登录的邮箱是 <b>' + esc(state.me && state.me.email) + '</b>，但它不在授权名单里。<br>'
                    + '把邮箱加进 <code>members</code> 表（role 填 <code>admin</code>，你们俩权限完全一样）即可。</p>'
                    + '<button class="btn" id="gateSignOut">换成别的账号</button></div>';
                const out = $('#gateSignOut');
                if (out) out.addEventListener('click', () => { clearSession(); boot().then(renderAll); });
                return;
            }
            host.innerHTML = '<div class="gate"><div class="gate-icon">🔒</div>'
                + '<h2>这一页需要账号才能看</h2>'
                + '<p>没有账号的话，这里什么都不会显示 —— 现在整站都是私人领域。<br>'
                + '账号一共只有两个。登录后你们俩权限完全一样：<b>看内容、写内容、出问卷、进后台</b>。</p>'
                + '<button class="btn primary" id="gateLogin">🔑 登录</button></div>';
            const btn = $('#gateLogin');
            if (btn) btn.addEventListener('click', openAuth);
        }

        function renderStats() {
            const total = state.entries.length;
            const chars = state.entries.reduce((s, e) => s + (e.content || '').length, 0);
            const sorted = state.entries.slice().sort((a, b) => a.date.localeCompare(b.date));
            const first = sorted.length ? sorted[0].date : '', last = sorted.length ? sorted[sorted.length - 1].date : '';
            const d1 = parseDate(first), d2 = parseDate(last);
            const span = (d1 && d2) ? Math.max(1, Math.round((d2 - d1) / 86400000)) : 0;
            $('#statsHost').innerHTML =
                '<div class="stat"><div class="k">' + esc(labels.countLabel) + '</div><div class="v">' + total + '<small>' + esc(labels.unit) + '</small></div></div>' +
                '<div class="stat"><div class="k">' + esc(labels.spanLabel) + '</div><div class="v">' + span + '<small>天</small></div></div>' +
                '<div class="stat"><div class="k">' + esc(labels.charsLabel) + '</div><div class="v">' + chars.toLocaleString() + '<small>字</small></div></div>' +
                '<div class="stat"><div class="k">' + esc(labels.latestLabel) + '</div><div class="v" style="font-size:.98rem">' + (last ? esc(last) : '—') + '</div></div>';
        }

        function renderChips() {
            const host = $('#tagChips');
            if (!host || !tagOf) return;
            const counts = new Map();
            state.entries.forEach(e => { const t = tagOf(e); counts.set(t, (counts.get(t) || 0) + 1); });
            const parts = ['<span class="chip' + (state.activeTag === 'all' ? ' on' : '') + '" data-tag="all">' +
                '<span class="dot-sm" style="--c:#70a9ff"></span>全部 <span class="count">' + state.entries.length + '</span></span>'];
            Array.from(counts.entries()).filter(p => p[0] !== '').sort((a, b) => b[1] - a[1]).forEach(p => {
                parts.push('<span class="chip' + (state.activeTag === p[0] ? ' on' : '') + '" data-tag="' + esc(p[0]) + '">' +
                    '<span class="dot-sm" style="--c:' + tagColor(p[0]) + '"></span>' + esc(p[0]) +
                    ' <span class="count">' + p[1] + '</span></span>');
            });
            if (counts.has('')) {
                parts.push('<span class="chip' + (state.activeTag === '' ? ' on' : '') + '" data-tag="">' +
                    '<span class="dot-sm" style="--c:#9b8465"></span>' + esc(cfg.tagNoneLabel || '未标注') +
                    ' <span class="count">' + counts.get('') + '</span></span>');
            }
            host.innerHTML = parts.join('');
            $$('.chip', host).forEach(chip => chip.addEventListener('click', () => {
                state.activeTag = chip.dataset.tag;
                renderChips(); renderList();
            }));
        }

        function renderYearPicker() {
            const sel = $('#yearPicker');
            if (!sel) return;
            const years = yearList();
            sel.innerHTML = '<option value="all">全部年份</option>' + years.map(y => '<option value="' + y + '">' + y + ' 年</option>').join('');
            sel.value = (state.activeYear === 'all' || years.indexOf(state.activeYear) >= 0) ? state.activeYear : 'all';
        }

        function itemLabelOf(e) {
            const t = cfg.cardTitle ? cfg.cardTitle(e) : '';
            return fmtDate(e.date) + (t ? ' · 《' + t + '》' : '') + '（' + e.date + ' / ' + e.id + '）';
        }

        function cardHtml(e) {
            const long = (e.content || '').length > 170;
            const title = cfg.cardTitle ? cfg.cardTitle(e) : '';
            const tag = tagOf ? tagOf(e) : '';
            const tags = [];
            if (e.updatedAt) tags.push('<span class="tag">已编辑 · ' + esc(relTime(e.updatedAt)) + '</span>');
            return '' +
            '<article class="entry clamp anim-in" data-id="' + esc(e.id) + '" style="--tag:' + (tagOf ? tagColor(tag) : '#70a9ff') + '">' +
                '<span class="rail-dot"></span>' +
                '<div class="card">' +
                    '<div class="card-head">' +
                        (title ? '<span class="item-title">' + esc(title) + '</span>' : '') +
                        '<span class="date-main">' + esc(fmtDateShort(e.date)) + '</span>' +
                        '<span class="date-sub">' + esc(e.date) + '</span>' +
                        (tagOf ? (tag ? '<span class="tag-chip">' + esc(tag) + '</span>'
                                      : '<span class="tag-chip empty">🕰️ ' + esc(cfg.tagNoneLabel || '未标注') + '</span>') : '') +
                        tags.join('') +
                        '<span class="head-right">' +
                            (isAdmin()
                                ? '<span class="card-actions">' +
                                      '<button class="icon-btn act-edit" title="编辑这条">✎</button>' +
                                      '<button class="icon-btn danger act-del" title="删除这条">🗑</button>' +
                                  '</span>'
                                : '') +
                            '<span class="chev">▾</span>' +
                        '</span>' +
                    '</div>' +
                    '<div class="card-body"><div class="inner"><div class="body-pad">' +
                        '<div class="prose">' + renderParagraphs(e.content) + '</div>' +
                        (long ? '<button class="expand-btn">展开全文 <span>▾</span></button>' : '') +
                    '</div></div></div>' +
                '</div>' +
            '</article>';
        }

        function refreshExpand(node) {
            const btn = $('.expand-btn', node);
            if (btn) btn.innerHTML = node.classList.contains('open') ? '收起 <span>▴</span>' : '展开全文 <span>▾</span>';
            node.classList.toggle('clamp', !node.classList.contains('open'));
        }

        function renderList() {
            const host = $('#timelineHost');
            if (!host) return;
            const list = filtered();
            const meta = $('#metaLine');
            if (meta) {
                meta.innerHTML = list.length
                    ? '共 <b>' + state.entries.length + '</b> ' + esc(labels.unit) + ' · 当前显示 <b>' + list.length + '</b> ' + esc(labels.unit) +
                      ' · 账号：<b>' + esc(state.me ? (state.me.display_name || '成员') : '') + '</b>'
                    : '<span>' + esc(labels.emptyText) + '</span>';
            }
            if (!list.length) {
                host.innerHTML = '<div class="empty-state">📭 ' + esc(labels.notFoundText) + '</div>';
                return;
            }
            const byYear = new Map();
            list.forEach(e => {
                const y = String(e.date || '').slice(0, 4) || '未知';
                if (!byYear.has(y)) byYear.set(y, []);
                byYear.get(y).push(e);
            });
            const blocks = [];
            byYear.forEach((items, year) => {
                blocks.push('<section class="year-block">' +
                    '<div class="year-head"><span>' + esc(year) + '</span><span class="y-count">' + items.length + ' ' + esc(labels.unit) + '</span></div>' +
                    '<div class="entries">' + items.map(cardHtml).join('') + '</div></section>');
            });
            host.innerHTML = blocks.join('');

            $$('.entry', host).forEach(node => {
                const id = node.dataset.id;
                $('.card-head', node).addEventListener('click', ev => {
                    if (ev.target.closest('.icon-btn')) return;
                    node.classList.toggle('open');
                    if (node.classList.contains('open')) state.openIds.add(id); else state.openIds.delete(id);
                    refreshExpand(node);
                });
                const toggle = $('.expand-btn', node);
                if (toggle) toggle.addEventListener('click', ev => {
                    ev.stopPropagation();
                    node.classList.toggle('open');
                    if (node.classList.contains('open')) state.openIds.add(id); else state.openIds.delete(id);
                    refreshExpand(node);
                });
                const ed = $('.act-edit', node);
                if (ed) ed.addEventListener('click', ev => { ev.stopPropagation(); openEditor(id); });
                const del = $('.act-del', node);
                if (del) del.addEventListener('click', ev => { ev.stopPropagation(); deleteEntry(id); });
                if (state.openIds.has(id)) { node.classList.add('open'); refreshExpand(node); }
            });
        }

        function renderAccount() {
            const btn = $('#lockBtn');
            if (btn) {
                const on = !!state.me;
                btn.innerHTML = on
                    ? ('👤 ' + esc((state.me.display_name || (state.me.email || '').split('@')[0] || '成员')))
                    : '🔑 登录';
                btn.classList.toggle('primary', !on);
                btn.title = on ? (state.me.email + '（点开更多）') : '登录后可见内容';
            }
            const box = $('#dataInfoBox');
            if (box) {
                box.innerHTML = state.me
                    ? '账号：<b>' + esc(state.me.display_name || state.me.email) + '</b><br>' +
                      '邮箱：<code>' + esc(state.me.email) + '</code><br>' +
                      '角色：<b>成员（可读可写）</b><br>' +
                      '数据：Supabase · entries 表'
                    : '当前未登录。';
            }
            [['menuExport', true], ['menuImport', true]].forEach(pair => {
                const el = $('#' + pair[0]);
                if (el) { el.disabled = !isAdmin(); el.hidden = !isAdmin(); }
            });
            const out = $('#menuSignOut');
            if (out) out.hidden = !state.me;
            const login = $('#menuSignIn');
            if (login) login.hidden = !!state.me;
        }

        function renderAll() {
            renderGate();
            if (state.gate === 'ok') {
                renderStats();
                renderYearPicker();
                renderChips();
                renderList();
            }
            renderAccount();
        }

        /* ---------- 登录 / 退出 ---------- */
        function openAuth() {
            $('#authEmail').value = state.session.email || '';
            $('#authPass').value = '';
            $('#authError').textContent = '';
            openMask('authMask');
            setTimeout(() => $('#authEmail').focus(), 60);
        }
        async function doLogin() {
            const email = $('#authEmail').value.trim();
            const pass = $('#authPass').value;
            if (!email || !pass) { $('#authError').textContent = '邮箱和密码都要填'; return; }
            const btn = $('#authSubmit');
            const old = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 登录中…';
            $('#authError').textContent = '';
            try {
                await signIn(email, pass);
                closeMask('authMask');
                await boot();
                toast('登录成功 ✨', 'ok');
            } catch (e) {
                $('#authError').textContent = '❌ ' + e.message;
            } finally {
                btn.disabled = false; btn.innerHTML = old;
            }
        }
        async function signOutAndLock() {
            clearSession();
            state.gate = 'login';
            state.entries = [];
            renderAll();
            toast('已退出登录 🔒');
        }

        /* ---------- 编辑器（仅管理员） ---------- */
        function renderPresets() {
            const host = $('#editorPresets');
            if (!host || !cfg.field || !cfg.field.presets) return;
            const current = $('#editorField').value.trim();
            host.innerHTML = cfg.field.presets.map(m => {
                const value = m.emoji + ' ' + m.label;
                return '<span class="chip' + (current === value ? ' on' : '') + '" data-value="' + esc(value) + '" style="--c:' + m.color + '">' +
                    '<span class="dot-sm"></span>' + esc(value) + '</span>';
            }).join('') + '<span class="chip" data-clear="1">✕ 清除</span>';
            $$('.chip', host).forEach(chip => chip.addEventListener('click', () => {
                $('#editorField').value = chip.dataset.clear ? '' : chip.dataset.value;
                renderPresets();
            }));
        }
        function openEditor(id) {
            if (!isAdmin()) { toast('只有管理员能编辑 🔒', 'err'); return; }
            state.editingId = id || null;
            const entry = id ? state.entries.find(e => e.id === id) : null;
            $('#editorTitle').textContent = entry ? '✎ ' + labels.editItem : '✎ ' + labels.newItem;
            $('#editorDate').value = entry ? entry.date : todayStr();
            $('#editorContent').value = entry ? entry.content : '';
            const kindWrap = $('#editorKindWrap');
            if (KINDS.length > 1) {
                kindWrap.hidden = false;
                const cur = entry ? entry.kind : KIND;
                $('#editorKind').innerHTML = KINDS.map(k =>
                    '<option value="' + esc(k) + '"' + (k === cur ? ' selected' : '') + '>' + esc(kindLabel(k)) + '</option>').join('');
            } else {
                kindWrap.hidden = true;
            }
            const wrap = $('#editorFieldWrap');
            if (cfg.field) {
                wrap.hidden = false;
                $('#editorFieldLabel').innerHTML = esc(cfg.field.label) +
                    (cfg.field.hint ? ' <span class="hint">' + esc(cfg.field.hint) + '</span>' : '');
                $('#editorField').placeholder = cfg.field.placeholder || '';
                $('#editorField').value = entry ? (entry[cfg.field.key] || '') : '';
                $('#editorPresets').hidden = cfg.field.type !== 'chips';
                renderPresets();
            } else {
                wrap.hidden = true;
                $('#editorPresets').hidden = true;
            }
            $('#editorDelete').hidden = !entry;
            $('#editorPreview').hidden = true;
            $('#editorContent').hidden = false;
            $('#tabWrite').classList.add('on');
            $('#tabPreview').classList.remove('on');
            $('#charCount').textContent = $('#editorContent').value.length + ' 字';
            openMask('editorMask');
            setTimeout(() => $('#editorContent').focus(), 80);
        }
        async function submitEditor() {
            const date = $('#editorDate').value || todayStr();
            const content = $('#editorContent').value.trim();
            const data = { date: date, content: content };
            if (KINDS.length > 1) data.kind = $('#editorKind').value;
            if (cfg.field) data[cfg.field.key] = $('#editorField').value.trim();
            if (!content) { toast('正文还是空的，先写点什么吧 📝', 'err'); return; }
            if (!parseDate(date)) { toast('请选择一个有效日期 📅', 'err'); return; }
            if (cfg.field && cfg.field.required && !data[cfg.field.key]) { toast('「' + cfg.field.label + '」还没填 ✍️', 'err'); return; }
            const btn = $('#editorSave');
            const old = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 保存中…';
            try {
                await saveEntry(data);
                closeMask('editorMask');
                toast('已保存到数据库 ✓', 'ok');
            } catch (e) {
                toast('保存失败：' + e.message, 'err', 6000);
            } finally {
                btn.disabled = false; btn.innerHTML = old;
            }
        }

        /* ---------- 导入 / 导出 ---------- */
        function exportJson() {
            if (!isAdmin()) { toast('只有管理员能导出 🔒', 'err'); return; }
            const payload = {
                version: 1, kinds: KINDS, updatedAt: localIso(),
                entries: state.entries.map(e => { const c = Object.assign({}, e); delete c.createdAt; delete c.updatedAt; return c; })
            };
            const blob = new Blob([JSON.stringify(payload, null, 4) + '\n'], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = KIND + '-backup-' + todayStr() + '.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            toast('已导出备份 ⬇️', 'ok');
        }
        async function importJson(file) {
            if (!isAdmin()) { toast('只有管理员能导入 🔒', 'err'); return; }
            try {
                const data = JSON.parse(await file.text());
                const rows = (data.entries || []).map(e => toRow({
                    id: e.id || newId(e.date || todayStr(), labels.idPrefix),
                    date: e.date, content: e.content,
                    mood: e.mood || '', title: e.title || ''
                }));
                if (!rows.length) throw new Error('文件里没有 entries');
                await sbRest('entries', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates' }, body: rows });
                await loadEntries();
                renderAll();
                toast('导入完成：' + rows.length + ' 条', 'ok');
            } catch (e) {
                toast('导入失败：' + e.message, 'err', 6000);
            }
        }

        /* ---------- 弹窗骨架 ---------- */
        function injectChrome() {
            const host = document.createElement('div');
            host.innerHTML = `
<div class="mask" id="authMask">
    <div class="modal narrow">
        <div class="modal-head"><h3>🔑 登录</h3><button class="x" data-close="authMask">✕</button></div>
        <div class="modal-body">
            <div class="notice">这里的账号由空曙在 Supabase 后台创建，一共只有两个。登录后你们俩权限完全一样：<b>看内容、写内容、出问卷、进后台</b>。没有账号就什么也看不到。</div>
            <div class="field" style="margin-top:15px"><label>邮箱</label>
                <input class="input" type="email" id="authEmail" placeholder="you@example.com" autocomplete="username"></div>
            <div class="field"><label>密码</label>
                <input class="input" type="password" id="authPass" placeholder="••••••••" autocomplete="current-password"></div>
            <div id="authError" style="min-height:20px;font-size:.8rem;color:var(--danger)"></div>
        </div>
        <div class="modal-foot">
            <button class="btn" data-close="authMask">取消</button>
            <button class="btn primary" id="authSubmit">登录</button>
        </div>
    </div>
</div>

<div class="mask" id="editorMask">
    <div class="modal wide">
        <div class="modal-head"><h3 id="editorTitle">✎ 编辑</h3><button class="x" data-close="editorMask">✕</button></div>
        <div class="modal-body">
            <div class="row-inline">
                <div class="field" style="flex:1 1 170px"><label>日期</label>
                    <input class="input" type="date" id="editorDate"></div>
                <div class="field" style="flex:1 1 170px" id="editorKindWrap" hidden>
                    <label>类型</label>
                    <select class="input" id="editorKind"></select></div>
                <div class="field" style="flex:2 1 250px" id="editorFieldWrap" hidden>
                    <label id="editorFieldLabel">字段</label>
                    <input class="input" type="text" id="editorField" autocomplete="off"></div>
            </div>
            <div class="chip-row" id="editorPresets" style="margin:-4px 0 14px" hidden></div>
            <div class="field" style="margin-bottom:8px">
                <div class="tabs">
                    <button class="tab on" id="tabWrite">✍️ 正文</button>
                    <button class="tab" id="tabPreview">👀 预览</button>
                    <span class="editor-tools" style="margin-left:auto">
                        <span id="charCount">0 字</span><span>·</span><span>空一行自动分段</span>
                        <span>·</span><span><span class="kbd">Ctrl</span> + <span class="kbd">Enter</span> 保存</span>
                    </span>
                </div>
                <textarea class="textarea" id="editorContent" placeholder="正文…"></textarea>
                <div class="preview-box prose" id="editorPreview" hidden></div>
            </div>
        </div>
        <div class="modal-foot">
            <button class="btn danger" id="editorDelete" hidden>🗑 删除这条</button>
            <span style="flex:1"></span>
            <button class="btn" data-close="editorMask">取消</button>
            <button class="btn primary" id="editorSave">保存</button>
        </div>
    </div>
</div>

<div class="mask" id="settingsMask">
    <div class="modal wide">
        <div class="modal-head"><h3>⚙️ 后台说明</h3><button class="x" data-close="settingsMask">✕</button></div>
        <div class="modal-body">
            <div class="notice">
                <b>数据全在 Supabase</b>，权限靠账号 + 行级安全策略：<br>
                · <b>没账号</b>：什么都看不到，整站都是私人领域<br>
                · <b>成员</b>：两个人权限完全一样 —— 看内容、写内容、出问卷、进后台<br>
                · 新账号：先在 Authentication → Users 里建号，再把邮箱加进 <code>members</code> 表<br>
            </div>
            <div class="notice" style="margin-top:12px">
                <b>怎么加账号：</b><br>
                ① Supabase → Authentication → Users → Add user（邮箱 + 密码，勾 Auto Confirm）<br>
                ② Supabase → Table Editor → <code>members</code> → 插入一行：<code>email</code> 填刚建的邮箱，
                <code>role</code> 填 <code>admin</code>（两个人权限完全一样），<code>display_name</code> 填称呼<br>
                ③ 让对方用那个邮箱密码登录即可
            </div>
            <div class="row-inline" style="margin-top:14px">
                <div class="field" style="flex:1 1 260px"><label>Supabase URL</label>
                    <input class="input" id="sbUrl"></div>
                <div class="field" style="flex:1 1 260px"><label>anon public key</label>
                    <input class="input" id="sbKey"></div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn sm" id="sbSave">保存连接设置</button>
                <button class="btn sm" id="sbCopySql">📋 复制初始化 SQL</button>
                <button class="btn sm" id="sbCopySeed">📋 复制数据迁移 SQL</button>
            </div>
            <div id="sbStatus" style="min-height:22px;font-size:.8rem;margin-top:10px;line-height:1.7"></div>
        </div>
    </div>
</div>

<div class="mask" id="menuMask">
    <div class="modal narrow">
        <div class="modal-head"><h3>⋯ 更多</h3><button class="x" data-close="menuMask">✕</button></div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:9px">
            <button class="btn menu-item" id="menuSignIn">🔑 登录</button>
            <button class="btn menu-item" id="menuExport">⬇️ 导出全部数据（JSON 备份）</button>
            <button class="btn menu-item" id="menuImport">⬆️ 从 JSON 备份导入</button>
            <button class="btn menu-item" id="menuRefresh">🔁 重新加载数据</button>
            <button class="btn menu-item" id="menuSetup">⚙️ 后台说明 / 加账号</button>
            <button class="btn menu-item" id="menuSignOut">🚪 退出登录</button>
            <input type="file" id="importFile" accept=".json,application/json" hidden>
            <div class="notice" style="margin-top:4px;line-height:1.9" id="dataInfoBox"></div>
        </div>
    </div>
</div>

<div class="mask" id="confirmMask">
    <div class="modal narrow" style="max-width:410px">
        <div class="modal-head"><h3 id="confirmTitle">确认</h3><button class="x" data-close="confirmMask">✕</button></div>
        <div class="modal-body"><p id="confirmText" style="margin:0;font-size:.88rem;line-height:1.85;color:var(--ink-2);white-space:pre-wrap"></p></div>
        <div class="modal-foot">
            <button class="btn" data-close="confirmMask">取消</button>
            <button class="btn primary" id="confirmOk">确定</button>
        </div>
    </div>
</div>

<button class="fab" id="fab" title="${esc(labels.newItem)}" hidden>＋</button>
<div class="toast-host" id="toastHost"></div>`;
            while (host.firstChild) document.body.appendChild(host.firstChild);

            // 登录门：插在统计上面
            const main = document.querySelector('main.wrap');
            const gate = document.createElement('section');
            gate.className = 'gate-host';
            gate.id = 'gateHost';
            gate.hidden = true;
            const anchor = document.querySelector('.hero');
            if (main) main.insertBefore(gate, anchor ? anchor.nextSibling : main.firstChild);
        }

        /* ---------- 事件 ---------- */
        function bind() {
            document.addEventListener('click', e => {
                const t = e.target.closest('[data-close]');
                if (t) closeMask(t.dataset.close);
            });
            $$('.mask').forEach(mask => mask.addEventListener('mousedown', e => { if (e.target === mask) mask.classList.remove('show'); }));

            $('#authSubmit').addEventListener('click', doLogin);
            $('#authPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
            $('#authEmail').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
            const lockBtn = $('#lockBtn');
            if (lockBtn) lockBtn.addEventListener('click', () => {
                if (state.me) { renderAccount(); openMask('menuMask'); } else openAuth();
            });
            if ($('#menuSignIn')) $('#menuSignIn').addEventListener('click', () => { closeMask('menuMask'); openAuth(); });
            if ($('#menuSignOut')) $('#menuSignOut').addEventListener('click', () => { closeMask('menuMask'); signOutAndLock(); });
            if ($('#menuSetup')) $('#menuSetup').addEventListener('click', () => { closeMask('menuMask'); openSettings(); });
            if ($('#menuRefresh')) $('#menuRefresh').addEventListener('click', async () => {
                closeMask('menuMask');
                toast('正在重新加载…');
                await boot();
                toast('已刷新 ✓', 'ok');
            });
            if ($('#menuExport')) $('#menuExport').addEventListener('click', exportJson);
            if ($('#menuImport')) $('#menuImport').addEventListener('click', () => $('#importFile').click());
            $('#importFile').addEventListener('change', e => {
                const f = e.target.files && e.target.files[0];
                if (f) importJson(f);
                e.target.value = '';
            });
            if ($('#settingsBtn')) $('#settingsBtn').addEventListener('click', openSettings);
            if ($('#menuBtn')) $('#menuBtn').addEventListener('click', () => { renderAccount(); openMask('menuMask'); });

            const search = $('#searchInput');
            if (search) search.addEventListener('input', e => {
                state.query = e.target.value;
                if ($('#searchClear')) $('#searchClear').hidden = !state.query;
                renderList();
            });
            if ($('#searchClear')) $('#searchClear').addEventListener('click', () => {
                state.query = ''; $('#searchInput').value = ''; $('#searchClear').hidden = true; renderList();
            });
            if ($('#yearPicker')) $('#yearPicker').addEventListener('change', e => { state.activeYear = e.target.value; renderList(); });
            if ($('#sortPicker')) $('#sortPicker').addEventListener('change', e => { state.sort = e.target.value; renderList(); });
            if ($('#resetBtn')) $('#resetBtn').addEventListener('click', () => {
                state.query = ''; state.activeYear = 'all'; state.activeTag = 'all'; state.sort = 'desc';
                if ($('#searchInput')) $('#searchInput').value = '';
                if ($('#searchClear')) $('#searchClear').hidden = true;
                if ($('#yearPicker')) $('#yearPicker').value = 'all';
                if ($('#sortPicker')) $('#sortPicker').value = 'desc';
                renderChips(); renderList();
            });

            if ($('#fab')) $('#fab').addEventListener('click', () => openEditor(null));
            $('#editorContent').addEventListener('input', () => {
                $('#charCount').textContent = $('#editorContent').value.length + ' 字';
                if (!$('#editorPreview').hidden) $('#editorPreview').innerHTML = renderParagraphs($('#editorContent').value);
            });
            if (cfg.field && cfg.field.type === 'chips') $('#editorField').addEventListener('input', renderPresets);
            $('#tabWrite').addEventListener('click', () => {
                $('#tabWrite').classList.add('on'); $('#tabPreview').classList.remove('on');
                $('#editorPreview').hidden = true; $('#editorContent').hidden = false;
            });
            $('#tabPreview').addEventListener('click', () => {
                $('#tabPreview').classList.add('on'); $('#tabWrite').classList.remove('on');
                $('#editorPreview').innerHTML = renderParagraphs($('#editorContent').value);
                $('#editorPreview').hidden = false; $('#editorContent').hidden = true;
            });
            $('#editorSave').addEventListener('click', submitEditor);
            $('#editorDelete').addEventListener('click', async () => {
                const id = state.editingId;
                closeMask('editorMask');
                if (id) { try { await deleteEntry(id); } catch (e) { toast(e.message, 'err'); } }
            });
            document.addEventListener('keydown', e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && $('#editorMask').classList.contains('show')) {
                    e.preventDefault();
                    $('#editorSave').click();
                }
                if (e.key === 'Escape') $$('.mask.show').forEach(m => m.classList.remove('show'));
            });
        }

        function openSettings() {
            $('#sbUrl').value = state.sb.url || '';
            $('#sbKey').value = state.sb.anonKey || '';
            $('#sbStatus').textContent = '';
            openMask('settingsMask');
        }

        /* ---------- 启动 ---------- */
        async function boot() {
            document.documentElement.dataset.theme = 'day'; /* LikeGirl 亮色风格，夜读模式已移除 */

            const savedSb = storeGet(K.sb, null);
            if (savedSb && savedSb.url && savedSb.anonKey) state.sb = savedSb;

            const saved = storeGet(K.session, null);
            if (saved && saved.accessToken) state.session = saved;

            state.gate = 'loading';
            renderAll();

            if (!state.session.accessToken) {
                state.gate = 'login';
                renderAll();
                return;
            }
            try {
                await ensureFreshToken();
                await loadProfile();
                if (!isMember()) { state.gate = 'denied'; state.entries = []; renderAll(); return; }
                await loadEntries();
                state.gate = 'ok';
                renderAll();
            } catch (e) {
                console.error(e);
                toast(e.message, 'err', 6000);
                state.gate = state.session.accessToken ? 'denied' : 'login';
                renderAll();
            }
        }

        const app = {
            state: state, labels: labels, cfg: cfg,
            isAdmin: isAdmin, isMember: isMember,
            esc: esc, relTime: relTime, renderParagraphs: renderParagraphs,
            itemLabel: itemLabelOf, toast: toast, askConfirm: askConfirm,
            storeGet: storeGet, storeSet: storeSet, SB_SQL: SB_SQL,
            refresh: renderAll, boot: boot, openEditor: openEditor, openAuth: openAuth
        };

        async function start() {
            injectChrome();
            bind();
            await boot();
        }
        app.start = start;
        return app;
    }

    return {
        init: init,
        MOODS: MOODS,
        SB_SQL: SB_SQL,
        esc: esc, toast: toast, askConfirm: askConfirm,
        fmtDate: fmtDate, fmtDateShort: fmtDateShort, relTime: relTime,
        preview: preview, renderParagraphs: renderParagraphs, tagColor: tagColor,
        storeGet: storeGet, storeSet: storeSet, decodeJwt: decodeJwt
    };
})();
