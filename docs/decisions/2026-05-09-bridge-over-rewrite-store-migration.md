# ADR: Bridge over rewrite for zustand store migration

## Status

Accepted — 2026-05-09.

## Context

Foundation Task 1.3 introduces `createStore` + `onChangeAppState` as the canonical state architecture (`packages/runtime/src/state/`, see `docs/architecture/foundation-2026.md` §2). At sprint start the desktop surface had 64 zustand stores; 12 of them carry the highest-traffic mutations (auth, app-mode, settings, model selection, MCP, memory, billing-usage, unified-chat). Rewriting all 64 in one sprint would invalidate 1,622 desktop tests, every consumer component, and every existing test fixture. We needed a path that adopted the new primitive without that breakage.

Two paths were on the table:

1. **Rewrite**: replace each zustand `create()` call with `createStore`, refactor every consumer to read from the new store, update every test fixture.
2. **Bridge**: keep the 12 zustand stores in place as the storage layer; add a thin `subscribe`-based bridge that forwards mapped fields into `appStateStore` on every change.

## Decision

We adopt the bridge path. `apps/desktop/src/stores/bridge/stateBridge.ts` wires the 12 priority zustand stores to `appStateStore`. Bridges use `Object.is`-style early returns so non-mapped mutations do not reach `appStateStore.setState` and do not trigger the §2 fan-out. The remaining 52 zustand stores are tagged `// TODO(task-1.3): migrate to packages/runtime/state` and will land progressively in Wave 5.8.

## Consequences

**Positive**

- Zero test breakage: 1,622 desktop tests pass unchanged.
- Zero consumer breakage: every existing component that reads from the bridged stores continues to work.
- Bridges add <1 ms per mutation (`tasks/research/exec/1.3-report.md` §"Architectural Decisions" item 1).
- The migration is incremental — Wave 5.8 can land stores one at a time as their owners review them.

**Negative**

- Two store representations per domain until Wave 5.8 finishes. Developers must remember to update both when a new field is added.
- The bridge layer is itself code that has to be maintained. Mitigation: bridges are thin, well-tested (`stateBridge.ts` covered indirectly by `appStateStore.test.ts` integration tests), and the layer goes away when Wave 5.8 completes.
- The "remaining 52" tag list is the source of truth for migration scope; if a store is added without the tag, the migration tracker drifts. Mitigation: a follow-up lint rule can enforce the tag on new zustand stores.

## References

- `docs/architecture/foundation-2026.md` §2.
- `tasks/research/exec/1.3-report.md` §"Stores Migrated (12)" and §"Stores Deferred — 52".
- `apps/desktop/src/stores/bridge/stateBridge.ts`.
