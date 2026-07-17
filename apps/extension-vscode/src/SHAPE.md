# VS Code Extension Source Shape

Current implementation map. This file describes code placement; implementation remains authoritative.

| Path                                 | Ownership                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `extension.ts`                       | Activation, process-pool lifecycle, configuration listeners, first-run notices.      |
| `core/`                              | Provider, chat, command, telemetry, and subsystem setup.                             |
| `features/chat-participant/`         | `@agi` adapter for local developer sessions.                                         |
| `features/sidebar-webview/`          | Sidebar protocol state and webview document.                                         |
| `features/trees/`                    | Runtime-owned session history and context trees.                                     |
| `features/model-picker/`             | Catalog-backed model presentation.                                                   |
| `features/inline-completions/`       | Inline completion provider.                                                          |
| `features/code-lens/`                | CodeLens provider.                                                                   |
| `features/hover/`                    | Hover provider.                                                                      |
| `features/desktop-bridge/`           | Explicit local Desktop bridge.                                                       |
| `features/account-auth/`             | Account auth used by cloud-backed auxiliary features, not local chat transport.      |
| `integrations/localRuntimeClient.ts` | JSONL app-server protocol adapter and validated runtime events.                      |
| `integrations/localRuntimePool.ts`   | One lazy app-server client per workspace root.                                       |
| `integrations/`                      | Other external adapters and provider-related clients.                                |
| `protocol/`                          | Runtime validation for webview messages.                                             |
| `platform/`                          | VS Code configuration, workspace, surface, and version helpers.                      |
| `data/`                              | Context, usage, token, queue, and indexing mechanics.                                |
| `providers/`                         | VS Code provider implementations and chat-editor host.                               |
| `memory/`                            | Local extension memory UI and persistence helpers.                                   |
| `ui/`                                | Shared extension UI helpers.                                                         |
| `utils/`                             | Legacy and cross-feature utilities. New runtime transport code does not belong here. |
| `webview/`                           | Bundled webview rendering entrypoints.                                               |
| `__tests__/`                         | Unit, protocol, lifecycle, and webview regression tests.                             |
| `test/`                              | VS Code extension-host test harness.                                                 |

## Dependency direction

```text
extension/core
  -> features/providers
  -> integrations
  -> platform/protocol/data

chat surfaces
  -> LocalRuntimePool
  -> LocalRuntimeClient
  -> agi app-server
```

The CLI/Rust app-server owns developer-session semantics. The extension owns VS Code presentation, workspace process lifecycle, runtime validation, and user approvals; it must not duplicate the Rust protocol implementation or persist a competing conversation store.
