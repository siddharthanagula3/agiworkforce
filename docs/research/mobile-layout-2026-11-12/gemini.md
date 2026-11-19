# Gemini on iPhone: layout measurements, part 1 (observed 2026-11-12)

Status: Historical snapshot
Owner: Product (founder)
Last updated: 2026-11-12

Screenshots IMG_1330 to IMG_1365 of the founder's reference set, 1284 x 2778 pixels at scale 3 (428 x 926 points). Method, tool and limits are in `docs/research/mobile-layout-2026-11-12/README.md`. Sizes are points unless a column says pixels. OBSERVED means read from pixels by the tool; ESTIMATED means derived (text size from cap height, weight and radius by fit); UNKNOWN means not readable from a screenshot.

Gemini uses its own typeface (a Google geometric sans), not SF Pro. Every text size below is ESTIMATED as cap height px / 3 / 0.705 and is good to about plus or minus 1 point. The theme in every screenshot is dark. Most screens sit on pure black (#000000); the cart page uses #0f0f0f and the Live and chat screens can carry a coloured glow, so a fill read on a glow is marked translucent or approximate.

IMG_1341, IMG_1343 and IMG_1356 are 2778 x 1284 pixels (landscape canvas) and show the portrait interface turned 90 degrees mid-rotation; see screens 6, 7 and 18 for what can and cannot be read from them.

## Shared components seen in this part

| Component                        | Metric                                  | Value                                                                                                                                                                                                                            | Screenshot                                       | Status                     |
| -------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------- |
| Screen frame                     | Status bar height                       | clock glyphs at y 57 to 97 px; content starts at 47 pt                                                                                                                                                                           | IMG_1331                                         | OBSERVED                   |
| Screen frame                     | Header bar height                       | 44 pt buttons at y 141 to 273 px (top 47 pt, centre 69 pt); no bar fill, buttons float on the page                                                                                                                               | IMG_1331                                         | OBSERVED                   |
| Screen frame                     | Side margin of main content             | header buttons L 20 / R 20; assistant text L 24 (x 73 px); cards in lists L 16 / R 16 (x 48 px); settings cards L 20 to 21                                                                                                       | IMG_1331, IMG_1337, IMG_1346, IMG_1354, IMG_1357 | OBSERVED                   |
| Chat header                      | Left control                            | menu (hamburger) circle 132 x 132 px = 44 x 44 pt at L 20, fill #1f1f1f on black (about #323232 on a #141414 page), icon two lines 53 px wide (17.7 pt), 5 px thick, 19 px apart                                                 | IMG_1331, IMG_1332                               | OBSERVED                   |
| Chat header                      | Title                                   | "Gemini" white then "Auto" grey (#8d8d93) then a chevron; cap height 43 px, about 20 pt, regular; title starts at x 265 px (88 pt); chevron 30 x 19 px (10 x 6 pt)                                                               | IMG_1338                                         | OBSERVED, size ESTIMATED   |
| Chat header                      | Right controls                          | new-chat circle 44 x 44 pt, gap 12 pt, then avatar circle 44 x 44 pt at R 20 (fill #1e4b40, letter initial); in Live and chat states the right side is one pill instead                                                          | IMG_1331, IMG_1334                               | OBSERVED                   |
| Chat header                      | Right pill (Live and chat states)       | x 908 to 1224 px, 44 pt tall, 105 pt wide, full radius, fill #1f1f1f; holds an icon 65 px (22 pt) and three dots 8 px (2.7 pt) apart 23 px                                                                                       | IMG_1334                                         | OBSERVED                   |
| Composer at rest                 | Card inset                              | keyboard open: L 15 / R 15 (x 46 to 1238 px); keyboard closed: L 32 / R 32 (x 96 to 1188 px)                                                                                                                                     | IMG_1331, IMG_1349                               | OBSERVED                   |
| Composer at rest                 | Card height and radius                  | 212 px = 71 pt (keyboard open), 210 px = 70 pt (closed); full pill, radius about 35 pt                                                                                                                                           | IMG_1331, IMG_1349                               | OBSERVED, radius ESTIMATED |
| Composer at rest                 | Card fill                               | #1d1e22 over the glow (#1e1f24 border row); #1b1b1b to #191919 on plain black                                                                                                                                                    | IMG_1331, IMG_1349                               | OBSERVED                   |
| Composer at rest                 | Placeholder                             | "Ask Gemini", cap height 40 px, about 19 pt, regular, colour #99999b; "Try @ for more" is the second placeholder                                                                                                                 | IMG_1331, IMG_1345                               | OBSERVED, size ESTIMATED   |
| Composer at rest                 | Controls                                | plus 59 x 58 px (20 pt) at x 126; microphone 45 x 58 px (15 x 19 pt) at x 961; waveform button 120 x 120 px (40 pt) at x 1068 to 1188, fill #1c2863, 16 pt from the card right edge and 15 pt from top and bottom                | IMG_1331                                         | OBSERVED                   |
| Composer at rest                 | Distance to keyboard                    | card bottom y 1698 px, keyboard top about y 1738 px: 13 pt                                                                                                                                                                       | IMG_1331                                         | OBSERVED                   |
| Composer with text or attachment | Send and stop buttons (recording state) | two 120 x 120 px (40 pt) circles: stop fill #353535 at x 876 to 996, send fill #253a95 (arrow up) at x 1020 to 1140; right inset 16 pt, gap 8 pt; card 1092 x 206 px (364 x 69 pt) at L 32 / R 32, 33 pt above the screen bottom | IMG_1338                                         | OBSERVED                   |
| Model picker or model menu       | Container kind                          | popover menu anchored under the header title, overlapping the header row                                                                                                                                                         | IMG_1345                                         | OBSERVED                   |
| Model picker or model menu       | Container                               | x 228 to 975 px (249 pt wide), y 141 to 798 px (219 pt tall), radius about 33 pt, translucent fill about #202021 over a blurred page                                                                                             | IMG_1345                                         | OBSERVED, radius ESTIMATED |
| Model picker or model menu       | Row                                     | title cap height 41 px (about 19.5 pt) with a grey second line, row pitch 196 px (65 pt); check mark 38 x 27 px at x 335; lock icon 39 x 53 px                                                                                   | IMG_1345                                         | OBSERVED, size ESTIMATED   |
| Model picker or model menu       | Divider and last row                    | divider 606 x 3 px (202 x 1 pt), x 300 to 906, colour #333335; "Thinking level" row has no leading icon and a right chevron 21 x 36 px                                                                                           | IMG_1345                                         | OBSERVED                   |
| Effort or thinking control       | Kind                                    | a menu row ("Thinking level") with a chevron that opens a further level; the level list is not shown                                                                                                                             | IMG_1345                                         | OBSERVED, content UNKNOWN  |
| Attach or plus menu              | Container kind                          | bottom sheet over a dimmed chat, two detents (top at y 1292 px or y 920 px), plus a horizontal tile strip                                                                                                                        | IMG_1339, IMG_1340                               | OBSERVED                   |
| Attach or plus menu              | Tile and row size                       | tiles 349 x 309 px (116 x 103 pt), pitch 362 px (121 pt), 4 pt gap, radius about 25 pt, fill #303031; list rows pitch 206 px (68.7 pt)                                                                                           | IMG_1340                                         | OBSERVED, radius ESTIMATED |
| Attach or plus menu              | Icon and label size                     | tile icon 54 x 55 px (18 pt), tile label cap 41 px (about 19.5 pt); row icon 56 to 63 px (19 to 21 pt); row title cap 41 px (about 19.5 pt), row description cap 36 px (about 17 pt)                                             | IMG_1340                                         | OBSERVED, sizes ESTIMATED  |
| Attach or plus menu              | Items per row                           | 3 tiles fully visible plus a fourth cut at the right edge; strip scrolls sideways (Photos, Camera, Avatar, Files, Drive, Notebooks, Map seen across screenshots); 6 list rows                                                    | IMG_1340, IMG_1342, IMG_1341                     | OBSERVED                   |
| Sidebar or drawer                | Width                                   | full screen (opens over the page, not a partial drawer)                                                                                                                                                                          | IMG_1347                                         | OBSERVED                   |
| Sidebar or drawer                | Row height and icon                     | 132 px = 44 pt; icon 66 x 66 px (22 pt) at x 81; label at x 196 (65 pt), cap height 42 px (about 20 pt)                                                                                                                          | IMG_1347                                         | OBSERVED, size ESTIMATED   |
| Sidebar or drawer                | Selected row                            | pill x 24 to 1260 px, y 504 to 636 px (412 x 44 pt), full radius, fill #141414                                                                                                                                                   | IMG_1347                                         | OBSERVED                   |
| Sidebar or drawer                | Section heading                         | "Notebooks", cap height 42 px (about 20 pt), colour #8c8c8c                                                                                                                                                                      | IMG_1347                                         | OBSERVED, size ESTIMATED   |
| Sidebar or drawer                | Footer account row                      | avatar circle about 36 pt, name, "Upgrade" pill 271 x 112 px (90 x 37 pt) fill #253a95, gear icon 62 x 62 px (21 pt); bottom edge of pill y 2636 px (47 pt above screen bottom)                                                  | IMG_1347                                         | OBSERVED                   |
| Sidebar or drawer                | Search field                            | no search field; a 48 pt search circle sits in the title row beside a close circle                                                                                                                                               | IMG_1347                                         | OBSERVED                   |
| Messages                         | User bubble                             | full pill (radius 31.7 pt), height 190 px (63 pt), fill #141414, text padding about 30 pt left and right, right edge 24 pt from screen edge, text cap 41 px (about 19.5 pt), width follows text                                  | IMG_1337                                         | OBSERVED, size ESTIMATED   |
| Messages                         | Assistant text                          | no bubble, L 24, cap 41 px (about 19.5 pt), line pitch 80 px (26.7 pt), colour #e0e0e0                                                                                                                                           | IMG_1337                                         | OBSERVED, size ESTIMATED   |
| Messages                         | Action row                              | six outline icons 52 px (17 to 21 pt), pitch 132 px (44 pt), row begins x 73, 80 px below the last text line                                                                                                                     | IMG_1337                                         | OBSERVED                   |
| Settings list                    | Row                                     | card rows 169 px (56 pt) tall, label cap 41 px (about 19.5 pt), icon 58 x 58 px (19 pt) at x 131, chevron in #4a4a4b                                                                                                             | IMG_1354                                         | OBSERVED, size ESTIMATED   |
| Settings list                    | Card                                    | x 63 to 1221 px (L 21 / R 21), fill #2c2c2d, separators 3 px (1 pt) colour #404042 from x 235 to 1164                                                                                                                            | IMG_1354                                         | OBSERVED                   |
| Settings list                    | Section heading                         | "Account", "Preferences": cap 38 px (about 18 pt), colour #8c8c8c, x 121                                                                                                                                                         | IMG_1354                                         | OBSERVED, size ESTIMATED   |
| Settings list                    | Toggle                                  | track 189 x 81 to 84 px (63 x 27 to 28 pt), fill #4984f7 on, white thumb                                                                                                                                                         | IMG_1357, IMG_1362                               | OBSERVED                   |
| Sheets and dialogs               | Corner radius                           | about 36 pt (plus sheet); sheets are inset 8 pt from the sides (x 24 to 1260 px) in the plus and upgrade sheets, full width in the account and settings sheets                                                                   | IMG_1340, IMG_1352, IMG_1344                     | ESTIMATED                  |
| Sheets and dialogs               | Grabber                                 | 174 x 11 px (58 x 3.7 pt) #626266 in the plus sheet; 180 x 12 px (60 x 4 pt) #464648 in the settings sheets                                                                                                                      | IMG_1340, IMG_1354                               | OBSERVED                   |
| Sheets and dialogs               | Title and close                         | 132 x 132 px (44 pt) circle close or back button at R 20 or L 20; settings page title 32 pt (cap 67 px)                                                                                                                          | IMG_1354                                         | OBSERVED, size ESTIMATED   |
| Buttons                          | Primary                                 | 161 px (53.7 pt) tall, full radius, fill #253a95, label white about 19.5 pt                                                                                                                                                      | IMG_1352                                         | OBSERVED                   |
| Buttons                          | Secondary                               | 162 px (54 pt) tall, full radius, fill #141414, label white                                                                                                                                                                      | IMG_1352                                         | OBSERVED                   |
| Paywall or upgrade               | Plan card                               | no plan card; a sheet with three benefit rows, a price line "$4.99/month" in green (#56b969) and two buttons                                                                                                                     | IMG_1352                                         | OBSERVED                   |
| Voice mode                       | Main controls                           | bottom bar of four 44 pt circles (plus, camera, microphone, close) around a central 110 x 64 pt gradient pill, 48 pt from each side, 46 pt above the screen bottom                                                               | IMG_1336                                         | OBSERVED                   |

## Screens

### 1. First-run welcome (IMG_1330)

Full-screen first-launch page on a black to deep-blue vertical gradient, with the Gemini sparkle, a two-line greeting, three notice rows and a pinned button. No header bar, no back control.

#### Layout, top to bottom

| Element                      | Box px (x, y, w, h)      | Size pt (w x h)       | Anchor                | Fill or colour                                                                                       | Radius pt | Status                     |
| ---------------------------- | ------------------------ | --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- | --------- | -------------------------- |
| Status bar                   | 0, 0, 1284, 141          | 428 x 47              | top 0                 | #000000                                                                                              | none      | OBSERVED                   |
| Gemini sparkle               | 586, 427, 112, 112       | 37.3 x 37.3           | C, top 142            | multicolour gradient                                                                                 | none      | OBSERVED                   |
| Greeting, two lines          | 284, 605, about 716, 203 | about 239 x 68        | C, top 202            | #e0e0e0                                                                                              | none      | OBSERVED                   |
| Tagline line                 | 197, 954, 888, 50        | 296 x 17              | C                     | #e0e0e0                                                                                              | none      | OBSERVED                   |
| Row 1 icon (gear)            | 167, 1102, 62, 38        | about 21 x 13 (glyph) | L 56                  | #e0e0e0                                                                                              | none      | OBSERVED                   |
| Row 2 icon (history clock)   | 169, 1307, 58, 58        | 19.3 x 19.3           | L 56                  | #e0e0e0                                                                                              | none      | OBSERVED                   |
| Row 3 icon (light bulb)      | 176, 1578, 44, 52        | 14.7 x 17.3           | L 59                  | #e0e0e0                                                                                              | none      | OBSERVED                   |
| Notice text block 1          | 313, 1093, 822, 129      | 274 x 43              | L 104                 | #e0e0e0                                                                                              | none      | OBSERVED                   |
| Notice text block 2          | 313, 1296, 787, 196      | 262 x 65              | L 104                 | #e0e0e0                                                                                              | none      | OBSERVED                   |
| Notice text block 3          | 314, 1571, 678, 196      | 226 x 65              | L 105                 | #e0e0e0                                                                                              | none      | OBSERVED                   |
| Legal paragraph, three lines | 100, 2181, 1084, 158     | 361 x 53              | C                     | grey (about #9a9aa0) with underlined links                                                           | none      | OBSERVED                   |
| Get started button           | 72, 2397, 1140, 168      | 380 x 56              | L 24, R 24, bottom 71 | #1c1c1c                                                                                              | 28 (full) | OBSERVED, radius ESTIMATED |
| Page background              | 0, 0, 1284, 2778         | 428 x 926             | full                  | #000000 at the top fading to about #131f4c at the bottom, the blue starting near the legal paragraph | none      | OBSERVED                   |

#### Text

| Text                                                                                         | Height px                 | Est. size pt                  | Weight  | Colour                                       | Align  | Status    |
| -------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------- | ------- | -------------------------------------------- | ------ | --------- |
| "Let's get started," then `<user name>`                                                      | cap L 73                  | 34.5                          | regular | #e0e0e0                                      | centre | ESTIMATED |
| "Write, plan, create, and get more done."                                                    | cap W 37                  | 17.5                          | regular | #e0e0e0                                      | centre | ESTIMATED |
| "You're in control of your settings and can change them anytime." (and two more notice rows) | cap Y 41                  | 19.5                          | regular | #e0e0e0                                      | left   | ESTIMATED |
| "Gemini is AI and can make mistakes, including about people. ..." legal text                 | rows 57 px apart          | about 15 to 16 (not isolated) | regular | grey, links lighter and underlined with dots | centre | ESTIMATED |
| "Get started"                                                                                | cap G 43 (with overshoot) | 20                            | regular | #e0e0e0                                      | centre | ESTIMATED |

#### Spacing and notes

- Heading line pitch 126 px (42 pt); notice line pitch about 71 px (23.7 pt); gap between the notice rows about 74 px (the second block starts 74 px under the first block ends).
- Notice icons sit at x 167 to 229 and the text column starts at x 313, so the icon-to-text gap is 84 px (28 pt).
- The button is 71 pt above the bottom edge and inset 24 pt from both sides; label centred.
- Linked words (Terms, Privacy Notice, "change", "location", "Live") are underlined with a dotted underline.

### 2. Home, empty chat with keyboard (IMG_1331, IMG_1332)

Home screen of a new chat on a black page with a blue-to-violet glow rising behind the composer, keyboard open and the composer focused. IMG_1331 is the plain state (no model title, with the avatar button); IMG_1332 is the same screen a minute later on a #141414 page with the "Auto" model title, a promotional heading and a "Try Gemini Live" chip, and a dotted halftone glow behind the composer.

#### Layout, top to bottom

| Element                                     | Box px (x, y, w, h)               | Size pt (w x h)     | Anchor                        | Fill or colour                                            | Radius pt   | Status   |
| ------------------------------------------- | --------------------------------- | ------------------- | ----------------------------- | --------------------------------------------------------- | ----------- | -------- |
| Menu button                                 | 60, 141, 132, 132                 | 44 x 44             | L 20, top 47                  | #1f1f1f (IMG_1331); about #323232 (IMG_1332, translucent) | 22 (circle) | OBSERVED |
| Model title "Auto" with chevron (IMG_1332)  | 265, 185, 167, 42                 | 56 x 14             | L 88                          | text #95959a                                              | none        | OBSERVED |
| New-chat button                             | 924, 141, 132, 132                | 44 x 44             | R 76                          | #1f1f1f                                                   | 22          | OBSERVED |
| Avatar button                               | 1092, 141, 132, 132               | 44 x 44             | R 20                          | #1e4b40, letter in #fefefe                                | 22          | OBSERVED |
| Upgrade pill (IMG_1332)                     | about 830 to 1070 x, 141 to 273 y | about 80 x 44       | between new-chat and avatar   | blurred, edges UNKNOWN (pill is mid-animation)            | UNKNOWN     | UNKNOWN  |
| Sparkle (IMG_1331)                          | 586, 647, 112, 112                | 37.3 x 37.3         | C                             | gradient                                                  | none        | OBSERVED |
| Greeting, two lines (IMG_1331)              | 284, 823, 712, 204                | 237 x 68            | C                             | #e0e0e0                                                   | none        | OBSERVED |
| Heading "Voice just got smarter" (IMG_1332) | 143, 757, about 1000, 97          | 333 x 32            | C                             | #e0e0e0                                                   | none        | OBSERVED |
| Chip "Try Gemini Live" (IMG_1332)           | 374, 1004, 536, 132               | 178.7 x 44          | C                             | #1c1c1c                                                   | 22 (full)   | OBSERVED |
| Chip waveform icon (IMG_1332)               | 415, 1048, 43, 43                 | 14.3 x 14.3         | inside chip, L 14             | #e0e0e0                                                   | none        | OBSERVED |
| Composer card, keyboard open                | 46, 1488, 1192, 212               | 397 x 71            | L 15, R 15, above keyboard 13 | #1d1e22                                                   | 35.5 (full) | OBSERVED |
| Plus icon                                   | 126, 1563, 59, 58                 | 19.7 x 19.3         | inside card, L 27             | #f8f9fa                                                   | none        | OBSERVED |
| Text caret and placeholder                  | 252, 1555, 271, 75                | placeholder 56 x 14 | inside card, L 84             | #99999b                                                   | none        | OBSERVED |
| Microphone                                  | 961, 1563, 45, 58                 | 15 x 19.3           | inside card                   | #f8f9fa                                                   | none        | OBSERVED |
| Waveform button                             | 1068, 1533, 120, 120              | 40 x 40             | inside card, R 16             | #1c2863                                                   | 20 (circle) | OBSERVED |
| Keyboard                                    | 0, 1738, 1284, 1040               | 428 x 347           | bottom 0                      | key fill #434755 over a #1f2231 body                      | n/a         | OBSERVED |

#### Text

| Text                                                              | Height px                    | Est. size pt                | Weight  | Colour  | Align  | Status    |
| ----------------------------------------------------------------- | ---------------------------- | --------------------------- | ------- | ------- | ------ | --------- |
| "What's the vibe," then `<user name>` followed by a question mark | cap W 75                     | 35.5                        | regular | #e0e0e0 | centre | ESTIMATED |
| "Voice just got smarter"                                          | cap V 74                     | 35                          | regular | #e0e0e0 | centre | ESTIMATED |
| "Faster and more intelligent responses"                           | about 54 with descenders     | about 19 (cap not isolated) | regular | grey    | centre | ESTIMATED |
| "Try Gemini Live"                                                 | chip text 43 incl. descender | about 20                    | regular | #e0e0e0 | centre | ESTIMATED |
| "Ask Gemini"                                                      | cap A 40                     | 19                          | regular | #99999b | left   | ESTIMATED |
| "Auto" in header                                                  | cap A 42                     | 20                          | regular | #95959a | left   | ESTIMATED |

#### Spacing and notes

- Greeting line pitch 127 px (42.3 pt). Sparkle is centred at x 642 and its bottom is 64 px above the greeting.
- In IMG_1332 the composer is 14 px (4.7 pt) lower than in IMG_1331 (card y 1502 to 1712) because the keyboard is also 14 px lower; the status of the keyboard top there is OBSERVED at about y 1752.
- The glow behind the composer is a vertical gradient: black at y 1190, #14152c by y 1434 and #25293e under the card (IMG_1331). IMG_1332 shows a magenta to violet dotted halftone instead of a smooth gradient; the colours there change per row and are UNKNOWN as a single fill.
- The keyboard is the system keyboard with a prediction row; its keys are 91 x 96 px (30 x 32 pt) in the top row (key pitch 91 px), key radius about 8 pt (ESTIMATED).

### 3. Gemini Live voice screen (IMG_1333, IMG_1334, IMG_1335, IMG_1336)

Full-screen voice session. A transcript area on top, a control bar at the bottom and a gradient pill in the middle of the bar. IMG_1333 shows the first response with a tooltip "Choose Gemini's voice" on the header pill and an orange system microphone dot; IMG_1334 is the listening state (empty transcript, blue floor glow, bar buttons tinted blue); IMG_1335 shows the response with a green page tint and the home indicator visible; IMG_1336 is the second turn at 2:38 with a "Tap to interrupt" chip above the bar, and a faint blurred ghost of the user's spoken line behind the header.

#### Layout, top to bottom

| Element                                    | Box px (x, y, w, h)                          | Size pt (w x h) | Anchor                         | Fill or colour                                          | Radius pt                                             | Status                                                                           |
| ------------------------------------------ | -------------------------------------------- | --------------- | ------------------------------ | ------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Orange microphone dot                      | 905, 20, 14, 14                              | 4.7 x 4.7       | top 7, x about 302             | #c07938                                                 | circle                                                | OBSERVED (system indicator)                                                      |
| Menu button                                | 60, 141, 132, 132                            | 44 x 44         | L 20, top 47                   | #1f1f1f                                                 | 22                                                    | OBSERVED                                                                         |
| Header pill                                | 908, 141, 316, 132                           | 105.3 x 44      | R 20, top 47                   | #1f1f1f                                                 | 22 (full)                                             | OBSERVED                                                                         |
| Captions-off icon                          | 951, 175, 65, 65                             | 21.7 x 21.7     | inside pill, L 14              | #d3d3d3                                                 | none                                                  | OBSERVED                                                                         |
| Three dots                                 | 1126, 203, 8, 8 each, pitch 23               | 2.7 each        | inside pill, centred at x 1153 | #d3d3d3                                                 | circle                                                | OBSERVED                                                                         |
| Transcript text (assistant)                | 73, 365 (IMG_1333) or 662                    | L 24            | #dcdcdc                        | n/a                                                     | OBSERVED                                              |
| Tooltip "Choose Gemini's voice" (IMG_1333) | 522, 351, 682, 168                           | 227 x 56        | R 27, top 117                  | #1c1c1c                                                 | about 28, with a small upward pointer toward the pill | OBSERVED, radius ESTIMATED                                                       |
| "Tap to interrupt" chip (IMG_1336)         | 427, 2318, 430, 112                          | 143 x 37        | C, bottom 116                  | #141414                                                 | 18.7 (full)                                           | OBSERVED                                                                         |
| Plus button                                | 144, 2509, 132, 132                          | 44 x 44         | L 48, bottom 46                | #1d1d1d                                                 | 22                                                    | OBSERVED                                                                         |
| Plus glyph                                 | 186, 2551, 46, 46                            | 15.3            | centre of button               | #f4f4f4                                                 | none                                                  | OBSERVED                                                                         |
| Camera button                              | 300, 2509, 132, 132                          | 44 x 44         | gap 8 from plus                | #1e1e1e                                                 | 22                                                    | OBSERVED                                                                         |
| Camera glyph                               | 338, 2551, 55, 45                            | 18.3 x 15       | centre of button               | #f8f8f8                                                 | none                                                  | OBSERVED                                                                         |
| Centre pill (orb)                          | 477, 2478, 330, 192                          | 110 x 64        | C, bottom 36                   | black at the top fading to blue (#4a74eb) at the bottom | about 32 (full)                                       | OBSERVED; top edge fades to black, so its exact start is read from IMG_1334 only |
| Microphone button                          | 852, 2509, 132, 132                          | 44 x 44         | gap 15 from pill               | #1c1c1c                                                 | 22                                                    | OBSERVED                                                                         |
| Microphone glyph                           | 898, 2548, 39, 51                            | 13 x 17         | centre of button               | #f8f8f8                                                 | none                                                  | OBSERVED                                                                         |
| Close button                               | 1008, 2509, 132, 132                         | 44 x 44         | R 48, gap 8                    | #1e1e1e                                                 | 22                                                    | OBSERVED                                                                         |
| Close glyph (X)                            | 1055, 2556, 37, 37                           | 12.3            | centre of button               | #f8f9f8                                                 | none                                                  | OBSERVED                                                                         |
| Home indicator                             | about 890 wide, 14 high, centred near y 2745 | about 135 x 5   | bottom 8                       | #f0f0f0                                                 | full                                                  | ESTIMATED (visible in IMG_1335 only; not isolated by the tool)                   |

#### Text

| Text                                                                    | Height px              | Est. size pt  | Weight  | Colour  | Align           | Status    |
| ----------------------------------------------------------------------- | ---------------------- | ------------- | ------- | ------- | --------------- | --------- |
| Transcript line `<message text>`                                        | cap 41                 | 19.5          | regular | #dcdcdc | left            | ESTIMATED |
| Action row under reply: copy, share, thumbs up, thumbs down, flag icons | 52 px icons, pitch 132 | icon about 17 | n/a     | #ffffff | left, from x 73 | OBSERVED  |
| "Gemini is AI and can make mistakes."                                   | cap about 32           | 15            | regular | #8c8c8c | left            | ESTIMATED |
| "Choose Gemini's voice"                                                 | height 42              | about 20      | regular | #dcdcdc | left            | ESTIMATED |
| "Tap to interrupt"                                                      | cap T about 41         | about 19.5    | regular | #e0e0e0 | centre          | ESTIMATED |

#### Spacing and notes

- The control bar centres on the page: left margin 144 px (48 pt) and right margin 144 px. Gaps between controls are 24 px (8 pt) except the 45 px (15 pt) gaps around the centre pill. The buttons share one centre line at y 2575.
- IMG_1334 (listening) tints the bar buttons #2b3458 (translucent over the blue floor glow) and fades the page from black at y about 1200 to #18255f at the bottom; the glow in IMG_1335 is green at the top (#224f26 at y 30) and fades to black by y 1000, and the header buttons turn green-tinted translucent. Exact gradient stops are UNKNOWN.
- The transcript scrolls under the header: while a line is spoken the previous user line appears as a blurred ghost behind the header (IMG_1336, not measurable).
- The first reply (IMG_1333, IMG_1335) shows five action icons with a speaker icon added on later turns (see screen 4).

### 4. Chat transcript with messages (IMG_1337)

Scrollable conversation after a Live session ended partway: user bubbles on the right, assistant text with no bubble on the left, the Live control bar still pinned at the bottom, and a scroll indicator at the right edge.

#### Layout, top to bottom

| Element                            | Box px (x, y, w, h)     | Size pt (w x h) | Anchor        | Fill or colour        | Radius pt   | Status                                       |
| ---------------------------------- | ----------------------- | --------------- | ------------- | --------------------- | ----------- | -------------------------------------------- |
| Header buttons                     | same as screen 3        | 44 x 44         | L 20 and R 20 | #1f1f1f               | 22          | OBSERVED                                     |
| User bubble 1                      | 905, 352, 307, 190      | 102 x 63        | R 24          | #141414               | 31.7 (full) | OBSERVED                                     |
| User bubble 2                      | 554, 1065, 658, 190     | 219 x 63        | R 24          | #141414               | 31.7 (full) | OBSERVED                                     |
| User bubble 3                      | 613, 1779, 599, 190     | 200 x 63        | R 24          | #141414               | 31.7 (full) | OBSERVED, y from the bubble centre line only |
| Assistant text block 1 (two lines) | 73, 662, 1080, 134      | 360 x 45        | L 24          | #e0e0e0               | none        | OBSERVED                                     |
| Action row 1                       | 73, 872, about 600, 58  | about 200 x 19  | L 24          | #ffffff outline icons | none        | OBSERVED                                     |
| Scroll indicator                   | 1266, 312, 9, 1393      | 3 x 464         | right edge    | #787878               | full        | OBSERVED                                     |
| Disclaimer line                    | 74, 2440, about 700, 32 | 233 x 11        | L 24          | #8c8c8c               | none        | OBSERVED                                     |

#### Text

| Text                                  | Height px          | Est. size pt | Weight  | Colour  | Align          | Status    |
| ------------------------------------- | ------------------ | ------------ | ------- | ------- | -------------- | --------- |
| User bubble `<message text>`          | ascender height 42 | 19.5         | regular | #e0e0e0 | left in bubble | ESTIMATED |
| Assistant reply `<message text>`      | cap 41             | 19.5         | regular | #e0e0e0 | left           | ESTIMATED |
| "Gemini is AI and can make mistakes." | cap about 32       | 15           | regular | #8c8c8c | left           | ESTIMATED |

#### Spacing and notes

- User bubble: text starts 89 px (30 pt) from the left edge and ends 88 px (29 pt) from the right edge; bubble height is constant (190 px) for one line; the corner is a full half-height radius (checked by fit: offsets of 62, 52 and 39 px at 6, 10 and 18 px below the top).
- Vertical rhythm: user bubble bottom to assistant text top 120 px (40 pt); assistant last line bottom to action row top 76 px (25 pt); action row bottom to the next bubble top about 130 px (43 pt).
- Action row icons: copy (52 x 52 px at x 73), share (x 205), speaker (62 px wide at x 331), thumb up, thumb down, flag; icon pitch 132 px (44 pt), icons about 52 px (17 pt). The speaker icon appears on completed replies; the latest reply shows five icons without it.
- Assistant paragraphs line pitch 80 px (26.7 pt).

### 5. Composer while recording (IMG_1338)

Chat page with the header title "Gemini Auto" and the new-chat icon active; the composer shows a live waveform with stop and send buttons. No keyboard.

#### Layout, top to bottom

| Element       | Box px (x, y, w, h)                                                 | Size pt (w x h) | Anchor                     | Fill or colour                                                                               | Radius pt | Status   |
| ------------- | ------------------------------------------------------------------- | --------------- | -------------------------- | -------------------------------------------------------------------------------------------- | --------- | -------- |
| Header title  | 267, 184, 355, 43                                                   | 118 x 14        | L 89                       | "Gemini" #ffffff, "Auto" #8d8d93                                                             | none      | OBSERVED |
| Header pill   | 900, 141, 324, 132                                                  | 108 x 44        | R 20                       | about #2a2a2a, translucent over the blurred line behind it (left edge UNKNOWN by about 8 px) | 22        | OBSERVED |
| New-chat icon | 943, 175, 73, 65                                                    | 24 x 21.7       | inside pill                | #d6d6d6                                                                                      | none      | OBSERVED |
| Composer card | 96, 2473, 1092, 206                                                 | 364 x 68.7      | L 32, R 32, bottom 33      | #191919                                                                                      | 34 (full) | OBSERVED |
| Plus icon     | 174, 2544, 59, 58                                                   | 19.7            | inside card, L 26          | #f7f7f7                                                                                      | none      | OBSERVED |
| Waveform bars | x 381 to 729, bars 5 to 6 px wide, pitch 29 px, heights 22 to 80 px | bars 2 pt wide  | centre of card             | #e0e0e0                                                                                      | full      | OBSERVED |
| Stop button   | 876, 2514, 120, 120                                                 | 40 x 40         | inside card, gap 8 to send | #353535                                                                                      | 20        | OBSERVED |
| Send button   | 1020, 2514, 120, 120                                                | 40 x 40         | inside card, R 16          | #253a95 (read #253992)                                                                       | 20        | OBSERVED |
| Card shadow   | below the card to y 2716                                            | n/a             | n/a                        | #0c0c0c fading to #050505                                                                    | n/a       | OBSERVED |

#### Text

| Text     | Height px                 | Est. size pt | Weight  | Colour  | Align | Status    |
| -------- | ------------------------- | ------------ | ------- | ------- | ----- | --------- |
| "Gemini" | cap G 43 (with overshoot) | 20           | regular | #ffffff | left  | ESTIMATED |
| "Auto"   | cap A 42                  | 20           | regular | #8d8d93 | left  | ESTIMATED |

#### Spacing and notes

- The card has a soft drop shadow about 34 px tall below it. Stop icon is a rounded square about 36 px; send icon is an upward arrow about 40 px.
- Top inset of the buttons inside the card is 41 px (13.7 pt), bottom inset 45 px (15 pt).
- The reply behind the header is the same as in screen 4 and is not repeated.

### 6. Plus (add) menu sheet (IMG_1339, IMG_1340, IMG_1341, IMG_1342)

A bottom sheet over a dimmed chat. IMG_1339 is the lower detent (sheet top near y 1292 px) with the list cut off after "Guided learning"; IMG_1340 is the taller detent (top y 920 px) with all six list rows; IMG_1342 shows the tile strip scrolled to the right (Avatar, Files, Drive) over a different dimmed chat state; IMG_1341 is a 2778 x 1284 canvas with the same sheet turned 90 degrees (tiles Map, Notebooks, Drive visible), mid-rotation, so its numbers are UNKNOWN as portrait values.

#### Layout, top to bottom

| Element                      | Box px (x, y, w, h)    | Size pt (w x h) | Anchor                                | Fill or colour                                                   | Radius pt | Status                                 |
| ---------------------------- | ---------------------- | --------------- | ------------------------------------- | ---------------------------------------------------------------- | --------- | -------------------------------------- |
| Dim layer over chat          | full screen            | 428 x 926       | full                                  | black at about 75 percent over the header and text (translucent) | none      | ESTIMATED                              |
| Sheet, tall detent           | 24, 920, 1236, 1834    | 412 x 611       | L 8, R 8, bottom 8                    | #1c1c1d                                                          | about 36  | OBSERVED, radius ESTIMATED             |
| Sheet, low detent (IMG_1339) | 24, 1290, 1236, 1464   | 412 x 488       | L 8, R 8, bottom 8                    | #1c1c1d                                                          | about 36  | OBSERVED (top from the grabber y 1306) |
| Grabber                      | 555, 938, 174, 11      | 58 x 3.7        | C, 6 pt below sheet top               | #626266                                                          | full      | OBSERVED                               |
| Tile Photos                  | 71, 993, 349, 309      | 116 x 103       | L 16 inside sheet                     | #303031                                                          | about 25  | OBSERVED, radius ESTIMATED             |
| Tile Camera                  | 433, 993, 349, 309     | 116 x 103       | gap 13 px (4 pt)                      | #303031                                                          | about 25  | OBSERVED                               |
| Tile Avatar                  | 794, 993, 349, 309     | 116 x 103       | gap 12 px (4 pt)                      | #303031                                                          | about 25  | OBSERVED                               |
| Tile 4 (cut off)             | 1156, 993, 104 visible | 35 visible      | clipped by sheet edge                 | #303031                                                          | about 25  | OBSERVED                               |
| Tile icon                    | e.g. 218, 1074, 54, 55 | 18 x 18.3       | centred in tile, 27 pt below tile top | #ffffff                                                          | none      | OBSERVED                               |
| Row icon (Create images)     | 114, 1440, 63, 63      | 21 x 21         | L 38                                  | #e0e0e0                                                          | none      | OBSERVED                               |
| Row icon (Create music)      | 114, 1648, 59, 61      | 19.7 x 20.3     | L 38                                  | #e0e0e0                                                          | none      | OBSERVED                               |
| Row icon (Canvas)            | 117, 1856, 56, 56      | 18.7            | L 39                                  | #e0e0e0                                                          | none      | OBSERVED                               |
| Row icon (Deep research)     | 117, 2062, 56, 56      | 18.7            | L 39                                  | #e0e0e0                                                          | none      | OBSERVED                               |
| Row icon (Guided learning)   | 114, 2264, 63, 63      | 21              | L 38                                  | #e0e0e0                                                          | none      | OBSERVED                               |
| Row text column              | x 223                  | n/a             | L 74                                  | #e0e0e0 title, #989899 description                               | none      | OBSERVED                               |
| "Labs" badge                 | text 765, 2455, 82, 30 | text 27 x 10    | after the row title, gap 18 px        | badge fill about #2c2c2e, text #e0e0e0                           | full      | badge fill ESTIMATED                   |
| Personal Intelligence toggle | 1003, 2464, 182, 81    | 60.7 x 27       | R 25 from sheet edge                  | track #59595d (off) with white thumb                             | full      | OBSERVED                               |

#### Text

| Text                                                                                                                                                                       | Height px | Est. size pt | Weight  | Colour  | Align  | Status    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | ------- | ------- | ------ | --------- |
| Tile labels "Photos", "Camera", "Avatar", "Files", "Drive"                                                                                                                 | cap P 41  | 19.5         | regular | #ffffff | centre | ESTIMATED |
| Row titles: "Create images", "Create music", "Canvas", "Deep research", "Guided learning", "Personal Intelligence"                                                         | cap 41    | 19.5         | regular | #e0e0e0 | left   | ESTIMATED |
| Row descriptions: "Visualize and edit", "Make audio tracks", "Code, write, or make slides", "Get detailed reports", "Get step-by-step help", "Don't personalize this chat" | cap V 36  | 17           | regular | #989899 | left   | ESTIMATED |
| "Labs"                                                                                                                                                                     | cap 30    | about 14     | regular | #e0e0e0 | centre | ESTIMATED |

#### Spacing and notes

- Row pitch 206 px (68.7 pt): titles start at y 1416, 1622, 1828, 2035, 2240; the description sits 74 px below its title top.
- Tile pitch 362 px (120.7 pt); tile top inset from sheet top 73 px (24 pt); gap from tile bottom to the first row title 114 px (38 pt).
- The tile strip scrolls horizontally (IMG_1342 shows Avatar, Files, Drive at the same y; tile 4 in IMG_1340 is cut by the right edge, which is the scroll hint).
- Behind the sheet the previous screen stays visible but darkened and blurred; in IMG_1339 the composer is not visible, so the sheet covers it.
- Bottom padding below the last row in the tall detent: about 190 px (63 pt) of sheet below the toggle row (sheet bottom 2754).

### 7. Account sheet (IMG_1343, IMG_1344)

A full-width sheet with a grey fill (#282a2c) opened from the avatar button. IMG_1344 is the settled state; IMG_1343 is a 2778 x 1284 canvas caught mid-rotation, so its angled shapes cannot be read as portrait numbers (UNKNOWN).

#### Layout, top to bottom

| Element                          | Box px (x, y, w, h)                | Size pt (w x h)           | Anchor             | Fill or colour                    | Radius pt                              | Status                     |
| -------------------------------- | ---------------------------------- | ------------------------- | ------------------ | --------------------------------- | -------------------------------------- | -------------------------- |
| Sheet                            | 0, 141, 1284, 2637                 | 428 x 879                 | top 47, full width | #282a2c                           | about 36 top corners                   | OBSERVED, radius ESTIMATED |
| "Done" text button               | 1110, 214, 110, 35                 | 36.7 x 11.7               | R 21, top 71       | text #a8c7fa                      | none                                   | OBSERVED                   |
| Profile card                     | 48, 324, 1188, 240                 | 396 x 80                  | L 16, R 16         | #1b1b1b                           | full (about 40)                        | OBSERVED, radius ESTIMATED |
| Avatar                           | 96, 360, 168, 168                  | 56 x 56                   | inside card, L 16  | #004d40 with a small pencil badge | circle                                 | OBSERVED                   |
| Name and email                   | 326, 389, 331, 50 and 680 more     | name line then email line | L 109              | #e3e3e3                           | none                                   | OBSERVED                   |
| Account switch chevron button    | right of the card, about 150 x 150 | about 50 x 50             | inside card, R 16  | #3c3d3f approximately             | full                                   | ESTIMATED (not measured)   |
| "Manage your Google Account" row | 48, 607, 1188, 166                 | 396 x 55                  | L 16, R 16         | #1b1b1b                           | full                                   | OBSERVED                   |
| Google G icon                    | 93, 663, 53, 54                    | 17.7 x 18                 | inside row, L 15   | multicolour                       | none                                   | OBSERVED                   |
| "Upgrade to Google AI Plus" row  | 48, 810, 1188, 168                 | 396 x 56                  | L 16, R 16         | #1b1b1b                           | top corners full, bottom corners small | OBSERVED                   |
| "Settings" row                   | 48, 984, 1188, 168                 | 396 x 56                  | gap 6 px           | #1b1b1b                           | top corners small, bottom corners full | OBSERVED                   |
| Footer links                     | y about 2600, centred              | n/a                       | bottom 60          | text grey                         | none                                   | not measured               |

#### Text

| Text                                    | Height px                     | Est. size pt | Weight  | Colour  | Align  | Status    |
| --------------------------------------- | ----------------------------- | ------------ | ------- | ------- | ------ | --------- |
| `<user name>`                           | line 50 px (cap about 40)     | about 19     | medium  | #e3e3e3 | left   | ESTIMATED |
| `<email>`                               | about 33 px lower case height | about 15     | regular | #e3e3e3 | left   | ESTIMATED |
| "Manage your Google Account"            | cap 43                        | 20           | regular | #e3e3e3 | left   | ESTIMATED |
| "Upgrade to Google AI Plus", "Settings" | cap 44                        | 20.5         | regular | #e3e3e3 | left   | ESTIMATED |
| "Done"                                  | cap about 35                  | 16.5         | medium  | #a8c7fa | right  | ESTIMATED |
| "Privacy Policy", "Terms of Service"    | not measured                  | UNKNOWN      | regular | #e3e3e3 | centre | UNKNOWN   |

#### Spacing and notes

- Card gaps: profile card to Manage row 43 px (14 pt); Manage row to Upgrade row 37 px (12 pt); Upgrade and Settings rows are stacked with a 6 px (2 pt) gap and form one grouped card.
- The sheet has no grabber; its top edge at y 141 px is the same line as the header buttons in the page behind.
- The sheet's palette (#282a2c with #1b1b1b cards, blue text button) is a Google account palette that differs from the #1c1c1d and #2c2c2d greys used in the other sheets.

### 8. Model menu, "Auto" (IMG_1345)

The model menu opened from the header title on the home screen with the keyboard open and a different placeholder, "Try @ for more". A popover with two model rows and a "Thinking level" row, overlapping the header row.

#### Layout, top to bottom

| Element                       | Box px (x, y, w, h)                 | Size pt (w x h) | Anchor                     | Fill or colour                                                  | Radius pt | Status                     |
| ----------------------------- | ----------------------------------- | --------------- | -------------------------- | --------------------------------------------------------------- | --------- | -------------------------- |
| Popover                       | 228, 141, 747, 657                  | 249 x 219       | L 76, top 47               | about #202021, translucent and blurred (edge highlight #343535) | about 33  | OBSERVED, radius ESTIMATED |
| Check mark (Auto selected)    | 335, 256, 38, 27                    | 12.7 x 9        | inside popover, L 36       | #f6f6f6                                                         | none      | OBSERVED                   |
| Row 1 title "Auto"            | 434, 220, 114, 41                   | 38 x 13.7       | text column x 434 (L 145)  | #f6f7f6                                                         | none      | OBSERVED                   |
| Row 1 description             | 434, 290, 574 wide at most, 41 high | n/a             | under title, gap 29 px     | #6d6d6d                                                         | none      | OBSERVED                   |
| Lock icon (row 2)             | 334, 441, 39, 53                    | 13 x 17.7       | inside popover             | #f6f6f6                                                         | none      | OBSERVED                   |
| Row 2 title "Code & analysis" | 435, 416, 400, 53                   | 133 x 17.7      | x 435                      | #f6f7f6                                                         | none      | OBSERVED                   |
| Divider                       | 300, 597, 606, 3                    | 202 x 1         | inside popover, L 24, R 23 | #333335                                                         | none      | OBSERVED                   |
| Row 3 "Thinking level"        | 314, 677, 212, 53                   | 70.7 x 17.7     | x 314 (L 105)              | #f6f7f6                                                         | none      | OBSERVED                   |
| Row 3 chevron                 | 875, 682, 21, 36                    | 7 x 12          | inside popover, R 26       | #ffffff                                                         | none      | OBSERVED                   |

#### Text

| Text                                               | Height px      | Est. size pt | Weight  | Colour  | Align | Status                         |
| -------------------------------------------------- | -------------- | ------------ | ------- | ------- | ----- | ------------------------------ |
| "Auto"                                             | cap A 41       | 19.5         | regular | #f6f7f6 | left  | ESTIMATED                      |
| "Adapts to your needs"                             | cap A about 33 | 15.5         | regular | #6d6d6d | left  | ESTIMATED                      |
| "Code & analysis"                                  | cap C about 41 | 19.5         | regular | #f6f7f6 | left  | ESTIMATED                      |
| second line of the locked row (low contrast, grey) | about 33       | 15.5         | regular | #6d6d6d | left  | ESTIMATED, wording not certain |
| "Thinking level"                                   | cap T about 41 | 19.5         | regular | #f6f7f6 | left  | ESTIMATED                      |

#### Spacing and notes

- Row pitch between the two model rows 196 px (65 pt); description sits 70 px below its title top.
- Left edge of the popover moves from x 271 at y 160 to x 231 at y 300 to x 228 at y 500, so the corners are round; fit radius about 100 px (33 pt).
- The popover is translucent: the sparkle greeting and header buttons stay faintly visible through it, and the Upgrade pill in the header shows as "de" at its right edge.
- Page behind: the home screen of screen 2 with a stronger blue glow (about #0a0d28 around y 1000).
- Two items only plus a sub-menu row; there is no item description under "Thinking level" and no radio on the "Auto" row, only the check mark.

### 9. Library (IMG_1346)

A page opened from the sidebar: a title bar, a "Documents" section with two cards, and a "Media" section with a full-width image grid.

#### Layout, top to bottom

| Element                       | Box px (x, y, w, h)                 | Size pt (w x h) | Anchor                                | Fill or colour      | Radius pt | Status                     |
| ----------------------------- | ----------------------------------- | --------------- | ------------------------------------- | ------------------- | --------- | -------------------------- |
| Menu button                   | 60, 141, 132, 132                   | 44 x 44         | L 20, top 47                          | #1f1f1f             | 22        | OBSERVED                   |
| Title "Library"               | 554, 183, 178, 55                   | 59 x 18         | C                                     | #e0e0e0             | none      | OBSERVED                   |
| Compose button                | 1092, 141, 132, 132                 | 44 x 44         | R 20                                  | #1f1f1f             | 22        | OBSERVED                   |
| Section heading "Documents"   | 52, 382, 263, 37                    | 87.7 x 12.3     | L 17                                  | #e0e0e0             | none      | OBSERVED                   |
| Section chevron button        | about 1116, 340, 120, 120           | about 40 x 40   | R 16                                  | about #1f1f1f       | full      | ESTIMATED (not isolated)   |
| Document card 1               | 48, 495, 1188, 256                  | 396 x 85        | L 16, R 16                            | #131313             | about 28  | OBSERVED, radius ESTIMATED |
| Document card 2               | 48, 775, 1188, 256                  | 396 x 85        | gap 24 px (8 pt)                      | #131313             | about 28  | OBSERVED                   |
| Card icon (code brackets)     | 128, 563, 56, 32                    | 18.7 x 10.7     | inside card, L 27                     | #e0e0e0             | none      | OBSERVED                   |
| Card title `<document title>` | 253, 556, 836, 43                   | 279 x 14        | L 84                                  | #e0e0e0             | none      | OBSERVED                   |
| Card date `<date>`            | 253, 663, 121, 38                   | 40 x 12.7       | L 84                                  | #959595             | none      | OBSERVED                   |
| Section heading "Media"       | 52, 1131, 136, 40                   | 45 x 13         | L 17                                  | #e0e0e0             | none      | OBSERVED                   |
| Image grid                    | 0, 1247, 1284 wide, tiles 428 x 428 | 142.7 square    | full width, no side margin            | photos              | none      | OBSERVED                   |
| Video badge on tiles          | circle about 78 px                  | 26              | inside tile, bottom left, 18 pt inset | #1f1f1f translucent | full      | ESTIMATED                  |

#### Text

| Text                 | Height px    | Est. size pt | Weight  | Colour  | Align  | Status    |
| -------------------- | ------------ | ------------ | ------- | ------- | ------ | --------- |
| "Library"            | cap L 41     | 19.5         | medium  | #e0e0e0 | centre | ESTIMATED |
| "Documents", "Media" | cap about 37 | 17.5         | regular | #e0e0e0 | left   | ESTIMATED |
| `<document title>`   | cap 43       | 20.5         | regular | #e0e0e0 | left   | ESTIMATED |
| `<date>`             | cap 38       | 18           | regular | #959595 | left   | ESTIMATED |

#### Spacing and notes

- Card height 256 px (85 pt); card pitch 280 px (93 pt); the title row sits 61 px under the card top and the date row 168 px under it.
- The media grid is three equal columns of 428 px with gutters of about 1 pt (the black line between rows is 3 px), no side margin and no rounded tile corners.
- The page background is pure #000000. The grid photos are user content and are not described.

### 10. Sidebar (full-screen menu) (IMG_1347)

The navigation page opened from the menu button, with the title "Gemini", a search circle and a close circle, five navigation rows, a "Notebooks" section and a chat list under an "All" filter row, with an account footer pinned over the list.

#### Layout, top to bottom

| Element                                                | Box px (x, y, w, h)                                                              | Size pt (w x h)    | Anchor             | Fill or colour         | Radius pt   | Status                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------ | ------------------ | ---------------------- | ----------- | --------------------------------------------------------- |
| Title "Gemini"                                         | 75, 220, 215, 50                                                                 | 71.7 x 16.7 (text) | L 25               | #e0e0e0                | none        | OBSERVED                                                  |
| Search circle                                          | 924, 177, 144, 138                                                               | about 48 x 46      | R 72               | #1f1f1f                | full        | OBSERVED, vertical extent differs by 6 px from horizontal |
| Close circle                                           | 1092, 177, 144, 138                                                              | about 48 x 46      | R 16               | #1f1f1f                | full        | OBSERVED                                                  |
| Row "New chat"                                         | icon 81, 409, 66, 58; label 196, 416, 227, 42                                    | icon 22            | L 27               | #e0e0e0                | none        | OBSERVED                                                  |
| Row "Library" (selected)                               | pill 24, 504, 1236, 132                                                          | 412 x 44           | L 8, R 8           | #141414                | 22 (full)   | OBSERVED                                                  |
| Row "Images"                                           | icon 81, 669, 66, 66; label 196, 680, 175, 54                                    | n/a                | row y 636 to 768   | #e0e0e0                | none        | OBSERVED                                                  |
| Row "Scheduled"                                        | icon 81, 801, 66, 66; label 194, 811, 256, 43                                    | n/a                | row y 768 to 900   | #e0e0e0                | none        | OBSERVED                                                  |
| Row "Customize"                                        | icon 81, 937, 66, 58; label 195, 943, 260, 43                                    | n/a                | row y 900 to 1032  | #e0e0e0                | none        | OBSERVED                                                  |
| Row "More"                                             | three dots 8 px each at x 90, 110, 130; label 196, 1076, 124, 42                 | dots 2.7           | row y 1032 to 1164 | #e0e0e0                | none        | OBSERVED                                                  |
| Section heading "Notebooks"                            | 76, 1250, 265, 42                                                                | 88 x 14            | L 25               | #8c8c8c                | none        | OBSERVED                                                  |
| Row "New notebook"                                     | plus 85, 1381, 58, 58; label 196, 1388, 361, 42                                  | plus 19.3          | row pitch 132 px   | #e0e0e0                | none        | OBSERVED                                                  |
| Notebook rows (three, `<notebook title>`)              | icon 52 x 68 px at x 88; label x 196, truncated with an ellipsis at about x 1210 | icon 17 x 23       | pitch 132 px       | #e0e0e0                | none        | OBSERVED                                                  |
| Row "All notebooks"                                    | dots at x 90; label 193, 2048, 337, 42                                           | n/a                | pitch 132 px       | #e0e0e0                | none        | OBSERVED                                                  |
| Chat list heading "All" with a filter icon             | text 73, 2234, 54, 41; filter 1139, 2227, 50, 58                                 | filter 16.7 x 19.3 | L 24; filter R 31  | #8c8c8c                | none        | OBSERVED                                                  |
| Chat list rows (`<chat title>`), pin icon on the right | label x 73; pin icon about 50 px at x 1139                                       | n/a                | pitch not isolated | #e0e0e0                | none        | OBSERVED (pitch UNKNOWN)                                  |
| Account avatar                                         | circle left of the name, x 66 to about 156 (about 90 to 109 px)                  | about 30 to 36     | L 22               | #1e4b40                | full        | OBSERVED approx                                           |
| Account name `<user name>`                             | text starts at about x 138 px (46 pt) per the display; box not isolated          | n/a                | after avatar       | #ffffff                | none        | name box UNKNOWN (merged with avatar by the tool)         |
| "Upgrade" pill                                         | 797, 2524, 271, 112                                                              | 90.3 x 37.3        | R 72, bottom 47    | #253a95, label #dfdfdf | 18.7 (full) | OBSERVED                                                  |
| Settings gear                                          | 1133, 2549, 62, 62                                                               | 20.7               | R 29               | #e0e0e0                | none        | OBSERVED                                                  |

#### Text

| Text                                                              | Height px    | Est. size pt | Weight  | Colour  | Align  | Status    |
| ----------------------------------------------------------------- | ------------ | ------------ | ------- | ------- | ------ | --------- |
| "Gemini" title                                                    | cap G 49     | 23           | medium  | #e0e0e0 | left   | ESTIMATED |
| "New chat", "Library", "Images", "Scheduled", "Customize", "More" | cap about 42 | 20           | regular | #e0e0e0 | left   | ESTIMATED |
| "Notebooks", "All"                                                | cap 42       | 20           | regular | #8c8c8c | left   | ESTIMATED |
| "New notebook", "All notebooks" and notebook titles               | cap 42       | 20           | regular | #e0e0e0 | left   | ESTIMATED |
| "Upgrade"                                                         | cap about 38 | 18           | medium  | #dfdfdf | centre | ESTIMATED |

#### Spacing and notes

- All rows are 132 px (44 pt) tall; list rows have the same pitch. The first row centre is at y 438 px, so title row bottom (y 315) to first row top (y 372) is about 19 pt.
- The sidebar has no divider lines; sections are separated by blank space of about 84 px (28 pt) plus the grey heading.
- The footer has no background fill of its own over the chat list: the last chat row (`<chat title>`) shows through the footer in grey, so the footer is transparent over black or a very faint scrim. Fill UNKNOWN.
- Library row is highlighted because the sidebar was opened from the Library page; the selected pill has equal 8 pt side insets.

### 11. Create images: sheet and page (IMG_1348, IMG_1349)

The "Create images" entry from the plus menu. IMG_1348 is a bottom sheet over the dimmed image-creation page with a blurred photo mosaic behind; IMG_1349 is the page with the header title "Gemini Auto", a banana icon, a heading and a grid of style tiles over a blue glow, with a resting composer.

#### Layout, top to bottom (IMG_1349)

| Element                            | Box px (x, y, w, h)                             | Size pt (w x h) | Anchor                       | Fill or colour                 | Radius pt | Status                     |
| ---------------------------------- | ----------------------------------------------- | --------------- | ---------------------------- | ------------------------------ | --------- | -------------------------- |
| Header buttons                     | menu 60, 141; compose 1092, 141, both 132 x 132 | 44 x 44         | L 20 / R 20                  | #1f1f1f                        | 22        | OBSERVED                   |
| Banana icon                        | 603, 361, 77, 76                                | 25.7 x 25.3     | C                            | #ffffff outline, yellow banana | none      | OBSERVED                   |
| Heading, two lines                 | 185, 490, 915, 155                              | 305 x 52        | C                            | #e0e0e0                        | none      | OBSERVED                   |
| Subtitle "Create with Nano Banana" | 330, 704, 623, 43                               | 208 x 14.3      | C                            | #e0e0e0                        | none      | OBSERVED                   |
| Tile row 1: three tiles            | x 54, 522, 990 (third cut at x 1284); y 883     | 150 x 200 each  | L 18, gap 18 px (6 pt)       | photo                          | about 28  | OBSERVED, radius ESTIMATED |
| Tile row 2                         | y 1501 to 2101                                  | 150 x 200       | gap 18 px (6 pt) under row 1 | photo                          | about 28  | OBSERVED                   |
| Tile label e.g. "Mural"            | x 112, y 1360 area, 188 x 50                    | about 62 x 17   | inside tile, bottom left     | #ffffff                        | none      | OBSERVED                   |
| Composer card, keyboard closed     | 96, 2469, 1092, 210                             | 364 x 70        | L 32, R 32, bottom 33        | #1d1f25 (over glow)            | 35        | OBSERVED                   |
| Plus icon                          | 174, 2544 area, about 59 px                     | 19.7            | inside card                  | #f7f7f7                        | none      | OBSERVED                   |
| Placeholder "Ask Gemini"           | 402, 2552, 169, 41                              | 56 x 13.7       | inside card, L 102           | #98999b                        | none      | OBSERVED                   |
| Microphone                         | 1057, 2544, 44, 58                              | 14.7 x 19.3     | inside card                  | #f7f7f7                        | none      | OBSERVED                   |

#### Layout (IMG_1348 sheet)

| Element                       | Box px (x, y, w, h)                                       | Size pt (w x h) | Anchor             | Fill or colour                                                       | Radius pt | Status                                                    |
| ----------------------------- | --------------------------------------------------------- | --------------- | ------------------ | -------------------------------------------------------------------- | --------- | --------------------------------------------------------- |
| Sheet                         | 24, 857 down to about 2754                                | about 412 x 632 | L 8, R 8, bottom 8 | translucent over a blurred photo mosaic, about #252a3f at the bottom | about 36  | top and fill approximate; fill UNKNOWN as a single colour |
| Grabber                       | 500 to 780, y 857 to 900 box (grabber 3.7 pt tall)        | UNKNOWN width   | C                  | grey                                                                 | full      | UNKNOWN width (mosaic behind)                             |
| Three overlapping photo cards | 160 to 760 x, 940 to 1380 y                               | about 200 x 147 | C                  | photos with rounded corners, middle card on top                      | about 30  | ESTIMATED from the display                                |
| Heading "Create images"       | 406, 1577, 468, 41                                        | 156 x 13.7      | C                  | #ffffff                                                              | none      | OBSERVED                                                  |
| Benefit rows (three)          | icons at x 123 to 130, text x 233; row pitch about 223 px | icon about 21   | L 41               | icon #e0e0e0, text #e0e0e0 over #b4b4b3                              | none      | OBSERVED                                                  |
| "Try it" button               | 71, 2396, 1142, 161                                       | 380.7 x 53.7    | L 24, R 24         | #1c1c1c                                                              | 27 (full) | OBSERVED                                                  |

#### Text

| Text                                                                        | Height px    | Est. size pt | Weight  | Colour              | Align               | Status    |
| --------------------------------------------------------------------------- | ------------ | ------------ | ------- | ------------------- | ------------------- | --------- |
| "Try a template or describe an idea in chat"                                | cap about 45 | 21           | regular | #e0e0e0             | centre              | ESTIMATED |
| "Create with Nano Banana"                                                   | cap C 43     | 20           | regular | #e0e0e0             | centre              | ESTIMATED |
| Tile labels "Mural", "Origami", "Dappled", "Elven", "Studio", "Headshot"    | about 40     | 19           | medium  | #ffffff             | left over the photo | ESTIMATED |
| "Create images" (sheet heading)                                             | cap about 52 | 24.5         | regular | #ffffff             | centre              | ESTIMATED |
| "with Nano Banana 2"                                                        | about 41     | 19.5         | regular | #e0e0e0             | centre              | ESTIMATED |
| Benefit titles "Try a template", "Visualize anything", "Refine with Gemini" | cap about 41 | 19.5         | regular | #e0e0e0             | left                | ESTIMATED |
| Benefit descriptions                                                        | about 36     | 17           | regular | #b4b4b3 and #abacac | left                | ESTIMATED |
| "Try it"                                                                    | cap about 41 | 19.5         | regular | #e0e0e0             | centre              | ESTIMATED |

#### Spacing and notes

- The page behind the sheet in IMG_1348 is the same page as IMG_1349 darkened.
- IMG_1349 uses the keyboard-closed composer: 32 pt side margins, 70 pt height, no waveform button when empty (only plus and microphone), unlike screen 2 where the waveform button is present.
- The sheet fill of IMG_1348 is a blurred translucent layer; the row text colours above are read against it and vary by about 10 levels from row to row.

### 12. Scheduled (IMG_1350)

The "Scheduled" page: a title bar with a filter button, an intro paragraph, a "Suggested" label, five suggestion cards and a pinned "Describe a task" composer.

#### Layout, top to bottom

| Element                                     | Box px (x, y, w, h)                                 | Size pt (w x h) | Anchor                                     | Fill or colour                                      | Radius pt | Status                     |
| ------------------------------------------- | --------------------------------------------------- | --------------- | ------------------------------------------ | --------------------------------------------------- | --------- | -------------------------- |
| Menu button                                 | 60, 141, 132, 132                                   | 44 x 44         | L 20                                       | #1f1f1f                                             | 22        | OBSERVED                   |
| Title "Scheduled"                           | 503, 185, 276, 43                                   | 92 x 14.3       | C                                          | #ffffff                                             | none      | OBSERVED                   |
| Filter button                               | 1092, 141, 132, 132 (funnel icon 57 x 65 at x 1129) | 44 x 44         | R 20                                       | #1f1f1f                                             | 22        | OBSERVED                   |
| Intro paragraph (two lines)                 | 50, 350, 1173, 126                                  | 391 x 42        | L 17                                       | #8c8c8c, "Learn more" lighter with dotted underline | none      | OBSERVED                   |
| "Suggested" label                           | 50, 576, 241, 34                                    | 80 x 11         | L 17                                       | #8c8c8c                                             | none      | OBSERVED                   |
| Suggestion card 1                           | 48, 695, 1188, 332                                  | 396 x 110.7     | L 16, R 16                                 | #1c1c1c                                             | about 28  | OBSERVED, radius ESTIMATED |
| Cards 2 to 5                                | y 1063, 1431, 1799, 2167; each 332 px tall          | 110.7           | pitch 368 px (122.7 pt), gap 36 px (12 pt) | #1c1c1c                                             | about 28  | OBSERVED                   |
| Card text (title and two description lines) | 110, 768, 848, 184 (card 1)                         | 283 x 61        | inside card, L 21                          | title #e0e0e0, description #989898                  | none      | OBSERVED                   |
| Composer card "Describe a task"             | 96, 2469, 1092, 210                                 | 364 x 70        | L 32, R 32, bottom 33                      | #1b1b1b                                             | 35        | OBSERVED                   |
| Composer placeholder                        | 185, 2553, 210 to 551 wide, 40 high                 | n/a             | inside card, L 62                          | #979797                                             | none      | OBSERVED                   |
| Composer microphone                         | 1057, 2544, 44, 58                                  | 14.7 x 19.3     | inside card                                | #f7f7f7                                             | none      | OBSERVED                   |

#### Text

| Text                                                                  | Height px                                        | Est. size pt | Weight  | Colour  | Align  | Status    |
| --------------------------------------------------------------------- | ------------------------------------------------ | ------------ | ------- | ------- | ------ | --------- |
| "Scheduled"                                                           | cap S 42                                         | 20           | medium  | #ffffff | centre | ESTIMATED |
| "Let Gemini handle routines, track updates, and take action for you." | line pitch 64 px, line height 49 with descenders | about 17     | regular | #8c8c8c | left   | ESTIMATED |
| "Suggested"                                                           | cap about 34                                     | 16           | regular | #8c8c8c | left   | ESTIMATED |
| Card titles ("Create a news digest" and four more)                    | cap about 43                                     | 20           | regular | #e0e0e0 | left   | ESTIMATED |
| Card descriptions                                                     | cap about 36                                     | 17           | regular | #989898 | left   | ESTIMATED |
| "Describe a task"                                                     | cap about 40                                     | 19           | regular | #979797 | left   | ESTIMATED |

#### Spacing and notes

- Inside each card: title top 73 px under the card top, description lines 58 and 46 px under it; card padding left 62 px (20.7 pt).
- The composer overlaps the last card (fifth card passes behind it), so the card list scrolls under the composer; the composer card has a shadow (#181818 outline, below-card gradient).
- There is no keyboard; the composer has only a microphone, no plus.

### 13. Customize (Discover tab) (IMG_1351)

The "Customize" page with three tabs (Discover, Connectors, Skills) and a list of items each with a plus button.

#### Layout, top to bottom

| Element                                         | Box px (x, y, w, h)                                                                    | Size pt (w x h) | Anchor                   | Fill or colour                          | Radius pt | Status                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- | --------------- | ------------------------ | --------------------------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| Menu button                                     | 60, 141, 132, 132                                                                      | 44 x 44         | L 20                     | #1f1f1f                                 | 22        | OBSERVED                                                                                            |
| Search button                                   | 1092, 141, 132, 132                                                                    | 44 x 44         | R 20                     | #1f1f1f                                 | 22        | OBSERVED                                                                                            |
| Tab pill "Discover" (selected)                  | 36, about 352, about 312, about 118                                                    | about 104 x 39  | L 12                     | #141414                                 | full      | OBSERVED horizontally (36 to 348 from the row at y 410), vertical extent ESTIMATED from the display |
| Tab labels                                      | "Discover" x 88, w 211; "Connectors" x 424, w 288; "Skills" x 836, w 117; y 388 to 431 | cap 43          | tabs spaced 125 px apart | selected #e0e0e0, others #8c8c8c        | none      | OBSERVED                                                                                            |
| Heading "Customize your chats"                  | 74, 585, 837, 152 area (heading plus subtitle)                                         | n/a             | L 25                     | #e0e0e0                                 | none      | OBSERVED                                                                                            |
| Subtitle "Tailor Gemini to work the way you do" | about 74, 683, 840, 50                                                                 | n/a             | L 25                     | #8c8c8c                                 | none      | OBSERVED approx                                                                                     |
| Section heading "Everyday tools" with chevron   | 77, 863, 353, 53                                                                       | 117.7 x 17.7    | L 26                     | #8c8c8c                                 | none      | OBSERVED                                                                                            |
| Row 1 icon (brand tile)                         | 72 to 192, 1020 to 1150                                                                | about 40 x 43   | L 24                     | brand blue #275ff5 glyph on a dark tile | about 12  | OBSERVED glyph 84 x 84 px                                                                           |
| Row icons 2 to 4 (circles with outline glyphs)  | glyphs 70 x 70, 52 x 70, 64 x 70 px at x 97, 106, 100                                  | about 23        | L 33 to 35               | #e0e0e0 on dark circle                  | circle 40 | OBSERVED glyph sizes; circle size ESTIMATED                                                         |
| Row text block                                  | x 229 to 231, two lines                                                                | n/a             | L 76                     | title #e0e0e0, description #8c8c8c      | none      | OBSERVED                                                                                            |
| Plus buttons                                    | 1145, 1066, 50, 50 (then every 256 px)                                                 | 16.7 x 16.7     | R 29                     | #e0e0e0                                 | none      | OBSERVED                                                                                            |

#### Text

| Text                                                                                                     | Height px                             | Est. size pt | Weight  | Colour             | Align | Status    |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------ | ------- | ------------------ | ----- | --------- |
| Tab labels                                                                                               | cap 43                                | 20           | regular | #e0e0e0 or #8c8c8c | left  | ESTIMATED |
| "Customize your chats"                                                                                   | about 63 with descender, cap about 54 | about 25.5   | regular | #e0e0e0            | left  | ESTIMATED |
| "Tailor Gemini to work the way you do"                                                                   | cap about 41                          | 19.5         | regular | #8c8c8c            | left  | ESTIMATED |
| "Everyday tools", "Business essentials"                                                                  | cap 42                                | 20           | regular | #8c8c8c            | left  | ESTIMATED |
| Row titles ("Dropbox", "Focus your energy", "Generate fresh ideas", "Get more perspectives", "Airtable") | cap about 43                          | 20           | regular | #e0e0e0            | left  | ESTIMATED |
| Row descriptions, truncated with an ellipsis                                                             | cap about 36                          | 17           | regular | #8c8c8c            | left  | ESTIMATED |

#### Spacing and notes

- Row pitch 256 px (85.3 pt) (plus buttons at y 1066, 1322, 1578, 1834); the descriptions are limited to one line and end in "..." at about x 745.
- Section headings are followed by a small chevron (right arrow) and sit 130 px above the first row.
- No dividers between rows. The plus button is a bare glyph with no circle in this screenshot.

### 14. Upgrade sheet "Upgrade to create videos" (IMG_1352)

A bottom sheet (opened from a video badge in the library) over the dimmed sidebar. Three overlapping tilted image cards, a heading, three benefit rows, a green price line and two buttons.

#### Layout, top to bottom

| Element                            | Box px (x, y, w, h)                                     | Size pt (w x h)        | Anchor                         | Fill or colour                     | Radius pt | Status                                                 |
| ---------------------------------- | ------------------------------------------------------- | ---------------------- | ------------------------------ | ---------------------------------- | --------- | ------------------------------------------------------ |
| Sheet                              | 24, about 830, 1236, about 1924                         | 412 x about 641        | L 8, R 8, bottom 8             | #1c1c1c                            | about 36  | top edge about y 830 (grabber y 830), radius ESTIMATED |
| Image cards                        | 130 to 795, 683 to 937                                  | about 222 x 85         | C                              | photos                             | about 30  | ESTIMATED                                              |
| Heading "Upgrade to create videos" | 156, 1373, 974, 82                                      | 325 x 27               | C                              | #e0e0e0                            | none      | OBSERVED                                               |
| Benefit icons                      | 127, 1569, 59, 47; 127, 1775, 59, 59; 130, 1990, 53, 53 | 17 to 20               | L 43                           | #e0e0e0                            | none      | OBSERVED                                               |
| Benefit text blocks                | x 244 to 247, titles y 1542, 1754, 1966                 | pitch 212 px (70.7 pt) | L 82                           | title #e0e0e0, description #989898 | none      | OBSERVED                                               |
| Price "$4.99/month"                | 527, 2195, 229, 36                                      | 76 x 12                | C                              | #56b969                            | none      | OBSERVED                                               |
| "Upgrade" button                   | 93, 2263, 1098, 161                                     | 366 x 53.7             | L 31, R 31                     | #253a95                            | 27        | OBSERVED                                               |
| "Not now" button                   | 93, 2447, 1098, 162                                     | 366 x 54               | L 31, R 31, gap 23 px (7.7 pt) | #141414                            | 27        | OBSERVED                                               |

#### Text

| Text                                                                                                                               | Height px    | Est. size pt | Weight  | Colour  | Align  | Status    |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------ | ------- | ------- | ------ | --------- |
| "Upgrade to create videos"                                                                                                         | cap U 63     | 30           | regular | #e0e0e0 | centre | ESTIMATED |
| "Bring your ideas to life", "Boost your productivity", "And unblock more benefits"                                                 | cap about 41 | 19.5         | regular | #e0e0e0 | left   | ESTIMATED |
| Descriptions ("Create videos with Gemini Omni", "Get more access to models & features", "Enjoy 400 GB storage and family sharing") | cap about 36 | 17           | regular | #989898 | left   | ESTIMATED |
| "$4.99/month"                                                                                                                      | cap about 34 | 16           | regular | #56b969 | centre | ESTIMATED |
| "Upgrade", "Not now"                                                                                                               | cap about 41 | 19.5         | regular | #e0e0e0 | centre | ESTIMATED |

#### Spacing and notes

- Heading is 57 px under the image cards; the first benefit row is 87 px under the heading; benefit rows pitch 212 px; price line is 98 px under the last description; button gap 23 px; sheet bottom padding under "Not now" 145 px (48 pt).
- The dimmed page behind is the sidebar of screen 10 at about 55 percent darkness, still readable.

### 15. Gems (IMG_1353)

The "Gems" list page with a migration notice card, three tabs and a list of gems (name and a one-line description).

#### Layout, top to bottom

| Element                  | Box px (x, y, w, h)                                                           | Size pt (w x h)       | Anchor                    | Fill or colour                                                  | Radius pt | Status                                                                   |
| ------------------------ | ----------------------------------------------------------------------------- | --------------------- | ------------------------- | --------------------------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| Menu button              | 60, 141, 132, 132                                                             | 44 x 44               | L 20                      | #1f1f1f                                                         | 22        | OBSERVED                                                                 |
| Title "Gems"             | 567, 184, about 150, 43                                                       | about 50 x 14         | C                         | #e0e0e0                                                         | none      | OBSERVED                                                                 |
| Compose button           | 1092, 141, 132, 132                                                           | 44 x 44               | R 20                      | #1f1f1f                                                         | 22        | OBSERVED                                                                 |
| Notice card              | 36, 329, about 1212, 734                                                      | about 404 x 245       | L 12, R 12                | #141414                                                         | about 30  | OBSERVED horizontally from the left edge, right edge ESTIMATED symmetric |
| Notice heading and body  | x 108, title y 410 and body to y 800                                          | n/a                   | inside card, L 24         | #e0e0e0 and #8c8c8c                                             | none      | OBSERVED                                                                 |
| "Learn more" text button | 474, 903, 122, 38 (text)                                                      | n/a                   | inside card, bottom right | #e0e0e0                                                         | none      | OBSERVED                                                                 |
| "Create skills" button   | 854, 902, 152 text; button about 804 to 1176                                  | about 124 x 33        | inside card, R 24         | about #232323                                                   | full      | text OBSERVED, fill ESTIMATED                                            |
| Tabs row                 | labels y 1139 to 1177: "All Gems" x 108, "Your Gems" x 512, "By Google" x 951 | tabs 428 px wide each | full width                | selected #1f3b9b, others #8c8c8c                                | none      | OBSERVED                                                                 |
| Tab indicator            | 0, 1225, 428, 6                                                               | 142.7 x 2             | under first tab           | #1f3b9b                                                         | none      | OBSERVED                                                                 |
| Tab track                | 0, 1229, 1284, 3                                                              | 428 x 1               | full width                | #474747                                                         | none      | OBSERVED                                                                 |
| Gem avatar circle        | 50, 1327, 92, 92                                                              | 30.7                  | L 17                      | coloured (brown #612b00, teal #00404e, plum #55226e etc.)       | full      | OBSERVED                                                                 |
| Gem name and description | x 193 (L 64), 1323 to 1428 high 105                                           | n/a                   | L 64                      | #e0e0e0, description truncated with an ellipsis at x about 1220 | none      | OBSERVED                                                                 |

#### Text

| Text                                                                                                                                                           | Height px        | Est. size pt | Weight   | Colour                        | Align  | Status    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------ | -------- | ----------------------------- | ------ | --------- |
| "Gems"                                                                                                                                                         | cap G 43         | 20           | medium   | #e0e0e0                       | centre | ESTIMATED |
| Notice title "Gems will become skills starting Nov 17, 2026"                                                                                                   | about 45         | 21           | regular  | #e0e0e0                       | left   | ESTIMATED |
| Notice body                                                                                                                                                    | line pitch 46 px | about 19     | regular  | #8c8c8c                       | left   | ESTIMATED |
| Tab labels                                                                                                                                                     | cap 38           | 18           | medium   | blue or #8c8c8c               | centre | ESTIMATED |
| Gem name (`<gem name>` for user gems; "Coding partner", "Storybook", "Brainstormer", "Career guide", "Learning coach", "Writing editor" for the built-in ones) | cap about 36     | 17           | semibold | #e0e0e0                       | left   | ESTIMATED |
| Gem description                                                                                                                                                | cap about 38     | 18           | regular  | #e0e0e0 (brighter than names) | left   | ESTIMATED |

#### Spacing and notes

- Gem rows: pitch 177 px (59 pt); circle left edge 50 px, text column starts at 193 px, so the circle-to-text gap is 51 px (17 pt). The name line sits at the circle top and the description about 55 px under it.
- The tab bar spans the full width without side margin; the indicator is a 2 pt bar under the active tab only.
- Avatar letters or icons inside the circles: letters for user gems, small icons for built-in ones.

### 16. Settings sheet and theme popup (IMG_1354, IMG_1361)

A full-height sheet "Settings" with two grouped cards under the section headings "Account" and "Preferences". IMG_1361 is the same page with the Theme popup open.

#### Layout, top to bottom (IMG_1354)

| Element                                            | Box px (x, y, w, h)                    | Size pt (w x h)            | Anchor       | Fill or colour                                                 | Radius pt | Status                                |
| -------------------------------------------------- | -------------------------------------- | -------------------------- | ------------ | -------------------------------------------------------------- | --------- | ------------------------------------- |
| Sheet                                              | 0, about 100 down to the bottom        | 428 wide                   | top about 33 | #000000 (the page is black; the sheet has a hairline top edge) | about 36  | edge UNKNOWN (black on black)         |
| Grabber                                            | 552, 159, 180, 12                      | 60 x 4                     | C, top 53    | #464648                                                        | full      | OBSERVED                              |
| Close button                                       | 1092, 201, 132, 132                    | 44 x 44                    | R 20, top 67 | #1f1f1f (X glyph #f9f9f9 100 x 132 box)                        | 22        | OBSERVED                              |
| Title "Settings"                                   | 63, 405, 319, 87                       | 106 x 29 (with descenders) | L 21         | #e0e0e0                                                        | none      | OBSERVED                              |
| Section heading "Account"                          | 121, 611, 200, 39                      | 66.7 x 13                  | L 40         | #8c8c8c                                                        | none      | OBSERVED                              |
| Account card                                       | 63, 695, 1158, 507                     | 386 x 169                  | L 21, R 21   | #2c2c2d                                                        | about 36  | OBSERVED, radius ESTIMATED            |
| Section heading "Preferences"                      | about 121, 1306                        | n/a                        | L 40         | #8c8c8c                                                        | none      | OBSERVED by display, box not measured |
| Preferences card                                   | 63, 1383, 1158, 1352                   | 386 x 451                  | L 21, R 21   | #2c2c2d                                                        | about 36  | OBSERVED                              |
| Row icon                                           | 131, 750, 58, 58                       | 19.3                       | L 44         | #e0e0e0                                                        | none      | OBSERVED                              |
| Row label                                          | x 239                                  | n/a                        | L 80         | #e0e0e0                                                        | none      | OBSERVED                              |
| Row chevron                                        | about 1110 to 1135, 36 px tall         | about 8 x 12               | R 29         | #4a4a4b                                                        | none      | ESTIMATED from the display            |
| Separator                                          | 235, row boundary, 929 x 3             | 310 x 1                    | L 78, R 20   | #404042                                                        | none      | OBSERVED                              |
| Theme value "System default" with up-down chevrons | 945, 2123, 158 + chevrons 1124 to 1157 | n/a                        | R 21         | #9f9fa0                                                        | none      | OBSERVED                              |

#### Theme popup (IMG_1361)

| Element                                         | Box px (x, y, w, h)                      | Size pt (w x h) | Anchor                    | Fill or colour                         | Radius pt | Status                                                        |
| ----------------------------------------------- | ---------------------------------------- | --------------- | ------------------------- | -------------------------------------- | --------- | ------------------------------------------------------------- |
| Popup                                           | about 417, 1711, 730, 456                | about 243 x 152 | R 21, above the Theme row | #434345, translucent blur over #2c2c2d | about 33  | right edge between x 1144 and 1166 (shadow), radius ESTIMATED |
| Check mark                                      | 483, 1781, 36, 35                        | 12              | L 161                     | #f7f8f7                                | none      | OBSERVED                                                      |
| Option icons (half-moon, sun, crescent)         | 562, 1769, 57, 57; 560, 1908, 59, 59     | 19 to 19.7      | L 187                     | #f7f8f7                                | none      | OBSERVED                                                      |
| Option labels "System default", "Light", "Dark" | 671, 1776, 182 x 52; 673, 1914, 121 x 53 | n/a             | L 224                     | #f7f8f8                                | none      | OBSERVED                                                      |

#### Text

| Text                                                                                                                                                                              | Height px    | Est. size pt | Weight  | Colour  | Align | Status    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------ | ------- | ------- | ----- | --------- |
| "Settings"                                                                                                                                                                        | cap S 67     | 32           | regular | #e0e0e0 | left  | ESTIMATED |
| "Account", "Preferences"                                                                                                                                                          | cap A 38     | 18           | regular | #8c8c8c | left  | ESTIMATED |
| Row labels: "Manage account", "Upgrade to Google AI Plus", "Usage limits", "Notifications", "Personal Intelligence", "Avatar", "Task", "Theme", "Voice", "Media", "Shopping cart" | cap M 41     | 19.5         | regular | #e0e0e0 | left  | ESTIMATED |
| "System default"                                                                                                                                                                  | cap about 39 | 18.5         | regular | #9f9fa0 | right | ESTIMATED |
| Popup option labels                                                                                                                                                               | cap about 43 | 20           | regular | #f7f8f7 | left  | ESTIMATED |

#### Spacing and notes

- Row height 169 px (56.3 pt) in both cards; the Account card has 3 rows, the Preferences card 8 rows (1352 px). Card gap about 60 px (heading row between).
- Grabber to close button: close top is 42 px under the grabber bottom; title top is 72 px under the close button bottom.
- IMG_1361: the popup covers the right half of the "Avatar", "Task" and "Theme" rows and the separator under "Personal Intelligence" shows to its right; the dismiss layer behind is transparent (no dimming).

### 17. Usage limits (IMG_1355)

A settings sub-page (still in the settings sheet) with a centred title, a large heading, an explanation, a usage card with a progress track, a weekly card, an upsell card and an "Advanced settings" card with a toggle. No percent is quoted as a value below; "used" figures are placeholders.

#### Layout, top to bottom

| Element                      | Box px (x, y, w, h)             | Size pt (w x h) | Anchor                | Fill or colour                   | Radius pt                              | Status                     |
| ---------------------------- | ------------------------------- | --------------- | --------------------- | -------------------------------- | -------------------------------------- | -------------------------- |
| Grabber                      | 552, 189, 180, 12               | 60 x 4          | C                     | #464648                          | full                                   | OBSERVED                   |
| Close button                 | 1092, 231, 132, 132             | 44 x 44         | R 20, top 77          | #1f1f1f                          | 22                                     | OBSERVED                   |
| Small title "Usage limits"   | 487, 273, 310, 57               | 103 x 19        | C                     | #e0e0e0                          | none                                   | OBSERVED                   |
| Large heading "Usage limits" | 102, 487, 474, 63               | 158 x 21        | L 34                  | #e0e0e0                          | none                                   | OBSERVED                   |
| Explanation (three lines)    | x 70 to about 840, y 545 to 600 | n/a             | L 23                  | #8c8c8c, "Learn more" blue       | none                                   | OBSERVED approx            |
| "Updated just now"           | about 70, 612                   | n/a             | L 23                  | #8c8c8c                          | none                                   | OBSERVED approx            |
| Current usage card           | 48, 955, 1188, 315              | 396 x 105       | L 16, R 16            | #141414                          | about 28                               | OBSERVED                   |
| Progress track               | 92, 1098, 1098, 36              | 366 x 12        | inside card, L 15     | #1c1c1c                          | 6 (full)                               | OBSERVED                   |
| Weekly limit card            | 48, 1277, 1188, 223             | 396 x 74        | gap 6 px under card 1 | #141414                          | small top corners, full bottom corners | OBSERVED, radius ESTIMATED |
| Upsell card                  | 48, 1549, 1188, 213             | 396 x 71        | L 16, R 16            | #1c1c1c with a 1 px outline #333 | about 28                               | OBSERVED                   |
| Upsell "Upgrade" pill        | 917, 1589, 295, 134             | 98.3 x 44.7     | R 8 from card edge    | #253a95                          | full                                   | OBSERVED                   |
| Heading "Advanced settings"  | about 70, 1347                  | n/a             | L 23                  | #e0e0e0                          | none                                   | OBSERVED approx            |
| Model-selection card         | 48, 1997, 1188, 346             | 396 x 115       | L 16, R 16            | #141414                          | about 28                               | OBSERVED                   |
| Toggle (on)                  | 1044, 2121, 156, 96             | 52 x 32         | inside card, R 12     | track #4984f7, dark knob         | full                                   | OBSERVED                   |

#### Text

| Text                                                 | Height px        | Est. size pt | Weight  | Colour  | Align          | Status    |
| ---------------------------------------------------- | ---------------- | ------------ | ------- | ------- | -------------- | --------- |
| Small title                                          | cap about 42     | 20           | medium  | #e0e0e0 | centre         | ESTIMATED |
| Large heading                                        | cap about 55     | 26           | regular | #e0e0e0 | left           | ESTIMATED |
| Explanation                                          | line pitch 46 px | about 19     | regular | #8c8c8c | left           | ESTIMATED |
| "Current usage" and `<percent>` used (right aligned) | about 41         | 19.5         | medium  | #e0e0e0 | left and right | ESTIMATED |
| "Resets at `<time>`"                                 | about 36         | 17           | regular | #8c8c8c | left           | ESTIMATED |
| "Weekly limit"                                       | about 41         | 19.5         | medium  | #e0e0e0 | left           | ESTIMATED |
| "Get 2x more usage with AI Plus"                     | about 41         | 19.5         | medium  | #e0e0e0 | left           | ESTIMATED |
| "$4.99/month"                                        | about 36         | 17           | regular | green   | left           | ESTIMATED |
| "Advanced settings"                                  | cap about 41     | 19.5         | regular | #e0e0e0 | left           | ESTIMATED |
| "Auto model selection"                               | about 41         | 19.5         | medium  | #e0e0e0 | left           | ESTIMATED |

#### Spacing and notes

- Progress track is 36 px (12 pt) tall; its fill portion is not visible at the state shown (track only).
- Cards are separated from the page edge by 16 pt; card text inset is 22 px (7.3 pt) more than the card edge on the first card (text at x 70).
- Toggle thumb is dark (not white) in the on state on this page, unlike the white thumb in the Preferences screens (screens 19, 22, 23).

### 18. Notifications (IMG_1356)

A 2778 x 1284 canvas that shows the Notifications page turned 90 degrees (mid-rotation or a rotated screenshot): five rows each with a title, a one-line description and a toggle (on, blue). Portrait positions cannot be read reliably, so the numbers are limited to what the tool and display agree on.

#### Layout (as read in the rotated frame, rotated back)

| Element                     | Box px                                                           | Size pt (w x h)                 | Anchor  | Fill or colour             | Radius pt | Status                                                                                               |
| --------------------------- | ---------------------------------------------------------------- | ------------------------------- | ------- | -------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| Settings card               | rotated frame, about 1030 x 840 px (long side across the screen) | UNKNOWN in portrait             | UNKNOWN | #2c2c2d                    | about 36  | UNKNOWN (canvas rotated; scale unchanged, so card thickness 835 px along the short axis is OBSERVED) |
| Toggles (five)              | about 60 x 136 px in the rotated frame                           | about 45 x 20 in portrait terms | UNKNOWN | track #4984f7, white thumb | full      | ESTIMATED                                                                                            |
| Row separators              | 1 px lines between the five rows                                 | 1                               | UNKNOWN | #3d3d3e                    | none      | OBSERVED as present                                                                                  |
| Back control (chevron down) | circle about 96 px                                               | 32                              | UNKNOWN | #1f1f1f                    | full      | ESTIMATED                                                                                            |

#### Text

| Text                                                                                                  | Height px    | Est. size pt | Weight  | Colour  | Align   | Status  |
| ----------------------------------------------------------------------------------------------------- | ------------ | ------------ | ------- | ------- | ------- | ------- |
| "Notifications"                                                                                       | not isolated | UNKNOWN      | regular | #e0e0e0 | UNKNOWN | UNKNOWN |
| Row titles "Daily brief", "Scheduled actions", "Responses", "Product updates and tips", "Suggestions" | not isolated | UNKNOWN      | regular | #e0e0e0 | UNKNOWN | UNKNOWN |
| Row descriptions                                                                                      | not isolated | UNKNOWN      | regular | #8c8c8c | UNKNOWN | UNKNOWN |

#### Spacing and notes

- The screenshot is 2778 wide and 1284 high with the status bar clock and battery rotated, so this is a frame from the rotation animation or a landscape capture of a portrait-locked layout; the app interface is not re-laid out for landscape in the frame. No other measurement is claimed.

### 19. Personal Intelligence (IMG_1357)

A sheet sub-page with back button, centred title, intro paragraph, a section heading and three large cards (Memory with a toggle, Connected Apps and Instructions for Gemini each with a chevron).

#### Layout, top to bottom

| Element                                   | Box px (x, y, w, h)       | Size pt (w x h) | Anchor                    | Fill or colour           | Radius pt | Status                     |
| ----------------------------------------- | ------------------------- | --------------- | ------------------------- | ------------------------ | --------- | -------------------------- |
| Grabber                                   | 552, 159, 180, 12         | 60 x 4          | C                         | #464648                  | full      | OBSERVED                   |
| Back button                               | 60, 201, 132, 132         | 44 x 44         | L 20, top 67              | #1f1f1f                  | 22        | OBSERVED                   |
| Title "Personal Intelligence"             | 611, 243, 299, 57         | 99.7 x 19       | C                         | #e0e0e0                  | none      | OBSERVED                   |
| Intro paragraph (three lines)             | 60, 376, about 780, 175   | about 260 x 58  | L 20                      | #959595                  | none      | OBSERVED                   |
| Section heading "Your data & preferences" | 61, 664, 621, 54          | 207 x 18        | L 20                      | #e0e0e0                  | none      | OBSERVED                   |
| Card 1 (Memory)                           | 60, 759, 1164, 641        | 388 x 213.7     | L 20, R 20                | #141414                  | about 36  | OBSERVED, radius ESTIMATED |
| Card 2 (Connected Apps)                   | 60, 1460, 1164, 615       | 388 x 205       | gap 60 px (20 pt)         | #141414                  | about 36  | OBSERVED                   |
| Card 3 (Instructions for Gemini)          | 60, 2135, 1164, 487       | 388 x 162       | gap 60 px                 | #141414                  | about 36  | OBSERVED                   |
| Card icon                                 | 131, 830, 74, 74 (Memory) | 24.7            | inside card, L 24, top 24 | #e0e0e0                  | none      | OBSERVED                   |
| Memory toggle                             | 981, 819, 189, 81         | 63 x 27         | inside card, R 18, top 20 | #4984f7 with white thumb | full      | OBSERVED                   |
| Card chevron (Connected Apps)             | 1103, 1547, 23, 42        | 7.7 x 14        | inside card               | #e0e0e0                  | none      | OBSERVED                   |

#### Text

| Text                                                              | Height px        | Est. size pt | Weight  | Colour  | Align  | Status    |
| ----------------------------------------------------------------- | ---------------- | ------------ | ------- | ------- | ------ | --------- |
| "Personal Intelligence"                                           | cap about 43     | 20           | medium  | #e0e0e0 | centre | ESTIMATED |
| Intro "Get more helpful responses ..."                            | line pitch 46 px | about 19     | regular | #959595 | left   | ESTIMATED |
| "Your data & preferences"                                         | cap about 42     | 20           | regular | #e0e0e0 | left   | ESTIMATED |
| Card titles "Memory", "Connected Apps", "Instructions for Gemini" | cap about 49     | 23           | regular | #e0e0e0 | left   | ESTIMATED |
| Card descriptions                                                 | cap about 38     | 18           | regular | #959595 | left   | ESTIMATED |

#### Spacing and notes

- Inside the Memory card: icon top inset 71 px (24 pt); icon bottom to title top 75 px; title to description 56 px; description lines pitch 46 px; links ("Manage and delete", "Learn more") dotted-underlined in #e0e0e0.
- Card heights follow their text; they are not equal.

### 20. Your avatar (IMG_1358)

A sheet sub-page with a close button, centred title with a "Beta" badge, a profile card with a large placeholder tile and a primary button, then three rows of which two are disabled.

#### Layout, top to bottom

| Element                                              | Box px (x, y, w, h)                                                          | Size pt (w x h)        | Anchor                    | Fill or colour                                     | Radius pt  | Status                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------- | ------------------------- | -------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| Grabber                                              | 552, 189, 180, 12                                                            | 60 x 4                 | C                         | #464648                                            | full       | OBSERVED                                                     |
| Close button                                         | 48, 219, about 132, 132                                                      | 44 x 44                | L 16 (about), top 73      | #1f1f1f                                            | 22         | OBSERVED approx (the tool box was clipped by the sheet edge) |
| Title "Your avatar" with badge "Beta"                | 428, 263, 110 + text; badge about 720 to 855 wide                            | n/a                    | C                         | #e0e0e0, badge fill about #1f1f1f                  | badge full | OBSERVED approx                                              |
| Profile card                                         | 48, 399, 1188, 592                                                           | 396 x 197              | L 16, R 16                | #1c1c1c                                            | about 30   | OBSERVED                                                     |
| Avatar tile                                          | 97, 448, 298, 298                                                            | 99 x 99                | inside card, L 16, top 16 | #131313 with a white smile-dots glyph 135 x 174 px | about 30   | OBSERVED glyph; tile edge ESTIMATED from the display         |
| Name `<user name>` and handle `<handle>`             | text column x about 445, y 540 to 670                                        | n/a                    | L 148                     | #e0e0e0 and #8c8c8c                                | none       | ESTIMATED                                                    |
| "Create an avatar" button                            | 96, 795, 1084, 148                                                           | 361 x 49.3             | inside card, L 32, R 35   | #253a95                                            | 25 (full)  | OBSERVED                                                     |
| Row "Who can use your avatar" (disabled, `0 people`) | text at 207, 1153                                                            | n/a                    | row icon x 85             | #464646 (disabled grey)                            | none       | OBSERVED                                                     |
| Row "Avatars shared with you"                        | icon 85, 1314, 58, 58; label 205, 1320, 583, 55; chevron 1166, 1327, 14 x 32 | row pitch about 180 px | L 28                      | #e0e0e0                                            | none       | OBSERVED                                                     |
| Row "Delete" (disabled)                              | icon and label in #3d3d3d                                                    | n/a                    | L 28                      | #464646                                            | none       | OBSERVED                                                     |

#### Text

| Text                                                           | Height px    | Est. size pt | Weight  | Colour                      | Align  | Status    |
| -------------------------------------------------------------- | ------------ | ------------ | ------- | --------------------------- | ------ | --------- |
| "Your avatar"                                                  | cap about 42 | 20           | medium  | #e0e0e0                     | centre | ESTIMATED |
| "Beta"                                                         | about 38     | 18           | regular | #e0e0e0                     | centre | ESTIMATED |
| `<user name>`                                                  | cap about 43 | 20           | regular | #e0e0e0                     | left   | ESTIMATED |
| `<handle>`                                                     | about 41     | 19.5         | regular | #8c8c8c                     | left   | ESTIMATED |
| "Create an avatar"                                             | cap about 43 | 20           | regular | #e0e0e0                     | centre | ESTIMATED |
| "Who can use your avatar", "Avatars shared with you", "Delete" | cap 40 to 55 | about 20     | regular | #e0e0e0 or disabled #464646 | left   | ESTIMATED |

#### Spacing and notes

- The button is inset 48 px (16 pt) from the card edge on the left and 56 px on the right, to be read as 16 pt both sides within tool error.
- Disabled rows are dimmed to about 30 percent grey rather than hidden.

### 21. Task page and promo card (IMG_1359, IMG_1360)

The "Task" sub-page inside the settings sheet: a back button, a title and a pill holding share and compass buttons, a notice banner "Your Google AI Pro subscription ended" with Resubscribe and close, and a resting composer. IMG_1359 shows an onboarding card on top of the page (illustration, heading, text, "Not now" and "Try it"); IMG_1360 shows the page after the card is dismissed (empty state with the sparkle and "Where should we start?").

#### Layout, top to bottom (IMG_1360)

| Element                                               | Box px (x, y, w, h)                                                             | Size pt (w x h) | Anchor              | Fill or colour | Radius pt | Status                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | --------------- | ------------------- | -------------- | --------- | -------------------------- |
| Grabber                                               | 552, 159, 180, 12                                                               | 60 x 4          | C                   | #464648        | full      | OBSERVED                   |
| Back button                                           | 60, 201, 132, 132                                                               | 44 x 44         | L 20                | #1f1f1f        | 22        | OBSERVED                   |
| Title "Task"                                          | 585, 245, 113, 42                                                               | 37.7 x 14       | C                   | #e0e0e0        | none      | OBSERVED                   |
| Right pill                                            | 907, 201, 309, 132                                                              | 103 x 44        | R 25                | #1f1f1f        | 22 (full) | OBSERVED                   |
| Notice banner                                         | 72, 435, 1140, 192                                                              | 380 x 64        | L 24, R 24          | #1c1c1c        | about 28  | OBSERVED                   |
| "Resubscribe" pill                                    | about 540 to 768, 345 to 420 in the display (about 750 to 1068 x, 480 to 585 y) | about 106 x 35  | inside banner       | about #141414  | full      | ESTIMATED                  |
| Close glyph in banner                                 | about 1135, 530, 40 px                                                          | 13              | inside banner, R 25 | #e0e0e0        | none      | ESTIMATED                  |
| Sparkle                                               | about 586, 1335 (same 112 px size)                                              | 37.3            | C                   | gradient       | none      | ESTIMATED from the display |
| Heading "Where should we start?"                      | about 128 to 1130 wide, 1500 to 1600                                            | n/a             | C                   | #e0e0e0        | none      | ESTIMATED from the display |
| Composer card                                         | 48, 2400, 1188, 240                                                             | 396 x 80        | L 16, R 16          | #1e1f1f        | 40 (full) | OBSERVED                   |
| Composer plus                                         | 135 to 195                                                                      | about 20        | inside card         | #e0e0e0        | none      | ESTIMATED                  |
| Composer placeholder "Try @ for more" or "Ask Gemini" | text x about 260                                                                | n/a             | inside card         | #999a9a        | none      | ESTIMATED                  |
| Microphone                                            | 1134 to 1137 (center line)                                                      | about 15 x 19   | inside card, R 24   | #e0e0e0        | none      | OBSERVED approx            |

#### Promo card (IMG_1359)

| Element               | Box px (x, y, w, h)              | Size pt (w x h) | Anchor                       | Fill or colour                                                | Radius pt    | Status                                  |
| --------------------- | -------------------------------- | --------------- | ---------------------------- | ------------------------------------------------------------- | ------------ | --------------------------------------- |
| Card                  | 72, 848, 1140, 1445              | 380 x 481.7     | L 24, R 24                   | image part blue gradient top, text part #1c1c1c               | about 50     | OBSERVED horizontally, radius ESTIMATED |
| Illustration area     | 72, 848 to 1490                  | 380 x 214       | top of card                  | blue gradient (#7ab0f5 to #c9d9f7) with three white app tiles | about 50 top | OBSERVED                                |
| Heading               | x 104 to 820, two lines          | n/a             | inside card, L 32            | #e0e0e0                                                       | none         | ESTIMATED from the display              |
| Body                  | x 104, three lines               | n/a             | inside card, L 32            | #e0e0e0                                                       | none         | ESTIMATED from the display              |
| "Try it" button       | 994, 2137, 170, 108              | 56.7 x 36       | inside card, R 24, bottom 16 | #253a95                                                       | 18 (full)    | OBSERVED                                |
| "Not now" text button | 766, 2173, 70 plus text, 34 high | n/a             | left of Try it               | #e0e0e0                                                       | none         | OBSERVED                                |

#### Text

| Text                                                                 | Height px               | Est. size pt | Weight  | Colour  | Align  | Status                                    |
| -------------------------------------------------------------------- | ----------------------- | ------------ | ------- | ------- | ------ | ----------------------------------------- |
| "Task"                                                               | cap T about 42          | 20           | medium  | #e0e0e0 | centre | ESTIMATED                                 |
| "Your Google AI Pro subscription ended"                              | two lines, cap about 36 | 17           | regular | grey    | left   | ESTIMATED                                 |
| "Resubscribe"                                                        | cap about 36            | 17           | regular | #e0e0e0 | centre | ESTIMATED                                 |
| "Where should we start?"                                             | cap about 70            | 33           | regular | #e0e0e0 | centre | ESTIMATED from the display (not isolated) |
| Promo heading "Get quick info from your email, calendar, and photos" | cap about 50            | 23.5         | regular | #e0e0e0 | left   | ESTIMATED                                 |
| Promo body                                                           | cap about 36            | 17           | regular | #e0e0e0 | left   | ESTIMATED                                 |
| "Not now", "Try it"                                                  | cap about 36            | 17           | regular | #e0e0e0 | centre | ESTIMATED                                 |

#### Spacing and notes

- The notice banner in IMG_1359 and IMG_1360 is the same component; it overlays the page content starting 102 px under the header row, and the avatar button of the page behind shows through to its right (partly hidden).
- The composer here is 240 px (80 pt) tall, taller than the 70 pt composer of screens 2, 11 and 12, and has a 16 pt side inset instead of 32.
- The page behind the sheet content has a blue glow from y 1300 (#0a1130) to #15204f at the bottom.

### 22. Voice settings (IMG_1362)

A sub-page with a back button, centred title "Voice", and one grouped card with two rows: a navigation row and a toggle row.

#### Layout, top to bottom

| Element                                | Box px (x, y, w, h)               | Size pt (w x h) | Anchor            | Fill or colour          | Radius pt | Status          |
| -------------------------------------- | --------------------------------- | --------------- | ----------------- | ----------------------- | --------- | --------------- |
| Grabber                                | 552, 159, 180, 12                 | 60 x 4          | C                 | #464648                 | full      | OBSERVED        |
| Back button                            | 60, 201, 132, 132                 | 44 x 44         | L 20              | #1f1f1f                 | 22        | OBSERVED        |
| Title "Voice"                          | 571, 243, 140, 44                 | 46.7 x 14.7     | C                 | #e0e0e0                 | none      | OBSERVED        |
| Card                                   | 60, 411, 1164, 540                | 388 x 180       | L 20, R 20        | #2c2c2d                 | about 36  | OBSERVED        |
| Row 1 icon                             | 132 to 189, 508 area              | about 19        | inside card, L 24 | #e0e0e0                 | none      | OBSERVED approx |
| Row 1 label "Gemini's voice"           | 238, 469, 354, 43                 | 118 x 14.3      | L 79              | #e0e0e0                 | none      | OBSERVED        |
| Row 1 description                      | 238, 552, 694, 37                 | 231 x 12.3      | L 79              | #9f9fa0                 | none      | OBSERVED        |
| Row 1 chevron                          | about 1090 to 1116                | about 8 x 12    | R 29              | #4a4a4b                 | none      | ESTIMATED       |
| Row separator                          | about 232 to 1164, at y about 646 | 310 x 1         | L 78, R 20        | #404042                 | none      | ESTIMATED       |
| Row 2 icon (hand)                      | 136, 766, 52, 69                  | 17.3 x 23       | inside card, L 24 | #e0e0e0                 | none      | OBSERVED        |
| Row 2 label "Interrupt Live responses" | 240, 707, 593, 54                 | 197.7 x 18      | L 80              | #e0e0e0                 | none      | OBSERVED        |
| Row 2 description (two lines)          | x 238, y 790 and 836              | n/a             | L 79              | #9f9fa0                 | none      | OBSERVED approx |
| Toggle                                 | 981, 758, 189, 84                 | 63 x 28         | inside card, R 18 | #4984f7 on, white thumb | full      | OBSERVED        |

#### Text

| Text             | Height px      | Est. size pt | Weight  | Colour  | Align  | Status    |
| ---------------- | -------------- | ------------ | ------- | ------- | ------ | --------- |
| "Voice"          | cap V about 42 | 20           | medium  | #e0e0e0 | centre | ESTIMATED |
| Row labels       | cap about 41   | 19.5         | regular | #e0e0e0 | left   | ESTIMATED |
| Row descriptions | cap about 37   | 17.5         | regular | #9f9fa0 | left   | ESTIMATED |

#### Spacing and notes

- Row 1 is 235 px (78 pt) tall; row 2 is 305 px (102 pt) tall because its description wraps to two lines; there is no fixed row height in this card.
- The toggle is vertically centred in row 2.

### 23. Media settings (IMG_1363)

A sub-page identical in structure to screen 22 with one card and one toggle row.

#### Layout, top to bottom

| Element                          | Box px (x, y, w, h)               | Size pt (w x h) | Anchor                                | Fill or colour   | Radius pt | Status          |
| -------------------------------- | --------------------------------- | --------------- | ------------------------------------- | ---------------- | --------- | --------------- |
| Grabber, back button             | same as screen 22                 | 60 x 4, 44 x 44 | C, L 20                               | #464648, #1f1f1f | full, 22  | OBSERVED        |
| Title "Media"                    | about 560, 243                    | about 40 x 14   | C                                     | #e0e0e0          | none      | OBSERVED approx |
| Card                             | 60, 411, 1164, 302                | 388 x 100.7     | L 20, R 20                            | #2c2c2d          | about 36  | OBSERVED        |
| Row icon (frame corners)         | 131, 538, 58, 46                  | 19.3 x 15.3     | inside card, L 24                     | #e0e0e0          | none      | OBSERVED        |
| Row label "Show media watermark" | 237, 469, 581, 43                 | 193.7 x 14.3    | L 79                                  | #e0e0e0          | none      | OBSERVED        |
| Row description (two lines)      | 239, 551, 685, 39 and second line | n/a             | L 80                                  | #9f9fa0          | none      | OBSERVED        |
| Toggle                           | 981, 520, 189, 84                 | 63 x 28         | inside card, R 18, vertically centred | #4984f7          | full      | OBSERVED        |

#### Text

| Text                                                | Height px    | Est. size pt | Weight  | Colour  | Align  | Status    |
| --------------------------------------------------- | ------------ | ------------ | ------- | ------- | ------ | --------- |
| "Media"                                             | cap about 42 | 20           | medium  | #e0e0e0 | centre | ESTIMATED |
| "Show media watermark"                              | cap about 41 | 19.5         | regular | #e0e0e0 | left   | ESTIMATED |
| "Include a visible watermark on media you generate" | cap about 37 | 17.5         | regular | #9f9fa0 | left   | ESTIMATED |

#### Spacing and notes

- Card height 302 px (100.7 pt) with a two-line description; same left text column (x 238) and toggle position (x 981 to 1170) as screen 22.

### 24. Shopping cart (IMG_1364)

A sub-page on a #0f0f0f body with a black header zone, a two-segment control and an empty state.

#### Layout, top to bottom

| Element                                  | Box px (x, y, w, h)                                | Size pt (w x h) | Anchor              | Fill or colour               | Radius pt | Status                                                   |
| ---------------------------------------- | -------------------------------------------------- | --------------- | ------------------- | ---------------------------- | --------- | -------------------------------------------------------- |
| Header zone                              | 0, 100 to 363                                      | 428 x 88        | top                 | #000000                      | none      | OBSERVED (y 363 is the first #0f0f0f row at x 40)        |
| Back button                              | 60, 201, 132, 132                                  | 44 x 44         | L 20                | #1f1f1f                      | 22        | OBSERVED (same as IMG_1362)                              |
| Title "Shopping cart"                    | about 330 to 590 wide, y 245                       | n/a             | C                   | #e0e0e0                      | none      | ESTIMATED from the display                               |
| Right pill (share, compass)              | about 907, 201, 309, 132                           | 103 x 44        | R 25                | #1f1f1f                      | 22        | ESTIMATED (same as IMG_1360)                             |
| Page body                                | 0, 363, 1284, 2415                                 | 428 x 805       | full                | #0f0f0f                      | none      | OBSERVED                                                 |
| Segmented control container              | about 322, 393, 640, 141                           | 213 x 47        | C                   | #171717                      | full      | OBSERVED vertical; horizontal ESTIMATED from the display |
| Selected segment "Cart"                  | about 322 to 641                                   | about 106 x 43  | inside control      | #0f0f0f with a faint outline | full      | ESTIMATED                                                |
| Segment labels                           | "Cart" 435, 442, 99, 39; "My orders" 687, 443, 66+ | n/a             | centred in segments | #e6e6e6 (selected), #969696  | none      | OBSERVED                                                 |
| Empty-state cart icon                    | 598, 1256, 80, 80                                  | 26.7            | C                   | #e6e8ef                      | none      | OBSERVED                                                 |
| Empty-state heading "Your cart is empty" | about 253 to 670 (display)                         | n/a             | C                   | #e6e6e6                      | none      | ESTIMATED from the display                               |
| Empty-state text                         | about 126 to 796 (display)                         | n/a             | C                   | #969696                      | none      | ESTIMATED from the display                               |
| Footer note and link                     | y about 2455 to 2590                               | n/a             | C, bottom 60        | #969696, link blue           | none      | ESTIMATED from the display                               |
| Wallet logo                              | about 450 to 835 x, 2610 to 2660 y                 | n/a             | C                   | multicolour                  | none      | ESTIMATED from the display                               |

#### Text

| Text                                                  | Height px    | Est. size pt | Weight  | Colour             | Align  | Status    |
| ----------------------------------------------------- | ------------ | ------------ | ------- | ------------------ | ------ | --------- |
| "Shopping cart"                                       | cap about 42 | 20           | medium  | #e0e0e0            | centre | ESTIMATED |
| "Cart", "My orders"                                   | cap about 38 | 18           | regular | #e6e6e6 or #969696 | centre | ESTIMATED |
| "Your cart is empty"                                  | cap about 55 | 26           | regular | #e6e6e6            | centre | ESTIMATED |
| "When you add items to cart, you'll see them here."   | about 40     | 19           | regular | #969696            | centre | ESTIMATED |
| "Cart and order data will be saved in Google Wallet." | about 40     | 19           | regular | #969696            | centre | ESTIMATED |
| "Manage Wallet settings"                              | about 40     | 19           | regular | link blue          | centre | ESTIMATED |

#### Spacing and notes

- This page changes the surface colour: header zone #000000 and body #0f0f0f (a 1-step lift) rather than the pure black of the other settings sub-pages.
- Empty-state block is centred vertically in the body: icon centre at y about 1296 (47 percent of screen height).

### 25. Gemini Apps Activity (web page in the sheet) (IMG_1365)

An in-app web view of a Google account page, reached from the privacy settings. The sheet header holds a back button, a title and the share and compass pill; a thin blue loading bar sits under the header; below it is a web page with a Google bar, a heading, cards and an outline button.

#### Layout, top to bottom

| Element                      | Box px (x, y, w, h)                                          | Size pt (w x h) | Anchor            | Fill or colour             | Radius pt | Status                               |
| ---------------------------- | ------------------------------------------------------------ | --------------- | ----------------- | -------------------------- | --------- | ------------------------------------ |
| Header zone                  | 0, 100 to 262                                                | 428 x 54        | top               | #000000                    | none      | OBSERVED                             |
| Back button                  | 60, 201, 132, 132                                            | 44 x 44         | L 20              | #1f1f1f                    | 22        | OBSERVED                             |
| Title "Gemini Apps Activity" | about 230, 262 to 287 (text box 181 x 25 for the first word) | n/a             | L 77              | #e0e0e0                    | none      | OBSERVED approx                      |
| Right pill                   | about 907, 201, 309, 132                                     | 103 x 44        | R 25              | #1f1f1f                    | 22        | ESTIMATED                            |
| Loading bar                  | 0, 363, about 480, 5                                         | 160 x 1.7       | under header      | #3e8cf2                    | none      | OBSERVED (vertical run y 363 to 368) |
| Web header strip             | 0, 369, 1284, 162                                            | 428 x 54        | full              | #131313                    | none      | OBSERVED                             |
| Google wordmark              | 73, 262 area; in the strip about 60 to 280                   | n/a             | L 20              | white                      | none      | UNKNOWN box                          |
| Web page body                | 0, 531 down                                                  | full            | full              | #202123                    | none      | OBSERVED                             |
| Card "Keep activity"         | about 73 to 1212, 748 to 2068                                | about 380 x 440 | L 24, R 24        | about #2f3036              | about 28  | ESTIMATED from the display           |
| "On" dropdown button         | about 120 to 443, 1287 to 1408                               | about 108 x 40  | inside card, L 40 | #1a4a7e (blue-grey)        | full      | ESTIMATED from the display           |
| Outline "Delete" button      | about 73 to 381, 2368 to 2475                                | about 103 x 36  | L 24              | outline #8ab4f8 on #202123 | about 8   | ESTIMATED from the display           |

#### Text

| Text                               | Height px              | Est. size pt   | Weight  | Colour  | Align | Status                     |
| ---------------------------------- | ---------------------- | -------------- | ------- | ------- | ----- | -------------------------- |
| "Gemini Apps Activity" (header)    | about 42               | 20             | medium  | #e0e0e0 | left  | ESTIMATED                  |
| Web heading "Gemini Apps Activity" | about 64               | about 30       | regular | #e3e3e3 | left  | ESTIMATED from the display |
| Web body paragraphs                | line pitch about 60 px | about 17 to 18 | regular | #c4c7c5 | left  | ESTIMATED from the display |

#### Spacing and notes

- The page body is the real web content (Google account style: dark grey #202123, cards #2f3036, blue accents #8ab4f8); its internal sizes are not measured beyond the strips above and carry the web page's own scale.
- The header title is left-aligned next to the back button here, unlike the centred titles on the native sub-pages (screens 17 to 24).
