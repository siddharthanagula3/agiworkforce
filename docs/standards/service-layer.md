# Service Layer Architecture

Status: Current
Owner: Platform lead
Last updated: 2026-05-21
Purpose: lock how AGI Workforce separates product orchestration from reusable operational mechanics across apps, services, packages, and future agent-driven refactors.

## Principle

Actions/routes orchestrate domain rules. Service functions own reusable mechanics.

This is a two-layer rule:

| Layer         | Owns                                                                                                                                         | Examples                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Orchestration | Product meaning, auth, ownership checks, policy, state transitions, user-facing error classification, retry choice                           | API routes, server actions, command handlers, UI workflow submit handlers                                              |
| Service layer | Provider calls, SDK interactions, sandbox setup, command execution details, readiness checks, file generation mechanics, transport mechanics | Neon helpers, provider adapters, managed compute helpers, document generation helpers, browser/computer action runners |

Rule of thumb:

- "What this product flow means" stays in the action, route, or command handler.
- "How to do this operation reliably" moves to a service function once it has two callers or clear cross-surface reuse.

## When To Extract

Extract a service only when at least one condition is true:

- Multiple callers perform the same low-level operation.
- A bug fix in one flow should automatically protect another flow.
- A new feature needs mechanics that already exist in another domain.
- The action/route is hard to review because provider or execution details hide the domain decision.

Do not extract logic used by only one caller unless it is a high-risk boundary such as secrets, payments, filesystem writes, browser control, managed compute, or generated files.

## API Shape

Service functions must be composable capability blocks, not "do everything" flows.

Good service names:

- `createManagedSandbox`
- `prepareRepo`
- `detectPackageManager`
- `installDependencies`
- `runBuildCommand`
- `startSandboxRuntime`
- `reserveManagedUsage`
- `renderGeneratedFileManifest`

Each service function must:

- Accept all required data through explicit parameters.
- Return structured outputs.
- Avoid hidden global state beyond stable configuration/env helpers.
- Avoid direct domain state transitions unless the service is explicitly a repository/data-access helper.
- Make failures explicit with structured results or typed errors.
- Leave auth, ownership, policy, and user-facing classification to the caller.

## Migration Checklist

Use this order when extracting repeated mechanics:

1. Write or read the product flow in action/route code first so behavior is obvious.
2. Mark repeated non-domain chunks across two or more callers.
3. Extract only the repeated mechanics to a service function.
4. Replace one caller.
5. Verify with the smallest owner-path check.
6. Replace the remaining callers.
7. Keep auth, ownership, status transitions, privacy-mode decisions, quota policy, and user-facing errors in orchestration.
8. Add a guardrail when the extracted pattern should not drift back.

## Anti-Patterns

| Anti-pattern     | Why it fails                                                                         |
| ---------------- | ------------------------------------------------------------------------------------ |
| God service      | Hides domain control flow and makes policy review harder.                            |
| Leaky service    | Mutates product state from a reusable mechanics helper.                              |
| Inconsistent API | Forces every caller to guess argument and error semantics.                           |
| Over-abstraction | Adds indirection before there is real reuse.                                         |
| Prompt-only rule | Lets agents reintroduce duplicated mechanics because no check enforces the boundary. |

## AGI-Specific Boundaries

Keep these decisions in orchestration:

- Local, BYOK, and Managed privacy-mode transitions.
- Local to BYOK handoff consent, secret scan, preview, and provider label.
- Managed compute eligibility, quota reservation, refund, dispute, fraud, and abuse decisions.
- Cross-surface chat sync decisions.
- Connector permission prompts and admin policy outcomes.
- Tool approval prompts and dangerous-action classification.

Move these mechanics behind services when reused:

- Provider request construction and streaming normalization.
- Neon client creation and typed table access.
- Managed compute health checks, reservation plumbing, and settlement plumbing.
- Browser/computer action dispatch and screenshot capture.
- Generated-file manifest creation, checksum, TTL, preview derivative, and cleanup.
- MCP connector transport and registry access.

## Enforcement

- `pnpm check:service-layer` verifies this architecture doc is wired into agent context and prevents new local duplicate definitions of canonical shared contracts.
- `pnpm check:llm-operability` runs the service-layer check with the rest of the agent-operability gates.
- New service-layer exceptions must be documented in this file or in a current decision doc in the same change.
