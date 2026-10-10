# 空曙 · 记忆回廊

一个纯静态的个人记忆档案站，部署在 GitHub Pages 上，不需要服务器、不需要数据库。

主厅是 `Secret.html`（根目录的 `index.html` 会自动跳转过去）。其中「日常想法」这一页
已经从写死的静态列表升级成了一个**可读可写的小型日记系统**：输入口令解锁 → 选日期 →
挑心情标签 → 写正文 → 一键发布，改动会通过 GitHub 的接口直接提交回仓库，Pages 自动重新部署。

---

## 一、目录结构

```
.
├── index.html                      # 首页，自动跳转到 Secret.html
├── Secret.html                     # 主厅（栏目入口 + 日记速览 + 寄信）
├── .nojekyll                       # 告诉 GitHub Pages 不要用 Jekyll 处理
├── data/
│   ├── journal.json                # ★ 日记数据（唯一真源，页面的读写都针对它）
│   └── journal.js                  # 离线镜像，由 journal.json 自动生成（不要手改）
├── Thoughts/
│   ├── ThoughtDebateDaily.html     # ★ 日记页（列表 / 检索 / 编辑器 / 发布）
│   └── ThoughtDebatePhilosophy.html
├── Selects/
│   ├── ThoughtDebate.html          # 思辨入口（答题门）
│   ├── BirthdayArchive.html
│   └── FunProjects.html
├── Birthdays/20th.html
├── Entertainments/MathTI.html
├── Texts/Error.txt
├── Pictures/生日贺图.jpg
├── scripts/                        # 校验 / 生成镜像 / 导出备份的小脚本
└── .github/workflows/journal.yml   # GitHub Actions：数据体检 + 定时备份
```

`_archive/` 里放着改造前的两个页面备份（`Secret.legacy.html`、`ThoughtDebateDaily.legacy.html`），
确认一切正常后可以删掉。

---

## 二、部署到 GitHub Pages

1. 在 GitHub 上新建一个仓库（比如 `MyWeb`），**Public**（公开仓库才能免费用 Pages）。
2. 把本目录（`myweb-main` 里的全部内容，注意是里面的内容，不是外层文件夹）推到仓库的 `main` 分支：

   ```bash
   git init
   git add .
   git commit -m "网站 v2：日记系统上线"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

3. 仓库页面 → **Settings → Pages** → Source 选 `Deploy from a branch`，
   Branch 选 `main`、目录选 `/ (root)` → Save。
4. 等一分钟左右，访问 `https://<你的用户名>.github.io/<仓库名>/` 就能看到主厅；
   日记页在 `.../Thoughts/ThoughtDebateDaily.html`。

> 数据文件 `data/journal.json` 和镜像 `data/journal.js` 必须一起上传，否则日记页会提示找不到数据。

---

## 三、写日记怎么用

1. 打开日记页，点右上角 **🔐 编辑模式**，输入口令 `Dawnlit`（可勾选「在这台设备上记住」）。
2. 右下角出现 **＋** → 选日期、点一个心情标签（也可以自己输入，例如 `😌 平静`）、写正文。
   - **空一行**表示分段，段内换行会变成 `<br>`。
   - `Ctrl + Enter` 直接保存；`👀 预览` 可以先看排版效果。
3. 保存有两个按钮：
   - **仅存到本地**：只写进浏览器本地草稿，页面顶部会出现「有 N 处改动待发布」。
   - **保存并发布**：本地保存 + 立刻提交到 GitHub（需要先配好发布密钥，见下一节）。
4. **修改旧日记**：点卡片右上角的 **✎**，改完保存即可；**删除**用 🗑（会先弹确认框）。
   删除和修改同样要点「发布」才会真正写回仓库。
5. 发布成功后 GitHub Pages 大约 30～60 秒重新部署，稍等一会儿刷新就能看到。

---

## 四、配置发布密钥（只需做一次）

口令只是「解锁界面」的门槛，真正决定能不能写入的是 GitHub 的访问令牌，它只保存在你自己的浏览器里。

1. 打开 https://github.com/settings/personal-access-tokens/new （Fine-grained token）。
2. Token name 随便取（例如 `journal-writer`），Expiration 选一个期限。
3. Repository access 选 **Only select repositories** → 只勾这一个网站仓库。
4. Permissions → Repository permissions → 找到 **Contents** → 设为 **Read and write**。
5. 生成并复制令牌（`github_pat_...`）。
6. 回到日记页 → ⚙️ 发布设置 → 填 owner / repo / 分支 / 路径（在 `*.github.io` 上会自动识别）
   → 粘贴令牌 → 先点 **测试连接**，看到 ✅ 再 **保存设置**。

### 安全提醒

- 令牌只存在浏览器 `localStorage` 里，**永远不会被提交进仓库**，也不会发给除 `api.github.com` 之外的任何地方。
- 换电脑 / 清浏览器数据后需要重新粘贴一次令牌。
- 不要把这个令牌写进任何文件，也不要发在聊天里；万一泄露，去 GitHub 删掉那张令牌即可作废。
- 口令 `Dawnlit` 是写在网页源码里的（同 `Thoughts/ThoughtDebateDaily.html` 里的哈希），
  它挡的是「随便点进来的人」，不是有备而来的攻击者。想换口令：改源码里的
  `PASSWORD_HASH`（口令的 SHA-256）和 `PASSWORD_FALLBACK`（明文兜底）两处即可。
- 同样的道理：日记正文在仓库里是明文，谁拿到地址都能看。这和一版之前的做法是一样的
  （以前的正文也直接写在页面源码里），只是现在换成了 JSON 文件。

---

## 五、数据、备份与恢复

- **唯一真源**是 `data/journal.json`，结构如下：

  ```json
  {
      "version": 1,
      "updatedAt": "2026-10-10T22:08:13+08:00",
      "entries": [
          { "id": "d2025-09-11", "date": "2025-09-11", "mood": "", "content": "…" }
      ]
  }
  ```

  `id` 唯一即可；`mood` 可以是空字符串（表示「未标注」）；编辑过的条目会多出
  `createdAt` / `updatedAt` 两个时间戳。

- `data/journal.js` 是给网页离线读取用的镜像（`window.__JOURNAL_DATA__ = {…}`），
  由 `data/journal.json` 自动生成，**不要手改**。本地生成命令：

  ```bash
  node scripts/build-mirror.mjs        # 有 Node 时
  powershell -File scripts/build-mirror.ps1   # 只有 Windows PowerShell 时
  ```

- 页面里的 **⋯ → 导出全部日记（JSON 备份）** 会下载一份完整 JSON；
  **从 JSON 备份导入** 可以把它合并回来（按更新时间取新）。
- 每一次发布都是一次 Git 提交，所以就算误删了，也能在仓库的提交历史里找回旧版本。
- 体检脚本（本地也能跑）：`node scripts/verify-journal.mjs`
- `scripts/migrate-journal.ps1` 是当初把旧页面里写死的数组搬到 `journal.json` 的一次性脚本，
  留作记录；旧页面已经删掉，所以现在重复运行它会直接报错，属于正常现象。

---

## 六、GitHub Actions 在做什么

`.github/workflows/journal.yml` 会在三种情况下自动跑 Node 脚本：

| 触发 | 做什么 |
| --- | --- |
| `data/journal.json` 改动（push） | 校验 JSON 结构、日期是否合法、id 是否重复、正文是否为空；并检查镜像是否过期 |
| 每天北京时间 04:00（cron） | 体检一次，生成一份可读的 `journal-export.md`，连同 `journal.json` 上传为 Actions 产物（保留 90 天） |
| 手动 Run workflow | 同上，随时可以手动体检 + 备份 |

也就是说：**GitHub 定时跑 JS 脚本**这件事是做到了，但它负责的是「体检 + 备份 + 同步镜像」；
写日记本身由浏览器直接调 GitHub 接口完成，这样你随时随地打开网页就能写，不用等定时任务。

---

## 七、本地预览

- 直接双击 `Secret.html` / `Thoughts/ThoughtDebateDaily.html` 就能看（数据从 `data/journal.js` 读，
  本地也能正常显示）。这种模式下点保存不会真的提交，只会存在本机草稿里。
- 想更接近线上环境，可以起个本地服务器（任选其一）：

  ```bash
  python -m http.server 8000      # 然后访问 http://localhost:8000/
  npx serve .
  ```

---

## 八、常见问题

**Q：点了发布，网页上看不到变化？**
Pages 需要 30～60 秒重新部署；另外浏览器可能缓存了 JSON，强制刷新（Ctrl + F5）试试。

**Q：提示 403 / 404？**
403 基本都是令牌权限不够（确认 `Contents: Read and write`）；404 常见于 owner / repo / 分支填错，
或者令牌没有勾选这个仓库。

**Q：提示「有 N 处改动还没同步」但我不想发布了？**
⋯ → 放弃本地未发布的改动，会回到仓库里的最新版本。

**Q：不小心把 JSON 改坏了？**
`data/journal.json` 每次改动都是一个提交，去仓库历史里回滚那一版即可；
Actions 的 `validate` 任务也会在结构不合法时直接报错提醒你。

**Q：还想让别的页面（思辨话题、生日页）也能编辑？**
思路是一样的：把内容搬到 `data/` 下的 JSON，页面改成读取数据 + 复用这套发布逻辑。
