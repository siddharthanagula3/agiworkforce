---
id: "F053-12"
type: "feature"
title: "Testing, results and measurement"
aliases: ["Testing, results and measurement", "Test cases (S53.31)", "Test results (S53.32)", "With-versus-without comparison (S53.33)", "Cost estimate (S53.34)", "Performance history (S53.35)", "Skill install count"]
area: "53 Skill creation and management"
available_on: ["web"]
implementation: {web: "partial", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S53.31", "S53.32", "S53.33", "S53.34", "S53.35"]
depends_on: ["SYS-observability-and-operations", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-chat-turn-pipeline", "F053-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F053-12 Testing, results and measurement

Not built. A skill cannot carry test cases, show test results, compare output with and without the skill, estimate its cost, or show usage and success history. The only measurement is an install total shown in the web catalog, which is not a performance history.

Area: [53. Skill creation and management](README.md). Requirement items: [S53.31](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5331), [S53.32](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5332), [S53.33](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5333), [S53.34](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5334), [S53.35](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5335).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Would let a person test a skill, see results, compare runs with and without it, see an estimated cost and a usage history.

**Why it exists.** Brief items S53.31 to S53.35 require them; none is built on any app.

**Who uses it.** Skill authors and teams deciding whether a skill is worth keeping.

**Problems it solves**

- Today an author cannot tell whether a skill helps or what it costs; the nearest signal is how many accounts installed it.

**Use cases**

- [proposed] Run a skill against 3 sample prompts and see pass or fail.
- [proposed] Compare the same prompt with and without the skill.
- [proposed] See that a skill is called often and how many tokens it adds.

## 2. User experience

**Where to find it**

- No test, result, comparison, cost or history screen exists on any app (brief S53.31 to S53.35).
- Related: the web skill directory can sort by 'popular' when install totals exist (apps/web/features/directory/services/skills-directory.ts:74-75, 255).

**Before you start**

- none: feature absent.

**Screens and controls**

- none: feature absent.

**Journey**

1. Not applicable.

**What the person sees and gets**

- Install count per skill in the catalog response when positive (apps/web/app/api/skills/route.ts:181; apps/web/features/skills/server/skill-install-totals.ts:25-31).

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Install totals are read per skill name through a database function and added to the catalog entry; a failure logs 'Skill install totals unavailable' and returns none (apps/web/features/skills/server/skill-install-totals.ts:10-39).
- The directory offers a 'popular' sort only when measured totals exist (apps/web/features/directory/services/skills-directory.ts:74-75, 255).
- Skill loading is traced as a tool call with a tool status, shared with all tools (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3750-3765 and the span attributes there).

**Incomplete**

- Install totals count accounts that installed, not uses or success (packages/contracts/cloud-contracts/src/skills.ts:70-77).

**Present but disconnected or switched off**

- none found.

**Not available**

- Test cases, test results, with-versus-without comparison, cost estimate and performance history on Web, Desktop, Mobile, CLI, VS Code and Chrome (brief S53.31 to S53.35).

## 4. Required behaviour

**Established requirements**

- A skill carries test cases. (source: brief S53.31)
- The product shows results of running a skill's tests. (source: brief S53.32)
- The product compares outputs with and without a skill. (source: brief S53.33)
- The product estimates the cost of running a skill. (source: brief S53.34)
- The product shows a skill's performance history (usage, success). (source: brief S53.35)

**Acceptance criteria**

1. A skill can store at least one test case (prompt and expected result).
2. Running tests shows pass or fail per case on the same screen.
3. A comparison shows two outputs for one prompt, labelled with and without the skill.
4. The cost estimate states tokens or credits and the model it assumed, from the model catalog and not typed in.
5. The history shows number of uses and a success measure per time period.
6. None of the above runs on a surface where the plan or mode does not allow it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Cost estimates must follow the model catalog and subscription rules rather than hardcoded prices (AGENTS.md section 4) [inferred].
- History needs a stored usage record per skill load, which no table was found for [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Record a usage event each time the skill tool loads a skill, with a success flag from the turn outcome.
- [proposed] Offer 'Test this skill' in the skill detail view on web and mobile first.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Install totals reader | `apps/web/features/skills/server/skill-install-totals.ts` | Reads install counts per skill through skill_install_totals. |
| endpoint | api:GET /api/skills | `apps/web/app/api/skills/route.ts` | Adds installs to catalog entries. |
| endpoint | api:POST /api/skills/installs | `apps/web/app/api/skills/installs/route.ts` | Records an install; the source of the totals. |
| service | Skill install service | `apps/web/lib/services/skill-install-service.ts` | Install and uninstall overrides per account. |
| config | Managed skill summary schema | `packages/contracts/cloud-contracts/src/skills.ts` | installs field: accounts that installed, absent when none. |
| service | Directory skill sort options | `apps/web/features/directory/services/skills-directory.ts` | 'popular' sort only when measured. |
| service | Cloud tool loop spans | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Generic tool spans with name, status and surface; no skill success measure. |
| service | Skill tool result codes | `packages/tools/skills/src/tool.ts` | skill_loaded, skill_file_read and error codes that a history could use. |
| service | CLI cost ledger | `apps/cli/src/agent/chat.rs` | Records completion cost per turn (not per skill); referenced at line 1555. |
| service | Compute metering for sandbox | `apps/web/lib/e2b/compute-metering.ts` | Meters hosted code execution, the only skill-adjacent cost found. |
| service | Surface feature matrix | `docs/product/surface-feature-matrix.json` | Records presence per surface for skills (not testing). |
| service | Skill authority and vetting scripts | `scripts/scan-skills-with-vetting.mjs` | Repository scan of vendored agent skills; unrelated to customer skill testing. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Catalog request reads install totals for the listed skill names and attaches counts. | our servers | apps/web/app/api/skills/route.ts:163-170; apps/web/features/skills/server/skill-install-totals.ts:10-39 |
| Install records come from the installs route when a person adds a skill. | our servers | apps/web/app/api/skills/installs/route.ts:99 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Install totals | skill install records read through the database function skill_install_totals | server-side | Retention: unknown. |
| Test cases, results, cost, usage history | none found in the code | not applicable | not applicable |

**Models and providers.** No model or provider takes part. A future cost estimate would depend on the model catalog and routing (SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Install counts are returned to signed-in accounts with the catalog. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code for skill testing or cost. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | No behaviour in Local mode on any app. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Install totals unavailable | Logged warning; the catalog is returned without counts. | apps/web/features/skills/server/skill-install-totals.ts:32-37 |
| Skill has no installs | The installs field is omitted, never zero. | apps/web/features/skills/server/skill-install-totals.ts:27-29; packages/contracts/cloud-contracts/src/skills.ts:70-77 |
| Loading, error, retry, cancel, offline, accessibility for testing | not handled in the code: no UI exists. | brief S53.31 to S53.35 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/skills/installs/__tests__/skill-installs.test.ts`: Install and uninstall records for skills.
- `apps/web/app/api/skills/__tests__/skill-catalog-param.test.ts`: Catalog parameter behaviour of GET /api/skills.
- `apps/web/features/directory/__tests__/skills-directory.test.ts`: Directory skill listing and sorting; this exact file was not opened, existence unverified.

**Test scenarios**

- **Install count shows**
  1. Install a skill on two accounts; open the web catalog.
  - Expected: The skill shows 2 installs and the 'popular' sort is offered.
- **No test control**
  1. Open skill detail on web, mobile; open the VS Code and CLI skill lists.
  - Expected: No test, comparison, cost or history control (confirms absence).
- **Totals failure**
  1. Make skill_install_totals fail in a test database.
  - Expected: Catalog still loads without counts and the warning is logged.

**Where to look when it fails**

- Log line 'Skill install totals unavailable'.
- Database function skill_install_totals.
- Tool result code skill_loaded (the nearest usage signal).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/053-skill-creation-and-management.md](../../70-qa/test-plans/web/053-skill-creation-and-management.md)

## 10. Gaps and dependencies

- **No test cases or test results.** Affects: All six apps. Evidence: brief S53.31, S53.32. Work needed: Define a test-case format, a runner and a results screen.
- **No with-versus-without comparison.** Affects: All six apps. Evidence: brief S53.33. Work needed: Run the same prompt twice with the skill tool withheld the second time and show both.
- **No cost estimate.** Affects: All six apps. Evidence: brief S53.34. Work needed: Estimate from the model catalog and routing rules.
- **No usage or success history; install total is only a count of installs.** Affects: All six apps. Evidence: brief S53.35; packages/contracts/cloud-contracts/src/skills.ts:70-77. Work needed: Record skill loads and outcomes and show them.
- Not built on: Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-observability-and-operations
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-chat-turn-pipeline
- F053-07

## Unknown

- Whether apps/web/features/directory/__tests__/skills-directory.test.ts exists (named from convention, not opened).
- Retention of install records.
- Whether general tool usage logs could already answer skill usage counts (observability tables not read).
- Whether any spec under docs/specs covers skill evaluation.
