/**
 * `.agi-guardian.yml` repository configuration.
 *
 * Invalid or missing configuration must fail closed to the safest behavior:
 * shadow mode, no blocking, conservative comment budgets. Parse errors are
 * surfaced to the caller so they can be published as a config finding rather
 * than silently ignored.
 */
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const GUARDIAN_CONFIG_FILENAME = '.agi-guardian.yml';

export const GuardianModeSchema = z.enum(['shadow', 'advisory', 'blocking']);
export type GuardianMode = z.infer<typeof GuardianModeSchema>;

const TriggersSchema = z
  .object({
    push: z
      .object({
        enabled: z.boolean().default(true),
        branches: z.array(z.string().min(1)).default(['**']),
      })
      .default({ enabled: true, branches: ['**'] }),
    pull_request: z
      .object({
        enabled: z.boolean().default(true),
        actions: z
          .array(z.enum(['opened', 'reopened', 'synchronize', 'ready_for_review']))
          .default(['opened', 'reopened', 'synchronize', 'ready_for_review']),
      })
      .prefault({}),
    schedule: z
      .object({
        nightly: z.boolean().default(true),
        weekly_full_audit: z.boolean().default(true),
      })
      .prefault({}),
  })
  .prefault({});

const ReviewSchema = z
  .object({
    max_inline_comments: z.number().int().min(0).max(50).default(10),
    minimum_inline_confidence: z.number().min(0).max(1).default(0.88),
    minimum_summary_confidence: z.number().min(0).max(1).default(0.72),
    review_drafts: z.boolean().default(false),
    include_preexisting_context: z.boolean().default(true),
    cancel_stale_runs: z.boolean().default(true),
  })
  .prefault({});

const BlockingSchema = z
  .object({
    new_critical: z.boolean().default(true),
    new_high_security: z.boolean().default(true),
    deterministic_scanner_failure: z.boolean().default(true),
    existing_debt: z.boolean().default(false),
    technical_debt: z.boolean().default(false),
    ai_slop: z.boolean().default(false),
  })
  .prefault({});

const BaselineSchema = z
  .object({
    strategy: z.enum(['accepted-main', 'none']).default('accepted-main'),
    fail_on_expired_suppressions: z.boolean().default(true),
  })
  .prefault({});

const IgnoreSchema = z
  .object({
    paths: z
      .array(z.string().min(1))
      .default([
        '**/generated/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/vendor/**',
        '**/*.lock',
      ]),
  })
  .prefault({});

const ModelsSchema = z
  .object({
    routine_profile: z.string().default('economical'),
    deep_profile: z.string().default('frontier'),
    provider_policy: z.string().default('router'),
    max_cost_per_push_usd: z.number().nonnegative().nullable().default(null),
    max_cost_per_pr_usd: z.number().nonnegative().nullable().default(null),
    max_cost_per_full_audit_usd: z.number().nonnegative().nullable().default(null),
  })
  .prefault({});

const PrivacySchema = z
  .object({
    source_retention: z.enum(['none', 'encrypted']).default('none'),
    finding_retention_days: z.number().int().positive().nullable().default(null),
    allow_external_models: z.boolean().default(true),
    redact_secrets_before_model: z.boolean().default(true),
  })
  .prefault({});

export const GuardianConfigSchema = z.object({
  version: z.literal(1).default(1),
  mode: GuardianModeSchema.default('shadow'),
  triggers: TriggersSchema,
  review: ReviewSchema,
  blocking: BlockingSchema,
  baseline: BaselineSchema,
  ignore: IgnoreSchema,
  models: ModelsSchema,
  privacy: PrivacySchema,
  commands: z.object({ enabled: z.boolean().default(true) }).prefault({}),
});
export type GuardianConfig = z.infer<typeof GuardianConfigSchema>;

/** The fail-closed default configuration (shadow mode, conservative budgets). */
export function defaultGuardianConfig(): GuardianConfig {
  return GuardianConfigSchema.parse({});
}

export interface ParsedGuardianConfig {
  config: GuardianConfig;
  /** Non-empty when the repo config was invalid and defaults were applied. */
  errors: string[];
  source: 'repo' | 'default';
}

/**
 * Parse repository YAML into a validated config. Any failure — YAML syntax,
 * schema violation, non-object root — returns the fail-closed default config
 * together with the reasons, never a partially-trusted config.
 */
export function parseGuardianConfig(yamlText: string | null | undefined): ParsedGuardianConfig {
  if (yamlText == null || yamlText.trim() === '') {
    return { config: defaultGuardianConfig(), errors: [], source: 'default' };
  }
  let raw: unknown;
  try {
    raw = parseYaml(yamlText, { uniqueKeys: true });
  } catch (error) {
    return {
      config: defaultGuardianConfig(),
      errors: [`invalid YAML: ${error instanceof Error ? error.message : String(error)}`],
      source: 'default',
    };
  }
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      config: defaultGuardianConfig(),
      errors: ['config root must be a mapping'],
      source: 'default',
    };
  }
  const result = GuardianConfigSchema.safeParse(raw);
  if (!result.success) {
    return {
      config: defaultGuardianConfig(),
      errors: result.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`),
      source: 'default',
    };
  }
  return { config: result.data, errors: [], source: 'repo' };
}

/**
 * Minimal glob matching for ignore paths: supports `**`, `*`, and literal
 * segments. Deliberately dependency-free; not a full glob implementation.
 */
export function matchesIgnorePath(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}

function globToRegExp(pattern: string): RegExp {
  // Single-pass tokenizer: multi-pass string replacement would re-process the
  // regex text produced by earlier passes (e.g. the `*` inside `.*`).
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    if (pattern.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 3;
    } else if (pattern.startsWith('**', i)) {
      out += '.*';
      i += 2;
    } else if (pattern[i] === '*') {
      out += '[^/]*';
      i += 1;
    } else if (pattern[i] === '?') {
      out += '[^/]';
      i += 1;
    } else {
      out += (pattern[i] as string).replace(/[.+^${}()|[\]\\]/, '\\$&');
      i += 1;
    }
  }
  return new RegExp(`^${out}$`);
}
