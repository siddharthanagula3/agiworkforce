# Desktop Code tab against Claude's desktop app

Status: Open
Owner: Desktop surface maintainers
Observed: 2026-11-13
Scope: The Code surface of the public (Electron) desktop app. The comparison itself, with its evidence labels and sources, is `docs/research/claude-desktop-code-tab-2026-11-13.md`; row numbers below are that table's.

Delete a line when it is built, checked or declined. Delete this file when none are left.

## Checks only the running app can settle

The simulator pane was added on 2026-11-13 with unit and component tests, plus a run of its main-process service inside a real Electron process. Its screen was not seen in the built desktop app, because the local web server was on hold that day.

- Browser pane, downloads: `apps/desktop/electron/browserPane.ts` sets no rule for a download a page starts. Confirm in the running app what happens, and decide whether the pane refuses them.
- Simulator pane (row 21): the service behind it was run against a live simulator on 2026-11-13 (frames, screenshot, recording, appearance, clean status bar, Home, shut down, start). Still to see in the built app: the pane screen itself, and the two clipboard moves between the Mac and the device, which were left alone so the owner's clipboard was not overwritten.
- Simulator pane, layout: the phone fits at a 300 pixel pane and in the floating card, in both themes.

## Observed in the installed apps on 2026-11-23

Claude Code opens on environment and folder choices. The installed AGI Code opens on a usage card even when there's no usage. Its selected folder had command permission denied. The error appeared in the sidebar and above the composer, while the control to allow commands was only in the sidebar. The development build now puts the command-access action above the composer beside the folder’s status. An Electron fixture confirmed that granting access keeps the draft and leaves the first run to a separate Start the task action. A saved refusal links to Capabilities, where the user can withdraw it. The development build now offers Choose a local folder on the Code home before a folder has been added. Code usage opens on demand in Electron without losing its Code-specific breakdown. The installed app still shows the dashboard by default.

The installed AGI new-session Add menu exposed connectors. The local development build also offers image attachments there and accepts pasted or dropped images. The Electron fixture opens the Add menu, previews a test PNG from the picker, removes it, drops it into the draft, and verifies that the first request to a loopback model contains the image with metadata removed.

The development build shows the current branch and exact HEAD baseline in local Changes. It filters paths and shows added and removed counts for complete text diffs. A large preview is marked before the file list, and missing or partial line totals stay hidden. The Electron fixture verified the filter, counts and discard flow on a real repository.

## Not built, waiting on the owner

These are items 50 to 53 in `audit/decisions/founder-decisions.md`.

- Row 19: bringing sign-ins over from Chrome, Edge or Firefox.
- Row 22: tap and type in the simulator. Rotate, the software keyboard switch and slow animations wait on the same answer.
- Rows 18 and 20: the agent reading and acting in the browser pane, and pointing at an element.

## Not built, ordinary engineering

| Rows       | What is missing                                                                                                                                                                                                                                                       | Size            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1, 2       | Sidebar toggle and forward in the session bar; a menu on the session title                                                                                                                                                                                            | Small           |
| 4, 5       | Panes side by side with drag and resize; the same controls on every pane                                                                                                                                                                                              | Medium          |
| 6 to 11    | A task panel: environment, context, connectors, outputs, changes with create PR, background tasks                                                                                                                                                                     | Medium each     |
| 16, 17     | Browser pane: tabs, a capture of the page for mark-up, a dev server finder, expand, a still picture while a menu covers the page. A working version of each is in commit `514b983566`, written for a pane that was withdrawn; it has to be fitted to the pane on main | Medium          |
| 13, 14, 15 | Change the comparison base, search within diff content, toggle the file list, and consolidate per-file actions into a menu.                                                                                                                                           | Small to medium |
| 23, 26     | An Add menu and microphone in an open local session. The new-session screen already has both controls.                                                                                                                                                                | Small each      |
| 29, 30, 31 | Tool work folded into one counted line; a pinned task list; tokens in the status line                                                                                                                                                                                 | Medium          |
| 32         | A next-step box with a recap and answer buttons                                                                                                                                                                                                                       | Medium          |
| 35 to 38   | Sidebar: Customize row, project menu, a state icon per session, a settings gear beside the account                                                                                                                                                                    | Small each      |
