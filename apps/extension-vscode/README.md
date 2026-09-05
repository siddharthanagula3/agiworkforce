<!--
  This file is the VS Code Marketplace "Details" page, it ships byte-identical
  inside the VSIX. Keep it user-facing; every claim here must be true of the
  packaged extension. Contributor and architecture notes live in AGENTS.md,
  which .vscodeignore excludes from the VSIX.

  Status: Current
  Owner: Extension lead
  Purpose: Marketplace listing copy for the AGI Workforce VS Code extension.
  Last updated: 2026-08-08
-->

# AGI Workforce for VS Code

AI pair programming that stays scoped to your repository. Chat, agent runs, code
edits, and session history are scoped to the workspace you have open and are
driven by the AGI CLI running on your own machine.

> **Public preview.** Features and defaults may change between releases.

## Requirements

- VS Code 1.100 or newer.
- **AGI CLI 1.7.1 or newer** available as `agi` on your `PATH`, chat, agent runs, and
  session history all run through the local `agi app-server` process. If the
  binary lives elsewhere, point `agiWorkforce.cliPath` at it.
- A trusted workspace. In a restricted workspace, agent file writes are
  disabled and trust-boundary, endpoint, CLI-path, and Desktop-bridge settings
  cannot be overridden by workspace settings.
- An AGI Cloud account only when you choose Managed Cloud or cloud-backed
  editor extras such as inline completions. Local models and provider BYOK stay
  available through the AGI CLI without an AGI subscription.

## Quick start

1. Install the extension and open a folder you trust.
2. Make sure `agi` runs from your terminal, or set `agiWorkforce.cliPath`.
3. Click the **AGI Workforce** icon in the Activity Bar, or press
   `Ctrl+Shift+A` (`Cmd+Shift+A` on macOS).
4. Ask a question, or type `@agi` in VS Code's own Chat view.

Run **AGI Workforce: Show Getting Started** at any time to reopen the
walkthrough.

## Features

**Chat where you are working.** A sidebar chat view, a full-width
`AGI Workforce: Open Chat in Editor` panel, and an `@agi` participant in VS
Code's native Chat with `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, and
`/model`.

**Repository context you choose.** Attach workspace files from the Context
view or with `AGI Workforce: Mention File in @agi Chat`. Attachments are
validated against path traversal, symlinks, folders, and sensitive filenames
before anything is sent, and the current editor selection can be included as
context.

**Reviewable edits, never surprise writes.** Proposed changes open in VS
Code's native diff view. Accept or reject per hunk, per file, or globally.
`Ctrl/Cmd+Shift+A` accepts and `Ctrl/Cmd+Shift+R` rejects the diff under the
cursor. `agiWorkforce.autoApplyFixes` is off by default.

**Agent modes with explicit approval.** `ask` confirms writes and commands,
`auto` (the default) runs read-only work on its own while writes and commands
still ask, `plan` proposes a plan before editing, and `bypass` skips prompts
only after you confirm the risk. Use the composer control or
**AGI Workforce: Choose Agent Mode**; normal Tab and Shift+Tab focus traversal is
never repurposed to change authority.

**Model selection that reflects what you can actually use.**
`AGI Workforce: Select Model` lists the models available to the resolved plan
and providers; the default `auto` routes each turn by task. The status bar
shows the active model and non-default agent mode.

**Session history per workspace.** The History view lists developer sessions
owned by the local runtime, so you can reopen or delete earlier conversations.

**Editor utilities.** Explain selection, fix, refactor, generate tests,
generate docs, code review with diagnostics, explain error, terminal command
suggestion and output explanation, hover actions, CodeLens actions, and a token
counter. Hover, CodeLens, and inline completions are each opt-in.

**Workspace memory.** Curate short facts in the Memory view; they are stored
only in this VS Code workspace and injected as bounded, untrusted context on
later developer turns.

## Commands

Every command is available from the Command Palette under **AGI Workforce**.
The most used ones:

| Command                              | Default keybinding                     |
| ------------------------------------ | -------------------------------------- |
| AGI Workforce: Open Chat             | `Ctrl+Shift+A` / `Cmd+Shift+A`         |
| AGI Workforce: Open Chat in Editor   | ,                                      |
| AGI Workforce: New Conversation      | `Ctrl+Shift+Alt+N` / `Cmd+Shift+Alt+N` |
| AGI Workforce: Explain Selection     | `Ctrl+Shift+Alt+E` / `Cmd+Shift+Alt+E` |
| AGI Workforce: Ask About Code        | `Ctrl+Shift+Alt+A` / `Cmd+Shift+Alt+A` |
| AGI Workforce: Explain Error         | `Ctrl+Shift+Alt+X` / `Cmd+Shift+Alt+X` |
| AGI Workforce: Agent Mode            | `Ctrl+Shift+Alt+G` / `Cmd+Shift+Alt+G` |
| AGI Workforce: Run Terminal Command  | `Ctrl+Shift+Alt+T` / `Cmd+Shift+Alt+T` |
| AGI Workforce: Select Model          | ,                                      |
| AGI Workforce: Restart Local Runtime | ,                                      |
| AGI Workforce: Account & Usage       | ,                                      |
| AGI Workforce: Send Feedback         | ,                                      |

## Settings

| Setting                                     | Default                               | What it does                                                                                     |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `agiWorkforce.cliPath`                      | `agi`                                 | Executable used to start the local `app-server`. Changing it restarts running runtimes.          |
| `agiWorkforce.model`                        | `auto`                                | Default model. `auto` routes each turn by task across the models your plan can reach.            |
| `agiWorkforce.agent.mode`                   | `auto`                                | `ask`, `auto`, `plan`, or `bypass` for new conversations.                                        |
| `agiWorkforce.agent.effort`                 | `medium`                              | Reasoning effort (`low`–`max`) for providers with an explicit effort axis.                       |
| `agiWorkforce.agent.thinking`               | `false`                               | Extended thinking for cloud-backed editor utilities only.                                        |
| `agiWorkforce.composer.followUpBehavior`    | `queue`                               | Whether a message sent mid-turn queues or steers. `Ctrl/Cmd+Enter` uses the other behavior once. |
| `agiWorkforce.contextLines`                 | `50`                                  | Surrounding lines included as context.                                                           |
| `agiWorkforce.hoverEnabled`                 | `false`                               | Quick actions when hovering an identifier.                                                       |
| `agiWorkforce.codeLensEnabled`              | `false`                               | Action lenses above functions and classes.                                                       |
| `agiWorkforce.autoApplyFixes`               | `false`                               | Apply suggested fixes without showing a diff first.                                              |
| `agiWorkforce.inlineCompletions.enabled`    | `false`                               | Ghost-text completions. Sends surrounding code to AGI Cloud; sensitive files are excluded.       |
| `agiWorkforce.inlineCompletions.debounceMs` | `300`                                 | Delay before requesting a completion.                                                            |
| `agiWorkforce.inlineCompletions.maxLength`  | `500`                                 | Maximum completion length in characters.                                                         |
| `agiWorkforce.desktopBridge.enabled`        | `false`                               | Show authenticated AGI Desktop availability over the local health bridge.                        |
| `agiWorkforce.desktopBridge.port`           | `8787`                                | Port for that local bridge.                                                                      |
| `agiWorkforce.apiEndpoint`                  | `https://agiworkforce.com/api/llm/v1` | API base URL for cloud-backed editor utilities.                                                  |
| `agiWorkforce.telemetryEnabled`             | `false`                               | Anonymous usage telemetry, also subject to VS Code's own telemetry setting.                      |

Run **AGI Workforce: Open Settings** for the full list with inline
explanations.

## Privacy

- The developer-session host runs through the AGI CLI on your machine. Local
  models stay on-device, provider BYOK sends directly to the named provider,
  and Managed Cloud sends to AGI infrastructure. The header identifies the
  active boundary before the request is sent.
- VS Code sessions stay workspace scoped and are not synced into AGI Web,
  Mobile, or Desktop chat history.
- Telemetry is **off** by default and honors VS Code's global telemetry
  setting.
- Inline completions are **off** by default; enabling them sends surrounding
  code to AGI Cloud, and files matching the sensitive-file denylist (`.env`,
  `.pem`, `.ssh/`, credentials, `secrets.json`, and similar) are excluded.
- Credentials from browser sign-in are stored in VS Code `SecretStorage` and
  can be revoked with **AGI: Sign out of AGI Cloud**.
- The chat header always names the boundary in use, Local, BYOK, or Managed
  Cloud, and switching a live session across a provider boundary starts a new
  thread instead of forwarding the earlier transcript.

## Error reporting

Uncaught exceptions and unhandled rejections in the extension host can be
reported for crash diagnosis, using the same `agiWorkforce.telemetryEnabled`
setting and endpoint as usage telemetry above. A report is sent only when
both that setting and VS Code's own telemetry setting allow it. Every report
is scrubbed before it leaves your machine: message text, file names, and
URLs are dropped, leaving only the error's type name and the bare function
names from its stack.

## Support

- Documentation: <https://agiworkforce.com/docs>
- Bug reports and feature requests: run **AGI Workforce: Send Feedback**, which
  opens a pre-filled issue with your environment details.
- Questions: use the Marketplace Q&A tab for this extension.

## License

Proprietary. © 2026 AGI Workforce. See `LICENSE`.
