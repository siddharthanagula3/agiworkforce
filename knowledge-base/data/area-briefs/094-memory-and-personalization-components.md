# Area 94. Memory and personalization components

22 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S94.01 Memory candidate extraction.
- Should: A component extracts candidate facts from ordinary turns for memory.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1278; packages/ai/agent-core/src/memory.ts:78; apps/web/lib/services/managed-memory-context-service.ts:1076

## S94.02 Explicit Memory write handler.
- Should: A handler performs explicit remember/forget commands and reports the result.
- Status: platform done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:2110; apps/web/features/chat/hooks/use-explicit-memory-commands.ts:51; apps/web/lib/services/memory-commands.ts:165

## S94.03 Memory topic store.
- Should: Memories are stored with a topic/category that later features can use.
- Status: platform done
- Code: apps/web/lib/services/managed-memory-context-service.ts:1076; apps/web/app/api/memory/route.ts:42

## S94.04 Memory provenance.
- Should: Each memory records where it came from (conversation, turn, writer).
- Status: platform done
- Code: apps/web/lib/services/managed-memory-context-service.ts:720; apps/web/lib/services/managed-memory-context-service.ts:413

## S94.05 Memory retrieval.
- Should: Saved memories are retrieved into the model context for a turn, scoped and filtered.
- Status: platform done
- Code: apps/web/lib/services/managed-memory-context-service.ts:873; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2904

## S94.06 Memory relevance ranking.
- Should: Retrieved memories are ranked by relevance to the current request.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1419; apps/web/lib/services/managed-memory-context-service.ts:1083

## S94.07 Duplicate-Memory merger.
- Should: Duplicate memories are merged instead of stored twice.
- Status: platform done
- Code: apps/web/lib/services/managed-memory-context-service.ts:681; apps/web/lib/services/managed-memory-context-service.ts:720; apps/web/lib/memory/import-store.ts:47

## S94.08 Contradiction/correction handling.
- Should: A newer contradicting fact supersedes the older memory.
- Status: platform done
- Code: apps/web/lib/services/managed-memory-context-service.ts:750; apps/web/lib/services/managed-memory-context-service.ts:720

## S94.09 Memory prioritization.
- Should: Pinned/important memories are preferred when context space is limited.
- Status: platform done
- Code: apps/web/lib/services/managed-memory-context-service.ts:873; apps/web/app/api/memory/[id]/route.ts:120

## S94.10 Memory expiry.
- Should: Memories with an expiry date stop being used and are removed on schedule.
- Status: platform done
- Code: apps/web/lib/services/managed-memory-context-service.ts:327; apps/web/lib/services/managed-memory-context-service.ts:788; apps/web/app/api/cron/expire-memories/route.ts:12; vercel.json:69

## S94.11 Memory deletion.
- Should: Deleting a memory removes it from every read path immediately.
- Status: platform done
- Code: apps/web/app/api/memory/[id]/route.ts:148; apps/web/lib/services/managed-memory-context-service.ts:327

## S94.12 Memory import/export.
- Should: Memories can be imported and exported in bulk.
- Status: platform done
- Code: apps/web/app/api/memory/import/route.ts:134; apps/web/app/api/user/export/route.ts:2096

## S94.13 Personal versus Project scope resolver.
- Should: A resolver decides whether personal, workspace or project memory applies to a turn.
- Status: platform done
- Code: apps/web/lib/services/managed-memory-context-service.ts:956; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1198; apps/web/lib/services/managed-memory-context-service.ts:335

## S94.14 Agent-specific Memory store.
- Should: A store keeps memory per agent, separate from personal memory.
- Status: platform missing

## S94.15 Background Memory maintenance.
- Should: Background jobs maintain memory (expiry, consolidation) without user action.
- Status: platform done
- Code: apps/web/app/api/cron/expire-memories/route.ts:29; apps/web/lib/services/managed-memory-context-service.ts:961; apps/web/lib/services/managed-memory-context-service.ts:838; apps/web/lib/services/managed-memory-context-service.ts:893; packages/ai/agent-core/src/memory.ts:566; vercel.json:90

## S94.16 Writing-style profile generator.
- Should: A component builds a profile of the user's writing style from their text.
- Status: platform missing

## S94.17 Personalization-source selection.
- Should: The user can choose which sources (chats, connectors, imports) personalization may draw on, and the choice is enforced.
- Status: platform done
- Code: apps/web/lib/services/managed-memory-context-service.ts:279; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1201; apps/web/features/settings/components/MemoryExclusions.tsx:312

## S94.18 Personalization attribution.
- Should: Replies record which memories or past chats shaped them, so the product can show attribution.
- Status: platform done
- Code: apps/web/lib/services/turn-context-service.ts:156; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3157; apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts:253; packages/platform/context-engine/src/types.ts:110

## S94.19 Sensitive-data exclusion rules.
- Should: Rules exclude credentials, special-category data and user-listed terms from memory.
- Status: platform done
- Code: apps/web/lib/services/managed-memory-context-service.ts:501; packages/contracts/context/src/memory-content-policy.ts:110; apps/web/lib/services/memory-write-service.ts:34

## S94.20 Temporary-conversation exclusions.
- Should: Temporary conversations are excluded from memory, past-chat recall, search and history.
- Status: platform done
- Code: apps/web/app/api/search/route.ts:256; apps/web/lib/services/retrieval-search-service.ts:234; apps/web/lib/server/persist-free-offering-user.ts:24

## S94.21 Personal recap generator.
- Should: A component generates a personal recap of the user's recent activity.
- Status: platform done
- Code: apps/web/lib/services/reflect-service.ts:245; apps/web/lib/services/reflect-service.ts:288; apps/web/lib/services/reflect-service.ts:263

## S94.22 Daily-brief context builder.
- Should: A component assembles context for a daily brief (plans, time-sensitive items, recent work).
- Status: platform done
- Code: packages/contracts/cloud-contracts/src/schedules.ts:96; packages/contracts/cloud-contracts/src/schedules.ts:760; apps/web/features/schedules/components/ScheduleAccessFields.tsx:47; apps/web/lib/services/scheduled-agent-executor.ts:395; apps/web/lib/services/scheduled-agent-executor.ts:449; apps/web/lib/services/past-chat-context-service.ts:593; apps/web/lib/services/past-chat-context-service.ts:621; packages/contracts/context/src/context-source.ts:225
