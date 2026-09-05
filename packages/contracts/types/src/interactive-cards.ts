import type { PlacePriceLevel } from './places-search';
import type { ChatExecutionMode } from './suite-contracts';

export const INTERACTIVE_CARD_SCHEMA_VERSION = 1;

export const INTERACTIVE_CARD_DELTA_KEY = 'x_interactive_card' as const;

export const INTERACTIVE_CARD_REQUEST_KEY = 'x_interactive_cards' as const;

export const INTERACTIVE_CARDS_METADATA_KEY = 'interactiveCards' as const;

export const INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH = 12_000;
export const INTERACTIVE_CARDS_MAX_PER_MESSAGE = 4;

export const KNOWN_INTERACTIVE_CARD_KINDS = [
  'clarify.v1',
  'itinerary.v1',
  'map-search.v1',
  'mcp-app.v1',
  'places.v1',
] as const;
export type KnownInteractiveCardKind = (typeof KNOWN_INTERACTIVE_CARD_KINDS)[number];

export type InteractiveCardKindWire = string;

export function isKnownInteractiveCardKind(kind: string): kind is KnownInteractiveCardKind {
  return (KNOWN_INTERACTIVE_CARD_KINDS as readonly string[]).includes(kind);
}

/**
 * Kinds the model produces before it writes a word, so the transcript reads in
 * the order the turn happened. Everything else renders after the prose that
 * motivated it.
 */
export const LEADING_INTERACTIVE_CARD_KINDS: readonly KnownInteractiveCardKind[] = ['places.v1'];

export function interactiveCardRendersBeforeProse(kind: string): boolean {
  return (LEADING_INTERACTIVE_CARD_KINDS as readonly string[]).includes(kind);
}

export interface InteractiveCardFallback {
  headline: string;
  text: string;
  markdown?: string;
}

export interface InteractiveCardInteraction {
  runId: string;
  awaitingResponse: boolean;
  expiresAt: string;
  executionMode: Extract<ChatExecutionMode, 'cloud_managed'>;
}

export interface InteractiveCardCommon {
  schemaVersion: number;
  cardId: string;
  createdAt: string;
  fallback: InteractiveCardFallback;
  interaction?: InteractiveCardInteraction;
  producedBy: { toolCallId: string; toolName: string };
}

export const CLARIFY_MAX_QUESTIONS = 4;
export const CLARIFY_MIN_OPTIONS = 2;
export const CLARIFY_MAX_OPTIONS = 4;
export const CLARIFY_HEADER_MAX_LENGTH = 12;
export const CLARIFY_OTHER_MAX_LENGTH = 500;

export interface ClarifyOption {
  id: string;
  label: string;
  description: string;
}

export interface ClarifyQuestion {
  id: string;
  header: string;
  question: string;
  options: ClarifyOption[];
  multiSelect: boolean;
  isOther: boolean;
  isSecret: boolean;
}

export type ClarifyAnswer =
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

export type PlaceUnresolvedReason =
  | 'no_match'
  | 'ambiguous'
  | 'outside_region'
  | 'provider_error'
  | 'rate_limited'
  | 'not_permitted_in_this_chat';

export type PlaceIdentity =
  | {
      status: 'resolved';
      provider: string;
      providerPlaceId: string;
      lat: number;
      lng: number;
      displayName: string;
      formattedAddress: string;
      resolvedAt: string;
      attribution: { providerLabel: string; providerUrl?: string };
    }
  | {
      status: 'unresolved';
      query: string;
      reason: PlaceUnresolvedReason;
    };

export function isResolvedPlace(
  place: PlaceIdentity,
): place is Extract<PlaceIdentity, { status: 'resolved' }> {
  return place.status === 'resolved';
}

export interface InteractiveCardMediaRef {
  fileId: string;
  width: number;
  height: number;
  alt: string;
}

export interface InteractiveCardSource {
  url: string;
  title: string;
}

export interface ItineraryStop {
  id: string;
  pin: number;
  placeIndex: number;
  startTimeLabel: string;
  note: string;
  thumbnail?: InteractiveCardMediaRef;
  sources: InteractiveCardSource[];
}

export type ItineraryTravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';

export interface ItineraryRouteLeg {
  label: string;
  url: string;
  stopIds: string[];
}

export type ItineraryRoute =
  | { status: 'available'; travelMode: ItineraryTravelMode; legs: ItineraryRouteLeg[] }
  | {
      status: 'unavailable';
      reason:
        | 'unresolved_stops'
        | 'too_few_stops'
        | 'provider_unavailable'
        | 'not_permitted_in_this_chat';
      unresolvedStopCount: number;
    };

export interface ItineraryCardBody {
  title: string;
  summary: string;
  summarySources: InteractiveCardSource[];
  region: { label: string; timeZone: string };
  places: PlaceIdentity[];
  stops: ItineraryStop[];
  route: ItineraryRoute;
  overview?: InteractiveCardMediaRef;
}

export const ITINERARY_MAX_STOPS = 12;
export const ITINERARY_NOTE_MAX_LENGTH = 240;

export const MAP_SEARCH_QUERY_MAX_LENGTH = 300;

export interface MapSearchAction {
  provider: 'google_maps' | 'openstreetmap';
  label: string;
  url: string;
}

export const MAP_SEARCH_MIN_ZOOM = 2;
export const MAP_SEARCH_MAX_ZOOM = 17;
export const MAP_SEARCH_MAX_PLACES = 2;

export interface MapSearchPlace {
  label: string;
  latitude: number;
  longitude: number;
  kind?: string;
  /**
   * False when the place could not be tied to the rest of the request's
   * geography - a same-name match on another continent, say. A low-confidence
   * place may still be shown, but it must be labelled as unconfirmed and must
   * not be offered as a routing destination.
   */
  confident?: boolean;
}

export interface MapSearchView {
  latitude: number;
  longitude: number;
  zoom: number;
  attribution: string;
}

export interface MapSearchCardBody {
  title: string;
  query: string;
  actions: MapSearchAction[];
  view?: MapSearchView;
  places?: MapSearchPlace[];
}

export interface McpAppCardBody {
  payloadId: string;
  connectorId: string;
  toolName: string;
  resourceUri: string;
}

export const PLACES_CARD_MAX_PLACES = 10;
export const PLACES_CARD_MAX_PHOTOS_PER_PLACE = 4;
export const PLACES_CARD_PHOTO_REFERENCE_MAX_LENGTH = 512;
export const PLACES_CARD_NAME_MAX_LENGTH = 160;
export const PLACES_CARD_ADDRESS_MAX_LENGTH = 300;
export const PLACES_CARD_CATEGORY_MAX_LENGTH = 80;
export const PLACES_CARD_ATTRIBUTION_MAX_LENGTH = 160;
export const PLACES_CARD_PLACE_ID_MAX_LENGTH = 256;
export const PLACES_CARD_LOCAL_TIME_MAX_LENGTH = 120;
export const PLACES_CARD_MIN_RATING = 0;
export const PLACES_CARD_MAX_RATING = 5;

export interface PlacesCardPhoto {
  reference: string;
  attribution?: string;
}

export interface PlacesCardPlace {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  priceLevel?: PlacePriceLevel;
  openNow?: boolean;
  directionsUrl?: string;
  websiteUrl?: string;
  photos?: PlacesCardPhoto[];
}

export interface PlacesCardBody {
  query: string;
  near?: string;
  openNowRequested: boolean;
  /** The instant the search ran, in the reader's own zone, so an open-now claim
   * carries the time it was true for instead of implying "now". */
  localTime?: string;
  attribution: string;
  termsUrl?: string;
  places: PlacesCardPlace[];
}

export interface ItineraryToolInputStop {
  startTimeLabel: string;
  note: string;
  placeQuery: string;
  localityHint: string;
}

export interface ItineraryToolInput {
  title: string;
  summary: string;
  stops: ItineraryToolInputStop[];
  travelMode: ItineraryTravelMode;
}

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

export type KnownInteractiveCard =
  | (InteractiveCardCommon & { recognized: true; kind: 'clarify.v1'; body: ClarifyCardBody })
  | (InteractiveCardCommon & { recognized: true; kind: 'itinerary.v1'; body: ItineraryCardBody })
  | (InteractiveCardCommon & {
      recognized: true;
      kind: 'map-search.v1';
      body: MapSearchCardBody;
    })
  | (InteractiveCardCommon & {
      recognized: true;
      kind: 'mcp-app.v1';
      body: McpAppCardBody;
    })
  | (InteractiveCardCommon & {
      recognized: true;
      kind: 'places.v1';
      body: PlacesCardBody;
    });

export interface UnrecognizedInteractiveCard extends InteractiveCardCommon {
  recognized: false;
  kind: string;
}

export type InteractiveCard = KnownInteractiveCard | UnrecognizedInteractiveCard;

export type InteractiveCardBodyFor<K extends KnownInteractiveCardKind> = Extract<
  KnownInteractiveCard,
  { kind: K }
>['body'];

export interface InteractiveCardRenderContext {
  canRespond: boolean;
  onRespond?: (payload: InteractiveCardResponsePayload) => void;
  onOpenUrl?: (url: string) => void;
}

export type InteractiveCardRenderer<TNode, K extends KnownInteractiveCardKind> = (props: {
  card: Extract<KnownInteractiveCard, { kind: K }>;
  body: InteractiveCardBodyFor<K>;
  ctx: InteractiveCardRenderContext;
}) => TNode;

export type InteractiveCardRegistry<TNode> = {
  readonly [K in KnownInteractiveCardKind]?: InteractiveCardRenderer<TNode, K>;
};

export function resolveInteractiveCardRenderer<TNode>(
  registry: InteractiveCardRegistry<TNode>,
  card: InteractiveCard,
): InteractiveCardRenderer<TNode, KnownInteractiveCardKind> | null {
  if (!card.recognized) return null;
  const renderer = registry[card.kind];
  return (renderer as InteractiveCardRenderer<TNode, KnownInteractiveCardKind> | undefined) ?? null;
}

export interface InteractiveCardClientCapability {
  supported: InteractiveCardKindWire[];
  canRespond: boolean;
}

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

export interface PersistedInteractiveCards {
  schemaVersion: number;
  cards: InteractiveCard[];
}

export type InteractiveCardCapability =
  | 'canRenderInteractiveCards'
  | 'canAnswerInteractiveCards'
  | 'canRenderMapCards';
