# Changelog

All notable changes to AGI Workforce are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security Audit Fixes (2026-01-06)

#### Critical Fixes

- **MCP Credential Commands**: Added `mcp_set_credential` and `mcp_delete_credential` commands to properly store/delete credentials in OS keyring (`mcp.rs:637-672`)
- **MCP Tool ID Format**: Fixed tool ID format from `mcp__server__tool__` to `mcp__server__tool` - removed trailing double underscore (`mcp.rs:396,427`)
- **Tauri Command Registration**: Added missing commands to `generate_handler!` macro in `lib.rs`

#### High Priority Fixes

- **Auth Token Clearing on Logout**: Tokens are now properly cleared from OS keyring and localStorage/sessionStorage before sign out (`supabaseAuth.ts:599-612`)
- **Async Mutex in Learning System**: Replaced blocking `std::sync::Mutex` with `tokio::sync::RwLock` to prevent async runtime blocking (`learning.rs:1-130`)
- **Settings Persistence**: Settings are now persisted to disk via `settings.json` with new `settings_load_from_disk` command (`settings.rs:91-151`)
- **MCP Server Logs**: Added placeholder implementation for `mcp_get_server_logs` (full log buffer pending)

#### Medium Priority Fixes

- **SQLite WAL Mode**: Enabled Write-Ahead Logging and optimized pragmas for better concurrency (`lib.rs:102-109`)
  - `journal_mode = WAL`
  - `synchronous = NORMAL`
  - `foreign_keys = ON`
  - `cache_size = -64000` (64MB)
- **AGI Timeout**: Added 5-minute absolute timeout to AGI reasoning loop to prevent infinite loops (`core.rs:470-513`)
- **Plan Tier Hierarchy**: Fixed incomplete plan hierarchy to include all tiers: free, hobby, pro, max, enterprise (`supabaseAuth.ts:764-777`)
- **Promise Error Handling**: Changed `Promise.all` to `Promise.allSettled` for cleanup operations to prevent memory leaks (`index.tsx:315-324`)

### Changed

- Learning system now uses async-safe `tokio::sync::RwLock` instead of `std::sync::Mutex`
- Settings are persisted to `~/.config/agiworkforce/settings.json`
- MCP credentials stored with service name `agiworkforce-mcp-{server_name}`

### Added

- New Tauri command: `settings_load_from_disk`
- New Tauri command: `mcp_set_credential`
- New Tauri command: `mcp_delete_credential`
- AGI event: `agi:goal:timeout` emitted when reasoning loop exceeds 5 minutes

## [1.0.6] - 2026-01-21

### Added

- **"Always Use Agent Mode" Setting**: New option in Chat Preferences to automatically enable agent mode with tools for all messages, not just action requests (`settingsStore.ts:55-56`)
- **Intelligent Model Router**: New `modelRouter.ts` module that intelligently routes messages to optimal models based on task type (coding, reasoning, general, agentic, multimodal), capabilities, and cost
- **Task Classification**: Local keyword-based task classification with fallback to LLM classification for ambiguous requests
- **Auto Mode Tiers**: Three auto modes - `auto-economy` (cheapest viable), `auto-balanced` (quality/cost ratio), `auto-premium` (best available)
- **Latest 2026 Models**: Added support for GPT-5.2, Gemini 3 (Pro/Flash), Claude Opus 4.5, Claude Sonnet 4.5, Grok 4.1, DeepSeek V3.2, Qwen 3

### Changed

- Simplified chat-first architecture - removed visual workflow components in favor of chat-based interaction
- Settings store migrated to v3 with `alwaysUseAgentMode` setting
- Model selection now validates capabilities before routing (vision, tools, thinking, computer use)
- QuickModelSelector updated with auto mode UI (Economy/Balanced/Premium)

### Updated Dependencies

- React 19.2.3
- Vite 7.3.1
- Tauri CLI 2.9.6
- Playwright 1.57.0
- TypeScript 5.9.3
- Zustand 5.0.9
- Framer Motion 12.23.26
- Lucide React 0.562.0
- Vitest 4.0.17

## [1.0.5] - 2026-01-10

### Added

- **Global Deployment**: Signaling server deployed to Fly.io for worldwide WebSocket connectivity
- **Auto-Updater**: Desktop app now supports automatic updates via Tauri updater plugin with signed releases
- **Updater Public Key**: Added Ed25519 public key for verifying update signatures

### Changed

- CSP updated to allow connections to `agiworkforce-signaling.fly.dev`
- Signaling server WebSocket URL configurable via `VITE_SIGNALING_HTTP_URL` environment variable
- Connection store improved with better error handling for signaling failures

### Fixed

- WebSocket connection stability improvements
- Pairing code generation now uses cryptographically secure random values

## [1.0.4] - 2026-01-07

### Added

- **Multi-Provider LLM Routing**: Unified routing for OpenAI, Anthropic, Google, DeepSeek, xAI, and Ollama
- **Browser Automation**: Chrome DevTools Protocol (CDP) integration for web automation
- **Visual Workflow Builder**: @xyflow/react integration for drag-and-drop workflow creation
- **Enhanced Terminal**: Full terminal emulation with xterm.js v6, including WebGL rendering and search

### Changed

- Account store refactored with proper tier loading states
- Model metadata centralized in `constants/llm.ts` with capability flags
- Provider configuration simplified for subscription-only model

### Fixed

- Stripe price ID mapping using strict lookup instead of substring matching
- Auth token clearing on logout now properly clears OS keyring

## [1.0.3] - 2026-01-05

### Fixed

- Lazy initialize Stripe client to fix CI build
- Isolated web build step for better error visibility
- Repaired broken CI and release workflows

## [1.0.2] - 2026-01-04

### Changed

- Version bump for release workflow fixes
