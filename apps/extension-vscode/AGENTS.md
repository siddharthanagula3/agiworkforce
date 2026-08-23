# VS Code Extension Agent Rules

Status: Current
Owner: Extension lead
Last updated: 2026-08-21

Read root `AGENTS.md`, then this file.

`README.md` in this package is the VS Code Marketplace "Details" page — it
ships byte-identical inside the VSIX. Keep engineering detail out of it and in
this file.

## Scope

`apps/extension-vscode` owns the IDE-native developer surface and workspace-scoped agent UI.

## Lane Contract

- Primary lane: `vscode-extension`.
- Owned write path: `apps/extension-vscode/**`.
- Read-only context: CLI behavior and shared developer-session contracts.
- CLI protocol changes and `packages/contracts/types/**` edits require the CLI or contracts lane.

## High-Risk Areas

- Workspace trust, local file edits, terminal/process execution, CLI bridge/protocol behavior, provider keys, and developer-session handoff.
- VS Code sessions stay workspace/task scoped. Do not silently sync IDE context into Web/Mobile/Desktop app chat history.
- Shared developer-session schemas belong in `packages/contracts/types` or Rust crates, not extension-only files.

## Webview Sanitizer Layers

`src/webview/render.ts` sanitizes model output in two layers. Know which one
owns a given threat before changing either.

- markdown-it (`html: false` plus its default `validateLink`) escapes raw HTML
  and refuses `javascript:`, `data:`, `vbscript:` and `file:` links. Those
  never reach DOMPurify, so raw `<script>`/`<img onerror>` in model output is
  escaped text, not a stripped node.
- DOMPurify (`PURIFY_CONFIG`) strips hrefs markdown-it passes through —
  `command:`, `vscode-resource:`, `vscode-webview:` — via
  `ALLOWED_URI_REGEXP`, and the `afterSanitizeAttributes` hook forces
  `target="_blank" rel="noopener noreferrer"` on surviving links.
- Only part of `PURIFY_CONFIG` changes behavior. Load-bearing:
  `ALLOW_DATA_ATTR: false`, `FORBID_ATTR: ['style']`, and `FORBID_TAGS`
  entries `svg`, `math`, `audio`, `video`, `source`, `form`. The other eight
  `FORBID_TAGS` entries and the remaining `FORBID_ATTR` entries duplicate
  DOMPurify's defaults, so a test over them cannot fail — assert against a
  load-bearing entry when proving the sanitizer is wired.

`src/__tests__/sanitizer.webview.test.ts` covers this; DOMPurify needs a DOM,
so sanitizer tests belong in the `test:webview` suite.

## Verification

- Small change: `pnpm --filter agi-workforce typecheck`
- Behavior change: `pnpm --filter agi-workforce test`
- Build/package change: `pnpm --filter agi-workforce build`
