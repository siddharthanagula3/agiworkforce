# AGI VS Code Extension — Product Specification

Status: Current index
Owner: Founder + platform lead
Last updated: 2026-07-25

AGI VS Code Extension is the IDE-native, workspace-scoped developer surface. `@agi`, the sidebar, and the editor chat panel use the local `agi app-server`, which owns threads, turns, streaming, approvals, cancellation, provider configuration, and local-model discovery. Local + BYOK + Managed remain explicit trust boundaries with visible host/provider labels. There is no automatic app-chat sync. The Desktop bridge is optional and defaults off. Remote control from other surfaces remains planned.

## Pricing

Pricing follows the shared platform model: Free, Basic ($8 · ₹399), Pro ($20), Max ($100 and $200), and Enterprise. There is no Plus or Hobby tier and no credit top-up product. Local and BYOK are free access modes; Managed inference follows the signed-in account plan.

These volumes are target/design specs, not a claim of shipped state. They are governed by [../README.md](../README.md) (the product canon) and `docs/current/source-of-truth.md`. Every capability claim must carry a mandatory status label: ✅ shipped and verified, 🟡 partial or in progress, or 🔭 planned / unwired. When in doubt, mark it 🔭 and record a tracked gap rather than overstating readiness.

## Volumes

| #   | File                                                                                   | Title                      |
| --- | -------------------------------------------------------------------------------------- | -------------------------- |
| 01  | [volume-01-product-overview.md](volume-01-product-overview.md)                         | Product Overview           |
| 02  | [volume-02-installation.md](volume-02-installation.md)                                 | Installation               |
| 03  | [volume-03-authentication-and-providers.md](volume-03-authentication-and-providers.md) | Authentication & Providers |
| 04  | [volume-04-shared-runtime.md](volume-04-shared-runtime.md)                             | Shared Runtime             |
| 05  | [volume-05-chat.md](volume-05-chat.md)                                                 | Chat                       |
| 06  | [volume-06-workspace-context.md](volume-06-workspace-context.md)                       | Workspace Context          |
| 07  | [volume-07-code-generation.md](volume-07-code-generation.md)                           | Code Generation            |
| 08  | [volume-08-inline-editing.md](volume-08-inline-editing.md)                             | Inline Editing             |
| 09  | [volume-09-terminal-integration.md](volume-09-terminal-integration.md)                 | Terminal Integration       |
| 10  | [volume-10-git.md](volume-10-git.md)                                                   | Git                        |
| 11  | [volume-11-tool-calling.md](volume-11-tool-calling.md)                                 | Tool Calling               |
| 12  | [volume-12-mcp.md](volume-12-mcp.md)                                                   | MCP                        |
| 13  | [volume-13-search.md](volume-13-search.md)                                             | Search                     |
| 14  | [volume-14-context-management.md](volume-14-context-management.md)                     | Context Management         |
| 15  | [volume-15-inference-providers.md](volume-15-inference-providers.md)                   | Inference Providers        |
| 16  | [volume-16-vs-code-integration.md](volume-16-vs-code-integration.md)                   | VS Code Integration        |
| 17  | [volume-17-settings.md](volume-17-settings.md)                                         | Settings                   |
| 18  | [volume-18-security.md](volume-18-security.md)                                         | Security                   |
| 19  | [volume-19-performance.md](volume-19-performance.md)                                   | Performance                |
| 20  | [volume-20-analytics.md](volume-20-analytics.md)                                       | Analytics                  |
| 21  | [volume-21-api-specification.md](volume-21-api-specification.md)                       | API Specification          |
| 22  | [volume-22-local-storage.md](volume-22-local-storage.md)                               | Local Storage              |
| 23  | [volume-23-ui-components.md](volume-23-ui-components.md)                               | UI Components              |
| 24  | [volume-24-edge-cases.md](volume-24-edge-cases.md)                                     | Edge Cases                 |
| 25  | [volume-25-qa-test-cases.md](volume-25-qa-test-cases.md)                               | QA Test Cases              |
| 26  | [volume-26-error-codes.md](volume-26-error-codes.md)                                   | Error Codes                |
| 27  | [volume-27-localization.md](volume-27-localization.md)                                 | Localization               |
| 28  | [volume-28-deployment.md](volume-28-deployment.md)                                     | Deployment                 |
