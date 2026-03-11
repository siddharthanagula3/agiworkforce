---
description: Orchestrate multiple agents for complex cross-workspace tasks
agent: planner
subtask: true
---

# Orchestrate Command

Orchestrate multiple specialized agents for this complex task: $ARGUMENTS

## Your Task

1. **Analyze task complexity** and break into subtasks
2. **Identify optimal agents** for each subtask
3. **Create execution plan** with dependencies
4. **Coordinate execution** - parallel where possible
5. **Synthesize results** into unified output

## Available Agents

| Agent | Specialty | Use For |
|-------|-----------|---------|
| planner | Implementation planning | Complex feature design |
| architect | System design | Architectural decisions, IPC design |
| code-reviewer | Code quality | Review TS + Rust changes |
| security-reviewer | Security analysis | ToolGuard, SecretManager compliance |
| tdd-guide | Test-driven dev | Feature implementation |
| build-error-resolver | Build fixes | TypeScript + Rust build errors |
| e2e-runner | E2E testing | User flow testing |
| doc-updater | Documentation | Updating CLAUDE.md, codemaps |
| refactor-cleaner | Code cleanup | Dead code removal |
| rust-reviewer | Rust code | Tauri, async, clippy review |
| rust-build-resolver | Rust builds | cargo check/clippy errors |
| database-reviewer | Database | SQLite, Supabase, migrations |

## Orchestration Patterns

### Sequential Execution
```
planner -> tdd-guide -> code-reviewer -> security-reviewer
```
Use when: Later tasks depend on earlier results

### Parallel Execution
```
          +-> security-reviewer
planner ->+-> code-reviewer
          +-> rust-reviewer
```
Use when: Tasks are independent

### Fan-Out/Fan-In
```
           +-> agent-1 --+
planner -> +-> agent-2 --+-> synthesizer
           +-> agent-3 --+
```
Use when: Multiple perspectives needed

---

**NOTE**: Complex tasks benefit from multi-agent orchestration. Simple tasks should use single agents directly.
