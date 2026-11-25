---
id: "F109-10"
type: "feature"
title: "On-device performance dashboard"
aliases: ["Performance dashboard", "Local resource and compute dashboard", "performance chip", "Tok/s, Last 7 Days", "First-Token Latency, Last 7 Days", "perf events"]
area: "109 Optional native and ambient extensions"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "partial", cli: "missing", vscode: "missing", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S109.25"]
depends_on: ["surface:mobile", "mode:local", "SYS-local-inference", "SYS-observability-and-operations", "SYS-chat-turn-pipeline", "F109-09", "file:apps/mobile/services/performanceMonitor.ts", "file:apps/mobile/stores/chat/chatExecutionStore.ts", "store:perf-events-v1", "store:benchmark-history-v1"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-10 On-device performance dashboard

After each on-device reply, AGI Mobile records speed in tokens per second, time to first token, peak memory and thermal state. Settings, General, Performance shows averages, two seven-day charts and a benchmark result. An optional chip under replies shows the speed. CLI and VS Code have nothing like it.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.25](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10925).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Measures every local reply, stores up to 500 events, and draws them on the Performance screen as averages and charts (apps/mobile/services/performanceMonitor.ts:38-100; apps/mobile/app/(app)/settings/performance.tsx:795-935).

**Why it exists.** Local model speed varies by phone, model and heat. People and testers need numbers to choose a model and to see slowdowns. The brief asks for speed, latency, memory and thermal state over time (doc: knowledge-base/data/area-briefs/109-optional-native-and-ambient-extensions.md, S109.25).

**Who uses it.** Phone users on local models and engineers checking device performance.

**Problems it solves**

- No evidence why local chat feels slow.
- Hard to compare models on one phone.

**Use cases**

- See that replies slow when the phone warms up.
- Pick a faster model after comparing tokens per second.
- Hide the speed chip to keep chat clean.

## 2. User experience

**Where to find it**

- Mobile: Settings, General, 'Performance' (apps/mobile/src/features/settings/general/index.tsx:183-190).
- Mobile chat: chip under an on-device assistant reply (apps/mobile/src/features/chat/components/MessageBubble.tsx:3115-3125).
- CLI and VS Code: not available (area brief S109.25).

**Before you start**

- At least one on-device reply with more than one token (chatExecutionStore.ts:3138-3149).
- Rows 'avg tok/s' show '--' until at least one event exists (performance.tsx:795-815).

**Screens and controls**

- Stat chips 'avg tok/s', 'avg TTFT', 'mem peak', and text 'Rolling average over last N inferences'.
- Text 'The app is using NMB of memory now' refreshed every 2 seconds (performance.tsx:371-385).
- Chart cards 'Tok/s, Last 7 Days' with 'N events' and 'First-Token Latency, Last 7 Days' (performance.tsx:889-935).
- 'Last benchmark result' block with tok/s, TTFT, mem peak and thermal.
- Toggle 'Show performance chip in chat' with sublabel 'Shows tok/s under on-device replies' (performance.tsx:1077-1078).

**Journey**

1. 1. Send a message with an on-device model selected.
2. 2. When the reply completes, the app records one event.
3. 3. Open Settings, General, Performance.
4. 4. Read the averages and the two charts, or run a benchmark.

**What the person sees and gets**

- Averages over the last 100 events; charts over 7 days; chart accessibility labels such as 'Tokens per second over the last 7 days. N data points. Most recent: X t/s.' (performance.tsx:907, :930).
- Chip under each local reply when the toggle is on.

**Settings**

- Toggle 'Show performance chip in chat' (key perf-show-chip-v1, default on).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- One event is recorded per completed local reply when decode time is above zero and more than one token arrived: tokens per second equals count over decode time, rounded to 0.1 (apps/mobile/stores/chat/chatExecutionStore.ts:3138-3149).
- First-token latency is the time from the start of generation to the first token (chatExecutionStore.ts:3143-3149).
- Thermal state is recorded from getThermalState (performanceMonitor.ts:42-44).
- Peak memory is now sampled once a second during the reply through native modules on iOS and Android and recorded (chatExecutionStore.ts:3094-3112, :3146; apps/mobile/services/processFootprint.ts:16-45; apps/mobile/native/ios/AGIFoundationModels.swift:117-129; apps/mobile/native/android/AGIAICoreModule.kt:85-89). The brief's note that peak memory stays 0 is out of date.
- Events are stored in MMKV, capped at 500, filtered to 7 days for charts (performanceMonitor.ts:38-86).
- Dashboard view exists: averages, charts and benchmark (performance.tsx:795-935). The brief's 'not sure' about a view is answered: it exists.

**Incomplete**

- Peak memory is the whole app's footprint, not the model's [inferred from phys_footprint and process PSS in the native code].
- Tokens are counted per token callback, not by a tokenizer, so tokens per second is approximate [inferred from localTokenCount += 1 at chatExecutionStore.ts:3109].
- First-token latency starts before the model loads, so it can include load time [inferred from localStartedAt at :3093].
- Thermal state has only two values (performanceMonitor.ts:42-44).
- If memory modules are missing, readMemoryFootprintMB returns null and peak stays 0 (processFootprint.ts:16-27).
- No call to clearPerfData outside its definition was found, so there is no 'clear' control (performanceMonitor.ts:116).

**Present but disconnected or switched off**

- none found.

**Not available**

- CLI and VS Code: no resource dashboard (area brief S109.25).
- Cloud or server-side aggregation of local performance: none found.

## 4. Required behaviour

**Established requirements**

- A dashboard shows local compute use: speed (tokens per second), latency, memory and thermal state over time. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.25)
- Tokens per second equals tokens divided by decode time, rounded to 0.1. (source: apps/mobile/stores/chat/chatExecutionStore.ts:3138-3149)
- The performance chip is controlled by a user toggle that defaults to on. (source: apps/mobile/app/(app)/settings/performance.tsx:309, :1077)

**Acceptance criteria**

1. After one local reply of several tokens, the Performance screen shows 'avg tok/s' with a number, and the chart card shows '1 events'.
2. With no local replies, the stat chips show '--' and the chart cards are absent.
3. Turning off 'Show performance chip in chat' hides the chip on new and existing replies.
4. Events older than 7 days no longer appear in the charts.
5. After 500 events the oldest are dropped.
6. Peak memory shows a positive number on a device where the native module answers.
7. Running a benchmark adds a point to the last benchmark block.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Events should stay on the device because there is no sync code [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Record the model id with each event so charts can be filtered by model.
- [proposed] Add 'Clear performance data' using the existing clearPerfData.
- [proposed] Count tokens with the runtime's tokenizer.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | performanceMonitor | `apps/mobile/services/performanceMonitor.ts` | recordPerfEvent, getPerfEventsLastDays, getRollingStats, benchmark history. |
| store | chatExecutionStore local turn | `apps/mobile/stores/chat/chatExecutionStore.ts` | Starts the memory sampler and records one event per local reply. |
| service | processFootprint | `apps/mobile/services/processFootprint.ts` | readMemoryFootprintMB and startPeakMemorySampler. |
| service | AGIFoundationModels memoryFootprintMB | `apps/mobile/native/ios/AGIFoundationModels.swift` | iOS memory footprint and thermal flag. |
| service | AGIAICoreModule memoryFootprintMB | `apps/mobile/native/android/AGIAICoreModule.kt` | Android memory footprint. |
| screen | Performance screen | `apps/mobile/app/(app)/settings/performance.tsx` | Charts, averages and the chip toggle. |
| component | PerformanceChip in MessageBubble | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Shows speed under an on-device reply. |
| store | perf-events-v1 | `apps/mobile/services/performanceMonitor.ts` | MMKV key holding up to 500 events. |
| store | benchmark-history-v1 | `apps/mobile/services/performanceMonitor.ts` | MMKV key holding up to 50 benchmark results. |
| service | isThermallyThrottled | `packages/platform/local-llm/src/capabilities.ts` | Thermal flag source. |
| test | process-footprint test | `apps/mobile/__tests__/process-footprint.test.ts` | Native read, invalid values, peak keeping, stop. |
| test | PerformancePage test | `apps/mobile/__tests__/PerformancePage.test.tsx` | Performance screen. |
| test | MessageBubblePerformanceChip test | `apps/mobile/__tests__/MessageBubblePerformanceChip.test.tsx` | Chip behaviour (by name). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A local turn starts a memory sampler and records start time. | device | chatExecutionStore.ts:3093-3095 |
| The local runtime generates; each token callback records the first token time and increments a counter. | device | chatExecutionStore.ts:3097-3112 |
| On finish the sampler stops and returns the peak. | device | chatExecutionStore.ts:3119-3121 |
| Speed is computed and recordPerfEvent stores the event. | device | chatExecutionStore.ts:3138-3149; performanceMonitor.ts:74-81 |
| The Performance screen reads events and shows them. | device | performance.tsx:371-385 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Perf events: time, tokens per second, first-token ms, peak memory MB, backend, thermal state | MMKV key perf-events-v1 | No sync code found | Max 500; charts use 7 days; no delete control found |
| Benchmark results | MMKV key benchmark-history-v1 | No | Max 50 |

**Models and providers.** Only local replies are measured. The backend name (system model, ExecuTorch or llama.rn) is stored; no model id and no provider is stored (performanceMonitor.ts:6-12). Cloud and own-key replies are not recorded.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code; local inference is free. |
| Limits and metering | 500 events, 50 benchmarks, 100-event rolling window, 7-day charts. |
| Feature flags | Chip toggle perf-show-chip-v1. |
| Model compatibility | Works for any local runtime tier that streams tokens. |
| Provider restrictions | none found in the code. |
| Local mode | Local only: the data never leaves the device as far as the code shows. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | '--' in chips; chart cards hidden. | performance.tsx:795-815, :884, :913 |
| Single token reply | No event recorded (needs more than one token and decode time above zero). | chatExecutionStore.ts:3138-3142 |
| Aborted or failed reply | No event is recorded on abort; on failure the sampler is stopped and the error is thrown. | chatExecutionStore.ts:3115-3123 |
| Native memory module missing | Memory shows '--' and peak is 0. | processFootprint.ts:16-27; performance.tsx:810-818 |
| Corrupt stored events | Read errors return an empty list. | performanceMonitor.ts:47-54 |
| Accessibility | Charts have text labels with the latest value. | performance.tsx:907, :930 |
| Offline | No effect; all local. | performanceMonitor.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/process-footprint.test.ts`: Native read, invalid values, null when module missing, peak across samples, stop polling.
- `apps/mobile/__tests__/PerformancePage.test.tsx`: Performance screen (by name).
- `apps/mobile/__tests__/MessageBubblePerformanceChip.test.tsx`: Chip (by name).

**Test scenarios**

- **One event per reply**
  1. Send one on-device message of a few sentences.
  2. Open Performance.
  - Expected: 'avg tok/s' shows a number; the tok/s chart shows 1 event.
- **Chip toggle**
  1. Turn off 'Show performance chip in chat'.
  2. Open a chat with a local reply.
  - Expected: No chip under the reply.
- **Memory**
  1. Send a local message on a real phone.
  - Expected: 'mem peak' shows a positive MB value.
- **Cap**
  1. Create more than 500 events (test harness).
  - Expected: Only the latest 500 remain.
- **Cloud turn**
  1. Send a message in Cloud mode.
  - Expected: No new event.

**Where to look when it fails**

- MMKV keys perf-events-v1 and benchmark-history-v1.
- Silent zero in 'mem peak' means the native module did not answer.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md)

## 10. Gaps and dependencies

- **No CLI or VS Code dashboard.** Affects: CLI and VS Code users.. Evidence: area brief S109.25. Work needed: Decide scope; local-server speed could be shown for Ollama and LM Studio.
- **No model id per event, no per-model view.** Affects: Mobile users comparing models.. Evidence: performanceMonitor.ts:6-12. Work needed: Add the field.
- **Memory is the whole-app figure.** Affects: Mobile users reading the number as model cost.. Evidence: AGIFoundationModels.swift:117-129; AGIAICoreModule.kt:85-89. Work needed: Label it or measure the runtime.
- **Brief says peak memory stays 0; code now samples it.** Affects: Accuracy of the brief.. Evidence: chatExecutionStore.ts:3094. Work needed: Update the brief and verify on a real device.
- **No way to clear data.** Affects: Mobile users.. Evidence: performanceMonitor.ts:116 (no caller). Work needed: Add control or confirm 'Delete everything' covers it.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:mobile
- mode:local
- SYS-local-inference
- SYS-observability-and-operations
- SYS-chat-turn-pipeline
- F109-09
- file:apps/mobile/services/performanceMonitor.ts
- file:apps/mobile/stores/chat/chatExecutionStore.ts
- store:perf-events-v1
- store:benchmark-history-v1

## Unknown

- Real-device values of memory and speed (no recorded run was read).
- Whether 'Delete everything' wipes perf events.
- Whether PerformanceChip also reads runtime tier.
- Behaviour when the app is killed mid-reply.
