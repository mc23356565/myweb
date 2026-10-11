# 空曙 · 记忆回廊

一个纯静态的私人档案站，部署在 GitHub Pages 上。**所有内容存在 Supabase**，访问权限由
「账号 + 行级安全策略（RLS）」控制，不需要服务器。

```
没账号  → 什么都看不到（只有主厅的趣味整活 / MathTI 能玩）
游客    → 能看日记与思辨；留言只能看到自己那条线（自己发的 + 空曙的回复），可以回复
管理员  → 能看全部留言并回复、能增删改所有内容
```

---

## 一、文件结构

```
.
├── index.html / Secret.html        # 主厅（公开：栏目入口 + 私人区域说明）
├── assets/
│   ├── journal-core.js             # 引擎：登录、读取、编辑、导入导出、权限门
│   ├── journal-comments.js         # 留言模块（游客只看自己那条线）
│   └── journal.css                 # 共用样式（日间 / 夜读）
├── Thoughts/
│   ├── ThoughtDebateDaily.html     # 日记页（Supabase entries，kind=journal）
│   └── ThoughtDebatePhilosophy.html# 思辨页（kind=philosophy）
├── Selects/  Birthdays/  Entertainments/  Texts/  Pictures/   # 公开栏目，未改动
├── data/journal.json / philosophy.json    # 历史数据备份 + 迁移数据源（网页不再读它们）
├── supabase-seed.sql               # 把现有内容搬进 Supabase 的 SQL（粘贴一次）
├── scripts/                        # 校验 / 生成镜像 / 合并 / 生成 seed 的脚本（历史遗留）
└── .github/workflows/journal.yml   # 历史的体检任务（现在数据在 Supabase，可忽略）
```

---

## 二、部署 + 首次配置（一次做对，以后就不用管了）

1. **推仓库**：把本目录内容推到 GitHub 仓库的 `main`，Settings → Pages 选 `main` / `(root)`。
2. **建后台**：打开 [supabase.com](https://supabase.com) 建一个免费项目（你已经建好了）。
3. **跑初始化 SQL**：项目 → **SQL Editor** → 粘贴下面这段 → Run
   （也可以用网页 ⚙️ 后台说明里的「📋 复制初始化 SQL」按钮）。
   <details><summary>点开看 SQL（也可以直接在网页里复制）</summary>

   ```sql
   -- 见 assets/journal-core.js 里的 SB_SQL，或网页 ⚙️ → 📋 复制初始化 SQL
   ```
   </details>
4. **建账号 + 指定角色**：
   - Authentication → **Users → Add user**：邮箱 + 密码（勾选 Auto Confirm）
   - Table Editor → `members` → **Insert row**：`email` 填刚才的邮箱，
     `role` 填 `admin`（你自己）或 `guest`（朋友），`display_name` 填称呼
5. **搬数据**：SQL Editor → 粘贴 `supabase-seed.sql` → Run（把现有 27 篇日记 + 1 条思辨写进 `entries`）。
6. 打开网页 → 🔑 登录 → 用你刚建的邮箱密码登录，就什么都通了。

> 登录/权限检查在浏览器里完成，anon key 公开在前端是正常的（它只代表"匿名访客"，
> 真正能做什么由 RLS 决定）。

---

## 三、日常使用

**管理员（你）**

- 右下角 **＋** 写新内容；卡片右上角 **✎** 改、**🗑** 删。保存即生效，没有"发布"这一步。
- 卡片上的 **💬 n** 是留言数；展开后每条留言线单独一块，可以逐条 **回复**、标 **已读**、**删除**。
- ⋯ 菜单：导出 JSON 备份 / 从 JSON 导入 / 退出登录。

**游客（朋友）**

- 只能看内容和自己的那条留言线（自己发的 + 你的回复），不能改任何内容。
- 在每条内容下面可以直接留言、也可以在你的回复下继续回你。

**没账号的人**：日记与思辨页只会看到一个 🔒 登录门；主厅、整活、MathTI 照常可玩。

---

## 四、权限是怎么保证的

全部由数据库的 RLS 策略兜底，页面上的显示/隐藏只是顺带：

| 表 | 谁能读 | 谁能写 |
| --- | --- | --- |
| `entries` | 登录且是成员（guest/admin） | 只有 admin |
| `comments` | admin 读全部；guest 只读 `thread_key = 自己的 uid` | admin 任意；guest 只能以自己身份写自己那条线 |
| `members` | 不开放（只有后台 / SQL 能改） | 只能后台改 |

`thread_key` 是那条留言线的归属人（游客的 uid）。你的回复会带上对方的 `thread_key`，
所以**对方能看到你的回复，而别的游客依然看不到**。

### 想让游客「只能看、不能留言」？

把 `comments` 的 `comments_insert` 策略改成只允许管理员即可：

```sql
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (public.is_admin() and role = 'admin');
```

---

## 五、加 / 删账号

- 加人：Authentication → Users → Add user（邮箱 + 密码）→ 在 `members` 里插入一行 →
  把邮箱密码告诉他即可登录。
- 停用某人：删掉 `members` 里那一行，他立刻什么都看不到（账号还在，但 RLS 不放行）。
- 改成管理员：把 `members.role` 改成 `admin`。
- 建议在 Authentication → Sign In / Providers 里关掉 **Allow new users to sign up**，
  这样只有你能创建账号。

---

## 六、备份

- 网页 ⋯ → **导出全部数据**：下载当天所有内容（JSON）。
- 导入：编辑导出的 JSON 后，用 ⋯ → **从 JSON 备份导入**（按 id 覆盖，只动你在的那一页的 kind）。
- 历史：`data/*.json` 是迁移前的快照，`_archive/` 是更早的页面备份，都可以留着。
- `scripts/` 与 `.github/workflows/` 是早期"把数据存在仓库"方案留下的工具，现在用不到，
  留着不影响网站。

---

## 七、常见问题

**Q：登录提示 Invalid login credentials**
邮箱或密码不对，或者那个用户在 Supabase 里没勾 Auto Confirm。

**Q：登录成功但看到 🚫「这个账号还没有权限」**
`members` 表里没有这个邮箱，或者 `role` 值写错了（只能是 `guest` / `admin`）。

**Q：游客看不到我的回复**
确认初始化 SQL 里的 `thread_key` 相关语句都跑过了（策略是"读 `thread_key = 自己 uid`"）。

**Q：想换邮箱 / 换项目**
网页 ⚙️ 里可以改 Supabase URL 与 anon key（只存在本机浏览器）。
