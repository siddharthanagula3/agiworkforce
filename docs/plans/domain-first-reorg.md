---
status: PROPOSED — documentation-only commit, no code moves yet
owner: team-lead
last-updated: 2026-05-15
phase: D (Architecture cleanup, post-launch backlog)
---

# Domain-first reorganization plan

## Why

Three of the six shipping surfaces (`apps/desktop`, `apps/web`, `apps/mobile`)
currently mix two layouts:

- **Layer-first** — top-level directories named after _what kind of file_ they
  contain: `components/`, `hooks/`, `stores/`, `services/`, `lib/`, `data/`,
  `api/`. Everything for a single feature is sprinkled across all of those.
- **Domain-first** — top-level directories named after _what the user-visible
  feature is_: `chat/`, `billing/`, `connectors/`, `projects/`. Each contains
  its own `components/`, `hooks/`, `stores/`, etc.

`apps/web` has already partially converged on domain-first: `apps/web/features/`
has 11 domain folders (`analytics`, `billing`, `chat`, `connectors`, `media`,
`pages`, `projects`, `schedules`, `settings`, `support`, plus the chat-internal
sub-tree). The other directories at `apps/web/` (`components/`, `hooks/`,
`lib/`, `api/`, `core/`, `data/`, `handlers/`) still hold cross-feature code
that should be either pushed into a domain or pulled out to `packages/`.

The desktop frontend is the worst offender: `apps/desktop/src/components/`
has 76 subdirectories, most of which map cleanly to a single product domain.

The cost of the current layout is reviewer cognitive load — to make a
single feature change you read four-to-six unrelated directories — and a
weak coupling signal in CI: cross-domain regressions don't surface
because the file boundaries don't match the domain boundaries.

## Scope: which surfaces

This plan covers the three TypeScript app surfaces. Other surfaces are out
of scope because they already match a better convention:

| Surface                 | Reorg?       | Why / why not                                                                                                                                      |
| ----------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`              | YES (first)  | `features/` already exists; finish the migration.                                                                                                  |
| `apps/desktop`          | YES (second) | 76 component subdirs is the highest payoff per move.                                                                                               |
| `apps/mobile`           | YES (third)  | Smaller surface — 43 screens — natural fit, lower risk.                                                                                            |
| `apps/cli`              | NO           | Rust workspace; domain split is already by module (`tui/`, `agent.rs`, `models.rs`, `mcp/`, `runtime/`). Module structure work tracked separately. |
| `apps/extension`        | NO           | 15 files total in `dist/`; layer-first remains cheaper than domain-first at this size.                                                             |
| `apps/extension-vscode` | NO           | Single product surface (chat participant + commands); already grouped by feature in `src/`.                                                        |

## Target layout: web (`apps/web`)

The current shape:

```
apps/web/
├── api/           # 91 endpoint files mixed by URL not by domain
├── app/           # Next.js app router (kept as-is — router is the bind point)
├── components/    # shared "atoms" — most can be inlined or moved
├── core/          # mode detection, auth core, identity, env
├── data/          # supabase clients, schemas — keep as cross-domain
├── features/      # 11 domain folders — destination of the moves
├── handlers/      # request handlers — push into domain or app/api
├── hooks/         # 22 cross-cutting hooks — push into domain or @agiworkforce/utils
└── lib/           # 60-odd shared modules — split into domain vs platform
```

Target shape:

```
apps/web/
├── app/           # Next.js router only (page.tsx, layout.tsx, route.ts)
├── core/          # platform primitives — auth, env, supabase client, types
├── features/
│   ├── analytics/{components,hooks,stores,services,api,types,pages}/
│   ├── billing/{...}
│   ├── chat/{...}        # already structured this way
│   ├── connectors/{...}
│   ├── media/{...}
│   ├── projects/{...}
│   ├── schedules/{...}
│   ├── settings/{...}
│   ├── support/{...}
│   └── ui/               # genuinely cross-feature primitives only (buttons, modals)
└── shared/        # what `core/` is too narrow for — design tokens, env-detect
```

### Mapping (current → target)

| Current path                                 | Target                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/web/components/billing/*`              | `apps/web/features/billing/components/*`                                      |
| `apps/web/components/chat/*` (any remaining) | `apps/web/features/chat/components/*`                                         |
| `apps/web/components/connectors/*`           | `apps/web/features/connectors/components/*`                                   |
| `apps/web/components/ui/*` (generic)         | `apps/web/features/ui/*`                                                      |
| `apps/web/hooks/use-billing-*.ts`            | `apps/web/features/billing/hooks/*`                                           |
| `apps/web/hooks/use-chat-*.ts`               | `apps/web/features/chat/hooks/*`                                              |
| `apps/web/hooks/use-analytics-*.ts`          | `apps/web/features/analytics/hooks/*`                                         |
| `apps/web/api/v1/billing/*`                  | `apps/web/features/billing/api/*` (call-site only; routes stay in `app/api/`) |
| `apps/web/api/v1/chat/*`                     | `apps/web/features/chat/api/*`                                                |
| `apps/web/handlers/*-billing-*.ts`           | `apps/web/features/billing/handlers/*`                                        |
| `apps/web/lib/billing/*`                     | `apps/web/features/billing/lib/*`                                             |
| `apps/web/lib/chat/*`                        | `apps/web/features/chat/lib/*`                                                |
| `apps/web/lib/auth/*`                        | `apps/web/core/auth/*` (cross-domain — stays platform)                        |
| `apps/web/lib/supabase*`                     | `apps/web/core/supabase/*`                                                    |
| `apps/web/data/schemas/*`                    | `apps/web/core/schemas/*`                                                     |

Note: the Next.js `app/` router stays as-is. Routes call into
`features/<domain>/services/*` and `features/<domain>/handlers/*`.
Co-locating route files inside `features/` would force a non-trivial
Next.js routing rewrite (which is out of scope here).

## Target layout: desktop (`apps/desktop`)

Current `apps/desktop/src/`:

```
__tests__/  api/  components/  constants/  data/  features/  handlers/
hooks/  i18n/  integrations/  lib/  providers/  runtime/  services/
stores/  styles/  test/  themes/
```

`components/` has 76 subdirs. ~50 of these map to a clear product domain
(Agent, AgentCollaboration, AgentStatusMonitor, Analytics, Artifacts,
Auth, Automation, Browser, Calendar, Canvas, Cloud, Code, ComputerUse,
Connectors, Cowork, CustomInstructions, Database, Document, Documents,
DynamicCanvas, editing, Editor, Errors, Execution, ExecutionSidecar, …).
The remaining ~26 are cross-feature primitives (ErrorBoundary, UI atoms).

Target:

```
apps/desktop/src/
├── core/          # services/, runtime/, providers/, integrations/ — platform glue
├── features/
│   ├── agent/{components,hooks,stores,services}/
│   ├── analytics/{...}
│   ├── artifacts/{...}
│   ├── auth/{...}
│   ├── automation/{...}
│   ├── browser/{...}
│   ├── canvas/{...}
│   ├── chat/{...}     # UnifiedAgenticChat + ChatInterface live here
│   ├── code/{...}
│   ├── computer-use/{...}
│   ├── connectors/{...}
│   ├── cowork/{...}
│   ├── editor/{...}
│   ├── execution/{...}
│   └── … (~25 domains total)
├── shared/        # ErrorBoundary, design system, generic UI atoms only
└── App.tsx        # router/composition only
```

### Mapping (sample — full set in tracking spreadsheet)

| Current                                            | Target                                             |
| -------------------------------------------------- | -------------------------------------------------- |
| `apps/desktop/src/components/Agent/*`              | `apps/desktop/src/features/agent/components/*`     |
| `apps/desktop/src/components/Analytics/*`          | `apps/desktop/src/features/analytics/components/*` |
| `apps/desktop/src/components/UnifiedAgenticChat/*` | `apps/desktop/src/features/chat/components/*`      |
| `apps/desktop/src/hooks/useAgent*.ts`              | `apps/desktop/src/features/agent/hooks/*`          |
| `apps/desktop/src/stores/agentStore.ts`            | `apps/desktop/src/features/agent/stores/*`         |
| `apps/desktop/src/stores/chatStore.ts`             | `apps/desktop/src/features/chat/stores/*`          |
| `apps/desktop/src/services/agent/*`                | `apps/desktop/src/features/agent/services/*`       |
| `apps/desktop/src/services/auth/*`                 | `apps/desktop/src/core/auth/*`                     |
| `apps/desktop/src/components/ErrorBoundary.tsx`    | `apps/desktop/src/shared/ErrorBoundary.tsx`        |
| `apps/desktop/src/providers/*`                     | `apps/desktop/src/core/providers/*`                |
| `apps/desktop/src/integrations/*`                  | `apps/desktop/src/core/integrations/*`             |

## Target layout: mobile (`apps/mobile`)

Current:

```
apps/mobile/
├── app/         # Expo Router — drawer + tabs + stack
├── components/  # ~80 components
├── hooks/       # ~55 hooks
├── lib/         # Expo wrappers, secure store, biometric, MMKV, deepgram
└── …
```

Target:

```
apps/mobile/
├── app/           # Expo Router stays (file-based routing is the bind point)
├── core/          # MMKV, secure store, biometric, deepgram client — platform
├── features/
│   ├── chat/{components,hooks,services}/
│   ├── dispatch/{...}
│   ├── settings/{...}
│   ├── auth/{...}
│   ├── voice/{...}
│   └── …
└── shared/        # generic UI atoms, theme tokens
```

`app/` stays put — file-based router is the public contract Expo enforces.
Screen _implementations_ under `app/` should import from `features/<domain>/`
rather than from sibling `components/` paths.

## Recommended order (start small, validate, expand)

1. **Web first** (Wave A — already 60% there).
   - Move `apps/web/components/billing/*` → `apps/web/features/billing/components/*`
   - Move `apps/web/hooks/use-billing-*` → `apps/web/features/billing/hooks/*`
   - Verify: `pnpm --filter web build`, `pnpm --filter web test`, Playwright smoke.
   - Then chat, then one domain per PR — never two domains in one PR.
2. **Mobile second** (Wave B — smaller blast radius than desktop).
   - Same per-domain pattern; verify with `pnpm --filter @agiworkforce/mobile test`
     and `expo prebuild --no-install --clean` after each move (catches plugin paths).
3. **Desktop last** (Wave C — largest, highest blast radius).
   - One domain per PR. Tauri bundle smoke (`pnpm build:desktop` on macOS)
     plus E2E (`pnpm --filter desktop exec playwright test`) per move.

Hard rule: never combine "rename" + "behavior change" in the same PR.
That makes review impossible and breaks `git blame` archaeology.

## Rollout discipline

Per-PR checklist for every domain move:

1. **One domain per PR.** Title format: `chore(<surface>): move <domain> to features/`.
2. **No behavior changes.** Only `git mv`, import-path updates, and barrel
   `index.ts` additions. Reviewers compare `git log --follow` to verify.
3. **Run the surface's full test suite.** Vitest + Playwright (web/desktop),
   Jest (mobile). Zero new failures.
4. **Run typecheck across the whole workspace.** `pnpm typecheck:all` must
   stay clean — domain moves often expose hidden cross-surface imports.
5. **Update path aliases.** `tsconfig.base.json` `paths` keys and any
   `vite.config.ts` / `next.config.ts` alias entries.
6. **Update barrel re-exports.** Each domain gets a single `features/<domain>/index.ts`
   that re-exports its public surface; cross-feature imports must go through
   the barrel, not deep paths.
7. **Search for path strings.** `rg "components/<DomainName>"` and replace.
   Watch for string-literal paths in test fixtures, snapshot files, and
   `playwright.config.ts`.
8. **Stage your files only.** `git add` specific paths. Never `git add -A`.
9. **Commit message follows the locked convention** —
   lowercase, ≤100 chars, conventional commits, with the
   `Co-Authored-By: Claude <noreply@anthropic.com>` footer.

## Acceptance criteria per wave

- **Web (Wave A) done when:** zero files under `apps/web/components/` that
  belong to a single domain — only true cross-feature atoms remain. The
  `apps/web/hooks/`, `apps/web/handlers/`, `apps/web/api/v1/<domain>/`,
  `apps/web/lib/<domain>/` directories are empty of domain-scoped code.
- **Mobile (Wave B) done when:** `apps/mobile/components/` only contains
  shared atoms; every screen under `apps/mobile/app/` imports its
  domain-scoped components from `apps/mobile/features/<domain>/`.
- **Desktop (Wave C) done when:** `apps/desktop/src/components/` is reduced
  from 76 subdirs to ≤10 (shared UI atoms only); every other former
  component subdir lives under `apps/desktop/src/features/<domain>/`.

## Cost estimate (rough)

- Web: 8–14 PRs over 2–3 weeks (one domain per PR, paired with CI verification).
- Mobile: 5–8 PRs over 1–2 weeks.
- Desktop: 25–35 PRs over 5–8 weeks (76 component subdirs collapsed into ~25 features).

Total: 8–13 weeks of part-time work, depending on how many PRs land per
day. This is _strictly mechanical_ — no behavior changes are permitted.

## What this plan deliberately does NOT do

- **Does not migrate `apps/cli`.** Rust module structure work is a separate
  initiative.
- **Does not introduce a new layer (`ui/lib`/`atoms`/etc.).** The split is
  binary — feature-scoped vs platform-scoped. No third bucket.
- **Does not change package boundaries (`packages/*`).** If a domain wants
  cross-surface reuse, that's a different PR that extracts to a workspace
  package — out of scope here.
- **Does not change build tooling.** Vite, Next.js, Tauri, Metro all keep
  their current configs; only `paths` aliases are updated.

## Open questions to resolve before Wave A starts

1. Do we keep `apps/web/handlers/` or fold it into `features/<domain>/handlers/`?
   (Current spread is 50/50 — needs an owner decision.)
2. `apps/web/api/v1/*` vs `apps/web/app/api/*` (App Router) — only one of
   these should exist; the migration should consolidate.
3. Naming: `features/` vs `domains/` vs `modules/`. Plan currently uses
   `features/` to match the existing `apps/web/features/` convention.

## References

- Existing `apps/web/features/` structure (already domain-first; the model).
- Wave 2 plan: `docs/plans/wave2-desktop-v1.md` (lists desktop component subdirs).
- Composite tsconfig commit `291bf6ccb` + scope-A follow-up — pre-req for
  per-domain incremental builds.
