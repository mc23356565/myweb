/* ==========================================================================
   朴实文章 · 详情页（page.php 的界面，按 ?id= 从 Supabase entries 取数据）
   ========================================================================== */
(function () {
    'use strict';
    const $ = s => document.querySelector(s);
    const esc = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const kindLabel = k => k === 'philosophy' ? '思辨话题' : '日常想法';

    /* 纯文本 → 段落：空行分段，单换行保留成 <br> */
    function renderContent(text) {
        return String(text || '').split(/\n{2,}/).map(p =>
            '<p style="margin:1rem 0;">' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');
    }

    function openMask(id) { document.getElementById(id).classList.add('show'); }
    function closeMask(id) { document.getElementById(id).classList.remove('show'); }

    /* 发布者下拉：取情侣配置里的两个名字 */
    function fillAuthorSelect(sel, val) {
        const c = (window.SiteApp && SiteApp.config) ? SiteApp.config() : {};
        const names = [c.name_a || '他', c.name_b || '她'];
        sel.innerHTML = names.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
        sel.value = names.indexOf(val) >= 0 ? val : names[0];
    }

    (async function main() {
        const app = await SiteApp.init({ shell: 'lg', main: '#pageHost' });
        if (!app.me) return; // 登录门已渲染

        document.querySelectorAll('[data-close]').forEach(x =>
            x.addEventListener('click', () => closeMask(x.dataset.close)));
        document.querySelectorAll('.lg-mask').forEach(m =>
            m.addEventListener('mousedown', e => { if (e.target === m) m.classList.remove('show'); }));

        const id = new URLSearchParams(location.search).get('id');
        const host = $('#pageHost');
        if (!id) { host.innerHTML = '<div class="lg-empty" style="grid-column:1/-1">参数错误或页面不存在！</div>'; return; }

        let e;
        try {
            const rows = await app.sbRest('entries?id=eq.' + encodeURIComponent(id) + '&select=*');
            e = (rows || [])[0];
        } catch (err) {
            host.innerHTML = '<div class="lg-empty" style="grid-column:1/-1">加载失败：' + esc(err.message) + '</div>';
            return;
        }
        if (!e) { host.innerHTML = '<div class="lg-empty" style="grid-column:1/-1">文章不存在或已被删除。</div>'; return; }
        const title = e.title || '（无标题）';

        host.innerHTML =
            '<div class="card col-lg-12 col-md-12 col-sm-12 col-sm-x-12 animated fadeInUp">' +
                '<div class="little_texts">' +
                    '<div class="top-title f2">' + esc(title) + '</div>' +
                    '<div class="info"><span>👤 ' + esc(e.author || '佚名') +
                        (e.mood ? ' · ' + esc(e.mood) : '') +
                        ' <i>记录于</i> ' + esc(e.date) + '</span></div>' +
                    '<div class="line-top"></div>' +
                    '<div id="md-view" class="file">' + renderContent(e.content) + '</div>' +
                    '<div class="line"><p>The content ends here.</p></div>' +
                    '<div class="lg-opsbar" style="margin-top:0;">' +
                        '<a class="lg-btn" href="index.html">← 返回列表</a>' +
                        '<button class="lg-btn blue" id="pgEdit">✎ 编辑</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        $('#pgEdit').addEventListener('click', () => {
            fillAuthorSelect($('#evAuthor'), e.author || '');
            $('#evKind').value = e.kind || 'journal';
            $('#evDate').value = e.date || '';
            $('#evTitle').value = e.title || '';
            $('#evMood').value = e.mood || '';
            $('#evContent').value = e.content || '';
            $('#editError').textContent = '';
            openMask('editMask');
        });
        $('#editSave').addEventListener('click', async () => {
            const err = $('#editError');
            err.textContent = '';
            const content = $('#evContent').value.trim();
            if (!content) { err.textContent = '正文还是空的 ✍️'; return; }
            const row = {
                kind: $('#evKind').value,
                date: $('#evDate').value || e.date,
                title: $('#evTitle').value.trim(),
                author: $('#evAuthor').value || '',
                mood: $('#evMood').value.trim(),
                content: content,
                updated_at: new Date().toISOString()
            };
            if (!row.title) {
                const line = content.split('\n').map(s => s.trim()).find(s => s) || '';
                const clean = line.replace(/^[#>\-\s]+/, '').replace(/[。，、！？!?,.\s]+$/, '');
                row.title = clean ? (clean.length > 15 ? clean.slice(0, 15) + '……' : clean) : '（无标题）';
            }
            const btn = $('#editSave');
            const old = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '保存中…';
            try {
                await app.sbRest('entries?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: row });
                app.toast('已保存 ✓', 'ok');
                setTimeout(() => location.reload(), 500);
            } catch (e2) {
                err.textContent = '❌ ' + e2.message;
                btn.disabled = false; btn.innerHTML = old;
            }
        });
        $('#editDelete').addEventListener('click', async () => {
            if (!confirm('确定删除这篇文章？删除后无法恢复。')) return;
            try {
                await app.sbRest('entries?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
                location.href = 'index.html';
            } catch (e2) { app.toast('删除失败：' + e2.message, 'err', 4000); }
        });
    })();
})();
