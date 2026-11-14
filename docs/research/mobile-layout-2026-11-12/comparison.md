# Mobile layout, side by side: ChatGPT, Claude, Perplexity, Gemini and our app (observed 2026-11-12)

Status: Historical snapshot
Owner: Product (founder)
Last updated: 2026-11-13

One table for each part the apps share, one column for each app. Every number comes from the app's own file in this folder, which names the screenshot and the pixel rectangle behind it. Method and limits are in `docs/research/mobile-layout-2026-11-12/README.md`.

How to read the tables:

- Sizes are points. The four reference apps were captured on a 428 x 926 point phone; ours on a 402 x 874 point simulator. Compare a part that stretches with the screen by its inset, not its width.
- Text sizes of the four reference apps are raw readings: up to one point high, and possibly two points above each app's default because of the phone's Text Size setting (README, "How far to trust the numbers"). Our text sizes are the values in our code.
- "Not shown" means the reference set has no screenshot of that part. "Not captured" means we did not capture it in our app in this pass.
- Colours are from a dark capture for ChatGPT, Perplexity and Gemini and a light capture for Claude and our app, so compare colours only within one theme.

## 1. Screen frame

| Metric                      | ChatGPT                           | Claude                                    | Perplexity                  | Gemini                       | Ours                                            |
| --------------------------- | --------------------------------- | ----------------------------------------- | --------------------------- | ---------------------------- | ----------------------------------------------- |
| Screen in points            | 428 x 926                         | 428 x 926                                 | 428 x 926                   | 428 x 926                    | 402 x 874                                       |
| Theme in the capture        | dark                              | light                                     | dark                        | dark                         | light                                           |
| Page background             | #000000                           | #f9f9f7                                   | dark, sheets #161616        | #000000                      | #f7f7f7                                         |
| Where the header row starts | 47                                | 46                                        | 47                          | 47                           | 62 (this simulator has a taller status area)    |
| Header control height       | 44                                | 45                                        | 44                          | 44                           | 42 pill, 15 glyphs                              |
| Header control style        | round glass buttons, fill #1f1f1f | round buttons with a ring and soft shadow | round buttons, fill #353535 | round buttons, fill #1f1f1f  | bare glyphs, no button shape                    |
| Header side margin          | 20                                | 19                                        | 20                          | 20                           | 28.3 to the left glyph, 20.7 to the right glyph |
| Composer side margin        | 12 with keyboard, 34 at rest      | 16 at rest, 8 with keyboard               | 18                          | 32 at rest, 15 with keyboard | 14 in both states                               |
| List and card side margin   | 16 lists, 20 settings cards       | 20 settings cards, 16 form fields         | 16 to 20                    | 16 lists, 21 settings cards  | 16 lists and settings cards, 20 add menu        |

## 2. Chat header on the home screen

| Metric               | ChatGPT                                                   | Claude                               | Perplexity                           | Gemini                                                 | Ours                                                  |
| -------------------- | --------------------------------------------------------- | ------------------------------------ | ------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------- |
| Left control         | menu button, 44 circle, L 20                              | menu button, 45 circle, L 19         | avatar, 40 circle                    | menu button, 44 circle, L 20                           | menu glyph 15.3 x 13.3, L 28.3                        |
| Centre               | "Chat" / "Work" pill, 158.7 x 48.3; selected part 71 x 39 | nothing on the home screen           | wordmark, 114 x 24                   | title with the model beside it and a chevron, about 20 | "Chat" / "Work" pill, 150 x 42; selected part 72 x 36 |
| Centre label size    | 16 medium                                                 | 15.5 where a title shows             | not text                             | 20 regular                                             | 14 semibold                                           |
| Right control        | new-chat button, 44 circle, R 20                          | private-chat button, 45 circle, R 19 | two 44 round buttons, 12 apart, R 20 | new-chat and avatar, 44 circles, 12 apart, R 20        | private-chat glyph 14.7, R 20.7                       |
| Gap between controls | 71 each side of the pill                                  | no centre control                    | 14 after the avatar                  | 12 between the right buttons                           | 82 left of the pill, 90.7 right of it                 |

## 3. Composer

| Metric                                | ChatGPT                                   | Claude                                                           | Perplexity                     | Gemini                                | Ours                                                 |
| ------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- | ------------------------------ | ------------------------------------- | ---------------------------------------------------- |
| Shape at rest, no keyboard            | one-row pill, 360 x 48                    | one-row pill, 52.7 tall                                          | two-row card, 107.7 tall       | one-row pill, 70 tall                 | two-row card, 374 x 92                               |
| Shape with the keyboard open          | two-row card, 404 x 96                    | two-row card, 100 tall                                           | two-row card                   | one-row pill, 71 tall                 | the same two-row card, 374 x 92                      |
| Corner radius                         | about 26 card, full pill at rest          | about 25 card, full pill at rest                                 | about 24                       | about 35, full pill                   | 24                                                   |
| Fill                                  | #1f1f1f                                   | #fbfbf9 with a soft shadow                                       | #282828 with a lighter border  | #1d1e22                               | #ffffff with a 1 pt border #ececec                   |
| Placeholder size                      | 19.5                                      | 19.5 to 20                                                       | 18                             | 19                                    | 16                                                   |
| Plus                                  | glyph 20, no circle                       | 36 circle, glyph 13                                              | 34 round button, glyph 12      | glyph 20, no circle                   | glyph 18.7, no circle                                |
| Model on the composer                 | not there                                 | chip 123 x 36 with the model and its effort word (keyboard open) | "Model" pill, 67 x 34          | not there; the model is in the header | text label, 15 medium, no pill                       |
| Effort on the composer                | gauge glyph 26 x 22                       | the word inside the model chip                                   | not there                      | not there                             | gauge glyph 22 x 17; its needle turns with the level |
| Microphone                            | glyph 19 x 24                             | 36 circle, glyph 14 x 16                                         | 32 round button, glyph 13 x 17 | glyph 15 x 19                         | glyph 16 x 22                                        |
| Voice button                          | 34.7 circle, white                        | 36 circle, #131313                                               | 33.3 circle, teal #4e99a3      | 40 circle, #1c2863                    | 36 circle, #111111                                   |
| Send button                           | not shown                                 | 36 circle, #b96647                                               | not shown                      | 40 circle, #253a95                    | 36 circle, #111111                                   |
| Spacing of the right-hand controls    | gaps of 25 and 21; centres about 48 apart | 8 between circles; centres 44 apart                              | 3 between buttons              | 8 between the two circles             | centres 48 apart                                     |
| Voice button to the card's right edge | 7.7                                       | 8                                                                | 11                             | 16                                    | 8                                                    |
| Card bottom to screen bottom          | 34                                        | 33.7                                                             | 36                             | 33                                    | 40                                                   |
| Card bottom to keyboard               | 12                                        | 7 to 8                                                           | not shown                      | 13                                    | 8                                                    |

## 4. Model picker

| Metric                    | ChatGPT              | Claude                                                                         | Perplexity                                                  | Gemini                                         | Ours                                         |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| Container                 | not shown in the set | bottom sheet with a grabber, two heights; 8 from the sides at the lower height | sheet floating 8 from the left, right and bottom, 412 x 811 | menu 249 x 219 dropping from the header title  | bottom sheet, full width, top at 367         |
| Row height                | not shown            | 73 to 75.7 (name and a description)                                            | 56.4; 83 for the first row                                  | 65 (name and a second line)                    | 52                                           |
| Model name size           | not shown            | 21                                                                             | 18                                                          | 19.5                                           | 15 semibold                                  |
| Description               | not shown            | on every row, 17, grey                                                         | on the first row only, 17.5                                 | a grey second line on every row                | on Auto only, 14; none on a model            |
| Logo                      | not shown            | none                                                                           | 16 to 19                                                    | none                                           | provider mark, 22                            |
| Check mark                | not shown            | 16.5, blue, at the right                                                       | 17 x 12, teal, at the right                                 | 12.7 x 9, before the name                      | 13 x 9.3, at the right; the row also darkens |
| Tags on a row             | not shown            | none                                                                           | "Max" and "New" pills, about 44 x 25.5                      | a lock glyph                                   | none                                         |
| Filters                   | not shown            | none                                                                           | none                                                        | none                                           | four chips, 36 tall                          |
| Search                    | not shown            | none                                                                           | none                                                        | none                                           | field, 48 tall                               |
| A provider's other models | not shown            | a "More models" card                                                           | one flat list                                               | one flat list                                  | open under the provider's row, 52 each       |
| Effort inside the picker  | not shown            | an "Effort" row, 54 tall, opening a further level                              | none                                                        | a "Thinking level" row opening a further level | none; it is on the composer                  |

## 5. Effort control

| Metric                 | ChatGPT                                 | Claude                                                  | Perplexity | Gemini                  | Ours                                                 |
| ---------------------- | --------------------------------------- | ------------------------------------------------------- | ---------- | ----------------------- | ---------------------------------------------------- |
| Kind                   | slider that takes the composer's place  | a row in the model picker, and a word on the model chip | not shown  | a row in the model menu | slider that takes the composer's place               |
| Track                  | 340 x 70                                | none                                                    | not shown  | none                    | 298 x 36, as tall as the 36 tick button to its right |
| Handle or fill         | 48; a light capsule grows from the left | none                                                    | not shown  | none                    | 28 tall; a dark capsule grows from the left          |
| Dots                   | 12                                      | none                                                    | not shown  | none                    | 8                                                    |
| Distance between stops | 67                                      | none                                                    | not shown  | none                    | 65.5                                                 |
| Level name             | 24.5 semibold, 26 above the track       | "Low", 17, grey, at the row's right                     | not shown  | not shown               | 20 semibold, 22.3 above the track                    |

## 6. Add menu

| Metric         | ChatGPT              | Claude                                                          | Perplexity              | Gemini                                                          | Ours                                |
| -------------- | -------------------- | --------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------- | ----------------------------------- |
| Container      | not shown in the set | bottom sheet "Add to Chat", two heights                         | never opened in the set | bottom sheet, two heights                                       | bottom sheet as tall as its content |
| Tiles          | not shown            | a photo strip: a camera tile then thumbnails, 100 to 104 square | not shown               | 116 x 103, 4 apart, radius about 25; the strip scrolls sideways | three tiles, 112.7 x 74, 12 apart   |
| Row height     | not shown            | 52 to 54                                                        | not shown               | 68.7 (title and a description)                                  | 43; 48 with a switch                |
| Rows           | not shown            | 5 rows in 2 cards                                               | not shown               | 6 rows                                                          | 8 rows in 2 cards                   |
| Row icon       | not shown            | 17 to 19                                                        | not shown               | 19 to 21                                                        | 16.7                                |
| Row label size | not shown            | 20                                                              | not shown               | 19.5 title, 17 description                                      | 15                                  |

## 7. Side panel

| Metric                    | ChatGPT                                                                            | Claude               | Perplexity                                  | Gemini                                                        | Ours                                                    |
| ------------------------- | ---------------------------------------------------------------------------------- | -------------------- | ------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| Kind and width            | drawer, 330 (77 percent); the page shows as a 98 strip                             | not shown in the set | a full-screen page                          | a full-screen menu                                            | drawer, 300 (75 percent); the page shows as a 102 strip |
| Row pitch                 | 52                                                                                 | not shown            | 40 navigation, 44 sessions                  | 44                                                            | 46                                                      |
| Row icon                  | 22, centre 45 from the edge                                                        | not shown            | 15 to 17                                    | 22, L 27                                                      | 16.3, L 27.7                                            |
| Row label                 | 19.5 to 20, L 72                                                                   | not shown            | 17.5, L 48.7                                | 20, L 65                                                      | 15, L 58.3                                              |
| Section heading           | "Pinned" and "Recents", 20 semibold, in one capture; a 1 pt separator in the other | not shown            | "Projects" and "Sessions", 17.5             | "Notebooks", 20, grey                                         | none; one 1 pt divider                                  |
| Chats listed in the panel | yes, 52 per row                                                                    | not shown            | yes                                         | yes                                                           | no; a "Chats" row opens a page                          |
| Footer                    | "Chat" pill 121 x 52 and a 52 avatar, 34 from the bottom                           | not shown            | search field 335 x 44 and a 44 round button | account row: 36 avatar, name, "Upgrade" pill 90 x 37, gear 21 | none                                                    |
| Search                    | 44 circle button at the top                                                        | not shown            | field in the footer                         | 48 circle beside the close button                             | 34 circle button at the top                             |
| Mode switch               | none                                                                               | not shown            | none                                        | none                                                          | "Local" / "Cloud" pill, 272 x 46                        |

## 8. Messages

| Metric                        | ChatGPT           | Claude                                     | Perplexity | Gemini                                   | Ours                                   |
| ----------------------------- | ----------------- | ------------------------------------------ | ---------- | ---------------------------------------- | -------------------------------------- |
| User bubble fill and radius   | #212121, about 25 | #f0efec, full pill (24.5)                  | not shown  | #141414, full pill (31.7)                | #ececec, about 24                      |
| User bubble side margin       | 16                | 16                                         | not shown  | 24                                       | 14                                     |
| Text inside the bubble's edge | 16.7              | 16.7                                       | not shown  | about 30                                 | 15.3                                   |
| One-line bubble height        | not shown         | 49                                         | not shown  | 63                                       | about 50                               |
| Message text size             | 19                | 20                                         | not shown  | 19.5                                     | 16                                     |
| Line pitch                    | 22                | 27.3 (serif reply)                         | not shown  | 26.7                                     | 26                                     |
| Reply's left edge             | 16                | 16.7                                       | not shown  | 24                                       | 14.7                                   |
| Action row under a reply      | not shown         | thumb glyphs 13 to 14, 31 apart, from L 20 | not shown  | six glyphs 17 to 21, 44 apart, from L 24 | six glyphs 14.7, 46 apart, from L 38.7 |

## 9. Settings list

| Metric           | ChatGPT                                                                | Claude                                             | Perplexity                                   | Gemini                                             | Ours                             |
| ---------------- | ---------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------- | -------------------------------------------------- | -------------------------------- |
| Row height       | 54                                                                     | 54                                                 | 54                                           | 56                                                 | 50                               |
| Row label size   | 19 to 20                                                               | 19.5                                               | 17.5                                         | 19.5                                               | 15                               |
| Value text size  | 19 to 20, #98989f                                                      | 19.5, #8a8a8d                                      | 17, #9a9a9a                                  | not read                                           | 14, #6c6c6c                      |
| Row icon         | 20, 23 inside the card                                                 | 16 to 20, centre 53 from the screen edge           | 16.7, 17.7 inside the card                   | 19                                                 | 16 to 17, 15 inside the card     |
| Section heading  | 19.5 to 20 semibold, L 41                                              | 16.5 regular, grey, L 40.7                         | 15.5, L 40                                   | 18, grey, L 40                                     | 14 semibold, grey, L 18.3        |
| Card side margin | 20                                                                     | 20                                                 | 16 to 20                                     | 21                                                 | 16                               |
| Card radius      | about 26 to 27                                                         | 26                                                 | about 24 to 27                               | not read                                           | 24                               |
| Separator        | 1 pt, starts after the icon column, stops 20 short of the card's right | 1 pt, starts after the icon column, stops 20 short | 1 pt, starts 16 or 48 inside, stops 20 short | 1 pt, starts after the icon column, stops 20 short | 1 pt, the full width of the card |
| Switch           | 63 x 28                                                                | 63 x 28                                            | 63 x 28                                      | 63 x 27 to 28                                      | 63 x 28                          |
| Chevron          | 7.7 x 13                                                               | 6.3 x 11.3                                         | 7.3 x 12.3                                   | not read                                           | 5.7 x 9.7                        |

## 10. Sheets and dialogs

| Metric                                   | ChatGPT                                | Claude                   | Perplexity            | Gemini                              | Ours                             |
| ---------------------------------------- | -------------------------------------- | ------------------------ | --------------------- | ----------------------------------- | -------------------------------- |
| Corner radius                            | about 40 full width, 34 to 37 floating | about 37 to 38           | about 36              | about 36                            | about 32                         |
| Grabber                                  | 58 x 4                                 | 58 x 4                   | 58 x 4                | 58 to 60 x 4                        | 36 x 4                           |
| Title size                               | 19 semibold                            | 19.5 to 20.5 semibold    | 18.5 semibold         | 32 on the settings page             | 17 semibold                      |
| Close button                             | 44 circle                              | 43 to 44 circle          | 42 to 44 round button | 44 circle                           | bare glyph, 9.5 to 12, no circle |
| Floating sheets, 8 from the screen edges | yes                                    | yes, at the lower height | yes                   | yes, for the add and upgrade sheets | no; every sheet is full width    |

## 11. Buttons

| Metric    | ChatGPT                                     | Claude                         | Perplexity                              | Gemini                           | Ours         |
| --------- | ------------------------------------------- | ------------------------------ | --------------------------------------- | -------------------------------- | ------------ |
| Primary   | white pill, 364 x 56.7, label 19.5 semibold | dark pill, 48 tall, label 20.5 | teal pill, 396 x 52, label 18           | blue pill, 53.7 tall, label 19.5 | not captured |
| Secondary | outlined pill, 52 tall                      | outlined pill, 48 tall         | light pill 320 x 48; dark pill 365 x 46 | dark pill, 54 tall               | not captured |

## 12. Paywall and voice mode

| Metric              | ChatGPT                                                                | Claude                              | Perplexity                                            | Gemini                                                                 | Ours         |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------ |
| Plan card           | 364 wide, 1 pt border, radius about 16; the price is inside the button | not shown                           | two cards 189 x 116, radius about 17; price 23.5 bold | no card; a sheet with three benefit rows, a price line and two buttons | not captured |
| Feature row         | 51 for one line, 65.7 for two                                          | not shown                           | 42                                                    | not read                                                               | not captured |
| Voice mode controls | three 80.7 circles, 120 apart                                          | 64 microphone circle and 45 circles | not shown                                             | four 44 circles around a 110 x 64 pill                                 | not captured |

## What the numbers show

Observations only. None of these is a decision, and the text-size ones wait on the founder confirming his phone's Text Size setting.

1. **Text is smaller in our app.** Our labels and messages are 14 to 16 points. The four reference apps read 17.5 to 20. If the reference phone was at the default Text Size, their body text is 19 and ours is 3 to 4 points smaller; if it was one notch up, their default is 17 and ours is 1 to 2 points smaller.
2. **Header controls.** All four put each header control in a round button of 44 to 45 points, 19 to 20 from the screen edge. Ours are bare glyphs of about 15 points with no button shape.
3. **Close buttons on sheets.** All four use a round button of 42 to 44 points. Ours is a bare glyph of 9.5 to 12 points.
4. **Sheets.** All four use a 58 x 4 grabber and a corner radius of 36 to 41; ours are 36 x 4 and about 32. Three of the four also float some sheets 8 points in from the screen edges; ours are always full width.
5. **Settings rows.** The four use rows of 54 to 56 points, separators that start after the icon column, and section headings 40 points from the screen edge. Ours are 50 points, with separators across the whole card and headings 18 points from the edge.
6. **Composer.** Our composer is a two-row card whether the keyboard is open or not. ChatGPT, Claude and Gemini rest as a one-row pill of 48 to 70 points and only ChatGPT and Claude grow to two rows with the keyboard; Perplexity is two rows in both states, as ours is. Our 36 point voice and send circle equals Claude's and is 1.3 points larger than ChatGPT's; our 48 point spacing of the right-hand controls equals ChatGPT's.
7. **Effort slider.** Since 2026-11-13 ours is slimmer than ChatGPT's, by the founder's call: the track is 36 points tall against 70, the height of the tick button beside it, with a 28 point handle against 48 and 8 point dots against 12. It is 42 points narrower, on a screen 26 points narrower, and the stops are 65.5 apart against 67. The level name is 20 against 24.5.
8. **Model picker.** Ours is the only one with a search field, filters and provider logos at 22 points. Its rows are the shortest (52, one line); Perplexity's are 56, Gemini's 65 and Claude's 73 to 76 with a second line.
9. **Side panel.** Ours is a 300 point drawer with rows 46 apart and no chat list; ChatGPT's is a 330 point drawer with rows 52 apart that lists chats under the navigation rows.
10. **Messages.** Bubble shape and padding are close to Claude's (radius about 24, text 15 to 17 inside the edge). Our side margin is 14 against 16 to 24, and our action glyphs are 14.7 against Gemini's 17 to 21.
11. **Switches** are the system control at 63 x 28 in all five.
