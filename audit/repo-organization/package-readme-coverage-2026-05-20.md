# Package, Crate, App, And Service README Coverage

Status: Current assessment
Owner: Platform lead
Last updated: 2026-05-20

Purpose: track local onboarding docs. Every top-level app, package, crate, and service should explain owner, purpose, public API, test commands, and boundaries.

Companion ownership model: `audit/repo-organization/ownership-model-2026-05-20.md`.

Current enforcement: `pnpm check:readme-ownership` is now strict for top-level apps, packages, provider leaf packages, crates, and services. New missing README files or missing ownership markers fail the check.

## Apps

| Path                    | README | Priority          |
| ----------------------- | ------ | ----------------- |
| `apps/cli`              | Yes    | Keep current.     |
| `apps/desktop`          | Yes    | Added 2026-05-20. |
| `apps/extension`        | Yes    | Added 2026-05-20. |
| `apps/extension-vscode` | Yes    | Keep current.     |
| `apps/mobile`           | Yes    | Keep current.     |
| `apps/sandbox`          | Yes    | Keep current.     |
| `apps/web`              | Yes    | Added 2026-05-20. |

## Services

| Path                        | README | Priority          |
| --------------------------- | ------ | ----------------- |
| `services/api-gateway`      | Yes    | Added 2026-05-20. |
| `services/signaling-server` | Yes    | Added 2026-05-20. |

## Packages

| Path                             | README | Priority          |
| -------------------------------- | ------ | ----------------- |
| `packages/api`                   | Yes    | Added 2026-05-20. |
| `packages/apply-patch`           | Yes    | Added 2026-05-20. |
| `packages/browser-tool`          | Yes    | Added 2026-05-20. |
| `packages/compliance`            | Yes    | Added 2026-05-20. |
| `packages/data-layer`            | Yes    | Keep current.     |
| `packages/design-tokens`         | Yes    | Added 2026-05-20. |
| `packages/llm-normalize`         | Yes    | Keep current.     |
| `packages/llm-runtime`           | Yes    | Added 2026-05-20. |
| `packages/local-llm`             | Yes    | Added 2026-05-20. |
| `packages/mcp`                   | Yes    | Added 2026-05-20. |
| `packages/providers`             | Yes    | Added 2026-05-20. |
| `packages/react-native-worklets` | Yes    | Added 2026-05-20. |
| `packages/routing`               | Yes    | Added 2026-05-20. |
| `packages/runtime`               | Yes    | Added 2026-05-20. |
| `packages/skills`                | Yes    | Added 2026-05-20. |
| `packages/stores`                | Yes    | Added 2026-05-20. |
| `packages/types`                 | Yes    | Added 2026-05-20. |
| `packages/unified-chat`          | Yes    | Added 2026-05-20. |
| `packages/utils`                 | Yes    | Added 2026-05-20. |

## Provider Leaf Packages

| Path                            | README | Priority          |
| ------------------------------- | ------ | ----------------- |
| `packages/providers/anthropic`  | Yes    | Added 2026-05-20. |
| `packages/providers/deepseek`   | Yes    | Added 2026-05-20. |
| `packages/providers/google`     | Yes    | Added 2026-05-20. |
| `packages/providers/lmstudio`   | Yes    | Added 2026-05-20. |
| `packages/providers/ollama`     | Yes    | Added 2026-05-20. |
| `packages/providers/openai`     | Yes    | Added 2026-05-20. |
| `packages/providers/perplexity` | Yes    | Added 2026-05-20. |
| `packages/providers/xai`        | Yes    | Added 2026-05-20. |

## Crates

| Path                                        | README | Priority          |
| ------------------------------------------- | ------ | ----------------- |
| `crates/agiworkforce-app-server`            | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-apply-patch`           | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-async-utils`           | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-command-registry`      | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-execpolicy`            | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-network-proxy`         | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-plugin-runtime`        | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-protocol`              | Yes    | Keep current.     |
| `crates/agiworkforce-task-runtime`          | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-utils-absolute-path`   | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-utils-cache`           | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-utils-home-dir`        | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-utils-image`           | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-utils-rustls-provider` | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-utils-string`          | Yes    | Added 2026-05-20. |
| `crates/agiworkforce-utils-template`        | Yes    | Keep current.     |
| `crates/sandbox-policy`                     | Yes    | Added 2026-05-20. |

## README Template

Each README should include:

- Purpose.
- Owner role.
- Public API / exports.
- What belongs here.
- What does not belong here.
- Main commands.
- High-risk behavior and required tests.
