# AGI Workforce — Agent Roster

> Defines all custom agents, their models, zone assignments, and responsibilities.
> Referenced by CLAUDE.md. Updated when agents are added/removed.

## Project Agents (.claude/agents/)

### Tier 1: Opus (Complex Reasoning, Architecture, Security)

| Agent                        | File                            | Zone         | Responsibilities                                                             |
| ---------------------------- | ------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| agent-runtime-engineer       | agent-runtime-engineer.md       | B (services) | Agent execution engine, task scheduling, lifecycle management                |
| computer-use-vision-engineer | computer-use-vision-engineer.md | SYSTEM       | Screenshot capture, OCR, vision analysis, screen monitoring                  |
| llm-router-engineer          | llm-router-engineer.md          | B (services) | Model routing, provider switching, custom model integration, fallback chains |
| memory-embeddings-engineer   | memory-embeddings-engineer.md   | B (services) | Memory system, embeddings, knowledge graph, MEMORY.md management             |
| rust-tauri-engineer          | rust-tauri-engineer.md          | SYSTEM       | All Rust/Tauri code, Tauri commands, system integration                      |
| security-auditor             | security-auditor.md             | ALL (read)   | ToolGuard, encryption, permission system, vulnerability scanning             |
| integration-reviewer         | integration-reviewer.md         | ALL (read)   | Cross-module integration review, API contract validation                     |
| team-lead-orchestrator       | team-lead-orchestrator.md       | SHARED       | Sprint orchestration, task delegation, agent coordination                    |
| spec-handoff-writer          | spec-handoff-writer.md          | F (docs)     | Specification documents, handoff notes, architecture docs                    |
| research-orchestrator-fix    | research-orchestrator-fix.md    | F (docs)     | Market research coordination, web search, competitor analysis                |

### Tier 2: Sonnet (Implementation, Features)

| Agent                      | File                          | Zone   | Responsibilities                                                |
| -------------------------- | ----------------------------- | ------ | --------------------------------------------------------------- |
| frontend-engineer          | frontend-engineer.md          | A      | React components, pages, styles, UI state                       |
| backend-engineer           | (infer)                       | B      | API endpoints, services, middleware                             |
| database-engineer          | database-engineer.md          | C      | Schema, migrations, ORM models, queries                         |
| billing-stripe-engineer    | billing-stripe-engineer.md    | D      | Stripe integration, payments, subscriptions, invoicing          |
| browser-extension-engineer | browser-extension-engineer.md | D      | Browser automation, extension, web scraping                     |
| mcp-integration-engineer   | mcp-integration-engineer.md   | D      | MCP server connections, tool registration, extension management |
| speech-audio-engineer      | speech-audio-engineer.md      | D      | Voice input (Whisper), TTS (Piper/Deepgram), audio processing   |
| code-cleanup-refactor      | code-cleanup-refactor.md      | ALL    | Dead code removal, refactoring, code quality                    |
| shared-types-guardian      | shared-types-guardian.md      | SHARED | TypeScript types, API contracts, interface definitions          |
| test-writer                | test-writer.md                | ALL    | Test suites — ONLY when explicitly told to test                 |
| git-branch-manager         | git-branch-manager.md         | SHARED | Git operations, branching strategy, merge management            |

### Tier 3: Haiku (Lightweight, Fast)

| Agent                    | File                        | Zone | Responsibilities                             |
| ------------------------ | --------------------------- | ---- | -------------------------------------------- |
| devops-build-engineer    | devops-build-engineer.md    | E    | Docker, CI/CD, GitHub Actions, build scripts |
| documentation-sync-agent | documentation-sync-agent.md | F    | Docs, README, CHANGELOG, API documentation   |
| progress-state-tracker   | progress-state-tracker.md   | F    | SESSION_STATE.md updates, progress tracking  |

## Plugin Agents

| Agent                 | Plugin            | Model   | Purpose                          |
| --------------------- | ----------------- | ------- | -------------------------------- |
| agent-creator         | plugin-dev        | sonnet  | Creates new agent definitions    |
| plugin-validator      | plugin-dev        | inherit | Validates plugin structure       |
| skill-reviewer        | plugin-dev        | inherit | Reviews skill quality            |
| code-architect        | feature-dev       | sonnet  | Architecture for new features    |
| code-explorer         | feature-dev       | sonnet  | Codebase exploration and mapping |
| code-reviewer         | feature-dev       | sonnet  | Code review                      |
| code-reviewer         | pr-review-toolkit | opus    | PR-focused code review           |
| code-simplifier       | pr-review-toolkit | opus    | Code simplification              |
| comment-analyzer      | pr-review-toolkit | inherit | PR comment analysis              |
| pr-test-analyzer      | pr-review-toolkit | inherit | Test coverage analysis           |
| conversation-analyzer | hookify           | inherit | Conversation pattern analysis    |
| code-simplifier       | code-simplifier   | opus    | Complexity reduction             |
| agent-sdk-verifier-py | agent-sdk-dev     | sonnet  | Python SDK verification          |
| agent-sdk-verifier-ts | agent-sdk-dev     | sonnet  | TypeScript SDK verification      |

## When To Use Which Agent Type

**Sub-agents** (Task tool): Focused, isolated work. Good for single-file implementation, research, verification. Own context, returns summary only. Use when main context is getting heavy.

**Agent teams** (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1): Parallel work where teammates need to communicate. Good for multi-zone sprints, competing hypotheses, parallel feature work. Each gets own session.

**Direct invocation** (@agent-name): Quick delegation within current context. Good for asking a specialist a question or having them review something specific.

## Model Assignment Rules

- Any agent can use custom models (Ollama, Groq, etc.) alongside cloud models
- Model is set in agent frontmatter `model:` field (opus/sonnet/haiku/inherit)
- `inherit` uses whatever model the parent session is using
- Users can override per-agent model in Settings > Agents

## Skills

A skill is a set of local instructions to follow that is stored in a `SKILL.md` file.

### Available skills

- `skill-creator`: Guide for creating effective skills. Use when creating or updating a skill that extends Codex capabilities. (file: `/Users/siddhartha/.codex/skills/.system/skill-creator/SKILL.md`)
- `skill-installer`: Installs Codex skills into `$CODEX_HOME/skills` from curated list or GitHub repo path. (file: `/Users/siddhartha/.codex/skills/.system/skill-installer/SKILL.md`)

### How to use skills

- Discovery: The list above is the skills available in this session (name + description + file path).
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a listed skill description, use that skill for that turn.
- Missing/blocked: If a named skill is unavailable or its path cannot be read, say so briefly and continue with the best fallback.
- Progressive disclosure:
  1. Open the skill `SKILL.md` and read only enough to follow the workflow.
  2. Resolve relative paths in skill docs relative to the skill directory first.
  3. Load only specific reference files needed; avoid bulk-loading.
  4. Prefer using existing skill scripts/templates/assets rather than recreating.
- Coordination:
  1. If multiple skills apply, use the minimal set and state order.
  2. Announce which skills are used and why in one short line.
- Context hygiene:
  1. Keep context small: summarize long content instead of pasting.
  2. Avoid deep reference chasing unless blocked.
- Safety and fallback: If a skill cannot be applied cleanly, state the issue, pick next-best approach, and continue.
