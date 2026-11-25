---
id: "F052-04"
type: "feature"
title: "Identity: name, icon, colour and descriptions"
aliases: ["Identity", "Name", "Icon", "Accent colour", "Avatar", "Short description", "Long description", "color frontmatter field", "S52.06", "S52.07", "S52.08", "S52.09"]
area: "52 Custom-assistant builder"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S52.06", "S52.07", "S52.08", "S52.09"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:desktop", "table:user_agents", "api:POST /api/custom-agents", "api:PATCH /api/custom-agents/[id]", "SYS-shared-ui-and-design", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "F052-02", "F052-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F052-04 Identity: name, icon, colour and descriptions

How an assistant is named and recognised in lists: a name (1 to 80 characters), a short description (up to 300), an icon and an accent colour on web and mobile, and a colour name in the CLI. No separate long description exists anywhere.

Area: [52. Custom-assistant builder](README.md). Requirement items: [S52.06](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5206), [S52.07](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5207), [S52.08](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5208), [S52.09](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5209).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives each assistant a recognisable identity shown in lists, the editor header and chat start. Web and mobile store name, description, icon and accent colour. The CLI stores name, description and one of eight colour names. The Tauri desktop stores name and description.

**Why it exists.** S52.06 name, S52.07 avatar or icon or colour, S52.08 short description, S52.09 long description (doc: knowledge-base/data/area-briefs/052-custom-assistant-builder.md).

**Who uses it.** Builders who keep several assistants and need to tell them apart.

**Problems it solves**

- Telling similar assistants apart in a long list.
- Knowing at a glance what an assistant is for.
- Matching a visual identity across web and mobile.

**Use cases**

- A person picks the 'code' icon and a blue accent for a coding assistant.
- A mobile user reads the one-line description under each agent name.
- A developer sets /agents set reviewer color purple so the CLI shows the colour.

## 2. User experience

**Where to find it**

- Web: editor section 'Identity' with 'Name', 'Description', 'Icon' and 'Colour' (apps/web/features/agents/components/AgentConfigForm.tsx:370-447).
- Mobile: editor section 'Identity' with 'Name', 'Description' and icon and colour choices (apps/mobile/src/features/agents/components/AgentConfigSections.tsx:229-285).
- Tauri desktop editor: 'Name' and 'Description' (apps/desktop/src/features/settings/CustomAgentEditor.tsx:216-239).
- CLI: /agents set <name> description <text>; /agents set <name> color <colour> (apps/cli/src/agents.rs:1188-1215).
- VS Code and Chrome: none found.

**Before you start**

- The agent exists and, on web and mobile, the person owns it.

**Screens and controls**

- Web Name input, required, max length 80; Description input, placeholder 'What it does, in one line', max length 300 (AgentConfigForm.tsx:375-395).
- Web Icon group of toggle buttons from PROJECT_ICON_REGISTRY and Colour group from PROJECT_ACCENT_REGISTRY, each with a label (AgentConfigForm.tsx:396-447).
- Web avatar drawn by AgentAvatar in rows and the editor header (AgentsPage.tsx:34; AgentEditorPage.tsx:382).
- Mobile name field placeholder 'Research assistant' and description placeholder 'What this agent is for, in a sentence' (AgentConfigSections.tsx:238, 248).
- CLI colours: red, blue, green, yellow, purple, orange, pink, cyan (agents.rs:19-21).

**Journey**

1. Open the editor.
2. Type the name and a one-line description.
3. Pick an icon and colour (web, mobile).
4. Save the draft; the avatar and name update in the header and list.
5. CLI: run /agents set <name> color <colour> or description <text>.

**What the person sees and gets**

- Header shows avatar, name, status pill and description (AgentEditorPage.tsx:380-398).
- List rows show avatar, name, one-line description (AgentsPage.tsx:33-41).
- CLI error for a bad colour: 'Unknown color `<value>`. Colors: ...' (agents.rs, set_agent_field).

**Settings**

- Defaults are icon 'sparkles' and colour 'zinc' (apps/web/lib/services/custom-agent-service.ts:31-32).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and mobile name, description, icon, accent colour, stored in user_agents and validated by pattern ^[a-z][a-z0-9-]{0,39}$ for icon and colour (packages/contracts/cloud-contracts/src/agents.ts:32, 90-93; apps/web/db/neon/0370_user_agents.sql:49-52).
- Web avatar component and mobile avatar component (apps/web/features/agents/components/AgentAvatar.tsx; apps/mobile/src/features/agents/components/AgentAvatar.tsx).
- CLI name and description from frontmatter, colour validated against eight names, rename that moves the file and rewrites the name (agents.rs:19-21, 451-470, 1165-1186, 1188-1215).
- Built-in catalog agents carry their own icon and accent (packages/contracts/cloud-contracts/src/agent-catalog.ts:5-17).

**Incomplete**

- CLI has no icon field; only colour (agents.rs:25-48).
- Tauri desktop editor shows a generic bot icon; it has no icon or colour control (CustomAgentsList.tsx:70).
- Server stores only the identifier strings; whether web and mobile draw every stored identifier is unknown beyond registries named.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Long description separate from the short one: none found in the schema, form or migration (agents.ts:90-98; 0370_user_agents.sql:49).
- Icon or colour on VS Code and Chrome: none found.

## 4. Required behaviour

**Established requirements**

- An assistant has a user-set name shown wherever it is listed or used. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S52.06)
- An assistant can carry an avatar, icon or colour that identifies it. (source: S52.07 (doc: same brief))
- An assistant has a short description shown in lists. (source: S52.08 (doc: same brief))
- An assistant can carry a longer description separate from its short one. (source: S52.09 (doc: same brief))
- Name is required, 1 to 80 characters; description up to 300; icon and colour short identifiers with defaults. (source: packages/contracts/cloud-contracts/src/agents.ts:15-16, 32, 90-93)
- CLI colour must be one of eight names. (source: apps/cli/src/agents.rs:19-21)

**Acceptance criteria**

1. Web: a name over 80 characters cannot be typed (maxLength) and is refused by the API.
2. Web: choosing an icon and colour and saving shows both in the Agents list row.
3. Web: icon and colour default to sparkles and zinc for a new agent.
4. Mobile: the same agent shows the same icon and colour as web.
5. CLI: /agents set demo color cyan succeeds; color magenta fails.
6. CLI: rename keeps the file and updates the name field.
7. A long description is not offered anywhere (current state); when built, it must be separate from the 300-character field.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Icon identifiers must exist in the UI registry for them to draw; the schema allows any matching string [inferred from agents.ts:32 versus the registry in AgentConfigForm.tsx:12-13].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a longer description field with its own limit and show it on a detail view.
- [proposed] Offer colour and icon in the CLI and Tauri editor that map to the web registries.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AgentConfigForm Identity section | `apps/web/features/agents/components/AgentConfigForm.tsx` | Name, Description, Icon, Colour controls. |
| component | AgentAvatar (web) | `apps/web/features/agents/components/AgentAvatar.tsx` | Draws icon on accent. |
| component | AgentAvatar (mobile) | `apps/mobile/src/features/agents/components/AgentAvatar.tsx` | Mobile avatar. |
| component | AgentConfigSections Identity | `apps/mobile/src/features/agents/components/AgentConfigSections.tsx` | Mobile identity fields. |
| schema | AgentConfigSchema name, description, icon, accentColor | `packages/contracts/cloud-contracts/src/agents.ts` | Limits and identifier pattern (lines 32, 89-93). |
| config | DEFAULT_AGENT_ICON, DEFAULT_AGENT_ACCENT | `apps/web/lib/services/custom-agent-service.ts` | Defaults (lines 31-32). |
| table | user_agents columns | `apps/web/db/neon/0370_user_agents.sql` | name, description, icon, accent_color with CHECK constraints (lines 49-52). |
| other | agent catalog | `packages/contracts/cloud-contracts/src/agent-catalog.ts` | Built-in agents with icon and accent. |
| command | AGENT_COLORS and color_name | `apps/cli/src/agents.rs` | CLI colour list and filter (lines 19-21, 51). |
| command | set_agent_field color/description | `apps/cli/src/agents.rs` | CLI edits (line 1188). |
| command | rename_agent | `apps/cli/src/agents.rs` | CLI rename (line 1165). |
| component | CustomAgentEditor name and description | `apps/desktop/src/features/settings/CustomAgentEditor.tsx` | Tauri fields. |
| command | build_agent_markdown | `apps/desktop/src-tauri/src/sys/commands/custom_agents.rs` | Writes name and description only (line 217). |
| other | agent-display state label | `apps/web/features/agents/lib/agent-display.ts` | State line under the name. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person edits the identity fields; they live in the draft state in the browser or app. | device | AgentConfigForm.tsx:382-445 |
| Save sends them with the rest of the config to POST or PATCH. | device and our servers | agents-client.ts:115-128 |
| The server validates the schema and writes the columns; the response is parsed and drawn. | our servers | custom-agent-service.ts:339-415 |
| CLI set rewrites one frontmatter line in the Markdown file after validating colour. | device | agents.rs:1188-1240 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| name, description, icon, accent_color | user_agents row | All Cloud apps. | Until the agent is deleted. |
| name, description, color in agent file | frontmatter of a Markdown file on disk | No. | Until the file is deleted. |

**Models and providers.** No model is involved. The CLI draft names an agent through the session model but the name is slugified locally (agents.rs:810-844).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile: signed in. CLI and Tauri desktop: none. |
| Permissions | Owner only edits; teammates see the published identity (custom-agent-service.ts:146-150). |
| Subscription | none found in the code. |
| Limits and metering | Name 80 characters, description 300 characters, identifiers 40 characters (agents.ts:15-16, 32). |
| Feature flags | none found. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | CLI and Tauri desktop identity edits are local files. Mobile Local mode cannot edit identity because the Agents screens are gated. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty name | Save blocked with 'Give the agent a name.' | agent-draft.ts:38-41 |
| Name collisions in the CLI | Rename refuses when the target file exists. | agents.rs:1165-1186 |
| Name that slugs to empty in the CLI | 'agent name must contain at least one letter or number'. | agents.rs:1062-1074 |
| Unknown colour in a file | color_name returns none and the colour is ignored. | agents.rs:51-55 |
| Read-only agent | Fields disabled for non-owner. | AgentEditorPage.tsx:184, 290 |
| Accessibility | Icon and colour buttons carry aria-pressed and labels; coarse pointer sizes 44 px. | AgentConfigForm.tsx:402-436 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/agents/__tests__/AgentEditorPage.test.tsx`: Header with Active pill and description; name required.
- `apps/mobile/src/features/agents/__tests__/AgentsScreens.test.tsx`: Draws every built-in agent with an icon and accent the app knows.
- `packages/contracts/cloud-contracts/src/__tests__/agent-catalog.test.ts`: The built-in agent list shape.
- `apps/cli/src/agents.rs`: Frontmatter parsing, rename and field helpers in inline tests (parse tests from line 1782).
- `apps/web/db/neon/user-agents-migration.test.ts`: Migration constraints.

**Test scenarios**

- **Identity round trip on web**
  1. Create an agent named 'Docs helper' with the first icon and a non-default colour.
  2. Reload the page.
  - Expected: Name, description, icon and colour persist and appear in the list row.
- **Cross-app identity**
  1. Create the agent on web.
  2. Open it in mobile Cloud mode.
  - Expected: Same name, description, icon, colour.
- **Name limit**
  1. POST an 81-character name.
  - Expected: Validation error.
- **CLI colour**
  1. Run /agents set demo color cyan, then /agents set demo color teal.
  - Expected: First updates; second lists valid colours.
- **Long description absence**
  1. Look for a long description field on web and mobile editors.
  - Expected: Not present (current state).

**Where to look when it fails**

- Validation message 'Invalid agent request' with issues (agent-route.ts:48-52).
- Database CHECK failure in user_agents on out-of-range values.
- CLI messages from set_agent_field.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/052-custom-assistant-builder.md](../../70-qa/test-plans/cli/052-custom-assistant-builder.md)
- No hands-on plan yet for Web, Desktop, Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No long description.** Affects: All apps.. Evidence: S52.09 missing; schema has one description field.. Work needed: Add field, limit, migration, forms and display.
- **Brief says avatar missing on web and mobile but they have icon and colour.** Affects: Planning accuracy.. Evidence: S52.07 status line versus AgentConfigForm.tsx:396-447.. Work needed: Correct the brief.
- **CLI and Tauri lack icons; CLI colour set differs from the web accent set.** Affects: Developers.. Evidence: agents.rs:19-21 versus PROJECT_ACCENT_REGISTRY. Work needed: Map colours or document the difference.
- **No identity on VS Code and Chrome.** Affects: Those surfaces.. Evidence: No code found.. Work needed: Product decision.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- table:user_agents
- api:POST /api/custom-agents
- api:PATCH /api/custom-agents/[id]
- SYS-shared-ui-and-design
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- F052-02
- F052-01

## Unknown

- Whether web and mobile draw every identifier the schema permits.
- Whether the CLI shows colour in the interactive terminal list (color_name seen, rendering not read).
- Whether the Electron desktop shows the web avatar (inferred only).
- Where the brief's CLI references claude_parity.rs:188 land (not opened).
