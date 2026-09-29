import { z } from 'zod';

export const WEB_SEARCH_ALLOWANCE_PATH = '/api/web-search/allowance';

const CountSchema = z.number().finite().nonnegative();
const WindowSchema = z.number().finite().positive();

export const WebSearchAllowanceSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.enum(['available', 'exhausted']),
    used: CountSchema,
    limit: CountSchema,
    windowDays: WindowSchema,
  }),
  z.object({ status: z.literal('unknown'), limit: CountSchema, windowDays: WindowSchema }),
  z.object({ status: z.literal('paid') }),
]);
export type WebSearchAllowance = z.infer<typeof WebSearchAllowanceSchema>;
