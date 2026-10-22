import { describe, expect, it } from 'vitest';
import {
  SKILL_CAPTURE_CHANNELS,
  SKILL_CAPTURE_CONSENT_REVISION,
  SKILL_CAPTURE_LIMITS,
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
});
