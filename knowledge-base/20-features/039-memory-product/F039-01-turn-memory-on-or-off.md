---
id: "F039-01"
type: "feature"
title: "Turn Memory on or off"
aliases: ["Persistent memory switch", "Memory on/off", "Enable memories", "Memory controls", "Search past chats", "Reference past chats", "Search and reference chats", "Memory onboarding (S39.01)", "capabilities.memory", "searchPastChats"]
area: "39 Memory product"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S39.01", "S39.02", "S39.03"]
depends_on: ["SYS-memory-projects-and-context", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "table:user_settings", "api:GET /api/memory", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "mode:local", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F039-01 Turn Memory on or off

Memory is a per-account switch, off by default, that decides whether AGI Workforce saves and uses facts about the person. A separate switch decides whether it may look up excerpts from other past chats. The server enforces both. No first-run introduction to Memory exists in any app.

Area: [39. Memory product](README.md). Requirement items: [S39.01](../../10-requirements/capabilities/039-memory-product.md#s3901), [S39.02](../../10-requirements/capabilities/039-memory-product.md#s3902), [S39.03](../../10-requirements/capabilities/039-memory-product.md#s3903).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person turn Memory on or off, and separately allow or forbid the assistant to search excerpts of their other chats. When Memory is off the server reads no saved facts into a turn, saves nothing automatically, and offers no memory tool (apps/web/lib/services/managed-memory-context-service.ts:1146; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1123-1146, 2392-2406).

**Why it exists.** Requirements say memory must be explicit and controllable, with a disable switch and a separate reference-chat-history toggle (doc: docs/product/requirements.md section 18). Competitors expose the same controls (doc: docs/product/competitive-guidance.md:313-316).

**Who uses it.** Any signed-in person on Web, Desktop, Mobile (Cloud and Local), CLI and VS Code. Chrome has no switch of its own.

**Problems it solves**

- A person who does not want the assistant to remember anything can stop it with one switch.
- Past-chat lookup can be turned off without losing saved facts, and the reverse.
- A workspace owner can close memory for all members, and the person sees why the switches are disabled.

**Use cases**

- A new user leaves Memory off (the default) and chats normally.
- A user turns Memory on in Settings so later chats know their preferences, but keeps Search past chats off.
- A CLI user runs agi memory off to stop memory on every surface.
- A mobile user in Local mode turns Memory on so facts stay on the phone.

## 2. User experience

**Where to find it**

- Web (and public Desktop, which shows the hosted web app, doc: AGENTS.md section 5): Settings, Personalization, then the Memory heading. PersonalizationSection renders MemorySection (apps/web/features/settings/sections/PersonalizationSection.tsx:604). Privacy settings also show a Memory preferences row with a Manage link to Personalization (apps/web/features/settings/sections/PrivacySection.tsx:835-860).
- Mobile: Profile, then the Memory row (apps/mobile/app/(app)/profile/index.tsx:199) opens the Memory screen titled Cloud Memory or Memory, with a MEMORY CONTROLS card (apps/mobile/src/features/memory/components/MemoryControlsCard.tsx:60; apps/mobile/app/(app)/settings/memory.tsx:538,709).
- CLI: agi memory on, agi memory off, agi memory status (apps/cli/src/lib.rs:1477-1481, 4225-4235). The flag --no-memory runs one session without memory (apps/cli/src/lib.rs:888-890).
- VS Code: command Code: Turn Memory On or Off, or the Code: Memory menu entry (apps/extension-vscode/package.json:479-486; apps/extension-vscode/src/core/commandSetup.ts:1949-1962, 2037).
- Tauri desktop build (internal code, not the public Desktop): Settings Memory tab with Enable memories (apps/desktop/src/features/settings/tabs/Memory.tsx:185-191).
- Chrome: no switch found in the memory sheet (apps/extension/src/features/side-panel/memorySheet.ts, whole file searched).

**Before you start**

- Web and Cloud mobile need a signed-in account and a ready workspace; otherwise the web page says Cloud memory is unavailable until your account and workspace are ready (apps/web/features/settings/sections/MemorySection.tsx:513).
- Mobile Local mode needs no sign-in: the Local scope is created without an account (apps/mobile/src/features/auth/services/accountScopedUiState.ts:10-12).
- The workspace must allow memory; otherwise switches are disabled and a notice appears (apps/web/features/settings/sections/MemorySection.tsx:38, 140-150 via organizationMemoryAllowed in apps/web/features/settings/hooks/use-capabilities-preferences.ts:176-190).

**Screens and controls**

- Web switches: Persistent memory (MemorySection.tsx:320), Save memories from chats (398), Search past chats (411), Include sensitive topics in memory (422), Allow memory generation from tool-assisted chats (435).
- Web: the three dependent switches are disabled while Persistent memory is off and show the hint Turn on persistent memory to change this (MemorySection.tsx:401,425,438 and the hint constant near line 59). Search past chats is disabled only when settings are not loaded or the workspace blocks memory, not when Memory is off (MemorySection.tsx:413).
- Web contract text: When off, nothing is saved or read. Existing memories stay until you delete them. (MemorySection.tsx:61).
- Mobile switches in the MEMORY CONTROLS card: Memory, Search and reference chats, Generate memory from chat history, Include sensitive topics in memory; the last two are disabled while Memory is off (MemoryControlsCard.tsx:64-96).
- Mobile footnote says whether memories are on the account or on the device and that existing entries stay when Memory is off (MemoryControlsCard.tsx:128-140).
- Mobile Memory screen shows Memory is off, so new memories can't be added or imported. with a Turn on button (apps/mobile/app/(app)/settings/memory.tsx:593-598).
- CLI prints Memory is on... or Memory is off... (apps/cli/src/cloud/personalization.rs:297-301).

**Journey**

1. Open the Memory settings on the app (see where to find it).
2. See the Memory switch, off by default (apps/web/features/settings/hooks/use-capabilities-preferences.ts:62).
3. Flip it on. The change is saved as the capabilities setting for the account; a failed save shows the message Your memory settings were not saved, so nothing changed. with a Try again button (MemorySection.tsx:32,290-296).
4. Optionally flip Search past chats or Save memories from chats.
5. Start a chat. The server reads the switches on each turn and decides whether to load facts, past-chat excerpts and the memory tool (request-processor.ts:4126-4160).

**What the person sees and gets**

- Web: switch state changes at once (optimistic) and reverts to the last saved value if the save fails (use-capabilities-preferences.ts:296-313).
- Web: a saved-count line, Cloud memories are not loaded. when sync is not ready (MemorySection.tsx:338).
- Mobile: deletion-warning card, only for reset (MemoryControlsCard.tsx:30).
- VS Code: information message Memory turned on in your user settings, saved facts are included with your turns. or the off variant (commandSetup.ts:2037-2054).

**Settings**

- Account settings namespace capabilities: keys memory, generateFromHistory, searchPastChats, includeSensitiveTopics, allowToolAssistedGeneration (apps/web/lib/services/managed-memory-context-service.ts:258-281).
- Per-chat request field memory_enabled and personalization (request-processor.ts:712, 3523); the web chat sends memory_enabled false when the chat opted out (apps/web/lib/hooks/useChatStream.ts:835).
- VS Code settings agiWorkforce.memory.enabled (default true) and agiWorkforce.optOut.memory (apps/extension-vscode/package.json:1332-1346).
- Workspace policy allowMemory (managed-memory-context-service.ts:85-125).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server reads the account switches on every turn: memory is on only if capabilities.memory is exactly true; generateFromHistory defaults to true once memory is on; searchPastChats is separate (managed-memory-context-service.ts:258-281).
- Memory off: loadManagedMemoryContext returns no facts (managed-memory-context-service.ts:1146-1149); auto-saving is skipped (request-processor.ts:2392-2406); the memory tool is not offered (request-processor.ts:1123-1146); a write is refused with reason user_memory_disabled (managed-memory-context-service.ts:619-625).
- Past-chat lookup depends on searchPastChats, the surface not being api, the chat not being temporary and memory_enabled not being false; it does not depend on the Memory switch (apps/web/lib/services/turn-context-service.ts:128-131).
- Web switches, disabled states, workspace-off notice and save retry (MemorySection.tsx:285-440).
- Mobile Cloud writes memory, searchPastChats and generateFromHistory to the account settings (apps/mobile/services/cloudSettingsMapping.ts:166-168) and reads the account value back (apps/mobile/services/cloudSyncEngine.ts:600-603). Mobile Local uses a separate local settings store (apps/mobile/stores/chat/chatExecutionStore.ts:2789-2799).
- CLI agi memory on/off/status writes the same account switch (apps/cli/src/cloud/personalization.rs:273-296).
- VS Code switch and per-folder opt-out exist and gate whether facts are sent (apps/extension-vscode/src/platform/config.ts:255-261; src/memory/memoryStore.ts:54).

**Incomplete**

- No onboarding or first-run introduction to Memory in any app: nothing found in the code searched (brief S39.01 marks every app missing; doc: knowledge-base/data/area-briefs/039-memory-product.md). A founder decision says no memory step at sign-up (doc: docs/decisions/2026-09-27-founder-decisions.md:130), which conflicts with the brief's Should line.
- VS Code switch is a local VS Code user setting, not the account switch: it stops facts being sent from that editor only (apps/extension-vscode/package.json:1336; commandSetup.ts:2037-2054). Its menu label says Turn account memory off (commandSetup.ts:1955), which overstates what it does.
- CLI and VS Code have no past-chat switch (brief S39.03; apps/cli/src/lib.rs:1435-1486 lists no such subcommand).
- The Tauri desktop Memory tab shows no past-chat switch (no match for past or reference in apps/desktop/src/features/settings/tabs/Memory.tsx).

**Present but disconnected or switched off**

- The tool-assisted-generation and sensitive-topics switches only matter when Memory and Save memories from chats are on (MemorySection.tsx:401-438).

**Not available**

- Chrome extension: no Memory switch and no past-chat switch found (memorySheet.ts, memoryClient.ts).
- First-run Memory introduction on all six apps.

## 4. Required behaviour

**Established requirements**

- A visible switch turns Memory on or off, and when off the assistant neither reads nor saves memories. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S39.02)
- A control separate from the Memory switch decides whether the assistant may look up excerpts from other past chats. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S39.03)
- A first-run flow introduces Memory: what it stores, that it is off by default, and how to turn it on or manage it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S39.01)
- Memory must be explicit and controllable: disable memory and a reference-chat-history toggle are required. (source: doc: docs/product/requirements.md section 18)
- Temporary chats must not update or reference memory unless the user explicitly changes that behaviour. (source: doc: docs/product/requirements.md section 9.6)

**Acceptance criteria**

1. With Memory off, a chat that mentions a personal fact creates no row in the memory list afterwards.
2. With Memory off and a fact already saved, a reply does not use the fact.
3. Turning Search past chats on or off does not change the Memory switch, and the reverse.
4. If saving a switch fails, the switch returns to its saved value and a Try again action is shown.
5. A workspace with memory closed shows the notice and all switches disabled.
6. A new account starts with Memory off.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The past-chat switch staying enabled while Memory is off is deliberate because the server computes the two independently [inferred from turn-context-service.ts:128-131].
- The server, not the client, is the authority; client toggles only change stored settings [inferred from managed-memory-context-service.ts:258-281].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide with the founder whether a one-time Memory explanation (what is stored, off by default, where to manage) should be added, since the brief requires it and a recorded decision removes a sign-up step.
- [proposed] Rename the VS Code menu item so it says it controls this editor only, or make it write the account switch like the CLI does.
- [proposed] Add a past-chat switch to CLI and VS Code, or record the decision not to.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MemorySection | `apps/web/features/settings/sections/MemorySection.tsx` | Web and public Desktop Memory settings: switches, counts, export, clear all, scope explanation. |
| hook | useCapabilitiesPreferences | `apps/web/features/settings/hooks/use-capabilities-preferences.ts` | Loads and saves the capabilities namespace with optimistic update, version conflict retry and workspace policy read; default memory false. |
| service | readUserMemoryCapabilities / loadManagedMemoryPolicy | `apps/web/lib/services/managed-memory-context-service.ts` | Server read of the account switches into a policy object. |
| service | applyMemoryToolCapability | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Offers the memory tool only when Memory is on, chat is not temporary and the message asks about memory. |
| service | resolveInteractiveTurnContext | `apps/web/lib/services/turn-context-service.ts` | Decides whether account facts and past-chat excerpts enter the turn. |
| config | memory_enabled request field | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Per-chat override; api surface must send true to opt in. |
| service | memory-capability cache | `apps/web/lib/runtime/memory-capability.ts` | Web client cache of the memory switch, reset when the capabilities namespace is saved. |
| component | MemoryControlsCard | `apps/mobile/src/features/memory/components/MemoryControlsCard.tsx` | Mobile four-switch card with Cloud or Local wording. |
| screen | Memory screen | `apps/mobile/app/(app)/settings/memory.tsx` | Mobile screen that hosts the controls card and the off-state Turn on button. |
| service | cloudSettingsMapping | `apps/mobile/services/cloudSettingsMapping.ts` | Maps mobile Cloud switches to the account capabilities settings. |
| service | cloudSyncEngine settings pull | `apps/mobile/services/cloudSyncEngine.ts` | Reads the account memory switch back into mobile stores. |
| command | agi memory on/off/status and --no-memory | `apps/cli/src/lib.rs` | CLI subcommands and flag for the memory switch. |
| service | memory_switch | `apps/cli/src/cloud/personalization.rs` | CLI write and read of capabilities.memory. |
| command | agi-workforce.memory.toggle | `apps/extension-vscode/src/core/commandSetup.ts` | VS Code command that flips the local memory setting. |
| config | agiWorkforce.memory.enabled and optOut.memory | `apps/extension-vscode/package.json` | VS Code settings contributions. |
| component | Tauri Memory tab | `apps/desktop/src/features/settings/tabs/Memory.tsx` | Internal Tauri desktop memory settings (Enable memories). |
| table | user_settings | `apps/web/lib/services/managed-memory-context-service.ts` | Stores settings.capabilities read on every turn (query at lines 262-266). |
| test | MemorySection test | `apps/web/features/settings/sections/MemorySection.test.tsx` | Web section test file. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person flips a switch; the web hook updates the screen at once and queues a save of the capabilities namespace with a version check, retrying once on a version conflict. | device and our servers | apps/web/features/settings/hooks/use-capabilities-preferences.ts:252-300 |
| Save error: the switch returns to the last acknowledged value and an alert with Try again shows. | device | apps/web/features/settings/hooks/use-capabilities-preferences.ts:300-325; MemorySection.tsx:288-296 |
| On each chat turn the server reads the workspace policy and the account capabilities, in parallel with attachment work. A temporary chat gets the disabled policy without reading. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4126-4160 |
| If memory is on and the chat is not temporary, account facts are loaded, ranked and added as a system message; past-chat excerpts are added only if searchPastChats is on. | our servers | apps/web/lib/services/turn-context-service.ts:124-131; managed-memory-context-service.ts:1128-1215, 1315-1320 |
| Mobile Local: facts come from the device store when Memory is on and the chat is not temporary; Cloud mode leaves assembly to the server. | device | apps/mobile/stores/chat/chatExecutionStore.ts:2797-2803 |
| CLI agi memory on posts a patch {memory: true} to the account preferences route, then reads it back. | device and our servers | apps/cli/src/cloud/personalization.rs:275-303 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Memory switches (capabilities namespace) | table:user_settings, settings JSON, key capabilities (managed-memory-context-service.ts:262-266) | Yes, read by every Cloud surface; mobile mirrors it (cloudSyncEngine.ts:600-603) | Kept with the account; erased on account deletion (apps/web/lib/server/account-erasure.ts lists user data, not opened in detail) |
| Mobile Local switches | store: useLocalSettingsStore on the device (chatExecutionStore.ts:2789-2792) | No: Local and Cloud memory are kept separate (doc: docs/decisions/2026-09-27-founder-decisions.md:159-162) | Stays on the device until app data is removed [inferred] |
| VS Code memory setting | VS Code user settings (apps/extension-vscode/package.json:1332) | Only by VS Code Settings Sync if the user uses it [inferred] | Editor setting |

**Models and providers.** The switches do not depend on the chosen model. Memory facts are added as a system message whichever model answers [inferred from managed-memory-context-service.ts:1315-1320]. The memory tool is offered only to tool-capable models (request-processor.ts:5543-5550).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Cloud mobile, CLI account memory and VS Code account memory need a signed-in account. Mobile Local mode needs none (accountScopedUiState.ts:10-12). |
| Permissions | The workspace policy can close memory for members (managed-memory-context-service.ts:85-125,161-170); web shows the notice (MemorySection.tsx:38). Row-level user scoping uses getUserScopedDb (apps/web/app/api/memory/route.ts:36). |
| Subscription | none found in the code opened. No plan check appears in the memory routes or switch code I read; free-quota turns also carry memory commands (apps/web/lib/server/free-quota-turn.ts:136-150), whether Free users get memory is unknown. |
| Limits and metering | Memory routes use the chat-conversation rate-limit bucket (apps/web/app/api/memory/route.ts:34). No usage metering for the switch itself. |
| Feature flags | The per-chat memory_enabled field; workspace allowMemory; VS Code optOut.memory. No feature flag for the switch itself found. |
| Model compatibility | Switch behaviour is model independent; the memory tool needs a tool-capable model and a streaming turn (request-processor.ts:1131-1142). |
| Provider restrictions | none found in the code opened; a turn whose trust mode is not managed is refused for saving to server memory (managed-memory-context-service.ts:646-660). |
| Local mode | Mobile Local mode has its own on-device switch and on-device facts, free of any sign-in (chatExecutionStore.ts:2789-2803; apps/mobile/src/features/memory/components/MemoryControlsCard.tsx:128-140). CLI sessions on a non-managed provider do not receive account memory (apps/cli/src/agent/mod.rs:693-699). Tauri desktop Local behaviour is not established here. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Settings not loaded or load error | Switches are disabled (MemorySection.tsx: togglesDisabled uses loaded and loadError). | apps/web/features/settings/sections/MemorySection.tsx:170-176 |
| Save failed | Alert with message and Try again; switch reverts. | MemorySection.tsx:288-296; use-capabilities-preferences.ts:300-325 |
| Workspace closes memory | Notice shown; switches disabled; server writes refused with organization_memory_disabled. | MemorySection.tsx:38; managed-memory-context-service.ts:609-617 |
| Settings read fails on the server | Turn continues without account memory and logs an error. | request-processor.ts:4152-4159 |
| Temporary chat | Disabled policy, no memory read or save. | request-processor.ts:4126-4131 |
| Offline | not handled in the code opened for the web switches; mobile Cloud keeps edits locally and syncs later (apps/mobile/services/cloudSyncEngine.ts:600). | unknown for web |
| Accessibility | Web switches carry aria-labels and aria-describedby hints; mobile deletion warning is a polite live region. | MemorySection.tsx:320,398-440; MemoryControlsCard.tsx:117 |
| App differences | VS Code switch is local; CLI switch is account-wide; Chrome has none. | commandSetup.ts:2037; personalization.rs:273-296 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/MemorySection.test.tsx`: Web Memory section (file exists; contents not opened here)
- `apps/web/features/settings/sections/__tests__/MemorySection.test.tsx`: Web Memory section, second file (contents not opened)
- `apps/web/lib/runtime/__tests__/memory-capability.test.ts`: Memory capability cache (name only)
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.memory-state.test.ts`: Memory state in the chat processor (name only)
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.memory.test.ts`: Memory in the chat processor (name only)
- `apps/mobile/__tests__/MemoryControlsCard.test.tsx`: Mobile controls card (name only)
- `apps/mobile/__tests__/MemoryScreenMemoryOff.test.tsx`: Mobile Memory screen when off (name only)
- `apps/extension-vscode/src/__tests__/memoryControls.test.ts`: VS Code memory switch (name only)
- `apps/desktop/src/features/settings/__tests__/Gap009MemoryControls.test.tsx`: Tauri desktop memory controls (name only)

**Test scenarios**

- **Default is off**
  1. Create a new account.
  2. Open Settings, Personalization, Memory.
  3. Tell a chat: I live in Berlin.
  4. Open the Memory list.
  - Expected: Persistent memory is off and the list is empty.
- **Memory on, past chats off**
  1. Turn Persistent memory on and leave Search past chats off.
  2. State a fact in chat one.
  3. In chat two ask what you said earlier in chat one.
  - Expected: Saved facts may be used; excerpts of chat one are not looked up.
- **Memory off keeps data**
  1. With facts saved, turn Persistent memory off.
  2. Ask a question that depends on a saved fact.
  - Expected: The assistant does not use the fact; the list still shows the facts.
- **CLI switch**
  1. Run agi memory on, then agi memory status, then agi memory off.
  - Expected: Messages say on, then on, then off, and the web switch matches.
- **Save failure**
  1. Block the network, flip a switch.
  - Expected: Switch returns to its old value and the Try again alert appears.

**Where to look when it fails**

- Server log line: Managed memory load failed; continuing without account memory (request-processor.ts:4153).
- Refusal reasons user_memory_disabled and organization_memory_disabled (managed-memory-context-service.ts:533-541).
- Row in table:user_settings, settings -> capabilities.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/039-memory-product.md](../../70-qa/test-plans/web/039-memory-product.md)
- Desktop: [70-qa/test-plans/desktop/039-memory-product.md](../../70-qa/test-plans/desktop/039-memory-product.md)
- Mobile: [70-qa/test-plans/mobile/039-memory-product.md](../../70-qa/test-plans/mobile/039-memory-product.md)
- CLI: [70-qa/test-plans/cli/039-memory-product.md](../../70-qa/test-plans/cli/039-memory-product.md)
- VS Code: [70-qa/test-plans/vscode/039-memory-product.md](../../70-qa/test-plans/vscode/039-memory-product.md)

## 10. Gaps and dependencies

- **No Memory introduction or first-run flow on any app.** Affects: All new users, all six apps. Evidence: Brief S39.01 all missing; docs/decisions/2026-09-27-founder-decisions.md:130 says no memory step at sign-up. Work needed: Founder decision, then a short explainer or a link from the first memory-related moment.
- **Chrome has no Memory switch or past-chat switch.** Affects: Chrome users. Evidence: Brief S39.02/S39.03 chrome missing; no switch in memorySheet.ts. Work needed: Add a switch or a link to web settings; the server already honours the account switch for chrome turns [inferred from request-processor.ts:2392-2406 not excluding chrome].
- **VS Code switch does not change the account switch and its label says account memory.** Affects: VS Code users. Evidence: commandSetup.ts:1955,2037-2054. Work needed: Relabel or write the account setting.
- **CLI and VS Code lack a past-chat switch.** Affects: CLI, VS Code. Evidence: Brief S39.03; lib.rs:1435-1486. Work needed: Add the switch or document the decision.
- **Tauri desktop tab lacks a past-chat switch.** Affects: Internal Tauri desktop. Evidence: Memory.tsx has no past-chat control. Work needed: Confirm whether the Tauri build is still shipped; add or retire.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-memory-projects-and-context
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- table:user_settings
- api:GET /api/memory
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- mode:local
- mode:cloud

## Unknown

- Whether Free-plan accounts may turn Memory on (no plan check found in the code opened).
- Offline behaviour of the web switches.
- Whether the Tauri desktop build ships to anyone.
- How a Chrome turn behaves when the account switch is off beyond the shared server path.
- Whether any own-key (BYOK) turn reaches the server memory path.
