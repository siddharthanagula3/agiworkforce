# Phase 5 Web Directory Ownership Map

**Generated:** 2026-05-18
**Worktree:** `/Users/siddhartha/Desktop/agiworkforce-phase5-web`
**Total TS/TSX files (excluding node_modules/.next/.cache):** 1118

## Current Directory Layout (apps/web/)

| Directory     | File Count | Role                                               | Target in src/                                      |
| ------------- | ---------- | -------------------------------------------------- | --------------------------------------------------- |
| `app/`        | 270        | Next.js app router (pages, layouts, API routes)    | UNCHANGED (router contract)                         |
| `features/`   | 247        | Feature-scoped components, hooks, stores, services | `src/features/` (direct mapping)                    |
| `shared/`     | 213        | Cross-feature shared primitives                    | `src/ui/` + `src/data/`                             |
| `lib/`        | 95         | Utility functions, provider helpers, security      | `src/integrations/` + `src/data/` + `src/platform/` |
| `core/`       | 79         | State orchestration, AI, auth, billing logic       | `src/core/`                                         |
| `components/` | 65         | Legacy component bucket (marketing, layout, ui)    | `src/ui/`                                           |
| `__tests__/`  | 43         | API + security tests                               | stay (test)                                         |
| `stores/`     | 26         | Zustand stores                                     | `src/core/` or `src/features/`                      |
| `utils/`      | 20         | Utility functions                                  | `src/platform/`                                     |
| `hooks/`      | 16         | React hooks                                        | `src/platform/`                                     |
| `types/`      | 13         | TypeScript type declarations                       | `src/data/`                                         |
| `services/`   | 12         | Service layer                                      | `src/integrations/`                                 |
| `api/`        | 3          | Client-side API wrappers                           | `src/integrations/`                                 |
| `data/`       | 1          | Data files                                         | `src/data/`                                         |
| `constants/`  | 1          | Constants                                          | `src/core/`                                         |
| `handlers/`   | 1          | Server handlers                                    | `src/platform/`                                     |
| `providers/`  | 1          | React context providers                            | `src/entry/`                                        |

## Features Subdirectory Map

| Feature                | Files | Changed (30d) | Stability     | Pilot Candidate?          |
| ---------------------- | ----- | ------------- | ------------- | ------------------------- |
| `features/chat/`       | 178   | 149           | UNSTABLE      | No (highest blast radius) |
| `features/settings/`   | 19    | 19            | UNSTABLE      | No                        |
| `features/billing/`    | 10    | 8             | UNSTABLE      | No                        |
| `features/pages/`      | 17    | 12            | UNSTABLE      | No                        |
| `features/schedules/`  | 6     | 1             | MOSTLY STABLE | Low priority              |
| `features/connectors/` | 3     | 3             | UNSTABLE      | No                        |
| `features/media/`      | 1     | 2             | UNSTABLE      | No                        |
| `features/analytics/`  | 5     | 0             | **STABLE**    | **YES - TOP PICK**        |
| `features/projects/`   | 3     | 0             | **STABLE**    | Yes (secondary)           |
| `features/teams/`      | 3     | 0             | **STABLE**    | Yes (secondary)           |
| `features/support/`    | 2     | 1             | MOSTLY STABLE | Low priority              |

## Stable Feature Candidates (0 changes in 30d, no external imports)

### 1. `features/analytics/` (RECOMMENDED PILOT)

- 5 files, 0 git changes in 30 days
- No inbound imports from outside `features/analytics/`
- Components: ActivityTable, AnalyticsSummaryCard, SimpleBarChart, SimpleLineChart, AnalyticsDashboard
- Safe to move to `src/features/analytics/` with barrel re-export

### 2. `features/projects/` (secondary)

- 3 files, 0 git changes in 30 days
- Imported by: `shared/components/layout/DashboardHeader.tsx` (TeamSwitcher is teams, not projects)
- Internal self-reference via `@features/projects/` alias

### 3. `features/teams/` (secondary)

- 3 files, 0 git changes in 30 days
- Imported by: `shared/components/layout/DashboardHeader.tsx`

## Notes

- `features/analytics/` has zero external consumers and zero recent changes — lowest possible blast radius.
- `features/projects/` and `features/teams/` are safe but have 1-2 external consumers each.
- All other features are too active or too interconnected for an initial pilot.
- `core/`, `shared/`, `lib/`, `components/` are deferrable to later waves once `src/` skeleton is proven.
- `app/` is NEVER touched — Next.js router contract is sacred.
