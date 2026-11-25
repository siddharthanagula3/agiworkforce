---
id: "F101-06"
type: "feature"
title: "Tools, approvals, skills and the coding-session protocol"
aliases: ["tool registry", "tool metadata", "approval contracts", "tool approval resume", "skill manifests", "SKILL.md golden fixtures", "coding-session protocol", "generated protocol types", "S101.20", "S101.21", "S101.23", "S101.25"]
area: "101 Shared package boundaries"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S101.20", "S101.21", "S101.23", "S101.25"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-local-inference", "SYS-execution-boundaries", "F101-01", "surface:vscode", "surface:chrome", "surface:cli", "file:packages/contracts/types/src/generated/protocol"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F101-06 Tools, approvals, skills and the coding-session protocol

Tools, approvals, skill manifests and the local coding-session protocol are each declared once. The tool registry guard has an empty undeclared list. Approval request and resume bodies are shared. Skill manifests are tested against one golden file in TypeScript and Rust. The coding-session protocol is generated from Rust and CI checks drift.

Area: [101. Shared package boundaries](README.md). Requirement items: [S101.20](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10120), [S101.21](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10121), [S101.23](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10123), [S101.25](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10125).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Declares every first-party tool with risk facets in one table (apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:101), shares approval request and resume schemas (packages/contracts/cloud-contracts/src/tool-approval-resume.ts:34), parses SKILL.md manifests in one package checked against a golden file (packages/tools/skills/src/__tests__/manifest-fixtures.test.ts), and generates TypeScript protocol types from Rust (scripts/generate-protocol-types.mjs).

**Why it exists.** An undeclared tool silently becomes an irreversible write that accepts untrusted content (scripts/check-tool-registry.mjs:1-12). The local runtime protocol must not drift between the Rust runtime and its TypeScript clients.

**Who uses it.** People who approve or deny assistant actions, install skills, or use VS Code or Desktop with a local runtime; engineers.

**Problems it solves**

- A new tool offered without a risk declaration
- Approval decisions that disagree between server and clients
- Skill manifests read differently by TypeScript and Rust
- TypeScript types drifting from Rust protocol definitions

**Use cases**

- Approve or deny a tool request; the Chrome options page lists the history (apps/extension/src/features/options/approval-history-section.ts:86-190)
- Install a skill whose SKILL.md is read the same by the skills package and the CLI (apps/cli/src/skills.rs:1697)
- Use VS Code with a local runtime that speaks the generated protocol (apps/extension-vscode/src/integrations/localRuntimeClient.ts:1-10)
- Add a tool: the registry guard demands a declaration with five facets (scripts/check-tool-registry.mjs:27-33)

## 2. User experience

**Where to find it**

- Chrome options page, section 'Approval history' with hint 'Tool requests you allowed or denied in chats on every device, newest first.', buttons 'Newer', 'Older', 'Try again', link 'Open chat' (apps/extension/src/features/options/approval-history-section.ts:86-162)
- Approval buttons use shared labels such as 'Allow', 'Allow once', 'Allow for this chat', 'Always allow' (packages/contracts/types/src/tool-approval-policy.ts:23-29)
- VS Code: local runtime chat and coding sessions
- Desktop (Electron): developer session service (apps/desktop/electron/runtime/developerSessionService.ts)
- Skills install screens on each app: not opened

**Before you start**

- Signed-in account to see approval history ('Sign in to see the approvals you decided on every device.', apps/extension/src/features/options/approval-history-section.ts:189)
- A local runtime for VS Code coding sessions

**Screens and controls**

- Approval history rows: decision verdict, tool name, time, 'Open chat'
- Pager 'Newer' and 'Older' (approval-history-section.ts:115-119)

**Journey**

1. The assistant asks to use a tool
2. The server or local runtime emits an approval-requested event with risk level
3. The person allows or denies; the decision resumes the run (ToolApprovalResumeRequest)
4. The decision shows in the history list on Chrome options

**What the person sees and gets**

- 'Loading approval history…' while fetching (approval-history-section.ts:182)
- Allowed or denied verdict per row
- Skill instructions wrapped as untrusted skill_result in the CLI prompt (apps/cli/src/skills.rs:1221-1232)

**Settings**

- Chrome options 'How approvals work' help link (approval-history-section.ts:97)
- Tool access setting schema exists (packages/contracts/cloud-contracts/src/tool-access-setting.ts); UI not opened

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The tool registry guard requires five facets per tool (actionClass, reversible, acceptsUntrustedContent, createsEgressPath, declared) and its undeclared baseline is an empty map (scripts/check-tool-registry.mjs:27-33,44)
- run_command is declared in the web tool metadata table (apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:190-196)
- An unknown tool name gets UNKNOWN_TOOL_METADATA, which the guard exists to avoid (apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:876-903; scripts/check-tool-registry.mjs:1-12)
- Approval resume request schema, input resume and caller-tool resume exist in cloud-contracts (packages/contracts/cloud-contracts/src/tool-approval-resume.ts:34; apps/extension/src/features/computer-use/cloudAgentClient.ts uses TOOL_APPROVAL_RESUME_PATH)
- Chrome shows approval history (apps/extension/src/features/options/approval-history-section.ts)
- Skill manifest golden file is read by a TypeScript test and a Rust test (packages/tools/skills/src/__tests__/manifest-fixtures.test.ts:1-30; apps/cli/src/skills.rs:1697-1699)
- Protocol generation runs cargo test export_bindings into a staging folder and compares before writing (scripts/generate-protocol-types.mjs:20-40)
- CI runs pnpm check:protocol-types (.github/workflows/ci.yml:823)
- VS Code and Electron import generated protocol types (apps/extension-vscode/src/integrations/localRuntimeClient.ts:4-8; apps/desktop/electron/runtime/developerSessionService.ts:82)
- Generated files include ToolDefinition, ToolApprovalRequest and ToolApprovalOutcome (packages/contracts/types/src/generated/protocol)

**Incomplete**

- The brief says the web tool metadata is still a TypeScript table beside the Rust-generated ToolDefinition, and that run_command keeps its own definitions and approval store; the table is confirmed (tool-metadata.ts:101,190) and the 'own approval store' was not opened
- The brief says undeclared tools went from 11 to 1; the code's baseline map is empty (scripts/check-tool-registry.mjs:44), so the brief is stale or the guard changed
- No shared golden fixture for plugin manifests was found; only SKILL.md has one (search of *.golden.json)
- Approval decision reading on Mobile and Web was not opened

**Present but disconnected or switched off**

- The Tauri build is retained internal code and is not a shipped surface (doc: AGENTS.md section 5)

**Not available**

- Plugin manifest golden fixtures (not found)

## 4. Required behaviour

**Established requirements**

- Tool definitions share one Rust-owned shape and every offerable tool is declared once. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.20)
- Approval requests, decisions and resume share one contract across server and clients. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.21)
- Skill and plugin manifests are parsed by one shared implementation everywhere. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.23)
- The local coding-session protocol is defined once in Rust and generated for every TypeScript consumer, with CI failing on drift. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.25)
- Rust protocol types flow one way into TypeScript; regenerate with pnpm generate:protocol-types, check with pnpm check:protocol-types. (source: (doc: AGENTS.md section 5))

**Acceptance criteria**

1. A tool name offered to the model with no declaration fails check:tool-registry
2. A tool declaration missing any of the five facets fails the guard
3. A change to the Rust protocol without regenerated TypeScript fails check:protocol-types and CI
4. A SKILL.md fixture case yields the same name, description, version, body, tools and env in TypeScript and Rust
5. A denied tool request does not run and shows as denied in approval history
6. Chrome approval history pages with Newer and Older and shows 'Try again' on failure

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Plugin manifests should have a golden file like skills [inferred from S101.23 'skill and plugin']

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add golden fixtures for plugin manifests and parse them in TypeScript and Rust
- [proposed] Generate the web tool metadata from the Rust ToolDefinition
- [proposed] Move run_command's approval store behind the shared approval contract

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | Tool metadata table | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Risk facets for every first-party tool |
| command | check:tool-registry | `scripts/check-tool-registry.mjs` | Fails undeclared or incomplete tools |
| schema | Approval resume contract | `packages/contracts/cloud-contracts/src/tool-approval-resume.ts` | Resume request and error bodies |
| schema | Approval presentation | `packages/contracts/cloud-contracts/src/tool-approval-presentation.ts` | How a request is described to the person |
| schema | Approval policy labels | `packages/contracts/types/src/tool-approval-policy.ts` | TOOL_APPROVAL_ACTION_LABELS and risk tiers |
| component | Chrome approval history | `apps/extension/src/features/options/approval-history-section.ts` | List of decided approvals |
| service | Chrome free-trial client | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Chrome approval and tool calls through shared schemas |
| service | VS Code local runtime client | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | Speaks the generated protocol |
| service | Electron developer session service | `apps/desktop/electron/runtime/developerSessionService.ts` | Uses generated protocol types |
| command | generate:protocol-types | `scripts/generate-protocol-types.mjs` | Generates or checks TypeScript from Rust |
| command | check:protocol-types | `scripts/check-protocol-types.mjs` | Cross-language parity beyond the canonical tree |
| config | Generated protocol types | `packages/contracts/types/src/generated/protocol` | ToolDefinition, approvals, session table |
| config | CI protocol check | `.github/workflows/ci.yml` | Runs pnpm check:protocol-types (line 823) |
| service | Skills package | `packages/tools/skills/src/frontmatter.ts` | parseFrontmatter for SKILL.md |
| config | Skill manifest golden | `packages/tools/skills/src/__fixtures__/skill-manifests.golden.json` | Shared expected parse results |
| service | CLI skills | `apps/cli/src/skills.rs` | Rust skill parsing and prompt wrapping |
| test | Skill manifest fixture test | `packages/tools/skills/src/__tests__/manifest-fixtures.test.ts` | TypeScript side of the golden check |
| endpoint | LLM chat completions route | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Where tool metadata is applied to a turn |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model asks for a tool; the server looks up its metadata and, for an unknown name, gets restrictive defaults | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:876-913 |
| An approval request is sent to the client; the person decides | device | apps/extension/src/features/cloud-bridge/freeTrialClient.ts:18-40 |
| The client posts the decision to the approval resume path and the run continues | device and our servers | packages/contracts/cloud-contracts/src/tool-approval-resume.ts:34; apps/mobile/services/streaming.ts:1063 (isDetachedResume uses the resume paths) |
| For a local coding session, the client talks to the Rust runtime over the generated protocol | device | apps/extension-vscode/src/integrations/localRuntimeClient.ts:1-8 |
| For a skill, the CLI parses SKILL.md and wraps the body as untrusted reference text | device | apps/cli/src/skills.rs:1221-1232 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approval decisions history | server (table not opened) | yes, shown across devices (apps/extension/src/features/options/approval-history-section.ts:90) | unknown |
| Installed skills | local skills folder (CLI and skills package) | unknown | unknown |
| Generated protocol files | packages/contracts/types/src/generated/protocol | no; in git | regenerated on change |

**Models and providers.** Tool metadata is model independent. Tool support by model or provider route is owned by SYS-model-catalog-and-routing and SYS-agents-tools-and-automation (not opened). The local runtime lists local models through the protocol (apps/extension-vscode/src/integrations/localRuntimeClient.ts imports LocalModelListResponse).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Approval history needs a signed-in account (apps/extension/src/features/options/approval-history-section.ts:189). Local runtime sessions: account need not established here. |
| Permissions | Approval risk tiers and action classes decide whether a tool asks first (apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:63,101). |
| Subscription | none found in the code for the registry or protocol. Tool availability by plan: see SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Caller-tool step budget default exists (DEFAULT_CALLER_TOOL_MAX_STEPS imported in apps/extension/src/features/cloud-bridge/freeTrialClient.ts:15); value not opened. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | VS Code local coding sessions and the Electron developer session service use the generated protocol with a local runtime (apps/extension-vscode/src/integrations/localRuntimeClient.ts:1-8; apps/desktop/electron/runtime/developerSessionService.ts:82). The CLI skill code runs on the device (apps/cli/src/skills.rs). Payment or sign-in rules for local sessions: none found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Undeclared tool | Falls back to UNKNOWN_TOOL_METADATA (safe for approval, wrong for trifecta); the guard fails the build | scripts/check-tool-registry.mjs:1-12 |
| Approval history loading | 'Loading approval history…' | apps/extension/src/features/options/approval-history-section.ts:182 |
| Signed out | 'Sign in to see the approvals you decided on every device.' | apps/extension/src/features/options/approval-history-section.ts:189 |
| History load fails | 'Try again' button | apps/extension/src/features/options/approval-history-section.ts:125 |
| Approval resume refused (passkey step-up, unavailable account, new terms) | Mobile surfaces the refusal and rechecks terms | apps/mobile/services/streaming.ts:563-589 |
| Protocol drift | CI fails check:protocol-types | .github/workflows/ci.yml:823 |
| Generated file build failure | Staging folder prevents erasing existing generated files | (doc: AGENTS.md section 5); scripts/generate-protocol-types.mjs:20-30 |
| Accessibility of approval history | The open button has an aria-label naming the tool (apps/extension/src/features/options/approval-history-section.ts:163) | apps/extension/src/features/options/approval-history-section.ts:163 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.contract.test.ts`: Tool metadata contract
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.risk-tier.test.ts`: Risk tiers
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.browser-commands.test.ts`: Browser command metadata
- `packages/contracts/cloud-contracts/src/__tests__/tool-approval-resume.test.ts`: Approval resume bodies
- `packages/contracts/cloud-contracts/src/__tests__/tool-approval-presentation.test.ts`: Approval presentation
- `packages/tools/skills/src/__tests__/manifest-fixtures.test.ts`: SKILL.md results against the golden file
- `apps/cli/src/skills.rs`: Rust test manifests_match_the_golden_fixtures_shared_with_the_skills_package
- `apps/extension-vscode/src/__tests__/localRuntimeClient.test.ts`: VS Code local runtime client
- `apps/desktop/electron/__tests__/developerSessionService.test.ts`: Electron developer session service
- `scripts/check-tool-registry.test.mjs`: Tool registry guard
- `scripts/check-protocol-types.test.mjs`: Protocol parity guard

**Test scenarios**

- **Undeclared tool**
  1. Add a new tool name constant with no metadata entry
  2. Run check:tool-registry
  - Expected: The guard names the tool
- **Approve and deny**
  1. Trigger a tool needing approval in Chrome
  2. Deny once and allow once
  3. Open Chrome options, Approval history
  - Expected: Both decisions listed, newest first, with 'Open chat'
- **Skill parity**
  1. Add a case to skill-manifests.golden.json
  2. Run the skills tests and the CLI skills test
  - Expected: Both parse it identically
- **Protocol drift**
  1. Change a Rust protocol struct without regenerating
  2. Run check:protocol-types
  - Expected: The check fails and names the drift
- **Signed out history**
  1. Open Approval history while signed out
  - Expected: The sign-in message appears

**Where to look when it fails**

- Guard output from check:tool-registry and check:protocol-types
- CI step 'pnpm check:protocol-types'
- Mobile 403 notice handling in streaming.ts noticeRunRefusal

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Web tool metadata is a TypeScript table, not generated from Rust** Affects: Web server, all apps using cloud tools. Evidence: apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:101. Work needed: Generate or derive from the Rust ToolDefinition
- **No plugin manifest golden fixture found** Affects: Plugin installs on every surface. Evidence: search of *.golden.json. Work needed: Add fixtures for plugin manifests
- **Brief counts of undeclared tools do not match the guard** Affects: Reports using the brief. Evidence: scripts/check-tool-registry.mjs:44. Work needed: Update the brief
- **run_command approval store separation not verified** Affects: Cloud code agent. Evidence: (doc: area-briefs/101-shared-package-boundaries.md S101.20). Work needed: Inspect the approval store
- **Approval decision handling on Web, Desktop and Mobile UI not opened** Affects: Web, Desktop, Mobile. Evidence: only Chrome options and Mobile streaming opened. Work needed: Read those consumers

**Depends on**

- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-local-inference
- SYS-execution-boundaries
- F101-01
- surface:vscode
- surface:chrome
- surface:cli
- file:packages/contracts/types/src/generated/protocol

## Unknown

- Whether the run_command approval store is separate from the shared contract
- Whether any plugin manifest golden fixture exists under a different name
- How Web, Desktop and Mobile render approval decisions
- Where approval history is stored on the server
- Install screens for skills and plugins per app
- Whether guards and CI pass today; nothing was run
