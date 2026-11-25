---
id: "AREA-034"
type: "area"
title: "Search experiences"
features: ["F034-01", "F034-02", "F034-03", "F034-04", "F034-05", "F034-06", "F034-07", "F034-08", "F034-09"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 34. Search experiences

This area covers every way a person finds things: searching old chats, projects, library files and artifacts, finding text inside one chat, and letting the assistant search the web or connected work apps. It also covers how answers show their sources (cards, citation hover previews, source lists) and what the person sees when a search finds nothing or fails. It matters because people trust an answer only if they can see where it came from, and because they need to get back to past work fast.

**Who uses it.** Every signed-in user can search their own chats, projects and library. Web search by the assistant is gated by the plan capability "canUseWebSearch" and by whether the chosen model or the service has a search route; the Free plan has a monthly cap of 20 search calls (search-budget.ts:36). Company-source (connector) search needs a plan that includes connectors, a released-connectors switch and a kill switch that is open. The "scheduled" search category needs workspace access. Developers can use the API with domain allow and deny lists. The CLI web search uses the user's own search key.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F034-01](F034-01-find-inside-the-open-chat.md) | Find inside the open chat | built | built | no | built | no | no |
| [F034-02](F034-02-global-search-dialog-and-chat-history-search.md) | Global search dialog and chat history search | built | built | partly | partly | partly | partly |
| [F034-03](F034-03-search-projects-library-and-artifacts.md) | Search Projects, Library and artifacts | built | built | built | no | partly | no |
| [F034-04](F034-04-assistant-searches-the-public-web.md) | Assistant searches the public web | built | built | built | partly | partly | partly |
| [F034-05](F034-05-search-connected-company-sources.md) | Search connected company sources | built | built | built | built | no | no |
| [F034-06](F034-06-project-knowledge-collections.md) | Project knowledge collections | built | built | built | built | built | n/a |
| [F034-07](F034-07-follow-up-questions-and-clarification-choices.md) | Follow-up questions and clarification choices | built | built | partly | partly | no | partly |
| [F034-08](F034-08-source-cards-citations-and-source-lists.md) | Source cards, citations and source lists | built | built | built | partly | partly | partly |
| [F034-09](F034-09-empty-and-unavailable-search-states.md) | Empty and unavailable search states | no | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/034-search-experiences.md](../../10-requirements/capabilities/034-search-experiences.md).

## How this area works in the code

1. **Person types or asks.** On the web app the Search dialog waits for 2 or more characters, then calls the search service with the query, category and filters. In chat, Cmd/Ctrl+F opens the in-chat find bar. In the composer, web search is switched on automatically if the model or service has a search route. (`apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:122`, `apps/web/features/chat/components/messages/ChatMessageList.tsx:1495`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1596`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1692`)
2. **In-chat find works on the loaded messages.** The list finds which message groups contain the text, scrolls to the row and shows a count. Nothing goes to the server. (`apps/web/features/chat/components/messages/ChatMessageList.tsx:1499`, `apps/web/features/chat/components/messages/ChatMessageList.tsx:1514`, `apps/web/features/chat/components/messages/MessageSearch.tsx:92`)
3. **Client service builds the request.** The service sends GET /api/search with q, limit, category, role, dates, includeArchived, and merges chat, project, file, schedule and indexed-document results into one list, dropping duplicate documents. (`apps/web/features/chat/services/global-search-service.ts:174`, `apps/web/features/chat/services/global-search-service.ts:211`)
4. **Server searches the user's own data.** The route applies a rate limit, opens a database handle scoped to the user and workspace, checks the data region, validates filters, then runs title, message, project, file and schedule text searches (case-insensitive 'contains') and an indexed document search in parallel. Recent, popular and suggestion lists come from database functions. (`apps/web/app/api/search/route.ts:204`, `apps/web/app/api/search/route.ts:258`, `apps/web/app/api/search/route.ts:392`)
5. **Search history is recorded.** After a normal search a 'track_search' call stores the query and result count; DELETE clears it. (`apps/web/app/api/search/route.ts:557`, `apps/web/app/api/search/route.ts:655`)
6. **Library search.** The shared Library view debounces typing and calls /api/library?q=; the server matches file name or prompt in media_assets. (`packages/ui/unified-chat/src/components/library/LibraryView.tsx:445`, `apps/web/app/api/library/route.ts:153`, `apps/web/lib/server/media-assets.ts:422`)
7. **Assistant web search in a chat turn.** The server decides whether search is required (explicit words or time-sensitive phrasing), offers the web_search tool or a model's built-in search, runs the call with the chosen provider, filters results by allowed and denied sites, and streams results and sources back. (`apps/web/lib/web-search/required-search.ts:129`, `apps/web/lib/web-search/web-search-tool.ts:56`, `apps/web/lib/web-search/web-search-tool.ts:458`, `apps/web/lib/web-search/web-search-providers.json:1`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2561`)
8. **Connector and project sources join the same turn.** The chat route checks connector release, plan and kill switch, loads the user's connector tool list and permissions, and loads project knowledge with passage retrieval from the search index. (`apps/web/lib/connectors/connector-capability.ts:44`, `apps/web/app/api/llm/v1/chat/completions/route.ts:763`, `apps/web/lib/services/project-knowledge-retrieval.ts:38`)
9. **Client shows sources and states.** The stream handler records tool activity and turns failure codes into plain sentences. The message bubble collects sources, pushes them to the sources panel store, and shows notices such as 'Web search didn't return results'. Citation chips show hover cards. Follow-up chips appear under the last reply. (`apps/web/lib/hooks/useChatStream.ts:3879`, `apps/web/features/chat/components/messages/MessageBubble.tsx:2506`, `apps/web/features/chat/components/messages/MessageBubble.tsx:3649`, `apps/web/features/chat/stores/research-panel-store.ts:49`, `apps/web/features/chat/components/research/ResearchPanel.tsx:197`, `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:99`)
10. **Other apps use their own path.** Mobile searches on the device and, for Cloud accounts, calls the same /api/search. CLI searches saved session files on disk and calls a search service with the user's own key. VS Code and the Chrome side panel have their own history search and source display. (`apps/mobile/stores/chat/chatViewStore.ts:223`, `apps/mobile/src/features/search/mobileGlobalSearch.ts:88`, `apps/cli/src/sessions.rs:919`, `apps/cli/src/features/exec/tools/web/mod.rs:390`, `apps/extension-vscode/src/features/trees/sessionPickers.ts:60`, `apps/extension/src/features/side-panel/sources.ts:136`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/search/route.ts` | Server endpoint for global search, recent, popular, suggestions, history write and clear. |
| `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx` | The Search window: categories, filters, history chips, results and empty/error states. |
| `apps/web/features/chat/services/global-search-service.ts` | Browser client that calls /api/search and merges the result kinds. |
| `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Hosts the in-chat find bar, the Cmd/Ctrl+F handler and the follow-up chips. |
| `apps/web/lib/web-search/web-search-tool.ts` | Defines and runs the web_search tool, limits, retry, domain filter and result shape. |
| `apps/web/lib/web-search/required-search.ts` | Decides when a turn must search the web (explicit words, fresh-facts phrasing). |
| `apps/web/lib/web-search/search-budget.ts` | Search cost and the Free plan monthly search cap. |
| `apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts` | Allow and deny site policy used by search and page fetch. |
| `apps/web/lib/connectors/connector-capability.ts` | Decides whether connector search tools are offered (release, plan, kill switch). |
| `apps/web/features/chat/components/research/ResearchPanel.tsx` | Sources side panel with Citations and More lists and the empty state. |
| `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Citation chip and hover card shared across surfaces. |
| `apps/mobile/src/features/search/mobileGlobalSearch.ts` | Mobile on-device grouped search over chats, projects, files, library images and artifacts. |
| `apps/cli/src/sessions.rs` | CLI session search over saved sessions on disk. |

## What is stored

- Search history (query, result count, time) per user and workspace, read through get_recent_searches, get_popular_searches and get_search_suggestions, written by track_search, cleared by clear_search_history. Table behind them not seen.: Database functions called in apps/web/app/api/search/route.ts:168-203, 557, 655
- Chats and messages searched (web_conversations, web_messages), projects (user_projects), library files (media_assets), scheduled tasks (scheduled_tasks): apps/web/app/api/search/route.ts:392-470
- Search index of documents (conversations, artifacts, developer sessions, project knowledge): Built through createPostgresSearchProvider; table not opened (apps/web/lib/services/retrieval-search-service)
- Follow-up suggestions cached on the last message metadata: apps/web/features/chat/components/messages/ChatMessageList.tsx:1476
- Sources shown in the sources panel (in memory only): apps/web/features/chat/stores/research-panel-store.ts:49
- Mobile: chats and messages held on the phone (device storage), searched in place: apps/mobile/stores/chat/chatViewStore.ts:278
- CLI: saved session files in the user's session folder; saved search key in the CLI auth store: apps/cli/src/sessions.rs:919; apps/cli/src/features/exec/tools/web/mod.rs:337
- Chrome extension conversation history searched locally: apps/extension/src/features/background/conversation-history.ts:1611

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **canUseWebSearch (plan capability)**: Without it the composer turns web search off. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1599)
- **generic_web_search (billing feature flag)**: Says a service-wide search backend exists; needed for Auto model and models without built-in search. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1596)
- **Provider key env named in the provider list (apiKeyEnv)**: If the key is not set, the search provider counts as not configured. (apps/web/lib/web-search/web-search-providers.json:1; apps/web/lib/web-search/web-search-tool.ts:270)
- **AGI_NATIVE_SEARCH_MAX_USES**: Overrides how many built-in model searches one turn may use (default 3, 20 for research, range 1 to 50). (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2554)
- **FREE_PLAN_MONTHLY_SEARCH_CALLS = 20 over 30 days**: Caps Free plan web searches. (apps/web/lib/web-search/search-budget.ts:36)
- **followUpSuggestionsEnabled (user setting)**: Turns follow-up chips on or off. (apps/web/features/chat/components/messages/ChatMessageList.tsx:1465)
- **FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT = false**: Follow-ups show only after a turn that searched, unless a caller enables them. (apps/web/features/chat/components/messages/ChatMessageList.tsx:1104)
- **Connectors released, plan includes connectors, canUseConnectors kill switch**: Any false means no connector search tools in chat. (apps/web/lib/connectors/connector-capability.ts:44)
- **Workspace access gate for the Scheduled category**: Blocks searching scheduled tasks without access. (apps/web/app/api/search/route.ts:231)
- **Data-region check**: Search is refused if the workspace data region cannot be confirmed or is not served here. (apps/web/app/api/search/route.ts:154)
- **CLI search key env: BRAVE_SEARCH_API_KEY, TAVILY_API_KEY, SEARCH_API_KEY, or saved login**: Without one, CLI web search answers 'Web search not configured'. (apps/cli/src/features/exec/tools/web/mod.rs:337)
- **Local privacy mode**: Refuses network web search. (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:284)

## Shared between apps

Shared: the Library view and the citation chip live in packages/ui/unified-chat and are used by several apps; the Desktop public app shows the hosted web app, so Search, find-in-chat, sources and follow-ups on Desktop are the web code; the server endpoints /api/search, /api/library and the chat route are shared by Web, Desktop, Mobile and (for cloud chat) the other apps. Separate per app: Mobile has its own on-device search (apps/mobile/src/features/search, chatViewStore), source cards and collapsible sources; CLI has its own Rust session search, /find, /search and web search tool with the user's own key; VS Code has its own session picker and search-key setup; the Chrome extension has its own side panel history search and source cards (apps/extension/src/features/side-panel/sources.ts).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The /api/search route has a 'suggestions' type (get_search_suggestions) but I found no caller that uses it; the dialog shows only recent and frequent searches, so S34.20's 'completions while typing' are not shown. (apps/web/app/api/search/route.ts:200; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:669-725)
- Brief says 'only conversations visible in history'; the search excludes temporary chats and archived ones by default but the in-index document search always includes health spaces and Google user data ('include') and ignores the includeArchived toggle. (apps/web/app/api/search/route.ts:339-345)
- Library files appear in the global Search dialog only in the 'All' category; no category chip exists for files, and the 'Artifacts' chip searches the index, not the library. (apps/web/app/api/search/route.ts:46-52, 436)
- Role or date filters switch off the index document search silently, so a filtered search finds fewer document types without telling the user. (apps/web/app/api/search/route.ts:348-352)
- Mobile cloud search failure falls back to on-device messages and only sets searchFailed; whether the screen tells the user was not checked. (apps/mobile/stores/chat/chatViewStore.ts:267-300)
- Site icons are fetched from a third-party favicon address using the publisher domain, which tells that service which sites an answer cited. Looks at odds with the rule that Desktop egress goes through a guard. (apps/web/features/chat/components/research/ResearchPanel.tsx:539-544; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:46)
- The brief's Chrome status for citation hover preview (S34.25) says missing, but the side panel builds a hover and tap card for each citation. (apps/extension/src/features/side-panel/sources.ts:40-100)
- Many brief line numbers are out of date (for example ChatComposerNew.tsx:4480 and the CLI lib.rs:4126, tui_app.rs:3157 lines point at unrelated code); the real code was found by search. (knowledge-base/data/area-briefs/034-search-experiences.md:8,13,33)
- S34.22 'query clarification' is a general ask-the-user tool that rejects choices about format, tone or length; it is not tied to search queries. (apps/web/lib/services/clarify-tool-service.ts:56-120)
- The API openapi text says allow/deny domains are for 'research_sources', and no app screen exposes them, so S34.08 and S34.18 work only for API callers. (apps/web/public/openapi.json:771)

## Not established

- Which database tables sit behind get_recent_searches, get_popular_searches, get_search_suggestions and track_search; I only saw the calls.
- Exact keyboard shortcut for 'open-search' (only its id and wiring were seen).
- How the VS Code history sheet search and the Chrome drawer search behave on empty or failed results; I saw only their entry points.
- Whether Chrome extension shows an empty or unavailable state for search (the brief points at side_panel.ts:6722 but that line is unrelated).
- How the Free plan allowance message looks when 20 searches are used up (the hook useSearchAllowance was not opened).
- Whether Desktop in the Tauri internal build differs from the web code for search; only the AGENTS statement that the public Desktop shows the hosted web app was relied on.
- VS Code: whether artifacts and project search (brief says done) exist; only chat history search and web search setup were opened.
- How Mobile shows date filters or suggestions; none found.
- Which search services the Cloud (managed) route uses at runtime beyond the one listed in the provider file, and how Google-grounded search is paid for.
- Whether citation preview on mobile is a hover-like tap card (apps/mobile CitationChip.tsx was not opened).
