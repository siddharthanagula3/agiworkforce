# AGI CLI — Product Specification

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

AGI CLI is the pure-Rust (Ratatui TUI) developer surface of the AGI Workforce suite. Its trust stance spans Local + BYOK + Managed: the privacy modes in `apps/cli/src/agent/mod.rs` are ✅ Built and BLOCK Local sessions from silently using non-local provider modes. Sessions are workspace/session-scoped — there is no automatic app-chat sync, and any handoff to app chat is explicit and redacted. It consumes `crates/agiworkforce-app-server` (a JSON-RPC/WS tool host, ✅) plus plugin manifest discovery, MCP, hooks, skills, slash commands, and plan mode; these directions exist, but counts and behavior must be VERIFIED from source before repeating them — never state screen or command counts without checking. Remote control of a running CLI session from phone or web is a 🔭 parity target mirroring Claude Code Remote, not a shipped capability. Throughout these volumes, user-facing command examples MUST use the `agi` binary (`agi login`, `agi exec`, `agi mcp`, ...); `agiworkforce` is only a compatibility alias and must never appear in examples.

Pricing is shared across the suite: Free, Basic ($7 · ₹399), Pro ($20), Max ($100 and $200), Team ($30/seat), and Enterprise. There is no Plus or Hobby tier; top-ups are enabled for paid tiers (capped, opt-in). Local and BYOK are free access modes wherever the surface permits them, so developers can run the CLI against local or bring-your-own-key providers without a paid plan while managed inference remains gated by the shared tiers.

These volumes are target/design specs, not a claim of shipped state. They are governed by [../README.md](../README.md) (the canon) and `docs/current/source-of-truth.md`. Every capability claim must carry a mandatory ✅ (Built) / 🟡 (Partial) / 🔭 (Planned) label, and source must be verified before any status is repeated.

## Volumes

| #   | File                                                                                                       | Title                                |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 01  | [volume-01-product-overview.md](volume-01-product-overview.md)                                             | Product Overview                     |
| 02  | [volume-02-installation.md](volume-02-installation.md)                                                     | Installation                         |
| 03  | [volume-03-authentication-and-inference-providers.md](volume-03-authentication-and-inference-providers.md) | Authentication & Inference Providers |
| 04  | [volume-04-cli-interface.md](volume-04-cli-interface.md)                                                   | CLI Interface                        |
| 05  | [volume-05-sessions.md](volume-05-sessions.md)                                                             | Sessions                             |
| 06  | [volume-06-workspace-context.md](volume-06-workspace-context.md)                                           | Workspace Context                    |
| 07  | [volume-07-coding.md](volume-07-coding.md)                                                                 | Coding                               |
| 08  | [volume-08-file-system.md](volume-08-file-system.md)                                                       | File System                          |
| 09  | [volume-09-terminal.md](volume-09-terminal.md)                                                             | Terminal                             |
| 10  | [volume-10-git.md](volume-10-git.md)                                                                       | Git                                  |
| 11  | [volume-11-tool-calling.md](volume-11-tool-calling.md)                                                     | Tool Calling                         |
| 12  | [volume-12-mcp-integration.md](volume-12-mcp-integration.md)                                               | MCP Integration                      |
| 13  | [volume-13-search.md](volume-13-search.md)                                                                 | Search                               |
| 14  | [volume-14-context-management.md](volume-14-context-management.md)                                         | Context Management                   |
| 15  | [volume-15-configuration.md](volume-15-configuration.md)                                                   | Configuration                        |
| 16  | [volume-16-security.md](volume-16-security.md)                                                             | Security                             |
| 17  | [volume-17-performance.md](volume-17-performance.md)                                                       | Performance                          |
| 18  | [volume-18-observability.md](volume-18-observability.md)                                                   | Observability                        |
| 19  | [volume-19-ai-runtime.md](volume-19-ai-runtime.md)                                                         | AI Runtime                           |
| 20  | [volume-20-provider-integrations.md](volume-20-provider-integrations.md)                                   | Provider Integrations                |
| 21  | [volume-21-local-storage.md](volume-21-local-storage.md)                                                   | Local Storage                        |
| 22  | [volume-22-api-specification.md](volume-22-api-specification.md)                                           | API Specification                    |
| 23  | [volume-23-ui-components.md](volume-23-ui-components.md)                                                   | UI Components                        |
| 24  | [volume-24-edge-cases.md](volume-24-edge-cases.md)                                                         | Edge Cases                           |
| 25  | [volume-25-qa-test-cases.md](volume-25-qa-test-cases.md)                                                   | QA Test Cases                        |
| 26  | [volume-26-error-codes.md](volume-26-error-codes.md)                                                       | Error Codes                          |
| 27  | [volume-27-localization.md](volume-27-localization.md)                                                     | Localization                         |
| 28  | [volume-28-deployment.md](volume-28-deployment.md)                                                         | Deployment                           |
