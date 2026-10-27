# Desktop parity with Claude and ChatGPT

Status: In progress
Owner: Desktop surface maintainers
Last updated: 2026-10-27

## What and why

Bring the public Electron Desktop level with what both the Claude and the
ChatGPT macOS desktop apps offer, where it is missing or broken here, and fix
the defects the comparison exposed in the shell itself.

Evidence is the reverse-engineering workspace kept outside this repository
(`references/desktop-client-rea-20261026` and
`docs/model-agnostic-chat/desktop-product-parity.md`), labelled as
`docs/product/competitive-guidance.md` §3.2 requires:

- **Observed 2026-10-26** on Claude 3.6556.2 and ChatGPT 26.1021.31345
  (build 21828): native menus read through macOS Accessibility, settings pages
  captured as screenshots. No message content, private API, session store or
  source code was used, and none may be copied here.
- A feature counts as common only when both apps show it. A control only one
  app has is out of scope unless this product already intends it.

## Requirements

Common to both apps and missing or broken here:

1. The macOS Window menu carries the system window list, Move & Resize, Full
   Screen Tile and Bring All to Front.
2. Find is reachable from the menu bar and opens the conversation's own find.
3. The menu bar moves to the previous and next chat in the order the sidebar
   shows them.
4. A temporary chat can be started from the menu bar.
5. Open Folder… grants a folder and opens it as a local coding session.
6. Help offers the help centre and a Troubleshooting menu: logs, diagnostics,
   clear cache and restart.
7. Settings shows how much space the app uses on this computer and can clear
   what is safe to clear.
8. Side chat, a built-in browser pane, an interactive terminal and split view
   or tabs (each its own slice; see `plan.md`).

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
