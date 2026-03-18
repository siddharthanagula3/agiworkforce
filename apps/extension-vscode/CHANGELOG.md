# Changelog

All notable changes to the AGI Workforce VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.2.0] - 2026-03-17

### Added

- Workspace-aware context in every chat prompt (diagnostics, git status, open files, structure)
- @filename references in sidebar chat with fuzzy-matching dropdown and keyboard navigation
- Per-file accept/reject for agent mode edits (replaces batch-only Apply All)
- New Conversation command (Cmd+Shift+Alt+N) with sidebar reset
- Share Diagnostics button in sidebar header for one-click error analysis
- Model Performance Dashboard (request count, avg latency, tokens, estimated cost per model)
- Model metrics tracking persisted across sessions

### Changed

- Sidebar system prompt now includes full workspace context from ContextBuilder
- Chat participant (@agi) system prompt enriched with diagnostics, git, and workspace structure
- Agent mode includes rich context alongside WorkspaceIndexer output

## [0.1.0] - 2026-02-27

### Added

- @agi chat participant with /explain, /fix, /refactor, /tests, /docs, /model commands
- Sidebar chat panel with AGI Workforce dark theme
- Agent mode with multi-file editing, diff preview, and batch undo
- Inline completions (ghost-text, opt-in)
- CodeLens provider (Ask AI, Tests, Docs above functions)
- Code review with AI-powered diagnostics
- Terminal integration (run, explain, suggest commands)
- Error explainer and Ask About Code features
- Desktop bridge for AGI Workforce desktop app integration
- Support for 15+ LLM models (GPT, Claude, Gemini, DeepSeek, Perplexity, and more)
- Smart auto-routing: auto-economy, auto-balanced, auto-premium
- SSE streaming with cancellation support
- Fallback to VS Code built-in LM when API unavailable
- SecretStorage-based API key management
- Status bar model indicator
- Conversation history with tree view
