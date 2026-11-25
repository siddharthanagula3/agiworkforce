---
id: "F041-03"
type: "feature"
title: "Memory and custom-instruction choices in temporary chat"
aliases: ["Personalized / Unpersonalized switch", "Memory exclusion in temporary chat", "personalization flag", "memory_enabled", "temporaryChatPersonalized", "Memory write exclusion", "Custom-instruction choice", "S41.04", "S41.05", "S41.06"]
area: "41 Temporary and private experiences"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S41.04", "S41.05", "S41.06"]
depends_on: ["surface:web", "surface:mobile", "surface:chrome", "mode:cloud", "mode:local", "F041-01", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "api:POST /api/llm/v1/chat/completions", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F041-03 Memory and custom-instruction choices in temporary chat

In a temporary chat memory is never read and never saved. A Personalized switch decides whether profile, custom instructions and response style apply to the turn. Web and mobile Cloud have the switch; Chrome excludes memory but has no switch; CLI and VS Code have no temporary chat.

Area: [41. Temporary and private experiences](README.md). Requirement items: [S41.04](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4104), [S41.05](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4105), [S41.06](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4106).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | not stated on this page | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Keeps temporary chats out of memory in both directions and lets the person choose whether their profile, instructions and style are used for the turn.

**Why it exists.** Product rule: temporary chats neither read nor write memory (doc: docs/product/definition.md:173; docs/product/requirements.md:765). Without the rule a private chat could leak into or be shaped by saved memory.

**Who uses it.** People using a temporary chat who want a clean answer, or want a private chat that still sounds like them.

**Problems it solves**

- Private questions becoming remembered facts.
- Old memories steering a throwaway chat.
- Custom instructions that do not fit a one-off chat.

**Use cases**

- Ask a sensitive question without it entering memory.
- Flip to Unpersonalized to get a plain answer without instructions and style.
- Say 'remember that...' in a temporary chat and see nothing saved.

## 2. User experience

**Where to find it**

- Web: chat header button with role switch labelled 'Personalized' or 'Unpersonalized'; tooltip 'Personalized uses your profile, instructions and response style.' (apps/web/features/chat/pages/WebChatPage.tsx:7365-7379; packages/ui/i18n/locales/en/chat.json:251-253).
- Web: the + menu Memory row is disabled in a temporary chat with the title 'Temporary chats never read or save memory.' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6133-6140).
- Mobile Cloud mode: the Personalized switch inside the temporary banner (apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:89-101).
- Chrome: no switch; memory skipped automatically.

**Before you start**

- The chat is temporary.
- Mobile: Cloud mode for the switch (the banner shows it only when appMode is cloud).
- Mobile: the banner must be visible; after dismissal the switch is not reachable until the app restarts (see F041-02).

**Screens and controls**

- Web header switch button (aria-checked, aria-label Personalized).
- Web + menu Memory row shown unchecked and disabled in temporary chats.
- Mobile banner Switch with accessibility hint 'Personalized uses your profile, instructions and response style. Unpersonalized leaves them out.'

**Journey**

1. Start a temporary chat.
2. Optionally flip the switch to Unpersonalized.
3. Send a message; the client adds personalization false to the request when the switch is off.
4. The server skips custom instructions and also turns memory off for the turn.
5. If the message looks like a memory request the server does not offer the memory tools.

**What the person sees and gets**

- Switch text flips between Personalized and Unpersonalized.
- Memory menu row explains why it is disabled.
- No message is shown when a remember command is sent; the web client simply does not run the memory command and the server does not offer memory tools (WebChatPage.tsx:2628-2638).

**Settings**

- Web: temporaryChatPersonalized in the chat store, default true (web-chat-store.ts:1030).
- Mobile: temporaryChatPersonalized in settingsStore, default true and persisted (apps/mobile/stores/settingsStore.ts:138, 170).
- Account memory settings remain separate (Settings, Personalization / Memory).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web client sends personalization false when the switch is Unpersonalized in a temporary chat (apps/web/lib/hooks/useChatStream.ts:826-840; 4644).
- Server: personalization false forces memory_enabled false (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3523) and skips the custom-instructions preamble (3993-3994); chat setup reports personalization 'off' (2355-2356).
- Server: for a temporary conversation the memory policy is replaced by a disabled policy, so memory is not read (4126-4132) and turn context leaves out memory and past chats (apps/web/lib/services/turn-context-service.ts:126-130).
- Server: memory tool definitions are not added for a temporary chat (request-processor.ts:1123-1147) and automatic memory learning is off (2390-2410).
- Web client skips the explicit memory command for a temporary chat (WebChatPage.tsx:2628-2638).
- Mobile: memory reads, past-chat context and memory command answering are skipped in a temporary chat and personalization false is sent when the switch is off (apps/mobile/stores/chat/chatExecutionStore.ts:2793-2811, 2962, 3453-3455, 5216-5219).
- Chrome: a temporary turn goes to continueTurn, skipping the memory-command path (apps/extension/src/side_panel.ts:9163-9172).

**Incomplete**

- The first draft says a memory command in a temporary chat is refused by the app. No refusal message was found on web or mobile; the command is skipped and the text goes to the model as an ordinary message (WebChatPage.tsx:2628-2638; chatExecutionStore.ts:2962).
- Mobile Local mode: profile and personalization are injected from local settings regardless of the Personalized switch, which is hidden in Local mode (chatExecutionStore.ts:2816; TemporaryChatBanner.tsx).
- The switch is one global value, not per chat, on both web and mobile [inferred from single field in web-chat-store.ts:787 and settingsStore.ts:60].
- Web: for a device-model turn the personalization choice is read locally (useChatStream.ts:4460-4469); whether the on-device path honours it end to end was only partly traced.

**Present but disconnected or switched off**

- Brief S41.04 'memory read choice where offered': no control offers memory reads in a temporary chat; reads are always excluded (apps/web/lib/services/turn-context-service.ts:126-130).

**Not available**

- CLI and VS Code: no temporary chat, so nothing to apply.
- Chrome: no Personalized switch found.

## 4. Required behaviour

**Established requirements**

- Nothing from a temporary chat is saved to memory. (source: Brief S41.05)
- Where offered, the user can choose whether a temporary chat may read saved memory, and the choice is honoured. (source: Brief S41.04)
- The user can choose whether custom instructions apply in a temporary chat. (source: Brief S41.06)
- Temporary chats neither read nor write memory. (source: doc: docs/product/definition.md:173)
- Temporary chats must not update or reference memory unless the user explicitly changes that behavior. (source: doc: docs/product/requirements.md:765-766)

**Acceptance criteria**

1. In a temporary chat on web, type 'remember that I like tea': no memory item appears in Settings, Memory and no memory tool call is shown.
2. In a temporary chat, a fact stored earlier in a normal chat is not used in the answer.
3. Switching the header to Unpersonalized makes the next request carry personalization false and the answer ignores custom instructions.
4. The + menu Memory row is disabled with the title 'Temporary chats never read or save memory.'
5. On mobile Cloud the banner switch changes the label and the next Cloud request includes personalization false.
6. Memory-on-the-server tests for a temporary conversation return no memory tools.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because personalization false also forces memory_enabled false on the server, Unpersonalized is a superset of the always-on exclusion [inferred from request-processor.ts:3523].
- The server also honours personalization false on non-temporary chats, but no UI offers it there [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the mobile Local mode honour the Personalized switch or show it.
- [proposed] Show a short notice when a memory request is skipped in a temporary chat.
- [proposed] Store the switch per chat.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | web-chat-store temporaryChatPersonalized | `apps/web/shared/stores/web-chat-store.ts` | Switch state, default true. |
| screen | WebChatPage header switch | `apps/web/features/chat/pages/WebChatPage.tsx` | Renders the Personalized / Unpersonalized button. |
| hook | useChatStream turnPrivacyRequestFields | `apps/web/lib/hooks/useChatStream.ts` | Adds personalization false to the request; local-model path reads it too. |
| service | request-processor personalization | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Schema field, forces memory off, skips instructions, no memory tools, no auto learning. |
| service | turn-context-service | `apps/web/lib/services/turn-context-service.ts` | resolveInteractiveTurnContext excludes memory and past chats when temporaryChat. |
| hook | use-explicit-memory-commands | `apps/web/features/chat/hooks/use-explicit-memory-commands.ts` | Runs remember/forget commands; skipped for temporary chats at the call site. |
| component | ChatComposerNew memory row | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Disables Memory row in temporary chat with explanation. |
| component | TemporaryChatBanner switch | `apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx` | Personalized switch in Cloud mode. |
| store | mobile settingsStore temporaryChatPersonalized | `apps/mobile/stores/settingsStore.ts` | Switch state, persisted. |
| store | mobile chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Skips memory reads, past chats, memory commands; sends personalization false. |
| service | mobile memory consolidation gate | `apps/mobile/src/features/memory/services/consolidation.ts` | shouldConsolidateMemoryOnClient receives isTemporaryChat (used at chatExecutionStore.ts:2828-2833). |
| service | memory tool definitions | `apps/web/lib/server/tools/memory-tools.ts` | The tool set that is not offered for temporary chats (file listed by test memory-tools.test.ts). |
| component | Chrome continueTurn path | `apps/extension/src/side_panel.ts` | Temporary turns skip continueTurnWithMemory. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person flips the switch; the value is stored in a client store. | device | apps/web/features/chat/pages/WebChatPage.tsx:7372 |
| On send the client skips the explicit memory command for a temporary chat. | device | apps/web/features/chat/pages/WebChatPage.tsx:2628-2638 |
| The request carries conversation id and, if Unpersonalized, personalization false. | device | apps/web/lib/hooks/useChatStream.ts:826-840, 4644 |
| The server reads is_temporary from the conversation row, disables the memory policy and leaves memory, past chats and memory tools out; with personalization false it also skips instructions. | our servers | request-processor.ts:3811-3919, 4126-4132, 3993-3994 |
| The assembled prompt goes to the chosen provider. | outside service | apps/web/app/api/llm/v1/chat/completions/route.ts [inferred: provider call is the normal chat route] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Memory items | account memory tables on our servers (not touched for temporary turns) | Not applicable: nothing is written | Existing memory is untouched |
| Personalization switch | web: chat store in memory; mobile: persisted settings store (MMKV) [inferred: mmkvStorage] | No | Web resets on reload [inferred]; mobile kept |

**Models and providers.** Memory exclusion is applied before the provider is called, so it does not depend on model or provider. Memory tools are offered only to tool-capable models and only outside temporary chats (request-processor.ts:1123-1147).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account for the Cloud route. |
| Permissions | Account memory policy is read for non-temporary chats only; for temporary chats a disabled policy is used (request-processor.ts:4126-4132). |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | Account memory settings (memory enabled, generate from history, search past chats) exist for normal chats (apps/web/lib/services/turn-context-service.ts:126-130); no flag changes the temporary exclusion. |
| Model compatibility | Memory tools require a tool-capable model and streaming (request-processor.ts:1123-1139); irrelevant in temporary chats. |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local mode: memory reads skipped in temporary chats (chatExecutionStore.ts:2798-2800), local past-chat context skipped (2811), but local personalization is still injected (2816). Desktop Tauri Local: the native runtime is said to skip memory (comment at apps/desktop/src/runtime/TauriRuntime.ts:775-776; Rust side not verified). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Remember command in a temporary chat | Not run on web or mobile; no memory tools offered by the server; text treated as a message | WebChatPage.tsx:2628-2638; chatExecutionStore.ts:2962; request-processor.ts:1123-1147 |
| Memory unreadable or policy missing | Not applicable for temporary turns (disabled policy used) | request-processor.ts:4126-4132 |
| Account memory disabled by workspace | Not relevant to temporary chats | turn-context-service.ts:126-130 |
| Switch left Unpersonalized | Stays across chats (global value) | web-chat-store.ts:787,1030 |
| Accessibility | Web switch role and aria-checked; mobile Switch with label and hint | WebChatPage.tsx:7368-7371; TemporaryChatBanner.tsx:97-104 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.memory.test.ts`: Memory behaviour in the request processor (file exists; temporary cases not individually confirmed).
- `apps/web/lib/server/tools/memory-tools.test.ts`: Memory tools (mentions temporary).
- `apps/web/lib/services/__tests__/memory-command-gate.test.ts`: Memory command gate (mentions temporary).
- `apps/mobile/__tests__/consolidation-mode-routing.test.ts`: Mobile memory consolidation routing (mentions temporary).
- `apps/mobile/__tests__/TemporaryChatBanner.test.tsx`: Banner behaviour; switch not individually confirmed.

**Test scenarios**

- **Remember in temporary chat**
  1. Start a temporary chat on web.
  2. Send 'remember that my cat is Mia'.
  3. Open Settings, Memory.
  - Expected: No new memory item.
- **No memory read**
  1. Save a memory in a normal chat.
  2. In a temporary chat ask about it.
  - Expected: The assistant does not know it.
- **Unpersonalized**
  1. Set a custom instruction.
  2. Start a temporary chat, flip to Unpersonalized, send.
  - Expected: Request has personalization false; answer ignores the instruction.
- **Mobile Cloud switch**
  1. Cloud mode, temporary on, flip the banner switch off, send.
  - Expected: Request body includes personalization false.
- **Menu row**
  1. Open the + menu in a temporary chat.
  - Expected: Memory row disabled with the explanatory title.

**Where to look when it fails**

- Server log context for the chat route; chat setup object reports personalization 'off' and memory state.
- Check request body for personalization false.
- Memory tables for new rows after the test.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/041-temporary-and-private-experiences.md](../../70-qa/test-plans/web/041-temporary-and-private-experiences.md)
- Desktop: [70-qa/test-plans/desktop/041-temporary-and-private-experiences.md](../../70-qa/test-plans/desktop/041-temporary-and-private-experiences.md)
- Mobile: [70-qa/test-plans/mobile/041-temporary-and-private-experiences.md](../../70-qa/test-plans/mobile/041-temporary-and-private-experiences.md)
- Chrome: [70-qa/test-plans/chrome/041-temporary-and-private-experiences.md](../../70-qa/test-plans/chrome/041-temporary-and-private-experiences.md)

## 10. Gaps and dependencies

- **First-draft claim that the app refuses memory commands is not in the code; the command is silently skipped.** Affects: Web, mobile. Evidence: WebChatPage.tsx:2628-2638; chatExecutionStore.ts:2962. Work needed: Decide whether to show a notice.
- **Mobile Local mode ignores the Personalized choice.** Affects: Mobile Local. Evidence: chatExecutionStore.ts:2816. Work needed: Honour or hide consistently.
- **No memory-read choice is offered (brief says where offered).** Affects: All apps. Evidence: turn-context-service.ts:126-130. Work needed: Record that none is offered by design.
- **Chrome has no Personalized switch.** Affects: Chrome. Evidence: no match for personalization in side_panel temporary code. Work needed: Add or decide.
- **Switch is global, not per chat.** Affects: Web, mobile. Evidence: web-chat-store.ts:787. Work needed: Decide scope.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:chrome
- mode:cloud
- mode:local
- F041-01
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- api:POST /api/llm/v1/chat/completions
- SYS-security-and-privacy

## Unknown

- Which tests assert that a temporary turn gets no memory tools (names not matched individually).
- Whether the on-device web path honours Unpersonalized fully.
- Whether the Rust runtime on desktop Tauri skips memory for chat id -1.
- Whether personalization on mobile Local is meant to stay on.
