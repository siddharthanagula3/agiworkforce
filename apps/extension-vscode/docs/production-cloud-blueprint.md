The reads confirm the load-bearing facts: `streamChatCompletion` (api.ts) is the live path keyed off `getApiKey`/`SECRET_KEY='agiWorkforce.apiKey'`, `fetchTierInfo` hits the nonexistent `/api/auth/me` (the latent bug), `streamChatCompletionViaProvider` is the throwing stub, and package.json has the exact contributions to surgically edit (setApiKey line 102, clearApiKey 107, rewindLast 337, setAgentEffort 362, chatParticipants 412, apiEndpoint 644, useProviderStream 771, tier 808, engines line 12). The request body only forwards `thinking`, not `effort` — confirming the dead-wire. Everything checks out against the maps. Here is the blueprint.

---

# Production Blueprint — `apps/extension-vscode` → AGI Cloud-Only Client (VS Code + Cursor + Windsurf + Antigravity)

Status: decision-grade. Scope: turn the BYOK/pasted-key extension into a thin AGI managed-cloud client joined to the unified suite, shippable in milestones the (non-technical) founder can SEE fast. Light local footprint — no workspace-wide builds in any verification step.

---

## 1. Target architecture (one diagram-in-words)

```
  VS Code / Cursor / Windsurf / Antigravity
            │
   [agi-workforce.sidebar  ← THE ONLY chat surface that works in all 4 editors]
            │
   ┌────────┴─────────┐
   │  Account sign-in │  device-code flow (reuse CLI/desktop):
   │  (Clerk JWT)     │  POST /api/device/link → openExternal(verify_url)
   └────────┬─────────┘  → poll GET /api/device/poll → Clerk JWT in SecretStorage
            │              key 'agiWorkforce.accountToken'  (refresh = re-run flow on 401)
            │
   Authorization: Bearer <clerk-jwt>   X-Client: vscode-extension
            │
   ┌────────┴──────────────────────────────────────────────┐
   │  UNIFIED AGI CLOUD SUITE  (apps/web Next.js, Neon+Clerk) │
   │                                                          │
   │  CHAT (only inference + metering entry):                 │
   │    POST /api/llm/v1/chat/completions  (Bearer-only, SSE) │
   │      → CreditService reserve/deduct/refund (ONE ledger)  │
   │      → managed-compute gate (private-beta 403)           │
   │      → paywall 429 {kind:'paywall'}                       │
   │                                                          │
   │  READ-JOINS (all getClerkAuthUser, Bearer-reachable):    │
   │    GET /api/me           (tier, plan, credits)           │
   │    GET /api/usage  /usage/history                        │
   │    GET+POST /api/memory  /memory/search /memory/sync     │
   │    GET /api/projects  /projects/[id]/knowledge-files     │
   │    GET+PUT /api/settings/preferences  (ns 'vscode')      │
   │    GET /api/llm/v1/models  (catalog truth)               │
   └──────────────────────────────────────────────────────────┘
```

**REMOVED (BYOK surface):** manual key paste (`agi-workforce.setApiKey`/`clearApiKey`, SecretStorage `agiWorkforce.apiKey`), `agiWorkforce.apiEndpoint` override + legacy `/api/llm/v1` proxy assumptions baked as the only path, the multi-provider model picker (anthropic/openai/google/xai/deepseek/… + ollama/lmstudio), `agiWorkforce.useProviderStream` flag + `providerStreamProvider` enum + the throwing `streamChatCompletionViaProvider` stub, `'local'`/`'byok'` tier enum values + `tierResolver` `byok` default, `'ollama'` from the provider-stream union, and the hardcoded `account_auth_not_wired` waitlist stub copy.

**REUSED from web (exact, no new infra):**

- Chat + metering: `POST /api/llm/v1/chat/completions` (already the live target) — keep as the single inference path; it deducts/refunds via `CreditService` server-side keyed by Clerk `userId`, so VS Code lands in the SAME wallet as web/desktop/mobile with zero client-side metering.
- Auth: `apps/web/lib/api-auth.ts:getClerkAuthUser` (cookie OR `Authorization: Bearer <clerk-jwt>`).
- Token acquisition: `POST /api/device/link` → `GET /api/device/poll` (returns `access_token` = Clerk session JWT; `refresh_token` always null by design).
- Tier/usage read: `GET /api/me`, `GET /api/usage`, `GET /api/usage/history`.
- Catalog: `@agiworkforce/types` model-catalog + `GET /api/llm/v1/models` — filter to managed_cloud/`agi-cloud`. Never hardcode IDs.
- Gating: `apps/web/lib/managed-compute-gate.ts:buildManagedComputeGateResponse` (403 `managed_compute_private_beta`) + the 429 paywall payload the extension already parses.

**STAYS (do not touch):**

- `src/platform/surface.ts` trust-boundary assertion — vscode = `DeveloperSessionSurface`, NEVER syncs consumer chat. Managed-cloud here = account-authed compute, not chat sync. `assertSurfaceCanSyncChats('vscode')` THROWS by design.
- `ConversationStore` → `globalState`-only persistence; chat history stays local/dev-session scoped.
- `StreamCallbacks` shape + SSE frame parser + paywall handling in `api.ts` (change auth source + endpoint only).
- All provider-agnostic editor commands (explain/fix/refactor/generateTests/docs/codeReview, codeLens, hover, inline completions, diff accept/reject, checkpoints, context panel), `providerSwitchGuard` (simplified to managed-tier gating), the host allowlist (`validateEndpointUrl`), and global-config-only reads (VSCODE-01).

---

## 2. Cross-fork strategy

Verified constraint: Cursor, Windsurf, and Antigravity each replaced VS Code's native AI chat with their own panels. `vscode.chat.createChatParticipant` (the `@agi` participant) and `vscode.lm` (Copilot model API) **do not work** in any of the three forks — the participant never renders and `vscode.lm.selectChatModels()` returns nothing.

- **Webview-first is mandatory.** Core chat MUST run entirely through `agi-workforce.sidebar` (the extension's own webview) + the Bearer→`/api/llm/v1/chat/completions` transport. That surface is identical across VS Code, Cursor, Windsurf, and Antigravity. This is already the primary UI, so it's a defend-not-rebuild posture.
- **`@agi` participant + `vscode.lm` = VS-Code-only progressive enhancement.** Keep the `chatParticipants` contribution (package.json:412) and `onChatParticipant:agiworkforce.agi` activation (harmless no-op in forks). Guard every `vscode.lm`/`vscode.chat` call behind a runtime capability check (`typeof vscode.lm?.selectChatModels === 'function'` AND non-empty result); silently degrade to the AGI provider when absent. Re-point its "set API key" copy to "Sign in to AGI."
- **Real activation triggers** stay `onStartupFinished` + `onView:agi-workforce.sidebar` (package.json:44).
- **Fork detection at activation:** read `vscode.env.appName`/`appHost`/`uriScheme` so the extension labels the chat surface, skips dead `@agi` hints in forks, and (if ever doing UriHandler auth) builds `${vscode.env.uriScheme}://…` dynamically — never hardcode `vscode://`. The device-code flow chosen for auth needs NO UriHandler and NO custom scheme, sidestepping this entirely.
- **Open VSX publishing** (in addition to MS Marketplace) — all three forks install from Open VSX, not the MS Marketplace. One-time: `npx ovsx create-namespace agiworkforce -p $OVSX_PAT`; CI: `ovsx publish --no-dependencies -p $OVSX_PAT`. Ship an actual `LICENSE` file alongside `"license":"PROPRIETARY"` (ovsx CI mode won't prompt; it must find a license present).
- **Engine version:** keep `engines.vscode` as low as actually-used stable APIs allow (consider lowering from `^1.100.0` if nothing 1.100-specific is used — forks lag mainline). NEVER add `enabledApiProposals` (Insiders-only; absent in all stable forks).

---

## 3. Milestone-ordered build plan

Each milestone is independently shippable; ordered so the founder sees a working cloud chat after **M1**. Verification commands are light (single-file typecheck / esbuild / `ovsx package`) — no workspace builds.

### M1 — Account sign-in + cloud chat the founder can SEE (the hero milestone)

**Goal:** A signed-in user types in the AGI sidebar and gets a streamed managed-cloud reply, metered into the shared wallet. No key paste anywhere.

- **Files:** new `src/features/account-auth/deviceAuth.ts` (device-code flow); `src/utils/api.ts` (account-token accessors + repoint `streamChatCompletion` auth to the account token, delete the throwing stub); `src/core/commandSetup.ts` (`agi-workforce.signIn`/`signOut`, delete `setApiKey`/`clearApiKey`); `src/features/sidebar-webview/sidebarProvider.ts` + `ChatStateManager.ts` (first-run "Sign in to AGI" CTA); `package.json` (commands swap). Full map in §4.
- **Founder SEES:** Sideloaded `.vsix` in VS Code — clicks AGI icon → "Sign in to AGI" → browser approves → types "write a haiku" → tokens stream in live. Capture as screenshot + a short screen recording. Also installable in Cursor for the same demo (webview path is fork-identical).
- **Verify (light):** `pnpm --filter agi-workforce exec tsc --noEmit -p tsconfig.json` then `pnpm --filter agi-workforce exec esbuild src/extension.ts --bundle --platform=node --external:vscode --outfile=/tmp/agi-m1.js` (compiles the touched paths without packaging). Manual: install `.vsix`, sign in, send one message.

### M2 — Honest usage HUD (read the shared wallet)

**Goal:** Status bar shows "Signed in as <email>" + plan tier + credits remaining; fixes the latent `/api/auth/me` bug.

- **Files:** `src/utils/api.ts` (`fetchTierInfo` → `GET /api/me`, map `plan.tier` + `credits.*_cents`); `src/integrations/tierResolver.ts` (drop `local`/`byok`, source tier from `/me`); `src/data/usageMeter.ts` (render cents balance); optional `GET /api/usage` for the dedicated panel.
- **Founder SEES:** status bar reads real plan + credits instead of silently defaulting to "byok"; `showAccountUsage` panel shows real numbers.
- **Verify:** single-file typecheck of `api.ts`/`tierResolver.ts`; manual sign-in shows correct tier.

### M3 — Managed-cloud model picker (catalog-true, single group)

**Goal:** Replace the multi-provider BYOK picker with one "AGI Cloud" group (managed_cloud/`agi-cloud` + auto/balanced/economy/premium), read from catalog/`GET /api/llm/v1/models`.

- **Files:** `src/features/model-picker/modelConstants.ts` (filter `buildGroupedQuickPickItems`/`MODEL_PICKER_OPTIONS`); `src/core/commandSetup.ts` (`selectModel` rewrite); `package.json` (drop `local`/`byok` from `tier` enum line 808).
- **Founder SEES:** model picker is clean — one AGI Cloud section, no Ollama/LM Studio/per-vendor noise.
- **Verify:** single-file typecheck; open picker, confirm single group.

### M4 — Private-beta gate front door (replace the fake invite stub)

**Goal:** Unentitled accounts get the real managed-compute private-beta / waitlist response inline, not a fake "enter invite code" modal.

- **Files:** `src/lib/waitlistService.ts` (real account-gated join to `POST /api/waitlist/cloud-managed`, or route to the gate response); `src/features/cloud-bridge/InviteCodeModal.ts` (remove "BYOK/Groq/OpenRouter/DeepSeek" copy lines 202-205 → signed-in waitlist CTA or inline private-beta notice); add a 403 `managed_compute_private_beta` handler parallel to the existing 429 paywall handler.
- **Founder SEES:** honest "AGI Cloud is in private beta — join the waitlist" tied to the signed-in account, no misleading routing copy.
- **Verify:** single-file typecheck; trigger gate path, confirm honest copy.

### M5 — Dead-control cleanup (honest UI) + memory becomes load-bearing

**Goal:** Every visible control either works or is gone (see §5).

- **Files:** `src/features/chat-participant/chatParticipant.ts` + `src/features/sidebar-webview/ChatStateManager.ts` (wire effort + memory `loadFacts()` into system prompt/request, or hide effort; scope/hide non-`plan` agent modes); `src/data/contextBuilder.ts` (alt location for memory injection); `package.json` (rename `rewindLast` title → "Delete Last Turn"; update `setAgentEffort` desc).
- **Founder SEES:** effort badge actually changes responses; "Delete Last Turn" labeled honestly; memory facts influence replies.
- **Verify:** single-file typecheck; toggle effort and observe request body differs; memory fact echoed in a reply.

### M6 — Suite memory + settings sync (opt-in, boundary-safe) + project-knowledge read

**Goal:** Editor prefs + memory facts sync to the account (NOT chat). Project knowledge read for context injection.

- **Files:** new `src/cloud/suiteClient.ts` (typed Bearer wrappers for `/api/memory*`, `/api/projects*`, `/api/settings/preferences` ns `'vscode'`, reusing `httpsPost` + host allowlist + `@agiworkforce/types` contracts); `src/platform/config.ts` (suite base origin + signed-in flag); `src/platform/surface.ts` (comment only: managed-cloud = compute, not chat sync — defend the boundary).
- **Founder SEES:** memory set in the web app appears in VS Code chat; editor prefs persist across machines.
- **Verify:** single-file typecheck of `suiteClient.ts`; round-trip one memory fact via `/api/memory`.
- **Guardrail:** do NOT touch `/api/chat/conversations*` (cookie-only `requireCurrentUserId`, and `assertSurfaceCanSyncChats('vscode')` throws). Chat history stays `globalState`/dev-session local.

### M7 — Release: Open VSX + MS Marketplace + fork test matrix

**Goal:** Installable in-app in all 4 editors.

- **Files:** `LICENSE` (add file); CI release pipeline (add `ovsx create-namespace` once + `ovsx publish` step + `OVSX_PAT` secret alongside existing `vsce`); migration notice that cleans `SecretStorage 'agiWorkforce.apiKey'` on upgrade.
- **Founder SEES:** extension in Cursor/Windsurf/Antigravity in-app extension panels.
- **Verify:** `pnpm --filter agi-workforce exec ovsx package` succeeds locally; sideload-test sign-in + sidebar chat in VS Code + Cursor + one Codeium/Google fork.

---

## 4. M1 concrete file map

| File                                                                      | One-line change                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/extension-vscode/src/features/account-auth/deviceAuth.ts` **(new)** | Device-code flow: stable `device_id`+`device_fingerprint` (hash of `vscode.env.machineId` + per-install salt in `globalState`) → `POST {origin}/api/device/link` → `vscode.env.openExternal(verify_url)` → poll `POST /api/device/poll` (~3s, respect 15-min `expires_at`, treat 404=expired/410=update-required) until `approved` → return Clerk JWT. |
| `apps/extension-vscode/src/utils/api.ts`                                  | Add `getAccountToken`/`setAccountToken`/`clearAccountToken` on new SecretStorage key `'agiWorkforce.accountToken'`; switch `streamChatCompletion` to read that token (not `getApiKey`); DELETE the throwing `streamChatCompletionViaProvider` stub (766-782); keep `StreamCallbacks`+SSE+paywall; on 401 clear token + re-prompt sign-in.              |
| `apps/extension-vscode/src/core/commandSetup.ts`                          | DELETE `agi-workforce.setApiKey`/`clearApiKey` handlers (289-329); ADD `agi-workforce.signIn` (runs deviceAuth, progress notification with `link_code` + "Open in browser" button) and `agi-workforce.signOut` (`secrets.delete('agiWorkforce.accountToken')`).                                                                                        |
| `apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts`   | First-run state: when no account token, render "Sign in to AGI" CTA (command `agi-workforce.signIn`) instead of a key/empty prompt.                                                                                                                                                                                                                    |
| `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts`  | `_handleSendMessage` blocks send when no account token and surfaces the sign-in CTA; otherwise calls the account-token `streamChatCompletion`.                                                                                                                                                                                                         |
| `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`  | Replace all `command:agi-workforce.setApiKey` / "Set API Key" copy with `command:agi-workforce.signIn` / "Sign in to AGI"; re-point `streamVscodeLmFallback` "set key" copy to "sign in" (keep fallback fork-guarded).                                                                                                                                 |
| `apps/extension-vscode/package.json`                                      | `contributes.commands`: remove `setApiKey` (102-108) + `clearApiKey`; add `signIn`/`signOut`. Leave `chatParticipants` (412) and activation events intact. (apiEndpoint/useProviderStream/tier-enum cleanup deferred to M3/M4 to keep M1 tight.)                                                                                                       |

M1 deliberately does NOT change tier resolution or the picker — those are M2/M3 — so the founder sees a working signed-in cloud chat with the smallest possible diff.

---

## 5. Dead-control cleanup (cloud-only honest UI)

| Control                                                      | Today                                                                                                                                                                                | Decision                                                                                | How                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Reasoning effort** (`setAgentEffort`, webview `setEffort`) | Persists `agent.effort` + badge only; send path/`api.ts` never forward it (only `thinking` at api.ts:498). No-op on the wire.                                                        | **FIX** — make it load-bearing                                                          | Add `effort` to the request body in `ChatStateManager._handleSendMessage` + `chatParticipant` + `api.ts`. **Open question:** confirm `/api/llm/v1/chat/completions` honors an `effort`/`reasoning` field; if upstream strips it, **HIDE** the control instead of shipping a fake knob.                       |
| **Agent mode** (ask/auto/plan/bypass)                        | Only `plan` reaches the system prompt (chatParticipant:172-180); ask/auto/bypass do nothing in the sidebar path.                                                                     | **SCOPE** — keep only `plan` in the sidebar; scope auto/bypass to `AgentModePanel` only | In `ChatStateManager`/`chatParticipant`, gate the mode selector to modes that actually alter the request; remove ask/auto/bypass from the sidebar picker (or wire them — but cloud-only thin client doesn't auto-execute, so `plan` + default is the honest set). Preserve no-auto-execute audit invariants. |
| **Memory `loadFacts`**                                       | Read by memory tree + `agi-workforce.memory` but NEVER injected into any prompt — dead store.                                                                                        | **FIX** — inject into system prompt                                                     | M5: call `loadFacts()` in `contextBuilder`/`ChatStateManager` and prepend to `buildSystemPrompt`. Makes the suite memory join (M6) meaningful. If M5 slips, **HIDE** the memory UI rather than show a store that does nothing.                                                                               |
| **`rewindLast`**                                             | Title "Rewind Last" but only splices the last user+assistant pair from in-memory history; does NOT restore files/checkpoints (misleading vs `createCheckpoint`/`restoreCheckpoint`). | **RENAME**                                                                              | `package.json` title → "Delete Last Turn" (matches actual behavior). Real checkpoint restore already exists separately; don't conflate.                                                                                                                                                                      |
| **BYOK key paste / endpoint override**                       | `setApiKey`/`clearApiKey`/`apiEndpoint`/`useProviderStream`/`local`+`byok` tiers/`ollama` provider                                                                                   | **REMOVE**                                                                              | M1 (commands) + M3 (tier enum) + M4 (provider-stream flag). Migration: clean `SecretStorage 'agiWorkforce.apiKey'` on upgrade with a one-time notice.                                                                                                                                                        |

---

## 6. Risks & open questions (founder decisions / blockers)

1. **SUPERSEDED (2026-06-27 founder decision + 2026-07-15 gate fix): managed cloud is PUBLIC ALPHA, open by default.** `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is an incident kill-switch only (`0`/`false`/`off` re-gates; `=1` is a no-op — the gateway's old inverted `=1`-to-enable check was fixed 2026-07-15, see SVC-GATEWAY-MANAGED-GATE-INVERTED-01). Consequence for this blueprint: the env var provides NO pre-launch gating for VS Code cloud. If VS Code cloud needs its own launch gate, that is net-new work and a **founder decision** — entitlement/subscription checks (which remain active) are the only access control otherwise. Ledgering/abuse/fraud/refunds/retention/deletion must keep pace with public usage per CLAUDE.md but no longer gate access.
2. **Device-code flow depends on Clerk + Neon `device_authorization_codes`.** Confirm `/api/device/link` + `/api/device/poll` + `/verify` are deployed in prod (they are the desktop/CLI path). The poll route hard-rejects fingerprint-less requests (410) — always send `device_fingerprint`. Note: link/approve hardcode device labels for CLI/desktop; **add a `'vscode'` device type/label** or the approval screen mislabels the client. `refresh_token` is always null — on 401 re-run the flow, do NOT build a refresh endpoint.
3. **Effort/memory request-body shape** — must match what `/api/llm/v1/chat/completions` actually accepts. **Open question:** does the gateway honor an `effort`/`reasoning` field? If not, hide effort (§5) rather than ship a no-op.
4. **`vscode.lm` (Copilot) fallback** reintroduces a non-AGI provider in VS Code proper. **Founder decision:** does "cloud-only" permit the built-in LM fallback as a degraded path (re-pointed copy → "sign in"), or must it be removed? In all three forks it's already dead (no models), so it only matters in stock VS Code.
5. **Trust-boundary regression risk** — "Cloud sync" (M6) must be settings/memory/prefs ONLY. Syncing chat history trips `assertSurfaceCanSyncChats('vscode')` and violates the locked rule. `/api/chat/conversations*` is also cookie-only (`requireCurrentUserId`) so it's not Bearer-reachable anyway — keep chat in `globalState`.
6. **No developer-session HTTP API exists** in `apps/web/app/api` (no `/api/dev-sessions`). The `DeveloperSession`/`DeveloperSessionEvent` contracts exist in `@agiworkforce/types`, but persistence endpoints do not. **Blocker for any "VS Code chat history sync" promise** — VS Code chat stays local until/unless that surface is built. Do not promise it.
7. **CSRF on state-changing routes** — memory/projects/settings POST/PUT/DELETE call `requireCsrfToken` (and the llm gateway + `/api/usage/deduct` call it even on Bearer paths). **Verify** Bearer-token callers either bypass CSRF or can fetch a token (`GET /api/csrf`) before wiring M6 writes; reads (`/api/me`, `/api/usage`, GET memory/projects) are fine.
8. **Open VSX license gate in CI** — `"license":"PROPRIETARY"` satisfies the presence check, but ship a real `LICENSE` file (ovsx CI mode won't prompt). Run `npx ovsx package` locally before wiring CI; Open VSX also runs secret detection that can reject the bundle.
9. **Never hardcode model IDs** — the managed-cloud catalog filter must read provider metadata (`managed_cloud`/`agi-cloud`) from `models.json` / `GET /api/llm/v1/models`. `providerStreamClient.ts` is a documented mirror of `apps/web/lib/providerStreamClient.ts` — keep them in lockstep or streaming drifts silently.
10. **Breaking change for existing pasted-key users** — removing BYOK needs the M7 migration notice + clean `SecretStorage 'agiWorkforce.apiKey'` delete on upgrade.

Key source paths referenced: `apps/extension-vscode/src/utils/api.ts` (live chat path + throwing stub + `/api/auth/me` bug), `apps/extension-vscode/src/core/commandSetup.ts` (commands), `apps/extension-vscode/package.json` (contributions: setApiKey 102, clearApiKey 107, rewindLast 337, setAgentEffort 362, chatParticipants 412, apiEndpoint 644, useProviderStream 771, tier 808, engines 12), `apps/extension-vscode/src/platform/surface.ts` (trust boundary), `apps/web/app/api/device/{link,poll,approve}/route.ts` + `apps/web/app/verify/verify-client.tsx` (auth), `apps/web/lib/api-auth.ts` (Bearer contract), `apps/web/app/api/llm/v1/chat/completions/route.ts` + `apps/web/lib/services/credit-service.ts` (single ledger), `apps/web/lib/managed-compute-gate.ts` (private-beta gate), `apps/web/app/api/me/route.ts` + `apps/web/app/api/usage/route.ts` (tier/usage read).
