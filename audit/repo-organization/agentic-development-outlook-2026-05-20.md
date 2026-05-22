# Agentic Development Outlook And A+ Repo Implications

Status: Current strategic evidence
Owner: Platform lead
Last updated: 2026-05-21

Purpose: lock the long-term assumption that AGI Workforce should be organized for a future where most implementation work is delegated to LLM coding agents, while humans own product judgment, architecture, safety, review, and release accountability.

## Core Thesis

The next durable developer workflow is not autocomplete. It is agentic software work: a human describes a goal, multiple agents explore and implement in isolated environments, tests and logs become the review substrate, and a human merges only after verification.

AGI Workforce should therefore be an **agent-native monorepo**. The repo must be easy for humans, but it must also be optimized for agents that search, plan, edit, test, summarize, fork, resume, and open PRs.

This does not mean no one understands code. It means the scarce skill shifts upward:

- Humans write better product specs, architecture constraints, review criteria, and release policy.
- Agents do more first-draft implementation, repetitive refactors, test expansion, docs updates, and bug localization.
- Repo structure, ownership, tests, and docs become part of the product because they determine how well agents can safely operate.

## Current External Signals

| Source                                                                                                                                     | Signal                                                                                                                                                           | Repo implication                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| OpenAI Codex product page, `https://openai.com/codex/`                                                                                     | Codex is positioned as a coding agent for real engineering work, multi-agent workflows, built-in worktrees, cloud environments, and team skills.                 | AGI needs first-class worktree/session isolation, task ledgers, skill/rule loading, and cloud/local parity.            |
| OpenAI Codex launch post, `https://openai.com/index/introducing-codex/`                                                                    | Codex cloud runs tasks in separate cloud sandboxes, proposes PRs, exposes citations/logs/test results, and recommends assigning scoped tasks to multiple agents. | AGI repo docs must define scoped tasks, verification commands, and evidence expectations for every surface.            |
| OpenAI Codex docs, `https://developers.openai.com/codex/cloud`                                                                             | Codex cloud can work in the background, in parallel, using configured repo environments.                                                                         | AGI needs deterministic environment setup, setup scripts, and CI checks agents can run without human tribal knowledge. |
| Claude Code docs, `https://code.claude.com/docs/en/how-claude-code-works`                                                                  | Claude Code follows gather-context, take-action, verify-results; supports local, cloud, and remote-control execution; sessions are resumable/forkable.           | AGI should model every dev task as context, action, verification, artifacts, and session lineage.                      |
| Claude Code parallel agents docs, `https://code.claude.com/docs/en/agents`                                                                 | Subagents, background agents, agent teams, isolated worktrees, and batch PRs are distinct parallel work modes.                                                   | AGI repo must make file ownership and write scopes explicit enough to split work safely.                               |
| Claude Code memory docs, `https://code.claude.com/docs/en/memory`                                                                          | Project memory, `AGENTS.md`, path-scoped rules, and compact instruction files reduce context noise.                                                              | AGI should keep root agent instructions small and push path-specific rules into scoped docs.                           |
| GitHub Copilot cloud agent docs, `https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent`                        | Copilot cloud agent uses ephemeral GitHub Actions environments to explore code, edit, run tests, create branches, and optionally open PRs.                       | AGI needs CI/workflow parity with local commands and machine-readable task/test ownership.                             |
| GitHub coding agent press release, `https://github.com/newsroom/press-releases/coding-agent-for-github-copilot`                            | GitHub frames the future as configurable, steerable, verifiable agent collaboration with controlled internet access and human approval before workflows run.     | AGI must define approval gates, internet/network policy, and human review requirements for agent-generated code.       |
| Google Gemini CLI launch, `https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemini-cli-open-source-ai-agent/` | Gemini CLI is open source, terminal-native, MCP/extensible, non-interactive/scriptable, and shares technology with IDE agent mode.                               | AGI should keep CLI, IDE, Desktop, and cloud flows on shared runtime contracts instead of surface-specific logic.      |

## 2026 Direction Check

The latest public direction reinforces the same thesis:

- Claude Code is moving toward multi-session agent management, desktop session orchestration, web/cloud sessions, scheduled/remote work, and mobile push notifications when the agent needs human input.
- OpenAI positions Codex as a coding agent available across local, cloud, Slack, computer-use, and long-horizon workflows.
- GitHub positions coding agents as issue-to-draft-PR workers that run in controlled Actions environments and still require human approval.
- Google positions Gemini CLI as an open, terminal-native, MCP-extensible agent that shares technology with IDE workflows.

AGI's repo must therefore optimize for agent-directed development now: scoped tasks, isolated sessions, reviewable diffs, repeatable setup, explicit trust boundaries, and verification logs.

## Local Reference Corpus

AGI should keep learning from the local reference sources under `/Users/siddhartha/Desktop/reference`, but only architecture and product patterns should be reused unless license review permits more.

| Reference              | Raw file count | What to study first                                                                                                 |
| ---------------------- | -------------: | ------------------------------------------------------------------------------------------------------------------- |
| `reference/src`        |           1902 | Claude-like CLI/TUI architecture, commands, tools, sessions, memory, skills, plugins, remote, tasks, output styles. |
| `reference/codex-cli`  |           4009 | Rust engine split, AGENTS.md contract, cloud/local task boundary, patch/apply workflow, sandboxing, protocol shape. |
| `reference/gemini-cli` |           2632 | Open-source terminal agent ergonomics, MCP/extensions, config, evals, memory/perf tests, schemas.                   |
| `reference/opencode`   |           4182 | Multi-package agent platform shape, specs, sdks, infra, agent/tool configuration.                                   |
| `reference/openclaw`   |          17231 | Application-suite repo breadth, agent folders, QA/security/deploy organization, extension packaging.                |
| `reference/claw-code`  |            224 | Small Claude-like CLI structure and Rust bridge ideas.                                                              |
| `reference/ui`         |            730 | UI capture baselines for Claude, ChatGPT, Codex, Gemini, Perplexity, and terminal/desktop parity.                   |

## A+ Agent-Native Repo Rules

1. Root stays boring.
   Root should contain only product entry points, workspace manifests, source-of-truth docs, and tool configs that truly must be root-level.

2. Every durable doc has status.
   Current, historical, scratch, generated, superseded, and deprecated docs must be machine-classified so agents stop citing stale plans as truth.

3. Every code boundary explains itself locally.
   Every app, package, crate, service, database area, and shared schema needs a README with owner role, purpose, public API, non-goals, commands, and review risks.

4. Agent instructions are layered.
   `AGENTS.md` is the tool-neutral root contract. `CLAUDE.md` mirrors it only for Claude. Path-specific guidance should live near the code or in scoped agent-context files, not in one huge root prompt.

5. Work is split by ownership.
   Large refactors must be expressible as non-overlapping write scopes so subagents and worktrees can operate safely.

6. Verification is close to code.
   Each surface/package README must list the smallest useful check and the stronger pre-merge check. Agents should never guess test commands.

7. Generated artifacts are explicit.
   Screenshots, reports, benchmark outputs, logs, and generated files must have retention rules and approved locations.

8. Cloud, BYOK, and local boundaries are visible in code ownership.
   Provider adapters, local runtime, managed runtime, generated-file handling, and sync schemas must have separate owner paths and tests.

9. CI enforces the operating model.
   `pnpm check:llm-operability` should become required. Later checks should fail new root clutter, missing README coverage, stale doc status, import-boundary violations, unowned packages, and generated artifacts in source paths.

10. Human review is mandatory for agent merges.
    Agents may implement and test, but release branches require human review of privacy, auth, billing, file-system, network, model-routing, and generated-artifact behavior.

## Required AGI Implementation Work

- Add an `agent-native` section to `PLAN.md`.
- Add reference-corpus audit tracking for every local reference source, with license status and architecture-only notes.
- Add package/service/crate ownership ledger and CODEOWNERS.
- Add README coverage checks for apps, packages, crates, and services.
- Add path-scoped agent rules for high-risk surfaces after root cleanup.
- Add CI job for `pnpm check:llm-operability`.
- Add generated-artifact drift check after scratch files are moved.
- Add worktree/session isolation guidance for parallel AGI development.
- Add agent task templates for exploration, implementation, review, and verification.
- Keep managed cloud compute waitlisted until billing/fraud/abuse policy is designed, but build local/BYOK/private-compute contracts now.
