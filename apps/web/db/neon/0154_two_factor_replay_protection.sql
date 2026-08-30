-- 0154 — make a used TOTP code unusable for the rest of its window.
--
-- NOT YET APPLIED — draft only, pending explicit approval before running.
--
-- verifyTOTPCode only ever answered "do these digits match a code that is
-- current". A code stays current for its own 30-second step plus the one step
-- either side the verifier accepts for clock skew, so the same six digits were
-- accepted repeatedly for up to 90 seconds. Anyone who read the code over a
-- shoulder, out of a screen share, or from a phishing relay could replay it
-- against /api/settings/2fa/validate, /verify, /backup-codes and the disable
-- path while the user's own attempt was still in flight.
--
-- Recording the accepted step turns the check into "current AND not already
-- spent". The column is nullable because every existing row predates it; a null
-- means nothing has been spent yet, which is the correct starting state.
--
-- The step is a counter, not a timestamp: floor(unixSeconds / 30). Storing it
-- rather than last_verified_at keeps the comparison exact — two verifications
-- inside one step are indistinguishable by wall clock but not by step number.

alter table public.user_two_factor
  add column if not exists last_totp_step bigint;

comment on column public.user_two_factor.last_totp_step is
  'Highest TOTP time step (unix seconds / 30) already accepted for this user. A code at or below it is a replay and must be refused.';
