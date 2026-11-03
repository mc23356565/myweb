# 空曙 · 记忆回廊

一个纯静态的**私人情侣站**，部署在 GitHub Pages 上。**所有内容存在 Supabase**，
访问权限由「账号 + 行级安全策略（RLS）」控制，不需要服务器。

GUI 整体基于 LikeGirl 的设计重做：网格纸背景 + 白色卡片 + 毛玻璃顶栏 + 思源宋体 +
双头像心跳 Banner + SVG 波浪 + 彩虹渐变计时器。

```
没账号 → 什么都看不到（整站所有页面都有登录门）
成员   → 账号一共只有两个（空曙 + 她），权限完全一样：
         看内容、写文章、传照片、记清单、设计/作答问卷、进后台
```

---

## 一、文件结构

```
.
├── index.html / Secret.html        # 入口跳转 + 主厅（双头像 Banner、波浪、计时器、栏目卡片）
├── Admin.html                      # 后台：账号、统计、问卷管理、数据备份、数据库安装 SQL
├── Articles/index.html             # 朴实文章：日常想法（journal）+ 思辨话题（philosophy）合并一页
├── Photos/index.html               # Love Photo 恋爱相册：上传/链接图片 + 日期 + 说明
├── List/index.html                 # Love List 恋爱清单：想一起做的事，打卡完成
├── Questionnaires/index.html       # 问卷小屋：设计问卷 + 答问卷 + 结果互看
├── assets/
│   ├── style.css                   # 全站设计系统（LikeGirl 风格）
│   ├── app-core.js                 # 全站登录门 + 顶栏 + Supabase REST 封装
│   ├── questionnaire.js            # 问卷引擎（设计/导入解析/作答/互看）
│   ├── journal-core.js             # 文章引擎（entries 表，支持多类型合并；含全站安装 SQL 常量）
│   └── journal.css                 # 朴实文章页样式（同一套蓝色系）
└── supabase-install.sql            # 数据库一次性安装 SQL（可重复执行，与 journal-core.js 同源）
```

> 相比上一版的变化：日记 + 思辨合并为「朴实文章」；新增恋爱相册（Love Photo）与
> 恋爱清单（Love List）；删除了生辰纪念（20th 彩蛋链）、趣味整活（MathTI）、
> 留言模块、暗号题与夜读模式。生辰纪念以后要加的话可以再补回一个栏目。

---

## 二、首次配置

1. **推仓库**：推到 GitHub `main`，Settings → Pages 选 `main / (root)`。
2. **跑安装 SQL**：Supabase 控制台 → SQL Editor → 粘贴 `supabase-install.sql` → Run
   （网页「后台 → 数据库安装」里也有一键复制按钮）。会自动建好文章/问卷/相册/清单
   全部表、RLS 策略，以及相册用的 Storage 公开桶 `photos`。
3. **建账号（两个人）**：
   - Authentication → Users → Add user：邮箱 + 密码（勾 Auto Confirm），建两个；
   - SQL 里 members 的 insert 已含空曙的邮箱；她的账号：去掉 SQL 里那行注释、
     改成她的邮箱再执行一次（role 都填 `admin`，两人权限完全一样）。
4. 打开网站 → 任意页面都会出现登录门 → 登录即可。

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

**Q：Banner 上的头像**
替换 `assets/avatar-a.svg`（空曙）和 `assets/avatar-b.svg`（她）即可，换成 png 也要同步改 Secret.html 里的文件名。
