/**
 * v1 Feature Flags — master switch for cloud-only features.
 *
 * AGI Mobile v1 ships Local plus Cloud Managed invite/waitlist. Cloud features
 * are preserved in the codebase but hidden at runtime via this module until the
 * invite path is explicitly enabled.
 *
 * Usage pattern:
 *   import { FEATURES } from '@/lib/v1FeatureFlags';
 *
 *   // In a screen component:
 *   if (!FEATURES.cloudChat) return null;
 *
 *   // In a service function:
 *   if (!FEATURES.billing) throw new Error('[v1] billing is not available in v1');
 *
 *   // In a store action:
 *   if (!FEATURES.dispatch) return;
 *
 * To enable a feature for v1.1: flip its flag to `true` here. No other code
 * changes required — all guards are derived from this single source of truth.
 */
export const FEATURES = {
  /** Master switch — true = v1 local-only mode is active. */
  v1LocalOnly: true,

  /** Projects tab — ships in v1 per FOUNDER DECISION 2026-05-18. */
  projects: true,

  /** Cloud chat / conversation sync through Clerk-authenticated Web/API. */
  cloudChat: false,

  /** Billing / subscription / Stripe portal. */
  billing: false,

  /** Auth (login, OAuth, password reset). No auth in v1 — local only. */
  auth: false,

  /** Mobile has no BYOK surface in v1. Desktop/CLI own BYOK. */
  byokKeys: false,

  /** Cloud agent orchestration (Agents screen, agent stores). */
  agents: false,

  /** Desktop Dispatch / WebRTC companion channel. */
  dispatch: false,

  /** Scheduled task execution. */
  schedules: false,

  /** Desktop companion pairing + QR code flow. */
  companion: false,

  /** External messaging integrations (WhatsApp, Telegram, Slack). */
  messaging: false,

  /** Server-OAuth connectors (cloud-only OAuth flows). */
  connectorsCloudOnly: false,

  /** Web search via server-side API. */
  webSearch: false,

  /** Computer use (cloud execution). */
  computerUse: false,

  /** Image generation via cloud API. */
  imageGen: false,

  /** Cross-device sync of conversation threads. */
  crossDeviceSync: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;
