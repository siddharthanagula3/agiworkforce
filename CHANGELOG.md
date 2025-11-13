# Changelog

All notable changes to AGI Workforce are documented in this file.

## [1.2.0] - 2025-11-13

### Major Update: Latest LLM Models (November 2025)

**Summary:** Updated all LLM providers to use the latest models available as of November 2025, providing significant improvements in code generation, reasoning, and task execution.

#### Added
- **GPT-5** (OpenAI) - Released August 2025, most capable general model
- **Claude Sonnet 4.5** (Anthropic) - Released September 2025, 77.2% SWE-bench (best coding model)
- **Claude Opus 4** (Anthropic) - Deep reasoning with extended thinking
- **O3** (OpenAI) - Advanced reasoning model
- **Gemini 2.5 Pro** (Google) - 1M token context window
- **Gemini 2.5 Flash** (Google) - Fast responses with 1M context
- **Llama 4 Maverick** (Ollama) - 1M context, FREE local inference
- **DeepSeek V3** (DeepSeek) - Coding specialist with 64K context
- **DeepSeek Coder V3** (Ollama) - Local coding specialist
- **Mistral Large 2** (Mistral) - 128K context window

#### Changed
- **Default provider** changed from OpenAI to Anthropic (Claude 4.5 best for coding)
- Updated context windows for all models
- Enhanced model selection UI with ⭐ indicators for recommended models
- Added model descriptions and performance notes

#### Model Performance
- **Best Coding:** Claude Sonnet 4.5 (77.2% SWE-bench)
- **Best Research:** Gemini 2.5 Pro (1M context)
- **Best Cost/Privacy:** Llama 4 Maverick (FREE, 1M context)
- **Best Reasoning:** Claude Opus 4 & O3
- **Best Real-Time:** Grok 4

#### Files Modified
- `apps/desktop/src/stores/settingsStore.ts` - Updated default models
- `apps/desktop/src/constants/llm.ts` - Added 15+ new model options with context windows
- `README.md` - Updated to reflect latest models
- `MODEL_UPDATE_NOV_2025.md` - Comprehensive model update documentation

## [1.1.0] - 2025-11-09

### Major Feature Update: Claude Code/Cursor-Like Developer Experience

**Summary:** Implemented 9 professional-grade features inspired by Claude Code and Cursor to provide world-class developer experience. All features are production-ready with zero errors.

#### Added

**Feature 1: Enhanced Command Palette with History**

- Recent commands tracking with localStorage persistence (max 10)
- Command execution frequency counter
- Relative timestamp display ("2m ago", "1h ago")
- Visual separation of recent vs. all commands
- Clock and TrendingUp icons for better UX
- File: `apps/desktop/src/utils/commandHistory.ts` (145 lines)

**Feature 2: Real-Time Token Counter**

- Live token usage visualization with progress bar
- Model-specific context windows for 20+ models
  - OpenAI (GPT-4: 128K tokens)
  - Anthropic (Claude 3.5 Sonnet: 200K tokens)
  - Google (Gemini 1.5 Pro: 2M tokens)
  - Ollama (Llama3: 8K, Mistral: 32K)
- Color-coded status indicators (safe/warning/danger/over-budget)
- Compact and full display modes
- Budget limit indicators
- File: `apps/desktop/src/components/Chat/TokenCounter.tsx` (336 lines)
- File: `apps/desktop/src/constants/llm.ts` (enhanced with MODEL_CONTEXT_WINDOWS)

**Feature 3: Git-Like Conversation Checkpoints**

- Save conversation state at any point
- One-click restore to previous states
- Timeline visualization (like git history)
- Transaction-safe restore with automatic rollback
- Branch support for experimenting with different approaches
- Database migration v13 for checkpoint storage
- Files:
  - `apps/desktop/src-tauri/src/commands/checkpoints.rs` (384 lines)
  - `apps/desktop/src-tauri/src/db/migrations.rs` (migration v13)

**Feature 4: Checkpoint Manager UI**

- Git-like timeline visualization
- Vertical timeline lines connecting checkpoints
- Create checkpoint dialog with name and description
- One-click restore with confirmation
- Delete checkpoint with confirmation
- Real-time checkpoint loading
- File: `apps/desktop/src/components/Chat/CheckpointManager.tsx` (353 lines)

**Feature 5: Always-Visible Status Bar**

- Real-time system indicators:
  - Current model and provider
  - Token usage with percentage
  - AGI system status (Idle/Planning/Executing/Error)
  - Network connectivity (Online/Offline)
  - Sending status with spinner
- Color-coded alerts
- Tooltips with detailed info
- Pulsing animations for active states
- File: `apps/desktop/src/components/Layout/StatusBar.tsx` (298 lines)

**Feature 6: Token Budget System with Alerts**

- Budget periods: daily, weekly, monthly, per-conversation
- Automatic alerts at 80%, 90%, 100% usage
- Visual alert panel with dismissal
- Period auto-reset logic
- LocalStorage persistence
- Cost tracking integration
- Files:
  - `apps/desktop/src/stores/tokenBudgetStore.ts` (207 lines)
  - `apps/desktop/src/components/Chat/BudgetAlertsPanel.tsx` (67 lines)

**Feature 7: Auto-Correction Error Detection**

- Detects 20+ error patterns:
  - TypeScript (property does not exist, cannot find name, etc.)
  - ESLint (unused variables, missing dependencies, etc.)
  - Rust (cannot find, type mismatch, etc.)
  - Syntax errors (unexpected token, missing semicolon, etc.)
  - Runtime errors (ReferenceError, TypeError, etc.)
- Automatic retry logic (max 3 attempts)
- Error classification and suggestions
- Success rate tracking
- Visual status indicator
- Files:
  - `apps/desktop/src/utils/autoCorrection.ts` (268 lines)
  - `apps/desktop/src/hooks/useAutoCorrection.ts` (186 lines)
  - `apps/desktop/src/components/Chat/AutoCorrectionIndicator.tsx` (150 lines)

**Feature 8: Platform-Aware Keyboard Shortcuts** (Verified Existing)

- Cmd on Mac, Ctrl on Windows/Linux
- Form element awareness (skip shortcuts in input fields)
- Scope support for context-specific shortcuts
- Global shortcut registry for debugging
- Helper functions for display formatting
- File: `apps/desktop/src/hooks/useKeyboardShortcuts.ts` (293 lines)

**Feature 9: AGI Progress Indicator with Timeline**

- Real-time step-by-step visualization
- Timeline UI showing all execution steps
- Step status tracking (pending → in-progress → completed/failed)
- Execution time display (milliseconds)
- Error messages for failed steps
- Expandable/collapsible details
- Auto-hide on completion (configurable delay)
- Event listeners for all AGI events:
  - `agi:goal:submitted`
  - `agi:goal:plan_created`
  - `agi:goal:step_started`
  - `agi:goal:step_completed`
  - `agi:goal:progress`
  - `agi:goal:achieved`
- File: `apps/desktop/src/components/AGI/ProgressIndicator.tsx` (509 lines)

#### Changed

- **ChatInterface Integration:**
  - Added BudgetAlertsPanel at top
  - Added ProgressIndicator for AGI visualization
  - Added TokenCounter with budget limits
  - Added StatusBar at bottom
  - Token usage tracking for budget system

- **Database Schema:**
  - Migration v13 added for conversation checkpoints
  - Tables: `conversation_checkpoints`, `checkpoint_restore_history`
  - Indexes for performance optimization

#### Documentation

- Created `IMPLEMENTATION_SUMMARY.md` documenting all 9 features
- Updated `README.md` with new features section
- Updated roadmap to reflect Q4 2025 completion

#### Quality Assurance

- ✅ Zero TypeScript errors
- ✅ Zero ESLint errors
- ✅ All Rust formatting checks passing
- ✅ Pre-commit hooks validated
- ✅ Pre-push hooks validated
- ✅ Production-ready code quality

#### Statistics

- **Total Lines Added:** ~3,000+ lines of production code
- **Files Created:** 11 new files
- **Files Modified:** 8 existing files
- **Commits Made:** 10 commits (9 features + summary)
- **All Tests:** Passing

## [Unreleased] - 2024-12

### Phase 4: AGI System Implementation (December 2024)

**Summary:** Complete AGI system implementation with chat integration, resource monitoring, and event system.

#### Added

- **Chat Integration**
  - Automatic goal detection in chat messages
  - Auto-submission of detected goals to AGI system
  - Frontend event listeners for real-time AGI progress updates
  - AGI event system (goal submitted, progress, achieved, error)

- **Resource Monitoring**
  - Real-time CPU monitoring using sysinfo crate
  - Process memory tracking with reservations
  - Network and storage usage tracking
  - Resource availability checking before execution

- **AGI Core System**
  - Complete AGI Core with 15+ tools
  - Knowledge base with SQLite persistence
  - Resource manager with real-time monitoring
  - AGI Planner with LLM-powered planning
  - AGI Executor with dependency resolution
  - Learning system for self-improvement

- **Code Quality**
  - Fixed compilation errors in AGI executor
  - Fixed ElementQuery usage (removed Default trait dependency)
  - Added app_handle field to AGICore for event emission
  - Fixed resource usage tracking

#### Documentation

- Created STATUS.md consolidating all implementation status files
- Updated README.md with current status and recent improvements
- Updated CLAUDE.md with AGI system information
- Removed 15+ redundant .md files, consolidated into STATUS.md

## [Unreleased] - 2025-11-06

### Phase 1-8: Comprehensive Remediation Complete

**Summary:** Reduced ~1,200 TypeScript errors to zero, eliminated 133 Rust clippy warnings, established production-ready CI/CD pipelines, and achieved 100% test pass rate for TypeScript tests.

### Added

**Phase 1: Critical Fixes**

- Fixed critical Rust UB in screen capture (RGBQUAD initialization)
- Created missing tsconfig.json files for packages/types and packages/utils
- Installed missing API gateway dependencies

**Phase 2: Version Pinning**

- .nvmrc (Node 20.11.0), .npmrc (engine-strict), rust-toolchain.toml (1.90.0)
- engines field in package.json (Node >=20.11.0 <23, pnpm >=8.15.0)

**Phase 6: Testing Infrastructure**

- Playwright E2E config and smoke tests
- Test coverage baseline (11.47% statement coverage)
- Test scripts: test:e2e, test:e2e:ui, test:smoke, test:coverage

**Phase 7: CI/CD Pipelines**

- Enhanced ci.yml with Rust checks and concurrency control
- Created build-desktop.yml for multi-platform Tauri builds
- Created test.yml with 4 parallel jobs (TypeScript, Rust, Coverage, E2E)
- Added CI status badges to README

**Phase 8: Developer Experience**

- pre-push hook with typecheck and cargo fmt --check
- VSCode settings.json and extensions.json
- apps/desktop/.env.example with environment templates

### Changed

**Phase 3: Dependencies**

- Node engine constraint: <21 → <23 (supports v22.x)

**Phase 4: TypeScript**

- exactOptionalPropertyTypes: true → false (Zustand compatibility)
- All code formatted with Prettier

**Phase 5: Rust**

- Fixed 133 clippy warnings (redundant closures, manual APIs, type conversions)
- Created Tauri 2.0 capabilities file (80+ permissions)

### Fixed

- TypeScript errors: ~1,200 → 0
- Rust clippy warnings: 133 → 0
- TypeScript test failures: 3 tests in codeStore.test.ts
- Rust test compilation errors in automation/input/tests.rs
- Husky v10 deprecation warnings

### Security

- Tauri 2.0 IPC permissions for 217 registered commands
- CI permissions blocks (contents: read)
- Frozen lockfiles enforced

## Statistics

| Metric               | Before     | After           |
| -------------------- | ---------- | --------------- |
| TypeScript Errors    | ~1,200     | 0               |
| Rust Clippy Warnings | 133        | 0               |
| TypeScript Tests     | Unknown    | 73/73 passing   |
| Rust Tests           | Unknown    | 232/241 passing |
| CI Pipeline          | Incomplete | Complete        |
| Test Coverage        | None       | 11.47% baseline |

## Performance

- CI time: 3-5 min (cached), 8-12 min (first run)
- Full build: 10-15 min (cached), 18-25 min (first run)
- Cache hit ratio: 80-90% expected
