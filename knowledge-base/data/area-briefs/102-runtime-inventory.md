# Area 102. Runtime inventory

32 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S102.01 Browser application runtime.
- Should: The web app runs as a client-side React application in the browser.
- Status: platform done
- Code: apps/web/app/Providers.tsx:1; apps/web/app/layout.tsx:171

## S102.02 Server-rendered web runtime.
- Should: Pages are rendered on the server by Next.js server components.
- Status: platform done
- Code: apps/web/app/layout.tsx:114; apps/web/app/shared-artifact/[token]/page.tsx:54; apps/web/package.json:123

## S102.03 Backend API runtime.
- Should: A backend HTTP API runs as Next.js route handlers.
- Status: platform done
- Code: apps/web/app/api/chat/conversations/route.ts:236; apps/web/app/api/usage/route.ts:10

## S102.04 Streaming gateway runtime.
- Should: Model output streams to clients over SSE with heartbeats from a long-lived route.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:29; apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:796; apps/web/app/api/llm/v1/chat/completions/route.ts:146

## S102.05 Durable agent runtime.
- Should: Agent runs execute as durable workflows that survive the request and are reaped when stuck.
- Status: platform done
- Code: apps/web/lib/workflows/cloud-agent-workflow.ts:34; apps/web/lib/workflows/start-cloud-agent-workflow.ts:127; vercel.json:42

## S102.06 Research worker runtime.
- Should: Deep research runs in a background worker that outlives the chat request.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/route.ts:602; apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts:538; apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts:403; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2767; apps/web/lib/workflows/steps/settle-workflow-invocation.ts:207

## S102.07 Document/media worker runtime.
- Should: Media and file work runs in background jobs drained by a worker.
- Status: platform done
- Code: apps/web/lib/jobs/job-handlers.ts:164; apps/web/app/api/cron/drain-background-jobs/route.ts:23; vercel.json:110

## S102.08 Cloud code sandbox.
- Should: Cloud code runs in an isolated remote sandbox.
- Status: platform partial
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/lib/e2b/runtime.ts:889
- Unfinished: platform: E2B sandboxes are built but off unless AGI_E2B_EXECUTION=1 (.env.example ships 0); otherwise code runs on the provider-native interpreter. Turn it on in production.

## S102.09 Cloud browser runtime.
- Should: The product runs a browser in the cloud that the agent can drive.
- Status: platform missing

## S102.10 Cloud virtual-computer runtime.
- Should: The product runs a virtual computer in the cloud that the agent can operate.
- Status: platform missing

## S102.11 Desktop renderer.
- Should: The desktop app renders its UI in an Electron renderer (hosted web by default).
- Status: platform done
- Code: apps/desktop/electron/config.ts:39; apps/desktop/electron/main.ts:884

## S102.12 Desktop privileged host process.
- Should: A privileged Electron main process hosts native services behind a dispatcher.
- Status: platform done
- Code: apps/desktop/electron/main.ts:1345; apps/desktop/electron/runtime/dispatcher.ts:799

## S102.13 Desktop local daemon.
- Should: The desktop starts a local long-running runtime process (the CLI app-server) for developer sessions.
- Status: platform done
- Code: apps/desktop/electron/runtime/developerSessionService.ts:686; apps/desktop/electron/runtime/dispatcher.ts:401

## S102.14 Local shell/PTY runtime.
- Should: Local commands run in a shell/PTY runtime that supports interactive and long-running programs.
- Status: platform done
- Code: apps/desktop/electron/runtime/shellService.ts:581; apps/desktop/electron/runtime/shellService.ts:100; apps/desktop/electron/runtime/shellService.ts:651; apps/desktop/electron/runtime/shellService.ts:676; apps/desktop/electron/runtime/shellSandbox.ts:133; apps/desktop/electron/runtime/dispatcher.ts:992; packages/contracts/local-runtime/src/device-steps.ts:146; apps/web/features/desktop-host/lib/device-steps.ts:356

## S102.15 Local code sandbox.
- Should: Local commands run inside an OS sandbox (Seatbelt/Landlock) by default.
- Status: platform done
- Code: apps/cli/src/sandbox.rs:213; apps/cli/src/features/exec/tools/bash/mod.rs:90; apps/desktop/electron/runtime/shellSandbox.ts:22

## S102.16 Local MCP process host.
- Should: Local MCP servers run as child processes managed by a host.
- Status: platform done
- Code: crates/agiworkforce-mcp/src/client.rs:174; crates/agiworkforce-mcp/src/client.rs:226

## S102.17 Local model runtime.
- Should: A local model runtime runs inference on the device.
- Status: platform done
- Code: packages/platform/local-llm/src/tier3.ts:30; apps/desktop/electron/runtime/dispatcher.ts:799

## S102.18 CLI interactive runtime.
- Should: The CLI runs an interactive terminal runtime (TUI, with a REPL fallback).
- Status: platform done
- Code: apps/cli/src/lib.rs:4609

## S102.19 CLI headless runtime.
- Should: The CLI runs headless for one-shot/scripted use.
- Status: platform done
- Code: apps/cli/src/lib.rs:3115

## S102.20 IDE extension-host runtime.
- Should: The VS Code extension runs in the extension host.
- Status: platform done
- Code: apps/extension-vscode/package.json:74; apps/extension-vscode/src/core/chatSetup.ts:60

## S102.21 IDE webview runtime.
- Should: The VS Code extension renders UI in a webview.
- Status: platform done
- Code: apps/extension-vscode/src/core/chatSetup.ts:60; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:11

## S102.22 Browser-extension background runtime.
- Should: The Chrome extension runs an MV3 background service worker.
- Status: platform done
- Code: apps/extension/manifest.json:38; apps/extension/src/background.ts:206

## S102.23 Browser content-script runtime.
- Should: The Chrome extension runs content scripts in pages.
- Status: platform done
- Code: apps/extension/manifest.json:42; apps/extension/src/content.ts:118

## S102.24 Mobile JavaScript/native runtime where applicable.
- Should: The mobile app runs as an Expo React Native app with native modules.
- Status: platform done
- Code: apps/mobile/app/_layout.tsx:196; apps/mobile/package.json:85

## S102.25 Native audio/camera modules.
- Should: Native audio and camera modules capture media on device.
- Status: platform done
- Code: apps/mobile/app/(app)/camera.tsx:14; apps/mobile/src/features/voice/services/voice.ts:31

## S102.26 Remote-device relay.
- Should: A relay connects a controller device (mobile) to a remote host (desktop) through a signaling service.
- Status: platform done
- Code: services/signaling-server/src/connection-manager.ts:25; apps/web/app/api/pair/claim/route.ts:71

## S102.27 Scheduler.
- Should: A scheduler fires due scheduled runs and completes them.
- Status: platform done
- Code: vercel.json:26; apps/web/app/api/cron/run-schedules/route.ts:7; packages/platform/context-engine/src/engine.ts:349

## S102.28 Connector synchronization workers.
- Should: Background workers sync connected-account content (mail, drive, etc.) on a schedule.
- Status: platform missing

## S102.29 Indexing workers.
- Should: Indexing runs as durable workflows dispatched by upload and swept by a cron.
- Status: platform done
- Code: apps/web/lib/workflows/retrieval-index-workflow.ts:12; apps/web/lib/workflows/start-retrieval-index-workflow.ts:32; vercel.json:38

## S102.30 Realtime audio session service.
- Should: A realtime audio session service creates and manages live voice sessions.
- Status: platform done
- Code: apps/web/app/api/voice/live/sessions/route.ts:331; apps/web/app/api/voice/live/sessions/route.ts:188

## S102.31 Interactive artifact sandbox.
- Should: Interactive artifacts run in a sandboxed iframe with a restrictive CSP.
- Status: platform done
- Code: packages/ui/unified-chat/src/components/artifact-components/ArtifactSandboxFrame.tsx:146; packages/contracts/types/src/artifact-csp.ts:35

## S102.32 Generated-application hosting runtime.
- Should: Generated applications are hosted at a public URL with the runtime they need.
- Status: platform done
- Code: packages/contracts/types/src/billing-catalog.ts:232; apps/web/lib/services/artifact-connector-gate.ts:12; apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts:63; apps/web/app/api/artifacts/runtime/[token]/complete/route.ts:202; apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx:95; apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts:41
