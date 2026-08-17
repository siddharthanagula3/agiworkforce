# ExecutionPlan

Status: Current
Owner: Platform lead
Last updated: 2026-08-16

The open execution queue, ordered consequence-to-effort. Completed items are
removed rather than annotated — `CHANGELOG.md` carries verified slices and
`docs/agent-context/known-flaws.md` carries durable defects. 28 items remain:
2 in progress, 8 blocked, 3 reverted, 1 partial, and the unstatused entries in
the demo-readiness and Gold Goal cycles.

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

- Status: REVERTED (2026-08-09) — REVERTED. The fix was inert: the fail-closed branch could not fire, and the numeric arm of `automationsPerDay` has no producer. Reverting exposed the real finding, which is larger than this item — `hasFeature`, `checkFeatureAccess`, `checkAutomationLimit`/`checkApiCallLimit`/`checkStorageLimit`, eight grace-period helpers and the whole `constants/pricing.ts` module have zero production callers. That is a dead subsystem, not a limit bug; it needs its own item rather than a patch to one constant. Revert verified byte-identical to HEAD by checksum.
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
