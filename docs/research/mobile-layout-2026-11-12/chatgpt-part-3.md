# ChatGPT on iPhone: layout measurements, part 3 (observed 2026-11-12)

Status: Historical snapshot
Owner: Product (founder)
Last updated: 2026-11-12

Screenshots IMG_1201 to IMG_1236 of the founder's reference set, 1284 x 2778 pixels at scale 3 (428 x 926 points). Method, tool and limits are in `docs/research/mobile-layout-2026-11-12/README.md`. Sizes are points unless a column says pixels. OBSERVED means read from pixels by the tool; ESTIMATED means derived (text size from cap height, weight and radius by fit); UNKNOWN means not readable from a screenshot.

Theme: dark, pure black page background (#000000) with cards of #1c1c1e (some pages #1c1c1d). IMG_1207 and IMG_1210 do not exist in the folder; every other number from IMG_1201 to IMG_1236 is covered. All text sizes use the 0.705 cap-height ratio of SF Pro; the app face looks like a close relative, so treat each size as plus or minus 1 point. Cap heights measured with letters that have round overshoot (C, G, S) read about 2 pixels taller than flat capitals (N, H, E).

## Shared components seen in this part

| Component                           | Metric                                    | Value                                                                                                                                                                                                                            | Screenshot                   | Status    |
| ----------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------- |
| Screen frame                        | Status bar height                         | first content starts at y 141 px = 47 pt on every settings page, so the status bar is 47 pt                                                                                                                                      | IMG_1215                     | OBSERVED  |
| Screen frame                        | Header bar height (settings sub pages)    | 44 pt (back button y 141 to 273 px), bottom of header at 91 pt; title centre y 207 px = 69 pt                                                                                                                                    | IMG_1215                     | OBSERVED  |
| Screen frame                        | Side margin of main content               | cards and bars 20 pt (x 60 px) on both sides, card width 388 pt; section headings and footnote text start at 41 pt (x 123 px)                                                                                                    | IMG_1215                     | OBSERVED  |
| Screen frame                        | Scrolled header                           | header zone 0 to 302 px (100.7 pt) turns into a dark blurred strip (#090808 to #0a0a0a over black) that hides rows scrolling beneath it; back button and title stay                                                              | IMG_1228, IMG_1223           | OBSERVED  |
| Screen frame                        | Scroll indicator                          | 3 pt wide (9 px), x 1266 px (R 3), colour #7f7f7f                                                                                                                                                                                | IMG_1227                     | OBSERVED  |
| Header (settings sub page)          | Back button                               | 44 x 44 pt circle at x 60, y 141 px (L 20, top 47), fill #1f1f1f (glass, translucent), chevron glyph 10.3 x 18.3 pt (31 x 55 px) colour #f9f9f9                                                                                  | IMG_1215, IMG_1220           | OBSERVED  |
| Header (settings sub page)          | Title                                     | centred, cap height 42 px (about 19 pt) semibold white; centre y 69 pt                                                                                                                                                           | IMG_1215, IMG_1220           | ESTIMATED |
| Header (settings main, sheets)      | Close button                              | 44 x 44 pt circle, x 1092 px (R 20), y 141 px (top 47), X glyph 19 x 19 pt (57 px), fill #0a0a0a when dimmed                                                                                                                     | IMG_1209                     | OBSERVED  |
| Chat header                         | Left control, Upgrade pill, right control | menu button 44 x 44 pt at L 20; Upgrade pill 137.7 x 44 pt at x 228 px (L 76); right button 44 x 44 pt at R 20 (x 1092 px); gap between controls 12 pt (36 px); all fill #212121 (glass), y 141 to 273 px                        | IMG_1208                     | OBSERVED  |
| Chat header                         | Upgrade label                             | sparkle icon 22.3 pt (67 px) and label "Upgrade", colour #48aaff, cap height 41 px (about 19.5 pt) semibold                                                                                                                      | IMG_1208                     | ESTIMATED |
| Composer with keyboard open (empty) | Card                                      | x 36 to 1248 px (L 12, R 12), y 1551 to 1701 px, 404 x 50 pt, fill #212121, fully rounded (pill)                                                                                                                                 | IMG_1208                     | OBSERVED  |
| Composer with keyboard open (empty) | Placeholder                               | "Ask ChatGPT", cap height 40 px (about 19 pt), colour #828282, starts x 185 px (61.7 pt) after a text caret                                                                                                                      | IMG_1208                     | ESTIMATED |
| Composer with keyboard open (empty) | Controls                                  | plus icon 20 x 19.7 pt at x 81 px (27 pt from the screen edge, 15 pt inside the card); microphone icon 19 x 24 pt at x 999 px; voice (waveform) button 34.7 pt (104 px) white circle at x 1120 px, 8 pt from the card right edge | IMG_1208                     | OBSERVED  |
| Composer with keyboard open (empty) | Distance to keyboard                      | card bottom y 1701 px, keyboard top about y 1737 px, gap about 12 pt                                                                                                                                                             | IMG_1208                     | OBSERVED  |
| Settings list                       | Row height                                | 54 pt pitch (162 px) = 53 pt row (159 px) + 1 pt separator (3 px); rows with a second line of grey text grow (screen 8 and 11)                                                                                                   | IMG_1213, IMG_1216           | OBSERVED  |
| Settings list                       | Row label                                 | cap height 40 px (about 19 pt) regular white, starts x 240 px (80 pt) when the row has an icon, x 123 px (41 pt) when it has none                                                                                                | IMG_1213, IMG_1216           | ESTIMATED |
| Settings list                       | Value text                                | same size as the label (about 19 pt), colour #98989f, right aligned, ends 12.7 pt left of the chevron                                                                                                                            | IMG_1215, IMG_1216           | ESTIMATED |
| Settings list                       | Row icon                                  | 20 pt wide (60 px), x 129 px (43 pt), white outline icons                                                                                                                                                                        | IMG_1213                     | OBSERVED  |
| Settings list                       | Section heading                           | cap height 42 px (about 19.5 pt) semibold white, x 123 px (41 pt); 32 pt (97 px) below the previous card, 15 pt (44 px) above its card                                                                                           | IMG_1213, IMG_1215           | ESTIMATED |
| Settings list                       | Card                                      | x 60 to 1224 px (L 20, R 20), fill #1c1c1e, radius about 27 pt (80 px fit of the corner curve)                                                                                                                                   | IMG_1215, IMG_1217           | ESTIMATED |
| Settings list                       | Separator                                 | 1 pt (3 px) colour #38383b, from x 235 px (78 pt) when rows have icons or x 120 px (40 pt) when they do not, to x 1164 px (R 40)                                                                                                 | IMG_1213, IMG_1216           | OBSERVED  |
| Settings list                       | Toggle                                    | 63 x 28 pt (189 x 84 px) at x 981 px, right edge x 1170 px (R 18 pt inside the card edge); on track #30d158, off track #59595e, white knob about 36 x 24 pt                                                                      | IMG_1215, IMG_1220           | OBSERVED  |
| Settings list                       | Chevron                                   | 7.7 x 13.3 pt (23 x 40 px), colour #58585c to #59595e, x 1131 px (R 23 from the screen edge); up/down stepper glyph 10.3 x 5.3 pt twice (31 x 16 px each), colour #98989f                                                        | IMG_1213, IMG_1215           | OBSERVED  |
| Settings list                       | Footnote under a card                     | cap height 34 px (about 16 pt) colour #8d8d93, line height 18 pt (54 px), starts x 123 px; links colour #0091ff; 13.5 pt (41 px) below the card                                                                                  | IMG_1220                     | ESTIMATED |
| Sheets and dialogs                  | Floating sheet (inset)                    | x 24 to 1260 px (8 pt side inset), 8 pt above the screen bottom, translucent; radius about 34 to 37 pt (ESTIMATED from the corner curve)                                                                                         | IMG_1203, IMG_1206, IMG_1209 | ESTIMATED |
| Sheets and dialogs                  | Full width sheet                          | x 0 to 1284 px, top y 141 px (47 pt), radius about 40 pt (120 px fit)                                                                                                                                                            | IMG_1229                     | ESTIMATED |
| Sheets and dialogs                  | Grabber                                   | 58 x 4 pt (174 x 12 px), colour #67676a, centred, top 17 px below the sheet top                                                                                                                                                  | IMG_1209                     | OBSERVED  |
| Sheets and dialogs                  | Alert                                     | 320 pt wide (162 to 1122 px), centred, fill #2b2b2c (translucent), radius about 33 pt                                                                                                                                            | IMG_1211                     | ESTIMATED |
| Buttons                             | Primary (white pill)                      | 364 x 56.7 pt (1092 x 170 px), L 32 R 32, fill #ffffff, fully rounded, label cap height 41 px (about 19.5 pt) semibold #0d0d0d                                                                                                   | IMG_1201                     | OBSERVED  |
| Buttons                             | Disabled primary (Send)                   | 364 x 57 pt (171 px), L 32 R 32, fill #9fa19d (translucent grey), label dark                                                                                                                                                     | IMG_1229                     | OBSERVED  |
| Buttons                             | Store subscribe button                    | 131.7 x 47.3 pt (395 x 142 px), centred, fill #4090f7, label white, cap height 40 px (about 19 pt)                                                                                                                               | IMG_1203                     | OBSERVED  |
| Buttons                             | Alert OK button                           | 288 x 45.7 pt (864 x 137 px), fill #4b4b4c, label white about 19 pt                                                                                                                                                              | IMG_1211                     | OBSERVED  |
| Buttons                             | Text link row (blue)                      | a full card row (54 pt) whose label is #0091ff, e.g. "Buy credits", "Add connection", "Allow location access"                                                                                                                    | IMG_1212, IMG_1224, IMG_1228 | OBSERVED  |
| Buttons                             | Destructive row                           | full card row with label colour #ff4245, e.g. "Clear all cookies", "Delete all chats"                                                                                                                                            | IMG_1225, IMG_1228           | OBSERVED  |
| Paywall or upgrade                  | Plan card                                 | 364 pt wide (x 96 to 1188 px, L 32 R 32); Plus card 474 pt tall (1422 px) in IMG_1204, Go card 328 pt tall (984 px); fill transparent (black), 1 pt border #262626, radius about 16 pt (48 px fit)                               | IMG_1204, IMG_1202           | ESTIMATED |
| Paywall or upgrade                  | Price text                                | the price sits inside the primary button label ("Upgrade for $20", "Upgrade for $8.00"), cap height 41 px (about 19.5 pt) semibold                                                                                               | IMG_1201, IMG_1202           | ESTIMATED |
| Paywall or upgrade                  | Feature row height                        | 51 pt (153 px) for a one-line label, 65.7 pt (197 px) for a two-line label; label line pitch 24.3 pt (73 px)                                                                                                                     | IMG_1204                     | OBSERVED  |
| Paywall or upgrade                  | Plan switch                               | segmented control 364 x 46.7 pt (140 px), selected pill 38.7 pt (116 px) tall, inset 4 pt, both fully rounded                                                                                                                    | IMG_1204                     | OBSERVED  |

## Screens

### 1. Upgrade paywall, Plus and Go (IMG_1201, IMG_1202, IMG_1204)

A full screen upgrade page in dark theme with a floating close button, an icon, a title, a subtitle, a Go/Plus switch, a comparison card, and a white upgrade button pinned at the bottom with a store link and a renewal note. IMG_1201 is the Plus tab at rest (the comparison card runs under the button, cut off). IMG_1202 is the Go tab (shorter card, extra footnote line about ads). IMG_1204 is the Plus tab scrolled to the bottom: icon scrolled away, title near the top, the whole card visible, the button and notes pinned.

#### Layout, top to bottom

| Element                                               | Box px (x, y, w, h)          | Size pt (w x h)                       | Anchor                 | Fill or colour                    | Radius pt        | Status    |
| ----------------------------------------------------- | ---------------------------- | ------------------------------------- | ---------------------- | --------------------------------- | ---------------- | --------- |
| Close button (IMG_1201)                               | 1104, 189, 132, 132          | 44 x 44                               | top 63, R 16           | #131313 (X glyph white)           | full circle      | OBSERVED  |
| Plus icon, four point sparkle (IMG_1201)              | 577, 338, 132, 131           | 44 x 43.7                             | C, top 113             | #63a8f8                           | n/a              | OBSERVED  |
| Go icon, rounded diamond with a small star (IMG_1202) | 587, 350, 110, 110           | 36.7 x 36.7                           | C, top 117             | #63a8f8                           | n/a              | OBSERVED  |
| Title (IMG_1201)                                      | 216, 587, 851, 80            | 283.7 x 26.7                          | C, top 195.7           | #ffffff                           | n/a              | OBSERVED  |
| Subtitle (IMG_1201)                                   | 196, 743, 895, 54            | 298.3 x 18                            | C, top 247.7           | #cdcdcd                           | n/a              | OBSERVED  |
| Plan switch track                                     | 96, 910, 1092, 140           | 364 x 46.7                            | L 32, R 32, top 303    | #131313                           | full pill        | OBSERVED  |
| Selected pill (Plus selected, right half)             | 642, 922, 534, 116           | 178 x 38.7                            | inside track, R 4      | #000000 with a faint lighter edge | full pill        | OBSERVED  |
| Plan card (Go)                                        | 96, 1098, 1092, 984          | 364 x 328                             | L 32, R 32, top 366    | transparent, 1 pt border #262626  | about 16         | ESTIMATED |
| Plan card (Plus, IMG_1204)                            | 96, 766, 1092, 1422          | 364 x 474                             | L 32, R 32             | transparent, 1 pt border #262626  | about 16         | ESTIMATED |
| Features header row text "Features"                   | 148, 1189, 270, 38           | 90 x 12.7                             | inside card, L 17      | #afafaf                           | n/a              | OBSERVED  |
| Column headers "Free" and "Plus"                      | 876, 1189, 262, 38           | "Free" ends x 982, "Plus" ends x 1138 | inside card, R 17      | Free #afafaf, Plus #63a8f8        | n/a              | OBSERVED  |
| First feature row                                     | y 1300 to 1453               | 51 tall                               | pitch 153              | white label                       | n/a              | OBSERVED  |
| Check mark (Plus column)                              | 1059, 989, 54, 50 (IMG_1204) | 18 x 16.7                             | centre x 1086          | #63a8f8                           | n/a              | OBSERVED  |
| Check mark (Free column)                              | 901, 989, 54, 50             | 18 x 16.7                             | centre x 928           | #afafaf                           | n/a              | OBSERVED  |
| Dash mark (Free column, not included)                 | 909, 1164, 38, 6             | 12.7 x 2                              | centre x 928           | #afafaf                           | n/a              | OBSERVED  |
| Upgrade button                                        | 96, 2260, 1092, 170          | 364 x 56.7                            | L 32, R 32, bottom 116 | #ffffff                           | full pill (28.3) | OBSERVED  |
| External link icon in the button                      | 850, 2326, 36, 36            | 12 x 12                               | right of label, 7 gap  | #0d0d0d                           | n/a              | OBSERVED  |
| Link "Upgrade with Apple"                             | 429, 2474, 425, 44           | 141.7 x 14.7                          | C, bottom 87           | #ffffff, underlined               | n/a              | OBSERVED  |
| Renewal note                                          | 248, 2567, 787, 41           | 262.3 x 13.7                          | C, bottom 57           | #ffffff                           | n/a              | OBSERVED  |
| Ads note, second line (IMG_1202 only)                 | y 2631, h 42                 | 14 tall                               | C, line pitch 22       | #ffffff, "Learn more" underlined  | n/a              | OBSERVED  |

#### Text

| Text                                                                                                                                                                                                 | Height px | Est. size pt | Weight                                 | Colour            | Align        | Status    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | -------------------------------------- | ----------------- | ------------ | --------- |
| "Get ChatGPT Plus" / "Get ChatGPT Go"                                                                                                                                                                | G cap 80  | 38           | semibold                               | #ffffff           | centre       | ESTIMATED |
| "Do more with advanced intelligence" / "Keep chatting with expanded access"                                                                                                                          | D cap 40  | 19           | regular                                | #cdcdcd           | centre       | ESTIMATED |
| "Go", "Plus" (switch labels)                                                                                                                                                                         | P cap 36  | 17           | medium (selected white, other #8e8e92) | white / #8e8e92   | centre       | ESTIMATED |
| "Features", "Free", "Plus" (header)                                                                                                                                                                  | F cap 38  | 18           | semibold                               | #afafaf / #63a8f8 | left / right | ESTIMATED |
| Feature labels ("Core model", "Advanced models", "More messages and uploads", "Advanced image creation with Thinking", "Expanded memory", "Codex and deep research", "Early access to new features") | C cap 40  | 19           | regular                                | #ffffff           | left         | ESTIMATED |
| Go labels ("Core model", "More messages", "More uploads", "More image creation", "Longer memory")                                                                                                    | same      | 19           | regular                                | #ffffff           | left         | ESTIMATED |
| "Upgrade for $20" / "Upgrade for $8.00"                                                                                                                                                              | U cap 41  | 19.5         | semibold                               | #0d0d0d           | centre       | ESTIMATED |
| "Upgrade with Apple"                                                                                                                                                                                 | U cap 35  | 16.5         | semibold, underlined                   | #ffffff           | centre       | ESTIMATED |
| "Auto-renews monthly. Cancel anytime."                                                                                                                                                               | A cap 33  | 15.5         | regular                                | #ffffff           | centre       | ESTIMATED |

#### Spacing and notes

- The Go tab has five rows, all one line, each 51 pt (pitch 153 px, check centres y 1346, 1499, 1652, 1805, 1958 px); the Go checks are in the column at x 1088 px, the Free column at x 931 px.
- Gap from the close button bottom (321 px) to the icon top (338 px) is 5.7 pt; icon bottom 469 px to title top 587 px is 39 pt; title bottom 667 px to subtitle top 743 px is 25 pt; subtitle bottom 797 px to the switch top 910 px is 37.7 pt; switch bottom 1050 px to card top 1098 px is 16 pt.
- In IMG_1204 the same stack scrolls up by 332 px: title top 255 px, subtitle top 411 px, switch 578 to 718 px, card top 766 px, card bottom 2188 px (1 pt border), button 2260 px, so the gap from card bottom to the button is 24 pt. The close button stays at y 189 px and floats over the title (the title still centres, so the right 16 pt overlaps the button column at this size).
- IMG_1201 shows the card running under the button without a fade; the last visible row is clipped at y 2260 px.
- A thin vertical scroll indicator is visible at x 1266 px in IMG_1204 (colour #7f7f7f, from y 340 px to 2240 px).
- Row text starts 17 pt inside the card (x 147 px); the Plus column header ends 16.7 pt inside the card right edge.
- Status bar: time at x 124 px (41 pt), digit height 40 px; battery, wifi and signal at the right.

### 2. App Store purchase sheet (IMG_1203)

The system in-app purchase sheet for Go ($8.00 per month) over the dimmed Go paywall (dimmed to about 50 percent: title #7f7f7f, icon #3b5f8f). Reached by tapping the upgrade button's store flow. Dark system sheet, floating, 8 pt side inset.

#### Layout, top to bottom

| Element                                          | Box px (x, y, w, h)                      | Size pt (w x h)                                      | Anchor                      | Fill or colour  | Radius pt     | Status    |
| ------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------- | --------------------------- | --------------- | ------------- | --------- |
| Sheet                                            | 24, 1110, 1236, 1644                     | 412 x 548                                            | L 8, R 8, bottom 8, top 370 | #1c1c1d         | about 34      | ESTIMATED |
| Close button                                     | 81, 1167, 129, 128                       | 43 x 42.7                                            | inside sheet, L 19, top 19  | #3a3a3c         | full circle   | OBSERVED  |
| Title "In-App Purchase" with Apple logo          | 370, 1199, 542, 65                       | 180.7 x 21.7                                         | C, top 399.7                | #ffffff         | n/a           | OBSERVED  |
| App icon (white rounded square, interlaced logo) | 514, 1369, 256, 256                      | 85.3 x 85.3 with soft glow; icon body 240 px = 80 pt | C                           | #fdfdfd         | about 18      | ESTIMATED |
| Product name line                                | 467, 1649, 255, 48                       | 85 x 16                                              | C                           | #ffffff         | n/a           | OBSERVED  |
| Seller line with "13+" badge                     | 481, 1725, 325, 50                       | badge 30.3 x 16.7 (91 x 50 px incl. outline)         | C                           | #98989e         | badge about 4 | OBSERVED  |
| Product type line "Subscription"                 | 491, 1800, 302, 51                       | 100.7 x 17                                           | C                           | #98989e         | n/a           | OBSERVED  |
| Price card                                       | 70, 1925, 1144, 497                      | 381.3 x 165.7                                        | L 23, R 23                  | #313131         | about 33      | ESTIMATED |
| Price line                                       | 120, 1969, 422, 53                       | 140.7 x 17.7                                         | inside card, L 16.7         | #ffffff         | n/a           | OBSERVED  |
| Divider inside card                              | y 2061                                   | 1 pt                                                 | inside card                 | #424244 (faint) | n/a           | OBSERVED  |
| Renewal text, three lines                        | line tops y 2105, 2163, 2221, left x 119 | line pitch 58 px = 19.3 pt                           | inside card, L 16.3         | #fefefe         | n/a           | OBSERVED  |
| Account line                                     | 118, 2346, 540, 31                       | 180 x 10.3                                           | inside card                 | #a0a0a6         | n/a           | OBSERVED  |
| Subscribe button                                 | 445, 2514, 395, 142                      | 131.7 x 47.3                                         | C                           | #4090f7         | full pill     | OBSERVED  |

#### Text

| Text                                                                                                                            | Height px | Est. size pt | Weight   | Colour  | Align  | Status    |
| ------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | -------- | ------- | ------ | --------- |
| "In-App Purchase"                                                                                                               | I cap 49  | 23           | semibold | #ffffff | centre | ESTIMATED |
| "ChatGPT Go"                                                                                                                    | C cap 47  | 22           | medium   | #ffffff | centre | ESTIMATED |
| "ChatGPT", "Subscription"                                                                                                       | C cap 40  | 19           | regular  | #98989e | centre | ESTIMATED |
| "$8.00 per month"                                                                                                               | digit 41  | 19.5         | semibold | #ffffff | left   | ESTIMATED |
| "Cancel anytime in Settings > Apple Account at least a day before each renewal date. Plan automatically renews until canceled." | C cap 33  | 15.5         | regular  | #fefefe | left   | ESTIMATED |
| "Account: <email>"                                                                                                              | A cap 31  | 14.5         | regular  | #a0a0a6 | left   | ESTIMATED |
| "Subscribe"                                                                                                                     | S cap 40  | 19           | semibold | #ffffff | centre | ESTIMATED |

#### Spacing and notes

- The sheet is a floating glass card: 8 pt from the left, right and bottom edges, so the page behind shows in the corners.
- Renewal paragraph: three lines, line pitch 58 px (19.3 pt) on a 15.5 pt face.
- Price card has a hairline divider under the price row and another above the account line; both are about 1 pt and low contrast.

### 3. Usage and limits (IMG_1205, IMG_1212)

A settings sub page titled "Usage and limits" reached from the Settings main list. IMG_1205 is the Free-style state with an agentic limit of "100% remaining" and a "Buy credits" row only. IMG_1212 is the second account state: "Weekly usage limit", "0% remaining", a reset line, and a "Credits remaining" row above "Buy credits".

#### Layout, top to bottom

| Element                                            | Box px (x, y, w, h) | Size pt (w x h)          | Anchor                    | Fill or colour         | Radius pt          | Status    |
| -------------------------------------------------- | ------------------- | ------------------------ | ------------------------- | ---------------------- | ------------------ | --------- |
| Back button                                        | 60, 141, 132, 132   | 44 x 44                  | L 20, top 47              | #1f1f1f                | full circle        | OBSERVED  |
| Title                                              | 427, 183, 432, 55   | 144 x 18.3               | C                         | #ffffff                | n/a                | OBSERVED  |
| Section heading "Agentic usage limit"              | 122, 343, 410, 61   | cap 41 px                | L 41                      | #ffffff                | n/a                | OBSERVED  |
| Info icon (circle with i)                          | 643, 343, 61, 61    | 20.3 x 20.3              | right of heading, 4.6 gap | #afafaf                | full               | OBSERVED  |
| Limit card (IMG_1212)                              | 60, 444, 1164, 330  | 388 x 110                | L 20, R 20                | #1c1c1e                | about 27           | ESTIMATED |
| Limit card (IMG_1205)                              | 60, 444, 1164, 248  | 388 x 82.7               | L 20, R 20                | #1c1c1e                | about 27           | OBSERVED  |
| Progress bar track                                 | 120, 606, 1044, 24  | 348 x 8                  | inside card, L 20         | #203244                | full pill          | OBSERVED  |
| Progress bar fill (IMG_1205, full)                 | 120, 606, 1044, 24  | 348 x 8                  | inside card               | #339cff                | full pill          | OBSERVED  |
| Resets line                                        | 124, 669, 238, 32   | 79 x 10.7                | inside card, L 21         | #cdcdcd                | n/a                | OBSERVED  |
| Second heading "Usage limit resets" with info icon | 124, 867, 550, 61   | cap 42 px                | L 41                      | #ffffff / icon #afafaf | n/a                | OBSERVED  |
| Resets card                                        | 60, 968, 1164, 279  | 388 x 93                 | L 20, R 20                | #1c1c1e                | about 27           | ESTIMATED |
| Resets card body text (two lines)                  | 121, 1049, 824, 115 | line pitch 72 px = 24 pt | inside card, L 20.3       | #cdcdcd                | n/a                | OBSERVED  |
| Section heading "Credits"                          | 123, 1342, 35, 42   | cap 42 px                | L 41                      | #ffffff                | n/a                | OBSERVED  |
| Credits remaining row                              | 60, 1428, 1164, 162 | 388 x 54                 | L 20, R 20                | #1c1c1e                | about 27 (stadium) | ESTIMATED |
| Credits footnote                                   | 123, 1623, 929, 43  | cap 34 px                | L 41                      | #8d8d93                | n/a                | OBSERVED  |
| Buy credits row                                    | 60, 1739, 1164, 162 | 388 x 54                 | L 20, R 20                | #1c1c1e                | about 27 (stadium) | ESTIMATED |
| Chevron in the Buy credits row                     | 1131, 1800, 23, 40  | 7.7 x 13.3               | R 43                      | #59595e                | n/a                | OBSERVED  |

#### Text

| Text                                                   | Height px    | Est. size pt | Weight   | Colour          | Align                  | Status    |
| ------------------------------------------------------ | ------------ | ------------ | -------- | --------------- | ---------------------- | --------- |
| "Usage and limits"                                     | cap about 42 | 19.5         | semibold | #ffffff         | centre                 | ESTIMATED |
| "Agentic usage limit", "Usage limit resets", "Credits" | A cap 41     | 19.5         | semibold | #ffffff         | left                   | ESTIMATED |
| "Weekly usage limit" / "Usage limit"                   | W cap 40     | 19           | regular  | #ffffff         | left                   | ESTIMATED |
| "0% remaining" / "100% remaining"                      | digit 38     | 18           | regular  | #cdcdcd         | right (ends x 1162 px) | ESTIMATED |
| "Resets <day> <time>"                                  | cap 32       | 15           | regular  | #cdcdcd         | left                   | ESTIMATED |
| "No usage limit resets available at this time."        | cap 40       | 19           | regular  | #cdcdcd         | left                   | ESTIMATED |
| "Credits remaining", "<n> Credits"                     | cap 40       | 19           | regular  | white / #cdcdcd | left / right           | ESTIMATED |
| "Credits extend usage beyond your plan limits."        | C cap 34     | 16           | regular  | #8d8d93         | left                   | ESTIMATED |
| "Buy credits"                                          | B cap 40     | 19           | regular  | #0091ff         | left                   | ESTIMATED |

#### Spacing and notes

- Heading text sits 15 pt (44 px) above the first card, matching the settings list pattern (screen 8).
- Cards on this page are larger blocks (82.7 to 110 pt tall and 93 pt tall) but use the same 20 pt side inset and the same corner profile as the 54 pt rows.
- Gaps: card bottom 774 px to next heading top 867 px is 31 pt; Credits card to footnote 33 px (11 pt); footnote bottom 1666 px to Buy credits row 1739 px is 24 pt.
- The progress bar sits 20 pt (60 px) inside the card, so it is narrower than the label row by the same inset as the text.

### 4. Buy credits sheet (IMG_1206)

A floating bottom sheet over the dimmed Usage and limits page (page dimmed to about 55 percent: title #7f7f7f, Buy credits row text dimmed blue). Opened from the "Buy credits" row.

#### Layout, top to bottom

| Element                    | Box px (x, y, w, h) | Size pt (w x h)            | Anchor                              | Fill or colour                 | Radius pt | Status    |
| -------------------------- | ------------------- | -------------------------- | ----------------------------------- | ------------------------------ | --------- | --------- |
| Sheet                      | 24, 1856, 1236, 898 | 412 x 299.3                | L 8, R 8, bottom 8                  | #303030                        | about 34  | ESTIMATED |
| Title "Buy credits"        | 98, 1965, 330, 63   | cap 50 px                  | inside sheet, L 25                  | #ffffff                        | n/a       | OBSERVED  |
| Description, two lines     | 96, 2064, 890, 110  | line pitch 64 px (21.3 pt) | inside sheet, L 24                  | #aeaeae, "Learn more" #3f8ff6  | n/a       | OBSERVED  |
| Credit option box          | 91, 2232, 1102, 186 | 367.3 x 62                 | inside sheet, L 22, R 22            | #212121 with 1 pt white border | full pill | OBSERVED  |
| Option label "100 credits" | 131, 2303, 266, 42  | cap 42 px                  | inside box, L 13                    | #fefefe                        | n/a       | OBSERVED  |
| Option price "$4.00"       | 1007, 2301, 147, 47 | right aligned              | inside box, R 13                    | #ffffff                        | n/a       | OBSERVED  |
| Purchase button            | 94, 2474, 1096, 181 | 365.3 x 60.3               | inside sheet, L 23, R 23, bottom 33 | #ffffff                        | full pill | OBSERVED  |

#### Text

| Text                                                                | Height px | Est. size pt | Weight   | Colour            | Align  | Status    |
| ------------------------------------------------------------------- | --------- | ------------ | -------- | ----------------- | ------ | --------- |
| "Buy credits"                                                       | B cap 50  | 23.5         | bold     | #ffffff           | left   | ESTIMATED |
| "Credits are valid for 12 months from date of purchase. Learn more" | C cap 36  | 17           | regular  | #aeaeae / #3f8ff6 | left   | ESTIMATED |
| "100 credits"                                                       | cap 42    | 19.5         | regular  | #fefefe           | left   | ESTIMATED |
| "$4.00"                                                             | digit 47  | 22           | semibold | #ffffff           | right  | ESTIMATED |
| "Purchase"                                                          | P cap 42  | 19.5         | semibold | #000000           | centre | ESTIMATED |

#### Spacing and notes

- No grabber is visible in the crop of this sheet; the sheet top is flat at y 1856 px (no handle measured, UNKNOWN if one is hidden by the translucent fill).
- The page behind fades but is not blurred in the crop, only darkened.

### 5. Chat home with keyboard and account toast (IMG_1208)

The empty chat screen right after switching account, keyboard open with the composer focused, and a dismissible toast under the header. Dark theme.

#### Layout, top to bottom

| Element                                                | Box px (x, y, w, h)                                                                  | Size pt (w x h) | Anchor                        | Fill or colour                   | Radius pt            | Status    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------- | ----------------------------- | -------------------------------- | -------------------- | --------- |
| Menu button (two-line icon)                            | 60, 141, 132, 132                                                                    | 44 x 44         | L 20, top 47                  | #212121                          | full circle          | OBSERVED  |
| Upgrade pill                                           | 228, 141, 413, 132                                                                   | 137.7 x 44      | L 76, top 47                  | #212121                          | full pill            | OBSERVED  |
| New chat button (speech bubble with a pencil gap)      | 1092, 141, 132, 132                                                                  | 44 x 44         | R 20, top 47                  | #212121                          | full circle          | OBSERVED  |
| Sparkle icon in the pill                               | 280, 174, 67, 67                                                                     | 22.3 x 22.3     | inside pill, L 17             | #48aaff                          | n/a                  | OBSERVED  |
| Toast                                                  | 54, 339, 1176, 175                                                                   | 392 x 58.3      | L 18, R 18, top 113           | #212121 with a 1 pt lighter edge | full pill            | OBSERVED  |
| Toast close (small x in a circle)                      | 96, 399, 56, 56                                                                      | 18.7 x 18.7     | inside toast, L 14            | #414141                          | full circle          | OBSERVED  |
| Toast text                                             | 196, 408, 659, 44                                                                    | cap 36 px       | inside toast, L 47.3          | #ffffff                          | n/a                  | OBSERVED  |
| Toast account avatar (initials on a grey-green circle) | x 1115 to 1220, 105 px wide, vertically centred in the toast (toast centre y 426 px) | 35 wide         | inside toast, R 3.3           | #7f8c8d                          | full circle          | ESTIMATED |
| Composer card                                          | 36, 1551, 1212, 150                                                                  | 404 x 50        | L 12, R 12                    | #212121                          | full pill            | OBSERVED  |
| Plus icon                                              | 81, 1599, 60, 59                                                                     | 20 x 19.7       | inside card, L 15             | #ffffff                          | n/a                  | OBSERVED  |
| Placeholder and caret                                  | 185, 1588, 339, 78                                                                   | cap 40 px       | inside card, L 49.7           | #828282, caret blue              | n/a                  | OBSERVED  |
| Microphone icon                                        | 999, 1591, 57, 72                                                                    | 19 x 24         | inside card, R 64             | #ffffff                          | n/a                  | OBSERVED  |
| Voice (waveform) button                                | 1120, 1574, 104, 104                                                                 | 34.7 x 34.7     | inside card, R 8              | #ffffff                          | full circle          | OBSERVED  |
| Keyboard                                               | 0, 1737, 1284, 1041                                                                  | 428 x 347       | bottom 0                      | #1f1f1f, keys #434343            | top corners about 40 | ESTIMATED |
| Keyboard key (letter row 1)                            | 20, 1894, 108, 133                                                                   | 36 x 44.3       | key pitch 126 px horizontally | #434343                          | about 10             | ESTIMATED |

#### Text

| Text                                 | Height px | Est. size pt              | Weight   | Colour  | Align             | Status    |
| ------------------------------------ | --------- | ------------------------- | -------- | ------- | ----------------- | --------- |
| "Upgrade"                            | U cap 41  | 19.5                      | semibold | #48aaff | left (after icon) | ESTIMATED |
| "Switched to <user name>"            | cap 36    | 17                        | medium   | #ffffff | left              | ESTIMATED |
| "Ask ChatGPT"                        | A cap 40  | 19                        | regular  | #828282 | left              | ESTIMATED |
| Predictive words ("I", "The", "I'm") | n/a       | UNKNOWN (system keyboard) | regular  | #828282 | centre in thirds  | UNKNOWN   |

#### Spacing and notes

- The three header controls have the same 44 pt size and the same y as the back button on the settings sub pages; the header is 44 pt tall from 47 pt to 91 pt.
- The empty chat area between the toast and the composer has no content (no greeting) in this state.
- Keyboard rows: key height about 133 to 135 px (44.7 pt), row pitch 167 px (55.7 pt), key gap 18 px (6 pt), key width 108 to 109 px (36 pt). A predictive strip sits above the first key row (y 1740 to 1890 px). The keyboard has an emoji key and a microphone key in a bottom strip (y 2530 to 2778 px).
- The voice button reads as a white circle with a dark waveform (not a send arrow) while the field is empty.

### 6. Settings main with account switcher sheet (IMG_1209)

The settings main page (title area is a profile block, close button top right) dimmed by a floating account switcher sheet that rises from the bottom. Dark theme. The profile block, upgrade card and first card are measured here; their colours are dimmed to about 50 percent, so the undimmed list colours are measured in screen 8.

#### Layout, top to bottom

| Element                                                                     | Box px (x, y, w, h)                                                            | Size pt (w x h)                      | Anchor                    | Fill or colour                 | Radius pt                 | Status    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ | ------------------------- | ------------------------------ | ------------------------- | --------- |
| Close button                                                                | 1092, 141, 132, 132                                                            | 44 x 44                              | R 20, top 47              | #0a0a0a (dimmed)               | full circle               | OBSERVED  |
| Profile avatar (initials)                                                   | 534, 303, 216, 216                                                             | 72 x 72                              | C, top 101                | #424949 (dimmed grey-green)    | full circle               | OBSERVED  |
| Avatar edit badge (pencil glyph on a dark disc at the avatar's lower right) | UNKNOWN (dark disc overlaps the avatar and is too low in contrast to separate) | UNKNOWN                              | lower right of avatar     | dark, near #1c1c1e             | full circle               | UNKNOWN   |
| Profile name                                                                | 399, 553, 487, 55                                                              | cap about 42 px                      | C                         | #848484 (dimmed white)         | n/a                       | OBSERVED  |
| Upgrade card                                                                | 60, 684, 1164, 283                                                             | 388 x 94.3                           | L 20, R 20                | #111111 (dimmed)               | about 27                  | ESTIMATED |
| Upgrade card button "Upgrade"                                               | 852, 766, 300, 120                                                             | 100 x 40                             | inside card, R 24         | #848484 (dimmed light grey)    | full pill                 | OBSERVED  |
| Section heading "Customize ChatGPT"                                         | 123, 1072, 531, 45                                                             | cap 42 px                            | L 41                      | #5b5b5b (dimmed)               | n/a                       | OBSERVED  |
| Customize card (3 rows: Personalization, Memory, Plugins)                   | 60, 1161, 1164, 486                                                            | 388 x 162                            | L 20, R 20                | #0e0e0f (dimmed #1c1c1e)       | about 27                  | ESTIMATED |
| Account switcher sheet                                                      | 24, 1723, 1236, about 1027                                                     | 412 x 342                            | L 8, R 8, bottom about 9  | #212121 (translucent, blurred) | about 37                  | ESTIMATED |
| Grabber                                                                     | 555, 1740, 174, 12                                                             | 58 x 4                               | C, 5.7 below sheet top    | #67676a                        | full                      | OBSERVED  |
| Account heading row text (an email)                                         | 112, 1838, 895, 60                                                             | cap 42 px                            | inside sheet, L 29.3      | #ffffff                        | n/a                       | OBSERVED  |
| More (three dots)                                                           | 1063, 1856, 74, 15                                                             | 24.7 x 5                             | inside sheet, R 49        | #ffffff                        | dots 5 pt each, pitch 9.7 | OBSERVED  |
| Selected account row highlight                                              | 78, 1949, 1128, 226                                                            | 376 x 75.3                           | inside sheet, L 18        | #4a4a4b (translucent)          | full pill                 | OBSERVED  |
| Account avatar (initials)                                                   | 111, 2439, 151, 151                                                            | 50.3 x 50.3                          | inside row, L 37          | #7f8c8d                        | full circle               | OBSERVED  |
| Account name and plan lines                                                 | 299, 2458, 459, 109                                                            | name cap about 43 px, plan cap 40 px | right of avatar, gap 12.3 | name #ffffff, plan #858586     | n/a                       | OBSERVED  |
| Check mark (selected row)                                                   | 1077, 2040, 47, 44                                                             | 15.7 x 14.7                          | inside row, R 27.3        | #ffffff                        | n/a                       | OBSERVED  |

#### Text

| Text                                                 | Height px    | Est. size pt | Weight           | Colour            | Align           | Status    |
| ---------------------------------------------------- | ------------ | ------------ | ---------------- | ----------------- | --------------- | --------- |
| "<user name>" under the avatar                       | cap about 42 | 20           | semibold         | #848484 (dimmed)  | centre          | ESTIMATED |
| "Do more with ChatGPT"                               | cap about 42 | 19.5         | medium           | dimmed white      | left            | ESTIMATED |
| "Get higher limits and access to advanced features." | cap about 36 | 17           | regular          | dimmed grey       | left, two lines | ESTIMATED |
| "Upgrade" (button)                                   | cap about 42 | 19.5         | medium           | dark              | centre          | ESTIMATED |
| "Customize ChatGPT"                                  | E cap 42     | 19.5         | semibold         | dimmed            | left            | ESTIMATED |
| "Personalization", "Memory", "Plugins"               | cap 40       | 19           | regular          | dimmed white      | left            | ESTIMATED |
| "<email>" (sheet account headings)                   | cap 42       | 19.5         | semibold         | #ffffff           | left            | ESTIMATED |
| "<user name>" and "Free" / "Pro" in sheet rows       | 43 / 40      | 20 / 19      | medium / regular | #ffffff / #858586 | left            | ESTIMATED |

#### Spacing and notes

- Gap from the close button to the avatar: 30 px (10 pt). Avatar bottom 519 px to name top 553 px: 11.3 pt. Name bottom to the upgrade card: 24 px (8 pt) from baseline region to card top 684 px.
- Upgrade card: text left x 128 px (42.7 pt), two-line body, button 100 pt wide at the right.
- The Customize card uses the standard icon row: icon x 129 px, label x 240 px, chevron x 1131 px.
- The sheet's selected account row has a very rounded highlight, 18 pt from the sheet sides; each account block has an email heading with a "..." button, then the account row (avatar 50 pt, name, plan). Block pitch 453 px (151 pt).
- The sheet bottom is cut by the screen bottom curve; the lower card part under the sheet is visible at the very bottom (y 2745 to 2778 px).

### 7. Settings main with subscription alert (IMG_1211)

Settings main scrolled to the Account section, dimmed, with a centred system style alert: "You can't make changes to your subscription inside this app, because you purchased this subscription on another platform." plus a pointer to a web billing page and an OK button.

#### Layout, top to bottom

| Element                                            | Box px (x, y, w, h) | Size pt (w x h)          | Anchor                              | Fill or colour        | Radius pt   | Status    |
| -------------------------------------------------- | ------------------- | ------------------------ | ----------------------------------- | --------------------- | ----------- | --------- |
| Close button                                       | 1092, 141, 132, 132 | 44 x 44                  | R 20, top 47                        | dimmed #0a0a0a        | full circle | OBSERVED  |
| Section heading "Account"                          | 122, 476, 178, 41   | cap 41 px                | L 41                                | #5b5b5b (dimmed)      | n/a         | OBSERVED  |
| Account card, first row with two lines (Email)     | 60, 561, 1164, 237  | 388 x 79                 | L 20, R 20, row 1                   | #0e0e0f (dimmed)      | about 27    | ESTIMATED |
| Email row icon                                     | 129, 616, 61, 49    | 20 x 16.3                | inside card                         | #848484               | n/a         | OBSERVED  |
| Email row label                                    | 240, 618, 127, 43   | cap 43 px                | L 80                                | #848484               | n/a         | OBSERVED  |
| Email row value line "<email>"                     | 123, 699, 675, 41   | cap 41 incl. descender   | L 41                                | #4f4f52               | n/a         | OBSERVED  |
| Phone row ("Phone number", value "<phone number>") | row y 801 to 960    | 53                       | pitch 162                           | dimmed                | n/a         | OBSERVED  |
| Alert                                              | 162, 955, 960, 910  | 320 x 303.3              | C                                   | #2b2b2c (translucent) | about 33    | ESTIMATED |
| Alert title (five lines)                           | 254, 1043, 740, 340 | line pitch 72 px = 24 pt | inside alert, L 30.7                | #ffffff               | n/a         | OBSERVED  |
| Alert body (three lines)                           | 257, 1429, 750, 180 | line pitch 66 px = 22 pt | inside alert, L 31.7                | #7f7f80               | n/a         | OBSERVED  |
| OK button                                          | 210, 1673, 864, 137 | 288 x 45.7               | inside alert, L 16, R 16, bottom 18 | #4b4b4c               | full pill   | OBSERVED  |

#### Text

| Text                     | Height px   | Est. size pt | Weight   | Colour       | Align  | Status    |
| ------------------------ | ----------- | ------------ | -------- | ------------ | ------ | --------- |
| Alert title              | Y cap 41    | 19.5         | semibold | #ffffff      | left   | ESTIMATED |
| Alert body               | P cap 36    | 17           | regular  | #7f7f80      | left   | ESTIMATED |
| "OK"                     | cap 40      | 19           | medium   | #ffffff      | centre | ESTIMATED |
| "Account" heading        | cap 41      | 19.5         | semibold | dimmed white | left   | ESTIMATED |
| "Email" / "Phone number" | cap 43 / 40 | 19           | regular  | dimmed white | left   | ESTIMATED |

#### Spacing and notes

- The Email row is a two-line row: label at the top, the address in the secondary colour below it, left aligned at x 123 px (41 pt, under the icon, not under the label). Row 79 pt tall.
- The Phone number row has its value right aligned in the secondary colour with no chevron, ending at x 1163 px.
- The alert is centred horizontally and sits slightly above the screen centre (centre y 1410 px = 470 pt of 926).
- Corner profile and text sizes of the alert match the screen 24 alert (same 320 pt width).

### 8. Settings main, theme and accent menus (IMG_1213, IMG_1214)

The settings main page scrolled to the lower cards, undimmed, with a small pop-up menu open. IMG_1213 shows the Appearance menu (System with a check, Light, Dark). IMG_1214 shows the Accent color menu with ten colour choices. This is the full measurement of the settings list pattern; later settings pages say "same as screen 8" and list differences.

#### Layout, top to bottom

| Element                                                                                                                       | Box px (x, y, w, h)                             | Size pt (w x h)               | Anchor                         | Fill or colour                                                                                                                                                     | Radius pt   | Status    |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | --------- |
| Close button (floats over scrolled content)                                                                                   | 1092, 141, 132, 132                             | 44 x 44                       | R 20, top 47                   | #1f1f21 (glass)                                                                                                                                                    | full circle | OBSERVED  |
| Account card rows (Subscription, Restore purchases, Age, Usage and limits)                                                    | rows at y 177, 339, 501, 663                    | pitch 162 px (54 pt)          | L 20, R 20                     | #1c1c1d                                                                                                                                                            | about 27    | ESTIMATED |
| Section heading "Theme"                                                                                                       | 122, 925, 18 (T only), 40                       | cap 40 px                     | L 41                           | #afafaf in the menu-dimmed state                                                                                                                                   | n/a         | OBSERVED  |
| Theme card (Appearance, Accent color)                                                                                         | 60, 1010, 1164, 324                             | 388 x 108                     | L 20, R 20                     | #1c1c1d                                                                                                                                                            | about 27    | ESTIMATED |
| Section heading "App settings"                                                                                                | 122, 1427, about 360, 54                        | cap 40 px                     | L 41                           | #afafaf (dimmed by the open menu)                                                                                                                                  | n/a         | OBSERVED  |
| App settings card (General, Notifications, Voice, Parental controls, Trusted contact, Safety, Security and login, Codex, ...) | 60, 1515, 1164, 162 per row                     | pitch 162 px (54 pt)          | L 20, R 20                     | #1c1c1d                                                                                                                                                            | about 27    | ESTIMATED |
| Row icon                                                                                                                      | 129, 1565, 60, 64                               | 20 x 21.3                     | inside card, L 23              | #ffffff outline                                                                                                                                                    | n/a         | OBSERVED  |
| Row label (N of "Notifications")                                                                                              | 240, 1738, 32, 40                               | cap 40 px                     | L 80                           | #ffffff                                                                                                                                                            | n/a         | OBSERVED  |
| Row chevron                                                                                                                   | 1131, 1576, 23, 40                              | 7.7 x 13.3                    | R 23                           | #58585c                                                                                                                                                            | n/a         | OBSERVED  |
| Row value with stepper glyph (Appearance "System")                                                                            | value ends about x 1107 px, stepper at x 1112   | 10.3 x 5.3 per chevron        | R 23                           | #98989f                                                                                                                                                            | n/a         | OBSERVED  |
| Accent colour value "White" with a 14 pt dot                                                                                  | dot about 43 px                                 | 14.3                          | before the label               | #ffffff                                                                                                                                                            | full        | OBSERVED  |
| Separator                                                                                                                     | 235, 1675, 929, 3                               | 309.7 x 1                     | from L 78 to R 40              | #38383a                                                                                                                                                            | n/a         | OBSERVED  |
| Appearance menu                                                                                                               | 414, 1038, 749, 473                             | 249.7 x 157.7                 | R 40, anchored under the value | #303032 (glass, translucent)                                                                                                                                       | about 40    | ESTIMATED |
| Appearance menu item pitch                                                                                                    | 139 px                                          | 46.3                          | x labels at 551 px             | white                                                                                                                                                              | n/a         | OBSERVED  |
| Accent menu                                                                                                                   | 414, 1198, 749, 1450                            | 249.7 x 483.3                 | R 40                           | #313133 (glass)                                                                                                                                                    | about 40    | ESTIMATED |
| Accent menu item                                                                                                              | colour dot 569, 1275, 43, 43; label at x 671 px | dot 14.3, pitch 139 px (46.3) | inside menu, dot L 51.7        | dot colours: blue #4065e8, cyan #4faef8, green #54b8a0, lime #bdd745, yellow #f7ce57, orange #ef876d, pink #ec58a9, magenta #ce70d6, purple #985ef6, white #ffffff | full        | OBSERVED  |
| Menu check mark                                                                                                               | 483, 2532, 36, 35                               | 12 x 11.7                     | inside menu, L 23              | #f7f8f7                                                                                                                                                            | n/a         | OBSERVED  |

#### Text

| Text                                                                                                                                                                                              | Height px    | Est. size pt | Weight   | Colour                              | Align | Status    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------ | -------- | ----------------------------------- | ----- | --------- |
| Row labels ("Subscription", "Restore purchases", "Age", "Usage and limits", "General", "Notifications", "Voice", "Parental controls", "Trusted contact", "Safety", "Security and login", "Codex") | cap 40       | 19           | regular  | #ffffff                             | left  | ESTIMATED |
| Values ("<plan>", "18 or older", "System", "White")                                                                                                                                               | cap 40       | 19           | regular  | #98989f                             | right | ESTIMATED |
| Section headings ("Account", "Theme", "App settings")                                                                                                                                             | cap 40 to 42 | 19 to 19.5   | semibold | #ffffff (grey while a menu is open) | left  | ESTIMATED |
| Menu labels ("System", "Light", "Dark", colour names)                                                                                                                                             | cap 43       | 20           | regular  | #f7f7f7                             | left  | ESTIMATED |

#### Spacing and notes

- Card inset 20 pt each side; card fill #1c1c1d; row pitch 162 px made of a 159 px row plus a 3 px separator.
- Heading to card gap 45 px (15 pt); card bottom to next heading top about 97 px (32 pt).
- Separator runs from x 235 px (inside the icon column) to x 1164 px, so it is 20 pt short of the card right edge and starts under the label, not under the icon. The last row of a card has no separator.
- Card corner: the curve reaches a straight edge about 76 px (25 pt) below the top; best fit about 80 px (27 pt) radius.
- The open menu dims the rest of the page lightly; the page text colours sampled here are therefore a little darker (about 90 percent) than on pages with no menu.
- The menu is a rounded glass panel 249.7 pt wide, right aligned with the value text, 46.3 pt per item, with a check mark in a leading column.

### 9. General settings (IMG_1215)

A settings sub page with five cards: a single row card with a stepper value, a note, a card with icon rows (value with chevron, two toggles), then headed cards for suggestions and an "Automatically use" card with a two-line row. Same as screen 8 for header, cards, separators; differences below.

#### Layout, top to bottom

| Element                                                       | Box px (x, y, w, h)                          | Size pt (w x h) | Anchor               | Fill or colour | Radius pt   | Status    |
| ------------------------------------------------------------- | -------------------------------------------- | --------------- | -------------------- | -------------- | ----------- | --------- |
| Back button                                                   | 60, 141, 132, 132                            | 44 x 44         | L 20, top 47         | #1f1f1f        | full circle | OBSERVED  |
| Title "General"                                               | 542, 185, 200, 43                            | 66.7 x 14.3     | C                    | #ffffff        | n/a         | OBSERVED  |
| Card 1 (Start screen, value, stepper)                         | 60, 408, 1164, 171                           | 388 x 57        | L 20, R 20, top 136  | #1c1c1e        | about 27    | ESTIMATED |
| Footnote under card 1                                         | 123, 613, 700, 41                            | cap 34 px       | L 41                 | #8d8d93        | n/a         | OBSERVED  |
| Card 2 (App language, Auto-correct spelling, Haptic feedback) | 60, 728, 1164, 486                           | 388 x 162       | L 20, R 20           | #1c1c1e        | about 27    | ESTIMATED |
| Section heading "Suggestions"                                 | 123, 1309, 200, 42                           | cap 42 px       | L 41                 | #ffffff        | n/a         | OBSERVED  |
| Card 3 (Search suggestions, Trending searches, two toggles)   | 60, 1395, 1164, 324                          | 388 x 108       | L 20, R 20           | #1c1c1e        | about 27    | ESTIMATED |
| Section heading "Automatically use"                           | 123, 1812, 300, 55 (top of A to bottom of y) | cap 42 px       | L 41                 | #ffffff        | n/a         | OBSERVED  |
| Card 4 (Web search, description, toggle)                      | 60, 1901, 1164, 298                          | 388 x 99.3      | L 20, R 20           | #1c1c1e        | about 27    | ESTIMATED |
| Toggle (on, "Auto-correct spelling")                          | 981, 929, 189, 84                            | 63 x 28         | R 18 inside the card | #30d158        | full pill   | OBSERVED  |

#### Text

| Text                                                                                                                                | Height px                            | Est. size pt | Weight   | Colour  | Align  | Status    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------ | -------- | ------- | ------ | --------- |
| "General"                                                                                                                           | cap about 43                         | 20           | semibold | #ffffff | centre | ESTIMATED |
| "Start screen", "App language", "Auto-correct spelling", "Haptic feedback", "Search suggestions", "Trending searches", "Web search" | cap 42                               | 19.5         | regular  | #ffffff | left   | ESTIMATED |
| "<start screen name>", "English" (values)                                                                                           | cap 42                               | 19.5         | regular  | #98989f | right  | ESTIMATED |
| "Choose where you start when you open ChatGPT."                                                                                     | C cap 34                             | 16           | regular  | #8d8d93 | left   | ESTIMATED |
| Row description "Search the web for real-time info."                                                                                | line height 66 px (22 pt), two lines | 19           | regular  | #afafaf | left   | ESTIMATED |

#### Spacing and notes

- Gap from the header bottom (273 px) to the first card (408 px) is 45 pt when there is no heading above the card.
- The single row card is 57 pt tall (171 px) where its row has a stepper, taller than the 53 pt rows inside multi-row cards; the Safety card with a toggle is 58 pt (174 px).
- Gap between a footnote and the next card: 74 px (24.7 pt) from the footnote bottom (654 px) to card 2 top (728 px).
- The two-line Web search row: title cap top 1958 px, description lines at 2038 and 2104 px (22 pt pitch), toggle centred vertically at the row centre (y 2050 px), icon at the left in the first line band.
- Icons in this page are 20 pt (about 61 px) at x 129 px; the stepper glyph is the same up/down chevron pair as screen 8.

### 10. Notifications (IMG_1216)

A settings sub page: a single card with ten text-only rows, each with a value and a chevron. Same as screen 8 for header, card and separators; differences below.

#### Layout, top to bottom

| Element               | Box px (x, y, w, h)                        | Size pt (w x h) | Anchor              | Fill or colour | Radius pt | Status    |
| --------------------- | ------------------------------------------ | --------------- | ------------------- | -------------- | --------- | --------- |
| Card                  | 60, 408, 1164, 1782                        | 388 x 594       | L 20, R 20, top 136 | #1c1c1e        | about 27  | ESTIMATED |
| Row                   | pitch 162 px (3 px separator after 159 px) | 54              | ten rows            | n/a            | n/a       | OBSERVED  |
| Separator             | 120, 567, 1044, 3                          | 348 x 1         | L 40, R 40          | #38383b        | n/a       | OBSERVED  |
| Row label             | x 123                                      | cap 42 px       | inside card, L 21   | #ffffff        | n/a       | OBSERVED  |
| Value (right aligned) | ends x 1076 px                             | cap 40 px       | before the chevron  | #98989f        | n/a       | OBSERVED  |
| Chevron               | 1131, about +14, 23, 40                    | 7.7 x 13.3      | R 23                | #59595e        | n/a       | OBSERVED  |

#### Text

| Text                                                                                                                                        | Height px | Est. size pt | Weight  | Colour  | Align | Status    |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | ------- | ------- | ----- | --------- |
| Row labels "Codex", "dots", "Group chats", "Health", "Library", "Marketing", "Personalized tips", "Projects", "Responses", "Tasks", "Usage" | C cap 42  | 19.5         | regular | #ffffff | left  | ESTIMATED |
| Values "Push", "Email", "Push and Email"                                                                                                    | P cap 40  | 19           | regular | #98989f | right | ESTIMATED |

#### Spacing and notes

- No icons, so labels start at x 123 px (41 pt) and separators at x 120 px (40 pt).
- The card holds 11 rows in the page (the header row list continues to "Usage"); all rows are one line.

### 11. Voice settings (IMG_1217)

Settings sub page with three cards: voice and model, language and history, and a card of toggle rows with descriptions. Same as screen 8; differences below.

#### Layout, top to bottom

| Element                                                             | Box px (x, y, w, h)            | Size pt (w x h) | Anchor                 | Fill or colour                     | Radius pt | Status    |
| ------------------------------------------------------------------- | ------------------------------ | --------------- | ---------------------- | ---------------------------------- | --------- | --------- |
| Card 1 (Voice with value and chevron, Model with value and stepper) | 60, 408, 1164, 324             | 388 x 108       | L 20, R 20             | #1c1c1e                            | about 27  | ESTIMATED |
| Card 2 (Language with stepper, Dictation history with chevron)      | 60, 837, 1164, 324             | 388 x 108       | gap 35 pt after card 1 | #1c1c1e                            | about 27  | ESTIMATED |
| Card 3 (Start with Voice, Phone Gesture, Background conversations)  | 60, 1266, 1164, 770            | 388 x 256.7     | gap 35 pt after card 2 | #1c1c1e                            | about 27  | ESTIMATED |
| Row 1 of card 3 with description                                    | y 1266 to 1561                 | 98.3            | pitch 295 px           | n/a                                | n/a       | OBSERVED  |
| Row 3 of card 3 (one line)                                          | y 1862 to 2036                 | 58              | n/a                    | n/a                                | n/a       | OBSERVED  |
| Toggle (off), same size and anchor on every toggle row              | right edge x 1170, 189 x 84 px | 63 x 28         | R 18 inside the card   | #59595e track                      | full pill | OBSERVED  |
| Toggle (on, Background conversations)                               | band y 1914 to 1984 at x 1000  | 63 x 28         | same                   | #30d158                            | full pill | OBSERVED  |
| Footnote under card 3                                               | rows from y 2098, two lines    | cap 32 to 34 px | L 41                   | #8d8d93, link "Learn more" #0091ff | n/a       | OBSERVED  |

#### Text

| Text                                                                                                                          | Height px                | Est. size pt | Weight  | Colour  | Align | Status    |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------ | ------- | ------- | ----- | --------- |
| Row labels "Voice", "Model", "Language", "Dictation history", "Start with Voice", "Phone Gesture", "Background conversations" | cap 42                   | 19.5         | regular | #ffffff | left  | ESTIMATED |
| Values "<voice name>", "Live", "English"                                                                                      | cap 42                   | 19.5         | regular | #98989f | right | ESTIMATED |
| Descriptions "Automatically open Voice when you open ChatGPT." and "Raise your phone to your ear to call your dot"            | line pitch 66 px (22 pt) | about 19     | regular | #98989f | left  | ESTIMATED |
| "Keep the conversation going in other apps or while your screen is off. Learn more"                                           | cap 32 to 34             | 16           | regular | #8d8d93 | left  | ESTIMATED |

#### Spacing and notes

- Gap between cards without headings: 105 px (35 pt).
- Toggle rows with descriptions grow to about 98 pt (295 px) and the toggle centres on the first text line block (its centre is at y 1018 px of a 295 px row).
- The Language and Model values use the stepper glyph (menu opens in place); Voice and Dictation history use a chevron (push to another page).

### 12. Parental controls (IMG_1218)

A settings sub page with an intro paragraph, a heading, and one blue action row. Same header as screen 8.

#### Layout, top to bottom

| Element                          | Box px (x, y, w, h)       | Size pt (w x h)          | Anchor        | Fill or colour                | Radius pt       | Status    |
| -------------------------------- | ------------------------- | ------------------------ | ------------- | ----------------------------- | --------------- | --------- |
| Intro paragraph (four lines)     | 125, 465, 1000, 268       | line pitch 72 px = 24 pt | L 41, top 155 | #808080, "Learn more" #0091ff | n/a             | OBSERVED  |
| Section heading "Family Members" | 124, 879, 34 (F only), 41 | cap 41 px                | L 41          | #ffffff                       | n/a             | OBSERVED  |
| Action card "Add family member"  | 60, 965, 1164, 171        | 388 x 57                 | L 20, R 20    | #1c1c1e                       | about 27 (pill) | ESTIMATED |
| Chevron                          | 1118, 1029, 24, 43        | 8 x 14.3                 | R 47          | #98989f                       | n/a             | OBSERVED  |

#### Text

| Text                | Height px | Est. size pt | Weight   | Colour  | Align | Status    |
| ------------------- | --------- | ------------ | -------- | ------- | ----- | --------- |
| Intro paragraph     | P cap 40  | 19           | regular  | #808080 | left  | ESTIMATED |
| "Family Members"    | F cap 41  | 19.5         | semibold | #ffffff | left  | ESTIMATED |
| "Add family member" | A cap 40  | 19           | regular  | #0091ff | left  | ESTIMATED |

#### Spacing and notes

- The intro starts 64 pt (192 px) below the header bottom, with no card around it.
- Heading to card gap 45 px (15 pt), as in screen 8.
- The rest of the page is empty black.

### 13. Trusted contact (IMG_1219)

A settings sub page with a long paragraph block and one blue action row. Same header as screen 8.

#### Layout, top to bottom

| Element                                  | Box px (x, y, w, h) | Size pt (w x h)                                           | Anchor        | Fill or colour        | Radius pt       | Status    |
| ---------------------------------------- | ------------------- | --------------------------------------------------------- | ------------- | --------------------- | --------------- | --------- |
| Paragraph one (three lines)              | 124, 464, 1000, 208 | line pitch 85 px = 28.3 pt                                | L 41, top 155 | #cdcdcd               | n/a             | OBSERVED  |
| Paragraph two (six lines, then the link) | 124, 804, 1000, 520 | line pitch 85 px = 28.3 pt, blank line between paragraphs | L 41          | #cdcdcd, link #0091ff | n/a             | OBSERVED  |
| Action card "Get started"                | 60, 1513, 1164, 162 | 388 x 54                                                  | L 20, R 20    | #1c1c1e               | about 27 (pill) | ESTIMATED |

#### Text

| Text          | Height px | Est. size pt | Weight  | Colour  | Align | Status    |
| ------------- | --------- | ------------ | ------- | ------- | ----- | --------- |
| Paragraphs    | H cap 36  | 17           | regular | #cdcdcd | left  | ESTIMATED |
| "Get started" | cap 40    | 19           | regular | #0091ff | left  | ESTIMATED |

#### Spacing and notes

- Line height is 28.3 pt on a 17 pt face (1.67 times), looser than other pages.
- "Learn more" link sits on its own line directly under the paragraph (line 7 of the second paragraph); the action card is 56.7 pt (170 px) below the link.

### 14. Safety (IMG_1220, IMG_1221)

A settings sub page with one toggle row and a footnote. IMG_1220 and IMG_1221 look identical (same state, off); IMG_1221 is a repeat capture. Same header and card as screen 8.

#### Layout, top to bottom

| Element                                           | Box px (x, y, w, h)     | Size pt (w x h)          | Anchor                      | Fill or colour              | Radius pt       | Status    |
| ------------------------------------------------- | ----------------------- | ------------------------ | --------------------------- | --------------------------- | --------------- | --------- |
| Card with one row                                 | 60, 408, 1164, 174      | 388 x 58                 | L 20, R 20, top 136         | #1c1c1e                     | about 27 (pill) | ESTIMATED |
| Toggle (off)                                      | 981, 453, 189, 84 or so | 63 x 28                  | R 18 inside card            | track #59595e, knob #fdfdfd | full pill       | OBSERVED  |
| Toggle knob                                       | 988, 459, 109, 72       | 36.3 x 24                | inside toggle, left         | #fdfdfd                     | full pill       | OBSERVED  |
| Footnote (3 lines, last line holds the link tail) | 121, 615, 1008, 143     | line pitch 54 px = 18 pt | L 40.3, 13.5 below the card | #8d8d93, link #0091ff       | n/a             | OBSERVED  |

#### Text

| Text                                                                                                     | Height px | Est. size pt | Weight   | Colour  | Align  | Status    |
| -------------------------------------------------------------------------------------------------------- | --------- | ------------ | -------- | ------- | ------ | --------- |
| "Safety"                                                                                                 | S cap 42  | 19.5         | semibold | #ffffff | centre | ESTIMATED |
| "Reduce sensitive content"                                                                               | cap 42    | 19.5         | regular  | #ffffff | left   | ESTIMATED |
| "Add extra safeguards around sensitive topics and limit certain types of content in ChatGPT. Learn more" | cap 34    | 16           | regular  | #8d8d93 | left   | ESTIMATED |

#### Spacing and notes

- The toggle knob sits at the left in the off state and is a wide pill (about 36 x 24 pt) with a lighter 1 pt ring on the track.
- Everything below the footnote is empty black.

### 15. Security and login (IMG_1222, IMG_1223)

A long settings sub page with several headed sections. IMG_1222 is the top; IMG_1223 is scrolled to the end, with the header turned into a blur strip. Same header and cards as screen 8; differences below.

#### Layout, top to bottom (IMG_1222)

| Element                                                                      | Box px (x, y, w, h)                     | Size pt (w x h)                        | Anchor            | Fill or colour               | Radius pt | Status    |
| ---------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------- | ----------------- | ---------------------------- | --------- | --------- |
| Heading "Security recommendations"                                           | 123, 346, 720, 42                       | cap 42 px                              | L 41, top 115     | #ffffff                      | n/a       | OBSERVED  |
| Recommendation card (outlined, two lines)                                    | 60, 432, 1164, 225                      | 388 x 75                               | L 20, R 20        | #212121, 1 pt border #424242 | about 27  | ESTIMATED |
| Status dot                                                                   | 1045, 532, 25, 25                       | 8.3 x 8.3                              | inside card, R 51 | #f6c542                      | full      | OBSERVED  |
| Chevron                                                                      | 1130, 529, 18, 31                       | 6 x 10.3                               | R 45              | #afafaf                      | n/a       | OBSERVED  |
| Card second line                                                             | 118, 564, 560, 43                       | line pitch 72 px (24 pt) from line one | L 39.3            | #afafaf                      | n/a       | OBSERVED  |
| Card "Security keys & passkeys" row with a count and a chevron               | 60, 834, 1164, 162                      | 388 x 54                               | L 20, R 20        | #1c1c1d                      | about 27  | ESTIMATED |
| Footnote under it (three lines, same style as screen 8)                      | left x 118; first line top not measured | line pitch 54 px (18 pt)               | L 39.3            | #8d8d93                      | n/a       | OBSERVED  |
| Card "Account PIN"                                                           | 60, 1377, 1164, 162                     | 388 x 54                               | L 20, R 20        | #1c1c1d                      | about 27  | ESTIMATED |
| Card with two rows ("Authenticator app" value Off, "Text messages" value On) | 60, 1866, 1164, 324                     | 388 x 108                              | L 20, R 20        | #1c1c1d                      | about 27  | ESTIMATED |
| Row card "Active sessions" with a count                                      | 60, 2571, 1164, 162                     | 388 x 54                               | L 20, R 20        | #1c1c1d                      | about 27  | ESTIMATED |

#### Layout (IMG_1223, scrolled)

| Element                                                                                       | Box px (x, y, w, h)                    | Size pt (w x h) | Anchor     | Fill or colour                              | Radius pt | Status   |
| --------------------------------------------------------------------------------------------- | -------------------------------------- | --------------- | ---------- | ------------------------------------------- | --------- | -------- |
| Blurred header zone                                                                           | 0, 0, 1284, 302                        | 428 x 100.7     | top 0      | #0a0a0a (translucent, rows blurred beneath) | n/a       | OBSERVED |
| Cards: "Security history"; "Advanced account security" and "Lockdown mode"; "Require Face ID" | rows at pitch 162 px, toggle row 54 pt | n/a             | L 20, R 20 | #1c1c1d                                     | about 27  | OBSERVED |
| Toggle (off, "Require Face ID")                                                               | right inset as screen 8                | 63 x 28         | R 18       | #59595e                                     | full pill | OBSERVED |
| Vertical scroll indicator                                                                     | x 1266, y 870 to 1850 px               | 3 pt wide       | R 3        | #7f7f7f                                     | full      | OBSERVED |

#### Text

| Text                                                                                                                                                                                               | Height px      | Est. size pt | Weight   | Colour  | Align | Status    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------ | -------- | ------- | ----- | --------- |
| Section headings "Security recommendations", "Log in", "Privacy protection", "Multi-factor Authentication (MFA)", "Sessions", "Advanced security", "Codex"                                         | cap 42         | 19.5         | semibold | #ffffff | left  | ESTIMATED |
| Recommendation title "Review where you're logged in"                                                                                                                                               | R cap about 42 | 19.5         | regular  | #ffffff | left  | ESTIMATED |
| Recommendation line "Log out of devices you don't recognize"                                                                                                                                       | cap 34         | 16           | regular  | #afafaf | left  | ESTIMATED |
| Row labels "Security keys & passkeys", "Account PIN", "Authenticator app", "Text messages", "Active sessions", "Security history", "Advanced account security", "Lockdown mode", "Require Face ID" | cap 42         | 19.5         | regular  | #ffffff | left  | ESTIMATED |
| Values "<count>", "Off", "On"                                                                                                                                                                      | cap 40         | 19           | regular  | #98989f | right | ESTIMATED |
| Footnotes under cards                                                                                                                                                                              | cap 34         | 16           | regular  | #8d8d93 | left  | ESTIMATED |

#### Spacing and notes

- The recommendation card is the only outlined (bordered) card in this part; its fill #212121 is slightly lighter than the normal #1c1c1d.
- Sections repeat heading, card, optional footnote. Heading to card 15 pt; card to footnote 13.5 pt; footnote to next heading about 30 pt.
- Header bar is part of the blur strip when scrolled: back button and title remain over it; the first rows beneath appear blurred and dimmed.

### 16. Codex settings (IMG_1224)

A settings sub page for the Codex agent: a profile row, a Connections block with a trailing action, a cloud agent row with status, an add action, and two cards of toggles and menus. Same header and cards as screen 8; differences below.

#### Layout, top to bottom

| Element                                              | Box px (x, y, w, h)                                 | Size pt (w x h)  | Anchor                             | Fill or colour            | Radius pt   | Status    |
| ---------------------------------------------------- | --------------------------------------------------- | ---------------- | ---------------------------------- | ------------------------- | ----------- | --------- |
| Profile card                                         | 60, 408, 1164, 162                                  | 388 x 54         | L 20, R 20, top 136                | #1c1c1e                   | about 27    | ESTIMATED |
| Profile avatar (initials)                            | 120, 453, 72, 72                                    | 24 x 24          | inside card, L 20                  | #7f8c8d                   | full circle | OBSERVED  |
| Heading row "Connections" with "Disconnect All"      | heading text y 666 to 708; action 872, 673, 288, 35 | action 96 x 11.7 | action right edge x 1160 px (R 41) | action #0091ff            | n/a         | OBSERVED  |
| Connections card                                     | 60, 752, 1164, 455                                  | 388 x 151.7      | L 20, R 20                         | #1c1c1e                   | about 27    | ESTIMATED |
| Cloud icon                                           | 126, 868, 67, 49                                    | 22.3 x 16.3      | inside card, L 22                  | #8d8d8e                   | n/a         | OBSERVED  |
| Small label "Cloud agent"                            | 232, 807, 270, 34                                   | cap 34 px        | L 77.3                             | #afafaf                   | n/a         | OBSERVED  |
| Row title "Cloud"                                    | 232, 870, 130, 42                                   | cap 42 px        | L 77.3                             | #ffffff                   | n/a         | OBSERVED  |
| Status dot and "Connected"                           | dot about 8 pt, text 275 to 520 px                  | cap 34 px        | inside row                         | #19c17d dot, text #afafaf | n/a         | OBSERVED  |
| Toggle (on, Cloud)                                   | 981, 860 to 930 band                                | 63 x 28          | R 18                               | #30d158                   | full pill   | OBSERVED  |
| Add connection row (plus icon and label, no chevron) | plus 135, 1098, 49, 49; label 231, 1102             | plus 16.3 x 16.3 | inside card, L 45                  | #0091ff                   | n/a         | OBSERVED  |
| Heading "Composer"                                   | 123, 1302, 220, 42                                  | cap 42 px        | L 41                               | #ffffff                   | n/a         | OBSERVED  |
| Composer card (two toggles, one stepper row)         | 60, 1388, 1164, 486                                 | 388 x 162        | L 20, R 20                         | #1c1c1e                   | about 27    | ESTIMATED |
| Heading "Behavior"                                   | 123, 1969, 220, 43                                  | cap 42 px        | L 41                               | #ffffff                   | n/a         | OBSERVED  |
| Behavior card (toggle, stepper row)                  | 60, 2056, 1164, 324                                 | 388 x 108        | L 20, R 20                         | #1c1c1e                   | about 27    | ESTIMATED |

#### Text

| Text                                                                                                                           | Height px    | Est. size pt | Weight   | Colour  | Align                      | Status    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------ | -------- | ------- | -------------------------- | --------- |
| "Profile"                                                                                                                      | P cap 40     | 19           | regular  | #ffffff | left                       | ESTIMATED |
| "Connections", "Composer", "Behavior"                                                                                          | cap 42       | 19.5         | semibold | #ffffff | left                       | ESTIMATED |
| "Disconnect All"                                                                                                               | D cap 35     | 16.5         | regular  | #0091ff | right                      | ESTIMATED |
| "Cloud agent"                                                                                                                  | C cap 34     | 16           | regular  | #afafaf | left                       | ESTIMATED |
| "Cloud"                                                                                                                        | C cap 42     | 19.5         | regular  | #ffffff | left                       | ESTIMATED |
| "Connected"                                                                                                                    | cap about 34 | 16           | regular  | #afafaf | left                       | ESTIMATED |
| "Add connection"                                                                                                               | A cap 40     | 19           | regular  | #0091ff | left                       | ESTIMATED |
| "Dismiss keyboard after sending", "Show context window usage", "Follow-up behavior", "Wrap code diff lines", "Live Activities" | cap 42       | 19.5         | regular  | #ffffff | left                       | ESTIMATED |
| Values "Steer", "One per remote"                                                                                               | cap 42       | 19.5         | regular  | #98989f | right (with stepper glyph) | ESTIMATED |

#### Spacing and notes

- The Cloud row has three text lines in a stack (small label, title, status line with a dot) and is about 95 pt tall; a separator at x 247 px (82 pt) divides it from the "Add connection" row.
- The trailing "Disconnect All" action is baseline-aligned with its heading, not centred on it.
- The avatar is a 24 pt circle, smaller than the 50 pt avatar in the account sheet (screen 6).

### 17. Cloud browser (IMG_1225)

A settings sub page for the cloud browser agent: permission rows, a site list action, browser data rows. Same as screen 8; differences below.

#### Layout, top to bottom

| Element                                                                  | Box px (x, y, w, h)                                  | Size pt (w x h)   | Anchor             | Fill or colour    | Radius pt | Status    |
| ------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------- | ------------------ | ----------------- | --------- | --------- |
| Heading "Permissions"                                                    | 123, 346, 380, 42                                    | cap 42 px         | L 41, top 115      | #ffffff           | n/a       | OBSERVED  |
| Card "Default" (value "Always allow" and chevron)                        | 60, 432, 1164, 162                                   | 388 x 54          | L 20, R 20         | #1c1c1e           | about 27  | ESTIMATED |
| Card "Email verification codes" (value "Always ask")                     | 60, 797, 1164, 162                                   | 388 x 54          | gap after footnote | #1c1c1e           | about 27  | ESTIMATED |
| Footnote under "Email verification codes" and heading "Site permissions" | footnote lines from y 691; heading text y 858 to 898 | cap 40 px heading | L 41               | #8d8d93 / #ffffff | n/a       | OBSERVED  |
| Card "Add site" (blue plus and label)                                    | 60, 1292, 1164, 162                                  | 388 x 54          | L 20, R 20         | #1c1c1e           | about 27  | ESTIMATED |
| Heading "Browser data"                                                   | 123, 1594, 330, 42                                   | cap 42 px         | L 41               | #ffffff           | n/a       | OBSERVED  |
| Card (Cookies with chevron, Clear all cookies)                           | 60, 1679, 1164, 324                                  | 388 x 108         | L 20, R 20         | #1c1c1e           | about 27  | ESTIMATED |
| Destructive row label                                                    | 123, 1900, 408, 43                                   | cap 42 px         | L 41               | #ff4245           | n/a       | OBSERVED  |
| Plus icon in "Add site" (same size as the plus in screen 16)             | row y 1292 to 1454; size 49 x 49 px as in IMG_1224   | 16.3 x 16.3       | inside card, L 43  | #0091ff           | n/a       | ESTIMATED |

#### Text

| Text                                                                                   | Height px    | Est. size pt | Weight  | Colour  | Align                  | Status    |
| -------------------------------------------------------------------------------------- | ------------ | ------------ | ------- | ------- | ---------------------- | --------- |
| Row labels "Default", "Email verification codes", "Cookies"                            | cap 43       | 20           | regular | #ffffff | left                   | ESTIMATED |
| Values "Always allow", "Always ask"                                                    | cap 42       | 19.5         | regular | #98989f | right                  | ESTIMATED |
| "Add site"                                                                             | cap about 42 | 19.5         | regular | #0091ff | left                   | ESTIMATED |
| "Clear all cookies"                                                                    | C cap 42     | 19.5         | regular | #ff4245 | left                   | ESTIMATED |
| Footnotes (for example "Choose if ChatGPT asks for approval before opening websites.") | cap 34       | 16           | regular | #8d8d93 | left, line pitch 18 pt | ESTIMATED |

#### Spacing and notes

- Headings sit closer to the previous footnote (about 30 px, 10 pt) than the generic 32 pt gap when the preceding block ends with a footnote.
- The separator inside the last card starts at x 120 px (no icons).

### 18. Storage (IMG_1226, IMG_1235)

A settings sub page showing used storage as a bar and two category rows. IMG_1226 is one account state (a large quota, tiny fill); IMG_1235 is the other account (a 512 MB quota, fill about 64 percent). Same header as screen 8.

#### Layout, top to bottom

| Element                               | Box px (x, y, w, h)                          | Size pt (w x h)                    | Anchor          | Fill or colour            | Radius pt | Status    |
| ------------------------------------- | -------------------------------------------- | ---------------------------------- | --------------- | ------------------------- | --------- | --------- |
| Summary text "<used> of <limit> used" | 87, 350, 446, 41                             | cap 40 px                          | L 28, top 116.7 | #fefefe                   | n/a       | OBSERVED  |
| Bar track                             | 84, 440, 1116, 36                            | 372 x 12                           | L 28, R 28      | #414141                   | full pill | OBSERVED  |
| Bar fill (IMG_1235)                   | 84, 440, 714, 36                             | 238 x 12 (64 percent of the track) | inside track    | #f9f9f9                   | full pill | OBSERVED  |
| Bar fill (IMG_1226)                   | 84, 440, about 70, 36                        | about 23 x 12                      | inside track    | #f9f9f9                   | full pill | OBSERVED  |
| Card                                  | 60, 548, 1164, 336                           | 388 x 112                          | L 20, R 20      | #1c1c1e                   | about 27  | ESTIMATED |
| Row 1 "Documents"                     | y 548 to 713                                 | 55                                 | n/a             | n/a                       | n/a       | OBSERVED  |
| Row 2 "Images"                        | y 716 to 884                                 | 56                                 | n/a             | n/a                       | n/a       | OBSERVED  |
| Separator                             | 120, 713, 1044, 3                            | 348 x 1                            | L 40, R 40      | #38383b                   | n/a       | OBSERVED  |
| Value + chevron                       | value ends x 1066, chevron 1125, 611, 24, 43 | chevron 8 x 14.3                   | R 25            | value and chevron #afafaf | n/a       | OBSERVED  |

#### Text

| Text                                              | Height px    | Est. size pt | Weight  | Colour  | Align | Status    |
| ------------------------------------------------- | ------------ | ------------ | ------- | ------- | ----- | --------- |
| "<used> of 100 GB used" / "<used> of 512 MB used" | C cap 40     | 19           | regular | #fefefe | left  | ESTIMATED |
| "Documents", "Images"                             | cap 38 to 40 | 18 to 19     | regular | #ffffff | left  | ESTIMATED |
| Sizes "<size>"                                    | cap 36 to 38 | 17 to 18     | regular | #afafaf | right | ESTIMATED |

#### Spacing and notes

- The summary and bar use a 28 pt side inset (84 px), 8 pt more than the card inset (20 pt).
- The two rows are slightly uneven (165 and 168 px) because of how the separator is drawn.
- Bar fill proportion matches used over limit (327 of 512 gives 64 percent).

### 19. Data controls (IMG_1227, IMG_1228)

A long settings sub page. IMG_1227 is the top (two toggle cards with footnotes, a Location block, Work network access, a red reset row, an Apps row). IMG_1228 is scrolled to the end (Chat history, Export, Delete) with the header turned into the blur strip. Same as screen 8; differences below.

#### Layout, top to bottom (IMG_1227)

| Element                                                                       | Box px (x, y, w, h)       | Size pt (w x h)               | Anchor                      | Fill or colour | Radius pt | Status    |
| ----------------------------------------------------------------------------- | ------------------------- | ----------------------------- | --------------------------- | -------------- | --------- | --------- |
| Card "Improve model for everyone" with toggle (off)                           | 60, 408, 1164, 162        | 388 x 54                      | L 20, R 20, top 136         | #1c1c1e        | about 27  | ESTIMATED |
| Footnote (three lines, link "Learn more" #0091ff)                             | 87 to 123, 432 to 540     | line pitch 39 display (54 px) | L 41                        | #8d8d93        | n/a       | OBSERVED  |
| Card "Include audio recordings" with toggle (off, lighter grey knob)          | 60, about 828, 1164, 162  | 388 x 54                      | n/a                         | #1c1c1e        | about 27  | ESTIMATED |
| Heading "Location"                                                            | 123, 1237, 230, 41        | cap 41 px                     | L 41                        | #ffffff        | n/a       | OBSERVED  |
| Card (Location services value "Off" in blue, "Allow location access" in blue) | 60, 1322, 1164, 324       | 388 x 108                     | L 20, R 20                  | #1c1c1e        | about 27  | ESTIMATED |
| Card "Work network access" (value, chevron)                                   | 60, about 1903, 1164, 162 | 388 x 54                      | after a three line footnote | #1c1c1e        | about 27  | ESTIMATED |
| Card "Reset ChatGPT Work"                                                     | 60, about 2170, 1164, 162 | 388 x 54                      | gap about 35 pt             | #1c1c1e        | about 27  | ESTIMATED |
| Card "Apps with access" (chevron)                                             | 60, about 2437, 1164, 162 | 388 x 54                      | gap about 35 pt             | #1c1c1e        | about 27  | ESTIMATED |
| Heading "Chat history" (cut at the bottom)                                    | 123, 2693, 200, 43        | cap 42 px                     | L 41                        | #ffffff        | n/a       | OBSERVED  |
| Vertical scroll indicator                                                     | 1266, 312, 9, 1638        | 3 pt wide                     | R 3                         | #7f7f7f        | full      | OBSERVED  |

#### Layout (IMG_1228)

| Element                                                                               | Box px (x, y, w, h) | Size pt (w x h) | Anchor                            | Fill or colour                                           | Radius pt | Status    |
| ------------------------------------------------------------------------------------- | ------------------- | --------------- | --------------------------------- | -------------------------------------------------------- | --------- | --------- |
| Blur header strip                                                                     | 0, 0, 1284, 302     | 428 x 100.7     | top 0                             | #090808 translucent                                      | n/a       | OBSERVED  |
| Card "Archived chats" (chevron), "Archive all chats" (blue), "Delete all chats" (red) | 60, 1715, 1164, 458 | 388 x 152.7     | L 20, R 20                        | #161618 over the dimmed scroll (#1c1c1e when not dimmed) | about 27  | ESTIMATED |
| Card "Export data", "Delete account"                                                  | 60, 2306, 1164, 296 | 388 x 98.7      | gap 44 pt after the previous card | #1c1c1e                                                  | about 27  | ESTIMATED |

#### Text

| Text                                                                                                                                                                                     | Height px | Est. size pt | Weight  | Colour  | Align | Status    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | ------- | ------- | ----- | --------- |
| Row labels ("Improve model for everyone", "Include audio recordings", "Location services", "Work network access", "Apps with access", "Archived chats", "Export data", "Delete account") | cap 42    | 19.5         | regular | #ffffff | left  | ESTIMATED |
| "Off" (Location services)                                                                                                                                                                | cap 42    | 19.5         | regular | #0091ff | right | ESTIMATED |
| "On" (Work network access)                                                                                                                                                               | cap 42    | 19.5         | regular | #98989f | right | ESTIMATED |
| "Allow location access", "Archive all chats"                                                                                                                                             | cap 42    | 19.5         | regular | #0091ff | left  | ESTIMATED |
| "Reset ChatGPT Work", "Delete all chats"                                                                                                                                                 | cap 42    | 19.5         | regular | #ff4245 | left  | ESTIMATED |
| Footnotes                                                                                                                                                                                | cap 34    | 16           | regular | #8d8d93 | left  | ESTIMATED |

#### Spacing and notes

- Standalone cards (no heading) are separated by about 35 pt (105 px), as in screen 11.
- Destructive and blue action rows are plain label rows with no icon, no chevron and no value.
- The toggle in "Include audio recordings" is drawn lighter (grey knob, pressed or disabled style) than the white knob in the first toggle.

### 20. Report app issue sheet (IMG_1229)

A full width sheet opened from a settings row (shake to report), over the dimmed settings list (a row labelled "Voice" shows at the top edge). Dark with a green-tinted black fill. Not a floating inset sheet.

#### Layout, top to bottom

| Element                                                                   | Box px (x, y, w, h)       | Size pt (w x h)          | Anchor                       | Fill or colour                       | Radius pt            | Status    |
| ------------------------------------------------------------------------- | ------------------------- | ------------------------ | ---------------------------- | ------------------------------------ | -------------------- | --------- |
| Sheet                                                                     | 0, 141, 1284, 2637        | 428 x 879                | top 47, L 0, R 0, bottom 0   | #151814                              | top corners about 40 | ESTIMATED |
| Close button                                                              | 1091, 201, 134, 132       | 44.7 x 44                | R 19.7, top 67               | #333730                              | full circle          | OBSERVED  |
| Title "Report app issue"                                                  | 405, 245, 480, 45         | cap about 40 px          | C, centre y 89               | #ffffff                              | n/a                  | OBSERVED  |
| Question "What happened?"                                                 | 111, 420, 445, 52         | cap 42 px                | L 37                         | #ffffff                              | n/a                  | OBSERVED  |
| Text area                                                                 | 60, 552, 1164, 589        | 388 x 196.3              | L 20, R 20                   | #414141                              | about 27             | ESTIMATED |
| Placeholder in the text area                                              | 120, 600, 1005, 45        | cap about 38 px          | inside area, L 20            | #5a5a5a                              | n/a                  | OBSERVED  |
| Character counter "0 / 2000"                                              | 992, 1040, 170, 36        | cap about 32 px          | inside area, R 20, bottom 21 | #8e8e8e                              | n/a                  | OBSERVED  |
| Help paragraph (three lines, links in blue)                               | 108, 1210, 1050, 160      | line pitch 60 px (20 pt) | L 36                         | #9fa19d, links #5a95e6               | n/a                  | OBSERVED  |
| Row separator                                                             | 108, 1432, 1068, 3        | 356 x 1                  | L 36, R 36                   | #343635                              | n/a                  | OBSERVED  |
| Row "Include screenshot in report" with toggle (off)                      | y 1435 to 1636            | 67                       | n/a                          | n/a                                  | n/a                  | OBSERVED  |
| Row "Shake iPhone to report a bug" with toggle (on) and a grey line below | y 1639 to 1749 and beyond | n/a                      | n/a                          | n/a                                  | n/a                  | OBSERVED  |
| Toggle (on)                                                               | 993, 1692, 189, 84        | 63 x 28                  | R 34                         | #63a8f8 (blue, not green)            | full pill            | OBSERVED  |
| Toggle (off)                                                              | 993, 1495, 189, 84        | 63 x 28                  | R 34                         | #545756                              | full pill            | OBSERVED  |
| Send button                                                               | 96, 2502, 1092, 171       | 364 x 57                 | L 32, R 32, bottom 35        | #9fa19d (translucent grey, disabled) | full pill            | OBSERVED  |

#### Text

| Text                                                                                                                                | Height px      | Est. size pt | Weight   | Colour  | Align  | Status    |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------ | -------- | ------- | ------ | --------- |
| "Report app issue"                                                                                                                  | cap about 40   | 19           | semibold | #ffffff | centre | ESTIMATED |
| "What happened?"                                                                                                                    | cap 42         | 19.5         | semibold | #ffffff | left   | ESTIMATED |
| "Tell us about the issue you encountered"                                                                                           | cap about 38   | 18           | regular  | #5a5a5a | left   | ESTIMATED |
| "Any information you share may be reviewed to help improve ChatGPT. Learn more. If you have additional questions, contact support." | cap about 34   | 16           | regular  | #9fa19d | left   | ESTIMATED |
| "Include screenshot in report", "Shake iPhone to report a bug"                                                                      | cap 42         | 19.5         | regular  | #ffffff | left   | ESTIMATED |
| "Toggle off to disable"                                                                                                             | cap about 34   | 16           | regular  | #9fa19d | left   | ESTIMATED |
| "Send"                                                                                                                              | S cap about 40 | 19           | medium   | #1c1c1c | centre | ESTIMATED |

#### Spacing and notes

- The sheet has no card under the toggle rows; rows sit on the sheet fill with full inset separators (36 pt each side).
- The toggle uses the blue accent #63a8f8 here, while the settings pages use iOS green; this is the same accent as the paywall (screen 1).
- The sheet fill is a near black with a slight green tint (#141813 to #151814).
- The keyboard is closed; the Send button is anchored 35 pt from the bottom, above the home indicator zone.

### 21. In-app browser, help center and terms (IMG_1230, IMG_1234)

A web view sheet opened from a settings link, with a top bar (close, host name, menu) and a floating bottom toolbar (back, share, reload, compass). IMG_1230 is the help centre (a light page, with the sheet still translucent, top bar grey). IMG_1234 is the terms page (a dark page, bar fills dark).

#### Layout, top to bottom (IMG_1234)

| Element                                                             | Box px (x, y, w, h) | Size pt (w x h) | Anchor            | Fill or colour                 | Radius pt   | Status   |
| ------------------------------------------------------------------- | ------------------- | --------------- | ----------------- | ------------------------------ | ----------- | -------- |
| Close button                                                        | 48, 182, 144, 144   | 48 x 48         | L 16, top 60.7    | #1f1f1f                        | full circle | OBSERVED |
| Host title "openai.com"                                             | 489, 223, 304, 54   | cap about 40 px | C, centre y 83    | #ffffff                        | n/a         | OBSERVED |
| Menu button (list icon)                                             | 1092, 182, 144, 144 | 48 x 48         | R 16              | #1f1f1f                        | full circle | OBSERVED |
| Page content (brand bar, language select, page title and body text) | starts y about 330  | n/a             | full width        | page black                     | n/a         | OBSERVED |
| Floating toolbar: back circle                                       | 81, 2555, 144, 144  | 48 x 48         | L 27, bottom 28   | #2c2c2c (glass)                | full circle | OBSERVED |
| Floating toolbar: actions pill (share, reload, compass)             | 700, 2550, 504, 144 | 168 x 48        | R 26.7, bottom 28 | #2c2c2c (glass)                | full pill   | OBSERVED |
| Page language selector (web content)                                | 72, 633, 1140, 117  | 380 x 39        | L 24              | black with 1 pt border #333333 | about 4     | OBSERVED |

#### Layout differences (IMG_1230)

| Element                                             | Box px (x, y, w, h)                        | Size pt (w x h)            | Anchor                    | Fill or colour                                   | Radius pt            | Status    |
| --------------------------------------------------- | ------------------------------------------ | -------------------------- | ------------------------- | ------------------------------------------------ | -------------------- | --------- |
| Top bar                                             | 0, 141, 1284, 210                          | 428 x 70                   | top 47                    | #7f7f80 (grey, translucent over the page behind) | top corners about 40 | ESTIMATED |
| Close button and menu button                        | 48, 182 / 1092, 182, 144 x 144             | 48 x 48                    | L 16 / R 16               | glass ring on the grey bar                       | full circle          | OBSERVED  |
| Page (web content, light)                           | from y 351 down                            | n/a                        | full width                | #ffffff                                          | n/a                  | OBSERVED  |
| Chat bubble floating button (web widget), dark disc | right edge x 1248, y 2365 to 2513          | 49.3 tall, R 12            | R 12                      | #181818                                          | full circle          | ESTIMATED |
| Bottom toolbar: back circle and actions pill        | 79, 2552, 148, 140 and 698, 2552, 507, 140 | 49.3 x 46.7 and 169 x 46.7 | L 26, R 26.3, bottom 28.7 | #b6b6b6 and #b9b9b9 (glass over the white page)  | full                 | OBSERVED  |

#### Text

| Text                             | Height px                      | Est. size pt       | Weight   | Colour  | Align  | Status    |
| -------------------------------- | ------------------------------ | ------------------ | -------- | ------- | ------ | --------- |
| "help.openai.com" / "openai.com" | cap about 40                   | 19                 | semibold | #ffffff | centre | ESTIMATED |
| Web page text                    | web content, not app interface | UNKNOWN (web page) | n/a      | n/a     | n/a    | UNKNOWN   |

#### Spacing and notes

- The sheet in IMG_1230 shows the settings page behind its top edge (a row labelled "Voice" shows through the translucent top bar).
- Web content is the site's own; only the bar, close button, menu button and bottom toolbar belong to the app.
- The toolbar floats over the page with no bar background; the page text shows through the glass.
- IMG_1234 shows a blurred strip of page text behind the toolbar buttons, confirming translucency.

### 22. Privacy center (IMG_1231, IMG_1232)

A full screen page on a dark grey ground (#212121, not pure black) with its own close button, a hero block, cards and horizontal card carousels. IMG_1231 is the top; IMG_1232 is scrolled down to the carousel of articles and the resource list.

#### Layout, top to bottom (IMG_1231)

| Element                                             | Box px (x, y, w, h)           | Size pt (w x h)               | Anchor              | Fill or colour                       | Radius pt   | Status    |
| --------------------------------------------------- | ----------------------------- | ----------------------------- | ------------------- | ------------------------------------ | ----------- | --------- |
| Page ground                                         | full screen                   | 428 x 926                     | n/a                 | #212121                              | n/a         | OBSERVED  |
| Close button                                        | 70, 165, 148, 144             | 49.3 x 48                     | L 23.3, top 55      | #3e3e3e                              | full circle | OBSERVED  |
| Shield icon disc                                    | 72, 405, 168, 168             | 56 x 56                       | L 24, top 135       | #f4f9fe with a blue shield glyph     | full circle | OBSERVED  |
| Page title "Privacy center"                         | 77, 629, 575, 82              | cap 64 px                     | L 25.7, top 209.7   | #ffffff                              | n/a         | OBSERVED  |
| Subtitle (two lines)                                | 75, 741, 1113, 124            | line pitch 76 px (25.3 pt)    | L 25                | #cdcdcd                              | n/a         | OBSERVED  |
| Section heading "Explore your options"              | 76, 1000, 537, 55             | cap 40 px                     | L 25.3              | #ffffff                              | n/a         | OBSERVED  |
| Options card (3 rows with icons and chevrons)       | 72, 1107, 1140, 474           | 380 x 158                     | L 24, R 24          | #303030                              | about 25    | ESTIMATED |
| Row icon                                            | 132, 1155, 60, 60             | 20 x 20                       | inside card, L 20   | #ffffff outline                      | n/a         | OBSERVED  |
| Row label                                           | x 233, cap 40                 | n/a                           | L 77.7              | #ffffff                              | n/a         | OBSERVED  |
| Row chevron                                         | 1118, 1170, 18, 31            | 6 x 10.3                      | R 25.3 inside       | #afafaf                              | n/a         | OBSERVED  |
| Row separator                                       | from x 229 to 1164            | 1                             | inset left 76.3     | #3a3a3a                              | n/a         | OBSERVED  |
| Section heading "Our approach to privacy"           | 75, 1711, 633, 55             | cap about 40 px               | L 25                | #fefefe                              | n/a         | OBSERVED  |
| Approach card (carousel, first)                     | 70, 1820, 784, 536            | 261.3 x 178.7                 | L 23.3              | #303030 with a 1 pt lighter border   | about 25    | ESTIMATED |
| Approach card (carousel, second, cut by the screen) | 898, 1816, 386 (visible), 544 | gap 14.7 pt to the first card | n/a                 | #303030                              | about 25    | OBSERVED  |
| Card icon                                           | 138, 1887, 63, 63             | 21 x 21                       | inside card, L 22.7 | #63a8f8                              | n/a         | OBSERVED  |
| Card text "We don't sell your data"                 | 134, 2006, 440, 40            | cap 40 px                     | inside card, L 21.3 | #ffffff                              | n/a         | OBSERVED  |
| Divider                                             | 72, 2478, 1140, 1             | 380 x 0.3                     | L 24, R 24          | #5c5c5e                              | n/a         | OBSERVED  |
| Section heading "Learn and act"                     | 76, 2563, 354, 43             | cap about 40 px               | L 25                | #ffffff                              | n/a         | OBSERVED  |
| Article card (gradient image, first)                | 72, 2668, 780, 110 visible    | 260 wide                      | L 24                | gradient blue #83b2f6 and warm tones | about 25    | OBSERVED  |

#### Layout differences (IMG_1232, scrolled)

| Element                                                             | Box px (x, y, w, h)                | Size pt (w x h)                                        | Anchor                       | Fill or colour                                     | Radius pt   | Status    |
| ------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ | ---------------------------- | -------------------------------------------------- | ----------- | --------- |
| Close button (floats, stays at the top)                             | 70, 165, 148, 144                  | 49.3 x 48                                              | L 23.3, top 55               | #3e3e3e                                            | full circle | OBSERVED  |
| Top fade strip                                                      | 0, 0, 1284, 330                    | 428 x 110                                              | top 0                        | #212121 at high opacity (content scrolls under it) | n/a         | OBSERVED  |
| Article image card (gradient with a faint grid and white dots)      | 72, 716, 780, 780                  | 260 x 260                                              | L 24, top 238.7              | gradient blue to yellow                            | about 25    | ESTIMATED |
| Article card second (cut)                                           | 898, 716                           | visible 386 px                                         | gap 14.7 pt                  | gradient brown to blue                             | about 25    | OBSERVED  |
| Article title (three lines)                                         | 76, 1546, 760, about 190           | line pitch 70 px (23.3 pt), line tops 1546, 1616, 1688 | L 25.3, 16.7 below the image | #ffffff                                            | n/a         | OBSERVED  |
| Article meta "Privacy", "4 min read"                                | 75, 1767, 270, 30                  | cap 30 px                                              | L 25                         | #ffffff                                            | n/a         | OBSERVED  |
| Divider                                                             | 72, 526, 1140, 1                   | 380 x 0.3                                              | L 24, R 24                   | #5c5c5e                                            | n/a         | OBSERVED  |
| Section heading "Helpful resources"                                 | 76, 1965, 420, 52 (with descender) | cap 42 px                                              | L 25                         | #ffffff                                            | n/a         | OBSERVED  |
| Resources card (Privacy policy, Submit a privacy request, Get help) | 72, 2058, 1140, 474                | 380 x 158                                              | L 24, R 24                   | #303030                                            | about 25    | ESTIMATED |
| Resource row pitch                                                  | 159 px (3 px separator #3a3a3a)    | 53                                                     | n/a                          | n/a                                                | n/a         | OBSERVED  |

#### Text

| Text                                                                                                                      | Height px | Est. size pt | Weight   | Colour  | Align                        | Status    |
| ------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | -------- | ------- | ---------------------------- | --------- |
| "Privacy center"                                                                                                          | P cap 64  | 30           | bold     | #ffffff | left                         | ESTIMATED |
| "Clear answers about privacy. Simple ways to stay in control."                                                            | C cap 42  | 19.5         | regular  | #cdcdcd | left, line pitch about 52 px | ESTIMATED |
| "Explore your options", "Our approach to privacy", "Learn and act", "Helpful resources"                                   | E cap 40  | 19           | semibold | #ffffff | left                         | ESTIMATED |
| "Personalized chats & ads", "Chat privacy", "Data use & access", "Privacy policy", "Submit a privacy request", "Get help" | P cap 40  | 19           | regular  | #ffffff | left                         | ESTIMATED |
| "We don't sell your data", "We secure your information"                                                                   | W cap 40  | 19           | regular  | #ffffff | left                         | ESTIMATED |
| Article titles ("How ChatGPT learns about the world while protecting privacy", "Introducing Advanced Account Security")   | H cap 40  | 19           | regular  | #ffffff | left                         | ESTIMATED |
| "Privacy", "4 min read", "Security", "5 min read"                                                                         | P cap 30  | 14           | regular  | #ffffff | left                         | ESTIMATED |

#### Spacing and notes

- Side margin of this page is 24 pt (72 px), 4 pt more than the settings pages (20 pt).
- Carousels run off the right edge: the second card starts 14.7 pt after the first and is cut at the screen edge; no pager dots are visible.
- Option and resource cards use #303030 on the #212121 ground (a 15 level step), versus #1c1c1e on black in settings.
- Heading to card gap about 52 px (17 pt) in this page; page sections are separated by hairline dividers (1 px, #5c5c5e) in addition to space (about 85 px, 28 pt, above the divider and 85 px below).

### 23. About (IMG_1233)

A settings sub page with a single card of three rows with small icons: Terms of use, Privacy policy, and the app name with its version. Same header as screen 8.

#### Layout, top to bottom

| Element                             | Box px (x, y, w, h)                                    | Size pt (w x h)                     | Anchor                  | Fill or colour  | Radius pt | Status    |
| ----------------------------------- | ------------------------------------------------------ | ----------------------------------- | ----------------------- | --------------- | --------- | --------- |
| Card                                | 60, 408, 1164, 544                                     | 388 x 181.3                         | L 20, R 20, top 136     | #1c1c1e         | about 27  | ESTIMATED |
| Row 1 "Terms of use"                | y 408 to 567                                           | 53                                  | n/a                     | n/a             | n/a       | OBSERVED  |
| Row 2 "Privacy policy"              | y 570 to 729                                           | 53                                  | n/a                     | n/a             | n/a       | OBSERVED  |
| Row 3 app name and version          | y 732 to 952                                           | 73.3                                | n/a                     | n/a             | n/a       | OBSERVED  |
| Row icon (document, lock, app logo) | 126, 466, 45, 46 / 127, 627, 45, 49 / 120, 784, 59, 59 | 15 x 15.3 / 15 x 16.3 / 19.7 x 19.7 | inside card, L 22 to 20 | #ffffff outline | n/a       | OBSERVED  |
| Separator                           | 218, 567, 946, 3                                       | 315.3 x 1                           | L 72.7 to R 40          | #38383b         | n/a       | OBSERVED  |
| Version line "<app version>"        | 220, 865, 519, 39                                      | cap 32 px                           | L 73.3                  | #cdcdcd         | n/a       | OBSERVED  |

#### Text

| Text                                                | Height px    | Est. size pt | Weight   | Colour  | Align  | Status    |
| --------------------------------------------------- | ------------ | ------------ | -------- | ------- | ------ | --------- |
| "About"                                             | cap about 42 | 19.5         | semibold | #ffffff | centre | ESTIMATED |
| "Terms of use", "Privacy policy", "ChatGPT for iOS" | cap 40       | 19           | regular  | #ffffff | left   | ESTIMATED |
| "<app version>"                                     | cap 32       | 15           | regular  | #cdcdcd | left   | ESTIMATED |

#### Spacing and notes

- Icons here are smaller (15 pt, 45 px) than the 20 pt icons on the settings main page, so labels start at x 220 px (73.3 pt), not x 240 px (80 pt); separators start at x 218 px.
- No chevrons: the two link rows open the in-app browser (screen 21), no value text is shown.
- The version row has a two-line layout: title then a smaller grey line, 73.3 pt tall.

### 24. System Health access prompt (IMG_1236)

An iOS system permission dialog over the home screen (app icons visible and heavily blurred behind), asking whether to continue allowing health data access. This is an operating system surface, not app UI, and the screenshot was taken after the app was left. It is included for completeness; geometry is the OS dialog.

#### Layout, top to bottom

| Element                                                                               | Box px (x, y, w, h)                                                                                                        | Size pt (w x h)                            | Anchor                       | Fill or colour                                                | Radius pt | Status    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------- | ------------------------------------------------------------- | --------- | --------- |
| Dialog                                                                                | 162, 410, 960, about 1995 (bottom edge near y 2405)                                                                        | 320 x 665                                  | C horizontally, top 136.7    | translucent grey (#464443 to #5b5b5b over a blurred red cast) | about 37  | ESTIMATED |
| Two app icons joined by an arrow (Health heart icon with a hand badge, app logo icon) | first icon with badge 200, 467, 232, 213; exact second icon box UNKNOWN (merged with the arrow and the blurred background) | about 57 x 57 each by eye, UNKNOWN by tool | inside dialog, L 12.7        | white rounded squares                                         | UNKNOWN   | UNKNOWN   |
| Title (two lines)                                                                     | 254, 740 to 830 first line cap 50, second line below                                                                       | line pitch UNKNOWN (not measured)          | inside dialog, L 30.7        | #ffffff                                                       | n/a       | OBSERVED  |
| Data categories box                                                                   | 211, 1575, 862, 403                                                                                                        | 287 x 134.3                                | inside dialog                | #262627 (translucent)                                         | about 27  | ESTIMATED |
| Button "Continue to Allow"                                                            | 210, 2050, 864, 144                                                                                                        | 288 x 48                                   | inside dialog, L 16, R 16    | #4c5051 translucent                                           | full pill | OBSERVED  |
| Button "Remove Access"                                                                | 210, 2218, 864, 144                                                                                                        | 288 x 48                                   | 8 gap after the first button | #4c5051 translucent                                           | full pill | OBSERVED  |

#### Text

| Text                                                            | Height px    | Est. size pt | Weight   | Colour  | Align  | Status    |
| --------------------------------------------------------------- | ------------ | ------------ | -------- | ------- | ------ | --------- |
| Title "Allow "ChatGPT" to continue accessing your Health data?" | not measured | UNKNOWN      | semibold | #ffffff | left   | UNKNOWN   |
| Body text (explanation and quoted app reason)                   | not measured | UNKNOWN      | regular  | grey    | left   | UNKNOWN   |
| "<health categories list>"                                      | not measured | UNKNOWN      | regular  | grey    | left   | UNKNOWN   |
| "Continue to Allow", "Remove Access"                            | cap 42       | 19.5         | regular  | #ffffff | centre | ESTIMATED |

#### Spacing and notes

- The dialog uses a blurred glass material over the home screen; its fill colour shifts with the wallpaper, so every fill value here is only valid for this capture.
- The status bar time and battery are dimmed (about 60 percent) by the dialog backdrop.
- Dialog width (320 pt) equals the in-app alert width in screen 7; the buttons are 288 x 48 pt pills, 16 pt inside the dialog sides.
