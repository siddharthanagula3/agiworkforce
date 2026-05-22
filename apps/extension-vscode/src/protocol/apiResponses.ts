/**
 * apiResponses.ts — Zod schemas for upstream API responses.
 *
 * Validates server responses before they influence client state. Audit
 * finding F-23: tier info from /api/auth/me silently updates global
 * settings; without schema validation a malformed response could
 * downgrade tier or stick the client in an unknown state.
 */

import { z } from 'zod';

// /api/auth/me tier info ----------------------------------------------

export const TierInfoSchema = z
  .object({
    tier: z.string().min(1).max(64),
    tokens_used: z.number().int().nonnegative().optional(),
    token_cap: z.number().int().nonnegative().optional(),
    resets_at: z.string().min(1).optional(),
    quota_resets_at: z.string().min(1).optional(),
    // Reserved for future signed tier responses. This schema only preserves the
    // field; verification must happen in the API client before it is trusted.
    signature: z.string().min(1).optional(),
  })
  .passthrough(); // tolerate unknown fields for forward-compat

export type TierInfoResponse = z.infer<typeof TierInfoSchema>;

// /chat/completions paywall payload -----------------------------------

export const PaywallPayloadSchema = z.object({
  kind: z.literal('paywall'),
  feature: z.string().min(1).max(200),
  requiredTier: z.string().min(1).max(64),
  reason: z.string().min(1).max(500),
});

export type PaywallPayload = z.infer<typeof PaywallPayloadSchema>;

// /chat/completions streaming chunk -----------------------------------
//
// Lenient because providers stream a variety of shapes; the consumer
// only reads choices[0].delta.content. We validate the outer envelope
// loosely and let the consumer drill down with optional-chaining.

export const ChatCompletionChunkSchema = z
  .object({
    id: z.string().optional(),
    object: z.string().optional(),
    created: z.number().optional(),
    model: z.string().optional(),
    choices: z
      .array(
        z
          .object({
            index: z.number().int().optional(),
            delta: z
              .object({
                role: z.string().optional(),
                content: z.string().optional(),
              })
              .passthrough()
              .optional(),
            finish_reason: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>;
