---
id: "F016-02"
type: "feature"
title: "Message text, attachments and context chips"
aliases: ["Message text, attachments and context chips", "Attachment group (S16.03)", "Source and context chips (S16.04)", "Context sent with this message", "Sent context"]
area: "16 User-message components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S16.02", "S16.03", "S16.04"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-files-artifacts-and-storage", "SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "api:POST /api/llm/v1/chat/completions", "mode:local", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F016-02 Message text, attachments and context chips

Shows what a sent message carried: its text, then any files and images, then chips for non-file context such as a skill, a connector prompt or connector resources. Web shows image thumbnails that open a lightbox. Each app shows a different subset; mobile, CLI, VS Code and Chrome have their own versions.

Area: [16. User-message components](README.md). Requirement items: [S16.02](../../10-requirements/capabilities/016-user-message-components.md#s1602), [S16.03](../../10-requirements/capabilities/016-user-message-components.md#s1603), [S16.04](../../10-requirements/capabilities/016-user-message-components.md#s1604).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (1 of 3) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Displays the sent text, the files and images that went with it (image thumbnails, file chips with name and size) and chips for context that is not a file. On web those chips list a skill as '/name', a connector prompt as 'Prompt: name' and connector resources as 'Resource: name' (apps/web/features/chat/components/messages/MessageContextChips.tsx:17-57).

**Why it exists.** So a person can check, after sending, exactly what the assistant received: briefs S16.02 to S16.04 require text, attachments and non-file context to be visible on the sent message.

**Who uses it.** Anyone who attaches files, uses skills or connectors, or reviews a past chat.

**Problems it solves**

- Not knowing which files or context the answer was based on.
- A broken-image icon when an attachment URL no longer loads.
- Silent loss when a long file was only partly read.

**Use cases**

- Attach a photo, send, then click the thumbnail to see it full size.
- Send a message using a skill and see the '/skill' chip.
- Send with a connector prompt and see 'Prompt: name' with the connector named for screen readers.
- Attach a very long document and read the note that only part of it was read.

## 2. User experience

**Where to find it**

- Web (and the public Electron desktop window): on the sent message bubble.
- Mobile: on the sent bubble; images and files, a quoted-reply chip and a 'Skill: name' chip (apps/mobile/src/features/chat/components/MessageBubble.tsx:2290-2291, 2310-2340).
- Internal Tauri desktop: file cards with name, type, size and a Download button inside a list labelled 'Message attachments' (packages/ui/unified-chat/src/components/MessageBubble.tsx:493-585).
- CLI: a muted line under the prompt reading 'with <context>' and, before sending, a chip line starting with the paperclip (apps/cli/src/tui/tui_app.rs:3269-3280, 8148-8153).
- VS Code: attachment chips and a 'Context (n)' details block on the message (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5620-5660).
- Chrome: a list labelled 'Sent with this message' with image thumbnails, file names and page links (apps/extension/src/features/side-panel/bubbles.ts:405-447).

**Before you start**

- Send a message with an attachment, skill, or connector prompt or resource.

**Screens and controls**

- Web image thumbnail: a 96px square button labelled 'View <name> full size' that opens the lightbox (MessageBubble.tsx:3060-3085).
- Web file chip: a link showing name and, when known, size; PDFs open in a new tab, other files download (MessageBubble.tsx:3090-3135).
- Web context chips list labelled 'Context sent with this message' (MessageContextChips.tsx:26-31).
- Web 'Show more' / 'Show less' button for long user text (MessageBubble.tsx:2943-2952).

**Journey**

1. Attach files and/or pick a skill or connector prompt in the composer.
2. Send.
3. The bubble shows the text first, then thumbnails or file chips, then context chips.
4. Click a thumbnail to open it in the lightbox; use Esc or the backdrop to close.
5. If a file was only partly read, a status line appears under the bubble.

**What the person sees and gets**

- If an image fails to load a named chip with an image-off icon replaces it (MessageBubble.tsx:3017-3033).
- Truncation note: 'Only part of <file> was read because it is too long to read in full.' (packages/contracts/cloud-contracts/src/chat-attachment-truncation.ts:50-56)
- Mobile: tapping an unavailable image shows an alert '<name> is no longer available' (MessageBubble.tsx:646-651).

**Settings**

- None found in the code for how attachments or chips display.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: attachments render as thumbnails (images) or links (files); lightbox via ImageLightbox; broken images become named chips (apps/web/features/chat/components/messages/MessageBubble.tsx:3000-3191).
- Web: context chips for skill, connector prompt and connector resources, and nothing when there is none (MessageContextChips.tsx:21-22).
- Web: truncation note read from a response header and written onto the user message (apps/web/lib/hooks/useChatStream.ts:4701-4706; MessageBubble.tsx:3137-3146).
- Web: 'Shared files were not copied' note for shared attachments (MessageBubble.tsx:2980-2992).
- Mobile: image and file attachments, a quote chip and a skill chip (apps/mobile/src/features/chat/components/MessageBubble.tsx:1969-1970, 2290-2291, 2310-2340).
- Tauri desktop shared bubble: file cards with Download and an error line 'Download failed. Try again.' (packages/ui/unified-chat/src/components/MessageBubble.tsx:493-585).
- CLI: a 'with ...' detail row after the user line (apps/cli/src/tui/tui_app.rs:8148-8153).
- VS Code: 'Context (n)' details with previews and 'Preview shortened.' (webviewContent.ts:5620-5660).
- Chrome: image thumbnails (open in a viewer), file name chips, and page links (bubbles.ts:405-447).

**Incomplete**

- Web has no chip for quoted text, editor selection, page or @mentions, although the brief's 'Should' lists them (MessageContextChips.tsx props are only mcpContext and skillName).
- Mobile shows no connector prompt or resource chips; I found no mcpContext use in its bubble.
- Chrome thumbnails use previews held for the current session (turnPayloadByMessageId); after a reload they fall back to a name chip [inferred from side_panel.ts:5967-5972].

**Present but disconnected or switched off**

- none found

**Not available**

- Thumbnails and lightbox in the Tauri shared bubble: images show as a file card with an icon only (packages/ui/unified-chat/src/components/MessageBubble.tsx:522-570).
- Context chips in the CLI and Tauri shared bubble beyond the single 'with ...' line (CLI) / none (shared bubble).

## 4. Required behaviour

**Established requirements**

- The text the user sent is shown in their message in the transcript. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S16.02)
- Files and images sent with a user turn are listed on that message (thumbnail or named chip) after sending. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S16.03)
- A sent user message shows chips for the non-file context it carried (quoted text, connector/MCP resources, page, editor selection, @mentions). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S16.04)
- Every chat surface should support or explicitly gate attaching files and images and referencing sources. (source: docs/product/requirements.md section 6.2)

**Acceptance criteria**

1. Web: sending an image shows a 96px thumbnail that opens a lightbox; Esc closes it.
2. Web: an image whose URL fails shows a chip with the file name, never a broken-image icon.
3. Web: a PDF chip opens in a new tab; a non-image, non-PDF file chip downloads.
4. Web: a message sent with a skill shows a '/name' chip inside a list labelled 'Context sent with this message'; a message with no context renders no list.
5. Web: a connector prompt shows 'Prompt: name' and a screen reader also hears the connector name.
6. Web: a long file that was only partly read produces the 'Only part of ... was read' status line under the bubble.
7. Mobile: a sent skill shows 'Skill: name' and a quoted reply shows a quote chip.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Chips should be keyboard reachable; on web they are plain list items, not buttons, so they are read-only [inferred].
- Text-only messages should render with no empty attachment area [inferred from displayAttachments.length > 0 guard].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add chips for quoted text, editor selection and @mentions on web, as the brief describes.
- [proposed] Show connector prompt/resource chips on mobile for parity.
- [proposed] Give the shared Tauri bubble thumbnails and a lightbox.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Renders text, attachment thumbnails, file chips, lightbox, truncation note, context chips. |
| component | MessageContextChips | `apps/web/features/chat/components/messages/MessageContextChips.tsx` | Skill, connector prompt and connector resource chips. |
| component | ImageLightbox | `apps/web/features/chat/components/ImageLightbox.tsx` | Full-size image viewer opened from a thumbnail (imported at MessageBubble.tsx:268; path inferred from the relative import). |
| service | describeAttachmentTruncation | `packages/contracts/cloud-contracts/src/chat-attachment-truncation.ts` | Builds the truncation note and reads/writes the response header. |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Creates the user message with attachments and metadata, and stores truncatedAttachments from the response header. |
| component | ChatMessageList | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Hands each message to the bubble. |
| service | mcp-context-summary | `apps/web/features/chat/lib/mcp-context-summary.ts` | Builds the connector context summary used for the sent message (named in the brief for S16.04). |
| component | MessageBubble (shared UI) | `packages/ui/unified-chat/src/components/MessageBubble.tsx` | UserMessageAttachments file cards with Download, for the Tauri desktop chat. |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Image/file attachments, SentContextChip for quote and skill. |
| store | chatExecutionStore (mobile) | `apps/mobile/stores/chat/chatExecutionStore.ts` | Builds the sent user message with attachments. |
| service | TUI turn push | `apps/cli/src/tui/tui_app.rs` | Pushes the user line and the 'with ...' detail row; draws the staged attachment chip line. |
| component | Sidebar webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | renderAcceptedContext and attachment chips in VS Code. |
| component | Side-panel bubbles (Chrome) | `apps/extension/src/features/side-panel/bubbles.ts` | buildUserContext: thumbnails, file chips, page links. |
| endpoint | Chat completions route | `apps/web/app/api/llm/v1/chat/completions` | Server route the web send posts to; its response header carries the truncated-attachment list. |
| test | MessageBubble tests | `apps/web/features/chat/components/messages/MessageBubble.test.tsx` | Thumbnail, lightbox and file-chip tests (lines 1807-1849). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| On send, the web hook adds the user message (text, attachments, metadata) to the local store right away, before the network answers. | device | apps/web/lib/hooks/useChatStream.ts:4298-4312 |
| The request is posted to the chat completions endpoint; for a Local model the turn stays on the device and never reaches that route. | device and our servers | apps/web/lib/hooks/useChatStream.ts:4160-4163 (comment on Local), 4701-4706 |
| The server reports files it only partly read in a response header; the page writes the names onto the user message. | our servers | apps/web/lib/hooks/useChatStream.ts:4701-4706; packages/contracts/cloud-contracts/src/chat-attachment-truncation.ts:30-48 |
| The bubble draws thumbnails or chips from message.attachments and chips from metadata.mcpContext and metadata.sendReplay.skillName. | device | apps/web/features/chat/components/messages/MessageBubble.tsx:3131-3135 |
| A click on a thumbnail opens the lightbox; an image error marks that attachment broken and swaps in a named chip. | device | MessageBubble.tsx:3017-3033, 3186-3191 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Attachments (name, type, size, URL, thumbnail URL) and metadata (mcpContext, sendReplay.skillName, truncatedAttachments) on the user message | Chat store on the device; saved with the conversation message rows on our servers for cloud chats | Yes for cloud conversations; Local-model turns stay on the device [inferred from useChatStream.ts:4160-4163] | Follows the message; deleting a message removes it. Retention rules for attachment files: unknown |

**Models and providers.** The bubble is model independent. But which model a free-plan turn runs on can depend on attachments, skills and connector context, because they are passed to the free-model router (apps/web/lib/hooks/useChatStream.ts:4166-4177).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sending needs an auth token on web (useChatStream.ts shows 'Not authenticated' when the token is missing). Showing already-sent attachments needs no extra rule found. |
| Permissions | Attachment URLs are fetched by the browser; access control for the file URLs: unknown. |
| Subscription | No entitlement check on the display. Whether a plan allows attaching or connectors is decided in the composer and server (not read here). |
| Limits and metering | File read-length limits exist server-side and are reported as truncation (chat-attachment-truncation.ts:50-56). Numeric limits: unknown. |
| Feature flags | none found in the code for the display. |
| Model compatibility | A model that cannot read images is a composer and server concern; not decided in the bubble. |
| Provider restrictions | none found in the code |
| Local mode | Local-model turns run on the device and do not reach the completions route, so the server truncation header does not apply (useChatStream.ts:4160-4163). How a Local turn reports a partly read file: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Image fails to load | Named chip with an image-off icon; the lightbox skips it. | MessageBubble.tsx:3017-3033, 1894-1905 |
| No attachments and no context | Nothing extra renders; chips list returns null. | MessageContextChips.tsx:21-22; MessageBubble.tsx displayAttachments.length > 0 guard |
| Size unknown | The size line is hidden. | MessageBubble.tsx:3120-3130 |
| Attachment partly read | A status paragraph under the bubble. | MessageBubble.tsx:3137-3146 |
| Mobile image gone | Tap shows an alert that the file is no longer available. | apps/mobile/src/features/chat/components/MessageBubble.tsx:646-651 |
| Tauri download fails | Alert text 'Download failed. Try again.' under the card. | packages/ui/unified-chat/src/components/MessageBubble.tsx:520-528 |
| Offline | not handled in the code for the display itself | No offline branch in apps/web/features/chat/components/messages/MessageBubble.tsx:3000-3191 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/MessageBubble.test.tsx`: Image attachment renders as a clickable thumbnail; thumbnail opens the lightbox; non-image attachment stays an icon+name link; non-previewable files download (lines 1807-1849).
- `apps/web/features/chat/components/__tests__/ImageLightbox.test.tsx`: The lightbox component.
- `apps/extension/__tests__/side-panel-bubbles.test.ts`: User bubble rendering in Chrome (line 142); attachment-specific cases: unknown.

**Test scenarios**

- **Thumbnail and lightbox**
  1. On web attach a photo and send.
  2. Click the thumbnail.
  3. Press Esc.
  - Expected: Lightbox opens at full size and closes with Esc.
- **Broken image**
  1. Open a chat whose image URL now returns an error.
  - Expected: A chip with the file name shows, no broken-image glyph.
- **Skill and connector chips**
  1. Send with a skill selected, then another message with a connector prompt.
  - Expected: '/skill' chip, then 'Prompt: name' chip; list labelled 'Context sent with this message'.
- **Partly read file**
  1. Attach a very long document and send.
  - Expected: A line 'Only part of <file> was read because it is too long to read in full.'
- **Mobile skill and quote**
  1. On mobile send a quoted reply, then a message using a skill.
  - Expected: Quote chip, then 'Skill: name' chip.

**Where to look when it fails**

- Check metadata.mcpContext and metadata.sendReplay.skillName on the message in the store.
- Look for the truncation response header name exported from packages/contracts/cloud-contracts/src/chat-attachment-truncation.ts.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/016-user-message-components.md](../../70-qa/test-plans/web/016-user-message-components.md)
- Desktop: [70-qa/test-plans/desktop/016-user-message-components.md](../../70-qa/test-plans/desktop/016-user-message-components.md)
- Mobile: [70-qa/test-plans/mobile/016-user-message-components.md](../../70-qa/test-plans/mobile/016-user-message-components.md)
- CLI: [70-qa/test-plans/cli/016-user-message-components.md](../../70-qa/test-plans/cli/016-user-message-components.md)
- VS Code: [70-qa/test-plans/vscode/016-user-message-components.md](../../70-qa/test-plans/vscode/016-user-message-components.md)
- Chrome: [70-qa/test-plans/chrome/016-user-message-components.md](../../70-qa/test-plans/chrome/016-user-message-components.md)

## 10. Gaps and dependencies

- **No chips for quoted text, editor selection, page or @mentions on web** Affects: Web, Electron desktop. Evidence: apps/web/features/chat/components/messages/MessageContextChips.tsx props are mcpContext and skillName only. Work needed: Extend metadata and chips, or reduce the brief's Should.
- **Mobile has no connector prompt/resource chips** Affects: Mobile. Evidence: No mcpContext reference in apps/mobile/src/features/chat/components/MessageBubble.tsx. Work needed: Pass connector context into the mobile bubble and render chips.
- **Tauri shared bubble shows no thumbnails, lightbox or context chips** Affects: Internal Tauri desktop. Evidence: packages/ui/unified-chat/src/components/MessageBubble.tsx:493-585. Work needed: Port the web thumbnail and chip behaviour or retire the shell.
- **Brief marks CLI as done for context chips but CLI shows one muted 'with ...' line** Affects: CLI. Evidence: apps/cli/src/tui/tui_app.rs:8148-8153. Work needed: Decide whether a text line meets the 'chips' requirement.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-files-artifacts-and-storage
- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- api:POST /api/llm/v1/chat/completions
- mode:local
- mode:cloud

## Unknown

- Whether the Tauri desktop passes attachments to the shared bubble for images in practice.
- How a Local-model turn reports a partly read attachment.
- Where web attachment files are stored and for how long (storage code not read).
- Whether the lightbox file lives at apps/web/features/chat/components/ImageLightbox.tsx (path inferred from the import '../ImageLightbox' in MessageBubble.tsx:268).
