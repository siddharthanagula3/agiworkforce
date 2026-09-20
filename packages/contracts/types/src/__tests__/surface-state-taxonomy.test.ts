import { describe, expect, it } from 'vitest';

import { ERROR_CLASSES, ERROR_CLASS_RULES } from '../error-taxonomy';
import { DenialErrorCode, DomainErrorCode, ErrorCode } from '../errors';
import {
  COMPLETION_SPELLINGS_RESERVED_AS_ALIASES,
  SURFACE_REMEDIES,
  SURFACE_STATES,
  SURFACE_STATE_ALIASES,
  SURFACE_STATE_RULES,
  isPermanentFailureSurfaceState,
  isSurfaceState,
  surfaceStateForErrorCode,
  surfaceStateForRead,
  surfaceStateMeansNoData,
  surfaceStateRemedy,
  toSurfaceState,
  type SurfaceState,
} from '../lifecycle-status';
import { TOOL_STATUSES, TOOL_STATUS_PRESENTATION } from '../tool-status';

describe('the states a surface can be in', () => {
  it('rules every state, once', () => {
    expect(new Set(SURFACE_STATES).size).toBe(SURFACE_STATES.length);
    for (const state of SURFACE_STATES) {
      const rule = SURFACE_STATE_RULES[state];
      expect(typeof rule.permanentFailure).toBe('boolean');
      expect(typeof rule.meansNoData).toBe('boolean');
      expect(rule.remedy === null || SURFACE_REMEDIES.includes(rule.remedy)).toBe(true);
    }
  });

  it('reads the spellings surfaces reached for first without admitting them', () => {
    for (const [alias, canonical] of Object.entries(SURFACE_STATE_ALIASES)) {
      expect(isSurfaceState(alias)).toBe(false);
      expect(toSurfaceState(alias)).toBe(canonical);
    }
    expect(toSurfaceState('loaded')).toBe('success');
    expect(toSurfaceState('invented')).toBeNull();
  });

  it('lets exactly one state mean the read returned nothing', () => {
    const empties = SURFACE_STATES.filter((state) => surfaceStateMeansNoData(state));
    expect(empties).toEqual(['empty']);
  });

  it('never renders a failed read as an empty one', () => {
    for (const code of [
      ErrorCode.INTERNAL_ERROR,
      ErrorCode.TIMEOUT,
      DenialErrorCode.PROVIDER_UNAVAILABLE,
      DomainErrorCode.SEARCH_ERROR,
    ]) {
      const state = surfaceStateForRead({ failedWith: code, rowCount: 0 });
      expect(surfaceStateMeansNoData(state)).toBe(false);
      expect(state).not.toBe('empty');
    }
    expect(surfaceStateForRead({ rowCount: 0 })).toBe('empty');
  });

  it('never renders a lost connection as a permanent failure', () => {
    expect(isPermanentFailureSurfaceState('offline')).toBe(false);
    expect(surfaceStateForRead({ disconnected: true })).toBe('offline');
    expect(SURFACE_STATE_RULES.offline.retryable).toBe(true);
  });

  it('answers a refusal with the layer that decided, not with a generic failure', () => {
    expect(surfaceStateForErrorCode(ErrorCode.FORBIDDEN)).toBe('permission_denied');
    expect(surfaceStateForErrorCode(ErrorCode.PAYMENT_REQUIRED)).toBe('entitlement_blocked');
    expect(surfaceStateForErrorCode(DomainErrorCode.SAFETY_BLOCKED)).toBe('policy_blocked');
    expect(surfaceStateForErrorCode(ErrorCode.RATE_LIMIT_EXCEEDED)).toBe('rate_limited');
    expect(surfaceStateForErrorCode(DomainErrorCode.RESOURCE_DELETED)).toBe('deleted');
  });

  it('owes the reader a sentence wherever a control is dead', () => {
    for (const state of SURFACE_STATES) {
      if (!SURFACE_STATE_RULES[state].permanentFailure) continue;
      expect(SURFACE_STATE_RULES[state].needsExplanation).toBe(true);
      expect(surfaceStateRemedy(state)).not.toBeNull();
    }
  });

  it('marks what is on screen as older than the server where that matters', () => {
    const stale = SURFACE_STATES.filter((state) => SURFACE_STATE_RULES[state].meansStaleData);
    expect(stale).toEqual(expect.arrayContaining<SurfaceState>(['refreshing', 'stale', 'offline']));
    expect(SURFACE_STATE_RULES.success.meansStaleData).toBe(false);
    expect(surfaceStateForRead({ hadData: true, pending: true })).toBe('refreshing');
    expect(surfaceStateForRead({ hadData: true, rowCount: 3, ageExceedsFreshness: true })).toBe(
      'stale',
    );
  });

  it('tells a short answer apart from a whole one', () => {
    expect(surfaceStateForRead({ rowCount: 3, truncated: true })).toBe('partial');
    expect(surfaceStateForRead({ rowCount: 3 })).toBe('success');
  });

  it('shows an attempt in flight as retrying rather than as a failure', () => {
    expect(surfaceStateForRead({ failedWith: ErrorCode.TIMEOUT, retryScheduled: true })).toBe(
      'retrying',
    );
    expect(SURFACE_STATE_RULES.retrying.permanentFailure).toBe(false);
  });

  it('gives every error class a state that is not the catch-all', () => {
    const blocked = ERROR_CLASSES.filter((errorClass) =>
      ['authentication', 'authorization', 'policy', 'entitlement', 'unsupported'].includes(
        errorClass,
      ),
    );
    for (const errorClass of blocked) {
      for (const code of ERROR_CLASS_RULES[errorClass].codes) {
        expect(SURFACE_STATES).toContain(surfaceStateForErrorCode(code));
      }
    }
  });
});

describe('a tool that failed', () => {
  it('never wears a word that means it finished well', () => {
    const completion = new Set<string>(
      COMPLETION_SPELLINGS_RESERVED_AS_ALIASES.map((word) => word.toLowerCase()),
    );
    for (const status of TOOL_STATUSES) {
      const presentation = TOOL_STATUS_PRESENTATION[status];
      if (presentation.tone === 'success') continue;
      expect(completion.has(presentation.label.toLowerCase())).toBe(false);
    }
    expect(TOOL_STATUS_PRESENTATION.failed.tone).toBe('error');
    expect(TOOL_STATUS_PRESENTATION.partial.label).not.toBe(
      TOOL_STATUS_PRESENTATION.succeeded.label,
    );
  });
});
