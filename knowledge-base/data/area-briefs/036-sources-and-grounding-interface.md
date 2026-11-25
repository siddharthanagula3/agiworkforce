# Area 36. Sources and grounding interface

25 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S36.01 Citation marker.
- Should: Claims in an answer carry an inline citation marker that identifies the source.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:135; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:275; apps/web/features/chat/components/messages/MessageBubble.tsx:2082; apps/mobile/src/features/chat/components/MessageBubble.tsx:1030; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:218

## S36.02 Source title.
- Should: Each cited source shows its title.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:101; apps/web/features/chat/components/research/ResearchPanel.tsx:134; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:275; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:42; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:31; apps/extension/src/features/side-panel/sources.ts:31

## S36.03 Publisher or provider.
- Should: Each cited source shows its publisher or provider (site name/domain).
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:42; packages/ui/unified-chat/src/components/markdown/citationPublisher.ts:48; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:275; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:42; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:27; apps/extension/src/features/side-panel/sources.ts:11; apps/extension/src/features/side-panel/sources.ts:28

## S36.04 Source URL or resource identifier.
- Should: Each cited source exposes its URL or resource identifier and can be opened.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:152; apps/web/features/chat/components/research/ResearchPanel.tsx:103; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:275; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:39; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:31; apps/cli/src/markdown.rs:629; apps/cli/src/claude_parity.rs:973; apps/cli/src/tui/tui_app.rs:4444

## S36.05 Publication date.
- Should: Cited sources show their publication date when known.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:58; apps/web/features/chat/components/research/ResearchPanel.tsx:86; apps/web/lib/web-search/web-search-tool.ts:353; apps/mobile/src/features/chat/components/CitationChip.tsx:34; apps/mobile/src/features/research/ReportsScreen.tsx:132

## S36.06 Retrieval date.
- Should: Cited sources show when they were retrieved/accessed.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:801; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:823; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:551; apps/web/lib/hooks/useChatStream.ts:3780; apps/mobile/src/features/research/ReportsScreen.tsx:261; apps/mobile/src/features/research/service.ts:52

## S36.07 Source-type icon.
- Should: Each source shows an icon for its type (web page, file, chat, connector...).
- Status: web done, desktop done, mobile done, cli missing, vscode missing
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:70; packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx:31; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:275; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:45; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:90

## S36.08 Quoted supporting excerpt.
- Should: A cited source shows the quoted excerpt that supports the claim.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:125; packages/contracts/types/src/project-file-citations.ts:21; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:275; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:77; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:31

## S36.09 Page-number locator.
- Should: Citations to paginated documents name the page and open the source at that page.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx:15; apps/web/features/projects/components/SourcesPanel.tsx:105; packages/contracts/types/src/project-file-citations.ts:86

## S36.10 Line-range locator.
- Should: Citations to text/code name a line range and open the source at those lines.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S36.11 Spreadsheet-cell locator.
- Should: Citations to spreadsheets name the sheet/cell range.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S36.12 Slide locator.
- Should: Citations to slide decks name the slide number.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S36.13 Audio/video timestamp locator.
- Should: Citations to audio/video name a timestamp and open the media there.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S36.14 Message/thread locator.
- Should: Citations to earlier chats/messages link to the exact message.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/CitationPastChats.tsx:7; apps/web/features/chat/components/messages/CitationPastChats.tsx:29; apps/web/features/chat/pages/WebChatPage.tsx:3928

## S36.15 Highlighted passage in source viewer.
- Should: Opening a citation shows the source with the cited passage highlighted.
- Status: not applicable anywhere

## S36.16 Claim-to-source relationship.
- Should: Each citation sits at the claim it supports so the user can tell which source backs which claim.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:242; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:275; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:155; apps/mobile/src/features/chat/components/MessageBubble.tsx:1030; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:218

## S36.17 Multiple sources per claim.
- Should: A single claim can cite several sources and the user can see all of them.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:167; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:182; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:275

## S36.18 Conflicting-source presentation.
- Should: When sources conflict, the answer presents the disagreement with each side's sources.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S36.19 Unavailable-source notice.
- Should: When a cited source cannot be opened or was not captured, the product says so instead of showing a dead link.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchReportView.tsx:685; apps/web/features/chat/components/research/ResearchReportView.tsx:345; apps/web/features/chat/components/messages/MessageBubble.tsx:2765; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:30; apps/mobile/src/features/chat/components/CitationChip.tsx:17

## S36.20 Restricted-source notice.
- Should: When a cited source is restricted (no access/permission), the citation says so.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S36.21 Stale-source notice.
- Should: When a cited source is old or may have changed, a stale-source notice is shown.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S36.22 Source correction.
- Should: The user can flag or correct a wrong citation and have the correction applied.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S36.23 Source replacement.
- Should: The user can replace a cited source with another and get the answer updated.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S36.24 User-controlled evidence set.
- Should: The user controls the set of evidence an answer may use (add, pin, remove sources) and the answer respects it.
- Status: not applicable anywhere

## S36.25 Citation-preserving export.
- Should: Exporting an answer/report keeps its citations and source list.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchReportView.tsx:68; apps/web/features/chat/components/research/ResearchReportView.tsx:377; apps/web/features/chat/components/research/ResearchReportView.tsx:273
