-- =============================================================================
-- AI Fast Resume — repair: resume_history must cascade on user deletion
--
-- WHY THIS EXISTS
-- ---------------
-- public.resume_history predates 0001_credits_and_rls.sql. That migration
-- declares the table with `user_id ... references auth.users (id) on delete
-- cascade`, but because it uses `create table if not exists`, the statement was
-- a no-op against the already-existing table — so the live table kept whatever
-- foreign key the original (pre-migration) schema gave it, which has NO
-- cascade.
--
-- Symptom: deleting a user whose resume_history has rows fails.
-- supabase.auth.admin.deleteUser returns 500 "unexpected_failure", and the
-- account is left undeleted. Verified empirically by isolating each table:
-- career_profiles, jobs and match_snapshots all cascade correctly;
-- resume_history alone blocks the delete.
--
-- Impact: a real user cannot delete their account — a right-to-erasure problem,
-- not just a test-cleanup annoyance.
--
-- This migration finds whichever foreign key on resume_history.user_id points
-- at auth.users (the constraint name is not assumed) and recreates it with
-- ON DELETE CASCADE. It is safe to re-run: if the constraint already cascades,
-- nothing changes.
--
-- Run once: Dashboard -> SQL Editor -> paste -> Run
-- =============================================================================

do $$
declare
  v_constraint text;
  v_delete_rule text;
begin
  select tc.constraint_name, rc.delete_rule
    into v_constraint, v_delete_rule
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.constraint_schema = tc.constraint_schema
    join information_schema.referential_constraints rc
      on rc.constraint_name = tc.constraint_name
     and rc.constraint_schema = tc.constraint_schema
   where tc.constraint_type = 'FOREIGN KEY'
     and tc.table_schema = 'public'
     and tc.table_name = 'resume_history'
     and kcu.column_name = 'user_id'
   limit 1;

  if v_constraint is null then
    raise notice 'resume_history has no FK on user_id; adding one with cascade.';
    alter table public.resume_history
      add constraint resume_history_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;

  elsif v_delete_rule = 'CASCADE' then
    raise notice 'resume_history.% already cascades; nothing to do.', v_constraint;

  else
    raise notice 'Recreating % (delete_rule was %) with ON DELETE CASCADE.',
      v_constraint, v_delete_rule;
    execute format('alter table public.resume_history drop constraint %I', v_constraint);
    alter table public.resume_history
      add constraint resume_history_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Same check for the other pre-existing table from 0001. shared_portfolios and
-- interview_history were created by 0001 itself (so they already cascade), but
-- resume_history is not necessarily the only table that predates it — this
-- reports anything still missing a cascade so it can be dealt with explicitly
-- rather than discovered later by a failed account deletion.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select tc.table_name, tc.constraint_name, rc.delete_rule
      from information_schema.table_constraints tc
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
       and ccu.constraint_schema = tc.constraint_schema
      join information_schema.referential_constraints rc
        on rc.constraint_name = tc.constraint_name
       and rc.constraint_schema = tc.constraint_schema
     where tc.constraint_type = 'FOREIGN KEY'
       and tc.table_schema = 'public'
       and ccu.table_schema = 'auth'
       and ccu.table_name = 'users'
       and rc.delete_rule <> 'CASCADE'
  loop
    raise warning 'FK %.% still does not cascade (delete_rule=%) — user deletion will fail while rows exist.',
      r.table_name, r.constraint_name, r.delete_rule;
  end loop;
end
$$;
