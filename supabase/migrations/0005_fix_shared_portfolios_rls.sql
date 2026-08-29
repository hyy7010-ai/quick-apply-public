-- =============================================================================
-- AI Fast Resume — SECURITY FIX: close anonymous read access to shared_portfolios
--
-- WHAT IS WRONG
-- -------------
-- Anyone holding the public anon key (it ships in the site's JS bundle) can
-- currently run `select * from shared_portfolios` and read all 83 rows. 23 of
-- them contain identifiable personal data: full name, contact details,
-- LinkedIn, full work history, education, and referees' contact details —
-- third parties who never consented to publication.
--
-- WHY 0001 DID NOT ACTUALLY FIX IT
-- --------------------------------
-- 0001_credits_and_rls.sql enables RLS and creates owner-only policies, and it
-- ran successfully. But it only drops policies by the names it introduces
-- ("shared_portfolios_select_own" etc.). This table predates 0001, and its
-- original schema carried a permissive read policy under a different name.
-- That legacy policy was never dropped and still grants access — RLS being
-- "enabled" means nothing when a permissive policy allows everyone.
--
-- Same root cause as the resume_history issues in 0003: the table is older
-- than the migration files, so `create table if not exists` skipped it and the
-- live schema drifted from what the migrations describe.
--
-- THE FIX
-- -------
-- Drop EVERY policy currently on the table without needing to know its name,
-- then recreate only the intended owner-only set. Anonymous access to a single
-- shared portfolio continues to work through get_shared_portfolio(slug), which
-- is SECURITY DEFINER and therefore bypasses RLS — verified: rows that have a
-- slug still resolve through the RPC after this change. What stops working is
-- bulk enumeration, which is exactly the hole.
--
-- KNOWN CONSEQUENCE
-- -----------------
-- Code that reads this table with a direct `select` instead of the RPC will
-- stop returning rows. The currently deployed (pre-2026-08-21) build does that,
-- so shared links break on production until the newer build is deployed. The
-- local build already uses the RPC (App.tsx). The sharing feature has had no
-- new rows since 2026-04-17, so this window affects old links only.
--
-- Run once: Dashboard -> SQL Editor -> paste -> Run. Idempotent.
-- =============================================================================

-- 1. Remove every existing policy, whatever it is called.
do $$
declare
  r record;
begin
  for r in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'shared_portfolios'
  loop
    raise notice 'Dropping policy % on shared_portfolios', r.policyname;
    execute format('drop policy if exists %I on public.shared_portfolios', r.policyname);
  end loop;
end
$$;

-- 2. RLS on. (Already on, but make it explicit and re-runnable.)
alter table public.shared_portfolios enable row level security;

-- 3. Recreate only the intended owner-only policies.
--    Note: user_id is null on 81 of 83 existing rows and cannot be backfilled
--    (only 2 rows carry anything that identifies an owner), so those rows
--    become invisible to direct queries by design. They remain reachable by
--    slug through the RPC below, which is how public share links work.
create policy "shared_portfolios_select_own"
  on public.shared_portfolios for select
  using (auth.uid() = user_id);

create policy "shared_portfolios_insert_own"
  on public.shared_portfolios for insert
  with check (auth.uid() = user_id);

create policy "shared_portfolios_delete_own"
  on public.shared_portfolios for delete
  using (auth.uid() = user_id);

-- 4. Confirm the capability-URL path is still granted. Knowing the slug grants
--    access to that one row; the table is no longer enumerable.
grant execute on function public.get_shared_portfolio(text) to anon, authenticated;

-- 5. Report anything else in the schema that is still anonymously readable, so
--    this class of drift gets caught here rather than by the next incident.
do $$
declare
  r record;
begin
  for r in
    select p.tablename, p.policyname, p.roles::text as roles, p.cmd
      from pg_policies p
     where p.schemaname = 'public'
       and p.permissive = 'PERMISSIVE'
       and (p.roles::text like '%anon%' or p.roles::text = '{public}')
       and p.cmd in ('SELECT', 'ALL')
       and p.qual is not distinct from 'true'
  loop
    raise warning 'Table %.% still has an anonymous-readable policy (% / %)',
      'public', r.tablename, r.policyname, r.cmd;
  end loop;
end
$$;
