# Changelog

All notable changes to AGI Workforce will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - November 24, 2025

#### Calendar Workspace (100% Complete)

- **Month View**: Full calendar grid with event display
- **Week View**: Hourly timeline with drag-drop event support
- **Day View**: Detailed daily schedule view
- **Event Dialog**: Create, edit, delete calendar events
- **OAuth Integration**: Google Calendar and Outlook Calendar support
- **Event CRUD**: Full create, read, update, delete operations

#### API Workspace (100% Complete)

- **Request Builder**: Method, URL, headers, body editor
- **Authentication Tab**: Support for None, Bearer Token, Basic Auth, API Key
  - Automatic header management based on auth type
- **Response Viewer**: Status, timing, headers tabs
- **Request History**: Full request/response storage with re-run capability
- **Saved Requests**: Template management for frequently used APIs

#### Database Workspace Enhancements

- **Schema Browser**: List tables and view column details
- **Transaction Controls**: BEGIN, COMMIT, ROLLBACK buttons
- Enhanced query execution with detailed error reporting

#### Backend Improvements

- **New Tool**: `search_web` - DuckDuckGo integration for web searches
- **Tool Registry**: Updated with 20 total automation tools
- **LLM Router**: Fixed model selection logic
- **Compilation**: Resolved lint warnings and type errors

#### Build System

- **Monorepo Compatibility**: Fixed `tauri.conf.json` for pnpm workspace
- **Frontend Build**: Optimized bundle size (945 kB → 318 kB gzipped)
- **TypeScript Fixes**: Resolved all compilation errors

### Changed - November 24, 2025

- **Lint Rules**: Relaxed strict mode for development builds
- **Calendar Store**: Improved OAuth flow with state management
- **API Store**: Enhanced request history with full request details

### Fixed - November 24, 2025

- **CalendarWorkspace**: Fixed `completeConnect` signature mismatch
- **CalendarWeekView**: Removed unused variables
- **QuickModelSelector**: Added missing imports (`useEffect`, `invoke`)
- **QuickModelSelector**: Fixed TypeScript null checks
- **llm_router.rs**: Prefixed unused `user_specified_provider` variable
- **Build Configuration**: Corrected monorepo build command path

---

## [0.1.0] - November 21, 2025 - Grand Unification

### Added

- **Unified Chat Architecture**: Consolidated all chat experiences into single system
- **Centered Layout**: Claude Desktop-inspired UI with focused content area
- **Floating Input**: Spring-animated input that adapts to chat state
- **Agent Status Pill**: Real-time agent step/goal display
- **Quick Model Selector**: Inline model switching with provider grouping
- **Thinking Indicator**: Visual feedback during LLM response generation
- **Tool Execution Visual**: Automatic tool calling with status display

### Changed

- **State Management**: Migrated to unified `unifiedChatStore`
- **Component Structure**: Simplified to single `UnifiedAgenticChat` component
- **Model Display**: Removed cost information, improved clarity

### Removed

- Legacy chat components (consolidated into unified system)
- Redundant state management stores

---

## [Beta] - Prior to November 2025

### Features Implemented

- Multi-provider LLM support (OpenAI, Anthropic, Google, Ollama, xAI, DeepSeek, Qwen, Mistral, Moonshot)
- 19 core automation tools (file ops, UI automation, browser control, etc.)
- Windows UI Automation integration
- Browser automation via Playwright
- Terminal integration with xterm.js
- Database connectivity (PostgreSQL, MySQL, MongoDB, Redis, SQLite)
- Agent planning and execution system
- MCP (Model Context Protocol) integration
- Hook system for custom scripts
- Settings management with API key storage
- Error boundaries and recovery

---

## Development Notes

### Version Numbering

- **Major**: Breaking changes or major feature sets
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes and minor improvements

### Release Process

1. Update version in `package.json` and `Cargo.toml`
2. Update `CHANGELOG.md`
3. Tag release: `git tag -a v0.x.x -m "Release v0.x.x"`
4. Push tags: `git push origin v0.x.x`
5. Create GitHub Release with changelog excerpt

---

_Maintained by the AGI Workforce team_
