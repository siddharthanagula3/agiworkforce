# Tasks

Status: `todo`, `doing`, `done` (with the commit that landed it).

## Shell defects

- [x] D1 Tray shortcut changes share the settings page's rollback (`4886b52206`).
- [x] D2 Launch at login mirrors the OS login item instead of re-adding it (`4886b52206`).
- [x] D3 New Chat and Settings act on the window in front (`4886b52206`).

## Common controls

- [x] C1 Window menu carries the macOS window role (`ab677d80f1`).
- [x] C2 Edit > Find… opens the conversation's find.
- [x] C3 Go menu: Previous Chat, Next Chat, Search….
- [x] C4 File > New Temporary Chat. Web must deploy before the shell release that sends these commands.
- [x] C5 File > Open Folder… grants a folder and opens the Code page that lists it.
- [x] C6 Help: help centre and a Troubleshooting submenu (logs, diagnostics,
      clear cache and restart) (`ab677d80f1`).
- [ ] C7 Settings > Storage: space used on this computer, clear cache.
- [ ] C8 Close Window moves from the Window menu to File, where both apps put Close.

## Larger slices

Each needs its own design review before code.

- [ ] L1 Side chat.
- [ ] L2 Built-in browser pane.
- [ ] L3 Interactive terminal (PTY).
- [x] L4 Split view or tabs: dropped. Only Claude shows two conversations in one window;
      ChatGPT's tabs are its browser and terminal beside the chat (see `spec.md`).

## Reported, not yet verified

From the 2026-10-27 inventory of the Electron shell. Each needs reading in code
before it becomes a task or a `known-flaws.md` row.

- Only the primary window's frame and route are restored after a relaunch.
- No crash reporter; Open Logs shows only the telemetry counters file.
- Local commands run through `child_process.spawn`, not a PTY (see L3).
- The Dock badge counts local approvals only.
- No `open-file` handler or file associations, so dropping a file on the
  Dock icon does nothing.
- The updater does not re-check the version it downloaded.
- No menu-bar-only mode (hide the Dock icon).
- Screenshot capture always targets the main window, never Quick Ask, and
  cannot select an area.
