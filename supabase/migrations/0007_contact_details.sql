-- =============================================================================
-- AI Fast Resume — structured contact details for application autofill
--
-- Autofill needs to put a phone number in a phone field and a LinkedIn URL in
-- a LinkedIn field. Until now the only place those existed was the resume's
-- free-text `contactInfo` line ("Melbourne VIC | wei@example.com | +61 4..."),
-- which cannot be split reliably enough to type into someone's job
-- application. These columns hold the same facts in a form a form can consume.
--
-- Everything is nullable: a user who fills in nothing simply gets fewer fields
-- filled, never a wrong value.
--
-- Depends on 0002_career_agent.sql.
-- Run once: Dashboard -> SQL Editor -> paste -> Run. Idempotent.
-- =============================================================================

alter table public.career_profiles add column if not exists email        text;
alter table public.career_profiles add column if not exists phone        text;
alter table public.career_profiles add column if not exists city         text;
alter table public.career_profiles add column if not exists country      text;
alter table public.career_profiles add column if not exists linkedin_url text;
alter table public.career_profiles add column if not exists website_url  text;

-- -----------------------------------------------------------------------------
-- Answers to the open-ended questions application forms keep asking, so the
-- same question never has to be written from scratch twice.
--
-- Shape: [{ id, question, answer, category, confirmed, updatedAt }]
--
-- `confirmed` matters: high-stakes answers (salary expectations, visa status,
-- willingness to relocate, notice period) are never filled into a form
-- automatically, whatever is stored here. They are surfaced for the user to
-- read and approve each time, because getting one wrong in a real application
-- is not recoverable by editing a draft.
-- -----------------------------------------------------------------------------
alter table public.career_profiles
  add column if not exists saved_answers jsonb not null default '[]';

comment on column public.career_profiles.saved_answers is
  'Reusable answers to application questions. High-stakes categories (salary, visa, relocation, availability) are surfaced for confirmation on every use and never auto-filled.';
