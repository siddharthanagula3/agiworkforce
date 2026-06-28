/**
 * v1 Feature Flags — master switch for cloud-only features.
 *
 * AGI Mobile v1 ships Local plus Managed Cloud. Managed Cloud is PUBLIC ALPHA and
 * open by default (founder decision 2026-06-27/28): a signed-in user IS the gate —
 * no invite, no waitlist, no private beta. The server-side kill-switch
 * `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is the instant rollback if cloud must be
 * re-gated. Other cloud features below stay hidden at runtime until their own flag
 * flips — those flags are about feature readiness, not a cloud-access gate.
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
  /**
   * Compatibility flag: when true, cloud chat is always blocked regardless of
   * `cloudChat`. Stays false in public alpha — Managed Cloud is open by default
   * and gated only by the signed-in entitlement.
   *
   * HARD RULE: setting this to true while `cloudChat` is also true creates a
   * dual-flag deadlock — `isCloudChatEnabled()` (chatMessageStore) always
   * returns false, so Cloud mode is silently dead while the UI shows it
   * available. Do not set both flags to true simultaneously.
   *
   * 2026-06-14: set to false so `cloudChat: true` is the single governing flag.
   */
  v1LocalOnly: false,

  /** Projects tab — ships in v1 per FOUNDER DECISION 2026-05-18. */
  projects: true,

  /** Cloud chat / conversation sync through Clerk-authenticated Web/API.
   *  PUBLIC ALPHA (open by default): any signed-in user reaches Managed Cloud chat —
   *  no invite, no waitlist. The Clerk session token is bridged into the cloud stream
   *  path (services/authSession.ts → services/streaming.ts). The server enforces the
   *  free Hobby tier (3-prompt cap) for signed-in free users and honors the
   *  `AGI_MANAGED_COMPUTE_PRIVATE_BETA` kill-switch for incident rollback. */
  cloudChat: true,

  /** Billing / subscription / Stripe portal. */
  billing: false,

  /** Auth (login, OAuth, password reset). Signing in IS the Managed Cloud entitlement
   *  in public alpha — Mobile keeps a real auth gate (no demo bypass; user must sign in).
   *  2026-06-13: enabled — Clerk Expo native auth (AuthView) wired in app/_layout.tsx. */
  auth: true,

  /** Legacy direct-provider credential entry is not exposed on Mobile. */
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

  /** Server-OAuth connectors. Disabled until the connectors feature ships (not a
   *  cloud-access gate — signing in does not unlock connectors). */
  connectors: false,

  /** Web search via server-side API.
   *  2026-06-27: enabled — the chat-completions body now carries `web_search:true`
   *  (chatExecutionStore → streaming.ts) when the AddToChatSheet toggle is on; the
   *  server injects its built-in web_search tool and streams `x_search_results`,
   *  which the tool-call accumulator already renders. */
  webSearch: true,

  /** Computer use (cloud execution). */
  computerUse: false,

  /** Image generation via cloud API.
   *  2026-06-27: enabled — `/image` and the AddToChatSheet toggle call
   *  `POST /api/media/image/generate` (image/services/imagegen.ts). Pro+ gating is
   *  enforced server-side and surfaced via ApiPaywallError → PaywallBottomSheet. */
  imageGen: true,

  /** Cross-device sync of conversation threads. */
  crossDeviceSync: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;
