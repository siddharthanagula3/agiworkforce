/**
 * User Types
 *
 * Shared types for user identity, profile, and subscription management
 * across all surfaces.
 *
 * For auth-specific types (sessions, tokens, bridge messages), see `auth.ts`.
 *
 * @module user
 * @packageDocumentation
 */

// ============================================================================
// Subscription Tier
// ============================================================================

/**
 * Subscription tier levels available in the platform.
 *
 * - `free` -- Basic access with limited features and token allowance.
 * - `hobby` -- Enhanced features for individual users.
 * - `pro` -- Full feature access for professionals.
 * - `max` -- Maximum feature access with highest token limits.
 * - `enterprise` -- Custom enterprise deployment with dedicated support.
 */
export type SubscriptionTier = 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';

// ============================================================================
// Subscription Status
// ============================================================================

/**
 * Status of a user's subscription.
 */
export type UserSubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'expired';

// ============================================================================
// User
// ============================================================================

/**
 * Core user identity shared across all surfaces.
 *
 * @example
 * ```typescript
 * const user: User = {
 *   id: 'user-abc-123',
 *   email: 'user@example.com',
 *   name: 'Jane Developer',
 *   avatarUrl: 'https://avatars.example.com/jane.jpg',
 *   subscriptionTier: 'pro',
 *   createdAt: '2026-01-15T00:00:00Z',
 * };
 * ```
 */
export interface User {
  /** Unique user identifier (Supabase UUID). */
  id: string;

  /** User's email address. */
  email: string;

  /** Display name. */
  name?: string;

  /** Avatar image URL. */
  avatarUrl?: string;

  /** Current subscription tier. */
  subscriptionTier: SubscriptionTier;

  /** ISO 8601 timestamp when the account was created. */
  createdAt: string;
}

// ============================================================================
// User Profile
// ============================================================================

/**
 * Extended user profile with preferences and usage data.
 *
 * This extends the base `UserProfile` (from `auth.ts`) with subscription,
 * usage, and preference fields.
 *
 * @example
 * ```typescript
 * const profile: ExtendedUserProfile = {
 *   id: 'user-abc-123',
 *   email: 'user@example.com',
 *   name: 'Jane Developer',
 *   avatarUrl: 'https://avatars.example.com/jane.jpg',
 *   subscriptionTier: 'pro',
 *   subscriptionStatus: 'active',
 *   tokenBalance: 50000,
 *   monthlyTokenLimit: 100000,
 *   tokensUsedThisMonth: 50000,
 *   preferredModel: 'claude-opus-4-6',
 *   preferredProvider: 'anthropic',
 *   createdAt: '2026-01-15T00:00:00Z',
 *   updatedAt: '2026-03-15T10:00:00Z',
 * };
 * ```
 */
export interface ExtendedUserProfile {
  /** Unique user identifier (Supabase UUID). */
  id: string;

  /** User's email address. */
  email: string;

  /** Display name. */
  name?: string;

  /** Avatar image URL. */
  avatarUrl?: string;

  /** Current subscription tier. */
  subscriptionTier: SubscriptionTier;

  /** Subscription billing status. */
  subscriptionStatus?: UserSubscriptionStatus;

  /** Current token balance (credits). */
  tokenBalance?: number;

  /** Monthly token limit for the current plan. */
  monthlyTokenLimit?: number;

  /** Tokens consumed in the current billing period. */
  tokensUsedThisMonth?: number;

  /** User's preferred default model. */
  preferredModel?: string;

  /** User's preferred default provider. */
  preferredProvider?: string;

  /** User's preferred theme. */
  theme?: 'light' | 'dark' | 'system';

  /** User's preferred language (BCP 47 code). */
  language?: string;

  /** ISO 8601 timestamp when the profile was created. */
  createdAt: string;

  /** ISO 8601 timestamp when the profile was last updated. */
  updatedAt?: string;

  /** Arbitrary profile metadata. */
  metadata?: Record<string, unknown>;
}
