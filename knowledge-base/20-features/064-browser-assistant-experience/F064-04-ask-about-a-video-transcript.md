---
id: "F064-04"
type: "feature"
title: "Ask about a video transcript"
aliases: ["Ask about a video transcript", "Question about video/transcript (S64.07)", "Summarize video", "Key timestamps", "YouTube captions", "readYouTubeTranscript"]
area: "64 Browser-assistant experience"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "missing", mobile: "missing", cli: "missing", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S64.07"]
depends_on: ["surface:chrome", "mode:cloud", "file:apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts", "file:apps/extension/src/features/content/in-page-panel/panel.ts", "api:POST /api/llm/v1/chat/completions", "SYS-chat-turn-pipeline", "SYS-inference-providers", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "F064-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F064-04 Ask about a video transcript

On a YouTube watch page the Chrome in-page panel offers 'Summarize video', 'Key timestamps' and 'Q&A'. It reads the video's captions from the page, sends up to 30,000 characters to AGI Managed Cloud and answers from them. Videos with no captions say so. Only Chrome has this.

Area: [64. Browser-assistant experience](README.md). Requirement items: [S64.07](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6407).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Reads the captions of the YouTube video in the open tab and uses them as the context for a summary, a list of key moments or questions and answers.

**Why it exists.** Brief item S64.07: the assistant answers questions about a video on the page using its transcript. [inferred] Page text of a video page does not contain the spoken content.

**Who uses it.** Chrome users watching YouTube who want a summary or the key moments.

**Problems it solves**

- Watching a long video to find a point.
- Page text of a video page being useless for answering content questions.

**Use cases**

- Open a lecture video and press 'Summarize video'.
- Press 'Key timestamps' to get a time-marked outline.
- Press 'Q&A' for likely questions and answers.

## 2. User experience

**Where to find it**

- Chrome in-page panel on a YouTube watch address (www.youtube.com/watch?v=...): chips 'Summarize video', 'Key timestamps', 'Q&A' (apps/extension/src/features/content/in-page-panel/pageActions.ts YOUTUBE_ACTIONS and isYouTubeWatch; panel chip build apps/extension/src/features/content/in-page-panel/panel.ts:351-368).

**Before you start**

- Signed in to AGI Managed Cloud (background.ts:9135-9137).
- YouTube approved as a site in the extension and the in-page panel left on (apps/extension/src/inPagePanel/setup.ts:70-80 region).
- The person opens the panel with the floating launcher button; it does not open by itself (apps/extension/src/features/content/in-page-panel/launcher.ts:1-10).

**Screens and controls**

- The in-page panel: header with the label 'Managed Cloud · Auto', chips row, text box, response area, disclosure note, 'Open in side panel' link (panel.ts:44-150).

**Journey**

1. Person opens a watch page and presses the launcher button.
2. Person presses 'Summarize video' (or another video chip).
3. The panel shows 'Reading the video captions…' (panel.ts:511).
4. The captions are read and the answer streams in.
5. If the person types a free question instead, the panel sends the visible page text, not the captions (panel.ts:558-566).

**What the person sees and gets**

- 'Reading the video captions…' while loading.
- 'This video has no captions, so there is no transcript to read. Ask about the page instead.' for none (panel.ts:517-519).
- 'The video captions could not be read. <reason>' for errors (panel.ts:520).
- A disclosure updated to say captions are sent, with the character count (panel.ts:411-430, 523).

**Settings**

- In-page panel on or off and site approval in Extension settings.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Video id is taken from the 'v' parameter and checked against a pattern (youtubeTranscript.ts:43-51).
- Caption data is taken from the page's inline scripts, or fetched from the watch page of the same origin (youtubeTranscript.ts:108-136).
- Track choice: a human-written track in the spoken language first, then the default track if human-written, then an auto-generated track, then the default, then the first track (youtubeTranscript.ts:164-178).
- Transcript is read as timed text, with the transcript panel as a fallback, and each line is time-stamped like [12:03] (youtubeTranscript.ts:195-210, 257-288, 180-193).
- Result status is ok, none or error (youtubeTranscript.ts:1-4, 290-313); the text is cut to 30,000 characters and redacted before sending (panel.ts:522-528).
- Each fetch times out after 15 seconds and the page size is capped at 8,000,000 characters (youtubeTranscript.ts:18-19, 119-130).

**Incomplete**

- Only the three chips flagged readsVideoCaptions use captions; the free-form text box on a video page sends the visible page text (panel.ts:558-566).
- The read depends on YouTube's current page structure and internal endpoints, so it can fail when that changes [inferred] (youtubeTranscript.ts:241-288).
- The side panel's 'Add the browser page' on a video page reads page text, not captions; no caption path found there.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Desktop, Mobile, CLI, VS Code and Web: no transcript reading found.
- Other video sites: only the YouTube watch address is recognised (pageActions.ts isYouTubeWatch).

## 4. Required behaviour

**Established requirements**

- The assistant answers questions about a video on the page using its transcript (S64.07). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S64.07)
- Page content is untrusted and browser data stays out of global memory by default. (source: (doc: docs/product/requirements.md:1213-1214))

**Acceptance criteria**

1. On a watch page, the three video chips appear instead of the generic chips.
2. A video with captions yields an answer that uses them and the disclosure says 'captions'.
3. A video with no caption track shows the no-captions message and sends nothing.
4. When both a human and an auto-generated track exist in the spoken language, the human track is used.
5. A network failure shows 'The video captions could not be read.' with the reason.
6. Text over 30,000 characters is cut and the panel says it was cut.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A free-form question on a video page should also use the captions, since the brief says questions about the video [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the free-form box on a watch page include captions when they exist.
- [proposed] Add the same reading to the side panel and to Desktop's paired Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | readYouTubeTranscript | `apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts` | Finds and reads captions (line 290). |
| service | chooseCaptionTrack / captionTracks | `apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts` | Track choice (lines 138-178). |
| service | timedTextTranscript / panelTranscript | `apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts` | Turn caption JSON into time-stamped lines (lines 195-239). |
| service | runCaptionAction | `apps/extension/src/features/content/in-page-panel/panel.ts` | Reads captions then runs the prompt (line 505). |
| config | YOUTUBE_ACTIONS / getPageActions | `apps/extension/src/features/content/in-page-panel/pageActions.ts` | The three video chips and watch-page detection. |
| component | createPanel | `apps/extension/src/features/content/in-page-panel/panel.ts` | The in-page panel (line 440 region) with chips and composer. |
| component | launcher | `apps/extension/src/features/content/in-page-panel/launcher.ts` | Floating button that opens the panel. |
| service | mountInPagePanel | `apps/extension/src/inPagePanel/setup.ts` | Mounts the launcher and panel on approved pages (line 44). |
| service | handleInPagePrompt | `apps/extension/src/background.ts` | Sends the prompt and captions to AGI Managed Cloud (line 9112). |
| config | IN_PAGE_PROMPT message | `apps/extension/src/background.ts` | Message case (line 6060). |
| service | sanitizePageText | `apps/extension/src/background/policy.ts` | Redacts secrets in text (imported at panel.ts:22). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The content script in the YouTube page reads caption data from the page or fetches it from YouTube's same-origin endpoints. | outside service | youtubeTranscript.ts:119-136, 257-288 |
| The text is redacted and cut to 30,000 characters in the page. | device | panel.ts:522-528 |
| The prompt and transcript go to the extension background, then to AGI Managed Cloud for the answer. | our servers | panel.ts:197-215; background.ts:9112-9190 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Transcript text | In memory in the page and the request; not saved | No | Gone when the panel closes; each answer replaces the previous (panel.ts:411-430) |
| Answer text | Shown in the panel; the disclosure says open the side panel for a saved conversation | No | Replaced by the next answer |

**Models and providers.** AGI Managed Cloud with automatic model selection; no provider choice (panel.ts:93-96; background.ts:9160-9163).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in to AGI is required (background.ts:9135-9137). |
| Permissions | The site must be approved and the in-page panel left on (setup.ts:70-80 region). The page reads YouTube's own pages with the person's cookies (youtubeTranscript.ts:120-122 same-origin credentials). |
| Subscription | none found in the code in the extension; outcomes 'plan_required' and 'quota_exceeded' come from the server (background.ts:9041-9044); which plans: unknown. |
| Limits and metering | 30,000 characters of transcript (pageActions.ts:22); 15 second request timeout (youtubeTranscript.ts:18). Metering is server side, not opened. |
| Feature flags | none found in the code. |
| Model compatibility | Model is chosen automatically; none found in the code for caption reading. |
| Provider restrictions | Managed Cloud only. |
| Local mode | Not available. The in-page panel has no Local mode (panel.ts:93-96). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Reading the video captions…' and the controls are disabled | panel.ts:508-512 |
| No captions or not a watch address | Status none; message to ask about the page instead | youtubeTranscript.ts:292,297; panel.ts:517-519 |
| Captions empty after both read paths | Error 'YouTube did not return the captions for this video.' | youtubeTranscript.ts:306 |
| HTTP error or too large page | Error with 'YouTube answered HTTP <code>.' or 'The YouTube page was too large to read.' | youtubeTranscript.ts:125,128 |
| Timeout | The request is aborted after 15 seconds and reported as an error | youtubeTranscript.ts:18,122,307-312 |
| Retry | Chip can be pressed again; answer errors show a Retry button | panel.ts:316-322 |
| Navigation to another video | Chips are rebuilt on navigation events | panel.ts:532-556 |
| Signed out, quota, rate limit | Titled state with Retry or open side panel | panel.ts:292-346 |
| Offline | not handled in the code beyond the fetch error path | Looked in youtubeTranscript.ts and panel.ts:505-530; the only handling is the generic error message at youtubeTranscript.ts:307-312 |
| Accessibility | Response area is role=status aria-live=polite; chips have aria-labels; disclosure is described by aria-describedby | panel.ts:82-95, 360-370 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/inPagePanel.test.ts`: getPageActions returns YouTube actions for watch addresses and not for other YouTube pages (lines 54-68). No test imports youtubeTranscript.ts.
- `apps/extension/__tests__/in-page-panel-ui.test.ts`: In-page panel page capture and closed state; not captions.
- `apps/extension/__tests__/in-page-panel-presence.test.ts`: Launcher mounting and hiding when the side panel is open.

**Test scenarios**

- **Video with captions**
  1. Sign in; approve youtube.com.
  2. Open a watch page with captions; open the launcher; press 'Summarize video'.
  - Expected: 'Reading the video captions…' then a summary; disclosure mentions captions.
- **Video without captions**
  1. Open a watch page whose video has no captions; press 'Key timestamps'.
  - Expected: The no-captions message; no request to AGI.
- **Human versus auto captions**
  1. Open a video that has both a human and an auto track in its language; press 'Q&A'.
  - Expected: The prompt text says 'captions' not 'auto-generated captions'.
- **Long video**
  1. Open a multi-hour video; press 'Summarize video'.
  - Expected: Prompt cut to 30,000 characters and the cut is noted.
- **Free question on a watch page**
  1. Type a question about the video content in the panel box.
  - Expected: Answer is based on visible page text, not captions (current behaviour).

**Where to look when it fails**

- The panel's response area text for the error reason.
- Browser console of the YouTube tab for fetch errors.
- Background logs for IN_PAGE_PROMPT failures (background.ts:9112).

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/064-browser-assistant-experience.md](../../70-qa/test-plans/chrome/064-browser-assistant-experience.md)

## 10. Gaps and dependencies

- **No test for transcript reading or track choice.** Affects: Chrome. Evidence: No test file imports youtubeTranscript.ts (searched apps/extension). Work needed: Add tests with sample player data for chooseCaptionTrack, timedTextTranscript, panelTranscript.
- **Free-form questions on a video page do not use captions.** Affects: Chrome. Evidence: panel.ts:558-566. Work needed: Use the transcript for the text box on a watch page.
- **No transcript on Desktop, Mobile, CLI or the Chrome side panel.** Affects: Desktop, Mobile, CLI, Chrome side panel. Evidence: No transcript code outside in-page-panel. Work needed: Decide scope; Desktop could reuse the paired Chrome.
- **Reliance on YouTube's internal page structure.** Affects: Chrome. Evidence: youtubeTranscript.ts:241-288. Work needed: Add a monitored check that fails when the structure changes.
- **Draft said the default track is preferred; the code prefers a human track in the spoken language first.** Affects: Knowledge base. Evidence: youtubeTranscript.ts:164-178. Work needed: Use the corrected rule.
- Not built on: Desktop, Mobile, CLI (from the capability ledger).

**Depends on**

- surface:chrome
- mode:cloud
- file:apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts
- file:apps/extension/src/features/content/in-page-panel/panel.ts
- api:POST /api/llm/v1/chat/completions
- SYS-chat-turn-pipeline
- SYS-inference-providers
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- F064-01

## Unknown

- Whether any test or manual run has confirmed the caption read against the live YouTube site.
- Plan rules for the chat send.
- Behaviour on YouTube pages in embedded frames or the mobile site.
- Whether the transcript text is logged anywhere server side.
