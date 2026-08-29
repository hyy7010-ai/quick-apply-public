-- =============================================================================
-- AI Fast Resume — close the last anonymous path into legacy shared_portfolios
--
-- WHAT THIS FIXES
-- ---------------
-- 0005 stopped `select * from shared_portfolios` for anonymous callers, and a
-- full empirical re-audit (2026-08-29) confirms that hole is closed and that
-- RLS on every other table is correct: signed out, the anon key reads 0 rows
-- everywhere and cannot INSERT/UPDATE/DELETE anything; signed in, a user sees
-- only their own rows and cannot touch another user's; match_snapshots and
-- application_status_history correctly refuse UPDATE and DELETE even to the
-- owner. Nothing there needs changing.
--
-- One anonymous path remains, and it is not an RLS hole — it is the SECURITY
-- DEFINER function get_shared_portfolio(slug) that 0005 deliberately kept open
-- so a share link keeps working. 0005 justified that with "slugs carry a random
-- suffix, so this is a capability URL... the table is not enumerable". That is
-- true of links minted by the current build (name + 16 chars from 10 random
-- bytes — see components/PortfolioGenerator.tsx). It is NOT true of the legacy
-- rows, whose slugs were generated before that scheme existed:
--
--     user-<13-digit-ms-timestamp>-<3-digit>   (e.g. user-1771147258863-626)
--     <firstname>-<3-digit>                    (e.g. alex-rivera-716, jane-628)
--
-- A millisecond timestamp in a known date range plus a 000-999 suffix is not a
-- secret; those slugs are guessable / brute-forceable. Measured on the live
-- data: of the 83 legacy rows, 21 carry personal data (names, contact details,
-- referees' contact details) behind a guessable slug, and get_shared_portfolio
-- returns that content to an anonymous caller who lands on the slug. So the very
-- rows 0005 set out to protect are still reachable one at a time by guessing.
--
-- WHY user_id IS NULL IS THE RIGHT TARGET
-- ---------------------------------------
-- The RLS INSERT policy from 0005 is `with check (auth.uid() = user_id)`. A row
-- with a null user_id fails that check (auth.uid() = null is null, never true),
-- so the current app CANNOT create an ownerless row — verified empirically. Every
-- row with user_id IS NULL is therefore a pre-RLS legacy orphan (81 of the 83
-- rows), owned by nobody: invisible to every direct SELECT because no auth.uid()
-- can match, and reachable ONLY through the slug RPC. Nulling their slug drops
-- them out of that RPC too, making them inert — exactly the state 29 legacy rows
-- are already in (slug was already null). This targets ownerless rows precisely
-- and by construction cannot touch a row any real user owns, so no current share
-- link breaks. The content is preserved (rows are not deleted), so this is
-- reversible and destroys no data.
--
-- The 2 legacy rows that DO carry a user_id keep their slug and their working
-- link; their owner published their own data intentionally and can re-share to
-- get a strong slug. Deleting the orphan rows outright, rather than just
-- neutralizing them, is a data-retention decision that belongs to the owner, not
-- this migration.
--
-- Run once: Dashboard -> SQL Editor -> paste -> Run. Idempotent.
-- =============================================================================

-- 1. Neutralize every ownerless legacy row: no owner can SELECT it, and with a
--    null slug get_shared_portfolio() can no longer resolve it either.
update public.shared_portfolios
   set slug = null
 where user_id is null
   and slug is not null;

-- 2. Report the result and confirm nothing ownerless is still slug-reachable.
do $$
declare
  v_remaining integer;
begin
  select count(*) into v_remaining
    from public.shared_portfolios
   where user_id is null
     and slug is not null;
  if v_remaining = 0 then
    raise notice 'shared_portfolios: no ownerless row is reachable by slug any more.';
  else
    raise warning 'shared_portfolios: % ownerless row(s) still carry a slug.', v_remaining;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- NOTE — defense in depth, deliberately NOT done here
-- The clean fix would be to reject writes that leave user_id null at the schema
-- level (`alter table ... alter column user_id set not null`). It is left out
-- because 81 existing rows are null and a NOT NULL constraint cannot be added
-- while they exist without either backfilling an owner (impossible — there is no
-- owner to attribute them to) or deleting them (the owner's retention call, see
-- above). RLS already prevents new null-owner rows, so the constraint would only
-- guard against a future direct service-role insert, which is not the threat
-- model here.
-- -----------------------------------------------------------------------------
