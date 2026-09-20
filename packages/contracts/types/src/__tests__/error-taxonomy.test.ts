import { describe, expect, it } from 'vitest';

import {
  DenialErrorCode,
  DomainErrorCode,
  ErrorCode,
  errorCodeHttpStatus,
  type ClassifiedErrorCode,
} from '../errors';
import {
  ERROR_CLASSES,
  ERROR_CLASS_RULES,
  PROVIDER_DETAIL_DISCLOSURES,
  classifyErrorCode,
  describeError,
  discloseProviderDetail,
  errorClassMessageKey,
  friendlyErrorIcon,
  isClassifiedErrorCode,
  isRetryableErrorCode,
} from '../error-taxonomy';
import { SURFACE_REMEDIES } from '../lifecycle-status';

const ALL_CODES: readonly ClassifiedErrorCode[] = [
  ...(Object.values(ErrorCode) as ClassifiedErrorCode[]),
  ...(Object.values(DenialErrorCode) as ClassifiedErrorCode[]),
  ...(Object.values(DomainErrorCode) as ClassifiedErrorCode[]),
];

describe('error classes', () => {
  it('rules every class the vocabulary declares', () => {
    for (const errorClass of ERROR_CLASSES) {
      const rule = ERROR_CLASS_RULES[errorClass];
      expect(rule.why.length).toBeGreaterThan(0);
      expect(typeof rule.retryable).toBe('boolean');
      expect(PROVIDER_DETAIL_DISCLOSURES).toContain(rule.providerDetail);
      expect(SURFACE_REMEDIES).toContain(rule.suggestedAction);
      expect(rule.codes.length).toBeGreaterThan(0);
    }
  });

  it('classifies every code exactly once', () => {
    const owners = new Map<string, string>();
    for (const errorClass of ERROR_CLASSES) {
      for (const code of ERROR_CLASS_RULES[errorClass].codes) {
        expect(owners.has(code)).toBe(false);
        owners.set(code, errorClass);
      }
    }
    for (const code of ALL_CODES) {
      expect(isClassifiedErrorCode(code)).toBe(true);
      expect(owners.get(code)).toBe(classifyErrorCode(code));
    }
    expect(owners.size).toBe(ALL_CODES.length);
  });

  it('keeps the four refusal layers apart', () => {
    expect(classifyErrorCode(ErrorCode.UNAUTHORIZED)).toBe('authentication');
    expect(classifyErrorCode(ErrorCode.FORBIDDEN)).toBe('authorization');
    expect(classifyErrorCode(DenialErrorCode.POLICY_BLOCKED)).toBe('policy');
    expect(classifyErrorCode(DenialErrorCode.ENTITLEMENT_REQUIRED)).toBe('entitlement');
  });

  it('never answers a missing permission with a generic server failure', () => {
    for (const code of [
      ErrorCode.FORBIDDEN,
      DenialErrorCode.PERMISSION_REQUIRED,
      DenialErrorCode.DISABLED_BY_ROLE,
    ] as ClassifiedErrorCode[]) {
      expect(classifyErrorCode(code)).not.toBe('internal');
      expect(describeError({ code, requestId: 'req_1' }).suggestedAction).toBe('request_access');
    }
  });

  it('tells a refusal apart from an outage in what it suggests', () => {
    const refusals = ERROR_CLASSES.filter((errorClass) =>
      ['authentication', 'authorization', 'policy', 'entitlement', 'safety'].includes(errorClass),
    );
    for (const errorClass of refusals) {
      expect(ERROR_CLASS_RULES[errorClass].retryable).toBe(false);
      expect(ERROR_CLASS_RULES[errorClass].suggestedAction).not.toBe('retry');
    }
  });

  it('separates a spent allowance from a request sent too quickly', () => {
    expect(isRetryableErrorCode(ErrorCode.RATE_LIMIT_EXCEEDED)).toBe(true);
    expect(isRetryableErrorCode(DenialErrorCode.QUOTA_EXCEEDED)).toBe(false);
  });
});

describe('describeError', () => {
  it('carries the support reference, the class and the server-derived retry flag', () => {
    for (const code of ALL_CODES) {
      const described = describeError({ code, requestId: 'req_abc' });
      expect(described.requestId).toBe('req_abc');
      expect(described.errorClass).toBe(classifyErrorCode(code));
      expect(described.retryable).toBe(ERROR_CLASS_RULES[described.errorClass].retryable);
      expect(described.httpStatus).toBe(errorCodeHttpStatus(code));
      expect(described.messageKey).toBe(errorClassMessageKey(described.errorClass));
      expect(described.message.length).toBeGreaterThan(0);
      expect(SURFACE_REMEDIES).toContain(described.suggestedAction);
    }
  });

  it('prefers the reader locale over the English fallback for every class', () => {
    for (const errorClass of ERROR_CLASSES) {
      const code = ERROR_CLASS_RULES[errorClass].codes[0] as ClassifiedErrorCode;
      const localized = describeError({
        code,
        requestId: 'req_1',
        lookup: (key) => (key === errorClassMessageKey(errorClass) ? 'traduit' : undefined),
      });
      expect(localized.message).toBe('traduit');
      expect(describeError({ code, requestId: 'req_1' }).message).toBe(
        ERROR_CLASS_RULES[errorClass].why,
      );
    }
  });

  it('hides an upstream unless the class says its name is useful', () => {
    const provider = { provider: 'acme', status: 'degraded' };
    const shown = describeError({
      code: DenialErrorCode.PROVIDER_UNAVAILABLE,
      requestId: 'req_1',
      provider,
    });
    expect(shown.providerDetail).toBe('acme: degraded');

    for (const errorClass of ERROR_CLASSES) {
      const detail = discloseProviderDetail(errorClass, provider);
      if (ERROR_CLASS_RULES[errorClass].providerDetail === 'hidden') {
        expect(detail).toBeNull();
      } else {
        expect(detail).toBe('acme: degraded');
      }
    }
  });

  it('never lets an upstream response body through', () => {
    const detail = discloseProviderDetail('provider_unavailable', {
      provider: 'acme',
      status: 'degraded',
    });
    expect(detail).not.toContain('sk-');
    expect(
      describeError({ code: ErrorCode.INTERNAL_ERROR, requestId: 'r' }).providerDetail,
    ).toBeNull();
  });

  it('gives every class an icon a surface can render', () => {
    for (const errorClass of ERROR_CLASSES) {
      expect(friendlyErrorIcon(errorClass).length).toBeGreaterThan(0);
    }
  });
});
