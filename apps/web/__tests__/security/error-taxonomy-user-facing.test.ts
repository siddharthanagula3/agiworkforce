import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_DENIAL_REASONS,
  CAPABILITY_DENIAL_TAXONOMY,
  DENIAL_ERROR_CODE_TO_HTTP_STATUS,
  ERROR_CODE_TO_HTTP_STATUS,
  ErrorCode,
  PROVIDERS_IN_ORDER,
  errorCodeHttpStatus,
  type AnyErrorCodeValue,
  type ErrorCodeValue,
} from '@agiworkforce/types';
import { AppError, getFriendlyError } from '@agiworkforce/utils';
import { classifyRetryError } from '@agiworkforce/utils/retry-policy';

const ALL_CODES: readonly AnyErrorCodeValue[] = [
  ...(Object.keys(ERROR_CODE_TO_HTTP_STATUS) as ErrorCodeValue[]),
  ...(Object.keys(DENIAL_ERROR_CODE_TO_HTTP_STATUS) as AnyErrorCodeValue[]),
];

function copyForCode(code: AnyErrorCodeValue): string[] {
  const reason = CAPABILITY_DENIAL_REASONS.find(
    (candidate) => CAPABILITY_DENIAL_TAXONOMY[candidate].errorCode === code,
  );
  if (reason) {
    const descriptor = CAPABILITY_DENIAL_TAXONOMY[reason];
    return [descriptor.title, descriptor.message, descriptor.suggestion];
  }
  const friendly = getFriendlyError(
    new AppError(code as ErrorCodeValue, 'unused', errorCodeHttpStatus(code)),
  );
  return [friendly.title, friendly.message, friendly.suggestion ?? ''];
}

/** Every spelling of a provider id a reader could recognise it by. */
const PROVIDER_WORDS = [
  ...new Set(
    PROVIDERS_IN_ORDER.flatMap((provider) => [
      provider,
      provider.replace(/[_-]/g, ''),
      provider.replace(/[_-]/g, ' '),
    ]).filter((spelling) => spelling.length > 4),
  ),
];

const INFRASTRUCTURE_WORDS = [
  'neon',
  'clerk',
  'vercel',
  'upstash',
  'postgres',
  'redis',
  'stripe',
  'cloudflare',
  's3',
  'blob store',
];

const INTERNAL_SHAPES: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'a stack frame', pattern: /\bat\s+[\w$.]+\s+\(/ },
  {
    label: 'a source path',
    pattern: /(?:^|\s)(?:\/(?:var|usr|home|app)\/|[a-z-]+\/[a-z-]+\.tsx?)/,
  },
  { label: 'a SQL fragment', pattern: /\b(?:select|insert into|update\s+\w+\s+set|relation)\b\s/i },
  { label: 'an internal header', pattern: /\bx-[a-z0-9-]+\b/i },
  { label: 'an environment variable', pattern: /\b[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}\b/ },
  { label: 'a bare hostname', pattern: /\b[a-z0-9-]+\.(?:com|dev|io|net|app|tech|ai)\b/i },
  { label: 'an http status', pattern: /\b[45]\d{2}\b/ },
];

/**
 * A refusal that depends on who is asking must read the same whether or not
 * the account exists; anything that varies is an oracle.
 */
const ENUMERATION_TELLS = [
  'no account',
  'no such',
  'not registered',
  'never signed up',
  'unknown email',
  'unknown user',
  'account does not exist',
  "doesn't exist",
  'does not exist',
  'incorrect password',
  'wrong password',
  'invalid password',
  'email not found',
  'user not found',
];

const AUTHENTICATION_CODES: readonly AnyErrorCodeValue[] = [
  ErrorCode.UNAUTHORIZED,
  ErrorCode.FORBIDDEN,
  ErrorCode.MFA_REQUIRED,
  ErrorCode.IP_NOT_ALLOWED,
];

describe('every refusal a user can meet', () => {
  it('covers both registries, so a new family cannot slip past this file', () => {
    expect(ALL_CODES.length).toBe(
      Object.keys(ERROR_CODE_TO_HTTP_STATUS).length +
        Object.keys(DENIAL_ERROR_CODE_TO_HTTP_STATUS).length,
    );
    for (const reason of CAPABILITY_DENIAL_REASONS) {
      expect(ALL_CODES, `${reason} resolves to an error code outside both registries`).toContain(
        CAPABILITY_DENIAL_TAXONOMY[reason].errorCode,
      );
    }
  });

  it('answers "may I try this again" for every code, from the status alone', () => {
    const undecided: string[] = [];
    for (const code of ALL_CODES) {
      const status = errorCodeHttpStatus(code);
      const classification = classifyRetryError({ status });
      if (classification.disposition === 'terminal' && classification.reason === 'unclassified') {
        undecided.push(`${code} (${status})`);
      }
    }
    expect(
      undecided,
      `these codes reach the shared retry classifier with no answer, so a caller has to guess:\n  ${undecided.join('\n  ')}`,
    ).toEqual([]);
  });

  it('never invites a retry of a refusal that will refuse again', () => {
    for (const code of AUTHENTICATION_CODES) {
      const classification = classifyRetryError({ status: errorCodeHttpStatus(code) });
      expect(classification.disposition, `${code} is retryable`).toBe('terminal');
    }
    const denied = ['requires_permission', 'policy_blocked', 'entitlement_missing'] as const;
    for (const reason of denied) {
      const status = errorCodeHttpStatus(CAPABILITY_DENIAL_TAXONOMY[reason].errorCode);
      expect(classifyRetryError({ status }).disposition, `${reason} is retryable`).toBe('terminal');
    }
  });

  it('lets a caller retry the refusals that pass on their own', () => {
    for (const reason of ['quota_exceeded', 'provider_unavailable', 'offline'] as const) {
      const status = errorCodeHttpStatus(CAPABILITY_DENIAL_TAXONOMY[reason].errorCode);
      expect(classifyRetryError({ status }).disposition, `${reason} is terminal`).not.toBe(
        'terminal',
      );
    }
  });

  it('names no provider and no piece of our infrastructure in what a reader sees', () => {
    const leaks: string[] = [];
    for (const code of ALL_CODES) {
      const haystack = copyForCode(code).join(' ').toLowerCase();
      for (const word of [...PROVIDER_WORDS, ...INFRASTRUCTURE_WORDS]) {
        if (new RegExp(`\\b${word.toLowerCase()}\\b`).test(haystack)) {
          leaks.push(`${code} names ${word}`);
        }
      }
    }
    expect(
      leaks,
      `user-facing copy tells the reader which vendor or service failed, which is ours to know ` +
        `and theirs to be spared:\n  ${leaks.join('\n  ')}`,
    ).toEqual([]);
  });

  it('shows no stack, path, query, header or status to a reader', () => {
    const leaks: string[] = [];
    for (const code of ALL_CODES) {
      for (const line of copyForCode(code)) {
        for (const shape of INTERNAL_SHAPES) {
          if (shape.pattern.test(line)) leaks.push(`${code} shows ${shape.label}: ${line}`);
        }
      }
    }
    expect(leaks, leaks.join('\n  ')).toEqual([]);
  });

  it('gives an authentication refusal no way to tell one account from another', () => {
    const tells: string[] = [];
    for (const code of AUTHENTICATION_CODES) {
      const haystack = copyForCode(code).join(' ').toLowerCase();
      for (const tell of ENUMERATION_TELLS) {
        if (haystack.includes(tell)) tells.push(`${code} says "${tell}"`);
      }
    }
    expect(
      tells,
      `an unauthenticated caller could read these to learn whether an address has an account:\n  ${tells.join('\n  ')}`,
    ).toEqual([]);
  });

  it('keeps one refusal for an unauthenticated caller, whatever the reason behind it', () => {
    const unauthorized = copyForCode(ErrorCode.UNAUTHORIZED).join(' ').toLowerCase();
    expect(unauthorized).not.toMatch(/\bpassword\b/);
    expect(unauthorized).not.toMatch(/\bemail\b/);
    expect(unauthorized).not.toMatch(/\baccount\b.*\b(?:exists|found|missing)\b/);
  });

  it('ends every refusal with something the reader can do next', () => {
    const silent: string[] = [];
    for (const code of ALL_CODES) {
      const [, , suggestion] = copyForCode(code);
      if (!suggestion || suggestion.trim().length < 10) silent.push(String(code));
    }
    expect(
      silent,
      `these refusals stop at "no" and leave the reader nowhere to go:\n  ${silent.join('\n  ')}`,
    ).toEqual([]);
  });
});
