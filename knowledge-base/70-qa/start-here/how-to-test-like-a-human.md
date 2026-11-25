---
id: "DOC-70-qa-start-here-how-to-test-like-a-human"
type: "qa-method"
title: "How to test like a human"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# How to test like a human

For the session that controls the apps.

## What to drive each app with

| App     | Drive it with                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Web     | A real browser: click, type, upload, scroll, reload, resize to phone width                                                                |
| Desktop | The real app window, with screen control: menus, shortcuts, sign-in hand-off to the browser, drag and drop                                |
| Mobile  | The iOS simulator and the Android emulator: tap, swipe, type, rotate, send to background and reopen. A real phone for the on-device model |
| CLI     | A real terminal: type commands and read the screen                                                                                        |
| VS Code | The real editor with the extension installed: open the panel, select code, accept a diff                                                  |
| Chrome  | Real Chrome with the extension loaded: the side panel on real pages                                                                       |

## The bar for "pass"

1. It finishes, with the right and complete result.
2. First words appear within a few seconds and the answer streams smoothly.
3. Nothing looks broken on the way: no error text, stuck spinner or dead button.
4. It is still there after a reload or restart, and on the other apps where it should sync.
5. Done side by side with the same task in Claude or ChatGPT, it is not visibly worse.
6. It looks right in light and dark, at desktop and phone sizes.
7. If the plan does not include it, the person sees a clear Upgrade or waitlist message, never an error.

## Order of work

0. **Localhost only, one app at a time.** Start the local web server first (`setup/web.md`), point the app under test at it, and test that one app. Do not open a second app for testing until the first run is finished or stopped.
1. **Basics first.** Each app has a short script of its basic capabilities in `results/basics/scripts/`. An app's basics must all pass before its full plan matters.
2. **Then the full plan**, one area at a time, from `test-plans/<app>/`. Start with the areas a person meets first: sign-in, chat, files, then the rest.
3. **One item at a time.** Finish and record an item before starting the next.

## Doing one item

1. Open the item in `test-plans/<app>/<area>.md`. Read **Expected**.
2. Find the feature in the app. If **Where to find it** is not written yet, find it the way a new user would and write down the path you took.
3. Do it. Take a screenshot at each step and look at it.
4. Try the things people do that apply: stop halfway, reload, go offline and back, wrong button.
5. Check light and dark, and the phone width where the app has one.
6. Record the result.

## Recording a result

Open `results/<app>/results.csv`, find the row with the same ID, and fill in:

| Column          | What to write                                                                              |
| --------------- | ------------------------------------------------------------------------------------------ |
| `result`        | `pass`, `partial`, `fail`, `blocked`, or `not built`                                       |
| `tested_on`     | The date                                                                                   |
| `build_tested`  | Which build: the commit or version shown, and where it ran                                 |
| `what_was_seen` | Plain words. For anything but pass: the exact text on screen and the steps to see it again |
| `evidence_path` | The folder under `evidence/` with the screenshots or recording                             |

- `pass`: every point of the bar that applies was seen.
- `partial`: the task completes but something visible is wrong. Say what.
- `fail`: the task does not work.
- `blocked`: it could not be tried. Say exactly what was missing (a provider key on this machine, a microphone, an outside account).
- `not built`: the feature is not in the app at all, although the plan lists it.

Do not change the other columns. The scripts in `tools/` keep what you filled in when the plans are rebuilt.

## Evidence

Save screenshots and recordings in `evidence/<app>/<date>-<item ID>/`, with step names such as `01-start.png`, `02-result.png`. Use made-up data only.

## When something is broken

Add one line to `defects/found-by-testing.csv`: the item ID, the app, what was seen, the steps, the screenshot. The code session reads that file, fixes the cause in the code, and marks the item for a re-check. The tester does not edit the project.

## Closing the loop

Results recorded here are copied by the code session into the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`), which is the project's own record. The item IDs in the plans (for example `S13.10`) are that ledger's IDs, so every result lands on the right line.
