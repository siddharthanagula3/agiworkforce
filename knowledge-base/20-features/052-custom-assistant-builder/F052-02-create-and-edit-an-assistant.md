---
id: "F052-02"
type: "feature"
title: "Create and edit an assistant"
aliases: ["New agent", "Create an agent", "Create Agent", "Agent editor", "AgentConfigForm", "CustomAgentEditor", "/agents create", "/agents set", "S52.02", "S52.04"]
area: "52 Custom-assistant builder"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "partial", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S52.02", "S52.04"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "surface:cli", "mode:cloud", "mode:local", "mode:own-key", "table:user_agents", "api:POST /api/custom-agents", "api:PATCH /api/custom-agents/[id]", "api:POST /api/custom-agents/import", "SYS-model-catalog-and-routing", "SYS-api-and-contracts", "SYS-authentication-and-identity", "F052-01", "F052-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F052-02 Create and edit an assistant

Making a new custom assistant and changing its fields. Web and mobile use a form that saves a draft through the Cloud API. The Tauri desktop settings write an agent file. The CLI writes a template, asks the session model to draft one from words, or edits one field at a time.

Area: [52. Custom-assistant builder](README.md). Requirement items: [S52.02](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5202), [S52.04](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5204).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person create an assistant and edit its fields: name, description, icon, colour, instructions, output examples, starters, preferred model, reasoning effort, web search, code execution, image generation, connectors, skills, website rules and limits on web and mobile; name, description, model, tools and prompt in Tauri desktop; description, model, colour, tools, disallowed tools, skills, max turns, budget, permission mode and prompt in the CLI.

**Why it exists.** S52.02 says a user can create a custom assistant from the product; S52.04 says a user can edit its fields in a form or editor (doc: knowledge-base/data/area-briefs/052-custom-assistant-builder.md).

**Who uses it.** Web and mobile: any signed-in person. CLI and Tauri desktop: developers.

**Problems it solves**

- Starting a purpose-built assistant without repeating instructions in every chat.
- Changing one field later without rebuilding.
- Not losing edits by accident (unsaved-changes guard, apps/web/features/agents/components/AgentEditorPage.tsx:186-191).
- Importing an existing agent file from another tool (AgentsPage.tsx:139-152).

**Use cases**

- A person on web presses 'New agent', fills Name and Instructions and presses 'Create agent'.
- A mobile user opens an existing agent and presses 'Save' after editing instructions.
- A developer types /agents create release notes writer to have the session model draft an agent file.
- A developer types /agents set reviewer model <id> to change one field.

## 2. User experience

**Where to find it**

- Web: Agents page, button 'New agent' (route /chat/agents/new) or row button 'Edit' (route /chat/agents/<id>) (AgentsPage.tsx:187-189; apps/web/features/agents/lib/agent-display.ts:3-8).
- Mobile: Agents screen, button 'New' (accessibility label 'Create an agent'), then the editor screen (AgentsScreen.tsx:510-512; apps/mobile/src/features/agents/AgentEditorScreen.tsx).
- Tauri desktop: Settings, Agents, 'Create Agent' button or a card's edit icon, opening the editor titled 'Create Custom Agent' or 'Edit Agent: <name>' (CustomAgentsList.tsx:249-252; CustomAgentEditor.tsx:171-173).
- CLI: /agents create <name> [--global], /agents create <description words>, /agents set <name> <field> <value> (agents.rs:580-660).
- VS Code and Chrome: none found.

**Before you start**

- Web and mobile: signed in; mobile in Cloud mode.
- CLI create from words: a working model session; the call fails closed if the session's privacy boundary is not satisfied (agents.rs:752-760).
- A name is required everywhere (web draftProblem 'Give the agent a name.').

**Screens and controls**

- Web form 'Agent configuration' in sections Identity, Instructions, Model and tools, plus connectors, skills and Websites fields (AgentConfigForm.tsx:370-496 and following).
- Web footer: status text, 'Cancel' (or 'Back to Agents' when read-only) and 'Create agent' or 'Save draft' (AgentEditorPage.tsx:333-358, 312).
- Web tabs once saved: 'Agent', 'Sessions', 'Deployments' (AgentEditorPage.tsx:43-47).
- Mobile: 'Create' or 'Save' button in the header; sections Identity, Behaviour, Model and tools, Connectors and skills; a model picker sheet (AgentEditorScreen.tsx:96-103; AgentConfigSections.tsx:229-391).
- Tauri editor: Name (placeholder 'e.g. frontend-engineer'), Description, Model (default 'Inherit from settings'), Scope (global or project), Allowed Tools, System Prompt, buttons Cancel and Save, and a Delete with 'Delete permanently?' confirm (CustomAgentEditor.tsx:216-351).
- CLI verbs as above.

**Journey**

1. Web: press 'New agent'.
2. Type a Name (required).
3. Optionally fill description, icon, colour, instructions, tools and limits.
4. Press 'Create agent'; the page toasts 'Created <name>.' and moves to /chat/agents/<id> (AgentEditorPage.tsx:226-230).
5. To edit: open the agent, change fields, press 'Save draft'; toast 'Draft saved.' (AgentEditorPage.tsx:224-225).
6. Changes do not reach teammates until published (publish panel; owned by another feature).

**What the person sees and gets**

- Web: 'Unsaved changes' line and 'All changes saved.' (AgentEditorPage.tsx:337-345).
- Web: form error under the form when the name is empty or the save fails (AgentEditorPage.tsx:328-332).
- Web: unsaved-changes dialog 'Your changes to this agent have not been saved. If you leave now, they will be lost.' (AgentEditorPage.tsx:186-191).
- CLI create from words success: 'Created <scope> agent `<name>` at <path>' plus 'The instructions were written by the model, so read the file before you use the agent.' (agents.rs:718-736).
- CLI failure: 'Could not draft that agent: <error>' and 'For a blank template instead: /agents create <name>' (agents.rs:738-740).
- CLI field error examples: 'Unknown color ...' and 'maxBudgetUsd takes a positive amount in US dollars, such as 0.50.' (agents.rs:1188-1215).

**Settings**

- Web model list depends on the person's plan tier via getScheduleModelOptions (AgentEditorPage.tsx:179-182).
- CLI scope flag --global or -g chooses the global folder (agents.rs:692-714).
- CLI field names: description, model, color, tools, disallowedTools, skills, maxTurns, maxBudgetUsd, permissionMode, prompt (agents.rs, EDITABLE_AGENT_FIELDS near line 1120).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web create and edit with validation, unsaved-change guard, read-only mode for non-owners and retired agents (AgentEditorPage.tsx:183-250).
- POST /api/custom-agents (201) and PATCH /api/custom-agents/[id] (apps/web/app/api/custom-agents/route.ts:32-42; [id]/route.ts:37-47).
- Server rules: name 1 to 80, description up to 300, instructions up to 32,000, model must be from the catalog or Auto, website rules normalised, effort moved to the nearest level the model takes, retired agents refuse edits (custom-agent-service.ts:180-257, 339-415; packages/contracts/cloud-contracts/src/agents.ts:89-116).
- Mobile create and edit using the shared draft helpers from the contract package (apps/mobile/src/features/agents/useAgentEditor.ts:3-9, 88-107).
- Import of a Markdown agent file creates a draft (apps/web/app/api/custom-agents/import/route.ts; AgentsPage.tsx:139-152).
- Tauri desktop create, edit, save through save_custom_agent writing YAML frontmatter plus body (custom_agents.rs:217-282).
- CLI template create, model draft, set, rename (agents.rs:718-740, 1054-1090, 1165-1240).

**Incomplete**

- CLI draft runs once and returns; it is not a conversation (agents.rs:777-808).
- Tauri editor writes only name, model, description, tools and body; colour, skills, budget and mode are not in its frontmatter writer (custom_agents.rs:217-257).
- Web keeps its own agent-draft.ts next to the shared agent-drafts.ts that mobile uses (apps/web/features/agents/lib/agent-draft.ts versus packages/contracts/cloud-contracts/src/agent-drafts.ts); two copies of NEW_AGENT_DRAFT.
- The web draft problem check only tests the name (agent-draft.ts:38-41); other limits are enforced by the browser maxLength and the server schema.

**Present but disconnected or switched off**

- Web connectors selector shows a 'coming soon' message when connectors are not released (AgentConfigForm.tsx imports CONNECTORS_COMING_SOON_MESSAGE and connectorsReleased; mobile AgentConfigSections.tsx:386).
- Tauri desktop editor files are not run by the desktop app (custom_agents.rs:200-205).

**Not available**

- VS Code and Chrome create or edit.
- Plan-based limits on agent creation: none found.

## 4. Required behaviour

**Established requirements**

- A user can create a new custom assistant from the product. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S52.02)
- A user can edit an assistant's fields (name, instructions, model, tools) in a form or editor inside the product. (source: S52.04 (doc: same brief))
- Name 1 to 80 characters, description up to 300, instructions up to 32000. (source: packages/contracts/cloud-contracts/src/agents.ts:15-17, 90-94)
- CLI: the draft is saved and the reply tells the person to read the file first; a bad field value stops the save. (source: apps/cli/src/agents.rs:718-736, 1188-1215)
- Do not hardcode model ids; consumers resolve through the catalog. (source: doc: AGENTS.md section 4)
- Brief status for web, desktop, mobile is 'missing' but code exists; CLI 'done'. (source: S52.02, S52.04 status lines)

**Acceptance criteria**

1. Web: saving with an empty name shows 'Give the agent a name.' and sends nothing.
2. Web: a valid create returns 201, the page shows 'Created <name>.' and navigates to the new id.
3. Web: editing a field then pressing Cancel asks to discard.
4. Web: a name of 81 characters is refused by the API with a validation error.
5. Web: a non-owner sees 'Read-only agent' and no save button.
6. CLI: /agents set demo color magenta fails with 'Unknown color'.
7. CLI: /agents set demo maxBudgetUsd 0 fails.
8. Mobile: Create button is disabled until the draft is dirty and has a name.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The same field limits should apply on every app because all Cloud apps use one contract [inferred].
- Saving should never change what teammates see until publish [inferred from toManagedCloudAgent showing teammates the published copy].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the Tauri editor and the CLI share one frontmatter writer.
- [proposed] Remove the duplicate web draft module in favour of the shared one.
- [proposed] Add VS Code and Chrome entry points if those surfaces need agent creation.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | AgentEditorPage | `apps/web/features/agents/components/AgentEditorPage.tsx` | Web editor shell, load, save, chat, tabs. |
| component | AgentConfigForm | `apps/web/features/agents/components/AgentConfigForm.tsx` | Web fields. |
| other | agent-draft | `apps/web/features/agents/lib/agent-draft.ts` | NEW_AGENT_DRAFT, draftProblem (line 38). |
| service | agentsApi.create / update | `apps/web/features/agents/services/agents-client.ts` | POST and PATCH calls. |
| endpoint | POST /api/custom-agents | `apps/web/app/api/custom-agents/route.ts` | Create. |
| endpoint | PATCH /api/custom-agents/[id] | `apps/web/app/api/custom-agents/[id]/route.ts` | Update draft. |
| endpoint | POST /api/custom-agents/import | `apps/web/app/api/custom-agents/import/route.ts` | Create a draft from a Markdown file. |
| service | createAgent / updateAgentDraft | `apps/web/lib/services/custom-agent-service.ts` | Insert (line 339) and update (line 386) with validation. |
| schema | AgentConfigSchema | `packages/contracts/cloud-contracts/src/agents.ts` | Field limits (line 89). |
| other | agent-drafts | `packages/contracts/cloud-contracts/src/agent-drafts.ts` | Shared draft helpers used by mobile. |
| hook | useAgentEditor | `apps/mobile/src/features/agents/useAgentEditor.ts` | Mobile load and save state (line 36). |
| screen | AgentEditorScreen | `apps/mobile/src/features/agents/AgentEditorScreen.tsx` | Mobile editor. |
| component | AgentConfigSections | `apps/mobile/src/features/agents/components/AgentConfigSections.tsx` | Mobile field sections. |
| component | CustomAgentEditor | `apps/desktop/src/features/settings/CustomAgentEditor.tsx` | Tauri desktop editor. |
| command | save_custom_agent | `apps/desktop/src-tauri/src/sys/commands/custom_agents.rs` | Writes the agent file (line 260). |
| command | create_agent_template / AgentRequest::create | `apps/cli/src/agents.rs` | CLI blank template (line 1054) and model draft (create near line 718). |
| command | set_agent_field | `apps/cli/src/agents.rs` | CLI single-field edit (line 1188). |
| table | user_agents | `apps/web/db/neon/0370_user_agents.sql` | Row storage with CHECK constraints mirroring the limits (lines 44-80). |
| test | AgentEditorPage tests | `apps/web/features/agents/__tests__/AgentEditorPage.test.tsx` | Create, guard, effort, websites. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person fills the form; the browser keeps the draft in React state and compares it with the saved copy. | device | AgentEditorPage.tsx:141-183 |
| Save sends POST or PATCH with a CSRF header and bearer token. | device and our servers | agents-client.ts:40-47, 115-128 |
| The route checks CSRF, rate limit and user scope, parses the body against the shared schema, then runs createAgent or updateAgentDraft. | our servers | apps/web/lib/agents/agent-route.ts:40-52; custom-agent-service.ts:339-415 |
| The service normalises website rules, validates the model against the catalog, aligns effort, and writes the row. | our servers | custom-agent-service.ts:180-257 |
| The saved agent is returned and shown; the saved copy is a draft until published. | device and our servers | AgentEditorPage.tsx:193-198 |
| CLI create from words sends the text to the session's own model and provider, parses the JSON reply, and writes an agent file. | outside service | apps/cli/src/agents.rs:777-808, 845-852; model may be a local model if the session uses one [inferred] |
| CLI set and Tauri save write a Markdown file on the device. | device | agents.rs:1188-1240; custom_agents.rs:260-282 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Agent working copy | user_agents row | Visible to all Cloud apps of the same owner. | Until the owner deletes it. |
| CLI or desktop agent file | Markdown file on disk | No sync found. | Until the file is deleted. |
| CLI model draft request text | Sent to the session's provider; not stored by the code read | n/a | unknown (provider side). |

**Models and providers.** Web: the preferred-model field lists models for the person's plan tier and the server accepts only catalog models or Auto (AgentEditorPage.tsx:179-182; custom-agent-service.ts:180-187). Mobile uses the same model picker with Cloud scope (AgentEditorScreen.tsx:166-172). CLI draft uses the session's provider and model so it never leaves the session's privacy boundary (agents.rs:745-760).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile require a signed-in account. CLI and Tauri desktop need none for file work; CLI draft needs a model session. |
| Permissions | Only the owner may change an agent (requireOwnedAgent, custom-agent-service.ts:321). CSRF required for writes (agent-route.ts:40-46). Retired agents refuse edits (custom-agent-service.ts, assertEditable). |
| Subscription | none found in the code for creating agents. The model list depends on plan tier (AgentEditorPage.tsx:148, 179). |
| Limits and metering | Rate limit chat-conversation 60 per minute (rate-limit.ts:282). Per-agent daily turn limit and monthly credit limit are set in this form (AgentConfigSchema lines 108-115). Cap on number of agents: none found. |
| Feature flags | Connectors released flag controls the connector choices (AgentConfigForm.tsx imports connectorsReleased). |
| Model compatibility | The effort choices shown depend on the pinned model (agentEffortLevels, agents.ts:66-70). |
| Provider restrictions | none found in the code on the web form; CLI draft is restricted to the session provider. |
| Local mode | Mobile Local mode: gated, cannot create. CLI and Tauri file creation work without our servers; the CLI draft works with whichever model the session uses, including a local one if configured [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Name empty | Form error 'Give the agent a name.' and focus moves to the required input. | AgentEditorPage.tsx:212-219; agent-draft.ts:38-41 |
| Saving | Button busy with spinner, fields disabled, Cancel disabled. | AgentEditorPage.tsx:290, 297-313, 347-355 |
| Save failure | Error shown; draft kept for retry. | AgentEditorPage.tsx:232-234; test title in AgentEditorPage.test.tsx:173 |
| Unsaved navigation | Confirm dialog on Cancel and the Agents back link. | AgentEditorPage.tsx:186-191, 352 |
| Load failure | Message with 'Try again' and 'Back to Agents'. | AgentEditorPage.tsx:262-278 |
| Not owner or retired | Read-only; fields disabled. | AgentEditorPage.tsx:184 |
| CLI draft timeout | The model call is bounded by a timeout constant DRAFT_TIMEOUT and the error 'the model did not answer in time' is returned. | agents.rs:777-808 |
| CLI file exists | Create refuses with '<path> already exists'. | agents.rs:1076-1090 |
| Tauri save over existing file | Overwrites without asking. | custom_agents.rs:260-282 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/agents/__tests__/AgentEditorPage.test.tsx`: Submit routes, discard guard, failed create keeps draft, name required, tabs, connectors and skills, credit cap, websites, effort.
- `apps/web/app/api/custom-agents/route.test.ts`: POST create and invalid body.
- `apps/web/app/api/custom-agents/[id]/route.test.ts`: Single-agent routes.
- `apps/web/app/api/custom-agents/import/route.test.ts`: Markdown import route.
- `apps/web/lib/agents/__tests__/custom-agent-service.test.ts`: Model validation, website rules, effort handling.
- `packages/contracts/cloud-contracts/src/__tests__/agent-drafts.test.ts`: Shared draft helpers and name-required message.
- `apps/mobile/src/features/agents/__tests__/AgentsScreens.test.tsx`: Create from the editor with instructions and tools.
- `apps/cli/src/agents.rs`: Inline tests for template, draft parsing and path rules (tests near lines 1932-2036).
- `apps/web/db/neon/user-agents-migration.test.ts`: The migration for user_agents.

**Test scenarios**

- **Create on web**
  1. Open /chat/agents/new.
  2. Type Name 'Release notes'.
  3. Press 'Create agent'.
  - Expected: Toast 'Created Release notes.', URL becomes /chat/agents/<id>, header shows Draft.
- **Over-long field**
  1. Call POST /api/custom-agents with a 300+ character description.
  - Expected: Validation error 'Invalid agent request'.
- **Discard guard**
  1. Edit an agent's description.
  2. Press Cancel.
  - Expected: Dialog about unsaved changes; discard resets the draft.
- **CLI draft**
  1. In the CLI run /agents create an agent that reviews pull requests for security.
  - Expected: A file is written and the reply includes the read-the-file warning; with no model access the reply shows the error and the blank template command.
- **CLI bad field**
  1. Create /agents create demo.
  2. Run /agents set demo color magenta.
  - Expected: Error listing valid colours; file unchanged.
- **Teammate edit**
  1. Share an agent, sign in as a teammate, open it.
  - Expected: 'Only its owner can change it.' and no Save button.

**Where to look when it fails**

- API error body error.message and status (agents-client.ts:49-59).
- createError.validation 'Pick a model from the list.' for a bad model (custom-agent-service.ts:180-187).
- Conflict 'This agent is retired. Bring it back before changing it.' (custom-agent-service.ts assertEditable).
- Table user_agents CHECK constraints (0370_user_agents.sql:44-80).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/052-custom-assistant-builder.md](../../70-qa/test-plans/cli/052-custom-assistant-builder.md)
- No hands-on plan yet for Web, Desktop, Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Brief says web, desktop and mobile create/edit are missing; they exist.** Affects: Planning accuracy.. Evidence: S52.02 and S52.04 status lines versus the editor files.. Work needed: Update the brief after human verification.
- **Two copies of the draft helpers.** Affects: Maintainers; risk of drift between web and mobile.. Evidence: apps/web/features/agents/lib/agent-draft.ts and packages/contracts/cloud-contracts/src/agent-drafts.ts. Work needed: Use the shared module on web.
- **Tauri editor writes fewer fields than the CLI reads.** Affects: Developers using the Tauri settings.. Evidence: custom_agents.rs:217-257 versus agents.rs:25-48. Work needed: Extend the writer or document the reduced set.
- **No create or edit on VS Code and Chrome.** Affects: Those surfaces.. Evidence: No code found.. Work needed: Product decision then build.
- **Tauri save overwrites an existing file silently.** Affects: Tauri desktop users.. Evidence: custom_agents.rs:260-282. Work needed: Check for an existing file or version it.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- surface:cli
- mode:cloud
- mode:local
- mode:own-key
- table:user_agents
- api:POST /api/custom-agents
- api:PATCH /api/custom-agents/[id]
- api:POST /api/custom-agents/import
- SYS-model-catalog-and-routing
- SYS-api-and-contracts
- SYS-authentication-and-identity
- F052-01
- F052-04

## Unknown

- Exact CLI default timeout value (constant DRAFT_TIMEOUT seen, number not re-read).
- Whether Electron desktop exposes the web editor identically.
- Whether the web connectors selector is currently hidden by the release flag in production.
- Where the CLI interactive dispatch of /agents create with words calls AgentRequest::create (not opened).
- Whether creating an agent is metered in AGI Subscription usage: none found.
