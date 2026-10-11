/* ==========================================================================
   空曙 · 记忆回廊 —— 留言模块（账号版）

   规则：
     * 游客（guest）：只能看到「自己那条线」（自己发的 + 空曙的回复），可以继续回复，
       看不到别人的留言，也改不了内容。
     * 管理员（admin）：能看到所有留言线，可以逐条回复、标记已读、删除。
     * 没有账号：进不来（页面直接显示登录门）。
   这些都是数据库层面的 RLS 保证的，不是界面藏起来。
   ========================================================================== */
window.JournalComments = function (app) {
    'use strict';

    const S = app.state;
    const { esc, relTime, renderParagraphs, itemLabel, toast, askConfirm } = app;
    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    const me = () => S.me || {};
    const isAdmin = () => app.isAdmin();
    const myName = () => (isAdmin() ? (me().display_name || '空曙') : (me().display_name || me().email || '我'));

    /* ---------- 数据 ---------- */
    function reset() { S.comments = []; }

    async function load() {
        if (!app.isMember()) { S.comments = []; return; }
        const rows = await app.sbRest('comments?select=*&order=created_at.asc');
        S.comments = Array.isArray(rows) ? rows : [];
    }

    const rowsFor = itemKey => S.comments.filter(c => c.item_key === itemKey);
    function threadsFor(itemKey) {
        const map = new Map();
        rowsFor(itemKey).forEach(c => {
            const key = c.thread_key || ('uid:' + (c.author_id || 'x'));
            if (!map.has(key)) map.set(key, { key: key, rows: [], name: c.author_name, last: c.created_at, unread: 0, mine: c.author_id === S.session.uid });
            const t = map.get(key);
            t.rows.push(c);
            if (c.role !== 'admin' && c.author_name) t.name = c.author_name;   // 线程名用游客的名字
            if (c.created_at > t.last) t.last = c.created_at;
            if (!c.is_read && c.role !== 'admin') t.unread++;
            t.mine = t.mine || c.author_id === S.session.uid;
        });
        return Array.from(map.values());
    }

    async function post(entry, body, parentId, threadKey) {
        const admin = isAdmin();
        await app.sbRest('comments', {
            method: 'POST',
            body: {
                item_key: entry.id,
                item_label: itemLabel(entry),
                thread_key: threadKey || S.session.uid,     // 游客：自己；管理员：回复谁就挂谁
                parent_id: parentId || null,
                role: admin ? 'admin' : 'guest',
                author_id: S.session.uid || null,
                author_email: me().email || '',
                author_name: admin ? (me().display_name || '空曙') : (me().display_name || me().email || '游客'),
                body: body
            }
        });
        await load();
    }
    async function markRead(id, read) {
        await app.sbRest('comments?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: { is_read: read } });
        const c = S.comments.find(x => String(x.id) === String(id));
        if (c) c.is_read = read;
        app.refresh();
    }
    async function remove(id) {
        await app.sbRest('comments?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
        S.comments = S.comments.filter(x => String(x.id) !== String(id));
        app.refresh();
    }

    /* ---------- 渲染 ---------- */
    function messageHtml(c, threadKey) {
        const fromAdmin = c.role === 'admin';
        const mine = c.author_id === S.session.uid;
        const parent = c.parent_id ? S.comments.find(x => String(x.id) === String(c.parent_id)) : null;
        return `
        <div class="cmt-item${fromAdmin ? ' from-admin' : ''}${!c.is_read && !fromAdmin ? ' unread' : ''}" data-cid="${esc(c.id)}">
            <div class="cmt-meta">
                <b class="cmt-who">${esc(c.author_name || '游客')}</b>
                <span class="cmt-role">${fromAdmin ? '管理员' : (mine ? '我' : '游客')}</span>
                ${parent ? `<span class="cmt-re-to">回复 ${esc(parent.author_name || '')}</span>` : ''}
                <span class="cmt-time">${esc(relTime(c.created_at))}</span>
                <span class="cmt-actions">
                    <button class="btn sm cmt-reply" data-cid="${esc(c.id)}" data-name="${esc(c.author_name || '')}">回复</button>
                    ${isAdmin() && !fromAdmin
                        ? `<button class="icon-btn cmt-read" data-cid="${esc(c.id)}" data-next="${c.is_read ? '0' : '1'}" title="${c.is_read ? '标为未读' : '标为已读'}">${c.is_read ? '✓' : '○'}</button>`
                        : ''}
                    ${isAdmin() ? `<button class="icon-btn danger cmt-del" data-cid="${esc(c.id)}" title="删除">🗑</button>` : ''}
                </span>
            </div>
            <div class="cmt-text-body prose">${renderParagraphs(c.body)}</div>
        </div>`;
    }

    function listHtml(rows, threadKey) {
        if (!rows.length) return '<div class="cmt-empty">还没有留言，说点什么吧。</div>';
        return '<div class="cmt-list">' + rows.map(c => messageHtml(c, threadKey)).join('') + '</div>';
    }

    function formHtml(placeholder, compact) {
        return `
        <div class="cmt-form">
            <div class="cmt-reply-hint" hidden>正在回复 <b></b><button class="cmt-reply-cancel" type="button">取消</button></div>
            <textarea class="input cmt-text" placeholder="${esc(placeholder)}"></textarea>
            <div class="cmt-form-foot">
                <button class="btn primary cmt-send" type="button">送出</button>
                <span class="cmt-status"></span>
            </div>
        </div>`;
    }

    function panelHtml(e, admin) {
        if (!app.isMember()) return '';
        const rows = rowsFor(e.id);
        const threads = threadsFor(e.id);
        const open = S.cmtOpenIds.has(e.id);
        if (!admin) {
            const mine = rows;   // RLS 保证这里只有「自己那条线」（自己发的 + 空曙的回复）
            return `
            <div class="cmt" data-cmt="${esc(e.id)}">
                <div class="cmt-bar">
                    <span class="cmt-title">💬 我和空曙的留言</span>
                    <span class="cmt-count">${mine.length} 条</span>
                    <span class="cmt-hint">只有你俩看得到</span>
                    <button class="btn sm cmt-toggle" type="button">${open ? '收起' : '展开 / 留言'}</button>
                </div>
                <div class="cmt-panel"${open ? '' : ' hidden'}>
                    ${listHtml(mine, 'me')}
                    ${formHtml('给空曙留言…（空一行分段）')}
                </div>
            </div>`;
        }
        const total = rows.length;
        const unread = rows.filter(c => !c.is_read && c.role !== 'admin').length;
        return `
        <div class="cmt" data-cmt="${esc(e.id)}">
            <div class="cmt-bar">
                <span class="cmt-title">💬 留言</span>
                <span class="cmt-count">${total} 条${unread ? ` · <b>${unread} 条未读</b>` : ''}${threads.length > 1 ? ` · ${threads.length} 个人` : ''}</span>
                <button class="btn sm cmt-toggle" type="button">${open ? '收起' : '查看 / 回复'}</button>
            </div>
            <div class="cmt-panel"${open ? '' : ' hidden'}>
                ${threads.length ? threads.map(t => `
                    <div class="cmt-thread" data-author="${esc(t.key)}">
                        <div class="cmt-thread-head">
                            <b>${esc(t.name || '游客')}</b>
                            <span class="cmt-mail">${esc(t.key.indexOf('uid:') === 0 ? '' : t.key)}</span>
                            <span class="cmt-time">最近 ${esc(relTime(t.last))}</span>
                            ${t.unread ? `<span class="cmt-unread">${t.unread} 条未读</span>` : ''}
                        </div>
                        ${listHtml(t.rows, t.key)}
                        ${formHtml('回复' + (t.name || '这位访客') + '…')}
                    </div>`).join('')
                  : '<div class="cmt-empty">这一条还没有人留言</div>'}
            </div>
        </div>`;
    }

    /** 标题栏角标：管理员看总数/未读，游客看自己有多少条 */
    function badgeHtml(e) {
        if (!app.isMember()) return '';
        const rows = rowsFor(e.id);
        if (!rows.length) return '';
        if (isAdmin()) {
            const unread = rows.filter(c => !c.is_read && c.role !== 'admin').length;
            return `<span class="tag cmt-badge${unread ? ' has-unread' : ''}">💬 ${rows.length}</span>`;
        }
        return rows.length ? `<span class="tag cmt-badge">💬 ${rows.length}</span>` : '';
    }

    function bindPanel(node, admin) {
        if (!app.isMember()) return;
        const id = node.dataset.id;
        const entry = S.entries.find(e => e.id === id);
        const panel = $('.cmt-panel', node);
        const toggle = $('.cmt-toggle', node);
        if (!entry || !panel || !toggle) return;

        toggle.addEventListener('click', ev => {
            ev.stopPropagation();
            panel.hidden = !panel.hidden;
            if (panel.hidden) S.cmtOpenIds.delete(id);
            else {
                S.cmtOpenIds.add(id);
                const f = $('.cmt-text', panel);
                if (f) setTimeout(() => f.focus(), 40);
            }
            toggle.textContent = panel.hidden ? (admin ? '查看 / 回复' : '展开 / 留言') : '收起';
        });

        // 「回复」按钮：把该条设为回复目标
        $$('.cmt-reply', node).forEach(btn => btn.addEventListener('click', ev => {
            ev.stopPropagation();
            const holder = btn.closest('.cmt-thread') || panel;
            const form = $('.cmt-form', holder);
            if (!form) return;
            form.dataset.replyTo = btn.dataset.cid;
            const hint = $('.cmt-reply-hint', form);
            if (hint) { hint.hidden = false; $('b', hint).textContent = '@' + (btn.dataset.name || ''); }
            const f = $('.cmt-text', form);
            if (f) f.focus();
        }));
        $$('.cmt-reply-cancel', node).forEach(btn => btn.addEventListener('click', ev => {
            ev.stopPropagation();
            const form = btn.closest('.cmt-form');
            delete form.dataset.replyTo;
            const hint = $('.cmt-reply-hint', form);
            if (hint) hint.hidden = true;
        }));

        // 送出
        $$('.cmt-send', node).forEach(btn => btn.addEventListener('click', async ev => {
            ev.stopPropagation();
            const form = btn.closest('.cmt-form');
            const status = $('.cmt-status', form);
            const ta = $('.cmt-text', form);
            const body = ta.value.trim();
            if (!body) { status.textContent = '内容还是空的'; status.style.color = 'var(--danger)'; ta.focus(); return; }
            const old = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 送出中…';
            try {
                const threadEl = btn.closest('.cmt-thread');
                const threadKey = threadEl ? threadEl.dataset.author : S.session.uid;
                await post(entry, body, form.dataset.replyTo || null, threadKey);
                ta.value = '';
                delete form.dataset.replyTo;
                const hint = $('.cmt-reply-hint', form);
                if (hint) hint.hidden = true;
                status.textContent = '✨ 已送出';
                status.style.color = 'var(--ok)';
                app.refresh();
            } catch (err) {
                console.error(err);
                status.textContent = '❌ ' + err.message;
                status.style.color = 'var(--danger)';
            } finally {
                btn.disabled = false; btn.innerHTML = old;
            }
        }));

        $$('.cmt-read', node).forEach(btn => btn.addEventListener('click', async ev => {
            ev.stopPropagation();
            try { await markRead(btn.dataset.cid, btn.dataset.next === '1'); }
            catch (e) { toast('操作失败：' + e.message, 'err'); }
        }));
        $$('.cmt-del', node).forEach(btn => btn.addEventListener('click', async ev => {
            ev.stopPropagation();
            const ok = await askConfirm({ title: '删除这条留言？', text: '删除后无法恢复。', ok: '删除', danger: true });
            if (!ok) return;
            try { await remove(btn.dataset.cid); toast('已删除 🗑', 'ok'); }
            catch (e) { toast('删除失败：' + e.message, 'err'); }
        }));
    }

    /** 点卡片上的 💬 → 展开留言区 */
    function onHeadClick(id) {
        if (!app.isMember()) return false;
        S.cmtOpenIds.add(id);
        S.openIds.add(id);
        app.refresh();
        setTimeout(() => {
            const node = document.querySelector('.entry[data-id="' + id + '"]');
            if (node) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 120);
        return true;
    }

    return {
        load: load, reset: reset,
        panelHtml: panelHtml, badgeHtml: badgeHtml,
        bindPanel: bindPanel, onHeadClick: onHeadClick
    };
};
