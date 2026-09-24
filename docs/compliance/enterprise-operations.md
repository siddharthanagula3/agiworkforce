# Enterprise operations

Status: Current
Owner: Platform lead
Last updated: 2026-09-21

Who administers what in an enterprise workspace, how a customer is run from
go-live to offboarding, and what this product does not do for them yet. The
commercial route a deal takes is `enterprise-procurement-standard.md`; this file
is everything after the signature.

Nothing here is a commitment to a customer. Where a process exists only as a
human one, the row says so rather than naming a system that does not exist.

## 1. Administration matrix

Each row is one thing an enterprise customer administers, the surface it is
administered from, who may do it, and what the product enforces. "Workspace
admin" means an `owner` or `admin` role on the customer's own organization;
"platform operator" means an id on `AGI_PLATFORM_ADMIN_USER_IDS`, which is the
vendor, not the customer. The two are not interchangeable, and
`docs/runbooks/admin-surfaces.md` is the authority on the difference.

The path is not the test of which one a route serves. `/api/admin/sso` and
`/api/admin/directory-sync` are customer routes despite their prefix: each
checks the caller's own role in the named workspace and the caller's own plan
(`apps/web/lib/server/sso/sso-route-guard.ts`,
`apps/web/app/api/admin/directory-sync/directory-sync-access.ts`), never the
operator allowlist. The `/admin` pages are the operator console; the customer
reaches the same panels from Settings, Workspace and from the workspace
console's Identity page (`apps/web/app/workspace/identity/page.tsx`).

| Area       | Surface                                                                   | Who                                               | What the product enforces                                                                                            |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Tenant     | `/api/settings/organization`                                              | Workspace admin                                   | Membership, ownership transfer and decommission all run through this route tree                                      |
| Domains    | `/api/admin/sso/verify-domain`                                            | Workspace owner, on an Enterprise plan            | `apps/web/lib/server/sso/domain-verification.ts`; a domain is claimed by a DNS TXT record and unique once verified   |
| SSO        | `/api/admin/sso`                                                          | Workspace owner writes; an admin may read         | Connections are linked to Clerk; none activates before its domain is verified; JIT provisioning is per connection    |
| SCIM       | `/api/scim/v2`, tokens at `/api/admin/directory-sync/tokens`              | Workspace admin issues the token, the IdP uses it | The full behaviour, including what is deliberately unsupported, is in `docs/compliance/directory-sync.md`            |
| Groups     | `/api/settings/organization/groups`, `/api/scim/v2/Groups`                | Workspace admin, or the IdP                       | A group created by SCIM and one created in the product are the same object                                           |
| Roles      | `/api/settings/organization/roles`                                        | Workspace admin                                   | Every organization-scoped mutating route asks the permission grid, enumerated by `scripts/check-org-permissions.mjs` |
| Policy     | `/api/settings/organization/policy`, `/model-policy`, `/connector-policy` | Workspace admin                                   | 23 declared policy keys, 20 enforced by a server decision, 3 baselined with the file that must change                |
| Connectors | `/api/settings/organization/mcp`, `/connector-policy`                     | Workspace admin                                   | A shared server is an organization-scoped row; disconnect revokes upstream on a best-effort basis                    |
| Audit      | `/api/settings/organization/audit`, `/audit/export`                       | Workspace admin                                   | Audit events are written by the server on the action, not by the surface that requested it                           |

Three limits on that table that a reviewer will ask about:

**Domains and SSO are customer-administered, by the owner.** The workspace
owner creates the connection, publishes the DNS challenge, verifies the domain
and activates the connection; section 5 is the procedure. What the customer
cannot do alone is require it: there is no switch that forces every member
through SSO, and a request that tries to set one is refused as not available
(`UNSUPPORTED_PATCH_FIELDS` in `apps/web/app/api/settings/organization/route.ts`).

**Three policy keys are not enforced by the server.** `code:allowMcpServers`
and `code:allowedMcpServers` cannot be, because a cloud Code session declares no
MCP servers to the server, and `feature:hooks` is published to the client for
the CLI and desktop to honour rather than refused server side.
`scripts/config/workspace-policy-enforcement-baseline.json` records each with
its reason and the file that would close it, and the guard refuses any growth in
that set.

**Customer-managed keys are an API without a screen.**
`/api/settings/organization/keys` provisions, rotates and replaces a workspace
key on an Enterprise plan, and only the primary owner may revoke one
(`apps/web/app/api/settings/organization/keys/keys-access.ts`). No console page
calls it, and provisioning refuses with `CmekProviderUnconfiguredError`
(`apps/web/lib/crypto/cmek.ts`) whenever the deployment holds no client for the
customer's key provider. Until a customer key has been provisioned and rotated
on the production deployment and that run is recorded, do not answer a
questionnaire as though a customer can rotate their own keys.

## 2. Operations matrix

| Area                   | What exists                                                                                                 | Where                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Support contacts       | The billing and procurement contacts on the signed agreement; no named CSM model in code                    | `organization_billing_contracts.billing_contact_*`, `procurement_contact_*` |
| Support channels       | Help centre, email, an in-product ticket, and a live handoff that is off by default                         | `docs/runbooks/support-operations.md`                                       |
| Support severity       | Four ticket priorities, `urgent`, `high`, `normal`, `low`, read as severities `p0` to `p3`                  | `severityForPriority` in `apps/web/lib/support/tickets/types.ts`            |
| Status reporting       | One public status page, the same one for every customer; no per-tenant status feed                          | `apps/web/app/status/page.tsx`                                              |
| Incident notifications | A pager webhook, an incident channel webhook and an out-of-band status mirror, each unconfigured by default | `apps/web/lib/server/incident/pager.ts`, `out-of-band.ts`                   |
| Escalation             | Three levels, `primary`, `secondary`, `everyone`, driven by elapsed minutes                                 | `ESCALATION_LEVELS` in `apps/web/lib/server/incident/on-call.ts`            |
| Release notices        | Public release notes and a changelog; no per-customer advance notice mechanism                              | `apps/web/app/release-notes/`, `apps/web/lib/changelog-entries.ts`          |

The escalation ladder is configuration, not a staffed rotation.
`AGI_ONCALL_ROTATION` is a comma-separated list of responders, the shift
defaults to 168 hours and escalation defaults to 15 minutes
(`DEFAULT_SHIFT_HOURS`, `DEFAULT_ESCALATE_AFTER_MINUTES`). With the variable
unset there is no responder and `responderAt` returns null. What `/status`
publishes about response being best effort during working hours is the true
statement; this ladder is the mechanism that would carry a rotation if one were
staffed.

Three notification paths are unconfigured until their environment variables are
set: `PAGER_WEBHOOK_URL`, `INCIDENT_CHANNEL_WEBHOOK_URL` and
`INCIDENT_OUT_OF_BAND_WEBHOOK_URL`. Each reports `unconfigured` rather than
failing, so a deployment without them dispatches nothing and says so.

## 3. Customer lifecycle

**Go-live.** Billing may not start before an executed agreement:
`assertEnterpriseBillingActivated` rejects with 403 and the sync records an
`activation_blocked_reason`. The order is therefore fixed: agreement authored
and signed, then activation, then the first invoice, which
`assertInvoiceIssuable` refuses if any term is missing.

**Expansion.** A change of seats or terms is a new version of the commercial
agreement, recorded as an amendment or a renewal through
`authorCommercialAgreementVersion`. An existing agreement is superseded, never
edited, so the version that was in force on any past date stays readable. There
is no self-serve seat purchase for an Enterprise workspace.

**Offboarding.** This is planned before onboarding, so it is stated here in
full rather than assembled during a wind-down:

1. The customer exports what they want to keep. The organization-scoped exports
   that exist are audit events
   (`/api/settings/organization/audit/export`), usage analytics
   (`/api/settings/organization/usage-analytics/export`) and a legal hold's
   contents (`/api/settings/organization/legal-holds/[holdId]/export`). There is
   no single "export the whole workspace" endpoint; conversation content is
   exported per account through `/api/user/export`.
2. The workspace owner requests decommission. A 14 day cooling period applies
   (`ORGANIZATION_DELETION_COOLING_PERIOD_DAYS` in
   `apps/web/lib/server/organization-deletion.ts`), during which
   `/api/settings/organization/deletion/cancel` reverses it.
3. After the window, `GET /api/cron/purge-deleted-organizations` calls
   `eraseOrganizationData`, which sweeps the tables in
   `ORGANIZATION_SCOPED_TABLES` and deletes the workspace's media objects. Two
   records outlive it on purpose: the usage ledger is anonymised and the
   enterprise audit trail is kept with its workspace reference set to null
   (`apps/web/lib/server/organization-erasure.test.ts`). An offboarding letter
   that says "every record is erased" is therefore wrong.
4. An active legal hold stops all of it. `isOrganizationUnderActiveLegalHold`
   fails closed: if the hold set cannot be read at all it reports held, because
   erasing under a hold destroys evidence that cannot be recovered. The report
   comes back `blockedByLegalHold: true` and nothing was erased.
5. The contract ends separately from the data. Ending a contract stops it
   writing its terms; it does not delete anything.

## 4. Pilots

**Data ownership.** A pilot is an ordinary workspace under the same terms as any
other. The customer owns what they put in it, and the Order Form and MSA drafts
in `docs/compliance/` are the documents that say so. There is no separate pilot
tenancy, no separate store and no separate retention rule, so a pilot inherits
whatever retention the workspace is configured with.

**Cleanup.** Pilot cleanup is workspace decommission, section 3 above, with the
same 14 day window and the same legal-hold refusal. There is no shorter path and
no "delete the pilot immediately" control, so a pilot that must be gone by a date
has to be requested at least 14 days before it.

**Scope exclusions.** These are out of scope for a pilot because the product
does not do them, not because they were deferred:

- Customer-managed encryption key rotation.
- Requiring SSO for every member of the workspace.
- A per-tenant status page or a per-customer incident notification feed.
- Any availability commitment. `/sla` carries targets; this repository holds no
  measured RTO and no third-party attestation.
- SOC 2, ISO 27001 and HIPAA. None exists; `/trust` carries the dated status.

## 5. Single sign-on and directory setup

This is the procedure an Enterprise workspace follows on its own. Every step is
refused to an account whose own plan is not Enterprise
(`requireSSOAdminAccess` in `apps/web/lib/server/sso/sso-access.ts`, and the
same check in `directory-sync-access.ts`), so the owner's account has to carry
the Enterprise plan before step 1.

1. **Create the connection.** The owner opens the SSO panel (Settings,
   Workspace, or the console's Identity page) and adds a SAML connection, by
   metadata URL or metadata XML, or an OIDC connection, by discovery URL and
   client id. A public mailbox domain is refused, and so is metadata that is
   oversized, carries entity declarations or is not SAML metadata
   (`apps/web/lib/server/sso/idp-metadata.ts`). The connection starts dormant.
2. **Prove the domain.** The panel shows a DNS TXT record for the domain. The
   owner publishes it and asks for verification. A missing record is refused as
   missing, and a resolver outage is reported as retryable rather than as a
   missing record.
3. **Activate.** Activation is refused while the domain is unverified. Once it
   succeeds, the panel shows the service provider values the identity provider
   needs, and the owner enters them there.
4. **Decide who joins on first sign-in.** A connection can provision people on
   their first sign-in through it: an active connection on a verified domain,
   with provisioning switched on, adds a person whose address is on that domain
   as `member` or `viewer`, and adds nobody once the seats are used
   (`apps/web/lib/server/sso/jit-provisioning.ts`).
5. **Connect the directory.** An owner or admin registers directory sync and
   mints a SCIM token; the identity provider then creates, updates and removes
   users and groups. `docs/compliance/directory-sync.md` is the full behaviour,
   including that an owner is never created or removed by the directory and
   that a token stops working when the admin who minted it is no longer an owner
   or admin.

An admin who is not the owner sees the connections and none of the controls
that change them. Requiring SSO for every member is not available, as section 1
says. Tests: `apps/web/app/api/admin/sso/__tests__/route.roundtrip.test.ts`,
`route.hostile-metadata.test.ts`, and
`apps/web/features/settings/sections/team/SSOPanel.test.tsx`.

## 6. Onboarding procedure

The order a new enterprise customer goes through, each step naming what the
product checks rather than what a person promises:

1. **Agreement.** The commercial agreement is authored and executed; billing
   refuses to activate before it (section 3, Go-live).
2. **Workspace.** The customer's owner creates the workspace in Settings,
   Workspace. An account owns one workspace at most. SSO and directory sync
   check the plan of the person using them, so the owner's own account has to
   carry the Enterprise plan; workspace keys check the workspace's plan.
3. **Identity.** Section 5, SSO first, then the directory.
4. **Members.** An owner or admin invites members. With a transactional email
   provider configured (`RESEND_API_KEY` and `AGI_NOTIFICATIONS_FROM_EMAIL`)
   the invitation is emailed to the invited address; without one, the inviter
   is given the link to send themselves
   (`apps/web/app/api/settings/team/invitations/invitation-email.ts`). A
   pending invitation reserves a seat, and revoking it frees the seat at once.
   One known fault: with email configured, the web settings screen
   reports the invitation as failed although it was created and sent, because
   the client accepts only an unsent delivery
   (`TeamInvitationCredentialResultSchema` in
   `apps/web/features/settings/hooks/use-settings-queries.ts`). Check the
   invitation list before inviting the same person again.
5. **Policy.** Features, models, connectors, retention and the spend limit, in
   the console (sections 7 and 8).
6. **Audit.** The audit trail records administrative and policy events from the
   first change; export and SIEM streaming are in the console's Audit page.

Apart from the invitation itself, nothing in this sequence sends an automated
welcome, reminder or lifecycle email. Every other message the customer receives
about onboarding comes from a person.

## 7. Policy reference

The declared policy is `packages/contracts/types/src/enterprise/workspace-controls.ts`;
the list below is that file read on 2026-09-21, and the file wins where they
differ. Every default is the permissive one, so a workspace with no policy row
restricts nothing.

| Key                           | What it governs                                                                                                          | Default                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `featureAccess` (12 features) | Work, Code, Research, Skills, Plugins, Hooks, Browser, Computer use, Remote Control, Schedules, Event triggers, Projects | Every feature on             |
| `defaultModelId`              | The model members start on                                                                                               | None set                     |
| `maxReasoningEffort`          | The highest reasoning level, from `none` to `max`                                                                        | No ceiling                   |
| `allowedCountries`            | Where work may run                                                                                                       | Empty, which is unrestricted |
| `allowedSurfaces`             | Which surfaces the workspace permits                                                                                     | Unset, which is every one    |
| `allowDesktopCloudSync`       | The desktop app syncing Code sessions to the cloud                                                                       | On                           |
| `allowGithubConnection`       | Connecting GitHub or installing the GitHub app                                                                           | On                           |
| `allowMcpServers`             | Code sessions reaching MCP servers at all                                                                                | On                           |
| `allowAutomatedReview`        | The GitHub app reviewing pull requests on its own                                                                        | On                           |
| `allowedMcpServers`           | Which MCP servers a Code session may reach                                                                               | Empty, which is unrestricted |
| `allowedEgressHosts`          | Which network hosts a Code session may reach                                                                             | Empty, which is unrestricted |
| `sessionRetentionDays`        | How long Code sessions are kept                                                                                          | The workspace retention      |

An override may be set for a role, a directory group or a single user, and
where several apply the most restrictive value wins, so an exception can narrow
access but never widen it past the workspace. Three keys are not refused by the
server, for the reasons section 1 gives: `allowMcpServers` and
`allowedMcpServers`, and the Hooks feature, which the CLI and desktop honour
themselves. `scripts/check-workspace-policy-enforcement.mjs` fails when any
other key loses its server decision.

## 8. Connector governance

Connector policy is separate from workspace policy and lives at
`/api/settings/organization/connector-policy`. It holds an allowlist and a
blocklist of catalog connectors, a switch for custom connectors, an allowlist
and a blocklist of plugins, and an allowlist of MCP hosts. Any member may read
it, so a member can see why an integration is missing; only a role with the
policy permission may change it, and every change is audited with the lists it
touched.

How it decides (`apps/web/lib/services/__tests__/connector-policy-evaluator.test.ts`):

- With no policy row, everything is allowed. An empty allowlist is unrestricted,
  not deny-all.
- A named block always wins over an allow.
- A non-empty allowlist refuses whatever it does not name.
- Switching custom connectors off refuses every custom connector, and naming
  one in the allowlist does not escape the switch.
- An MCP host list, when not empty, refuses unlisted hosts and any URL that
  cannot be parsed; `*.example.com` matches subdomains only.
- A personal account is never governed by a workspace's connector policy.

The refusal happens before any credential exchange, so a blocked connector
never reaches its provider. One behaviour a security reviewer will ask about:
when the policy cannot be read, or the workspace cannot be resolved, the gate
**fails open** and allows the connector, and the log records it
(`connector-policy-gate.test.ts`, "fails open when the policy cannot be read").
That is the current design, not an oversight in this document.

Shared connectors are organization-scoped rows. A member who leaves has the
connectors they shared unshared, and removing a connector revokes every
connected account upstream; `apps/web/content/support/connectors-and-mcp.md`
states that to members.

## 9. What a reader should do instead of guessing

If a question about running an enterprise customer is not answered above, the
answer is not somewhere else in this repository: it has not been decided. Record
the decision in `docs/decisions/` and then add the row here.
