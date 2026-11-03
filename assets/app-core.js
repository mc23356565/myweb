/* ==========================================================================
   我们的小窝 —— 全站共享模块（Supabase 登录门 + 情侣配置）
   整站私有化改造：所有页面都需要账号登录，否则任何内容无法访问。
   账号一共只有两个（情侣双方），都在 Supabase Authentication 里创建，
   并登记在 public.members 表（role 填 admin）。权限由 RLS 兜底。
   站点名称 / 两人名字 / 头像 / 纪念日都存在 public.site_config 表，
   在「后台 → 情侣配置」里改。

   localStorage key（全站通用）：
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

    /* LikeGirl 外壳页需要自带登录门 / 提示样式（不加载 style.css） */
    function injectLgStyles() {
        if (document.getElementById('lgCoreStyles')) return;
        const st = document.createElement('style');
        st.id = 'lgCoreStyles';
        st.textContent = [
            ".gate-card{max-width:430px;margin:3rem auto;background:#fff;border:1px solid rgba(208,206,206,.4);border-radius:1rem;box-shadow:0 8px 12px #ebedf0;padding:2.4rem 2rem;text-align:center;font-family:'Noto Serif SC',serif;}",
            ".gate-card .gate-icon{font-size:2.6rem;line-height:1}",
            ".gate-card h2{font-family:'Noto Serif SC',serif;font-weight:700;margin:.9rem 0 .5rem}",
            ".gate-card p{color:#707070;font-size:.95rem;line-height:1.9;margin:0 auto 1.4rem}",
            ".gate-card form{max-width:300px;margin:0 auto;text-align:left}",
            ".gate-card .field{margin-bottom:1rem}",
            ".gate-card label{display:block;font-size:.85rem;font-weight:700;color:#707070;margin-bottom:.35rem}",
            ".gate-card .input{width:100%;box-sizing:border-box;padding:.55rem .8rem;border:1px solid #ddd;border-radius:.5rem;font-family:'Noto Serif SC',serif;font-size:.95rem;outline:none}",
            ".gate-card .input:focus{border-color:#10bbff}",
            ".gate-error{min-height:1.2em;color:#fa5c7d;font-size:.8rem;margin-bottom:.6rem}",
            ".gate-card .btn.blue{width:100%;justify-content:center;display:flex;align-items:center;gap:.4rem;padding:.65rem;border:none;border-radius:.5rem;background:linear-gradient(135deg,#70a9ff,#10bbff);color:#fff;font-family:'Noto Serif SC',serif;font-weight:700;font-size:1rem;cursor:pointer}",
            ".gate-card .btn.ghost{padding:.5rem 1.2rem;border:1px solid #ddd;border-radius:.5rem;background:#fff;color:#707070;font-family:'Noto Serif SC',serif;cursor:pointer}",
            ".spin{display:inline-block;width:15px;height:15px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:lgspin 1s linear infinite;vertical-align:-3px}",
            "@keyframes lgspin{to{transform:rotate(360deg)}}",
            ".toast-host{position:fixed;top:5.4rem;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:.5rem;align-items:center}",
            ".toast{background:#fff;border:1px solid rgba(208,206,206,.5);box-shadow:0 5px 20px #dad7d7cc;border-radius:.6rem;padding:.5rem 1.1rem;font-family:'Noto Serif SC',serif;font-size:.9rem;color:#333}",
            ".toast.err{color:#fa5c7d}.toast.ok{color:#19b27d}",
            ".footer-warp .footer a{color:#10bbff;cursor:pointer}",
            ".lg-admin-link{margin-top:.5rem;font-size:.85rem}"
        ].join('\n');
        document.head.appendChild(st);
    }


    /* ====================== 数据库安装 SQL（全站唯一来源） ====================== */
    const INSTALL_SQL = "-- ===== 空曙 · 记忆回廊 后台（可重复执行）=====\n-- ① 先在 Authentication → Users 里建账号（两个人的都要建，勾 Auto Confirm）\n-- ② 再把邮箱填进 members 表指定角色：现在两个人权限完全一样，role 都填 admin\ncreate table if not exists public.members (\n  email        text primary key,\n  role         text not null default 'guest' check (role in ('guest','admin')),\n  display_name text,\n  created_at   timestamptz not null default now()\n);\nalter table public.members enable row level security;   -- 不建任何策略：只有后台能改\ninsert into public.members (email, role, display_name) values ('dreemurrdawnlit@outlook.com', 'admin', '空曙') on conflict (email) do update set role = 'admin';\n-- 她的账号建好后，把下一行开头的 -- 去掉、邮箱改成她的，再执行一次：\n-- insert into public.members (email, role, display_name) values ('她的邮箱', 'admin', '她') on conflict (email) do update set role = 'admin';\nupdate public.members set email = lower(email);   -- 邮箱统一小写（Supabase 里就是小写）\n\ncreate or replace function public.my_profile() returns jsonb\nlanguage sql stable security definer set search_path = public as $$\n  select jsonb_build_object(\n    'email', coalesce(auth.jwt() ->> 'email', ''),\n    'role', coalesce((select m.role from public.members m where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email',''))), 'none'),\n    'display_name', coalesce((select m.display_name from public.members m where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email',''))), '')\n  );\n$$;\ngrant execute on function public.my_profile() to anon, authenticated;\n\ncreate or replace function public.is_admin() returns boolean\nlanguage sql stable security definer set search_path = public as $$\n  select coalesce((select m.role from public.members m where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email',''))), 'none') = 'admin';\n$$;\ngrant execute on function public.is_admin() to anon, authenticated;\n\ncreate or replace function public.is_member() returns boolean\nlanguage sql stable security definer set search_path = public as $$\n  select coalesce((select m.role from public.members m where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email',''))), 'none') in ('guest','admin');\n$$;\ngrant execute on function public.is_member() to anon, authenticated;\n\n-- ===== 内容表（日记 + 思辨）=====\ncreate table if not exists public.entries (\n  id         text primary key,\n  kind       text not null check (kind in ('journal','philosophy')),\n  date       text not null,\n  mood       text not null default '',\n  title      text not null default '',\n  author     text not null default '',\n  content    text not null,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\nalter table public.entries add column if not exists title  text not null default '';\nalter table public.entries add column if not exists mood   text not null default '';\nalter table public.entries add column if not exists author text not null default '';\ncreate index if not exists entries_kind_date_idx on public.entries (kind, date);\nalter table public.entries enable row level security;\ndrop policy if exists entries_read on public.entries;\ndrop policy if exists entries_admin_insert on public.entries;\ndrop policy if exists entries_admin_update on public.entries;\ndrop policy if exists entries_admin_delete on public.entries;\ncreate policy entries_read on public.entries for select to authenticated using (public.is_member());\ncreate policy entries_admin_insert on public.entries for insert to authenticated with check (public.is_admin());\ncreate policy entries_admin_update on public.entries for update to authenticated using (public.is_admin());\ncreate policy entries_admin_delete on public.entries for delete to authenticated using (public.is_admin());\n\n-- ===== 问卷表（设计问卷 + 作答，双方互看每题答案）=====\ncreate table if not exists public.surveys (\n  id          text primary key,\n  title       text not null,\n  description text not null default '',\n  created_by  text not null default '',\n  created_at  timestamptz not null default now()\n);\nalter table public.surveys enable row level security;\ndrop policy if exists surveys_read   on public.surveys;\ndrop policy if exists surveys_insert on public.surveys;\ndrop policy if exists surveys_update on public.surveys;\ndrop policy if exists surveys_delete on public.surveys;\ncreate policy surveys_read   on public.surveys for select to authenticated using (public.is_member());\ncreate policy surveys_insert on public.surveys for insert to authenticated with check (public.is_member());\ncreate policy surveys_update on public.surveys for update to authenticated using (public.is_member());\ncreate policy surveys_delete on public.surveys for delete to authenticated using (public.is_member());\n\ncreate table if not exists public.survey_questions (\n  id        bigint generated by default as identity primary key,\n  survey_id text not null references public.surveys(id) on delete cascade,\n  idx       int  not null default 0,\n  qtype     text not null default 'single' check (qtype in ('single','multi','text')),\n  prompt    text not null,\n  options   jsonb not null default '[]'::jsonb\n);\nalter table public.survey_questions enable row level security;\ndrop policy if exists sq_read   on public.survey_questions;\ndrop policy if exists sq_insert on public.survey_questions;\ndrop policy if exists sq_update on public.survey_questions;\ndrop policy if exists sq_delete on public.survey_questions;\ncreate policy sq_read   on public.survey_questions for select to authenticated using (public.is_member());\ncreate policy sq_insert on public.survey_questions for insert to authenticated with check (public.is_member());\ncreate policy sq_update on public.survey_questions for update to authenticated using (public.is_member());\ncreate policy sq_delete on public.survey_questions for delete to authenticated using (public.is_member());\n\n-- 每份问卷每人只有一份答卷（unique 约束），重复提交即覆盖更新\ncreate table if not exists public.survey_responses (\n  id              bigint generated by default as identity primary key,\n  survey_id       text not null references public.surveys(id) on delete cascade,\n  responder_email text not null,\n  answers         jsonb not null default '{}'::jsonb,\n  submitted_at    timestamptz not null default now(),\n  updated_at      timestamptz not null default now(),\n  unique (survey_id, responder_email)\n);\nalter table public.survey_responses enable row level security;\ndrop policy if exists sr_read   on public.survey_responses;\ndrop policy if exists sr_insert on public.survey_responses;\ndrop policy if exists sr_update on public.survey_responses;\ndrop policy if exists sr_delete on public.survey_responses;\ncreate policy sr_read   on public.survey_responses for select to authenticated using (public.is_member());\ncreate policy sr_insert on public.survey_responses for insert to authenticated with check (public.is_member());\ncreate policy sr_update on public.survey_responses for update to authenticated using (public.is_member());\ncreate policy sr_delete on public.survey_responses for delete to authenticated using (public.is_member());\n\n-- ===== 恋爱相册（photos）=====\n-- 图片本体存在 Supabase Storage 的公开桶 photos 里，表里只存 URL 和说明\ncreate table if not exists public.photos (\n  id         text primary key,\n  url        text not null,\n  caption    text not null default '',\n  date       text not null default '',\n  created_at timestamptz not null default now()\n);\nalter table public.photos enable row level security;\ndrop policy if exists photos_read   on public.photos;\ndrop policy if exists photos_insert on public.photos;\ndrop policy if exists photos_update on public.photos;\ndrop policy if exists photos_delete on public.photos;\ncreate policy photos_read   on public.photos for select to authenticated using (public.is_member());\ncreate policy photos_insert on public.photos for insert to authenticated with check (public.is_member());\ncreate policy photos_update on public.photos for update to authenticated using (public.is_member());\ncreate policy photos_delete on public.photos for delete to authenticated using (public.is_member());\n\n-- ===== 恋爱清单（wishlist）=====\ncreate table if not exists public.wishlist (\n  id         text primary key,\n  event      text not null,\n  note       text not null default '',\n  image_url  text not null default '',\n  done       boolean not null default false,\n  done_date  text not null default '',\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\nalter table public.wishlist enable row level security;\ndrop policy if exists wishlist_read   on public.wishlist;\ndrop policy if exists wishlist_insert on public.wishlist;\ndrop policy if exists wishlist_update on public.wishlist;\ndrop policy if exists wishlist_delete on public.wishlist;\ncreate policy wishlist_read   on public.wishlist for select to authenticated using (public.is_member());\ncreate policy wishlist_insert on public.wishlist for insert to authenticated with check (public.is_member());\ncreate policy wishlist_update on public.wishlist for update to authenticated using (public.is_member());\ncreate policy wishlist_delete on public.wishlist for delete to authenticated using (public.is_member());\n\n-- ===== 恋爱相册的图片桶（Storage）=====\n-- 公开桶 photos：登录成员可以上传 / 改 / 删，任何人可以带链接访问图片\ninsert into storage.buckets (id, name, public) values ('photos', 'photos', true)\non conflict (id) do update set public = true;\ndrop policy if exists photos_bucket_insert on storage.objects;\ndrop policy if exists photos_bucket_update on storage.objects;\ndrop policy if exists photos_bucket_delete on storage.objects;\ncreate policy photos_bucket_insert on storage.objects for insert to authenticated\n  with check (bucket_id = 'photos');\ncreate policy photos_bucket_update on storage.objects for update to authenticated\n  using (bucket_id = 'photos') with check (bucket_id = 'photos');\ncreate policy photos_bucket_delete on storage.objects for delete to authenticated\n  using (bucket_id = 'photos');\n\n-- ===== 情侣配置（site_config：站点名/两人名字/头像/纪念日等）=====\ncreate table if not exists public.site_config (\n  key   text primary key,\n  value text not null default ''\n);\nalter table public.site_config enable row level security;\ndrop policy if exists site_config_read   on public.site_config;\ndrop policy if exists site_config_write  on public.site_config;\ncreate policy site_config_read  on public.site_config for select to authenticated using (public.is_member());\ncreate policy site_config_write on public.site_config for insert to authenticated with check (public.is_member());\ncreate policy site_config_upd   on public.site_config for update to authenticated using (public.is_member());\ninsert into public.site_config (key, value) values\n  ('site_title', '我们的小窝'),\n  ('slogan', '总有些惊奇的际遇 比方说当我遇见你'),\n  ('name_a', '他'),\n  ('name_b', '她'),\n  ('avatar_a', ''),\n  ('avatar_b', ''),\n  ('bg_url', ''),\n  ('since', '2026-04-06')\non conflict (key) do nothing;";

    /* ====================== 情侣配置 ====================== */
    const CONFIG_DEFAULTS = {
        site_title: '我们的小窝',
        slogan: '总有些惊奇的际遇 比方说当我遇见你',
        name_a: '他',
        name_b: '她',
        avatar_a: '',
        avatar_b: '',
        bg_url: '',
        since: '2026-04-06'
    };

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
                '<a class="logo" href="' + rel('Secret.html') + '"><span>❤️</span><span class="logo-text">我们的小窝</span></a>' +
                '<span class="slogan">总有些惊奇的际遇 比方说当我遇见你</span>' +
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

    /* ====================== LikeGirl 外壳（照搬 head.php / footer.php） ====================== */
    function lgRel(p) {
        const here = location.pathname.replace(/\\/g, '/');
        return /\/(Articles|Photos|List|Questionnaires)\//.test(here) ? '../' + p : p;
    }
    function mountLgShell() {
        // ① 顶栏（head.php 的 header-wrap：logo + 文案）
        const header = document.createElement('div');
        header.className = 'header-wrap';
        header.innerHTML =
            '<div class="header">' +
                '<div class="logo"><h1><a class="alogo" href="' + lgRel('Secret.html') + '">我们的小窝</a></h1></div>' +
                '<div class="word"><span class="wenan">总有些惊奇的际遇 比方说当我遇见你</span></div>' +
            '</div>';
        document.body.insertBefore(header, document.body.firstChild);

        // ② Banner（head.php 的 bg-wrap：双头像 + 名字 + 心跳 + 波浪），和 LikeGirl 一样每页都有
        const banner = document.createElement('div');
        banner.className = 'bg-wrap';
        banner.innerHTML =
            '<div class="bg-img">' +
                '<div class="central central-800">' +
                    '<div class="middle animated fadeInDown">' +
                        '<div class="img-male"><img id="lgAvaA" src="' + lgRel('assets/avatar-a.svg') + '" draggable="false"><span id="lgNameA">他</span></div>' +
                        '<div class="love-icon"><img src="' + lgRel('Style/img/like.svg') + '" draggable="false"></div>' +
                        '<div class="img-female"><img id="lgAvaB" src="' + lgRel('assets/avatar-b.svg') + '" draggable="false"><span id="lgNameB">她</span></div>' +
                    '</div>' +
                '</div>' +
                '<svg class="waves" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"' +
                    ' viewBox="0 24 150 28" preserveAspectRatio="none" shape-rendering="auto">' +
                    '<defs><path id="gentle-wave" d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" /></defs>' +
                    '<g class="parallax">' +
                        '<use xlink:href="#gentle-wave" x="48" y="0" fill="rgba(255,255,255,0.7" />' +
                        '<use xlink:href="#gentle-wave" x="48" y="3" fill="rgba(255,255,255,0.5)" />' +
                        '<use xlink:href="#gentle-wave" x="48" y="5" fill="rgba(255,255,255,0.3)" />' +
                        '<use xlink:href="#gentle-wave" x="48" y="7" fill="#fff" />' +
                    '</g>' +
                '</svg>' +
            '</div>';
        document.body.insertBefore(banner, header.nextSibling);

        // ③ 页脚（footer.php 的 footer-warp）
        const footer = document.createElement('div');
        footer.className = 'footer-warp';
        footer.innerHTML =
            '<div class="footer">' +
                '<p id="lgFootText">© 我们的小窝</p>' +
                '<p class="lg-admin-link"><a href="' + lgRel('Admin.html') + '">后台</a> · <a id="lgSignOut">退出登录</a></p>' +
            '</div>';
        document.body.appendChild(footer);
        const so = document.getElementById('lgSignOut');
        if (so) so.addEventListener('click', () => { storeSet(K.session, null); location.reload(); });

        // ④ 返回主厅的悬浮圆钮（主页不需要）
        const here = location.pathname.replace(/\\/g, '/');
        const isHome = /\/Secret\.html$/.test(here) || /\/$/.test(here);
        if (!isHome) {
            const back = document.createElement('button');
            back.className = 'lg-back';
            back.type = 'button';
            back.title = '返回主厅';
            back.setAttribute('aria-label', '返回主厅');
            back.textContent = '←';
            back.addEventListener('click', () => location.href = lgRel('Secret.html'));
            document.body.appendChild(back);
        }
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
        me: null,
        config: Object.assign({}, CONFIG_DEFAULTS)
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
    /* 登录后拉取情侣配置（site_config 表），并同步到顶栏 */
    async function loadConfig() {
        try {
            const rows = (await sbRest('site_config?select=*')) || [];
            rows.forEach(r => { if (r && r.key) state.config[r.key] = r.value == null ? '' : String(r.value); });
        } catch (e) { console.warn('情侣配置加载失败（可能还没执行安装 SQL），用默认值', e); }
        applyConfigToChrome();
    }
    function applyConfigToChrome() {
        const c = state.config;
        // 简单顶栏（后台 / 问卷页）
        const logoText = document.querySelector('.site-header .logo-text');
        if (logoText && c.site_title) logoText.textContent = c.site_title;
        const slogan = document.querySelector('.site-header .slogan');
        if (slogan && c.slogan) slogan.textContent = c.slogan;
        // LikeGirl 外壳（前台四页）
        const alogo = document.querySelector('.header-wrap .alogo');
        if (alogo && c.site_title) alogo.textContent = c.site_title;
        const wenan = document.querySelector('.header-wrap .wenan');
        if (wenan && c.slogan) wenan.textContent = c.slogan;
        const nameA = document.getElementById('lgNameA');
        if (nameA && c.name_a) nameA.textContent = c.name_a;
        const nameB = document.getElementById('lgNameB');
        if (nameB && c.name_b) nameB.textContent = c.name_b;
        const avaA = document.getElementById('lgAvaA');
        if (avaA && c.avatar_a) avaA.src = c.avatar_a;
        const avaB = document.getElementById('lgAvaB');
        if (avaB && c.avatar_b) avaB.src = c.avatar_b;
        const foot = document.getElementById('lgFootText');
        if (foot && c.site_title) foot.textContent = '© ' + c.site_title;
        if (c.site_title) document.title = c.site_title;
        // 全站背景：配置了 bg_url 就铺满并加白色薄纱保证可读，否则恢复默认网格纸
        const b = document.body;
        if (c.bg_url) {
            b.style.backgroundImage = 'linear-gradient(rgba(255,255,255,.82),rgba(255,255,255,.82)), url("' + c.bg_url.replace(/"/g, '%22') + '")';
            b.style.backgroundSize = 'cover';
            b.style.backgroundAttachment = 'fixed';
            b.style.backgroundPosition = 'center';
        } else {
            b.style.backgroundImage = '';
            b.style.backgroundSize = '';
            b.style.backgroundAttachment = '';
            b.style.backgroundPosition = '';
        }
    }
    async function signIn(email, password) {
        saveSession(await sbAuth('password', { email: email, password: password }));
    }

    /* ====================== 登录门 ====================== */
    function loginCardHtml() {
        return '<div class="gate-card">' +
            '<div class="gate-icon">🔐</div>' +
            '<h2>请先登录</h2>' +
            '<p>登录后即可查看网站内容。<br>账号由我们自己在 Supabase 后台创建。</p>' +
            '<form id="gateForm">' +
                '<div class="field"><label>邮箱</label><input class="input" type="email" id="gateEmail" placeholder="you@example.com" autocomplete="username"></div>' +
                '<div class="field"><label>密码</label><input class="input" type="password" id="gatePass" placeholder="••••••••" autocomplete="current-password"></div>' +
                '<div class="gate-error" id="gateError"></div>' +
                '<button class="btn blue" type="submit" style="width:100%;justify-content:center">🔑 登录 · 进入我们的小窝</button>' +
            '</form>' +
        '</div>';
    }
    function deniedCardHtml(email) {
        return '<div class="gate-card">' +
            '<div class="gate-icon">🚫</div>' +
            '<h2>这个账号还没有权限</h2>' +
            '<p>你登录的邮箱是 <b>' + esc(email) + '</b>，但它不在授权名单里。<br>' +
            '在 Supabase 后台把它加进 <code>members</code> 表（role 填 <code>admin</code>）即可。</p>' +
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
        if (o.shell === 'lg') {
            if (!document.querySelector('.header-wrap')) mountLgShell();
            injectLgStyles();
        } else if (!document.querySelector('.site-header')) {
            mountHeader(o.active);
        }
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
            return { me: null, config: state.config, sbRest, rpc, toast, esc, storeGet, storeSet, newId };
        }
        try {
            await ensureFreshToken();
            await loadProfile();
            await loadConfig();
        } catch (e) {
            console.error(e);
            if (main) {
                main.innerHTML = loginCardHtml();
                const err = document.getElementById('gateError');
                if (err) err.textContent = '⚠️ ' + e.message;
                bindLoginCard();
            }
            return { me: null, config: state.config, sbRest, rpc, toast, esc, storeGet, storeSet, newId };
        }
        if (!state.me || state.me.role === 'none') {
            if (main) { main.innerHTML = deniedCardHtml(state.me ? state.me.email : ''); }
            return { me: null, config: state.config, sbRest, rpc, toast, esc, storeGet, storeSet, newId };
        }
        renderAccountSlot(state.me);
        return {
            me: state.me, config: state.config, sbRest, rpc, toast, esc, storeGet, storeSet, newId,
            signOut: signOutReload
        };
    }

    /* 公开 API（轻量守卫 localGuard 供各页面备用） */
    const api = {
        init, sbRest, rpc, toast, esc, signIn, storeGet, storeSet, newId,
        signOutReload,
        session: () => state.session,
        me: () => state.me,
        config: () => state.config,
        saveConfigLocal: patch => { Object.assign(state.config, patch); applyConfigToChrome(); },
        sbUrl: () => sbBase(),
        INSTALL_SQL,
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
