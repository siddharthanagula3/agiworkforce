# AGI Guardian third-party and licensing inventory

Status: Current
Owner: Platform lead
Last updated: 2026-10-18

Commercial context: Guardian may ship later as proprietary SaaS / self-hosted
product. Every component below records how it is used and whether that use is
compatible with proprietary distribution. Nothing on this list is vendored or
copied into Guardian source; reference projects were used as design
inspiration only (clean-room).

## Embedded (linked into Guardian packages)

| Component | Version                          | License | Use                            | Commercial assessment |
| --------- | -------------------------------- | ------- | ------------------------------ | --------------------- |
| `zod`     | ^4.6.5                           | MIT     | schema validation              | OK                    |
| `yaml`    | ^2.9.1 (`guardian-core`)         | ISC     | `.agi-guardian.yml` parsing    | OK                    |
| `tsx`     | ^4.23.15 (`guardian-github` dev) | MIT     | dev/CI runner for the scan CLI | OK (not shipped)      |

## Invoked as processes (never linked)

| Component              | Pin                | License            | Use                                                                                    | Notes                                         |
| ---------------------- | ------------------ | ------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------- |
| repo `check:*` scripts | in-repo            | proprietary (ours) | the only scanners the scan runs (`packages/guardian/github/src/cli/checks-catalog.ts`) | each result is read by `parseRepoCheckResult` |
| knip                   | repo devDependency | ISC                | runs as the `check:knip:production` repo script in the deep lane                       | OK                                            |

## Considered, not integrated

Guardian has no adapter for any of these and does not read their output.
Semgrep already runs in `ci.yml` on its own; Guardian does not parse it.

| Component          | Planned pin                                  | License                                               | Assessment                                                                                 |
| ------------------ | -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| semgrep            | the `SEMGREP_VERSION` pin in `ci.yml`        | Engine LGPL-2.1; community rules have their own terms | invoke the unmodified binary only; do not embed the engine or redistribute community rules |
| CodeQL             | GitHub-hosted                                | GitHub terms                                          | usable on GitHub-hosted repos; do not bundle                                               |
| gitleaks           | pin exact release + checksum before enabling | MIT                                                   | OK as invoked process                                                                      |
| osv-scanner        | pin exact release                            | Apache-2.0                                            | OK                                                                                         |
| trivy              | pin exact release                            | Apache-2.0                                            | OK (invoke, don't embed)                                                                   |
| syft / grype       | pin exact release                            | Apache-2.0                                            | OK                                                                                         |
| jscpd              | pin exact npm version                        | MIT                                                   | OK                                                                                         |
| dependency-cruiser | pin exact npm version                        | MIT                                                   | OK                                                                                         |
| OpenSSF Scorecard  | pin exact release                            | Apache-2.0                                            | OK                                                                                         |

## Design-inspiration only (no code copied)

openreview, pr-agent (AGPL, never copy code), reviewdog, probot, danger-js,
revu, ai-code-reviewer, skylos, semgrep-rules, ZAP, Strix. AGPL and
source-available projects on this list must never contribute code to Guardian
without explicit legal approval; architecture patterns only.

## Rules

1. Every newly enabled external tool gets: exact pin (version + SHA/digest or
   checksum), timeout, machine-readable output, failure policy, retention
   policy, and a row in this file, enforced by review and by an adapter test
   beside `packages/guardian/core/src/__tests__/adapters.test.ts`.
2. GitHub Actions used by `guardian.yml` follow the repo pinning policy
   (`scripts/check-action-pins.sh`): every action, GitHub's own `actions/*`
   included, by full commit SHA with its release tag in a trailing comment.
3. Upgrade/removal: change the pin here and in the invoking workflow/adapter
   in the same PR; removal deletes the adapter registration and this row.
