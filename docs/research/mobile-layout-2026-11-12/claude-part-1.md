# Claude on iPhone: layout measurements, part 1 (observed 2026-11-12)

Status: Historical snapshot
Owner: Product (founder)
Last updated: 2026-11-12

Screenshots IMG_1237 to IMG_1268 of the founder's reference set, 1284 x 2778 pixels at scale 3 (428 x 926 points). Method, tool and limits are in `docs/research/mobile-layout-2026-11-12/README.md`. Sizes are points unless a column says pixels. OBSERVED means read from pixels by the tool; ESTIMATED means derived (text size from cap height, weight and radius by fit); UNKNOWN means not readable from a screenshot.

Theme in this part: light, except dimmed backdrops behind sheets. Claude uses its own typefaces (a grotesque sans for interface text, a serif for the greeting and for spoken replies), so every text size below is ESTIMATED with the SF Pro ratio 0.705 (cap height px / 3 / 0.705) and is plus or minus 1 point; the real ratio of these faces is not known. Interface text in this part measures larger than the same role in an SF Pro app: body and row labels read about 20 to 21 points. Screen background is #f9f9f7 (OBSERVED), primary text #131313 or #0b0b0b, secondary text #7a7974 or #888781, hairlines #e1e1df to #e6e7e6, neutral chip fill #f0efec, brand accent terracotta (star #cc7c5d, active send button #b96647).

The sidebar or drawer is not shown in this range (the menu button at top left is never opened here). The plus menu is the "Add to Chat" sheet (screen 2), the model picker is screen 6, and the effort control is a row inside the model picker (screen 6).

## Shared components seen in this part

| Component                        | Metric                             | Value                                                                                                                                                                                                           | Screenshot                   | Status                               |
| -------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------ |
| Screen frame                     | Status bar height                  | 47 pt (141 px); time text 12:37 spans x 156 to 289 px, digits 40 px tall                                                                                                                                        | IMG_1237                     | OBSERVED                             |
| Screen frame                     | Header bar                         | no bar fill; floating circle buttons only, circle top at y 139 px (46 pt), circle size 136 px (45 pt), centre y 207 px (69 pt)                                                                                  | IMG_1237                     | OBSERVED                             |
| Screen frame                     | Side margin of main content        | 16 pt composer card (47 px); 17 to 20 pt lists (51 to 58 px); circle buttons L 19 and R 19 (58 px)                                                                                                              | IMG_1237, IMG_1263, IMG_1266 | OBSERVED                             |
| Chat header                      | Left control                       | circle button 136 x 136 px (45 pt), fill #f8f9f7 with white 1 px ring and soft shadow, glyph is three horizontal lines (54 x 48 px, colour #343430, third line half length)                                     | IMG_1237                     | OBSERVED                             |
| Chat header                      | Right control                      | circle 136 x 136 px at x 1090 to 1226; ghost glyph 54 x 54 px (18 pt)                                                                                                                                           | IMG_1237                     | OBSERVED                             |
| Chat header                      | Title text size                    | "Incognito chat" cap about 33 px, about 15.5 pt, regular, centred; other list screens use 21 pt semibold titles                                                                                                 | IMG_1250, IMG_1251           | ESTIMATED                            |
| Chat header                      | Gaps                               | circle to screen edge 19 pt both sides; no title on the home screen                                                                                                                                             | IMG_1237                     | OBSERVED                             |
| Composer at rest                 | Card left and right inset          | 47 px each side (16 pt), card x 47 to 1237                                                                                                                                                                      | IMG_1237                     | OBSERVED                             |
| Composer at rest                 | Card height                        | 158 px (52.7 pt), y 2519 to 2677 (single line, placeholder inline with controls)                                                                                                                                | IMG_1237                     | OBSERVED                             |
| Composer at rest                 | Card radius                        | about 26 pt (full pill)                                                                                                                                                                                         | IMG_1237                     | ESTIMATED                            |
| Composer at rest                 | Card fill                          | #fbfbf9, 1 px white edge, soft drop shadow below                                                                                                                                                                | IMG_1237                     | OBSERVED                             |
| Composer at rest                 | Placeholder "Type or hold to talk" | cap 41 px, about 19.5 pt, regular, colour #7a7974, starts x 221 px                                                                                                                                              | IMG_1237                     | ESTIMATED                            |
| Composer at rest                 | Plus button                        | 108 px (36 pt) circle, fill #f0efec, x 72 to 180, y 2544 to 2652; plus glyph 39 px (13 pt) #131313                                                                                                              | IMG_1237                     | OBSERVED                             |
| Composer at rest                 | Microphone button                  | 108 px (36 pt) circle, fill #f0efec, x 972 to 1080; microphone glyph 42 x 48 px (14 x 16 pt) #383835                                                                                                            | IMG_1237                     | OBSERVED                             |
| Composer at rest                 | Voice button                       | 108 px (36 pt) circle, fill #131313, x 1104 to 1212; waveform glyph of 5 bars, tallest 54 px (18 pt), white                                                                                                     | IMG_1237                     | OBSERVED                             |
| Composer at rest                 | Gap between controls               | mic to voice button 24 px (8 pt); controls 25 px (8 pt) inside the card edge                                                                                                                                    | IMG_1237                     | OBSERVED                             |
| Composer at rest                 | Card bottom to screen bottom       | 101 px (33.7 pt)                                                                                                                                                                                                | IMG_1237                     | OBSERVED                             |
| Composer, keyboard open          | Card geometry                      | x 24 to 1260 (inset 8 pt), y 1413 to 1713 (height 300 px, 100 pt), two rows: text area on top, controls row below; radius about 25 pt; card bottom to keyboard top about 22 px (7 pt)                           | IMG_1247                     | OBSERVED, radius ESTIMATED           |
| Composer, keyboard open          | Placeholder "Chat with Claude"     | cap about 43 px, about 20 pt, colour #7a7974, text starts x 65 px (cursor at x 60)                                                                                                                              | IMG_1247                     | ESTIMATED                            |
| Composer, keyboard open          | Model chip                         | pill 369 x 108 px (123 x 36 pt), fill #f0efec, x 180 to 549, right of the plus button by 24 px; label "Haiku 5.5" in #131313 plus effort word "Low" in #7a7974, cap 33 px (about 15.5 pt)                       | IMG_1247                     | OBSERVED, size ESTIMATED             |
| Composer, keyboard open          | Buttons                            | plus x 48 to 156, mic x 996 to 1104, voice button x 1128 to 1236, all 108 px circles at y 1581 to 1689, 24 px (8 pt) inside the card                                                                            | IMG_1247                     | OBSERVED                             |
| Composer with text or attachment | Send button                        | 108 px (36 pt) circle; active fill #b96647 with white up-arrow 52 px (17 pt); disabled fill #e0bfb1 (about 40 percent of the active colour) with a faded arrow                                                  | IMG_1240, IMG_1257           | OBSERVED                             |
| Composer with text or attachment | Attachment chip                    | not shown in this range                                                                                                                                                                                         | none                         | UNKNOWN                              |
| Model picker                     | Container kind                     | bottom sheet with grabber (detent state IMG_1248, full-height state IMG_1249)                                                                                                                                   | IMG_1248, IMG_1249           | OBSERVED                             |
| Model picker                     | Container size                     | detent: x 24 to 1260 (inset 8 pt), top y 1289, bottom inset 24 px; full: x 0 to 1284, top y 141; top radius about 37 pt                                                                                         | IMG_1248, IMG_1249           | OBSERVED, radius ESTIMATED           |
| Model picker                     | Container fill                     | #f9f9f7 sheet, content cards #ffffff                                                                                                                                                                            | IMG_1249                     | OBSERVED                             |
| Model picker                     | Row height                         | 227 px (75.7 pt) in the full state, 219 px (73 pt) in the detent state                                                                                                                                          | IMG_1249, IMG_1248           | OBSERVED                             |
| Model picker                     | Model name                         | cap 44 px, about 21 pt, regular, #131313, text starts 63 px (21 pt) inside the card                                                                                                                             | IMG_1249                     | ESTIMATED                            |
| Model picker                     | Description                        | 2nd line, cap about 36 px, about 17 pt, #7a7974, 54 px below the name top                                                                                                                                       | IMG_1249                     | ESTIMATED                            |
| Model picker                     | Logo or icon                       | none; rows are text only                                                                                                                                                                                        | IMG_1249                     | OBSERVED                             |
| Model picker                     | Check mark                         | 50 x 49 px (16.5 pt), colour #3868b9, right edge 68 px (22.7 pt) inside the card                                                                                                                                | IMG_1249                     | OBSERVED                             |
| Model picker                     | Section heading                    | none; separate rounded cards "Effort" and "More models"                                                                                                                                                         | IMG_1249                     | OBSERVED                             |
| Effort or thinking control       | Kind                               | a card row "Effort" with value "Low" and chevron that opens a further level (not shown); no slider in this range                                                                                                | IMG_1249                     | OBSERVED                             |
| Effort or thinking control       | Size                               | row 162 px (54 pt) tall, card x 60 to 1224, gap above 48 px (16 pt); label cap 44 px (about 21 pt); value "Low" cap 36 px (about 17 pt) #7a7974; chevron 23 x 40 px (7.7 x 13 pt) #c5c5c7                       | IMG_1249                     | OBSERVED                             |
| Attach or plus menu              | Container kind                     | bottom sheet "Add to Chat" with a photo strip on top and white rows below                                                                                                                                       | IMG_1238                     | OBSERVED                             |
| Attach or plus menu              | Tile or row size                   | tile 300 x 300 px (100 pt) detent, 312 px (104 pt) full state; rows 156 px (52 pt) detent, 159 to 162 px (53 to 54 pt) full state                                                                               | IMG_1238, IMG_1239           | OBSERVED                             |
| Attach or plus menu              | Icon size                          | row icons 52 to 58 px (17 to 19 pt), colour #52514e                                                                                                                                                             | IMG_1238                     | OBSERVED                             |
| Attach or plus menu              | Label text size                    | cap 43 px, about 20 pt, regular, #131313                                                                                                                                                                        | IMG_1238                     | ESTIMATED                            |
| Attach or plus menu              | Items per row                      | photo strip: 1 camera tile then thumbnails scrolling off the right edge; list: 1 item per row, 5 rows in 2 cards                                                                                                | IMG_1238                     | OBSERVED                             |
| Sidebar or drawer                | all metrics                        | not shown in this range                                                                                                                                                                                         | none                         | UNKNOWN                              |
| Messages                         | User bubble                        | x 385 to 1236 (right margin 48 px, 16 pt), 147 px (49 pt) tall for a single line, fill #f0efec, radius about full pill (24.5 pt), text padding 50 px (16.7 pt) left, text cap about 43 px (about 20 pt) #131313 | IMG_1243                     | OBSERVED, size ESTIMATED             |
| Messages                         | Assistant text                     | serif, no bubble, text starts x 50 px (16.7 pt); line pitch 82 px (27.3 pt); lines 57 px tall with descenders; text size about 20 pt                                                                            | IMG_1243                     | ESTIMATED                            |
| Messages                         | Action row                         | thumbs up and thumbs down icons 39 x 42 px (13 x 14 pt) #7a7974, 93 px (31 pt) apart, 60 px (20 pt) from the left edge                                                                                          | IMG_1243                     | OBSERVED                             |
| Settings list                    | all metrics                        | no settings screen in this range                                                                                                                                                                                | none                         | UNKNOWN                              |
| Sheets and dialogs               | Corner radius                      | sheets about 37 pt; popover menus about 36 pt; alert dialog about 33 pt                                                                                                                                         | IMG_1238, IMG_1252, IMG_1256 | ESTIMATED                            |
| Sheets and dialogs               | Grabber                            | 174 x 12 px (58 x 4 pt), #bfbfbf, y 1306 to 1318 (top of sheet plus 17 px) in the detent state                                                                                                                  | IMG_1238                     | OBSERVED                             |
| Sheets and dialogs               | Title text size                    | cap 43 to 44 px, about 20.5 pt, semibold, centred                                                                                                                                                               | IMG_1238, IMG_1249           | ESTIMATED                            |
| Sheets and dialogs               | Close button                       | circle about 130 px (43 pt) at x 80 to 211 (detent) or 58 to 194 (full), fill #f9f9f7 with ring, X glyph 46 px (15 pt) #363632                                                                                  | IMG_1238, IMG_1239           | OBSERVED                             |
| Buttons                          | Primary button                     | height 144 px (48 pt), radius full (24 pt), fill #131313, white label cap about 44 px (about 20.5 pt), x 73 to 1211 in the consent sheet                                                                        | IMG_1246                     | OBSERVED                             |
| Buttons                          | Secondary button                   | same size, fill transparent, 1 pt outline about #d8d8d6, label #131313                                                                                                                                          | IMG_1246                     | OBSERVED, outline colour approximate |
| Paywall or upgrade               | all metrics                        | not shown in this range                                                                                                                                                                                         | none                         | UNKNOWN                              |
| Voice mode                       | Main controls                      | mic circle 192 px (64 pt) centred x 642; bottom row circles 136 px (45 pt)                                                                                                                                      | IMG_1242                     | OBSERVED                             |

## Screens

### 1. Home with composer, dictation and tooltip (IMG_1237, IMG_1247, IMG_1240, IMG_1241)

The empty chat home screen, light theme. IMG_1237 is the resting state with a one-time tooltip over the voice button. IMG_1247 is the same screen with the keyboard open, the composer grown into two rows and a model chip. IMG_1240 and IMG_1241 are dictation: the composer card shows the transcript and a live waveform in place of the controls.

#### Layout, top to bottom

| Element                                 | Box px (x, y, w, h)  | Size pt (w x h) | Anchor                                                             | Fill or colour                                                             | Radius pt   | Status                     |
| --------------------------------------- | -------------------- | --------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------- | -------------------------- |
| Menu button (IMG_1237)                  | 58, 139, 136, 136    | 45.3 x 45.3     | L 19, top 46                                                       | #f8f9f7, white ring, soft shadow                                           | full (22.7) | OBSERVED                   |
| Menu glyph                              | 99, 184, 54, 48      | 18 x 16         | inside button, centred                                             | #343430                                                                    | n/a         | OBSERVED                   |
| Ghost button (incognito)                | 1090, 139, 136, 136  | 45.3 x 45.3     | R 19, top 46                                                       | same as menu button                                                        | full        | OBSERVED                   |
| Ghost glyph                             | 1131, 181, 54, 54    | 18 x 18         | inside button                                                      | #353531                                                                    | n/a         | OBSERVED                   |
| Status bar dot (dictation only)         | 905, 20, 14, 14      | 4.7 x 4.7       | top 7                                                              | #f1aa66 (orange recording indicator)                                       | full        | OBSERVED                   |
| Brand star                              | 583, 1270, 118, 118  | 39.3 x 39.3     | C, centre y 1329 px (443 pt) when composer at rest                 | #cc7c5d                                                                    | n/a         | OBSERVED                   |
| Greeting                                | 117, 1453, 1050, 75  | 350 x 25        | C, 65 px (22 pt) below the star                                    | #383835                                                                    | n/a         | OBSERVED                   |
| Voice tooltip                           | 547, 2308, 701, 203  | 233.7 x 67.7    | R 12 (36 px), 8 px above the card, tail points at the voice button | #131313                                                                    | about 12    | OBSERVED, radius ESTIMATED |
| Tooltip tail                            | 1100, 2511, 140, 14  | 46.7 x 4.7      | centred over the voice button (x 1158)                             | #131313                                                                    | n/a         | OBSERVED                   |
| Composer card, rest                     | 47, 2519, 1190, 158  | 396.7 x 52.7    | L 16, R 16, bottom 33.7                                            | #fbfbf9, white edge, soft shadow                                           | about 26    | OBSERVED                   |
| Plus button                             | 72, 2544, 108, 108   | 36 x 36         | inside card, L 8                                                   | #f0efec                                                                    | full        | OBSERVED                   |
| Placeholder                             | 221, 2578, 440, 55   | 146.7 x 18      | after plus button by 41 px (13.7 pt)                               | #7a7974                                                                    | n/a         | OBSERVED                   |
| Mic button                              | 972, 2544, 108, 108  | 36 x 36         | inside card                                                        | #f0efec                                                                    | full        | OBSERVED                   |
| Voice button                            | 1104, 2544, 108, 108 | 36 x 36         | inside card, R 8                                                   | #131313, white bars                                                        | full        | OBSERVED                   |
| Composer card, keyboard open (IMG_1247) | 24, 1413, 1236, 300  | 412 x 100       | L 8, R 8, above keyboard 7                                         | #fbfbfa, white edge                                                        | about 25    | OBSERVED                   |
| Plus button (IMG_1247)                  | 48, 1581, 108, 108   | 36 x 36         | inside card, L 8, bottom 8                                         | #f0efec                                                                    | full        | OBSERVED                   |
| Model chip (IMG_1247)                   | 180, 1581, 369, 108  | 123 x 36        | after plus by 8                                                    | #f0efec                                                                    | full (18)   | OBSERVED                   |
| Mic button (IMG_1247)                   | 996, 1581, 108, 108  | 36 x 36         | inside card                                                        | #f0efec                                                                    | full        | OBSERVED                   |
| Voice button (IMG_1247)                 | 1128, 1581, 108, 108 | 36 x 36         | inside card, R 8                                                   | #131313                                                                    | full        | OBSERVED                   |
| Greeting (IMG_1247)                     | 117, 899, 1050, 75   | 350 x 25        | C, above the composer                                              | #383835                                                                    | n/a         | OBSERVED                   |
| Brand star (IMG_1247)                   | 583, 716, 118, 118   | 39.3 x 39.3     | C                                                                  | #cc7c5d                                                                    | n/a         | OBSERVED                   |
| Composer card, dictation (IMG_1240)     | 47, 2376, 1190, 300  | 396.7 x 100     | L 16, R 16, bottom 34                                              | #fbfbfa                                                                    | about 25    | OBSERVED                   |
| Cancel button (dictation)               | 72, 2540, 108, 108   | 36 x 36         | inside card, L 8, bottom 8                                         | #f0efec, X glyph 49 x 49 px                                                | full        | OBSERVED                   |
| Waveform                                | 241, 2561, 694, 75   | 231 x 25        | between cancel and stop buttons                                    | bars #131313, each 10 px wide, up to 73 px tall, quiet bars are 10 px dots | n/a         | OBSERVED                   |
| Stop button                             | 972, 2544, 108, 108  | 36 x 36         | inside card                                                        | #f0efec, stop square 36 x 36 px                                            | full        | OBSERVED                   |
| Send button (dictation)                 | 1104, 2544, 108, 108 | 36 x 36         | inside card, R 8                                                   | #b96647, white up-arrow                                                    | full        | OBSERVED                   |
| Transcript text                         | 92, 2437, 1080, 57   | 360 x 19        | card top plus 61 px (20 pt)                                        | #131313                                                                    | n/a         | OBSERVED                   |

#### Text

| Text                                      | Height px                             | Est. size pt           | Weight   | Colour  | Align                                   | Status    |
| ----------------------------------------- | ------------------------------------- | ---------------------- | -------- | ------- | --------------------------------------- | --------- |
| "Afternoon, <user name>" greeting (serif) | cap 57 (full line 75 with descender)  | 27                     | regular  | #383835 | centre                                  | ESTIMATED |
| "Try voice mode to talk with Claude"      | cap 40 (T), 2 lines, line pitch 80 px | 19                     | regular  | #ffffff | left, 54 px (18 pt) inside the tooltip  | ESTIMATED |
| "Type or hold to talk"                    | cap 41                                | 19.5                   | regular  | #7a7974 | left                                    | ESTIMATED |
| "Chat with Claude"                        | cap about 43                          | 20                     | regular  | #7a7974 | left                                    | ESTIMATED |
| "Haiku 5.5"                               | cap 33                                | 15.5                   | regular  | #131313 | left in chip, 51 px (17 pt) inside chip | ESTIMATED |
| "Low"                                     | cap 32                                | 15                     | regular  | #7a7974 | after model name, 18 px (6 pt) gap      | ESTIMATED |
| <message text> transcript                 | cap about 43                          | 20                     | regular  | #131313 | left, x 92                              | ESTIMATED |
| Status time "12:37"                       | digits 40                             | not estimated (system) | semibold | #000000 | left of notch                           | OBSERVED  |

#### Spacing and notes

- The home screen has no title and no search field. All content is centred; the star-plus-greeting group sits above the composer in the keyboard state (greeting centre y about 936 px) and in the lower middle at rest (greeting top y 1453 px, 52 percent of the screen height).
- The greeting is one line, fits 350 pt width with 33 pt margins; it is set in a serif face, unlike all other text.
- Distance between the star bottom (y 1388) and the greeting cap top (y 1453) is 65 px (21.7 pt).
- The composer card is two layouts: at rest it is one 52.7 pt row (plus, placeholder, mic, voice button); once focused it becomes 100 pt tall with the text line above and the controls row below, and the card width goes from a 16 pt inset to an 8 pt inset.
- The model chip appears only in the focused state; at rest the placeholder takes its place.
- The tooltip is dark (#131313) with white text and a small downward tail aligned to the centre of the voice button; its bottom touches the top edge of the card (8 px gap above the card top border).
- Dictation replaces the model chip, mic and voice button with cancel, waveform, stop and send; the card keeps its 100 pt height. A small orange dot shows above the signal icons in the status bar while recording.
- Shadow: the card and circle buttons carry a very soft shadow of about 30 px (10 pt) spread and 6 percent opacity; exact values UNKNOWN.

### 2. Add to Chat sheet (IMG_1238, IMG_1239)

The plus menu. A bottom sheet titled "Add to Chat" with a photo strip and two white cards of rows. IMG_1238 is the medium detent over the dimmed home screen; IMG_1239 is the same sheet taller and full width (the lower card is entirely visible and the sheet reaches the status bar).

#### Layout, top to bottom

| Element                               | Box px (x, y, w, h)                                                     | Size pt (w x h)   | Anchor                                   | Fill or colour                                            | Radius pt               | Status                     |
| ------------------------------------- | ----------------------------------------------------------------------- | ----------------- | ---------------------------------------- | --------------------------------------------------------- | ----------------------- | -------------------------- |
| Dim overlay (IMG_1238)                | 0, 0, 1284, 1289                                                        | full width        | behind sheet                             | page #f9f9f7 darkened to #c7c7c5 (about 20 percent black) | n/a                     | OBSERVED                   |
| Sheet (IMG_1238)                      | 24, 1289, 1236, 1465                                                    | 412 x 488.3       | L 8, R 8, bottom 8 (bottom at y 2754)    | #f9f9f7                                                   | top and bottom about 37 | OBSERVED, radius ESTIMATED |
| Grabber (IMG_1238)                    | 555, 1306, 174, 12                                                      | 58 x 4            | C, top of sheet plus 17 px               | #bfbfbf                                                   | full                    | OBSERVED                   |
| Close button                          | 80, 1350, 131, 125                                                      | 43.7 x 41.7       | inside sheet, L 19                       | #f9f9f7 with 1 px ring                                    | full                    | OBSERVED                   |
| Title "Add to Chat"                   | 485, 1389, 312, 43                                                      | 104 x 14          | C                                        | #000000                                                   | n/a                     | OBSERVED                   |
| "Photos" action                       | 1030, 1389, 171, 42                                                     | 57 x 14           | inside sheet, R 20 (right edge 1201 px)  | #383835                                                   | n/a                     | OBSERVED                   |
| Camera tile                           | 82, 1549, 300, 300                                                      | 100 x 100         | L 27                                     | #f0efec                                                   | about 30                | OBSERVED, radius ESTIMATED |
| Camera glyph                          | 203, 1632, 58, 53                                                       | 19.3 x 17.7       | inside tile, upper half                  | #010101                                                   | n/a                     | OBSERVED                   |
| Camera label                          | 133, 1719, 198, 42                                                      | 66 x 14           | inside tile, centred                     | #000000                                                   | n/a                     | OBSERVED                   |
| Photo thumbnails                      | pitch 324 px (108 pt): 406, 730, 1053 (clipped at sheet edge)           | 100 x 100 each    | after the camera tile, gap 24 px (8 pt)  | recent photos                                             | about 30                | ESTIMATED                  |
| Card 1 (Add files, Add to project)    | 82, 1895, 1120, 312                                                     | 373.3 x 104       | L 27, R 27                               | #ffffff                                                   | about 24                | OBSERVED, radius ESTIMATED |
| Row 1 "Add files"                     | 82, 1895, 1120, 153                                                     | 373.3 x 51        | inside card                              | #ffffff                                                   | n/a                     | OBSERVED                   |
| Row icon (file with arrow)            | 145, 1944, 58, 59                                                       | 19.3 x 19.7       | inside card, L 21                        | #52514e                                                   | n/a                     | OBSERVED                   |
| Separator                             | 232, 2048, 912, 4                                                       | 304 x 1.3         | inside card, L 50, R 19                  | #e6e7e6                                                   | n/a                     | OBSERVED                   |
| Row 2 "Add to project"                | 82, 2052, 1120, 155                                                     | 373.3 x 51.7      | inside card                              | #ffffff                                                   | n/a                     | OBSERVED                   |
| Row value "None"                      | 949, 2116, 112, 35                                                      | 37.3 x 11.7       | R, 141 px (47 pt) from card right        | #7a7974                                                   | n/a                     | OBSERVED                   |
| Chevron                               | 1106, 2113, 18, 33                                                      | 6 x 11            | inside card, R 26                        | #888781                                                   | n/a                     | OBSERVED                   |
| Card 2 (Research, Connectors, Memory) | 82, 2253, 1120, about 491 (clipped by sheet bottom at 2744 in IMG_1238) | 373.3 x about 164 | L 27, R 27, 46 px (15.3 pt) below card 1 | #ffffff                                                   | about 24                | OBSERVED                   |
| Toggle "Research" (off)               | 968, 2297, 182, 81                                                      | 60.7 x 27         | inside card, R 17                        | #c5c5c7 track, white thumb                                | full                    | OBSERVED                   |
| Toggle "Memory" (on)                  | 968, 2620, 182, 81                                                      | 60.7 x 27         | inside card, R 17                        | #3868b9 track, white thumb                                | full                    | OBSERVED                   |
| Taller state (IMG_1239) sheet         | 0, 141, 1284, to bottom                                                 | 428 wide          | top 47 (right below the status bar)      | #f9f9f7                                                   | top about 38            | OBSERVED                   |
| Taller state grabber                  | 552, 159, 180, 12                                                       | 60 x 4            | C                                        | #bfbfbf                                                   | full                    | OBSERVED                   |
| Taller state close button             | 58, 204, 136, 130                                                       | 45.3 x 43.3       | L 19                                     | ring #f9f9f7                                              | full                    | OBSERVED                   |
| Taller state camera tile              | 60, 412, 312, about 312                                                 | 104 x 104         | L 20                                     | #f0efec                                                   | about 30                | OBSERVED                   |
| Taller state card 1                   | 60, 771, 1164, 324                                                      | 388 x 108         | L 20, R 20                               | #ffffff                                                   | about 24                | OBSERVED                   |
| Taller state card 2                   | 60, 1143, 1164, 510                                                     | 388 x 170         | L 20, R 20, gap 48 px (16 pt) above      | #ffffff                                                   | about 24                | OBSERVED                   |
| Taller state toggle                   | 981, 1188, 189, 84                                                      | 63 x 28           | inside card, R 18                        | off #c5c5c7, on #3868b9                                   | full                    | OBSERVED                   |

#### Text

| Text                                                              | Height px         | Est. size pt | Weight   | Colour  | Align                                   | Status    |
| ----------------------------------------------------------------- | ----------------- | ------------ | -------- | ------- | --------------------------------------- | --------- |
| "Add to Chat"                                                     | 43 (cap about 41) | 20           | semibold | #000000 | centre                                  | ESTIMATED |
| "Photos"                                                          | 42                | 20           | medium   | #383835 | right                                   | ESTIMATED |
| "Camera"                                                          | cap 42            | 20           | regular  | #000000 | centre                                  | ESTIMATED |
| "Add files", "Add to project", "Research", "Connectors", "Memory" | cap 43            | 20.5         | regular  | #131313 | left, text x 233 px (inside card 50 pt) | ESTIMATED |
| "None"                                                            | cap about 35      | 16.5         | regular  | #7a7974 | right                                   | ESTIMATED |

#### Spacing and notes

- Row pitch is 156 px (52 pt) in the medium sheet and 159 to 162 px (53 to 54 pt) in the taller sheet; the taller state also has a wider margin (20 pt versus 27 pt from the screen edge, because the medium sheet is itself inset 8 pt). Content margin inside the sheet is 58 px (19.3 pt) in the medium state and 60 px (20 pt) in the taller state.
- The sheet inset (8 pt on the sides and bottom) means it floats above the home indicator in the medium state; in the taller state it is full width and runs to the bottom of the screen.
- Cards separate by a 46 to 48 px (15 to 16 pt) gap of sheet background; rows inside a card separate by a 4 px (1.3 pt) hairline inset 50 pt on the left and 19 pt on the right.
- The photo strip scrolls horizontally; the first tile is a fixed Camera tile. The thumbnails show screenshots of the founder's phone, not described here.
- In IMG_1239 the second thumbnail is a miniature of IMG_1238, so the taller state was captured after the medium one. Whether the 4 percent difference in row height between the two screenshots is a layout rule or motion in progress is UNKNOWN.
- The sheet was still partly transparent over the voice home screen; dim overlay value (#c7c7c5 over #f9f9f7) is the observed result, not the overlay alpha.

### 3. Voice mode (IMG_1242, IMG_1243, IMG_1244)

Full-screen voice conversation. IMG_1242 is the start state with a greeting "Let's talk, <user name>" and a live caption. IMG_1243 and IMG_1244 show the conversation: user bubble, serif assistant reply with a thumbs feedback row. The bottom of the screen carries a glass control row. A coloured glow hugs the screen edges (blue-grey at start, terracotta orange during a reply).

#### Layout, top to bottom

| Element                              | Box px (x, y, w, h)                       | Size pt (w x h)        | Anchor                                                                                 | Fill or colour                                               | Radius pt                         | Status                                    |
| ------------------------------------ | ----------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------- | ----------------------------------------- |
| Menu button                          | 58, 139, 136, 136                         | 45.3 x 45.3            | L 19, top 46                                                                           | same as screen 1                                             | full                              | OBSERVED                                  |
| Settings (gear) button               | 1090, 139, 136, 136                       | 45.3 x 45.3            | R 19, top 46                                                                           | same as screen 1                                             | full                              | OBSERVED                                  |
| Gear glyph                           | 1129, 178, 58, 60                         | 19.3 x 20              | inside button                                                                          | #353531                                                      | n/a                               | OBSERVED                                  |
| Brand star (IMG_1242)                | 583, 1198, 118, 118                       | 39.3 x 39.3            | C                                                                                      | #cc7c5d                                                      | n/a                               | OBSERVED                                  |
| Greeting "Let's talk, <user name>"   | 278, 1381, 727, 68                        | 242.3 x 22.7           | C, 65 px below the star                                                                | #383835                                                      | n/a                               | OBSERVED                                  |
| Live caption (italic serif)          | 276, 2096, 738, 54                        | 246 x 18               | C                                                                                      | #383835                                                      | n/a                               | OBSERVED                                  |
| Mic circle                           | 546, 2281, 192, 192                       | 64 x 64                | C (centre x 642), centre y 2377                                                        | glass, #f3f6f6 inner with ring, mic glyph #0b0b0b 48 x 66 px | full                              | OBSERVED, diameter from outline ESTIMATED |
| Plus button                          | 58, 2532, 136, 136                        | 45.3 x 45.3            | L 19, bottom 37                                                                        | glass over the glow, ring                                    | full                              | OBSERVED                                  |
| Model pill "Haiku"                   | 215, 2532, 295, 136                       | 98.3 x 45.3            | after plus by 21 px (7 pt)                                                             | glass, ring                                                  | full                              | OBSERVED                                  |
| Pill up-down chevron glyph           | about 453, 2570, 40, 60                   | about 13 x 20          | inside pill, right end                                                                 | #000001                                                      | n/a                               | ESTIMATED from view                       |
| Speaker button                       | 935, 2532, 134, 136                       | 44.7 x 45.3            | gap to the close button 22 px (7 pt), R 90 px from the screen edge                     | glass, ring, glyph 60 x 54 px #0b0b0b                        | full                              | OBSERVED                                  |
| Close (X) button                     | 1091, 2532, 134, 136                      | 44.7 x 45.3            | R 19                                                                                   | #1d2024 (dark), white X 48 x 48 px                           | full                              | OBSERVED                                  |
| Conversation: user bubble (IMG_1243) | 385, 363, 851, 147                        | 283.7 x 49             | R 16, top 121                                                                          | #f0efec                                                      | about 24.5 (pill)                 | OBSERVED                                  |
| Conversation: assistant text         | text from x 50 px, y 606 to 989 (5 lines) | up to 395 wide x 127.7 | L 16.7, 96 px (32 pt) below the user bubble                                            | #131313 spoken part, #7a7974 not yet spoken                  | n/a                               | OBSERVED                                  |
| Feedback icons                       | 60, 1063, 39, 42 and 153, 1063, 39, 42    | 13 x 14 each           | L 20                                                                                   | #7a7974                                                      | n/a                               | OBSERVED                                  |
| Edge glow (IMG_1243)                 | screen edges, bottom 640 px thick         | bottom 213 pt          | translucent, terracotta, pixel samples #d08a6e at the left edge, #e8ccc0 at the bottom | n/a                                                          | follows screen corners (about 55) | OBSERVED, alpha UNKNOWN                   |

#### Text

| Text                              | Height px                           | Est. size pt | Weight         | Colour              | Align                           | Status    |
| --------------------------------- | ----------------------------------- | ------------ | -------------- | ------------------- | ------------------------------- | --------- |
| "Let's talk, <user name>" (serif) | cap 56                              | 26.5         | regular        | #383835             | centre                          | ESTIMATED |
| <caption text> (serif italic)     | cap 42                              | 20           | regular italic | #383835             | centre                          | ESTIMATED |
| "Haiku" in the pill               | cap 33                              | 15.5         | regular        | #000000             | left, 52 px (17 pt) inside pill | ESTIMATED |
| User bubble text                  | cap about 43                        | 20           | regular        | #131313             | left, padding 50 px (16.7 pt)   | ESTIMATED |
| Assistant reply (serif)           | line 57 tall, pitch 82 px (27.3 pt) | about 20     | regular        | #131313 and #7a7974 | left, starts x 50 px (16.7 pt)  | ESTIMATED |

#### Spacing and notes

- IMG_1244 is IMG_1243 scrolled: earlier lines blur and scroll under the status bar and under the menu button (the content shows through a blur at the top 0 to 130 px), and the reply is shorter. The glow, controls and header are unchanged.
- The bottom row is a floating glass strip, not a bar: no fill extends across it, only the five circles and the pill have glass fills with a ring.
- Distance between the control row centre (y 2600 px) and the screen bottom is 178 px (59 pt); the mic circle sits 59 px (20 pt) above the control row.
- Reply text fades from #131313 to #7a7974 as the speech catches up (karaoke style highlighting); the user bubble is not highlighted.
- In IMG_1242 the lower 25 percent of the screen has a blue-grey gradient (#cedae9 at the bottom edge, #ebf2fa behind the mic); in IMG_1243 and IMG_1244 it is a terracotta glow around the edges that fades to #f9f9f7 in the middle. Gradient stops UNKNOWN.

### 4. Add to Chat sheet during voice mode and voice data consent (IMG_1245, IMG_1246)

IMG_1245 is the plus sheet opened from voice mode: a shorter version of screen 2 with only the camera tile, a thumbnail strip and an "Add files" row, over the dimmed voice screen. IMG_1246 is a full-height consent sheet "Allow us to use your voice data to improve our AI models" with two buttons.

#### Layout, top to bottom

| Element                                | Box px (x, y, w, h)       | Size pt (w x h) | Anchor                                                | Fill or colour                     | Radius pt    | Status                         |
| -------------------------------------- | ------------------------- | --------------- | ----------------------------------------------------- | ---------------------------------- | ------------ | ------------------------------ |
| Sheet (IMG_1245)                       | 24, 1626, 1236, 1128      | 412 x 376       | L 8, R 8, bottom 8                                    | #f9f9f7                            | about 37     | OBSERVED                       |
| Grabber                                | about 555, 1643, 174, 12  | 58 x 4          | C                                                     | #bfbfbf                            | full         | ESTIMATED from IMG_1238 offset |
| "Add files" card                       | 82, 2232, 1120, 156       | 373.3 x 52      | L 27, R 27                                            | #ffffff                            | full (26)    | OBSERVED                       |
| Sheet (IMG_1246)                       | 0, 141, 1284, to bottom   | 428 wide        | top 47                                                | #f9f9f7                            | top about 38 | OBSERVED                       |
| Close button                           | 58, 204, 136, 130         | 45.3 x 43.3     | L 19                                                  | ring                               | full         | OBSERVED                       |
| Illustration (clipboard with waveform) | 552, 416, 180, 241        | 60 x 80.3       | C, top 139 pt                                         | line art #0b0b0b                   | n/a          | OBSERVED                       |
| Title (2 lines)                        | 190, 743, 904, 137        | 301.3 x 45.7    | C                                                     | #0b0b0b                            | n/a          | OBSERVED                       |
| Body (4 lines)                         | 75, 940, 1135, 249        | 378.3 x 83      | C, inside 58 px side margin                           | #888781                            | n/a          | OBSERVED                       |
| Primary button "Allow"                 | 73, 1237, 1138, 144       | 379.3 x 48      | L 24, R 24                                            | #131313                            | full (24)    | OBSERVED                       |
| Secondary button "Not now"             | 72, 1405, 1140, about 144 | 380 x 48        | L 24, R 24, gap 24 px (8 pt) below the primary button | transparent, outline about #d8d8d6 | full (24)    | OBSERVED, outline approximate  |

#### Text

| Text                                                                 | Height px                          | Est. size pt | Weight   | Colour  | Align  | Status    |
| -------------------------------------------------------------------- | ---------------------------------- | ------------ | -------- | ------- | ------ | --------- |
| Consent title                                                        | cap 42, line pitch 80 px (26.7 pt) | 20           | semibold | #0b0b0b | centre | ESTIMATED |
| Consent body "Audio recordings and voice chat data help improve ..." | cap 35, line pitch 67 px (22.3 pt) | 16.5         | regular  | #888781 | centre | ESTIMATED |
| "Allow"                                                              | cap about 44                       | 20.5         | medium   | #ffffff | centre | ESTIMATED |
| "Not now"                                                            | cap 42                             | 20           | medium   | #131313 | centre | ESTIMATED |

#### Spacing and notes

- The consent sheet shows content only in its top 60 percent; the rest is empty sheet background (#f9f9f7). Buttons are not pinned to the bottom.
- Gap illustration bottom (657) to title top (743): 86 px (28.7 pt); title bottom (880) to body top (940): 60 px (20 pt); body bottom (1189) to primary button top (1237): 48 px (16 pt).
- Behind the sheet in IMG_1246 the voice conversation text is visible blurred in the 100 px strip above the sheet.
- In IMG_1245 the camera tile and the strip are 300 px squares like screen 2; the strip thumbnails are miniatures of the voice screens.

### 5. Incognito home (IMG_1250)

IMG_1250 is the home screen in incognito mode with the keyboard open. It differs from IMG_1247 only in the header title, the ghost button state and the centre illustration.

#### Layout, top to bottom

| Element                         | Box px (x, y, w, h)         | Size pt (w x h) | Anchor                       | Fill or colour                                  | Radius pt | Status   |
| ------------------------------- | --------------------------- | --------------- | ---------------------------- | ----------------------------------------------- | --------- | -------- |
| Title "Incognito chat"          | 505, 191, 276, 42           | 92 x 14         | C, text centre y 212 px      | #131313                                         | n/a       | OBSERVED |
| Ghost button (active)           | 1090, 139, 136, 136         | 45.3 x 45.3     | R 19                         | #343430 (dark filled), glyph in the page colour | full      | OBSERVED |
| Ghost illustration              | 598, 724, 88, 86            | 29.3 x 28.7     | C                            | #131313                                         | n/a       | OBSERVED |
| Explanation paragraph (2 lines) | 52, 885, 1180, 96           | 393 x 32        | C, side margin 17 pt         | #383835                                         | n/a       | OBSERVED |
| "Learn more" link               | 840, 944, 240, 37           | 80 x 12         | inline in line 2, underlined | #383835                                         | n/a       | OBSERVED |
| Composer, keyboard open         | same as screen 1 (IMG_1247) |                 |                              |                                                 |           | OBSERVED |

#### Text

| Text                                                                                                       | Height px                          | Est. size pt | Weight  | Colour  | Align  | Status    |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------ | ------- | ------- | ------ | --------- |
| "Incognito chat"                                                                                           | cap about 33                       | 15.5         | regular | #131313 | centre | ESTIMATED |
| Paragraph "Incognito chats stay out of your history, memory, and search, and aren't used to train Claude." | cap 30, line pitch 59 px (19.7 pt) | 14           | regular | #383835 | centre | ESTIMATED |

#### Spacing and notes

- The ghost illustration to paragraph gap is 75 px (25 pt). The composer, keyboard and chip are identical to IMG_1247 (placeholder "Chat with Claude", chip "Haiku 5.5 Low").
- The battery shows 73 in IMG_1250 and 74 in IMG_1247, so IMG_1250 was captured later; no layout change comes from that.

### 6. Model picker (IMG_1248, IMG_1249)

A bottom sheet titled "Select model" with four model rows in one card, an "Effort" row and a "More models" row. IMG_1248 is the detent state over the dimmed home screen (the lower rows are clipped by the sheet bottom). IMG_1249 is the same sheet taller and full width, with all rows visible.

#### Layout, top to bottom

| Element                      | Box px (x, y, w, h)                                               | Size pt (w x h) | Anchor                                                | Fill or colour | Radius pt           | Status                     |
| ---------------------------- | ----------------------------------------------------------------- | --------------- | ----------------------------------------------------- | -------------- | ------------------- | -------------------------- |
| Sheet (IMG_1248)             | 24, 1289, 1236, 1465                                              | 412 x 488.3     | L 8, R 8, bottom 8                                    | #f9f9f7        | about 37            | OBSERVED                   |
| Grabber                      | 555, 1306, 174, 12                                                | 58 x 4          | C                                                     | #bfbfbf        | full                | OBSERVED                   |
| Sheet (IMG_1249)             | 0, 141, 1284, to bottom                                           | 428 wide        | top 47                                                | #f9f9f7        | top about 38        | OBSERVED                   |
| Grabber (IMG_1249)           | 552, 159, 180, 12                                                 | 60 x 4          | C                                                     | #bfbfbf        | full                | OBSERVED                   |
| Close button                 | 58, 204, 136, 130                                                 | 45.3 x 43.3     | L 19                                                  | ring           | full                | OBSERVED                   |
| Title "Select model"         | 467, 245, 347, 44                                                 | 115.7 x 14.7    | C                                                     | #000000        | n/a                 | OBSERVED                   |
| Models card                  | 60, 411, 1164, 908                                                | 388 x 302.7     | L 20, R 20                                            | #ffffff        | about 24            | OBSERVED                   |
| Model row                    | 60, 411 + n x 227, 1164, 227                                      | 388 x 75.7      | inside card                                           | #ffffff        | n/a                 | OBSERVED                   |
| Row separator                | 123, 635, 1015, 3                                                 | 338.3 x 1       | inside card, L 21, R 21                               | #e6e7e6        | n/a                 | OBSERVED                   |
| Model name (row 1)           | 125, 470, 137, 44                                                 | 45.7 x 14.7     | text x 125 px (inside card 21 pt), row top plus 59 px | #131313        | n/a                 | OBSERVED                   |
| Model description (row 1)    | 123, 550, 564, 43                                                 | 188 x 14.3      | 80 px below the name top                              | #7a7974        | n/a                 | OBSERVED                   |
| Check mark (selected row)    | 1106, 1181, 50, 49                                                | 16.7 x 16.3     | inside card, R 23                                     | #3868b9        | n/a                 | OBSERVED                   |
| Effort card                  | 60, 1367, 1164, 162                                               | 388 x 54        | L 20, R 20, gap 48 px (16 pt) below the models card   | #ffffff        | full-ish (about 27) | OBSERVED, radius ESTIMATED |
| Effort value "Low"           | 1002, 1431, 87, 36                                                | 29 x 12         | inside card                                           | #7a7974        | n/a                 | OBSERVED                   |
| Effort chevron               | 1131, 1428, 23, 40                                                | 7.7 x 13.3      | inside card, R 23                                     | #c5c5c7        | n/a                 | OBSERVED                   |
| "More models" card           | 60, 1577, 1164, 162                                               | 388 x 54        | L 20, R 20, gap 48 px (16 pt)                         | #ffffff        | about 27            | OBSERVED                   |
| Detent state rows (IMG_1248) | card x 82 to 1202, row pitch 219 px (73 pt), first row top y 1549 | 373.3 wide      | L 27, R 27                                            | #ffffff        | about 24            | OBSERVED                   |
| Detent check mark (IMG_1248) | about 1081, 1648, 50, 49                                          | 16.7 x 16.3     | inside card                                           | #3868b9        | n/a                 | ESTIMATED from IMG_1249    |

#### Text

| Text                                                                                                                                   | Height px                                     | Est. size pt | Weight   | Colour  | Align  | Status    |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------ | -------- | ------- | ------ | --------- |
| "Select model"                                                                                                                         | cap about 44                                  | 21           | semibold | #000000 | centre | ESTIMATED |
| "Fable 5.2", "Opus 5.5", "Sonnet 5.5", "Haiku 5.5"                                                                                     | cap 43 to 44                                  | 21           | regular  | #131313 | left   | ESTIMATED |
| "For your toughest challenges", "For complex work and everyday tasks", "Most efficient for simpler tasks", "Fastest for quick answers" | cap about 30 (F, measured 30 on the sub-line) | 14.5         | regular  | #7a7974 | left   | ESTIMATED |
| "Effort", "More models"                                                                                                                | cap 44                                        | 21           | regular  | #131313 | left   | ESTIMATED |
| "Low"                                                                                                                                  | cap 36                                        | 17           | regular  | #7a7974 | right  | ESTIMATED |

#### Spacing and notes

- Row anatomy: name top at row top plus 59 px, description top at row top plus 139 px; the two lines are a 80 px (27 pt) pitch; row height 227 px.
- The picker has no model logos, no section headings and no badges in this range; plan or "new" markers are not shown.
- The effort control is a drill-in row (value on the right, chevron); the effort sub-screen is not captured. The home chip label shows the current effort next to the model name (for example "Haiku 5.5 Low"), so the effort is also visible outside the picker.
- The medium detent (IMG_1248) is not tall enough for the last card; "More models" is clipped by the bottom edge of the sheet.
- Row height differs 3.6 percent between the detent state and the full state (73 pt versus 75.7 pt); whether this is a layout rule or motion is UNKNOWN.

### 7. Projects list and filter menu (IMG_1251, IMG_1252)

The Projects tab: a list of projects with a title bar, a floating search button and a "New project" button. IMG_1252 shows the filter popover open (items "Yours" and "Archived", with a check mark on "Yours").

#### Layout, top to bottom

| Element                 | Box px (x, y, w, h)                                                    | Size pt (w x h)                                        | Anchor                                       | Fill or colour                                    | Radius pt   | Status                     |
| ----------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------- | ----------- | -------------------------- |
| Menu button             | 58, 139, 136, 136                                                      | 45.3 x 45.3                                            | L 19, top 46                                 | as screen 1                                       | full        | OBSERVED                   |
| Title "Projects"        | 531, 185, 222, 57                                                      | 74 x 19                                                | C                                            | #000000                                           | n/a         | OBSERVED                   |
| Filter button (funnel)  | 1090, 139, 136, 136; glyph 1134, 182, 48, 48                           | 45.3 x 45.3                                            | R 19, top 46                                 | as screen 1, glyph #383835                        | full        | OBSERVED                   |
| List row (n = 0 to 7)   | x 84 to 1236, y 342 + n x 225                                          | 384 x 75                                               | L 28, R 16                                   | transparent                                       | n/a         | OBSERVED                   |
| Row icon tile           | 84, 342, 72, 72                                                        | 24 x 24                                                | L 28                                         | #ededec, jar glyph #7a7974 about 35 x 40 px       | about 8     | OBSERVED, radius ESTIMATED |
| Row title               | 205, 356, up to 1050 w, 57                                             | text x 68 pt                                           | after tile by 49 px (16 pt)                  | #0b0b0b                                           | n/a         | OBSERVED                   |
| Row subtitle            | 208, 440, 900, 37                                                      |                                                        | 84 px below title top                        | #888781                                           | n/a         | OBSERVED                   |
| Search button           | 70, 2548, 130, 130                                                     | 43.3 x 43.3                                            | L 23, bottom 33                              | translucent fill #f9f9f7 with ring, glyph #0b0b0b | full        | OBSERVED                   |
| "New project" button    | 764, 2548, 450, 130                                                    | 150 x 43.3                                             | R 23, bottom 33                              | #252524                                           | full (21.7) | OBSERVED                   |
| Popover menu (IMG_1252) | about 457, 141, 769, 402                                               | 256 x 134                                              | R 19.5, top 47 (aligns to the filter button) | #fbfbf9 translucent blur, soft shadow             | about 36    | OBSERVED, radius ESTIMATED |
| Popover separator       | 546, 757 or 340, 171, 3                                                | 57 x 1                                                 | inside popover                               | #e7e8e6                                           | n/a         | OBSERVED                   |
| Popover item "Yours"    | check at x 540 to 575; icon 626, 417 (person, 52 x 52 px); label x 732 | row about 202 px (67 pt) pitch including the separator | inside popover                               | #0a0a09                                           | n/a         | OBSERVED                   |

#### Text

| Text                                    | Height px    | Est. size pt | Weight   | Colour  | Align                    | Status    |
| --------------------------------------- | ------------ | ------------ | -------- | ------- | ------------------------ | --------- |
| "Projects"                              | cap about 44 | 21           | semibold | #000000 | centre                   | ESTIMATED |
| <project name>                          | cap 44       | 21           | regular  | #0b0b0b | left, ellipsis at 1 line | ESTIMATED |
| "Private · 2 months ago" style subtitle | cap 37       | 17.5         | regular  | #888781 | left                     | ESTIMATED |
| "New project"                           | cap about 42 | 20           | medium   | #ffffff | centre                   | ESTIMATED |
| "Yours", "Archived"                     | cap 44       | 21           | regular  | #0a0a09 | left                     | ESTIMATED |

#### Spacing and notes

- Row pitch 225 px (75 pt); no separators between rows; the title and subtitle are 84 px (28 pt) apart and truncate with an ellipsis on one line each (subtitle truncates its description part before the date).
- List content runs under the search and New project buttons to the screen bottom; the floating buttons carry a soft shadow.
- The popover opens from the top right, overlapping the first rows; the rows below it are not dimmed.
- Subtitle format is "<visibility or description> · <relative date>".

### 8. Code list, filter menu and scheduled tasks (IMG_1253, IMG_1254, IMG_1255, IMG_1262)

The Code tab: devices, then sessions. IMG_1253 is the list; IMG_1254 is the filter popover (six states with a check on "All"); IMG_1255 is "Scheduled tasks" reached from the clock button; IMG_1262 is the empty state "Scheduled runs".

#### Layout, top to bottom

| Element                              | Box px (x, y, w, h)                                                 | Size pt (w x h)                         | Anchor                   | Fill or colour                                                                                    | Radius pt | Status                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------- | --------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| Menu button                          | 58, 139, 136, 136                                                   | 45.3 x 45.3                             | L 19                     | as screen 1                                                                                       | full      | OBSERVED                                                                                                              |
| Title "Code"                         | centre of the screen, text cap about 44                             |                                         | C                        | #000000                                                                                           | n/a       | OBSERVED                                                                                                              |
| Clock plus filter capsule (IMG_1253) | 894, 141, 332, 132                                                  | 110.7 x 44                              | R 19                     | #fbfbf9 with ring, clock glyph centred x 1000 px and funnel glyph centred x 1180 px (60 pt apart) | full      | OBSERVED                                                                                                              |
| Section heading "Devices"            | 88, 387, 173, 36                                                    | 57.7 x 12                               | L 29                     | #888781                                                                                           | n/a       | OBSERVED                                                                                                              |
| "Add device" pill                    | 84, 489, 421, 132                                                   | 140.3 x 44                              | L 28                     | transparent, 1 pt outline #e1e1df                                                                 | full      | OBSERVED                                                                                                              |
| Pill plus glyph                      | 131, 536, 39, 39                                                    | 13 x 13                                 | inside pill              | #0b0b0b                                                                                           | n/a       | OBSERVED                                                                                                              |
| Section heading "Sessions"           | 86, 720, 194, 36                                                    | 64.7 x 12                               | L 29                     | #888781                                                                                           | n/a       | OBSERVED                                                                                                              |
| Session row                          | y 850 + n x 225 (title top)                                         | 75 pt pitch                             | L 28, R 16               | transparent                                                                                       | n/a       | OBSERVED                                                                                                              |
| Status ring                          | 105, 861, 30, 30                                                    | 10 x 10                                 | L 35                     | #52514e outline                                                                                   | full      | OBSERVED                                                                                                              |
| Row title                            | 208, 850, up to 1000 w, 56                                          |                                         | text x 69 pt             | #0b0b0b (recent) or #3a3a3a to #52514e (older rows fade)                                          | n/a       | OBSERVED                                                                                                              |
| Row subtitle                         | 206, 938, 294, 48                                                   |                                         | 88 px below title top    | #888781                                                                                           | n/a       | OBSERVED                                                                                                              |
| Device icon (laptop)                 | 522, 936, 52, 43                                                    | 17.3 x 14.3                             | after subtitle by 22 px  | #296117 (green) for a local device, grey cloud outline for cloud                                  | n/a       | OBSERVED                                                                                                              |
| "New session" button                 | about 760, 2548, about 454, 130                                     | about 151 x 43.3                        | R 23, bottom 33          | #252524                                                                                           | full      | ESTIMATED from view (left edge at 545 of 924 display px); height and bottom measured on the sibling "New task" button |
| Search button                        | 70, 2548, 130, 130                                                  | 43.3 x 43.3                             | L 23, bottom 33          | translucent with ring                                                                             | full      | OBSERVED                                                                                                              |
| Popover (IMG_1254)                   | about 486, 141, 750, 959                                            | 250 x 319.7                             | R 16 to 20, top 47       | #fbfbfa translucent, soft shadow                                                                  | about 36  | OBSERVED                                                                                                              |
| Popover item                         | check x 554 to 590; icon x 632 to 690 (52 to 57 px); label x 741    | pitch 140 px (46.7 pt)                  | inside popover           | label #0b0b0b                                                                                     | n/a       | OBSERVED                                                                                                              |
| Title "Scheduled tasks" (IMG_1255)   | 454, 160, 374, 37                                                   | 124.7 x 12.3                            | C                        | #0b0b0b                                                                                           | n/a       | OBSERVED                                                                                                              |
| Subtitle "Claude Code"               | 515, 225, 252, 31                                                   | 84 x 10.3                               | C, 28 px below the title | #52514e                                                                                           | n/a       | OBSERVED                                                                                                              |
| Back button                          | 58, 139, 136, 136                                                   | 45.3 x 45.3                             | L 19                     | as screen 1, chevron glyph                                                                        | full      | OBSERVED                                                                                                              |
| Section "Active" (IMG_1255)          | 85, 399, 143, 36                                                    | 47.7 x 12                               | L 28                     | #888781                                                                                           | n/a       | OBSERVED                                                                                                              |
| Task row (IMG_1255)                  | clock icon 96, 522, 48, 48; title x 206; blue dot 1176, 534, 24, 24 | row pitch about 283 px for a 2 line row | L 32, R 28               | icon #52514e; dot #4076cf                                                                         | dot full  | OBSERVED                                                                                                              |
| "New task" button                    | 829, 2548, 385, 130                                                 | 128.3 x 43.3                            | R 23, bottom 33          | #252524                                                                                           | full      | OBSERVED                                                                                                              |
| Empty icon circle (IMG_1262)         | 570, 1319, 144, 144                                                 | 48 x 48                                 | C                        | #f0efec, clock glyph 60 x 60 px #7a7974                                                           | full      | OBSERVED                                                                                                              |
| Empty title "No scheduled runs"      | 396, 1532, 493, 42                                                  | 164.3 x 14                              | C                        | #7a7974                                                                                           | n/a       | OBSERVED                                                                                                              |
| Empty subtitle                       | 206, 1613, 870, 36                                                  | 290 x 12                                | C                        | #7a7974                                                                                           | n/a       | OBSERVED                                                                                                              |

#### Text

| Text                                                                                       | Height px    | Est. size pt | Weight   | Colour  | Align                                                  | Status    |
| ------------------------------------------------------------------------------------------ | ------------ | ------------ | -------- | ------- | ------------------------------------------------------ | --------- |
| "Code"                                                                                     | cap about 44 | 21           | semibold | #000000 | centre                                                 | ESTIMATED |
| "Devices", "Sessions", "Active", "Completed"                                               | cap 36       | 17           | regular  | #888781 | left                                                   | ESTIMATED |
| "Add device"                                                                               | cap 37       | 17.5         | medium   | #0b0b0b | left in pill                                           | ESTIMATED |
| <session title>                                                                            | cap 43       | 20.5         | regular  | #0b0b0b | left                                                   | ESTIMATED |
| <repository name> subtitle                                                                 | cap about 37 | 17.5         | regular  | #888781 | left                                                   | ESTIMATED |
| "Scheduled tasks"                                                                          | cap about 35 | 16.5         | semibold | #0b0b0b | centre                                                 | ESTIMATED |
| "Claude Code"                                                                              | cap about 30 | 14           | regular  | #52514e | centre                                                 | ESTIMATED |
| Popover items "All", "Needs input", "Ready for review", "Working", "Completed", "Archived" | cap 42       | 20           | regular  | #0b0b0b | left (the "Ready for review" label wraps to two lines) | ESTIMATED |
| "No scheduled runs"                                                                        | cap about 40 | 19           | regular  | #7a7974 | centre                                                 | ESTIMATED |
| "Ask Claude to run a task on a schedule."                                                  | cap about 30 | 14.5         | regular  | #7a7974 | centre                                                 | ESTIMATED |

#### Spacing and notes

- Session rows are 75 pt apart with no separators; older (cloud) rows are rendered in a lighter text colour. The last row passes under the "New session" button and the search button.
- Section headings sit 20 pt above their content; "Add device" pill 33 pt below "Devices".
- Popover rows are 46.7 pt apart; "Ready for review" takes two lines (about 109 px tall). The check mark sits at the left of the selected item and is 36 to 52 px wide.
- The Code screens have a top-right capsule that groups two actions (history and filter); Projects and Artifacts use a single circle there.
- The Scheduled tasks screen uses a two-line title (title plus subtitle) at smaller sizes than single-line titles.

### 9. Code new session, permission dialog and Add context sheet (IMG_1256, IMG_1257, IMG_1258)

Starting a new Code session: a greeting with a pixel-art mascot, two outline pills (environment and repository), and the composer. IMG_1256 shows a one-time alert "Auto mode is now Claude Code's default permission mode" over the dimmed screen. IMG_1257 is the same screen with the keyboard open. IMG_1258 is the "Add context" sheet.

#### Layout, top to bottom

| Element                                            | Box px (x, y, w, h)                                                                                               | Size pt (w x h)     | Anchor                                  | Fill or colour                                             | Radius pt | Status                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------- | ---------------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| Back button                                        | 58, 139, 136, 136                                                                                                 | 45.3 x 45.3         | L 19                                    | as screen 1                                                | full      | OBSERVED                                                                  |
| Mascot (pixel crab)                                | 550, 662, 183, 122                                                                                                | 61 x 40.7           | C                                       | #cc7c5d                                                    | n/a       | OBSERVED                                                                  |
| Greeting "Afternoon, <user name>"                  | 117, 849, 1050, 75                                                                                                | 350 x 25            | C, 65 px below the mascot               | #383835                                                    | n/a       | OBSERVED                                                                  |
| Environment pill "Default"                         | 22, 1263, 316, 117                                                                                                | 105.3 x 39          | L 7.3                                   | translucent white, 1 pt outline, soft shadow               | full      | OBSERVED                                                                  |
| Repository pill "Add repository"                   | 358, 1263, 488, 117                                                                                               | 162.7 x 39          | after the first pill by 20 px (6.7 pt)  | same                                                       | full      | OBSERVED                                                                  |
| Pill icons                                         | cloud outline 54, 1302, 60, 45 in the first pill; repository mark about 60 x 60 px at the left of the second pill | 20 x 15 (cloud)     | inside pill, L 10                       | #383835                                                    | n/a       | cloud OBSERVED, repository mark ESTIMATED                                 |
| Composer card (keyboard open)                      | 24, 1413, 1236, 300                                                                                               | 412 x 100           | L 8, R 8, 33 px (11 pt) below the pills | #fbfbfa                                                    | about 25  | OBSERVED                                                                  |
| Placeholder "Describe a task or ask a question..." | text x 65, cap about 43                                                                                           |                     | inside card                             | #7a7974                                                    | n/a       | OBSERVED                                                                  |
| Model chip "Opus 5.5 Medium"                       | 180, 1581, 417, 108                                                                                               | 139 x 36            | after plus button                       | #f0efec                                                    | full      | OBSERVED                                                                  |
| Send button, disabled                              | 1128, 1581, 108, 108                                                                                              | 36 x 36             | R 8                                     | #e0bfb1                                                    | full      | OBSERVED                                                                  |
| Dialog (IMG_1256)                                  | 165, 859, 956, 1099                                                                                               | 318.7 x 366.3       | C, centre y 1408 px (469 pt)            | #ebebe9 (translucent glass over the dimmed screen), shadow | about 35  | OBSERVED, radius ESTIMATED                                                |
| Dialog title (3 lines)                             | 254, 948, 700, 190                                                                                                | 233 x 63            | L 30 inside dialog                      | #000000                                                    | n/a       | OBSERVED                                                                  |
| Dialog body (8 lines)                              | 254, 1193, 740, 510                                                                                               | 247 x 170           | L 30                                    | #7e7e7c                                                    | n/a       | OBSERVED                                                                  |
| Dialog button "Got it"                             | 210, 1765, 420, 144                                                                                               | 140 x 48            | L 15 inside dialog                      | #cccccb                                                    | full (24) | OBSERVED                                                                  |
| Dialog button "Learn more"                         | 655, 1765, 420, 144                                                                                               | 140 x 48            | R 15 inside dialog, gap 25 px (8 pt)    | #cccccb                                                    | full      | width and x ESTIMATED from view, height OBSERVED from the "Got it" button |
| Add context sheet (IMG_1258)                       | 24, 1289, 1236, 1465                                                                                              | 412 x 488.3         | L 8, R 8, bottom 8                      | #f9f9f7                                                    | about 37  | OBSERVED                                                                  |
| Title "Add context" and "Photos"                   | title 481 to 802 x, y 1389 to 1431                                                                                |                     | C; "Photos" R 20                        | #000000, #383835                                           | n/a       | OBSERVED                                                                  |
| Camera tile and thumbnails                         | as screen 2                                                                                                       | 100 x 100           |                                         | #f0efec                                                    | about 30  | OBSERVED                                                                  |
| Row card "Add files"                               | 82, 1895, 1120, 156                                                                                               | 373.3 x 52          | L 27, R 27                              | #ffffff                                                    | full (26) | OBSERVED                                                                  |
| Row card "Permission"                              | 82, 2097, 1120, 156                                                                                               | 373.3 x 52          | 46 px (15.3 pt) below the previous card | #ffffff                                                    | full      | OBSERVED                                                                  |
| Row card "Connectors"                              | 82, 2300, 1120, 156                                                                                               | 373.3 x 52          | 47 px below                             | #ffffff                                                    | full      | OBSERVED                                                                  |
| "Permission" value "Auto" and chevron              | value 958, 2162, 103, 35; chevron 1106, 2159, 18, 33                                                              | 34.3 x 11.7; 6 x 11 | R 26                                    | #7a7974; #888781                                           | n/a       | OBSERVED                                                                  |

#### Text

| Text                                                                  | Height px                              | Est. size pt | Weight   | Colour              | Align  | Status    |
| --------------------------------------------------------------------- | -------------------------------------- | ------------ | -------- | ------------------- | ------ | --------- |
| "Default", "Add repository"                                           | cap about 37                           | 17.5         | regular  | #383835             | left   | ESTIMATED |
| "Describe a task or ask a question..."                                | cap about 43                           | 20           | regular  | #7a7974             | left   | ESTIMATED |
| "Opus 5.5" plus "Medium"                                              | cap 33                                 | 15.5         | regular  | #131313 and #7a7974 | left   | ESTIMATED |
| Dialog title "Auto mode is now Claude Code's default permission mode" | cap 43, line pitch 73 px (24.3 pt)     | 20.5         | semibold | #000000             | left   | ESTIMATED |
| Dialog body                                                           | cap about 35, line pitch 66 px (22 pt) | 16.5         | regular  | #7e7e7c             | left   | ESTIMATED |
| "Got it", "Learn more"                                                | cap 42                                 | 20           | medium   | #383835             | centre | ESTIMATED |
| "Add context"                                                         | cap about 42                           | 20           | semibold | #000000             | centre | ESTIMATED |
| "Add files", "Permission", "Connectors"                               | cap 43                                 | 20.5         | regular  | #131313             | left   | ESTIMATED |

#### Spacing and notes

- The dialog is a centred alert with soft glass and a faint warm glow behind its top half; it dims the whole screen with the same 20 percent black as sheets.
- The Add context sheet keeps each row as its own full-width white pill (156 px, 52 pt) with 15 pt gaps, instead of grouping rows into one card as in the chat sheet (screen 2).
- The environment and repository pills sit 11 pt above the composer and have a smaller left inset (7 pt) than the composer's 8 pt in this keyboard state; both are within 1 pt of each other.
- The repository and environment names shown after selection are not in this range.

### 10. Cowork list and new task (IMG_1259, IMG_1260)

The Cowork tab: a list grouped by month, then a new-task screen with a "Choose project" pill and the composer. IMG_1259 is the list; IMG_1260 is the new-task screen with the keyboard open.

#### Layout, top to bottom

| Element                                                | Box px (x, y, w, h)                                                                     | Size pt (w x h) | Anchor                                                | Fill or colour                 | Radius pt | Status   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------- | ------------------------------ | --------- | -------- |
| Menu button, title "Cowork", clock plus filter capsule | same as screen 8 (title text 537, 185, 209, 44)                                         |                 |                                                       |                                |           | OBSERVED |
| Section heading "October"                              | 87, 384, 185, 36                                                                        | 61.7 x 12       | L 29                                                  | #888781                        | n/a       | OBSERVED |
| Row                                                    | title top y 518, row pitch 225 px (75 pt), status icon x 96 to 144 (about 48 px, 16 pt) |                 | L 32                                                  | status icon #737270 or #52514e | n/a       | OBSERVED |
| Row title                                              | 209, 518, up to 800 w, 57                                                               | text x 69.7 pt  |                                                       | #3a3a3a to #0b0b0b             | n/a       | OBSERVED |
| Row subtitle "Oct 25" plus cloud icon                  | 206, 603, 146, 36; icon 373, 600, 52, 39                                                |                 | 85 px below title top                                 | #bbbab7 (faded) or #888781     | n/a       | OBSERVED |
| Section heading "July"                                 | 86, 1446, 90, 48                                                                        | 30 x 16         | L 29, 129 px (43 pt) above the first row of the group | #888781                        | n/a       | OBSERVED |
| "New task" button                                      | 829, 2548, 385, 130                                                                     | 128.3 x 43.3    | R 23, bottom 33                                       | #252524                        | full      | OBSERVED |
| Back button (IMG_1260)                                 | 58, 139, 136, 136                                                                       | 45.3 x 45.3     | L 19                                                  | as screen 1                    | full      | OBSERVED |
| Star (IMG_1260)                                        | 583, 638, 118, 118                                                                      | 39.3 x 39.3     | C                                                     | #cc7c5d                        | n/a       | OBSERVED |
| Greeting "What can I take off your plate?"             | 130, 821, 1023, 69                                                                      | 341 x 23        | C                                                     | #383835                        | n/a       | OBSERVED |
| "Choose project" pill                                  | 390, 1018, 503, 108                                                                     | 167.7 x 36      | C                                                     | #ffffff, soft shadow           | full      | OBSERVED |
| Chevron in pill                                        | 811, 1063, 34, 19                                                                       | 11.3 x 6.3      | inside pill, R 15                                     | #383835                        | n/a       | OBSERVED |
| Composer card (keyboard open)                          | 24, 1413, 1236, 300                                                                     | 412 x 100       | L 8, R 8                                              | #fbfbfa                        | about 25  | OBSERVED |
| Placeholder "Write a message..."                       | cap about 43                                                                            |                 |                                                       | #7a7974                        | n/a       | OBSERVED |
| Model chip "Opus 5.5 High"                             | 180, 1581, about 369, 108                                                               | 123 x 36        |                                                       | #f0efec                        | full      | OBSERVED |
| Send button, disabled                                  | 1128, 1581, 108, 108                                                                    | 36 x 36         |                                                       | #e0bfb1                        | full      | OBSERVED |

#### Text

| Text                                      | Height px    | Est. size pt | Weight   | Colour  | Align        | Status    |
| ----------------------------------------- | ------------ | ------------ | -------- | ------- | ------------ | --------- |
| "Cowork"                                  | cap about 44 | 21           | semibold | #000000 | centre       | ESTIMATED |
| "October", "July"                         | cap 36       | 17           | regular  | #888781 | left         | ESTIMATED |
| <task title>                              | cap 43       | 20.5         | regular  | #0b0b0b | left         | ESTIMATED |
| "Stopped · Oct 13" subtitle               | cap about 36 | 17           | regular  | #888781 | left         | ESTIMATED |
| "What can I take off your plate?" (serif) | cap about 52 | 24.5         | regular  | #383835 | centre       | ESTIMATED |
| "Choose project"                          | cap 37       | 17.5         | medium   | #383835 | left in pill | ESTIMATED |

#### Spacing and notes

- Months group the rows; the month heading sits 40 pt above the first row of its group and the same row pitch (75 pt) continues across groups.
- A warning triangle replaces the status ring for stopped tasks; each row ends with a small cloud outline icon after the date.
- On the new-task screen the greeting changes to a question and a project chooser pill replaces the repository pills; the composer is the same as in screen 9 but the model chip reads "Opus 5.5 High".
- Older rows are lighter (#bbbab7 subtitle, #3a3a3a title) than newer ones.

### 11. Add to project sheet (IMG_1261)

A bottom sheet "Add to project" over the new-task screen, showing a scrolling list of projects with a floating search pill.

#### Layout, top to bottom

| Element                      | Box px (x, y, w, h)                                                                            | Size pt (w x h) | Anchor                                    | Fill or colour                         | Radius pt | Status              |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------- | -------------------------------------- | --------- | ------------------- |
| Sheet                        | 24, 1289, 1236, 1465                                                                           | 412 x 488.3     | L 8, R 8, bottom 8                        | #f9f9f7                                | about 37  | OBSERVED            |
| Close button                 | 80, 1345, 131, 130                                                                             | 43.7 x 43.3     | L 19                                      | ring                                   | full      | OBSERVED            |
| Title "Add to project"       | 442, 1393, 386, 55                                                                             | 128.7 x 18.3    | C                                         | #000000                                | n/a       | OBSERVED            |
| Plus button                  | 1073, 1345, 131, 130                                                                           | 43.7 x 43.3     | R 27                                      | ring, plus glyph                       | full      | OBSERVED            |
| Row                          | y 1553 + n x 216                                                                               | 72 pt pitch     | L 34, R 20                                | transparent                            | n/a       | OBSERVED            |
| Row icon (jar)               | 102, 1582, 52, 59                                                                              | 17.3 x 19.7     | L 34                                      | #52514e                                | n/a       | OBSERVED            |
| Row title                    | 213, 1553, up to 920 w, 56                                                                     | text x 71 pt    |                                           | #131313                                | n/a       | OBSERVED            |
| Row subtitle (relative date) | 210, 1634, 250, 47                                                                             |                 | 81 px below title top                     | #7a7974                                | n/a       | OBSERVED            |
| Search pill                  | 104, 2535, 1076, 138                                                                           | 358.7 x 46      | L 35, R 35, bottom 27 (sheet bottom 2754) | #f7f7f5 translucent, rows blur through | full      | OBSERVED            |
| Search glyph and label       | magnifier glyph about 55 px (18 pt) at the left of the pill, "Search" text in #7a7974 after it |                 | inside pill                               |                                        | n/a       | ESTIMATED from view |

#### Text

| Text             | Height px    | Est. size pt | Weight   | Colour  | Align  | Status    |
| ---------------- | ------------ | ------------ | -------- | ------- | ------ | --------- |
| "Add to project" | cap about 43 | 20.5         | semibold | #000000 | centre | ESTIMATED |
| <project name>   | cap about 43 | 20.5         | regular  | #131313 | left   | ESTIMATED |
| "2 months ago"   | cap about 36 | 17           | regular  | #7a7974 | left   | ESTIMATED |
| "Search"         | cap about 43 | 20           | regular  | #7a7974 | left   | ESTIMATED |

#### Spacing and notes

- The list scrolls under the search pill; the last visible rows are blurred behind it. Rows are 216 px (72 pt) apart.
- The close button is on the left and the "new project" plus button on the right at the same height as the title.

### 12. Artifacts list and filter menu (IMG_1263, IMG_1264, IMG_1265)

The Artifacts tab: cards with a thumbnail and metadata. IMG_1264 is the filter popover (scope group, divider, type group); IMG_1265 is the same popover scrolled to the end of the list (items "Slides", "Whiteboard", "Other").

#### Layout, top to bottom

| Element                                       | Box px (x, y, w, h)                                              | Size pt (w x h)        | Anchor                                    | Fill or colour                                                                | Radius pt | Status                                          |
| --------------------------------------------- | ---------------------------------------------------------------- | ---------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- | --------- | ----------------------------------------------- |
| Menu button, title "Artifacts", filter button | as screen 7 (title 432, 185, 283, 44)                            |                        |                                           |                                                                               |           | OBSERVED                                        |
| Card (n = 0 to 7)                             | 51, 351 + n x 310, 1182, 260                                     | 394 x 86.7             | L 17, R 17                                | #f9f9f7 with 1 pt border #e1e1df                                              | about 24  | OBSERVED, radius ESTIMATED                      |
| Card gap                                      | 51 px                                                            | 17                     |                                           |                                                                               |           | OBSERVED                                        |
| Thumbnail                                     | 73, 685 (card 2), 397, about 210                                 | 132.3 x 70             | inside card, L 7                          | thumbnail image, or white tile with a stacked-pages glyph (#7a7974) when none | about 14  | OBSERVED, radius ESTIMATED                      |
| Type badge                                    | 72, 782 (cards 3) etc., 108, 108                                 | 36 x 36                | overlaps the thumbnail bottom left corner | #f4ddaa for slides, #f0efec for others, glyph #7a7974 or #8a5a00              | about 10  | OBSERVED, radius ESTIMATED                      |
| Card title                                    | 499, 387, up to 720 w, 37                                        | text x 166 pt          | right of thumbnail by 29 px (9.7 pt)      | #0b0b0b                                                                       | n/a       | OBSERVED                                        |
| Card meta line 1 ("Only you")                 | 501, 455, 227, 42; lock icon 37 x 37 px                          |                        | 68 px below title top                     | #888781                                                                       | n/a       | OBSERVED                                        |
| Card meta line 2 ("Edited 3 wk. ago")         | text x 498, y 546, 314 x 43                                      |                        | 91 px below line 1                        | #888781                                                                       | n/a       | OBSERVED                                        |
| Search pill                                   | about 83, 2552, 1118, 142                                        | about 372.7 x 47       | L 28, R 28, about 24 from the bottom      | translucent near #fbfbf9                                                      | full      | ESTIMATED from view, not measured with the tool |
| Popover (IMG_1264)                            | about 474, 141, 751, 1558                                        | 250.3 x 519.3          | R 19.7, top 47                            | #fbfbfa translucent, soft shadow                                              | about 36  | OBSERVED                                        |
| Popover scroll indicator (IMG_1265)           | 1206, 300, 24, 900                                               | 8 x 300                | inside popover, right                     | #a5a5a3                                                                       | full      | OBSERVED                                        |
| Popover divider                               | starts x 546, y 757, 3 px thick (IMG_1264)                       |                        | inside popover, inset from both sides     | #e5e5e3                                                                       | n/a       | OBSERVED                                        |
| Popover item                                  | check x 546 to 580; icon x 622 to 679 (52 to 57 px); label x 731 | pitch 139 px (46.3 pt) | inside popover                            | label #0b0b0b                                                                 | n/a       | OBSERVED                                        |

#### Text

| Text                                                                                                                                                         | Height px    | Est. size pt | Weight   | Colour  | Align                    | Status    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------ | -------- | ------- | ------------------------ | --------- |
| "Artifacts"                                                                                                                                                  | cap about 44 | 21           | semibold | #000000 | centre                   | ESTIMATED |
| <artifact title>                                                                                                                                             | cap about 35 | 16.5         | regular  | #0b0b0b | left, ellipsis at 1 line | ESTIMATED |
| "Only you"                                                                                                                                                   | cap about 33 | 15.5         | regular  | #888781 | left                     | ESTIMATED |
| "Edited 3 wk. ago"                                                                                                                                           | cap about 33 | 15.5         | regular  | #888781 | left                     | ESTIMATED |
| Popover items "All", "Pinned", "Yours", "Shared with you", "All types", "Data", "Design", "Design System", "Docs", "Sheets", "Slides", "Whiteboard", "Other" | cap 44       | 21           | regular  | #0b0b0b | left                     | ESTIMATED |
| "Search" in the pill                                                                                                                                         | cap about 43 | 20           | regular  | #7a7974 | left                     | ESTIMATED |

#### Spacing and notes

- Card pitch 310 px (103.3 pt); the card border is a 3 px #e1e1df hairline on the same #f9f9f7 as the screen, so cards are outlined rather than filled.
- Thumbnails keep a 2:1 crop (397 x 210 px); cards without a preview show a light tile with a placeholder glyph.
- The popover has two groups (scope, then type) separated by a 3 px hairline at y 757; it scrolls (a scroll bar shows when scrolled) and the check marks show "All" and "All types". Item pitch is 139 px (46.3 pt) and the popover is 519 pt tall, which is more than half the screen.
- The list passes under the search pill; a blurred title is visible through it.

### 13. Project detail, files sheet and instructions sheet (IMG_1266, IMG_1267, IMG_1268)

A single project's page: three outline buttons and an empty chat list, a floating "New" button. IMG_1267 shows the "Project Files" sheet (empty), IMG_1268 the "Instructions" sheet with a text field and the keyboard open.

#### Layout, top to bottom

| Element                                                   | Box px (x, y, w, h)             | Size pt (w x h) | Anchor                                                | Fill or colour                                                     | Radius pt    | Status                     |
| --------------------------------------------------------- | ------------------------------- | --------------- | ----------------------------------------------------- | ------------------------------------------------------------------ | ------------ | -------------------------- |
| Menu button                                               | 58, 139, 136, 136               | 45.3 x 45.3     | L 19                                                  | as screen 1                                                        | full         | OBSERVED                   |
| Title <project name>                                      | text x 229 to 920, cap about 44 |                 | left aligned, 35 px (12 pt) after the menu button     | #000000                                                            | n/a          | OBSERVED                   |
| Pin and more capsule                                      | 984, 141, 242, 132              | 80.7 x 44       | R 19                                                  | #fbfbf9 with ring; pin glyph 1028, 1071..; dots glyph 1135 to 1181 | full         | OBSERVED                   |
| Button "Add files"                                        | 58, 315, 1168, 144              | 389.3 x 48      | L 19, R 19                                            | transparent, 1 pt outline #e1e1df                                  | full (24)    | OBSERVED                   |
| Button "Add instructions"                                 | 58, 483, 1168, 144              | 389.3 x 48      | gap 24 px (8 pt)                                      | same                                                               | full         | OBSERVED                   |
| Button "View memory"                                      | 58, 651, 1168, 144              | 389.3 x 48      | gap 24 px                                             | same                                                               | full         | OBSERVED                   |
| Empty icon circle                                         | 570, 1496, 144, 144             | 48 x 48         | C                                                     | #f0efec, chat glyph #7a7974                                        | full         | OBSERVED                   |
| Empty title "Ask Claude anything"                         | 367, 1709, 549, 56              | 183 x 18.7      | C                                                     | #7a7974                                                            | n/a          | OBSERVED                   |
| Empty subtitle "Chats in this project will show up here." | 213, 1790, 857, 47              | 285.7 x 15.7    | C                                                     | #7a7974                                                            | n/a          | OBSERVED                   |
| "New" button                                              | 925, 2548, 289, 130             | 96.3 x 43.3     | R 23, bottom 33                                       | #252524                                                            | full         | OBSERVED                   |
| Files sheet (IMG_1267)                                    | 24, 1289, 1236, 1465            | 412 x 488.3     | L 8, R 8, bottom 8                                    | #f9f9f7                                                            | about 37     | OBSERVED                   |
| Title "Project Files"                                     | 483, 1389, 318, 55              | 106 x 18.3      | C                                                     | #000000                                                            | n/a          | OBSERVED                   |
| Empty icon circle (files)                                 | 573, 1798, 138, 138             | 46 x 46         | C                                                     | #f0efec                                                            | full         | OBSERVED                   |
| "No files yet"                                            | 501, 2003, 285, 53              | 95 x 17.7       | C                                                     | #7a7974                                                            | n/a          | OBSERVED                   |
| Description (2 lines)                                     | 189, 2081, 907, 99              | 302.3 x 33      | C                                                     | #7a7974                                                            | n/a          | OBSERVED                   |
| Button "Add Files" (with paperclip)                       | 70, 2511, 1144, 144             | 381.3 x 48      | L 23, R 23, bottom 33 (sheet bottom 2754 minus 99 px) | #131313                                                            | full (24)    | OBSERVED                   |
| Instructions sheet (IMG_1268)                             | 0, 141, 1284, to bottom         | 428 wide        | top 47                                                | #f9f9f7                                                            | top about 38 | OBSERVED                   |
| Close button                                              | 58, 204, 136, 130               | 45.3 x 43.3     | L 19                                                  | ring                                                               | full         | OBSERVED                   |
| Confirm (check) button                                    | 1090, 199, 136, 136             | 45.3 x 45.3     | R 19                                                  | #242424, white check glyph                                         | full         | OBSERVED                   |
| Title "Instructions"                                      | 480, 245, 325, 44               | 108.3 x 14.7    | C                                                     | #000000                                                            | n/a          | OBSERVED                   |
| Text field                                                | 48, 393, 1188, 432              | 396 x 144       | L 16, R 16                                            | #ffffff, 1 px edge                                                 | about 24     | OBSERVED, radius ESTIMATED |
| Field placeholder (2 lines)                               | 96, 429, 1068, 121              | 356 x 40.3      | inside field, L 16                                    | #7a7974                                                            | n/a          | OBSERVED                   |
| Helper text (2 lines)                                     | 100, 860, 983, 100              | 327.7 x 33.3    | L 33, 35 px (12 pt) below the field                   | #7a7974                                                            | n/a          | OBSERVED                   |

#### Text

| Text                                                                     | Height px                                | Est. size pt | Weight   | Colour  | Align  | Status    |
| ------------------------------------------------------------------------ | ---------------------------------------- | ------------ | -------- | ------- | ------ | --------- |
| <project name> as title                                                  | cap about 44                             | 21           | semibold | #000000 | left   | ESTIMATED |
| "Add files", "Add instructions", "View memory"                           | cap 44                                   | 21           | medium   | #131313 | centre | ESTIMATED |
| "Ask Claude anything"                                                    | cap about 44                             | 21           | regular  | #7a7974 | centre | ESTIMATED |
| "Chats in this project will show up here."                               | cap about 35                             | 16.5         | regular  | #7a7974 | centre | ESTIMATED |
| "Project Files", "Instructions"                                          | cap 43                                   | 20.5         | semibold | #000000 | centre | ESTIMATED |
| "No files yet"                                                           | cap about 43                             | 20.5         | regular  | #7a7974 | centre | ESTIMATED |
| Files description                                                        | cap about 35                             | 16.5         | regular  | #7a7974 | centre | ESTIMATED |
| "Add Files"                                                              | cap about 42                             | 20           | medium   | #ffffff | centre | ESTIMATED |
| Instructions placeholder                                                 | cap about 40, line pitch 67 px (22.3 pt) | 19           | regular  | #7a7974 | left   | ESTIMATED |
| Helper "Instruct Claude how to behave and respond within <project name>" | cap 31, line pitch 59 px (19.7 pt)       | 14.5         | regular  | #7a7974 | left   | ESTIMATED |

#### Spacing and notes

- The three project actions are full-width outline pills 48 pt tall with 8 pt gaps and a 19 pt margin; they sit 16 pt below the header buttons.
- The files sheet is the medium detent (same 8 pt inset as the other sheets) with an empty state in the middle and the primary button near the bottom; there is no list state in this range.
- The instructions sheet is the full-height form: field and helper text are not centred, and the keyboard fills the lower half. The system keyboard is 1042 px (about 347 pt) tall from y 1736 and is not measured further.
- IMG_1266 header: the capsule groups a filled pin glyph (#383835) and a three-dots glyph; the title is left aligned and truncates before the capsule.

## What the range does not show

- No sidebar or drawer, no chat conversation with markdown, no streaming state, no code blocks, no attachment chips, no settings screens, no paywall, no effort sub-screen.
- Keyboard layout (system) is visible in IMG_1247, IMG_1250, IMG_1257, IMG_1260 and IMG_1268 but is the iOS keyboard and not measured.
