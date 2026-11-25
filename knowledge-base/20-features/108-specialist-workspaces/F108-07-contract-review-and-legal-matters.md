---
id: "F108-07"
type: "feature"
title: "Contract review and legal matters"
aliases: ["Contract review", "review-contract skill", "/review-contract", "NDA triage (triage-nda, sibling skill)", "Matter/document organization (S108.18)", "Contract review (S108.19)"]
area: "108 Specialist workspaces"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S108.18", "S108.19"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-files-artifacts-and-storage", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "file:.agents/skills/review-contract/SKILL.md", "file:skills-lock.json", "file:apps/web/lib/services/skill-catalog-service.ts", "api:GET /api/skills"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F108-07 Contract review and legal matters

Contract review is a vendored skill named review-contract. The person gives a contract and the model reviews it clause by clause, flags deviations, suggests redlines and summarises business impact. It runs in chat on web, desktop (hosted web), mobile and Chrome. Filing documents by client and matter is not built on any app.

Area: [108. Specialist workspaces](README.md). Requirement items: [S108.18](../../10-requirements/capabilities/108-specialist-workspaces.md#s10818), [S108.19](../../10-requirements/capabilities/108-specialist-workspaces.md#s10819).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Contract review: the review-contract skill tells the model to accept a contract (file, URL or pasted text), ask which side the person is on, load a playbook if one exists, go through a fixed list of clause categories, flag each as GREEN/YELLOW/RED, write redline text with fallbacks, and give a business impact summary (.agents/skills/review-contract/SKILL.md:26-60, :210-300, :345-382). Matter organisation (client/matter records, per-matter files and history) is the second item of this feature and has no code (audit/missing/108-specialist-workspaces.md:67-73; grep of apps and packages for matter-id / client-matter terms found nothing relevant).

**Why it exists.** To compete with Claude and ChatGPT on legal-work workflows: the brief wants a review flow that checks clauses, flags risks and suggests redlines against a playbook (S108.19), and a matter-based filing system (S108.18) (doc: knowledge-base/data/area-briefs/108-specialist-workspaces.md).

**Who uses it.** In-house legal teams, business people who receive vendor or customer contracts, and sales staff who need a first pass before counsel looks. The skill says it is not legal advice and that qualified lawyers must review (.agents/skills/review-contract/SKILL.md:12-14).

**Problems it solves**

- A first-pass clause review of a long agreement takes hours by hand.
- Positions are inconsistent when each reviewer decides what is acceptable; the skill compares against a playbook or, if none, generic commercial standards (SKILL.md:47-63).
- Redlines and fallback positions are written for the person to paste into a negotiation (SKILL.md:263-295).

**Use cases**

- Paste a vendor SaaS agreement and ask for a review as the customer.
- Upload an NDA and run the sibling triage-nda skill to classify it GREEN, YELLOW or RED (.agents/skills/triage-nda/SKILL.md:3).
- Ask for redlines on the limitation-of-liability clause of a services contract.

## 2. User experience

**Where to find it**

- Web and desktop (hosted web app): a bundled skill in the managed catalog; the Skills page is at route /skills (apps/web/app/skills/page.tsx exists) and the composer offers an installed-skill mention palette (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2902-2907). The composer plus-menu row 'Skills' lists only the person's own skills, not bundled ones (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1248-1251, label at :183).
- Mobile: Skills screen shows the managed Cloud catalog with Install/Uninstall, Details and 'Use in chat' buttons (apps/mobile/src/features/skills/SkillsScreen.tsx:365-383); a signed-out or Local person is offered 'Sign in to AGI Cloud' or 'Switch to AGI Cloud' (SkillsScreen.tsx:190).
- Chrome: the side panel has a skill menu labelled 'Skills' but its client drops bundled skills, so it lists only the person's own skills ('No skills of your own yet.') (apps/extension/src/features/cloud-bridge/skillsClient.ts:36-43; apps/extension/_locales/en/messages.json spSkills / spSkillsEmpty). Whether Chrome can run review-contract by the model's own offer is [inferred] from the shared server path, not tested.
- CLI and VS Code: not available; the server withholds skills on those surfaces (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1073).
- Matter organisation: nowhere.

**Before you start**

- A signed-in account on a Cloud chat (skills are loaded by the managed chat endpoint) (request-processor.ts:5383-5440).
- The skill must not be switched off by the person: bundled skills are kept only if install overrides loaded and do not say false (apps/web/lib/services/skill-catalog-service.ts:150-160).
- The chosen model must support tools, else the request is refused 'The selected model cannot load skills. Choose a tool-capable model.' (request-processor.ts:5405-5420).
- A workspace policy that allows skills (request-processor.ts:5440, :6556).

**Screens and controls**

- Skill name review-contract with argument hint '<contract file or text>' (SKILL.md:2,5).
- Chat composer with attachment for the contract file; skill mention palette on web (ChatComposerNew.tsx:2902).
- Mobile: 'Use in chat' button on the skill row (SkillsScreen.tsx:383).
- Output sections written by the model: Contract Review Summary, Key Findings, Clause-by-Clause Analysis (GREEN/YELLOW/RED), Negotiation Strategy, Next Steps (SKILL.md:345-382).

**Journey**

1. Open a Cloud chat.
2. Select review-contract (web mention palette, mobile 'Use in chat') or describe the task and let the server offer matching skills (request-processor.ts:1086-1109).
3. Provide the contract as an upload, URL or pasted text (SKILL.md:26-34).
4. Answer the questions the skill asks: which side you are on, deadline, focus areas, deal context (SKILL.md:36-45).
5. If no playbook is found the skill offers to help build one or to proceed with generic commercial standards (SKILL.md:56-63).
6. Read the clause analysis and redlines, and the business impact summary.
7. Optionally route to a document system if one is connected (SKILL.md:335).

**What the person sees and gets**

- A written review in chat with colour-coded clause ratings and redline wording (SKILL.md:345-382).
- Errors when selecting the skill: 'The selected skill is not available.' (skill_not_found, request-processor.ts:1055), 'The selected model cannot load skills...' (:5414), skill_catalog_unavailable (:5397), or 'The <skill> skill needs these turned on first: ...' when required tools or connectors are off (skill-catalog-service.ts:128-146).
- No saved matter, client record or history of reviews; the output lives in the chat only [inferred: no table or route for it found].

**Settings**

- Skill install on/off per person (apps/web/app/api/skills/installs/route.ts; apps/web/lib/services/skill-install-service.ts).
- Workspace feature access for skills (request-processor.ts:5440, :6556).
- Playbook: the skill looks for 'legal.local.md or similar' in local settings (SKILL.md:49); no code in apps or packages reads that file name, so how a playbook is supplied in the product is unknown.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The skill is vendored from an outside repository, locked and audience-marked product: skills-lock.json:727-734 (review-contract), :847-854 (triage-nda); license row THIRD_PARTY_LICENSES.md:253-257 (Apache-2.0).
- The server loads .agents/skills as a 'bundled' layer, filters it by the product-audience manifest and caches it 60 seconds (apps/web/lib/services/skill-catalog-service.ts:232-258).
- A chosen skill is injected as a system prompt plus a forced skill tool call (request-processor.ts:1047-1070).
- Implicit offers by prompt match for web, desktop, mobile and Chrome surfaces (request-processor.ts:1086-1109).

**Incomplete**

- Playbook support is described in the skill but no product code supplies a playbook (SKILL.md:49; no reader of legal.local found). Web, desktop, mobile, Chrome.
- The skill step 'CLM routing' depends on a connected document system; which connectors satisfy it is unverified (SKILL.md:335).
- Chrome and the web plus-menu hide bundled skills from their pickers (skillsClient.ts:36-43; ComposerPlusMenu.tsx:1248-1251), so bundled skills reach those apps through other paths only (mention palette on web; implicit offer).

**Present but disconnected or switched off**

- Matter organisation has no code, table, route or screen.
- Skills are switched off for the vscode, cli and api surfaces (request-processor.ts:1073).

**Not available**

- Matter/document organisation (S108.18) on web, desktop, mobile, Chrome (audit/missing/108-specialist-workspaces.md:67-73).
- Contract review on CLI and VS Code (request-processor.ts:1073).

## 4. Required behaviour

**Established requirements**

- S108.19 Should: a contract-review flow extracts clauses, flags risks and suggests redlines against a playbook. Brief status: done on web, desktop, mobile and Chrome. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.19)
- S108.18 Should: documents are organised by legal matter (client/matter records, per-matter files and history). Brief status: missing on all four apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.18)
- Skills are product content: changing a vendored skill changes what customers get, and the lock must be regenerated after any edit. (source: doc: AGENTS.md §5; CLAUDE.md (skills-lock.json))
- The skill's own rule: it assists with legal workflows but is not legal advice. (source: apps/../.agents/skills/review-contract/SKILL.md:12-14)

**Acceptance criteria**

1. With review-contract selected and a pasted contract, the reply asks which side the person is on before reviewing (SKILL.md:36-45).
2. The reply covers the clause categories in the skill table (liability, indemnity, IP, data protection, confidentiality, warranties, term, governing law, insurance, assignment, force majeure, payment) and rates each GREEN/YELLOW/RED.
3. Switching the skill off in the person's skills makes 'review-contract' absent from the catalog and a request naming it fails with skill_not_found.
4. Choosing a model that cannot use tools returns the 'cannot load skills' error rather than an unguided answer.
5. On CLI and VS Code the skill is not offered.
6. With no playbook available the reply says so and offers to build one or use generic standards (SKILL.md:56-63).
7. Matter filing: a person can create a client and matter and attach contract reviews (not met today).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Playbook storage should be a product feature (project or account setting) because a hosted server cannot read a local legal.local file [inferred].
- Reviews should be savable against a matter for history [inferred from S108.18].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store the playbook as a project instruction or account document and pass it to the skill explicitly.
- [proposed] Add a matter record (client, matter, files, review history) in the Projects area rather than a new workspace.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | review-contract skill | `.agents/skills/review-contract/SKILL.md` | Instructions the model follows for contract review. |
| config | triage-nda skill | `.agents/skills/triage-nda/SKILL.md` | Sibling legal skill that classifies NDAs GREEN/YELLOW/RED. |
| config | skills lock | `skills-lock.json` | Pins content hash, source and audience 'product' for both skills (lines 727-734, 847-854). |
| config | third-party license row | `THIRD_PARTY_LICENSES.md` | Records Apache-2.0 source and adoption notes (lines 253-257). |
| service | skill catalog service | `apps/web/lib/services/skill-catalog-service.ts` | Loads the bundled layer, filters by audience and install overrides, builds requirement failures. |
| service | skill install service | `apps/web/lib/services/skill-install-service.ts` | Reads and sets per-person install overrides. |
| endpoint | GET /api/skills | `apps/web/app/api/skills/route.ts` | Lists skills for the signed-in person with requirements, version and install totals. |
| endpoint | skill installs route | `apps/web/app/api/skills/installs/route.ts` | Turns a skill on or off for the person. |
| service | chat request processor (skill selection) | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | applyManagedSkillSelection (:1047), implicit offer (:1086), error codes (:5383-5440), surface exclusion (:1073). |
| component | composer plus menu Skills submenu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Lists the person's own skills only (:1248-1251). |
| component | composer mention palette | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Filters installed skills by mention text (:2902-2907) and sends skillName (:1666). |
| hook | useChatStream skill_name | `apps/web/lib/hooks/useChatStream.ts` | Sends skill_name in the chat request (:4643). |
| screen | Mobile Skills screen | `apps/mobile/src/features/skills/SkillsScreen.tsx` | Catalog with Install/Uninstall and 'Use in chat'. |
| service | Chrome skills client | `apps/extension/src/features/cloud-bridge/skillsClient.ts` | Fetches /api/skills and keeps only non-bundled skills. |
| service | Chrome managed chat handler | `apps/extension/src/features/cloud-bridge/managedChatHandler.ts` | Validates and forwards skillName (:303, :787). |
| test | skill catalog tests | `apps/web/lib/services/skill-catalog-service.test.ts` | Covers catalog service behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks review-contract or writes a task; the app sends a chat request with skill_name (or none). | device | apps/web/lib/hooks/useChatStream.ts:4643; apps/extension/src/side_panel.ts:8863 |
| Server loads the bundled skill directory from the .agents/skills tree on disk, filters to product audience and drops skills the person switched off. | our servers | apps/web/lib/services/skill-catalog-service.ts:232-258, :150-160 |
| Server checks the skill exists, the model supports tools, requirements are met, then adds the skill prompt and forces the skill tool. | our servers | request-processor.ts:1047-1070, :5383-5440 |
| The model reads the contract and writes the review; the skill's tools and connectors (for example a document system) run through the connector path. | outside service | SKILL.md:335; model provider call path in request-processor.ts [inferred] |
| The reply streams back and is stored as a normal chat message. | device and our servers | [inferred] from the shared chat path; no review-specific storage found |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Contract text or file sent as chat content | Chat conversation messages on our servers | Yes, with the conversation [inferred] | Follows chat retention; no review-specific rule found |
| Skill install override | Per-person install table read by skill-install-service.ts | Server-side, shared by all apps | Until changed by the person |
| Client/matter records | none found in the code | not applicable | not applicable |

**Models and providers.** The skill is model agnostic text; any tool-capable model chosen for the chat runs it. A model without tools is refused (request-processor.ts:5405-5420). Which provider answers follows the normal chat routing (see SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in to a Cloud chat is needed; skills load from the managed endpoint (request-processor.ts:5383). |
| Permissions | Workspace controls can switch skills off (request-processor.ts:5440, :6556). Required tools or connectors must be on (skill-catalog-service.ts:128-146). |
| Subscription | No plan check specific to this skill was found. Free chat is stated to include skills (request-processor.ts:4412). |
| Limits and metering | Normal chat usage metering applies; nothing contract-specific found. |
| Feature flags | Skill audience manifest decides whether the skill ships to customers (skill-catalog-service.ts:239-258). Skill-layer env SKILLS_LAYERS adds extra layers (:232-236). |
| Model compatibility | Needs a tool-capable model (request-processor.ts:5405-5420). |
| Provider restrictions | none found in the code for this skill. |
| Local mode | On mobile, Skills screen asks the person to switch to Cloud (SkillsScreen.tsx:190). Whether Local inference on mobile or desktop can run any skill is unknown; the skill path is server-side. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Skill switched off | Removed from the catalog; selecting it returns skill_not_found. | skill-catalog-service.ts:150-160; request-processor.ts:1055 |
| Install overrides cannot be read | Non-plugin skills are withheld (overrides null). | skill-catalog-service.ts:150-160; request-processor.ts:3738-3744 |
| Catalog load failure | Error code skill_catalog_unavailable. | request-processor.ts:5397 |
| No playbook | Skill offers to build one or use generic standards. | .agents/skills/review-contract/SKILL.md:56-63 |
| Offline, retry, timeout, cancel | not handled by anything specific to this feature; shared chat stream behaviour applies [inferred] | not handled in the code for this feature |
| CLI or VS Code | Skill not offered. | request-processor.ts:1073 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/skill-catalog-service.test.ts`: Skill catalog service behaviour
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.skill-offer.test.ts`: Implicit skill offers in the chat request
- `apps/web/lib/services/__tests__/skill-install-service.test.ts`: Install overrides
- `apps/web/app/api/skills/__tests__/skill-crud.test.ts`: Skills API create/read/update
- `scripts/verify-skills-lock.mjs`: Checks skill content hashes against skills-lock.json (script, run by CI per CLAUDE.md)

**Test scenarios**

- **Review a pasted contract**
  1. Sign in on web and open a Cloud chat.
  2. Type the mention for review-contract and paste a short services agreement.
  3. Answer the side/deadline questions.
  - Expected: Reply rates clause categories GREEN/YELLOW/RED and gives redline text and a summary.
- **Switch the skill off**
  1. Open /skills and uninstall review-contract.
  2. Start a chat naming the skill.
  - Expected: The skill is not offered; a forced selection returns 'The selected skill is not available.'
- **Tool-less model**
  1. Pick a model without tool support.
  2. Select review-contract and send.
  - Expected: 422 with 'The selected model cannot load skills. Choose a tool-capable model.'
- **Mobile use in chat**
  1. Switch the phone app to Cloud.
  2. Open Skills and tap 'Use in chat' on review-contract.
  3. Send a contract.
  - Expected: Review reply as on web.
- **CLI exclusion**
  1. Send a chat from the CLI naming review-contract.
  - Expected: Skill is not offered.
- **Matter filing**
  1. Look for any client or matter control on each app.
  - Expected: None exists (current state); this scenario passes only when the missing feature is built.

**Where to look when it fails**

- Error codes skill_not_found, skill_model_unsupported, skill_catalog_unavailable, skill_requirements_unmet in chat responses.
- Server log 'Managed Skill catalog load failed' (skill-catalog-service.ts:239-258).
- Log 'Skill install overrides read failed; withholding skills' (request-processor.ts:3741).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/108-specialist-workspaces.md](../../70-qa/test-plans/web/108-specialist-workspaces.md)
- Desktop: [70-qa/test-plans/desktop/108-specialist-workspaces.md](../../70-qa/test-plans/desktop/108-specialist-workspaces.md)
- Mobile: [70-qa/test-plans/mobile/108-specialist-workspaces.md](../../70-qa/test-plans/mobile/108-specialist-workspaces.md)
- Chrome: [70-qa/test-plans/chrome/108-specialist-workspaces.md](../../70-qa/test-plans/chrome/108-specialist-workspaces.md)

## 10. Gaps and dependencies

- **No matter or client record store.** Affects: All four apps; legal users.. Evidence: audit/missing/108-specialist-workspaces.md:67-73; no matter code found. Work needed: Design a matter entity (table, API, screens) and link chats, files and reviews.
- **Playbook has no product input path.** Affects: Web, desktop, mobile, Chrome.. Evidence: SKILL.md:49 names legal.local.md; no reader in apps or packages. Work needed: Decide where the playbook lives (project or account) and feed it to the skill.
- **Bundled skills are hidden in two pickers.** Affects: Chrome and the web plus-menu.. Evidence: skillsClient.ts:36-43; ComposerPlusMenu.tsx:1248-1251. Work needed: Confirm intent; if unintended, show installed bundled skills.
- **Brief status 'done' for mobile and Chrome is not verified by any test of this skill there.** Affects: Mobile, Chrome.. Evidence: No contract-specific test found. Work needed: Run the Mobile and Chrome scenarios above.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-files-artifacts-and-storage
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- file:.agents/skills/review-contract/SKILL.md
- file:skills-lock.json
- file:apps/web/lib/services/skill-catalog-service.ts
- api:GET /api/skills

## Unknown

- How a playbook reaches the skill in the product.
- Whether Chrome and mobile reach review-contract end to end; no test found.
- Whether desktop adds anything beyond the hosted web app for this skill.
- Which connectors satisfy 'CLM routing'.
- Whether Local inference can run any skill.
