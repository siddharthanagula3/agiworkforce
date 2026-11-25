---
id: "F104-06"
type: "feature"
title: "On-device data and on-device models"
aliases: ["encrypted local database", "SQLCipher", "agi_mobile.db", "on-device model", "Local mode model", "device tier", "Performance settings", "local-llm package"]
area: "104 Named technology options-not claims about competitor internals"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S104.11", "S104.26"]
depends_on: ["SYS-local-inference", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-model-catalog-and-routing", "SYS-data-model-and-migrations", "surface:mobile", "surface:desktop", "mode:local", "store:agi_mobile.db", "file:packages/platform/local-llm/src/selector.ts", "file:apps/mobile/storage/db.ts"]
basis: "code inspection"
second_reader: "6 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F104-06 On-device data and on-device models

AGI Mobile stores chats in an encrypted SQLite database whose 256-bit key sits in device secure storage, and can run a small model on the phone for free without an account. Onboarding checks the device and recommends a model. The Electron desktop does not run on-device models; only the retained Tauri code checks a local model server.

Area: [104. Named technology options-not claims about competitor internals](README.md). Requirement items: [S104.11](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10411), [S104.26](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10426).

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

**What it does.** Keeps mobile data encrypted on the device and runs inference there when the phone supports it. (apps/mobile/storage/db.ts:19-30,130-160; packages/platform/local-llm/src/selector.ts)

**Why it exists.** Local mode must work without an account, keep work on the device and make no hidden cloud calls. (doc: docs/product/requirements.md section 7.1)

**Who uses it.** Mobile users who want private, free, offline chat.

**Problems it solves**

- Readable chats if the phone is lost (encryption).
- Needing an account or payment for basic chat.
- Not knowing whether a device can run a model.

**Use cases**

- Chat on a plane with no network.
- Finish onboarding and download a recommended model.
- Check tokens per second in Performance settings.

## 2. User experience

**Where to find it**

- Mobile onboarding screen 'Set up local chat on <device name>.' (onboarding.tsx:~700).
- Mobile Settings, Performance: 'Device Tier', 'Benchmark This Device', 'Show performance chip in chat' (performance.tsx:594,940,1077).
- Desktop Tauri build (retained internal): local model server health monitor (App.tsx:746-752).

**Before you start**

- A supported phone; downloading a model needs storage and network; Local use needs no sign-in (doc: docs/product/requirements.md M-US-001).
- The first-run age gate must be passed before onboarding (apps/mobile/src/features/auth/services/rootRouting.ts:38-43; ageGate.ts:1-58).

**Screens and controls**

- 'Recommended' badge, 'Pick a different model', 'Continue without downloading', 'Sign in to use Cloud', 'Continue' and 'Skip for now' (onboarding.tsx:648-810).
- When unsupported: '<model> is unavailable on this device.', 'Browse local models', 'Continue without a local model' (onboarding.tsx:684-686,777-794).
- Download screen: 'The download continues if you leave this screen.', 'Try again', 'Continue to chat' (onboarding.tsx:880-916).

**Journey**

1. Open the app for the first time.
2. Anyone without a confirmed age is sent to the age gate before onboarding (rootRouting.ts:38-43; ageGate.ts:1-58; apps/mobile/app/(public)/age-gate.tsx).
3. Onboarding shows a first-run disclosure with consent acceptance before the 'about-you' screen (onboarding.tsx:280-305, using mmkvDisclosureLedger).
4. Onboarding reads device capability.
5. Screen shows a recommended model with download size.
6. Download over wifi or confirm cellular.
7. Start chatting; chats are saved to the encrypted database.
8. Optionally view tokens per second.

**What the person sees and gets**

- Download progress, speed and error with retry (onboarding.tsx:880-905).
- Local data reset notice if the database could not be read (localDataReset.ts; LocalDataResetNotice test).

**Settings**

- Performance chip toggle; model picker; installed models store (installedModels.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Encrypted SQLite through expo-sqlite with SQLCipher enabled (app.config.js:454); key is 32 random bytes in hex kept in secure storage, this-device-only, id agi_sqlcipher_db_key_v1 (db.ts:23-60).
- Schema migrations on open using PRAGMA user_version (db.ts:114-128).
- An unreadable database (for example restored on another phone without its key) is renamed aside, not deleted, and the person is told (db.ts:76-95); removal of set-aside copies happens only inside the data export and delete flow (services/dsarExport.ts:432-452).
- Three-tier local runtime selection: system model, ExecuTorch-based, and GGUF-based; capability detection by platform and RAM (packages/platform/local-llm/src/selector.ts; capabilities.ts:1-60; tier3.ts:1-60).
- Multimodal local models need enough RAM and verified artifacts (multimodal.ts exports in index.ts).
- Onboarding decides the tier and recommended model (onboarding.tsx:158-215).
- A first-run age gate precedes onboarding: rootRouting.ts:38-43 redirects any user without a confirmed age to /age-gate, and ageGate.ts:1-58 applies region thresholds (18 in India and Brazil timezones, otherwise ACCOUNT_MINIMUM_AGE).
- Onboarding shows a first-run disclosure with consent acceptance before the 'about-you' screen (onboarding.tsx:280-305, using mmkvDisclosureLedger).

**Incomplete**

- Chrome, VS Code and CLI use of this on-device package: not read.

**Present but disconnected or switched off**

- Electron desktop refuses local inference commands (dispatcher.ts:3234-3244); the refusal is deliberate and its message says local coding sessions reach local models through the bundled CLI.
- Tauri desktop health monitor runs only when isTauri (App.tsx:746-752) and checks a local model server (ollamaHealthService.ts:1-50), a different mechanism from the on-device package.

**Not available**

- Web: no local database or on-device model found.
- Live voice in Local mode (F104-04).

## 4. Required behaviour

**Established requirements**

- S104.11: a client keeps data in an encrypted local database on the device. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.11)
- S104.26: the area item about on-device models; mobile loads the on-device runtime at runtime. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.26)
- Local mode: no AGI account required, local storage by default, no hidden provider call, fails closed. (source: (doc: docs/product/requirements.md section 7.1))
- The user is not forced to sign in for Local; first chat does not call BYOK or Cloud routes; no-model state has setup guidance. (source: (doc: docs/product/requirements.md M-US-001 acceptance))
- Mobile v1 is small on-device Local models plus signed-in Managed Free; no mobile BYOK in v1. (source: (doc: docs/product/commercial.md Launch Posture))
- Before Local chat the person must pass a first-run age gate (region thresholds: 18 in India and Brazil timezones, otherwise ACCOUNT_MINIMUM_AGE); this matches the owner decision of 18 and over on every surface. (source: [apps/mobile/src/features/auth/services/rootRouting.ts:38-43; ageGate.ts:1-58])

**Acceptance criteria**

1. First launch without an account passes the age gate, then reaches a chat with a local model or clear guidance.
2. Chats persist after restart and the database file is not readable as plain SQLite.
3. Restoring a backup on a new phone shows the reset notice and keeps the old file aside.
4. An unsupported device shows '<model> is unavailable on this device.' with browse and continue options.
5. Local chat makes no network call to Cloud or BYOK routes.
6. Performance screen shows device tier and benchmark.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local inference is free of any subscription because the code path has no entitlement check (not found in local-llm files read) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Resolve the desktop conflict: the product says on-device inference on desktop is free, while the public desktop refuses it; record an owner decision.
- [proposed] Add a visible label of what happens to the set-aside database.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | encrypted db | `apps/mobile/storage/db.ts` | Open, key, migrate, set aside unreadable. |
| store | migrations | `apps/mobile/storage/migrations.ts` | Schema versions. |
| store | conversations | `apps/mobile/storage/conversations.ts` | Conversation rows. |
| store | messages | `apps/mobile/storage/messages.ts` | Message rows. |
| store | installedModels | `apps/mobile/storage/installedModels.ts` | Installed on-device models. |
| service | unreadableFiles | `apps/mobile/storage/unreadableFiles.ts` | Set-aside logic. |
| service | localDataReset | `apps/mobile/storage/localDataReset.ts` | Reset report for the notice. |
| config | app.config | `apps/mobile/app.config.js` | expo-sqlite useSQLCipher true (line 454). |
| service | dsarExport | `apps/mobile/services/dsarExport.ts` | Export and delete incl. set-aside databases (432-452). |
| service | local-llm selector | `packages/platform/local-llm/src/selector.ts` | Chooses tier and runtime. |
| service | capabilities | `packages/platform/local-llm/src/capabilities.ts` | Detects device capability. |
| service | tier1 | `packages/platform/local-llm/src/tier1.ts` | System-provided model runtime. |
| service | tier2 | `packages/platform/local-llm/src/tier2.ts` | Second on-device runtime. |
| service | tier3 | `packages/platform/local-llm/src/tier3.ts` | Third runtime, loaded at run time (lines 25-36). |
| config | local model catalog | `packages/platform/local-llm/src/catalog.ts` | Catalog of local models. |
| screen | onboarding | `apps/mobile/app/(public)/onboarding.tsx` | Device check and model recommendation. |
| screen | performance settings | `apps/mobile/app/(app)/settings/performance.tsx` | Device tier and benchmark. |
| service | modelDownload | `apps/mobile/services/modelDownload.ts` | Downloads models. |
| service | localModelRuntime | `apps/mobile/src/features/model-picker/localModelRuntime.ts` | Runtime glue for the picker. |
| service | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Execution mode per chat (local or cloud). |
| service | rootRouting | `apps/mobile/src/features/auth/services/rootRouting.ts` | Redirects users without a confirmed age to /age-gate before onboarding (lines 38-43). |
| service | ageGate | `apps/mobile/src/features/auth/services/ageGate.ts` | Region age thresholds for the first-run age gate (lines 1-58). |
| screen | age-gate | `apps/mobile/app/(public)/age-gate.tsx` | First-run age confirmation screen. |
| service | ollamaHealthService | `apps/desktop/src/services/ollamaHealthService.ts` | Retained Tauri local-server check. |
| service | desktop dispatcher refusal | `apps/desktop/electron/runtime/dispatcher.ts` | Refuses local inference in Electron. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| App opens the database: reads or creates the key from secure storage, opens, applies PRAGMA key, WAL, migrations. | device | db.ts:130-170 |
| First launch routes a person without a confirmed age to the age gate before onboarding. | device | rootRouting.ts:38-43; ageGate.ts:1-58 |
| Onboarding reads device capabilities and picks a model. | device | onboarding.tsx:200-215; capabilities.ts |
| Model files download from the model host. | outside service | modelDownload.ts (not read in detail) |
| Local chat sends messages to the on-device runtime and streams tokens back. | device | selector.ts; tier3.ts:20-27 |
| Messages are written to the encrypted database. | device | storage/messages.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chats, messages, memory, settings | apps/mobile agi_mobile.db (encrypted) | Not by default; only after sign-in and explicit move (doc: requirements.md 7.1) | Set-aside copies deleted only in export and delete flow (dsarExport.ts:432-452) |
| Database key | Device secure storage, this-device-only | no | Lost on device change; database then set aside (db.ts:76-95) |
| Model files | Device file system | no | Managed by installedModels and picker; delete path unknown |

**Models and providers.** Local models come from the local catalog in the local-llm package and are chosen by role and device tier; no provider key or Cloud call is used for them. Which exact models are offered is catalog data, not named here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account (Clerk sign-in) is needed for Local (doc: requirements.md M-US-001; rootRouting.ts:44-57; onboarding.tsx:804-808 'Sign in to use Cloud'), but the first-run age gate must be passed first (rootRouting.ts:38-43; ageGate.ts:1-58). Cloud use needs sign-in. |
| Permissions | Storage for models; secure storage for the key. |
| Subscription | No entitlement check found in the local-llm files read; Local is free where technically available (doc: docs/product/commercial.md Launch Posture). |
| Limits and metering | Context is clamped to 4096-8192 tokens for mobile, defaulting to 4096 when the catalog gives no context (tier3.ts:45-46,70-75); RAM minimum for multimodal (MULTIMODAL_MIN_RAM_MB); the second tier needs 3500 MB of RAM, or unknown RAM with the ExecuTorch runtime present (capabilities.ts:4,75-77). Local use is not metered by the code read. |
| Feature flags | none found in files read. |
| Model compatibility | Only models in the local catalog and fitting RAM and runtime; tools in Local mode are not used (doc: requirements.md:133). |
| Provider restrictions | No provider for Local; mobile has no BYOK in v1 (doc: commercial.md). |
| Local mode | This is the Local mode implementation on mobile: data and inference on the device with no account (after the age gate). Desktop Electron refuses local inference, deliberately, and dispatcher.ts:3234-3244 says local coding sessions reach local models through the bundled CLI; the CLI local routes themselves were not read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No capable device | Message 'is unavailable on this device', options to browse or continue without a model, Cloud sign-in entry. | onboarding.tsx:157-160,684-686,777-808 |
| Download error | Alert text and 'Try again'. | onboarding.tsx:893-905 |
| Download continues in background | Hint text shown. | onboarding.tsx:880 |
| Key missing | Any old database set aside, new key made. | db.ts:132-135 |
| Database unreadable with key | Set aside once and reopened fresh. | db.ts:137-142 |
| Age not yet confirmed | Redirected to /age-gate before onboarding; Local chat is not reachable until passed. | rootRouting.ts:38-43; ageGate.ts:1-58 |
| Thermal throttling | Tracked in capabilities and shown in Performance. | capabilities.ts:4,46; performance.tsx:669 |
| Offline | Local chat works; download needs network. | MathBlockOffline and onboarding download |
| What a person sees when the device cannot run a model during an ongoing chat | not verified. | brief |
| Accessibility | Onboarding controls have accessibility labels and roles. | onboarding.tsx:777,905 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/local-db-restore-recovery.test.ts`: Restore recovery.
- `apps/mobile/__tests__/LocalDataResetNotice.test.tsx`: Reset notice.
- `apps/mobile/__tests__/Onboarding.test.tsx`: Onboarding.
- `apps/mobile/__tests__/FirstRunLocalModelReadiness.test.tsx`: First-run readiness.
- `apps/mobile/__tests__/local-llm-selector.test.ts`: Selector.
- `apps/mobile/__tests__/model-tier-matrix.test.ts`: Tier matrix.
- `apps/mobile/__tests__/installed-models-storage.test.ts`: Installed models.
- `packages/platform/local-llm/src/__tests__/tier3.test.ts`: Third runtime.
- `packages/platform/local-llm/src/__tests__/selector-tier2.test.ts`: Second tier selection.
- `packages/platform/local-llm/src/__tests__/catalog.test.ts`: Catalog.
- `apps/mobile/__tests__/OnboardingBackgroundDownload.test.tsx`: Background download.

**Test scenarios**

- **Fresh offline start**
  1. Install on a supported phone, no account.
  2. Pass the age gate.
  3. Finish onboarding and download the recommended model.
  4. Turn on airplane mode and chat.
  - Expected: Replies stream locally; no sign-in asked.
- **Restore on another phone**
  1. Back up and restore onto a new device.
  - Expected: Reset notice; old file renamed aside; new chat works.
- **Unsupported device**
  1. Run onboarding on a phone below the RAM floor.
  - Expected: Unavailable text and options.
- **Encrypted at rest**
  1. Pull the database file from a test device.
  2. Open it with a plain SQLite tool.
  - Expected: 'file is not a database'.
- **No cloud call in Local**
  1. Chat in Local with a network monitor.
  - Expected: No Cloud or provider traffic.
- **Desktop**
  1. On Electron try a local model chat.
  - Expected: Cloud-only message.

**Where to look when it fails**

- Log '[local-llm] iOS capability detection failed'.
- reportLocalDataReset event.
- Database file agi_mobile.db and set-aside copies.
- SecureStore id agi_sqlcipher_db_key_v1 (name only).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Desktop (Electron) refuses on-device inference although the product requirement says local inference on desktop is free of any subscription. The dispatcher comment names the bundled CLI as the path for local coding sessions.** Affects: Desktop. Evidence: dispatcher.ts:3234-3244; D-2026-09-15-04. Work needed: Owner decision; update requirement or build path.
- **No evidence on what a person sees when a device cannot run a model mid-chat.** Affects: Mobile. Evidence: brief 'Not verified'. Work needed: Test and document.
- **Web, Chrome, VS Code and CLI storage of chats not read.** Affects: Those apps. Evidence: not opened. Work needed: Read.
- **Brief cites tier3.ts:30 for loading at runtime; at that range the code is the dynamic module loader at lines 25-36, which matches.** Affects: none. Evidence: tier3.ts:25-36. Work needed: none

**Depends on**

- SYS-local-inference
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-model-catalog-and-routing
- SYS-data-model-and-migrations
- surface:mobile
- surface:desktop
- mode:local
- store:agi_mobile.db
- file:packages/platform/local-llm/src/selector.ts
- file:apps/mobile/storage/db.ts

## Unknown

- Which exact models the catalog offers on a given phone.
- How model files are deleted.
- Whether any code path sends Local content to a server when signed in.
- Local storage on Chrome, VS Code, CLI and Tauri desktop beyond the health check.
- Whether local inference needs any sign-in on any app (requirements say not for Local).

## Second reader's check

A second reader checked 10 statements of this page against the code: 6 correct, 4 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "Schema migrations on open using PRAGMA user_version (db.ts:105-122)" The code shows: The behaviour is right, but runMigrations is at db.ts:114-128, so the cited range misses part of it. (apps/mobile/storage/db.ts:114-128). **Corrected:** Cite db.ts:114-128.
- **Partly wrong (section 7):** "Limits: context window bounded to 4096 minimum and 8192 maximum for mobile (tier3.ts:60-70); device tier minimum RAM 3500 MB for the second tier (capabilities.ts:5)" The code shows: The values are right. tier3.ts:45-46 defines DEFAULT_CONTEXT_TOKENS = 4096 and MAX_MOBILE_CONTEXT_TOKENS = 8192. The clamp is at tier3.ts:70-75, and it falls back to 4096 when the catalog gives no context. capabilities.ts:4 defines the 3500 constant, used at line 76 (tier 2 is available when RAM is at least 3500, or RAM is unknown and the ExecuTorch runtime exists). The page cites the wrong lines. (packages/platform/local-llm/src/tier3.ts:45-46,70-75; capabilities.ts:4,75-77). **Corrected:** Context is clamped to 4096-8192, defaulting to 4096 (tier3.ts:45-46,70-75). Tier 2 needs 3500 MB of RAM, or unknown RAM with the ExecuTorch runtime present (capabilities.ts:4,75-77).
- **Partly wrong (section 7):** "Account: Not required for Local. Cloud route in onboarding needs sign-in." The code shows: No Clerk sign-in is needed for Local (rootRouting.ts:44-57, onboarding.tsx:804-808 'Sign in to use Cloud'). But a first-launch age gate comes first. rootRouting.ts:38-43 sends anyone with ageGateConfirmed false to /age-gate before onboarding, and ageGate.ts applies region thresholds. So the person confirms their age before reaching Local chat. This matches the owner decision that every surface is 18 and over. (apps/mobile/src/features/auth/services/rootRouting.ts:38-43; apps/mobile/src/features/auth/services/ageGate.ts:1-58; apps/mobile/app/(public)/age-gate.tsx). **Corrected:** No account is needed for Local, but the first-run age gate must be passed first. Cloud use needs sign-in.
- **Partly wrong (section 7):** "Subscription: no entitlement check found in the local-llm files read; Local is free where technically available" The code shows: docs/product/commercial.md:22 says Local is 'Free to use where technically available'. The grep for entitlement, plan and subscription in packages/platform/local-llm/src matched only catalog.ts, so the page's 'not found' is consistent with the code. I did not open that hit to see what it is. The page also flags this as unverified. (docs/product/commercial.md:22; packages/platform/local-llm/src/catalog.ts). **Corrected:** Acceptable as worded. It is an absence-of-evidence statement, not a verified rule.

**Facts the page missed**

- First-run age gate: rootRouting.ts:38-43 redirects any user without a confirmed age to /age-gate before onboarding. ageGate.ts:1-58 applies region thresholds (18 in India and Brazil timezones, otherwise ACCOUNT_MINIMUM_AGE). The page's Journey, acceptance criteria and 'no account needed' text omit this. It is a mandatory step before Local chat.
- Onboarding shows a first-run disclosure with consent acceptance before the 'about-you' screen (onboarding.tsx:280-305, using mmkvDisclosureLedger). The page does not mention it.
- Electron's refusal is deliberate and cross-referenced: dispatcher.ts:3234-3244 says local coding sessions reach local models through the bundled CLI. The page says 'CLI local routes exist but were not read', so it misses a stated path for on-device inference on desktop.
