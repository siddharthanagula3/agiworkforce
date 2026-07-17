# AGI Chrome Extension — Volume 16 — Settings

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/extension/AGENTS.md`; plus the real surface code cited per section (`manifest.json`, `src/options.ts`, `src/tokens.ts`, `packages/ui/design-tokens/src/index.ts`, `src/features/background/conversation-history.ts`, `src/background/memory-bridge.ts`, `src/pairing.ts`, `src/background/policy.ts`, `src/features/native-bridge/`, `native-host/`).

## Overview & stance

Settings for the AGI Browser Companion are deliberately thin. The extension is a permission-gated browser agent, not a standalone assistant: it holds **no provider keys**, runs **no inference**, and streams chat only through the cloud gateway (`apps/extension/src/features/computer-use/cloudAgentClient.ts`, `apps/extension/src/providerStreamClient.ts` — EGRESS rule: no provider host is ever contacted from the extension). So Settings owns **capability gates and device-scoped preferences**, not a consumer settings ladder. The two first-class controls per the README Demo Boundary are the **site allowlist** and the **desktop pairing state**; everything else (appearance, notifications, autofill profile) is secondary.

Trust modes shape this surface by exclusion. Chrome is task/workspace-scoped: it never exposes BYOK (Desktop/CLI/VS Code only), never syncs conversation or memory data to Neon, and never offers in-extension billing. All persistence is `chrome.storage.local`/`session` and device-scoped. Managed-Cloud entitlements are verified server-side and surfaced only via server `429 {kind:'paywall', requiredTier}` responses — Settings does not render a checkout. The live settings surfaces are the options page (`apps/extension/src/options.ts`) and the side panel (`apps/extension/src/side_panel.ts`).

## General

The options page renders sections for Permissions, Account, Autofill Profile, Computer-Use cloud auth, and Keyboard Shortcuts, with a version footer. ✅ Built (`apps/extension/src/options.ts`). Account exposes a single **Log out** action that clears the account/session keys (`agi_user_id`, `agi_user_tier`, `agi_session`, stored account key) from `chrome.storage.local` — device-local, no server call. ✅ Built. Keyboard shortcuts (`Cmd/Ctrl+Shift+A` open panel, `Cmd/Ctrl+Shift+C` capture) are manifest-declared and listed read-only. ✅ Built (`apps/extension/manifest.json` `commands`).

## Appearance

Appearance is driven by shared design tokens (`apps/extension/src/tokens.ts` → `@agiworkforce/design-tokens` `agiExtensionCssVars`). Both the options page and side panel currently inject the token CSS with a hardcoded `'dark'` mode. 🟡 Partial — light token maps exist (`packages/ui/design-tokens/src/index.ts` exports dark + light `--agi-ext-*` vars) but no in-UI appearance switcher is wired; the gap is the toggle, not the tokens.

## Theme

Requirement: a Theme control offering System / Light / Dark, persisted to a device-scoped key (e.g. `agi_theme`) and applied by re-invoking `getExtensionTokensCss(mode)` across options, side panel, and in-page panel; System follows `prefers-color-scheme`. 🔭 Planned — the token function already accepts `'dark' | 'light'` (`apps/extension/src/tokens.ts`), so this is a UI + persistence add. No `agi_theme` key or media-query listener exists today.

## Accent Color

Requirement: let the user pick an accent applied via the `--agi-ext-accent` custom property (already consumed across the options CSS). 🔭 Planned — the accent token is defined in `packages/ui/design-tokens/src/index.ts` (`--agi-ext-accent` from `agiPalette.{dark,light}.accent.primary`) and used in `apps/extension/src/options.ts`, but there is no picker; the accent is fixed by the token set. Any picker must write a device-scoped override only, never a synced preference.

## Language

Requirement: a language selector for extension UI strings, externalized to a message catalog (Chrome `_locales` / i18n). 🔭 Planned — no `_locales` directory, `chrome.i18n` usage, or language setting exists; UI copy is inline English in `apps/extension/src/options.ts` and `src/side_panel.ts`. Language must stay device-scoped (never part of allowlist-gated Settings sync, out of Chrome scope).

## Notifications

A **Task notifications** toggle controls whether a Chrome notification fires when a scheduled browser task runs; it persists to `agi_task_notifications` (default on) in `chrome.storage.local`. ✅ Built (`apps/extension/src/options.ts`; `notifications` permission in `apps/extension/manifest.json`). Requirement additions (🔭 Planned): per-category toggles (approval requests vs. task completion vs. high-risk-site interventions) and an OS-permission status readout so a denied Chrome notification permission is visible in-UI.

## Privacy

Conversation history is `chrome.storage.local` only, capped at **100 conversations** with a **30-day TTL** and prune-on-write. ✅ Built (`apps/extension/src/features/background/conversation-history.ts` — `MAX_CONVERSATIONS = 100`, `TTL_MS = 30 days`, `pruneExpired`). Device memory (`agi_memories`) is capped at **200 items**, device-scoped, and **never synced**. ✅ Built (`apps/extension/src/background/memory-bridge.ts`). Per canon there is **no memory-management settings section** here, because nothing syncs. Requirement (🔭 Planned): explicit "Clear history" and "Clear device memory" buttons plus a data-inventory readout; today `deleteConversation` exists at the API level but is not surfaced as a Settings control.

## Security

Security controls are structural rather than user-tuned. The pairing token is validated against a strict shape (`^[A-Za-z0-9_-]{32,128}$`; fingerprint `{4,32}`), rejected otherwise. ✅ Built (`apps/extension/src/pairing.ts`, audit H-07). Message routing is gated by sender class (`allowlisted-tab` / `extension-page-only`) so an allowlisted page cannot reach the cloud gateway. ✅ Built (`apps/extension/src/background/policy.ts`). CSP restricts `connect-src` to localhost and `*.agiworkforce.com`. ✅ Built (`apps/extension/manifest.json`). A dev/demo Clerk JWT bearer for computer-use cloud auth is stored device-locally and cleared on uninstall. 🟡 Partial (`apps/extension/src/options.ts` `DEV_BEARER_KEY`) — labeled dev path, not the production auth flow. Requirement (🔭 Planned): a Security panel summarizing pairing status, CSP posture, and prompt-injection defense (page content is data, never instructions).

## Site Allowlist — approved sites

The allowlist is a first-class control. The options page shows the current tab's origin with Add/Remove, lists all approved origins with per-row removal, and persists to `agi_site_allowlist` in `chrome.storage.local`. ✅ Built (`apps/extension/src/options.ts`). Enforcement: only content scripts on an allowlisted origin get `allowlisted-tab` sender class and may run DOM automation. ✅ Built (`apps/extension/src/background/policy.ts`). Requirement (🔭 Planned): per-site scoping of allowed actions (read-only vs. click/type/submit) and inline high-risk-site badges.

## Browser Permissions

Permissions are manifest-declared (`activeTab`, `tabs`, `storage`, `nativeMessaging`, `alarms`, `contextMenus`, `sidePanel`, `scripting`, `cookies`, `notifications`, `tabGroups`, `debugger`), with host permissions limited to localhost and `agiworkforce.com`. ✅ Built (`apps/extension/manifest.json`). The only user-facing permission surfaces today are the notifications toggle and the site allowlist. 🟡 Partial — no runtime `chrome.permissions` (optional grant/revoke) UI; broad host access and `debugger`/CDP power are static. Requirement (🔭 Planned): a readout of each granted capability with a plain-language purpose and a revoke path where Chrome allows it.

## Connected Services — desktop pairing state

Desktop pairing is the second first-class control. The pairing state machine (`idle | requesting | paired | error`, with a short fingerprint) restores from `chrome.storage.session` (`agi_bridge_token`, `agi_pairing_fingerprint`). ✅ Built (`apps/extension/src/pairing.ts`). Transport is the native-messaging host `com.agiworkforce.browser` plus the localhost `8787` HTTP/WS bridge with an `X-Bridge-Token` header; bridge URL and allowed hosts are policy-pinned. ✅ Built (`apps/extension/native-host/`, `apps/extension/src/features/native-bridge/index.ts`, `apps/extension/src/background/policy.ts` `ALLOWED_BRIDGE_HOSTS` / `DEFAULT_AGI_BRIDGE_URL`). Requirement: Settings must show connection status, the fingerprint, and an unpair action that clears the session token. 🔭 Planned — pairing state is popup-consumable, but the options page has no connected-services panel yet.

## Repository map

- `apps/extension/src/options.ts`, `src/side_panel.ts`, `src/inPagePanel/` — settings UI (options page + panels).
- `apps/extension/src/tokens.ts`, `packages/ui/design-tokens/src/index.ts` — appearance/theme/accent tokens.
- `apps/extension/src/features/background/conversation-history.ts`, `src/background/memory-bridge.ts` — device-scoped privacy stores.
- `apps/extension/src/pairing.ts`, `src/features/native-bridge/`, `native-host/` — connected-services / desktop pairing.
- `apps/extension/src/background/policy.ts`, `manifest.json` — permission + allowlist enforcement, CSP.

## Competitor notes

Claude for Chrome and ChatGPT/Codex browser modes bundle account, model, and appearance settings into a cloud-backed profile that syncs with the parent app. AGI diverges deliberately: Chrome Settings are **device-scoped and unsynced** (no conversation/memory sync, no Projects, no in-extension billing), per-surface trust is enforced (no BYOK here), and capability gates (site allowlist, desktop pairing, approvals) sit above cosmetics. Model-by-plan gating mirrors Claude-in-Chrome but is enforced server-side; the extension holds no keys and runs no inference. Local-first and least-privilege by construction, not a mirror of a cloud profile.

## Acceptance / Definition of Done

Production-ready when every setting persists to the correct device-scoped store, the allowlist and pairing panels both enforce their gates, and no setting leaks across a trust boundary or syncs to Neon.

- [ ] Build: options page + side panel render all sections; theme/accent/language controls, when added, re-apply tokens live and persist to device-scoped keys.
- [ ] Trust: no setting triggers Neon sync; log out and unpair clear their keys; no BYOK or provider-key field is ever shown; entitlements read only from server responses.
- [ ] Security: pairing token/fingerprint validated (`apps/extension/src/pairing.ts`); allowlist enforced via `policy.ts` sender class; CSP `connect-src` unchanged; dev bearer path clearly labeled and cleared on uninstall.

## Anti-patterns

- Adding conversation sync, global memory sync, Projects, image generation, or in-extension checkout to Settings (removed scope).
- Any provider-key field, BYOK toggle, or direct provider host in `connect-src` — the extension holds no keys and contacts no provider host.
- Syncing appearance/theme/accent/language to Neon; all preferences stay device-scoped (Settings sync is allowlist-gated and out of Chrome scope).
- Hardcoding model IDs (source only from `packages/contracts/types/src/models.json`), INR prices, routes, or env var names.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups; use Free / Basic $8 (₹399) / Pro $20 / Max $100 & $200 / Enterprise. Referencing Supabase, or renaming `proxy.ts` to `middleware.ts`.
- Weakening the allowlist or pairing-token validation, or bypassing the `allowlisted-tab` sender gate.
