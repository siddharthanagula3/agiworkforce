---
id: "F108-10"
type: "feature"
title: "Sales, support, HR and marketing workflows"
aliases: ["Sales, support, HR and marketing skills", "Business workflow skills", "pipeline-review", "deal-review", "ticket-triage", "draft-response", "customer-escalation", "recruiting-pipeline", "interview-prep", "marketing skills (S108.29)", "Sales and CRM workflows (S108.26)", "Customer-support workflows (S108.27)", "HR and recruiting workflows (S108.28)"]
area: "108 Specialist workspaces"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S108.26", "S108.27", "S108.28", "S108.29"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "file:skills-lock.json", "api:GET /api/skills"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F108-10 Sales, support, HR and marketing workflows

These workflows are vendored skills the model follows in chat: pipeline and deal review for sales, ticket triage, replies and escalations for support, recruiting pipeline and interview plans for HR, and about forty marketing skills. They read or write outside systems only through connectors the person has connected, and fall back to uploaded or pasted data.

Area: [108. Specialist workspaces](README.md). Requirement items: [S108.26](../../10-requirements/capabilities/108-specialist-workspaces.md#s10826), [S108.27](../../10-requirements/capabilities/108-specialist-workspaces.md#s10827), [S108.28](../../10-requirements/capabilities/108-specialist-workspaces.md#s10828), [S108.29](../../10-requirements/capabilities/108-specialist-workspaces.md#s10829).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the model step-by-step instructions for common business tasks, for example 'Stage-by-stage pipeline health check from CRM opportunity data' (.agents/skills/pipeline-review/SKILL.md:3), 'Triage and prioritize a support ticket' (ticket-triage/SKILL.md:3), 'Create structured interview plans' (interview-prep/SKILL.md:3). Each skill is a directory in .agents/skills marked audience product in skills-lock.json.

**Why it exists.** The brief wants sales/CRM, support, HR and marketing workflows runnable from the product (S108.26 to S108.29) (doc: knowledge-base/data/area-briefs/108-specialist-workspaces.md). Skills reuse the chat, connectors and approval system instead of building separate workspaces.

**Who uses it.** Sales reps and managers, support agents, recruiters and hiring managers, and marketers.

**Problems it solves**

- Repeated analysis (pipeline coverage, aging, at-risk deals) is done the same way each time.
- Support triage gets a consistent priority and routing.
- Interview plans come with competency questions and scorecards.
- Marketing tasks (ads, SEO audit, copywriting, pricing) have ready procedures.

**Use cases**

- Ask 'review my pipeline' with a CRM connected.
- Paste a ticket and run ticket-triage, then draft-response.
- Ask for an interview plan for a role.
- Run seo-audit or copywriting on a landing page.

## 2. User experience

**Where to find it**

- Web (and desktop via hosted web app): Skills page at /skills (apps/web/app/skills/page.tsx), composer mention palette over installed skills (ChatComposerNew.tsx:2902-2907), or just describe the task so the server may offer matching skills (request-processor.ts:1086-1109). The plus-menu 'Skills' row lists only the person's own skills (ComposerPlusMenu.tsx:1248-1251).
- Mobile: Skills screen (Managed Cloud catalog) with Install/Uninstall, Details and 'Use in chat' (SkillsScreen.tsx:365-383).
- Chrome: side-panel skill menu lists only the person's own skills (skillsClient.ts:36-43); bundled workflow skills can still be offered by the server by prompt match [inferred].
- CLI, VS Code: not offered (request-processor.ts:1073).

**Before you start**

- Cloud chat sign-in.
- A tool-capable model.
- Skill not switched off by the person.
- For live data: the connector the skill needs, connected in Connectors. Without it the skill works from uploaded or pasted files (pipeline-review/SKILL.md:18).

**Screens and controls**

- Skills page and mobile Skills screen; mention palette; skill chip in the Chrome composer (side_panel.ts:10510-10532).
- Argument hints such as '<segment or rep>' for pipeline-review and '<ticket or issue description>' for ticket-triage (SKILL.md frontmatter line 5).

**Journey**

1. Pick the skill or describe the task.
2. Give the input the skill asks for: a segment, a ticket, a role, a URL.
3. The model checks which connectors are available with a cheap read and uses them, or asks once for an upload (pipeline-review/SKILL.md:18).
4. The model produces the analysis, draft or plan.
5. Any write action to an outside system is shown with exact recipients and content before it runs if the content came from untrusted text (pipeline-review/SKILL.md:16).

**What the person sees and gets**

- Written analysis, scorecards, drafts or plans in chat.
- If a required tool or connector is off: 'The <skill> skill needs these turned on first: ...' (skill-catalog-service.ts:128-146).
- If a connected tool refuses a write, the skill turns the change into paste-ready text and quotes the refusal (pipeline-review/SKILL.md:18).

**Settings**

- Install on or off per person (api/skills/installs).
- Connector connection and per-tool allow/ask/block live in connector settings (pipeline-review/SKILL.md:12).
- Scheduled or unattended runs only execute what the schedule was set to take; other actions become proposals (pipeline-review/SKILL.md:17).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nine Anthropic-sourced business skills and about forty marketing skills are vendored, locked and marked audience product (skills-lock.json entries ab-testing to social; THIRD_PARTY_LICENSES.md:206, :253-257).
- The server loads them as the bundled layer and applies per-person install overrides (skill-catalog-service.ts:150-160, :232-258).
- Selection, forced skill tool, requirement failure messages (request-processor.ts:1047-1070; skill-catalog-service.ts:128-146).
- Mobile Skills screen and Chrome skill chip send the chosen name (SkillsScreen.tsx:383; side_panel.ts:8863).

**Incomplete**

- Which connectors each skill truly needs and whether they exist in the connector directory was not verified; the brief points to vendor-directory entries (vendor-directory.json:168, :968) but those were not opened for this page.
- Chrome and mobile marketing coverage differs in the brief (marketing missing on mobile and Chrome); in code the same skill catalog is served to both, so the brief status is unverified.

**Present but disconnected or switched off**

- Skills are disabled on cli, vscode, api surfaces (request-processor.ts:1073).
- Skills are withheld if install overrides cannot be read (skill-catalog-service.ts:150-160).

**Not available**

- No dedicated CRM, ticket or HR screens; these are chat workflows only.
- Sales workflows missing on Chrome per brief; marketing missing on mobile and Chrome per brief; not confirmed against code.

## 4. Required behaviour

**Established requirements**

- S108.26 Should: look up and update contacts, deals, pipelines from the product. Brief: web, desktop, mobile done; Chrome missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.26)
- S108.27 Should: triage, reply, update tickets. Brief: done on all four. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.27)
- S108.28 Should: job posts, candidate pipeline, interviews. Brief: done on all four. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.28)
- S108.29 Should: audiences, campaigns, assets, analytics. Brief: web and desktop done; mobile and Chrome missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.29)
- The catalog hides a skill the person switched off. (source: apps/web/lib/services/skill-catalog-service.ts:150-160)
- Vendored skills are product content; any edit must regenerate the lock. (source: doc: AGENTS.md §5; CLAUDE.md)

**Acceptance criteria**

1. Each named skill appears in the catalog list for a signed-in person and disappears after uninstall.
2. Selecting pipeline-review with no CRM connected, plus an uploaded CSV, produces an analysis from the file and says what was not used.
3. A skill whose required connector is off returns the 'needs these turned on first' message naming it.
4. Connector text that contains instructions is reported, not obeyed (pipeline-review/SKILL.md:16).
5. On CLI the skill is not offered.
6. A write to a connector the person asked for goes through the connector's own permissions (pipeline-review/SKILL.md:12).
7. Mobile 'Use in chat' sends the skill name and the reply follows the skill.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Marketing and sales skills should work on mobile and Chrome because the catalog is shared [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show requiredConnectors on the skill row before use, using the field /api/skills already returns.
- [proposed] Test each vendored skill with a connector-off and connector-on case.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | pipeline-review | `.agents/skills/pipeline-review/SKILL.md` | Sales pipeline review instructions and connector rules. |
| config | deal-review | `.agents/skills/deal-review/SKILL.md` | Single-deal review. |
| config | ticket-triage | `.agents/skills/ticket-triage/SKILL.md` | Support ticket triage. |
| config | draft-response | `.agents/skills/draft-response/SKILL.md` | Customer reply drafting. |
| config | customer-escalation | `.agents/skills/customer-escalation/SKILL.md` | Escalation packaging. |
| config | recruiting-pipeline | `.agents/skills/recruiting-pipeline/SKILL.md` | Recruiting stages. |
| config | interview-prep | `.agents/skills/interview-prep/SKILL.md` | Interview plans and scorecards. |
| config | marketing skills | `skills-lock.json` | Entries from ab-testing through social, source marketingskills, audience product. |
| config | license rows | `THIRD_PARTY_LICENSES.md` | Marketing row line 206; business row lines 253-257. |
| service | skill catalog service | `apps/web/lib/services/skill-catalog-service.ts` | Loads, filters and checks requirements. |
| endpoint | GET /api/skills | `apps/web/app/api/skills/route.ts` | Lists skills with requiredTools and requiredConnectors. |
| endpoint | skill installs | `apps/web/app/api/skills/installs/route.ts` | Per-person install on/off. |
| service | request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Selection, offers, errors, surface exclusion. |
| component | Composer mention palette | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Lists installed skills (:2902-2907). |
| screen | Mobile SkillsScreen | `apps/mobile/src/features/skills/SkillsScreen.tsx` | Catalog, install, use in chat. |
| service | Mobile skill requirements | `apps/mobile/src/features/skills/skillRequirements.ts` | Requirement checks on the phone (tested in skillRequirements.test.ts). |
| service | Chrome skills client | `apps/extension/src/features/cloud-bridge/skillsClient.ts` | Own-skill list for the side panel. |
| config | skills lock verifier | `scripts/verify-skills-lock.mjs` | Fails CI when a skill file changes without lock update. |
| test | skill offer test | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.skill-offer.test.ts` | Implicit offers. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a skill or describes the task; the app sends skill_name or just the prompt. | device | useChatStream.ts:4643; SkillsScreen.tsx:383 |
| Server loads the catalog, drops switched-off skills, optionally offers relevant skills by prompt. | our servers | skill-catalog-service.ts:150-160; request-processor.ts:1086-1109 |
| Server adds the skill prompt and forces the skill tool; checks required tools and connectors. | our servers | request-processor.ts:1047-1070; skill-catalog-service.ts:128-146 |
| The model follows the skill; connector tool calls reach the outside system (CRM, helpdesk, applicant system) under connector permissions. | outside service | pipeline-review/SKILL.md:12-18 |
| Results stream back to the app. | device and our servers | [inferred] shared chat path |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Skill install override | Per-person table read by skill-install-service.ts | Server-side | Until changed |
| Chat messages with CRM, ticket or candidate data | Conversation messages on our servers | Yes | Normal chat retention; sensitive HR or customer data handling rules not found for this feature |
| Connector credentials | Connector system (see SYS-connectors-plugins-and-skills) | unknown | unknown |

**Models and providers.** Any tool-capable model. Skills are plain instructions; no provider-specific code in the skill path.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in to Cloud; mobile asks to switch to Cloud (SkillsScreen.tsx:190). |
| Permissions | Workspace controls for skills (request-processor.ts:5440, :6556). Connector permissions per tool (pipeline-review/SKILL.md:12). |
| Subscription | None found specific to these skills; free chat is stated to include skills (request-processor.ts:4412). |
| Limits and metering | Normal chat metering; none specific found. |
| Feature flags | Audience manifest (skills-lock.json audience product) decides shipping; install overrides. |
| Model compatibility | Needs tool support (request-processor.ts:5405-5420). |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Skills catalog is the Managed Cloud catalog and needs Cloud (SkillsScreen.tsx:108, :190). Local inference with skills on desktop or mobile: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connector missing | Skill works from uploads or pasted data and says what was used. | pipeline-review/SKILL.md:18 |
| Required tools or connectors off | Request refused with the needs-turned-on message. | skill-catalog-service.ts:128-146 |
| Write refused by a connector | Produce paste-ready text, quote refusal, no retry. | pipeline-review/SKILL.md:18 |
| Unattended run | Untrusted-content actions become proposals. | pipeline-review/SKILL.md:17 |
| Catalog unavailable | skill_catalog_unavailable. | request-processor.ts:5397 |
| Offline, cancel, timeout | not handled by anything specific to this feature | not handled in the code |
| Mobile load failure | 'Retry refreshing Skills' control. | SkillsScreen.tsx:466 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/skill-catalog-service.test.ts`: Catalog service
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.skill-offer.test.ts`: Implicit skill offers
- `apps/web/lib/services/__tests__/skill-install-service.test.ts`: Install overrides
- `apps/mobile/src/features/skills/__tests__/skillRequirements.test.ts`: Mobile requirement checks
- `apps/mobile/src/features/skills/__tests__/SkillDetail.test.tsx`: Mobile skill detail
- `scripts/verify-skills-lock.mjs`: Lock integrity (script)

**Test scenarios**

- **Pipeline from a file**
  1. Disconnect CRM.
  2. Select pipeline-review and upload an opportunity export.
  - Expected: Analysis from the file with a note that no CRM was used.
- **Ticket flow**
  1. Run ticket-triage on a pasted ticket.
  2. Then draft-response.
  - Expected: Priority P1-P4, team routing, then a reply draft.
- **Uninstall**
  1. Uninstall interview-prep in /skills.
  2. Try the mention palette.
  - Expected: Skill absent.
- **Connector off**
  1. Choose a skill that lists a required connector while it is disconnected.
  - Expected: Needs-turned-on message naming the connector.
- **Mobile marketing skill**
  1. On mobile in Cloud, open Skills, Use in chat on copywriting.
  - Expected: Reply follows the skill; this confirms the brief's 'missing' status wrong or right.
- **Chrome**
  1. Open the Chrome side panel skill menu.
  - Expected: Only own skills listed.

**Where to look when it fails**

- Error codes skill_not_found, skill_requirements_unmet, skill_model_unsupported.
- Log 'Managed Skill catalog load failed'.
- /api/skills response fields requiredTools and requiredConnectors.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/108-specialist-workspaces.md](../../70-qa/test-plans/web/108-specialist-workspaces.md)
- Desktop: [70-qa/test-plans/desktop/108-specialist-workspaces.md](../../70-qa/test-plans/desktop/108-specialist-workspaces.md)
- Mobile: [70-qa/test-plans/mobile/108-specialist-workspaces.md](../../70-qa/test-plans/mobile/108-specialist-workspaces.md)
- Chrome: [70-qa/test-plans/chrome/108-specialist-workspaces.md](../../70-qa/test-plans/chrome/108-specialist-workspaces.md)

## 10. Gaps and dependencies

- **No end-to-end test per workflow skill with and without connectors.** Affects: All apps.. Evidence: Tests found cover catalog and offer logic only. Work needed: Add scripted runs against a test connector.
- **Brief marks marketing missing on mobile and Chrome and sales missing on Chrome, but the catalog is shared.** Affects: Mobile, Chrome.. Evidence: request-processor.ts:1073 excludes only vscode, cli, api. Work needed: Verify and correct the brief.
- **Chrome and web plus-menu pickers hide bundled skills.** Affects: Chrome, web.. Evidence: skillsClient.ts:36-43; ComposerPlusMenu.tsx:1248-1251. Work needed: Add a path to bundled skills in Chrome.
- **Connector availability for CRM, helpdesk and applicant tools not verified.** Affects: All apps.. Evidence: Not opened. Work needed: List which connectors each skill names and check they exist.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- file:skills-lock.json
- api:GET /api/skills

## Unknown

- Which connectors satisfy each skill's tool calls in the product.
- Whether mobile and Chrome truly lack marketing and sales skills as the brief says.
- Which exact five marketing skills the brief points to (its skills-lock line numbers do not match the file).
- Data-handling rules for HR and customer data.
- Whether Local inference can run skills.
