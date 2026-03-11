# Feature Blueprints Design

_2026-03-09 | Single source of truth for how every feature works end-to-end_

## Problem

Feature knowledge is fragmented across 15+ docs with overlapping, sometimes conflicting info. No document answers "how does Feature X work end-to-end?" with exact file paths, data flows, and dependencies.

## Solution

`docs/features/` directory with:
- `INDEX.md` — master index with feature matrix, store map, event registry, cross-deps
- 14 per-feature files, each covering: components, stores, hooks, Rust commands, event channels, API routes, data flow, component tree, IPC contracts, dependencies, known gaps, design decisions

## Features Covered

1. Chat, 2. Agentic Mode, 3. MCP Tools, 4. Voice, 5. Vision, 6. Browser Automation, 7. Terminal, 8. Files, 9. Memory, 10. Connectors, 11. Scheduling, 12. Settings, 13. Billing, 14. Auth

## Approach

7 parallel exploration agents, each tracing 2 features through actual source code:
- Agent 1: Chat + Agentic Mode
- Agent 2: MCP Tools + Connectors
- Agent 3: Voice + Vision
- Agent 4: Browser Automation + Terminal
- Agent 5: Files + Memory
- Agent 6: Scheduling + Settings
- Agent 7: Billing + Auth

Each agent reads real files, follows real imports, maps real invoke() calls. No guessing from docs.

## Template

Each feature file follows a standard template: Where It Lives, Data Flow, Component Tree, IPC Contracts, Dependencies, Known Gaps, Design Decisions.
