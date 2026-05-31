# Ownership Model For A+ Monorepo Operations

Status: Current assessment
Owner: Platform lead
Last updated: 2026-05-20

Purpose: define role-based ownership before individual teams are hired. Replace role aliases with GitHub teams/handles when the org is ready.

## Ownership Principles

- Own by stable product/runtime boundary, not by the person who last touched the file.
- Use role-based CODEOWNERS now; map roles to real GitHub teams later.
- High-risk changes require secondary owners even when the primary owner approves.
- Shared packages and crates must name their consumers so reviewers can route changes correctly.
- Agent-generated changes still require human review before release branches.

## Role Model

| Area                                                                                                     | Primary owner role      | Required secondary review                                                                                           |
| -------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                                                                                               | Web lead                | Backend/data for API routes and billing; security/privacy for auth, CSP, service-role, payments, and file handling. |
| `apps/desktop`                                                                                           | Desktop lead            | Rust platform for `src-tauri`; security/privacy for local files, MCP, sandbox, computer-use, and generated files.   |
| `apps/mobile`                                                                                            | Mobile lead             | Security/privacy for local storage, BYOK, consent, and on-device runtime.                                           |
| `apps/cli`                                                                                               | CLI lead                | Rust platform for reusable engine/protocol pieces.                                                                  |
| `apps/extension`                                                                                         | Extension lead          | Security/privacy for browser permissions, native messaging, capture, and page context.                              |
| `apps/extension-vscode`                                                                                  | Extension lead          | CLI/Rust platform for developer-session contracts and workspace trust.                                              |
| `apps/sandbox`                                                                                           | Web lead                | Security/privacy for CSP, iframe, artifact, and postMessage changes.                                                |
| `packages/types`                                                                                         | Platform lead           | Affected surface owners for schema changes.                                                                         |
| `packages/runtime`                                                                                       | Platform lead           | Security/privacy for tool execution, file, network, or model-routing changes.                                       |
| `packages/routing`                                                                                       | Platform lead           | Provider/platform and billing review for model routing/cost decisions.                                              |
| `packages/providers`                                                                                     | Provider/platform owner | Security/privacy for key handling, retention, provider storage flags, and managed gateways.                         |
| `packages/llm-normalize`, `packages/llm-runtime`                                                         | Provider/platform owner | Platform lead for event/tool schema drift.                                                                          |
| `packages/unified-chat`, `packages/design-tokens`                                                        | Frontend platform       | Web/Desktop/Mobile when behavior or UX contracts change.                                                            |
| `packages/apply-patch`, `packages/browser-tool`, `packages/mcp`, `packages/skills`, `packages/local-llm` | Tooling/security owner  | Surface owner for any direct app integration.                                                                       |
| `packages/data-layer`, `services/*`, `supabase/**`                                                       | Backend/data owner      | Security/privacy for auth, billing, RLS, secrets, retention, and migrations.                                        |
| `crates/*`                                                                                               | Rust platform           | CLI/Desktop owner when consumed by those shipped binaries.                                                          |
| `docs/agent-context`, `AGENTS.md`, `CLAUDE.md`                                                           | Platform lead           | Security/privacy when instructions affect network, credentials, sandbox, or file access.                            |
| `audit/`, `reports/`, `tasks/`                                                                           | Platform lead           | Relevant domain owner when evidence becomes implementation guidance.                                                |

## README Ownership Template

Every app, service, package, crate, and database area should use this shape:

```md
# <name>

Status:
Owner role:
Last updated:
Kind: app | service | ts-package | provider-package | rust-crate | database
Criticality: low | medium | high

## Purpose

## Consumers

## Public API / Exports

## What Belongs Here

## What Does Not Belong Here

## Key Files

## Commands

## Environment / Secrets

## Security, Privacy, Data Boundaries

## Tests Required For Changes

## Release / Deployment Notes

## Known Caveats

## CODEOWNERS
```

Package READMEs must include `package.json#exports`, allowed deep imports, reverse consumers, and the smallest useful test command.

Crate READMEs must include public types/functions, consumers, safety model, feature flags if any, and exact `cargo check`/`cargo test` scope.

Service and database READMEs must include deployment owner, env vars, schema/migration procedure, rollback path, and production verification.

## CODEOWNERS Plan

Initial CODEOWNERS should be role-commented until GitHub teams exist:

- `apps/web/**` -> Web lead.
- `apps/desktop/**` -> Desktop lead.
- `apps/mobile/**` -> Mobile lead.
- `apps/cli/**` -> CLI lead and Rust platform.
- `apps/extension*/**` -> Extension lead.
- `packages/types/**`, `packages/runtime/**`, `packages/routing/**` -> Platform lead.
- `packages/providers/**`, `packages/llm-*` -> Provider/platform owner.
- `services/**`, `supabase/**`, `packages/data-layer/**` -> Backend/data owner.
- `crates/**` -> Rust platform.
- `.github/**`, `scripts/check-*.mjs`, root manifests -> Platform lead.
- Security-sensitive patterns need secondary review documented in PR template until branch protection can require matching teams.

## Enforcement Path

1. Add P0 READMEs for major apps/services/shared packages.
2. Add `.github/CODEOWNERS` with placeholder team aliases only after real teams/handles are known, or keep this audit file as the contract until then.
3. Add a README coverage check in warning mode.
4. Flip README coverage to blocking once P0/P1 READMEs exist.
5. Add a CODEOWNERS presence/check script once GitHub team names are available.
