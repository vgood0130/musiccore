-- Supabase SQL Editor에서 이 스크립트를 한 번 실행하면
-- 앱이 사용하는 키-값 저장 테이블이 만들어집니다.

create table if not exists kv_store (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- 이 앱은 로그인 기능이 없는 "개인용 단일 사용자" 도구이므로,
-- 앱이 쓰는 anon key로 이 테이블에 자유롭게 읽고 쓸 수 있도록 허용합니다.
-- (URL과 anon key를 아는 사람만 접근할 수 있어요. 이 값들을
--  타인과 공유하거나 공개 저장소에 올리지 마세요.)
alter table kv_store enable row level security;

create policy "allow anon read" on kv_store
  for select using (true);

create policy "allow anon write" on kv_store
  for insert with check (true);

create policy "allow anon update" on kv_store
  for update using (true);

create policy "allow anon delete" on kv_store
  for delete using (true);
