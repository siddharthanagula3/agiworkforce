---
id: "META-codebase-coverage"
type: "coverage"
title: "Codebase coverage"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Codebase coverage

Every app, package, service and crate in the project (78 folders), with how many features cite code in it and which overview, app, system or engineering pages describe it. A folder with neither is not documented here yet.

**Every folder is cited by at least one feature or page.**

| Folder | Features citing its code | Pages describing it | Pages |
|---|---:|---:|---|
| `apps/cli` | 598 | 27 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [cli](../30-surfaces/cli.md), [desktop](../30-surfaces/desktop.md) |
| `apps/desktop` | 352 | 29 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [cli](../30-surfaces/cli.md), [desktop](../30-surfaces/desktop.md) |
| `apps/extension` | 418 | 30 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [chrome](../30-surfaces/chrome.md), [cli](../30-surfaces/cli.md) |
| `apps/extension-vscode` | 433 | 25 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [cli](../30-surfaces/cli.md), [vscode](../30-surfaces/vscode.md) |
| `apps/mobile` | 831 | 27 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [mobile](../30-surfaces/mobile.md), [api-and-contracts](../40-systems/api-and-contracts.md) |
| `apps/web` | 1109 | 38 | [evidence-and-status](../00-start/evidence-and-status.md), [glossary](../00-start/glossary.md), [product-overview](../00-start/product-overview.md), [system-architecture](../00-start/system-architecture.md) |
| `packages/ai/agent-core` | 6 | 2 | [system-architecture](../00-start/system-architecture.md), [agents-tools-and-automation](../40-systems/agents-tools-and-automation.md) |
| `packages/ai/model-registry` | 30 | 15 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [cli](../30-surfaces/cli.md), [mobile](../30-surfaces/mobile.md) |
| `packages/ai/provider-protocol` | 8 | 2 | [system-architecture](../00-start/system-architecture.md), [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/provider-runtime` | 5 | 3 | [system-architecture](../00-start/system-architecture.md), [inference-providers](../40-systems/inference-providers.md), [troubleshooting](../60-engineering/troubleshooting.md) |
| `packages/ai/routing` | 28 | 3 | [system-architecture](../00-start/system-architecture.md), [inference-providers](../40-systems/inference-providers.md), [model-catalog-and-routing](../40-systems/model-catalog-and-routing.md) |
| `packages/ai/search` | 2 | 2 | [system-architecture](../00-start/system-architecture.md), [inference-providers](../40-systems/inference-providers.md) |
| `packages/client/client-runtime` | 26 | 3 | [system-architecture](../00-start/system-architecture.md), [vscode](../30-surfaces/vscode.md), [authentication-and-identity](../40-systems/authentication-and-identity.md) |
| `packages/client/desktop-command-client` | 1 | 1 | [system-architecture](../00-start/system-architecture.md) |
| `packages/client/ide-runtime` | 1 | 1 | [system-architecture](../00-start/system-architecture.md) |
| `packages/client/sync` | 2 | 1 | [system-architecture](../00-start/system-architecture.md) |
| `packages/contracts/cloud-contracts` | 294 | 15 | [system-architecture](../00-start/system-architecture.md), [mobile](../30-surfaces/mobile.md), [agents-tools-and-automation](../40-systems/agents-tools-and-automation.md), [api-and-contracts](../40-systems/api-and-contracts.md) |
| `packages/contracts/compliance` | 1 | 1 | [system-architecture](../00-start/system-architecture.md) |
| `packages/contracts/context` | 9 | 3 | [system-architecture](../00-start/system-architecture.md), [api-and-contracts](../40-systems/api-and-contracts.md), [memory-projects-and-context](../40-systems/memory-projects-and-context.md) |
| `packages/contracts/licensing` | 0 | 2 | [system-architecture](../00-start/system-architecture.md), [subscriptions-entitlements-and-usage](../40-systems/subscriptions-entitlements-and-usage.md) |
| `packages/contracts/local-runtime` | 51 | 8 | [system-architecture](../00-start/system-architecture.md), [desktop](../30-surfaces/desktop.md), [web](../30-surfaces/web.md), [agents-tools-and-automation](../40-systems/agents-tools-and-automation.md) |
| `packages/contracts/trust-boundaries` | 1 | 4 | [system-architecture](../00-start/system-architecture.md), [api-and-contracts](../40-systems/api-and-contracts.md), [execution-boundaries](../40-systems/execution-boundaries.md), [security-and-privacy](../40-systems/security-and-privacy.md) |
| `packages/contracts/types` | 302 | 29 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [chrome](../30-surfaces/chrome.md), [cli](../30-surfaces/cli.md) |
| `packages/guardian/core` | 0 | 1 | [system-architecture](../00-start/system-architecture.md) |
| `packages/guardian/github` | 0 | 1 | [system-architecture](../00-start/system-architecture.md) |
| `packages/platform/artifacts` | 16 | 3 | [system-architecture](../00-start/system-architecture.md), [data-model-and-migrations](../40-systems/data-model-and-migrations.md), [files-artifacts-and-storage](../40-systems/files-artifacts-and-storage.md) |
| `packages/platform/context-engine` | 8 | 2 | [system-architecture](../00-start/system-architecture.md), [memory-projects-and-context](../40-systems/memory-projects-and-context.md) |
| `packages/platform/data-layer` | 5 | 4 | [system-architecture](../00-start/system-architecture.md), [authorization-and-workspaces](../40-systems/authorization-and-workspaces.md), [data-model-and-migrations](../40-systems/data-model-and-migrations.md), [configuration](../60-engineering/configuration.md) |
| `packages/platform/files` | 1 | 1 | [system-architecture](../00-start/system-architecture.md) |
| `packages/platform/identity` | 2 | 3 | [system-architecture](../00-start/system-architecture.md), [web](../30-surfaces/web.md), [authentication-and-identity](../40-systems/authentication-and-identity.md) |
| `packages/platform/key-value` | 0 | 4 | [system-architecture](../00-start/system-architecture.md), [data-model-and-migrations](../40-systems/data-model-and-migrations.md), [configuration](../60-engineering/configuration.md), [troubleshooting](../60-engineering/troubleshooting.md) |
| `packages/platform/local-llm` | 8 | 8 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [mobile](../30-surfaces/mobile.md), [execution-boundaries](../40-systems/execution-boundaries.md) |
| `packages/platform/object-storage` | 3 | 4 | [system-architecture](../00-start/system-architecture.md), [data-model-and-migrations](../40-systems/data-model-and-migrations.md), [files-artifacts-and-storage](../40-systems/files-artifacts-and-storage.md), [configuration](../60-engineering/configuration.md) |
| `packages/platform/observability` | 0 | 1 | [system-architecture](../00-start/system-architecture.md) |
| `packages/platform/utils` | 35 | 3 | [system-architecture](../00-start/system-architecture.md), [execution-boundaries](../40-systems/execution-boundaries.md), [sync-and-continuity](../40-systems/sync-and-continuity.md) |
| `packages/tools/apply-patch` | 0 | 3 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [agents-tools-and-automation](../40-systems/agents-tools-and-automation.md) |
| `packages/tools/browser-tool` | 0 | 2 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md) |
| `packages/tools/mcp` | 3 | 2 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md) |
| `packages/tools/skills` | 9 | 2 | [system-architecture](../00-start/system-architecture.md), [connectors-plugins-and-skills](../40-systems/connectors-plugins-and-skills.md) |
| `packages/ui/design-tokens` | 14 | 2 | [system-architecture](../00-start/system-architecture.md), [shared-ui-and-design](../40-systems/shared-ui-and-design.md) |
| `packages/ui/i18n` | 20 | 3 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [shared-ui-and-design](../40-systems/shared-ui-and-design.md) |
| `packages/ui/icons` | 1 | 2 | [system-architecture](../00-start/system-architecture.md), [shared-ui-and-design](../40-systems/shared-ui-and-design.md) |
| `packages/ui/ui` | 87 | 3 | [system-architecture](../00-start/system-architecture.md), [shared-ui-and-design](../40-systems/shared-ui-and-design.md), [troubleshooting](../60-engineering/troubleshooting.md) |
| `packages/ui/unified-chat` | 277 | 9 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [cli](../30-surfaces/cli.md), [web](../30-surfaces/web.md) |
| `packages/ai/providers/anthropic` | 9 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/deepseek` | 0 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/factory` | 2 | 3 | [system-architecture](../00-start/system-architecture.md), [inference-providers](../40-systems/inference-providers.md), [local-inference](../40-systems/local-inference.md) |
| `packages/ai/providers/google` | 1 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/groq` | 0 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/lmstudio` | 0 | 2 | [inference-providers](../40-systems/inference-providers.md), [local-inference](../40-systems/local-inference.md) |
| `packages/ai/providers/minimax` | 0 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/moonshot` | 0 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/nvidia` | 0 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/ollama` | 0 | 3 | [inference-providers](../40-systems/inference-providers.md), [local-inference](../40-systems/local-inference.md), [configuration](../60-engineering/configuration.md) |
| `packages/ai/providers/openai` | 10 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/openrouter` | 0 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/perplexity` | 0 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/qwen` | 0 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/vercel-gateway` | 0 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/workers-ai` | 0 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/xai` | 0 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `packages/ai/providers/zhipu` | 0 | 1 | [inference-providers](../40-systems/inference-providers.md) |
| `services/signaling-server` | 7 | 4 | [system-architecture](../00-start/system-architecture.md), [sync-and-continuity](../40-systems/sync-and-continuity.md), [configuration](../60-engineering/configuration.md), [deployment](../60-engineering/deployment.md) |
| `services/upload-scanner` | 1 | 4 | [system-architecture](../00-start/system-architecture.md), [files-artifacts-and-storage](../40-systems/files-artifacts-and-storage.md), [security-and-privacy](../40-systems/security-and-privacy.md), [configuration](../60-engineering/configuration.md) |
| `infrastructure/sandbox` | 10 | 7 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [chrome](../30-surfaces/chrome.md), [agents-tools-and-automation](../40-systems/agents-tools-and-automation.md) |
| `crates/agiworkforce-agent-core` | 11 | 3 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [agents-tools-and-automation](../40-systems/agents-tools-and-automation.md) |
| `crates/agiworkforce-app-server` | 1 | 2 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md) |
| `crates/agiworkforce-command-registry` | 3 | 1 | [system-architecture](../00-start/system-architecture.md) |
| `crates/agiworkforce-execpolicy` | 0 | 2 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md) |
| `crates/agiworkforce-licensing` | 0 | 2 | [system-architecture](../00-start/system-architecture.md), [subscriptions-entitlements-and-usage](../40-systems/subscriptions-entitlements-and-usage.md) |
| `crates/agiworkforce-llm` | 9 | 2 | [system-architecture](../00-start/system-architecture.md), [inference-providers](../40-systems/inference-providers.md) |
| `crates/agiworkforce-mcp` | 7 | 3 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md), [connectors-plugins-and-skills](../40-systems/connectors-plugins-and-skills.md) |
| `crates/agiworkforce-model-registry` | 6 | 3 | [system-architecture](../00-start/system-architecture.md), [inference-providers](../40-systems/inference-providers.md), [model-catalog-and-routing](../40-systems/model-catalog-and-routing.md) |
| `crates/agiworkforce-protocol` | 13 | 5 | [system-architecture](../00-start/system-architecture.md), [cli](../30-surfaces/cli.md), [api-and-contracts](../40-systems/api-and-contracts.md), [model-catalog-and-routing](../40-systems/model-catalog-and-routing.md) |
| `crates/agiworkforce-sandbox-policy` | 1 | 2 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md) |
| `crates/agiworkforce-utils-absolute-path` | 0 | 1 | [system-architecture](../00-start/system-architecture.md) |
| `crates/agiworkforce-utils-image` | 4 | 1 | [system-architecture](../00-start/system-architecture.md) |
| `crates/agiworkforce-worktree` | 0 | 2 | [glossary](../00-start/glossary.md), [system-architecture](../00-start/system-architecture.md) |
