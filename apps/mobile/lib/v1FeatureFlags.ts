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
  /**
   * Compatibility flag: when true, cloud chat is always blocked regardless of
   * `cloudChat`. Set to false once AGI Cloud invite flow is fully active.
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
   *  2026-06-13: enabled — Clerk session token now bridged into the cloud stream
   *  path (services/authSession.ts → services/streaming.ts). Server enforces the
   *  free Hobby tier (3-prompt cap) for signed-in free users. */
  cloudChat: true,

  /** Billing / subscription / Stripe portal. */
  billing: false,

  /** Auth (login, OAuth, password reset). Cloud account flows open through invite access.
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

  /** Server-OAuth connectors. Disabled until AGI Cloud invite access enables them. */
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
