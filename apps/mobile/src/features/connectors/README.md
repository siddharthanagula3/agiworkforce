# apps/mobile/src/features/connectors

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile connector catalog presentation and connector metadata used by connector screens.

## Rules

- Import connector UI and connector data through `@/src/features/connectors`.
- Connector provider setup flows should move into this domain before adding new provider-specific components.
- Cross-surface connector contracts should come from shared packages or API types when available.
