-- =====================================================================
-- 案件管理システム : Supabase セットアップ
--
-- Supabase ダッシュボード > SQL Editor にこのファイルの中身を全部貼って
-- RUN すれば、必要なテーブルとポリシーが作られます。
-- 何度実行しても壊れません(既にある場合は作り直しません)。
-- 求人広告 運用ダッシュボードの jobs テーブルには触りません。
-- =====================================================================

-- 画面の保存単位(案件・掲載・広告取込・設定・応募集計)を1行ずつ JSON で持つ
create table if not exists public.anken_docs (
  -- 種類: cases / postings / ads / config / stats
  coll        text        not null,
  -- 種類の中のID(案件ID、"main"、"applicants" など)
  id          text        not null,
  data        jsonb       not null default '{}'::jsonb,
  -- 画面はこの値が変わった行だけを読み直す
  updated_at  timestamptz not null default now(),
  -- 右上の「入力者」
  updated_by  text,
  primary key (coll, id)
);

-- =====================================================================
-- アクセス制御
--
-- ログイン機能はなく、画面は anon / publishable key だけで読み書きします。
-- URLや公開リポジトリの config.js を見た人は誰でも読み書きできる状態です。
-- 取引先の連絡先・単価が入るため、リンクは社内の非公開経路だけで共有してください。
-- 制限が必要になったら Supabase Auth でログインを追加し、下のポリシーを
-- "to authenticated" に変えます。
-- =====================================================================

alter table public.anken_docs enable row level security;

grant select, insert, update, delete on public.anken_docs to anon;

drop policy if exists "anken_docs_anon_select" on public.anken_docs;
drop policy if exists "anken_docs_anon_insert" on public.anken_docs;
drop policy if exists "anken_docs_anon_update" on public.anken_docs;
drop policy if exists "anken_docs_anon_delete" on public.anken_docs;

create policy "anken_docs_anon_select" on public.anken_docs
  for select to anon using (true);

-- 保存は insert + update の upsert で行うため両方必要
create policy "anken_docs_anon_insert" on public.anken_docs
  for insert to anon with check (true);

create policy "anken_docs_anon_update" on public.anken_docs
  for update to anon using (true) with check (true);

-- 案件の削除、掲載の削除
create policy "anken_docs_anon_delete" on public.anken_docs
  for delete to anon using (true);
