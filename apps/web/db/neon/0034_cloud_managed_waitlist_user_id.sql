-- Migration 0034: tie Cloud Managed waitlist signups to signed-in users.
--
-- The website Auto Economy trial is account-bound. Cloud waitlist signups
-- created from that trial must persist the Clerk user id as well as the
-- normalized notification email so support and launch ops can distinguish
-- signed-in customer interest from anonymous public-interest forms.

ALTER TABLE public.cloud_managed_waitlist
  ADD COLUMN IF NOT EXISTS user_id text;

CREATE INDEX IF NOT EXISTS idx_cloud_managed_waitlist_user_id
  ON public.cloud_managed_waitlist(user_id);

COMMENT ON COLUMN public.cloud_managed_waitlist.user_id IS
  'Clerk user id for account-bound Cloud Managed waitlist signups. Nullable for legacy or explicitly anonymous records.';
