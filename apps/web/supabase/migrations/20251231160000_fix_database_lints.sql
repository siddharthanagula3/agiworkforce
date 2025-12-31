-- Add missing index for foreign key
CREATE INDEX IF NOT EXISTS idx_token_credits_subscription_id ON public.token_credits (subscription_id);

-- Drop unused indexes
DROP INDEX IF EXISTS public.idx_beta_invites_created_by;
DROP INDEX IF EXISTS public.idx_email_preferences_user_id;
DROP INDEX IF EXISTS public.idx_email_sends_user_id;
DROP INDEX IF EXISTS public.idx_referrals_referred_user_id;
DROP INDEX IF EXISTS public.idx_usage_events_user_created;
DROP INDEX IF EXISTS public.idx_waitlist_email;
DROP INDEX IF EXISTS public.idx_waitlist_status;
DROP INDEX IF EXISTS public.idx_waitlist_referral;
DROP INDEX IF EXISTS public.idx_beta_invites_code;
DROP INDEX IF EXISTS public.idx_email_prefs_token;
DROP INDEX IF EXISTS public.idx_email_prefs_email;
DROP INDEX IF EXISTS public.idx_email_sends_campaign;
DROP INDEX IF EXISTS public.idx_email_sends_email;
DROP INDEX IF EXISTS public.idx_email_sends_status;
DROP INDEX IF EXISTS public.idx_referrals_code;
DROP INDEX IF EXISTS public.idx_referrals_referrer;
DROP INDEX IF EXISTS public.idx_credit_transactions_user_id;
DROP INDEX IF EXISTS public.idx_credit_transactions_credit_account_id;
DROP INDEX IF EXISTS public.idx_credit_transactions_created_at;
DROP INDEX IF EXISTS public.idx_token_credits_period_start;
DROP INDEX IF EXISTS public.idx_token_credits_period_end;
DROP INDEX IF EXISTS public.idx_token_credits_last_daily_reset;
