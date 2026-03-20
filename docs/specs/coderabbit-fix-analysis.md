# Specification: Commit 4e790e1a -- 20-File Analysis for Fix Team

Generated: 2026-03-19T22:00:00Z

## Task Overview

Analysis of 20 files introduced or modified in commit 4e790e1a across three layers of the desktop app: API wrappers (6 files), React components (4 files), a performance service (1 file), and Zustand stores (9 files). This document catalogs shared patterns, interface contracts, middleware conventions, error handling patterns, and all issues discovered -- ranked by severity.

---

## File Inventory

### API Layer (`apps/desktop/src/api/`)
| File | LOC | Commands Wired | Key Exports |
|------|-----|----------------|-------------|
| `agi.ts` | 291 | 9 | `agiInit`, `agiStop`, `submitGoalSwarm`, `submitGoalAuto`, `shouldUseSwarm`, `queryKnowledge`, `getRecentKnowledge`, `getKnowledgeByCategory`, `getSystemResources` |
| `artifacts.ts` | 732 | 24 | Full CRUD, streaming, versioning, tagging, diff, import/export. `ArtifactResponse<T>` wrapper with `unwrap`/`unwrapVoid` helpers |
| `productivity.ts` | 295 | 15 | Notion, Trello, Asana provider integrations. `ProductivityProvider` union type |
| `undo.ts` | 312 | 16 | File/system undo, named checkpoints, form undo subsystem |
| `voice.ts` | 779 | 47 | Full voice pipeline. `VoiceClient` convenience object. Transcription, TTS, wake word, PTT, Deepgram, barge-in, local Whisper/Piper |
| `workspace.ts` | 263 | 7 | Workspace indexing, symbol search, definitions, references, dependency graph |

### Components Layer (`apps/desktop/src/components/`)
| File | LOC | Key Dependencies |
|------|-----|------------------|
| `Analytics/UsageDashboard.tsx` | 493 | `recharts`, `billingUsage` store, `auth` store, `analyticsQueries` service |
| `Marketplace/components/MarketplaceHero.tsx` | 146 | Local `marketplaceStore` (NOT global), `WorkflowCard`, `Button`, `Input` |
| `Settings/SettingsPanel.tsx` | ~800+ | 30+ sub-component imports, `settingsStore`, `settingsDialogStore`, `modelStore`, `connectorsStore`, `appModeStore` |
| `Teams/TeamSettings.tsx` | 240 | `teamStore`, `types/teams` |

### Service Layer (`apps/desktop/src/services/`)
| File | LOC | Key Exports |
|------|-----|-------------|
| `performance.ts` | 371 | `performanceMonitor` singleton, `PerformanceMonitoringService` class |

### Store Layer (`apps/desktop/src/stores/`)
| File | LOC | Middleware Stack | Persistence |
|------|-----|-----------------|-------------|
| `billingUsage.ts` | 1788 | `devtools(persist(subscribeWithSelector(immer(...))))` | Yes -- budget, alerts, costFilters |
| `browserStore.ts` | 1222 | `devtools(subscribeWithSelector(immer(...)))` | No |
| `cacheStore.ts` | 217 | `devtools(persist(...))` | Yes -- codebaseStats only |
| `gitStore.ts` | 476 | `devtools(persist(subscribeWithSelector(...)))` | Yes -- repoPath only |
| `marketplaceStore.ts` | 451 | `devtools(persist(immer(...)))` | Yes -- featured, trending, templates, categoryCounts, popularTags |
| `mcpStore.ts` | ~600+ | `devtools(subscribeWithSelector(...))` | No (ephemeral) |
| `onboardingStore.ts` | 768 | `devtools(persist(immer(...)))` | Yes -- firstRunCompleted, status |
| `teamStore.ts` | 518 | bare `create` (no middleware) | No |
| `voiceModeStore.ts` | 1185 | `devtools(persist(...))` | Yes -- turns, wakeWordActive, bargeInEnabled |

---

## Shared Patterns Across All 20 Files

### 1. Tauri IPC Convention
All API files import from `../lib/tauri-mock` (either `invoke` alone or `{invoke, isTauri}`). The convention is:
- Command names: **snake_case** in both TypeScript and Rust (`artifact_create`, `agi_init`)
- `invoke()` parameter keys: **camelCase** (auto-converted by Tauri boundary to snake_case on Rust side)
- Non-Tauri environments: graceful degradation via `isTauri` guard or try/catch

### 2. Error Handling Patterns (3 distinct styles found)

**Pattern A -- Return-null-with-toast** (used by `agi.ts`):
```ts
try { return await invoke(...); }
catch (error) { console.error(...); toast.error(...); return null; }
```

**Pattern B -- Throw-with-console** (used by `productivity.ts`, `undo.ts`):
```ts
try { return await invoke(...); }
catch (error) { console.error(...); throw error; }
```

**Pattern C -- Throw-with-wrap** (used by `voice.ts`):
```ts
try { return await invoke(...); }
catch (e) { throw new Error(`functionName failed: ${e}`); }
```

**Pattern D -- Silent-swallow** (used by `workspace.ts` in some functions):
```ts
try { return await invoke(...); }
catch { return []; }
```

### 3. Zustand Store Conventions
- Middleware order varies by store (see table above). No single canonical order.
- `devtools` always outermost with `{ name: 'StoreName', enabled: import.meta.env.DEV }`
- All persistent stores use `createJSONStorage(() => window.localStorage)` with `partialize`
- Array cap pattern: stores cap growing arrays (budgetAlerts at 100, actions at 1000, domSnapshots at 50) -- labeled with `STR-xxx` or `AUDIT-xxx` fix comments

### 4. Mock/Fallback Convention
- API files: `if (!isTauri)` guard returns mock data or empty arrays
- Productivity API: throws `Error('Productivity requires Tauri runtime')` instead of mocking -- inconsistent with other API files

### 5. Toast Usage
- `sonner` toast imported as `import { toast } from 'sonner'` (correct per CLAUDE.md)
- Used in: `agi.ts`, `undo.ts`, `billingUsage.ts`, `TeamSettings.tsx`
- NOT used in: `artifacts.ts`, `voice.ts`, `workspace.ts`, `productivity.ts` (they throw instead)

---

## Issues Found (Ranked by Severity)

### CRITICAL

| # | File:Line | Description |
|---|-----------|-------------|
| C1 | `UsageDashboard.tsx:109-113` | **`formatBytes` function is broken.** Parameter is named `bytes` but the value passed in is already in MB (e.g., `systemMetrics.memoryUsedMb`). The function treats the input as raw bytes but does `const mb = bytes; return mb.toFixed(2) + ' MB'` -- it never divides. This means if `memoryUsedMb` is 8192, it displays "8192.00 MB" which is correct by accident, but the function name and parameter name are misleading, and if anyone passes actual bytes it will be wrong. |
| C2 | `voiceModeStore.ts:389-395` | **Non-serializable state persisted.** `_mediaStream`, `_recorder`, `_audioChunks`, `_analyser`, `_audioContext` are MediaStream/MediaRecorder/Blob[] objects stored in Zustand state. Although `partialize` excludes them from persistence, they exist in the live store and will cause issues if any subscriber tries to deep-compare or serialize state (e.g., devtools). These should be held in module-level refs, not store state. |
| C3 | `UsageDashboard.tsx:438` | **Random trend data in production UI.** `Math.floor(Math.random() * 20)` generates random fake trend percentages in the "Recent Activity" table. This will show different numbers on every render -- users will see flickering, meaningless trend data. |

### HIGH

| # | File:Line | Description |
|---|-----------|-------------|
| H1 | `voice.ts:53,72` | **`@deprecated` API key fields still present in `TtsConfig.apiKey` and `DeepgramConfig.apiKey`.** These are marked deprecated with comments saying keys should go through SecretManager, but the fields still exist in the interface. Callers can still pass keys through frontend code, violating security rules. |
| H2 | `voiceModeStore.ts` vs `voice.ts` | **Duplicate type declarations.** `VoiceCapabilities`, `TtsVoice`, `WakeWordConfig`, `PttConfig`, `DeepgramConfig`, `DeepgramStreamStatus`, `DeepgramStreamingStats`, `BargeInStatus`, `BargeInStats`, `BargeInConfig`, `SpeechTranscriptResult`, `WhisperModelInfo`, `PiperVoiceInfo`, `LocalModelsInfo`, `TtsConfig` are all re-declared in `voiceModeStore.ts` (lines 100-217) identically to `voice.ts`. Fix team should import from `voice.ts` instead. |
| H3 | `billingUsage.ts:1259-1294` | **Race condition in `isLoadingMetrics`.** Both `loadSystemMetrics` and `loadAppMetrics` set `isLoadingMetrics: true` at start and `isLoadingMetrics: false` in finally. When called in parallel (as `refreshAllMetrics` does), whichever finishes first sets `false`, making the UI think loading is done while the other is still in progress. |
| H4 | `MarketplaceHero.tsx:27-30` | **Direct DOM manipulation via `document.querySelector`.** `handlePublishClick` finds a tab element by `[value="publish"]` and clicks it. This is fragile -- it depends on DOM structure of a parent component, breaks with SSR, and bypasses React's event system. |
| H5 | `artifacts.ts` | **`snake_case` field names in TypeScript interfaces.** All artifact interfaces (`Artifact`, `ArtifactVersion`, `ArtifactSummary`, `RenderedArtifact`, etc.) use `snake_case` fields (`artifact_type`, `created_at`, `file_path`). This matches Rust serde output directly but violates the project's TypeScript convention of camelCase. Every consumer must use these snake_case names. |
| H6 | `UsageDashboard.tsx:239-245` | **Dead conditional branch.** The `cn()` call for the progress bar color has identical branches for `> 75` and the default (`'bg-amber-500'` in both cases). The `> 75` branch is dead code. |
| H7 | `UsageDashboard.tsx:492` | **Default export alongside named export.** Line 37 exports `export const UsageDashboard` and line 492 exports `export default UsageDashboard`. CLAUDE.md says "Named exports only -- no default exports." |

### MEDIUM

| # | File:Line | Description |
|---|-----------|-------------|
| M1 | `productivity.ts:53` | **Inconsistent non-Tauri behavior.** Throws `Error('Productivity requires Tauri runtime')` while all other API files return mock data or empty arrays. This will crash the web preview. |
| M2 | `teamStore.ts` | **No middleware used.** This is the only store among the 9 that uses bare `create()` with no `devtools`, `persist`, `immer`, or `subscribeWithSelector`. No persistence means team selection is lost on refresh. No devtools means invisible to Redux DevTools. |
| M3 | `UsageDashboard.tsx:52-53` | **Destructuring from potentially null `account`.** `const { credits, plan } = account;` will throw if `account` is null. The `useShallow` selector does not guarantee non-null. |
| M4 | `performance.ts:153` | **Double `load` event listener.** Both `initializeWebVitals` (line 139) and `trackAppStartup` (line 153) add listeners for the `'load'` event. Both are tracked in `eventListeners` for cleanup, but having two load handlers that both fire `analytics.track('app_opened', ...)` may produce confusing duplicate events. |
| M5 | `undo.ts:17-18` | **Missing `isTauri` guard.** Unlike other API files, `undo.ts` imports only `invoke` (not `isTauri`) and never checks for non-Tauri environments. Every function will throw in browser-only mode. |
| M6 | `cacheStore.ts:196-198` | **Bare re-throw with no logging.** `calculateFileHash` catches errors only to re-throw them with no console logging or error tracking, unlike all other methods in the same store that use `console.warn`. |
| M7 | `browserStore.ts:270` | **Module-level mutable array.** `const unlistenFunctions: UnlistenFn[] = []` is a module-level mutable array outside the store. While this is intentional for cleanup, it creates a subtle coupling: if the module is hot-reloaded during dev, the old listeners are leaked because the new module gets a fresh empty array. |
| M8 | `billingUsage.ts:1300` | **Unsafe type cast.** `const stats = (await analyticsGetUsageStats()) as unknown as AnalyticsUsageStats;` uses double-cast (`as unknown as T`), bypassing all type safety. Same pattern at lines 1318, 1484, 1507, 1521, 1535, 1549. Seven instances total. |
| M9 | `voiceModeStore.ts:1170-1179` | **Persisting `turns` array with no cap.** The `partialize` includes `turns` (conversation history) but there is no cap on the array size. Long voice sessions will grow localStorage unboundedly. |

### LOW

| # | File:Line | Description |
|---|-----------|-------------|
| L1 | `artifacts.ts:301` | **`MOCK_ID` uses `Date.now()` only.** If two artifacts are created in the same millisecond in non-Tauri mode, they get the same ID. Should include a random suffix. |
| L2 | `workspace.ts:164,185,205,224,243,260` | **Empty catch blocks.** Six functions silently swallow errors with no logging. Makes debugging impossible in production. |
| L3 | `UsageDashboard.tsx:122,135,278,306,335,337,351,377,393,408` | **Empty JSX expression comments.** Multiple `{}` appear in JSX -- these are remnants of removed comments. Harmless but messy. |
| L4 | `gitStore.ts:449-451` | **Persisting `localStorage` in Tauri.** Git store persists `repoPath` to `window.localStorage`. In a Tauri app, this survives app updates but not data directory resets. Consider using Tauri's app data directory instead. |
| L5 | `onboardingStore.ts:57-66` | **Dual type import.** Types are imported twice: once via `export type { ... } from '../api/onboarding'` (line 57-66) and again via `import type { ... } from '../api/onboarding'` (line 68-76). The re-export is for consumers; the import is for internal use. This is technically valid but confusing. |
| L6 | `marketplaceStore.ts:182` | **Missing `subscribeWithSelector`.** Unlike other stores that need granular subscriptions, this store uses `immer` but not `subscribeWithSelector`. If any consumer needs to subscribe to individual field changes, they cannot. |
| L7 | `billingUsage.ts:1772-1787` | **Four deprecated aliases.** `useCostStore`, `useUsageStore`, `useTokenBudgetStore`, `useAnalyticsStore` are deprecated aliases for `useBillingUsageStore`. These should be tracked for removal. |
| L8 | `voice.ts:714-778` | **`VoiceClient` object is unused.** The convenience grouping object `VoiceClient` exports all functions but is never imported by any consumer (voiceModeStore imports individual functions). Dead code. |

---

## Interface Contracts Between Files

### `billingUsage.ts` <-> `UsageDashboard.tsx`
- Dashboard imports: `useBillingUsageStore`, `getUsagePercentage`, `getRemainingPercentage`
- Dashboard reads: `systemMetrics`, `appMetrics`, `analyticsUsageStats`, `isLoadingMetrics`, `usageStats`
- Dashboard calls: `loadSystemMetrics()`, `loadAppMetrics()`, `loadAnalyticsUsageStats()`, `refreshAllMetrics()`, `getTokenCost()`
- Contract: `UsageStats` type must have `llm_tokens_used`, `model_usage[]`

### `billingUsage.ts` <-> `performance.ts`
- Store calls: `performanceMonitor.getSystemMetrics()`, `performanceMonitor.getAppMetrics()`
- Returns: `ApiSystemMetrics`, `ApiAppMetrics` (from `api/analytics`)

### `voice.ts` <-> `voiceModeStore.ts`
- Store imports 35+ individual functions from `voice.ts`
- Store re-declares all voice types instead of importing them (H2 issue)
- Store calls `voiceTranscribeBlob` for STT, `voiceTtsSpeak`/`voiceTtsSpeakWithBargeIn` for TTS

### `teamStore.ts` <-> `TeamSettings.tsx`
- Component imports: `useTeamStore` with `useShallow` selector for `updateTeam`, `updateTeamSettings`, `deleteTeam`
- Component also imports `TeamRole`, `Team` from `types/teams`
- `updateTeamSettings` accepts `UpdateTeamSettingsParams` (from `api/teamsApi`)

### `MarketplaceHero.tsx` <-> local `marketplaceStore`
- Imports from `../marketplaceStore` (relative path -- this is the component-local store, NOT `stores/marketplaceStore.ts`)
- Uses: `marketplaceStats`, `featuredWorkflows`, `searchWorkflows`, `filters`

---

## Middleware Conventions Summary

The 9 stores use 4 different middleware stacking orders:

| Pattern | Stores |
|---------|--------|
| `devtools(persist(subscribeWithSelector(immer(...))))` | billingUsage |
| `devtools(subscribeWithSelector(immer(...)))` | browserStore |
| `devtools(persist(immer(...)))` | marketplaceStore, onboardingStore |
| `devtools(persist(subscribeWithSelector(...)))` | gitStore |
| `devtools(persist(...))` | cacheStore, voiceModeStore |
| `devtools(subscribeWithSelector(...))` | mcpStore |
| bare `create()` | teamStore |

**Recommendation for fix team:** Standardize on `devtools(persist(subscribeWithSelector(immer(...))))` for stores that need all four, or document the rationale for each deviation.

---

## DO NOT TOUCH Sections

These files/sections should NOT be modified by a fix team working on these 20 files:

| Path | Reason |
|------|--------|
| `apps/desktop/src-tauri/src/**` | Rust backend. Changes to IPC command signatures require coordinated frontend+backend work. |
| `apps/desktop/src/lib/tauri-mock.ts` | Shared IPC mock layer. Changes affect all 900+ TS files. |
| `apps/desktop/src/stores/auth.ts` | `useBillingStore` and `useAccountStore` are consumed by billingUsage.ts. Changing their shape breaks billing. |
| `apps/desktop/src/services/analytics.ts` | Singleton `analytics` service consumed by performance.ts and billingUsage.ts. |
| `apps/desktop/src/types/teams.ts` | Type definitions consumed by TeamSettings and teamStore. |
| `apps/desktop/src/types/mcp.ts` | Type definitions consumed by mcpStore. |
| `apps/desktop/src/types/analytics.ts` | Type definitions consumed by UsageDashboard and billingUsage. |
| `apps/desktop/src/api/analytics.ts` | API layer consumed by billingUsage.ts and performance.ts. |
| `apps/desktop/src/api/browser.ts` | API layer consumed by browserStore. |
| `apps/desktop/src/components/Marketplace/marketplaceStore.ts` | Local marketplace store (different from `stores/marketplaceStore.ts`). Used by MarketplaceHero. |

---

## Fix Priority Recommendations

1. **Immediate (CRITICAL):** Fix C1 (formatBytes), C3 (random trends), address C2 (move non-serializable refs out of store state)
2. **Next sprint (HIGH):** Remove deprecated API key fields (H1), deduplicate voice types (H2), fix `isLoadingMetrics` race (H3), replace DOM manipulation (H4), fix default export (H7)
3. **Backlog (MEDIUM):** Standardize non-Tauri behavior (M1, M5), add middleware to teamStore (M2), guard null account (M3), remove unsafe casts (M8), cap voiceModeStore turns (M9)
4. **Cleanup (LOW):** All L-items are safe for any developer to address opportunistically

---

## Verification Checklist

- [x] All 20 file paths verified to exist in the codebase
- [x] All interface contracts documented with actual import/export verification
- [x] All issues include file path and line number
- [x] DO NOT TOUCH sections comprehensively listed
- [x] No source files modified during analysis
