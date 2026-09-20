# Production follow-up

Status: Not approved for launch
Owner: Website launch preparation
Last updated: 2026-09-19

| Assertion                           | Local evidence                                                                                                                                  | Why production needed                         | Prerequisites / expected evidence                                                                                                                                             | Risk                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Intended release served             | Source baseline only                                                                                                                            | Hosting differs from dev                      | Approved release SHA and asset identity                                                                                                                                       | Wrong code                          |
| Auth callbacks, sessions, isolation | Local inactive-membership authorization and personal/workspace isolation passed; production callbacks and session policy unverified             | Real domain/cookie/provider policy            | Approved test accounts, negative tenant cases                                                                                                                                 | Account/data exposure               |
| Correct schema and grants           | Local ledger currently has272 applied,0273 pending and a checksum drift at0268; earlier through272 adapter/authorization probes remain retained | Historical recorded prefix is not live status | Resolve or explicitly account for the local drift, review/apply append-only0273 through the approved workflow, then read-only verify production ledger/checksums and policies | Data loss and unavailable features  |
| Streaming, uploads, saved outputs   | Local project upload/revision verified; generation blocked                                                                                      | Proxy/storage lifecycle differs               | One minimal end-to-end task with persisted reopening/download                                                                                                                 | Lost work                           |
| Billing and external work           | Not verified                                                                                                                                    | Webhooks/queues require real config           | Test-mode billing, idempotency and reconciliation evidence                                                                                                                    | Incorrect charges                   |
| Safety findings                     | Frozen audit only                                                                                                                               | Change-dependent schema/egress controls       | Resolve applicable security findings before affected rollout                                                                                                                  | Unauthorized egress/erasure defects |
| Jev if adopted                      | Developer helper only                                                                                                                           | Privacy, route and budget eligibility differ  | Legal review, evaluated version, kill switch and fallback                                                                                                                     | Cost/privacy/quality                |

After local validation, production smoke tests cover environmental differences, not a redundant
full replay. No production action is authorized by this document. Preserve historical GLOBAL NO-GO.

Membership authorization release prerequisite: apply and independently verify append-only0272_active_membership_authorization.sql on the authorized release environment. Local PostgreSQL reproduces the prior suspended-member permission leak and passes the new canonical probe. Deploy the matching canonical resolver/permission changes together; do not roll back this security correction without explicit review of restored inactive-member access. Production remains unverified.

Browser-first discovery added production-facing prerequisites without authorizing a deployment:

- Resolve the signed-in Enterprise owner audit-trail authentication failure before relying on audit
  export or SIEM claims.
- Reconcile effective workspace policy and clarify SSO support versus mandatory SSO across the
  overview, policy, identity and public Pricing surfaces. The earlier claim that Identity marks
  deprovisioning unavailable was incorrect; verify real IdP lifecycle separately.
- Assess whether the routing-only Hosted Operational signal needs execution health or clearer
  scope. A historical failed chat does not establish a current outage. Configure and verify the
  external status mirror and incident notification path.
- Set production-safe TOTP, custom-connector, GitHub and pseudonymization secrets and verify local
  OAuth callbacks no longer point to the production host before further localhost authorization
  testing.
- Verify error reporting, trace export, paging, transactional email, browser push and support
  handoff in their authorized release environments; they are disabled in the current local runtime.
- Provider credits still block a fresh successful Luna/Work response and persisted-output smoke.
  Existing plan-limit and Max15× ratio evidence does not replace that production execution check.
