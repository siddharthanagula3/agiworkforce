-- Migration: Remove unused indexes identified by Supabase Performance Advisor
-- These indexes have low usage and are consuming storage/write overhead without providing query benefits
-- Date: 2026-01-21

-- Remove unused index on web_conversations.updated_at
DROP INDEX IF EXISTS idx_web_conversations_updated_at;

-- Remove unused index on web_messages.conversation_id
DROP INDEX IF EXISTS idx_web_messages_conversation_id;

-- Remove unused index on web_messages.created_at
DROP INDEX IF EXISTS idx_web_messages_created_at;

-- Remove unused index on email_preferences.user_id
DROP INDEX IF EXISTS idx_email_preferences_user_id;

-- Remove unused index on referrals.referrer_id
DROP INDEX IF EXISTS idx_referrals_referrer_id;

-- Remove unused index on referrals.referred_user_id
DROP INDEX IF EXISTS idx_referrals_referred_user_id;

-- Remove unused index on device_authorization_codes.user_id
DROP INDEX IF EXISTS idx_device_auth_user_id;

-- Remove unused index on beta_invites.created_by
DROP INDEX IF EXISTS idx_beta_invites_created_by;
