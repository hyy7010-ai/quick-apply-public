-- =============================================================================
-- AI Fast Resume — credits ledger + row level security
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   (or: supabase db push)
--
-- It is written to be re-runnable (idempotent).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Credits live in Postgres, not in Stripe customer metadata.
--    Stripe is a payment processor, not a database: metadata read-modify-write
--    has no atomicity, so two concurrent requests could spend the same credit.
-- -----------------------------------------------------------------------------
create table if not exists public.user_credits (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  credits         integer     not null default 0 check (credits >= 0),
  last_bonus_date date,
  updated_at      timestamptz not null default now()
);

alter table public.user_credits enable row level security;

-- Users may read their own balance. There are deliberately NO insert/update/
-- delete policies: every write goes through the security-definer functions
-- below, which the server calls with the service role key.
drop policy if exists "user_credits_select_own" on public.user_credits;
create policy "user_credits_select_own"
  on public.user_credits for select
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 2. Atomic spend. A single UPDATE ... WHERE credits >= amount means two
--    concurrent requests can never both succeed on the last credit.
-- -----------------------------------------------------------------------------
create or replace function public.deduct_credits(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  update public.user_credits
     set credits = credits - p_amount,
         updated_at = now()
   where user_id = p_user_id
     and credits >= p_amount
  returning credits into v_remaining;

  if not found then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  return v_remaining;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Add credits (Stripe webhook after a verified payment).
-- -----------------------------------------------------------------------------
create or replace function public.add_credits(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  insert into public.user_credits (user_id, credits)
       values (p_user_id, p_amount)
  on conflict (user_id) do update
          set credits = public.user_credits.credits + excluded.credits,
              updated_at = now()
    returning credits into v_total;

  return v_total;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Daily free refill: top the balance up to p_floor, at most once per UTC day.
--    Returns the resulting balance and whether anything was actually added.
-- -----------------------------------------------------------------------------
create or replace function public.claim_daily_bonus(p_user_id uuid, p_floor integer)
returns table (credits integer, bonus_applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer;
  v_after  integer;
begin
  insert into public.user_credits (user_id, credits, last_bonus_date)
       values (p_user_id, greatest(p_floor, 0), current_date)
  on conflict (user_id) do nothing;

  if found then
    return query select greatest(p_floor, 0), true;
    return;
  end if;

  select uc.credits into v_before
    from public.user_credits uc
   where uc.user_id = p_user_id;

  update public.user_credits uc
     set credits         = greatest(uc.credits, p_floor),
         last_bonus_date = current_date,
         updated_at      = now()
   where uc.user_id = p_user_id
     and uc.last_bonus_date is distinct from current_date
  returning uc.credits into v_after;

  if v_after is null then
    v_after := v_before;
  end if;

  return query select v_after, (v_after > v_before);
end;
$$;

revoke all on function public.deduct_credits(uuid, integer)      from public, anon, authenticated;
revoke all on function public.add_credits(uuid, integer)         from public, anon, authenticated;
revoke all on function public.claim_daily_bonus(uuid, integer)   from public, anon, authenticated;
-- service_role only (the server). The browser can never call these directly.
grant execute on function public.deduct_credits(uuid, integer)    to service_role;
grant execute on function public.add_credits(uuid, integer)       to service_role;
grant execute on function public.claim_daily_bonus(uuid, integer) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Published portfolios.
--    Previously: no user_id, RLS effectively open -> anyone holding the public
--    anon key could `select *` and walk every user's name, phone, email and
--    full work history. Now: owners see their own rows, and anonymous visitors
--    can only resolve ONE row at a time, by exact slug, through an RPC.
-- -----------------------------------------------------------------------------
create table if not exists public.shared_portfolios (
  id         bigint generated by default as identity primary key,
  slug       text not null,
  content    jsonb not null,
  user_id    uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.shared_portfolios add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.shared_portfolios add column if not exists created_at timestamptz not null default now();

create unique index if not exists shared_portfolios_slug_key on public.shared_portfolios (slug);

alter table public.shared_portfolios enable row level security;

drop policy if exists "shared_portfolios_select_own" on public.shared_portfolios;
create policy "shared_portfolios_select_own"
  on public.shared_portfolios for select
  using (auth.uid() = user_id);

drop policy if exists "shared_portfolios_insert_own" on public.shared_portfolios;
create policy "shared_portfolios_insert_own"
  on public.shared_portfolios for insert
  with check (auth.uid() = user_id);

drop policy if exists "shared_portfolios_delete_own" on public.shared_portfolios;
create policy "shared_portfolios_delete_own"
  on public.shared_portfolios for delete
  using (auth.uid() = user_id);

-- Single-row lookup by exact slug. Slugs carry a random suffix, so this is a
-- capability URL: knowing the link grants access, but the table is not
-- enumerable the way `select *` was.
create or replace function public.get_shared_portfolio(p_slug text)
returns table (slug text, content jsonb)
language sql
security definer
set search_path = public
stable
as $$
  select sp.slug, sp.content
    from public.shared_portfolios sp
   where sp.slug = p_slug
   limit 1;
$$;

grant execute on function public.get_shared_portfolio(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. History tables — resumes and interview transcripts are personal data.
-- -----------------------------------------------------------------------------
create table if not exists public.resume_history (
  id         bigint generated by default as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  content    jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.resume_history enable row level security;

drop policy if exists "resume_history_own" on public.resume_history;
create policy "resume_history_own"
  on public.resume_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists resume_history_user_created_idx
  on public.resume_history (user_id, created_at desc);

create table if not exists public.interview_history (
  id                text primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  timestamp         bigint,
  overall_score     numeric,
  summary           text,
  duration_minutes  integer,
  interviewer       text,
  mode              text,
  jd_source         text,
  custom_jd_preview text,
  full_jd           text,
  transcript        jsonb,
  report_data       jsonb,
  created_at        timestamptz not null default now()
);

alter table public.interview_history enable row level security;

drop policy if exists "interview_history_own" on public.interview_history;
create policy "interview_history_own"
  on public.interview_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists interview_history_user_ts_idx
  on public.interview_history (user_id, timestamp desc);
