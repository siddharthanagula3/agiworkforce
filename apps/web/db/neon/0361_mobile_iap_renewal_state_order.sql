-- =============================================================================
-- Migration 0361: order App Store renewal-state notices by when they were signed
--
-- Why    : every App Store Server Notification carries the auto-renew choice as
--          it stood when Apple signed it, and Apple does not deliver them in
--          order. A notice signed before the customer turned auto-renew off
--          could arrive after the one that recorded it and turn it back on, so
--          the plan showed as renewing when it was set to end.
--
-- Shape  : one nullable timestamp on the account's store binding, holding the
--          signature time of the newest notice that set the auto-renew choice.
--          A notice signed earlier still moves the period it describes, under
--          the existing period guard, but leaves the choice alone. Null means
--          no notice has set it yet, so the first one always applies.
--
-- Access : mobile_iap_accounts stays service-owned under forced row level
--          security with no app_rls policy (0112); nothing here changes that.
--
-- Depends: 0112 (mobile_iap_accounts)
-- =============================================================================

begin;

alter table public.mobile_iap_accounts
  add column if not exists renewal_state_signed_at timestamptz;

comment on column public.mobile_iap_accounts.renewal_state_signed_at is
  'Signature time of the newest App Store notice that set cancel_at_period_end for this account.';

commit;
