---
id: "F094-10"
type: "feature"
title: "Agent-specific memory and writing-style profile (not built)"
aliases: ["Agent-specific memory", "per-agent memory", "writing-style profile", "Use style", "Style: Formal / Casual / Concise / Detailed", "tone picker"]
area: "94 Memory and personalization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S94.14", "S94.16"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "mode:local", "table:user_memories", "table:user_settings", "store:agi-composer-writing-style", "SYS-memory-projects-and-context", "SYS-agents-tools-and-automation", "SYS-data-model-and-migrations", "SYS-chat-turn-pipeline", "F094-07", "F094-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F094-10 Agent-specific memory and writing-style profile (not built)

Not built. The plan was a separate memory for each agent and a profile of a person's writing style learned from their text. The code has neither. The only nearby control is a four-choice style picker in the composer that adds one fixed sentence to the prompt and is stored on the device.

Area: [94. Memory and personalization components](README.md). Requirement items: [S94.14](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9414), [S94.16](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9416).

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

**What it does.** Intended: (1) keep what an agent learns apart from the person's own memory; (2) learn how a person writes and use it so replies sound like them. Today only a manual style choice exists (packages/ui/unified-chat/src/lib/writingStyle.ts:1-12).

**Why it exists.** Agents that act alone should not mix their notes into personal memory, and style matching is a common personalization feature. [inferred] The brief marks both as missing (S94.14, S94.16).

**Who uses it.** No one today for the missing parts. The style picker is used by anyone who chooses 'Use style' in the composer menu.

**Problems it solves**

- Planned: agent notes leaking into personal memory.
- Planned: replies not matching the person's voice.
- Today: a quick way to ask for a formal, casual, concise or detailed tone.

**Use cases**

- Today: pick 'Concise' before sending a question.
- Planned: a custom agent keeps its own facts.
- Planned: the assistant drafts an email in the person's usual voice.
- Planned: the person resets the learned style.

## 2. User experience

**Where to find it**

- Style picker: composer attachment menu item 'Use style' (shows 'Style: <Label>' once chosen) with choices Formal, Casual, Concise, Detailed (packages/ui/unified-chat/src/components/AttachmentMenu.tsx:562-567,880-891). The shared composer is used by desktop and other hosts of packages/ui/unified-chat; which apps mount it was not checked.
- Agent-specific memory: not available on any app.
- Writing-style profile: not available on any app.

**Before you start**

- Style picker: none beyond using the shared composer.
- The planned features have no prerequisite because they do not exist.

**Screens and controls**

- Style picker only: four options; choosing again clears it (packages/ui/unified-chat/src/components/ChatInput.tsx:310-314).

**Journey**

1. Open the composer menu.
2. Choose 'Use style' and a tone.
3. Send; the tone sentence is added to the system instructions for that message (packages/ui/unified-chat/src/hooks/useChat.ts:1083).
4. The choice is remembered in this browser or app profile under 'agi-composer-writing-style' (writingStyle.ts:31-45).

**What the person sees and gets**

- Menu label 'Style: Formal' etc.
- The reply follows the tone; no profile is shown.

**Settings**

- Local storage key agi-composer-writing-style; not an account setting (writingStyle.ts:31-37 comment: no endpoint stores it).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Four fixed style instructions and a validity check (writingStyle.ts:1-24).
- Style choice saved and restored on the device, with storage errors ignored (writingStyle.ts:39-61; ChatInput.stylePersistence test).
- The chosen style is turned into a prompt instruction in useChat (packages/ui/unified-chat/src/hooks/useChat.ts:905,1083).

**Incomplete**

- Memory provenance has an agent id field, and persistManagedAutoMemoryFacts accepts agentId (apps/web/lib/services/managed-memory-context-service.ts:467,480,1354,1426), but the only caller does not pass one (apps/web/lib/services/managed-auto-memory-service.ts:120-128), and no read path filters by it (loadManagedMemoryContext at lines 1128-1195 has no agent parameter). So every memory is personal.
- Migration 0285 adds a provenance column that includes the agent (apps/web/db/neon/0285_user_memories_provenance.sql:20-27); its header says draft.

**Present but disconnected or switched off**

- Custom agents exist as a separate feature (web_conversations.agent_id, apps/web/db/neon/0370_user_agents.sql:139) but have no memory of their own in the code read.

**Not available**

- Agent-specific memory store: no table, route or code found (search for agent_memor, agentMemory in apps and packages returned nothing).
- Writing-style profile generator: no code that analyses a person's text for style (search for styleProfile, style_profile returned nothing outside the picker).
- Both are absent on all six apps.

## 4. Required behaviour

**Established requirements**

- A store keeps memory per agent, separate from personal memory. (source: S94.14 (brief, status 'platform missing'))
- A component builds a profile of the user's writing style from their text. (source: S94.16 (brief, status 'platform missing'))
- The shared composer style choice is device storage because no endpoint stores it for the account. (source: packages/ui/unified-chat/src/lib/writingStyle.ts:31-37 (code comment))

**Acceptance criteria**

1. Today: choosing 'Concise' adds the concise instruction to the next message and survives reload.
2. Today: an invalid stored value is ignored.
3. If built: a fact an agent learns is not read into a personal chat, and a personal memory is not read into an agent's runs unless allowed.
4. If built: the person can see, edit and delete the style profile.
5. If built: temporary chats and never-remember terms (F094-07) apply to both.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Any future agent memory must obey the same source suppression, never-remember and temporary-chat rules as personal memory (F094-07). [inferred]
- A style profile built from the person's text is sensitive personal data and would need consent and deletion controls. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an agent_id column or table, scoped reads and a visible 'Agent memory' list per agent.
- [proposed] Start the style profile as an explicit, editable short note rather than hidden learning.
- [proposed] Store the style choice in account preferences so it follows the person across apps.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | writingStyle | `packages/ui/unified-chat/src/lib/writingStyle.ts` | Style names, prompt sentences, device storage |
| component | AttachmentMenu (style submenu) | `packages/ui/unified-chat/src/components/AttachmentMenu.tsx` | 'Use style' menu item and four options |
| component | ChatInput | `packages/ui/unified-chat/src/components/ChatInput.tsx` | Holds the active style and saves it |
| hook | useChat | `packages/ui/unified-chat/src/hooks/useChat.ts` | Adds the style instruction to the request |
| component | ChatInterface | `packages/ui/unified-chat/src/components/ChatInterface.tsx` | Passes the style through |
| test | writingStyle test | `packages/ui/unified-chat/src/lib/writingStyle.test.ts` | Style helper tests |
| test | ChatInput.stylePersistence | `packages/ui/unified-chat/src/components/__tests__/ChatInput.stylePersistence.test.tsx` | Style persistence tests |
| service | memoryProvenance | `apps/web/lib/services/managed-memory-context-service.ts` | Builds a provenance record with an optional agent id (lines 476-505); not used to scope reads |
| service | persistManagedAutoMemoryFacts | `apps/web/lib/services/managed-memory-context-service.ts` | Accepts agentId (line 1354) but receives none from its caller |
| service | managed-auto-memory-service | `apps/web/lib/services/managed-auto-memory-service.ts` | Only caller of persistManagedAutoMemoryFacts; passes no agent |
| table | user_memories | `apps/web/db/neon/0010_memory.sql` | The only memory table; personal and project scope, no agent scope |
| schema | user_memories provenance | `apps/web/db/neon/0285_user_memories_provenance.sql` | Adds source conversation, source turn and a provenance jsonb |
| table | user agents | `apps/web/db/neon/0370_user_agents.sql` | Custom agents table; conversations link to an agent (line 139) |
| service | request-processor ownership read | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Reads agent_id of the conversation (line 3811) but memory loading ignores it |
| service | turn-context-service | `apps/web/lib/services/turn-context-service.ts` | Memory scope uses project, not agent (lines 143-157) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person chooses a style in the composer; the choice is saved in browser or app storage. | device | packages/ui/unified-chat/src/lib/writingStyle.ts:39-61 |
| On send, the matching sentence is added to the system instructions of the request. | device | packages/ui/unified-chat/src/hooks/useChat.ts:1083 |
| The model service receives the instruction with the rest of the prompt and replies in that tone. | outside service | [inferred] the request is the same chat request used by other chats; the provider path was not read for this feature |
| Agent memory and style profile: no flow exists. | device | no code found |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chosen style (formal, casual, concise, detailed) | Browser or app local storage key agi-composer-writing-style | No | Stays until cleared or the person chooses it again |

**Models and providers.** The style is a plain sentence in the prompt, so it works with any model the composer can send to. No model builds a profile today.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Style picker: none found in the code (stored locally). Planned features: not applicable. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code for the picker. |
| Provider restrictions | none found in the code. |
| Local mode | The picker is device storage and a prompt sentence, so it works in Local mode wherever the shared composer is mounted; which apps mount it was not checked. No Local agent memory or style profile exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Blocked or full storage | Errors ignored; sending is not broken; the style is simply not remembered. | packages/ui/unified-chat/src/lib/writingStyle.ts:39-61 |
| Invalid stored style value | Ignored; no instruction added. | writingStyle.ts:17-26 |
| Server render | No storage access. | writingStyle.ts:40 |
| Agent memory or profile states | not handled in the code because the feature does not exist. | searches named in current_implementation |
| Accessibility of the picker | unknown; menu component not audited for this entry. | AttachmentMenu.tsx:880-900 not read in full |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/lib/writingStyle.test.ts`: Style instruction lookup and validation
- `packages/ui/unified-chat/src/components/__tests__/ChatInput.stylePersistence.test.tsx`: Style survives remount
- `packages/ui/unified-chat/src/components/__tests__/ChatInput.draftOwnership.test.tsx`: Draft ownership with style state
- `packages/ui/unified-chat/src/hooks/__tests__/useChat.toolCallError.test.tsx`: useChat behaviour that references writing style

**Test scenarios**

- **Style picker**
  1. Open the composer menu, choose 'Use style' > 'Concise', send a question, reload.
  - Expected: The reply is shorter and the menu still shows 'Style: Concise'.
- **Bad stored value**
  1. Set localStorage agi-composer-writing-style to 'constructor', reload, send.
  - Expected: No style sentence is added and nothing breaks.
- **Absence check: agent memory**
  1. Run a custom agent that states a fact, then open the person's memory list.
  - Expected: No agent-only memory list exists; any saved fact is a personal memory (current behaviour, documents the gap).
- **Absence check: style profile**
  1. Search the settings of every app for a 'writing style' profile.
  - Expected: None found.

**Where to look when it fails**

- localStorage key agi-composer-writing-style.
- grep for agentId in memory services shows only the unused provenance field.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No agent-specific memory store** Affects: Custom-agent and scheduled-agent users on every app. Evidence: brief S94.14; persistManagedAutoMemoryFacts caller passes no agentId (managed-auto-memory-service.ts:120-128); no agent filter in loadManagedMemoryContext. Work needed: Design a scoped store, read path, UI and rules (F094-07 applies).
- **No writing-style profile generator** Affects: All users. Evidence: brief S94.16; only a fixed picker exists. Work needed: Decide the product, consent and deletion model first, then build.
- **Style choice is device-only, not an account setting** Affects: People who use more than one device. Evidence: writingStyle.ts:31-37. Work needed: Store in account preferences if it should follow the person.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- mode:local
- table:user_memories
- table:user_settings
- store:agi-composer-writing-style
- SYS-memory-projects-and-context
- SYS-agents-tools-and-automation
- SYS-data-model-and-migrations
- SYS-chat-turn-pipeline
- F094-07
- F094-09

## Unknown

- Which apps mount the shared composer's style submenu (web has its own composer, apps/web/features/chat/components/Composer/ChatComposerNew.tsx).
- Whether any plan document under docs/product describes agent memory or a style profile; docs were not searched.
- Whether the memory provenance migration 0285 has been applied; its header says draft.
- Whether the on-device memory in mobile or desktop Local mode has any per-agent concept.
