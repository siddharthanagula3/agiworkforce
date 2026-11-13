# Desktop Code tab against Claude's desktop app

Status: Open
Owner: Desktop surface maintainers
Observed: 2026-11-13
Scope: The Code surface of the public (Electron) desktop app. The comparison itself, with its evidence labels and sources, is `docs/research/claude-desktop-code-tab-2026-11-13.md`; row numbers below are that table's.

Delete a line when it is built, checked or declined. Delete this file when none are left.

## Checks only the running app can settle

Added on 2026-11-13 with unit and component tests, plus a run of each main-process service inside a real Electron process. Neither pane's screen was seen in the built desktop app, because the local web server was on hold that day.

- Browser pane (rows 16, 17): open a page, switch tabs, go back and forward, reload, find a running dev server, mark up a capture and send it. Confirm the page sits exactly over its place at 100 percent and at another zoom level, and that it hides while a menu or a dialog is over it.
- Browser pane, isolation: the service was run in a real Electron process on 2026-11-13 against a page served on this computer. It refused a download, location and notification requests, a `file:` address and a pop-up to a mail address, kept the page's cookie out of the app's own session, and gave the page no bridge and no Node. Still to see in the built app: that each refusal shows its message in the pane.
- Browser pane, capture: in that process, taking a picture of the page failed in two of four runs with Electron's "Current display surface not available for capture" and worked in the other two, once as the first capture of the process after 17 milliseconds. The cause was not found; the display was awake, and the test window may have been covered or on another desktop. The service answers with a refusal that says to try again. Confirm in the built app that Mark up produces a picture and that a still frame stands in while a menu covers the page.
- Simulator pane (row 21): the service behind it was run against a live simulator on 2026-11-13 (frames, screenshot, recording, appearance, clean status bar, Home, shut down, start). Still to see in the built app: the pane screen itself, and the two clipboard moves between the Mac and the device, which were left alone so the owner's clipboard was not overwritten.
- Simulator pane, layout: the phone fits at a 300 pixel pane and in the floating card, in both themes.

## Not built, waiting on the owner

These are items 50 to 54 in `audit/decisions/founder-decisions.md`.

- Row 19: bringing sign-ins over from Chrome, Edge or Firefox.
- Row 22: tap and type in the simulator. Rotate, the software keyboard switch and slow animations wait on the same answer.
- Rows 18 and 20: the agent reading and acting in the browser pane, and pointing at an element.
- A browser window of its own and a browsing profile that persists.

## Not built, ordinary engineering

| Rows       | What is missing                                                                                              | Size            |
| ---------- | ------------------------------------------------------------------------------------------------------------ | --------------- |
| 1, 2       | Sidebar toggle and forward in the session bar; a menu on the session title                                   | Small           |
| 4, 5       | Panes side by side with drag and resize; the same controls on every pane                                     | Medium          |
| 6 to 11    | A task panel: environment, context, connectors, outputs, changes with create PR, background tasks            | Medium each     |
| 13, 14, 15 | Diff header with base and branch for sessions on this computer; large-diff tag, search; line counts per file | Small to medium |
| 23, 24, 26 | Composer plus button, a hint that names the queue key, microphone in the composer for sessions on this Mac   | Small each      |
| 28         | Drag and drop for pictures                                                                                   | Small           |
| 29, 30, 31 | Tool work folded into one counted line; a pinned task list; tokens in the status line                        | Medium          |
| 32         | A next-step box with a recap and answer buttons                                                              | Medium          |
| 35 to 38   | Sidebar: Customize row, project menu, a state icon per session, a settings gear beside the account           | Small each      |
