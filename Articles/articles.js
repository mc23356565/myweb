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
        const title = e.title || (e.content || '').split('\n')[0].slice(0, 30) || '（无标题）';
        return '<div class="card col-lg-12 col-md-12 col-sm-12 col-sm-x-12 animated fadeInUp">' +
            '<div class="little_texts">' +
                '<a href="page.html?id=' + encodeURIComponent(e.id) + '">' +
                    '<div class="top-title textOneHide">' + esc(title) + '</div>' +
                '</a>' +
                '<div class="info"><span>✎ ' + esc(kindLabel(e.kind)) + (e.mood ? ' · ' + esc(e.mood) : '') +
                    ' <i>记录于</i> ' + esc(e.date) + '</span></div>' +
            '</div>' +
        '</div>';
    }

    function render() {
        const host = $('#articleHost');
        const q = query.trim().toLowerCase();
        let list = entries;
        if (q) {
            list = list.filter(e =>
                (e.content || '').toLowerCase().indexOf(q) >= 0 ||
                (e.title || '').toLowerCase().indexOf(q) >= 0 ||
                String(e.date || '').indexOf(q) >= 0);
        }
        if (!list.length) {
            host.innerHTML = '<div class="lg-empty" style="grid-column:1/-1">' +
                (entries.length ? '没有找到匹配的文章' : '还没有文章 —— 点上面的「✎ 写文章」写下第一篇吧') + '</div>';
            return;
        }
        host.innerHTML = list.map(cardOf).join('');
    }

    /* ---------- 编辑器 ---------- */
    function openEditor(id) {
        editingId = id || null;
        const e = id ? entries.find(x => x.id === id) : null;
        $('#editTitle').textContent = e ? '✎ 编辑文章' : '✎ 写文章';
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
            mood: $('#evMood').value.trim(),
            content: content,
            updated_at: new Date().toISOString()
        };
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
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') document.querySelectorAll('.lg-mask.show').forEach(m => m.classList.remove('show'));
        });
    }

    (async function main() {
        app = await SiteApp.init({ shell: 'lg', main: '#articleHost' });
        if (!app.me) return; // 登录门已渲染
        bind();
        await load();
    })();
})();
