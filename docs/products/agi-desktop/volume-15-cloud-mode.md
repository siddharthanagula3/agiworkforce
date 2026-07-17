# AGI Desktop — Volume 15 — Cloud Mode

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and `apps/desktop/AGENTS.md`. Real repo paths are cited inline per section and consolidated in the Repository map below.

## Overview & stance

AGI Desktop is the only full-trust surface: Local, BYOK, and Managed Cloud, each selectable with a correct, visible label. This volume covers **Managed Cloud** — a distinct trust boundary never silently fed Local or BYOK chats, files, or sessions. Cloud Mode on Desktop deliberately **mirrors AGI Web** (same "one logical cloud" backend) and adds desktop-native capabilities (native host, OS keychain, remote-control window). Because Desktop is the local-private compute host, Cloud egress funnels through one chokepoint (`egressGuard.ts`) and Cloud persistence has no Rust path — it reaches the shared Neon-backed web APIs on the absolute cloud origin only. Today the seam is **built and unit-tested but user-unreachable**: `appModeStore` refuses Cloud mode on the desktop runtime under the PA-3 gate, so `selectPrivacyMode` can never return `'managed'` on a signed build until DCL-4 flips it (`apps/desktop/src/lib/cloudChatPersistence.ts`). Most of this volume is therefore 🟡 (built, gated) or 🔭 (planned), not shipped.

## Cloud Authentication

Cloud requires a real Clerk account session — no demo bypass. The desktop cloud session token is read from the canonical auth store and attached as the `Authorization` header (`apps/desktop/src/services/cloudAccountAuth.ts`, `getDesktopCloudAuthToken` in `cloudChatPersistence.ts`). Rust account/auth calls are SSRF-allowlisted to `*.agiworkforce.com` in `src-tauri/src/sys/account/mod.rs`. Auth infra is ✅ Built; end-to-end Cloud sign-in → chat is 🟡 (blocked by the PA-3 mode gate until DCL-4).

## Cloud Conversations

Cloud conversations use the shared `@agiworkforce/unified-chat` persistence client against `/api/chat/conversations*` on the absolute cloud origin (`WEB_APP_URL`), routed through `guardedFetch`. Local and BYOK cannot instantiate the client — `getDesktopCloudChatPersistenceClient()` throws unless `privacyMode === 'managed'`, and the egress guard is the backstop (`apps/desktop/src/lib/cloudChatPersistence.ts`). 🟡 Built + unit-tested; unreachable through the UI until the PA-3 gate is lifted.

## Cloud Projects

Cloud Projects are a Managed-Cloud entity synced by `apps/web/app/api/projects/sync/route.ts` (✅ web endpoint). The desktop Projects surface (`apps/desktop/src/features/v3/AgiWorkProjects.tsx`) renders project-scoped chats via `DesktopShellV3`. Desktop participation in cloud project sync (cursor pull/push against the projects endpoint) is 🔭 Planned; only the web endpoint exists today.

## Cloud Memory

Cloud Memory syncs through `apps/web/app/api/memory/sync/route.ts` (✅ web endpoint). Desktop exposes a Memory settings section (`apps/desktop/src/features/settings/tabs/Memory.tsx`, 🟡 stub). Desktop reading/writing managed-cloud memory rows across devices is 🔭 Planned and must be Managed-Cloud only — Local/BYOK memory never leaves the device.

## Cloud Settings

Desktop settings today expose General, Account, Appearance, Privacy, Models & Keys, Agents, Skills, Connectors, Plugins, Memory, Notifications, Voice, plus Billing, Usage, Capabilities, Developer, Extensions, AGI Code, and AGI in Chrome tabs (`apps/desktop/src/features/settings/tabs/*`). These must converge to the locked Settings IA (🟡). **Settings sync is allowlist-gated and lands last** — no setting syncs to cloud until it is on the explicit allowlist (🔭 Planned).

## Cloud Subscription

Plan/entitlement state (tier, feature flags, subscription) is modeled in `apps/desktop/src/lib/cloudAccountTypes.ts` and gated by `apps/desktop/src/utils/subscriptionGate.ts`. The canon ladder is **Free $0 / Basic $8 (₹399) / Pro $20 / Max $100 and $200 / Enterprise (custom)**; Local and BYOK are free access modes, not plans. 🟡 gap: `subscriptionGate.ts` still references removed identifiers (`pro_plus`, "Hobby") and must be reconciled to the canon tiers. Entitlements are verified against the account/server, never asserted client-side.

## Cloud Synchronization — Neon delta-sync

The sync contract is Phase-0 delta sync on Neon Postgres: `GET /api/chat/sync?since=<server_version cursor>` returns conversations/messages/artifacts with `server_version` greater than the cursor (including tombstones) plus the next cursor; `POST` does idempotent UPSERT by id, with `user_id` set server-side from the verified session and RLS `WITH CHECK` as the backstop (`apps/web/app/api/chat/sync/route.ts`). Conversation/artifact metadata is last-writer-wins; messages are append-only (only a `deleted_at` tombstone mutates one). ✅ Built on web. The Rust device-sync client (`src-tauri/src/integrations/sync`) is declared but never instantiated or exposed via a Tauri command (🟡 dormant); if wired, it must gate on `privacyMode === 'managed'` like `egressGuard`.

## Cross-device Synchronization

Delta-sync spans **Web ↔ Mobile ↔ Desktop for Managed-Cloud chats only**. Local and BYOK rows have no `cloud_id` and are never pushed or pulled (enforced client-side per the matrix; `apps/web/app/api/chat/sync/route.ts` trust-boundary note). Desktop as a sync participant is 🔭 Planned (blocked by the same Cloud-mode gate). CLI, VS Code, and Chrome stay workspace/task-scoped and never auto-sync into app chat.

## Conversation History

Desktop defaults to **local** history and must not silently sync local chats to cloud: `ChatPreferences.chatStorageMode` defaults to `"local"`, `send_message.rs` derives `cloud_sync_enabled = chat_storage_mode == "cloud"`, and `settings_load_from_disk` coerces stale `"cloud"` back to `"local"`. The "Sync chat history to cloud" toggle is **removed** from the Privacy tab per the locked decision (`apps/desktop/AGENTS.md`). Cloud history read/list uses `CloudConversation`/`CloudMessage` in `apps/desktop/src/api/cloudApi.ts`. 🟡 Built with the sync toggle intentionally absent until entitlement ungating.

## Shared Backend Services

Cloud Mode reuses the AGI Web backend: **Clerk** (auth), **Neon Postgres** with RLS (`getUserScopedDb`), and **Stripe** (billing). Desktop talks to it via `@agiworkforce/unified-chat` and the API gateway (`API_BASE_URL` / `WEB_APP_URL` in `apps/desktop/src/api/config.ts`). Egress is confined to `OUR_CLOUD_HOSTS` — `agiworkforce.com`, `vercel.app`, `neon.tech`, `clerk.com`, `clerk.accounts.dev` — in `egressGuard.ts`; BYOK provider hosts are deliberately absent so client-direct BYOK streaming is never blocked. ✅ Built (infra). Model IDs come only from `packages/contracts/types/src/models.json`.

## Usage Tracking

Cloud usage (period, counts) is modeled by `CloudUsage` in `apps/desktop/src/api/cloudApi.ts` and surfaced in the Usage settings tab (`apps/desktop/src/features/settings/tabs/Usage/`); liveness is `apps/desktop/src/services/heartbeat.ts`. 🟡 Built (client display; server metering is the source of truth). **No credit top-ups** — usage is metered, never bought back.

## Billing

Billing renders through the lazily loaded `BillingSettings` (`apps/desktop/src/features/settings/tabs/Billing/index.tsx`), backed by Stripe; checkout is server-driven. 🟡 gap: `packages/contracts/types/src/billing-catalog.ts` still encodes older tiers (a `team` plan and no `basic`) and must be reconciled to the canon ladder (separate tracked task). Present tiers exactly as: Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise — never "Plus", `pro_plus`, "Hobby", or a consumer "Team".

## Desktop Enhancements

Beyond mirroring Web, Cloud Mode gains desktop-native capabilities. Desktop is the native host: a `127.0.0.1` WebSocket/IPC server for Chrome + VS Code (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`; port-8787 bridge, bridge tokens, IP lockout) and the Chrome native-messaging host `com.agiworkforce.browser`. Provider keys never land in cloud rows; the shipped vault is machine-derived AES-256-GCM (`machine_key.rs`), with OS keychains (macOS Keychain / Windows Credential Manager / Linux Secret Service) as the 🟡 reconciliation target (Volumes 16/19). The **Remote Control window** (phone/web steering a locally running session — QR + HMAC, outbound-only, approval-gated) is **not** a fourth trust mode; the Desktop↔Mobile companion is 🟡 (panel not mounted). Cloud-run sessions are a separate Managed-Cloud path (🔭).

## Repository map

- `apps/desktop/src/lib/{cloudChatPersistence,egressGuard}.ts` — persistence seam (🟡) + egress chokepoint (✅).
- `apps/desktop/src/{services/cloudAccountAuth.ts,api/cloudApi.ts,api/config.ts,stores/appModeStore.ts}` — auth, cloud HTTP client, origins, trust-mode gate.
- `apps/desktop/src/features/settings/tabs/{Billing,Usage,Memory,Privacy,Account}` — cloud settings surfaces.
- `apps/desktop/src/{utils/subscriptionGate.ts,lib/cloudAccountTypes.ts}` — entitlements.
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — Neon delta-sync endpoints.
- `apps/desktop/src-tauri/src/integrations/{realtime,sync,native_messaging}` — native host + dormant sync.
- `packages/contracts/types/src/{billing-catalog.ts,models.json}` — tiers (reconcile) + model SSOT.

## Competitor notes

Claude, ChatGPT, and Codex treat their desktop clients as thin cloud front-ends: the account is the cloud, history lives server-side by default, one provider. AGI diverges: Desktop is **local-first**, Cloud is an explicit opt-in trust boundary, and the same client runs Local, BYOK (multi-provider, no markup), or Managed Cloud with a visible label. Remote Control mirrors Claude Code Remote Control and Codex remote connections ("nothing moves to the cloud") — compute stays on the host. Cloud Mode reuses the Web backend for parity but never becomes the default store.

## Acceptance / Definition of Done

Cloud Mode is production-ready when Cloud is user-reachable on a signed build (DCL-4), delta-sync round-trips Web↔Desktop with correct cursors/tombstones, entitlements reconcile to the canon ladder, and no Local/BYOK data ever crosses the boundary.

- [ ] Build: `pnpm --filter @agiworkforce/desktop typecheck` + `test`; `cargo check -p agiworkforce-desktop` green.
- [ ] Trust: `selectPrivacyMode` gates all cloud persistence; egress guard blocks `OUR_CLOUD_HOSTS` in Local/BYOK; Local/BYOK rows have no `cloud_id`.
- [ ] Security: cloud session token from Clerk store only; `user_id` set server-side; RLS `WITH CHECK` enforced; keys stay in OS keychain.

## Anti-patterns

- Routing Local or BYOK chats/files through the cloud persistence client or `guardedFetch` allowlist.
- Adding a Rust path for cloud chat persistence (cloud goes through the web API boundary only).
- Re-adding the Privacy "Sync chat history to cloud" toggle before entitlement ungating.
- Hardcoding model IDs instead of reading `packages/contracts/types/src/models.json`.
- Showing "Plus", `pro_plus`, "Hobby", top-ups, or a consumer "Team" tier; inventing Pro/Max INR prices.
- Referencing Supabase, or renaming `proxy.ts` back to `middleware.ts`.
- Claiming Cloud Mode is shipped while the PA-3 gate holds — it is 🟡 until DCL-4.
