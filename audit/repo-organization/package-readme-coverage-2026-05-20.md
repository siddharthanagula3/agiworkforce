# Package, Crate, App, And Service README Coverage

Status: Current assessment
Owner: Platform lead
Last updated: 2026-05-20

Purpose: track local onboarding docs. Every top-level app, package, crate, and service should explain owner, purpose, public API, test commands, and boundaries.

Companion ownership model: `audit/repo-organization/ownership-model-2026-05-20.md`.

Current enforcement: `pnpm check:readme-ownership` is debt-aware. It fails new unclassified missing README files and warns on known P0/P1/P2 debt until README coverage is implemented.

## Apps

| Path                    | README | Priority      |
| ----------------------- | ------ | ------------- |
| `apps/cli`              | Yes    | Keep current. |
| `apps/desktop`          | No     | P0            |
| `apps/extension`        | No     | P1            |
| `apps/extension-vscode` | Yes    | Keep current. |
| `apps/mobile`           | Yes    | Keep current. |
| `apps/sandbox`          | Yes    | Keep current. |
| `apps/web`              | No     | P0            |

## Services

| Path                        | README | Priority |
| --------------------------- | ------ | -------- |
| `services/api-gateway`      | No     | P0       |
| `services/signaling-server` | No     | P1       |

## Packages

| Path                             | README | Priority      |
| -------------------------------- | ------ | ------------- |
| `packages/api`                   | No     | P1            |
| `packages/apply-patch`           | No     | P1            |
| `packages/browser-tool`          | No     | P1            |
| `packages/compliance`            | No     | P1            |
| `packages/data-layer`            | Yes    | Keep current. |
| `packages/design-tokens`         | No     | P1            |
| `packages/llm-normalize`         | Yes    | Keep current. |
| `packages/llm-runtime`           | No     | P1            |
| `packages/local-llm`             | No     | P1            |
| `packages/mcp`                   | No     | P1            |
| `packages/providers`             | No     | P0            |
| `packages/react-native-worklets` | No     | P2            |
| `packages/routing`               | No     | P1            |
| `packages/runtime`               | No     | P0            |
| `packages/skills`                | No     | P1            |
| `packages/stores`                | No     | P1            |
| `packages/types`                 | No     | P0            |
| `packages/unified-chat`          | No     | P0            |
| `packages/utils`                 | No     | P2            |

## Crates

| Path                                        | README | Priority      |
| ------------------------------------------- | ------ | ------------- |
| `crates/agiworkforce-app-server`            | No     | P1            |
| `crates/agiworkforce-apply-patch`           | No     | P1            |
| `crates/agiworkforce-async-utils`           | No     | P2            |
| `crates/agiworkforce-command-registry`      | No     | P0            |
| `crates/agiworkforce-execpolicy`            | No     | P1            |
| `crates/agiworkforce-network-proxy`         | No     | P1            |
| `crates/agiworkforce-plugin-runtime`        | No     | P1            |
| `crates/agiworkforce-protocol`              | Yes    | Keep current. |
| `crates/agiworkforce-task-runtime`          | No     | P1            |
| `crates/agiworkforce-utils-absolute-path`   | No     | P2            |
| `crates/agiworkforce-utils-cache`           | No     | P2            |
| `crates/agiworkforce-utils-home-dir`        | No     | P2            |
| `crates/agiworkforce-utils-image`           | No     | P2            |
| `crates/agiworkforce-utils-rustls-provider` | No     | P2            |
| `crates/agiworkforce-utils-string`          | No     | P2            |
| `crates/agiworkforce-utils-template`        | Yes    | Keep current. |
| `crates/sandbox-policy`                     | No     | P1            |

## README Template

Each README should include:

- Purpose.
- Owner role.
- Public API / exports.
- What belongs here.
- What does not belong here.
- Main commands.
- High-risk behavior and required tests.
