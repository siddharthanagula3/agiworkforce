---
id: "AREA-094"
type: "area"
title: "Memory and personalization components"
features: ["F094-01", "F094-02", "F094-03", "F094-04", "F094-05", "F094-06", "F094-07", "F094-08", "F094-09", "F094-10"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 94. Memory and personalization components

Account memory lets the assistant remember facts about the person across chats, so replies fit them without repeated setup. The person can say "remember" or "forget" in plain words, see and pin or delete what is stored, and decide what personalization may use (chats, past-chat recall, connectors, imports) and what it must never store. Background jobs expire old memories, and a few features (a recap, scheduled runs with recent chats) read from the same personal data.

**Who uses it.** Every signed-in account can switch memory on or off in Settings, as the code shows (capability flags read from user settings, default off for most flags). Workspace admins can switch memory off for a whole organization (organization memory policy). Developers use the /api/llm chat endpoint, where memory is off unless the request turns it on, and the API surface never learns from or saves memory automatically (surface 'api' is excluded). No plan gate was found in the memory code itself; see not_sure.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F094-01](F094-01-learn-facts-from-chats.md) | Learn facts from chats | n/a | n/a | n/a | n/a | n/a | n/a |
| [F094-02](F094-02-explicit-remember-and-forget-commands.md) | Explicit remember and forget commands | n/a | n/a | n/a | n/a | n/a | n/a |
| [F094-03](F094-03-manage-saved-memories-list-pin-delete.md) | Manage saved memories (list, pin, delete) | n/a | n/a | n/a | n/a | n/a | n/a |
| [F094-04](F094-04-expiry-and-background-upkeep.md) | Expiry and background upkeep | n/a | n/a | n/a | n/a | n/a | n/a |
| [F094-05](F094-05-use-memories-in-replies-retrieval-ranking-scope.md) | Use memories in replies (retrieval, ranking, scope) | n/a | n/a | n/a | n/a | n/a | n/a |
| [F094-06](F094-06-import-and-export-memories.md) | Import and export memories | n/a | n/a | n/a | n/a | n/a | n/a |
| [F094-07](F094-07-personalization-source-choices-and-never-remember.md) | Personalization source choices and never-remember rules | n/a | n/a | n/a | n/a | n/a | n/a |
| [F094-08](F094-08-attribution-of-replies-to-memories-and-past-chats.md) | Attribution of replies to memories and past chats | n/a | n/a | n/a | n/a | n/a | n/a |
| [F094-09](F094-09-personal-recap-and-scheduled-run-context.md) | Personal recap and scheduled-run context | n/a | n/a | n/a | n/a | n/a | n/a |
| [F094-10](F094-10-agent-specific-memory-and-writing-style-profile-no.md) | Agent-specific memory and writing-style profile (not built) | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/094-memory-and-personalization-components.md](../../10-requirements/capabilities/094-memory-and-personalization-components.md).

## How this area works in the code

1. **1. The person types a remember or forget command in the web chat.** The chat calls the explicit command hook after the send is accepted. The hook returns a report and posts to the commands API. (`apps/web/features/chat/pages/WebChatPage.tsx:2630`, `apps/web/features/chat/hooks/use-explicit-memory-commands.ts:17`)
2. **2. The chat request reaches the server and memory is decided for the turn.** The server reads the per-chat memory override and the personalization switch, and turns memory off for the turn when either is false. It checks the organization policy and the user's own switches before reading or learning anything. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:712-718`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2338`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3523`, `apps/web/lib/services/managed-memory-context-service.ts:240-256`, `apps/web/lib/services/managed-memory-context-service.ts:258-281`)
3. **3. Saved memories are loaded for the turn.** The turn context service loads the suppressed sources and the project scope, then runs the memory loader. The loader reads active, unexpired, undeleted rows for the user and workspace, sorts pinned first, ranks by relevance when there is a request, and keeps at most 30. (`apps/web/lib/services/turn-context-service.ts:105-150`, `apps/web/lib/services/managed-memory-context-service.ts:1128-1217`, `apps/web/lib/services/managed-memory-context-service.ts:1091-1126`, `apps/web/lib/services/managed-memory-context-service.ts:1264-1279`)
4. **4. Memories are added to the model's system context and cited.** The loaded memories are formatted as a system block and inserted into the context. The memory citations are kept with the turn. (`apps/web/lib/services/turn-context-service.ts:209-240`, `apps/web/lib/services/managed-memory-context-service.ts:1281-1320`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4342-4344`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6761`)
5. **5. After the reply, candidate facts are extracted from the user's message.** Learning is allowed only when the policy has memory and history on, the chat is not temporary, the per-chat override is not off, and the surface is not the API. The sentence splitter and rules in the agent core pick up to 5 candidate facts; Google user data turns are skipped. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2392-2417`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4470-4482`, `packages/ai/agent-core/src/memory.ts:70-95`, `apps/web/lib/services/managed-auto-memory-service.ts:100-125`)
6. **6. Each write passes the eligibility gate, then duplicates and conflicts are handled.** The admission check refuses prohibited content (credentials, payment numbers), applies the never-remember list, the organization policy, the user policy and the sensitive-topic rule. Then a single SQL statement either merges a duplicate by normalized key, or inserts a row and supersedes conflicting older memories on the same topic. (`apps/web/lib/services/managed-memory-context-service.ts:697-741`, `apps/web/lib/services/managed-memory-context-service.ts:742-800`, `apps/web/lib/services/managed-memory-context-service.ts:607-672`, `packages/contracts/context/src/memory-content-policy.ts:104-125`, `apps/web/lib/services/memory-write-service.ts:34-50`)
7. **7. The row is stored with provenance.** The row stores content, category, source (web, desktop, mobile or auto), pinned flag, expiry, project, workspace, and the source conversation and turn, plus a provenance record. (`apps/web/lib/services/managed-memory-context-service.ts:476-505`, `apps/web/lib/services/managed-memory-context-service.ts:1343-1376`, `apps/web/app/api/memory/route.ts:42-90`)
8. **8. The person manages memories in Settings.** The settings list reads the memory route. Pin and delete call the item route, which sets the pinned flag or writes the tombstone. Source toggles and never-remember terms are saved as the 'memory' preference namespace in user settings. (`apps/web/features/memory/cloud-memory-controller.ts:26`, `apps/web/app/api/memory/[id]/route.ts:102-126`, `apps/web/app/api/memory/[id]/route.ts:148-170`, `apps/web/features/settings/components/MemoryExclusions.tsx:15`, `apps/web/features/settings/components/MemoryExclusions.tsx:101-126`)
9. **9. A daily job expires and consolidates.** The cron route checks its secret, sweeps expired rows in batches, and then merges duplicates and supersedes stale conflicts. (`vercel.json:106`, `apps/web/app/api/cron/expire-memories/route.ts:12-41`, `apps/web/lib/services/managed-memory-context-service.ts:884-920`, `apps/web/lib/services/managed-memory-context-service.ts:1054-1084`)
10. **10. Import and export.** Import previews text, then commits items through the eligibility gate and an import-key insert that skips repeats. Export downloads the user's memories as JSON, with a cap. (`apps/web/app/api/memory/import/route.ts:29-70`, `apps/web/lib/memory/import-store.ts:33-68`, `apps/web/app/api/memory/export/route.ts:58-95`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/services/managed-memory-context-service.ts` | Core of memory: policy reads, scope, load and rank, write admission, duplicate merge, supersede, expiry sweep, consolidation, provenance. |
| `apps/web/lib/services/turn-context-service.ts` | Builds the per-turn context: loads memory and past chats, applies suppressed sources and project scope, returns the prompt block and citations. |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | The chat server path: decides whether memory is on for a turn, injects memory, learns new facts after the reply, and records citations. |
| `apps/web/lib/services/memory-commands.ts` | Explicit remember and forget: ports, scope, outcomes and the turn note sent back to the model. |
| `apps/web/features/chat/hooks/use-explicit-memory-commands.ts` | Web client hook that sends remember or forget commands, shows receipts, and asks confirmation before a multi-match forget. |
| `apps/web/app/api/memory/route.ts` | List, create and delete-all memory endpoints. |
| `apps/web/app/api/memory/[id]/route.ts` | Update (pin, text, expiry), delete (tombstone) and read for one memory. |
| `packages/contracts/context/src/memory-content-policy.ts` | Prohibited (credential, payment) and sensitive-topic rules applied before any memory is stored. |
| `packages/ai/agent-core/src/memory.ts` | Shared candidate-fact extraction from a message and shared relevance scoring, used by web and mobile. |
| `apps/web/features/settings/components/MemoryExclusions.tsx` | Settings controls for suppressed sources and the never-remember term list. |
| `apps/web/app/api/cron/expire-memories/route.ts` | Daily job entry point: expiry sweep then consolidation, guarded by the cron secret. |
| `apps/web/lib/services/managed-auto-memory-service.ts` | Persists candidate facts after a turn, skipping Google-user-data turns and attaching project and conversation provenance. |

## What is stored

- Saved memories: content, category, source, pinned flag, expiry, superseded_by, is_deleted, import key, project id, workspace id, source conversation and turn, timestamps. Deleted or expired rows keep a tombstone with content blanked.: Postgres table user_memories (apps/web/lib/services/managed-memory-context-service.ts:391-392, 742-800; apps/web/app/api/memory/route.ts:42-90).
- Import dedupe key per user, source and workspace.: user_memories.import_key (apps/web/lib/memory/import-store.ts:33-68).
- Memory capability switches (memory, generateFromHistory, searchPastChats, allowToolAssistedGeneration, includeSensitiveTopics).: user_settings.settings JSON under 'capabilities' (apps/web/lib/services/managed-memory-context-service.ts:258-281).
- Suppressed sources and never-remember terms.: user_settings.settings JSON under 'memory' (excludedTerms, suppressedSources) (apps/web/lib/services/managed-memory-context-service.ts:299-351; apps/web/features/settings/components/MemoryExclusions.tsx:15).
- Whether a project uses global memory.: user_projects.uses_global_memory (apps/web/lib/services/managed-memory-context-service.ts:1264-1279).
- Memory citations for a reply.: Stored with the assistant turn (apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts; memory citation fields in request-processor.ts:6888-6889).
- Composer writing-style choice (formal, casual, concise, detailed).: Device storage under key agi-composer-writing-style (packages/ui/unified-chat/src/lib/writingStyle.ts:27-30).
- Full memory export (memories section of account export; memory export file).: Generated on request; not stored (apps/web/app/api/user/export/route.ts:2935-2952; apps/web/app/api/memory/export/route.ts:58-95).
- Mobile, CLI and VS Code local copies of memory.: Mobile local store (apps/mobile/src/features/memory/store.ts:1-12); CLI cache cloud/memory.json (apps/cli/src/cloud/memory.rs:1-7); VS Code legacy store key agiWorkforce.memoryFacts, read only (apps/extension-vscode/src/memory/memoryStore.ts:6-10). Their exact storage was not read in full.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Account memory master switch (capabilities.memory)**: Off means no memory is read or learned for the account; the policy returns disabled. (apps/web/lib/services/managed-memory-context-service.ts:258-281; UI at apps/web/features/settings/sections/MemorySection.tsx:323)
- **Generate from history (capabilities.generateFromHistory)**: Off stops automatic learning from chats; reading saved memories still works. (apps/web/lib/services/managed-memory-context-service.ts:267-270; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2392-2404)
- **Search past chats (capabilities.searchPastChats)**: Gates past-chat recall, and the recent-chats source for scheduled runs. (apps/web/lib/services/turn-context-service.ts:129; apps/web/features/settings/sections/MemorySection.tsx:412-414; packages/contracts/cloud-contracts/src/schedules.ts:92-98)
- **Tool-assisted generation (capabilities.allowToolAssistedGeneration)**: Stored and shown in settings; the read of this flag in the chat path was not established. (apps/web/lib/services/managed-memory-context-service.ts:277; apps/web/features/settings/sections/MemorySection.tsx:437-439)
- **Include sensitive topics (capabilities.includeSensitiveTopics)**: Lets sensitive-topic memories be stored unless the person asked for them directly. (apps/web/lib/services/managed-memory-context-service.ts:279, 627)
- **Organization memory policy (allowMemory)**: Workspace off disables memory for all its members, both read and write. (apps/web/lib/services/managed-memory-context-service.ts:115-160, 697-720; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4141)
- **Per-chat memory override (memory_enabled) and personalization switch (personalization)**: False skips memory reads and writes for the turn; personalization false sets memory_enabled to false. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:711-713, 1139-1141, 2338, 3523)
- **Temporary chat**: Blocks learning and recall for that chat; forget is still allowed. (apps/web/app/api/memory/commands/route.ts:44-50; apps/web/lib/server/persist-free-offering-user.ts:24-34; apps/web/lib/services/past-chat-context-service.ts:256, 345, 523)
- **Suppressed sources and never-remember terms (settings.memory)**: Suppressed sources are not read; listed terms are refused on write. (apps/web/lib/services/managed-memory-context-service.ts:283-315, 317-351; apps/web/lib/services/memory-write-service.ts:34-50)
- **Project uses global memory**: When off, a project reads only its own memories. (apps/web/lib/services/managed-memory-context-service.ts:1264-1279, 366-388)
- **Daily expiry and consolidation job**: Runs at 03:05 UTC each day; if it is not configured or the secret is wrong it does not run (401). (vercel.json:106; apps/web/app/api/cron/expire-memories/route.ts:5, 12-41)
- **Memory sweep limits**: Batch size 500, at most 200 batches, 240 second budget per run. (apps/web/lib/services/managed-memory-context-service.ts:884-890)
- **Injection and candidate limits**: 500 candidates read, 30 injected, 1,000 characters each, 8,000 total, 5 new candidates per turn, 3,650 days max expiry. (apps/web/lib/services/managed-memory-context-service.ts:67-72, 409)

## Shared between apps

Shared across apps: packages/ai/agent-core/src/memory.ts (candidate extraction, relevance scoring and key normalization, used by web and mobile); packages/contracts/context (content policy and context source classes); packages/contracts types (parseManagedMemoryCommandResponse, used by the web hook); packages/platform/context-engine (context types); packages/ui/unified-chat (writing style choice, shared by web and other surfaces). Separate per app: the memory settings screens and local stores (web components; apps/mobile/app/(app)/settings/memory.tsx and apps/mobile/src/features/memory/store.ts; apps/extension/src/background.ts bridge; apps/extension-vscode/src/memory/*; apps/cli/src/cloud/memory.rs; desktop settings sync). The server-side memory tables and routes are one copy for all apps.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief points the explicit remember handler at WebChatPage.tsx:2110, but that line is the model-restore effect for an opened chat. The real call to the hook is at line 2630. (apps/web/features/chat/pages/WebChatPage.tsx:2110 and :2630)
- The brief points the candidate extraction at request-processor.ts:1278, and the ranking, retrieval and attribution items at :1419, :2904, :3157 and the scope at :1198 and :1201. Those lines are clarify-tool offers, product-comparison card, schedule tool, a context-policy restart helper and a body-size helper. The real memory code is at request-processor.ts:2392-2417, 4342-4344, 4470-4482 and 6761-6889. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1198, 1278, 1419, 2904, 3157)
- The brief points the temporary-chat exclusion in search at search/route.ts:256, which is the query-parameter parsing. The real filters are at lines 324 and 375. (apps/web/app/api/search/route.ts:256, 324, 375)
- The brief cites vercel.json:69 and :90 for the expiry cron. The expire-memories entry is at vercel.json:106; line 69 and 90 belong to other jobs. (vercel.json:69, :90, :106)
- The daily-brief item says plans and time-sensitive items are assembled. The code read builds scheduled-run context from project, memory, web and recent chats (last 24 hours) only. No plan or time-sensitive source was found. (packages/contracts/cloud-contracts/src/schedules.ts:92-98; apps/web/lib/services/past-chat-context-service.ts:38, 555)
- The agent-specific memory is not built, but the write path already accepts an agent id and records it in provenance, with no store reading it. This is a half-built hook. (apps/web/lib/services/managed-memory-context-service.ts:476-505, 1343-1376)
- A memory 'removed on schedule' is a soft delete (tombstone row with blanked content), not a row removal. The brief's wording suggests removal. (apps/web/lib/services/managed-memory-context-service.ts:391-392, 884-920)
- The writing-style item: the only writing-style code is a four-option composer tone stored on the device. It is not a generated profile, so the 'platform missing' status is right but the name is easy to confuse. (packages/ui/unified-chat/src/lib/writingStyle.ts:1-30)

## Not established

- This was a read-only review. No tests, builds, installs or servers were run, so nothing was verified on localhost; claims are from reading the code only.
- Whether any plan (Free, paid, Max etc.) gates memory. No plan check was found in the memory service, the memory routes or the chat memory path, but the plan code was not read.
- Whether capabilities.allowToolAssistedGeneration is read anywhere in the chat path (only the settings UI and the policy read were seen).
- The exact body of the recap gate (isReflectMemoryEnabled) and the mobile recap screen were not read in full.
- Per-app behaviour in desktop, mobile, CLI, VS Code and the Chrome extension beyond the file names and the lines listed. The brief gives only 'platform' status for these items.
- The explicit forget confirmation dialog's text was read from the hook; the rendering of the dialog and the memory list UI were not read.
- Whether the import preview and the past-chat recall UI draw on the same exclusions in every path; only the main paths were followed.
- Whether memories created from a remember command get an expiry; the parse of expiry in the command path was not read.
