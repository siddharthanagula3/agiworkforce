---
id: "F079-07"
type: "feature"
title: "Health, fallback and switch offers"
aliases: ["Health-aware fallback", "Fallback chain", "--fallback-model", "Switch model", "Use <image model>", "Switch to a cloud model", "Switch to <model>", "Continue with <model>", "managed_failover", "S79.20", "S79.21"]
area: "79 Routing and model-neutral orchestration"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S79.20", "S79.21"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-observability-and-operations", "F079-08", "file:packages/ai/routing/src/auto.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F079-07 Health, fallback and switch offers

When a model route is failing, Auto ranks it lower, and the Cloud server moves a failing call to another route or model before any text reaches the person. Separately, apps show buttons that let the person pick another model. The CLI rotates down a user-written model chain on transient errors.

Area: [79. Routing and model-neutral orchestration](README.md). Requirement items: [S79.20](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7920), [S79.21](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7921).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Two linked parts. (1) Health and fallback: Auto routing demotes routes with recent failures and builds a fallback plan of other hosts of the same model first, then other models (packages/ai/routing/src/auto.ts:757-764, :937-960, :1581-1612). On Cloud the server rotates through that plan on availability failures (apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:1-58). The CLI rotates down a chain the user typed (apps/cli/src/routing/fallback.rs:20-116). (2) Switch offers: buttons that open or apply a different model after a refusal, a failure, a limit or a capability mismatch. The person always clicks; nothing flips by itself.

**Why it exists.** One provider outage or rate limit should not end a turn, and a person who is blocked should see a way out in one click. Rotation only happens inside rules for trust, plan and data policy, so a fallback never crosses a boundary the person did not accept [inferred from the guards in managed-failover.ts:1-58 and apps/cli/src/agent/chat.rs:2114-2127].

**Who uses it.** Every person using Auto or a pinned model on Web, Desktop (hosted web), Mobile, Chrome and VS Code on Cloud; CLI users who set a model chain; operators who tune the kill switches.

**Problems it solves**

- A failing or rate-limited provider route no longer ranks first for the next request.
- A failed Cloud call can be answered by another route or another model before the first byte reaches the person.
- A blocked person (image edit with a model that cannot edit, Local model with attachments, free limit reached, refusal) gets a one-click path to another model.
- CLI users avoid the rate-limit cliff by naming backup models.

**Use cases**

- A provider returns server errors; Auto answers on another host or model and the answer carries a notice that a backup answered.
- On Web the person attaches an image in image mode with a model that cannot edit; the notice offers 'Use <model>'.
- In the CLI the person runs agi with a comma list of models; a 429 on the first rotates to the second and prints a 'Falling back' line.
- In VS Code a stream is interrupted; the error card shows 'Switch model' which opens the model picker.

## 2. User experience

**Where to find it**

- Web (and Desktop, which shows the hosted web app per doc: AGENTS.md section 5): notices above the composer in apps/web/features/chat/components/Composer/ChatComposerNew.tsx; 'Switch to <model>' on the inline paywall card in apps/web/features/chat/components/InlinePaywallCard.tsx.
- Mobile: native alert with 'Cancel' and 'Use <model>' for a blocked image request (apps/mobile/src/features/chat/actions/alertBlockedImageRequest.ts:5-21).
- CLI: error hints and the --fallback-model flag (apps/cli/src/errors.rs:549,619-623; apps/cli/src/lib.rs:331).
- VS Code: 'Switch model' action and a 'Continue with <model>' alternative on a failed turn (packages/ui/i18n/locales/en/vscode.json:61,468).
- Chrome side panel: 'Switch model' button on a failed bubble (apps/extension/_locales/en/messages.json:1036).

**Before you start**

- Cloud fallback needs a signed-in Cloud turn; the server does the rotation (apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:1-58).
- CLI rotation needs a chain from a comma list in --model, --fallback-model or config (apps/cli/src/routing/fallback.rs:42-64; apps/cli/src/config.rs:1450,1514).
- Switch buttons need a model the plan includes; the alternative model is chosen by the app, not by the person.

**Screens and controls**

- Web image-edit conflict notice: text '<model> cannot edit an attached image.' with buttons 'Use <image model>', 'Remove attachment(s)', 'Leave image mode' (ChatComposerNew.tsx:5273-5300).
- Web Local-model notices with the button 'Switch to a cloud model' for a Local model with a new project chat and for a Local model with attachments (ChatComposerNew.tsx:5311-5320, :5340-5349).
- Web inline paywall card: 'Switch to <model>' and the line '<model> is not limited by this and can answer now.' (InlinePaywallCard.tsx:248-262, :457-470).
- Mobile alert: title and message from the decision, 'Cancel', 'Use <model>' (alertBlockedImageRequest.ts:14-20).
- VS Code error card: 'Switch model' for provider_unavailable, provider_rate_limited, free_allowance_exhausted, stream_interrupted, refused_by_safety (errorPresentation.ts:471-480); 'Continue with <model>' when an alternative is given (errorPresentation.ts:495-503).
- Chrome bubble footer: 'Switch model' (bubbles.ts:320-329).
- CLI: terminal lines '↘ Falling back: <from> → <to> (<reason>)' (apps/cli/src/agent/chat.rs:2133-2137).

**Journey**

1. Web or Mobile blocked case: the person tries a request the chosen model cannot do. The app shows the notice or alert instead of sending.
2. The person reads the plain sentence and clicks 'Use <model>' (or 'Switch to a cloud model'). Mobile sets the image model in the chat view store; Web sets the image model id (ChatComposerNew.tsx:5285-5291).
3. Failed call on VS Code or Chrome: the error card shows the failure and 'Switch model'. Clicking opens the model picker (ChatStateManager.ts:1908-1911; side_panel.ts:5957); the person chooses and sends again.
4. Failed call on Cloud with Auto: the server rotates first; if a backup answered, the answer shows a notice and the response headers carry the reason (packages/contracts/types/src/chat-fallback-reason.ts:1-60).
5. CLI: the person runs 'agi -m a,b,c'. On a rate limit, network or server error the CLI prints a line naming the new model and continues. On other errors it stops and prints a hint.

**What the person sees and gets**

- Web answer notice built from the fallback reason code (describeFallbackReason, packages/contracts/types/src/chat-fallback-reason.ts) rendered in a status box with test id fallback-reason-notice (apps/web/features/chat/components/messages/MessageBubble.tsx:3519-3525).
- CLI JSON event FallbackTriggered with from, to and reason (apps/cli/src/lib.rs:6350-6362; apps/cli/src/agent_events.rs:57).
- Cloud response headers X-AGI-Fallback-Reason and X-AGI-Resolved-Model (packages/contracts/types/src/chat-fallback-reason.ts:1-2).

**Settings**

- AGI_ROUTING_OBSERVED_HEALTH: kill switch for health ranking; on unless set to 0, false or off (packages/ai/routing/src/routing-stages.ts:1-20; auto.ts:766-769).
- AGI_ROUTE_HEALTH_*, AGI_ROUTE_BREAKER_*, AGI_MODEL_LOCKOUT_*, AGI_CREDENTIAL_COOLDOWN_* names tune windows and breaker thresholds (packages/ai/routing/src/route-health-store.ts:48-71). Values not recorded here.
- CLI: --fallback-model, comma list in --model, config key fallback-model (apps/cli/src/lib.rs:331; apps/cli/src/config.rs:1450,1514).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Observed route health lowers a route's rank by failure band and latency band; it also penalises routes that did not honour a capability the request uses (auto.ts:900-960, :1285).
- The fallback plan keeps up to 2 other hosts of the same model before a different model, up to 4 fallback routes (auto.ts:757-764, :1581-1612).
- If the preferred route is parked, Auto picks a dispatchable slot with reason health_fallback (auto.ts:2076-2092).
- Observed health is supplied from stored snapshots on the Cloud request path (apps/web/lib/server/managed-cloud-routing/routing-request.ts:127; request-processor.ts:2775-2800).
- Cloud server rotates on availability failures before the first byte, across models only for Auto, never after tool-call ids bind the turn to a provider (managed-failover.ts:1-58).
- CLI FallbackChain rotates on rate-limit, network, stream and 5xx errors by default, not on bad auth or bad requests (apps/cli/src/routing/fallback.rs:103-116); the loop refuses to move a Local session to a cloud provider and restores state (apps/cli/src/agent/chat.rs:2114-2127).
- CLI Auto on an own-key session installs a fallback chain built from the Auto selection (chat.rs:707-717).
- Switch offers exist on Web (image edit, Local model, paywall), Mobile (blocked image request), VS Code (failure codes), Chrome (failure bubble) and CLI (error hints) as listed under user_experience.

**Incomplete**

- The CLI 'switch offer' is text telling the person to re-run with --fallback-model or /model; there is no button (apps/cli/src/errors.rs:549,619-623,648).
- A chain given to the CLI rotates automatically without asking at each failure; the person opted in by writing the chain (fallback.rs:42-64) [inferred reading of 'explicit'].
- Mobile: only the blocked-image switch offer was found; no failure-triggered switch button found (callers: apps/mobile/app/(app)/chat/[id].tsx:742,770; apps/mobile/app/(app)/(tabs)/chat.tsx:146).

**Present but disconnected or switched off**

- FallbackOn::RateLimit and FallbackOn::Any exist but the enum carries allow(dead_code) and parse only builds the default Transient value (apps/cli/src/routing/fallback.rs:14-24,42-54).

**Not available**

- Desktop-specific (native Tauri) code for these buttons was not found; the public Desktop shows the hosted web app (doc: AGENTS.md section 5).
- Local mode on Mobile and Desktop: no automatic fallback to Cloud was found; the CLI explicitly refuses it (chat.rs:2114-2127). Mobile Local behaviour for failures is unknown.

## 4. Required behaviour

**Established requirements**

- Observed health of each route lowers its rank; can be turned off with AGI_ROUTING_OBSERVED_HEALTH=0. (source: S79.20 brief; packages/ai/routing/src/auto.ts:937)
- Same-model fallbacks come first, then another model. (source: S79.20 brief; auto.ts:764)
- CLI chain rotates only on rate-limit, network or server errors, not bad auth or bad requests. (source: S79.20 brief; apps/cli/src/routing/fallback.rs:12-26)
- Unhealthy routes are demoted and failed calls fall back to healthy alternatives. (source: S79.20 brief 'Should')
- When another model would work better, the user is offered an explicit one-click switch; nothing flips by itself. (source: S79.21 brief 'Should')
- Local, own key and Cloud are separate trust boundaries; nothing silently routes a Local turn to another boundary. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. With observed health on, a route with a high recent failure rate ranks behind a healthy route for the same model request.
2. With AGI_ROUTING_OBSERVED_HEALTH set to off, the failure and latency penalty is zero.
3. A Cloud Auto request whose first route fails with an availability error is answered by another route or model and the response carries X-AGI-Fallback-Reason.
4. A CLI chain 'a,b' moves to b on a 429, 5xx or network error, and does not move on an authentication error.
5. A CLI Local session never moves to a cloud model through the chain; it stops with an error.
6. On Web, with an image attached in image mode and a model that cannot edit, the notice shows 'Use <model>' and clicking it changes the image model without sending.
7. On VS Code and Chrome, a failed turn of an eligible kind shows 'Switch model' and clicking opens the picker without changing the model by itself.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A fallback must stay inside the same trust mode and the same data policy (training opt-out, region, workspace policy) [inferred from managed-failover.ts:1-58].
- A switch offer must name the model it will use when the app already knows it [inferred from 'Use <model>' wording].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give the CLI a one-keystroke 'switch model' prompt on a failed turn in the TUI instead of only text hints.
- [proposed] Give Mobile a failure-time 'Switch model' action like VS Code and Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | resolveAutoRoute and fallback plan | `packages/ai/routing/src/auto.ts` | Ranks routes, applies observedRoutePenalty (937), builds fallbacks (1581), picks health_fallback (2091). |
| config | routingStageEnabled | `packages/ai/routing/src/routing-stages.ts` | Kill-switch reader for AGI_ROUTING_OBSERVED_HEALTH, canary and shadow stages. |
| store | route health store | `packages/ai/routing/src/route-health-store.ts` | Outcome memory for routes, providers, credentials; breaker configuration names. |
| service | runtime state | `packages/ai/routing/src/runtime-state.ts` | Declares the health snapshot and why a route is unavailable. |
| service | managed-cloud routing request | `apps/web/lib/server/managed-cloud-routing/routing-request.ts` | Feeds observed route health into the Auto request on Cloud. |
| service | request-processor health resolution | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Reads route and credential snapshots (2775-2800). |
| service | managed failover | `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts` | Rotates routes or models on availability failures; sets fallbackReason managed_failover (369) and openrouter_route_failover (779). |
| endpoint | chat completions route | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Records route outcomes (recordRouteOutcome, 378) and adds fallback headers (920-921). |
| service | fallback reason contract | `packages/contracts/types/src/chat-fallback-reason.ts` | Header names, reason codes, plain-language descriptions. |
| component | Web composer notices | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Image-edit conflict and Local-model notices with switch buttons. |
| component | Inline paywall card | `apps/web/features/chat/components/InlinePaywallCard.tsx` | 'Switch to <model>' when a limit blocks the chosen model. |
| component | Web fallback notice | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Shows describeFallbackReason under the answer (831-840, 3519). |
| hook | Web stream handler | `apps/web/lib/hooks/useChatStream.ts` | Reads the response headers into message metadata (1998, 2640). |
| service | Mobile blocked-image alert | `apps/mobile/src/features/chat/actions/alertBlockedImageRequest.ts` | Alert with 'Use <model>'. |
| service | Mobile fallback notice | `apps/mobile/src/features/chat/utils/fallbackNotice.ts` | Imported by apps/mobile/services/streaming.ts:65 to describe server fallbacks (file contents not opened). |
| service | VS Code error presentation | `apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts` | Chooses 'Switch model' codes and the 'Continue with' alternative. |
| service | VS Code chat state manager | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Handles switch-model by opening the model popover (1908). |
| component | Chrome error bubble and handler | `apps/extension/src/features/side-panel/bubbles.ts` | 'Switch model' button (320); the action is chosen in side_panel.ts:9757. |
| service | CLI fallback chain | `apps/cli/src/routing/fallback.rs` | Parses chains, decides rotation, names reasons. |
| service | CLI chat rotation loop | `apps/cli/src/agent/chat.rs` | Retries, rotates, guards the privacy boundary (2056-2150). |
| service | CLI error hints | `apps/cli/src/errors.rs` | Hints naming --fallback-model and /model. |
| event | FallbackTriggered | `apps/cli/src/agent_events.rs` | JSON event emitted on rotation (lib.rs:6350). |
| command | --fallback-model flag | `apps/cli/src/lib.rs` | Flag at 331; chain built at 6266 and 8064. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Cloud turn: the web route builds an Auto routing request with stored route and credential health snapshots. | our servers | apps/web/lib/server/managed-cloud-routing/routing-request.ts:127; request-processor.ts:2775-2800 |
| The resolver ranks admissible routes, adds the observed penalty, and builds up to four fallback routes (same-model hosts first). | our servers | packages/ai/routing/src/auto.ts:1285,1581-1612 |
| The request goes to the provider; on an availability failure before the first byte the server tries the next plan entry, re-checking plan, data policy and training opt-out per hop. | our servers | managed-failover.ts:1-58 |
| The provider answers the turn. | outside service | managed-failover.ts:1-58 (provider streams) |
| The outcome of each attempt is written back to the route health store so the next request is ranked with it. | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:363-385 |
| Response headers carry the fallback reason; the client stores it in message metadata and shows a notice. | device and our servers | route.ts:920-921; apps/web/lib/hooks/useChatStream.ts:1998-2000 |
| CLI turn with a chain: a failed call is classified; if the error is transient the loop rotates to the next model after validating the privacy boundary, and calls the provider again. | device | apps/cli/src/agent/chat.rs:2056-2150 |
| Switch button click in Web, Mobile, VS Code or Chrome only changes the selected model or opens the picker. | device | ChatComposerNew.tsx:5285-5291; alertBlockedImageRequest.ts:17-19; ChatStateManager.ts:1908-1911; side_panel.ts:5957 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Route and provider outcome samples (class of success or failure) | A key-value store supplied by apps/web (sorted sets with expiry) | Shared across server instances through the store | Expires by the AGI_ROUTE_HEALTH_WINDOW_MS window; value not recorded here (route-health-store.ts:24-71) |
| Fallback reason on an answer | Message metadata (fallbackReason) on the device and in the saved conversation | With the conversation on Web | With the message; deletion rules for messages are in SYS-sync-and-continuity (unknown here) |
| Routing decision trace including fallback model and route ids | table routing_decision_traces (apps/web/db/neon/0212_routing_decision_traces.sql) | Server only | Retention days by AGI_ROUTING_TRACE_RETENTION_DAYS (default recorded in code as 30; rollout-evaluation-service.ts:21-40); deleted on account erasure (apps/web/lib/server/account-erasure.ts:157) |

**Models and providers.** Models come from the generated catalog and the Auto policy slots, not from the feature code. The fallback plan draws only on slots the plan tier is allowed (auto.ts:693). Providers are tried by route; credentials can be cooled down (route-health-store.ts:64-71). The CLI chain holds model names the person typed; provider is detected from the name (apps/cli/src/agent/chat.rs:75-86).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud fallback and Cloud switch offers need a signed-in Cloud turn. CLI chains work with own keys without sign-in; Managed Cloud in the CLI needs 'agi login' (apps/cli/src/errors.rs:621-624). |
| Permissions | Fallback candidates are re-checked at attempt time against plan tier, workspace model policy and provider training opt-out (managed-failover.ts:1-58). The CLI refuses a rotation that would cross the Local boundary (chat.rs:2114-2127). |
| Subscription | The fallback plan only uses slots the tier is allowed (auto.ts:693). The paywall card offers an alternative model not covered by the limit (InlinePaywallCard.tsx:457-470). Billing for a rotated Cloud turn is one reservation settled at the price of the model that served (managed-failover.ts:1-58). |
| Limits and metering | At most 4 fallback routes, 2 same-model hosts before another model (auto.ts:757-764). Concurrency limits belong to the plan (not this feature). |
| Feature flags | AGI_ROUTING_OBSERVED_HEALTH (kill switch, on by default); route health, breaker, lockout and credential cooldown variables listed under settings. |
| Model compatibility | Capability fallback: a model that cannot handle the request is replaced with reason capability_fallback when the request allows it (auto.ts:1822-1834). The image-edit offer depends on the media catalogue saying a model supports edit (ChatComposerNew.tsx:1372-1376). |
| Provider restrictions | Candidates whose provider may train on inputs are skipped when the account opted out (managed-failover.ts:1-58). Which providers are tried: provider folders under packages/ai/providers; exact set per request comes from the registry. |
| Local mode | No fallback to another boundary. Web shows 'Switch to a cloud model' as an explicit person-initiated switch for a Local model with attachments or a new project chat (ChatComposerNew.tsx:1588-1592,5311-5349). The CLI Local session restores state and stops rather than egress (chat.rs:2114-2127). Mobile and Desktop Local failure handling: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Observed health stage switched off | Only the unhonoured-capability penalty remains; failure and latency penalties are zero. | auto.ts:937-960 |
| No samples for a route | No penalty; never tried is not treated as never failed. | packages/ai/routing/src/__tests__/observed-health-ranking.test.ts:49,90 (test names) |
| Failure after the first byte or after tool-call ids exist | Cloud turn stays on its provider; rotation only before the first byte. | managed-failover.ts:1-58 |
| CLI error is auth or bad request | No rotation; hint printed. | apps/cli/src/routing/fallback.rs:103-116 |
| CLI fallback model not recognised | Refuses silent provider routing, tries next entry. | apps/cli/src/agent/chat.rs:2108-2113 |
| CLI continuation after tool batch | Retry only, no rotation. | apps/cli/src/agent/chat.rs:2176-2184 (doc comment) |
| Web notice dismissed | Fallback notice can be dismissed per message (state fallbackNoticeDismissed). | apps/web/features/chat/components/messages/MessageBubble.tsx:828 |
| Offline, timeout, cancel on the switch buttons | not handled in the code for the buttons themselves (they only change local selection); stream timeouts are handled elsewhere. | ChatComposerNew.tsx:5285-5291 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/routing/src/__tests__/observed-health-ranking.test.ts`: Penalty is on by default, kill-switch values, failure above latency, no samples.
- `packages/ai/routing/src/__tests__/fallback-plan.test.ts`: Fallback plan building (file name; contents not opened).
- `packages/ai/routing/src/__tests__/pinned-model-fallback-plan.test.ts`: Fallback plan for a pinned model (file name; contents not opened).
- `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.test.ts`: Managed rotation (file name; also .policy, .free-lane, .training-opt-out variants).
- `apps/cli/src/routing/fallback.rs`: In-file tests: parse, with_fallback once, rotation never retries the failed model, rate-limit-only mode, 5xx but not 4xx.
- `apps/cli/src/errors.rs`: In-file tests that hints name --fallback-model.
- `apps/web/features/chat/components/Composer/ChatComposerNew.localAttachments.test.tsx`: Refusal with both ways out, clears when attachments removed or cloud model chosen.
- `apps/extension/__tests__/model-refusal-action.test.ts`: Chrome offers switch-model except for withheld codes.
- `apps/extension-vscode/src/__tests__/errorPresentation.webview.test.ts`: VS Code error presentation (file name; contents not opened).

**Test scenarios**

- **Health demotes a failing route**
  1. Feed two routes of one model, one with a high observed failure rate.
  2. Resolve Auto.
  - Expected: The healthy route is chosen first; the failing one is a later fallback.
- **Kill switch**
  1. Set AGI_ROUTING_OBSERVED_HEALTH to off in a test environment.
  2. Resolve the same request.
  - Expected: Ranking ignores failure and latency bands.
- **Cloud rotation**
  1. Make the first provider route return a server error before any text.
  2. Send an Auto turn on Web.
  - Expected: Another route answers; X-AGI-Fallback-Reason is present and the notice shows.
- **CLI chain**
  1. Run agi with -m a,b where a returns 429.
  2. Watch output.
  - Expected: A line '↘ Falling back: a → b (rate limited)' and b answers; with a bad key on a, no rotation.
- **Web image conflict**
  1. Enter image mode, attach an image, pick a model that cannot edit.
  2. Click 'Use <model>'.
  - Expected: Image model changes, nothing is sent.
- **Chrome and VS Code switch**
  1. Cause a provider error.
  2. Click 'Switch model'.
  - Expected: Model picker opens; model unchanged until chosen.

**Where to look when it fails**

- Log line '[routing-trace] decision was not persisted' when a trace write fails (routing-decision-trace-service.ts:186).
- Log 'Managed failover: resilience observation was not recorded' (route.ts:381-385).
- Table routing_decision_traces columns reason, fallbacks (inside trace), outcome, error_code.
- Metric dashboard 'model-routing' (apps/web/lib/observability/dashboards.ts:847).
- CLI stdout line 'Falling back'; JSON event FallbackTriggered.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md)
- Desktop: [70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md)
- Mobile: [70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md)
- CLI: [70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md)
- VS Code: [70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md)
- Chrome: [70-qa/test-plans/chrome/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/chrome/079-routing-and-model-neutral-orchestration.md)

## 10. Gaps and dependencies

- **Brief says Chrome has no switch offer; code has one.** Affects: Chrome; the knowledge base itself. Evidence: apps/extension/src/features/side-panel/bubbles.ts:320; apps/extension/src/side_panel.ts:9757-9772. Work needed: Correct the brief status.
- **Web 'Use <model>' and 'Switch to a cloud model' are before-send conflict notices, not failure offers; a failure-time switch offer on Web is only the paywall card.** Affects: Web, Desktop. Evidence: ChatComposerNew.tsx:5273-5349; InlinePaywallCard.tsx:248-262. Work needed: Decide whether failure cards on Web need a 'Switch model' button like VS Code and Chrome.
- **CLI switch offer is text only.** Affects: CLI. Evidence: apps/cli/src/errors.rs:619-623. Work needed: Optional interactive prompt in the TUI.
- **Mobile has only the blocked-image switch offer.** Affects: Mobile. Evidence: alertBlockedImageRequest callers at chat/[id].tsx:742,770. Work needed: Add failure-time offer if required by parity.
- **No evidence of health-based Auto or fallback on Local inference (Mobile, Desktop).** Affects: Mobile, Desktop Local mode. Evidence: No code found in the files opened. Work needed: Establish what Local does on a failed on-device model.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-observability-and-operations
- F079-08
- file:packages/ai/routing/src/auto.ts

## Unknown

- Whether a failure-time switch button exists on Web outside the paywall card (not searched in every message component).
- What Mobile and Desktop Local mode do on an on-device failure.
- Contents of apps/mobile/src/features/chat/utils/fallbackNotice.ts (only the import was seen).
- Which of the CLI's fallback chain modes (RateLimit, Any) are reachable from config.
- Whether the AGI_ROUTING_OBSERVED_HEALTH switch is set in any deployed environment.
