---
id: "F104-05"
type: "feature"
title: "Native apps and CLI shells"
aliases: ["Electron desktop shell", "AGI Desktop", "Expo mobile app", "AGI Mobile", "CLI", "agi binary", "ratatui TUI", "app-server"]
area: "104 Named technology options-not claims about competitor internals"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S104.09", "S104.10"]
depends_on: ["SYS-execution-boundaries", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-local-inference", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:local", "file:apps/desktop/electron/main.ts", "file:apps/cli/Cargo.toml"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F104-05 Native apps and CLI shells

The desktop app is an Electron shell with a sandboxed window showing the hosted web app. The mobile app is Expo React Native with native modules. The CLI is a Rust program with a ratatui terminal interface and an app-server that serves other clients. The Tauri desktop code is retained internal code.

Area: [104. Named technology options-not claims about competitor internals](README.md). Requirement items: [S104.09](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10409), [S104.10](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10410).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Packages the product for each native platform: a privileged Electron main process around a remote web page, an Expo app with native modules, and a Rust terminal app. (apps/desktop/electron/main.ts:1090-1125; apps/mobile/package.json; apps/cli/Cargo.toml:15-25)

**Why it exists.** Native shells give files, windows, notifications, secure storage and a terminal home that a web page cannot.

**Who uses it.** People installing AGI on Mac or Windows, on a phone, or using the terminal.

**Problems it solves**

- One web codebase for desktop chat.
- Safe privileged code: renderer is sandboxed with context isolation.
- The terminal front end is separated from the agent engine so VS Code and others can reuse it (app_server.rs:1-30).

**Use cases**

- Open AGI Desktop and chat in a window.
- Share a window with the assistant.
- Run `agi` in a terminal.
- Use AGI Mobile offline.

## 2. User experience

**Where to find it**

- Desktop: installed app; window loads the hosted app (main.ts:1090-1125).
- Mobile: installed app with scheme 'agiworkforce' (app.config.js:160).
- CLI: binaries 'agi' and 'agiworkforce' (Cargo.toml:15-22).

**Before you start**

- Desktop needs network to the first-party host or localhost for development (config.ts:22,36-45).
- CLI: terminal.

**Screens and controls**

- Desktop share picker dialog 'Share a screen or window' with 'Choose what to share with <product>' and Cancel (main.ts:~870-890).
- Desktop offers to move itself to Applications (main.ts:1348-1355).
- Desktop shows a crash screen after a repeated renderer failure (main.ts:895-915).

**Journey**

1. Install and open the app.
2. Desktop: window opens, signs in through the hosted page, preload bridge exposes native commands to trusted senders.
3. Mobile: onboarding and chat.
4. CLI: run agi for the terminal UI or run the app-server for other clients.

**What the person sees and gets**

- Desktop recovers a dead renderer once and then shows a crash reference (main.ts:895-915).
- Desktop update flow in desktopAutoUpdate.ts (not read).

**Settings**

- Desktop: persistent partition for the remote session (main.ts:1117); settings store settingsStore.ts.
- Mobile: app.config.js plugins and permissions.
- CLI: config.rs, keybindings.rs.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Electron pinned ^44.10.2 (apps/desktop/package.json:168), main at electron/dist/bootstrap.cjs (line 6).
- Window uses contextIsolation true, sandbox true, nodeIntegration false and a preload bridge (main.ts:1100-1112).
- Allowed API base URL logic treats localhost names as a special case and refuses non-local http (config.ts:22,36-47).
- Screen share handled by system picker with a custom dialog fallback (main.ts:870-893).
- Mobile: Expo ~57.0.33 (package.json:87), Expo Router (line 115), React Native (line 139), native modules and config plugins (app.config.js:445-460), SQLCipher (line 454).
- CLI: ratatui 0.30 and crossterm 0.29 (Cargo.toml:83-84), TUI modules under cli/src/tui, app-server module (app_server.rs:1-30) and workspace crates for agent core, protocol and MCP (Cargo.toml:40-50).
- CLI also serves MCP over stdio (app_server.rs:6-12) and has app-server tests (apps/cli/tests/app_server_stdio.rs, app_server_websocket.rs).

**Incomplete**

- Desktop main-process trust boundaries beyond these lines were not read; the dispatcher gates commands by capability (dispatcher.ts:3200-3290).

**Present but disconnected or switched off**

- Electron desktop refuses local inference commands by design: 'answers every conversation in the cloud' (dispatcher.ts:3234-3244; docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-04).
- Tauri desktop code under apps/desktop/src and src-tauri is retained internal code (docs/security/security.md:310-320).

**Not available**

- Native shell on web and Chrome: not applicable.

## 4. Required behaviour

**Established requirements**

- S104.09: the desktop app runs as a native Electron shell with a privileged main process. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.09)
- S104.10: the mobile app is a native Expo React Native app with native modules. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.10)
- T10: the CLI separates a Rust TUI front end from its agent runtime, which also serves other clients as an app-server. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.09, S104.10)
- Electron is the public AGI Workforce desktop; Tauri is not a second public product (partly superseded 2026-10-24). (source: (doc: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-04))
- Desktop chat is Cloud; local coding sessions run the CLI. (source: (doc: docs/security/security.md:316-318))

**Acceptance criteria**

1. The desktop window has context isolation and sandbox on and no Node integration.
2. A page from a non-first-party host cannot call the native bridge (isTrustedSender).
3. Choosing a screen source gives only that source to the page; Cancel gives none.
4. Mobile builds with SQLCipher enabled.
5. `agi` starts a terminal UI; the app-server answers over stdio and an authenticated WebSocket.
6. A repeated renderer crash shows the crash screen instead of a blank window.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Public desktop requirement for free local inference conflicts with the Cloud-only decision [inferred from the established requirement text and dispatcher.ts:3234].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Document per-app status for S104.09 and S104.10 in the brief; the brief gives platform-only status.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | desktop package | `apps/desktop/package.json` | Electron version, main entry. |
| service | main process | `apps/desktop/electron/main.ts` | Windows, screen share picker, renderer recovery, apps-folder offer. |
| config | electron config | `apps/desktop/electron/config.ts` | Localhost and first-party host rules. |
| service | preload bridge | `apps/desktop/electron/preload.ts` | Exposes the bridge. |
| service | dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | Command gate; refuses local inference. |
| service | browserPane | `apps/desktop/electron/browserPane.ts` | Embedded browser pane with sandbox and navigation gate. |
| service | desktopAutoUpdate | `apps/desktop/electron/desktopAutoUpdate.ts` | Updates. |
| test | desktop electron tests | `apps/desktop/electron/__tests__/config.test.ts` | Config rules. |
| config | mobile package | `apps/mobile/package.json` | Expo SDK, React Native, expo-sqlite. |
| config | mobile app.config | `apps/mobile/app.config.js` | Plugins, scheme, SQLCipher. |
| screen | mobile root layout | `apps/mobile/app/_layout.tsx` | Root navigation. |
| config | mobile native config plugins | `apps/mobile/native` | TLS pinning and mermaid transformer. |
| config | cli Cargo manifest | `apps/cli/Cargo.toml` | Binaries, ratatui, crossterm, workspace crates. |
| component | cli tui | `apps/cli/src/tui/mod.rs` | Terminal UI modules. |
| service | cli app_server | `apps/cli/src/app_server.rs` | Developer session host, stdio and WebSocket transports, MCP stdio server. |
| service | cli lib | `apps/cli/src/lib.rs` | Command dispatch. |
| test | cli app-server tests | `apps/cli/tests/app_server_stdio.rs` | Stdio transport. |
| service | app-server crate | `crates/agiworkforce-app-server` | Shared server library. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Electron main creates a sandboxed window and loads the hosted web app with a persistent session partition. | device | main.ts:1090-1125 |
| The hosted page runs the web app; chat calls go to our servers. | our servers | AGENTS.md section 5; dispatcher.ts:3234-3241 |
| Native commands pass through the dispatcher, which gates by capability. | device | dispatcher.ts:3246-3290 |
| Mobile runs JS in React Native with native modules; Local chat runs on the device (F104-06). | device | apps/mobile/package.json; app.config.js:454 |
| CLI TUI talks to its in-process agent engine or app-server on the device; model calls it makes go to the chosen provider or Cloud. | device | app_server.rs:1-30 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Desktop remote session cookies | Electron persistent partition | no | Until sign-out or app data removal (unknown detail) |
| Mobile database | Encrypted SQLite on the phone (F104-06) | Only on explicit sign-in sync | See F104-06 |
| CLI sessions and config | Local files (sessions.rs, config.rs) | No silent global chat sync (doc: docs/product/commercial.md) | unknown |

**Models and providers.** Desktop chat uses Cloud models. Mobile Local uses on-device models, Cloud uses managed models. CLI uses Local, own-key or Cloud routes via its model registry crates (Cargo.toml:40-50).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Desktop chat needs sign-in; mobile Local does not; CLI uses account credentials in a shared credential broker (doc: docs/product/commercial.md). |
| Permissions | OS permissions for screen capture, microphone; Electron permissionPolicy.ts exists (not read). |
| Subscription | Desktop consumes the shared account entitlement (doc: docs/product/commercial.md Desktop row). |
| Limits and metering | none found for the shells themselves. |
| Feature flags | none found for shells. |
| Model compatibility | Not applicable to the shell. |
| Provider restrictions | Desktop: Cloud only for chat (dispatcher.ts:3234-3241). |
| Local mode | Mobile: on-device runs without an account. Desktop Electron: local inference refused. CLI: local routes exist (doc: docs/security/security.md:316-318). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Renderer crash | One reload, then crash screen with reference. | main.ts:895-915 |
| Failed load | Retry URL logic. | main.ts:1188-1195 |
| Screen share cancel | Callback with empty selection. | main.ts:884-893 |
| Non-local http API base | Rejected. | config.ts:46-50 |
| Offline | Desktop needs network for the hosted app; mobile Local works offline; CLI unknown. | main.ts load; F104-06 |
| Broken pipe on CLI output | A broken_pipe module and test exist. | apps/cli/src/broken_pipe.rs; apps/cli/tests/broken_pipe.rs |
| Accessibility of the TUI | not verified. | not read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/config.test.ts`: Host rules.
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Command gate and local inference refusal (line 1021).
- `apps/desktop/electron/__tests__/browserPane.test.ts`: Browser pane.
- `apps/desktop/electron/__tests__/conversationWindow.test.ts`: Windows.
- `apps/cli/tests/app_server_stdio.rs`: App-server over stdio.
- `apps/cli/tests/app_server_websocket.rs`: App-server over WebSocket.
- `apps/cli/tests/broken_pipe.rs`: Pipe handling.

**Test scenarios**

- **Window hardening**
  1. Open the desktop app.
  2. Inspect webPreferences in a debug build.
  - Expected: Sandbox and context isolation on.
- **Share a window**
  1. Start screen share in a chat.
  2. Pick a window.
  3. Press Cancel on a second try.
  - Expected: Only the picked window; cancel shares nothing.
- **Crash recovery**
  1. Kill the renderer twice quickly.
  - Expected: Reload then crash screen.
- **CLI app-server**
  1. Start the app-server over stdio.
  2. Send an initialize request.
  - Expected: A typed response.
- **Local inference on desktop**
  1. Invoke a local_chat_start command from the bridge.
  - Expected: Refusal with the cloud-only message.

**Where to look when it fails**

- Desktop events recorded via recordDesktopEvent (main.ts:1338-1345).
- CLI crash_reports and diagnostics_bundle modules.
- Dispatcher refusal string.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief gives platform status only; per-app depth for desktop, mobile and CLI is unknown.** Affects: All native apps. Evidence: brief S104.09, S104.10. Work needed: Per-app rows.
- **Requirement that on-device inference be free on desktop does not match the Electron decision to refuse it.** Affects: Desktop. Evidence: dispatcher.ts:3234-3244. Work needed: Owner decision; either amend the requirement or enable a path.
- **Brief cites main.ts:1345 and mobile _layout.tsx:196/package.json:121; those lines do not show a shell definition (1345 is session activity reporting).** Affects: Documentation. Evidence: main.ts:1335-1345; package.json:119-123. Work needed: Update references.

**Depends on**

- SYS-execution-boundaries
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-local-inference
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:local
- file:apps/desktop/electron/main.ts
- file:apps/cli/Cargo.toml

## Unknown

- Full list of Electron main-process boundaries and permission policy.
- Mobile native module list and which are required.
- CLI behaviour offline and its accessibility.
- Where VS Code reaches the CLI app-server in code.
