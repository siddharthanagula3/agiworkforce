---
description: "Agent orchestration: parallel execution, multi-perspective analysis"
alwaysApply: true
---
# Agent Orchestration

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth module
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utilities

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer (Rust + TypeScript)
- Security expert
- Consistency reviewer
- Redundancy checker

## AGI Workforce-Specific Agents

| Task | Approach |
|------|----------|
| Complex feature | Plan first, identify cross-stack (Rust/TS/Web) impacts |
| Code review | Review Rust and TypeScript changes separately |
| Bug fix | Check if issue spans frontend-backend boundary |
| Architecture | Consider Tauri v2 patterns, IPC, state management |
| Security | Use ToolGuard patterns, SecretManager, input validation |
