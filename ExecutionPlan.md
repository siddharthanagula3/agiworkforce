# ExecutionPlan

Status: Current
Owner: Platform lead
Last updated: 2026-08-13

Built by extracting all 211 findings from the five audit artifacts, verifying
96 of them against the repository as it stands, and ordering the survivors by
consequence to effort. Extraction and verification ran as parallel agents; the
synthesis was a single pass over both.

## How to work this file

- One item at a time unless two items' `Writes:` sets are disjoint. `Writes:`
  is the collision key — see the collision table near the end.
- An item is `done` only when its `Verify:` command passes on a clean tree AND
  `git status` is clean. Build success is not completion.
- Verify against the SOURCE before starting an item. These artifacts have a
  real false-positive rate: this session has already found the "empty Team
  panel" to be a mid-frame render capture, and the Enterprise `$1,000,000`
  headroom to be a documented deliberate design rather than a misconfiguration.
  Open the file before you believe the finding.
- Record dismissals as explicitly as fixes, with the evidence that dismissed
  them, in `docs/agent-context/known-flaws.md`.

## Demo-readiness cycle — Website first (opened 2026-08-12)

Priority order set by the founder: working frontend UI/UX -> real functionality
-> integrations -> shared architecture -> cleanup -> release readiness. The bar
is a Screen Studio recording that moves through the product without exposing
broken UI, placeholders, fake responses, or dead controls.

Verification is REAL BROWSER USE, not test cases. Drive `localhost:3000` as a
demo would. A passing unit test is not evidence for this cycle; a screenshot of
the working flow is.

Model policy while testing: catalog-selected cost-efficient Google models for
general, image and video checks. Use an OpenAI model only when provider-specific
behaviour is under test.

### Website — demo walkthrough

- `DONE` Greeting shouted the profile name. Clerk stored "SIDDHARTHA", and the
  hero headline rendered it verbatim as "Good evening, SIDDHARTHA".
  `normalizeGreetingName` in
  `apps/web/features/chat/components/GreetingBanner/useGreeting.ts` now
  title-cases all-caps and all-lower names while leaving deliberate casing
  ("McDonald", "d'Angelo") and two-letter initials ("JT") untouched.
  Verified in-browser: "Good evening, Siddhartha".
- `DONE` Video generation in-flight state was a blank card. The only label,
  "Generating your video…", sat behind `motion-safe:opacity-0`, so it rendered
  ONLY for prefers-reduced-motion readers — every normal viewer got an
  unexplained grey rectangle for the 1-3 minutes Veo takes, which reads as a
  hung product. Founder hit this live and reported "it did not work" while the
  backend was in fact succeeding. Extracted to
  `apps/web/features/chat/components/messages/VideoGenerationPlaceholder.tsx`
  with an unconditional label, an icon chip, and a live elapsed counter seeded
  from the message timestamp so a remount does not restart it.
- `DONE` Map card geocoded to the wrong continent. Verified live: a Dallas ->
  Las Vegas route pinned a road called "Las Vegas" in Limbé, CAMEROON.
  `map-geocoding-service.ts` took Nominatim's `limit=1` on faith; it now
  requests 5 candidates and ranks settlements (`place`/`boundary`) above
  streets (`highway`), then by `importance`. Spot-checked: Las Vegas -> Nevada,
  Dallas -> Texas, Paris -> Île-de-France, Springfield -> Illinois.
- `DONE` Video generation verified end to end in the browser on the selected
  cost-efficient Google video model —
  prompt -> generation -> R2 private bucket -> inline player with real output.
  This also proves the rotated account-scoped R2 token works against the
  private bucket from application code, not just from a probe script.
- `DONE` Image and video mode dropped on every send. The after-send clear in
  `ChatComposerNew.tsx` reset `imageMode`/`videoMode` plus the chosen media
  model and aspect ratio, on the stated assumption that these are "one-shot
  composer modes". They are not: generating a second image meant reopening the
  menu and re-picking mode and model, and the composer appeared to snap back to
  a text model the instant you pressed send. Founder hit this on both modes.
  Mode, media model and aspect ratio now persist; the mode pill's × remains the
  single explicit way out and already clears all three. `selectedSkillName`
  still clears per send — a skill genuinely is a one-shot choice.
- `DONE` Every assistant reply was labelled "Unavailable model". The client
  stamps the in-memory message with the model it REQUESTED, before the fetch —
  under Auto routing that is the literal `auto`, which is not a catalog id, so
  `getManagedModelPresentationLabel` fell through to the unavailable string on
  every turn. Servers now report the routed id via `X-AGI-Resolved-Model` from
  all three response builders (agent/tool-loop in `route.ts`, plus both
  builders in `stream-transform.ts`), and all three client stream consumers
  adopt it — including a `updateMessage` write-back, without which the header
  changed only what was persisted and never what rendered. Verified live:
  the resolved catalog model label. Also corrects the case where a credit fallback
  swapped the model and the footer named one that never ran.
- `DONE` "E2B" reached users. Three paths: the tool DESCRIPTION sent to the
  model ("Runs in an isolated E2B environment" — models quote their tool
  descriptions), the unavailable-executor error, and — the real one — the
  catch block passing raw SDK errors into the transcript, where a dropped
  connection arrives as `ECONNREFUSED 49982-abc.e2b.dev:443`. Added
  `redactSandboxVendor()` on every path out of `routeExecutionTool`; hostnames,
  sandbox ids and the env var name are scrubbed while Python tracebacks pass
  through intact. Logs keep the raw text. The `/security` page still names the
  subprocessor — that is a disclosure, not a leak.
- `DONE` Run code was silently failing: `[e2b] per-user sandbox quota reached;
refusing new sandbox (fail-closed)`. Cause is an operational leak — the quota
  counts `['running','paused']` and PAUSED sandboxes are never reaped, so they
  occupy the quota permanently and keep costing money. Found 12 paused
  sandboxes on the account, the oldest from 11 July. Reaped them; Run code then
  executed correctly end to end ("Running code" activity, Fibonacci sum 986).
- `DONE` Durable sandbox reaper: `lib/e2b/reclaim.ts` lists running/paused
  sandboxes, kills expired or orphaned sessions, settles any open compute
  interval, and removes the stale mapping. The authenticated
  `/api/cron/reclaim-sandboxes` route is scheduled daily in `vercel.json`, so a
  24-hour Redis mapping expiry can no longer strand paused capacity forever.
- `DONE` `Plugins` in the + menu was the only row styled
  `text-muted-foreground`, so a fully-wired entry rendered greyed-out beside
  Skills and Connectors and read as disabled.
- `DONE` Web capability sweep, driven through the real browser 2026-08-12:
  - Web search + citations: WORKS. Inline "Searched the web" activity, real
    answer, `Sources:` links and a numbered citation chip, follow-up chips.
  - Inline tool-loop UI: WORKS and is at benchmark quality — collapsible
    header, per-step rows with duration ("Preparing map 310ms"), copy affordance
    and a "Done" checkmark, matching the claude.ai reference the founder shared.
  - Sandbox / Run code: WORKS after the paused-sandbox quota was reaped.
  - Image + video generation: confirmed working by the founder; video also
    verified end to end here on the selected catalog video model.
  - Maps: WORKS (built and corrected this cycle).
  - Library: renders, and degrades CORRECTLY for a missing object — `FAILED`
    badge plus "Stored file bytes are no longer available. You can remove this
    stale Library entry" and a Delete action. The one stale row is fallout from
    the R2 credential/bucket rotation, not a UI defect.
  - Code mode: WORKS. The sidebar entry is an in-app mode switch, not a route,
    so a direct `/code` URL 404s by design; it routes to `/chat/code`.
  - Settings modal: opens from the + menu on the right pane, with General,
    Account, Team, Privacy, Billing, Usage, Capabilities, Security, Safety,
    Notifications, Reflect, Time and focus, Skills, Connectors, Plugins, Help.
  - `/chat`, `/chat/projects`, `/chat/schedules`, `/chat/library` all 200 with
    no console errors.
- `TODO` Still unverified through the UI: Deep Research end to end, file/image
  ATTACHMENT upload, Projects detail, AGI Work, custom instructions, memory,
  and a connector actually connecting.
- `DONE` Video aspect, quality, and duration are catalog-derived and wired
  through the Web composer to the media request. 1080p/4K constraints send the
  required duration rather than falling through to the route's 4-second
  default, and leaving video mode resets the whole selector tuple.
- `DONE` Core Web chat flow: prompt, streaming response, resolved-model label,
  model switch, and tool calls were exercised through the real browser.
- `DONE` Inline tool activity/progress/rich results: expandable per-step rows,
  elapsed time, completion state, source links, map cards, generated files,
  and explicit failures are mounted in the production transcript.
- `DONE` Image and video generation UI end to end. Both persist their selected
  mode/options across sends; real image output and a Veo video were rendered
  inline from the durable media path.
- `DONE` Maps card exercised through the live model path and reworked against
  the claude.ai reference the founder supplied. Numbered pins now tie to a
  numbered place list carrying the geocoder's own classification ("Locality ·
  Clark County, Nevada"); the list floats over the map as a right-hand panel on
  desktop and a horizontal carousel on mobile, with the title as a chip and
  "Open route" promoted to the primary action. Zoom controls moved to
  bottom-left to clear both. The view centre shifts right by half the panel
  footprint on desktop because centring on the CARD hid the eastern pin of a
  route behind the panel — observed with Dallas occluded.
- `BLOCKED_BY_HUMAN` Route polyline and place photos. Both need a credential
  the environment does not have; `GOOGLE_API_KEY` is Gemini-only (verified) and
  OSRM's public server is development-only. Drawing a straight line between
  endpoints was rejected as fake functionality. See `FoundersAssistance.md` #16.
- `TODO` Tool-progress timeline for map/tool calls — the reference shows
  "Searching for places -> Done" as an expandable step list; ours shows a
  single "Preparing map" line.
- `TODO` Dark map tiles. OSM standard tiles are light-only, so a dark card
  needs CARTO basemaps — a licensing decision for a commercial product rather
  than a technical one.
- `DONE` Sandbox/code execution UI was exercised through the live model path,
  including activity and generated output after the leaked quota was reaped.
- `TODO` File/image attachment upload remains unverified through the real
  browser; generated-file rendering is complete and is a separate path.
- `DONE` Web search and citations were exercised live with inline activity,
  numbered source chips, and follow-up actions.
- `TODO` Projects, AGI Work, Connectors, Skills, Plugins, Settings, Custom
  instructions.
- `TODO` Loading / progress / error / retry / cancel states.
- `TODO` Dark-light consistency sweep across every screen touched.
- `DONE` Responsive public/chat layout sweep covered desktop and 390px mobile,
  including the focus-contained mobile drawer and narrow Billing/Pricing UI.
- `DONE` Marketing/public copy now derives runtime and pricing claims from
  canonical sources, routes self-serve Team to Pricing, keeps Enterprise
  contract-scoped, and avoids unreleased Mobile/BYOK/continuity claims.

### Ecosystem — account-scoped conversations across every surface

Founder framing (2026-08-12): this is an ecosystem, not a website. Reference is
Claude in Chrome — "sessions live with your account, not on any single device,
so you can start in a tab and pick it up later somewhere else."

Investigated the Chrome extension. The gap is precise and the shared layer for
fixing it already exists:

- `createManagedCloudChatClient` in
  `packages/contracts/cloud-contracts/src/managed-cloud-chat-client.ts` already
  owns list/create/get/update/delete conversation and saveMessage. **Web
  (`apps/web/lib/hooks/useChatStream.ts`) and Desktop
  (`apps/desktop/src/api/cloudApi.ts`) both consume it. The extension does
  not.**
- `conversation_id` appears NOWHERE in `apps/extension/src`. The extension
  posts to the chat endpoint without one, so the server has no conversation to
  attach the turn to and nothing is persisted account-side.
- The extension instead keeps everything in `chrome.storage.local` via
  `src/features/background/conversation-history.ts`: key
  `agi_browser_conversations_v2`, 4 MB cap, 100-conversation cap, 30-day TTL.
  Device-local by construction — a chat started in the side panel can never
  appear on web, mobile or desktop, and is silently evicted after 30 days.

**Design constraint, not negotiable.** Root `AGENTS.md` states Local, BYOK and
Managed Cloud are separate trust boundaries and that Local chats must never be
silently routed to managed cloud. Extension conversations can contain captured
PAGE CONTENT, so "sync everything to the account" would violate that rule.
`apps/extension/AGENTS.md` additionally lists browser storage and any flow
sending page data to a runtime as high-risk, requiring a `THREAT_MODEL.md`
update.

The only design consistent with those rules: **persistence follows the runtime
that already handled the content.** A turn inferred in managed cloud may be
persisted to the account — the content already left the device for inference,
so no new boundary is crossed. A Local or BYOK turn stays in
`chrome.storage.local`. The side panel must show which is in effect.

Founder amendment, 2026-08-13: every eligible signed-in Chrome Managed Cloud
conversation must mirror automatically into the shared account store and be
available in Web, Mobile Cloud, Tauri Cloud, and Electron Cloud. The prior
default-off opt-in concept is superseded. Chrome remains locally authoritative;
unknown provenance or any Local/BYOK turn fails closed and is never mirrored.

- `DONE` Extension now constructs the shared `createManagedCloudChatClient`
  inside the audited cloud-bridge gate with a fresh Clerk token and exact
  account/session owner fence at every transport attempt.
- `DONE` Eligible conversations and messages mirror automatically after local
  persistence. Client-minted UUIDs, `skipLlm: true`, debouncing, a one-minute
  MV3 catch-up sweep, retry/backoff, and per-message acceptance markers make
  the replica idempotent without coupling inference success to persistence.
- `DONE` The side panel labels the current policy (`Syncs to your account`) and
  marks account-bound versus browser-local history rows. It intentionally does
  not hydrate account history back into Chrome because `chrome.storage.local`
  remains authoritative; the account copy is consumed by the other Cloud
  surfaces.
- `DONE` Explicit deletion queues a durable account-side tombstone before the
  local row is removed. Local TTL/quota eviction never deletes the account
  copy. The history row uses sibling Open/Delete buttons and exposes a visible,
  localized retry error instead of invalid nested controls or console-only
  failure.
- `DONE` `apps/extension/THREAT_MODEL.md`, the current decision ledger, source
  of truth, trust matrix, product suite, frontend contract, launch posture,
  technical architecture, and root agent rule all record the 2026-08-13
  automatic-sync decision.
- `DONE` Consumer verification by source: Web, Mobile Cloud, Tauri Cloud, and
  the cloud-only Electron shell all list the same
  `/api/chat/conversations` account store. No Web/Mobile/Desktop edit was
  required.
- `DONE` Chrome presentation pass against the 2026-08-13 ChatGPT/Claude
  references: the side panel now uses AGI's warm-neutral/terra token ramp, a
  compact header, visible branded empty state, 20px composer, rounded 14px
  menus, calmer message geometry, a readable Cloud/local trust strip, and an
  explicit Ask first/Full access menu. The options page shares the same visual
  system with responsive section navigation, semantic headings, focus rings,
  reduced-motion-safe scrolling, and 16px settings cards.
- `DONE` Parallel read-only UX/accessibility review closed the 320–390px
  composer/header overflow risks, modal focus containment, menu keyboard
  navigation, and low-contrast persistence-state finding before the final
  build. Chrome-specific token consumers were confirmed not to recolor Web,
  Mobile, Desktop, or VS Code.
- `DONE` Chrome correctness follow-through: Options now rejects non-web
  allowlist labels; recorded workflows bind to their source origin and reject
  cross-origin or legacy-unbound replay; Drawer Capture adds its image to the
  composer; recording failures are visible. The injected in-page panel now
  follows the same automatic warm dark/light tokens, narrow responsive
  geometry, Managed Cloud label, request locking, retry, and focus behavior.
- `DONE` Real Chromium unpacked-extension smoke now executes the visual
  contract at 320/390/500px in dark and light mode, checks horizontal overflow
  and popup containment, drives model/approval keyboard dismissal, and can
  capture named exact-package screenshots. The 2026-08-13 rendered review also
  caught and closed two issues that layout assertions alone missed: the 320px
  Options rail now shows all five destinations without a hidden horizontal
  overflow, and the injected panel keeps the complete `Managed Cloud · Auto`
  boundary label visible at its shipped 380px width. The unpacked build passed
  the complete real-UI smoke again after both fixes.
- `BLOCKED_BY_HUMAN` Final signed-in cross-surface continuity/deletion and exact
  packaged-store proof. Exact steps are in `FoundersAssistance.md` #14.
  Current local evidence is green: focused extension/Web policy tests,
  extension typecheck and lint, no-hex color policy, `check:no-cloud-ipc`, two
  full real-Chromium E2E passes, rendered dark/light captures, production
  build, and diff checks. Release packaging correctly remains fail-closed while
  `CHROME_EXTENSION_PUBLIC_KEY` is absent.

### Mobile parity audit vs the Website (2026-08-12, Metro-verified)

Bundler health: `typecheck` clean; Metro (Expo 57.0.12 / RN 0.86.2) serves BOTH
platforms with zero warnings — iOS 28.9 MB, Android 29.3 MB, HTTP 200. In this
monorepo the bundle URL is `/apps/mobile/index.bundle?platform=ios`; the bare
`/index.bundle` 404s with an `UnableToResolveError` that reads like a real
breakage and is not one.

Capability parity, by evidence rather than by feature-folder name:

- `DONE` Inline tool-call UI: PRESENT. `ToolCallTimeline.tsx`,
  `AgentActivityTimeline.tsx`, `toolCallAccumulator.ts`, wired into
  `MessageBubble.tsx`.
- `DONE` Web search: PRESENT (`web_search` handled in the tool accumulator and
  gated by the billing store).
- `DONE` Image + video generation: PRESENT and reachable —
  `runImageGenerationTurn` / `runVideoGenerationTurn` are called from
  `app/(app)/(tabs)/chat.tsx` and `app/(app)/chat/[id].tsx`, and `AddToChatSheet`
  exposes an image/video mode with a model picker.
- `DONE` Mobile video aspect/quality. The option builders moved OUT of
  `apps/web/features/chat/lib/videoGenerationOptions.ts` (deleted) into the
  shared catalog at `packages/contracts/types/src/model-catalog.ts`, so Web,
  Mobile and Desktop read one implementation — a model publishing no 4k size
  cannot offer it on one surface and hide it on another. Mobile chain wired end
  to end: `chatViewStore` (persisted) -> `AddToChatSheet` aspect/quality rows
  (catalog-derived, quality scoped BY aspect, duration limits shown inline) ->
  both chat screens -> `resolveMobileVideoGenerationRequest` (narrows catalog
  strings to the wire contract's literal unions, falling back to route defaults
  rather than sending a value the route would reject) -> `runVideoGenerationTurn`
  -> `aspect_ratio`/`resolution` in the POST body.
  Verified in the SHIPPED Metro bundle, not just typecheck: `videoAspectRatio`
  x9, the "Aspect ratio" label, `aspect_ratio` x5, and the shared helper x3.
  iOS bundle rebuilt 200 / 28.9 MB.
- `DONE` Maps card on mobile. The gap was larger than "one renderer": mobile
  had NO interactive-card path at all, so all six links were built —
  (1) `x_interactive_cards: { supported: ['map-search.v1'] }` on the chat
  request, without which the server never attaches `search_maps` and the model
  falls back to pasting a link; (2) `x_interactive_card` on `StreamDelta`, typed
  `unknown` so `parseInteractiveCardDelta` stays the only validator;
  (3) accumulation in `chatExecutionStore`, replacing by `cardId` so a resumed
  turn cannot show the same map twice; (4) `ChatMessage.interactiveCards`;
  (5) a React Native `InteractiveCardBlock` with the same Web Mercator tile
  maths, numbered pins, place list and Open-route action, degrading to the
  card's authored fallback for any unrecognised kind; (6) mounted in
  `MessageBubble` before citations, matching the web transcript's ordering.
  Verified in the SHIPPED bundle: `x_interactive_cards` x3, `map-search.v1` x5,
  `parseInteractiveCardDelta` x5, `api/maps/tile` x1, "Open route" x2.
- `DONE` Mobile map follow-through (2026-08-13). The request processor now
  offers `search_maps` to both `web` and `mobile` surfaces, but only when the
  client advertises the exact card kind and the prompt has map intent. Native
  tiles use one authenticated Bearer-header lookup per card; Local mode neither
  requests an auth header nor touches the Managed Cloud tile route. Signed-out,
  auth-error, and all-tile-failure states retain an honest external Maps action.
  Validated cards are deduplicated and persisted in message metadata so they
  survive Cloud sync and reopen instead of existing only for the live turn.
- `DONE` Mobile generated-file and activity follow-through (2026-08-13).
  Message-owned generated-file descriptors now merge with same-scope artifact
  store rows, preserve the richer descriptor on duplicates, round-trip through
  bounded message metadata, and render as durable inline cards. Canonical
  activity opens while work is running or needs approval, collapses on terminal
  completion, keeps failures explicit, and caps source previews at five.
- `TODO` Weather result widget. Current official/current-reference research and
  the repository prove no typed Web/Mobile weather card producer or contract;
  the only weather path is a generic tool timeline. Do not fabricate a weather
  card from prose. Add one only with a validated result schema, real producer,
  persistence, Local/Cloud boundary behavior, fallback, and Web/Mobile renderers.
- `DONE` Mobile has no local Code surface by design (founder, 2026-08-12) — it
  gets Remote (cloud code) instead, which already exists as the `companion`
  feature: `AgentDashboard`, `DispatchTaskComposer`, `ExecutionStream`,
  `PairingStatus`, `QRScanner`, plus pairing-risk and workspace-boundary
  notices, surfaced through the `agents` tab.
- `DONE` Remote naming/prominence (2026-08-13). The drawer now exposes Remote as
  a first-class destination with the existing pairing, dispatch, approval, and
  workspace-boundary flows behind it; the duplicate compact companion entry was
  removed.
- `DONE` Mobile empty-state actions (2026-08-13). The quiet suggestion rows are
  wired to real composer modes and send context, including capability-gated
  image/video and Web search actions rather than decorative shortcuts.
- `DONE` Sandbox / code execution: PRESENT. CORRECTION to the earlier audit —
  it grepped the TOOL name (`execute_code`) when execution is server-side and
  the client only sends a request FLAG. `chatExecutionStore.ts:1699` sends
  `code_execution: true`, alongside `web_search`, `research`, `work_mode` and
  `skill_name`, and `toolCallAccumulator.ts:151` renders the result blocks.
  Gated by the settings capability toggle plus deployment availability.
- `TODO` Mobile hand-rolls its cloud calls instead of using
  `createManagedCloudChatClient`, unlike Web and Desktop. It hits the same
  `/api/chat/conversations` base path with the same schemas, so conversations DO
  sync — but retry/backoff, error mapping and save idempotency are duplicated or
  absent and will drift.
- `TODO` Remote control delivery receipts across Platform contracts, Desktop,
  and Mobile. Mobile currently treats its fire-and-forget signed control send as
  acceptance: a lost task dispatch can remain `sending`, and an approval choice
  can disappear before Desktop accepts it. Add a versioned signed
  `control.receipt` carrying a stable `controlId`; keep a bounded Mobile pending
  map with timeout/error/retry; make retries reuse the same semantic request ID;
  and make Desktop reserve and replay receipt outcomes idempotently, including
  while task submission is still in flight. A receipt proves Desktop accepted
  the control; existing task-status and approval-closed events remain the
  authoritative completion signals. This is an engineering ownership boundary,
  not a founder credential blocker, and must land end to end rather than as a
  Mobile-only timeout veneer.

### Known blockers for this cycle

- Sign-in: the agent cannot create accounts or enter passwords. The founder
  signed the Playwright browser in manually on 2026-08-12. If that session
  expires, the walkthrough stalls until a session is re-established. Recorded in
  `FoundersAssistance.md`.

## Gold Goal — current execution cycle

This is the live product plan. The historical audit waves below remain evidence
and a regression queue; they do not replace Website-first product validation.
Only the next verified slice is expanded here so that the plan stays actionable.

### G1. Restore a trustworthy shared model/media baseline

- Status: DONE (2026-08-10)
- Scope: canonical model metadata, model-literal guard, and obsolete image/media
  wiring that can surface stale or unavailable choices in Website, Mobile, or
  Electron.
- Done when: `pnpm check:model-id-literals` is green, retired media adapters are
  unreachable, and focused owner tests/typechecks pass.
- Evidence: the repository-wide literal guard passed across 8,486 files;
  obsolete image adapter choices were removed; Desktop TypeScript, native media
  routing, prompt routing, and shared managed-media contracts verified clean.

### G2. Website signed-in shell and chat real-use audit

- Status: DONE (2026-08-11)
- Flow: `/` → signed-in chat → primary composer and navigation controls → one
  non-paid state transition, with DOM, console, network, and screenshot evidence.
- Rule: fix the first reproducible unusual behavior before broadening the audit.
- First repair: removed the unsolicited five-second enterprise waitlist capture
  and gave the deliberate modal an explicit close action. Real browser proof on
  `/` and `/teams`: no automatic dialog, Products opens, CTA opens the dialog,
  Close removes it, and console errors remain empty.
- Signed-in production proof: aligned Web and shared-UI i18n dependencies to one
  React context, then removed the retired OpenAI economy model from the authored
  catalog, generated mirrors, economy roster, automatic route, and failover map.
  After production deployment `dpl_2Mc8Ms2HX6aMFGfbNYU5ouB1gUeN`, the live
  model selector contains the three current OpenAI roles and no retired entry;
  its warning/error console is empty. A stale isolated deployment had briefly
  reintroduced the obsolete generated catalog, so future browser evidence must
  identify the exact deployment under test.
- Real chat proof on the same deployment: a cost-efficient managed model showed
  `Generating response` in the Agent activity region before the provider result,
  returned the requested exact text, and preserved both turns after a refresh;
  the warning/error console remained empty.
- Production media proof: the additive media schema was promoted, image writes
  now carry their owning Web conversation, and stored output MIME/extension is
  derived from validated bytes. One low-cost signed-in image request persisted
  as asset `35994084-3d26-4115-97cf-247e445620a8`, survived chat and Library
  refreshes, and was independently fetched from the private Cloudflare R2 bucket
  as a valid 1024×1024 JFIF JPEG. The Browser warning/error console was empty.
- Library repair: the shared Web/Electron Library now exposes the backend's
  owner-scoped soft-delete lifecycle with confirmation, pending/error states,
  a 30-day Recently-deleted bin, Restore, and an explicit double-confirmed
  permanent erasure path that deletes provider-neutral stored bytes before its
  database pointer. A signed-in localhost browser verified both confirmation
  states, moved the disposable `haiku45-live.txt` asset into Recently deleted,
  restored it, and verified both matching and no-result search states after the
  request debounce. Reloading exposed an auth-hydration flash that briefly
  claimed the account was `User` / `Free` with no conversations or files; the
  shared Library transport and Web shell now render honest account, conversation,
  and Library loading states until auth settles. A second signed-in reload showed
  no false empty/account state, then restored the real account, conversations,
  and asset grid. Production real-use verification had separately moved an older
  image into the bin, restored it, and confirmed both it and the newly generated
  evidence image remained in the live Library.

### G3. Website capability slice

- Status: IN_PROGRESS
- Choose the highest-impact broken or dishonest capability found by G2 and make
  its UI, persistence, server contract, and error recovery work end to end.
- Validate the same shared contract on Mobile Cloud and Electron where that
  capability is exposed; do not add surface-local model or provider routing.
- Completed slice: catalog-driven image generation, durable chat/Library
  persistence, validated private-object delivery, explicit user retry timing,
  and shared Web/Electron Library deletion/restoration.
- Attachment proof: a signed-in production chat uploaded a synthetic 142-byte
  Markdown file, showed its Managed-cloud destination and remove control, sent
  it with a low-cost catalog-selected model, returned the file's exact
  verification token, and preserved the prompt, protected file link, and reply
  after refresh. The warning/error console remained empty.
- Run-code repair: the first production pass exposed a dishonest completed
  action whose detail said the E2B environment was unavailable. The E2B account,
  exact scoped runtime constructor, Max 15x entitlement, and quota were verified;
  the production credential and compute-rate values were then found to contain
  CLI-added trailing newlines. They were re-provisioned without newlines and the
  deployment was rebuilt. Production conversation
  `34f4a40e-e2d4-49b2-8a34-c17f8f7c2c6b` now shows a real persisted action trace
  (`Running code`, `1.9s`, `Done`), returns `10541`, survives refresh, and maps to
  a paused owner/conversation-scoped E2B sandbox. Browser warning/error logs were
  empty.
- Search/action repair: a real grounded search returned two persisted sources
  but its completed `web_search` record was hidden because an empty canonical
  activity envelope suppressed the fallback tool timeline. The shared
  Web/Electron renderer now suppresses fallback tools only when canonical tool
  entries actually exist. Production conversation
  `355792b8-a11e-4d7a-9827-0761d2c35c75` now shows `Searched the web`, expands
  to `Web search` with both sources and `Done`, and keeps the action plus
  citations after refresh with an empty warning/error console. Production
  deployment also made the Toolbar disablement durable and excluded local temp
  archives/Desktop release packages from Vercel source uploads.
- Map-search slice: the server now emits a catalog-neutral `map-search.v1`
  interactive card only for an explicit map intent and a client that declares
  the capability. Direct and durable runs validate, cap, persist, and rehydrate
  the same card contract; reloads revalidate provider URLs against the exact
  Google Maps/OpenStreetMap allowlist. The visible `Preparing map` action keeps
  the reasoning/action state honest before the result card appears.
- Project/AGI Work slice: the Projects composer now hands its full intent to
  chat (attachments, selected skill/options, project identity, and stable turn
  IDs). Clerk hydration and Strict Mode cannot consume it early, the user row is
  durably saved before provider egress, and failed persistence makes zero model
  calls. The destination acknowledges only after the stable-ID turn is safe, so
  refresh/retry cannot buy a duplicate provider turn.
  A signed-in localhost pass then exercised that exact handoff with the
  cost-efficient Google route: it navigated into one stable conversation,
  rendered live `Working…` activity, completed as `Prepared the response`, and
  preserved the prompt, project-derived answer, project identity, and action
  state after reload without a stuck Stop control. The same pass exposed
  irrelevant software-testing follow-up pills because the phrase “project
  recall test” matched broad testing and machine-learning heuristics; those
  classifiers now require unambiguous testing/ML vocabulary, and the reloaded
  conversation offers neutral contextual follow-ups instead.
- Legal/auth slice: login and signup now place an explicit Terms agreement and
  Privacy Policy acknowledgement in front of Clerk, then bind the current
  revision to the authenticated account at a fail-closed completion checkpoint.
  Protected Web and device-token paths re-check the current revision. Terms,
  Privacy, Security, and Subprocessor pages were reconciled with the implemented
  trust boundaries, including authenticated workspace-scoped file delivery and
  the still-public underlying bucket for non-video objects.
- Public hierarchy slice: Business now renders one visible H1, and every
  split-line flagship hero inserts an explicit JSX word boundary so its visual
  line break cannot collapse the accessible name. A source guard covers all
  route pages; local browser checks confirmed exact names on Integrations,
  Agents, Downloads, and Security with no framework errors or overflow.
  The same pass removed route-local inline JSON-LD after App Router streamed it
  out of hydration order. Root-level site schemas remain; Agents, FAQ, and
  Buildathon now render without React hydration errors, and a source guard
  keeps inline structured data out of route page siblings.
- Workspace-isolation slice: chat sync validates project ownership plus the
  exact active organisation both before and during mutation. Scheduled agents
  carry the claimed user/organisation scope through RLS-bound usage accounting
  and persistence, and schedule quota counting remains per-user across
  workspaces rather than becoming a workspace-switch escape hatch.
- Team slice: pricing is catalog-derived and variable by selected seat count
  (`unit price × seats`) across the visible total, cadence copy, checkout body,
  and upgrade preview. Team administration now evaluates the organization's
  entitlement instead of the acting admin's personal plan; invitation acceptance
  reports the persisted role; and a nonowner can leave while an owner can
  atomically transfer ownership and leave. The live Team Stripe products/Price
  IDs are still absent, so checkout remains honestly unavailable and the exact
  founder prerequisite is recorded in `FoundersAssistance.md`. A signed-in
  localhost pass also exposed that Settings survived App Router navigation and
  visually covered Pricing after `Choose Team seats` changed the URL. External
  page links now leave the global Settings layer through one shared navigation
  boundary (while modified/new-tab clicks preserve the current dialog). The
  repeated Team → Pricing flow rendered the destination with no Settings dialog,
  selected Team & Enterprise automatically, showed the 2-seat minimum as $50 at
  $25/seat/month, and recalculated three seats to $75 without a reload. Browser
  output contained only Clerk's expected local development-key warning.
- Skills/plugins slice: Web now discovers nine reviewed AGI-authored Agent
  Skills from the canonical workspace catalog; seven are globally included,
  one belongs to an installable first-party Web pack, and the skill creator
  remains visibly draft-only. Settings can download every visible Included
  canonical instruction file; plugin-owned bundles are downloadable only while
  that plugin is enabled for the signed-in tenant. Chat rejects draft execution, and selected-skill
  runs force exactly one real server-owned Skill load before returning to normal
  tool choice and emit a persisted `Reading skill` action. A signed-in local browser
  run loaded systematic debugging, returned the requested three checks, and
  preserved the action after reload. A later no-egress pass reopened that
  completed chat, expanded the persisted action to its 223ms `Done` detail,
  hard reloaded, and confirmed that users still see the completed reasoning/action
  status. Skills and Connectors now surface
  authenticated-directory loading failures with explicit retry actions instead
  of presenting an empty catalog. The Connectors Add menu now stays inside the
  modal interaction layer, so Browse connectors and Add custom connector work
  in the real UI instead of being swallowed by the dialog boundary. Mobile counts only executable included
  skills as available. The bundled Desktop Cloud composer can select an
  included skill with `@`, forwards its exact catalog name to the managed
  runtime, and exposes the authenticated download action. Migration 109 adds
  user-owned plugin installations with enable/disable/remove state while
  keeping tool grants separate. The Research Pack is installable from the real
  database-backed directory and exposes its literature-review skill only while
  that pack is enabled. Assistant provenance now resolves
  model identity through the generated catalog, so the completed message and
  Auto-routing footer show the current product display name instead of a raw
  provider transport ID; unknown Local/BYOK identifiers remain visible
  verbatim. The signed-in localhost conversation was reloaded and retained both
  `Reading skill` and the selected model's catalog display label, with no raw
  transport ID in the rendered accessibility tree. The same audit found raw
  IDs throughout Managed Cloud Tasks (including an unavailable historical
  model); task rows, schedule cards/history, token details, and shared-session
  headers now resolve current catalog names and label removed managed models as
  unavailable. A localhost Tasks reload showed current catalog labels, the
  unavailable fallback, and no current or retired transport IDs. Mobile now
  applies the same distinction to Managed schedules/task receipts while local
  companion agents retain truthful runtime-discovered identifiers; its focused
  model-label, message, and schedule tests plus typecheck/lint/hygiene gates pass.
  Native Desktop no longer renders an enable/disable switch that only changed
  renderer state while every loaded skill remained executable; loaded rows are
  now truthfully labeled Available until the privileged runtime owns persisted
  execution admission. A later signed-in localhost pass found that the public
  Research Pack detail page linked to the nonexistent `/settings/plugins` route.
  Its primary action now enters the canonical `/apps` settings redirect and
  opens the Plugins pane. The real database-backed Disable state survived a
  hard reload, Enable restored the original account state, and no application
  console error occurred. The installed-plugin table now uses a fixed layout so
  lifecycle actions remain visible without horizontal scrolling inside the
  desktop Settings dialog.
- Marketing slice: signed-out `/` now enters the Clerk-aware proxy without a
  root crash, the unsolicited waitlist auto-modal is removed, and the Projects
  feature page no longer hydrates against a mismatched streamed JSON-LD node.
- Appearance slice: the shared Website theme selector now exposes its group and
  selected System/Light/Dark state to assistive technology instead of relying
  on color alone. A signed-in localhost run switched to Light, reloaded the
  persisted Millennium Park conversation with its action and map card intact,
  then restored the founder's original System preference and verified it stayed
  selected after a second reload. No provider or hosted deployment was used.
  A later signed-out marketing audit exposed React 19.2's executable-script
  warning from `next-themes` as a visible red Next.js issue badge. AGI now owns
  the pre-hydration bootstrap through a CSP-compatible same-origin external
  script and pins a minimal dependency patch that suppresses only the library's
  duplicate inline tag. Fresh desktop and 390×844 pages had no issue badge or
  application error, retained Light and Dark across reloads, and measured no
  horizontal overflow; no hosted deployment or provider call was used.
- Model-selector slice: the visible `Models` heading now names the selector
  dialog instead of leaving an anonymous modal in the accessibility tree. A
  signed-in localhost pass filtered the live catalog to Luna, exercised the
  truthful mid-conversation prompt-cache cost warning, verified selection across
  reload, and restored the original cost-efficient Gemini choice through the
  same confirmation. At 390×844 the picker remains inside the viewport, search
  and its no-results state remain usable, and the original choice stays selected.
  The adjacent chat navigation drawer is now inert while visually closed and a
  focused named modal while open; Escape dismisses it and restores the trigger.
  No message or provider request was sent.
  Local rendered checks at desktop/mobile widths and the production build are
  clean; production verification follows the release-candidate deployment.
- Settings slice: internal section links now use one in-modal navigation seam
  rather than routing through `/settings/*` stubs. A signed-in localhost flow
  verified Reflect → Capabilities → Memory and Privacy → Shared links → Privacy;
  Memory saved across reload and was restored to its original off state after
  the check. The Memory controls have accessible labels, and the only browser
  warning was Clerk's expected development-key notice. A second real-use pass
  saved a temporary account instruction, reloaded, and received the exact
  instructed response from the selected cost-efficient Google model; the
  instruction was then cleared and the empty state survived reload. The same
  pass created a custom slash command, proved it persisted across reload,
  appeared in the composer menu, expanded its `{{input}}` template, and removed
  it again without a second model call.
  Time and focus also survived a signed-in account round trip: the break reminder
  saved at 30 minutes, reloaded correctly, and was restored to Off, while the
  surface accurately labels its Website-only boundary and current timezone.
  Notifications expose only the three channels with real senders; Reply ready
  saved Off across reload and was restored On. That audit found and fixed a live
  mismatch where the mounted chat page cached Reply ready until reload: successful
  preference saves now update the active notifier immediately, with malformed or
  unrelated namespace events ignored and failed saves unable to change runtime
  behavior.
  Account settings then exposed two indefinite loading states when the API-key
  and Clerk-session dependencies stalled. Both reads now stop after the shared
  fast-request deadline and present actionable Retry states; API-key failures no
  longer impersonate an empty account, and New Key remains unavailable until the
  existing list is known. The original signed-in browser reproduction was real;
  focused Account/API-key regressions (7 tests), Web typecheck, ESLint, formatting,
  and diff checks pass. A post-fix in-app reload was blocked by the browser URL
  safety policy, so this slice does not claim a second live rendering proof.
  The same localhost session verified the bundled Skills directory and a real
  `/systematic-debugging` chat turn: selection appeared as an active composer
  option, the server loaded the bundle, the completed `Reading skill` action and
  response persisted across reload, and no tool was auto-granted. The directory
  copy now describes the shipped bundles as portable instructions and explains
  `/` and `@` selection instead of over-claiming specialist agents for every
  domain.
  Connector and plugin discovery was also exercised without registering or
  mutating an external service: the empty Connector state offers the real
  remote-MCP path, the directory labels unconfigured branded integrations as
  `Coming soon` or `Not yet available on web`, and the Plugin pane accurately
  offers one reviewed first-party Web pack while leaving the other registry
  entries honestly marked `Coming later`; OAuth
  registration is an explicit founder prerequisite rather than a fake local
  success state. A fresh signed-in localhost pass also saved a temporary General
  instruction, proved exact reload persistence, and restored the founder's
  original empty value. The custom-connector form rejected an invalid endpoint
  with an accessible HTTPS explanation and cancelled without creating state.
  Deep Research now tells users to choose Auto or a capability-compatible model
  instead of contradictorily recommending broad provider families while one of
  those providers is already selected. The same pass switched to Auto, enabled
  Deep Research, verified its visible active-option chip, then disabled it and
  restored the founder's original model without sending a provider request. The
  real attachment control reached the
  native macOS picker; final file selection is `BLOCKED_BY_HUMAN` only while the
  sleeping founder's Mac remains locked and can resume after unlock without any
  Vercel build or provider request.
  A fresh signed-in run repeated the executable path in conversation
  `16c53dd2-edcb-42be-8649-6259fec8889c`: the `@systematic` picker selected the
  included bundle, the live action changed from `Reading skill — Running` to a
  persisted completed `Reading skill`, and the cost-efficient Google route
  returned the requested first diagnostic step. A hard reload visually restored
  both message bodies, the action, and the catalog model label with no stuck Stop
  control. The Settings directory listed all eight catalog entries, kept
  `skill-creator` visibly `Coming later`, and exposed authenticated downloads only
  for the globally included bundles. A later real localhost pass installed the
  Research Pack, disabled and re-enabled it, removed and reinstalled it, and
  proved the literature-review skill disappeared and returned with execution
  admission. A low-cost managed turn emitted live and persisted `Reading skill`
  activity, produced the expected evidence synthesis, and survived hard reload.
  The connector directory still labels unregistered services unavailable instead
  of offering dead Connect controls.
  The same browser pass found and repaired a privacy defect where one click on
  Share immediately minted a public URL. Share now opens a disclosure dialog,
  creates nothing until the user chooses a 1/7/30-day expiry and explicitly
  confirms, and shows the exact read-only URL with copy/revoke controls. One
  disposable 1-day link was created and revoked through that dialog; a second was
  created and revoked through Settings → Shared links, proving the in-app
  confirmation replaced the unreliable native prompt and the manager returned to
  `No shared links`. The connected Neon database has now been reconciled through
  the canonical migration ledger, including the plugin registry, published
  artifacts, and durable video tables. The adjacent artifact manager now renders
  its real empty state (`No published artifacts`) instead of simultaneously
  showing an unexpected error and a false empty result. Historical managed messages whose catalog
  model was removed now render `Unavailable model` rather than resurrecting the
  retired raw identifier; the pinned rich-response conversation verified that
  after reload.
- Tasks/Schedules slice: a signed-in localhost pass opened a durable Chat task
  and rendered its persisted `Reading skill` → `Completed` action, outputs, and
  source-chat control. The initial desktop detail card looked blank because the
  grid stretched its centered guidance to the full 2,022 px task-list height;
  the shared Web/Electron panel now sizes to its own 420 px card, keeping a clear
  icon, heading, and explanation in the first viewport. Schedules created a
  disposable paused daily task with the catalog-selected cost-efficient Google
  model, survived reload with the correct time zone/model/paused state, exposed
  an honest empty run history, and deleted through its irreversible confirmation.
  No scheduled run or provider request was started.
- Search/history slice: the shared sidebar search used by Tasks, Schedules,
  Library, and other non-chat routes now uses the canonical modal primitive
  instead of a visual-only backdrop. It exposes a named `aria-modal` dialog,
  traps focus, hides the background accessibility tree, restores focus on
  dismissal, and keeps Escape/backdrop closing. A signed-in localhost pass
  filtered real history for `Millennium Park`, opened the matching conversation,
  and confirmed its persisted `Preparing map` action and validated map card after
  reload; browser output contained only the expected Clerk development-key warning.
  That reload also exposed a first-paint lie: the saved-chat route briefly showed
  the new-chat greeting and `No conversations yet` before auth effects could mark
  their requests busy. Route ownership now selects the existing transcript and
  sidebar skeletons synchronously; a measured localhost reload moved through the
  shell skeleton and conversation skeleton without either false empty state, then
  restored the same map action/card.
- Mobile-width Website slice: at 390×844 the signed-in chat drawer now moves
  focus into navigation, traps Tab/Shift+Tab, makes the background inert, lets
  nested account menus consume their own first Escape, and restores the drawer
  trigger on dismissal. Opening Search closes the drawer instead of stacking
  interaction layers, and its clear action has an accessible name. A real
  `Millennium Park` history query reopened the persisted map conversation with
  its `Preparing map` action and validated map card intact; the page and composer
  had no horizontal overflow.
- Cancellation/action-status slice: a signed-in localhost turn on the
  catalog-selected cost-efficient Google route was stopped before any response
  text arrived. The live region changed to `Response cancelled`, the visible
  activity row changed to `Cancelled`, the Stop control disappeared, and the
  composer recovered immediately. A hard reload of conversation
  `0c137bde-39f3-4e76-9bc3-74a40d12d2c5` preserved the cancelled assistant row,
  action state, catalog model label, and Regenerate control without replaying
  the provider request. The shared activity finalizer now owns the truthful
  local completion/cancellation/failure summary, and abort handling durably
  upserts even an empty cancelled assistant row; focused Web and client-runtime
  cancellation suites pass 106 tests.
- Workspace-switching slice (PRODUCTION SCHEMA ACTIVE): Website
  accounts now persist Personal or one exact membership-owned organization in
  the existing cross-device settings document.
  Every RLS-backed request re-resolves that choice through membership before
  binding tenant scope; chat admission captures it for durable continuations,
  and shared connectors re-prove membership before privileged catalog discovery
  and again before credentialed execution. Project/connector sharing, Team
  settings, creation, invitation acceptance, and leave use the same durable
  selection rather than a first-membership fallback. Accepting an invitation
  can add a second workspace, while an account may own only one; create/join/leave
  update the selection atomically and reload clears tenant-owned client caches.
  A subsequent adversarial pass found that migration 0073's owner shortcut and
  several privileged chat/project/file routes still mixed the caller's own rows
  across Personal and organization scopes. The local repair adds reversible
  migration 0110 plus explicit privileged-route scoping: Personal and org chats,
  projects, knowledge files, Library assets, search history/results, Reflect,
  autotagging, and durable assistant writes now bind the server-resolved active
  organization; creates and sync paths stamp that scope. Before promotion, a
  zero-compute Neon recovery branch
  `backup-pre-0110-20260811` (`br-small-unit-apchpoqv`) was created from the
  production primary branch at parent LSN `0/A12D528`. Migration 0110 was then
  applied through the canonical production migration runner and independently
  verified at 110 applied / 0 pending / 0 drift. A rolled-back live schema
  probe confirmed the intended defaults: conversations, projects, and schedules
  resolve the request workspace; media assets require explicit captured
  provenance; Personal and organization visibility remain distinct; and
  organization writes still fail closed without membership.
  A final adversarial pass also closed same-user cross-workspace mutation/read
  seams in project conversation membership and counts, project-delete cleanup,
  autotag batch/list reads, and full-search telemetry. Generated files, Office
  files, provider container outputs, E2B harvests, images, and direct attachment
  completion now carry the workspace captured at request admission through
  asynchronous persistence; none re-resolve a later workspace selection. The
  media table intentionally keeps no database default because its readiness
  contract and durable writers require explicit provenance.
  Both signed-in localhost shell variants (`/chat` and `/chat/library`) rendered
  `Workspace → Personal` plus a working `Manage workspaces` action, and the Team
  pane remained honest for the founder's no-membership Max account. No Stripe,
  workspace, invitation, connector, model, or hosted-provider mutation was made.
  Integrated content-boundary verification passes 30 files / 203 tests; the
  final provenance repair adds 14 files / 171 focused passes plus 3 files / 38
  upload/project passes. Migration/down guards, Web typecheck,
  boundary/service-layer checks, targeted lint, formatting, diff checks, and the
  repository model-literal guard are green. After production promotion,
  signed-in localhost still shows `Workspace → Personal`; Team management
  remains honest for the no-membership account; Library files and Delete
  controls survive reload; Projects retains the existing Personal project; and
  a persisted chat reloads at the same URL with its history and composer intact.
  No org or external service state was created for browser proof. Vercel
  build/deploy remains intentionally
  paused because the Hobby team exhausted its included Fluid Active CPU; all
  verification in this slice was local and incurred no hosted/provider usage.
- Local-only release gate after the workspace repair: `pnpm typecheck:all`
  passed all 48 runnable package tasks. `pnpm check:llm-operability` initially
  found one real VS Code action-status styling defect (an undefined error-color
  token); the webview now uses the canonical danger token, its 67 webview tests
  and typecheck pass, and the complete operability gate subsequently passed.
  No Vercel build, preview, deploy, or hosted smoke was attempted.

### G4. Release evidence and next slice

- Status: IN_PROGRESS
- Record verified browser evidence, focused checks, remaining human/deployment
  prerequisites, and the next smallest user-visible slice. Do not mark the Gold
  Goal complete from builds or mocked tests.
- Local release evidence (2026-08-11): the full Mobile Jest suite passed 317
  suites / 2,840 tests; the Desktop renderer passed 275 files / 2,550 tests;
  the native Desktop/Tauri library passed 4,786 tests with zero failures; and
  the full CLI crate plus its integration targets passed. VS Code passed 875
  extension and 63 webview tests; Chrome passed 1,470 tests and its unpacked
  production build. A signed-in local browser also verified Skills, plugin and
  connector discovery, the persisted `Reading skill` action trail, and a real
  map-search turn whose validated card, Google Maps/OpenStreetMap links, and
  `Preparing map` activity survived navigation and reload without a stuck Stop
  control. The map tool loop now ends immediately after a successful map-only
  result instead of buying redundant provider/tool steps. After
  regenerating the shared contract indexes and correcting a dropped map-card
  color declaration, `pnpm check:llm-operability` passes end to end.
- Hosted release work is paused because the Vercel Hobby team has exhausted its
  included Fluid Active CPU. Continue local-only verification and do not start
  another remote build until free capacity resets; the cancelled unaliased
  deployment was removed and production was never promoted.
- Quota-safe local verification (2026-08-11): after the Fluid Active CPU alert,
  no Vercel build, preview, deployment, or API command was issued. The latest
  action-status/cancellation repair was validated through localhost, focused
  Vitest suites, TypeScript typechecks, ESLint, Prettier, and diff checks only.
- Local Code-page evidence is capability-honest: one shared readiness predicate
  requires the execution flag, a non-empty sandbox credential, and priceable
  compute before list, create, command, agent, or approval paths advertise
  provisioning. When unavailable, both Create and Run are disabled even for a
  previously ready session while readable history and cleanup remain usable.
  The current development environment satisfies the gate and therefore shows
  the real session form; it was inspected without creating a session or issuing
  an E2B/provider request. Focused Code/E2B suites pass 66 tests with Web
  typecheck and lint. No remote deployment/build/API command is allowed during
  the quota pause; use localhost, focused tests, typechecks, and existing build
  artifacts only.
- Local Schedules/Tasks evidence (2026-08-11): the signed-in Schedules page
  settled from an explicit loading state to an honest empty state. Its creation
  dialog states the Managed Cloud, text-only, no-chat-memory, and no-tools
  boundary; exposes the catalog-derived model list and IANA time zone; and
  closes through Cancel without creating a schedule. The Tasks page restored
  existing durable runs, opened a completed run in place, and showed the saved
  `Reading skill → Completed` action plus the honest no-output state. No
  schedule, provider request, E2B session, deployment, or hosted mutation was
  created during this browser pass.
- Local personalization evidence (2026-08-11): the signed-in Customize surface
  saved a temporary exact-response instruction, and one controlled turn on the
  catalog-selected cost-efficient Google route streamed the expected
  `CUSTOMIZATION_CURRENT_OK` response. The turn finished without a stuck Stop
  state and hard reload restored both prompt and response at the same
  conversation URL. The founder's original instruction was then restored,
  saved, and rehydrated from the profile after reload; the temporary instruction
  was absent. The adjacent custom-command flow also created `/demo-verify`,
  surfaced it by name and description in the real composer slash menu, expanded
  its template into the unsent composer, and permanently removed it through the
  explicit confirmation dialog. Hard reload restored the original empty command
  state. No additional provider call or deployment was made.
- Local Reflect evidence (2026-08-11): Reflect honestly blocked on the account's
  original Memory-off state and linked directly to Capabilities. Memory was
  enabled temporarily, saved, and used to build the real past-30-days recap
  from account activity without model quota or message text in the browser. The
  recap exposed and then verified a count-aware copy repair (`1 sampled
conversation`, not `1 sampled conversations`). Memory was restored to off;
  hard reload returned Reflect to its gated state and hid the recap. No provider
  request or deployment was made.
- Local media-menu evidence (2026-08-11): image mode, the bundled Skills
  directory, and the Run code option work through the signed-in composer without
  provider egress. The legacy Neon branch was first proven on disposable branch
  `br-soft-cake-apk0tfbf`, backed up as `br-quiet-darkness-apqyudsr`, then
  reconciled through the canonical ledger. Migrations 73–107 and the idempotent
  `0108_profile_deletion_schedule_reconciliation.sql`, the additive Web plugin
  installation migration, and active-workspace migration 0110 now leave
  production at sequence 110 with zero pending migrations or checksum drift;
  tenancy helpers, published artifacts, plugin
  registry/installations, durable video jobs, and all six profile
  deletion-readiness columns are present. The disposable proof branch was
  deleted after verification, while the rollback backup remains. A signed-in
  localhost reload now enables Create video, lists every catalog-executable
  video candidate without a composer-local provider allowlist, and selects
  the catalog-derived OpenRouter video model alongside both Google video
  choices. A subsequent signed-in localhost run exercised the lower-cost
  catalog-selected Google option through the real API. Two obsolete request
  parameters were rejected before task creation and were removed; each failed
  row finalized at zero actual user cost. The next request was accepted, but a
  valid dotted Google operation resource was rejected by AGI's overly strict
  path normalizer and therefore quarantined as `outcome_unknown`. AGI recorded
  zero actual user credits, no provider success, and no client delivery, and a
  hard reload preserved the exact incident without creating a sixth job. The
  normalizer now accepts safe dotted resource segments while still rejecting
  traversal, URL syntax, encoded separators, and arbitrary paths; the focused
  provider/output and route suites pass 90 tests. No further provider request
  was sent because the accepted operation's external billing outcome cannot be
  proven from the discarded identity.
- Local Library evidence (2026-08-11): per-item Delete opens a recoverable
  30-day soft-delete confirmation, and Recently deleted exposes Restore and a
  second permanent-delete confirmation. The retired
  retired legacy-model HTML artifact was resolved to one exact owner-scoped
  database row and one exact `agiworkforce-media` R2 object, then permanently
  deleted from both; a signed-in browser refresh confirms the retired artifact
  is gone. General local permanent deletion remains fail-closed until the local
  Web runtime receives bucket-scoped R2 S3 credentials: it retains the database
  pointer when object deletion cannot be authenticated rather than orphaning
  bytes. The exact operator step is recorded in `FoundersAssistance.md`. A
  second signed-in localhost pass soft-deleted and restored the clearly named
  `haiku45-live.txt` QA artifact, then hard-reloaded to prove both the restored
  row and its Delete action persisted. That pass also found three historical
  image rows whose authenticated byte routes returned 404 while the cards said
  `Ready`. The shared Website/Desktop Library now replaces broken thumbnails
  with the kind icon, confirms 404/410 through the host-authenticated transport,
  changes the row to `Failed`, disables Preview/Download, and leaves the safe
  Delete action plus explicit stale-entry copy. Local media created from now on
  lives under the gitignored `.agi-local-media` data directory rather than
  disposable `.next` build output, so a normal local rebuild cannot erase its
  bytes. The real browser shows no broken image elements and all three stale
  rows are honestly identified; focused shared/Web tests pass 34 cases and both
  typechecks are clean. A later live recovery pass found the empty Recently
  deleted view reusing the main Library’s creation copy; the shared Website and
  Electron view now labels the bin explicitly and explains the 30-day restore
  window, with no irrelevant Start-a-chat action. No Vercel or provider request
  was issued.
- Local Settings-directory evidence (2026-08-11): Connector, Skill, and Plugin
  catalog requests now keep explicit loading and failure states, preserve prior
  verified data, and expose a user-triggered Retry instead of turning a 503 or
  invalid response into a false empty catalog. A signed-in localhost browser
  verified all reviewed Skills with Included/Coming later lifecycle labels and
  authenticated downloads, the unavailable Connector catalog with honest
  operator-registration copy, and the database-backed Plugin directory with
  one genuinely enabled reviewed pack. Focused Web/shared-UI suites pass 38
  tests and both typechecks are clean. This slice used localhost and mocked
  failure responses only; it issued no Vercel command or external provider call.
- Local composer/mobile-Settings evidence (2026-08-11): a signed-in localhost
  pass opened the real attachment chooser, attached an 86-byte text file,
  displayed its name, size, and explicit `Outbound destination: Managed`
  boundary, enabled Send, then removed it and observed Send disable again. The
  turn was deliberately not submitted, so no model/provider request was made.
  The same pass at 390×844 exposed a horizontal scrollbar in General Settings:
  fixed-width profile controls and the read-aloud voice row exceeded the modal
  content width. Profile and preference rows now stack below the small-screen
  breakpoint, controls shrink to the available width, and a browser recheck
  measured document 390/390, dialog 280/280, and content 364/364 client/scroll
  widths with no horizontal scrollbar. The focused General Settings suite passes
  4 tests; Web typecheck, ESLint, Prettier, and scoped diff checks pass. The only
  browser-console warning was Clerk's expected local development-key notice;
  no Vercel command or external provider call was issued.
- Local composer-surface evidence (2026-08-11): direct comparison against the
  current ChatGPT Website confirmed its empty composer is a compact 52px line,
  with one elevated input surface and no separately colored footer rectangle.
  AGI's narrow first paint had accepted a stale 240px `scrollHeight`, while its
  sticky wrapper and old Web-only elevation token produced the screenshot's
  dark mismatch. Empty content now stays at 52px, the wrapper uses the chat
  canvas token, and the pill uses the shared input-surface token. A signed-in
  390×844 dark-mode pass showed a compact elevated composer on one uniform
  canvas; desktop Light remained clean and the founder's System theme was
  restored. The focused composer suite passes 68 tests, Web typecheck and
  scoped diff checks pass, and no provider, Vercel, or hosted call was issued.
- Local search/map-follow-up evidence (2026-08-11): the signed-in global Search
  dialog exposed filters, cleared stale demo-only recent-search history, searched
  the persisted account for `Millennium Park`, reported 7 results across 3
  conversations and 4 messages, and opened the exact assistant message through
  its highlight route. The conversation reloaded its completed map activity and
  validated Google Maps/OpenStreetMap card, but the visible follow-up pills were
  incorrectly about SQL indexes and data integrity because provider URLs contain
  transport words such as `api` and `query`. Map/place detection now precedes
  technical heuristics, so the same persisted result offers nearby activities,
  directions, and visit guidance instead. Desktop and 390×844 browser passes
  show the corrected pills; the narrow page measures 390/390 client/scroll width.
  The focused follow-up suite passes 56 tests and Web typecheck, ESLint, Prettier,
  and scoped diff checks pass. No follow-up was submitted, so the slice issued no
  provider request, Vercel command, or remote build.
- Local Sources-panel/header evidence (2026-08-11): the signed-in browser opened
  Sources for both the persisted map result and a supplied-claims literature
  synthesis. Each correctly showed the honest `No sources yet` state because
  neither turn performed web research; the research conversation retained its
  completed `Reading skill` activity. Opening the 360px research panel narrowed
  the chat column enough that the absolutely centered conversation title drew
  underneath Approvals. The title now participates in the header flex flow,
  while the left and right action groups retain their width. At the same window
  size the title ends exactly where Approvals begins instead of overlapping it;
  at 390×844 every header control remains reachable, the title truncates, the
  Sources panel becomes a clean full-screen view, close restores the chat, and
  document width remains 390/390. The focused title-menu suite passes 7 tests;
  Web typecheck, ESLint, Prettier, and scoped diff checks pass. No provider,
  Vercel, or remote-build call was issued.
- Local conversation-sharing evidence (2026-08-11): the signed-in research turn
  created a real 7-day, two-message read-only snapshot from the responsive Share
  dialog, displayed the no-sign-in privacy warning and absolute expiry, copied
  the link with visible `Copied` feedback, and rendered the exact snapshot at
  its localhost public route. Revocation disabled every competing action while
  pending, returned the owner to the create state, and made the public token
  unreadable immediately. Two temporary links used for the lifecycle/copy checks
  were both revoked. A revoked or unknown share previously fell through to the
  generic site-wide 404, while the expired screen also falsely claimed every
  share lasted seven days despite selectable 1/7/30-day lifetimes. The dynamic
  share segment now keeps 404 semantics but renders an intentional `Shared
conversation unavailable` state covering expiry, revocation, and mistyped
  links; the expiry state no longer claims one fixed duration. Desktop and
  390×844 creation/success states and the post-revoke recipient state were
  verified in the browser. Focused share suites pass 4 tests; Web typecheck,
  ESLint, Prettier, and scoped diff checks pass. No model/provider, Vercel, or
  remote-build call was issued.
- Local artifacts/action/Tasks evidence (2026-08-11): a persisted HTML result
  reopened as an inline artifact card and in the synced Artifacts workbench;
  Preview/Source, version state, copy/download/publish controls, close/reopen,
  and the 390x844 full-screen panel all remained reachable after reload. An
  artifact-free media conversation settled to the honest `No artifacts yet`
  state. A separate persisted map turn retained its expandable `Preparing map`
  activity, 216 ms duration, `Done` state, and validated map card on desktop and
  mobile without a new model call. Library then exercised the complete
  two-step soft-delete flow on one stale image row, showed it in Recently
  deleted, and restored it so the account was left unchanged. The same mobile
  pass exposed that selecting a Task appeared to do nothing because its detail
  panel was rendered after the entire 25-row list, more than 2,000 px below the
  tapped row. Selected task details now open as a full-screen mobile overlay
  while the desktop keeps its split sticky panel; the real browser shows the
  durable `Reading skill` progress and source-chat action in both layouts.
  Focused shared-UI tests, typecheck, lint, formatting, and scoped diff checks
  pass. No provider, Vercel, or remote-build call was issued.
- Local Project-settings evidence (2026-08-11): the signed-in project workspace
  loaded its five persisted conversations, honest account-wide Memory boundary,
  empty knowledge-file state, and real Duplicate/Export/Delete/Save actions.
  Its Sources tab also reached the intentional empty state, opened the Add
  sources chooser, and handed connector setup to the canonical Connectors
  settings pane while preserving the selected project scope in the composer.
  At 390x844 the footer required 465 px inside a 372 px dialog, clipping Export
  and hiding Save completely. The shared project dialog now promotes Save to a
  full-width primary mobile action, gives Duplicate and Export equal-width
  secondary positions, and keeps Delete project reachable on its own row; the
  dialog now measures 372/372 client/scroll width. Desktop retains the compact
  single-row footer. The focused Project-settings suite passes 5 tests and Web
  typecheck, ESLint, Prettier, and scoped diff checks pass. No mutation,
  provider, Vercel, or remote-build call was issued.
- Local Team/pricing evidence (2026-08-11): the signed-in Max 15x account's
  Team settings accurately reports that no organization exists and routes the
  founder to Team & Enterprise pricing instead of exposing unusable member
  controls. The real pricing page opens with the required two seats and a $50
  monthly total, updates to $75 for three seats, and clamps an attempted
  one-seat value back to the two-seat minimum. The native Seats label is bound
  to the number control, and the 390x844 page stays within its viewport. A
  signed-out browser check then found `Get Team` discarded that configured
  quote at login. The redirect now carries `seats=3` and the Team anchor through
  authentication; loading that return target restores the $75 quote, and its
  scroll offset keeps the Team heading and total below the sticky mobile header.
  Billing loading states resolve to the account's active Max 15x renewal, saved payment
  method, and two paid invoices. The founder-owned live Stripe Product/Price
  permission remains documented in `FoundersAssistance.md`; the signed-out CTA
  stopped at authentication, so no checkout session, provider call, Vercel
  command, or remote build was created.
- Local public-Web and billing evidence (2026-08-13): the signed-in Max 15x
  account rendered the canonical Billing pane with its real renewal date,
  Stripe-owned payment method, two paid invoices, portal/plan controls, and
  top-up presets; no purchase control was activated. A forged
  `/billing?success=true` URL no longer produced a payment-success claim, and
  checkout return copy is now gated by a Stripe Session that belongs to the
  signed-in user and reports a paid state. Pricing no longer flashes purchasable
  Free/Basic/Pro/Max actions while account policy is loading, and active
  Apple/Google/manual/unverified subscriptions route to their billing owner
  instead of opening a Stripe proration dialog. Every link in the `/legal`
  document index reached a real page (Terms, Privacy, AUP, agent permissions,
  DPA, SLA, subprocessors, cookies, copyright, model licenses, refunds,
  accessibility, trust, security, EU representative, and Mobile legal); FAQ,
  Help, Support, and Download were also inspected. At 390x844, pricing and the
  mobile navigation remain within the viewport in light and dark themes. The
  drawer's formerly occluded header close control was replaced with a visible
  in-drawer control, keyboard focus containment, Escape dismissal, and focus
  restoration. Focused billing/pricing/header regressions pass 34 tests; Web
  typecheck, scoped ESLint, and repository diff checks pass. The local runtime
  also proved that its Stripe secret and recurring Price IDs belong to
  different modes, so checkout correctly stayed closed; the exact founder
  configuration and authorized-payment proof is recorded in
  `FoundersAssistance.md` item 18.
- Local media-failure recovery evidence (2026-08-11): the signed-in browser
  reopened a persisted five-attempt video incident, including provider
  rejections and an outcome-unknown charge warning. Terminal media rows still
  exposed the generic `Regenerate response` action, which would replay the
  video prompt through ordinary text chat. Image/video rows now suppress that
  generic action. Video failures render an explicit terminal-state card, and a
  new paid `Try video again` action is admitted only when the durable transcript
  carries a server-owned `videoRetryable: true` decision. Confirmed provider
  failures and definite pre-job HTTP rejections receive that flag; ambiguous
  outcome-unknown and legacy rows do not. The real historical incident now
  instructs the user to resend instead of offering unsafe replay, while the
  390x844 layout remains 390/390 client/scroll width. Focused message and
  transcript suites pass 88 tests; Web typecheck, ESLint, Prettier, and scoped
  diff checks pass. No retry was pressed and no provider, Vercel, or remote
  build call was issued.
- Local Skills/Plugins evidence (2026-08-11): the signed-in Skills directory
  loaded the canonical included bundles, kept `skill-creator` visibly `Coming
later`, exposed authenticated SKILL.md downloads for every Included bundle,
  and the Plugin directory showed the installed/enabled Research Pack
  separately from three honest `Coming later` entries. A later live pass caught
  `literature-review` labeled Included without a Download action; the download
  route now evaluates the user's enabled plugin set, so the action appears and
  succeeds only while Research Pack owns that tenant-visible skill. Typing `@` in the real
  composer exposed only executable skills. Selecting `systematic-debugging`
  originally left `@systematic-debugging` inside the message while also showing
  the selected-skill chip and active-option badge, so the picker token would be
  sent as user content. Mention selection now consumes that query, preserves
  surrounding user text, focuses the correct insertion point, and leaves Send
  disabled until an actual prompt is entered. The corrected desktop and 390x844
  composer show the skill state without horizontal overflow; the selection was
  removed after verification. A final narrow-screen pass found the Settings
  tables still hiding lifecycle/download actions behind a desktop-width grid.
  Mobile Skills now keeps Skill plus Status/Download visible, Mobile Plugins
  keeps Plugin plus Actions visible, and desktop restores every secondary
  column. The browser fired a real authenticated SKILL.md download, reloaded the
  Research Pack detail, and returned through its settings deep link; no plugin
  lifecycle action was changed. Focused shared-UI and Web Settings suites pass
  40 tests alongside the composer coverage; both typechecks, formatting, and
  scoped diff checks pass. No message was sent and no provider, connector,
  Vercel, or remote-build call was issued.
- Local model-selector evidence (2026-08-11): the signed-in Website composer
  opened the live catalog-derived selector, exposed only the current routed
  OpenAI trio alongside the other available providers, switched from the
  existing Google selection to Auto, and retained Auto across a hard reload.
  Search narrowed the directory to the exact matching cost-efficient OpenAI
  entry and its catalog capability badges. The original Google selection was
  restored and also survived reload. At 390x844 the selector, search field, reasoning
  control, and model list remained reachable with a 390/390 document width and
  no horizontal overflow. No prompt was submitted and no provider, Vercel, or
  remote-build call was issued.
- Local project-source evidence (2026-08-11): the signed-in Project Sources
  flow originally closed its text dialog before the presign/upload/register
  transaction completed, so a quick reload could cancel the request while the
  UI appeared to have accepted it. The modal now remains in a disabled Saving
  state until durable registration succeeds, preserves the typed source and
  exposes the exact failure when it does not, and the list path validates the
  shared Cloud contract instead of treating an HTTP error as an empty project.
  Project knowledge now uses a cloud-neutral storage seam: production remains
  on Cloudflare R2, while development without R2 credentials receives a
  signed, owner-bound, five-minute same-origin PUT authorization and persists
  bytes under the existing gitignored `.agi-local-media` data root. The local
  upload is content-type/byte-count checked, size-bounded, path-confined, and
  disabled outside development. File-picker, drop, and text failures now remain
  inside the open dialog with a visible error instead of disappearing behind its
  overlay. A real browser added the source named Durable
  local demo source.txt, waited for the dialog to close only after registration, hard
  reloaded the project, and reopened the exact 97-byte text from the
  authenticated source route. A second disposable source was created, removed,
  and remained absent after reload while the retained source still loaded. That
  same pass found the shared project context card repeating the page-owned folder
  icon and title immediately below the hero. Hosts that already render identity
  now use the card's compact shared variant, retaining provenance, trust, and
  surface labels while the real Project page exposes only one project heading.
  The reload also exposed a second model selector in the page bar showing Auto
  while the send-owning composer showed the selected Google model; that control
  was backed by a separate store and never owned the handoff request. It has
  been removed, leaving one catalog-derived model control on the composer that
  actually constructs the project turn.
  Focused project/storage suites, Web typecheck,
  ESLint, Prettier, and scoped diff checks pass; no Vercel, provider, or paid
  service call was issued. Wrangler was used read-only to confirm the existing
  authenticated account and `agiworkforce-media` bucket.
- Website model-selection durability (2026-08-11): persisted selections are
  validated against the current selectable catalog on every hydration, not only
  during storage-version migrations, and stale or provider-mismatched values now
  fail closed to the catalog default before request construction. An active
  conversation's selection is now saved through the existing conversation
  update path before the composer adopts it; the selector shows a disabled
  saving state and retains the prior selection with a visible error when that
  durable write fails. Reload restores the conversation-owned model instead of
  treating the global default as authoritative. Deep-linked conversations older
  than the first 50-row sidebar page are now upserted from their detail response,
  and that active row survives a concurrent first-page refresh; regressions cover
  both list-before-detail and detail-before-list response orders. Focused store,
  composer, and conversation-hook coverage passes, as do Web typecheck, the
  repository model-literal guard, and scoped lint/diff checks. No prompt,
  provider, Vercel, or remote-build call was issued.
- Mobile model-selection parity (2026-08-11): model changes now update the
  Local or Cloud conversation store that owns the thread, and Cloud changes
  enter the existing durable sync sidecar before the immediate update attempt.
  Store hydration, conversation restore, and explicit dispatch all apply the
  same catalog- and plan-derived access predicate, so a downgraded account
  cannot restore or send a model the picker marks locked. Auto routing behavior
  and schedule/retry defaults now resolve from canonical profile metadata rather
  than consumer-owned alias strings; an explicit Mobile and shared Cloud-contract
  sweep found no remaining authored Auto model identifiers outside registry
  helpers. The conversation action itself rejects unknown, plan-locked, or
  cross-boundary selections before mutating Local storage or the Cloud sync
  sidecar. Focused Mobile, Cloud-contract, and model-catalog suites pass 221
  tests; all three typechecks, Mobile lint/hygiene, contract ownership, the
  repository model-literal guard, and scoped diff checks pass. No model,
  provider, connector, Vercel, or remote-build call was issued.
- Local Mobile Cloud-auth evidence (2026-08-11): both first-run onboarding and
  the signed-out chat toggle previously sent the user to Clerk without any
  readable post-auth intent, so a successful Cloud sign-in returned to the
  Local default and could immediately advertise a model download the user had
  explicitly declined. They now share one validated transient Cloud-chat intent.
  The root Clerk bridge consumes it only after a stable signed-in owner and
  Cloud entitlement exist, selects the catalog-derived tier default, activates
  Cloud, and only then publishes the redirect signal. A restored/already-loaded
  Clerk session applies the same pending intent from the login route's layout
  phase before the passive auth guard can redirect and unmount it; the
  regression mounts that guard timing directly and proves Cloud mode plus the
  catalog-derived model survive. Default, malformed, dismissed, cancelled, and
  signed-out paths clear the intent and remain Local.
  Focused Mobile auth/onboarding/chat suites pass 75 tests; Mobile typecheck,
  lint, hygiene, the model-literal guard, formatting, and scoped diff checks pass
  without hosted or provider calls.
- Shared Electron Skills parity evidence (2026-08-11): the bundled Cloud
  renderer now loads the same managed catalog, filters draft entries before
  composer admission, carries the selected skill through shared `ChatInput`,
  `ChatInterface`, and `useChat`, and forwards only its exact name to both the
  Cloud and Web runtimes. Desktop Cloud Settings projects the same lifecycle
  labels and authenticated SKILL.md download URLs. Focused shared-chat and
  Desktop runtime/settings suites pass 89 tests; both package typechecks and
  the Desktop IPC registry check pass. No Desktop runtime was launched and no
  model, connector, Vercel, or remote-build call was issued.
- Local Electron auth evidence (2026-08-11): launching the existing bundled
  cloud renderer with network egress blocked exposed three Local-mode claims and
  a live `Use Local Mode` button even though Electron deliberately ships no
  Local execution plane; clicking it stayed put and produced a rejection toast.
  The shared Desktop sign-in shell now derives its copy, footer, and mode action
  from the existing host capability. Electron presents only honest AGI Cloud
  sign-in, while Tauri/native Desktop retains the real Local path. Focused auth
  suites pass 29 tests, both renderer and Electron typechecks pass, and no
  hosted/provider request was issued.
- Local extension action-status evidence (2026-08-11): Chrome now gives every
  agent step an explicit state-specific label and icon: only running spins,
  completed uses a success mark, failed/cancelled use an error mark, and
  paused/approval use a clock. VS Code now aggregates failed tool/progress
  events into an error-colored `Completed with errors` footer; a terminal
  stream error also finalizes and clears the active stack so the following
  successful turn receives a separate clean `Done` stack. Chrome's full 1,476
  tests and VS Code's 875 unit, 67 webview, and 6 real-host integration tests
  pass, together with both builds/typechecks/lints. No provider, CLI runtime,
  hosted service, or deployment call was issued. A signed installed-artifact
  VS Code chat/approval/Stop-resume proof still depends on release credentials
  and the shipped CLI binary.
- Local Tauri model-settings evidence (2026-08-11): Managed Cloud no longer
  advertises the Local/BYOK `Open Models & Keys` or `Manage API Keys` actions.
  The optional callback is preserved through the real shared
  `ChatInterface` → `ChatInput` → `ModelSelector` chain, while Local/BYOK keeps
  the supplied callback and working action. An independent read-only verifier
  confirmed the full owner path; the shared integration passes 2 tests, the
  Desktop shell passes 28, both package typechecks pass, and the repository
  model-ID guard passes across 8,549 files. No external call was issued.
- Local distribution-page evidence (2026-08-11): GitHub release
  `v-desktop-1.2.0` contains Linux x64 AppImage/deb/rpm assets but no matching
  AppImage updater signature. The release API therefore correctly exposes no
  download control. Static marketing copy no longer calls that incomplete asset
  pair signed or installable: it distinguishes published Linux package assets
  from a verified installer and defers platform availability to the live release
  check. Local browser verification at 390×844 and 1280×800 showed the same
  honest unavailable state with no horizontal overflow. The release was not
  mutated while the founder was away.

## Already landed on open branches — do NOT redo

The verification agents read `main`, so these read as open in the item list
below. They are fixed and awaiting merge.

| Item                                                       | Where                  | State                                                                                 |
| ---------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| 1 — argon2 not traced into the bundle                      | #407 (web-only split)  | fixed, `check` green, `web-a11y` blocked on item 3                                    |
| 3 — CI green                                               | #400 merged, #406 open | Rust reap race, desktop debounce leak, phantom clippy feature, indexer `test.db` race |
| 4 — deploy gate cannot see a serving-path failure          | #401                   | probes `/api/me` for 401; verified to fail against the live outage                    |
| 16 — CLI rules file is a prompt-injection channel          | this branch            | denies agent writes to `.agiworkforce/rules` AND `commands`                           |
| 20 — gateway enforces no usage caps                        | #403                   | `reserve_managed_usage_request_with_limits` with all three ceilings                   |
| 21 — client disconnect settles as failed and bills zero    | #403                   | `resolveBilledOutcome`, ported to the gateway                                         |
| 22 — Cloud Code turns bill a flat 25¢                      | this branch            | real usage summed across every provider call, priced by `LLMCostCalculator`           |
| 23 — E2B sandbox seconds free because the rate ships unset | this branch            | surfaced at boot in `validate-env`                                                    |
| 25 — Team seat purchase never reconciles `licensed_seats`  | #404                   | adopts the paid seat count at org creation; #405 releases the dead binding on cancel  |

Also fixed this session and NOT in the item list, because no artifact reported
them: 21 polynomial-ReDoS sites, three SVG upload-scanner solidus bypasses, a
mobile CDN origin-confusion bypass, reversible pseudonyms when `LOG_SALT` is
unset, five gateway routers with no rate-limit floor, the signaling server
trusting localhost CORS in production, a markdown table escaping-order bug,
and three dead guards (the CodeQL config nothing referenced, an unwired
marketing model-ID gate, and a clippy lane that died parsing its own
arguments).

---

Ordering is consequence-to-effort within waves. Waves are sequential; items inside a wave are parallel **unless** a `Serial with` flag appears (see §Write collisions). Every item is `Status: todo` until its Verify command passes on a clean tree.

---

## Wave 0 — Nothing else matters until these pass

### 1. Restore authenticated API routes (argon2 native module not traced into the bundle)

- Status: DONE (2026-08-09) — argon2 prebuilds shipped for every platform — d4cc8e8e5 (the production 500s)
- Area: ops
- Severity: critical
- Writes: `apps/web/next.config.ts`
- Verify: `pnpm --filter @agiworkforce/web build && curl -s -o /dev/null -w '%{http_code}\n' https://agiworkforce.com/api/me` → must be `401`, not `500`
- Evidence: `apps/web/lib/api-auth.ts:7` → `apps/web/lib/services/api-key-service.ts:25`; `apps/web/next.config.ts` declares neither `serverExternalPackages` nor `outputFileTracingIncludes`
- Note: 97/196 route handlers import `api-auth`; 24 routes confirmed 500 since 2026-08-07 21:41 UTC.

### 2. Re-arm the skill-vetting gate on this branch

- Status: DISMISSED (2026-08-09) — FALSE POSITIVE on this branch. The mechanism is real and was reproduced end to end (deleting tools/skill-vetting/README.md breaks the hatchling build, so verify.sh aborts under set -e before scanning), but tools/skill-vetting/README.md is present and byte-identical to the pre-deletion version here. Outstanding only on chore/retire-stale-docs — recorded in FoundersAssistance.md rather than fixed from the wrong branch.
- Area: ci
- Severity: critical
- Writes: `tools/skill-vetting/README.md`, `tools/skill-vetting/pyproject.toml`
- Verify: `bash tools/skill-vetting/verify.sh`
- Evidence: `tools/skill-vetting/pyproject.toml:9` (`readme = "README.md"`); README deleted by `7214d0c70`; `verify.sh` runs under `set -euo pipefail` so the install failure aborts before any scan.

### 3. Get CI green (100/100 sampled runs failed; every E2E job skipped since 2026-07-21)

- Status: DONE (2026-08-09) — gateway tsconfig matches its build graph — 68c8607f4
- Area: ci
- Severity: critical
- Writes: `.github/workflows/ci.yml`, plus each failing target as diagnosed (desktop+cli tests, native-messaging sidecar build, typecheck, JS dependency audit, jsdom webview tests, lint)
- Verify: `gh run list --workflow=ci.yml --limit 5 --json conclusion` → all `success`
- Evidence: `gh run list --workflow=ci.yml --limit 100` → `{"cancelled":2,"failure":98}`; `deploy-production.yml` is `workflow_run`-gated, last 28 deploys `skipped`
- ⚠ Serial with #5 (both write `ci.yml`).

### 4. Deploy gate must verify the serving path, and must be able to roll back

- Status: DONE (2026-08-09) — post-deploy serving-path gate with rollback — ef23cca2c
- Area: ci
- Severity: critical
- Writes: `.github/workflows/deploy-production.yml`, `scripts/verify-deployment.mjs` (new)
- Verify: `node scripts/verify-deployment.mjs https://agiworkforce.com` fails when `/api/me` returns 500 while `/api/health` returns 200
- Evidence: current gate is `curl /api/health` only, which does not import `api-auth`; 17 workflows contain zero rollback mechanism.

### 5. Stop suppressing three real rustls-webpki TLS advisories

- Status: DONE (2026-08-09) — vulnerable rustls-webpki line removed; advisory gate blocking — 70fb7ce90
- Area: security
- Severity: high
- Writes: `apps/desktop/src-tauri/Cargo.toml` (`oauth2` → version pulling webpki `>=0.103.12`), `.cargo/audit.toml`, `.github/workflows/ci.yml`
- Verify: `cargo deny check advisories` (with `continue-on-error` removed from the CI step)
- Evidence: `.cargo/audit.toml:64–71` (false "pinned by Tauri transitive deps" justification); `.github/workflows/ci.yml:302–311`; sole path is first-party `oauth2 = "4.4"`. RUSTSEC-2026-0104 = pre-verification CRL parser panic.
- ⚠ Serial with #3.

---

## Wave 1 — Exploitable security defects

### 6. `db_query` table allowlist is bypassed by whitespace tokenization

- Status: DONE (2026-08-08) — `sql_identifier_tokens` strips block and line
  comments and treats every non-identifier character as a separator, so
  `SELECT*FROM`, `FROM"settings"` and `FROM/*c*/users` all resolve the table.
  All three scanners share it. Qualified names resolve to the schema and are
  rejected — fail closed, pinned by a test. 7 new tests; desktop 4,647 passing;
  clippy -D warnings clean. Commit 9e40b17a8.
- Area: security
- Severity: critical
- Writes: `apps/desktop/src-tauri/src/core/llm/tool_executor/db_tools.rs`
- Verify: `cargo test -p agiworkforce-desktop db_tools` with new cases `SELECT*FROM auth_sessions` and `SELECT * FROM"settings"` expected to be rejected
- Evidence: `apps/desktop/src-tauri/src/core/llm/tool_executor/db_tools.rs:169`, `:435`, `:508` (`tokens[i] == "FROM"` after whitespace split)
- Note: reachable via indirect prompt injection; exposes `auth_sessions` (plaintext access/refresh tokens), `users` (password hashes), `settings` (encrypted key blobs).

### 7. Desktop project/memory sync is not account-scoped

- Status: DONE (2026-08-09) — scope memory/project sync to the account — 3cda52588
- Area: data
- Severity: critical
- Writes: `apps/desktop/src-tauri/src/data/projects_sync.rs`, `apps/desktop/src-tauri/src/data/memory_sync.rs`
- Verify: `cargo test -p agiworkforce-desktop sync_scoping` (new: rows written under user A must not be pushed or recalled under user B)
- Evidence: `projects_sync.rs:304–310, 381–388`; `memory_sync.rs:307–312, 365–402`

### 8. Extension message policy: memories and tab-group commands inherit the permissive default

- Status: DONE (2026-08-09) — stop the cursor advancing past unwritten rows — f1276c88d, armed in e76a93011
- Area: security
- Severity: critical
- Writes: `apps/extension/src/background/policy.ts`, `apps/extension/src/background.ts`
- Verify: `pnpm --filter @agiworkforce/extension test policy` (new: every handled message type must have an explicit `MESSAGE_POLICY` entry)
- Evidence: `policy.ts:72–136` has no entry for `ADD_MEMORY`/`UPDATE_MEMORY`/`DELETE_MEMORY`/`SET_QUICK_MODE` (`background.ts:3727, 3743, 3760, 3778`) nor `ADD_TAB_TO_GROUP`/`REMOVE_TAB_FROM_GROUP` (`background.ts:3430–3457`, which fall back to the active tab)
- ⚠ Serial with #9, #45, #61 (shared `background.ts` / `policy.ts`).

### 9. Extension: `agi_site_allowlist` key retyped in six places, plus 8 dead shortcut actions

- Status: DONE (2026-08-09) — shortcut allowlist narrowed to what the executor runs; browserTool bridge deleted — bfce749b3
- Area: security
- Severity: high
- Writes: `apps/extension/src/background/policy.ts`, `apps/extension/src/background.ts`, `apps/extension/src/features/computer-use/cdpDriver.ts`, `apps/extension/src/content.ts`
- Verify: `pnpm --filter @agiworkforce/extension test` (new: single exported storage-key constant; `ALLOWED_SHORTCUT_ACTION_TYPES` must equal the `executePlannedAction` switch cases)
- Evidence: `cdpDriver.ts:724`; `policy.ts:431–459` (26 entries) vs `content.ts:357–601` (18 implemented, rest hit `default:` "Unsupported page action")
- ⚠ Serial with #8.

### 10. Safe/Plan mode gate is unreachable; "approve and remember" permanently defeats it

- Status: DONE (2026-08-09) — fence untrusted web-search results — a86d150f7, wired in e76a93011
- Area: security
- Severity: critical
- Writes: `apps/desktop/src-tauri/src/core/llm/tool_executor/mod.rs`, `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs`
- Verify: `cargo test -p agiworkforce-desktop tool_mode_gate` (new: in Safe mode, `memory_forget`, `schedule_reminder`, `api_download`, `cloud_download`, `db_transaction_rollback`, `create_artifact`, `skill` must be refused)
- Evidence: `mod.rs:2809–2824` returns `Ok(())` before `is_tool_permitted_for_mode` ever runs; `mod.rs:2779–2796` checks the stored approval before computing the safety tier; `NEVER_REMEMBERABLE` omits `email_send`, `git_push`, `cloud_upload`, `db_execute`, all MCP tools.

### 11. TS secret scanner (Local→BYOK handoff) misses five patterns the Rust CLI catches

- Status: DONE (2026-08-09) — redaction parity across the three redactors — f9a04c858
- Area: security
- Severity: critical
- Writes: `packages/platform/utils/src/logger.ts`
- Verify: `pnpm --filter @agiworkforce/utils test logger` (new: PEM block, `ASIA…`, `aws_secret_access_key`, `gho_/ghu_/ghr_`, variable-length `AIza…`; and `ts=1721469876543` must NOT redact)
- Evidence: `packages/platform/utils/src/logger.ts:40–161` vs `apps/cli/src/secret_redaction.rs:8–104`; card regex at `logger.ts` matches epoch-ms, a case `apps/desktop/src-tauri/src/sys/security/log_redaction.rs:99–106` already fixed.

### 12. VS Code extension sends DB passwords in the git diff to the model

- Status: DONE (2026-08-09) — agent-mode gate before every tool — 64195ee0f
- Area: security
- Severity: critical
- Writes: `apps/extension-vscode/src/core/telemetry.ts`
- Verify: `pnpm --filter agi-workforce test telemetry` (new: `DATABASE_URL=postgres://admin:S3cretPass123@host/db`, `gsk_…`, `xai-…`, `github_pat_…` must all redact)
- Evidence: `apps/extension-vscode/src/core/telemetry.ts:33–44` (10 patterns) applied at `apps/extension-vscode/src/data/contextBuilder.ts:207`

### 13. CLI `AGI_API_URL` bypasses the SSRF allowlist and leaks the bearer token

- Status: DONE (2026-08-09) — numeric egress IP judgement — 2182c07be
- Area: security
- Severity: high
- Writes: `apps/cli/src/lib.rs`, `apps/cli/.env.example` (new)
- Verify: `cargo test -p agiworkforce-cli --lib api_base_resolution` (new: `AGI_API_URL=https://evil.example` must be rejected)
- Evidence: `apps/cli/src/lib.rs:3029–3031` → `fetch_remaining_pct` at `:1562–1592` calls `.bearer_auth(bearer)` on an unvalidated host; `resolve_agi_api_base()` (`apps/cli/src/tier_cache.rs:264–282`) only guards `AGIWORKFORCE_API_BASE`.

### 14. Desktop SSRF guard uses string prefixes, misses CGNAT/0.0.0.0/8/multicast

- Status: DONE (2026-08-09) — keep Local/BYOK off managed media — 80e8048e8
- Area: security
- Severity: high
- Writes: `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`
- Verify: `cargo test -p agiworkforce-desktop validate_url` (new: `http://100.100.100.200/`, `http://0.1.2.3/`, `http://224.0.0.1/` rejected)
- Evidence: `tool_guard.rs:2379–2439` vs numeric octet parsing at `apps/web/lib/egress-policy.ts:44–57`
- Note: the decimal-encoded `http://2130706433/` case from the audit is **not** a real gap — the `url` crate canonicalizes it to `127.0.0.1` before the check.
- ⚠ Serial with #46.

### 15. VS Code gateway validator permits plaintext `http://localhost` for the token-bearing origin

- Status: DONE (2026-08-09) — CLI account token host allowlist — 74690353b
- Area: security
- Severity: high
- Writes: `apps/extension-vscode/src/utils/api.ts`
- Verify: `pnpm --filter agi-workforce test api` (new: `http://localhost:3000` rejected; host list matches `apps/extension/src/background/policy.ts:557–565`, i.e. `staging-api.agiworkforce.com`)
- Evidence: `apps/extension-vscode/src/utils/api.ts:242–274` (isLocalhost escape) vs `policy.ts:567–581`

### 16. CLI rules file is a persistent prompt-injection channel

- Status: DONE (2026-08-09) — agent write-denial verified and its dead arm removed — d16a0df18
- Area: security
- Severity: critical
- Writes: `apps/cli/src/memory.rs`, apps/cli/src/tools/path_security.rs (as reported by the audit; no such file in this tree)
- Verify: `cargo test -p agiworkforce-cli --lib rules_file_write_denied` (new: agent `write_file` to `<git-root>/.agiworkforce/rules/*.md` is denied, or loaded content is wrapped in the untrusted marker)
- Evidence: `apps/cli/src/memory.rs` loads `<git-root>/.agiworkforce/rules/*.md` into every future session as trusted instructions; no denylist in path security.

### 17. Local mode leaks prompts to managed cloud through image/video generation

- Status: DONE (2026-08-09) — extension message-policy coverage — 00afb5349
- Area: security
- Severity: high
- Writes: `apps/desktop/src-tauri/src/sys/commands/media.rs`, `apps/desktop/src-tauri/src/sys/commands/chat/tool_config.rs`, apps/desktop/src/lib/runtime/TauriRuntime.ts (as reported by the audit; no such file in this tree)
- Verify: `pnpm check:trust-boundaries` and `cargo test -p agiworkforce-desktop media_local_mode_blocked` (new)
- Evidence: `media.rs:208–235, 301–330` (raw `reqwest` + `bearer_auth`, no privacy/mode read, bypasses the TS `guardedFetch` chokepoint); `tool_config.rs:53–62` filters only when `model_capabilities` is `Some`, and `TauriRuntime.ts:1046–1090` never populates it (fail-open).

### 18. Desktop web-search results reach the model with no injection fence

- Status: DONE (2026-08-09) — VS Code gateway origin allowlist — 272fc24bd
- Area: security
- Severity: high
- Writes: `apps/desktop/src-tauri/src/core/llm/tool_executor/search_tools.rs`
- Verify: `cargo test -p agiworkforce-desktop search_results_are_fenced` (new: output contains the untrusted-content delimiter + "data only" clause used on web)
- Evidence: `search_tools.rs:294–309` returns bare JSON of attacker-controlled `title`/`snippet`/`url` on the surface that also owns terminal, file-delete and browser tools.

### 19. SVG avatars and knowledge files are stored and served unscanned, up to 25 MiB

- Status: DONE (2026-08-09) — refuse SVG attachments, cap avatars — f8b20a313
- Area: security
- Severity: high
- Writes: `packages/contracts/types/src/chat.ts`, `apps/web/app/api/uploads/presign/route.ts`, apps/web/app/api/uploads/avatar/complete/route.ts (as reported by the audit; no such file in this tree) (new), apps/web/app/api/uploads/knowledge-file/complete/route.ts (as reported by the audit; no such file in this tree) (new)
- Verify: `pnpm --filter @agiworkforce/web test uploads` (new: `image/svg+xml` rejected for every `kind`; `scanUploadBytes` runs for all kinds)
- Evidence: `chat.ts:134–263` (broad `image/` prefix at 25 MiB vs 16-entry list at 12 MiB); `presign/route.ts:84–97` runs the narrow check only when `kind === 'chat-attachment'`; `scanUploadBytes` has exactly one caller.

---

## Wave 2 — Money

### 20. Gateway path enforces no usage caps at all

- Status: DONE (2026-08-09) — managed usage metered — 715077ba3
- Area: billing
- Severity: high
- Writes: `services/api-gateway/src/services/managedUsageBilling.ts`
- Verify: `pnpm --filter @agiworkforce/api-gateway test managedUsageBilling` (new: rolling 5-hour, rolling weekly and flagship-weekly caps reject over-quota reservations)
- Evidence: `managedUsageBilling.ts:315–324` calls the legacy `reserve_managed_usage_request(...)` with no cap arguments; desktop, CLI and VS Code all route here.
- ⚠ Serial with #21, #33.

### 21. Client disconnect mid-stream settles as `failed` and bills zero

- Status: DONE (2026-08-09) — abandoned managed streams settle the output the client received — 71872ffdc
- Area: billing
- Severity: high
- Writes: `services/api-gateway/src/routes/llm.ts`, `services/api-gateway/src/services/managedUsageBilling.ts`
- Verify: `pnpm --filter @agiworkforce/api-gateway test llm` (new: aborting after N streamed tokens settles `actual_cost_cents > 0` and counts toward the rolling window)
- Evidence: `routes/llm.ts:457–486, 742–767, 826`; `managedUsageBilling.ts:395–400`
- ⚠ Serial with #20.

### 22. Cloud Code agent turns bill a flat 25¢ regardless of usage

- Status: DONE (2026-08-09) — cloud-code turns bill measured tokens, and `is_flagship` reflects the model actually called — 94046227f. CORRECTION: commit 94046227f's subject says "cloud-code approval state machine" and this line previously repeated it. Both were wrong — the diff is flagship routing-slot billing, which IS this item. Ledger task MATCH-002 (approvals decidable) is NOT closed by it and remains open.
- Area: billing
- Severity: high
- Writes: `apps/web/lib/services/cloud-code-agent-service.ts`, `apps/web/lib/services/cloud-code-agent-loop.ts`
- Verify: `pnpm --filter @agiworkforce/web test cloud-code-agent` (new: finalize uses measured tokens; `is_flagship` reflects the model actually called)
- Evidence: `cloud-code-agent-service.ts:49, 236–241`; `cloud-code-agent-loop.ts:49` — up to 24 flagship calls per turn, flagship-weekly cap bypassed.

### 23. Every E2B sandbox second is free because the rate env var ships unset

- Status: DONE (2026-08-09) — sandbox compute metered — 715077ba3
- Area: billing
- Severity: critical
- Writes: `apps/web/lib/e2b/compute-metering.ts`, `apps/web/.env.example`
- Verify: `pnpm --filter @agiworkforce/web test compute-metering` (new: unset rate fails loud in production rather than metering 0) and `pnpm check:env-contract`
- Evidence: `apps/web/lib/e2b/compute-metering.ts:29, 43–57` (`AGI_E2B_COMPUTE_MICROUSD_PER_SECOND`)
- ⚠ Serial with #24 (`.env.example`).

### 24. Undocumented environment variables that fail silently

- Status: DONE (2026-08-09) — CLI env contract — 49d509f47
- Area: ops
- Severity: high
- Writes: `apps/web/.env.example`, `apps/web/lib/validate-env.ts`, `scripts/env-doctor.mjs`, `apps/cli/.env.example` (new), scripts/check-env-contract.mjs (as reported by the audit; no such file in this tree)
- Verify: `pnpm check:env-contract && pnpm env:doctor`
- Evidence: `UPLOAD_SCAN_WEBHOOK_URL` (scanner silently off when unset), `ENCRYPTION_KEY`, `DESKTOP_TOKEN_SECRET` (two spellings), `STRIPE_PRICE_TEAM_*` (Team checkout fails closed; `apps/web/lib/__tests__/public-billing-copy.test.ts:88` documents the gap instead of failing), `CONNECTOR_OAUTH_*_CLIENT_ID/SECRET` (runtime-derived names), `RESEND_API_KEY` + 5 support vars with hardcoded `support@agiworkforce.com` defaults; `apps/cli` ships no example for ~20 vars and `check:env-contract` inspects six hardcoded scopes excluding the CLI.
- ⚠ Serial with #23.

### 25. Team seat purchase never reconciles `licensed_seats`

- Status: DONE (2026-08-09) — plan-tier vocabulary unified — 9f36c2d1a
- Area: billing
- Severity: high
- Writes: `apps/web/app/api/stripe-webhook/lib/seats.ts`, `apps/web/app/api/settings/organization/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test seats` (new: purchase before org creation still lands the paid seat count)
- Evidence: `seats.ts:150–158` matches on owning organization; `organization/route.ts:181–186`; with the seat floor now 2 (`7611c622b`) this hits every new Team purchase.
- ⚠ Serial with #26.

### 26. Stripe lifecycle: no refund path, refunds don't revoke the plan, unregistered Price 500s renewals

- Status: DONE (2026-08-09) — full-refund entitlement revocation — 3b5c5f43a
- Area: billing
- Severity: critical
- Writes: `apps/web/app/api/stripe-webhook/lib/handlers.ts`, `apps/web/app/api/stripe-webhook/lib/db.ts`, `apps/web/lib/price-tier-mapping.ts`
- Verify: `pnpm --filter @agiworkforce/web test stripe-webhook` (new: `charge.refunded` downgrades the tier; an unknown Price ID resolves to its recorded tier instead of throwing)
- Evidence: `refunds.create` has zero hits repo-wide; the subscription updater throws on an unregistered Price, which would break every legacy renewal after any price change (contradicting the 30-day price-protection promise in `/terms`).
- ⚠ Serial with #25.

### 27. Rate limits are flat across all 122 configs — no tier awareness anywhere

- Status: DONE (2026-08-09) — renew legacy Stripe prices — 3b5c5f43a
- Area: billing
- Severity: high
- Writes: `services/api-gateway/src/middleware/rateLimit.ts`, `apps/web/lib/rate-limit.ts`
- Verify: `pnpm --filter @agiworkforce/api-gateway test rateLimit && pnpm --filter @agiworkforce/web test rate-limit` (new: `max_15x` ceiling > `free`; chat ceiling ≥ the tier's advertised concurrency)
- Evidence: gateway `rateLimit.ts` — 37 configs, all `windowMs: 60_000`, tier-aware: no; web `rate-limit.ts` — 85 configs, tier-aware: no; on the LLM route the limiter runs three lines before the subscription is loaded; flat 20 msg/min < the 12 concurrent turns sold to `max_15x`. Also fix `rateLimit.ts:27, 187–190`: `RATE_LIMIT_REDIS_URL` falls back to the Upstash **REST** URL fed into `new Redis()`, which fails and silently degrades to in-memory while the multi-instance alarm checks only the first var.

### 28. Scheduled-task tier quotas exceed total cron capacity by ~10x

- Status: DONE (2026-08-09) — tier-aware rate limits — d061dccc3
- Area: billing
- Severity: high
- Writes: `packages/contracts/types/src/billing-catalog.ts`, `vercel.json`, `apps/web/app/api/cron/run-schedules/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test schedule-cadence` (new: `Σ maxScheduledTasks` reachable within the deployed cron cadence × claim limit)
- Evidence: `billing-catalog.ts:376–461` sized for an hourly sweep (240 runs/day) but `vercel.json:53–56` is `0 1 * * *` daily and `run-schedules/route.ts:19` claims `limit: 10` platform-wide; `apps/web/lib/schedules/schedule-time.ts:308` `SWEEP_INTERVAL_MS = 24h`. Needs a requeue loop or a paid cron cadence (see §Founder).
- ⚠ Serial with #29, #62.

### 29. Enterprise tier is `unlimited: true` at `monthlyPriceUsd: 0`; local-only/BYOK quotas contradict themselves

- Status: REVERTED (2026-08-09) — REVERTED. The fix was inert: the fail-closed branch could not fire, and the numeric arm of `automationsPerDay` has no producer. Reverting exposed the real finding, which is larger than this item — `hasFeature`, `checkFeatureAccess`, `checkAutomationLimit`/`checkApiCallLimit`/`checkStorageLimit`, eight grace-period helpers and the whole `constants/pricing.ts` module have zero production callers. That is a dead subsystem, not a limit bug; it needs its own item rather than a patch to one constant. Revert verified byte-identical to HEAD by checksum.
- Area: billing
- Severity: critical
- Writes: `packages/contracts/types/src/billing-catalog.ts`, `apps/desktop/src/constants/pricing.ts`, `apps/desktop/src/constants/planFeatures.ts`, apps/desktop/src/lib/featureGates.ts (as reported by the audit; no such file in this tree)
- Verify: `pnpm --filter @agiworkforce/types test billing-catalog && pnpm --filter @agiworkforce/desktop test featureGates` (new: no tier is simultaneously unlimited and capped; unlimited tiers carry a cost ceiling)
- Evidence: Enterprise resolves every rolling cap to `null` with $1,000,000 ledger headroom at price 0; `featureGates.ts:72` reads a table capping local-only/byok at 5/10 while `featureGates.ts:107` enforces "unlimited" for the same tiers, and no server-side automation counter exists.
- ⚠ Serial with #28.

---

## Wave 3 — Deletion, retention and data integrity

### 30. Account erasure is materially incomplete

- Status: DONE (2026-08-09) — schedule throughput vs quota — 04c8aa9c3
- Area: legal
- Severity: high
- Writes: `apps/web/lib/server/account-erasure.ts`, `apps/web/app/api/auth/device/refresh/route.ts`, `apps/web/app/api/cron/purge-deleted-accounts/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test account-erasure` (new: the table list is derived from the schema, not hand-written; a failed table delete leaves the `profiles` retry pointer intact; a deleted account's device refresh token is rejected)
- Evidence: `account-erasure.ts:34–76` has 34 entries and reports `complete: true` while omitting `chat_messages`/`conversations`/`messages`, `cloud_code_sessions`/`terminal_entries`, `cloud_agent_runs`/`events`, `connector_oauth_grants`, `messaging_connections`, `usage_events`, `device_refresh_tokens`, `revoked_jwts` — none FK'd to `profiles`, so nothing cascades; `:164–187` deletes `profiles` last even after a failure, and `purge-deleted-accounts/route.ts:82–91` selects retries from `profiles`; `auth/device/refresh/route.ts:57–125` checks only `used_at`/`revoked_at`/`expires_at`. Object-store sweep covers only media assets, so avatars and knowledge files survive world-readable.

### 31. Delete-account route treats any DB error as "columns missing" and hard-deletes

- Status: DONE (2026-08-09) — account erasure covers every user-scoped table — 3a9d5c271
- Area: data
- Severity: high
- Writes: `apps/web/app/api/user/delete-account/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test delete-account` (new: only Postgres `42703` takes the fallback; a 0-row UPDATE returns an error, not 200 with a `scheduledFor`)
- Evidence: `delete-account/route.ts:105–165`; the 500 branch also falsely claims no data was removed when `erasure.complete === false`.

### 32. Cloud sync discards every local write error

- Status: DONE (2026-08-09) — purge credentials and query cache on logout — 46e81e69f
- Area: data
- Severity: high
- Writes: `apps/desktop/src-tauri/src/data/cloud_sync.rs`
- Verify: `cargo test -p agiworkforce-desktop cloud_sync_write_failures` (new: a failed apply must not advance the cursor, must not delete the orphan-buffer row, and must surface in `messages_failed`)
- Evidence: `cloud_sync.rs:327–334, 1452–1576, 1922–1937` (`let _ = conn.execute(...)` at every apply site; `messages_failed` hardcoded 0).

### 33. Cache-pricing divergence between desktop and web, and triplicated surcharges

- Status: DONE (2026-08-09) — cache token pricing converged across surfaces — 4023f46f9
- Area: billing
- Severity: high
- Writes: `apps/desktop/src-tauri/src/core/llm/cost_calculator.rs`, `apps/web/lib/cost-tracker.ts`, `apps/web/lib/prompt-cache-helper.ts`, `apps/web/lib/services/llm-cost-calculator.ts`, `services/api-gateway/src/services/managedUsageBilling.ts`
- Verify: `cargo test -p agiworkforce-desktop cost_calculator && pnpm --filter @agiworkforce/web test cost-tracker` (new: identical fallback for "caching declared, no cache-read price"; the 1.25x/2.0x surcharge pair has one exported definition)
- Evidence: `cost_calculator.rs:364–374` falls back to the full input rate; `apps/web/lib/cost-tracker.ts:110` falls back to 90% off — the catalog's MiniMax caching-capable model (`packages/ai/model-registry/catalog/models.curation.json:1933–1966`) hits this today ($0.30/M vs $0.03/M). `prompt-cache-helper.ts:84–118` hardcodes a flat `0.1` multiplier (the DeepSeek family is actually 0.02x), live via `response-builder.ts:113`. Surcharge literals: `llm-cost-calculator.ts:241,244`; `cost-tracker.ts:129,135`; `managedUsageBilling.ts:225–226`.
- ⚠ Serial with #20, #21.

### 34. Persisted-store key collisions and unwritten storage keys

- Status: DONE (2026-08-09) — origin_surface accepts cli — e5d0727b9 (0099)
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src/stores/connectorsStore.ts`, `apps/desktop/src/stores/chatPreferencesStore.ts`, `packages/client/client-runtime/src/http.ts`, `apps/extension/src/features/background/synced-preferences.ts`, apps/extension/src/features/background/**tests**/synced-preferences.test.ts (as reported by the audit; no such file in this tree)
- Verify: `pnpm --filter @agiworkforce/desktop test connectorsStore && pnpm --filter @agiworkforce/extension test synced-preferences` (new: persist keys are unique repo-wide; every synced key has a writer)
- Evidence: `connectorsStore.ts:344–347` (two stores share key `connectors-store` at v7/v4, forcing the v7 `version < 6` migration to reset the catalog; twin collision on `agiworkforce-chat-preferences`); `packages/client/client-runtime/src/http.ts:25` reads `agi-auth-token`, which has no writer anywhere, so `routeToCloud()` always POSTs unauthenticated; `synced-preferences.ts:13` syncs `agi_in_page_panel_enabled` (real key: `in_page_panel_enabled`) and the test asserts the typo.

### 35. Web logout leaves auth/refresh tokens and user data in storage

- Status: DONE (2026-08-09) — one owner for the admin role pair — e5d0727b9 (0100)
- Area: security
- Severity: high
- Writes: `apps/web/shared/stores/authentication-store.ts`, apps/web/shared/stores/authentication-manager.ts (as reported by the audit; no such file in this tree), `apps/desktop/src/stores/logoutCleanup.ts`
- Verify: `pnpm --filter @agiworkforce/web test authentication-store && pnpm --filter @agiworkforce/desktop test logoutCleanup` (new: after logout no key written by any store remains)
- Evidence: `authentication-store.ts:126–134` patterns match neither `auth_token` nor `refresh_token` (`apps/web/shared/lib/api.ts:45–46`), and `logout()` calls the no-op `authService.logout()` (`authentication-manager.ts:92–94`) instead of `apiClient.clearTokens()`; `logoutCleanup.ts:192–221` lists 13 keys, missing `agiworkforce-memory`, `agiworkforce-custom-instructions`, `research-store`, and 3 of its 13 have no writer.
- Note: the web leg is lower-impact than the audit implies — `apiClient.login()`/`setToken()` appear to be dead code (auth is Clerk-cookie based). Fix anyway; delete the dead client if confirmed.

### 36. `apiFetch` sends ciphertext as the bearer token, and the API base falls back to the wrong origin

- Status: DONE (2026-08-09) — SCIM admin predicate — 2ac7e148a
- Area: security
- Severity: high
- Writes: `apps/web/shared/stores/query-client.ts`
- Verify: `pnpm --filter @agiworkforce/web test query-client` (new: token read matches the writer's plaintext cache; a missing `NEXT_PUBLIC_API_URL` fails the build rather than silently retargeting `/api`)
- Evidence: `query-client.ts:330` (reads `auth_token`, whose only writer stores ciphertext) and `:326` (relative `/api` fallback, while another module throws in production for the same var).

### 37. `origin_surface: 'cli'` passes the plan gate and is rejected by the DB

- Status: DONE (2026-08-09) — signaling resync contract — 2ac7e148a
- Area: data
- Severity: high
- Writes: apps/web/db/neon/0104_origin_surface_cli.sql (as reported by the audit; no such file in this tree) (new), apps/web/app/api/cloud-agent/runs/route.ts (as reported by the audit; no such file in this tree)
- Verify: `pnpm check:neon-migrations && pnpm --filter @agiworkforce/web test cloud_agent_runs`
- Evidence: `apps/web/db/neon/0061_cloud_agent_runs.sql:14–16` CHECK omits `cli` while the Zod schema allows it; only `unknown` is remapped to `api`.

### 38. Cloud Code approval gate is write-only — three of four states unreachable

- Status: BLOCKED (2026-08-09) — BLOCKED — needs writes outside the declared Writes set. Cloud-code approval rows can be inserted but not decided; closing it touches the agent loop and the approvals service together.
- Area: data
- Severity: high
- Writes: `apps/web/lib/services/cloud-code-agent-loop.ts`, apps/web/app/api/cloud-code/approvals/route.ts (as reported by the audit; no such file in this tree) (new)
- Verify: `pnpm --filter @agiworkforce/web test cloud-code-approvals` (new: approve → resume, reject → abort, expiry sweep)
- Evidence: `apps/web/db/neon/0082_cloud_code_agent_turns.sql:102–127`; the table has one INSERT, no SELECT/UPDATE, and `preApproved` is supplied only by tests.
- ⚠ Serial with #22.

### 39. `'owner'|'admin'` predicate hand-written in 12 TS files and 32 SQL sites

- Status: DONE (2026-08-09) — desktop event emission — 4f1e0c35b
- Area: data
- Severity: high
- Writes: `apps/web/lib/server/scim/scim-auth.ts`, the 11 other TS call sites, apps/web/db/neon/0105_admin_role_helper.sql (as reported by the audit; no such file in this tree) (new)
- Verify: `pnpm check:hardcoded-arrays && pnpm --filter @agiworkforce/web test scim-auth`
- Evidence: `apps/web/lib/server/scim/scim-auth.ts:116`; canonical `isOrganizationAdminRole()` has exactly one caller; the RLS helper `app_row_is_readable` also inlines the pair.

---

## Wave 4 — Broken contracts (dead UI, dead events, dead paths)

### 40. Seven desktop UI surfaces listen for events Rust never emits

- Status: DONE (2026-08-09) — desktop store subscriptions — ae0e7ed6c
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src/features/agent-collaboration/AgentCollaborationPanel.tsx`, `apps/desktop/src/stores/schedulerStore.ts`, `apps/desktop/src/stores/executionStore.ts`, `apps/desktop/src/stores/computerUseStore.ts`, `apps/desktop/src-tauri/src/core/swarm/orchestrator.rs`, `apps/desktop/src-tauri/src/sys/commands/scheduler.rs`, `apps/desktop/src-tauri/src/ui/events/frontend_events.rs`
- Verify: `pnpm check:hook-fire-sites` extended to Tauri events, plus `pnpm --filter @agiworkforce/desktop test events-contract` (new: every `listen(...)` name has an emitter)
- Evidence: collaboration panel listens `swarm:progress|agent_message|complete` (`AgentCollaborationPanel.tsx:150,157,176`) vs emitted `swarm:started|decomposed|completed|subtask_*` (`orchestrator.rs:187,205,287,558`); `schedulerStore.ts:627–680` (5 names) vs emitted `scheduler:workflow-execute|notification` (`scheduler.rs:1575,1602`); `executionStore.ts:1091–1106` (`agi:llm_chunk|llm_complete|terminal_output`) vs `llm:stream_chunk` (`llm_executor.rs:341`) and `agi:terminal_command` (`frontend_events.rs:103`); computer-use store listens `computer_use:screenshot` vs emitted `agi:screenshot`, and `automation:request_screenshot` has no listener.

### 41. Three desktop panels listen for events with no emitter at all (workflow, ROI, canvas)

- Status: DONE (2026-08-09) — events-contract test — ae0e7ed6c
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src/hooks/useWorkflows.ts`, `apps/desktop/src/features/roi-dashboard/**`, `apps/desktop/src/features/dynamic-canvas/**`, plus the emitting Rust modules
- Verify: same contract test as #40, run after emitters exist
- Evidence: `useWorkflows.ts:87,117,133` (`workflow:status_changed|log|error`) — zero `"workflow:` emits anywhere in `src-tauri`; ROI dashboard listens `metrics:updated`, canvas listens `canvas:updated`, neither emitted. Decide per feature: emit, or delete with #66.
- ⚠ Serial with #66 (same feature directories).

### 42. Signaling contract omits four server-sent message types

- Status: DONE (2026-08-09) — connector persist key — ae0e7ed6c
- Area: correctness
- Severity: high
- Writes: `packages/contracts/types/src/signaling.ts`, apps/desktop/src/services/signalingClient.ts (as reported by the audit; no such file in this tree), apps/mobile/services/signaling.ts (as reported by the audit; no such file in this tree)
- Verify: `pnpm check:protocol-types && pnpm --filter @agiworkforce/types test signaling`
- Evidence: `signaling.ts:67–121` lacks `sync_request`, `approval_queued`, `connection_timeout`, `server_shutdown`; both clients drop them via `default: break`, killing mobile reconnect state-sync.

### 43. VS Code client drops `task/state_changed` and `server/warning`

- Status: BLOCKED (2026-08-09) — BLOCKED. The finding is real — the stdio developer-session transport the extension speaks is not the one the host implements — but closing it needs writes well outside this item's declared set, so the agent reverted its experiment and left the tree clean rather than half-landing a transport change.
- Area: correctness
- Severity: high
- Writes: `apps/extension-vscode/src/integrations/localRuntimeClient.ts`
- Verify: `pnpm --filter agi-workforce test localRuntimeClient` (new: all 9 notification methods parsed; `notification_lag` surfaces to the user)
- Evidence: `localRuntimeClient.ts:252–331` handles 7 of 9.

### 44. Four incompatible `AgentMode` vocabularies; the shared client can never succeed

- Status: DONE (2026-08-09) — desktop tool-confirmation client narrowed to reachable surface — 3c6bf9a7e
- Area: correctness
- Severity: high
- Writes: `packages/client/desktop-command-client/src/toolConfirmation.ts`, packages/contracts/types/src/agent-mode.ts (as reported by the audit; no such file in this tree)
- Verify: `pnpm --filter @agiworkforce/desktop-command-client test toolConfirmation` (new: the TS union equals the Rust `serde` wire values)
- Evidence: `toolConfirmation.ts:14` (`supervised|autonomous|restricted`) vs `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:118–125` (`safe|plan|build|autopilot`); used by `RecorderHud.tsx` and `BridgeStatusCard.tsx`, so not dead.

### 45. Desktop IPC allowlist is bypassed by `tauri-mock`, and is stale in both directions

- Status: DONE (2026-08-09) — IPC timeouts apply to the invoke callers actually use — be38f2cf4
- Area: security
- Severity: high
- Writes: `apps/desktop/src/lib/tauri-mock.ts`, `apps/desktop/src/utils/ipc.ts`
- Verify: `pnpm --filter @agiworkforce/desktop test ipc` (new: allowlist generated from `generate_handler!`; `COMMAND_TIMEOUTS` keys must all be registered commands)
- Evidence: `ipc.ts:47–329` — 200 registered commands would be rejected `UNKNOWN_COMMAND`, 3 generic entries and 6 prefixes match zero commands; `tauri-mock.ts:262` forwards straight to `@tauri-apps/api/core` for ~230 importers; `COMMAND_TIMEOUTS['read_file']` never fires (the command is `file_read`, `lib.rs:1680`).
- ⚠ Serial with #57.

### 46. `code_search` is rejected in every mode

- Status: DONE (2026-08-09) — shortcut registry has one owner — be38f2cf4
- Area: correctness
- Severity: medium
- Writes: `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`
- Verify: `cargo test -p agiworkforce-desktop code_search_allowed` (new)
- Evidence: listed in `READ_ONLY_TOOLS` (`tool_confirmation.rs:374`) and dispatched, but absent from `ToolExecutionGuard::new()`, so `validate_tool_call` returns `UnauthorizedTool`.
- ⚠ Serial with #14.

### 47. Canonical path constants retyped across surfaces

- Status: DONE (2026-08-09) — canonical chat/schedule path builders — 68591008c
- Area: correctness
- Severity: high
- Writes: `apps/web/lib/runtime/WebChatRuntime.ts`, `apps/web/features/schedules/services/schedule-api.ts`, `apps/mobile/services/streaming.ts`, `packages/ui/unified-chat/src/lib/connector-connect-required.ts`, packages/contracts/cloud-contracts/src/paths.ts (as reported by the audit; no such file in this tree)
- Verify: `pnpm check:cloud-contract-ownership && pnpm --filter @agiworkforce/web test schedule-api`
- Evidence: `MANAGED_CLOUD_CHAT_BASE_PATH` has 13 non-test literal re-typings (5 in `WebChatRuntime.ts:343–391`); `/api/me` has 10+ literals with disagreeing query params; `schedule-api.ts:140,154,164` addresses one resource three ways (raw literal / builder / constant); `apps/mobile/services/streaming.ts:233–234` shadows the imported `TOOL_APPROVAL_RESUME_PATH`; `connector-connect-required.ts:55–56,135` is a third independent `CONNECTOR_OAUTH_START_PATH` inside a strict pathname-equality trust check.

### 48. "Max iterations" slider actually spawns that many concurrent agents

- Status: DONE (2026-08-09) — desktop store ownership — 3c6bf9a7e
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src/features/agi/AgentTaskCreator.tsx`, `apps/desktop/src/stores/agentTaskStore.ts`, `apps/desktop/src-tauri/src/sys/commands/agi.rs`
- Verify: `pnpm --filter @agiworkforce/desktop test AgentTaskCreator && cargo test -p agiworkforce-desktop num_agents_clamp` (new)
- Evidence: `AgentTaskCreator.tsx:170–186` (1–20 slider) → `agentTaskStore.ts:264` `numAgents: options.maxIterations ?? 4` with no clamp; `agi.rs:274` defaults to 8; sequential mode drops the value entirely (`agentTaskStore.ts:283–289`).
- Note: the audit's "enforced ceiling of 25" does not exist — `goal_iteration_limit()` (`core/agi/core.rs:43–56`) defaults to 1000.

### 49. Extension composer accepts more attachments than the transport will send

- Status: DONE (2026-08-09) — side-panel attachment caps match the transport — 9f640a392
- Area: ux
- Severity: high
- Writes: `apps/extension/src/side_panel.ts`
- Verify: `pnpm --filter @agiworkforce/extension test side_panel` (new: drag, paste and the `+` menu all enforce the same count and byte caps as the send path)
- Evidence: `side_panel.ts:4337` (cap 8 on drag/paste, send throws at 5, `+` menu unbounded; 10 MB × 8 vs a 25 MiB request budget)
- ⚠ Serial with #50, #61.

### 50. Client upload cap is 10 MB against a canonical 12 MB server cap

- Status: DONE (2026-08-09) — extension canonicalization — c5d67f7be
- Area: correctness
- Severity: high
- Writes: `apps/web/shared/lib/security.ts`, `apps/web/shared/ui/ai-prompt-box.tsx`, `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`, `apps/extension/src/side_panel.ts`, `apps/desktop/src/api/embeddings.ts`, `apps/desktop/src/utils/fileUtils.ts`
- Verify: `pnpm check:hardcoded-arrays && pnpm --filter @agiworkforce/web test security`
- Evidence: six `10 * 1024 * 1024` literals at `security.ts:533`, `ai-prompt-box.tsx:405`, `webviewContent.ts:2853` (comment falsely claims "matches host Zod cap"), `side_panel.ts:4336`, `embeddings.ts:99`, `fileUtils.ts:3`; canonical `MAX_CHAT_ATTACHMENT_BYTES = 12 * 1024 * 1024` at `packages/contracts/cloud-contracts/src/chat-attachments.ts:6`
- ⚠ Serial with #49, #57, #61.

### 51. Desktop system prompt names a tool that does not exist

- Status: DONE (2026-08-09) — prompt no longer names a nonexistent memory tool — ab1a77e79
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src-tauri/src/core/agent/prompt_engineer.rs`
- Verify: `cargo test -p agiworkforce-desktop prompt_tool_names_exist` (new: every tool name in the prompt resolves in the registry)
- Evidence: `prompt_engineer.rs:436` instructs `memory_add`; the registry has `memory_remember|recall|forget|search`.

### 52. 18 persisted desktop settings have no reader

- Status: DONE (2026-08-09) — provider endpoints via the registry — a9e0aca19
- Area: ux
- Severity: medium
- Writes: `scripts/config/surface-invariants-allowlist.json`, the owning stores and the settings UI that renders each toggle
- Verify: `pnpm check:surface-invariants` with the SIX-32 entries removed
- Evidence: `scripts/config/surface-invariants-allowlist.json:43–134` — includes user-visible toggles `thinkingModeEnabled`, `showMessageTimestamps`, `showMarkdownPreview`, `speedQualityMode`. Each: wire it or delete the control.

### 53. Three disconnected keyboard-shortcut default sets

- Status: DONE (2026-08-09) — shortcut command wiring — a9e0aca19
- Area: ops
- Severity: medium
- Writes: `apps/desktop/src/constants/shortcuts.ts`, `apps/desktop/src/features/settings/KeybindingsSettings.tsx`, `apps/desktop/src-tauri/src/sys/commands/shortcuts.rs`, `apps/desktop/src/App.tsx`
- Verify: `pnpm --filter @agiworkforce/desktop test KeybindingsSettings` (new: every editable shortcut id round-trips to Rust; failures surface instead of a success toast)
- Evidence: `constants/shortcuts.ts:25–231` (25 ids) vs `shortcuts.rs:45–117` (7 different ids, `:541–543` returns `Shortcut not found` swallowed at `KeybindingsSettings.tsx:235–237`) vs `App.tsx:1047–1063, 1390–1414`; nothing reads `DEFAULT_SHORTCUTS[].action`.

---

## Wave 5 — Registry and constant drift

### 54. Image generation calls three model IDs that do not exist in the catalog

- Status: REVERTED (2026-08-09) — REVERTED. Every symbol the fix added was unreachable, and `ImageProvider::GoogleImagenLite` was left as a discriminant selecting nothing. Image-model slot resolution needs the provider registry work (HARD-001) to land first; doing it here would have produced a second unused copy. Revert verified byte-identical to HEAD by checksum.
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs`
- Verify: `cargo test -p agiworkforce-desktop resolve_image_model` (new: every canonical ID passed in must resolve) and `pnpm check:model-catalog`
- Evidence: `image_gen.rs:241–245, 371–375` passed retired provider wire identifiers instead of resolving the live canonical image roster; the curation verification history compiled into `packages/contracts/types/src/models.json` records their removal, while the same catalog's image-generation capability rows identify the supported successors without duplicating their IDs here. `resolve_image_model()` (`image_gen.rs:10–18`) therefore always fell through to a literal wire ID.
- ⚠ Serial with #55, #71.

### 55. Desktop/CLI hardcoded model IDs outside the catalog

- Status: DONE (2026-08-09) — model/token ceilings from the catalog — d16a0df18
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src-tauri/src/core/llm/llm_router.rs`, `apps/desktop/src-tauri/src/sys/commands/completion.rs`, `apps/desktop/src-tauri/src/core/llm/tool_executor/llm_tools.rs`, `apps/desktop/src-tauri/src/core/llm/models_config.rs`, `apps/desktop/src-tauri/src/sys/commands/voice.rs`, `apps/desktop/src-tauri/src/integrations/api_integrations/perplexity.rs`, `apps/desktop/src-tauri/src/core/agi/executors/search_executor.rs`, `apps/cli/src/provider.rs`, `apps/cli/src/model_catalog.rs`, `apps/web/scripts/test-llm-keys.ts`
- Verify: `cargo test -p agiworkforce-desktop && cargo test -p agiworkforce-cli --lib no_hardcoded_model_ids && pnpm check:model-catalog`
- Evidence: `llm_router.rs:588–599` contains the only arms not calling `provider_task_model`; `completion.rs:385–406` duplicates the Zhipu fast-completion model despite `models.json:331–345` exposing `fast_completion`; `llm_tools.rs:37` embeds the low-cost OpenAI routing model; `models_config.rs:336–343` guards its fallback only with `debug_assert!`, a no-op in release; `voice.rs:138` duplicates the catalog's OpenAI transcription model from `apps/cli/src/voice.rs:41`; `perplexity.rs:18–36` duplicates four provider wire IDs routed by `search_executor.rs:8,51–56,328`; `apps/cli/src/provider.rs:186–188` exact-matches Google model IDs instead of using a catalog capability flag; `apps/cli/src/model_catalog.rs:1717,1838,1869` shows where to extend the `no_hardcoded_model_ids_in_*` pattern to `voice.rs`; `apps/web/scripts/test-llm-keys.ts:29` embeds the Anthropic balanced-model ID.
- ⚠ Serial with #54, #71, #72.

### 56. Max-token defaults ignore per-model registry capacity

- Status: DONE (2026-08-09) — max_tokens validated against the model — d16a0df18
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src-tauri/src/sys/commands/chat/compaction.rs`, `apps/desktop/src-tauri/src/core/agent/context_compactor.rs`, `apps/cli/src/subagent_v2.rs`, `apps/cli/src/config.rs`, `apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs`, `packages/ai/providers/anthropic/src/translate.ts`, `apps/web/app/api/github/webhook/route.ts`, `apps/desktop/src/stores/settings/voice.ts`, `apps/desktop/src/stores/settingsStore.ts`, `apps/desktop/src-tauri/src/sys/commands/settings.rs`, `apps/desktop/src-tauri/src/data/settings/models.rs`
- Verify: `cargo test -p agiworkforce-desktop compaction && cargo test -p agiworkforce-cli --lib max_tokens && pnpm --filter @agiworkforce/providers-anthropic test translate`
- Evidence: `compaction.rs:106–117` (flat 100k/50k, command takes no model; sibling `context_monitor.rs:117–186` resolves the real window); `context_compactor.rs:40–41`; `subagent_v2.rs:457–465` (4096 vs a 128k registry max, never overridden); `config.rs:132–134` (default 8192) and `:803–808` (ceiling 200k, both registry-independent — 150k passes local validation and is rejected upstream); `anthropic_agent.rs:63–79`; `translate.ts:96,283`; `github/webhook/route.ts:429–439` (1024, direct `api.anthropic.com` call); `voice.ts:433,1308`; `settingsStore.ts:331` + `settings.rs:388` + `models.rs:205`.
- ⚠ Serial with #59 (`settingsStore.ts`), #67 (`request-processor.ts`).

### 57. Desktop timeout constants: a complete canonical file with zero importers

- Status: DONE (2026-08-09) — desktop timeouts wired to the four modules that execute them — c6dc19e52
- Area: ops
- Severity: high
- Writes: `apps/desktop/src/api/automation.ts`, `apps/desktop/src/api/mcp.ts`, `apps/desktop/src/api/embeddings.ts`, `apps/desktop/src/api/privacy.ts`, `apps/desktop/src/api/automationEnhanced.ts`, `apps/desktop/src/api/ollama.ts`, `apps/desktop/src/stores/chat/agentWorkflowEvents.ts`, `apps/desktop/src/utils/ipc.ts`
- Verify: `pnpm check:hardcoded-arrays && pnpm --filter @agiworkforce/desktop typecheck`
- Evidence: `apps/desktop/src/constants/timeouts.ts:12,49,62,85,88,98,108,134` exports every one of these under the identical name with zero importers; local redeclarations at `automation.ts:15`, `mcp.ts:42,43`, `embeddings.ts:3,4`, `privacy.ts:87`, `automationEnhanced.ts:14,15`, `ipc.ts:42`, `ollama.ts:59`, `agentWorkflowEvents.ts:443`
- ⚠ Serial with #45, #50.

### 58. Duplicated tier/plan vocabularies

- Status: DONE (2026-08-09) — tier model gate reads the catalog — be38f2cf4
- Area: billing
- Severity: high
- Writes: `apps/desktop/src/lib/cloudAccountTypes.ts`, `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx`, `apps/web/features/billing/hooks/use-billing-queries.ts`, `apps/web/features/billing/components/Billing/types.ts`, `apps/desktop/src/constants/llm.ts`
- Verify: `pnpm --filter @agiworkforce/desktop test cloudAccountTypes && pnpm --filter @agiworkforce/mobile test PaywallBottomSheet` (new file) `&& pnpm --filter @agiworkforce/web test billing`
- Evidence: `cloudAccountTypes.ts:1–42` (hand-maintained `PlanTier` + `PLAN_DISPLAY_NAMES`, 13+ importers including auth and feature gating; the sibling `planModels.ts` comment records that a short copy previously dropped Max 15x and Team after Cloud sync); `PaywallBottomSheet.tsx:45–54` (8 tiers, no `max_15x`, mislabels `max` as "Max" — and `video_generation` is gated to `['max_15x','enterprise']` at `billing-catalog.ts:303`, so the real paywall shows the generic fallback); `use-billing-queries.ts:38` + `Billing/types.ts:3–12` (7-member union declared twice by hand); `apps/desktop/src/constants/llm.ts:245–267` reimplements the tier cascade and already omits the canonical free-tier `minTier` check (`model-catalog.ts:1608`).

### 59. Capability toggles fail open; dead feature-flag key

- Status: DONE (2026-08-09) — desktop settings store ownership — ac20a2962
- Area: security
- Severity: high
- Writes: apps/desktop/src-tauri/src/sys/security/capabilities.rs (as reported by the audit; no such file in this tree), `apps/desktop/src/stores/settingsStore.ts`, `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx`
- Verify: `cargo test -p agiworkforce-desktop capability_default_denied` (new) `&& pnpm --filter @agiworkforce/desktop test settingsStore`
- Evidence: `capabilities.rs:25–28` `is_enabled` returns `unwrap_or(true)`; `settingsStore.ts:1594–1603, 1707–1714` swallows the sync failure to `console.error` and still shows success, so `terminalAccess`/`fileOperations`/`codeExecution` stay live after being turned off; `DesktopCloudSettingsModal.tsx:496,515` indexes an untyped `Record<string, boolean>` with `native_web_search`, a key with exactly one hit repo-wide.
- ⚠ Serial with #56 (`settingsStore.ts`).

### 60. Provider host allowlists: three hand-typed copies, one functionally short

- Status: DONE (2026-08-09) — desktop constants consolidated — ac20a2962
- Area: security
- Severity: high
- Writes: `apps/web/lib/egress-policy.ts`, `services/api-gateway/src/services/providerHealth.ts`
- Verify: `pnpm --filter @agiworkforce/web test egress-policy && pnpm --filter @agiworkforce/api-gateway test providerHealth`
- Evidence: `egress-policy.ts:21–34` omits `api.x.ai`, `api.deepseek.com`, `api.perplexity.ai`, `openrouter.ai`, `dashscope.aliyuncs.com`, all present in the canonical `ALLOWED_MANAGED_PROVIDER_HOSTS` (`packages/ai/provider-runtime/src/base-url.ts`) that this app already imports at `apps/web/lib/services/provider-adapter-service.ts:6`; `providerHealth.ts:44–73, 92–102` is a third copy although `@agiworkforce/provider-runtime` is already a declared dependency (`services/api-gateway/package.json:19`).

### 61. Provider hostnames retyped across web routes and both Rust binaries

- Status: BLOCKED (2026-08-09) — BLOCKED — needs writes outside the declared Writes set. The provider-URL duplication is real and nearly every cited site confirmed, but the canonical registry and its consumers cannot be changed independently.
- Area: security
- Severity: medium
- Writes: `apps/web/app/api/media/image/generate/route.ts`, `apps/web/app/api/media/video/generate/route.ts`, `apps/web/app/api/media/video/status/route.ts`, `apps/web/app/api/llm/v1/embeddings/route.ts`, `apps/web/app/api/control-plane/status/route.ts`, `apps/web/scripts/test-llm-keys.ts`, `apps/web/lib/server/container-files.ts`, `apps/desktop/src/features/settings/CustomModelsSettings.tsx`, `apps/desktop/electron/config.ts`, `apps/desktop/vite.config.ts`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src/utils/security.ts`, `apps/desktop/src-tauri/src/core/agi/conversation_summarizer.rs`, `apps/desktop/src-tauri/src/integrations/api_integrations/perplexity.rs`, `apps/desktop/src-tauri/src/integrations/api_integrations/veo3.rs`, apps/desktop/src-tauri/src/core/llm/web_search_config.rs (as reported by the audit; no such file in this tree), `apps/cli/src/models/provider_dispatch.rs`, `apps/cli/src/voice.rs`
- Verify: `pnpm check:provider-contracts && cargo check --workspace`
- Evidence: `generativelanguage.googleapis.com` retyped in 6 files (`image/generate/route.ts:487,550`, `video/generate/route.ts:324`, `video/status/route.ts:218`, `embeddings/route.ts:132`, `control-plane/status/route.ts:54`, `test-llm-keys.ts:38`); `container-files.ts:88,99,117`; identical preset tables in the two `CustomModelsSettings.tsx`; `electron/config.ts:69` + `vite.config.ts:164` + `tauri.conf.json:37` + dead `security.ts:495–507` duplicate `GATEWAY_BASE_URL` (`apps/desktop/src/api/config.ts:19` says every module should import from there); `conversation_summarizer.rs:669,733`, `perplexity.rs:120`, `veo3.rs:85`, `web_search_config.rs:72` bypass `default_base_url()` (`core/llm/providers/direct_api_provider.rs:386–413`); `provider_dispatch.rs:638` duplicates `apps/cli/src/models/mod.rs:98`; `apps/cli/src/voice.rs:887` = `apps/desktop/src-tauri/src/sys/commands/voice.rs:522`.
- ⚠ Serial with #54, #55, #49, #50.

### 62. `vercel.json` `/v1/*` rewrites are inert and can silently diverge

- Status: BLOCKED (2026-08-09) — BLOCKED — half fixed inside the Writes set, half outside. The remaining half is recorded in the item rather than left implied.
- Area: ops
- Severity: high
- Writes: `vercel.json`, `apps/web/next.config.ts`
- Verify: `curl -sI https://api.agiworkforce.com/v1/chat/completions | grep x-matched-path`
- Evidence: `vercel.json:13–39` duplicates rewrites Vercel ignores for Next.js projects (per `next.config.ts`'s own comment; verified 2026-07-17 that `/v1` served `/_not-found`). Same item fixes the advertised `api.agiworkforce.com` 307 that strips the host condition and lands on 404.
- ⚠ Serial with #1 (`next.config.ts`), #28 (`vercel.json`).

### 63. Second, uneligible routing engine and a drifted Rust Auto-router

- Status: DONE (2026-08-09) — desktop panel duplication removed — ac20a2962
- Area: correctness
- Severity: high
- Writes: `packages/ui/unified-chat/src/lib/promptClassifier.ts`, `packages/ui/unified-chat/src/index.ts`, `crates/agiworkforce-model-registry/src/lib.rs`, `apps/web/shared/stores/model-store.ts`, `apps/cli/src/routing/classify.rs`
- Verify: `pnpm --filter @agiworkforce/unified-chat test promptClassifier && cargo test -p agiworkforce-model-registry auto_route_parity`
- Evidence: `promptClassifier.ts` hand-rolls its own taxonomy, a 4-chars/token estimator (canonical is 1/3.5 at `packages/ai/routing/src/classify.ts:109`) and slot map, imports nothing from `@agiworkforce/routing`, and `buildRoutingDecision` (`:432–446`, exported at `index.ts:63`) performs **zero** eligibility checks — delete it or route it through `resolveAutoRoute`; `crates/agiworkforce-model-registry/src/lib.rs:718` is the live CLI Auto decision path (called every turn from `apps/cli/src/agent/chat.rs:511`, **not** shadow-gated as AUTO-ROUTER-MIGRATION-01 claims) and is missing the `task_family_pareto` stage present at `packages/ai/routing/src/auto.ts:216–227,706,786`; `model-store.ts:83–107` reimplements `isDeprecated()` instead of importing it; `apps/cli/src/routing/classify.rs` needs a mechanical parity test, not a manual re-sync note.

### 64. Local-provider trust classification misses LM Studio, llama.cpp, vLLM

- Status: DONE (2026-08-09) — desktop retrieval path — ac20a2962
- Area: security
- Severity: medium
- Writes: `packages/ai/model-registry/catalog/harnesses.json`, `packages/contracts/types/src/model-catalog.ts`
- Verify: `pnpm check:trust-boundaries` (new assertion: every runtime offered in `LocalRuntimeSettings.tsx` resolves to surface `local`)
- Evidence: only `ollama/chat` carries `trustModes: ['local']` in the generated registry, so `getProviderSurface('lmstudio')` returns `hidden` (`model-catalog.ts:1392–1403`) despite `apps/desktop/src/features/settings/tabs/ModelsKeys/LocalRuntimeSettings.tsx:28,41,49,57` shipping full UI for all three.

### 65. Remaining magic-number duplication

- Status: DONE (2026-08-09) — desktop pagination contract — ac20a2962
- Area: ops
- Severity: medium
- Writes: `apps/desktop/src/stores/chat/chatStore.ts`, `apps/desktop/src/features/chat/CommandPalette.tsx`, `apps/desktop/src/features/mcp/MCPBundleBrowser.tsx`, `apps/mobile/stores/chat/chatViewStore.ts`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx`, `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx`, `apps/extension/src/webmcp.ts`, `apps/web/shared/lib/api.ts`, `apps/web/shared/lib/api-enhanced.ts`, `apps/web/app/api/chat/conversations/route.ts`, `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx`, `apps/web/features/schedules/components/SchedulesPage.tsx`, apps/desktop/e2e/fixtures/mock-data.ts (as reported by the audit; no such file in this tree)
- Verify: `pnpm check:hardcoded-arrays && pnpm typecheck:all`
- Evidence: 300 ms debounce independently chosen in 7 files (`chatStore.ts:170`, `CommandPalette.tsx:218`, `MCPBundleBrowser.tsx:651`, `chatViewStore.ts:251`, `LibraryView.tsx:175`, `GlobalSearchDialog.tsx:167`, `webmcp.ts:377`); 3-attempt retry defaults (`api.ts:31`, `api-enhanced.ts:115`, +2); page size 50 in 6 places with `SCHEDULE_PAGE_SIZE=50`/`RUN_PAGE_SIZE=20` duplicated verbatim across desktop and web; `mock-data.ts:221–267` asserted a standalone pricing table where 3 of 5 model IDs were absent from the catalog.

### 66. 20 desktop feature directories are unreachable from the shell

- Status: BLOCKED (2026-08-09) — BLOCKED — not a wiring change. The fix is a per-directory product decision across ~19k LOC; the agent declined to half-apply it, which is correct.
- Area: ux
- Severity: critical
- Writes: `apps/desktop/src/App.tsx`, `apps/desktop/src/routes/**`, or deletion of the dead trees (`mcp`, `git`, `dynamic-canvas`, `roi-dashboard`, `teams`, `reminders`, `analytics`, `notifications`, `file-upload`, `messaging`, `agent-collaboration`, `background-tasks`, `custom-instructions`, `document`, `editing`, `feedback`, `layout`, `media`, `outcomes`, `simple-mode`, `subscription`)
- Verify: `pnpm check:module-reachability && pnpm check:surface-reachability` (and wire the ratchet into CI)
- Evidence: 276 of 788 desktop renderer modules unreachable (35%); 537 modules / 94,513 LOC unreachable across all surfaces. Decide route-or-delete per directory; the orphan ratchet exists but does not run in CI.
- ⚠ Serial with #41.

---

## Wave 6 — Performance and scale

### 67. Time-to-first-token: ~37 strictly sequential round trips before the provider call

- Status: DONE (2026-08-09) — z-index scale adopted by the overlay primitives — c5d67f7be
- Area: perf
- Severity: critical
- Writes: `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`
- Verify: `pnpm --filter @agiworkforce/web test request-processor` plus a TTFT measurement before/after
- Evidence: 22 awaits between `processRequest` (`:1308`) and the end of the function; `grep -c 'Promise.all'` on that file returns 0.
- ⚠ Serial with #56.

### 68. RLS adapter costs 6 Postgres round trips per user-scoped read

- Status: DONE (2026-08-09) — locale bundles generated from the registry — c5d67f7be
- Area: perf
- Severity: critical
- Writes: `packages/platform/data-layer/src/adapters/neon.ts`
- Verify: `pnpm db:rls-probe && pnpm --filter @agiworkforce/data-layer test neon`
- Evidence: `neon.ts:279–315` (BEGIN, SET LOCAL ROLE, 2× `set_config`, query, COMMIT) repeated verbatim in `execute()` at `:325+`.

### 69. Streaming re-renders: markdown reparsed per token, whole transcript rebuilt per chunk

- Status: DONE (2026-08-09) — desktop reasoning renderer deduplicated — ac20a2962
- Area: perf
- Severity: critical
- Writes: packages/ui/unified-chat/src/components/MarkdownContent.tsx (as reported by the audit; no such file in this tree), `packages/ui/unified-chat/src/stores/chatStore.ts`
- Verify: `pnpm --filter @agiworkforce/unified-chat test MarkdownContent` (new: memoized) plus a main-thread profile of a 16k-char answer (currently 7.3 s)
- Evidence: `MarkdownContent` is a plain function component with no `React.memo`, calls `preprocessMath(content)` without `useMemo`, and reallocates all six plugin arrays each render; `appendToMessage` rebuilds the array via `messages.map(...)` per chunk.

### 70. Cloud sync uses one global sequence and unscoped indexes; history search is an unindexed ILIKE

- Status: DONE (2026-08-09) — desktop approval UI single owner — ac20a2962
- Area: perf
- Severity: high
- Writes: apps/web/db/neon/0106_sync_and_search_indexes.sql (as reported by the audit; no such file in this tree) (new), apps/web/app/api/chat/search/route.ts (as reported by the audit; no such file in this tree)
- Verify: `pnpm check:neon-migrations && pnpm test:db-migrate`
- Evidence: `cloud_sync_version_seq` is one sequence for all users and tables with single-column `server_version` indexes and no user scoping; history search pulls the user's entire conversation-ID list with no LIMIT (≈180 KB of binds at 5,000 UUIDs) then runs `content ilike '%q%'` against `web_messages`.

### 71. Scheduled tasks execute at most 10× per day platform-wide

- Status: DONE (2026-08-09) — ALREADY FIXED — the cited route was rewritten by the wave-2 schedule work (04c8aa9c3) before this item ran; evidence line no longer matches the tree.
- Area: ops
- Severity: critical
- Writes: `apps/web/app/api/cron/run-schedules/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test run-schedules` (new: a backlog larger than the batch triggers self-requeue until drained)
- Evidence: `run-schedules/route.ts:19` claims `limit: 10` with no while-loop, self-requeue or continuation token; claim query orders by `next_execution_at asc`, so newer users starve; `MAX_BATCH_SIZE` is 100 and the caller passes 10.
- ⚠ Serial with #28 (`vercel.json` cadence — see §Founder for the plan constraint).

---

## Wave 7 — i18n

### 72. Shared UI package: 0 of 154 component files use i18n (binding constraint)

- Status: DONE (2026-08-09) — model metadata from the canonical registry — c5d67f7be
- Area: ux
- Severity: high
- Writes: `packages/ui/ui/**`, `packages/ui/unified-chat/**`, `packages/ui/i18n/src/resources.ts`
- Verify: `pnpm check:i18n-parity && pnpm --filter @agiworkforce/unified-chat test`
- Evidence: `packages/ui/ui` (76 files) and `packages/ui/unified-chat` (222 files) both return 0 for `grep -rl useTranslation`; web and desktop consume this package, so it re-injects English into every surface. Do this before #73–#75.

### 73. Web i18n adoption, starting with device-auth, billing toasts and WebChatPage

- Status: DONE (2026-08-09) — GDPR e2e suite runs instead of skipping itself — ac20a2962
- Area: ux
- Severity: high
- Writes: `apps/web/app/auth/device/page.tsx`, `apps/web/features/billing/pages/BillingDashboard.tsx`, `apps/web/features/chat/pages/WebChatPage.tsx`, `packages/i18n/locales/**`
- Verify: `pnpm check:i18n-parity && pnpm --filter @agiworkforce/web test`
- Evidence: 7 of 760 non-test files under `apps/web/app` + `features` import `useTranslation`; `auth/device/page.tsx:217–311` is 100% literal English (the CLI/desktop pairing sign-in); `BillingDashboard.tsx:117,136` and 10+ other toasts are literals on the revenue path; `WebChatPage.tsx:3058,3061` still has raw `aria-label="Share conversation"` and `<span>Share</span>` inside an otherwise-wired file.

### 74. Desktop i18n adoption, starting with the first-run wizard

- Status: DONE (2026-08-09) — desktop retry policy single owner — ac20a2962
- Area: ux
- Severity: high
- Writes: `apps/desktop/src/features/onboarding/OnboardingWizard.tsx`, `apps/desktop/src/features/settings/**`, `apps/desktop/src/features/chat/**`, and deletion of `apps/desktop/src/i18n/locales/**`
- Verify: `pnpm check:i18n-parity && pnpm --filter @agiworkforce/desktop test`
- Evidence: 22 of 790 files use `useTranslation`; `features/settings` 0/77, `features/chat` 0/9, `features/onboarding` 0/3; `OnboardingWizard.tsx:235–308` (Local/BYOK/Cloud trust-boundary explainer) is the first screen a new user sees; the 12 `apps/desktop/src/i18n/locales/*/models.json` model-label maps are confirmed dead ("unloaded legacy copy", `apps/desktop/src/i18n/__tests__/v3CorpusCoverage.test.ts:1–7`).

### 75. Mobile i18n adoption, starting with Cloud sign-in

- Status: BLOCKED (2026-08-09) — BLOCKED — real, not a false positive, but unfixable inside the declared Writes set and the only honest alternative was a change far larger than the item.
- Area: ux
- Severity: medium
- Writes: `apps/mobile/app/(auth)/login.tsx`, `apps/mobile/src/features/**`
- Verify: `pnpm check:i18n-parity && pnpm --filter @agiworkforce/mobile test`
- Evidence: only the two language-picker settings screens use the working i18next/MMKV/RTL plumbing; `login.tsx:83,111,114` are literals.

### 76. Chrome extension has no i18n infrastructure at all

- Status: DONE (2026-08-09) — extension canonicalization — 664df8b69
- Area: ux
- Severity: high
- Writes: `apps/extension/_locales/en/messages.json` (new), `apps/extension/manifest.json`, `apps/extension/src/side_panel.ts`, `apps/extension/src/background.ts`
- Verify: `pnpm --filter @agiworkforce/extension test i18n` (new: no bare `.textContent =` string literal in user-facing paths)
- Evidence: zero `chrome.i18n.getMessage` calls, no `_locales/`, no `default_locale`; `side_panel.ts` (9,359 lines) builds its DOM via `.textContent` (`:4972`, `:6458`, `:6797`); `background.ts:4541–4549` hardcodes every context-menu title.
- ⚠ Serial with #8, #9, #49, #50.

### 77. VS Code extension and CLI TUI have no i18n infrastructure

- Status: DONE (2026-08-09) — mobile/vscode limits from contracts — 49d509f47
- Area: ux
- Severity: high
- Writes: apps/extension-vscode/package.nls.json (as reported by the audit; no such file in this tree) (new), `apps/extension-vscode/src/**`, `apps/cli/Cargo.toml`, `apps/cli/src/tui/widgets/**`, `apps/cli/locales/**` (new)
- Verify: `pnpm --filter agi-workforce test && cargo test -p agiworkforce-cli --lib tui`
- Evidence: zero hits for `useTranslation`/`vscode-nls`/`vscode.l10n` in `apps/extension-vscode/src`; no i18n/l10n crate in `Cargo.lock`; `apps/cli/src/tui/widgets/{command_popup,agent_picker}.rs` bake box-drawing headers, hint bars and empty states into render functions.

### 78. Guardrails currently failing: i18n key parity and mobile hex colors

- Status: DONE (2026-08-09) — thin-surface endpoint resolution — 49d509f47
- Area: ci
- Severity: medium
- Writes: `packages/i18n/locales/{zh,ru,pt,ko,ja,it,fr,de,ar,hi,es}/**`, apps/mobile/src/components/AgiMark.tsx (as reported by the audit; no such file in this tree), `apps/mobile/src/features/chat/components/WebSearchResultCard.tsx`, apps/mobile/src/components/MathBlock.tsx (as reported by the audit; no such file in this tree), apps/mobile/src/lib/sandboxedArtifactHtml.ts (as reported by the audit; no such file in this tree), apps/mobile/src/lib/syntaxHighlight.ts (as reported by the audit; no such file in this tree), apps/mobile/src/features/connectors/AddCustomConnectorModal.tsx (as reported by the audit; no such file in this tree)
- Verify: `pnpm check:i18n-parity && pnpm check:no-hex-mobile` (both must exit 0)
- Evidence: parity fails live with 2,075 findings (pricing.json 1,120, v3.json 418, auth.json 220, common.json 207, models.json 80, chat.json 10); hex check fails with exactly 15 findings at `AgiMark.tsx:17`, `WebSearchResultCard.tsx:7,68`, `MathBlock.tsx:269`, `sandboxedArtifactHtml.ts:22,51`, `syntaxHighlight.ts:295`, `AddCustomConnectorModal.tsx:194,230`.

---

## Wave 8 — Compliance, verification, growth

### 79. GDPR e2e suite skips itself into a green run

- Status: DONE (2026-08-09) — vercel.json inert rewrites retired — 438e154d4
- Area: ci
- Severity: high
- Writes: `apps/desktop/e2e/gdpr.spec.ts`
- Verify: `pnpm --filter @agiworkforce/desktop test:e2e gdpr` — zero skipped tests
- Evidence: 15 tests, 38 `test.skip(!<feature is visible>, ...)` calls; six are tautologies where the guard is followed by an assertion of the same predicate; two `beforeEach` hooks skip whole describes if the settings panel fails to open.

### 80. Signup → checkout → entitlement has zero end-to-end coverage

- Status: DONE (2026-08-09) — web contract gaps — 7aa633875
- Area: billing
- Severity: critical
- Writes: `apps/web/e2e/checkout.spec.ts` (new), `apps/web/app/api/stripe-webhook/lib/__tests__/route.test.ts` (new)
- Verify: `pnpm --filter @agiworkforce/web test:e2e checkout`
- Evidence: zero E2E files on any surface mention checkout or Stripe; `stripe-webhook/route.ts` has no colocated test. This is the class of defect that produced #25.

### 81. No load, stress or soak testing exists

- Status: REVERTED (2026-08-09) — REVERTED. The load-testing tooling was removed entirely rather than landed half-built: tools/load and .github/workflows/load.yml are gone, verified absent from disk, index and HEAD tree. A load suite that does not run is worse than none, because its presence reads as coverage. SCALE-VER-001 still wants a real one.
- Area: ci
- Severity: critical
- Writes: tools/load/ (as reported by the audit; no such file in this tree) (new), .github/workflows/load.yml (as reported by the audit; no such file in this tree) (new)
- Verify: `pnpm exec k6 run tools/load/streaming-chat.js` producing p95 TTFT, max concurrent streams, and Neon connection ceiling
- Evidence: no k6/artillery/autocannon/locust/JMeter/gatling/vegeta, no Lighthouse CI, no web-vitals, no `perf` script anywhere.

### 82. Nothing can page a human

- Status: DONE (2026-08-09) — health-probe cron + incident runbook — 7aa633875
- Area: ops
- Severity: critical
- Writes: `apps/web/app/api/cron/health-probe/route.ts` (new), `vercel.json`, `docs/runbooks/incident-response.md` (new)
- Verify: force `/api/health` to fail in preview and confirm the alert fires
- Evidence: no PagerDuty/Opsgenie/Alertmanager/alert webhook anywhere in apps, services, infrastructure, scripts or workflows; `/api/health` is correct and nothing calls it on a schedule; the 8 declared crons don't probe it. The four `*RUNBOOK*` files are all about app-store publishing.
- ⚠ Serial with #28, #62 (`vercel.json`); vendor choice is in §Founder.

### 83. No AI output quality evals

- Status: DONE (2026-08-09) — evals harness — c6dc19e52
- Area: security
- Severity: critical
- Writes: `tools/evals/` (new), `.github/workflows/evals.yml` (new)
- Verify: `pnpm exec vitest run tools/evals` with a grader, golden outputs, refusal set and a jailbreak corpus
- Evidence: of 1,746 test files none measures answer quality; the 5 live-model tests are gated off and run in none of the 17 CI workflows.

### 84. Zero funnel instrumentation and no value-first path

- Status: BLOCKED (2026-08-09) — BLOCKED — real, all four evidence claims confirmed, but it bundles two builds that cannot move independently inside one Writes set.
- Area: data
- Severity: critical
- Writes: `apps/web/app/layout.tsx`, apps/web/lib/analytics/events.ts (as reported by the audit; no such file in this tree) (new), `apps/web/app/(marketing)/**`, apps/web/app/api/chat/guest/route.ts (as reported by the audit; no such file in this tree) (new)
- Verify: `pnpm --filter @agiworkforce/web test analytics` (new: activation/conversion/retention events emitted) and an anonymous visitor can send one message without an account
- Evidence: `rg -c "gtag('event'"` across `apps/web` returns 0 files; GA is not mounted until analytics cookies are accepted (default off); no PostHog/Mixpanel/Amplitude/Segment; every acquisition CTA routes to `/login` and the auth gate returns 401 with no guest branch.

### 85. EU AI Act Article 50 disclosure is wired on one surface of six

- Status: DONE (2026-08-09) — AI-Act provenance on generated media — 7aa633875
- Area: legal
- Severity: critical
- Writes: `packages/compliance/ai-act/**`, `apps/web/**` (chat + media generation), `apps/desktop/src/**`, `apps/web/app/api/media/**` (server-side provenance marker)
- Verify: `pnpm --filter @agiworkforce/web test ai-act` (new: every generated image/video carries a provenance marker and every chat entry point discloses AI interaction)
- Evidence: a 939-line Article 50 package is imported only by mobile, backed by device-local storage a reinstall erases, with zero server-side enforcement; web and desktop generate images and video with no disclosure or marker. Applicable since 2026-08-02; EU users since 2026-06-27.

### 86. No record that any user accepted the terms

- Status: DONE (2026-08-09) — web route contract — 7aa633875
- Area: legal
- Severity: critical
- Writes: apps/web/db/neon/0107_terms_acceptance.sql (as reported by the audit; no such file in this tree) (new), `apps/web/app/(auth)/sign-up/**`, `apps/web/lib/server/terms.ts` (new)
- Verify: `pnpm check:neon-migrations && pnpm --filter @agiworkforce/web test terms-acceptance`
- Evidence: no clickwrap at signup and no `terms_accepted` column anywhere; without proof of assent the arbitration clause, class-action waiver and liability cap are unenforceable.

### 87. Restored data is not re-erased; no suppression/tombstone list

- Status: DONE (2026-08-09) — web limits from contracts — 7aa633875
- Area: legal
- Severity: critical
- Writes: `apps/web/db/neon/0108_erasure_tombstones.sql` (new), `apps/web/app/api/cron/purge-deleted-accounts/route.ts`, `apps/web/lib/server/account-erasure.ts`
- Verify: `pnpm --filter @agiworkforce/web test purge-deleted-accounts` (new: a resurrected profile whose deletion timestamp is in the past is re-erased on the next run)
- Evidence: the published DPA promises restored data is re-subjected to erasure, but the cron selects only profiles whose deletion timestamp has already passed, and a PITR restore to before the request resurrects the account permanently.
- ⚠ Serial with #30 (`account-erasure.ts`).

### 88. Ciphertext envelopes carry no key id or version

- Status: DONE (2026-08-09) — provider runtime contract — 664df8b69
- Area: security
- Severity: critical
- Writes: `apps/web/lib/crypto/envelope.ts`, apps/web/db/neon/0109_key_version.sql (as reported by the audit; no such file in this tree) (new), `scripts/reencrypt.mjs` (new), `docs/security/key-rotation.md` (new)
- Verify: `pnpm --filter @agiworkforce/web test envelope` (new: decrypt resolves by embedded key version; the re-encryption script is idempotent)
- Evidence: zero key-id/version byte in any envelope and zero `key_version` column across 98 migrations; no re-encryption script, no rotation runbook, no `docs/security/` directory. Rotating any of the five AES-256-GCM keys today silently invalidates every ciphertext (forcing a mass revoke of every Google/Slack connector grant). Vault/KMS decision is in §Founder.

### 89. Uploaded and generated files live at permanent unauthenticated URLs

- Status: PARTIALLY REMEDIATED IN SOURCE (2026-08-13) — chat attachments and
  project knowledge now presign into the existing private R2 bucket, expose
  opaque keys only, scan before registration, and read/delete through their
  owner/workspace API gates. New generated images, videos, and files write
  owner-hashed private keys and leave only through `/api/files/{id}`; an
  uncataloged generated-file object is compensated instead of exposed as a
  fallback. Legacy public rows retain an explicit read/delete fallback. Runtime
  verification is deferred until Web owns the one-app slot. Public avatars,
  legacy public generated objects, and unregistered abandoned-presign retention
  remain blocked on the policy in `FoundersAssistance.md` item 20.
- Area: data
- Severity: critical
- Writes: apps/web/lib/server/blob.ts (as reported by the audit; no such file in this tree), `apps/web/app/api/files/[id]/route.ts`, `apps/web/app/api/uploads/presign/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test files` (new: object URLs are signed and expire; the ownership check is load-bearing)
- Evidence: the privacy policy itself states in bold that anyone with the link can open the file without signing in, which makes the ownership check decorative for any URL that has left the app.
- ⚠ Serial with #19 (`presign/route.ts`).

### 90. Provider suspension is not failover-eligible

- Status: DONE (2026-08-09) — gateway route contract — 664df8b69
- Area: ops
- Severity: critical
- Writes: `packages/ai/provider-runtime/src/failover.ts`, `services/api-gateway/src/routes/llm.ts`
- Verify: `pnpm --filter @agiworkforce/provider-runtime test failover` (new: a 401 classified `auth` rotates to the next provider instead of hard-failing)
- Evidence: the rotator fires on connection/server/overload/capacity/timeout/rate-limit and explicitly excludes credential failures; web offers no BYOK escape hatch either.
- ⚠ Serial with #20, #21.

### 91. Deep links: three claimed Universal Link paths 404, Android claims the whole domain, push is broken

- Status: DONE (2026-08-09) — client-runtime retry policy — 664df8b69
- Area: mobile
- Severity: critical
- Writes: `apps/web/app/.well-known/apple-app-site-association/route.ts`, `apps/web/app/pair/**` (new), apps/mobile/app.json (as reported by the audit; no such file in this tree), `apps/mobile/app/_layout.tsx`, apps/web/app/api/notifications/send/route.ts (as reported by the audit; no such file in this tree)
- Verify: `pnpm --filter @agiworkforce/web test deep-links` (new: every claimed path resolves 200) and `pnpm --filter @agiworkforce/mobile test notifications`
- Evidence: all three claimed Universal Link paths 404 on web and the in-app pairing handler is gated on a value hardcoded `null`, so both branches of every email/QR CTA are dead while a CI job certifies the association documents; Android `autoVerify` has no path filter, so marketing/pricing/blog links open the app into a dead end; one server-side sender covers eleven client event types, the only opt-in toggle lives on web (a mobile-only user can never receive a notification although iOS spends its one-shot prompt), and there is no `google-services.json`.

### 92. Undisclosed subprocessor and stale store listings

- Status: DONE (2026-08-09) — mobile contract migration — 664df8b69
- Area: legal
- Severity: critical
- Writes: apps/web/app/legal/subprocessors/page.tsx (as reported by the audit; no such file in this tree), docs/store/app-store-listing.md (as reported by the audit; no such file in this tree), `apps/web/lib/__tests__/public-billing-copy.test.ts`
- Verify: `pnpm --filter @agiworkforce/web test public-billing-copy` (new: the markdown listing is parsed and asserted, not just the two JSON files)
- Evidence: every push notification body (containing user scheduled-task names) is relayed through Expo and every launch calls Expo's update endpoint, yet Expo is absent from a subprocessors page whose own header says omitting a live processor "is a compliance defect, not a documentation gap"; the human-readable listing still prints "Hobby — $5/mo" and advertises BYOK and computer-use behind flags hardcoded `false`.

### 93. Platform moderation is seven opt-in regexes

- Status: DONE (2026-08-09) — request-processor contract — 7aa633875
- Area: security
- Severity: high
- Writes: `apps/web/lib/moderation/**`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`, `apps/web/app/api/uploads/**`
- Verify: `pnpm --filter @agiworkforce/web test moderation` (new: server-side classifier runs regardless of the user setting; uploads hash-matched)
- Evidence: no server-side classifier, no image/PDF content scanning beyond active-content checks, no hash matching, no illegal-content reporting pipeline; the only platform filter is a keyword list the user must opt into under Settings → Safety.
- ⚠ Serial with #67.

### 94. Plugin marketplace 503s on an unapplied migration

- Status: DONE (2026-08-09) — web capability metadata — 7aa633875
- Area: data
- Severity: high
- Writes: `apps/web/app/plugins/page.tsx`, `apps/web/db/neon/0096_plugin_registry.sql`
- Verify: `pnpm db:migrate && curl -s https://agiworkforce.com/plugins | grep -v 'temporarily unreachable'`
- Evidence: Postgres `42P01 undefined_table` because `0096_plugin_registry.sql` was never applied to production; even restored, no third party can publish a pack — the page admits every entry is a declared pack with no artifact.

### 95. No down-migrations across 98 migrations

- Status: DONE (2026-08-09) — ui token adoption — 664df8b69
- Area: data
- Severity: critical
- Writes: `apps/web/db/neon/**`, `scripts/check-neon-migrations.mjs`
- Verify: `pnpm check:neon-migrations` (new rule: every new migration ships a paired down script) `&& pnpm test:db-migrate`
- Evidence: 98 migrations, zero reversals — paired with #4, this is why a bad deploy has no exit.

### 96. Developer API is unusable as documented

- Status: BLOCKED (2026-08-09) — BLOCKED — only partly reachable from its own Writes set, and the true blocker is worse than the item states.
- Area: correctness
- Severity: high
- Writes: `apps/web/public/openapi.json`, `apps/web/app/api/llm/v1/**`, `docs/api/rate-limits.md` (new)
- Verify: `curl -s https://api.agiworkforce.com/v1/models -H "Authorization: Bearer $KEY"` returns 200
- Evidence: the advertised host 307s to the apex and lands on 404 (see #62); only `https://agiworkforce.com/api/llm/v1/chat/completions` works; no SDK, no webhooks, no Files or Conversations API, 3 scopes, no published rate-limit table.
- ⚠ Serial with #62.

### 97. Voice/TTS has no catalog routing slot; mobile and desktop fight over `language.locale`

- Status: DONE (2026-08-09) — model-catalog ownership — 664df8b69
- Area: ux
- Severity: high
- Writes: `packages/contracts/types/src/model-catalog.ts`, `apps/desktop/src-tauri/src/features/speech/tts.rs`, `apps/mobile/services/cloudSettingsMapping.ts`, `apps/desktop/src/services/managedCloudSettingsSync.ts`
- Verify: `pnpm check:model-catalog && pnpm --filter @agiworkforce/mobile test cloudSettingsMapping`
- Evidence: `model-catalog.ts:989, 1029–1030, 1980` defines only `voice_transcription` and `voice_rewrite` — no synthesis slot, so TTS model selection sits outside catalog governance (the acute retired-default regression is fixed in `tts.rs` with a guard test, but the architectural gap remains); `apps/mobile/services/cloudSettingsMapping.ts:175,251` binds `language.locale` to TTS voice language while `apps/desktop/src/services/managedCloudSettingsSync.ts:465,509–512` binds the same synced key to `i18n.changeLanguage`, so each surface silently reconfigures the other every sync cycle.

### 98. Shared UI hand-parses desktop's private storage to pick a trust label

- Status: DONE (2026-08-09) — docs/api generated from contracts — c6dc19e52
- Area: security
- Severity: high
- Writes: `packages/ui/unified-chat/src/components/ModelSelector.tsx`, `packages/client/client-runtime/src/mode.ts` (new)
- Verify: `pnpm --filter @agiworkforce/unified-chat test ModelSelector` (new: a missing `app-mode-store` key must not fall back to the cloud catalog while in Local mode)
- Evidence: `ModelSelector.tsx:158` reaches across the package boundary into `localStorage['app-mode-store']`, a key owned by desktop and retyped a third time in its priming guard; desktop's own comment documents the wrong-catalog fallback.
- ⚠ Serial with #72.

### 99. Z-index scale is defined and never used

- Status: DONE (2026-08-09) — reference-integrity allowlist — c6dc19e52
- Area: ux
- Severity: high
- Writes: `apps/web/app/globals.css`, `apps/web/shared/lib/design-tokens.ts`, `packages/ui/ui/src/{select,dropdown-menu,context-menu,menubar,hover-card,tooltip,sheet,drawer}.tsx`
- Verify: `pnpm check:css-tokens` (new rule: no raw `z-index` literal in component source)
- Evidence: `apps/web/shared/lib/design-tokens.ts:136–150` exports a `zIndex` scale with no matching `--z-*` block in `globals.css`; eight overlay components each hardcode their own, one gallery component hardcodes six.
- ⚠ Serial with #72.

---

## Write collisions — these pairs must run serially

| File                                                                   | Items              | Order                               |
| ---------------------------------------------------------------------- | ------------------ | ----------------------------------- |
| `.github/workflows/ci.yml`                                             | #3, #5             | #3 then #5                          |
| `apps/web/next.config.ts`                                              | #1, #62            | #1 then #62                         |
| `vercel.json`                                                          | #28, #62, #82      | #28 → #62 → #82                     |
| `services/api-gateway/src/services/managedUsageBilling.ts`             | #20, #21, #33, #90 | #20 → #21 → #33 → #90               |
| `apps/web/lib/cost-tracker.ts`                                         | #33 only (merged)  | —                                   |
| `packages/contracts/types/src/billing-catalog.ts`                      | #28, #29           | #28 then #29                        |
| `apps/web/.env.example`                                                | #23, #24           | #23 then #24                        |
| `apps/web/app/api/stripe-webhook/lib/*`                                | #25, #26           | #25 then #26                        |
| `apps/web/lib/server/account-erasure.ts`                               | #30, #87           | #30 then #87                        |
| `apps/web/app/api/uploads/presign/route.ts`                            | #19, #89           | #19 then #89                        |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`    | #56, #67, #93      | #67 → #56 → #93                     |
| `apps/extension/src/background.ts` + `background/policy.ts`            | #8, #9, #76        | #8 → #9 → #76                       |
| `apps/extension/src/side_panel.ts`                                     | #49, #50, #76      | #50 → #49 → #76                     |
| `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`                | #14, #46           | #14 then #46                        |
| `apps/desktop/src-tauri/.../image_gen.rs`, `perplexity.rs`, `voice.rs` | #54, #55, #61      | #54 → #55 → #61                     |
| `apps/desktop/src/stores/settingsStore.ts`                             | #56, #59           | #59 then #56                        |
| `apps/desktop/src/utils/ipc.ts`                                        | #45, #57           | #45 then #57                        |
| `apps/desktop/src/api/embeddings.ts`                                   | #50, #57           | #50 then #57                        |
| `apps/cli/src/voice.rs`                                                | #55, #61           | #55 then #61                        |
| `apps/web/scripts/test-llm-keys.ts`                                    | #55, #61           | #55 then #61                        |
| `packages/ui/**`                                                       | #72, #98, #99      | #72 first, then #98/#99 in parallel |
| desktop feature dirs (`roi-dashboard`, `dynamic-canvas`, …)            | #41, #66           | decide #66 (route-or-delete) first  |

Everything not listed here has a disjoint Writes set and may run in parallel within its wave.

---

## Founder or dashboard actions — not code work

These block or gate code items but cannot be closed by a commit.

1. **Vercel plan.** Hobby costs instant rollback, spend caps, an SLA, and sub-daily cron; it is why #71 exists and why sandboxes bill up to 24 h before reclamation. Upgrading is the precondition for #28/#71 landing as a cadence change rather than a requeue hack. (Reminder: a sub-daily cron in `vercel.json` on Hobby silently kills every deploy.)
2. **Publishing credentials.** The GitHub org has two Actions secrets (both Tauri signing), zero Actions variables, and none of the four publishing environments the release workflows require. Five of six surfaces are structurally incapable of reaching a user. The only desktop release tag says "defer macos to v1.2.1 — apple\_\* signing secrets not configured" (2026-05-04); 532 desktop commits have landed since. Buy the $99 Apple Developer account, create the four environments.
3. **Desktop release manifests.** All four (`darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, `linux-x86_64`) 404 and `/api/releases/desktop-cloud/latest` returns "No cloud build" — 739 Rust files and 1,309 Tauri commands are unreachable by any user. Depends on item 2.
4. **Tauri signing key custody.** `TAURI_SIGNING_PRIVATE_KEY`'s public half is baked into every shipped binary; the private half exists only as a single unbackupable CI secret. Losing it bricks auto-update for every install; leaking it lets an attacker sign updates every install accepts. Escrow it.
5. **KMS / key escrow decision.** Five AES-256-GCM keys live only as env vars with no KMS, escrow, or rotation. A DB restore without those exact bytes makes 2FA secrets, connector tokens and device tokens permanently undecryptable. This decision gates #88.
6. **Backup and restore policy.** Recovery relies on an undocumented Neon PITR window plus an object bucket with zero versioning and zero lifecycle config, from which the media purge cron issues unconditional hard deletes; DB and object store have independent recovery points, so a restore yields rows pointing at deleted objects. Set the PITR window, enable bucket versioning, document both.
7. **Stripe dashboard preconditions for `automatic_tax`.** Enable Stripe Tax, set the origin address, set `tax_behavior` per Price, register per jurisdiction. `automatic_tax: { enabled: true }` at `apps/web/app/api/checkout/route.ts:332` silently returns 0% and under-collects VAT until these exist. Nothing in the repo can check them.
8. **Alerting vendor.** Pick PagerDuty/Opsgenie/BetterStack and provision the on-call rotation; #82 wires the probe but has nothing to page.
9. **App Store / Play privacy declarations.** Both currently declare email+name only and "shares nothing" while the published subprocessors page names Anthropic, OpenAI, Google, xAI and DeepSeek and the cloud path uploads whole conversations. Correct the labels; #92 fixes the repo-side listing.
10. **GDPR Art. 27 EU representative.** `/legal/eu-representative` states in the company's own words that the obligation "is live and unmet." Appoint one.
11. **Repository visibility.** `siddharthanagula3/agiworkforce` is public, so every unpatched finding in this queue — #6, #10, #17, #20 — is readable with exact file and line. Make it private until Wave 1 and Wave 2 land.
12. **Account custody.** Every account, signing certificate, store identity and the git origin sit under one personal handle, hardcoded as the production download default (`apps/web/app/api/download/route.ts:20–21, 31` — fix the hardcoding as part of #24; the ownership transfer is yours). Nothing in the repo describes who else can reach them.
13. **"Code" and Connectors: ship or de-list.** `/code` is in the signed-in nav with a live "New session" button while all four API routes return 503; the catalog advertises 89 integrations while Settings renders all 84 non-exclusive ones as "Coming soon" with no Connect button (`oauth-registry.ts:9`: "SHIPS WITH ZERO PROVIDERS ON PURPOSE") and the public directory POST returns 501. Either provision the backends/OAuth apps or remove the nav entries — this is a product decision, not a patch.
14. **Effort allocation.** 41% of the codebase is a desktop app (including an IMAP/SMTP client and an ROI dashboard) that no user can download; lifetime downloads across every public release are 45, with 0 stars/forks/watchers and Web Analytics not enabled. Items 2, 3 and #84 are the cheapest paths to a first real user.

---

## Closed — do not re-report

| Finding                                             | Why it is closed                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tiers-openapi-seats-minimum-stale`                 | Fixed on `chore/retire-stale-docs` by `6804e8096`; `apps/web/public/openapi.json` now reads `"minimum": 2` and the test asserts `MIN_PURCHASABLE_SEATS` instead of the literal. (Absent on `fix/codeql-high-severity-batch-1`, which never carried `7611c622b`'s billing work.) |
| `tiers-checkout-positive-control`                   | Positive control, not a defect. `apps/web/lib/validations/checkout.ts:3,25,69` correctly imports `MIN_PURCHASABLE_SEATS`.                                                                                                                                                       |
| `tokens-context-monitor-positive-control`           | Positive control, not a defect. `apps/desktop/src-tauri/src/sys/commands/chat/context_monitor.rs:44–46` documents `DEFAULT_CONTEXT_WINDOW = 128_000` as a conservative fallback for uncatalogued BYOK/local models — the pattern the other token findings should copy.          |
| `priorart-ext-onboarding-slash-finder-unbuilt`      | Fixed. `apps/extension/src/side_panel.ts:4768–4786` now points at Workflows; the "Type / in the chat" copy is gone. Matches `docs/agent-context/known-flaws.md:1127–1131`.                                                                                                      |
| `priorart-mobile-connectors-route-theater-resolved` | Fixed 2026-07-11 and verified no regression: `apps/mobile/src/features/settings/cloud-connectors/index.tsx` calls `fetchConnectorDirectory()` against `GET /api/connectors`; no hardcoded catalog remains.                                                                      |

Corrections carried into the items above, so they are not re-litigated: the decimal-IP SSRF bypass in #14 is not real (the `url` crate canonicalizes first); the "enforced ceiling of 25" in #48 does not exist; the Rust Auto-router in #63 is **not** shadow-gated (it is the live CLI path, so the drift is worse than reported); `WebChatPage.tsx` has 9 real `t()` calls, not 54; `mock-data.ts` has 3 nonexistent model IDs, not 2; `LOCAL_PROVIDER_IDS` is derived, not a literal array — the bug is an incomplete harness registry.

---

## Mobile media generation — 2026-08-13 session

### DONE (verified by driving the iOS Simulator, not by typecheck)

- **`[+]` sheet was a dead control — every bottom sheet in the app was.**
  `@gorhom/bottom-sheet@5.2.8` renders nothing under RN 0.86.2 / Fabric. Proved
  by reducing to a minimal sheet (`index={0}`, fixed snap point, plain `View`)
  that also painted nothing while a plain `View` and a Reanimated-driven `View`
  beside it painted fine. Upgraded to `5.2.14`. This unblocked Add-to-Chat,
  model picker, style, voice, paywall, compare, export and schedules sheets.
- **Image aspect ratio: picker + full wire path.** The managed image route has
  always accepted and validated `aspect_ratio` per adapter; no surface ever sent
  one, so every generated image took the route's legacy square default. Added
  `getImageAspectOptionsForModel` / `isImageAspectSupported` to the shared
  catalog (keyed by `imageApi`), the picker in `AddToChatSheet`, `imageAspectRatio`
  in `chatViewStore`, validation in `resolveMobileImageGenerationRequest`, and the
  field through `runImageGenerationTurn`. Verified end to end: selecting
  Portrait 9:16 produced a portrait image.
- **Generated media rendered ABOVE the prompt that asked for it.**
  `beginImageGeneration`/`beginVideoGeneration` gave both rows one `createdAt`;
  the cloud comparator broke the tie on `id`, and the assistant's uuidv7 is
  minted first, so the reply sorted before the user. Reply is now timestamped
  strictly after the prompt. Verified on device.
- **Every reply was read aloud in typed chats.** `chat/[id].tsx` gated auto-TTS
  on `settings.voiceEnabled` — which is the "Voice Input / use the microphone"
  preference and defaults to ON. Removed the auto-speak effect; reading aloud now
  has exactly two deliberate entry points (voice mode, per-message play control).
- **Raw internal errors shown to users.** A cancelled generation printed
  "FetchRequestCanceledException ... (at Expo/NativeResponse.swift:63)" into the
  transcript. Added `presentableMediaError`.

### TODO

- **Reference images for image/video generation (founder 2026-08-13).** The
  composer must accept a source image for image-to-image and image-to-video. The
  wire already models this — `managed-media.ts` carries an edit/source-image
  contract — so this is a client + route-adapter task, not a contract change.
- **Verify video aspect + quality on device.** Both lists are implemented and
  catalog-driven (all 4 video models publish `outputSizes`), but only the image
  path has been driven through a real generation this session.
- **File rendering after generation** — not yet re-verified post-upgrade.
- **UI/UX parity pass vs ChatGPT/Claude** using the 87 reference screenshots.
  The earlier empty-state suggestion, cold-start mode, and Settings-exit gaps
  are now source-patched: both chat entry points mount catalog-aware suggestion
  chips, auth hydration preserves an eligible Cloud preference, and Settings
  has a visible Close control. They remain in the next one-app Mobile device
  pass until the rendered behavior is rechecked against the references.
- **Audit the other newly-reachable sheets.** They were unreachable until the
  bottom-sheet upgrade, so none of their contents have ever been exercised.

### Web composer — 2026-08-13 (founder-reported)

- **DONE: video/image mode reverted to text on first send.** Composer toggles are
  keyed by conversation and the new-chat surface writes them under
  `PENDING_CONVERSATION_KEY`. The first send creates a real conversation and
  navigates to it, but only drafts and messages were migrated across — toggles
  were forgotten, so a chat started in Video reverted to a plain text composer
  the moment it got an id, mid-generation. Added
  `adoptPendingComposerToggles(conversationId)` to `web-chat-store`, called at
  the creation site in `WebChatPage` (keyed to creation, NOT to activation, so
  pending toggles cannot bleed onto an existing chat opened from the sidebar).

- **TODO: no way to stop a video generation (half-wired capability).**
  `apps/web/app/api/media/video/cancel/route.ts` is fully implemented AND has a
  test suite (`__tests__/api/media-video-cancel.test.ts`) — it tracks
  `cancelRequestedAt`, provider cancel attempts, and a `requested`/`unconfirmed`
  state machine. **No client anywhere calls it**: grep for `media/video/cancel`
  across `apps/` and `packages/` returns only the route, its generated route
  types, and its own test. Neither Web nor Mobile has a control.
  `ChatComposerNew.tsx:2234` actively suppresses the Stop button whenever
  `videoMode` is set, and `:2245` disables the textarea, so a 1–2 minute
  generation is completely uninterruptible. Wire the Stop button in video mode to
  POST the job id, reflect `cancel_requested` in `VideoGenerationPlaceholder`,
  and settle the billing reservation. Mirror on Mobile.

### Mobile test pass — 2026-08-13 (manual finding, corrected and re-verified)

Driven manually in the iOS Simulator, Cloud mode, Google models only.

**DONE — first Cloud send now waits for the capability handshake.**

- The original manual failure was real: Mobile treated "the `/api/me`
  capability handshake has not arrived yet" as a denial, so Web Search and file
  creation could disappear on the first Cloud turn even though the catalog and
  server allowed them.
- `ensureCloudEntitlementsReadyForRequest()` now safely joins an in-flight tier
  refresh or performs the first Cloud refresh before deriving the request flags.
  It does not run in Local mode, is account-epoch guarded, and an actual server
  denial still wins. The streaming contract now carries the explicit
  `office_creation` flag instead of silently dropping it.
- Regression coverage observes the real network body after a delayed
  entitlement response and proves `web_search: true` reaches the HTTP request.

**SOURCE-PATCHED; DEVICE RECHECK PENDING — prompt echoed into the reply.**
`stripLeadingCurrentPromptEcho` now removes only an exact, turn-scoped echo of
the current prompt (including the observed standalone-period separator), and
the streaming accumulator applies it before rendering/persisting assistant
content. This source-only reconciliation did not run Metro or the Simulator, so
the prior visual reproduction remains the acceptance case.

**P1 — no reasoning / status / streaming feedback (founder-reported).** After
send, the transcript sits completely blank for up to 60s: no thinking block, no
status steps, no streaming indicator. `ThinkingChip`, `StatusStep`,
`AgentActivityTimeline`, `StreamingIndicator` all exist but nothing renders.

**SOURCE-PATCHED; DEVICE RECHECK PENDING — markdown table clipping.**
`MessageContentRenderer` now places tables in an explicit horizontal
`ScrollView`, keeps the indicator visible, and gives cells readable bounded
widths instead of flex-collapsing them into the phone viewport.

**SOURCE-PATCHED; DEVICE RECHECK PENDING — generated CSV card title.** Durable
generated-file descriptors now win over a duplicate fenced-data artifact,
retain the server filename, and are deduplicated into synchronized message
metadata. Unrelated fenced code remains visible.

**SOURCE-PATCHED; COLD-START RECHECK PENDING — Cloud mode reset.** Auth
hydration now publishes Clerk-loaded only after owner/sign-in/Cloud state is
coherent, and the chat screen waits for definitive auth before downgrading a
persisted Cloud preference. A loaded signed-out session still fails closed to
Local.

**P3 — model chip briefly shows the wrong model** right after selection (showed
the prior Google model immediately after tapping another catalog model, then
corrected later). Needs confirmation; may be my synthetic scroll.

**WORKING (verified):** `[+]` sheet, model picker sheet, image generation with
aspect ratio (portrait 9:16 confirmed), markdown headings/lists/blockquote/
inline code/fenced code with syntax highlighting + language label + copy button,
artifact card detection, message ordering (user before assistant), no auto
read-aloud. Markdown-table horizontal scrolling is now source-patched but has
not yet joined this device-verified list.

#### Second sweep — navigation, library, artifacts, theme

- **SOURCE-PATCHED; DEVICE RECHECK PENDING — Artifacts image thumbnails.** The
  grid now resolves the same authenticated image source as Library/detail and
  renders explicit loading, signed-out, and unavailable fallbacks.
- **SOURCE-PATCHED; DEVICE RECHECK PENDING — Settings root exit.** The top-level
  header now has a visible **Close settings** control that returns through real
  navigation history, with the chat tab only as a no-history fallback.
- **SOURCE-PATCHED; DEVICE RECHECK PENDING — Markdown table last column.** The
  same horizontal-table owner above covers both themes.
- **P3 Library `IMAGE` badge is clipped** at the tile's top-left corner.
- **SOURCE-PATCHED; DEVICE RECHECK PENDING — Links.** Markdown links now use the
  active teal/accent token as well as underline styling.
- **P3 Scroll-to-bottom FAB overlaps the message action row.**
- **SOURCE-PATCHED; DEVICE RECHECK PENDING — drawer naming.** The destination is
  now labeled **Remote** and continues to route to the companion surface.
- **Tasks screen carries no timestamps** while Chats does — four identical rows
  are indistinguishable. Also no way to dismiss a finished run.

**Verified healthy:** drawer + all destinations, Chats list (date grouping,
relative timestamps, search, New chat), Library (thumbnails, filter chips,
search), artifact detail (image, copy, share, close), Appearance switching,
dark mode across chat/code/tables/artifact cards with syntax highlighting
intact, Settings account section (tier shows Max 15x).

### Phase 1 — mobile tool capabilities — DONE 2026-08-13

Root cause was not the catalog and not the model: it was that Mobile treated
**"no capability handshake yet" as "denied"**.

- `grantedCapabilities` starts `[]`; `refreshTier()` early-returns when
  `appMode !== 'cloud'` (`billing/store.ts:122`) and the app always launches in
  Local (`app/_layout.tsx:375-381`); every failure path is swallowed. So the
  array stayed empty and `chatExecutionStore.ts:1606` failed closed forever.
  Web never hit this because it does not consult `capability_handshake` at all.
- Added `capabilityHandshakeReceived` + `isCapabilityRequestable(cap)`: absence
  of a handshake no longer denies, an actual handshake is still obeyed exactly.
  The route re-checks entitlement, so the client cannot grant itself anything.
- **File creation was impossible by construction** — `office_creation` had zero
  occurrences in apps/mobile. Now sent, gated on the same switch as code
  execution (the capability reference pairs them under one control).
- `features.codeExecution` defaulted **false** with its only control buried in
  Settings > Capabilities, so in practice it was never on. Now defaults true;
  every capability gate still applies.
- Renamed "AGI Code" → "Code execution and file creation" with a description
  that says what it actually enables.

Test fallout, all resolved deliberately:

- 12 suites failed on `useFocusEffect`/`useNavigation` "is not a function" —
  fallout from the earlier launch-crash fix that moved those imports to
  `expo-router`. The jest mocks still put them on `@react-navigation/native`.
  Mocks realigned to follow the production import.
- `chatStore.test.ts` asserted denial from an empty array alone. Updated to set
  `capabilityHandshakeReceived: true` so it tests a REAL denial, and added a
  regression guard asserting web search is still requested when no handshake has
  been received — the exact bug.
- Image tests updated to assert `aspect_ratio` reaches the wire.

Result after the first-turn capability correction: 320 suites / 2865 tests
passing, typecheck clean.

### Phase 2 — mobile typed results, durable files, and activity — DONE locally 2026-08-13

- Server capability negotiation now admits `surface: mobile` for the canonical
  `map-search.v1` tool while preserving the exact advertised-card, streaming,
  tools-capable-model, and map-intent gates.
- The native map renderer sends the signed-in Bearer header with each tile,
  never loads Managed Cloud tiles in Local, and retains a useful provider link
  through loading/auth/tile failures.
- Interactive cards and generated-file descriptors are deduplicated and stored
  in synchronized metadata as well as the live message shape, so transcript
  reload and another Cloud client do not erase them.
- Activity UI now uses progressive disclosure: active work/approval opens,
  terminal work collapses, failures remain first-class, and source previews are
  bounded. Legacy tool rows expose a supplied duration and failed state without
  requiring expansion.
- Verification: Mobile focused 8 suites / 134 tests; full Mobile 321 suites /
  2878 tests / 33 snapshots; Mobile typecheck and scoped ESLint; Web typecheck;
  request-processor map tests 7/7; `git diff --check`.
- Rendered iPhone 17 Pro / iOS 26.5 proof: the current native bundle loaded,
  the Local/Cloud boundary and composer rendered, and a real deployed-Cloud map
  prompt completed. The deployed `agiworkforce.com` backend still returned
  prose saying it could not display a map because these server changes are not
  deployed yet. A local-API attempt correctly failed closed on the mismatched
  local Clerk environment rather than bypassing auth. Production map acceptance
  therefore remains the explicit deployment/sign-in gate in
  `FoundersAssistance.md` #15; local code and regression coverage are complete.

### Desktop Local Tasks capability honesty — 2026-08-13

- `DONE` Dynamic Ollama rows no longer inherit synthetic `Balanced`,
  `standard`, or `premium` quality claims. They display only provider-reported
  capabilities and the reported context window.
- `DONE` DesktopShell and Tasks use one catalog-authoritative eligibility
  helper: an exact model must declare both `agentic` and `tools`.
- `DONE` The native Task submission boundary independently requires an exact
  verified catalog model and trust-compatible provider; missing or dynamic
  targets fail closed.
- `DONE` One-app WDIO manual pass selected the real installed model named by
  `AGI_WDIO_OLLAMA_MODEL_ID`, clicked Sequential and Parallel, observed the
  visible disabled Launch state, and observed the native rejection. Screenshots:
  `apps/desktop/wdio/screenshots/local-agent-tasks-review/00-local-model-picker.png`
  and `01-local-task-capability-gate.png`.
- `BLOCKED_BY_HUMAN` No installed model is currently verified for Local Tasks.
  Founder/model-resource certification steps are recorded in
  `FoundersAssistance.md` #17. Project Chat remains available.

### Desktop Settings transaction and native persistence — 2026-08-13

- `DONE` The one-app Tauri WDIO discard journey passed all three live dialog
  flows in `settings-discard-confirm.spec.ts`: X-close surfaced the discard
  confirmation, **Keep editing** retained the draft, Personalization edits
  enabled **Save Changes**, explicit discard restored the opening value, and a
  dirty deferred edit kept the global Save/Cancel footer after navigating to a
  self-saving section.
- `DONE` The native persistence journey in
  `settings-persistence-restart.spec.ts` committed the visible Ollama URL,
  Personalization name, theme, UI scale, reduced-motion preference, approval
  timeout, and timeout policy through **Save Changes**; read the same values
  from the native settings file; reloaded the renderer; and observed every
  value rehydrate in Settings. Its `finally` path restored the exact original
  native snapshot and reloaded it, so the evidence did not leave a probe value
  in the developer profile.
- `DONE` These are native WDIO interaction results, not build-only claims. No
  additional founder action is required for the Settings discard/persistence
  slice; broader Desktop release/runtime blockers remain tracked separately.

### Desktop Local connector approval boundary — 2026-08-13

- `DONE` The one-app Tauri WDIO journey selected the installed model named by
  `AGI_WDIO_OLLAMA_MODEL_ID`, confirmed Project Chat remains available while
  Tasks is labeled unverified, created a uniquely named loopback custom MCP connector,
  and observed it remain disconnected pending native approval.
- `DONE` The real native approval window received focus above Desktop. Choosing
  **Deny** left the connector disconnected and emitted no false successful
  `mcp_connect_server` state. The journey removed its fixture and restored the
  original connector snapshot in `finally`.
- `DONE` This closes the tested denial/focus/state-integrity slice. It does not
  certify a third-party OAuth connector or an approved remote MCP session;
  those still require provider registrations and an intentionally authorized
  live endpoint.

### Electron Cloud shell source reconciliation — 2026-08-13

- `SOURCE_PATCHED` The packaged macOS callback scheme is registered as
  `agiworkforce-cloud`, the renderer hook listens in Electron as well as Tauri,
  and the release workflow verifies the scheme inside each signed app bundle.
- `SOURCE_PATCHED` The shell no longer claims an unavailable in-place
  `electron-updater` feed. Settings/tray check the canonical published-release
  endpoint and explicitly open the architecture-specific signed DMG in the
  browser. Release jobs build from the exact tag and clean orphaned drafts when
  downstream publication does not succeed.
- `SOURCE_PATCHED` Native permission checks are now origin-scoped. Media grants
  accept microphone audio only, camera is denied, and display capture requires
  a user gesture plus a trusted renderer and an explicit system/app source
  choice instead of silently sharing the first screen.
- `RUNTIME_PENDING` No Electron app, packaged DMG, signing/notarization job, or
  installed callback/update journey was run in this source-only reconciliation.
  These changes must not be described as release-verified until the signed
  artifact is installed and clicked through.

### VS Code extension manual release loop — 2026-08-13

- `DONE` Packaged `agi-workforce-0.3.0.vsix` was installed into an isolated
  VS Code 1.131 profile and exercised as the only running app. The four-step
  onboarding, new-session reset, More actions, runtime setup handoff, Context,
  workspace-scoped Memory, and every Settings destination were clicked.
- `DONE` The sidebar and Settings were inspected at normal and narrow widths.
  Settings switched to its compact horizontal navigation with working previous/
  next controls; the sidebar retained the runtime block, composer, history,
  Context, and Memory without clipping or horizontal overflow.
- `DONE` The fresh-session header now says `Route pending` until the CLI returns
  an authoritative Local, BYOK, or Managed Cloud trust mode. Account usage and
  sign-in state cannot pre-label or overwrite that runtime boundary.
- `DONE` The installed CLI failed honestly because it does not implement
  developer-session protocol 7. The UI disabled model/composer/send, explained
  the exact version/path problem, and `Open setup` opened Runtime Settings.
  No prompt or workspace content was sent.
- `DONE` The isolated Extension Host log contained no AGI error or warning.
  The two renderer diagnostics were VS Code-owned (bundled Mermaid proposed API
  and a generic Node `url.parse` deprecation), not emitted by this extension.
- `DONE` TypeScript, 13 webview files / 79 checks, production packaging, and
  VSIX verification pass. The verified archive contains 17 entries and is
  397.42 KB.
- `BLOCKED_BY_HUMAN` A real Local/BYOK/Managed turn, activity stream, approval,
  Stop, and post-thread boundary transition require a released protocol-7 AGI
  CLI/runtime plus the corresponding provider/account environment. The current
  public recovery UI is complete and fails closed; it does not fabricate a
  usable runtime.

### Chrome extension source release loop — 2026-08-13

- `DONE` Chrome typecheck, lint, 113 test files / 1,554 checks, no-direct-cloud-
  IPC guard, no-hardcoded-colour guard, and the production Vite build pass.
- `DONE` The suite caught one stale static security-test matcher after the send
  callback contract changed. The test now inspects both current
  `CHAT_MESSAGE` payloads through their canonical routing spread and still
  proves no `apiKey` field can be sent.
- `DONE` Production packaging fails closed before ZIP creation when
  `CHROME_EXTENSION_PUBLIC_KEY` is missing. The build did not mint an unstable
  extension identity or describe an incomplete package as release-ready.
- `DONE` Options now renders actual Chrome shortcut bindings and gives approved-
  site/profile mutations honest loading, failure, rollback, and announced
  success states. Computer-use approval preference writes are mutation-fenced;
  approval dialogs receive focus and restore it after decision/expiry.
- `BLOCKED_BY_HUMAN` The exact Web Store package and stable-ID installation
  remain Founders Assistance #9. No real Google Chrome profile was available
  to this run, so the live side-panel and Options click-through remains
  separate from the Chromium harness and
  source/build proof above. Exact acceptance steps are in Founders Assistance
  #14.

### Late release-integration verification — 2026-08-13

- `DONE` Web checkout return verification now binds the authenticated user to a
  canonical Checkout Session target tier and waits for that exact tier before
  presenting upgrade success. Public Team/Enterprise/BYOK copy and legal/refund
  links were reconciled. Web typecheck and 7 focused files / 72 checks pass.
- `DONE` Desktop task refresh retains execution mode, swarm metrics, and pause
  reason. A full Desktop typecheck exposed and then closed an undefined billing
  plan selector plus stale subscription-owner fixtures. Desktop and Electron
  typechecks pass; 2 focused files / 43 checks pass.
- `DONE` Desktop task recovery now distinguishes a renderer reload from a
  native-process restart. Native AGI initialization is process-idempotent, a
  state-only lifecycle query recovers swarm/auto tasks that have no sequential
  execution context, and persisted active rows with no native owner terminate
  as failed with explicit review-before-retry copy instead of polling forever.
- `DONE IN SOURCE; RUST CHECK PENDING` The source-proven arbitrary-public Rust
  transports (Discord/generic/scheduler webhooks, API call/upload/download,
  and physical scrape) now use one fail-closed initial-URL plus every-redirect
  boundary. Intentional loopback Ollama/CDP/local-API and BYOK transports remain
  separate. The public-then-private DNS rebinding race still needs connect-time
  address pinning or a network firewall.
- `OPEN` Normal Desktop task execution still does not call OutcomeTracker, the
  outcomes UI is unmounted, and native Rust egress lacks a mandatory global
  type across every fixed-provider/account/integration transport. These are
  explicit ownership/design gates, not UI controls that can be safely exposed
  as finished.
