-- ============================================================
-- Love Photo 相册功能升级（可重复执行，只加东西不改数据）
-- 全新环境直接跑 supabase-install.sql 即可，无需本文件
-- ============================================================

-- ① 照片表加「所属相册」列（存相册名，空 = 未分类）
alter table public.photos add column if not exists album text not null default '';

-- ② 相册表（可以建空相册；删除相册后照片自动回到「未分类」，照片不丢）
create table if not exists public.photo_albums (
  id         text primary key,
  name       text not null,
  created_at timestamptz not null default now()
);
alter table public.photo_albums enable row level security;
drop policy if exists albums_read   on public.photo_albums;
drop policy if exists albums_insert on public.photo_albums;
drop policy if exists albums_update on public.photo_albums;
drop policy if exists albums_delete on public.photo_albums;
create policy albums_read   on public.photo_albums for select to authenticated using (public.is_member());
create policy albums_insert on public.photo_albums for insert to authenticated with check (public.is_member());
create policy albums_update on public.photo_albums for update to authenticated using (public.is_member());
create policy albums_delete on public.photo_albums for delete to authenticated using (public.is_member());
