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
- **Research, notebook and IDE extras (S36.24, S37.16, S37.17, S37.35, S54.18 outside
  Claude Code, S66.08, S66.12, S66.16, S66.29, S66.38 in VS Code, S98.26).** No
  curated per-answer evidence set, saved answers, notes or notebook export (as
  S23.27, S23.10, S23.31), no plugin hooks where no user shell runs, no second
  file tree, editor, terminal, task or test panel inside VS Code, and publisher
  identity checked in the owner's review of each submission, as ChatGPT's app
  review does.
- **Chat surface extras (S12.08, S14.08 and S14.12 on web and desktop, S15.27 on
  web, S15.28, S16.14, S16.22, S17.23-25, S17.33, S17.35, S18.14, S19.14).** No
  skill picks on the new-chat screen, attach-a-link or attach-a-folder control,
  on-device or own-key model in the consumer web app, pending mark on the user
  bubble, link to one message, one-step shorten, expand or change-tone action,
  save-answer-to-knowledge, single-answer export, turn outline or saved state
  on a finished answer: neither ChatGPT's nor Claude's chat offers them.
- **VS Code artifacts (S26.14, S26.29, S26.31 in VS Code).** Neither Claude Code
  nor Codex in VS Code previews, exports or publishes artifacts; VS Code lists
  them and opens a published artifact's link.
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
- **Connector reach (S55.10, S55.13-14 for non-OIDC providers, S55.25, S56.18-20
  for Google Docs, Sheets, Slides and Office files, S57.18, S58.13).** ChatGPT
  and Claude read Drive and Office files without editing them, generate no
  video from a chat turn, pick no folders in-product, authorize no service
  accounts, show the connected account only where sign-in returns it, and
  remove and re-add a server rather than disable it
  (support.claude.com/en/articles/11175166, checked 2026-09-28).

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

## D-2026-09-28-07 Routing extras follow ChatGPT and Claude

Customers choose a model, never a supplier, so there is no provider or route
lock on web, desktop, the API or the CLI's managed routes (S79.17, S79.18).
Neither leader offers an advisor model consulted mid-task (S79.22), specialist
worker models on web (S79.23), confidence-based abstention (S79.25), a
classification adapter (S79.29), a routing evaluation screen (S79.31), video
input (S76.12), a capability inspector (S78.27) or a user control for image
detail (S76.05 outside the API).

## D-2026-09-28-08 Connectors the leaders ship are built, including health and money

Where ChatGPT or Claude ships a connector capability, it is built. The model
can create and edit images in an ordinary chat turn, as ChatGPT Images does
(help.openai.com/en/articles/11084440, checked 2026-09-28). Gmail can send,
reply and forward with attachments after an approval every time, as Claude's
Gmail connector does. Google Contacts can be searched, as in ChatGPT since
August 2025. Health records connect as in ChatGPT Health (b.well) and Claude
(HealthEx), and bank accounts connect read-only as in ChatGPT's personal
finance experience (Plaid, June 2026). Health and bank connections are opt-in,
read-only, United States only, never written to memory or used for training,
and removed with their stored tokens on disconnect. They stay unavailable until
the owner signs the vendor agreement and configures it, and a lawyer confirms
whether the FTC Health Breach Notification Rule or the GLBA Safeguards Rule
applies before either is switched on. The BigQuery server Google hosts is not
pinned, because it requires the full BigQuery scope and the Google ceiling stays
read-only; Snowflake and Databricks are added by account URL.

## D-2026-09-28-09 Signed-out chat follows ChatGPT

ChatGPT lets people chat without an account and Claude does not; where the two
differ, Gemini and Perplexity decide, and both allow it. A signed-out visitor
can therefore chat on the web and desktop, as in ChatGPT's logged-out
experience: text only, on the default free model, with no files, images, voice,
tools, memory or saved history, and a line saying that messaging means
accepting the Terms and Privacy Policy. Per-device, per-IP and global daily
caps come from configuration, bot protection applies, and a kill switch keeps
it off until it is switched on after the final checks.

## D-2026-09-28-10 Grant, screen, layout and desktop sign-in extras follow ChatGPT and Claude

Neither ChatGPT nor Claude has one action that revokes every optional grant;
each connector, folder or permission is withdrawn on its own, so none is built
(S86.25). Both leave screen-sharing preferences to the operating system's
Screen Recording switch, and so does the desktop app (S86.22). Tiled and stacked
session layouts exist only for coding sessions in Claude's desktop app, so they
are built for /code on the web and desktop and not for chat, the phone, the CLI
or Chrome (S7.08, S7.09). Both desktop apps finish a company identity provider
sign-in in the system browser and hand the session back to the app, so the
desktop app does the same (S3.09, S3.10). ChatGPT's voice mode steers a coding
task, so voice control of a /code session is built (S48.40). Checked
2026-09-28.

## D-2026-09-28-11 Research is a paid-plan feature, as in Claude

Claude offers Research on Pro, Max, Team and Enterprise and not on Free
(support.claude.com/en/articles/11088861, updated 2026-06-02). OpenAI's plan
and deep research pages refused the fetch on 2026-09-28, so Claude's page
decides until ChatGPT's can be read. Research is therefore offered on Pro,
Max, Team and Enterprise, every surface reads that from the capability
document, and the server refuses a research request the document denies.

## D-2026-09-28-12 Voice transcripts and voices follow Claude

Claude saves voice conversations as ordinary chat history, so their export and
deletion follow the chat (support.claude.com/en/articles/11101966, checked
2026-09-28); voice transcripts here are chat messages too, so S49.25 and S49.27
are at parity. Claude offers preset voices only, to prevent voice cloning and
impersonation, and no download of spoken replies; with D-2026-09-28-04 keeping
OpenAI's preset voices, custom voice creation (S50.31) and downloading
generated speech (S50.04) are not built. help.openai.com refused the fetch.

## D-2026-09-28-13 Full-screen code blocks stay off the phone

Neither leader's iOS app opens an ordinary code block full screen: ChatGPT's
full-screen writing and code blocks are listed for the web
(help.openai.com/en/articles/6825453, 2026-06-08) and Claude opens only
artifacts full screen. The mobile app therefore keeps code blocks inline
(S21.08 mobile). Checked 2026-09-28.

## D-2026-09-28-14 Cloud coding sessions show command logs, not an interactive terminal

Codex cloud tasks show their command logs only (learn.chatgpt.com/docs/cloud),
and Claude Code on the web opens a terminal only by copying a command to run in
the person's own terminal (code.claude.com/docs/en/claude-code-on-the-web).
Cloud coding sessions here keep their command view and journal and do not add
an interactive sandbox terminal (S66.15). The Library filters files by where
they came from, uploads or generated, and has no filter by product surface,
which neither leader documents (S24.15). Checked 2026-09-28.

## D-2026-09-28-15 Branching and the email widget stay off the phone

ChatGPT offers conversation branching and its email widget on the web only, and
Claude's apps have neither, so the mobile app does not add them (S16.10, S17.27
and S22.25 mobile). Checked 2026-09-28.

## D-2026-09-28-16 Phone file handling follows Claude's apps

Claude's apps open files in the system preview or another app, do not change
artifact sharing settings on iOS or Android, and send document editing to the
web or desktop (support.claude.com/en/articles/12111783, 9547008 and 16923645,
checked 2026-09-28); Gemini also keeps export to Sheets off its mobile app. The
mobile app therefore keeps in-app file viewers, sharing settings, document
editing, export to Sheets and dedicated report or deck actions off the phone
(S25.02-S25.04, S26.31, S29.17-S29.19, S29.34, S29.38 and S29.39 mobile).

## D-2026-09-28-17 No memory profile summary

Claude lists memory as topics and shows no generated profile summary of the
person (support.claude.com/en/articles/11817273, checked 2026-09-28), and the
web and desktop apps show none either, so the mobile app does not add one
(S39.07 mobile).

## D-2026-09-28-18 Artifact engines follow the leaders

Code artifacts get a code editor and document templates get direct editing,
because Gemini and Claude's template documents edit in place
(support.google.com/gemini/answer/16047321, support.claude.com/en/articles/17153992),
and images get a select-an-area edit as ChatGPT offers
(learn.chatgpt.com/docs/image-generation). A spreadsheet grid editor (S104.05)
is not built: both leaders only download or regenerate tables
(support.claude.com/en/articles/12111783, learn.chatgpt.com/docs/artifacts-viewer).
Video editing (S104.08) is not built: neither leader documents one. An
integrated terminal on the web (S104.T09) is not built: ChatGPT offers it only
in its desktop app and Claude Code on the web has no terminal input. Checked
2026-09-28.

## D-2026-09-28-19 Profile updates and legal holds stay out of the public API

Neither leader's public API changes a user's profile: OpenAI's Admin API
updates roles only and Anthropic's Update User changes the organization role
only. Neither leader's compliance API places or releases a legal hold; both
export records that the customer holds with its own tools. So the public API
keeps GET /api/me and read access to held records and preservation status,
while profile edits stay a signed-in client action and holds stay an admin
console action (S85.01 api, S87.37 api). Checked 2026-09-28.

## D-2026-09-28-20 No device-only conversations on the web

ChatGPT and Claude on the web keep every saved conversation in the account and
answer privacy with temporary chat and incognito, which are never saved. Neither
offers a durable conversation kept only in the browser, so the web and desktop
apps keep local-model chats temporary rather than storing them on the device
(S41.14 web and desktop). The mobile, CLI, VS Code and Chrome apps already keep
local conversations on the device.

## D-2026-09-28-21 Only cloud coding sessions are shared

Claude shares Claude Code sessions that run in the cloud, from the session list
at claude.ai/code, and offers no share link for a session running on the
person's own machine (code.claude.com/docs/en/claude-code-on-the-web, section
Share sessions). The desktop app shares cloud sessions through the hosted Code
page, and local sessions stay unshareable (S66.40 desktop). Checked 2026-09-28.

## D-2026-09-28-22 A cloud session's result comes local through the CLI and VS Code

Claude brings a cloud session into a local checkout with the CLI's
`claude --teleport`, which checks out the session's branch and loads its
history, and with Open in > Terminal on claude.ai/code, which copies that
command; the desktop app does not pull a cloud result into a repository itself
(code.claude.com/docs/en/claude-code-on-the-web, section From cloud to
terminal). The desktop app therefore hands a cloud session to VS Code or the
terminal and adds no native pull and review of its own (S110.23 desktop).
Checked 2026-09-28.

## D-2026-09-28-24 A reconnected connector does not resume the interrupted turn

When a connected app's sign-in expires mid-answer, ChatGPT and Claude show a
reconnect prompt and the person sends the request again once the app is
connected; neither resumes the interrupted turn on its own. The web and
desktop apps do the same: the chat card offers Reconnect and Retry, and
Settings offers Connect on an expired connection, with no automatic resume
(S110.27 web and desktop).

## D-2026-09-28-23 The Chrome extension stays at Claude in Chrome's scope

Claude in Chrome is the reference for the extension. Its pages
(support.claude.com/en/articles/12012173, claude.com/chrome,
code.claude.com/docs/en/chrome, support.claude.com/en/articles/12902428) and
Gemini in Chrome's (support.google.com/chrome/answer/16283624), checked
2026-09-28, document none of the following, so the side panel does not add
them: a library or file browser, a model catalog, in-panel billing management,
recents grouped by project, back and forward history, artifact or source split
views, downloads of uploaded originals, partial copy from an artifact, artifact
cards and states for inline replies, a floating selection toolbar or in-place
rewrite, chart image export, choosing project sources, a research progress
view, source-type icons, project notes, retry of a failed dictation, an account
or workspace switcher, context and output limits in the picker, model-dependent
media settings, regional-restriction and runtime notices, unavailable-model
states, connect-account explanations, routing profiles and a switch offer,
routing-policy versions, promotional credits, a display-language choice,
per-category notifications, clearing local storage, an active-sessions list,
Office, Google Workspace and Teams host integrations, a toolbar quick-action
list, reconnect-and-resume for integrations, and pull request diff review
(Claude in Chrome reads the page; the CLI, VS Code and cloud Code review pull
requests). Claude in Chrome works in Google apps by using the page, without API
setup. Cells: S4.23, S4.38, S4.40, S5.11, S5.25, S7.04, S7.05, S9.13, S25.26,
S25.28, S26.01, S26.04, S27.15, S29.36, S34.19, S35.09, S36.07, S37.38, S49.06,
S67.21, S67.23, S74.20, S76.28, S76.29, S78.06, S78.11, S78.15, S78.16, S78.20,
S79.05, S79.06, S79.08, S79.21, S79.28, S81.19, S84.01, S84.18, S85.23, S86.06,
S106.01, S106.02, S106.03, S106.04, S106.05, S106.06, S106.07, S106.08,
S106.12, S106.15, S109.03, S109.08, S110.27 (chrome).

## D-2026-09-28-25 The VS Code extension stays at Claude Code in VS Code's scope

Claude Code in VS Code is the reference for the VS Code extension. Its pages
(code.claude.com/docs/en/vs-code, code.claude.com/docs/en/checkpointing,
code.claude.com/docs/en/claude-code-on-the-web), checked 2026-09-28, either
leave out or rule out the following, so the extension does not add them: type
icons in mixed lists, plain multi-choice checkboxes, a branch picker, a setup
wizard that collects choices, an approve-this-transfer prompt, task-category
chips, typed project mentions, artifact-building rows, a separate stderr panel,
in-place prose rewrite of a selection, a no-results state for web search,
notebook sources, a proactive-feature history, connector detail pages and
provider labels on tool rows, a page-summary command, goal-bounded loops, host
capability reporting beyond the heartbeat, regional-restriction and
unavailable-model notices, an overage toggle and a pre-run cost estimate. A
local session sent to the cloud starts a new cloud session from the pushed
branch with a new task, as `claude --cloud` does; history comes back only when
a cloud session is pulled local. Cells (vscode): S5.16, S8.14, S9.08, S9.23,
S10.39, S12.05, S13.25, S19.12, S21.16, S27.16, S34.32, S37.38, S42.25, S55.04,
S55.29, S64.05, S67.36, S68.21, S78.11, S78.16, S81.21, S82.22; S110.22 is met
at parity once cloud sessions are switched on.

## D-2026-09-28-27 Mobile sends web-billed plan management to the web

The lead's ruling of 2026-09-28. A plan billed on the web is managed on the
web: the mobile app links out to web billing for the card, billing address,
tax identifier, a failed-payment retry, cancelling, coupon and promotion
codes and billing discrepancy reports, and has no in-app form for any of
them. This matches the App Store and Google Play rules for purchases made
outside the store and how the ChatGPT and Claude apps send web subscribers
to the web. A pre-run cost estimate and a global command palette are not
built on mobile. A connection-status indicator, in-place rename, a saved
default effort, a profile photo, a guided import and first-run name, use
case, personalization and memory steps are built on mobile only where the
web has them, and are otherwise not applicable. Cells (mobile): S83.09,
S83.10, S83.11, S83.12, S83.15, S83.21, S81.18, S81.19, S83.07, S82.33 (link
out); S82.22, S5.26 (declined); S5.32, S5.21, S84.11, S85.01, S88.15, S3.21,
S3.23, S3.24, S3.25 (built where the web has them).

## D-2026-09-28-28 The mobile app matches the leaders' phone apps in voice, connectors, tasks and routines

Checked 2026-09-28 against Claude's help pages (support.claude.com/en/articles/10065434,
11101966, 11869619, 13854387, 13947068, 14328846 and claude.com/blog/cowork-web-mobile) and
ChatGPT's (help.openai.com pages refused the fetch; its September 2026 voice update is
reported at techcrunch.com/2026/09/23). Where a leader offers the feature on its phone app, the
mobile app builds it: a speech input language setting that defaults to automatic detection,
reading and creating iOS calendar events and reminders behind the system permission prompt,
opening the files a task produced, tool results and approvals on screen during voice, and a
task's questions reaching the phone. Where the leaders are silent, the mobile app does what our
web app does: a skill directory with install, bank linking, the clarify card and the AGI Work
plan review are built because the web has them; attaching an image during voice, audio-file
upload and a per-task model picker are not, because the web has none. Neither leader documents
the rest on its phone app, or both document the opposite, so they are not built: pausing a
spoken reply, choosing the microphone or speaker and Android audio routing, a skill permission
summary, a connector read-only switch or provider badge, an in-chat missing-scope request, a
warehouse preset, reading or sending native messages (the app drafts and hands off to the
system composer, as Claude does), tool schemas and a receipt log, a connection test button, a
read-only agent mode, choosing sources or effort for a task, the desktop agent roster with its
presence, pause and history, per-agent usage in Compare, a routine description or cron and
interval recurrence, and reading a host app's live selection or handing a session back to it.
Cells (mobile): declined S48.11, S48.18, S48.19, S48.20, S48.29, S49.08, S49.19, S53.36,
S55.26, S55.29, S55.30, S56.37, S56.44, S57.30, S57.37, S58.07, S59.09, S60.05, S60.08,
S60.09, S61.01, S61.11, S61.19, S61.22, S62.08, S63.04, S63.14, S106.08, S106.25.

## D-2026-09-28-29 The terminal agent stays at Claude Code's and Codex CLI's scope

Claude Code (code.claude.com/docs) and the Codex CLI (learn.chatgpt.com/docs),
read 2026-09-28, offer none of the following in the terminal, so the CLI does
not add them: task shortcut tiles, a connector recommendation registry, answer
cards and widgets, artifact cards, building states, previews, source toggles,
editors, export menus and project attachment, user file create, delete and
search commands, a Python analysis panel, design and site publishing and
export, a briefing template, a routine history view beyond listing runs, an
agent preview chat, agent export, a skill instruction editor, recorded skills,
plugin customize, an MCP traffic inspector, a subagent handoff-mode choice,
routine webhook token creation, a page summary command, a browser pause-and-keep
control, a pull request tool beyond the shell's gh, a pre-task cost estimate,
an output style derived from a sample, a design-to-code handoff, a user symbol
search and a diagnostics panel. The sources for each are in the w-desktop
parity table (partials/scratch/w-desktop/cli-parity.tsv). Cells (cli): S10.25,
S12.05, S12.09, S17.09, S17.13, S19.12, S26.14, S26.27, S26.29, S28.01, S28.03,
S28.08, S28.10, S28.11, S29.27, S32.33, S33.04, S42.01, S42.25, S52.05, S52.39,
S53.09, S53.27, S54.27, S58.26, S62.15, S63.17, S64.05, S64.25, S67.31, S82.22,
S85.04, S110.12, S66.10, S66.14.
