---
description: "Hooks system: types, auto-accept permissions, best practices"
alwaysApply: true
---
# Hooks System

## Hook Types

- **beforeShellExecution**: Block dangerous commands, enforce tmux for dev servers
- **afterShellExecution**: Log PR creation, build completion, cargo results
- **afterFileEdit**: Auto-format, TypeScript check, console.log warning
- **beforeMCPExecution**: Audit log MCP tool invocations
- **afterMCPExecution**: Log MCP results
- **beforeReadFile**: Warn on sensitive file access
- **beforeSubmitPrompt**: Detect secrets in prompts
- **beforeTabFileRead**: Block Tab from reading secrets
- **afterTabFileEdit**: Auto-format Tab edits
- **preCompact**: Save state before context compaction
- **stop**: console.log audit on modified files

## Hook Profiles

Control via `AGI_HOOK_PROFILE` environment variable:
- `minimal` — session lifecycle only
- `standard` — default, most hooks active
- `strict` — all hooks including tmux reminders and git push reviews

Disable specific hooks via `AGI_DISABLED_HOOKS=hook1,hook2`

## Auto-Accept Permissions

Use with caution:
- Enable for trusted, well-defined plans
- Disable for exploratory work
- Never use dangerously-skip-permissions flag
