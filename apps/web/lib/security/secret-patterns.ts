/**
 * Every quantifier here is bounded, and the bounds are load bearing rather than
 * cosmetic. A pattern with two unbounded runs either side of a required literal
 * backtracks quadratically: `eyJ` repeated with no `.` made the JWT pattern scan
 * to end of input from every third character. The first run's bound is what
 * decides the cost, because that is the work repeated at each failed start, so
 * it is sized to the value the segment actually holds, not to the longest one
 * imaginable. `lib/security/__tests__/secret-patterns.redos.test.ts` measures it.
 */
import {
  SECRET_DETECTION_RULES,
  SECRET_PATTERN_RULES,
  type SecretPatternRule,
} from '@agiworkforce/utils/secret-redaction';

export type SecretSeverity = 'critical' | 'high' | 'medium';

export type SecretConfidence = 'high' | 'low';

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: SecretSeverity;
  assertable: boolean;
  confidence: SecretConfidence;
}

/** The detection rules of the one registry in @agiworkforce/utils, in scan order. */
export const SECRET_PATTERN_REGISTRY: readonly SecretPattern[] = Object.freeze(
  SECRET_DETECTION_RULES.map((id) => {
    const rule: SecretPatternRule = SECRET_PATTERN_RULES[id];
    return {
      name: rule.label,
      pattern: rule.pattern,
      severity: rule.severity as SecretSeverity,
      assertable: rule.assertable ?? false,
      confidence: rule.confidence ?? 'low',
    };
  }),
);

export const ASSERTABLE_SECRET_PATTERNS: readonly RegExp[] = Object.freeze(
  SECRET_PATTERN_REGISTRY.filter((entry) => entry.assertable).map((entry) => entry.pattern),
);

export const HIGH_CONFIDENCE_SECRET_NAMES: ReadonlySet<string> = Object.freeze(
  new Set(
    SECRET_PATTERN_REGISTRY.filter((entry) => entry.confidence === 'high').map(
      (entry) => entry.name,
    ),
  ),
);

export function isHighConfidenceSecretName(name: string): boolean {
  return HIGH_CONFIDENCE_SECRET_NAMES.has(name);
}

export function globalize(pattern: RegExp): RegExp {
  return new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
}
