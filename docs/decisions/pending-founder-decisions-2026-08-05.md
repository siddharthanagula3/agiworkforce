# Pending Founder Decisions — 2026-08-05

Status: Open — awaiting founder
Owner: Founder
Context: produced at the end of the autonomous "complete all tasks" pass. Every
substrate task and every autonomously-completable Class-1 and Class-2 item is
done and verified (see `docs/agent-context/known-flaws.md` dated 2026-08-05
sections and the parity matrix). The items below are the genuine remainder:
things gated on an external action, a product/architecture decision, or a scope
larger than a single autonomous slice. Each is stated as a decision with a
recommendation and what it unblocks. Nothing here was faked past.

## A. External actions only you can perform

1. **Stripe Team Prices + key mode.** Create Team **monthly $25/seat** and
   **yearly $240/seat** Price objects; set `STRIPE_PRICE_TEAM_MONTHLY_USD` and
   `STRIPE_PRICE_TEAM_YEARLY_USD`. Team checkout fails closed until then (code
   is wired and verified fail-closed). Also reconcile the **test-mode key vs
   live-mode price** mismatch that made `/api/pricing/localized` 500 (now
   soft-fails to USD, but the underlying mode split should be fixed).
2. **Team INR yearly price.** ₹1,999/mo is configured; the yearly INR figure is
   undecided — INR yearly currently falls back to the USD yearly Price. Give a
   number or confirm the fallback.
3. **Apply Neon migrations to the live DB.** `0093` (content-report intake),
   `0094` (research_reports), `0095` (published_artifacts), `0096`
   (plugin_registry) are file-content-tested only, not yet run against Postgres
   — their RLS policies/CHECK constraints are unexercised until applied.
4. **Mobile App Store gates:** StoreKit products (MS-5, App Store Connect),
   HealthKit entitlements (MS-1), the background-audio `UIBackgroundModes`
   entitlement (MS-13). Code is honest/fail-closed until each gate opens.
5. **Verify the iOS privacy manifest on the next `expo prebuild`.** The
   required-reason codes were corrected by code-read (incl. fixing the audit's
   C56D.1 mislabel), but no iOS toolchain here could emit/verify the native
   manifest.
6. **Signed CLI distribution** (the real VS Code blocker): signing certs, a
   Marketplace publisher account, and an auto-install/bootstrap path. The
   extension code itself passes 840/840 tests; the gap is release
   infrastructure, not code.
7. **`apps/web/.env.example`:** add `AGI_ROUTING_TASK_FAMILY_STAGE=0` (the file
   is permission-blocked for the agents; one line).

## B. Product / architecture decisions (each picks what gets built)

8. **#9 Desktop dispatch relay contract.** The HMAC session crypto is complete
   and matched on both device ends; the missing piece is the signaling/relay
   **server**. Options: **(rec) cloud relay** reusing the `cloud-agent-workflow`
   durable pattern — the only option with repo precedent; P2P WebRTC with
   cloud-only signaling — greenfield, no WebRTC precedent; or relay-first with a
   P2P upgrade path (the envelope is already transport-agnostic). Unblocks #9 +
   Mobile MS-18 device grants.
9. **#11 Live artifacts refresh mechanism.** No scheduled-job infra exists, so
   the trigger choice **is** the architecture: cron interval vs on-view vs
   connector webhook — plus the per-artifact refresh cost/billing model (a
   connector-bound artifact polling every N minutes has an ongoing cost profile
   unlike any existing feature). NOTE: script execution already shipped (Aug 1
   sandbox origin); CAP-050 is _auto-refresh-from-connector_, a narrower build.
10. **#13 AI-powered artifacts — go/no-go.** Its security precondition cited a
    non-existent "WEB-13" finding, so the required review was **authored + adversarially
    red-teamed** (`docs/design/cap-052-artifact-runtime-bridge-security-review-2026-08-05.md`).
    Verdict: **NO-GO as currently designed; GO-WITH-CONDITIONS after fixes.** The
    red-team (§5) found a high-severity billing-attribution error — the natural
    bridge bills the artifact _publisher_, enabling an anonymous wallet-DoS on a
    specific user via the public `/shared-artifact` surface — plus a desktop
    opaque-origin auth contradiction, and that "no bridge on public artifacts"
    needs a regression test, not a structural claim. Do NOT start the build; the
    review's RT-1..RT-4 corrections + the fail-open concurrency limiter (RT-5a)
    must be resolved in the design first. Decision: accept the conditions and
    schedule the redesign, or shelve CAP-052.
11. **Connector Local/Cloud sync default.** Local-mode connectors never touch
    the shared `user_connectors`/`github_installations` tables, so a connector
    attached in Desktop Local mode is invisible to Web/Cloud and vice-versa.
    Keep Local device-local + explicit sync, or change the default mode?
12. **Desktop/CLI harness consolidation.** Desktop and CLI each hand-roll an
    independent ~11.5K/~5.7K-line MCP client + agent engine. Consolidating onto
    one harness crate is a timeline/approach decision, not a mechanical fix.
13. **ExecutionSidecar (desktop):** nothing opens it (a mount renders null
    forever) and it duplicates the live `McpToolConfirmationPrompt`. Wire an
    opener + de-dup, or delete the subsystem?
14. **Archived inline-panel / `/git` slash surface (desktop):** fully archived;
    `addInlinePanel`/`updateInlinePanel` remain live-but-unrendered. Revive the
    subsystem or remove the dead infra?
15. **Whiteboard persistence (CAP-051).** Shipped session-only with an honest
    in-UI notice. Persist (needs a storage schema) or keep session-only for v1?
16. **AGI Work plan approval gate (CAP-048).** Shipped visibility-only — tools
    fire after the plan emits. Add an explicit "approve plan before tools run"
    gate, or keep visibility-only?
17. **Published-artifact abuse/retention (CAP-015).** No TTL, no per-user quota,
    public-by-token with no per-viewer auth. Decide TTL/quota/view-auth and a
    dedicated `artifact-publish` rate bucket; also the cross-user-conversation
    publish returns 500 instead of 403 (fail-closed but wrong status).
18. **Plugin registry policy (CAP-046).** First-party-only v1 shipped (4
    carried-over _preview_ packs, nothing installable). Decide: third-party
    submissions (one CHECK line), signing/review policy (fields null-pinned
    today), and whether CAP-008 install entitlements gate v1 install. Also two
    small wiring gaps: a typed `[plugins]` `CliConfig` field and an `agi plugin
install` subcommand.

## C. Scope larger than one autonomous slice

19. **Full i18n translation pass (#15).** Consolidation is DONE (dead root
    deleted, single runtime root, parity guard green-at-baseline). The
    remainder is a multi-week reviewed-translation project: **2,075 missing
    keys × 10 languages**, plus wiring `useTranslation` into **apps/web (5/469
    wired)** and the binding constraint **packages/ui (0/154 wired — shared by
    web AND desktop)**. Recommended order: scoped `jsx-no-literals` lint (CI
    signal) → packages/ui wiring → web features/app (minus legal) → reviewed
    translation → legal pages with per-locale legal review. Approve as a
    tracked multi-PR effort and staff the translations.
20. **Deep research scope forks (#6 v1 shipped).** Tab-close-surviving
    background runs (needs Workflow rework), a per-day research cap, and whether
    "Perplexity search path" means switching web off provider-native search.

## D. FYI / cleanup

21. **Marketplace data loss.** The desktop orphan sweep deleted the unreachable
    `features/marketplace/**`, which destroyed a concurrent session's
    uncommitted 3-line `WorkflowMarketplace.tsx` edit (`featuredOnly`). If that
    session intended to mount the marketplace, the edit needs redoing.
22. **Pricing "save 17% annually" label** vs Decision #22's no-discount-anchors
    rule — borderline; your call whether a percent-savings badge is an anchor.
23. **Goal-hook text** still carries a superseded "desktop first" clause; re-run
    `/goal` to refresh it if you use it again.
