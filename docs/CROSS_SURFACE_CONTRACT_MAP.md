# Cross-Surface Contract Map

Status: living document
Created: 2026-03-15
Last updated: 2026-03-15
Purpose: answer "where does this capability belong?" without improvising

## Shared Type Packages

| Package               | Path              | Contents                                                                                                                                                    |
| --------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@agiworkforce/types` | `packages/types/` | context, tool-events, auth, signaling, errors, voice, agent-status, customModel, conversation, workflow, model-catalog, tauri, prompt-enhancement, database |
| `@agiworkforce/utils` | `packages/utils/` | Shared utility functions                                                                                                                                    |

## Capability Ownership Map

### 1. LLM Routing and Streaming

| Aspect              | Ownership                                          | Notes                                                                         |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| Model catalog data  | **Shared**: `apps/web/constants/models.json`       | Single source of truth, embedded in Rust via `include_str!`                   |
| Model catalog types | **Shared**: `packages/types/src/model-catalog.ts`  | `ModelMetadata`, `ModelCapabilities`, `Provider`, `ProviderConfig`            |
| LLM routing engine  | **Desktop-native**: `core/llm/llm_router.rs`       | Provider adapter, SSE parser, cost calculator                                 |
| Provider adapters   | **Desktop-native**: `core/llm/provider_adapter.rs` | OpenAI, Anthropic, Gemini, Ollama, DeepSeek, etc.                             |
| SSE streaming       | **Desktop-native**: `core/llm/sse_parser.rs`       | Parsed in Rust, forwarded to frontend via Tauri events                        |
| Token counting      | **Desktop-native**: `core/llm/token_counter.rs`    | tiktoken-based with heuristic fallback                                        |
| Cost calculation    | **Desktop-native**: `core/llm/cost_calculator.rs`  | models.json-driven pricing with cache discounts                               |
| Model selection UI  | **Surface-local**                                  | Desktop: `modelStore.ts`; Web: own model selector; Mobile: limited model list |

### 2. Conversations and Messages

| Aspect                                 | Ownership                                        | Notes                                                                               |
| -------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Core types (MessageRole, ArtifactType) | **Shared**: `packages/types/src/conversation.ts` | Stable, used by all surfaces                                                        |
| Full Message shape                     | **Surface-local**                                | Desktop: numeric IDs (SQLite); Mobile: string IDs (API); Web: varies                |
| Conversation persistence               | **Surface-local**                                | Desktop: SQLite; Web: Supabase; Mobile: MMKV; VS Code: globalState                  |
| Artifact rendering                     | **Surface-local**                                | Each surface renders artifacts differently                                          |
| Streaming protocol                     | **Bridged from desktop**                         | Desktop does SSE parsing; other surfaces get pre-parsed events via API or signaling |

### 3. Tool Execution and MCP

| Aspect                  | Ownership                                                 | Notes                                                                      |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Tool event types        | **Shared**: `packages/types/src/tool-events.ts`           | `ToolEvent`, `ToolEventStarted`, `ToolEventProgress`, `ToolEventCompleted` |
| Tool execution engine   | **Desktop-native**: `sys/commands/chat/tool_execution.rs` | ToolGuard validation, execution, result collection                         |
| MCP server connections  | **Desktop-native**: `core/mcp/`                           | stdio, SSE, streamable HTTP transports                                     |
| Tool display names      | **Desktop-native**: `sys/commands/chat/tool_events.rs`    | Claude Code-style labels (`Read(path)`, `Bash(cmd)`, etc.)                 |
| Tool name normalization | **Desktop-native**: `src/lib/chatToolUtils.ts`            | Shared utility for frontend tool display                                   |
| Tool approval UI        | **Surface-local**                                         | Desktop: inline in transcript; Mobile: approval request cards              |

### 4. Agent Runtime

| Aspect              | Ownership                                                         | Notes                                                      |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Agent status types  | **Shared**: `packages/types/src/agent-status.ts`                  | `AgentSession`, `AgentSessionStatus`, `AgentStatusSummary` |
| Agent executor      | **Desktop-native**: `core/agent/executor.rs`                      | Planner, executor, autonomous mode                         |
| Agentic loop        | **Desktop-native**: `sys/commands/chat/send_message_execution.rs` | Iteration limits, timeouts, compaction                     |
| Swarm orchestration | **Desktop-native**: `core/swarm/`                                 | Task decomposition, parallel agents                        |

### 5. Workflows

| Aspect          | Ownership                                    | Notes                                            |
| --------------- | -------------------------------------------- | ------------------------------------------------ |
| Workflow types  | **Shared**: `packages/types/src/workflow.ts` | `WorkflowDefinition`, nodes, edges, triggers     |
| Workflow engine | **Desktop-native**: `core/orchestration/`    | Executor, scheduler                              |
| Workflow UI     | **Surface-local**                            | Desktop: React Flow canvas; Web: simplified view |

### 6. Authentication and Billing

| Aspect              | Ownership                                | Notes                                                      |
| ------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Auth types          | **Shared**: `packages/types/src/auth.ts` | `AuthUser`, `UserProfile`, `AuthSession`                   |
| Auth implementation | **Cloud-backed**: Supabase SSR           | Web: `@supabase/ssr`; Desktop: deep link + token bridge    |
| Billing             | **Cloud-backed**: Stripe                 | Web: Stripe checkout; Desktop: verified via API            |
| Tier enforcement    | **Surface-local**                        | Desktop: `modelStore.ts`; Web: middleware; Mobile: via API |

### 7. Desktop Automation

| Aspect           | Ownership               | Notes                        |
| ---------------- | ----------------------- | ---------------------------- |
| Screen capture   | **Desktop-native only** | `automation/` module         |
| Input simulation | **Desktop-native only** | Keyboard/mouse via OS APIs   |
| Browser control  | **Desktop-native only** | PlaywrightBridge (CDP)       |
| Computer use     | **Desktop-native only** | OCR, vision-based automation |

### 8. Voice and Speech

| Aspect           | Ownership                                 | Notes                                                 |
| ---------------- | ----------------------------------------- | ----------------------------------------------------- |
| Voice types      | **Shared**: `packages/types/src/voice.ts` | `VoiceProvider`, `VoiceConfig`, `TranscriptionResult` |
| Voice processing | **Desktop-native**: `features/speech/`    | Local Whisper, VAD                                    |
| TTS              | **Cloud-backed**                          | Multiple providers                                    |

### 9. Real-time Communication

| Aspect           | Ownership                                      | Notes                                           |
| ---------------- | ---------------------------------------------- | ----------------------------------------------- |
| Signaling types  | **Shared**: `packages/types/src/signaling.ts`  | `SignalingEvent`, `SignalingRole`, `SignalKind` |
| Signaling server | **Cloud-backed**: `services/signaling-server/` | WebSocket server for desktop ↔ mobile pairing   |
| API gateway      | **Cloud-backed**: `services/api-gateway/`      | Mobile + external integrations                  |

### 10. Browser Extension

| Aspect                      | Ownership                                          | Notes                                         |
| --------------------------- | -------------------------------------------------- | --------------------------------------------- |
| Native messaging protocol   | **Extension-local**: `apps/extension/src/types.ts` | 50+ message types, self-contained             |
| Browser automation messages | **Extension-local**                                | Click, type, capture, etc.                    |
| Desktop bridge              | **Bridged from desktop**                           | Native messaging host connects to desktop app |

### 11. VS Code Extension

| Aspect               | Ownership                            | Notes                                      |
| -------------------- | ------------------------------------ | ------------------------------------------ |
| Chat format          | **VS Code-local**: OpenAI-compatible | `ChatMessage`, `ChatCompletionRequest`     |
| Conversation storage | **VS Code-local**: `globalState`     | Max 50 conversations, auto-pruned          |
| Desktop bridge       | **Bridged from desktop**             | Tool events, agent status via shared types |

## Contract Boundaries: What to Share vs. Keep Local

### Share Now (stable)

- Workflow types (exact duplicate eliminated)
- Model catalog types (models.json is already the single source)
- Conversation core types (MessageRole, ArtifactType, Artifact shape)
- Tool event types (already shared)
- Auth types (already shared)
- Agent status types (already shared)
- Voice types (already shared)
- Signaling types (already shared)

### Keep Local (still unstable or surface-specific)

- Full Message/Conversation shapes (ID types, persistence strategies differ)
- Desktop automation types (desktop-native only)
- Browser extension native messaging protocol (self-contained)
- VS Code conversation storage format (VS Code API-specific)
- Mobile image generation fields (mobile-specific UX)
- Web research task types (web-specific features)
- SaaS/billing internals (web-specific)

### Intentionally Deferred

- CLI surface (not yet built)
- Unified conversation sync protocol (requires cloud API design)
- Cross-surface MCP tool sharing (desktop is the only MCP host)
- Unified streaming protocol (desktop SSE vs. API streaming differ)

## Provider Parity Matrix

| Provider   | Desktop       | Web     | Mobile  | VS Code     | Extension   |
| ---------- | ------------- | ------- | ------- | ----------- | ----------- |
| OpenAI     | Full (Router) | Via API | Via API | Via API     | Via Desktop |
| Anthropic  | Full (Router) | Via API | Via API | Via API     | Via Desktop |
| Google     | Full (Router) | Via API | Via API | Via API     | Via Desktop |
| Ollama     | Full (Local)  | N/A     | N/A     | Via Desktop | N/A         |
| DeepSeek   | Full (Router) | Via API | Via API | Via API     | Via Desktop |
| Perplexity | Full (Router) | Via API | Via API | N/A         | N/A         |
| XAI/Grok   | Full (Router) | Via API | Via API | N/A         | N/A         |
| Others     | Full (Router) | Partial | Partial | N/A         | N/A         |

## Bridge Contract Risks

Critical contract drifts identified during Week 3 alignment review:

| Risk         | Bridge                  | Issue                                          | File                                             | Impact                                 |
| ------------ | ----------------------- | ---------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| **CRITICAL** | Extension (native)      | Host name `com.agiworkforce.browser` hardcoded | `apps/extension/src/background.ts:94`            | Permanent failure if host name changes |
| **CRITICAL** | Extension Bridge (Rust) | `ws://127.0.0.1:8787` hardcoded                | `automation/browser/extension_bridge.rs:13`      | Bridge fails if WS port changes        |
| **HIGH**     | VS Code                 | Port 8787 default (configurable via settings)  | `extension-vscode/src/services/desktopBridge.ts` | Mitigated by user config               |
| **HIGH**     | Mobile                  | Signaling server URL in env var                | `apps/mobile/stores/connectionStore.ts`          | App fails if URL incorrect             |
| **HIGH**     | Extension (native)      | `connect` + `ping` handshake sequence assumed  | `apps/extension/src/background.ts:216-229`       | Permanent failure if protocol changes  |
| **MEDIUM**   | Mobile                  | 3 control action types hardcoded               | `apps/mobile/stores/connectionStore.ts:97-119`   | Unknown actions silently ignored       |
| **MEDIUM**   | VS Code                 | `/api/health` endpoint required                | `extension-vscode/src/services/desktopBridge.ts` | Reconnect loops if endpoint removed    |

### Recommended Mitigations (next month)

1. **Extract port 8787 to configurable constant** in Rust extension bridge
2. **Add version handshake** to native messaging so extension detects incompatible desktop
3. **Log unknown control actions** in mobile instead of silently ignoring
4. **Add health endpoint contract test** to desktop CI

## Data Flow

```
models.json (source of truth)
    ├── Rust: include_str! → models_config.rs → llm_router, cost_calculator
    ├── Desktop TS: import → llm.ts → modelStore, llmConfigStore
    ├── Web: import → model selectors, pricing display
    └── Mobile: via API → limited model list

Tool Execution:
    Desktop Rust (ToolGuard → Execute → Result)
        → Tauri event "tool:event" → Frontend toolStore
        → Signaling → Mobile agent dashboard
        → Native messaging → Browser extension

Conversations:
    Desktop: SQLite (local, authoritative)
    Web: Supabase (cloud, independent)
    Mobile: MMKV (local cache) + API (cloud sync)
    VS Code: globalState (local only)
```
