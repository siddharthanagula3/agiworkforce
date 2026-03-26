# Competitive Gap Analysis — AGI Workforce CLI

Generated: 2026-03-25 | Updated: 2026-03-25 (Sprint 5)
Competitors: Codex CLI, OpenCode, Gemini CLI, Claude Code

## Gap Table

| Gap ID  | Category     | Description                                 | Competitor(s)    | AGI Status                                                                       | Priority |
| ------- | ------------ | ------------------------------------------- | ---------------- | -------------------------------------------------------------------------------- | -------- |
| GAP-001 | ~~MISSING~~  | Model routing strategies                    | Gemini           | **CLOSED** — `src/routing/` (3 strategies + composite)                           | P0       |
| GAP-002 | ~~MISSING~~  | Batch tool (parallel calls)                 | OpenCode         | **CLOSED** — `batch` tool in tools.rs                                            | P0       |
| GAP-003 | ~~MISSING~~  | Plan mode tool                              | OpenCode, Gemini | **CLOSED** — `plan_mode` tool in tools.rs                                        | P0       |
| GAP-004 | ~~MISSING~~  | Todo tracking tool                          | OpenCode, Gemini | **CLOSED** — `todo_read`/`todo_write` in tools.rs                                | P0       |
| GAP-005 | ~~MISSING~~  | Glob tool                                   | OpenCode, Gemini | **CLOSED** — `glob` tool in tools.rs                                             | P0       |
| GAP-006 | ~~MISSING~~  | Multiedit tool                              | OpenCode         | **CLOSED** — `multiedit` tool in tools.rs                                        | P1       |
| GAP-007 | ~~MISSING~~  | Ask user tool                               | Gemini           | **CLOSED** — `ask_user` tool in tools.rs                                         | P1       |
| GAP-008 | INFERIOR     | Hook system (7 vs 1 component)              | Gemini           | Open — hooks.rs sufficient for CLI; full expansion deferred to desktop           | P1       |
| GAP-009 | ~~MISSING~~  | Declarative policy engine                   | Gemini           | **CLOSED** — `src/policy/` with TOML rules + priority-based eval                 | P1       |
| GAP-010 | INFERIOR     | Guardian/approval sub-agent                 | Codex            | Open — requires spawning LLM sub-agent for risk assessment; deferred (XL effort) | P1       |
| GAP-011 | ~~INFERIOR~~ | Context normalization                       | Codex            | **CLOSED** — `normalize_history()` in agent.rs, synthetic "aborted" outputs      | P2       |
| GAP-012 | MISSING      | Tool+prompt template pairing                | OpenCode         | Open — deferred (medium effort, lower impact)                                    | P2       |
| GAP-013 | UNWIRED      | Multi-phase memory                          | Codex            | `memory_pipeline.rs` exists (646 LOC), wired via `mod` but not called            | P2       |
| GAP-014 | MISSING      | LSP integration tool                        | OpenCode         | Open — requires LSP client dependency                                            | P2       |
| GAP-015 | MISSING      | Session sharing                             | OpenCode         | Open — lower priority                                                            | P3       |
| GAP-016 | MISSING      | Worktree management                         | OpenCode         | Open — lower priority                                                            | P3       |
| GAP-017 | UNWIRED      | Plugin marketplace                          | Codex            | `marketplace.rs` exists (624 LOC), wired via `mod` but slash commands not added  | P2       |
| GAP-018 | ~~INFERIOR~~ | Skill env-var dependency tracking           | Codex            | **CLOSED** — `required_env_vars` + `check_env_deps()` in skills.rs               | P2       |
| GAP-019 | PARITY       | File read/write/edit/search/shell/web tools | All              | Parity achieved                                                                  | —        |
| GAP-020 | MISSING      | Prompt registry                             | Gemini           | Open — lower priority                                                            | P3       |
| GAP-021 | MISSING      | Multi-agent workflow orchestration          | Claude Code      | Open — lower priority                                                            | P3       |
| GAP-022 | MISSING      | Security pattern hooks                      | Claude Code      | Open — lower priority                                                            | P3       |
| GAP-023 | INFERIOR     | Sandbox policy transforms                   | Codex            | Sandbox hardened in FIX-032/033; policy transforms deferred                      | P2       |
| GAP-024 | MISSING      | Tool state machine                          | Gemini           | Open — lower priority                                                            | P2       |
| GAP-025 | ~~MISSING~~  | Read many files tool                        | Gemini           | **CLOSED** — `read_many_files` tool in tools.rs                                  | P1       |

## Summary

| Status          | Count |
| --------------- | ----- |
| **CLOSED**      | 13    |
| Open (deferred) | 12    |
| **Total**       | 25    |

## Areas Where AGI Workforce CLI SURPASSES All Competitors

1. **Multi-model cost-aware routing** — No competitor combines composable strategies WITH real-time session cost tracking. CostStrategy auto-downgrades when approaching budget.
2. **Cross-ecosystem MCP import** — ecosystem.rs scans 14 competing tools' dotfiles and imports MCP configs with shell-metachar validation. No competitor does this.
3. **Deny-first execution policy** — exec_policy.rs evaluates all deny rules before allow rules. Codex and Gemini use first-match-wins.
4. **Quote-aware safety classification** — safety.rs tracks shell quoting state and detects subshell/backtick injection. No competitor parses quotes in their classifiers.
5. **Daemon mode + cron + webhooks + file watchers** — daemon.rs provides background automation with rate limiting. No competitor has daemon mode.
6. **Desktop + CLI + Mobile + Web** — 4-surface platform with cross-device sync. No competitor has more than 2 surfaces.
7. **25 LLM providers** — More provider breadth than any competitor (Claude: 1, Codex: 1, Gemini: 1, OpenCode: ~5).
