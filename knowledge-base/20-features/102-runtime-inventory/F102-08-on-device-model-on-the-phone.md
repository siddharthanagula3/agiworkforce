---
id: "F102-08"
type: "feature"
title: "On-device model on the phone"
aliases: ["On-device model", "Local Mode (mobile)", "local model runtime (S102.17)", "local-llm package", "Tier 1 / Tier 2 / Tier 3 runtimes", "Private Local Mode", "Models screen (mobile)"]
area: "102 Runtime inventory"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S102.17"]
depends_on: ["SYS-local-inference", "SYS-execution-boundaries", "SYS-model-catalog-and-routing", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "mode:local", "surface:mobile", "surface:desktop", "store:agi_mobile.db", "table:installed_models", "file:packages/platform/local-llm/src/selector.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F102-08 On-device model on the phone

On the phone, Local Mode answers chats with a model that runs on the device, with no server call. The app picks the phone's built-in model, an ExecuTorch model or a downloaded llama.rn model. The Electron desktop refuses local inference by decision and points to the CLI.

Area: [102. Runtime inventory](README.md). Requirement items: [S102.17](../../10-requirements/capabilities/102-runtime-inventory.md#s10217).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** The mobile app can run a language model on the phone. The shared package @agiworkforce/local-llm chooses between three runtimes: Tier 1 is the model built into the phone operating system, Tier 2 is ExecuTorch and needs about 3.5 GB of RAM, Tier 3 is llama.rn, a universal CPU fallback (packages/platform/local-llm/src/capabilities.ts:4-80; selector.ts:105-150). A mobile chat whose execution mode is 'local' runs through it (apps/mobile/stores/chat/chatExecutionStore.ts:2258-2290, 3098).

**Why it exists.** Local inference on mobile must work without a paid subscription and keep the chat on the phone (product context; doc: docs/product/requirements.md:476-486). The mobile settings say 'Local Mode works without one [an account]' (apps/mobile/src/features/settings/Common.tsx:179).

**Who uses it.** Phone users who want private, offline or free chat, and users without a plan.

**Problems it solves**

- Chat with no network and no account.
- Keep prompts on the phone.
- Avoid per-message cost.

**Use cases**

- Start a chat in Local Mode and ask a question on a flight.
- Download a larger local model on Wi-Fi and chat with it.
- Attach an image: on-device OCR text is added for a text-only local model (chatExecutionStore.ts:1227-1256).

## 2. User experience

**Where to find it**

- Mobile: the Local/Cloud mode of the chat, the Models screen (apps/mobile/app/(app)/models.tsx), and Settings > Performance (apps/mobile/app/(app)/settings/performance.tsx:557).
- Desktop: not offered. The Electron shell answers 'AGI Desktop answers every conversation in the cloud. Models running on this Mac are not one of its runtimes.' (apps/desktop/electron/runtime/dispatcher.ts:3242 with the product name inserted).
- Web, CLI, VS Code, Chrome: not this feature. The CLI reaches local servers separately (see F102-07).

**Before you start**

- A downloaded local model, or a phone whose operating system provides a built-in model (localModelRuntime.ts:75-100).
- No account needed (Common.tsx:179).
- Enough memory and a cool device: a hot device pauses inference (selector.ts:111-113).

**Screens and controls**

- Models screen: list of local models with status words 'Downloading', 'Download required' and others (models.tsx:40-48), download and cancel controls (installStore.ts:495-600).
- Performance settings: shows 'Tier 1', 'Tier 2' or 'Tier 3' with a plain description, and thermal states 'Normal', 'Fair', 'Warm', 'Hot' (performance.tsx:76-104, 132-151).
- Chat: error text 'Local Mode is active, but no on-device model is ready yet. Open Models to download or select a local model.' (chatExecutionStore.ts:459-460).

**Journey**

1. 1. Open the Models screen and pick a local model.
2. 2. If it is not installed, download it (a confirmation is used: downloadConfirmation.ts).
3. 3. Start or open a Local chat; the conversation's mode is local (conversationMode.ts:31-40).
4. 4. Send a message. The app resolves the model to a file path or system model (localModelRuntime.ts:80-150) and calls localGenerate (chatExecutionStore.ts:3098).
5. 5. Tokens stream into the reply as they are produced (chatExecutionStore.ts:3112-3120).
6. 6. The turn ends with the full text; speed and peak memory are recorded locally (3066-3070).

**What the person sees and gets**

- Streaming text, optional reasoning block parsed from the output (chatExecutionStore.ts:3052-3090).
- Plain failure messages: 'Your device is too warm to run the on-device model...' and notes for unavailable assets or context too long (chatExecutionStore.ts:1373-1404).
- 'The local model returned an empty response. Try again with a shorter prompt.' (chatExecutionStore.ts:~3135).

**Settings**

- Settings > Performance (tier, thermal state, memory).
- Models screen selection and downloads.
- Mode choice Local or Cloud for the chat; chats are kept separate: 'This is a Local Mode chat. Start a separate AGI Cloud chat to use Cloud models.' (chatExecutionStore.ts:2264-2269).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Three-tier selection and generation in local-llm: thermal check, Tier 1 when the system model matches, Tier 2 with a preset, Tier 3 with a model path (selector.ts:105-150).
- Tier 3 loads llama.rn lazily; if the native module is missing the loader returns null (tier3.ts:26-37).
- Mobile chat Local path: mode decision, model resolution, streaming and error mapping (chatExecutionStore.ts:2258-2290, 3040-3140, 1373-1404).
- Installed models are recorded in the app's local database with format, size, hash and path (apps/mobile/storage/installedModels.ts:1-60).
- Downloads run through downloadModel (apps/mobile/services/modelDownload.ts:432; installStore.ts:203).
- Desktop refusal is enforced in code and tested (dispatcher.ts:3367; apps/desktop/electron/__tests__/dispatcher.test.ts:1021-1028).

**Incomplete**

- Desktop: the Electron shell refuses on-device inference while the product context says local inference on desktop must be free of any subscription. The decision doc keeps 'Inference stays Managed Cloud' (docs/decisions/2026-09-15-founder-decisions.md:87-89) and the dispatcher comment says local coding sessions reach local models through the bundled CLI (dispatcher.ts:3235-3241). Whether the CLI path is exposed to a Desktop user as free local chat: unknown.

**Present but disconnected or switched off**

- Desktop local-model commands local_model_servers, local_model_list, local_chat_start, local_chat_cancel, local_model_settings_read, local_model_settings_write are defined in the shared contract (packages/contracts/local-runtime/src/inference.ts:3-10) but the Electron dispatcher answers every one with 'unsupported-platform' (dispatcher.ts:3367-3369).

**Not available**

- Desktop (Electron): on-device inference refused (dispatcher.ts:3242, 3367).
- Web, VS Code, Chrome: no on-device model runtime in the code read [inferred; not searched exhaustively].

## 4. Required behaviour

**Established requirements**

- A local model runtime runs inference on the device. Platform status: done. (source: S102.17 (brief item))
- The phone runs a local model through the local-llm package. (source: S102.17 Should line; verified at packages/platform/local-llm/src/tier3.ts:26-37 and selector.ts:105)
- A conversation is local when its execution mode is local. (source: S102.17 Should line; verified at apps/mobile/app/_layout.tsx:187-196 and apps/mobile/src/features/chat/utils/conversationMode.ts:31-40)
- Local mode needs no AGI account, stores data locally and keeps local files local. (source: doc: docs/product/requirements.md:476-486)
- If a local model cannot call tools, hide or disable tool use for that route. (source: doc: docs/product/requirements.md:299)
- The Electron Desktop answers every conversation in the cloud and refuses on-device inference. (source: doc: docs/decisions/2026-09-15-founder-decisions.md:78-89; apps/desktop/electron/runtime/dispatcher.ts:3235-3242)

**Acceptance criteria**

1. With a downloaded local model and airplane mode on, a Local chat on the phone returns an answer.
2. With no model installed, sending in a Local chat shows 'Local Mode is active, but no on-device model is ready yet...' and no network request to AGI is made.
3. A Local chat refuses a Cloud model with 'This is a Local Mode chat. Start a separate AGI Cloud chat to use Cloud models.'
4. When the phone is thermally throttled, the reply is the 'too warm' message, not a raw error.
5. Cancelling during generation stops tokens and leaves no half-written final reply.
6. On Desktop (Electron), each local_* command returns an error with code 'unsupported-platform'.
7. A Local chat works while signed out.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local turns should not be metered against a plan [inferred from the product requirement and the Local branch showing no plan check in the code read].
- A missing native module must degrade to a readable message, not a crash [inferred from tier3.ts:26-37 returning null and localSetupMessage mapping].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide and document whether Desktop gets free local chat through the bundled CLI or stays Cloud-only, and align the decision doc with the product context.
- [proposed] Add a test that a Local send makes no network call.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | localGenerate and tier selection | `packages/platform/local-llm/src/selector.ts` | Chooses Tier 1, 2 or 3 and generates (105-150); load and unload (150-196). |
| service | detectCapabilities | `packages/platform/local-llm/src/capabilities.ts` | Reads OS native modules and RAM; Tier 2 needs 3500 MB; Tier 3 always available (4-80). |
| service | Tier 3 runtime (llama.rn) | `packages/platform/local-llm/src/tier3.ts` | Lazy native module loader (26-37), context size cap, stop words, image support. |
| service | Tier 2 runtime (ExecuTorch) | `packages/platform/local-llm/src/tier2.ts` | Loads presets, reports download progress, generates. |
| service | Tier 1 runtime (OS model) | `packages/platform/local-llm/src/tier1.ts` | Calls the phone's built-in model through native modules on iOS and Android. |
| config | Local model catalog | `packages/platform/local-llm/src/catalog.ts` | Local model list with download URLs on an outside host (4-12, 80, 105). |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Decides local or cloud (2258-2290), calls localGenerate (3098), maps failures (1373-1404). |
| service | conversationMode | `apps/mobile/src/features/chat/utils/conversationMode.ts` | executionModeForModel and executionModeForConversation (5-40). |
| screen | Root layout local-chat check | `apps/mobile/app/_layout.tsx` | isLocalChatOnThisDevice reads the stored conversation mode (187-196) used by link handling. |
| service | resolveLocalModelRef | `apps/mobile/src/features/model-picker/localModelRuntime.ts` | Turns a chosen model or Auto into a path, system model, or an error. |
| store | installStore | `apps/mobile/src/features/model-picker/installStore.ts` | Download jobs, progress, cancel, readiness. |
| service | downloadModel | `apps/mobile/services/modelDownload.ts` | Downloads a model file to the phone (432). |
| table | installed_models | `apps/mobile/storage/installedModels.ts` | SQLite rows: id, display_name, runtime, format, size_bytes, sha256, local_path, installed_at, last_used_at. |
| store | Mobile database | `apps/mobile/storage/db.ts` | agi_mobile.db with an encryption key kept in secure storage (DB_NAME, DB_KEY_STORAGE_ID). |
| screen | Models screen | `apps/mobile/app/(app)/models.tsx` | Lists local models and their status. |
| screen | Performance settings | `apps/mobile/app/(app)/settings/performance.tsx` | Shows tier, thermal state and memory. |
| service | Desktop local-inference refusal | `apps/desktop/electron/runtime/dispatcher.ts` | Refuses local_* commands with unsupported-platform (3235-3242, 3360-3369). |
| schema | Local inference command contract | `packages/contracts/local-runtime/src/inference.ts` | Lists LOCAL_INFERENCE_COMMANDS and local server ids (Ollama, LM Studio). |
| test | local-llm tests | `packages/platform/local-llm/src/__tests__` | tier1, tier2, tier3, selector-tier2, catalog, multimodal, progress tests. |
| test | Desktop refusal test | `apps/desktop/electron/__tests__/dispatcher.test.ts` | 'refuses every local inference command on the cloud-only shell' (1021-1028). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person sends a message in a chat whose mode is local; the store checks it is a local model and not a Cloud model. | device | apps/mobile/stores/chat/chatExecutionStore.ts:2258-2290 |
| The chosen model (or Auto) is resolved to a file path, a system model, or an error if not downloaded. | device | apps/mobile/src/features/model-picker/localModelRuntime.ts:80-150 |
| If the model file is missing, the person downloads it from the catalog URL on an outside host; this is the only network step. | outside service | packages/platform/local-llm/src/catalog.ts:4-12; apps/mobile/services/modelDownload.ts:432 |
| localGenerate checks capabilities and heat, then runs Tier 1, Tier 2 or Tier 3 on the phone. | device | packages/platform/local-llm/src/selector.ts:105-150 |
| Tokens stream into the chat state and the final text is saved in the phone's local database. | device | chatExecutionStore.ts:3052-3140 [save step inferred from tests chat-local-persistence-durability.test.ts] |
| On Desktop (Electron) the same request is refused before any runtime starts. | device | apps/desktop/electron/runtime/dispatcher.ts:3367 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Installed model files and their records | Phone file storage; rows in the installed_models table of agi_mobile.db | No (local device records) [inferred] | Kept until removed in the Models screen; removal flow not read (unknown) |
| Local chat messages | agi_mobile.db on the phone, key in secure storage | Local chats are separate from Cloud chats; a 'Synced from Local Mode' conversation title exists in a sync feature (grep result in apps/mobile/src), so some sync path exists; rules unknown | Local data reset and wipe flows exist (tests local-data-reset.test.ts, local-data-wipe-order.test.ts); details unknown |
| Speed and peak-memory samples | Recorded by the chat store on the device (chatExecutionStore.ts:3066-3070) | Unknown | Unknown |

**Models and providers.** No provider is used: models come from the local-llm catalog and run in on-device runtimes. No folder under packages/ai/providers corresponds to the phone runtime [inferred]. The catalog's download host is an outside service.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not required: 'Local Mode works without one' (Common.tsx:179). |
| Permissions | No special permission found for local chat. Storage for model files; photo access only when attaching images [inferred]. |
| Subscription | None found in the Local branch of chatExecutionStore.ts (lines 2258-2300, 3040-3140 read; the 6188-line file was not read in full). |
| Limits and metering | None found in the code read for Local turns. Device limits only: RAM (3500 MB for Tier 2), thermal pause, context cap of 8192 tokens on mobile (tier3.ts:resolveContextTokens). |
| Feature flags | None found in the code read for Local Mode itself. |
| Model compatibility | Only models in the local catalog or installed on the device. Models below Tier 2 RAM fall to Tier 3 (capabilities.ts:74-76). A model without a runnable package gives 'No runnable local package is configured for model ...' (selector.ts). |
| Provider restrictions | A Local chat refuses Cloud models and a Cloud chat refuses local models (chatExecutionStore.ts:2264-2284). Local to Cloud moves are separate chats, in line with the trust-boundary rule (doc: AGENTS.md section 6). |
| Local mode | This feature is Local mode on the phone. Nothing leaves the phone except the model download. Live voice and Cloud features are unavailable in Local Mode ('Live voice runs in AGI Cloud, so Local Mode stays turn based.', liveVoiceAvailability.ts:17-18). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No model ready | Shows the 'Open Models to download or select a local model' message. | chatExecutionStore.ts:459-460, 1373-1388 |
| Native runtime module missing | The Tier 3 loader returns null; the setup message maps 'No local runtime' to the no-model message. | packages/platform/local-llm/src/tier3.ts:26-37; chatExecutionStore.ts:1373-1388 |
| Thermal throttling | localGenerate throws 'Device is thermally throttled, inference paused.' and the chat shows a plain 'too warm' message. | selector.ts:111-113; chatExecutionStore.ts:1389-1392 |
| Tier 2 fails | Logs a warning and falls to Tier 3 when a model path exists; otherwise rethrows. | selector.ts:121-140 |
| Cancel | An AbortSignal stops generation; an aborted result returns without a final reply. | chatExecutionStore.ts:3098-3125; tier3.test.ts:78 |
| Model no longer available | 'This Local Mode chat uses a model that is no longer available on this device. Open Models and pick a local model to continue.' | chatExecutionStore.ts:1294 |
| Empty output | Shows 'The local model returned an empty response. Try again with a shorter prompt.' | chatExecutionStore.ts:~3135 |
| Desktop | Refuses with unsupported-platform and a plain sentence. | dispatcher.ts:3242, 3367 |
| Offline | Local generation needs no network; only a first download does [inferred from the flow]. | catalog.ts:4-12 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/platform/local-llm/src/__tests__/tier3.test.ts`: Context size from catalog with a mobile cap, chat messages and stop words, abort stops a running completion, image attach with projector and failure path (titles read).
- `packages/platform/local-llm/src/__tests__/selector-tier2.test.ts`: Default and lite presets are valid, streamed tokens, message order, download progress once per percent (titles read).
- `packages/platform/local-llm/src/__tests__/tier1.test.ts`: Tier 1 native-module generation [inferred from name].
- `packages/platform/local-llm/src/__tests__/tier2.test.ts`: Tier 2 runtime [inferred from name].
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Every local inference command is refused with unsupported-platform on the cloud-only shell (1021-1028).
- `apps/mobile/__tests__/local-llm-selector.test.ts`: Mobile use of the selector [inferred from name].
- `apps/mobile/__tests__/local-first-turn.test.ts`: First Local turn [inferred from name].
- `apps/mobile/__tests__/FirstRunLocalModelReadiness.test.tsx`: First-run model readiness [inferred from name].
- `apps/mobile/__tests__/local-model-turn-failure.test.ts`: Failure handling for a local turn [inferred from name].
- `apps/mobile/__tests__/installed-models-storage.test.ts`: Installed model rows [inferred from name].
- `apps/mobile/__tests__/executorch-model-lifecycle.test.ts`: Tier 2 model lifecycle [inferred from name].
- `apps/mobile/__tests__/local-chat-attachments.test.ts`: Attachments in Local chats [inferred from name].

**Test scenarios**

- **Offline local chat**
  1. Download a local model on Wi-Fi.
  2. Turn on airplane mode.
  3. Open a Local chat and send 'hello'.
  - Expected: Tokens stream in and a full reply appears; no network request is made.
- **No model**
  1. Fresh install, signed out.
  2. Open a Local chat and send a message.
  - Expected: The 'no on-device model is ready yet' message appears with a way to open Models.
- **Wrong mode**
  1. Open a Local chat and select a Cloud model, or send in it.
  - Expected: 'This is a Local Mode chat. Start a separate AGI Cloud chat...' and nothing is sent.
- **Heat**
  1. Run a long local conversation until the device reports Hot.
  - Expected: The 'too warm' message appears, generation pauses.
- **Desktop refusal**
  1. In the Electron Desktop bridge call local_chat_start.
  - Expected: Response ok false, code 'unsupported-platform'.
- **Cancel**
  1. Start a long reply and press stop.
  - Expected: Streaming ends and no partial message is marked as final.

**Where to look when it fails**

- Console warnings '[chat] local inference failed:' and '[local-llm] Tier 2 failed, falling back to Tier 3' (chatExecutionStore.ts:1375; selector.ts:121-125).
- Error texts: 'No local model is ready...', 'No runnable local package is configured for model ...', 'Device is thermally throttled, inference paused.'.
- Table installed_models in agi_mobile.db; Performance settings screen shows the active tier.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Desktop (Electron) refuses on-device inference, but the product context requires local inference on desktop and on mobile to be free of any subscription.** Affects: Desktop users; Local mode on Desktop.. Evidence: dispatcher.ts:3235-3242, 3367; docs/decisions/2026-09-15-founder-decisions.md:87-89; contract commands at packages/contracts/local-runtime/src/inference.ts:3-10.. Work needed: Owner decision to keep Cloud-only or to enable the local_* commands (Ollama, LM Studio) with consent; update the decision doc either way.
- **The brief marks S102.17 platform done and cites dispatcher.ts:799, which is the dispatcher, not a model runtime; the Desktop has no runtime.** Affects: Brief accuracy.. Evidence: S102.17 item; dispatcher.ts:3367.. Work needed: Split the brief item per platform.
- **No test found that a Local turn makes no network call or no plan check.** Affects: Mobile Local Mode promise (free, private).. Evidence: Tests found are listed under verification; none named for network silence.. Work needed: Add a test with a failing fetch that sends a Local message.
- **The rest of chatExecutionStore.ts (6188 lines) was not read, so absence of subscription checks in Local turns is not proven.** Affects: Free-local requirement.. Evidence: File length vs the ranges read.. Work needed: Full read or a guard test.

**Depends on**

- SYS-local-inference
- SYS-execution-boundaries
- SYS-model-catalog-and-routing
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- mode:local
- surface:mobile
- surface:desktop
- store:agi_mobile.db
- table:installed_models
- file:packages/platform/local-llm/src/selector.ts

## Unknown

- Whether the Electron Desktop exposes free local chat to users through the bundled CLI.
- How and when model files and local chats are deleted by the user.
- Whether any sync path moves Local chat content off the phone, and under what consent.
- Subscription or sign-in checks elsewhere in chatExecutionStore.ts (not fully read).
- Behaviour on Android versus iOS for Tier 1 beyond the capability code.
