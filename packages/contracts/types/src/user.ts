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

import type { BillingPlanTier } from './billing-catalog';

export type SubscriptionTier = Exclude<BillingPlanTier, 'local-only' | 'byok'>;

export type UserSubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'expired';

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
  id: string;

  email: string;

  name?: string;

  avatarUrl?: string;

  subscriptionTier: SubscriptionTier;

  createdAt: string;
}

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
 *   preferredModel: selectedModel.id,
 *   preferredProvider: selectedModel.provider,
 *   createdAt: '2026-01-15T00:00:00Z',
 *   updatedAt: '2026-03-15T10:00:00Z',
 * };
 * ```
 */
export interface ExtendedUserProfile {
  id: string;

  email: string;

  name?: string;

  avatarUrl?: string;

  subscriptionTier: SubscriptionTier;

  subscriptionStatus?: UserSubscriptionStatus;

  tokenBalance?: number;

  monthlyTokenLimit?: number;

  tokensUsedThisMonth?: number;

  preferredModel?: string;

  preferredProvider?: string;

  theme?: 'light' | 'dark' | 'system';

  language?: string;

  createdAt: string;

  updatedAt?: string;

  metadata?: Record<string, unknown>;
}
