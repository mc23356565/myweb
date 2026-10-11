# 空曙 · 记忆回廊

一个纯静态的个人记忆档案站，部署在 GitHub Pages 上，不需要服务器、不需要数据库。

主厅是 `Secret.html`（根目录的 `index.html` 会自动跳转过去）。其中**「日常想法」和「思辨话题」
两个页面都已经升级成可读可写的小型内容系统**：输入口令解锁 → 选日期 → 填标签/标题 → 写正文 →
一键发布，改动会通过 GitHub 的接口直接提交回仓库，Pages 自动重新部署。

两个页面共用 `assets/journal-core.js`（引擎）与 `assets/journal.css`（皮肤），所以行为完全一致。

---

## 一、目录结构

```
.
├── index.html                        # 首页，自动跳转到 Secret.html
├── Secret.html                       # 主厅（栏目入口 + 日记速览）
├── .nojekyll                         # 告诉 GitHub Pages 不要用 Jekyll 处理
├── assets/
│   ├── journal-core.js               # ★ 两个页面共用的引擎（读取/解锁/编辑/发布/留言）
│   └── journal.css                   # ★ 共用样式（日间 + 夜读）
├── data/
│   ├── journal.json                  # ★ 日记数据（唯一真源）
│   ├── journal.js                    # 日记的离线镜像（自动生成，别手改）
│   ├── philosophy.json               # ★ 思辨话题数据（唯一真源）
│   └── philosophy.js                 # 思辨的离线镜像（自动生成，别手改）
├── Thoughts/
│   ├── ThoughtDebateDaily.html       # 日记页（配置很短，逻辑都在 assets 里）
│   └── ThoughtDebatePhilosophy.html  # 思辨页（同一套系统，多一个「标题」字段）
├── Selects/                          # 分类入口 / 生辰纪念 / 趣味整活
├── Birthdays/20th.html
├── Entertainments/MathTI.html
├── Texts/Error.txt
├── Pictures/生日贺图.jpg
├── scripts/                          # 校验 / 生成镜像 / 导出备份的小脚本
└── .github/workflows/journal.yml     # GitHub Actions：数据体检 + 定时备份
```

`_archive/` 里放着改造前的页面备份（主厅、日记页、思辨页），确认一切正常后可以删掉。

---

## 二、部署到 GitHub Pages

1. 新建一个 **Public** 仓库（公开仓库才能免费用 Pages）。
2. 把本目录**里面的内容**（不是外层文件夹）推到 `main` 分支：

   ```bash
   git init
   git add .
   git commit -m "网站 v3：思辨页可编辑 + 留言板"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

3. 仓库页面 → **Settings → Pages** → Source 选 `Deploy from a branch`，
   Branch 选 `main`、目录选 `/ (root)` → Save。
4. 约一分钟后访问 `https://<你的用户名>.github.io/<仓库名>/`。

> `assets/`、`data/` 必须一起上传，否则页面会提示找不到数据。

---

## 三、怎么用（两个页面完全一样）

1. 打开日记页或思辨页，点右上角 **🔐 编辑模式**，输入口令 `Dawnlit`
   （可勾选「在这台设备上记住」，之后就不用反复输）。
2. 右下角 **＋** → 选日期：

   - 日记页：点一个**心情标签**（也可以自己写，例如 `😌 平静`）+ 正文
   - 思辨页：填**标题** + 正文
   - 正文**空一行**表示分段；段内换行会变成 `<br>`；`Ctrl + Enter` 直接保存；`👀 预览` 可看排版

3. 保存有两种：

   - **仅存到本地**：只写进本机草稿，页面顶部会出现「有 N 处改动待发布」
   - **保存并发布**：本地保存 + 立刻提交进 GitHub（需要先配好发布密钥，见下一节）

4. **修改旧内容**：点卡片右上角 **✎**；**删除**用 **🗑**（会先弹确认框）。
   修改和删除同样要点「发布」才会写回仓库。
5. 发布成功后 Pages 大约 30～60 秒重新部署，稍等刷新即可。

---

## 四、配置发布密钥（只需做一次，两个页面共用）

口令只是「解锁界面」的门槛；真正决定能不能写入的是 GitHub 访问令牌，它只保存在你自己的浏览器里。

1. 打开 https://github.com/settings/personal-access-tokens/new （Fine-grained token）。
2. Token name 随意（如 `journal-writer`），设个过期时间。
3. Repository access 选 **Only select repositories** → 只勾这一个网站仓库。
4. Permissions → Repository permissions → **Contents** 设为 **Read and write**。
5. 生成并复制（`github_pat_...`）。
6. 回到页面 → ⚙️ 发布设置 → 填 owner / repo / 分支 / 数据文件路径（在 `*.github.io` 上会自动识别）
   → 粘贴令牌 → **测试连接** 看到 ✅ → **保存设置**。

> 日记页与思辨页的数据文件路径不同（`data/journal.json` / `data/philosophy.json`），
> 设置里会自动带上当前页面的路径；换个页面时再点一次「保存设置」即可（令牌是共用的）。

### 权限与安全

- **导出 / 导入只对你自己开放**：⋯ 菜单里的「导出全部数据」「从 JSON 备份导入」只有在
  **已解锁 + 已配置令牌** 时才可点，普通访客看到的是禁用状态。
- 令牌只存在浏览器 `localStorage`，**永远不会被提交进仓库**，也只会发给 `api.github.com`。
- 换电脑 / 清浏览器数据后需要重新粘贴一次令牌；口令也要重输一次。
- 口令 `Dawnlit` 写在网页源码里（哈希形式），它挡的是随手点进来的人，不是有备而来的访问者。
  想换口令：改 `assets/journal-core.js` 里的 `PASSWORD_HASH`（新口令的 SHA-256）与
  `PASSWORD_FALLBACK`（明文兜底）两处。
- 同样的道理：日记与思辨的正文在仓库里是**明文**，谁拿到地址都能看。这和一版之前是一样的
  （以前正文直接写在页面源码里），只是换成了 JSON 文件。

---

## 五、留言 / 回信

两个页面右上角都有 **💬 留言**（⋯ 菜单里也有）。访客需要填写：

- **人物**：你是谁，或者你要回复谁（必填）
- **联系方式**：选填
- **留言内容**

点「送出留言」后，内容会通过 EmailJS **直接投递到空曙的邮箱**（`DreemurrDawnlit@outlook.com`），
**不会出现在网页上，也不会写进仓库**——所以除了你本人，任何人都看不到留言内容，
连翻仓库、抓接口也拿不到（它压根没进过仓库）。

几点说明：

- 留言板用了 EmailJS，公共 key 在前端（`assets/journal-core.js` 里的 `EMAILJS`）——
  这类 key 本来就是公开设计，建议顺手去 EmailJS 后台把**允许的域名**限制成你自己的站点。
- 同一台设备 20 秒内只能发一条，避免误触刷屏。
- 如果你想要的是「留言出现在页面里、只有我能看」的效果，那就需要一个免费的后端数据库
  （Supabase 之类：匿名可写、只有登录的你能读）。页面入口已经预留好，随时可以接。

---

## 六、数据、备份与恢复

两个数据文件的格式基本一致，只是额外字段不同：

```json
{
    "version": 1,
    "updatedAt": "2026-10-11T16:13:25+08:00",
    "entries": [
        { "id": "d2025-09-11", "date": "2025-09-11", "mood": "", "content": "…" },
        { "id": "p2025-05-01", "date": "2025-05-01", "title": "所谓——友谊", "content": "…" }
    ]
}
```

- 第一条是日记（`mood` 可以为空字符串），第二条是思辨话题（`title` 必填）。
- `id` 唯一即可；编辑过的条目会多出 `createdAt` / `updatedAt`。
- `data/*.js` 是给网页离线读取的镜像，由 `data/*.json` 自动生成，**不要手改**。本地生成：

  ```bash
  node scripts/build-mirror.mjs                  # 有 Node
  powershell -File scripts/build-mirror.ps1      # 只有 Windows PowerShell
  ```

- 页面里 **⋯ → 导出全部数据** 会下载完整 JSON；**从 JSON 备份导入** 可以合并回来（按更新时间取新）。
- 每次发布都是一次 Git 提交，误删可以在仓库历史里找回。
- 本地体检：`node scripts/verify-journal.mjs`（不带参数会校验 `data/` 下所有数据文件）。

---

## 七、GitHub Actions 在做什么

`.github/workflows/journal.yml` 会在三种情况下自动跑 Node 脚本：

| 触发 | 做什么 |
| --- | --- |
| `data/*.json` 改动（push） | 校验结构、日期、重复 id、空正文、思辨的标题是否缺失；检查镜像是否过期 |
| 每天北京时间 04:00（cron） | 体检 + 导出可读的 `journal-export.md` / `philosophy-export.md`，连同 JSON 上传为 Actions 产物（保留 90 天） |
| 手动 Run workflow | 随时手动体检 + 备份 |

也就是说：**GitHub 定时跑 JS 脚本**这件事是做到了，但它负责体检 / 备份 / 同步镜像；
写内容本身由浏览器直接调 GitHub 接口完成，随时随地打开网页都能写。

---

## 八、本地预览

- 直接双击 `Secret.html` / `Thoughts/*.html` 就能看（数据从 `data/*.js` 镜像读，本地也能显示）。
  这种模式下点保存不会真的提交，只存在本机草稿里。
- 想更接近线上环境：

  ```bash
  python -m http.server 8000     # 然后访问 http://localhost:8000/
  npx serve .
  ```

---

## 九、常见问题

**Q：点了发布，网页上看不到变化？**
Pages 需要 30～60 秒重新部署；也可能被浏览器缓存，强制刷新（Ctrl + F5）试试。

**Q：提示 403 / 404？**
403 基本都是令牌权限不够（确认 `Contents: Read and write`）；404 常见于 owner / repo / 分支 /
数据文件路径填错，或者令牌没勾选这个仓库。

**Q：导出按钮点不动？**
设计如此——导出 / 导入只对「已解锁 + 已配置令牌」的你开放。

**Q：不小心把 JSON 改坏了？**
每次改动都是一个 Git 提交，去仓库历史回滚那一版即可；Actions 的 `validate` 也会在不合法时报错提醒。

**Q：还想让别的页面（生辰纪念、MathTI）也能编辑？**
照抄 `Thoughts/ThoughtDebatePhilosophy.html`：写一份 JSON 数据 + 一个新页面调用
`Journal.init({...})` 就行，引擎和皮肤都不用动。
