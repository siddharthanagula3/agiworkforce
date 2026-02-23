# Security Notes

## Dependency Overrides

### qs >=6.14.2 (pnpm override in package.json)

The `qs` package is pinned to `>=6.14.2` via a pnpm override to address:

- **CVE-2026-2391** — DoS via `arrayLimit` bypass (affects qs >=6.7.0 and <=6.14.1)
- **CVE-2025-15284** — Related `qs` parsing DoS vector

Version 6.14.2 is the patched release. The override ensures transitive
dependencies (e.g., via `express-rate-limit`, `body-parser`) also receive the
patched version.
