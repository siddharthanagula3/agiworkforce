# Claude on iPhone: layout measurements, part 2 (observed 2026-11-12)

Status: Historical snapshot
Owner: Product (founder)
Last updated: 2026-11-12

Screenshots IMG_1269 to IMG_1300 of the founder's reference set, 1284 x 2778 pixels at scale 3 (428 x 926 points). Method, tool and limits are in `docs/research/mobile-layout-2026-11-12/README.md`. Sizes are points unless a column says pixels. OBSERVED means read from pixels by the tool; ESTIMATED means derived (text size from cap height, weight and radius by fit); UNKNOWN means not readable from a screenshot.

Notes that apply to the whole file:

- Claude uses its own typeface, so every text size is ESTIMATED as cap height px / 3 / 0.705 and is good to about plus or minus 1 point. Where a line has no flat capital the height of an ascender is used and the row says so.
- The range does not match the expected content. IMG_1269 to IMG_1273 are Claude project and new chat screens, IMG_1274 to IMG_1278 are ChatGPT (dark theme) screenshots, and IMG_1280 to IMG_1300 are the Claude settings pages. IMG_1274 to IMG_1278 are measured in screen 4 below and are flagged as ChatGPT; the lead decides where they belong.
- IMG_1279 does not exist in the folder.
- Claude screens in this part are light theme: page background #f9f9f7, card fill #ffffff, primary text #131313, secondary text #7a7974, icons #52514e. The settings screens are a full-height sheet whose top edge sits at y 141 px (47 points) over the dimmed page.
- Personal content is replaced by placeholders: `<project name>`, `<user name>`, `<email>`, `<chat title>`, `<message text>`, `<topic name>`.

## Shared components seen in this part

| Component                        | Metric                                     | Value                                                                                                                                                                          | Screenshot                   | Status                     |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | -------------------------- |
| Screen frame                     | Status bar height                          | 47 pt (sheet top edge at y 141 px)                                                                                                                                             | IMG_1280                     | OBSERVED                   |
| Screen frame                     | Settings sheet header height               | 74 pt (sheet top 47 to header bottom edge at y 362 px = 121 pt), content starts at y 411 px (137 pt)                                                                           | IMG_1284                     | OBSERVED                   |
| Screen frame                     | Side margin of main content                | 20 pt on cards (card x 60 to 1224 px); 16 pt on form fields (x 49 to 1236 px); 19 pt on the Time and focus page (x 57 px)                                                      | IMG_1280, IMG_1295, IMG_1287 | OBSERVED                   |
| Chat header                      | Left control                               | 44 pt circle (about 130 px), x 60 px (L 20), top 67 pt                                                                                                                         | IMG_1272                     | OBSERVED                   |
| Chat header                      | Right control                              | 44 pt circle at R 20; the project page uses an 81 x 45 pt pill holding two icons                                                                                               | IMG_1272, IMG_1269           | OBSERVED                   |
| Chat header                      | Title                                      | project chip pill, about 182 x 45 pt, label 16.5 pt; the project page title is 19.5 pt, medium, left of centre (x 232 px)                                                      | IMG_1272, IMG_1271           | ESTIMATED                  |
| Chat header                      | Gaps                                       | 11 pt between the left circle and the title chip (circle right edge 194 px, chip left edge 226 px, both including shadow)                                                      | IMG_1272                     | OBSERVED                   |
| Composer at rest                 | Card left and right inset                  | 15 pt (x 46 to 1238 px)                                                                                                                                                        | IMG_1272                     | OBSERVED                   |
| Composer at rest                 | Card height                                | 53 pt (y 2518 to 2678 px)                                                                                                                                                      | IMG_1272                     | OBSERVED                   |
| Composer at rest                 | Card radius                                | pill (fully round)                                                                                                                                                             | IMG_1272                     | ESTIMATED                  |
| Composer at rest                 | Card fill                                  | #fefefd, thin border, soft shadow                                                                                                                                              | IMG_1272                     | OBSERVED                   |
| Composer at rest                 | Placeholder                                | "Type or hold to talk", 19.5 pt, #7a7974, starts x 221 px (74 pt)                                                                                                              | IMG_1272                     | ESTIMATED                  |
| Composer at rest                 | Controls                                   | plus circle 36 pt (#f0efec) at x 72 px; microphone circle 36 pt (#f0efec) at x 972 px; voice button circle 36 pt (#131313, white waveform icon) at x 1105 px                   | IMG_1272                     | OBSERVED                   |
| Composer at rest                 | Gap between controls                       | 8 pt between microphone and voice button; controls inset 8.5 pt from the card edge                                                                                             | IMG_1272                     | OBSERVED                   |
| Composer at rest                 | Distance from card bottom to screen bottom | 33 pt (2778 - 2678 = 100 px)                                                                                                                                                   | IMG_1272                     | OBSERVED                   |
| Composer with text or attachment | Keyboard-open card                         | x 24 to 1261 px (L 8, R 8), height 100 pt (y 1414 to 1714 px), radius about 23 pt, fill #fcfcfb, 8 pt above the keyboard                                                       | IMG_1273                     | OBSERVED, radius ESTIMATED |
| Composer with text or attachment | Send button                                | 36 pt circle, disabled fill #e0bfb1 with a lighter arrow (#edd9d1), R 8 inside the card                                                                                        | IMG_1273                     | OBSERVED                   |
| Model picker or model menu       | Model chip in composer                     | "Opus 5.5 High" pill, 124 x 36 pt, fill #f0efec, name 14.5 pt #131313, effort word grey                                                                                        | IMG_1273                     | ESTIMATED                  |
| Settings list                    | Row height                                 | 54 pt (162 px pitch) for a one-line row; 94 pt for a title with two lines of description; 77 pt for the account rows                                                           | IMG_1280, IMG_1286           | OBSERVED                   |
| Settings list                    | Row label text size                        | 19.5 pt, regular, #131313 (cap height 41 px)                                                                                                                                   | IMG_1280                     | ESTIMATED                  |
| Settings list                    | Value text size                            | 19.5 pt, #8a8a8d, right aligned (cap height 41 px)                                                                                                                             | IMG_1280                     | ESTIMATED                  |
| Settings list                    | Description text size                      | 14 pt, #7a7974, line pitch 19.7 pt (59 px)                                                                                                                                     | IMG_1286                     | ESTIMATED                  |
| Settings list                    | Row icon                                   | line icon 16 to 20 pt wide, #52514e, centre x 53 pt from the screen edge, label starts at x 252 px (84 pt)                                                                     | IMG_1280                     | OBSERVED                   |
| Settings list                    | Section heading text size                  | 16.5 pt, regular, #7a7974, left edge x 122 px (L 40.7); 30 pt below the card above, 14 pt above the card below                                                                 | IMG_1280                     | ESTIMATED                  |
| Settings list                    | Card inset, radius, fill                   | L 20, R 20 (388 pt wide), radius 26 pt, fill #ffffff on #f9f9f7, no border or shadow                                                                                           | IMG_1280                     | radius ESTIMATED           |
| Settings list                    | Gap between cards                          | 16 pt (48 px)                                                                                                                                                                  | IMG_1286                     | OBSERVED                   |
| Settings list                    | Separator inset and colour                 | 1 pt (3 px) #e6e7e6; icon rows start x 247 px (82 pt from the screen edge) and end x 1164 px (20 pt inside the card); rows without icon start x 120 px (20 pt inside the card) | IMG_1280, IMG_1286           | OBSERVED                   |
| Settings list                    | Toggle                                     | 63 x 28 pt (189 x 84 px), on #3868b9, off #c5c5c7, white pill knob about 37 pt wide, R 18 inside the card                                                                      | IMG_1286, IMG_1288           | OBSERVED                   |
| Settings list                    | Chevron                                    | 6.3 x 11.3 pt (19 x 34 px), #888781, right edge 27 pt inside the card                                                                                                          | IMG_1280                     | OBSERVED                   |
| Sheets and dialogs               | Corner radius                              | full-height sheet about 38 pt; floating sheet about 38 pt                                                                                                                      | IMG_1280, IMG_1269           | ESTIMATED                  |
| Sheets and dialogs               | Grabber                                    | 58 x 4 pt, #bfbfbf, 6 pt below the sheet top (floating sheet only)                                                                                                             | IMG_1269                     | OBSERVED                   |
| Sheets and dialogs               | Title text size                            | 19.5 pt, medium to semibold, centred, #000000                                                                                                                                  | IMG_1286                     | ESTIMATED                  |
| Sheets and dialogs               | Close or back button                       | 44 pt circle, fill #ffffff with hairline border and soft shadow, L 20, icon 8 to 14 pt                                                                                         | IMG_1280, IMG_1281           | OBSERVED                   |
| Buttons                          | Primary button                             | Create environment: 47.7 pt tall (143 px), L 16 R 16, pill, disabled fill #898989, label 19.5 pt #f3f4f2                                                                       | IMG_1295                     | OBSERVED, text ESTIMATED   |
| Buttons                          | Secondary button                           | Reset for free: 134.7 x 32.7 pt pill, fill #ffffff, hairline border #dddddd, label about 17.5 pt #131313                                                                       | IMG_1283                     | OBSERVED, text ESTIMATED   |

## Screens

### 1. Project page, memory sheet and memory files (IMG_1269, IMG_1270, IMG_1271)

A project page (title `<project name>`) with three outlined pill buttons and an empty state. IMG_1271 is the page itself with a small menu open from the bottom right (New chat, New task). IMG_1269 shows the page dimmed behind a floating Memory sheet. IMG_1270 shows the same sheet on its Memory files page. Light theme.

#### Layout, top to bottom

| Element                                  | Box px (x, y, w, h)              | Size pt (w x h) | Anchor                          | Fill or colour                                      | Radius pt   | Status                                                   |
| ---------------------------------------- | -------------------------------- | --------------- | ------------------------------- | --------------------------------------------------- | ----------- | -------------------------------------------------------- |
| Menu button (three lines)                | 58, 139, 136, 136 (with shadow)  | 44 x 44         | L 20, top 46                    | #fffffe, hairline border, soft shadow               | full circle | OBSERVED                                                 |
| Right pill (pin and ellipsis)            | 982, 139, 244, 136 (with shadow) | 81 x 45         | R 19, top 46                    | #fffffe, hairline border, soft shadow               | full pill   | OBSERVED                                                 |
| Page title                               | 232, 185, 696, 57                | text            | L 77                            | #000000                                             | none        | OBSERVED                                                 |
| Add files button                         | 58, 313, 1168, 148               | 389 x 49        | L 19, R 19                      | transparent, 1 pt border #d8d8d6                    | full pill   | OBSERVED                                                 |
| Add instructions button                  | 58, 481, 1168, 148               | 389 x 49        | same, 56 pt below the first top | same                                                | full pill   | OBSERVED                                                 |
| View memory button                       | 58, 649, 1168, 148               | 389 x 49        | same                            | same                                                | full pill   | OBSERVED                                                 |
| Empty state icon circle (chat bubbles)   | 570, 1496, 144, 144              | 48 x 48         | C                               | #f0efec                                             | full circle | OBSERVED                                                 |
| Empty state title and text               | 212, 1708, 704, 120              | text            | C                               | #7a7974                                             | none        | OBSERVED                                                 |
| New chat and New task menu               | 437, 2336, 800, 389              | 267 x 130       | R 16, bottom 18                 | #fcfcfa translucent with shadow and hairline border | about 36    | OBSERVED, radius ESTIMATED                               |
| Memory sheet (IMG_1269, IMG_1270)        | 24, 1289, 1236, 1465             | 412 x 488       | L 8, R 8, bottom 8              | #f9f9f7                                             | about 38    | OBSERVED                                                 |
| Sheet grabber                            | 555, 1306, 174, 12               | 58 x 4          | C, sheet top + 6                | #bfbfbf                                             | full        | OBSERVED                                                 |
| Sheet close or back circle               | 80, 1345, 131, 131               | 44 x 44         | sheet L 19                      | #ffffff, hairline border, shadow                    | full circle | OBSERVED                                                 |
| Sheet title                              | 535, 1390, 215, 54               | text            | C                               | #000000                                             | none        | OBSERVED                                                 |
| Empty icon circle (two pages)            | 573, 1547, 138, 138              | 46 x 46         | C                               | #f0efec                                             | full circle | OBSERVED                                                 |
| Account memory card                      | 82, 1989, 1120, 485              | 373 x 162       | L 27, R 27                      | #ffffff                                             | about 26    | OBSERVED                                                 |
| Toggle (account memory)                  | 968, 2114, 182, 81               | 61 x 27         | right, 17 inside the card       | on #4076cf, white knob                              | full        | OBSERVED                                                 |
| Card separator                           | 140, 2318, 1004, 3               | 335 x 1         | inside the card, L 19, R 19     | #e6e7e6                                             | none        | OBSERVED                                                 |
| Chevron (View account memory)            | 1106, 2381, 18, 33               | 6 x 11          | right                           | #888781                                             | none        | OBSERVED                                                 |
| Memory files group card "You" (IMG_1270) | 82, 1665, 1120, 434              | 373 x 145       | L 27, R 27                      | #ffffff                                             | about 26    | OBSERVED (top from display, bottom from separator pitch) |
| Memory file row separator                | 140, 1881, 1004, 3               | 335 x 1         | inside the card                 | #e6e7e6                                             | none        | OBSERVED                                                 |
| Floating composer (IMG_1270)             | 69, 2506, 1146, 150              | 382 x 50        | sheet L 15, R 15                | #fcfcfc, hairline border                            | full pill   | OBSERVED                                                 |
| Composer microphone circle               | 960, 2528, 104, 105              | 35 x 35         | right                           | #f0efec                                             | full circle | OBSERVED                                                 |
| Composer send circle                     | 1087, 2530, 103, 103             | 34 x 34         | R 8 inside the pill             | #e1c0b3 (disabled), arrow #edd9d1                   | full circle | OBSERVED                                                 |

#### Text

| Text                                               | Height px                     | Est. size pt | Weight  | Colour  | Align   | Status    |
| -------------------------------------------------- | ----------------------------- | ------------ | ------- | ------- | ------- | --------- |
| `<project name>` page title                        | 41 (cap)                      | 19.5         | medium  | #000000 | left    | ESTIMATED |
| "Add files", "Add instructions", "View memory"     | 42 (cap A)                    | 20           | medium  | #131313 | centred | ESTIMATED |
| "Ask Claude anything"                              | 42 (cap A)                    | 20           | regular | #7a7974 | centred | ESTIMATED |
| "Chats in this project will show up here."         | 37 (ascender)                 | 17           | regular | #7a7974 | centred | ESTIMATED |
| "Memory" and "Memory files" sheet title            | 39 (cap M)                    | 18.5         | medium  | #000000 | centred | ESTIMATED |
| "No memory yet"                                    | 42 (cap N)                    | 20           | regular | #7a7974 | centred | ESTIMATED |
| "Project memory will show here after a few chats." | 32 (cap P)                    | 15           | regular | #7a7974 | centred | ESTIMATED |
| "Use account memory"                               | 41 (cap U)                    | 19.5         | regular | #0b0b0b | left    | ESTIMATED |
| Account memory description                         | 23 (cap A, clipped by region) | about 14     | regular | #52514e | left    | ESTIMATED |
| "View account memory"                              | 41 (cap V)                    | 19.5         | regular | #131313 | left    | ESTIMATED |
| "You", "Topics" group headings                     | 30                            | 14           | regular | #7b7974 | left    | ESTIMATED |
| "Preferences", "Profile", `<topic name>` file rows | 40 (cap P)                    | 19           | regular | #0b0b0b | left    | ESTIMATED |
| "Updated 3 months ago" style subtitle              | 29 (cap U)                    | 14           | regular | #888781 | left    | ESTIMATED |
| "Tell Claude what to change"                       | 39 (cap T)                    | 18.5         | regular | #7a7974 | left    | ESTIMATED |
| "New chat", "New task"                             | about 42                      | about 20     | regular | #0a0a0a | left    | ESTIMATED |

#### Spacing and notes

- The page buttons are full width pills, 49 pt tall, 7 pt apart (168 px pitch), first top at y 313 px (104 pt). Border colour #d8d8d6 when the page is not dimmed.
- In IMG_1269 and IMG_1270 the page behind is dimmed to #c7c7c5 (a dark scrim over #f9f9f7). The sheet floats 8 pt from the left, right and bottom edges and has a rounded bottom as well as a rounded top.
- Memory sheet empty state: icon circle top 1547 px, title top 1754 px, description lines 1831 and 1896 px (line pitch 65 px = 21.7 pt).
- Memory files rows: two-line rows (file name, then "Updated ..." line) 72 pt tall, chevron at the right edge as in the settings list. Group heading "You" sits 1608 px; the next group heading "Topics" sits 2207 px. The list continues under the floating composer, which fades the rows behind it.
- The menu in IMG_1271 holds two rows of icon plus label, row pitch about 46 pt; icons (pencil in a square, checklist) at x 403 px, labels at x 480 px. The menu is translucent with a shadow, so its edge radius is from the visible curve only.

### 2. Project new chat and composer states (IMG_1272, IMG_1273)

The new chat home reached from the project page. IMG_1272 is the composer at rest with a greeting. IMG_1273 is the keyboard open with an expanded composer and a project chip. Light theme.

#### Layout, top to bottom

| Element                                                       | Box px (x, y, w, h)               | Size pt (w x h) | Anchor                       | Fill or colour                        | Radius pt           | Status                     |
| ------------------------------------------------------------- | --------------------------------- | --------------- | ---------------------------- | ------------------------------------- | ------------------- | -------------------------- |
| Back button (chevron left)                                    | 58, 139, 136, 136 (with shadow)   | 44 x 44         | L 20, top 46                 | #fffffe, hairline border, soft shadow | full circle         | OBSERVED                   |
| Project chip with folder icon and `<project name>` (IMG_1272) | 226, 139, 550, 136 (with shadow)  | about 182 x 44  | L 75                         | #fffefe, hairline border, soft shadow | full pill           | OBSERVED                   |
| Right button (pencil in a square)                             | 1090, 139, 136, 136 (with shadow) | 44 x 44         | R 19                         | #fffffe                               | full circle         | OBSERVED                   |
| Starburst mark                                                | 583, 1270, 118, 118               | 39 x 39         | C                            | #cc7c5d                               | none                | OBSERVED                   |
| Greeting "Afternoon, `<user name>`"                           | 116, 1453, 1051, 75               | 350 x 25        | C                            | #383835, serif face                   | none                | OBSERVED                   |
| Composer card at rest                                         | 46, 2518, 1192, 160               | 397 x 53        | L 15, R 15, bottom 33        | #fefefd, hairline border, soft shadow | full pill           | OBSERVED                   |
| Plus circle                                                   | 72, 2544, 107, 108                | 36 x 36         | inside the card, L 9         | #f0efec                               | full circle         | OBSERVED                   |
| Microphone circle                                             | 972, 2544, 108, 108               | 36 x 36         | inside the card              | #f0efec                               | full circle         | OBSERVED                   |
| Voice button (waveform)                                       | 1105, 2544, 107, 108              | 36 x 36         | inside the card, R 9         | #131313, white icon                   | full circle         | OBSERVED                   |
| Greeting "What can I take off your plate?" (IMG_1273)         | 130, 822, 1020, 56                | 340 x 19        | C                            | #383835, serif face                   | none                | OBSERVED                   |
| Project chip pill (IMG_1273)                                  | 304, 1017, 677, 122               | 226 x 41        | C                            | #ffffff, soft shadow                  | full pill           | OBSERVED                   |
| Expanded composer card                                        | 24, 1414, 1237, 300               | 412 x 100       | L 8, R 8, above keyboard 8   | #fcfcfb, hairline border              | about 23            | OBSERVED, radius ESTIMATED |
| Plus circle (expanded)                                        | 49, 1581, 107, 108                | 36 x 36         | inside the card, bottom 8    | #f0efec                               | full circle         | OBSERVED                   |
| Model chip "Opus 5.5 High"                                    | 180, 1581, 372, 108               | 124 x 36        | after the plus circle, 8 gap | #f0efec                               | full pill           | OBSERVED                   |
| Microphone circle (expanded)                                  | 996, 1581, 108, 108               | 36 x 36         | inside the card              | #f0efec                               | full circle         | OBSERVED                   |
| Send circle (expanded)                                        | 1128, 1581, 108, 108              | 36 x 36         | R 8 inside the card          | #e0bfb1 (disabled), arrow lighter     | full circle         | OBSERVED                   |
| Keyboard                                                      | 0, 1738, 1284, 1040               | 428 x 347       | bottom 0                     | #e1e3e7                               | top corners rounded | OBSERVED                   |

#### Text

| Text                              | Height px                                      | Est. size pt                                       | Weight  | Colour            | Align          | Status    |
| --------------------------------- | ---------------------------------------------- | -------------------------------------------------- | ------- | ----------------- | -------------- | --------- |
| Project chip label                | 30 (cap P) in IMG_1272; 35 (cap P) in IMG_1273 | 14 in the header chip; 16.5 in the centred chip    | medium  | #131313 / #383835 | left / centred | ESTIMATED |
| Greeting                          | 57 (cap A, serif)                              | 27 (serif ratio differs, treat as plus or minus 2) | regular | #383835           | centred        | ESTIMATED |
| "What can I take off your plate?" | 56 (cap W, serif)                              | 26.5                                               | regular | #383835           | centred        | ESTIMATED |
| "Type or hold to talk"            | 41 (cap T)                                     | 19.5                                               | regular | #7a7974           | left, x 74 pt  | ESTIMATED |
| "Write a message..."              | 38 (cap W)                                     | 18                                                 | regular | #7a7974           | left, x 22 pt  | ESTIMATED |
| "Opus 5.5" in the chip            | 31 (cap O)                                     | 14.5                                               | regular | #131313           | left           | ESTIMATED |

#### Spacing and notes

- Gap from the starburst bottom (1388 px) to the greeting top (1453 px) is 22 pt.
- With the keyboard open, the greeting and the project chip sit above the composer and the back button stays alone in the header (no chip, no pencil button).
- The expanded composer puts the placeholder on its own line (top 1475 px, x 65) and the controls row below it (y 1581 to 1689 px), 8 pt above the card bottom.
- The keyboard is the standard iOS keyboard with a suggestion bar; its fill is #e1e3e7.

### 3. Settings home (IMG_1280)

The Settings sheet, opened from the app. It covers the screen from y 47 pt, over the dimmed page. Light theme, not scrolled. The measurements of the list pattern here are the reference for every later settings page.

#### Layout, top to bottom

| Element                       | Box px (x, y, w, h)                                  | Size pt (w x h) | Anchor                        | Fill or colour                        | Radius pt            | Status              |
| ----------------------------- | ---------------------------------------------------- | --------------- | ----------------------------- | ------------------------------------- | -------------------- | ------------------- |
| Sheet                         | 0, 141, 1284, 2637                                   | 428 x full      | top 47, L 0, R 0              | #f9f9f7                               | about 38 top corners | OBSERVED            |
| Close button (X)              | 60, 201, 132, 132                                    | 44 x 44         | L 20, top 67                  | #ffffff, hairline border, soft shadow | full circle          | OBSERVED            |
| Info button (i)               | 1092, 201, 132, 132                                  | 44 x 44         | R 20, top 67                  | same                                  | full circle          | OBSERVED            |
| Title "Settings"              | 530, 246, 223, 57                                    | text            | C                             | #000000                               | none                 | OBSERVED            |
| Account card                  | 60, 411, 1164, 630                                   | 388 x 210       | L 20, R 20, top 137           | #ffffff                               | 26                   | OBSERVED            |
| Account row 1 and 2           | y 411 to 642 and 645 to 876                          | 388 x 77        | inside the card               | #ffffff                               | none                 | OBSERVED            |
| Avatar circle (initials)      | 120, 456, 131, 131                                   | 44 x 44         | inside the card, L 20         | #e7e6e1                               | full circle          | OBSERVED            |
| Row menu dots (three dots)    | 1074, 523, 48, 9                                     | 16 x 3          | right                         | #888781                               | none                 | OBSERVED            |
| Selected check mark           | 1073, 738, 50, 49                                    | 17 x 16         | right                         | #3868b9                               | none                 | OBSERVED            |
| Add account row (plus, label) | 136 to 612, 939 to 981                               | 388 x 54        | inside the card               | label #284e90                         | none                 | OBSERVED            |
| Account section card (7 rows) | 60, 1209, 1164, 1134                                 | 388 x 378       | L 20, R 20                    | #ffffff                               | 26                   | OBSERVED            |
| Row separators                | 247, 1368 / 1530 / 1692 / 1854 / 2016 / 2178, 917, 3 | 306 x 1         | start 82 from the screen edge | #e6e7e6                               | none                 | OBSERVED            |
| Row icon (person)             | 136, 1263, 48, 54                                    | 16 x 18         | inside the card, centre 33    | #52514e                               | none                 | OBSERVED            |
| Chevron                       | 1124, 1273, 19, 34                                   | 6.3 x 11.3      | right                         | #888781                               | none                 | OBSERVED            |
| App section card              | 60, 2511, 1164, 1134+                                | 388 x continues | L 20, R 20                    | #ffffff                               | 26                   | OBSERVED (top only) |

#### Text

| Text                                                                                                                       | Height px                 | Est. size pt | Weight   | Colour  | Align                             | Status    |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------ | -------- | ------- | --------------------------------- | --------- |
| "Settings"                                                                                                                 | 43 (cap S with overshoot) | 20           | semibold | #000000 | centred                           | ESTIMATED |
| "Personal" account title                                                                                                   | 41 (cap P)                | 19.5         | regular  | #0b0b0b | left, x 93 pt                     | ESTIMATED |
| `<email>` and "Ultra" subtitle                                                                                             | 37 (ascender)             | 17           | regular  | #52514e | left                              | ESTIMATED |
| "Add account"                                                                                                              | 42 (cap A)                | 20           | regular  | #284e90 | left, x 92 pt                     | ESTIMATED |
| "Account", "App" section headings                                                                                          | 35 (cap A)                | 16.5         | regular  | #7a7974 | left, x 41 pt                     | ESTIMATED |
| "Profile", "Billing", "Usage", "Notifications", "Time and focus", "Privacy", "Shared links", "Capabilities", "Claude Code" | 41 (cap P)                | 19.5         | regular  | #131313 | left, x 84 pt                     | ESTIMATED |
| "Ultra plan" value                                                                                                         | 41 (cap U)                | 19.5         | regular  | #8a8a8d | right, 15.7 pt before the chevron | ESTIMATED |

#### Spacing and notes

- Row height in the section card is 54 pt (162 px pitch); the two account rows are 77 pt, the Add account row 54 pt.
- The first card starts 16 pt below the header bottom (header band ends y 362 px, card at 411 px).
- The section heading cap top is 91 px (30 pt) below the card above and the next card starts 41 px (14 pt) below the heading bottom.
- Card corner radius ESTIMATED 26 pt: at 6 px below the top edge the card edge is 48 px in from its left edge, which fits a 78 px radius; the check at 21 px below gives 25 px, matching the read of 24 px.
- The cards have no border and no shadow; they stand out only by the fill #ffffff against #f9f9f7.
- Status bar over the sheet region stays on the dimmed page (#c2c2c0 above the sheet).

### 4. ChatGPT project screens, misfiled in this range (IMG_1274, IMG_1275, IMG_1276, IMG_1277, IMG_1278)

These five screenshots are ChatGPT, not Claude: dark theme, a project named `<project name>` with Chats and Sources tabs, and a Sources empty state titled "Give ChatGPT more context". They are measured here at a lighter depth so the lead can move them. IMG_1274 is the Chats tab with a list; IMG_1275 is the Sources tab empty state; IMG_1276 and IMG_1277 are the keyboard-open composer with a "Chat" mode selector under the title (IMG_1277 differs only in the blue text caret being shown); IMG_1278 is the same screen with the Chat and Work dropdown open.

#### Layout, top to bottom

| Element                                             | Box px (x, y, w, h)                     | Size pt (w x h)        | Anchor                        | Fill or colour        | Radius pt   | Status                     |
| --------------------------------------------------- | --------------------------------------- | ---------------------- | ----------------------------- | --------------------- | ----------- | -------------------------- |
| Page background                                     | full screen                             | 428 x 926              | none                          | #000000               | none        | OBSERVED                   |
| Back button (IMG_1274)                              | 60, 141, 132, 132                       | 44 x 44                | L 20, top 47                  | #1f1f1f               | full circle | OBSERVED                   |
| Ellipsis button (IMG_1274)                          | 1092, 141, 132, 132                     | 44 x 44                | R 20, top 47                  | #1f1f1f               | full circle | OBSERVED                   |
| Title with folder icon (`<project name>`)           | 495, 183, 298, 45                       | text                   | C                             | #ffffff               | none        | OBSERVED                   |
| Chats tab pill (selected)                           | 48, 351, 249, 132                       | 83 x 44                | L 16                          | #414141               | full pill   | OBSERVED                   |
| Sources tab (unselected)                            | text at 372, 395                        | text                   | after the first tab           | no fill, text #afafaf | none        | OBSERVED                   |
| Sources tab pill (selected, IMG_1275)               | 321, 351, 309, 132                      | 103 x 44               | L 107                         | #414141               | full pill   | OBSERVED                   |
| Chat list rows                                      | title tops at y 596, 810, 1024, 1238 px | pitch 71.3 pt (214 px) | text left x 75 px (25 pt)     | no card, no separator | none        | OBSERVED                   |
| Composer pill (IMG_1274, IMG_1275)                  | 60, 2503, 1160, 173                     | 387 x 58               | L 20, R 20, bottom 34         | #303030               | full pill   | OBSERVED                   |
| Plus icon (IMG_1274)                                | 130, 2573, 60, 60                       | 20 x 20                | inside the pill               | #ffffff               | none        | OBSERVED                   |
| Microphone icon                                     | 934, 2566, 57, 72                       | 19 x 24                | inside the pill               | #ffffff               | none        | OBSERVED                   |
| Waveform button                                     | 1105, 2544, 107, 107                    | 36 x 36                | R 24                          | #ffffff, dark icon    | full circle | OBSERVED                   |
| Sources empty state tiles (three tilted icon tiles) | 466, 1191, 352, 137                     | 117 x 46               | C                             | #212121               | about 13    | OBSERVED                   |
| Add button (IMG_1275)                               | 529, 1693, 227, 129                     | 76 x 43                | C                             | #ffffff               | full pill   | OBSERVED                   |
| Expanded composer (IMG_1276)                        | 36, 1413, 1212, 288                     | 404 x 96               | L 12, R 12, above keyboard 12 | #202020               | about 23    | OBSERVED, radius ESTIMATED |
| Waveform button (IMG_1276)                          | 1121, 1574, 99, 104                     | 34 x 35                | R 14                          | #ffffff               | full circle | OBSERVED                   |
| Mode selector under the title ("Chat" with chevron) | 595, 233, 141, 35                       | 47 x 12                | C                             | text #afafaf          | none        | OBSERVED                   |
| Dropdown menu (IMG_1278)                            | 268, 156, 532, 294                      | 177 x 98               | L 89, top 52                  | #212121, shadow       | about 30    | OBSERVED, radius ESTIMATED |

#### Text

| Text                                   | Height px                                      | Est. size pt                               | Weight  | Colour                               | Align                     | Status    |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------ | ------- | ------------------------------------ | ------------------------- | --------- |
| `<project name>` title                 | 44 (with ascender)                             | 19                                         | medium  | #ffffff                              | centred                   | ESTIMATED |
| "Chats" and "Sources" tabs             | 42 (cap C)                                     | 20                                         | regular | #ffffff selected, #afafaf unselected | centred in the pill       | ESTIMATED |
| `<chat title>` row title               | 42 (cap C)                                     | 20                                         | regular | #ffffff                              | left                      | ESTIMATED |
| `<message text>` row preview           | about 40 (first line, may include an ascender) | UNKNOWN (a clean capital was not isolated) | regular | #8d8d93                              | left                      | UNKNOWN   |
| "Give ChatGPT more context"            | 42 (cap G)                                     | 20                                         | regular | #ffffff                              | centred                   | ESTIMATED |
| Sources description (three lines)      | 35 (cap U)                                     | 16.5                                       | regular | #afafaf                              | centred, line pitch 22 pt | ESTIMATED |
| "Add"                                  | 40 (cap A)                                     | 19                                         | medium  | #000000                              | centred                   | ESTIMATED |
| "Message `<project name>`" placeholder | 40 (cap M)                                     | 19                                         | regular | #828282                              | left                      | ESTIMATED |
| "Chat" under the title                 | 33 (cap C)                                     | 15.5                                       | regular | #afafaf                              | centred                   | ESTIMATED |

#### Spacing and notes

- The list in IMG_1274 has no separators and no cards; the content scrolls under a composer that sits on a faded bar at the bottom.
- In IMG_1275 the empty state block (tiles, title, three description lines, Add) is centred vertically around y 1500 px.
- The expanded composer in IMG_1276 holds the placeholder on the first line (x 89 px, cap top 1477 px) and icons on the second line: plus, a circled magnifier icon, microphone, then the waveform button.
- The keyboard here is the dark iOS keyboard (key fill #3a3a3a on #202020), top edge at y 1737 px.

### 5. Settings: Profile (IMG_1281)

A pushed page of the Settings sheet. Same sheet, header pattern and list pattern as screen 3; only the differences are listed.

#### Layout, top to bottom

| Element                         | Box px (x, y, w, h) | Size pt (w x h) | Anchor                      | Fill or colour                  | Radius pt   | Status   |
| ------------------------------- | ------------------- | --------------- | --------------------------- | ------------------------------- | ----------- | -------- |
| Back button                     | 60, 201, 132, 132   | 44 x 44         | L 20, top 67                | #ffffff, hairline border        | full circle | OBSERVED |
| Confirm button (check)          | 1092, 201, 132, 132 | 44 x 44         | R 20                        | #9a9a99 (disabled), white check | full circle | OBSERVED |
| Avatar circle                   | 498, 411, 288, 288  | 96 x 96         | C, top 137                  | #e7e6e1                         | full circle | OBSERVED |
| Edit photo pill                 | 486, 722, 313, 97   | 104 x 32        | C, 8 below the avatar       | transparent, hairline border    | full pill   | OBSERVED |
| Name card (Full name, Nickname) | 60, 867, 1164, 336  | 388 x 112       | L 20, R 20                  | #ffffff                         | 26          | OBSERVED |
| Separator in the name card      | 120, 1032, 1044, 3  | 348 x 1         | inside the card, L 20, R 20 | #e6e7e6                         | none        | OBSERVED |
| Instructions card (single row)  | 60, 1466, 1164, 162 | 388 x 54        | L 20, R 20                  | #ffffff                         | 26          | OBSERVED |
| Delete account card             | 60, 1829, 1164, 162 | 388 x 54        | L 20, R 20                  | #ffffff                         | 26          | OBSERVED |
| Trash icon                      | 133, 1880, 54, 60   | 18 x 20         | inside the card             | #832e2a                         | none        | OBSERVED |

#### Text

| Text                                        | Height px                 | Est. size pt | Weight  | Colour                | Align          | Status    |
| ------------------------------------------- | ------------------------- | ------------ | ------- | --------------------- | -------------- | --------- |
| Two-letter initials (`<initials>`)          | 79 (cap S with overshoot) | 37           | medium  | #131313               | centred        | ESTIMATED |
| "Edit photo"                                | 35 (cap E)                | 16.5         | medium  | #131313               | centred        | ESTIMATED |
| "Full name", "Nickname" labels              | 41 (cap F)                | 19.5         | regular | #52514e               | left, x 41 pt  | ESTIMATED |
| `<user name>` values                        | 43 (cap S)                | 20           | regular | #0b0b0b               | left, x 147 pt | ESTIMATED |
| "Claude calls you by your nickname."        | 30 (cap C)                | 14           | regular | #7a7974               | left           | ESTIMATED |
| "Instructions" heading                      | 34 (cap I)                | 16           | regular | #7a7974               | left           | ESTIMATED |
| "How you'd like Claude to respond"          | 41 (cap H)                | 19.5         | regular | #7a7974 (placeholder) | left           | ESTIMATED |
| Footnote with link "Anthropic's guidelines" | 30 (cap Y)                | 14           | regular | #7a7974, link blue    | left           | ESTIMATED |
| "Delete account"                            | 40 (cap D)                | 19           | regular | #832e2a               | left, x 84 pt  | ESTIMATED |

#### Spacing and notes

- The two field rows are 56 pt tall (168 px). Label column starts at x 125 px; the value column starts at x 441 px (147 pt) for both rows.
- Edit photo sits 23 px (8 pt) below the avatar; the name card starts 48 px (16 pt) below the Edit photo pill.
- Helper text sits 36 px below the name card bottom (cap top 1239 px); Instructions heading cap top is 1390 px.
- The danger row uses the same card as a list row, with a red icon and red label.

### 6. Settings: Billing (IMG_1282)

A short page. Same patterns as screen 3.

#### Layout, top to bottom

| Element                                               | Box px (x, y, w, h)                   | Size pt (w x h)     | Anchor                              | Fill or colour           | Radius pt   | Status   |
| ----------------------------------------------------- | ------------------------------------- | ------------------- | ----------------------------------- | ------------------------ | ----------- | -------- |
| Back button                                           | 60, 201, 132, 132                     | 44 x 44             | L 20, top 67                        | #ffffff, hairline border | full circle | OBSERVED |
| Account plan card (single row, value right)           | 60, 411, 1164, 159                    | 388 x 53            | L 20, R 20                          | #ffffff                  | 26          | OBSERVED |
| Actions card (Manage subscription, Restore purchases) | 60, 618, 1164, 324                    | 388 x 108           | L 20, R 20, 16 below the first card | #ffffff                  | 26          | OBSERVED |
| Separator                                             | 247, 777, 917, 3                      | 306 x 1             | icon row separator                  | #e6e7e6                  | none        | OBSERVED |
| Row icons (dollar, circular arrow)                    | 142, 669, 36, 60 and 132, 834, 56, 54 | 12 x 20 and 19 x 18 | inside the card                     | #52514e                  | none        | OBSERVED |

#### Text

| Text                                       | Height px                  | Est. size pt | Weight   | Colour  | Align                   | Status    |
| ------------------------------------------ | -------------------------- | ------------ | -------- | ------- | ----------------------- | --------- |
| "Billing" title                            | about 41 (cap B)           | 19.5         | semibold | #000000 | centred                 | ESTIMATED |
| "Account plan"                             | 41 (cap A)                 | 19.5         | regular  | #000000 | left, x 41 pt (no icon) | ESTIMATED |
| "Ultra" value                              | 43                         | 20           | regular  | #8a8a8d | right                   | ESTIMATED |
| "Manage subscription", "Restore purchases" | 42 to 55 (with descenders) | 19.5         | regular  | #131313 | left, x 84 pt           | ESTIMATED |

#### Spacing and notes

- Rows are 53 to 54 pt tall; the first card is a single plain row with no icon and no chevron.
- The page below the cards is empty; there is no footer.

### 7. Settings: Usage, top and scrolled (IMG_1283, IMG_1284)

Progress cards, limit rows with buttons, a credits card with a toggle and a link row. IMG_1283 is the top; IMG_1284 is scrolled by 313 px (104 pt) so the end of the page shows. Light theme.

#### Layout, top to bottom (IMG_1283)

| Element                            | Box px (x, y, w, h)              | Size pt (w x h) | Anchor                      | Fill or colour               | Radius pt   | Status   |
| ---------------------------------- | -------------------------------- | --------------- | --------------------------- | ---------------------------- | ----------- | -------- |
| Back button                        | 60, 201, 132, 132                | 44 x 44         | L 20, top 67                | #ffffff, hairline border     | full circle | OBSERVED |
| Right pill (refresh, info)         | 922, 199, 304, 136 (with shadow) | 101 x 45        | R 19, top 66                | #ffffff, hairline border     | full pill   | OBSERVED |
| Current session card               | 60, 411, 1164, 311               | 388 x 104       | L 20, R 20                  | #ffffff                      | 26          | OBSERVED |
| Progress track                     | 120, 564, 1044, 24               | 348 x 8         | inside the card, L 20, R 20 | #d1e1f9                      | full        | OBSERVED |
| Progress fill (7%)                 | 120, 564, 73, 24                 | 24 x 8          | start of the track          | #467bd0                      | full        | OBSERVED |
| All models card (8%, chevron down) | 60, 890, 1164, 311               | 388 x 104       | L 20, R 20                  | #ffffff                      | 26          | OBSERVED |
| Limit resets card (two rows)       | 60, 1369, 1164, 490              | 388 x 163       | L 20, R 20                  | #ffffff                      | 26          | OBSERVED |
| Reset for free button              | 761, 1443, 404, 98               | 135 x 33        | right, 20 inside the card   | #ffffff, 1 pt border #dddddd | full pill   | OBSERVED |
| Second Reset for free button       | 761, 1688, 404, 92               | 135 x 31        | same                        | same                         | full pill   | OBSERVED |
| Row separator in the card          | 120, 1611, 1044, 3               | 348 x 1         | inside the card             | #e6e7e6                      | none        | OBSERVED |
| Info icon (circled i)              | 385, 1441, 43, 43                | 14 x 14         | after the label             | #7a7974                      | none        | OBSERVED |
| Credits card                       | 60, 2122, 1164, 444              | 388 x 148       | L 20, R 20                  | #ffffff                      | 26          | OBSERVED |
| Toggle (usage credits, off)        | 981, 2223, 189, 84               | 63 x 28         | right, 18 inside the card   | #c5c5c7                      | full        | OBSERVED |
| Buy usage credits card (IMG_1284)  | 60, 2454, 1164, 162              | 388 x 54        | L 20, R 20                  | #ffffff                      | 26          | OBSERVED |
| Card icon (credit card)            | 130, 2511, 60, 48                | 20 x 16         | inside the card             | #4076cf                      | none        | OBSERVED |

#### Text

| Text                                                | Height px                 | Est. size pt | Weight  | Colour                   | Align         | Status    |
| --------------------------------------------------- | ------------------------- | ------------ | ------- | ------------------------ | ------------- | --------- |
| "Current session", "All models"                     | 43 (cap C with overshoot) | 20           | regular | #131313                  | left          | ESTIMATED |
| "7% used", "8% used"                                | 34 (digit 7)              | 16           | regular | #7a7974                  | right         | ESTIMATED |
| "Resets at 2:00 PM" style line                      | 30 (cap R)                | 14           | regular | #7a7974                  | left          | ESTIMATED |
| "Weekly limits", "Limit resets", "Credits" headings | 35                        | 16.5         | regular | #7a7974                  | left          | ESTIMATED |
| "Full reset", "Fable reset"                         | 44 (with ascender)        | 19.5         | regular | #131313                  | left          | ESTIMATED |
| "Expires Dec 10" style line                         | 42 (with ascender)        | 17           | regular | #7a7974                  | left          | ESTIMATED |
| "Reset for free" label                              | 37 (ascender f)           | 17.5         | medium  | #131313                  | centred       | ESTIMATED |
| "Usage credits"                                     | 44                        | 19.5         | regular | #131313                  | left          | ESTIMATED |
| Description with link "Learn more"                  | 42 (with ascender)        | 17           | regular | #7a7974, link underlined | left          | ESTIMATED |
| "Current balance" and "0 credits"                   | 43                        | 20           | regular | #131313 / #7a7974        | left / right  | ESTIMATED |
| "Buy usage credits"                                 | 44                        | 20           | regular | #4076cf                  | left, x 84 pt | ESTIMATED |

#### Spacing and notes

- Progress bar: 8 pt thick, fully round, fill width 7 percent of the track (73 of 1044 px). The "All models" bar is the same size and colour pair.
- Limit rows: 81 pt (242 px) and 82 pt (245 px), separated by a 1 pt line; the button is vertically centred and has 20 pt to the card edge.
- Credits card: the toggle row is 96 pt (289 px), the balance row 51 pt (152 px), a separator between them at y 2411 px.
- IMG_1284 scrolled state: the header becomes a translucent bar from the sheet top to y 362 px (the faint content of the previous screen shows through it) with a 1 px bottom edge; a scroll indicator 3 pt wide (x 1266 to 1275 px) in #a2a2a0 sits at the right edge.
- The page ends with the Buy usage credits card, 76 pt (2616 to 2778 px) above the bottom of the screen at its end.

### 8. Settings: Notifications (IMG_1285, IMG_1286)

Two near-identical screenshots (12:43 clock on both): a stack of toggle cards. Each card holds title, two-line description and a right toggle. The measurements here are the reference for toggle rows.

#### Layout, top to bottom

| Element                                              | Box px (x, y, w, h)                   | Size pt (w x h) | Anchor                                      | Fill or colour           | Radius pt   | Status   |
| ---------------------------------------------------- | ------------------------------------- | --------------- | ------------------------------------------- | ------------------------ | ----------- | -------- |
| Back button                                          | 60, 201, 132, 132                     | 44 x 44         | L 20, top 67                                | #ffffff, hairline border | full circle | OBSERVED |
| Card 1 (Replies, Scheduled tasks, Research complete) | 60, 413, 1164, 794                    | 388 x 265       | L 20, R 20                                  | #ffffff                  | 26          | OBSERVED |
| Card 2 (three Code and Dispatch rows)                | 60, 1258, 1164, 852                   | 388 x 284       | 16 below card 1                             | #ffffff                  | 26          | OBSERVED |
| Card 3 (Product updates, single row)                 | 60, 2159, 1164, 285                   | 388 x 95        | 16 below card 2                             | #ffffff                  | 26          | OBSERVED |
| Row separators                                       | 120, 693 / 978 / 1541 / 1823, 1044, 3 | 348 x 1         | inside the card, L 20, R 20                 | #e6e7e6                  | none        | OBSERVED |
| Toggle (on)                                          | 981, 512, 189, 84                     | 63 x 28         | R 18 inside the card, top 20 inside the row | #3868b9, white knob      | full        | OBSERVED |

#### Text

| Text                               | Height px  | Est. size pt | Weight   | Colour  | Align                          | Status    |
| ---------------------------------- | ---------- | ------------ | -------- | ------- | ------------------------------ | --------- |
| "Notifications" title              | 41 (cap N) | 19.5         | semibold | #000000 | centred                        | ESTIMATED |
| "Replies" and the other row titles | 41 (cap R) | 19.5         | regular  | #131313 | left, x 40 pt                  | ESTIMATED |
| Descriptions                       | 30 (cap G) | 14           | regular  | #7a7974 | left, 20 pt line pitch (59 px) | ESTIMATED |

#### Spacing and notes

- Row heights: a row with a two-line description is 94 pt (282 px); the last row of a card is 76 pt (227 px) when its description has one line.
- Title cap top sits 61 px (20 pt) below the row top; first description line cap top sits 80 px (27 pt) below the title cap top. The description wraps before the toggle (text width about 585 px, toggle column 981 to 1170 px).
- All toggles in the screenshot are on.

### 9. Settings: Time and focus (IMG_1287)

A page that does not follow the card pattern: plain content on #f9f9f9 with form-like controls, under a header bar with a bottom edge. Its colours (#f9f9f9 background, #181818 text, #636363 secondary) differ slightly from the other settings pages (#f9f9f7, #131313, #7a7974), which suggests an embedded web page; this is an inference, not read from pixels.

#### Layout, top to bottom

| Element                       | Box px (x, y, w, h)                 | Size pt (w x h) | Anchor                      | Fill or colour                        | Radius pt            | Status                     |
| ----------------------------- | ----------------------------------- | --------------- | --------------------------- | ------------------------------------- | -------------------- | -------------------------- |
| Header bar                    | 0, 141, 1284, 221                   | 428 x 74        | top 47                      | #fffffe, bottom edge #e5e6e5 at y 362 | top corners about 38 | OBSERVED                   |
| Back button                   | 60, 201, 132, 132                   | 44 x 44         | L 20, top 67                | #ffffff, hairline border              | full circle          | OBSERVED                   |
| Page heading "Time and focus" | 58, 436, 330, 36                    | text            | L 19                        | #181818                               | none                 | OBSERVED                   |
| Break reminders select 1      | 57, 883, 399, 135                   | 133 x 45        | L 19                        | fill #fcfcfc, 1 pt border #e8e8e8     | about 14             | OBSERVED, radius ESTIMATED |
| Break reminders select 2      | 496, 883, 399, 135                  | 133 x 45        | 13 right of select 1        | same                                  | about 14             | OBSERVED                   |
| Select chevron                | 366, 941, 32, 18                    | 11 x 6          | inside the select, right 19 | #656565                               | none                 | OBSERVED                   |
| Divider                       | 57, 1085, 1170, 3                   | 390 x 1         | L 19, R 19                  | #ededed                               | none                 | OBSERVED                   |
| Weekday circles (7)           | 57, 1444, 114, 114 and every 154 px | 38 x 38 each    | L 19, pitch 51.3 pt         | #e1e1e1                               | full circle          | OBSERVED                   |

#### Text

| Text                                 | Height px      | Est. size pt | Weight  | Colour  | Align                           | Status    |
| ------------------------------------ | -------------- | ------------ | ------- | ------- | ------------------------------- | --------- |
| "Time and focus" (title and heading) | 36 (cap T)     | 17           | medium  | #181818 | centred (title), left (heading) | ESTIMATED |
| "Break reminders", "Quiet hours"     | 36 (cap B)     | 17           | regular | #181818 | left                            | ESTIMATED |
| Descriptions                         | 37 (cap G)     | 17.5         | regular | #636363 | left                            | ESTIMATED |
| Select value "-"                     | dash 21 x 5 px | text         | regular | #181818 | left, x 33 pt                   | OBSERVED  |
| Weekday letters S M T W T F S        | about 30       | 14           | medium  | #636363 | centred                         | ESTIMATED |

#### Spacing and notes

- The header bar has a visible bottom edge because the page scrolls under it; the page area is flat (no cards).
- The selects are 13 pt apart (40 px); the weekday circles are 13 pt apart (40 px gap, 154 px pitch).
- The page repeats its title as a heading below the header bar.

### 10. Settings: Privacy and Shared links (IMG_1288, IMG_1289)

IMG_1288 is the Privacy page: a text card and two toggle cards. IMG_1289 is the Shared links page in its empty state.

#### Layout, top to bottom

| Element                                    | Box px (x, y, w, h)       | Size pt (w x h) | Anchor                                           | Fill or colour           | Radius pt   | Status                                                                           |
| ------------------------------------------ | ------------------------- | --------------- | ------------------------------------------------ | ------------------------ | ----------- | -------------------------------------------------------------------------------- |
| Back button                                | 60, 201, 132, 132         | 44 x 44         | L 20, top 67                                     | #ffffff, hairline border | full circle | OBSERVED                                                                         |
| Data privacy card                          | 60, 411, 1164, about 520  | 388 x about 173 | L 20, R 20                                       | #ffffff                  | 26          | OBSERVED (edges read at x 1200 and corrected for the corner, plus or minus 3 px) |
| Help improve card                          | 60, 978, 1164, about 345  | 388 x about 115 | 16 below the first card                          | #ffffff                  | 26          | OBSERVED (same method)                                                           |
| Voice data card                            | 60, 1370, 1164, about 345 | 388 x about 115 | 16 below                                         | #ffffff                  | 26          | OBSERVED (same method)                                                           |
| Toggle (off)                               | 981, 1108, 189, 84        | 63 x 28         | R 18 inside the card, top aligned with the title | #c5c5c7                  | full        | OBSERVED                                                                         |
| Shared links empty icon circle (link icon) | 570, 1397, 144, 144       | 48 x 48         | C                                                | #f0efec                  | full circle | OBSERVED                                                                         |

#### Text

| Text                                                                            | Height px     | Est. size pt | Weight  | Colour                    | Align                    | Status    |
| ------------------------------------------------------------------------------- | ------------- | ------------ | ------- | ------------------------- | ------------------------ | --------- |
| "Data privacy", "Help improve our AI models", "Allow us to use your voice data" | 41 (cap D, H) | 19.5         | regular | #131313                   | left                     | ESTIMATED |
| Card descriptions                                                               | 30 (cap A)    | 14           | regular | #7a7974, links underlined | left, 19.5 pt line pitch | ESTIMATED |
| "No shared links"                                                               | 42 (cap N)    | 20           | regular | #7a7974                   | centred                  | ESTIMATED |
| "Links you share will show up here."                                            | 34 (cap L)    | 16           | regular | #7a7974                   | centred                  | ESTIMATED |

#### Spacing and notes

- The Privacy page uses the same card, title and description pattern as Notifications; the first card has no toggle and a blank line inside its description.
- The empty state is placed at about 56 percent of the screen height: icon circle top at y 1397 px, title cap top at 1611 px, subtitle cap top at 1691 px.

### 11. Settings: Capabilities (IMG_1290, IMG_1291, IMG_1292)

A long page of icon rows with toggles, then memory rows with a navigation row and an inline warning, then a single choice list. IMG_1290 is the top, IMG_1291 the middle, IMG_1292 the bottom (the page scrolled further by 181 px from IMG_1291).

#### Layout, top to bottom

| Element                          | Box px (x, y, w, h)                                                    | Size pt (w x h)     | Anchor                                                | Fill or colour                        | Radius pt   | Status   |
| -------------------------------- | ---------------------------------------------------------------------- | ------------------- | ----------------------------------------------------- | ------------------------------------- | ----------- | -------- |
| Back button                      | 60, 201, 132, 132                                                      | 44 x 44             | L 20, top 67                                          | #ffffff, hairline border              | full circle | OBSERVED |
| Features card (5 rows)           | 60, 411, 1164, 1969                                                    | 388 x 656           | L 20, R 20                                            | #ffffff                               | 26          | OBSERVED |
| Row icons                        | 126, 468, 60, 60 (Artifacts), 129, 704, 54, 54 (Inline visualizations) | 18 to 20 x 18 to 20 | inside the card, L 22                                 | #52514e, first row #a8a7a6 (disabled) | none        | OBSERVED |
| Row separators                   | 216, y, 948, 3                                                         | 316 x 1             | start 72 from the screen edge, end 20 inside the card | #e6e7e6                               | none        | OBSERVED |
| Toggle (disabled on, Artifacts)  | 981, 456, 189, 84                                                      | 63 x 28             | R 18 inside the card                                  | #98b3db                               | full        | OBSERVED |
| Toggle (on)                      | 981, 689, 189, 84                                                      | 63 x 28             | same                                                  | #3868b9                               | full        | OBSERVED |
| Beta badge                       | 749, 700, 128, 66                                                      | 43 x 22             | after the title                                       | #f3f3f3                               | full pill   | OBSERVED |
| Memory card                      | starts 411 px in IMG_1291                                              | 388 wide            | L 20, R 20                                            | #ffffff                               | 26          | OBSERVED |
| Memory files row chevron         | 1124, 1554, 19, 34                                                     | 6.3 x 11.3          | right                                                 | #888781                               | none        | OBSERVED |
| Inline warning icon (triangle)   | 126, 1739, 60, 54                                                      | 20 x 18             | inside the card, L 22                                 | #c04741                               | none        | OBSERVED |
| Inline warning dismiss (X)       | 1115, 1735, 36, 36                                                     | 12 x 12             | right                                                 | #000000                               | none        | OBSERVED |
| Tool access card (3 choice rows) | 60, about 1815 in IMG_1291                                             | 388 wide            | L 20, R 20                                            | #ffffff                               | 26          | OBSERVED |
| Selected check mark              | 1099, 2159, 50, 49                                                     | 17 x 16             | right                                                 | #3868b9                               | none        | OBSERVED |
| Scroll indicator                 | 1266 to 1275, 1310 to 2495                                             | 3 pt wide           | R 3                                                   | #dededc                               | full        | OBSERVED |

#### Text

| Text                                                                                                                              | Height px     | Est. size pt | Weight   | Colour                      | Align         | Status    |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------ | -------- | --------------------------- | ------------- | --------- |
| "Capabilities" title                                                                                                              | 41 (cap C)    | 19.5         | semibold | #000000                     | centred       | ESTIMATED |
| "Artifacts", "Inline visualizations", "Code execution and file creation", "Web search", "Switch models when a message is flagged" | 41 to 44      | 19.5         | regular  | #131313 (first row #888888) | left, x 72 pt | ESTIMATED |
| Descriptions, e.g. "Required by code execution"                                                                                   | 30            | 14           | regular  | #7a7974 (first row #bdbcba) | left          | ESTIMATED |
| "Beta"                                                                                                                            | about 28      | 13           | medium   | #52514e                     | centred       | ESTIMATED |
| "Memory", "Tool access" headings                                                                                                  | 35            | 16.5         | regular  | #7a7974                     | left          | ESTIMATED |
| Warning text                                                                                                                      | 37 (ascender) | 17.5         | regular  | #52514e                     | left, x 73 pt | ESTIMATED |
| "Auto", "On demand", "Always available"                                                                                           | 43            | 20           | regular  | #131313                     | left, x 40 pt | ESTIMATED |

#### Spacing and notes

- Feature rows with an icon start text at x 217 px (72 pt); the memory and tool access rows have no icon and start text at x 122 px (41 pt), so their separators run from x 120 px.
- A title that wraps (for example "Code execution and file creation") adds a 58 px line pitch to the title (19.3 pt) before the description starts.
- The disabled Artifacts row dims its icon, title, description and toggle together (toggle #98b3db instead of #3868b9).
- Inline warning sits inside the Memory card, below Memory files and above the card bottom, with the dismiss X aligned to the chevron column.

### 12. Settings: Claude Code (IMG_1293)

A page with a slider, two selects shown as blue value text with an up and down chevron icon, two toggles and a link row.

#### Layout, top to bottom

| Element                                              | Box px (x, y, w, h)                                    | Size pt (w x h)     | Anchor                    | Fill or colour                         | Radius pt   | Status                                                      |
| ---------------------------------------------------- | ------------------------------------------------------ | ------------------- | ------------------------- | -------------------------------------- | ----------- | ----------------------------------------------------------- |
| Back button                                          | 60, 201, 132, 132                                      | 44 x 44             | L 20, top 67              | #ffffff, hairline border               | full circle | OBSERVED                                                    |
| Appearance card (slider, Transcript font, Code font) | 60, 531, 1164, 573                                     | 388 x 191           | L 20, R 20                | #ffffff                                | 26          | OBSERVED (top from display, bottom from the read at x 1200) |
| Slider track                                         | 176, 706, 922, 17                                      | 307 x 5.7           | inside the card           | fill #4076cf to the knob, rest #e5e6e5 | full        | OBSERVED                                                    |
| Slider knob                                          | 581, about 673, 110, about 80                          | about 37 x 27       | on the track              | #ffffff with soft shadow               | full pill   | ESTIMATED (shadow blurs the edge)                           |
| Slider end labels (small A, large A)                 | 121, 699, 29, 31 and 1123, 693, 37, 42                 | 10 x 10 and 12 x 14 | track ends                | #52514e                                | none        | OBSERVED                                                    |
| Slider tick dots                                     | 224 and 1036, 740, 9, 4                                | 3 x 1.3             | below the track           | #c6c6c8                                | full        | OBSERVED                                                    |
| Select value with up and down chevron icon           | 1128, 862, 29, 45 (icon), value text to its left       | icon 10 x 15        | right, 22 inside the card | #3868b9                                | none        | OBSERVED                                                    |
| Code appearance card (2 toggle rows)                 | 60, 1315, 1164, 281                                    | 388 x 94            | 16 below the heading      | #ffffff                                | 26          | OBSERVED                                                    |
| Toggles (off)                                        | 981, y, 189, 84                                        | 63 x 28             | R 18 inside the card      | #c5c5c7                                | full        | OBSERVED                                                    |
| Cloud environments card (one link row)               | 60, 1807, 1164, 119 (read at x 1200, corner corrected) | 388 x 54            | L 20, R 20                | #ffffff                                | 26          | OBSERVED                                                    |

#### Text

| Text                                                                       | Height px  | Est. size pt | Weight   | Colour  | Align                               | Status    |
| -------------------------------------------------------------------------- | ---------- | ------------ | -------- | ------- | ----------------------------------- | --------- |
| "Claude Code" title                                                        | 41         | 19.5         | semibold | #000000 | centred                             | ESTIMATED |
| "Appearance", "Code appearance", "Cloud environments" headings             | 35 (cap A) | 16.5         | regular  | #7a7974 | left                                | ESTIMATED |
| "Transcript text size"                                                     | 41 (cap T) | 19.5         | regular  | #0b0b0b | left                                | ESTIMATED |
| "Transcript font", "Code font" labels                                      | 41         | 19.5         | regular  | #131313 | left                                | ESTIMATED |
| Select values (the font names)                                             | 43         | 20           | regular  | #3868b9 | right                               | ESTIMATED |
| "Wrap long lines", "Show + and - signs in the Diff", "Manage environments" | 43         | 20           | regular  | #131313 | left, x 29 pt for rows with no icon | ESTIMATED |

#### Spacing and notes

- The slider row is the first row of the Appearance card: label on top, track below (track centre y 714 px), then a separator at y 1031 px of the other rows.
- Values that open a menu are shown as accent-blue text with a two-chevron (up and down) icon, not as a grey value with a right chevron.
- This page has no icon column: all rows start text at x 87 display px (about 121 px, 40 pt).

### 13. Settings: Cloud environments list and new environment form (IMG_1294, IMG_1295, IMG_1296)

IMG_1294 is the list (one entry and a floating Create environment button). IMG_1295 and IMG_1296 are the New cloud environment form, top and scrolled to the end (scrolled by 469 px = 156 pt).

#### Layout, top to bottom (IMG_1294)

| Element                             | Box px (x, y, w, h) | Size pt (w x h) | Anchor          | Fill or colour                          | Radius pt   | Status   |
| ----------------------------------- | ------------------- | --------------- | --------------- | --------------------------------------- | ----------- | -------- |
| Back button                         | 60, 201, 132, 132   | 44 x 44         | L 20, top 67    | #ffffff, hairline border                | full circle | OBSERVED |
| Help button (circled question mark) | 1092, 201, 132, 132 | 44 x 44         | R 20            | #ffffff, hairline border                | full circle | OBSERVED |
| Default card (cloud icon, chevron)  | 60, 411, 1164, 162  | 388 x 54        | L 20, R 20      | #ffffff                                 | 26          | OBSERVED |
| Create environment button           | 590, 2549, 624, 128 | 208 x 42.7      | R 23, bottom 34 | #fefefd with hairline border and shadow | full pill   | OBSERVED |

#### Layout, top to bottom (IMG_1295, IMG_1296)

| Element                                    | Box px (x, y, w, h)            | Size pt (w x h) | Anchor                | Fill or colour                                      | Radius pt          | Status                                 |
| ------------------------------------------ | ------------------------------ | --------------- | --------------------- | --------------------------------------------------- | ------------------ | -------------------------------------- |
| Name input                                 | 49, 478, 1187, 142             | 396 x 47        | L 16, R 16            | #ffffff, hairline border                            | pill (fully round) | OBSERVED                               |
| Network access select                      | 49, 754, 1187, 142             | 396 x 47        | L 16, R 16            | #ffffff, hairline border, chevron down at the right | pill               | OBSERVED                               |
| Allowed domains text area                  | 49, 1030, 1187, 430            | 396 x 143       | L 16, R 16            | #ffffff, hairline border                            | about 36           | OBSERVED (radius ESTIMATED)            |
| Allow package managers toggle (on, dark)   | 1005, 1644, 189, 84            | 63 x 28         | right, R 30           | #383835, white knob                                 | full               | OBSERVED                               |
| Choose file pill                           | 854, 1775, 335, 98             | 112 x 33        | R 32                  | transparent, hairline border                        | full pill          | OBSERVED                               |
| Setup script text area                     | 49, 1897, 1187, 437            | 396 x 146       | L 16, R 16            | #ffffff, hairline border                            | about 36           | OBSERVED (radius ESTIMATED)            |
| Environment variables text area (IMG_1296) | 49, 1877 (scrolled), 1187, 310 | 396 x 103       | L 16, R 16            | #ffffff, hairline border                            | about 36           | OBSERVED (top and bottom from display) |
| Bottom bar                                 | 0, 2509, 1284, 269             | 428 x 90        | bottom 0              | #fffefd, 1 px top edge                              | none               | OBSERVED                               |
| Create environment button (disabled)       | 49, 2533, 1187, 143            | 396 x 47.7      | L 16, R 16, bottom 34 | #898989                                             | full pill          | OBSERVED                               |
| Scroll indicator (IMG_1296)                | right edge                     | 3 pt wide       | R 3                   | grey                                                | full               | OBSERVED (presence only)               |

#### Text

| Text                                                                                              | Height px          | Est. size pt | Weight             | Colour                   | Align                          | Status    |
| ------------------------------------------------------------------------------------------------- | ------------------ | ------------ | ------------------ | ------------------------ | ------------------------------ | --------- |
| "Cloud environments", "New cloud environment"                                                     | 41                 | 19.5         | semibold           | #000000                  | centred                        | ESTIMATED |
| "Default" (list row)                                                                              | 43                 | 20           | regular            | #131313                  | left, x 52 pt                  | ESTIMATED |
| "You can edit the Anthropic-hosted environments you created."                                     | 42 (with ascender) | 17           | regular            | #7a7974                  | left                           | ESTIMATED |
| "Create environment" (floating button)                                                            | 44                 | 20           | medium             | #0b0b0b                  | centred with a plus icon       | ESTIMATED |
| Field labels "Name", "Network access", "Allowed domains", "Setup script", "Environment variables" | 34 (cap N)         | 16           | medium             | #7a7974                  | left, x 33 pt                  | ESTIMATED |
| Placeholder "Default"                                                                             | 34 (cap D)         | 16           | regular            | #7a7974                  | left, x 33 pt                  | ESTIMATED |
| Select value "Limited"                                                                            | 35 (cap L)         | 16.5         | regular            | #383835                  | left                           | ESTIMATED |
| `<example domains>` placeholder lines                                                             | 23 (x height e)    | about 16     | regular            | #7a7974                  | left, line pitch 16 pt (48 px) | ESTIMATED |
| Setup script placeholder lines (monospace)                                                        | 34 (cap)           | 16           | regular, monospace | #888781                  | left                           | ESTIMATED |
| `<example variable line>` placeholder                                                             | not isolated       | UNKNOWN      | regular            | #7a7974                  | left                           | UNKNOWN   |
| "Allow package managers"                                                                          | 35 (cap A)         | 16.5         | regular            | #131313                  | left                           | ESTIMATED |
| "Choose file"                                                                                     | 33 (cap C)         | 15.5         | regular            | #131313                  | centred                        | ESTIMATED |
| Helper text under the fields                                                                      | 30 (cap L)         | 14           | regular            | #7a7974, link underlined | left                           | ESTIMATED |
| "Create environment" (bar button label)                                                           | 41 (cap C)         | 19.5         | medium             | #f3f4f2                  | centred                        | ESTIMATED |

#### Spacing and notes

- Form layout: label cap top to input top is 40 px (13 pt); input to next label is 79 px (26 pt) after a 47 pt input; the helper text under a text area sits 8 pt below its bottom edge.
- The form has no sheet card: fields sit directly on #f9f9f7 with 16 pt side margins, unlike the 20 pt of the card pages.
- The bottom bar is fixed; the form scrolls under it, and the bar is opaque.
- The page header here has a faint scroll fade behind the title in IMG_1296 (content shows through the header, as in IMG_1284).
- The disabled primary button keeps full width and the same height as the inputs plus a few points (47.7 pt).

### 14. Settings: Connectors and add menu (IMG_1297, IMG_1298)

IMG_1297 is the page. IMG_1298 is the same page with the plus menu open at the top right (Browse connectors, Add custom connector).

#### Layout, top to bottom

| Element                                           | Box px (x, y, w, h)                                                                              | Size pt (w x h) | Anchor                                     | Fill or colour              | Radius pt                        | Status                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------ | --------------------------- | -------------------------------- | ------------------------------------------------------------ |
| Back button                                       | 60, 201, 132, 132                                                                                | 44 x 44         | L 20, top 67                               | #ffffff, hairline border    | full circle                      | OBSERVED                                                     |
| Plus button                                       | 1092, 201, 132, 132                                                                              | 44 x 44         | R 20                                       | #ffffff, hairline border    | full circle                      | OBSERVED                                                     |
| Discovery card (icon, title, description, toggle) | 60, 411, 1164, about 294                                                                         | 388 x about 98  | L 20, R 20                                 | #ffffff                     | 26                               | OBSERVED (top 411 and bottom from the corner-corrected read) |
| Discovery toggle (off)                            | 981, 456, 189, 84                                                                                | 63 x 28         | R 18 inside the card                       | #c5c5c7                     | full                             | OBSERVED                                                     |
| On this device card (4 rows)                      | 60, 872, 1164, 645                                                                               | 388 x 215       | L 20, R 20                                 | #ffffff                     | 26                               | OBSERVED                                                     |
| Connectors card (list continues below the screen) | 60, 1568, 1164, continues                                                                        | 388 wide        | 17 below the device card                   | #ffffff                     | 26                               | OBSERVED (top)                                               |
| Row app icon                                      | 120, 915, 72, 72                                                                                 | 24 x 24         | inside the card, L 20                      | colour of the app           | about 5                          | OBSERVED                                                     |
| Row separators                                    | 216, 1029 / 1191 / 1353 (device rows) and 1733 / 1903 / 2065 / 2235 / 2405 / 2567 / 2729, 948, 3 | 316 x 1         | start 72 from the screen edge              | #e6e7e6                     | none                             | OBSERVED                                                     |
| Count badge (30, 2, 12, 22)                       | 983, 1614, 97, 77                                                                                | 32 x 26         | right, before the chevron                  | #d1e1f9, number in blue     | full pill                        | OBSERVED                                                     |
| "Connect" value with external-link icon           | text 885 to 1078, icon 1101, 2462, 54, 54                                                        | icon 18 x 18    | right                                      | text and icon #7a7974       | none                             | OBSERVED                                                     |
| Chevron                                           | 1124, 934, 19, 34                                                                                | 6.3 x 11.3      | right                                      | #888781                     | none                             | OBSERVED                                                     |
| Add menu (IMG_1298)                               | 475, 201, 749, 471                                                                               | 250 x 157       | R 19, top 67 (opens under the plus button) | #f5f6f4 translucent, shadow | UNKNOWN (edge blurred by shadow) | OBSERVED, radius UNKNOWN                                     |
| Menu icons                                        | 574, 308, 52, 52 and 574, 513, 52, 52                                                            | 17 x 17         | inside the menu, L 33                      | #383835                     | none                             | OBSERVED                                                     |

#### Text

| Text                                                                               | Height px          | Est. size pt | Weight   | Colour  | Align          | Status    |
| ---------------------------------------------------------------------------------- | ------------------ | ------------ | -------- | ------- | -------------- | --------- |
| "Connectors" title                                                                 | 41                 | 19.5         | semibold | #000000 | centred        | ESTIMATED |
| "Connector discovery"                                                              | 43 (with ascender) | 20           | regular  | #131313 | left, x 72 pt  | ESTIMATED |
| Discovery description                                                              | 42 (with ascender) | 17           | regular  | #7a7974 | left           | ESTIMATED |
| "On this device" heading                                                           | 35                 | 16.5         | regular  | #7a7974 | left           | ESTIMATED |
| Row names (four device connectors, then the account's own `<connector name>` rows) | 44 (with ascender) | 19.5         | regular  | #131313 | left, x 72 pt  | ESTIMATED |
| Value text (Never, Allowed, Read & write)                                          | 41 (cap)           | 19.5         | regular  | #52514e | right          | ESTIMATED |
| Count in the badge                                                                 | about 34           | 16           | regular  | #3868b9 | centred        | ESTIMATED |
| "Connect"                                                                          | 36 (cap C)         | 17           | regular  | #7a7974 | right          | ESTIMATED |
| "Browse connectors", "Add custom connector"                                        | 42 (cap B)         | 20           | regular  | #090909 | left, x 226 pt | ESTIMATED |

#### Spacing and notes

- Row height: 54 pt (162 px pitch) for rows without a badge, 56.7 pt (170 px pitch) for rows with a count badge.
- Row layout: app icon (24 pt) at card L 20, name at x 72 pt (217 px), value or badge right aligned ending 47 pt from the screen edge, then a chevron; rows with the Connect action have an external-link icon in place of the chevron.
- The device card and the connectors card are separate cards 16 pt apart (device card bottom 1517 px, connectors card top 1568 px is 17 pt).
- The menu wraps "Browse connectors" onto two lines with a hyphen break ("connec-" and "tors"); the item pitch is 204 px (68 pt) with two-line labels.
- IMG_1298 does not dim the page; only the menu has a shadow.

### 15. Settings: Voice settings (IMG_1299)

A page with a horizontal voice picker (large cards in a pager), two select rows, a two-option mode list and a navigation row.

#### Layout, top to bottom

| Element                                     | Box px (x, y, w, h)              | Size pt (w x h)    | Anchor                             | Fill or colour                 | Radius pt   | Status                           |
| ------------------------------------------- | -------------------------------- | ------------------ | ---------------------------------- | ------------------------------ | ----------- | -------------------------------- |
| Back button                                 | 60, 201, 132, 132                | 44 x 44            | L 20, top 67                       | #ffffff, hairline border       | full circle | OBSERVED                         |
| Active voice card ("Buttery")               | 389, 434, 506, 506               | 169 x 169          | C                                  | #f0efeb with a faint warm edge | about 39    | OBSERVED, radius ESTIMATED       |
| Next voice card ("Airy", partly off screen) | 994, 496, 290, 377               | 97 (visible) x 126 | right, 33 pt after the active card | #eeeeeb                        | about 39    | OBSERVED, radius ESTIMATED       |
| Pager dots (5)                              | 549, 999, 18, 18 and 42 px pitch | 6 x 6, 14 pt pitch | C                                  | active #383835, others #d8d8d6 | full        | OBSERVED                         |
| Language row card                           | 60, 1113, 1164, 162              | 388 x 54           | L 20, R 20                         | #ffffff                        | 26          | OBSERVED                         |
| Speed row card                              | 60, 1323, 1164, 162              | 388 x 54           | 16 below                           | #ffffff                        | 26          | OBSERVED                         |
| Mode card (2 rows with subtitles)           | 60, 1653, 1164, 443              | 388 x 148          | L 20, R 20                         | #ffffff                        | 26          | OBSERVED                         |
| Separator in the mode card                  | 120, 1872, 1044, 3               | 348 x 1            | inside the card, L 20, R 20        | #e6e7e6                        | none        | OBSERVED                         |
| Privacy settings card                       | 60, 2143, 1164, 163              | 388 x 54           | L 20, R 20                         | #ffffff                        | 26          | OBSERVED                         |
| Select chevron icon (up and down)           | 1125, 1174, 25, 38               | 8 x 13             | R 45                               | #383835                        | none        | OBSERVED                         |
| Selected check mark                         | 1125, 1384, 25, 38               | 8 x 13             | right                              | #3868b9                        | none        | OBSERVED                         |
| Beta badge (Language)                       | about 406, 1160, 125, 69         | 42 x 23            | after the label                    | #f3f3f3                        | full pill   | ESTIMATED from the display scale |

#### Text

| Text                                                            | Height px           | Est. size pt | Weight   | Colour  | Align                              | Status    |
| --------------------------------------------------------------- | ------------------- | ------------ | -------- | ------- | ---------------------------------- | --------- |
| "Voice settings" title                                          | 41                  | 19.5         | semibold | #000000 | centred                            | ESTIMATED |
| "Buttery"                                                       | 41 (cap B)          | 19.5         | regular  | #131313 | centred in the card                | ESTIMATED |
| "Airy"                                                          | 31 (cap A)          | 14.5         | regular  | #333333 | centred in the card                | ESTIMATED |
| "Language", "Speed"                                             | 41 (cap L)          | 19.5         | regular  | #131313 | left, x 41 pt                      | ESTIMATED |
| "English", "Normal"                                             | 41                  | 19.5         | regular  | #383835 | right, before the up and down icon | ESTIMATED |
| "Mode" heading                                                  | 35                  | 16.5         | regular  | #7a7974 | left                               | ESTIMATED |
| "Hands free", "Push to talk"                                    | 43                  | 20           | regular  | #131313 | left                               | ESTIMATED |
| "Best for quiet environments", "Hold to speak, release to send" | 37 (ascender)       | 17           | regular  | #7a7974 | left                               | ESTIMATED |
| "Privacy settings"                                              | 55 (with descender) | 19.5         | regular  | #131313 | left, x 84 pt                      | ESTIMATED |

#### Spacing and notes

- The active card is centred on the screen and larger than its neighbour; the neighbour is smaller (126 pt tall against 169 pt) and is vertically centred on the active card, so the pager reads as a carousel with the centre card in focus.
- Corner radius of the voice cards: at 6 px below the top edge the edge is 81 px in from the left; a fit gives a radius of about 118 px (39 pt).
- The Language and Speed rows are two separate single-row cards 16 pt apart.

### 16. Settings: lower part with Appearance picker, in-app browser menu and Log out (IMG_1300)

The Settings home scrolled to its lower part. A small menu is open over the Voice and Browser rows: Default browser, In-app browser (checked). Light theme.

#### Layout, top to bottom

| Element                                                                               | Box px (x, y, w, h)                                                                 | Size pt (w x h)        | Anchor                         | Fill or colour                                          | Radius pt            | Status                                                     |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------- | ------------------------------ | ------------------------------------------------------- | -------------------- | ---------------------------------------------------------- |
| Header (translucent bar, close and info buttons)                                      | 0, 141, 1284, 221                                                                   | 428 x 74               | top 47                         | #fffffe over the scrolled content, bottom edge at y 362 | top corners about 38 | OBSERVED                                                   |
| App card (Capabilities, Claude Code, Connectors, Voice, browser row, Haptic feedback) | 60, 693 to 1833 area                                                                | 388 wide               | L 20, R 20                     | #ffffff                                                 | 26                   | OBSERVED                                                   |
| Haptic feedback toggle (on)                                                           | 981, 1726, 189, 84                                                                  | 63 x 28                | R 18 inside the card           | #3868b9                                                 | full                 | OBSERVED                                                   |
| Haptic row icon                                                                       | 130, 1738, 60, 60                                                                   | 20 x 20                | inside the card                | #52514e                                                 | none                 | OBSERVED                                                   |
| Browser menu                                                                          | 267, 1295, 750, 349                                                                 | 250 x 116              | L 89                           | #fdfcfc translucent with shadow                         | about 36             | OBSERVED, radius ESTIMATED from the visible curve          |
| Menu check mark                                                                       | 336, 1526, 36, 35                                                                   | 12 x 12                | inside the menu, L 23          | #0a0a0a                                                 | none                 | OBSERVED                                                   |
| Menu items                                                                            | text left x 406 px; "Default browser" top y 1381 px, "In-app browser" top y 1520 px | pitch 46 pt (139 px)   | inside the menu, text at 46 pt | text #0a0a0a                                            | none                 | OBSERVED                                                   |
| Appearance card                                                                       | 60, 2018, 1164, 387                                                                 | 388 x 129              | L 20, R 20                     | #ffffff                                                 | 26                   | OBSERVED (edges from the read at x 1200, corner corrected) |
| Appearance tile Light                                                                 | 120, 2062, 332, 222                                                                 | 110.7 x 74             | inside the card, L 20          | #f5f5f4 with a pale inner card                          | about 16             | OBSERVED, radius ESTIMATED from the display                |
| Appearance tile Dark                                                                  | 476, 2062, 332, 222                                                                 | 110.7 x 74             | 8 pt after the first tile      | #20201f                                                 | about 16             | OBSERVED                                                   |
| Appearance tile System                                                                | 832, 2062, 332, 222                                                                 | 110.7 x 74             | 8 pt after the second tile     | split diagonally light and #20201f                      | about 16             | OBSERVED                                                   |
| Selected tile ring                                                                    | 6 px (2 pt) ring #3868b9 with a 6 px white gap around the Light tile                | outer about 114.7 x 78 | around the Light tile          | #3868b9                                                 | follows the tile     | OBSERVED                                                   |
| Tile accent dot                                                                       | inside each tile, lower right                                                       | about 8 pt             | tile bottom right              | terracotta #c4694f (approximate)                        | full                 | ESTIMATED                                                  |
| Log out card                                                                          | 60, 2455, 1164, 162                                                                 | 388 x 54               | L 20, R 20                     | #ffffff                                                 | 26                   | OBSERVED                                                   |
| Log out icon                                                                          | 132, 2508, 54, 54                                                                   | 18 x 18                | inside the card                | #832e2a                                                 | none                 | OBSERVED                                                   |

#### Text

| Text                                                           | Height px           | Est. size pt | Weight   | Colour                           | Align                  | Status    |
| -------------------------------------------------------------- | ------------------- | ------------ | -------- | -------------------------------- | ---------------------- | --------- |
| "Settings" title                                               | 43                  | 20           | semibold | #000000                          | centred                | ESTIMATED |
| "Capabilities", "Claude Code", "Connectors", "Haptic feedback" | 41 to 57            | 19.5         | regular  | #131313                          | left, x 84 pt          | ESTIMATED |
| "Default browser", "In-app browser"                            | 43 (cap D, I)       | 20           | regular  | #0a0a0a                          | left                   | ESTIMATED |
| "Appearance" heading                                           | 35                  | 16.5         | regular  | #7a7974                          | left                   | ESTIMATED |
| "Light", "Dark", "System" tile labels                          | 33 (cap D)          | 15.5         | regular  | #3868b9 selected, #383835 others | centred under the tile | ESTIMATED |
| "Log out"                                                      | 55 (with descender) | 19.5         | regular  | #832e2a                          | left, x 84 pt          | ESTIMATED |

#### Spacing and notes

- The appearance picker is a row of three equal mini screen previews with a label under each; the selected one has a two-point blue ring and a blue label. Tile pitch is 356 px (118.7 pt), gap 8 pt.
- The card padding around the tiles: top 44 px (14.7 pt) above the tile, label top 34 px (11 pt) below the tile bottom, card bottom 44 px below the label.
- Log out sits as its own card about 16 pt below the Appearance card (Appearance card bottom about 2405 px, Log out card top about 2455 px after the corner correction).
- Card and row patterns above the menu are the same as screen 3; the menu is over the rows that start with the voice icon and the browser row, so those rows are partly hidden and their values are not readable.
