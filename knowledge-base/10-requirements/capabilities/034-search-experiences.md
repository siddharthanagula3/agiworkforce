---
id: "REQ-AREA-034"
type: "requirements"
title: "Requirement items: Search experiences"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 34. Search experiences

32 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S34.01

**Search inside the current conversation.** Inside an open conversation the user can type a query and jump between the messages that match it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F034-01 Find inside the open chat](../../20-features/034-search-experiences/F034-01-find-inside-the-open-chat.md)

## S34.02

**Search conversation history.** The user can search past conversations by title and message text and open a matching chat; only conversations the user can see in history are returned.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F034-02 Global search dialog and chat history search](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Competitor trace: CAP-conversations-and-history-03, CAP-conversations-and-history-04, CAP-conversations-and-history-19, CAP-search-25

## S34.03

**Search Projects.** The user can search their Projects by name or description and open a match.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F034-02 Global search dialog and chat history search](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)

## S34.04

**Search Library.** The Library (saved files, images, documents, artifacts) has a search box that filters its items by name/prompt.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F034-03 Search Projects, Library and artifacts](../../20-features/034-search-experiences/F034-03-search-projects-library-and-artifacts.md)

## S34.05

**Search artifacts.** The user can search their artifacts by title/content and open a match.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F034-03 Search Projects, Library and artifacts](../../20-features/034-search-experiences/F034-03-search-projects-library-and-artifacts.md)

## S34.06

**Search connected company sources.** The assistant can search the user's connected work sources (Drive, Slack, Notion...) during a chat once they are connected.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F034-05 Search connected company sources](../../20-features/034-search-experiences/F034-05-search-connected-company-sources.md)
- Competitor trace: CAP-search-23

## S34.07

**Public web search.** A chat can search the public web and answer from the results.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F034-04 Assistant searches the public web](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Competitor trace: CAP-search-01, CAP-search-02, CAP-search-22

## S34.08

**Search within specified websites.** The user can restrict a web search to one or more named websites and get results only from them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F034-04 Assistant searches the public web](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Competitor trace: CAP-search-16

## S34.09

**Search by source type.** The user can choose which kinds of sources a search covers (e.g. web, news, academic, files, chats) and get results only of those kinds.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F034-09 Empty and unavailable search states](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)

## S34.10

**Academic search.** The user can run an academic/scholarly search (papers, journals) as a distinct search mode.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F034-09 Empty and unavailable search states](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)

## S34.11

**News search.** The user can run a news search (recent articles from news sources) as a distinct search mode.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F034-09 Empty and unavailable search states](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)

## S34.12

**Video search.** The user can search for videos and get video results (thumbnails, durations, links).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F034-09 Empty and unavailable search states](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)

## S34.13

**Image search.** The user can search the web for images and get image results.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F034-09 Empty and unavailable search states](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)

## S34.14

**Social/X search where the provider supports it.** Where the provider supports it, the user can search social posts (e.g. X) and get social results.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F034-09 Empty and unavailable search states](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)

## S34.15

**Date-range filters.** The user can limit a search to a date range and get only results inside it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F034-02 Global search dialog and chat history search](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)

## S34.16

**Language filters.** The user can restrict search results to one or more languages.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F034-09 Empty and unavailable search states](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)

## S34.17

**Geography filters.** The user can restrict search results to a country or region.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F034-09 Empty and unavailable search states](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)

## S34.18

**Include/exclude domains.** The user can include or exclude specific domains for a search and results respect it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F034-04 Assistant searches the public web](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Competitor trace: CAP-search-16

## S34.19

**User-selected source collections.** The user can put chosen sources into a named collection (e.g. a project's knowledge) and have chats search only/also that collection.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F034-06 Project knowledge collections](../../20-features/034-search-experiences/F034-06-project-knowledge-collections.md)

## S34.20

**Search suggestions.** Before or while typing a search, the user is offered suggested queries (recent, popular or completions) and can pick one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F034-02 Global search dialog and chat history search](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)

## S34.21

**Follow-up query refinement.** After a search-backed answer, the user is offered follow-up/refined queries and can send one with a tap.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F034-07 Follow-up questions and clarification choices](../../20-features/034-search-experiences/F034-07-follow-up-questions-and-clarification-choices.md)

## S34.22

**Query clarification choices.** When a search query is ambiguous the product offers clarification choices the user can pick before searching.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F034-07 Follow-up questions and clarification choices](../../20-features/034-search-experiences/F034-07-follow-up-questions-and-clarification-choices.md)

## S34.23

**Result previews.** Search results show a preview (title, snippet or matched text) before the user opens them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Seen in a real run: Web PASS
- Feature: [F034-02 Global search dialog and chat history search](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Competitor trace: CAP-search-04

## S34.24

**Source cards.** Sources behind an answer are shown as cards with at least title, site and link.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F034-08 Source cards, citations and source lists](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Competitor trace: CAP-search-03

## S34.25

**Citation hover/tap preview.** Hovering or tapping a citation shows a preview of the source (title, site, snippet) without leaving the answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Feature: [F034-08 Source cards, citations and source lists](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Competitor trace: CAP-search-04

## S34.26

**Source list expansion.** A compact source summary can be expanded to the full list of sources used and consulted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F034-08 Source cards, citations and source lists](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Competitor trace: CAP-search-03

## S34.27

**Open original source.** From a citation or source card the user can open the original page/document.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F034-08 Source cards, citations and source lists](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md)
- Competitor trace: CAP-search-22

## S34.28

**Add source to answer.** The user can add a specific source to an answer so it is used/cited.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F034-09 Empty and unavailable search states](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)

## S34.29

**Remove source from answer.** The user can remove/exclude a source from an answer and have it regenerated without it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F034-09 Empty and unavailable search states](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)

## S34.30

**Save source to Project or notebook.** The user can save a cited source into a Project or notebook for later use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F034-09 Empty and unavailable search states](../../20-features/034-search-experiences/F034-09-empty-and-unavailable-search-states.md)

## S34.31

**Search-result freshness information.** Search results and sources show how fresh they are (publication or retrieval date).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F034-04 Assistant searches the public web](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md)
- Competitor trace: CAP-search-24

## S34.32

**Empty-results and unavailable-source states.** Searches that find nothing, or whose source/provider is unavailable, show a clear empty or unavailable state instead of silence.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F034-02 Global search dialog and chat history search](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Competitor trace: CAP-search-24
