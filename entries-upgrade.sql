-- ===== 朴实文章升级 SQL（2026-11-03）：区分发布者 + 补标题 =====
-- 在 Supabase SQL Editor 里执行一次即可，可重复执行

-- ① entries 表加 author（发布者）字段
alter table public.entries add column if not exists author text not null default '';

-- ② 回填旧文章的发布者：47+1 篇都是你写的，改成你在「情侣配置」里用的名字
--    （比如配置里 name_a 是『空曙』，下面就填『空曙』；她写的文章单独改那几行）
update public.entries set author = '空曙' where author = '';

-- ③ 给没有标题的文章自动拟标题（取自正文第一行）
update public.entries set title = '前一段情绪出了很多大问题，反思……' where id = 'd2025-09-11' and title = '';
update public.entries set title = '严格来讲是今天凌晨，有一说一，……' where id = 'd2025-09-12' and title = '';
update public.entries set title = '终于能，有个短暂的休息了。最重……' where id = 'd2025-09-13' and title = '';
update public.entries set title = '最后还是，做出来了。有点艰辛，……' where id = 'd2025-09-14' and title = '';
update public.entries set title = '头疼，有点感冒，没睡好。最难受……' where id = 'd2025-09-15' and title = '';
update public.entries set title = '挺好的，泛型有意思，不过还得练……' where id = 'd2025-09-17' and title = '';
update public.entries set title = '杜绝内耗，静心提升自我。正视情……' where id = 'd2025-09-18' and title = '';
update public.entries set title = '说实话，今天我才明白了，朋友才……' where id = 'd2025-09-19' and title = '';
update public.entries set title = '事情慢慢稳定下来了，这段时间，……' where id = 'd2025-09-22' and title = '';
update public.entries set title = '很喜欢之前写的一段话，回忆碎片……' where id = 'd2025-09-25' and title = '';
update public.entries set title = '一段想了很久的话' where id = 'd2025-09-26' and title = '';
update public.entries set title = '很失望，说真的，我很伤心，非常……' where id = 'd2025-10-03' and title = '';
update public.entries set title = '平心而论，今天我才意识到一个问……' where id = 'd2025-10-04' and title = '';
update public.entries set title = '过了一个假期，​啥也没干，​但……' where id = 'd2025-10-07' and title = '';
update public.entries set title = '线代试验视频，快问快答，​数竞……' where id = 'd2025-10-10' and title = '';
update public.entries set title = '视频都不看完，肆意评论，很不礼……' where id = 'd2025-11-02' and title = '';
update public.entries set title = '世界上最悲催的事情，可能就是没……' where id = 'd2025-11-05' and title = '';
update public.entries set title = '新的一年，想做的真的很多，但真……' where id = 'd2026-01-11' and title = '';
update public.entries set title = '闲来无聊，写了一篇小说，哈哈，……' where id = 'd2026-04-14' and title = '';
update public.entries set title = '好久好久，没有写日记了，应该是……' where id = 'd2026-05-16' and title = '';
update public.entries set title = '又一次被这样对待' where id = 'd2026-09-19-pkql7' and title = '';
update public.entries set title = '我好像发了一条很危险的朋友圈' where id = 'd2026-09-22-w9lzu' and title = '';
update public.entries set title = '我不知道是怎么了' where id = 'd2026-10-08-0xvjh' and title = '';
update public.entries set title = '延迟满足' where id = 'd2026-10-08-g7q2h' and title = '';
update public.entries set title = '我能感受到她是在想尽办法拒绝，……' where id = 'd2026-10-08-nk7l2' and title = '';
update public.entries set title = '我梦到了九省联考' where id = 'd2026-10-08-oqiox' and title = '';
update public.entries set title = '这几天在填综测的加分申请表' where id = 'd2026-10-10-ohzbj' and title = '';
update public.entries set title = '虽然我不懂怎么谈恋爱' where id = 'd2026-10-10-pftpa' and title = '';
update public.entries set title = '很开心的一天' where id = 'd2026-10-12-0s2iy' and title = '';
update public.entries set title = '换头像了' where id = 'd2026-10-13-hk03x' and title = '';
update public.entries set title = '想姐姐' where id = 'd2026-10-13-v2r06' and title = '';
update public.entries set title = '正因为生命是有限度的' where id = 'd2026-10-14-sxv37' and title = '';
update public.entries set title = '分享日常这么暧昧的事你只能和我……' where id = 'd2026-10-18-t466g' and title = '';
update public.entries set title = '《无解》' where id = 'd2026-10-22-s5qgb' and title = '';
update public.entries set title = '我可以说我是幸福的' where id = 'd2026-10-25-jzdu7' and title = '';
update public.entries set title = '她之前说至少谈三次恋爱' where id = 'd2026-10-26-fn5ha' and title = '';
update public.entries set title = '自卑是什么时候开始的' where id = 'd2026-10-26-yzobi' and title = '';
update public.entries set title = '这一年发生了很多很多事情' where id = 'd2026-11-02-20lgz' and title = '';
update public.entries set title = '今天打了很长时间电话' where id = 'd2026-11-02-2nhe1' and title = '';
update public.entries set title = '小号数据不好，其实有时候我也不……' where id = 'd2026-11-02-3ntcv' and title = '';
update public.entries set title = '好累' where id = 'd2026-11-02-epy2j' and title = '';
update public.entries set title = '虽然这些话是AI写的' where id = 'd2026-11-02-iobbm' and title = '';
update public.entries set title = '教室的窗帘下卷着炽热的梦想' where id = 'd2026-11-02-iu6lh' and title = '';
update public.entries set title = '没想到把耳机拆开' where id = 'd2026-11-02-jaqlz' and title = '';
update public.entries set title = '学了高代 真的感觉好多好多东西' where id = 'd2026-11-02-nrqym' and title = '';
update public.entries set title = '空怀逸兴思' where id = 'd2026-11-02-tjmfu' and title = '';
update public.entries set title = '不知道哪里做的不对' where id = 'd2026-11-02-y95zp' and title = '';
