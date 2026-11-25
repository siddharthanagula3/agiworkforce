# Area 34. Search experiences

32 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S34.01 Search inside the current conversation.
- Should: Inside an open conversation the user can type a query and jump between the messages that match it.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageSearch.tsx:92; apps/web/features/chat/components/messages/ChatMessageList.tsx:1361; apps/web/features/chat/components/messages/ChatMessageList.tsx:1312; apps/web/features/chat/components/messages/ChatMessageList.tsx:1895; apps/cli/src/tui/tui_app.rs:3157

## S34.02 Search conversation history.
- Should: The user can search past conversations by title and message text and open a matching chat; only conversations the user can see in history are returned.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/api/search/route.ts:256; apps/mobile/stores/chat/chatViewStore.ts:180; apps/cli/src/lib.rs:4126; apps/cli/src/repl/registry.rs:710; apps/cli/src/sessions.rs:723; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5037; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1841; apps/extension-vscode/src/features/trees/sessionPickers.ts:81

## S34.03 Search Projects.
- Should: The user can search their Projects by name or description and open a match.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:69; apps/web/features/chat/services/global-search-service.ts:211; apps/web/app/api/search/route.ts:273; apps/mobile/app/(app)/(tabs)/projects.tsx:449; apps/mobile/app/(app)/(tabs)/projects.tsx:273; apps/mobile/src/features/search/mobileGlobalSearch.ts:88

## S34.04 Search Library.
- Should: The Library (saved files, images, documents, artifacts) has a search box that filters its items by name/prompt.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:842; packages/ui/unified-chat/src/components/library/LibraryView.tsx:395; apps/web/app/api/library/route.ts:86; apps/web/features/library/components/LibraryView.tsx:235; apps/mobile/src/features/library/index.tsx:331; apps/mobile/src/features/library/index.tsx:70; apps/mobile/src/features/library/index.tsx:93

## S34.05 Search artifacts.
- Should: The user can search their artifacts by title/content and open a match.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:95; packages/ui/unified-chat/src/components/library/LibraryView.tsx:842; apps/web/app/api/library/route.ts:86; apps/web/app/chat/artifacts/page.tsx:22; apps/mobile/src/features/library/index.tsx:266; apps/mobile/src/features/library/index.tsx:93; apps/mobile/src/features/library/index.tsx:334

## S34.06 Search connected company sources.
- Should: The assistant can search the user's connected work sources (Drive, Slack, Notion...) during a chat once they are connected.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4480; apps/web/app/api/llm/v1/chat/completions/route.ts:732; apps/web/lib/connectors/directory/sources/first-party.json:10; apps/mobile/src/features/settings/cloud-connectors/index.tsx:1034; apps/web/app/api/llm/v1/chat/completions/route.ts:686; apps/web/app/api/llm/v1/chat/completions/route.ts:761; apps/web/app/api/llm/v1/chat/completions/route.ts:814; apps/cli/src/models/managed_approvals.rs:128

## S34.07 Public web search.
- Should: A chat can search the public web and answer from the results.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2504; apps/web/lib/hooks/useChatStream.ts:3511; apps/web/lib/web-search/required-search.ts:121; apps/web/lib/web-search/web-search-tool.ts:56; apps/mobile/src/features/settings/capabilities/index.tsx:158; apps/mobile/stores/chat/chatExecutionStore.ts:1741; apps/cli/src/features/exec/tools/web/mod.rs:284; apps/cli/src/auth.rs:991

## S34.08 Search within specified websites.
- Should: The user can restrict a web search to one or more named websites and get results only from them.
- Status: api done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3881; apps/web/lib/web-search/web-search-tool.ts:301; apps/web/lib/web-search/web-search-tool.ts:458; apps/web/public/openapi.json:665

## S34.09 Search by source type.
- Should: The user can choose which kinds of sources a search covers (e.g. web, news, academic, files, chats) and get results only of those kinds.
- Status: not applicable anywhere

## S34.10 Academic search.
- Should: The user can run an academic/scholarly search (papers, journals) as a distinct search mode.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S34.11 News search.
- Should: The user can run a news search (recent articles from news sources) as a distinct search mode.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S34.12 Video search.
- Should: The user can search for videos and get video results (thumbnails, durations, links).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S34.13 Image search.
- Should: The user can search the web for images and get image results.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S34.14 Social/X search where the provider supports it.
- Should: Where the provider supports it, the user can search social posts (e.g. X) and get social results.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S34.15 Date-range filters.
- Should: The user can limit a search to a date range and get only results inside it.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:460; apps/web/features/chat/services/global-search-service.ts:174; apps/web/app/api/search/route.ts:250

## S34.16 Language filters.
- Should: The user can restrict search results to one or more languages.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S34.17 Geography filters.
- Should: The user can restrict search results to a country or region.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S34.18 Include/exclude domains.
- Should: The user can include or exclude specific domains for a search and results respect it.
- Status: api done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3881; apps/web/lib/web-search/web-search-tool.ts:301; apps/web/lib/web-search/web-search-tool.ts:458; apps/web/public/openapi.json:665

## S34.19 User-selected source collections.
- Should: The user can put chosen sources into a named collection (e.g. a project's knowledge) and have chats search only/also that collection.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/projects/components/SourcesPanel.tsx:127; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2550; apps/web/lib/services/project-knowledge-retrieval.ts:38; apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx:128; apps/cli/src/cloud/knowledge.rs:38; apps/cli/src/lib.rs:2447; packages/contracts/cloud-contracts/src/project-knowledge.ts:80; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3410

## S34.20 Search suggestions.
- Should: Before or while typing a search, the user is offered suggested queries (recent, popular or completions) and can pick one.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:545; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:583; apps/web/features/chat/services/global-search-service.ts:294; apps/web/app/api/search/route.ts:201

## S34.21 Follow-up query refinement.
- Should: After a search-backed answer, the user is offered follow-up/refined queries and can send one with a tap.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1280; apps/web/features/chat/components/messages/ChatMessageList.tsx:1297; apps/web/features/chat/components/messages/ChatMessageList.tsx:1822

## S34.22 Query clarification choices.
- Should: When a search query is ambiguous the product offers clarification choices the user can pick before searching.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/lib/services/clarify-tool-service.ts:56; apps/cli/src/platform/runtime/tool_catalog.rs:721; apps/cli/src/features/exec/tools/task_registry/mod.rs:605; apps/cli/src/features/exec/tools/task_registry/mod.rs:528; apps/cli/src/features/exec/tools/task_registry/mod.rs:566

## S34.23 Result previews.
- Should: Search results show a preview (title, snippet or matched text) before the user opens them.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:272; apps/web/features/chat/components/research/ResearchPanel.tsx:139; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:125; apps/web/app/api/search/route.ts:414; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:77; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:356; apps/mobile/stores/chat/chatExecutionStore.ts:1741; apps/extension/src/features/side-panel/sources.ts:19

## S34.24 Source cards.
- Should: Sources behind an answer are shown as cards with at least title, site and link.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/research/ResearchPanel.tsx:437; apps/web/features/chat/components/research/ResearchPanel.tsx:134; apps/web/features/chat/components/messages/MessageBubble.tsx:2738; apps/web/features/chat/components/messages/MessageBubble.tsx:1739; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:25; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:42; apps/mobile/stores/chat/chatExecutionStore.ts:1741; apps/extension/src/features/side-panel/sources.ts:19

## S34.25 Citation hover/tap preview.
- Should: Hovering or tapping a citation shows a preview of the source (title, site, snippet) without leaving the answer.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:173; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:99; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:275; apps/mobile/src/features/chat/components/CitationChip.tsx:29

## S34.26 Source list expansion.
- Should: A compact source summary can be expanded to the full list of sources used and consulted.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/research/ResearchPanel.tsx:544; apps/web/features/chat/components/research/ResearchPanel.tsx:446; apps/web/features/chat/stores/research-panel-store.ts:49; apps/mobile/src/features/chat/components/CollapsibleSources.tsx:34; apps/mobile/src/features/chat/components/MessageBubble.tsx:1004; apps/mobile/src/features/chat/components/CollapsibleSources.tsx:57; apps/extension/src/features/side-panel/sources.ts:136; apps/extension/src/features/side-panel/sources.ts:138

## S34.27 Open original source.
- Should: From a citation or source card the user can open the original page/document.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:152; apps/web/features/chat/components/research/ResearchPanel.tsx:103; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:267; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:29; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:39; apps/cli/src/sources.rs:91; apps/cli/src/tui/tui_app.rs:6207; apps/cli/src/repl/mod.rs:701

## S34.28 Add source to answer.
- Should: The user can add a specific source to an answer so it is used/cited.
- Status: not applicable anywhere

## S34.29 Remove source from answer.
- Should: The user can remove/exclude a source from an answer and have it regenerated without it.
- Status: not applicable anywhere

## S34.30 Save source to Project or notebook.
- Should: The user can save a cited source into a Project or notebook for later use.
- Status: not applicable anywhere

## S34.31 Search-result freshness information.
- Should: Search results and sources show how fresh they are (publication or retrieval date).
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:58; apps/web/features/chat/components/research/ResearchPanel.tsx:86; apps/web/lib/web-search/web-search-tool.ts:353; apps/mobile/src/features/chat/utils/toolCallAccumulator.ts:142; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:36

## S34.32 Empty-results and unavailable-source states.
- Should: Searches that find nothing, or whose source/provider is unavailable, show a clear empty or unavailable state instead of silence.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:634; apps/web/features/chat/components/messages/MessageBubble.tsx:2763; apps/web/features/chat/components/messages/MessageBubble.tsx:1716; apps/web/features/chat/components/research/ResearchPanel.tsx:159; apps/mobile/src/features/chat/components/WebSearchToolCard.tsx:93; apps/cli/src/features/exec/tools/web/mod.rs:404; apps/cli/src/features/exec/tools/web/mod.rs:392; apps/extension/src/side_panel.ts:6722
