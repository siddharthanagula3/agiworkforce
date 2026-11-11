# Security dependency patches

Status: Current
Owner: Platform + security
Last updated: 2026-11-11

GitHub withdrew the http-cache-semantics advisory on 2026-10-28 and the braces
advisory on 2026-10-23. Their audit ignores and policy exceptions are removed.
The source patches below remain as tested defensive behavior; this cleanup does
not remove those protections or change package versions.

`node-forge` is held at `>=1.4.3` by the root override. That release is outside
the affected range (`<= 1.4.0`) of
[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and
carries the fixes for the four advisories GitHub published against `<= 1.4.2`
(TLS client crashes on a record without a session and on an unsupported
compression method, a regular-expression denial of service in header and cookie
trimming, and Ed25519 verification that accepted small-order keys). It was
installed after its seventh day, so the release-age exclusion for `1.4.1` is
removed. No audit ignore or exception exists for the package.

| Advisory                                                                 | Package                      | Repair and compatibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) | `http-cache-semantics@4.2.0` | Storage restrictions, shared-cookie restrictions, `Vary: *`, `no-cache`, and shared `proxy-revalidate` cannot be overridden by client stale allowances or stale extensions. Successful origin validation remains supported. Newly supplied eligible 304 headers update the stored policy. Prohibited cached entries expire immediately; callers must obtain a full response when an old forbidden body cannot be reused. Public zero-freshness responses may still use permitted stale caching. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces@3.0.3`               | Parser nesting, recursive AST walkers, array flattening, and parent-chain traversal have a fixed 128-level limit. Extremely deep patterns and supplied ASTs throw a controlled `SyntaxError`. Ordinary globs, ranges, escapes, quotes, and documented options retain their tested behavior.                                                                                                                                                                                                     |

Neither advisory has an active exception in the canonical registry,
`.github/security-gate-policy.json`. The guard's patched-waiver tests still
require exact patch bytes, manifest/lock bindings, dependent scopes and expiry.
The blocking script-test chain exercises the installed packages and reconstructs
upstream source offline by reversing the patch for failing controls.

The regression evidence establishes the retained behavior. An attacker-accessible
product path and product impact have not been established. This is dependency
hardening, not a claim that the withdrawn advisories established application
exploitability or a complete application security review. Existing upstream
`must-revalidate` and `stale-if-error` semantics are outside this patch's scope.

Remove a retained patch only after its maintained dependency preserves the same
required behavior and compatibility controls. Keep other high-severity
advisories blocking. CLI filesystem fixtures use an unexpired test policy, while
an explicit expired-policy control still verifies the real UTC-date check.

## Query parser interoperability

The root override installs `decode-uri-component` 0.5.1 or newer for
[GHSA-qr28-fpjm-wq7f](https://github.com/advisories/GHSA-qr28-fpjm-wq7f).
That release is ESM-only. Expo Router's `query-string@7.1.3` still requires a
CommonJS callable, so `patches/query-string@7.1.3.patch` selects the decoder's
default export. The patch keeps the upstream patched decoder and does not add
an audit exception. The project's Node 24 toolchain supports the synchronous
require of this ESM module; Metro bundles the same default export.

`scripts/query-string-compatibility.test.cjs` exercises the actual Expo dependency
path, Unicode and single-pass query parsing, and a bounded malformed-input
case. Reversing the patch against the installed parser reproduces its
`decodeComponent is not a function` failure. Remove this interoperability patch
when the Expo dependency graph consumes a parser that supports the ESM decoder
directly, retaining the installed-package compatibility checks.

## Glob and minimatch interoperability

The root override selects `minimatch@11.0.1` for
[GHSA-g3hv-75wg-m249](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249)
and `glob@14.0.2` for modern glob consumers affected by
[GHSA-3g3m-2fjr-6pw4](https://github.com/isaacs/node-glob/security/advisories/GHSA-3g3m-2fjr-6pw4).
The first patch bounds optimization-level-2 pattern amplification and skips
quadratic deduplication for large sets. The second stops Promise and stream
directory traversal after cancellation. These upgrades add no audit exception.

Minimatch 11 replaces parsed regular expressions with `Matcher` objects and
removes `makeRe`. The following pnpm patches preserve installed consumer
contracts while retaining the patched matcher:

- `glob@6.0.4` and `glob@7.2.3` use `Matcher.pattern` and `Matcher.test` at their
  existing directory-matching sites. Glob 6 also uses glob 7's established
  non-string mapping before checking whether a pattern is absolute.
- `glob@8.1.0` also preserves raw-pattern leading-dot eligibility when a
  character class becomes a literal string. Its baseline used minimatch 5,
  which kept `[.]hidden` as a regular expression. Glob 6 and 7 already resolved
  minimatch 10, which optimized that pattern to a literal. Only glob 8 needs
  the additional eligibility flags. Original pattern rows remain available
  for `nonull`, and blocked asynchronous rows complete on the next tick.
- `eslint-plugin-import@2.32.0` uses public `Minimatch` instances and `match` in
  `no-internal-modules`, replacing its removed `makeRe` calls. Its six other
  wildcard rule paths select the public named function.
- React and JSX accessibility lint rules and `dir-compare` select the public
  named function at their existing wildcard call sites.
- The ESM entries of `@eslint/config-array@0.21.2` and `@eslint/eslintrc@3.3.7`
  import the public `Minimatch` class directly. Their CommonJS entries retain
  their existing class imports.
- `@electron/asar@3.4.1` selects the public named `minimatch` function for
  unpack patterns. Its exports and callback-based glob bridge remain intact.

WDIO's Mocha dependency selects the already-supported `mocha@11.8.0`; the
coverage discovery dependency selects maintained `test-exclude@8.0.0`.
`filelist@1.0.6` retains its public namespace `match` calls without a patch.
Generate replacement/deletion patches through `pnpm patch-commit` with Git's
`diff.context=0` scoped to that subprocess. For glob 8's insertion-only hunks,
retain normal context and set `diff.suppressBlankEmpty=true` instead; pnpm
10.34.7 shifts those insertions when context is zero. Both representations
keep the standard staged whitespace check intact. Retain the package-hash
and installed behavior checks after regeneration. Do not edit generated
patch grammar or change global Git settings.

The exact early-release exceptions for glob, minimatch, path-scurry and the
nonrecursive matcher follow the existing seven-day installation policy;
`minimumReleaseAge` remains unchanged.

`scripts/glob-minimatch-compatibility.test.cjs` resolves these packages through
their actual desktop, mobile and web dependency parents. Fixed independently
captured fixtures cover legacy matching, hidden files, ignores, callbacks,
match events and cancellation. Additional checks exercise the preprocessing
limits, modern glob cancellation, ASAR unpacking, ESLint restrictions, WDIO's
real Mocha adapter and Jest coverage. The tests do not install alias
dependencies or retain vulnerable matcher versions for differential controls.

Remove each interoperability patch when its maintained parent consumes the
patched matching APIs directly, preserving the corresponding installed-package
regressions. Application exploitability and execution on a Windows filesystem
remain separate validation questions.
