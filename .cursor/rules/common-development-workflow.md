---
description: "Development workflow: plan, TDD, review, commit pipeline"
alwaysApply: true
---
# Development Workflow

> This rule extends the git workflow rule with the full feature development process that happens before git operations.

## Feature Implementation Workflow

1. **Plan First**
   - Create implementation plan for complex features
   - Identify dependencies and risks
   - Break down into phases
   - For cross-stack work: identify Rust, TypeScript, and web impacts

2. **Research Before Features**
   - Research the market (web search) before implementing user-facing features
   - Check live API docs before using model IDs, SDK methods, or pricing
   - Never rely on training data for rapidly-changing external APIs

3. **TDD Approach** (when tests are requested)
   - Write tests first (RED)
   - Implement to pass tests (GREEN)
   - Refactor (IMPROVE)
   - Do NOT run tests unless explicitly asked

4. **Code Review**
   - Review code immediately after writing
   - Address CRITICAL and HIGH issues
   - Fix MEDIUM issues when possible

5. **Commit & Push**
   - Conventional commits: `type(scope): lowercase subject`
   - Max 100 chars header, subject MUST be lowercase
   - Follow git workflow rule for commit format and PR process
