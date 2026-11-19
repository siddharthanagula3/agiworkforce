# Mobile layout measurements: ChatGPT, Claude, Perplexity, Gemini and our app (observed 2026-11-12)

Status: Historical snapshot
Owner: Product (founder)
Last updated: 2026-11-13

Placement, style, position and text size of every screen in the founder's iPhone reference set, measured from the pixels, with our own app measured the same way so the two can be compared number by number. This is dated inventory, not authority: it records what the four apps looked like on one phone on one day, and it authorizes nothing by itself (AGENTS.md section 10).

## Files

| File                    | App              | Screenshots                             | Screens                                                                                                                     |
| ----------------------- | ---------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `chatgpt-part-1.md`     | ChatGPT          | IMG_1133 to IMG_1166                    | 15: chat home and composer, effort slider, Work tab, sidebar, projects, plugins, Health, Images, Sites                      |
| `chatgpt-part-2.md`     | ChatGPT          | IMG_1167 to IMG_1200                    | 17: Customize, Space, Scheduled, chat thread, voice call, search, account sheet, Personalization, Memory, Codex, drawer     |
| `chatgpt-part-3.md`     | ChatGPT          | IMG_1201 to IMG_1236                    | 24: paywall, purchase sheet, usage and credits, every settings page, report sheet, in-app browser, About                    |
| `claude-part-1.md`      | Claude           | IMG_1237 to IMG_1268                    | 13: home and composer, Add to Chat sheet, voice mode, model picker, Projects, Code, Cowork, Artifacts, project detail       |
| `claude-part-2.md`      | Claude           | IMG_1269 to IMG_1300                    | 16: project page, composer states, every settings page                                                                      |
| `perplexity.md`         | Perplexity       | IMG_1301 to IMG_1329                    | 20: signed-out home, sign-in, paywall, home, Models sheet, sidebar page, every settings page                                |
| `gemini.md`             | Gemini           | IMG_1330 to IMG_1365                    | 25: welcome, home, Live, transcript, plus sheet, model menu, Library, sidebar, Gems, every settings page                    |
| `agi.md`                | Our app          | simulator captures of 2026-11-12        | the same components on the build in this worktree                                                                           |
| `comparison.md`         | All five         | drawn from the files above              | one table per shared component, one column per app                                                                          |
| `screen-map.md`         | Four competitors | IMG_1133 to IMG_1365                    | a name for every picture and the tree of 151 screens, each under the screen it opens from                                   |
| `screens.jsonl`         | Four competitors | IMG_1133 to IMG_1365                    | the same index as data: one record per picture and per screen, with links both ways and the layout section that measures it |
| `feature-comparison.md` | All five         | drawn from the files above and the code | every feature and option the four apps show, one row each, with whether our app has it and the next step                    |
| `features.jsonl`        | All five         | drawn from the files above and the code | the same comparison as data: one record per feature, with labels, options, pictures and code lines                          |

Start with `comparison.md` for layout and `feature-comparison.md` for features. Open an app's own file when a number needs its screenshot, its exact pixel rectangle or the screen around it. To find a picture or a screen, start with `screen-map.md`; it names every picture and says which screen opens which, so no image has to be opened to locate one.

## Source set

- 229 screenshots, IMG_1133 to IMG_1365, taken by the founder on his own iPhone and kept outside the repository (folder `competitor_mobile_pics` on his Desktop). Numbers 1207, 1210, 1279 and 1317 do not exist in the set. Each file is named `IMG_<number>_<picture name>.PNG`, with the name from `screen-map.md`; the files in this folder cite a picture by `IMG_<number>` alone.
- Every portrait frame is 1284 x 2778 pixels at scale 3, so the screen is 428 x 926 points.
- IMG_1274 to IMG_1278 sit inside the Claude range but are ChatGPT project screens. They are measured in `claude-part-2.md` (screen 4) and labelled as ChatGPT there.
- IMG_1341, IMG_1343 and IMG_1356 (Gemini) are 2778 x 1284 frames caught while the phone was turning. Portrait positions cannot be read from them and are marked UNKNOWN.
- Our app was captured on the iPhone 17 Pro simulator: 1206 x 2622 pixels at scale 3, so 402 x 874 points. The screen is 26 points narrower and 52 points shorter than the reference phone. Fixed-size parts (buttons, icons, text, row heights, insets) compare directly; a width that stretches with the screen must be compared by its inset, not by its width.

## Method

All numbers come from `apps/mobile/scripts/measure-screenshot.mjs` (run it with no arguments for its usage). It reads the image with sharp and reports in pixels; divide by 3 for points.

```bash
pnpm --filter @agiworkforce/mobile measure:screenshot boxes <image> <x> <y> <w> <h> 24 0
```

| What is measured                                      | How                                                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Position and size of a control, icon or card          | `boxes` over the region: connected shapes that differ from the region's background, with their rectangle and main colour                                     |
| Edges of a card, bar or pill                          | `hline` or `vline`: colour runs along one row or column of the image                                                                                         |
| Height of a line of text, pitch between lines or rows | `rows` over the region                                                                                                                                       |
| Width of a glyph or a gap between controls            | `cols` over the region                                                                                                                                       |
| Colour of a fill                                      | `bg` (commonest colour on the region's border) or `pixel`                                                                                                    |
| Text size                                             | cap height in pixels / 3 / 0.705 (the capital height of the system font is 0.705 of its size); where a line has no capital, ascender to descender / 3 / 0.96 |
| Corner radius                                         | the point where the corner curve meets the straight edge, read from `hline` runs a few pixels inside the corner                                              |
| Text weight                                           | judged from stroke thickness against the same face at a known weight                                                                                         |

## Status words

| Word      | Meaning                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| OBSERVED  | read from pixels by the tool; good to one pixel (a third of a point)                                                                      |
| ESTIMATED | derived from an observed number: text size from cap height (plus or minus 1 point), radius by fit (plus or minus 2 points), weight by eye |
| UNKNOWN   | cannot be read from a screenshot: behaviour, timing, hidden states, anything the frame does not show                                      |

## How far to trust the numbers

The tool was checked against our own app, where the source code states the true value (simulator capture, default text size):

| Known value in our code      | Read by the tool | Raw result    | Difference         |
| ---------------------------- | ---------------- | ------------- | ------------------ |
| Voice and send circle, 36 pt | 108 px           | 36.0 pt       | none               |
| Effort slider handle, 48 pt  | 144 px           | 48.0 pt       | none               |
| Effort slider dot, 12 pt     | 34 to 36 px      | 11.3 to 12 pt | up to 0.7 pt under |
| Greeting, 28 pt              | capital 60 px    | 28.4 pt       | 0.4 pt over        |
| Effort level name, 20 pt     | capital 43 px    | 20.3 pt       | 0.3 pt over        |
| Sheet title, 17 pt           | capital 37 px    | 17.5 pt       | 0.5 pt over        |
| Composer text, 16 pt         | capital 34 px    | 16.1 pt       | 0.1 pt over        |
| Row label, 15 pt             | capital 33 px    | 15.6 pt       | 0.6 pt over        |
| Filter chip label, 14 pt     | capital 31 px    | 14.7 pt       | 0.7 pt over        |
| Settings value, 14 pt        | capital 32 px    | 15.1 pt       | 1.1 pt over        |

So sizes of controls are exact, and a text size read from cap height comes out up to one point high, about half a point on average, because the soft pixel row above and below each letter is counted. The four competitor files record the raw result; read a text size there as "that, or up to one point less". `agi.md` gives the code's value where the code was checked.

Two people measured the ChatGPT composer and effort slider separately (IMG_1133 to IMG_1138) and got the same numbers to within one pixel.

Limits that apply to every file:

- **Text in the reference set is probably drawn larger than the apps' own default.** Body text in ChatGPT, Claude, Gemini and in the system's own Health sheet reads 19 to 20 points (about 19 after the correction above) where the iPhone default is 17, and ChatGPT's effort level name reads 24.5 (about 24) where the default for that style is 22. A steady two point step is what the phone's Text Size setting does one notch above the middle (Settings, Display and Brightness, Text Size). A screenshot cannot prove that setting: the status bar clock does not follow it, and reads 18 points on the reference phone and on our default simulator alike. Until the founder confirms the setting, read every text size in the four competitor files as "possibly 2 points above that app's default", and do not change a text size in our app to match one. Sizes of buttons, icons, cards, insets and circles do not follow that setting and are unaffected.
- Translucent fills (glass buttons, blurred headers, sheets over a dimmed page) take their colour from what is behind them. The recorded hex is the colour on that screenshot, not a design token.
- A frame caught during an animation shows positions in between. The files say so where it was noticed.
- Light and dark: ChatGPT, Perplexity and Gemini were captured in the dark theme, Claude and our app in the light theme. Colours are not comparable across themes; sizes and positions are.
- Nothing here says how a control behaves, only where it is and how big it is. Behaviour is in `audit/ledger/ecosystem-capability-ledger.jsonl` and the screenshots themselves.

## Privacy

The screenshots show the founder's own accounts. The files replace every piece of personal content with a placeholder in angle brackets (`<user name>`, `<email>`, `<chat title>`, `<project name>`, `<message text>` and so on). Labels the apps wrote themselves are quoted because they identify the control being measured. Keep it that way when adding to these files.

## Related

- Web measurements of the same leaders: `docs/research/leader-ui-measurements-2026-09-04.md`.
- Decisions taken from this set: `docs/decisions/2026-11-12-founder-decisions.md`.
- Our design rules: `.agents/skills/agiworkforce-design/SKILL.md`.
