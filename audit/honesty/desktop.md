# Desktop Audit — Evidence-Backed Report (`apps/desktop`)

Status: COMPLETE. Plan mode — **no application code changed**; this report is the deliverable. Per your
instruction, connections are proven end-to-end before any change is proposed.

## Context

Evidence-backed audit of `apps/desktop` (+ shared packages) separating **real, backend-connected** features
from **hallucinations, AI slop, duplicate UI/stores, dead buttons, mock screens, and orphaned/misplaced code** —
with keep / hide / merge / delete + break-risk for each. Cloud is waitlist/private-beta: overpromising cloud UI
is reported/gated/hidden; **cloud backend is never deleted.** The `code-structure` skill is applied in §7.

## Method & provenance

1. Canon read: `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/desktop/AGENTS.md`.
2. Structure: **~80 feature dirs, ~60 zustand stores**; Rust in `src-tauri/src`.
3. **Pass 1 — mapping:** 3 Explore agents.
4. **Pass 2 — adversarial verification** (Workflow `wwr7dti7u`, 29 agents): 22 default-to-refute skeptics + 6
   coverage + 1 synthesizer → 19 CONFIRMED · 3 PARTIAL · 0 REFUTED.
5. **Pass 3 — P0 settle** (Workflow `w0bon0i3e`, 8 agents): re-quoted P0s from real code and traced byok-route
   through to Rust.
6. **Pass 4 — main-agent end-to-end re-read** of byok-route (`Read`+`sed`+`rg` cross-checked).

> ⚠️ **Correction & honesty note.** A mid-session draft of this report briefly marked `byok-route` **REFUTED**.
> That was a _misread on my part_ (this session had heavy tool-output buffering that fed me phantom code). On
> clean re-read — corroborated by both workflows and my own end-to-end trace — `byok-route` is **CONFIRMED
> CRITICAL**. All "delete" items still get one final `rg` confirmation at fix time.

**Final tally: 19 CONFIRMED · 3 PARTIAL · 0 REFUTED.**

---

## 1. Executive Summary

The desktop app is largely real and wired, but has four problem classes: **(1) a trust-boundary breach
(silent BYOK→managed-cloud), (2) cloud-billing UI that overpromises a waitlist-only product, (3) capability
toggles that don't gate the backend, and (4) dead/cosmetic controls in the v3 shell** — plus duplicate stores
and orphaned dirs.

**Must-fix (P0):**

| #   | Issue                                                                                 | Evidence                                                                                                                                             | Why P0                                                                                |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | **byok-route** — paid plans silently force any non-ollama provider to `managed_cloud` | `ChatInputArea.tsx:524-527` & `:1051-1054` → `chat/index.tsx` invoke → `send_message.rs:58-60` → `provider_access.rs:8-13` → `llm_router.rs:852-867` | Trust-boundary breach: user's BYOK key bypassed, billed to AGI plan, no consent/label |
| 2   | **billing-ui** — live Stripe checkout/portal/upgrade in a local-first/waitlist app    | `AccountSettings.tsx:144-152`, `stripeCheckout.ts:34,76`, `config.ts:17-18`, `Pricing.tsx:51-54`                                                     | Charges before GA; refund liability                                                   |
| 3   | **cap-cosmetic** — capability toggles don't gate backend tools                        | `capabilities.rs` (no artifacts/subAgents/agentTeams/toolAccessMode arms)                                                                            | False sense of control over agent/artifact access                                     |
| 4   | **newchat / convclick** — core v3 sidebar actions are no-ops                          | `DesktopShellV3.tsx:62-64,82-94`                                                                                                                     | Can't create or switch conversations in default shell                                 |
| 5   | **gpt51** — hardcoded `'GPT-5.1 Instant'` fallback                                    | `ChatInputArea.tsx:430`                                                                                                                              | Violates models.json SSOT; shows phantom model                                        |

---

## 2. Trust-Boundary & Cloud-Overpromise (HIGHEST PRIORITY)

| Issue                               | What user sees                                                                              | Files                                                                                                                                                   | Class                    | Rec                       | Break-risk                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------- | ---------------------------------- |
| **byok-route** (CONFIRMED critical) | Picks own provider (e.g. Anthropic) on a paid plan; send silently goes to AGI managed cloud | `ChatInputArea.tsx:524-527` & `:1051-1054`; `chat/index.tsx:888,1157,1142`; `send_message.rs:58-60`; `provider_access.rs:8-13`; `llm_router.rs:852-867` | trust-boundary violation | **fix**                   | Critical — must fix before release |
| **billing-ui**                      | "Manage Subscription"/upgrade → live Stripe                                                 | `AccountSettings.tsx:144-152`, `stripeCheckout.ts:34,76`, `config.ts:17-18`, `Pricing.tsx:51-54`                                                        | overpromising-cloud      | **hide** behind beta flag | High — gate, don't delete          |
| **hobby-tier**                      | Hobby users can enter cloud mode                                                            | `stores/appModeStore.ts:38-86`, `constants/pricing.ts` (`waitlist`)                                                                                     | overpromising-cloud      | **gate**                  | Low                                |
| Cloud-publish / pricing modal       | "Publish to cloud" / upgrade affordances                                                    | (coverage `cov-cloud`)                                                                                                                                  | overpromising-cloud      | **gate**                  | Implies cloud is live              |

### byok-route — definitive, traced end-to-end

The override is **real** and lives at **two** sites — `ChatInputArea.tsx:524-527` (pending auto-send) and
`:1051-1054` (interactive send), identical:

```
const computedProviderOverride =
  isManagedPlan && selectedProvider !== 'ollama'
    ? 'managed_cloud'
    : selectedProvider || undefined;
```

There is **no** branch that prefers the user's BYOK key (`rg hasByokForSelected` = 0 hits). Trace:

1. `chat/index.tsx` `handleSendMessage` forwards it verbatim (`:888`, `:1157`) into
   `ipcInvoke('chat_send_message', { request: { providerOverride } })` (`:1142`).
2. Rust `send_message.rs:58-60`: `resolve_provider_and_model(&request)` then
   `request_uses_managed_cloud(provider_enum, request.prefer_cloud_credits)`.
3. `send_message_setup.rs` `resolve_provider_and_model` reads `request.provider_override` **first**.
4. `core/llm/mod.rs from_string("managed_cloud") → Provider::ManagedCloud`.
5. `provider_access.rs:8-13` `request_uses_managed_cloud` returns true for `ManagedCloud`.
6. `llm_router.rs:852-867` pushes the preferred (managed) provider and **returns** — the user's BYOK key is
   never consulted. `send_message.rs:100` even stamps `plan_tier = "free"` for this path.

**Effect:** a paid-plan user who selected their own provider has the send silently routed through AGI's managed
gateway — billed to their AGI plan, their BYOK key ignored, **no consent, no fork, no visible provider label**.
That is exactly the `local/byok → cloud_managed` flip the canon forbids.

**Fix (preserve cloud backend):** prefer the stored BYOK key when present for the selected provider; OR require
an explicit consent/fork step + a visible provider label before any managed-cloud routing.

All managed-cloud **backend** stays — we fix the silent-routing UX and gate overpromising UI only.

---

## 3. Hallucinated Product Claims

| Claim                | Reality                                                                                                    | Files                                      | Action                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------- |
| Team presence dots   | Hardcoded (owner=green, rest=grey)                                                                         | `TeamAccountSettings.tsx:155-160`          | hide or wire real presence    |
| Device management    | `account_list_devices` returns only current device; disconnect always errors                               | `src-tauri/.../account/mod.rs:795-848`     | hide UI or implement          |
| Delete account       | `privacy_delete_account` exists in Rust; **no UI button**                                                  | `src-tauri/.../privacy.rs:233`             | **wire** UI to existing cmd   |
| Pause subscription   | Duration selector ignored; opens generic portal                                                            | `features/v3/PauseFlow.tsx:19-29`          | wire duration or simplify     |
| Billing feature flag | `subscribe/upgrade/cancel` are `cfg(billing)` stubs returning "not enabled"; `get_pricing_plans` hardcoded | `src-tauri/.../subscription.rs:141-258`    | gate UI on capability         |
| Plugin marketplace   | Hardcoded `CATALOG` + fake install counts; Install uses non-existent IDs                                   | `features/v3/PluginMarketplace.tsx:15-187` | hide or wire to real registry |

---

## 4. AI Slop (dead / cosmetic / ignored)

| Item                                                 | Files                                                            | Class             | Action                     |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ----------------- | -------------------------- |
| New Chat button no-op                                | `DesktopShellV3.tsx:62-64`, `Sidebar.tsx:229`                    | dead-button       | fix → `createConversation` |
| Recent-conversation clicks no-op                     | `DesktopShellV3.tsx:82-94`, `Sidebar.tsx:108`                    | dead-button       | wire `onJumpConversation`  |
| Sidebar nav (artifacts/scheduled/dispatch/customize) | `Sidebar.tsx:151-165`, `App.tsx:1372-1384`                       | dead-nav          | wire or remove             |
| Capability toggles unenforced                        | `capabilities.rs` (no artifact/subagent arms)                    | cosmetic          | enforce or remove          |
| `setFeature` never syncs                             | `CapabilitiesSettings.tsx`, `settingsStore.ts:1272,1368,1770`    | saves-but-ignored | sync after toggle          |
| Hardcoded model fallback                             | `ChatInputArea.tsx:430` (`'GPT-5.1 Instant'`)                    | hardcoded-model   | read from catalog          |
| autoTTS persisted, no UI                             | `stores/settings/chatPrefs.ts`, `useTauriStreamListeners.ts:653` | dead pref         | add control or remove      |

---

## 5. Duplicate UI & Stores (7-question analysis)

**chatPreferences (×3):** (1) chat-pref toggles · (2) `settingsStore.ts:333-342`, `chatPreferencesStore.ts`,
`stores/settings/chatPrefs.ts` · (3) three parallel persisted stores · (4) duplicate · (5) best =
`settingsStore.chatPreferences` (wired to settings UI + `send_message`) · (6) **merge** the others in · (7) low
risk — re-point `useTauriStreamListeners` autoTTS read.

**MCP stores (×5):** (1) MCP server list/health/tools/oauth · (2) `mcpStore.ts` (facade) + `stores/mcp/*` +
`mcpServerStore.ts` + `mcpbStore` + `mcpAppStore` · (3) `mcp_*` Tauri cmds (real) · (4) partly-duplicate — facade
legitimately merges `mcp/*`; `mcpServerStore` (app-as-server) is distinct · (5) facade correct · (6) **keep**;
audit `mcpbStore`/`mcpAppStore` overlap only · (7) HIGH risk — MCP UI depends on them; no blind delete.

**background-task (×3):** (1) agent/background task status · (2) `agentTaskStore.ts`, `chat/agentStore.ts`,
`backgroundTaskStore.ts` · (3) overlapping state; `AgentTaskMonitor` reads all three · (4) duplicate · (5)
consolidate to one `TaskRecord` store · (6) **merge** · (7) MEDIUM — monitors must re-point.

---

## 6. Orphaned / Dead Code (break-risk LOW unless noted)

| Item               | Files                                                                                                                                                                  | Evidence                                                                                             | Action                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Dead stores (8)    | `analyticsStore`, `cacheStore`, `templateStore`, `roiStore`(top), `securityStore`, `codingCheckpointStore`, `projectMemoryStore`(top), `stores/settings/connectors.ts` | zero live path imports (only logoutCleanup/aliases); live ROI = `features/roi-dashboard/roiStore.ts` | delete after final `rg`                                        |
| Orphaned dirs      | `features/{document,errors,schedules,tools,dynamic-canvas,marketplace}`                                                                                                | imports commented in `features/chat/index.tsx`                                                       | delete or revive (`dynamic-canvas`/`marketplace` invoke-wired) |
| v3 components      | `features/v3/{Composer,ActiveChat,ModelPopover}.tsx`                                                                                                                   | exported, never rendered (shell uses unified-chat)                                                   | delete                                                         |
| Orphaned Rust cmds | `doctor_*`, `continuous_job_runner_*`                                                                                                                                  | registered, 0 frontend invoke (design*\*/vision*\_/swarm\_\_ ARE invoked via api wrappers)           | keep-monitor                                                   |

---

## 7. Reuse / Service-Layer Extraction (code-structure skill)

Orchestration owns why/when; services own reusable how. Extract these duplicated operational blocks:

| Duplicated logic                      | Locations                                                                           | Proposed service             | Callers                   |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------- | ------------------------- |
| `invokeWithTimeout`/`invokeWithRetry` | `api/mcp.ts:62-100`, `api/migration.ts:29-68`, `api/ollama.ts`, `api/embeddings.ts` | `lib/tauriInvoke.ts`         | all `api/*`               |
| retry utilities (×2)                  | `utils/retry.ts`, `lib/retry.ts`                                                    | consolidate to one           | both                      |
| capability sync                       | `settingsStore.ts:1272,1368,1770`                                                   | `services/capabilitySync.ts` | settings save/load/toggle |
| background-task state                 | 3 stores (§5)                                                                       | `services/taskRegistry.ts`   | monitors/panels           |

---

## 8. Partial / Nuanced Claims (so nothing is wrongly actioned)

**0 REFUTED · 3 PARTIAL:**

- **`r25v5` — PARTIAL/compliance-pass:** Privacy cloud-sync toggle correctly removed; `chat_storage_mode`
  coerces cloud→local — but a stray `chatStorageMode` persists in the parallel `chatPreferencesStore`
  (dual-truth; merge per §5).
- **`orphan-dirs` — PARTIAL:** orphaned via commented imports, but `dynamic-canvas`/`marketplace` are
  invoke-wired — revival candidates; verify before removal.
- **`orphan-cmds` — PARTIAL:** registered-but-uncalled from frontend, but `design_*`/`vision_*`/`swarm_*` ARE
  reached via `api/*` wrappers; only `doctor_*` and `continuous_job_runner_*` are truly orphaned. Beta stubs
  (e.g. `google_batch_*`) intentional. Keep, don't delete.

---

## 9. Remediation Plan (sequenced; preserve cloud backend)

### P0 — Trust & Overpromise (do first)

| Item                             | Action                                                                       | Break-risk      | Sequence           |
| -------------------------------- | ---------------------------------------------------------------------------- | --------------- | ------------------ |
| **byok-route**                   | fix: prefer BYOK key when present, or explicit consent/fork + provider label | Critical        | Before any release |
| Live Stripe billing UI           | hide behind beta flag                                                        | High            | With byok          |
| Capability toggles unenforced    | fix (map to backend) or hide                                                 | High (security) | With byok          |
| Hobby/cloud gate + cloud-publish | gate to match waitlist                                                       | Medium          | With byok          |

### P1 — Dead/Mock User-Facing

| Item                                   | Action                        | Break-risk |
| -------------------------------------- | ----------------------------- | ---------- |
| newchat / convclick                    | wire handlers                 | High       |
| nav-dead                               | wire or remove                | Medium     |
| gpt51                                  | read from catalog             | Low        |
| delete-acct                            | wire UI to existing Rust cmd  | Low        |
| plugin-mkt                             | hide or wire to real registry | Medium     |
| dev-disconnect / team-presence / pause | hide or implement             | Low        |

### P2 — Dedupe / Reuse Cleanup

| Item                         | Action                    | Break-risk |
| ---------------------------- | ------------------------- | ---------- |
| chatPreferences ×3           | merge                     | Low        |
| background-task ×3           | merge                     | Medium     |
| dead stores (8)              | delete after `rg` confirm | Low        |
| orphaned dirs/components     | delete or revive          | Low        |
| invoke/retry/capability-sync | extract services          | Low        |

---

## Verification ledger (per claim)

| Claim                                                                                                                                                      | Verdict                | Key evidence                                                                                                                                | Confidence                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| byok-route                                                                                                                                                 | **CONFIRMED critical** | `ChatInputArea.tsx:524,1051` ternary → invoke → `send_message.rs:58-60` → `provider_access.rs:8-13` → `llm_router.rs:852-867` bypasses BYOK | 2 workflows + main-agent end-to-end |
| billing-ui                                                                                                                                                 | CONFIRMED              | `AccountSettings.tsx:144-152`; `stripeCheckout.ts:34,76` live fetch; `config.ts:17-18` prod default                                         | self-verified                       |
| cap-cosmetic                                                                                                                                               | CONFIRMED              | `capabilities.rs`: no artifact/subagent/agentTeams/toolAccessMode arms                                                                      | self-verified                       |
| newchat                                                                                                                                                    | CONFIRMED              | `DesktopShellV3.tsx:62-64` empty handler                                                                                                    | self-verified                       |
| convclick                                                                                                                                                  | CONFIRMED              | `DesktopShellV3` never passes `onJumpConversation`                                                                                          | self-verified                       |
| gpt51                                                                                                                                                      | CONFIRMED              | literal `'GPT-5.1 Instant'` at `ChatInputArea.tsx:430`                                                                                      | self-verified                       |
| nav-dead, delete-acct, billing-feat, plugin-mkt, hobby-tier, pause, dev-disconnect, team-presence, dup-chatprefs, cap-nosave, dead-stores, composer-orphan | CONFIRMED              | file:line per §§3-6                                                                                                                         | Pass1+Pass2+Pass3                   |
| r25v5, orphan-dirs, orphan-cmds                                                                                                                            | PARTIAL                | see §8                                                                                                                                      | Pass2+Pass3                         |

**PRESERVE-CLOUD:** all managed-cloud backend (Stripe endpoints, account/device/team commands, cloud-bridge,
waitlist, managed_cloud provider) stays intact — this plan fixes silent routing and gates/hides overpromising UI
only; it never deletes cloud code.
