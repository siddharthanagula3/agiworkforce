# Desktop parity with Claude and ChatGPT

Status: In progress
Owner: Desktop surface maintainers
Last updated: 2026-10-27

## What and why

Bring the public Electron Desktop level with what both the Claude and the
ChatGPT macOS desktop apps offer, where it is missing or broken here, and fix
the defects the comparison exposed in the shell itself.

Evidence is recorded in `docs/research/competitor-surfaces-2026-10-24.md`: the
vendor-page entries for both desktop apps, and the entry "Claude and ChatGPT for
Mac: menus and settings as installed", observed on 2026-10-26 and labelled as
`docs/product/competitive-guidance.md` §3.2 requires. No message content,
private API, session store or source code was used, and none may be copied here.

A feature counts as common only when both apps show it. Where the two differ,
the clearer version is taken, as `.agents/skills/agiworkforce-design` directs; a
control only one app has is otherwise out of scope unless this product already
intends it.

## Requirements

Common to both apps and missing or broken here:

1. The macOS Window menu carries the system window list, Move & Resize, Full
   Screen Tile and Bring All to Front.
2. Find is reachable from the menu bar and opens the conversation's own find.
3. The menu bar moves to the previous and next chat in the order the sidebar
   shows them (Claude's Previous and Next Chat, ChatGPT's Previous and Next
   Sidebar Item).
4. Open Folder… grants a folder and opens it as a local coding session.
5. Help offers the help centre and a Troubleshooting menu: logs, diagnostics,
   clear cache and restart.
6. Close sits in the File menu (Claude's Close Window and Close All, ChatGPT's
   Close); here it sits in Window.
7. Settings shows how much space the app uses on this computer and can clear
   what is safe to clear.
8. Side chat, a built-in browser pane and an interactive terminal, each its own
   slice (see `plan.md`).

Only one app's menus carry these, and both products have the feature behind
them, so the menu items follow the clearer-version rule: Search… (Claude's Go
menu) and New Temporary Chat (ChatGPT's File menu).

Two conversations side by side in one window is Claude's alone (Split View).
ChatGPT's tabs hold its browser and terminal beside the chat, which the browser
and terminal slices cover, so a second conversation pane is out of scope.

Defects in the shell found while comparing, each verified in code:

- D1. Changing a shortcut from the tray skips the rollback the settings page
  performs, so Stop Agents can be left with no working shortcut.
- D2. Launch at login is re-added on every launch after the user removed it in
  System Settings, contrary to its own documented rule; the OS state is never
  read.
- D3. New Chat and Settings always act on the primary window instead of the
  window in front.

## Acceptance

Each item has a test that fails without the change, the shell and web
typechecks and the affected suites pass, and the item is checked by hand in a
packaged build before it is called done. A menu item never ships without the
page side that honours it (`HOST_COMMANDS` is the only crossing).

## Non-goals

- Claude's Cowork VM, ChatGPT's Codex merge, double-tap modifiers and other
  controls only one app has.
- Copying either vendor's code, assets, copy or private endpoints.
- Turning on connectors or restoring the "can make mistakes" line: both are
  deliberate product states here (`packages/contracts/types/src/connector-release.ts`,
  `apps/web/lib/compliance/ai-act.ts`) and need an owner decision.
