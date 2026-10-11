import { z } from 'zod';

export const FREE_MODEL_PROMOTION_PATH = '/api/models/free-promotion';

export const FreeModelPromotionOfferSchema = z.strictObject({
  modelId: z.string().min(1),
  endsAt: z.string().datetime({ offset: true }),
  /** The account still has provider web searches left on the promotion in its rolling window. */
  webSearchAvailable: z.boolean(),
  /** The rolling window that allowance resets within. */
  webSearchWindowHours: z.number().positive(),
});
export type FreeModelPromotionOffer = z.infer<typeof FreeModelPromotionOfferSchema>;

export const FreeModelPromotionResponseSchema = z.strictObject({
  promotion: FreeModelPromotionOfferSchema.nullable(),
});
export type FreeModelPromotionResponse = z.infer<typeof FreeModelPromotionResponseSchema>;
