/**
 * Interactive card contracts — structured, answerable, durable transcript cards.
 *
 * A card is a projection of a TOOL CALL. `cardId` ALWAYS equals the originating
 * `tool_call_id`, which is what lets an answer satisfy the exact-set-equality
 * invariant enforced inside `claimCloudAgentApprovalCheckpoint`.
 *
 * Platform-neutral and dependency-free: React Native, the Chrome side panel's
 * imperative DOM, the Electron and Tauri shells and the Rust CLI's TS bindings
 * all read this module, so it holds no zod, no React and no DOM types. Runtime
 * validation lives in `@agiworkforce/cloud-contracts`, which owns zod.
 */

import type { ChatExecutionMode } from './suite-contracts';

/**
 * MAJOR version. Deliberately NOT pinned as a literal at the parse boundary —
 * a client that meets a higher version renders `fallback`, it does not drop the
 * card. Pinning it with `z.literal(1)` would discard the card INCLUDING its
 * fallback on the next bump, turning a graceful degradation into a blank
 * message.
 */
export const INTERACTIVE_CARD_SCHEMA_VERSION = 1;

/** Additive SSE delta key, following the existing `x_*` convention. */
export const INTERACTIVE_CARD_DELTA_KEY = 'x_interactive_card' as const;

/**
 * Additive REQUEST key. Absent => the server offers no card-producing tools and
 * emits no cards. This is the primary degradation lever and it is
 * SERVER-ENFORCED: a surface that has not implemented the decoder is never sent
 * a card, so "a new delta silently vanished on a surface that never decoded it"
 * is structurally impossible rather than merely discouraged.
 */
export const INTERACTIVE_CARD_REQUEST_KEY = 'x_interactive_cards' as const;

/** Key under `web_messages.metadata` where the durable projection lives. */
export const INTERACTIVE_CARDS_METADATA_KEY = 'interactiveCards' as const;

/**
 * Hard cap on ONE serialized card, enforced at CONSTRUCTION on the server.
 * `MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH` is 32_000 for the WHOLE metadata bag,
 * already shared with thinking / toolCalls / artifacts / webSearchResults /
 * generatedFiles / agentActivity, and already trimming in production. We never
 * emit a card that will not persist.
 */
export const INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH = 12_000;
export const INTERACTIVE_CARDS_MAX_PER_MESSAGE = 4;

// ---------------------------------------------------------------------------
// Kind allowlist — this IS the security boundary
// ---------------------------------------------------------------------------

export const KNOWN_INTERACTIVE_CARD_KINDS = [
  'clarify.v1',
  'itinerary.v1',
  'map-search.v1',
] as const;
export type KnownInteractiveCardKind = (typeof KNOWN_INTERACTIVE_CARD_KINDS)[number];

/**
 * Wire-level kind is an OPEN string so an old client can always parse the
 * ENVELOPE of a card it cannot render.
 *
 * Versioning rule: additive changes never bump `vN` (parsers strip unknown
 * keys); a breaking change mints a new `vN`, which old clients render as
 * `fallback`.
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
 * `text` is PLAIN TEXT, not markdown: the CLI renders it into terminal cells and
 * the Chrome side panel sanitises with a narrow ALLOWED_ATTR list. Markdown here
 * would render as literal asterisks on two of six surfaces.
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
 * renders an input affordance — the established "omit the handler, do not render
 * the control" rule.
 */
export interface InteractiveCardInteraction {
  /** Managed-cloud run id. The only identifier that crosses the trust boundary. */
  runId: string;
  /**
   * True while the turn is SUSPENDED on this card. The runtime MUST keep the
   * assistant message open and MUST NOT run its `done` teardown — the same
   * contract `tool_approval_request` already has. Running teardown orphans the
   * card and the continuation has nothing to attach to.
   */
  awaitingResponse: boolean;
  /** Lease expiry. Past this, the card renders read-only as `expired`. */
  expiresAt: string;
  /**
   * Trust boundary of the producing turn, rendered as the visible provider
   * label. Typed as a union of one so widening it is a deliberate, reviewable
   * change: BYOK streams direct from the client with no server tool loop, and
   * Local must never reach our cloud.
   */
  executionMode: Extract<ChatExecutionMode, 'cloud_managed'>;
}

export interface InteractiveCardCommon {
  schemaVersion: number;
  /**
   * ALWAYS equals the originating `tool_call_id`. Load-bearing: it joins to
   * `ToolCall.id`, to `x_tool_result.tool_call_id`, and to the checkpoint's
   * `pending_tool_calls[].id`, so an answer satisfies the exact-set-equality
   * invariant in `claimCloudAgentApprovalCheckpoint` with no second identity to
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
 * (id, header, question, isOther, isSecret, options[{label, description}]) so
 * this extends the repo's existing schema asset instead of forking the concept a
 * second time.
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
   * input.
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
// Place identity — the fix for the wrong-city deep link
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
 * field would have been silently skipped by exactly the code that shipped the
 * bug — a directions URL built from display names, which resolved "South Park"
 * to Irving TX and "Frontier Tower" to Anaheim CA.
 *
 * `provider` is an open string and is deliberately NOT populated with a guessed
 * vendor name; the resolver names itself when it lands.
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
 * or resolver-chosen remote image host is an exfiltration channel: the fetch
 * alone leaks the viewer's IP, UA and referrer to a third party on behalf of a
 * chat whose trust boundary the widget does not know. It is also what keeps an
 * 8-stop itinerary inside the metadata budget.
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
  /** REQUIRED: no source, no chip. */
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
 * 8-stop day can exceed the mobile-browser cap.
 */
export interface ItineraryRouteLeg {
  label: string;
  /** Server-built from resolved ids only. Clients re-validate the scheme. */
  url: string;
  stopIds: string[];
}

/**
 * A union, not `routeUrl?: string`. On the unavailable branch there is no `url`
 * to read and no `legs` to index — "Open route" is not disabled by a runtime
 * `if` that someone can delete; it has nothing to render.
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
  /** Server-rendered static map, same-origin, catalogued. */
  overview?: InteractiveCardMediaRef;
}

export const ITINERARY_MAX_STOPS = 12;
export const ITINERARY_NOTE_MAX_LENGTH = 240;

// ---------------------------------------------------------------------------
// map-search.v1
// ---------------------------------------------------------------------------

/**
 * A deliberately identity-neutral map search. This is different from an
 * itinerary: the model supplies a bounded search query and the server builds
 * provider search URLs. It never claims that a place was resolved, never
 * manufactures coordinates, and cannot be used to build turn-by-turn routes.
 */
export const MAP_SEARCH_QUERY_MAX_LENGTH = 300;

export interface MapSearchAction {
  provider: 'google_maps' | 'openstreetmap';
  label: string;
  /** Server-built HTTPS URL. The model never authors this field. */
  url: string;
}

export interface MapSearchCardBody {
  title: string;
  query: string;
  actions: MapSearchAction[];
}

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
  /** e.g. "San Francisco, CA". Biases the resolver — its absence is how a park became one in another state. */
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
 * `name`, `displayName` and `title` are in this list deliberately: a
 * model-authored display name next to a resolver-authored address is two names
 * with no rule for which is authoritative, which is the same bug wearing a
 * smaller costume.
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
  | (InteractiveCardCommon & { recognized: true; kind: 'itinerary.v1'; body: ItineraryCardBody })
  | (InteractiveCardCommon & {
      recognized: true;
      kind: 'map-search.v1';
      body: MapSearchCardBody;
    });

/**
 * A card whose kind this build does not know, or whose body failed validation.
 *
 * `body` IS ABSENT FROM THE TYPE — not optional, not `unknown`, absent. A
 * renderer cannot reach for an unvalidated body; the attempt does not compile.
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
// Registry — one shape, three implementations
// (React DOM / React Native / imperative DOM)
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
 * card-producing tools. Fail-closed; this is what makes the CLI and VS Code
 * correct with zero client work.
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
// Capability axis
// ---------------------------------------------------------------------------

/**
 * Two booleans, not one: VS Code can RENDER a card and cannot ANSWER one (its
 * transcript has never accepted a click and its CSP forbids a second script
 * source). Collapsing these invites a dead control.
 */
export type InteractiveCardCapability =
  | 'canRenderInteractiveCards'
  | 'canAnswerInteractiveCards'
  | 'canRenderMapCards';
