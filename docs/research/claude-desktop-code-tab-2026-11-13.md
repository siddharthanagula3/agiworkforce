# Claude desktop Code tab against the AGI desktop app

Status: Current research snapshot
Owner: Product research
Verified: 2026-11-13
Coverage: the Code tab of Claude's desktop app on macOS, compared with the Code surface of the public (Electron) AGI desktop app

This is the dated, element-by-element comparison the owner asked for on 2026-11-13. It extends
the Claude desktop entry in `competitor-surfaces-2026-10-24.md` and does not replace it. Product
decisions still follow `docs/product/competitive-guidance.md`: look at the product again before
acting on a single row, because the reference changes weekly. Open rows from this table are
tracked in `audit/flows/desktop-code-tab-parity-2026-11-13.md`; the calls that are the owner's
are in `audit/decisions/founder-decisions.md`.

## Evidence labels

- **Seen:** visible in the four owner pictures of 2026-11-13 that were attached to the working
  session (diff pane, terminal pane, task panel, sidebar).
- **Relayed:** described to the working session from further owner pictures of the same day
  that were not attached to it (browser pane, simulator pane, capture mark-up, cookie import).
  Treat a relayed row as observed by the owner, not re-checked here.
- **Documented:** stated on the vendor's own desktop documentation page, as recorded in
  `competitor-surfaces-2026-10-24.md`.
- **Inferred** and **unknown** are used where neither applies.

No text from the pictures is reproduced here: no names, addresses, folder names or session
titles.

## The table

"Ours" is the state of the working tree on 2026-11-13 after the browser pane and the simulator
pane were added. Paths under `code/` are `apps/web/features/code/components/`; the Electron
window shows the hosted web app, so that is where the desktop Code surface lives.

| #   | Element                                                                                             | Claude              | Ours                                                                                                                                                                                                                                                                                               | What building takes                                     |
| --- | --------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Sidebar toggle, back and forward in the session bar                                                 | Seen                | Part: a back arrow that closes the session; no forward, no sidebar toggle (`code/LocalSessionPanel.tsx`, header)                                                                                                                                                                                   | Small                                                   |
| 2   | Session title with a menu                                                                           | Seen                | Part: plain title; summarise, archive and delete are separate icons in the header                                                                                                                                                                                                                  | Small                                                   |
| 3   | One button per pane: tasks, terminal, diff, browser, simulator, files, more                         | Seen                | Part: files, changes, review, terminal, browser and simulator have buttons; no tasks button and no overflow                                                                                                                                                                                        | Tasks panel is rows 6 to 11                             |
| 4   | Panes side by side, draggable and resizable                                                         | Seen, documented    | Lacks: one docked right pane at a time with a fixed width; the simulator can also float over the chat                                                                                                                                                                                              | Medium: a shared pane layout owner                      |
| 5   | Pane controls: more, pop out, expand, close                                                         | Seen                | Part: browser has expand and close; simulator has float, expand and close; the older panes have close only; separate windows exist for two chat panels only (`apps/web/features/desktop-host/lib/panel-windows.ts`)                                                                                | Small per pane                                          |
| 6   | Task panel, Environment: computer, folder, branch and worktree tag, added folder, remote switch     | Seen                | Lacks as a panel: folder and branch are a chip in the header; Remote Control lives in Settings                                                                                                                                                                                                     | Medium                                                  |
| 7   | Task panel, Context percent with a meter                                                            | Seen                | Part: a ring beside the composer                                                                                                                                                                                                                                                                   | Small                                                   |
| 8   | Task panel, Connectors count                                                                        | Seen                | Lacks in Code                                                                                                                                                                                                                                                                                      | Small                                                   |
| 9   | Task panel, Outputs: files the session made                                                         | Seen                | Lacks                                                                                                                                                                                                                                                                                              | Medium                                                  |
| 10  | Task panel, Changes totals with Create PR                                                           | Seen                | Part: totals in the review pane (`code/LocalReviewPane.tsx`); with no pull request open the action is a link to the host (`code/LocalPullRequest.tsx`)                                                                                                                                             | Medium                                                  |
| 11  | Task panel, Background tasks with time, stop and a finished count                                   | Seen                | Part: running commands with minutes and stop, inside Changes (`code/LocalRunningCommands.tsx`); sub-agents are listed apart with no stop                                                                                                                                                           | Medium                                                  |
| 12  | Terminal with tabs, starting in the project folder                                                  | Seen                | Has, as a bottom dock (`code/LocalTerminal.tsx`)                                                                                                                                                                                                                                                   | Placement only                                          |
| 13  | Diff header naming base and branch, with a menu                                                     | Seen                | Part: cloud sessions only (`code/CodeChangesPanel.tsx`)                                                                                                                                                                                                                                            | Medium                                                  |
| 14  | Diff: large-diff tag, search, list toggle                                                           | Seen                | Part: a notice when the diff is cut off                                                                                                                                                                                                                                                            | Small to medium                                         |
| 15  | Diff rows with line counts, open arrow, menu, new files marked                                      | Seen                | Part: chevron, status word, path, edit and discard (`code/LocalChangesPanel.tsx`); no counts per file                                                                                                                                                                                              | Small                                                   |
| 16  | Browser pane: tabs, address bar, back, forward, reload, empty state, find the dev server            | Relayed, documented | Has since 2026-11-13 (`code/LocalBrowserPane.tsx`, `apps/desktop/electron/browserPane.ts`); it replaced the separate preview window, which is deleted. Not yet seen running in the built app                                                                                                       | Live check in the built app                             |
| 17  | Mark up what the pane shows and add it to the chat                                                  | Relayed             | Has since 2026-11-13 for the browser and the simulator (`code/LocalCaptureAnnotator.tsx`): pen, rectangle, ellipse, arrow, text, six colours, three weights, undo. The picture goes through the composer's own picture attachment                                                                  | Live check in the built app                             |
| 18  | The agent reads, clicks and types in that browser                                                   | Relayed, documented | Lacks: the agent's browser work drives the user's own Chrome through the paired extension (`runBrowserCommand` in `apps/desktop/electron/runtime/dispatcher.ts`); nothing lets it act in the pane                                                                                                  | Owner decision: a second executor for the same commands |
| 19  | Bring sign-ins over from Chrome, Edge or Firefox                                                    | Relayed             | Lacks, on purpose: not built                                                                                                                                                                                                                                                                       | Owner decision; see below                               |
| 20  | Point at an element on the page to tell the agent about it                                          | Relayed             | Lacks                                                                                                                                                                                                                                                                                              | Medium, after row 18                                    |
| 21  | Simulator pane: device picker, live screen, Home, screenshot, record, mark up, menus, zoom, pop out | Relayed             | Has since 2026-11-13 on macOS (`code/LocalSimulatorPane.tsx`, `apps/desktop/electron/runtime/simulatorService.ts`), floating over the chat rather than in a window of its own. Rotate is left out. The service was run against a live simulator; the pane screen was not yet seen in the built app | Live check against a running simulator                  |
| 22  | Tap and type in the simulator from the pane                                                         | Relayed             | Lacks: Xcode's command-line tool has no command for either                                                                                                                                                                                                                                         | Owner decision; see below                               |
| 23  | Composer plus button                                                                                | Seen                | Part: a file picker and paste                                                                                                                                                                                                                                                                      | Small                                                   |
| 24  | Return sends, a modified Return queues, and the hint says so                                        | Seen                | Part: queue and steer exist; the hint names no key                                                                                                                                                                                                                                                 | Small                                                   |
| 25  | Stop in the send slot                                                                               | Seen                | Has                                                                                                                                                                                                                                                                                                | None                                                    |
| 26  | Microphone in the Code composer                                                                     | Seen                | Part: cloud composer only (`code/CodeComposer.tsx`)                                                                                                                                                                                                                                                | Small                                                   |
| 27  | Model with effort, permission mode, usage ring                                                      | Seen                | Has                                                                                                                                                                                                                                                                                                | None                                                    |
| 28  | Picture thumbnails before sending                                                                   | Seen                | Has by paste and from the two panes; no drag and drop                                                                                                                                                                                                                                              | Small                                                   |
| 29  | Work folded into one line that counts the commands run                                              | Relayed             | Lacks for sessions on this computer: one card per tool (`code/CodeTranscript.tsx`)                                                                                                                                                                                                                 | Medium                                                  |
| 30  | Task list pinned under the latest message                                                           | Seen                | Lacks                                                                                                                                                                                                                                                                                              | Medium                                                  |
| 31  | Status line: time, tokens, current phase                                                            | Seen                | Part: time and a phase; no tokens                                                                                                                                                                                                                                                                  | Small to medium                                         |
| 32  | Next-step box: recap, one question, answer buttons                                                  | Relayed             | Part: question cards (`code/LocalQuestionCard.tsx`)                                                                                                                                                                                                                                                | Medium                                                  |
| 33  | Send now on a queued message                                                                        | Seen                | Has (`code/LocalQueuedMessages.tsx`)                                                                                                                                                                                                                                                               | None                                                    |
| 34  | Sidebar: chat or code switch, New, Search, Artifacts, More                                          | Seen                | Has (`code/CodeRail.tsx`)                                                                                                                                                                                                                                                                          | None                                                    |
| 35  | Sidebar: Customize row                                                                              | Seen                | Part: inside More                                                                                                                                                                                                                                                                                  | Small                                                   |
| 36  | Sidebar: project heading with a menu                                                                | Seen                | Part: a plain folder heading (`code/LocalSessionsSection.tsx`)                                                                                                                                                                                                                                     | Small                                                   |
| 37  | Sidebar: state icon per session                                                                     | Seen                | Part: a running dot, an attention dot or one terminal icon                                                                                                                                                                                                                                         | Small                                                   |
| 38  | Sidebar: account, plan, settings gear                                                               | Seen                | Part: name and plan; settings sits inside the account menu                                                                                                                                                                                                                                         | Small                                                   |

## What was decided while building, and why

**How the page is drawn.** Electron's own documentation for the installed major (read through
Context7 on 2026-11-13) recommends `WebContentsView`, advises against the `<webview>` tag and
marks `BrowserView` deprecated. Each tab is one `WebContentsView` owned by the main process.
The view is drawn above the whole window, so the pane hides it, leaving a still picture, for as
long as a menu or a dialog needs that part of the window.

**What a page can reach.** A page is untrusted. It gets a session of its own that is never
written to disk, no preload, no Node, a sandbox, and a refusal for every permission, device and
download request and for client certificates. Only `http` and `https` addresses open, through
the same rule the existing "open in a browser" path uses (`browserAddress` in
`apps/desktop/electron/windowPolicy.ts`). The pane's commands need no permission of their own
because a page there holds no account, file or grant of the user's.

**What the agent can do in the pane.** Nothing. The existing agent browser capability drives the
user's own Chrome through the paired extension, and no second automation path was added. The
one bridge is the one the preview window already had: errors a page served on this computer
logs can be sent to the agent by the user.

**What the simulator pane uses.** Only `xcrun simctl`, which ships with Xcode. Measured on this
Mac on 2026-11-13: `list devices --json`, `io screenshot` to a file (about 0.4 seconds a frame;
writing to standard output does not work in this Xcode, whatever its help says), `io
recordVideo`, `ui appearance`, `status_bar`, `pbcopy`, `pbpaste`, `boot`, `shutdown`, `launch`
and `terminate`. It has no command for a tap, typing, the Home button, rotation, the software
keyboard or slow animations.

**Home.** `simctl` cannot bring the home screen forward by name on iOS 16 and later. The
approach used is the one the Detox test framework's source uses for that case (read 2026-11-13):
open the system Settings app and close it again. Run against the owner's simulator on
2026-11-13: with another app in front, the home screen came forward, that app stayed running
behind it and Settings was closed.

**What was run on 2026-11-13.** Outside the test suites, two throwaway scripts drove the two
main-process services inside a real Electron process on the owner's Mac. Simulator, against the
one running device: device list, live frames (about 0.45 seconds each), screenshot, a short
recording, appearance to dark and back, the clean status bar and back, Home, shut down and start,
and text through the device pasteboard. The owner's own clipboard was deliberately left alone,
so the two clipboard moves between the Mac and the device are covered by unit tests only.
Browser pane, against a throwaway page server: results are in the open-work tracker named at
the top of this file. Neither pane's screen has been seen in the built desktop app.

**Left out, because nothing public does them:** Rotate, the software keyboard switch, slow
animations, and the Edit menu's undo, cut, copy, paste and select all. The Edit menu holds the
two clipboard moves that do exist.

## Decisions that are the owner's

1. **Sign-ins from other browsers (row 19).** Reading Chrome, Edge or Firefox cookies means
   reading another app's saved sign-ins. It would need: access to the macOS Keychain entry that
   encrypts them, which shows a system prompt naming the other browser; a choice per site, not
   everything; a pane session that is kept on disk, which the pane does not have today; clear
   and retention commands; and privacy wording drafted by the legal-text owner named in
   `CLAUDE.md` and reviewed by a lawyer. Not built.
2. **Tap and type in the simulator (row 22).** Four ways, none free:
   - Leave input to the Simulator app's own window. Costs nothing; the pane stays a viewer.
   - A small UI-test helper built with `xcodebuild` that drives the device through Apple's
     public testing API. Public, supports tap, swipe, typing, Home and rotation; needs a build
     step, a helper app on each simulator, and a second or so of latency per action. That the
     API is public was not confirmed from Apple's page in this session (the page did not render
     for the reader); treat it as unknown until read.
   - The private Xcode frameworks, directly or through `idb`. Its README says it "leverages
     many of Private Frameworks that are used by Xcode" (read 2026-11-13). Fast and complete,
     but it can break with any Xcode update and adds a dependency.
   - The existing computer-use pointer and keyboard on the Simulator app's window. Public, but
     it takes the user's real pointer, needs Accessibility permission and a visible window.
3. **The agent in the pane (rows 18 and 20).** Building it means a second executor for the
   browser commands the extension already implements, with its own approval gate.
4. **A browser window of its own, and a profile that persists.** The pane expands and closes;
   it does not pop out, and it forgets everything at quit.
5. **Which of the remaining rows to build, and in what order.**

## Sources

- Owner pictures of the reference app, 2026-11-13 (four attached to the working session; the
  rest relayed).
- `docs/research/competitor-surfaces-2026-10-24.md`, the Claude desktop and Code tab entries,
  with the vendor page they cite.
- Electron documentation for the installed major, read through Context7, 2026-11-13.
- `xcrun simctl help` and timed runs on the owner's Mac, 2026-11-13.
- Detox source, `AppleSimUtils.js`, `sendToHome`, read 2026-11-13.
- `idb` README, read 2026-11-13.
