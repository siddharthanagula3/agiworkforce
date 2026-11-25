---
id: "F053-04"
type: "feature"
title: "Install, turn on and off"
aliases: ["Install, uninstall, enable, disable a skill", "Turned on / Turn off", "Enable skill switch", "/skills-toggle", "Item S53.20"]
area: "53 Skill creation and management"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S53.20"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "api:POST /api/skills/installs", "api:DELETE /api/skills/installs/{name}", "api:GET /api/skills/installs", "table:user_settings", "store:cli-disabled-skills", "F053-01", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F053-04 Install, turn on and off

Lets a person switch a built-in skill on or off without deleting it. Web and Desktop use Install, Uninstall and an 'Enable skill' switch; Mobile has Install, Uninstall and a 'Turned on' switch; the CLI uses /skills-toggle; VS Code uses Turn on and Turn off. Web and mobile save the choice on the account; the CLI saves it on the device.

Area: [53. Skill creation and management](README.md). Requirement items: [S53.20](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5320).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Controls which skills the assistant can use. Switching off hides a built-in skill from the composer and from the model; the skill stays in the catalogue so it can be switched on again.

**Why it exists.** People want fewer skills in the way, or want to try a skill, without losing or re-creating it.

**Who uses it.** Any signed-in person on web, desktop (hosted web) and mobile; CLI and VS Code developers.

**Problems it solves**

- Too many skills offered in chat
- Wanting to disable a skill without deleting it
- Controlling which skills a project may load (CLI consent)

**Use cases**

- A person turns off a skill that keeps matching the wrong requests.
- A mobile user taps Install on a skill they had switched off.
- A developer disables a global skill in /skills-toggle.
- A developer in VS Code turns off a skill for all folders.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings > Skills detail view ('Enable skill' switch or Install/Uninstall) and the manage view row switch (packages/ui/ui/src/directory/SkillDetailView.tsx:203-237; packages/ui/ui/src/directory/DirectoryPanel.tsx:496-512).
- Mobile: Install or Uninstall button on each skill row, and the 'Turned on' switch in the detail screen (apps/mobile/src/features/skills/SkillsScreen.tsx:365-372; apps/mobile/src/features/skills/SkillDetailScreen.tsx:259-267).
- CLI: /skills-toggle (apps/cli/src/tui/tui_app.rs:6540-6556).
- VS Code: Skills quick pick, row action 'Turn off' or 'Turn on'; the settings panel lists skills with switches (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:276-283, 926-950).
- Chrome: none.

**Before you start**

- Signed in for web, desktop and mobile; mobile also Cloud mode.
- The skill must be built in, not a draft, not owned by a plugin, and not a personal skill (apps/web/app/api/skills/installs/route.ts:77-82).

**Screens and controls**

- Web detail: when installed and the skill is not editable, button reads 'Installed' and a switch 'Enable skill' with the hint 'Turn this off to keep it in the catalogue without offering it.'; when not installed the button reads 'Install' (packages/ui/ui/src/directory/SkillDetailView.tsx:203-236; packages/ui/ui/src/directory/constants.ts:353-354).
- Web manage view: row switch labelled with the prefix 'Use' for built-in skills only (packages/ui/ui/src/directory/constants.ts:347; apps/web/features/directory/services/skills-directory.ts:216-240).
- Mobile row: 'Install' or 'Uninstall' with a loading state; detail: 'Turned on' with the description 'Turned-on skills load in your Cloud chats when a task needs them.' (apps/mobile/src/features/skills/SkillDetailScreen.tsx:259-267).
- CLI overlay: 'Skills (up/down navigate, Space toggle, Enter save, Esc cancel)' (apps/cli/src/tui/tui_app.rs:6556).
- VS Code: tooltip 'Turn off' or 'Turn on' on a row; a project's skills show 'Allow this folder's project skills' first (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:250-256, 276-283).

**Journey**

1. Open the skill or its row.
2. Flip the switch or press Install or Uninstall.
3. The app sends the change and then reloads the list so it matches the server (apps/web/features/directory/hooks/useDirectoryAdapter.ts:1403-1419).
4. The next chat turn uses the new state.

**What the person sees and gets**

- Web: failure shows the install or uninstall failure copy or the server message and keeps the old state (apps/web/features/directory/hooks/useDirectoryAdapter.ts:1408-1414).
- Mobile: busy state on the button; a failed change shows the server message for a 4xx or 'Could not install this skill. Try again.' / 'Could not remove this skill. Try again.' on that row (apps/mobile/src/features/skills/service.ts:19-20, 102-108).
- CLI: choices saved on Enter; on a save error the message 'The skill choices were not saved: ...' (apps/cli/src/tui/tui_app.rs:1268-1273).

**Settings**

- Web and mobile: per-account install overrides in user settings (apps/web/lib/services/skill-install-service.ts:10-11).
- CLI: global file disabled-skills.json and, for trusted projects, .agiworkforce/disabled-skills.json (apps/cli/src/skills.rs:95-125).
- CLI: project skills load only after the person allows exactly that set (apps/cli/src/skills.rs:285-560).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: POST /api/skills/installs, DELETE /api/skills/installs/{name}, GET /api/skills/installs, all with CSRF (writes), rate limit, audit record and a returned installed list (apps/web/app/api/skills/installs/route.ts:36-99; apps/web/app/api/skills/installs/[name]/route.ts:25-64).
- The override is saved inside a transaction that locks the user settings row (apps/web/lib/services/skill-install-service.ts:89-120).
- A skill with no override counts as installed; only an override of false hides it (apps/web/lib/services/skill-catalog-service.ts:150-158).
- Mobile Install, Uninstall and the detail switch (apps/mobile/src/features/skills/SkillsScreen.tsx:684-714; apps/mobile/src/features/skills/SkillDetailScreen.tsx:150-163).
- CLI toggle overlay and disabled list; VS Code toggle through the local runtime (apps/cli/src/skills.rs:654-681; apps/extension-vscode/src/integrations/localRuntimeClient.ts:2133-2138).

**Incomplete**

- Detail view shows the 'Enable skill' switch for every installed non-editable skill, including plugin skills the server will refuse (packages/ui/ui/src/directory/SkillDetailView.tsx:203-204; apps/web/app/api/skills/installs/route.ts:77-79) [inferred].
- Only POST has the workspace Skills gate; DELETE install has none (apps/web/app/api/skills/installs/route.ts:64-70 versus apps/web/app/api/skills/installs/[name]/route.ts:25-62).

**Present but disconnected or switched off**

- CLI toggle state is not connected to the account overrides (apps/cli/src/skills.rs:95-141).

**Not available**

- Chrome: no install or switch.
- Web: no install for a draft (409 'is not available yet').
- Plugin skills: switched by their plugin (409 'is controlled by its plugin installation').

## 4. Required behaviour

**Established requirements**

- A user can turn an installed skill off and back on without deleting it (S53.20). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.20)
- Install, enable and disable affect the next turn and survive reload. (source: doc: docs/product/experience-contract.md:788)
- Skills requirements include enable/disable under plugin controls (plugins: install, enable/disable, update, uninstall). (source: doc: docs/product/requirements.md (section 19))

**Acceptance criteria**

1. Switching off a built-in skill on web removes it from the composer slash list after the list reloads and keeps it in the catalogue with status not installed.
2. Switching it on again restores it.
3. Installing a plugin-owned or draft skill returns 409 and the UI shows an error without changing state.
4. A mobile uninstall of the currently picked skill clears the pick.
5. A failed save leaves the previous state and shows a message.
6. /skills-toggle changes persist across CLI restarts.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because overrides are per account, a change on web shows on mobile after refresh.
- [inferred] If the override read fails, chat withholds non-plugin skills rather than offering all (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3738-3744).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Hide the web switch for plugin-owned skills.
- [proposed] Apply the workspace Skills gate on uninstall too.
- [proposed] Offer the account overrides to the CLI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/skills/installs | `apps/web/app/api/skills/installs/route.ts` | Switch a skill on (lines 51-96). |
| endpoint | GET /api/skills/installs | `apps/web/app/api/skills/installs/route.ts` | List installed names (lines 36-49). |
| endpoint | DELETE /api/skills/installs/{name} | `apps/web/app/api/skills/installs/[name]/route.ts` | Switch a skill off (lines 25-62). |
| service | skill-install-service | `apps/web/lib/services/skill-install-service.ts` | Reads and writes overrides (lines 44-137). |
| service | filterSkillsByInstallOverrides | `apps/web/lib/services/skill-catalog-service.ts` | Applies overrides; plugin-owned always kept (lines 150-158). |
| table | user_settings | `apps/web/lib/services/skill-install-service.ts` | Stores settings.skills.installs (lines 10-11, 89-120). |
| service | workspace audit | `apps/web/lib/workspace-audit.ts` | Records skill_installed and skill_uninstalled events (route lines 87, 53). |
| service | gate | `apps/web/lib/managed-compute-gate.ts` | buildWorkspaceFeatureGateResponse for the skills feature (line 205). |
| hook | runSkillInstall | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Calls install or uninstall then reloads (lines 1403-1419, 1948-1951). |
| service | web install client | `apps/web/features/directory/services/skills-directory.ts` | installSkill and uninstallSkill (lines 284-303). |
| component | SkillDetailView switch | `packages/ui/ui/src/directory/SkillDetailView.tsx` | Primary button and 'Enable skill' switch (lines 203-237). |
| component | DirectoryManageView | `packages/ui/ui/src/directory/DirectoryManageView.tsx` | Row switches (lines 122-221). |
| service | mobile install client | `apps/mobile/src/features/skills/service.ts` | installSkill, uninstallSkill, isSkillInstalled (lines 68-100). |
| screen | mobile row actions | `apps/mobile/src/features/skills/SkillsScreen.tsx` | Install and Uninstall button, guard for authored and plugin skills (lines 267, 365, 684-714). |
| screen | mobile detail switch | `apps/mobile/src/features/skills/SkillDetailScreen.tsx` | 'Turned on' toggle (lines 150-163, 259-267). |
| store | CLI disabled-skills.json | `apps/cli/src/skills.rs` | Persists the off list (lines 95-141, 654-681). |
| command | /skills-toggle | `apps/cli/src/tui/tui_app.rs` | Overlay and save (lines 1268, 6540-6556). |
| component | SkillsToggleView | `apps/cli/src/tui/widgets/skills_toggle.rs` | Overlay widget. |
| service | CLI project skills consent | `apps/cli/src/skills.rs` | Allows a project's skills for the exact set (lines 285-560). |
| service | app server set_skill_enabled | `apps/cli/src/app_server/surfaces.rs` | skills/setEnabled and skills/consent for VS Code (lines 134-190). |
| command | VS Code toggle | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Turn on and Turn off (lines 276-283, 949-950). |
| test | skill-installs.test.ts | `apps/web/app/api/skills/installs/__tests__/skill-installs.test.ts` | Install route tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person flips a switch; the client sends POST /api/skills/installs with the name, or DELETE /api/skills/installs/{name}, with a CSRF token on web. | device and our servers | apps/web/features/directory/services/skills-directory.ts:284-303 |
| The server checks CSRF, the rate limit, and (install only) the workspace Skills feature gate; finds the skill in the catalogue; refuses unknown (404), plugin-owned (409) and draft (409) skills. | our servers | apps/web/app/api/skills/installs/route.ts:51-82; apps/web/app/api/skills/installs/[name]/route.ts:25-48 |
| The server locks the account's settings row, writes the true or false override in one transaction, records an audit event and returns the new installed list. | our servers | apps/web/lib/services/skill-install-service.ts:89-120; apps/web/app/api/skills/installs/route.ts:84-96 |
| The client clears its catalogue cache, announces a catalogue change and reloads the section. | device | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1415-1418 |
| The next chat turn reads the overrides and offers only skills not switched off. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3738-3744; apps/web/lib/services/skill-catalog-service.ts:597-627 |
| CLI: the overlay writes the disabled list file on the device. | device | apps/cli/src/skills.rs:127-141, 654-681 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Install override map | public.user_settings.settings.skills.installs (apps/web/lib/services/skill-install-service.ts:10-11) | Per account on our servers; read by web and mobile | Kept; switching on writes true rather than deleting |
| Audit event skill_installed or skill_uninstalled | Workspace audit log (table name not opened) | Server side | Per audit retention, unknown |
| CLI disabled names | disabled-skills.json in the CLI config folder (apps/cli/src/skills.rs:95-101) | Not synced | Until edited |

**Models and providers.** No model takes part in switching. Switching off removes the skill from what any model is offered.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in on web, desktop and mobile; CLI needs none. |
| Permissions | Install is refused when the workspace Skills feature is closed (apps/web/app/api/skills/installs/route.ts:64-70); uninstall has no such check. Plugin skills follow their plugin. |
| Subscription | No plan check found in the install routes. |
| Limits and metering | Writes spend the chat-conversation bucket, 60 per minute (apps/web/lib/rate-limit.ts:282-286). Skill name 1 to 200 characters (apps/web/app/api/skills/installs/route.ts:28-34). |
| Feature flags | FEATURES.skills on mobile. |
| Model compatibility | Not applicable; none found in the code. |
| Provider restrictions | None found in the code. |
| Local mode | Mobile Local mode: gated, no install. CLI toggles work fully on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Failure | Error shown, previous state kept; web reloads list from server. | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1408-1418 |
| Double tap (mobile) | A second change is ignored while one is pending. | apps/mobile/src/features/skills/SkillsScreen.tsx:684-690 |
| Account changed during request (mobile) | Result is discarded if the account epoch changed. | apps/mobile/src/features/skills/SkillsScreen.tsx:690-713 |
| Concurrent writes | Row lock inside a transaction. | apps/web/lib/services/skill-install-service.ts:55-62, 89-120 |
| First write for an account | Inserts the settings row, retrying the lock if another writer got there first. | apps/web/lib/services/skill-install-service.ts:92-107 |
| Offline, cancel, timeout | not handled in the code beyond failure messages. | apps/web/features/directory/services/skills-directory.ts:284-303 |
| CLI project skills not allowed | Rows show 'not allowed yet' and cannot be switched until consent. | apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:301-303, 926-932 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/skills/installs/__tests__/skill-installs.test.ts`: Default installed, install, uninstall, plugin-owned and draft refusal, 404, CSRF, composer listing, workspace denial.
- `apps/web/lib/services/__tests__/skill-install-service.test.ts`: Override storage.
- `packages/ui/ui/src/directory/__tests__/SkillDetailView.test.tsx`: Switch and button states.
- `apps/mobile/__tests__/SkillsPage.test.tsx`: Install, uninstall, refusal text, plugin-owned skills.
- `apps/mobile/__tests__/skills-service.test.ts`: Installs payload parsing and draft or authored install rules.
- `apps/cli/src/skills.rs`: In-file test skill_choices_keep_disabled_names_the_picker_did_not_show and consent tests.
- `apps/extension-vscode/src/__tests__/localRuntimeClient.test.ts`: Local runtime client including skills requests.

**Test scenarios**

- **Switch off and on**
  1. Open a built-in skill on web.
  2. Turn off 'Enable skill'.
  3. Open the slash menu.
  4. Turn it back on.
  - Expected: Absent from the slash menu while off, present again after.
- **Plugin skill**
  1. Try POST /api/skills/installs for a plugin-owned name.
  - Expected: 409 'is controlled by its plugin installation.'
- **Draft skill**
  1. Try to install a draft skill.
  - Expected: 409 'is not available yet.'
- **Mobile uninstall clears pick**
  1. Pick an installed skill with 'Use in chat'.
  2. Uninstall it.
  - Expected: The pick is cleared.
- **CLI persistence**
  1. Turn a skill off in /skills-toggle and restart the CLI.
  - Expected: The skill stays off.

**Where to look when it fails**

- Server warning 'Skill install overrides read failed; withholding skills' (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3741).
- Internal errors 'Settings were not returned after saving' and 'Settings row could not be locked' (apps/web/lib/services/skill-install-service.ts:82, 106).
- Audit events skill_installed and skill_uninstalled.
- CLI message 'The skill choices were not saved' (apps/cli/src/tui/tui_app.rs:1272).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/053-skill-creation-and-management.md](../../70-qa/test-plans/web/053-skill-creation-and-management.md)
- Desktop: [70-qa/test-plans/desktop/053-skill-creation-and-management.md](../../70-qa/test-plans/desktop/053-skill-creation-and-management.md)
- Mobile: [70-qa/test-plans/mobile/053-skill-creation-and-management.md](../../70-qa/test-plans/mobile/053-skill-creation-and-management.md)
- CLI: [70-qa/test-plans/cli/053-skill-creation-and-management.md](../../70-qa/test-plans/cli/053-skill-creation-and-management.md)
- VS Code: [70-qa/test-plans/vscode/053-skill-creation-and-management.md](../../70-qa/test-plans/vscode/053-skill-creation-and-management.md)

## 10. Gaps and dependencies

- **Brief marks mobile enable/disable as missing, but mobile has Install, Uninstall and the 'Turned on' switch.** Affects: Documentation. Evidence: apps/mobile/src/features/skills/SkillsScreen.tsx:365-372; apps/mobile/src/features/skills/SkillDetailScreen.tsx:259-267. Work needed: Correct the brief.
- **Uninstall has no workspace Skills gate while install has.** Affects: Workspaces that turn Skills off. Evidence: apps/web/app/api/skills/installs/route.ts:64-70; apps/web/app/api/skills/installs/[name]/route.ts:25-62. Work needed: Decide the intended rule and apply it to both.
- **CLI and VS Code choices are device-only and differ from account overrides.** Affects: Developers on several devices. Evidence: apps/cli/src/skills.rs:95-141. Work needed: Decide whether to sync the choice.
- **Detail switch can appear for plugin skills that cannot be switched here.** Affects: Web and Desktop. Evidence: packages/ui/ui/src/directory/SkillDetailView.tsx:203-204. Work needed: Pass the plugin-owned state to the view.
- **No Chrome control to switch a skill.** Affects: Chrome users. Evidence: apps/extension/src/side_panel.ts:15112-15190 (only pick and Manage skills). Work needed: Decide whether Chrome needs one; Manage skills opens the web settings.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- api:POST /api/skills/installs
- api:DELETE /api/skills/installs/{name}
- api:GET /api/skills/installs
- table:user_settings
- store:cli-disabled-skills
- F053-01
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations

## Unknown

- Name of the table behind recordWorkspaceAuditEvent and its retention (not opened).
- Whether DirectoryPanel shows a confirmation before Install (requestInstall not read).
- Whether Desktop local mode has its own skill switches: the public Desktop shows the hosted web app (doc: AGENTS.md section 5).
