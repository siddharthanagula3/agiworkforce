# Interactive Generative UI — Implementation Plan

Status: Proposed
Owner: Platform lead
Last updated: 2026-08-05
Supersedes: nothing. This is the single executable plan for inline interactive cards.

---

## 1. What we are building

Today the assistant can only write text at you. We are giving it two new things it can put
directly inside a reply: a **question card** — two to four questions with tappable options
that the user answers in place, where the answers flow back into the _same_ assistant turn so
it keeps working without the user typing anything — and an **itinerary card** — a
time-ordered day plan with real places, times, thumbnails and an "Open route" button,
rendered from structured data the server resolved rather than from text the model wrote.
Both cards stay in the transcript afterwards, showing what the user picked, and both survive
a reload. The hard constraint driving every technical choice below is a failure the founder
captured: an earlier "Open route" button built its Google Maps link out of event _names_, and
Maps resolved "South Park" to Irving TX and "Frontier Tower" to Anaheim CA — a confident,
good-looking widget that deep-linked to the wrong cities. So the rule we are building around
is that the model is never allowed to author a place's identity; it authors a _search query_,
our server resolves it, and when resolution fails the card says so and the button does not
exist rather than guessing.

---

## 2. How Claude, Gemini and Perplexity solve this

Each of the four capabilities maps to a _different_ mechanism at each vendor. Nobody uses one
mechanism for all of it — that is itself the most important finding.

| Capability                         | Anthropic (Claude)                                                                                                                                                                                                                                                                                                                                                                                      | Google (Gemini)                                                                                                                                                                                                                                                        | Perplexity                                                                                                                                                                                                                                                                   | What we take                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Inline clarifying questions** | `AskUserQuestion`, a **client-side tool**. Never executed server-side; surfaces through the `canUseTool` callback which "pauses execution until you return a response… different from normal conversation turns where Claude finishes and waits for your next message." Answer returns as the tool's `updatedInput`, so the model resumes mid-turn. Limits: 1–4 questions, 2–4 options, 12-char header. | **A2UI** `ChoicePicker` + two-way binding to a JSON-Pointer path, plus a Button whose `action.event.context` resolves those paths on click. Consumer Gemini has **no** shipped equivalent — its suggestion chips sit "above the Gemini chat box" and start a new turn. | **None.** Clarifying questions are a **pre-turn gate** ("Research now asks clarifying questions before starting"), never mid-answer, never absorbed into an in-flight turn. No prior art to copy.                                                                            | **Anthropic's mechanism wholesale.** Client-executed tool, answer returns as tool output, model resumes the same turn. Also its 1–4 / 2–4 / 12-char limits — they exist because a 6×8 card is a form and users bounce off forms mid-conversation.                                                                                                                                     |
| **2. Inline generative widget**    | **MCP Apps** (spec 2026-01-26): tool declares `_meta.ui.resourceUri` → `ui://` HTML resource → sandboxed iframe → JSON-RPC over `postMessage`. But note what Anthropic ships _first-party_: weather/recipes/sports are **fixed templates fed by trusted providers**, and only presentation-only content (charts, diagrams) is model-authored — and that part is labelled beta.                          | **A2UI** declarative catalog: "the agent can only request to render components from that catalog." Plus the **Maps Agentic UI toolkit** — `Inline Map + Route` and `Place Detail (Compact)` components, which the founder's design decomposes onto almost 1:1.         | Widgets are **classifier-triggered before generation** (16 heads with fixed thresholds shipped to the client) and filled from **typed retrieval channels** (`engine=map`, licensed Yelp/Tripadvisor/OpenTable data). The model writes prose; it never authors place records. | **The template side of Anthropic's line** (anything with real-world identity stakes is a template, not model-authored) + **Google's catalog principle** (model picks from a pre-approved registry, never emits markup) + **Perplexity's two-gate rule** (below). We do **not** take MCP Apps: it solves _third-party server ships UI to your host_, which is not our first-party map. |
| **3. Citation chips**              | `search_result` content blocks — `source` and `title` both **required** — cited via `search_result_location`. The model emits an _index_; the API extracts `cited_text` itself, so "citations are guaranteed to contain valid pointers."                                                                                                                                                                | `groundingSupports[].segment.{startIndex,endIndex}` into the answer text + `groundingChunkIndices` into `groundingChunks`. Span-anchored.                                                                                                                              | `[N]` markers mapping to a search-result `id`. No span anchoring at all. **All batches in a multi-step run share one id space** — accumulate from every event or citations look hallucinated.                                                                                | **Card-scoped sources only, anchored to stable IDs** (`stopId`), not character offsets. Prose-level chips are explicitly _out of scope_ — see §9 Q5. Anthropic's "source is a required field" discipline is adopted: no source, no chip.                                                                                                                                              |
| **4. Feature-intro modal**         | **No public record exists.** Searched anthropic.com/news, claude.com/blog, support release notes, and the desktop changelog through 2026-08-04: nothing matches "Think it through with Claude", its New badge, its three tabs, or its CTA. _(INFERRED: a staged-rollout or experiment.)_                                                                                                                | n/a                                                                                                                                                                                                                                                                    | n/a                                                                                                                                                                                                                                                                          | Treat the founder's screenshots as the **only** source. Build it as ordinary product chrome, borrow no branding or copy, and do not assume the capability is permanent.                                                                                                                                                                                                               |

### Cross-cutting lessons we are adopting

- **[documented] The model emits a pointer, never the payload.** Every Anthropic citation location
  type works this way (`document_index`, `search_result_index`, `start_char_index`). Google's
  stack refuses a name at every layer — grounding returns `maps.placeId`,
  `gmp-place-details-place-request` accepts a Place / place ID / resource name and _not_ a
  display name, and Maps URLs states outright that a place ID "is the best guarantee that you
  will link to the right place." Perplexity says it in one sentence: "Never count on the model
  to return valid links directly as part of the JSON response content." **This is the fix for
  the Irving-TX bug and all three vendors independently arrived at it.**
- **[documented] `strict: true` buys shape, not truth.** It "guarantees `tool_use.input`
  validates exactly" — a required `placeId: string` will happily accept a hallucinated one.
  Only a resolver round-trip buys truth.
- **[observed] Intent firing ≠ widget rendering.** Perplexity's `shopping_intent` scored 0.996
  against a 0.80 threshold and still rendered nothing, because the fulfilment stage had no
  resolvable structured data. It never synthesises a widget from model-authored strings. We
  adopt this as a hard rule.
- **[documented] Ship an _authored_ text fallback per widget, not a degraded widget.** Anthropic
  decides this per feature and per surface: weather is "available on web and desktop only;
  mobile shows text"; sports is "displayed as text on all platforms, not as a visual widget."
  Someone _wrote_ the text version.
- **[documented] Model-authored markup never touches the host DOM anywhere in Claude.** Option
  previews are sanitised before the callback sees them; MCP Apps run in a sandboxed iframe with
  `default-src 'none'`; artifacts render on a separate configurable origin. We go further and
  never let the model author markup at all.
- **[documented] Anthropic's inline visuals are explicitly ephemeral** — "they're temporary,
  they change or disappear as the conversation evolves." The founder's spec requires
  persistence, so we diverge knowingly (§6, persistence).
- **[documented] Mid-response placement is more ambitious than anything Anthropic ships.** Their
  cards sit "at the bottom of the chat" and step one question at a time before choices are
  "sent as a single reply." We are placing cards mid-transcript. That is a real divergence with
  a real layout cost — see §9 Q6.

---

## 3. Architecture decision, and why the alternatives lost

### The decision

**A client-executed tool becomes a fourth verdict in the existing tool loop, and the card
payload is a typed, allowlisted, versioned envelope carrying a required server-authored text
fallback.**

Concretely, four choices:

1. **Suspension mechanism:** add a `'client'` verdict to `resolveToolCallGate`
   (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1465`) alongside the existing
   `allow | ask | deny`. A tool with no server executor suspends on the identical path an
   approval already uses: write the checkpoint, emit the client-facing event, end the stream.
2. **Resume mechanism:** **widen the existing** `POST /api/llm/v1/chat/completions/approve`
   body. Do **not** add a new route.
3. **Payload shape:** an allowlisted `cardType` registry with an **open** wire type, a required
   authored `fallback`, and a `recognized: false` branch on which `body` is _absent from the
   type_.
4. **Identity:** the model authors a `placeQuery` string; the server resolves it; the itinerary
   stop carries a `placeIndex` **pointer** into a server-filled `places[]` array and has no
   name, address, coordinate or URL field of its own.

This is Design 2's server spine with Design 1's contract. **Both judges independently converged
on that combination** — Judge 1 scored Design 1 highest but its own graft list says "take Design
2's fourth verdict", "take Design 2's route reuse instead of Design 1's `/respond`", and "take
Design 2's reconciliation with the existing Rust contract". Judge 2 scored Design 2 highest but
grafts in Design 1's identity-free stop, its absent-`body` branch, its `HttpsUrlSchema`, and its
request-side capability handshake. The disagreement was about which half to name the winner, not
about which halves to build.

### Where the judges disagreed, and how I decided

**(a) New `/respond` route vs widening `/approve`. → Widen `/approve`. Judge 2 wins.**
I read all 361 lines of `approve/route.ts` and the service it calls. The path carries four
previously-shipped-and-fixed vulnerabilities that a new route would silently drop:

- **AUDIT-FIX AGT-5** (`cloud-agent-run-service.ts`, verified): the run-state update is
  constrained to `state in ('queued','running','awaiting_input','paused')` because an
  unconstrained update let a client POST revive a _terminal_ run and execute side-effecting
  tools inside an execution context that was already torn down and billed out.
- **AUDIT-FIX CON-1 / CON-2** (`approve/route.ts:174-177`, verified): the resume path reloads
  the user's saved connector verdicts _before_ the durable continuation starts, drops `deny`
  tools from the offered catalog, and rewrites any `approved` decision naming a blocked tool to
  `rejected`.
- **GOV-7** (`approve/route.ts:191`, verified): the same per-plan connector-tool ceiling the
  initial turn used, so a resumed turn cannot be offered a different catalog than the one whose
  card the user is answering.
- `releaseClaim` on six distinct error branches (verified at :166, :224, :239, :317).

Design 1 named six helpers it would share and **none** of these four. It correctly identified
metering as the thing it must not lose, and then would have lost four other things it never
enumerated. Widening the body is a strictly smaller change with a strictly smaller blast radius.
The route name becomes a misnomer; that is recorded debt, not a reason to duplicate a metered,
security-hardened streaming path.

**(b) `isSecret`. → Keep the field, reject the ask. Judge 2's threat analysis wins.**
The existing Rust `RequestUserInputQuestion` has `is_secret` (verified,
`crates/agiworkforce-protocol/src/request_user_input.rs:23`). Judge 2 is right that honouring it
is a credential-phishing channel _we build the mask for_: the model authors `isSecret`, the client
renders a masked input inside first-party chrome the user trusts, and that makes a
model-authored prompt look **more** legitimate. Design 2's `redactSecretClarifyingAnswers` runs
"before persistence" and protects the database, not the user — the plaintext still reaches model
context. **Decision:** the field stays in the contract for parity with the Rust struct, and the
server **rejects any card containing a question with `isSecret: true`** at the tool boundary,
returning a tool error. No surface ever renders a masked input in a card. A clarifying-question
card is not a credential prompt and must never be able to look like one.

**(c) `schemaVersion: z.literal(1)` vs an open version. → Open. Judge 2 wins.**
Judge 1 did not flag this; Judge 2 flagged it as fatal on _both_ of the top designs and is
right. A pinned literal means a future major bump makes the parser return `null` and drop the
card **including its fallback** — the one field the whole degradation story rests on. Combined
with the verified fact that `toolApprovalRequestEvent` (`tool-loop.ts:662`) emits **only** the
extension key with no prose and no tool result, a suspended card on a stale client renders as a
bare truncated turn. We use an open `schemaVersion` with an explicit `schema-too-new` fallback.

**(d) "Render nothing" on an unparseable card. → Render nothing only for non-suspending cards.**
Design 2's rule ("no error card, no placeholder — the prose and the tool result already carry
the answer") is correct for a decorative card and wrong for a suspending one, where by
construction there is no tool result and no prose. **Decision:** any envelope carrying
`awaitingResponse: true` must fall back to `fallback.text`, never to nothing.

**(e) Store the payload in `web_artifacts` (Judge 2's graft from Design 3). → No. I overrule
this graft, with evidence.** The storage argument is genuinely attractive —
`web_artifacts.content` is uncapped `TEXT`, RLS-forced, and rides the shared sync cursor, and
the 32k metadata error message literally instructs callers to reference large payloads by id.
But I verified that `web_artifacts` is written by **exactly one path in the entire repo**: the
_client_ sync push at `apps/web/app/api/chat/sync/route.ts` (insert :433, update :417). There is
no server-side artifact writer. Adopting it therefore requires a net-new server write inside a
streaming response, a last-writer-wins policy against the client's own push on a shared version
cursor, and an answer to the artifact-id collision Judge 2 itself identified as the single most
severe defect in the field (`uuidv5(conversationId:messageId:ordinal)` where `ordinal` is the
position of a _fenced code block_, so a message with one code block and one card computes the
same UUID for both and they overwrite each other across devices). **Decision:** payload stays in
message metadata for now, with a hard per-card construction cap; thumbnails are already
id-references, not bytes, which is what keeps a normal itinerary inside budget. The
storage-reference path is the correct eventual answer and is tracked as §9 Q4 — but it is a
slice of its own, not a free win.

### Why the two losing designs lost

**Design 3 (Card Artifacts)** lost on the artifact spine not existing server-side (above), and
on a contract that does not typecheck against itself: `ItineraryRouteLeg.url` is declared as a
`unique symbol`–branded `MapsDeepLinkUrl` while its wire schema is `z.string().url()`, whose
`z.infer` yields plain `string`. Since every surface receives its payload through that parse
boundary, its headline "no client can synthesise a URL" guarantee dissolves in exactly the place
it was supposed to bind. Its resume path also 500s against the real service (see the exactMatch
finding below). **What we keep from it:** the open `schemaVersion`, the authored prose line
before suspension, the rule that the itinerary handler _discards_ the model's proposed route
rather than validating it, and its slice ordering that ships the place resolver as text-only
before any pixel depends on it.

**Design 1 (Inline Cards)** lost only on the `/respond` route, and it lost narrowly — its
contract is the best in the field and we are taking almost all of it: the identity-free stop,
the absent-`body` branch, the https-only URL validator, the request-side capability handshake,
the checkpoint `kind` discriminator, and the refusal to honour `isSecret`.

### The finding all three designs missed

`claimCloudAgentApprovalCheckpoint` (`apps/web/lib/services/cloud-agent-run-service.ts:757`,
verified) **re-parses its approvals internally** with `z.array(...).min(1).max(32)` and then
enforces **exact set equality** between the decision ids and the checkpoint's pending tool-call
ids:

```ts
const exactMatch =
  decisionIds.size === approvals.length &&
  decisionIds.size === pendingIds.size &&
  [...decisionIds].every((id) => pendingIds.has(id));
if (!exactMatch) throw new CloudAgentApprovalDecisionError();
```

A resume carrying only card responses and an empty `tool_approvals` array throws a raw `ZodError`
inside the service before any route-level logic runs. **This is why `cardId` must equal
`tool_call_id`** (Design 2's insight, and the only design that reasoned about set equality at
all): the card _is_ a pending tool call, so answering it naturally contributes that call's entry
to the decision set and the existing invariant holds unchanged. The route layer synthesises a
`{toolCallId, decision: 'approved'}` entry for each answered card before calling the service, so
the service's contract is satisfied without modifying it. A dismissed card contributes
`'rejected'`. This is ~20 contained lines and **must land in the same slice as the first
answerable card or nothing resumes.**

---

## 4. Contract additions

Two files. `@agiworkforce/types` has **no zod dependency** (verified: its `package.json` lists
only `@agiworkforce/model-registry`), so it carries types and pure functions; all runtime
validation lives in `@agiworkforce/cloud-contracts`, which does depend on `zod ^4.4.2`. This
mirrors the existing split between `provider-adapter.ts` (types) and `tool-events.ts` (parsers).

### 4a. `packages/contracts/types/src/interactive-cards.ts` (new)

```ts
/**
 * Interactive card contracts — structured, answerable, durable transcript cards.
 *
 * A card is a projection of a TOOL CALL. `cardId` ALWAYS equals the originating
 * `tool_call_id`, which is what lets an answer satisfy the exact-set-equality
 * invariant enforced inside `claimCloudAgentApprovalCheckpoint`.
 *
 * Export from src/index.ts. NOTE: `./mcp-apps` (exported at index.ts:127) has
 * ZERO consumers repo-wide (verified) and declares `props: Record<string, unknown>`
 * — the exact untyped-props anti-pattern this contract exists to prevent. Delete
 * it or mark it `@deprecated — not a runtime` in the same PR, or the next reader
 * wires the wrong one.
 */

import type { ChatExecutionMode } from './suite-contracts';

/**
 * MAJOR version. Deliberately NOT pinned as a literal at the parse boundary —
 * see `InteractiveCardEnvelopeWireSchema`. A client that meets a higher version
 * renders `fallback`, it does not drop the card.
 */
export const INTERACTIVE_CARD_SCHEMA_VERSION = 1;

/** Additive SSE delta key, following the existing `x_*` convention. */
export const INTERACTIVE_CARD_DELTA_KEY = 'x_interactive_card' as const;

/**
 * Additive REQUEST key. Absent => the server offers no card-producing tools and
 * emits no cards. This is the primary degradation lever and it is SERVER-ENFORCED:
 * a surface that has not implemented the decoder is never sent a card, so the
 * repo's twice-hit "a new delta silently vanished on a surface that never decoded
 * it" failure is structurally impossible rather than merely discouraged.
 */
export const INTERACTIVE_CARD_REQUEST_KEY = 'x_interactive_cards' as const;

/** Key under `web_messages.metadata` where the durable projection lives. */
export const INTERACTIVE_CARDS_METADATA_KEY = 'interactiveCards' as const;

/**
 * Hard cap on ONE serialized card, enforced at CONSTRUCTION on the server.
 * MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH is 32_000 for the WHOLE metadata bag
 * (verified, cloud-contracts/src/conversations.ts:17), already shared with
 * thinking/toolCalls/artifacts/webSearchResults/generatedFiles/agentActivity and
 * already trimming in production. We never emit a card that will not persist.
 */
export const INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH = 12_000;
export const INTERACTIVE_CARDS_MAX_PER_MESSAGE = 4;

// ---------------------------------------------------------------------------
// Kind allowlist — this IS the security boundary
// ---------------------------------------------------------------------------

export const KNOWN_INTERACTIVE_CARD_KINDS = ['clarify.v1', 'itinerary.v1'] as const;
export type KnownInteractiveCardKind = (typeof KNOWN_INTERACTIVE_CARD_KINDS)[number];

/**
 * Wire-level kind is an OPEN string so an old client can always parse the
 * ENVELOPE of a card it cannot render. Versioning rule: additive changes never
 * bump `vN` (parsers strip unknown keys); a breaking change mints a new `vN`,
 * which old clients render as `fallback`.
 */
export type InteractiveCardKindWire = string;

export function isKnownInteractiveCardKind(kind: string): kind is KnownInteractiveCardKind {
  return (KNOWN_INTERACTIVE_CARD_KINDS as readonly string[]).includes(kind);
}

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

/**
 * The authored text rendering of the SAME payload, produced by the same server
 * code that produced `body`. REQUIRED, never derived on the client.
 *
 * This one field is the whole cross-surface story: unknown kind, missing
 * renderer, VS Code, CLI, screen reader, copy-paste, and honest degradation when
 * place identity is unresolved all resolve to it. Because it is on every render
 * path, it cannot rot.
 *
 * `text` is PLAIN TEXT, not markdown: the CLI renders it into Ratatui cells and
 * the Chrome side panel runs it through a DOMPurify config whose ALLOWED_ATTR is
 * ['href','target','rel','title','colspan','rowspan']. Markdown here would render
 * as literal asterisks on two of six surfaces.
 */
export interface InteractiveCardFallback {
  /** One line. Used where even a paragraph is too much (CLI status rows). */
  headline: string;
  /** Plain text. For an itinerary: the real ordered list with times and resolved addresses. */
  text: string;
  /** Optional richer form for surfaces that render markdown but not cards. */
  markdown?: string;
}

/**
 * Present IFF the card can be answered. Absent => display-only, and no surface
 * renders an input affordance (the repo's established "omit the handler => do not
 * render the control" rule).
 */
export interface InteractiveCardInteraction {
  /** Managed-cloud run id. The only identifier that crosses the trust boundary. */
  runId: string;
  /**
   * True while the turn is SUSPENDED on this card. The runtime MUST keep the
   * assistant message open and MUST NOT run its `done` teardown — same contract
   * as `tool_approval_request` (unified-chat/src/lib/runtime.ts:519-531). Running
   * teardown orphans the card and the continuation has nothing to attach to.
   */
  awaitingResponse: boolean;
  /** Lease expiry. Past this, the card renders read-only as `expired`. */
  expiresAt: string;
  /**
   * Trust boundary of the producing turn, rendered as the visible provider label.
   * Typed as a union of one so widening it is a deliberate, reviewable change:
   * BYOK streams direct from the client with no server tool loop, and Local must
   * never reach our cloud.
   */
  executionMode: Extract<ChatExecutionMode, 'cloud_managed'>;
}

export interface InteractiveCardCommon {
  schemaVersion: number;
  /**
   * ALWAYS equals the originating `tool_call_id`. Load-bearing: it joins to
   * ToolCall.id, to x_tool_result.tool_call_id, and to the checkpoint's
   * pending_tool_calls[].id, so an answer satisfies the exact-set-equality
   * invariant in claimCloudAgentApprovalCheckpoint with no extra identity to
   * keep in sync.
   */
  cardId: string;
  createdAt: string;
  fallback: InteractiveCardFallback;
  interaction?: InteractiveCardInteraction;
  producedBy: { toolCallId: string; toolName: string };
}

// ---------------------------------------------------------------------------
// clarify.v1
// ---------------------------------------------------------------------------

/**
 * Limits adopted verbatim from Anthropic's shipped AskUserQuestion. They exist
 * because a card with 6 questions and 8 options is a form, and users bounce off
 * forms mid-conversation.
 */
export const CLARIFY_MAX_QUESTIONS = 4;
export const CLARIFY_MIN_OPTIONS = 2;
export const CLARIFY_MAX_OPTIONS = 4;
export const CLARIFY_HEADER_MAX_LENGTH = 12;
export const CLARIFY_OTHER_MAX_LENGTH = 500;

export interface ClarifyOption {
  /** Stable id. The ONLY value a client may send back. Labels resolve server-side. */
  id: string;
  label: string;
  description: string;
}

/**
 * Field vocabulary mirrors the ALREADY-DEFINED Rust `RequestUserInputQuestion`
 * (verified: crates/agiworkforce-protocol/src/request_user_input.rs — id, header,
 * question, isOther, isSecret, options[{label, description}]) so this extends the
 * repo's existing schema asset instead of forking the concept a second time.
 *
 * Two deliberate departures from Anthropic's AskUserQuestion:
 *  1. Answers key by stable `id`, never by question TEXT. Anthropic's documented
 *     `answers: {"<question text>": "<label>"}` breaks on edit, localisation and
 *     duplicate text. The Rust `RequestUserInputResponse.answers` is already a
 *     HashMap keyed by id, which is the better shape — keep it.
 *  2. `multiSelect` and per-option `id` are additions; extend the Rust struct and
 *     regenerate the ts-rs bindings rather than declaring a parallel type.
 */
export interface ClarifyQuestion {
  id: string;
  /** Short chip label, <= CLARIFY_HEADER_MAX_LENGTH. Becomes the answered sub-label. */
  header: string;
  question: string;
  options: ClarifyOption[];
  multiSelect: boolean;
  /** Per-question free-text escape hatch. The answer VALUE is the user's text, never "Other". */
  isOther: boolean;
  /**
   * Retained for parity with the Rust struct. The SERVER REJECTS any card whose
   * questions set this true — a clarifying-question card is not a credential
   * prompt and must never be able to look like one. No surface renders a masked
   * input. See §6.
   */
  isSecret: boolean;
}

export type ClarifyAnswer =
  /** `labels` are RESOLVED SERVER-SIDE from ids. Labels never travel inbound. */
  | { questionId: string; kind: 'options'; optionIds: string[]; labels: string[] }
  | { questionId: string; kind: 'other'; text: string }
  /** Silence must be REPRESENTABLE and distinguishable from "not yet asked". */
  | { questionId: string; kind: 'skipped' };

export type ClarifyState =
  | { status: 'pending' }
  | { status: 'answered'; answers: ClarifyAnswer[]; answeredAt: string }
  /** Whole-card escape hatch: the user dismissed the questions and typed instead. */
  | { status: 'dismissed'; freeText?: string; dismissedAt: string }
  /** The suspended turn is gone. Renders read-only, honest line, NO buttons. */
  | { status: 'expired'; reason: 'checkpoint_gone' | 'turn_failed' | 'superseded' };

export interface ClarifyCardBody {
  prompt?: string;
  questions: ClarifyQuestion[];
  state: ClarifyState;
}

// ---------------------------------------------------------------------------
// Place identity — the fix for the Irving-TX / Anaheim-CA failure
// ---------------------------------------------------------------------------

export type PlaceUnresolvedReason =
  | 'no_match'
  | 'ambiguous'
  | 'outside_region'
  | 'provider_error'
  | 'rate_limited'
  | 'not_permitted_in_this_chat';

/**
 * A discriminated union with NO shared identity fields, never an optional
 * `placeId?`. The `unresolved` branch has no coordinates, no provider id and no
 * address IN THE TYPE, so routing code cannot compile against them. An optional
 * field would have been silently skipped by exactly the code that shipped the bug.
 *
 * `provider` is an open string and is deliberately NOT populated with a guessed
 * vendor name — no Places provider exists in this repo yet (verified: a repo-wide
 * grep for place_id|placeId|maps.google|geocod|mapbox|leaflet|maplibre returns
 * only unrelated `marketplaceId` hits). See §9 Q1.
 */
export type PlaceIdentity =
  | {
      status: 'resolved';
      provider: string;
      /** Opaque provider id. Never parsed, never string-built, never model-authored. */
      providerPlaceId: string;
      lat: number;
      lng: number;
      /** RESOLVER-authored. This is what the row displays. Never the model's string. */
      displayName: string;
      formattedAddress: string;
      /** Place data goes stale. Drives re-resolution policy. */
      resolvedAt: string;
      attribution: { providerLabel: string; providerUrl?: string };
    }
  | {
      status: 'unresolved';
      /** The model's search string. DISPLAY ONLY — there is no URL field on this branch. */
      query: string;
      reason: PlaceUnresolvedReason;
    };

export function isResolvedPlace(
  place: PlaceIdentity,
): place is Extract<PlaceIdentity, { status: 'resolved' }> {
  return place.status === 'resolved';
}

/**
 * Imagery is referenced by id into OUR OWN media catalog, never by URL. A model-
 * or resolver-chosen remote image host is an exfiltration channel: the fetch alone
 * leaks the viewer's IP, UA and referrer to a third party on behalf of a chat whose
 * trust boundary the widget does not know. Also what keeps an 8-stop itinerary
 * inside the metadata budget.
 */
export interface InteractiveCardMediaRef {
  fileId: string;
  /** Reserve layout height so the transcript does not jump when the image lands. */
  width: number;
  height: number;
  alt: string;
}

/** Card-scoped citation chips. Anchored to stable IDs, never character offsets. */
export interface InteractiveCardSource {
  /** REQUIRED, like Anthropic's `search_result.source`: no source, no chip. */
  url: string;
  /** REQUIRED chip label ("luma", "AI Events"). */
  title: string;
}

// ---------------------------------------------------------------------------
// itinerary.v1
// ---------------------------------------------------------------------------

/**
 * A stop has NO name, NO address, NO coordinates and NO url. It has a POINTER.
 * The model authors ordering, time and one line of prose; it could not author
 * identity even if it tried, because there is no field for it.
 */
export interface ItineraryStop {
  /** Stable across re-emissions. Row keys MUST use this, never the array index. */
  id: string;
  /** 1-based. The map pin number and the itinerary row share this ordinal exactly. */
  pin: number;
  /** Index into `ItineraryCardBody.places`. The ONLY link between a row and a place. */
  placeIndex: number;
  /** Local wall-clock, e.g. "08:30". Not a timestamp. */
  startTimeLabel: string;
  /** Model-authored prose, rendered as text only. Never an identifier. */
  note: string;
  thumbnail?: InteractiveCardMediaRef;
  sources: InteractiveCardSource[];
}

export type ItineraryTravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';

/**
 * `legs` is plural because maps providers cap waypoints per platform, and an
 * 8-stop day exceeds the mobile-browser cap. VERIFY before shipping — see §9 Q2.
 */
export interface ItineraryRouteLeg {
  label: string;
  /** Server-built from resolved ids only. Clients re-validate the scheme. */
  url: string;
  stopIds: string[];
}

/**
 * A union, not `routeUrl?: string`. On the unavailable branch there is no `url`
 * to read and no `legs` to index — "Open route" is not disabled by a runtime `if`
 * that someone can delete; it has nothing to render.
 */
export type ItineraryRoute =
  | { status: 'available'; travelMode: ItineraryTravelMode; legs: ItineraryRouteLeg[] }
  | {
      status: 'unavailable';
      reason:
        | 'unresolved_stops'
        | 'too_few_stops'
        | 'provider_unavailable'
        | 'not_permitted_in_this_chat';
      /** Drives honest copy: "2 of 6 places couldn't be confirmed." */
      unresolvedStopCount: number;
    };

export interface ItineraryCardBody {
  title: string;
  summary: string;
  summarySources: InteractiveCardSource[];
  region: { label: string; timeZone: string };
  /** Server-filled. The ONLY place identity lives. */
  places: PlaceIdentity[];
  stops: ItineraryStop[];
  route: ItineraryRoute;
  /** Server-rendered static map, same-origin, catalogued. See §5 for why static. */
  overview?: InteractiveCardMediaRef;
}

export const ITINERARY_MAX_STOPS = 12;
export const ITINERARY_NOTE_MAX_LENGTH = 240;

// ---------------------------------------------------------------------------
// The model-facing tool input — where the bug is made unrepresentable
// ---------------------------------------------------------------------------

/**
 * What the MODEL is allowed to author. Note what is absent: no place id, no
 * coordinates, no address, no URL. The model supplies intent (`placeQuery`,
 * `localityHint`) and presentation (`note`, `startTimeLabel`); the server
 * supplies identity, including the DISPLAYED NAME.
 */
export interface ItineraryToolInputStop {
  startTimeLabel: string;
  note: string;
  /** Free text. The ONLY identity signal the model may emit. */
  placeQuery: string;
  /** e.g. "San Francisco, CA". Biases the resolver — its absence is how "South Park" became Irving TX. */
  localityHint: string;
}

export interface ItineraryToolInput {
  title: string;
  summary: string;
  stops: ItineraryToolInputStop[];
  travelMode: ItineraryTravelMode;
}

/**
 * Compile-time proof that the model-facing input can never carry identity. If
 * anyone adds one of these keys back, this assignment stops compiling and CI
 * fails — the regression becomes a build error, not a wrong-city deep link
 * discovered in a screenshot.
 *
 * `name` and `displayName` are in this list deliberately: a model-authored
 * display name next to a resolver-authored address is two names with no rule for
 * which is authoritative, which is the same bug wearing a smaller costume.
 */
type _IdentityKeysLeakedToModel = Extract<
  keyof ItineraryToolInputStop,
  | 'placeId'
  | 'providerPlaceId'
  | 'place_id'
  | 'lat'
  | 'lng'
  | 'coordinates'
  | 'address'
  | 'formattedAddress'
  | 'url'
  | 'routeUrl'
  | 'mapsUrl'
  | 'name'
  | 'displayName'
  | 'title'
>;
type _AssertNoIdentityInModelInput = [_IdentityKeysLeakedToModel] extends [never] ? true : never;
export const INTERACTIVE_CARD_IDENTITY_GUARD: _AssertNoIdentityInModelInput = true;

// ---------------------------------------------------------------------------
// The card union. `recognized` is the discriminant that makes degradation total.
// ---------------------------------------------------------------------------

export type KnownInteractiveCard =
  | (InteractiveCardCommon & { recognized: true; kind: 'clarify.v1'; body: ClarifyCardBody })
  | (InteractiveCardCommon & { recognized: true; kind: 'itinerary.v1'; body: ItineraryCardBody });

/**
 * A card whose kind this build does not know, or whose body failed validation.
 *
 * `body` IS ABSENT FROM THE TYPE — not optional, not `unknown`, absent. A renderer
 * cannot reach for an unvalidated body; the attempt does not compile (TS2339).
 * The envelope still carries `fallback`, so the message is never blank.
 */
export interface UnrecognizedInteractiveCard extends InteractiveCardCommon {
  recognized: false;
  kind: string;
}

export type InteractiveCard = KnownInteractiveCard | UnrecognizedInteractiveCard;

export type InteractiveCardBodyFor<K extends KnownInteractiveCardKind> = Extract<
  KnownInteractiveCard,
  { kind: K }
>['body'];

// ---------------------------------------------------------------------------
// Registry — one shape, three implementations (React DOM / React Native / imperative DOM)
// ---------------------------------------------------------------------------

export interface InteractiveCardRenderContext {
  /** False => render read-only. Never render a control whose handler is absent. */
  canRespond: boolean;
  onRespond?: (payload: InteractiveCardResponsePayload) => void;
  /** Host-owned URL opener. The registry never calls window.open / Linking directly. */
  onOpenUrl?: (url: string) => void;
}

export type InteractiveCardRenderer<TNode, K extends KnownInteractiveCardKind> = (props: {
  card: Extract<KnownInteractiveCard, { kind: K }>;
  body: InteractiveCardBodyFor<K>;
  ctx: InteractiveCardRenderContext;
}) => TNode;

/** Every entry OPTIONAL: a surface ships the subset it can actually render. */
export type InteractiveCardRegistry<TNode> = {
  readonly [K in KnownInteractiveCardKind]?: InteractiveCardRenderer<TNode, K>;
};

/**
 * Returns null for an unrecognized card AND for a known kind this surface has no
 * renderer for. Both callers do the same thing: render `fallback`. One path,
 * exercised constantly, cannot rot.
 */
export function resolveInteractiveCardRenderer<TNode>(
  registry: InteractiveCardRegistry<TNode>,
  card: InteractiveCard,
): InteractiveCardRenderer<TNode, KnownInteractiveCardKind> | null {
  if (!card.recognized) return null;
  const renderer = registry[card.kind];
  return (renderer as InteractiveCardRenderer<TNode, KnownInteractiveCardKind> | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Wire
// ---------------------------------------------------------------------------

/**
 * Sent on the REQUEST as `x_interactive_cards`. Absent => the server offers no
 * card-producing tools. Fail-closed; this is what makes CLI and VS Code correct
 * with zero client work.
 */
export interface InteractiveCardClientCapability {
  supported: InteractiveCardKindWire[];
  /** False => `ask_clarifying_questions` is not offered; a headless run fails fast rather than hanging. */
  canRespond: boolean;
}

/** Client -> server. snake_case, matching the OpenAI-compatible wire. NO labels outbound. */
export type InteractiveCardResponsePayload =
  | {
      kind: 'answers';
      answers: Array<{
        question_id: string;
        option_ids?: string[];
        text?: string;
        skipped?: boolean;
      }>;
    }
  | { kind: 'dismiss'; text?: string };

/** Durable projection under `metadata.interactiveCards`. */
export interface PersistedInteractiveCards {
  schemaVersion: number;
  cards: InteractiveCard[];
}

// ---------------------------------------------------------------------------
// Capability axis (add to ./capabilities.ts)
// ---------------------------------------------------------------------------

/**
 * Two booleans, not one: VS Code can RENDER a card and cannot ANSWER one (its
 * transcript has never accepted a click and its CSP forbids a second script
 * source). Collapsing these invites a dead control.
 *
 * PlatformCapability covers SyncedAppSurface = web|desktop|mobile only. cli,
 * vscode and chrome have no capability row (verified) and pin their behaviour in
 * a local constant instead. That gap is real; recorded, not papered over.
 */
export type InteractiveCardCapability =
  | 'canRenderInteractiveCards'
  | 'canAnswerInteractiveCards'
  | 'canRenderMapCards';
```

### 4b. `packages/contracts/cloud-contracts/src/interactive-cards.ts` (new, zod)

```ts
/**
 * Runtime validation. Mirrors the stated contract of ./tool-events.ts:16-21
 * exactly: parsers NEVER throw; single-object deltas return null on mismatch;
 * list payloads salvage per item.
 */

import { z } from 'zod';
import {
  INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH,
  isKnownInteractiveCardKind,
  CLARIFY_HEADER_MAX_LENGTH,
  CLARIFY_MAX_OPTIONS,
  CLARIFY_MAX_QUESTIONS,
  CLARIFY_MIN_OPTIONS,
  type InteractiveCard,
} from '@agiworkforce/types';

/**
 * https only. Zod's `.url()` is `new URL()`-based and ACCEPTS `javascript:` —
 * verified. `safeHref` catches that on the React surfaces, but Chrome's DOMPurify
 * config and VS Code's markdown-it path are separate sanitizers. Close it once,
 * at the contract boundary.
 */
const HttpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((u) => u.startsWith('https://'), { message: 'https only' });

const IsoDate = z.string().datetime({ offset: true });

const FallbackSchema = z
  .object({
    headline: z.string().min(1).max(200),
    text: z.string().min(1).max(8_000),
    markdown: z.string().max(16_000).optional(),
  })
  .strict();

const InteractionSchema = z
  .object({
    runId: z.string().uuid(),
    awaitingResponse: z.boolean(),
    expiresAt: IsoDate,
    executionMode: z.literal('cloud_managed'),
  })
  .strict();

/**
 * NOTE what is NOT strict here: `schemaVersion` is an open int and `kind` is an
 * open string, and `body` is `unknown`. That is the entire old-client story — an
 * envelope for a card family or a schema version this build has never heard of
 * still PARSES and still carries `fallback`.
 *
 * Pinning `schemaVersion: z.literal(1)` is the single change that would blank
 * cards in the field on the next major bump. Do not make it.
 */
export const InteractiveCardEnvelopeSchema = z.object({
  schemaVersion: z.number().int().positive().max(9_999),
  cardId: z.string().min(1).max(128),
  kind: z.string().min(1).max(64),
  createdAt: IsoDate,
  fallback: FallbackSchema,
  interaction: InteractionSchema.optional(),
  producedBy: z
    .object({ toolCallId: z.string().min(1).max(128), toolName: z.string().min(1).max(200) })
    .strict(),
  body: z.unknown(),
});

// --- clarify.v1 -------------------------------------------------------------

const ClarifyOptionSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(80),
    description: z.string().max(200),
  })
  .strict();

const ClarifyQuestionSchema = z
  .object({
    id: z.string().min(1).max(64),
    header: z.string().min(1).max(CLARIFY_HEADER_MAX_LENGTH),
    question: z.string().min(1).max(300),
    options: z.array(ClarifyOptionSchema).min(CLARIFY_MIN_OPTIONS).max(CLARIFY_MAX_OPTIONS),
    multiSelect: z.boolean(),
    isOther: z.boolean(),
    /**
     * Parsed for Rust parity, but the SERVER REJECTS a card containing a true
     * value at the tool boundary (see §6). No renderer may mask an input.
     */
    isSecret: z.boolean(),
  })
  .strict();

export const ClarifyCardBodySchema = z
  .object({
    prompt: z.string().max(600).optional(),
    questions: z.array(ClarifyQuestionSchema).min(1).max(CLARIFY_MAX_QUESTIONS),
    state: z.discriminatedUnion('status', [
      z.object({ status: z.literal('pending') }).strict(),
      z
        .object({
          status: z.literal('answered'),
          answeredAt: IsoDate,
          answers: z
            .array(
              z.discriminatedUnion('kind', [
                z
                  .object({
                    questionId: z.string().min(1).max(64),
                    kind: z.literal('options'),
                    optionIds: z.array(z.string().min(1).max(64)).max(CLARIFY_MAX_OPTIONS),
                    labels: z.array(z.string().max(80)).max(CLARIFY_MAX_OPTIONS),
                  })
                  .strict(),
                z
                  .object({
                    questionId: z.string().min(1).max(64),
                    kind: z.literal('other'),
                    text: z.string().max(500),
                  })
                  .strict(),
                z
                  .object({ questionId: z.string().min(1).max(64), kind: z.literal('skipped') })
                  .strict(),
              ]),
            )
            .max(CLARIFY_MAX_QUESTIONS),
        })
        .strict(),
      z
        .object({
          status: z.literal('dismissed'),
          dismissedAt: IsoDate,
          freeText: z.string().max(2_000).optional(),
        })
        .strict(),
      z
        .object({
          status: z.literal('expired'),
          reason: z.enum(['checkpoint_gone', 'turn_failed', 'superseded']),
        })
        .strict(),
    ]),
  })
  .strict()
  /**
   * Every answer must name a question that exists, and every selected option must
   * exist on that question. Without this a resumed turn could render an option the
   * user never saw.
   */
  .superRefine((body, ctx) => {
    const byId = new Map(body.questions.map((q) => [q.id, q]));
    if (body.state.status !== 'answered') return;
    for (const answer of body.state.answers) {
      const question = byId.get(answer.questionId);
      if (!question) {
        ctx.addIssue({
          code: 'custom',
          message: `answer for unknown question ${answer.questionId}`,
        });
        continue;
      }
      if (answer.kind === 'other' && !question.isOther) {
        ctx.addIssue({ code: 'custom', message: `free text on non-other question ${question.id}` });
      }
      if (answer.kind === 'options') {
        if (!question.multiSelect && answer.optionIds.length > 1) {
          ctx.addIssue({
            code: 'custom',
            message: `multiple answers to single-select ${question.id}`,
          });
        }
        const ids = new Set(question.options.map((o) => o.id));
        for (const selected of answer.optionIds) {
          if (!ids.has(selected)) {
            ctx.addIssue({
              code: 'custom',
              message: `unknown option ${selected} on ${question.id}`,
            });
          }
        }
      }
    }
  });

// --- itinerary.v1 -----------------------------------------------------------

/**
 * `.strict()` on BOTH branches is load-bearing: it stops a stray `lat` or
 * `providerPlaceId` riding along on the unresolved branch and being picked up by
 * a permissive consumer. Shape strictness buys presence, not truth — only the
 * resolver round-trip buys truth.
 */
export const PlaceIdentitySchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('resolved'),
      provider: z.string().min(1).max(64),
      providerPlaceId: z.string().min(1).max(512),
      lat: z.number().gte(-90).lte(90),
      lng: z.number().gte(-180).lte(180),
      displayName: z.string().min(1).max(200),
      formattedAddress: z.string().min(1).max(500),
      resolvedAt: IsoDate,
      attribution: z
        .object({
          providerLabel: z.string().min(1).max(80),
          providerUrl: HttpsUrlSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      status: z.literal('unresolved'),
      query: z.string().min(1).max(300),
      reason: z.enum([
        'no_match',
        'ambiguous',
        'outside_region',
        'provider_error',
        'rate_limited',
        'not_permitted_in_this_chat',
      ]),
    })
    .strict(),
]);

const MediaRefSchema = z
  .object({
    fileId: z.string().min(1).max(128),
    width: z.number().int().positive().max(4_096),
    height: z.number().int().positive().max(4_096),
    alt: z.string().max(300),
  })
  .strict();

const SourceSchema = z.object({ url: HttpsUrlSchema, title: z.string().min(1).max(120) }).strict();

export const ItineraryCardBodySchema = z
  .object({
    title: z.string().min(1).max(200),
    summary: z.string().max(2_000),
    summarySources: z.array(SourceSchema).max(16),
    region: z
      .object({ label: z.string().min(1).max(200), timeZone: z.string().min(1).max(64) })
      .strict(),
    places: z.array(PlaceIdentitySchema).min(1).max(12),
    stops: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            pin: z.number().int().positive().max(12),
            placeIndex: z.number().int().gte(0).lt(12),
            startTimeLabel: z.string().max(24),
            note: z.string().max(240),
            thumbnail: MediaRefSchema.optional(),
            sources: z.array(SourceSchema).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    route: z.discriminatedUnion('status', [
      z
        .object({
          status: z.literal('available'),
          travelMode: z.enum(['driving', 'walking', 'bicycling', 'transit']),
          legs: z
            .array(
              z
                .object({
                  label: z.string().min(1).max(120),
                  url: HttpsUrlSchema.max(4_096),
                  stopIds: z.array(z.string().min(1).max(64)).min(2),
                })
                .strict(),
            )
            .min(1)
            .max(8),
        })
        .strict(),
      z
        .object({
          status: z.literal('unavailable'),
          reason: z.enum([
            'unresolved_stops',
            'too_few_stops',
            'provider_unavailable',
            'not_permitted_in_this_chat',
          ]),
          unresolvedStopCount: z.number().int().gte(0).max(12),
        })
        .strict(),
    ]),
    overview: MediaRefSchema.optional(),
  })
  .strict()
  /**
   * THE INVARIANTS THAT WOULD HAVE PREVENTED THE ANAHEIM LINK. Enforced at the
   * untrusted boundary, on every surface, independently of any UI code. The type
   * makes the wrong RENDER impossible; this makes the wrong PAYLOAD impossible,
   * so a producer bug fails validation instead of shipping.
   */
  .superRefine((body, ctx) => {
    for (const stop of body.stops) {
      if (stop.placeIndex >= body.places.length) {
        ctx.addIssue({ code: 'custom', path: ['stops'], message: 'placeIndex out of range' });
      }
    }
    const unresolved = body.places.filter((p) => p.status === 'unresolved').length;
    if (body.route.status === 'available' && unresolved > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['route'],
        message: `route marked available with ${unresolved} unresolved place(s)`,
      });
    }
    if (body.route.status === 'unavailable' && body.route.reason === 'unresolved_stops') {
      if (body.route.unresolvedStopCount !== unresolved) {
        ctx.addIssue({ code: 'custom', path: ['route'], message: 'unresolved count mismatch' });
      }
    }
  });

// --- the single dispatch point every surface calls --------------------------

/**
 * NEVER THROWS. A card that fails body validation is NOT dropped — it degrades to
 * `recognized: false`, keeping its envelope and its fallback. A validation bug
 * costs the user the widget, never the answer.
 *
 * Returns null only when the payload is not an envelope at all. Callers MUST
 * still render `fallback` for any card whose `interaction.awaitingResponse` is
 * true — a suspending card that renders nothing is a silently truncated turn.
 */
export function parseInteractiveCardDelta(payload: unknown): InteractiveCard | null {
  const envelope = InteractiveCardEnvelopeSchema.safeParse(
    (payload as { card?: unknown } | null)?.card,
  );
  if (!envelope.success) return null;
  if (JSON.stringify(envelope.data).length > INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH) return null;

  const { kind, body: rawBody, ...common } = envelope.data;

  // A newer MAJOR schema degrades to fallback, it does not vanish.
  if (envelope.data.schemaVersion > 1) return { ...common, recognized: false, kind };
  if (!isKnownInteractiveCardKind(kind)) return { ...common, recognized: false, kind };

  const parsed =
    kind === 'clarify.v1'
      ? ClarifyCardBodySchema.safeParse(rawBody)
      : ItineraryCardBodySchema.safeParse(rawBody);
  if (!parsed.success) return { ...common, recognized: false, kind };

  return { ...common, recognized: true, kind, body: parsed.data } as InteractiveCard;
}

/** Mirrors readPersistedCloudToolApproval. Salvages per card; one bad card never blanks the list. */
export function readPersistedInteractiveCards(metadata: unknown): InteractiveCard[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const raw = (metadata as Record<string, unknown>)['interactiveCards'];
  if (!Array.isArray(raw)) return [];
  const out: InteractiveCard[] = [];
  for (const entry of raw.slice(0, 4)) {
    const card = parseInteractiveCardDelta({ card: entry });
    if (card) out.push(card);
  }
  return out;
}

// --- resume: an ADDITIVE WIDENING of the existing approval contract ---------

/**
 * REPLACES `ToolApprovalResumeRequestSchema` in ./tool-approval-resume.ts.
 *
 * `tool_approvals` relaxes from `.min(1)` to optional — a WIDENING, so every
 * existing client body still validates unchanged. Deliberately NOT `.strict()`:
 * that module's own doc states unknown fields are stripped and never become an
 * execution source, and making it strict would convert a documented strip into a
 * 400 for existing callers.
 *
 * Still only a stable run reference plus explicit user decisions cross the trust
 * boundary. Model, transcript, tool arguments, provider continuity and the event
 * cursor all load server-side from the tenant-owned checkpoint.
 */
export const InteractiveCardResponseSchema = z
  .object({
    /** MUST equal the pending tool_call_id. See §6, answer authentication. */
    card_id: z.string().min(1).max(128),
    /** Server re-derives the expected kind from the checkpointed tool name and rejects a mismatch. */
    kind: z.string().min(1).max(64),
    outcome: z.enum(['answered', 'dismissed']),
    answers: z
      .array(
        z
          .object({
            question_id: z.string().min(1).max(64),
            option_ids: z.array(z.string().min(1).max(64)).max(CLARIFY_MAX_OPTIONS).optional(),
            text: z.string().max(500).optional(),
            skipped: z.boolean().optional(),
          })
          .strict(),
      )
      .max(CLARIFY_MAX_QUESTIONS)
      .optional(),
    freeform_response: z.string().max(2_000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.outcome === 'answered' && !value.answers?.length && !value.freeform_response) {
      ctx.addIssue({ code: 'custom', message: 'answered outcome carries no answer' });
    }
  });

export const TurnResumeRequestSchema = z
  .object({
    run_id: z.string().uuid(),
    tool_approvals: z
      .array(
        z.object({
          tool_call_id: z.string().min(1).max(128),
          decision: z.enum(['approved', 'rejected']),
        }),
      )
      .max(32)
      .optional(),
    card_responses: z.array(InteractiveCardResponseSchema).max(4).optional(),
  })
  .superRefine((value, ctx) => {
    const total = (value.tool_approvals?.length ?? 0) + (value.card_responses?.length ?? 0);
    if (total === 0) {
      ctx.addIssue({ code: 'custom', message: 'resume body carries no decisions' });
    }
  });
export type TurnResumeRequest = z.infer<typeof TurnResumeRequestSchema>;
```

### 4c. Pure answer rendering (shared by server, tests, and CLI degradation)

Add to `packages/contracts/types/src/interactive-cards.ts`. **This is the security crux of the
answer channel:** the client supplies option ids; the server writes the sentence, reading every
label out of the **checkpointed** question set. An option id the server did not issue is silently
dropped. Making it one exported pure function means the server, the unit tests and the CLI
provably produce the identical string.

```ts
/**
 * Render the model-readable tool result for an answered clarify card.
 *
 * `body` MUST be the checkpointed question set, never the client's payload.
 * Deterministic and side-effect free so every consumer agrees byte for byte.
 */
export function renderClarifyAnswersForModel(
  body: ClarifyCardBody,
  answers: ClarifyAnswer[],
  freeText?: string,
): string {
  if (freeText && freeText.trim().length > 0) {
    return `The user did not answer the questions and responded instead: ${freeText.trim()}`;
  }
  const byId = new Map(answers.map((a) => [a.questionId, a] as const));
  const lines: string[] = [];
  for (const question of body.questions) {
    const answer = byId.get(question.id);
    if (!answer || answer.kind === 'skipped') {
      lines.push(`${question.question}: (not answered)`);
      continue;
    }
    if (answer.kind === 'other') {
      // Anthropic's documented guidance: use the user's text as the answer value,
      // not the word "Other". Delimited so the model reads it as DATA, never as
      // an instruction.
      lines.push(`${question.question}: user-typed: "${answer.text.trim()}"`);
      continue;
    }
    const labels: string[] = [];
    for (const optionId of answer.optionIds) {
      const option = question.options.find((o) => o.id === optionId);
      if (option) labels.push(option.label); // unknown ids dropped, never echoed
    }
    lines.push(`${question.question}: ${labels.length > 0 ? labels.join(', ') : '(not answered)'}`);
  }
  return `The user answered the clarifying questions:\n${lines.join('\n')}`;
}
```

---

## 5. Per-surface rendering and degradation

The repo has **three independent renderer families, not one shared renderer** (verified: only
`apps/desktop` and `apps/web` depend on `@agiworkforce/unified-chat`; mobile is React Native with
no DOM; Chrome and VS Code build DOM imperatively; CLI is Ratatui text). The unified-chat
`AGENTS.md` claim that the package is shared across five surfaces is **not true of the manifests**
and should be corrected.

| Surface                | Renderer family                                | `clarify.v1`                                                                                                                      | `itinerary.v1`                                                                                                   | Answer? | Governing constraint                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web**                | React DOM (its own 1,906-line `MessageBubble`) | Full card, tap to select                                                                                                          | Full: static map image, side panel, scrollable time-ordered rows, thumbnails                                     | **Yes** | Owns the sandbox-origin precedent if a live map ever ships                                                                                                                                                                                                                                                                                                              |
| **Desktop (Tauri)**    | React DOM via unified-chat `MessageBubble`     | Full card                                                                                                                         | Full                                                                                                             | **Yes** | Tauri packaged CSP is `script-src 'self' 'wasm-unsafe-eval'` — no CDN, no live third-party map SDK                                                                                                                                                                                                                                                                      |
| **Desktop (Electron)** | **Both, depending on shell**                   | Inherits web _or_ desktop                                                                                                         | Inherits web _or_ desktop                                                                                        | **Yes** | `AGI_CLOUD_RENDERER=remote` (**default**) loads the hosted web app; `bundled` serves the desktop build. **A card is only "on Electron" once BOTH web and unified-chat land it** — the two shells visibly disagree in between. `RENDERER_CSP` has `frame-src 'self' https://js.stripe.com` and a same-host `connect-src`, so a live maps SDK cannot load or fetch tiles. |
| **Mobile (RN)**        | React Native views                             | Full card (follows the existing `ApprovalCard`, which already proves an answerable card works inline in the FlashList transcript) | **List only** — ordered rows with times, resolved names, addresses, per-place links. `canRenderMapCards: false`. | **Yes** | No DOM. Links go through the existing untrusted-model-output path (`isValidExternalHttpUrl` → in-app browser; system-intent schemes require a confirmation Alert)                                                                                                                                                                                                       |
| **Chrome MV3**         | Imperative DOM (`createElement` only)          | Full card, answerable                                                                                                             | **List only, no imagery**                                                                                        | **Yes** | `img-src 'self' data:` forbids remote images entirely. `AGENTS.md` forbids new `innerHTML`/dynamic-injection without a threat-model update                                                                                                                                                                                                                              |
| **VS Code**            | Template-literal HTML + one nonced script      | **Read-only**, plus one line: "Answer this in the AGI Workforce app."                                                             | Read-only list (`img-src <cspSource> https:` _does_ allow thumbnails here)                                       | **No**  | Zero in-transcript interactivity today (`addMessage()` is `div.textContent`); approvals are a native modal; CSP is `script-src 'nonce-…' <cspSource>` with no `frame-src`. Never renders a dead button.                                                                                                                                                                 |
| **CLI**                | Ratatui text cells                             | `fallback.text` verbatim                                                                                                          | `fallback.text` verbatim                                                                                         | **No**  | `struct ChatMessage { role, text }` — text only. Headless runs **must not hang**: resolve every question as `skipped` (mirrors `PermissionMode::DontAsk`'s auto-deny, `cli_options.rs:57-67`)                                                                                                                                                                           |

Note the deliberate asymmetry: Chrome gets no imagery but _can_ answer; VS Code gets imagery but
_cannot_ answer. That is why the capability is two booleans, not one. It is also exactly how
Anthropic ships — weather is web/desktop only, sports is text everywhere, custom visuals are
web/desktop beta — decided per feature and per surface, never by one global rule.

### The two degradation gates

**Gate 1 — the client never receives what it cannot render.** `x_interactive_cards.supported` is
declared by the client and enforced server-side. A client that does not declare support is
offered no card-producing tools and receives no delta. CLI, VS Code, and every client built
before this feature fall here automatically, and their behaviour is **bit-identical to today**.
This is a structural answer to the repo's twice-hit "a new delta silently vanished on a surface
that never decoded it" failure (documented in-code at `cloudStreamDeltas.ts:9-13`, and at
`:465-470` where an unread `x_code_result` left a card spinning forever): the failure degrades
from "broken card" to "no card".

**Gate 2 — a declaring client that meets an unknown kind or version.** The envelope parses (open
`schemaVersion`, open `kind`, `body: unknown`), `parseInteractiveCardDelta` returns
`recognized: false`, `resolveInteractiveCardRenderer` returns `null`, and the surface renders
`fallback.text`. The body is not merely ignored — **it is absent from the type**, so no renderer
can reach for it (TS2339).

**Gate 2b — a _known_ kind whose body fails validation.** Same outcome. A validation bug costs the
user the widget, never the answer.

**Belt and braces:** the server emits one short authored `delta.content` line immediately before
ending the stream at a suspension point ("I have a few quick questions before I continue."). This
is cheap insurance: `toolApprovalRequestEvent` (`tool-loop.ts:662`, verified) emits **only** the
extension key today, so without this a mis-set gate produces a bare truncated turn. With it, the
worst case is a turn that ends with a readable reason and a user who can simply type.

### What is never degraded into

There is no path that renders a map card from a name-built link, no path that enables a route
button from a partially-parsed payload, and no path that renders a card from a payload that
failed `superRefine`. **A missing affordance is the only permitted failure mode.**

### Local / BYOK

Cards are **`cloud_managed` only** in every slice of this plan, and that is a product limitation to
state up front rather than discover later. Two independent reasons: place resolution is
third-party egress that `guardedFetch`/`isOurCloudHost` must block for Local, and desktop SQLite
`messages` has no metadata column (verified: `ensure_column` exists for provider/model/
context_items/images/tool_calls/artifacts and nothing else) while mobile's has none either — so
an answered card genuinely cannot persist outside Managed Cloud. The tools are simply not offered
on those boundaries; a Local chat gets prose and never sees a control it cannot honour.

### Layout

Mid-response placement is more ambitious than anything Anthropic ships. Reserve the card's height
on mount, key rows by `stop.id` and never by array index, and give the itinerary list a bounded
height with `overscroll-behavior: contain` — a scrollable list inside a scrolling message inside
a scrolling page is a known touch-scroll trap on mobile.

---

## 6. Security model

### What the model is allowed to emit

| Field                                                              | Author                                       | Rationale                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Question text, headers, option labels and descriptions             | **Model**                                    | Pure text, no real-world identity stakes. Safe to model-author.                                                                                                                                                |
| `ItineraryToolInputStop.placeQuery`, `.localityHint`               | **Model**                                    | A _search string_, documented in the tool description as explicitly not an identifier.                                                                                                                         |
| `startTimeLabel`, `note`, `title`, `summary`                       | **Model**                                    | Presentation prose, rendered as text only, never as an identifier or a URL.                                                                                                                                    |
| `providerPlaceId`, `lat`, `lng`, `displayName`, `formattedAddress` | **Server (resolver)**                        | Identity. The model has no field for these — `INTERACTIVE_CARD_IDENTITY_GUARD` makes adding one a build error.                                                                                                 |
| Every URL: route legs, sources, attribution                        | **Server**                                   | The registries contain no URL assembly at all.                                                                                                                                                                 |
| `fallback.text`                                                    | **Server**                                   | Authored from the same payload by the same code, so it can never disagree with the card.                                                                                                                       |
| `route`                                                            | **Server, recomputed**                       | The handler **discards** whatever route the model proposed and derives it from the resolved identities. Discarding is strictly stronger than validating.                                                       |
| Thumbnails / map image                                             | **Server**, as `fileId` into our own catalog | A model- or resolver-chosen remote host is an exfiltration channel: the fetch alone leaks the viewer's IP, UA and referrer to a third party on behalf of a chat whose trust boundary the widget does not know. |

**The model never emits markup.** Not HTML, not JSX, not CSS, not markdown-with-embedded-HTML.
The registry constrains _which_ component renders; the Zod parse constrains _what props it gets_.
Both are required — the AI SDK's own documented `<Weather {...part.output} />` idiom, which
spreads model-authored JSON straight into props, is precisely the shape of the founder's bug.
Every renderer signature takes a post-parse, post-`superRefine` body, and there is no code path
from an unvalidated object into a component.

### `isSecret` is rejected, not honoured

The model authors `isSecret`. Honouring it means rendering a **masked input inside first-party
chrome the user trusts**, which makes a model-authored prompt look _more_ legitimate, not less.
Redacting the answer before persistence protects the database and not the user — the plaintext
still reaches model context and goes out to the provider on the next call. **The server rejects
any `ask_clarifying_questions` call containing a question with `isSecret: true`**, returning a
`tool_result` with `is_error: true` and a model-readable explanation. No surface implements a
masked card input. The field remains in the contract only for parity with the existing Rust
struct, and `renderClarifyAnswersForModel` has no code path that could emit one.

### What is validated where

1. **Model → server (tool input).** JSON Schema with `additionalProperties: false`, plus
   `strict: true` where the provider supports it. **`strict` is OpenAI-only in this repo**
   (`packages/ai/providers/openai/src/translate.ts:242` gates on
   `compat.supportsStrictMode && tools.some(t => t.strict)`), so the server **must** re-validate
   every tool input with its own Zod schema regardless of provider and, on failure, return a
   `tool_result` with `is_error: true` rather than emit a card.
2. **Server → wire (card construction).** The card is built server-side, validated against
   `ItineraryCardBodySchema` / `ClarifyCardBodySchema` _before emission_, and rejected if it
   exceeds `INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH`. We never emit a card that will not persist.
3. **Wire → client (every surface).** `parseInteractiveCardDelta`, which never throws. All three
   TS decoders call the same shared function; **no surface hand-declares the wire shape** (the
   stated rule at `tool-events.ts:16-21`).
4. **Client → server (the answer).** Six ordered, fail-closed gates — below.
5. **Persisted metadata → render.** `readPersistedInteractiveCards`, list-salvaging.

### How the answer channel is authenticated to the turn

This is the genuinely new trust surface: today only `run_id` + `approved|rejected` crosses the
resume boundary, and a card answer is arbitrary structured user input that becomes a `role: 'tool'`
message. **Review this as a security change, not a feature change.**

```
POST /api/llm/v1/chat/completions/approve
  { run_id, card_responses: [{ card_id, kind, outcome, answers }] }
```

1. **Claim.** `run_id` claims the tenant-owned checkpoint under a lease. RLS is enabled _and
   forced_; the one-active-per-run partial index and `unique(run_id, version)` already allow a
   single turn to pause repeatedly.
2. **Decision-set synthesis.** For each `card_response`, the route synthesises a
   `{toolCallId: card_id, decision: outcome === 'dismissed' ? 'rejected' : 'approved'}` entry and
   merges it with any real `tool_approvals`. **This is required**, because
   `claimCloudAgentApprovalCheckpoint` re-parses approvals with `.min(1)` and enforces exact set
   equality against the checkpoint's pending tool-call ids (verified). Because `card_id ===
tool_call_id`, the existing invariant holds unchanged and the service is not modified.
3. **Membership.** Every `card_id` must be in the checkpoint's `pending_tool_calls`. Reuse the
   existing `approval_resume_unknown_tool_call` reject-everything path — a mismatch executes
   nothing.
4. **Registry.** The pending call's `qualifiedName` must pass `isClientExecutedTool` against a
   **server constant**. A client-supplied result for `web_search`, `url_fetch`, a connector or
   E2B is rejected outright. This is what bounds the channel.
5. **Kind match.** `card_response.kind` must equal the kind the server derives from the
   checkpointed tool name. A client cannot re-label a card into a different response schema.
6. **Schema + label resolution.** The response parses against the server-owned schema; unknown
   fields are stripped and never become an execution source. Then the server calls
   `renderClarifyAnswersForModel(checkpointedBody, answers)` — **the client never supplies the
   string that enters model context.** It supplies option ids; every label is read out of the
   checkpoint; unknown ids are dropped. This closes the attack where a client makes the transcript
   say "Relaxed" while the model receives something else.

Free text is capped, delimited, and prefixed `user-typed:` so the model reads it as **data, never
as instructions** (AGENTS.md LLM Failure Prevention Rules).

Also preserved from the existing path, and the reason we widened it rather than replacing it:
**AGT-5** (terminal-run revival guard), **CON-1/CON-2** (connector permission recheck and
approved→rejected rewrite), **GOV-7** (per-plan connector ceiling on resume), the managed-compute
gate, `processRequest` revalidation, and the managed-usage **reserve→settle** cycle. Every
clarifying answer resumes generation and burns provider tokens; `providerStream.ts:43-58`
documents what the repo already paid for when a resume path skipped metering.

### One more fix required in the same slice

`mapPendingApproval` (`cloud-agent-run-service.ts:230`, verified) projects **every** pending call
into the run inbox as `pendingApproval`. It must classify by `qualifiedName` so a waiting question
is not labelled "approval" on the Tasks page. Either that, or the checkpoint gains a `kind`
discriminator column (`'tool_approval' | 'user_input'`) — the cheaper classification is enough
for slice 2; the column is nicer and can follow.

---

## 7. Place identity

### The failure, stated precisely

The tool output carried human-readable **display names**, and the button reconstructed identity
from a _label_ at render time. Every layer behaved "correctly." The defect is that **place
identity was never in the payload at all**, and the type system was never told the difference
between a display string and an identifier.

### The concrete rule

> **The model authors a query. The server authors identity. A stop carries a pointer, never a
> name. A route URL exists only when every place resolved, and only the server can build one.**

Five barriers, each independently sufficient:

**Barrier 1 — the model has no field to write an identity into.** `ItineraryToolInputStop` is
`{startTimeLabel, note, placeQuery, localityHint}`. No name, no address, no coordinates, no id,
no URL. `ItineraryStop` is `{id, pin, placeIndex, startTimeLabel, note, thumbnail?, sources}` —
identity lives exclusively in `places[]`, which the _server_ fills. This is Anthropic's own
principle: every citation location type has the model emit an index, never the quote, and the docs
give the reason — "citations are guaranteed to contain valid pointers to the provided documents."
Verified as a compile error: `stop.name` is TS2339.

**Barrier 2 — unresolved identity is structurally unrenderable.** `PlaceIdentity` is a
discriminated union with `.strict()` on both branches. The `unresolved` branch has no `lat`, no
`lng`, no `providerPlaceId` and no `formattedAddress` _in the type_. An optional `placeId?` would
have been silently skipped by exactly the code that shipped the bug — that is the whole reason
this is a union and not an optional field.

**Barrier 3 — the resolver refuses ambiguity.** Resolve the **region first**, then resolve each
stop **biased to that region**. A match is `resolved` only if it is unique and high-confidence
within the region; multiple candidates → `ambiguous`; outside the region → `outside_region`.
**Never pick the top hit.** "South Park" resolved without a region bias is globally ambiguous —
that is not a Maps bug, it is the documented behaviour of a fuzzy geocoder given a free-text
string. And note the limit of schema strictness: a model emitting a `providerPlaceId` from its
weights would be strictly _worse_ than an unresolved marker, because it deep-links somewhere real
and wrong.

**Barrier 4 — the URL branch is the only branch with a URL.** `ItineraryRoute` is a union whose
`unavailable` branch has no `url` and no `legs`. There is no runtime `if` to forget. A zod
`superRefine` enforces that `status: 'available'` requires **every** place resolved, so a producer
bug fails validation instead of shipping. The client never concatenates a maps URL — enforced by
a repo test that greps the three registry directories for `google.com/maps`, `maps.app.goo.gl`,
`?api=1` and template-literal URL assembly, failing the build on a hit.

**Barrier 5 — the server discards the model's proposed route.** The itinerary handler does not
_validate_ the model's route; it throws it away and recomputes from the resolved identities.

### What the card shows when identity is unresolved

- The row renders the model's `query` with a visible **"location not confirmed"** state, **no
  pin**, and **no link**. The query is display text on a branch that has no URL field.
- `route.status` is `'unavailable'` with `unresolvedStopCount`, so "Open route" renders **disabled
  with a plain sentence**: _"2 of 6 places couldn't be confirmed — route link unavailable."_
- Resolved stops still offer their **own per-place link**. Partially-resolved itineraries offer
  per-stop links, **never** a whole-route link.
- More stops than the waypoint cap → `legs[]`, honestly labelled, rather than a silently truncated
  route (a route quietly cut from 8 stops to 3 is the same confident lie in a smaller costume).
- Resolver down entirely → the whole card degrades to the authored fallback list.

**A greyed button with an honest sentence is a better product than a live button to Anaheim.** A
confident-looking widget that deep-links to the wrong city is worse than a list — so the list is
the floor, and every failure path falls to it.

### The through-line

The same inversion appears three times, which is why I believe it is the right architecture rather
than a local patch:

- **Places:** model emits `placeQuery`; **server** emits `providerPlaceId`, `displayName`, route URL.
- **Clarify answers:** client emits `optionId`; **server** resolves the label the model receives.
- **Citation chips:** card emits a stable `stopId` anchor; **server** owns the URL.

Pointers in, identity out. Everywhere.

### Regression fixtures (land with the resolver, before any UI)

The captured failure becomes two tests: `("South Park", "San Francisco, CA")` and
`("Frontier Tower", "San Francisco, CA")`, asserting (a) resolved coordinates fall inside an SF
bounding box, (b) with the locality hint removed the resolver returns `ambiguous` and the route is
`unavailable`, and (c) the built URL string contains no percent-encoded stop **name**.

---

## 8. Slices

Each slice is independently shippable and independently valuable. Nothing later is required to
make anything earlier correct.

### Slice 1 — the wire can carry a card, and web renders its fallback

**Genuinely small, one surface, no producer.** Ships the degradation path _before_ anything can
depend on it, because a degradation path retrofitted under deadline pressure is a degradation path
that does not work.

- **Files:** `packages/contracts/types/src/interactive-cards.ts` (new) + one export line in
  `src/index.ts`; `packages/contracts/cloud-contracts/src/interactive-cards.ts` (new) + one export
  line; `apps/web/lib/hooks/useChatStream.ts` (one new `delta.x_interactive_card` branch beside the
  existing `x_*` reads); `apps/web/features/chat/components/messages/MessageBubble.tsx` (one
  `<InteractiveCardBlock>` after prose); delete or `@deprecated`-mark
  `packages/contracts/types/src/mcp-apps.ts` (verified: zero consumers repo-wide, declares
  `props: Record<string, unknown>` — the exact anti-pattern this contract prevents).
- **Tests:** a golden SSE fixture containing an **unknown** `kind` and a **higher**
  `schemaVersion`, asserting each renders `fallback.text` with surrounding prose intact; a fixture
  with a malformed body asserting `recognized: false`; `parseInteractiveCardDelta` never throws on
  100 fuzzed inputs; the `INTERACTIVE_CARD_IDENTITY_GUARD` type assertion compiling in CI; a
  `@ts-expect-error` suite proving `card.body` on the unrecognized branch, `place.lat` on the
  unresolved branch, and `route.legs` on the unavailable branch are all TS2339; existing
  stream-transform golden and byte-parity fixtures proven **unchanged**.
- **Done:** replay a card-bearing SSE fixture through the web transcript and see the authored
  fallback text render inside card chrome, with the assistant's prose above and below it intact.
  Zero user-visible change in production. `mcp-apps.ts` can no longer be wired by mistake.

### Slice 2 — `clarify.v1` end to end on web, same-turn absorption

The founder's feature #1, complete, on one surface. Pure text, zero identity stakes, reusing the
production-hardened suspend/resume machinery.

- **Files:** `tool-loop.ts` (the `'client'` verdict in `resolveToolCallGate`; the
  `ask_clarifying_questions` tool with no executor; the `isSecret` rejection; the authored prose
  line before suspension; the `x_interactive_card` emission in **both** `buildStreamResponse` and
  `buildAdapterStreamResponse` — they are deliberately separate functions);
  `approve/route.ts` (parse `TurnResumeRequestSchema`; synthesise the decision set; the six gates);
  `cloud-agent-run-service.ts` (`mapPendingApproval` classification);
  `request-processor.ts` (`x_interactive_cards` capability read);
  `crates/agiworkforce-protocol/src/request_user_input.rs` (+`multiSelect`, per-option `id`) and
  regenerated ts-rs bindings; `assistant-turn-persistence.ts` (`metadata.interactiveCards` under
  the **shared** `assistant_message_id` with `on conflict (id) do update` and `||` merge — a
  server-invented id duplicates every saved turn); web `MessageBubble` + `ChatRuntime`.
- **Tests:** answers resume the **same** assistant message id, not a new one; a resume with a
  forged `card_id` executes nothing; a resume naming `web_search` is rejected by the registry gate;
  an unknown `option_id` is dropped and never reaches model context; `renderClarifyAnswersForModel`
  golden strings incl. multi-select, "Other", and skipped; a card with `isSecret: true` is rejected
  at the tool boundary; reload re-renders the answered card with chosen labels as sub-labels; an
  expired checkpoint renders `expired` with **no buttons**; the reserve→settle cycle runs on
  resume; **AGT-5/CON-1/CON-2/GOV-7 regression tests still pass on the widened body**; an existing
  approval-only body still validates byte-for-byte.
- **Done:** ask the assistant something ambiguous on web; a card appears mid-response; tapping is
  local; one Submit continues the same turn; reload shows the answered card.

### Slice 3 — `clarify.v1` on desktop, mobile and Chrome; VS Code and CLI honest

- **Files:** `packages/ui/unified-chat` (`MessageBubble` + registry + `StreamEvent` variant +
  `CloudMessageProjection.interactiveCards` + merge); `apps/desktop/src/runtime/cloudStreamDeltas.ts`
  (decode + extend `isSuspended()`); `apps/mobile/services/streaming.ts` + a new RN card component
  following `ApprovalCard`; `apps/extension/src/features/side-panel/bubbles.ts` (`createElement`
  only); VS Code read-only render; CLI `fallback.text` + headless auto-skip.
- **Tests:** one shared fixture parsed identically by all three TS decoders; RN card answerable in
  the FlashList transcript; Chrome renders no remote imagery; VS Code renders **no** buttons; CLI
  headless resolves `skipped` and **does not hang**.
- **Done:** the feature is honest on all six surfaces. Each surface declares
  `x_interactive_cards` only once its decoder lands — until then it is simply never sent a card,
  which is the correct pre-state. **Note:** Electron is only covered once _both_ web (slice 2) and
  unified-chat (this slice) have landed.

### Slice 4 — the place resolver, exposed as **text only**

No card, no map, no pins. Ships the identity contract before anything renders it, so accuracy,
cost and unresolved-rate are **measured** before a single pixel depends on them.

- **Files:** a new server-only resolver service; a resolution cache table (next migration is
  **0093** — verified, latest is 0092) with a TTL that respects the chosen provider's caching
  terms; quota and cost metering; the server-only `buildMapsDeepLink(stops: readonly ResolvedPlace[])`
  with **no** name-accepting overload; the `resolve_places` tool.
- **Tests:** the two Irving-TX / Anaheim-CA regression fixtures (above); ambiguity returns
  `unresolved`, never a best guess; the resolver is unreachable from any client bundle; the grep
  test forbidding URL assembly in any registry directory; quota exhaustion returns
  `reason: 'rate_limited'` rather than a guess.
- **Done:** the model answers place questions in prose with resolver-authored addresses, and we
  have real numbers for unresolved-rate and per-resolution cost.

### Slice 5 — `itinerary.v1` as a **list** card

The slice where the founder's captured failure is provably fixed — and it ships before any map
pixel exists.

- **Files:** the `plan_itinerary` tool (route recomputed, model's route discarded); card
  construction + the 12k cap; thumbnail/static-map generation through the **existing**
  `persistGeneratedFiles` path (`stream-transform.ts:802`, which already produces "durable,
  same-origin renderable URLs in-band"); itinerary renderers in all three families.
- **Tests:** an itinerary with one unresolved stop yields `route.status: 'unavailable'` and renders
  a disabled button with the honest count; a payload asserting `available` with an unresolved place
  fails `superRefine`; a real 8-stop payload **measured** against the 32k metadata budget; >cap
  stops split into `legs`; `metadataTrimmed` fires honestly if it does not fit.
- **Done:** a real day plan renders as a time-ordered list with resolved addresses and a route
  button that is correct or absent. Shippable as a product on its own.

### Slice 6 — the map surface, web + desktop only

Numbered pins bound 1:1 to `stop.pin`, viewport fitting, pin↔row hover binding, required
attribution rendered in the same visual container. Pins render **only** for resolved places, so
pin-to-row identity is exact by construction. Mobile and Chrome keep the list. Static image first;
a live pannable map is a separate CSP amendment + sandbox origin + threat-model update and stays
off the critical path. **If this slips, slice 5 is still a shippable product.**

### Slice 7 — card-scoped source chips

Pills anchored by stable `stopId`, rendered next to the claim. Explicitly **not** the prose-level
citation path — see §9 Q5.

### Slice 8 — the feature-intro modal

Flag-gated local UI state plus per-user seen-state. **Not a message part** — modelling it as one
would put marketing chrome into the persisted transcript and into model context on every
subsequent turn. Its "live preview" renders the **real registry** against the slice-1 golden
fixture, so the preview can never drift from the shipped renderer. Last, because it advertises
capabilities that must already work on the surface showing it. Borrows no branding or copy (§2).

---

## 9. Open questions

**Q1. Which place-resolution provider, and who holds the key?**
There is **zero** place-identity infrastructure in this repo — verified. This is the single
largest unbuilt dependency, and the wrong-city link was not a bug in a working resolver; there is
no resolver. The decision carries provider choice, key custody, per-request cost, quota under a
burst of 8-stop itineraries, cache TTL versus the provider's caching terms, and **contractual**
attribution requirements (Google's are not advisory: sources must immediately follow the content
they support, be viewable within one user interaction, and the string "Google Maps" must not be
restyled or re-capitalised — that obligation lands inside the renderer, on all three
implementations).
_Recommended:_ a **server-held key, no BYOK path** (a user key moves the trust boundary and there
is no maps-key handling anywhere in the repo to extend). Decide the provider at the start of
slice 4, record it in the plan, and gate the tool behind its presence so an unconfigured
deployment offers no card rather than a broken one. **Founder decision required** on cost
tolerance per resolution.

**Q2. VERIFY before the route button ships (external dependency, not a decision).**
Two facts neither the repo nor the research confirmed: (a) whether Maps URLs' `*_place_id` params
require their corresponding free-text param (`destination_place_id` alongside `destination`), and
(b) the current per-platform waypoint cap (reported as 3 on mobile browsers vs 9 otherwise, which
an 8-stop day exceeds).
_Recommended:_ verify both with one live call during slice 4. Until (a) is confirmed, pass
**coordinates** as the text param — a `"lat,lng"` string is an identity, not a name, so it cannot
resolve to another city.

**Q3. VERIFY: does `strict: true` hold on Anthropic and Google?**
`strict` is gated on `compat.supportsStrictMode` and is OpenAI-only in this repo (verified).
_Recommended:_ do not depend on it. Server-side Zod validation of every tool input runs regardless
of provider, with `is_error: true` on failure. Verify per-provider behaviour with a live call
before slice 5 rather than assuming.

**Q4. Do we accept payload-in-metadata, or build the storage-reference path now?**
The 32,000-char budget is **shared** with thinking/toolCalls/artifacts/searchResults and is already
trimming in production. The 12k per-card construction cap and `fileId` thumbnails should keep a
normal itinerary inside it, but this must be **measured** in slice 5, not assumed. The repo's own
error message instructs referencing large payloads by id — and `web_artifacts` would be the right
home except it has **no server-side write path** (verified) and its derived-id scheme collides
with card ids.
_Recommended:_ ship slices 1–5 on metadata with the cap and the honest `metadataTrimmed` notice.
If the measurement in slice 5 comes back tight, build the storage-reference path as its own slice
with a **new card-specific uuidv5 namespace** — never `DERIVED_ARTIFACT_NAMESPACE`, whose ordinal
is the position of a fenced code block and would collide.

**Q5. Are prose-level citation chips in scope?**
**No, and this should be stated plainly rather than implied.** `CitationPill`,
`InlineSourceTags` and mobile's `CitationChip` all exist and render — but **nothing populates
`message.citations` on any surface**, `StreamChunkCitation.payload` is typed `unknown` with a
comment saying there is no cross-vendor citation schema yet, and Anthropic's `citations_delta`
passes through verbatim only in `wireMode: 'legacy-web'`, preserved by golden fixture rather than
designed. What this plan ships is **card-scoped** sources anchored to stable ids.
_Recommended:_ accept the narrower scope. Prose citations are a separate wire-and-contract job
with its own cross-vendor schema design; do not let the existing pill component make it look
nearly free.

**Q6. Do cards really go mid-response, or bottom-of-transcript like Anthropic?**
Anthropic's shipped cards sit "at the bottom of the chat" and step one question at a time. The
founder's screenshots place them mid-response, which is more ambitious than anything any vendor
ships and will cause layout reflow and scroll-anchor fights while the model writes above a card
the user is filling in.
_Recommended:_ build mid-response as specified, but prototype it against a **live** stream before
finalising the renderer, and reserve card height on mount. If it fights the stick-to-bottom logic
in `MessageList`, falling back to composer-adjacent placement is a renderer change, not a contract
change — the contract does not care where the card is drawn. **Founder decision** if the prototype
looks bad.

**Q7. Is `cloud_managed`-only acceptable for launch?**
Cards cannot persist on Local or BYOK: desktop and mobile SQLite `messages` have no metadata column
(verified). Adding them is an additive, idempotent migration per surface, but place resolution is
third-party egress that Local must never perform regardless.
_Recommended:_ **yes, cloud-only, stated as a limit up front.** Clarifying questions (which have no
egress) could later reach Local with two small migrations; the itinerary card should not.
**Founder decision** on whether the feature being invisible to Local users at launch is acceptable.

**Q8. Two pre-existing defects adjacent to this work.**
`response_format: { type: 'json_schema' }` is accepted by the request validator
(`request-processor.ts:173`) and **never read again anywhere in the repo** — a caller can set it
today and get silently ignored output, which is a live capability-honesty violation.
Separately, `web_messages.role` is CHECK-constrained to `('user','assistant','system')` while the
TypeScript `MessageRole` union includes `'tool'` — a latent write failure for any path that trusts
the TS union.
_Recommended:_ fix or remove `response_format` in its own small PR rather than building beside it.
This plan avoids the role mismatch by keeping answers inside the assistant turn's metadata rather
than minting a tool-role row, but the mismatch will bite something else.

---

## Verification log

Every claim below was checked against the working tree on 2026-08-05, not inferred from the
design documents.

| Claim                                                                                                                              | Result                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `resolveToolCallGate` returns `{verdict: 'allow'\|'ask'\|'deny', reason}`                                                          | Confirmed, `tool-loop.ts:1465`                                       |
| `claimCloudAgentApprovalCheckpoint` re-parses approvals `.min(1).max(32)` and enforces exact set equality                          | Confirmed, `cloud-agent-run-service.ts:757-807`                      |
| `approve/route.ts` carries AGT-5, CON-1, CON-2, GOV-7 and `releaseClaim` on 6 branches; 361 lines                                  | Confirmed                                                            |
| `toolApprovalRequestEvent` emits only the extension key, no prose                                                                  | Confirmed, `tool-loop.ts:662`                                        |
| `mapPendingApproval` labels every pending call as an approval                                                                      | Confirmed, `cloud-agent-run-service.ts:230`                          |
| `mcp-apps.ts` has zero consumers repo-wide                                                                                         | Confirmed (grep returns only the file itself)                        |
| `web_artifacts` is written **only** by the client sync route                                                                       | Confirmed (`chat/sync/route.ts:417,433`; no other write path)        |
| `@agiworkforce/types` has no zod dependency                                                                                        | Confirmed (`package.json` lists only `@agiworkforce/model-registry`) |
| `MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH = 32_000`                                                                                  | Confirmed, `conversations.ts:17`                                     |
| `ChatExecutionMode = 'local_only' \| 'byok' \| 'cloud_managed'`                                                                    | Confirmed, `suite-contracts.ts:37`                                   |
| `ArtifactType` is a closed 22-member union                                                                                         | Confirmed, `conversation.ts:151-173`                                 |
| Latest migration is 0092, so 0093 is next                                                                                          | Confirmed                                                            |
| Rust `RequestUserInputQuestion` has id/header/question/isOther/isSecret/options{label,description}; response is id-keyed `HashMap` | Confirmed, `request_user_input.rs`                                   |
| No place/maps/geocoding infrastructure anywhere                                                                                    | Confirmed (grep returns only unrelated `marketplaceId` hits)         |
| Only `apps/desktop` and `apps/web` depend on `@agiworkforce/unified-chat`                                                          | Confirmed                                                            |
