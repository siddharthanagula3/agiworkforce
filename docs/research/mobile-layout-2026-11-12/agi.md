# Our app on iPhone: layout measurements (observed 2026-11-12)

Status: Historical snapshot
Owner: Product (founder)
Last updated: 2026-11-13

The mobile app in this worktree, measured the same way as the four reference apps so the numbers can be set side by side. Method, tool and limits are in `docs/research/mobile-layout-2026-11-12/README.md`. Sizes are points unless a column says pixels. OBSERVED means read from pixels by the tool; ESTIMATED means derived (text size from cap height, weight and radius by fit); UNKNOWN means not captured in this pass.

Captured on the iPhone 17 Pro simulator, 1206 x 2622 pixels at scale 3 (402 x 874 points), in Cloud, light theme, system text size at its default. The build is the working tree of 2026-11-12, after the composer effort control, the provider logos and the picker filters. The effort slider and the gauge on the composer were measured again on 2026-11-13, after the founder had the bar made as tall as the tick circle and the gauge needle made to follow the level. Account content from the seeded test account is replaced by placeholders. A text size marked "(code)" is the value in the source; the raw cap-height reading runs half a point to one point above it on text under 20 points, which is the correction the README describes. Sizes without that mark have the correction applied and are rounded to the app's type scale (14, 15, 16, 17, 20, 28). The grey gear floating at the right edge of every capture is the development menu button; it is not part of the product and is left out.

## Shared components

| Component                  | Metric                      | Value                                                                                                                                                                                                     | Capture                      | Status                                |
| -------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------- |
| Screen frame               | Screen                      | 402 x 874 pt, page background #f7f7f7                                                                                                                                                                     | home                         | OBSERVED                              |
| Screen frame               | Status bar                  | clock digits 38 px tall, about 18 pt; the header row starts at 62 pt                                                                                                                                      | home                         | OBSERVED, size ESTIMATED              |
| Screen frame               | Header row                  | controls centred at 83 pt from the top; the segmented pill spans 62 to 104 pt                                                                                                                             | home                         | OBSERVED                              |
| Screen frame               | Side margin of main content | 14 pt composer card; 16 pt picker rows, settings cards and chat cards; 20 pt add-menu tiles and cards; 28 pt header menu glyph; 20.7 pt header right glyph                                                | home, picker, plus, settings | OBSERVED                              |
| Chat header                | Left control                | menu glyph of three lines, 15.3 x 13.3 pt (46 x 40 px), #515151, L 28.3; no circle behind it                                                                                                              | home                         | OBSERVED                              |
| Chat header                | Title control               | segmented pill "Chat" / "Work", 150 x 42 pt (x 378 to 828 px), fill #ffffff; selected segment 72 x 36 pt, fill #dddddd, 3 pt inset                                                                        | home                         | OBSERVED                              |
| Chat header                | Segment label               | cap height 29 px, about 14 pt, semibold; #111111 selected, #6c6c6c unselected                                                                                                                             | home                         | ESTIMATED                             |
| Chat header                | Right control               | private-chat glyph 14.7 pt (44 px), #696969, R 20.7; no circle behind it                                                                                                                                  | home                         | OBSERVED                              |
| Chat header                | Gap                         | left glyph to pill 82 pt, pill to right glyph 90.7 pt                                                                                                                                                     | home                         | OBSERVED                              |
| Chat header                | Thread variant              | menu glyph L 27.3; title about 17 pt semibold, left aligned at L 60.7; new-chat glyph 16 pt at R 73.7; more glyph (three dots) 13.3 pt wide at R 27.3; 1 pt divider #e3e3e3 at 109 pt                     | thread                       | OBSERVED, size ESTIMATED              |
| Composer at rest           | Card inset and size         | L 14, R 14 (x 42 to 1164 px), 374 x 92 pt (y 2226 to 2502 px)                                                                                                                                             | home                         | OBSERVED                              |
| Composer at rest           | Card radius and fill        | radius 24 pt; fill #ffffff; 1 pt border #ececec                                                                                                                                                           | home                         | OBSERVED, radius ESTIMATED            |
| Composer at rest           | Placeholder                 | "What's on your mind?", cap height 34 px, 16 pt regular, #6c6c6c, starts L 31.7 (16.7 pt inside the card), cap top 22 pt below the card top                                                               | home                         | OBSERVED, size ESTIMATED              |
| Composer at rest           | Plus glyph                  | 18.7 pt (56 px), #535353, 16.7 pt inside the card, centre 807 pt from the top; no circle                                                                                                                  | home                         | OBSERVED                              |
| Composer at rest           | Model label                 | letter height 34 px, 15 pt medium (code), #535353, starts L 73.7, 23 pt after the plus glyph                                                                                                              | home                         | OBSERVED, size ESTIMATED              |
| Composer at rest           | Effort glyph (gauge)        | 22 x 17 pt (66 x 51 px), #535353, centre x 265 pt; the needle turns with the level, flat to the left at the lowest and flat to the right at the highest                                                   | home                         | OBSERVED                              |
| Composer at rest           | Microphone glyph            | 16 x 22 pt (48 x 66 px), #535353, centre x 313 pt                                                                                                                                                         | home                         | OBSERVED                              |
| Composer at rest           | Voice button                | circle 36 pt (108 px), fill #111111, white waveform glyph, 8 pt from the card's right and bottom inner edges                                                                                              | home                         | OBSERVED                              |
| Composer at rest           | Gaps between controls       | effort, microphone and voice centres 48 pt apart                                                                                                                                                          | home                         | OBSERVED                              |
| Composer at rest           | Distance to screen bottom   | 40 pt                                                                                                                                                                                                     | home                         | OBSERVED                              |
| Composer at rest           | Label above the card        | "Sent to AGI Cloud": cloud glyph 12.7 x 9.3 pt #1557e7 at L 18.7, text about 14 pt semibold #686868, small chevron; 7.7 pt above the card                                                                 | home                         | OBSERVED, size ESTIMATED              |
| Composer, keyboard open    | Card                        | same 374 x 92 pt card, 8 pt above the keyboard                                                                                                                                                            | keyboard                     | OBSERVED                              |
| Composer with text         | Send button                 | circle 36 pt, fill #111111, white up arrow, in the voice button's slot; typed text 16 pt #111111                                                                                                          | typed                        | OBSERVED, size ESTIMATED              |
| Model picker               | Container kind              | bottom sheet, full width, top edge at 367 pt (58 percent of the screen), fill #ffffff, top radius about 32 pt                                                                                             | picker                       | OBSERVED, radius ESTIMATED            |
| Model picker               | Grabber                     | 36 x 4 pt, #6c6c6c, 10 pt below the sheet top                                                                                                                                                             | picker                       | OBSERVED                              |
| Model picker               | Title and close             | "Models" about 17 pt semibold, centred; close glyph 9.5 pt, #545454, R 27, no circle                                                                                                                      | picker                       | OBSERVED, size ESTIMATED              |
| Model picker               | Search field                | pill 370 x 48 pt, L 16, R 16, 1 pt border #eaeaea; glyph 13.3 pt; placeholder 16 pt #6c6c6c                                                                                                               | picker                       | OBSERVED, size ESTIMATED              |
| Model picker               | Filter chips                | four pills 36 pt tall, 87, 102, 89 and 71 pt wide, 6 pt apart, L 16, fill #ececec; glyph 15 pt and label 14 pt semibold (code); selected chip fill #111111 with light label; 12 pt below the search field | picker, picker-instant       | OBSERVED, size ESTIMATED              |
| Model picker               | Auto card                   | 370 x 77 pt, fill #ececec, radius 16; glyph 15.7 pt; title 15 pt semibold; one description of two lines, 14 pt, #646464 (code)                                                                            | picker                       | OBSERVED, size ESTIMATED              |
| Model picker               | Row height                  | 52 pt, for a provider's row and for the rows opened under it                                                                                                                                              | picker, picker-open          | OBSERVED                              |
| Model picker               | Model name                  | cap height 33 px, 15 pt semibold (code), #111111, starts L 74.7                                                                                                                                           | picker                       | ESTIMATED                             |
| Model picker               | Description text            | none on a model row                                                                                                                                                                                       | picker                       | OBSERVED                              |
| Model picker               | Logo                        | provider mark 22 pt (66 px), #111111, 20 pt inside the card (L 36); rows opened under a provider carry no mark                                                                                            | picker, picker-open          | OBSERVED                              |
| Model picker               | Check mark                  | 13 x 9.3 pt (39 x 28 px), #121212, 54 pt from the card's right edge; the selected row's fill is #dbdbdb                                                                                                   | picker                       | OBSERVED                              |
| Model picker               | Dropdown chevron            | 10.7 x 6 pt (32 x 18 px), #646464, 18.7 pt inside the card's right edge                                                                                                                                   | picker                       | OBSERVED                              |
| Model picker               | Group card                  | L 16, R 16, fill #ececec, radius 16 pt, hairline separators                                                                                                                                               | picker                       | OBSERVED, radius ESTIMATED            |
| Model picker               | Effort word under Instant   | after the model name on the same line, 14 pt (code), muted ink                                                                                                                                            | picker-instant               | ESTIMATED                             |
| Effort or thinking control | Kind                        | horizontal slider that replaces the composer's contents in place, opened from the gauge on the composer                                                                                                   | effort                       | OBSERVED                              |
| Effort or thinking control | Card                        | the composer card grows to 374 x 108 pt                                                                                                                                                                   | effort                       | OBSERVED                              |
| Effort or thinking control | Track                       | 298 x 36 pt (x 93 to 987 px), as tall as the Done circle, full pill, fill #ececec, 16 pt inside the card; each stop's touch area is 44 pt tall (code)                                                     | effort                       | OBSERVED                              |
| Effort or thinking control | Fill and handle             | fill 28 pt tall, 4 pt inside the track, #111111, grows from the left to the chosen stop                                                                                                                   | effort                       | OBSERVED                              |
| Effort or thinking control | Dots                        | 8 pt; #646464 on the track, #9b9b9b on the fill; stops 65.5 pt apart                                                                                                                                      | effort                       | OBSERVED                              |
| Effort or thinking control | Label text                  | level name above the track, cap height 43 px, 20 pt semibold, #111111, centred, 22.3 pt above the track                                                                                                   | effort                       | OBSERVED, size ESTIMATED              |
| Effort or thinking control | Done button                 | circle 36 pt, fill #111111, white tick, 8 pt right of the track                                                                                                                                           | effort                       | OBSERVED                              |
| Attach or plus menu        | Container kind              | bottom sheet "Add to Chat", full width, top edge at 263 pt, fill #ffffff                                                                                                                                  | plus                         | OBSERVED                              |
| Attach or plus menu        | Tile size                   | three tiles 112.7 x 74 pt, L 20, 12 pt apart, fill #ececec                                                                                                                                                | plus                         | OBSERVED                              |
| Attach or plus menu        | Row size                    | 43 pt; 48 pt for the row with a switch; two cards 362 pt wide, L 20, R 20, 16 pt apart                                                                                                                    | plus                         | OBSERVED                              |
| Attach or plus menu        | Icon size                   | tile glyph 20 pt; row glyph 16.7 pt, #646464                                                                                                                                                              | plus                         | OBSERVED                              |
| Attach or plus menu        | Label text size             | tile label about 14 pt; row label about 15 pt, #111111; upload note about 13 pt on a 17 pt pitch                                                                                                          | plus                         | ESTIMATED                             |
| Attach or plus menu        | Items per row               | 3 tiles in one row; then 1 item per row, 8 rows in 2 cards                                                                                                                                                | plus                         | OBSERVED                              |
| Sidebar or drawer          | Width                       | 300 pt (75 percent of 402), fill #ffffff, 1 pt right border #eaeaea; the page stays visible as a dimmed 102 pt strip                                                                                      | sidebar                      | OBSERVED                              |
| Sidebar or drawer          | Row height                  | 46 pt pitch                                                                                                                                                                                               | sidebar                      | OBSERVED                              |
| Sidebar or drawer          | Row icon and label          | glyph 16.3 pt at L 27.7; label cap height 33 px, 15 pt (code), #535353, at L 58.3                                                                                                                         | sidebar                      | OBSERVED, size ESTIMATED              |
| Sidebar or drawer          | Mode switch                 | "Local" / "Cloud" pill 272 x 46 pt at L 14, 1 pt border                                                                                                                                                   | sidebar                      | OBSERVED                              |
| Sidebar or drawer          | Row tag                     | "Cloud" outlined pill 57.7 x 24 pt, right edge 27 pt inside the drawer                                                                                                                                    | sidebar                      | OBSERVED                              |
| Sidebar or drawer          | Section heading             | none; one 1 pt divider #eaeaea between the navigation rows and the four lower rows                                                                                                                        | sidebar                      | OBSERVED                              |
| Sidebar or drawer          | Footer                      | none                                                                                                                                                                                                      | sidebar                      | OBSERVED                              |
| Sidebar or drawer          | Search                      | a 34 pt outlined circle button at the top, beside a second 34 pt circle, 10 pt apart; not a field                                                                                                         | sidebar                      | OBSERVED                              |
| Messages                   | User bubble                 | right aligned, R 14, up to 318 pt wide (79 percent), fill #ececec, radius about 24 pt, text 15.3 pt inside the edge; a one-line bubble is about 50 pt tall                                                | thread                       | OBSERVED, radius and height ESTIMATED |
| Messages                   | Message text                | cap height 34 px, 16 pt regular, #111111, line pitch 26 pt, in the bubble and in the reply                                                                                                                | thread                       | OBSERVED, size ESTIMATED              |
| Messages                   | Assistant text              | no bubble, starts L 14.7                                                                                                                                                                                  | thread                       | OBSERVED                              |
| Messages                   | Report line                 | flag glyph and "Report", about 13 pt, #a1a1a1, under each reply                                                                                                                                           | thread                       | ESTIMATED                             |
| Messages                   | Action row                  | five glyphs 14.7 pt (44 px) and a more glyph, #686868, 46 pt apart, first at L 38.7, always visible                                                                                                       | thread                       | OBSERVED                              |
| Settings list              | Row height                  | 50 pt pitch, including a 1 pt separator #eaeaea                                                                                                                                                           | settings                     | OBSERVED                              |
| Settings list              | Row label                   | cap height 33 px, 15 pt (code), #111111, starts L 61.3                                                                                                                                                    | settings                     | ESTIMATED                             |
| Settings list              | Value text                  | cap height 32 px, 14 pt (code), #6c6c6c, right aligned before the chevron                                                                                                                                 | settings                     | ESTIMATED                             |
| Settings list              | Row icon                    | glyph 16 to 17 pt, #535353, at L 31 (15 pt inside the card)                                                                                                                                               | settings                     | OBSERVED                              |
| Settings list              | Section heading             | cap height 31 px, 14 pt semibold (code), #686868, at L 18.3; 28 pt below the card above, 11.7 pt above its own card                                                                                       | settings                     | ESTIMATED                             |
| Settings list              | Card inset, radius, fill    | L 16, R 16 (370 pt wide), radius 24 pt, fill #ffffff on #f7f7f7                                                                                                                                           | settings                     | OBSERVED, radius ESTIMATED            |
| Settings list              | Toggle                      | 63 x 28 pt, on fill #0c755c (measured in the add menu)                                                                                                                                                    | plus                         | OBSERVED                              |
| Settings list              | Chevron                     | 5.7 x 9.7 pt (17 x 29 px), #6c6c6c, right edge 19.7 pt inside the card                                                                                                                                    | settings                     | OBSERVED                              |
| Sheets and dialogs         | Corner radius               | about 32 pt on bottom sheets                                                                                                                                                                              | picker                       | ESTIMATED                             |
| Sheets and dialogs         | Grabber                     | 36 x 4 pt, #6c6c6c, 10 pt below the sheet top                                                                                                                                                             | picker, plus                 | OBSERVED                              |
| Sheets and dialogs         | Title text                  | about 17 pt semibold, centred, #111111                                                                                                                                                                    | picker, plus, settings       | ESTIMATED                             |
| Sheets and dialogs         | Close button                | a bare glyph of 9.5 to 12 pt, R 27 to 30; no circle behind it                                                                                                                                             | picker, plus, settings       | OBSERVED                              |
| Buttons                    | Primary and secondary       | not captured in this pass                                                                                                                                                                                 | none                         | UNKNOWN                               |
| Paywall or upgrade         | all metrics                 | not captured in this pass                                                                                                                                                                                 | none                         | UNKNOWN                               |
| Voice mode                 | all metrics                 | not captured in this pass                                                                                                                                                                                 | none                         | UNKNOWN                               |

## Screens

### 1. New chat with the composer at rest (capture: home)

The header row with the menu glyph, the "Chat" / "Work" pill and the private-chat glyph; a one-line greeting centred in the page; the destination label; the composer card.

#### Layout, top to bottom

| Element            | Rectangle in pixels (x, y, w, h) | Size in points | Position                           | Fill or colour              | Radius | Status                     |
| ------------------ | -------------------------------- | -------------- | ---------------------------------- | --------------------------- | ------ | -------------------------- |
| Status clock       | 170, 79, 105, 38                 | 35 x 12.7      | L 56.7, top 26.3                   | #000000                     | none   | OBSERVED                   |
| Menu glyph         | 85, 229, 46, 40                  | 15.3 x 13.3    | L 28.3, centre y 83                | #515151                     | none   | OBSERVED                   |
| Segmented pill     | 378, 186, 450, 126               | 150 x 42       | centred, top 62                    | #ffffff                     | full   | OBSERVED                   |
| Selected segment   | 387, 195, 216, 108               | 72 x 36        | 3 inside the pill                  | #dddddd                     | full   | OBSERVED                   |
| Private-chat glyph | 1100, 227, 44, 44                | 14.7 x 14.7    | R 20.7, centre y 83                | #696969                     | none   | OBSERVED                   |
| Greeting           | 95, 1285, 1016, 65               | 338.7 x 21.7   | centred, cap top 428.3             | #111111                     | none   | OBSERVED                   |
| Destination label  | 56, 2171, 444, 32                | 148 x 10.7     | L 18.7, top 723.7                  | #1557e7 glyph, #686868 text | none   | OBSERVED                   |
| Composer card      | 42, 2226, 1122, 276              | 374 x 92       | L 14, R 14, bottom 40              | #ffffff, border #ececec     | 24     | OBSERVED, radius ESTIMATED |
| Placeholder        | 95, 2295, 467, 45                | 155.7 x 15     | L 31.7, 22 below the card top      | #6c6c6c                     | none   | OBSERVED                   |
| Plus glyph         | 95, 2393, 56, 56                 | 18.7 x 18.7    | 16.7 inside the card, centre y 807 | #535353                     | none   | OBSERVED                   |
| Model label        | 221, 2403, 241, 35               | 80.3 x 11.7    | L 73.7, centre y 807               | #535353                     | none   | OBSERVED                   |
| Effort glyph       | 762, 2394, 66, 51                | 22 x 17        | centre x 265                       | #535353                     | none   | OBSERVED                   |
| Microphone glyph   | 915, 2388, 48, 66                | 16 x 22        | centre x 313                       | #535353                     | none   | OBSERVED                   |
| Voice button       | 1029, 2367, 108, 108             | 36 x 36        | 8 inside the card right and bottom | #111111                     | full   | OBSERVED                   |

#### Text

| Text                                   | Cap height in pixels | Size in points | Weight   | Colour           | Alignment              | Status    |
| -------------------------------------- | -------------------- | -------------- | -------- | ---------------- | ---------------------- | --------- |
| Status clock                           | 38                   | 18             | semibold | #000000          | left                   | ESTIMATED |
| "Chat", "Work"                         | 29                   | 14             | semibold | #111111, #6c6c6c | centred in the segment | ESTIMATED |
| Greeting "How can I help you tonight?" | 60                   | 28             | regular  | #111111          | centred                | ESTIMATED |
| "Sent to AGI Cloud"                    | 31                   | 14             | semibold | #686868          | left                   | ESTIMATED |
| Placeholder "What's on your mind?"     | 34                   | 16             | regular  | #6c6c6c          | left                   | ESTIMATED |
| Model label                            | 34 (letter height)   | 15 (code)      | medium   | #535353          | left                   | ESTIMATED |

#### Spacing and notes

- The header controls are bare glyphs; none sits in a circle.
- The effort, microphone and voice controls are spaced on 48 pt centres. The plus glyph has no circle and the model label follows it after 23 pt.
- The card's bottom edge is 40 pt above the bottom of the screen; with the keyboard open (capture: keyboard) the same card sits 8 pt above the keyboard.
- With text in the field (capture: typed) the voice button becomes a send button of the same size and place, a white up arrow on #111111.
- Code: `apps/mobile/src/features/chat/components/ChatInput.tsx`, `composerMetrics.ts`, `ModelSelectorButton.tsx`, `ComposerEffort.tsx`, `SendButton.tsx`.

### 2. Effort slider on the composer (captures of 2026-11-13: effort-quick, effort-maximum)

Tapping the gauge replaces the text field and the controls row with the level's name, a five-stop track and a tick button. The card grows upward and stays in place.

#### Layout, top to bottom

| Element             | Rectangle in pixels (x, y, w, h) | Size in points | Position                                    | Fill or colour          | Radius | Status   |
| ------------------- | -------------------------------- | -------------- | ------------------------------------------- | ----------------------- | ------ | -------- |
| Composer card       | 42, 2178, 1122, 324              | 374 x 108      | L 14, R 14, bottom 40                       | #ffffff, border #ececec | 24     | OBSERVED |
| Level name          | 481, 2235, 263, 47               | 87.7 x 15.7    | centred, 18 below the card's inner top edge | #111111                 | none   | OBSERVED |
| Track               | 93, 2349, 894, 108               | 298 x 36       | 16 inside the card, 22.3 below the name     | #ececec                 | full   | OBSERVED |
| Fill at stop 1 of 5 | 105, 2361, 84, 84                | 28 x 28        | 4 inside the track                          | #111111                 | full   | OBSERVED |
| Fill at stop 5 of 5 | 105, 2361, 870, 84               | 290 x 28       | 4 inside the track                          | #111111                 | full   | OBSERVED |
| Dot on the track    | 332, 2391, 24, 24                | 8 x 8          | stops 65.5 apart                            | #646464                 | full   | OBSERVED |
| Dot on the fill     | 135, 2391, 24, 24                | 8 x 8          | stops 65.5 apart                            | #9b9b9b                 | full   | OBSERVED |
| Done button         | 1011, 2349, 108, 108             | 36 x 36        | 8 right of the track, 14 inside the card    | #111111                 | full   | OBSERVED |

#### Text

| Text                            | Cap height in pixels | Size in points | Weight   | Colour  | Alignment | Status    |
| ------------------------------- | -------------------- | -------------- | -------- | ------- | --------- | --------- |
| Level name ("Quick", "Maximum") | 43                   | 20             | semibold | #111111 | centred   | ESTIMATED |

#### Spacing and notes

- The fill is the handle: its width is 28 pt plus 65.5 pt for each stop passed, so it reaches from the left edge to the chosen stop. Stops the fill has passed stay visible as lighter dots on it.
- A tap on a stop or a drag along the track sets the level; the tick closes the slider.
- The track is 36 pt tall, the height of the tick circle beside it, inside a touch area 44 pt tall (code). Its bottom is 14 pt above the card's inner bottom edge.
- Code: `apps/mobile/src/features/model-picker/components/EffortSlider.tsx`, `apps/mobile/src/features/model-picker/components/EffortGauge.tsx`, `apps/mobile/src/features/chat/components/ComposerEffort.tsx`.

### 3. Model picker (captures: picker, picker-open, picker-instant)

A bottom sheet with a search field, four filter chips, the Auto card, then one row for each provider. A provider's row opens the rest of its models under it. With a filter on, the sheet lists the matching models in one flat card.

#### Layout, top to bottom

| Element                     | Rectangle in pixels (x, y, w, h) | Size in points | Position                     | Fill or colour          | Radius         | Status                     |
| --------------------------- | -------------------------------- | -------------- | ---------------------------- | ----------------------- | -------------- | -------------------------- |
| Sheet                       | 0, 1101, 1206, 1521              | 402 x 507      | full width, top 367          | #ffffff                 | about 32 (top) | OBSERVED, radius ESTIMATED |
| Grabber                     | 549, 1131, 108, 12               | 36 x 4         | centred, 10 below the top    | #6c6c6c                 | full           | OBSERVED                   |
| Title "Models"              | 520, 1208, 169, 39               | 56.3 x 13      | centred, 35.7 below the top  | #111111                 | none           | OBSERVED                   |
| Close glyph                 | 1096, 1213, 28, 29               | 9.3 x 9.7      | R 27.3                       | #545454                 | none           | OBSERVED                   |
| Search field                | 48, 1311, 1110, 144              | 370 x 48       | L 16, R 16                   | #ffffff, border #eaeaea | full           | OBSERVED                   |
| Filter chip "Instant"       | 48, 1491, 262, 108               | 87.3 x 36      | L 16, 12 below the field     | #ececec                 | full           | OBSERVED                   |
| Filter chip "Economy"       | 328, 1491, 306, 108              | 102 x 36       | 6 after the first            | #ececec                 | full           | OBSERVED                   |
| Filter chip "Images"        | 652, 1491, 267, 108              | 89 x 36        | 6 after the second           | #ececec                 | full           | OBSERVED                   |
| Filter chip "Files"         | 937, 1491, 214, 108              | 71.3 x 36      | 6 after the third            | #ececec                 | full           | OBSERVED                   |
| Auto card                   | 48, 1635, 1110, 231              | 370 x 77       | L 16, 12 below the chips     | #ececec                 | 16             | OBSERVED, radius ESTIMATED |
| Provider row (selected)     | 48, 1908, 1110, 156              | 370 x 52       | L 16, 14 below the Auto card | #dbdbdb                 | 16 (group top) | OBSERVED                   |
| Provider mark               | 108, 1953, 66, 66                | 22 x 22        | 20 inside the card           | #111111                 | none           | OBSERVED                   |
| Model name                  | 224, 1970, 244, 35               | 81.3 x 11.7    | L 74.7                       | #111111                 | none           | OBSERVED                   |
| Check mark                  | 957, 1972, 39, 28                | 13 x 9.3       | 54 from the card right       | #121212                 | none           | OBSERVED                   |
| Dropdown chevron            | 1070, 2134, 32, 18               | 10.7 x 6       | 18.7 inside the card right   | #646464                 | none           | OBSERVED                   |
| Opened row under a provider | 48, 2065, 1110, 156              | 370 x 52       | name at L 74.7, no mark      | #ececec                 | none           | OBSERVED                   |

#### Text

| Text                                 | Cap height in pixels | Size in points | Weight   | Colour    | Alignment            | Status    |
| ------------------------------------ | -------------------- | -------------- | -------- | --------- | -------------------- | --------- |
| "Models"                             | 37                   | 17             | semibold | #111111   | centred              | ESTIMATED |
| "Search models..."                   | 34                   | 16             | regular  | #6c6c6c   | left, x 55           | ESTIMATED |
| Chip labels                          | 31                   | 14 (code)      | semibold | #111111   | after the glyph      | ESTIMATED |
| "Auto"                               | 33                   | 15 (code)      | semibold | #111111   | left, x 74.3         | ESTIMATED |
| Auto description, two lines          | 32                   | 14 (code)      | regular  | #646464   | left, x 75           | ESTIMATED |
| Model name                           | 33                   | 15 (code)      | semibold | #111111   | left, x 74.7         | ESTIMATED |
| Effort word after a name, Instant on | not read             | 14 (code)      | regular  | muted ink | left, after the name | ESTIMATED |

#### Spacing and notes

- No model row has a description; Auto has the only one.
- With the Instant chip on (capture: picker-instant) the chip turns #111111 with a light label, the Auto card and the provider grouping go away, and each row shows its mark, its name and the lowest effort word.
- Rows opened under a provider keep the name's left edge and drop the mark, so the list reads as indented by the mark's column.
- Code: `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx`, `ModelRow.tsx`, `ModelFilterChips.tsx`, `ProviderMark.tsx`, `apps/mobile/src/features/model-picker/modelFilters.ts`.

### 4. Add menu (capture: plus)

A bottom sheet as tall as its content: three attachment tiles, an upload note, then two cards of single-line rows.

#### Layout, top to bottom

| Element                | Rectangle in pixels (x, y, w, h) | Size in points | Position                      | Fill or colour | Radius         | Status                     |
| ---------------------- | -------------------------------- | -------------- | ----------------------------- | -------------- | -------------- | -------------------------- |
| Sheet                  | 0, 789, 1206, 1833               | 402 x 611      | full width, top 263           | #ffffff        | about 32 (top) | OBSERVED, radius ESTIMATED |
| Grabber                | centred, 819, 108, 12            | 36 x 4         | 10 below the top              | #6c6c6c        | full           | OBSERVED                   |
| Title "Add to Chat"    | 469, 885, 266, 37                | 88.7 x 12.3    | centred, 32 below the top     | #111111        | none           | OBSERVED                   |
| Close glyph            | 1087, 886, 34, 34                | 11.3 x 11.3    | R 28.3                        | #6c6c6c        | none           | OBSERVED                   |
| Tile (three)           | 60, 993, 338, 222                | 112.7 x 74     | L 20, 12 apart                | #ececec        | about 16       | OBSERVED, radius ESTIMATED |
| Tile glyph             | 199, 1043, 60, 50                | 20 x 16.7      | centred in the tile           | #111111        | none           | OBSERVED                   |
| Upload note, two lines | 60, 1261, about 1086, 90         | about 362 x 30 | L 20, 15.3 below the tiles    | grey           | none           | OBSERVED                   |
| First card, four rows  | 60, 1401, 1086, 534              | 362 x 178      | L 20, R 20                    | #ececec        | about 16       | OBSERVED, radius ESTIMATED |
| Row                    | 60, 1401, 1086, 129              | 362 x 43       | one per line                  | #ececec        | none           | OBSERVED                   |
| Row with a switch      | 60, 1661, 1086, 144              | 362 x 48       | third row                     | #ececec        | none           | OBSERVED                   |
| Row glyph              | 110, 1441, 50, 50                | 16.7 x 16.7    | 16.7 inside the card          | #646464        | none           | OBSERVED                   |
| Switch                 | 909, 1685, 189, 84               | 63 x 28        | 16 inside the card right      | #0c755c on     | full           | OBSERVED                   |
| Second card, four rows | 60, 1983, 1086, 519              | 362 x 173      | 16 below the first, bottom 40 | #ececec        | about 16       | OBSERVED, radius ESTIMATED |

#### Text

| Text                                    | Cap height in pixels | Size in points | Weight   | Colour  | Alignment                 | Status    |
| --------------------------------------- | -------------------- | -------------- | -------- | ------- | ------------------------- | --------- |
| "Add to Chat"                           | 36                   | 17             | semibold | #111111 | centred                   | ESTIMATED |
| Tile labels                             | 32                   | 14             | medium   | #111111 | centred                   | ESTIMATED |
| Upload note                             | about 28             | 13             | regular  | grey    | left, 17 pt line pitch    | ESTIMATED |
| Row labels                              | 34                   | 15             | regular  | #111111 | left, x 64.7              | ESTIMATED |
| Row values ("Choose", "Normal", "1 on") | 32                   | 14             | regular  | grey    | right, before the chevron | ESTIMATED |

#### Spacing and notes

- Eight rows fit without scrolling on this screen, in two cards of four.
- Code: `apps/mobile/src/features/chat/components/AddToChatSheet.tsx`.

### 5. Side panel (capture: sidebar)

A drawer over the left three quarters of the screen: two round buttons, the Local and Cloud switch, ten navigation rows, a divider, four lower rows.

#### Layout, top to bottom

| Element             | Rectangle in pixels (x, y, w, h) | Size in points | Position                                          | Fill or colour                | Radius | Status   |
| ------------------- | -------------------------------- | -------------- | ------------------------------------------------- | ----------------------------- | ------ | -------- |
| Drawer              | 0, 0, 900, 2622                  | 300 x 874      | left edge, full height                            | #ffffff, right border #eaeaea | none   | OBSERVED |
| Round buttons (two) | 621, 222, 102, 102               | 34 x 34        | top 74, 10 apart, right edge 15 inside the drawer | outline #ebebeb               | full   | OBSERVED |
| Mode switch         | 42, 360, 816, 138                | 272 x 46       | L 14                                              | #ffffff, border #eaeaea       | full   | OBSERVED |
| Navigation row      | pitch 139 px                     | 46 pitch       | first glyph top 191.7                             | none                          | none   | OBSERVED |
| Row glyph           | 83, 575, 49, 49                  | 16.3 x 16.3    | L 27.7                                            | #535353                       | none   | OBSERVED |
| Row label           | 175, 584, 189, 33                | 63 x 11        | L 58.3                                            | #535353                       | none   | OBSERVED |
| "Cloud" tag         | 646, 1116, 173, 72               | 57.7 x 24      | right edge 27 inside the drawer                   | outline #eaeaea               | full   | OBSERVED |
| Divider             | 0, 1905, 900, 3                  | 300 x 1        | 635 from the top                                  | #eaeaea                       | none   | OBSERVED |
| Lower rows (four)   | pitch about 139 px               | 46 pitch       | below the divider                                 | none                          | none   | OBSERVED |

#### Text

| Text                           | Cap height in pixels | Size in points | Weight   | Colour           | Alignment           | Status    |
| ------------------------------ | -------------------- | -------------- | -------- | ---------------- | ------------------- | --------- |
| Row labels                     | 33                   | 15 (code)      | regular  | #535353          | left, x 58.3        | ESTIMATED |
| "Local", "Cloud" on the switch | 32                   | 14             | semibold | #111111, #535353 | centred in the half | ESTIMATED |
| "Cloud" tag                    | 32                   | 14 (code)      | semibold | #535353          | centred             | ESTIMATED |

#### Spacing and notes

- There are no section headings, no chat list and no footer in the drawer; chats open from the "Chats" row.
- Code: `apps/mobile/src/features/drawer/components/DrawerContent.tsx`.

### 6. Chat thread (capture: thread)

A header with the chat's title, user bubbles on the right, replies as plain text on the left with a report line and an action row, then the composer.

#### Layout, top to bottom

| Element                  | Rectangle in pixels (x, y, w, h) | Size in points   | Position                  | Fill or colour | Radius    | Status                     |
| ------------------------ | -------------------------------- | ---------------- | ------------------------- | -------------- | --------- | -------------------------- |
| Menu glyph               | 82, 239, 40, 36                  | 13.3 x 12        | L 27.3                    | #515151        | none      | OBSERVED                   |
| Title `<chat title>`     | 182, 238, 415, 46                | 138.3 x 15.3     | L 60.7                    | #111111        | none      | OBSERVED                   |
| New-chat glyph           | 937, 232, 48, 48                 | 16 x 16          | R 73.7                    | #515151        | none      | OBSERVED                   |
| More glyph               | 1084, 252, 40, 10                | 13.3 x 3.3       | R 27.3                    | #515151        | none      | OBSERVED                   |
| Header divider           | 0, 327, 1206, 3                  | 402 x 1          | 109 from the top          | #e3e3e3        | none      | OBSERVED                   |
| User bubble, three lines | 210, 803, 954, about 294         | 318 x about 98   | R 14                      | #ececec        | about 24  | OBSERVED, radius ESTIMATED |
| User bubble, one line    | 439, 1552, 722, about 150        | 240.7 x about 50 | R 15                      | #ececec        | full look | ESTIMATED                  |
| Reply text               | 44, 1202, 639, 45                | 213 x 15         | L 14.7                    | #111111        | none      | OBSERVED                   |
| Report line              | 47, 1287, 168, 39                | 56 x 13          | L 15.7                    | #a1a1a1        | none      | OBSERVED                   |
| Action glyphs            | 116, 1380, 44, 44                | 14.7 x 14.7      | first at L 38.7, 46 apart | #686868        | none      | OBSERVED                   |

#### Text

| Text         | Cap height in pixels | Size in points | Weight   | Colour  | Alignment                            | Status    |
| ------------ | -------------------- | -------------- | -------- | ------- | ------------------------------------ | --------- |
| Title        | 37                   | 17             | semibold | #111111 | left                                 | ESTIMATED |
| User message | 34                   | 16             | regular  | #111111 | left in the bubble, 26 pt line pitch | ESTIMATED |
| Reply        | 34                   | 16             | regular  | #111111 | left, 26 pt line pitch               | ESTIMATED |
| "Report"     | about 28             | 13             | regular  | #a1a1a1 | left                                 | ESTIMATED |

#### Spacing and notes

- The action row is always visible under a reply: copy, read aloud, retry, thumbs up, thumbs down, more.
- The composer in a thread is the same card as on the new-chat screen, with the placeholder "Reply to AGI".
- Code: `apps/mobile/src/features/chat/components/MessageBubble.tsx`, `MessageList.tsx`.

### 7. Settings (capture: settings)

A page with a centred title and a close glyph, the Local and Cloud switch, a profile card, then grouped cards of rows under grey headings.

#### Layout, top to bottom

| Element          | Rectangle in pixels (x, y, w, h) | Size in points       | Position                        | Fill or colour          | Radius | Status                     |
| ---------------- | -------------------------------- | -------------------- | ------------------------------- | ----------------------- | ------ | -------------------------- |
| Title "Settings" | 505, 322, 196, 49                | 65.3 x 16.3          | centred, top 107.3              | #111111                 | none   | OBSERVED                   |
| Close glyph      | 1080, 324, 36, 36                | 12 x 12              | R 30                            | #535353                 | none   | OBSERVED                   |
| Mode switch      | 42, 453, about 1122, 138         | about 374 x 46       | L 14                            | #ffffff, border #eaeaea | full   | OBSERVED                   |
| Profile card     | 48, 639, 1110, 558               | 370 x 186            | L 16, R 16                      | #ffffff                 | 24     | OBSERVED                   |
| Section heading  | 55, 1281, 165, 31                | 55 x 10.3            | L 18.3, 28 below the card above | #686868                 | none   | OBSERVED                   |
| Settings card    | 48, 1347, 1110, rows of 150      | 370 wide, 50 per row | L 16, R 16                      | #ffffff                 | 24     | OBSERVED, radius ESTIMATED |
| Row glyph        | 97, 1545, 43, 51                 | 14.3 x 17            | 15 inside the card              | #535353                 | none   | OBSERVED                   |
| Row label        | 184, 1555, 349, 33               | 116.3 x 11           | L 61.3                          | #111111                 | none   | OBSERVED                   |
| Value text       | 938, 1704, 88, 32                | 29.3 x 10.7          | ends 18.7 before the chevron    | #6c6c6c                 | none   | OBSERVED                   |
| Chevron          | 1082, 1556, 17, 29               | 5.7 x 9.7            | 19.7 inside the card right      | #6c6c6c                 | none   | OBSERVED                   |
| Separator        | 48, 1494, 1110, 3                | 370 x 1              | between rows                    | #eaeaea                 | none   | OBSERVED                   |

#### Text

| Text                                  | Cap height in pixels | Size in points | Weight   | Colour  | Alignment | Status    |
| ------------------------------------- | -------------------- | -------------- | -------- | ------- | --------- | --------- |
| "Settings"                            | 37                   | 17             | semibold | #111111 | centred   | ESTIMATED |
| Profile name `<user name>`            | not read             | 20 (code)      | bold     | #111111 | centred   | ESTIMATED |
| Profile email `<email>`               | not read             | 14 (code)      | regular  | grey    | centred   | ESTIMATED |
| Section heading ("Account", "Device") | 31                   | 14 (code)      | semibold | #686868 | left      | ESTIMATED |
| Row label                             | 33                   | 15 (code)      | regular  | #111111 | left      | ESTIMATED |
| Value text                            | 32                   | 14 (code)      | regular  | #6c6c6c | right     | ESTIMATED |

#### Spacing and notes

- Separators run the full width of the card; they are not inset past the row glyph.
- Code: `apps/mobile/src/features/settings/index.tsx`.

### 8. Chats list (capture: chats)

A page with the title "Chats" and the mode under it, a dated group label, one card for each chat, a search field pinned at the bottom and a floating "New chat" pill.

#### Layout, top to bottom

| Element                     | Rectangle in pixels (x, y, w, h) | Size in points     | Position             | Fill or colour          | Radius   | Status                     |
| --------------------------- | -------------------------------- | ------------------ | -------------------- | ----------------------- | -------- | -------------------------- |
| Menu glyph                  | 79, 244, 46, 40                  | 15.3 x 13.3        | L 26.3               | #515151                 | none     | OBSERVED                   |
| Title "Chats"               | 195, 215, 162, 45                | 54 x 15            | L 65                 | #111111                 | none     | OBSERVED                   |
| Subtitle "Cloud"            | 194, 286, 109, 32                | 36.3 x 10.7        | L 64.7               | #686868                 | none     | OBSERVED                   |
| Group label                 | 55, 395, 264, 32                 | 88 x 10.7          | L 18.3               | #686868                 | none     | OBSERVED                   |
| Chat card                   | 48, 459, 1110, 204               | 370 x 68           | L 16, R 16, 8 apart  | #ffffff, border #eaeaea | about 14 | OBSERVED, radius ESTIMATED |
| Card title `<chat title>`   | 97, 511, up to 857, 44           | up to 285.7 x 14.7 | 16.3 inside the card | #111111                 | none     | OBSERVED                   |
| Card date `<relative date>` | 95, 578, 180, 39                 | 60 x 13            | 15.7 inside the card | #6c6c6c                 | none     | OBSERVED                   |
| Search field                | 48, 2361, 1110, 126              | 370 x 42           | L 16, bottom 45      | #ffffff, border #eaeaea | full     | OBSERVED                   |

#### Text

| Text                  | Cap height in pixels | Size in points | Weight   | Colour  | Alignment      | Status    |
| --------------------- | -------------------- | -------------- | -------- | ------- | -------------- | --------- |
| "Chats"               | 43                   | 20             | bold     | #111111 | left           | ESTIMATED |
| "Cloud"               | 32                   | 14             | regular  | #686868 | left           | ESTIMATED |
| Group label, capitals | 32                   | 14             | semibold | #686868 | left           | ESTIMATED |
| Card title            | 34                   | 15             | semibold | #111111 | left, one line | ESTIMATED |
| Card date             | about 28             | 13             | regular  | #6c6c6c | left           | ESTIMATED |

#### Spacing and notes

- The floating "New chat" pill sits above the search field at the right; its size was not read in this pass (UNKNOWN).
- Each card ends in a three-dot glyph at the right.
