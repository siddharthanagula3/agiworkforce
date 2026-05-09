# ADR: Strategic-acquisition optionality (shared packages stay independently shippable)

## Status

Accepted — 2026-05-09.

## Context

The platform may, at some point, find itself in a position where parts of it have value to acquirers independent of the whole. Examples that have come up in informal discussion: `@agiworkforce/llm-runtime` as a standalone retry/watchdog library, `@agiworkforce/runtime` (state + queue + context) as a state library competing with zustand or jotai, the worker direction-inversion protocol as an off-the-shelf SDK for cross-device agent fleets.

Maintaining acquisition optionality has a real architectural cost. Internal-only dependencies between packages (e.g. `@agiworkforce/llm-runtime` reaching into `@agiworkforce/auth` for telemetry) make the package non-portable. Conversely, every package optimised for portability adds boilerplate (clean `package.json` exports, no implicit globals, explicit interface boundaries).

Two stances:

1. **Pure internal**: optimise for monorepo ergonomics. Allow shared utilities to grow tendrils. Solve portability later if/when it matters.
2. **Independently shippable**: each shared package has clean `exports`, zero internal-only dependencies, dependency-injection where coupling is unavoidable.

## Decision

We optimise for independent shippability. Architectural patterns this drives:

- `@agiworkforce/llm-runtime` declares only `@agiworkforce/types` (for `models.json`) as an internal dependency. No telemetry, auth, or state imports.
- `LatchedHeaderStore` (§5) is per-process, not persisted — persistence would couple it to a storage backend.
- `WorkSecret` codec lives in `types.ts` as functions, not a class — the codec round-trips cleanly across any FFI without `instanceof` semantics. (See `2026-05-09-worksecret-codec-in-types.md`.)
- `dispatch.ts` accepts `rotateKey: () => Promise<...>` as injection rather than importing Supabase. (See `2026-05-09-dispatch-supabase-rpc-injection.md`.)
- `@agiworkforce/runtime` (state + queue + context) has zero application-specific imports — `AppStateStore.ts` is generic over its domain shape.

## Consequences

**Positive**

- Each shared package can be open-sourced or sold without ripping out internal coupling.
- Engineers consuming the packages from a new surface (a hypothetical JetBrains plugin) get clean, documented entry points.
- Tests are easier: portability discipline produces well-defined input/output contracts, which test fixtures naturally exercise.
- The differentiator-3 (cross-provider continuity) story is portable: the `repairMessageHistory` toolkit could ship as part of a standalone provider-normalisation package.

**Negative**

- Cross-package work is sometimes more verbose. A function in `@agiworkforce/llm-runtime` that wants telemetry must accept a callback rather than import the telemetry module. Mitigation: callbacks are declared once at package boundary and threaded internally.
- Some tempting consolidations are off the table. Inlining `appStateStore` reads inside `withRetry` would simplify a few call sites; we resist because it would couple the runtime package to the application's state shape.
- The discipline must be enforced in code review. A naked `import { appStateStore } from '../../apps/desktop/...'` in a shared package would silently break portability. Mitigated: lint rule restricts shared packages to importing only from `packages/*` and `node:`.

## References

- `docs/architecture/foundation-2026.md` §10 row 5.
- ADRs `2026-05-09-worksecret-codec-in-types.md`, `2026-05-09-dispatch-supabase-rpc-injection.md`, `2026-05-09-sticky-retry-context.md`.
- Team config description.
