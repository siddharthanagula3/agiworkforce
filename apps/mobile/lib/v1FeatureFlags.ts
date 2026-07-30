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
 * Readiness flags are release gates, not promises that a retired or unshipped
 * surface can be restored by changing a boolean. A feature must still have a
 * verified route, backend contract, and end-to-end test before it is enabled.
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
   *  unpublished, dynamic internal usage ceiling for signed-in free users and
   *  honors the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` kill-switch for incident rollback. */
  cloudChat: true,

  /**
   * Billing / subscription MANAGEMENT — specifically the "Manage billing"
   * Stripe Customer Portal link (fetchPortalSessionUrl -> openExternalUrl).
   * Stays false on mobile: opening an external checkout/management link for
   * a subscription from inside the app risks Apple Guideline 3.1.1, and
   * `FEATURES.iap` (the native alternative) isn't live yet either. Does NOT
   * gate read-only usage display — see `usageDashboard` below.
   */
  billing: false,

  /**
   * Read-only usage/credit display (GET /api/usage — real data, not a stub;
   * verified 2026-07-05). Deliberately split from `billing`: this only reads
   * a balance, it never opens an external checkout/management surface, so it
   * carries none of `billing`'s App Store Guideline 3.1.1 risk.
   */
  usageDashboard: true,

  /**
   * Native in-app purchase (StoreKit 2 / Play Billing) for subscription
   * upgrades. Stays FALSE: every SKU in `iapProducts.ts` is a PLACEHOLDER — the
   * products do not yet exist in App Store Connect or Google Play Console
   * (creating them needs the founder's store-console access). Activating IAP
   * against placeholder SKUs would present fake/broken purchase availability
   * (fetchProducts returns nothing; a purchase attempt fails), which violates
   * capability honesty. The server path is ready — POST /api/mobile/iap/verify
   * reconciles into the same `subscriptions` table Stripe uses and the client
   * (useIapPurchaseFlow.ts) verifies before finalizing — but do not flip this to
   * true until the real self-serve products (basic, pro, max, max_15x; NOT the
   * sales-assisted Team tier) are created and verified against a live console.
   */
  iap: false,

  /** Auth (login, OAuth, password reset). Signing in IS the Managed Cloud entitlement
   *  in public alpha — Mobile keeps a real auth gate (no demo bypass; user must sign in).
   *  2026-06-13: enabled — Clerk Expo native auth (AuthView) wired in app/_layout.tsx. */
  auth: true,

  /** Legacy direct-provider credential entry is not exposed on Mobile. */
  byokKeys: false,

  /** Durable Managed Cloud task list backed by the tenant-owned run journal. */
  cloudTasks: true,

  /** Legacy Desktop-companion agent monitor and control screens. */
  agents: false,

  /**
   * Legacy Desktop Dispatch / WebRTC companion kill switch. Mobile no longer
   * exposes Dispatch UI or sends Dispatch tasks; keep this false while the
   * separately gated companion transport remains in the tree.
   */
  dispatch: false,

  /** Cloud scheduled task execution. The shared API contract, idempotent run
   *  endpoint, recurrence editor, run history, and notification deep links are
   *  wired end to end. The UI remains visible only while AGI Cloud is active. */
  schedules: true,

  /** Desktop companion pairing + QR code flow. */
  companion: false,

  /** Connectors directory. The server returns both connected rows and the
   *  deployment's live `available` ids. Mobile offers Connect only for that
   *  server-advertised set, opens the configured GitHub App install flow for
   *  GitHub, and supports encrypted custom remote-MCP connectors. Catalog
   *  entries without a real backend stay visibly unavailable. */
  connectors: true,

  /**
   * Read-only Managed Cloud Skills catalog.
   *
   * The authenticated `/api/skills` contract returns metadata for the Skills
   * installed on the deployment. Mobile can browse and search that real
   * catalog, but it does not pretend to install or mutate host filesystem
   * Skills. The route remains Cloud-mode and Clerk-sign-in gated.
   */
  skills: true,

  /** Web search via server-side API.
   *  Enabled by default for eligible Cloud turns; it is not a redundant composer
   *  menu option. The server capability handshake and selected model still fail
   *  closed when search is unavailable. Search results stream into the existing
   *  tool-call timeline. */
  webSearch: true,

  /** Deep Research (multi-turn plan → search → cited synthesis) via the
   *  AddToChatSheet "Deep research" toggle. 2026-07-19: enabled — the
   *  chat-completions body carries `research: true` (chatExecutionStore →
   *  streaming.ts) when the toggle is on; the server runs its research loop
   *  (route.ts) and streams citations/agent activity the inline renderer already
   *  handles. Per-send it is additionally gated on the selected model's
   *  `research` + `search` capabilities and the server-granted Max/Enterprise
   *  entitlement, so this flag alone never makes the toggle appear for an
   *  unsupported model or account. */
  research: true,

  /** Computer use (cloud execution). */
  computerUse: false,

  /** Image generation via cloud API.
   *  2026-06-27: enabled — `/image` and the AddToChatSheet toggle call
   *  `POST /api/media/image/generate` (image/services/imagegen.ts). Pro+ gating is
   *  enforced server-side and surfaced via ApiPaywallError → PaywallBottomSheet. */
  imageGen: true,

  /** Cross-device sync of conversation threads. */
  crossDeviceSync: false,

  /** Server-side code execution (E2B sandbox) via the AddToChatSheet "Run code"
   *  toggle. 2026-07-11: enabled — the chat-completions body carries
   *  `code_execution: true` (chatExecutionStore → streaming.ts) when the toggle
   *  is on; actual availability is still gated per-send on the selected model's
   *  `codeExecution` capability and the deployment's `/api/me` feature_flags
   *  (see useTierStore.codeExecutionAvailable), so this flag alone never makes
   *  the toggle appear for an unsupported model/deployment. */
  codeExecution: true,
} as const;

export type FeatureKey = keyof typeof FEATURES;
