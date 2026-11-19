# ChatGPT on iPhone: layout measurements, part 1 (observed 2026-11-12)

Status: Historical snapshot
Owner: Product (founder)
Last updated: 2026-11-12

Screenshots IMG_1133 to IMG_1166 of the founder's reference set, 1284 x 2778 pixels at scale 3 (428 x 926 points). Method, tool and limits are in `docs/research/mobile-layout-2026-11-12/README.md`. Sizes are points unless a column says pixels. OBSERVED means read from pixels by the tool; ESTIMATED means derived (text size from cap height, weight and radius by fit); UNKNOWN means not readable from a screenshot.

All screenshots in this part are the dark theme. Text sizes use cap height / 3 / 0.705 and are plus or minus 1 point. Where a line has descenders, the size was taken from an ascender or capital letter instead, or from ascender-to-descender height / 3 / 0.96. Personal content (chat titles, project names, site names, health values, account initials) is replaced by placeholders.

## Shared components seen in this part

| Component                  | Metric                                 | Value                                                                                                                                                                                     | Screenshot                   | Status               |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------- |
| Screen frame               | Status bar height                      | 47 pt (header buttons start at y = 141 px)                                                                                                                                                | IMG_1133                     | OBSERVED             |
| Screen frame               | Header bar                             | buttons 44 pt tall, y 47 to 91 pt, centre y 69 pt                                                                                                                                         | IMG_1133                     | OBSERVED             |
| Screen frame               | Side margin of main content            | 12 pt (composer card), 16 pt (Plugins, Images, tiles), 19 pt (Health cards, usage card), 20 pt (header buttons), 34 pt (bottom search bar and composer bar)                               | IMG_1133, IMG_1145, IMG_1156 | OBSERVED             |
| Screen frame               | Page background                        | #000000                                                                                                                                                                                   | IMG_1133                     | OBSERVED             |
| Chat header                | Left control                           | 44 x 44 pt circle, x 60 to 192 px (L 20), fill #1f1f1f, icon two horizontal bars 24 x 3 pt and 16 x 3 pt (top bar longer)                                                                 | IMG_1133                     | OBSERVED             |
| Chat header                | Title control                          | segmented pill "Chat" / "Work", 158.7 x 48.3 pt, centred, fill #1f1f1f; selected segment 71 x 39 pt, fill #0a0a0a, 4 pt inset                                                             | IMG_1133, IMG_1139           | OBSERVED             |
| Chat header                | Segment label                          | 16 pt, medium, white                                                                                                                                                                      | IMG_1133                     | ESTIMATED            |
| Chat header                | Right control                          | 44 x 44 pt circle (R 20), fill #212121, icon speech bubble with a pen (new chat)                                                                                                          | IMG_1133                     | OBSERVED             |
| Chat header                | Gap                                    | left control to title pill 71 pt, title pill to right control 71 pt                                                                                                                       | IMG_1133                     | OBSERVED             |
| Composer at rest           | Card inset                             | L 12, R 12 pt                                                                                                                                                                             | IMG_1133                     | OBSERVED             |
| Composer at rest           | Card size                              | 404 x 96 pt (1212 x 288 px), x 36 to 1248, y 1413 to 1701                                                                                                                                 | IMG_1133                     | OBSERVED             |
| Composer at rest           | Card radius                            | about 26 pt                                                                                                                                                                               | IMG_1133                     | ESTIMATED            |
| Composer at rest           | Card fill                              | #1f1f1f (reads #202020 near the corners)                                                                                                                                                  | IMG_1133                     | OBSERVED             |
| Composer at rest           | Placeholder                            | "Ask ChatGPT", 19.5 pt regular, #828282, top of text 20.7 pt below card top, left x 86 px (L 16.7 inside card)                                                                            | IMG_1133                     | OBSERVED / ESTIMATED |
| Composer at rest           | Plus icon                              | 20 x 20 pt at x 81 px (15 pt inside card), centre y 1627 px                                                                                                                               | IMG_1133                     | OBSERVED             |
| Composer at rest           | Magnifier-in-ring icon                 | 26 x 22 pt, x 846 to 924 px                                                                                                                                                               | IMG_1133                     | OBSERVED             |
| Composer at rest           | Microphone icon                        | 19 x 24 pt, x 1000 to 1057 px                                                                                                                                                             | IMG_1133                     | OBSERVED             |
| Composer at rest           | Voice button                           | circle 34.7 pt (104 px), fill #fcfcfc, dark waveform glyph, x 1121 to 1225, y 1574 to 1678 px; 7.7 pt from card right and bottom edges                                                    | IMG_1133                     | OBSERVED             |
| Composer at rest           | Gaps between controls                  | magnifier to microphone 25 pt, microphone to voice button 21 pt                                                                                                                           | IMG_1133                     | OBSERVED             |
| Composer at rest           | Distance to keyboard                   | card bottom 1701 px, keyboard top 1737 px, gap 12 pt                                                                                                                                      | IMG_1133                     | OBSERVED             |
| Composer (bar form)        | Health tab bar and search bars         | 360 x 47 to 49 pt (1080 px wide), L 34, R 34, bottom 34, fill #212121, plus icon 20 pt at x 147 px, microphone 18 x 24 pt, voice circle 34.7 pt fill #48aaff (blue) 6.7 pt from bar right | IMG_1159, IMG_1142           | OBSERVED             |
| Effort or thinking control | Kind                                   | horizontal slider with five stops that replaces the composer while pressed                                                                                                                | IMG_1134 to IMG_1138         | OBSERVED             |
| Effort or thinking control | Size                                   | track 340 x 70 pt, handle 48 pt, dots 12 pt                                                                                                                                               | IMG_1134                     | OBSERVED             |
| Effort or thinking control | Label text                             | level name above the track, 24.5 pt semibold, white                                                                                                                                       | IMG_1134                     | ESTIMATED            |
| Sidebar or drawer          | Width                                  | 330 pt (991 px); main view stays visible as a 98 pt strip with rounded top-left corner                                                                                                    | IMG_1140                     | OBSERVED             |
| Sidebar or drawer          | Row height                             | 52 pt pitch for both icon rows and chat rows                                                                                                                                              | IMG_1140                     | OBSERVED             |
| Sidebar or drawer          | Row icon                               | 22 x 22 pt, centre x 45 pt                                                                                                                                                                | IMG_1140                     | OBSERVED             |
| Sidebar or drawer          | Row label                              | 19.5 pt regular, white, left x 72 pt (icon rows) or 33 pt (chat rows)                                                                                                                     | IMG_1140                     | ESTIMATED            |
| Sidebar or drawer          | Section heading                        | none; one 1 pt separator #323232, x 96 to 894 px (L 32), between icon rows and chat rows                                                                                                  | IMG_1140                     | OBSERVED             |
| Sidebar or drawer          | Footer                                 | "Chat" pill 121 x 52 pt white plus 52 pt avatar ring, both 34 pt from bottom                                                                                                              | IMG_1140                     | OBSERVED             |
| Sidebar or drawer          | Search                                 | 44 pt circle button in the sidebar header, not a field                                                                                                                                    | IMG_1140                     | OBSERVED             |
| Settings list              | Section heading (Plugins)              | 18 pt semibold, #afafaf, with a chevron                                                                                                                                                   | IMG_1145                     | ESTIMATED            |
| Settings list              | Switch (system Health sheet)           | 63 x 28 pt, off fill #656569, on fill #67ce67                                                                                                                                             | IMG_1149, IMG_1153           | OBSERVED             |
| Settings list              | Separator (system Health sheet)        | #404043, inset L 83 pt, R 20 pt inside the card                                                                                                                                           | IMG_1149                     | OBSERVED             |
| Sheets and dialogs         | Sheet top and fill                     | top edge y = 141 px (47 pt) or 171 px (57 pt) for a stacked second sheet, fill #1c1c1d or #1c1c1e                                                                                         | IMG_1143, IMG_1144           | OBSERVED             |
| Sheets and dialogs         | Sheet corner radius                    | about 41 pt                                                                                                                                                                               | IMG_1143                     | ESTIMATED            |
| Sheets and dialogs         | Grabber                                | none visible                                                                                                                                                                              | IMG_1143                     | OBSERVED             |
| Sheets and dialogs         | Title text                             | 19 pt semibold, white, centred                                                                                                                                                            | IMG_1143, IMG_1144           | ESTIMATED            |
| Sheets and dialogs         | Close button                           | 44 pt circle, fill #3a3a3c, X glyph 22 pt, R 20                                                                                                                                           | IMG_1143                     | OBSERVED             |
| Buttons                    | Primary button                         | 388 x 55 pt, full pill radius, label 19.5 pt semibold ("Create project"); disabled fill #8d8d8e with black label                                                                          | IMG_1143                     | OBSERVED / ESTIMATED |
| Buttons                    | Primary button, onboarding             | 380 x 56 pt, white fill, label 20.5 pt semibold ("Continue")                                                                                                                              | IMG_1147                     | OBSERVED / ESTIMATED |
| Buttons                    | Secondary button (system Health sheet) | 345 x 52 pt, fill #3a3a3c, label 19.5 pt semibold white                                                                                                                                   | IMG_1152                     | OBSERVED / ESTIMATED |
| Paywall or upgrade         | Notice card                            | 389 x 189 pt, fill #303030, with a 39 pt pill action "Get Pro"                                                                                                                            | IMG_1139                     | OBSERVED             |

## Screens

### 1. Chat home with composer and keyboard (IMG_1133)

The Chat tab of the home screen, empty chat. Three prompt suggestions sit above the composer, the system keyboard is open and the composer sits directly above it.

#### Layout, top to bottom

| Element                      | Box px (x, y, w, h)                         | Size pt (w x h)               | Anchor                         | Fill or colour                           | Radius pt   | Status                                                  |
| ---------------------------- | ------------------------------------------- | ----------------------------- | ------------------------------ | ---------------------------------------- | ----------- | ------------------------------------------------------- |
| Menu button                  | 60, 141, 132, 132                           | 44 x 44                       | L 20, top 47                   | #1f1f1f                                  | full circle | OBSERVED                                                |
| Chat / Work pill             | 404, 136, 476, 145                          | 158.7 x 48.3                  | C, top 45                      | #1d1d1d                                  | full pill   | OBSERVED                                                |
| Selected segment "Chat"      | 416, 150, 213, 117                          | 71 x 39                       | inside pill, L 4               | #0a0a0a                                  | full pill   | OBSERVED (width read from the Work state, see screen 3) |
| New chat button              | 1092, 141, 132, 132                         | 44 x 44                       | R 20, top 47                   | #212121                                  | full circle | OBSERVED                                                |
| Suggestion icon (three rows) | 79, 982, 60, 60 (rows at y 982, 1127, 1271) | 20 x 20                       | L 26                           | colour glyphs                            | n/a         | OBSERVED                                                |
| Suggestion text (three rows) | 187, 990 to 1334                            | text x 62                     | L 62                           | #cdcdcd, tail truncated with an ellipsis | n/a         | OBSERVED                                                |
| Composer card                | 36, 1413, 1212, 288                         | 404 x 96                      | L 12, R 12, above keyboard 12  | #1f1f1f                                  | about 26    | OBSERVED / ESTIMATED                                    |
| Placeholder                  | 86, 1475, 334, 43                           | 111 x 14                      | inside card, L 17, top 21      | #828282                                  | n/a         | OBSERVED                                                |
| Plus icon                    | 81, 1598, 60, 59                            | 20 x 20                       | inside card, L 15, bottom row  | #ffffff                                  | n/a         | OBSERVED                                                |
| Magnifier-in-ring icon       | 846, 1590, 78, 67                           | 26 x 22                       | inside card, right group       | #ffffff                                  | n/a         | OBSERVED                                                |
| Microphone icon              | 1000, 1591, 57, 72                          | 19 x 24                       | inside card, right group       | #ffffff                                  | n/a         | OBSERVED                                                |
| Voice button                 | 1121, 1574, 104, 104                        | 34.7 x 34.7                   | inside card, R 7.7, bottom 7.7 | #fcfcfc                                  | full circle | OBSERVED                                                |
| Keyboard (system)            | 0, 1737, 1284, 1041                         | 428 x 347                     | bottom 0                       | #1f1f1f, keys #434343                    | key about 6 | OBSERVED / ESTIMATED                                    |
| Prediction row               | y 1790 to 1833                              | 3 words, centred in thirds    | top of keyboard, 18            | text #a2a2a2                             | n/a         | OBSERVED                                                |
| Letter key                   | 20, 1893, 108, 135                          | 36 x 45                       | row pitch 56, key pitch 42     | #434343                                  | about 6     | OBSERVED                                                |
| Emoji and dictation keys     | y 2588 to 2770                              | glyphs on the keyboard footer | bottom 8                       | #ffffff                                  | n/a         | OBSERVED                                                |

#### Text

| Text                | Height px                   | Est. size pt | Weight   | Colour  | Align              | Status    |
| ------------------- | --------------------------- | ------------ | -------- | ------- | ------------------ | --------- |
| "Chat"              | 34 (cap C)                  | 16           | medium   | #fcfcfc | centred in segment | ESTIMATED |
| "Work"              | 33 (cap W)                  | 15.5         | medium   | #ffffff | centred in segment | ESTIMATED |
| `<suggestion text>` | 43 (ascender)               | 19.5         | regular  | #cdcdcd | left               | ESTIMATED |
| "Ask ChatGPT"       | 43 (ascender), cap about 41 | 19.5         | regular  | #828282 | left               | ESTIMATED |
| Status bar time     | 40 (digits)                 | about 19     | semibold | #ffffff | left, x 127 px     | ESTIMATED |

#### Spacing and notes

- Suggestion rows are plain rows with no card: icon 20 pt, 14 pt gap, text. Row pitch 144.5 px (48 pt). The last row ends 25.7 pt above the composer card.
- The composer has two zones: a text line at the top of the card (20.7 pt below the top edge) and a control row at the bottom with the plus on the left and three icons grouped on the right. Card height 96 pt is fixed in this empty state.
- Everything sits on pure black; the card is the only raised surface and has no visible shadow. A 1 pt lighter edge (#3b3b3b at the top edge) is visible on the card outline.
- Keyboard: key 36 x 45 pt, key gap 6 pt horizontally and 11 pt vertically, side margin 6.7 pt, row pitch 56 pt. These are system values.

### 2. Effort slider replacing the composer (IMG_1134, IMG_1135, IMG_1136, IMG_1137, IMG_1138)

Pressing the voice or effort control turns the composer area into a five-stop slider with the level name above it. The home screen behind is blurred. IMG_1134 shows Instant (first stop), IMG_1135 Medium, IMG_1136 High, IMG_1137 Extra High, IMG_1138 Pro (last stop). The keyboard stays open and its upper rows are blurred.

#### Layout, top to bottom

| Element                     | Box px (x, y, w, h)                            | Size pt (w x h)      | Anchor                                   | Fill or colour                                             | Radius pt   | Status   |
| --------------------------- | ---------------------------------------------- | -------------------- | ---------------------------------------- | ---------------------------------------------------------- | ----------- | -------- |
| Level name, Instant         | 534, 1390, 219, 52                             | 73 x 17.3            | C                                        | #ffffff                                                    | n/a         | OBSERVED |
| Level name, Medium          | 515, 1424, 255, 54                             | 85 x 18              | C                                        | #ffffff                                                    | n/a         | OBSERVED |
| Level name, High            | 570, 1424, 145, 66                             | 48 x 22              | C                                        | #ffffff                                                    | n/a         | OBSERVED |
| Level name, Extra High      | 478, 1426 to 1490 (two words, 478 to 806)      | 109 x 21             | C                                        | #ffffff                                                    | n/a         | OBSERVED |
| Level name, Pro             | 592, 1426, 102, 52                             | 34 x 17              | C                                        | #ffffff                                                    | n/a         | OBSERVED |
| Track, Instant state        | 132, 1521, 1020, 212                           | 340 x 70.7           | L 44, R 44                               | #3c3c3c (translucent, blurred backdrop), 1 pt edge #4a4a4a | full pill   | OBSERVED |
| Track, other states         | 132, 1557, 1020, 209                           | 340 x 69.7           | L 44, R 44                               | #3a3a3a to #3d3d3d                                         | full pill   | OBSERVED |
| Handle (knob)               | 168, 1554, 144, 144 at stop 1                  | 48 x 48              | inside track, L 12                       | #fefefe with a light ring #ededed                          | full circle | OBSERVED |
| Filled portion              | from x 168 to handle right edge, height 144 px | grows 67 pt per stop | inside track, L 12                       | #fdfdfd                                                    | full pill   | OBSERVED |
| Dot (unselected stop)       | 423, 1608, 36, 36                              | 12 x 12              | stop centres at x 441, 642, 843, 1044 px | #707070 on dark track                                      | full circle | OBSERVED |
| Dot (inside filled portion) | 222, 1644 (36 x 36)                            | 12 x 12              | stop centre x 240 px                     | #cbcbcb                                                    | full circle | OBSERVED |

#### Text

| Text         | Height px               | Est. size pt | Weight   | Colour  | Align   | Status    |
| ------------ | ----------------------- | ------------ | -------- | ------- | ------- | --------- |
| "Instant"    | 52 (cap I)              | 24.5         | semibold | #ffffff | centred | ESTIMATED |
| "Medium"     | 54 (cap M and ascender) | 24.5         | semibold | #ffffff | centred | ESTIMATED |
| "High"       | 52 (cap H)              | 24.5         | semibold | #ffffff | centred | ESTIMATED |
| "Extra High" | 52 (cap E)              | 24.5         | semibold | #ffffff | centred | ESTIMATED |
| "Pro"        | 52 (cap P)              | 24.5         | semibold | #ffffff | centred | ESTIMATED |

#### Spacing and notes

- The five stops are 201 px (67 pt) apart: centres at 240, 441, 642, 843, 1044 px. The track edge sits 108 px (36 pt) from the first and last stop centre. The handle is 48 pt wide inside a 70 pt track, so the inset is about 11 pt top and bottom and 12 pt at the left.
- Selected state: a white capsule 48 pt tall grows from the left end to the handle, so earlier stops show as grey dots on white; later stops show as grey dots on the dark track. The handle is a white circle with a faint grey ring at the right end of the white capsule.
- Gap from level name bottom to track top is 79 px (26 pt) in every state. In IMG_1134 the whole group sits 36 px (12 pt) higher than in the other four (label top 1390 px against 1424 px, track top 1521 against 1557).
- The track centre line (y 1627 px in IMG_1134) lines up with the composer control row, so the slider takes the place of the composer card while it is open. A bright blurred disc at the right edge (x 1154 px and beyond, about the voice button position) is the faded voice button.
- Behind the slider the page is blurred; the suggestion rows and the keyboard rows above the home row are blurred as well, the lower keyboard rows are sharp.

### 3. Work tab with usage notice (IMG_1139)

The Work tab selected in the header pill. The page is empty. A notice card sits near the bottom with a "Get Pro" action. There is no composer and no right header button in this state.

#### Layout, top to bottom

| Element                 | Box px (x, y, w, h)        | Size pt (w x h)      | Anchor                             | Fill or colour                          | Radius pt   | Status                                                                |
| ----------------------- | -------------------------- | -------------------- | ---------------------------------- | --------------------------------------- | ----------- | --------------------------------------------------------------------- |
| Menu button             | 60, 141, 132, 132          | 44 x 44              | L 20, top 47                       | #1a1a1a                                 | full circle | OBSERVED                                                              |
| Chat / Work pill        | 404, 136, 476, 145         | 158.7 x 48.3         | C                                  | #1f1f1f                                 | full pill   | OBSERVED                                                              |
| Selected segment "Work" | right edge 869, 151 to 266 | about 71 x 39        | inside pill, R 4                   | #0a0a0a                                 | full pill   | OBSERVED (right edge and height), width ESTIMATED from the Chat state |
| Notice card             | 58, 2074, 1168, 568        | 389 x 189            | L 19, R 19, bottom 45              | #303030                                 | about 26    | OBSERVED / ESTIMATED                                                  |
| Card title              | 122, 2147, 772, 48         | 257 x 16             | inside card, L 21, top 24          | #ffffff                                 | n/a         | OBSERVED                                                              |
| Card body (three lines) | 124, 2220 to 2399          | 3 lines, 22 pt pitch | inside card, L 21                  | #cdcdcd                                 | n/a         | OBSERVED                                                              |
| "Get Pro" button        | 120, 2462, 1044, 118       | 348 x 39             | inside card, L 21, R 21, bottom 21 | #454f59 (blue tinted grey, translucent) | full pill   | OBSERVED                                                              |

#### Text

| Text                                                                                       | Height px                         | Est. size pt | Weight  | Colour  | Align   | Status    |
| ------------------------------------------------------------------------------------------ | --------------------------------- | ------------ | ------- | ------- | ------- | --------- |
| "You're out of Work usage for now"                                                         | 37 (cap Y), 39 with ascender      | 17.5         | medium  | #ffffff | left    | ESTIMATED |
| "Upgrade or add credits to keep using Work now, or wait for your usage to reset on Sunday" | 39 (ascender), line pitch 66.5 px | 17.5         | regular | #cdcdcd | left    | ESTIMATED |
| "Get Pro"                                                                                  | 38 (cap G)                        | 17.5         | medium  | #48aaff | centred | ESTIMATED |

#### Spacing and notes

- Card padding: 20.7 pt left and right, 24 pt above the title, 21 pt below the button. Title to body gap about 11 pt; body to button gap 28 pt.
- Body line height 22.2 pt (66.5 px pitch). The card has a faint 1 px lighter edge.
- The unselected "Chat" label stays #fcfcfc; the selected pill moves from Chat to Work, the pill itself does not resize.

### 4. Sidebar (IMG_1140, IMG_1141)

The left drawer, open over the home screen. The home view is pushed 330 pt to the right and dimmed (#151515) with a rounded top-left corner. IMG_1140 is the short list (Your dot, Scheduled, Space, Customize, Codex, Explore) followed by five chat rows and "See all...". IMG_1141 is the longer list (Your dot, Scheduled, Space, Customize, Codex, Sites, Projects, Plugins, Health, Finances, Images) followed by chat rows; the "Chat" pill overlaps chat text directly, with no scrim behind it.

#### Layout, top to bottom

| Element             | Box px (x, y, w, h)                                                     | Size pt (w x h) | Anchor                            | Fill or colour                       | Radius pt   | Status                                                    |
| ------------------- | ----------------------------------------------------------------------- | --------------- | --------------------------------- | ------------------------------------ | ----------- | --------------------------------------------------------- |
| Sidebar panel       | 0, 0, 991, 2778                                                         | 330 x 926       | L 0                               | #000000                              | n/a         | OBSERVED                                                  |
| Pushed main view    | from x 991                                                              | 98 pt visible   | R side                            | #151515 (dimmed), rounded top-left   | about 40    | OBSERVED / ESTIMATED                                      |
| Title "ChatGPT"     | 99, 180, 306, 54                                                        | 102 x 18        | L 33, top 60                      | #ffffff                              | n/a         | OBSERVED                                                  |
| Search button       | 786, 140, 132, 135                                                      | 44 x 44         | R 24 (from panel edge), top 47    | #1f1f1f                              | full circle | OBSERVED                                                  |
| Row icon            | 100 to 171, 66 x 66 (rows at y 336, 494, 647, 809, 958, 1116)           | 22 x 22         | L 33, centre x 45                 | #fefefe line glyphs                  | n/a         | OBSERVED                                                  |
| Row label           | 217, 347, text height 43                                                | 19.5 pt text    | L 72                              | #fefefe                              | n/a         | OBSERVED                                                  |
| Separator           | 96, 1300, 798, 3                                                        | 266 x 1         | L 32, R 32                        | #323232                              | n/a         | OBSERVED (IMG_1140; moves to y about 2080 px in IMG_1141) |
| Chat row text       | 99, 1430, text height 43 (rows at y 1430, 1586, 1742, 1898, 2054, 2210) | 19.5 pt text    | L 33                              | #fefefe, "See all..." #818b8d-grey   | n/a         | OBSERVED                                                  |
| "Chat" pill         | 102, 2519, 364, 157                                                     | 121 x 52        | L 34, bottom 34                   | #f9f9f9                              | full pill   | OBSERVED                                                  |
| Pill icon and label | label x 280 to 399, y 2575 to 2618                                      | label 40 x 14   | inside pill                       | #0d0d0d (compose glyph then "Chat")  | n/a         | OBSERVED                                                  |
| Account avatar ring | 761, 2519, 157, 157                                                     | 52 x 52         | R 24 (from panel edge), bottom 34 | #1f1f1f                              | full circle | OBSERVED                                                  |
| Avatar disc         | 787, 2545, 105, 105                                                     | 35 x 35         | centred in ring                   | #818b8d, white initials `<initials>` | full circle | OBSERVED                                                  |

#### Text

| Text                                                                      | Height px                    | Est. size pt | Weight   | Colour  | Align | Status    |
| ------------------------------------------------------------------------- | ---------------------------- | ------------ | -------- | ------- | ----- | --------- |
| "ChatGPT"                                                                 | 54 (ascender and cap)        | 25           | semibold | #ffffff | left  | ESTIMATED |
| "Your dot", "Scheduled", "Space", "Customize", "Codex", "Explore"         | 41 (cap Y), 43 with ascender | 19.5         | regular  | #fefefe | left  | ESTIMATED |
| "Sites", "Projects", "Plugins", "Health", "Finances", "Images" (IMG_1141) | same as above                | 19.5         | regular  | #fefefe | left  | ESTIMATED |
| `<chat title>` rows                                                       | 43 (ascender)                | 19.5         | regular  | #fefefe | left  | ESTIMATED |
| "See all..."                                                              | 43                           | 19.5         | regular  | grey    | left  | ESTIMATED |
| "Chat" in pill                                                            | 43 (ascender)                | 19.5         | semibold | #0d0d0d | left  | ESTIMATED |

#### Spacing and notes

- Icon rows and chat rows share one 52 pt pitch (156 px). The first icon row has its icon top at 112 pt. Icon glyph 22 pt, then a 27 pt gap to the label (label starts 72 pt from the left edge).
- No row backgrounds, no selected-row highlight and no section headings are visible; a single hairline separates the icon rows from the chat rows. The separator is inset 32 pt on both sides.
- Chat rows have no icons. Long titles are not truncated in this width (the longest is 543 px, 181 pt).
- The footer pill and avatar float over the list with no gradient or blur behind them (chat text shows through the gap in IMG_1141).
- The home view slides right as a rounded card; its header menu button is still visible at x 756 to 850 px (display), 252 pt.

### 5. Projects list (IMG_1142)

The Projects page opened from the sidebar. Header with a "+" button, a horizontal filter row, a list of project rows and a floating search bar at the bottom.

#### Layout, top to bottom

| Element                                           | Box px (x, y, w, h)                                                      | Size pt (w x h)   | Anchor                | Fill or colour                           | Radius pt   | Status                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------ | ----------------- | --------------------- | ---------------------------------------- | ----------- | ------------------------------------------- |
| Menu button                                       | 60, 141, 132, 132                                                        | 44 x 44           | L 20, top 47          | #1f1f1f                                  | full circle | OBSERVED                                    |
| Title "Projects"                                  | 537, 187, 213, 55                                                        | 71 x 18           | C                     | #ffffff                                  | n/a         | OBSERVED                                    |
| Plus button                                       | 1092, 141, 132, 132 (glyph 1125, 174, 65, 65)                            | 44 x 44, glyph 22 | R 20, top 47          | #1f1f1f, glyph #ffffff                   | full circle | OBSERVED                                    |
| Filter pill "All" (selected)                      | 48, 351, 162, 132                                                        | 54 x 44           | L 16, top 117         | #414141                                  | full pill   | OBSERVED                                    |
| Filter labels "Created by you", "Shared with you" | 285, 395 and 799, 394 (heights 43)                                       | text only         | gap 8 between tabs    | #afafaf                                  | n/a         | OBSERVED                                    |
| Project tile                                      | 48, 561 (fill region 132 x 156; icon centre implies about 156 px square) | about 52 x 52     | L 16                  | #212121                                  | about 16    | OBSERVED (fill), ESTIMATED (square, radius) |
| Folder icon                                       | 98, 613, 57, 53                                                          | 19 x 18           | centred in tile       | #ffffff                                  | n/a         | OBSERVED                                    |
| Row text block                                    | 243, 587                                                                 | title and caption | L 81                  | see Text                                 | n/a         | OBSERVED                                    |
| Floating search bar                               | 102, 2535, 1080, 141                                                     | 360 x 47          | L 34, R 34, bottom 34 | #2a2a2a (translucent, blur strip behind) | full pill   | OBSERVED                                    |
| Search icon                                       | 105 to 190, about 44 px glyph                                            | 15 pt             | inside bar, L 12      | #afafaf                                  | n/a         | OBSERVED                                    |
| Search placeholder                                | 239, 2583, 390, 42                                                       | text 130 pt wide  | inside bar, L 46      | #afafaf                                  | n/a         | OBSERVED                                    |

#### Text

| Text                                | Height px           | Est. size pt | Weight   | Colour  | Align           | Status    |
| ----------------------------------- | ------------------- | ------------ | -------- | ------- | --------------- | --------- |
| "Projects"                          | 40 (cap P)          | 19           | semibold | #ffffff | centred         | ESTIMATED |
| "All"                               | 42                  | 19.5         | medium   | #ffffff | centred in pill | ESTIMATED |
| "Created by you", "Shared with you" | 43 (ascender)       | 19.5         | regular  | #afafaf | left            | ESTIMATED |
| `<project name>`                    | 43 (ascender)       | 19.5         | regular  | #ffffff | left            | ESTIMATED |
| `<age>` ("3 months ago")            | 41 (with descender) | 14.5         | regular  | #afafaf | left            | ESTIMATED |
| "Search projects"                   | 42 (ascender)       | 19.5         | regular  | #afafaf | left            | ESTIMATED |

#### Spacing and notes

- Filter pill padding: 16.7 pt on each side of the label; gap between filters 8 pt. The row of filters continues past the right edge (no clipping fade seen).
- List rows: tile pitch 204 px (68 pt) for a two-line row (title and age); a row with a two-line title is taller (the tile top moved from 969 to 1196 px between rows). Title top to age top 73 px (24 pt). Text left edge 81 pt, tile left 16 pt.
- No separators and no chevrons. The last visible row is cut by the search bar.
- The search bar floats with a dark blur strip behind it, which reaches the screen bottom (y 2500 px, 1 px border at 2535 px).

### 6. New project sheet (IMG_1143)

Full-height sheet over the Projects page with the keyboard open. Header with "Settings" and close, helper text, name field, suggestion chips, and a large create button above the keyboard.

#### Layout, top to bottom

| Element                      | Box px (x, y, w, h)                            | Size pt (w x h)                                         | Anchor                        | Fill or colour                                                             | Radius pt   | Status                                                                     |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| Sheet                        | 0, 141, 1284, to keyboard                      | 428 wide                                                | top 47                        | #1c1c1d                                                                    | about 41    | OBSERVED / ESTIMATED                                                       |
| "Settings" button            | 60, 201, about 306, 132                        | about 102 x 44                                          | L 20, 20 below sheet top      | #39393b                                                                    | full pill   | OBSERVED (left edge, height), width ESTIMATED from text plus 17 pt padding |
| Title "New project"          | 487, 243 to 298                                | 113 pt wide text                                        | C                             | #ffffff                                                                    | n/a         | OBSERVED                                                                   |
| Close button                 | 1092, 201, 132, 132 (X glyph 1100, 201 to 333) | 44 x 44                                                 | R 20                          | #3a3a3c                                                                    | full circle | OBSERVED                                                                   |
| Helper text (2 lines)        | 182, 373, 922, 101                             | 307 x 34                                                | C                             | #afafaf                                                                    | n/a         | OBSERVED                                                                   |
| Name field                   | 60, 561, 1164, 146                             | 388 x 48.7                                              | L 20, R 20                    | #39393d                                                                    | about 16    | OBSERVED / ESTIMATED                                                       |
| Field icon (emoji with plus) | around x 110 to 160                            | 18 pt                                                   | inside field, L 17            | #afafaf                                                                    | n/a         | OBSERVED                                                                   |
| Chips                        | 58, 767, e.g. "Homework" 429 wide, 128 tall    | 143 x 43 each (first chip), row scrolls past right edge | L 19, chip gap 12             | transparent with 1 pt border #3a3a3c                                       | full pill   | OBSERVED                                                                   |
| Chip icon                    | 56 px (92, 804, 69, 55 for the first)          | 19 pt                                                   | inside chip, L 11             | coloured glyph (blue #3983f7, violet #a67df2, red #e75247, orange #ee7c36) | n/a         | OBSERVED                                                                   |
| Create button                | 60, 1524, 1164, 165                            | 388 x 55                                                | L 20, R 20, above keyboard 16 | #8d8d8e (disabled)                                                         | full pill   | OBSERVED                                                                   |
| Keyboard                     | from y 1737                                    | 347 pt                                                  | bottom 0                      | system                                                                     | n/a         | OBSERVED                                                                   |

#### Text

| Text                                                                             | Height px                                    | Est. size pt | Weight   | Colour  | Align                   | Status    |
| -------------------------------------------------------------------------------- | -------------------------------------------- | ------------ | -------- | ------- | ----------------------- | --------- |
| "Settings"                                                                       | 43 (cap S, ascender)                         | 19.5         | regular  | #ffffff | centred in pill         | ESTIMATED |
| "New project"                                                                    | 41 (cap N)                                   | 19.5         | semibold | #ffffff | centred                 | ESTIMATED |
| "Projects give ChatGPT shared context across chats and files, all in one place." | 41 (ascender to descender), line pitch 60 px | 14.5         | regular  | #afafaf | centred                 | ESTIMATED |
| "Project Name" (placeholder)                                                     | 52 (with descender)                          | 19.5         | regular  | #afafaf | left, caret in blue     | ESTIMATED |
| "Homework", "Writing", "Health"                                                  | 43 (ascender)                                | 19.5         | regular  | #ffffff | left of chip after icon | ESTIMATED |
| "Create project"                                                                 | 42 (cap C)                                   | 19.5         | semibold | #000000 | centred                 | ESTIMATED |

#### Spacing and notes

- Sheet header: buttons 20 pt below the sheet top; title baseline on the same row. Helper text starts 17 pt below the buttons (button bottom 333 px, text top 373 px = 13 pt).
- Gap helper text to field 29 pt (474 to 561 px); field to chips 20 pt (707 to 767 px); chips to create button 208 pt (large free area; the button is pinned above the keyboard).
- The field shows a blue text caret at the left of the placeholder. The create button is disabled while the name is empty (grey fill, black label).
- The Projects page behind the sheet is visible only as a 2 pt rim at the top.

### 7. Project settings sheet (IMG_1144)

A second sheet stacked on the New project sheet. It has Cancel and Done pills and a Memory choice with two option cards. The first card is selected (blue border).

#### Layout, top to bottom

| Element                             | Box px (x, y, w, h)                  | Size pt (w x h)  | Anchor                   | Fill or colour                 | Radius pt | Status                                                            |
| ----------------------------------- | ------------------------------------ | ---------------- | ------------------------ | ------------------------------ | --------- | ----------------------------------------------------------------- |
| Stacked sheet edge (previous sheet) | 0, 141, 1284, 30                     | 428 x 10         | top 47                   | #141415                        | n/a       | OBSERVED                                                          |
| Sheet                               | 0, 171, 1284, to bottom              | 428 wide         | top 57                   | #1c1c1e                        | about 41  | OBSERVED / ESTIMATED                                              |
| "Cancel" pill                       | 60, about 235, about 271, 132        | about 90 x 44    | L 20, 21 below sheet top | #333335                        | full pill | OBSERVED (left edge), width ESTIMATED (text plus 17 pt each side) |
| Title "Project settings"            | 438, 274, 410, 54                    | 137 pt wide text | C                        | #ffffff                        | n/a       | OBSERVED                                                          |
| "Done" pill                         | about 995, about 235, about 230, 132 | about 77 x 44    | R 20                     | #333335                        | full pill | OBSERVED (right edge), width ESTIMATED                            |
| Section label "Memory"              | 65, 442, 187, 45                     | 62 x 15          | L 22                     | #cdcdcd                        | n/a       | OBSERVED                                                          |
| Card, selected                      | 46, 512, 1192, 285                   | 397 x 95         | L 15, R 15               | #212121, 1.3 pt border #0091ff | about 20  | OBSERVED / ESTIMATED                                              |
| Card, unselected                    | 46, 825, 1192, 281                   | 397 x 94         | L 15, R 15               | #212121, 1 pt border grey      | about 20  | OBSERVED / ESTIMATED                                              |

#### Text

| Text                                                                                    | Height px                    | Est. size pt | Weight   | Colour  | Align   | Status    |
| --------------------------------------------------------------------------------------- | ---------------------------- | ------------ | -------- | ------- | ------- | --------- |
| "Cancel", "Done"                                                                        | 43                           | 19.5         | regular  | #ffffff | centred | ESTIMATED |
| "Project settings"                                                                      | 54 (with descender)          | 19           | semibold | #ffffff | centred | ESTIMATED |
| "Memory"                                                                                | 45 (with descender)          | 16           | regular  | #cdcdcd | left    | ESTIMATED |
| "Default memory", "Project-only memory"                                                 | 40 (cap D)                   | 19           | regular  | #ffffff | left    | ESTIMATED |
| "This project can access memory from outside chats, and vice versa."                    | 36 (cap T), line pitch 66 px | 17           | regular  | #cdcdcd | left    | ESTIMATED |
| "This project can only access its own memory. Its memory is hidden from outside chats." | same                         | 17           | regular  | #cdcdcd | left    | ESTIMATED |

#### Spacing and notes

- Card padding: 18 pt left (text at x 101 px, card at 46 px), 17 pt above the title. Card gap 9 pt (797 to 825 px). Title to body gap about 10 pt; body line height 22 pt.
- Section label to first card 8 pt. Both cards are full width and the rest of the sheet is empty.
- Selection is shown only by the blue border; no radio, no check mark.

### 8. Plugins (IMG_1145, IMG_1146)

A catalogue page opened from the sidebar. IMG_1145 is the top: Installed row of tiles, Popular, then New & Noteworthy with action controls. IMG_1146 is scrolled: the header has a translucent blur band, more rows under New & Noteworthy and a Small Business section; the floating search bar stays at the bottom.

#### Layout, top to bottom

| Element                       | Box px (x, y, w, h)                             | Size pt (w x h)             | Anchor                      | Fill or colour                                 | Radius pt   | Status               |
| ----------------------------- | ----------------------------------------------- | --------------------------- | --------------------------- | ---------------------------------------------- | ----------- | -------------------- |
| Menu button                   | 60, 141, 132, 132                               | 44 x 44                     | L 20, top 47                | #1f1f1f                                        | full circle | OBSERVED             |
| Title "Plugins" with chevron  | 554, 183, 238, 55                               | 79 x 18                     | C (text and a down chevron) | #ffffff                                        | n/a         | OBSERVED             |
| Section heading "Installed >" | 53, 387, 269, 41                                | 90 x 14                     | L 17                        | #afafaf                                        | n/a         | OBSERVED             |
| Installed tile row            | 48, 520, 144 x 144 each, pitch 180              | 48 x 48 each, gap 12        | L 16                        | per app, last tile "+23" #303030               | about 12    | OBSERVED / ESTIMATED |
| Section heading "Popular >"   | 53, 778, 247, 51                                | 82 x 17                     | L 17                        | #afafaf                                        | n/a         | OBSERVED             |
| List row icon                 | 48, 911, 144 x 144                              | 48 x 48                     | L 16                        | app icon on #212121                            | about 12    | OBSERVED / ESTIMATED |
| Row title                     | 243, 931, text height 43                        | 19.5 pt text                | L 81                        | #ffffff                                        | n/a         | OBSERVED             |
| Row description               | 244, 1005, text height 40                       | 14 pt text                  | L 81                        | #afafaf                                        | n/a         | OBSERVED             |
| Row action (more)             | dots 1147 to 1204, 13 px each                   | three 4 pt dots, 19 pt wide | R 27                        | #afafaf                                        | n/a         | OBSERVED             |
| Row action (add)              | 1152, 2118, 49, 49                              | 16 x 16 plus                | R 27                        | #afafaf                                        | n/a         | OBSERVED             |
| Search bar                    | same as screen 5 (placeholder "Search plugins") | 360 x 47                    | L 34, R 34, bottom 34       | #272727 to #2a2a2a                             | full pill   | OBSERVED             |
| Header blur band (IMG_1146)   | 0, 0, 1284, 302                                 | 428 x 100                   | top 0                       | #0e0e0e translucent, hairline #202020 at y 302 | n/a         | OBSERVED             |

#### Text

| Text                                                                                                                                                              | Height px             | Est. size pt | Weight   | Colour  | Align   | Status                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------ | -------- | ------- | ------- | --------------------------- |
| "Plugins"                                                                                                                                                         | about 40 (cap P)      | 19           | semibold | #ffffff | centred | ESTIMATED                   |
| "Installed", "Popular", "New & Noteworthy", "Small Business"                                                                                                      | 41 to 51              | 18           | semibold | #afafaf | left    | ESTIMATED                   |
| "Gmail", "Google Drive", "Google Calendar", "GitHub", "Lyft", "iCloud Mail", "iCloud Calendar", "ElevenLabs", "Dropbox", "Intuit QuickBooks", "HubSpot", "Stripe" | 43 (cap and ascender) | 19.5         | regular  | #ffffff | left    | ESTIMATED                   |
| "Read and manage Gmail" and other one-line descriptions                                                                                                           | 40 (with descender)   | 14           | regular  | #afafaf | left    | ESTIMATED                   |
| "+23"                                                                                                                                                             | not measured          | UNKNOWN      | semibold | #afafaf | centred | UNKNOWN (text not isolated) |

#### Spacing and notes

- Row pitch 240 px (80 pt) for two-line rows; the icon is 48 pt, title top 20 px below the icon top, description line 74 px below the title top. Icon right to text left 17 pt.
- Section heading to first row: "Popular" bottom 829 px to icon top 911 px, 27 pt. Section to section gap about 55 pt (last row bottom to next heading).
- Installed tiles: 12 pt gap, the sixth tile shows a count in place of an icon.
- New & Noteworthy rows use a plus control; Popular rows use a three-dot control.
- In IMG_1146 a 4 pt wide scroll indicator sits at x 1270 px (R 5 pt). The status bar region has no solid fill; content scrolls under the blur band.

### 9. Reconnect Apple Health prompt (IMG_1147)

A full-screen onboarding prompt shown before the system Health sheet. Black background, no header.

#### Layout, top to bottom

| Element                           | Box px (x, y, w, h)        | Size pt (w x h) | Anchor                          | Fill or colour                  | Radius pt            | Status               |
| --------------------------------- | -------------------------- | --------------- | ------------------------------- | ------------------------------- | -------------------- | -------------------- |
| Health icon                       | 582, 335, 120, 120         | 40 x 40         | C, top 112                      | #ffffff tile with pink heart    | about 9              | OBSERVED / ESTIMATED |
| Title "Reconnect Apple Health"    | 153, 537, 977, 79          | 326 x 26        | C                               | #ffffff                         | n/a                  | OBSERVED             |
| Subtitle (2 lines)                | 201 to 1083, y 658 to 777  | 294 x 40        | C                               | #cdcdcd                         | n/a                  | OBSERVED             |
| Illustrated permission sheet      | 236, 1034, 813, 1236       | 271 x 412       | C, fades to black at the bottom | #232323 (gradient to #000000)   | about 41 top corners | OBSERVED / ESTIMATED |
| Illustration title "ChatGPT"      | 563 to 722, y 1131 to 1160 | 53 pt wide text | C                               | #f2f2f2                         | n/a                  | OBSERVED             |
| "Turn On All" pill (illustration) | 284, 1232, 717, 115        | 239 x 38        | inside illustration             | #363634                         | full pill            | OBSERVED             |
| Illustration rows                 | pitch about 123 px         | 41 pt           | inside illustration             | #292929 with toggles 36 x 16 pt | n/a                  | OBSERVED / ESTIMATED |
| Continue button                   | 72, 2508, 1140, 168        | 380 x 56        | L 24, R 24, bottom 34           | #ffffff                         | full pill            | OBSERVED             |

#### Text

| Text                                                                              | Height px                             | Est. size pt | Weight   | Colour  | Align   | Status    |
| --------------------------------------------------------------------------------- | ------------------------------------- | ------------ | -------- | ------- | ------- | --------- |
| "Reconnect Apple Health"                                                          | 64 (cap R)                            | 30           | bold     | #ffffff | centred | ESTIMATED |
| "Apple Health permissions need to be enabled on this device to continue syncing." | 49 (with descender), line pitch 69 px | 17           | regular  | #cdcdcd | centred | ESTIMATED |
| "ChatGPT" (illustration)                                                          | 29                                    | 13           | regular  | #f2f2f2 | centred | ESTIMATED |
| "Turn On All" (illustration)                                                      | 28 (cap T)                            | 13           | regular  | #5f89c4 | left    | ESTIMATED |
| "Continue"                                                                        | 45                                    | 20.5         | semibold | #000000 | centred | ESTIMATED |

#### Spacing and notes

- Icon to title gap 27 pt; title to subtitle 14 pt; subtitle line height 23 pt.
- The illustration is a decorative picture of the system permission list (placeholder dots and bars instead of names), clipped by a gradient that fades it into the page background near y 1700 px.
- The Continue button is pinned above the home indicator area (34 pt from the bottom).

### 10. Health Access system sheet (IMG_1148, IMG_1149, IMG_1150, IMG_1151, IMG_1152, IMG_1153, IMG_1154)

The iOS system HealthKit permission sheet, drawn over the app. IMG_1148 is the top of the sheet. IMG_1149, IMG_1150 and IMG_1151 scroll through the Nutrition list; IMG_1152 is the bottom with Allow (greyed) and Don't Allow; IMG_1153 shows all toggles on and Continue in blue; IMG_1154 is the next step, how much data to share. The layout is system-drawn; the nutrient names are product text from the system.

#### Layout, top to bottom (IMG_1148)

| Element                               | Box px (x, y, w, h)                              | Size pt (w x h)      | Anchor                | Fill or colour            | Radius pt             | Status               |
| ------------------------------------- | ------------------------------------------------ | -------------------- | --------------------- | ------------------------- | --------------------- | -------------------- |
| Sheet                                 | 0, 171, 1284, to bottom                          | 428 wide             | top 57                | #1c1c1d                   | about 41              | OBSERVED / ESTIMATED |
| Title "Health Access"                 | 457, 275, 371, 43                                | 124 pt wide text     | C, 35 below sheet top | #ffffff                   | n/a                   | OBSERVED             |
| Health app icon                       | 309, 469, 240, 240                               | 80 x 80              | centre x 149          | #ffffff tile with heart   | about 18              | OBSERVED / ESTIMATED |
| Arrow                                 | 606, 561, 72, 58                                 | 24 x 19              | C                     | #ffffff                   | n/a                   | OBSERVED             |
| ChatGPT icon                          | 735, 469, 240, 240                               | 80 x 80              | centre x 285          | #fcfcfc tile              | about 18              | OBSERVED / ESTIMATED |
| Heading (bold) and subtext (grey)     | 111 to 1100, y 849 to 1183, pitch 90 px          | 4 lines, 30 pt pitch | L 28                  | white and #8e8e93-grey    | n/a                   | OBSERVED             |
| "Select All 40 Topics" row            | 66, 1245, 1152, 162                              | 384 x 54             | L 22, R 22            | #2c2c2d                   | full pill             | OBSERVED             |
| Section "Read Access" and explanation | heading 131, 1461; explanation lines pitch 72 px | 4 lines              | L 43                  | white, grey               | n/a                   | OBSERVED             |
| Group heading "Heart"                 | 131, 2014, 161, 48                               | 54 x 16              | L 43                  | #ffffff                   | n/a                   | OBSERVED             |
| Group card, one row                   | 66, 2107, 1152, 162                              | 384 x 54             | L 22, R 22            | #2c2c2d                   | about 27 (single row) | OBSERVED / ESTIMATED |
| Row icon (heart)                      | 134, 2160, 62, 58                                | 21 x 19              | inside card, L 23     | #eb4a62                   | n/a                   | OBSERVED             |
| Switch                                | 969, 2146, 189, 84                               | 63 x 28              | inside card, R 20     | off #656569, knob #ffffff | full pill             | OBSERVED             |

#### Layout, rows and bottom (IMG_1149 to IMG_1154)

| Element                            | Box px (x, y, w, h)                                  | Size pt (w x h)          | Anchor                   | Fill or colour                              | Radius pt                       | Status                      |
| ---------------------------------- | ---------------------------------------------------- | ------------------------ | ------------------------ | ------------------------------------------- | ------------------------------- | --------------------------- |
| Nutrition card (rows)              | 66, from y 1755 (IMG_1148), rows pitch 161 to 162 px | 384 wide, row 54         | L 22, R 22               | #2c2c2d                                     | about 41 top and bottom corners | OBSERVED / ESTIMATED        |
| Row icon (apple outline)           | 133, 901, 64, 74                                     | 21 x 25                  | inside card, L 22        | #30d158                                     | n/a                             | OBSERVED                    |
| Row label                          | 255, 930                                             | label left x 85          | inside card, L 63        | #ffffff                                     | n/a                             | OBSERVED                    |
| Row separator                      | 250, 1020, 908, 3                                    | 303 x 1                  | inside card, L 83, R 20  | #404043                                     | n/a                             | OBSERVED                    |
| Switch, on                         | 969, 438, 189, 82                                    | 63 x 27                  | inside card, R 20        | #67ce67                                     | full pill                       | OBSERVED                    |
| Header blur band (scrolled)        | 0, 171, 1284, 221                                    | 428 x 74                 | top 57                   | #222225 translucent                         | n/a                             | OBSERVED                    |
| Footnote (2 paragraphs)            | 125, 1730 to 1987                                    | line pitch 54 px (18 pt) | L 42                     | grey                                        | n/a                             | OBSERVED                    |
| Button pair                        | 124, 2115, 1036, 339 (IMG_1152)                      | 345 x 113                | L 41, R 41               | Allow disabled #505051, Don't Allow #3b3b3d | full pill                       | OBSERVED                    |
| Primary button, enabled (IMG_1153) | 124, 2115 to 2270                                    | 345 x 52                 | L 41, R 41               | #4090f7                                     | full pill                       | OBSERVED (left, right, top) |
| Back button (IMG_1154)             | 58, 231, 136, 89                                     | 45 x 30 visible          | L 19, 20 below sheet top | #3a3a3c                                     | full pill                       | OBSERVED                    |
| Option card, two (IMG_1154)        | 66, 1368, 1152, 327 and 66, 1755, 1152, 327          | 384 x 109 each           | L 22, R 22, gap 20       | #2c2c2d                                     | about 41                        | OBSERVED / ESTIMATED        |
| Button pair (IMG_1154)             | 112, 2322, 1060, 342                                 | 353 x 114                | L 37, R 37, bottom 38    | #3a3a3c                                     | full pill                       | OBSERVED                    |

#### Text

| Text                                                                                                                            | Height px                        | Est. size pt | Weight   | Colour                      | Align   | Status    |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------ | -------- | --------------------------- | ------- | --------- |
| "Health Access"                                                                                                                 | 43 (cap H, ascender)             | 19.5         | semibold | #ffffff                     | centred | ESTIMATED |
| "Allow "ChatGPT" to access your Health data?"                                                                                   | 53 per line, pitch 90 px         | 24           | bold     | #ffffff                     | left    | ESTIMATED |
| "Choose which Health data you'd like to share with this app."                                                                   | same line size                   | 24           | regular  | #8e8e93                     | left    | ESTIMATED |
| "Select All 40 Topics"                                                                                                          | 43 (ascender)                    | 19.5         | regular  | #3f8ff7                     | left    | ESTIMATED |
| "Read Access"                                                                                                                   | 52 (ascender)                    | 23.5         | bold     | #ffffff                     | left    | ESTIMATED |
| "App Explanation: Share your Health data with ChatGPT so it can analyze and answer questions about your activity and wellness." | 52 (with descender), pitch 72 px | 18           | regular  | #8e8e93                     | left    | ESTIMATED |
| "Heart", "Nutrition" (group headings)                                                                                           | 48                               | 22.5         | bold     | #ffffff                     | left    | ESTIMATED |
| Row labels ("Blood Pressure", "Biotin", "Caffeine" and the other nutrient names)                                                | 34 (cap B)                       | 16           | regular  | #ffffff                     | left    | ESTIMATED |
| Footnotes ("Data you allow can be accessed by the app in the background.")                                                      | 41 (with descender), pitch 54 px | 14           | regular  | #8e8e93                     | left    | ESTIMATED |
| "Allow", "Don't Allow", "Continue"                                                                                              | 43                               | 19.5         | semibold | #8a8a8e (disabled), #ffffff | centred | ESTIMATED |
| "How much data would you like to share with "ChatGPT"?" (IMG_1154)                                                              | same as the first heading        | 24           | bold     | #ffffff                     | left    | ESTIMATED |
| "Past 30 Days and Future Data", "All Recorded Data and Future Data"                                                             | 60 (with descender)              | 19.5         | semibold | #ffffff                     | left    | ESTIMATED |
| Option card descriptions                                                                                                        | 43 to 52                         | 17           | regular  | #ffffff                     | left    | ESTIMATED |

#### Spacing and notes

- Row height is 54 pt in every group card, separators start under the label (L 83 pt), not under the icon. The icon column is 21 to 25 pt wide and sits 22 pt from the card edge. The switch is 63 x 28 pt, 20 pt from the card right edge.
- Group heading to card gap 7 pt (2062 to 2107 px, 15 pt in IMG_1148 for the Nutrition heading); card to next heading 14 pt.
- When the list scrolls, a blurred band (#222225) with the title "Health Access" stays at the top; rows slide under it.
- In IMG_1151 the footnote block follows the last row 11 pt below the card. In IMG_1152 the page continues to the button pair; Allow stays grey until at least one topic is on, then becomes the blue "Continue" (IMG_1153, all switches on with colour #67ce67).
- IMG_1154 has a back arrow instead of a title: the title area is empty, the heading starts at the same y as in IMG_1148.

### 11. Health, Home tab (IMG_1155, IMG_1156, IMG_1157, IMG_1158)

The Health page opened from the sidebar. Header with title and a three-dot button, a tab row (Home, Chats, Records, Accounts), a horizontal strip of prompt cards, an optional blue tooltip and grouped metric cards. The composer bar floats at the bottom. IMG_1155 is the top with the tooltip "Introducing custom insights" over the first card; IMG_1156 is the Activity card without the tooltip; IMG_1157 and IMG_1158 are scrolled further (Heart, Blood, Other cards) and the header has a translucent blur band. The metric values are personal and are not recorded here.

#### Layout, top to bottom (IMG_1155 and IMG_1156)

| Element                       | Box px (x, y, w, h)                                   | Size pt (w x h)                         | Anchor                                        | Fill or colour                  | Radius pt   | Status               |
| ----------------------------- | ----------------------------------------------------- | --------------------------------------- | --------------------------------------------- | ------------------------------- | ----------- | -------------------- |
| Menu button                   | 60, 141, 132, 132                                     | 44 x 44                                 | L 20, top 47                                  | #1f1f1f                         | full circle | OBSERVED             |
| Title "Health"                | 558, 185, 167, 43                                     | 56 pt wide text                         | C                                             | #ffffff                         | n/a         | OBSERVED             |
| More button (three dots)      | 1092, 141, 132, 132 (dots 71 x 17)                    | 44 x 44                                 | R 20, top 47                                  | #1f1f1f                         | full circle | OBSERVED             |
| Tab "Home" (selected)         | 36, 375, 252, 132                                     | 84 x 44                                 | L 12, top 125                                 | #414141                         | full pill   | OBSERVED             |
| Tab labels                    | "Chats" x 363, "Records" x 638, "Accounts" x 970      | text only                               | gap 8                                         | #afafaf                         | n/a         | OBSERVED             |
| Prompt card strip             | 48, 567, 888, 282 (second card starts at x 972)       | 296 x 94 each, gap 12, scrolls sideways | L 16, top 189                                 | #212121                         | about 33    | OBSERVED / ESTIMATED |
| Prompt card icon              | 117, 657, 102, 101                                    | 34 x 34                                 | inside card, L 23                             | colour emoji                    | n/a         | OBSERVED             |
| Prompt card title and caption | title 280, 629; caption 278, 694 (two lines)          | title text, caption 2 lines             | inside card, L 61                             | #ffffff, #cdcdcd                | n/a         | OBSERVED             |
| Tooltip (IMG_1155)            | 60, 909, 1100, 301                                    | 367 x 100                               | L 20, top 303, with a tail pointing down-left | #0169cc                         | about 26    | OBSERVED / ESTIMATED |
| Tooltip close                 | 1026, 965, 31, 31                                     | 10 x 10 X glyph                         | inside tooltip, R 34                          | #ffffff                         | n/a         | OBSERVED             |
| Metric card ("Activity")      | 58, 910, 1168, from y 910                             | 389 wide                                | L 19, R 19                                    | #212121                         | about 34    | OBSERVED / ESTIMATED |
| Metric row                    | pitch 285 to 286 px, separator x 122 to 1163          | row 95 pt tall                          | inside card, L 21                             | separator hairline              | n/a         | OBSERVED             |
| Sparkline (right of row)      | x 1089 to 1164 px, bars 15 px wide, up to 105 px tall | 25 pt wide, bars 5 pt                   | inside card, R 21                             | #2395ff to #53acff bars or dots | n/a         | OBSERVED             |
| Composer bar                  | 102, 2529, 1080, 147                                  | 360 x 49                                | L 34, R 34, bottom 34                         | #212121                         | full pill   | OBSERVED             |
| Voice button (blue)           | 1058, 2551, 104, 104                                  | 34.7 x 34.7                             | inside bar, R 6.7                             | #48aaff                         | full circle | OBSERVED             |

#### Text

| Text                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Height px                                      | Est. size pt                                                            | Weight   | Colour           | Align           | Status    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- | -------- | ---------------- | --------------- | --------- |
| "Health"                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 43                                             | 19.5                                                                    | semibold | #ffffff          | centred         | ESTIMATED |
| "Home" (selected)                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 41 (cap H)                                     | 19.5                                                                    | medium   | #ffffff          | centred in pill | ESTIMATED |
| "Chats", "Records", "Accounts"                                                                                                                                                                                                                                                                                                                                                                                                                                           | 43 (ascender)                                  | 19.5                                                                    | regular  | #afafaf          | centred in tab  | ESTIMATED |
| "Health history" (card title)                                                                                                                                                                                                                                                                                                                                                                                                                                            | 49                                             | 19.5                                                                    | medium   | #ffffff          | left            | ESTIMATED |
| "Summarize my health history." (card caption)                                                                                                                                                                                                                                                                                                                                                                                                                            | 34 to 43, pitch 56 px                          | 14.5                                                                    | regular  | #cdcdcd          | left            | ESTIMATED |
| "Introducing custom insights"                                                                                                                                                                                                                                                                                                                                                                                                                                            | 45                                             | 19                                                                      | semibold | #ffffff          | left            | ESTIMATED |
| "Tap into records for a personalized breakdown of your data"                                                                                                                                                                                                                                                                                                                                                                                                             | 36 to 44, pitch 48 px                          | 16                                                                      | regular  | #ffffff          | left            | ESTIMATED |
| Card headings "Activity", "Heart", "Blood", "Other"                                                                                                                                                                                                                                                                                                                                                                                                                      | 64 (with descender for Activity), 'A' about 50 | 22                                                                      | semibold | #dcdcdc          | left            | ESTIMATED |
| Metric names ("Active energy burned", "Distance walking + running", "Exercise time", "Flights climbed", "Sleep duration", "Stand time", "Step count", "Walking speed", "Heart rate", "Heart rate variability (SDNN)", "Respiratory rate", "Resting heart rate", "Walking heart rate average", "Oxygen saturation (SPO2)", "Environmental audio exposure (A-weighted)", "Headphone audio exposure", "Walking asymmetry", "Walking double support", "Walking step length") | 50 (with descender)                            | 17.5                                                                    | regular  | #dcdcdc          | left            | ESTIMATED |
| Metric value line `<value> <unit> . <date>`                                                                                                                                                                                                                                                                                                                                                                                                                              | 52                                             | number about 22 pt medium white, unit and date about 17 pt regular grey | mixed    | #ffffff, #8e8e93 | left            | ESTIMATED |
| "Ask ChatGPT" in the bar                                                                                                                                                                                                                                                                                                                                                                                                                                                 | about 43                                       | 19.5                                                                    | regular  | #8e8e93          | left            | ESTIMATED |

#### Spacing and notes

- Tab row: top 125 pt, height 44 pt; the selected pill takes 17.7 pt of padding each side; gap 8 pt. The row runs to the right edge ("Accounts" ends 1211 px, 404 pt).
- The prompt cards are 94 pt tall; the second card is clipped by the right edge, so the strip scrolls horizontally.
- Card gap between metric cards: 14 pt (IMG_1157: card bottom 804 display, next card top 846 display, about 58 px). Card padding: 21 pt left and right; heading top 27 pt below the card top (card top 910 px, heading top 990 px).
- Sparklines use blue dots for days without data and taller bars for recent days; dots are 4 pt, bars 5 pt wide.
- In IMG_1156 to IMG_1158 the composer bar floats over the scrolling cards with the card text visible through it (translucent #404040 fill when over content, #212121 over black). In IMG_1157 and IMG_1158 a blurred band (#0e0e0e) sits behind the header (y 0 to 302 px).
- IMG_1155 tooltip tail points at the first metric card heading, offset 20 pt from the left; the tooltip overlaps the top of the card.

### 12. Health, Chats, Records and Accounts tabs (IMG_1159, IMG_1160, IMG_1161)

The other three tabs of the Health page. The selected tab pill moves; the header and the composer bar are unchanged from screen 11. IMG_1159 is Chats (empty state), IMG_1160 is Records (connect prompt), IMG_1161 is Accounts (add row and one connected row).

#### Layout, top to bottom

| Element                        | Box px (x, y, w, h)                                                                                       | Size pt (w x h)                       | Anchor     | Fill or colour  | Radius pt   | Status                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------- | --------------- | ----------- | --------------------------------------------- |
| Header, tabs, composer bar     | same as screen 11                                                                                         | same                                  | same       | same            | same        | OBSERVED                                      |
| Selected tab pill              | Chats 363 minus 52 to 363 plus 148 plus 52; Records 637 minus 52; Accounts 970 minus 52 to the right edge | 44 tall, text plus 17 pt each side    | top 125    | #414141         | full pill   | OBSERVED (heights), widths ESTIMATED          |
| Chats empty icon               | 430 to 495 display, bubbles glyph                                                                         | about 30 pt                           | C          | #afafaf outline | n/a         | OBSERVED (visual), size not measured, UNKNOWN |
| Chats caption                  | 280 to 1000 px, y about 905 to 975                                                                        | one line, centred                     | C          | #cdcdcd         | n/a         | OBSERVED                                      |
| Records icon (open book)       | 577, 848, 130, 72                                                                                         | 43 x 24                               | C, top 283 | beige and red   | n/a         | OBSERVED                                      |
| Records heading (2 lines)      | y 1049 to 1160, pitch 85 px                                                                               | 28 pt pitch                           | C          | #dcdcdc         | n/a         | OBSERVED                                      |
| "Connect" button               | 470, 1257, 344, 143                                                                                       | 115 x 48                              | C          | #dcdcdc         | full pill   | OBSERVED                                      |
| "Add account" row              | tile 48, 591, 143, 129                                                                                    | 48 x 43 (tile about 48 square)        | L 16       | #141414         | full circle | OBSERVED                                      |
| Account row (connected source) | tile 35 to 137 display, 99 px                                                                             | avatar 52 x 52, white disc with heart | L 16       | #ffffff         | full circle | OBSERVED (approximate), see notes             |
| Row separator                  | x 70 to 1213 px, y about 768                                                                              | 381 x 1                               | L 23       | #202020         | n/a         | OBSERVED                                      |

#### Text

| Text                                         | Height px   | Est. size pt | Weight  | Colour  | Align          | Status    |
| -------------------------------------------- | ----------- | ------------ | ------- | ------- | -------------- | --------- |
| "Health chats will appear here"              | about 43    | 19.5         | regular | #cdcdcd | centred        | ESTIMATED |
| "Make sense of your complete health history" | 56 per line | 22           | medium  | #dcdcdc | centred        | ESTIMATED |
| "Connect"                                    | 43          | 19.5         | medium  | #000000 | centred        | ESTIMATED |
| "Add account"                                | 45          | 19.5         | regular | #dcdcdc | left, x 227 px | ESTIMATED |
| "Apple Health"                               | about 52    | 19.5         | regular | #ffffff | left, x 227 px | ESTIMATED |
| "Connected"                                  | about 41    | 17           | regular | #afafaf | left           | ESTIMATED |

#### Spacing and notes

- Empty states are centred on the page vertically near the top third (icon at y about 280 pt for Records). Connect button width 115 pt is text plus 29 pt on each side.
- Account rows: tile 48 pt, text left at 76 pt (227 px). Three-dot control at the right (x about 830 px display, R 33 pt) in #afafaf.
- The Accounts tab pill is the widest one and runs to the right edge of the screen (right edge 907 display, about 1260 px).

### 13. Health overflow menu (IMG_1162)

The three-dot button opens a popover menu over the Accounts tab. The page behind is blurred.

#### Layout, top to bottom

| Element      | Box px (x, y, w, h)                     | Size pt (w x h)            | Anchor            | Fill or colour                 | Radius pt | Status               |
| ------------ | --------------------------------------- | -------------------------- | ----------------- | ------------------------------ | --------- | -------------------- |
| Menu popover | 476, 144, 750, about 960                | 250 x 320                  | R 19, top 48      | #222222 (translucent, blurred) | about 33  | OBSERVED / ESTIMATED |
| Item icon    | 572, 210, 61, 61                        | 20 x 20                    | inside menu, L 32 | #f6f6f6                        | n/a       | OBSERVED             |
| Item label   | 685, 218, text height 42                | 19.5 pt text               | inside menu, L 70 | #f6f6f6                        | n/a       | OBSERVED             |
| Item pitch   | icons at y 210, 351, 488, 660, 836, 971 | 46.5 pt for one-line items | inside menu       | none                           | n/a       | OBSERVED             |

#### Text

| Text                                                                                                                              | Height px  | Est. size pt | Weight  | Colour  | Align | Status    |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------ | ------- | ------- | ----- | --------- |
| "Pin", "Apple Health", "Active conditions", "Current medica-tions" (hyphenated across two lines), "Family history", "Help Center" | 42 (cap P) | 19.5         | regular | #f6f6f6 | left  | ESTIMATED |

#### Spacing and notes

- Items: icon 20 pt, 16 pt gap, label. The two-line item "Current medica-tions" is 109 px tall, so rows are not equal height; one-line pitch is 140 px (46.5 pt), the two-line item takes about 140 px plus one extra line of 48 px.
- Menu padding: about 21 pt above the first icon (menu top 144 px, icon top 210 px is 22 pt). Menu right edge 58 px (19 pt) from the screen edge, aligned under the more button.
- No separators or section headings; no check marks.

### 14. Images page (IMG_1163, IMG_1164)

The Images page from the sidebar. A two-column grid of rounded image tiles with a text label on each tile, a Templates / Trending switch and a floating "Describe an image" bar. IMG_1163 shows Templates (Poster, Interior design, Logo, Illustration, Headshot, Icon), IMG_1164 shows Trending (Anime reaction GIF, Aerial view, Collector's tin, '80s flashback, Caricature, Sketch).

#### Layout, top to bottom

| Element                          | Box px (x, y, w, h)                                      | Size pt (w x h)                                               | Anchor                       | Fill or colour                          | Radius pt   | Status                                              |
| -------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------- | --------------------------------------- | ----------- | --------------------------------------------------- |
| Menu button                      | 60, 141, 132, 132                                        | 44 x 44                                                       | L 20, top 47                 | #1f1f1f                                 | full circle | OBSERVED                                            |
| Title "Images"                   | about 392 to 530 display                                 | centred                                                       | C                            | #ffffff                                 | n/a         | OBSERVED (position by eye), see Text                |
| Switch pill, selected            | 48, 351, 365, 132 (Templates)                            | 122 x 44                                                      | L 16, top 117                | #414141                                 | full pill   | OBSERVED                                            |
| Switch label (unselected)        | 487, 394, 224, 54 ("Trending")                           | text only                                                     | gap 25 px to pill            | #afafaf                                 | n/a         | OBSERVED                                            |
| Image tile, left column          | 48, 531, 570, 713                                        | 190 x 237.7                                                   | L 16                         | image                                   | about 47    | OBSERVED / ESTIMATED                                |
| Image tile, right column         | 666, 531, 570, 713                                       | 190 x 237.7                                                   | R 16                         | image                                   | about 47    | OBSERVED / ESTIMATED                                |
| Tile gap                         | 48 px horizontal, 48 px vertical (second row top y 1292) | 16                                                            | between tiles                | n/a                                     | n/a         | OBSERVED                                            |
| Tile label                       | 88, 1153, 135, 32 (tile 2 label "Poster" at 88 px)       | text 45 pt wide                                               | inside tile, L 13, bottom 20 | #ffffff on image                        | n/a         | OBSERVED                                            |
| Floating bar "Describe an image" | about 104 to 1181, y about 2534 to 2676                  | 360 x 47                                                      | L 34, R 34, bottom 34        | translucent over image, border hairline | full pill   | OBSERVED (edges by eye, left unmeasured over image) |
| Attach icon (paperclip)          | x about 108 to 148 display                               | about 14 x 20                                                 | inside bar, L 15             | #ffffff                                 | n/a         | OBSERVED (visual), size UNKNOWN                     |
| Send button                      | right end of bar                                         | 34.7 pt circle, fill grey #9a9a9a to #d0d0d0 with an up arrow | inside bar, R 7              | grey                                    | full circle | OBSERVED (visual), size UNKNOWN                     |

#### Text

| Text                                                                                                                                                                                    | Height px                   | Est. size pt | Weight   | Colour  | Align           | Status                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------ | -------- | ------- | --------------- | --------------------------- |
| "Images"                                                                                                                                                                                | about 43                    | 19           | semibold | #ffffff | centred         | ESTIMATED                   |
| "Templates" (selected)                                                                                                                                                                  | 52 (with descender)         | 19.5         | medium   | #ffffff | centred in pill | ESTIMATED                   |
| "Trending"                                                                                                                                                                              | 54 (with descender)         | 19.5         | regular  | #afafaf | left of pill    | ESTIMATED                   |
| Tile labels ("Poster", "Interior design", "Logo", "Illustration", "Headshot", "Icon", "Anime reaction GIF", "Aerial view", "Collector's tin", "'80s flashback", "Caricature", "Sketch") | 32 (cap P)                  | 15           | semibold | #ffffff | left            | ESTIMATED                   |
| "Describe an image"                                                                                                                                                                     | not isolated over the image | UNKNOWN      | regular  | grey    | left            | UNKNOWN (text over a photo) |

#### Spacing and notes

- Tiles are 190 x 238 pt portrait cards with 16 pt gutters; the label is at the lower left of each tile with 13 pt left padding and 20 pt bottom padding. No gradient scrim was measured (labels sit directly on the artwork).
- The bar at the bottom floats above the grid with blur; its fill is translucent so tile colours show through (grey teal over the right tile in IMG_1163).
- The switch uses the same pill language as the Projects filters (44 pt tall, 17 pt padding).

### 15. Sites page (IMG_1165, IMG_1166)

The Sites page from the sidebar. IMG_1165 shows "Owned by you" with two site rows; IMG_1166 shows "Shared with you" with an empty state.

#### Layout, top to bottom

| Element                                            | Box px (x, y, w, h)                                       | Size pt (w x h)               | Anchor                  | Fill or colour      | Radius pt   | Status                                    |
| -------------------------------------------------- | --------------------------------------------------------- | ----------------------------- | ----------------------- | ------------------- | ----------- | ----------------------------------------- |
| Menu button                                        | 60, 141, 132, 132                                         | 44 x 44                       | L 20, top 47            | #1f1f1f             | full circle | OBSERVED                                  |
| Title "Sites"                                      | about 415 to 508 display                                  | centred                       | C                       | #ffffff             | n/a         | OBSERVED (by eye), size ESTIMATED         |
| Plus button                                        | 1092, 141, 132, 132 (glyph 1125, 174, 65, 65)             | 44 x 44                       | R 20, top 47            | #1f1f1f             | full circle | OBSERVED                                  |
| Filter pill "Owned by you" (selected)              | 48, 327, 459, 129                                         | 153 x 43                      | L 16, top 109           | #414141             | full pill   | OBSERVED                                  |
| Filter pill "Shared with you" (selected, IMG_1166) | 537, 327, 503, 129                                        | 168 x 43                      | gap 10 from first label | #414141             | full pill   | OBSERVED                                  |
| Site thumbnail                                     | 48, 503 (fill region 143 x 158; icon square about 156 px) | about 52 x 52                 | L 16                    | image               | about 16    | OBSERVED (fill), ESTIMATED (size, radius) |
| Row text                                           | 255, 531 (title), 255, 603 (caption)                      | title and caption             | L 85                    | #ffffff, #cdcdcd    | n/a         | OBSERVED                                  |
| Row pitch                                          | 204 px                                                    | 68                            | n/a                     | n/a                 | n/a         | OBSERVED                                  |
| Search bar ("Search sites")                        | 102, 2532, 1080, 144                                      | 360 x 48                      | L 34, R 34, bottom 34   | #212121             | full pill   | OBSERVED                                  |
| Empty state icon (four squares)                    | 574, 793, 137, 137                                        | 46 x 46                       | C, top 264              | #7f7f7f             | n/a         | OBSERVED                                  |
| Empty state heading and caption                    | 104, 1026, 1075, 150                                      | heading line and caption line | C                       | #ffffff and #8d8d93 | n/a         | OBSERVED                                  |

#### Text

| Text                                      | Height px           | Est. size pt | Weight   | Colour               | Align           | Status    |
| ----------------------------------------- | ------------------- | ------------ | -------- | -------------------- | --------------- | --------- |
| "Sites"                                   | about 43            | 19           | semibold | #ffffff              | centred         | ESTIMATED |
| "Owned by you"                            | 43 (ascender)       | 19.5         | medium   | #ffffff              | centred in pill | ESTIMATED |
| "Shared with you"                         | 43 (ascender)       | 19.5         | regular  | #cdcdcd (unselected) | left            | ESTIMATED |
| `<site name>`                             | 43 (ascender)       | 19.5         | regular  | #ffffff              | left            | ESTIMATED |
| `<age>` ("1 month ago")                   | 39                  | 14.5         | regular  | #cdcdcd              | left            | ESTIMATED |
| "No shared sites yet"                     | about 54            | 20           | bold     | #ffffff              | centred         | ESTIMATED |
| "Sites shared with you will appear here." | about 54            | 19           | regular  | #8d8d93              | centred         | ESTIMATED |
| "Search sites"                            | similar to screen 5 | 19.5         | regular  | #afafaf              | left            | ESTIMATED |

#### Spacing and notes

- The filter row sits 8 pt higher than on the Projects page (top 109 pt against 117 pt) and the pill is 43 pt tall against 44 pt there.
- Rows match the Projects list: 52 pt thumbnail, 68 pt pitch, 17 pt gap to text (85 pt from the left edge) with two lines of text.
- Empty state: icon 46 pt, heading and caption centred about 9 pt below the icon.
- A plus button is shown in both states; there is no sheet or compose control on this page.

## Not covered or doubtful in this part

- Text sizes for the page titles of Images and Sites, the Images tile placeholder text, the Images composer icons, the Chats-tab empty icon and the "+23" tile label were read by eye or not isolated; they are marked UNKNOWN or by eye above.
- The width of the Settings, Cancel and Done pills (screens 6 and 7) was derived from the text plus the padding measured elsewhere, not from an edge reading, because the pill fill is close to the sheet colour.
- Corner radii are estimates from the fit method; all are marked ESTIMATED.
