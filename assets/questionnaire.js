/* ==========================================================================
   空曙 · 记忆回廊 —— 问卷小屋引擎
   两块功能：
     1. 设计问卷：完全自定义（单选 / 多选 / 文本题），
        支持一种纯文本格式直接导入，另附「喂给 AI 的提示词」自动生成该格式
     2. 答问卷：作答 / 修改答卷，结果双方互看每道题的答案
   数据存在 Supabase：surveys / survey_questions / survey_responses
   ========================================================================== */
(function () {
    'use strict';

    const TYPE_LABEL = { single: '单选', multi: '多选', text: '文本' };

    const AI_PROMPT = [
        '你是「记忆回廊」的问卷格式化助手。请把我发给你的问卷内容，转换成下面的纯文本格式直接输出（不要加任何解释，不要用代码块包裹）：',
        '',
        '# 问卷标题',
        '> 问卷描述（可省略，每行以 > 开头）',
        '1. 第一个问题的题干 [单选]',
        '- 选项一',
        '- 选项二',
        '2. 第二个问题的题干 [多选]',
        '- 选项一',
        '- 选项二',
        '- 选项三',
        '3. 第三个问题的题干 [文本]',
        '',
        '格式规则（必须严格遵守）：',
        '1. 第一行是问卷标题，以「# 」开头；',
        '2. 描述行以「> 」开头，可以没有，也可以多行；',
        '3. 每个问题一行，以「数字. 」开头，编号从 1 开始连续递增；',
        '4. 题型标记写在题干末尾的方括号里：[单选] / [多选] / [文本]，三者必选其一；',
        '5. 单选题和多选题的选项紧跟在问题下面，每行一个选项，以「- 」开头；',
        '6. 文本题不需要选项行；',
        '7. 除上述内容外，不要输出任何别的东西。'
    ].join('\n');

    /* ====================== 文本格式解析 ====================== */
    function parseSurveyText(text) {
        const lines = String(text || '').split(/\r?\n/);
        const out = { title: '', description: [], questions: [] };
        let cur = null;
        const pushCur = () => {
            if (cur) {
                if (!cur.qtype) cur.qtype = cur.options.length ? 'single' : 'text';
                if (!cur.prompt) return; // 没有题干就丢弃
                out.questions.push(cur);
            }
            cur = null;
        };
        for (const raw of lines) {
            const t = raw.trim();
            if (!t) continue;
            if (t.charAt(0) === '#' && !cur) {
                const v = t.replace(/^#+\s*/, '').trim();
                if (v && !out.title) out.title = v;
                continue;
            }
            if (t.charAt(0) === '>') {
                const v = t.replace(/^>+\s*/, '').trim();
                if (v) out.description.push(v);
                continue;
            }
            const qm = t.match(/^\(?\s*(\d{1,3})\s*[.、．)）]\s*(.+)$/);
            if (qm) {
                pushCur();
                let prompt = qm[2].trim();
                let qtype = null;
                const tm = prompt.match(/\[\s*(单选|多选|文本|single|multi|text)\s*\]\s*$/i);
                if (tm) {
                    const tag = tm[1].toLowerCase();
                    qtype = tag === '单选' || tag === 'single' ? 'single'
                          : tag === '多选' || tag === 'multi' ? 'multi' : 'text';
                    prompt = prompt.slice(0, tm.index).trim();
                }
                cur = { prompt: prompt, qtype: qtype, options: [] };
                continue;
            }
            const om = t.match(/^[-•·]\s*(.+)$/) || t.match(/^\(?([A-Ha-h])\s*[.、．)）]\s*(.+)$/);
            if (om && cur) {
                cur.options.push((om[2] || om[1]).trim());
                continue;
            }
            // 其它行：有题干就追加，没有就当描述
            if (cur && cur.prompt) cur.prompt += ' ' + t;
            else out.description.push(t);
        }
        pushCur();
        return {
            title: out.title,
            description: out.description.join('\n'),
            questions: out.questions
        };
    }

    /* ====================== 页面应用 ====================== */
    let app = null;          // SiteApp 返回的 { me, sbRest, ... }
    let surveys = [];
    let questionsBySurvey = {};
    let responsesBySurvey = {};
    let draft = null;        // 设计器中的问卷草稿 { title, description, questions: [{prompt,qtype,options}] }
    let currentSurveyId = null;

    const esc = s => SiteApp.esc(s);
    const byId = id => document.getElementById(id);

    function nameOf(email) {
        if (!email) return '未知';
        if (app.me && email === app.me.email) return app.me.display_name || (email.split('@')[0] || '我');
        return email.split('@')[0] || '对方';
    }

    async function loadAll() {
        surveys = (await app.sbRest('surveys?select=*&order=created_at.desc')) || [];
        const qs = (await app.sbRest('survey_questions?select=*&order=idx.asc,id.asc')) || [];
        const rs = (await app.sbRest('survey_responses?select=*&order=submitted_at.desc')) || [];
        questionsBySurvey = {};
        qs.forEach(q => {
            (questionsBySurvey[q.survey_id] = questionsBySurvey[q.survey_id] || []).push({
                id: q.id, prompt: q.prompt || '', qtype: q.qtype || 'single',
                options: Array.isArray(q.options) ? q.options : []
            });
        });
        responsesBySurvey = {};
        rs.forEach(r => {
            (responsesBySurvey[r.survey_id] = responsesBySurvey[r.survey_id] || []).push(r);
        });
    }

    function myResponse(sid) {
        const list = responsesBySurvey[sid] || [];
        return list.find(r => r.responder_email === app.me.email) || null;
    }
    function otherResponse(sid) {
        const list = responsesBySurvey[sid] || [];
        return list.find(r => r.responder_email !== app.me.email) || null;
    }
    function fmtTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return '';
        const p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    /* ---------- 视图：问卷列表 ---------- */
    function showList() {
        currentSurveyId = null;
        const host = byId('viewHost');
        let cards;
        if (!surveys.length) {
            cards = '<div class="empty-state">📝 还没有任何问卷。<br>点上面的「设计问卷」，出第一份题考考她吧。</div>';
        } else {
            cards = surveys.map((s, i) => {
                const qs = questionsBySurvey[s.id] || [];
                const mine = myResponse(s.id);
                const other = otherResponse(s.id);
                return '<div class="card anim-up" style="cursor:default;">' +
                    '<div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;">' +
                        '<div class="card-icon" style="width:52px;height:52px;font-size:1.8rem;margin-bottom:0;">📋</div>' +
                        '<div style="flex:1 1 260px;">' +
                            '<h3 style="font-size:1.15rem;">' + esc(s.title) + '</h3>' +
                            (s.description ? '<p style="margin:.3rem 0 .5rem;">' + esc(s.description).replace(/\n/g, '<br>') + '</p>' : '') +
                            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                                '<span class="badge">' + qs.length + ' 道题</span>' +
                                '<span class="badge ' + (mine ? 'green' : 'gold') + '">我：' + (mine ? '已作答' : '未作答') + '</span>' +
                                '<span class="badge ' + (other ? 'green' : 'pink') + '">对方：' + (other ? '已作答' : '未作答') + '</span>' +
                                '<span class="badge">' + esc(nameOf(s.created_by)) + ' 出题 · ' + fmtTime(s.created_at) + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                            '<button class="btn sm blue" data-act="answer" data-id="' + esc(s.id) + '">' + (mine ? '✏️ 修改答卷' : '✍️ 去作答') + '</button>' +
                            '<button class="btn sm ghost" data-act="results" data-id="' + esc(s.id) + '">👀 查看结果</button>' +
                            '<button class="btn sm danger" data-act="del" data-id="' + esc(s.id) + '">🗑 删除</button>' +
                        '</div>' +
                    '</div></div>';
            }).join('');
        }
        host.innerHTML =
            '<div class="tabs">' +
                '<button class="tab-btn on" data-tab="list">📋 问卷列表</button>' +
                '<button class="tab-btn" data-tab="design">🛠 设计问卷</button>' +
            '</div>' + cards;
        bindTabs(host);
        host.querySelectorAll('[data-act]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                if (btn.dataset.act === 'answer') showAnswer(id);
                else if (btn.dataset.act === 'results') showResults(id);
                else if (btn.dataset.act === 'del') {
                    if (!confirm('确定删除这份问卷吗？题目和双方的答卷都会一起删除。')) return;
                    try {
                        await app.sbRest('surveys?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
                        app.toast('问卷已删除 🗑', 'ok');
                        await loadAll(); showList();
                    } catch (e) { app.toast('删除失败：' + e.message, 'err', 4000); }
                }
            });
        });
    }

    /* ---------- 视图：设计问卷 ---------- */
    function blankQuestion() { return { prompt: '', qtype: 'single', options: ['', ''] }; }

    function showDesign(imported) {
        draft = imported || { title: '', description: '', questions: [blankQuestion()] };
        renderDesign();
    }

    function renderDesign(errMsg) {
        const host = byId('viewHost');
        const qHtml = draft.questions.map((q, qi) => {
            const isChoice = q.qtype !== 'text';
            const opts = isChoice
                ? q.options.map((o, oi) =>
                    '<div class="opt-edit">' +
                        '<span style="color:var(--ink-3);font-size:.8rem;flex:none;">' + (oi + 1) + '.</span>' +
                        '<input class="input" data-q="' + qi + '" data-opt="' + oi + '" value="' + esc(o) + '" placeholder="选项 ' + (oi + 1) + '">' +
                        '<button class="icon-btn danger" data-act="delOpt" data-q="' + qi + '" data-opt="' + oi + '" title="删除该选项">✕</button>' +
                    '</div>').join('')
                : '<div class="notice" style="margin-top:.5rem;">答题的人会看到一个多行文本框，想写多长写多长。</div>';
            return '<div class="build-q">' +
                '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:.6rem;">' +
                    '<span class="q-index">' + (qi + 1) + '</span>' +
                    '<select class="select" style="width:auto;" data-act="type" data-q="' + qi + '">' +
                        '<option value="single"' + (q.qtype === 'single' ? ' selected' : '') + '>单选题</option>' +
                        '<option value="multi"' + (q.qtype === 'multi' ? ' selected' : '') + '>多选题</option>' +
                        '<option value="text"' + (q.qtype === 'text' ? ' selected' : '') + '>文本题</option>' +
                    '</select>' +
                    '<span style="flex:1;"></span>' +
                    '<button class="icon-btn" data-act="up" data-q="' + qi + '" title="上移">↑</button>' +
                    '<button class="icon-btn" data-act="down" data-q="' + qi + '" title="下移">↓</button>' +
                    '<button class="icon-btn danger" data-act="delQ" data-q="' + qi + '" title="删除本题">🗑</button>' +
                '</div>' +
                '<input class="input" data-q="' + qi + '" data-prompt="1" value="' + esc(q.prompt) + '" placeholder="这道题想问什么？">' +
                '<div style="margin-top:.6rem;">' + opts + '</div>' +
                (isChoice ? '<button class="btn sm ghost" data-act="addOpt" data-q="' + qi + '" style="margin-top:.5rem;">＋ 加一个选项</button>' : '') +
            '</div>';
        }).join('');

        host.innerHTML =
            '<div class="tabs">' +
                '<button class="tab-btn" data-tab="list">📋 问卷列表</button>' +
                '<button class="tab-btn on" data-tab="design">🛠 设计问卷</button>' +
            '</div>' +
            '<div class="card" style="cursor:default;">' +
                '<div class="field"><label>问卷标题<span class="hint">必填</span></label>' +
                    '<input class="input" id="svTitle" value="' + esc(draft.title) + '" placeholder="例如：关于我们的十个小问题"></div>' +
                '<div class="field"><label>问卷描述<span class="hint">可空</span></label>' +
                    '<textarea class="textarea" id="svDesc" style="min-height:70px;" placeholder="给答题人的一段话…">' + esc(draft.description) + '</textarea></div>' +
                '<div class="tabs" style="margin:.6rem 0;"><button class="tab-btn on" data-mode="build">🧩 手动设计</button><button class="tab-btn" data-mode="import">📥 文本导入</button><button class="tab-btn" data-mode="ai">🤖 AI 提示词</button></div>' +
                '<div id="modeBuild">' +
                    (draft.questions.length ? qHtml : '<div class="empty-state">还没有题目，点下面加第一题。</div>') +
                    '<button class="btn sm blue" id="addQBtn">＋ 加一道题</button>' +
                    '<div style="margin-top:1.2rem;display:flex;gap:10px;flex-wrap:wrap;">' +
                        '<button class="btn" id="saveSurveyBtn">💾 保存问卷</button>' +
                    '</div>' +
                '</div>' +
                '<div id="modeImport" hidden>' +
                    '<div class="notice" style="margin-bottom:.8rem;">按格式写好（或让 AI 生成）整段粘贴到这里，点「解析预览」→ 确认无误后保存。<br>' +
                    '<code># 标题</code> ／ <code>&gt; 描述</code> ／ <code>1. 题干 [单选]</code> ／ <code>- 选项</code> ／ 文本题不加选项、标 [文本]</div>' +
                    '<textarea class="textarea" id="importText" style="min-height:220px;" placeholder="# 关于我们的十个小问题\n&gt; 请认真作答哦\n1. 你最喜欢什么颜色？[单选]\n- 蓝色\n- 粉色\n2. 用一句话形容今天 [文本]"></textarea>' +
                    '<div style="margin-top:.8rem;display:flex;gap:10px;flex-wrap:wrap;">' +
                        '<button class="btn sm" id="parseBtn">🔍 解析预览</button>' +
                    '</div>' +
                    '<div id="parseResult" style="margin-top:1rem;"></div>' +
                '</div>' +
                '<div id="modeAi" hidden>' +
                    '<div class="notice" style="margin-bottom:.8rem;">把下面这段提示词原样发给任意 AI（ChatGPT / 豆包 / 我都行），再把你想出的问卷内容一并发给它，它就会输出可以「文本导入」的标准格式。</div>' +
                    '<pre class="code-block" id="aiPromptBox">' + esc(AI_PROMPT) + '</pre>' +
                    '<button class="btn sm blue" id="copyPromptBtn" style="margin-top:.8rem;">📋 复制提示词</button>' +
                '</div>' +
                (errMsg ? '<div class="gate-error" style="margin-top:.8rem;">' + esc(errMsg) + '</div>' : '') +
            '</div>';

        bindTabs(host);
        // 三种设计模式切换
        host.querySelectorAll('[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                host.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('on'));
                btn.classList.add('on');
                byId('modeBuild').hidden = btn.dataset.mode !== 'build';
                byId('modeImport').hidden = btn.dataset.mode !== 'import';
                byId('modeAi').hidden = btn.dataset.mode !== 'ai';
            });
        });
        bindDesignInputs();
        bindDesignButtons();
    }

    function collectDraftInputs() {
        const titleEl = byId('svTitle');
        const descEl = byId('svDesc');
        if (titleEl) draft.title = titleEl.value;
        if (descEl) draft.description = descEl.value;
    }

    function bindDesignInputs() {
        if (designInputsBound) return;
        designInputsBound = true;
        const host = byId('viewHost');
        // 输入即写入草稿
        host.addEventListener('input', e => {
            const el = e.target;
            if (el.id === 'svTitle') draft.title = el.value;
            else if (el.id === 'svDesc') draft.description = el.value;
            else if (el.dataset.prompt) draft.questions[+el.dataset.q].prompt = el.value;
            else if (el.dataset.opt !== undefined) draft.questions[+el.dataset.q].options[+el.dataset.opt] = el.value;
        });
        host.addEventListener('change', e => {
            const el = e.target;
            if (el.dataset.act === 'type') draft.questions[+el.dataset.q].qtype = el.value;
        });
    }
    let designInputsBound = false;
    let designButtonsBound = false;
    let answerChangeBound = false;

    function bindDesignButtons() {
        if (designButtonsBound) return;
        designButtonsBound = true;
        const host = byId('viewHost');
        host.addEventListener('click', async e => {
            const btn = e.target.closest('[data-act]');
            const errEl = host.querySelector('.gate-error');
            if (btn) {
                const qi = +btn.dataset.q;
                const act = btn.dataset.act;
                if (act === 'addOpt') draft.questions[qi].options.push('');
                else if (act === 'delOpt') draft.questions[qi].options.splice(+btn.dataset.opt, 1);
                else if (act === 'addQ') { /* 走 id 分支 */ }
                else if (act === 'delQ') draft.questions.splice(qi, 1);
                else if (act === 'up' && qi > 0) {
                    const [q] = draft.questions.splice(qi, 1);
                    draft.questions.splice(qi - 1, 0, q);
                } else if (act === 'down' && qi < draft.questions.length - 1) {
                    const [q] = draft.questions.splice(qi, 1);
                    draft.questions.splice(qi + 1, 0, q);
                }
                if (['addOpt', 'delOpt', 'delQ', 'up', 'down'].includes(act)) { renderDesign(); return; }
            }
            if (e.target.closest('#addQBtn')) { collectDraftInputs(); draft.questions.push(blankQuestion()); renderDesign(); return; }
            if (e.target.closest('#saveSurveyBtn')) { collectDraftInputs(); await saveSurvey(); return; }
            if (e.target.closest('#parseBtn')) {
                collectDraftInputs();
                const parsed = parseSurveyText(byId('importText').value);
                const box = byId('parseResult');
                if (!parsed.title || !parsed.questions.length) {
                    box.innerHTML = '<div class="notice" style="border-left-color:var(--pink);">❌ 没解析出有效的问卷：确认第一行是 <code># 标题</code>，且至少有一个 <code>数字. 题干</code>。</div>';
                    return;
                }
                const preview = parsed.questions.map((q, i) =>
                    '<div style="margin:.4rem 0;font-size:.88rem;"><b>' + (i + 1) + '.</b> ' + esc(q.prompt) +
                    ' <span class="q-type-tag">' + TYPE_LABEL[q.qtype] + '</span>' +
                    (q.options.length ? '<div style="color:var(--ink-3);font-size:.8rem;margin-left:1.2rem;">选项：' + q.options.map(esc).join(' ／ ') + '</div>' : '') +
                    '</div>').join('');
                box.innerHTML = '<div class="notice">解析到 <b>' + parsed.questions.length + '</b> 道题，标题「<b>' + esc(parsed.title) + '</b>」。没问题就点保存 ↓</div>' +
                    '<div style="margin:.8rem 0;">' + preview + '</div>' +
                    '<button class="btn" id="saveParsedBtn">💾 保存这份问卷</button>';
                byId('saveParsedBtn').addEventListener('click', async () => {
                    draft = { title: parsed.title, description: parsed.description, questions: parsed.questions };
                    await saveSurvey();
                });
                return;
            }
            if (e.target.closest('#copyPromptBtn')) {
                try {
                    await navigator.clipboard.writeText(AI_PROMPT);
                    app.toast('提示词已复制，去发给 AI 吧 🤖', 'ok');
                } catch (err) {
                    app.toast('复制失败，请手动选中复制', 'err');
                }
            }
            if (errEl) errEl.remove();
        });
    }

    async function saveSurvey() {
        const title = (draft.title || '').trim();
        if (!title) { app.toast('先给问卷起个标题', 'err'); return; }
        const qs = draft.questions.filter(q => (q.prompt || '').trim());
        if (!qs.length) { app.toast('至少要有一道题', 'err'); return; }
        const bad = qs.find(q => q.qtype !== 'text' && !q.options.filter(o => (o || '').trim()).length);
        if (bad) { app.toast('「' + (bad.prompt || '未命名题目') + '」是选择题，至少要有一个选项', 'err', 3600); return; }
        try {
            const sid = SiteApp.newId('s');
            await app.sbRest('surveys', {
                method: 'POST',
                body: { id: sid, title: title, description: draft.description || '', created_by: app.me.email }
            });
            const rows = qs.map((q, i) => ({
                survey_id: sid, idx: i, qtype: q.qtype,
                prompt: q.prompt.trim(),
                options: q.qtype === 'text' ? [] : q.options.map(o => (o || '').trim()).filter(Boolean)
            }));
            await app.sbRest('survey_questions', { method: 'POST', body: rows });
            app.toast('问卷已发布 🎉', 'ok');
            await loadAll(); showList();
        } catch (e) {
            renderDesign('保存失败：' + e.message + '（如果提示表不存在，先去后台执行数据库安装 SQL）');
        }
    }

    /* ---------- 视图：作答 ---------- */
    function showAnswer(sid) {
        currentSurveyId = sid;
        const survey = surveys.find(s => s.id === sid);
        const qs = questionsBySurvey[sid] || [];
        if (!survey || !qs.length) { app.toast('问卷不存在或没有题目', 'err'); showList(); return; }
        const mine = myResponse(sid);
        const saved = (mine && mine.answers) || {};
        const host = byId('viewHost');

        const qHtml = qs.map((q, qi) => {
            let body = '';
            if (q.qtype === 'text') {
                body = '<textarea class="textarea" style="min-height:100px;" data-answer="' + q.id + '" data-qtype="text" placeholder="想写多长写多长…">' + esc(saved[q.id] || '') + '</textarea>';
            } else if (q.qtype === 'multi') {
                const picked = Array.isArray(saved[q.id]) ? saved[q.id] : [];
                body = q.options.map(o =>
                    '<label class="opt-row' + (picked.includes(o) ? ' picked' : '') + '">' +
                        '<input type="checkbox" data-answer="' + q.id + '" data-qtype="multi" value="' + esc(o) + '"' + (picked.includes(o) ? ' checked' : '') + '>' +
                        '<span>' + esc(o) + '</span></label>').join('');
            } else {
                body = q.options.map(o =>
                    '<label class="opt-row' + (saved[q.id] === o ? ' picked' : '') + '">' +
                        '<input type="radio" name="q_' + q.id + '" data-answer="' + q.id + '" data-qtype="single" value="' + esc(o) + '"' + (saved[q.id] === o ? ' checked' : '') + '>' +
                        '<span>' + esc(o) + '</span></label>').join('');
            }
            return '<div class="q-card">' +
                '<div style="display:flex;align-items:center;flex-wrap:wrap;">' +
                    '<span class="q-index">' + (qi + 1) + '</span>' +
                    '<span class="q-title">' + esc(q.prompt) + '</span>' +
                    '<span class="q-type-tag">' + TYPE_LABEL[q.qtype] + (q.qtype === 'multi' ? ' · 可多选' : '') + '</span>' +
                '</div>' +
                '<div style="margin-top:.8rem;">' + body + '</div>' +
            '</div>';
        }).join('');

        host.innerHTML =
            '<div class="tabs">' +
                '<button class="tab-btn" data-tab="list">← 返回列表</button>' +
                '<button class="tab-btn on">✍️ 作答</button>' +
            '</div>' +
            '<div class="card" style="cursor:default;">' +
                '<h2 style="font-size:1.4rem;">' + esc(survey.title) + '</h2>' +
                (survey.description ? '<p style="margin:.4rem 0 1rem;">' + esc(survey.description).replace(/\n/g, '<br>') + '</p>' : '') +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:1rem;">' +
                    '<span class="badge">' + qs.length + ' 道题</span>' +
                    '<span class="badge gold">' + (mine ? '修改答卷（提交于 ' + fmtTime(mine.updated_at || mine.submitted_at) + '）' : '第一次作答') + '</span>' +
                    '<span class="badge ' + (otherResponse(sid) ? 'green' : 'pink') + '">对方' + (otherResponse(sid) ? '已作答' : '还没作答') + '</span>' +
                '</div>' +
                qHtml +
                '<div style="margin-top:1.2rem;display:flex;gap:10px;flex-wrap:wrap;">' +
                    '<button class="btn blue" id="submitAnswerBtn">📨 提交答卷</button>' +
                    '<button class="btn ghost" id="backListBtn">返回</button>' +
                '</div>' +
                '<div class="notice" style="margin-top:1rem;">提交后随时可以回来改；每道题的答案，你们俩都能互相查看。</div>' +
            '</div>';

        bindTabs(host);
        if (!answerChangeBound) {
            answerChangeBound = true;
            host.addEventListener('change', e => {
                const el = e.target;
                if (!el.dataset || !el.dataset.answer) return;
                const qid = el.dataset.answer;
                if (el.dataset.qtype === 'single') {
                    host.querySelectorAll('[data-answer="' + qid + '"]').forEach(x => x.closest('.opt-row').classList.remove('picked'));
                    el.closest('.opt-row').classList.add('picked');
                } else if (el.dataset.qtype === 'multi') {
                    el.closest('.opt-row').classList.toggle('picked', el.checked);
                }
            });
        }
        byId('submitAnswerBtn').addEventListener('click', async () => {
            const answers = {};
            let unanswered = 0;
            qs.forEach(q => {
                const els = host.querySelectorAll('[data-answer="' + q.id + '"]');
                if (q.qtype === 'text') {
                    answers[q.id] = els[0] ? els[0].value.trim() : '';
                    if (!answers[q.id]) unanswered++;
                } else if (q.qtype === 'multi') {
                    answers[q.id] = Array.from(els).filter(x => x.checked).map(x => x.value);
                    if (!answers[q.id].length) unanswered++;
                } else {
                    const hit = Array.from(els).find(x => x.checked);
                    answers[q.id] = hit ? hit.value : null;
                    if (!hit) unanswered++;
                }
            });
            if (unanswered && !confirm('还有 ' + unanswered + ' 道题没作答，空着提交吗？')) return;
            try {
                await app.sbRest('survey_responses', {
                    method: 'POST',
                    prefer: 'resolution=merge-duplicates',
                    body: { survey_id: sid, responder_email: app.me.email, answers: answers, updated_at: new Date().toISOString() }
                });
                app.toast('答卷已保存 ✨', 'ok');
                await loadAll(); showResults(sid);
            } catch (e) {
                app.toast('提交失败：' + e.message, 'err', 4200);
            }
        });
        byId('backListBtn').addEventListener('click', showList);
    }

    /* ---------- 视图：结果互看 ---------- */
    function showResults(sid) {
        const survey = surveys.find(s => s.id === sid);
        const qs = questionsBySurvey[sid] || [];
        if (!survey) { showList(); return; }
        const mine = myResponse(sid) || { answers: {}, responder_email: app.me.email };
        const other = otherResponse(sid);
        const host = byId('viewHost');

        const qHtml = qs.map((q, qi) => {
            const myA = (mine.answers || {})[q.id];
            const otherA = other ? (other.answers || {})[q.id] : undefined;
            const fmt = v => {
                if (v === null || v === undefined || v === '') return '';
                if (Array.isArray(v)) return v.length ? v.map(esc).join('、') : '';
                return esc(v);
            };
            let dist = '';
            if (q.qtype !== 'text') {
                const counts = {};
                q.options.forEach(o => { counts[o] = 0; });
                [myA, otherA].forEach(a => {
                    (Array.isArray(a) ? a : (a ? [a] : [])).forEach(v => { if (v in counts) counts[v]++; });
                });
                const chips = Object.keys(counts).map(o =>
                    '<span class="chip' + (counts[o] ? ' on' : '') + '">' + esc(o) + ' · ' + counts[o] + '票</span>').join('');
                dist = '<div class="chip-row" style="margin-top:.7rem;">' + chips + '</div>';
            }
            return '<div class="q-card">' +
                '<div style="display:flex;align-items:center;flex-wrap:wrap;">' +
                    '<span class="q-index">' + (qi + 1) + '</span>' +
                    '<span class="q-title">' + esc(q.prompt) + '</span>' +
                    '<span class="q-type-tag">' + TYPE_LABEL[q.qtype] + '</span>' +
                '</div>' +
                '<div class="cmp-grid">' +
                    '<div class="cmp-cell' + (fmt(myA) ? '' : ' empty') + '"><div class="who">🙋 ' + esc(nameOf(app.me.email)) + (mine.updated_at || mine.submitted_at ? ' <span style="font-weight:400;color:var(--ink-3);">' + fmtTime(mine.updated_at || mine.submitted_at) + '</span>' : '') + '</div>' + (fmt(myA) || '还没有作答') + '</div>' +
                    '<div class="cmp-cell' + (fmt(otherA) ? '' : ' empty') + '"><div class="who">💌 ' + (other ? esc(nameOf(other.responder_email)) : '对方') + (other && (other.updated_at || other.submitted_at) ? ' <span style="font-weight:400;color:var(--ink-3);">' + fmtTime(other.updated_at || other.submitted_at) + '</span>' : '') + '</div>' + (fmt(otherA) || '还没有作答') + '</div>' +
                '</div>' + dist +
            '</div>';
        }).join('');

        host.innerHTML =
            '<div class="tabs">' +
                '<button class="tab-btn" data-tab="list">← 返回列表</button>' +
                '<button class="tab-btn on">👀 查看结果</button>' +
            '</div>' +
            '<div class="card" style="cursor:default;">' +
                '<h2 style="font-size:1.4rem;">' + esc(survey.title) + '</h2>' +
                '<p style="margin:.4rem 0 1rem;">每道题左右对照，两个人都看得见。</p>' +
                qHtml +
                '<button class="btn ghost" id="backListBtn2" style="margin-top:1rem;">返回列表</button>' +
            '</div>';
        bindTabs(host);
        byId('backListBtn2').addEventListener('click', showList);
    }

    /* ---------- 页签切换（列表 / 设计） ---------- */
    function bindTabs(host) {
        host.querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                if (tab === 'list') showList();
                else if (tab === 'design') showDesign();
            });
        });
    }

    /* ---------- 启动 ---------- */
    async function start(siteApp) {
        app = siteApp;
        const host = byId('viewHost');
        try {
            await loadAll();
            showList();
        } catch (e) {
            host.innerHTML = '<div class="gate-card"><div class="gate-icon">⚠️</div><h2>问卷数据加载失败</h2>' +
                '<p>' + esc(e.message) + '</p>' +
                '<p style="font-size:.8rem;">如果是提示 <code>surveys</code> 表不存在，去「后台」执行一次数据库安装 SQL。</p>' +
                '<button class="btn ghost" onclick="location.reload()">重试</button></div>';
        }
    }

    window.QuestionnaireApp = { start: start, parseSurveyText: parseSurveyText, AI_PROMPT: AI_PROMPT };
})();
