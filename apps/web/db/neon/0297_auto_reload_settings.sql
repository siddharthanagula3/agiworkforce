-- =============================================================================
-- Migration 0297: per-account auto-reload, and one reload in flight at a time
--
-- Why    : a paid subscriber who runs out of purchased credits has to notice,
--          open Settings and buy a top-up by hand. Auto-reload buys the chosen
--          pack off-session with the saved card when purchased and bonus
--          credits fall below a threshold.
--
-- Shape  : one row per account. enabled, threshold_credits and amount_usd are
--          what the account chose; the range checks live in
--          packages/contracts/types/src/billing-topups.ts, the single owner of
--          those limits. reload_attempt_id and reload_lease_expires_at are the
--          lease that keeps at most one reload in flight: taken before the
--          PaymentIntent is created, released when the payment succeeds or
--          fails, and reclaimed by the sweep once it expires.
--          reload_payment_intent_id lets the sweep settle a charge whose
--          webhook never arrived instead of charging again.
--
-- Consent: an automatic charge needs the account's express, recorded consent to
--          the terms it was shown. consent_* holds the consent text version,
--          when it was accepted, and the pack, threshold and card it named. A
--          row can only be enabled under a consent that names its current pack
--          and threshold, so changing either while enabled needs new consent.
--
-- Receipt: an auto-reload grant is keyed by its PaymentIntent id, so the
--          partial unique index below makes a PaymentIntent grant at most once,
--          as 0111 does for Checkout Session ids.
--
-- Empty  : starts empty. An account with no row has never turned auto-reload on.
--
-- Depends: 0037 (profiles, current_app_user_id), 0111 (credit_transactions)
-- =============================================================================

begin;

create table if not exists public.auto_reload_settings (
  user_id text primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  threshold_credits integer not null check (threshold_credits > 0),
  amount_usd integer not null check (amount_usd > 0),
  reload_attempt_id uuid,
  reload_payment_intent_id text
    check (reload_payment_intent_id is null or char_length(reload_payment_intent_id) between 1 and 255),
  reload_lease_expires_at timestamptz,
  last_attempt_at timestamptz,
  last_failure_at timestamptz,
  last_failure_reason text
    check (last_failure_reason is null or char_length(last_failure_reason) between 1 and 64),
  consent_version text
    check (consent_version is null or char_length(consent_version) between 1 and 32),
  consent_accepted_at timestamptz,
  consent_amount_usd integer,
  consent_threshold_credits integer,
  consent_card_brand text
    check (consent_card_brand is null or char_length(consent_card_brand) between 1 and 32),
  consent_card_last4 text
    check (consent_card_last4 is null or consent_card_last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auto_reload_settings_lease_names_an_attempt
    check ((reload_attempt_id is null) = (reload_lease_expires_at is null)),
  constraint auto_reload_settings_intent_belongs_to_an_attempt
    check (reload_payment_intent_id is null or reload_attempt_id is not null),
  constraint auto_reload_settings_failure_has_a_reason
    check ((last_failure_at is null) = (last_failure_reason is null)),
  constraint auto_reload_settings_consent_is_whole
    check (
      (consent_accepted_at is null) = (consent_version is null)
      and (consent_accepted_at is null) = (consent_amount_usd is null)
      and (consent_accepted_at is null) = (consent_threshold_credits is null)
      and (consent_accepted_at is null) = (consent_card_brand is null)
      and (consent_accepted_at is null) = (consent_card_last4 is null)
    ),
  constraint auto_reload_settings_enabled_under_consent
    check (
      not enabled
      or (
        consent_accepted_at is not null
        and consent_amount_usd = amount_usd
        and consent_threshold_credits = threshold_credits
      )
    )
);

create index if not exists idx_auto_reload_settings_sweep
  on public.auto_reload_settings (user_id)
  where enabled or reload_attempt_id is not null;

create unique index if not exists idx_credit_transactions_top_up_payment_intent_receipt
  on public.credit_transactions (user_id, description)
  where transaction_type = 'purchase'
    and description like 'Credit top-up purchase pi_%';

revoke all on public.auto_reload_settings from app_rls;
grant select, insert, update on public.auto_reload_settings to app_rls;

alter table public.auto_reload_settings enable row level security;
alter table public.auto_reload_settings force row level security;

drop policy if exists auto_reload_settings_owner on public.auto_reload_settings;
create policy auto_reload_settings_owner
  on public.auto_reload_settings for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.auto_reload_settings is
  'One row per account that has configured auto-reload: whether it is on, the purchased-plus-bonus credit threshold that triggers it, the pack it buys, the lease that keeps one reload in flight, and the last failure that turned it off.';
comment on column public.auto_reload_settings.reload_attempt_id is
  'The reload currently in flight, also sent to Stripe as the PaymentIntent idempotency key and metadata. NULL when idle.';
comment on column public.auto_reload_settings.last_failure_reason is
  'A short code for why the last reload failed, such as authentication_required or card_declined. A failure turns auto-reload off.';
comment on column public.auto_reload_settings.consent_version is
  'The version of the auto-reload consent text the account accepted. With consent_accepted_at and the pack, threshold and card it named, this is the record that the account authorized off-session charges.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A lease without an attempt is refused:
-- --    INSERT INTO public.auto_reload_settings
-- --      (user_id, threshold_credits, amount_usd, reload_lease_expires_at)
-- --    VALUES ('<user>', 500, 20, now());
-- --    EXPECT: ERROR new row violates check constraint
-- --            "auto_reload_settings_lease_names_an_attempt"
--
-- -- 2. One PaymentIntent grants once:
-- --    SELECT add_credits_microusd('<user>', '<account>', 5000000,
-- --      'Credit top-up purchase pi_verify', 'purchase');  -- twice
-- --    EXPECT: the second call fails on
-- --            idx_credit_transactions_top_up_payment_intent_receipt
--
-- -- 3. Another tenant sees nothing, and the app role cannot delete:
-- --    SET ROLE app_rls;
-- --    SELECT count(*) FROM public.auto_reload_settings;  -- EXPECT 0 for another user
-- --    DELETE FROM public.auto_reload_settings;           -- EXPECT permission denied
-- --    RESET ROLE;
--
-- -- 4. Auto-reload cannot be on without consent to its current pack and threshold:
-- --    INSERT INTO public.auto_reload_settings (user_id, enabled, threshold_credits, amount_usd)
-- --    VALUES ('<user>', true, 500, 20);
-- --    EXPECT: ERROR new row violates check constraint
-- --            "auto_reload_settings_enabled_under_consent"
--
-- -- 5. Clean up:
-- --    DELETE FROM public.credit_transactions WHERE description = 'Credit top-up purchase pi_verify';
-- --    DELETE FROM public.auto_reload_settings WHERE user_id = '<user>';
-- =============================================================================
