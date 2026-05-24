-- 账号图谱 · 建库脚本
-- 在你自己的 Supabase 项目 → SQL Editor 里完整运行一次。

-- ============ 平台（大类下的具体厂商）============
create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('email','apple','ai')),
  name text not null,
  color text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ============ 国家 / 地区 ============
create table public.countries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ============ 账号 ============
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('email','apple','ai')),
  platform_id uuid references public.platforms(id),
  name text not null,
  encrypted_password text,          -- 密文 v2:iv:ct
  phone text,
  twofa_enabled boolean not null default false,
  country_id uuid references public.countries(id),
  register_email_id uuid references public.accounts(id) on delete set null,   -- apple/ai 的注册邮箱
  subscribe_apple_id uuid references public.accounts(id) on delete set null,  -- ai 的订阅 Apple ID
  note text,
  recovery_email text,              -- 辅助邮箱（明文元数据）
  encrypted_2fa text,               -- 2FA/TOTP 密钥密文 v2:iv:ct
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounts_category_idx on public.accounts(category);
create index accounts_register_email_idx on public.accounts(register_email_id);
create index accounts_subscribe_apple_idx on public.accounts(subscribe_apple_id);

-- ============ 加密元数据（全局 salt + canary）============
create table public.vault_meta (
  id smallint primary key default 1 check (id = 1),
  salt text not null,
  canary text not null,
  created_at timestamptz not null default now()
);

-- ============ 默认平台 / 国家 ============
insert into public.platforms (category, name, color, sort) values
  ('email', 'Gmail',    '#5b8fb0', 1),
  ('apple', 'Apple ID', '#d4a857', 2),
  ('ai',    'OpenAI',   '#9b7fc4', 3),
  ('ai',    'Claude',   '#9b7fc4', 4);
insert into public.countries (name, color, sort) values
  ('美区',     '#5b8fb0', 1),
  ('中国大陆', '#c2554d', 2),
  ('尼日利亚', '#6fae6a', 3),
  ('土耳其',   '#d4a857', 4);

-- ============ 全量重加密事务函数（改主密码用）============
create or replace function public.rotate_master_key(
  p_salt text, p_canary text, p_updates jsonb
) returns void language plpgsql security invoker set search_path = public as $$
declare item jsonb;
begin
  update public.vault_meta set salt = p_salt, canary = p_canary where id = 1;
  for item in select jsonb_array_elements(p_updates) loop
    update public.accounts set encrypted_password = item->>'ct', updated_at = now()
      where id = (item->>'id')::uuid;
  end loop;
end;
$$;

-- ============ RLS：仅登录用户可访问；匿名(publishable key)零权限 ============
alter table public.accounts   enable row level security;
alter table public.platforms  enable row level security;
alter table public.countries  enable row level security;
alter table public.vault_meta enable row level security;

create policy "authenticated_all" on public.accounts   for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.platforms  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.countries  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.vault_meta for all to authenticated using (true) with check (true);

-- ⚠️ 跑完此脚本后，务必在 Supabase 后台做两件事（否则任何人注册即可访问你的数据）：
--   1. Authentication → Users → Add user：建你自己的登录账号（邮箱+密码，勾 Auto Confirm）
--   2. Authentication → 关闭 "Allow new users to sign up"（禁止他人注册）
-- 这样 authenticated 策略才安全 —— 只有你这一个账号能登录。
