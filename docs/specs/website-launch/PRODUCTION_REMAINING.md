# Production follow-up

Status: Not approved for launch
Owner: Website launch preparation
Last updated: 2026-09-22

## Current read-only gate check, 2026-09-22

- `https://agiworkforce.com/api/version` reports production commit
  `e353673cce9df114fcfb58fd4c467d4d2dfc4240` and migration `0291`, the
  latest applied release migration; local candidate `0292` is not applied.
  GitHub's `main` points to
  the same commit. The public health endpoint returns 200, and the repository's
  serving-path and API-host verifiers pass against the live domains. This proves
  the public serving path, not an authenticated chat or full migration checksum
  check.
- The local `local/post-launch` checkout is divergent from that production
  commit and has additional committed and uncommitted changes. Its Web UI fixes
  and the local price-removal commit must not be described as deployed.
- The public model catalogue reports the Free plan and one live, admitted
  configured OpenRouter free route. An authenticated localhost Free account displays
  that route and a saved successful response; one older saved Free turn also
  displays a model-empty failure. Selecting Basic from that account opens the
  waitlist/access-code dialog, not checkout. The deployed checkout source
  rejects new paid acquisition without redeemed access. The current public
  catalogue still exposes per-token price fields; the local price-removal
  commit is not deployed. Ninety-four focused
  checkout, portal and Free-chat-policy tests pass. None of this substitutes
  for a fresh production Free send, persisted reload, quota and failure-path
  check.
- The production browser session is expired, so the signed-in production check
  was not performed. The scheduled production-drift [workflow run
  `35725802855`](https://github.com/siddharthanagula3/agiworkforce/actions/runs/35725802855)
  did not start its alarm job: the job has no runner or steps, and its GitHub
  check-run annotation says recent account payments failed or the Actions
  spending limit needs to be increased. The annotation does not distinguish
  those two billing conditions. The repository verifier passes manually, but
  that is not a CI result. The account owner must resolve GitHub Actions
  billing/limit availability and obtain a fresh successful scheduled run before
  using the alarm as release evidence.
- A fresh read-only check on 2026-09-22 found GitHub `main` still at
  `e353673cce9df114fcfb58fd4c467d4d2dfc4240`. The verifier's 25 unit tests
  passed, and both manual commands passed against the live apex and API host:
  `node scripts/verify-deployment.mjs https://agiworkforce.com <main-sha>` and
  `node scripts/verify-deployment.mjs --api-host https://agiworkforce.com`.
  Those checks cover the serving path and aliases only; they neither repair the
  scheduled runner nor prove signed-in Free chat, quota settlement, or uploads.
- Current local static guards `check:free-pools`, `check:money-paths`,
  `check:managed-safety-floor`, `check:plan-tier-predicates`,
  `check:surface-invariants`, `check:structure-conventions`,
  `check:deploy-gates`, and `check:auth-surface` pass. The surface-invariant
  guard initially caught an obsolete shared-menu keyboard exception; that
  exception was removed after confirming the menu now uses `useMenuKeyboard`.
  The auth-surface guard now reports zero recorded audit gaps after device-link
  issuance began recording a non-secret actor/device audit event; 81 focused
  device-link and audit tests pass. Candidate migration `0292` also makes the
  local schema inventory report zero bearer columns; its up/down bodies and
  non-NULL refusal passed rolled-back local database rehearsals; 84 QR/CLI
  device-auth route tests pass. These are local source/test results, not a
  production schema or audit-log write. The free-pools
  guard reports **zero verified promotional entries** among its six
  configured QwenCloud candidates; a passing guard here means unsafe or
  unverified offers stay excluded, not that a QwenCloud fallback is ready.
- The canonical local migration runner reports 272 applied, 20 pending (including
  candidate `0292`), and a checksum drift at `0268_conversation_activation.sql`.
  No migration was applied through that drifted ledger. The `0292` proof was a
  rolled-back SQL rehearsal, not a full ordered migration-chain apply.
- A fresh 11-file local batch passed 212 focused tests across checkout,
  waitlist/access-code redemption, Free-lane admission, managed-usage
  reservation, and idempotency; the Web typecheck also passed. These are
  code-level checks; they do not prove live payment, quota settlement, or a
  production Free send.
- A separate localhost QA send reached the chat API only after the port-3100
  process explicitly allowed its own Clerk origin. It then failed before
  inference with `provider_credentials_rejected`; OpenRouter's read-only
  current-key endpoint returned 401 for the same local key. This QA account is
  paid, so it is not a Free-plan launch test. See the current
  `WEB-FREE-ROUTER-EMPTY-2026-09-22` entry in `ACTIVE_ISSUES.md`. Replace and
  verify the local provider credential before repeating the live Free route;
  do not infer that production uses the same key.

| Assertion                           | Local evidence                                                                                                                    | Why production needed                                                        | Prerequisites / expected evidence                                                                                                                                             | Risk                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Intended release served             | Production currently serves `e353673c`; the divergent local candidate is not deployed                                             | The next candidate and its assets differ                                     | Approved release SHA, deployment promotion and asset identity                                                                                                                 | Wrong code                          |
| Auth callbacks, sessions, isolation | Local inactive-membership authorization and personal/workspace isolation passed; the production browser session expired           | Real domain/cookie/provider policy                                           | Fresh authorized production sign-in, callback and negative tenant checks                                                                                                      | Account/data exposure               |
| Correct schema and grants           | Production version reports `0291`; candidate `0292` is pending and locally rehearsed                                              | Version sequence alone does not prove checksum or grants                     | Check production non-NULL legacy device-token counts, then re-run canonical migration verification and relevant RLS/grant probes before applying the next release             | Data loss and unavailable features  |
| Streaming, uploads, saved outputs   | Local Free account has saved successful text and artifact turns alongside one older empty-response failure; project upload passed | Proxy/provider/storage lifecycle differs                                     | Fresh production Free stream, persisted reload, artifact/file reopen and download, plus an error/retry case                                                                   | Lost work                           |
| Free metering and paid acquisition  | Local checkout/portal/Free policy tests pass; the production Free turn and its settlement are unverified                          | Provider, quota, ledger and webhook behavior differ in production            | Prove Free reservation/settlement and paid waitlist refusal on the release build; keep paid checkout gated, with separate billing cutover evidence before opening acquisition | Lost access or incorrect charges    |
| Safety findings                     | Frozen audit only                                                                                                                 | Change-dependent schema/egress controls                                      | Resolve applicable security findings before affected rollout                                                                                                                  | Unauthorized egress/erasure defects |
| Jev task decisions                  | Developer decision helper worked on this checkout for the device-link audit approach; not a user-facing Web runtime prerequisite  | The release gate is the application behavior, not the agent's selection tool | Keep developer-helper selection separate from product-route qualification; do not count it as a passed production workflow                                                    | Misprioritized development          |

After local validation, production smoke tests cover environmental differences, not a redundant
full replay. No production action is authorized by this document. Preserve historical GLOBAL NO-GO.

Membership authorization database prerequisite completed: migration0272 applied to production on 2026-09-20, followed by canonical checksum verification and inactive-member permission checks. Local PostgreSQL reproduces the prior suspended-member permission leak and passes the new canonical probe. Deploy the matching canonical resolver/permission changes together; do not roll back this security correction without explicit review of restored inactive-member access. The database change is verified; application behavior on the deployed release still needs production smoke testing.

Production migration recovery and verification evidence: [deployment handoff](../../work/deployment-handoff-2026-09-19.md). That September 20 handoff records an object-storage backup release gap; its current state was not reverified in this read-only pass.

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
