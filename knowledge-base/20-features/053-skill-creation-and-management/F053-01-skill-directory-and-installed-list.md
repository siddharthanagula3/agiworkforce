---
id: "F053-01"
type: "feature"
title: "Skill directory and installed list"
aliases: ["Skill directory", "Skills catalogue", "Installed skills", "Settings > Skills", "Managed Cloud catalog (mobile heading)", "Skills screen (mobile)", "/skills and /skills-toggle (CLI)", "Items S53.01, S53.02, S53.07"]
area: "53 Skill creation and management"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "seen working", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S53.01", "S53.02", "S53.07"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "api:GET /api/skills", "api:GET /api/skills/installs", "table:user_skills", "table:user_settings", "store:cli-disabled-skills", "store:cli-account-skills", "file:apps/web/lib/services/skill-catalog-service.ts", "F053-04", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F053-01 Skill directory and installed list

Shows the skills an account can use, each with a name and a description. Web and Desktop list them in Settings under Skills, with an installed view and a whole-catalogue view. Mobile has a Skills screen (Cloud mode only). The CLI and VS Code list skill files found on the device and synced from the account.

Area: [53. Skill creation and management](README.md). Requirement items: [S53.01](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5301), [S53.02](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5302), [S53.07](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5307).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen working |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lists built-in AGI skills, the person's own (personal) skills, plugin skills and, on the CLI, project and user folder skills. Each row shows the skill name and its description. The default web list is what the account has switched on; the whole catalogue also includes skills the account switched off (apps/web/app/api/skills/route.ts:141-153).

**Why it exists.** A person cannot use a skill they cannot find. The list is where a skill is discovered, opened, switched on or off, and chosen for a chat. Project requirements ask for user, project and marketplace/plugin skills (doc: docs/product/requirements.md, section 'Connectors, MCP, Plugins, And Skills').

**Who uses it.** Any signed-in person on Web, Desktop (hosted web app) or Mobile (Cloud mode); developers on the CLI and in VS Code.

**Problems it solves**

- Finding which skills exist and what each one does
- Seeing which skills are on for the account
- Telling built-in skills from your own and from plugin skills

**Use cases**

- A person opens Settings > Skills on the web to see the built-in skills and searches for a PDF skill.
- A mobile user in Cloud mode opens Skills, searches 'report' and sees which matching skills are installed.
- A developer runs /skills in the CLI to see the skills the agent will be offered.
- A developer opens the Skills quick pick in VS Code to see which workspace skills are on.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings modal, nav item 'Skills' in the Customize group (packages/ui/ui/src/settings-nav.ts:376). Desktop's public build shows the hosted web app (doc: AGENTS.md section 5).
- Web: a signed-in visit to /skills opens that Settings section (apps/web/app/skills/page.tsx:41-44); a signed-out visit shows a public list of the built-in skills (apps/web/app/skills/page.tsx:49).
- Mobile: route /(app)/skills, header 'Skills' with a 'Cloud' badge (apps/mobile/src/features/skills/SkillsScreen.tsx:132-177, apps/mobile/app/(app)/skills/index.tsx); opened from the composer (apps/mobile/app/(app)/(tabs)/chat.tsx:1048).
- CLI: '/skills' prints the list; '/skills-toggle' opens the on/off overlay (apps/cli/src/tui/tui_app.rs:6198-6212, apps/cli/src/tui/tui_app.rs:6540-6556).
- VS Code: 'Skills' item in the surface menu and the '/skills' entry, both run command agi-workforce.showSkills, which opens a quick pick titled 'Skills' (apps/extension-vscode/src/features/surfaces/surfaceMenu.ts:38, apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:220-226).
- Chrome extension: no directory. The composer attach menu has a 'Skills' row that lists the account's own skills (apps/extension/src/side_panel.ts:15112-15190).

**Before you start**

- Web, Desktop, Mobile: signed in (the list route reads the account's own database rows through getUserScopedDb, apps/web/app/api/skills/route.ts:144).
- Mobile: Cloud mode and signed in; in Local mode the screen shows 'Skills are available in AGI Cloud' with a 'Switch to AGI Cloud' or 'Sign in to AGI Cloud' button (apps/mobile/src/features/skills/SkillsScreen.tsx:132-177, 639-640).
- CLI and VS Code: no sign-in needed for local skill files; account skills sync only when signed in to Managed Cloud (apps/cli/src/cloud/mod.rs:652-683).

**Screens and controls**

- Web and Desktop list: a card list with source chips 'Made by AGI' and 'Yours' (apps/web/features/directory/constants.ts:13-14, apps/web/features/directory/services/skills-directory.ts:165), a Status filter (installed or not installed) and a lifecycle filter shown only when both included and draft skills exist (apps/web/features/directory/services/skills-directory.ts:172-196), sort by name or by popularity when install counts exist (apps/web/features/directory/services/skills-directory.ts:74-75, 244-255).
- Web and Desktop manage view: rows grouped by how the skill reached the account; drafts are left out; only built-in (AGI group) rows get an on/off switch (apps/web/features/directory/services/skills-directory.ts:200-243).
- Mobile: search box 'Search skills' with 'Clear skill search' button; intro card 'Managed Cloud catalog' ('Install a Skill to use it in your AGI Cloud messages.'); count line 'N SKILLS INSTALLED'; row with source badge (Built in, Managed, Personal, Project, Workspace, Added), description (3 lines), status label (Installed, Not installed, Coming later), buttons Install/Uninstall, Details, Use in chat; 'New skill' and 'Import' buttons only when authoring is on (apps/mobile/src/features/skills/SkillsScreen.tsx:247-400, 800-900).
- CLI: '/skills' prints 'Skills (N):' then name and description per line; '/skills-toggle' overlay 'Skills (up/down navigate, Space toggle, Enter save, Esc cancel)' (apps/cli/src/tui/tui_app.rs:6198-6212, 6556).
- VS Code quick pick: placeholder 'Select a skill to see its actions'; rows show the skill name, a scope description and a detail with the description and any missing requirements (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:224-226, 301-303).

**Journey**

1. Web: open Settings and choose 'Skills'. The page loads the whole catalogue and the account's installed names together (apps/web/features/directory/hooks/useDirectoryAdapter.ts:475-484).
2. Search or filter by status and source.
3. Click a row to open the detail view (see F053-02).
4. Mobile: open Skills from the composer; the screen loads the catalogue, installed names and the authoring flag in one go (apps/mobile/src/features/skills/SkillsScreen.tsx:740-770).
5. CLI: type /skills to read the list, or /skills-toggle to change which are on (apps/cli/src/tui/tui_app.rs:6540-6556).

**What the person sees and gets**

- Web: loading spinner while the section loads; on failure an error with a retry action (apps/web/features/directory/hooks/useDirectoryAdapter.ts:500-512).
- Web: draft skills carry a draft status label and cannot be installed (apps/web/features/directory/services/skills-directory.ts:146-156).
- Mobile: skeleton blocks while loading (apps/mobile/src/features/skills/SkillsScreen.tsx:544); 'Could not load Skills' with a 'Try again' button on first-load failure (apps/mobile/src/features/skills/SkillsScreen.tsx:556-603); 'Refresh failed: ...' banner with 'Retry' when a refresh fails over an existing list (apps/mobile/src/features/skills/SkillsScreen.tsx:461); empty states 'No matching Skills' with 'Clear search', and 'No managed Skills yet' (apps/mobile/src/features/skills/SkillsScreen.tsx:478-540); an install or uninstall failure shows as an alert line under that row (apps/mobile/src/features/skills/SkillsScreen.tsx:400-415).
- CLI: with no skills the message is 'No skills found. Add .md files to .agiworkforce/skills/ or ~/.agiworkforce/skills/' (apps/cli/src/tui/tui_app.rs:6201).

**Settings**

- Server environment setting AGI_USER_SKILL_AUTHORING: any value other than 0 leaves authoring on; it controls the canAuthorSkills flag in the list response (apps/web/lib/services/user-skill-authoring.ts:5-12, apps/web/.env.example:406-408).
- Server setting SKILLS_LAYERS adds extra skill folders to the catalogue (apps/web/lib/services/skill-catalog-service.ts:168-236).
- Workspace admin switch for the Skills feature (capability canUseSkills); when closed, Settings > Skills shows a notice instead of the list (apps/web/features/settings/components/WebSettingsModal.tsx:243-258).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop (hosted web app): GET /api/skills returns the installed list by default and the whole catalogue with ?catalog=all; each entry has name, description, source, lifecycle, origin, version, requirements and install totals (apps/web/app/api/skills/route.ts:141-203).
- Web: personal skills and plugin-directory skills are merged in; a name is listed once, first claim wins (apps/web/app/api/skills/route.ts:156-160, apps/web/lib/services/skill-catalog-service.ts:104).
- Web directory client turns the response into cards, filters, sort and manage rows (apps/web/features/directory/services/skills-directory.ts:141-255).
- Mobile: Skills screen with search, filters by name, description and source label, pull to refresh, loading, error and empty states (apps/mobile/src/features/skills/SkillsScreen.tsx:740-915).
- CLI: discover_skills lists user, project (after consent), account-synced and plugin skills (apps/cli/src/skills.rs:144-200).
- VS Code: lists skills from the local runtime via the skills/list request (apps/extension-vscode/src/integrations/localRuntimeClient.ts:2126-2131).

**Incomplete**

- Draft skills: the web labels them as drafts; mobile labels them 'Coming later'; the CLI sync skips them (apps/mobile/src/features/skills/SkillsScreen.tsx:55-57, apps/cli/src/cloud/skills.rs:171). The wording differs between apps.
- Mobile has no explicit message telling a person with zero installed skills to install one; it shows the count '0 SKILLS INSTALLED' and the intro card (apps/mobile/src/features/skills/SkillsScreen.tsx:333-360).
- Chrome extension shows only the account's own skills, not built-in ones (apps/extension/src/features/cloud-bridge/skillsClient.ts:45).

**Present but disconnected or switched off**

- A personal-skill listing is switched off when AGI_USER_SKILL_AUTHORING is 0 (apps/web/lib/services/user-skill-service.ts:196-198).
- Tauri desktop client code that lists Cloud skills (apps/desktop/src/api/cloudSkills.ts:1-25) is retained internal code, not the public Desktop window (doc: AGENTS.md section 5).

**Not available**

- CLI and VS Code: no catalogue of skills that are not on the device; only local, project, plugin and synced account skills (apps/cli/src/skills.rs:144-200).
- Mobile Local mode: the screen is gated and nothing loads (apps/mobile/src/features/skills/SkillsScreen.tsx:639-640, 785-790).
- Chrome: no directory page; 'Manage skills' opens the web settings in a new tab (apps/extension/src/side_panel.ts:15183-15186).

## 4. Required behaviour

**Established requirements**

- A user can browse a catalogue of available skills, including ones not yet installed, and open any of them (S53.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.01)
- A user can see the list of skills installed or active for them (S53.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.02)
- Each skill shows its name and a description of what it does (S53.07). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.07)
- Skills requirements include user skills, project skills and marketplace/plugin skills. (source: doc: docs/product/requirements.md (section 19))
- Install, create, enable, invoke, disable and uninstall must affect the next turn and survive reload; failures are explained without claiming installation. (source: doc: docs/product/experience-contract.md:788)
- Skills stay available in Free chat. (source: doc: docs/product/definition.md:383)

**Acceptance criteria**

1. Web Settings > Skills lists built-in skills each with name and description, and the status filter separates installed from not installed.
2. A skill the account switched off still appears in the whole catalogue but not in the default list or the composer picker (apps/web/app/api/skills/__tests__/skill-catalog-param.test.ts:204-216).
3. A draft skill shows a draft label and has no Install action.
4. Mobile in Cloud mode shows the list; in Local mode it shows the gate with no network request.
5. Searching mobile with no matches shows 'No matching Skills' and 'Clear search' restores the list.
6. CLI /skills lists the skills the agent is offered, and a skill turned off in /skills-toggle no longer appears.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] 'Installed' on the web means 'not switched off': a never-toggled built-in skill counts as installed (apps/web/lib/services/skill-catalog-service.ts:150-158).
- [inferred] The brief's 'not yet installed' therefore covers only skills the account switched off, since built-in skills are on by default.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give the CLI and VS Code a read-only view of the account catalogue so a developer can see skills not yet synced.
- [proposed] Use one wording for drafts across web, mobile and CLI.
- [proposed] Add a mobile empty message that points a person with no installed skills to Install.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/skills | `apps/web/app/api/skills/route.ts` | Returns the installed list or, with catalog=all, the whole catalogue plus canAuthorSkills (lines 141-203). |
| service | skill-catalog-service | `apps/web/lib/services/skill-catalog-service.ts` | Loads bundled and layered skills, caches 60 seconds, filters by plugins and install overrides, dedupes names (lines 52, 104, 150, 239). |
| service | skill-install-service | `apps/web/lib/services/skill-install-service.ts` | Reads and writes per-account install overrides in user settings (lines 10-48, 89-137). |
| table | user_settings | `apps/web/lib/services/skill-install-service.ts` | Row column settings holds skills.installs name-to-boolean overrides (lines 10-11, 44-48). |
| table | user_skills | `apps/web/db/neon/0157_user_skills.sql` | The account's personal skills merged into the list (lines 19-33). |
| schema | ManagedSkillsResponseSchema | `packages/contracts/cloud-contracts/src/skills.ts` | Shared shape of a skill summary used by web, mobile, desktop and Chrome (lines 1-80). |
| service | skills-directory | `apps/web/features/directory/services/skills-directory.ts` | Fetches the catalogue and installed names; maps to entries, filters and manage rows (lines 141-282). |
| hook | useDirectoryAdapter | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Loads the skills section, handles retry and refresh events (lines 475-533). |
| screen | Settings nav 'Skills' | `packages/ui/ui/src/settings-nav.ts` | Puts Skills in the Customize group (line 376). |
| screen | Public /skills page | `apps/web/app/skills/page.tsx` | Redirects signed-in users to Settings > Skills, lists built-in skills for signed-out visitors (lines 20-49). |
| config | skills-catalog-read rate limit | `apps/web/lib/rate-limit.ts` | 300 reads per minute for catalogue reads (lines 311-317). |
| screen | SkillsScreen | `apps/mobile/src/features/skills/SkillsScreen.tsx` | Mobile list, search, gate, states and row actions. |
| service | mobile skills service | `apps/mobile/src/features/skills/service.ts` | Calls /api/skills, ?catalog=all and /api/skills/installs (lines 17-18, 56-75). |
| config | FEATURES.skills | `apps/mobile/lib/v1FeatureFlags.ts` | Mobile feature flag, set true (line 20). |
| service | CLI skill discovery | `apps/cli/src/skills.rs` | Loads project, user, account and plugin skills; applies the disabled list (lines 95-200). |
| command | /skills and /skills-toggle | `apps/cli/src/tui/tui_app.rs` | List and toggle overlay (lines 6198, 6540). |
| store | CLI disabled-skills.json | `apps/cli/src/skills.rs` | Device file listing skill names turned off (lines 95-141). |
| job | CLI account skills sync | `apps/cli/src/cloud/mod.rs` | Refreshes account skills at most every 10 minutes when signed in to Managed Cloud (lines 652-683). |
| command | manageSkills quick pick | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | VS Code Skills quick pick (lines 220-315). |
| service | VS Code local runtime client | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | skills/list request to the local runtime (lines 2126-2131). |
| service | app server list_skills | `apps/cli/src/app_server/surfaces.rs` | Builds the skill list the VS Code surface receives (lines 107-130). |
| component | Chrome Skills menu | `apps/extension/src/side_panel.ts` | Attach-menu list of own skills (lines 15112-15190). |
| test | skill-catalog-param.test.ts | `apps/web/app/api/skills/__tests__/skill-catalog-param.test.ts` | Covers the list route and catalog parameter. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: opening Settings > Skills requests GET /api/skills?catalog=all and GET /api/skills/installs together, and shows a spinner meanwhile. | device | apps/web/features/directory/hooks/useDirectoryAdapter.ts:475-484; apps/web/features/directory/services/skills-directory.ts:269-282 |
| The server applies a rate limit, finds the signed-in account, checks whether the workspace allows plugins, loads the bundled skill catalogue (cached 60 seconds) and reads the account's install overrides. | our servers | apps/web/app/api/skills/route.ts:141-153; apps/web/lib/services/skill-catalog-service.ts:52, 239-262 |
| The server adds the account's personal skills, plugin-directory skills, each skill's origin and measured install totals, validates the answer against the shared schema and replies; a bad shape clears the catalogue cache. | our servers | apps/web/app/api/skills/route.ts:156-203 |
| The client maps entries to cards with installed state, filters and sort, and renders the list. | device | apps/web/features/directory/services/skills-directory.ts:141-255 |
| Mobile makes the same requests with the signed-in session, only in Cloud mode. | device and our servers | apps/mobile/src/features/skills/service.ts:56-66; apps/mobile/src/features/skills/SkillsScreen.tsx:639-640 |
| CLI reads skill folders on disk; when signed in to Managed Cloud it downloads the account's skills into an account-skills folder at most every 10 minutes and lists them too. | device and our servers | apps/cli/src/skills.rs:211-245; apps/cli/src/cloud/mod.rs:652-683; apps/cli/src/cloud/skills.rs:164-181 |
| VS Code asks the local CLI runtime for skills/list and shows the answer. | device | apps/extension-vscode/src/integrations/localRuntimeClient.ts:2126-2131; apps/cli/src/app_server/surfaces.rs:107-130 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Install overrides (skill name to true or false) | public.user_settings, settings.skills.installs (apps/web/lib/services/skill-install-service.ts:10-11) | Server side per account; read by web, mobile and, through the list, the CLI sync | Kept until the account changes it; no deletion path found |
| Personal skills | public.user_skills (apps/web/db/neon/0157_user_skills.sql:19-27) | Per account on our servers | Deleted by the owner; files cascade (apps/web/db/neon/0318_user_skill_files.sql:24-33) |
| Built-in skill files | Bundled on the server disk, cached in memory for 60 seconds (apps/web/lib/services/skill-catalog-service.ts:52) | Not per account | Changed only by a release |
| CLI disabled list and account-skills folder | Files in the CLI config folder (apps/cli/src/skills.rs:95-101; apps/cli/src/cloud/skills.rs:12-13) | Disabled list is device only; account folder is a copy of the account list | Account folder entries the account no longer lists are removed on the next sync (apps/cli/src/cloud/skills.rs:183-210) |

**Models and providers.** No model or provider takes part in listing skills. The list does not depend on which model is chosen.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Desktop and Mobile need a signed-in account; the signed-out /skills page shows only a public list of built-in skills (apps/web/app/skills/page.tsx:41-49). CLI and VS Code local skills need no account. |
| Permissions | A workspace admin can switch the Skills feature off, which closes the capability canUseSkills and replaces the settings pane with a notice (apps/web/lib/services/capability-handshake-service.ts:183; apps/web/features/settings/components/WebSettingsModal.tsx:243-258). When the workspace disallows plugins, plugin skills are not listed (apps/web/app/api/skills/route.ts:146-152). |
| Subscription | No plan check found in the list route. The platform capability canUseSkills is true for the web, desktop and mobile rows (packages/contracts/types/src/capabilities.ts:55, 88, 121). Project doc says Skills remain available in Free chat (doc: docs/product/definition.md:383). The CLI refuses its skill list when the cached capability document denies canUseSkills (apps/cli/src/skills.rs:144-149). Rows for the CLI, VS Code and Chrome capability: unknown. |
| Limits and metering | 300 catalogue reads per minute per the skills-catalog-read bucket, not fail-closed (apps/web/lib/rate-limit.ts:311-317). No usage metering for listing found. |
| Feature flags | AGI_USER_SKILL_AUTHORING (server, default on) affects canAuthorSkills; FEATURES.skills (mobile, true) (apps/mobile/lib/v1FeatureFlags.ts:20). |
| Model compatibility | Not applicable to listing; none found in the code. |
| Provider restrictions | None found in the code. |
| Local mode | Mobile Local mode: the Skills screen shows the gate and loads nothing (apps/mobile/src/features/skills/SkillsScreen.tsx:639-640, 785-790). CLI: local skill files work with no account; account skills are synced only for Managed Cloud (apps/cli/src/cloud/mod.rs:652-683). Desktop local mode: unknown, because the public Desktop shows the hosted web app (doc: AGENTS.md section 5). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading (web) | Section shows a spinner; a newer request replaces an older one so a slow earlier answer is ignored. | apps/web/features/directory/hooks/useDirectoryAdapter.ts:475-500 |
| Error (web) | Shows the skills failure copy with a retry action; the previous list stays. | apps/web/features/directory/hooks/useDirectoryAdapter.ts:500-512 |
| Catalogue unavailable (server) | A catalogue load failure raises SkillCatalogUnavailableError and the route answers 500 'Failed to load skills'; a bad response shape clears the cache. | apps/web/lib/services/skill-catalog-service.ts:161-166; apps/web/app/api/skills/route.ts:154-158, 197-200 |
| Install overrides cannot be read | Chat treats skills as withheld; only plugin-owned skills stay. | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3738-3744; apps/web/lib/services/skill-catalog-service.ts:150-158 |
| Empty (mobile) | 'No managed Skills yet' or, when searching, 'No matching Skills' with 'Clear search'. | apps/mobile/src/features/skills/SkillsScreen.tsx:478-540 |
| Offline or failed refresh (mobile) | Keeps the list and shows 'Refresh failed' with Retry; first-load failure shows 'Could not load Skills' and 'Try again'. | apps/mobile/src/features/skills/SkillsScreen.tsx:461, 556-603, 760-770 |
| Account switch (mobile) | Results from a previous account are dropped by an account epoch check. | apps/mobile/src/features/skills/SkillsScreen.tsx:740-770 |
| Return to screen (mobile) | The list reloads when the screen regains focus. | apps/mobile/src/features/skills/SkillsScreen.tsx:787-797 |
| Cancel, timeout, reconnect | not handled in the code beyond the retry controls above and the abort signal on mobile loads. | apps/mobile/src/features/skills/SkillsScreen.tsx:775-785 |
| Accessibility (mobile) | Rows have an accessibility label with name and source, a status label per skill and alert role on errors. | apps/mobile/src/features/skills/SkillsScreen.tsx:247-415 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/skills/__tests__/skill-catalog-param.test.ts`: List route: catalog parameter, hidden uninstalled skills, authoring flag, name dedupe, cache eviction, install totals.
- `apps/web/features/directory/__tests__/skills-directory.test.ts`: Directory mapping of skills to entries and manage rows.
- `apps/web/features/skills/services/skills-catalog.test.ts`: Catalogue caching and the authoring capability flag.
- `apps/web/features/chat/hooks/use-skills-list.test.ts`: Composer skills list hook.
- `apps/web/app/skills/__tests__/SkillsSignedOut.test.tsx`: Signed-out public skills page.
- `apps/mobile/__tests__/SkillsPage.test.tsx`: Mobile list, status, empty text, install, uninstall, plugin-owned skills, reload on return.
- `apps/mobile/__tests__/skills-service.test.ts`: Mobile catalogue and installs parsing.
- `apps/cli/src/skills.rs`: In-file Rust tests for discovery, frontmatter, catalogue formatting, consent and disabled names.
- `packages/ui/ui/src/directory/__tests__/SkillDetailView.test.tsx`: Detail view controls opened from the list.

**Test scenarios**

- **Web default versus whole catalogue**
  1. Sign in on the web.
  2. Switch off a built-in skill from its detail view.
  3. Open Settings > Skills and use the Status filter.
  4. Open the composer slash menu.
  - Expected: The skill shows as not installed in the catalogue and is absent from the composer slash menu.
- **Mobile Local mode gate**
  1. Open the mobile app in Local mode.
  2. Open Skills.
  - Expected: The gate 'Skills are available in AGI Cloud' shows and no skills request is made.
- **Mobile search with no match**
  1. Switch to Cloud mode and open Skills.
  2. Type a word that matches nothing.
  - Expected: 'No matching Skills' appears with a 'Clear search' button that restores the list.
- **CLI toggle**
  1. Run /skills and note a skill.
  2. Run /skills-toggle, switch it off with Space, press Enter.
  3. Run /skills again.
  - Expected: The skill is gone from the list and present again after switching it back on.
- **Workspace closes Skills**
  1. Have a workspace admin switch the Skills feature off.
  2. Open Settings > Skills as a member.
  - Expected: A notice replaces the list.

**Where to look when it fails**

- HTTP 500 'Failed to load skills' and the server log line 'Managed Skill catalog load failed' (apps/web/lib/services/skill-catalog-service.ts:239-258).
- Rate-limit headers on GET /api/skills (apps/web/app/api/skills/route.ts:261).
- Mobile text 'Could not load Skills. Check your connection and try again.' (apps/mobile/src/features/skills/SkillsScreen.tsx:766).
- CLI: 'using the account skills this device already had' warning on a failed sync (apps/cli/src/agent/mod.rs:712-720).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/053-skill-creation-and-management.md](../../70-qa/test-plans/web/053-skill-creation-and-management.md)
- Desktop: [70-qa/test-plans/desktop/053-skill-creation-and-management.md](../../70-qa/test-plans/desktop/053-skill-creation-and-management.md)
- Mobile: [70-qa/test-plans/mobile/053-skill-creation-and-management.md](../../70-qa/test-plans/mobile/053-skill-creation-and-management.md)
- CLI: [70-qa/test-plans/cli/053-skill-creation-and-management.md](../../70-qa/test-plans/cli/053-skill-creation-and-management.md)
- VS Code: [70-qa/test-plans/vscode/053-skill-creation-and-management.md](../../70-qa/test-plans/vscode/053-skill-creation-and-management.md)
- Chrome: [70-qa/test-plans/chrome/053-skill-creation-and-management.md](../../70-qa/test-plans/chrome/053-skill-creation-and-management.md)

## 10. Gaps and dependencies

- **CLI and VS Code cannot browse skills that are not already on the device or synced.** Affects: CLI, VS Code users. Evidence: apps/cli/src/skills.rs:144-200; brief S53.01 marks both missing. Work needed: Add a catalogue command or view that reads GET /api/skills?catalog=all.
- **The brief lists Chrome as missing for the list, and docs/product/surface-feature-matrix.md:368-369 says VS Code and Chrome are absent, but code shows a Chrome Skills menu and a VS Code Skills quick pick.** Affects: Documentation readers, parity tracking. Evidence: apps/extension/src/side_panel.ts:15112-15190; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:220-315; doc: docs/product/surface-feature-matrix.md:368-369. Work needed: Correct the matrix data file and the brief.
- **'Installed' means 'not switched off', so built-in skills never need installing; the brief's 'not yet installed' only covers skills switched off.** Affects: Web, Desktop, Mobile users and testers. Evidence: apps/web/lib/services/skill-catalog-service.ts:150-158; apps/web/app/api/skills/installs/__tests__/skill-installs.test.ts:200. Work needed: Decide the product wording and align labels.
- **Chrome menu lists only non-built-in skills, so built-in skills cannot be picked there.** Affects: Chrome users. Evidence: apps/extension/src/features/cloud-bridge/skillsClient.ts:45; apps/extension/src/side_panel.ts:15165-15167. Work needed: Decide whether built-in skills belong in the Chrome menu (web plus menu also hides them).
- **CLI on/off choices are stored on the device and are not the same as the account's install overrides.** Affects: Developers who use both web and CLI. Evidence: apps/cli/src/skills.rs:95-141; apps/web/lib/services/skill-install-service.ts:89-120. Work needed: Decide whether the CLI should read or write the account overrides.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- api:GET /api/skills
- api:GET /api/skills/installs
- table:user_skills
- table:user_settings
- store:cli-disabled-skills
- store:cli-account-skills
- file:apps/web/lib/services/skill-catalog-service.ts
- F053-04
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts

## Unknown

- Whether the CLI, VS Code and Chrome capability rows deny skills on any plan (rows not opened).
- Whether the mobile drawer has a Skills entry (the drawer file was not found to name one).
- Exact visible text of the Status filter label and the draft label on web (constants referenced by name only).
- Whether migration 0157 is applied in each environment: the file header says it was a draft pending approval (apps/web/db/neon/0157_user_skills.sql:3).
