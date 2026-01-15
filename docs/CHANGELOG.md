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

## [1.0.3] - 2026-01-05

### Fixed

- Lazy initialize Stripe client to fix CI build
- Isolated web build step for better error visibility
- Repaired broken CI and release workflows

## [1.0.2] - 2026-01-04

### Changed

- Version bump for release workflow fixes
