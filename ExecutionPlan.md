# ExecutionPlan

Status: Current
Owner: Platform lead
Last updated: 2026-08-24

The open execution queue, ordered consequence-to-effort. Completed items are
removed rather than annotated — `CHANGELOG.md` carries verified slices and
`docs/agent-context/known-flaws.md` carries durable defects. 14 statused items
remain: 2 in progress, 8 blocked, 3 reverted, 1 partial, plus the unstatused
entries in the demo-readiness and Gold Goal cycles. Counts are verifiable with
`grep -cE '^- Status:' ExecutionPlan.md`; keep them that way.

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
- `TODO` Still unverified through the UI: Deep Research end to end, Projects
  detail, memory, and a connector actually connecting.
- `DONE` Account name casing is one shared rule across surfaces. Clerk stores
  this profile as "SIDDHARTHA NAGULA"; the greeting had a local fix and the
  sidebar four inches below it still shouted a truncated "SIDDHARTH…".
  `normalizeDisplayName` / `resolveAccountDisplayName` / `accountInitial` now
  live in `@agiworkforce/utils/display-name` and are used by the web greeting,
  web sidebar and chat account footer, desktop account menu / settings /
  profile sync, and mobile settings + cloud-account. A name the USER typed
  (mobile personalization nickname/fullName) is deliberately left exactly as
  typed — only provider-stored values are normalised.
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
- `DONE` File/image attachment upload, end to end in the real browser. Three
  separate defects, each of which alone made the feature unusable:
  1. **The menu row was unreachable.** "+ → Add photos & files" is the first
     row of a 392px popover that renders `absolute bottom-full` inside the chat
     shell's `overflow-hidden` column. On the EMPTY chat screen the composer is
     centred INSIDE that clipped column, so at a 670px viewport the menu opened
     at y=10 against a clip rect starting at y=44 and the first 34px — the whole
     "Add photos & files" row — was cut off. `document.elementFromPoint` over it
     returned the shell div: there was no way to attach a file to a message from
     the web composer at all. New `AnchoredComposerMenu` portals composer
     popovers to `document.body`, positions them from the trigger's rect, flips
     below when there is more room, and clamps to the viewport with internal
     scrolling. Applied to the "+" menu and to StyleSelector (468px, opened at
     y=-64 with "Default" and "Concise" outside the viewport).
  2. **R2 had no CORS policy.** Attachments upload browser-direct with a
     presigned PUT; the private bucket had NO CORS configuration, so the
     preflight failed and the send dropped the message. Applied and read back on
     both buckets; `scripts/r2-apply-cors.mjs` reproduces it. See
     `FoundersAssistance.md` #21 for the API token that lets CI re-run it.
  3. **The transcript chip was a near-empty slab.** The attachment row is a flex
     row, which defaults to `align-items: stretch`, so the compact file chip was
     stretched to the 96px height of the image thumbnail beside it. Now
     `items-start`, and the chip shows the real byte count it already had.
     Verified: a PNG + a .txt uploaded, the model read BOTH (named the three band
     colours and quoted the revenue target from the text file), and both files
     appear in Library as READY with correct sizes.
- `TODO` Convert the remaining composer popovers (mentions `@`, project picker,
  media aspect/quality/duration) to `AnchoredComposerMenu`. They are shorter, so
  they survive a 670px viewport today — measured, not assumed — but they sit in
  the same clipped column and will cut off on a smaller window.
- `DONE` Web search and citations were exercised live with inline activity,
  numbered source chips, and follow-up actions.
- `DONE` Projects page visual language. It painted `--agi-bg-3` (the marketing
  palette's warm parchment) across a 480px panel with one small white card
  floating in it, while Library/Schedules/Chat render cards directly on the page
  background — so Projects read as a different, half-finished product the moment
  you navigated to it. The panel is now a plain layout container; the cards are
  the surfaces.
- `DONE` Library card actions. "Delete" and the stale-entry notice were bare
  siblings BELOW the card in a `gap-1` column, so a red underlined link floated
  in the grid gutter between rows. The grid cell now owns the card chrome and
  the actions are an attached footer behind a hairline.
- `DONE` AGI Work exercised live: mode toggle, plan/goal trail, per-step
  progress, stop control, queued follow-up composer, completion state, and a
  real answer rendered. Custom instructions verified working in the same pass —
  the saved "call out assumptions" instruction visibly shaped the reply.
- `DONE` An assistant turn that finishes with NOTHING now says so. Observed
  live: an AGI Work run streamed for 26s, finished `stop`, persisted the `​`
  empty-content placeholder, and rendered a header + model label + action bar
  with no answer between them — indistinguishable from the app losing the
  response. `producedNoVisibleOutput` in MessageBubble renders an honest line
  pointing at Retry, and excludes every non-text output (image, video, artifact,
  file, code result, search, interactive card) so a generated-image turn never
  trips it. Verified against image/video/attachment/text turns: no false
  positives.
- `DONE` Skills and Plugins are live and need no founder action — verified by
  calling the APIs signed in: `/api/skills` returns the 9 bundled skills
  (`source: bundled`, downloadable, traced into the Vercel bundle by
  `outputFileTracingIncludes`), `/api/plugins` returns the built-in catalog.
- `BLOCKED_BY_HUMAN` Connectors. `/api/connectors` returns
  `{"connectors":[],"available":[]}` because `oauth-registry.ts` ships with zero
  providers on purpose and no `CONNECTOR_OAUTH_*` / `GITHUB_APP_*` env is set.
  Not a defect — unconfigured. Exact steps in `FoundersAssistance.md` #22.
  "Connect remote MCP server" already works without any of it.
- `DONE` MCP SDK floor moved `^1.0.4` → `^1.30.0` (the newest published), and
  the deprecated-transport downgrade stopped being silent. `ConnectorsPage` had
  `parsedUrl.pathname.endsWith('/sse') ? 'sse' : 'streamable-http'` duplicated
  at two call sites and said nothing: pasting `https://mcp.linear.app/sse`
  quietly parked the user on the HTTP+SSE transport from protocol `2024-11-05`,
  deprecated since `2025-03-26` and listed as eligible for removal, when the
  same server publishes `/mcp` as primary. Both sites now use
  `features/connectors/lib/mcp-transport-choice.ts`, which returns the
  transport AND a deprecation flag with the conventional modern URL, surfaced
  as an amber notice. The URL is deliberately NOT rewritten for the user — not
  every server mounts its modern endpoint at `/mcp`, and a silent rewrite turns
  a working connection into an unexplainable 404.
- `TODO` **Pivot to MCP `2026-07-28` — BLOCKED on the official SDK, not on us.**

  Checked against npm on 2026-08-13: `@modelcontextprotocol/sdk@1.30.0` (the
  newest published) still declares `LATEST_PROTOCOL_VERSION = '2025-11-25'`.
  There is no SDK support for `2026-07-28` to adopt. Hand-rolling the new
  transport means maintaining a fork of the reference client against a spec
  whose reference implementation has not shipped — a bad trade while nothing
  in the product is broken by staying on `2025-11-25`.

  What lands when the SDK ships it (all MUST-level for clients):
  - **Sessions are gone.** No `Mcp-Session-Id`, no `initialize` handshake, no
    GET stream endpoint, no `Last-Event-ID` resume. A conforming server answers
    GET/DELETE with `405` and must "ignore it, and do not mint or echo session
    IDs". This is strictly GOOD for us: each tool call becomes a self-contained
    POST, which is what a Vercel serverless deployment can actually serve
    without sticky routing or a shared session store.
  - **Per-request metadata** replaces the handshake:
    `_meta.io.modelcontextprotocol/{protocolVersion,clientInfo,clientCapabilities}`.
  - **Mirrored headers**, required and validated: `MCP-Protocol-Version`,
    `Mcp-Method`, and `Mcp-Name` for the tools/call, resources/read and
    prompts/get methods. A header that disagrees with the body is `400` +
    `-32020 HeaderMismatch` — deliberately, so a load balancer routing on the
    header cannot diverge from the server executing on the body.
  - **Servers no longer initiate requests.** Sampling / elicitation / roots
    become MRTR: the server returns `InputRequiredResult` and the CLIENT
    retries the original request carrying `inputResponses`. Our
    `connect.ts callTool` assumes a single round trip and will need the retry
    loop.
  - **`x-mcp-header`**: clients MUST mirror annotated tool params into
    `Mcp-Param-{Name}` headers, Base64-sentinel-encode unsafe values, and
    REJECT (exclude from the tools/list result) any tool whose annotation breaks the
    constraints.
  - SSE survives only as a per-request response stream; long-lived
    notifications move to a `subscriptions/listen` request whose response
    stream stays open. Cancellation on HTTP is closing that stream.
  - **`server/discover`** is the replacement for `initialize`: servers MUST
    implement it, clients MAY call it once for up-front version/capability
    selection. `ping`, `logging/setLevel` and `notifications/roots/list_changed`
    are REMOVED outright (not deprecated).
  - **`resultType` on every result** — `"complete"` or `"input_required"`.
    Clients MUST treat an absent value from older servers as `"complete"`.
  - **`_meta` required fields**: `io.modelcontextprotocol/protocolVersion` and
    `clientCapabilities` are REQUIRED on every request; `clientInfo` SHOULD be.
    A missing required field is `-32602` + HTTP 400. A capability the client did
    not declare is `-32021 MissingRequiredClientCapability` carrying
    `data.requiredCapabilities`.
  - **Error codes renumbered** into the new MCP-reserved `-32020..-32099` band:
    `HeaderMismatch` `-32001`→`-32020`, `MissingRequiredClientCapability`
    `-32003`→`-32021`, `UnsupportedProtocolVersion` `-32004`→`-32022`. Resource
    not found moves `-32002`→`-32602`, though clients SHOULD still accept
    `-32002` from older servers.
  - **`CacheableResult`**: `ttlMs` + `cacheScope` (`public`/`private`) become
    required on the list/read results. Real win for us — a freshness hint we can
    cache against instead of re-listing tools every turn. Servers SHOULD also
    return the tools/list result in deterministic order specifically to improve LLM
    prompt-cache hit rates, which is money on our side.
  - **Tasks left the core protocol** for the `io.modelcontextprotocol/tasks`
    extension: polling via `tasks/get`, `tasks/update` for client→server input,
    no `tasks/list`, and servers may hand back task handles unsolicited. This is
    the closest thing in the spec to what AGI Work already does; worth reading
    before the next agent-runtime change.

  DEPRECATED in this revision (SEP-2577), all with an earliest removal of the
  first revision on or after **2027-07-28** — except HTTP+SSE, which is
  **three months after SEP-2596 reaches Final**, i.e. by far the nearest:
  - **Roots** → pass directories/files as tool parameters or resource URIs.
  - **Sampling** → integrate directly with LLM provider APIs. Notable for us:
    the spec is explicitly steering servers AWAY from asking the client for
    completions, which is the model our provider layer already uses.
  - **Logging** (`logging/setLevel`, `notifications/message`) → stderr on stdio,
    OpenTelemetry otherwise. We already emit spans; `_meta` now reserves
    `traceparent`/`tracestate`/`baggage` for W3C trace-context propagation, so
    our existing trace ids can ride along once we send `_meta`.
  - **HTTP+SSE transport** → Streamable HTTP. Already handled above.
  - **Dynamic Client Registration** → Client ID Metadata Documents.

  Writes: `packages/tools/mcp/**`, plus `apps/web/lib/user-connector-tools.ts`
  for the MRTR retry. Re-check `npm view @modelcontextprotocol/sdk version`
  before starting; the transport work is a no-op until that reports
  `2026-07-28` support.

- `TODO` **Two 2026-07-28 items that are NOT SDK-blocked — do these without
  waiting.**
  1. **An authorization-server change is not DETECTED (SEP-2352).**
     Scoped carefully, because most of this is already handled and an earlier
     draft of this entry overstated it:
     - Already safe: `connector_oauth_grants` stores `token_endpoint` ("captured
       so a later refresh cannot be pointed somewhere else by an edited registry
       entry without detection"), and `oauth-access.ts:101` really does refresh
       against `grant.tokenEndpoint` — the STORED value, not the descriptor's
       current `tokenUrl`. Editing `CONNECTOR_OAUTH_PROVIDERS_JSON` therefore
       cannot redirect a refresh. That is the main confused-deputy vector and it
       is closed.
     - Still open: the grant is keyed `unique (user_id, connector_id)` with no
       issuer, and nothing COMPARES the stored endpoint against the descriptor
       at read time. So if an operator repoints a connectorId at a different
       authorization server, the old grant keeps reading as connected and its
       already-minted access token is presented to the new `mcpUrl`. SEP-2352
       requires clients to "key persisted credentials by the issuer identifier
       … and MUST re-register when the authorization server changes".
     - Fix: compare the descriptor's issuer/token endpoint against the grant on
       read, and treat a mismatch as `reauthorization-required` rather than
       serving the stale grant. An `issuer` column plus a widened unique
       constraint makes it explicit rather than inferred from `token_endpoint`.
     - Zero migration risk today: `/api/connectors` returns an empty list, so no
       provider is configured and the table has no rows.
  2. `DONE` **`$ref` values were counted but never inspected.**
     `validateMcpInputSchema` in `packages/tools/mcp/src/connect.ts` caps depth
     (16), `$ref` count (64) and key count (512) — good bounds, and they already
     satisfy the new composition-keyword guidance. But the spec now states
     implementations "MUST NOT automatically dereference `$ref` values that
     resolve to a network URI", with any opt-in mode defaulting off and
     rejecting loopback/link-local/private addresses. We do not dereference
     today, so this is not a live SSRF — but nothing in the validator would stop
     a future consumer from doing so, and a schema whose `$ref` cannot resolve
     SHOULD be rejected rather than passed to the model as silently permissive.
     Fixed: `isNetworkRef` rejects any `$ref` carrying an absolute URI scheme at
     schema-admission time, so the invariant is enforced at the boundary instead
     of resting on "we happen not to call fetch". Local (`#/$defs/…`) and
     relative (`defs.json#/Foo`) refs are untouched — a legitimate tool pays
     nothing. 6 tests cover both directions, including the
     `169.254.169.254` metadata-service shape.

- `TODO` **MCP OAuth discovery — the connector story does not scale without it.**

  We implement exactly ONE of the three client-registration mechanisms the MCP
  authorization spec defines, and it is the one that costs founder labour per
  provider forever. Verified against the RELEASED `2026-07-28` spec (the
  revision Claude announced adopting on 2026-07-28), which is substantively
  identical to `draft` on every point below:

  | Mechanism                              | Spec status                                          | Who registers                               |
  | -------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
  | Client ID Metadata Documents (CIMD)    | **SHOULD** support                                   | nobody — an HTTPS URL IS the `client_id`    |
  | Dynamic Client Registration (RFC 7591) | **MAY**; explicitly **deprecated**, back-compat only | nobody — `POST /register` at connect time   |
  | Pre-registration                       | fallback                                             | **us, per provider** ← the only one we have |

  This is why Claude's custom connectors ask a user for a URL and nothing else:
  Anthropic has no per-provider business arrangement, the protocol negotiates
  it. Our `CONNECTOR_OAUTH_PROVIDERS_JSON` path means a user can never add an
  MCP server we have not personally onboarded.

  Normative client requirements to satisfy (all from the same spec):
  - **MUST** use Protected Resource Metadata (RFC 9728) for AS discovery —
    read `resource_metadata` from the 401 `WWW-Authenticate`, fetch
    `/.well-known/oauth-protected-resource`.
  - **MUST** support BOTH RFC 8414 and OpenID Connect Discovery for AS metadata.
  - **SHOULD** support CIMD; host our document (e.g.
    `https://agiworkforce.com/.well-known/oauth-client`) and pass that URL as
    `client_id`. An AS advertises support with
    `"client_id_metadata_document_supported": true` in its metadata, so this is
    detectable rather than guessed.

    CORRECTION to an earlier reading of this item: the spec's client priority is
    **pre-registration → CIMD → DCR → prompt the user**, so pre-registration
    ranks FIRST, not last. `CONNECTOR_OAUTH_PROVIDERS_JSON` is therefore the
    PREFERRED path wherever a relationship already exists — it is not legacy and
    is not replaced by this work. CIMD is what covers the servers we have not
    pre-registered, which is the part that unlocks "any MCP server". DCR is the
    only one actually deprecated here.

  - **MUST** send RFC 8707 `resource` on BOTH the authorization and token
    request, regardless of whether the AS supports it. This is what binds a
    token to one MCP server so it cannot be replayed at another.
  - **MUST** record the AS `issuer` before redirecting and validate RFC 9207
    `iss` on the callback per the spec's four-row table, INCLUDING on error
    responses — a mismatch means not even rendering `error_description`.
  - **SHOULD** follow the scope-selection priority (challenge `scope` first,
    then `scopes_supported`) and implement the step-up flow on
    `insufficient_scope`, re-requesting the UNION of old and challenged scopes.

  Writes: `apps/web/lib/connectors/**`, `apps/web/app/api/connectors/oauth/**`,
  a new `.well-known` route. Reuses what already exists: PKCE, state, encrypted
  token storage, refresh, revocation, per-user scoping.

  Keep `CONNECTOR_OAUTH_PROVIDERS_JSON` afterwards as the escape hatch for
  providers that only support pre-registration.

  Sequencing note: do NOT hand-register Linear/Notion/Slack first. That builds
  the thing this item replaces and then has to be unbuilt.

- `DONE` Mobile could not be built for either store. The release preflight
  failed at its first substantive gate: "Mobile and @agiworkforce/local-llm
  resolve different React Native runtimes". Both declared 0.86.2, but
  `@types/react` and `react` are (optional and required) PEERS of react-native,
  mobile supplied them and `local-llm` did not, so pnpm minted two physically
  distinct RN instances — the exact "second native module in Metro or the app
  binary" the guard was written to stop (rationale recovered from the deleted
  `EXPO_VERSION_NOTES.md`). Aligned local-llm's dev peers with mobile's and
  reinstalled; both now resolve one runtime. A second, masked failure followed:
  commit `310ca5667` had replaced `react-native` with `typescript` in
  `expo.install.exclude`, dropping the documented validation exception the same
  guard requires — restored, keeping both. The preflight now passes every gate
  up to the store credentials (`FoundersAssistance.md` #23). Mobile suite green:
  2,895 tests / 322 suites, typecheck clean, local-llm 83 tests clean.
- `DONE` Web production build passes (`pnpm --filter @agiworkforce/web build`,
  exit 0) — the release gate that matters most for public launch.
- `DONE` Audit sweep of `AGIWORKFORCE_GAP_AUDIT_2026-08-08.md` and
  `AGI_WORKFORCE_AUDIT_REMEDIATION_LOOP.md` for web/mobile items. Most are
  already remediated on this head: HARD-006 (upload cap) survives only in two
  dead modules, MATCH-004/006/007/008/012 and CRIT-005/006/007 are fixed and
  guarded by their own tests. Repo guardrails confirm it — `check:hardcoded-arrays`,
  `check:model-catalog`, `check:css-tokens`, `check:availability-invariant`,
  `check:no-hex-mobile`, `check:hardcoded-endpoints`, `check:model-id-literals`,
  `check:mobile-hygiene`, `check:trust-boundaries`, `check:llm-failures`,
  `check:service-layer` all pass.
- `TODO` `check:knip` is red repo-wide (746 unused files, mostly desktop/CLI,
  plus two configs it cannot load). Pre-existing and outside the web/mobile
  scope; needs its own pass rather than a bulk delete.
- `TODO` Two dead web modules still carry their own wrong limits, now pointed at
  the canonical constant but not removed: `shared/ui/ai-prompt-box.tsx` (an
  815-line SECOND composer, zero importers, already declared debt in the
  reachability allowlist) and `SecurityManager` in `shared/lib/security.ts`
  (~700 lines, zero importers repo-wide). Deleting ~1,500 lines is a founder
  call, not mine.
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
- `TODO` **SEC-16 — establish the dispatch control-channel key out of band.**
  The false threat-model claim was withdrawn on 2026-08-17 (both module
  docstrings now state that the layer does not defend against the relay; guard:
  `apps/mobile/__tests__/dispatch-hmac-threat-model.test.ts`). The key itself is
  unchanged and still HKDF(IKM = relay-minted pairing code, salt = relayed
  session salt), so a relay compromise still mints envelopes that verify.
  Remaining work, all of which must land together: (1) desktop generates 32
  random bytes per pairing, keeps them local, and appends them to the QR payload
  the relay returned, so `agiw:<code>:<pairToken>:<secret>`; (2) that secret,
  not the code, becomes the HKDF IKM on both peers — `deriveDispatchSecret` in
  `apps/mobile/lib/dispatchHmac.ts` and `derive_session_key` in
  `apps/desktop/src-tauri/src/sys/security/dispatch_hmac.rs`, plus the
  `dispatch_hmac_init` Tauri command parameter; (3) each envelope gains a `from`
  role inside `canonicalSigningInput` / `canonical_signing_input` so a frame
  cannot be reflected back at its sender; (4) the manual-entry fallback in
  `apps/mobile/src/features/companion/components/QRScanner.tsx` carries no
  secret and needs the founder decision below before it can keep working; (5)
  the wire change breaks every paired device, so `DISPATCH_HMAC_REQUIRED_AFTER`
  and `DISPATCH_HMAC_MIN_MOBILE_VERSION` need a coordinated bump. Blocked on
  `FoundersAssistance.md` §33.
- `TODO` **AI-58 — one host-relay/remote-control contract, defined before any
  dependent surface.** `docs/current/frontend-experience-contract.md` §13 has
  Remote control as Absent on Web, unmounted on Desktop, static on Mobile, and
  host-transport-missing on CLI and VS Code; the parity matrix carries the same
  chain as MS-3, MS-18 and CAP-049. Nothing in the tree is a projection or
  remote-control protocol — `apps/desktop/src/features/mobile-companion/` is
  QR pairing plus an approval card, and `apps/mobile/app/(app)/companion/` is
  the approval client for it. The contract has three parts and none exists: a
  host transport (CLI and Desktop expose a session a remote client can attach
  to), device grants with issue/list/expire/revoke replacing today's ephemeral
  session key, and a projection client (Mobile and Web render and drive that
  session). Effort XL across five surfaces plus the relay; it is founder-
  approved scope on the 2026-08-01 Build list, not a defect to patch, and it
  must not be started as a placeholder screen.

### Known blockers for this cycle

- Sign-in: the agent cannot create accounts or enter passwords. The founder
  signed the Playwright browser in manually on 2026-08-12. If that session
  expires, the walkthrough stalls until a session is re-established. Recorded in
  `FoundersAssistance.md`.

## Gold Goal — current execution cycle

This is the live product plan. The historical audit waves below remain evidence
and a regression queue; they do not replace Website-first product validation.
Only the next verified slice is expanded here so that the plan stays actionable.

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

## Wave 2 — Money

### 29. Enterprise tier is `unlimited: true` at `monthlyPriceUsd: 0`; local-only/BYOK quotas contradict themselves

- Status: REVERTED (2026-08-09) — REVERTED. The fix was inert: the fail-closed branch could not fire, and the numeric arm of `automationsPerDay` has no producer. Reverting exposed the real finding, which is larger than this item — `hasFeature`, `checkFeatureAccess`, `checkAutomationLimit`/`checkApiCallLimit`/`checkStorageLimit`, eight grace-period helpers and the whole `constants/pricing.ts` module have zero production callers. That is a dead subsystem, not a limit bug; it needs its own item rather than a patch to one constant. Revert verified byte-identical to HEAD by checksum. **Update 2026-08-22:** the dead subsystem is gone — `apps/desktop/src/constants/pricing.ts` and `planFeatures.ts` no longer exist in the tree (the surviving pricing type is `apps/desktop/src/types/pricing.ts`), so the `Writes:` list below is historical. Re-derive the item against the current tree before working it.
- Area: billing
- Severity: critical
- Writes: `packages/contracts/types/src/billing-catalog.ts`, `apps/desktop/src/constants/pricing.ts`, `apps/desktop/src/constants/planFeatures.ts`, apps/desktop/src/lib/featureGates.ts (as reported by the audit; no such file in this tree)
- Verify: `pnpm --filter @agiworkforce/types test billing-catalog && pnpm --filter @agiworkforce/desktop test featureGates` (new: no tier is simultaneously unlimited and capped; unlimited tiers carry a cost ceiling)
- Evidence: Enterprise resolves every rolling cap to `null` with $1,000,000 ledger headroom at price 0; `featureGates.ts:72` reads a table capping local-only/byok at 5/10 while `featureGates.ts:107` enforces "unlimited" for the same tiers, and no server-side automation counter exists.
- ⚠ Serial with #28.

---

## Wave 3 — Deletion, retention and data integrity

### 38. Cloud Code approval gate is write-only — three of four states unreachable

- Status: BLOCKED (2026-08-09) — BLOCKED — needs writes outside the declared Writes set. Cloud-code approval rows can be inserted but not decided; closing it touches the agent loop and the approvals service together.
- Area: data
- Severity: high
- Writes: `apps/web/lib/services/cloud-code-agent-loop.ts`, apps/web/app/api/cloud-code/approvals/route.ts (as reported by the audit; no such file in this tree) (new)
- Verify: `pnpm --filter @agiworkforce/web test cloud-code-approvals` (new: approve → resume, reject → abort, expiry sweep)
- Evidence: `apps/web/db/neon/0082_cloud_code_agent_turns.sql:102–127`; the table has one INSERT, no SELECT/UPDATE, and `preApproved` is supplied only by tests.
- ⚠ Serial with #22.

## Wave 4 — Broken contracts (dead UI, dead events, dead paths)

### 43. VS Code client drops `task/state_changed` and `server/warning`

- Status: BLOCKED (2026-08-09) — BLOCKED. The finding is real — the stdio developer-session transport the extension speaks is not the one the host implements — but closing it needs writes well outside this item's declared set, so the agent reverted its experiment and left the tree clean rather than half-landing a transport change.
- Area: correctness
- Severity: high
- Writes: `apps/extension-vscode/src/integrations/localRuntimeClient.ts`
- Verify: `pnpm --filter agi-workforce test localRuntimeClient` (new: all 9 notification methods parsed; `notification_lag` surfaces to the user)
- Evidence: `localRuntimeClient.ts:252–331` handles 7 of 9.

## Wave 5 — Registry and constant drift

### 54. Image generation calls three model IDs that do not exist in the catalog

- Status: REVERTED (2026-08-09) — REVERTED. Every symbol the fix added was unreachable, and `ImageProvider::GoogleImagenLite` was left as a discriminant selecting nothing. Image-model slot resolution needs the provider registry work (HARD-001) to land first; doing it here would have produced a second unused copy. Revert verified byte-identical to HEAD by checksum.
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs`
- Verify: `cargo test -p agiworkforce-desktop resolve_image_model` (new: every canonical ID passed in must resolve) and `pnpm check:model-catalog`
- Evidence: `image_gen.rs:241–245, 371–375` passed retired provider wire identifiers instead of resolving the live canonical image roster; the curation verification history compiled into `packages/contracts/types/src/models.json` records their removal, while the same catalog's image-generation capability rows identify the supported successors without duplicating their IDs here. `resolve_image_model()` (`image_gen.rs:10–18`) therefore always fell through to a literal wire ID.
- ⚠ Serial with #55, #71.

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

### 66. 20 desktop feature directories are unreachable from the shell

- Status: BLOCKED (2026-08-09) — BLOCKED — not a wiring change. The fix is a per-directory product decision across ~19k LOC; the agent declined to half-apply it, which is correct.
- Area: ux
- Severity: critical
- Writes: `apps/desktop/src/App.tsx`, `apps/desktop/src/routes/**`, or deletion of the dead trees (`mcp`, `git`, `dynamic-canvas`, `roi-dashboard`, `teams`, `reminders`, `analytics`, `notifications`, `file-upload`, `messaging`, `agent-collaboration`, `background-tasks`, `custom-instructions`, `document`, `editing`, `feedback`, `layout`, `media`, `outcomes`, `simple-mode`, `subscription`)
- Verify: `pnpm check:module-reachability && pnpm check:surface-reachability` (and wire the ratchet into CI)
- Evidence: 276 of 788 desktop renderer modules unreachable (35%); 537 modules / 94,513 LOC unreachable across all surfaces. Decide route-or-delete per directory; the orphan ratchet exists but does not run in CI.
- ⚠ Serial with #41.

---

## Wave 7 — i18n

### 75. Mobile i18n adoption, starting with Cloud sign-in

- Status: BLOCKED (2026-08-09) — BLOCKED — real, not a false positive, but unfixable inside the declared Writes set and the only honest alternative was a change far larger than the item.
- Area: ux
- Severity: medium
- Writes: `apps/mobile/app/(auth)/login.tsx`, `apps/mobile/src/features/**`
- Verify: `pnpm check:i18n-parity && pnpm --filter @agiworkforce/mobile test`
- Evidence: only the two language-picker settings screens use the working i18next/MMKV/RTL plumbing; `login.tsx:83,111,114` are literals.

## Wave 8 — Compliance, verification, growth

### 81. No load, stress or soak testing exists

- Status: REVERTED (2026-08-09) — REVERTED. The load-testing tooling was removed entirely rather than landed half-built: tools/load and .github/workflows/load.yml are gone, verified absent from disk, index and HEAD tree. A load suite that does not run is worse than none, because its presence reads as coverage. SCALE-VER-001 still wants a real one.
- Area: ci
- Severity: critical
- Writes: tools/load/ (as reported by the audit; no such file in this tree) (new), .github/workflows/load.yml (as reported by the audit; no such file in this tree) (new)
- Verify: `pnpm exec k6 run tools/load/streaming-chat.js` producing p95 TTFT, max concurrent streams, and Neon connection ceiling
- Evidence: no k6/artillery/autocannon/locust/JMeter/gatling/vegeta, no Lighthouse CI, no web-vitals, no `perf` script anywhere.

### 84. Zero funnel instrumentation and no value-first path

- Status: BLOCKED (2026-08-09) — BLOCKED — real, all four evidence claims confirmed, but it bundles two builds that cannot move independently inside one Writes set.
- Area: data
- Severity: critical
- Writes: `apps/web/app/layout.tsx`, apps/web/lib/analytics/events.ts (as reported by the audit; no such file in this tree) (new), `apps/web/app/(marketing)/**`, apps/web/app/api/chat/guest/route.ts (as reported by the audit; no such file in this tree) (new)
- Verify: `pnpm --filter @agiworkforce/web test analytics` (new: activation/conversion/retention events emitted) and an anonymous visitor can send one message without an account
- Evidence: `rg -c "gtag('event'"` across `apps/web` returns 0 files; GA is not mounted until analytics cookies are accepted (default off); no PostHog/Mixpanel/Amplitude/Segment; every acquisition CTA routes to `/login` and the auth gate returns 401 with no guest branch.

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

### 96. Developer API is unusable as documented

- Status: BLOCKED (2026-08-09) — BLOCKED — only partly reachable from its own Writes set, and the true blocker is worse than the item states.
- Area: correctness
- Severity: high
- Writes: `apps/web/public/openapi.json`, `apps/web/app/api/llm/v1/**`, `docs/api/rate-limits.md` (new)
- Verify: `curl -s https://api.agiworkforce.com/v1/models -H "Authorization: Bearer $KEY"` returns 200
- Evidence: the advertised host 307s to the apex and lands on 404 (see #62); only `https://agiworkforce.com/api/llm/v1/chat/completions` works; no SDK, no webhooks, no Files or Conversations API, 3 scopes, no published rate-limit table.
- ⚠ Serial with #62.

## Write collisions — these pairs must run serially

| File                                                                   | Items             | Order                               |
| ---------------------------------------------------------------------- | ----------------- | ----------------------------------- |
| `.github/workflows/ci.yml`                                             | #3, #5            | #3 then #5                          |
| `apps/web/next.config.ts`                                              | #1, #62           | #1 then #62                         |
| `vercel.json`                                                          | #28, #62, #82     | #28 → #62 → #82                     |
| `apps/web/lib/cost-tracker.ts`                                         | #33 only (merged) | —                                   |
| `packages/contracts/types/src/billing-catalog.ts`                      | #28, #29          | #28 then #29                        |
| `apps/web/.env.example`                                                | #23, #24          | #23 then #24                        |
| `apps/web/app/api/stripe-webhook/lib/*`                                | #25, #26          | #25 then #26                        |
| `apps/web/lib/server/account-erasure.ts`                               | #30, #87          | #30 then #87                        |
| `apps/web/app/api/uploads/presign/route.ts`                            | #19, #89          | #19 then #89                        |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`    | #56, #67, #93     | #67 → #56 → #93                     |
| `apps/extension/src/background.ts` + `background/policy.ts`            | #8, #9, #76       | #8 → #9 → #76                       |
| `apps/extension/src/side_panel.ts`                                     | #49, #50, #76     | #50 → #49 → #76                     |
| `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`                | #14, #46          | #14 then #46                        |
| `apps/desktop/src-tauri/.../image_gen.rs`, `perplexity.rs`, `voice.rs` | #54, #55, #61     | #54 → #55 → #61                     |
| `apps/desktop/src/stores/settingsStore.ts`                             | #56, #59          | #59 then #56                        |
| `apps/desktop/src/utils/ipc.ts`                                        | #45, #57          | #45 then #57                        |
| `apps/desktop/src/api/embeddings.ts`                                   | #50, #57          | #50 then #57                        |
| `apps/cli/src/voice.rs`                                                | #55, #61          | #55 then #61                        |
| `apps/web/scripts/test-llm-keys.ts`                                    | #55, #61          | #55 then #61                        |
| `packages/ui/**`                                                       | #72, #98, #99     | #72 first, then #98/#99 in parallel |
| desktop feature dirs (`roi-dashboard`, `dynamic-canvas`, …)            | #41, #66          | decide #66 (route-or-delete) first  |

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

## Mobile media generation — 2026-08-13 session

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
- **TODO: wire `apps/web/lib/server/data-retention-tiers.ts` to a consumer.**
  The DPDP retention registry and its `ERASURE_FAN_OUT_STORES` derivation are
  written and tested, but nothing in production imports them — the module is
  declared unreachable debt in `scripts/config/surface-reachability-allowlist.json`.
  Two candidate consumers: `apps/web/lib/server/account-erasure.ts`, which
  carries its own hand-maintained store map that this registry should become
  the source for, and the privacy page's section 05 retention table, which is
  hand-written prose. Neither is a mechanical edit — erasure correctness and
  legal copy are both at stake — so it did not land with the 2026-08-17 sweep.

### Web composer — 2026-08-13 (founder-reported)

- **TODO: no way to stop a video generation on Mobile.** Web is wired:
  `VideoGenerationPlaceholder.tsx` posts the task id to
  `/api/media/video/cancel` and renders the route's own `requested`/`unconfirmed`
  reply. Mobile still has no control, so a 1-2 minute generation is
  uninterruptible there.

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
- `TODO` Web `@` mentions now cover Skills and Projects through one shared
  trigger rule (`matchMentionQuery` in `@agiworkforce/unified-chat`, used by the
  web composer and the shared `ChatInput`). File mentions are still unbuilt on
  web: `FileMentionPicker` needs an `onSearch` source, and no web send contract
  carries a per-file reference — `POST /api/chat/conversations/[id]/messages`
  never reads `project_knowledge_files`. Shipping an `@file` row before that
  contract exists would render a picker whose selection the server ignores.

### Skill execution parity with claude.ai — 2026-08-20

Founder decision (2026-08-20): skill execution should match claude.ai, where a
skill drives a real workspace rather than only injecting prose. Observed live on
claude.ai with `/web-artifacts-builder`: the skill read `App.tsx`, inspected the
CSS, cleared `App.css`, hit a Parcel bundling failure, applied `Edited
index.html +1 -1`, and retried the bundle. That observe → edit → retry loop is
the target behaviour.

DONE — the sandbox can now be observed and edited, not just written to.
`lib/e2b/execution-tools.ts` gained `list_files`, `read_file`, and `edit_file`
alongside the existing `execute_code` / `write_file` / `create_folder`. They
route to `E2BExecutor.listFiles` / `readFileBytes`, which already existed for
file harvesting and were never exposed to a model. `edit_file` is an exact
substring replacement that refuses a missing or ambiguous anchor rather than
editing the wrong line, and reports `Edited <path>  +N -M`. Declared in
`tool-metadata.ts` (`read_file`/`list_files` read, `edit_file` write, so the
mutating-tools-serialize guarantee holds) and narrated in `tool-loop.ts` as
Listing/Reading/Editing file under the `filesystem` category.

TODO — skills still cannot ship executable content:

- A skill is a single `SKILL.md`. `packages/tools/skills/src/loader.ts` reads
  one file per directory; there is no bundle format carrying `scripts/`,
  `references/`, or `assets/`, so nothing a skill author writes can be run.
- Nothing materializes a skill's files into the E2B workspace on load, so even
  a bundled script would not be on disk for `execute_code` to invoke.
- `skills-lock.json` hashes a directory tree already, so bundle integrity is
  covered, but `skillspector` vetting has never run on this machine and is
  unproven for any skill carrying scripts.

TODO — user-authored skills (blocks "create and add skills"):

- No `user_skills` table, no writable catalog layer, and the skills API is
  GET-only (`app/api/skills/**`). `skill-creator` therefore drafts a SKILL.md
  into the chat with nowhere to save it, and `/settings/skills/new` is a
  redirect stub.
- Web has no `Add` menu; claude.ai offers Create with Claude / Write skill
  instructions / Upload a skill, and lists user skills with Author = "You".

BLOCKED_BY_HUMAN — local `DATABASE_URL` points at production Neon, so none of
the user-skill storage work above can be tested locally without a branch
database.

### Connector tool permissions panel does not group by read vs write — 2026-08-24

Follow-up to the 2026-08-20 finding that per-tool connector permissions were
unreachable from web. `ToolPermissionsPanel` is now mounted in both the
signed-in settings modal (`WebSettingsModal.tsx`, via
`renderConnectorToolPermissions` into the shared `ConnectorsPanel`'s connector
detail view) and the signed-out `ConnectorsPage.tsx`, and the dead
`/connectors/permissions` redirect page is deleted — mobile and web now reach
the same store and API.

Still open against claude.ai's connector detail: claude.ai groups
`Read-only tools (5)` / `Write/delete tools (22)` with a group-level `Always
allow` dropdown; `ToolPermissionsPanel` renders every tool in one flat list.

TODO — group `ToolRow`s in `ToolPermissionsPanel.tsx` by the `actionClass`
already declared in `tool-metadata.ts`, which is what makes the read/write
split possible. No backend work: the classification already exists, only the
panel's rendering needs to change.

### Operator dashboard — goodwill levers — 2026-08-20

Founder decision (2026-08-20): manual refresh only; bonus credit tracked apart
from paid so revenue reporting stays clean.

Reference behaviour, researched rather than assumed: Claude's short-window limit
is a ROLLING 5-hour window that starts on the user's first prompt, not a fixed
wall-clock boundary, with a separate weekly cap that resets at a fixed
per-account time. Reset times are therefore per-user, which is why the operator
view needs the account's timezone to state them correctly.

DONE:

- `0132_operator_bonus_credits.sql` — `token_credits.bonus_granted_cents` plus
  an index on `credit_transactions (transaction_type, created_at desc)`, which
  the ledger-by-type reads need.
- `previewBulkUsageReset()` / `resetAllUsersUsage()` in
  `features/admin/services/operator-metrics.ts`. Preview reports the blast
  radius; execute clears only consumption, never allocation, and writes one
  `reset` ledger row PER affected account so the change stays attributable per
  user instead of as one opaque bulk mutation.
- `grantBonusCredits()` — raises `credits_allocated_cents` so the existing
  consumption path spends it with no fork, mirrors the amount into
  `bonus_granted_cents`, and writes a `bonus` ledger row carrying the operator
  and the stated reason.
- `POST /api/operator` actions `preview-reset-all`, `reset-all-usage`,
  `grant-credits`, behind the existing platform-admin gate and CSRF. The bulk
  reset requires the typed phrase `RESET ALL USAGE`; a single grant is capped at
  $500 and requires a reason. Bulk reset logs a `critical` security event.
- 9 tests in `app/api/operator/__tests__/route.actions.test.ts`, exercising the
  REAL platform-admin gate (env var set) rather than stubbing it.

TODO — dashboard surface, not yet built:

- Stripe panel (MRR, churn, trial conversion, failed payments) — needs a
  restricted Stripe key.
- Vercel panel (deploys, runtime errors, p95) — read access exists via MCP.
- Retention cohorts (weekly signup cohort vs return rate) over `profiles` and
  usage; nothing aggregates this today.
- Region + timezone: `profiles` carries no location or IANA timezone, so the UI
  cannot yet say "your 5-hour window resets at 3:00 PM your time", and there is
  no by-region breakdown. Capturing timezone at signup is the prerequisite.
- Gross margin per account (provider COGS vs revenue) from the existing cost
  ledger — the number no third-party dashboard can show, because it needs the
  join across Stripe and provider spend.

NOTE — `grantBonusCredits` deliberately does NOT implement a separate
spent-first balance. The consumption path is not centralised in one place, so
forking it was out of scope for this change; bonus is additive headroom that the
existing deduction spends normally, and remains separable in reporting via the
`bonus` ledger rows and `bonus_granted_cents`. A true spend-bonus-before-paid
ordering needs the deduction site located first.

### Operator dashboard — controls wired — 2026-08-20

DONE:

- `OperatorDashboardPage` now renders both goodwill levers. Per-user rows carry
  `Reset usage` and `Grant credit`; a separated, destructive-styled block above
  the tabs carries `Reset all usage`, which previews the blast radius, requires
  the typed phrase, and only then commits.
- BUG FIXED: the existing per-user reset button posted to `/api/operator`
  without a CSRF header, and `requireCsrfToken` accepts only a valid Bearer or
  `x-csrf-token` — so the button 403'd. All operator mutations now go through a
  single `operatorAction()` helper that applies `addCsrfHeaders`.

Verified: 51/51 across features/admin and app/api/operator, typecheck and lint
clean.

### Teams self-serve and Enterprise — 2026-08-20

Audited against ChatGPT/Claude before changing anything. Most of Teams was
already built: `team` tier at $25/mo / $240/yr / ₹1999 with `perSeat: true`,
`MIN_PURCHASABLE_SEATS = 2` enforced in the checkout zod schema, a seat selector
with live unit price and total on /pricing, an Individual vs "Team & Enterprise"
audience toggle, and all three `STRIPE_PRICE_TEAM_*` ids configured. Checkout
runs card → seats → interval → confirm dialog → `upgradeToTeamPlan` → Stripe →
webhook writes the seat count.

DONE:

- Annual seat price is now expressed PER MONTH ($20/seat/mo) instead of per year
  ($240/seat/yr), matching how ChatGPT and Claude frame annual billing, so the
  cadence toggle compares like with like against $25/seat/mo. The adjacent
  cadence line still reads "billed annually", so the actual charge is not
  misstated. Applied across all 12 locales by reusing each language's OWN
  existing per-seat-per-month phrasing rather than machine-translating.
- /contact-sales claimed SSO, SCIM, audit logs, BYOK policy and retention were
  "none of those are self-serve today", directly contradicting /enterprise,
  which correctly records SSO and SCIM as Implemented. Copy now matches the
  enterprise ledger row for row and links to it.

Verified: 56/56 pricing + billing-copy tests; live browser check at 2 and 7
seats ($480 and $1,680, both $20/seat/mo); /pricing, /teams, /enterprise,
/contact-sales, /business all 200.

NOTE — Enterprise deliberately has no `STRIPE_PRICE_ENTERPRISE_*` because the
tier is `contractPriced: true`. Its absence is correct, not a gap. /enterprise
already carries a per-row capability ledger that marks each item Implemented /
Partially implemented / Not held, including "SOC 2 Type II — Not held. No report
exists, no auditor is engaged." That honesty is worth preserving against any
pressure to mirror a competitor's checkmark grid.

### shell-nav-ia-gap-01 regression, self-inflicted — 2026-08-20

A verification pass flagged that the operator dashboard gated a destructive
billing reset with raw `window.confirm()`, while every originally-cited call
site had already been migrated to the shared `useConfirm()`/AlertDialog. Two of
the three offending calls were added by THIS session's operator work, so the
gap was reopened by the same change that closed others.

DONE: per-user reset and fleet-wide reset now use `useConfirm()` with
`variant: 'destructive'`. The bulk path keeps both gates on purpose — the styled
dialog states the blast radius with real severity, and only then does the typed
`RESET ALL USAGE` phrase confirm intent.

REMAINING, deliberate: `window.prompt` still collects the typed confirmation
phrase and the grant amount/reason. Those are value entry, not destructive
gating, and ConfirmDialog takes no input. A proper form dialog for the grant
flow is the follow-up; the destructive decision itself is now correctly gated.

DONE: `SchedulesPage.tsx`'s discard-unsaved-changes prompt, the last raw
`window.confirm` on a web surface, now uses the same `AlertDialog` primitives
and destructive styling as the file's own Delete Schedule confirmation.

### Skill relevance matcher — root-cause fix — 2026-08-20

ART-CANVAS-03 ("no design skill wired into artifact generation") had a root
cause: `frontend-design-review` IS in the catalogue and executes, but no skill
auto-fires often enough to matter. Fixing the matcher wires the whole system
rather than one skill.

Measured before: 1 of 6 realistic prompts offered the right skill.
Measured after: 6 of 6, with the negative case still correctly offering none.

Three changes, each forced by a measurement:

1. `jaccardSimilarity` -> `skillCoverage`. Jaccard is symmetric, so every prompt
   word sat in the denominator and a longer, more specific request scored LOWER.
   Coverage asks the directional question — how much of the SKILL's vocabulary
   the prompt hits — and leaves prompt length alone.
2. `MIN_MATCHED_TOKENS = 2`. Coverage alone let a single shared word carry a
   match ("…for this release" pulled in a changelog skill on `release`).
3. `COVERAGE_DENOMINATOR_CAP = 12`. Uncapped coverage punished thorough
   descriptions: adding the words users actually type diluted the author's own
   score, which is the opposite of what the skill-authoring guidance asks for.
   `systematic-debugging` regressed to no-match on a richer description before
   this was capped.

Also rewrote two descriptions as triggers rather than method summaries, which
is what `.agents/skills/skill-creator/SKILL.md` step 2 prescribes —
`data-analysis` now names spreadsheet/CSV/conversion/signups/channel, and
`systematic-debugging` names broken/crashing/erroring/intermittently. Lexical
matching cannot bridge a vocabulary gap on its own; the description has to carry
the user's words.

`skills-lock.json` regenerated. 62/62 in packages/tools/skills, 543 in the web
chat pipeline.

### P1: connector permission reset revoked nothing — 2026-08-20

Found by the settings-modal parity workflow, in code this session had just made
reachable. `ToolPermissionsPanel`'s "Reset all to default" called
`resetConnectorPermissions`, which deleted only the local zustand key. The server
rows are what `tool-loop.ts` enforces, and `hydrateFromServer` (fired on every
chat load) restored the cleared verdicts visibly on the next page load. An
`always-allow` grant therefore survived a reset the user believed had revoked it.

`DELETE /api/connectors/permissions?connectorId=` already existed and already
supported whole-connector deletion when `toolName` is omitted; mobile called it,
web never did.

DONE: `resetConnectorPermissions` now fires that DELETE alongside the local
clear, matching the existing `persistPermissionToServer` shape (CSRF header,
same-origin, warn-and-continue on failure so an offline reset still clears
locally). Two tests pin it: the DELETE is issued with the right connectorId, and
a failing server call still clears locally without throwing.

Note: a cleared verdict resolves to `ask`, not "no opinion" — the safe default.
The first draft of the test asserted `undefined` and was wrong about the store's
own contract.

### P1: delete-account dialog promised a grace window that does not exist — 2026-08-20

`AccountSection.tsx` told the user "There is a 24-hour grace window before
deletion completes." Our own privacy policy says the opposite
(`app/privacy/page.tsx:956`: "there is no self-serve way to cancel a scheduled
deletion"), and the code agrees with the policy:

- `app/api/user/delete-account/route.ts:112` sets `deletion_scheduled_for`
- `app/api/cron/purge-deleted-accounts/route.ts:65-66` reads it to purge
- `app/api/auth/device/refresh/route.ts:87` hard-blocks re-auth the moment it is
  set, so the user is locked out IMMEDIATELY
- nothing anywhere nulls the column — there is no cancel path at all

So the 24 hours is a delay, not a window the user can act inside. Telling
someone an irreversible action is reversible is the worst thing this dialog can
do.

DONE: copy now states that the user is signed out immediately, that erasure runs
24 hours after confirmation, that cancellation is not self-serve, and that
support is the only route inside that window. Four tests guard it, including one
that fails if a real cancel path is ever added — at which point the copy should
be revisited in the same change rather than silently drifting true again.

STILL OPEN: a real cancel endpoint nulling the two `profiles` columns is the
better product answer. The copy fix is the P1; the endpoint is a product
decision.

### P1: usage bars failed optimistic — 2026-08-20

`normalizeUsagePercentage(undefined)` returns 0 (managed-usage-balance.ts:39-42),
and UsageSection renders `100 - used`, so an absent payload displayed as a FULL
allowance. During an outage — or simply while loading — every bucket read
"100% left". The section already rendered an error banner, so the user saw a
failure notice sitting directly above four bars promising untouched quota.

A quota meter that fails optimistic is the wrong direction to fail: the user
plans around headroom they may not have.

DONE: `UsageBar` gained an `unknown` prop; when no payload was read the value
reads "Unavailable", the detail line explains and offers retry, the progress
track renders empty rather than full, and the aria-label says "usage
unavailable" so assistive tech is not told a different story from the screen.
All four call sites gate on `usageUnknown = !usage`.

Three tests pin it: no "100% left" on error, none while loading, and the
unavailable state is exposed to assistive tech rather than being purely visual.

### BUILT_NOT_WIRED: privacy rights surface was unreachable — 2026-08-20

`/privacy/requests` ships a consent ledger (`ConsentCentre.tsx`) and a
rights-request form (`RightsRequestForm.tsx`), and nothing in Privacy settings
linked to it — it was reachable only by typing the URL. A DPDP/GDPR rights path
the data subject cannot find from their own privacy settings is not a rights
path.

DONE: a "Privacy requests" row now sits above Export data in
`PrivacySection.tsx`, matching that row's existing layout. Two tests pin it —
one that the three files still exist to link to, one that the link and label are
present — so deleting either half fails the build rather than silently
re-orphaning a compliance surface.

### BUILT_NOT_WIRED: avatar upload had no control — 2026-08-20

The whole upload path shipped and nothing could reach it. `api/uploads/presign`
accepts `kind: 'avatar'`, size- and mime-checks it, and hands back a signed PUT;
`user-preferences.ts` implements `uploadAvatar()` end to end (presign → PUT →
`PATCH /api/me`); `api/me` persists `avatar_url`; `authentication-manager` maps
it onto `user.avatar`; `ChatHeader` renders it. General settings drew initials
and carried a comment asserting "avatar upload is not implemented on any tier",
which was false when it was written and had been false for the whole path below
it.

DONE: the Profile row now renders the stored photo when there is one and the
initials tile when there is not, with Upload/Change, Remove, the accepted
formats, the size cap, and an error line. `MAX_AVATAR_BYTES` moved into
`@agiworkforce/types` and the presign route imports it, so the picker cannot
accept a file the server will reject; `UserProfile.avatar_url` widened to
`string | null` so Remove has a value to send.

Five tests pin it: the picked file reaches `uploadAvatar`, an oversized image is
refused before the network, a type the presign route would reject is refused and
is absent from `accept`, a failed upload surfaces instead of silently
"succeeding", and an existing photo renders and can be removed.

### BUILT_NOT_WIRED: linked devices could only be revoked by nuking the account — 2026-08-20

`desktop_devices` and `mobile_devices` were written on registration, read by the
data export and by control-plane status, and shown nowhere. `device_refresh_tokens`
— the credential that actually holds a desktop or mobile session open — carried
`user_id` and `family_id` and nothing identifying the device, so "sign this laptop
out" and "sign every device out" were the same query. The only control the user
had was Log out of all devices.

Active sessions was already fully wired with per-row revoke, but it lists Clerk
browser sessions only; a linked desktop app never appeared in it.

DONE, three parts:

- `0133_device_refresh_token_device_link.sql` adds `device_id`/`device_name` to
  the token family. The issuing route already held both from the authorization
  code and now records them, and the refresh route carries them across rotation
  — without that a family goes anonymous on its first refresh and per-device
  revoke silently revokes nothing. Reversal shipped.
- `GET /api/settings/devices` lists desktop and mobile registrations for the
  caller with a `hasLiveCredential` flag computed from unspent, unrevoked,
  unexpired token rows, because a registration outlives its credential and
  "linked" is not the same question as "still signed in".
  `DELETE /api/settings/devices/[deviceId]` revokes by family (not by
  `device_id`, so pre-0133 rows in the same family are caught too), deletes the
  registration, and writes an audit event.
- `LinkedDevicesPanel` renders it above Active sessions in Account settings,
  with per-row Unlink, an honest empty state, a retry on load failure, and a row
  that stays put when the unlink fails.

Ten tests pin it: the list is caller-scoped and leaks no `token_hash` or
`push_token`, a non-UUID id never reaches the database, another user's device
404s, the revoke targets `family_id`, the device link survives issuance and
rotation, and the panel's four states each render.

NOTE FOR FOUNDER: `pnpm db:migrate` has not been run for 0131, 0132 or 0133 —
migrations are applied by hand and DATABASE_URL points at production, so I did
not run them. Devices list empty and unlink reports zero revoked credentials
until 0133 is applied.

### BUILT_NOT_WIRED: General settings collected personalization the model never saw — 2026-08-20

`GeneralSection` asks "What should AGI call you?" and "What best describes your
work?". Both answers were stored in the `general` namespace, normalized by
`readUserIdentity` (`preferredName`, `workDescription`), and returned by
`/api/me` — where the only consumer was `GeneralSection` re-reading its own
defaults. `buildCustomInstructionsPreamble` sent `instructions` and nothing
else, so a user who filled in a preferred name was then addressed by something
else on the next turn. The form did not just fail to work; it made a promise the
label states outright.

DONE: `formatPersonalizationBlock` builds a `<user_profile>` block from the
preferred name and work description alongside the existing `<user_instructions>`
block, and `buildCustomInstructionsPreamble` now reads the namespace once and
sends all three. `formatCustomInstructionsBlock` is kept as an
instructions-only wrapper so existing callers are unchanged. Both blocks stay
inside the same "user preference, not system authority" framing — a preferred
name is user-controlled text reaching the system prompt, so it must not read as
an instruction channel.

Seven tests pin it, including that whitespace-only answers send nothing rather
than empty tags, and that the anti-injection framing survives.

### DPDP: beta applications were outside the erasure inventory — 2026-08-20

`lib/server/account-erasure.test.ts` failed the moment 0131 landed:
`beta_applications` was neither deleted nor anonymized, so an erased account left
its applicant name and email in the intake table. The guard caught it; the table
was mine, from earlier this session.

DONE: classified as a deleted user-scoped table, plus a dedicated sweep keyed on
the account email. Applying does not require an account, so most rows carry a
null `user_id` and the generic `where user_id = $1` delete cannot see them —
email is the only identity most applications have.

Two tests pin it: the table is classified, and erasure issues both the
user_id delete and the `lower(email)` sweep resolved through `profiles`.

### Typecheck debt from this session cleared — 2026-08-20

Three `error TS` in test files written earlier today: a `listFiles` mock missing
`name`/`isDir` from `SandboxFileEntry`, and two tuple-index errors on
`fetchMock.mock.calls`. Repo typecheck is clean.

### BUILT_NOT_WIRED: SuccessState was never mounted — 2026-08-20

`pnpm check:surface-reachability` failed on
`apps/web/shared/components/SuccessState.tsx`: built earlier today alongside the
403/maintenance/offline/session-expired pages and imported by nothing.

Its host is `/auth/device`. Approving a device linked it to the account and then
changed almost nothing on screen: a one-line `info` message appeared beside a
form that stayed fully live, code still in the field, Approve still enabled. A
second press on a now-consumed code returns an error for an action that
succeeded. For a screen-reader user the page barely moved.

DONE: a successful approval now replaces the form with `SuccessState` —
"Device connected.", what happens next, that the tab can be closed, and a
"Manage linked devices" action into Account settings, which is where the Linked
devices table from this session lives. `role="status"` announces it politely
instead of a toast that is gone before it is read.

Three new keys across all twelve locales, each translated rather than copied
from English; `check:i18n-parity` passes.

The existing approval test now asserts the settled outcome, that the Approve
button is gone, and that the action routes to Account settings.

### PARTIAL closed: pending migrations now degrade honestly — 2026-08-20

The three unapplied migrations left surfaces that failed rather than adapted,
and I had described their impact wrongly. Corrected by reading the code:

- **The operator dashboard 500'd entirely** when `beta_applications` was absent —
  `readOperatorOverview` queried it unconditionally, so one pending migration
  took down every unrelated panel. Now caught on `42P01` only, returning an
  empty beta panel. A real database failure still propagates.
- **Linked devices** 500'd on the missing `device_refresh_tokens.device_id`.
  Now falls back to listing registrations with `hasLiveCredential: null`, and
  the column reads "Unknown" rather than "No" — claiming "not signed in" is a
  statement the deployment cannot support. Unlink unregisters and reports
  `credentialsRevoked: false`; it does NOT fall back to revoking every family on
  the account, which would sign out the user's other devices to unlink one.
- **`/beta` errors on submit** was wrong. There is no `/beta` page and no write
  API for `beta_applications` — the table has a reviewer workflow and no intake
  path. `FoundersAssistance.md` corrected.

Four tests pin the degradation, each paired with one asserting an unrelated
database error is NOT swallowed as a pending migration.

### BUILT_NOT_WIRED closed: beta_applications now has an intake path — 2026-08-20

0131 created the table, `readOperatorOverview` grouped it by status, and
`account-erasure` erased it. Nothing wrote to it — no route, no handler, no
form. The reviewer columns described a workflow with no way to enter it, and the
dashboard card counted a number that could only ever be zero.

Considered withdrawing 0131 instead, because CLAUDE.md records that the
managed-cloud private-beta gate was removed by founder decision on 2026-06-27.
Kept it: the schema's `surfaces[]` column exists so a reviewer can balance the
cohort across desktop/mobile/CLI, which is tester recruitment for pre-release
builds, not an access gate on managed cloud. The page says so in as many words
so the two are not confused.

DONE: `/beta` with a real form, `POST /api/beta/apply`, and
`lib/server/beta-applications.ts`. The write upserts on `lower(email)` so a
resubmission updates one row instead of leaving duplicates for a reviewer to
reconcile, and deliberately does not touch `status` — a returning applicant
cannot reset their own rejection to pending, and is told the earlier decision
stands. Surfaces are a closed enum, deduplicated, and at least one is required.
CSRF and a fail-closed 5-per-10-minute limiter guard it, because it is an
unauthenticated write to a table.

Nine tests pin it, including that CSRF and rate limiting both run before the
database is touched, and that the upsert never rewrites `status`.

### WEB-NO-CANCEL-PLAN-PATH-01 closed without needing the dashboard answer — 2026-08-20

The blocker was "is cancellation enabled in the Stripe Customer Portal?", which
is a Dashboard setting the API cannot read. `/api/portal` created every session
with no `configuration` and no `flow_data`, so it landed on the portal home page
and Billing settings had no cancel control at all — claude.ai has a Cancellation
section with a Cancel plan button.

The question turned out not to need answering. Attempting the deep-link IS the
read: Stripe rejects `flow_data.subscription_cancel` with an
invalid_request_error when the configuration has cancellation off.

DONE: `POST /api/portal` accepts `flow: 'cancel'` and asks for
`subscription_cancel` scoped to the stored `stripe_subscription_id`. Billing
settings gains a "Cancel plan" button beside Manage billing, shown only for a
Stripe-billed active or trialing subscription — a store-billed row is cancelled
with Apple or Google and the button would be dead there. If Stripe refuses, the
route answers 409 `cancellation_unavailable` naming the two routes that still
work rather than a generic failure.

Four tests pin it, including that no flow_data is sent when none was asked for,
and that an unrelated Stripe outage is not reported as a disabled portal.

### PARTIAL closed: /beta refuses honestly when its table is absent — 2026-08-20

The intake form was the last surface that would have failed rather than degraded
while 0131 is unapplied. Claiming "Application received" when nothing was stored
is the worst of the three options — the applicant waits for a reply that can
never come.

DONE: `42P01` becomes a 503 `intake_unavailable` saying plainly that nothing was
stored and nothing about them was saved. Any other database error still
propagates; two tests pin both halves.

### Migrations 0131–0133 verified end to end on a throwaway database — 2026-08-21

Docker came up, so the three pending migrations were proven rather than argued
about. A disposable postgres:16 container, the full chain applied from zero, then
the real SQL each feature runs, then the reversals, then a re-apply. Container
destroyed afterwards. Production was never touched.

- **Full chain**: 133 applied, 0 pending, 0 drift, from an empty database.
- **0131 upsert**: `Ada@Example.com` after `ada@example.com` left ONE row, with
  details updated and `status` still `rejected` — a returning applicant cannot
  reset their own rejection, which is the behaviour the route's test asserts and
  now the behaviour the schema actually produces.
- **0133 devices query**: the `live` CTE returned `live: 1` for a registered
  laptop holding one unexpired credential, and the family-scoped revoke marked
  exactly that one row revoked.
- **0132 grant**: `credits_allocated_cents` and `bonus_granted_cents` both moved
  to 1000 through the real statement from `grantBonusCredits`.
- **All three indexes** present: `idx_beta_applications_email`,
  `idx_credit_transactions_type_created`, `idx_device_refresh_tokens_device`.
- **All three reversals ran clean** and retracted their ledger rows — status
  went back to 130 applied / 3 pending / 0 drift — then re-applied cleanly.

The forward path, the reversal, and the queries built on top are all evidenced.
What remains is authorization to run this against production, not uncertainty
about whether it works.

### UI/UX gap vs claude.ai closed: no in-app Motion control — 2026-08-21

Audited our settings against the live claude.ai capture. Most apparent gaps were
false: settings search exists (`matchesNavEntry`, with keyword aliases, so it
beats matching the visible label), and the eleven `prefers-reduced-motion` blocks
in `globals.css` already answer the OS setting.

The real gap was the in-app override. claude.ai has a Motion radio (System /
Reduced) under Appearance — "Reduce animation in streaming responses and other
interface elements". We had no way to calm the interface without changing the
whole machine, which matters most for streaming responses, the one surface that
animates continuously.

DONE: `motion` on the settings store, `data-motion="reduced"` stamped by
`AppearancePreferences` beside the existing contrast and accent attributes, a
Motion row in General beside High contrast, and one blanket stylesheet rule
rather than eleven duplicated blocks — so a newly added animation cannot escape
the toggle, which is exactly how a motion switch becomes decorative.

There is deliberately no "full motion" option. Overriding someone whose OS asked
for reduced motion is the one direction that harms; System hands control back
rather than asserting over it.

Six tests pin it: the attribute appears and disappears with the preference, the
stylesheet answers the attribute (including `scroll-behavior` — a smooth-scrolled
jump is motion too), no option forces motion on, and the control is exposed to
assistive technology with both states.

### Migrations verified on a Neon branch off live production — 2026-08-21

`neonctl` was available and authenticated all along. Following the project's own
`backup-pre-<migration>-<date>` convention visible in the branch list:

- `backup-pre-0131-20260821` — a point-in-time copy of production, deliberately
  NOT migrated. This is the rollback point.
- `verify-0131-0133-20260821` — a second branch off production where the three
  migrations were actually applied: **133 applied, 0 pending, 0 drift**, against
  real production data rather than an empty schema.

Verified on that branch with the real statements each feature runs: the operator
panel's `group by status`, the Linked-devices `live` CTE, and reads of
`bonus_granted_cents`, `device_id`, `device_name`. All three indexes present.
Production currently holds 0 desktop and 0 mobile devices and 0 refresh tokens,
so Linked devices will legitimately show its empty state; 10 `token_credits`
accounts exist for the grant path.

### Drift I introduced, caught and reverted — 2026-08-21

The branch reported `1 drift: 0042_settings_cloud_sync.sql checksum differs`.
Mine: earlier in this session I rewrote a false comment in that file, which is an
ALREADY-APPLIED migration. The ledger treats applied files as immutable, and a
standing drift alarm is worse than the comment was — it is the signal that would
otherwise mean tampering, and a permanently-red one gets ignored.

Reverted; drift back to 0. Nothing was lost: the finding already lives in
`known-flaws.md` as WEB-USER-SETTINGS-NO-RLS-01, which is where durable defects
belong. Documentation does not go in applied migrations.

### WEB-USER-SETTINGS-NO-RLS-01 confirmed against the real database — 2026-08-21

known-flaws listed it "Open — needs a branch database". There is one now:
`user_settings` has `relrowsecurity = false` and zero rows in `pg_policies`,
while `profiles` and `web_conversations` both have RLS on. The flaw is real, not
inferred from migration text. Entry updated with the evidence.

### WEB-USER-SETTINGS-NO-RLS-01 fixed and proven on a branch — 2026-08-21

`user_settings` was the one table holding user-scoped data that 0037 skipped:
`relrowsecurity` false, zero `pg_policies` rows, isolation resting entirely on
`where user_id = $1` in the preferences route.

DONE, both halves, because either alone is theatre:

- `0134_user_settings_rls.sql` enables RLS and adds a FORCE'd
  `user_settings_user_isolation` policy matching 0037's shape. Reversal shipped,
  stating what turning it back off costs.
- `app/api/settings/preferences/route.ts` moved from `getNeonDb()` to
  `getUserScopedDb()`. This was the half that mattered: the Neon owner role the
  app connects as HAS BYPASSRLS, verified on the branch — the owner still saw
  both test rows through a FORCE'd policy. A policy with the route left on the
  bypass client is decorative.

PROVEN on the branch, not asserted: with `set local role app_rls` and
`request.jwt.claim.sub` set to one test user, a select over both rows returned
only that user's, and an UPDATE aimed at the other user's row matched 0 rows.
Test rows removed afterwards.

The `where user_id = $1` predicate stays as the first line of defence; the policy
is the second, for the day someone forgets it.

Five tests pin the route and the migration shape. `check:db-isolation` is
unchanged at 5 pre-existing failures, all in `cloud-code-agent-service.ts` and
none from this work — measured before and after.

### UI/UX gap vs claude.ai and ChatGPT: no per-message rating — 2026-08-21

Audited the chat surface rather than settings this pass. Most affordances are
present and better than I first measured — a malformed grep reported zero for
retry, edit, branch and stop-generating, all of which exist. Re-ran properly
before reporting: regenerate, edit, branch/fork, delete, copy, report, and a
per-turn token breakdown are all there.

The real gap: **thumbs up / thumbs down on an assistant answer.** claude.ai and
ChatGPT both put a verdict on every message. This app collected it nowhere — the
only routes out were a composer-level dialog and a safety-refusal appeal, and
neither says an ordinary answer was good or bad. For a product whose operator
dashboard counts feedback rows, the highest-frequency quality signal was the one
never collected.

DONE, and with no migration: `/api/feedback` already accepted `message_id` and
`conversation_id`, so `feedback_context` gained `'response_rating'` and a
`rating` enum. Ratings land in `public.feedback` and roll straight into the
operator dashboard's existing counts.

The validator refuses a rating with no `message_id` and a rating that does not
say which way it went — an unattributable vote inflates a total nobody can trace
to an answer, which is worse than not collecting it.

Nine tests: six on the control, three on the validator. They pin that a user's
own message offers no rating, that the verdict is attributed to the message,
that state is exposed via `aria-pressed` rather than colour alone, that a failed
POST does NOT leave the button lit claiming a vote the server never took, and
that a second click cannot double-vote.

### CAP-040 wired: an expired session no longer eats the message — 2026-08-21

Found via `audit/capability-gaps.csv`, the repo's own tracker, which classes 30
open gaps in the goal's exact vocabulary (`implemented-unwired`,
`partial-unwired`). CAP-040 was `implemented-unwired`, Small, Phase 1.

The composer clears on send. `onSend` can return `false` to veto that, but it is
called synchronously, so a 401 arriving later cannot use it. The result: your
session expires mid-turn, the answer comes back as an error, and the text you
wrote survives only as a failed turn in the transcript. Sign back in and retype
it. This is the concrete cost of the session timeouts the founder reported.

DONE: `sendMessage`'s catch parks the typed content as that conversation's draft
on a 401, so the composer repopulates with exactly what was written. Two
deliberate limits — only 401 (a 403 is a permission answer and a 429 a quota
answer; neither means "sign in and try again"), and an existing draft always
wins, because anything typed since is newer.

Five tests, four pinning the guard and one pinning the store contract it depends
on — `setDraftContent(content, conversationId)` round-tripping through
`draftsByConversation`. Without that last one the others still pass a source
grep while the fix silently parks nothing.

### Chat/composer audit found no other gap vs claude.ai or ChatGPT

StyleSelector, VoiceInputButton, SlashCommandMenu, attachments, web search,
projects and temporary chat all exist in the composer. Usage already stamps
"Last updated" with a manual Refresh, matching claude.ai. Spend limit and
auto-reload have no backend at all, so they are a new feature rather than an
unwired one, and out of scope for this goal.

### CAP-020 wired: the Settings effort picker stopped promising what the server discards — 2026-08-21

Two pickers set the same reasoning-effort preference. The composer's has always
split levels by entitlement (`ComposerFooter.tsx:730`, via
`splitEffortsByEntitlement`). The Settings one offered all five unconditionally.

The server has always clamped: `resolveRequestEffort` calls
`clampEffortToEntitlement`, so on a tier without manual model selection anything
above the model's default effort silently becomes the default. Settings kept
displaying "Max". A control that reports a setting the backend discards is the
same class of defect as the connector toggle and the usage bar from earlier in
this session.

DONE: the Settings picker now calls the same `splitEffortsByEntitlement` the
composer does. Gated levels stay VISIBLE and disabled, labelled "not on your
plan" — hiding them would read as "the product does not support this", which is
a different and wrong message. While billing is still loading the tier is
unknown, so every level stays enabled: guessing would either gate a paying
customer or promise a level the server will clamp.

Five tests, including that a gated level is disabled but still rendered, that an
included level stays selectable, and that nothing is gated before the tier is
known.

Also repaired `audit/capability-gaps.csv`: my first edit appended a comma-bearing
sentence to an unquoted field and split the row into 11 columns. The tracker's
own validator caught it. Rewritten through a real CSV writer.

### Three stale known-flaws records corrected — 2026-08-21

Two High-severity entries claimed defects that no longer exist. A permanently
wrong flaw register is worse than a short one: it sends the next reader to fix
something already fixed, and it hides the entries that are still real.

- **BILLING-TIER-SPEND-CAPS-UNREAD-01** claimed `videoSecondsPerMonth`,
  `computerUseSoftCap`, `computerUseHardCap` and `voiceMinutesPerMonth` had
  "zero readers outside tests". They all have readers now:
  `tier-unit-quota-service.ts:30-36` reads all four, `assertTierUnitAllowance`
  is called from the transcriptions route, `api/media/video/generate` and the
  chat completions request-processor, and `capability-handshake-service.ts`
  surfaces the limits to clients. Marked FIXED with those citations.
- **BILLING-FREE-TIER-VOICE-UNCAPPED-01** claimed Free had `allowVoice: true`
  with no cap, i.e. unlimited transcription. `model-catalog.ts:831` now sets
  `voiceMinutesPerMonth: 30`, and the enforcement point above is real. Marked
  FIXED.
- **WEB-NO-CANCEL-PLAN-PATH-01** was still Open despite being closed earlier
  today. Updated with what shipped.

Verified each by reading the cited code rather than trusting either the record
or my own memory of fixing one of them.

### Project knowledge capacity was invisible until it refused you — 2026-08-21

Chased CAP-041 (`@` mentions offer skills and projects but not files, where
claude.ai offers all three) and found the premise wrong: project knowledge files
already reach the model automatically via `loadProjectContext`, so an `@file`
mention would be a new focusing feature, not a wiring fix. Left it alone.

Two further hypotheses were also wrong and worth recording so they are not
re-investigated: files are NOT silently dropped by count — the upload route
refuses at `activeCount >= MAX_KNOWLEDGE_FILES`, matching the context query's own
`limit`, so stored-but-never-read cannot happen. And the model IS told about
truncation: `formatProjectSystemPrompt` emits `omittedFileNames`,
`unextractedFileNames` and per-file `excerptOf` so the assistant says a file was
truncated rather than treating the missing part as absent.

The real gap was smaller: the panel read "N files" and never named the cap, so
the only way to learn a project was full was to upload a 21st file and be
refused.

DONE: the header reads "N of 20 files", and at the cap says "full — remove one
to add another". `MAX_PROJECT_KNOWLEDGE_FILES` moved into `@agiworkforce/types`
and both the upload route and `project-context-service` now derive from it, so
the number on screen cannot drift from the number enforced.

Deliberately NOT shown: a character-budget percentage. `MAX_TOTAL_FILE_CONTENT_CHARS`
(48k) can omit files under the count cap, but `ProjectKnowledgeFile` carries
`byteCount`, not extracted-text length, and file bytes are not a sound proxy for
extracted characters. Showing a percentage from the wrong number would be a
confident lie; recorded here instead.

Four tests, including one asserting the panel reads the cap from the shared
contract rather than a local literal.

### Migrations 0131–0134 applied to production — 2026-08-21

Authorized by the founder. `backup-pre-0131-20260821`, a branch taken from
production before any of this, remains untouched as the rollback point.

Pre-flight: `status` read 130 applied, 4 pending, 0 drift — exactly what the
verify branch predicted, so nothing had diverged since.

    applied 0131_beta_applications.sql                 (443ms)
    applied 0132_operator_bonus_credits.sql            (450ms)
    applied 0133_device_refresh_token_device_link.sql  (355ms)
    applied 0134_user_settings_rls.sql                 (372ms)
    134 applied, 0 pending, 0 drift

Verified against production, with the real statements each feature runs:

- 0131: the operator panel's `group by status` returns cleanly (empty because
  no applications exist yet, which is a state and not an error).
- 0132: `bonus_granted_cents` readable across 10 `token_credits` accounts.
- 0133: the Linked-devices `live` CTE runs; production holds no desktop or
  mobile registrations yet, so the panel shows its empty state.
- 0134: `relrowsecurity` and `relforcerowsecurity` both true, policy
  `user_settings_user_isolation` present.

0134 was the one that could lock real users out of their own settings, so it was
checked against real data rather than a fixture: with `set local role app_rls`
and `request.jwt.claim.sub` set to an actual production user, that user saw
exactly 1 row — their own — and 0 rows belonging to anyone else, out of 3 rows
visible to the owner connection. Settings still load; isolation is real.

`pnpm db:migrate verify` clean. The four surfaces are live rather than
code-complete-and-waiting.

### Post-migration audit of 0134 on production — 2026-08-21

A FORCE'd RLS policy can break every reader that is not the owner connection, so
after applying it I traced all ten `user_settings` consumers rather than assuming
the two I changed were the only ones.

Seven read through `getNeonDb()` or an injected db that resolves to it — the
Neon owner role carries BYPASSRLS, so the policy does not apply and they are
unaffected. Two go through `getUserScopedDb()`: the preferences route I moved,
and `app/api/settings/sync/route.ts`, which was ALREADY scoped before this
change. The adapter binds the claim correctly — `neon.ts:246-249` issues
`BEGIN; SET LOCAL ROLE app_rls` then `set_config('request.jwt.claim.sub', …)` —
so the policy sees a subject on every scoped query.

Verified on production inside a rolled-back transaction, because a policy that
only permits SELECT would let existing users read settings while silently
preventing any new user from ever saving one:

    own INSERT          OK
    own UPDATE          OK
    cross-user INSERT   BLOCKED
    rows left after rollback  0

Together with the earlier read check against a real production user (1 own row
visible, 0 belonging to anyone else), all four verbs the settings routes use are
confirmed under the live policy.

### CAP-027 built: project-scoped memory — 2026-08-21

Memory was one per-user pool: every fact learned anywhere was injected
everywhere. A user with a client project and a personal project got the client's
facts in their personal chats, with no way to separate them. Separation is what
a project is for.

`ProjectSettingsDialog` already carried a note about a decorative memory
`<select>` — one option, no onChange, no persistence — removed with the
instruction to "re-add a control only when memories can actually be scoped to a
project". This closes that loop.

`0135_project_scoped_memory.sql`: `user_memories.project_id` (null = global, so
every existing row keeps working) and `user_projects.uses_global_memory`
(default true, so every existing project keeps working). The old
`idx_user_memories_user_id` is replaced by one carrying project_id alongside the
columns the live query already orders on. Reversal shipped, stating that undoing
it turns confined memories back into global ones.

All three layers, because any one alone is theatre:

- **Read** — `loadManagedMemoryContext` takes a scope. Outside a project only
  `project_id is null` rows are visible; inside, the project's rows plus global
  unless the project opted out. `loadProjectMemoryScope` falls back to
  global-only when a project cannot be read, never to the project's rows.
- **Write** — `persistManagedAutoMemoryFacts` tags the fact with the
  conversation's project. Dedup is per scope (`project_id is not distinct
from`), and the deterministic id includes the project, or the same sentence
  learned globally would permanently block it being recorded in a project.
- **UI** — a real per-project toggle, wired through the update contract, the
  PATCH route, `mapProjectRow` and the `Project` type.

Verified on a branch off production, not asserted: with a project memory and a
global memory both stored, a loose chat saw ONLY the global fact, project+global
saw both, and project-only saw only the project's. The leak the feature exists
to prevent does not happen.

Twelve unit tests cover the scope predicates, the fallback, and the write
tagging.

MIGRATION 0135 IS PENDING PRODUCTION. Until it applies the feature is inert —
`uses_global_memory` and `project_id` do not exist, so the toggle cannot persist.

### CAP-027 follow-through: project memories are labelled in the memory manager — 2026-08-21

Adding project scope created a gap in the surface that lists memories:
`/api/memory` returned a flat list with no attribution, so after 0135 a fact
confined to one project sat in the same undifferentiated list as a global one.
A confined fact that looks global is worse than no scoping — the user reads it
as applying everywhere and cannot tell why deleting it changes only one project.

DONE: the list route left-joins `user_projects` and returns `projectId` /
`projectName`; `ServerMemoryRow` and `MemoryFact` carry them through the store's
three merge branches; `MemoryEditor` renders an "Only in <project>" badge.
Global facts stay unlabelled — the absence of a badge is the signal. When the
project name cannot be resolved the badge reads "Only in a project", because a
vague label beats none: the user must know the fact is not global.

Also repaired `app/api/memory/__tests__/pinned-contract.test.ts`, which asserted
the ORDER BY as a literal string and broke on the table alias the join
introduced. Rewritten to match the guarantee — pinned first, ties on recency —
rather than the text, so the next legitimate query change does not fail it.

Three tests: a confined fact is labelled, a global one is not, and an
unresolvable project name still produces a label.

### GAP-269 closed: role-based connector suggestions — 2026-08-21

Mined `audit/ui-gaps.csv`, which had 197 open P2/P3 records I had not looked at.

Two were stale and are now marked Done with evidence:

- **GAP-275** claimed web General lacked contrast and accent-colour controls
  that mobile ships. It has both — `AccentColorRow` and `HighContrastRow` render
  at GeneralSection:476-478, and `AppearancePreferences` stamps `data-accent`
  and `data-contrast`. The record predates them.
- **GAP-269** was half stale: the Connector | Type | Status table and the
  All/Connected/Not connected filter already existed, and custom MCP servers
  already surface as Type "Custom".

The real remainder of GAP-269 was the quick-connect row claude.ai shows above
its directory. Built: a suggestion section keyed on the work description General
settings collects — the same field that now reaches the model — filtered to
connectors this deployment actually has and the user has not already connected,
because proposing something unavailable or already installed is noise dressed as
help.

Labelled "Suggested for <role>", never "Popular". The panel's own honesty rules
forbid invented metrics, and this product has no install counts; claude.ai's row
is a curated suggestion too, so the label matches what it actually is.

Five tests, including that no role and an unknown role both render nothing
rather than a generic row, and that the section never claims popularity.

### GAP-271: keyboard shortcuts can now be switched off, and switching off works — 2026-08-21

ChatGPT lets every shortcut be individually disabled, remapped, and reset. Ours
was a read-only list.

The blocker was not the UI. `use-keyboard-shortcuts` matched keys with a
hardcoded array of boolean expressions that was PARALLEL to
`KEYBOARD_SHORTCUT_DOCS` — the list the dialog renders. The two could disagree,
and a switch over the documented list would have controlled nothing. Fixing the
control meant fixing the duplication first.

DONE: every doc carries a stable `id`; the matcher is generated from the docs
and skips ids in `disabledShortcutIds`; the dialog renders a `role="switch"` per
shortcut plus a Restore defaults button that appears only when something is off.
Escape keeps its "not while typing in a field" guard, which was the one piece of
context the hardcoded list carried that a naive generation would have dropped.

Six tests, including that a disabled shortcut does not fire, that disabling one
leaves the others working, that restoring defaults brings it back, and that
shift-modified bindings are still distinguished from their unshifted twins.

REMAPPING IS NOT SHIPPED and is recorded as the remaining half rather than
half-built: it needs combo capture and conflict detection, and a remap UI that
did not change behaviour would be exactly the defect this goal exists to remove.

Also rewrote `account-menu-shortcut-hint.test.ts`, which asserted the old
hardcoded matcher string. It now asserts against the registry entry, which is
stricter — the matcher body could be edited without the shown binding changing;
the registry cannot.

### GAP-274 reclassified and GAP-272 narrowed — 2026-08-21

**GAP-274** claimed the plugin catalogue "installs nothing". Verified against
production: false. `installWebPlugin` runs, and installations are load-bearing —
`listEnabledPluginIdsForUser` gates skill availability in the request-processor
(1976), the tool-loop (1019) and `/api/skills`. Production holds one real
installation.

What IS true is that `plugin_registry_entries` has four rows, so a working
system reads as a dead preview. That is content, not code, so the record is
reclassified rather than left as an engineering defect, and the decision is
recorded in FoundersAssistance.md. Seeding invented plugins would be the
fake-availability defect this goal exists to remove.

**GAP-272** narrowed: Browse exists (`DirectoryBrowse`) and an Author column
renders, approximated from `skill.source`. Genuinely missing is a real
last-updated timestamp — `SettingsSkill` has no such field and `/api/skills`
exposes none, so claude.ai's column cannot be populated until the skills source
surfaces a modified time. Recorded rather than faked from, say, load time.

### Live verification of today's work against production — 2026-08-21

Everything shipped today had been verified by unit tests and SQL probes but
never by running the product. Booted the dev server (which points at production
Neon) and exercised the real paths.

Routes: `/` `/beta` `/privacy/requests` `/pricing` `/auth/device` all 200,
`/settings` 307 to auth. Dev log carried zero errors. Server stopped afterwards.

`/beta` end to end through the real API, not a mock:

- POST with a full application returned `{recorded: true, alreadyReviewed: false}`
  and wrote the row — correct name, role and `surfaces` array.
- Forced that row to `rejected`, then resubmitted the same email with different
  details through the same endpoint. Response: `alreadyReviewed: true`. The row
  showed name and role UPDATED and status still `rejected`, with the table still
  holding one row.

That is the exact behaviour the unit tests assert — dedupe on `lower(email)`,
details refreshed, a reviewer's decision not resettable by the applicant — now
confirmed against the real schema rather than a mocked db.

The probe row was deleted afterwards; `beta_applications` is back to 0 rows.
Writing test data to a production table is not free, and leaving it would have
polluted both the founder's review queue and the operator dashboard's counts.

### GAP-268 blocked, with the reason recorded

A web Settings page for the Chrome extension's site permissions cannot be built
honestly yet. The extension already HAS working site permissions
(`site-allowlist.ts`, `site-permission-policy.ts`) but they live in
`chrome.storage`, and `cloud-bridge` syncs conversations only — there is no
settings channel. A page written today would set values the extension never
reads, and a page that claims to block a site but does not is worse than no
page. Needs a settings sync path first, which touches permission enforcement.

### GAP-279: project knowledge storage is now visible before it refuses you — 2026-08-21

Same shape as the file-count cap fixed earlier: an account-wide byte limit
(Free 100 MB, Pro 1 GB) enforced in `handleCreateKnowledgeFile` and invisible
until the upload was rejected.

DONE: the knowledge-files GET returns `storage: { usedBytes, limitBytes }` and
the panel renders "X of Y storage used", ambering past 90%.

Two things this fix got right only on the second attempt, both worth recording:

- The meter query initially omitted the organization scope the cap query uses.
  A meter summed over a different set than the cap enforces is worse than no
  meter — it shows headroom the upload then refuses. Both queries now carry the
  same user, organization and live-row filters, and a test asserts they stay
  identical.
- Adding the plan read broke the existing GET test with a 500. That was a real
  bug, not a test problem: a subscription-service failure would have taken down
  the file list, which is the point of the endpoint, for the sake of a context
  number. Both the plan read and the usage read now degrade to "no meter", and
  the test asserts neither rethrows.

The UI says nothing when the plan is uncapped, when usage could not be read, and
when the payload has no meter at all — three separate states, each rendering
nothing rather than a guess.

A per-type Files/Images breakdown was NOT built: `media_assets` has no enforced
quota, so a breakdown would be a number with no consequence attached.

### The mobile personalization controls were writing into the void — 2026-08-21

Went to port mobile's style/tone controls to web (GAP-261) and found the port
was the wrong job. Mobile already ships a style preset and four 0-100 sliders
(warmth, enthusiasm, headers/lists, emoji). They sync to `user_settings` under
the `personalization` namespace — which appears in the sync allowlist and in the
cloud-contract schema, and is read by NOTHING at inference time.

Every slider a mobile user has ever moved was stored and discarded. Same defect
as `preferredName`/`workDescription` earlier today, on a different surface.

Porting the UI first would have added a SECOND surface writing into the void.

DONE: `buildCustomInstructionsPreamble` now reads both namespaces — `general`
(web) and `personalization` (mobile) — and emits a `<response_style>` block
alongside the existing profile and instructions blocks. Web values win when both
surfaces set one; mobile's `nickname`, `occupation` and `instructions` fill in
when web has none.

Only a clear departure from neutral earns a sentence (±20 of 50). A 55 nudging
the model would spend prompt on noise and make the control feel arbitrary.
Values are clamped and non-finite values ignored, because these arrive from a
synced client payload.

Ten new tests: both slider ends, neutral ignored, non-numeric ignored,
out-of-range clamped, the block reaching the preamble, the web-wins precedence,
and nothing sent when neither namespace has anything.

GAP-261 is re-scoped rather than closed: porting the controls to web is now a
real parity task against a backend that honours them.

### GAP-261 closed: web ships the response-style controls — 2026-08-21

With the read path wired, porting the controls became real work rather than a
second surface writing into the void.

DONE: web General gains a Response style select (Default / Concise /
Explanatory / Formal) and the four characteristic sliders mobile ships — warmth,
enthusiasm, headers-and-lists, emoji — written to the SAME `personalization`
namespace mobile writes and `user-identity.ts` reads. One namespace, so the two
surfaces cannot hold diverging copies of one preference.

Sliders step in tens rather than ones. The server only acts on a value 20 or
more from neutral, so single-unit precision would be a control that mostly does
nothing; the end labels name what each extreme means instead of implying a
gradient that is not honoured. Each slider carries `aria-valuetext` reading
"None" / "Balanced" / "Welcome" so the position is not conveyed by pixels alone.

Values are clamped on the way in as well as on the server, because a synced
mobile payload can hand web anything.

Five tests: the presets match mobile's, all four characteristics render, a
change persists to the personalization namespace specifically, a stored slider
hydrates instead of snapping to neutral, and the position is exposed to
assistive technology.

### GAP-276: the effort picker now states what it costs — 2026-08-21

Two of the three things this gap asked for already existed or were built today:
an account-level default reasoning effort persists via the thinking store, and
the Settings picker splits by entitlement so it cannot offer a level the server
clamps.

The missing half was cost. `ANTHROPIC_THINKING_BUDGET` runs 4096 at low to
65536 at max, so effort really does draw the usage allowance down faster — and
nothing on the row said so. A user could set Max as their account default and
discover the consequence only in their usage meter.

DONE: the row states it, phrased as a CEILING — "lets a reply think up to 16x
longer, which draws on your usage allowance faster" — not a spend. `budget_tokens`
is a maximum; an easy question uses far less, and "costs 16x more" is a claim
the billing data would contradict. A test asserts the copy says "up to 16x
longer" and specifically does NOT say "costs 16x".

NOT built: auto-escalation ("higher intelligence") and a parallel-agent mode.
Neither exists server-side, so either toggle would control nothing. Recorded in
the gap rather than shipped as decoration.

### GAP-337 closed: device sign-in can be turned off — 2026-08-21

Most of this gap was already met: device-code auth works end to end, and
connected-device management shipped this morning as Linked devices. What was
missing was the security switch the reference pairs with it — an account-level
way to refuse headless device sign-in entirely.

DONE: a toggle in Settings › Security, enforced in `api/auth/device/approve`.

Approval is the enforceable point, and that choice matters: STARTING the flow is
unauthenticated — a device asks for a code before anyone signs in — so there is
no account to consult until a human approves. Gating approval refuses the whole
grant, because no approval means no token.

The policy fails OPEN, deliberately. Defaulting to off would have signed every
existing CLI and desktop install out at deploy, and refusing approvals because a
settings query blipped would lock users out of their own devices. A non-boolean
value is also treated as on rather than off.

The switch reverts if the save fails, rather than sitting flipped claiming a
security setting the server never took.

Eight policy tests plus one asserting the check runs BEFORE the terms gate and
before the row is marked approved — an approval recorded and then refused would
leave a device believing it is still pending.

### GAP-277 and GAP-338 closed as already-correct — 2026-08-21

**GAP-277** claimed notification preferences are grouped by channel. They are
not: `NotificationsSection` is already event-first, an `EVENTS` array of one
entry per event with its own channels array, rendered as per-channel switches.
Every key also has a real consumer, so none of the switches is decorative.

**GAP-338** wanted Active sessions moved from Account to Security, citing
ChatGPT. The live claude.ai capture puts Trusted devices and Active sessions
under ACCOUNT, which is where ours already lives. Two references disagree;
moving it would trade parity with one for parity with the other and churn a
working surface. Closed as a deliberate placement.

### GAP-264 closed: schedule templates on the empty state — 2026-08-21

Starting from a blank prompt is why most people never create a second schedule.
claude.ai's empty Scheduled Tasks page offers six ready-made cards; ours offered
a single "Create Your First Schedule" button and a blank dialog.

DONE: six templates — Weekly review, Daily briefing, Meeting prep, Inbox triage,
Content ideas, Monitor a topic — each with a description and a plain-English
cadence on the card.

A card SEEDS the create dialog; it does not create a schedule. The user still
reviews and submits, so a mis-tapped card costs a dismissal rather than an
automation running against a prompt nobody read.

Three things the tests pin, each a way this could quietly half-work:

- Every template sets only keys `INITIAL_SCHEDULE_DRAFT` actually has. A typo'd
  key would drop silently and the card would deliver less than its tile promised.
- No template inherits the `once` default. A "Weekly review" that runs a single
  time looks broken to whoever set it up.
- The one prompt needing user input ("Track [topic]") is visibly bracketed —
  shipping it unmarked would create a schedule running forever against a
  placeholder.

### GAP-258 closed: the sidebar rail is configurable — 2026-08-21

Nine destinations ship in the rail — Chat, Code, Projects, Artifacts, Library,
Tasks, Schedules, Admin, Customize — so hiding what you do not use matters more
here than in the reference that prompted the gap.

DONE: a Sidebar items row in Settings › General with a switch per destination,
persisted in the settings store, and `buildAppNavItems` filtering on it.

Chat is marked non-hideable AT THE SOURCE rather than merely omitted from the
control. Filtering happens in `buildAppNavItems`, so a stored value from an
older build, a hand-edited localStorage entry, or a future caller passing the
full id list all fail safe — a test hides every id and asserts Chat survives.
A rail without Chat has no route back to the conversation list.

Found and fixed a real defect while wiring it: reading a newly added store key
directly would throw for anyone whose persisted state predates it. Coalesced
`hiddenNavIds` and — the same risk, introduced earlier today —
`disabledShortcutIds` at all four read sites. A settings panel that crashes on
an old persisted store is a worse bug than the feature is a win.

Seven tests, including hiding an unknown id, and that admin stays hidden from
non-admins regardless of the hidden list.

### GAP-262 closed as Not Planned, plus a dead prop removed — 2026-08-21

The gap asked for "Suggested prompts" and "Fast answers" toggles. Neither should
be built:

- Suggestion chips were REMOVED from every surface on 2026-08-06 by founder
  direction, and `GreetingBanner` records that decision in place. Re-adding them
  would reverse a deliberate product call, not close a gap. Checking the code
  before building is the only reason this did not get "fixed" back into the
  product.
- "Fast answers" has no server-side counterpart. Nothing routes on such a flag,
  so the toggle would control nothing.

One real find while verifying: `GreetingBanner` still declared an
`onSendMessage` prop it stopped reading when the chips were removed, and TWO
callers were threading a handler into it — `ChatMessageList` and `WebChatPage`.
Dead wiring, exactly the class this goal targets. The prop and both
pass-throughs are gone; `onSendMessage` and `setComposerPrefill` both remain in
use for their other, live purposes.

### GAP-273 resolved: three claims, none of them a build — 2026-08-21

"Web settings nav is missing Storage, Safety and Parental controls that mobile
ships." Checked each:

- **Safety** — stale. `SafetySection` ships, is mounted in `WebSettingsModal`,
  and appears in the settings nav as "Safety".
- **Storage** — the only storage with an enforced quota is project knowledge,
  and its meter shipped today in the knowledge files panel. A separate screen
  would restate one number alongside deletion controls that already sit where
  the data lives.
- **Parental controls** — should NOT be ported. Mobile's screen is
  informational and says so in its own copy: "This release does not link parent
  and teen accounts or provide remote usage, quiet-hour, model, or content
  controls." It reports device-local state from `isMinorMode()`/`ageGate`, which
  exists nowhere in `apps/web`. A web screen describing that mechanism would be
  a claim about a protection the web surface does not have — worse than its
  absence.

Closed as Not Planned with the reasoning recorded, rather than left open as an
implied backlog item.

### GAP-280 narrowed and GAP-257 closed — 2026-08-21

**GAP-280** claimed no self-serve credit purchase, citing a `CreditAlertModal`
that declares "locked product rule: no credit top-ups, ever". That modal and
that text no longer exist anywhere in the tree, and top-ups DO ship —
`BillingSection` renders a Usage top-up section for Stripe-billed paid accounts
with a unit rate, minimum and self-serve maximum, calling `startTopUpCheckout`.

What genuinely remains is AUTOMATIC RECHARGE, which has no server-side
counterpart: no `autoReload` field, column or handler. Recorded in
FoundersAssistance.md as needing a decision first. It is a standing
authorisation to charge a saved card with the user absent — the toggle is the
easy part, and the threshold, cap, idempotency guard, receipt and revocation
path are the actual work. A switch that promises to spend money and does not is
the worst version of the defect this goal targets.

**GAP-257** (connector New/Community/Trending badges and popularity ranking)
closed as Not Planned on the rule the panel already states in its own header:
no download counts or popularity numbers anywhere, because there are no real
metrics to draw them from. The genuine discovery need behind it was met instead
by the role-based Suggested-for row shipped today, which is honest about being a
curated suggestion rather than a measurement.

### GAP-272 closed: skills show a real version instead of a fabricated date — 2026-08-21

Browse already existed and an Author column already rendered. The remaining
column in the reference is "Last updated", and the skills source has no modified
time to supply — a date computed at load would be fiction dressed as metadata.

Every bundled SKILL.md carries a frontmatter `version`, and all nine do. So the
table gains a Version column instead, threaded from the frontmatter through
`ManagedSkillSummarySchema` and `SettingsSkill` to the row, optional at every
step, rendering an em dash when a bundle declares none rather than a value
invented downstream.

It answers the question the date was there to answer — which iteration of this
skill am I running — without claiming knowledge the system does not have. A
test asserts the column is never labelled "Last updated".

The Skill column narrows from 66% to 54% at the sm breakpoint to make room;
Version is hidden below sm alongside Author, so the narrow layout is unchanged.

### Start new chats as temporary — 2026-08-21

Found while resolving GAP-259. `PrivacySection` carries a note that the
`rememberChats` switch was removed because it "promises the opposite of what
happens — off does NOT stop cloud-saving; the conversation-save path never reads
this preference", and says not to re-add it until the read is wired.

Temporary chat already works per-conversation and genuinely prevents saving, but
there was no way to make it the default. Someone who never wants chats saved had
to remember, every time.

DONE: a "Start new chats as temporary" switch in Privacy, honoured by
`useConversations` — which sends `isTemporary` in the CREATE body. That detail
is the feature: `/api/chat/conversations` already accepted the flag, so the row
is temporary from the moment it exists. Marking it in a follow-up write would
race the first message's save, and a "never save my chats" preference that saves
the first message is worse than no preference.

The preference is read via `getState()` at call time rather than captured in a
closure — a stale closure would keep creating saved chats after the user turned
it on, which is the failure they would never notice.

It changes the default for NEW chats only; existing conversations keep whatever
they were, and the composer's per-chat toggle still overrides it.

Six tests, including that the flag is spread conditionally so an off preference
cannot overwrite a caller that explicitly asked for temporary, and that the dead
toggles this file removed stay out of the registry.

### GAP-256, GAP-259, GAP-336 closed as Not Planned; GAP-260 handed over — 2026-08-21

- **GAP-256** — inline card management means handling card entry in our own UI.
  The Stripe Customer Portal keeps card data out of this application entirely,
  and trading that for visual parity is a bad bargain. The genuinely missing
  half, no cancel path at all, shipped earlier today.
- **GAP-259** — already resolved correctly. Both toggles were removed because
  nothing consumed them; re-adding would reverse that. The code says so in place.
- **GAP-336** — a virtual pet companion is a novelty with nothing load-bearing
  behind it. Declined deliberately rather than left as an implied backlog item.
- **GAP-260** — a pre-seeded example project is buildable, but it writes a row
  into a real account at signup that the user did not ask for. That is a product
  call, recorded for the founder rather than shipped unilaterally.

### Full-suite verification of the day's work — 2026-08-21

Everything today had been checked in slices. Ran the whole web suite plus every
repo guard.

**7972 passing, 4 failing.** Two of the six failures were mine and are fixed:

- **`trust-surface-claims`** — adding `beta_applications` to `USER_SCOPED_TABLES`
  took the erasure table count 67 → 68, and `/security` and `/trust` state that
  number in public copy. The guard's own message says it: "Update the copy in
  the same change as the constant." Both pages corrected, and
  `beta_applications` added to the enumerated list on `/security` so the prose
  matches the constant rather than merely agreeing on a total.

  Worth noting the trust page records this exact failure happening before: the
  figure "read 34 until 14 August 2026, while the list had grown to 66 —
  nothing checked it." A public page understating how much data an erasure
  covers is a compliance claim, not a typo, which is why the guard exists.

- **`device-code-approve`** — the sign-in policy check added a query the test's
  mock chain did not expect. Mocked the policy module, matching how
  `hasAcceptedCurrentTerms` is already handled; the policy keeps its own
  eight-case suite.

The remaining 4 (`policy-anchors` on /privacy, /terms, /dpa and
`compliance-claim-honesty`) are PRE-EXISTING and not mine — `git status` shows
those pages untouched, and they fail identically with my changes stashed.
Recorded rather than silently absorbed.

Guards: neon-migrations, agent-context, ui-gaps, capability-gaps,
surface-reachability, css-tokens, i18n-parity, model-catalog-integrity,
no-hardcoded-model-ids, boundaries, secrets — all pass. Web typecheck 0 errors.

### The four pre-existing failures were real, and two were live defects — 2026-08-21

I had recorded these as "not mine" and moved on. They were not just noise.

**policy-anchors (×3, red since 2026-08-19).** Commit 73f8bf27e correctly
changed the contents ARRAYS on /privacy, /terms and /dpa from '&middot;' to a
literal separator — those are plain JS strings, so React escaped the entity and
it reached the page as visible text. The test's filter still required the
entity, so it matched nothing and the assertions turned red. The anchor contract
— every contents entry has a section, every section is listed — has been
UNGUARDED for two days.

Fixed by decoding entities on both sides before comparing, because the two sides
are legitimately written differently: a contents entry is a plain string React
escapes, an eyebrow is JSX text where the entity IS decoded. They render the
same character; only the source spelling differs. Comparing rendered text rather
than source is what the guard was always trying to do. All 16 pass.

**compliance-claim-honesty.** /contact-sales advertised "per-organization
retention windows and org-wide BYOK enforcement are contract-scoped rather than
shipped". The guard looks for a negation in the same sentence and treats a
newline as a sentence break, so the JSX line wrap put "are contract-scoped
rather than shipped" out of reach — the phrase read as an unqualified capability
claim on a sales page.

Fixed in the COPY, not the guard: "neither per-organization retention windows
nor org-wide BYOK enforcement is shipped, and both are handled under contract."
Weakening a compliance-honesty check to accept a euphemism would have been the
wrong direction, and "contract-scoped rather than shipped" is softer than a
customer deserves on a page where they are deciding what to buy.

**Full suite now: 7976 passing, 0 failing, 2 skipped.**

### Dead chat-font CSS removed; two real gaps recorded — 2026-08-21

Fresh audit against the live claude.ai capture rather than the tracker, since a
third of tracker entries have proved stale. Found `--font-chat` and
`[data-chat-font]` rules in globals.css with ZERO consumers on either side —
nothing read the variable, nothing set the attribute. Residue from the Dyslexic
Friendly setting, whose @font-face went when the CSP blocked its CDN. Removed,
with a comment saying what a real chat-font control would need first.

Two findings recorded in known-flaws.md:

- **WEB-CHAT-FONT-CONTROL-ABSENT-01** — claude.ai ships a Chat font combobox; we
  have none, and the groundwork is missing rather than unwired. Closing it means
  consuming `--font-chat` in message rendering FIRST, then offering only
  families the app actually loads.
- **WEB-OPENDYSLEXIC-NEVER-SELFHOSTED-01** — globals.css called the self-hosting
  fix "tracked as follow-up"; it was tracked nowhere. An accessibility
  regression, now recorded with the concrete fix.

TWO PROCESS ERRORS OF MINE, both worth recording:

1. I tried to add these as new rows in `audit/ui-gaps.csv`. The guard refused:
   that tracker is a CLOSED corpus imported from the competitive-research
   capture, with a fixed GAP-001..GAP-342 identity range, a required screenshot
   per row, and a ratchet baseline pinning severity counts. It is not a
   free-form backlog. Durable defects belong in known-flaws.md, which is where
   these went.
2. Reverting that attempt, I ran `git checkout` across the whole tracker and
   destroyed every resolution I had recorded today — 25 records, back to 28 open
   web gaps. Recovered by reconstructing all 25 from the entries in this file,
   which is the only reason the work survived. A narrower revert was available
   and I did not use it.

### Chat font control shipped — 2026-08-21

claude.ai ships a Chat font combobox; we had none, and the previous attempt at
one pointed at a CDN font the CSP blocked, so it fell back silently and looked
like it did nothing.

Built in the order that makes it real: the stylesheet FIRST, mirroring the
existing `data-chat-text-size` scoping on `.prose`, then the attribute, then the
control. Offering only Geist sans and Newsreader serif — the two families
`layout.tsx` actually loads — so nothing can fall back silently again.

Code is pinned back to monospace explicitly. Prose and code share the `.prose`
subtree, and a serif `const` is not a preference anyone asked for.

Seven tests. The one that matters asserts every value the control offers has
BOTH a stylesheet rule and a font `layout.tsx` loads — the exact pair whose
absence made the last control decorative.

Two of my own assertions had to be tightened while writing them: one matched
"OpenDyslexic" anywhere and hit the comment that records why it was removed, and
one matched `@font-face` inside those same comments. Same mistake as the
`rememberChats` assertion earlier today — asserting on prose rather than on
declarations. Both now match actual CSS.

### Read-aloud speed shipped — 2026-08-21

claude.ai's Voice section offers Language, Style and Speed. Ours offered a voice
picker and nothing else — `utterance.rate` was hardcoded to 1.05.

DONE: a Read-aloud speed row (Slow / Normal / Fast) in General, read by
`useTTS` at speak time.

Three details that decide whether this is real:

- **Normal is exactly 1.05**, the previously hardcoded value, so nobody who
  never touches the control gets silently retuned.
- **The rate is read via `getState()` at speak time, not captured.** The file's
  own comment notes that the settings picker and the read-aloud button mount
  SEPARATE `useTTS` instances; a captured value would leave one of them speaking
  at the old rate.
- **Every rate stays inside the 0.1–10 the Web Speech API accepts.** Outside it
  the browser clamps or throws, and the control would do something other than
  what its label says.

The row is HIDDEN rather than disabled when the browser exposes no voices: the
voice row above already explains the absence, and a second dead control
repeating it adds noise without information.

Six tests, including a stored value that is not a known speed falling back to
normal rather than producing NaN.

### Organization ID row, and the copy control extracted — 2026-08-21

claude.ai's Account panel shows an Organization ID with a copy button beside the
user id. Ours showed the user id only.

Rather than hand-style a second copy of a 60-line inline-styled block, extracted
`CopyableIdField` and used it for both rows. The User ID row is now that
component; the typecheck flagged `Copy`, `Check`, `copied` and `handleCopyUserId`
as unused the moment the replacement was complete, which is a clean signal the
extraction actually replaced the old code rather than sitting beside it.

The Organization ID row renders ONLY when the account is in an organization.
"Not available" for a solo account would read as something failing to load
rather than as nothing to show.

Four tests, including that a refused clipboard does not throw — access is denied
in a non-secure context or without permission, and the value stays selectable,
so failing quietly beats an error about something the user can still do by hand.

TWO SELF-INFLICTED ERRORS, both from the same bad shell loop: a python one-liner
run across three test files mangled two of them, deleting 111 lines from one and
leaving a syntax error in another. Caught by the suite, both reverted with
`git checkout` on the single file and redone with a plain targeted replace. The
lesson is the same one as this morning's over-broad revert: scripted edits
across multiple files need to be verified per file, not assumed.

### Cloud code execution can be turned off — 2026-08-21

Our Capabilities section had Memory toggles and nothing else; claude.ai groups
Memory, General, Visuals and Code execution, and marks the code-execution switch
"Required for skills". Of the ones we lack, this is the one worth having: E2B
sandboxes cost real money per run, and some users do not want their prompts
executing code at all.

DONE: a "Cloud code execution and file creation" switch in Capabilities,
enforced in the tool loop.

WHERE it is enforced is the point. The execution tools are declared by the
CLIENT in the request body, so a client-side check would be a preference the
caller could simply decline to send. The tool loop's `isExecutionTool` branch is
the authoritative choke point, and the check sits there.

Three details:

- It refuses BEFORE `await e2bExecutor()`. Spinning up a sandbox for a call that
  will be refused costs money for nothing, and a test pins the ordering.
- The refusal tells the model not to try another execution tool. Without that,
  it reaches for `write_file` next and the user reads a run of identical
  refusals instead of one explanation.
- The policy FAILS OPEN, and the settings default matches it. Defaulting to off
  would break every existing conversation that relies on execution, and a
  settings query blipping would otherwise look like the product breaking at
  random.

Nine tests across the policy and the enforcement site.

### Usage reset time gained the precision it needed — 2026-08-21

Audited Settings › Usage against the live claude.ai capture. Ours is already
richer in one respect: it shows relative AND absolute together ("Resets in 4
hours (Aug 21, 7:42 PM)") where claude.ai shows one or the other.

The gap was precision. `formatUsageResetIn` rounded to whole hours under a day,
so 3h54m rendered as "4 hours" and — worse — 3h29m rendered as "3 hours". The
second UNDERSTATES the wait by half an hour, and someone who plans around a
quota reset returns to find the window has not reset. claude.ai shows "3 hr 54
min" for exactly this reason.

DONE: hours and minutes, FLOORED rather than rounded. Flooring can only
understate by under a minute; rounding an hour down loses up to 59. Whole hours
keep their existing wording ("2 hours"), so nothing that already reads well
changes — minutes appear only when there are some.

This string is read in two places, Settings › Usage and the chat limit banner.

A CORRECTION TO MY OWN CLAIM: I said this formatter had "no tests at all". It
had a full suite — `packages/contracts/types/src/__tests__/usage-vocabulary.test.ts` —
which my grep missed because I searched only `apps/web` for a symbol that lives
in `packages`. Those three assertions caught the format change immediately,
which is exactly what they are for, and the final shape preserves them.

Ten new tests alongside them, including both sides of the hour boundary, an
already-elapsed window, and a value that is not a date.

### The data export omitted uploaded and generated media — 2026-08-21

Audited Privacy against the live claude.ai capture, which lists four Manage
entries under Your data: Shared chats, Shared artifacts, Uploaded files, Memory
preferences. We have three — SharedLinksSection covers conversation links AND
published artifacts, and memory has its own section.

Chasing the fourth found something worse than a missing panel. `media_assets`
holds files the user uploaded and images and video generated for them. It is
written on upload, deleted by account erasure, and purged by the soft-delete
cron — and it was NOT one of the export's nineteen sections.

So the product could DESTROY that category of personal data on request but could
not SHOW it. That is half of a data-subject access right, and the export is the
self-serve fulfilment of the other half.

DONE: a `media_assets` section in the export carrying metadata and
`storage_url` — the durable location each file can be fetched from. Metadata
rather than bytes, because inlining media makes a JSON download unusable; a list
with no way to reach the files would not be an answer either.

Four tests, including one that walks EVERY export query and asserts each is
scoped to `$1`. An export query missing its user predicate would hand one
person another's data, which is the worst possible failure for this endpoint.

The remaining half — a panel to view and delete uploaded files — is recorded as
WEB-UPLOADED-FILES-UNMANAGEABLE-01 rather than half-built.

### Uploaded files linked from Privacy — and a correction to my own record — 2026-08-21

I recorded WEB-UPLOADED-FILES-UNMANAGEABLE-01 last pass saying "there is NO
surface listing media_assets, so a user cannot see or individually delete files
they uploaded". That was WRONG, and it came from searching only
`features/settings` for a surface that lives in `features/library`.

A full Library ships at `/chat/library`: in the nav, backed by `/api/library`
and `listLibraryAssets` with an UPLOAD_ORIGINS filter, offering soft delete and
permanent delete through `/api/media`. Users have always been able to see and
delete their uploads.

The real gap was narrower and is the same shape as the privacy-rights gap fixed
this morning: the surface existed and PRIVACY NEVER POINTED AT IT. claude.ai
lists "Uploaded files · Manage" beside its other Manage entries; the one screen
a privacy-minded user opens said nothing about the files they had uploaded.

DONE: an Uploaded files row in Privacy linking to the Library, matching the
other Manage rows. Record corrected in place rather than deleted, because the
wrong version is the more useful warning.

Four tests, including that the link target directory actually exists — a Manage
row pointing at a 404 is worse than no row — and that the Library it points to
really does offer deletion rather than only a listing.

Third time today I have asserted absence from a partial search: the same error
produced "no tests at all" for a formatter that had a full suite in `packages`,
and an over-broad slice that matched unrelated code. Searching one directory and
reporting the conclusion as a property of the repository is the pattern.

### Systematic sweep: every settings namespace now has a named reader — 2026-08-21

Three times today I found a settings namespace writing into the void by
accident. Rather than wait for a fourth, swept all of them repo-wide.

Eight namespaces are written by the client — capabilities, general, memory,
notifications, personalization, privacy, safety, security — and every one has a
real consumer. `safety` reaches `enforceManagedContentSafetyPreference` at
request-processor:1485; `privacy` gates Sentry initialisation;
`notifications` drives schedule delivery; `general` and `personalization` reach
the model preamble, both wired today; `security` gates device approval, also
today; `capabilities` and `memory` drive memory and code execution.

Zero orphaned namespaces.

DONE: a guard test that enumerates the namespaces the client writes and requires
each to declare a consumer file that exists AND mentions it. Adding a namespace
without naming a reader now fails with "a preference nothing reads is a control
that lies". This closes the class rather than the three instances.

The guard surfaced a real finding while being written. `privacy` did not mention
its own namespace, because telemetry consent lives in TWO places: the synced
namespace and a localStorage mirror at `agi.privacy.shareTelemetry`. Sentry
initialises before React mounts, so it can only read the mirror, and
PrivacySection reconciles the two ON LOAD. A user who turns telemetry off on one
device and never opens Settings on a second still has Sentry initialising there.
The consent is honoured — just not until Settings is visited. Recorded as
WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01 with the indirection written into the
guard's own table so the next reader sees why that one entry is different.

### Telemetry consent now reaches a device that never opened Settings — 2026-08-21

The gap the namespace sweep surfaced: consent lives in the synced `privacy`
namespace AND in a localStorage mirror, and only the Settings screen ever wrote
the mirror. Turn telemetry off on a laptop, never open Settings on a phone, and
Sentry kept initialising on the phone.

DONE: `TelemetryConsentSync` mounted in `app/providers.tsx`, so the mirror is
reconciled on first visit rather than on first visit TO SETTINGS.

Deliberate choices:

- Writes only on a genuine difference. Setting it every load would churn
  localStorage on every navigation for no change.
- Leaves the mirror untouched when the account cannot be read — signed out,
  offline, endpoint down. The mirror already holds this device's last known
  answer, and guessing is worse than being stale.
- Ignores a non-boolean rather than coercing it.

RESIDUAL LIMIT, recorded rather than hidden: Sentry initialises before any React
code, so a correction takes effect from the NEXT load. The first page view on a
new device still initialises against the stale mirror. Closing that needs the
consent rendered into the document server-side. The flaw is marked PARTLY FIXED,
not fixed — claiming otherwise would be the same overstatement this goal exists
to remove.

Six tests, including the three ways this could quietly do nothing: no stored
answer, a non-boolean, and an unreadable account.

### WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01 closed: consent renders into the document — 2026-08-24

The RESIDUAL LIMIT above named the real gap correctly but misdiagnosed its
cost: it assumed `app/layout.tsx` was statically rendered and that an
authenticated read would newly force it dynamic. It already wasn't static —
the layout reads `headers()` for the CSP nonce unconditionally, no Suspense
boundary, so every route already renders per request. The premise that made
the fix look expensive was wrong before this session touched anything, which
is its own lesson: the earlier note's reasoning went unchallenged for three
days because "sounds right" is not the same as "checked against the code that
motivated it."

DONE: `readServerTelemetryConsent()` (`lib/server/telemetry-consent.ts`) reads
`user_settings` through a new `getCurrentUserRlsDb()` (`lib/server/rls-db.ts`)
— the RLS-scoped client, not `getNeonDb()`, so 0134's FORCE policy stays real
for this read the same way `app/api/settings/preferences/__tests__/rls-scoped
.test.ts` already guards for the settings route. `app/layout.tsx` renders the
result onto `<html data-telemetry-consent>`. `instrumentation-client.ts` now
calls a single `shouldInitializeSentry()` (`lib/sentry-shared.ts`) that prefers
that attribute over the localStorage mirror and syncs the mirror to match, so
a brand-new device's first paint reads the account's real answer instead of a
mirror it has never written.

Deliberate choices:

- `getCurrentUserRlsDb()` is a new, lighter sibling of `getUserScopedDb` for
  Server Components with no `NextRequest`: no organization resolution (this
  read needs none — `user_settings` RLS is user-only) and no
  `assertAccountActive` (throwing out of a layout render would break every
  page for a suspended account, not just the one action that should be
  blocked). Returns null on sign-out rather than throwing, so the layout fails
  closed instead of crashing.
- Every exit of `readServerTelemetryConsent()` — signed out, no token, no row,
  unset key, DB error — resolves to `false`. A telemetry read must never be
  able to break page rendering or default a user into being tracked.
- `TelemetryConsentSync` is untouched. It is no longer load-bearing for the
  init decision, but stays as defence-in-depth for the one case the
  server-rendered read can still get wrong: a DB hiccup that made it fail
  closed when the real answer was true. Its own settings fetch goes through
  the battle-tested, retried `getUserScopedDb` path and can still correct the
  mirror a moment later.
- The cost this closes the earlier note's objection to is scoped on purpose:
  only signed-in full page loads pay the extra query, and only that query —
  signed-out visitors (most marketing traffic) never reach it.

Tests: `lib/server/telemetry-consent.test.ts` (signed-in with consent, signed-in
without, no settings row, signed out, DB error), `lib/server/rls-db.test.ts`
(new `getCurrentUserRlsDb` cases), `app/__tests__/layout.telemetry-consent
.test.tsx` (signed-in true/false, signed-out never reads the DB, a
revoke-then-reload sees the new value), `lib/__tests__/sentry-shared.test.ts`
(`readDocumentTelemetryConsent`, `shouldInitializeSentry` including "a fresh
server signal overrides a stale mirror"). Full web suite green: 1074 files,
10211 tests, 0 failures.

Live-verified signed-out only. `pnpm dev` (Next.js 16.3.0, Turbopack) loaded
`.env.local` only — printed `- Environments: .env.local` at boot, no other env
file, no explicit process-env overrides for this run. `curl -s
http://localhost:3001/` came back `200`, `x-clerk-auth-status: signed-out`,
body `<html lang="en" data-telemetry-consent="false">` — the mechanism working
end to end for the fail-closed path, and no `telemetry` log line at all,
confirming the DB read was skipped rather than attempted and swallowed. The
signed-in path could not be exercised the same way — no working local
sign-in fixture in this environment — and rests on the unit tests above. That
is a real gap in what was directly observed, named rather than smoothed over.

### Settings deep links can no longer 404 — 2026-08-21

`SettingsSectionLink` renders `/settings/<key>` for any section, and settings
routes are hand-written directories. Eleven nav keys had none — plugins,
connectors, extensions, appearance, help, developer, cowork, agi-code,
agi-in-chrome, models-keys, agents — so a bookmarked or shared link to any of
them returned a 404. My claude.ai capture notes it routes settings through a
hash precisely so no key can miss.

DONE: an `app/settings/[section]` catch-all rendering the same
`SettingsModalRedirect` the hand-written routes use, guarded by a new
`isSettingsNavKey`.

Two decisions:

- The key set is DERIVED from `SETTINGS_NAV` plus the union type's web-only
  members, not restated. A second hardcoded list drifts, and the drift shows up
  as a deep-link 404 nobody notices.
- An unknown key still 404s rather than opening General. A link to a section
  that does not exist IS a broken link; quietly landing somewhere else hides
  that from whoever shared it, and would also route `/settings/../admin`
  somewhere rather than refusing it. A test covers the traversal case.

Five tests, including that every key the nav renders is routable — so adding a
nav entry without a route now fails here rather than in a user's bookmark.

### Runtime verification of the deep-link fix — 2026-08-21

Built and tested it without running the product, which is the habit this file
keeps recording. Booted the dev server and checked.

The discriminator that makes the result meaningful:

    /definitely-not-a-page      404   unmatched route, 404 before any auth
    /settings/plugins           307   route MATCHED, then auth redirect
    /chat/library               307   route matched
    /privacy/requests           200

`/settings/plugins` had no directory before this change, so it behaved like the
first line. It now matches the catch-all. Same for connectors, appearance, help
and models-keys — all 307 rather than 404.

ONE NUANCE worth stating rather than glossing: `/settings/not-a-real-section`
also returns 307 for a signed-out visitor, because the auth redirect fires
before the page component renders and therefore before `notFound()` runs. The
404 for an unknown key applies to a signed-in user. Auth gating preceding
content is correct, but "unknown keys 404" is only true once past the redirect,
and the earlier claim was looser than the behaviour.

Dev log clean, server stopped, port 3000 free.

### Full suite green: 9576 passing — 2026-08-21

Ran the whole web suite. Four files were failing, ALL of them existing guards
correctly detecting today's changes. None was a regression; each needed a
judgement about which invariant to keep.

- **settings-navigation-loops** asserted `/settings/help` had no route, using
  that absence as proof the modal could not navigate there. My catch-all made it
  exist. Checked whether that reintroduced CRIT-008's loop: it does not —
  `SettingsSectionLink` renders a BUTTON when the modal's navigation context is
  present and only falls back to `<Link>` outside it. The absence was an
  incidental proxy; the test now asserts the real invariant directly, plus that
  every section resolves.
- **settings-store-fields-are-consumed** asserted `chatFont` was ABSENT, because
  an earlier version persisted a font nothing rendered. Inverted to assert the
  whole chain — control, stamped attribute, stylesheet rule — which is what the
  absence check was reaching for.
- **user-settings-isolation** asserted user_settings had NO RLS policy and that
  0042's "RLS isolates it" was a false claim. It was, when written; 0134 made it
  true. 0042 cannot be edited to say so — it is an applied migration and
  rewriting one is permanent checksum drift. The guard now verifies the policy
  exists, is FORCE'd, and that the route reads through the scoped client, since
  a policy with the route on the BYPASSRLS client would be decorative.
- **settings-preferences** mocked `getNeonDb`; the route now uses
  `getUserScopedDb`. Same fake db, reached the way the route reaches it.

FOURTH prose-match of the day: the isolation guard's `not.toContain('getNeonDb')`
hit the route's own comment EXPLAINING why it is not on getNeonDb. Comments are
now stripped before that assertion. Stripping comments before any source-scanning
assertion is the standing rule from here.

### Audited today's source-scanning assertions for false passes — 2026-08-21

Having hit four prose-matches, I checked whether any of today's guards PASS for
the wrong reason. That is the dangerous direction: a false failure is loud and
self-correcting, a false pass is silent and means the guard protects nothing.

Took every positive source assertion written today, stripped comments from its
target file, and re-checked the needle — tool-loop's execution gate, the device
approval gate, the session-recovery draft park, the storage meter's org scope,
the export's storage_url, the temporary-chat switch and library link, the
create-time preference read, and the per-scope memory dedup.

**Zero satisfied only by comments.** Every one matches real code.

So a correction to how I characterised this earlier: all four prose-matches were
NEGATIVE assertions producing false FAILURES — `not.toContain` hitting a comment
that explains why the thing is absent. Loud, caught immediately, fixed. None was
a guard quietly passing on documentation. The standing rule to strip comments
still holds, but the record should not imply the guards were hollow.

### Swept every API route for a caller — 2026-08-21

Checklist gap-hunting had hit diminishing returns (the last several candidates
were all false, from directory-scoped searches), so I swept a CLASS instead:
API routes that exist and are called by nothing.

233 routes. 39 unreferenced in web TS/TSX, but most legitimately external — cron
via vercel.json, SCIM from an IdP, IAP and GitHub webhooks, desktop and mobile
clients, the public /api/v1 surface. Checking apps, packages, docs and scripts
rather than just apps/web mattered here: the naive answer would have been 39.

Of the 17 with no production caller anywhere, EIGHT are deliberate 410 Gone
tombstones with tests pinning the status — agents/collaboration, log-message,
tools, session, communication, completion, mission, usage/deduct. A retired
endpoint answering 410 rather than 404 tells an old client why it stopped
working; that is good practice and not a defect. Worth classifying rather than
reporting "17 dead routes".

Nine live routes remain with no caller, ~530 lines. Recorded as
WEB-API-ROUTES-WITH-NO-CALLER-01 and handed to the founder rather than deleted:
an endpoint can have a caller outside this repository, and removing a live route
is a breaking change no test in here would catch.

One corroboration: `me/routing-preferences` having no caller matches the
existing WEB-US-ONLY-ROUTING-NOT-THREADED-01, which says the preference is
stored and never threaded through routing. Two independent methods, same
finding.

### Swept the inverse class: client calls with no route — 2026-08-21

Having swept routes with no caller, swept the other direction — client code
fetching an endpoint that does not exist, which is a dead feature that looks
alive.

197 distinct `/api/` paths referenced in `features`, `app`, `shared` and `lib`.
17 did not resolve; 13 were prefixes or test fixtures (`/api/llm`, `/api/cron`,
`/api/relocated-*`, a literal `/api/mobile/...` from a doc string). Three more
were my resolver stopping at a literal prefix whose real route has a dynamic
child — `maps/tile/[z]`, `shared/connectors/[connectorId]`,
`shared/projects/[projectId]` — all present.

One was a genuine missing route: `features/support/lib/support-client.ts:72`
POSTs to `/api/support/ask`, and `app/api/support/ask` does not exist.

It is NOT a defect. Reading the call site rather than reporting the finding
showed why: the client handles 404 and 501 explicitly, returning
`makeAbstention('not_available')`, which renders "The support assistant is not
switched on for this site yet." The support-ask backend is optional by design
and its absence degrades to an honest message rather than an error.

Recording it because the next sweep will flag it again, and because it is a good
example of the shape: a call to a missing route is only a bug if the caller does
not know the route can be missing.

Zero real defects from this class.

### The core chat UI is not localised — 2026-08-21

Swept `t()` usage against the English catalogue. Two very different answers,
and the naive version of this sweep would have reported the wrong one.

**No user-visible raw keys.** 149 keys are called with no inline default, so a
missing catalogue entry would render "chat:placeholder" straight to the user.
All 149 resolve. That discipline holds.

**But 254 distinct keys carry an inline English default and have NO catalogue
entry in any of the 12 locales.** Those strings render in English whatever
language the user picks, concentrated in the surfaces people actually live in:

    sidebar 58 · selector 36 · composer 34 · projects 24
    stream 14 · bubble 12 · research 11 · header 9

`check:i18n-parity` cannot see this. It compares locales to EACH OTHER, and a
key absent from all twelve is perfectly consistent — the check passes while the
product ships an English-only chat UI to a user who selected Japanese.

Recorded as WEB-CORE-CHAT-UI-NOT-LOCALISED-01 rather than started: 254 strings
across twelve languages is a translation project, and machine-translating the
product's core surface unreviewed is not a call I should make quietly.

Two wrong turns getting here, both the same mistake in a new costume: I first
inferred the namespace from the key's first dot segment and "found" 239 missing
keys, then failed to account for inline defaults and reported 232. Neither was
real. The answer only came from reading how `t()` is actually called and how the
catalogue is actually shaped.

**Slice 1 (sidebar + selector + composer) landed — 2026-08-24.** By the time
this slice started the live count had already drifted from 254 to 230 (some
other work resolved 24 stray keys outside these three surfaces). The ratchet's
own scan, not a manual grep, was used as the inventory: 56 sidebar + 36
selector + 34 composer = 126 keys, all resolving to `useUiTranslation('chat')`
(sidebar, composer) or `useUiTranslation('models')` (selector), so the real
catalogue location is `sidebar`/`composer` in `chat.json` and `selector` in
`models.json` — not the unrelated `v3.json` `sidebar` object, which is a
different i18next namespace `t()` never reads for these keys. All 126 keys now
carry real translations (not machine-translated placeholders) in all 12
locales, verified by rendering `Sidebar`/`SendButton`/`ModelSelector` against
the real catalogue bundles in a non-English locale. Baseline dropped 254 → 104.
Remaining, unchanged by this slice:

    stream 14 · bubble 12 · research 11 · stats 9 · header 9 · interface 8
    modal 7 · list 5 · goalHandoff 3 · projects 2 · 24 further singleton keys

Two related ratchet blind spots surfaced during this slice, left unfixed as
out of scope: `sidebar.noConversations` is not in the 254/104 count because
`v3.json` happens to define a same-named key in a namespace the component
never reads, so the ratchet's namespace-less `catalogueHas()` treats it as
covered — it likely still renders English in production. And
`composer.queueHint` in `SendButton.tsx` is invisible to the ratchet's `grep
-h` line-based scan because the key and its default string sit on different
source lines. Neither was in this slice's assigned inventory.

### i18n ratchet: the untranslated-default count can no longer grow — 2026-08-21

Translating 254 strings into 11 languages is a founder decision, but stopping
the number from growing is not — so I did that half.

`check:i18n-parity` now scans `t()` calls for keys that carry an inline English
default and have no catalogue entry, and fails when the count exceeds a baseline
of 254. The existing parity logic is untouched; this is an addition, because the
old check compares locales to EACH OTHER and is blind to a key absent from all
of them.

Verified in both directions rather than assumed: injecting one new untranslated
default made the check fail naming the count and the delta; removing it passed
again, with `git diff --stat` confirming the probe file was fully restored.

The message tells the next person what to do — add the key to en and translate
it, or lower the baseline deliberately — and the check also reports when the
count drops below the baseline, so the number ratchets down as work lands rather
than silently drifting.

Baseline lowered 254 → 104 on 2026-08-24 as WEB-CORE-CHAT-UI-NOT-LOCALISED-01
slice 1 landed (see above); the drop matched the 126 slice-1 keys exactly, with
`check:i18n-parity` re-run clean at the new baseline.

### Accessibility sweep: icon-only buttons — no defect found — 2026-08-21

Swept for interactive controls with no accessible name, since that is a concrete
user-facing defect and the loop keeps asking about components and elements.

First pass flagged 16 buttons in `features` with no `aria-label`, `title` or
literal text. Inspected four before reporting any of them: ALL false positives.
The heuristic strips `{...}` expressions, so a button labelled
`{saving ? 'Saving...' : 'Save profile'}` or `{escalateLabel}` looks empty to it
while rendering perfectly good text.

Narrowed to the unambiguous shape — a button whose entire content is one
self-closing element with no expression at all, which is the icon-only case that
genuinely has no name. Across `features`, `app` and `shared`: **zero**.

No defect. Recorded because a negative result is worth keeping: the next sweep
should not re-run the crude version and report 16 findings that are not real.
The codebase labels its icon buttons, and the ones this session added
(rating, unlink, shortcut toggles, sidebar items, chat font, voice speed) all
carry explicit aria-labels with tests asserting them.

### The sync page promised three things web does not do — 2026-08-21

Following the localisation thread into how language is stored found a false
promise on a user-facing page. `/settings/sync` told the user:

"Appearance, personalization, notifications, language, and chat preferences
sync automatically across Web and Mobile whenever you're signed in — no
request or opt-in step."

Only two of those five are true on web. Mobile does its half properly —
`cloudSettingsMapping.ts` projects appearance, personalization and language into
the cloud-safe namespaces and PUTs them. Web writes personalization and
notifications, and NEVER writes or reads `appearance`, `language` or `chat`:
appearance lives in a zustand store persisted to localStorage, and language is
cached by i18next's LanguageDetector to cookie plus localStorage.

So set a language on mobile and web stays English; set a theme or chat font on
web and it never leaves that device. The sentence said "automatically", with no
qualification.

DONE: the copy now names only what genuinely syncs from web, says plainly that
appearance, display language and chat preferences do NOT, and warns that a
change made on mobile will not appear here. Four tests check each claim against
the code that would have to provide it — the appearance store being
localStorage-backed, the detector caching to cookie and localStorage — so the
copy cannot drift back into a promise while the mechanism is absent.

The FEATURE gap stays open and recorded: making web participate means giving
appearance a cloud path it does not have. Fixing the copy stops the page lying;
it does not make the sync work.

Same call as the /contact-sales BYOK claim earlier today — when a page promises
behaviour the product lacks, correct the page immediately and record the
capability separately, rather than leaving the promise standing while the
feature is scheduled.

### Trust-boundary copy on the web privacy screen — 2026-08-21

Swept user-facing copy for absolute claims — "automatically", "never leaves",
"end-to-end", "guaranteed", "always". The `end-to-end` hit was a code comment
about a test, not an encryption claim, and the `never leaves` hits were about
Local mode, the Secure Enclave and BYOK.

Following those found a scoping problem on the WEB privacy screen. It said:

"All Local Mode conversations stay on your device and are never transmitted
to AGI servers. BYOK conversations go directly to your chosen provider using
your own API key."

Both sentences are true of the product — and neither is true of the surface the
user is reading them on. `app/settings/byok/page.tsx` states it outright:
"Hosted AGI Web does not store user provider keys; use Desktop, CLI, or VS Code
for user-managed BYOK." Hosted web has no Local Mode either. Unqualified on a
web settings screen, the paragraph invites a reader to believe this browser can
keep a conversation on-device or route it with their own key.

DONE: the copy now names the surfaces — Local Mode and BYOK on Desktop, CLI and
VS Code — and adds that hosted web has neither, so everything sent there is a
Managed Cloud request.

Deliberately a clarification, not a deletion. The sentences were accurate about
the product and the three boundaries are core to how it is explained; removing
them would have lost true information to fix a scoping error.

Four tests, including one asserting the section agrees with the BYOK page rather
than contradicting it — the two screens disagreeing is what made this findable.

### The privacy policy understated its own audit-log retention — 2026-08-21

Swept stated retention windows across the policy pages, settings copy and code
for contradictions. Account deletion is consistent at 24 hours everywhere, and
account erasure genuinely hard-deletes media immediately — it selects ALL
media_assets rows for the user with no deleted_at filter, so the Library's
separate 30-day soft-delete recovery window does not extend it. No contradiction
there.

One entry was wrong in the OTHER direction. The security-audit-log row said:

"A database routine deletes entries older than 90 days. It is run by an
administrator, not on a schedule, so treat 90 days as the policy rather than
an automatic guarantee."

`/api/cron/purge-security-audit-logs` exists and runs nightly at 02:30 UTC,
registered in vercel.json, with a test already asserting every cron route is
registered. The disclaimer was honest when written and stopped being true when
the cron landed.

DONE: the entry now says the purge is a scheduled nightly job and names it, so
the claim is checkable rather than asserted.

Four tests, including one that reads vercel.json and fails if the policy cites a
cron that is not actually registered — a policy naming a job that does not run
would be worse than the vague version it replaced.

Worth noting the direction: this understated the protection rather than
overstating it, so no user was misled into false confidence. A privacy policy
should still be accurate, and this one is careful enough elsewhere that the
stale sentence stood out.

### Generalised the "cited mechanism must exist" guard — 2026-08-21

The audit-log entry went stale because nothing tied the prose to the schedule.
Fixing that one sentence would leave the same failure available to every other
citation, so the guard is now general.

Verified the rest of the policy's citations first, all sound:
`/api/cron/enforce-billing-retention` registered at 0 1 \* \* _,
`/api/cron/purge-security-audit-logs` at 30 2 _ \* _,
`/api/cron/purge-deleted-accounts` at 30 4 _ \* \* behind the "daily scheduled
job" the deletion paragraph describes, `/api/files/{mediaAssetId}` present, and
`authenticatedMediaUrl()` defined.

Two assertions added: every `/api/cron/...` the policy names must be registered
in vercel.json, and every other `/api/...` path it names must resolve to a route
directory. Naming a job that does not run is worse than describing behaviour
vaguely — the vague version at least does not invite verification it fails.

Verified by breaking it deliberately: swapping the cited cron for
`/api/cron/not-a-real-job` failed the check naming the path; restoring passed.

One bug in my own assertion on the way: the path regex omitted uppercase, so
`{mediaAssetId}` truncated at the capital A and the test checked a path the
policy never cited. It failed loudly, which is the right direction, but it is
the same over-narrow-pattern mistake as the earlier greps.

### Cited source paths in user-facing copy are now guarded — 2026-08-21

Extended the "cited mechanism must exist" idea from crons to source paths.

First checked whether the other legal and trust pages cite API endpoints the way
/privacy does: terms, security, trust, dpa, faq, status and subprocessors cite
ZERO. The one apparent hit on /subprocessors was a false positive from my own
check — `app/api/media/video/generate/route.ts` is a source-file citation, not a
URL, and the file exists.

That pointed at the better target. These pages use source paths AS EVIDENCE: the
subprocessor table names the exact route that sends a prompt to each vendor, and
the privacy pages name the erasure inventory. A moved file turns a checkable
disclosure into an unverifiable assertion, and nothing else in the repo would
notice.

Swept all 31 such citations in rendered copy (block comments stripped, since
those are notes to the next engineer rather than claims to the reader). All 31
resolve.

DONE: a guard asserting they keep resolving, plus a non-vacuity assertion so a
regex that stops matching cannot make it pass silently. Verified by breaking it
— renaming one cited route made the check fail naming the page and the path;
restoring passed with a clean `git status`.

Second negative result in a row. Worth stating plainly: the last several sweeps
have found the codebase in better shape than the sweep assumed, and the value
has been in the guards left behind rather than in defects fixed.

## Mobile web (2026-08-21)

Audited a dimension no earlier sweep had touched: narrow-viewport behaviour.

The lead was `Sidebar.tsx` carrying zero Tailwind breakpoints while every other
key surface has at least `sm:`. That is a **false positive** — the sidebar is
driven by JS, not CSS: both shells watch `matchMedia('(max-width: 768px)')` and
swap the persistent sidebar for a modal drawer. `WebChatPage` and `WebAppShell`
each implement backdrop, Escape, focus return, `aria-modal`, and close-on
-navigation. Recorded so the next sweep does not re-flag the missing
breakpoints as a gap.

Two real defects did come out of it.

DONE: removed the dead `isMobile` prop. Both shells threaded it into the shared
`Sidebar`, which destructured it as `isMobile: _isMobile = false` and never read
it — the archived desktop sidebar had used it to close the drawer after a tap,
and the rewrite dropped the behaviour without dropping the prop. Every use it
had is now covered by the close-on-pathname effect, so the prop is gone from the
interface and from both call sites rather than reimplemented.

DONE: `WebAppShell`'s drawer left the page behind it in the tab order.
`WebChatPage` sets `aria-hidden` + `inert` on its main content while the drawer
is open; `WebAppShell` did not, so tabbing out of the open drawer walked into
the page underneath. Applied the same guard, with a test that fails without it
(verified by removing the `inert` line: `expected null not to be null`).

The pattern worth keeping: the gap was not in either drawer on its own, it was
the drift between two implementations of the same thing. Comparing siblings
found what auditing either one alone would not.

DONE: `WebAppShell` never passed `hiddenIds` to `buildAppNavItems`. The option
defaults to `[]`, so hiding a rail destination in Settings → General took effect
in the chat shell and silently did nothing on every other route — no error, no
type failure, just a toggle that half worked. Now passed, with a call-site guard
asserting both shells forward it (verified by removing the line: the WebAppShell
case fails).

Same shape as the `inert` drift above, found the same way. Two shells implement
the same surface; the defect is never inside either one, it is in what one of
them forgot to forward. Worth making this the default lens for the next sweep:
enumerate the pairs, diff what they pass, not what they render.

## Dead-prop sweep + Skills reachability (2026-08-21)

Turned last sweep's manual lens into a detector: for every optional `on*` handler
declared in a component, does any caller anywhere pass it? 43 never-passed
handlers across 673 files. Four are in the live shared `Sidebar`, and each one
renders a real control guarded on the handler's presence — built end to end and
unreachable because nothing supplies the callback: `onOpenProjects`,
`onOpenSkills`, `onModeClick`, `onProjectShare`.

DONE: `/skills` had no entry in the app rail. It is a shipped surface — in the
sitemap, linked from `/features` and `/features/plugins`, and the redirect target
of `/settings/skills`, `/settings/skills/new`, and `/ai-skills` — so a signed-in
user could reach it only by typing the URL. Added to `APP_NAV_DESTINATIONS` as a
hideable destination, which puts it in both shells at once since both build the
rail from that list. This is the same defect the Admin entry was added to fix.

DONE: a guard in both directions — every routed rail destination must have a real
`page.tsx` behind it, and Skills must stay in the rail. Verified by pointing the
href at `/skills-typo` and watching it fail.

The other three Sidebar handlers are NOT yet resolved and should not be wired
blindly: `onOpenProjects`/`onOpenSkills` look like the pre-`buildAppNavItems`
nav mechanism that `APP_NAV_DESTINATIONS` superseded, in which case the honest
fix is deletion, not wiring. `onProjectShare` gates a Share item in the sidebar
project menu that can never appear. TODO: decide delete-vs-wire for each, and
work the remaining 39 in `packages/ui/unified-chat` — that package is a live
dependency of web, so its dead handlers are dead API surface in shipped code,
not scratch.

Note on the earlier prop-diff between the two shells: of the props WebChatPage
passes and WebAppShell does not, only `hiddenIds` was a defect. `activeSessionId`,
`error`, and the usage widget are legitimately absent on non-chat routes, and
search falls back to the sidebar's own overlay. Recorded so the next sweep does
not re-open it.

## The debt was already catalogued (2026-08-21)

`scripts/config/surface-reachability-allowlist.json` carries 475 modules as
tracked unreachable debt: desktop 222, web 170, mobile 60, chrome 11, vscode 12.
Every orphan found by hand this session was already on that list. Grep-based
discovery was rediscovering a catalogue that exists — read the allowlist first.
Web's share skews to UI: 33 under features/chat, 30 under shared/ui, 18 under
shared/components.

DONE: deleted `features/chat/services/document-export.ts` — a 234-line orphan
duplicate of the live 492-line `document-export-service.ts`, which covers both
PDF and docx and is used by `ResearchReportView` and `EnhancedExportDialog`.

DONE: deleted `MermaidRenderer.tsx` and `ArtifactBlock.tsx` together, plus the
`ArtifactBlock` barrel export. Allowlist ratcheted down by four entries total.

Mermaid is NOT a gap — recorded so it is not re-raised. Web renders diagrams via
`ArtifactPreview`, which sandboxes them in an iframe with `securityLevel:
'strict'` and escapes the source. `MermaidRenderer` was a redundant second
renderer and web's only importer of the `mermaid` npm package; that dependency
may now be unused on web, but removing it touches the lockfile, which the hooks
block, so it is left as a note rather than a half-applied change.

Lesson worth keeping: unreachable is not the same as unimported. Deleting
`MermaidRenderer` alone broke the typecheck because the equally-orphaned
`ArtifactBlock` imported it. Orphans form chains; delete a chain whole or not at
all, and let the typecheck find the edges.

Every remaining live-component candidate from the dead-prop sweep is properly
guarded — `ArtifactRenderer`'s apply/export, `ChatInterface`'s usage upgrade and
dismiss, `GeneratedFileCard`'s source-session link all hide when unwired. No
fake controls.

## The orphan list holds stale code, not lost features (2026-08-21)

Worked web's 59 orphaned components from the reachability allowlist looking for
capabilities the product had lost. Probed the six that map to visible
ChatGPT/Claude features. Every one is live, by a different implementation than
the orphan:

- data export -> `PrivacySection` downloads JSON from `/api/user/data`
  (GET exists as `export const GET = exportUserDataGet`)
- drag-and-drop -> `Composer/DragDropOverlay`, mounted by `ChatComposerNew`
- voice input -> `Composer/VoiceInputButton`, mounted by `ChatComposerNew`
- tool progress -> `ToolTimeline`
- read aloud -> `ChatMessageList` owns `useTTS()` and `speakingMessageId`
- mermaid diagrams -> `ArtifactPreview`'s strict-mode sandboxed iframe

So the honest answer for future sweeps: do NOT mine this list for missing
features. It is superseded implementations. The remaining 53 are mostly template
eye-candy under `shared/ui` (particles, spotlight, bento-grid, animated-beam,
floating-dock) plus duplicate primitives, and bulk-deleting them is a product
call about whether marketing wants the design assets — NOT a bug fix. Left for
the founder.

Two method corrections worth keeping:

Filename matching does not identify supersession. Only 1 of 59 orphans has a
live same-name sibling; the rest were replaced under different names
(DropZoneOverlay -> DragDropOverlay, ExportData -> PrivacySection,
MermaidRenderer -> ArtifactPreview). Capability checks are the only reliable
test, and they cost a grep each.

A narrow grep produced a false alarm: `export async function GET` missed
`export const GET = exportUserDataGet`, which briefly looked like a broken data
export on a DPDP compliance branch. Match the assignment form too before
believing a route handler is missing.

## Competitive ledger re-verified, mostly stale (2026-08-21)

Used the founder's own `~/Downloads/agiworkforce_gap_analysis_chatgpt_claude_
2026-07-19.md` — a structured six-surface gap ledger that repo search cannot
see. It is a month old, so every claim was re-checked against current code
rather than trusted. Sampled the web items that name visible ChatGPT/Claude
behaviour. All of them have since shipped:

- WEB-CMP-001 plus menu: Add photos & files, Create image, Create video, Take a
  photo, Skills, Connectors, Plugins, project picker. Connectors and Plugins
  route to real settings panes (both keys exist in `settings-nav.ts`), and the
  gating is honest — tier and availability are checked before the user composes
  a prompt, with "Not used here" and "Checking your plan…" states.
- WEB-CMP-002 effort/thinking: web has `ComposerFooter`; the desktop path was
  the genuinely unwired one and was fixed earlier today.
- WEB-CON-002 temporary chat: fully wired — composer flag, server reads
  `is_temporary`, the request omits `conversationId` when temporary, and a purge
  cron collects them.
- WEB-RND-002 artifacts: content-keyed auto-versioning with a version chip,
  prev/next navigation and restore, plus a preview/code tab.
- read aloud (`useTTS` in ChatMessageList), drag-and-drop, voice input, tool
  progress (`ToolTimeline`), mermaid, data export — all live, verified earlier.

Conclusion for future sweeps: do not treat that ledger as a live TODO list. Its
Partial/Missing labels reflect 2026-07-19 and the web surface has moved. Re-verify
before acting on any row.

## Browser internals leaked across the whole settings surface (2026-08-21)

The offline fix in `useChatStream` was one instance of a repo-wide pattern.
`err instanceof Error ? err.message : 'fallback'` appears 292 times, and in the
settings sections the result is rendered: `Save failed: {error}`. Because a
dropped connection throws a `TypeError`, `err instanceof Error` is true and the
user reads "Save failed: Failed to fetch" — Chrome's internal wording — in
Settings. Every section that saves shares the defect.

DONE: extracted `toUserMessage(error, fallback)` and `networkErrorMessage()` to
`lib/user-error-message.ts`, and applied it to 37 sites across 13 settings
sections: Account, ArchivedChats, Billing, Capabilities, DeletedChats, General,
Notifications, Privacy, PublishedArtifacts, Reflect, Safety, SharedLinks,
TimeFocus. `useChatStream` now imports the same helper instead of its own copy,
so there is one definition of what a network failure reads like.

A real server message still wins — "Quota exceeded for this workspace" is the
actionable part and is preserved untouched. Only browser-level network wording
is replaced.

7 unit tests cover the three browsers' strings, the offline/online split, a
preserved server message, and both fallback paths. 456 tests across settings and
the chat hook are green.

Process note: the codemod inserted its import INSIDE a multi-line import block,
because "last line starting with `import `" matched `import {` rather than the
statement's closing `} from '...';`. Thirteen files were syntactically broken
until repaired by tracking brace depth. A mechanical edit across many files
needs the typecheck run before anything else, and needs to understand statement
boundaries rather than line prefixes.

## Parity sweep: enumerable surfaces are covered (2026-08-21)

Checked the remaining enumerable UI surfaces against ChatGPT/Claude. All are at
parity; recorded so later sweeps do not re-open them:

- Keyboard shortcuts: 8 bindings — Cmd+K search, Cmd+/ shortcut list, Cmd+N new
  chat, Cmd+B sidebar, Esc composer, Cmd+Shift+C copy last, Cmd+Shift+R
  regenerate, Cmd+Shift+A artifacts. Comparable to ChatGPT's set.
- Library empty states: distinguishes "Recently deleted is empty", "Nothing here
  yet" and "No files match your search", and only offers the CTA where it makes
  sense.
- Accessible status semantics (the WEB-RND-002 sub-item): `aria-live` in message
  search, generation placeholders and message bubbles, `aria-busy` on skeletons,
  and `sr-only` `aria-live`/`aria-atomic` regions in `ToolTimeline`.
- Settings: 27 sections, covering everything ChatGPT and Claude expose.

DONE, from a loose end left two sweeps ago: `MessageBubble` tracked generated
text-file loads as `Record<string, string | 'error'>`, which TypeScript collapses
to plain `string` — the union never distinguished anything. The failure sentinel
was therefore compared against file CONTENT, so a generated file whose text was
exactly "error" was silently dropped from the transcript. Failure is now a
distinct `{ failed: true }` shape and the content comparison is gone. 241
message tests green.

The `HTTP ${res.status}` throw on the same path is caught and discarded, so it
never reaches the user — checked and cleared. One residual worth a founder
decision, not fixed unilaterally: when that fetch fails the artifact simply does
not appear, with no indication that a generated file could not be loaded.
ChatGPT would offer a retry. Silent omission is defensible; it is a product call.

## CI's database-isolation guard was red (2026-08-21)

Ran the repo guards after ~100 files of edits and found `check:db-isolation`
failing — not from today's work. It runs in CI inside `check:llm-operability`
(`.github/workflows/repo-operability.yml:161`), and deploys are gated on CI
green, so this was blocking.

DONE: five `update cloud_code_agent_turns` statements in
`cloud-code-agent-service.ts` carried only `where id = $1` on a connection the
guard must assume is the BYPASSRLS owner. In practice the caller passes
`getUserScopedDb(request)` and `turnId` is internally derived, so this was
latent rather than exploitable — but nothing in the file said so, and one future
caller passing an owner connection would make it real. All five now carry
`and user_id = $N` with `owner.userId`, which was already destructured in scope.

DONE: `beta_applications` (0131, applied to production earlier today) had no
isolation decision — my own gap. RLS is the WRONG answer here and the guard's
first suggestion had to be refused: applying requires no account, so `user_id`
is nullable and most rows have no owner. A tenant policy would hide every
anonymous application from the operators the queue exists for, and its WITH
CHECK would refuse the signed-out insert that creates the row. Recorded in
CROSS_TENANT_TABLES with that reasoning instead. Account erasure still deletes
by `user_id`, owner-constrained on its own.

0131 was NOT edited — it is applied, and editing an applied migration is
permanent checksum drift. The guard reads RLS from any migration in the
directory, so a decision in the guard was the correct lever.

Guard now passes: 320 owner-connection statements across 217 modules all
owner-constrained; 103 tenant-scoped tables each with an explicit decision.
Its own unit tests pass, typecheck clean, 347 tests over the code-session
routes and services green.

Process note: `node script.mjs | tail` then `echo $?` reports TAIL's status, not
the script's. That read as a pass when the guard was still failing. Redirect to
a file and check the exit code before the pipe.

## Full guard sweep: three red, two fixed, one blocked (2026-08-21)

`check:llm-operability` chains 42 guards with `&&`, so it reports only the first
failure and hides the rest — the same masking my notes record for
`pnpm test:affected`. Ran all 42 individually to enumerate the real state.

Three were red. Two are now fixed:

- `check:db-isolation` — five unconstrained owner-connection updates plus an
  undecided `beta_applications` (fixed earlier this sweep).
- `check:repo-organization` — three untracked `CLAUDE-SECURITY-<timestamp>/`
  scan-output directories at the repo root, from the security plugin. Not
  deleted: one holds a full findings set (jsonl + md + sarif). Added
  `/CLAUDE-SECURITY-*/` to `.gitignore`, which both satisfies the guard (it
  skips gitignored entries) and stops output describing unpatched weaknesses
  from ever reaching a commit.

One is BLOCKED_BY_HUMAN and recorded in FoundersAssistance.md:
`check:env-contract` wants `EMAIL_HASH_PEPPER` and
`APPLE_APP_STORE_ENVIRONMENT` documented in `apps/web/.env.example`, a path my
permissions deny. The exact text to paste is in that file.

Flagged there beyond the guard: `EMAIL_HASH_PEPPER` unset is NOT inert.
`pseudonymizeEmail()` falls back to `legacyEmailSha256()`, and an unkeyed digest
of a low-entropy, enumerable value is reversible by dictionary — precisely what
the pepper exists to prevent. The fallback is silent, so only the founder can
confirm production has it set.

The other 39 guards pass. Recorded so the next sweep does not re-run all of
them: the suite is green except the one blocked item.

## typecheck:all was red, including one of mine (2026-08-21)

I had been verifying with `pnpm --filter @agiworkforce/web typecheck` all
session. That does not typecheck the shared packages' own tests, and I had
removed props from `@agiworkforce/ui`'s Sidebar and deleted a ProjectsView
export — changes whose blast radius is desktop, mobile and extension, none of
which web's typecheck covers. Ran `pnpm typecheck:all`: three errors.

DONE, mine: `Sidebar.collapsedNav.test.tsx` omitted the required `onRename` and
`onDelete`. The test passed and web typechecked, so nothing I had run would ever
have caught it.

DONE, not mine: two untracked test files, `connector-suggestions.test.tsx` and
`skill-version-column.test.tsx`, passed `onOpenChange` to `SettingsModal`, whose
prop is `onClose`. `adapter` and `workRole` are real props, so that was the only
error. Both now pass `onClose`; 8 tests still green. They are untracked WIP from
an earlier session, so they were not breaking CI yet — but they broke
`typecheck:all` locally and would have broken it on commit.

`pnpm typecheck:all` now exits 0 across every surface, which is also the
evidence that removing the Sidebar props and the ProjectsView export broke no
other consumer. 131 ui tests green.

Standing lesson: a filtered typecheck is not evidence for a shared-package
change. When the edit is in `packages/`, the check is `typecheck:all`.

## Goal change: production-ready across six surfaces (2026-08-21)

Founder set a new goal mid-session: production-ready apps for vscode extension,
chrome extension, desktop, cli, mobile and web. Also directed that execution be
delegated — Sonnet 5 for exploration/survey, Opus 5 for fixes and complex work,
Fable 5 orchestrating only.

Baseline established before delegating:

- `pnpm typecheck:all` — 0 errors, every surface.
- chrome extension — 120 files / 1625 tests pass.
- vscode extension — 78 files / 878 tests pass.
- web — 1969 tests under features/, 6201 under app+lib+shared.
- 42 repo guards pass, except `check:env-contract`, blocked on a founder edit
  to `apps/web/.env.example` (recorded in FoundersAssistance.md).
- MOBILE IS BROKEN: `Test Suites: 350 failed, 350 total / Tests: 0 total`.
  Every suite dies in `jest.setup.js` with `__fbBatchedBridgeConfig is not set`.
  `jest.setup.js` is unmodified in git, so this is committed breakage, and CI
  never sees it: root `test:affected` is `turbo run test --affected`, which skips
  mobile unless a mobile file changes. Zero executing unit tests on a surface the
  founder wants production-ready.

UI-gap registry (`audit/ui-gaps.csv`) re-read for this goal: 341 rows, 176 open.
Zero P0 and zero P1 remain open on ANY surface — every open item is P2/P3. Open
counts skew away from web: mobile 77, desktop 69, vscode 20, web 7, chrome 3. So
production readiness is not gated by that registry; it is gated by build/test
health and the wave-queue blockers.

## Six-surface baseline, and the UI registry is partly stale (2026-08-21)

Test health, all verified by execution:

| surface          | tests                       |
| ---------------- | --------------------------- |
| web              | 8170 pass                   |
| desktop          | 2753 pass (319 files)       |
| cli              | 1908 pass, 0 failed         |
| chrome extension | 1625 pass                   |
| vscode extension | 878 pass                    |
| mobile           | 0 execute — 350 suites fail |

`pnpm typecheck:all` — 0 errors across all six. CI runs cargo test for desktop
and cli unconditionally (ci.yml:583-584) and gates on clippy `-D warnings
-D unsafe-code` (ci.yml:630).

REGISTRY HYGIENE — `audit/ui-gaps.csv` cannot be planned off directly. Verified
against current code:

- GAP-186 (mobile billing row) — ALREADY SHIPPED. `settings/index.tsx:417-424`
  renders the plan label; landed 2026-08-16 in `1e4c47b89`, after the CSV's last
  edit. GAP-187 (shared links entry point) appears shipped in the same file.
- GAP-190 — PARTIALLY STALE. Skills was restored to the drawer 2026-08-16
  (`dfcac1635`); the residual gap is plugin install UI, which GAP-001 records as
  blocked on a backend lifecycle that does not exist.
- GAP-155 and GAP-143 — STALE against DELETED files. Both cite
  `app/(app)/code/` and `src/features/code-sessions/`, removed 2026-07-30 in
  `c21de5707`. That is BEFORE the CSV was last edited (2026-08-11), so those
  rows were generated against a stale tree or an older branch.
- The whole mobile Code/Dispatch cluster (9 of 13 rows) shares that root cause.
  The underlying UX complaints may still hold, but they now live in Companion
  (`src/features/companion/`), so every row needs re-siting before use.

Verified STILL OPEN and dispatched to an Opus agent: GAP-242 (undo/redo has a
complete backend — `undo_last`, `undo_can_undo` — and no shortcut to invoke it),
GAP-238 (no overlay-visibility preference), GAP-235 (plugins can be updated and
removed but not disabled). Each carries an explicit instruction that a preference
nothing reads is the defect, not the fix.

Next verified-open wires, ranked and not yet dispatched: GAP-224 (quick-query
hotkey hardcoded), GAP-295 (vscode context-usage chip, data layer already
computed), GAP-296 (vscode memory toggles), GAP-151 (mobile library overflow
menu), GAP-297 (vscode credits row).

## Orchestrated six-surface verification (2026-08-21)

All six surfaces verified green by execution:
web 8170 · desktop 2753 · cli 1908 · chrome 1625 · vscode 878 · mobile 3076.
`pnpm typecheck:all` — 0 errors.

RETRACTION: my earlier "mobile is broken, 350 suites / 0 tests" was WRONG about
cause. Real CI logs (run 32296058014, commit 7f3653967, 2026-08-19) show
`350 passed / 3076 passed` with the committed config. The local failure is a
stale worktree: `apps/mobile/node_modules/react-native` resolves to a
@babel/core 7.29.0 copy while the root resolves to 7.29.7, after 18ce8b587
bumped it. jest-expo's preset maps to one copy, `<rootDir>/node_modules` to the
other, so its NativeModules mocks never reach the package under test. A one-line
jest.config.js change was prepared and then WITHDRAWN as unjustified — the
config is fine; the install is stale.

DONE: a preflight at the top of `apps/mobile/jest.setup.js`, above the
`require('react-native')` on line 2. Two `require.resolve` calls; on divergence
it prints both copies and names `pnpm install --frozen-lockfile` as the remedy.
Proven in both directions on the stale tree: it fires with the readable message
instead of `__fbBatchedBridgeConfig`, and is silent when the resolutions agree.
It could NOT be a test file — verified empirically: as a test it dies in
setupFiles with 0 tests and emits nothing, because the require it guards runs
first. Known cosmetic defect: babel-plugin-jest-hoist renumbers lines, so Jest
appends a code frame pointing at an unrelated line. Accepted — the message is
first and unambiguous.

CI SCOPING, verified: `fetch-depth: 0` is set and turbo's affected selection
works correctly (dependents propagate; a lockfile change fans out to all 49
packages). The real hole is narrower: `turbo.json` has NO `globalDependencies`,
so a commit touching only `tsconfig.base.json`, `eslint.config.mjs`, `scripts/`
or root `package.json` selects ZERO test tasks and js-verify passes trivially.
No workflow runs the full suite except `release-desktop.yml:297`, on a
`v-desktop-*` tag. No merge queue. `rust-desktop-cli` is itself gated on
`native_changed`. RECOMMENDED to the founder, not implemented: a nightly
full-suite workflow (~35-50 min/day estimated) plus `globalDependencies`.

RELEASE-GATE HOLE, worse than first stated: `apps/mobile` declares four
`node --test` `.mjs` scripts jest never collects. `release-mobile.yml:96-99`
runs three of them. `test:release-store-listings` runs NOWHERE in the repo — it
has never gated a release. It asserts the checked-in release registry matches
the live App Store / Play Store, including failing when the registry claims a
published listing that does not exist, or an unpublished record still carries a
store link. All 21 tests across the four pass today, so nothing is broken; the
defect is that one of them has never run. Folding all four into the mobile
`test` script costs a measured 1.23s against a 495s jest run.

FLAKE RECORDED, not fixed: `apps/mobile/__tests__/streaming-timeout.test.ts`
uses jest's 5s default while its sibling in the same file takes `10_000`. It
timed out under `--runInBand` while a cargo release build saturated the machine,
and passes in CI. A test whose result depends on machine load is a defect.

## The gap registry is now verified — and two rules for auditing it (2026-08-21)

`audit/ui-gaps.csv` went from 176 nominal open rows to 166 verified, across six
passes covering every surface. 40+ rows corrected, no row ever touched outside
its named batch, 341 rows before and after every pass.

What the audit was actually wrong about, in descending seriousness:

1. ROWS GENERATED AGAINST A STALE TREE. GAP-155/143/171 cite mobile files
   deleted 2026-07-30 in `c21de5707` — BEFORE the CSV's own 2026-08-11 edit.
   GAP-293 and GAP-281 describe features shipped 2026-08-02 in `7548314e7`,
   nine days before it was written. Not aging; wrong when filed.
2. FALSE EVIDENCE. GAP-290 claimed "no package.json found under
   apps/extension-vscode". That file exists and registers 20 settings and 13
   keybindings. The row's core claim happened to be right, which is worse — a
   row that is right for the wrong reason survives casual checking.
3. NEGATIVE GREPS MISTAKEN FOR ABSENCE. 53 of the 166 open rows rest on an
   absence claim. Two were outright wrong (GAP-224, GAP-244 — closed Not
   Planned). Four more had wrong evidence while the verdict happened to hold.

TWO DURABLE RULES, earned rather than assumed:

- On desktop, check `src-tauri/src` before concluding absence. GAP-220/221/240
  all grepped only `apps/desktop/src` and concluded the machine-awake feature
  needed building. `sys/power.rs` already implements `SleepPrevention` via
  macOS `caffeinate` and Windows `SetThreadExecutionState`; it is simply bound
  to background-agent runs rather than remote-session lifecycle. The complaint
  is real, the mechanism exists, and the fix is far cheaper than three rows
  implied — three rows which are also duplicates of one request.
- Confirm a row's evidence cites files from the surface the row claims. GAP-217
  is filed under desktop and cites `apps/web/.../ComposerFooter.tsx`. Desktop's
  own composer was never examined; it has no effort control at all, so the row
  understated itself.

Also worth reusing: for vscode, `config.ts` (self-described as the single source
of truth for every setting the extension reads) paired with `package.json`'s
`contributes` block is a fast first-pass truth check — that pairing surfaced
four shipped features and caught GAP-290's false evidence.

GAP-253 is recorded as a fully confirmed negative: nothing for a Sites surface
exists anywhere in the monorepo, checked including apps/web.

## Mobile settled: no code defect, stale worktree (2026-08-21)

After `pnpm install --frozen-lockfile` succeeded (once the mis-generated undici
lockfile entry was regenerated), the mobile suite was re-run with
`jest.config.js` in COMMITTED state:

    node stage:  21/21
    Test Suites: 350 passed, 350 total
    Tests:       3076 passed, 3076 total
    preflight:   SILENT (0 hits for its message across the whole run)

So the committed configuration is correct and the prepared one-line change was
WITHDRAWN. `'^react-native$': '<rootDir>/node_modules/react-native'` is harmless
on a correctly installed tree, because that path and jest-expo's preset target
resolve to the same package. It selects a different copy only when the install
is stale — the trigger was commit 18ce8b587 moving @babel/core 7.29.0 -> 7.29.7
against a worktree that was never fully reinstalled.

Worse than first understood, and worth recording: the install moved BOTH links to
a THIRD store key. The root was pointing at a stale copy too, just less visibly
than apps/mobile. Four react-native directories remain in the store as orphans.

DONE: the preflight in `apps/mobile/jest.setup.js` is now validated in BOTH
directions on real trees — it fires with a readable `pnpm install` remedy when
the copies diverge, and is completely silent when they agree. That is the
strongest form of the claim, and it was only obtainable by validating it while
the broken state still existed.

DONE: `apps/mobile/package.json` folds the four `node --test` release checks into
`test`, so `test:release-store-listings` — which ran NOWHERE in the repo — now
runs on every mobile-touching change. Cost 1.23s against a 495s jest run.

Final mobile diff is two files, neither of them jest.config.js.

NOT CLEARED: `streaming-timeout.test.ts` passed on the clean tree under the same
machine load where it failed on the stale one. One green run does not clear a 5s
default sitting beside a sibling that takes `10_000`. It stays on the list as a
load-sensitivity risk.

## VS Code: a wrong premise refused, and a CI bug that was not one (2026-08-21)

GAP-295 was filed by two independent audits as "the extension computes context
usage and never displays it". BOTH WERE WRONG. `contextBudget.ts` computes a
RETRIEVAL-INJECTION cap — 3% of the window in chat mode, 5% in agent mode — and
had ZERO production callers. Grep found a file whose name sounded right and
nobody read what it computed. Building the display on it would have shipped an
authoritative-looking number measuring something else entirely.

The real value was being discarded elsewhere: `localRuntimeClient.ts:143-151`
carries runtime-measured `inputTokens`/`outputTokens` per turn and
`ChatStateManager`'s `turn_completed` handler dropped them. `inputTokens` is the
whole prompt, so input+output is the context actually occupied at end of turn.

DONE: a context-usage chip fed by those measured counts, rendered only AFTER a
turn reports. No estimate is ever shown as fact. For Auto routing and local
models the window is unknown, so it shows the measured count with NO denominator
rather than reading `MODEL_CONTEXT_LIMITS['auto']`, which is derived from a guess
about which model served the turn. Nothing renders when the value is unknown.
No setting added — the chip is either a real number or absent.

DONE: `contextBudget.ts`, its test and its re-exports deleted. Dead code
measuring the wrong quantity is a trap for the next person who greps "context",
which is precisely what happened here twice.

DONE: `TokenCounter` had the same false-authority defect in the status bar —
CUMULATIVE session tokens divided by a context window, fed by `bodyStr.length/4`
char estimates. Old behaviour reproduced with values before the fix:
`Tokens: 1.40M/1.05M — 133.3%`, 48k chars recorded as 12k tokens, $14.0000 of
fabricated cost on a model with no published rate. The char-estimate entry point
is REMOVED, not deprecated, so an estimate can no longer be fed structurally.
Cumulative tokens now show with no ratio, because the ratio is meaningless for a
session total and inventing a right one was not the fix.

CORRECTION TO MY OWN CLAIM, recorded because I reported it to the founder as a
CI failure I had introduced: I wired `check:refs` at ci.yml:332, ahead of
`turbo run build --affected` at :384, and asserted it would be permanently red
because the shared dists do not exist on a clean checkout. FALSE. `tsc -b`
BUILDS its referenced projects from source — both are `composite: true` and
declared in `tsconfig.build.json`. Proven by moving both `dist/` AND both
`tsconfig.tsbuildinfo` aside (a clean checkout has neither, both are gitignored)
and running the step: exit 0, and it built the upstream dists itself.

The local 32 errors were a TORN dist, not an absent one — `tsbuildinfo` stamped
up-to-date while `.d.ts` outputs had been deleted by a mid-session `pnpm
install`, so tsc trusted the stamp and skipped the rebuild. Absent is fine;
half-present is not. Turbo cannot reproduce it: `dist/**` and `.tsbuildinfo`
share an `outputs` array, so restores are all-or-nothing.

And the "fix" would have made the step worse. After the build, `tsc -b` finds
both projects up to date and SKIPS them — passing while building nothing from
source, which is the only thing the step exists to do. ci.yml is unchanged and
that is the correct outcome.

KNOWN GAP, deliberate: cloud-utility calls in `api.ts` are no longer counted at
all. Counting them honestly needs `stream_options: {include_usage: true}` on the
request plus usage passthrough in the apps/web completions route. Removing a
wrong number rather than replacing it was the right call; the gap is recorded
rather than papered over.

Verification: 887 extension tests (+9), 96 webview (+6), typecheck 0,
check:refs 0, lint 0 at --max-warnings=0, theme tokens pass.

## VS Code test audit: 145 vacuous tests, and what they were hiding (2026-08-21)

An audit of all 95 test files in `apps/extension-vscode` found 145 of 986 tests
asserting on logic DEFINED INSIDE THE TEST FILE. They are green regardless of
what the extension does. Count now 79.

THE METHOD MATTERS, because the first two attempts were wrong:

- A stricter static scanner flagged 298, including ten sanitizer tests already
  proven wired by break runs. Regex dataflow cannot follow a side-effect import
  into `window.agiRender`. Discarded rather than quoted.
- Replaced by MEASURED EXECUTION: @vitest/coverage-v8, per-file and per-describe,
  each against an import-only baseline so module side effects do not count.
  ~420 vitest runs.
- Two bugs in that measurement, both found and fixed: `vitest -t` treats its
  pattern as a REGEX, so every describe name containing parentheses matched
  nothing and looked dead (falsely condemning 62 tests); and coverage is blind
  to assertions on production CONSTANTS, cross-package calls, and source-text or
  artifact assertions — 84 tests a cruder pass would have condemned.

WHAT THE VACUOUS TESTS WERE HIDING, in order of seriousness:

1. A REAL DEFECT. `validateEndpointUrl` intended to allow the IPv6 loopback:
   `parsed.hostname === '::1'`. That branch can NEVER be true — WHATWG
   `URL.hostname` returns `[::1]` WITH brackets, verified directly in node. So an
   IPv6 local endpoint was silently rejected and fell back to the cloud default.
   It survived because `127.0.0.1` matches fine, so loopback appears to work and
   a reviewer sees three loopback forms and moves on. FIXED, one comparison plus
   one comment naming the constraint.

2. TWO CVE-STYLE IDENTIFIERS COVERING NOTHING. `security.test.ts` VSCODE-05
   defined `SAFE_HREF_RE` inside each of its five tests and asserted the regex
   behaved as written. The real sanitizer is DOMPurify in `webview/render.ts`,
   never imported. Worse, the property it claimed — rejecting `javascript:` —
   is delivered by markdown-it's `html: false` BEFORE DOMPurify runs, so the
   test documented a real control AT THE WRONG LAYER. What DOMPurify actually
   provides, stripping `command:` hrefs that markdown-it passes through, had no
   coverage at all. VSCODE-06 named `file_content`, a construct that appears
   nowhere in production; the real one is `<untrusted_file_reference>` whose NUL
   skip and two caps were untested.

3. A SHIPPED SETTING WITH NO COVERAGE. `inlineCompletions.maxLength` was
   registered, user-facing, and untested, behind seven green tests over a copy
   that did not truncate at all.

4. FOUR DEAD BRANCHES, all found the same way — a break run PASSED when it
   should have failed. That accident is a detector: mutate a guard, and if
   nothing fails, either the test is fake or the guard is dead. It found both.
   The largest is `isFunctionOrClassLine`'s 14-line comment/import exclusion
   prologue, measured unreachable across 16 languageIds x 22 line shapes.

5. DRIFT PROVING THE TESTS TRACK NOTHING. `withRetry`'s copy classified
   retryability on `err.message.startsWith('CLIENT:')` — a convention that
   exists nowhere. `trust-boundary`'s copy ALLOWED a host production rejects.

PRODUCTION CHANGED BY THREE LINES ALL SESSION: a `PURIFY_CONFIG` export so the
real config could be asserted rather than copied, the IPv6 comparison, and its
comment. Everything else was tests, the vscode mock, `AGENTS.md` and
`known-flaws.md`. That ratio is the point — the code was mostly fine; the
evidence about it was not.

The sanitizer's two-layer policy is now documented in
`apps/extension-vscode/AGENTS.md`, including which FORBID_TAGS entries are
load-bearing and which duplicate DOMPurify's defaults — the fact whose absence
caused a test to pass against a weakened sanitizer.

## VS Code test audit closed (2026-08-21)

Final: 145 vacuous tests -> ~30, and the 30 that remain are frozen behind the
founder's decision on whether `workspaceIndexer` survives at all.

Verified independently at close, not taken from a report:

- `pnpm --filter agi-workforce test` EXIT=0, 79 files, 871 tests, zero Errors
  lines. The exit code matters: earlier in this audit a run printed "878 passed"
  while exiting 1 on unhandled rejections, which is the same defect class the
  audit exists to find.
- `applyEdit`, `codeActionProvider` and `hoverProvider` now import production,
  and `grep` for their local `extractCodeBlock` / `provideCodeActions` /
  `provideHover` copies returns 0. The defining property of the defect — logic
  re-implemented inside the test — is gone rather than reduced.
- Production untouched by the final slice: `src/features` shows 111 insertions
  and ZERO deletions, all of it the earlier GAP-296 settings work. The mock was
  widened (CodeLens, InlineCompletionItem) rather than internals exported.

WHAT THE WHOLE AUDIT COST AND RETURNED: three production lines changed — a
`PURIFY_CONFIG` export for testability, the IPv6 comparison, and one comment
naming the constraint that made it wrong. Everything else was tests, the vscode
mock, `apps/extension-vscode/AGENTS.md` and `docs/agent-context/known-flaws.md`.

That ratio is the finding. The extension's code was substantially correct; the
evidence about it was not.

STILL OPEN, recorded rather than fixed:

- `workspaceIndexer` runs `executeDocumentSymbolProvider` on every file save and
  writes up to 500 files of symbols into `workspaceState` that nothing reads.
  Founder decision: delete, or wire `getRelevantContext` into chat context.
- Three dead guards (inline-completion empty-input, paywall inner suppression,
  `isFunctionOrClassLine`'s 14-line prologue measured unreachable across 352
  language x line combinations). Cosmetic.
- The SSE `startsWith('data:')` filter cannot be proven wired — its removal is
  masked downstream by JSON.parse throwing into an existing catch. The test
  proves the outcome, not the filter.
- `extension.ts:140`'s configuration-change handler (restarting local runtimes
  on `cliPath`, reconciling consent on `agent.mode`) has no coverage. The
  tautologies that pretended to cover it named three different keys.
