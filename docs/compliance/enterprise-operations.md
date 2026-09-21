# Enterprise operations

Status: Current
Owner: Platform lead
Last updated: 2026-09-20

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

| Area       | Surface                                                                   | Who                                                 | What the product enforces                                                                                            |
| ---------- | ------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Tenant     | `/api/settings/organization`                                              | Workspace admin                                     | Membership, ownership transfer and decommission all run through this route tree                                      |
| Domains    | `/api/admin/sso/verify-domain`                                            | Platform operator                                   | `apps/web/lib/server/sso/domain-verification.ts`; a domain is unique only once verified                              |
| SSO        | `/api/admin/sso`                                                          | Platform operator                                   | Connections are linked to Clerk; JIT provisioning is a database-level feature                                        |
| SCIM       | `/api/scim/v2`, tokens at `/api/admin/directory-sync/tokens`              | Platform operator issues the token, the IdP uses it | The full behaviour, including what is deliberately unsupported, is in `docs/compliance/directory-sync.md`            |
| Groups     | `/api/settings/organization/groups`, `/api/scim/v2/Groups`                | Workspace admin, or the IdP                         | A group created by SCIM and one created in the product are the same object                                           |
| Roles      | `/api/settings/organization/roles`                                        | Workspace admin                                     | Every organization-scoped mutating route asks the permission grid, enumerated by `scripts/check-org-permissions.mjs` |
| Policy     | `/api/settings/organization/policy`, `/model-policy`, `/connector-policy` | Workspace admin                                     | 23 declared policy keys, 20 enforced by a server decision, 3 baselined with the file that must change                |
| Connectors | `/api/settings/organization/mcp`, `/connector-policy`                     | Workspace admin                                     | A shared server is an organization-scoped row; disconnect revokes upstream on a best-effort basis                    |
| Audit      | `/api/settings/organization/audit`, `/audit/export`                       | Workspace admin                                     | Audit events are written by the server on the action, not by the surface that requested it                           |

Three limits on that table that a reviewer will ask about:

**Domains and SSO are vendor-administered.** The routes are under `/api/admin`,
which is the platform operator allowlist, not the customer's own admin console.
A customer cannot verify their own domain or configure their own SSO connection
self-serve today. That is a real gap, and it is what "enterprise onboarding is
assisted" means in practice.

**Three policy keys are not enforced by the server.** `code:allowMcpServers`
and `code:allowedMcpServers` cannot be, because a cloud Code session declares no
MCP servers to the server, and `feature:hooks` is published to the client for
the CLI and desktop to honour rather than refused server side.
`scripts/config/workspace-policy-enforcement-baseline.json` records each with
its reason and the file that would close it, and the guard refuses any growth in
that set.

**Customer-managed key rotation is not available.** Workspace key routes are
being built. Do not answer a questionnaire as though a customer can rotate their
own keys.

## 2. Operations matrix

| Area                   | What exists                                                                                                 | Where                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Support contacts       | The billing and procurement contacts on the signed agreement; no named CSM model in code                    | `organization_billing_contracts.billing_contact_*`, `procurement_contact_*` |
| Support severity       | Four levels on a support case: `low`, `medium`, `high`, `urgent`                                            | `SupportCase` in `packages/contracts/types/src/enterprise/index.ts`         |
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
   `ORGANIZATION_SCOPED_TABLES` and deletes the workspace's media objects.
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
- Customer self-serve domain verification and SSO configuration.
- A per-tenant status page or a per-customer incident notification feed.
- Any availability commitment. `/sla` carries targets; this repository holds no
  measured RTO and no third-party attestation.
- SOC 2, ISO 27001 and HIPAA. None exists; `/trust` carries the dated status.

## 5. What a reader should do instead of guessing

If a question about running an enterprise customer is not answered above, the
answer is not somewhere else in this repository: it has not been decided. Record
the decision in `docs/decisions/` and then add the row here.
