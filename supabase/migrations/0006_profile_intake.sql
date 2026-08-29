-- =============================================================================
-- AI Fast Resume — Career Profile intake: resume import + optional demographics
--
-- Adds what Step 1 of the strategy doc actually asks for ("上传现有简历或手工
-- 填写。系统提取教育、经历、项目、技能、语言、证书、成就，并要求用户确认")
-- plus the two optional demographic fields the owner asked for.
--
-- Depends on 0002_career_agent.sql.
-- Run once: Dashboard -> SQL Editor -> paste -> Run. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Structured work history, imported from a resume and confirmed by the user.
--
--    Kept separate from confirmed_facts (which is free-text one-liners) because
--    match scoring needs dates and titles it can reason about, and a future
--    Autofill needs them field-by-field to populate application forms.
--    Shape: [{ id, role, company, startDate, endDate, current, summary,
--              confirmed }]
-- -----------------------------------------------------------------------------
alter table public.career_profiles
  add column if not exists work_history jsonb not null default '[]';

-- Education, same reasoning.
-- Shape: [{ id, school, degree, field, startDate, endDate, confirmed }]
alter table public.career_profiles
  add column if not exists education jsonb not null default '[]';

-- Certifications / awards the user confirmed.
alter table public.career_profiles
  add column if not exists certifications jsonb not null default '[]';

-- -----------------------------------------------------------------------------
-- 2. Where the profile was imported from, so the UI can say "imported from
--    your resume on <date>, please confirm" rather than presenting AI guesses
--    as established fact.
-- -----------------------------------------------------------------------------
alter table public.career_profiles
  add column if not exists imported_from_resume_at timestamptz;

-- -----------------------------------------------------------------------------
-- 3. Optional demographics.
--
-- *** THESE MUST NEVER BE USED FOR MATCH SCORING OR RANKING. ***
--
-- Age and gender are protected attributes. The product strategy's own risk
-- controls (section 10, 算法偏差) require that protected attributes are not
-- used for negative ranking, and in Australia employers may not ask for them
-- at all. Feeding them into a fit score would reproduce age/gender
-- discrimination inside a number the user cannot inspect.
--
-- They are collected only because:
--   - Chinese resume conventions normally include 性别 and 年龄, and a resume
--     generated for that market looks wrong without them;
--   - application forms sometimes ask, and a future Autofill needs an answer
--     the user has already approved rather than inventing one.
--
-- Design constraints that make misuse harder:
--   - Both are optional and default to unset; skipping them costs the user
--     nothing.
--   - Age is a BAND, never a birth date or exact age, so the value is too
--     coarse to filter individuals on.
--   - They live under a deliberately separate name from the scoring fields.
--     generateJobMatchScore() must not read this column — see the comment at
--     that function.
-- -----------------------------------------------------------------------------
alter table public.career_profiles
  add column if not exists optional_demographics jsonb not null default '{}';

comment on column public.career_profiles.optional_demographics is
  'Optional, user-supplied. Shape: { ageBand?: ''18-24''|''25-34''|''35-44''|''45-54''|''55+'', gender?: ''female''|''male''|''self-described''|''prefer-not-to-say'', genderSelfDescribed?: text }. NEVER use for match scoring, ranking, or filtering — protected attributes. Resume rendering (CN market) and application autofill only.';
