# Agent Harness Rollout

Status: Current
Owner: Platform lead
Last updated: 2026-05-21
Purpose: lock how AGI Workforce applies large-codebase coding-agent rollout patterns to this repo and to future AGI developer tooling.

Source context: Claude Code at-scale guidance shared by the founder on 2026-05-21, including Anthropic's "How Claude Code works in large codebases" article: https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start

## Principle

The model matters, but the harness decides day-to-day performance in a large codebase.

For AGI Workforce, the harness is the repo structure, context files, hooks, skills, plugins, LSP/MCP integrations, and subagent lane system that lets agents find the right context without loading the entire monorepo into every session.

## Layer Order

| Layer                     | What it is                                   | When it loads                                | AGI rule                                                                                                          | Common failure to avoid                                                  |
| ------------------------- | -------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `AGENTS.md` / `CLAUDE.md` | Root and path-scoped operating context       | Every session or when entering a scoped path | Keep root files as pointers, non-negotiables, and critical gotchas; put local conventions near the owner path     | Turning root context into a large reusable knowledge dump                |
| Hooks                     | Deterministic checks and session automation  | Triggered by git/tool/session events         | Enforce formatting, structure, agent context, hooks, and operability checks through scripts                       | Relying on prompts for rules that a command can enforce                  |
| Skills                    | On-demand reusable expertise                 | Only when relevant                           | Keep specialized workflows as skills or docs that can be invoked by task/path                                     | Loading every specialty into root context                                |
| Plugins                   | Bundled skills, hooks, MCP config, and setup | Installed once, then available               | Use plugins to distribute working setups after contracts stabilize                                                | Letting good local setups stay tribal                                    |
| LSP                       | Symbol-level navigation                      | Available through editor/tool integration    | Prefer symbol navigation for large refactors where text search is ambiguous                                       | Grepping common names and reading thousands of false matches             |
| MCP                       | External/internal tool connections           | Available when configured and approved       | Use MCP for structured access to internal tools, docs, tickets, analytics, and future AGI services                | Building MCP integrations before local basics and permission policy work |
| Subagents                 | Separate context windows for bounded tasks   | When explicitly delegated                    | Use explorers for mapping and implementers for disjoint write lanes; return findings or patches to the integrator | Mixing broad exploration and risky editing in one overloaded context     |

## Repo Application

- Root `AGENTS.md` stays the canonical tool-neutral entry point. `CLAUDE.md` stays Claude-specific and points back to root truth.
- Surface/path `AGENTS.md` files carry local high-risk rules only. Surface READMEs carry owner, purpose, layout, and commands.
- Service-layer architecture is part of the harness: agents should not duplicate provider, sandbox, database, generated-file, browser/computer-use, or transport mechanics across actions/routes when a shared service API is the right owner.
- Agents should start in the narrowest owner path that matches the task when possible, while still reading root context through the documented read order.
- Test and lint commands should be surface-scoped first. Run repo-wide checks when shared contracts, root docs, guardrails, boundaries, or generated-artifact policy changed.
- Generated files, build output, screenshots, and reports must be ignored or placed under approved report/audit paths so agents do not waste context.
- `docs/agent-context/repo-map.json`, `risk-map.json`, `commands.json`, and local READMEs are the codebase map. Keep them current instead of adding long prose to root context.
- LSP support is a high-value future investment for TypeScript, Rust, Swift/Kotlin, and native extension work. Until then, use `rg`, typecheck errors, and local owner READMEs as the navigation baseline.
- MCP and plugin work must follow the same privacy boundaries as the product: no silent Local to BYOK/Managed handoff, no unreviewed secret-bearing workflows.

## Rollout Phases

1. **Quiet investment before broad access.**
   - Keep root/path context lean and layered.
   - Wire hooks and operability checks.
   - Build lane maps, repo maps, risk maps, and local owner READMEs.
   - Define approved skills/plugins/MCP policy before broad team usage.

2. **Day-one rollout.**
   - Give engineers working setup defaults, not a blank tool.
   - Start with a curated skill/plugin set and clear approval rules.
   - Route high-risk work through the existing PR and CODEOWNERS gates.

3. **Adoption spread.**
   - Promote repeated successful workflows into skills/plugins.
   - Review context files every 3-6 months and after major model/tool releases.
   - Remove instructions that compensate for old model limitations once they become overhead.

## Ownership

The platform lead is the DRI for the coding-agent harness until a formal developer-experience owner exists.

Responsibilities:

- Keep `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`, `.agents/`, hooks, skills, plugin contracts, and MCP policy coherent.
- Review new root/path context files for scope and size.
- Promote repeated successful agent workflows into reusable docs, skills, or plugins.
- Run quarterly harness reviews and archive stale instructions.
- Keep `pnpm check:llm-operability` aligned with the harness contract.
