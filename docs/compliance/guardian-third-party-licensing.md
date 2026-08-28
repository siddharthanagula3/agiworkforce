# AGI Guardian third-party and licensing inventory

Status: Current
Owner: Platform lead
Last updated: 2026-08-09

Commercial context: Guardian may ship later as proprietary SaaS / self-hosted
product. Every component below records how it is used and whether that use is
compatible with proprietary distribution. Nothing on this list is vendored or
copied into Guardian source; reference projects were used as design
inspiration only (clean-room).

## Embedded (linked into Guardian packages)

| Component | Version                   | License | Use                            | Commercial assessment |
| --------- | ------------------------- | ------- | ------------------------------ | --------------------- |
| `zod`     | ^4.4.2 (workspace-wide)   | MIT     | schema validation              | OK                    |
| `yaml`    | ^2.9.0 (already in graph) | ISC     | `.agi-guardian.yml` parsing    | OK                    |
| `tsx`     | ^4.19.2 (devDependency)   | MIT     | dev/CI runner for the scan CLI | OK (not shipped)      |

## Invoked as processes (never linked)

| Component              | Pin                      | License                                               | Use                                              | Notes                                                                                                                      |
| ---------------------- | ------------------------ | ----------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| repo `check:*` scripts | in-repo                  | proprietary (ours)                                    | deterministic analyzers                          | first-class Guardian scanners                                                                                              |
| semgrep                | 1.172.0 (ci.yml pip pin) | Engine LGPL-2.1; community rules have their own terms | already runs in ci.yml; Guardian parses its JSON | invoke unmodified binary only; do not embed engine or redistribute community rules in a commercial artifact without review |
| knip                   | repo devDependency       | ISC                                                   | `check:knip:production` in deep lane             | OK                                                                                                                         |
| CodeQL                 | GitHub-hosted            | GitHub terms                                          | read results only                                | usable on GitHub-hosted repos; do not bundle                                                                               |

## Adapter-ready but not yet enabled (parsers shipped, tools not installed)

| Component          | Planned pin                                  | License    | Assessment               |
| ------------------ | -------------------------------------------- | ---------- | ------------------------ |
| gitleaks           | pin exact release + checksum before enabling | MIT        | OK as invoked process    |
| osv-scanner        | pin exact release                            | Apache-2.0 | OK                       |
| trivy              | pin exact release                            | Apache-2.0 | OK (invoke, don't embed) |
| syft / grype       | pin exact release                            | Apache-2.0 | OK                       |
| jscpd              | pin exact npm version                        | MIT        | OK                       |
| dependency-cruiser | pin exact npm version                        | MIT        | OK                       |
| OpenSSF Scorecard  | pin exact release                            | Apache-2.0 | OK                       |

## Design-inspiration only (no code copied)

openreview, pr-agent (AGPL — never copy code), reviewdog, probot, danger-js,
revu, ai-code-reviewer, skylos, semgrep-rules, ZAP, Strix. AGPL and
source-available projects on this list must never contribute code to Guardian
without explicit legal approval; architecture patterns only.

## Rules

1. Every newly enabled external tool gets: exact pin (version + SHA/digest or
   checksum), timeout, machine-readable output, failure policy, retention
   policy, and a row in this file — enforced by review, verified by the
   scanner adapter tests.
2. GitHub Actions used by `guardian.yml` follow the repo pinning policy
   (`scripts/check-action-pins.sh`): first-party `actions/*` by major tag,
   third-party by full commit SHA.
3. Upgrade/removal: change the pin here and in the invoking workflow/adapter
   in the same PR; removal deletes the adapter registration and this row.
