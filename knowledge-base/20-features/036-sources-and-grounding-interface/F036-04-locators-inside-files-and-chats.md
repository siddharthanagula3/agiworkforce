---
id: "F036-04"
type: "feature"
title: "Locators inside files and chats"
aliases: ["Project file citation", "Project sources chip", "Past chat citation", "Previous chats this answer used", "projectSources", "pastChatSources", "knowledgeFile link", "highlightMessage link"]
area: "36 Sources and grounding interface"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S36.09", "S36.14"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "mode:cloud", "file:packages/contracts/types/src/project-file-citations.ts", "file:packages/contracts/types/src/past-chat-citations.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F036-04 Locators inside files and chats

Points a citation inside the user's own material. A project-file chip shows the file name and a page or heading trail and opens the project file at that place. A past-chat chip opens the earlier chat at the message used. Web, Desktop (hosted web) and Mobile have both; CLI, VS Code and Chrome do not.

Area: [36. Sources and grounding interface](README.md). Requirement items: [S36.09](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3609), [S36.14](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3614).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows which project files and which earlier chats an answer used, with a place inside them, and links the reader to that place (packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx:111; apps/web/features/chat/components/messages/CitationPastChats.tsx:21).

**Why it exists.** Without it the reader cannot tell a remembered or file-based fact from an invented one (comment in CitationPastChats.tsx:15-19). The brief asks for page locators (S36.09) and message links (S36.14).

**Who uses it.** Users who work with Projects and memory on Web, Desktop and Mobile.

**Problems it solves**

- No way to check which file page an answer came from.
- No way to reach the chat a recalled fact came from.
- Three passages on one page would show as three identical chips.

**Use cases**

- Click 'report.pdf · p. 12' to open the project with the file at page 12.
- Click a past-chat chip to open the earlier chat at the message.
- On Mobile, tap a file chip, read the passage, then tap Open file.
- See a heading trail such as 'Pricing › Refunds' for a document with headings.

## 2. User experience

**Where to find it**

- Web: below an assistant answer, a row labelled (for screen readers) 'Project files used in this answer' and a nav 'Previous chats this answer used' (apps/web/features/chat/components/messages/MessageBubble.tsx:3577-3587).
- Desktop: the hosted web app inside Electron (doc: AGENTS.md section 5); Tauri build: unknown.
- Mobile: same two groups below the answer, with the same accessibility labels (apps/mobile/src/features/chat/components/MessageBubble.tsx:2767-2771).
- CLI, VS Code, Chrome: not available.

**Before you start**

- The chat belongs to a Project with files, or memory recall of earlier chats is on for the user. How these switch on server-side is not established here.
- Chips show after streaming ends on Mobile (MessageBubble.tsx:2766-2771).

**Screens and controls**

- File chip: file icon, file name, a dot and the location; link when it has project id and file id, else a non-link note (ProjectFileCitationChip.tsx:47-60).
- Hover card: file name, location and passage (ProjectFileCitationChip.tsx:63-90).
- Past-chat chip: chat icon, chat title and date, link (CitationPastChats.tsx:30-56).
- Mobile file chip opens an alert with the location and passage and Cancel and Open file buttons; Mobile past-chat chip navigates directly (apps/mobile/src/features/chat/components/ProjectFileCitations.tsx:46-60; PastChatCitations.tsx:19-26).

**Journey**

1. Ask a question in a Project chat or one that uses earlier chats.
2. Read the answer.
3. See the chips under it.
4. Click or tap a chip.
5. The project opens at the file and page, or the old chat opens and scrolls to the message.

**What the person sees and gets**

- Project page with file preview at the page (apps/web/features/projects/components/SourcesPanel.tsx:164-168, 846).
- Old chat scrolled to the message and flashed (apps/web/features/chat/pages/WebChatPage.tsx:5088-5112).
- Labels 'Project file <name>, p. 12' and 'Open the source conversation <title>, <date>'.

**Settings**

- none found in the code for the chips.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The contract parses an untrusted list of project sources, keeps at most 8, clips names to 200 and passages to 160 characters (packages/contracts/types/src/project-file-citations.ts:29-35, 66-84).
- An anchor is a page number, or a heading trail cut to the last 3 segments of up to 60 characters each; a valid page wins over a heading trail (project-file-citations.ts:44-60).
- Anchor text is 'p. N' or the trail joined by ' › ' (project-file-citations.ts:86-93).
- Two citations for the same file and place become one chip (project-file-citations.ts:95-113).
- Href is /chat/projects/<projectId>?knowledgeFile=<fileId>&page=<n>; no project or file id gives no link (project-file-citations.ts:117-150).
- A chip without a link is a note (ProjectFileCitationChip.tsx:56).
- A chip whose location is named in the answer text comes first (project-file-citations.ts:152-165).
- Past-chat link is /chat/<conversationId>?highlightMessage=<messageId> (CitationPastChats.tsx:11-14); the chat page scrolls and flashes that message (WebChatPage.tsx:5088-5112).
- The server sends sources in a base64 JSON response header, capped at 6000 characters, dropping snippets if too long (apps/web/lib/chat-project-sources.ts:21-40; free-quota-turn.ts:1320 for the past-chat header).
- The server builds page markers and heading anchors from file text (apps/web/lib/server/project-knowledge-anchors.ts:34, 77).
- Mobile has both chips and deep links to projects and chats (ProjectFileCitations.tsx; PastChatCitations.tsx; apps/mobile/app/(app)/projects/[id].tsx and chat/[id].tsx use the param names).

**Incomplete**

- The brief marks Mobile missing for S36.09 and S36.14, but the code has both chips with deep links; brief and code disagree.
- The page deep link on Mobile: the route file references the file param, but how the page param opens the file was not read.
- Desktop Tauri path: not established.

**Present but disconnected or switched off**

- none found.

**Not available**

- CLI, VS Code and Chrome have no project-file or past-chat chips (no code found in apps/cli, apps/extension-vscode, apps/extension for these types in the files searched).

## 4. Required behaviour

**Established requirements**

- Citations to paginated documents name the page and open the source at that page. (source: S36.09)
- Citations to earlier chats link to the exact message. (source: S36.14)
- Citations resolve to the file page or line and an accessible destination. (source: doc: docs/product/competitive-guidance.md:283)
- Research citations resolve to the material supporting the claim. (source: doc: docs/product/experience-contract.md:781)

**Acceptance criteria**

1. A source with fileName, fileId, projectId and page 12 shows 'p. 12' and links to the project with knowledgeFile and page=12.
2. A source without projectId is a non-link note.
3. A heading trail of five segments shows only the last three.
4. Three citations to the same file and page show as one chip.
5. A past-chat chip opens the chat and the message is scrolled into view.
6. More than 8 project sources show only 8.
7. On Mobile, a file chip with no target and no snippet is disabled.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The page is opened by the project page's file viewer because it reads the page param (SourcesPanel.tsx:168, 846) [inferred].
- Only Cloud (our servers) produces these headers today, because the code that builds them is in the web server [inferred from free-quota-turn.ts:1320].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Correct the brief rows for Mobile S36.09 and S36.14.
- [proposed] Add chips to Chrome and VS Code if they get Projects.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | ProjectFileCitation contract | `packages/contracts/types/src/project-file-citations.ts` | Types, parsing, anchor format, dedupe, href, ordering. |
| schema | PastChatCitation contract | `packages/contracts/types/src/past-chat-citations.ts` | Type, header name, metadata key, highlight param, date format. |
| component | ProjectFileCitations (web) | `packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx` | Chip and hover card. |
| component | CitationPastChats | `apps/web/features/chat/components/messages/CitationPastChats.tsx` | Past-chat nav and href. |
| component | Web MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Mounts both groups (3577-3587). |
| component | SourcesPanel | `apps/web/features/projects/components/SourcesPanel.tsx` | Reads knowledgeFile and page from URL (164-168). |
| component | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Scrolls to and highlights the message (5088-5112). |
| service | chat-project-sources | `apps/web/lib/chat-project-sources.ts` | Encodes and decodes the response header. |
| service | project-knowledge-anchors | `apps/web/lib/server/project-knowledge-anchors.ts` | Page markers and heading anchors from file text. |
| service | free-quota-turn | `apps/web/lib/server/free-quota-turn.ts` | Sets the past-chat citations header (1172, 1320). |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Carries pastChatSources and project sources in a turn (1572, 4335). |
| service | assistant-turn-persistence | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts` | Saves project sources with the assistant message. |
| service | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Reads the headers into message metadata. |
| component | ProjectFileCitations (mobile) | `apps/mobile/src/features/chat/components/ProjectFileCitations.tsx` | Chip, alert, route to project. |
| component | PastChatCitations (mobile) | `apps/mobile/src/features/chat/components/PastChatCitations.tsx` | Chip that routes to the chat. |
| service | referenceCitations (mobile) | `apps/mobile/src/features/chat/utils/referenceCitations.ts` | Reads the two headers from the stream response. |
| component | Mobile MessageBubble | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Mounts the chips after streaming (2767-2771). |
| event | X-AGI-Project-Sources and x-agi-past-chat-citations headers | `packages/contracts/types/src/project-file-citations.ts` | Response header names (PROJECT_FILE_CITATIONS_HEADER line 27; past chat in past-chat-citations.ts:9). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Before the first token the server picks project passages and past-chat messages for the turn. | our servers | apps/web/lib/chat-project-sources.ts:15-20 (comment); request-processor.ts:4335 |
| The server encodes the sources as base64 JSON in a response header. | our servers | chat-project-sources.ts:23-40; free-quota-turn.ts:1320 |
| The client reads the header and stores the list in message metadata (projectSources, pastChatSources). | device | useChatStream.ts; apps/mobile/src/features/chat/utils/referenceCitations.ts:26-46 |
| The client parses and bounds the list, dedupes and draws chips. | device | project-file-citations.ts:66-113 |
| A click opens the project or chat route; the page reads the params and shows the file page or the message. | device | SourcesPanel.tsx:164-168; WebChatPage.tsx:5088-5112 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| projectSources and pastChatSources on the assistant message | Message metadata; project sources persisted by the turn persistence service | follows the chat | follows the chat; no separate rule found |
| Heading and page anchors of project files | Built from file text on the server; the table was not traced | unknown | unknown |

**Models and providers.** The model does not write these chips. The server chooses passages by retrieval; which embedding or search model it uses was not traced. The chips work with any chat model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Needs a signed-in account because Projects and chats are user data; the exact check is in the server code not read here. |
| Permissions | The link only works for someone who can open that project or chat; enforcement is in the routes, not in the chip. |
| Subscription | none found in the chip code. Any plan limit on Projects is covered by other features. |
| Limits and metering | At most 8 project sources per answer; names 200 characters, passages 160, heading segments 3 of 60 characters; header text limit 6000 characters (project-file-citations.ts:29-35; chat-project-sources.ts:21). |
| Feature flags | none found in the code for the chips. |
| Model compatibility | Model neutral. |
| Provider restrictions | none found in the code. |
| Local mode | The chips are drawn on the device. The sources are produced by our servers' chat route, so a Local turn that does not go through it would have none. Whether Local mode has project retrieval: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No project or file id | Non-link note chip. | ProjectFileCitationChip.tsx:56 |
| No anchor | File name only. | project-file-citations.ts:86-93 |
| Bad header on Mobile | Ignored, empty list. | referenceCitations.ts:26-34 |
| Streaming | Mobile shows chips only after streaming ends. | apps/mobile/src/features/chat/components/MessageBubble.tsx:2767-2771 |
| Header too large | Passages dropped first. | chat-project-sources.ts:34-40 |
| Cited message no longer exists on open | not handled in the code beyond the scroll attempt; the exact miss behaviour was not read. | apps/web/features/chat/pages/WebChatPage.tsx:5092-5112 (only the found-case is read) |
| Accessibility | Group labels and per-chip labels; file chip without link has role note. | ProjectFileCitationChip.tsx:56, 100-103 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.test.tsx`: Project file chip (by file name).
- `packages/contracts/types/src/__tests__/project-file-citation-links.test.ts`: Link building from citations (by file name).
- `packages/contracts/types/src/__tests__/past-chat-citations.test.ts`: Past chat parsing (by file name).
- `apps/web/features/chat/components/messages/__tests__/CitationPastChats.test.tsx`: Web past-chat chips (by file name).
- `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.project-sources.test.ts`: Saving project sources with the message (by file name).
- `apps/mobile/__tests__/ProjectFileCitations.test.tsx`: Mobile project chips (by file name).
- `apps/mobile/__tests__/PastChatCitations.test.tsx`: Mobile past-chat chips (by file name).
- `apps/mobile/src/features/projects/__tests__/ProjectCitationDeepLink.test.tsx`: Mobile project deep link (by file name).

**Test scenarios**

- **Page link**
  1. In a Project with a PDF, ask about page 12.
  2. Click the chip.
  - Expected: Project page opens with the file at page 12.
- **No ids**
  1. Feed a citation with only fileName.
  - Expected: Chip shows as a note and is not a link.
- **Heading trail**
  1. Feed an anchor with 5 headings.
  - Expected: Chip shows the last 3 joined by ›.
- **Past chat**
  1. Ask something that recalls an old chat.
  2. Click the chat chip.
  - Expected: Old chat opens and the message flashes.
- **Mobile alert**
  1. Tap a file chip on Mobile.
  - Expected: Alert shows location and passage; Open file routes to the project.
- **Oversize header**
  1. Send 8 sources with long passages.
  - Expected: Chips remain; passages may be missing.

**Where to look when it fails**

- Response header X-AGI-Project-Sources and x-agi-past-chat-citations.
- Message metadata keys projectSources and pastChatSources.
- URL params knowledgeFile, page, highlightMessage.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/036-sources-and-grounding-interface.md](../../70-qa/test-plans/web/036-sources-and-grounding-interface.md)
- Desktop: [70-qa/test-plans/desktop/036-sources-and-grounding-interface.md](../../70-qa/test-plans/desktop/036-sources-and-grounding-interface.md)
- Mobile: [70-qa/test-plans/mobile/036-sources-and-grounding-interface.md](../../70-qa/test-plans/mobile/036-sources-and-grounding-interface.md)

## 10. Gaps and dependencies

- **Brief says Mobile missing; code has it** Affects: Planning. Evidence: ProjectFileCitations.tsx; PastChatCitations.tsx. Work needed: Update brief.
- **No locator on CLI, VS Code, Chrome** Affects: those users. Evidence: no code found. Work needed: Decide whether they need Projects first.
- **Mobile page opening not confirmed** Affects: Mobile users. Evidence: route reads params; viewer not read. Work needed: Read ProjectSourcesViewer and test.
- **Tauri desktop not established** Affects: Tauri build. Evidence: doc: AGENTS.md section 5. Work needed: Check or record as out of scope.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- mode:cloud
- file:packages/contracts/types/src/project-file-citations.ts
- file:packages/contracts/types/src/past-chat-citations.ts

## Unknown

- Which database tables hold project file anchors.
- Whether Local mode has project retrieval.
- The exact HTTP method and route for the header (not opened).
- How Mobile opens the cited page.
- Behaviour when the cited message no longer exists.
- Test contents not opened.
