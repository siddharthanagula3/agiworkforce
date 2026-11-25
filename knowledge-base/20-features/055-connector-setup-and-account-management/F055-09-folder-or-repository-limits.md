---
id: "F055-09"
type: "feature"
title: "Folder or repository limits"
aliases: ["Folder or repository selection", "Folder limits", "Repository limits", "S55.25", "verified_repositories", "Select repository", "Manage repository access on GitHub"]
area: "55 Connector setup and account management"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S55.25"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-execution-boundaries", "F055-10", "surface:web", "surface:mobile", "surface:cli", "mode:cloud", "table:github_installations", "api:GET /api/github/repositories"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F055-09 Folder or repository limits

The brief says a connector can be limited to chosen folders or repositories. The code read has no such chooser inside connector settings. What exists is narrower: GitHub reaches only repositories the GitHub App installation and the linking person can both see, and Google scopes limit file access. The CLI sandbox limits local server folders.

Area: [55. Connector setup and account management](README.md). Requirement items: [S55.25](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5525).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Intended: restrict what a connector can see to chosen folders or repositories. Found in code: repository access is decided on GitHub when the App is installed, then filtered to a verified list stored with the installation (apps/web/lib/github-install-app-return.ts:170-190, apps/web/lib/user-connector-tools.ts:360-405); file access for Google is capped by reviewed scopes (packages/contracts/cloud-contracts/src/connector-scopes.ts:46-50, 242).

**Why it exists.** Least privilege: an assistant that can read one project should not read a whole drive or every repository (doc: AGENTS.md section 6 minimum data).

**Who uses it.** People connecting GitHub, Google Drive or similar apps, and CLI users running local file servers.

**Problems it solves**

- A member with access to one public repository must not link an organization's private repositories (migration comment in apps/web/db/neon/0188_github_installation_verified_repositories.sql).
- Connectors asking for whole-drive access (forbidden scopes list in connector-scopes.ts:248-260).

**Use cases**

- Install the GitHub App on two chosen repositories at GitHub; the assistant lists only those.
- Pick files with the Google picker for a project instead of granting a full drive.
- Start a local filesystem MCP server with chosen root folders in the CLI.

## 2. User experience

**Where to find it**

- No control named for folder or repository selection exists in Settings, Connectors on Web, Desktop or Mobile in the files read (searched apps/web/features/connectors, apps/mobile/src/features/settings/cloud-connectors).
- Web Code surface: chip 'Select repository' and link 'Manage repository access on GitHub' (apps/web/features/code/code-surface.ts:143, 295).
- Projects, Sources: a Google Drive picker for files (apps/web/features/projects/lib/google-drive-picker.ts).
- CLI: the roots passed as arguments to a filesystem MCP server (apps/cli/src/mcp/mod.rs:654-700).

**Before you start**

- GitHub: connected through the GitHub App install flow and the Code surface available on the plan.
- Drive picker: Google Drive connected and picker keys configured, otherwise status not-configured (apps/web/app/api/connectors/google-drive/picker/route.ts:25-33).

**Screens and controls**

- Code repository chip lists repositories from /api/github/repositories with search, a truncation notice 'More repositories exist. Search to narrow the list.' and the link to manage access at GitHub (apps/web/features/code/code-surface.ts:285-295).
- GitHub connector detail in connectors settings shows an On/Off switch for pull request review per installation, not a repository chooser (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1197-1233).

**Journey**

1. Install the GitHub App and choose repositories on GitHub (outside service).
2. Return to the product; the link step stores the repositories the person can reach.
3. In Code, choose a repository from the list; connector tools act only on those repositories.

**What the person sees and gets**

- Repository list with Private marker; messages 'Repositories could not be loaded.' and 'These installations could not be read:' (code-surface.ts:285-290).
- Message 'This GitHub connection was made before repository access was checked. Reconnect it to list its repositories.' for old links (apps/web/lib/github-app.ts:665).

**Settings**

- None for folder or repository choice inside connector settings.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GitHub installations store verified_repositories and writable_repositories at link time; consumers use only that set, and NULL means list nothing (apps/web/db/neon/0188_github_installation_verified_repositories.sql, apps/web/db/neon/0413_github_installation_writable_repositories.sql, apps/web/lib/user-connector-tools.ts:360-405).
- GitHub connector tools resolve the installation by the repository's full name against the verified set (apps/web/lib/user-connector-tools.ts:395-405).
- Repository catalogue endpoint lists, searches and caps at 500 repositories (apps/web/app/api/github/repositories/route.ts:25-30).
- Google Drive scope ceiling admits drive.file, drive.readonly and drive.metadata.readonly and forbids whole-drive scopes (connector-scopes.ts:46-50, 248-260); the picker route hands the signed-in person's token to the Google picker so they choose files (apps/web/app/api/connectors/google-drive/picker/route.ts).
- CLI: a stdio filesystem server's chosen roots are the writable folders of its sandbox; every other directory argument is read-only (apps/cli/src/mcp/mod.rs:654-700).

**Incomplete**

- Which folder or repository a connector may use is not editable from connector settings after connecting; the GitHub choice is made at GitHub.
- The Google picker belongs to Projects, not to connector limits; it does not restrict later connector calls [inferred from the route and its caller apps/web/features/projects/components/SourcesPanel.tsx].

**Present but disconnected or switched off**

- Connectors are in coming_soon state with 13 released ids (packages/contracts/types/src/connector-release.ts:12-27); GitHub and Google Drive are not in that list, so they cannot be newly connected in the current release state.

**Not available**

- Mobile: no folder or repository chooser found (brief says done; cited lines are connect handlers, apps/mobile/src/features/settings/cloud-connectors/index.tsx:676).
- Web connectors settings: the cited lines apps/web/app/api/connectors/route.ts:522 and useConnectorsSettingsAdapter.tsx:530 are connect and load code, not a chooser.
- CLI: no per-connector limit for account connectors (brief: missing).

## 4. Required behaviour

**Established requirements**

- The user limits a connector to chosen folders or repositories (S55.25). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.25)
- Connectors must include Configure. (source: doc: docs/product/requirements.md section 16.7)
- Collect the minimum data required and apply least privilege. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. After limiting a connector to selected items, a call naming an item outside the selection is refused with a clear message.
2. Changing the selection affects the next call without reconnecting.
3. GitHub: a repository not in verified_repositories is never listed or acted on.
4. An old GitHub link with no verified set lists nothing and asks to reconnect.
5. Google: a connector never requests a scope outside the reviewed ceiling.
6. CLI filesystem server: writes outside its chosen roots fail inside the sandbox.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief item is currently met only in part for GitHub and Google; a selection control inside connector settings is not present [inferred from searches].
- Editing the selection at the provider must be reflected after the next link or refresh [inferred from the migration comment that the set refreshes on every relink].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Repositories' or 'Folders' row to the connector detail page that shows the current scope and opens the provider's manage page.
- [proposed] Show the verified repository count on the GitHub connector detail.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | github_installations | `apps/web/db/neon/0188_github_installation_verified_repositories.sql` | Adds verified_repositories text array; NULL means unproved. |
| schema | writable_repositories | `apps/web/db/neon/0413_github_installation_writable_repositories.sql` | Repositories the linking account can push to. |
| service | linkVerifiedGitHubInstallation | `apps/web/lib/github-install-app-return.ts` | Line 165 onward: stores the verified sets on relink. |
| service | getUserGithubInstallations | `apps/web/lib/user-connector-tools.ts` | Line 360: reads installations with verified and writable lists; resolveVerifiedInstallation at 395. |
| endpoint | /api/github/repositories | `apps/web/app/api/github/repositories/route.ts` | Lists repositories the installations cover, filtered to the verified set. |
| endpoint | /api/github/install/start | `apps/web/app/api/github/install/start/route.ts` | Starts the GitHub App install flow where repositories are chosen. |
| config | connector scope ceilings | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Per-connector reviewed scope list; drive.file at line 242; forbidden scopes list. |
| service | filterConnectorScopes | `apps/web/lib/connectors/oauth-scope-allowlist.ts` | Drops scopes above the ceiling. |
| endpoint | /api/connectors/google-drive/picker | `apps/web/app/api/connectors/google-drive/picker/route.ts` | Returns picker credentials only when configured and the grant is ready. |
| service | Google Drive picker client | `apps/web/features/projects/lib/google-drive-picker.ts` | Opens Google's file picker for Projects sources. |
| component | code surface strings | `apps/web/features/code/code-surface.ts` | Select repository chip and manage access copy. |
| service | CLI sandbox_stdio_transport | `apps/cli/src/mcp/mod.rs` | Line 654: filesystem server roots writable, others read-only. |
| hook | GitHub PR review switch | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Lines 1197-1233: per-installation pull request review switch. |
| test | github installations route tests | `apps/web/app/api/github/installations/route.test.ts` | Installation route behaviour. |
| test | writable repositories migration test | `apps/web/db/neon/github-installation-writable-repositories-migration.test.ts` | Migration shape. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person installs the GitHub App and chooses repositories on GitHub. | outside service | apps/web/app/api/github/install/start/route.ts |
| After return, the server asks GitHub which repositories the linking person can reach and stores lowercased owner/name lists on the installation row. | our servers | apps/web/lib/github-install-app-return.ts:165-195 |
| A chat tool call names owner and repo; the server finds an installation whose verified list contains it, or refuses. | our servers | apps/web/lib/user-connector-tools.ts:395-405 |
| The server then calls GitHub with an installation token and returns the result to the model. | outside service | apps/web/lib/user-connector-tools.ts executeGithubTool (from line 449) |
| CLI: a stdio server starts inside an OS sandbox whose writable roots are the server's chosen roots. | device | apps/cli/src/mcp/mod.rs:654-700 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Verified and writable repository lists | table github_installations | Account level | Refreshed on relink; deleted when GitHub is disconnected |
| Google files chosen in the picker | Projects knowledge, not connector settings | Account level | not established here |

**Models and providers.** No model chooses the limit. The model only sees repositories that pass the filter. GitHub and Google act as outside services.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; GitHub link needs a verified ownership step. |
| Permissions | Limited by what the linking GitHub person can see, and by the Google scope ceiling. |
| Subscription | Repository listing for Code needs a plan that includes managed Code sessions (apps/web/app/api/github/repositories/route.ts:37-38 message). Connectors capability: plan:basic, plan:pro, plan:max, plan:max_15x, plan:team, plan:team_premium, plan:enterprise (billing-catalog.ts:332-351). |
| Limits and metering | Catalogue capped at 500 repositories, 20 pages of 100; cached 60 seconds (repositories/route.ts:25-30). |
| Feature flags | Connector release state coming_soon; GitHub install availability depends on deployment configuration (isGitHubInstallationLinkingAvailable). |
| Model compatibility | none found in the code |
| Provider restrictions | GitHub App configuration is required for GitHub; Google picker needs two configuration values (names GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID). |
| Local mode | Account connectors do not run in Local mode. CLI sandbox roots apply on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Old link without verified set | Lists nothing; asks to reconnect. | apps/web/lib/github-app.ts:665; migration 0188 comment |
| Too many repositories | Truncated with a notice to search. | apps/web/features/code/code-surface.ts:286 |
| Installation unreachable | Named in the list notice. | code-surface.ts:287 |
| Picker not configured | Route answers not-configured. | google-drive/picker/route.ts:25-33 |
| Grant needs reauthorization | Picker answers reconnect-required. | google-drive/picker/route.ts:42-49 |
| Selection changed at GitHub | Takes effect on relink; refresh timing otherwise not established. | migration 0188 comment |
| Offline, retry, cancel, timeout | not handled in the code for a connector-level chooser because none exists | searched connectors features |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/github/installations/route.test.ts`: Installations route.
- `apps/web/app/api/github/installations/route.disconnect.test.ts`: Disconnect of installations.
- `apps/web/app/api/connectors/google-drive/picker/__tests__/route.test.ts`: Picker route states.
- `apps/web/db/neon/github-installation-writable-repositories-migration.test.ts`: writable repositories migration.
- `apps/web/e2e/code-github-repository.spec.ts`: Select repository flow on the Code surface (spec exists; no result recorded here).
- `apps/web/lib/connectors/__tests__/oauth-scope-allowlist.test.ts`: Scope ceilings.

**Test scenarios**

- **Repository outside the verified set**
  1. Link a GitHub installation.
  2. Ask the assistant to read a repository not in the installation.
  - Expected: Tool result says no usable installation or refuses; nothing is read.
- **Old link**
  1. Use a link made before verification (NULL set).
  - Expected: Repository list is empty and the reconnect message shows.
- **Scope ceiling**
  1. Configure a provider entry with a scope above the ceiling.
  2. Start authorization.
  - Expected: The extra scope is dropped and a warning is logged.
- **CLI roots**
  1. Register a filesystem MCP server with one root.
  2. Ask it to write outside the root.
  - Expected: The write fails inside the sandbox.
- **Selection control**
  1. Look in connector detail for a way to change folders or repositories.
  - Expected: Today: none exists; this documents the gap.

**Where to look when it fails**

- Log '[connector-oauth] dropped operator-requested scopes above the documented ceiling'.
- Log '[github] repository catalogue cache read failed'.
- Table github_installations (verified_repositories, writable_repositories).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/055-connector-setup-and-account-management.md](../../70-qa/test-plans/web/055-connector-setup-and-account-management.md)
- Desktop: [70-qa/test-plans/desktop/055-connector-setup-and-account-management.md](../../70-qa/test-plans/desktop/055-connector-setup-and-account-management.md)

## 10. Gaps and dependencies

- **No folder or repository chooser exists in connector settings on Web, Desktop or Mobile, although the brief marks them done.** Affects: Web, Desktop, Mobile. Evidence: brief cites route.ts:522, adapter:530 and mobile index.tsx:676, which are connect code; searches in apps/web/features/connectors and apps/mobile cloud-connectors found no chooser. Work needed: Decide the intended control, build it or correct the brief to partial.
- **Selection cannot be changed in the product after connecting; it needs the provider.** Affects: GitHub users. Evidence: code-surface.ts:295 link to GitHub. Work needed: Document or add a direct manage link on the connector detail.
- **CLI has no limit for account connectors.** Affects: CLI. Evidence: apps/cli/src/lib.rs:7377-7408 only lists and disconnects. Work needed: Not needed until account connectors are usable from the CLI.
- **Google picker and connector limits are separate ideas but share one picker route name.** Affects: Google Drive users. Evidence: picker route returns a token; caller is Projects. Work needed: Document the difference.
- Not built on: Mobile, CLI (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-execution-boundaries
- F055-10
- surface:web
- surface:mobile
- surface:cli
- mode:cloud
- table:github_installations
- api:GET /api/github/repositories

## Unknown

- Whether any mobile or desktop screen limits a connector to folders (not found; searched by name only).
- How the Google picker selection constrains later connector tool calls (not read).
- Whether the GitHub connector detail in the hosted web shows repository counts (only the review switch was read).
- Whether CLI plans to expose account connector limits.
