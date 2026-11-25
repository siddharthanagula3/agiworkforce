---
id: "GAPS-AREA-034"
type: "gap-list"
title: "Gaps: Search experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 34. Search experiences

85 open gaps that touch this area. Area page: [20-features/034-search-experiences](../../20-features/034-search-experiences/README.md).

## CMP-C78

**Web search call limit per session**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Detail: No cap or refill on searches; web_fetch can be turned off with --disallowedTools.
- Evidence: searched: MAX_WEB_SEARCHES, search_count in apps/cli

## CMP-C79

**Web search modes and --search flag**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md), [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md), [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Detail: web_search is one live search; no cached, indexed or disabled mode, no --search flag and no context size or location setting.
- Evidence: apps/cli/src/features/exec/tools/web/mod.rs:379-460

## CMP-CP29

**Session picker: preview, scope widening, search by PR link, rename key**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Detail: It has no preview, no worktree or project scope switch and no search by pull request link The picker lists managed sessions with a text filter and an r key to rename; it has no preview, no worktree or project scope switch and no search by pull request link.
- Evidence: apps/cli/src/tui/tui_app.rs:4253; apps/cli/src/tui/widgets/session_picker.rs:95

## CMP-CP294

**Turn off session history saving or cap its size**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md), [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: Only the size cap is missing default.keep_history = false turns session saving off for every run (apps/cli/src/config.rs:205,1459; applied at apps/cli/src/lib.rs:6155-6157). Only the size cap is missing. The row Run without saving a transcript already says so.
- Evidence: searched: history.persistence, max_bytes in apps/cli/src

## CMP-CP44

**Web search tool availability**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md), [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md), [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Detail: Web_search works only after you save a Brave or Tavily key web_search works only after you save a Brave or Tavily key; it returns up to 20 sources and records them for citation.
- Evidence: apps/cli/src/features/exec/tools/web/mod.rs:330-360

## CMP-CP45

**Switch web fetch off while search stays (CLAUDE_CODE_DISABLE_WEB_FETCH)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Detail: No dedicated switch No dedicated switch; --disallowedTools WebFetch denies the tool for a run (the alias maps to web_fetch).
- Evidence: apps/cli/src/platform/runtime/tool_catalog.rs:249; apps/cli/src/lib.rs:394-399

## CMP-CP46

**Web fetch tool with page summarising**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md), [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Detail: No cache and no separate summarising model web_fetch follows up to 5 redirects and reads up to 2 MB per hop but gives the page to the main model; no cache and no separate summarising model.
- Evidence: apps/cli/src/features/exec/tools/web/mod.rs:118-126

## CMP-CP98

**Domain allow and deny rules for sandboxed command traffic**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Detail: Sandboxed commands only get network on or off Domain allow and deny rules gate the agent's web fetch; sandboxed commands only get network on or off.
- Evidence: apps/cli/src/permissions.rs:135

## CMP-M44

**Restrict research to chosen sites**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md), [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md), [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Detail: No way to limit research to chosen sites.
- Evidence: searched: prioritize, preferredSites, allowedDomains in apps/mobile/src, app

## CMP-MP22

**Search chats including archived chats**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Detail: Archived chats are managed on a separate Archived chats page and search coverage of them is not shown Our search covers chats, projects, files and library; archived chats are managed on a separate Archived chats page and search coverage of them is not shown.
- Evidence: apps/mobile/src/features/chat/ChatsListScreen.tsx:387-396; src/features/search/mobileDestinations.ts:174

## CMP-V14

**Rename sessions and auto-archive inactive ones**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F018-01](../../20-features/018-conversation-level-controls/F018-01-test.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Detail: Local sessions cannot be renamed in the editor (only cloud runs) and nothing archives them after a period of inactivity.
- Evidence: apps/extension-vscode/src/core/commandSetup.ts:2673; searched: autoArchive, archiveAfter

## CMP-VP72

**Do not keep session history**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md), [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: The editor has no switch for it The engine has a keep_history setting that stops saving sessions; the editor has no switch for it.
- Evidence: apps/cli/src/lib.rs:6030-6035

## CMP-WP51

**Plus menu: Web search toggle**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Detail: No search toggle No search toggle; search runs automatically when the model supports it, and /search forces it.
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1686-1694,3194

## CMP-WP78

**Company knowledge and enterprise search across connected tools**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F034-05](../../20-features/034-search-experiences/F034-05-search-connected-company-sources.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Detail: There is no single company-knowledge option or ready-made cross-tool search project Connected apps can be switched on per chat and used by research, but there is no single company-knowledge option or ready-made cross-tool search project.
- Evidence: searched: company knowledge, enterprise search in apps/web/features, app (only connector directory json); ComposerPlusMenu.tsx:1420 per-connector toggles

## GAP-AREA034-LW01

**The /api/search route has a 'suggestions' type (get_search_suggestions) but I found no caller that uses it; the dialog shows only recent and frequent searches, so S34.20's 'completions while typing' are not shown.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-034
- Detail: Area 34. Search experiences
- Evidence: apps/web/app/api/search/route.ts:200; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:669-725

## GAP-AREA034-LW03

**Library files appear in the global Search dialog only in the 'All' category; no category chip exists for files, and the 'Artifacts' chip searches the index, not the library.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-034
- Detail: Area 34. Search experiences
- Evidence: apps/web/app/api/search/route.ts:46-52, 436

## GAP-AREA034-LW04

**Role or date filters switch off the index document search silently, so a filtered search finds fewer document types without telling the user.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-034
- Detail: Area 34. Search experiences
- Evidence: apps/web/app/api/search/route.ts:348-352

## GAP-AREA034-LW05

**Mobile cloud search failure falls back to on-device messages and only sets searchFailed; whether the screen tells the user was not checked.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-034
- Detail: Area 34. Search experiences
- Evidence: apps/mobile/stores/chat/chatViewStore.ts:267-300

## GAP-AREA034-LW06

**Site icons are fetched from a third-party favicon address using the publisher domain, which tells that service which sites an answer cited. Looks at odds with the rule that Desktop egress goes through a guard.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-034
- Detail: Area 34. Search experiences
- Evidence: apps/web/features/chat/components/research/ResearchPanel.tsx:539-544; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:46

## GAP-AREA034-LW09

**S34.22 'query clarification' is a general ask-the-user tool that rejects choices about format, tone or length; it is not tied to search queries.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-034
- Detail: Area 34. Search experiences
- Evidence: apps/web/lib/services/clarify-tool-service.ts:56-120

## GAP-AREA034-LW10

**The API openapi text says allow/deny domains are for 'research_sources', and no app screen exposes them, so S34.08 and S34.18 work only for API callers.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-034
- Detail: Area 34. Search experiences
- Evidence: apps/web/public/openapi.json:771

## GAP-CAP-conversations-and-history-03

**Search past chats: Web shows three result rows for one chat and the dialog jumps as results change (seen, cosmetic). Mobile search of archived chats is partial (MP22).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Requirement items: S34.02, S4.03
- Detail: Claude partly, ChatGPT yes; AGI built

## GAP-CAP-conversations-and-history-04

**Search scope rules (archived in, deleted and temporary out): Archived chats are excluded by default on web, unlike the documented ChatGPT behaviour. Needs an owner choice (see unresolved).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Requirement items: S34.02
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-conversations-and-history-19

**Resume past sessions in coding tools: No rename or auto-archive in VS Code (V14). Session picker preview and PR search partial (CP29). Turning off history saving partial (CP294, VP72).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Requirement items: S34.02, S4.02
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-search-01

**Automatic web search with inline citations: Web showed a raw [7] marker left in an answer after the chips (defect W-5, Premium). CLI, VS Code and Chrome show no inline citation marker (S36.01).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md)
- Requirement items: S34.07, S36.01, S36.16
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-search-02

**Search on/off control in the composer: The browser run found no search switch in the plus, output or model menus on Free or Premium, though code has one. Owner choice open: automatic only, or an explicit switch.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Requirement items: S34.07
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-search-03

**Sources list and panel: Web panel shows duplicate entries, a header called MORE, and section names as titles ('Iana', 'References'); chips show only the domain; favicons fail (third-party favicon service 404). CLI and VS Code lack cards and the title and publisher fields.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md), [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md), [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Requirement items: S34.24, S34.26, S36.02, S36.03, S36.04
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-search-04

**Citation hover or tap preview: VS Code and Chrome have no preview.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md), [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md), [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Requirement items: S34.23, S34.25, S36.08
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-search-16

**Domain include and exclude for search: No chat control for domains on desktop, mobile, Chrome or VS Code.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Requirement items: S34.08, S34.18
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-search-22

**Coding-tool search and fetch: No session cap; no /deep-research; no source cards in the terminal.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Requirement items: S34.07, S34.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-search-23

**Search across connected company sources with citations: Ledger says done but no external app could be connected in the browser run.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-05](../../20-features/034-search-experiences/F034-05-search-connected-company-sources.md)
- Requirement items: S34.06
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-search-24

**Source freshness, unavailable-source and empty-result states: No conflicting-source, stale or restricted-source notice (S36.18, 20, 21).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md), [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md), [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Requirement items: S34.31, S34.32, S36.05, S36.06, S36.18, S36.19, S36.20, S36.21
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-search-25

**Citations to earlier chats and memory used: Mobile has no message-level link.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md), [F036-04](../../20-features/036-sources-and-grounding-interface/F036-04-locators-inside-files-and-chats.md)
- Requirement items: S34.02, S36.14
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F034-01-01

**No in-chat find on Mobile, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-01](../../20-features/034-search-experiences/F034-01-find-inside-the-open-chat.md)
- Detail: Affects: Mobile, VS Code extension, Chrome extension users. Work needed: Design a per-app find control with the same matching rules; reuse matchingGroupIndexes logic where the surface is shared.
- Evidence: doc: knowledge-base/data/area-briefs/034-search-experiences.md S34.01

## GAP-F034-01-02

**CLI /find lists lines only and cannot jump.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-01](../../20-features/034-search-experiences/F034-01-find-inside-the-open-chat.md)
- Detail: Affects: CLI full-screen chat users. Work needed: Add a jump or scroll-to-message action in the full-screen view.
- Evidence: apps/cli/src/tui/tui_app.rs:4713

## GAP-F034-01-03

**Count counts messages not occurrences and highlight depends on mounted rows.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-01](../../20-features/034-search-experiences/F034-01-find-inside-the-open-chat.md)
- Detail: Affects: Web and Desktop users of very long chats. Work needed: Decide the counting rule; test highlight after a jump to a far row.
- Evidence: apps/web/features/chat/lib/message-search.ts:9-31; ChatMessageList.tsx:2110

## GAP-F034-01-04

**No component-level test for MessageSearch and no test for CLI find_in_transcript found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-01](../../20-features/034-search-experiences/F034-01-find-inside-the-open-chat.md)
- Detail: Affects: Maintainers. Work needed: Add a component test for keys and wrap, and a Rust test for the limit text.
- Evidence: searched apps/web/features/chat/components/messages/__tests__ and apps/cli/src/tui for tests naming search or find; none found

## GAP-F034-01-NOTBUILT

**Find inside the open chat: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F034-01](../../20-features/034-search-experiences/F034-01-find-inside-the-open-chat.md)
- Requirement items: S34.01
- Detail: Mobile: S34.01; VS Code: S34.01; Chrome: S34.01

## GAP-F034-02-01

**Suggestions endpoint is not connected to any client.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Detail: Affects: Web and Desktop users expecting query completions. Work needed: Wire into the dialog or remove the endpoint.
- Evidence: route.ts:285-293; no client call found

## GAP-F034-02-02

**Mobile has no date filter or frequent searches; CLI, VS Code and Chrome search chats only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome. Work needed: Decide per app which filters the leaders ship, then build them.
- Evidence: doc: area brief S34.15, S34.20; ChatsListScreen.tsx:372-405

## GAP-F034-02-03

**Brief says Mobile has no suggestions, but recent searches exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Detail: Affects: Documentation accuracy. Work needed: Update the brief row.
- Evidence: apps/mobile/src/features/search/recentSearches.ts

## GAP-F034-02-04

**Chrome search box hidden until more than 10 chats.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Detail: Affects: Chrome users with a few chats. Work needed: Decide whether the threshold is intended.
- Evidence: side_panel.ts:1131, :12821

## GAP-F034-02-05

**Message hits capped at 100 rows before the limit; Code category searches the index only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Detail: Affects: Heavy users. Work needed: Check ranking and cap with real data.
- Evidence: route.ts:466, :393

## GAP-F034-02-NOTBUILT

**Global search dialog and chat history search: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Requirement items: S34.03, S34.15, S34.20, S34.23
- Detail: Mobile: S34.15, S34.20; CLI: S34.03, S34.15, S34.20, S34.23; VS Code: S34.15, S34.20, S34.23; Chrome: S34.03, S34.15, S34.20

## GAP-F034-03-01

**Artifact content is not searched on Web and Desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-03](../../20-features/034-search-experiences/F034-03-search-projects-library-and-artifacts.md)
- Detail: Affects: Web and Desktop users. Work needed: Search stored artifact text or reuse the indexed artifact kind.
- Evidence: apps/web/lib/server/media-assets.ts:422-426

## GAP-F034-03-02

**No Library search in CLI and Chrome; VS Code unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-03](../../20-features/034-search-experiences/F034-03-search-projects-library-and-artifacts.md)
- Detail: Affects: CLI, Chrome, VS Code. Work needed: Decide whether those apps need a Library; verify VS Code.
- Evidence: doc: area brief S34.04, S34.05

## GAP-F034-03-03

**Brief says mobile search is on-device but files are searched by the server.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-03](../../20-features/034-search-experiences/F034-03-search-projects-library-and-artifacts.md)
- Detail: Affects: Documentation; offline mobile users. Work needed: Correct the brief; decide offline behaviour.
- Evidence: libraryClient.ts:90-105

## GAP-F034-03-NOTBUILT

**Search Projects, Library and artifacts: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F034-03](../../20-features/034-search-experiences/F034-03-search-projects-library-and-artifacts.md)
- Requirement items: S34.04, S34.05
- Detail: CLI: S34.04, S34.05; VS Code: S34.04; Chrome: S34.04, S34.05

## GAP-F034-04-01

**Brief says no app screen exposes domain limits; Web's Deep Research plan card does.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Detail: Affects: Documentation accuracy. Work needed: Correct the brief; decide whether ordinary chats need the control.
- Evidence: ResearchActivity.tsx:198-203; WebChatPage.tsx:6270

## GAP-F034-04-02

**CLI results carry no dates and no domain restriction control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Detail: Affects: CLI users. Work needed: Carry date fields and pass site rules.
- Evidence: apps/cli/src/features/exec/tools/web/mod.rs:365-390

## GAP-F034-04-03

**No enforcing code confirmed for 'Local privacy mode refuses network access' for search.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Detail: Affects: Local mode on CLI and VS Code. Work needed: Verify and test the privacy boundary on search; document it.
- Evidence: Only a prompt sentence at ChatStateManager.ts:284

## GAP-F034-04-04

**Mobile and Desktop Local modes have no web search route.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Detail: Affects: Local mode users. Work needed: Decide whether Local mode may use an own-key search service.
- Evidence: chatExecutionStore.ts:3388

## GAP-F034-04-05

**Brief says Chrome shows no freshness; the side panel renders publishedDate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Detail: Affects: Documentation accuracy. Work needed: Correct the brief.
- Evidence: sources.ts:42-44

## GAP-F034-04-NOTBUILT

**Assistant searches the public web: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Requirement items: S34.31
- Detail: CLI: S34.31; VS Code: S34.31; Chrome: S34.31

## GAP-F034-05-01

**Release state is coming soon; Drive, Gmail, Slack not released although the brief says done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-05](../../20-features/034-search-experiences/F034-05-search-connected-company-sources.md)
- Detail: Affects: All apps. Work needed: Release decision by the owner; update the brief.
- Evidence: packages/contracts/types/src/connector-release.ts:14-30

## GAP-F034-05-02

**Dropped-tool header has no client reader.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-05](../../20-features/034-search-experiences/F034-05-search-connected-company-sources.md)
- Detail: Affects: Web, Mobile, CLI, VS Code, Chrome. Work needed: Read and show it in each app.
- Evidence: Only route.ts:930 mentions it

## GAP-F034-05-03

**Agent turns get no connectors in the coarse path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-05](../../20-features/034-search-experiences/F034-05-search-connected-company-sources.md)
- Detail: Affects: Agent users. Work needed: Confirm intent.
- Evidence: route.ts:795-805

## GAP-F034-05-04

**VS Code and Chrome connector UI not confirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-05](../../20-features/034-search-experiences/F034-05-search-connected-company-sources.md)
- Detail: Affects: VS Code and Chrome. Work needed: Verify and, if absent, mark partial.
- Evidence: ChatStateManager.ts:2469 only; managedChatHandler.ts has no connector code

## GAP-F034-05-NOTBUILT

**Search connected company sources: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F034-05](../../20-features/034-search-experiences/F034-05-search-connected-company-sources.md)
- Requirement items: S34.06
- Detail: VS Code: S34.06; Chrome: S34.06

## GAP-F034-06-01

**VS Code does not attach knowledge files but the brief lists it as done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-06](../../20-features/034-search-experiences/F034-06-project-knowledge-collections.md)
- Detail: Affects: VS Code users. Work needed: Correct the brief or add attachment.
- Evidence: apps/extension-vscode/src/features/projects/activeProject.ts:48-59

## GAP-F034-06-02

**Mobile Local sources are not searched; large sources are cut.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-06](../../20-features/034-search-experiences/F034-06-project-knowledge-collections.md)
- Detail: Affects: Mobile Local users. Work needed: Passage selection on device.
- Evidence: apps/mobile/services/attachmentContext.ts:68-90

## GAP-F034-06-03

**CLI command spelling and linked-folder behaviour not verified end to end.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-06](../../20-features/034-search-experiences/F034-06-project-knowledge-collections.md)
- Detail: Affects: CLI users. Work needed: Run the CLI and confirm.
- Evidence: apps/cli/src/lib.rs:1327, :3844

## GAP-F034-06-04

**Retention of index chunks not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-06](../../20-features/034-search-experiences/F034-06-project-knowledge-collections.md)
- Detail: Affects: Privacy review. Work needed: Read the deletion code.
- Evidence: retrieval tables read only for names

## GAP-F034-07-01

**Brief says follow-ups are missing on Mobile; the code has them (Cloud mode only, no setting).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-07](../../20-features/034-search-experiences/F034-07-follow-up-questions-and-clarification-choices.md)
- Detail: Affects: Mobile; anyone reading the brief. Work needed: Correct the brief; decide whether to add a Mobile setting and a Local-mode version.
- Evidence: apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx; apps/mobile/app/(app)/chat/[id].tsx:2597

## GAP-F034-07-02

**Brief says clarify is missing on Mobile and Chrome; the code renders and answers cards on both.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-07](../../20-features/034-search-experiences/F034-07-follow-up-questions-and-clarification-choices.md)
- Detail: Affects: Mobile, Chrome. Work needed: Correct the brief; add a device test for each.
- Evidence: apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1077; apps/extension/src/features/side-panel/bubbles.ts:245

## GAP-F034-07-03

**Clarify tool is not offered to the desktop surface although the brief says Desktop is done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-07](../../20-features/034-search-experiences/F034-07-follow-up-questions-and-clarification-choices.md)
- Detail: Affects: Public Desktop (Electron). Work needed: Confirm by running the desktop shell, then allow the surface or fix the brief.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1276; apps/web/lib/device-steps/host-headers.ts:41

## GAP-F034-07-04

**Web chips need a searched turn because the enable prop is never passed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-07](../../20-features/034-search-experiences/F034-07-follow-up-questions-and-clarification-choices.md)
- Detail: Affects: Web, Desktop. Work needed: Decide the intended default and remove the dead prop or pass it.
- Evidence: ChatMessageList.tsx:1104,1468

## GAP-F034-07-05

**No follow-up suggestions on CLI, VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-07](../../20-features/034-search-experiences/F034-07-follow-up-questions-and-clarification-choices.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Build on the shared route for VS Code and Chrome; CLI needs a text design.
- Evidence: no code found in apps/cli, apps/extension-vscode, apps/extension

## GAP-F034-07-06

**No local or own-key implementation of either feature.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-07](../../20-features/034-search-experiences/F034-07-follow-up-questions-and-clarification-choices.md)
- Detail: Affects: Mobile and Desktop in Local mode, own-key users. Work needed: A local small-model path or a clear unavailable state.
- Evidence: generate-follow-ups.ts:137 uses managed admission only

## GAP-F034-07-07

**Decision doc says the clarify answer path is not built; code has it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-07](../../20-features/034-search-experiences/F034-07-follow-up-questions-and-clarification-choices.md)
- Detail: Affects: Engineers reading docs. Work needed: Update the doc (AGENTS.md section 11).
- Evidence: docs/decisions/wire-or-cut.md:340 vs apps/web/app/api/interactive-cards/respond/route.ts

## GAP-F034-07-NOTBUILT

**Follow-up questions and clarification choices: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F034-07](../../20-features/034-search-experiences/F034-07-follow-up-questions-and-clarification-choices.md)
- Requirement items: S34.21, S34.22
- Detail: CLI: S34.21; VS Code: S34.21, S34.22

## GAP-F034-08-01

**CLI shows a text footer only; no preview and no open action.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Detail: Affects: CLI. Work needed: Decide on a TUI preview and an open-in-browser key.
- Evidence: apps/cli/src/sources.rs:91-103

## GAP-F034-08-02

**VS Code list lacks snippet, date and preview.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Detail: Affects: VS Code. Work needed: Send snippet and date in the sourceList event and render them.
- Evidence: webviewContent.ts:4755-4785

## GAP-F034-08-03

**Brief marks Chrome citation preview as missing; code has it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Detail: Affects: Brief accuracy. Work needed: Correct the brief.
- Evidence: apps/extension/src/features/side-panel/sources.ts:42-95

## GAP-F034-08-04

**Mobile uses a letter mark and an alert instead of site icon and floating card.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Detail: Affects: Mobile. Work needed: Design decision; confirm it is intended.
- Evidence: CollapsibleSources.tsx:41-44; CitationChip.tsx:42

## GAP-F034-08-05

**No 'No sources yet' state on Mobile, Chrome, CLI, VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Detail: Affects: those apps. Work needed: Add or accept silence.
- Evidence: CollapsibleSources.tsx:150; sources.rs:92

## GAP-F034-08-06

**Public Desktop in Local mode and Mobile Local mode have no source producer found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Detail: Affects: Local users. Work needed: Confirm and, if needed, add a local search or a clear message.
- Evidence: no search tool found in local paths read

## GAP-F034-08-NOTBUILT

**Source cards, citations and source lists: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Requirement items: S34.24, S34.25, S34.26
- Detail: CLI: S34.24, S34.26; VS Code: S34.24, S34.25, S34.26; Chrome: S34.25

## GAP-F034-09-01

**No academic, news, video, image or social search mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-09](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)
- Detail: Affects: All six apps. Work needed: Pick provider options, add a mode field to the tool and a control in each app; verify provider documentation first.
- Evidence: S34.10-S34.14 status lines; web-search-tool.ts:70-79

## GAP-F034-09-02

**No language or region filter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-09](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)
- Detail: Affects: All six apps. Work needed: Add fields to the tool, request schema and a settings control.
- Evidence: S34.16, S34.17; request body at web-search-tool.ts:300-308

## GAP-F034-09-03

**Source-type filter, add, remove and save source are marked not applicable; no equivalent control exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-09](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)
- Detail: Affects: All six apps. Work needed: Owner decision to build or to drop from the brief.
- Evidence: S34.09, S34.28, S34.29, S34.30

## GAP-F034-09-04

**Site lists are not available in ordinary chat on Web or Mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-09](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Expose in the composer or settings if wanted.
- Evidence: Fields set only for research (apps/web/features/chat/pages/WebChatPage.tsx:6270)

## GAP-F034-09-05

**Save is possible for a report but not for a single source.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-09](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)
- Detail: Affects: Web and Desktop. Work needed: Add a source-card action using project knowledge upload.
- Evidence: ResearchReportView.tsx:282

## GAP-F034-09-06

**Own-key and Local modes have no search kind or filter support either.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F034-09](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)
- Detail: Affects: CLI own-key, Mobile and Desktop Local. Work needed: Same fields for Brave and Tavily bodies.
- Evidence: apps/cli/src/features/exec/tools/web/mod.rs:308-314

## GAP-F034-09-NOTBUILT

**Empty and unavailable search states: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F034-09](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)
- Requirement items: S34.10, S34.11, S34.12, S34.13, S34.14, S34.16, S34.17
- Detail: Web: S34.10, S34.11, S34.12, S34.13, S34.14, S34.16, S34.17; Desktop: S34.10, S34.11, S34.12, S34.13, S34.14, S34.16, S34.17; Mobile: S34.10, S34.11, S34.12, S34.13, S34.14, S34.16, S34.17; CLI: S34.10, S34.11, S34.12, S34.13, S34.14, S34.16, S34.17; VS Code: S34.10, S34.11, S34.12, S34.13, S34.14, S34.16, S34.17; Chrome: S34.10, S34.11, S34.12, S34.13, S34.14, S34.16, S34.17
