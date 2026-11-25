---
id: "F054-10"
type: "feature"
title: "Customize a plugin (copy its skills)"
aliases: ["Customize", "Make my copy", "Edit plugin", "Create a plugin", "Skill authoring", "Plugin draft card", "Save plugin", "user skill authoring", "S54.27 Customize installed plugin", "S54.28 Fork plugin", "S54.35 Plugin-creation assistant"]
area: "54 Plugin marketplace and customization"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S54.27", "S54.28", "S54.35"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "api:POST /api/plugins/customize", "api:POST /api/plugins/authored", "api:PUT /api/plugins/authored/[entryId]", "api:GET /api/chat/conversations/[id]/plugin-drafts/[toolCallId]", "table:plugin_marketplace_entries", "table:plugin_marketplace_entry_files", "table:plugin_marketplace_installations", "F054-08", "F054-09", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "6 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F054-10 Customize a plugin (copy its skills)

On web and desktop (hosted web), 'Customize' makes your own editable copy of an installed, turned-on plugin's skills, then turns the original off. 'Edit plugin' changes the copy. In chat, asking to build a plugin or skill can show a draft card with a Save button. Copy and edit are the only fork path found.

Area: [54. Plugin marketplace and customization](README.md). Requirement items: [S54.27](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5427), [S54.28](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5428), [S54.35](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5435).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Copies the skills and companion files of an installed plugin into a new personal plugin that keeps the original's name and has key '<key>-custom', stored under an authored source named '<name> (custom)'; installs and enables it, turns the original off, and opens the editor. Also lets a person create a plugin by form or by asking in chat.

**Why it exists.** People want to change a plugin's skills without losing the original (brief: S54.27, S54.28, S54.35). Skill authoring is on by default and can be switched off by a server setting (apps/web/lib/services/user-skill-authoring.ts:5-12).

**Who uses it.** Signed-in web and desktop-hosted users who write or tune skills.

**Problems it solves**

- A published plugin is almost right but needs one skill changed.
- Writing a plugin from nothing.
- Keeping the original available to turn back on.

**Use cases**

- Customize a built-in pack and edit its 'summarize' skill.
- Ask the assistant 'build a plugin that drafts release notes' and press 'Save plugin' on the card.
- Press 'Edit plugin' on an authored plugin and save changes.

## 2. User experience

**Where to find it**

- Web: Settings > Customize > Plugins > installed plugin > button 'Customize' with hint 'Make your own copy of this plugin and edit its skills.' (packages/ui/ui/src/directory/PluginDetailView.tsx:911-940; constants.ts:454-455).
- Web: authored plugins show 'Edit plugin'; creation form titled 'Create a plugin' (constants.ts:429,449).
- Web chat: a card with 'Save plugin' and 'Save as a skill' buttons after a build request (apps/web/features/chat/components/PluginDraftCard.tsx:29-30).
- Desktop (public Electron app): the hosted web app; the draft card is offered on the 'web' and 'desktop' chat surfaces (apps/web/lib/server/tools/plugin-draft-tool.ts:43).
- Mobile: no copy or edit; the card titled 'Customize' only switches skills on or off (apps/mobile/src/features/plugins/PluginDetailScreen.tsx:549).
- CLI, VS Code, Chrome: not available. For the CLI this is a recorded decision (doc: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-29 lists plugin customize and S54.27 for CLI).

**Before you start**

- Signed in; the plugin installed and turned on (the Customize button shows only then) (apps/web/features/directory/services/plugins-directory.ts:998,1035).
- Skill authoring not switched off (AGI_USER_SKILL_AUTHORING not '0').
- Workspace gates for both 'plugins' and 'skills' pass (apps/web/features/plugins/server/directory/install-gate.ts:14,26-37).
- The plugin has at least one skill (customize.ts:161).

**Screens and controls**

- 'Customize' button; confirm dialog 'Customize <name>?' with body 'You get your own copy with the same skills and files, which you can edit. The original is turned off so your chats use your copy; you can turn it back on from its page.' and confirm 'Make my copy' (constants.ts:456-459; DirectoryPanel.tsx:669-686).
- 'Edit plugin' button and form with Name, Description and Skills, button 'Save changes' (constants.ts:429-452).
- Draft card buttons 'Save plugin' and 'Save as a skill'; saved text 'Saved as a plugin. Its skills are on in your chats.' (PluginDraftCard.tsx:29-35).

**Journey**

1. Open an installed, turned-on plugin that has skills.
2. Press 'Customize' and confirm 'Make my copy'.
3. The server copies skills and files into a plugin with key '<key>-custom' under an authored source named '<name> (custom)', installs it turned on, and turns the original off.
4. The editor opens on the copy; change the skills and press 'Save changes'.
5. To go back, open the original page and turn it on again.
6. Chat path: ask for a plugin or skill; the assistant calls the draft tool; press 'Save plugin' on the card.

**What the person sees and gets**

- The page switches to the copy; the original shows as off (useDirectoryAdapter.ts:1688-1707; DirectoryPanel.tsx:669-686).
- Errors: 'Install and turn on this plugin before you customize it.' (409), 'This plugin has no skills that can be copied.' (422), 'Skill authoring is not available.' (404) (apps/web/app/api/plugins/customize/route.ts:47-62; customize.ts:39; user-skill-authoring.ts:8).
- If a copy already exists the same copy is returned with created false (customize/route.ts:62-66).

**Settings**

- AGI_USER_SKILL_AUTHORING: server switch, on unless set to 0 (apps/web/lib/services/user-skill-authoring.ts:5-12).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/plugins/customize: CSRF, rate limit, gate for plugins and skills, then customizePlugin; returns 201 {entryId, created: true} or 200 with created false (apps/web/app/api/plugins/customize/route.ts:23-80).
- customizePlugin resolves the original (user marketplace entry, built-in registry pack, or directory plugin), validates every skill draft, copies companion files up to a limit, stores an 'authored' source with key '<key>-custom', installs it turned on, and turns the original off (apps/web/features/plugins/server/directory/customize.ts:84-119,154-198; apps/web/lib/services/plugin-owned-source-service.ts:289-312). The stored plugin keeps the original's name (customize.ts:190); only the source name gets ' (custom)' (customize.ts:186) and the key gets '-custom' (customize.ts:162).
- The Customize button is offered for an installed and enabled plugin (customizable = installed and on, plugins-directory.ts:998); the not-authored exclusion applies only to user marketplace entries (plugins-directory.ts:1035).
- Edit: GET and PUT /api/plugins/authored/[entryId] load and save an authored plugin; POST /api/plugins/authored creates one, both gated by refusePluginInstall with authorsSkills (apps/web/app/api/plugins/authored/route.ts:92; apps/web/app/api/plugins/authored/[entryId]/route.ts:85,114-115).
- Plugin-creation assistant exists: a chat tool 'plugin draft' is offered on web and desktop surfaces for non-temporary, streaming, tool-capable turns whose message matches build/create/make/write/draft/design/turn/update/change/edit near plugin or skill, with authoring and the plugins and skills workspace gates passing (apps/web/lib/server/tools/plugin-draft-tool.ts:21-22,43-46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1226-1233,1237-1257,5590-5594).
- Draft card saves to POST /api/plugins/authored or the skills API (apps/web/features/chat/components/PluginDraftCard.tsx:47-60); a stored draft can be re-read by GET /api/chat/conversations/[id]/plugin-drafts/[toolCallId] (apps/web/app/api/chat/conversations/[id]/plugin-drafts/[toolCallId]/route.ts:33-93).
- Audit event plugin_marketplace_changed with status 'customized' (customize/route.ts:68-74).

**Incomplete**

- The server does not check 'installed and on' itself: 409 means the plugin could not be resolved for the user; a not-installed directory plugin yields 422 'no skills that can be copied' because installed skills are empty (apps/web/features/plugins/server/directory/customize.ts:84-119,160-161). The 'turn on first' rule is enforced by the button only.
- Exception: customize works on built-in registry packs even when not installed (resolved via getPluginRegistryEntry and listManagedPluginSkillsWithFiles), and turning off the original uses setWebPluginEnabled for them, so the 'installed first' rule is not just button-enforced for that path (apps/web/features/plugins/server/directory/customize.ts:100-109).
- The draft says a separate fork action is missing; confirmed: copy is the only fork path.
- Mobile 'Customize' is skill switches only (PluginDetailScreen.tsx:549-560).

**Present but disconnected or switched off**

- Skill authoring can be switched off by AGI_USER_SKILL_AUTHORING=0; then customize, create and the chat draft tool are refused or not offered (user-skill-authoring.ts:10-18; request-processor.ts:5591).

**Not available**

- Mobile: no copy, edit or create.
- CLI: not offered, by decision (doc: docs/decisions/2026-09-27-founder-decisions.md lines 462-468).
- VS Code and Chrome: none found.
- Chat draft card on mobile, CLI, VS Code: not offered (surface set is web and desktop only, plugin-draft-tool.ts:43).

## 4. Required behaviour

**Established requirements**

- A user can customize an installed plugin (edit its skills or content) (S54.27). (source: brief: S54.27 Should)
- A user can fork a plugin into their own editable copy (S54.28). (source: brief: S54.28 Should)
- The product helps a user build a plugin with an assistant (S54.35). (source: brief: S54.35 Should)
- The CLI does not offer plugin customize. (source: doc: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-29)
- Skill authoring is refused when the authoring setting is off. (source: brief: draft Should, confirmed at apps/web/lib/services/user-skill-authoring.ts:14-18)
- An agent never destroys user data; the copy leaves the original in place and only turns it off. (source: doc: AGENTS.md section 9; code apps/web/features/plugins/server/directory/customize.ts:198)

**Acceptance criteria**

1. Customize on an installed, enabled plugin with skills creates one new installed plugin (original's name, key '<key>-custom', under an authored source named '<name> (custom)') and turns the original off.
2. Pressing Customize again returns the same copy (created false) and creates no second one.
3. With AGI_USER_SKILL_AUTHORING=0 the customize route returns 404 'Skill authoring is not available.'
4. A plugin with no skills returns 422 with the message 'This plugin has no skills that can be copied.'
5. Edit plugin saves changes that appear in chats using the copy.
6. Asking 'build me a plugin for release notes' on web shows a card with 'Save plugin'; saving installs it on.
7. The Customize button is absent on a turned-off or authored plugin.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The server should reject a customize request for a plugin that is installed but off, matching the message 'Install and turn on this plugin first'.
- [inferred] The fork (S54.28) and customize (S54.27) rows describe one action; the brief lists both with the same code.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Merge S54.27 and S54.28 into one item in the brief.
- [proposed] Move the 'installed and on' check into customizePlugin so the API matches its error message.
- [proposed] Rename the mobile skill card so it is not also called 'Customize'.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/plugins/customize | `apps/web/app/api/plugins/customize/route.ts` | Entry point for the copy (line 23). |
| service | customizePlugin | `apps/web/features/plugins/server/directory/customize.ts` | Resolve original (84), copy skills and files, store, turn original off (154-198). |
| service | plugin-owned-source-service | `apps/web/lib/services/plugin-owned-source-service.ts` | storeOwnedPluginSource (312) and install-on (289). |
| service | user-skill-authoring | `apps/web/lib/services/user-skill-authoring.ts` | AGI_USER_SKILL_AUTHORING switch. |
| service | install-gate | `apps/web/features/plugins/server/directory/install-gate.ts` | authorsSkills path: gates plugins and skills (14, 26). |
| endpoint | POST /api/plugins/authored and GET, PUT /api/plugins/authored/[entryId] | `apps/web/app/api/plugins/authored/route.ts` | Create and edit authored plugins; entryId route in authored/[entryId]/route.ts. |
| component | PluginDetailView | `packages/ui/ui/src/directory/PluginDetailView.tsx` | Edit and Customize buttons (911-940). |
| component | DirectoryPanel | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | customize confirm and editor opening (669-686). |
| hook | useDirectoryAdapter | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | customizePlugin (1688), createPlugin (1635), updatePlugin. |
| service | plugins-directory service | `apps/web/features/directory/services/plugins-directory.ts` | customizable flag (998: installed and on; 1035: user entries also not authored). |
| service | plugin-draft-tool | `apps/web/lib/server/tools/plugin-draft-tool.ts` | Chat tool definition, intent regex, surface set. |
| service | request-processor draft capability | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | applyPluginDraftToolCapability (1237) and the gate at 5590; toolsCapable, ambientToolsAllowed and non-temporary checks at 1226-1233. |
| component | PluginDraftCard | `apps/web/features/chat/components/PluginDraftCard.tsx` | Draft card with Save plugin and Save as a skill. |
| endpoint | GET /api/chat/conversations/[id]/plugin-drafts/[toolCallId] | `apps/web/app/api/chat/conversations/[id]/plugin-drafts/[toolCallId]/route.ts` | Re-reads a stored draft from agent events. |
| table | plugin_marketplace_entries and plugin_marketplace_entry_files | `apps/web/db/neon/0175_plugin_marketplace_uploads.sql` | Stores the copied plugin and its files (query at plugin-submission-service.ts:169). |
| table | plugin_marketplace_installations | `apps/web/db/neon/0159_plugin_marketplace_sources.sql` | Install-on row for the copy. |
| screen | Mobile PluginDetailScreen Customize card | `apps/mobile/src/features/plugins/PluginDetailScreen.tsx` | Skill switches only. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Customize and confirms. | device | packages/ui/ui/src/directory/DirectoryPanel.tsx:669-686 |
| Browser posts {pluginId} or {entryId} to /api/plugins/customize with CSRF. | device and our servers | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1688-1707 |
| Server rate-limits, requires authoring on, applies the plugins and skills workspace gates. | our servers | apps/web/app/api/plugins/customize/route.ts:24-43; install-gate.ts:21-37 |
| Server reads the original's skills and companion files, validates each skill draft, stores the copy as an authored source, installs it on, and turns the original off. | our servers | apps/web/features/plugins/server/directory/customize.ts:154-198 |
| Server records an audit event and returns the new entry id; the browser refreshes and opens the editor. | our servers | customize/route.ts:67-78; DirectoryPanel.tsx:676-684 |
| Chat path: the chat service offers the draft tool; the chat model fills it with name, description and skills; the card appears; Save posts to /api/plugins/authored. | our servers | request-processor.ts:1237-1257; PluginDraftCard.tsx:47-60 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Copied plugin entry, skill files and companion files | tables plugin_marketplace_entries, plugin_marketplace_entry_files under an 'authored' source | Server side; visible to the user on Cloud surfaces | Kept until the user removes it; deletion path not traced |
| Installation row for the copy; original installation set off | table plugin_marketplace_installations (original may be in plugin_installations) | Server side | Original is kept, only disabled (customize.ts:198) |
| Plugin draft tool result | cloud agent events for the conversation | Server side | Follows the conversation |
| Audit event plugin_marketplace_changed (customized) | security audit log | Server side | Retention not examined |

**Models and providers.** Copy and edit use no model. The chat draft assistant relies on the chat model that serves the turn, which must support tools (toolsCapable) and streaming; which model that is comes from the normal chat routing and is not decided here (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1226-1233).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in (getUserScopedDb in customize/route.ts:26). |
| Permissions | CSRF, rate limit, authoring enabled, workspace feature gates 'plugins' and 'skills' (install-gate.ts:14,26-37). Org plugin policy is not evaluated for a copy because pluginKeys is empty (customize/route.ts:39-42). |
| Subscription | none found in the code. |
| Limits and metering | plugin-installation-write 20 per minute (apps/web/lib/rate-limit.ts:519; customize/route.ts:28); the limiter is failClosed, so requests are refused if the limiter fails (apps/web/lib/rate-limit.ts:519-522). Companion files per skill are capped by SKILL_COMPANION_MAX_FILES (constant not read). The draft tool allows 1 to PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL skills (plugin-draft-tool.ts:28-39). Chat turn metering for the draft message is outside this feature. |
| Feature flags | AGI_USER_SKILL_AUTHORING (default on). |
| Model compatibility | Draft assistant needs a tool-capable model and a streaming request (request-processor.ts:1226-1233). Copy and edit: not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Copy, edit and the draft card are Managed Cloud only (web and desktop-hosted). Whether the Tauri Local settings can copy a plugin was not examined. The CLI has no customize by decision. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Original not resolvable | 409 PLUGIN_NOT_CUSTOMIZABLE 'Install and turn on this plugin before you customize it.' | customize/route.ts:47-56 |
| No skills or invalid skill | 422 with the message; a skill that fails validation names itself. | customize.ts:161,168-175; customize/route.ts:57-61 |
| Copy already exists | Returns the existing entry, created false, no audit event. | customize.ts:165-166; customize/route.ts:62-66 |
| Authoring off | 404 'Skill authoring is not available.' | user-skill-authoring.ts:14-18 |
| Workspace gate refuses | Gate response returned before any copy. | customize/route.ts:39-43 |
| Duplicate skill names | Later duplicates are skipped. | customize.ts:177-181 |
| Stored draft missing | 404 'Draft not found'. | plugin-drafts route.ts:25,92 |
| Temporary chat | The plugin draft tool is withheld for temporary chats (!params.isTemporary) and also requires toolsCapable and ambientToolsAllowed. | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1226-1233 |
| Offline or timeout | not handled in the code beyond the error banner. | none found |
| Cancel | Cancelling the confirm creates nothing. | DirectoryPanel.tsx:669-686 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/plugins/customize/__tests__/route.test.ts`: CSRF refusal, 401, invalid body, gate refusal, 409 not installed, 422 with message, existing copy not audited, creation and audit, server error (titles at lines 139-223).
- `apps/web/app/api/plugins/authored/__tests__/route.test.ts`: Authored create route; contents not opened.
- `apps/web/lib/server/tools/plugin-draft-tool.test.ts`: Draft tool; contents not opened.
- `apps/web/features/chat/components/messages/MessageBubble.pluginDraft.test.tsx`: Draft card in a message; contents not opened.
- `apps/web/app/api/chat/conversations/[id]/plugin-drafts/[toolCallId]/route.test.ts`: Stored draft route; contents not opened.
- `apps/web/lib/services/plugin-owned-source-service.test.ts`: Owned source storage; contents not opened.
- `packages/ui/ui/src/directory/__tests__/PluginDetailView.test.tsx`: Detail view; contents not opened.

**Test scenarios**

- **Copy a plugin**
  1. Install and enable a plugin with skills on web.
  2. Press Customize, confirm 'Make my copy'.
  - Expected: A plugin with the original's name and key '<key>-custom', under an authored source named '<name> (custom)', is installed on; the original shows off; the editor opens.
- **Second press**
  1. Open the original again and press Customize.
  - Expected: The same copy opens; no second copy exists.
- **Authoring switched off**
  1. Set AGI_USER_SKILL_AUTHORING=0 on a test server.
  2. Call POST /api/plugins/customize.
  - Expected: 404 'Skill authoring is not available.'
- **No skills**
  1. Customize a plugin that has only commands or agents.
  - Expected: 422 'This plugin has no skills that can be copied.'
- **Chat draft**
  1. On web, ask 'build a plugin that turns notes into release notes'.
  2. Press 'Save plugin' on the card.
  - Expected: A plugin is saved and on; the card reads 'Saved as a plugin. Its skills are on in your chats.'
- **Original turned back on**
  1. After copying, open the original and turn 'Enabled' on.
  - Expected: Both plugins are on; no data lost.

**Where to look when it fails**

- Error code PLUGIN_NOT_CUSTOMIZABLE (409 and 422).
- Audit event plugin_marketplace_changed with status 'customized'.
- Tables plugin_marketplace_entries, plugin_marketplace_entry_files, plugin_marketplace_installations.
- Chat event name for the draft tool is PLUGIN_DRAFT_TOOL_NAME in cloud_agent_events (plugin-drafts route.ts:68).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/web/054-plugin-marketplace-and-customization.md)
- Desktop: [70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md)

## 10. Gaps and dependencies

- **The brief and the draft say no plugin-creation assistant was found; one exists in chat on web and desktop surfaces.** Affects: Brief accuracy for S54.35. Evidence: apps/web/lib/server/tools/plugin-draft-tool.ts:21-56; PluginDraftCard.tsx:29-30. Work needed: Correct the brief; add a human verification of the card.
- **The brief cites only user-skill-authoring.ts for S54.27, S54.28 and S54.35, an 18-line switch file.** Affects: Brief code pointers. Evidence: apps/web/lib/services/user-skill-authoring.ts:1-18. Work needed: Point the items at customize.ts and the draft tool.
- **The 409 does not mean 'not installed and on' as the message says.** Affects: API callers. Evidence: customize.ts:84-119; customize/route.ts:47-56. Work needed: Enforce installed-and-on in the service or reword the message.
- **Customize skips org plugin policy for the copy (pluginKeys empty).** Affects: Orgs that restrict plugins. Evidence: customize/route.ts:39-42. Work needed: Decide whether a copy should be policy-checked.
- **Mobile has no copy or edit, and its 'Customize' card name collides with web's action.** Affects: Mobile users. Evidence: PluginDetailScreen.tsx:549. Work needed: Product decision on mobile editing; rename the card.
- **CLI and VS Code have no customize; the CLI omission is a recorded decision, VS Code has no recorded decision found.** Affects: CLI and VS Code users. Evidence: docs/decisions/2026-09-27-founder-decisions.md:462-468. Work needed: Record a decision for VS Code or build it.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- api:POST /api/plugins/customize
- api:POST /api/plugins/authored
- api:PUT /api/plugins/authored/[entryId]
- api:GET /api/chat/conversations/[id]/plugin-drafts/[toolCallId]
- table:plugin_marketplace_entries
- table:plugin_marketplace_entry_files
- table:plugin_marketplace_installations
- F054-08
- F054-09
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing

## Unknown

- Whether the Tauri Local settings can copy or edit plugins.
- How a user removes an authored copy and whether its files are deleted (path not traced).
- Value of SKILL_COMPANION_MAX_FILES and PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL.
- What the draft-tool and card tests assert beyond file names.
- Whether decideWorkspacePolicy for 'skills' or 'plugins' varies by plan.
- Which chat models are offered the draft tool in practice (depends on toolsCapable resolution).

## Second reader's check

A second reader checked 10 statements of this page against the code: 6 correct, 3 wrong or partly wrong, 1 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 1/3/4/8):** "Creates a new plugin named '<name> (custom)'" The code shows: The stored plugin keeps original.name; only the source name gets ' (custom)' and only the key gets '-custom'. (apps/web/features/plugins/server/directory/customize.ts:186 (sourceName with suffix), :190 (name: original.name), :162 (key suffix)). **Corrected:** The copy is a plugin with the original's name and key '<key>-custom', stored under an authored source named '<name> (custom)'.
- **Partly wrong (section 3):** "Customize button is offered only for an installed and enabled plugin that is not itself authored (plugins-directory.ts:998,1035)" The code shows: Line 998 sets customizable: installed && enabled with no authored check; only line 1035 (the user-entry path) adds && !authored. (apps/web/features/directory/services/plugins-directory.ts:998,1035). **Corrected:** Customizable means installed and on; the not-authored exclusion applies only to user marketplace entries (line 1035).
- **Partly wrong (section 3/7):** "Chat draft tool offered on web and desktop when the message matches build/create/write plus plugin/skill, streaming on, authoring and both gates pass" The code shows: Surface set is web+desktop. The intent regex has more verbs (make, draft, design, turn, update, change, edit). It also needs toolsCapable, ambientToolsAllowed and a non-temporary chat, which the page omits from the rule. (apps/web/lib/server/tools/plugin-draft-tool.ts:21-22,43-46; request-processor.ts:1226-1233,1237-1257,5590-5594). **Corrected:** Offered on web and desktop surfaces for non-temporary, streaming, tool-capable turns whose message matches build/create/make/write/draft/design/turn/update/change/edit near plugin or skill, with authoring and plugins+skills gates passing.

**Facts the page missed**

- The draft tool is withheld for temporary chats (!params.isTemporary) and requires toolsCapable plus ambientToolsAllowed: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1226-1233.
- The rate limit is failClosed (requests are refused if the limiter fails): apps/web/lib/rate-limit.ts:519-522.
- Customize works on built-in registry packs even when not installed (resolved via getPluginRegistryEntry and listManagedPluginSkillsWithFiles), and turning off uses setWebPluginEnabled for them, so the 'installed first' rule is not just button-enforced for that path: apps/web/features/plugins/server/directory/customize.ts:100-109.
