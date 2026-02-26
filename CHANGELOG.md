# Changelog

All notable changes to AGI Workforce are documented in this file.

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
