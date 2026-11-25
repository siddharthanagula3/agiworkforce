---
id: "GAPS-AREA-089"
type: "gap-list"
title: "Gaps: Account and access components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 89. Account and access components

45 open gaps that touch this area. Area page: [20-features/089-account-and-access-components](../../20-features/089-account-and-access-components/README.md).

## GAP-AREA089-LW01

**The Should says blocks use until current Terms are accepted, but mustAcceptTerms returns false when the acceptance read fails and logs 'letting the account through'. A database fault therefore admits an account that may not have accepted current Terms.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-089
- Detail: Area 89. Account and access components
- Evidence: apps/web/lib/server/terms.ts:148-159

## GAP-AREA089-LW02

**The Should lists four identity adapters (password, social, passkey, SSO) behind one interface. The factory has one case, the hosted provider; password is a method on the interface, and no passkey or social adapter was found.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-089
- Detail: Area 89. Account and access components
- Evidence: packages/platform/identity/src/factory.ts:45-48; packages/platform/identity/src/types.ts:105, 233-234

## GAP-AREA089-LW07

**Session listing stops after a fixed number of pages, and the code notes that more sessions may still be live when the limit is reached.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-089
- Detail: Area 89. Account and access components
- Evidence: apps/web/lib/services/deprovision-service.ts:60-61, 98-100

## GAP-F089-01-01

**Brief says adapters cover password, social, passkey and SSO; the code has one provider adapter (Clerk).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-01](../../20-features/089-account-and-access-components/F089-01-sign-in-and-account-standing.md)
- Detail: Affects: All apps; provider independence. Work needed: Add a second adapter or restate the requirement as 'one adapter behind the port'.
- Evidence: packages/platform/identity/src/types.ts:1; factory.ts:47-52

## GAP-F089-01-02

**No record of how each app renders the denial notice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-01](../../20-features/089-account-and-access-components/F089-01-sign-in-and-account-standing.md)
- Detail: Affects: Desktop, Mobile, CLI, VS Code, Chrome. Work needed: Trace each client's handling of ACCOUNT_UNAVAILABLE and add tests.
- Evidence: brief S89.01 lists status n/a for every app

## GAP-F089-01-03

**The status cache TTL and its invalidation on lock/suspend were not read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-01](../../20-features/089-account-and-access-components/F089-01-sign-in-and-account-standing.md)
- Detail: Affects: Time between a lock and its effect. Work needed: Read request-context-cache.ts and document or test the delay.
- Evidence: apps/web/lib/api-auth.ts:245 uses getCachedAccountStatus; its implementation not opened

## GAP-F089-02-01

**The brief and first draft describe revoke-all as ending other sessions; code ends all including this one.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-02](../../20-features/089-account-and-access-components/F089-02-sessions-and-device-sign-in-credentials.md)
- Detail: Affects: Docs and testers; all apps. Work needed: State 'all sessions including this one' in the brief.
- Evidence: apps/web/app/api/settings/sessions/route.ts:243-270

## GAP-F089-02-02

**Heartbeat gating by mode on Desktop, Mobile, VS Code and Chrome not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-02](../../20-features/089-account-and-access-components/F089-02-sessions-and-device-sign-in-credentials.md)
- Detail: Affects: Local mode users. Work needed: Trace each client and add a test.
- Evidence: Only the CLI has an explicit Cloud-mode test (apps/cli/src/device_registry.rs:290)

## GAP-F089-02-03

**Web Security section links to Account instead of listing sessions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-02](../../20-features/089-account-and-access-components/F089-02-sessions-and-device-sign-in-credentials.md)
- Detail: Affects: Web users. Work needed: None required if intended; confirm.
- Evidence: SecuritySection.tsx:111-120

## GAP-F089-03-01

**No recovery entry from Desktop, Mobile, CLI, VS Code or Chrome apps found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-03](../../20-features/089-account-and-access-components/F089-03-account-recovery-through-support.md)
- Detail: Affects: Non-web apps. Work needed: Link those apps to /recover on a locked or sign-in failure.
- Evidence: search for support/recovery found only web and contract files

## GAP-F089-03-02

**Verification steps staff must follow are not encoded in code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-03](../../20-features/089-account-and-access-components/F089-03-account-recovery-through-support.md)
- Detail: Affects: Support operations. Work needed: Point to a runbook under docs/runbooks or add a checklist field [proposed].
- Evidence: completeAccountRecovery has no identity-verification field

## GAP-F089-04-01

**Brief says Terms block use until the current version is accepted; code blocks only never-accepted accounts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-04](../../20-features/089-account-and-access-components/F089-04-profile-preferences-terms-and-consent.md)
- Detail: Affects: All apps. Work needed: Decide the policy, then set the binding revision values or fix the brief.
- Evidence: apps/web/lib/server/terms.ts:20-22, 93-117

## GAP-F089-04-02

**Brief S89.07 lists preferred name and work description as profile fields, but /api/me PATCH cannot write them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-04](../../20-features/089-account-and-access-components/F089-04-profile-preferences-terms-and-consent.md)
- Detail: Affects: Clients wanting one profile call. Work needed: Document the two-step write or extend the endpoint.
- Evidence: apps/web/app/api/me/route.ts:129-132

## GAP-F089-04-03

**Terms read failure lets accounts through.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-04](../../20-features/089-account-and-access-components/F089-04-profile-preferences-terms-and-consent.md)
- Detail: Affects: Terms enforcement during outages. Work needed: Confirm this is intended; it differs from the fail-closed rule in AGENTS.md section 6.
- Evidence: terms.ts:148-160 (comment calls it a notice requirement)

## GAP-F089-04-04

**Per-app Terms and consent UI not traced for Desktop, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-04](../../20-features/089-account-and-access-components/F089-04-profile-preferences-terms-and-consent.md)
- Detail: Affects: Those apps. Work needed: Trace and add tests.
- Evidence: search found a Mobile store and a Desktop test only

## GAP-F089-05-01

**Brief and draft say 'admins' delete; code allows only the owner.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-05](../../20-features/089-account-and-access-components/F089-05-workspaces-personal-and-team.md)
- Detail: Affects: Team admins. Work needed: Correct the brief.
- Evidence: organization/route.ts:490

## GAP-F089-05-02

**Workspace behaviour on CLI, VS Code and Chrome not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-05](../../20-features/089-account-and-access-components/F089-05-workspaces-personal-and-team.md)
- Detail: Affects: Those apps. Work needed: Trace header use and tests.
- Evidence: only CLI policy file seen

## GAP-F089-05-03

**Erasure execution after cooling period not verified here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-05](../../20-features/089-account-and-access-components/F089-05-workspaces-personal-and-team.md)
- Detail: Affects: All team workspaces. Work needed: Read and test the scheduled job.
- Evidence: organization-erasure.ts not opened

## GAP-F089-06-01

**Group and role administration exists only on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-06](../../20-features/089-account-and-access-components/F089-06-members-invitations-groups-and-roles.md)
- Detail: Affects: Desktop, Mobile and other apps. Work needed: Decide scope; add or document web-only.
- Evidence: only team list, invite, role and remove calls found in apps/mobile/src/features/team and apps/desktop/src/api/cloudAccountSettings.ts

## GAP-F089-06-02

**Citation in the first draft pointed at the wrong file for the escalation guard.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-06](../../20-features/089-account-and-access-components/F089-06-members-invitations-groups-and-roles.md)
- Detail: Affects: Documentation accuracy. Work needed: Use the corrected citation.
- Evidence: organization-role-service.ts:86 holds assertPermissionsWithinActor

## GAP-F089-06-03

**Plan limits other than seats not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-06](../../20-features/089-account-and-access-components/F089-06-members-invitations-groups-and-roles.md)
- Detail: Affects: Team plans. Work needed: Trace entitlement checks for roles and groups.
- Evidence: brief says 'not verified in this area'

## GAP-F089-06-04

**Two parallel route families for invitations and members.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-06](../../20-features/089-account-and-access-components/F089-06-members-invitations-groups-and-roles.md)
- Detail: Affects: Maintenance and clients. Work needed: Document which clients use which; consider consolidating [proposed].
- Evidence: team/invitations and organization/invitations both exist

## GAP-F089-07-01

**Retention days is returned as an obligation but no consumer was traced**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-07](../../20-features/089-account-and-access-components/F089-07-workspace-policy-enforcement.md)
- Detail: Affects: Workspace admins who set retention, all apps. Work needed: Trace and test which jobs enforce retentionDays.
- Evidence: organization-policy-evaluator.ts:114-118

## GAP-F089-07-02

**Coverage guard covers only managed-compute routes, not every workspace-data route**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-07](../../20-features/089-account-and-access-components/F089-07-workspace-policy-enforcement.md)
- Detail: Affects: Workspace members, all apps. Work needed: Extend the named-route guard to other gated routes.
- Evidence: workspace-policy-coverage.test.ts:34-43

## GAP-F089-07-03

**Policy editor screen labels and plan requirement not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-07](../../20-features/089-account-and-access-components/F089-07-workspace-policy-enforcement.md)
- Detail: Affects: Admins on web. Work needed: Trace the admin UI and the plan capability for policy editing.
- Evidence: No screen file opened

## GAP-F089-08-01

**No configuration screen or documented flow outside the web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-08](../../20-features/089-account-and-access-components/F089-08-enterprise-sign-in-and-directory-sync.md)
- Detail: Affects: Owners on desktop, mobile, CLI, VS Code, Chrome. Work needed: Decide whether admin configuration stays web-only and say so in product docs.
- Evidence: No UI file found by search

## GAP-F089-08-02

**SCIM POST cannot create accounts or invitations; it only stages users**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-08](../../20-features/089-account-and-access-components/F089-08-enterprise-sign-in-and-directory-sync.md)
- Detail: Affects: Enterprise admins expecting full provisioning. Work needed: Product decision on invitation emails from SCIM.
- Evidence: doc: docs/compliance/directory-sync.md:50-70

## GAP-F089-08-03

**Full list of SCIM error shapes not traced**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-08](../../20-features/089-account-and-access-components/F089-08-enterprise-sign-in-and-directory-sync.md)
- Detail: Affects: Directory integrators. Work needed: Trace each ScimError throw and document.
- Evidence: scim-protocol.ts:63-77 only

## GAP-F089-09-01

**Personal key rotation is reachable only through the support assistant**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-09](../../20-features/089-account-and-access-components/F089-09-service-accounts-and-api-keys.md)
- Detail: Affects: People on web wanting to rotate. Work needed: Add a settings route or confirm the assistant path is intended.
- Evidence: lib/support/actions/executors/regenerate-api-key.ts; no rotate route in api-keys/

## GAP-F089-09-02

**No route that creates a service principal alone**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-09](../../20-features/089-account-and-access-components/F089-09-service-accounts-and-api-keys.md)
- Detail: Affects: Admins. Work needed: Decide whether principal-first creation is needed.
- Evidence: service-principals/route.ts exports GET and PATCH only

## GAP-F089-09-03

**Rate limit on personal create runs after database and step-up work**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-09](../../20-features/089-account-and-access-components/F089-09-service-accounts-and-api-keys.md)
- Detail: Affects: Server cost and abuse. Work needed: Move the rate limit earlier or confirm intent.
- Evidence: api-keys/route.ts:84-120

## GAP-F089-09-04

**Key creation UI absent on desktop, mobile, CLI, VS Code and Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-09](../../20-features/089-account-and-access-components/F089-09-service-accounts-and-api-keys.md)
- Detail: Affects: Those apps. Work needed: Confirm web-only is intended.
- Evidence: Search found only web screens

## GAP-F089-10-01

**Mobile Remote control is switched off in v1**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-10](../../20-features/089-account-and-access-components/F089-10-pairing-a-second-device.md)
- Detail: Affects: Mobile users. Work needed: Enable the flag and verify on a device when the owner decides.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:16

## GAP-F089-10-02

**Initiate returns the legacy 'agiw:' QR data**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-10](../../20-features/089-account-and-access-components/F089-10-pairing-a-second-device.md)
- Detail: Affects: Any host reading qrData directly. Work needed: Return or document the secret-bearing payload.
- Evidence: initiate/route.ts:171; manualPairing.ts:23-26

## GAP-F089-10-03

**No pairing code found in the Chrome extension**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-10](../../20-features/089-account-and-access-components/F089-10-pairing-a-second-device.md)
- Detail: Affects: Chrome users. Work needed: Confirm Chrome is out of scope.
- Evidence: Search of apps for pair routes found no Chrome file

## GAP-F089-10-04

**No file records a real end-to-end run**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-10](../../20-features/089-account-and-access-components/F089-10-pairing-a-second-device.md)
- Detail: Affects: All. Work needed: Run the scenarios on real devices.
- Evidence: Only unit and relay tests found

## GAP-F089-11-01

**No export or deletion entry on mobile, CLI, VS Code or Chrome found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-11](../../20-features/089-account-and-access-components/F089-11-deleting-and-exporting-account-data.md)
- Detail: Affects: Those apps. Work needed: Confirm they link to the web flow or add entries.
- Evidence: Search of non-web files found only the Tauri desktop controls

## GAP-F089-11-02

**Account deletion delay is 24 hours while the doc string calls both periods a cooling period of the same shape**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-11](../../20-features/089-account-and-access-components/F089-11-deleting-and-exporting-account-data.md)
- Detail: Affects: Documentation readers. Work needed: State both periods in one product document.
- Evidence: organization-deletion.ts:4-9 vs delete-account/route.ts:481

## GAP-F089-11-03

**Not all stores are erased; reasons are in code only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-11](../../20-features/089-account-and-access-components/F089-11-deleting-and-exporting-account-data.md)
- Detail: Affects: Compliance reviewers. Work needed: Publish the retained-store list from the manifest.
- Evidence: account-erasure.ts:351-440

## GAP-F089-11-04

**No file records a live erasure run**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-11](../../20-features/089-account-and-access-components/F089-11-deleting-and-exporting-account-data.md)
- Detail: Affects: All. Work needed: Run and record.
- Evidence: scheduled-account-erasure.live.test.ts exists but no recorded result

## GAP-F089-12-01

**Only one operator exists, so the two-person rule cannot operate**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-12](../../20-features/089-account-and-access-components/F089-12-support-staff-access-to-customer-data.md)
- Detail: Affects: Compliance claims. Work needed: Add a second operator or change the control.
- Evidence: doc: docs/compliance/soc2-controls.json AC-04 gap text

## GAP-F089-12-02

**Coverage of 'every read' is not demonstrated: only the background-jobs listing and the customer-managed key path were found using the gate**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-12](../../20-features/089-account-and-access-components/F089-12-support-staff-access-to-customer-data.md)
- Detail: Affects: Customers' workspaces. Work needed: Open the coverage script and map each operator read.
- Evidence: Search for assertSupportAccess and readOperatorContentUnderGrants usage

## GAP-F089-12-03

**Failure to log a read through logAdminDataAccess does not stop the read**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-12](../../20-features/089-account-and-access-components/F089-12-support-staff-access-to-customer-data.md)
- Detail: Affects: Audit completeness. Work needed: Decide fail-closed for operator reads.
- Evidence: apps/web/lib/server/admin-data-access.ts:38-60

## GAP-F089-12-04

**No customer-facing screen to see grants and trail**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F089-12](../../20-features/089-account-and-access-components/F089-12-support-staff-access-to-customer-data.md)
- Detail: Affects: Workspace owners and admins on every app. Work needed: Design and build a view.
- Evidence: No UI file found by search

## GAP-F089-99-NOTBUILT

**Other items in Account and access components: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F089-99](../../20-features/089-account-and-access-components/F089-99-other-items.md)
- Requirement items: S89.25, S89.26
- Detail: CLI: S89.25, S89.26
