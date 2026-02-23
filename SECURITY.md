# Security Notes

## Dependency Overrides

### qs >=6.14.2 (pnpm override in package.json)

The `qs` package is pinned to `>=6.14.2` via a pnpm override to address:

- **CVE-2025-15284** — `qs` parsing DoS vector (fixed in 6.14.1)
- **CVE-2026-2391** — DoS via `arrayLimit` bypass (fixed in 6.14.2)

The override pins to `>=6.14.2` to cover both CVEs. This ensures transitive
dependencies (e.g., via `express-rate-limit`, `body-parser`) also receive the
patched version.
