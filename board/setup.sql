-- =====================================================================
-- 求人広告 運用ダッシュボード : Supabase セットアップ
--
-- Supabase ダッシュボード > SQL Editor にこのファイルの中身を全部貼って
-- RUN すれば、必要なテーブルとポリシーが作られます。
-- 何度実行しても壊れません(既にある場合は作り直しません)。
-- =====================================================================

create table if not exists public.jobs (
  -- 求人番号。求人BOXの求人は "kb:7874-6942-0001" のように接頭辞が付く
  job_id          text primary key,
  -- 拠点。エアワーク: plus-i / plus-c / next / up、求人BOX: plus / next / up
  branch          text,
  title           text,
  -- エアワークは求人メモ、求人BOXは「勤務地 ・ 勤務先名 ・ キャンペーン名」
  memo            text,
  company         text,
  -- 詳細画面で企業名を手入力したら true。以後CSVで上書きしない
  company_manual  boolean     not null default false,
  employment_type text,
  -- 修正日の配列 ["2026-09-08", ...]
  revisions       jsonb       not null default '[]'::jsonb,
  -- タイトルの変更履歴 [{"date":"2026-09-08","title":"..."}, ...]
  title_history   jsonb       not null default '[]'::jsonb,
  -- 取り込み日ごとの実績 {"2026-09-08": {"impressions":41, "clicks":0, ...}}
  -- 求人BOXの場合は periodStart(集計期間の開始日)と status も入る
  snapshots       jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 拠点タブの絞り込み用
create index if not exists jobs_branch_idx on public.jobs (branch);

-- =====================================================================
-- アクセス制御
--
-- 画面は publishable key(anon)だけで読み書きします。ログイン機能がないため、
-- URLを知っている人は誰でも読み書きできる状態になります。
-- READMEの「検索エンジン対策」のとおり、リンクは社内の非公開経路だけで
-- 共有してください。アクセス制限が必要になったら別途ログイン機能が要ります。
-- =====================================================================

alter table public.jobs enable row level security;

drop policy if exists "jobs_anon_select" on public.jobs;
drop policy if exists "jobs_anon_insert" on public.jobs;
drop policy if exists "jobs_anon_update" on public.jobs;
drop policy if exists "jobs_anon_delete" on public.jobs;

-- 一覧の読み込み(loadAllJobs)
create policy "jobs_anon_select" on public.jobs
  for select to anon using (true);

-- CSV取り込みの新規登録。取り込みは insert + update の upsert で行うため両方必要
create policy "jobs_anon_insert" on public.jobs
  for insert to anon with check (true);

create policy "jobs_anon_update" on public.jobs
  for update to anon using (true) with check (true);

-- 詳細画面の「この求人データを削除」と「全データを削除」
create policy "jobs_anon_delete" on public.jobs
  for delete to anon using (true);
