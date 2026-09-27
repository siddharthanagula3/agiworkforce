# Checklist secondary verification

Date: 2026-09-18
Primary audit reviewed: `checklist.audited.md`
Primary audit baseline: `eb09a3242`
Secondary review baseline: current working tree at `2b3dca5caeb37342433160d340c42f6d8f2c0e08`

## Verdict

The primary audit is structurally complete, but it is not reliable enough to use as a completion ledger. Its `[x]` population contains reproducible false positives, evidence that depends on explicitly unapplied migrations, invalid evidence paths, and claims whose own evidence says they were not confirmed.

Treat the primary audit as a triage draft. Do not derive launch readiness, implementation completeness, or remediation priority directly from its status counts until the affected `[x]` items are reclassified.

## Structural checks

The source and audited checklist each contain 24,765 checklist items across 50 `Part` headings. Every audited item has an inline evidence comment.

Primary audit status totals:

| Status           | Count |
| ---------------- | ----: |
| Done `[x]`       | 9,914 |
| Partial `[~]`    | 5,696 |
| Missing `[ ]`    | 6,583 |
| Unverified `[?]` | 2,572 |

The current repository no longer matches the claimed audit baseline:

- 126 committed paths changed between `eb09a3242` and current `HEAD`.
- The current working tree reports 351 changed or untracked status entries.
- The audit must therefore name an immutable baseline and cannot also be treated as current-state evidence.

## Blocking findings

### P0: 262 done items cite migrations explicitly marked not applied

At commit `eb09a3242`, 72 forward migrations contained `NOT YET APPLIED`. The audit marks 262 items `[x]` while citing 32 of those draft migrations as completion evidence.

This conflicts with the audit's own treatment of other draft migrations as only partial. Source code and an unapplied schema draft may establish implementation intent, but they do not establish an operable feature.

Representative examples:

- Audited line 62 marks usage accounting done from `0182_managed_usage_microusd_ledger.sql`.
- Audited line 140 marks custom roles done from `0200_organization_permission_grid.sql`.
- Audited line 142 marks subscription/billing ownership done from `0163_enterprise_billing_contracts.sql`.
- Audited line 260 marks usage done from `0182_managed_usage_microusd_ledger.sql`.
- Audited line 47,866 marks external-action traceability done from `0223_connector_call_events.sql`, although that migration says at line 4 that it is a draft pending approval.

Required correction: downgrade these items to partial unless independent evidence proves the feature works without the draft migration or repository policy explicitly defines `done` as source-complete rather than deployable.

### P0: foundational universal claims have direct counterexamples

The following early `[x]` items generalize from one example instead of checking the universal claim:

1. `Every feature has one canonical capability ID` is marked done from `PlatformCapability`. The closed union currently contains 28 broad surface capabilities, not an ID for every feature in this checklist.
2. `Every persistent object has one canonical globally unique ID` is marked done from the `organizations` convention. `organization_members` has only the composite key `(organization_id, user_id)` in `0015_organizations.sql:10-18`.
3. `Every persistent object has creation timestamp` is marked done from a convention. `connector_tool_permissions` in `0008_connectors.sql:1-11` has `updated_at` but no creation timestamp.
4. `Every mutable object has update timestamp` is marked done from another migration's trigger. `organization_members.role` is mutable, but the table in `0015_organizations.sql:10-18` has no update timestamp.
5. `Every client receives capability information from shared contracts` cites only the web capability service and `/api/me`; that evidence does not cover Desktop, Mobile, CLI, VS Code, or Chrome.

Required correction: these items are partial until an exhaustive schema/registry guard proves the universal condition.

### P0: concrete feature claims are marked done when the implementation is absent

#### Draft pull request

Audited line 66,534 marks `draft PR` done while its own comment says the draft flag was not confirmed. `createGitHubPullRequest` sends `title`, `body`, `head`, and `base`; it does not send GitHub's `draft` field (`apps/web/lib/github-app.ts:769-804`).

Required correction: mark missing, or partial only if ordinary PR creation is intentionally credited separately.

#### Asynchronous Stripe webhook processing

Audited line 125,086 marks `async processing` done while admitting processing is not deferred. The route awaits `dispatchStripeEvent` inside the request transaction before returning (`apps/web/app/api/stripe-webhook/route.ts:72-99`).

Required correction: mark missing. JavaScript `async` syntax is not background or queued webhook processing.

#### External-action traceability

Audited line 47,866 marks traceability done using `0223_connector_call_events.sql`. The migration itself states that it is not applied and explains that, before this table, connector tool invocation details were not recorded (`apps/web/db/neon/0223_connector_call_events.sql:4-15`).

Required correction: mark partial at most until the migration is applied and the write path is verified.

#### macOS clean installation

Audited line 176,306 marks the macOS `clean installation` item done from a Linux clean-install job and then says no macOS equivalent was found.

Required correction: mark unverified or missing for macOS.

### P1: 387 done items require manual re-review under objective evidence rules

A static integrity pass found 387 unique `[x]` items in one or more suspect categories:

| Category                                                                                         | Affected done items |
| ------------------------------------------------------------------------------------------------ | ------------------: |
| Cites a baseline migration marked `NOT YET APPLIED`                                              |                 262 |
| Uses hedged evidence such as `likely`, `implies`, `presumably`, `unverified`, or `not confirmed` |                  51 |
| Cites a file path absent from both the audit commit and current working tree                     |                  76 |
| Unique items across those categories                                                             |                 387 |

These are candidates for re-review, not an assertion that all 387 are false. A done result, however, cannot be supported solely by a missing path, an explicitly draft schema, or an inference the evidence text says was not confirmed.

The missing-path set contains 40 distinct file references across 76 done items. Examples include:

- `services/signaling-server/src/metrics.js` where the repository file is `metrics.ts`
- `apps/web/lib/server/scim/__tests__/scim-sync-resilience.test.ts`
- `scripts/release/ios-prod.sh`
- `scripts/release/verify-privacy-declarations.mjs`
- `docs/CHROME_EXTENSION_PUBLIC_RELEASE_AUDIT.md`

There is also an out-of-range evidence pointer: audited line 129,892 cites `0163_enterprise_billing_contracts.sql:429`, while the baseline file has 118 lines.

### P1: evidence strength does not match claim scope

Many done decisions use existence as proof of completeness. Examples include treating one ledger as proof that every billable operation is metered, one API route as proof that every client receives capabilities, or a test filename as proof of behavior without reading or running the test.

For claims containing `every`, `never`, `all`, isolation, authorization, billing, deletion, or trust-boundary language, acceptable completion evidence should be one of:

- an exhaustive registry or generated contract;
- an enforced repository guard covering all owners;
- a schema constraint or database policy;
- focused tests that exercise the negative and cross-tenant cases;
- a traced set of all call sites with no uncovered path.

A representative file or a repository-wide text search is insufficient for those claims.

## What passed secondary verification

- Item preservation is exact: 24,765 source items and 24,765 audited items.
- The 50 part headings are preserved.
- Every audited checklist item includes an inline evidence comment.
- The four audit states are used consistently at the formatting level.
- The audit clearly states its original commit baseline and legend.

These checks establish document completeness, not correctness of the 9,914 done decisions.

## Required remediation before relying on the audit

1. Freeze an immutable repository baseline after the current dirty work is resolved.
2. Define `done` precisely. Recommended: committed owner code, all required migrations applied in the target environment, focused tests present and passing, and no unresolved external-console dependency.
3. Automatically reject `[x]` evidence that references an absent file, an out-of-range line, or a migration marked `NOT YET APPLIED`.
4. Downgrade the 387 suspect done items for manual re-review, then independently verify the high-risk domains first: identity, authorization, tenant isolation, deletion, billing, tool approvals, trust boundaries, and release integrity.
5. Require exhaustive evidence for universal claims and negative safety claims.
6. Record the exact commands and test results used for each verified section. The primary audit records evidence comments but no executed-test ledger.

## Secondary verification conclusion

The primary audit is useful as a repository index and gap-discovery artifact. It is not yet an independent verification of implementation completeness. The current done count of 9,914 should be considered provisional; at least 387 done entries require re-review, and the concrete false positives above should be corrected before any launch-readiness decision uses this document.
