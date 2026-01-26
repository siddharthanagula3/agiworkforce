-- Migration: Drop unused database tables
-- Description: Removes tables that are defined but never used in the application
-- Tables: email_campaigns, email_sends, feedback, release_info

-- First, update the GDPR delete_user_data function to remove references to email_sends
CREATE OR REPLACE FUNCTION public.delete_user_data(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete user's credit transactions
    DELETE FROM public.credit_transactions WHERE user_id = target_user_id;

    -- Delete user's token credits
    DELETE FROM public.token_credits WHERE subscription_id IN (
        SELECT id FROM public.subscriptions WHERE user_id = target_user_id
    );

    -- Delete user's subscriptions
    DELETE FROM public.subscriptions WHERE user_id = target_user_id;

    -- Delete user's API keys
    DELETE FROM public.api_keys WHERE user_id = target_user_id;

    -- Delete user's devices
    DELETE FROM public.desktop_devices WHERE user_id = target_user_id;
    DELETE FROM public.mobile_devices WHERE user_id = target_user_id;

    -- Delete user's conversations and messages
    DELETE FROM public.web_messages WHERE conversation_id IN (
        SELECT id FROM public.web_conversations WHERE user_id = target_user_id
    );
    DELETE FROM public.web_conversations WHERE user_id = target_user_id;

    -- Delete user's organization memberships
    DELETE FROM public.organization_members WHERE user_id = target_user_id;

    -- Delete user's notifications
    DELETE FROM public.notifications WHERE user_id = target_user_id;

    -- Delete user's audit logs
    DELETE FROM public.audit_logs WHERE user_id = target_user_id;

    -- Delete user's beta redemptions
    DELETE FROM public.beta_redemptions WHERE user_id = target_user_id;

    -- Delete user's email preferences
    DELETE FROM public.email_preferences WHERE user_id = target_user_id;

    -- Finally delete the user's profile
    DELETE FROM public.profiles WHERE id = target_user_id;
END;
$$;

-- Now drop the unused tables
DROP TABLE IF EXISTS public.email_sends CASCADE;
DROP TABLE IF EXISTS public.email_campaigns CASCADE;
DROP TABLE IF EXISTS public.feedback CASCADE;
DROP TABLE IF EXISTS public.release_info CASCADE;

-- Add comment explaining why these were removed
COMMENT ON FUNCTION public.delete_user_data IS 'GDPR-compliant user data deletion. Updated 2026-01-25 to remove references to dropped tables (email_sends, email_campaigns, feedback).';
