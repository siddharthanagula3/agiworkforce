---
id: "ENG-troubleshooting"
type: "engineering"
title: "Troubleshooting"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Troubleshooting

Troubleshooting map for AGI Workforce: how a failure becomes the words a user sees (error codes, provider failure classes, quota blocks), then symptom, likely cause, where to look and fix for sign-in, plan limits, provider errors, uploads, sync and local models. Built from code. No failure was reproduced, and several flows have open register rows.

## Purpose

Use this page to go from a symptom to a cause, a file and a fix without exploring the repository again. It serves developers and support.

**Basis note.** Everything below is [code] unless tagged. Nothing here was run by me. Implementation status (the code exists and is wired) is kept apart from verification status (someone ran it). Many register rows say 'source-corrected, runtime acceptance open'. That means the code was changed but nobody has seen it work live.

**How a failure reaches a person (four layers).**

1. **API error envelope.** Web routes throw an `AppError`. `handleError` turns it into `{error:{code,message},requestId}`. The message is replaced by a generic one (for example 'Internal server error') unless the error is marked user-safe or its code is in the safe set. The safe set holds credit, subscription, rate-limit, validation, model, CSRF, MFA, IP, passkey, account-unavailable and all denial codes (apps/web/lib/error-handler.ts:41-75) [code]. So a vague message from the server is by design, and the real text is in the server log under the same `requestId`.
2. **Code vocabularies.** Three code families live in packages/contracts/types/src/errors.ts [code]: `ErrorCode` (transport and auth, with HTTP status map), `DenialErrorCode` (line 68: who refused, such as DISABLED_BY_ORGANIZATION, UPGRADE_REQUIRED, QUOTA_EXCEEDED, PROVIDER_UNAVAILABLE, OFFLINE), and `DomainErrorCode` (STORAGE_ERROR, SEARCH_ERROR, TOOL_ERROR, CONNECTOR_ERROR, SANDBOX_ERROR, SAFETY_BLOCKED, RESOURCE_DELETED).
3. **Provider failures.** An adapter reports a stream error chunk. `toUpstreamError` and the per-provider mappers in adapter-errors.ts keep the status, Retry-After and the adapter's own classification. `classifyError` (packages/ai/provider-runtime/src/errors.ts:817) sorts it into a category. `mapClassifiedUpstreamError` (upstream-error-copy.ts:260) writes the user sentence and a stable code [code].
4. **Client copy.** Clients that only have an HTTP status or an exception use `toUserMessage` (packages/ui/ui/src/lib/network-error.ts:117). It hides machine-shaped text (HTTP codes, stack frames, SQL, paths) and falls back to a status sentence [code]. Mobile has its own copy for auth (apps/mobile/src/features/auth/components/authErrorMessage.ts) and for usage limits (apps/mobile/services/failureCopy.ts).

**Product context for support.** Free usage, the five-hour and weekly windows, and credits apply to mode:cloud (Managed Cloud) only. The plan tiers `local-only` and `byok` carry zero managed allowance (managed-usage-limits.ts) [code]. So a limit message means the turn was going to the managed route. Mobile Free copy says 'Local mode keeps working' (failureCopy.ts:41) [code].

## Procedure

**Triage in five steps.**

1. Get the `requestId` (response header from `REQUEST_ID_HEADER`, JSON body field, or the id inside a stream error frame). It is the same string as in the server log line [code: upstream-error-copy.ts:20-37].
2. Note the **mode** (local, own-key, cloud) and the **app**. A limit or provider error can only come from cloud. A 'no local model' error can only come from local.
3. Note the **code**, not the sentence. Sentences differ per app. Codes are stable.
4. Look the code up in the tables below.
5. Before calling it new, search `audit/registers/known-flaws.md` for the area (AGENTS.md section 12 and bug-finding-guide.md step 2) [requirement].

### A. Sign-in problems

| Symptom | Likely cause | Where to look | Fix |
|---|---|---|---|
| Local web: every signed-in page loops through redirects | A Clerk development key (prefix `pk_test_`) forces a handshake redirect | docs/development/troubleshooting.md:58 [requirement]. I did not verify the handshake behaviour in code [unknown] | Use a live-format key for automated work |
| Local web: sign-in fails, session 'from an unrecognised party' | `CLERK_AUTHORIZED_PARTIES` unset. It is listed in the 'important' env list in apps/web/lib/validate-env.ts [code]. The proxy and session-principal check read it, see test:apps/web/__tests__/proxy-clerk-authorized-parties.test.ts | validate-env.ts; apps/web/proxy.ts | Set the variable. Name only, never paste a value |
| API answers 403 `account_unavailable` | Account suspended or locked. Raised by `ACCOUNT_UNAVAILABLE` in apps/web/lib/api-auth.ts:144, and by the chat gate (auth-gate.ts) and the device token route [code] | api-auth.ts; auth-gate.ts | Sign in on the web to see why. Mobile shows an appeal link (authErrorMessage.ts) |
| 403 `mfa_required`, `passkey_required`, `ip_not_allowed` | Account security policy refused the call | auth-gate.ts (checks for MFA, IP allow list, passkey) | Complete step-up or sign in from an allowed network. These are real policy answers, not bugs |
| 401 `invalid_api_key` or 403 `insufficient_scope` | API key unknown or missing a scope | auth-gate.ts; apps/web/lib/api-key-scope-error.ts | Use a key with the needed scope |
| 403 `terms_acceptance_required` | Current Terms version not accepted | auth-gate.ts (CURRENT_TERMS_VERSION, readTermsStanding) | Accept terms in the web app |
| 403 `subscription_inactive` or `billing_read_only` | Paid plan lapsed or in read-only billing state | auth-gate.ts. When a plan lapses the turn may be served as Free, with header `X-AGI-Billing-Notice` | Renew, or read the billing notice |
| Mobile: 'That code expired', 'The email and password do not match', 'sign-in provider is unavailable', 'Could not reach the server' | Clerk error classes mapped by `classifyAuthError` | authErrorMessage.ts | Follow the copy. 'provider_outage' means retry another method |
| CLI or VS Code device sign-in never completes | Device-code flow. Token route answers `authorization_pending` (403), `slow_down`, `expired_token`, `access_denied`, `invalid_grant` (400) and `account_unavailable` [code: apps/web/app/api/auth/device/token/route.ts:58-160] | token/route.ts; code/route.ts ('Code not found or expired', 404; already processed, 409) | Start sign-in again. A lost refresh reply burns the token and forces a full re-sign-in (register DESKTOP-REFRESH-LOST-REPLY-01) |
| CLI says to run `agi login` | Credential file unreadable or missing | apps/cli/src/auth.rs (`sign_in_command`, keyring with file fallback) | Run `agi login` |
| Session ends with a 401 'Your session has expired. Sign in again' | Client mapped HTTP 401 | network-error.ts:17 | Sign in. Clerk session lifetime is a Clerk setting, not in the repo [unknown] |

### B. Plan and limit problems

| Symptom (code) | Meaning | Where to look | Fix |
|---|---|---|---|
| 429 `rolling_five_hour_limit_reached` | Rolling 5-hour managed capacity used | managed-usage-request-service.ts `reservationError`; copy in billing-catalog.ts `MANAGED_QUOTA_BLOCKS` | Wait for earlier usage to leave the window, upgrade, or switch to own-key or local |
| 429 `rolling_weekly_limit_reached` | Rolling weekly capacity used | same | same |
| 429 `flagship_weekly_limit_reached` | Weekly capacity for the most capable models used | same. The share is `FLAGSHIP_OF_WEEKLY_BUDGET_RATIO` in managed-usage-limits.ts | Pick a standard model |
| 429 `artifact_runtime_limit_reached` | One generated app used its share of the 5-hour budget (`ARTIFACT_RUNTIME_SHARE_OF_FIVE_HOUR_BUDGET`) | managed-usage-limits.ts | Other chats are unaffected |
| 402 `insufficient_credits` | Billing-period usage used up | `reservationError` case 'declined'; the reset time comes from the credit balance `period_end` | Upgrade, add credits, or wait |
| 402 `extra_usage_required` | Fast mode is billed to usage credits and they do not cover it | `reservationError` | Turn on credits or turn fast mode off |
| 409 `idempotency_in_progress`, `idempotency_replay`, `idempotency_conflict` | Same idempotency key reused | `reservationError`; managed-usage-idempotency.ts | A new turn needs a new key. Client retry bug if it repeats |
| 503 `billing_unavailable` | Usage accounting could not decide | `reservationError` default | Server side. Check logs by requestId |
| `free_trial_token_budget_reached`, `free_trial_model_only`, `free_trial_feature_unavailable`, `plan_upgrade_required`, `monthly_limit_exceeded`, `monthly_credit_limit_reached`, `rate_limit_exceeded` | Other managed quota codes the clients classify | `classifyManagedQuotaErrorCode` (billing-catalog.ts:991) gives each: show upgrade button, show reset time, suggest a standard model, cleared by credits | Per presentation fields |
| `free_allowance_exhausted` (429) | The shared free model pool, used by everyone on Free, is spent. It is not the user's limit | upstream-error-copy.ts (quota_exhausted with the free-pool hint); packages/contracts/cloud-contracts/src/free-quota.ts:17 | Wait. Do not tell the user to upgrade for this |
| Free account reads 'You have reached the free usage limit on your account' | Free-lane message `FREE_USAGE_LIMIT_REACHED_MESSAGE` (upstream-error-copy.ts:109). Mobile builds the matching text in `freeUsageLimitMessage` | failureCopy.ts | Per owner decision, Free screens show only Upgrade and no meters [requirement: owner memory note, not a repo document] |
| Free conversation too long for a promotional message | `FREE_MODEL_PROMOTION_LIMIT_MESSAGE` | upstream-error-copy.ts:115 | New chat or shorter message |
| 429 plain `Too many requests` | Route rate limit (`withRateLimit`), not a plan limit | apps/web/lib/rate-limit.ts, rate-limit-headers.ts | Wait for Retry-After |
| 'Free allowances look larger than Basic' | Known: Free is above Basic in several windows | register PLAN-PAID-ALLOWANCES-BELOW-FREE-01; managed-usage-limits.ts | Owner decision pending |
| A plan name in docs differs from the code tier | Tier ids in code are `free`, `basic`, `pro`, `max`, `max_15x`, `team`, `team_premium`, and others | managed-usage-limits.ts | Read the catalog, not prose [inferred] |

### C. Provider failures

The table shows what `classifyError` categories become (upstream-error-copy.ts `upstreamCopy`) [code].

| Category | HTTP | Code the client sees | Meaning and routing | Fix |
|---|---|---|---|---|
| rate_limit | 429 | `provider_rate_limited` | Provider is momentarily busy. Retry-After is shown only if the provider sent one (stated waits over 86,400 seconds are dropped) | Wait, or pick Auto or another model |
| server_overload, capacity_off_switch | 503 | `provider_overloaded` | Provider marked degraded via `markProviderDegraded` | Retry or change model |
| quota_exhausted | 429 | `provider_quota_exhausted` or `free_allowance_exhausted` | Provider quota window spent or spending cap hit. The pool leaves the ready set until reset | Pick another model |
| billing_exhausted | 503 | `provider_billing_exhausted` | Our provider account has no funds. Shown as our problem (503, not 402) on purpose | Operator tops up the account |
| auth | 401 | `provider_credentials_rejected` | Our provider key was rejected. Copy says a service configuration problem on our side | Operator checks the managed key |
| api_timeout | 504 | `provider_timeout` | Model too slow | Retry or faster model |
| connection | 502 | `provider_unreachable` | Could not reach the provider | Retry |
| server_error, unknown | 502 | `provider_error` | Generic failure | Retry or Auto |
| empty_response | 502 | `empty_response` | Provider reported success with no content. Auto may fail over. See register WEB-FREE-ROUTER-EMPTY-2026-09-22 | Retry |
| context_overflow | 400 | `context_length_exceeded` | Conversation too long for the model | New chat, drop attachments, larger-context model |
| max_output | 400 | `max_output_tokens_exceeded` | Output cap reached | Ask for less |
| safety, content_blocked | 400 | `content_filter`, `content_blocked` | Provider safety stop. Never rotated to another provider | Rephrase |
| media_too_large | 400 | `attachment_too_large` | Attachment over the model's media limit | Shrink or change model |
| unsupported_input | 400 | `unsupported_attachment` | This route cannot read the file type. Auto rotates this class, so reaching the user means every route refused | Pick a model that accepts the file, or attach text |
| invalid_model | 404 | `model_not_found` | Model retired or unavailable | Pick another or Auto |
| invalid_input, client_error | 400 | `provider_rejected_request` | Provider called the request malformed. Logged with `[upstream] provider rejected the request` (message text logged outside production only) | Remove odd attachments or parameters |
| tool_validation | 400 | `tool_call_invalid` | Model produced a bad tool call | Retry or turn tools off |
| pause_turn | 502 | `provider_paused_turn` | Provider paused mid-turn (register PROVIDER-ANTHROPIC-PAUSE-TURN-01) | Retry |
| aborted | 499 | `request_cancelled` | Client cancelled | None |
| any interrupting category after text began | | `stream_interrupted` | 'The response stopped part way through' (connection, timeout, server error, unknown only) | Retry for a complete answer |

Rules inside this table: the user sentence changes with context. A request already on Auto is told to 'pick a specific model', never 'choose Auto'. A Free-plan default model gets shorter copy [code].

Other provider points: the idle watchdog does not abort the upstream fetch (register PKG-STREAM-WATCHDOG-NO-UPSTREAM-ABORT-01). An Anthropic PDF page cap in the catalog differs from the provider page (PROVIDER-ANTHROPIC-PDF-PAGE-CAP-01). A quota 429 on the CLI is shown as a rate limit and retried (CLI-QUOTA-429-AS-RATE-LIMIT-01). A background call that fails after the provider started records no cost row (BILLING-BACKGROUND-FAILURE-COST-ROW-01).

### D. Upload failures

| Symptom | Likely cause | Where to look | Fix |
|---|---|---|---|
| 'Chat attachments are limited to N each' (validation 400) | File over `MAX_CHAT_ATTACHMENT_BYTES`. The limits are in packages/contracts/cloud-contracts/src/chat-attachment-policy.json: 25 MiB per file, 25 MiB per message, 20 MiB per image, 20 files. A lower set under `withoutHandshake`: 12 MiB, 12 MiB, 12 MiB, 10 files [code] | apps/web/app/api/uploads/chat-attachment/put/route.ts | Shrink the file. Read the JSON for the live numbers |
| 'The uploaded file was empty.' | Zero-byte body | same route | Re-select the file |
| 403 'This upload is not authorized' | Missing or bad upload token on the relay PUT | same route | Request a fresh presign (the URL lives 300 seconds, presign route) |
| 500 'Object storage is not configured' | Private object storage not configured in this deployment | `isPrivateObjectStorageConfigured` in apps/web/lib/server/object-storage | Operator configuration |
| 409 `UPLOAD_PROTOCOL_UPGRADE_REQUIRED` | Old client sent a project-source upload without the content-binding field | apps/web/app/api/uploads/presign/route.ts:227 | Update the app |
| Avatar 'limited to N MiB' | `MAX_AVATAR_BYTES` | presign route | Smaller image |
| Model says 'attachment unavailable: <name> ...' | Reasons: removed from Library, unreadable, unsupported, foreign, over_budget, empty, too_large, too_many, over_message_budget | apps/web/lib/chat-attachment-policy.ts (`CHAT_ATTACHMENT_UNAVAILABLE_NOTES`) | The note names the cause |
| Large chat file stuck 'Verifying', second intake after reload | Known: no re-attach to the running intake (WEB-LARGE-FILE-REATTACH-INTAKE-01). Feature is behind `CHAT_LARGE_FILES_ENABLED` | apps/web/app/api/files/uploads/route.ts | Wait for the intake |
| Scanned PDF page unread | OCR not wired (WEB-LARGE-FILE-OCR-UNWIRED-01) | tool-loop.ts | Attach text |
| Large-file limits never run at stated maximum | WEB-LARGE-FILE-MAX-SIZE-PREP-UNRUN-01, WEB-LARGE-FILE-PLAYWRIGHT-UNRUN-01, WEB-LARGE-FILE-ADVISORY-LOCK-FAKE-ONLY-01 | register | Treat as unverified |

### E. Sync problems

| Symptom | Likely cause | Where to look | Fix |
|---|---|---|---|
| Mobile toast 'Cloud changes haven't synced.' with Retry | Sync engine ended in error state while online, signed in and in cloud mode | apps/mobile/src/features/edge-cases/components/CloudSyncErrorNotice.tsx; apps/mobile/services/cloudSyncEngine.ts; store apps/mobile/stores/chat/cloudSyncStateStore.ts | Tap Retry (`syncNow`). The toast shows once per distinct error |
| Mobile toast with a reason sentence (chat sync off) | `chatSyncOffReason` set by `syncChats` | cloudSyncEngine.ts:1027 | Read the reason. Where the text comes from I did not trace [unknown] |
| Memory sync 426 or validation error naming a sync protocol | Client protocol older than the minimum (426 via `createError.clientUpdateRequired`) or newer than the server (validation, retry later) | apps/web/app/api/memory/sync/route.ts (`assertReadableSyncProtocol`); packages/contracts/cloud-contracts/src/sync.ts:76 | Update the client, or wait for the deployment |
| Memory sync 'Invalid memory sync cursor' | Bad `since` cursor | route.ts | Reset the cursor |
| Memory pull seems incomplete | Pull returns at most 1000 rows and flags saturation (`MAX_MEMORIES_PULL`) | route.ts:29 | Pull again |
| Conflicts after offline edits | Conflict listing route exists | apps/web/app/api/memory/conflicts/route.ts | Resolve in the app |
| Desktop settings differ from cloud | Settings sync adapter | apps/desktop/src/services/managedCloudSettingsSync.ts. This is the retained Tauri code, and the public Desktop shows the hosted web app (AGENTS.md section 5) [requirement] | Treat Tauri sync as internal |
| Sync body refusals, workspace leave, cache identity | Several rows are source-corrected only: WEB-MEMORY-SYNC-BODY-ADMISSION-01, WEB-WORKSPACE-CACHE-ACCOUNT-IDENTITY-01 | register | Unverified at runtime |

### F. Local model problems

| Symptom | Likely cause | Where to look | Fix |
|---|---|---|---|
| Mobile: 'No local model is configured for this device.' | No installed model and no ready system model | apps/mobile/src/features/model-picker/localModelRuntime.ts:105. The banner offers 'Use <name>' or 'Open Models' (apps/mobile/src/features/chat/utils/localModelRecovery.ts) | Download a model, or switch |
| Mobile system model note: 'Turn on <name> in Settings', 'Still getting ready on this device', 'Could not answer on this device', 'Not available on this device' | States `turned_off`, `preparing`, `failed`, `not_eligible` | apps/mobile/src/features/model-picker/systemModelAvailability.ts:65 | Per note. A failed system model is skipped for the session |
| Local Auto fails when another local model is ready | Known: no same-turn fallback (MOBILE-LOCAL-AUTO-NO-SAME-TURN-FALLBACK-01) | register | Pick the other model |
| Which runtime serves a device | Names: `foundation_models`, `aicore`, `executorch`, `llama_rn` in tiers 1 to 3 | packages/platform/local-llm/src/types.ts | Capabilities come from `getCapabilities` |
| Production build memory entitlement risk | MOBILE-LLAMA-ENTITLEMENT-UNGUARDED-01 | register | Release owner |
| Desktop (Tauri code): 'Ollama is not running ... run "ollama serve"' | Local Ollama server down. Health check every 30 s, 60 s back-off after failures | apps/desktop/src/services/ollamaHealthService.ts:85 | Start Ollama. Cloud models still work |
| CLI local Ollama turns lose system prompt or tools silently | No `num_ctx` is sent. Budget assumes a 128,000-token window | register CLI-OLLAMA-CONTEXT-WINDOW-01; apps/cli/src/local_models.rs | Open defect |

### G. Developer environment (from the troubleshooting doc, [requirement], checked only where noted)

| Symptom | Cause | Fix |
|---|---|---|
| Frozen install fails after dependency merge | Manifest changed, lock not regenerated | Regenerate with the package manager. Never hand-edit lock files (AGENTS.md section 12; hook blocks it) |
| Version bump does nothing | Root `pnpm.overrides` wins | Check root package.json |
| Release will not install | Seven-day minimum release age | Wait, or list the exact version in the exclude list |
| `check:protocol-types` red untouched | Stale build output | Rebuild outputs first |
| `tsc -b` red locally only | Torn `dist` | Delete that package's output |
| web `tsc --noEmit` dies with SIGABRT | Default heap too small | Use the raised heap setting (AGENTS.md section 12) |
| Guard passes locally, fails in CI | Guards read the working tree | Stage, then run, then commit |
| Env value ignored | A value exported in the shell wins over `.env.local` | Check the shell first |
| Chat 'closed-lane' error with a healthy model | Key-value provider unreachable. Providers are `upstash`, `redis`, `memory`, `none` (packages/platform/key-value/src/factory.ts:22) [code]. The claim that every completion fails is not verified by me [unknown] | Set the provider to `memory` locally |
| Mobile classNames vanish | Stale Metro cache | Clear it and restart |
| CI job fails in 3 seconds, no steps | Platform refused the job (billing state) | Check Actions billing |

## Commands

These are the commands the repository documents. I ran none of them [unknown whether they pass today].

| Purpose | Command | Source |
|---|---|---|
| Full guard chain | `pnpm check:llm-operability` | AGENTS.md section 12 |
| Typecheck all apps (the plain `pnpm typecheck` covers desktop only) | `pnpm typecheck:all` | AGENTS.md section 12 |
| Web typecheck needs a raised heap | `NODE_OPTIONS=--max-old-space-size=8192` | AGENTS.md section 12 |
| Migration state of a target | `pnpm db:migrate -- status` (production apply needs `--confirm-production`) | AGENTS.md; troubleshooting.md:84 |
| Row-level-security probe | `pnpm db:rls-probe`, then `pnpm check:rls-boundary` to name what is missing | troubleshooting.md:89 |
| Protocol types | `pnpm generate:protocol-types`, `pnpm check:protocol-types` | AGENTS.md section 5 |
| Env example contract | `pnpm check:env-contract` (checks the example files, not your shell) | troubleshooting.md:66 |
| LLM failure guards | `pnpm check:llm-failures:staged`, `pnpm check:llm-failures:strict` | bug-finding-guide.md:20 |
| Model catalog | `pnpm sync:models`, `pnpm models:families` | AGENTS.md section 4 |
| CLI sign-in | `agi login` | apps/cli/src/auth.rs `sign_in_command` |
| Find who owns a failure | `rg "<error code>" apps packages services` | bug-finding-guide.md patterns |
| Heavy local jobs | `scripts/dev/heavy-job.sh`, `scripts/dev/light-job.sh` | CLAUDE.md |

Command names for tests and lint per workspace live in docs/agent-context/commands.json (not read by me beyond the pointer in AGENTS.md).

## Rules and traps

- **The server hides messages on purpose.** A generic 'Internal server error' or 'Upstream service error' is `GENERIC_MESSAGES` at work (error-handler.ts). The cause is in the log under the `requestId`. Do not widen the safe set to make a message visible [code].
- **Match on code, never on message.** The adapter's structured classification is read first so a file named `timeout.pdf` or `insufficient_quota.pdf` cannot choose the failure class (adapter-errors.ts:11-30; provider-adapter.ts:353) [code].
- **An out-of-funds provider is not an auth failure.** `billing_exhausted` is kept separate from `auth` so the turn does not rotate onto another paid provider. It is shown as a 503 on our side, not a 402 for the user [code].
- **The shared free pool is not the user's limit.** Use `free_allowance_exhausted` wording. Do not send that user to upgrade.
- **Safety stops are never rotated** to another provider.
- **Waits are stated only when a provider or server measured them.** A value over one day is dropped. Do not invent a wait time in support replies [code].
- **Limits apply to cloud mode only.** Local and own-key tiers have zero managed allowance. Nothing may silently move a Local chat to BYOK or cloud (AGENTS.md section 6) [requirement]. A support answer must not suggest it.
- **Sign-in is separate from payment.** Local inference is free of any subscription. Whether Local needs an account is a separate question; I did not establish it per app [unknown].
- **Upload limits live in one JSON file.** Never quote numbers from memory. The no-handshake set is half the size for bytes and count [code].
- **Do not hand-edit generated or applied things:** the model catalog JSON, applied migrations, lock files, generated iOS output (AGENTS.md) [requirement].
- **A green test is not proof the fix works.** Many rows say 'source-corrected, runtime acceptance open'. Treat those as unverified.
- **Docs older than code lose.** When a doc and the code disagree, the code wins (AGENTS.md section 2).
- **Taxonomy for reviewing failures in code.** docs/agent-context/llm-failure-taxonomy.json has 28 categories, such as error-handling-failures, state-management-failures, api-failures, llm-failures, mobile-failures, cli-failures. It is a keyword list for AI-written code, not a catalogue of runtime errors [code: file read].

## Where the canonical document is

| Need | Canonical owner |
|---|---|
| Developer symptoms (install, build, local run, DB, tests, mobile, CI) | docs/development/troubleshooting.md |
| How to hunt a bug, search patterns | docs/agent-context/bug-finding-guide.md |
| Failure taxonomy for guards | docs/agent-context/llm-failure-taxonomy.json |
| Open defects, by ID | audit/registers/known-flaws.md (root causes in audit/prior-audits/active-issues-register.md) |
| Error code definitions and HTTP map | packages/contracts/types/src/errors.ts |
| API error envelope and safe-code set | apps/web/lib/error-handler.ts |
| Provider failure to user copy | apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts |
| Provider failure classes | packages/ai/provider-runtime/src/errors.ts |
| Managed usage windows and limit sizes | packages/contracts/types/src/managed-usage-limits.ts |
| Quota code presentation | packages/contracts/types/src/billing-catalog.ts (`classifyManagedQuotaErrorCode`) |
| Managed usage refusal codes | apps/web/lib/services/managed-usage-request-service.ts |
| Client message mapping | packages/ui/ui/src/lib/network-error.ts (web re-exports via apps/web/lib/user-error-message.ts) |
| Attachment limits | packages/contracts/cloud-contracts/src/chat-attachment-policy.json |
| Sync protocol floor | packages/contracts/cloud-contracts/src/sync.ts |
| Model IDs | the generated catalog, owned by packages/ai/model-registry/catalog/models.curation.json. Never copy IDs into docs |
| Validation rules and commands | AGENTS.md section 12; docs/agent-context/commands.json |
| Delivered error text guard | scripts/check-delivered-error-messages.mjs |

Related pages of this knowledge base (ids assumed from the naming scheme, not checked): SYS-chat-turn-pipeline.

## Gaps in the documents

- docs/development/troubleshooting.md has no section for sign-in, plan limits, provider failures, uploads, sync or local models. It covers builds, local setup, DB, tests, mobile bundler and CI only. This page fills that gap, but support-facing text for the six apps is not in any one document.
- No document lists the full set of managed quota and provider codes with their copy. Only the code does.
- The Clerk development-key handshake claim and the key-value 'every completion fails' claim in troubleshooting.md are not backed by code I could point at [unknown].
- Clerk session length is not in the repository [unknown]. A memory note says it stays on the Hobby plan lifetime, which I could not confirm in a repo document.
- Chrome extension and VS Code sign-in failure copy: I found the VS Code device-auth module (apps/extension-vscode/src/features/account-auth/deviceAuth.ts, with fallbacks 'This AGI Cloud account cannot be used right now...' and 'AGI Cloud could not complete the device sign-in request. Start again.') but did not trace Chrome extension errors (apps/extension/src/features/auth/authInterop.ts) [unknown].
- Where mobile `chatSyncOffReason` text is produced is not traced [unknown].
- Local-model failure copy for the CLI beyond the Ollama context row, and for the Electron Desktop, is not documented. The desktop Ollama health code sits in retained Tauri code, not the public Desktop.
- Known-flaws.md rows are mostly 'source-corrected, runtime acceptance open'. There is no list of which user-visible symptoms have actually been reproduced live.
- The register lists billing-period reset times as read from the credit balance `period_end`. How each client displays them was not compared across the six apps.
- The taxonomy file's lastUpdated is 2026-06-02, older than the repo's current guards [inferred from header; file not compared with guards].

## Key facts

| Fact | Basis | Source |
|---|---|---|
| API errors are wrapped by handleError. The message is replaced by a generic one (for example 'Internal server error', 'Upstream service error') unless the error is user-safe or its code is in SAFE_TO_EXPOSE_CODES, which includes CREDIT_REQUIRED, SUBSCRIPTION_REQUIRED, RATE_LIMIT_EXCEEDED, VALIDATION_ERROR, MFA_REQUIRED, ACCOUNT_UNAVAILABLE and all DenialErrorCode values. | read in the code | `apps/web/lib/error-handler.ts:41-75` |
| Three code families exist: ErrorCode (with HTTP map), DenialErrorCode (who refused: user, organization, workspace, role, device policy, unsupported by model/provider/route/surface/OS/region, upgrade/seat/entitlement/quota, provider degraded/unavailable, offline, maintenance, feature lifecycle) and DomainErrorCode (storage, search, tool, connector, sandbox, safety, deleted). | read in the code | `packages/contracts/types/src/errors.ts:68`; `packages/contracts/types/src/errors.ts:209` |
| Provider failures are classified by classifyError into categories (aborted, api_timeout, rate_limit, server_overload, capacity_off_switch, context_overflow, max_output, tool_validation, invalid_model, invalid_input, unsupported_input, media_too_large, auth, billing_exhausted, quota_exhausted, safety, content_blocked, empty_response, connection, pause_turn, server_error, client_error, unknown) and turned into user copy by mapClassifiedUpstreamError. | read in the code | `packages/ai/provider-runtime/src/errors.ts:33`; `apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:260` |
| billing_exhausted (our provider account out of funds) is deliberately kept separate from auth and is shown as HTTP 503 code provider_billing_exhausted, so the user is not shown a payment error and the turn is not rotated onto another paid provider. | read in the code | `packages/ai/provider-runtime/src/errors.ts:48-62`; `apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts (case billing_exhausted)` |
| A spent shared free model pool yields code free_allowance_exhausted (429) with copy saying it is not a limit on the user's account; other quota exhaustion yields provider_quota_exhausted. | read in the code | `packages/contracts/cloud-contracts/src/free-quota.ts:17`; `apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts (case quota_exhausted)` |
| Managed usage refusals: 402 insufficient_credits, 402 extra_usage_required, 429 artifact_runtime_limit_reached, 429 rolling_five_hour_limit_reached, 429 rolling_weekly_limit_reached, 429 flagship_weekly_limit_reached, 503 billing_unavailable, and 409 idempotency_in_progress, idempotency_replay and idempotency_conflict. | read in the code | `apps/web/lib/services/managed-usage-request-service.ts:400-470` |
| Clients decide what a quota code looks like (upgrade button, reset time, suggest standard model, cleared by credits) through classifyManagedQuotaErrorCode and the MANAGED_QUOTA_BLOCKS table. | read in the code | `packages/contracts/types/src/billing-catalog.ts:884`; `packages/contracts/types/src/billing-catalog.ts:991` |
| Managed allowances come from MANAGED_USAGE_LIMITS per plan tier. The local-only and byok tiers have zero managed credits, so usage-limit errors apply only to managed cloud turns. | read in the code | `packages/contracts/types/src/managed-usage-limits.ts:31` |
| Free allowance sits above Basic in several windows. This is an open owner decision. | stated requirement | `audit/registers/known-flaws.md (PLAN-PAID-ALLOWANCES-BELOW-FREE-01)`; `packages/contracts/types/src/managed-usage-limits.ts` |
| Stated waits in user copy are only used when a provider or server supplied Retry-After; values under 1 second or over 86,400 seconds are dropped. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:133-140`; `apps/mobile/services/failureCopy.ts:13-18` |
| A failure after answer text has started (connection, timeout, server error, unknown) is shown as stream_interrupted with the text 'The response stopped part way through...'. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:92-101` |
| The adapter's structured classification is read before any message text, so a user-chosen file name cannot decide whether a turn is retried or rotated. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/adapter-errors.ts:11-30`; `packages/contracts/types/src/provider-adapter.ts:353` |
| Chat attachment limits live in chat-attachment-policy.json: 25 MiB per file, 25 MiB per message, 20 MiB per image, 20 files, with a lower withoutHandshake set (12 MiB, 12 MiB, 12 MiB, 10 files). | read in the code | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json:1-12`; `packages/contracts/cloud-contracts/src/chat-attachments.ts:21-29` |
| The relay upload PUT refuses empty bodies and bodies over the limit with validation errors, refuses a missing token with 403, and fails with an internal error if private object storage is not configured. Presign URLs live 300 seconds. | read in the code | `apps/web/app/api/uploads/chat-attachment/put/route.ts:15-45`; `apps/web/app/api/uploads/presign/route.ts:195-205` |
| Presign answers 409 UPLOAD_PROTOCOL_UPGRADE_REQUIRED to an old client that sends a project-source upload without the content-binding field. | read in the code | `apps/web/app/api/uploads/presign/route.ts:227` |
| Memory sync refuses a client whose sync protocol is below the minimum with a client-update-required error, and a client newer than the server with a validation error. Pull is capped at 1000 memories. | read in the code | `apps/web/app/api/memory/sync/route.ts:29`; `apps/web/app/api/memory/sync/route.ts:343-350`; `packages/contracts/cloud-contracts/src/sync.ts:76-87` |
| Mobile shows the toast 'Cloud changes haven't synced.' with a Retry action when sync is in the error state while online, signed in and in cloud mode. | read in the code | `apps/mobile/src/features/edge-cases/components/CloudSyncErrorNotice.tsx:10-45` |
| Device sign-in token route answers authorization_pending (403), slow_down, expired_token, access_denied, invalid_grant and account_unavailable. The code route answers 404 for unknown or expired codes and 409 for already-processed codes. | read in the code | `apps/web/app/api/auth/device/token/route.ts:58-160`; `apps/web/app/api/auth/device/code/route.ts:133-155` |
| The chat auth gate returns terms_acceptance_required, invalid_api_key, insufficient_scope, mfa_required, passkey_required, ip_not_allowed, account_unavailable, subscription_inactive and billing_read_only as distinct codes. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:22-257` |
| Mobile maps Clerk auth errors to fixed sentences (code expired, incorrect, link expired, suspended with appeal link, locked, wrong credentials, provider outage, network unreachable). | read in the code | `apps/mobile/src/features/auth/components/authErrorMessage.ts:21-55` |
| On mobile a missing local model raises 'No local model is configured for this device.' and the banner offers 'Use <name>' or 'Open Models'. System model states are turned_off, preparing, failed, not_eligible with fixed notes. | read in the code | `apps/mobile/src/features/model-picker/localModelRuntime.ts:105`; `apps/mobile/src/features/chat/utils/localModelRecovery.ts:20-37`; `apps/mobile/src/features/model-picker/systemModelAvailability.ts:65-79` |
| Local runtimes known to the shared package are foundation_models, aicore, executorch and llama_rn, in tiers 1 to 3. | read in the code | `packages/platform/local-llm/src/types.ts:1-3` |
| The retained desktop Ollama health check polls every 30 seconds and tells the user to run 'ollama serve'. This is Tauri code, not the public Electron Desktop. | read in the code | `apps/desktop/src/services/ollamaHealthService.ts:5-8`; `apps/desktop/src/services/ollamaHealthService.ts:85-91`; `AGENTS.md section 5` |
| Client message fallback hides machine-shaped text (HTTP status strings, stack frames, paths, SQL, ZodError) and falls back to a status sentence, for example 401 'Your session has expired. Sign in again to continue.' | read in the code | `packages/ui/ui/src/lib/network-error.ts:15-128` |
| The CLI local Ollama path sends no num_ctx and budgets against a 128,000-token window, which can silently drop the system prompt and tools. Open defect. | stated requirement | `audit/registers/known-flaws.md (CLI-OLLAMA-CONTEXT-WINDOW-01)` |
| Several large-file upload behaviours have never been run at stated maximum, in the browser spec, or against a real database lock. | stated requirement | `audit/registers/known-flaws.md (WEB-LARGE-FILE-MAX-SIZE-PREP-UNRUN-01, WEB-LARGE-FILE-PLAYWRIGHT-UNRUN-01, WEB-LARGE-FILE-ADVISORY-LOCK-FAKE-ONLY-01)` |
| AGI_KV_PROVIDER accepts upstash, redis, memory or none. | read in the code | `packages/platform/key-value/src/factory.ts:19-22` |
| The known-flaws register is the first stop before calling a bug new, and a fixed row is deleted rather than annotated. | stated requirement | `docs/agent-context/bug-finding-guide.md:9-16`; `audit/registers/known-flaws.md:851-862` |

## Open questions

- Does a Clerk development key really force a handshake redirect, and is that the only cause of redirect loops? Only the troubleshooting document says so; I found no code that proves it.
- Which plan names do users see for each tier id (basic, pro, max, max_15x, team, team_premium)? The owner renamed plans, and I did not read the display catalog.
- Does Local mode on each app require sign-in? The requirement keeps account and payment separate, and I did not establish the answer per app.
- Where does the mobile chatSyncOffReason text come from, and when is chat sync turned off?
- How do the Chrome extension and the Electron Desktop show sign-in, limit and local-model failures? Only web, mobile, VS Code (partly), CLI (partly) and retained Tauri code were read.
- Which of the register rows marked 'source-corrected' have since been checked live? None were run by me.
- Do the 'closed-lane' completion failures really occur when the key-value provider is down? Only the document says so.
- Product choice left open: Free allowances above Basic (PLAN-PAID-ALLOWANCES-BELOW-FREE-01), and billing upgrade rule differences between web and store paths (BILLING-UPGRADE-RULE-DIVERGES-01).
- Product choice left open: whether a quota 429 on CLI should stop retrying (CLI-QUOTA-429-AS-RATE-LIMIT-01).
- Which workspace commands in docs/agent-context/commands.json cover each troubleshooting check? I did not read that file.

## Project documents found out of date

- `docs/development/troubleshooting.md`: Not found stale in most entries. Two claims are not backed by code I could open: the Clerk development key handshake redirect, and 'every completion fails' when the key-value provider is down. The file also lacks any section on sign-in, plan limits, provider errors, uploads, sync or local models. The code says: The key-value provider list (upstash, redis, memory, none) matches the factory. CLERK_AUTHORIZED_PARTIES is in validate-env.ts as an 'important' variable, but whether it is required is a warning level in that list, not a hard error. (packages/platform/key-value/src/factory.ts:22; apps/web/lib/validate-env.ts:68. The doc says 'is required', while the code lists it under importantVars [inferred: the severity is not shown in the lines I read])
- `docs/agent-context/llm-failure-taxonomy.json`: Header says lastUpdated 2026-06-02, earlier than the guard and register work recorded in later documents. The code says: The bug-finding guide (updated 2026-11-11) names the staged and strict guards, so the taxonomy has probably not changed with them. I did not diff them. (docs/agent-context/llm-failure-taxonomy.json:3-4; docs/agent-context/bug-finding-guide.md:20-22)
