-- Migration: Add missing foreign key indexes
-- Date: 2026-01-28
--
-- These indexes were previously removed in migration 20260121000000_remove_unused_indexes.sql
-- because they showed low usage at that time. However, Supabase Performance Advisor now
-- flags them as missing FK indexes, which can cause performance issues during:
-- 1. CASCADE DELETE operations on referenced tables
-- 2. FK constraint validation during inserts/updates
-- 3. JOIN queries between related tables
--
-- Re-adding these indexes for data integrity and future query optimization.

-- web_messages.conversation_id -> web_conversations.id
-- Used for: fetching messages by conversation, cascade deletes
CREATE INDEX IF NOT EXISTS idx_web_messages_conversation_id
    ON public.web_messages(conversation_id);

-- device_authorization_codes.user_id -> profiles.id (nullable, set after authorization)
-- Used for: looking up user's pending authorizations
-- Partial index since user_id is NULL until authorization completes
CREATE INDEX IF NOT EXISTS idx_device_auth_codes_user_id
    ON public.device_authorization_codes(user_id)
    WHERE user_id IS NOT NULL;

-- email_preferences.user_id -> profiles.id
-- Used for: looking up user's email settings
CREATE INDEX IF NOT EXISTS idx_email_preferences_user_id
    ON public.email_preferences(user_id);

-- referrals.referrer_id -> profiles.id
-- Used for: counting referrals by user, cascade operations
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id
    ON public.referrals(referrer_id);

-- referrals.referred_user_id -> profiles.id
-- Used for: finding referral chain, cascade operations
CREATE INDEX IF NOT EXISTS idx_referrals_referred_user_id
    ON public.referrals(referred_user_id);

-- beta_invites.created_by -> profiles.id
-- Used for: listing invites created by a user
CREATE INDEX IF NOT EXISTS idx_beta_invites_created_by
    ON public.beta_invites(created_by);
