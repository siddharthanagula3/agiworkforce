# AGI Runtime — Product Specification

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

AGI Runtime is the INTERNAL shared execution layer that powers the product surfaces — it is not a user surface and not a seventh app. Its real components today are the `crates/agiworkforce-{protocol,task-runtime,plugin-runtime,command-registry,app-server}` crates (where `app-server` is a local JSON-RPC-over-stdio + WebSocket tool host consumed ONLY by the CLI) and `packages/client/client-runtime`, plus the Desktop `127.0.0.1` WS/IPC host (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, which accepts the Chrome extension, VS Code extension, and Tauri webview, with IP lockout and an IPC token). It also includes the Chrome native-messaging host (`com.agiworkforce.browser`, `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`) with its localhost port-8787 HTTP/WS pairing bridge, `services/signaling-server` (WebRTC pairing/relay; roles `desktop`|`mobile`; QR pairing codes; per-role HMAC `pairTokens`; control verbs `approval_request`/`response`, `sync`, `dispatch`, `heartbeat`, `cancel`; offline approval queueing), and `services/api-gateway` (POST /). Because it spans Local, BYOK, and Managed Cloud, the runtime treats each as a separate trust boundary and never silently routes Local sessions, files, or developer context into BYOK or managed cloud. Every cross-boundary transition (for example Local to BYOK) must be an explicit fork/continuation with context selection, secret scan, payload preview, user consent, and a visible provider label. This index and its volumes describe how those pieces fit together as one coherent execution substrate.

The runtime inherits the product's shared pricing model: Free / Basic ($7 · ₹399) / Pro ($20) / Max ($100 & $200) / Team ($30/seat) / Enterprise. There is no Plus or Hobby tier; top-ups are enabled for paid tiers (capped, opt-in). Local and BYOK are free access modes wherever the surface allows them, so metered spend applies to managed cloud usage rather than to running your own models or keys.

These volumes are target/design specs, not a claim of shipped state. They are governed by [../README.md](../README.md) (the canon) and [docs/current/source-of-truth.md](../../current/source-of-truth.md), and every capability must carry a mandatory status label: ✅ shipped, 🟡 partial/in progress, or 🔭 planned/future.

## Volumes

| #   | File                                                                                         | Title                         |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------- |
| 01  | [volume-01-runtime-vision-and-architecture.md](volume-01-runtime-vision-and-architecture.md) | Runtime Vision & Architecture |
| 02  | [volume-02-runtime-boot-process.md](volume-02-runtime-boot-process.md)                       | Runtime Boot Process          |
| 03  | [volume-03-session-orchestration.md](volume-03-session-orchestration.md)                     | Session Orchestration         |
| 04  | [volume-04-remote-control.md](volume-04-remote-control.md)                                   | Remote Control                |
| 05  | [volume-05-agent-engine.md](volume-05-agent-engine.md)                                       | Agent Engine                  |
| 06  | [volume-06-planning-engine.md](volume-06-planning-engine.md)                                 | Planning Engine               |
| 07  | [volume-07-context-engine.md](volume-07-context-engine.md)                                   | Context Engine                |
| 08  | [volume-08-prompt-assembly-engine.md](volume-08-prompt-assembly-engine.md)                   | Prompt Assembly Engine        |
| 09  | [volume-09-conversation-engine.md](volume-09-conversation-engine.md)                         | Conversation Engine           |
| 10  | [volume-10-provider-engine.md](volume-10-provider-engine.md)                                 | Provider Engine               |
| 11  | [volume-11-agi-subscription-provider.md](volume-11-agi-subscription-provider.md)             | AGI Subscription Provider     |
| 12  | [volume-12-byok-providers.md](volume-12-byok-providers.md)                                   | BYOK Providers                |
| 13  | [volume-13-local-model-runtime.md](volume-13-local-model-runtime.md)                         | Local Model Runtime           |
| 14  | [volume-14-model-router.md](volume-14-model-router.md)                                       | Model Router                  |
| 15  | [volume-15-tool-engine.md](volume-15-tool-engine.md)                                         | Tool Engine                   |
| 16  | [volume-16-mcp-engine.md](volume-16-mcp-engine.md)                                           | MCP Engine                    |
| 17  | [volume-17-workspace-engine.md](volume-17-workspace-engine.md)                               | Workspace Engine              |
| 18  | [volume-18-file-system-engine.md](volume-18-file-system-engine.md)                           | File System Engine            |
| 19  | [volume-19-terminal-engine.md](volume-19-terminal-engine.md)                                 | Terminal Engine               |
| 20  | [volume-20-git-engine.md](volume-20-git-engine.md)                                           | Git Engine                    |
| 21  | [volume-21-permission-engine.md](volume-21-permission-engine.md)                             | Permission Engine             |
| 22  | [volume-22-synchronization-engine.md](volume-22-synchronization-engine.md)                   | Synchronization Engine        |
| 23  | [volume-23-storage-engine.md](volume-23-storage-engine.md)                                   | Storage Engine                |
| 24  | [volume-24-event-bus.md](volume-24-event-bus.md)                                             | Event Bus                     |
| 25  | [volume-25-plugin-framework.md](volume-25-plugin-framework.md)                               | Plugin Framework              |
| 26  | [volume-26-runtime-apis.md](volume-26-runtime-apis.md)                                       | Runtime APIs                  |
| 27  | [volume-27-security.md](volume-27-security.md)                                               | Security                      |
| 28  | [volume-28-performance.md](volume-28-performance.md)                                         | Performance                   |
| 29  | [volume-29-observability.md](volume-29-observability.md)                                     | Observability                 |
| 30  | [volume-30-remote-notifications.md](volume-30-remote-notifications.md)                       | Remote Notifications          |
| 31  | [volume-31-runtime-database.md](volume-31-runtime-database.md)                               | Runtime Database              |
| 32  | [volume-32-accessibility.md](volume-32-accessibility.md)                                     | Accessibility                 |
| 33  | [volume-33-analytics.md](volume-33-analytics.md)                                             | Analytics                     |
| 34  | [volume-34-testing.md](volume-34-testing.md)                                                 | Testing                       |
| 35  | [volume-35-edge-cases.md](volume-35-edge-cases.md)                                           | Edge Cases                    |
| 36  | [volume-36-error-codes.md](volume-36-error-codes.md)                                         | Error Codes                   |
| 37  | [volume-37-deployment.md](volume-37-deployment.md)                                           | Deployment                    |
| 38  | [volume-38-sdk-and-extensibility.md](volume-38-sdk-and-extensibility.md)                     | SDK & Extensibility           |
| 39  | [volume-39-future-runtime-features.md](volume-39-future-runtime-features.md)                 | Future Runtime Features       |
