import { z } from 'zod';

export const FLAG_OFF_VARIANT = 'off';
export const FLAG_ON_VARIANT = 'on';

const FLAG_KEY_PATTERN = /^[a-z][a-z0-9_]*([.:-][a-z0-9_]+)*$/;
const VARIANT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const RULE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const CLIENT_VERSION_PATTERN = /^\d{1,6}(\.\d{1,6}){0,2}$/;

const MAX_TARGET_IDS = 500;
const MAX_TARGET_VALUES = 64;
const MAX_RULES = 50;
const MAX_VARIANTS = 16;
const MAX_SPLIT_WEIGHT = 10_000;
const PERCENT_MAX = 100;

export const FlagKeySchema = z.string().min(2).max(120).regex(FLAG_KEY_PATTERN);
export const FlagVariantSchema = z.string().regex(VARIANT_PATTERN);

const TargetValues = z.array(z.string().trim().min(1).max(64)).max(MAX_TARGET_VALUES);

export const FlagConditionsSchema = z
  .object({
    userIds: z.array(z.string().trim().min(1).max(200)).max(MAX_TARGET_IDS).optional(),
    workspaceIds: z.array(z.string().uuid()).max(MAX_TARGET_IDS).optional(),
    roles: TargetValues.optional(),
    plans: TargetValues.optional(),
    regions: TargetValues.optional(),
    countries: z.array(z.string().regex(COUNTRY_PATTERN)).max(250).optional(),
    surfaces: TargetValues.optional(),
    clientVersion: z
      .object({
        min: z.string().regex(CLIENT_VERSION_PATTERN).optional(),
        max: z.string().regex(CLIENT_VERSION_PATTERN).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const PercentageSchema = z.number().min(0).max(PERCENT_MAX);

export const FlagRolloutSchema = z.union([
  z.object({ percentage: PercentageSchema }).strict(),
  z
    .object({
      ramp: z
        .object({
          fromPercentage: PercentageSchema,
          toPercentage: PercentageSchema,
          startAt: z.string().datetime({ offset: true }),
          endAt: z.string().datetime({ offset: true }),
        })
        .strict()
        .refine((ramp) => Date.parse(ramp.endAt) > Date.parse(ramp.startAt), {
          message: 'A ramp must end after it starts',
        }),
    })
    .strict(),
]);

export const FlagRuleSchema = z
  .object({
    id: z.string().regex(RULE_ID_PATTERN),
    conditions: FlagConditionsSchema.default({}),
    rollout: FlagRolloutSchema.optional(),
    bucketBy: z.enum(['user', 'workspace']).default('user'),
    variant: FlagVariantSchema.optional(),
    split: z
      .array(
        z
          .object({
            variant: FlagVariantSchema,
            weight: z.number().int().min(0).max(MAX_SPLIT_WEIGHT),
          })
          .strict(),
      )
      .min(2)
      .max(MAX_VARIANTS)
      .optional(),
  })
  .strict()
  .refine((rule) => (rule.variant === undefined) !== (rule.split === undefined), {
    message: 'A rule serves either one variant or a weighted split, not both',
  })
  .refine((rule) => !rule.split || rule.split.some((arm) => arm.weight > 0), {
    message: 'A split needs at least one arm with weight',
  });

export type FlagConditions = z.infer<typeof FlagConditionsSchema>;
export type FlagRollout = z.infer<typeof FlagRolloutSchema>;
export type FlagRule = z.infer<typeof FlagRuleSchema>;

export const FlagDefinitionInputSchema = z
  .object({
    key: FlagKeySchema,
    description: z.string().trim().max(500).default(''),
    killSwitch: z.boolean().default(false),
    variants: z
      .array(FlagVariantSchema)
      .min(2)
      .max(MAX_VARIANTS)
      .default([FLAG_ON_VARIANT, FLAG_OFF_VARIANT]),
    defaultVariant: FlagVariantSchema.default(FLAG_OFF_VARIANT),
    rules: z.array(FlagRuleSchema).max(MAX_RULES).default([]),
    expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .strict()
  .superRefine((definition, context) => {
    const variants = new Set(definition.variants);
    if (variants.size !== definition.variants.length) {
      context.addIssue({ code: 'custom', path: ['variants'], message: 'Variants must be unique' });
    }
    if (!variants.has(FLAG_OFF_VARIANT)) {
      context.addIssue({
        code: 'custom',
        path: ['variants'],
        message: `Every flag declares the ${FLAG_OFF_VARIANT} variant the kill switch serves`,
      });
    }
    if (!variants.has(definition.defaultVariant)) {
      context.addIssue({
        code: 'custom',
        path: ['defaultVariant'],
        message: 'The default variant must be one of the declared variants',
      });
    }
    const ruleIds = new Set<string>();
    definition.rules.forEach((rule, index) => {
      if (ruleIds.has(rule.id)) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'id'],
          message: 'Rule ids must be unique',
        });
      }
      ruleIds.add(rule.id);
      const served = rule.split ? rule.split.map((arm) => arm.variant) : [rule.variant ?? ''];
      for (const variant of served) {
        if (!variants.has(variant)) {
          context.addIssue({
            code: 'custom',
            path: ['rules', index],
            message: `Rule ${rule.id} serves undeclared variant ${variant}`,
          });
        }
      }
    });
  });

export type FlagDefinitionInput = z.infer<typeof FlagDefinitionInputSchema>;

export interface FlagDefinition extends FlagDefinitionInput {
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FlagOverrideSubject = 'user' | 'workspace';

export interface FlagOverride {
  flagKey: string;
  subject: FlagOverrideSubject;
  subjectId: string;
  variant: string;
  expiresAt: string | null;
}

export const FlagOverrideInputSchema = z
  .object({
    subject: z.enum(['user', 'workspace']),
    subjectId: z.string().trim().min(1).max(200),
    variant: FlagVariantSchema,
    expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .strict()
  .refine(
    (input) =>
      input.subject !== 'workspace' || z.string().uuid().safeParse(input.subjectId).success,
    {
      message: 'A workspace override names the workspace id',
      path: ['subjectId'],
    },
  );

export type FlagOverrideInput = z.infer<typeof FlagOverrideInputSchema>;
