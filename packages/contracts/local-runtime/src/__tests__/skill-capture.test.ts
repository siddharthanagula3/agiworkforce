import { describe, expect, it } from 'vitest';
import {
  SKILL_CAPTURE_CHANNELS,
  SKILL_CAPTURE_CONSENT_REVISION,
  SKILL_CAPTURE_LIMITS,
  SKILL_CAPTURE_STOP_CAUSES,
  isSkillCaptureConsent,
} from '../index';

describe('skill capture contract', () => {
  it('accepts only the current consent revision', () => {
    expect(isSkillCaptureConsent(SKILL_CAPTURE_CONSENT_REVISION)).toBe(true);
    expect(isSkillCaptureConsent(SKILL_CAPTURE_CONSENT_REVISION + 1)).toBe(false);
    expect(isSkillCaptureConsent(String(SKILL_CAPTURE_CONSENT_REVISION))).toBe(false);
    expect(isSkillCaptureConsent(undefined)).toBe(false);
  });

  it('claims only the channels this host records', () => {
    expect(SKILL_CAPTURE_CHANNELS).toEqual(['screen']);
  });

  it('bounds a recording by both time and frames', () => {
    expect(
      SKILL_CAPTURE_LIMITS.maxFrames * SKILL_CAPTURE_LIMITS.frameIntervalMs,
    ).toBeLessThanOrEqual(SKILL_CAPTURE_LIMITS.maxDurationMs);
  });

  it('drops a stopped recording that is neither saved nor discarded after a bounded time', () => {
    expect(SKILL_CAPTURE_LIMITS.stoppedRetentionMs).toBeGreaterThan(0);
    expect(SKILL_CAPTURE_LIMITS.stoppedRetentionMs).toBeLessThanOrEqual(60 * 60_000);
  });

  it('names a lost display as its own stop cause', () => {
    expect(SKILL_CAPTURE_STOP_CAUSES).toContain('display-lost');
  });
});
