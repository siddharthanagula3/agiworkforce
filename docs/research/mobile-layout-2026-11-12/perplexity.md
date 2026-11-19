# Perplexity on iPhone: layout measurements, part 1 (observed 2026-11-12)

Status: Historical snapshot
Owner: Product (founder)
Last updated: 2026-11-12

Screenshots IMG_1301 to IMG_1329 of the founder's reference set, 1284 x 2778 pixels at scale 3 (428 x 926 points). Method, tool and limits are in `docs/research/mobile-layout-2026-11-12/README.md`. Sizes are points unless a column says pixels. OBSERVED means read from pixels by the tool; ESTIMATED means derived (text size from cap height, weight and radius by fit); UNKNOWN means not readable from a screenshot.

Notes that apply to the whole file:

- IMG_1317 does not exist in the folder; every other number from 1301 to 1329 is covered.
- The app is in its dark theme throughout. Perplexity uses its own typeface (a grotesque sans for interface text, a serif for large headings), so every text size is ESTIMATED with the 0.705 ratio of SF Pro and is good to about plus or minus 1 point. Serif sizes are less certain than sans sizes.
- Page background is #161616. Raised surfaces are #1c1c1c (cards) and #222222 (buttons on the sign-in sheet). Primary text is #dedede, secondary text is #989898 or #9a9a9a, the accent is #4e99a3 (teal), destructive text is #dc6973. Hexes are read from pixels; many surfaces are translucent gradients, so a hex is the value at the sampled point.
- Many headers sit on the status bar clearance: round controls start at y = 141 px (47 pt).
- Personal content in the screenshots (account handle, email, chat titles, the setup key and QR code) is replaced by placeholders and never recorded.

## Shared components seen in this part

| Component                        | Metric                         | Value                                                                                                                                                                                               | Screenshot             | Status                    |
| -------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------- |
| Screen frame                     | Status bar height              | 47 pt (round header controls start at y = 141 px)                                                                                                                                                   | 1301                   | OBSERVED                  |
| Screen frame                     | Header bar height (home)       | 44 pt controls, top 47, so bar ends at 91 pt                                                                                                                                                        | 1301, 1305             | OBSERVED                  |
| Screen frame                     | Side margin of header controls | 20 pt (60 px)                                                                                                                                                                                       | 1301, 1311, 1312       | OBSERVED                  |
| Screen frame                     | Side margin of composer        | 18 pt (54 px) each side                                                                                                                                                                             | 1301                   | OBSERVED                  |
| Screen frame                     | Side margin of settings cards  | 20 pt (60 px) on the main Settings and Preferences pages, 16 pt (48 px) on Notifications, Account, Map provider, Personalize, Connectors                                                            | 1313, 1316, 1321, 1327 | OBSERVED                  |
| Screen frame                     | Full-screen page sheet         | Starts at y = 141 px (47 pt), full width, top corner radius about 37 pt                                                                                                                             | 1312, 1314             | radius ESTIMATED          |
| Chat header (home)               | Left control                   | Avatar circle 40 pt (120 px), x 66 to 186, y 147 to 267, fill #004d40, small teal status dot at its top right                                                                                       | 1305                   | OBSERVED                  |
| Chat header (home)               | Wordmark                       | "perplexity" wordmark, 343 x 72 px (114 x 24 pt), x 228, y 171, colour #dedede, 14 pt after the avatar                                                                                              | 1305                   | OBSERVED                  |
| Chat header (home)               | Right controls                 | Two round buttons 44 pt (132 px) at x 924 and x 1092, y 141, fill #353535 (translucent), gap 12 pt (36 px), right margin 20 pt                                                                      | 1305                   | OBSERVED                  |
| Chat header (home)               | Title text size                | Wordmark, not text                                                                                                                                                                                  | 1305                   | n/a                       |
| Composer at rest                 | Card inset                     | L 18, R 18                                                                                                                                                                                          | 1301                   | OBSERVED                  |
| Composer at rest                 | Card height                    | 107.7 pt (323 px), y 2346 to 2669                                                                                                                                                                   | 1301                   | OBSERVED                  |
| Composer at rest                 | Card radius                    | about 24 pt                                                                                                                                                                                         | 1301                   | ESTIMATED                 |
| Composer at rest                 | Card fill                      | #282828 at the top to #2b2b2b at the bottom, 1 px lighter border (#555555 at the top edge fading to #333333)                                                                                        | 1301                   | OBSERVED                  |
| Composer at rest                 | Placeholder text               | "Ask anything...", cap height 38 px, about 18 pt, colour #838383, regular, left edge 18 pt inside the card, cap top 27 pt below the card top                                                        | 1301                   | size ESTIMATED            |
| Composer at rest                 | Plus control                   | Round button 34 pt (102 px), x 90 to 192, y 2532 to 2634, fill #2e2e2e, plus glyph 12 pt (36 px)                                                                                                    | 1301                   | OBSERVED                  |
| Composer at rest                 | Mode switch                    | Capsule x 205 to 462 (85.7 pt wide), 34 pt tall, holds two icon slots: search magnifier (15 pt glyph) and computer (16.7 x 14 pt glyph); the active slot is a #161616 chip 41 x 30 pt (123 x 90 px) | 1301                   | OBSERVED                  |
| Composer at rest                 | Model pill                     | x 475 to 676 (67 pt wide), 34 pt tall, fill #2e2e2e, label "Model" about 16 pt, colour #a0a0a0, 13 pt side padding                                                                                  | 1301                   | size ESTIMATED            |
| Composer at rest                 | Microphone button              | Round 32 pt (97 px), x 990 to 1087, fill #2e2e2e, glyph 13 x 17 pt                                                                                                                                  | 1301                   | OBSERVED                  |
| Composer at rest                 | Voice button                   | Round 33.3 pt (100 px), x 1096 to 1196, y 2533 to 2633, fill #4e99a3, waveform glyph in #0b2833                                                                                                     | 1301                   | OBSERVED                  |
| Composer at rest                 | Gaps between controls          | plus to mode switch 4 pt, mode switch to model pill 4 pt, mic to voice 3 pt; control row 12 pt from the card left, 11 pt from the card right                                                        | 1301                   | OBSERVED                  |
| Composer at rest                 | Distance to screen bottom      | 36 pt (card bottom at y = 2669 px, no keyboard)                                                                                                                                                     | 1301                   | OBSERVED                  |
| Composer with text or attachment | Not shown                      | No typed text, send state or attachment chip appears in the range; the keyboard screenshots show an empty field with a teal caret                                                                   | 1307                   | UNKNOWN                   |
| Model picker                     | Container kind                 | Bottom-anchored sheet that stops 106.7 pt from the top, floats 8 pt from the left, right and bottom edges                                                                                           | 1306                   | OBSERVED                  |
| Model picker                     | Container size and fill        | x 24 to 1260 (412 pt wide), y 320 to 2754 px (811 pt tall), fill #161616, backdrop dims to #0b0b0b                                                                                                  | 1306                   | OBSERVED                  |
| Model picker                     | Container radius               | about 36 pt                                                                                                                                                                                         | 1306                   | ESTIMATED                 |
| Model picker                     | Card                           | One card, x 70 to 1214 (381 pt wide, 15.3 pt inside the sheet), y 545 to 2653 px, fill #1c1c1c, radius about 23 pt                                                                                  | 1306                   | radius ESTIMATED          |
| Model picker                     | Row height                     | 56.4 pt average (169 px pitch) for a single-line row; the first row ("Best") is 83 pt (249 px) because it has a description line                                                                    | 1306                   | OBSERVED                  |
| Model picker                     | Model name                     | cap height 38 px, about 18 pt, regular, #9a9a9a for unselected rows, #dedede for the selected row                                                                                                   | 1306                   | ESTIMATED                 |
| Model picker                     | Description text               | "Best for everyday searches", cap height 37 px, about 17.5 pt, #9a9a9a, regular                                                                                                                     | 1306                   | ESTIMATED                 |
| Model picker                     | Logo                           | 16 to 19 pt (47 to 58 px) wide, left edge at x = 128 to 135 px (43 pt from the screen edge, 19 pt inside the card), vertically centred in the row                                                   | 1306                   | OBSERVED                  |
| Model picker                     | Check mark                     | 17 x 12 pt (51 x 36 px), colour #4e99a3, right edge 22.7 pt inside the card right edge, aligned with the first line of the selected row                                                             | 1306                   | OBSERVED                  |
| Model picker                     | Plan tag                       | "Max" 43.3 x 25.7 pt (130 x 77 px), fill #4e99a3, radius full (about 13 pt), text about 16.5 pt in #161616, 7 pt side padding, 5 pt after the name                                                  | 1306                   | size and radius ESTIMATED |
| Model picker                     | Second tag                     | "New" 45 x 25.3 pt (135 x 76 px), fill #202728, text #4e99a3, same size and spacing, 5 pt after the "Max" tag                                                                                       | 1306                   | OBSERVED                  |
| Model picker                     | Section heading                | None; the sheet has one unlabeled card and a footer line "All models are US hosted" (info icon 13 pt, text about 14.5 pt, #989898)                                                                  | 1306                   | OBSERVED                  |
| Effort or thinking control       | Not shown                      | No effort slider or toggle appears in the range; the Computer mode "Light" chip opens a plan explainer dialog instead                                                                               | 1310                   | UNKNOWN                   |
| Attach or plus menu              | Not shown                      | The plus button is never opened in the range                                                                                                                                                        | 1301                   | UNKNOWN                   |
| Sidebar or drawer                | Kind and width                 | Full-screen page (428 pt wide), not an overlay drawer                                                                                                                                               | 1311                   | OBSERVED                  |
| Sidebar or drawer                | Row height                     | Navigation rows 40 pt (about 120 px pitch); session rows 44 pt (132 px pitch)                                                                                                                       | 1311                   | OBSERVED                  |
| Sidebar or drawer                | Row icon and label             | Navigation icon 15 to 17 pt (44 to 52 px), session search icon 13.3 pt (40 px) at x 58; label left edge 48.7 pt; label about 17.5 pt, regular, #dedede                                              | 1311                   | size ESTIMATED            |
| Sidebar or drawer                | Section heading                | "Projects" and "Sessions", cap height 37 px, about 17.5 pt, #dedede, with an 28 pt round control (84 px, fill #1c1c1c) at the right                                                                 | 1311                   | size ESTIMATED            |
| Sidebar or drawer                | Footer                         | Search field 335 x 44 pt (x 49 to 1055, y about 2521 to 2652), floating, fill #353535 translucent; round 44 pt button (x 1104 to 1236, fill #4f9aa4) beside it, 16 pt gap                           | 1311                   | OBSERVED                  |
| Messages                         | Not shown                      | No conversation appears in the range                                                                                                                                                                | n/a                    | UNKNOWN                   |
| Settings list                    | Row height                     | 54 pt (162 px pitch: 159 px of row plus a 3 px separator)                                                                                                                                           | 1313                   | OBSERVED                  |
| Settings list                    | Row label                      | cap height 37 px, about 17.5 pt, regular, #dedede                                                                                                                                                   | 1313                   | ESTIMATED                 |
| Settings list                    | Value text                     | "Apple Maps", "Default", "Automatic": about 17 pt, #9a9a9a                                                                                                                                          | 1320, 1327             | ESTIMATED                 |
| Settings list                    | Row icon                       | 16.7 pt (50 px), line icon, #dedede, left edge 17.7 pt inside the card                                                                                                                              | 1313                   | OBSERVED                  |
| Settings list                    | Section heading                | cap height 33 px, about 15.5 pt, #dedede, left edge 40 pt (121 px) from the screen edge                                                                                                             | 1313                   | ESTIMATED                 |
| Settings list                    | Card                           | Inset 20 pt, fill #1c1c1c; radius about 27 pt on a single-row card, about 24 pt on a multi-row card                                                                                                 | 1313, 1316             | ESTIMATED                 |
| Settings list                    | Separator                      | 1 pt (3 px), #292929, starts 16 pt inside the card on text-only rows and 48 pt inside on rows with an icon, ends 20 pt before the card right edge                                                   | 1313, 1314             | OBSERVED                  |
| Settings list                    | Toggle                         | 63 x 28 pt (189 x 84 px), on #4e99a3, off #59595c, white knob, right edge 14 pt inside the card                                                                                                     | 1313, 1314             | OBSERVED                  |
| Settings list                    | Chevron                        | 7.3 x 12.3 pt (22 x 37 px), #9a9a9a, right edge 16.7 pt inside the card                                                                                                                             | 1313                   | OBSERVED                  |
| Sheets and dialogs               | Corner radius                  | about 36 pt for sheets, about 28 pt for the centred dialog                                                                                                                                          | 1302, 1310, 1318       | ESTIMATED                 |
| Sheets and dialogs               | Grabber                        | 58 x 4 pt (174 x 12 px), #5c5c5f, centred, 6 pt from the sheet top; only the Incognito sheet has one                                                                                                | 1318                   | OBSERVED                  |
| Sheets and dialogs               | Title text size                | "Models" about 18.5 pt semibold; "Settings" and other page titles about 23 pt; serif titles about 25 pt                                                                                             | 1306, 1314, 1318       | ESTIMATED                 |
| Sheets and dialogs               | Close or back button           | Round 42 pt (126 px) on sheets, 44 pt (132 px) on full-screen pages; glyph 14 pt (42 px); fill #353535 translucent                                                                                  | 1302, 1314             | OBSERVED                  |
| Buttons                          | Primary (teal)                 | "Get Pro": 396 x 52 pt (x 48 to 1236, y 2442 to 2598), fill #4e99a3, radius full, label about 18 pt in #161616                                                                                      | 1303                   | size ESTIMATED            |
| Buttons                          | Secondary (light)              | "Sign in": 320 x 48 pt, fill #dedede, radius full, label about 18 pt in #161616                                                                                                                     | 1301                   | size ESTIMATED            |
| Buttons                          | Dark pill                      | Sign-in sheet buttons: 365 x 46 pt, fill #222222, radius full, label about 18 pt                                                                                                                    | 1302                   | size ESTIMATED            |
| Paywall or upgrade               | Plan card                      | Yearly 189 x 116 pt (x 50 to 617, y 2043 to 2392 px), monthly the same size at x 667 to 1235, radius about 17 pt                                                                                    | 1303                   | radius ESTIMATED          |
| Paywall or upgrade               | Price text                     | "$200" digits 50 px tall, about 23.5 pt, bold, #dedede                                                                                                                                              | 1303                   | ESTIMATED                 |
| Paywall or upgrade               | Feature row height             | 42 pt (126 px pitch)                                                                                                                                                                                | 1303                   | OBSERVED                  |
| Voice mode                       | Not shown                      | Voice mode itself never opens; only the voice settings pages appear                                                                                                                                 | 1325                   | UNKNOWN                   |

## Screens

### 1. Signed-out home (IMG_1301)

The home screen before sign-in, dark theme, no keyboard. A brand orb and a short pitch sit in the middle, a "Sign in" button below them, and the composer rests at the bottom. The top bar shows a person control at the left and a news control at the right.

#### Layout, top to bottom

| Element                                                  | Box px (x, y, w, h)   | Size pt (w x h)       | Anchor                | Fill or colour               | Radius pt             | Status                     |
| -------------------------------------------------------- | --------------------- | --------------------- | --------------------- | ---------------------------- | --------------------- | -------------------------- |
| Profile button (person icon)                             | 60, 141, 132, 132     | 44 x 44               | L 20, top 47          | #323232 translucent          | full                  | OBSERVED                   |
| News button (document icon)                              | 1092, 141, 132, 132   | 44 x 44               | R 20, top 47          | #353535 translucent          | full                  | OBSERVED                   |
| Brand orb (round photo of a mountain with the logo mark) | 424, 765, 434, 435    | 144.7 x 145           | C, top 255            | photo, edge fades to #161616 | full                  | OBSERVED                   |
| Headline                                                 | 435, 1336, 414, 75    | 138 x 25              | C                     | #dedede                      | none                  | OBSERVED                   |
| Sub-headline (two lines)                                 | 168, 1465, 946, 110   | 315.3 x 36.7          | C                     | #989898                      | none                  | OBSERVED                   |
| "Sign in" button                                         | 162, 1725, 960, 144   | 320 x 48              | C, L 54, R 54         | #dedede                      | full (24)             | OBSERVED                   |
| Composer card                                            | 54, 2346, 1176, 323   | 392 x 107.7           | L 18, R 18, bottom 36 | #282828                      | about 24              | OBSERVED, radius ESTIMATED |
| Composer controls                                        | see shared components | see shared components | inside card           | see shared components        | see shared components | OBSERVED                   |

#### Text

| Text                                                                                      | Height px            | Est. size pt | Weight  | Colour  | Align  | Status    |
| ----------------------------------------------------------------------------------------- | -------------------- | ------------ | ------- | ------- | ------ | --------- |
| "Ask a question" (serif)                                                                  | 56 (capital A)       | 26.5         | regular | #dedede | center | ESTIMATED |
| "Get fast, accurate answers from the web, leading AI models, and sources you can verify." | 35 (capital G)       | 16.5         | regular | #989898 | center | ESTIMATED |
| "Sign in"                                                                                 | 39 (capital S)       | 18.5         | medium  | #161616 | center | ESTIMATED |
| "Ask anything..."                                                                         | 38 (capital A)       | 18           | regular | #838383 | left   | ESTIMATED |
| "Model"                                                                                   | about 34 (capital M) | 16           | regular | #a0a0a0 | left   | ESTIMATED |

#### Spacing and notes

- Headline to sub-headline: baseline of the headline to the first line of the sub-headline is about 51 pt apart on screen; the sub-headline line pitch is 22 pt (66 px).
- Sub-headline wraps to two lines and is centred on x = 642.
- Sign in button is 54 pt from each screen edge (162 px), narrower than the composer (18 pt margin).
- The composer holds a plain text field above one row of controls; the search mode is active (dark chip on the magnifier).

### 2. Sign-in sheet (IMG_1302)

A sheet over the dimmed home screen with the brand logo, a sign-up line and four sign-in routes. Dark theme. Backdrop is #0b0b0b. The sheet is 8 pt from the left, right and bottom edges.

#### Layout, top to bottom

| Element                               | Box px (x, y, w, h)             | Size pt (w x h)  | Anchor                                                                   | Fill or colour                   | Radius pt | Status                                                                  |
| ------------------------------------- | ------------------------------- | ---------------- | ------------------------------------------------------------------------ | -------------------------------- | --------- | ----------------------------------------------------------------------- |
| Sheet                                 | 24, 842, 1236, 1912             | 412 x 637        | L 8, R 8, bottom 8                                                       | #161616                          | about 36  | OBSERVED, radius ESTIMATED                                              |
| Close button (x glyph)                | 1075, 900, 127, 127             | 42.3 x 42.3      | inside sheet, R 19, top 19                                               | #353535 translucent              | full      | OBSERVED                                                                |
| Logo mark                             | 540, 1104, 200, about 125       | 66.7 x about 42  | C                                                                        | #1fb8cd                          | none      | OBSERVED, height UNKNOWN (merged with wordmark in one 500 x 310 px box) |
| Wordmark "perplexity"                 | 400, about 1240, 500, about 170 | 166.7 x about 57 | C                                                                        | #fcfcf9                          | none      | width OBSERVED, height ESTIMATED                                        |
| "Continue with Apple" button          | 94, 1616, 1097, 139             | 365.7 x 46.3     | inside sheet, L 23, R 23                                                 | #ffffff                          | full      | OBSERVED                                                                |
| "Continue with Google" button         | 94, 1790, 1097, 138             | 365.7 x 46       | inside sheet, L 23, R 23                                                 | #222222                          | full      | OBSERVED                                                                |
| "Sign in with email" button           | 94, 1963, 1097, 138             | 365.7 x 46       | inside sheet, L 23, R 23                                                 | #222222                          | full      | OBSERVED                                                                |
| "Continue as <account handle>" button | 94, 2138, 1097, 138             | 365.7 x 46       | inside sheet, L 23, R 23                                                 | transparent, 1 px border #202020 | full      | OBSERVED                                                                |
| "Single sign-on (SSO)" text link      | 436, 2396, 410, 43              | 136.7 x 14.3     | C                                                                        | #989898                          | none      | OBSERVED                                                                |
| "Privacy policy" link                 | 97, 2636, 269, 42               | 89.7 x 14        | L 32 (inside sheet L 24), bottom of text about 76 from the screen bottom | #989898                          | none      | OBSERVED                                                                |
| "Terms of service" link               | 861, 2636, 327, 34              | 109 x 11.3       | R 32                                                                     | #989898                          | none      | OBSERVED                                                                |

#### Text

| Text                                 | Height px                      | Est. size pt | Weight  | Colour             | Align       | Status    |
| ------------------------------------ | ------------------------------ | ------------ | ------- | ------------------ | ----------- | --------- |
| "Create an account for free"         | 33 (capital C)                 | 15.5         | regular | #989898            | center      | ESTIMATED |
| "Continue with Apple"                | 41 (capital C, with overshoot) | 18.5         | medium  | #000000 on #ffffff | center      | ESTIMATED |
| "Continue with Google"               | 38 (capital C)                 | 18           | medium  | #dedede            | center      | ESTIMATED |
| "Sign in with email"                 | 38 (capital S)                 | 18           | medium  | #dedede            | center      | ESTIMATED |
| "Continue as <account handle>"       | 34 (capital C)                 | 16           | regular | #989898            | center      | ESTIMATED |
| "Single sign-on (SSO)"               | 34 (capital S)                 | 16           | regular | #989898            | center      | ESTIMATED |
| "Privacy policy", "Terms of service" | 32 (capital P, capital T)      | 15           | regular | #989898            | left, right | ESTIMATED |

#### Spacing and notes

- The four route buttons are stacked with an 11.7 pt (35 px) gap and all share the 365.7 pt width (inside the sheet 23 pt per side). The Apple button is the only filled light one; the Google and email buttons are #222222; the fourth is outline only.
- Each button's icon (Apple mark, Google mark, envelope) sits left of the centred label with about 6 pt gap; the label and icon are centred together.
- Sheet radius is fitted from the left edge: it is 24 px in from the first row at y = 960 px, about 118 px below the top edge (ESTIMATED radius 36 pt).
- Behind the sheet the home screen shows through at about 10 percent (backdrop #0b0b0b, header controls dimmed).
- The two footer links are on the same baseline row, 24 pt from the bottom edge of the sheet.

### 3. Paywall, Pro and Max tabs (IMG_1303, IMG_1304)

A full-screen upgrade page on a dark teal-tinted gradient (top #1c2425 fading to #161616). IMG_1303 shows the Pro tab with two plan cards (Yearly, Monthly) and a "Get Pro" button. IMG_1304 shows the Max tab with one plan card (Monthly) and a "Get Max" button; the model strip has scrolled.

#### Layout, top to bottom

| Element                                 | Box px (x, y, w, h) | Size pt (w x h) | Anchor                                       | Fill or colour           | Radius pt            | Status                     |
| --------------------------------------- | ------------------- | --------------- | -------------------------------------------- | ------------------------ | -------------------- | -------------------------- |
| Close button (x glyph)                  | 59, 141, 134, 132   | 44 x 44         | L 20, top 47                                 | #363c3d translucent      | full                 | OBSERVED                   |
| "Restore" button                        | 957, 141, 268, 132  | 89.3 x 44       | R 20, top 47                                 | #373d3e translucent      | full                 | OBSERVED                   |
| Headline (two lines, serif)             | 297, 341, 693, 236  | 231 x 78.7      | C                                            | #dedede                  | none                 | OBSERVED                   |
| Model strip (logo plus name, scrolling) | 0, 663, 1284, 57    | 428 x 19        | full width, clipped at both edges            | #dedede                  | none                 | OBSERVED                   |
| Plan switch capsule ("Pro", "Max")      | 445, 795, 395, 132  | 131.7 x 44      | C                                            | 1 px border, transparent | full                 | OBSERVED                   |
| Active switch chip                      | 455, 805, 175, 112  | 58.3 x 37.3     | inside capsule, L 3.3                        | #4e99a3                  | full                 | OBSERVED                   |
| Features card                           | 46, 996, 1192, 976  | 397 x 325       | L 15.3, R 15.3                               | #303333 translucent      | about 33             | OBSERVED, radius ESTIMATED |
| Yearly plan card (selected)             | 50, 2043, 567, 349  | 189 x 116.3     | L 16.7                                       | #1c1c1c                  | about 17             | OBSERVED, radius ESTIMATED |
| Monthly plan card (not selected)        | 667, 2043, 568, 349 | 189 x 116.3     | R 16.3                                       | transparent, 1 px border | about 17             | OBSERVED, radius ESTIMATED |
| Selected badge (check on a disc)        | 576, 2023, 60, 60   | 20 x 20         | on the top right corner of the selected card | #4e99a3                  | full                 | OBSERVED                   |
| Discount chip ("-17...")                | 237, 2085, 126, 92  | 42 x 30.7       | inside yearly card                           | #263537                  | UNKNOWN (not fitted) | OBSERVED                   |
| "Get Pro" button                        | 48, 2442, 1188, 156 | 396 x 52        | L 16, R 16, bottom about 60                  | #4e99a3                  | full (26)            | OBSERVED                   |

In IMG_1304 the features card is the same box, and the single "Monthly" plan card spans x 48 to 1236 (396 pt) at the same y and height, with the badge at the card's top right.

#### Text

| Text                                                                                                                                                                                                                                                                                                             | Height px      | Est. size pt | Weight                             | Colour                             | Align                       | Status    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------ | ---------------------------------- | ---------------------------------- | --------------------------- | --------- |
| "Get the most accurate answers" (serif, two lines)                                                                                                                                                                                                                                                               | 88 (capital G) | 41.5         | regular                            | #dedede                            | center                      | ESTIMATED |
| Model strip names (four model names in a row)                                                                                                                                                                                                                                                                    | 36             | 17           | regular                            | #dedede                            | left of each logo, in a row | ESTIMATED |
| "Pro" and "Max" in the switch                                                                                                                                                                                                                                                                                    | 37 (capital P) | 17.5         | regular, medium on the active chip | #161616 active, #989898 inactive   | center                      | ESTIMATED |
| "Features", "Free", "Pro" or "Max" header                                                                                                                                                                                                                                                                        | 37 (capital F) | 17.5         | regular                            | #a1a2a2, "Pro" or "Max" in #4e99a3 | left, right                 | ESTIMATED |
| Feature rows ("Basic search", "Access to top AI models", "Access to Computer", "Access to deep research", "Premium app connectors", "More usage and memory"; on Max "Everything in Pro", "Monthly Computer credits", "Early access to new features", "Access to `<model name>`", "Highest deep research limits") | 37 (capital B) | 17.5         | regular                            | #dedede                            | left                        | ESTIMATED |
| "Yearly", "Monthly"                                                                                                                                                                                                                                                                                              | 33 (capital Y) | 15.5         | regular                            | #9a9a9a                            | left                        | ESTIMATED |
| "$200"                                                                                                                                                                                                                                                                                                           | 50 (digit)     | 23.5         | bold                               | #dedede                            | left                        | ESTIMATED |
| "/yr", "/mo"                                                                                                                                                                                                                                                                                                     | 43             | 20           | regular                            | #9a9a9a                            | left, baseline of price     | ESTIMATED |
| "$17/mo", "$240/yr", "$2,400/yr"                                                                                                                                                                                                                                                                                 | 41             | about 15.5   | regular                            | #9a9a9a                            | left                        | ESTIMATED |
| "-17..." in the chip                                                                                                                                                                                                                                                                                             | 36 (digits)    | 17           | regular                            | #4e99a3                            | left                        | ESTIMATED |
| "Get Pro" or "Get Max"                                                                                                                                                                                                                                                                                           | 39 (capital G) | 18.5         | medium                             | #161616                            | center                      | ESTIMATED |

#### Spacing and notes

- Headline is two lines; line pitch is 46.7 pt (140 px, baseline to baseline). Headline sits 31 pt below the Restore and close controls.
- Features card rows are 42 pt apart (126 px pitch); the first data row's check sits 42 pt below the header row. Left text edge is 41 pt from the screen edge (26 pt inside the card). Free column marks are a dash 15.3 x 1 pt (46 x 3 px) at x 974 to 1020, or a #a1a2a2 check 11.7 x 8 pt at x 978; the Pro or Max column marks are #4e99a3 checks 11.7 x 8 pt at x 1122 to 1157.
- The Yearly card holds the chip next to the label, the price on the next line (about 23.5 pt), and the per-month figure under it. The selected card is #1c1c1c; the other is outline only.
- Gap between the two plan cards is 16.7 pt (50 px). Gap between the plan cards and the button is 16 pt (50 px). The model strip is a marquee: the logos and names are clipped at both screen edges (IMG_1303 cuts the first name at the left edge, IMG_1304 shows it scrolled).
- Switching Pro to Max replaces the feature list, the plan cards (two become one) and the button label; the headline, strip and switch stay.

### 4. Signed-in home, Search and Computer modes (IMG_1305, IMG_1307, IMG_1308, IMG_1309)

The signed-in home. IMG_1305 is Search mode at rest (composer controls as on screen 1). IMG_1309 is Computer mode at rest. IMG_1307 and IMG_1308 are Computer mode with the keyboard open and the field focused (the two differ only in the animated background). In Computer mode the whole screen changes: the bottom half turns teal-tinted, the empty state shows a computer icon, and the placeholder becomes "Do anything...".

#### Layout, top to bottom (IMG_1305)

| Element                            | Box px (x, y, w, h)                          | Size pt (w x h) | Anchor                       | Fill or colour                                | Radius pt | Status                           |
| ---------------------------------- | -------------------------------------------- | --------------- | ---------------------------- | --------------------------------------------- | --------- | -------------------------------- |
| Avatar with status dot             | 66, 147, 120, 120                            | 40 x 40         | L 22, top 49                 | #004d40                                       | full      | OBSERVED                         |
| Wordmark                           | 228, 171, 343, 72                            | 114.3 x 24      | L 76                         | #dedede                                       | none      | OBSERVED                         |
| Incognito button (glasses icon)    | 924, 141, 132, 132                           | 44 x 44         | R 76, top 47                 | #353535 translucent                           | full      | OBSERVED                         |
| News button                        | 1092, 141, 132, 132                          | 44 x 44         | R 20, top 47                 | #353535 translucent                           | full      | OBSERVED                         |
| "Upgrade plan" banner              | 36, 328, 1212, 131                           | 404 x 43.7      | L 12, R 12, top 109          | #283335 translucent, 1 px lighter teal border | about 20  | OBSERVED, radius ESTIMATED       |
| Banner icon (circle with up arrow) | 83, 368, 50, 50                              | 16.7 x 16.7     | inside banner, L 15.7        | #4e99a3                                       | none      | OBSERVED                         |
| Banner chevron                     | 1171, 378, 16, 30                            | 5.3 x 10        | inside banner, R 20          | #4e99a3                                       | none      | OBSERVED                         |
| Brand mark (empty state, dimmed)   | about 410, 668, 104, 112                     | about 35 x 37   | C                            | #3b3d41                                       | none      | ESTIMATED from the display image |
| Recent search rows (five)          | text from x 196, first row y 1751, pitch 120 | row pitch 40    | L 65 for text, L 35 for icon | text #dedede, icon #989898                    | none      | OBSERVED                         |
| Composer card                      | 54, 2346, 1176, 323                          | 392 x 107.7     | L 18, R 18, bottom 36        | #282828                                       | about 24  | OBSERVED                         |

IMG_1309 and IMG_1307 differences: the page gains a teal gradient that starts about 50 percent down and reaches #2c5155 at the bottom; the composer fill becomes #1d3538 (still 54 to 1230 px wide, 2346 to 2669 px in IMG_1309); in IMG_1309 the computer slot of the mode switch is the dark chip (#161616, x 333 to 453) and the magnifier slot is dim; the model pill reads "Light" with a small dotted icon (about 29 px) before it, 34 pt tall, x 474 to 676; the recent search rows and the "Upgrade plan" banner are unchanged. IMG_1309 shows the brand mark replaced by a teal computer icon (104 x 87 px, about 35 x 29 pt) at about y 680 to 770 px.

IMG_1307 and IMG_1308 differences: the composer card moves up to sit above the keyboard: y 1373 to 1692 px (h 319 px, 106.3 pt), same x 54 to 1230; 15 pt (46 px) of space between the card bottom and the keyboard top; the recent searches are hidden; a field of faint binary digits fills the space between the banner and the composer; the placeholder reads "Do anything..." with a teal (#1fb8cd) caret 15 x 66 px at x 105. The keyboard top is at y = 1736 px (579 pt), the keyboard is the iOS system keyboard (full width, 428 pt, fill #1b2c2e, keys #414e4f, key 36 x 42.3 pt at a 42 pt column pitch and 56 pt row pitch, top corner radius about 33 pt ESTIMATED), with a QuickType bar of three suggestions at the top (suggestion text about 18 pt, #a1a7a8), and the emoji and dictation keys in the bottom row.

#### Text

| Text                                                      | Height px                 | Est. size pt | Weight                                         | Colour            | Align | Status    |
| --------------------------------------------------------- | ------------------------- | ------------ | ---------------------------------------------- | ----------------- | ----- | --------- |
| "Upgrade plan"                                            | 34 (capital U)            | 16           | regular                                        | #4e99a3           | left  | ESTIMATED |
| Recent search row text (placeholders: <chat title> style) | 39 (ascender height)      | about 17.5   | regular, semibold on the row with the teal dot | #dedede           | left  | ESTIMATED |
| "Ask anything..." / "Do anything..."                      | 38 (capital A, capital D) | 18           | regular                                        | #838383 / #7e898a | left  | ESTIMATED |
| "Model" / "Light"                                         | about 34                  | 16           | regular                                        | #a0a0a0           | left  | ESTIMATED |

#### Spacing and notes

- Header: avatar, wordmark and the two buttons share one row centred at y = 207 px (69 pt). The wordmark is 14 pt after the avatar.
- The banner sits 18 pt below the header controls' bottom edge (273 to 328 px, 18 pt) and spans nearly the full width (12 pt margins).
- Recent rows: icon (13.3 pt magnifier, or an 8 pt teal dot at x 114 for the highlighted row) at x 106 (35 pt), text at x 196 (65 pt). Rows are 40 pt apart; the last row ends 24 pt above the composer top.
- The composer is in the same screen position in IMG_1301, IMG_1305 and IMG_1309 (card top y = 2346 px, bottom 2669 px). Only the fill, placeholder, active slot and model label change with the mode.

### 5. Models sheet (IMG_1306)

The model picker: a sheet over the dimmed signed-in home (the avatar, wordmark and buttons are visible, dimmed, above it). A "Models" title with a close button, then one card with twelve model rows, then a footer note. The first row ("Best") is selected: it shows its description and a teal check. All other rows are one line.

#### Layout, top to bottom

| Element                                       | Box px (x, y, w, h)                                                                        | Size pt (w x h) | Anchor                                 | Fill or colour                              | Radius pt | Status                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------- | -------------------------------------- | ------------------------------------------- | --------- | -------------------------- |
| Backdrop                                      | 0, 0, 1284, 2778                                                                           | 428 x 926       | full screen                            | #0b0b0b (home dimmed)                       | none      | OBSERVED                   |
| Sheet                                         | 24, 320, 1236, 2434                                                                        | 412 x 811.3     | L 8, R 8, top 106.7, bottom 8          | #161616                                     | about 36  | OBSERVED, radius ESTIMATED |
| Title "Models"                                | 553, 421, 180, 39                                                                          | 60 x 13         | C, 33 pt below the sheet top (cap top) | #ffffff                                     | none      | OBSERVED                   |
| Close button (x glyph)                        | 1076, 380, 126, 124                                                                        | 42 x 41.3       | inside sheet, R 19, top 20             | #383838 translucent                         | full      | OBSERVED                   |
| Models card                                   | 70, 545, 1144, 2108                                                                        | 381.3 x 702.7   | inside sheet, L 15.3, R 15.3           | #1c1c1c                                     | about 23  | OBSERVED, radius ESTIMATED |
| Row 1 "Best" (icon, name, description, check) | card x, 545 to 794                                                                         | 381.3 x 83      | in card                                | #1c1c1c                                     | none      | OBSERVED                   |
| Separator, row 1 to row 2                     | 71, 793, 1142, 2                                                                           | 380.7 x 0.7     | full card width                        | #515151 (1 px line, next pixel row #232323) | none      | OBSERVED                   |
| Rows 2 to 12                                  | each 169 px pitch (794, 962, 1132, 1302, 1470, 1639, 1809, 1979, 2147, 2315, 2485 to 2653) | 381.3 x 56.3    | in card                                | #1c1c1c                                     | none      | OBSERVED                   |
| Footer info icon (circle with i)              | 108, 2695, 39, 39                                                                          | 13 x 13         | L 36                                   | #989898                                     | none      | OBSERVED                   |
| Footer text                                   | 169, 2698, 463, 33                                                                         | 154.3 x 11      | L 56.3                                 | #989898                                     | none      | OBSERVED                   |

Contents of the rows, in order, with logo, name and tag: "Best" (chip icon, selected, check), then eleven model rows, each a provider mark and a model name. The third, fourth, seventh and eighth rows carry a "Max" tag, and the fourth also a "New" tag.

#### Model rows, element measurements

| Element                     | Box px (x, y, w, h)                          | Size pt (w x h)  | Anchor                     | Fill or colour | Radius pt       | Status                     |
| --------------------------- | -------------------------------------------- | ---------------- | -------------------------- | -------------- | --------------- | -------------------------- |
| Row 1 icon (processor chip) | 133, 601, 48, 49                             | 16 x 16.3        | inside card, L 21          | #dddddd        | none            | OBSERVED                   |
| Row 1 name "Best"           | 213, 612, 100, 37                            | 33.3 x 12.3      | inside card, L 47.7        | #dedede        | none            | OBSERVED                   |
| Row 1 description           | 213, 693, 400 wide, 37                       | about 133 x 12.3 | inside card, L 47.7        | #9a9a9a        | none            | OBSERVED                   |
| Row 1 check mark            | 1095, 611, 51, 36                            | 17 x 12          | inside card, R 22.7        | #4e99a3        | none            | OBSERVED                   |
| Row 2 logo (GPT)            | 131, 849, 51, 51                             | 17 x 17          | L 43.7                     | #9a9a9a        | none            | OBSERVED                   |
| Row 2 name (a model name)   | 212, 860, 251, 38                            | 83.7 x 12.7      | inside card, L 47.3        | #9a9a9a        | none            | OBSERVED                   |
| Row 3 "Max" tag             | 499, 1009, 130, 77                           | 43.3 x 25.7      | 5 pt after the name        | #4e99a3        | full (about 13) | OBSERVED, radius ESTIMATED |
| Row 4 logo (Gemini star)    | 128, 1185, 58, 58                            | 19.3 x 19.3      | L 42.7                     | #9a9a9a        | none            | OBSERVED                   |
| Row 4 "Max" tag             | 601, 1179, 131, 77                           | 43.7 x 25.7      | 5.3 pt after the name      | #4e99a3        | full            | OBSERVED                   |
| Row 4 "New" tag             | 743, 1180, 135, 76                           | 45 x 25.3        | 3.7 pt after the "Max" tag | #202728        | full            | OBSERVED                   |
| Logos on rows 5 to 12       | widths 47 to 58 px, left edges 128 to 135 px | 15.7 to 19.3     | L 42.7 to 45               | #9a9a9a        | none            | OBSERVED                   |

#### Text

| Text                         | Height px             | Est. size pt | Weight   | Colour  | Align  | Status    |
| ---------------------------- | --------------------- | ------------ | -------- | ------- | ------ | --------- |
| "Models"                     | 39 (capital M)        | 18.5         | semibold | #ffffff | center | ESTIMATED |
| "Best"                       | 37 (capital B)        | 17.5         | regular  | #dedede | left   | ESTIMATED |
| "Best for everyday searches" | 37 (capital B)        | 17.5         | regular  | #9a9a9a | left   | ESTIMATED |
| Model names                  | 38 (digit or capital) | 18           | regular  | #9a9a9a | left   | ESTIMATED |
| "Max" in the tag             | 35 (capital M)        | 16.5         | medium   | #161616 | center | ESTIMATED |
| "New" in the tag             | about 35              | 16.5         | medium   | #4e99a3 | center | ESTIMATED |
| "All models are US hosted"   | 31 (capital A)        | 14.5         | regular  | #989898 | left   | ESTIMATED |

#### Spacing and notes

- Sheet: floats 8 pt in from the left, right and bottom edges; top edge at 106.7 pt. Title cap top is 33 pt below the sheet top; title and close button share one centre line (y = 441 px).
- Card sits 75 pt (225 px) below the sheet top, 15.3 pt inside the sheet sides. Card radius fitted from the left edge: the edge is 26 px in at 15 px below the top and reaches the straight side about 95 px down, which fits a radius of 70 px (23 pt).
- Row layout: logo column starts 20 pt inside the card and is about 19 pt wide; the name starts 47 pt inside the card, so the gap between logo right edge and name is about 9 to 10 pt. Names are vertically centred on the logo (logo centre y 874.5 px, name cap centre 879 px in row 2).
- Row 1 padding: name cap top is 22 pt (67 px) below the card top; description cap top is 27 pt (81 px) below the name cap top; the row ends 21 pt (64 px) below the description cap bottom.
- Rows are separated by 1 px lines (#515151) running the full card width; no line below the last row.
- Unselected rows use #9a9a9a for the name; the selected row uses #dedede and shows the description and the check. Plan tags sit directly after the name text (5 pt gap), not in a right column.
- The sheet shows all twelve rows without scrolling; the card bottom is at y = 2653 px and its bottom corners are rounded the same as the top. The footer row is 12 pt below the card bottom.
- There are no section headings inside the sheet.
- Behind the sheet top edge a second faint rounded edge shows 3 px above it (the sheet is stacked on the home screen).

### 6. Mode explainer dialog (IMG_1310)

A centred dialog over a blurred home screen, opened from the "Light" chip in the composer (Computer mode). It explains the mode and offers an upgrade. The background is the blurred Computer-mode home with the teal gradient at the bottom.

#### Layout, top to bottom

| Element                 | Box px (x, y, w, h)  | Size pt (w x h) | Anchor                  | Fill or colour                   | Radius pt | Status                     |
| ----------------------- | -------------------- | --------------- | ----------------------- | -------------------------------- | --------- | -------------------------- |
| Blurred backdrop        | 0, 0, 1284, 2778     | 428 x 926       | full screen             | #161616 with blurred shapes      | none      | OBSERVED                   |
| Dialog title "Light"    | 582, 1160, 125, 38   | 41.7 x 12.7     | C                       | #dedede                          | none      | OBSERVED                   |
| Dialog card             | 54, 1274, 1176, 404  | 392 x 134.7     | L 18, R 18              | #111111, 1 px top border #4d4d4d | about 28  | OBSERVED, radius ESTIMATED |
| Body text (two lines)   | 130, 1341, 846, 119  | 282 x 39.7      | inside card, L 25.3     | #979797                          | none      | OBSERVED                   |
| "Upgrade to Pro" button | 102, 1510, 1080, 120 | 360 x 40        | inside card, L 16, R 16 | #dedede                          | full (20) | OBSERVED                   |

#### Text

| Text                                                                       | Height px      | Est. size pt | Weight  | Colour  | Align  | Status    |
| -------------------------------------------------------------------------- | -------------- | ------------ | ------- | ------- | ------ | --------- |
| "Light"                                                                    | 38 (capital L) | 18           | medium  | #dedede | center | ESTIMATED |
| "Light mode is best for everyday tasks. Upgrade for more advanced models." | 37 (capital L) | 17.5         | regular | #979797 | left   | ESTIMATED |
| "Upgrade to Pro"                                                           | 34 (capital U) | 16           | medium  | #161616 | center | ESTIMATED |

#### Spacing and notes

- The title sits 25.3 pt (76 px) above the card top and is centred on x = 645.
- Body line pitch is 26 pt (78 px). The card's inner padding is 25 pt left (130 - 54 = 76 px) and 16 pt around the button (48 px).
- Card is 18 pt from each screen edge (same inset as the composer) and is darker than the page (#111111 on #161616), with a 1 px light top edge.

### 7. Sidebar page (IMG_1311)

The history and navigation page, reached from the person control on the home screen. Full screen, dark theme, scrolled to the top. The search field and a "new" button float at the bottom over the list.

#### Layout, top to bottom

| Element                                | Box px (x, y, w, h)                                         | Size pt (w x h) | Anchor                  | Fill or colour               | Radius pt | Status                                     |
| -------------------------------------- | ----------------------------------------------------------- | --------------- | ----------------------- | ---------------------------- | --------- | ------------------------------------------ |
| Settings button (gear)                 | 60, 141, 132, 132                                           | 44 x 44         | L 20, top 47            | #353535 translucent          | full      | OBSERVED                                   |
| Notifications button (bell)            | 228, 141, 132, 132                                          | 44 x 44         | L 76                    | #353535 translucent          | full      | OBSERVED                                   |
| Account handle text (<account handle>) | 398, 185, 511, 64                                           | 170.3 x 21.3    | L 132.7                 | #ffffff                      | none      | OBSERVED                                   |
| Forward button (arrow)                 | 1092, 141, 132, 132                                         | 44 x 44         | R 20, top 47            | #353535 translucent          | full      | OBSERVED                                   |
| "Artifacts" row                        | icon 56, 365, 44, 44; text 145, 368, 207, 40                | row 40          | L 18.7 icon, L 48 text  | icon and text #dedede        | none      | OBSERVED                                   |
| "Automations" row                      | icon 53, 482, 50, 52; text 145, 489, 303, 39                | row 40          | same                    | #dedede                      | none      | OBSERVED                                   |
| "Plugins" row                          | icon 56, 605, 44, 44; text 148, 608, 166, 50                | row 40          | same                    | #dedede                      | none      | OBSERVED                                   |
| "Projects" heading                     | 52, 783, 193, 48                                            | 64.3 x 16       | L 17                    | #dedede                      | none      | OBSERVED                                   |
| Projects expand control (chevron)      | 1152, 759, 84, 84                                           | 28 x 28         | R 16                    | #1c1c1c                      | full      | OBSERVED                                   |
| "Sessions" heading                     | 50, 915, 210, 39                                            | 70 x 13         | L 16.7                  | #dedede                      | none      | OBSERVED                                   |
| Sessions filter control                | 1152, 891, 84, 84                                           | 28 x 28         | R 16                    | #1c1c1c                      | full      | OBSERVED                                   |
| Session rows                           | first icon 58, 1039, 40, 40; text from x 148; row pitch 132 | row 44          | icon L 19.3, text L 49  | icon #989898, text #dedede   | none      | OBSERVED                                   |
| Highlighted session row dot            | 66, 1311, 24, 24                                            | 8 x 8           | L 22                    | #4e99a3                      | full      | OBSERVED                                   |
| Search field                           | 49, 2521, 1006, 131                                         | 335 x 43.7      | L 16.3, bottom about 42 | #353535 translucent, blurred | full      | OBSERVED (top edge read within about 5 px) |
| New-session button (pencil)            | 1104, 2521, 132, 131                                        | 44 x 43.7       | R 16                    | #4f9aa4                      | full      | OBSERVED                                   |

#### Text

| Text                                  | Height px                                       | Est. size pt | Weight                           | Colour  | Align | Status    |
| ------------------------------------- | ----------------------------------------------- | ------------ | -------------------------------- | ------- | ----- | --------- |
| <account handle>                      | 51 (letter d ascender); capital height about 48 | about 23     | medium                           | #ffffff | left  | ESTIMATED |
| "Artifacts", "Automations", "Plugins" | 37 (capital A)                                  | 17.5         | regular                          | #dedede | left  | ESTIMATED |
| "Projects", "Sessions"                | 37 (capital P)                                  | 17.5         | medium                           | #dedede | left  | ESTIMATED |
| Session rows (<chat title>)           | 39 (ascender height)                            | 17.5         | regular, semibold on the dot row | #dedede | left  | ESTIMATED |
| "Search sessions, projects, and..."   | 43 (capital S with descender context)           | about 18.5   | regular                          | #838383 | left  | ESTIMATED |

#### Spacing and notes

- Header controls share one row at y = 141 px with a 12 pt gap (36 px) between gear and bell, and a 12.7 pt gap before the handle text. The forward button mirrors the gear at the right.
- Navigation rows start 31 pt (92 px) below the header controls. The three navigation rows are 40 pt apart and have no separators.
- "Projects" starts 49 pt below the last navigation row; the section controls are right-aligned at 16 pt.
- Session rows have no separators and no fills. The list scrolls under the floating search field (the bottom rows are cut off by the field).
- The search field is a translucent pill with a 15 pt magnifier glyph (45 px) and 18.5 pt placeholder; the new-session button is the same height (44 pt) with a 16 pt gap between them.

### 8. Settings (IMG_1312, IMG_1313, IMG_1314, IMG_1329)

The main settings page, opened from the gear in the sidebar. A full-screen page sheet that starts at y = 141 px (47 pt), top corner radius about 37 pt, with a close button and a centred title. IMG_1312 is scrolled to the top (profile block, upgrade banner, "Account" and the start of "App"). IMG_1313 is scrolled down (the list from "Account" to "Support"; the title bar becomes a frosted band over the banner). IMG_1314 is scrolled to the bottom (end of "App", "Support", legal rows, sign out, version line). IMG_1329 is the top state with the account switcher popover open.

#### Layout, top to bottom (IMG_1312)

| Element                                           | Box px (x, y, w, h)                          | Size pt (w x h) | Anchor                       | Fill or colour                                  | Radius pt            | Status                                           |
| ------------------------------------------------- | -------------------------------------------- | --------------- | ---------------------------- | ----------------------------------------------- | -------------------- | ------------------------------------------------ |
| Page sheet                                        | 0, 141, 1284, 2637                           | 428 x full      | top 47, L 0, R 0             | #161616 (slightly lighter, #181819, at the top) | about 37 top corners | OBSERVED, radius ESTIMATED                       |
| Close button (x glyph)                            | 60, 201, 132, 132                            | 44 x 44         | L 20, 20 below the sheet top | #3b3b3b translucent                             | full                 | OBSERVED                                         |
| Title "Settings"                                  | 519, 245, 246, 64                            | 82 x 21.3       | C                            | #dedede                                         | none                 | OBSERVED                                         |
| Profile avatar                                    | 546, 387, 192, 192                           | 64 x 64         | C                            | #1e4b40                                         | full                 | OBSERVED                                         |
| Account name (<account handle>) with down chevron | 385, 625, 454, 56 (chevron 863, 639, 28, 16) | 151.3 x 18.7    | C                            | #dedede                                         | none                 | OBSERVED                                         |
| Upgrade banner (photo card)                       | 60, 738, 1164, 1027                          | 388 x 342.3     | L 20, R 20                   | photo with dark overlay                         | about 33 ESTIMATED   | OBSERVED (top and bottom edges read within 5 px) |
| Banner wordmark "perplexity pro"                  | 132, 810, 468, 78                            | 156 x 26        | inside banner, L 24          | #dedede                                         | none                 | OBSERVED                                         |
| Banner text (two lines)                           | 136, 932, about 940, 118                     | about 313 x 39  | inside banner, L 25          | #dedede                                         | none                 | OBSERVED                                         |
| "Get Pro" button with arrow                       | 133, 1551, 1017, 138                         | 339 x 46        | inside banner, L 24, R 24    | #e2e2e2 translucent                             | full                 | OBSERVED                                         |
| "Account" heading                                 | 121, 1883, 169, 43                           | 56.3 x 14.3     | L 40                         | #dedede                                         | none                 | OBSERVED                                         |
| "Manage Account" card                             | 60, 1963, 1164, 162                          | 388 x 54        | L 20, R 20                   | #1c1c1c                                         | about 27             | OBSERVED, radius ESTIMATED                       |
| "App" heading                                     | 121, 2300 (approx)                           |                 | L 40                         | #dedede                                         | none                 | position ESTIMATED from display                  |

IMG_1313 rows (scrolled): "Account" heading cap top y = 533 px; "Manage Account" card y 613 to 775 px; "App" heading cap top y = 894 px; "App" card y 974 to 2108 px, seven rows of 54 pt: "Notifications" (bell, chevron), "Tasks" (calendar with clock, chevron), "Incognito Mode" (glasses, toggle), "Connectors" (plug, chevron), "Preferences" (sliders, chevron), "Personalize" (graph nodes, chevron), "Two-factor authentication" (shield, chevron). "Support" heading cap top y about 2210 px, then a card starting at y 2300 px.

IMG_1314 rows (scrolled to the bottom): the "Support" card y 696 to 1506 px with five rows of 54 pt ("Get started", "Help & FAQ", "Contact Support", "X", "Discord"; chevrons, no icons); a second card y 1578 to 2226 px with four rows ("Ad measurement" with a toggle in the on state, "Privacy policy", "Terms of service", "Sign out" in #dc6973 with a chevron); a centred version line at y = 2400 px ("Perplexity v26.43.0", build number); the floating "Search settings" field at the bottom.

#### Search field and band

| Element                         | Box px (x, y, w, h)     | Size pt (w x h) | Anchor                | Fill or colour                          | Radius pt | Status                                                                        |
| ------------------------------- | ----------------------- | --------------- | --------------------- | --------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| "Search settings" field         | 85, 2552, 1114, 132     | 371 x 44        | L 28, bottom about 42 | #3a3a3a to #363636 translucent, blurred | full      | OBSERVED (read on the Connectors page with the same component, see screen 12) |
| Title band on scroll (IMG_1313) | 0, 141, 1284, about 160 | 428 x about 53  | top 47                | frosted over the banner image           | UNKNOWN   | ESTIMATED from the display image                                              |

#### Text

| Text                                                  | Height px                 | Est. size pt | Weight  | Colour  | Align  | Status    |
| ----------------------------------------------------- | ------------------------- | ------------ | ------- | ------- | ------ | --------- |
| "Settings"                                            | 51 (capital S)            | 24           | medium  | #dedede | center | ESTIMATED |
| <account handle>                                      | about 56 (with descender) | about 22     | regular | #dedede | center | ESTIMATED |
| "perplexity pro"                                      | 78 (with descenders)      | about 36     | regular | #dedede | left   | ESTIMATED |
| "Unlock more Computer usage and more advanced models" | 36 (capital U)            | 17           | regular | #dedede | left   | ESTIMATED |
| "Get Pro"                                             | 38 (capital G)            | 18           | medium  | #161616 | center | ESTIMATED |
| Section headings "Account", "App", "Support"          | 33 (capital A)            | 15.5         | medium  | #dedede | left   | ESTIMATED |
| Row labels                                            | 37 (capital N)            | 17.5         | regular | #dedede | left   | ESTIMATED |
| "Sign out"                                            | about 37                  | 17.5         | regular | #dc6973 | left   | ESTIMATED |
| Version line                                          | about 30                  | about 14     | regular | #989898 | center | ESTIMATED |

#### Spacing and notes

- Rows: 54 pt (159 px plus a 3 px separator). Icon column: icon 16.7 pt, left edge 17.7 pt inside the card (x 113 px); label left edge at x = 208 px (69 pt) on rows with an icon, x = 111 px (37 pt) on rows without (Support card). Separators are 1 pt (3 px), #292929, start at x = 204 px (icon rows) or x = 108 px (text rows) and end at x = 1164 px.
- Toggle (Incognito Mode in IMG_1313, off; Ad measurement in IMG_1314, on): 189 x 84 px, x 993 to 1182, white knob 83 px; off track #59595c, on track #4e99a3. When Incognito is turned on, the track is dark teal (#376d74 in IMG_1318).
- Heading to card: the heading's cap top is 80 px (26.7 pt) above its card; the card bottom to the next heading's cap top is 119 px (39.7 pt).
- A page-title band: while scrolling, the header (close button and title) stays fixed and the content scrolls under it; in IMG_1313 the banner image is visible behind the title in a frosted band.
- IMG_1329 (account switcher): the profile block is the same. A translucent popover with a small caret (caret about 80 px wide at x 600 to 680, top at y about 691 px) opens below the account name, spanning about x 193 to 1090 (299 pt wide) and y about 730 to 1108 (126 pt tall), fill #353533 to #3b3d3b over the photo, large radius (the display shows a radius of at least 40 pt), all ESTIMATED from the displayed image because the surface is translucent over a photo. It holds the current account (small avatar 22 pt, <account handle> and <email> truncated with an ellipsis, a teal check circle at the right) and an "Add account" row with a person-plus icon, separated by a 1 px line. Text inside: handle line about 17.5 pt, email line about 16 pt, "Add account" about 17.5 pt. The page behind is unchanged and the banner text is partly covered by the popover.

### 9. Incognito sheet (IMG_1318)

A bottom sheet over the dimmed Settings page, opened by turning on the "Incognito Mode" toggle (the toggle behind it is on, track #376d74). It explains the mode and offers to turn it off.

#### Layout, top to bottom

| Element                   | Box px (x, y, w, h)  | Size pt (w x h) | Anchor                  | Fill or colour               | Radius pt | Status                                                                                         |
| ------------------------- | -------------------- | --------------- | ----------------------- | ---------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| Sheet                     | 24, 1500, 1236, 1254 | 412 x 418       | L 8, R 8, bottom 8      | #161616                      | about 36  | OBSERVED, radius ESTIMATED (fitted from the left edge at 30, 60, 100 and 150 px below the top) |
| Grabber                   | 555, 1518, 174, 12   | 58 x 4          | C, 6 from the sheet top | #5c5c5f                      | full      | OBSERVED                                                                                       |
| Icon disc (glasses icon)  | 561, 1696, 164, 164  | 54.7 x 54.7     | C                       | #1c1c1c, 1 px border #2a2a2a | full      | OBSERVED                                                                                       |
| Title (serif)             | 429, 1944, 427, 73   | 142.3 x 24.3    | C                       | #ffffff                      | none      | OBSERVED                                                                                       |
| Body (three lines)        | 105, 2108, 1076, 198 | 358.7 x 66      | C, L 35                 | #fefefe                      | none      | OBSERVED                                                                                       |
| "Turn off Incognito" link | 441, 2402, 401, 49   | 133.7 x 16.3    | C                       | #4e99a3                      | none      | OBSERVED                                                                                       |

#### Text

| Text                                                                                                                       | Height px      | Est. size pt | Weight  | Colour  | Align  | Status    |
| -------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------ | ------- | ------- | ------ | --------- |
| "Incognito Mode" (serif)                                                                                                   | 53 (capital I) | 25           | regular | #ffffff | center | ESTIMATED |
| "Perplexity doesn't save your activity in incognito mode, and sessions won't appear in your library after you close them." | 36 (capital P) | 17           | regular | #fefefe | center | ESTIMATED |
| "Turn off Incognito"                                                                                                       | 36 (capital T) | 17           | regular | #4e99a3 | center | ESTIMATED |

#### Spacing and notes

- Sheet top at 500 px above the bottom is 1500 px, so it covers 45 percent of the screen. The sheet has a lot of empty space below the link (the link ends 303 px above the sheet bottom).
- Gaps: grabber to icon disc 22 pt (66 px); disc bottom to title cap top 28 pt (84 px); title to body 30 pt; body line pitch 25 pt (75 px); body to link 32 pt.
- The Settings page behind is dimmed to about 55 percent; rows are visible down to the "Connectors" row.

### 10. Account page (IMG_1315)

The account details page, pushed from "Manage Account". Same page sheet as Settings, with a back button (chevron) instead of close and the title "Account". The content is a flat list on the page background, not cards.

#### Layout, top to bottom

| Element                   | Box px (x, y, w, h)                                                                                               | Size pt (w x h) | Anchor                       | Fill or colour                                        | Radius pt | Status                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------- | ----------------------------------------------------- | --------- | ---------------------- |
| Back button (chevron)     | 60, 201, 132, 132                                                                                                 | 44 x 44         | L 20, 20 below the sheet top | #3b3b3b translucent                                   | full      | OBSERVED               |
| Title "Account"           | centred at y = 270                                                                                                |                 | C                            | #dedede                                               | none      | OBSERVED               |
| Avatar                    | 534, 435, 216, 216                                                                                                | 72 x 72         | C                            | #004d40                                               | full      | OBSERVED               |
| Edit badge on the avatar  | about 691, 594, 62, 60                                                                                            | about 20 x 20   | bottom right of the avatar   | dark disc with a pencil                               | full      | ESTIMATED from display |
| Separator                 | 48, 720, 1140, 3                                                                                                  | 380 x 1         | L 16, R 32                   | #353537                                               | none      | OBSERVED               |
| "Username" row            | 48, 723 to 888                                                                                                    | 380 x 55        | L 16                         | label #dedede, value #7a7a7a                          | none      | OBSERVED               |
| "Email" row               | 48, 891 to 1056                                                                                                   | 380 x 55        | L 16                         | label #dedede, value #7a7a7a                          | none      | OBSERVED               |
| "AI Data Retention" block | label at 49, 1106; description 49 to 980, 1192 to 1404; toggle 1047, 1207, 189, 84                                |                 | L 16                         | label #dedede, description #989898, toggle on #4e99a3 | none      | OBSERVED               |
| "Clear history"           | 51, 1505, 259, 44                                                                                                 | 86.3 x 14.7     | L 17                         | #dc6973                                               | none      | OBSERVED               |
| "Delete account" row      | warning icon 100, 1686, 40, 35; label 172, 1695, 311, 36; sub-text 100, 1783, 748, 41; chevron 1155, 1734, 23, 40 |                 | L 33                         | label #dc6973, sub-text #989898                       | none      | OBSERVED               |

#### Text

| Text                                                                                                                                                       | Height px            | Est. size pt | Weight  | Colour  | Align                                                  | Status    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------ | ------- | ------- | ------------------------------------------------------ | --------- |
| "Account" (title)                                                                                                                                          | about 49             | 23           | medium  | #dedede | center                                                 | ESTIMATED |
| "Username", "Email"                                                                                                                                        | 34 (capital U)       | 16           | regular | #dedede | left                                                   | ESTIMATED |
| <username>, <email> values                                                                                                                                 | 43 (with descenders) | about 17     | regular | #7a7a7a | right, ending at x = 1160 (username), x = 1236 (email) | ESTIMATED |
| "AI Data Retention"                                                                                                                                        | 33 (capital A)       | 15.5         | regular | #dedede | left                                                   | ESTIMATED |
| "AI Data Retention allows Perplexity to use your searches to improve AI models. Turn this setting off if you wish to exclude your data from this process." | 31 to 33 (capital A) | 15.5         | regular | #989898 | left, wraps to four lines in a 235 pt column           | ESTIMATED |
| "Clear history"                                                                                                                                            | 33 (capital C)       | 15.5         | regular | #dc6973 | left                                                   | ESTIMATED |
| "Delete account"                                                                                                                                           | 36 (capital D)       | 17           | regular | #dc6973 | left                                                   | ESTIMATED |
| "For deleting your account permanently"                                                                                                                    | 36                   | 16           | regular | #989898 | left                                                   | ESTIMATED |

#### Spacing and notes

- Rows are 56 pt apart (168 px pitch) between separators; the separators span x 48 to 1188 px (16 pt left margin, 32 pt right margin), 3 px thick.
- Username and email values are right-aligned; the username row has a 7.7 x 13.3 pt chevron (x 1203 to 1226), the email row has none.
- The AI Data Retention description wraps at about 235 pt width to leave room for the 63 x 28 pt toggle (right edge at x = 1236 px, so 16 pt from the screen edge). Line pitch of the description is 19.3 pt (58 px).
- The "Delete account" row is inset a further 16 pt (separator starts at x = 96 px) and its separator is #3b3b3d.

### 11. Notifications (IMG_1316)

A settings page of six toggle rows in one card. Page sheet, back button, centred title "Notifications".

#### Layout, top to bottom

| Element     | Box px (x, y, w, h) | Size pt (w x h) | Anchor              | Fill or colour      | Radius pt | Status                     |
| ----------- | ------------------- | --------------- | ------------------- | ------------------- | --------- | -------------------------- |
| Back button | 60, 201, 132, 132   | 44 x 44         | L 20                | #3b3b3b translucent | full      | OBSERVED                   |
| Title       | centred at y = 270  |                 | C                   | #dedede             | none      | OBSERVED                   |
| Card        | 48, 363, 1188, 1881 | 396 x 627       | L 16, R 16          | #1c1c1c             | about 24  | OBSERVED, radius ESTIMATED |
| Rows (six)  | pitch 313.5 px      | 104.5           | in card             |                     | none      | OBSERVED                   |
| Row icon    | 101, 425, 50, 50    | 16.7 x 16.7     | inside card, L 17.7 | #a8a8a8             | none      | OBSERVED                   |
| Row toggle  | 1005, 478, 189, 84  | 63 x 28         | inside card, R 14   | #4e99a3 (on)        | full      | OBSERVED                   |

Rows: "Activity & updates", "Scheduled tasks", "Shared activity", "Discover", "Usage and credits", "Product updates", each with a one-line title, a two-line description, an icon and a toggle (all on).

#### Text

| Text                                                                                                | Height px      | Est. size pt | Weight  | Colour  | Align | Status    |
| --------------------------------------------------------------------------------------------------- | -------------- | ------------ | ------- | ------- | ----- | --------- |
| Row title                                                                                           | 37 (capital A) | 17.5         | regular | #dedede | left  | ESTIMATED |
| Row description (two lines, for example "Get notified when your tasks need input or are completed") | 33 (capital G) | 15.5         | regular | #9a9a9a | left  | ESTIMATED |

#### Spacing and notes

- Row padding: title cap top is 62 px (20.7 pt) below the row top; description first line 58 px (19.3 pt) pitch to the second; text left edge at x = 169 px (title) and x = 98 px (description), so the description starts under the icon (L 32.7) and the title after it (L 56.3).
- Row separators are 1 px lines #2a2a2a to the card edges.
- Card radius fitted from the corner: edge 65 px in at 1 px below the top, 37 px in at 9 px, reaching the side after about 70 px.

### 12. Connectors (IMG_1319)

A list of connectable apps in the page sheet, with an intro sentence, filter chips, rows and a floating "Search Connectors" field. Back button, centred title "Connectors".

#### Layout, top to bottom

| Element                                                                                           | Box px (x, y, w, h)                                       | Size pt (w x h) | Anchor                                       | Fill or colour                                                     | Radius pt          | Status                                                     |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------- | -------------------------------------------- | ------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------- |
| Intro text (two lines, centred)                                                                   | 129, 402, 1027, 110                                       | 342.3 x 36.7    | C                                            | #989898                                                            | none               | OBSERVED                                                   |
| Filter chips row ("Popular", "All", "Connected", "Productivity", "Legal..." clipped at the right) | y 580 to 692, chips start at x 50                         | chip height 37  | L 16.7, scrolls horizontally                 | selected chip #222222, others transparent with 1 px border #252525 | full               | chip height ESTIMATED from the display image (+/- 4 px)    |
| App row (icon tile, name, description, more menu)                                                 | tile 46, 762, 172, 172; rows of 242 or 281 px             | tile 57 x 57    | L 15.3                                       | tile #1c1c1c with brand logo                                       | about 17 ESTIMATED | OBSERVED (tile size read from the display image, +/- 4 px) |
| Row separator                                                                                     | x 266 to 1236                                             |                 | L 88.7, R 16                                 | #252525                                                            | none               | ESTIMATED from display                                     |
| "Search Connectors" field                                                                         | 85, 2558, 1114, 132                                       | 371 x 44        | L 28, bottom about 29 above the sheet bottom | #363636 translucent                                                | full               | OBSERVED                                                   |
| More menu (three dots) on a connected row                                                         | 1166, 830, 8, 36 (dots) inside a circle about 120 px wide |                 | R 20                                         | #5d5d5d dots, 1 px border circle                                   | full               | ESTIMATED                                                  |

#### Text

| Text                                                                                                     | Height px      | Est. size pt | Weight  | Colour                           | Align  | Status    |
| -------------------------------------------------------------------------------------------------------- | -------------- | ------------ | ------- | -------------------------------- | ------ | --------- |
| "Connect your apps and services so Computer can access and act on your data."                            | 33 (capital C) | 15.5         | regular | #989898                          | center | ESTIMATED |
| Chip labels                                                                                              | 35 (capital P) | 16.5         | regular | #dedede selected, #989898 others | center | ESTIMATED |
| App name ("Gmail with Calendar", "Outlook", "Google Drive", "Box", "Notion", "GitHub", "Asana", "Slack") | 35             | 16.5         | regular | #dedede                          | left   | ESTIMATED |
| App description (one or two lines; the connected row shows <email>)                                      | 33             | 15.5         | regular | #989898                          | left   | ESTIMATED |

#### Spacing and notes

- Row pitch is 242 px (80.7 pt) for a one-line description and 281 to 282 px (94 pt) for a two-line description. Name to description pitch inside a row is about 56 px; description line pitch is 48 px (16 pt).
- Text left edge is 88.7 pt (266 px). The logo tiles are rounded squares (#1c1c1c) holding the brand logo at about 27 pt.
- The "Search Connectors" field is the same component as the "Search settings" field on the settings pages, floating over the list.

### 13. Preferences (IMG_1320)

A grouped settings page of three cards. Page sheet, back button, centred title "Preferences".

#### Layout, top to bottom

| Element                                              | Box px (x, y, w, h)      | Size pt (w x h) | Anchor                                                   | Fill or colour | Radius pt         | Status                 |
| ---------------------------------------------------- | ------------------------ | --------------- | -------------------------------------------------------- | -------------- | ----------------- | ---------------------- |
| "Appearance" heading                                 | 121, 434, cap height 33  |                 | L 40                                                     | #dedede        | none              | OBSERVED               |
| Card 1 ("Theme & App Icon", half-filled circle icon) | 60, 514, 1164, 162       | 388 x 54        | L 20, R 20                                               | #1c1c1c        | about 27          | OBSERVED               |
| "Preferences" heading                                | 121, 764 (approx)        |                 | L 40                                                     | #dedede        | none              | ESTIMATED from display |
| Card 2 (five rows)                                   | 60, 875, 1164, 810       | 388 x 270       | L 20, R 20                                               | #1c1c1c        | about 27          | OBSERVED               |
| "Artificial Intelligence" heading                    | 121, 1804, cap height 33 |                 | L 40                                                     | #dedede        | none              | OBSERVED               |
| Card 3 (two rows)                                    | 60, 1884, 1164, 324      | 388 x 108       | L 20, R 20                                               | #1c1c1c        | about 27          | OBSERVED               |
| "Max" tag (on "Video generation model")              | 982, 2100, 126, 54       | 42 x 18         | inside card, right of the label, 16.7 before the chevron | #4e99a3        | about 5 ESTIMATED | OBSERVED               |

Card 2 rows: "Language settings" (translate icon), "Dictation settings" (microphone), "Voice settings" (speaker), "Read aloud settings" (headphones), "Map provider" (pin, value "Apple Maps"). Card 3 rows: "Image generation model" (picture icon), "Video generation model" (film icon, "Max" tag).

#### Text

| Text                  | Height px            | Est. size pt | Weight  | Colour  | Align                     | Status    |
| --------------------- | -------------------- | ------------ | ------- | ------- | ------------------------- | --------- |
| "Preferences" (title) | 49 (capital P)       | 23           | medium  | #dedede | center                    | ESTIMATED |
| Section headings      | 33 (capital A)       | 15.5         | medium  | #dedede | left                      | ESTIMATED |
| Row labels            | 37                   | 17.5         | regular | #dedede | left                      | ESTIMATED |
| "Apple Maps" value    | 44 (with descenders) | about 17     | regular | #9a9a9a | right, before the chevron | ESTIMATED |
| "Max"                 | about 28 (capital M) | 13           | medium  | #161616 | center                    | ESTIMATED |

#### Spacing and notes

- Same row system as screen 8 (54 pt rows, 3 px separators at x = 204 px, chevrons 7.3 x 12.3 pt). The last row of a card ends 3 px before the card bottom (no separator).
- The heading's cap top is 80 px above the card top; spacing between a card bottom and the next heading cap top is 199 px (the first and second cards are 199 px apart on the gap column).
- The "Max" tag in this list is small (18 pt tall) compared with the Models sheet tag (25.7 pt).

### 14. Map provider (IMG_1321)

A selection page with two options in one card and a caption. Back button, title "Map provider".

#### Layout, top to bottom

| Element                                                                       | Box px (x, y, w, h) | Size pt (w x h) | Anchor            | Fill or colour | Radius pt | Status                     |
| ----------------------------------------------------------------------------- | ------------------- | --------------- | ----------------- | -------------- | --------- | -------------------------- |
| Card                                                                          | 48, 387, 1188, 348  | 396 x 116       | L 16, R 16        | #1c1c1c        | about 24  | OBSERVED, radius ESTIMATED |
| Row "Apple Maps" (selected)                                                   | 48, 387 to 559      | 396 x 57.3      | in card           |                | none      | OBSERVED                   |
| Separator                                                                     | y 559 to 560, 2 px  |                 | full card width   | #292929        | none      | OBSERVED                   |
| Row "Google Maps"                                                             | 48, 561 to 735      | 396 x 58        | in card           |                | none      | OBSERVED                   |
| Check mark                                                                    | 1135, 459, 44, 31   | 14.7 x 10.3     | inside card, R 19 | #4e99a3        | none      | OBSERVED                   |
| Caption "Controls which map app opens locations from Perplexity." (two lines) | 99, 772, 887, 98    | 295.7 x 32.7    | L 33              | #989898        | none      | OBSERVED                   |

#### Text

| Text       | Height px      | Est. size pt | Weight  | Colour  | Align | Status    |
| ---------- | -------------- | ------------ | ------- | ------- | ----- | --------- |
| Row labels | 37 (capital A) | 17.5         | regular | #dedede | left  | ESTIMATED |
| Caption    | about 33       | 15.5         | regular | #989898 | left  | ESTIMATED |

#### Spacing and notes

- Row labels start at x = 97 px (32.3 pt), i.e. 16.3 pt inside the card. Caption starts 35 px below the card bottom and is inset 33 pt (99 px).
- Only the selected row carries a check; there is no radio circle.

### 15. Image generation model (IMG_1322)

A selection page with five options. Each row has a name, an optional tag and a one-line description. Back button and a title that is centred between the back button and the right edge ("Image generation model").

#### Layout, top to bottom

| Element                                | Box px (x, y, w, h)                           | Size pt (w x h)   | Anchor                | Fill or colour | Radius pt         | Status                          |
| -------------------------------------- | --------------------------------------------- | ----------------- | --------------------- | -------------- | ----------------- | ------------------------------- |
| Card                                   | 60, 468, 1164, 1319                           | 388 x 439.7       | L 20, R 20            | #1c1c1c        | about 24          | OBSERVED, radius ESTIMATED      |
| Row 1 "Default" (selected, check)      | 468 to 721                                    | 388 x 84.3        | in card               |                | none              | OBSERVED                        |
| Row 2 "Nano Banana Pro" with "Max" tag | 724 to 991                                    | 388 x 89          | in card               |                | none              | OBSERVED                        |
| Row 3 "Nano Banana 2"                  | 993 to 1246                                   | 388 x 84.3        | in card               |                | none              | OBSERVED                        |
| Row 4 "Seedream 5" with "New" tag      | 1249 to 1515                                  | 388 x 88.7        | in card               |                | none              | OBSERVED                        |
| Row 5 "GPT Image 2" with "New" tag     | 1518 to 1787                                  | 388 x 89.7        | in card               |                | none              | OBSERVED                        |
| Separators                             | 60 to 1164, y 722 etc., 3 px                  |                   | L 0 of the card, R 20 | #38383a        | none              | OBSERVED                        |
| Tag ("Max" or "New")                   | 537, 772, 124, 92 (Max, row 2 at about y 830) | 41.3 x 30.7       | 6.3 pt after the name | #4e99a3        | about 5 ESTIMATED | OBSERVED size; radius ESTIMATED |
| Check mark                             | about 1090 to 1135, 590 to 625                | about 14.7 x 11.7 | inside card, R 24     | #4e99a3        | none              | ESTIMATED from display          |

#### Text

| Text                                                                 | Height px | Est. size pt | Weight  | Colour  | Align  | Status    |
| -------------------------------------------------------------------- | --------- | ------------ | ------- | ------- | ------ | --------- |
| Row name                                                             | 38        | 18           | regular | #dedede | left   | ESTIMATED |
| Row description (for example "GPT Image 2 medium quality by OpenAI") | 32        | 15           | regular | #9a9a9a | left   | ESTIMATED |
| Tag text                                                             | about 33  | 15.5         | regular | #161616 | center | ESTIMATED |

#### Spacing and notes

- Name text starts at x = 112 px (37 pt) and descriptions at x = 111 px. The name to description line pitch is 100 px (33 pt) in rows without a tag; in the first row the name cap top is 536 px and the description cap top 631 px.
- Row height is 84 pt (253 px) for rows without a tag and 89 pt for rows with a tag (the tag is taller than the text line). Separators start flush with the card left edge and stop 20 pt before the right edge.
- Compared with the Models sheet, the tag here is filled teal with dark text, 41 x 31 pt, and sits right after the name.

### 16. Language settings (IMG_1323)

Two single-row cards, each with a label, an optional value and a chevron. Back button, title "Language settings".

#### Layout, top to bottom

| Element                                              | Box px (x, y, w, h) | Size pt (w x h) | Anchor     | Fill or colour | Radius pt | Status   |
| ---------------------------------------------------- | ------------------- | --------------- | ---------- | -------------- | --------- | -------- |
| Card 1 ("App Language")                              | 60, 468, 1164, 175  | 388 x 58.3      | L 20, R 20 | #1c1c1c        | about 27  | OBSERVED |
| Card 2 ("AI language", value "Default (autodetect)") | 60, 715, 1164, 175  | 388 x 58.3      | L 20, R 20 | #1c1c1c        | about 27  | OBSERVED |

#### Text

| Text                   | Height px | Est. size pt | Weight  | Colour  | Align                               | Status    |
| ---------------------- | --------- | ------------ | ------- | ------- | ----------------------------------- | --------- |
| Row labels             | about 37  | 17.5         | regular | #dedede | left, at x = 79 disp (about 110 px) | ESTIMATED |
| "Default (autodetect)" | about 37  | 17           | regular | #9a9a9a | right                               | ESTIMATED |

#### Spacing and notes

- The two cards are 24 pt (72 px) apart. Each card is a single row of 58.3 pt, taller than the 54 pt rows of the main settings list.

### 17. Dictation settings (IMG_1324)

A page of three cards: a language row, a slider card and a segmented control card, each followed by a caption. Back button, title "Dictation settings".

#### Layout, top to bottom

| Element                                    | Box px (x, y, w, h)                                      | Size pt (w x h) | Anchor                               | Fill or colour               | Radius pt | Status                               |
| ------------------------------------------ | -------------------------------------------------------- | --------------- | ------------------------------------ | ---------------------------- | --------- | ------------------------------------ |
| Card 1 ("Languages", value "Automatic")    | 60, 470, 1164, 169                                       | 388 x 56.3      | L 20, R 20                           | #1c1c1c                      | about 27  | OBSERVED                             |
| Caption 1 (two lines)                      | x 122, y 660 to 740                                      |                 | L 40                                 | #989898                      | none      | OBSERVED (x), y ESTIMATED            |
| Card 2 ("Silence timeout")                 | 60, 872, 1164, 343                                       | 388 x 114.3     | L 20, R 20                           | #1c1c1c                      | about 27  | OBSERVED                             |
| Slider track                               | 120, 1045, 1044, about 17                                | 348 x about 5.7 | inside card, L 20, R 20              | #303030, filled part #4e99a3 | full      | OBSERVED (height read at one column) |
| Slider thumb                               | 589, 1019, 109, 72                                       | 36.3 x 24       | at the value                         | #ffffff                      | full      | OBSERVED                             |
| Tick dots                                  | 123 and 1103 (ends), y 1075 to 1083                      | 2.7 x 2.7       | under the track ends                 | #38383a                      | full      | OBSERVED                             |
| Value labels "5 sec", "10 sec", "15 sec"   | 122, 1127; 582, 1126; 1043, 1127 (each 32 to 33 px tall) |                 | under the track: left, centre, right | #9a9a9a                      | none      | OBSERVED                             |
| Caption 2 (two lines)                      | x 122, y 1260 to 1330                                    |                 | L 40                                 | #989898                      | none      | x OBSERVED, y ESTIMATED              |
| Card 3 ("Noise reduction")                 | 60, 1448, 1164, 283                                      | 388 x 94.3      | L 20, R 20                           | #1c1c1c                      | about 27  | OBSERVED                             |
| Segmented control (Off, Low, Medium, High) | 120, 1595, 1044, 95                                      | 348 x 31.7      | inside card, L 20, R 20              | #313134                      | full      | OBSERVED                             |
| Active segment ("Medium")                  | 648, 1600, 249, 84                                       | 83 x 28         | inside the control, 2 pt inset       | #68686d                      | full      | OBSERVED                             |
| Caption 3 (two lines)                      | x 122, y 1690 onward                                     |                 | L 40                                 | #989898                      | none      | x OBSERVED, y ESTIMATED              |

#### Text

| Text                                              | Height px      | Est. size pt | Weight                                | Colour  | Align               | Status    |
| ------------------------------------------------- | -------------- | ------------ | ------------------------------------- | ------- | ------------------- | --------- |
| "Languages", "Silence timeout", "Noise reduction" | 39 (capital S) | 18.5         | regular                               | #dedede | left                | ESTIMATED |
| "Automatic"                                       | about 37       | 17           | regular                               | #9a9a9a | right               | ESTIMATED |
| "5 sec", "10 sec", "15 sec"                       | 32             | 15           | regular                               | #9a9a9a | left, centre, right | ESTIMATED |
| Segment labels "Off", "Low", "Medium", "High"     | about 33       | 15.5         | regular, medium on the active segment | #dedede | center              | ESTIMATED |
| Captions                                          | about 33       | 15.5         | regular                               | #989898 | left                | ESTIMATED |

#### Spacing and notes

- Card inner padding is 20 pt on both sides (120 - 60 = 60 px); card titles start at x = 122 px.
- The thumb is a pill 36 x 24 pt, taller than the track; the slider has three stops (5, 10, 15 seconds) shown by the end dots and the centre label.
- The segmented control is four equal segments of 261 px; the active segment is slightly narrower (249 px).
- Spacing between a caption and the next card is about 12 pt.

### 18. Voice settings and Read aloud settings (IMG_1325, IMG_1326)

Two selection pages of the same design. IMG_1325 ("Voice settings") has a "Voice" heading, a card of eight voices (the first is selected) and a "Speaking Rate" card with a thick slider. IMG_1326 ("Read aloud settings") has a "Voice" heading and a card of four voices (the first is selected). Voice names are product content and are not recorded here beyond count.

#### Layout, top to bottom (IMG_1325)

| Element                               | Box px (x, y, w, h)                    | Size pt (w x h) | Anchor                            | Fill or colour                            | Radius pt | Status   |
| ------------------------------------- | -------------------------------------- | --------------- | --------------------------------- | ----------------------------------------- | --------- | -------- |
| "Voice" heading                       | 61, 384, 114, 38                       | 38 x 12.7       | L 20 (aligned with the card edge) | #989898                                   | none      | OBSERVED |
| Voice card                            | 60, 466, 1164, 1400                    | 388 x 466.7     | L 20, R 20                        | #1c1c1c                                   | about 27  | OBSERVED |
| Voice rows (eight)                    | pitch 175 px                           | 58.3            | in card                           |                                           | none      | OBSERVED |
| Separators                            | 60 to 1164, 3 px                       |                 | card left to R 20                 | #292929                                   | none      | OBSERVED |
| Check mark (first row)                | 1123, 539, 44, 30                      | 14.7 x 10       | inside card, R 19                 | #4e99a3                                   | none      | OBSERVED |
| "Speaking Rate" heading               | 62, 1959, about 235, 39                | 78 x 13         | L 20                              | #989898                                   | none      | OBSERVED |
| Rate card                             | 60, 2041, 1164, 282                    | 388 x 94        | L 20, R 20                        | #1c1c1c                                   | about 27  | OBSERVED |
| Slider track                          | 120, 2134, 1044, 96                    | 348 x 32        | inside card, L 20, R 20           | #272727, fill gradient #0b6d74 to #4e99a3 | full      | OBSERVED |
| Slider thumb (disc with value "1.1x") | 627, 2120, 124, 124                    | 41.3 x 41.3     | at the value                      | #4d6c70 translucent, 1 px lighter border  | full      | OBSERVED |
| Tick marks                            | x 798, 902, 1007, 1111; y 2158 to 2206 | 0.5 x 16        | right of the thumb                | #434343                                   | none      | OBSERVED |

IMG_1326: "Voice" heading at y about 384 px; card y 466 to 1166 px (700 px, 233 pt), four rows of 172 px plus separators (rows end at 638, 813, 988, 1166), same x and fill as IMG_1325; the first row has the check.

#### Text

| Text                              | Height px                      | Est. size pt | Weight  | Colour  | Align                       | Status    |
| --------------------------------- | ------------------------------ | ------------ | ------- | ------- | --------------------------- | --------- |
| Page titles                       | 49                             | 23           | medium  | #dedede | center                      | ESTIMATED |
| "Voice", "Speaking Rate" headings | 38 (capital V), 39 (capital S) | 18           | regular | #989898 | left                        | ESTIMATED |
| Voice names                       | 39 (capital C)                 | 18.5         | regular | #dedede | left, at x = 111 px (37 pt) | ESTIMATED |
| "1.1x" in the thumb               | about 33                       | 15.5         | regular | #dedede | center                      | ESTIMATED |

#### Spacing and notes

- Headings here are #989898 and 18 pt, larger and dimmer than the Settings section headings (15.5 pt, #dedede), and are aligned with the card edge (L 20) instead of inset 40 pt.
- The page lists have no icons; names start 17 pt inside the card; rows are 58.3 pt.
- The rate slider is a fat bar (32 pt) with a disc thumb that shows the current value; the other slider (Dictation settings) uses a thin bar with a pill thumb.

### 19. Personalize (IMG_1327)

A form page with a text field, a two-row card, a multi-line text field and a one-row card. Back button, title "Personalize". Headings sit directly above their cards.

#### Layout, top to bottom

| Element                                                                     | Box px (x, y, w, h) | Size pt (w x h) | Anchor     | Fill or colour | Radius pt | Status                          |
| --------------------------------------------------------------------------- | ------------------- | --------------- | ---------- | -------------- | --------- | ------------------------------- |
| "Your occupation" heading                                                   | 49, 433, 26 cap     |                 | L 16       | #dedede        | none      | OBSERVED                        |
| Occupation field (placeholder "Engineer, student, etc.")                    | 48, 525, 1188, 174  | 396 x 58        | L 16, R 16 | #1c1c1c        | about 27  | OBSERVED                        |
| "Response preferences" heading                                              | 52, 817 (cap top)   |                 | L 17       | #dedede        | none      | OBSERVED                        |
| Preferences card ("Response Length", "Headers and Lists", values "Default") | 48, 909, 1188, 313  | 396 x 104.3     | L 16, R 16 | #1c1c1c        | about 27  | OBSERVED                        |
| Separator inside that card                                                  | 80, 1065, 1100, 1   | 366.7 x 0.3     | L 27       | #48484b        | none      | OBSERVED                        |
| "Custom instructions" heading                                               | about 49, 1356      |                 | L 16       | #dedede        | none      | position ESTIMATED from display |
| Custom instructions field (placeholder "Preferences, interests, etc...")    | 48, 1432, 1188, 174 | 396 x 58        | L 16, R 16 | #1c1c1c        | about 27  | OBSERVED                        |
| "Watchlist" heading                                                         | about 49, 1710      |                 | L 16       | #dedede        | none      | position ESTIMATED from display |
| "Finance" row card                                                          | 48, 1816, 1188, 174 | 396 x 58        | L 16, R 16 | #1c1c1c        | about 27  | OBSERVED                        |

#### Text

| Text                                              | Height px      | Est. size pt | Weight  | Colour  | Align               | Status    |
| ------------------------------------------------- | -------------- | ------------ | ------- | ------- | ------------------- | --------- |
| Headings                                          | 37 (capital Y) | 17.5         | regular | #dedede | left                | ESTIMATED |
| Placeholders                                      | 37             | 17.5         | regular | #9a9a9a | left, at x = 100 px | ESTIMATED |
| "Response Length", "Headers and Lists", "Finance" | 37             | 17.5         | regular | #dedede | left, at x = 88 px  | ESTIMATED |
| "Default" values                                  | 36             | 17           | regular | #9a9a9a | right               | ESTIMATED |

#### Spacing and notes

- The fields look like single-row cards with a placeholder; they are not outlined and do not show a caret in this screenshot.
- Gap from a heading's cap top to the card top is about 92 px (31 pt); gap from a card bottom to the next heading's cap top is 118 px (39 pt).
- In the two-row card the row text starts at x = 88 px (29 pt) and the separator at x = 80 px, so the rows are inset 12.7 pt from the card left edge, less than on the main settings list.

### 20. Two-factor authentication setup (IMG_1328)

The first step of the two-factor setup: an explanation, a QR code image, the manual key field and a "Next" button. Back button, title "Two-factor authentication". Only the layout is recorded; the QR code and key contents are not.

#### Layout, top to bottom

| Element                                                            | Box px (x, y, w, h)      | Size pt (w x h) | Anchor     | Fill or colour | Radius pt             | Status                     |
| ------------------------------------------------------------------ | ------------------------ | --------------- | ---------- | -------------- | --------------------- | -------------------------- |
| Heading "Set up two-factor authentication"                         | 51, 429, 960, 63         | 320 x 21        | L 17       | #dedede        | none                  | OBSERVED                   |
| Explanation (two lines)                                            | 50, 578, 1145, 110       | 381.7 x 36.7    | L 16.7     | #989898        | none                  | OBSERVED                   |
| QR code image (white square, black modules, quiet zone included)   | 48, 766, 1188, 1188      | 396 x 396       | L 16, R 16 | #ffffff        | none (square corners) | OBSERVED                   |
| Key hint line ("Can't scan the QR code? Enter this key manually:") | 51, 2042, about 1030, 40 | about 343 x 13  | L 17       | #989898        | none                  | OBSERVED                   |
| Key field (monospace text, <setup key>)                            | 48, 2116, 1188, 102      | 396 x 34        | L 16, R 16 | #1c1c1c        | about 8               | OBSERVED, radius ESTIMATED |
| "Next" button                                                      | 48, 2290, 1188, 144      | 396 x 48        | L 16, R 16 | #4e99a3        | full (24)             | OBSERVED                   |

#### Text

| Text                                                  | Height px      | Est. size pt | Weight  | Colour  | Align  | Status    |
| ----------------------------------------------------- | -------------- | ------------ | ------- | ------- | ------ | --------- |
| Heading                                               | 51 (capital S) | 24           | medium  | #dedede | left   | ESTIMATED |
| Explanation                                           | 35 (capital S) | 16.5         | regular | #989898 | left   | ESTIMATED |
| Key hint                                              | 35 (capital C) | 16.5         | regular | #989898 | left   | ESTIMATED |
| Key text (monospace, about 32 characters in one line) | 37             | 17.5         | regular | #dedede | center | ESTIMATED |
| "Next"                                                | 37 (capital N) | 17.5         | medium  | #161616 | center | ESTIMATED |

#### Spacing and notes

- The QR image is the full content width (396 pt square, 16 pt margins). The explanation block ends at y = 688 px and the image starts at 766 px, so they are 26 pt apart. Image bottom (1954 px) to hint line cap top (2042 px) is 29 pt; hint to field top 25 pt; field bottom to button top 24 pt (72 px).
- The key field is a flat dark strip with centred monospace text and small corner rounding (edge 10 px in at 4 px down, reaching the side by 14 px).
- There is empty space below the button (the page does not scroll in this state).

## Coverage

All screenshots from IMG_1301 to IMG_1329 except the missing IMG_1317 are named in a screen heading above.
