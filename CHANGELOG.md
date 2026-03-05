# Changelog

All notable changes to AGI Workforce are documented in this file.

## [1.2.0] - 2026-03-05

### Fixed

- **Infinite "New Chat" bug**: Deduplicated session creation — `createSession()` no longer fires on both button click and first send
- **Tool result feedback loop**: `autonomous.rs` now feeds tool results back to the LLM for iterative reasoning
- **Card component re-export**: Fixed broken `Card` re-export in web UI library
- **ToolCalling implicit any**: Resolved implicit `any` params in web ToolCalling component
- **UnifiedAgenticChat TS errors**: Fixed TypeScript errors in web chat components
- **Marketing page Header imports**: Corrected import paths for Header component across marketing pages
- **Web type stub exports**: Removed empty type stub exports that caused import failures
- **CodeRabbit spec**: Changed `::new()` to `::default()` in productivity and file executor tests
- **AGI executor stubs**: Replaced TODO stubs in AGI executors with real implementations

### Added

- **Workflow engine**: Real script node execution, parallel node with actual workflow actions, wait node time/condition logic, and frontend workflow builder wiring
- **Autonomous task persistence**: Checkpoint-based resume for long-running autonomous tasks
- **VS Code agent mode**: Multi-file edit support with diff preview and apply/reject flow
- **VS Code ghost-text**: Inline completion provider for code suggestions
- **VS Code desktop bridge**: Native messaging bridge between VS Code extension and desktop app
- **VS Code telemetry**: Extension telemetry wiring for usage analytics
- **VS Code unit tests**: Test suite for VS Code extension core functionality
- **Mobile push notifications**: Expo push notification setup for iOS and Android
- **Mobile model picker**: Model selection wired into mobile schedule form
- **Mobile accessibility**: VoiceOver and TalkBack pass for all screens
- **Web chat store wiring**: Shared chat store connected to real Supabase API
- **Web dashboard live stats**: Replaced hardcoded mock data with Supabase queries
- **Web completion API route**: Server-side LLM completion endpoint for web app
- **Web Gemini/Perplexity streaming**: SSE streaming support for Gemini and Perplexity in web
- **LLM classifier**: Pro+ model routing via intelligent request classification
- **Dynamic context window**: Per-model context window sizing based on model catalog
- **Scheduler store wiring**: Full invoke wiring for scheduler commands in frontend
- **Connectors OAuth persistence**: OAuth tokens persisted to Supabase for connector integrations
- **Media Studio placeholder**: "Coming Soon" page replacing incomplete Media Studio UI

### Changed

- **println to tracing**: Replaced 100+ `println!`/`eprintln!` calls with structured `tracing` macros
- **Dead code cleanup**: Audited 70 `#[allow(dead_code)]` annotations; removed stale Rust dead code
- **Desktop `as any` removal**: Eliminated 19 `as any` casts from desktop TypeScript
- **Web type stubs**: Deleted or populated 7 unused web type stub files
- **Shared packages type sync**: Synchronized type definitions across `packages/types` and `packages/utils`
- **Mobile WebRTC types**: Fixed 5 `any` types in mobile WebRTC connection store
- **CSP nonce-based**: Replaced `unsafe-inline` with nonce-based Content Security Policy

### Security

- **MCP tools through ToolGuard**: All MCP tool executions now routed through ToolGuard validation — closes auto-approve bypass gap
- **Per-iteration budget check**: Autonomous loop enforces budget limits on every iteration, not just at start
- **API gateway audit**: Hardened Express API gateway and signaling server with input validation and rate limiting

## [1.1.4] - 2026-02-28

### Fixed

- **Stream timeout reliability**: Fixed `stream_watchdog_timeout` errors by properly propagating SSE keepalive events from LLM providers. Keepalive signals now prevent idle-timeout watchdogs from firing during long-running operations like image generation and extended thinking.
- **HTTP timeout configurations**: Extended streaming timeout from 60s to 300s, followup invoke timeout from 60s to 120s, and streaming tool loop timeout from 180s to 600s to accommodate slower media generation providers.
- **Model ID mismatches**: Corrected 7 model ID references across model catalog (claude-sonnet-4.5, gpt-5-pro, gpt-5.2-codex variants, grok-4) to match provider APIs.
- **Media generation providers**: Updated to latest model versions: Imagen 3 → Imagen 4, Stability AI v1 → v2beta, Runway gen3a_turbo → gen4_turbo, Veo 2 → Veo 3.1.
- **Database query injection**: Added SQL injection protection in `db_execute_batch` and `QueryBuilder` to sanitize batch operations.
- **Device polling legacy behavior**: Device poll endpoint now returns HTTP 410 (Gone) for deprecated clients, with proper deprecation messaging.
- **UI error messages**: Replaced 17 raw technical error messages in chat UI components with user-friendly messages via `formatErrorForChat()` utility. Now handles `stream_watchdog_timeout`, `rate_limit`, `invalid_api_key`, `timeout`, `network_error`, and other common issues.

### Security

- **Tauri filesystem capabilities**: Aligned write deny list with read deny list (19 entries total) to ensure consistent protection: `.docker`, `.npmrc`, `.pypirc`, `.netrc`, `.azure`, `.config/gh`, `.config/heroku`, `.config/op`, `.config/stripe` and 10 other sensitive paths.
- **Device link authentication**: Device link endpoint (`/api/device/link`) now requires valid JWT authentication to prevent unauthorized device registration.
- **Production error handling**: Error stack traces now hidden in production builds; "Web Development Mode" banner appears only in development to prevent information leakage.

### Changed

- **Extension integration**: Browser extension now wired into AGI execution loop with CDP (Chrome DevTools Protocol) as primary transport and fallback to extension bridge. Added 11 new `ExtensionMessage` variants and 14 new action methods for enhanced desktop automation.
- **Swarm idempotency**: Task decomposer now caches results with SHA-256 content hashing (1-hour TTL) and orchestrator tracks `spawned_subtask_ids` to prevent duplicate task dispatch in multi-agent workflows.
- **Model catalog**: Added `claude-sonnet-4.6` to all subscription tier lists. Updated pricing for GPT-5, DeepSeek R1, and other new models based on provider APIs.
- **API route timeouts**: All media generation routes (`/api/media/image/generate`, `/api/media/video/generate`, `/api/media/video/status`) now enforce `maxDuration = 60` seconds to handle long-running image/video generation operations.

### Added

- **Keepalive signal support**: New `keepalive: bool` field in `StreamChunk` struct to track provider heartbeat events (e.g., SSE comment lines, Anthropic `ping` events) without carrying content.
- **Friendly error formatting**: New `formatErrorForChat()` utility in `packages/utils/src/errors.ts` for consistent, user-facing error messages across desktop and web apps.
- **Model routing enhancements**: Intelligent model routing now respects subscription tiers for new models; pro tier includes `claude-sonnet-4.6`, max tier includes all new flagship models.

## Previous Releases

See git history for releases prior to 1.1.4.
