# AGI Workforce chat surface measurements (observed 2026-09-04)

Status: Current
Owner: Product (founder) and the parity agents
Last updated: 2026-09-04

Every number below was read from the live DOM of `http://localhost:3100`, signed in
through the QA identity, light theme, Chromium via Playwright, viewport 1543x900
and again at 390x844, device pixel ratio 1. Values are computed styles and
bounding rectangles in CSS pixels, read with the same unchanged probe script used
for `docs/research/leader-ui-measurements-2026-09-04.md` (scratchpad
`parity/probe.js`), run through a temporary spec
(`apps/web/e2e/tmp-measure-chat.spec.ts`, deleted after this run). Row labels
match that document so the two can be joined into one gap matrix. Rows marked
OBSERVED were read directly from `getBoundingClientRect`/`getComputedStyle`.
Rows marked INFERRED carry the confidence of the inference and how it was made.

The QA chat model used for the two-message and streaming states is referred to
as "the default QA model" per repository convention; no model id or display
name is hardcoded in the spec or named below. Model resolution tried the
catalog's preferred localhost QA model first, then a documented fallback; the
first preference was rejected by its provider on every attempt this run, so
the fallback is the default QA model referred to throughout this document.

## 1. Application shell

| Measure                                             | AGI Workforce                                                                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar width, expanded                             | 260                                                                                                                                                 |
| Sidebar surface                                     | separate tint, `rgb(245,244,241)` against a `rgb(249,248,246)` page ground, 1px right border at black 6%                                            |
| Sidebar collapsed form                              | collapses to a bare 64px rail with no visible icon, label, or reopen control (see Notes)                                                            |
| Page ground (light theme; dark theme not exercised) | body/main `rgb(249,248,246)`; sidebar `rgb(245,244,241)`                                                                                            |
| Header height                                       | approximately 40 (read from screenshot; the probe's own header selector matched nothing, see Notes)                                                 |
| Header contents (chat)                              | conversation title with a dropdown chevron centred, "Share" left, an "Approvals" pill and three icon buttons (layout, globe, code) right            |
| Main column max width                               | 768 (composer wrapper column); composer card itself 736                                                                                             |
| Column position when the sidebar collapses          | recentres: composer column x moved from 518 to 420 when the sidebar went from 260 to 64 wide, consistent with true centering in the remaining width |
| Base font                                           | Geist, `-apple-system`/system-ui fallback                                                                                                           |
| Root font size                                      | 16px                                                                                                                                                |

## 2. Sidebar rows

| Measure                   | AGI Workforce                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Row height                | approximately 34 to 38 (INFERRED, MEDIUM, read from screenshot pixel spacing; the probe's `nav a`/`aside a` selector found no match, see Notes) |
| Row radius, padding, type | NOT RESOLVED: conversation rows are not anchor elements the probe's selector reaches                                                            |
| Row text colour           | dark on the sidebar tint, no distinct muted/hover contrast pair measured                                                                        |
| Section labels            | "PROJECTS", "CHATS" (all-caps, small, muted), grouped by day ("Today")                                                                          |
| Row hover controls        | not exercised in this pass                                                                                                                      |
| Sidebar own nav           | logo "AGI Workforce" top, then Chat / Code / Projects / Library / Schedules as a persistent icon+label list above the Projects/Chats groups     |

## 3. Composer

| Measure                   | AGI Workforce (home)                                                                                                                                                                                                                       | AGI Workforce (in chat)                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Card width                | 736                                                                                                                                                                                                                                        | 736                                                                                      |
| Card height at rest       | 128 (390 wide: 118)                                                                                                                                                                                                                        | 128 (390 wide: 118), identical to home                                                   |
| Card radius               | 26px                                                                                                                                                                                                                                       | 24px                                                                                     |
| Card background           | `rgb(255,255,255)`                                                                                                                                                                                                                         | same                                                                                     |
| Card edge                 | inset ring in an amber/warm hue at 30% alpha, 1px, plus a visible drop shadow (`0 4px 6px -1px, 0 2px 4px -2px` black 10%) always on, not only on focus                                                                                    | same                                                                                     |
| Card padding              | 0 on the wrapper; textbox itself 6px 8px (390 wide: 4px 8px)                                                                                                                                                                               | same                                                                                     |
| Text                      | 18px/27px                                                                                                                                                                                                                                  | 15px/21.4px (390 wide: 14px/20px)                                                        |
| Placeholder               | "How can I help you today?"                                                                                                                                                                                                                | "Message AGI..."                                                                         |
| Left control              | "Add attachments and tools", 36px round (390 wide: 32x40), icon 20                                                                                                                                                                         | same                                                                                     |
| Right cluster (idle)      | Chat/AGI Work mode pill, "Response style" 69x32, "Change model" 176x24 text label with 8px radius, "Start voice input" 36 round, "Send message" 32 round                                                                                   | same, mode pill hidden once inside an existing chat at 1543 (not observed at 390 either) |
| Right cluster (streaming) | mode pill and model control visibly dim/disabled; "Stop the current response" 32px round, solid red fill, replaces send                                                                                                                    | observed identically                                                                     |
| Footer line               | "Web search on ·" toggle, then "Managed cloud" pill, then "AGI can make mistakes. Check important info. · Privacy · Feedback", all left-aligned under the card at 1543; at 390 only "AGI can make mistakes. Check important info." remains | same pattern                                                                             |
| Queued-reply affordance   | placeholder changes to "Reply: sends when the current response finishes" while a response streams                                                                                                                                          | not applicable                                                                           |
| Scroll to bottom          | not observed in this pass                                                                                                                                                                                                                  | not observed                                                                             |

## 4. Messages

| Measure                           | AGI Workforce                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User bubble                       | right aligned, 626 of the 736 column at 1543 (85%; 304 of 358 at 390, 85%), bg `rgb(240,238,235)`, radius 24px, padding 10px 16px, 15px/24.375px                                                                                                                                                                    |
| User hover actions                | not isolated separately; the full always-on action row sits directly under the message (see below), not hover-gated in this build                                                                                                                                                                                   |
| Assistant container               | no bubble, full column width 736 (420 to 1188 in x), no background                                                                                                                                                                                                                                                  |
| Assistant body type               | 15px/24.375px Geist sans, colour effectively near-black; margin-top 0, margin-bottom 12px                                                                                                                                                                                                                           |
| Paragraph spacing                 | margin-top 12px, margin-bottom 12px (from the streamed-response measurement)                                                                                                                                                                                                                                        |
| Heading                           | `<h2>`, 18px/28px, 600 weight, margin-top 20px, margin-bottom 12px                                                                                                                                                                                                                                                  |
| Lists                             | `<ul>` padding-left 24px, `<li>` margin-top 6px                                                                                                                                                                                                                                                                     |
| Gap user bubble to assistant text | approximately 147 (measured 327 minus 170 top-of-bubble to top-of-paragraph at 1543)                                                                                                                                                                                                                                |
| Assistant action row              | 32px buttons, always visible (not hover-gated): timestamp, Copy message, Edit message (user only), Read message aloud, Good response, Bad response, Regenerate response, Branch conversation from here, More message actions; 24px radius 8px each; at 390 the row wraps onto a second line rather than overflowing |
| Streaming                         | an "activity" row above the composer reads "Connecting to `<model>`" with a spinner and an expand chevron while the request is outstanding; no distinct in-text cursor glyph was captured                                                                                                                           |
| Follow-up chips                   | after a completed reply, up to three suggested follow-up chips plus a "Hide" control render under the action row (for example "Run this code", "Can you give an example?", "What are the next steps?")                                                                                                              |

## 5. Code blocks

| Measure        | AGI Workforce                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outer card     | full column width 736, radius 8px (visual; the probe's `pre` rect itself carries no radius, the visible rounding is on a wrapper), header bar and code area share a light hairline |
| Header         | a light grey bar, language label lower-case left ("python"), "Copy" button with icon right                                                                                         |
| Code           | JetBrains Mono (Berkeley Mono fallback), 13px/19.5px, no visible internal padding beyond the wrapper's; keyword `print` and string literals colour-coded                           |
| Syntax colours | keywords and strings coloured; no line numbers observed                                                                                                                            |

## 6. Menus and pickers

| Measure                 | AGI Workforce                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model control           | "Change model" text label (not a pill) opens a 288px-wide popover, radius 8px, bg `rgb(255,255,255)`; header "Models", a search box (present in this run's roster), a "Reasoning effort · Choose how much reasoning to use" row with a slider, then an "AVAILABLE" section of rows                                  |
| Model row               | two-line rows (name, then a description line and capability pill badges such as VISION / REASONING / SEARCH / TOOLS, plus a small cost-tier dot indicator), 14px/21px type, a checkmark on the selected row; rows run noticeably taller than a single 35 to 40px row (roughly 100px with the description and pills) |
| Model row count visible | 18 rows total in the scrollable list at this account's current roster                                                                                                                                                                                                                                               |
| At 390 wide             | same popover width (288) and radius, anchored to the composer's left edge rather than centred; height 484 vs 511 at 1543                                                                                                                                                                                            |
| Chat/message menu       | "More message actions" opens a dropdown; contents not enumerated in this pass                                                                                                                                                                                                                                       |
| Delete confirm          | not exercised in this pass                                                                                                                                                                                                                                                                                          |

## 7. Scales seen across the page (fresh /chat, 1543 wide)

| Scale                                     | AGI Workforce                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Button heights (count of visible buttons) | 36 (49), 28 (46), 24 (18), 32 (9), others rare                                     |
| Icon sizes                                | 14x14 (54), 16x16 (16), 12x12 (8), 20x20 (1)                                       |
| Radii by frequency                        | 8px (58), 12px (48), pill (11), 4px (10), 26px (1)                                 |
| Type scale by frequency                   | 14/20 Geist (56), 12/18 Geist (14), 12/16 Geist (8), 28/36 Newsreader greeting (1) |

## 8. Mobile (390x844)

| Measure                | AGI Workforce                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sidebar                | not persistently visible; a hamburger icon sits top-left of the header, a second icon (layout/panel) top-right; the sidebar's own responsive behaviour (drawer vs hidden) was not directly exercised by opening it |
| Composer               | width 358 of 390 (16px side margins), height 118 at rest, same 24px radius and ring as desktop in-chat                                                                                                             |
| Composer right cluster | "Change model" label, mic, send only; the Chat/AGI Work mode pill and the "Response style" control are not present at this width                                                                                   |
| User bubble            | 304 of 358 column (85%), same radius/padding/colour as desktop                                                                                                                                                     |
| Assistant action row   | wraps onto two rows: Copy, Pin, Read aloud, thumbs up, thumbs down, Regenerate on the first row, Branch and "More" on the second                                                                                   |
| Model picker           | same 288px width and 8px radius as desktop, left-anchored rather than centred, height 484                                                                                                                          |
| Greeting heading       | "Afternoon, Siddhartha", Newsreader serif 28px/36px, same as desktop                                                                                                                                               |

## Notes

- **Header rect not resolved by the probe.** `probe.js`'s header detector
  (`header, [role="banner"]`, falling back to a 30 to 90px-tall child of
  `<main>`) matched nothing on this app, because the app does not render a
  semantic `<main>` element (the probe's own `out.main` fell back to
  `document.body`, `x:0 y:0 w:<viewport>`). The header height reported above
  (approximately 40) is read from screenshots, not `getBoundingClientRect`.
- **Sidebar row measurement not resolved.** The probe's row-finder
  (`nav a, aside a, [role="navigation"] a`) found only a "Skip links"
  navigation landmark, not the conversation list, because AGI Workforce's
  conversation rows are not anchor tags. Row height above is a screenshot
  pixel estimate (INFERRED, MEDIUM), not a DOM measurement; radius, padding,
  and per-row type were not resolved at all this pass.
- **Sidebar restore control not confirmed.** Clicking the button labelled
  "Collapse sidebar" reliably collapsed the sidebar to a bare, iconless 64px
  rail (screenshot: `sidebar-collapsed-1543.png`). Re-clicking a button with
  that same accessible name afterward did not restore the width (still 64px
  in `state2_aside_restored`), which likely means the control's accessible
  name changes once collapsed (for example to "Expand sidebar") rather than
  toggling under one name, and the harness's fixed-label re-click silently
  missed it. This was not independently re-verified with a corrected
  selector, so it is reported as an open question, not a confirmed defect:
  whether the app exposes any visible way back into the expanded sidebar
  besides hovering the bare rail (`Sidebar.tsx`'s `onMouseEnter` hover-expand)
  was not established either way.
- **A reproducible client-side crash was hit repeatedly while measuring
  states 3 and 4.** Across seven full measurement passes, sending either the
  two-message prompt or the streaming prompt intermittently (roughly half of
  attempts) threw an uncaught `RangeError: Invalid index specified: 3` in the
  browser console and left the page showing the fresh empty-chat greeting
  instead of the just-sent conversation, with no error banner and no URL
  change (i.e. the send silently failed to render client-side, though a
  conversation may still have been created server-side). A same-prompt retry
  in a fresh `/chat` navigation succeeded every time it was tried. This is a
  real, reproduced-more-than-once finding worth a follow-up investigation; it
  was not something this pass could isolate further since no product code was
  touched. Screenshot `streamed-complete-1543.png` in an earlier attempt also
  showed a red "Too many requests. Please wait before trying again." banner
  triggered by background feature calls (skills catalog, connector
  permissions) returning 429 during a burst of repeated test runs, separate
  from the RangeError; the chat completion itself still rendered correctly in
  that case.
- **Dark theme was not exercised.** The signed-in QA session rendered in
  light theme (`colorScheme: light`); all values above are light-theme only,
  unlike the leader doc which measured both products in dark theme. A
  dark-theme pass would need a separate run.
- **Cleanup.** Every conversation this measurement session created (11 total
  across the working runs, identified by their exact QA prompt text) was
  deleted via `DELETE /api/chat/conversations/{id}` after use; a final sweep
  against the shared QA account's conversation list (`GET
/api/chat/conversations?limit=100`, 46 conversations on the account) found
  and removed 7 more that an earlier, since-fixed attempt had orphaned before
  its own cleanup step ran. No conversations belonging to other agents on
  this shared QA account were touched (matching was anchored to this
  session's exact prompt text only). No product code was read for this
  measurement beyond what was needed to find accessible-name selectors
  (`aria-label` values already used by `apps/web/e2e/chat-search-stop-label.spec.ts`
  and neighbours); nothing was edited.
