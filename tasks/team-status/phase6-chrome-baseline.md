# Phase 6 Chrome Extension — Status

Branch: `claude/phase6-chrome-2026-05-18`
Worktree: `/Users/siddhartha/Desktop/agiworkforce-phase6-chrome`

## Baseline Gates (pre-reorg)

- lint:extension: PASS (0 warnings)
- build: PASS (7 chunks, byte-identical output across runs)
- tests: 22 files / 614 tests PASS
- tsc --noEmit: PASS

## Step 3: Skeleton Created

New directories under `apps/extension/src/`:

- `core/` — placeholder barrel (message bus, background state)
- `features/popup/` — placeholder barrel
- `features/side-panel/` — placeholder barrel
- `features/content/` — placeholder barrel
- `features/background/` — placeholder barrel
- `features/native-bridge/` — PILOT: pairing.ts moved here
- `platform/` — placeholder barrel
- `integrations/` — placeholder barrel
- `data/` — placeholder barrel
- `ui/` — placeholder barrel

## Step 4: Pilot — native-bridge / pairing

File moved: `src/pairing.ts` → `src/features/native-bridge/pairing.ts`

Barrel: `src/features/native-bridge/index.ts` re-exports all from pairing.

Shim: `src/pairing.ts` replaced with a single `export * from './features/native-bridge/pairing'`
so existing test imports (`../src/pairing`) and `popup.ts` (`./pairing`) continue to resolve
with zero changes to those files.

Manifest: no changes (no manifest-referenced paths touched).

## Post-pilot Gates

- lint:extension: PASS
- build: PASS (identical chunk hashes — 99 modules vs 98 baseline, +1 from barrel)
- tests: 22 files / 614 tests PASS
- tsc --noEmit: PASS
- dist artifacts verified: background.js, content.js, popup.js, side_panel.js, popup.html, side_panel.html

## Recommended Next Pilots

In priority order (safest → most impactful):

1. `features/native-bridge/` — add `src/pairing.ts`-adjacent files:
   - `providerStreamClient.ts` → `features/native-bridge/provider-stream-client.ts` (HTTP bridge to desktop)
   - `sendQueue.ts` → `features/native-bridge/send-queue.ts`
     Both are isolated, import only from `@agiworkforce/runtime` + chrome APIs. Same shim pattern.

2. `features/content/` — move inPagePanel cluster (5 files, all imported only from content.ts):
   - `inPagePanel/setup.ts`, `launcher.ts`, `panel.ts`, `panelStyles.ts`, `pageActions.ts`
     Already in a subdirectory — simplest move is to rename `inPagePanel/` → `features/content/in-page-panel/`
     and update the single import in `content.ts`.

3. `features/content/` — move platform helpers:
   - `platform-prompts.ts` → `features/content/platform-prompts.ts`
   - `nlweb.ts` → `features/content/nlweb.ts`
   - `page-metadata.ts` → `features/content/page-metadata.ts`
   - `dom-helpers.ts` → `features/content/dom-helpers.ts`
     These are imported from `content.ts` only. Shim pattern.

4. `features/background/` — move background handlers (already in `background/` subdir):
   - `background/shortcuts.ts` → `features/background/shortcuts.ts`
   - `background/tasks.ts` → `features/background/tasks.ts`
     Then update the 2 imports in `background.ts`.

5. **STOP before touching `background.ts`, `content.ts`, `popup.ts`, `side_panel.ts` entry points.**
   Those are referenced in `vite.config.ts` rollupOptions.input — move only after all their
   dependencies are stable in the new tree.

## Risk Log

- NONE encountered. Zero behavior change confirmed.
- `jobAutofill.runtime.js` is a pre-built binary (not TypeScript source); do not move.
- `jobAutofill.runtime.d.ts` is its type declaration; keep co-located.
