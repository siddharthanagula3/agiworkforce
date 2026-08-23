-- Beta tester applications from /beta.
--
-- Separate from public.beta_invites: that table is a redeemable code with a use
-- count, which answers "may this account in". This one is the person asking to
-- be let in, and the reviewer's decision about them. Keeping the application
-- next to the code it was eventually issued means a reviewer can see who was
-- approved, with which code, without joining through Stripe.
--
-- No account is required to apply, so user_id is nullable and email is the only
-- identity we have for most rows.

create table if not exists public.beta_applications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  -- Free text rather than a check constraint: the roles worth tracking change
  -- faster than migrations ship, and a rejected insert here would lose an
  -- application rather than record an unexpected answer.
  role text not null,
  company text,
  -- Which surfaces they say they will actually exercise, so a reviewer can
  -- balance the cohort instead of ending up with twenty web-only testers.
  surfaces text[] not null default '{}',
  use_case text,
  discord_handle text,
  -- Set once a reviewer approves and hands out one of the Stripe promotion
  -- codes. Null means nothing was issued, which is the state a rejected or
  -- pending application stays in.
  issued_code text,
  status text not null default 'pending'
    check (status = any (array['pending', 'approved', 'rejected'])),
  reviewed_at timestamptz,
  reviewed_by text,
  reviewer_note text,
  -- user_id is populated only when the applicant happened to be signed in.
  user_id text,
  source text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One application per address. A second submission updates the first rather
-- than creating a duplicate the reviewer has to reconcile by eye.
create unique index if not exists idx_beta_applications_email
  on public.beta_applications(lower(email));

create index if not exists idx_beta_applications_status_created
  on public.beta_applications(status, created_at desc);
