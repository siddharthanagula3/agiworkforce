# Changelog

All notable changes to the **AGI Workforce** VS Code extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Workspace-trust gating** for sensitive settings (`apiEndpoint`, `gatewayUrl`, `modelEndpoint`, `cliPath`, `systemPrompt`, `agentMode.autoApply`). Cloning a malicious repo can no longer redirect API traffic via `.vscode/settings.json`.
- **Desktop bridge token-based auth** — the `ws://127.0.0.1:8787` connection now sends `{type:'auth', token}` from `~/.agiworkforce/bridge-token` (refused if perms ≠ 0600) and drops every inbound message until the server replies `auth_ok`. Inbound and outbound message types are both allowlisted.
- **Suggested-command shell sanitization** — `$(`, backticks, `;`, `&&`, `||`, `>`, `<`, `|`, `..`, and known destructive patterns are refused; valid suggestions require an explicit modal confirmation showing the exact command before it reaches `terminal.sendText()`.
- **Webview link sanitizer** rewritten — only `https?:` and `mailto:` URIs survive on `<a href>`, `<img src>`, `<form action>`, `<button formaction>`. `command:`, `javascript:`, `vscode-resource:`, `data:` are all stripped. `srcdoc` removed unconditionally.
- **`@file` content** is injected as `user`-role (not `system`) wrapped in `<file_content path="…">` tags; total `@file` payload capped at 20K chars; binary files rejected; literal `</file_content>` escaped.
- **Telemetry redactor** — JWTs, Bearer tokens, OpenAI/Anthropic/Stripe/Slack/GitHub/Google/AWS keys are scrubbed before any error or property reaches the telemetry endpoint.

### Added

- **Multi-root workspace support** for git/test/patch operations. New `utils/workspaceFolders.ts` with `getActiveWorkspaceFolder()` (interactive QuickPick fallback) and `getActiveWorkspaceFolderSync()`. Replaces 11 callsites that previously silently scoped to `workspaceFolders[0]`.
- **`agi.git.commit`** prefers the built-in Git extension API (shell-quoting-free, cross-platform). Falls back to a platform-aware shell-quoted invocation (POSIX single-quote escape on macOS/Linux; double-quote with `""` escape on Windows, `` ` `` and `$` stripped).
- **CodeLens cache** keyed by `(uri, document.version)` — avoids the previous 45,000-regex scan per refresh on a 5K-line file.
- **Inline-completion LRU cache** (16 entries, 15-second TTL) replaces the single-slot cache so typo-correction / undo loops no longer fire fresh requests every keystroke.
- **`providerStreamProvider`** setting expanded from 5 to 14 enum values (`auto` + 13 wired providers + `custom`) with markdown description linking to provider docs.

### Changed

- **`getExtensionVersion()`** is now used everywhere the extension version is reported (telemetry, feedback bridge, GitHub-issue prefill, desktop bridge handshake). Six previously-hardcoded `'0.1.0'` / `'0.0.0'` literals were leaving telemetry analytics blind to the real version.
- **`agiWorkforce.model`** description no longer enumerates specific model IDs (was `claude-sonnet-4.6, gpt-5.4, gemini-3.1-pro-preview` — would rot every era).
- **`@agi` chat participant** Copilot-fallback no longer pins `family: 'gpt-5.4'`; defers to the user's Copilot model picker.
- **Provider-stream fallback** in chat participant now resets the `responseTokens` buffer before invoking the legacy stream — previously the fallback path captured a dirty array and persisted a corrupted-prefix conversation.

### Tests

- 14 test files / **278 → 326 tests** (+48). New suites: `workspaceFolders.test.ts` (21), `telemetryRedaction.test.ts` (14), `shellQuote.test.ts` (10), `patchEngine.test.ts` (3, starter coverage).

## [0.3.0] - 2026-04-22

- Initial multi-provider release (10+ providers).
- @agi chat participant with `/explain /fix /refactor /tests /docs /model`.
- Sidebar webview, History tree, Context Files tree.
- Inline completions, code lens, hover.
- Desktop bridge over port 8787.

[Unreleased]: https://github.com/agiworkforce/agiworkforce/compare/vscode-v0.3.0...HEAD
[0.3.0]: https://github.com/agiworkforce/agiworkforce/releases/tag/vscode-v0.3.0
