# apps/mobile/src/

Canonical layer-map for the mobile app. New feature-domain code lands here.
Legacy code at `apps/mobile/{components,services,stores,storage,lib,hooks,types}/`
is migrated one domain at a time. Retired feature paths are removed once their
callers import through the canonical feature barrel.

## Layer map

| Layer           | Owns                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `entry/`        | Bootstrap, route wrappers, app-level providers. Wires features into Expo routes.                                    |
| `core/`         | State orchestration and flows shared across screens.                                                                |
| `features/`     | Self-contained feature folders (chat, onboarding, billing, settings, messaging, models, companions, waitlist, ...). |
| `platform/`     | Native adapters: health, permissions, intent bridges, push, voice, TTS, background.                                 |
| `integrations/` | API / auth / sync / supabase / mcp / cloud + local backends. The only place network and SDK calls happen.           |
| `storage/`      | Data boundary. Reads and writes go through here.                                                                    |
| `ui/`           | Reusable presentation primitives. No business logic, no integrations, no platform.                                  |

## Rules

1. `entry/` owns no domain logic. It wires features into Expo routes and provides app-level providers.
2. `features/`, `core/`, `platform/` do **not** import each other's siblings directly — go through barrels or domain interfaces.
3. `integrations/` is the only place network/IO/SDK calls happen. Features call into integrations, not the other way around.
4. `storage/` is the data boundary. Code outside `storage/` reads and writes via storage's public API.
5. `ui/` is presentation-only. No business logic, no integrations, no platform calls.

## Migration pattern

When moving `apps/mobile/<old-path>/X.ts` to `apps/mobile/src/<layer>/<feature>/X.ts`:

1. `git mv` the file to its new location.
2. Replace the old path with a barrel that re-exports the new location, e.g.:
   ```ts
   // apps/mobile/services/example.ts
   export * from '@/src/features/example/service';
   ```
3. Add or update `apps/mobile/src/<layer>/<feature>/index.ts` so the new location has its own public barrel.
4. Rewrite call sites only when the surface typecheck can prove the move in the
   same commit. Otherwise, use a temporary barrel and remove it in the follow-up
   cleanup.

Barrels at old paths are removed only after every call site has been migrated
and `pnpm check:structure-conventions` can enforce the retired path as an
error.

## Status

Completed feature moves:

- `features/waitlist/` callers use the canonical `src/features/waitlist` barrel.
- `features/projects/` owns `ProjectCard`.
- `features/billing/` owns `UpsellCard`.
- `features/schedules/` owns schedule components, schedule API calls, and schedule state.

Feature ownership READMEs are required for every top-level folder under this
root by `pnpm check:readme-ownership`.

Out-of-scope this phase: any other surface (`apps/cli/`, `apps/desktop/`, `apps/web/`, `apps/extension/`, `apps/extension-vscode/`).
