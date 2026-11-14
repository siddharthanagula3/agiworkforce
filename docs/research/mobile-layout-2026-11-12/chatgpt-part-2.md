# ChatGPT on iPhone: layout measurements, part 2 (observed 2026-11-12)

Status: Historical snapshot
Owner: Product (founder)
Last updated: 2026-11-12

Screenshots IMG_1167 to IMG_1200 of the founder's reference set, 1284 x 2778 pixels at scale 3 (428 x 926 points). Method, tool and limits are in `docs/research/mobile-layout-2026-11-12/README.md`. Sizes are points unless a column says pixels. OBSERVED means read from pixels by the tool; ESTIMATED means derived (text size from cap height, weight and radius by fit); UNKNOWN means not readable from a screenshot.

Dark theme throughout. Personal content (names, emails, phone numbers, chat titles, task titles, plugin names, message text) is replaced by placeholders. All text sizes use the SF Pro ratio 0.705 and carry plus or minus 1 point. This range contains no plus or attach menu, no model menu and no composer with typed text or an attachment chip; the range holds the Space tabs, Scheduled, a chat with a voice call, search, the account and settings sheet, the Codex area, a web sign-in page, the new chat home and the drawer.

## Shared components seen in this part

| Component          | Metric                      | Value                                                                                                                                                                                | Screenshot                   | Status                     |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | -------------------------- |
| Screen frame       | Status bar height           | 47 pt (141 px); time text cap height 38 px, about 18 pt, starts at x 127 px (L 42); battery group ends at x 1187 px (R 32)                                                           | 1168                         | OBSERVED, size ESTIMATED   |
| Screen frame       | Page background             | #000000                                                                                                                                                                              | 1167, 1168, 1175             | OBSERVED                   |
| Screen frame       | Header bar                  | circle controls occupy y 141 to 273 px: top 47, height 44, centre at 69 pt from the top; title text is centred on the same line                                                      | 1167, 1168                   | OBSERVED                   |
| Screen frame       | Side margin of main content | 16 pt for cards (x 48 px) in Customize, Scheduled and chat bubbles; 15.3 pt (x 46 px) for Space tiles; 20 pt (x 60 px) for settings cards                                            | 1167, 1168, 1175, 1178, 1183 | OBSERVED                   |
| Chat header        | Left control                | circle 132 x 132 px (44 x 44 pt), L 20, fill #1f1f1f, white icon of two stacked horizontal lines (the upper line longer)                                                             | 1168                         | OBSERVED                   |
| Chat header        | Right control               | circle 132 x 132 px (44 pt), R 20, fill #1f1f1f; icon varies: three dots, plus, telephone, magnifier, close cross, or a chat-bubble outline                                          | 1168, 1178, 1191, 1183, 1196 | OBSERVED                   |
| Chat header        | Title text                  | cap height 42 px, about 20 pt, semibold, white, centred                                                                                                                              | 1167, 1168                   | ESTIMATED                  |
| Chat header        | Home variant                | after the left circle, a pill 413 x 132 px (138 x 44 pt) at x 228 px (L 76) holding a blue four-point sparkle and the label "Upgrade" in #48aaff; right circle R 20                  | 1196                         | OBSERVED                   |
| Composer at rest   | Card inset and size         | x 102 to 1182 px (L 34, R 34), y 2532 to 2676 px, so 360 x 48 pt; 3 px border #2c2c2c                                                                                                | 1178, 1191, 1196             | OBSERVED                   |
| Composer at rest   | Card radius and fill        | full pill, radius 24 pt; fill #1f1f1f                                                                                                                                                | 1178                         | OBSERVED, radius ESTIMATED |
| Composer at rest   | Placeholder text            | cap height 43 px, about 20 pt, regular, #909090 in chat, #828282 on Codex and home; starts at x 259 px (157 px, 52 pt, inside the pill from its left edge)                           | 1178, 1191, 1196             | ESTIMATED                  |
| Composer at rest   | Plus icon                   | 60 x 59 px (20 pt), white, left edge x 147 px (15 pt inside the pill)                                                                                                                | 1178                         | OBSERVED                   |
| Composer at rest   | Microphone icon             | 57 x 72 px (19 x 24 pt), white outline, x 939 to 996 px on Codex and home, x 1081 to 1138 px in a chat                                                                               | 1178, 1191, 1196             | OBSERVED                   |
| Composer at rest   | Voice (waveform) button     | white circle 104 px (34.7 pt), fill #fafafa, right edge x 1162 px (20 px, 6.7 pt, inside the pill right edge); dark waveform icon                                                    | 1191, 1196                   | OBSERVED                   |
| Composer at rest   | Distance to screen bottom   | 102 px (34 pt) from the pill bottom, the home indicator area                                                                                                                         | 1178                         | OBSERVED                   |
| Messages           | Filled message bubble       | left aligned, x 48 px (L 16), width up to 1005 px (335 pt), fill #212121, radius about 25 pt, text padding about 50 px (16.7 pt); 231 px (77 pt) stays free on the right of bubble 1 | 1178                         | OBSERVED, radius ESTIMATED |
| Messages           | Message text                | cap height 40 px, about 19 pt, regular, white; line pitch 66.5 px (22 pt)                                                                                                            | 1178                         | ESTIMATED                  |
| Messages           | Date label                  | "Today" semibold plus "10:28 AM" regular, digit height 31 px (about 14.5 pt), #afafaf, centred                                                                                       | 1178                         | ESTIMATED                  |
| Sidebar or drawer  | Width                       | main panel starts at x 994 px, so drawer width about 331 pt (77 percent of 428)                                                                                                      | 1197                         | OBSERVED, width ESTIMATED  |
| Sidebar or drawer  | Row pitch, icon, label      | nav rows 157 px (52 pt) apart; icons 63 to 68 px (21 to 22 pt) at x 103 px (L 34); labels at x 218 px (L 73), about 20 pt, white                                                     | 1197                         | OBSERVED                   |
| Sidebar or drawer  | Section heading             | "Pinned" and "Recents": cap height 43 to 45 px (about 20 pt), semibold, white, L 33                                                                                                  | 1197                         | ESTIMATED                  |
| Sidebar or drawer  | Footer                      | white "Chat" pill 363 x 157 px (121 x 52 pt) at L 34, bottom 34; account avatar circle 157 px (52 pt) on the right of the drawer                                                     | 1197                         | OBSERVED                   |
| Settings list      | Row height                  | 162 px including a 3 px separator (54 pt); two-line rows 237 px (79 pt)                                                                                                              | 1183, 1184                   | OBSERVED                   |
| Settings list      | Row label                   | cap height 43 px, about 20 pt, regular, white                                                                                                                                        | 1183                         | ESTIMATED                  |
| Settings list      | Value text                  | about 20 pt, #98989f; second line of a two-line row has x-height 30 px, ascender 41 px, about 18 pt                                                                                  | 1183                         | ESTIMATED                  |
| Settings list      | Row icon                    | 61 px (20 pt) square at x 129 px (23 pt inside the card), outline, white                                                                                                             | 1183                         | OBSERVED                   |
| Settings list      | Section heading             | cap height 43 to 45 px, about 20 pt, semibold, #afafaf, starts at x 123 px (L 41)                                                                                                    | 1183                         | ESTIMATED                  |
| Settings list      | Card inset, radius, fill    | x 60 to 1224 px (L 20, R 20); radius about 26 pt; fill #1c1c1e                                                                                                                       | 1183                         | OBSERVED, radius ESTIMATED |
| Settings list      | Separator                   | 3 px, #38383b, from x 235 px (58 pt inside the card) to x 1164 px (20 pt short of the card right edge)                                                                               | 1183                         | OBSERVED                   |
| Settings list      | Toggle                      | 189 x 84 px (63 x 28 pt); on fill #30d158, off fill #59595e; white oval knob about 111 px wide                                                                                       | 1186, 1187                   | OBSERVED                   |
| Settings list      | Chevron                     | 23 x 40 px (7.7 x 13 pt), #59595e, x 1131 to 1154 px (right edge 70 px inside the card edge)                                                                                         | 1183, 1186                   | OBSERVED                   |
| Sheets and dialogs | Dialog                      | 956 x 623 px (319 x 208 pt), translucent fill #252525 to #2a2a2b, radius about 30 pt                                                                                                 | 1189                         | OBSERVED, radius ESTIMATED |
| Sheets and dialogs | Grabber                     | 174 x 11 px (58 x 3.7 pt), #67676a, centred, 18 px below the sheet top                                                                                                               | 1194                         | OBSERVED                   |
| Sheets and dialogs | Close button                | circle 132 px (44 pt) at R 20, top 47, fill about #3a3a3c                                                                                                                            | 1183                         | OBSERVED                   |
| Buttons            | Primary (white pill)        | height 120 to 162 px (40 to 54 pt), full radius, fill #fafafa to #eff0ef, label dark, 18 to 20 pt                                                                                    | 1183, 1190, 1191, 1195       | OBSERVED, size ESTIMATED   |
| Buttons            | Secondary (outlined pill)   | 156 px (52 pt) high, 3 px border #262626, full radius, label #ededed                                                                                                                 | 1190                         | OBSERVED                   |
| Voice mode         | Main controls               | three circles 242 px (80.7 pt) on a 360 px (120 pt) pitch; compact call card uses three pills 324 x 144 px (108 x 48 pt)                                                             | 1179, 1180                   | OBSERVED                   |

## Screens

### 1. Customize page (IMG_1167)

A full page reached from the drawer, titled "Customize". Dark theme, no sheet, not scrolled. Three grouped cards hold 3, 5 and 3 rows. Each row shows a colour icon, a label, a value in grey or blue, and a chevron.

#### Layout, top to bottom

| Element           | Box px (x, y, w, h)                    | Size pt (w x h) | Anchor                                          | Fill or colour                                             | Radius pt | Status                     |
| ----------------- | -------------------------------------- | --------------- | ----------------------------------------------- | ---------------------------------------------------------- | --------- | -------------------------- |
| Menu button       | 60, 141, 132, 132                      | 44 x 44         | L 20, top 47                                    | #1f1f1f                                                    | full      | OBSERVED                   |
| Title "Customize" | 503, 186, 278, 45 (glyph box)          | 92.7 x 15       | C, centre y 69                                  | #ffffff                                                    | none      | OBSERVED                   |
| Card 1 (3 rows)   | 48, 375, 1188, 504                     | 396 x 168       | L 16, R 16, top 125                             | #212121, 3 px border #424242                               | about 26  | OBSERVED, radius ESTIMATED |
| Card 2 (5 rows)   | 48, 978, 1188, 845                     | 396 x 281.7     | L 16, R 16                                      | same                                                       | about 26  | OBSERVED                   |
| Card 3 (3 rows)   | 48, 1919, 1188, 507                    | 396 x 169       | L 16, R 16                                      | same                                                       | about 26  | OBSERVED                   |
| Row (one)         | 48, 375, 1188, 168                     | 396 x 56        | inside card                                     | none                                                       | none      | OBSERVED                   |
| Row icon          | 127, 427, 65, 65 (first row)           | 21.7 x 21.7     | inside row, L 26                                | multicolour, e.g. #78e0ff                                  | icon      | OBSERVED                   |
| Row label         | 240, 437, 274, 53                      | 91 x 17.7       | label starts 80 pt from the screen left         | #ffffff                                                    | none      | OBSERVED                   |
| Row value         | 901, 437, 201, 43                      | 67 x 14.3       | right aligned, ends 1102 px (R 60.7)            | #afafaf, or #48aaff for the actions "Connect" and "Set up" | none      | OBSERVED                   |
| Chevron           | 1143, 445, 17, 30                      | 5.7 x 10        | right edge 1160 px (25 pt inside the card edge) | #afafaf                                                    | none      | OBSERVED                   |
| Gap between cards | 99 px between card bottom and next top | 33              | none                                            | #000000                                                    | none      | OBSERVED                   |

#### Text

| Text                                                                                                                                           | Height px | Est. size pt | Weight   | Colour                                  | Align  | Status    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | -------- | --------------------------------------- | ------ | --------- |
| "Customize"                                                                                                                                    | 42 (cap)  | 20           | semibold | #ffffff                                 | centre | ESTIMATED |
| Row labels ("Personality", "Memory", "Plugins", "Email", "Calendar", "Passwords", "Health", "Finances", "Location", "Browser", "Custom rules") | 43 (cap)  | 20           | regular  | #ffffff                                 | left   | ESTIMATED |
| Row values ("Efficient", "Connected", "0 items", "Set up", "Connect")                                                                          | 42 (cap)  | 20           | regular  | #afafaf; "Connect" and "Set up" #48aaff | right  | ESTIMATED |

#### Spacing and notes

- Separator between rows: 3 px, #3f3f42, starting at x 228 px (60 pt inside the card, aligned just left of the label) and running to the card edge, so it has no right inset. The first row of a card has no separator above it.
- Row height 168 px (56 pt), 8 pt taller than the settings rows on screen 7.
- Icon centre to label start gap about 48 px (16 pt). Value and chevron gap 41 px (13.7 pt).

### 2. Space tabs (IMG_1168 Suggested, IMG_1169 Favorites, IMG_1170 Images, IMG_1171 Folders, IMG_1172 Sites, IMG_1173 Pages, IMG_1174 All)

"Space" is a page with a horizontally scrolling tab row under the header and a search bar pinned at the bottom. Dark theme. The tab row is scrolled differently on each screenshot. IMG_1168 shows document tiles, IMG_1169 an empty state, IMG_1170 an image grid under a "References" heading, IMG_1171 folder tiles, IMG_1172 a list of sites, IMG_1173 two page tiles, IMG_1174 a combined list with a "Folders" section heading.

#### Layout, top to bottom

| Element                              | Box px (x, y, w, h)                       | Size pt (w x h)        | Anchor                                                            | Fill or colour                                             | Radius pt | Status                                             |
| ------------------------------------ | ----------------------------------------- | ---------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- | --------- | -------------------------------------------------- |
| Menu button                          | 60, 141, 132, 132                         | 44 x 44                | L 20, top 47                                                      | #1f1f1f                                                    | full      | OBSERVED                                           |
| Right button (three dots)            | 1092, 141, 132, 132                       | 44 x 44                | R 20, top 47                                                      | #1f1f1f                                                    | full      | OBSERVED                                           |
| Right button on Sites (plus)         | 1092, 141, 132, 132                       | 44 x 44                | R 20                                                              | #1f1f1f                                                    | full      | OBSERVED                                           |
| Title "Space"                        | 562, 186, 161, 51                         | 53.7 x 17              | C                                                                 | #ffffff                                                    | none      | OBSERVED                                           |
| Selected tab pill "Suggested" (1168) | 48, 351, 378, 132                         | 126 x 44               | L 16                                                              | #414141                                                    | full      | OBSERVED                                           |
| Selected pill "Favorites" (1169)     | 450, 351, 333, 132                        | 111 x 44               | scrolling row                                                     | #414141                                                    | full      | OBSERVED                                           |
| Selected pill "Images" (1170)        | 499, 351, 286, 132                        | 95.3 x 44              | scrolling row                                                     | #414141                                                    | full      | OBSERVED                                           |
| Selected pill "Sites" (1172)         | 544, 375, 226, 132                        | 75.3 x 44              | scrolling row; the row sits 24 px (8 pt) lower on this screenshot | #414141                                                    | full      | OBSERVED                                           |
| Tab text, unselected                 | e.g. 503, 394, 229, 44                    | 76.3 x 14.7            | pill padding about 50 px (16.7 pt) each side                      | #afafaf                                                    | none      | OBSERVED                                           |
| Document tile (1168)                 | 46, 531, 574, 569                         | 191.3 x 189.7          | L 15.3, 2 columns                                                 | #000000, 3 px border about #333333                         | about 23  | OBSERVED, radius ESTIMATED                         |
| Tile column gap                      | 44 px between tiles (620 to 664)          | 14.7                   | none                                                              | none                                                       | none      | OBSERVED                                           |
| Tile row pitch                       | 618 px                                    | 206                    | none                                                              | none                                                       | none      | OBSERVED                                           |
| Tile title (two lines)               | 98, 590, 352, 39 and 99, 655, 349, 40     | 117 x 13               | inside tile, L 17.3, top 19.7                                     | #ffffff                                                    | none      | OBSERVED                                           |
| Tile document icon                   | 113, 973, 54, 60                          | 18 x 20                | inside tile, L 22, bottom about 22                                | #9e9e9e                                                    | icon      | OBSERVED                                           |
| Empty state heading (1169)           | 360 to 924, y 647, h 50                   | text only              | C                                                                 | #ffffff                                                    | none      | OBSERVED                                           |
| Empty state body, 2 lines (1169)     | 319, 820 and 436, 748 area                | text only              | C, line pitch 72 px (24 pt)                                       | #cdcdcd                                                    | none      | OBSERVED                                           |
| Bookmark icon (1169)                 | 609, 983, 66, 76                          | 22 x 25.3              | C                                                                 | #afafaf                                                    | icon      | OBSERVED                                           |
| "References" heading (1170)          | 52, 560, 294, 44                          | 98 x 14.7              | L 17                                                              | #fefefe                                                    | none      | OBSERVED                                           |
| "Add reference" pill (1170)          | 48, 654, 542, 120                         | 180.7 x 40             | L 16                                                              | #303030                                                    | full      | OBSERVED                                           |
| Image tile (1170)                    | width 574; height about 372; pitch 417 px | 191.3 x 124; pitch 139 | L 15.3, 2 columns                                                 | border #393a3a                                             | about 14  | height and radius ESTIMATED from the left edge run |
| Folder tile (1171)                   | 46, 545, 574, 543 (square-ish)            | 191.3 x 181            | L 15.3                                                            | #000000, 3 px border                                       | about 23  | OBSERVED, radius ESTIMATED                         |
| Folder icon (1171)                   | 273, 761, 120, 111                        | 40 x 37                | C of the tile                                                     | #ffffff                                                    | icon      | OBSERVED                                           |
| Folder label (1171)                  | 52, 1135, 122, 49                         | 40.7 x 16.3            | under the tile, 34 px (11 pt) gap                                 | #fefefe                                                    | none      | OBSERVED                                           |
| Section heading "Folders" (1174)     | 53, 543, 187, 43                          | 62.3 x 14.3            | L 17.7                                                            | #fefefe                                                    | none      | OBSERVED                                           |
| Site row thumbnail (1172)            | 48, 561, 156, 156                         | 52 x 52                | L 16                                                              | picture                                                    | about 12  | OBSERVED, radius ESTIMATED                         |
| Site row pitch (1172)                | 222 px                                    | 74                     | none                                                              | none                                                       | none      | OBSERVED                                           |
| Site title (1172)                    | 254, 588, 255, 43                         | 85 x 14.3              | thumbnail right plus 50 px (16.7 pt)                              | #ffffff                                                    | none      | OBSERVED                                           |
| Site subtitle "1 month ago" (1172)   | 254, 660, 149, 32                         | 49.7 x 10.7            | under the title                                                   | #cdcdcd                                                    | none      | OBSERVED                                           |
| Search bar pill                      | 99 to 1002, y 2532 to 2676                | 301 x 48               | L 33, bottom 34                                                   | #2a2a2b with a 3 px lighter border, translucent over a bar | full      | OBSERVED                                           |
| Search icon                          | 146, 2576, 57, 57                         | 19 x 19                | inside bar, L 15.7                                                | #afafaf                                                    | icon      | OBSERVED                                           |
| Search placeholder                   | 238, 2582, 170, 43                        | 56.7 x 14.3            | inside bar                                                        | #afafaf                                                    | none      | OBSERVED                                           |
| Plus button                          | x 1038 to 1182, y 2532 to 2676            | 48 x 48                | R 34, bottom 34                                                   | #282828                                                    | full      | OBSERVED                                           |
| Plus icon                            | 1078, 2572, 64, 64                        | 21.3 x 21.3            | C of the button                                                   | #ffffff                                                    | icon      | OBSERVED                                           |
| Bottom bar band                      | y 2508 to 2778                            | 90 pt tall             | bottom 0                                                          | about #090908, translucent; tiles show faintly behind      | none      | OBSERVED                                           |

#### Text

| Text                                                                        | Height px             | Est. size pt | Weight                       | Colour                           | Align                                            | Status    |
| --------------------------------------------------------------------------- | --------------------- | ------------ | ---------------------------- | -------------------------------- | ------------------------------------------------ | --------- |
| "Space"                                                                     | 42 (cap)              | 20           | semibold                     | #ffffff                          | centre                                           | ESTIMATED |
| Tabs "Suggested", "Favorites", "Folders", "Images", "Sites", "Pages", "All" | 43 to 44              | 20           | regular, selected one medium | selected #ffffff, others #afafaf | centre in the pill                               | ESTIMATED |
| Tile title (placeholder <document name>)                                    | 39 (cap and ascender) | 18           | regular                      | #ffffff                          | left, truncates with an ellipsis after two lines | ESTIMATED |
| "Save your favorites"                                                       | about 42 (cap)        | 20           | semibold                     | #ffffff                          | centre                                           | ESTIMATED |
| "Items you add to Favorites will appear here."                              | 41 to 43 (cap)        | 20           | regular                      | #cdcdcd                          | centre                                           | ESTIMATED |
| "References"                                                                | 42 (cap)              | 20           | semibold                     | #fefefe                          | left                                             | ESTIMATED |
| "Add reference"                                                             | 43 (cap)              | 20           | regular                      | #ffffff                          | left of pill after the plus                      | ESTIMATED |
| Folder name (placeholder <folder name>)                                     | 40                    | 19 to 20     | regular                      | #fefefe                          | left                                             | ESTIMATED |
| "Folders"                                                                   | 43 (cap)              | 20           | semibold                     | #fefefe                          | left                                             | ESTIMATED |
| Site title (placeholder <site name>)                                        | 43 (cap)              | 20           | regular                      | #ffffff                          | left                                             | ESTIMATED |
| Site subtitle ("1 month ago")                                               | 30 (digit)            | 14.3         | regular                      | #cdcdcd                          | left                                             | ESTIMATED |
| "Search", "Search sites"                                                    | 43 (cap)              | 20           | regular                      | #afafaf                          | left                                             | ESTIMATED |

#### Spacing and notes

- IMG_1168: two columns of tiles, 14.7 pt between columns, 16 pt between rows (49 px). The sixth and later tiles pass under the search bar band and show blurred through it.
- IMG_1169: the empty state is centred in the content area; heading top is 647 px (216 pt) from the top of the screen.
- IMG_1170: the grid starts with a "References" heading, an "Add reference" pill and then image tiles holding screenshots of web pages. The last tile is a blank grey placeholder (about #3a3a3a). Image content is not described.
- IMG_1171 and IMG_1174: folder tiles have a plain white folder outline icon, and one tile uses a three-colour logo. IMG_1174 starts the same folder grid about 117 px (39 pt) lower than IMG_1171 because of the "Folders" heading (heading box y 543 to 586 px, first tile top about 648 px).
- IMG_1172: the search bar has no plus button on this tab ("Search sites" pill spans x 99 to 1182 px, L 33, R 34). The right header button is a plus.
- IMG_1173: two tiles in one row; the first has a blue document icon, the second a yellow sparkle icon, both 54 x 60 px at the tile bottom left.
- The tab row is one horizontally scrolling strip with no divider under it; content starts 48 px (16 pt) under the pill bottom.

### 3. Scheduled (IMG_1175 Active, IMG_1176 Completed, IMG_1177 Paused)

A list page titled "Scheduled" with three tabs ("Active", "Paused", "Completed") and a floating "New task" button. Dark theme. The Active tab shows one task card and a "Recommended" group of dashed cards; Completed shows two cards; Paused shows one.

#### Layout, top to bottom

| Element                        | Box px (x, y, w, h)                                                               | Size pt (w x h) | Anchor                                                   | Fill or colour               | Radius pt | Status                                                  |
| ------------------------------ | --------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------- | ---------------------------- | --------- | ------------------------------------------------------- |
| Menu button                    | 60, 141, 132, 132                                                                 | 44 x 44         | L 20, top 47                                             | #1f1f1f                      | full      | OBSERVED                                                |
| Title "Scheduled"              | centred                                                                           | text only       | C                                                        | #ffffff                      | none      | OBSERVED                                                |
| Selected tab pill "Active"     | 48, 351, 258, 132                                                                 | 86 x 44         | L 16                                                     | #414141                      | full      | OBSERVED                                                |
| Tab text "Paused"              | 383, 395, 184, 43                                                                 | 61.3 x 14.3     | after the Active pill                                    | #afafaf                      | none      | OBSERVED                                                |
| Tab text "Completed"           | 694, 395, 280, 52                                                                 | 93.3 x 17.3     | after Paused                                             | #afafaf                      | none      | OBSERVED                                                |
| Task card (1175)               | 48, 577, 1188, 232                                                                | 396 x 77        | L 16, R 16                                               | #212121, 3 px border #292929 | about 26  | OBSERVED, radius ESTIMATED                              |
| Task icon                      | 113, 663, 62, 60                                                                  | 20.7 x 20       | inside card, L 21.7                                      | emoji image                  | none      | OBSERVED                                                |
| Task title                     | 231, 641, 570 wide, 43 high                                                       | text            | card L plus 61                                           | #ffffff                      | none      | OBSERVED                                                |
| Task subtitle                  | 232, 715, 458, 34                                                                 | 152.7 x 11.3    | under the title, 31 px (10 pt) below title baseline area | #afafaf                      | none      | OBSERVED                                                |
| More (dots) icon               | 1113, 687, 54, 12                                                                 | 18 x 4          | right edge 1167 px (23 pt from the card right)           | #afafaf                      | icon      | OBSERVED                                                |
| "Recommended" heading          | 125, 939, 392, 43                                                                 | 130.7 x 14.3    | L 41.7                                                   | #afafaf                      | none      | OBSERVED                                                |
| Recommended card, 2 text lines | 48, 1033, 1188, about 286                                                         | 396 x 95        | L 16, R 16                                               | #212121, dashed border       | about 26  | OBSERVED (height from the screenshot), radius ESTIMATED |
| Recommended card, 3 text lines | about 348 px tall                                                                 | 116             | L 16, R 16                                               | same                         | about 26  | OBSERVED                                                |
| Recommended icon               | 116, 1145, 56, 62                                                                 | 18.7 x 20.7     | inside card, L 22.7                                      | emoji image                  | none      | OBSERVED                                                |
| Recommended title              | 231, 1094, 580 wide, 43 high                                                      | text            | card L plus 61                                           | #ffffff                      | none      | OBSERVED                                                |
| Recommended description line   | 229, 1168, 34 cap                                                                 | text            | line pitch 59 px (19.7 pt)                               | #afafaf                      | none      | OBSERVED                                                |
| "New task" button              | 822, 2517, 366, 144                                                               | 122 x 48        | R 32, bottom 39                                          | #fafafa                      | full      | OBSERVED                                                |
| Completed card (1176)          | 48, 577, 1188, about 228; second card starts about 264 px (88 pt) below the first | 396 x 76        | L 16                                                     | #212121                      | about 26  | OBSERVED, pitch from the screenshot                     |

#### Text

| Text                                                               | Height px      | Est. size pt | Weight                   | Colour                           | Align                       | Status    |
| ------------------------------------------------------------------ | -------------- | ------------ | ------------------------ | -------------------------------- | --------------------------- | --------- |
| "Scheduled"                                                        | 42 (cap)       | 20           | semibold                 | #ffffff                          | centre                      | ESTIMATED |
| Tabs "Active", "Paused", "Completed"                               | 43             | 20           | regular, selected medium | selected #ffffff, others #afafaf | centre                      | ESTIMATED |
| Task title (placeholder <task title>)                              | 43 (cap)       | 20           | regular                  | #ffffff                          | left                        | ESTIMATED |
| Task subtitle (date and "Monitoring", or "Completed", or "Paused") | 34 (cap)       | 16           | regular                  | #afafaf                          | left                        | ESTIMATED |
| "Recommended"                                                      | 43 (cap)       | 20           | medium                   | #afafaf                          | left                        | ESTIMATED |
| Recommended title (placeholder <recommended task title>)           | 43 (cap)       | 20           | regular                  | #ffffff                          | left                        | ESTIMATED |
| Recommended description (placeholder <recommended task text>)      | 34 (cap)       | 16           | regular                  | #afafaf                          | left, wraps to 2 or 3 lines | ESTIMATED |
| "New task"                                                         | about 43 (cap) | 20           | medium                   | #0d0d0d to dark                  | centre                      | ESTIMATED |

#### Spacing and notes

- IMG_1175: the cards stack with 33 px to 60 px gaps (about 11 to 20 pt) in the measured area; the Recommended cards have dashed borders and are 32 px (10.7 pt) apart.
- The "New task" button floats over the list and covers part of the fifth recommended card; it is not part of the scroll content. Shadow: UNKNOWN (no visible shadow on black).
- IMG_1176 and IMG_1177 use the same card as the Active card, with the status text "Completed" or "Paused" in the subtitle position and the same three-dot control at the right. Completed shows two cards with a pitch of about 264 px (88 pt) and a gap of about 38 px (12.7 pt); Paused shows one.
- Selected tab pill moves; tab text positions stay the same (Paused text at x 383 px, Completed at x 694 px on every Scheduled screenshot).

### 4. Chat thread with a voice call button (IMG_1178)

A chat thread with two filled message bubbles, a date label and the composer. The header's right control is a telephone button. A blurred assistant avatar with its name overlays the top centre while the screen is behind a transition overlay (top bubble text blurs under it). Dark theme, no keyboard.

#### Layout, top to bottom

| Element                                                | Box px (x, y, w, h)                                        | Size pt (w x h)         | Anchor                | Fill or colour               | Radius pt | Status                                 |
| ------------------------------------------------------ | ---------------------------------------------------------- | ----------------------- | --------------------- | ---------------------------- | --------- | -------------------------------------- |
| Menu button                                            | 60, 141, 132, 132                                          | 44 x 44                 | L 20, top 47          | #1f1f1f                      | full      | OBSERVED                               |
| Assistant avatar and name overlay                      | about 548 to 737 wide (donut about 63 pt), name pill below | about 63 x 63 plus name | C, top 47             | donut #bbc1d1                | full      | ESTIMATED from the screenshot, blurred |
| Telephone button                                       | 1092, 141, 132, 132                                        | 44 x 44                 | R 20, top 47          | #212121                      | full      | OBSERVED                               |
| Attached file card (blurred, partly under the overlay) | about 50 to 1097 wide, y about 299 to 497                  | about 349 x 66          | L 16                  | dark, 3 px border            | about 20  | ESTIMATED                              |
| Bubble 1                                               | 48, 525, 1005, 1005                                        | 335 x 335               | L 16                  | #212121                      | about 25  | OBSERVED, radius ESTIMATED             |
| Date label                                             | 488, 1587, 306, 39                                         | 102 x 13                | C                     | #afafaf                      | none      | OBSERVED                               |
| Bubble 2                                               | 48, 1677, 1011, about 804                                  | 337 x 268               | L 16                  | #212121                      | about 25  | OBSERVED                               |
| Underlined link inside bubble 2                        | text underline, 3 px                                       | text                    | inline                | white                        | none      | OBSERVED                               |
| Composer pill                                          | 102, 2532, 1080, 144                                       | 360 x 48                | L 34, R 34, bottom 34 | #1f1f1f, 3 px border #2c2c2c | full      | OBSERVED                               |
| Plus icon                                              | 147, 2574, 60, 59                                          | 20 x 19.7               | inside pill, L 15     | #ffffff                      | icon      | OBSERVED                               |
| Placeholder "Message your <assistant name>"            | 259, 2581, 223 + 110 wide, 51                              | text                    | after plus            | #909090                      | none      | OBSERVED                               |
| Microphone icon                                        | 1081, 2568, 57, 72                                         | 19 x 24                 | R 14.7 inside pill    | #ffffff                      | icon      | OBSERVED                               |

#### Text

| Text                                      | Height px    | Est. size pt | Weight   | Colour  | Align                            | Status    |
| ----------------------------------------- | ------------ | ------------ | -------- | ------- | -------------------------------- | --------- |
| Message text (placeholder <message text>) | 40 (cap "H") | 19           | regular  | #ffffff | left, line pitch 66.5 px (22 pt) | ESTIMATED |
| "Today"                                   | cap about 31 | 14.7         | semibold | #afafaf | centre                           | ESTIMATED |
| "10:28 AM"                                | 31 (digit)   | 14.7         | regular  | #afafaf | centre                           | ESTIMATED |
| Assistant name below the avatar           | about 43     | 20           | semibold | #ffffff | centre                           | ESTIMATED |
| "Zip archive" (file type line)            | about 34     | 16           | regular  | #afafaf | left                             | ESTIMATED |

#### Spacing and notes

- Bubble text starts at x 101 px (33.7 pt) so padding is about 50 px (16.7 pt) from the bubble edge; the bubble stops about 231 px (77 pt) short of the right edge on bubble 1.
- Gap between bubble 1 bottom (1530 px) and the date label top (1587 px) is 57 px (19 pt); gap between the date label bottom (1626 px) and bubble 2 top (1677 px) is 51 px (17 pt).
- Bubbles have no visible tail, no action row and no timestamps inside the bubble. No action icons below the bubbles are visible in this screenshot.
- The composer sits in the bottom band without a keyboard; the bottom band background is #000000.
- The overlay at the top is a transition artifact of opening a voice call; its blur radius: UNKNOWN.

### 5. Voice call (IMG_1179 full screen, IMG_1180 compact card, IMG_1181 call ended)

IMG_1179 is the full-screen call (about 1 second in), IMG_1180 is the compact call card dropped over the chat (16 seconds in), and IMG_1181 is the chat after the call, with a call summary bubble. Dark theme for the card and chat; the full screen uses a blue gradient.

#### Layout, top to bottom (IMG_1179)

| Element                                  | Box px (x, y, w, h)                         | Size pt (w x h)  | Anchor                                                         | Fill or colour                                                                                                                        | Radius pt | Status                                            |
| ---------------------------------------- | ------------------------------------------- | ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------- |
| Background                               | full screen                                 | 428 x 926        | none                                                           | vertical and radial blue gradient: centre #2a3e5e, corners lighter greys such as #828a95 at the top left and #798290 at the top right | none      | OBSERVED at sample points, exact gradient UNKNOWN |
| Menu button                              | 60, 141, 132, 132                           | 44 x 44          | L 20, top 47                                                   | translucent light, about #99a2ae with a light ring                                                                                    | full      | OBSERVED                                          |
| Collapse button (diagonal arrows)        | 1092, 141, 132, 132                         | 44 x 44          | R 20, top 47                                                   | translucent, about #8591a1                                                                                                            | full      | OBSERVED                                          |
| Avatar donut                             | about 548 to 737 wide, y 142 to 328         | about 63 x 62    | C                                                              | #bbc1d1 ring, dark centre                                                                                                             | full      | ESTIMATED                                         |
| Assistant name                           | 598, 350, 88, 43                            | 29.3 x 14.3      | C, under the avatar                                            | #ffffff                                                                                                                               | none      | OBSERVED                                          |
| Timer "0:01"                             | 552, 534, 165, 66                           | 55 x 22          | C                                                              | #c9defc                                                                                                                               | none      | OBSERVED                                          |
| Audio button                             | circle 242 px, x 161 to 403, y 2243 to 2485 | 80.7 x 80.7      | centres at 94 pt, bottom 107 pt up from the screen bottom edge | translucent blue-grey, about #4f6484, with a light ring                                                                               | full      | OBSERVED                                          |
| End button                               | circle 242 px, x 521 to 763                 | 80.7 x 80.7      | C                                                              | #b4251b, red                                                                                                                          | full      | OBSERVED                                          |
| Mute button                              | circle 242 px, x 881 to 1123                | 80.7 x 80.7      | R 53.7 to the circle                                           | translucent, about #324665                                                                                                            | full      | OBSERVED                                          |
| Button labels "Audio", "End", "Mute"     | y 2506, h 39                                | text             | under each circle, 21 px (7 pt) gap                            | #ffffff                                                                                                                               | none      | OBSERVED                                          |
| Speaker icon                             | about 120 x 100 px inside the Audio circle  | about 40 x 33    | C of circle                                                    | #ffffff                                                                                                                               | icon      | ESTIMATED                                         |
| Telephone-down icon                      | inside End circle                           | about 25 pt wide | C of circle                                                    | #ffffff                                                                                                                               | icon      | ESTIMATED                                         |
| Orange dot (system microphone indicator) | about 906, 22, 14                           | about 5 pt       | top                                                            | orange, hex not read                                                                                                                  | full      | ESTIMATED                                         |

#### Layout (IMG_1180 compact call card)

| Element                             | Box px (x, y, w, h)                   | Size pt (w x h) | Anchor                | Fill or colour                       | Radius pt | Status                           |
| ----------------------------------- | ------------------------------------- | --------------- | --------------------- | ------------------------------------ | --------- | -------------------------------- |
| Call card                           | x about 27 to 1257, y about 28 to 862 | 410 x 278       | top, 9 from each side | #000000, thin light border           | about 44  | OBSERVED edges, radius ESTIMATED |
| Menu button                         | 120, 141, 132, 132                    | 44 x 44         | inside card           | #212121                              | full      | ESTIMATED from the screenshot    |
| Expand button (diagonal arrows out) | about 1032 to 1164, y 141             | 44 x 44         | inside card           | #212121                              | full      | ESTIMATED                        |
| Avatar and name                     | same placement as IMG_1179            | same            | C                     | same                                 | full      | OBSERVED                         |
| Timer "0:16"                        | 587, 499, 108, 40                     | 36 x 13.3       | C                     | #ffffff                              | none      | OBSERVED                         |
| Audio pill                          | 108, 639, 324, 144                    | 108 x 48        | inside card, L 36     | #fafafa, dark speaker icon           | full      | OBSERVED                         |
| End pill                            | 480, 639, 324, 144                    | 108 x 48        | C                     | #a02015                              | full      | OBSERVED                         |
| Mute pill                           | 852, 639, 324, 144                    | 108 x 48        | R 84                  | #212121, white muted microphone icon | full      | OBSERVED                         |

#### Layout (IMG_1181 chat after the call)

| Element                                                      | Box px (x, y, w, h)         | Size pt (w x h) | Anchor                                             | Fill or colour             | Radius pt | Status                     |
| ------------------------------------------------------------ | --------------------------- | --------------- | -------------------------------------------------- | -------------------------- | --------- | -------------------------- |
| Call summary bubble                                          | 344, 2120, 892, 293         | 297 x 97.7      | R 16                                               | #1c232f (dark navy)        | about 25  | OBSERVED, radius ESTIMATED |
| Bubble line 1 "0:19 · Call ended" with a telephone-down icon | text at y 2167, h 43        | text            | padding about 47 px (15.7 pt) from the bubble left | icon #728299, text #b1c6e5 | none      | OBSERVED                   |
| Bubble lines 2 and 3 (placeholder <call summary text>)       | y 2248, pitch 72 px (24 pt) | text            | same                                               | #b1c6e5                    | none      | OBSERVED                   |
| "Delivered"                                                  | 1004, 2435, 180, 32         | 60 x 10.7       | right edge x 1184 px (R 33)                        | #8d8d92                    | none      | OBSERVED                   |

#### Text

| Text                                 | Height px      | Est. size pt | Weight              | Colour  | Align  | Status    |
| ------------------------------------ | -------------- | ------------ | ------------------- | ------- | ------ | --------- |
| "0:01" (full screen)                 | 64 (digits)    | 30           | regular, light look | #c9defc | centre | ESTIMATED |
| "0:16" (card)                        | 40 (digits)    | 19           | regular             | #ffffff | centre | ESTIMATED |
| Button labels "Audio", "End", "Mute" | 37 to 39 (cap) | 17.5 to 18.5 | regular             | #ffffff | centre | ESTIMATED |
| Assistant name                       | 43 (ascender)  | about 19     | semibold            | #ffffff | centre | ESTIMATED |
| Call summary lines                   | 43 (digits)    | 19           | regular             | #b1c6e5 | left   | ESTIMATED |
| "Delivered"                          | 32 (cap)       | 15           | regular             | #8d8d92 | right  | ESTIMATED |

#### Spacing and notes

- IMG_1179: the three call buttons sit on a 360 px (120 pt) pitch with 118 px (39 pt) between circles; their bottom edge is 293 px (97.7 pt) above the screen bottom (circle bottom 2485 px, label bottom 2545 px).
- Button fills are translucent over the gradient; hex values are the colours read at one sample and vary across the gradient. A thin lighter ring surrounds each translucent circle (about 3 px).
- IMG_1180: the card has a black fill with the status bar inside it; the chat behind shows through below the card bottom. The compact buttons are pills, the full screen buttons are circles.
- IMG_1181: the summary bubble is right aligned and takes the place of a user bubble; its text has a 10 px (3.3 pt) larger gap after the first line than between the later lines. The date label and earlier bubbles match screen 4.

### 6. Search (IMG_1182)

The search page with the keyboard open and an empty state. Dark theme. The search field sits above the keyboard with a circular close button.

#### Layout, top to bottom

| Element                                              | Box px (x, y, w, h)              | Size pt (w x h)   | Anchor                     | Fill or colour               | Radius pt | Status                                |
| ---------------------------------------------------- | -------------------------------- | ----------------- | -------------------------- | ---------------------------- | --------- | ------------------------------------- |
| Magnifier icon (empty state)                         | 606, 581, 73, 73                 | 24.3 x 24.3       | C, top 194                 | #cdcdcd                      | icon      | OBSERVED                              |
| Empty state text "Search chats, files, and projects" | 242 to 1044, y 743, h 43 to 53   | 267 x 14.3        | C                          | #ffffff                      | none      | OBSERVED                              |
| Search field                                         | 37, 1557, 1030, 144              | 343 x 48          | L 12, above keyboard 13    | #202020 with a 3 px border   | full      | OBSERVED, left and right from the bar |
| Field magnifier                                      | 120, 1601, 29, 58 area           | about 20 pt       | inside field, L 20         | #ffffff                      | icon      | OBSERVED                              |
| Field placeholder "Search"                           | 184, 1607, 170, 43               | 56.7 x 14.3       | after the icon             | #5c5c5f                      | none      | OBSERVED                              |
| Close button (cross)                                 | 1104, 1557, 144, 144             | 48 x 48           | R 12                       | #1f1f1f                      | full      | OBSERVED                              |
| Keyboard container                                   | y 1741 to 2756, x 0 to 1284      | 428 x 338         | bottom 0                   | #1f1f1f, rounded top corners | about 40  | OBSERVED, radius ESTIMATED            |
| Suggestion bar (3 empty slots with 2 dividers)       | y 1741 to 1893                   | 428 x 50.7        | top of the keyboard        | #1f1f1f                      | none      | OBSERVED                              |
| Letter key                                           | e.g. 20 to 128 wide at y 1893    | 36 x 43 to 45     | row 1 starts at L 6.7      | #434343                      | about 8   | OBSERVED size, radius ESTIMATED       |
| Key row pitch                                        | 168 px                           | 56                | none                       | none                         | none      | OBSERVED                              |
| Key column pitch (Q to W)                            | about 126 px                     | 42                | none                       | none                         | none      | OBSERVED                              |
| Search action key                                    | right of the space bar           | about 148 x 96 px | R 6                        | blue, hex not read           | about 8   | ESTIMATED from the screenshot         |
| Emoji and dictation icons                            | bottom row, y about 2610 to 2650 | about 20 pt       | emoji L 21, dictation R 20 | #ffffff                      | icon      | ESTIMATED                             |

#### Text

| Text                                | Height px | Est. size pt | Weight  | Colour  | Align  | Status    |
| ----------------------------------- | --------- | ------------ | ------- | ------- | ------ | --------- |
| "Search chats, files, and projects" | 43 (cap)  | 20           | regular | #ffffff | centre | ESTIMATED |
| "Search" placeholder                | 43 (cap)  | 20           | regular | #5c5c5f | left   | ESTIMATED |

#### Spacing and notes

- The page has no title and no header controls; the status bar is the only element above the empty state.
- The field sits 40 px (13 pt) above the keyboard top. It is not pinned to the bottom edge, it rides on the keyboard.
- Keyboard keys: gap between keys 18 px (6 pt); key labels about 24 pt. These are system-keyboard values and are reported as seen.

### 7. Account and settings sheet (IMG_1183, IMG_1184, IMG_1185 first account; IMG_1198, IMG_1199, IMG_1200 second account)

A full-height scrolling settings page with a floating close button, reached from the drawer avatar. IMG_1183 is the top (avatar, name, upgrade card, "Customize ChatGPT" card, start of "Account"). IMG_1184 is scrolled to the end of "Account", "Theme" and the start of "App settings". IMG_1185 is the bottom ("Get help" and "Log out"). IMG_1198 to IMG_1200 repeat the three positions for a second, free account; they differ only in text: Subscription reads "Free" instead of "Pro", the App settings list reads "Remote control" instead of "Codex", has no "Cloud browser" row, and ends with an extra "Ads controls" row. The close button stays fixed at the top right while the page scrolls under it.

#### Layout, top to bottom (IMG_1183)

| Element                                                      | Box px (x, y, w, h)                      | Size pt (w x h) | Anchor                                | Fill or colour  | Radius pt | Status                     |
| ------------------------------------------------------------ | ---------------------------------------- | --------------- | ------------------------------------- | --------------- | --------- | -------------------------- |
| Close button (cross)                                         | 1092, 141, 132, 132                      | 44 x 44         | R 20, top 47, fixed                   | #3a3a3c         | full      | OBSERVED                   |
| Avatar circle with initials                                  | 534, 303, 216, 216                       | 72 x 72         | C, top 101                            | #7f8c8d         | full      | OBSERVED                   |
| Edit badge (pencil)                                          | about 705 to 810, y 457 to 563 (display) | about 24 x 24   | bottom right of the avatar            | #2c2c2c, border | full      | ESTIMATED                  |
| Name                                                         | 399, 553, 487, 55                        | 162 x 18        | C, 34 px (11 pt) under the avatar     | #ffffff         | none      | OBSERVED                   |
| Upgrade card                                                 | 60, 684, 1164, 283                       | 388 x 94        | L 20, R 20                            | #212121         | about 26  | OBSERVED, radius ESTIMATED |
| Upgrade card title "Do more with ChatGPT"                    | 136, 742, 529, 39                        | 176 x 13        | inside card, L 25                     | #ffffff         | none      | OBSERVED                   |
| Upgrade card description (2 lines)                           | 135, 814 and 135, 874                    | text            | line pitch 60 px (20 pt)              | #cdcdcd         | none      | OBSERVED                   |
| "Upgrade" button                                             | 852, 766, 300, 120                       | 100 x 40        | inside card, R 24                     | #ffffff         | full      | OBSERVED                   |
| Section heading "Customize ChatGPT"                          | 123, 1072, 530, 45                       | 177 x 15        | L 41                                  | #afafaf         | none      | OBSERVED                   |
| Card "Customize ChatGPT" (3 rows)                            | 60, 1161, 1164, 486                      | 388 x 162       | L 20, R 20                            | #1c1c1e         | about 26  | OBSERVED                   |
| Row icon                                                     | 129, 1212, 61, 61                        | 20.3 x 20.3     | inside card, L 23                     | white outline   | icon      | OBSERVED                   |
| Row label                                                    | 240, 1220, 377, 43                       | 125.7 x 14.3    | label left 80 pt from the screen edge | #ffffff         | none      | OBSERVED                   |
| Chevron                                                      | 1131, 1222, 23, 40                       | 7.7 x 13.3      | right edge 70 px inside the card      | #59595e         | icon      | OBSERVED                   |
| Section heading "Account"                                    | about 1742 to 1790                       | text            | L 41, 32.7 pt under the previous card | #afafaf         | none      | OBSERVED                   |
| Account card, first row (two lines: "Email" and the address) | y 1828 to 2065                           | 388 x 79        | L 20                                  | #1c1c1e         | about 26  | OBSERVED                   |
| Value text "<email>"                                         | 123, 1966, 722, 53                       | text            | card L plus 63 px (21 pt)             | #98989f         | none      | OBSERVED                   |
| Phone row value (placeholder <phone number>)                 | 775, 2128, 383, 42                       | 127.7 x 14      | right edge 1158 px (R 42)             | #98989f         | none      | OBSERVED                   |

#### Layout (IMG_1184 and IMG_1185, what differs or adds)

| Element                                                         | Box px (x, y, w, h)                 | Size pt (w x h) | Anchor                          | Fill or colour | Radius pt | Status   |
| --------------------------------------------------------------- | ----------------------------------- | --------------- | ------------------------------- | -------------- | --------- | -------- |
| Value "System" (Appearance row)                                 | 924, 865, 182, 52                   | 60.7 x 17.3     | right of the row                | #98989e        | none      | OBSERVED |
| Up and down stepper icon                                        | 1128, 865, 29, 43                   | 9.7 x 14.3      | right edge 1157 px (R 42)       | #98989e        | icon      | OBSERVED |
| Accent colour dot                                               | 908, 1029, 38, 38                   | 12.7 x 12.7     | before the value "White"        | #ffffff        | full      | OBSERVED |
| Section heading "Theme"                                         | text                                | L 41            | 32.7 pt under the previous card | #afafaf        | none      | OBSERVED |
| Card "Theme" (2 rows)                                           | 60, 805 to 1129                     | 388 x 108       | L 20, R 20                      | #1c1c1d        | about 26  | OBSERVED |
| Card "App settings" (10 rows in IMG_1184 and IMG_1185 combined) | rows of 159 px plus 3 px separators | each 54         | L 20, R 20                      | #1c1c1d        | about 26  | OBSERVED |
| Section heading "Get help"                                      | 231, 1615 (the text "help"), h 52   | text            | L 41                            | #afafaf        | none      | OBSERVED |
| Card "Get help" (4 rows)                                        | rows at 162 px pitch                | each 54         | L 20, R 20                      | #1c1c1d        | about 26  | OBSERVED |
| "Log out" card                                                  | y 2454 to 2616                      | 388 x 54        | L 20, R 20                      | #1c1c1d        | about 26  | OBSERVED |
| Log out icon                                                    | 132, 2508, 54, 55                   | 18 x 18.3       | inside card, L 23               | #d3301d        | icon      | OBSERVED |
| Log out label                                                   | 240, 2514                           | text            | label left 80 pt                | #d3301d        | none      | OBSERVED |
| Scroll indicator                                                | 1266, 1677, 9, 932                  | 3 x 310.7       | R 3                             | #7f7f7f        | full      | OBSERVED |

#### Text

| Text                                                                                                                                                                                                                                                                                                                                                                                                                                    | Height px                | Est. size pt | Weight   | Colour                     | Align  | Status    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------ | -------- | -------------------------- | ------ | --------- |
| Name (placeholder <user name>)                                                                                                                                                                                                                                                                                                                                                                                                          | 45                       | 21           | semibold | #ffffff                    | centre | ESTIMATED |
| "Do more with ChatGPT"                                                                                                                                                                                                                                                                                                                                                                                                                  | 37 (cap)                 | 17.5         | medium   | #ffffff                    | left   | ESTIMATED |
| "Get higher limits and access to advanced features."                                                                                                                                                                                                                                                                                                                                                                                    | 34 (ascender)            | 15           | regular  | #cdcdcd                    | left   | ESTIMATED |
| "Upgrade"                                                                                                                                                                                                                                                                                                                                                                                                                               | about 43 (cap)           | 20           | medium   | #0d0d0d                    | centre | ESTIMATED |
| Section headings "Customize ChatGPT", "Account", "Theme", "App settings", "Get help"                                                                                                                                                                                                                                                                                                                                                    | 43 to 45                 | 20 to 21     | semibold | #afafaf                    | left   | ESTIMATED |
| Row labels: "Personalization", "Memory", "Plugins", "Email", "Phone number", "Switch account", "Subscription", "Restore purchases", "Age", "Usage and limits", "Appearance", "Accent color", "General", "Notifications", "Voice", "Parental controls", "Trusted contact", "Safety", "Security and login", "Codex", "Cloud browser", "Storage", "Data controls", "Report app issue", "Help Center", "Privacy Center", "About", "Log out" | 43 (cap)                 | 20           | regular  | #ffffff, "Log out" #d3301d | left   | ESTIMATED |
| Second line values in two-line rows (<email>, <user name>)                                                                                                                                                                                                                                                                                                                                                                              | x-height 30, ascender 41 | 18           | regular  | #98989f                    | left   | ESTIMATED |
| Row values ("Pro", "18 or older", "System", "White")                                                                                                                                                                                                                                                                                                                                                                                    | 42 to 43                 | 20           | regular  | #98989f                    | right  | ESTIMATED |

#### Spacing and notes

- Card gaps: 98 px (32.7 pt) between a card bottom and the next section heading cap line; heading to its card 44 px (14.7 pt).
- Two-line rows (Email, Switch account) are 237 px (79 pt); all other rows 159 px plus a 3 px separator (54 pt). The row separator starts 58 pt inside the card and stops 20 pt short of its right edge. A separator under the last row of a card is not drawn.
- The close button is fixed and overlaps scrolled content; rows pass under it without a blur in IMG_1184 and IMG_1185 (the button fill is solid enough that no content shows through).
- Content above the sheet (the status bar area) shows blurred scrolled content (IMG_1184, IMG_1185, IMG_1199, IMG_1200); blur radius: UNKNOWN.
- The Log out card has the same size as a settings row and red icon and label; there is 98 px (32.7 pt) between the "Get help" card and the Log out card.
- IMG_1198 to IMG_1200: positions are the same as IMG_1183 to IMG_1185 with the status bar time reading a later time; IMG_1199 starts 20 px lower than IMG_1184 because it is scrolled to a different offset.

### 8. Change your email dialog (IMG_1189)

A centred confirmation dialog over the account sheet. The sheet behind is dimmed.

#### Layout, top to bottom

| Element                                    | Box px (x, y, w, h)       | Size pt (w x h) | Anchor                         | Fill or colour                                        | Radius pt | Status                        |
| ------------------------------------------ | ------------------------- | --------------- | ------------------------------ | ----------------------------------------------------- | --------- | ----------------------------- |
| Dimmed sheet behind                        | full screen               | 428 x 926       | none                           | cards read #0e0e0f (from #1c1c1e), avatar fill darker | none      | OBSERVED                      |
| Dialog                                     | about 164, 1098, 956, 623 | 318.7 x 207.7   | C horizontally                 | translucent #252525 to #2a2a2b, light edge            | about 30  | OBSERVED, radius ESTIMATED    |
| Title "Change your email"                  | 255, 1186, about 290, 44  | text            | inside dialog, L 30, top 29    | #ffffff                                               | none      | OBSERVED                      |
| Body, 3 lines (placeholder <email> inside) | 254, 1285, 663 wide       | text            | line pitch about 66 px (22 pt) | #79797a                                               | none      | OBSERVED                      |
| "Cancel" button                            | 210, 1530, 420, 142       | 140 x 47.3      | inside dialog                  | #464647 to #4c4c4d                                    | full      | OBSERVED                      |
| "Continue" button                          | 656, 1530, 417, 142       | 139 x 47.3      | inside dialog                  | same                                                  | full      | ESTIMATED from the screenshot |

#### Text

| Text                                                      | Height px | Est. size pt | Weight   | Colour  | Align  | Status    |
| --------------------------------------------------------- | --------- | ------------ | -------- | ------- | ------ | --------- |
| "Change your email"                                       | 44        | 21           | semibold | #ffffff | left   | ESTIMATED |
| Body "To change <email>, continue to ChatGPT on the web." | 36 (cap)  | 17           | regular  | #79797a | left   | ESTIMATED |
| "Cancel", "Continue"                                      | 44        | 20           | medium   | #ffffff | centre | ESTIMATED |

#### Spacing and notes

- Dialog horizontal margin from the screen edge: 164 px (54.7 pt) left and 164 px right. Buttons sit side by side with a gap of about 26 px (8.7 pt) and 46 px (15 pt) from the dialog sides.
- No dim scrim colour other than the darkened content is readable; scrim opacity: UNKNOWN.

### 9. Switch account sheet (IMG_1194)

A bottom sheet opened from the "Switch account" row, over the dimmed account sheet.

#### Layout, top to bottom

| Element                        | Box px (x, y, w, h)                      | Size pt (w x h) | Anchor                              | Fill or colour                 | Radius pt                         | Status                        |
| ------------------------------ | ---------------------------------------- | --------------- | ----------------------------------- | ------------------------------ | --------------------------------- | ----------------------------- |
| Sheet                          | x about 24 to 1260, y about 1847 to 2749 | 412 x 301       | bottom about 10, sides about 9      | translucent #202020 to #222222 | about 23 (top and bottom corners) | ESTIMATED from the screenshot |
| Grabber                        | 555, 1865, 174, 11                       | 58 x 3.7        | C, 6 pt under the sheet top         | #67676a                        | full                              | OBSERVED                      |
| Header "<email>"               | 112, 1962, 830, 60                       | 276.7 x 20      | inside sheet, L 37                  | #ffffff                        | none                              | OBSERVED                      |
| More (dots) icon               | 1063, 1980, 74, 16                       | 24.7 x 5.3      | R 49                                | #ffffff                        | icon                              | OBSERVED                      |
| Account row highlight          | about 77 to 1207, y 2072 to 2298         | 377 x 75        | inside sheet                        | #3a3a3a translucent            | full                              | ESTIMATED from the screenshot |
| Avatar circle                  | 111, 2111, 151, 151                      | 50.3 x 50.3     | inside row                          | #818b8d                        | full                              | OBSERVED                      |
| Name (placeholder <user name>) | 299, 2130, 270 + 169, 51                 | text            | 37 px (12.3 pt) right of the avatar | #ffffff                        | none                              | OBSERVED                      |
| Plan "Pro"                     | 301, 2199, 76, 40                        | 25.3 x 13.3     | under the name                      | #949495                        | none                              | OBSERVED                      |
| Check mark                     | 1077, 2165, 47, 43                       | 15.7 x 14.3     | right edge 1124 px                  | #ffffff                        | icon                              | OBSERVED                      |
| Add account plus circle        | about 151 px circle at x 111             | 50 x 50         | inside sheet                        | #3a3a3a                        | full                              | ESTIMATED                     |
| Plus glyph                     | 149, 2477, 74, 74                        | 24.7 x 24.7     | C of the circle                     | #ffffff                        | icon                              | OBSERVED                      |
| "Add account" label            | 298, 2492, 313 wide, 42                  | text            | after the circle                    | #ffffff                        | none                              | OBSERVED                      |

#### Text

| Text             | Height px                  | Est. size pt | Weight   | Colour  | Align | Status    |
| ---------------- | -------------------------- | ------------ | -------- | ------- | ----- | --------- |
| Header "<email>" | 60 (ascender to descender) | about 20     | semibold | #ffffff | left  | ESTIMATED |
| Name             | 43 (cap)                   | 20           | medium   | #ffffff | left  | ESTIMATED |
| "Pro"            | 40 (cap)                   | 19           | regular  | #949495 | left  | ESTIMATED |
| "Add account"    | 42                         | 20           | regular  | #ffffff | left  | ESTIMATED |

#### Spacing and notes

- The sheet sits on a floating inset (it does not touch the screen edges), so its top corners and bottom corners both round. Gap from the sheet bottom to the screen bottom: about 29 px (9.7 pt), estimated from the screenshot.
- Row spacing between the account row bottom and the "Add account" row centre: about 180 px (60 pt).

### 10. Personalization page (IMG_1186)

A settings sub-page reached from the account sheet. Back button instead of the menu button. Dark theme, no title blur. It contains a standalone row card, a five-row card of drop-down values, a text field, a toggle card and an "Advanced" row.

#### Layout, top to bottom

| Element                                | Box px (x, y, w, h)                              | Size pt (w x h) | Anchor                    | Fill or colour              | Radius pt      | Status    |
| -------------------------------------- | ------------------------------------------------ | --------------- | ------------------------- | --------------------------- | -------------- | --------- |
| Back button (chevron left)             | 60, 141, 132, 132                                | 44 x 44         | L 20, top 47              | #1f1f1f                     | full           | OBSERVED  |
| Title "Personalization"                | centred, cap 42                                  | 20              | C                         | #ffffff                     | none           | OBSERVED  |
| "Reference photos" card                | 60, 408, 1164, 162                               | 388 x 54        | L 20, R 20, top 136       | #1c1c1e                     | about 27, pill | OBSERVED  |
| Value "Add"                            | 991, 467, 97, 43                                 | 32.3 x 14.3     | right, before the chevron | #8e8e8f                     | none           | OBSERVED  |
| Caption under the card (2 lines)       | 123, 604, 392 + 182, 96                          | text            | L 41                      | #8d8d93                     | none           | OBSERVED  |
| Five-row card (style and tone)         | 60, 792, 1164, 810                               | 388 x 270       | L 20, R 20                | #1c1c1e                     | about 26       | OBSERVED  |
| Row value with stepper (e.g. "Less")   | 907, 851, 201, 43                                | 67 x 14.3       | right, before the stepper | #afafaf                     | none           | OBSERVED  |
| Stepper icon                           | 1128, 852, 29, 43                                | 9.7 x 14.3      | R 42                      | #afafaf                     | icon           | OBSERVED  |
| Heading "Custom instructions"          | 123, 1714 (word "instructions" starts 343), h 45 | text            | L 41                      | #ffffff                     | none           | OBSERVED  |
| Text field                             | 60, 1803, 1164, 162                              | 388 x 54        | L 20, R 20                | #1c1c1e                     | about 27, pill | OBSERVED  |
| Placeholder "e.g., Keep answers brief" | 111, 1862                                        | text            | inside field, L 37        | #afafaf                     | none           | OBSERVED  |
| Toggle card "Fast answers"             | 60, 2037, 1164, 174                              | 388 x 58        | L 20, R 20                | #1c1c1e                     | about 29, pill | OBSERVED  |
| Toggle (off)                           | 981, 2082, 189, 84                               | 63 x 28         | inside card, R 18         | track #59595e, knob #f8f8f8 | full           | OBSERVED  |
| Caption under the toggle (3 lines)     | y about 2250 to 2370                             | text            | L 29                      | #656569 to #8d8d93          | none           | ESTIMATED |
| "Advanced" card                        | 60, 2487, 1164, 162                              | 388 x 54        | L 20, R 20                | #1c1c1e                     | about 27       | OBSERVED  |
| Chevron                                | right edge 1154 px                               | 7.7 x 13.3      | R 43                      | #ffffff                     | icon           | OBSERVED  |

#### Text

| Text                                                                                                                                  | Height px    | Est. size pt | Weight   | Colour  | Align                          | Status    |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------ | -------- | ------- | ------------------------------ | --------- |
| "Personalization"                                                                                                                     | 42 (cap)     | 20           | semibold | #ffffff | centre                         | ESTIMATED |
| Row labels ("Reference photos", "Base style and tone", "Warmth", "Enthusiasm", "Emoji", "Visual answers", "Fast answers", "Advanced") | 43           | 20           | regular  | #ffffff | left                           | ESTIMATED |
| Row values ("Add", "Efficient", "Less", "Default")                                                                                    | 43           | 20           | regular  | #afafaf | right                          | ESTIMATED |
| "Custom instructions"                                                                                                                 | 45           | 21           | semibold | #ffffff | left                           | ESTIMATED |
| Captions                                                                                                                              | 32 (cap "L") | 15           | regular  | #8d8d93 | left, line pitch 54 px (18 pt) | ESTIMATED |

#### Spacing and notes

- Card top at 408 px (136 pt) sits 135 px (45 pt) under the header circle bottom (273 px). Gap between a card and its caption: 34 px (11.3 pt); caption to next card: about 80 px (26.7 pt).
- Rows in the five-row card: 162 px (54 pt) including a 3 px separator. The separators run from x 121 to x 1163 px, so they are inset 20 pt on both sides of the card; this differs from the account sheet (screen 7), where the separator starts 58 pt inside the card and has a 20 pt right inset only.

### 11. Memory page (IMG_1187)

A settings sub-page with a toggle card, a link row, helper text and three text-field sections. Dark theme.

#### Layout, top to bottom

| Element                                             | Box px (x, y, w, h)               | Size pt (w x h) | Anchor                         | Fill or colour                            | Radius pt | Status   |
| --------------------------------------------------- | --------------------------------- | --------------- | ------------------------------ | ----------------------------------------- | --------- | -------- |
| Back button                                         | 60, 141, 132, 132                 | 44 x 44         | L 20, top 47                   | #1f1f1f                                   | full      | OBSERVED |
| Title "Memory"                                      | centred                           | text            | C                              | #ffffff                                   | none      | OBSERVED |
| "Enable memory" card                                | 60, 408, 1164, 162                | 388 x 54        | L 20, R 20                     | #1c1c1e                                   | about 27  | OBSERVED |
| Toggle (on)                                         | 981, 447 to 531, 189 x 84         | 63 x 28         | R 18 inside card               | track #30d158, knob #ffffff (111 px wide) | full      | OBSERVED |
| Helper text (3 lines)                               | 123, 604                          | text            | L 41, line pitch 54 px (18 pt) | #8d8d93 with link text in blue            | none      | OBSERVED |
| "Memory summary" card                               | 60, 827, 1164, 171                | 388 x 57        | L 20, R 20                     | #1c1c1e                                   | about 29  | OBSERVED |
| Chevron                                             | 1118, 897, 18, 31                 | 6 x 10.3        | R 49                           | #98989f                                   | icon      | OBSERVED |
| Helper text (4 lines)                               | after the card                    | text            | L 41                           | #8d8d93, links blue                       | none      | OBSERVED |
| Section heading "Your nickname"                     | text                              | L 41            | #ffffff                        | none                                      | OBSERVED  |
| Text field                                          | 60, 1385, 1164, 162               | 388 x 54        | L 20, R 20                     | #1c1c1e                                   | about 27  | OBSERVED |
| Placeholder "Name"                                  | 107, 1446, 140, 41                | text            | inside field, L 35.7           | #afafaf                                   | none      | OBSERVED |
| Section heading "Your occupation"                   | 258 (word "occupation") 1296 area | text            | L 41                           | #ffffff                                   | none      | OBSERVED |
| Text field                                          | 60, 1728, 1164, 162               | 388 x 54        | L 20, R 20                     | #1c1c1e                                   | about 27  | OBSERVED |
| Section heading "More about you"                    | text                              | L 41            | #ffffff                        | none                                      | OBSERVED  |
| Text field (placeholder truncates with an ellipsis) | 60, 2072 to 2234, 162             | 388 x 54        | L 20, R 20                     | #1c1c1e                                   | about 27  | OBSERVED |

#### Text

| Text                                                                                             | Height px    | Est. size pt | Weight   | Colour                             | Align  | Status    |
| ------------------------------------------------------------------------------------------------ | ------------ | ------------ | -------- | ---------------------------------- | ------ | --------- |
| "Memory"                                                                                         | 42 (cap)     | 20           | semibold | #ffffff                            | centre | ESTIMATED |
| "Enable memory", "Memory summary"                                                                | 43           | 20           | regular  | #ffffff                            | left   | ESTIMATED |
| Helper text                                                                                      | 32 (cap "L") | 15           | regular  | #8d8d93, links blue (hex not read) | left   | ESTIMATED |
| Section headings                                                                                 | 43 to 45     | 20 to 21     | semibold | #ffffff                            | left   | ESTIMATED |
| Placeholders "Name", "Engineer, student, etc.", "Interests, values, or preferences to keep i..." | 41 to 43     | 19 to 20     | regular  | #afafaf                            | left   | ESTIMATED |

#### Spacing and notes

- Section heading to field: about 33 px (11 pt) of free space under the heading; field to next heading about 90 px (30 pt).
- The toggle track is 6 px higher than the card centre line because the card is 162 px high and the toggle 84 px; it is centred (card centre 489 px, toggle centre 489 px).

### 12. Plugins page (IMG_1188)

A settings sub-page with a "Permissions" row card, a heading "Added" and a long list card of plugin rows; a floating search bar overlays the bottom. Dark theme.

#### Layout, top to bottom

| Element                                 | Box px (x, y, w, h)                                           | Size pt (w x h)  | Anchor                          | Fill or colour                            | Radius pt | Status                          |
| --------------------------------------- | ------------------------------------------------------------- | ---------------- | ------------------------------- | ----------------------------------------- | --------- | ------------------------------- |
| Back button                             | 60, 141, 132, 132                                             | 44 x 44          | L 20, top 47                    | #1f1f1f                                   | full      | OBSERVED                        |
| Title "Plugins"                         | centred                                                       | text             | C                               | #ffffff                                   | none      | OBSERVED                        |
| "Permissions" card                      | 60, 408, 1164, 162                                            | 388 x 54         | L 20, R 20                      | #1c1c1e                                   | about 27  | OBSERVED                        |
| Value text "Allow low-risk"             | 742, 467, 349 wide, 43                                        | text             | before the chevron              | #98989f                                   | none      | OBSERVED                        |
| Caption (2 lines)                       | 123, about 590                                                | text             | L 41                            | #8d8d93                                   | none      | OBSERVED                        |
| Heading "Added"                         | text                                                          | L 41             | #ffffff                         | none                                      | OBSERVED  |
| List card                               | 60, 849 and running past the bottom                           | 388 x scroll     | L 20, R 20                      | #1c1c1e                                   | about 26  | OBSERVED                        |
| Plugin row                              | 159 px plus 3 px separator                                    | 54               | inside card                     | none                                      | none      | OBSERVED                        |
| Plugin icon                             | 124, 894, 72, 72                                              | 24 x 24          | inside card, L 21.3             | app icon colours, e.g. #f8ff2c            | about 18  | OBSERVED size, radius ESTIMATED |
| Plugin name (placeholder <plugin name>) | 237, 908, 215, 52                                             | text             | icon right plus 41 px (13.7 pt) | #ffffff                                   | none      | OBSERVED                        |
| Chevron                                 | 1131, 910, 23, 40                                             | 7.7 x 13.3       | R 43                            | #59595e                                   | icon      | OBSERVED                        |
| Floating search bar                     | x 83 to 1201, y 2559 to 2690 (about 2552 to 2694 with border) | 372.7 x 44 to 47 | L 27.7, R 27.7, bottom 29       | translucent #3e3e41 over #1b1b1d, blurred | full      | OBSERVED, blur UNKNOWN          |

#### Text

| Text                                                                        | Height px | Est. size pt | Weight   | Colour  | Align  | Status    |
| --------------------------------------------------------------------------- | --------- | ------------ | -------- | ------- | ------ | --------- |
| "Plugins"                                                                   | 42 (cap)  | 20           | semibold | #ffffff | centre | ESTIMATED |
| "Permissions"                                                               | 43        | 20           | regular  | #ffffff | left   | ESTIMATED |
| "Allow low-risk"                                                            | 43        | 20           | regular  | #98989f | right  | ESTIMATED |
| Caption "Choose when ChatGPT should ask for permission when using plugins." | 32 (cap)  | 15           | regular  | #8d8d93 | left   | ESTIMATED |
| "Added"                                                                     | 43        | 20           | semibold | #ffffff | left   | ESTIMATED |
| Plugin names                                                                | 43        | 20           | regular  | #ffffff | left   | ESTIMATED |
| "Search plugins"                                                            | about 43  | 20           | regular  | #98989f | left   | ESTIMATED |

#### Spacing and notes

- The list card scrolls under the floating search bar, which shows list text blurred through it (the "Firecrawl" and "GitHub" rows in the screenshot are cut by the bar).
- Row pitch inside the long card is 162 px (54 pt), the same as the settings sheet.

### 13. Web sign-in page (IMG_1190)

A web view with a browser-style bottom bar, opened from the "Continue" button of the email dialog. Dark theme. The status bar shows a back link "ChatGPT" under the time (system back-to-app link). The page is the hosted sign-in page.

#### Layout, top to bottom

| Element                                   | Box px (x, y, w, h)                                             | Size pt (w x h)             | Anchor                                 | Fill or colour               | Radius pt | Status                               |
| ----------------------------------------- | --------------------------------------------------------------- | --------------------------- | -------------------------------------- | ---------------------------- | --------- | ------------------------------------ |
| Back-to-app link                          | 38, 98, 176, 26                                                 | 58.7 x 8.7                  | L 12.7, y 33                           | #ffffff                      | none      | OBSERVED                             |
| Wordmark "ChatGPT"                        | 75, 217, 282, 53                                                | 94 x 17.7                   | L 25                                   | #ededed                      | none      | OBSERVED                             |
| Heading "Log in or sign up"               | 331 to 954 (glyph box), y 511 to 591                            | text                        | C                                      | #ededed                      | none      | OBSERVED                             |
| "Continue with Google" button             | x about 72 to 1212, y 657 to 813                                | 380 x 52                    | L 24, R 24                             | #000000, 3 px border #262626 | full      | OBSERVED, edges from the stroke runs |
| "Continue with Apple" button              | y 849 to 1005                                                   | 380 x 52                    | L 24, R 24                             | same                         | full      | OBSERVED                             |
| "Continue with phone" button              | y 1041 to 1197                                                  | 380 x 52                    | L 24, R 24                             | same                         | full      | OBSERVED                             |
| Divider with "OR"                         | lines 72 to 544 and 740 to 1212, y 1291; text 618, 1280, 48, 27 | 157 + 157 wide; text 16 x 9 | L 24, R 24                             | lines #262626, text #cdcdcd  | none      | OBSERVED                             |
| Email field                               | y 1389 to 1557, x 72 to 1212                                    | 380 x 56                    | L 24, R 24                             | #000000, 3 px border #333333 | full      | OBSERVED                             |
| Placeholder "Email address"               | about 98 px display (x 136 px)                                  | text                        | inside field, L 45                     | #cdcdcd                      | none      | OBSERVED                             |
| "Continue" button                         | 73, 1617, 1139, 156                                             | 379.7 x 52                  | L 24, R 24                             | #eff0ef                      | full      | OBSERVED                             |
| Button label "Continue"                   | 544, 1676, 197, 38                                              | 65.7 x 12.7                 | C                                      | #0d0d0d                      | none      | OBSERVED                             |
| Logo mark                                 | about 612 to 672, y 2073 to 2133 (display 442 to 482)           | about 20 x 20               | C                                      | #ededed                      | icon      | ESTIMATED                            |
| Links "Terms of use" and "Privacy policy" | y about 2180                                                    | text                        | C, underlined, with a vertical divider | #cdcdcd                      | none      | ESTIMATED                            |
| "Cookie preferences"                      | y about 2400                                                    | text                        | C                                      | #cdcdcd                      | none      | ESTIMATED                            |
| Back circle (browser bar)                 | 102, 2532, 144, 144                                             | 48 x 48                     | L 34, bottom 34                        | #212121                      | full      | OBSERVED                             |
| Address pill "<site address>"             | 270, 2532, 744, 144                                             | 248 x 48                    | between the circles, 8 pt gaps         | #212121                      | full      | OBSERVED                             |
| Tabs circle                               | 1038, 2532, 144, 144                                            | 48 x 48                     | R 34                                   | #212121                      | full      | OBSERVED                             |

#### Text

| Text                | Height px             | Est. size pt | Weight              | Colour                             | Align  | Status    |
| ------------------- | --------------------- | ------------ | ------------------- | ---------------------------------- | ------ | --------- |
| "ChatGPT" wordmark  | 53 (cap and ascender) | 25           | medium              | #ededed                            | left   | ESTIMATED |
| "Log in or sign up" | 63 (cap "L")          | 30           | regular             | #ededed                            | centre | ESTIMATED |
| Button labels       | about 38 (cap)        | 18           | regular             | #ededed on black, #0d0d0d on white | centre | ESTIMATED |
| "OR"                | 27 (cap)              | 12.8         | regular             | #cdcdcd                            | centre | ESTIMATED |
| "Email address"     | about 40              | 19           | regular             | #cdcdcd                            | left   | ESTIMATED |
| Legal links         | about 30 (cap)        | 14           | regular, underlined | #cdcdcd                            | centre | ESTIMATED |

#### Spacing and notes

- Gaps between the three provider buttons: 36 px (12 pt). Email field to the "Continue" button: 60 px (20 pt). "OR" divider to the email field: 82 px (27 pt).
- The status bar clock is shifted up by about 18 px (6 pt) compared with other screens because of the back-to-app link row.
- The browser bar uses three equal circles plus a long pill, all 48 pt high with 8 pt gaps; its band background is #000000 (no blur visible).

### 14. Face ID prompt (IMG_1195)

A full-width sheet over a keyboard (the keyboard from a previous screen is still visible at the bottom, and a system Face ID prompt rises from the bottom edge). Dark theme with a green-tinged black sheet.

#### Layout, top to bottom

| Element                              | Box px (x, y, w, h)                       | Size pt (w x h) | Anchor                      | Fill or colour      | Radius pt                   | Status                          |
| ------------------------------------ | ----------------------------------------- | --------------- | --------------------------- | ------------------- | --------------------------- | ------------------------------- |
| Sheet                                | x 0 to 1284, y 144 downward               | 428 wide        | top 48                      | #131511             | about 40 on the top corners | OBSERVED edge, radius ESTIMATED |
| Close button (cross)                 | 1092, 201, 132, 132                       | 44 x 44         | R 20, top 67                | #2d302b             | full                        | OBSERVED                        |
| Face ID icon                         | 594, 403, 97, 97                          | 32.3 x 32.3     | C                           | #e0e1e0             | icon                        | OBSERVED                        |
| Heading "Log in faster with Face ID" | 251 to 1034, y 569 to 634                 | 261 wide        | C                           | #e0e1e0             | none                        | OBSERVED                        |
| Description (2 lines)                | 251, 697 and 323, 766                     | text            | C, line pitch 69 px (23 pt) | #b4b4b4             | none                        | OBSERVED                        |
| "Continue" button                    | x 73 to 1211, y 1402 to 1564              | 379.3 x 54      | L 24, R 24                  | #dcdcdc to #e0e1e0  | full                        | OBSERVED                        |
| "Skip"                               | 591, 1640, 103, 51                        | 34.3 x 17       | C                           | #e0e1e0             | none                        | OBSERVED                        |
| Keyboard behind                      | y 1741 and below                          | see screen 6    | bottom 0                    | #1c1f1b             | about 40                    | OBSERVED                        |
| System prompt sheet                  | y about 2390 downward, x about 25 to 1259 | about 411 wide  | rising from the bottom      | #555755 translucent | about 50                    | ESTIMATED from the screenshot   |
| Close circle on the system prompt    | 1078, 2450 area, about 130 px             | about 43 x 43   | R 20                        | #686a68             | full                        | ESTIMATED                       |

#### Text

| Text                                                               | Height px    | Est. size pt | Weight  | Colour  | Align  | Status    |
| ------------------------------------------------------------------ | ------------ | ------------ | ------- | ------- | ------ | --------- |
| "Log in faster with Face ID"                                       | 51 (cap "D") | 24           | regular | #e0e1e0 | centre | ESTIMATED |
| "Get back to ChatGPT faster, with a quicker, more secure sign in." | 40 (cap "G") | 19           | regular | #b4b4b4 | centre | ESTIMATED |
| "Continue"                                                         | about 43     | 20           | medium  | #0d0d0d | centre | ESTIMATED |
| "Skip"                                                             | 51 (S to p)  | 20           | regular | #e0e1e0 | centre | ESTIMATED |

#### Spacing and notes

- The sheet heading top is 569 px (190 pt) from the screen top; the "Continue" button top is 1402 px (467 pt). The content is vertically distributed: icon, heading and description in the upper part, buttons in the lower part, with about 600 px (200 pt) of empty space between them.
- Gap between "Continue" bottom and "Skip" glyph top: 76 px (25 pt).

### 15. Codex area (IMG_1191 Cloud tab, IMG_1192 Connect computer tab, IMG_1193 menu open)

A second area of the app with a title "Codex" and a chevron, a search button, a two-option tab row ("Cloud", "Connect computer"), a recents list, and a composer. IMG_1192 shows the "Connect computer" empty state. IMG_1193 shows the title menu (a popover) open over the "Connect computer" state.

#### Layout, top to bottom (IMG_1191)

| Element                                     | Box px (x, y, w, h)                | Size pt (w x h) | Anchor                         | Fill or colour                        | Radius pt | Status   |
| ------------------------------------------- | ---------------------------------- | --------------- | ------------------------------ | ------------------------------------- | --------- | -------- |
| Menu button                                 | 60, 141, 132, 132                  | 44 x 44         | L 20, top 47                   | #1f1f1f                               | full      | OBSERVED |
| Title "Codex" plus chevron                  | 560, 185, 166 + 30, 43             | text            | C                              | #ffffff, chevron #cdcdcd (30 x 18 px) | none      | OBSERVED |
| Search button                               | 1092, 141, 132, 132                | 44 x 44         | R 20                           | #1f1f1f                               | full      | OBSERVED |
| Selected tab pill "Cloud"                   | 48, 339, 328, 132                  | 109.3 x 44      | L 16                           | #414141                               | full      | OBSERVED |
| Tab "Connect computer" text                 | 530, 384, 216, 42 plus icon at 454 | text            | after the Cloud pill           | #afafaf                               | none      | OBSERVED |
| Heading "Recents"                           | 65, 565, 209, 41                   | 69.7 x 13.7     | L 21.7                         | #ffffff                               | none      | OBSERVED |
| New task icon                               | 1148, 558, 55, 52                  | 18.3 x 17.3     | R 27                           | #afafaf                               | icon      | OBSERVED |
| Recent item rows                            | text height 43; pitch 162 px       | 54              | L 21.7                         | none                                  | none      | OBSERVED |
| Recent item text (placeholder <task title>) | x 62, y 722                        | text            | L 20.7                         | #ffffff                               | none      | OBSERVED |
| Composer pill                               | 102, 2532, 1080, 144               | 360 x 48        | L 34, R 34, bottom 34          | #1f1f1f                               | full      | OBSERVED |
| Placeholder "Ask Codex"                     | 263, 2582, 91 + 159, 43            | text            | after the plus                 | #828282                               | none      | OBSERVED |
| Microphone                                  | 939, 2569, 57, 72                  | 19 x 24         | inside pill                    | #ffffff                               | icon      | OBSERVED |
| Waveform button                             | 1058 to 1162, y 2552 to 2656       | 34.7 x 34.7     | right edge 6.7 inside the pill | #fdfdfd                               | full      | OBSERVED |

#### Layout (IMG_1192, what differs)

| Element                              | Box px (x, y, w, h)              | Size pt (w x h) | Anchor        | Fill or colour | Radius pt | Status                           |
| ------------------------------------ | -------------------------------- | --------------- | ------------- | -------------- | --------- | -------------------------------- |
| Selected tab pill "Connect computer" | about 399 to 1060, y 339 to 471  | about 220 x 44  | scrolling row | #414141        | full      | ESTIMATED from the screenshot    |
| Empty state icon (laptop with dots)  | 604, 1210, 76, 85                | 25.3 x 28.3     | C             | #ffffff        | icon      | OBSERVED                         |
| Heading "Connect your computer"      | 345, 1361 to 413, 556 + 386 wide | text            | C             | #ffffff        | none      | OBSERVED                         |
| Body, 3 lines                        | 315, 1452 and line pitch 65 px   | text            | C             | #afafaf        | none      | OBSERVED                         |
| "Scan QR code" button                | 397, 1682, 491, 129              | 163.7 x 43      | C             | #ffffff        | full      | OBSERVED                         |
| "Enter code manually"                | 390, 1891, 509 wide, 53          | text            | C             | #ffffff        | none      | OBSERVED                         |
| Composer                             | none                             | none            | none          | none           | none      | OBSERVED (not shown on this tab) |

#### Layout (IMG_1193 title menu popover)

| Element                                    | Box px (x, y, w, h)                                                  | Size pt (w x h)  | Anchor                                     | Fill or colour                         | Radius pt | Status                           |
| ------------------------------------------ | -------------------------------------------------------------------- | ---------------- | ------------------------------------------ | -------------------------------------- | --------- | -------------------------------- |
| Popover                                    | x 267 to 1017, y about 154 to 1712 (its lower part is mid-animation) | 250 x 519        | top 51, left 89, below the title           | translucent #2c2c2c over a dimmed page | about 40  | OBSERVED edges, radius ESTIMATED |
| Check mark (selected row)                  | 336, 375, 36, 35                                                     | 12 x 11.7        | inside popover, L 12                       | #f6f6f6                                | icon      | OBSERVED                         |
| Item icon                                  | 410 to 473, size 59 to 61 px                                         | 20 x 20          | inside popover, L 47.7                     | #f6f6f6                                | icon      | OBSERVED                         |
| Item label                                 | x 523 to 526                                                         | text             | after the icon, 17 px gap                  | #f6f6f6                                | none      | OBSERVED                         |
| Row pitch (single-line items)              | 139 to 140 px                                                        | 46.5             | none                                       | none                                   | none      | OBSERVED                         |
| Separator                                  | 351, 1478, 584, 3                                                    | 194.7 x 1        | inside the popover, 28 pt inset both sides | #434343                                | none      | OBSERVED                         |
| Group label "Manage" and "Usage remaining" | x 405, h 40                                                          | text             | L 45                                       | #6d6d6d                                | none      | OBSERVED                         |
| Selected-row highlight                     | blurred band, y 345 to 466                                           | about 40 pt tall | across the popover                         | #535353 blurred                        | full      | OBSERVED, blur UNKNOWN           |

#### Text

| Text                                                                                                                            | Height px                       | Est. size pt | Weight                                      | Colour                           | Align                              | Status    |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------ | ------------------------------------------- | -------------------------------- | ---------------------------------- | --------- |
| "Codex"                                                                                                                         | 43 (cap and ascender)           | 20           | semibold                                    | #ffffff                          | centre                             | ESTIMATED |
| Tabs "Cloud", "Connect computer"                                                                                                | 42 to 48                        | 20           | regular                                     | selected #ffffff, other #afafaf  | left of the pill                   | ESTIMATED |
| "Recents"                                                                                                                       | 41 (cap)                        | 19.5         | semibold                                    | #ffffff                          | left                               | ESTIMATED |
| Recent items                                                                                                                    | 43 (cap)                        | 20           | regular                                     | #ffffff                          | left                               | ESTIMATED |
| "Ask Codex"                                                                                                                     | 43 (cap)                        | 20           | regular                                     | #828282                          | left                               | ESTIMATED |
| "Connect your computer"                                                                                                         | 42 (cap)                        | 20           | regular                                     | #ffffff                          | centre                             | ESTIMATED |
| Body "Open the Codex desktop app and get a pairing code to continue your projects here."                                        | span 46 (ascender to descender) | 16           | regular                                     | #afafaf                          | centre, line pitch 65 px (21.7 pt) | ESTIMATED |
| "Scan QR code", "Enter code manually"                                                                                           | 42 to 43                        | 20           | medium for the button, regular for the link | #0d0d0d on white, white on black | centre                             | ESTIMATED |
| Popover items ("Priority", "By project", "Chronological list", "Recents first", "Archived tasks", "Add connection", "Settings") | 43 (cap)                        | 20           | regular                                     | #f6f6f6                          | left                               | ESTIMATED |
| "Manage", "Usage remaining"                                                                                                     | about 33 (cap)                  | 15.5         | regular                                     | #6d6d6d                          | left                               | ESTIMATED |
| "Week 0%"                                                                                                                       | about 43                        | 20           | regular                                     | #f6f6f6                          | left                               | ESTIMATED |

#### Spacing and notes

- IMG_1191: tab pills start 12 px (4 pt) higher than the Space and Scheduled pills (top 339 px versus 351 px). The list has no cards and no separators; rows are 162 px (54 pt) apart with text only.
- IMG_1193: the popover is anchored under the header title, its left edge 267 px (89 pt) from the screen left and its right edge 267 px from the right (centred). A two-line item ("Chronological list") wraps inside the popover. The bottom part of the popover is still animating, so the last row is cut at the "Scan QR code" button (y about 1711 px).
- The page behind the popover is not dimmed.

### 16. New chat home (IMG_1196)

The empty new chat screen with an "Upgrade" pill in the header, a chat-bubble button at the right, three suggestion rows above the composer and the composer at rest. Dark theme.

#### Layout, top to bottom

| Element                            | Box px (x, y, w, h)                   | Size pt (w x h)  | Anchor                | Fill or colour | Radius pt | Status   |
| ---------------------------------- | ------------------------------------- | ---------------- | --------------------- | -------------- | --------- | -------- |
| Menu button                        | 60, 141, 132, 132                     | 44 x 44          | L 20, top 47          | #1f1f1f        | full      | OBSERVED |
| Upgrade pill                       | 228, 141, 413, 132                    | 137.7 x 44       | L 76                  | #212121        | full      | OBSERVED |
| Sparkle icon                       | about 281 to 346, y 187 to 214        | 21.7 x 9 visible | inside pill, L 17.7   | #48aaff        | icon      | OBSERVED |
| Right button (chat bubble outline) | 1092, 141, 132, 132                   | 44 x 44          | R 20, top 47          | #1f1f1f        | full      | OBSERVED |
| Suggestion row 1                   | icon 91, 2093, 37, 63; text 188, 2104 | 49 pt pitch      | L 30 for icons        | text #cdcdcd   | none      | OBSERVED |
| Suggestion row 2                   | icon 83, 2245, 52, 52; text 187, 2249 | 49 pt pitch      | L 27.7                | #cdcdcd        | none      | OBSERVED |
| Suggestion row 3                   | icon 81, 2390, 55, 55; text 188, 2395 | 49 pt pitch      | L 27                  | #cdcdcd        | none      | OBSERVED |
| Composer pill                      | 102, 2532, 1080, 144                  | 360 x 48         | L 34, R 34, bottom 34 | #1f1f1f        | full      | OBSERVED |
| Waveform button                    | white circle 104 px                   | 34.7 x 34.7      | inside pill, right    | #f8f8f8        | full      | OBSERVED |

#### Text

| Text                                                                              | Height px | Est. size pt | Weight  | Colour  | Align            | Status    |
| --------------------------------------------------------------------------------- | --------- | ------------ | ------- | ------- | ---------------- | --------- |
| "Upgrade"                                                                         | 43        | 20           | medium  | #48aaff | left in the pill | ESTIMATED |
| Suggestions ("Write or edit", "Search the web", and one placeholder <suggestion>) | 43 (cap)  | 20           | regular | #cdcdcd | left             | ESTIMATED |
| "Ask ChatGPT"                                                                     | 43 (cap)  | 20           | regular | #828282 | left             | ESTIMATED |

#### Spacing and notes

- The suggestion rows have no card and no divider; the first row's icon is an emoji, the other two are outline icons (pencil, globe).
- Row pitch 147 px (49 pt) between row centres at y 2124, 2271 and 2418. The last row centre is 2418 px and the composer top 2532 px, so 114 px (38 pt) separates them.
- The centre of the page is empty (no logo or greeting).

### 17. Drawer (IMG_1197)

The left drawer open over the home screen, with the keyboard still visible under the pushed-aside main panel. Dark theme.

#### Layout, top to bottom

| Element                   | Box px (x, y, w, h)                                             | Size pt (w x h)          | Anchor                              | Fill or colour                    | Radius pt | Status                        |
| ------------------------- | --------------------------------------------------------------- | ------------------------ | ----------------------------------- | --------------------------------- | --------- | ----------------------------- |
| Title "ChatGPT"           | 99, 180, 306, 54                                                | 102 x 18                 | L 33                                | #ffffff                           | none      | OBSERVED                      |
| Search button             | about 787 to 917, y 141 to 273                                  | 44 x 44                  | inside drawer, right edge at 917 px | #1f1f1f                           | full      | OBSERVED                      |
| Nav row "Images"          | icon 103, 335, 68, 65; label 220, 348                           | row pitch 157 px (52 pt) | L 34                                | #fefefe                           | none      | OBSERVED                      |
| Nav row "Scheduled"       | icon 104, 494, 63, 63; label 218, 503                           | same                     | L 34                                | #fefefe                           | none      | OBSERVED                      |
| Nav row "Library"         | icon 105, 652, 63, 58; label 220, 658                           | same                     | L 34                                | #fefefe                           | none      | OBSERVED                      |
| Nav row "Customize"       | icon 107, 809, 57, 57; label 218, 814                           | same                     | L 34                                | #fefefe                           | none      | OBSERVED                      |
| Nav row "Explore"         | icon 103, 960, 66, 66; label 220, 971                           | same                     | L 34                                | #fefefe                           | none      | OBSERVED                      |
| Section heading "Pinned"  | 100, 1163, 176, 45                                              | 58.7 x 15                | L 33                                | #fefefe                           | none      | OBSERVED                      |
| Pinned rows               | icons at 105, 1315 and 100, 1464 (62 to 71 px); labels at x 217 | pitch about 157 px       | L 33                                | #fefefe                           | none      | OBSERVED                      |
| Section heading "Recents" | 100, 1672, 210, 42                                              | 70 x 14                  | L 33                                | #fefefe                           | none      | OBSERVED                      |
| Recent rows               | text at x 98, y 1827, 1983, 2139, 2295                          | pitch 156 px (52 pt)     | L 32.7                              | #fefefe                           | none      | OBSERVED                      |
| "Chat" pill               | x 103 to 466, y 2519 to 2676                                    | 121 x 52.3               | L 34, bottom 34                     | #fafafa                           | full      | OBSERVED                      |
| Account avatar button     | about 762 to 917, y 2519 to 2676                                | 52 x 52                  | drawer right edge                   | #7f8c8d circle inside a dark ring | full      | ESTIMATED from the screenshot |
| Main panel (pushed right) | x about 994 and beyond                                          | 145 pt visible           | right                               | #000000 with a light rounded edge | about 40  | ESTIMATED                     |

#### Text

| Text                                                                  | Height px     | Est. size pt | Weight   | Colour  | Align                            | Status    |
| --------------------------------------------------------------------- | ------------- | ------------ | -------- | ------- | -------------------------------- | --------- |
| "ChatGPT"                                                             | 54 (ascender) | 24           | semibold | #ffffff | left                             | ESTIMATED |
| Nav labels ("Images", "Scheduled", "Library", "Customize", "Explore") | 43 (cap)      | 20           | regular  | #fefefe | left                             | ESTIMATED |
| "Pinned", "Recents"                                                   | 43 to 45      | 20 to 21     | semibold | #fefefe | left                             | ESTIMATED |
| Pinned and recent items (placeholders <project name>, <chat title>)   | 43 (cap)      | 20           | regular  | #fefefe | left, truncated with an ellipsis | ESTIMATED |
| "Chat"                                                                | 43            | 20           | medium   | #0d0d0d | left of the pill after the icon  | ESTIMATED |

#### Spacing and notes

- The drawer fills the left 77 percent of the screen with a black (#000000) background; no card, no divider, no row fill. The last recent row sits under the "Chat" pill and the avatar button (they overlap the list; no blur visible, text shows through at the left of the pill).
- Gap from the last nav row (Explore, centre 993 px) to the "Pinned" heading: 170 px (56.7 pt); from the last pinned row to "Recents": about 135 px (45 pt).
- Drawer top: title baseline aligns with the header button centre line (y 207 px).
- The pushed-aside main panel shows part of the home screen, including the composer and the keyboard at reduced visibility, behind a light edge; scale or translation of the panel: UNKNOWN.

## Coverage

All 34 screenshots in IMG_1167 to IMG_1200 are named in a heading above. Items marked UNKNOWN or ESTIMATED are listed in the tables; gradient, blur radius and scrim opacity could not be read from a screenshot.
