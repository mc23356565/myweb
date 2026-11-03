# 我们的小窝

一个纯静态的**情侣网站**，GUI 完全照搬 LikeGirl v5.2.0 的界面（顶栏 logo+文案、
双头像 Banner + 心跳 + 波浪、彩虹渐变计时器、3 小卡 + 2 宽卡首页、朴实文章 /
恋爱相册 / 恋爱清单的原始版式），数据层换成 **Supabase**，不需要 PHP 和 MySQL。

```
登录后才能看到内容：账号一共两个（情侣双方），都在 Supabase Authentication 里建，
权限完全一样 —— 看文章、传照片、记清单、出问卷、进后台、改情侣配置。
```

---

## 一、文件结构

```
.
├── index.html / Secret.html        # 入口跳转 + 主页（LikeGirl index.php：计时器 + 卡片）
├── Admin.html                      # 后台：情侣配置 / 账号 / 问卷管理 / 数据备份 / 安装 SQL
├── Articles/index.html + page.html # 朴实文章（LikeGirl little.php / page.php）
├── Photos/index.html               # Love Photo 恋爱相册（LikeGirl loveImg.php）
├── List/index.html                 # Love List 恋爱清单（LikeGirl list.php）
├── Questionnaires/index.html       # 问卷小屋（LikeGirl 没有的自研模块）
├── Style/css/…, Style/img/…        # 从 LikeGirl 原版拷贝的 CSS 与图片素材（未改动设计）
├── assets/
│   ├── app-core.js                 # LikeGirl 外壳注入 + 登录门 + Supabase REST + 安装 SQL
│   ├── articles.js / page.js       # 朴实文章逻辑
│   └── questionnaire.js            # 问卷引擎
└── supabase-install.sql            # 数据库一次性安装 SQL（可重复执行）
```

> 站点名称、顶栏文案、两人名字、头像、纪念日都在 **后台 → 情侣配置** 里改，
> 存在 Supabase 的 `site_config` 表，改完全站立即生效。

---

## 二、Supabase 需要的配置（就这三步）

1. **执行安装 SQL**：Supabase 控制台 → SQL Editor → 粘贴 `supabase-install.sql` → Run
   （后台 → 数据库安装 里有一键复制）。它会建好：
   - `members` 表 + `my_profile()/is_member()/is_admin()` 函数
   - `entries`（朴实文章）、`surveys/survey_questions/survey_responses`（问卷）
   - `photos`（相册索引）、`wishlist`（恋爱清单）、`site_config`（情侣配置）
   - 全部 RLS 行级安全策略
   - Storage 公开桶 `photos`（相册图片与头像上传用）及其上传/删除策略
2. **建两个账号**：Authentication → Users → Add user，邮箱 + 密码（勾 Auto Confirm）。
   然后在 SQL Editor 执行（把邮箱换成实际邮箱）：
   ```sql
   insert into public.members (email, role, display_name) values
     ('你的邮箱',   'admin', '他'),
     ('她的邮箱',   'admin', '她');
   ```
3. **（建议）关闭公开注册**：Authentication → Sign In / Providers → 关掉
   **Allow new users to sign up**，这样只有你们俩能登录。

之后就不用再碰 Supabase 了：头像/名字/站点名在网页后台改，数据在页面上增删。

> 建议在 Authentication → Sign In / Providers 里关掉 **Allow new users to sign up**，
> 这样只有你们俩的账号能存在。

---

## 三、问卷小屋

**设计问卷**（完全自定义）：

- 手动设计：加题 → 选题型（单选 / 多选 / 文本）→ 写题干和选项，可排序可删除；
- 文本导入格式：

  ```
  # 问卷标题
  > 问卷描述（可省略，可多行）
  1. 题干 [单选]
  - 选项一
  - 选项二
  2. 题干 [多选]
  - 选项一
  - 选项二
  3. 题干 [文本]
  ```

  规则：`#` 标题、`>` 描述、`数字.` 问题、`[单选]/[多选]/[文本]` 题型标记、`-` 选项；
  选择题必须有选项，文本题不写选项行。
- **AI 提示词**：「设计问卷 → 🤖 AI 提示词」里有一键复制的提示词，把它和问卷内容
  一起发给任意 AI，它会输出上面这种可以直接导入的格式。

**答问卷 & 结果互看**：每份问卷每人一份答卷（重复提交即覆盖更新）；
「查看结果」里每道题左右对照两个人的答案，选择题还有选项分布统计。

---

## 四、权限是怎么保证的

全部由数据库的 RLS 策略兜底，页面上的登录门只是体验层：

| 表 | 谁能读 | 谁能写 |
| --- | --- | --- |
| `entries`（朴实文章：日记/思辨） | 登录成员 | 登录成员 |
| `surveys` / `survey_questions` | 登录成员 | 登录成员 |
| `survey_responses` | 登录成员（所以双方互看答卷） | 本人那份 |
| `photos`（相册索引） | 登录成员 | 登录成员 |
| `wishlist`（恋爱清单） | 登录成员 | 登录成员 |
| Storage 桶 `photos`（图片本体） | 公开链接可读 | 登录成员可上传/删除 |
| `members` | 不开放（只有 SQL / 后台能改） | 只能后台改 |

anon key 公开在前端是正常的（它只代表"匿名访客"，真正能做什么由 RLS 决定）。

---

## 五、备份

- 后台 → 数据备份：导出 entries 全部内容 / 问卷三表数据 / 相册+清单（JSON），导入按 id 合并。
- 朴实文章页 ⋯ 菜单里也有单页的导出 / 导入。

---

## 六、常见问题

**Q：登录提示 Invalid login credentials**
邮箱或密码不对，或者那个用户没勾 Auto Confirm。

**Q：登录成功但看到 🚫「这个账号还没有权限」**
`members` 表里没有这个邮箱，或 role 写错了（填 `admin`）。

**Q：问卷保存报「表不存在」**
去 Supabase SQL Editor 执行一次 `supabase-install.sql`。

**Q：相册上传图片报错**
安装 SQL 会自动建公开桶 `photos`；如果之前没跑过新 SQL，去 Storage 手动建一个
名为 `photos` 的 Public 桶，或重新执行一遍 `supabase-install.sql`。

**Q：想换邮箱 / 换项目**
浏览器控制台/设置里可覆盖 Supabase URL 与 anon key（localStorage：`journal.supabase.v1`）。

**Q：Banner 上的头像 / 名字 / 站点名称想换**
登录后进「后台 → 情侣配置」：直接上传头像图片（存到 Storage）、改两人名字、
站点名称、顶栏文案和纪念日，保存后全站立即生效。
