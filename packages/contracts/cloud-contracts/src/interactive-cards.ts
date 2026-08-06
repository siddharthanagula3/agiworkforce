/**
 * Runtime validation for interactive cards.
 *
 * Mirrors the stated contract of the repo's other delta parsers exactly: parsers
 * NEVER throw; a single-object delta returns null on mismatch; list payloads
 * salvage per item.
 *
 * The types live in `@agiworkforce/types`, which is platform-neutral and has no
 * zod. This module is the untrusted boundary, and it runs on every surface that
 * can take a dependency on zod.
 */

import { z } from 'zod';
import {
  CLARIFY_HEADER_MAX_LENGTH,
  CLARIFY_MAX_OPTIONS,
  CLARIFY_MAX_QUESTIONS,
  CLARIFY_MIN_OPTIONS,
  CLARIFY_OTHER_MAX_LENGTH,
  INTERACTIVE_CARDS_MAX_PER_MESSAGE,
  INTERACTIVE_CARDS_METADATA_KEY,
  INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH,
  INTERACTIVE_CARD_SCHEMA_VERSION,
  ITINERARY_MAX_STOPS,
  ITINERARY_NOTE_MAX_LENGTH,
  isKnownInteractiveCardKind,
  type InteractiveCard,
} from '@agiworkforce/types';

/**
 * https only.
 *
 * Zod's `.url()` is `new URL()`-based and ACCEPTS `javascript:` and `data:` —
 * verified against the pinned zod 4.4.3, not assumed. The React surfaces have a
 * `safeHref` guard, but Chrome's DOMPurify config and VS Code's markdown-it path
 * are separate sanitizers with separate gaps. Close it once, at the contract
 * boundary, so no surface has to remember.
 */
const HttpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://'), { message: 'https only' });

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
 * NOTE what is deliberately NOT pinned here: `schemaVersion` is an open int,
 * `kind` is an open string, and `body` is `unknown`. That is the entire
 * old-client story — an envelope for a card family or a schema version this
 * build has never heard of still PARSES and still carries its `fallback`.
 *
 * Pinning `schemaVersion: z.literal(1)` is the single change that would blank
 * cards in the field on the next major bump, because it would discard the card
 * INCLUDING the fallback that exists to cover exactly that case. Do not make it.
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

// ---------------------------------------------------------------------------
// clarify.v1
// ---------------------------------------------------------------------------

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
     * Parsed for parity with the existing Rust struct, but the SERVER REJECTS a
     * card containing a true value at the tool boundary. No renderer may mask an
     * input — a clarifying-question card must never be able to look like a
     * credential prompt inside chrome the user trusts.
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
                    text: z.string().max(CLARIFY_OTHER_MAX_LENGTH),
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
   * Every answer must name a question that exists, and every selected option
   * must exist on that question. Without this a resumed turn could re-render an
   * option the user never saw.
   */
  .superRefine((body, ctx) => {
    if (body.state.status !== 'answered') return;
    const byId = new Map(body.questions.map((question) => [question.id, question]));
    for (const answer of body.state.answers) {
      const question = byId.get(answer.questionId);
      if (!question) {
        ctx.addIssue({
          code: 'custom',
          path: ['state', 'answers'],
          message: `answer for unknown question ${answer.questionId}`,
        });
        continue;
      }
      if (answer.kind === 'other' && !question.isOther) {
        ctx.addIssue({
          code: 'custom',
          path: ['state', 'answers'],
          message: `free text on non-other question ${question.id}`,
        });
      }
      if (answer.kind === 'options') {
        if (!question.multiSelect && answer.optionIds.length > 1) {
          ctx.addIssue({
            code: 'custom',
            path: ['state', 'answers'],
            message: `multiple answers to single-select ${question.id}`,
          });
        }
        const known = new Set(question.options.map((option) => option.id));
        for (const selected of answer.optionIds) {
          if (!known.has(selected)) {
            ctx.addIssue({
              code: 'custom',
              path: ['state', 'answers'],
              message: `unknown option ${selected} on ${question.id}`,
            });
          }
        }
      }
    }
  });

// ---------------------------------------------------------------------------
// itinerary.v1
// ---------------------------------------------------------------------------

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
    places: z.array(PlaceIdentitySchema).min(1).max(ITINERARY_MAX_STOPS),
    stops: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            pin: z.number().int().positive().max(ITINERARY_MAX_STOPS),
            placeIndex: z.number().int().gte(0).lt(ITINERARY_MAX_STOPS),
            startTimeLabel: z.string().max(24),
            note: z.string().max(ITINERARY_NOTE_MAX_LENGTH),
            thumbnail: MediaRefSchema.optional(),
            sources: z.array(SourceSchema).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(ITINERARY_MAX_STOPS),
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
          unresolvedStopCount: z.number().int().gte(0).max(ITINERARY_MAX_STOPS),
        })
        .strict(),
    ]),
    overview: MediaRefSchema.optional(),
  })
  .strict()
  /**
   * THE INVARIANTS THAT WOULD HAVE PREVENTED THE WRONG-CITY LINK. Enforced at
   * the untrusted boundary, on every surface, independently of any UI code. The
   * type makes the wrong RENDER impossible; this makes the wrong PAYLOAD
   * impossible, so a producer bug fails validation instead of shipping.
   */
  .superRefine((body, ctx) => {
    for (const stop of body.stops) {
      if (stop.placeIndex >= body.places.length) {
        ctx.addIssue({ code: 'custom', path: ['stops'], message: 'placeIndex out of range' });
      }
    }
    const unresolved = body.places.filter((place) => place.status === 'unresolved').length;
    if (body.route.status === 'available' && unresolved > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['route'],
        message: `route marked available with ${unresolved} unresolved place(s)`,
      });
    }
    if (
      body.route.status === 'unavailable' &&
      body.route.reason === 'unresolved_stops' &&
      body.route.unresolvedStopCount !== unresolved
    ) {
      ctx.addIssue({ code: 'custom', path: ['route'], message: 'unresolved count mismatch' });
    }
  });

// ---------------------------------------------------------------------------
// The single dispatch point every surface calls
// ---------------------------------------------------------------------------

/**
 * NEVER THROWS.
 *
 * A card that fails body validation is NOT dropped — it degrades to
 * `recognized: false`, keeping its envelope and its fallback. A validation bug
 * costs the user the widget, never the answer.
 *
 * Returns null only when the payload is not an envelope at all. Callers MUST
 * still render `fallback` for any card whose `interaction.awaitingResponse` is
 * true — a suspending card that renders nothing is a silently truncated turn.
 */
export function parseInteractiveCardDelta(payload: unknown): InteractiveCard | null {
  const envelope = InteractiveCardEnvelopeSchema.safeParse(
    (payload as { card?: unknown } | null | undefined)?.card,
  );
  if (!envelope.success) return null;
  if (JSON.stringify(envelope.data).length > INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH) return null;

  const { kind, body: rawBody, ...common } = envelope.data;

  // A newer MAJOR schema degrades to fallback, it does not vanish.
  if (envelope.data.schemaVersion > INTERACTIVE_CARD_SCHEMA_VERSION) {
    return { ...common, recognized: false, kind };
  }
  if (!isKnownInteractiveCardKind(kind)) return { ...common, recognized: false, kind };

  const parsed =
    kind === 'clarify.v1'
      ? ClarifyCardBodySchema.safeParse(rawBody)
      : ItineraryCardBodySchema.safeParse(rawBody);
  if (!parsed.success) return { ...common, recognized: false, kind };

  return { ...common, recognized: true, kind, body: parsed.data } as InteractiveCard;
}

/**
 * Read the durable projection. Salvages per card, so one bad card never blanks
 * the list — the same contract the persisted tool-approval reader has.
 */
export function readPersistedInteractiveCards(metadata: unknown): InteractiveCard[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const raw = (metadata as Record<string, unknown>)[INTERACTIVE_CARDS_METADATA_KEY];
  if (!Array.isArray(raw)) return [];
  const cards: InteractiveCard[] = [];
  for (const entry of raw.slice(0, INTERACTIVE_CARDS_MAX_PER_MESSAGE)) {
    const card = parseInteractiveCardDelta({ card: entry });
    if (card) cards.push(card);
  }
  return cards;
}
