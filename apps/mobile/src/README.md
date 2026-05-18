# apps/mobile/src/

Canonical layer-map for the mobile app. New code lands here. Legacy code at
`apps/mobile/{components,services,stores,storage,lib,hooks,types}/` is
migrated layer-by-layer with temporary barrel re-exports at the old paths so
in-flight teammate work keeps building.

## Layer map

| Layer            | Owns                                                                          |
| ---------------- | ----------------------------------------------------------------------------- |
| `entry/`         | Bootstrap, route wrappers, app-level providers. Wires features into Expo routes. |
| `core/`          | State orchestration and flows shared across screens.                           |
| `features/`      | Self-contained feature folders (chat, onboarding, billing, settings, messaging, models, companions, waitlist, ...). |
| `platform/`      | Native adapters: health, permissions, intent bridges, push, voice, TTS, background. |
| `integrations/`  | API / auth / sync / supabase / mcp / cloud + local backends. The only place network and SDK calls happen. |
| `storage/`       | Data boundary. Reads and writes go through here.                              |
| `ui/`            | Reusable presentation primitives. No business logic, no integrations, no platform. |

## Rules (enforced softly in this phase, hard later)

1. `entry/` owns no domain logic. It wires features into Expo routes and provides app-level providers.
2. `features/`, `core/`, `platform/` do **not** import each other's siblings directly — go through barrels or domain interfaces.
3. `integrations/` is the only place network/IO/SDK calls happen. Features call into integrations, not the other way around.
4. `storage/` is the data boundary. Code outside `storage/` reads and writes via storage's public API.
5. `ui/` is presentation-only. No business logic, no integrations, no platform calls.

## Migration pattern (temp barrels)

When moving `apps/mobile/<old-path>/X.ts` to `apps/mobile/src/<layer>/<feature>/X.ts`:

1. `git mv` the file to its new location.
2. Replace the old path with a barrel that re-exports the new location, e.g.:
   ```ts
   // apps/mobile/services/waitlist.ts
   export * from '@/src/features/waitlist/service';
   ```
3. Add or update `apps/mobile/src/<layer>/<feature>/index.ts` so the new location has its own public barrel.
4. Do **not** rewrite call sites in the same commit. Active teammates' edits keep working unchanged.

Barrels at OLD paths are removed only after every call site has been migrated AND the import-boundary lint check is enforced as an error. That cleanup is a separate phase.

## Status

Pilot in flight: `features/waitlist/` (per `tasks/team-status/reorg-mobile-pilot.md`).

Out-of-scope this phase: any other surface (`apps/cli/`, `apps/desktop/`, `apps/web/`, `apps/extension/`, `apps/extension-vscode/`).
