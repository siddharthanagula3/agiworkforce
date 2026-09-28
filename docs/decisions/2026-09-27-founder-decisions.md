# Founder decisions, 2026-09-27

Status: Current
Owner: Founder, recorded by the billing program
Last updated: 2026-09-27

The founder's billing decisions of 2026-09-27, in the shape of
`2026-09-15-founder-decisions.md`.

## D-2026-09-27-01 Individual plans are billed monthly only

- Decision: Basic, Pro, Max 5x and Max 20x are sold with monthly billing only,
  and yearly Pro at $200 is withdrawn from sale. Team is a workspace plan and
  keeps both cadences, $25 per seat a month or $240 per seat a year.
- Why: the founder's call. The recorded economics agree with it. A plan's
  worst-case month of usage may cost at most half of what the plan charges for
  that month (`packages/contracts/types/src/__tests__/managed-usage-limits.test.ts`
  now holds yearly prices to the same ceiling). Yearly Pro works out at $16.67 a
  month against a $10 worst case, a 39.5% worst-case margin in
  `docs/research/unit-economics-2026-09-27.md`, while yearly Team at $20 a seat
  a month meets the ceiling exactly.
- Existing subscribers: a legacy yearly Pro subscription keeps renewing yearly
  at its price, with Pro's allowances, until the customer changes or cancels
  it. Nobody is moved, so no customer's price changes and the 30-day notice in
  section 10 of the terms is not triggered. No new yearly purchase of an
  individual plan is possible. What a yearly subscriber sees in Settings >
  Billing and the plan change previews: "If you already pay yearly for Pro,
  nothing changes. Your subscription keeps its price and renews yearly until
  you switch to monthly or cancel. Once you switch to monthly, yearly billing
  is no longer available for that plan."
- The paths open to a yearly subscriber: renewal stays yearly; upgrading to
  Max 5x or Max 20x moves the subscription to that plan's monthly price at
  once, with the usual proration preview and the unused part of the year
  credited to the customer's Stripe balance for later invoices; Switch to
  monthly billing in Settings > Billing, or a smaller plan, takes effect when
  the yearly term ends; nothing offers a way back to yearly.
- Not decided here: moving legacy yearly subscribers to monthly without their
  asking. That changes their price, so it needs 30 days' notice on /pricing and
  /changelog, an email and a Stripe schedule per subscription, and it is a
  separate founder decision.
- Follow-through:
  - the catalog publishes no yearly price for an individual plan and its type
    refuses one; `WITHDRAWN_BILLING_INTERVALS` records the withdrawal, and the
    catalog moved to version 2 with version 1's allowances kept for the
    subscriptions sold under it (`packages/contracts/types/src/billing-plan-catalog.ts`,
    `packages/contracts/types/src/managed-usage-limits.ts`);
  - checkout, `/api/upgrade`, `/api/upgrade/preview` and the waitlist refuse a
    yearly interval for an individual plan with a 400 that names the cadence
    the plan is sold with (`apps/web/lib/validations/checkout.ts`);
  - `STRIPE_PRICE_PRO_YEARLY` is no longer required or sold; it stays optional
    so renewals of existing yearly Pro subscriptions still resolve to Pro
    (`apps/web/lib/price-tier-mapping.ts`);
  - `assertUpgradeBillingInterval` lets a yearly subscriber upgrade onto a plan
    that is sold monthly only, and the preview clamps what is due today at zero
    and shows the rest as credit (`apps/web/lib/server/stripe-plan-change.ts`,
    `apps/web/app/api/upgrade/preview/route.ts`);
  - `readPlanChangeState` offers the same plan's monthly price as
    `cadenceSwitch`, and `scheduleDowngrade` schedules it for the end of the
    yearly term (`apps/web/lib/server/stripe-plan-change.ts`);
  - the pricing page's only cadence toggle is Team's; the chat upgrade chooser,
    `/upgrade/[plan]` and the desktop plans modal price individual plans
    monthly; Settings > Billing shows a yearly subscriber the yearly price they
    pay, the notice above and Switch to monthly billing; the mobile store
    catalog has no yearly product (`packages/contracts/types/src/mobile-iap.ts`);
  - `grandfatheredYearlyBillingNotice` in
    `packages/contracts/types/src/billing-plan-catalog.ts` is the one source of
    the notice, and the 2026-09-27 changelog entry announces the change
    (`apps/web/lib/changelog-entries.ts`);
  - founder: archive the yearly Pro Price in Stripe, which stops new use while
    existing subscriptions keep renewing on it, and remove it from the billing
    portal's plan-switching products.

## D-2026-09-27-02 Features ChatGPT and Claude do not offer are not built

The founder's standing rule is to match ChatGPT and Claude first, then Gemini
and Perplexity. Where neither ChatGPT nor Claude offers a control, we do not
build it, and the audit cell is recorded as not applicable by this decision.

- **Per-routine effort (S63.10).** ChatGPT tasks and Claude routines choose a
  model only; our routines already choose a model.
- **Per-routine notification settings (S63.30).** ChatGPT task notifications
  and Claude's task notifications are account-wide, which ours already are.
- **In-app display language, text size and reduced motion on mobile (S84.01,
  S84.05, S84.07).** The mobile apps follow the device settings, as ChatGPT and
  Claude do (D-2026-09-15-03).
- **Time zone picker and general settings resets (S84.02, S84.26, S85.25).**
  Both take the time zone from the device and offer no general reset.
- **Attaching to a turn running in another process (S68.11 cli, VS Code,
  desktop).** Neither Claude nor Codex does it; work moves by reviewed hand-off.
- **Connector extras (S55.12, S55.15, S55.19, S55.31, S56.06, S57.19, S57.20, S57.25,
  S57.27, S57.35, S57.38, S58.04).** One account per connector, no sync time,
  no member approval requests, no Gmail labels, no transcription or speech
  tools, no subagent or approval-request tool, no retry or per-tool cost, and
  custom servers are removed and re-added instead of edited.
- **Project extras (S23.04, S23.10, S23.18, S23.19, S23.26, S23.27, S23.31,
  S23.38).** Claude and ChatGPT projects have no cover image, notes editor,
  linked folder or repo, copy-chat, save-answer-to-knowledge,
  full export or import, or parent steering conversation.
- **VS Code extras (S4.09, S4.13, S4.17, S4.23, S4.37, S4.38, S4.40).** Claude Code
  in VS Code has no projects, library, AGI Work, schedule creation, account
  connection, model catalog or billing; it hands those to the web.
- **Dedicated artifact editors (S27.34, S27.39-41, S28.02, S28.09, S28.28, S28.30,
  S29.01-04, S29.10-11, S30.01, S30.03, S30.18-19, S30.23, S30.26, S32.06,
  S32.26-28, S32.30, S33.02, S33.05, S33.08-09, S33.13, S33.19).** ChatGPT
  Canvas and Claude artifacts change files by prompt and have no spreadsheet,
  slide, design, email-send or deployment editor.
- **Library extras (S24.01, S24.10, S24.11, S24.32, S25.13, S25.21, S25.22).** No
  shared-with-me view, folders, version history, project files in All, or
  page-level PDF controls; files open in the browser viewer.
- **Voice and media platform extras (S49.04, S97.03, S97.13).** No interim
  dictation text, saved reference sets or subtitle files, as in ChatGPT and
  Claude.
- **Onboarding extras (S3.22, S3.25).** No language, time zone or memory step at
  sign-up.
- **Video studio destination (S4.29).** Video is generated in chat and kept in the
  Library; ChatGPT's video studio is the separate Sora app and Claude has none.
- **Periodic usage recap (S42.20).** Neither delivers one; Reflect builds a recap
  on demand.
- **Search domain, source-type and per-answer source controls (S34.08, S34.09,
  S34.18, S34.28, S34.29, S34.30).** Claude's and ChatGPT's consumer search
  offer none. Domain filters stay available on the API, as in both APIs.
- **Image and video edit controls** (S43.10, S43.15-16, S44.08-10, S45.12-14,
  S45.20-21, S45.25-27, S46.10-13, S47.11). ChatGPT and Gemini edit and generate
  by prompt; Claude has no image generation. The select-an-area edit tool is
  built, because ChatGPT has one. Per-image cost and remaining image counts
  (S44.14, S44.15), negative prompts (S44.13), a generation queue view (S44.16,
  S46.25), external image sharing (S44.31) and adding videos to projects (S46.34) are declined too.

## D-2026-09-28-01 Authenticator app and backup codes are temporarily unavailable

The Clerk plan that provides authenticator apps and backup codes is not bought
yet. The enrolment controls stay visible and say "Temporarily unavailable", and
a workspace cannot require two-factor sign-in while members cannot enrol.

## D-2026-09-28-02 Mobile keeps Local and Cloud memory separate

Local mode keeps its memory on the device and Cloud mode uses the account's
memory; one is never copied into the other (S39.31, S39.32 mobile).

## D-2026-09-28-03 Session and email extras follow ChatGPT and Claude

Neither offers a read-only attach to another client's session (S68.10), a
summary-only or fork-style hand-off (S68.28, S68.29), or an address to forward
email to an agent (S110.10), so none is built.

## D-2026-09-28-04 Voice runs on OpenAI's Live API

Live voice stays on OpenAI's Live API, not the legacy Realtime API, and uses
OpenAI's voices, including for voice previews. What the Live API does not
offer is not built: typed text or camera frames during a call (S48.24, S48.30,
S97.26) and client-set speech or turn detection (S97.21, S97.22).

## D-2026-09-28-05 Temporary chats keep no safety copy

Temporary chats keep no 30-day copy for safety review.

## D-2026-09-28-06 Deployment order

Migrations are applied as soon as they are merged (0295 to 0315 were applied on
2026-09-28 after a Neon snapshot branch). The signaling server is deployed to
Fly.io next. The website is deployed once every partial item is complete, and
the CLI and desktop builds after the website.
