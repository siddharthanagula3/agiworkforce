# Settings taxonomy & permission/approval architecture — 2026-08-15

Benchmarked against live-observed ChatGPT, Claude, Gemini, and Manus settings surfaces
(29 claims). Cross-referenced against `audit/parity-2026-08-15/gaps/domain-settings.md`
(12 prior findings, SETTINGS-001..012) and `domain-agentic-work.md`
(AGENTIC-WORK-004/007, GAP-P0-007/GAP-168).

Method: every claim was traced UI state → client type → request contract → network body →
server handler, not just "does a component with this name exist." Evidence below is
file:line, not inference. Where I could not get first-hand evidence I say so plainly.

---

## 1. Container, navigation, search — AT PARITY (strength)

**settings-01 / settings-02.** AGI already ships exactly the pattern the majority of the
benchmark converges on: one modal (`SettingsModal.tsx`, 2233 ln) with a left rail (flat
nav list, no group headers — closer to Claude's two-section model than ChatGPT's 14 flat
tabs) and a right detail pane. A "Search settings" input sits above the nav list
(`packages/ui/ui/src/settings-modal/SettingsModal.tsx:2162`,
`aria-label={t('modal.searchLabel', 'Search settings')}`), matching ChatGPT's
single-product differentiator. The web nav list resolves from
`SETTINGS_NAV_GROUPS_WEB` (`packages/ui/ui/src/settings-nav.ts:279-306`), 16 real keys,
each backed by a real section component (confirmed by the prior audit's file-by-file
table, independently spot-checked here). Both claims are already at or above benchmark
parity. No gap filed.

## 2. Approval / autonomy architecture — genuinely mixed picture

**settings-03 (multi-tier approval picker per surface).** This is the most interesting
finding in the domain, and it cuts both ways.

_What we have, and it's good:_ `packages/ui/unified-chat/src/components/AgentControl.tsx`
implements a **4-tier** "Agent Mode" chip — `AGENT_MODES = ['ask', 'auto', 'plan',
'bypass']` (`AgentControl.tsx:64`) — with per-mode labels/descriptions rendered in a Radix
popover (`AgentControl.tsx:169-206`) and a destructive-action confirm dialog gating the
`bypass` tier specifically (`AgentControl.tsx:229`, "Bypass mode can run commands and
tools without asking..."). This is **more granular than Claude's 3-tier picker**, not
less, and it is live-wired: `ChatInput.tsx` renders it
(`grep` confirms `AgentControl` has exactly two non-test importers, `AgentControl.tsx`
itself and `ChatInput.tsx` — i.e. it is in the real composer, not orphaned).

_What we don't have:_ Claude's claim is specifically that the picker is **repeated,
by name, across every autonomous-agent surface**. Ours is not:

- Scheduled task creation (`apps/desktop/src/features/scheduler/CreateTaskModal.tsx`)
  has Name / Description / Instructions / Model fields only (`CreateTaskModal.tsx:190,
209, 227, 236-243`) — zero occurrences of `approval`, `autonom`, `mode`, `ask`, or
  `plan` in the file. No picker at all, matching Gemini's simpler pattern
  described in settings-28, not Claude's.
- Cowork (`apps/desktop/src/features/settings/tabs/Cowork/index.tsx`) is a single
  `enabled`/`setEnabled` boolean from `useCoworkDispatchStore`
  (`Cowork/index.tsx:10-11`) labelled "Control whether a paired phone can start new
  agent tasks on this Desktop" — a binary Dispatch switch, not a named 3-or-4-tier
  picker.
- The backend `ApprovalMode` type that scheduled/cloud-agent runs actually use is only
  2-tier (`'auto' | 'manual'`,
  `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:223`), and it has **zero
  `.tsx` call sites anywhere in `apps/web`** — no UI sets it. It flows in from
  `cloud-agent-workflow-input.ts:165` as a Zod-validated field, but nothing in the web
  client ever populates it from a user control (confirmed by grep: no `.tsx` file in
  `apps/web` references `ApprovalMode` or `approvalMode`).

Net: we have the single best-built approval picker in the benchmark set, sitting unused
outside the main chat composer. This is a genuine BUILT_NOT_WIRED-adjacent finding — not
"we lack the concept," but "we built the hard part (the tiered picker + its confirm-gate
for the risky tier) once and didn't reuse it where the benchmark says it matters most."
Filed as `SETTINGS-GAP-01`, `SUPERSEDES_PRIOR` against SETTINGS-011/GAP-006 (which
characterized Cowork as merely "1 control vs Claude's 5" — true, but the more actionable
framing is "the component to close that gap already exists three folders away").

**settings-28 (scheduled task reuses the live-agent's approval picker).** Directly
confirmed MISSING per the CreateTaskModal evidence above. Important caveat that changes
the recommended fix: the prior audit's agentic-work domain already found
(`AGENTIC-WORK-007`/`GAP-168`) that scheduled-task execution runs as "a single
non-streaming chat completion... no `tools` field of any kind" — scheduled tasks
currently execute with **zero tool access**, so there is nothing an approval picker would
currently gate. Recommending "bolt an approval-mode dropdown onto CreateTaskModal" in
isolation would produce a decorative control with no runtime effect — exactly the
dead-control failure mode this codebase's own settings sections go out of their way to
avoid elsewhere (see §5). The real dependency order is: wire tool access into scheduled
runs first (AGENTIC-WORK-007), then reuse `AgentControl`'s mode chip at task-creation
time, in that order.

## 3. Capabilities settings depth — CONFIRMS_PRIOR, still true today

**settings-05 (network egress + domain allowlist).** Read `CapabilitiesSection.tsx`
directly (190 ln total): the only state shape is
`{ memory: boolean; generateFromHistory: boolean; allowToolAssistedGeneration: boolean }`
(`CapabilitiesSection.tsx:13-17`) — zero occurrences of `network`, `egress`, `domain`, or
`allowlist` anywhere in the file. Desktop's `Capabilities/index.tsx` was also grepped
directly for the same terms: zero hits. `CONFIRMS_PRIOR` (SETTINGS-006) — still an open
gap, not fixed since the prior pass.

**settings-21 (tool access mode).** `toolAccessMode: 'lazy' | 'eager'` and
`setToolAccessMode` are defined at
`packages/ui/unified-chat/src/stores/settingsStore.ts:41,55,88,106` — and have **zero**
call sites anywhere else in the repo (confirmed by grepping the whole tree excluding the
defining file: nothing reads or calls the setter). `CONFIRMS_PRIOR` (SETTINGS-005) — this
is one of the seven dead field/setter pairs the prior audit already catalogued in this
exact file; still dead.

**settings-25 (MFA breadth).** `SecuritySection.tsx:145-146` explicitly and honestly
states: "Passkeys, security keys, SMS MFA, and trusted-device lists are not available in
the current account contract. Authenticator app codes (TOTP)... are." The
active-sessions half of this claim is real and good (`AccountSection.tsx:564`, columns
Device/Location/Created/Last active, Clerk-backed, per-row Revoke) — that part is at
parity. The MFA-method-breadth half is `CONFIRMS_PRIOR` (SETTINGS-008/GAP-115): still
TOTP-only, still honestly disclosed rather than faked.

## 4. New findings this pass did not inherit from the prior audit

**settings-04 (scoped session/device authorization table).** MISSING. The
active-sessions table (`AccountSection.tsx:564`) has no Scopes column — columns are
Device/Location/Created/Last active only. We do have a genuinely scoped mechanism
elsewhere — `ApiKeysManager` (`apps/web/features/settings/components/Settings/ApiKeys.tsx`)
renders a `Scopes` form field backed by `API_KEY_SCOPE_OPTIONS`
(`ApiKeys.tsx:145-147,229`) — but that gates **developer API keys**, a different
authorization surface from "which signed-in client/session has which permission,"
which is what Claude Code's Authorization Tokens table is. NEW finding.

**settings-06 (default site-permission policy + per-site override).** PARTIAL. The
Chrome extension has a real per-domain allowlist (`apps/extension/src/options.ts:21`
imports `./features/options/site-allowlist`; `:1056-1087` renders "Approved sites",
"Add" is "the page's only site-permission control" per the file's own comment at
`:1163`) — but there is no "Default permissions" dropdown governing what happens for a
site _not_ on the list (Always-allow vs. Ask-first). This matches the prior audit's own
characterization of the extension's model as "a static, manually-managed allowlist"
rather than a default-policy-plus-override pattern
(`domain-settings.md:118-123`, no GAP id was filed for it there — it was left
"to the extension domain's own tracking"). `CONFIRMS_PRIOR` in substance, `NEW` as a
filed settings-domain gap since no GAP id exists for this specific framing yet.

**settings-07 / settings-08 (PR auto-monitor / PR auto-create toggles).** This turned
into a more fundamental finding than the claim itself. Before any toggle-granularity
question is even reachable, the underlying capability has to exist and be wired.
`apps/desktop/src/api/git.ts` exports `createPR` (`:657`... wraps a Tauri "git create PR"
command), `generatePRDescription` (`:621-635`), and `checkPRReadiness`
(`:661-683`) — but grepping the entire `apps/desktop` tree (excluding the defining file
and tests) for calls to any of the three returns **zero hits**. These functions are
dead exported API surface: a whole PR-creation capability built and never wired to any
UI. There is therefore no live surface on which to observe an "autofix unattended" vs.
"ask before opening a PR" distinction — both settings-07 and settings-08 are MISSING,
and the more actionable root cause is BUILT_NOT_WIRED at the capability layer, not
"add two toggles." NEW, not previously filed by the prior audit under any domain I could
find (grepped `GapMatrix.md` for "pull request"/"createPR"/"git.ts": no hits).

**settings-09 (shared trusted-device pairing across surfaces).** Better than I expected
going in — this is closer to a strength than a gap. `CoworkTab`
(`apps/desktop/src/features/settings/tabs/Cowork/index.tsx:6,12-18`) and
`MobileCompanionPanel`, reached from the Connections tab
(`apps/desktop/src/features/settings/tabs/Connections/index.tsx:2,34`), both read from
the **same** `useConnectionStore` (`stores/connectionStore.ts:321`,
`MobileCompanionState`) rather than each implementing its own pairing/trust flow. That
is genuine architectural reuse across two surfaces. I could not independently verify a
third surface analogous to Claude's Code-mode Remote Control environment picker in the
time available — recording this as PARTIALLY VERIFIED rather than a clean pass or fail.

**settings-11 (storage quota disclosure).** MISSING. Grepped every settings section and
`app/settings/**` route for "Storage" (excluding `localStorage`/`sessionStorage`
references): no hits. No numeric quota, no per-category breakdown, anywhere in the web
settings tree. NEW.

**settings-12 (credit-ledger with per-task debit visibility).** This is a genuine
BUILT_NOT_WIRED finding, and a good one — the data model is real and already
per-event-granular on the backend, it just never reaches a screen. Migration
`0004_token_credits.sql:24-25` and `0020_functions.sql:293` define `transaction_type` as
one of `purchase | adjustment | refund | bonus | deduction` in a `credit_transactions`
table; `rolling-usage.ts:19,55` derives the rolling-cap math "entirely from
`credit_transactions` (`transaction_type = 'deduction'`)," i.e. every unit of usage that
draws down a purchased/overage balance already writes a row with a type, an amount, and
(per `0020_functions.sql:650`) a `metadata` column. That is Manus's "Credits history"
ledger, structurally, already sitting in Postgres. But grepping every `apps/web/app/api`
route for `credit_transactions` turns up exactly four files:
`stripe-webhook/lib/{handlers,db}.ts` (writes on purchase), `billing/top-up/route.ts`
(writes on top-up), and `user/export/route.ts` (reads it only for the GDPR bulk-export
JSON dump). **No `GET` route returns this ledger for display, and no settings component
renders it.** `BillingSection.tsx` shows a lump `formatMoney(overageAvailableCents, ...)`
balance and a Stripe `Invoices` table (purchase-level, not debit-level) — the
per-task/per-model spend history a user would need to answer "what did that task cost
me" does not reach the UI. NEW, and the fix is materially cheaper than "build a ledger"
— it's "expose the one that already exists."

**settings-15 (ad-personalization toggle).** MISSING. Grepped every settings section for
`ads`/`Ads`/`advertis`: no hits (the few matches were unrelated words like "advertised").
Low-confidence caveat: I have no evidence AGI Workforce runs any ad-personalization
program at all, so this may be N/A-by-business-model rather than a true parity gap —
flagging it rather than guessing which.

**settings-16 (per-category channel selection).** Read `NotificationsSection.tsx` in
full. Confirms and sharpens `CONFIRMS_PRIOR` (SETTINGS-012/GAP-119): the section groups
toggles by **channel first** (`CHANNEL_GROUPS`: "Browser notifications" containing only
`browserReplyReady`, "Email" containing only `emailScheduleDone`, plus a separate
`mobilePushScheduleDone`) rather than by category-with-a-channel-selector. The three live
toggles are also the product of real discipline, not laziness — the file's own comment
(`NotificationsSection.tsx:20-38`) documents five toggles that were removed because
nothing sent them, and two ("mobilePushScheduleDone", "emailScheduleDone") that were
re-added specifically once `push-notification-service.ts` and
`notification-email-service.ts` shipped real senders. Correctly narrow, still narrower
than ChatGPT's per-category push/email/both matrix.

**settings-20 (global default-approval policy for plugin actions).** MISSING. Grepped
`apps/web/features/settings` for "low-risk"/"Allow low-risk"/plugin-permission language:
no hits. No global approval-default control for installed plugins exists on any surface
checked. NEW.

**settings-22 (named cloud-computer + local-computer settings destination).** MISSING as
a single named surface. We have the pieces (Desktop's Computer Use capability settings,
the Connections tab's local-machine pairing) but they are not co-located under one named
page the way Manus's "My Computer" is. NEW.

**settings-23 (dev API-key/webhook console inside the consumer modal).** PARTIAL. Half of
this is already true and good: `ApiKeysManager` renders directly inside
`AccountSection.tsx:20,340` — the same settings modal a user opens to change their name
or theme, exactly Manus's pattern of not banishing developer tools to a separate portal.
What's missing is the Webhooks half: grepped every settings component and section for
"Webhook"/"webhook" — zero hits. The webhook infrastructure that does exist in the repo
(`app/api/github/webhook`, `app/api/stripe-webhook`, `db/neon/0106_github_webhook_deliveries.sql`)
is all inbound/backend integration plumbing, not a user-facing "create your own webhook"
console. NEW.

**settings-24 (dedicated Deployments/Domains surface).** PARTIAL. `PublishedArtifactsSection.tsx`
(280 ln) is a real, load-bearing analog — its own header comment states published
artifacts "have no expiry... so 'Unpublish' here is the only way a page ever comes down"
— giving users one place to see and revoke everything of theirs that's public. But it
has no custom-domain mapping and no Websites/Apps/Domains sub-tab structure; it is
closer to Claude's inline-publish model (per the claim's own framing) than to Manus's
centralized Deployments page. NEW.

**settings-26 (account deletion blocked until subscription canceled).** MISSING, and the
most consequential finding in this domain. Two independent delete-account flows exist —
`AccountSection.tsx:193` (explicitly commented "canonical, working flow on this
surface") and a second, separately-built copy in `PrivacySection.tsx:753-883` — and
**neither checks subscription status before calling
`DELETE /api/user/delete-account`.** Read the API route in full
(`apps/web/app/api/user/delete-account/route.ts`): CSRF check, rate limit, auth, then
straight to scheduling erasure. Grepped the route and both UI flows for
`subscription`/`billing`/`cancel`: only doc-comment mentions of a _future_ self-serve
cancel route, no actual gate. A user on an active paid plan can delete their account
today with the subscription never explicitly cancelled first — a real risk given this
repo's own recent commit history is actively hardening billing-state correctness
elsewhere (`fix(billing): refuse a plan change while a cancellation is pending`,
`feat(billing): let purchased credits carry a user past their rolling caps`). Filing at
**P1**, not P2/P3: this is a genuine correctness/billing-safety hole in our own product,
not merely a competitive nicety we're missing — it fits this audit's own P0/P1 bar
("wrong billing state") more than it fits "single-product Claude differentiator."
Secondary finding worth fixing alongside it: the two independent "Delete account"
implementations are themselves a duplicate-control smell (CLAUDE.md flags "dead or
duplicate controls" as something to fix on sight) — whichever one is kept as canonical,
the other should be removed rather than left as a second, divergent code path to the
same irreversible action.

**settings-27 (voice mode independent settings).** `CONFIRMS_PRIOR` (SETTINGS-001), and
still true today — re-verified fresh, not just cited. `apps/web/app/settings/voice/page.tsx`
is real, honest content: it explicitly states "Managed voice is not available... Voice
personas, live-call models, intelligence levels, language selection, metered minutes,
and provider controls are not active on Web. This page does not show disabled settings
that the runtime cannot consume" (`voice/page.tsx:55-60`). That's the right way to handle
an unbuilt feature. The bug is that even this honest disclosure page is **unreachable**:
`SETTINGS_NAV_GROUPS_WEB` (`settings-nav.ts:279-306`) lists 16 keys and `'voice'` is not
one of them — confirmed by reading the full array. A `'voice-settings': '/settings/voice'`
route mapping exists in `WebShellV3.tsx:38` but nothing in the settings modal's own nav
links to it. Net effect for settings-27 specifically: on Web, AGI has neither a live
voice-mode-with-its-own-settings (honestly, by design) nor a discoverable way to see the
disclosure saying so.

**settings-29 (configurable safety fallback: switch model vs. pause).** MISSING. Read
`SafetySection.tsx` in full (157 ln): exactly one toggle, "Reduce sensitive content,"
with an explicit closing disclaimer that it "does not monitor conversations, notify
another person, or replace emergency services." No model-switch-on-flag vs.
pause-on-flag control exists anywhere in Safety or Capabilities settings. NEW.

**settings-10 (proactive trusted-contact safety notification).** DIFFERENT_BY_DESIGN,
and correctly so — `SafetySection.tsx`'s own closing line quoted above is a direct,
deliberate refusal to build this, matching the prior audit's GAP-044 (declined). See
§6 for why this belongs in "what not to copy," not in the gap list.

## 5. Strengths worth recording honestly (not flattery)

- **Modal + rail + search** (settings-01/02) already matches the majority-benchmark
  pattern and beats Gemini's flat dropdown outright.
- **`AgentControl`'s 4-tier Ask/Auto/Plan/Bypass mode chip**
  (`packages/ui/unified-chat/src/components/AgentControl.tsx:64`) is more granular than
  Claude's 3-tier picker and gates its most dangerous tier (`bypass`) behind an explicit
  confirm dialog (`:229`) — a real safety feature Claude's public description doesn't
  call out. It is simply under-deployed, not badly built.
- **Model-class-specific quota segmentation is already live and wired**
  (settings-13): `UsageSection.tsx:137-139,243-252` renders a `weeklyFlagship` bar
  distinct from the `weekly` aggregate, sourced from `flagship_weekly_usage_percentage`
  in `managed-usage-balance.ts:55` and served by a real `/api/usage` endpoint
  (`useManagedUsageSummary.ts:73`) — confirmed end-to-end, not a stub. It buckets by
  routing tier (`flagship_coding_pro_plus`, etc. — `model-catalog.ts:1267-1268`) rather
  than by one single named model the way Claude's Fable example does, which is a
  reasonable and arguably more scalable design, not a lesser one.
- **Pay-as-you-go top-up (settings-14) is fully wired and, on specific details, ahead of
  the benchmark.** `BillingSection.tsx:795-960`: preset + custom top-up amounts, a real
  Stripe checkout call, and an explicit opt-in "Keep going after a usage limit" overage
  toggle whose own code comment explains the safety reasoning ("spending a balance
  somebody bought, without asking, is worse than stopping at the limit they already
  expected" — `:901-906`) — plus purchased balance "carries across renewals for up to 12
  months" (`:812`), a concrete commitment none of the three converging benchmark products
  are documented as making.
- **Unified capability marketplace (settings-19) already exists and is architecturally
  sound.** `DirectoryBrowse` in `SettingsModal.tsx:453-499` is one shared component
  serving Connectors/Skills/Plugins behind one tab rail, called from three different
  entry points (`:1254,1550,1720`) — matching Claude's Directory pattern. It **deliberately**
  omits install-count/popularity numbers (`SettingsModal.tsx:1527`, "No download counts /
  popularity numbers anywhere (no real metrics)") rather than fabricate them — the right
  call given the honesty discipline documented elsewhere in this domain, even though it
  falls short of Claude's telemetry sub-feature.
- **Trusted-device pairing is shared infrastructure, not per-surface reimplementation**
  (settings-09): Cowork and the Connections tab both read `useConnectionStore`.
- **Systemic dead-control hygiene**, independently re-confirmed in this pass beyond what
  the prior audit already found: `PrivacySection.tsx:23-32` explains why
  `locationMetadata`/`improveModelTraining`/`rememberChats` were removed rather than left
  half-wired; `voice/page.tsx:55-60` explains why no voice controls render;
  `SafetySection.tsx` explains its own scope limits in the UI copy itself. This is a real,
  repeatable pattern across at least four separate files in this domain alone, not one
  lucky instance.

## 6. What NOT to copy

- **ChatGPT's "Trusted contact" (settings-10) and any crisis-escalation feature.**
  Implies a clinical-risk classifier over live conversation content plus a
  contact-verification/consent pipeline — a serious safety and legal undertaking, not a
  settings toggle. `SafetySection.tsx` already declines this correctly and says so in the
  product itself. Do not build a lighter-weight shadow version without the same
  infrastructure the real feature requires (verified contact consent, clinical review,
  legal sign-off) — this is not a place to chase parity for parity's sake.
- **Manus's three-way resource-type credit ledger (Tasks / Websites / Computers) as a
  template to blindly clone when building the settings-12 fix.** If/when
  `credit_transactions` is surfaced as a "Credits history" view, it should reflect the
  resource types AGI Workforce actually meters today, not import Manus's category split
  wholesale — we don't currently have three independently-metered resource classes to
  report on, and inventing categories to match Manus's screenshot would be exactly the
  kind of UI-promises-a-thing-that-isn't-real failure mode this codebase otherwise avoids.
- **A decorative approval-mode dropdown on Scheduled Tasks (settings-28) shipped ahead
  of scheduled-run tool access.** See §2 — bolting the picker onto `CreateTaskModal`
  before `AGENTIC-WORK-007` (zero tool access on scheduled runs) is fixed would produce a
  control with nothing to gate, the precise anti-pattern `PrivacySection.tsx` and
  `NotificationsSection.tsx` already document avoiding elsewhere in this same domain.

## 7. Claims not independently re-verified to first-hand file evidence

- **settings-09's third-surface claim** (an analog to Claude's Code-mode Remote Control
  picker) — confirmed 2 of 2 checked surfaces share trust state; did not locate or rule
  out a third.
- **settings-15's business applicability** — confirmed no UI toggle exists; did not
  confirm whether AGI Workforce runs any ad-personalization program this would even need
  to gate.
- **Mobile's voice-mode depth** for settings-27 — the prior audit's mobile inventory
  lists `voice-language` and `voice` screens among ~33 mobile settings screens, which
  could plausibly satisfy this claim on Mobile even though Web explicitly does not. Not
  independently re-opened this pass; this domain's stated scope was Web-first.
