# AI Memory — AGI Workforce

Updated: 2026-03-07 — FULL STABILIZATION SPRINT (Waves 0–4, all 5 apps)

---

## Table of Contents

1. [Project Vision & Ground Rules](#1-project-vision--ground-rules)
2. [Architecture Decisions (Locked)](#2-architecture-decisions-locked)
3. [Confirmed Live Model IDs (March 2026)](#3-confirmed-live-model-ids-march-2026)
4. [Desktop App Architecture](#4-desktop-app-architecture)
5. [IPC Contract](#5-ipc-contract-typescript--rust)
6. [Provider Adapters](#6-provider-adapter-details)
7. [Cost Calculator](#7-cost-calculator)
8. [All Completed Fixes](#8-all-completed-fixes)
9. [Remaining Known Issues](#9-remaining-known-issues)
10. [Test Coverage](#10-test-coverage)
11. [Build Commands](#11-build-commands)
12. [Debugging Checklist](#12-debugging-checklist)

---

## 1. Project Vision & Ground Rules

**Goal**: Single universal desktop app replacing Claude Desktop, Cursor, ChatGPT, etc. Five apps total: desktop (Tauri), web (Next.js), VS Code extension, browser extension (Chrome MV3), mobile (Expo/RN).

**Rules (NEVER violate)**:

- **Fetch live docs** before changing model strings. Knowledge cutoff Aug 2025; today March 2026.
- **camelCase IPC**: ALL Tauri `invoke()` calls use camelCase. snake_case = silent `None` in Rust.
- **Conventional commits**: `type(scope): subject`.
- **No stubs/TODOs**: Real implementations only.
- **Smart defaults**: Non-technical users should never manually configure temperature, tokens, thinking budget.
- **Don't add complexity**: Stabilize and fix. No new features unless asked.

---

## 2. Architecture Decisions (Locked)

| Decision       | Details                                                                |
| -------------- | ---------------------------------------------------------------------- |
| Runtime        | Tauri v2 (Rust + React/TS)                                             |
| Storage        | SQLite + Argon2id via SecretManager                                    |
| Tool sandbox   | ToolGuard                                                              |
| MCP version    | `2025-11-25` — Streamable HTTP replaces SSE                            |
| Model catalog  | `models.json` — embedded at compile time via `include_str!`            |
| IPC convention | camelCase in ALL `invoke()`. Rust uses `#[serde(alias = "camelCase")]` |
| State mgmt     | Zustand (TS), `LazyLock` singletons (Rust)                             |
| Web framework  | Next.js 15 App Router                                                  |
| Mobile         | Expo SDK + NativeWind v4 + expo-router                                 |
| Browser ext    | Chrome MV3 service worker                                              |
| VS Code ext    | VS Code extension API v1.95+                                           |

---

## 3. Confirmed Live Model IDs (March 2026)

> **CRITICAL**: Fetched from live provider docs March 2026. DO NOT use training-data model strings.

### OpenAI

| ID                                        | Role                 | Price (in/out /1M) | Context |
| ----------------------------------------- | -------------------- | ------------------ | ------- |
| `gpt-5.4`                                 | Flagship             | $2.50/$15.00       | 1.05M   |
| `gpt-5.2`, `gpt-5.1`, `gpt-5`             | Previous flagships   | varies             | varies  |
| `gpt-5-mini`                              | Balanced             | $0.25/$2.00        | —       |
| `gpt-5-nano`                              | Budget (DEFAULT)     | $0.05/$0.40        | —       |
| `gpt-5-pro`, `gpt-5.4-pro`, `gpt-5.2-pro` | Pro tier             | —                  | —       |
| `o3`, `o4-mini`, `o3-pro`                 | Reasoning            | —                  | —       |
| `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano` | Non-reasoning legacy | —                  | —       |

**Responses API**: `gpt-5*`, `o3*`, `o4*` → use Responses API not Chat Completions.
**Cached input**: 0.5x price.

### Anthropic

| ID                                                        | Role     |
| --------------------------------------------------------- | -------- |
| `claude-opus-4-6`                                         | Flagship |
| `claude-sonnet-4-6`                                       | Balanced |
| `claude-haiku-4-5` (pinned: `claude-haiku-4-5-20251001`)  | Fast     |
| `claude-sonnet-4-5`, `claude-opus-4-5`, `claude-opus-4-1` | Legacy   |

**Thinking API**: `{ thinking: { type: "enabled", budget_tokens: N } }`. Min 1024 tokens.
**Cache**: read = 0.1x, creation = 1.25x input price.

### xAI (Grok)

| ID                            | Context | Price        |
| ----------------------------- | ------- | ------------ |
| `grok-4-1-fast-reasoning`     | 2M      | $0.20/$0.50  |
| `grok-4-1-fast-non-reasoning` | 2M      | $0.20/$0.50  |
| `grok-4-fast-reasoning`       | 2M      | $0.20/$0.50  |
| `grok-4-0709`                 | 256K    | $3.00/$15.00 |
| `grok-code-fast-1`            | 256K    | $0.20/$1.50  |
| `grok-3`                      | 131K    | $3.00/$15.00 |
| `grok-3-mini`                 | 131K    | $0.30/$0.50  |

### Mistral (IMPORTANT: dual IDs)

| Catalog ID         | Wire API ID (`apiModelId`) | Notes    |
| ------------------ | -------------------------- | -------- |
| `mistral-large-3`  | `mistral-large-2512`       | Dec 2025 |
| `mistral-medium-3` | `mistral-medium-2508`      | Aug 2025 |
| `mistral-small-3`  | `mistral-small-2506`       | Jun 2025 |

`get_api_model_id()` in `models_config.rs` translates catalog ID → wire ID before HTTP calls.

### Google (Gemini)

- `gemini-3-flash-preview`, `gemini-3-pro-preview`, `gemini-3.1-pro-preview`, `gemini-2.5-pro`, `gemini-2.0-flash`
- Thinking: `thinking_config: { thinking_budget: N }` for gemini-2.5-pro, gemini-3-pro, gemini-3.1-pro

### DeepSeek

- `deepseek-chat`, `deepseek-reasoner` — OpenAI-compatible, `reasoning_content` in response delta

### Moonshot/Kimi

- `moonshot-v1-8k` — docs behind login, unverifiable, left unchanged

---

## 4. Desktop App Architecture

### File Structure

```
apps/desktop/
  src/                            # TypeScript React frontend
    components/UnifiedAgenticChat/ # 79 UI component files
      index.tsx                   # Main chat component (~2500 lines)
    stores/
      modelStore.ts               # Model selection (thinkingModeEnabled, thinkingBudget)
      settingsStore.ts            # Settings (llmConfig.temperature, llmConfig.maxTokens)
    lib/
      modelRouter.ts              # Intelligent routing (1537 lines)
      tauri-mock.ts               # Web-mode Tauri API mocks
    handlers/slashCommandHandlers.ts
    constants/models.json         # Single source of truth for all models
    types/chat.ts
  src-tauri/src/
    lib.rs                        # All Tauri command registrations (~1600 lines)
    core/llm/
      llm_router.rs               # Routing + provider selection
      provider_adapter.rs         # All provider adapters (~2323 lines)
      models_config.rs            # models.json deserialization + helpers
      cost_calculator.rs          # Token + media + cache-discounted pricing
      sse_parser.rs               # SSE streaming parser
      thinking.rs                 # Thinking config + events
      fallback_chain.rs           # Circuit breaker + rate limit tracking
      background_manager.rs       # Async LLM queue (tokio::spawn driven)
    sys/commands/
      chat/mod.rs                 # IPC entry point
      chat/types.rs               # ChatSendMessageRequest (all fields)
      file_ops.rs                 # File operations
      test_runner.rs              # Test execution
      ollama.rs                   # Ollama commands (24h timeout)
```

### Key models_config.rs helpers

| Function                             | Purpose                                         |
| ------------------------------------ | ----------------------------------------------- |
| `get_api_model_id(model_id)`         | Catalog ID → wire API ID (critical for Mistral) |
| `get_default_model(provider)`        | Default model for provider                      |
| `model_uses_responses_api(id)`       | True for gpt-5*, o3*, o4\*                      |
| `model_supports_gemini_thinking(id)` | True for gemini-2.5-pro, gemini-3-pro           |
| `calculate_with_cache(...)`          | Cache-discounted pricing                        |

---

## 5. IPC Contract (TypeScript → Rust)

### `chat_send_message` fields (ALL camelCase)

```typescript
{
  conversationId, userId, content, provider, model,
  providerOverride, modelOverride, strategy, stream,
  enableTools, conversationMode, workflowHash, taskMetadata,
  focusMode, researchTaskId, attachments,
  thinkingMode,          // bool
  thinkingBudget,        // number — Budget > Adaptive > Enabled priority
  reasoningEffort,       // "low"|"medium"|"high" for OpenAI o-series
  temperature,           // 0.0-2.0 override
  maxOutputTokens,       // override
  enableAgentMode, preferCloudCredits, frontendMessageId,
  customInstructions, projectFolder, modelCapabilities,
  incognito, autoInjectSkills,
  isExplicitModelSelection,  // added Sprint 2
}
```

### Thinking Budget Priority (Rust chat/mod.rs)

1. `thinkingBudget > 0 && thinkingMode` → `ThinkingParameter::Budget { budget_tokens: N }`
2. `thinkingMode && no budget` → `ThinkingParameter::Adaptive`
3. `thinkingMode && budget=0` → `ThinkingParameter::Enabled(true)`

### All Correct IPC Command Names

(See completed fixes below for the full mapping of all 24 fixed slash command IPC names)

---

## 6. Provider Adapter Details

### Anthropic

- Thinking: `{ thinking: { type: "enabled", budget_tokens: N } }` in request
- Thinking content: captured into `reasoning_content` field (was silently discarded — FIXED)
- Multimodal: `{ type: "image", source: { type: "base64", media_type, data } }` (FIXED)
- Cache: applied to system + last user message

### OpenAI (two paths)

- **Responses API** (`gpt-5*`, `o3*`, `o4*`): `input` field, `reasoning: { effort }`, `previous_response_id`
- **Chat Completions**: standard format; wire model ID resolved via `get_api_model_id()` (FIXED)

### DeepSeek/Moonshot/Zhipu

- OpenAI-compatible; DeepSeek extracts `reasoning_content` from delta

### Perplexity

- OpenAI-compatible minus tools (tools stripped)

### Ollama

- Full `LLMProvider` impl; tool injection into system prompt; **24h timeout** (FIXED)

---

## 7. Cost Calculator

### Token pricing (loaded from models.json)

- Both catalog ID and `apiModelId` registered → lookups work either way
- Provider defaults as fallback; `(1.0, 1.0)` as final fallback

### Cache-discounted pricing (`calculate_with_cache`)

| Provider  | cache_read | cache_creation |
| --------- | ---------- | -------------- |
| Anthropic | 0.1x       | 1.25x          |
| OpenAI    | 0.5x       | —              |
| Others    | 1.0x       | —              |

### Media pricing (hardcoded)

| Provider | Standard image | HD image | Video/sec |
| -------- | -------------- | -------- | --------- |
| OpenAI   | $0.04          | $0.08    | $0.10     |
| Google   | $0.04          | $0.08    | $0.08     |

---

## 8. All Completed Fixes

### Sprint 1 (prev session, commit `55fd15ad`)

- 28 wrong IPC command names in slashCommandHandlers.ts
- useGlobalVoicePTT.ts crash in web mode
- tauri-mock.ts with 6 new mocks
- index.tsx: duplicate messages, watchdog, thinking event
- CommandPalette.tsx: store, flatIdx, FTS5 UUID
- All 4 stores (browserStore, automationStore, authOrchestrator, billingUsage)
- 15+ UI components fixed
- Rust: mod.rs voice_global, test_runner.rs timeout, code_search.rs home_dir

### Sprint 2 (prev session)

- models.json: grok-4-1-fast-reasoning added, Mistral apiModelIds corrected
- llm_router.rs: grok upgrade, mistral catalog IDs, cache-aware cost calc
- models_config.rs: get_api_model_id() added
- provider_adapter.rs: Anthropic thinking capture, multimodal, wire model ID
- cost_calculator.rs: calculate_with_cache()
- chat/types.rs + mod.rs: thinkingBudget, reasoningEffort, temperature, maxOutputTokens wired
- index.tsx + chat.ts: IPC call additions, type fixes

### Wave 0-4 (this session — ALL 5 APPS)

#### Desktop (apps/desktop)

- **BUG-001**: file_ops.rs dir_traverse compile errors — already fixed
- **BUG-002**: test_runner.rs let mut child — already fixed
- **BUG-L04**: useGlobalVoicePTT.ts relative path corrected
- **BUG-L05**: background_manager.rs: tokio::spawn added for queue processing
- **BUG-005**: is_explicit_model_selection field added to ChatSendMessageRequest
- **BUG-008**: total_input_tokens/total_output_tokens added to ConversationStats
- **BUG-009**: 5 LLM commands added to tauri-mock
- **IG-008**: ArtifactType union extended (video/audio/music/search)
- **MessageBubble**: reactive store access (useSettingsStore, useMcpAppStore)
- **useMessageActions.ts**: `as any` cast for dual React types compatibility
- **test-utils.tsx**: children type fixed for dual React versions
- **3 new test files**: chatIPC.test.ts, modelRouter.test.ts, tauriMock.test.ts (56 tests)

#### Web (apps/web)

- **BUG-C01**: lib/model-tiers.ts created; both LLM routes unified
- **BUG-C02**: Credit deduction added to image/video generation routes
- **BUG-C03**: app/api/mission/route.ts + app/api/agents/collaboration/route.ts created; TeamChatInterface + use-multi-agent-chat + use-agent-collaboration fixed
- **BUG-H01**: CSRF added to memory/[id] PUT/DELETE
- **BUG-H02**: CSRF added to conversations/[id] PUT/DELETE
- **BUG-H03**: x-csrf-token added to CORS Allow-Headers in cors.ts
- **BUG-H04**: AgentCommunication connected to real API
- **BUG-H05**: Audio transcription rate limit changed to more restrictive bucket
- **BUG-M01**: All hardcoded agiworkforce.com URLs use NEXT_PUBLIC_APP_URL env var
- **BUG-M03**: use-agent-collaboration calls correct /api/agents/collaboration endpoint
- **BUG-M04**: console.log → structured logger in websocket-manager, analytics-tracker, seo-optimizer, database-backup
- **BUG-M05**: AIConfiguration.tsx connected to real API (/api/settings/test-provider)
- **BUG-M06**: employee-executor.ts imports real services
- **3 new test files**: model-tiers.test.ts, image-generation.test.ts, csrf.test.ts (56 tests)

#### VS Code Extension (apps/extension-vscode)

- **BUG-01**: ConversationStore now populated — history persists and loads
- **BUG-02**: WebSocket → `ws` npm package (Node 20 compatible)
- **BUG-03**: System prompt built AFTER setPlanMode() — plan mode works on first use
- **BUG-04**: Single Map-based TextDocumentContentProvider (multi-file diffs correct)
- **BUG-05**: Bridge message handlers re-registered on re-enable
- **BUG-06**: agi-workforce.chat fallback chain (no longer requires Copilot)
- **BUG-07**: pingApi() uses GET not POST
- **BUG-08**: AI traffic stays on cloud API; bridge used only for non-AI ops
- **BUG-09**: TelemetryLogger single push to subscriptions (no double-dispose)
- **BUG-10**: Tests now import real source via vscode mock alias
- **BUG-11**: planModeChanged webview handler added (shows PLAN badge)
- **BUG-12**: pendingResolve type fixed to `() => void`
- **BUG-13**: Keybindings changed to cmd+shift+alt+e, cmd+shift+alt+g
- **BUG-14**: Port-unreachable warning → dynamic StatusBarItem
- **BUG-15**: Model fallback `'auto'` → `'auto-balanced'` everywhere
- **BUG-16**: Bridge subscriptions properly disposed on toggle
- **BUG-17**: Command count test reads from package.json at runtime
- **BUG-18**: editorIsOpen → editorTextFocus in when-clause
- **New files**: vscode mock, desktopBridge.test.ts (15 tests)
- **Tests**: 202/202 passing

#### Browser Extension (apps/extension)

- **BUG-01**: `scripting` permission added to manifest.json
- **BUG-02**: `cookies` permission added to manifest.json
- **BUG-03**: isNativeConnected set AFTER handshake completes
- **BUG-04**: CSP updated: `style-src 'self' 'unsafe-inline'`
- **BUG-05**: setInterval → chrome.alarms for MV3 SW compatibility
- **BUG-06**: 20 message handlers ported from legacy background.js to background.ts (cookies, tabs, recording, accessibility, element interactions)
- **BUG-07**: addAutomationIndicator null body guard added
- **BUG-08**: isPermanentError uses specific error strings only
- **BUG-09**: checkDesktopConnection no longer double-reconnects
- **BUG-10**: XSS prevention — javascript: URLs sanitized in markdown links
- **BUG-11**: NodeJS.Timeout → ReturnType<typeof setTimeout>
- **BUG-12**: detectPlatformFromUrl added to jobAutofill.runtime.d.ts
- **BUG-13**: open_side_panel in NativeMessageType union
- **BUG-14**: CAPTURE_SCREENSHOT removed from content script allowlist
- **BUG-16**: CHAT_CHUNK moved to InternalMessageType
- **BUG-17**: All notifyConnectionStatusChange calls have void/catch
- **BUG-18**: injected.js comment corrected
- **BUG-19**: renderMessages incremental (no full DOM rebuild)
- **BUG-20**: recognition: any → proper type with memory leak guard
- **BUG-21**: Redundant syncPageContext removed from init
- **BUG-22**: incrementActionCount reads storage first (no race)
- **3 new test files**: sidePanelMarkdown, background.reconnect, background.cookies (46 tests)

#### Mobile (apps/mobile)

- **BUG-001**: RTCConfiguration/RTCIceCandidateInit declared locally
- **BUG-002**: Agent detail screen app/(app)/agents/[id].tsx created (full implementation)
- **BUG-004**: expo-av plugin added to app.json with microphone permission
- **BUG-005**: expo-camera plugin updated with cameraPermission
- **BUG-006**: expo-notifications plugin updated with color and androidMode
- **BUG-007**: GeneratedImage + ImageGenProgress rendered in MessageBubble
- **BUG-008**: VoiceConversationScreen wired into HomeScreen and ChatScreen
- **BUG-009**: RecordingOverlay integrated into ChatInput with live audio level
- **BUG-010**: TIME_GROUPS logic corrected (Today matches correctly)
- **BUG-014**: Schedule navigation path corrected (/(app)/schedules/create)
- **BUG-015**: pendingApprovals reads from agentStore
- **BUG-017**: Manage Subscription calls /api/billing/portal
- **BUG-018**: NetworkBadge uses @react-native-community/netinfo
- **BUG-019**: lib/clipboard.ts RN Clipboard fallback removed
- **BUG-020**: notifications.ts navigator-before-ready guard added
- **BUG-021**: expo-image-picker plugin updated with permissions
- **BUG-023**: api.ts uploadFile() method added
- **BUG-024**: Android Share API fixed (message vs url per platform)
- **BUG-025**: AgentCard imports formatRelativeTime from @agiworkforce/utils
- **BUG-026**: streaming.ts reconnect with exponential backoff (3 attempts)
- **BUG-027**: streamingMessageId cleared on error path
- **BUG-028**: useLocalSearchParams id narrowed to string
- **BUG-029**: citations field added to ChatMessage type
- **BUG-030**: RecurrencePicker labels: ['Su','Mo','Tu','We','Th','Fr','Sa']
- **BUG-032**: Switch external prop sync via useEffect
- **BUG-033**: SidebarHeader New Chat creates conversation + navigates
- **BUG-035**: api.ts tagConversation() method added
- **3 new test files**: conversationGrouping, chatStore, clipboard (35 tests)

---

## 9. Remaining Known Issues

### Desktop

- 3 pre-existing test failures in automationStore + ToolTimeline (not caused by our changes)
- Message.id typed as number but UUIDs used at runtime — requires larger refactor

### Web

- React 19 + framer-motion/sonner type incompatibilities (dual @types/react) — worked around with targeted `as any` casts in 6 component files
- BUG-L01 (hardcoded "gpt-5.2" in llm_router.rs lines 922 + 2183) — confirmed already uses get_default_model()
- BUG-L06 (ConnectorsDialog, MobileCompanionWorkspace) — possible dead code, needs runtime verification

### Mobile

- expo-media-library not installed (needed for save-to-gallery in ImageFullScreen)
- Push notification EAS projectId placeholder (needs real project ID)
- WebRTC companion feature depends on @agiworkforce/utils workspace package build

### Browser Extension

- Legacy background.js / content.js files coexist in src/ — should be deleted after verification that all handlers are ported

---

## 10. Test Coverage

| App         | Test Files       | Tests     | Status  |
| ----------- | ---------------- | --------- | ------- |
| Desktop     | 3 new + existing | 56 new    | ✅ pass |
| Web         | 3 new            | 56 new    | ✅ pass |
| VS Code     | updated + 1 new  | 202 total | ✅ pass |
| Browser ext | 3 new            | 46 new    | ✅ pass |
| Mobile      | 3 new            | 35 new    | ✅ pass |

---

## 11. Build Commands

```bash
# === Desktop ===
pnpm dev                           # Frontend only (Vite)
pnpm tauri dev                     # Full (Rust + React)
pnpm tauri build                   # Production installer
cd apps/desktop && npx tsc --noEmit            # TS check
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml  # Rust check

# === Web ===
cd apps/web && pnpm dev            # Next.js dev
cd apps/web && npx tsc --noEmit    # TS check
cd apps/web && pnpm build          # Production build

# === VS Code Extension ===
cd apps/extension-vscode && pnpm compile        # esbuild
cd apps/extension-vscode && npx tsc --noEmit    # TS check
cd apps/extension-vscode && npx vitest run      # Tests (202 tests)

# === Browser Extension ===
cd apps/extension && npx vite build             # Build
cd apps/extension && npx tsc --noEmit           # TS check
cd apps/extension && npx vitest run             # Tests (46 tests)

# === Mobile ===
cd apps/mobile && npx expo start                # Dev server
cd apps/mobile && npx tsc --noEmit              # TS check
cd apps/mobile && npx jest                      # Tests (35 tests)
```

---

## 12. Debugging Checklist

| Issue                     | Check                                                                     |
| ------------------------- | ------------------------------------------------------------------------- |
| Tauri invoke silent fail  | Rust command registered in lib.rs + has #[tauri::command]                 |
| IPC params arrive as None | ALL params camelCase in invoke(); Rust has #[serde(alias = "camelCase")]  |
| Model 404 from provider   | Check models.json apiModelId; check get_api_model_id() translation        |
| Thinking not showing      | Check budget_tokens sent; check adapt_response captures thinking blocks   |
| Cost shows $0             | cost_calculator has (provider, model_id) pair; apiModelId also registered |
| MCP won't connect         | Server running + correct transport (stdio vs HTTP)                        |
| Web mode crash            | Import from lib/tauri-mock not @tauri-apps directly                       |
| Streaming stops           | Check SSE delimiter per provider; check sse_parser.rs                     |
| Cache discount missing    | Use calculate_with_cache() not calculate()                                |
| Mistral wrong model       | Catalog ID ≠ wire ID; use get_api_model_id() for HTTP                     |
| Browser ext not connected | Check isPermanentError not too greedy; check chrome.alarms for reconnect  |
| VS Code ext history empty | ConversationStore.save() called after response (now fixed)                |
| Mobile voice unreachable  | VoiceConversationScreen wired in index.tsx + chat/[id].tsx (now fixed)    |
| Mobile image not shown    | MessageBubble checks message.type === 'image' (now fixed)                 |
| Web CSRF error            | x-csrf-token in Allow-Headers in cors.ts (now fixed)                      |
| Web tier bypass           | Both LLM routes import from lib/model-tiers.ts (now fixed)                |
