# apps/mobile/src/features/agents

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile agent list/detail presentation, agent status display, and tool execution timeline UI.

## Rules

- Import agent UI through `@/src/features/agents`.
- Keep agent persistence and dispatch runtime state in approved stores/services, not in presentational components.
- Shared agent contracts should come from domain stores or shared packages instead of duplicated local shapes.
