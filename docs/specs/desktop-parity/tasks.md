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

## Larger slices

Each needs its own design review before code.

- [ ] L1 Side chat.
- [ ] L2 Built-in browser pane.
- [ ] L3 Interactive terminal (PTY).
- [ ] L4 Split view or tabs.
