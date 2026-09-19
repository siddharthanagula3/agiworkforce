# Production follow-up

Status: Not approved for launch
Owner: Website launch preparation
Last updated: 2026-09-19

| Assertion                           | Local evidence                                                                                                                      | Why production needed                         | Prerequisites / expected evidence                                           | Risk                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------- |
| Intended release served             | Source baseline only                                                                                                                | Hosting differs from dev                      | Approved release SHA and asset identity                                     | Wrong code                          |
| Auth callbacks, sessions, isolation | Local inactive-membership authorization and personal/workspace isolation passed; production callbacks and session policy unverified | Real domain/cookie/provider policy            | Approved test accounts, negative tenant cases                               | Account/data exposure               |
| Correct schema and grants           | Fresh local schema through272 and26 live adapter tests passed                                                                       | Historical recorded prefix is not live status | Read-only migration ledger/checksums, policies; approved migration workflow | Data loss and unavailable features  |
| Streaming, uploads, saved outputs   | Local project upload/revision verified; generation blocked                                                                          | Proxy/storage lifecycle differs               | One minimal end-to-end task with persisted reopening/download               | Lost work                           |
| Billing and external work           | Not verified                                                                                                                        | Webhooks/queues require real config           | Test-mode billing, idempotency and reconciliation evidence                  | Incorrect charges                   |
| Safety findings                     | Frozen audit only                                                                                                                   | Change-dependent schema/egress controls       | Resolve applicable security findings before affected rollout                | Unauthorized egress/erasure defects |
| Jev if adopted                      | Developer helper only                                                                                                               | Privacy, route and budget eligibility differ  | Legal review, evaluated version, kill switch and fallback                   | Cost/privacy/quality                |

After local validation, production smoke tests cover environmental differences, not a redundant
full replay. No production action is authorized by this document. Preserve historical GLOBAL NO-GO.

Membership authorization release prerequisite: apply and independently verify append-only0272_active_membership_authorization.sql on the authorized release environment. Local PostgreSQL reproduces the prior suspended-member permission leak and passes the new canonical probe. Deploy the matching canonical resolver/permission changes together; do not roll back this security correction without explicit review of restored inactive-member access. Production remains unverified.
