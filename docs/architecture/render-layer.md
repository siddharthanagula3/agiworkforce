<!-- INTERNAL BUILD DOCUMENT. Not for public pages. -->

> **Provenance and confidence, read before relying on any competitor claim.**
>
> Produced 2026-08-26 by a 10-agent research pass (124 catalogued behaviours) plus a code survey of this repo.
>
> **Sourcing was constrained.** `openai.com` and `help.openai.com` returned HTTP 403 to every automated fetch, web.archive.org was unreachable, and the shared web-search budget was exhausted by a concurrent research task. ChatGPT-specific claims therefore rest on **direct observation of live screenshots (26 Aug 2026)** plus inference and Wayback snapshots, _not_ on retrievable first-party documentation. Anthropic docs were reachable and are cited normally.
>
> Confidence split across the 124 behaviours: inferred=21, observed=35, not-documented=19, first-party-documented=49.
>
> Every requirement below carries its own confidence marker. Treat `observed` as reliable (we saw it), `first-party-documented` as reliable, `inferred` as a design proposal rather than a competitor fact, and `not-documented` as an open question to resolve before building on it.
>
> **The sections describing OUR build are ours to decide.** Competitor behaviour is a requirement to meet, never code to copy.

---

# Editable, Content-Type-Aware Response Render Layer, Implementation Specification

**Status:** Draft for build · **Audience:** engineers on chat surfaces · **Internal**
**Date:** 2026-08-26 · **Ground truth for competitor behaviour:** live observation of chatgpt.com, 26 Aug 2026

## Confidence legend

Every requirement in this document carries one of four tags. Do not ship a behaviour whose tag you have not read.

| Tag        | Meaning                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[OBS]`    | Directly observed in a competitor product on 26 Aug 2026. Treat as a requirement to _meet_, never as code to copy.                                                                         |
| `[VENDOR]` | First-party vendor documentation (OpenAI help center via Wayback, Anthropic support/API docs). May be stale, where it conflicts with `[OBS]`, `[OBS]` wins and the conflict is called out. |
| `[REPO]`   | Verified in our codebase this session, with `path:line`. This is fact, not intent.                                                                                                         |
| `[INF]`    | Our inference or our design decision. Not verified anywhere. An engineer may challenge any `[INF]` on evidence.                                                                            |

Anything not tagged is prose glue, not a requirement.

---

## 1. THE MODEL

### 1.1 One paragraph

A model turn can emit, alongside prose, one or more **typed content parts**. A content part is a validated envelope with a `kind` discriminant, a typed `body`, a declared **capability set** (editable / streamable / actions), and optional **provenance** (citations). A **renderer registry** maps `kind` to a component; an unclaimed `kind` degrades to a loud, telemetered fallback rather than silently becoming markdown. Editable parts mount inside **block chrome**, a bordered card with a sticky header, a per-type action cluster, an in-block scroll-to-bottom control, and (for long structured parts) a section minimap. An **edit controller** owns exactly one text buffer per block and accepts writes from two channels, direct keyboard editing and an inline natural-language "Ask for changes" instruction, pushing both onto **one linear undo stack**. Committed edits land in the existing content-keyed artifact store as **appended revisions**, never as in-place overwrites, and the next model turn receives the current revision by reference plus its full text.

### 1.2 The pipeline

```
model output
  │
  ├─ prose text deltas ─────────────────────────► markdown renderer (unchanged)
  │
  └─ x_response_part delta (SSE)
        │
        ▼
  parseResponsePartDelta()          ← THE ONLY untrusted-boundary parse for parts
  packages/contracts/cloud-contracts/src/response-parts.ts
        │  zod validate + size cap + schemaVersion gate
        ▼
  ResponsePart  { recognized: true, kind, body, capabilities, provenance }
        │        or { recognized: false, kind, fallback }        ← never throws
        ▼
  resolveResponsePartRenderer(registry, part)
  packages/contracts/types/src/response-parts.ts
        │
        ├─ hit  ──► <ResponseBlock chrome> ─► <DocPartRenderer|EmailPartRenderer|CodePartRenderer|…>
        │                │
        │                ├─ EditController (one buffer, two write channels, one undo stack)
        │                ├─ ActionCluster (declared by renderer, not by chrome)
        │                ├─ SectionMinimap (derived from body outline)
        │                └─ CitationLayer (span-anchored groups)
        │
        └─ miss ──► <UnclaimedPart> + telemetry `response_part.unclaimed` (WARN)
                    Renders authored fallback. Never raw markdown. Never silent.
        │
        ▼
  commit → upsertArtifact({...stored, content, createdAt: new Date()})
           packages/platform/artifacts/src/artifact-store.ts:96 (version = existing.version + 1)
        │
        ▼
  next turn context: revisionRef { partId, revision, contentHash } + full current text
```

### 1.3 The six nouns

1. **Typed content part**: the wire + in-memory contract. §2.
2. **Renderer registry**: `kind → component`, with a loud miss path. §3.
3. **Block chrome**: sticky header, action cluster, undo, scroll-to-bottom, minimap. §4.
4. **Edit controller**: the dual-channel editing state machine. §5.
5. **Undo stack**: one linear stack per block instance, shared by both channels. §5.7.
6. **Persistence**: content-keyed revisions in the artifact store + a context serializer. §8.

### 1.4 Why a new contract rather than a fifth interactive-card kind

We already have a working typed-card system: `KNOWN_INTERACTIVE_CARD_KINDS = ['clarify.v1','itinerary.v1','map-search.v1','mcp-app.v1']`, a registry type `InteractiveCardRegistry<TNode>` and `resolveInteractiveCardRenderer`, and a single zod chokepoint `parseInteractiveCardDelta` `[REPO packages/contracts/types/src/interactive-cards.ts:14-19, :294-305; packages/contracts/cloud-contracts/src/interactive-cards.ts:404-430]`. That system is the right _pattern_ and the wrong _container_:

- Cards are capped at `INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH = 12_000` serialized chars and `INTERACTIVE_CARDS_MAX_PER_MESSAGE = 4` `[REPO interactive-cards.ts:11-12]`. A document part is the _long_ output; the cap exists precisely to stop cards being that.
- Cards are read-only-by-construction: the render context is `{ canRespond, onRespond?, onOpenUrl? }` `[REPO interactive-cards.ts:~283]`, a one-shot response channel, not a text buffer with revisions.
- Cards carry no version identity and are re-parsed from message metadata on every read (`readPersistedInteractiveCards`) `[REPO cloud-contracts/src/interactive-cards.ts:431+]`. An edited document must not be re-derived from the original message metadata, or every edit is lost on reload.

So: **new sibling contract, same three architectural rules**, one discriminated union, one zod chokepoint, one registry seam. `[INF, our decision]`

---

## 2. THE TYPED CONTENT PART CONTRACT

### 2.1 Where it lives

| File                                                                | Role                                                                                                              | New/extend |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| `packages/contracts/types/src/response-parts.ts`                    | Types, `KNOWN_RESPONSE_PART_KINDS`, registry type, `resolveResponsePartRenderer`, capability + action descriptors | **new**    |
| `packages/contracts/cloud-contracts/src/response-parts.ts`          | zod schemas, `parseResponsePartDelta`, `readPersistedResponseParts`, the single untrusted-boundary parse          | **new**    |
| `packages/contracts/types/src/index.ts`                             | re-export                                                                                                         | extend     |
| `packages/contracts/cloud-contracts/src/index.ts`                   | re-export                                                                                                         | extend     |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`         | emit `x_response_part` delta, mirroring `x_interactive_card` at `:648` `[REPO]`                                   | extend     |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | client capability declaration, mirroring `x_interactive_cards` at `:204` `[REPO]`                                 | extend     |

### 2.2 The contract

```ts
// packages/contracts/types/src/response-parts.ts

export const RESPONSE_PART_SCHEMA_VERSION = 1;

/** SSE delta key on a streaming chunk. Mirrors INTERACTIVE_CARD_DELTA_KEY. */
export const RESPONSE_PART_DELTA_KEY = 'x_response_part' as const;
/** Request-side client capability key. Mirrors INTERACTIVE_CARD_REQUEST_KEY. */
export const RESPONSE_PART_REQUEST_KEY = 'x_response_parts' as const;
/** Message-metadata key under which parts persist on a stored message. */
export const RESPONSE_PARTS_METADATA_KEY = 'responseParts' as const;

export const RESPONSE_PART_MAX_BODY_CHARS = 400_000; // ~100k tokens of text  [INF]
export const RESPONSE_PARTS_MAX_PER_MESSAGE = 4; // [INF] mirrors cards

export const KNOWN_RESPONSE_PART_KINDS = [
  'doc.v1', // generic prose document / essay / report
  'email.v1', // subject + salutation + body + signoff, placeholder-aware
  'code.v1', // single-file source with a language
  'table.v1', // rows/columns  (phase 4, see §11)
] as const;
export type KnownResponsePartKind = (typeof KNOWN_RESPONSE_PART_KINDS)[number];
export type ResponsePartKindWire = string;

export function isKnownResponsePartKind(k: string): k is KnownResponsePartKind {
  return (KNOWN_RESPONSE_PART_KINDS as readonly string[]).includes(k);
}
```

#### 2.2.1 Common envelope

```ts
export interface ResponsePartFallback {
  /** Rendered when no renderer claims the kind. Authored by the emitter, never derived. */
  headline: string;
  text: string;
}

export type ResponsePartStatus = 'streaming' | 'complete' | 'errored';

export interface ResponsePartCapabilities {
  /** May the user type directly into the body?  [OBS: ChatGPT allows this] */
  editable: boolean;
  /** May the user issue an NL edit instruction scoped to this part? [OBS] */
  instructable: boolean;
  /** Does the body arrive incrementally? Drives chrome gating in §4.7. */
  streamable: boolean;
  /** Section outline is meaningful → minimap eligible. [OBS ChatGPT minimap] */
  outlineable: boolean;
}

export interface ResponsePartProvenance {
  /** Grouped citations anchored to spans of the *current* body text. §7. */
  citationGroups: CitationGroup[];
  /** Tool call that produced the part, for audit. Mirrors card `producedBy`. [REPO parity] */
  producedBy?: { toolCallId: string; toolName: string };
}

export interface ResponsePartCommon {
  schemaVersion: number;
  /** Stable across revisions. THE identity used by the artifact store + context refs. */
  partId: string;
  /** Message that first emitted this part. */
  messageId: string;
  createdAt: string; // ISO
  status: ResponsePartStatus;
  /** 0 = as generated by the model. Incremented per committed edit. §8. */
  revision: number;
  fallback: ResponsePartFallback;
  capabilities: ResponsePartCapabilities;
  provenance?: ResponsePartProvenance;
}
```

#### 2.2.2 Bodies

```ts
export interface DocPartBody {
  title?: string;
  /** Basic markdown only: headings, bold, italic, lists. [VENDOR: Canvas direct
   *  edits support "only basic markdown … no advanced formatting"] */
  markdown: string;
  outline: OutlineNode[]; // derived server-side OR client-side; see §4.6
}

export interface OutlineNode {
  id: string;
  /** 1..6, drives minimap tick width. [INF: tick width varying is OBS; the
   *  mapping to heading level is our decision, unconfirmed in the observation] */
  depth: number;
  label: string;
  /** char offset into the body text this node starts at. */
  offset: number;
}

export interface EmailPartBody {
  subject: string;
  salutation: string;
  /** markdown-lite; placeholders are marked by `placeholders`, not by parsing. */
  bodyMarkdown: string;
  signoff: string;
  /** [OBS] "[Student Name]", "[Grade/Class]" render as distinct highlighted spans. */
  placeholders: Array<{ token: string; start: number; end: number; label: string }>;
  to?: string[];
  cc?: string[];
}

export interface CodePartBody {
  language: string; // 'python' | 'typescript' | …
  source: string;
  filename?: string;
}

export interface TablePartBody {
  columns: Array<{ id: string; label: string; type: 'text' | 'number' | 'date' }>;
  rows: Array<Record<string, string | number | null>>;
}
```

#### 2.2.3 The union and the fallback shape

Deliberately mirrors `KnownInteractiveCard | UnrecognizedInteractiveCard` `[REPO interactive-cards.ts:256-278]` so the two systems read the same.

```ts
export type KnownResponsePart =
  | (ResponsePartCommon & { recognized: true; kind: 'doc.v1'; body: DocPartBody })
  | (ResponsePartCommon & { recognized: true; kind: 'email.v1'; body: EmailPartBody })
  | (ResponsePartCommon & { recognized: true; kind: 'code.v1'; body: CodePartBody })
  | (ResponsePartCommon & { recognized: true; kind: 'table.v1'; body: TablePartBody });

export interface UnrecognizedResponsePart extends ResponsePartCommon {
  recognized: false;
  kind: string;
}

export type ResponsePart = KnownResponsePart | UnrecognizedResponsePart;

export type ResponsePartBodyFor<K extends KnownResponsePartKind> = Extract<
  KnownResponsePart,
  { kind: K }
>['body'];
```

#### 2.2.4 The plain-text projection, mandatory per kind

Editing, undo, diffing, citation anchoring and context serialization all operate on **one canonical string per part**. Every kind must declare a lossless projection to and from that string. Without this, the edit controller has to special-case every body shape and the undo stack stops being one stack.

```ts
export interface PartTextCodec<K extends KnownResponsePartKind> {
  /** Body → the single editable text buffer shown in the block. */
  toText(body: ResponsePartBodyFor<K>): string;
  /** Text → body. MUST be total: on parse failure return the previous body with
   *  the raw text stored, never throw, never lose the user's keystrokes. */
  fromText(text: string, previous: ResponsePartBodyFor<K>): ResponsePartBodyFor<K>;
}
```

- `doc.v1`, identity over `markdown`. `[INF]`
- `email.v1`, a stable serialization (`Subject: …\n\n<salutation>\n\n<body>\n\n<signoff>`) with `fromText` re-splitting on the same anchors; placeholder offsets recomputed by scanning for the recorded tokens. `[INF]`
- `code.v1`, identity over `source`. `[INF]`
- `table.v1`, TSV. `[INF]` If TSV round-tripping proves lossy in practice, `table.v1` sets `capabilities.editable = false` rather than corrupting rows.

Codecs live in `packages/contracts/types/src/response-part-codecs.ts` `[INF]`.

### 2.3 Validation chokepoint

```ts
// packages/contracts/cloud-contracts/src/response-parts.ts
export function parseResponsePartDelta(payload: unknown): ResponsePart | null;
export function readPersistedResponseParts(metadata: unknown): ResponsePart[];
```

Rules, all mirroring the card path `[REPO cloud-contracts/src/interactive-cards.ts:404-430]`:

1. Envelope parsed with a `.strict()` zod schema; failure → `null` (drop, do not render).
2. Serialized length over `RESPONSE_PART_MAX_BODY_CHARS` → `null`.
3. `schemaVersion > RESPONSE_PART_SCHEMA_VERSION` → `{ recognized: false }` (forward compatibility: a newer server can add kinds and older clients degrade instead of crashing). `[REPO parity]`
4. Unknown `kind` → `{ recognized: false }`.
5. Body schema mismatch → `{ recognized: false }`, **not** `null`, the authored fallback still renders, so the answer never has a hole. `[REPO parity, same reasoning as the comment at MessageBubble.tsx:1533-1536]`
6. `parseResponsePartDelta` is the **only** place `recognized: true` is ever set. Any other code path constructing a part with `recognized: true` is a bug and must fail review.

---

## 3. RENDERER REGISTRY

### 3.1 Resolution

```ts
// packages/contracts/types/src/response-parts.ts

export interface ResponsePartRenderContext<TNode> {
  /** Edit controller handle; absent ⇒ read-only surface (see §9). */
  edit?: EditControllerHandle;
  /** Host action executor. Absent ⇒ renderer must render NO action controls. */
  runAction?: (action: ResolvedPartAction) => void | Promise<void>;
  onOpenUrl?: (url: string) => void;
  surface: 'web' | 'desktop-tauri' | 'vscode-webview' | 'mobile';
  /** Live-turn flag; gates edit affordances (§5.1). */
  isLatestTurn: boolean;
}

export interface ResponsePartRendererResult<TNode> {
  node: TNode;
  /** Declared by the renderer, consumed by the chrome. §6. */
  actions: PartActionDescriptor[];
}

export type ResponsePartRenderer<TNode, K extends KnownResponsePartKind> = (props: {
  part: Extract<KnownResponsePart, { kind: K }>;
  body: ResponsePartBodyFor<K>;
  ctx: ResponsePartRenderContext<TNode>;
}) => ResponsePartRendererResult<TNode>;

export type ResponsePartRegistry<TNode> = {
  readonly [K in KnownResponsePartKind]?: ResponsePartRenderer<TNode, K>;
};

export function resolveResponsePartRenderer<TNode>(
  registry: ResponsePartRegistry<TNode>,
  part: ResponsePart,
): ResponsePartRenderer<TNode, KnownResponsePartKind> | null {
  if (!part.recognized) return null;
  return (
    (registry[part.kind] as ResponsePartRenderer<TNode, KnownResponsePartKind> | undefined) ?? null
  );
}
```

The `TNode` generic is deliberate: the same registry type serves React DOM on web, React DOM in the VS Code webview, and React Native on mobile, exactly as `InteractiveCardRegistry<TNode>` already does `[REPO interactive-cards.ts:289-292]`.

### 3.2 The unclaimed path must be loud

This is the requirement the brief calls out, and it is a real, present defect in the card system: `itinerary.v1` is a fully typed, fully zod-validated, unit-tested kind with **no** entry in `WEB_CARD_REGISTRY` `[REPO apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:15-21]`, so every itinerary card silently renders the generic headline/text `<section>` at `:58-72`, and nothing anywhere reports it. Do not repeat this.

```ts
// packages/contracts/types/src/response-parts.ts
export type PartResolution<TNode> =
  | { outcome: 'rendered'; renderer: ResponsePartRenderer<TNode, KnownResponsePartKind> }
  | { outcome: 'unclaimed'; kind: KnownResponsePartKind } // known type, no renderer, A BUG
  | { outcome: 'unrecognized'; kind: string }; // unknown type, expected, e.g. newer server

export function classifyResponsePart<TNode>(
  registry: ResponsePartRegistry<TNode>,
  part: ResponsePart,
): PartResolution<TNode>;
```

Required behaviour:

| Outcome        | UI                                                                                            | Telemetry                                                                   | CI                                                               |
| -------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `rendered`     | type renderer inside chrome                                                                   | ,                                                                           | ,                                                                |
| `unclaimed`    | fallback card **with a visible "This content type isn't supported in this app version" note** | `response_part.unclaimed` at **WARN**, with `{ kind, surface, appVersion }` | **A registry-coverage test fails the build.** See below. `[INF]` |
| `unrecognized` | fallback card, same note                                                                      | `response_part.unrecognized` at INFO                                        | none, expected across versions                                   |

**Registry coverage test (required, phase 1):**

```ts
// apps/web/features/chat/components/messages/parts/registry.coverage.test.ts
const UNIMPLEMENTED_ON_WEB: ReadonlySet<KnownResponsePartKind> = new Set(['table.v1']);
it('every known part kind is either registered or explicitly waived', () => {
  for (const kind of KNOWN_RESPONSE_PART_KINDS) {
    if (UNIMPLEMENTED_ON_WEB.has(kind)) continue;
    expect(WEB_PART_REGISTRY[kind], `no renderer registered for ${kind}`).toBeDefined();
  }
});
```

The waiver set is the point: adding a kind to `KNOWN_RESPONSE_PART_KINDS` forces a deliberate decision, implement it or write it down, instead of a silent fallthrough. Add the identical test for `WEB_CARD_REGISTRY` in the same phase and put `itinerary.v1` in its waiver set with a TODO, so the existing gap is at least _declared_. `[INF]`

Never render an unclaimed part's payload as raw markdown. The authored `fallback` is what renders. `[REPO, the existing card fallback at InteractiveCardBlock.tsx:58-72 is the correct precedent]`

### 3.3 How a renderer declares its actions

The chrome renders no action it was not handed. The renderer returns `actions: PartActionDescriptor[]` (§6) from its render result. Consequence: the header cluster is a pure function of `(kind, part.status, editState, surface capabilities)`, which is exactly the content-type-aware behaviour observed `[OBS: email block replaces download/expand with "Open in email"]`, expressed as data rather than as a conditional inside a shared toolbar.

---

## 4. THE BLOCK CHROME

Component: `apps/web/features/chat/components/messages/parts/ResponseBlock.tsx` `[INF new]`. Mounted from `MessageBubble.tsx` immediately after the interactive-card block at `:1538` `[REPO]`, with the same "cards sit after the prose that motivated them" placement rule.

### 4.1 Container

- Rounded, elevated card with its own surface colour, inset within the assistant message. `[OBS]`
- Uses existing chat tokens: `border-[var(--chat-border-strong)] bg-[var(--chat-surface-hover)]`, same tokens as the card fallback `[REPO InteractiveCardBlock.tsx:66-67]`, so the two block families do not drift visually.
- `max-height: min(60vh, 720px)` with the body in its own `overflow-y: auto` scroll container. The block scrolls internally; the page does not scroll to traverse it. `[INF, required by the sticky-header observation, which only makes sense with an internal scroller]`
- `data-testid="response-block"`, `data-part-kind`, `data-part-recognized`, `data-part-status`, mirroring the card fallback's test attributes `[REPO InteractiveCardBlock.tsx:62-64]`.

### 4.2 Sticky header

- `position: sticky; top: 0` on the header inside the block's own scroll container, **not** page-fixed. Header stays visible for the full internal scroll. `[OBS, the first detail the user called out]`
- Left cluster: the **Edit pill** (pencil + label) when `capabilities.editable || capabilities.instructable`. `[OBS]`
- Right cluster: the declared action set (§6), then the conditional **undo** control (§4.4).
- Header must paint an opaque background (not transparent) or scrolled body text bleeds through. `z-index: 1` within the block stacking context. `[INF]`
- The header is a landmark: `<header role="group" aria-label="{title} controls">`. `[INF]`

### 4.3 Action cluster

Rendered from `PartActionDescriptor[]`. Ordering: `primary` actions first, then `secondary`, then overflow. Max **4** inline controls on web; beyond that, the tail collapses into a `⋯` menu. `[INF]` Each control is a real `<button>` with `aria-label` and a tooltip whose text equals the label (`[OBS: "Open in email" appears as a tooltip]`).

### 4.4 State-driven undo

- Undo is **absent** from the DOM while the undo stack is empty; it mounts on the first committed edit. `[OBS, "It is absent before. So undo availability is state-driven, not always-rendered."]`
- Visibility predicate: `undoStack.length > 0`. Not "dirty since open", not "edit mode is on". `[INF, the observation cannot distinguish a stack from a boolean; we choose the stack because we need multi-step undo anyway, §5.7]`
- On mount it must be announced, or keyboard/AT users never learn it exists: an `aria-live="polite"` status region emits "Undo available" once, on the transition from 0 → 1 entries. `[INF]`
- `Cmd/Ctrl+Z` is wired to the same action while focus is inside the block. §10. `[INF]`
- **No redo control in v1.** No redo affordance was observed `[OBS: absence]`. We still maintain a redo stack internally (§5.7) and will surface `Shift+Cmd+Z` as a keyboard-only affordance; a visible redo button is a phase-5 decision.

### 4.5 In-block scroll-to-bottom

- A floating circular down-arrow button, absolutely positioned near bottom-centre **inside** the block's bounding box. `[OBS]`
- Visible iff `scrollHeight - (scrollTop + clientHeight) > 48px`. Hidden otherwise. Click → smooth scroll to `scrollHeight`. `[INF, threshold is ours]`
- During streaming the block auto-follows the live edge until the user scrolls up; the first upward scroll detaches auto-follow and reveals the button; clicking it re-attaches. This is the standard chat "stick to bottom" contract, scoped to the block. `[INF, not observed mid-stream; see §12 risk R3]`
- `aria-label="Scroll to end of document"`, and it is **not** the only way to reach the end (keyboard `End` inside the body does the same). `[INF]`

### 4.6 Section minimap

- Observed as a vertical strip of short horizontal tick marks of varying width down the **right edge of the viewport**, acting as a section scrubber. `[OBS]`
- **We scope it to the block, not the viewport.** `[INF, deliberate divergence]` A viewport-edge element belonging to one block inside a scrolling transcript is ambiguous when two blocks are on screen and is a layout hazard on narrow windows. Ours renders as a fixed-width (14px) gutter on the right _inside_ the block.
- Eligibility: `capabilities.outlineable && outline.length >= 3 && blockScrollHeight > 2 * clientHeight`. `[INF]`
- Tick geometry: vertical position = `node.offset / textLength`; width = `100% - (depth - 1) * 20%`, i.e. deeper headings render narrower. `[INF, "varying width" is observed, the mapping is ours]`
- Interactions: click a tick → scroll block so that node's offset is at the top; hover → tooltip with `node.label`; drag along the strip → live scrub. Current section tick is highlighted, updated from a scroll listener throttled with `requestAnimationFrame`. `[INF, click/drag/hover mechanics were not observable in a still screenshot]`
- Accessibility: the strip itself is `aria-hidden="true"` (it is a pointer affordance). The accessible equivalent is a "Jump to section" item in the header overflow menu that opens a real list of outline nodes. §10. `[INF]`
- Outline derivation: client-side from the markdown heading tree if the body did not carry one, in `packages/ui/unified-chat/src/lib/outline.ts` `[INF new]`. Never trust a model-supplied `outline` whose offsets are out of range, clamp and recompute.

### 4.7 What changes during streaming

`part.status` drives everything. Nothing about mid-stream chrome was observable `[OBS: absence, the screenshots captured a completed, already-edited block]`, and no first-party doc was reachable `[VENDOR: help.openai.com returned 403 throughout research]`. The following is `[INF]` and should be re-checked against a live capture (risk R3).

| Chrome element        | `streaming`                                                                                  | `complete`                               | `errored`                    |
| --------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------- |
| Container             | mounted at the **first** part delta                                                          | mounted                                  | mounted                      |
| Sticky header         | rendered                                                                                     | rendered                                 | rendered                     |
| Title / kind badge    | rendered                                                                                     | rendered                                 | rendered                     |
| Edit pill             | rendered, `disabled`, `aria-disabled="true"`, tooltip "Available when the document finishes" | enabled if `isLatestTurn` or §5.1 allows | disabled                     |
| Copy                  | enabled (reads a snapshot)                                                                   | enabled                                  | enabled                      |
| Download / Open-in-\* | disabled                                                                                     | enabled                                  | disabled                     |
| Undo                  | absent (stack empty)                                                                         | per §4.4                                 | per §4.4                     |
| Scroll-to-bottom      | active, with auto-follow                                                                     | active                                   | active                       |
| Minimap               | hidden until `complete` (offsets churn while text grows)                                     | per §4.6                                 | per §4.6                     |
| Body                  | append-only, not focusable, `aria-busy="true"`                                               | editable per §5                          | read-only + retry affordance |

Rule with no exceptions: **the buffer has exactly one writer at a time.** While `status === 'streaming'` the writer is the stream. Direct editing and NL instructions are rejected, not queued, a queued instruction that fires against a document that changed underneath it produces edits the user never asked for. The disabled control says why. `[INF]`

---

## 5. THE EDIT CONTROLLER

The hardest section. Read it whole before implementing any of it.

### 5.1 Requirement summary

Observed contract we must meet:

- Clicking the header Edit pill **transforms the pill in place** into an inline text input with placeholder "Ask for changes" and a submit arrow. NL editing is initiated from the block header, not the main composer. `[OBS]`
- **Simultaneously** the entire body becomes selection-highlighted. `[OBS]`
- The body is **also** directly editable, cursor placement and character deletion by keyboard. `[OBS]`
- Both channels are live at once, on the same content. `[OBS]`
- Undo appears only after an edit exists. `[OBS]`
- Vendor docs describe a _selection-scoped_ NL edit (highlight a passage, get an anchored input) as the older Canvas mechanism `[VENDOR: help.openai.com canvas article, archived 2026-07-20]` and as Claude's current Markdown mechanism ("highlight the text you want changed, click _Edit with Claude_, and type your request") `[VENDOR: support.claude.com/en/articles/9487310]`. Whether ChatGPT still has the anchored popup alongside the header pill is unresolved `[OBS: absence]`. **We build both**: header-initiated whole-document scope by default, narrowed automatically when a sub-selection exists. §5.5.

Gating: edit affordances are enabled when `part.status === 'complete'` **and** the part belongs to the conversation's latest assistant turn **or** the user has explicitly opened the block from the artifacts panel. Editing a part in an old turn is allowed but produces a revision attached to that part, it does not rewrite the transcript. §8. `[INF]`

### 5.2 State machine

```ts
// packages/ui/unified-chat/src/lib/edit-controller.ts   [INF new, shared, platform-agnostic]

export type EditPhase =
  | { name: 'idle' }
  | { name: 'editing'; instructionDraft: string }
  | { name: 'submitting'; instruction: string; scope: EditScope; abort: AbortController }
  | { name: 'applying'; patch: TextPatch } // transient, ≤1 frame
  | { name: 'failed'; instruction: string; error: EditError };

export interface EditControllerState {
  partId: string;
  /** THE buffer. Both channels write here and nowhere else. */
  text: string;
  /** Baseline for the current revision, what was committed last. */
  committedText: string;
  phase: EditPhase;
  selection: { start: number; end: number } | null;
  undo: UndoStack;
  /** revision number of `committedText`. */
  revision: number;
}
```

Transitions:

```
idle ──(Edit pill click / Cmd+E)──────────────► editing
editing ──(Esc, no unsaved changes)───────────► idle
editing ──(Esc, unsaved changes)──────────────► editing + confirm-discard dialog
editing ──(blur outside block, unsaved)───────► editing (STAYS OPEN, see 5.9)
editing ──(submit instruction)────────────────► submitting
submitting ──(stream done, patch validated)───► applying ──► editing
submitting ──(abort / network / validation)───► failed
failed ──(retry)──────────────────────────────► submitting
failed ──(dismiss)────────────────────────────► editing
editing ──("Done" / Cmd+Enter)────────────────► idle   (commits, §5.8)
```

`applying` exists so that the patch application, the undo push and the citation re-anchor happen in **one** synchronous reducer call. Never apply a model patch across two renders.

### 5.3 Entry

On entering `editing`:

1. The Edit pill unmounts; an inline `<input>` mounts in the same header slot with `placeholder="Ask for changes"` and a submit `<button aria-label="Send edit instruction">`. Same DOM position, same width animation. `[OBS]`
2. **Focus moves to that input.** Do not leave focus on the removed pill. `[INF, required by §10; the observation cannot show focus]`
3. The body becomes editable and the **entire body is selected**, `document.getSelection()` set across the body's text nodes, with a distinct `::selection`-like highlight class so it survives losing DOM focus (the browser's real selection dims when focus is in the header input; render our own `.part-scope-highlight` background instead of relying on native selection paint). `[OBS: the highlight is observed; the implementation note is INF]`
4. The highlight's meaning must be stated, not implied: a caption under the header reads **"Editing the whole document, select a passage to narrow."** The observation shows the highlight; it does not show that anyone understands it. We make the scope explicit. `[INF, deliberate improvement]`
5. `aria-live` announcement: "Editing enabled. Whole document in scope." `[INF]`

### 5.4 Direct manual editing

- Web/desktop: the body is a **`contenteditable`-backed controlled surface** for `doc.v1` / `email.v1`, and a code editor surface for `code.v1`. Not a textarea, the block must keep rendering headings, citation chips and placeholder spans while being edited, which a textarea cannot do.
- This is a real divergence from what we have: both existing editors in the repo are plain textareas, `EditableMessage.tsx` (controlled `<textarea>`, Cmd+Enter save, Esc cancel) `[REPO apps/web/features/chat/components/messages/EditableMessage.tsx:1-70]` and `ArtifactPreview`'s `sourceDraft` textarea `[REPO ArtifactPreview.tsx:222, :479-487, :1635-1637]`. Neither can be extended to satisfy the observed behaviour, because the observed behaviour edits _rendered_ content, not source. `EditableMessage` stays as-is for user-turn edit-and-retry; `ArtifactPreview`'s textarea stays as the _source_ editing path. The new block body is a third, distinct editor. Say this in review so nobody "consolidates" them.
- Serialization: DOM → canonical text via the kind's `PartTextCodec` on every input event, debounced 120ms into `state.text`. `[INF]`
- Paste is sanitized to the supported markdown subset, bold, italic, headings, bullets, numbered lists. `[VENDOR: Canvas direct edits support "only basic markdown … no advanced formatting"; we adopt the same limit because our codecs are lossy above it]`
- Every debounced flush that produces a text change pushes an undo entry (§5.7) with `source: 'manual'`.

### 5.5 Scope resolution for an NL instruction

At submit time:

```ts
export type EditScope =
  | { kind: 'whole' }
  | { kind: 'span'; start: number; end: number; text: string };

function resolveScope(state: EditControllerState): EditScope {
  const s = state.selection;
  if (!s || s.end - s.start < MIN_SPAN_CHARS /* 12 */) return { kind: 'whole' };
  if (s.end - s.start >= state.text.length * 0.9) return { kind: 'whole' };
  return { kind: 'span', start: s.start, end: s.end, text: state.text.slice(s.start, s.end) };
}
```

- Entering edit mode sets the selection to the whole body, which resolves to `{ kind: 'whole' }`, matching the observed default. `[OBS]`
- A user-drawn sub-selection made _after_ entry narrows the scope. Whether the competitor does this is **unconfirmed** `[OBS: absence, no partial-selection scenario was screenshotted]`; we do it because a whole-document rewrite for a one-sentence change is both slower and riskier.
- The scope is always visible: the header caption switches to **"Editing selection (N characters)"** and the highlight shrinks to the selection. `[INF]`

### 5.6 What the model receives, and how the remainder is preserved verbatim

This is the part most likely to be built wrong. Do not send "here is the document, here is the instruction, return the new document" for a scoped edit, that is a full regeneration wearing a patch's clothes, and it silently rewrites text the user did not touch.

**Request** (server route: `apps/web/app/api/parts/edit/route.ts` `[INF new]`; the model call goes through the existing completions plumbing in `apps/web/app/api/llm/v1/chat/completions/lib/` `[REPO]`):

```ts
export interface PartEditRequest {
  partId: string;
  revision: number;
  kind: KnownResponsePartKind;
  instruction: string; // user's NL text, verbatim, never rewritten by us
  scope:
    | { kind: 'whole'; text: string }
    | {
        kind: 'span';
        /** Up to 800 chars of context on each side, for coherence only. */
        before: string;
        target: string;
        after: string;
        /** sha256 of `target`; echoed back for verification. */
        targetHash: string;
      };
  conversationId: string;
}
```

**Response contract, the model returns a replacement for the target only:**

```ts
export interface PartEditResponse {
  /** For scope.kind === 'span': the new text for the target span, nothing else.
   *  For scope.kind === 'whole': the new full document. */
  replacement: string;
  /** Echo of targetHash; server rejects a mismatch before the client sees it. */
  targetHash?: string;
  /** One short sentence for the change log. Not shown in the transcript. */
  summary: string;
}
```

**Application algorithm** (client, inside the `applying` phase, one synchronous reducer):

```ts
function applyPatch(
  state: EditControllerState,
  scope: EditScope,
  res: PartEditResponse,
): TextPatch {
  if (scope.kind === 'whole') {
    return { start: 0, end: state.text.length, insert: res.replacement };
  }
  // Re-locate the target: the user may have typed since submit (both channels are live).
  const current = state.text;
  const stillThere = current.slice(scope.start, scope.end) === scope.text;
  if (stillThere) return { start: scope.start, end: scope.end, insert: res.replacement };

  const idx = indexOfUnique(current, scope.text); // exact, must be unique
  if (idx >= 0) return { start: idx, end: idx + scope.text.length, insert: res.replacement };

  throw new EditError('scope-drifted'); // → phase 'failed', nothing applied
}
```

Guarantees this buys us, none of which a "return the whole document" design can offer:

1. **Verbatim remainder.** For a span edit, `text.slice(0, start)` and `text.slice(end)` are byte-identical before and after. This is enforced by construction, not by trusting the model. `[INF, our decision]`
2. **Detectable drift.** If the user edited the target region while the request was in flight, we fail loudly (`scope-drifted`, with a retry that re-scopes) instead of splicing into the wrong offsets.
3. **Cheap validation.** Server rejects `targetHash` mismatch, an empty `replacement` where `target` was non-empty (a common truncation failure), and any `replacement` longer than `8 × target.length`, all before the client mutates anything. `[INF]`
4. **Whole-document edits are still checked**: if `scope.kind === 'whole'` and the returned document is shorter than 40% of the original, we do **not** apply silently, we show a "This rewrite removed most of the document. Apply anyway?" confirmation. `[INF, no competitor equivalent observed; this is us refusing to ship a silent data-loss path]`

**No accept/reject diff step in v1.** No diff, strikethrough, or accept/reject UI was observed in the competitor's block `[OBS: absence]`, and the vendor's own docs describe a "Show changes" diff only in the older side-panel design `[VENDOR, archived 2026-07-20]`. We apply optimistically and rely on undo, **except** for the two guarded cases above. Phase 5 may add an opt-in diff using the desktop diff view we already have (`apps/desktop/src/features/artifacts/ArtifactVersionHistory.tsx`, which does `from_version`/`to_version` comparison) `[REPO]`.

**Streaming an AI edit into the buffer.** Whether the competitor streams the rewrite into the visible block or swaps it atomically is not documented `[OBS: absence]`. We **buffer the response and apply atomically**, because the alternative, streaming into a buffer the user can simultaneously type into, has no correct merge semantics. During `submitting`, the body shows a subtle progress affordance on the scoped span and **direct editing is disabled** (`aria-busy="true"` on the body, header input disabled with the submit button turned into a cancel). This deliberately makes the two channels mutually exclusive _while a request is in flight_, which is narrower than the observed "both live at the same time", the observation shows both _available_, not both _writing concurrently_. `[INF]`

### 5.7 One undo stack

```ts
export interface UndoEntry {
  patch: TextPatch; // enough to invert
  inverse: TextPatch;
  source: 'manual' | 'instruction';
  instruction?: string; // present when source === 'instruction'
  at: string; // ISO
  /** Selection to restore when this entry is undone. */
  selectionBefore: { start: number; end: number } | null;
}

export interface UndoStack {
  entries: UndoEntry[]; // cap 50   [INF]
  redo: UndoEntry[]; // cleared on any new push
}
```

Rules:

1. **One stack per part instance, shared by both channels.** A manual keystroke run and an AI rewrite push the same entry type; undo pops whichever is most recent regardless of source. `[INF, derived from OBS: a single undo icon exists for both channels; the observation cannot prove a stack, so this is our design]`
2. **Coalescing.** Consecutive `manual` edits coalesce into one entry while (a) they are contiguous insertions or deletions, and (b) less than 800ms apart. An `instruction` entry never coalesces. Result: undo after an AI edit reverts that whole edit in one press; undo after typing reverts a word-ish chunk, not a character. `[INF]`
3. The undo control's visibility is `entries.length > 0` (§4.4).
4. Undo restores `selectionBefore` and re-focuses the body. `[INF]`
5. Undo/redo do **not** create revisions. Only commit does (§5.8). Undoing past the last commit point leaves `text !== committedText` in the other direction; that is fine, commit compares content, and identical content is a no-op in the store `[REPO artifact-store.ts:85-90, re-upserting identical content updates in place rather than appending]`.
6. **Scope: session, in-memory.** The stack does not survive reload. Revisions do (§8). Whether the competitor's undo survives reload is unknown `[OBS: absence]`; we choose not to persist a keystroke-level stack, because the durable recovery mechanism is the revision list, which is better in every way that matters.

### 5.8 Commit

A commit happens on: "Done"/`Cmd+Enter`, a successful instruction apply, or 5s of inactivity after the last manual change (autosave). `[INF, the competitor's save-on-blur semantics are explicitly unconfirmed]`

```ts
function commit(state: EditControllerState): void {
  if (state.text === state.committedText) return; // no-op, no revision
  const stored = artifactStore.getArtifact(state.partId);
  upsertArtifact({ ...stored, content: state.text, createdAt: new Date() });
  // → artifact-store.ts:96 assigns version = existing.version + 1  [REPO]
}
```

We reuse the existing content-keyed upsert path deliberately, the same call `ArtifactPreview.saveSourceEdit` already makes `[REPO ArtifactPreview.tsx:479-487]`, whose in-file comment records that this is intentional so an edit becomes a real new version rather than a silent overwrite. Do not add a second store.

### 5.9 Blur, navigation and discard

- Clicking outside the block does **not** exit edit mode and does **not** discard. Edit mode persists until an explicit exit. `[INF, the observation explicitly flags this as an open question ("auto-saves on blur, requires explicit confirm, or is reverted, open question"), and of the three, silent revert is the only one that loses user work, so it is out]`
- Navigating away from the conversation with uncommitted text triggers a commit (autosave), not a prompt. Because commit appends a revision, an unwanted autosave is recoverable; a lost draft is not. `[INF]`
- `Esc` with uncommitted changes: first press exits the instruction input back to the body; second press asks "Discard changes?" with Discard / Keep editing. `Esc` never destroys text without a question. §10. `[INF]`

### 5.10 How an edit re-enters conversation context

Vendors disagree, and the disagreement is the interesting part. Anthropic states flatly: _"Your edits won't change Claude's memory of the original content."_ `[VENDOR: support.claude.com/en/articles/9487310]`, render state and model context are allowed to diverge. For ChatGPT this is unresolved `[OBS: absence]`, though Canvas is documented as a shared workspace whose current content the next turn operates on `[VENDOR, inferred from launch materials]`.

**Our decision: edits DO re-enter context, and we make the boundary visible.** `[INF, deliberate divergence from Anthropic's documented behaviour]`

Rationale: a user who deletes a paragraph and then asks "make it shorter" and gets the deleted paragraph back has hit a bug, whatever the docs call it. The divergent model is a silent trap.

Mechanism, on the next user turn:

1. The context serializer (§8.4) walks the conversation's parts and, for each part with `revision > 0`, emits the **current** text, not the originally generated text.
2. Each such part is prefixed with a machine-readable marker the model is instructed to respect:
   `<part id="{partId}" kind="{kind}" revision="{n}" edited-by="user,assistant">`
3. A short system-side note is appended once per turn when any part was hand-edited: _"The user has edited the document(s) above since you wrote them. The text shown is authoritative."_ `[INF]`
4. **The user sees this.** A one-line note under the block: _"Edited, the assistant will see your version."_ This is the visible boundary the research recommended; we just chose the opposite side of it. `[INF]`

`Ask for changes` submissions are **not** logged as chat turns in the transcript `[OBS: the NL input lives in the block header, not the composer, the implication that it does not become a visible turn is INF]`. They are recorded in the part's revision log (§8.2) with `source: 'instruction'` and the instruction text, and are visible in the block's revision list. Rationale: an instruction stream that fills the transcript with "make it shorter" makes the transcript useless as a record of the conversation.

---

## 6. PER-TYPE ACTION CLUSTERS

### 6.1 Descriptor

```ts
// packages/contracts/types/src/response-parts.ts

export type ActionSideEffect =
  | 'none' // pure read; copy, expand
  | 'local-io' // writes a file on the user's machine; download
  | 'external' // leaves the product; mailto:, opens a connected app
  | 'irreversible'; // sends something. Always confirms.

export interface PartActionDescriptor {
  id: string; // 'copy' | 'download' | 'expand' | 'open-in-email' | …
  label: string; // tooltip + aria-label. [OBS: "Open in email"]
  icon: string; // icon token, resolved per surface
  sideEffect: ActionSideEffect;
  weight: 'primary' | 'secondary';
  /** Required capability. Missing on a surface ⇒ action is NOT RENDERED (§9). */
  requires?: 'clipboard' | 'filesystem' | 'mail-handler' | 'fullscreen';
  /** Confirmation. Mandatory for 'irreversible'; optional otherwise. */
  confirm?: { title: string; body: string; confirmLabel: string };
  /** Disabled while true. Chrome supplies status/edit state. */
  disabledWhen?: (ctx: { status: ResponsePartStatus; editing: boolean }) => boolean;
}
```

Enforced invariants (unit-tested in `packages/contracts/types/src/response-parts.test.ts` `[INF new]`):

- `sideEffect === 'irreversible'` ⇒ `confirm` is defined. Build fails otherwise.
- `sideEffect === 'external'` ⇒ the label names the destination ("Open in email", not "Send").
- No action may mutate the part's buffer. Content mutation happens only through the edit controller.

### 6.2 The table

| Kind       | Actions (in order)                                                                    | Notes                                                                               |
| ---------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `doc.v1`   | `copy` (none) · `download` (local-io) · `expand` (none) · _undo when stack non-empty_ | `[OBS: copy, download, expand-to-fullscreen on a document block]`                   |
| `email.v1` | `copy` (none) · `open-in-email` (external, `requires: 'mail-handler'`)                | **download and expand are replaced, not hidden alongside.** `[OBS]`                 |
| `code.v1`  | `copy` · `download` (local-io, extension from `language`) · `expand`                  | `[VENDOR: Canvas exports code with a language-appropriate extension, .py/.js/.sql]` |
| `table.v1` | `copy` · `download` (CSV) · `expand`                                                  | `[INF]`                                                                             |

Download format by kind `[VENDOR: "general documents export to PDF, Markdown (.md), or Word (.docx)"]`: `doc.v1` → `.md` in v1, with `.docx`/`.pdf` deferred (we have no document exporter today; do not promise a format we cannot produce). `code.v1` → language extension. `table.v1` → `.csv`. `[INF]`

### 6.3 `open-in-email` specifically

Its mechanism is explicitly not resolvable from the observation, plain `mailto:` handoff versus a connected Gmail/Outlook app is an open question `[OBS: absence; VENDOR: the Apps article describes connector write-actions generically but never this control]`.

Our v1: **`mailto:` only.** `[INF]`

```
mailto:{to}?cc={cc}&subject={encoded subject}&body={encoded body}
```

- The body is the _current_ buffer, so hand-edits and placeholder fills go with it.
- **Placeholders block the action.** If any `placeholders[]` token still appears literally in the body, the action is enabled but confirms first: _"3 placeholders are still unfilled ([Student Name], …). Open your mail app anyway?"_ `[INF, the observation shows highlighted placeholders but does not show what happens on send; sending `[Student Name]` to a real recipient is the failure this prevents]`
- If the surface reports no mail handler (`requires: 'mail-handler'` unmet), the action is **not rendered** and `copy` remains. It must never render as a dead control. §9.
- A connector-backed "Send with Gmail" is out of scope for v1 and would be `sideEffect: 'irreversible'` with a mandatory confirm showing recipient, subject and full body.

### 6.4 Placeholder spans

- Rendered as distinct highlighted spans with `data-placeholder-token`. `[OBS]`
- Clicking one selects its full token so typing replaces it. `Tab`/`Shift+Tab` inside edit mode moves between remaining placeholders. `[INF, the observation could not confirm whether the competitor's placeholders are interactive; we make them so, because a highlighted span you cannot act on is decoration]`
- Placeholder offsets are recomputed after every buffer change (same pass as citation re-anchoring, §7.4).

---

## 7. CITATIONS

### 7.1 Requirement

Inline pills at the end of a supporting sentence: favicon, truncated source name ("OpenAI Help C…"), and an overflow counter ("+1", "+2") when several sources back one claim. Sources are **grouped into one chip with a count**, not listed as separate footnote markers. `[OBS]` Vendor-side, OpenAI mandates that "inline citations must be made clearly visible and clickable" `[VENDOR: developers.openai.com web-search guide]`.

### 7.2 What we already have, and what has to change

- `packages/ui/unified-chat/src/components/CitationPill.tsx` already renders exactly the observed shape: optional favicon `<img>` with an `onError` hide, `truncate(label, 20)`, and `+{additionalCount}` when `additionalCount > 0` `[REPO CitationPill.tsx:10-52]`, over `Citation { id?, url, title?, snippet?, domain?, faviconUrl?, additionalCount? }` `[REPO packages/ui/unified-chat/src/lib/types.ts:67-75]`. **Keep this component. It meets the observation.**
- But it reaches only desktop at runtime, unified-chat's `MessageBubble` is mounted only by `apps/desktop/src/features/v3/DesktopShellV3.tsx` `[REPO]`. Web has an unrelated citation surface: numbered "Source N" links built from `source.citationIndex` in `ToolTimeline.tsx:207` `[REPO]`. Two implementations, no shared type.
- Neither is anchored to text spans. Both are message-level lists. That is the actual gap.

### 7.3 Contract

```ts
// packages/contracts/types/src/response-parts.ts

export interface CitationSource {
  id: string;
  url: string;
  title?: string;
  domain?: string;
  /** Resolved CLIENT-SIDE. Neither OpenAI's url_citation nor Claude's
   *  search_result_location carries a favicon field. [VENDOR: both schemas] */
  faviconUrl?: string;
  snippet?: string;
}

export interface CitationGroup {
  id: string;
  /** Char offsets into the part's canonical text. Half-open [start, end). */
  span: { start: number; end: number };
  /** Verbatim text at `span` when the group was created. The re-anchor key. */
  anchorText: string;
  /** Ordered; sources[0] labels the chip, the rest become "+N". [OBS] */
  sources: CitationSource[];
  /** Set when re-anchoring failed. Chip moves to the footer list. §7.4. */
  detached?: boolean;
}
```

Grouping is a **rendering-layer** step over whatever the provider returns. OpenAI returns a flat `url_citation` annotation array of `{start_index, end_index, url, title}` with no grouping `[VENDOR]`; Anthropic returns citations already grouped per text content block, and streams them as `citations_delta` events that can arrive _after_ the text they decorate `[VENDOR: platform.claude.com citations docs]`. So:

```ts
export function groupCitations(
  annotations: ReadonlyArray<{ start: number; end: number; source: CitationSource }>,
): CitationGroup[];
```

Rule: annotations whose spans overlap, or whose gap is only whitespace/punctuation, merge into one group; the group's span is the union; the chip renders after the group's end. `[INF, required to produce the observed grouped chip from a flat array]`

Because citation deltas may arrive after their text `[VENDOR]`, the citation layer must be able to attach a chip to already-rendered text mid-stream. Chips are therefore an **overlay computed from offsets at render time**, never inline DOM nodes spliced into the text, splicing would corrupt the edit buffer's offset math.

### 7.4 Surviving an edit

Every buffer mutation runs one re-anchor pass, in the same synchronous reducer as the patch and the undo push:

```ts
function reanchor(groups: CitationGroup[], patch: TextPatch, next: string): CitationGroup[] {
  const delta = patch.insert.length - (patch.end - patch.start);
  return groups.map((g) => {
    if (g.span.end <= patch.start) return g; // entirely before: unchanged
    if (g.span.start >= patch.end) {
      // entirely after: shift
      return { ...g, span: { start: g.span.start + delta, end: g.span.end + delta } };
    }
    // Overlaps the edit. Try to relocate by exact anchorText match near the edit.
    const found = findNearest(next, g.anchorText, patch.start);
    if (found >= 0) return { ...g, span: { start: found, end: found + g.anchorText.length } };
    return { ...g, detached: true }; // survives, but unanchored
  });
}
```

- A detached group is **never deleted.** It moves to a "Sources" list rendered in the block footer, with its chip greyed and labelled "source for removed text". Deleting a sentence must not silently delete the evidence for it. `[INF, no competitor behaviour observed here at all]`
- If the user re-types text that exactly matches a detached group's `anchorText`, it re-attaches on the next pass.
- New text written by an AI instruction carries no citations unless the edit response supplies them; we do not inherit the replaced span's citations onto new text, because that would attribute a claim to a source that never supported it. `[INF]`

### 7.5 Interaction

- **Hover:** a popover after 300ms with full title, domain, and `snippet` if present. `[INF, not observed; the observation only shows the chip's static appearance]`
- **Click:** opens the URL in a new tab via the host's `onOpenUrl`, with `noopener,noreferrer`, same as the existing pill `[REPO CitationPill.tsx:16]`. On a grouped chip (`sources.length > 1`), click opens a small menu listing all sources; it does not guess which one you meant. `[INF]`
- **Keyboard:** the chip is in tab order, `Enter` activates, `aria-label` = `"{sources.length} sources: {domains}"`.
- Favicon: fetched client-side from the URL origin with a per-domain cache and a silent hide on error `[REPO CitationPill.tsx:41-43 already does the hide]`. Never block chip render on a favicon.

### 7.6 Consolidation

Web adopts `CitationPill` from `@agiworkforce/unified-chat` for part-level citations. `ToolTimeline`'s numbered "Source N" links stay as-is, they are a tool-run audit surface, a different thing from an inline claim citation, and merging them would be a regression in the audit view. We are unifying the _inline claim citation_, not every list of URLs in the product. `[INF]`

---

## 8. PERSISTENCE AND CONTEXT

### 8.1 What is stored where

| Datum                                                | Store                                                                                                                 | Lifetime          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Part envelope as generated (revision 0)              | message metadata under `RESPONSE_PARTS_METADATA_KEY`, parsed by `readPersistedResponseParts`                          | with the message  |
| Current content + every revision                     | `packages/platform/artifacts/src/artifact-store.ts`, `artifacts[]` + `versionsById[partId][]` `[REPO :26-27]`         | conversation      |
| Revision log (who/what/why)                          | new `revisionLogById` side map in the same store `[INF]`                                                              | conversation      |
| Undo/redo stack                                      | in-memory, edit controller only                                                                                       | until unmount     |
| Edit-mode phase, selection, scroll, minimap position | component state                                                                                                       | until unmount     |
| Published snapshot                                   | `publishArtifact` → local file or `/api/artifacts/publish` `[REPO packages/platform/artifacts/src/artifacts.ts:292+]` | until unpublished |

`partId` **is** the artifact id. One identity, one store. Do not introduce a parallel id space.

### 8.2 Revisions: append, never rewrite

```ts
export interface PartRevision {
  revision: number; // = SharedArtifact.version
  contentHash: string;
  at: string;
  source: 'model' | 'manual' | 'instruction' | 'restore';
  instruction?: string; // when source === 'instruction'
  summary?: string; // from PartEditResponse.summary
}
```

**Does an edit rewrite history or append a revision? It appends.** `[INF, our decision]` Concretely, this already works: `upsertArtifact` with different content on the same id sets `version: existing.version + 1` and pushes onto `versionsById[id]` `[REPO artifact-store.ts:96, :102-105]`; identical content updates in place and appends nothing `[REPO :85-90]`. The original model output remains addressable as revision 0 forever.

Restore is also append-only: `restoreArtifactVersion(id, index)` reads the target version and `upsertArtifact`s its content as a **new** version rather than truncating forward history `[REPO apps/web/features/chat/stores/artifacts-store.ts:493-503]`. That is git-revert semantics, and it is the correct default, restoring never destroys the revisions you are restoring past. Anthropic's docs do not state which semantics their version selector uses `[VENDOR: gap]`; we state ours.

### 8.3 Revision UI vs. undo

Two controls, two jobs, and conflating them is the failure mode to avoid:

|             | Undo (§4.4/§5.7)                               | Revisions                                                                              |
| ----------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Granularity | coalesced keystroke runs and single AI edits   | one per commit                                                                         |
| Lifetime    | in-memory, session                             | persisted with the conversation                                                        |
| Control     | header arrow, appears after first edit `[OBS]` | "v3/5" stepper + Restore, always visible when `versionCount > 1`                       |
| Precedent   | `[OBS]` ChatGPT's single arrow                 | `[VENDOR]` Claude's version selector; `[REPO]` our own `ArtifactPreview.tsx:1220-1266` |

Reuse the existing stepper and restore button rather than building a second one, `ArtifactPreview.tsx` already ships back/forward version navigation and `data-testid="artifact-restore-version"` `[REPO :1220-1263]`. The block chrome hosts the same controls against the same store.

### 8.4 What the model sees next turn

Serializer: `packages/platform/artifacts/src/part-context.ts` `[INF new]`.

```ts
export function serializePartsForContext(parts: ResponsePart[], budgetChars: number): string;
```

- Emits each part's **current** text (§5.10), wrapped in the `<part id kind revision edited-by>` marker.
- Parts are emitted newest-first and truncated at `budgetChars`; a truncated part is emitted as head + tail with an explicit `[… N characters omitted …]` marker rather than a silent cut.
- A part the user has never edited and that the model wrote this same turn is **not** re-emitted, it is already in the transcript. Only parts with `revision > 0`, or parts from earlier turns being referenced, are re-emitted. `[INF]`
- Published state is irrelevant to context.

### 8.5 Known limitation to state up front

`publishArtifact` is not version-aware: neither `LocalPublishResult` nor `CloudPublishResult` carries a version, and the web adapter UPSERTs on `(user_id, artifact_id)` with no version column, so a published page always shows the latest content and earlier published revisions are not addressable `[REPO packages/platform/artifacts/src/artifacts.ts:57-62, stated as a known gap in the module's own doc comment; :136-155 for the result types]`. Therefore: **a published block link is live, not a snapshot.** Say so in the publish confirmation copy. Fixing it means adding a version column to `apps/web/db/neon/0095_published_artifacts.sql` and a `revision` field to the publish result types, named as phase 6, not smuggled into this work.

---

## 9. SURFACE MATRIX

A capability we do not have on a surface must be **absent**, never a dead control. `requires` on `PartActionDescriptor` (§6.1) is the enforcement point: the chrome filters actions whose `requires` the surface does not report.

Note on Electron: **we do not ship an Electron app.** Our desktop is Tauri (`apps/desktop`, `apps/desktop/src/runtime/TauriRuntime.ts` `[REPO]`). The nearest Electron-hosted surface is the VS Code extension webview (`apps/extension-vscode` `[REPO]`), and it is specified as such below. Do not build for a hypothetical Electron shell.

| Behaviour                                 | Web                 | Desktop (Tauri)                                                         | VS Code webview (Electron-hosted)                                 | Mobile (RN)                                           |
| ----------------------------------------- | ------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Block container + sticky header           | full                | full                                                                    | full                                                              | full-width, no inset margin                           |
| Streaming mount at first delta            | yes                 | yes                                                                     | yes                                                               | yes                                                   |
| Direct manual editing (`contenteditable`) | yes                 | yes                                                                     | yes                                                               | **no**, see below                                     |
| "Ask for changes" instruction             | yes                 | yes                                                                     | yes                                                               | yes                                                   |
| Undo (state-driven)                       | yes                 | yes                                                                     | yes                                                               | yes                                                   |
| `Cmd/Ctrl+Z` inside block                 | yes                 | yes                                                                     | yes                                                               | n/a                                                   |
| Scroll-to-bottom in block                 | yes                 | yes                                                                     | yes                                                               | yes                                                   |
| Section minimap                           | yes                 | yes                                                                     | **no**, panel too narrow; overflow "Jump to section" menu instead | **no**, same replacement                              |
| Expand to fullscreen                      | yes                 | yes                                                                     | yes (webview panel maximize)                                      | yes (full-screen sheet)                               |
| Copy                                      | yes                 | yes                                                                     | yes                                                               | yes                                                   |
| Download                                  | yes (`a[download]`) | yes (`LocalFileWriter` via `publishArtifact` seam `[REPO]`)             | yes (workspace file write)                                        | **not offered**, replaced by "Share" (OS share sheet) |
| Open in email                             | yes (`mailto:`)     | yes (`mailto:` via shell open)                                          | **not offered**, no mail handler reported                         | yes (`Linking.openURL('mailto:…')`)                   |
| Revision stepper + restore                | yes                 | yes (richer list already exists: `ArtifactVersionHistory.tsx` `[REPO]`) | yes                                                               | read-only list, restore allowed                       |
| Citation chips + hover popover            | yes                 | yes                                                                     | yes                                                               | chips yes; **tap** opens the source sheet (no hover)  |

**Mobile editing, explicitly.** `contenteditable` does not exist in React Native, and the observed desktop mechanics (sticky header with four icons, right-edge minimap, simultaneous cursor + header input) do not survive a phone viewport. Mobile therefore ships:

- read + citations + actions inline in the transcript;
- an **"Edit"** action that opens a full-screen sheet containing a native `TextInput` over the canonical text plus the same "Ask for changes" field at the top;
- the same commit path, the same revisions, the same undo stack.

This is a real product decision, not a stub, and it has precedent: Anthropic ships Cowork live artifacts **desktop-only**, _"Live artifacts are available on the desktop app only. They don't appear in the Artifacts view on web or mobile"_ `[VENDOR: support.claude.com/en/articles/14729249]`, and Claude mobile hands generated files to the OS viewer instead of editing in place `[VENDOR: support.claude.com/en/articles/12111783]`. We adapt rather than omit, but we adapt honestly.

Mobile has its own `MessageBubble.tsx` and `ProvenanceFooter.tsx` under `apps/mobile/src/features/chat/components/` that are _not_ imports from `@agiworkforce/unified-chat` `[REPO]`. The mobile part registry is therefore a separate `ResponsePartRegistry<React.ReactNode>` instance built against RN primitives, which the `TNode` generic already permits, not a port of the web components.

---

## 10. ACCESSIBILITY AND KEYBOARD

No vendor documents any of this: OpenAI's accessibility and help pages were unreachable `[VENDOR: 403 throughout]`, and Anthropic's artifact articles are silent on keyboard, ARIA and focus `[VENDOR: gap]`. Everything here is `[INF]`, derived from WAI-ARIA authoring practices. It is nonetheless **required**, not advisory.

### 10.1 Structure

```html
<section aria-labelledby="part-{id}-title" data-testid="response-block">
  <header role="group" aria-label="Document controls">
    <button aria-expanded="false" aria-controls="part-{id}-body">Edit</button>
    <!-- in edit mode this slot becomes: -->
    <!-- <input aria-label="Ask for changes" /> <button aria-label="Send edit instruction"> -->
    <!-- action cluster … -->
  </header>
  <div
    id="part-{id}-body"
    role="textbox"
    aria-multiline="true"
    aria-readonly="true"
    aria-label="{title}, document content"
    tabindex="0"
  >
    …
  </div>
  <div aria-live="polite" class="sr-only" data-testid="part-status"></div>
</section>
```

In edit mode: `aria-readonly="false"`, `contenteditable="true"`, `aria-expanded="true"` on the (now replaced) trigger slot. While streaming or submitting: `aria-busy="true"` on the body.

### 10.2 Focus

| Event                            | Focus goes to                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Activate Edit pill               | the "Ask for changes" input, **never** the removed pill's empty slot                                            |
| `Tab` from the instruction input | the body (as one stop), then the action cluster                                                                 |
| Submit instruction               | stays in the input; on apply, an announcement fires, focus unchanged                                            |
| Undo (button or `Cmd+Z`)         | the body, with `selectionBefore` restored                                                                       |
| Exit edit mode                   | the Edit pill, re-mounted at the same position                                                                  |
| Expand to fullscreen             | first focusable inside the expanded view; focus is trapped; `Esc` closes and returns focus to the expand button |

### 10.3 Keyboard map

| Keys                | Action                                 | Scope                                             |
| ------------------- | -------------------------------------- | ------------------------------------------------- |
| `Cmd/Ctrl+E`        | enter/exit edit mode                   | focus inside block                                |
| `Cmd/Ctrl+Z`        | undo                                   | focus inside block; suppressed while `submitting` |
| `Shift+Cmd/Ctrl+Z`  | redo                                   | same                                              |
| `Cmd/Ctrl+Enter`    | commit + exit edit mode                | edit mode                                         |
| `Enter`             | submit instruction                     | instruction input                                 |
| `Esc` (1st)         | leave instruction input → body         | edit mode                                         |
| `Esc` (2nd)         | exit edit mode; asks before discarding | edit mode                                         |
| `Esc`               | close fullscreen                       | fullscreen                                        |
| `Tab` / `Shift+Tab` | next/previous placeholder              | edit mode, `email.v1`                             |
| `End` / `Home`      | end/start of body                      | body focused                                      |

`Esc` never destroys text without a confirmation (§5.9).

### 10.4 Announcements (`aria-live="polite"`, one region per block)

- "Editing enabled. Whole document in scope." / "Editing selection, N characters."
- "Undo available.", once, on the 0 → 1 stack transition. Without this the state-driven undo is invisible to AT users. `[OBS drives the visual behaviour; this is the accessibility consequence]`
- "Applying changes…" → "Changes applied. {summary}" / "Could not apply changes: {reason}."
- "Editing disabled. Saved as revision {n}."
- "Document finished." on `streaming → complete`.

### 10.5 Non-negotiables

- The minimap is `aria-hidden`; the "Jump to section" menu is its accessible equivalent and must exist wherever the minimap does (§4.6).
- The scroll-to-bottom button is never the only path to the end of the document.
- Every icon-only control has an `aria-label` equal to its tooltip.
- Placeholder spans expose `aria-label="placeholder: {label}"`.
- Motion (pill→input morph, minimap scrub) respects `prefers-reduced-motion`.

---

## 11. BUILD SEQUENCE

Each phase is independently shippable and leaves the product working. Contract and registry come first because everything downstream is typed against them.

### Phase 1: Contract + registry + loud fallback

**Create**

- `packages/contracts/types/src/response-parts.ts`, kinds, envelope, bodies, capabilities, actions, registry type, `resolveResponsePartRenderer`, `classifyResponsePart`.
- `packages/contracts/types/src/response-part-codecs.ts`, `PartTextCodec` per kind.
- `packages/contracts/cloud-contracts/src/response-parts.ts`, zod schemas, `parseResponsePartDelta`, `readPersistedResponseParts`.
- `apps/web/features/chat/components/messages/parts/registry.ts`, `WEB_PART_REGISTRY`.
- `apps/web/features/chat/components/messages/parts/registry.coverage.test.ts`, §3.2.
- `apps/web/features/chat/components/messages/parts/UnclaimedPart.tsx`, fallback + telemetry.

**Extend**

- `packages/contracts/types/src/index.ts`, `packages/contracts/cloud-contracts/src/index.ts`, exports.
- Add the same coverage test for `WEB_CARD_REGISTRY` (`apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:15-21`) with `itinerary.v1` in the waiver set, so the existing silent gap becomes a declared one.

**Exit:** a `doc.v1` part round-trips through parse → classify → fallback render, and an unregistered known kind fails CI.

### Phase 2: Read-only block chrome

**Create**

- `apps/web/features/chat/components/messages/parts/ResponseBlock.tsx`, container, sticky header, action cluster, scroll-to-bottom.
- `apps/web/features/chat/components/messages/parts/DocPart.tsx`, `EmailPart.tsx`, `CodePart.tsx`.
- `apps/web/features/chat/components/messages/parts/actions.ts`, the §6.2 table as descriptors.
- `packages/ui/unified-chat/src/lib/outline.ts`.

**Extend**

- `apps/web/features/chat/components/messages/MessageBubble.tsx`, mount `<ResponseBlock>` beside the card block at `:1538`.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`, emit `x_response_part`, mirroring `:648`.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`, client capability, mirroring `:204`.

**Exit:** parts render with correct per-type action clusters, including `email.v1`'s replacement of download/expand. No editing yet.

### Phase 3: Edit controller

**Create**

- `packages/ui/unified-chat/src/lib/edit-controller.ts`, state machine, `UndoStack`, patch application, coalescing.
- `packages/ui/unified-chat/src/lib/edit-controller.test.ts`, undo coalescing, scope drift, verbatim-remainder invariant, the >60%-shrink guard.
- `apps/web/features/chat/components/messages/parts/EditableBody.tsx`, contenteditable surface + codec round-trip.
- `apps/web/features/chat/components/messages/parts/AskForChangesInput.tsx`.
- `apps/web/app/api/parts/edit/route.ts` + `route.test.ts`, hash verification, size guards.

**Extend**

- `packages/platform/artifacts/src/artifact-store.ts`, `revisionLogById` side map.

**Exit:** dual-channel editing, one undo stack, revisions appended via the existing content-keyed upsert. Explicitly test that a span edit leaves prefix and suffix byte-identical.

### Phase 4: Citations + minimap

**Create**

- `packages/ui/unified-chat/src/lib/citations.ts`, `groupCitations`, `reanchor`.
- `apps/web/features/chat/components/messages/parts/CitationLayer.tsx`, overlay + grouped chips + popover + detached footer list.
- `apps/web/features/chat/components/messages/parts/SectionMinimap.tsx`.

**Extend**

- Web adopts `CitationPill` from `@agiworkforce/unified-chat` for part citations. `ToolTimeline.tsx` untouched.

**Exit:** grouped chips with `+N`, correct re-anchoring across manual and AI edits, no citation ever silently deleted.

### Phase 5: Revisions UI + accessibility hardening

**Extend**

- `ResponseBlock.tsx`, revision stepper + Restore, reusing `restoreArtifactVersion` (`apps/web/features/chat/stores/artifacts-store.ts:493`), not a second mechanism.
- Full §10 pass: focus order, announcements, keyboard map, reduced motion. Ship with an axe run in CI over a rendered block in each of `idle`, `editing`, `submitting`, `streaming`.

### Phase 6: Other surfaces + version-aware publish

- `apps/desktop`: desktop registry instance; reconcile with `ArtifactVersionHistory.tsx` and `InlineArtifactEditor.tsx` (the latter is documented as not conflict-aware `[REPO artifacts.ts:63-66]`, decide whether it becomes the desktop `EditableBody` or is retired).
- `apps/mobile`: RN registry instance + full-screen edit sheet.
- `apps/extension-vscode`: read + instruct, no minimap, no `open-in-email`.
- Version-aware publish: add `revision` to `LocalPublishResult`/`CloudPublishResult` (`packages/platform/artifacts/src/artifacts.ts:136-155`) and a version column to `apps/web/db/neon/0095_published_artifacts.sql`, both named in that module's own "known gaps" comment.

### Parallel cleanup (any phase, independent)

- Rebuild `packages/contracts/types/dist/`, the committed `.d.ts` lists only 3 of the 4 known card kinds (`mcp-app.v1` missing). Source is authoritative and correct; the stale artifact will mislead anyone inspecting `dist/` `[REPO]`.
- Decide `itinerary.v1`: build `apps/web/features/chat/components/messages/cards/ItineraryCard.tsx` and register it, or record the waiver. It is fully typed, zod-validated with `superRefine` invariants, and unit-tested, with zero runtime `[REPO]`.
- Wire `ctx.onRespond` / a computed `canRespond` at `InteractiveCardBlock.tsx:52`, today it is hardcoded `canRespond: false` with no handler, so every `clarify.v1` card is permanently read-only despite `ClarifyCard` implementing the answer UI `[REPO]`. Same threading pattern as `inlineEdit.submitEdit` in `MessageBubble.tsx:611-617`.

---

## 12. OPEN QUESTIONS AND RISKS

### 12.1 Not documented anywhere, we are guessing

| #   | Question                                                                                                                                                              | Our guess                                 | How to settle it                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| R1  | Does the competitor's undo pop one step or many? Is there a redo?                                                                                                     | multi-step stack, redo keyboard-only      | live session: three edits, press undo three times                               |
| R2  | Does the competitor's undo survive reload?                                                                                                                            | ours does not; revisions do               | live session: edit, reload, look for the arrow                                  |
| R3  | **Mid-stream chrome**: mount timing, whether Edit is disabled, whether the block auto-follows                                                                         | §4.7 table                                | screen **recording** from the first token, still screenshots cannot answer this |
| R4  | Whole-body highlight on entry: is it scope or decoration? Does a sub-selection narrow the edit?                                                                       | it is scope; sub-selection narrows        | live: select one sentence, ask for a change, see what else moved                |
| R5  | Is there an accept/reject diff step?                                                                                                                                  | no                                        | live: make an edit, watch for a review step                                     |
| R6  | Does "Open in email" use `mailto:` or a connected app?                                                                                                                | `mailto:`                                 | live: click it with and without a connected mail app                            |
| R7  | Are placeholder tokens interactive?                                                                                                                                   | ours are                                  | live: click one                                                                 |
| R8  | Do the classic shortcut menus (Adjust length, Reading level, Final polish; Fix bugs, Port to a language) `[VENDOR]` still exist, or did the freeform box absorb them? | absorbed                                  | live: look behind every overflow control on the block                           |
| R9  | Do citations appear inside a document block at all, or only in prose?                                                                                                 | they do; we anchor them                   | live: ask for a cited document                                                  |
| R10 | What signal selects `email` as a distinct type?                                                                                                                       | an explicit type field, not text sniffing | unknowable externally; ours is explicit by construction                         |

All ten are blocked on the same thing: `help.openai.com` and `openai.com` returned HTTP 403 to every automated fetch during research, and the session's WebSearch budget was exhausted. **A single 20-minute live session with a screen recorder resolves R1–R9.** Budget it before phase 3.

### 12.2 Where we deliberately differ

| Area                          | Them                                                                                      | Us                                                                    | Why                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Manual edits in model context | Anthropic: _"Your edits won't change Claude's memory of the original content"_ `[VENDOR]` | edits re-enter context, with a visible note                           | a user who deletes a paragraph and gets it back has hit a bug                                                               |
| Minimap placement             | viewport right edge `[OBS]`                                                               | block right gutter                                                    | viewport-edge chrome owned by one of several blocks is ambiguous and breaks on narrow windows                               |
| Scoped edit transport         | unknown `[OBS: absence]`                                                                  | span + hash, model returns only the replacement                       | verbatim remainder becomes an invariant, not a hope                                                                         |
| Destructive rewrite           | applied silently `[OBS: absence of any guard]`                                            | confirm when a whole-doc rewrite drops >60%                           | silent data loss is not a feature                                                                                           |
| History model                 | one undo arrow `[OBS]`                                                                    | undo **and** persisted revisions                                      | we already have content-keyed versioning and restore `[REPO]`; throwing it away to match a screenshot would be a regression |
| Detached citations            | unknown                                                                                   | never deleted; move to a footer list                                  | evidence must not vanish with the sentence                                                                                  |
| Mobile                        | Anthropic gates the rich renderer off entirely `[VENDOR]`                                 | adapt to a full-screen sheet                                          | our mobile app is a first-class surface, but we adapt honestly rather than shipping a broken `contenteditable`              |
| Concurrent writers            | "both live at once" `[OBS]`                                                               | both _available_; direct editing frozen while an AI edit is in flight | there is no correct merge for two simultaneous writers on one buffer                                                        |

### 12.3 Engineering risks

1. **`contenteditable` is the single largest source of bugs in this spec.** IME composition, paste, Safari selection quirks, and offset math under a citation overlay are all hard. Mitigation: the canonical text is the source of truth and the DOM is a projection; every input event re-derives text through the codec; write the offset math as pure functions with property tests before writing a single component.
2. **Offset drift** between the buffer, citation spans, placeholder spans and outline offsets. Mitigation: one reducer, one pass, patch, undo push, citation re-anchor, placeholder recompute, outline recompute all happen in the same synchronous call. Never in a `useEffect`.
3. **The registry gap recurs.** `itinerary.v1` proves a fully-specified type can ship with no renderer and no alarm `[REPO]`. Mitigation: the coverage test in phase 1, with an explicit waiver set. Do not weaken it.
4. **Two chat render stacks.** unified-chat's `MessageBubble`/`CitationPill`/`ArtifactRenderer` reach only desktop; web and mobile each have their own `MessageBubble` `[REPO]`. This spec puts the _contract, edit controller, outline and citation logic_ in shared packages and lets each surface own its components. Resist the urge to unify the components in this workstream, that is a separate, larger migration.
5. **`unified-chat`'s `ArtifactRenderer` / `CheckpointManager` / `BranchNavigator` / `RewindTimeline` have no confirmed consumer outside the package's own tests** `[REPO]`. Before reusing any of them, confirm they are live somewhere; if not, do not build phase 5 on top of dead code.
6. **Published pages are live, not snapshots** (§8.5). If a user publishes a document and then edits it, the shared link changes under the recipient. Ship the correct copy in the publish dialog in phase 2, and fix it properly in phase 6.

---

### Files this spec touches, at a glance

**New:** `packages/contracts/types/src/response-parts.ts`, `response-part-codecs.ts` · `packages/contracts/cloud-contracts/src/response-parts.ts` · `packages/ui/unified-chat/src/lib/{edit-controller,citations,outline}.ts` · `packages/platform/artifacts/src/part-context.ts` · `apps/web/features/chat/components/messages/parts/*` · `apps/web/app/api/parts/edit/route.ts`

**Extended:** `apps/web/features/chat/components/messages/MessageBubble.tsx:1538` · `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:15-21,:52` · `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:648` · `.../request-processor.ts:204` · `packages/platform/artifacts/src/artifact-store.ts` · `packages/platform/artifacts/src/artifacts.ts:136-155` · `apps/web/db/neon/0095_published_artifacts.sql`

**Deliberately untouched:** `apps/web/features/chat/components/messages/EditableMessage.tsx` (user-turn edit-and-retry) · `apps/web/features/chat/components/messages/ToolTimeline.tsx` (tool-run source audit) · `ArtifactPreview.tsx`'s `sourceDraft` textarea (raw source editing). Three different jobs; do not merge them into this one.
