-- Volunteering and awards on the Career Profile.
--
-- Scoring reads confirmed experience for the skills dimension, which is 30% of
-- the match, and until now "experience" meant paid work history only. For
-- someone ten years into a career that is a fair simplification. For the
-- graduates and career changers this product is aimed at it is not: their
-- strongest evidence is often a society they ran, a charity they gave two
-- years to, or a competition they won. Dropping all of it scored exactly the
-- people who most need the help as though they had done nothing, and told them
-- so with a reason that was not true.
--
-- The resume templates already render volunteer and awards sections. They have
-- simply never had anywhere to read them from.
--
-- Both are additive with defaults, so existing rows stay valid and nothing
-- needs backfilling. Safe to run twice.

alter table public.career_profiles
  -- Same shape as work_history: [{ id, role, company, startDate, endDate,
  -- current, summary, confirmed }]. Confirmed defaults to false for anything
  -- imported, so the fact whitelist rule holds here too — an unconfirmed entry
  -- is a suggestion, never something the agent may assert to an employer.
  add column if not exists volunteer jsonb not null default '[]';

alter table public.career_profiles
  -- Plain strings: "Dean's List 2024", "1st place, UniHack 2023".
  add column if not exists awards jsonb not null default '[]';

comment on column public.career_profiles.volunteer is
  'Unpaid roles: societies, charities, community work. Same shape as work_history, including the confirmed flag.';

comment on column public.career_profiles.awards is
  'Awards, honours and competition placings, as plain strings.';
