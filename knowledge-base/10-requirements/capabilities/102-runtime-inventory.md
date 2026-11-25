---
id: "REQ-AREA-102"
type: "requirements"
title: "Requirement items: Runtime inventory"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 102. Runtime inventory

32 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S102.01

**Browser application runtime.** The web app runs as a client-side React application in the browser.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-01 Cloud chat answers, streamed](../../20-features/102-runtime-inventory/F102-01-cloud-chat-answers-streamed.md)

## S102.02

**Server-rendered web runtime.** Pages are rendered on the server by Next.js server components.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-01 Cloud chat answers, streamed](../../20-features/102-runtime-inventory/F102-01-cloud-chat-answers-streamed.md)

## S102.03

**Backend API runtime.** A backend HTTP API runs as Next.js route handlers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-01 Cloud chat answers, streamed](../../20-features/102-runtime-inventory/F102-01-cloud-chat-answers-streamed.md)

## S102.04

**Streaming gateway runtime.** Model output streams to clients over SSE with heartbeats from a long-lived route.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-01 Cloud chat answers, streamed](../../20-features/102-runtime-inventory/F102-01-cloud-chat-answers-streamed.md)

## S102.05

**Durable agent runtime.** Agent runs execute as durable workflows that survive the request and are reaped when stuck.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-02 Durable agent runs and deep research](../../20-features/102-runtime-inventory/F102-02-durable-agent-runs-and-deep-research.md)

## S102.06

**Research worker runtime.** Deep research runs in a background worker that outlives the chat request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-02 Durable agent runs and deep research](../../20-features/102-runtime-inventory/F102-02-durable-agent-runs-and-deep-research.md)

## S102.07

**Document/media worker runtime.** Media and file work runs in background jobs drained by a worker.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-03 Background jobs, schedules, connector sync and indexing](../../20-features/102-runtime-inventory/F102-03-background-jobs-schedules-connector-sync-and-index.md)

## S102.08

**Cloud code sandbox.** Cloud code runs in an isolated remote sandbox.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-04 Cloud code sandbox, cloud browser and cloud computer](../../20-features/102-runtime-inventory/F102-04-cloud-code-sandbox-cloud-browser-and-cloud-compute.md)

## S102.09

**Cloud browser runtime.** The product runs a browser in the cloud that the agent can drive.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-04 Cloud code sandbox, cloud browser and cloud computer](../../20-features/102-runtime-inventory/F102-04-cloud-code-sandbox-cloud-browser-and-cloud-compute.md)

## S102.10

**Cloud virtual-computer runtime.** The product runs a virtual computer in the cloud that the agent can operate.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-04 Cloud code sandbox, cloud browser and cloud computer](../../20-features/102-runtime-inventory/F102-04-cloud-code-sandbox-cloud-browser-and-cloud-compute.md)

## S102.11

**Desktop renderer.** The desktop app renders its UI in an Electron renderer (hosted web by default).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-05 Desktop app shell and its local helper](../../20-features/102-runtime-inventory/F102-05-desktop-app-shell-and-its-local-helper.md)

## S102.12

**Desktop privileged host process.** A privileged Electron main process hosts native services behind a dispatcher.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-05 Desktop app shell and its local helper](../../20-features/102-runtime-inventory/F102-05-desktop-app-shell-and-its-local-helper.md)

## S102.13

**Desktop local daemon.** The desktop starts a local long-running runtime process (the CLI app-server) for developer sessions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-05 Desktop app shell and its local helper](../../20-features/102-runtime-inventory/F102-05-desktop-app-shell-and-its-local-helper.md)

## S102.14

**Local shell/PTY runtime.** Local commands run in a shell/PTY runtime that supports interactive and long-running programs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-06 Local commands and their sandbox](../../20-features/102-runtime-inventory/F102-06-local-commands-and-their-sandbox.md)

## S102.15

**Local code sandbox.** Local commands run inside an OS sandbox (Seatbelt/Landlock) by default.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-06 Local commands and their sandbox](../../20-features/102-runtime-inventory/F102-06-local-commands-and-their-sandbox.md)

## S102.16

**Local MCP process host.** Local MCP servers run as child processes managed by a host.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-05 Desktop app shell and its local helper](../../20-features/102-runtime-inventory/F102-05-desktop-app-shell-and-its-local-helper.md)

## S102.17

**Local model runtime.** A local model runtime runs inference on the device.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-08 On-device model on the phone](../../20-features/102-runtime-inventory/F102-08-on-device-model-on-the-phone.md)

## S102.18

**CLI interactive runtime.** The CLI runs an interactive terminal runtime (TUI, with a REPL fallback).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-07 Command-line app](../../20-features/102-runtime-inventory/F102-07-command-line-app.md)

## S102.19

**CLI headless runtime.** The CLI runs headless for one-shot/scripted use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-07 Command-line app](../../20-features/102-runtime-inventory/F102-07-command-line-app.md)

## S102.20

**IDE extension-host runtime.** The VS Code extension runs in the extension host.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-09 Editor and browser extensions](../../20-features/102-runtime-inventory/F102-09-editor-and-browser-extensions.md)

## S102.21

**IDE webview runtime.** The VS Code extension renders UI in a webview.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-09 Editor and browser extensions](../../20-features/102-runtime-inventory/F102-09-editor-and-browser-extensions.md)

## S102.22

**Browser-extension background runtime.** The Chrome extension runs an MV3 background service worker.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-09 Editor and browser extensions](../../20-features/102-runtime-inventory/F102-09-editor-and-browser-extensions.md)

## S102.23

**Browser content-script runtime.** The Chrome extension runs content scripts in pages.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-09 Editor and browser extensions](../../20-features/102-runtime-inventory/F102-09-editor-and-browser-extensions.md)

## S102.24

**Mobile JavaScript/native runtime where applicable.** The mobile app runs as an Expo React Native app with native modules.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-10 Mobile app and phone-to-desktop relay](../../20-features/102-runtime-inventory/F102-10-mobile-app-and-phone-to-desktop-relay.md)

## S102.25

**Native audio/camera modules.** Native audio and camera modules capture media on device.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-10 Mobile app and phone-to-desktop relay](../../20-features/102-runtime-inventory/F102-10-mobile-app-and-phone-to-desktop-relay.md)

## S102.26

**Remote-device relay.** A relay connects a controller device (mobile) to a remote host (desktop) through a signaling service.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-10 Mobile app and phone-to-desktop relay](../../20-features/102-runtime-inventory/F102-10-mobile-app-and-phone-to-desktop-relay.md)

## S102.27

**Scheduler.** A scheduler fires due scheduled runs and completes them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-03 Background jobs, schedules, connector sync and indexing](../../20-features/102-runtime-inventory/F102-03-background-jobs-schedules-connector-sync-and-index.md)

## S102.28

**Connector synchronization workers.** Background workers sync connected-account content (mail, drive, etc.) on a schedule.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-03 Background jobs, schedules, connector sync and indexing](../../20-features/102-runtime-inventory/F102-03-background-jobs-schedules-connector-sync-and-index.md)

## S102.29

**Indexing workers.** Indexing runs as durable workflows dispatched by upload and swept by a cron.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-03 Background jobs, schedules, connector sync and indexing](../../20-features/102-runtime-inventory/F102-03-background-jobs-schedules-connector-sync-and-index.md)

## S102.30

**Realtime audio session service.** A realtime audio session service creates and manages live voice sessions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-11 Live voice sessions](../../20-features/102-runtime-inventory/F102-11-live-voice-sessions.md)

## S102.31

**Interactive artifact sandbox.** Interactive artifacts run in a sandboxed iframe with a restrictive CSP.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-12 Published artifacts and their sandbox](../../20-features/102-runtime-inventory/F102-12-published-artifacts-and-their-sandbox.md)

## S102.32

**Generated-application hosting runtime.** Generated applications are hosted at a public URL with the runtime they need.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F102-12 Published artifacts and their sandbox](../../20-features/102-runtime-inventory/F102-12-published-artifacts-and-their-sandbox.md)
