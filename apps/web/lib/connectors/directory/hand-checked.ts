import { z } from 'zod';

import handCheckedSource from '@/lib/connectors/directory/sources/hand-checked.json';

const CHECKED_ON_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const HandCheckSchema = z
  .object({
    id: z.string().min(1),
    checkedOn: z
      .string()
      .regex(CHECKED_ON_PATTERN)
      .refine((value) => !Number.isNaN(Date.parse(value))),
    checkedBy: z.string().min(1),
    moneyMoving: z.boolean(),
    note: z.string().min(1),
  })
  .strict();

export type HandCheck = z.infer<typeof HandCheckSchema>;

const HandCheckListSchema = z.array(HandCheckSchema).superRefine((checks, context) => {
  const seen = new Set<string>();
  checks.forEach((check, index) => {
    if (seen.has(check.id)) {
      context.addIssue({
        code: 'custom',
        path: [index, 'id'],
        message: `Duplicate hand check for ${check.id}`,
      });
    }
    seen.add(check.id);
  });
});

export function parseHandChecks(raw: unknown): ReadonlyMap<string, HandCheck> {
  return new Map(HandCheckListSchema.parse(raw).map((check) => [check.id, check]));
}

export const HAND_CHECKS: ReadonlyMap<string, HandCheck> = parseHandChecks(handCheckedSource);
