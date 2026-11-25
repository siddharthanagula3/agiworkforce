---
id: "F098-09"
type: "feature"
title: "Plugin trust and organization rollout"
aliases: ["Plugin package validator", "Package scanning", "Extension evaluation service", "Organization distribution service", "Publisher identity service", "Workspace plugins", "S98.18", "S98.26", "S98.27", "S98.28", "S98.29"]
area: "98 Integration and extensibility components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S98.18", "S98.26", "S98.27", "S98.28", "S98.29"]
depends_on: ["SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-connectors-plugins-and-skills", "SYS-data-model-and-migrations", "SYS-observability-and-operations", "F098-08", "F098-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F098-09 Plugin trust and organization rollout

Checks before a plugin runs. A package must match its signed digest and have a passing content scan, or install is refused. New permissions need the member's approval. An organization admin can publish plugins to the workspace and set who gets them. Separate publisher identity checking is not built; human review stands in for it.

Area: [98. Integration and extensibility components](README.md). Requirement items: [S98.18](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9818), [S98.26](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9826), [S98.27](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9827), [S98.28](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9828), [S98.29](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9829).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Verifies a plugin package's digest and Ed25519 signature against trusted public keys, scans package text for dangerous patterns with fixed rules, records the verdict by content hash, holds back installs that need new permissions, and lets a workspace admin publish plugins and choose per plugin whether members must have it, get it by default, can choose it, or cannot see it. Community submissions get a human approve, reject or suspend step.

**Why it exists.** Plugins carry instructions and connectors that act with the person's access, so a bad package could leak secrets or act without approval. The checks fail closed so a missing check never reads as a pass. Organizations need a controlled way to roll plugins out.

**Who uses it.** Every person installing a plugin (the checks run silently); workspace admins with the policy.manage permission; platform reviewers who handle community submissions.

**Problems it solves**

- Tampered or unsigned packages being installed.
- Prompt-injection, secret-stealing and destructive text hidden in skill files.
- A plugin update quietly gaining new permissions.
- Organizations unable to push approved plugins to members.

**Use cases**

- A member installs a registry plugin; an unsigned copy is refused with 'is not signed'.
- An admin uploads a plugin archive to the workspace and sets it 'Required'.
- A member uploads their own plugin; a 'review' scan finding needs them to acknowledge it.
- A reviewer suspends an approved community plugin.

## 2. User experience

**Where to find it**

- Web workspace console: 'Plugins' at /workspace/plugins with hint 'Plugins this workspace publishes, and who gets them' (apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:106-111; apps/web/app/workspace/plugins/page.tsx).
- Member side: workspace plugins appear in the plugin directory under the group heading 'From your workspace' or 'From <workspace name>' with states 'Required' and 'Turned off' (apps/web/features/directory/constants.ts:104-118).
- Platform reviewers: plugin moderation admin page with 'Suspend' (apps/web/features/admin/pages/PluginModerationPage.tsx:64-80,308-312).
- Desktop, mobile, CLI, VS Code, Chrome: checks run on the server for web installs. CLI install from a marketplace is checked by the server too. No separate screen on those apps was found.

**Before you start**

- Admin publish needs the workspace permission 'policy.manage' (apps/web/app/api/settings/organization/plugins/route.ts:40,66-70).
- Members need a signed-in account and the workspace to allow plugins.
- Signature checks need at least one public key in the deployment setting PLUGIN_SIGNING_PUBLIC_KEYS; with none, signed installs are refused (plugin-marketplace-service.ts:78-103).

**Screens and controls**

- Workspace Plugins page: publish upload, list 'Workspace plugins', choice labels 'Required', 'Installed by default', 'Available to install', group settings per plugin, and a 'Retire <name>?' confirmation reading 'Every member loses this plugin and its skills at once. Publishing it again brings it back with the same settings.' (WorkspacePlugins.tsx:40-50,236-241,391-393).
- Notice 'Published with a scan finding an administrator accepted.' (WorkspacePlugins.tsx:472).
- Community notice 'Its developer published this plugin to the directory. It was reviewed before it was listed, and it runs with the access you give it.' and status labels 'Submitted for review', 'Listed in the directory', 'Not approved', 'Withdrawn', 'Taken out of the directory' (apps/web/features/directory/constants.ts:121-129).

**Journey**

1. Admin opens Workspace, Plugins and uploads an archive.
2. The server rejects plugins that declare dependencies: 'A workspace plugin cannot declare dependencies. Publish the plugins it depends on to the workspace as well, and choose how members get each one.' (organization/plugins/route.ts:45-46,78-80).
3. The scanner runs; a 'block' verdict refuses the upload; a 'review' verdict needs the admin to acknowledge the content hash (plugin-owned-source-service.ts:85-125).
4. The plugin is stored, a policy audit event is written for each plugin, and the admin sets the install choice and group settings.
5. Members see it in their plugin list; they can turn it off only when it is not 'Required' (organization-plugin-service.ts:408-440).
6. For a registry plugin, the member's install runs integrity, suspension, scan and permission checks before any row is written (plugin-installation-service.ts:303-336).

**What the person sees and gets**

- 409 refusal codes from PluginPackageRefusedError: hash_missing, hash_mismatch, signature_missing, signature_algorithm_unsupported, signature_invalid, scan_missing, scan_blocked, and the review refusal; the message names the plugin and, for scans, the first findings with file and line (plugin-marketplace-service.ts:277-323; packages/client/client-runtime/src/plugins/signature.ts:62-131).
- Message when a member cannot turn off a required plugin: 'Your workspace requires this plugin, so it stays on with all its skills.' (organization-plugin-service.ts:419-421).
- Upload scan messages: 'This package was refused by the content scanner: ...' or 'This package needs review before it can be installed: ...' (packageScan.ts:97-117).

**Settings**

- Workspace install preference per plugin: required, installed_by_default, available, not_available (organization-plugin-service.ts:32-36).
- Group settings per plugin (migration 0327; route apps/web/app/api/plugins/organization/[pluginId]/settings/route.ts).
- Environment variable PLUGIN_SIGNING_PUBLIC_KEYS (public keys only).
- Environment variable AGI_USER_SKILL_AUTHORING set to 0 turns off personal skill authoring (user-skill-authoring.ts:5-9).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Integrity check fails closed on missing digest, missing signature, unsupported algorithm and bad signature; only ed25519 is accepted; the signed payload binds id, version and digest (plugin-marketplace-service.ts:118-164; signature.ts:15-16,62-83).
- A builtin first-party pack is admitted by provenance, since it ships in the build (signature.ts:21-26; plugin-marketplace-service.ts:128-130).
- Content scanner with a versioned rule file; blocking and review severities; verdict recorded per content hash in plugin_package_scans (packageScan.ts:65-95; plugin-marketplace-service.ts:216-252; 0232 line 89-99).
- Install refuses a package with no scan record and any non-pass verdict (plugin-marketplace-service.ts:294-323).
- Permission review: an update that adds a permission disables the installation and marks review_required until approved (plugin-installation-service.ts:321-336; plugin-marketplace-service.ts:710-761).
- Workspace publish, list, update and member preferences (organization-plugin-service.ts:136-440; organization/plugins/route.ts:54-151).
- Personal skills and uploaded plugins are scanned before saving; a blocking finding refuses, a review finding needs acknowledgement (user-skill-service.ts:122-154; plugin-owned-source-service.ts:85-125).
- Community submissions: scan, human approve, reject or suspend (plugin-submission-service.ts:169-418).

**Incomplete**

- Marketplace entries carry no publisher signature; the only gate is the recorded scan of the content hash (plugin-marketplace-service.ts:757-775). registerMarketplaceSource scans the manifest text only (plugin-marketplace-service.ts:855-860), so whether files inside each marketplace plugin are scanned at install is not shown in the code read: unknown.
- hash_mismatch is only reachable when a caller passes the artifact digest; the install and update callers read do not pass it (plugin-installation-service.ts:311; plugin-lifecycle.ts:707), so the check against a downloaded artifact is unit-tested but not used on those paths [inferred].
- 'Extension evaluation' (S98.29) is the static regex scan plus a human decision. No quality or safety test run against a model exists in the sites the brief cites.

**Present but disconnected or switched off**

- Publisher identity verification (S98.26) is marked not applicable anywhere (brief). A founder decision says publisher identity is 'checked in the owner's review of each submission' (doc: docs/decisions/2026-09-27-founder-decisions.md:101-107). Registry entries do verify a signature against configured publisher keys, which is a package check and not an identity record.
- Migration 0232 header says draft and not applied; applied state unknown.

**Not available**

- Plugin dependency use inside workspace plugins: refused (organization/plugins/route.ts:78-80).
- Any automated model-based evaluation of plugins: none found.

## 4. Required behaviour

**Established requirements**

- Plugin packages are validated (manifest, integrity, signature) before they can be installed (S98.18). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.18)
- Publishers have verified identities and installs check a package came from its publisher (S98.26); status 'not applicable anywhere'. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.26)
- An organization can distribute approved extensions to its members (S98.27). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.27)
- Extension packages are scanned for dangerous content and blocked or flagged before install (S98.28). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.28)
- Extensions are evaluated (quality or safety runs) before or after publication (S98.29). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.29)
- Publisher identity is checked in the owner's review of each submission, as ChatGPT's app review does. (source: doc: docs/decisions/2026-09-27-founder-decisions.md)
- Security behaviour fails closed; never weaken validation or guards to make a change pass. (source: doc: AGENTS.md sections 6 and 9)

**Acceptance criteria**

1. An unsigned non-builtin registry plugin cannot be installed and the message says it is not signed.
2. A signature that matches no configured key is refused as signature_invalid.
3. A package whose scan has never run is refused with scan_missing.
4. A package with a 'block' finding cannot be uploaded or installed; a 'review' finding installs only after the content hash is acknowledged.
5. An update that adds a permission leaves the installation off until approved.
6. A member cannot turn off a 'Required' workspace plugin.
7. Publishing a workspace plugin needs policy.manage; without it the route refuses.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Evaluation should include a run against sample prompts to meet 'quality/safety runs' [inferred from S98.29 wording].
- Marketplace plugin files, not only the manifest, should be scanned before install [inferred from S98.28].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass the downloaded artifact digest into the install check so hash_mismatch protects real downloads.
- [proposed] Write the publisher review steps into a runbook under docs/runbooks and record who reviewed each submission, so S98.26 has evidence.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Integrity verdict | `apps/web/lib/services/plugin-marketplace-service.ts` | trustedPluginPublisherKeys (84), verifyPluginPackage (118), assertPluginPackageInstallable (294). |
| service | Signature rules | `packages/client/client-runtime/src/plugins/signature.ts` | Algorithm list, signed payload, verdict messages (lines 1-131). |
| service | Content scanner | `packages/client/client-runtime/src/plugins/packageScan.ts` | scanPluginPackage (65), describePluginScan (97). |
| config | Scan rules | `packages/client/client-runtime/src/plugins/scan-rules.json` | Version 1 rule list: credential reads, env exfiltration, remote code execution, destructive file removal, prompt injection, approval bypass, obfuscated payload, reverse shell and more. |
| service | Permission diff | `packages/client/client-runtime/src/plugins/permissions.ts` | normalizePluginPermissions and diffPluginPermissions; only additions need review. |
| table | plugin_package_scans | `apps/web/db/neon/0232_plugin_package_signing_and_permission_review.sql` | Verdict per content hash; signed-entry constraints; approved and pending permission columns (lines 89-103). |
| service | Scan and record | `apps/web/lib/services/plugin-marketplace-service.ts` | scanAndRecordPluginPackage (216), assertMarketplaceEntryInstallable (763), reviewPermissionChanges (710). |
| service | Owned source scan gate | `apps/web/lib/services/plugin-owned-source-service.ts` | assertOwnedPluginsScanned (85) and content hash (ownedPluginContentHash). |
| service | Organization plugin service | `apps/web/lib/services/organization-plugin-service.ts` | Publish (214), update (306), member list (384), member update (408). |
| endpoint | GET/POST/PATCH /api/settings/organization/plugins | `apps/web/app/api/settings/organization/plugins/route.ts` | Admin list, publish, patch (lines 54, 62, 114); policy.manage gate; audit events. |
| endpoint | Member organization plugin routes | `apps/web/app/api/plugins/organization/route.ts` | Member list of workspace plugins; [pluginId]/route.ts and settings/route.ts for member changes. |
| service | Installed organization skills | `apps/web/features/plugins/server/directory/installed-skills.ts` | listOrganizationSkills turns enabled workspace plugins into the member's skills (from line 105). |
| table | organization_plugins and members | `apps/web/db/neon/0326_organization_plugins.sql` | Workspace plugins and per-member state; 0327 adds group settings. |
| service | Submission service | `apps/web/lib/services/plugin-submission-service.ts` | createSubmission (169), decideSubmission (329). |
| endpoint | Admin plugin submissions | `apps/web/app/api/admin/plugin-submissions/[id]/route.ts` | Reviewer decision route (calls decideSubmission, line 79). |
| endpoint | Plugin lifecycle route | `apps/web/app/api/plugins/[id]/lifecycle/route.ts` | Suspend and related actions (suspend call line 200). |
| service | Personal skill validation | `apps/web/lib/services/user-skill-service.ts` | requireValidDraft (122) runs the scanner on authored and uploaded skills. |
| service | Install policy gate | `apps/web/features/plugins/server/directory/install-gate.ts` | Workspace 'plugins' gate before any install. |
| screen | Workspace Plugins page | `apps/web/features/workspace-console/components/WorkspacePlugins.tsx` | Admin screen for publish, choices and retire. |
| screen | Plugin moderation page | `apps/web/features/admin/pages/PluginModerationPage.tsx` | Reviewer view of versions and Suspend action. |
| test | Scanner tests | `packages/client/client-runtime/src/__tests__/plugin-package-scan.test.ts` | Hostile and benign fixtures (packages/client/client-runtime/src/plugins/__fixtures__). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| On install of a registry plugin the server builds an integrity claim from the stored digest, signature and source. | our servers | plugin-installation-service.ts:311-319 |
| It checks the digest and verifies the signature with Ed25519 against each configured public key; a builtin first-party pack skips the signature. | our servers | plugin-marketplace-service.ts:118-164 |
| It reads the stored scan record by digest; missing or non-pass refuses. | our servers | plugin-marketplace-service.ts:303-322 |
| It compares declared permissions with those the member approved before; an expansion disables the install and raises a review. | our servers | plugin-installation-service.ts:321-336 |
| On workspace publish the archive is parsed, scanned with the same rules, hashed, stored in a transaction, and an audit event is written. | our servers | organization/plugins/route.ts:62-112; organization-plugin-service.ts:214-285 |
| A member's enabled workspace plugins become skills in the skills list. | our servers | installed-skills.ts:105-130 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Scan verdicts and findings per content hash | table:plugin_package_scans | Server only | Upsert on rescan; no deletion found |
| Approved and pending permissions per installation | table:plugin_installations, table:plugin_marketplace_installations | Server only | Cleared on approval (plugin-marketplace-service.ts:792-809) |
| Workspace plugins, files and member state | table:organization_plugins, table:organization_plugin_files, table:organization_plugin_members | Server; every member's app reads them | Retire marks a status; files deletion rules not read: unknown |
| Submissions and their files | table:plugin_submissions, table:plugin_submission_files | Server only | Status changes; no deletion found |
| Trusted public keys | Deployment environment variable PLUGIN_SIGNING_PUBLIC_KEYS | Not applicable | Operator managed; private key is held outside the repository and database (0232 comment) |

**Models and providers.** No model or provider takes part. The scanner is a fixed set of text patterns, not a model. Skills that pass are later used by any model in chat [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for installs; workspace admin role with policy.manage for publishing; platform administrator for moderation. |
| Permissions | policy.manage for workspace publish and patch (organization/plugins/route.ts:40,66-70,119-123); members may change only their own state and never a 'Required' plugin (organization-plugin-service.ts:408-440); reviewers decide submissions. |
| Subscription | none found in the code for the checks themselves. Workspace plugin publishing sits in the workspace console; which plan unlocks a workspace is not read: unknown. |
| Limits and metering | Scan stops at 200 findings and 160-character excerpts (packageScan.ts:41-42). Rate-limit buckets 'settings-org' and 'settings-org-patch' on the admin route; values not read. |
| Feature flags | PLUGIN_SIGNING_PUBLIC_KEYS; AGI_USER_SKILL_AUTHORING (default on). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | The server-side checks do not run in Local mode. The CLI has its own signature module for local plugin installs (apps/cli/src/features/plugins/signature.rs) and a managed policy setting 'requireSigned' (apps/cli/src/features/hooks/managed.rs:34-41); their behaviour was not read: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No trusted keys configured | Signed non-builtin packages are refused as signature_invalid. | plugin-marketplace-service.ts:84-86,154-163 |
| Unreadable configured key | Logged '[plugin-signing] a configured publisher key could not be parsed and was ignored' and skipped. | plugin-marketplace-service.ts:94-99 |
| Scan verdict review on upload | Refused until the content hash is acknowledged; the refusal returns the hashes to acknowledge. | plugin-owned-source-service.ts:109-124 |
| Scan verdict review on a marketplace entry | Refused at install; registration blocks only 'block'. | plugin-marketplace-service.ts:757-775,865-869 |
| Suspended version | Install and enabled-list exclude it; update offers list it as a repair. | plugin-installation-service.ts:148-165,460-468; plugin-lifecycle.ts:592-638 |
| Timeout, retry, offline | Not handled in the code for these checks; they are database reads and local computation. | plugin-marketplace-service.ts:294-323 |
| Accessibility | Group settings list carries aria-labels; full audit not done: unknown. | WorkspacePlugins.tsx:236-241 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/client/client-runtime/src/__tests__/plugin-package-scan.test.ts`: Hostile package refused with reasons, benign passes, review versus block, hidden text, rules compile, reverse shell.
- `apps/web/lib/services/plugin-installation-service.test.ts`: Refusal of unsigned, untrusted, mismatched, unscanned and suspended packages; shipped pack admitted.
- `apps/web/lib/services/plugin-lifecycle.test.ts`: Update requires scan and signature; permission re-approval.
- `apps/web/lib/services/plugin-marketplace-service.test.ts`: Scan recorded against the digest; permission review on refresh.
- `apps/web/lib/services/plugin-owned-source-service.test.ts`: Owned plugin storage and scan gate.
- `apps/web/lib/services/__tests__/plugin-submission-service.test.ts`: Submission flow.
- `apps/web/app/api/settings/organization/plugins/__tests__/route.test.ts`: Admin console access, policy.manage, csrf, dependency refusal, publish with audit.
- `apps/web/app/api/plugins/organization/[pluginId]/settings/__tests__/route.test.ts`: Member settings route.
- apps/web/db/neon/__tests__/plugin-package-signing-migration.test.ts (not found) (not found): Migration 0232 shape (file name in migrations test folder; contents not read).

**Test scenarios**

- **Unsigned package refused**
  1. Insert a published non-builtin registry row with no signature (test database).
  2. Try POST /api/plugins/installations.
  - Expected: 409 with refusal signature_missing; no installation row.
- **Hostile skill upload**
  1. Upload a plugin archive whose skill says to ignore previous instructions.
  2. Observe the response.
  - Expected: Refused as scan_blocked naming file and line; nothing stored.
- **Review finding acknowledgement**
  1. Upload an archive that triggers only a review rule.
  2. Repeat the upload with the returned content hash acknowledged.
  - Expected: First refused with the hash; second accepted.
- **Permission expansion**
  1. Install a plugin.
  2. Publish a version with an extra permission.
  3. Apply the update without naming it.
  - Expected: Update refused; plugin stays on its old version; naming the permission lets it apply.
- **Required workspace plugin**
  1. As admin publish a plugin and set 'Required'.
  2. As a member try to turn it off.
  - Expected: 403 'Your workspace requires this plugin, so it stays on with all its skills.'
- **Admin without policy.manage**
  1. As a member without policy.manage POST to /api/settings/organization/plugins.
  - Expected: Refused with 'Your workspace role does not allow publishing plugins to this workspace.'

**Where to look when it fails**

- Logs: '[plugin-scan] package did not pass the content scanner', '[plugin-signing] a configured publisher key could not be parsed and was ignored'.
- Error names: PluginPackageRefusedError (refusal codes above), PluginPermissionReviewRequiredError, PluginVersionSuspendedError.
- Tables: plugin_package_scans, plugin_installations.review_required, plugin_registry_lifecycle_events, organization_plugins.scan_verdict, plugin_submissions.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No publisher identity record or check** Affects: All plugin installers and reviewers. Evidence: Brief S98.26 not applicable; decision doc says review covers it; registry entries only carry a publisher name and a signature (plugin-registry-service.ts:170-175). Work needed: Write the review procedure as a runbook, store reviewer and date on each approval, and decide whether any identity proof is required.
- **Marketplace entries have no signature and files inside them may not be scanned** Affects: Web and CLI users installing from account marketplaces. Evidence: plugin-marketplace-service.ts:757-775,855-860. Work needed: Scan the plugin files at install, or document that the manifest scan is the whole gate and the permission review is the main control.
- **Artifact digest not passed to the integrity check** Affects: Registry installs and updates. Evidence: plugin-installation-service.ts:311; plugin-lifecycle.ts:707. Work needed: Pass the fetched artifact digest wherever an artifact is downloaded.
- **No quality or safety evaluation run** Affects: Plugin quality for everyone. Evidence: S98.29 sites are scan and human review only (organization-plugin-service.ts:214; plugin-submission-service.ts:169; user-skill-service.ts:122). Work needed: Decide what a run means (sample prompts, cost per run, which model) and build it, or amend the requirement.
- **Migration 0232 may be unapplied** Affects: All installs. Evidence: 0232 header line 4. Work needed: Confirm applied state.

**Depends on**

- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-connectors-plugins-and-skills
- SYS-data-model-and-migrations
- SYS-observability-and-operations
- F098-08
- F098-10

## Unknown

- Whether migration 0232 is applied in each environment.
- Whether files inside marketplace plugins are scanned at install.
- What the CLI signature module and managed 'requireSigned' policy enforce.
- Who the platform reviewers are and the written review steps.
- Retention of retired workspace plugin files and submissions.
- Which plan, if any, unlocks workspace publishing.
- Scan rule coverage beyond the rules read (only the first rules of scan-rules.json were opened).
