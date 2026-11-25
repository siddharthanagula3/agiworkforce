---
id: "SYS-local-inference"
type: "system"
title: "Local inference"
basis: "code inspection and project documents"
second_reader: "challenged and corrected; corrected after the consistency check across pages"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Local inference

Local inference runs a model on the user's device. It works on Mobile (Apple and Google system models, plus downloaded ExecuTorch and llama.rn models), and in the CLI and VS Code through Ollama and LM Studio. Public Desktop and Web refuse it, and the Chrome extension has none (it reports localModels false). No account or plan is needed on Mobile or the CLI. Mobile Local chats are plain text. They have no tools or web search and are not synced. Chat content never goes to AGI servers, but Mobile Local mode still lets a few signed-in account controls (terms, age check, account deletion, data export) reach AGI servers, and it passes any non-AGI host, although Mobile has no own-key mode; that is a boundary gap, not a feature.

## What it is and why it exists

Local inference means the model answers on the user's own machine. The prompt, the files and the answer are not sent to AGI servers or to an outside model provider. It is the "Local" trust boundary, one of three. The others are BYOK (bring your own key) and Managed Cloud. [requirement] (docs/product/requirements.md:111, docs/product/requirements.md:478-492)

Why it exists:
- Local mode must need no AGI account and no hidden cloud call. It must fail closed: if a feature needs remote compute, the app says so and offers a fork. It must not route silently. [requirement] (docs/product/requirements.md:480-492)
- Local and BYOK must stay useful without paying AGI. [requirement] (docs/product/suite.md:84)
- The brief for this page adds that local inference on mobile and desktop is free of any paid subscription. Account or sign-in is a separate question from payment.

**Execution boundary in one line.** Local chat on Mobile runs entirely on the device. Chat content, files and telemetry are not sent to AGI servers. The network is used for the one-time model download from a third-party host, and the egress guard also lets through a short list of signed-in account controls (see Rules) and any non-AGI host (Mobile has no own-key mode, so this is a boundary gap, not a feature). In the CLI and VS Code, a model server on the same computer does the work. Public Desktop (Electron) has no Local chat at all. The Chrome extension has no local inference. [code] (apps/mobile/lib/egressGuard.ts:24-35, :317-327; see Rules and Differences below)

Related pages: SYS-chat-turn-pipeline (the Cloud turn path), and any page on AGI Subscription entitlements.

## How it works today

### Mobile (surface:mobile, mode:local)

**Four runtimes in three tiers.** The shared package `@agiworkforce/local-llm` picks the tier at send time. [code] (packages/platform/local-llm/src/selector.ts:105-146, packages/platform/local-llm/src/types.ts:1-3)

| Tier | Runtime | What it is | Condition |
|---|---|---|---|
| 1 | `foundation_models` (iOS) | The Apple system model, already in the OS. No download. | Native module reports it available. The Swift code checks iOS 26 or newer. [code] (apps/mobile/native/ios/AGIFoundationModels.swift:22-23) |
| 1 | `aicore` (Android) | The Google system model, reached through the ML Kit GenAI Prompt API. No download. | Native module reports available. [code] (apps/mobile/native/android/AGICoreModule.kt:10-22) |
| 2 | `executorch` | Model files (`.pte`) run by react-native-executorch. | Device RAM at least 3500 MB, or RAM unknown and the module is present. [code] (packages/platform/local-llm/src/capabilities.ts:4, :75-76) |
| 3 | `llama_rn` | A GGUF file run by llama.rn. | Always marked available. Needs a model path. [code] (capabilities.ts:77, selector.ts:127-129) |

Selection order in `localGenerate`: it refuses if the device is thermally throttled. Then it uses Tier 1 when the chosen model is the system model. Then Tier 2 when the model has an ExecuTorch preset. If Tier 2 throws, it falls back to Tier 3 when a file path exists. Otherwise it fails with "No local model is ready. Download a local model first, or join AGI Cloud when it is available." [code] (selector.ts:105-146)

**Which models can be picked.** The picker lists catalog entries marked `shipsInV1`, and filters again by what the platform can run. The catalog is a hand-written list in `packages/platform/local-llm/src/catalog.ts`, not the generated model catalog. Today four entries ship: a default text model ("AGI Standard"), a small lite model ("AGI Lite"), the Apple system model and the Google system model. The vision and other entries have `shipsInV1: false`, so they are not selectable on Mobile. [code] (catalog.ts:34-35, :152-153, :178-179, :197-198, apps/mobile/src/features/model-picker/service.ts:102-111, apps/mobile/src/features/model-picker/catalogSelectability.ts:20-28). For exact model names and sizes read `packages/platform/local-llm/src/catalog.ts`. Do not copy them from this page.

**What a person must do first.**
1. Pass the age gate. It runs before everything, including Local Mode. The answer is held on the device, from an OS age range or a typed age. [code] (apps/mobile/app/index.tsx:12-14, apps/mobile/src/features/auth/services/ageGate.ts:98-106, apps/mobile/__tests__/age-gate-guards-cloud-not-local.test.ts:8-24)
2. Finish onboarding. It shows a short first-run disclosure to accept, with managed cloud off. Then it asks for a name and work description (optional), detects the device tier, and offers a model. The person can skip the download and go to chat. [code] (apps/mobile/app/(public)/onboarding.tsx:299-312, :395-398)
3. Download a model, unless they use a system model. The default is a multi-GB download. The Apple and Google system models need no download, but only work where the OS offers them. [code] (service.ts:168, installStore.ts:152-176)
4. Without a ready model the chat tab shows "Download a model to chat" or "No compatible local models", and the send is stopped. [code] (apps/mobile/app/(app)/(tabs)/chat.tsx:721-745, :1494)

**How a download works.** [code] (apps/mobile/services/modelDownload.ts, apps/mobile/src/features/model-picker/installStore.ts)
- ExecuTorch models: `tier2LoadModel` fetches the model, tokenizer and tokenizer config through `react-native-executorch-expo-resource-fetcher`. The source URLs are Hugging Face addresses in the catalog. Files land in `<documents>/react-native-executorch/`. (installStore.ts:497-524, catalog.ts:5-6, modelStoragePaths.ts:4)
- GGUF models: `downloadModel` requires HTTPS, a 64-hex SHA-256, and a safe file size. It resumes from a `.partial` file, then checks the SHA-256 in chunks. Files land in `<documents>/models/<id>/model.gguf`. (modelDownload.ts:97-143, :293-330)
- Before the first byte: the device must be online, and on Wi-Fi unless the person turned on "Download over cellular". Free disk must cover the size plus 256 MB. (modelDownload.ts:190-230, installStore.ts:379, :521)
- After: model folders are excluded from iCloud and device backup, and kept in Documents so the OS does not purge them. (modelDownload.ts:80-91)
- Each install is recorded in the `installed_models` table of the on-device encrypted database. (storage/migrations.ts:49-60, storage/db.ts:25)
- On startup, records whose files are gone are dropped so the app offers Download again. (services/executorchModels.ts:81-100)

**A Local turn.** In `sendMessage`, the mode comes from the conversation, or from the model id (cloud-managed ids mean cloud, everything else is local). A Local chat refuses cloud models, and a cloud chat refuses local models. It never switches silently. [code] (chatExecutionStore.ts:2255-2282, apps/mobile/src/features/chat/utils/conversationMode.ts:7-9)
The Local branch then:
- builds the history, adds the local system prompt, resolves the model reference, and calls `localGenerate` with an abort signal; (chatExecutionStore.ts:3036-3098)
- streams tokens, splits out any thinking tags, records speed and memory, and commits the answer into the local on-device store; (chatExecutionStore.ts:3135-3230)
- returns before any cloud code (consent, entitlements, web search, tools, sync) runs. (chatExecutionStore.ts:3232-3236 vs :2374-2390)

### CLI (surface:cli, mode:local)
The CLI does not download models. It probes servers the person already runs: Ollama at `http://localhost:11434` and LM Studio at `http://localhost:1234/v1`, or a configured base URL. It lists installed models with `agi models scan` and checks a model is installed before a turn. [code] (apps/cli/src/local_models.rs:6-8, :54-73, :244-330, apps/web/app/local/page.tsx:25-31) Run it with `agi --provider ollama --model <model>`. [code] (apps/cli/src/lib.rs:195-196)
First-run onboarding has "Local model, no account needed". It never shows the cloud login in that path. [code] (apps/cli/src/onboarding.rs:264, :387, :839-851)
The session privacy mode is `Local`, and its description says no prompt, chat or file context should leave the device. [code] (apps/cli/src/platform/runtime/session.rs:255-290)

### VS Code (surface:vscode, mode:local)
The extension has no model runtime of its own. It starts the local `agi app-server` from the AGI CLI and asks it for local models, then shows them in an "On this device" group. The CLI must be installed, and the workspace must be trusted. [code] (apps/extension-vscode/src/integrations/localRuntimeClient.ts:714-745, src/features/sidebar-webview/ChatStateManager.ts:2034-2060, README.md:23-38)

### Desktop (surface:desktop)
Public Desktop is the Electron shell and is Cloud-only for chat. The dispatcher returns `unsupported-platform` for every command in `LOCAL_INFERENCE_COMMANDS` before permission handling, and the device profile reports `localModels: false`. [code] (apps/desktop/electron/runtime/dispatcher.ts:3237-3244, :3365-3367, :2298, packages/contracts/local-runtime/src/inference.ts:3-10) A Desktop coding session runs the bundled CLI, which can use a local model. [code] (apps/desktop/electron/runtime/dispatcher.ts:3239-3241, docs/architecture/desktop.md:113-115)

### Chrome extension (surface:chrome)
No local inference. Its device heartbeat to the cloud bridge sends `capabilities.localModels: false`. The words "ollama" and "lmstudio" in its side panel are only provider icon ids. [code] (apps/extension/src/features/cloud-bridge/deviceHeartbeat.ts:33-39, apps/extension/src/side_panel.ts:10938, :10943)

## Implementation map

| Concern | Where | Notes |
|---|---|---|
| Tier choice and generate (mobile) | file:packages/platform/local-llm/src/selector.ts | `selectTier`, `localGenerate`, `loadLocalModel` |
| Device capabilities | file:packages/platform/local-llm/src/capabilities.ts | RAM, OS, thermal state, system-model status through native modules |
| System model calls | file:packages/platform/local-llm/src/tier1.ts, file:apps/mobile/native/ios/AGIFoundationModels.swift, file:apps/mobile/native/android/AGIAICoreModule.kt | Native modules `AGIFoundationModels`, `AGIAICore` |
| ExecuTorch runtime | file:packages/platform/local-llm/src/tier2.ts, file:apps/mobile/services/executorchModels.ts | Preset from catalog; file delete and cancel through the Expo resource fetcher |
| llama.rn runtime | file:packages/platform/local-llm/src/tier3.ts, file:packages/platform/local-llm/src/multimodal.ts | Context capped at 8192 tokens on mobile; vision projector file support |
| Local model catalog | file:packages/platform/local-llm/src/catalog.ts | Hand-written list. Not generated by the model sync. |
| Mobile picker and readiness | file:apps/mobile/src/features/model-picker/service.ts, installStore.ts, localModelRuntime.ts, catalogSelectability.ts | Picker list, install jobs, Auto resolution |
| Download engine | file:apps/mobile/services/modelDownload.ts | HTTPS, SHA-256, resume, Wi-Fi and disk checks |
| Storage paths and record | file:apps/mobile/services/modelStoragePaths.ts, file:apps/mobile/storage/installedModels.ts | store:installed_models (SQLite table), store:models-dir files |
| Mobile Local turn | file:apps/mobile/stores/chat/chatExecutionStore.ts, localSystemPrompt.ts, conversationMode.ts | Local branch at lines 3036-3230 |
| Mobile network block | file:apps/mobile/lib/egressGuard.ts | `EgressBlockedError` code `EGRESS_BLOCKED_LOCAL_MODE`; allow lists for account controls; any non-AGI host passes |
| Mobile entry gating | file:apps/mobile/app/index.tsx, file:apps/mobile/src/features/auth/services/rootRouting.ts, file:apps/mobile/app/(public)/onboarding.tsx | Age gate, onboarding, signed-out path |
| CLI local discovery and checks | file:apps/cli/src/local_models.rs, onboarding.rs, provider.rs, models/streaming.rs | Probes, selection, Ollama tool-support probe |
| CLI cloud refusal | file:apps/cli/src/cloud/client.rs | `CloudClient::admit` allows Managed only |
| Desktop refusal | file:apps/desktop/electron/runtime/dispatcher.ts, file:packages/contracts/local-runtime/src/inference.ts | Command list, loopback rules, 1B minimum, attachment refusal |
| Web composer local section | file:apps/web/features/desktop-host/lib/runtime-client.ts, hooks/use-local-models.ts, file:apps/web/features/chat/lib/local-turn.ts, ComposerFooter.tsx | Only for a host whose shell is `tauri` |
| Retained Tauri | file:apps/desktop/src-tauri/src/core/llm/providers/ollama.rs, local_endpoint.rs, sys/commands (`ollama_*`) | Internal; not the public Desktop |
| Provider adapters (TypeScript) | provider:ollama (packages/ai/providers/ollama), provider:lmstudio (packages/ai/providers/lmstudio), provider:factory | Default URLs `http://localhost:11434` and `http://localhost:1234/v1`; listed in the factory |
| VS Code | file:apps/extension-vscode/src/integrations/localRuntimeClient.ts, localRuntimePool.ts, src/core/cloudModelBoundary.ts | Asks CLI app-server; never swaps a Local default for a cloud model |
| Chrome heartbeat | file:apps/extension/src/features/cloud-bridge/deviceHeartbeat.ts | Reports `localModels: false` |
| Root manifest | file:ollama-manifest.json | Launch/headless metadata for Ollama use; see Gaps |

Provider adapter packages exist for Ollama and LM Studio, and the factory lists them. The adapters accept a configurable base URL and an optional bearer token for proxied deployments. [code] (packages/ai/providers/ollama/src/index.ts:1-14, :21-30, packages/ai/providers/factory/src/index.ts:12-21, :104-108) Which app calls them at runtime in a user's own-machine path is not established. See open questions.

## Data and state

**Mobile.**
- Local conversations and messages live in the on-device SQLite database `agi_mobile.db`. It uses a SQLCipher key kept under the storage id `agi_sqlcipher_db_key_v1`. [code] (apps/mobile/storage/db.ts:22-25)
- A Local chat session is labelled `executionAuthority: local_device`, `storageScope: local_device`, `syncPolicy.syncEligible: false`. [code] (apps/mobile/src/features/chat/utils/sessionLabeling.ts:66-80)
- Cloud sync is only queued when the mode is cloud. [code] (chatExecutionStore.ts:2950-2957)
- Table `installed_models` columns: id, display_name, runtime (`local` or `cloud`), format (`gguf`, `safetensors`, `mlx`, `onnx`, `pte`), size_bytes, sha256, local_path, installed_at, last_used_at, capabilities. [code] (storage/migrations.ts:49-60, storage/installedModels.ts:5-12)
- The store `useModelInstallStore` persists `allowCellularDownloads`, which defaults to false. The "Download over cellular" choice is shown in onboarding and in Settings, Storage. [code] (installStore.ts:379, :383, modelDownload.ts:192)
- Model files: `<documents>/models/<safe-id>/model.gguf` and `<documents>/react-native-executorch/`. Both are excluded from backup. [code] (modelStoragePaths.ts:3-5, modelDownload.ts:79-91, :102-105)
- Memory, personalization and past-chat context for Local chats come from the local settings store and on-device memory. They are not the account memory. [code] (chatExecutionStore.ts:2789-2820, apps/mobile/src/features/memory/services/pastChatContext.ts:117-124)
- "Delete all local chats" appears in Data controls when the app mode is Local. [code] (apps/mobile/src/features/settings/data-controls/index.tsx:449-470)

**Chat turn metadata** saved on the answer: `localMode`, `localModelId`, `localRuntime`, `localModelName`, tokens per second. [code] (chatExecutionStore.ts:3178-3194)

**CLI.** Local-boundary memory goes to a separate file, so Local content never mixes with BYOK or Managed memory. [code] (apps/cli/src/memory_pipeline.rs:35-42) Local base URLs are read from the CLI config (`config.base_url`). [code] (local_models.rs:55-67)

**Desktop and Web.** No local model state is stored. The unused web types `LocalModelSettings.baseUrls` are only normalised, with loopback required. [code] (packages/contracts/local-runtime/src/inference.ts:150-165)

**Server-side.** A Local Mobile chat writes nothing to AGI tables. The CLI device heartbeat records `localModels` in table:device_registrations column `local_models_available`, but the CLI only sends it in Managed mode. The Chrome extension also sends a heartbeat, always with `localModels: false`. [code] (apps/web/db/neon/0207_device_registrations.sql:40, apps/web/app/api/devices/heartbeat/route.ts:64-80, apps/cli/src/device_registry.rs:172-177, apps/cli/src/cloud/client.rs:368-373, apps/extension/src/features/cloud-bridge/deviceHeartbeat.ts:33-39)

## Rules: access, plans, modes

**Account / sign-in, by surface.** This is separate from payment.

| Surface | Account needed for Local chat? | Where the code says so |
|---|---|---|
| surface:mobile | No. A signed-out user reaches the app. Routing only forces onboarding and the age gate. A signed-out user is not sent to sign-in unless a session just ended. | rootRouting.ts:44-60 [code] |
| surface:cli | No. Local first run skips cloud login. The README says Local mode and BYOK need no plan. | onboarding.rs:839-851; README.md:335-337 [code] |
| surface:vscode | No. An AGI Cloud account is only for Managed Cloud and cloud extras. The CLI does the local work. | README.md:35-38 [code] |
| surface:desktop | Not applicable. Local chat is not offered. Sign-in (Clerk) is needed for the Cloud chat that Desktop does offer. | docs/architecture/desktop-local-runtime.md:11-17 [requirement], dispatcher.ts:3365-3367 [code] |
| surface:web | No local inference. | no code found [inferred] |
| surface:chrome | No local inference. Heartbeat reports `localModels: false`. | deviceHeartbeat.ts:33-39 [code] |

**Payment / plan.** No plan, entitlement or quota check sits on the Mobile Local branch. The entitlement call `ensureCloudEntitlementsReadyForRequest` and the consent call `ensureCloudSendConsent` are in the cloud branch only. [code] (chatExecutionStore.ts:2374-2390, :3036-3232) The mobile model list contains no plan lock for local models. A model is `locked` only for an environment or cloud tier reason, and local entries never get one. [code] (service.ts:85-95, :168) The CLI states that Local needs no plan. [code] (apps/cli/README.md:335-337) The "Free plan" has no bearing on Mobile Local. Subscription accounting is therefore not applied to Local turns. No local usage is reported to an AGI Subscription system. [inferred] from the absence of any usage call in the Local branch.

One payment-linked rule exists in Web code: the composer hides the "Local models" row when the user's plan is Free (`!freePlan && localModels.available`). It is only reachable on a host whose shell is `tauri` (see Differences). [code] (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1043, :1766, packages/contracts/local-runtime/src/host-bridge.ts:690-692) This conflicts with the requirement that local inference is free of any paid subscription. See Gaps.

**Trust-boundary rules.**
- A Local chat never takes cloud models, and a cloud chat never takes local models. Mobile gives an error and asks for a separate chat. [code] (chatExecutionStore.ts:2263-2282)
- **Mobile egress guard in Local mode.** The guard's message says Local Mode is "on-device + BYOK only", although Mobile has no own-key mode, and it blocks calls to our managed-cloud hosts before any network I/O. [code] (apps/mobile/lib/egressGuard.ts:24-35, :300-327) It lets four kinds of request through:
  - A content report the user chose to send (POST to the report path only), except while a withdrawal is in progress.
  - Signed-in account controls (`authControl`): terms acceptance, the age check that opens Cloud, account deletion status, scheduling and cancellation, the identity check for deletion only, and the data export. The code comment says none carries chat content and these rights must not depend on sharing with AI providers. The age check must pass before Cloud opens, so blocking it would keep Cloud shut. Paths and methods are listed in `SIGNED_IN_ACCOUNT_CONTROLS`, and some requests must match a body rule (for example the age check carries only age evidence). A bearer token is required (per the finding checked at egressGuard.ts:210-244; the bearer test itself was not re-read).
  - Withdrawal controls (`withdrawalControl`): list schedules, set one inactive, list unfinished runs, pause a run, revoke the Ask from Siri token. Each only stops work.
  - Any non-AGI host, passed on to `secureFetch`. The guard's comment calls this BYOK direct-to-provider, but Mobile has no own-key mode, so this is a stale comment and a boundary gap, not a feature.
  So a Local-mode phone can still contact AGI servers for these account controls when the person is signed in and uses them. It does not send chat content, files or telemetry. [code] (egressGuard.ts:210-244, :300-327)
- CLI: Local, BYOK and Managed are session privacy modes. A Local session refuses cloud calls (`CloudError::NotManaged`), and sub-agents get no off-device route. [code] (cloud/client.rs:368-373, apps/cli/src/subagent.rs:39-45)
- CLI and Rust base URLs for local servers must be loopback. Non-loopback is shown as `blocked`. [code] (local_models.rs:104-110, :152-155, apps/web/app/local/page.tsx:34 says the same in marketing)
- TypeScript contract: a local server URL must be on this machine, or the request is refused. [code] (inference.ts:171-205)
- Local to BYOK or Cloud is a fork, not a mode flip. The original Local thread stays Local. [requirement] (docs/product/requirements.md:115, docs/product/suite.md:62)
- VS Code: a Local default model is never replaced by a cloud model. Cloud-only commands send nothing and say so. [code] (apps/extension-vscode/src/core/cloudModelBoundary.ts:12-47)

**Features in Mobile Local mode.**

| Feature | Works? | Evidence |
|---|---|---|
| Streaming text chat, with thinking text split out | Yes | chatExecutionStore.ts:3052-3115 [code] |
| Local system prompt | Yes | stores/chat/localSystemPrompt.ts:3-12 [code] |
| Chat mode and style prompts | Yes (added to history) | chatExecutionStore.ts:2774-2780 [code] |
| Projects: instructions and sources | Yes, local projects | chatExecutionStore.ts:2758-2772 [code] |
| Memory, personalization, past-chat context | Yes, from device stores | chatExecutionStore.ts:2789-2822 [code] |
| Image attachments | Text only: on-device OCR text goes in. The model cannot see pixels. | chatExecutionStore.ts:1241-1262 [code] |
| Document attachments | Added as context; kept on the device | chatExecutionStore.ts:2471-2473, :2685-2705 [code]; whether parsing is fully on-device is [unknown] |
| Vision models | Not selectable in v1 | catalog.ts shipsInV1 false [code] |
| Tools, connectors, web search, code execution | No. The Local branch returns before they run. Settings show "Cloud only" for the account switches. | chatExecutionStore.ts:3232-3236; capabilities/index.tsx:318 [code] |
| Image and video generation | No, `requires_cloud` | resolveMobileImageGenerationRequest.ts:252, resolveMobileVideoGenerationRequest.ts:107 [code] |
| Live voice | No, turn based only | liveVoiceAvailability.ts:17-25 [code] |
| Cloud sync and account history | No | sessionLabeling.ts:66-80 [code] |
| Share preview | Local chats can be previewed from the local store | share-preview/index.tsx:107-117 [code] |

Auto model modes also work in Local: they pick between installed models and the system model by tier. [code] (localModelRuntime.ts:44-85)

## Differences between apps

| Surface | Local inference? | Runtime | Who supplies the model | Sign-in | Payment |
|---|---|---|---|---|---|
| surface:mobile | Yes | Apple system model, Google system model, ExecuTorch, llama.rn | App downloads it, or the OS already has it | Not needed | None found |
| surface:cli | Yes | Ollama or LM Studio (by default `localhost`) | User installs the server and pulls the model | Not needed | None ("needs no plan") |
| surface:vscode | Yes, through the CLI app-server | Same as CLI | User | Not needed for Local | None found |
| surface:desktop (Electron, public) | Chat: No. Coding sessions: Yes, through the bundled CLI. | CLI runtimes | User | Cloud chat needs Clerk sign-in; Local coding needs none known | Not established for Local coding |
| surface:desktop (Tauri, retained internal) | Code exists (Ollama commands) | Ollama | User | Not examined | Not examined |
| surface:web | No (browser has no host) | n/a | n/a | n/a | n/a |
| surface:chrome | No. Heartbeat sends `localModels: false`. | n/a | n/a | n/a | n/a |

Notes:
- Public marketing says Local runs "in the CLI" with Ollama and LM Studio, costs $0, and needs no account. It describes Mobile with softer words ("built to keep the conversation, memory, and files on the device"). [code] (apps/web/app/local/page.tsx:25-70, :95-105)
- Web has full local-chat UI code that is gated to a host whose `shell` is `tauri` (`hostHasLocalMode`). Electron is explicitly excluded in its own comment. I found no Rust handler for `local_model_servers`, `local_model_list`, `local_chat_start` or the other four commands in the Tauri app, so I believe that path has no working backend today. [code] (apps/web/features/desktop-host/lib/host.ts:36-47, packages/contracts/local-runtime/src/host-bridge.ts:690-692) and [inferred] (grep over apps/desktop/src-tauri, crates, apps and packages found these command names only in the web client, tests and the contract).
- The web local-chat path refuses attachments, sends text only, and does not call the cloud completions route or save the turn to the account. [code] (apps/web/features/chat/lib/local-turn.ts:43-60, :80-90)
- The CLI treats an unfamiliar name with a colon and no slash as an Ollama model. [code] (apps/cli/src/provider.rs:85-107)
- Mobile also shows platform differences: Apple model on iOS only, Google model on Android only. [code] (catalogSelectability.ts:11-28)

## Failure handling

**Mobile.**

| Situation | What happens |
|---|---|
| No model downloaded | Send is stopped. The tab shows "Download a model to chat" and offers Models. (chat.tsx:721-745, :1494) |
| Selected model gone from disk | Record is dropped, so the model shows Download again. If the chat still points at it: "This Local Mode chat uses a model that is no longer available on this device." (executorchModels.ts:81-100, chatExecutionStore.ts:1293-1294) |
| Offline at download | `offline` error; "Reconnect and try again." (modelDownload.ts:190-197) |
| Cellular without consent | `wifi_required` error naming "Settings, Storage, Download over cellular". (modelDownload.ts:198-208) |
| Not enough disk | `storage_full`, with the needed and free sizes. Needs the file size plus 256 MB. (modelDownload.ts:216-229) |
| Bad checksum | `ChecksumMismatchError` / `checksum_mismatch`. (modelDownload.ts:19-25, imports) |
| Device under 3.5 GB RAM | ExecuTorch and vision models are `unavailable` or `locked`: "This device cannot run this on-device model." (installStore.ts:111-132) |
| Device too hot | `Device is thermally throttled, inference paused.` (selector.ts:43, :113) |
| Out of memory | "This device ran out of memory for the on-device model. Close other apps, or choose a smaller model." (chatExecutionStore.ts:1413-1414) |
| System model off or still preparing | Marked unavailable for this session and the chat moves to a ready model. (localModelRuntime.ts:170-188, installStore.ts:262-290) |
| ExecuTorch fails | Falls back to llama.rn if a GGUF path exists; otherwise the error is thrown. (selector.ts:118-142) |
| Empty reply | "The local model returned an empty response. Try again with a shorter prompt." (chatExecutionStore.ts:3124-3126) |
| Stop pressed | Abort signal reaches the runtime; the turn ends without a committed answer. (chatExecutionStore.ts:3089-3118, :3125) |
| Our cloud host called in Local mode (not on the allow list) | `EgressBlockedError` code `EGRESS_BLOCKED_LOCAL_MODE`, thrown before any network I/O. (egressGuard.ts:24-35, :300-327) |

Removal of a model while it is answering is refused with "This model is replying now. Try again when it finishes." [code] (modelDownload.ts:69-76)

**CLI.** An unreachable server reports `not reachable ... Start Ollama` or `Start the local server and load a model`. A model not installed gives the list of what is installed, and tells the user to run `agi models scan`. Several providers holding the same model name give an error asking the user to pick a provider. [code] (local_models.rs:171-206, :294-330, :114-139)

**Desktop.** Any local-inference command gets `unsupported-platform` with the text that Desktop answers every conversation in the cloud. [code] (dispatcher.ts:3242, :3365-3367)

**VS Code.** With no local model: the picker says "No local models found. Start Ollama or LM Studio and load a model". A cloud-only utility with a Local default sends nothing and says so. [code] (ChatStateManager.ts:2047-2055, cloudModelBoundary.ts:34-47)

## How it should work

These are established requirements, not statements about the code. Where code differs, the Gaps section says so.

- Local needs no AGI account, keeps storage on the device, makes no hidden cloud call, and fails closed when a feature needs remote compute. [requirement] (docs/product/requirements.md:480-492)
- Local and BYOK stay useful without paying AGI. [requirement] (docs/product/suite.md:84)
- A Local thread stays Local. Crossing to BYOK or Cloud is a visible fork with consent. [requirement] (docs/product/requirements.md:115, docs/product/suite.md:55-62)
- A local model that cannot call tools should have tool use hidden or disabled for that route. [requirement] (docs/product/requirements.md:299)
- Brief for this page: local inference on mobile and desktop is free of any paid subscription. Sign-in is a separate question. [requirement] (task brief; no repository document located that states "desktop" in this sentence)
- Competitor behaviour was not examined for this page. [unknown]

[proposed] If Desktop is meant to offer Local chat, it needs a decision record that replaces D-2026-09-15-04. Then a real handler for the six commands is needed, with no `!freePlan` gate on the web row. Until then, product copy must say Desktop reaches local models only through coding sessions.

## Gaps

Implementation status (is the code there and connected) is kept apart from verification status (has anyone run it). Nothing here was run by me. I did not run the repository's tests, apps or builds.

| # | Gap | Basis |
|---|---|---|
| 1 | **Desktop vs requirement.** The brief says local inference on desktop is free of a paid subscription. Public Desktop (Electron) has no Local chat. It is refused by design in the dispatcher, per founder decision D-2026-09-15-04. Local models on Desktop exist only through a coding session that runs the bundled CLI. | [code] (dispatcher.ts:3237-3244, :3365-3367), [requirement] (docs/decisions/2026-09-15-founder-decisions.md:78-86) |
| 2 | **Web local-chat code with no backend.** The composer, the `useLocalModels` hook, `runLocalTurn` and the six command names exist, but no handler for them was found in the Tauri Rust code or Electron. The `hostHasLocalMode` gate lets only a `tauri` shell through. | [code] and [inferred] (see Differences) |
| 3 | **Free-plan gate in that Web code.** `!freePlan && localModels.available` hides the Local row for Free-plan users. If a host ever supports it, this ties Local to a paid plan. | [code] (ComposerFooter.tsx:1043, :1766) |
| 4 | **No checksum for ExecuTorch downloads in app code.** The installed record stores `sha256: null` and delegates the fetch to the library. Only GGUF downloads are verified by the app. | [code] (installStore.ts:187-205, modelDownload.ts:97-107) |
| 5 | **Catalog is not generated.** AGENTS.md says model IDs live only in the generated catalog. The local on-device catalog is a hand-written TypeScript list with URLs and hashes. Whether the model-id guards exempt it was not checked. | [code] (packages/platform/local-llm/src/catalog.ts), [requirement] (AGENTS.md section 4) |
| 6 | **Local text chats only.** Tool use, web search, vision and live voice are not available in Mobile Local. Local image text is OCR only. | [code] (see Rules) |
| 7 | **No usage or entitlement accounting for Local turns.** Correct for the free requirement, but nothing shows Local usage to the AGI Subscription system. | [inferred] |
| 8 | **`ollama-manifest.json` does not match the CLI.** See outdated documents. | [code] |
| 9 | **Mobile v1 vision models are not shippable.** `qwen`-family vision entries have `shipsInV1: false`, so the premium Auto profile falls back to the default text model. | [code] (catalog.ts:59-60, localModelRuntime.ts:57-62) |
| 10 | **Mobile Local mode is not fully offline from AGI.** The requirement says Local makes no hidden cloud call. The guard lets signed-in account controls (terms, age check, account deletion, scheduling, step-up, data export) reach AGI servers, and passes any non-AGI host (Mobile has no own-key mode, so that is a boundary gap, not a feature). The account controls are user-driven and carry no chat content by the code's own comment, so this is a narrow, visible exception rather than a hidden chat route. Whether product copy and the first-run disclosure state it was not checked. | [code] (egressGuard.ts:24-35, :210-244, :300-327), [requirement] (docs/product/requirements.md:480-492) |
| 11 | **Verification.** I found test files for these paths (listed in How to verify) but I did not run them, and found no document recording a real device run of local chat. | [unknown] |

## How to verify

I ran nothing. These are the checks to run, and the files that already test them. [proposed]

**Mobile.**
- Unit tests in apps/mobile/__tests__: `local-llm-selector.test.ts`, `localModelRuntime.test.ts`, `model-download-policy.test.ts` (Wi-Fi and cellular consent, removal), `executorch-model-lifecycle.test.ts`, `executorch-preset-presence.test.ts`, `age-gate-guards-cloud-not-local.test.ts`, `local-chats-persist-reload.test.ts`, `FirstRunLocalModelReadiness.test.tsx`. Mobile tests are heavy; run them in chunks. [code] (file names listed by the repository)
- Package tests in packages/platform/local-llm/src/__tests__: `selector-tier2.test.ts`, `tier1.test.ts`, `tier2.test.ts`, `tier3.test.ts`, `catalog.test.ts`.
- Human check on a real iPhone and a real Android phone, each with the app signed out: pass the age gate, accept the disclosure, download the default model on Wi-Fi, switch on airplane mode, send a message and confirm an answer. Then try cellular without consent. Then try an unsupported device (under 3.5 GB RAM). Then confirm the "Cloud only" notes in Settings. Look at it as a person would. A passing unit test is not proof.
- Confirm no chat content leaves the device in Local mode by watching the network on a proxy. Expect the model download host. Expect AGI hosts only when the person uses a signed-in account control (terms, age check, account deletion, data export); sending a chat must produce none.

**CLI and VS Code.**
- Start Ollama, run `ollama pull <model>`, then `agi models scan` and `agi --provider ollama --model <model>`. Do it signed out, to confirm no login is asked. [code] (apps/web/app/local/page.tsx:25-31)
- In VS Code, open a trusted folder, confirm the "On this device" group lists the same models, and confirm Code Review and inline completions send nothing with a Local default. [code] (README.md:185-190)
- Rust tests live in apps/cli/src/local_models.rs and apps/cli/src/device_registry.rs (inline). The VS Code mock server lives at apps/extension-vscode/src/test/localModelFixture.ts.

**Desktop.**
- apps/desktop/electron/__tests__/dispatcher.test.ts:1023 ("refuses every local inference command on the cloud-only shell") and :1228 (`localModels: false`).
- packages/contracts/local-runtime/src/__tests__/inference.test.ts for loopback, attachment refusal and the 1B-minimum rule.
- Web: apps/web/features/desktop-host/__tests__/local-runtime-client.test.ts, apps/web/features/chat/components/Composer/ComposerFooter.localModels.test.tsx, apps/web/lib/hooks/useChatStream.local.test.ts. These use mocks, so they do not prove a working host exists.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Public Desktop (Electron) refuses every local-inference command with unsupported-platform and reports localModels false; its chat is Cloud-only. | read in the code | `apps/desktop/electron/runtime/dispatcher.ts:3365-3367`; `apps/desktop/electron/runtime/dispatcher.ts:2298`; `apps/desktop/electron/runtime/dispatcher.ts:3237-3244`; `apps/desktop/electron/__tests__/dispatcher.test.ts:1023` |
| The six refused commands are local_model_servers, local_model_list, local_chat_start, local_chat_cancel, local_model_settings_read and local_model_settings_write. | read in the code | `packages/contracts/local-runtime/src/inference.ts:3-10` |
| Desktop coding sessions run the bundled CLI, which can use a local model; this is the only way local models reach public Desktop. | read in the code | `apps/desktop/electron/runtime/dispatcher.ts:3239-3241`; `docs/architecture/desktop.md:113-115` |
| Mobile has four local runtime names: foundation_models (Apple), aicore (Google), executorch, and llama_rn, grouped into tiers 1, 2 and 3. | read in the code | `packages/platform/local-llm/src/types.ts:1-3`; `packages/platform/local-llm/src/selector.ts:105-146` |
| ExecuTorch (tier 2) needs at least 3500 MB RAM, or unknown RAM with the module present; llama.rn (tier 3) is always marked available. | read in the code | `packages/platform/local-llm/src/capabilities.ts:4`; `packages/platform/local-llm/src/capabilities.ts:75-77` |
| Four catalog entries ship on Mobile v1 (default text, lite text, Apple system model, Google system model); vision entries are not shippable. | read in the code | `packages/platform/local-llm/src/catalog.ts:34-35`; `packages/platform/local-llm/src/catalog.ts:152-153`; `packages/platform/local-llm/src/catalog.ts:178-179`; `packages/platform/local-llm/src/catalog.ts:197-198`; `packages/platform/local-llm/src/catalog.ts:59-60` |
| The on-device model catalog is a hand-written TypeScript list, not the generated model catalog. | read in the code | `packages/platform/local-llm/src/catalog.ts:12-14`; `AGENTS.md section 4` |
| Mobile model downloads come from Hugging Face over HTTPS; GGUF files are SHA-256 verified, resumable, Wi-Fi only by default, and need free disk of file size plus 256 MB. | read in the code | `apps/mobile/services/modelDownload.ts:97-143`; `apps/mobile/services/modelDownload.ts:190-229`; `packages/platform/local-llm/src/catalog.ts:5-6` |
| ExecuTorch downloads are fetched by the react-native-executorch resource fetcher; the app records sha256 null for them, so it does not verify a checksum itself. | read in the code | `apps/mobile/src/features/model-picker/installStore.ts:187-205`; `apps/mobile/src/features/model-picker/installStore.ts:497-524` |
| Model files are stored under documents/models/<id>/model.gguf and documents/react-native-executorch/, excluded from backup; installs are recorded in the installed_models table of the on-device encrypted SQLite database. | read in the code | `apps/mobile/services/modelStoragePaths.ts:3-5`; `apps/mobile/services/modelDownload.ts:79-91`; `apps/mobile/storage/migrations.ts:49-60`; `apps/mobile/storage/db.ts:22-25` |
| Mobile Local chat does not require sign-in: routing sends a signed-out user to the app after the age gate and onboarding, and the Local send branch has no auth check. | read in the code | `apps/mobile/src/features/auth/services/rootRouting.ts:44-60`; `apps/mobile/stores/chat/chatExecutionStore.ts:2255-2290`; `apps/mobile/stores/chat/chatExecutionStore.ts:2374-2390` |
| The age gate runs before everything on Mobile including Local Mode, and the answer is held on the device. | read in the code | `apps/mobile/app/index.tsx:12-14`; `apps/mobile/src/features/auth/services/ageGate.ts:98-106`; `apps/mobile/__tests__/age-gate-guards-cloud-not-local.test.ts:8-24` |
| Mobile Local turns carry no plan, entitlement or consent check; those calls are in the cloud branch only. | read in the code | `apps/mobile/stores/chat/chatExecutionStore.ts:2374-2390`; `apps/mobile/stores/chat/chatExecutionStore.ts:3036-3236` |
| A Mobile Local chat refuses cloud models and a cloud chat refuses local models, with an error asking for a separate chat. | read in the code | `apps/mobile/stores/chat/chatExecutionStore.ts:2263-2282` |
| Mobile Local branch returns before tools, web search, connectors and sync; account switches show 'Cloud only'; image/video generation and live voice need cloud. | read in the code | `apps/mobile/stores/chat/chatExecutionStore.ts:3232-3236`; `apps/mobile/src/features/settings/capabilities/index.tsx:318`; `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:252`; `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:17-25` |
| On Mobile Local, image attachments become on-device OCR text only; the model cannot see pixels. | read in the code | `apps/mobile/stores/chat/chatExecutionStore.ts:1241-1262` |
| The mobile egress guard's message describes Local Mode as 'on-device + BYOK only', although Mobile has no own-key mode. The guard throws EgressBlockedError (EGRESS_BLOCKED_LOCAL_MODE) for our managed-cloud hosts before any network I/O, except for an allow list. | read in the code | `apps/mobile/lib/egressGuard.ts:24-35`; `apps/mobile/lib/egressGuard.ts:300-327` |
| In Mobile Local mode the guard still allows signed-in account controls to AGI servers: terms acceptance, the age check that opens Cloud, account deletion status, scheduling and cancellation, the deletion identity check, and data export. The guard comment says none carries chat content. It also allows a user-sent content report, withdrawal controls, and any non-AGI host (a boundary gap, since Mobile has no own-key mode; the guard comment's 'BYOK direct-to-provider' is stale). | read in the code | `apps/mobile/lib/egressGuard.ts:210-244`; `apps/mobile/lib/egressGuard.ts:300-327` |
| Local Mobile sessions are labelled local_device storage with syncEligible false; cloud sync is queued only in cloud mode. | read in the code | `apps/mobile/src/features/chat/utils/sessionLabeling.ts:66-80`; `apps/mobile/stores/chat/chatExecutionStore.ts:2950-2957` |
| The CLI supports exactly two local runtimes, Ollama (default http://localhost:11434) and LM Studio (default http://localhost:1234/v1); it discovers models but does not download them. | read in the code | `apps/cli/src/local_models.rs:6-8`; `apps/cli/src/local_models.rs:54-73`; `apps/cli/src/local_models.rs:171-206` |
| The CLI Local first run needs no account and never shows cloud login; README states Local mode and BYOK need no plan. | read in the code | `apps/cli/src/onboarding.rs:839-851`; `apps/cli/README.md:335-337` |
| CLI Local sessions refuse cloud calls (CloudClient::admit allows Managed only), and the device heartbeat only runs for Managed, so Local does not report to AGI servers. | read in the code | `apps/cli/src/cloud/client.rs:368-373`; `apps/cli/src/device_registry.rs:172-177` |
| VS Code has no model runtime of its own; it asks the CLI app-server for local models and shows an 'On this device' group; an AGI Cloud account is not required for Local. | read in the code | `apps/extension-vscode/src/integrations/localRuntimeClient.ts:714-745`; `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2034-2060`; `apps/extension-vscode/README.md:35-38` |
| VS Code never swaps a Local default model for a cloud model; Code Review, Suggest Terminal Command and inline completions run only on AGI Cloud and send nothing when a Local model is selected. | read in the code | `apps/extension-vscode/src/core/cloudModelBoundary.ts:12-47`; `apps/extension-vscode/README.md:185-190` |
| The Chrome extension has no local inference. Its device heartbeat to the cloud bridge always sends capabilities.localModels false, and the only 'ollama' and 'lmstudio' strings in its side panel are provider icon ids. | read in the code | `apps/extension/src/features/cloud-bridge/deviceHeartbeat.ts:33-39`; `apps/extension/src/side_panel.ts:10938`; `apps/extension/src/side_panel.ts:10943` |
| Web has local-chat UI and client code gated to a host whose shell is tauri; no handler for the six local-inference commands was found in Rust or Electron, so the path appears to have no backend. | inferred | `packages/contracts/local-runtime/src/host-bridge.ts:690-692`; `apps/web/features/desktop-host/lib/runtime-client.ts:582-650`; `apps/web/features/desktop-host/lib/host.ts:36-47` |
| The Web composer hides the Local models row for Free-plan users (!freePlan && localModels.available), a plan-linked rule in a path that is not reachable on Electron. | read in the code | `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1043`; `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1766` |
| The shared local-inference contract requires loopback base URLs, refuses attachments, and hides models under 1B parameters. | read in the code | `packages/contracts/local-runtime/src/inference.ts:128-205`; `packages/contracts/local-runtime/src/inference.ts:110-126` |
| Public marketing says Local runs in the CLI with Ollama and LM Studio, costs $0 and needs no account. | read in the code | `apps/web/app/local/page.tsx:25-31`; `apps/web/app/local/page.tsx:95-105` |
| Requirement: Local mode needs no AGI account, keeps storage local, makes no hidden cloud call and fails closed. | stated requirement | `docs/product/requirements.md:480-492` |

## Open questions

- Challenge accepted, not wrong: Mobile Local mode still reaches AGI servers for signed-in account controls and passes any non-AGI host, although Mobile has no own-key mode. Confirmed in apps/mobile/lib/egressGuard.ts:24-35, :210-244, :300-327 and now stated in the page. Still open: does the first-run disclosure or product copy tell users about these exemptions?
- Challenge accepted, not wrong: the Chrome extension has no local inference and reports localModels false (apps/extension/src/features/cloud-bridge/deviceHeartbeat.ts:33-39; side_panel.ts:10938, :10943 are icon ids). Now stated in the page. A full-repo search of the extension for a local model runtime was not done beyond these files.
- Does the retained Tauri desktop expose a working local chat path to the web composer? No handler for the six local-inference commands was found, but the Tauri commands are registered under different names (ollama_*). Whether the web client's invoke maps to them is not established.
- Is a Free-plan user meant to be blocked from Local models on Web? The ComposerFooter gate says yes, while the requirement says Local is free of any subscription.
- Should public Desktop offer Local chat? The brief says local inference on desktop is free, but founder decision D-2026-09-15-04 and the dispatcher make Desktop Cloud-only. This is a product choice the code leaves undecided.
- Are Mobile document attachments in Local mode parsed fully on the device? buildAttachedDocumentContext was not opened.
- Does the egress guard's account-control path require a bearer token exactly as the challenge states? The page repeats this from the challenge's citation (egressGuard.ts:210-244); the bearer test code was not re-read here.
- Does the hand-written local-llm catalog pass the repository's model-ID literal guards, or is it exempt? The guards were not run or read.
- Is the Apple system model's iOS 26 requirement enforced identically in JS capability detection? Only the Swift check was read.
- Which app, if any, calls the provider-ollama and provider-lmstudio TypeScript adapters at runtime for a user's own machine? The factory lists them and desktop's package.json depends on them, but no call site was traced.
- Is there a recorded real-device run of Mobile Local chat (iOS and Android)? None was found in the documents read.
- Does the CLI enforce a minimum context length for local models (the manifest says 65536)? No such check was found.

## Project documents found out of date

- `ollama-manifest.json`: It launches `agiworkforce ollama-setup` for configuration, sets OLLAMA_HOST from {{host}}, and states minContextLength 65536 and '24 providers, 150+ skills'. The code says: No `ollama-setup` subcommand, no OLLAMA_HOST read and no 65536 context check were found in the CLI. Local base URLs come from CLI config and default to loopback ports. The `--provider`, `--model` and `--yes` flags do exist. (grep over apps/cli/src and crates found no match for ollama-setup, OLLAMA_HOST or a 65536 context check; apps/cli/src/local_models.rs:54-67; apps/cli/src/lib.rs:195-196)
- `docs/product/suite.md (Mobile row, line 33)`: Describes Mobile as an 'Unpublished client with small on-device Local LLM work in the codebase' and Cloud as 'public-alpha'. The code says: The code has a full Local chat path with four runtimes, a downloader and a model picker. I cannot confirm release status from the code. The document's tone understates the implementation. (apps/mobile/stores/chat/chatExecutionStore.ts:3036-3232; packages/platform/local-llm/src/selector.ts:105-146)
- `packages/platform/local-llm/package.json (peerDependencies)`: Peer range for llama.rn is ^0.10.0. The code says: apps/mobile/package.json depends on llama.rn ^0.12.9. (packages/platform/local-llm/package.json peerDependencies; apps/mobile/package.json:132)
- `packages/platform/local-llm/src/selector.ts error text ('join AGI Cloud when it is available')`: The no-model error tells the user to join AGI Cloud when it is available, which depends on waitlist state. The code says: Cloud chat on Mobile is gated by a waitlist flag (cloudUnlocked), so the advice is only correct for some users. (packages/platform/local-llm/src/selector.ts:59, :145; apps/mobile/stores/chat/chatExecutionStore.ts:2236-2237)
- `apps/mobile/lib/egressGuard.ts (comment at line 326 and error message at line 31)`: Calls the pass-through of provider or other hosts 'BYOK direct-to-provider' and says Local Mode is 'on-device + BYOK only'. The code says: Mobile has no own-key mode, and the guard passes any non-AGI host to secureFetch, so the BYOK wording is a stale comment and message and the pass-through is a boundary gap. (apps/mobile/lib/egressGuard.ts:31 and :326)
