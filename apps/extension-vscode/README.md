<!--
  This file is the VS Code Marketplace "Details" page, it ships byte-identical
  inside the VSIX. Keep it user-facing; every claim here must be true of the
  packaged extension. Contributor and architecture notes live in
  docs/CONTRIBUTING-NOTES.md, which .vscodeignore excludes from the VSIX.
  Links must be absolute https URLs: vsce resolves relative links against the
  repository root, not this folder, so a relative link breaks on the listing.

  Status: Current
  Owner: Extension lead
  Purpose: Marketplace listing copy for AGI Code.
  Last updated: 2026-11-11
-->

# AGI Code for VS Code

AI pair programming that stays scoped to your repository. Chat, agent runs, code
edits, and session history are scoped to the workspace you have open and are
driven by the AGI CLI running on your own machine.

> **Public preview.** Features and defaults may change between releases.

## Requirements

- VS Code 1.100 or newer.
- **AGI CLI 0.0.1 or newer** available as `agi` on your `PATH`. Chat, agent
  runs, and session history all run through the local `agi app-server`
  process. Run **Code: Install AGI CLI** to install it, or point
  `agiWorkforce.cliPath` at a binary you already have.
- A trusted workspace. In a restricted workspace, the local `agi app-server`
  process is not started, so chat, agent runs, and session history wait until
  you trust the folder; git and terminal commands and inline completions are
  disabled; and endpoint, CLI path, model, and startup settings cannot be
  overridden by workspace settings.
- An AGI Cloud account only when you choose Managed Cloud or cloud-backed
  editor extras such as inline completions, memory, and feedback. Local models
  and provider API keys stay available through the AGI CLI without an AGI
  subscription.

## Quick start

1. Install the extension and open a folder you trust.
2. Make sure `agi` runs from your terminal, or run **Code: Install AGI CLI**.
3. Click the **AGI Code** icon in the Activity Bar, or press
   `Ctrl+Shift+A` (`Cmd+Shift+A` on macOS).
4. Ask a question, or type `@agi` in VS Code's own Chat view.

Run **Code: Show Getting Started** at any time to reopen the
walkthrough.

## Features

**Chat where you are working.** A sidebar chat view, a full-width
**Code: Open Chat in Editor** panel, and an `@agi` participant in VS Code's
native Chat with `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, and
`/model`.

**Repository context you choose.** Mention workspace files with `@` in the
composer or **Code: Mention File in Chat**, and review what is attached with
**Code: Show Context Files**. Attachments are validated against path
traversal, symlinks, folders, and sensitive filenames before anything is sent,
and the current editor selection can be included as context.

**Reviewable edits.** Proposed changes open in VS Code's native diff view.
Accept or reject per hunk, per file, or globally. While the cursor is inside a
proposed change, `Ctrl/Cmd+Shift+A` or `Ctrl/Cmd+Shift+Enter` accepts it and
`Ctrl/Cmd+Shift+R` or `Escape` rejects it. Anywhere else these keys keep their
usual meaning.
`agiWorkforce.autoApplyFixes` is off by default.

**Agent modes with explicit approval.** `ask` confirms edits and commands.
`auto` (the default) reads and edits workspace files without asking, while
running commands and changing git hooks or MCP settings still ask first.
`plan` proposes a plan before editing, and `bypass` skips approval prompts only
after you confirm the risk. Use the composer control or
**Code: Choose Agent Mode**; normal Tab and Shift+Tab focus traversal is never
repurposed to change authority.

**Model selection that reflects what you can actually use.**
**Code: Select Model** lists the models available to the resolved plan and
providers; the default `auto` routes each turn by task. The status bar shows
the active model and non-default agent mode.

**Session history per workspace.** **Code: Show Sessions History** lists the
developer sessions the local runtime owns for this folder, so you can reopen
or delete earlier conversations.

**Editor utilities.** Explain selection, fix, refactor, generate tests,
generate docs, code review with diagnostics, explain error, terminal command
suggestion and output explanation, hover actions, CodeLens actions, and a token
counter. Hover, CodeLens, and inline completions are each opt-in.

**Memory.** When you are signed in to AGI Cloud, **Code: Memory** manages short
facts saved to your AGI account, shared with the AGI web app, CLI and mobile
app. While `agiWorkforce.memory.enabled` is on, those facts are added to your
turns as bounded, untrusted context; turn it off and nothing saved is sent.

## Commands

Every command is available from the Command Palette under **Code**.
The most used ones:

| Command                     | Default keybinding                     |
| --------------------------- | -------------------------------------- |
| Code: Open Chat             | `Ctrl+Shift+A` / `Cmd+Shift+A`         |
| Code: Open Chat in Editor   | None                                   |
| Code: New Conversation      | `Ctrl+Shift+Alt+N` / `Cmd+Shift+Alt+N` |
| Code: Explain Selection     | `Ctrl+Shift+Alt+E` / `Cmd+Shift+Alt+E` |
| Code: Ask About Code        | `Ctrl+Shift+Alt+A` / `Cmd+Shift+Alt+A` |
| Code: Explain Error         | `Ctrl+Shift+Alt+X` / `Cmd+Shift+Alt+X` |
| Code: Choose Agent Mode     | `Ctrl+Shift+Alt+G` / `Cmd+Shift+Alt+G` |
| Code: Run Terminal Command  | `Ctrl+Shift+Alt+T` / `Cmd+Shift+Alt+T` |
| Code: Select Model          | None                                   |
| Code: Restart Local Runtime | None                                   |
| Code: Account & Usage       | None                                   |
| Code: Send Feedback         | None                                   |

## Settings

| Setting                                     | Default                               | What it does                                                                                     |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `agiWorkforce.cliPath`                      | `agi`                                 | Executable used to start the local `app-server`. Changing it restarts running runtimes.          |
| `agiWorkforce.model`                        | `auto`                                | Default model. `auto` routes each turn by task across the models your plan can reach.            |
| `agiWorkforce.agent.mode`                   | `auto`                                | `ask`, `auto`, `plan`, or `bypass` for new conversations.                                        |
| `agiWorkforce.agent.effort`                 | `medium`                              | Reasoning effort, from `none` to `max`, for providers with an explicit effort axis.              |
| `agiWorkforce.agent.thinking`               | `false`                               | Extended thinking for cloud-backed editor utilities only.                                        |
| `agiWorkforce.composer.followUpBehavior`    | `queue`                               | Whether a message sent mid-turn queues or steers. `Ctrl/Cmd+Enter` uses the other behavior once. |
| `agiWorkforce.contextLines`                 | `50`                                  | Surrounding lines included as context.                                                           |
| `agiWorkforce.hoverEnabled`                 | `false`                               | Quick actions when hovering an identifier.                                                       |
| `agiWorkforce.codeLensEnabled`              | `false`                               | Action lenses above functions and classes.                                                       |
| `agiWorkforce.autoApplyFixes`               | `false`                               | Apply suggested fixes without showing a diff first.                                              |
| `agiWorkforce.inlineCompletions.enabled`    | `false`                               | Ghost-text completions. Sends surrounding code to AGI Cloud; sensitive files are excluded.       |
| `agiWorkforce.inlineCompletions.debounceMs` | `300`                                 | Delay before requesting a completion.                                                            |
| `agiWorkforce.inlineCompletions.maxLength`  | `500`                                 | Maximum completion length in characters.                                                         |
| `agiWorkforce.memory.enabled`               | `true`                                | Add the memory facts saved to your AGI account to your turns.                                    |
| `agiWorkforce.activateOnStartup`            | `false`                               | Start account and device background work when the window opens instead of on first use.          |
| `agiWorkforce.apiEndpoint`                  | `https://agiworkforce.com/api/llm/v1` | API base URL for cloud-backed editor utilities.                                                  |
| `agiWorkforce.telemetryEnabled`             | `false`                               | Product usage events, also subject to VS Code's own telemetry setting.                           |

Run **Code: Open Settings** for the full list with inline
explanations.

## Privacy

- The developer-session host runs through the AGI CLI on your machine. Local
  models stay on-device, provider API keys send directly to the named
  provider, and Managed Cloud sends to AGI infrastructure. The chat header
  names the boundary in use, Local, BYOK, or Managed Cloud, before a request
  is sent, and switching a live session across a provider boundary starts a
  new thread instead of forwarding the earlier transcript.
- VS Code sessions stay workspace scoped and are not synced into AGI Web,
  Mobile, or Desktop chat history.
- Account, plan and device checks wait until you open the AGI view, run an
  AGI command, or reopen an AGI session, unless you turn on
  `agiWorkforce.activateOnStartup`.
- Inline completions are **off** by default; enabling them sends surrounding
  code to AGI Cloud when you pause typing in a workspace file, at most 100
  lines and about 6,000 characters before the cursor. Nothing is sent until you
  close the first-use notice. Files matching the sensitive-file denylist
  (`.env`, `.pem`, `.ssh/`, credentials, `secrets.json`, and similar), files
  withheld by git ignore rules or `files.exclude` and `search.exclude`, unsaved
  new files, settings and other non-file editors are excluded. A restricted
  workspace cannot turn them on from its own settings.
- A Local default model is never swapped for an AGI Cloud model. With one
  selected, Fix, Refactor, Generate Tests and Generate Docs run in the chat on
  that model, and Code Review, Suggest Terminal Command and inline completions,
  which run only on AGI Cloud, send nothing and say so.
- Memory facts are stored in your AGI account, not in this workspace. See
  **Memory** above for when they are sent. Notes an earlier version saved in a
  workspace are copied to your account only while memory is on and after you
  choose to copy them.
- **Code: Send Feedback** sends what you type, with your VS Code, operating
  system and extension versions, to AGI from your signed-in account.
- Credentials from browser sign-in are stored in VS Code `SecretStorage`.
  **Code: Sign Out of AGI Cloud** removes them and also signs out the AGI CLI
  on this machine.
- Privacy policy: <https://agiworkforce.com/privacy>.

## Usage events

Usage events are **off** by default. When `agiWorkforce.telemetryEnabled` is
on, VS Code's telemetry setting allows it, and your account's privacy choices
allow product analytics, the extension sends a few named events from Managed
Cloud work (for example, stopping a response or accepting a suggested edit) to
your account at `/api/analytics/events`. Events carry no prompt, code, or file
names, and nothing is sent for Local or BYOK sessions.

## Support

- Documentation: <https://agiworkforce.com/docs>
- Bug reports and feature requests: run **Code: Send Feedback** while signed
  in to AGI Cloud.
- Questions: use the Marketplace Q&A tab for this extension.

## License

Proprietary. © 2026 AGI Workforce. The license terms ship with the extension
in its `LICENSE` file.
