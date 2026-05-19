# Autofill Pre-Migration Audit

Date: 2026-05-18
Branch: `claude/phase6-chrome-2026-05-18`

## File under audit

`apps/extension/src/jobAutofill.runtime.js`

## 1. Binary type

```
file apps/extension/src/jobAutofill.runtime.js
→ ASCII text
```

1,347 lines. Plain JavaScript source (not a binary blob). Header:

```js
/* eslint-disable no-undef */
const DEFAULT_DELAY_MS = 120;
```

**Verdict: self-contained inlined bundle.** All autofill logic (LinkedIn,
Lever, Workday, generic form-filler, detector, platform dispatch) is compiled
into this single file. The `autofill/` TypeScript source files were the
pre-bundle source; this `.js` contains their output.

## 2. Relative path scan

```
strings jobAutofill.runtime.js | grep -E "autofill/|\./|\.\.\/"
→ (0 results)
```

No relative `./` or `../` path strings anywhere in the file. The only
"path-like" strings are data values (`sponsorship`, `required`, etc.).

## 3. Import / require scan

```
grep -E "^import|^export |require\(" jobAutofill.runtime.js | head -10
→ line 82:  export function detectPlatformFromUrl(url) {
→ line 1259: export async function runPlatformJobAutofill(...)
```

Zero `import` statements. Zero `require()` calls. The file is a **flat
ESM-export bundle** — two named exports at the bottom, everything else
inlined as plain JS functions in module scope.

## 4. jobAutofill.ts wrapper audit

`src/jobAutofill.ts` imports:

```ts
import { runPlatformJobAutofill as runPlatformJobAutofillRuntime } from './jobAutofill.runtime.js';
```

This import is by **filename** (`jobAutofill.runtime.js`), not by directory.
Moving `autofill/*.ts` source files has no effect on this import. The `.d.ts`
declaration file (`jobAutofill.runtime.d.ts`) is co-located with the `.js`
and must stay with it.

## 5. autofill/ source files

Four TypeScript files — all source-only, not referenced at runtime:

- `src/autofill/detector.ts`
- `src/autofill/filler.ts`
- `src/autofill/lever.ts`
- `src/autofill/linkedin.ts`

Test coverage: `__tests__/jobAutofill.runtime.test.ts` imports the runtime
binary directly (`../src/jobAutofill.runtime.js`), not the source files.
No test imports `autofill/detector`, `autofill/filler`, etc.

Verify what `autofill/*.ts` files import (relative depth check):

- `detector.ts` imports from `'../types'`
- `filler.ts` imports from `'../types'`
- `lever.ts` imports from `'../types'`, `'./filler'`, `'./detector'`
- `linkedin.ts` imports from `'../types'`, `'./filler'`, `'./detector'`

When moved to `features/content/autofill/`, `../types` becomes `../../types`.
Same-dir cross-imports (`./filler`, `./detector`) remain unchanged.

## Recommendation: SAFE TO MIGRATE

**Conditions:**

1. `jobAutofill.runtime.js` and `jobAutofill.runtime.d.ts` stay at
   `src/jobAutofill.runtime.*` (not moved).
2. `jobAutofill.ts` stays at `src/jobAutofill.ts` (not moved — it's imported
   by `content.ts` which is a frozen entry point).
3. Move only: `src/autofill/{detector,filler,lever,linkedin}.ts`
   → `src/features/content/autofill/{detector,filler,lever,linkedin}.ts`
4. Update relative imports in moved files: `'../types'` → `'../../types'`.
5. Same-dir cross-imports (`'./filler'`, `'./detector'`) stay unchanged.
6. No shims needed at old `autofill/` paths (zero test imports, zero
   external callers — the directory is only referenced internally).
7. Update barrel `features/content/index.ts` if it exists, or add
   `features/content/autofill/index.ts`.

**Risk: LOW.** The autofill TypeScript files are compile-time only —
the runtime binary is fully decoupled from their on-disk location.
