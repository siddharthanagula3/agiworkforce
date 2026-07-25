# Audit remediation — handoff

Branch: `fix/audit-remediation-2026-07-25` · 19 commits · 246 files · +17,313 / −5,455

Everything below is what a machine could not finish or a person must decide. It is
deliberately short; the reasoning lives in the commit messages.

---

## 1. Run before merging

**The test suites were never executed.** `vitest` cannot start in the environment this
work was done in — `rolldown@1.0.3` ships no `linux-arm64-gnu` native binding and there
was no network to install one. Everything below passed instead:

- `tsc --noEmit` — exit 0 for `apps/web`, `apps/desktop`, `apps/mobile`, `packages/ui/ui`,
  `packages/ui/unified-chat`, `packages/platform/artifacts`, `packages/contracts/types`,
  `packages/contracts/cloud-contracts`
- `eslint` — clean on every touched file
- `prettier` — clean on every touched file
- `apps/mobile` Jest — 1909 passing (2 pre-existing failures, both model-catalog drift,
  neither importing anything changed here)

Highest-risk things to watch on the first real run:

| Area | Why |
|---|---|
| `route.openai-compat-dispatch.test.ts` | connector catalog changed shape (`[]` → `{tools, dropped, limit}`) |
| Four `vi.mock('@/lib/rate-limit')` factories | `route.ts` now imports `acquireManagedTurnSlot` from that module |
| `web-chat-store` consumers | transcripts moved to `messagesByConversation`; `messages` is a derived mirror |
| `artifact-derivation.test.ts` | one test asserted the old fence-pairing bug and was rewritten |
| `ChatMessageList.test.tsx` | one test asserted the `aria-live` defect and was rewritten |

## 2. `git rm` these — the working filesystem could not unlink

Each is a one-line tombstone with every reference already stripped.

```
apps/web/shared/utils/autoCorrection.ts
apps/web/shared/utils/captureTransforms.ts
apps/web/shared/utils/clipboard.ts
apps/web/shared/utils/commandHistory.ts
apps/web/shared/utils/credits.ts
apps/web/shared/utils/ipc.ts
apps/web/shared/utils/navigation.ts
apps/web/shared/utils/security.ts
apps/web/shared/utils/stubs.ts
apps/web/shared/utils/subscriptionGate.ts
apps/web/shared/utils/tokenCount.ts
apps/web/shared/stores/desktop-stubs.ts
apps/web/features/billing/services/token-pack-purchase.ts
apps/web/features/chat/components/Composer/FocusModeButtons.tsx
apps/web/features/chat/components/Composer/InputFooter.tsx
apps/web/features/chat/components/Composer/InputFooter.test.tsx
apps/web/features/chat/stores/chat-preferences-store.ts
apps/web/features/chat/types/agentMode.ts
apps/mobile/src/features/integrations/services/healthData.ts
apps/web/db/neon/0070_account_deletion_scheduling.sql   # renumbered to 0071
```

Also `rm -rf tmp/_fixtool tmp/_to_delete` — scratch tooling and stale git lock files.

## 3. Config and migrations

- **New migrations 0068–0071.** `0068` shared-conversation owner, `0069` RLS on
  `connector_tool_permissions`, `0070` managed-usage cap semantics, `0071` account-deletion
  scheduling. Note `0067` was already duplicated before this work; `0070` now is too until
  the tombstone above is removed.
- **`AGI_E2B_COMPUTE_MICROUSD_PER_SECOND` must be set** or sandbox compute metering stays
  inert and logs a warning each run. No price was invented — the repo's own rules forbid it.
- **Three new cron entries** in `vercel.json`: `reclaim-sandboxes` (hourly),
  `purge-deleted-media` and `purge-deleted-accounts` (daily). Confirm your plan tier allows
  the schedule.
- **New env now enforced in production:** `GITHUB_TOKEN_ENCRYPTION_KEY` and
  `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` throw if missing or not 64 hex chars, and a
  missing critical var now fails startup. `AGI_ALLOW_INVALID_ENV=1` boots anyway, degraded.
  **Verify these are set in production before deploying**, or the deploy will fail closed —
  which is the intent, but you want to find out now rather than at 3am.

## 4. Decisions only you can make

1. **Response style now defaults to brief.** This is the fix for "verbose output is common"
   and it changes shipped behaviour for every user.
2. **Free and local/BYOK tiers get 0 sandboxes and 0 scheduled tasks.** Chosen because both
   paths already 402'd for those tiers, so any non-zero allowance was a fake availability
   badge. If Free should have compute, it needs a ledger that funds it.
3. **Basic tier no longer sees the AGI Work toggle.** The server requires Pro; the client
   was gating on free-trial, so basic users got a control that hard-errored.
4. **`/api/admin/security` is orphaned but fully wired to suspend and ban accounts**, and
   the platform-admin flag it checks is a global superuser bit in Clerk `publicMetadata`
   with no tenant scoping. Left untouched deliberately. Delete it or scope it.
5. **Marketing copy untouched, as instructed.** The claims with nothing behind them are
   listed in `chat-gap-audit-vol2-2026-07-25.md` §Part 3 with file:line refs.

## 5. One Rust change

`apps/desktop/src-tauri/src/sys/account/mod.rs` — delete `report_llm_usage` (~L812-889) and
its registration in `lib.rs` (~L1622). It posts to `/api/llm/v1/credits/deduct`, which does
not exist and should not: client-driven deduction was deliberately retired, and re-creating
a client-names-its-own-amount endpoint would be a security regression. The TypeScript side
is already removed.

## 6. Not built — and why

| Item | Blocker |
|---|---|
| SSO (SAML/OIDC) | Needs a real IdP to validate assertions against, and a WorkOS-vs-direct decision. The config surface exists and stores metadata nothing reads. |
| SCIM 2.0 | Same. `/scim/v2/*` does not exist; the directory-sync webhook returns 501. |
| Tenancy (`tenant_id`) | ~50 tables plus a backfill strategy for existing rows and an RLS rewrite. Everything org-scoped — retention, legal hold, residency, org deletion, org budgets — is blocked on this. |
| Scheduled-work cadence | `/api/cron/run-schedules` fires **once daily, capped at 10 runs platform-wide**, while the UI accepts minute-level intervals. Cron frequency is capped by your Vercel plan, not by code. Until it changes, constrain the UI to what the system can deliver. |
| Org creation | There is still no route that creates an organization. `createOrganization` has zero callers; membership rows require manual SQL. |

The first four were flagged as out of reach before this pass started. The fifth is the one
that makes the rest of the enterprise surface unreachable end to end.
