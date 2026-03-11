---
description: Create implementation plan with risk assessment
agent: planner
subtask: true
---

# Plan Command

Create a detailed implementation plan for: $ARGUMENTS

## Your Task

1. **Restate Requirements** - Clarify what needs to be built
2. **Identify Affected Workspaces** - Desktop (Tauri/Rust + React/TS), Web (Next.js), Mobile (React Native), Extension, Services
3. **Identify Risks** - Surface potential issues, blockers, and dependencies
4. **Create Step Plan** - Break down implementation into phases
5. **Wait for Confirmation** - MUST receive user approval before proceeding

## Output Format

### Requirements Restatement
[Clear, concise restatement of what will be built]

### Affected Workspaces
[Which apps/packages/services are impacted]

### Implementation Phases
[Phase 1: Description]
- Step 1.1
- Step 1.2
...

[Phase 2: Description]
- Step 2.1
- Step 2.2
...

### Dependencies
[List external dependencies, APIs, services needed]

### Risks
- HIGH: [Critical risks that could block implementation]
- MEDIUM: [Moderate risks to address]
- LOW: [Minor concerns]

### Estimated Complexity
[HIGH/MEDIUM/LOW with time estimates]

**WAITING FOR CONFIRMATION**: Proceed with this plan? (yes/no/modify)

---

**CRITICAL**: Do NOT write any code until the user explicitly confirms with "yes", "proceed", or similar affirmative response.
