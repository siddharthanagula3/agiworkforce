---
id: "AREA-039"
type: "area"
title: "Memory product"
features: ["F039-01", "F039-02", "F039-03", "F039-04", "F039-05", "F039-06", "F039-07", "F039-08", "F039-09", "F039-10", "F039-11", "F039-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 39. Memory product

Memory lets the assistant keep useful facts about the person (preferences, work, background) and use them in later chats, so the person does not repeat themselves. The person can see what is saved, change or delete it, pin important items, turn it off, and keep work and project facts apart from personal ones. It matters because a remembered fact that is wrong or hidden is worse than none, so the area is built around visibility and control.

**Who uses it.** Every signed-in user of the web, desktop, mobile, CLI, VS Code and Chrome apps, as far as the code shows the memory API and screens are not limited to one plan (plan gating was not confirmed; see not_sure). Organization admins control whether memory is allowed for their workspace, via the organization policy row read in managed-memory-context-service.ts. Developers use the same API (the brief lists "api" status for some items). Mobile also has a separate on-device memory store that works without the cloud.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F039-01](F039-01-turn-memory-on-or-off.md) | Turn Memory on or off | partly | partly | partly | partly | partly | no |
| [F039-02](F039-02-automatic-saving-after-chats.md) | Automatic saving after chats | built | built | built | built | built | built |
| [F039-03](F039-03-add-a-memory-by-hand-or-by-asking.md) | Add a memory by hand or by asking | built | built | built | built | built | built |
| [F039-04](F039-04-review-the-saved-memory-list.md) | Review the Saved Memory list | built | built | built | partly | built | partly |
| [F039-05](F039-05-edit-delete-and-reset-memory.md) | Edit, delete and reset memory | built | built | built | partly | built | partly |
| [F039-06](F039-06-pin-correct-stale-facts-and-settle-conflicts.md) | Pin, correct stale facts and settle conflicts | built | built | built | partly | no | no |
| [F039-07](F039-07-summaries-of-what-the-assistant-knows.md) | Summaries of what the assistant knows | partly | partly | partly | no | no | no |
| [F039-08](F039-08-project-scoped-and-agent-scoped-memory.md) | Project-scoped and agent-scoped memory | partly | partly | partly | partly | no | no |
| [F039-09](F039-09-work-and-organization-knowledge-kept-apart.md) | Work and organization knowledge kept apart | built | built | built | built | built | built |
| [F039-10](F039-10-import-and-export-memories.md) | Import and export memories | built | built | built | built | no | no |
| [F039-11](F039-11-capacity-display.md) | Capacity display | no | no | no | built | no | no |
| [F039-12](F039-12-privacy-rules-temporary-chats-and-where-memory-app.md) | Privacy rules, temporary chats and where memory applies | built | built | partly | partly | partly | partly |

Requirement items for this area: [10-requirements/capabilities/039-memory-product.md](../../10-requirements/capabilities/039-memory-product.md).

## How this area works in the code

1. **Person changes a setting or memory on screen.** The settings section renders the Memory switch, the delete-all control and the confirm dialog. Delete-all uses a confirm dialog that states how many facts will go. (`apps/web/features/settings/sections/MemorySection.tsx:181`, `apps/web/features/settings/sections/MemorySection.tsx:208`)
2. **Client store calls the memory API.** The shared memory store fetches a CSRF token first, then calls the /api/memory endpoints with the request signal so stale calls can be cancelled. (`packages/ui/unified-chat/src/stores/memoryStore.ts:94`, `packages/ui/unified-chat/src/stores/memoryStore.ts:114`, `packages/ui/unified-chat/src/stores/memoryStore.ts:144`)
3. **API reads or writes the user's memories.** GET lists memories with paging, pinned first. POST creates a memory after CSRF and rate-limit checks. DELETE soft-deletes all memories in the current workspace. (`apps/web/app/api/memory/route.ts:41`, `apps/web/app/api/memory/route.ts:59`, `apps/web/app/api/memory/route.ts:107`, `apps/web/app/api/memory/route.ts:192`, `apps/web/app/api/memory/route.ts:203`)
4. **Never-remember check before a save.** The write is refused if the text contains a term from the person's exclusion list. The exclusion list is read from the user settings row; if that read fails, the write is refused. (`apps/web/lib/services/memory-write-service.ts:44`, `apps/web/lib/services/memory-write-service.ts:35`, `apps/web/lib/services/managed-memory-context-service.ts:299`, `apps/web/lib/services/managed-memory-context-service.ts:353`)
5. **Chat turn decides whether memory is on.** A chat turn gets no memory tool and no memory context when memory is off, the chat is temporary, or the person turned personalization off. Memory is also limited by the organization policy row. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1136`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3523`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5540`, `apps/web/lib/services/managed-memory-context-service.ts:200`)
6. **Relevant memories are loaded into the prompt.** Up to 500 candidates are read, at most 30 are used, each is capped at 1,000 characters and the total at 8,000 characters. The memories are fenced as untrusted text before going to the model. (`apps/web/lib/services/managed-memory-context-service.ts:67`, `apps/web/lib/services/managed-memory-context-service.ts:1184`, `apps/web/lib/services/managed-memory-context-service.ts:1242`, `apps/web/lib/services/managed-memory-context-service.ts:1284`)
7. **Automatic facts after the turn.** After a completed turn, facts are extracted (pattern-based, or model-based after the response). Turns with Google user data, or with a tool run where the rule forbids it, save nothing. Project chats save to their project. At most 5 facts per turn are written. (`apps/web/lib/services/managed-auto-memory-service.ts:145`, `apps/web/lib/services/managed-auto-memory-service.ts:107`, `apps/web/lib/services/managed-auto-memory-service.ts:113`, `apps/web/lib/services/managed-memory-context-service.ts:1343`, `apps/web/lib/services/managed-memory-context-service.ts:1401`)
8. **Stored as rows in the account database.** Memories are rows in the user_memories table. Reads filter out deleted, superseded and expired rows, and filter by workspace. A delete blanks the content and keeps the row so other devices learn of the deletion. (`apps/web/app/api/memory/route.ts:59`, `apps/web/app/api/memory/route.ts:74`, `apps/web/app/api/memory/route.ts:203`, `apps/web/lib/services/managed-memory-context-service.ts:375`)
9. **Conflicts are listed from superseded rows.** A memory replaced by a newer one keeps a pointer to the winner. The conflicts endpoint joins the two and returns up to 50. (`apps/web/app/api/memory/conflicts/route.ts:35`, `apps/web/app/api/memory/conflicts/route.ts:47`)
10. **Mobile writes to on-device storage first.** The mobile writer refuses prohibited categories, refuses sensitive topics for learned facts unless opted in, drops duplicates, and supersedes rival facts on the same topic. It stores into the on-device memory storage. (`apps/mobile/src/features/memory/services/localMemoryWriter.ts:17`, `apps/mobile/src/features/memory/services/localMemoryWriter.ts:1`)
11. **CLI keeps its own settings file.** The CLI writes memory settings (automatic memory on or off, decay days, maximum facts) to a JSON file under the user's home folder. (`apps/cli/src/memory_pipeline.rs:108`, `apps/cli/src/memory_pipeline.rs:115`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/memory/route.ts` | Memory list, create and delete-all endpoints; the main web and API entry point. |
| `apps/web/lib/services/managed-memory-context-service.ts` | Core memory logic: exclusions, active/expired/workspace filters, limits, writes, and the memory context sent to the model. |
| `apps/web/lib/services/managed-auto-memory-service.ts` | Saves facts after each completed chat turn, with Google-data and project rules. |
| `apps/web/lib/services/memory-write-service.ts` | Refuses a memory write that contains a never-remember term; fails closed if the list cannot be read. |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Decides per chat turn whether the memory tool and memory context are offered (memory off, temporary chat, personalization off). |
| `apps/web/features/settings/sections/MemorySection.tsx` | Web settings screen for the Memory switch, delete-all and export/import entry points. |
| `packages/ui/unified-chat/src/stores/memoryStore.ts` | Shared client store for memory calls, used by web and desktop surfaces. |
| `apps/web/app/api/memory/conflicts/route.ts` | Lists memories replaced by newer ones, for the conflicts screen. |
| `apps/mobile/src/features/memory/services/localMemoryWriter.ts` | Mobile on-device write rules: prohibited categories, sensitive topics, duplicates and conflict supersession. |
| `apps/cli/src/memory_pipeline.rs` | CLI memory settings file: automatic memory, decay days and maximum facts. |

## What is stored

- Saved memories: text, category, source, pinned flag, expiry, project id, workspace (organization) id, source conversation, deleted flag, superseded-by pointer, import key: Account database table user_memories (apps/web/app/api/memory/route.ts:59-77; managed-memory-context-service.ts DELETED_MEMORY_ASSIGNMENTS used at route.ts:204)
- Never-remember terms (excludedTerms) and suppressed memory sources: Account database table user_settings, JSON column settings, key memory (apps/web/lib/services/managed-memory-context-service.ts:299-318)
- Organization policy allowing memory for a workspace: Account database table organization_admin_policies, column allow_memory (apps/web/lib/services/managed-memory-context-service.ts:200-216)
- Mobile saved facts on the device: On-device storage through the mobile memory storage module (apps/mobile/src/features/memory/services/localMemoryWriter.ts:2 imports it; the storage file itself was not opened)
- CLI memory settings: automatic memory, decay days, maximum facts: JSON file under the user's home folder (apps/cli/src/memory_pipeline.rs:108-120)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Memory switch (memory_enabled request field)**: Off: no memory tool offered and no memory context sent for that turn. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:712, 1140, 2338)
- **Personalization off**: Sets memory_enabled to false for the turn. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3523)
- **Organization allow_memory**: Workspace-level control; when false, memory and past-chat sources are closed. (apps/web/lib/services/managed-memory-context-service.ts:200-216)
- **Project uses global memory**: Project draws only on its own memories when false. (apps/web/lib/services/managed-memory-context-service.ts (MemoryScope type, just above activeMemoryPredicate))
- **AGI_MODEL_MEMORY_EXTRACTION**: Enables model-based fact extraction after the turn (also gated on source text and zero-retention). (Read in apps/web/lib/services/managed-auto-memory-service.ts:34-44 via isModelMemoryExtractionEnabled (definition in model-memory-extraction.ts, not opened))
- **Never-remember terms**: Writes containing a listed term are refused (minimum 3 characters, maximum 50 terms). (apps/web/lib/services/managed-memory-context-service.ts:283-318)
- **Memory limits**: Candidate, memory count, per-memory and total character caps; 5 auto facts per turn; 10-year maximum expiry. (apps/web/lib/services/managed-memory-context-service.ts:67-72, 409)
- **CLI MEMORY_ENABLED**: CLI memory flag; exact effect not confirmed. (apps/cli/src/cli_options.rs:253-260)

## Shared between apps

Shared: packages/ui/unified-chat (memoryStore.ts and MemoryEditor.tsx) used by web and desktop; server logic in apps/web/lib/services (used by web API and Chrome chats through the API); shared types from @agiworkforce/types (apps/web/app/api/memory/route.ts:9-15); mobile imports shared helpers from @agiworkforce/agent-core and @agiworkforce/context (apps/mobile/src/features/memory/services/localMemoryWriter.ts:2-9). Separate per app: mobile on-device store and consolidation (apps/mobile/src/features/memory); CLI memory in Rust (apps/cli/src/memory.rs, apps/cli/src/cloud/memory.rs); VS Code memory (apps/extension-vscode/src/memory); Chrome extension side panel (apps/extension/src/side_panel.ts, which contains memory code).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Never-remember matching is a plain lowercase substring test with a 3-character minimum, with no word boundary. A short term matches inside other words (for example a 3-letter term inside a longer word), so an unrelated memory can be refused. (apps/web/lib/services/managed-memory-context-service.ts:353-360 (matchedMemoryExclusion), :70 (MIN_MEMORY_EXCLUSION_LENGTH is at :284 area))
- Mobile's sensitive-topic check runs only for facts with source 'learned'. A fact the person types as a memory is not checked for sensitive topics (only prohibited categories are checked), which is looser than the server path. (apps/mobile/src/features/memory/services/localMemoryWriter.ts (writeLocalMemoryFact, the refusedTopic check))
- Brief says Chrome is missing for the Memory switch and the saved-memory search, but the Chrome side panel contains memory code (about 97 memory references in apps/extension/src/side_panel.ts). The brief status and the code disagree; not verified in the UI. (apps/extension/src/side_panel.ts (memory references); brief item S39.02 and S39.05)
- The memory list route uses the same rate-limit bucket as chat conversations ('chat-conversation'). (apps/web/app/api/memory/route.ts:42, 111, 196, 111 (all memory handlers))
- Four items the brief lists as missing (onboarding, profile summary, preference summary, agent-specific memory) have no matching code in apps/web, apps/mobile, apps/cli, apps/extension-vscode or packages/ui/unified-chat (searched by term, non-test files). Confirmed as missing by search, not by reading every file. (Searched across apps/web, apps/mobile/src, apps/mobile/app, apps/cli/src, apps/extension-vscode/src, packages/ui/unified-chat/src)

## Not established

- Plan gating: whether Memory, past-chat reference, or auto-save are limited to paid plans was not established. The memory list route did not show a plan check.
- Whether the onboarding introduction is absent everywhere or only missing from the paths I searched (I searched by term in non-test files).
- Empty, loading and error states for the memory list, switches and conflicts screen were not verified in the components.
- The behaviour of the profile-summary and preference-summary items: nothing was found, so their Should cannot be checked.
- What the CLI MEMORY_ENABLED flag does exactly (only the flag name appeared in the search).
- Whether deleting chats wipes or keeps memory (S39.30): the chat-deletion path was not traced.
- Mobile memory storage module contents (imported from '@/storage/memory', not opened).
- Whether model-based extraction (AGI_MODEL_MEMORY_EXTRACTION) is on in production; model-memory-extraction.ts was not opened.
- Desktop and Chrome screens: only the brief's file references were consulted, not the components themselves.
- The Memory-used indication (S39.27) for desktop, mobile and CLI: brief says missing for mobile, CLI, VS Code, Chrome and API; desktop not listed. Not checked.
- No builds, tests or servers were run, as the task was read-only on the project folder. Nothing was edited or created in the project.
