---
id: "F010-07"
type: "feature"
title: "Connectors, plugins and skills"
aliases: ["Connectors", "Connect external account", "Reauthorize connection", "Reconnect", "Connected account", "Directory", "Plugin install", "Plugin permissions", "Skill import", "Skill edit", "S10.18 to S10.25"]
area: "10 Modal and dialog inventory"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "built", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S10.18", "S10.19", "S10.20", "S10.21", "S10.22", "S10.23", "S10.24", "S10.25"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "table:connector_oauth_grants", "table:user_skills", "api:GET /api/connectors/oauth/start", "api:POST /api/plugins/installations", "api:POST /api/skills", "file:packages/ui/ui/src/directory/DirectoryPanel.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F010-07 Connectors, plugins and skills

Lets a signed-in person link outside accounts (connectors), see the linked account, reconnect an expired link, install or update plugins after seeing the permissions they ask for, and import or edit their own skills. Web and Electron Desktop share one directory panel. Mobile and CLI have smaller screens. VS Code and Chrome have none.

Area: [10. Modal and dialog inventory](README.md). Requirement items: [S10.18](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1018), [S10.19](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1019), [S10.20](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1020), [S10.21](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1021), [S10.22](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1022), [S10.23](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1023), [S10.24](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1024), [S10.25](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1025).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Connectors link an outside service to the AGI account through the service's own sign-in. Plugins add bundles of skills and tools. Skills are saved instructions the assistant can load. This feature covers the dialogs for connecting, reconnecting, showing the linked account, installing or updating a plugin, and importing or editing a skill.

**Why it exists.** The assistant can only act on a person's cloud drive, mail or code host after that person grants access. Plugins and skills extend what it can do, so the person must see what a plugin asks for and must be able to write their own skills.

**Who uses it.** Signed-in people on web, Electron Desktop, mobile and CLI. Workspace admins also control which plugins are allowed.

**Problems it solves**

- Granting access to an outside service without sharing a password
- Recovering when an access grant expires or is revoked
- Knowing what a plugin can do before it is installed
- Adding a personal skill without a developer tool

**Use cases**

- Connect a cloud drive, then ask chat to read a file from it
- Reconnect Google Drive after the grant is revoked, keeping tool permissions
- Install a plugin and read its permission list first
- Import a SKILL.md or a zipped skill folder, then edit its description

## 2. User experience

**Where to find it**

- Web and Electron Desktop: Settings, Connectors; and the directory panel with Connectors, Plugins and Skills sections (packages/ui/ui/src/directory/DirectoryPanel.tsx:394). Desktop shows the hosted web app per AGENTS.md section 5 [inferred for this feature].
- Retained Tauri desktop code has its own Connectors settings in DesktopCloudSettingsModal (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:731)
- Mobile: Settings, Connectors screen (apps/mobile/src/features/settings/cloud-connectors/index.tsx:507)
- CLI: `agi connectors` lists and disconnects; `agi plugin ...`; `/skills import <path>` in the terminal (apps/cli/src/lib.rs:1275, apps/cli/src/lib.rs:2017, apps/cli/src/tui/tui_app.rs:6169)
- VS Code and Chrome: no screen found

**Before you start**

- Signed in to an AGI account
- Connectors, plugins and skills are cloud features: mobile only loads connectors in Cloud mode (apps/mobile/src/features/settings/cloud-connectors/index.tsx:507)
- Workspace policy must allow the plugin or feature (apps/web/features/plugins/server/directory/install-gate.ts:20)

**Screens and controls**

- Connector detail: primary connect button, 'Disconnect' (packages/ui/ui/src/directory/constants.ts:288), and a reconnect action shown only when the connection needs reauthorization (packages/ui/ui/src/directory/ConnectorDetailView.tsx:265)
- Connected account list: heading 'Connected account', text 'Needs reconnecting' (apps/web/features/connectors/components/ConnectorAccountSummary.tsx:27)
- Plugin detail: 'Install' button, 'Permissions' list, version picker showing 'It also asks for:' for new permissions (packages/ui/ui/src/directory/constants.ts:120, :200, :220)
- Install confirmation titled 'Install <name>?' shown when the entry has an install notice (packages/ui/ui/src/directory/DirectoryPanel.tsx:394)
- Skill dialog titled 'New skill' or 'Edit skill', with 'Import a SKILL.md file', and 'Create skill' or 'Save changes' (apps/web/features/skills/components/SkillEditorDialog.tsx:91, :196, :312)

**Journey**

1. Open Connectors and choose a service
2. Choose connect; the service's authorization page opens (apps/cli/src/cloud/connectors.rs:169 builds the start URL for the CLI)
3. Approve at the service; the app returns and the connector shows as connected
4. If the grant later expires, the connector shows a reconnect action beside Disconnect; choosing it signs in again
5. Open a plugin, choose Install, read the permission notice in the confirmation, accept
6. Open Skills, choose New skill or import a file or zip, edit fields, save

**What the person sees and gets**

- Reconnect copy: '<name> needs reconnecting. Its tools stop until you do; its settings are kept.' (packages/ui/ui/src/directory/constants.ts:263)
- Mobile row 'Authorization expired, reconnect' and button 'Reconnect' or 'Opening authorization…' (apps/mobile/src/features/settings/cloud-connectors/index.tsx:147, :298)
- Skill upload errors explain zip layout problems (apps/web/app/api/skills/skill-upload-rules.ts:4)
- CLI skill import prints 'Imported the skill to <path>.' (apps/cli/src/tui/tui_app.rs:6179)

**Settings**

- Connector tool permissions and granted permissions list ('Permissions granted') in desktop settings (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:738)
- Plugin enabled switch (packages/ui/ui/src/directory/PluginDetailView.tsx:440)
- Workspace plugin policy (server side, install-gate.ts)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web connector create route runs a workspace access gate, CSRF check and rate limit, then probes the server and returns tool names (apps/web/app/api/connectors/route.ts:530)
- OAuth start, callback and app-completion routes exist (apps/web/app/api/connectors/oauth/start/route.ts:391, apps/web/app/api/connectors/oauth/callback/route.ts:82, apps/web/app/api/connectors/oauth/complete/route.ts:58)
- Shared connector detail shows reconnect only for a connected, needs-reauthorization, not-coming-soon entry (packages/ui/ui/src/directory/ConnectorDetailView.tsx:265)
- Web adapter marks connectors that need reauthorization from the server list (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:555)
- Mobile reconnect action for an expired OAuth connector (apps/mobile/src/features/settings/cloud-connectors/index.tsx:298)
- Plugin install shows a confirmation with the permission notice when one exists (packages/ui/ui/src/directory/DirectoryPanel.tsx:394, apps/web/features/directory/services/plugins-directory.ts:694)
- Plugin version picker lists newly requested permissions (apps/web/features/directory/services/plugins-directory.ts:1564)
- Plugin install API checks workspace feature and plugin policy before installing (apps/web/app/api/plugins/installations/route.ts:36, apps/web/features/plugins/server/directory/install-gate.ts:20)
- Web skill create, upload, update and delete routes (apps/web/app/api/skills/route.ts:262, apps/web/app/api/skills/[name]/route.ts:107)
- CLI skill import copies a SKILL.md or folder into the skills folder (apps/cli/src/skills.rs:1498)
- CLI connectors list and disconnect with a consequence-naming confirmation (apps/cli/src/lib.rs:7392)

**Incomplete**

- Account selection: web and mobile only list the connected accounts; the accounts route has GET only and no control to pick or make one default was found (apps/web/app/api/connectors/[connectorId]/accounts/route.ts:44, apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx:54). The data carries an isDefault flag (apps/web/lib/connectors/oauth-store.ts:623). The brief marks this done on four apps; the code read does not show it.
- Plugin permission review: the permission notice is in the install confirmation only when an entry has an install notice; for a plugin with no permissions there is no dialog and install runs directly (packages/ui/ui/src/directory/DirectoryPanel.tsx:405)
- Web reconnect: the brief says a live check with a revoked grant is still needed (doc: knowledge-base/data/area-briefs/010-modal-and-dialog-inventory.md, S10.19)
- CLI plugin install and update work on local or git plugins, with integrity and signature options, and have no account-style permission review step (apps/cli/src/lib.rs:2017)
- CLI connect and reconnect: the CLI has no connect subcommand; it prints a reconnect link when a tool result asks for it (apps/cli/src/cloud/connectors.rs:26)
- Skill edit on desktop and the skill editor on web are dialogs; CLI has import and remove only [inferred from apps/cli/src/tui/tui_app.rs:6165]

**Present but disconnected or switched off**

- Skill creation, upload and update are refused when env AGI_USER_SKILL_AUTHORING is set to 0 (apps/web/lib/services/user-skill-authoring.ts:10)
- Mobile Connectors and Skills flags are on; pluginMarketplaceAdmin is off (apps/mobile/lib/v1FeatureFlags.ts:18, :20, :36)

**Not available**

- Plugin install, permission review and update: no screen on mobile, VS Code or Chrome (search for DirectoryPanel and plugins/installations in apps/mobile, apps/extension and apps/extension-vscode returned nothing)
- Skill import and edit on mobile, VS Code and Chrome: none found
- Connectors on VS Code and Chrome: none found; Chrome only shows connectors as coming soon (apps/extension/__tests__/connectors-coming-soon.test.ts)

## 4. Required behaviour

**Established requirements**

- Connect runs the service's real authorization and ends with the account connected. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.18)
- An expired connection offers reconnect that re-runs authorization and keeps its settings. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.19)
- When a service has several accounts, a dialog lets the user pick which to use or make default. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.20)
- Install and update show the permissions a plugin requires and ask the user to accept them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.21, S10.23)
- Skill import ends with a usable skill; edit saves name, description and instructions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.24, S10.25)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Connect a supported connector on web: after approval the connector appears as connected and chat can call one of its tools
2. Revoke the grant at the service: the connector shows a reconnect action beside Disconnect; reconnecting keeps its tool permissions
3. With two accounts linked to one service, the person can choose the default account
4. Installing a plugin that asks for permissions shows each permission before install and installs only after acceptance
5. Updating to a version with new permissions names the new ones
6. Importing a zip with SKILL.md in the wrong place shows the layout message and creates nothing
7. Editing a skill's description and saving shows the new description after reload
8. Disconnect names what is lost before it runs

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A failed connect leaves the previous state, matching the brief's failure rule, because the connect route only writes after a successful probe [inferred from apps/web/app/api/connectors/route.ts:515]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an account picker and a make-default action backed by a PATCH on the accounts route
- [proposed] Show a permission dialog for every plugin install, with an explicit 'no special permissions' line
- [proposed] Give the CLI a connect subcommand that opens the start URL and waits

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ConnectorDetailView | `packages/ui/ui/src/directory/ConnectorDetailView.tsx` | Shared connect, reconnect and disconnect screen for web and desktop |
| component | DirectoryPanel | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | Directory of connectors, plugins and skills; install confirmation |
| component | PluginDetailView | `packages/ui/ui/src/directory/PluginDetailView.tsx` | Plugin detail with permissions, version picker, enabled switch |
| config | directory constants | `packages/ui/ui/src/directory/constants.ts` | Visible labels and reconnect copy |
| hook | useConnectorsSettingsAdapter | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Loads connectors, tracks expired ones for the web settings modal |
| hook | useDirectoryAdapter | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Plugin install, skill upload and section loading for web |
| service | plugins-directory | `apps/web/features/directory/services/plugins-directory.ts` | Builds install notices and version permission differences |
| component | ConnectorAccountSummary (web) | `apps/web/features/connectors/components/ConnectorAccountSummary.tsx` | Read-only list of linked accounts |
| endpoint | POST /api/connectors | `apps/web/app/api/connectors/route.ts` | Creates a connector connection after access gate, CSRF and rate limit |
| endpoint | GET /api/connectors/oauth/start, GET callback, POST complete | `apps/web/app/api/connectors/oauth/start/route.ts` | Authorization start, callback and app return |
| endpoint | GET /api/connectors/[connectorId]/accounts | `apps/web/app/api/connectors/[connectorId]/accounts/route.ts` | Lists linked accounts |
| service | oauth-store | `apps/web/lib/connectors/oauth-store.ts` | Stores grants; listConnectorAccounts includes isDefault |
| endpoint | /api/plugins/installations | `apps/web/app/api/plugins/installations/route.ts` | Lists and creates plugin installs |
| service | install-gate | `apps/web/features/plugins/server/directory/install-gate.ts` | Workspace feature and plugin policy checks |
| endpoint | /api/skills and /api/skills/[name] | `apps/web/app/api/skills/route.ts` | Create, upload, update, delete user skills |
| component | SkillEditorDialog | `apps/web/features/skills/components/SkillEditorDialog.tsx` | New and edit skill dialog |
| config | user-skill-authoring | `apps/web/lib/services/user-skill-authoring.ts` | AGI_USER_SKILL_AUTHORING switch |
| screen | Mobile Connectors | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Mobile connect and reconnect, health notices |
| service | mobile connectors service | `apps/mobile/services/connectors.ts` | API calls for listing, accounts and OAuth |
| command | agi connectors | `apps/cli/src/lib.rs` | List and disconnect connectors, tier check |
| service | CLI connectors client | `apps/cli/src/cloud/connectors.rs` | List, disconnect, reconnect notice, connect URL |
| command | CLI plugin and skills import | `apps/cli/src/skills.rs` | import_skill and local plugin commands |
| config | capability table | `packages/contracts/types/src/capabilities.ts` | canUseConnectors, canUsePlugins, canUseSkills |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person chooses connect in the web or desktop directory | device | packages/ui/ui/src/directory/ConnectorDetailView.tsx:313 |
| The app asks AGI to start authorization; the server builds the service's authorization URL | our servers | apps/web/app/api/connectors/oauth/start/route.ts:391 |
| The person signs in and approves at the outside service | outside service | apps/cli/src/cloud/connectors.rs:169 (start URL handed to the browser) |
| The service redirects to AGI's callback; AGI exchanges the code and stores the grant | our servers | apps/web/app/api/connectors/oauth/callback/route.ts:82, apps/web/lib/connectors/oauth-store.ts:306 |
| Mobile app return posts the state to the complete route, which refuses a state not opened by that user | our servers | apps/web/app/api/connectors/oauth/complete/route.ts:34 |
| Plugin install: the confirmation shows the notice; accepting posts the plugin id; the server runs the feature gate and policy check | device and our servers | packages/ui/ui/src/directory/DirectoryPanel.tsx:412, apps/web/app/api/plugins/installations/route.ts:56 |
| Skill save: dialog posts a draft; server validates, checks authoring switch and workspace feature, writes the row, records an audit event | our servers | apps/web/app/api/skills/route.ts:212, :237 |
| CLI skill import reads a local file or folder and copies it into the local skills folder | device | apps/cli/src/skills.rs:1498 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Connector grant (tokens, account label, default flag, needs-reauthorization flag) | table:connector_oauth_grants (apps/web/lib/connectors/oauth-store.ts:306) | Account-wide; every surface reads it from the server (apps/cli/src/lib.rs:7397 message) | Removed on Disconnect: saved sign-in and tool permissions (apps/cli/src/lib.rs:7397) |
| User skill (name, description, body) | table:user_skills (apps/web/lib/services/user-skill-service.ts:305) | Account-wide via the server | Deleted by DELETE /api/skills/[name]; audit event skill_uninstalled (apps/web/app/api/skills/[name]/route.ts:94) |
| CLI imported skill | store:CLI config skills folder (apps/cli/src/skills.rs:1498) | Not synced by this command | Removed with /skills remove (apps/cli/src/repl/slash_commands.rs:232) |

**Models and providers.** No model is used to connect, install or edit. Connectors expose tools to whichever model the chat uses; the model catalog is not consulted here (SYS-connectors-plugins-and-skills).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Needs a signed-in account. Mobile loads connectors only when signed in and in Cloud mode (apps/mobile/src/features/settings/cloud-connectors/index.tsx:507). CLI connects to the cloud first (apps/cli/src/lib.rs:7381). |
| Permissions | Connect runs a workspace access gate (apps/web/app/api/connectors/route.ts:541). Plugin install checks the workspace 'plugins' feature and plugin policy (apps/web/features/plugins/server/directory/install-gate.ts:20). Skill creation checks the 'skills' feature (apps/web/app/api/skills/route.ts:219). |
| Subscription | The capability table lists canUseConnectors, canUsePlugins and canUseSkills as true for the three rows read (packages/contracts/types/src/capabilities.ts:53, :86, :119). Mobile and CLI also read the granted-capabilities list from the account (apps/mobile/src/features/settings/cloud-connectors/index.tsx:432, apps/cli/src/lib.rs:7379). Which plans grant them: unknown. |
| Limits and metering | Rate limits on connector and plugin writes (apps/web/app/api/connectors/route.ts:538, apps/web/app/api/plugins/installations/route.ts:45). No usage metering found. |
| Feature flags | AGI_USER_SKILL_AUTHORING (0 turns authoring off); mobile FEATURES.connectors and FEATURES.skills. |
| Model compatibility | none found in the code |
| Provider restrictions | Connector providers are outside services, not inference providers. Which connectors a deployment offers is server configuration (available list in apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:554). |
| Local mode | Connectors need the account, so they are not available in Local chat on mobile (the Connectors screen loads only in Cloud mode). CLI skill import and local plugin install work without the account. Nothing is routed to the cloud by these local commands. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web account list shows a spinner and 'Reading the connected account'; mobile row says the same | apps/web/features/connectors/components/ConnectorAccountSummary.tsx:28 |
| Error loading accounts | Message plus Retry button on web; 'Could not be read. Tap to retry.' on mobile | apps/web/features/connectors/components/ConnectorAccountSummary.tsx:103, apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx:12 |
| Expired grant | Reconnect shown; chat tool says authorization expired and offers a button | apps/web/lib/user-connector-tools.ts:803 |
| Authorization declined or state invalid | Complete route returns status invalid_state when no open sign-in for that user | apps/web/app/api/connectors/oauth/complete/route.ts:36 |
| Reconnect in progress (mobile) | Button disabled and reads 'Opening authorization…' | apps/mobile/src/features/settings/cloud-connectors/index.tsx:303 |
| Offline | not handled in the code beyond load errors [inferred]; no offline queue found | searched apps/web/features/connectors and apps/mobile/src/features/settings/cloud-connectors; no offline handling seen |
| Skill name equals a built-in name | Conflict error '<name> is already a built-in skill name.' | apps/web/app/api/skills/route.ts:231 |
| Accessibility | Account section has aria-labelledby; status role on error; mobile alert and disabled state exposed | apps/web/features/connectors/components/ConnectorAccountSummary.tsx:90, apps/mobile/src/features/settings/cloud-connectors/index.tsx:344 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/oauth/start/route.test.ts`: Inferred from name: OAuth start route
- `apps/web/app/api/connectors/oauth/start/route.credential-reconnect.test.ts`: Inferred from name: reconnect through credential start
- `apps/web/app/api/connectors/oauth/callback/route.test.ts`: Inferred from name: callback handling
- `apps/web/app/api/connectors/oauth/complete/route.test.ts`: Inferred from name: app return completion
- `apps/web/app/api/connectors/route.test.ts`: Inferred from name: connectors route
- `apps/web/features/connectors/hooks/__tests__/useConnectorsSettingsAdapter.test.tsx`: Inferred from name: web adapter
- `packages/ui/ui/src/directory/__tests__/ConnectorDetailView.test.tsx`: Inferred from name: shared detail view
- `apps/desktop/src/features/connectors/__tests__/ConnectorDetailView.reset.test.tsx`: Inferred from name: desktop detail view reset
- `apps/mobile/__tests__/ConnectorOauthReauthorize.test.tsx`: Inferred from name: mobile reauthorize
- `apps/web/features/directory/__tests__/plugins-directory.test.ts`: Inferred from name: plugin directory notices
- `apps/web/app/api/plugins/installations/__tests__/route.test.ts`: Inferred from name: install route
- `apps/web/features/skills/components/SkillEditorDialog.test.tsx`: Inferred from name: skill editor dialog
- `apps/web/lib/services/user-skill-service.test.ts`: Inferred from name: skill service

**Test scenarios**

- **Reconnect after revoked grant (web)**
  1. Connect Google Drive
  2. Revoke the grant in the Google account
  3. Open Connectors
  4. Choose Reconnect
  5. Approve again
  - Expected: Reconnect appears beside Disconnect; after approval the connector works and tool permissions are unchanged; chat shows the reconnect card
- **Plugin permission acceptance**
  1. Open a plugin that lists permissions
  2. Choose Install
  3. Read the dialog
  4. Cancel, then repeat and accept
  - Expected: Cancel installs nothing; accept installs and the permission list matches the notice
- **Skill import layout error**
  1. Zip the files of a skill without a folder
  2. Import it in Skills
  - Expected: Message says SKILL.md must be inside the skill folder; no skill is created
- **Multiple accounts**
  1. Link two accounts of one service
  2. Open the connector detail
  - Expected: Both are listed; check whether a default can be chosen (currently expected to fail, see gaps)
- **CLI skill import**
  1. Run /skills import with a folder holding SKILL.md
  - Expected: 'Imported the skill to <path>.' and the skill appears in the skills list

**Where to look when it fails**

- Log '[connector-oauth] app completion rejected: no open app sign-in for this state' (apps/web/app/api/connectors/oauth/complete/route.ts:36)
- Table connector_oauth_grants needs_reauthorization flag
- Audit events skill_installed and skill_uninstalled (apps/web/app/api/skills/route.ts:238)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/web/010-modal-and-dialog-inventory.md)
- Desktop: [70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md)
- Mobile: [70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md)
- CLI: [70-qa/test-plans/cli/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/cli/010-modal-and-dialog-inventory.md)

## 10. Gaps and dependencies

- **No way to pick or make default one of several connected accounts** Affects: Web, desktop, mobile, CLI users with several accounts per service. Evidence: apps/web/app/api/connectors/[connectorId]/accounts/route.ts:44 (GET only); apps/web/features/connectors/components/ConnectorAccountSummary.tsx:112 (list only). Work needed: Add a default-account write endpoint and a picker control on each surface
- **Plugin permissions are shown only inside an install confirmation that exists when an install notice is set; update shows new permissions in the version picker, not in a required acceptance step** Affects: Web and desktop. Evidence: packages/ui/ui/src/directory/DirectoryPanel.tsx:405, :636. Work needed: Require explicit acceptance of new permissions before an update applies
- **Plugin install, permissions and update not built on mobile, VS Code, Chrome** Affects: Those three apps. Evidence: No DirectoryPanel or installations call under apps/mobile, apps/extension, apps/extension-vscode. Work needed: Decide scope per surface, then build
- **CLI has no connect or reconnect command, only a link in a tool notice, and plugin update is a git update without permission review** Affects: CLI users. Evidence: apps/cli/src/lib.rs:1275, apps/cli/src/cloud/connectors.rs:26. Work needed: Add connect command; add review step to plugin update
- **Web reconnect with a real revoked grant not live-checked** Affects: Web and Electron. Evidence: brief S10.19 Unfinished. Work needed: Run the live check
- **Skill import and edit missing on mobile, VS Code, Chrome** Affects: Those apps. Evidence: No skill editor found in apps/mobile/app (grep for skills returned only layout and reflect). Work needed: Build or mark not applicable
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- table:connector_oauth_grants
- table:user_skills
- api:GET /api/connectors/oauth/start
- api:POST /api/plugins/installations
- api:POST /api/skills
- file:packages/ui/ui/src/directory/DirectoryPanel.tsx

## Unknown

- Which plans grant connectors, plugins and skills: the capability table is all true and the real grant comes from /api/me
- Exact web call that starts OAuth from the connect button was not opened
- Whether desktop Tauri code (apps/desktop/src) ships anywhere, since the public Desktop is Electron per AGENTS.md
- Whether an account picker exists in a file not found by the search
- Brief line references for CLI plugin and skill items (apps/cli/src/lib.rs:1293, :1428) point at unrelated code
