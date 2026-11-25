---
id: "SYS-execution-boundaries"
type: "system"
title: "Execution boundaries: Local, own key, Cloud"
basis: "code inspection and project documents"
second_reader: "challenged and corrected; corrected after the consistency check across pages"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Execution boundaries: Local, own key, Cloud

The product has three execution modes. Local runs on the device. Own key sends requests straight to the user's provider. Cloud goes through AGI servers, which call providers, and is the only metered, synced path. One shared host list, per-app egress guards, a mobile consent record and CI proofs enforce the boundary. Subscription rules attach to Cloud capabilities only, and they are not one uniform check: web, mobile, desktop and Chrome need the Free-and-up chat capability, while CLI and VS Code need a Pro-tier capability. The Electron Desktop refuses on-device inference by a recorded decision. VS Code does support Local (Ollama, LM Studio) and own key through the CLI app-server and `agi login`, with no AGI account or plan; the harness catalog still marks both unwired, so the catalog lags the implementation. The desktop renderer guard fails open for a host it cannot parse. Two shared contract functions are not called directly by product code (one has no caller; the other has one wrapper caller).

## What it is and why it exists

AGI Workforce can answer a request in three separate ways. Each one has its own promise about where the data goes. This page maps those ways, says which capability works in which one, and says what stops data crossing from one to the next.

| Mode | Short meaning | Where inference runs | Who pays for inference |
| --- | --- | --- | --- |
| mode:local | On-device or loopback model. Nothing leaves the device. | The phone (mobile), or a model server on the same machine such as Ollama or LM Studio (CLI, VS Code through the CLI, retained Tauri build) | Nobody. No plan check was found on the mobile Local path. |
| mode:own-key | Bring your own key (BYOK). The device calls the user's own provider directly. | An outside provider, with the user's key | The user, at the provider |
| mode:cloud | AGI-managed access. The device calls AGI servers, which call providers. | AGI servers, then outside providers | AGI, metered against the account's plan |

Why it exists:

- AGENTS.md section 6 says Local, BYOK and Managed Cloud are separate trust boundaries (a line data must not cross without permission). Nothing may silently route a Local chat, file or session to BYOK or Cloud. A Local-to-BYOK move must be an explicit fork with consent and a visible provider label. [requirement] (AGENTS.md section 6)
- The product requirement says Local is free of any paid subscription, and that account or sign-in requirements are a separate question from payment. [requirement] (task brief; docs/product/requirements.md:478-486 says Local needs no AGI account)
- A guard fails closed. If the app cannot tell which mode it is in, it must treat the request as Local and block our-cloud egress. [code] (packages/contracts/trust-boundaries/src/egress-policy.ts:5-10). One exception is recorded under Gaps: the desktop renderer guard does not block a target whose host it cannot parse.

Vocabulary:

- **Egress** means data leaving the device.
- **Our-cloud host** means a host name owned by AGI infrastructure: the web app, Vercel, Neon database, Clerk sign-in.
- **Provider label** means the visible name of the outside provider that will receive data.
- **Entitlement** means what the account's plan allows.

Plan names. The code tier names are free, basic, pro, max, max_15x, team, team_premium, enterprise, plus the zero-price tiers local-only and byok. The labels shown to people are Basic for basic, Premium for pro, Max for max and Ultra for max_15x. This page writes the label and, where a rule is stated, the code tier set. [code] (packages/contracts/types/src/billing-catalog.ts:5-16, 166-232, 332-341)

Related pages: SYS-chat-turn-pipeline, SYS-subscription-entitlements (names assumed from the brief; not opened).

## How it works today

### 1. The three modes are not the same on every app

The policy table is `docs/architecture/trust-boundaries.md:36-45`. It says what each app is allowed to offer. The harness catalog says what it marks as implemented. They differ in places, and for VS Code the catalog is the one that lags the code.

| App | mode:local | mode:own-key | mode:cloud | Basis |
| --- | --- | --- | --- | --- |
| surface:mobile | Yes, on-device model (partial in the harness catalog) | No. The remote-chat gate accepts a `byokKeys` flag but never reads it | Yes, after sign-in and provider consent. A `v1LocalOnly` build flag exists that blocks Cloud without an explicit unlock; no released build sets it | [code] (apps/mobile/services/remoteChatGate.ts:3-14; packages/ai/model-registry/catalog/harnesses.json, profile mobile/local-chat) |
| surface:web | Code paths exist for `local:` model ids and a Local-to-BYOK fork. Policy says Web has neither. Reachable in a plain browser: [unknown] | Same as left | Yes | [code] (apps/web/features/chat/lib/localByokHandoff.ts:55-65; apps/web/__tests__/trust-boundary.test.ts:181-239); [requirement] (docs/architecture/trust-boundaries.md:38) |
| surface:desktop (public Electron shell) | Refused. The shell rejects every local-inference command. The code names decision D-2026-09-15-04 (chat is Cloud-only) as the reason; local coding reaches local models only through the bundled CLI | Not offered for chat | Yes. It loads the hosted web app | [code] (apps/desktop/electron/runtime/dispatcher.ts:3235-3244, 3366-3367) |
| surface:desktop (retained internal Tauri build) | Partial | Implemented, with a Local-to-BYOK fork | Yes | [code] (harnesses.json profiles desktop/local-chat, desktop/byok-chat; apps/desktop/src-tauri/src/sys/commands/llm.rs:1211-1215). AGENTS.md section 5 says Tauri is internal code, not the public Desktop. |
| surface:cli | Partial. Models served on loopback | Implemented | Implemented; Cloud models need Premium (pro tier set) or higher | [code] (harnesses.json cli profiles; apps/cli/src/local_models.rs:5-6; apps/cli/src/model_catalog.rs:925-960) |
| surface:vscode | Yes, through the CLI app-server, with Ollama and LM Studio servers. No AGI account or plan needed. The harness catalog marks it `unwired`, which lags the extension | Yes, through the CLI: the extension runs `<cli> login <provider>`. No AGI account or plan needed. The harness catalog marks it `unwired`, which lags the extension | Implemented; Cloud models need Premium (pro tier set) or higher | [code] (apps/extension-vscode/src/integrations/localRuntimeClient.ts:~720-745; apps/extension-vscode/src/providers/terminalProvider.ts:~383-404; apps/extension-vscode/README.md:~35-38; harnesses.json:703-725 vscode profiles) |
| surface:chrome | Policy says no. A local `chrome/browser-task` profile exists | No | Yes | [requirement] (trust-boundaries.md:45); [code] (harnesses.json chrome profiles) |

### 2. Which mode a request is in

- **Mobile.** One persisted value, `appMode`, is `local` or `cloud`. Default is `local`. Every write passes one admission function, so the value cannot become `cloud` unless the signed-in account's provider-sharing permission is current. [code] (apps/mobile/src/features/chat/store/appModeStore.ts:17-51, 60-66; apps/mobile/src/features/chat/store/cloudModeDoor.ts:94-102)
- **Desktop (Tauri renderer).** `useAppModeStore` holds `local` or `cloud`. `selectPrivacyMode` maps `local` to the `local` privacy mode and everything else to `managed`. The guard treats anything not `managed` as private, and an exception while reading it also counts as private. A browser build with no Tauri forces `cloud`. [code] (apps/desktop/src/stores/appModeStore.ts:28-33, 45, 104-106; apps/desktop/src/stores/privacyBoundary.ts:3-8)
- **Server.** Each provider call is classified by `trustModeContract(mode)`: where content rests, whose key pays, what may serve as fallback. An unreadable mode is treated as the strictest mode. [code] (packages/contracts/types/src/trust-mode-contract.ts:50-80; apps/web/lib/server/trust-boundary-crossing.ts:90-100)
- **A conversation keeps its mode.** On mobile, a Local conversation refuses Cloud models and a Cloud conversation refuses local models, with a message telling the person to start a separate chat. [code] (apps/mobile/stores/chat/chatExecutionStore.ts:2262-2285)

The shared contract names the toggle as two values, `local` and `cloud`. BYOK is a sub-mode of the local position, not a third toggle value. [code] (packages/contracts/types/src/sessions/execution-profile.ts:1-20)

### 3. The egress guard

The guard is a replacement for `fetch`. It reads the mode, looks at the host, and throws before any network call when the rule says no.

1. One shared, platform-free list of our-cloud hosts and one matcher live in `@agiworkforce/trust-boundaries`. The list holds the web domain, the Vercel domain, the Neon domain and four Clerk domains. Matching is by suffix, ignores case and ignores a trailing dot. [code] (packages/contracts/trust-boundaries/src/egress-policy.ts:32-64)
2. BYOK provider hosts are deliberately absent from the list, so a direct call to the user's own provider is never blocked. [code] (egress-policy.ts:25-29)
3. **Desktop guard.** In private mode it extracts the host; if the host is on the list it throws `EgressBlockedError`; otherwise it calls `fetch`. It fails open when the host cannot be parsed: `extractHost` returns null on a parse error (for example a relative URL), and the guard throws only for a non-null host on the list. A relative-path request in private mode is therefore not blocked by this guard. [code] (apps/desktop/src/lib/egressGuard.ts:23-45, 56-67)
4. **Mobile guard.** It treats Cloud as open only when `appMode` is `cloud` and the account's provider consent is current. Otherwise it blocks any our-cloud host (the shared list plus the hosts from the configured API and signalling URLs) before network I/O, except exact carve-outs. Reading either mode fails closed to Local. [code] (apps/mobile/lib/egressGuard.ts:72-126, 336-357)

   | Carve-out in Local mode | What it allows | Conditions |
   | --- | --- | --- |
   | Signed-in account controls | Terms acceptance, age-eligibility check, account deletion status and deletion, cancel-deletion schedule, identity step-up for deletion only, data export | Exact API origin, a Bearer token, an allowed method and path, no query string; some fix the body (egressGuard.ts:215-253) |
   | Withdrawal controls | List schedules, set one inactive, list unfinished runs, pause one run, revoke the Ask from Siri token | Bearer token, fixed body and limited query keys (egressGuard.ts:280-303) |
   | Content report | One POST the person chose to send | Its own Send tap, no query, not while a withdrawal is in progress (egressGuard.ts:136, 193-201, 343-347) |

   Sign-in and session refresh do not pass through this guard. They run through the auth SDK, so they reach the sign-in hosts in either mode. [code] (docs/architecture/trust-boundaries.md:28 states this; egressGuard.ts has no sign-in path)
5. All mobile API calls go through `apiFetch`, which calls `guardedFetch`. Product analytics goes through it too, and is switched on only in Cloud. [code] (apps/mobile/services/api.ts:329-342; apps/mobile/services/productAnalytics.ts:30-35)

### 4. The consent step into Cloud on mobile

- Entering Cloud triggers a native alert titled "Share with AI providers?". It names every provider the app can route to and offers Allow, Not now and Details. Details opens the provider list page and then asks again. [code] (apps/mobile/services/providerConsent.ts:81-90, 270-287)
- Allow writes a record under `agi:cloud-provider-consent:v1` holding the account owner id, the provider ids covered, the time and the surface. [code] (providerConsent.ts:58-62, 224-244)
- The consent counts as current only if it belongs to the signed-in account, covers every provider now in the list (a new provider means the question is asked again), and no withdrawal is in progress. [code] (providerConsent.ts:208-217)
- Declining leaves the app in Local. [code] (cloudModeDoor.ts:57-73)
- Withdrawing writes a marker first, so a crash mid-way still closes Cloud on next launch. It returns the app to Local, then pauses schedules and running tasks, and turns off Ask from Siri. If pausing could not finish, a toast says tasks may still run. [code] (providerConsent.ts:159-175, 247-257; cloudModeDoor.ts:151-176)

### 5. Moving a Local chat to a provider

There is no single mechanism. Each app does it differently.

| App | Mechanism | What the person sees | Basis |
| --- | --- | --- | --- |
| surface:mobile | None. A Local chat cannot continue in Cloud. The only crossing is a manual copy of selected chats' text, from the Data controls screen, while in Cloud mode | One alert showing counts and limits, buttons Cancel and Sync to Cloud. No secret scan or payload preview was found in the code read | [code] (apps/mobile/src/features/settings/data-controls/index.tsx:145-235) |
| surface:web | If the active chat is Local and the chosen model is a direct own-key provider, sending opens a consent dialog instead of sending. Regenerate is refused with an explanation | Choose context items (last 10 messages plus the outgoing prompt), see the redacted preview, confirm. The dialog shows `Local to Direct BYOK` and the provider name, says the original Local thread is unchanged, and creates a separate conversation | [code] (apps/web/features/chat/lib/localByokHandoff.ts:55-118; apps/web/features/chat/pages/WebChatPage.tsx:4456, 7971-7975; packages/ui/unified-chat/src/components/LocalByokHandoffDialog.tsx:75-110) |
| surface:desktop (Tauri) | A fork dialog builds the same preview and creates a new own-key conversation with only the approved, redacted messages. The Rust command stores it and leaves the Local conversation untouched | Preview expires after 15 minutes. The dialog does not pass a provider name | [code] (apps/desktop/src/features/byok/ByokConversationDialog.tsx:12, 113-130; apps/desktop/src-tauri/src/sys/commands/llm.rs:1211-1277) |
| surface:desktop (Tauri), folder to Cloud | A sheet reads selected local files, previews them and attaches them to a managed chat. Findings block confirmation | Label "AGI Managed Cloud" | [code] (apps/desktop/src/features/context-handoff/CloudFolderAttachSheet.tsx:173-182, 258-273) |
| surface:cli | Local-to-cloud continuation creates a session that inherits no source messages, so unselected context is never written to the destination | The consent screen was not opened in this pass | [code] (apps/cli/src/platform/runtime/session.rs:1088-1107); consent UI [unknown] |

The shared preview builder redacts secrets with a scanner, hashes the exact payload, sets `consentRequired: true`, and marks the preview `blocked` when it finds secrets and `blockOnFindings` is on (default on). [code] (packages/platform/utils/src/privacyHandoff.ts:111-167)

The written requirement lists eight steps for a crossing: user action, context selection, secret scan, payload preview, provider label, retention and cost disclosure, consent, new branch preserving the original. [requirement] (docs/product/requirements.md:7.4, lines 135-146)

### 6. What crosses and what does not

- Local chats do not reach AGI servers through the guarded network path. Sign-in traffic and on-device model downloads are outside that path (see Gaps).
- Own-key traffic goes to the provider and never to our hosts. Our servers do not see it. [code] (egress-policy.ts:25-29)
- Cloud is the only path that writes to the shared chat store and the only metered path. [requirement] (docs/architecture/trust-boundaries.md:73-75)
- Server-side semantic decisions refuse Local and own-key sessions before any transport exists. [code] (apps/web/__tests__/trust-boundary.test.ts:241-302)

### 7. Capability tables

Columns: where it runs; whether the mode offers it; the subscription rule. Plan tiers and labels are in `packages/contracts/types/src/billing-catalog.ts:5-16, 166-232`. In the tables, "Premium and above" means the code set PRO_TIERS (pro, max, max_15x, team, team_premium, enterprise). "Basic and above" means PAID_TIERS (basic and every higher tier). [code] (billing-catalog.ts:332-341)

**Chat**

| Mode | Where it runs | Available | Subscription rule |
| --- | --- | --- | --- |
| Local | Phone runtime (mobile); loopback server (CLI, and VS Code through the CLI app-server); refused on Electron | Mobile, CLI (partial), VS Code; not Electron | No plan check found on the mobile Local path; sign-in is not needed, but an on-device age confirmation is required before any screen. VS Code Local needs no AGI account or plan. [code] (chatExecutionStore.ts:2262-2290, 2373; apps/mobile/src/features/auth/services/rootRouting.ts:30-60; apps/extension-vscode/README.md:~35-38) |
| Own key | Outside provider | CLI, VS Code (through the CLI login), Tauri desktop; not mobile, Electron or Chrome | CLI states own-key and local models are never gated by tier. VS Code own key needs no AGI subscription. [code] (apps/cli/src/model_catalog.rs:925-960; apps/extension-vscode/README.md:~35-38). Whether a plan is needed for own key elsewhere: [unknown] |
| Cloud | AGI servers, then outside providers | Web, mobile, Electron, Chrome, CLI, VS Code | `managed_chat` for web, mobile, desktop and Chrome: every tier from free. `developer_surfaces` for CLI and VS Code: PRO_TIERS only. Also kill switches, spend limit, workspace policy, adult-eligibility check. [code] (apps/web/lib/free-chat-surface-policy.ts:96-113; billing-catalog.ts:343-364) |

**Web search**

| Mode | Where it runs | Available | Subscription rule |
| --- | --- | --- | --- |
| Local | Not available on mobile Local; the web-search branch sits after the Local branch returns. [inferred] (chatExecutionStore.ts:3237-3262) | No | Not applicable |
| Own key | Provider-native search is declared per provider adapter; whether a profile wires it: [unknown] (harnesses.json own-key profiles list no features) | Unknown | Unknown |
| Cloud | Provider-native search or an AGI backend, depending on the model | Yes | Every product tier allows search. Free is included, with an allowance read from `GET /api/web-search/allowance`. [code] (packages/contracts/types/src/model-catalog.ts:1233-1257; apps/web/app/api/web-search/allowance/route.ts:19-22) |

**Memory**

| Mode | Where it runs | Available | Subscription rule |
| --- | --- | --- | --- |
| Local | On the phone: facts are read from a device store and injected into the prompt | Mobile | None found. [code] (chatExecutionStore.ts:2790-2816; apps/mobile/src/features/memory/store.ts:589) |
| Own key | Not found | Unknown | Unknown |
| Cloud | Server assembles context; device keeps a mirror store `memory-store-cloud`; sync at `/api/memory/sync` | Yes; also an account-level switch | `memory_personalization`: every tier from free. [code] (billing-catalog.ts:343-364; apps/mobile/stores/memory/cloudMemoryStore.ts:69) |

**Projects**

| Mode | Where it runs | Available | Subscription rule |
| --- | --- | --- | --- |
| Local | Phone: project sources and instructions are added to the prompt on the device | Mobile | None found; the catalog gives local-only and byok unlimited projects. [code] (chatExecutionStore.ts:2758-2778; billing-catalog.ts:583-616) |
| Own key | Unknown | Unknown | Unknown |
| Cloud | Server projects at `/api/projects` and `/api/projects/sync` | Yes | `projects`: every tier from free. Free is limited to 5 projects and 500 MiB of knowledge; Basic and up are unlimited projects. [code] (billing-catalog.ts:617-632) |

**File upload**

| Mode | Where it runs | Available | Subscription rule |
| --- | --- | --- | --- |
| Local | Phone reads attached documents and runs on-device text recognition on images. The local text model cannot see the pixels | Mobile | None found. [code] (chatExecutionStore.ts:1227-1256, 2721-2735) |
| Own key | Files go to the provider. Requirements say ask before sending files. Code check: [unknown] | Unknown | Unknown. [requirement] (requirements.md:2.5) |
| Cloud | Presigned upload to our storage (`/api/uploads/presign`, then `/api/uploads/chat-attachment/complete`); large files via `/api/files/intakes` | Yes | Free: 5 uploads per day and no large-file path. Basic and above: unlimited uploads and a large-file path with daily byte caps. [code] (packages/contracts/cloud-contracts/src/chat-attachments.ts:18-19; billing-catalog.ts:617-680) |

**Image generation**

| Mode | Where it runs | Available | Subscription rule |
| --- | --- | --- | --- |
| Local | No local image generator was found; not opened | Unknown | Not applicable |
| Own key | Provider media adapters list own-key as a trust mode; wiring in apps: [unknown] | Unknown | Unknown. [code] (harnesses.json, rows with apiFamily media) |
| Cloud | AGI servers call a media provider: `POST /api/media/image/generate` | Web, desktop, CLI; mobile status partial | `image_generation`: PRO_TIERS (Premium and above). Free is denied (`canUseImages` false). [code] (billing-catalog.ts:343-364; capability-handshake-service.ts:112-125; apps/web/app/api/media/image/generate/route.ts:95-112) |

**Voice**

| Mode | Where it runs | Available | Subscription rule |
| --- | --- | --- | --- |
| Local | Speech recognition on the device. Capture refuses to start if no on-device model exists, so audio is never sent elsewhere. Read-aloud uses device voices for a non-Cloud chat. Live voice is refused in Local | Mobile turn-based voice | None found. [code] (apps/mobile/src/features/voice/services/voiceInput.ts:260-321; liveVoiceAvailability.ts:20-31; readAloudAvailability.ts:38-52) |
| Own key | Unknown | Unknown | Unknown |
| Cloud | `POST /api/voice/speech`, `POST /api/voice/transcribe`, live sessions under `/api/voice/live/sessions` | Yes, signed in | Every tier allows voice. Free: 10 minutes per month. Premium: no monthly cap in the policy. [code] (model-catalog.ts:1233-1257, 1310-1340 region) |

**Tools and code execution**

| Mode | Where it runs | Available | Subscription rule |
| --- | --- | --- | --- |
| Local | On the device: file system, shell, browser, computer use through per-folder or per-app permission prompts (Electron runtime and CLI). Mobile Local tools: [unknown] | Electron, Tauri, CLI | Capabilities default to denied and need a scoped grant. No plan rule found. [code] (packages/contracts/local-runtime/src/capabilities.ts:1-30) |
| Own key | CLI and Tauri run the same local tools; the model is the provider's | CLI, Tauri | Unknown |
| Cloud | Managed sandbox on our servers (the sandbox vendor is referenced as `e2b`) | Yes | Sandboxes per account: Free 2, Basic 5, Premium 10; local-only and byok 0. Chat tools: every tier from free. [code] (billing-catalog.ts:583-680; apps/web/app/api/code/sessions/route.ts:45-58) |

**Connectors**

| Mode | Where it runs | Available | Subscription rule |
| --- | --- | --- | --- |
| Local | Local MCP servers on desktop (`canUseLocalMcp`). A register row says the desktop local and cloud connector split is open | Desktop (Tauri row) | Custom MCP servers: Free 0, Basic 5, Premium 25; local-only and byok unlimited. [code] (capabilities.ts DESKTOP row; billing-catalog.ts:583-680; audit/registers/known-flaws.md:229) |
| Own key | Unknown | Unknown | Unknown |
| Cloud | Our servers hold connector credentials and call outside services (`/api/connectors`) | Yes | `connectors`: PAID_TIERS (Basic and above). Connector tools: Free 0, Basic 50, Premium 150. [code] (billing-catalog.ts:343-364, 617-680) |

**Sync between devices**

| Mode | Where it runs | Available | Subscription rule |
| --- | --- | --- | --- |
| Local | No sync. The only crossing is the manual copy above | Never automatic | None found. The policy says Local never syncs. [requirement] (trust-boundaries.md:1-5) |
| Own key | No sync (contract: syncsAcrossDevices false) | No | Not applicable. [code] (trust-mode-contract.ts:61-69) |
| Cloud | Our servers: chat, memory, project and settings sync | Web, mobile, Electron; Chrome mirrors eligible chats | `cloud_sync`: every tier from free. Mobile sync runs only when the cloud flag is on, mode is Cloud and an account epoch exists. [code] (apps/mobile/services/cloudSyncEngine.ts:92-105) |

**Scheduled tasks**

| Mode | Where it runs | Available | Subscription rule |
| --- | --- | --- | --- |
| Local | Electron has local routines that start the coding agent in a folder, with a separate consent. Mobile Local has none found | Electron | Rule: [unknown]. [code] (dispatcher.ts:730-733, 2679-2683) |
| Own key | Unknown | Unknown | Unknown |
| Cloud | Our servers run the schedule: `/api/schedules` | Yes | Free 0 (error `schedules_not_in_plan`), Basic 3, Premium 5; local-only and byok 0. [code] (apps/web/app/api/schedules/route.ts:41-46; billing-catalog.ts:583-680) |

**Cloud coding**

| Mode | Where it runs | Available | Subscription rule |
| --- | --- | --- | --- |
| Local | Local coding sessions run the bundled CLI on the device | Electron, CLI | Unknown for the local part |
| Own key | CLI session with the user's key | CLI | Unknown |
| Cloud | Managed sandbox on our servers: `/api/code/sessions`; CLI handoff and push under `apps/cli/src/cloud/code_*.rs` | Web, CLI | AGI Code needs a sandbox allowance and a daily harness budget above zero, which starts at Basic. CLI and VS Code Cloud models start at PRO_TIERS. These are two different rules. [code] (billing-catalog.ts:839-842; apps/cli/src/model_catalog.rs:925-960) |

## Implementation map

| Concern | Owner file | Notes |
| --- | --- | --- |
| Shared host classification | file:packages/contracts/trust-boundaries/src/egress-policy.ts | Pure TypeScript. `OUR_CLOUD_HOSTS`, `matchesCloudHost`, `isOurCloudHost`. Test: file:packages/contracts/trust-boundaries/src/__tests__/egress-policy.test.ts |
| Mobile guard | file:apps/mobile/lib/egressGuard.ts | `guardedFetch`, `EgressBlockedError`, carve-outs |
| Mobile API chokepoint | file:apps/mobile/services/api.ts | Passes `authControl`, `withdrawalControl`, `consentedReport` flags to the guard |
| Mobile mode store and admission | file:apps/mobile/src/features/chat/store/appModeStore.ts | Every write passes `admitAppMode` |
| Mobile Cloud door | file:apps/mobile/src/features/chat/store/cloudModeDoor.ts | Asks, admits, leaves Cloud, turns off Ask from Siri |
| Mobile consent record | file:apps/mobile/services/providerConsent.ts | Alert, record, withdrawal marker |
| Mobile remote gate | file:apps/mobile/services/remoteChatGate.ts | Feature flag, `v1LocalOnly` build branch, ignored `byokKeys` |
| Mobile send path | file:apps/mobile/stores/chat/chatExecutionStore.ts | Mode binding, local runtime, cloud branch |
| Mobile on-device inference | file:packages/platform/local-llm/src/index.ts | Package `@agiworkforce/local-llm` |
| Mobile Local-to-Cloud copy | file:apps/mobile/src/features/settings/data-controls/localCloudSyncService.ts | Called from file:apps/mobile/src/features/settings/data-controls/index.tsx |
| Desktop guard (Tauri renderer) | file:apps/desktop/src/lib/egressGuard.ts | Reads file:apps/desktop/src/stores/privacyBoundary.ts. Fails open on an unparseable host |
| Desktop shell refusal | file:apps/desktop/electron/runtime/dispatcher.ts | Refuses `LOCAL_INFERENCE_COMMANDS` listed in file:packages/contracts/local-runtime/src/inference.ts |
| Fork to own key (desktop) | file:apps/desktop/src/features/byok/ByokConversationDialog.tsx | Rust: file:apps/desktop/src-tauri/src/sys/commands/llm.rs (`llm_create_byok_fork`) |
| Fork to own key (web) | file:apps/web/features/chat/lib/localByokHandoff.ts | Dialog: file:packages/ui/unified-chat/src/components/LocalByokHandoffDialog.tsx |
| Preview and redaction | file:packages/platform/utils/src/privacyHandoff.ts | `buildLocalToByokHandoffDraft` |
| Mode contract | file:packages/contracts/types/src/trust-mode-contract.ts | `TRUST_MODE_CONTRACTS`, `refuseTrustTransition` (no caller) |
| Server crossing decision | file:apps/web/lib/server/trust-boundary-crossing.ts | `evaluateProviderEgress`; its only product caller is file:apps/web/lib/managed-compute-gate.ts (`buildProviderEgressGateResponse`) |
| Plan capabilities and limits | file:packages/contracts/types/src/billing-catalog.ts | `BILLING_PLAN_CAPABILITY_TIERS`, `BILLING_PLAN_PRODUCT_LIMITS`, `PAID_TIERS`, `PRO_TIERS` |
| Surface capability rows | file:packages/contracts/types/src/capabilities.ts | `PLATFORM_CAPABILITIES` for web, desktop, mobile |
| Capability handshake | file:apps/web/lib/services/capability-handshake-service.ts | Four layers: model, tier, surface, settings |
| Surface to plan rule | file:apps/web/lib/free-chat-surface-policy.ts | Maps a calling app to `managed_chat`, `developer_surfaces` or `managed_api` |
| Harness catalog | file:packages/ai/model-registry/catalog/harnesses.json | Implementation status per runtime profile; its VS Code Local and own-key profiles say `unwired` and lag the extension |
| VS Code Local and own key | file:apps/extension-vscode/src/integrations/localRuntimeClient.ts | Local model list for Ollama and LM Studio; own-key sign-in runs the CLI login in file:apps/extension-vscode/src/providers/terminalProvider.ts |
| CI proof runner | file:scripts/check-trust-boundaries.mjs | Runs seven surface proofs and a native-diagnostics check |
| Renderer fetch guard | file:scripts/check-desktop-local-egress.mjs | Fails any renderer `fetch` not made through the guard |

Provider adapters that exist as package folders: provider:ollama, provider:lmstudio (local); provider:openai, provider:anthropic, provider:openrouter and others (own key or managed). The catalog file holds which models exist; this page names none.

## Data and state

| Item | Where it lives | Meaning |
| --- | --- | --- |
| Mobile app mode | store:chat-app-mode-store (persisted in device key-value storage) | `local` or `cloud`; default `local`. [code] (appModeStore.ts:60-66) |
| Mobile provider consent | store:agi:cloud-provider-consent:v1 | Owner id, covered provider ids, time, surface. [code] (providerConsent.ts:58-62) |
| Mobile consent withdrawal marker | store:agi:cloud-provider-consent:withdrawing | Written first; read at launch to finish a half-done withdrawal. [code] (providerConsent.ts:111-175) |
| Mobile local chats | store:chat-message-store-local | Device only. [code] (apps/mobile/stores/chat/chatMessageStore.ts:1729) |
| Mobile cloud chats | store:chat-message-store-cloud | Mirror of the account's chats. [code] (apps/mobile/stores/chat/chatCloudMessageStore.ts:313) |
| Mobile cloud memory and projects | store:memory-store-cloud, store:projects-store-cloud | Mirrors. [code] (cloudMemoryStore.ts:69; cloudProjectStore.ts:173) |
| Mobile local projects | store:project-store | Device only. [code] (apps/mobile/src/features/projects/store.ts:608) |
| Desktop app mode | local storage key `app-mode-store` | `mode` and `hasSelectedMode` persisted. [code] (apps/desktop/src/stores/appModeStore.ts:60-78) |
| Tauri own-key fork | Local SQLite via `create_conversation_with_execution_mode` | New conversation with execution mode byok and only approved messages. [code] (llm.rs:1250-1277) |
| Server audit of crossings | Audit events, resource `provider-egress:<mode>` | Each decision is recorded; refusal recorded as `provider_egress_refused`. [code] (trust-boundary-crossing.ts:58-84; managed-compute-gate.ts:320-345) |
| Plan limits | Static tables in the types package | Not a database table. Live account plan comes from the entitlement resolver (see SYS-subscription-entitlements, not opened). |

Mode contract values: [code] (packages/contracts/types/src/trust-mode-contract.ts:50-80)

| Mode | Storage | Key attribution | Fallback | Our cloud allowed | Syncs across devices |
| --- | --- | --- | --- | --- | --- |
| local | device | none | refuse | no | no |
| byok | user-provider | user-key | same trust boundary | no | no |
| managed | managed-cloud | platform-key | any eligible route | yes | yes |

## Rules: access, plans, modes

**Plan catalog.** Tiers and capability sets: [code] (packages/contracts/types/src/billing-catalog.ts:332-364). Labels: basic is Basic, pro is Premium, max is Max, max_15x is Ultra.

| Capability | Plans that include it |
| --- | --- |
| managed_chat, chat_tools, projects, memory_personalization, skills, cloud_sync | plan:free, plan:basic, plan:pro, plan:max, plan:max_15x, plan:team, plan:team_premium, plan:enterprise |
| connectors, remote_control | PAID_TIERS: plan:basic and every higher plan (not free) |
| agi_work, deep_research, image_generation, managed_api, developer_surfaces, slack_app, artifact_connectors | PRO_TIERS: plan:pro and every higher plan (pro, max, max_15x, team, team_premium, enterprise) |
| video_generation | plan:max_15x and plan:enterprise only |
| team_admin | plan:team, plan:team_premium, plan:enterprise |
| enterprise_controls | plan:enterprise |

plan:local-only and plan:byok are in the catalog as free tiers with unlimited projects and custom MCP servers and zero sandboxes and scheduled tasks. They hold none of the capabilities above. [code] (billing-catalog.ts:166-178, 583-616)

**Rules that bind the modes**

1. Local needs no plan. Mobile Local chat has no account, plan or entitlement check on its path. Only an on-device age confirmation, a downloaded model and the app's own gates apply. VS Code Local and own key likewise need no AGI account or plan. [code] (chatExecutionStore.ts:2262-2290, 2373; rootRouting.ts:30-60; apps/extension-vscode/README.md:~35-38)
2. Cloud requires sign-in. On mobile it also requires the current provider consent and the cloud feature flag; a build with `v1LocalOnly` set blocks Cloud without an explicit unlock. [code] (chatExecutionStore.ts:2349-2385; remoteChatGate.ts:3-8)
3. An app is mapped to a plan capability before a Cloud chat is served: web, mobile, desktop and Chrome use `managed_chat`; CLI and VS Code use `developer_surfaces`; the open API uses `managed_api`. A token bound to no app gets no capability and fails closed. This means the same Free or Basic account gets Cloud chat on four apps and none on CLI and VS Code. It is not one uniform subscription check, which departs from the requirement that every app connects to one subscription system with one set of access rules; whether this is intended is [unknown]. [code] (apps/web/lib/free-chat-surface-policy.ts:42-52, 96-113)
4. The CLI hides every managed model from Free, Basic and own-key accounts. Local and own-key models are never gated by tier. [code] (apps/cli/src/model_catalog.rs:925-960)
5. The capability handshake grants a capability only if all four layers grant it: model, tier, surface, settings. A missing grant fails closed. [code] (packages/contracts/types/src/capability-handshake/registry.ts:45-70; capability-handshake-service.ts:112-125)
6. A credential found in a payload refuses the provider call in every mode, including Cloud. Own-key mode refuses a route that would use the platform key. Local refuses every fallback unless a person approved it. [code] (trust-boundary-crossing.ts:86-134)
7. Operator kill switch `AGI_MANAGED_COMPUTE_PRIVATE_BETA` can refuse Cloud compute for everyone. It is on unless set to `0`, `false` or `off`. [code] (apps/web/lib/managed-compute-gate.ts:39-53, 61-70)
8. Transitions: tightening a mode needs no approval; loosening always does. This rule is written as `refuseTrustTransition`. No product code calls it (see Gaps). [code] (trust-mode-contract.ts:123-137)
9. Own-key and Local conversations never fall into managed routing silently on the server: `fallback-leaves-trust-boundary` and `platform-key-not-permitted` refusals exist. [code] (trust-boundary-crossing.ts:24-29, 120-134)
10. The declared tier policy lists which provider surfaces a tier may use, and Free lists only managed cloud. No code reads that field. So the rule "own key is a paid feature" is not enforced from it. [code] (model-catalog.ts:1088, 1245, 1401; grep found no reader)

## Differences between apps

| Topic | surface:mobile | surface:web | surface:desktop | surface:cli | surface:vscode | surface:chrome |
| --- | --- | --- | --- | --- | --- | --- |
| Local mode | On-device model | Code present, reach unknown | Electron refuses (decision D-2026-09-15-04); Tauri partial | Loopback servers, partial | Yes, through the CLI app-server (Ollama, LM Studio); the harness catalog says unwired and lags | Not offered (a local browser-task profile exists) |
| Own key | None | Policy none; fork code exists | Tauri only | Yes | Yes, through the CLI login; the harness catalog says unwired and lags | None |
| Cloud | Needs consent and sign-in | Yes | Yes (hosted web app) | PRO_TIERS only | PRO_TIERS only | Yes |
| Egress guard | `guardedFetch` with carve-outs; fails closed | None found; the app is cloud-hosted | `guardedFetch` in Tauri renderer, CI check; fails open on an unparseable host | Rust egress policy in the Tauri crate; CLI own policy: [unknown] | [unknown] | Origin allow-list test |
| Consent to move up | Entry alert; manual copy | Fork dialog | Fork dialog; folder sheet | Redacted continuation | Not opened | Not applicable |
| Surface capability row | `canUseLocalModels` is false even though the app runs on-device models | `canUseLocalModels` false | true | Not in the matrix | Not in the matrix | Not in the matrix |

Surface capability rows exist only for web, desktop and mobile. [code] (packages/contracts/types/src/capabilities.ts:41-136, 138-150)

Other differences found:

- Mobile guard error text says Local is "on-device + BYOK only", but mobile has no own-key mode. [code] (apps/mobile/lib/egressGuard.ts:29-33)
- Desktop guard comment says the Local workspace includes BYOK. That is correct for Tauri, where an own-key chat is a local-position conversation. [code] (egressGuard.ts:47-52; execution-profile.ts:12-20)
- The two fork dialogs differ. The web build blocks confirmation when the scanner finds a secret. The Tauri own-key fork passes `blockOnFindings: false`, so it redacts and lets the person confirm. The folder-to-Cloud sheet passes `true`. [code] (privacyHandoff.ts:147; ByokConversationDialog.tsx:113-130; CloudFolderAttachSheet.tsx:173-182)
- Chrome mirrors a signed-in conversation to the shared store only when every turn ran in Managed Cloud. Any Local, own-key or unknown turn disqualifies it for good. [requirement] (trust-boundaries.md:46); implementation: [unknown]
- On the Free plan the Electron Desktop, web and mobile Cloud get the same chat capability; the CLI and VS Code do not. [code] (free-chat-surface-policy.ts:96-113)

## Failure handling

| Situation | What happens | Basis |
| --- | --- | --- |
| Mode cannot be read (mobile) | Treated as Local; our-cloud request blocked | [code] (apps/mobile/lib/egressGuard.ts:87-98) |
| Mode cannot be read (desktop renderer) | Treated as private; a request to a listed host is blocked | [code] (apps/desktop/src/stores/privacyBoundary.ts:3-8) |
| Host cannot be parsed (desktop renderer) | Not blocked; the request goes to `fetch` | [code] (apps/desktop/src/lib/egressGuard.ts:23-45, 56-67) |
| Consent cannot be read | Treated as not allowed | [code] (egressGuard.ts:100-110) |
| Withdrawal state cannot be read | Treated as in progress | [code] (egressGuard.ts:112-122) |
| Blocked request | `EgressBlockedError` thrown before network I/O; message is for logs, not screens. Mobile code `EGRESS_BLOCKED_LOCAL_MODE` | [code] (egressGuard.ts:24-37; apps/desktop/src/lib/egressGuard.ts:13-21) |
| Person declines the consent alert | App stays Local; send returns false with no error banner | [code] (cloudModeDoor.ts:57-73; chatExecutionStore.ts:2376-2385) |
| Consent withdrawal interrupted by a crash | Marker survives; next launch closes Cloud and finishes the withdrawal | [code] (providerConsent.ts:159-175; cloudModeDoor.ts:166-175) |
| Consent belongs to another account, or the account signed out | Not current; Cloud refuses | [code] (providerConsent.ts:208-217; apps/mobile/__tests__/trust-boundary.test.ts:219-290) |
| Local chat, Cloud model chosen (or the reverse) | Send refused with a message to start a separate chat | [code] (chatExecutionStore.ts:2262-2285) |
| No on-device model ready | Local send refused with a message pointing to Models | [code] (chatExecutionStore.ts:460, 1294) |
| Local chat regenerate with an own-key model (web) | Refused with an explanation; send again to open the fork dialog | [code] (localByokHandoff.ts:105-118) |
| Fork preview expired (Tauri) | Confirm is refused and the person must rebuild the preview | [code] (ByokConversationDialog.tsx:12, 138-145) |
| Secret found in payload | Provider call refused in all modes; web fork cannot confirm | [code] (trust-boundary-crossing.ts:115-118; privacyHandoff.ts:147) |
| Fallback would leave the trust boundary | Refused with 403 `fallback_leaves_trust_boundary` | [code] (managed-compute-gate.ts:295-300) |
| Kill switch engaged | 403 `managed_compute_private_beta`, message suggests Local or own key | [code] (managed-compute-gate.ts:70-86) |
| Plan lacks schedules | `schedules_not_in_plan` when the limit is 0; `schedule_limit_reached` otherwise | [code] (apps/web/app/api/schedules/route.ts:41-46) |
| Mobile account action in Local that is not on the carve-out list | Refused at the guard; the person only sees that it did not work (register row) | [code] (audit/registers/known-flaws.md:340) |
| Electron asked for local inference | Returns `unsupported-platform` with a message that every conversation is in the cloud | [code] (dispatcher.ts:3242, 3366-3367) |

## How it should work

Statements marked [requirement] come from project documents. Statements marked [proposed] are suggestions of this page, not decisions.

1. **Local is free and needs no account.** [requirement] (docs/product/requirements.md:478-486). The mobile code matches this. The Electron code does not match the stated requirement that desktop local inference is free of a subscription: it removes local inference from the public Desktop by a recorded decision (D-2026-09-15-04, cited at dispatcher.ts:3235-3241). Whether the founder wants that decision reversed is not settled in the code. [unknown]
2. **A crossing needs eight things.** User action, context selection, secret scan, payload preview, provider label, retention and cost disclosure, consent, a new branch that preserves the original. [requirement] (requirements.md:7.4). The web fork dialog covers most of these; retention and cost disclosure were not found in the dialog. The Tauri fork lacks a provider label and does not block on secrets. The mobile manual copy shows counts and limits only.
3. **Every crossing should be one code path.** [proposed] `refuseTrustTransition` already states the rule (loosening needs an approval), and `evaluateProviderEgress` already enforces key attribution on the server. A single client-side helper that every app's fork dialog must call, and a guard that fails when a dialog is built without a provider label, would turn the written rule into an enforced one.
4. **Plan rules should be read from one table.** [proposed] Own-key use is declared as paid in a tier policy field that nothing reads. Either enforce it or delete it. The product statement says own key and local models are not subscription features, which is the behavior the CLI code has.
5. **One subscription rule across apps.** [requirement] (task brief: every app connects to one subscription system). [proposed] Decide whether CLI and VS Code Cloud chat should keep a Premium-and-above rule while the other four apps allow Free; if yes, record it as a decision, if not, align `free-chat-surface-policy.ts`.
6. **Fail closed on an unparseable host.** [proposed] The desktop renderer guard could block a private-mode request whose host it cannot determine, or resolve relative URLs against the page origin first.
7. **Docs follow code.** [requirement] (AGENTS.md section 2: prose is rank 6). The trust-boundaries table should be edited where it disagrees with the code. For VS Code the policy table agrees with the code and the harness catalog profiles for VS Code Local and own key are the entries to correct.

## Gaps

Implementation status is separate from verification status. Nothing here was run by this pass. No project document found records a live run of these paths. [unknown]

| # | Gap | Implementation | Basis |
| --- | --- | --- | --- |
| 1 | `refuseTrustTransition` is exported and tested but no product file calls it. It appears only in a support-claims file | Not connected | [code] (grep across apps and packages; apps/web/content/support/support-claims.json:3877) |
| 2 | `evaluateProviderEgress` has one product caller: `buildProviderEgressGateResponse` in apps/web/lib/managed-compute-gate.ts (import line 14, call line 325). That wrapper is used by three product files: artifact completion, the experiential-free completions route and the free-quota turn. Whether the main chat completions route reaches the check through another path was not traced | Partly connected | [code] (grep of evaluateProviderEgress and buildProviderEgressGateResponse; managed-compute-gate.ts:14, 325) |
| 3 | `allowedProviderSurfaces` in the tier policy has no reader | Declared, not enforced | [code] (model-catalog.ts:1088, 1401) |
| 4 | Ask from Siri sends the spoken question to Cloud while the app shows Local, as long as consent is current. The owner has not decided whether switching to Local turns it off. The register says the deviation is recorded in trust-boundaries.md; that file has no such section | Open | [code] (audit/registers/known-flaws.md:342) |
| 5 | Manual copy of Local chats to Cloud exists on mobile. Store copy and the privacy pages do not mention it. No secret scan or payload preview found in the code read | Exists | [code] (data-controls/index.tsx:145-235; known-flaws.md:312-313) |
| 6 | The CLI Local-to-cloud continuation copies the Local session title, which can hold the start of a private message. The consent draft lists message text, not the title | Open (register) | [code] (known-flaws.md:412) |
| 7 | Electron Desktop refuses on-device inference (by decision D-2026-09-15-04) while the product requirement says desktop local inference is free | Conflicts with the stated requirement | [code] (dispatcher.ts:3235-3244, 3366-3367); [requirement] (task brief) |
| 8 | Mobile surface row says `canUseLocalModels` is false while mobile runs on-device models | Inconsistent data | [code] (capabilities.ts:106-136) |
| 9 | Local on mobile still reaches outside services: on-device model downloads go through the model library's fetcher, not the guard; sign-in goes through the auth SDK | By design for sign-in; downloads [inferred] | [code] (apps/mobile/index.ts:3-6; packages/platform/local-llm/src/catalog.ts:4-12) |
| 10 | Tests that do not test the product: the extension test sets constants such as `extensionRunsLLM = false` and asserts them; the web file starts with a self-defined tier order that uses a tier name (`hobby`) that is not in the plan catalog. The mobile test does import and run the real guard | Weak proof for Chrome | [code] (apps/extension/__tests__/trust-boundary.test.ts:52-61; apps/web/__tests__/trust-boundary.test.ts:16-29; apps/mobile/__tests__/trust-boundary.test.ts:24-51) |
| 11 | CI runs `check:trust-boundaries` (seven proofs, including a Rust routing test and a send-message test, and a text check that no remote crash reporting is in the Tauri crate) and `check:rust-egress-boundary`; `check:desktop-local-egress` is in the guard chain. Never run in this pass | Present; unverified here | [code] (.github/workflows/ci.yml:130, 932; scripts/check-trust-boundaries.mjs:8-67) |
| 12 | The Rust allow-list of files allowed to make their own HTTP calls is 22 files long. One register row says a native OAuth refresh creates its own client. Public reachability is unverified | Open | [code] (scripts/check-rust-egress-boundary.mjs:10-33; known-flaws.md:247) |
| 13 | Chrome: policy says Cloud only, but a local browser-task profile exists and the test text says inference runs on desktop | Unclear | [code] (harnesses.json chrome profiles) |
| 14 | The harness catalog marks VS Code Local and own key `unwired`, but the extension supports both through the CLI: a local model list for Ollama and LM Studio, and a provider sign-in that runs the CLI login, with no AGI subscription needed. The policy table is right and the catalog flag lags the code | Catalog behind code | [code] (packages/ai/model-registry/catalog/harnesses.json:703-725; apps/extension-vscode/src/integrations/localRuntimeClient.ts:~720-745; apps/extension-vscode/src/providers/terminalProvider.ts:~383-404; apps/extension-vscode/README.md:~35-38; trust-boundaries.md:38-45) |
| 15 | Cloud-chat actions (retry, edit) from a Local session refuse silently at the guard instead of asking to enter Cloud | Low severity, open | [code] (known-flaws.md:340) |
| 16 | The desktop renderer guard fails open for a host it cannot parse (for example a relative URL), while the page and the shared policy describe the guard as fail-closed. The CI script that bans bare renderer `fetch` does not cover this case | Open | [code] (apps/desktop/src/lib/egressGuard.ts:23-45, 56-67) |
| 17 | Cloud chat rule differs by app: web, mobile, desktop and Chrome need `managed_chat` (all tiers), CLI and VS Code need `developer_surfaces` (PRO_TIERS). This departs from the requirement of one subscription rule across apps; whether intended is unknown | Implemented as split | [code] (free-chat-surface-policy.ts:96-113; billing-catalog.ts:341-360) |
| 18 | Mobile `v1LocalOnly` build shape exists in the remote-chat gate; no released build sets it | Dormant branch | [code] (apps/mobile/services/remoteChatGate.ts:3-8) |

## How to verify

Nothing below was run by this pass. These are the commands and files to use.

1. **Shared host list.** `pnpm --filter @agiworkforce/trust-boundaries test` runs `egress-policy.test.ts`. Check that a BYOK provider host is not on the list.
2. **All surface proofs together.** `pnpm check:trust-boundaries` (script `scripts/check-trust-boundaries.mjs`). It runs the web, extension, mobile, VS Code, types, Rust routing and Rust send-message proofs, then fails if a Tauri crate pulls in a remote crash reporter.
3. **Mobile only.** Run `trust-boundary.test` in `apps/mobile` in small chunks (the project notes the test runner can hang and exhaust memory). Look at the cases named Local content-report consent, Cloud Mode permission, withdrawal and age check.
4. **Desktop renderer.** `pnpm check:desktop-local-egress` fails a bare `fetch` in the renderer. `pnpm check:rust-egress-boundary` checks the Tauri crate. Add a case for a relative URL in private mode to see the fail-open behaviour.
5. **Plan rules.** Read `BILLING_PLAN_CAPABILITY_TIERS`, `PAID_TIERS`, `PRO_TIERS` and `BILLING_PLAN_PRODUCT_LIMITS` in `billing-catalog.ts`. For a live account, call `GET /api/me` and read the capability handshake document (`granted`, `deniedBy`, `denialReasons`).
6. **By hand (human check, as the project prefers).** In the mobile app: (a) stay in Local, send a message, confirm no request to the web hosts appears in a proxy; (b) switch to Cloud, confirm the alert names the providers; (c) decline, confirm the app stays Local; (d) withdraw, confirm Cloud closes and schedules pause. In the web app: start a Local chat if reachable, pick an own-key model, confirm the dialog appears with the provider name.
7. **Open questions to settle by running:** whether the web build can reach the Local path at all; whether the main chat route calls the server crossing check; whether an own-key plan is needed on any app.

A green result of any of these says nothing about a build a person installed. The guards read the working tree, not a commit (AGENTS.md section 12).

## Key facts

| Fact | Basis | Source |
|---|---|---|
| One shared, platform-free list of our-cloud hosts (web domain, Vercel, Neon, four Clerk domains) is the single source for every device guard. Matching is suffix-based, case-insensitive and trailing-dot tolerant. | read in the code | `packages/contracts/trust-boundaries/src/egress-policy.ts:32-64` |
| BYOK provider hosts are deliberately not on the our-cloud list, so direct own-key calls are never blocked. | read in the code | `packages/contracts/trust-boundaries/src/egress-policy.ts:25-29` |
| The mobile guard treats Cloud as open only when appMode is cloud and the signed-in account's provider consent is current. Otherwise any our-cloud host throws EgressBlockedError before network I/O. It fails closed when mode, consent or withdrawal state cannot be read. | read in the code | `apps/mobile/lib/egressGuard.ts:72-126`; `apps/mobile/lib/egressGuard.ts:336-357` |
| In mobile Local mode only three classes of request reach our servers: signed-in account controls, withdrawal controls, and one content report the person sends with its own Send tap. | read in the code | `apps/mobile/lib/egressGuard.ts:215-253`; `apps/mobile/lib/egressGuard.ts:280-303`; `apps/mobile/lib/egressGuard.ts:343-347` |
| The desktop renderer egress guard fails open for a target whose host cannot be parsed: extractHost returns null on a parse error and the guard throws only for a non-null host on the our-cloud list. A relative-path request in private mode is not blocked by this guard. | read in the code | `apps/desktop/src/lib/egressGuard.ts:23-45`; `apps/desktop/src/lib/egressGuard.ts:56-67` |
| The mobile consent alert is titled 'Share with AI providers?' and names every provider the app can route to. Consent is stored per account with the provider ids covered, and is not current if a new provider has been added or a withdrawal is in progress. | read in the code | `apps/mobile/services/providerConsent.ts:81-90`; `apps/mobile/services/providerConsent.ts:208-217`; `apps/mobile/services/providerConsent.ts:270-287` |
| Every write to the mobile app mode passes one admission function, so the mode cannot be Cloud without current consent. Declining keeps Local. Withdrawal returns to Local, pauses schedules and runs, and turns off Ask from Siri. | read in the code | `apps/mobile/src/features/chat/store/appModeStore.ts:17-51`; `apps/mobile/src/features/chat/store/cloudModeDoor.ts:94-108`; `apps/mobile/src/features/chat/store/cloudModeDoor.ts:151-176` |
| A mobile conversation keeps its mode. A Local chat refuses Cloud models and a Cloud chat refuses local models; there is no in-app continuation from Local to Cloud. The only crossing is a manual, confirmed copy of selected chats' text, done in Cloud mode. | read in the code | `apps/mobile/stores/chat/chatExecutionStore.ts:2262-2285`; `apps/mobile/src/features/settings/data-controls/index.tsx:145-235` |
| Mobile has no own-key mode. The remote-chat gate accepts a byokKeys flag and never consults it. | read in the code | `apps/mobile/services/remoteChatGate.ts:6-14` |
| The mobile remote-chat gate has a v1LocalOnly build flag; when set, Cloud is blocked without an explicit unlock. No released build sets it. | read in the code | `apps/mobile/services/remoteChatGate.ts:3-8` |
| Mobile Local chat needs no AGI account or plan on its path; the router lets a signed-out user into the app after onboarding and an on-device age confirmation. | read in the code | `apps/mobile/src/features/auth/services/rootRouting.ts:30-60`; `apps/mobile/stores/chat/chatExecutionStore.ts:2262-2290`; `apps/mobile/stores/chat/chatExecutionStore.ts:2373` |
| The public Electron Desktop shell refuses every local-inference command with 'unsupported-platform'. The code names decision D-2026-09-15-04 (desktop chat is Cloud-only) as the reason, and says local coding sessions reach local models through the bundled CLI. This conflicts with the stated product requirement that desktop local inference is free. | read in the code | `apps/desktop/electron/runtime/dispatcher.ts:3235-3244`; `apps/desktop/electron/runtime/dispatcher.ts:3366-3367`; `packages/contracts/local-runtime/src/inference.ts:3-10` |
| The desktop renderer guard reads the privacy mode; anything not 'managed', or an exception while reading it, counts as private. A script fails any renderer file that calls fetch directly. | read in the code | `apps/desktop/src/stores/privacyBoundary.ts:3-8`; `scripts/check-desktop-local-egress.mjs:30-70` |
| The shared preview builder redacts secrets, hashes the payload, sets consentRequired true and marks the preview blocked when findings exist and blockOnFindings is on (default on). The Tauri own-key fork passes blockOnFindings false and no provider label; the folder-to-Cloud sheet passes true and the label 'AGI Managed Cloud'. | read in the code | `packages/platform/utils/src/privacyHandoff.ts:111-167`; `apps/desktop/src/features/byok/ByokConversationDialog.tsx:113-130`; `apps/desktop/src/features/context-handoff/CloudFolderAttachSheet.tsx:173-182`; `apps/desktop/src/features/context-handoff/CloudFolderAttachSheet.tsx:258-273` |
| On web, sending from a Local chat to a direct own-key model opens a consent dialog instead of sending, and regenerate is refused. The dialog shows 'Local to Direct BYOK' with the provider name and says the Local thread is unchanged. | read in the code | `apps/web/features/chat/lib/localByokHandoff.ts:55-118`; `apps/web/features/chat/pages/WebChatPage.tsx:4456`; `apps/web/features/chat/pages/WebChatPage.tsx:7971-7975`; `packages/ui/unified-chat/src/components/LocalByokHandoffDialog.tsx:75-110` |
| The Tauri Rust command llm_create_byok_fork stores only the already-approved messages as a new own-key conversation and leaves the Local conversation untouched; it does not itself check that consent was given. | read in the code | `apps/desktop/src-tauri/src/sys/commands/llm.rs:1211-1277` |
| The server mode contract defines Local as device storage, no key, fallback refuse; own key as user-provider storage, user key, same-boundary fallback; managed as managed-cloud storage, platform key, sync across devices. | read in the code | `packages/contracts/types/src/trust-mode-contract.ts:50-80` |
| refuseTrustTransition (loosening a mode needs approval) is exported but no product file calls it; only a support-claims file names it. | read in the code | `packages/contracts/types/src/trust-mode-contract.ts:123-137`; `apps/web/content/support/support-claims.json:3877` |
| evaluateProviderEgress refuses a provider call that carries a secret, uses a platform key under an own-key conversation, or uses an unapproved or boundary-leaving fallback; every decision produces an audit event. Its only direct product caller is buildProviderEgressGateResponse in managed-compute-gate.ts, which three product files use (artifact completion, experiential-free completions route, free-quota turn). | read in the code | `apps/web/lib/server/trust-boundary-crossing.ts:86-152`; `apps/web/lib/managed-compute-gate.ts:14`; `apps/web/lib/managed-compute-gate.ts:325`; `apps/web/app/api/artifacts/runtime/artifact-completion.ts`; `apps/web/app/api/models/experiential-free/completions/route.ts`; `apps/web/lib/server/free-quota-turn.ts` |
| Code plan tiers are free, basic, pro, max, max_15x, team, team_premium, enterprise (plus local-only and byok at zero price). Labels shown to people: basic is Basic, pro is Premium, max is Max, max_15x is Ultra. PAID_TIERS means basic and above; PRO_TIERS means pro, max, max_15x, team, team_premium, enterprise. | read in the code | `packages/contracts/types/src/billing-catalog.ts:5-16`; `packages/contracts/types/src/billing-catalog.ts:332-341` |
| Plan capabilities: chat, tools, projects, memory, skills and sync are in every tier from free; connectors and remote control are PAID_TIERS; AGI Work, deep research, image generation, managed API and developer surfaces are PRO_TIERS; video only max_15x and enterprise. | read in the code | `packages/contracts/types/src/billing-catalog.ts:343-364` |
| Which plan capability a Cloud chat needs depends on the calling app: web, mobile, desktop and Chrome need managed_chat (all tiers from free); CLI and VS Code need developer_surfaces (PRO_TIERS); the open API needs managed_api. A token bound to no app gets none. So a Free or Basic account gets Cloud chat on four apps and not on CLI or VS Code: not one uniform subscription check. | read in the code | `apps/web/lib/free-chat-surface-policy.ts:42-52`; `apps/web/lib/free-chat-surface-policy.ts:96-113`; `apps/cli/src/model_catalog.rs:925-960` |
| Plan limits by tier: Free has 5 projects, 5 uploads per day, 0 custom MCP servers, 0 connector tools, 2 sandboxes, 0 scheduled tasks and no coding-agent budget; Basic has 3 scheduled tasks and 5 sandboxes; Premium (pro) has 5 scheduled tasks and 10 sandboxes. local-only and byok tiers have 0 sandboxes and 0 scheduled tasks. | read in the code | `packages/contracts/types/src/billing-catalog.ts:583-680` |
| AGI Code (cloud coding) is included when a plan has both a sandbox allowance and a daily coding-agent budget above zero, which starts at Basic. This differs from the PRO_TIERS rule for CLI and VS Code Cloud models. | read in the code | `packages/contracts/types/src/billing-catalog.ts:839-842`; `apps/cli/src/model_catalog.rs:925-960` |
| Every product tier allows web search and voice. Free has no manual model selection, no image or video generation, and 10 voice minutes per month. | read in the code | `packages/contracts/types/src/model-catalog.ts:1233-1257` |
| The tier policy declares which provider surfaces each tier may use (Free: managed cloud only), but no code reads that field, so own-key use is not blocked by it. | read in the code | `packages/contracts/types/src/model-catalog.ts:1088`; `packages/contracts/types/src/model-catalog.ts:1245`; `packages/contracts/types/src/model-catalog.ts:1401` |
| Mobile live voice, web search, deep research, cloud code execution and Cloud-side memory are reached only in the Cloud branch of the send path. Turn-based speech capture on mobile requires an on-device recognizer and refuses otherwise. | inferred | `apps/mobile/stores/chat/chatExecutionStore.ts:3237-3262`; `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:20-31`; `apps/mobile/src/features/voice/services/voiceInput.ts:260-321` |
| Mobile Cloud sync, product analytics and Cloud memory run only in Cloud mode; the mobile sync engine also needs an account epoch. | read in the code | `apps/mobile/services/cloudSyncEngine.ts:92-105`; `apps/mobile/services/productAnalytics.ts:30-35` |
| The CLI discovers local models on loopback addresses (Ollama and LM Studio defaults) and never gates local or own-key models by plan; it hides every managed model from Free, Basic and own-key accounts. | read in the code | `apps/cli/src/local_models.rs:5-6`; `apps/cli/src/model_catalog.rs:925-960` |
| VS Code supports Local through the CLI app-server (local model list for Ollama and LM Studio) and own key through the provider sign-in command that runs the CLI login. Neither needs an AGI account or plan; only Cloud models need a Premium-or-higher plan. The harness catalog marks vscode/local-chat and vscode/byok-chat as unwired, which lags the implementation. | read in the code | `apps/extension-vscode/src/integrations/localRuntimeClient.ts:~720-745` (not found); `apps/extension-vscode/src/providers/terminalProvider.ts:~383-404` (not found); `apps/extension-vscode/README.md:~35-38` (not found); `packages/ai/model-registry/catalog/harnesses.json:703-725` |
| CI runs check:trust-boundaries (seven surface proofs plus a no-remote-crash-reporting check on the Tauri crate) and check:rust-egress-boundary. This pass ran none of them. | read in the code | `scripts/check-trust-boundaries.mjs:8-67`; `.github/workflows/ci.yml:130`; `.github/workflows/ci.yml:932` |
| The harness catalog marks mobile Local, desktop Local and CLI Local as partial, marks VS Code Local and own key as unwired (a flag that lags the extension, which supports both through the CLI), and records Cloud as implemented on web, desktop, mobile, CLI, VS Code and Chrome. | read in the code | `packages/ai/model-registry/catalog/harnesses.json (runtimeProfiles)`; `packages/ai/model-registry/catalog/harnesses.json:703-725`; `docs/generated/trust-mode-surface-matrix.md` |

## Open questions

- Challenge: 'evaluateProviderEgress is called by three routes'. Right in substance and corrected. The grep shows one direct product caller (apps/web/lib/managed-compute-gate.ts, import line 14, call line 325). The three product files (artifact completion, experiential-free completions route, free-quota turn) call the wrapper buildProviderEgressGateResponse. Whether the main chat completions route reaches it is still not traced.
- Challenge: plan labels such as Premium are not code tiers. Right and corrected. The page now gives the code tiers and the sets PAID_TIERS and PRO_TIERS (billing-catalog.ts:332-341), with labels mapped once. The label mapping (pro is Premium, max_15x is Ultra) comes from billing-catalog.ts:5-16 and 166-232 read in the earlier pass; it was not re-opened here.
- Challenge: desktop renderer guard fails open on an unparseable host. Confirmed in apps/desktop/src/lib/egressGuard.ts:23-45 and 56-67 and added as Gap 16. Whether any renderer code can issue a relative-URL request that reaches our servers in private mode was not traced.
- Challenge: Electron Desktop is Cloud-only by recorded decision D-2026-09-15-04. Confirmed at dispatcher.ts:3235-3244; the page now names the decision in the app table and Gap 7. The decision document itself was not opened.
- Challenge: mobile v1LocalOnly flag. Confirmed at remoteChatGate.ts:3-8 and added as Gap 18. No released build sets it, per the code comment; build configuration was not checked.
- Challenge: split subscription rule between apps is not flagged as a departure from the one-subscription requirement. Confirmed and flagged in Rules item 3, Gap 17 and How it should work item 5. Whether the split is intended is unknown.
- Not re-verified in this pass: all other line citations carried over from the first draft; only the challenged points were re-opened. Nothing was run.
- Whether the web build can reach the Local path or the Local-to-own-key fork in a plain browser is unknown.
- Whether an own-key plan is required on any app other than the CLI and VS Code (which need none) is unknown, because allowedProviderSurfaces has no reader.

## Project documents found out of date

- `docs/architecture/trust-boundaries.md`: The policy table (lines 36-45) presents Local, own key and Cloud as uniform capabilities per app. The code says: Mobile and desktop Local and CLI Local are partial. The Electron shell refuses local inference outright, and CLI and VS Code Cloud chat need PRO_TIERS while other apps need only managed_chat. The policy's VS Code Local and own-key entries match the code. (apps/desktop/electron/runtime/dispatcher.ts:3235-3244; apps/web/lib/free-chat-surface-policy.ts:96-113; apps/extension-vscode/README.md:~35-38)
- `packages/ai/model-registry/catalog/harnesses.json (vscode/local-chat and vscode/byok-chat, lines 703-725)`: Both profiles have status 'unwired'. The code says: The VS Code extension supports Local through the CLI app-server (Ollama, LM Studio) and own key through the CLI login, with no AGI subscription needed. The catalog flag lags the implementation. (apps/extension-vscode/src/integrations/localRuntimeClient.ts:~720-745; apps/extension-vscode/src/providers/terminalProvider.ts:~383-404; apps/extension-vscode/README.md:~35-38)
- `audit/registers/known-flaws.md (Ask from Siri row, line 342)`: Says the Ask from Siri deviation is recorded in docs/architecture/trust-boundaries.md. The code says: That file has no such section (found in the earlier pass; not re-checked here). (audit/registers/known-flaws.md:342)
