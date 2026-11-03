/* ==========================================================================
   朴实文章（little.php + page.php 的界面，Supabase entries 表的数据）
   日常想法（journal）与思辨话题（philosophy）合并在一页展示。
   ========================================================================== */
(function () {
    'use strict';
    const $ = s => document.querySelector(s);
    const esc = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const todayStr = () => {
        const x = new Date();
        return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    };
    const kindLabel = k => k === 'philosophy' ? '思辨话题' : '日常想法';

    let app = null;
    let entries = [];
    let editingId = null;
    let query = '';
    let kindFilter = '';
    let authorFilter = '';

    /* 发布者两个选项：取后台「情侣配置」里的两个名字 */
    function authorNames() {
        const c = (app && app.config) || {};
        return [c.name_a || '他', c.name_b || '她'];
    }

    /* 没写标题的文章：取正文第一行当标题 */
    function autoTitle(e) {
        const line = (e.content || '').split('\n').map(s => s.trim()).find(s => s) || '';
        const clean = line.replace(/^[#>\-\s]+/, '').replace(/[。，、！？!?,.\s]+$/, '');
        if (!clean) return '（无标题）';
        return clean.length > 15 ? clean.slice(0, 15) + '……' : clean;
    }
    const titleOf = e => (e.title || '').trim() || autoTitle(e);

    function openMask(id) { document.getElementById(id).classList.add('show'); }
    function closeMask(id) { document.getElementById(id).classList.remove('show'); }

    async function load() {
        if (!app || !app.me) return;
        try {
            entries = (await app.sbRest('entries?kind=in.(journal,philosophy)&select=*&order=date.desc,id.desc')) || [];
        } catch (e) {
            $('#articleHost').innerHTML = '<div class="notice" style="grid-column:1/-1">加载失败：' + esc(e.message) + '</div>';
            return;
        }
        render();
    }

    function cardOf(e) {
        return '<div class="card col-lg-12 col-md-12 col-sm-12 col-sm-x-12 animated fadeInUp">' +
            '<div class="little_texts">' +
                '<a href="page.html?id=' + encodeURIComponent(e.id) + '">' +
                    '<div class="top-title textOneHide">' + esc(titleOf(e)) + '</div>' +
                '</a>' +
                '<div class="info"><span>👤 ' + esc(e.author || '佚名') +
                    (e.mood ? ' · ' + esc(e.mood) : '') +
                    ' <i>记录于</i> ' + esc(e.date) + '</span></div>' +
            '</div>' +
        '</div>';
    }

    function render() {
        const host = $('#articleHost');
        const q = query.trim().toLowerCase();
        let list = entries;
        if (kindFilter) list = list.filter(e => (e.kind || 'journal') === kindFilter);
        if (authorFilter) list = list.filter(e => (e.author || '') === authorFilter);
        if (q) {
            list = list.filter(e =>
                (e.content || '').toLowerCase().indexOf(q) >= 0 ||
                (e.title || '').toLowerCase().indexOf(q) >= 0 ||
                (e.author || '').indexOf(q) >= 0 ||
                String(e.date || '').indexOf(q) >= 0);
        }
        const count = document.getElementById('articleCount');
        if (count) count.innerHTML = '共 <b>' + list.length + '</b> 篇';
        if (!list.length) {
            host.innerHTML = '<div class="lg-empty" style="grid-column:1/-1">' +
                (entries.length ? '没有找到匹配的文章' : '还没有文章 —— 点上面的「✎ 写文章」写下第一篇吧') + '</div>';
            return;
        }
        host.innerHTML = list.map(cardOf).join('');
    }

    /* ---------- 编辑器 ---------- */
    function fillAuthorSelect(sel, val) {
        const names = authorNames();
        sel.innerHTML = names.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
        sel.value = names.indexOf(val) >= 0 ? val : names[0];
    }

    function openEditor(id) {
        editingId = id || null;
        const e = id ? entries.find(x => x.id === id) : null;
        $('#editTitle').textContent = e ? '✎ 编辑文章' : '✎ 写文章';
        fillAuthorSelect($('#evAuthor'), e ? (e.author || '') : (app.me.display_name || authorNames()[0]));
        $('#evKind').value = e ? (e.kind || 'journal') : 'journal';
        $('#evDate').value = e ? e.date : todayStr();
        $('#evTitle').value = e ? (e.title || '') : '';
        $('#evMood').value = e ? (e.mood || '') : '';
        $('#evContent').value = e ? (e.content || '') : '';
        $('#editError').textContent = '';
        $('#editDelete').hidden = !e;
        openMask('editMask');
        setTimeout(() => $('#evContent').focus(), 60);
    }

    async function save() {
        const err = $('#editError');
        err.textContent = '';
        const content = $('#evContent').value.trim();
        if (!content) { err.textContent = '正文还是空的，先写点什么吧 ✍️'; return; }
        const date = $('#evDate').value || todayStr();
        const row = {
            kind: $('#evKind').value,
            date: date,
            title: $('#evTitle').value.trim(),
            author: $('#evAuthor').value || '',
            mood: $('#evMood').value.trim(),
            content: content,
            updated_at: new Date().toISOString()
        };
        /* 标题留空就自动从正文第一行拟一个存进去 */
        if (!row.title) row.title = autoTitle({ content: content });
        const btn = $('#editSave');
        const old = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '保存中…';
        try {
            if (editingId) {
                await app.sbRest('entries?id=eq.' + encodeURIComponent(editingId), { method: 'PATCH', body: row });
                const i = entries.findIndex(x => x.id === editingId);
                if (i >= 0) entries[i] = Object.assign({}, entries[i], row);
            } else {
                const id = 'a' + date.replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 7);
                row.id = id;
                row.created_at = new Date().toISOString();
                await app.sbRest('entries', { method: 'POST', body: row });
                entries.unshift(row);
            }
            closeMask('editMask');
            render();
            app.toast('已保存到数据库 ✓', 'ok');
        } catch (e) {
            err.textContent = '❌ ' + e.message;
        } finally {
            btn.disabled = false; btn.innerHTML = old;
        }
    }

    async function del(id) {
        const e = entries.find(x => x.id === id);
        if (!e) return;
        if (!confirm('确定删除这篇文章？\n' + (e.title || e.date) + '\n\n删除后无法恢复。')) return;
        try {
            await app.sbRest('entries?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
            entries = entries.filter(x => x.id !== id);
            closeMask('editMask');
            render();
            app.toast('已删除 🗑', 'ok');
        } catch (e2) { app.toast('删除失败：' + e2.message, 'err', 4000); }
    }

    function bind() {
        document.querySelectorAll('[data-close]').forEach(x =>
            x.addEventListener('click', () => closeMask(x.dataset.close)));
        document.querySelectorAll('.lg-mask').forEach(m =>
            m.addEventListener('mousedown', e => { if (e.target === m) m.classList.remove('show'); }));
        $('#newBtn').addEventListener('click', () => openEditor(null));
        $('#editSave').addEventListener('click', save);
        $('#editDelete').addEventListener('click', () => { if (editingId) del(editingId); });
        $('#searchInput').addEventListener('input', e => { query = e.target.value; render(); });
        $('#filterKind').addEventListener('change', e => { kindFilter = e.target.value; render(); });
        $('#filterAuthor').addEventListener('change', e => { authorFilter = e.target.value; render(); });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') document.querySelectorAll('.lg-mask.show').forEach(m => m.classList.remove('show'));
        });
    }

    (async function main() {
        app = await SiteApp.init({ shell: 'lg', main: '#articleHost' });
        if (!app.me) return; // 登录门已渲染
        /* 筛选下拉：类型 + 发布者（取情侣配置里的两个名字） */
        const fa = $('#filterAuthor');
        fa.innerHTML = '<option value="">发布者：全部</option>' +
            authorNames().map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
        bind();
        await load();
    })();
})();
