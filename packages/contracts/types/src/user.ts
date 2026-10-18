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
