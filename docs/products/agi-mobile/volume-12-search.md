# AGI Mobile — Volume 12 — Search

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`; `apps/mobile/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; `apps/mobile/lib/v1FeatureFlags.ts`; `apps/mobile/stores/chat/chatViewStore.ts`; `apps/mobile/src/features/sidebar/components/SearchBar.tsx`; `apps/mobile/src/features/sidebar/components/ConversationList.tsx`; `apps/mobile/src/features/drawer/components/DrawerContent.tsx`; `apps/mobile/src/features/memory/services/memory.ts`; `apps/mobile/stores/chat/chatExecutionStore.ts`; `apps/mobile/src/features/chat/utils/toolCallAccumulator.ts`; `apps/web/app/api/search/route.ts`; `apps/web/app/api/memory/search/route.ts`; `packages/types/src/models.json`.

## Overview & stance

Search on AGI Mobile spans two trust modes — **Local** (on-device LLM, free) and **Managed Cloud** (public alpha, open by default to a signed-in user). **Mobile has no BYOK**; nothing in this volume exposes a provider-key affordance, and "search providers" never means external API keys.

The governing rule is the **trust boundary**: a search must run where the data lives and never cross modes implicitly. Local-mode search reads only the on-device message store; Managed-Cloud search hits Neon-backed server endpoints over the Clerk-authenticated, guarded fetch path. `apps/mobile/stores/chat/chatViewStore.ts` is the canonical example — it branches on `appMode` and documents that "a Local-mode call could never leak." Web Search (internet retrieval) is a distinct, cloud-only capability: it is a server-injected tool, not a data-store query, and stays off in Local mode. All result counts, snippets, and providers must be real; mobile is never the first heavy on-device indexing surface, so anything requiring a local full-text index over files is 🔭 Planned, not faked.

## Global Search

A single drawer search box queries both conversations and projects in the active mode, debounced, with a clear affordance.

- ✅ Built — `apps/mobile/src/features/drawer/components/DrawerContent.tsx` renders a `SearchBox` (accessibility label "Search chats and projects") whose `searchQuery` drives `useChatViewStore.searchConversations` and filters `displayedProjects` by name. Conversations match on title **or** content-match IDs from `chatViewStore.searchResults`.
- Requirement: one query string fans out to conversation search and project name filter; results respect the current `appMode` (Local vs Cloud) and never mix modes.
- Requirement: empty/whitespace query resets to the unfiltered list; a clear button (`drawer-search-clear` testID) wipes state.
- 🔭 Planned — a unified results surface that also spans memory, artifacts, and uploaded files in one ranked list. Today each domain is searched in its own surface.

## Conversation Search

Mode-aware search over chat threads: title plus message content, with highlighted snippets.

- ✅ Built — `apps/mobile/stores/chat/chatViewStore.ts` implements `searchConversations` with a debounce timer, `buildSnippet` (30-char context window + match offsets), and a documented trust split: Local mode runs an **in-memory search over the on-device message store only** (no network call); Cloud mode (signed in) calls the server full-text search `GET /api/search` (`apps/web/app/api/search/route.ts`, returning `session`/`message` rows). Any cloud failure falls back to local in-memory search so search never dead-ends.
- ✅ Built — `apps/mobile/src/features/sidebar/components/ConversationList.tsx` renders a flat results list with `snippet` per `{ conversationId, messageId }`, a result count, and a "No results for …" empty state; `SearchBar.tsx` provides the input.
- Requirement: Local-mode conversation search MUST NOT issue any network request; the guarded fetch path (`services/api.ts`/`secureFetch.ts`) is the only egress and is reserved for Cloud mode.
- Requirement: snippets and counts reflect real matches; never display a fabricated total.

## Project Search

Filter projects by name in the active mode; deeper project-content search is planned.

- 🟡 Partial — `apps/mobile/src/features/drawer/components/DrawerContent.tsx` filters `displayedProjects` by `name.toLowerCase().includes(query)` against the local store (`src/features/projects/store.ts`) in Local mode and `useCloudProjectStore` in Cloud mode (excluding tombstoned/archived). Gap: name-only, capped at 6 results, no search over project instructions, files, or contained conversations.
- 🔭 Planned — full project search (description, attached files, member chats) and a dedicated project-search results screen.
- Requirement: project search results are mode-scoped — Cloud projects come from the synced `cloudProjectStore`; Local projects never appear in a Cloud query and vice versa.

## File Search — uploaded files

Search across files attached to chats/projects.

- 🔭 Planned — there is no file/attachment search index on mobile today (no `searchFiles` path exists under `apps/mobile/src/features`). `apps/mobile/services/docParser.ts` extracts text from documents for chat context, but does not build a searchable index.
- Requirement (target): uploaded-file search is **cloud-backed** — files attached to Managed-Cloud chats/projects are indexed server-side and queried over the guarded fetch path; Local-mode file search, if added, indexes on-device only and never uploads. Mobile must not become the first heavy local DOCX/PPTX/PDF indexing surface.
- Requirement: results must cite the owning conversation/project and respect deletion/tombstone state.

## Memory Search

Search the user's saved memory entries.

- 🟡 Partial — `apps/mobile/src/features/memory/services/memory.ts` exposes `searchMemories(query)` → `GET /api/memory/search?q=…` (`apps/web/app/api/memory/search/route.ts`); the memory store lives at `src/features/memory/store.ts` / `stores/memory/cloudMemoryStore.ts`. Gap: this is the **Cloud** (synced) memory path; a Local-mode on-device memory search surface and a search UI wired into the memory screen are not yet shipped.
- Requirement: memory search obeys the trust boundary — Cloud memory search only when signed in and in Cloud mode; Local memory (if surfaced) stays on-device with no network call.
- Requirement: query is URL-encoded; empty result returns an explicit empty state, never a stale list.

## Web Search — internet search integration

Live internet retrieval folded into the chat stream — cloud-only, opt-in.

- ✅ Built — `FEATURES.webSearch` is enabled in `apps/mobile/lib/v1FeatureFlags.ts`. The `AddToChatSheet` toggle ("Web search") sets the feature; `apps/mobile/stores/chat/chatExecutionStore.ts` adds `web_search: true` to the chat-completions body when the toggle is on, the server injects its built-in `web_search` tool, and `apps/mobile/src/features/chat/utils/toolCallAccumulator.ts` folds streamed `x_search_results` deltas into rendered tool-call UI.
- Requirement: Web Search is **Managed-Cloud only**. It must stay off in Local mode (`remoteChatGate` fails closed when Cloud is disabled); the on-device model does not get silent internet access.
- Requirement: the toggle is user-driven and gated by `FEATURES.webSearch`; results render as inline tool-call cards, not as fabricated citations.
- 🔭 Planned — per-source attributions, domain controls, and a standalone web-search results pane.

## Repository map

- `apps/mobile/stores/chat/chatViewStore.ts` — mode-aware conversation search, snippet builder, trust split.
- `apps/mobile/src/features/sidebar/components/SearchBar.tsx`, `ConversationList.tsx` — search input + results list.
- `apps/mobile/src/features/drawer/components/DrawerContent.tsx` — global search box (chats + projects).
- `apps/mobile/src/features/memory/services/memory.ts`, `src/features/memory/store.ts`, `stores/memory/cloudMemoryStore.ts` — memory search/store.
- `apps/mobile/src/features/projects/store.ts`, `stores/projects/cloudProjectStore.ts` — project sources for filtering.
- `apps/mobile/stores/chat/chatExecutionStore.ts`, `src/features/chat/utils/toolCallAccumulator.ts`, `src/features/chat/components/AddToChatSheet.tsx`, `lib/v1FeatureFlags.ts` — web-search toggle + stream handling.
- `apps/mobile/services/api.ts`, `secureFetch.ts`, `remoteChatGate.ts` — guarded egress + Cloud gate.
- Server: `apps/web/app/api/search/route.ts`, `apps/web/app/api/memory/search/route.ts` (Neon-backed, Clerk-authenticated).

## Competitor notes

ChatGPT and Claude mobile offer conversation search and (ChatGPT) web search/browsing as cloud-only features against a single account store. AGI's deliberate divergence:

- **Per-surface trust** — Local-mode search is genuinely on-device with zero egress; competitors have no local search tier.
- **Multi-provider Cloud** — Managed-Cloud search/results span whatever model the user selected from `packages/types/src/models.json`; AGI never hardcodes a vendor.
- **No BYOK on mobile** — unlike Desktop/CLI/VS Code, mobile search never touches user provider keys; web search is the server's injected tool, not a user-key call.
- **Explicit data boundary** — Local chats/memory/projects are searchable locally and are not silently synced or searched in the cloud.

## Acceptance / Definition of Done

The domain is production-ready when Local and Cloud search are provably isolated, every result is real, and web search stays cloud-gated.

- [ ] Build: conversation search (title + content), global drawer search, and the web-search toggle work in both modes; empty/clear states verified; no hardcoded model IDs.
- [ ] Trust: Local-mode search issues zero network calls (verify via guarded fetch logs); Cloud search only when signed in + Cloud mode; web search disabled in Local; `remoteChatGate` fails closed.
- [ ] Security: query strings are URL-encoded; server search enforces per-user scoping; no Local data appears in any cloud search response.

## Anti-patterns

- Adding any BYOK / API-key field to mobile search or web search.
- Auto-routing a Local-mode search to a server endpoint (silent Local→Cloud leak).
- Faking result counts, snippets, citations, or a not-yet-built file-search index.
- Hardcoding a model ID instead of reading `packages/types/src/models.json`.
- Enabling web search in Local mode or when Cloud is gated off.
- Referencing Supabase or any retired tier ("Plus", `pro_plus`, "Hobby"); the stack is Clerk + Neon + Stripe.
- Making mobile the first heavy local PDF/DOCX/PPTX indexing surface.
