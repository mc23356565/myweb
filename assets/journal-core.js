/* ==========================================================================
   空曙 · 记忆回廊 —— 通用前端引擎

   两个页面共用这一份代码：
     Thoughts/ThoughtDebateDaily.html        （日记）
     Thoughts/ThoughtDebatePhilosophy.html   （思辨话题）

   它负责：数据读取（线上 JSON + 离线镜像）、口令解锁、行内编辑器、
   GitHub 发布（Contents API）、导出/导入（仅令牌持有者）、留言板、主题切换。
   页面只需要提供标记 + 一份 config。
   ========================================================================== */
window.Journal = (function () {
    'use strict';

    /* ====================== 1. 常量 ====================== */

    // 解锁口令的 SHA-256（口令：Dawnlit）
    const PASSWORD_HASH = '09d2843316dd0e1abd9df4c0a965a0fd440b5da80d93b36d1a84848d65a1be77';
    const PASSWORD_FALLBACK = 'Dawnlit';

    // 留言板投递通道（EmailJS）：留言直接进邮箱，不落到仓库里
    const EMAILJS = {
        publicKey: 'vH-LF4G2lUnkKpKcv',
        serviceId: 'birth001',
        templateId: 'template_02vjyr6',
        recipient: 'DreemurrDawnlit@outlook.com',
        sdk: 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js'
    };

    // 固定键（跨页面共享：主题、解锁状态、仓库凭证）
    const K = {
        cfg: 'journal.cfg.v1',
        theme: 'journal.theme.v1',
        remember: 'journal.remember.v1',
        unlocked: 'journal.unlocked.v1',
        message: 'journal.message.last.v1'
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

    const DEFAULT_CFG = { owner: '', repo: '', branch: 'main', token: '' };

    /* ====================== 2. 工具函数 ====================== */

    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    const pad2 = n => String(n).padStart(2, '0');
    const todayStr = (d) => {
        const x = d || new Date();
        return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
    };
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
        if (!tag) return '#b1793f';
        const hit = MOODS.find(m => tag.indexOf(m.emoji) >= 0 || tag.indexOf(m.label) >= 0);
        if (hit) return hit.color;
        let h = 0;
        for (const ch of tag) h = (h * 31 + ch.codePointAt(0)) % 360;
        return 'hsl(' + h + ' 38% 52%)';
    }

    /* ---------- 存储 ---------- */
    function storeGet(bag, key, fallback) {
        try {
            const raw = (bag === 'session' ? sessionStorage : localStorage).getItem(key);
            return raw == null ? (fallback === undefined ? null : fallback) : JSON.parse(raw);
        } catch (e) { return fallback === undefined ? null : fallback; }
    }
    function storeSet(bag, key, value) {
        try {
            const box = bag === 'session' ? sessionStorage : localStorage;
            if (value === null) box.removeItem(key); else box.setItem(key, JSON.stringify(value));
        } catch (e) { /* 隐私模式 / 禁用存储：静默失败 */ }
    }

    /* ---------- Base64 / UTF-8 ---------- */
    function utf8ToBase64(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        return btoa(bin);
    }
    function base64ToUtf8(b64) {
        const bin = atob(String(b64).replace(/\s/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }
    async function sha256Hex(str) {
        if (window.crypto && crypto.subtle && crypto.subtle.digest) {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        return null;
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

    /* ====================== 4. 弹窗模板（注入到页面） ====================== */

    function injectChrome(cfg, app) {
        const host = document.createElement('div');
        host.innerHTML = `
<!-- 解锁 -->
<div class="mask" id="authMask">
    <div class="modal narrow">
        <div class="modal-head"><h3>🔐 解锁编辑模式</h3><button class="x" data-close="authMask">✕</button></div>
        <div class="modal-body">
            <p style="margin:0 0 14px;font-size:.85rem;color:var(--ink-3);line-height:1.7">
                输入口令后即可新增、修改内容。口令只用来解锁界面，真正的写入权限由你的 GitHub 密钥决定。
            </p>
            <div class="field"><label>口令</label>
                <input class="input" type="password" id="authInput" placeholder="请输入口令" autocomplete="off"></div>
            <label style="display:flex;align-items:center;gap:8px;font-size:.8rem;color:var(--ink-2);cursor:pointer">
                <input type="checkbox" id="rememberInput"> 在这台设备上记住解锁状态
            </label>
            <div id="authError" style="min-height:20px;font-size:.78rem;color:var(--danger);margin-top:8px"></div>
        </div>
        <div class="modal-foot">
            <button class="btn" data-close="authMask">取消</button>
            <button class="btn primary" id="authSubmit">解锁</button>
        </div>
    </div>
</div>

<!-- 编辑器 -->
<div class="mask" id="editorMask">
    <div class="modal wide">
        <div class="modal-head"><h3 id="editorTitle">✎ 编辑</h3><button class="x" data-close="editorMask">✕</button></div>
        <div class="modal-body">
            <div class="row-inline">
                <div class="field" style="flex:1 1 170px"><label>日期</label>
                    <input class="input" type="date" id="editorDate"></div>
                <div class="field" style="flex:2 1 250px" id="editorFieldWrap" hidden>
                    <label id="editorFieldLabel">字段</label>
                    <input class="input" type="text" id="editorField" autocomplete="off">
                </div>
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
            <button class="btn" id="editorSaveLocal">仅存到本地</button>
            <button class="btn primary" id="editorSavePublish">保存并发布</button>
        </div>
    </div>
</div>

<!-- 设置 -->
<div class="mask" id="settingsMask">
    <div class="modal wide">
        <div class="modal-head"><h3>⚙️ 发布设置</h3><button class="x" data-close="settingsMask">✕</button></div>
        <div class="modal-body">
            <div class="notice">
                <b>它是怎么工作的？</b><br>
                内容存放在仓库里的 <code id="cfgFileEcho">data/journal.json</code>。点「保存并发布」时，浏览器直接调用
                GitHub 的 Contents API，用一个 <b>细粒度访问令牌（Fine-grained PAT）</b> 把改动提交进仓库，
                GitHub Pages 随后自动重新部署（约 30～60 秒）。不需要服务器，也不需要数据库。
            </div>
            <div class="field" style="margin-top:15px"><label>仓库所有者 <span class="hint">owner</span></label>
                <input class="input" id="cfgOwner" placeholder="例如：DreemurrDawnlit"></div>
            <div class="row-inline">
                <div class="field" style="flex:1 1 200px"><label>仓库名 <span class="hint">repo</span></label>
                    <input class="input" id="cfgRepo" placeholder="例如：MyWeb"></div>
                <div class="field" style="flex:0 1 150px"><label>分支</label>
                    <input class="input" id="cfgBranch" placeholder="main"></div>
            </div>
            <div class="field"><label>数据文件路径 <span class="hint">本页读写的文件</span></label>
                <input class="input" id="cfgPath"></div>
            <div class="field"><label>访问令牌 <span class="hint">只保存在本机浏览器里，不会上传到仓库</span></label>
                <textarea class="input" id="cfgToken" style="min-height:74px;font-family:ui-monospace,Consolas,monospace;font-size:.78rem" placeholder="github_pat_... 或 ghp_..."></textarea></div>
            <div class="notice">
                <b>令牌怎么建：</b>
                GitHub → 头像 → Settings → Developer settings → Personal access tokens →
                <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Fine-grained tokens</a> →
                只授权这一个仓库 → Repository permissions 里把 <b>Contents</b> 设为 <b>Read and write</b> → 生成后复制粘贴到这里。
            </div>
            <div id="cfgStatus" style="min-height:22px;font-size:.8rem;margin-top:12px;line-height:1.7"></div>
        </div>
        <div class="modal-foot">
            <button class="btn danger" id="cfgClear">清除令牌</button>
            <button class="btn" id="cfgTest">测试连接</button>
            <button class="btn primary" id="cfgSave">保存设置</button>
        </div>
    </div>
</div>

<!-- 留言 / 回信 -->
<div class="mask" id="messageMask">
    <div class="modal">
        <div class="modal-head"><h3>💬 留言 / 回信</h3><button class="x" data-close="messageMask">✕</button></div>
        <div class="modal-body">
            <div class="notice">
                留言会直接送到空曙的邮箱里，<b>不会出现在网页上</b>，也不会写进仓库——
                也就是说，除了他自己，任何人都看不到你写了什么。
            </div>
            <div class="field" style="margin-top:15px"><label>人物 <span class="hint">你是谁，或者你要回复谁</span></label>
                <input class="input" type="text" id="msgName" placeholder="怎么称呼你？" autocomplete="off"></div>
            <div class="field"><label>联系方式 <span class="hint">选填，期待回音的话记得留</span></label>
                <input class="input" type="text" id="msgContact" placeholder="邮箱 / QQ / 其他" autocomplete="off"></div>
            <div class="field"><label>留言内容</label>
                <textarea class="textarea" id="msgContent" style="min-height:150px" placeholder="想说什么都可以写在这里…"></textarea></div>
            <div id="msgStatus" style="min-height:20px;font-size:.78rem;color:var(--ink-3)"></div>
        </div>
        <div class="modal-foot">
            <button class="btn" data-close="messageMask">取消</button>
            <button class="btn primary" id="msgSend">📨 送出留言</button>
        </div>
    </div>
</div>

<!-- 更多 -->
<div class="mask" id="menuMask">
    <div class="modal narrow">
        <div class="modal-head"><h3>⋯ 更多</h3><button class="x" data-close="menuMask">✕</button></div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:9px">
            <button class="btn menu-item" id="menuMessage">💬 留言 / 回信</button>
            <button class="btn menu-item" id="menuExport">⬇️ 导出全部数据（JSON 备份）</button>
            <button class="btn menu-item" id="menuImport">⬆️ 从 JSON 备份导入</button>
            <button class="btn menu-item" id="menuRevert">↩️ 放弃本地未发布的改动</button>
            <button class="btn menu-item" id="menuLock">🔒 退出编辑模式</button>
            <input type="file" id="importFile" accept=".json,application/json" hidden>
            <div class="notice" style="margin-top:4px;line-height:1.9" id="dataInfoBox"></div>
        </div>
    </div>
</div>

<!-- 确认 -->
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

<button class="fab" id="fab" title="${esc(cfg.labels.newItem)}" hidden>＋</button>
<div class="toast-host" id="toastHost"></div>
`;
        while (host.firstChild) document.body.appendChild(host.firstChild);
    }

    /* ====================== 5. 应用 ====================== */

    function init(cfg) {
        const labels = Object.assign({
            itemName: '记录', unit: '条', newItem: '新建', editItem: '编辑',
            publishNoun: '内容更新', countLabel: '📓 记录条数', spanLabel: '🕰 记录跨度',
            charsLabel: '✍️ 累计字数', latestLabel: '🕒 最新一篇',
            emptyText: '还没有任何记录', notFoundText: '没有匹配的记录',
            dataLabel: '数据', idPrefix: 'e'
        }, cfg.labels || {});

        const LS = {
            cfg: K.cfg,
            path: cfg.key + '.path.v1',
            working: cfg.key + '.working.v1',
            cache: cfg.key + '.cache.v1',
            draft: cfg.key + '.draft.v1'
        };

        const state = {
            cfg: Object.assign({}, DEFAULT_CFG),
            pathOverride: '',
            entries: [],
            deleted: new Set(),
            unlocked: false,
            source: '离线镜像',
            fetchedAt: null,
            loadError: '',
            query: '',
            activeYear: 'all',
            activeTag: 'all',
            sort: 'desc',
            editingId: null,
            publishing: false
        };

        const app = {
            state: state,
            labels: labels,
            cfg: cfg,
            relTime: relTime, fmtDate: fmtDate, fmtDateShort: fmtDateShort,
            preview: preview, esc: esc, tagColor: tagColor, renderParagraphs: renderParagraphs,
            pendingCount: pendingCount,
            render: renderAll,
            openEditor: openEditor,
            deleteEntry: deleteEntry,
            publish: publish,
            loadData: loadData,
            path: () => state.pathOverride || cfg.repoPath
        };

        /* ---------- 数据模型 ---------- */
        const fieldKey = (cfg.field && cfg.field.key) || null;

        function canonical(entry) {
            const e = entry || {};
            const out = {
                id: String(e.id || newId(e.date || todayStr(), labels.idPrefix)),
                date: String(e.date || todayStr())
            };
            if (fieldKey) out[fieldKey] = String(e[fieldKey] || '');
            out.content = String(e.content || '');
            if (e.createdAt) out.createdAt = e.createdAt;
            if (e.updatedAt) out.updatedAt = e.updatedAt;
            if (e._dirty) out._dirty = true;
            return out;
        }
        function normalize(data) {
            const list = (data && Array.isArray(data.entries)) ? data.entries.map(canonical) : [];
            return { version: 1, updatedAt: (data && data.updatedAt) || null, entries: list };
        }
        function sortEntries(list) {
            return list.slice().sort((a, b) =>
                a.date === b.date ? String(a.id).localeCompare(String(b.id)) : a.date.localeCompare(b.date));
        }
        function serialize(data) {
            return JSON.stringify({
                version: 1,
                updatedAt: data.updatedAt || localIso(),
                entries: sortEntries(data.entries).map(e => { const c = canonical(e); delete c._dirty; return c; })
            }, null, 4) + '\n';
        }
        const stripDirty = list => list.map(e => { const c = canonical(e); delete c._dirty; return c; });

        function pendingCount() {
            return state.entries.filter(e => e._dirty).length + state.deleted.size;
        }
        function saveWorking() {
            if (pendingCount() === 0) { storeSet('local', LS.working, null); return; }
            storeSet('local', LS.working, {
                savedAt: localIso(),
                entries: stripDirty(state.entries),
                dirtyIds: state.entries.filter(e => e._dirty).map(e => e.id),
                deleted: Array.from(state.deleted)
            });
        }
        function loadWorking() {
            const w = storeGet('local', LS.working, null);
            if (!w || !Array.isArray(w.entries)) return false;
            if (w.entries.length === 0 && (!w.deleted || w.deleted.length === 0)) return false;
            const dirtyIds = new Set(w.dirtyIds || []);
            state.entries = w.entries.map(e => {
                const c = canonical(e);
                if (dirtyIds.has(c.id)) c._dirty = true;
                return c;
            });
            state.deleted = new Set(w.deleted || []);
            return true;
        }

        /* ---------- 读取 ---------- */
        async function fetchRemote() {
            if (location.protocol === 'file:') return null;
            try {
                const res = await fetch(cfg.dataUrl + '?t=' + Date.now(), { cache: 'no-store' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return normalize(JSON.parse(await res.text()));
            } catch (e) {
                console.warn('读取线上数据失败，改用离线镜像：', e);
                return null;
            }
        }
        async function loadData() {
            const mirror = cfg.mirrorVar ? window[cfg.mirrorVar] : null;
            const cached = storeGet('local', LS.cache, null);
            const base = mirror ? normalize(mirror) : (cached ? normalize(cached.data) : null);
            if (base && base.entries.length) {
                state.entries = base.entries;
                state.source = mirror ? '离线镜像 ' + cfg.repoPath.replace(/\.json$/, '.js') : '本机缓存';
                state.fetchedAt = (cached && cached.fetchedAt) ? cached.fetchedAt : null;
            } else {
                state.loadError = '没有找到数据文件（' + cfg.repoPath + ' / 离线镜像缺失）。请确认 data 目录已随网页一起上传。';
            }
            const hasPending = loadWorking();
            const remote = await fetchRemote();
            if (remote) {
                state.source = cfg.repoPath + '（线上）';
                state.fetchedAt = localIso();
                storeSet('local', LS.cache, { data: remote, fetchedAt: state.fetchedAt });
                if (hasPending) {
                    const dirty = new Map(state.entries.filter(e => e._dirty).map(e => [e.id, e]));
                    const merged = [], seen = new Set();
                    for (const r of remote.entries) {
                        if (state.deleted.has(r.id)) continue;
                        const local = dirty.get(r.id);
                        if (local) { merged.push(local); seen.add(local.id); continue; }
                        merged.push(r); seen.add(r.id);
                    }
                    for (const e of state.entries) {
                        if (state.deleted.has(e.id) || seen.has(e.id)) continue;
                        merged.push(e);
                    }
                    state.entries = merged;
                } else {
                    state.entries = remote.entries;
                }
                state.loadError = '';
            }
        }

        /* ---------- 渲染 ---------- */
        const tagOf = cfg.tagOf || null;

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

        function renderStats() {
            const total = state.entries.length;
            const chars = state.entries.reduce((s, e) => s + (e.content || '').length, 0);
            const sorted = sortEntries(state.entries);
            const first = sorted.length ? sorted[0].date : '';
            const last = sorted.length ? sorted[sorted.length - 1].date : '';
            const d1 = parseDate(first), d2 = parseDate(last);
            const span = (d1 && d2) ? Math.max(1, Math.round((d2 - d1) / 86400000)) : 0;
            const host = $('#statsHost');
            if (!host) return;
            host.innerHTML =
                '<div class="stat"><div class="k">' + esc(labels.countLabel) + '</div><div class="v">' + total + '<small>' + esc(labels.unit) + '</small></div></div>' +
                '<div class="stat"><div class="k">' + esc(labels.spanLabel) + '</div><div class="v">' + span + '<small>天</small></div></div>' +
                '<div class="stat"><div class="k">' + esc(labels.charsLabel) + '</div><div class="v">' + chars.toLocaleString() + '<small>字</small></div></div>' +
                '<div class="stat"><div class="k">' + esc(labels.latestLabel) + '</div><div class="v" style="font-size:.98rem">' + (last ? esc(last) : '—') + '</div></div>';
        }

        function renderChips() {
            const host = $('#tagChips');
            if (!host) return;
            if (!tagOf) { host.parentElement && (host.parentElement.hidden = true); return; }
            const counts = new Map();
            state.entries.forEach(e => { const t = tagOf(e); counts.set(t, (counts.get(t) || 0) + 1); });
            const parts = ['<span class="chip' + (state.activeTag === 'all' ? ' on' : '') + '" data-tag="all">' +
                '<span class="dot-sm" style="--c:#b1793f"></span>全部 <span class="count">' + state.entries.length + '</span></span>'];
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
            const years = Array.from(new Set(state.entries.map(e => String(e.date || '').slice(0, 4)).filter(Boolean)))
                .sort((a, b) => b.localeCompare(a));
            sel.innerHTML = '<option value="all">全部年份</option>' +
                years.map(y => '<option value="' + y + '">' + y + ' 年</option>').join('');
            sel.value = (state.activeYear === 'all' || years.indexOf(state.activeYear) >= 0) ? state.activeYear : 'all';
        }

        function cardHtml(e) {
            const long = (e.content || '').length > 170;
            const title = cfg.cardTitle ? cfg.cardTitle(e) : '';
            const tag = tagOf ? tagOf(e) : '';
            const tags = [];
            if (e._dirty) tags.push('<span class="tag dirty">待发布</span>');
            if (e.updatedAt) tags.push('<span class="tag">已编辑 · ' + esc(relTime(e.updatedAt)) + '</span>');
            return '' +
            '<article class="entry clamp anim-in" data-id="' + esc(e.id) + '" style="--tag:' + (tagOf ? tagColor(tag) : '#b1793f') + '">' +
                '<span class="rail-dot"></span>' +
                '<div class="card' + (e._dirty ? ' pending' : '') + '">' +
                    '<div class="card-head">' +
                        (title ? '<span class="item-title">' + esc(title) + '</span>' : '') +
                        '<span class="date-main">' + esc(fmtDateShort(e.date)) + '</span>' +
                        '<span class="date-sub">' + esc(e.date) + '</span>' +
                        (tagOf ? (tag ? '<span class="tag-chip">' + esc(tag) + '</span>'
                                      : '<span class="tag-chip empty">🕰️ ' + esc(cfg.tagNoneLabel || '未标注') + '</span>') : '') +
                        tags.join('') +
                        '<span class="head-right">' +
                            (state.unlocked
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

        function renderList() {
            const host = $('#timelineHost');
            if (!host) return;
            const list = filtered();
            const meta = $('#metaLine');
            if (meta) {
                meta.innerHTML = state.entries.length === 0
                    ? '<span>' + esc(labels.emptyText) + '</span>'
                    : '共 <b>' + state.entries.length + '</b> ' + esc(labels.unit) + ' · 当前显示 <b>' + list.length + '</b> ' +
                      esc(labels.unit) + (state.fetchedAt
                        ? ' · 数据同步于 ' + esc(relTime(state.fetchedAt))
                        : ' · 数据来源：' + esc(state.source));
            }
            if (list.length === 0) {
                host.innerHTML = '<div class="empty-state">📭 ' + esc(labels.notFoundText) +
                    '<br>试试换个关键词，或点「清除筛选」看全部。</div>';
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
                    '<div class="year-head"><span>' + esc(year) + '</span><span class="y-count">' +
                    items.length + ' ' + esc(labels.unit) + '</span></div>' +
                    '<div class="entries">' + items.map(cardHtml).join('') + '</div></section>');
            });
            host.innerHTML = blocks.join('');

            $$('.entry', host).forEach(node => {
                const id = node.dataset.id;
                $('.card-head', node).addEventListener('click', ev => {
                    if (ev.target.closest('.icon-btn')) return;
                    node.classList.toggle('open');
                    refreshExpand(node);
                });
                const toggle = $('.expand-btn', node);
                if (toggle) toggle.addEventListener('click', ev => {
                    ev.stopPropagation();
                    node.classList.toggle('open');
                    refreshExpand(node);
                });
                const ed = $('.act-edit', node);
                if (ed) ed.addEventListener('click', ev => { ev.stopPropagation(); openEditor(id); });
                const del = $('.act-del', node);
                if (del) del.addEventListener('click', ev => { ev.stopPropagation(); deleteEntry(id); });
            });
        }

        function refreshExpand(node) {
            const btn = $('.expand-btn', node);
            if (btn) btn.innerHTML = node.classList.contains('open') ? '收起 <span>▴</span>' : '展开全文 <span>▾</span>';
            node.classList.toggle('clamp', !node.classList.contains('open'));
        }

        function renderPublishBar() {
            const bar = $('#publishBar');
            if (!bar) return;
            const n = pendingCount();
            const hasToken = !!state.cfg.token;
            if (n === 0 && !state.unlocked) { bar.hidden = true; bar.innerHTML = ''; return; }
            bar.hidden = false;
            if (n > 0) {
                bar.innerHTML =
                    '<div class="pb-text"><span class="pb-dot"></span>有 <b>' + n + '</b> 处本地改动还没同步' +
                    (hasToken ? '到 GitHub。' : '（当前是本机草稿模式，还没配置发布密钥）。') + '</div>' +
                    '<button class="btn" id="pbSettings">⚙️ ' + (hasToken ? '设置' : '配置发布密钥') + '</button>' +
                    '<button class="btn ghost" id="pbRevert">放弃改动</button>' +
                    (hasToken ? '<button class="btn primary" id="pbPublish">🚀 立即发布</button>' : '');
                $('#pbSettings').addEventListener('click', openSettings);
                $('#pbRevert').addEventListener('click', revertLocal);
                if ($('#pbPublish')) $('#pbPublish').addEventListener('click', () => publish());
            } else {
                bar.innerHTML =
                    '<div class="pb-text"><span class="pb-dot idle"></span>编辑模式已开启：点卡片右上角的 ✎ 修改旧内容，' +
                    '右下角的 ＋ 新建。数据来源：' + esc(state.source) + '。</div>' +
                    '<button class="btn" id="pbSettings">⚙️ 发布设置</button>' +
                    '<button class="btn" id="pbNew">＋ ' + esc(labels.newItem) + '</button>';
                $('#pbSettings').addEventListener('click', openSettings);
                $('#pbNew').addEventListener('click', () => openEditor(null));
            }
        }

        function canManageData() { return state.unlocked && !!state.cfg.token; }

        function renderMenu() {
            const ok = canManageData();
            [['menuExport', '导出'], ['menuImport', '导入']].forEach(pair => {
                const btn = $('#' + pair[0]);
                if (!btn) return;
                btn.disabled = !ok;
                btn.title = ok ? '' : '只有配置了发布密钥（并已解锁）的设备才能导出 / 导入';
            });
            const revert = $('#menuRevert');
            if (revert) revert.disabled = !state.unlocked;
            const lock = $('#menuLock');
            if (lock) lock.hidden = !state.unlocked;
            const box = $('#dataInfoBox');
            if (box) {
                box.innerHTML =
                    '数据来源：<b>' + esc(state.source) + '</b><br>' +
                    '条目：' + state.entries.length + ' ' + esc(labels.unit) +
                    ' · 未发布改动：' + pendingCount() + ' 处<br>' +
                    '目标文件：<code>' + esc(app.path()) + '</code><br>' +
                    '仓库：<code>' + esc(state.cfg.owner || '（未设置）') + '/' + esc(state.cfg.repo || '（未设置）') + '</code> @ ' + esc(state.cfg.branch) +
                    (ok ? '' : '<br><span style="color:var(--ink-3)">💡 导出 / 导入只对配置了发布密钥的你自己开放。</span>');
            }
        }

        function renderAll() {
            renderStats();
            renderYearPicker();
            renderChips();
            renderList();
            renderPublishBar();
            renderMenu();
            const fab = $('#fab');
            if (fab) fab.hidden = !state.unlocked;
            const lock = $('#lockBtn');
            if (lock) {
                lock.innerHTML = state.unlocked ? '🔓 编辑模式已开启' : '🔐 编辑模式';
                lock.classList.toggle('primary', state.unlocked);
            }
            if (typeof cfg.onRender === 'function') cfg.onRender(app);
        }

        /* ---------- 解锁 ---------- */
        async function checkPassword(input) {
            const hex = await sha256Hex(input);
            if (hex) return hex === PASSWORD_HASH;
            return input === PASSWORD_FALLBACK;
        }
        function setUnlocked(on) {
            state.unlocked = on;
            storeSet('session', K.unlocked, on ? '1' : null);
            if (!on) storeSet('local', K.remember, null);
            renderAll();
        }
        function openAuth() {
            $('#authInput').value = '';
            $('#authError').textContent = '';
            $('#rememberInput').checked = !!storeGet('local', K.remember, false);
            openMask('authMask');
            setTimeout(() => $('#authInput').focus(), 60);
        }

        /* ---------- 编辑器 ---------- */
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
        function updateCharCount() {
            $('#charCount').textContent = $('#editorContent').value.length + ' 字';
        }
        function openEditor(id) {
            if (!state.unlocked) { openAuth(); return; }
            state.editingId = id || null;
            const entry = id ? state.entries.find(e => e.id === id) : null;
            $('#editorTitle').textContent = entry ? '✎ ' + labels.editItem : '✎ ' + labels.newItem;
            $('#editorDate').value = entry ? entry.date : todayStr();
            $('#editorContent').value = entry ? entry.content : '';
            const wrap = $('#editorFieldWrap');
            if (cfg.field) {
                wrap.hidden = false;
                $('#editorFieldLabel').innerHTML = esc(cfg.field.label) +
                    (cfg.field.hint ? ' <span class="hint">' + esc(cfg.field.hint) + '</span>' : '');
                const input = $('#editorField');
                input.placeholder = cfg.field.placeholder || '';
                input.value = entry ? (entry[cfg.field.key] || '') : '';
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
            $('#editorSavePublish').textContent = state.cfg.token ? '保存并发布' : '保存（本地）';
            updateCharCount();
            openMask('editorMask');
            setTimeout(() => $('#editorContent').focus(), 80);
        }
        function collectEditor() {
            const date = $('#editorDate').value || todayStr();
            const content = $('#editorContent').value.trim();
            const out = { date: date, content: content };
            if (cfg.field) out[cfg.field.key] = $('#editorField').value.trim();
            if (!content) { toast('正文还是空的，先写点什么吧 📝', 'err'); return null; }
            if (!parseDate(date)) { toast('请选择一个有效日期 📅', 'err'); return null; }
            if (cfg.field && cfg.field.required && !out[cfg.field.key]) {
                toast('「' + cfg.field.label + '」还没填 ✍️', 'err');
                return null;
            }
            return out;
        }
        function applyEdit(data) {
            const now = localIso();
            if (state.editingId) {
                const i = state.entries.findIndex(e => e.id === state.editingId);
                const old = state.entries[i] || {};
                const next = canonical(Object.assign({}, old, data, { id: state.editingId, updatedAt: now, createdAt: old.createdAt || old.date, _dirty: true }));
                if (i >= 0) state.entries[i] = next; else state.entries.push(next);
            } else {
                state.entries.push(canonical(Object.assign({}, data, {
                    id: newId(data.date, labels.idPrefix), createdAt: now, updatedAt: now, _dirty: true
                })));
            }
            saveWorking();
        }
        async function deleteEntry(id) {
            const entry = state.entries.find(e => e.id === id);
            if (!entry) return;
            const ok = await askConfirm({
                title: '删除这条' + labels.itemName + '？',
                text: fmtDate(entry.date) + '\n\n' + preview(entry.content, 60) +
                      '\n\n删除后要点「发布」才会从仓库里移除；万一改错了，还能在 GitHub 的提交记录里找回。',
                ok: '删除', danger: true
            });
            if (!ok) return;
            if (!entry._dirty) state.deleted.add(id);
            state.entries = state.entries.filter(e => e.id !== id);
            saveWorking();
            renderAll();
            toast('已加入待删除列表，点「发布」生效 🗑', 'ok');
        }
        async function revertLocal() {
            const ok = await askConfirm({
                title: '放弃本地改动？',
                text: '本机尚未发布的新增、修改、删除都会丢失，页面会回到仓库里的最新版本。',
                ok: '放弃改动', danger: true
            });
            if (!ok) return;
            storeSet('local', LS.working, null);
            state.deleted = new Set();
            state.entries = [];
            await loadData();
            renderAll();
            toast('已回到线上最新版本 ↩️', 'ok');
        }

        /* ---------- GitHub ---------- */
        function ghHeaders(withAuth) {
            const h = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
            if (withAuth !== false && state.cfg.token) h.Authorization = 'Bearer ' + state.cfg.token;
            return h;
        }
        function ghContentsUrl() {
            const p = String(app.path()).split('/').map(encodeURIComponent).join('/');
            return 'https://api.github.com/repos/' + encodeURIComponent(state.cfg.owner) + '/' +
                   encodeURIComponent(state.cfg.repo) + '/contents/' + p;
        }
        function ghError(status, body) {
            const msg = (body && body.message) || '';
            if (status === 401) return '令牌无效或已过期（401）';
            if (status === 403) return '权限不足或被限流（403）：确认令牌勾选了 Contents: Read and write';
            if (status === 404) return '找不到仓库或文件（404）：检查 owner / repo / 分支，以及令牌是否包含该仓库';
            if (status === 409) return '文件已被别处修改（409），请再点一次发布';
            if (status === 422) return '提交被拒绝（422）：文件可能过大或格式不合法';
            return 'GitHub 接口出错（' + status + '）' + (msg ? '：' + msg : '');
        }
        async function ghGetFile() {
            const res = await fetch(ghContentsUrl() + '?ref=' + encodeURIComponent(state.cfg.branch) + '&t=' + Date.now(),
                { headers: ghHeaders(), cache: 'no-store' });
            if (res.status === 404) return null;
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(ghError(res.status, body));
            return { sha: body.sha, text: base64ToUtf8(body.content || '') };
        }
        async function ghPutFile(text, sha, message) {
            const payload = { message: message, content: utf8ToBase64(text), branch: state.cfg.branch };
            if (sha) payload.sha = sha;
            const res = await fetch(ghContentsUrl(), {
                method: 'PUT',
                headers: Object.assign(ghHeaders(), { 'Content-Type': 'application/json' }),
                body: JSON.stringify(payload)
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(ghError(res.status, body));
            return body;
        }
        function mergeForPublish(remoteEntries) {
            const map = new Map(remoteEntries.map(e => [e.id, canonical(e)]));
            for (const id of state.deleted) map.delete(id);
            for (const e of state.entries) {
                const r = map.get(e.id);
                if (!r) { map.set(e.id, canonical(e)); continue; }
                if (e._dirty) { map.set(e.id, canonical(e)); continue; }
                if ((e.updatedAt || '') > (r.updatedAt || '')) map.set(e.id, canonical(e));
            }
            return Array.from(map.values()).map(e => { const c = canonical(e); delete c._dirty; return c; });
        }
        async function publish() {
            if (state.publishing) return;
            if (!state.cfg.owner || !state.cfg.repo) { toast('先在设置里填好仓库信息 ⚙️', 'err'); openSettings(); return; }
            if (!state.cfg.token) { toast('还没有配置发布密钥 ⚙️', 'err'); openSettings(); return; }
            if (pendingCount() === 0) { toast('没有待发布的改动 ✓'); return; }
            state.publishing = true;
            const btns = $$('#pbPublish, #editorSavePublish');
            btns.forEach(b => { b.disabled = true; b.dataset.old = b.innerHTML; b.innerHTML = '<span class="spin"></span> 发布中…'; });
            try {
                const remoteFile = await ghGetFile();
                let remoteEntries = [];
                if (remoteFile && remoteFile.text.trim()) {
                    try { remoteEntries = normalize(JSON.parse(remoteFile.text)).entries; }
                    catch (e) { throw new Error('仓库里的 ' + app.path() + ' 解析失败，先确认文件内容是否正确'); }
                }
                const merged = mergeForPublish(remoteEntries);
                const next = { version: 1, updatedAt: localIso(), entries: merged };
                const remoteIds = new Set(remoteEntries.map(e => e.id));
                const added = state.entries.filter(e => e._dirty && !remoteIds.has(e.id)).length;
                const edited = state.entries.filter(e => e._dirty).length - added;
                const bits = [];
                if (added) bits.push('新增 ' + added);
                if (edited) bits.push('修改 ' + edited);
                if (state.deleted.size) bits.push('删除 ' + state.deleted.size);
                const message = labels.publishNoun + ' · ' + (bits.join(' / ') || '同步') + ' — ' + new Date().toLocaleString('zh-CN');
                const result = await ghPutFile(serialize(next), remoteFile ? remoteFile.sha : undefined, message);

                state.entries = sortEntries(merged).map(e => canonical(e));
                state.deleted = new Set();
                state.fetchedAt = localIso();
                state.source = app.path() + '（已发布）';
                storeSet('local', LS.working, null);
                storeSet('local', LS.cache, {
                    data: { version: 1, updatedAt: next.updatedAt, entries: stripDirty(merged) },
                    fetchedAt: state.fetchedAt
                });
                renderAll();
                toast('✨ 已提交到 GitHub，Pages 大约 30～60 秒后更新', 'ok', 5200);
                if (result && result.commit && result.commit.html_url) console.log('提交记录：', result.commit.html_url);
            } catch (err) {
                console.error(err);
                toast('发布失败：' + err.message, 'err', 6000);
            } finally {
                state.publishing = false;
                btns.forEach(b => {
                    b.disabled = false;
                    if (b.dataset.old != null) { b.innerHTML = b.dataset.old; delete b.dataset.old; }
                });
            }
        }

        /* ---------- 设置 ---------- */
        function detectRepo() {
            const host = location.hostname || '';
            const segs = location.pathname.split('/').filter(Boolean);
            if (/\.github\.io$/i.test(host)) {
                const owner = host.split('.')[0];
                return { owner: owner, repo: segs.length ? segs[0] : owner + '.github.io', branch: 'main' };
            }
            return null;
        }
        function openSettings() {
            $('#cfgOwner').value = state.cfg.owner || '';
            $('#cfgRepo').value = state.cfg.repo || '';
            $('#cfgBranch').value = state.cfg.branch || 'main';
            $('#cfgPath').value = app.path();
            $('#cfgToken').value = state.cfg.token || '';
            $('#cfgFileEcho').textContent = app.path();
            $('#cfgStatus').textContent = (state.cfg.owner && !state.cfg.token)
                ? '提示：没有令牌时，改动只会存在本机，不会同步到 GitHub。' : '';
            openMask('settingsMask');
        }
        function readSettings() {
            return {
                owner: $('#cfgOwner').value.trim(),
                repo: $('#cfgRepo').value.trim(),
                branch: $('#cfgBranch').value.trim() || 'main',
                path: $('#cfgPath').value.trim() || cfg.repoPath,
                token: $('#cfgToken').value.trim()
            };
        }
        async function testConnection(c, silent) {
            const prevCfg = state.cfg, prevPath = state.pathOverride;
            state.cfg = Object.assign({}, DEFAULT_CFG, c);
            state.pathOverride = c.path || '';
            try {
                if (!c.owner || !c.repo) throw new Error('还没有填写 owner / repo');
                const res = await fetch('https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo),
                    { headers: ghHeaders(), cache: 'no-store' });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(ghError(res.status, body));
                let fileInfo;
                try {
                    const f = await ghGetFile();
                    fileInfo = f ? '数据文件已找到（' + Math.round(f.text.length / 102.4) / 10 + ' KB）'
                                 : '数据文件还不存在，第一次发布会自动创建';
                } catch (e) { fileInfo = '数据文件检查失败：' + e.message; }
                const msg = '✅ 连接成功：' + c.owner + '/' + c.repo + ' · 分支 ' + c.branch + ' · ' + fileInfo;
                if (!silent) $('#cfgStatus').textContent = msg;
                return msg;
            } catch (e) {
                const msg = '❌ ' + e.message;
                if (!silent) $('#cfgStatus').textContent = msg;
                throw new Error(msg);
            } finally {
                state.cfg = prevCfg;
                state.pathOverride = prevPath;
            }
        }

        /* ---------- 导入 / 导出（仅令牌持有者） ---------- */
        function exportJson() {
            if (!canManageData()) { toast('只有配置了发布密钥的你自己才能导出 🔒', 'err'); return; }
            const blob = new Blob([serialize({ version: 1, updatedAt: localIso(), entries: stripDirty(state.entries) })],
                { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = cfg.key + '-backup-' + todayStr() + '.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            toast('已导出备份文件 ⬇️', 'ok');
        }
        async function importJson(file) {
            if (!canManageData()) { toast('只有配置了发布密钥的你自己才能导入 🔒', 'err'); return; }
            try {
                const data = normalize(JSON.parse(await file.text()));
                if (!data.entries.length) throw new Error('文件里没有 entries');
                let added = 0, updated = 0;
                for (const e of data.entries) {
                    const c = canonical(e);
                    const old = state.entries.find(x => x.id === c.id);
                    if (!old) { c._dirty = true; state.entries.push(c); added++; }
                    else if ((c.updatedAt || '') > (old.updatedAt || '')) {
                        const i = state.entries.findIndex(x => x.id === c.id);
                        c._dirty = true;
                        state.entries[i] = c;
                        updated++;
                    }
                }
                saveWorking();
                renderAll();
                toast('导入完成：新增 ' + added + ' 条，更新 ' + updated + ' 条', 'ok', 4200);
            } catch (e) {
                toast('导入失败：' + e.message, 'err', 5000);
            }
        }

        /* ---------- 留言板 ---------- */
        let emailPromise = null;
        function loadEmailSdk() {
            if (window.emailjs) {
                try { emailjs.init(EMAILJS.publicKey); } catch (e) {}
                return Promise.resolve(true);
            }
            if (!emailPromise) {
                emailPromise = new Promise(resolve => {
                    const s = document.createElement('script');
                    s.src = EMAILJS.sdk;
                    s.onload = () => { try { emailjs.init(EMAILJS.publicKey); } catch (e) {} resolve(true); };
                    s.onerror = () => resolve(false);
                    document.head.appendChild(s);
                });
            }
            return emailPromise;
        }
        function openMessage() {
            $('#msgName').value = storeGet('local', K.message + '.name', '') || '';
            $('#msgContact').value = storeGet('local', K.message + '.contact', '') || '';
            $('#msgContent').value = '';
            $('#msgStatus').textContent = '';
            openMask('messageMask');
            setTimeout(() => $('#msgName').focus(), 60);
        }
        async function sendMessage() {
            const name = $('#msgName').value.trim();
            const contact = $('#msgContact').value.trim();
            const content = $('#msgContent').value.trim();
            const status = $('#msgStatus');
            if (!name) { status.textContent = '❄️ 先留个称呼吧'; status.style.color = 'var(--danger)'; $('#msgName').focus(); return; }
            if (!content) { status.textContent = '📜 留言内容还是空的'; status.style.color = 'var(--danger)'; $('#msgContent').focus(); return; }

            const last = storeGet('local', K.message, 0) || 0;
            if (Date.now() - last < 20000) {
                status.textContent = '⏳ 刚发过一条啦，歇一会儿再发吧';
                status.style.color = 'var(--ink-3)';
                return;
            }

            const btn = $('#msgSend');
            const oldText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spin"></span> 递送中…';
            status.textContent = '';
            try {
                const okSdk = await loadEmailSdk();
                if (!okSdk || !window.emailjs) throw new Error('留言通道加载失败（可能是网络问题），稍后再试');
                const pageName = (cfg.labels && cfg.labels.itemName) || '记忆回廊';
                const body = '留言人：' + name + '\n' +
                             (contact ? '联系方式：' + contact + '\n' : '') +
                             '\n留言内容：\n' + content +
                             '\n\n—— 来自「' + pageName + '」页面 · ' + new Date().toLocaleString('zh-CN');
                await emailjs.send(EMAILJS.serviceId, EMAILJS.templateId, {
                    to_email: EMAILJS.recipient,
                    from_name: name,
                    message: body
                });
                storeSet('local', K.message, Date.now());
                storeSet('local', K.message + '.name', name);
                storeSet('local', K.message + '.contact', contact);
                $('#msgContent').value = '';
                status.textContent = '✨ 留言已送出，只有空曙能看到 ✨';
                status.style.color = 'var(--ok)';
                toast('留言已送出 ✨', 'ok');
                setTimeout(() => closeMask('messageMask'), 1200);
            } catch (e) {
                console.error(e);
                status.textContent = '❌ ' + e.message;
                status.style.color = 'var(--danger)';
            } finally {
                btn.disabled = false;
                btn.innerHTML = oldText;
            }
        }

        /* ---------- 事件绑定 ---------- */
        function bind() {
            document.addEventListener('click', e => {
                const t = e.target.closest('[data-close]');
                if (t) closeMask(t.dataset.close);
            });
            $$('.mask').forEach(mask => {
                mask.addEventListener('mousedown', e => { if (e.target === mask) mask.classList.remove('show'); });
            });

            const themeBtn = $('#themeBtn');
            if (themeBtn) themeBtn.addEventListener('click', () => {
                const next = document.documentElement.dataset.theme === 'night' ? 'day' : 'night';
                document.documentElement.dataset.theme = next;
                storeSet('local', K.theme, next);
                themeBtn.textContent = next === 'night' ? '☀️' : '🌙';
            });

            const lockBtn = $('#lockBtn');
            if (lockBtn) lockBtn.addEventListener('click', () => {
                if (state.unlocked) { setUnlocked(false); toast('已退出编辑模式 🔒'); }
                else openAuth();
            });
            $('#authSubmit').addEventListener('click', async () => {
                if (await checkPassword($('#authInput').value)) {
                    if ($('#rememberInput').checked) storeSet('local', K.remember, true);
                    setUnlocked(true);
                    closeMask('authMask');
                    toast('解锁成功 ✍️', 'ok');
                    if (!state.cfg.token) setTimeout(() => toast('提示：还没配置发布密钥，改动会先存在本机 ⚙️', '', 5200), 1200);
                } else {
                    $('#authError').textContent = '口令不对，再想想？';
                    $('#authInput').select();
                }
            });
            $('#authInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#authSubmit').click(); });

            const search = $('#searchInput');
            if (search) {
                search.addEventListener('input', e => {
                    state.query = e.target.value;
                    const clear = $('#searchClear');
                    if (clear) clear.hidden = !state.query;
                    renderList();
                });
            }
            const clear = $('#searchClear');
            if (clear) clear.addEventListener('click', () => {
                state.query = '';
                $('#searchInput').value = '';
                clear.hidden = true;
                renderList();
            });
            const yearPicker = $('#yearPicker');
            if (yearPicker) yearPicker.addEventListener('change', e => { state.activeYear = e.target.value; renderList(); });
            const sortPicker = $('#sortPicker');
            if (sortPicker) sortPicker.addEventListener('change', e => { state.sort = e.target.value; renderList(); });
            const reset = $('#resetBtn');
            if (reset) reset.addEventListener('click', () => {
                state.query = ''; state.activeYear = 'all'; state.activeTag = 'all'; state.sort = 'desc';
                if ($('#searchInput')) $('#searchInput').value = '';
                if ($('#searchClear')) $('#searchClear').hidden = true;
                if ($('#yearPicker')) $('#yearPicker').value = 'all';
                if ($('#sortPicker')) $('#sortPicker').value = 'desc';
                renderChips();
                renderList();
            });

            const fab = $('#fab');
            if (fab) fab.addEventListener('click', () => openEditor(null));

            $('#editorContent').addEventListener('input', updateCharCount);
            if (cfg.field && cfg.field.type === 'chips') {
                $('#editorField').addEventListener('input', renderPresets);
            }
            $('#tabWrite').addEventListener('click', () => {
                $('#tabWrite').classList.add('on');
                $('#tabPreview').classList.remove('on');
                $('#editorPreview').hidden = true;
                $('#editorContent').hidden = false;
            });
            $('#tabPreview').addEventListener('click', () => {
                $('#tabPreview').classList.add('on');
                $('#tabWrite').classList.remove('on');
                $('#editorPreview').innerHTML = renderParagraphs($('#editorContent').value);
                $('#editorPreview').hidden = false;
                $('#editorContent').hidden = true;
            });
            $('#editorSaveLocal').addEventListener('click', () => {
                const data = collectEditor();
                if (!data) return;
                applyEdit(data);
                closeMask('editorMask');
                renderAll();
                toast('已存到本机草稿，记得发布 💾', 'ok');
            });
            $('#editorSavePublish').addEventListener('click', async () => {
                const data = collectEditor();
                if (!data) return;
                applyEdit(data);
                closeMask('editorMask');
                renderAll();
                if (state.cfg.token) await publish();
                else { toast('已存到本机草稿；配置发布密钥后即可同步 ☁️', '', 4200); openSettings(); }
            });
            $('#editorDelete').addEventListener('click', async () => {
                const id = state.editingId;
                closeMask('editorMask');
                if (id) await deleteEntry(id);
            });
            document.addEventListener('keydown', e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && $('#editorMask').classList.contains('show')) {
                    e.preventDefault();
                    $('#editorSavePublish').click();
                }
                if (e.key === 'Escape') $$('.mask.show').forEach(m => m.classList.remove('show'));
            });

            if ($('#settingsBtn')) $('#settingsBtn').addEventListener('click', openSettings);
            $('#cfgSave').addEventListener('click', async () => {
                const c = readSettings();
                state.cfg = { owner: c.owner, repo: c.repo, branch: c.branch, token: c.token };
                state.pathOverride = (c.path && c.path !== cfg.repoPath) ? c.path : '';
                storeSet('local', LS.cfg, state.cfg);
                storeSet('local', LS.path, state.pathOverride);
                if (c.token) {
                    try {
                        state.cfg = Object.assign({}, DEFAULT_CFG, c);
                        state.pathOverride = (c.path && c.path !== cfg.repoPath) ? c.path : '';
                        await testConnection(Object.assign({}, DEFAULT_CFG, c), false);
                    } catch (e) { /* 状态已显示 */ }
                    state.cfg = { owner: c.owner, repo: c.repo, branch: c.branch, token: c.token };
                    state.pathOverride = (c.path && c.path !== cfg.repoPath) ? c.path : '';
                } else {
                    $('#cfgStatus').textContent = '已保存（没有令牌 → 本机草稿模式）';
                }
                renderAll();
                toast('设置已保存 ⚙️', 'ok');
            });
            $('#cfgTest').addEventListener('click', async () => {
                $('#cfgStatus').textContent = '正在测试连接…';
                try { await testConnection(readSettings(), false); toast('连接正常 ✅', 'ok'); }
                catch (e) { toast(e.message, 'err', 5200); }
            });
            $('#cfgClear').addEventListener('click', () => {
                state.cfg = Object.assign({}, state.cfg, { token: '' });
                storeSet('local', LS.cfg, state.cfg);
                $('#cfgToken').value = '';
                $('#cfgStatus').textContent = '令牌已从本机清除';
                renderAll();
            });

            if ($('#menuBtn')) $('#menuBtn').addEventListener('click', () => { renderMenu(); openMask('menuMask'); });
            if ($('#menuExport')) $('#menuExport').addEventListener('click', exportJson);
            if ($('#menuImport')) $('#menuImport').addEventListener('click', () => {
                if (!canManageData()) { toast('只有配置了发布密钥的你自己才能导入 🔒', 'err'); return; }
                $('#importFile').click();
            });
            $('#importFile').addEventListener('change', e => {
                const f = e.target.files && e.target.files[0];
                if (f) importJson(f);
                e.target.value = '';
            });
            if ($('#menuRevert')) $('#menuRevert').addEventListener('click', () => { closeMask('menuMask'); revertLocal(); });
            if ($('#menuLock')) $('#menuLock').addEventListener('click', () => {
                closeMask('menuMask');
                setUnlocked(false);
                toast('已退出编辑模式 🔒');
            });
            const msgEntry = $('#messageBtn');
            if (msgEntry) msgEntry.addEventListener('click', openMessage);
            $('#menuMessage').addEventListener('click', () => { closeMask('menuMask'); openMessage(); });
            $('#msgSend').addEventListener('click', sendMessage);
        }

        /* ---------- 启动 ---------- */
        async function boot() {
            const theme = storeGet('local', K.theme, 'day');
            document.documentElement.dataset.theme = theme === 'night' ? 'night' : 'day';
            const themeBtn = $('#themeBtn');
            if (themeBtn) themeBtn.textContent = theme === 'night' ? '☀️' : '🌙';

            const saved = storeGet('local', LS.cfg, null);
            if (saved) state.cfg = Object.assign({}, DEFAULT_CFG, saved);
            if (!state.cfg.owner || !state.cfg.repo) {
                const auto = detectRepo();
                if (auto) state.cfg = Object.assign({}, state.cfg, auto);
            }
            state.pathOverride = storeGet('local', LS.path, '') || '';
            state.unlocked = storeGet('session', K.unlocked, null) === '1' ||
                             storeGet('local', K.remember, false) === true;

            injectChrome(cfg, app);
            bind();
            renderAll();
            await loadData();
            renderAll();
            if (state.loadError) toast(state.loadError, 'err', 8000);
        }

        app.boot = boot;
        return app;
    }

    return {
        init: init,
        MOODS: MOODS,
        esc: esc, toast: toast, askConfirm: askConfirm,
        fmtDate: fmtDate, fmtDateShort: fmtDateShort, relTime: relTime, preview: preview,
        renderParagraphs: renderParagraphs, tagColor: tagColor,
        storeGet: storeGet, storeSet: storeSet,
        utf8ToBase64: utf8ToBase64, base64ToUtf8: base64ToUtf8, sha256Hex: sha256Hex
    };
})();
