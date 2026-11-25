---
id: "F074-03"
type: "feature"
title: "Ask about the page, summaries and videos"
aliases: ["Ask about this page", "Summarize this page", "Summarize video", "Key timestamps", "Page assistant overlay", "In-page panel", "S74.06", "S74.07", "S74.08", "/summarize"]
area: "74 Browser extension"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S74.06", "S74.07", "S74.08"]
depends_on: ["surface:chrome", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-voice-and-media", "F074-06", "api:POST /api/llm/v1/chat/completions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F074-03 Ask about the page, summaries and videos

In the Chrome extension the person can attach the current page and ask about it, or run Summarize this page, from the side panel or right-click menu. On approved sites an in-page panel offers quick chips, and on YouTube watch pages it summarises a video from its captions. Answers come from AGI Managed Cloud.

Area: [74. Browser extension](README.md). Requirement items: [S74.06](../../10-requirements/capabilities/074-browser-extension.md#s7406), [S74.07](../../10-requirements/capabilities/074-browser-extension.md#s7407), [S74.08](../../10-requirements/capabilities/074-browser-extension.md#s7408).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Reads the visible text of the current tab, bounds and redacts it, and sends it with the person's question. Offers a one-click page summary. On YouTube watch pages the in-page panel reads the video's captions and asks for a summary, key timestamps or Q&A. (apps/extension/src/side_panel.ts:6486-6537; apps/extension/src/features/content/in-page-panel/pageActions.ts:58-124)

**Why it exists.** Brief items S74.06 (ask about the current page), S74.07 (one action summarises the page) and S74.08 (ask about a video, answer uses its content). (doc: knowledge-base/data/area-briefs/074-browser-extension.md)

**Who uses it.** Chrome extension users reading articles, documents or videos.

**Problems it solves**

- No need to paste a page into a chat.
- Long pages and videos can be summarised in one click.
- The person sees and can remove what was attached.

**Use cases**

- Right-click a page and choose 'Summarize this page'.
- Attach the page from the plus menu and ask a specific question.
- Open a YouTube video and press 'Summarize video' in the in-page panel.
- Ask 'Key timestamps' for a long talk.

## 2. User experience

**Where to find it**

- surface:chrome side panel: plus (attach) menu item 'Add the browser page', which becomes 'Browser page added' once attached (apps/extension/_locales/en/messages.json:768-775).
- surface:chrome right-click on the page: 'Ask AGI about this page' and 'Summarize this page' (messages.json:45-52).
- surface:chrome slash command /summarize ('Key points and main arguments of this page') (apps/extension/src/features/side-panel/pageCommands.ts:12-18).
- surface:chrome in-page panel on approved sites: launcher button labelled 'Open AGI' with chips Summarize, Key points, Q&A, Translate; on YouTube watch pages 'Summarize video', 'Key timestamps', 'Q&A' (features/content/in-page-panel/launcher.ts:114; pageActions.ts:31-88).
- In-page composer placeholder 'Ask one question about this page…' (panel.ts:138).

**Before you start**

- Signed-in AGI account with chat ready (side_panel.ts:723-726).
- An ordinary http or https page, not a Chrome-internal page (side_panel.ts:6402-6404).
- Chrome site access for the page; if missing the person is asked (see F074-06).
- For the in-page panel and video summary: the site is approved in Options and the 'Page assistant overlay' setting is on (apps/extension/src/background.ts:5562-5575; features/options/preference-rows.ts:10-70).
- For video: a YouTube watch page (www.youtube.com or youtube.com, path /watch with v) with captions (pageActions.ts:93-104).

**Screens and controls**

- Plus menu items for page and tabs.
- Page chip with title, 'Snapshot · host' line, 'Refresh' button and a remove x (side_panel.ts:10651-10716).
- In-page panel: chips, textarea, 'Open in side panel' button, settings button (panel.ts:138-183).
- A disclosure line stating how many characters will be sent to AGI Managed Cloud (panel.ts:414-430).

**Journey**

1. Side panel: 1. Open the plus menu and choose 'Add the browser page'. 2. The page text is read and shown as a chip. 3. Type a question and send. 4. Read the answer.
2. Summarize: 1. Right-click and choose 'Summarize this page'. 2. The panel opens, attaches the page and sends the summary prompt itself (side_panel.ts:16400-16445).
3. Video: 1. On a YouTube watch page open the in-page panel. 2. Press 'Summarize video'. 3. The panel says 'Reading the video captions…'. 4. The summary streams in the panel (panel.ts:496-525).

**What the person sees and gets**

- Chip with the page title.
- Messages: 'This page is still loading. Wait for it to finish and try again.'; 'This page had no readable text to attach.'; 'Chrome does not let extensions read this page at all...' (side_panel.ts:6398-6408).
- Video messages: 'This video has no captions, so there is no transcript to read. Ask about the page instead.' and 'The video captions could not be read.' (panel.ts:515-519).
- Summary or answer text.

**Settings**

- 'Page assistant overlay' toggle in Options (messages.json:488-490; preference-rows.ts).
- Blocked sites and approved sites (see F074-06).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- capturePageContext reads the active tab text, refuses non-web pages, blocked sites and loading pages, and checks the page did not change during the read (side_panel.ts:6486-6537).
- Page text is cleaned and capped at 30,000 characters with an 'excerpt' notice when cut (pageActions.ts:22-24, 136-160).
- Right-click Ask attaches the page and waits; Summarize attaches and sends the summary prompt, or keeps both in the draft if chat is not ready (side_panel.ts:16400-16445).
- If a page read is refused for lack of site access, the panel asks Chrome for one-time access (side_panel.ts:6539-6558, 14735-14770).
- In-page panel actions: generic, GitHub pull request and YouTube sets (pageActions.ts:31-124).
- YouTube captions are read from the watch page and the transcript panel with a 15 second timeout (youtubeTranscript.ts:20-22, 250-313).
- In-page prompts are sent to Managed Cloud with model selection auto and cancelled when the page or panel goes away (background.ts:9112-9230).

**Incomplete**

- Video summary is available only in the in-page panel, not the side panel (youtubeTranscript.ts is imported only by panel.ts).
- Videos without captions are not supported; there is no fallback to audio. (panel.ts:513-520)

**Present but disconnected or switched off**

- In-page panel is off for unapproved sites or when the overlay setting is off (background.ts:5562-5575).

**Not available**

- Other apps; videos on sites other than YouTube; pages Chrome blocks (side_panel.ts:6402-6404).

## 4. Required behaviour

**Established requirements**

- The user asks a question about the current page from the extension. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.06)
- One action summarises the current page. (source: S74.07 (same brief))
- The user asks about a video on the page and the answer uses its content. (source: S74.08 (same brief))
- Page content is untrusted and must not enter global memory or synced chat by default. (source: doc: docs/product/requirements.md lines 1215-1218)

**Acceptance criteria**

1. 'Add the browser page' on a normal article shows a chip with the page title.
2. 'Summarize this page' sends the summary prompt with the page and a summary appears.
3. On a chrome:// page the attach is refused with the 'does not let extensions read this page' message.
4. On a page still loading the attach fails with the try-again message.
5. On a YouTube watch page with captions 'Summarize video' returns a summary of the video.
6. On a video without captions the panel says there are no captions.
7. Text over 30,000 characters is cut and marked as an excerpt.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The 'page content must not enter synced chat by default' rule is partly met because only chats whose every turn ran in Managed Cloud are mirrored; whether page text inside them is mirrored was not checked. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Read captions in the side panel too, so video summary does not depend on the in-page overlay.
- [proposed] Offer a fallback for videos with no captions.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | capturePageContext | `apps/extension/src/side_panel.ts` | Reads the active tab text with all checks (6486-6537). |
| service | readTabText | `apps/extension/src/side_panel.ts` | Reads and sanitises the tab text and builds the source (6560-6597). |
| service | capturePageContextWithSiteAccess | `apps/extension/src/side_panel.ts` | Asks for site access when a turn needs the page (6539-6558). |
| service | attachPageForQuestion | `apps/extension/src/side_panel.ts` | Handles right-click Ask and Summarize about the page (16400-16445). |
| component | Page-context menu item | `apps/extension/src/side_panel.ts` | The 'Add the browser page' attach item (14697-14790). |
| config | SLASH_COMMANDS | `apps/extension/src/features/side-panel/pageCommands.ts` | /summarize and other page commands (11-18). |
| service | boundPageText / truncatePageText | `apps/extension/src/features/content/in-page-panel/pageActions.ts` | 30,000 character cap and excerpt notice (22-24, 136-160). |
| config | getPageActions | `apps/extension/src/features/content/in-page-panel/pageActions.ts` | Chip sets for generic, GitHub pull request and YouTube pages (31-124). |
| component | In-page panel | `apps/extension/src/features/content/in-page-panel/panel.ts` | Chips, composer, caption action, side panel hand-off (351-711). |
| component | In-page launcher | `apps/extension/src/features/content/in-page-panel/launcher.ts` | Floating 'Open AGI' button. |
| service | readYouTubeTranscript | `apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts` | Finds caption tracks and reads the transcript (290-313). |
| service | IN_PAGE_PROMPT handler | `apps/extension/src/background.ts` | Runs in-page prompts through Managed Cloud (6060-6071, 9112-9230). |
| service | GET_PAGE_ACCESS | `apps/extension/src/background.ts` | Tells the content script if the site is approved and the overlay is on (5562-5575). |
| service | executeChromeManagedChat | `apps/extension/src/features/cloud-bridge/managedChatHandler.ts` | Sends the turn to Managed Cloud (called at background.ts:9150). |
| config | FREE_TRIAL_ENDPOINT | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Chat completion path /api/llm/v1/chat/completions (112). |
| config | IN_PAGE_PANEL_ENABLED_STORAGE_KEY | `apps/extension/src/features/options/preference-rows.ts` | Overlay on/off setting (10-70). |
| test | inPagePanel test | `apps/extension/__tests__/inPagePanel.test.ts` | Page actions including YouTube and GitHub chips (25 tests). |
| test | side-panel-page-context-capture test | `apps/extension/__tests__/side-panel-page-context-capture.test.ts` | Page capture behaviour (16 tests). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person attaches the page; the panel reads the tab text through Chrome scripting after checking blocklist, loading state and site access. | device | apps/extension/src/side_panel.ts:6486-6537 |
| Text is cleaned of secret-like patterns and capped at 30,000 characters. | device | features/content/in-page-panel/pageActions.ts:136-160; side_panel.ts:6564-6568 |
| On send, the page text and prompt go to AGI Managed Cloud, which chooses the model and streams back the answer. | our servers | apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; doc: apps/extension/docs/threat-model.md:23 |
| For video, the content script fetches the YouTube watch page and captions from YouTube itself, builds the transcript, then sends it as the page context. | outside service | apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts:250-313; panel.ts:496-525 |
| The answer is shown; in the in-page panel each answer replaces the last, in the side panel it is saved in the conversation. | device | panel.ts:422-430 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Page text snapshot (up to 30,000 characters) and page title/URL chip | In memory in the panel until sent; the sent message keeps page title and URL references in the saved conversation | With the conversation if mirrored (F074-05) | Snapshot cleared when removed or sent; saved references follow conversation retention (30 days local). |
| Video transcript | In memory only for the request | no, except as part of the sent prompt | not stored by the in-page panel [inferred] |

**Models and providers.** The extension has no model of its own. In-page prompts use automatic model selection on Managed Cloud; the side panel uses the person's picker. The extension never sends to a provider directly (apps/extension/src/background.ts:9150-9156; threat-model.md:23).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in to an AGI account for any answer. |
| Permissions | scripting, activeTab, tabs; Chrome host permission for the site is requested per site (apps/extension/manifest.json:11-24, 32). |
| Subscription | Admission, plan and quota are decided by our servers; the in-page panel maps plan_required and quota_exceeded (background.ts:9040-9044). Video-summary has no separate plan rule found. |
| Limits and metering | 30,000 characters of page text; 5 attachments; usage meter from /api/usage (freeTrialClient.ts:103, 116). |
| Feature flags | Overlay setting 'in_page_panel_enabled' (features/options/preference-rows.ts:10). |
| Model compatibility | unknown; no model check was found in the page-reading code. |
| Provider restrictions | Managed Cloud only (threat-model.md:23). |
| Local mode | No Local mode. The page read runs on the device, but the answer needs Managed Cloud. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Page loading | Attach fails with 'This page is still loading. Wait for it to finish and try again.' | apps/extension/src/side_panel.ts:6405-6407, 6508-6511 |
| Empty page | 'This page had no readable text to attach.' | side_panel.ts:6405 |
| Restricted page | Chrome-block message; attach button disabled. | side_panel.ts:6402-6404, 14782-14785 |
| No site access | Asks Chrome for access once; if refused, attach fails with the site-access message. | side_panel.ts:14735-14770 |
| Page changed during read | Refused with the page-changed message. | side_panel.ts:6410-6411, 6525-6532 |
| Chat not ready on Summarize | Page and prompt kept in the draft with a notice. | side_panel.ts:16435-16443 |
| No captions | Message says so and suggests asking about the page. | panel.ts:513-518 |
| Caption read error | Shows 'The video captions could not be read.' plus the reason. | panel.ts:519 |
| Large page (too many elements) | The in-page reader returns empty text. | panel.ts:392-394; dom-helpers.ts:3-5 |
| In-page request cancelled | Cancelled when the panel closes, the tab closes or the site loses approval. | background.ts:9086-9110; doc: threat-model.md:247 |
| Retry | Retryable failures carry retryable true. | background.ts:9025-9070 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/inPagePanel.test.ts`: getPageActions for YouTube, youtube.com without www, GitHub and generic pages (25 tests).
- `apps/extension/__tests__/in-page-panel-ui.test.ts`: In-page panel UI (25 tests, detail not read).
- `apps/extension/__tests__/in-page-panel-presence.test.ts`: Panel presence (4 tests).
- `apps/extension/__tests__/ask-about-page-menu.test.ts`: Right-click Ask about this page: attaches and waits; summarize sends the summary and clears the request; refused capture keeps a reason; refuses to replace a draft.
- `apps/extension/__tests__/side-panel-page-context-capture.test.ts`: Page context capture (16 tests).
- `apps/extension/__tests__/side-panel-restricted-page.test.ts`: Restricted page handling.
- `apps/extension/__tests__/page-selection.test.ts`: Selection reading (name only).

**Test scenarios**

- **Attach and ask**
  1. Sign in, open an article, open the panel.
  2. Plus menu then 'Add the browser page'.
  3. Ask a question about a detail.
  - Expected: A chip appears and the answer uses the page text.
- **Summarize from right-click**
  1. Right-click the page background and choose 'Summarize this page'.
  - Expected: The panel opens, the page chip appears and a summary is sent and streamed.
- **Restricted page**
  1. Open chrome://extensions and try to attach the page.
  - Expected: The attach button is disabled or the 'does not let extensions read this page' message shows.
- **YouTube with captions**
  1. Approve youtube.com in Options and keep the overlay on.
  2. Open a captioned watch page, open the in-page panel and press 'Summarize video'.
  - Expected: 'Reading the video captions…' then a summary.
- **YouTube without captions**
  1. Open a watch page for a video with captions disabled and press 'Summarize video'.
  - Expected: The 'no captions' message appears.
- **Long page**
  1. Attach a very long page.
  - Expected: Text is cut to 30,000 characters with an excerpt notice.

**Where to look when it fails**

- Panel error strings in the quoted messages above.
- Worker log 'Rejected message from non-allowlisted sender' for blocked in-page requests (background.ts:4519-4523).
- In-page failure outcomes: signed_out, plan_required, quota_exceeded, rate_limited, cancelled, retryable_error (background.ts:9027-9070).

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/074-browser-extension.md](../../70-qa/test-plans/chrome/074-browser-extension.md)

## 10. Gaps and dependencies

- **Video summary exists only in the in-page panel on approved sites.** Affects: surface:chrome users who stay in the side panel. Evidence: readYouTubeTranscript is imported only in features/content/in-page-panel/panel.ts. Work needed: Add caption reading to the side panel or a clear pointer to the overlay.
- **Videos without captions and non-YouTube videos are unsupported.** Affects: surface:chrome. Evidence: youtubeTranscript.ts:290-300; pageActions.ts:93-104. Work needed: Product decision on other sources.
- **No test found for the caption parser.** Affects: quality of S74.08. Evidence: Only inPagePanel.test.ts mentions YouTube, and it checks chips. Work needed: Add parser tests with recorded watch-page fixtures.

**Depends on**

- surface:chrome
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-voice-and-media
- F074-06
- api:POST /api/llm/v1/chat/completions

## Unknown

- Whether the side panel has any caption reading elsewhere (only one import of the transcript reader was found).
- How the server treats the video transcript (server code not read).
- Whether page text inside mirrored conversations is stored on our servers.
- Content of the in-page-panel-ui tests.
