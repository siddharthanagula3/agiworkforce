---
id: "F109-09"
type: "feature"
title: "On-device runtime controls and health"
aliases: ["Performance screen", "Device Tier", "Active Model", "Load / Unload local models", "Run Benchmark", "local runtime health", "hardware capability panel"]
area: "109 Optional native and ambient extensions"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "missing", vscode: "missing", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S109.20", "S109.21", "S109.22"]
depends_on: ["surface:mobile", "surface:cli", "surface:vscode", "mode:local", "SYS-local-inference", "SYS-observability-and-operations", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "F109-08", "F109-10", "file:packages/platform/local-llm/src/selector.ts", "file:apps/mobile/app/(app)/settings/performance.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-09 On-device runtime controls and health

On AGI Mobile, Settings, General, Performance shows the phone's RAM, thermal state, the local runtime tier it can use and what is loaded in memory. The person can load or unload an on-device model and run a benchmark. Errors from the local runtime become plain messages. CLI and VS Code only probe local servers.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.20](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10920), [S109.21](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10921), [S109.22](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10922).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | built | built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Reads device capability (RAM, which system model runtime exists, whether the ExecuTorch tier is available), shows the tier and thermal state, lets the person load or unload a model, and runs a timed benchmark (apps/mobile/app/(app)/settings/performance.tsx:74-110, :503-545).

**Why it exists.** On-device models depend on phone hardware; people need to know what will run, free memory on demand and see why local chat fails. The brief lists a hardware panel, load and unload controls and runtime health (doc: knowledge-base/data/area-briefs/109-optional-native-and-ambient-extensions.md, S109.20-S109.22).

**Who uses it.** Phone users running local models, and testers checking device support.

**Problems it solves**

- Not knowing why a local model will not run.
- A loaded model holding memory.
- Unclear failures such as heat or out-of-memory.

**Use cases**

- Check whether a phone gets the system model, the hardware-accelerated tier or the general tier.
- Unload models to free RAM before another app.
- Run a benchmark after downloading a model.

## 2. User experience

**Where to find it**

- Mobile: Settings, General, row 'Performance' (apps/mobile/src/features/settings/general/index.tsx:183-190). Screen header 'Performance' (performance.tsx).
- CLI: 'agi models status' and 'agi models scan' (apps/cli/src/lib.rs:1868-1879) show local model servers, not on-device models.
- VS Code: no load or health panel found; settings text only mentions Ollama and LM Studio (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1600-1601).

**Before you start**

- A selected on-device model for Load and benchmark; a downloaded model for most (see F109-08).
- System-managed models (built-in) need no load and show no button.

**Screens and controls**

- 'Device Tier' card: label 'Tier 1', 'Tier 2' or 'Tier 3' with description, rows 'RAM', 'Thermal', 'Capabilities' (performance.tsx:594-690).
- 'Active Model' card: model name, size or 'System managed', status line and button 'Load' or 'Unload local models'; accessibility labels 'Load model now' and 'Unload local models from memory' (performance.tsx:701-790).
- Stat chips 'avg tok/s', 'avg TTFT', 'mem peak'.
- 'Benchmark This Device' card with button 'Run Benchmark' (shows 'Benchmarking…' while running) (performance.tsx:940-977).
- Toggle 'Show performance chip in chat' (performance.tsx:1077).

**Journey**

1. 1. Open Settings, General, Performance.
2. 2. Read the tier card and the RAM and thermal rows.
3. 3. In 'Active Model', tap 'Load' to put the selected model in memory, or 'Unload local models' to free it.
4. 4. Tap 'Run Benchmark'; the app announces 'Running benchmark. Please wait.'
5. 5. Read the last benchmark result.

**What the person sees and gets**

- Status text: 'Loaded in memory', 'Another local model is loaded in memory', 'Not loaded; an installed model loads on use', 'Working…', 'Managed by the system; availability is checked on use' (performance.tsx:732-753).
- Load failure: 'Failed to load: Try again, or choose a smaller model.'; unload failure: 'Failed to unload: Wait for any active response to finish, then try again.' (performance.tsx:503-545).
- Benchmark with no available model: 'Choose an available on-device model in Models before running a benchmark. Download it first if needed.' also announced to screen readers (performance.tsx:420-426).
- AICore note: 'AICore is downloading its model. This device moves to Tier 1 when done.' (performance.tsx:67-72).
- In chat, local failures read: 'Your device is too warm to run the on-device model. Let it cool down, then try again.' and 'This device ran out of memory for the on-device model. Close other apps, or choose a smaller model.' (apps/mobile/stores/chat/chatExecutionStore.ts:1389-1416).

**Settings**

- 'Show performance chip in chat' stored under key perf-show-chip-v1, default on (performance.tsx:53, :309).
- Model selection comes from the model picker (F109-08).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Capability detection: RAM and thermal flag from the system-model native modules, tier 2 available at 3500 MB or more (or unknown RAM with ExecuTorch present), tier 3 always (packages/platform/local-llm/src/capabilities.ts:4, :34-86; types.ts).
- loadLocalModel, unloadLocalModels and loadedLocalModel in the local-llm package (packages/platform/local-llm/src/selector.ts:165-196).
- Performance screen load and unload with busy guard, failure messages and live status (performance.tsx:503-545).
- Benchmark records tokens per second, first-token time, peak memory and thermal state (apps/mobile/services/performanceMonitor.ts:123-170).
- Plain-language local error mapping in chat (chatExecutionStore.ts:1371-1416).
- Thermal refusal in the runtime: 'Device is thermally throttled, inference paused.' (selector.ts:36-38, :110-112).

**Incomplete**

- Thermal state shows only 'nominal' or 'serious', because getThermalState maps a single boolean (performanceMonitor.ts:42-44) [fair and critical values exist in the type but are not produced].
- There is no separate 'runtime health' view; health is the tier card, thermal row and the Active Model status text [inferred].
- The brief marks S109.22 done for CLI and VS Code, but the cited lines do not show health for on-device models: the CLI probes Ollama and LM Studio (apps/cli/src/local_models.rs:175-290) and the VS Code lines cited in the brief are chat state code unrelated to health (ChatStateManager.ts:1441, :3863).

**Present but disconnected or switched off**

- No load button for system-managed models (fileSizeBytes 0), by design (performance.tsx:724-732, :761).

**Not available**

- CLI and VS Code: no hardware panel and no load or unload of on-device models. CLI has a probe of local servers: Running, Unreachable, Faulty or Blocked per provider (apps/cli/src/local_models.rs:21-26, :377-402).
- Desktop and Chrome: not covered by the brief.

## 4. Required behaviour

**Established requirements**

- The app shows the device's hardware capability for local models (RAM, accelerators, supported runtimes). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.20)
- The user can load a local model into memory and unload it to free resources. (source: S109.21 (same brief))
- The app shows whether the local model runtime is running and healthy, with errors when it is not. (source: S109.22 (same brief))
- Capabilities come from the local-llm package; loadedLocalModel reports what is in memory. (source: packages/platform/local-llm/src/selector.ts:165-170)
- A benchmark without an installed model shows the 'Choose an available on-device model in Models...' message and announces it. (source: apps/mobile/app/(app)/settings/performance.tsx:420-426)

**Acceptance criteria**

1. The tier card shows Tier 1, 2 or 3 matching the device, with RAM in the 'RAM' row.
2. 'Load' on a downloaded model changes the status to 'Loaded in memory'; 'Unload local models' returns it to 'Not loaded; an installed model loads on use'.
3. Load failure shows 'Failed to load' text in the live region; the button stays usable after.
4. 'Run Benchmark' with no installed model shows the Models message and no result is saved.
5. A successful benchmark updates 'Last benchmark result' and is announced to screen readers.
6. With a throttled device, a local chat shows 'Your device is too warm to run the on-device model...'.
7. Buttons are disabled while a load, unload or benchmark runs.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- System-managed models need no load control because the OS manages them [inferred from performance.tsx:724-732].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show all four thermal levels reported by the OS.
- [proposed] Add a runtime health row that names the active runtime and its last error.
- [proposed] Give the CLI and VS Code a clear 'on-device models are mobile only' statement rather than 'partial'.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Performance screen | `apps/mobile/app/(app)/settings/performance.tsx` | Tier card, Active Model, load or unload, benchmark, charts. |
| service | selector (loadLocalModel, unloadLocalModels, loadedLocalModel, localGenerate) | `packages/platform/local-llm/src/selector.ts` | Chooses the runtime tier and loads or releases models. |
| service | capabilities | `packages/platform/local-llm/src/capabilities.ts` | detectCapabilities, RAM threshold, thermal flag. |
| config | local-llm types | `packages/platform/local-llm/src/types.ts` | DeviceCapabilities, tiers, runtime names. |
| service | tier1 (system model) | `packages/platform/local-llm/src/tier1.ts` | Apple Foundation Models and AICore calls. |
| service | tier2 (ExecuTorch) | `packages/platform/local-llm/src/tier2.ts` | Load, release and generate for ExecuTorch presets. |
| service | tier3 (llama.rn) | `packages/platform/local-llm/src/tier3.ts` | Load, release and generate for GGUF files. |
| service | performanceMonitor | `apps/mobile/services/performanceMonitor.ts` | Thermal state, benchmark, event storage. |
| service | localModelRuntime | `apps/mobile/src/features/model-picker/localModelRuntime.ts` | resolveLocalModelRef maps a selected id to a model path. |
| store | chatExecutionStore error mapping | `apps/mobile/stores/chat/chatExecutionStore.ts` | localSetupMessage turns runtime errors into plain messages. |
| service | AGIFoundationModels (iOS) | `apps/mobile/native/ios/AGIFoundationModels.swift` | Native capabilities, thermal flag and memory footprint on iOS. |
| service | AGIAICoreModule (Android) | `apps/mobile/native/android/AGIAICoreModule.kt` | Native capabilities and memory footprint on Android. |
| command | agi models status and scan | `apps/cli/src/lib.rs` | CLI local server probe, a separate feature (lines 1861-1887, 4764-4777). |
| service | CLI local_models | `apps/cli/src/local_models.rs` | Probes Ollama and LM Studio; health Running, Unreachable, Faulty, Blocked. |
| test | PerformancePage test | `apps/mobile/__tests__/PerformancePage.test.tsx` | Performance screen behaviour. |
| test | local-model-turn-failure test | `apps/mobile/__tests__/local-model-turn-failure.test.ts` | Local failure handling (by name). |
| test | selector tests | `packages/platform/local-llm/src/__tests__/selector-tier2.test.ts` | Tier selection (by name). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Screen opens and reads capabilities from native modules and the local-llm package. | device | performance.tsx:358-361; capabilities.ts:34-86 |
| Person taps Load; the selected id is resolved to a model path or preset and loaded into the runtime. | device | performance.tsx:503-518; selector.ts:172-191 |
| Unload releases ExecuTorch and llama.rn models. | device | selector.ts:193-196 |
| Benchmark generates text with a fixed prompt, counts tokens and time and stores a result. | device | performanceMonitor.ts:123-170 |
| During a chat turn, a failure string from the runtime is mapped to a user message. | device | chatExecutionStore.ts:1371-1416 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Benchmark results (up to 50) | MMKV key benchmark-history-v1 | No sync code found | Trimmed to 50; clearPerfData exists but no caller outside tests was found |
| Capability snapshot | Memory in the local-llm package | No | Refreshed before each local generation (selector.ts:96-99) |

**Models and providers.** No provider and no subscription take part. The runtime tiers are the system model (Apple Foundation Models on iOS or AICore on Android), ExecuTorch and llama.rn. Which models are offered is owned by the catalog (see F109-08) (packages/platform/local-llm/src/selector.ts:35-103).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for the Performance screen. |
| Permissions | none found in the code. |
| Subscription | none found in the code; local inference is intended to be free. |
| Limits and metering | Tier 2 needs at least 3500 MB RAM (capabilities.ts:4). Benchmark history capped at 50. No usage metering. |
| Feature flags | none found for this screen. |
| Model compatibility | System-managed models cannot be loaded or unloaded by the user; ExecuTorch needs tier 2; GGUF files use llama.rn. |
| Provider restrictions | none found in the code. |
| Local mode | This feature is the Local mode control surface on mobile and runs entirely on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | A spinner shows while capabilities are read. | performance.tsx:599 |
| No model selected | 'No local model selected. Download one to see stats.'; benchmark button disabled. | performance.tsx:406, :836 |
| Busy | Load, unload and benchmark are disabled while one runs; second tap ignored. | performance.tsx:408-410, :503-505, :763 |
| Load error | Red text with 'Failed to load' and a retry hint. | performance.tsx:503-524 |
| Unload error | 'Wait for any active response to finish, then try again.' | performance.tsx:527-545 |
| Thermal | Local inference stops with a throttled message. | selector.ts:36-38 |
| Benchmark interrupted | 'Benchmark was interrupted. No result was saved.' | performanceMonitor.ts:157 |
| Accessibility | Benchmark start and result are announced; status line is a polite live region; thermal state has a label. | performance.tsx:416-426, :456-466, :729-731 |
| Offline | Not applicable; all steps run on the device. | performance.tsx |
| Device without system model | Falls to Tier 2 or Tier 3; capability line lists only available runtimes. | performance.tsx:74-110, :680-690 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/PerformancePage.test.tsx`: The Performance screen (by name; it exports and checks PERF_CHIP_SHOW_KEY at line 345).
- `apps/mobile/__tests__/local-model-turn-failure.test.ts`: Local turn failures (by name).
- `apps/mobile/__tests__/local-model-recovery.test.ts`: Local model recovery (by name).
- `packages/platform/local-llm/src/__tests__/selector-tier2.test.ts`: Selector with tier 2 (by name).
- `packages/platform/local-llm/src/__tests__/tier1.test.ts`: System model tier (by name).
- `packages/platform/local-llm/src/__tests__/tier2.test.ts`: ExecuTorch tier (by name).
- `packages/platform/local-llm/src/__tests__/tier3.test.ts`: llama.rn tier (by name).

**Test scenarios**

- **Tier card**
  1. Open Settings, General, Performance on a phone with a system model, then on one without.
  - Expected: Tier 1 on the first, Tier 2 or 3 on the second; RAM matches the device.
- **Load and unload**
  1. Download a model.
  2. Open Performance, tap 'Load', then 'Unload local models'.
  - Expected: Status reads 'Loaded in memory' then 'Not loaded; an installed model loads on use'.
- **Benchmark with no model**
  1. On a fresh install with no model, tap 'Run Benchmark' (if enabled) with a stale selection.
  - Expected: The 'Choose an available on-device model in Models...' message shows and a screen reader reads it.
- **Heat**
  1. Warm the phone until the OS reports serious thermal state; send a local message.
  - Expected: 'Your device is too warm to run the on-device model...' appears.
- **Unload during reply**
  1. Start a long local reply.
  2. Tap Unload.
  - Expected: 'Wait for any active response to finish, then try again.'
- **CLI probe**
  1. Run 'agi models status' with a local server stopped.
  - Expected: Provider listed as 'not running' with a 'not reachable' error.

**Where to look when it fails**

- Console warnings '[local-model] load failed', '[local-model] unload failed', '[local-llm] Tier 2 failed, falling back to Tier 3 when possible:', '[chat] local inference failed:'.
- MMKV keys benchmark-history-v1, perf-events-v1.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md)

## 10. Gaps and dependencies

- **No on-device load, unload or hardware panel in CLI or VS Code, and the brief marks health as done there from lines that are about local servers or chat state.** Affects: CLI and VS Code users and the accuracy of the brief.. Evidence: apps/cli/src/local_models.rs:175-290; apps/extension-vscode ChatStateManager.ts:1441, :3863. Work needed: Correct the brief; decide product scope.
- **Thermal state has two values only.** Affects: Mobile users.. Evidence: performanceMonitor.ts:42-44. Work needed: Read the OS level.
- **No accelerator list beyond runtime names (the brief asks for accelerators).** Affects: Mobile users.. Evidence: performance.tsx:680-690. Work needed: Decide what to show.
- **No explicit runtime health or last-error view.** Affects: Mobile users diagnosing failures.. Evidence: performance.tsx (no such section). Work needed: Add or accept the current status text.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:mobile
- surface:cli
- surface:vscode
- mode:local
- SYS-local-inference
- SYS-observability-and-operations
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- F109-08
- F109-10
- file:packages/platform/local-llm/src/selector.ts
- file:apps/mobile/app/(app)/settings/performance.tsx

## Unknown

- Whether 'accelerators' beyond runtime names are available from the native modules.
- Whether the AICore model download state is shown elsewhere.
- Real-device behaviour was not run; no recorded test result was read.
- What the VS Code cited lines were intended to show for health.
