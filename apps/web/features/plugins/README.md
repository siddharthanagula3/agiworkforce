# Plugins Feature

Status: Active
Owner: Web engineer
Purpose: Plugin marketplace UI over the hosted plugin registry (CAP-046).

## Where the catalogue comes from

| Piece            | Path                                               |
| ---------------- | -------------------------------------------------- |
| Contract         | `packages/contracts/types/src/plugins.ts`          |
| Table            | `apps/web/db/neon/0096_plugin_registry.sql`        |
| Service          | `apps/web/lib/services/plugin-registry-service.ts` |
| HTTP API         | `apps/web/app/api/plugins` (+ `[id]`)              |
| Page data source | `features/plugins/server/registry-source.ts`       |
| Offline mirror   | `features/plugins/data/plugins.ts`                 |

`/plugins` and `/plugins/[id]` read the hosted registry directly through
`registry-source.ts` (same request, no HTTP hop). The `/api/plugins` routes exist
for the CLI (`apps/cli/src/features/plugins/registry.rs`) and other clients.

`data/plugins.ts` is an offline mirror kept ONLY for the settings modal, which
builds its list synchronously at module scope. `data/plugins.registry-parity.test.ts`
fails if it drifts from the migration seed.

## Honesty rules for this surface

- No download counts, ratings, or install totals: none has ever been observed.
- A pack is presented as installable only when `isPluginEntryInstallable` is
  true (status `published` **and** a real artifact). Every launch entry is
  `preview`, so the pages say installation is not open — from the data, not
  from a hardcoded sentence.
- No install/uninstall buttons. `stores/plugin-store.ts` is gated off
  (`PLUGIN_INSTALLS_ENABLED = false`) because hosted install does not work yet;
  a button that no-ops would be a dead control.
- Registry outage and empty catalogue render as different states. Rendering an
  outage as "no plugins" would be a false claim about the product.
