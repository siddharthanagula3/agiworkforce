# Release Readiness: Single Source of Truth

Status: ACTIVE, release-execution session
Owner: Release lead (orchestrator)
Branch: `release/readiness-2026-08-25`
Last updated: 2026-09-07

The one consolidated task list for taking every supported app to public release.
It supersedes the scattered control docs; every item here is grounded in code,
git, or a live run. Supported surfaces: **web, mobile, desktop, CLI, VS Code
extension, browser extension, backend services + shared packages.**
The Slack and GitHub apps are future surfaces, OUT OF SCOPE.

Guiding lens (founder): ship functional, stable, polished, secure. Fix what is
broken before building what is merely missing; defer/document speculative work.

---

## Build & health evidence (live runs this session)

| Check                                                    | Result                                               |
| -------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm build` (turbo, all but desktop)                    | GREEN, 40/40 tasks; web compiled in 60s              |
| `pnpm typecheck:all`                                     | GREEN, 0 TS errors                                   |
| `pnpm check:llm-operability`                             | GREEN, full chain EXIT 0 (re-run after every slice)  |
| `cargo check --workspace`                                | GREEN                                                |
| `cargo test -p agiworkforce-desktop --lib` (macOS local) | 6 macOS-keychain-local fails only; GREEN on Linux CI |
| Security review (2 waves, adversarial)                   | 7 findings: 0 high (after downgrade), 5 med, 2 low   |

---

## Security review outcome (2026-08-26, adversarially verified)

New-since-PR#416 code (workspace/platform admin consoles, audit/SIEM streaming +
cron, plugin directory, enterprise verification) came back **clean** under a
dedicated adversarial pass, a real result, not a coverage gap.

| ID    | Finding                                                            | Sev | Status                                                        |
| ----- | ------------------------------------------------------------------ | --- | ------------------------------------------------------------- |
| W1-01 | prompt-injection → auto-approved code exec in network-open sandbox | med | FIXED `7f80f8b21` (sandbox egress contained; unattended deny) |
| W1-03 | connector OAuth open redirect (tab/newline smuggling)              | med | FIXED `998119a06` (F1)                                        |
| W2-01 | signaling-server trusts leftmost XFF → cap/limit/blacklist bypass  | med | FIXED `1a9759610` (F6)                                        |
| W1-05 | `/tasks` protected but no server-side auth                         | low | FIXED `e13298dd6` (F5)                                        |
| W1-02 | SCIM cross-tenant membership → platform-wide forced logout         | med | DECISION (F2), see checklist                                  |
| W1-04 | per-unit quota TOCTOU (bounded 7–11 req)                           | low | DECISION (F4), needs Postgres run                             |
| W2-02 | Chinese-HQ provider consent gate not enforced server-side          | med | DECISION (F7), partial; changes paid routing                  |

Patch files: `CLAUDE-SECURITY-20260826-{WAVE1-web,WAVE2-server}/patches/`. F3 was
rejected and superseded by the W1-01 commit above.

---

## Tier 0: Blockers (all founder-only)

| ID      | Title                                                                                                             | Status | Evidence / action                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| REL-002 | GHA production deploy dead since 2026-08-09 (missing `VERCEL_TOKEN` + `AGI_DATABASE_URL` in `production-web` env) | MANUAL | `scripts/founder/provision-deploy-environments.sh` automates it, export the values, run it. See checklist. |
| REL-010 | Chrome extension has no stable CRX key → cloud sign-in breaks each rebuild                                        | MANUAL | set `CHROME_EXTENSION_PUBLIC_KEY` in the ext build env                                                     |
| REL-011 | Free-tier/spend-cap enforcement depends on migrations 0065/0066 applied in prod                                   | MANUAL | query prod for `extend_managed_usage_request_provider_step`; apply 0065→0066 if absent                     |

---

## Active autonomous backlog (in progress, no founder needed)

| ID      | Title                                                                                                                                                                                      | Surface   | Impact               | Auto?  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | -------------------- | ------ |
| REL-073 | Vacuous CI test tier, `Test Priority Levels 3-4` (and level-2) pass without running any test (fake gate)                                                                                   | ci        | high-integrity/minor | yes    |
| REL-074 | Stale doc cleanup, `docs/remediation/{register.json,WAVES.md}`, `docs/agent-context/HANDOFF.md`, `docs/current/gap-audit-2026-08-08.md`, and the 3797-line `known-flaws.md` are superseded | docs      | cleanup              | yes    |
| REL-076 | Stale code comments citing deleted docs (UNIFIED_LAUNCH_PLAN/PLAN.md sections, ExecutionPlan.md, PUBLIC-ALPHA-CUTOVER, AUDIT-FIX/SYS-21 ticket tags) across web/desktop/mobile/packages    | multi     | cleanup              | yes    |
| REL-077 | Incident-response health-probe cron still daily; project is on Pro so it can tighten                                                                                                       | web/infra | minor                | yes    |
| REL-078 | CodeQL: committed `codeql-config.yml` is inert (default setup ignores it), delete or document                                                                                              | ci        | minor                | manual |

---

## Wire-or-cut: built but unmounted (founder decides; git preserves either way)

Each is a fully-built surface with zero live importers/mount points. Decision:
wire it in, or cut it for release. None is currently reachable by users.

- Desktop: `agent-collaboration`, `background-tasks`, `simple-mode`, `ArtifactsGallery`/`ArtifactCategoryFilter`, `MCP*` manager UIs, `TitleBar`, checkpoint Tauri commands, `local-llm` (llama-cpp-2) feature, `DocumentWorkspace`/PDFViewer, Discord/Signal/Telegram + Gmail OAuth messaging clients.
- Web: `MaxUpgradePrompt`, in-progress media cards (`ImageGenCard`/`VideoGenCard`), offline message queue (consumer/UI built, zero producers), built `403`/`session-expired` pages not linked from the flows that trigger them, `founder`/`blog` pages absent from nav + hard-coded off.
- Mobile: `InviteCodeModal` (REL-069), billing/connector placeholders behind disabled flags.

---

## Open launch items folded in from the remediation register (2026-09-07)

The remediation register and the audit remediation ledger were merged into
`docs/agent-context/known-flaws.md` and deleted. That register is a code-defect
register, so the launch-readiness items those two files carried, the ones whose
blocking fact lives in a dashboard, an account or a store console rather than in
this repository, land here instead. Ids are the originals so older citations
still resolve by search. Items already tracked above as `REL-002`, `REL-010`,
`REL-011`, `REL-016`, `REL-019` and `REL-077`, and the R2 public-bucket and
sandbox-origin items already in the manual checklist, are not repeated. Pure
status assertions with no action, and items confirmed done on 2026-09-07, were
dropped rather than copied.

### Billing and Stripe

| ID      | Action                                                                                                                                           | Owner    | How to confirm                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| BILL-01 | Take the production Stripe account out of test mode and reconcile the live Price catalogue with the prices the pricing page publishes.           | Founder  | Stripe Dashboard in live mode lists an active Price for every plan the pricing page shows.                 |
| BILL-02 | Create the four missing Price ids and set their environment variables, so Team checkout stops failing closed.                                    | Founder  | The four price variables are set in the production environment and a Team checkout reaches Stripe.         |
| BILL-03 | Set the Stripe Tax dashboard preconditions the code already assumes: origin address, tax registrations, product tax codes.                       | Founder  | Stripe Tax shows a registration for each jurisdiction sold into, and a test checkout returns non-zero tax. |
| BILL-38 | Decide what happens to the two INR prices above the RBI Rs 15,000 e-mandate ceiling: a lower price, manual renewal, or no INR sale at that tier. | Founder  | Every published INR price is at or under the ceiling, or the tier is documented as manual renewal.         |
| BILL-40 | Create active INR Stripe Prices, or stop publishing INR pricing.                                                                                 | Founder  | Stripe lists an active INR Price for each plan the pricing page shows in INR.                              |
| BILL-43 | Answer the Razorpay sales and tax questions before any Razorpay code is written.                                                                 | Founder  | A written decision names the merchant of record and how GST is collected.                                  |
| BILL-45 | Prove the pre-execution credit reservation sweep runs in production. The migrations are applied; the cron cadence is what is unverified.         | Operator | The cron log shows the credit reconciliation running and clearing stale reservations.                      |
| BILL-46 | Redeploy production so the configured managed video generation storage takes effect, then verify one generation end to end.                      | Operator | A video generation completes and its file is readable from the configured bucket.                          |

### Stores and release credentials

| ID       | Action                                                                                                                                         | Owner   | How to confirm                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| MOB-02   | Complete the iOS Issuer ID and the Android Play Console setup that block store submission.                                                     | Founder | App Store Connect shows an API key with an Issuer ID, and the Play Console holds a created app record.                 |
| MOB-07   | Create the store in-app-purchase products the built native path expects, and finish the tax and banking paperwork. Product ids are `REL-016`.  | Founder | Both stores list the product ids the app requests and each shows a submittable state.                                  |
| MOB-15   | Produce a signed mobile build and confirm cloud sign-in and iOS launch on it.                                                                  | Founder | A signed build installs on a device and reaches a signed-in cloud chat.                                                |
| MOB-18   | Certify the newest iOS and Android device matrix. It cannot be done without hardware.                                                          | Founder | A recorded run on each device class in the matrix.                                                                     |
| MOB-29   | Replace the dangling review-notes reference and the literal founder-phone placeholder in the store listing metadata.                           | Founder | The store listing shows a real contact number and no placeholder text.                                                 |
| INFRA-17 | Provision publishing credentials and environments for the five release surfaces that have none.                                                | Founder | Each release workflow has a GitHub environment holding its publishing credential.                                      |
| SEC-39   | Escrow the desktop updater signing key offline and name a recovery holder. Both copies that exist today are day-to-day copies.                 | Founder | The custody inventory in `docs/security/security.md` section 4 has no unfilled row and the restore drill has been run. |
| INFRA-19 | Add the mobile release workflow's missing store artefacts: privacy manifest, data-safety form, device matrix, phased rollout, crash telemetry. | Founder | The Play Console data-safety form is submitted and App Store Connect accepts the privacy manifest.                     |

### Vendor and provider configuration

| ID       | Action                                                                                                                                | Owner    | How to confirm                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| CONN-04  | Ask the six MCP vendors that refuse dynamic client registration for a registered client, or drop those connectors from the catalogue. | Founder  | Each of the six either holds client credentials in the operator configuration or no longer lists as connectable. |
| INFRA-42 | Store an account-scoped Cloudflare token so the R2 CORS policy can be reapplied from the repository.                                  | Founder  | The token exists in the deployment environment and the CORS apply step runs.                                     |
| INFRA-21 | Remove the vestigial `gateway.agiworkforce.com` alias. Checked 2026-09-07: it still resolves and answers 404.                         | Operator | The hostname no longer resolves.                                                                                 |
| DPDP-57  | Confirm the Vercel and Neon log retention windows against the investigation window the breach runbook assumes.                        | Founder  | Each vendor's retention setting is recorded beside the window the runbook assumes.                               |

### Infrastructure

| ID       | Action                                                                                                                                                                                   | Owner    | How to confirm                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| INFRA-04 | Configure a repository ruleset on main: required review, a required CI check, no force push, no deletion. Checked 2026-09-07: the rulesets list is empty and main carries no protection. | Founder  | The repository rulesets page lists a rule targeting main, and an unreviewed push to main is refused. |
| INFRA-43 | Turn on object-bucket versioning. The restore runbook exists, but the bucket keeps no versions to restore from.                                                                          | Operator | The bucket settings show versioning enabled.                                                         |
| INFRA-51 | Schedule the video-generation reconciliation sweep. It exists and nothing runs it, so an abandoned job stays queued and fully billed.                                                    | Operator | A cron entry invokes the sweep and the cron log shows it running.                                    |
| INFRA-54 | Provision error tracking for the signaling server, which reports to nothing today.                                                                                                       | Operator | The signaling service reports to an error tracker and a test error arrives.                          |

### Compliance

| ID      | Action                                                                                                                                              | Owner   | How to confirm                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| DPDP-04 | Decide the verifiable parental consent mechanism. Web has no age gate and the mobile one is self-declared and clearable by the child.               | Founder | A written decision names the mechanism, and the gate cannot be cleared by the child alone.     |
| DPDP-22 | Determine Significant Data Fiduciary status. If notified, a named India data protection officer, a DPIA and an independent audit are all required.  | Founder | A written determination exists, with the officer named and an audit plan if the answer is yes. |
| DPDP-23 | Name an individual Grievance Officer, confirm the notice address, and create the privacy and grievance mailboxes.                                   | Founder | The published notice names a person and mail to both addresses is delivered.                   |
| DPDP-26 | Have counsel review the breach-notification templates, which are engineer-drafted from statute. The steps are in `docs/work/founder-assistance.md`. | Founder | The runbook header names the reviewing counsel and the pre-send notices are gone.              |
| DPDP-32 | Verify enterprise single sign-on against a live SAML instance and a live OIDC instance. It is marketed and has never been tested against either.    | Founder | A sign-in completes against a real identity provider for each protocol.                        |
| DPDP-48 | Decide the commercial-tier dispute-resolution stance. Without one, consumer arbitration terms apply to every paying tier.                           | Founder | The terms state the commercial stance, or a signed master agreement covers it.                 |
| DPDP-50 | Decide whether the single worldwide Terms and Privacy under Texas law need EEA, UK and Switzerland variants.                                        | Founder | Either a written decision that one document suffices, or the variants are published.           |
| DPDP-53 | Name an incident commander and an on-call rota for data-breach response. The founder is the default for every incident today.                       | Founder | `docs/runbooks/incident-response.md` names a commander and a rota with at least two people.    |

---

## Manual Release Checklist (actions that require the founder)

**Deploy / release infra**

1. **Rotate + populate deploy env (REL-002).** `export VERCEL_TOKEN=…` (mint at vercel.com/account/tokens) `AGI_DATABASE_URL=…` `VERCEL_ORG_ID=…` `VERCEL_PROJECT_ID=…` `PAGER_WEBHOOK_URL=…` `PRODUCTION_WEB_URL=https://agiworkforce.com`, then `gh auth login` and run `scripts/founder/provision-deploy-environments.sh`. Verify: re-run Deploy Production Surfaces; `scripts/verify-deployment.mjs https://agiworkforce.com <main-sha>` shows prod serving main. (This also promotes the ~90 commits main is ahead of prod.)
2. **Confirm migrations 0065/0066 applied in prod (REL-011).**
3. **Set `CHROME_EXTENSION_PUBLIC_KEY` (REL-010/REL-033).**
4. **Set `NEXT_PUBLIC_SANDBOX_ORIGIN` in prod (REL-019).**
5. **App Store / Play Console IAP product IDs (REL-016).**

**Security decisions** 6. **F2 (SCIM).** Query prod for Enterprise orgs with an active directory-sync connection and NO verified domain (F2 returns 400 on their SCIM without grace). Ship F2 with a cleanup migration for links poisoned before it lands (a stale link still reaches platform-wide credential revocation). 7. **F4 (quota migration).** Run `0146` against a throwaway Postgres (`db/neon/verify/README.md`), the SQL was never executed; a bad column ref would 503 the billing path. 8. **F7 (jurisdiction routing).** Approves changing paid users' model routing (Pro balanced-reasoning drops to a cheaper catalog model; premium-reasoning rises to a higher-tier one, exact catalog IDs are in the F7 patch, not repeated here). Needs `@agiworkforce/compliance` declared in `packages/ai/routing/package.json`. W2-02 stays partly open (explicit provider selection + the Rust desktop/CLI resolver are still ungated). 9. **R2 upload bucket is public.** Uploads are world-readable before the scanner runs. Decide: private bucket + proxied reads (egress cost), or scan-at-presign. 10. **Delete stale secret backups** `.env.local.bak`, `.env.local.bak-20260814-021900` (deletion was permission-blocked for me).

---

## Done log (VERIFIED this session)

| Item                                                           | Commit      |
| -------------------------------------------------------------- | ----------- |
| Migration 0145 apostrophe build-blocker                        | `eeefe1d14` |
| REL-075 reference-integrity green (113 declared, 0 undeclared) | `b415ea26e` |
| Remove agent-doc apparatus (CLAUDE.md + AGENTS.md tree)        | `0dbae4f2b` |
| Consolidated master list                                       | `bc821354e` |
| REL-014/020/022 agent + Excel/Word tool safety                 | `da3556c13` |
| REL-018/025 silent lost-turn + non-stream persistence          | `83b5c44db` |
| REL-021 shared-session continuation route                      | `860edf448` |
| REL-041/042 CLI dead links + dead startup code                 | `18c09706f` |
| Stale-doc purge (103 files)                                    | `4d1d714b5` |
| Leftover audit snapshots + stale checker refs                  | `85e1895c7` |
| Dead audit scripts + stale CI config                           | `cb080ecbe` |
| REL-072 mobile Companion agent-detail reachable                | `8641860df` |
| W1-03 connector OAuth open redirect (F1)                       | `998119a06` |
| W1-05 /tasks server-side auth gate (F5)                        | `e13298dd6` |
| W2-01 signaling trusted-proxy client IP (F6)                   | `1a9759610` |
| W1-01 chat sandbox egress containment                          | `7f80f8b21` |
