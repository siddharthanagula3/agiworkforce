# Security dependency patches

Status: Current
Owner: Platform + security
Last updated: 2026-10-03

The npm audit registry reports these advisories against the locked package
versions, and neither package has a published fixed version at the time of this
repair. The repository applies source patches through pnpm. The two corresponding
audit exceptions are conditional on those repairs, rather than acceptance of the
unpatched library behavior.

| Advisory                                                                 | Package                      | Repair and compatibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) | `http-cache-semantics@4.2.0` | Storage restrictions, shared-cookie restrictions, `Vary: *`, `no-cache`, and shared `proxy-revalidate` cannot be overridden by client stale allowances or stale extensions. Successful origin validation remains supported. Newly supplied eligible 304 headers update the stored policy. Prohibited cached entries expire immediately; callers must obtain a full response when an old forbidden body cannot be reused. Public zero-freshness responses may still use permitted stale caching. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces@3.0.3`               | Parser nesting, recursive AST walkers, array flattening, and parent-chain traversal have a fixed 128-level limit. Extremely deep patterns and supplied ASTs throw a controlled `SyntaxError`. Ordinary globs, ranges, escapes, quotes, and documented options retain their tested behavior.                                                                                                                                                                                                     |

The canonical exception registry is
`.github/security-gate-policy.json`. It pins each advisory to one package version,
one patch path, its SHA256, and the exact observed dependent packages and workspace
importers. `scripts/check-security-gates.mjs` checks those values against the
manifest, pnpm's patch-content hash, and every affected lockfile reference. Missing
or modified patches, unpatched copies, broader scopes, or expired exceptions fail.
The blocking script-test chain also exercises the actual installed packages and
reconstructs upstream source offline by reversing the patch for failing controls.

The regression evidence establishes the library defects and the repaired
behavior. An attacker-accessible product path and product impact have not been
established. This is dependency hardening, not a claim that the applications were
exploitable or a complete application security review. Existing upstream
`must-revalidate` and `stale-if-error` semantics are outside this patch's scope.

Platform + security must review both exceptions before their registry expiry.
When an upstream fixed version is available, upgrade and run the same behavior
and compatibility tests, then remove the source patch, exact advisory exception,
and its package-specific guard binding together. Keep all other high-severity
advisories blocking.
