# Phase 4 — `@agiworkforce/runtime` Split Proposal

Generated: 2026-05-18

## Today's shape

`packages/runtime/src/index.ts` re-exports a mix of universal and Node/Tauri-only symbols. The barrel transitively imports `node:async_hooks` (via `context/agentContext.ts`), forcing the mobile bundle to ship a polyfill at `apps/mobile/lib/polyfills/async_hooks.cjs` resolved via `apps/mobile/metro.config.js`.

The barrel also exports the `appStateStore` singleton (and 16+ symbols from `state/`) even though only **2 desktop files** in the entire repo consume them.

`packages/runtime/src/desktop-index.ts` is a parallel barrel aliased by desktop's Vite config (`apps/desktop/vite.config.ts:293`). It already omits `agentContext` and `state` — so desktop has been doing a manual escape hatch since Wave 1. This proposal generalizes that escape hatch.

## Proposed shape

Three entry points in `packages/runtime/`:

```
packages/runtime/
├── src/
│   ├── index.ts          ← UNIVERSAL (no Node built-ins). default entry.
│   ├── node.ts           ← Node/Tauri-only (NEW). subpath entry.
│   ├── desktop-index.ts  ← legacy alias kept for desktop's vite.config.ts
│   └── ... (existing modules unchanged)
└── package.json
    "exports": {
      ".": "./src/index.ts",
      "./node": "./src/node.ts",
      "./desktop": "./src/desktop-index.ts" (NEW, alias for legacy alt-barrel)
    }
```

### `index.ts` after split — UNIVERSAL exports only

```ts
// Detection
export { RuntimeEnv, isTauri, isCloudWeb, isTest, getRuntimeEnv } from './detect';

// Command routing
export { command, commandWithWarning } from './command';
export type { CommandResult } from './command';

// Errors
export { DesktopRequiredError, createDesktopPreferredWarning } from './errors';
export type { DesktopPreferredWarning } from './errors';

// Capability registry
export { resolveCommandCapability } from './registry';

// Event bus
export { listen, once, emit } from './events';
export type { EventCallback, UnlistenFn } from './events';

// HTTP
export { routeToCloud } from './http';

// Queue
export {
  createMessageQueue,
  createWebStorageAdapter,
  createKvStorageAdapter,
  LANE_CAP,
  PRIORITY_ORDER,
  QueueDequeueRaceError,
  QueueFullError,
} from './queue';
export type {
  ContentBlock,
  CreateMessageQueueOptions,
  EditablePromptInputMode,
  MessageQueue,
  PastedContent,
  PopAllEditableResult,
  PromptInputMode,
  QueueListener,
  QueuePriority,
  QueueStorageAdapter,
  QueuedCommand,
  SyncKvStore,
} from './queue';
```

### `node.ts` after split — Node/Tauri-only exports

```ts
// AsyncLocalStorage context (uses node:async_hooks)
export {
  getAgentContext,
  runWithContext,
  deriveChildContext,
  reestablishContextInWorker,
} from './context';
export type { AgentContext, AgentOrigin } from './context';

// Central state architecture (canonical PlanTier + appStateStore)
export {
  createStore,
  appStateStore,
  onChangeAppState,
  onFanOutError,
  registerApiCacheInvalidator,
  registerTelemetryHandler,
  registerPersistenceHandler,
  registerModelSwitchListener,
  MAX_FANOUT_DEPTH,
  initialAppState,
  initialAuthState,
  initialChatState,
  initialSettingsState,
  initialSubscriptionsState,
  initialMcpState,
  initialMemoryState,
} from './state';
export type {
  Store,
  Listener,
  OnChange,
  FanOutError,
  CircularFanOutError,
  AppStateTelemetryEvent,
  ModelSwitchEvent,
  AppState,
  AuthState,
  ChatState,
  SettingsState,
  SubscriptionsState,
  McpState,
  MemoryState,
} from './state';

// Re-export from types for convenience
export type { PlanTier } from '@agiworkforce/types';
```

### Migration of consumers

Two TS files need to update their import from `@agiworkforce/runtime` to `@agiworkforce/runtime/node`:

1. `apps/desktop/src/lib/skillLoader.ts`
2. `apps/desktop/src/stores/bridge/stateBridge.ts`

That's it.

Mobile cleanup:

- Delete `apps/mobile/lib/polyfills/async_hooks.cjs`
- Remove the resolver entry from `apps/mobile/metro.config.js` (the `resolveRequest` branch that maps `node:async_hooks`)

### Why this is safe

1. **No new symbols, no removed symbols.** Backward-compat is preserved at the package level — the universal barrel keeps re-exporting everything that's universal. The Node-only barrel exposes everything that was previously top-level but is now subpath.
2. **No consumer of Node-only symbols outside desktop's own code** — `grep` proves this. The 2 desktop files we'll migrate are colocated and already in the repo's main desktop tree.
3. **Mobile bundle improves** — Metro no longer needs the polyfill because `node:async_hooks` is never reached from the universal entry.
4. **Web bundle improves** marginally (same reason — fewer Node-only modules to tree-shake).
5. **Desktop bundle is unchanged** — the Vite alias to `desktop-index.ts` continues to work; if anything, we can collapse `desktop-index.ts` to re-export from both `./index.ts` + `./node.ts` for symmetry, but that's optional in Phase 4.

## Step 5 acceptance criteria

After the split commit:

| Check                                                                     | Expected                                                                                                                                                                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @agiworkforce/runtime typecheck`                           | GREEN                                                                                                                                                                                                                  |
| `pnpm --filter @agiworkforce/runtime test` (5 files, 116 tests)           | GREEN                                                                                                                                                                                                                  |
| `pnpm --filter @agiworkforce/runtime build`                               | GREEN                                                                                                                                                                                                                  |
| Importing `appStateStore` from `@agiworkforce/runtime` (universal barrel) | TS2305 error — `appStateStore` not exported. Consumers must use `@agiworkforce/runtime/node`. (This is the intended breaking change for state — but only 2 desktop consumers exist, both migrated in the same commit.) |
| `apps/desktop` typecheck after the migration commit                       | GREEN                                                                                                                                                                                                                  |
| `apps/mobile` Metro bundle (`npx expo export --platform ios`)             | GREEN, no async_hooks polyfill referenced                                                                                                                                                                              |
| `apps/web` build (`pnpm --filter @agiworkforce/web build`)                | GREEN (no-worse-than-baseline)                                                                                                                                                                                         |

## Open question for founder

Question: After Phase 4 Step 5 makes `appStateStore` only available via `@agiworkforce/runtime/node`, the universal `@agiworkforce/runtime` barrel no longer exposes it. If a future surface (e.g., extensions, where the runtime is V8 not Node) ever wanted to consume `appStateStore`, that surface couldn't use the universal entry. Two paths:

- **Path X (recommended):** Keep `appStateStore` Node-only. Surfaces that need cross-process state use the existing `stateBridge` (desktop) or surface-local stores (mobile MMKV, web localStorage).
- **Path Y:** Refactor `state/AppStateStore.ts` to not depend on the singleton being co-located with `agentContext`. The state module itself uses no Node built-ins; it's only "tainted" by being colocated. If we keep state in the universal barrel and only `agentContext` in `node.ts`, the polyfill goes away and mobile/web get full state access from the universal entry. **This is structurally cleaner and only marginally more work.**

Path Y is what the founder's directive language strongly suggests:

> `runtime/src/context/agentContext.ts` and `runtime/src/state/*` are Tauri/Node-only

But the directive's reasoning was that they share the polyfill graph. Now we know state by itself doesn't. So:

**Updated Step 5 plan: do Path Y.**

- `index.ts` (universal): detect, command, events, errors, registry, queue, http, **state**
- `node.ts` (Node/Tauri-only): **only agentContext + reestablishContextInWorker + AgentContext + AgentOrigin**
- The 2 desktop consumers of `appStateStore` and friends keep importing from `@agiworkforce/runtime` (universal) and no migration is required for them.
- We still delete the mobile polyfill because `node:async_hooks` is now isolated in `node.ts`.

This is cleaner and lower-risk. The supervisor will SendMessage the founder before executing Step 5 to confirm Path Y is acceptable.
