# CAP-052 Artifact Runtime Bridge — Security Design Review

Status: Draft (design-only; no runtime code changed)
Author: Security design review (subagent)
Date: 2026-08-05
Scope: Design document under `docs/design/`. This review does not build the
bridge and does not modify any runtime code.
Decision gate: The parity ledger's Creation-four approvals bullet
(`docs/current/parity-implementation-matrix.md`, "Creation-four approvals
(founder, 2026-08-05)") makes this review a hard precondition for CAP-052.
This document IS that precondition.

## 0. What "WEB-13" refers to

WEB-13 is the **iframe-sandbox-escape** finding from the 2026-05-19 `apps/web`
security audit batch (`CHANGELOG.md`, section "[Unreleased — apps/web security
audit batch] — 2026-05-19"). It was closed by moving LLM artifact rendering off
the app origin onto a dedicated cross-origin renderer with `connect-src 'none'`
and a parent-origin allowlist, backed by a CI grep regression test
(`apps/web/__tests__/security/iframe-sandbox-regression.test.ts`) that fails if
any TSX reintroduces `allow-scripts allow-same-origin`.

Two similarly named items are **not** WEB-13 and must not be substituted for it:

- **SEV-WEB-13** — rate-limiter Redis enforcement, deferred as operational in
  that same batch, and the env-drift/alerting gap where
  `UPSTASH_REDIS_REST_URL`/`TOKEN` were absent from the Vercel environment
  (`docs/agent-context/known-flaws.md`
  `PROD-ENV-DRIFT-ALERTING-GAP-2026-07-11`). Backing-store availability, not
  artifact sandbox egress. It is relevant to this review only through C5.
- **WEB-13 in the remediation register**
  (`docs/remediation/waves/W09-web-application-and-shared-ui-surfaces.md`) — a
  `/connectors` dev-server hang, a separate ID namespace.

The precondition is therefore concrete and directly topical: CAP-052 puts a
network verb back inside the sandbox WEB-13's fix sealed. "WEB-13 stays closed"
means the cross-origin renderer origin, `connect-src 'none'`, and the
same-origin refusal in `isThisAppsOwnOrigin()` all survive the bridge intact —
restated as condition 5 of §4, and verified in §1. On top of that, this review
defines the additional bar CAP-052 must clear.

## 1. What CAP-052 proposes and why it is security-sensitive

CAP-052 ("AI-powered artifacts") gives a rendered artifact the ability to
**trigger billed model inference and receive model output** at runtime — an
artifact that can "ask the model" and act on the answer.

Today the artifact renderer has no such primitive, by deliberate design. The
existing trust envelope (attack-surface map + verified files):

- **Egress is blocked.** `connect-src 'none'` in the renderer CSP
  (`infrastructure/sandbox/index.html` meta; mirrored in
  `packages/ui/unified-chat/src/lib/artifact-sandbox.ts:55-68` `ARTIFACT_CSP_CONTENT`
  and `html-sanitizer.ts`). Scripts inside an artifact cannot `fetch`/XHR/
  WebSocket anywhere, including back to the app
  (`apps/desktop/src-tauri/src/ui/artifact_sandbox.rs:35-38` documents this as
  "the egress block").
- **The sandbox is cross-origin and credential-free.** Desktop serves it from
  the dedicated `artifact://localhost` scheme (`artifact_sandbox.rs`); web from
  `NEXT_PUBLIC_SANDBOX_ORIGIN`. Artifact scripts cannot read the app DOM,
  `localStorage`, cookies, or the IPC bridge. `isThisAppsOwnOrigin()`
  (`artifact-sandbox.ts:295-298`) actively refuses to use the app's own origin
  as the sandbox origin, because same-origin + `allow-same-origin` would defeat
  the sandbox by spec.
- **The message contract has no model verb.** Exactly three postMessage verbs
  exist — `sandbox-ready`, `render`, `render-complete`/`render-error`
  (`index.html:333-359`, `artifact-sandbox.ts:325-367`,
  `ArtifactSandboxFrame.tsx:152-219`). The renderer holds **zero** session or
  artifact-identity state.
- **The renderer serves anonymous public viewers too.** The same file and CSP
  back the unauthenticated public surface
  `apps/web/app/shared-artifact/[token]/page.tsx` (`PublishedArtifactView`),
  where a 144-bit token is the sole read grant.

Artifact content is **untrusted**: it is model-authored or user-authored HTML/
React/SVG/Mermaid. CAP-052 would let that untrusted content reach a **billed,
credentialed, side-effectful** capability (managed inference). To do so a bridge
must breach at least one of four boundaries the map enumerates: (a) breach
`connect-src 'none'` or add a new postMessage verb via the parent; (b) invent an
artifact-identity concept the renderer lacks; (c) route through the parent's
session (the sandbox has no credentials); (d) cross into the anonymous public
`/shared-artifact/[token]` surface. Any bridge that "just works" has almost
certainly weakened one of these, which is precisely why this is
security-sensitive.

## 2. Threat model

Assets: managed-inference spend (real money), the viewer's authenticated
session, model output, and the app's DOM/storage/IPC. Primary adversary:
**the author of an artifact's content** (a malicious or prompt-injected model,
or a user who crafts/publishes an artifact) attacking **a different viewer** who
opens or is shown that artifact. Secondary: a network/tab attacker forging
messages.

| ID  | Threat                                                | Mechanism grounded in the surface                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **Sandbox escape → app DOM/storage/IPC**              | If a bridge is built by relaxing the cross-origin invariant (e.g. same-origin sandbox to "simplify" wiring), `sandbox="allow-scripts allow-same-origin"` (`ArtifactSandboxFrame.tsx:232`) becomes a full escape. The lone guard is `isThisAppsOwnOrigin()` (`artifact-sandbox.ts:295-298`). A model-call bridge that needs app-side state is the exact pressure that erodes this.                                                                                                  |
| T2  | **Prompt-injection laundering**                       | A published/shared artifact silently issues model calls on the **viewer's** behalf and billing when opened. Because the sandbox holds no credentials, any call must proxy through the parent + the viewer's cookie/session (`managed-usage-request-service.ts` is `userId`-scoped). The artifact author never pays; the viewer does. This is the headline abuse.                                                                                                                   |
| T3  | **Consent-fatigue / auto-click bypass**               | Even with a consent prompt, artifact script drives a full DOM. If the prompt renders inside or over the artifact frame, or can be satisfied by a synthetic event/`click()` the artifact dispatches, the "consent" is auto-clicked. Desktop's `NEVER_REMEMBERABLE` list (`tool_confirmation.rs:33-56`) exists precisely because privileged transitions must re-prompt fresh — there is **no web/public analog** for artifact-originated calls.                                      |
| T4  | **Per-call billing abuse / cost-amplification loops** | An artifact loops `while(true)` issuing model calls, or fans out N calls per render, or chains "call → parse output → call again." Each `reserveManagedUsageRequest` bills the viewer. Session/weekly caps exist (`getPlanSessionUsageCapCents`/`getPlanWeeklyUsageCapCents`, GOV-1 at `managed-usage-request-service.ts:194-236`) but they are the viewer's own plan caps — an artifact can burn the viewer's entire allowance without a per-artifact ceiling.                    |
| T5  | **Data exfiltration via model round-trips**           | `connect-src 'none'` blocks direct network egress, but a model-call bridge is, by construction, a sanctioned egress channel. Artifact reads secrets/PII visible in its own render input, encodes them into a prompt, and the response (or the mere act/timing/content of calls to an attacker-influenced model/tool) exfiltrates them — bypassing `connect-src 'none'` entirely because the bridge is the exit. Lethal-trifecta shape (untrusted content + private data + egress). |
| T6  | **Cross-origin postMessage forgery**                  | Both sides fall back to `targetOrigin '*'` when origin is opaque (`'null'`) — `index.html:357`, and the fallback path is same-document `srcDoc` inheriting the embedder CSP (`ArtifactSandboxFrame.tsx:242-254`). A new `model-call` verb added to this contract, if it accepts `'*'`/`'null'` origin, lets any framing context or injected script forge model-call requests or spoof responses.                                                                                   |
| T7  | **Anonymous public surface charges a session**        | `/shared-artifact/[token]` is unauthenticated (`shared-artifact/[token]/page.tsx`), no TTL, no per-user quota, 1M-char body cap only. A bridge reachable here either (a) has no session to bill → who pays? or (b) is wired to bill the app-owner/service account → an anonymous internet visitor spends the company's inference budget by loading a URL. Either outcome is unacceptable; this surface must have **no bridge at all**.                                             |
| T8  | **Supply-chain amplifier**                            | The React/Babel runtime is loaded from unpkg **without SRI** (`renderReact`, `index.html:200-234`), unlike the pinned+SRI DOMPurify. A compromised CDN response already runs arbitrary code in the sandbox; adding a billed model primitive turns that from "defaced preview" into "drains viewer inference budget / exfiltrates via T5." Raises the blast radius of an existing weakness.                                                                                         |
| T9  | **Idempotency / lease abuse**                         | `reserveManagedUsageRequest` relies on an `Idempotency-Key` + `requestHash` (`managed-usage-request-service.ts:184-199`) and a lease token. Artifact-driven calls that mint fresh keys per iteration defeat idempotency dedup; leaked/guessable lease tokens crossing the postMessage boundary could let one artifact settle cost against another request.                                                                                                                         |

## 3. Mitigations / controls required before build

Each control names the file/contract it attaches to. All are **preconditions**,
not follow-ups.

- **C1 — Explicit, un-auto-clickable per-call consent.**
  The consent UI MUST render in the **parent app chrome, cross-origin to the
  artifact frame**, never inside/over the sandbox iframe, and MUST require a
  trusted user gesture (`event.isTrusted`) that artifact script cannot synthesize.
  Attaches to: a new parent-side confirmation component gating the bridge in
  `ArtifactSandboxFrame.tsx`/`artifact-sandbox.ts`; model the semantics on
  desktop `tool_guard.rs:48-96` (`ToolConfirmationRequest`/`RiskLevel`) and the
  `NEVER_REMEMBERABLE` re-prompt rule (`tool_confirmation.rs:33-56`) — the
  model-call verb must be non-rememberable (no "always allow"). Counters T2, T3.

- **C2 — Hard per-artifact AND per-session call/spend caps.**
  A ceiling **below** the viewer's plan cap, enforced server-side and keyed to a
  bridge-issued per-artifact-instance id, not just the existing plan caps.
  Attaches to: extend `reserveManagedUsageRequest`
  (`managed-usage-request-service.ts:175-236`) with an `artifactInstanceId` +
  `origin: 'artifact-bridge'` dimension and a dedicated cap that composes with
  `getPlanSessionUsageCapCents`. Cap both max calls and max spend per artifact
  render. Counters T4, T2.

- **C3 — Origin + capability allowlist on the message contract.**
  A new `model-call` verb MUST reject `targetOrigin '*'`/`'null'` and validate
  `event.origin` against the exact expected sandbox origin; never accept the
  opaque-origin fallback for billed verbs. Attaches to: the 3-verb handlers in
  `index.html:333-359`, `artifact-sandbox.ts:325-367`,
  `ArtifactSandboxFrame.tsx:152-219`. Capability must be opt-in per artifact
  (default off). Counters T6, T1.

- **C4 — No bridge on publicly-served artifacts, at all.**
  The bridge MUST be structurally absent (not merely disabled) on
  `/shared-artifact/[token]` and any `srcDoc` fallback path. Attaches to:
  `shared-artifact/[token]/page.tsx`, `PublishedArtifactView.tsx:92-99`,
  `requiresSandboxedRender` (`published-artifact-service.ts:83-85`), and the
  `srcDoc` fallback (`ArtifactSandboxFrame.tsx:242-254`, whose CSP is mirrored in
  three copies — `artifact-sandbox.ts:55-68`, `html-sanitizer.ts:593-618`,
  `index.html` meta — that must stay in lockstep). Only an authenticated,
  same-tab, in-app render may carry the bridge. Counters T7, T5.

- **C5 — Rate limiting on the bridge endpoint.**
  Independent of billing caps: per-user and per-artifact request-rate limits on
  whatever parent route the bridge calls to reach managed usage. Attaches to the
  new bridge route + `apps/web/lib/rate-limit.ts`. NOTE: SEV-WEB-13 proved the
  Upstash backing store can be absent in prod — the bridge MUST **fail closed**
  (deny model calls) when the rate-limit store is unavailable, never fail open.
  Counters T4, T9.

- **C6 — Audit logging of every bridge-originated call.**
  Log `{userId, artifactInstanceId, artifactSource(published?), origin, model,
estimatedCost, decision, idempotencyKey}` for every reserve/finalize triggered
  by the bridge. Attaches to `reserveManagedUsageRequest`/`finalizeManagedUsageRequest`
  call sites. Enables detecting T2/T4/T5 after the fact. Counters T2, T4, T5.

- **C7 — Kill-switch.**
  A single env/flag that disables the bridge globally without a redeploy,
  modeled on the existing `AGI_MANAGED_COMPUTE_PRIVATE_BETA` incident kill-switch
  pattern (per CLAUDE.md critical rules). Bridge defaults **off** until every
  other control ships. Counters all (incident response).

- **C8 — Egress-channel containment for output (mitigates T5).**
  Model output returned to the artifact is itself untrusted and MUST re-enter
  under the same `connect-src 'none'` CSP (no relaxation of the renderer CSP to
  accommodate the bridge). The bridge is the ONLY sanctioned channel; treat the
  combination (untrusted artifact + private render input + bridge egress) as a
  lethal trifecta and require that bridge-enabled artifacts receive no private/
  cross-user data in their render input.

- **C9 — Pin + SRI the sandbox script runtime (pre-existing, now load-bearing).**
  Add SRI to the unpkg React/Babel loads (`index.html:200-234`) before shipping
  the bridge, so a CDN compromise cannot drive the new billed primitive.
  Counters T8.

## 4. Recommendation

**GO-WITH-CONDITIONS.**

CAP-052 is buildable safely, but only as an authenticated, in-app,
default-off, capped, cross-origin-consented capability. It is **NO-GO** in any
form that reaches the anonymous public surface or that relaxes the cross-origin
sandbox invariant. Build is authorized **only when all of the following hold**
(each maps to §3):

1. **C4 absolute:** the bridge is structurally absent on
   `/shared-artifact/[token]`, all `PublishedArtifactView` scripted renders, and
   the `srcDoc` fallback. No anonymous session is ever billed. (Non-negotiable —
   its violation is the T7 NO-GO condition.)
2. **C1:** per-call consent renders in parent chrome, cross-origin to the
   artifact, requires a trusted gesture, and is non-rememberable.
3. **C2 + C5:** hard per-artifact and per-session call/spend caps AND rate
   limiting, both enforced server-side in `reserveManagedUsageRequest`, failing
   closed (C5 note) when the rate-limit store is unavailable.
4. **C3:** the new `model-call` verb validates `event.origin` exactly and
   refuses `'*'`/`'null'`; capability is opt-in per artifact, default off.
5. **The cross-origin invariant is preserved:** `isThisAppsOwnOrigin()` still
   refuses same-origin, and `connect-src 'none'` on the renderer is unchanged
   (C8). Any design requiring same-origin sandbox or CSP relaxation is NO-GO.
6. **C6 + C7:** audit logging on every bridge call and a global kill-switch that
   defaults the bridge off until 1-5 ship.
7. **C9:** SRI added to the sandbox's CDN script loads before enabling the
   bridge.

If any of conditions 1-7 cannot be met, the recommendation degrades to
**NO-GO** for that configuration. Condition 5 is the ledger's "WEB-13 stays
closed" clause; conditions 1-4 and 6-7, plus the §5 red-team items, are the
additional open-condition set that must close before CAP-052 ships.

## 5. Adversarial red-team addendum (2026-08-05)

An independent adversarial pass (opus, code-verified against the cited files)
returned **needs-revision** on §2–§4. The egress claims all held
(`connect-src 'none'` verified in the web sandbox, the mirrored
`ARTIFACT_CSP_CONTENT`, and the desktop header), but the following gaps must be
folded into the conditions before CAP-052 is considered cleared. These make the
recommendation **GO-WITH-CONDITIONS only after the corrections below**; until
then, treat it as **NO-GO**.

- **RT-1 (high) — bill-the-publisher wallet-DoS (§2 T7 aimed wrong).** The
  path-of-least-resistance bridge bills `published_artifacts.user_id` (already
  loaded by `getPublishedArtifactByToken`, `published-artifact-service.ts:377-392`),
  which satisfies `reserveManagedUsageRequest`'s `userId` contract with no code
  smell. An anonymous visitor looping `/shared-artifact/[token]` then drains the
  **publisher's** session/weekly cap; anonymous rate-limiting is per-IP
  (`rate-limit.ts:771`) so it parallelizes across IPs. C4 (no bridge on public
  artifacts) must be **absolute**, and its rationale must name the publisher as
  the victim. A logged-in viewer of a public link is T2 on the public surface
  (the `agiworkforce.com` parent carries their cookies).
- **RT-2 (high) — C3 contradicts the desktop opaque-origin design.**
  `isArtifactSandboxMessage` intentionally accepts `event.origin === 'null'`
  (`artifact-sandbox.ts:333-341`) because the desktop `artifact://` scheme is an
  opaque origin; authenticity there rests on `event.source === frame.contentWindow`
  (window identity), not origin. C3/§4-cond-4's "refuse `'null'`" is
  web-only and unenforceable on desktop. Restate the condition **per surface**:
  exact-origin match on web; window-identity on the desktop opaque origin.
- **RT-3 (medium) — "structurally absent" (C4) is architecturally impossible.**
  The renderer is one shared file (`RENDERER_HTML = include_str!` on desktop;
  the same file at the web sandbox origin) driven through shared
  `artifact-sandbox.ts` helpers by both `ArtifactSandboxFrame.tsx` and the public
  `SandboxedIframe` (`PublishedArtifactView.tsx:93`). A model-call verb in that
  shared layer exists everywhere; "absence" on public reduces to the parent not
  registering the handler — the very "disabled, not absent" pattern C4 warns
  against, and `ArtifactSandboxFrame.tsx:14-15` notes an in-progress refactor
  unifying the two. C4 needs a **regression test** asserting the public parent
  has no model-call handler, not a structural claim.
- **RT-4 (medium) — publish copies capability state; idempotency is shape-only.**
  `publishArtifactRecord` copies `content` verbatim (`:282-305`), so a
  bridge-opt-in flag encoded in content/metadata rides to the public copy with
  nothing re-stripping it. Idempotency keys are validated for shape only
  (`/^[A-Za-z0-9._:-]{8,128}$/`), so an artifact minting a fresh key per loop
  iteration bills each time — the per-artifact cap (C2) is the fix, but note it
  is a **Postgres-function/migration** change
  (`reserve_managed_usage_request_with_limits`), not an in-code extension of
  `reserveManagedUsageRequest`.
- **RT-5 (low) — three verified specifics.** (a) The concurrency limiter
  `acquireManagedTurnSlot` **fails open** on Redis error by design
  (`rate-limit.ts:1199-1205`) — the one control that would cap parallel model-call
  fan-out; the review omits it. (b) React/ReactDOM/Babel and mermaid load from
  CDN with **no SRI** (only DOMPurify is pinned). (c) The §1 "byte-for-byte
  identical CSP" claim is false — the renderer CSP lists 2 CDN hosts + `'self'`,
  `ARTIFACT_CSP_CONTENT` lists 4 and omits `'self'`; benign for egress but it
  undercuts the "three copies in lockstep" assurance C4 leans on.

**Corrected bottom line:** the strongest control is **C1** (cross-origin
parent-chrome consent with `isTrusted` — genuinely un-spoofable by the sandbox;
nit: `allow-modals` still permits `alert()` fatigue loops). The weakest is
**C3** (unenforceable as written on desktop). CAP-052 stays **NO-GO** until RT-1
through RT-4 are resolved in the design and RT-5(a) (fail-open limiter) is
addressed, because that limiter is the backstop against the cost-amplification
loop T4/RT-4 describe.
