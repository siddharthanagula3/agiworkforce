# chatgpt.com and claude.ai chat surface measurements (observed 2026-09-04)

Status: Current
Owner: Product (founder) and the parity agents
Last updated: 2026-09-04

Every number below was read from the live DOM of the founder's signed-in sessions (ChatGPT Plus, Claude Max, dark theme, Chrome on macOS, viewport 1543 wide, device pixel ratio 2) with one probe script run through the browser extension on 2026-09-04. Values are computed styles and bounding rectangles in CSS pixels. Rows marked OBSERVED were read directly. Rows marked INFERRED carry the confidence of the inference. Nothing here is a copy of either product's source; it is what the rendered page reports.

The probe used for both leaders is kept with the session evidence (scratchpad parity/probe.js) and must be run unchanged against localhost so the three columns of the gap matrix are comparable.

## 1. Application shell

| Measure                                    | ChatGPT                                                             | Claude                                         | Note                                                          |
| ------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| Sidebar width, expanded                    | 260                                                                 | 288                                            | OBSERVED                                                      |
| Sidebar surface                            | transparent over the page ground                                    | separate tint, 0.5px right border at white 10% | OBSERVED                                                      |
| Sidebar collapsed form                     | 52px icon rail: logo, new chat, search, chats, avatar               | 32px strip with one reopen toggle at 8px       | OBSERVED                                                      |
| Page ground (dark)                         | rgb(0,0,0)                                                          | rgb(21,21,21); sidebar rgb(17,17,17)           | OBSERVED                                                      |
| Header height                              | 52                                                                  | 48                                             | OBSERVED (ChatGPT main starts at y=52; Claude header rect 48) |
| Header contents (chat)                     | title on the left inside the sidebar edge, Share and overflow right | title dropdown left, Share right               | OBSERVED                                                      |
| Main column max width                      | 768                                                                 | 736 text, 808 outer with padding               | OBSERVED                                                      |
| Column position when the sidebar collapses | stays 768, recentres in the wider main                              | stays 736, recentres                           | OBSERVED                                                      |
| Base font                                  | system UI stack (-apple-system-body)                                | anthropic-sans, system-ui fallback             | OBSERVED                                                      |
| Root font size                             | 16px                                                                | 16px                                           | OBSERVED                                                      |

## 2. Sidebar rows

| Measure               | ChatGPT                            | Claude                                                       |
| --------------------- | ---------------------------------- | ------------------------------------------------------------ |
| Row height            | 36                                 | 32                                                           |
| Row radius            | 10px                               | 8px                                                          |
| Row padding           | 6px 10px                           | 0 2px (inner link carries the text inset)                    |
| Row type              | 14px/20px, 400                     | 14px/21px, 400                                               |
| Row text colour       | white                              | rgb(195,194,183) muted, white on hover and active            |
| Icon size in nav rows | 16                                 | 16 to 20                                                     |
| Section labels        | "Projects", "Chats", muted 14px    | "Projects", "Chats and tasks", muted 14px with a filter icon |
| Row status marker     | blue dot for unread                | hollow or blue dot per row for task state                    |
| Row hover controls    | pin and overflow at the right edge | overflow at the right edge (24px button)                     |

All OBSERVED.

## 3. Composer

| Measure             | ChatGPT (home)                                                                 | ChatGPT (in chat)                                                           | Claude (home)                                                                                                          | Claude (in chat)                                    |
| ------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------- | ----------------------------- |
| Card width          | 768                                                                            | 768                                                                         | 640                                                                                                                    | 768                                                 |
| Card height at rest | 52                                                                             | 52                                                                          | 110 (two rows)                                                                                                         | 48 (one row, tools collapse into the right cluster) |
| Card radius         | 28px (full pill at one line)                                                   | 28px                                                                        | 14px                                                                                                                   | 14px                                                |
| Card background     | rgb(33,33,33)                                                                  | same                                                                        | rgb(32,32,31)                                                                                                          | same                                                |
| Card edge           | inset ring white 20% 1px, no shadow                                            | same                                                                        | inset ring white 20% 1px plus 0 4px 20px black 7.5%                                                                    | same                                                |
| Card padding        | 0 (controls carry their own 8px inset)                                         | 0                                                                           | 8px                                                                                                                    | 8px                                                 |
| Text                | 16px/26px                                                                      | 16px/26px                                                                   | 16px/22px                                                                                                              | 16px/22px                                           |
| Placeholder         | "Ask ChatGPT" (Chat), "Work on anything" (Work), "Follow up" while a turn runs |                                                                             | "How can I help you today?"                                                                                            | "Write a message…"                                  |
| Left control        | plus, 36px round, icon 20                                                      | same                                                                        | plus, 32px, radius 8                                                                                                   | same                                                |
| Right cluster       | effort pill 78x36 ("High"), dictation 36, voice 36 white round                 | while streaming: effort, dictation, Stop 36 white round with a square glyph | model label, mic with chevron 32px, send 32px                                                                          | mic 32, chevron, send                               |
| Mode toggle         | at the top of the page (Chat                                                   | Work)                                                                       |                                                                                                                        | inside the card, second row (Chat                   | Cowork) | not shown in an existing chat |
| Footer line         | "ChatGPT can make mistakes. Check important info." centred 12px above the card |                                                                             | "Claude is AI and can make mistakes. Please double-check responses." left, model and effort right, 12px under the card |                                                     |
| Scroll to bottom    | 36px round floating button above the composer with a 20px arrow                |                                                                             | 36px round, icon 20                                                                                                    |                                                     |

All OBSERVED. INFERRED, HIGH: both grow the textbox to a maximum of roughly eight lines before it scrolls internally (seen on earlier sessions, not measured today).

## 4. Messages

| Measure                           | ChatGPT                                                                                                                                                                                                        | Claude                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| User bubble                       | right aligned, max 538 of the 768 column (70%), bg rgba(50,50,50,0.85), radius 22px, padding 10px 16px, 16px/24px                                                                                              | right aligned, max 602 of the 736 column (82%), bg white 5%, radius 12px, padding 12px 16px, 15px/20px |
| User hover actions                | edit and copy under the bubble on hover                                                                                                                                                                        | Retry, Edit, Copy as 24px buttons at the bubble's right edge on hover                                  |
| Assistant container               | no bubble, full column width 768, no background                                                                                                                                                                | no bubble, full column width 736                                                                       |
| Assistant body type               | 16px/26px system sans, white                                                                                                                                                                                   | 16px/24px serif (anthropic-serif), rgb(240,239,236)                                                    |
| Paragraph spacing                 | margin 8px 0 4px on the first, 16px 0 16px after                                                                                                                                                               | margin-top 12px, bottom 0                                                                              |
| Heading                           | h2 20px/28px, 600, margin 0 0 4px                                                                                                                                                                              | serif h2 about 20px bold with margin-top 24 (read from the render)                                     |
| Lists                             | ul padding-left 26, li padding-left 6, 16px/26px                                                                                                                                                               | ul padding-left 32, li margin-top 4, bold lead-ins at 600                                              |
| Gap user bubble to assistant text | 40                                                                                                                                                                                                             | about 52                                                                                               |
| Assistant action row              | 32px buttons with 20px icons: copy, thumbs up and down, share, "Switch model" (regenerate with a model choice), more; sits directly under the message, always visible on the last turn, hover on earlier turns | 24px buttons: Copy, Read aloud, Good response, Bad response, Retry; same visibility rule               |
| Streaming                         | a cursor element while text arrives; Stop replaces the voice button                                                                                                                                            | orange asterisk mark below the text while it runs; Stop replaces send                                  |

All OBSERVED.

## 5. Code blocks

| Measure        | ChatGPT                                                                            | Claude                                                                                            |
| -------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Outer card     | full column width 768, radius 16 (visual), dark card lighter than the ground       | full column width 736, radius 8px, border 0.5px white 10%, background about 24% grey at 50% alpha |
| Header         | 48px row: language icon and label ("Python") left, copy 36px and "Run" 76x36 right | 32px row: lowercase language label left ("python"), copy 32px right                               |
| Code           | ui-monospace 12.25px/20px, padding 0 20px, pre radius 6                            | anthropic-mono 14px/22.75px, padding 14px                                                         |
| Syntax colours | keywords and strings coloured; no line numbers                                     | keywords and strings coloured; no line numbers                                                    |

All OBSERVED.

## 6. Menus and pickers

| Measure                 | ChatGPT                                                                                                                                 | Claude                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effort or model control | "High" pill opens a 255px popover, radius 24px, bg rgb(53,53,53), a "High >" header, a slider, then model rows 35px tall at 14px        | model label opens a 226px menu, radius 8px: rows with a title and a one line description, a check on the selected row, then "Effort Off >" and "More models >" |
| Chat menu               | Share, Rename, Pin chat, Archive, Delete, Move to project (sidebar); View files in chat, Pin, Archive, Delete, Move to project (header) | Pin (P), Rename (R), Add to project, Delete (D) with single-key shortcuts                                                                                      |
| Delete confirm          | "Delete chat? This will delete <title>. Visit settings to delete any memories saved during this chat."                                  | "Delete chat? Are you sure you want to delete this chat?" then a bottom-right toast                                                                            |

All OBSERVED.

## 7. Scales seen across the page

| Scale                                     | ChatGPT                                    | Claude                                                               |
| ----------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| Button heights (count of visible buttons) | 36 (70), 52 (10), 32 (5)                   | 24 (30), 32 (9), 28 (3)                                              |
| Icon sizes                                | 16 (69), 20 (15)                           | 16 and 20 glyph fonts, svg 20                                        |
| Radii by frequency                        | 8px, 10px, pill, 6px, 16px, 28px           | 8px, 6px, 7px, pill, 14px                                            |
| Type scale by frequency                   | 14/20 (49), 16/26 (4), 16/24, 24/28, 24/32 | 14/21 (21), 13/16, 13/17, 12/18, 20/20 serif, 38/47.5 serif greeting |

All OBSERVED.

## 8. Mobile and tablet

The extension cannot resize the founder's Chrome window (the resize call reports success but the viewport stays 1543). INFERRED, HIGH from the 2026-08-30 measurement doc (chat-ui-parity-2026-08-30.md): at 390px ChatGPT's composer rests at about 87px including its footer line, the sidebar becomes a full-height drawer behind a top-left toggle, and the message column takes the full width with 16px side padding. Claude at phone width was not measured; INFERRED, MEDIUM: the same drawer pattern with the mode toggle kept inside the composer.

## 9. Shared pattern and the AGI Workforce target

| Component        | ChatGPT                                 | Claude                                    | Shared convention                                                                                                                            | AGI Workforce target                                                        |
| ---------------- | --------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Shell            | 260 sidebar, 768 column, 52 header      | 288 sidebar, 736 column, 48 header        | persistent left sidebar 260 to 290 wide, one centred column 736 to 768, header under 52                                                      | sidebar 272, column 768, header 48                                          |
| Sidebar collapse | icon rail                               | reopen strip                              | collapse to a narrow rail with a reopen control at the top left; column recentres                                                            | icon rail 52 with reopen at top left                                        |
| Sidebar row      | 36 tall, radius 10                      | 32 tall, radius 8                         | 32 to 36 tall, radius 8 to 10, 14px text, hover reveals a right-edge overflow                                                                | 34 tall, radius 8                                                           |
| Composer card    | pill 52 tall, radius 28, ring white 20% | 48 tall, radius 14, ring plus soft shadow | one card 48 to 52 tall at rest, 768 wide, a ring at white 20% on dark, plus on the left, send or stop on the right, tools in a right cluster | 48 tall, radius 16, ring only, plus left, model and tools right, send right |
| Composer text    | 16/26                                   | 16/22                                     | 16px                                                                                                                                         | 16/24                                                                       |
| Mode toggle      | page top                                | inside the card                           | near the composer or the page top, remembered per chat                                                                                       | inside the card (already so)                                                |
| User bubble      | 70% max, radius 22, tint                | 82% max, radius 12, tint                  | right aligned tinted bubble at 70 to 80% max width, radius 12 to 22, padding 10 to 12 by 16                                                  | 75% max, radius 18, padding 10 16                                           |
| Assistant body   | 16/26 sans                              | 16/24 serif                               | no container, full column, 16px with 24 to 26 line height, paragraph gap 12 to 16                                                            | 16/26 sans (serif is Claude's brand, not a shared convention)               |
| Action row       | 32px buttons, 20 icons                  | 24px buttons                              | a low-contrast icon row under the message, visible on the last turn and on hover otherwise, copy first, feedback, regenerate                 | 32px hit area with 18 icons                                                 |
| Code block       | 48 header, 12.25/20 mono                | 32 header, 14/22.75 mono                  | header row with the language and a copy control, rounded card with a hairline, mono 13 to 14 with 20 to 23 line height                       | 36 header, 13/21 mono, radius 8, hairline                                   |
| Streaming        | Stop replaces the voice button          | Stop replaces send                        | the send control becomes Stop in place; a visible progress mark near the text                                                                | send becomes Stop in place; thinking and phase labels stay                  |
| Menus            | 8 to 24 radius popovers                 | 8 radius menus                            | anchored menus with 32 to 36 rows, 14px text, arrow keys                                                                                     | radius 10, rows 34                                                          |
