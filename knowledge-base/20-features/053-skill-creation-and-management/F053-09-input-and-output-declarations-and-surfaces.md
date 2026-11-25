---
id: "F053-09"
type: "feature"
title: "Input and output declarations and surfaces"
aliases: ["Input and output declarations and surfaces", "Input parameters (S53.12)", "Expected outputs (S53.13)", "Supported surfaces (S53.16)", "argument-hint (nearest existing field)"]
area: "53 Skill creation and management"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S53.12", "S53.13", "S53.16"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "F053-07", "F053-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F053-09 Input and output declarations and surfaces

Not built. A skill cannot declare the inputs it takes, the outputs it makes, or the apps it works on. No app reads such fields, and the web upload refuses unknown frontmatter keys. The nearest existing fields are required tools, required connectors and an unused argument-hint.

Area: [53. Skill creation and management](README.md). Requirement items: [S53.12](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5312), [S53.13](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5313), [S53.16](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5316).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a skill state inputs a person or model fills in, outputs it should produce, and the surfaces it works on, so apps could show or check them.

**Why it exists.** Brief items S53.12, S53.13 and S53.16 list these as required behaviour for every app; none is built.

**Who uses it.** Skill authors and people choosing a skill; nobody can use it today.

**Problems it solves**

- Today a person cannot tell from the skill which apps it works on or what it needs besides tools and connectors; only required tools and connectors are shown (packages/ui/ui/src/directory/SkillDetailView.tsx:64-120).

**Use cases**

- [proposed] A report skill declares inputs 'period' and 'region' and the chat asks for them.
- [proposed] A skill declares it produces a .docx so the app can offer the file.
- [proposed] A skill marked CLI-only is hidden on mobile.

## 2. User experience

**Where to find it**

- No screen or control exists on any app (brief S53.12, S53.13, S53.16: all six missing).
- Related, shown today: skill detail 'Source and access' section with Source, Added, Version, required tools and required connectors (packages/ui/ui/src/directory/SkillDetailView.tsx:64-120; packages/ui/ui/src/directory/constants.ts:130-137).

**Before you start**

- none: feature absent.

**Screens and controls**

- none: feature absent.
- The editor has three fields only: name, description, instructions (apps/web/app/api/skills/skill-draft-schema.ts:5-13).

**Journey**

1. Not applicable. Nearest journey: author a skill with name, description and body; the model sees only name and description until it loads the skill (packages/tools/skills/src/tool.ts:100-125).

**What the person sees and gets**

- none: feature absent.

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Required tools and required connectors are declared via frontmatter requires and shown and enforced: a skill whose tools or MCP servers are not offered cannot be loaded (packages/tools/skills/src/tool.ts:190-232, 372-398; apps/web/app/api/skills/route.ts:186-197).
- CLI reads name, description, allow_implicit, category, env_vars, tools, connections and version only (apps/cli/src/skills.rs:940-1030).
- Upload accepts frontmatter keys name, description, license, compatibility, metadata, allowed-tools, version, requires, plugin, argument-hint, disable-model-invocation, acknowledgments and refuses any other (packages/tools/skills/src/validation.ts:8-33, 81-86).

**Incomplete**

- 'compatibility' and 'metadata' are accepted on upload but nothing read in the catalog or detail view uses them for surfaces (apps/web/app/api/skills/route.ts:165-197 builds the response from other fields) [inferred from the response builder].
- 'argument-hint' is accepted on upload but is read only for CLI custom commands, not skills (apps/cli/src/custom_commands.rs:325).

**Present but disconnected or switched off**

- none found.

**Not available**

- Input parameters, expected outputs and supported surfaces on Web, Desktop, Mobile, CLI, VS Code and Chrome (brief S53.12, S53.13, S53.16).

## 4. Required behaviour

**Established requirements**

- A skill declares input parameters the user or model fills in when invoking it. (source: brief S53.12)
- A skill declares the outputs it is expected to produce. (source: brief S53.13)
- A skill shows which surfaces (web, desktop, CLI...) it works on. (source: brief S53.16)

**Acceptance criteria**

1. A skill file with declared inputs shows them in the skill detail on web and mobile.
2. Invoking a skill with a required input missing prompts for it or tells the model.
3. A skill with declared outputs lists them in the detail view.
4. A skill restricted to some surfaces is marked on others and not offered where it cannot run.
5. Upload does not refuse the new keys once they are defined.
6. The CLI parser and the web parser agree on the new keys.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because upload refuses unknown keys, the allowed-key list in packages/tools/skills/src/validation.ts must change first [inferred from validation.ts:81-86].
- The cloud contract needs optional fields so older clients ignore them [inferred from the 'additive' note in packages/contracts/cloud-contracts/src/skills.ts:56-70].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add optional inputs, outputs and surfaces to the frontmatter and to ManagedSkillSummarySchema.
- [proposed] Show them in the shared SkillDetailView so web, desktop and mobile get them together.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Frontmatter key allow-list | `packages/tools/skills/src/validation.ts` | Defines the keys an upload may carry; the place new declarations would be added. |
| service | Frontmatter parser | `packages/tools/skills/src/frontmatter.ts` | Parses SKILL.md frontmatter for the web and cloud. |
| config | Managed skill summary schema | `packages/contracts/cloud-contracts/src/skills.ts` | Contract of what the catalog returns; has requiredTools and requiredConnectors but no inputs, outputs or surfaces. |
| endpoint | api:GET /api/skills | `apps/web/app/api/skills/route.ts` | Builds the catalog response; no field for the three declarations. |
| component | Skill detail access summary | `packages/ui/ui/src/directory/SkillDetailView.tsx` | Nearest display: Source, Added, Version, required tools and connectors. |
| service | Skill tool runtime check | `packages/tools/skills/src/tool.ts` | describeSkillUnavailability checks tools, MCP servers, environment and operating system. |
| service | CLI frontmatter parser | `apps/cli/src/skills.rs` | parse_frontmatter lists the keys the CLI reads. |
| service | CLI custom command argument hint | `apps/cli/src/custom_commands.rs` | Only reader of argument-hint (commands, not skills). |
| service | Mobile skill requirements | `apps/mobile/src/features/skills/skillRequirements.ts` | Reads requiredTools only. |
| component | Mobile skill detail | `apps/mobile/src/features/skills/SkillDetailScreen.tsx` | Shows what a skill needs (tools, connectors) and files. |
| service | Chrome skills client | `apps/extension/src/features/cloud-bridge/skillsClient.ts` | Reads only name and description. |
| service | VS Code skill list mapping | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Shows required tools and env vars in the detail line. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists for these declarations. Only the existing 'requires' flow: frontmatter is parsed when a skill is loaded and checked against the tools and servers the turn offers. | our servers | packages/tools/skills/src/tool.ts:190-232 |
| CLI checks required env vars, tools and connections before load. | device | apps/cli/src/skills.rs:1373-1450 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Declarations of inputs, outputs, surfaces | none found in the code | not applicable | not applicable |

**Models and providers.** No model or provider takes part because the feature is absent.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | No behaviour exists in Local mode on any app. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Skill file contains an 'inputs', 'outputs' or 'surfaces' key and is uploaded on web | Refused with 'Unexpected key(s) in SKILL.md frontmatter: ... Allowed keys are ...'. | packages/tools/skills/src/validation.ts:81-86 |
| Same key in a CLI skill file | Ignored silently (parser reads only known keys). | apps/cli/src/skills.rs:940-1030 |
| Loading, empty, error, retry, offline, accessibility | not handled in the code: no UI exists. | brief S53.12, S53.13, S53.16 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/tools/skills/src/__tests__/validation.test.ts`: Frontmatter key validation and draft rules; confirms which keys are accepted.
- `apps/web/app/api/skills/__tests__/skill-upload.test.ts`: Upload refuses frontmatter keys Claude does not accept (line 299).
- `packages/tools/skills/src/__tests__/tool.test.ts`: Required tools and MCP server checks, the closest existing declaration.

**Test scenarios**

- **Unknown key refused**
  1. Upload SKILL.md with frontmatter key inputs: [period].
  - Expected: Refused with the unexpected-key message (current behaviour).
- **No surfaces display**
  1. Open any skill detail on web and mobile.
  - Expected: No supported-surfaces row (confirms absence).
- **CLI ignores key**
  1. Add outputs: report.docx to a CLI skill; load it.
  - Expected: Loads normally; key unused.

**Where to look when it fails**

- Upload error text 'Unexpected key(s) in SKILL.md frontmatter'.
- Catalog response shape ManagedSkillsResponseSchema (packages/contracts/cloud-contracts/src/skills.ts).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No input, output or surface declaration exists on any app.** Affects: All six apps. Evidence: brief S53.12, S53.13, S53.16; apps/cli/src/skills.rs:940-1030; packages/tools/skills/src/validation.ts:8-33. Work needed: Define the frontmatter fields, extend the contract and parsers, show them in shared UI, add tests.
- **Frontmatter keys compatibility, metadata and argument-hint are accepted but not used for these purposes.** Affects: Web authors. Evidence: packages/tools/skills/src/validation.ts:8-33; apps/cli/src/custom_commands.rs:325. Work needed: Decide whether to map them to the new fields.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- F053-07
- F053-10

## Unknown

- Whether a design for these fields exists in docs/specs (not searched in depth).
- Whether the validation test covers the exact refusal message.
- Whether the 'compatibility' key is meant to carry supported surfaces.
