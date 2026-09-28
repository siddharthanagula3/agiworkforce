import { z } from 'zod';

export const FINANCE_OVERVIEW_PATH = '/api/finance/overview';

export const FINANCE_OVERVIEW_PERIODS = ['30d', '90d', '12m'] as const;
export type FinanceOverviewPeriod = (typeof FINANCE_OVERVIEW_PERIODS)[number];

export const FinanceOverviewQuerySchema = z.object({
  period: z.enum(FINANCE_OVERVIEW_PERIODS).default('30d'),
});

export const FinanceAccountSchema = z.object({
  accountId: z.string(),
  name: z.string(),
  mask: z.string().nullable(),
  type: z.string(),
  subtype: z.string().nullable(),
  available: z.number().nullable(),
  current: z.number().nullable(),
  limit: z.number().nullable(),
  currency: z.string().nullable(),
});
export type FinanceAccount = z.infer<typeof FinanceAccountSchema>;

export const FinanceCategoryTotalSchema = z.object({
  category: z.string(),
  amount: z.number(),
  transactions: z.number().int().nonnegative(),
});
export type FinanceCategoryTotal = z.infer<typeof FinanceCategoryTotalSchema>;

export const FinanceMonthTotalSchema = z.object({
  month: z.string(),
  spending: z.number(),
  income: z.number(),
});
export type FinanceMonthTotal = z.infer<typeof FinanceMonthTotalSchema>;

export const FinanceTransactionSchema = z.object({
  accountId: z.string(),
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  currency: z.string().nullable(),
  pending: z.boolean(),
  category: z.string().nullable(),
});
export type FinanceTransaction = z.infer<typeof FinanceTransactionSchema>;

export const FinanceOverviewResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unavailable'), message: z.string() }),
  z.object({ status: z.literal('not_connected') }),
  z.object({ status: z.literal('preparing') }),
  z.object({ status: z.literal('reconnect') }),
  z.object({
    status: z.literal('ready'),
    period: z.object({
      key: z.enum(FINANCE_OVERVIEW_PERIODS),
      start: z.string(),
      end: z.string(),
    }),
    currency: z.string().nullable(),
    accounts: z.array(FinanceAccountSchema),
    spending: z.object({
      total: z.number(),
      byCategory: z.array(FinanceCategoryTotalSchema),
      byMonth: z.array(FinanceMonthTotalSchema),
    }),
    income: z.number(),
    recent: z.array(FinanceTransactionSchema),
    truncated: z.boolean(),
  }),
]);
export type FinanceOverviewResponse = z.infer<typeof FinanceOverviewResponseSchema>;

export function parseFinanceOverviewResponse(value: unknown): FinanceOverviewResponse | null {
  const parsed = FinanceOverviewResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
