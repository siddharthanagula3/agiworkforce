# Anthropic Applications Feature Ledger

Last updated: 2026-05-20.

Status values:

- `Done` - implemented and verified in AGI Workforce.
- `Partial` - implemented in one or more surfaces, but not complete enough for parity.
- `Gap` - missing or not yet wired.
- `Unknown` - needs file-backed exploration.

## Official Source Baseline

| Feature area                               | Official source                                                                              | AGI target                                                                                     | Current status |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| Claude Code overview/project awareness/MCP | `https://docs.anthropic.com/en/docs/claude-code/overview`                                    | CLI engine plus cross-surface project context                                                  | Partial        |
| Built-in slash commands                    | `https://docs.anthropic.com/en/docs/claude-code/slash-commands`                              | 83-command registry, shared TUI/REPL runtime, custom commands, MCP prompt commands             | Partial        |
| Custom slash commands                      | `https://docs.anthropic.com/en/docs/claude-code/slash-commands`                              | `.agiworkforce/commands`, imported `.claude/commands`, user commands                           | Gap            |
| MCP prompts as slash commands              | `https://docs.anthropic.com/en/docs/claude-code/mcp`                                         | Dynamic `/mcp__server__prompt` commands                                                        | Gap            |
| MCP server management and OAuth            | `https://docs.anthropic.com/en/docs/claude-code/mcp`                                         | Unified MCP registry and OAuth status across CLI/Desktop/Web                                   | Partial        |
| Hooks                                      | `https://docs.anthropic.com/en/docs/claude-code/hooks`                                       | Hook events and matcher compatibility with Claude tool names                                   | Partial        |
| Subagents                                  | `https://docs.anthropic.com/en/docs/claude-code/sub-agents`                                  | Agent definitions, tool-scoped subagents, separate context, manager UI                         | Partial        |
| Output styles                              | `https://docs.anthropic.com/en/docs/claude-code/output-styles`                               | Built-in and custom output styles, project-local persistence                                   | Partial        |
| Settings hierarchy                         | `https://docs.anthropic.com/en/docs/claude-code/settings`                                    | User/project/local settings, privacy mode, permissions, output style                           | Partial        |
| Artifacts                                  | `https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them` | Dedicated artifact workspace, sandboxed previews, editing/export/sharing                       | Partial        |
| Claude computer use                        | `https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool`            | AGI-owned screenshot/action protocol over isolated browser or desktop sessions                 | Partial        |
| Claude file creation                       | `https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude`          | Compute sessions that create PDF/DOCX/XLSX/PPTX and expose downloads/previews                  | Partial        |
| OpenAI computer/code/file tools            | `audit/anthropic-apps-parity/compute-artifacts-2026-05-20.md`                                | Provider-container adapters only; AGI owns generated-file and compute-session contracts        | Done           |
| Competitive app baseline                   | `audit/anthropic-apps-parity/competitive-baseline-2026-05-20.md`                             | Anthropic/OpenAI current app-suite comparison and AGI sync boundary                            | Done           |
| SDK/provider boundary                      | `audit/anthropic-apps-parity/sdk-strategy-2026-05-20.md`                                     | SDKs only at provider/UI edges; AGI owns runtime, schemas, privacy, routing, and event streams | Done           |

## AGI Evidence So Far

| Capability                                 | Status  | AGI paths                                                                                                                                                                        |
| ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude-style tool aliases                  | Done    | `apps/cli/src/features/exec/tools/mod.rs`, `apps/cli/src/tool_search.rs`                                                                                                         |
| Slash-command registry breadth             | Partial | `apps/cli/src/command_registry.rs`, `crates/agiworkforce-command-registry/src/lib.rs`                                                                                            |
| Shared TUI/REPL parity commands            | Partial | `apps/cli/src/claude_parity.rs`, `apps/cli/src/tui/tui_app.rs`, `apps/cli/src/repl/slash_commands.rs`                                                                            |
| `/add-dir` workspace roots                 | Done    | `apps/cli/src/path_security.rs`, `apps/cli/src/agent/mod.rs`, `apps/cli/src/lib.rs`                                                                                              |
| `/files` context attachment                | Done    | `apps/cli/src/agent/mod.rs`, `apps/cli/src/claude_parity.rs`                                                                                                                     |
| Claude config migration                    | Partial | `apps/cli/src/ecosystem.rs`                                                                                                                                                      |
| Local/BYOK/Managed privacy modes           | Partial | `apps/cli/src/agent/mod.rs`, `apps/cli/src/agent/chat.rs`, `apps/cli/src/claude_parity.rs`                                                                                       |
| Local to BYOK handoff draft                | Partial | `apps/cli/src/claude_parity.rs`, `apps/cli/src/tui/tui_app.rs`, `apps/cli/src/repl/slash_commands.rs`                                                                            |
| Web/Mobile/Desktop-only chat sync decision | Done    | `PLAN.md`, `TODO.md`, `audit/anthropic-apps-parity/competitive-baseline-2026-05-20.md`                                                                                           |
| SDK strategy boundary                      | Done    | `PLAN.md`, `TODO.md`, `audit/anthropic-apps-parity/sdk-strategy-2026-05-20.md`, `apps/web/lib/ai-sdk/*`, `packages/providers/{openai,anthropic}`                                 |
| Compute/artifact architecture research     | Done    | `audit/anthropic-apps-parity/compute-artifacts-2026-05-20.md`, `PLAN.md`, `TODO.md`                                                                                              |
| Shared artifact contract                   | Partial | `packages/types/src/artifacts.ts`, `packages/types/src/conversation.ts`, `packages/unified-chat/src/lib/types.ts`                                                                |
| Cross-origin web artifact sandbox          | Partial | `apps/sandbox`, `apps/web/lib/artifact-sandbox.ts`, `apps/web/features/chat/components/SandboxedIframe.tsx`                                                                      |
| Browser automation tool                    | Partial | `packages/browser-tool/src/index.ts`, `packages/browser-tool/src/types.ts`                                                                                                       |
| Desktop document creation tools            | Partial | `apps/desktop/src-tauri/src/features/document/*`, `apps/desktop/src-tauri/src/core/llm/tool_executor/document_tools.rs`, `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs` |
| Desktop artifacts                          | Unknown | `apps/desktop`, `apps/sandbox`, `packages/unified-chat` pending deeper audit                                                                                                     |
| Web artifacts/projects                     | Unknown | `apps/web`, `apps/sandbox`, `packages/unified-chat` pending deeper audit                                                                                                         |
| Mobile local/BYOK onboarding               | Unknown | `apps/mobile`, `packages/local-llm` pending deeper audit                                                                                                                         |
| VS Code parity                             | Unknown | `apps/extension-vscode` pending deeper audit                                                                                                                                     |
| Chrome connector parity                    | Unknown | `apps/extension` pending deeper audit                                                                                                                                            |
| Managed cloud readiness                    | Unknown | `services`, `supabase`, `packages/compliance`, `packages/data-layer` pending deeper audit                                                                                        |

## Surface Evidence Update

| Capability                                    | Status  | Evidence                                                                                                                                                                                                     |
| --------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop projects/memory/artifacts/MCP/privacy | Partial | `apps/desktop/src-tauri/src/sys/commands/{projects,artifacts,mcp,hooks,memory,privacy}.rs`, `apps/desktop/src/features/onboarding/OnboardingWizard.tsx`                                                      |
| Web projects/account/billing/teams/chat APIs  | Partial | `apps/web/app/api/projects/route.ts`, `apps/web/app/api/stripe-webhook/route.ts`, `apps/web/app/api/portal/route.ts`, `apps/web/app/api/teams/route.ts`, `apps/web/app/api/llm/v1/chat/completions/route.ts` |
| Mobile local-first v1 posture                 | Partial | `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/services/dsarExport.ts`, mobile import/export and MCP service paths recorded in `surface-gap-ledger.md`                                                    |
| VS Code IDE agent mode                        | Partial | `apps/extension-vscode/src/extension.ts`                                                                                                                                                                     |
| Chrome browser/WebMCP bridge                  | Partial | `apps/extension/src/background.ts`, `apps/extension/src/webmcp.ts`                                                                                                                                           |
| API gateway agents/MCP                        | Gap     | `services/api-gateway/src/routes/agents.ts` and `services/api-gateway/src/mcp/mcpRoutes.ts` exist, but the surface audit found they are not mounted in `services/api-gateway/src/index.ts`.                  |
| Cross-surface data ownership                  | Gap     | Projects, artifacts, memory, teams, and billing each have multiple owners; see `surface-gap-ledger.md`.                                                                                                      |

## Immediate Classification Gaps

- Custom slash commands from project/user markdown files.
- MCP prompt discovery and slash command injection.
- Agent manager UI and tool scoping.
- Cross-surface privacy mode contract.
- Synced app conversation schema for Web/Mobile/Desktop.
- Separate developer session schema for CLI/VS Code/Chrome.
- Explicit developer-session handoff schema into synced app chats.
- Provider mode and provider capability matrix.
- Web AI SDK event-to-AGI-event adapter.
- OpenAI Responses-first native path with Local/BYOK `store: false` tests.
- Vercel AI Gateway managed-mode guard tests.
- Compute session schema.
- Generated file and artifact manifest schema.
- Computer action protocol that can map to Playwright, local desktop, VNC, Anthropic computer use, and OpenAI computer use.
- Generated-file preview/download/share cards across Web/Mobile/Desktop.
- Artifact schema and versioning contract.
- Project schema and Claude project import.
- Cloud waitlist/managed usage ledger boundary.
- Typed event protocol and durable session manager.
- Declarative tool registry separate from executors.
- Cross-surface owner contract for projects, artifacts, memory, teams, and billing.
- API gateway `agents` and `mcp` route mounting/initialization decision.
