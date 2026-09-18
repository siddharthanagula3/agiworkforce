import { describe, expect, it } from 'vitest';

import { FEATURE_RATE_CARD, RATE_CARD_FEATURES } from '../rate-card';
import { idleVisualSessionStatus } from '../visual-session';
import {
  MAX_VISUAL_SESSION_MINUTES,
  VISUAL_USAGE_FEATURE,
  VISUAL_USAGE_OPERATION,
  isVisualUsageFeature,
  visualSessionMinutes,
  visualUsageCharge,
  visualUsageFromStatus,
  visualUsageLine,
  visualUsageLines,
  visualUsageTotalCustomerMicrousd,
  type VisualSessionUsage,
} from '../visual-usage';

function usage(overrides: Partial<VisualSessionUsage> = {}): VisualSessionUsage {
  return {
    source: 'camera',
    capturedMs: 90_000,
    sampledFrames: 12,
    sentFrames: 4,
    ...overrides,
  };
}

describe('visual session minutes', () => {
  it('bills per started minute the way a live voice minute does', () => {
    expect(visualSessionMinutes(0)).toBe(0);
    expect(visualSessionMinutes(1)).toBe(1);
    expect(visualSessionMinutes(60_000)).toBe(1);
    expect(visualSessionMinutes(60_001)).toBe(2);
    expect(visualSessionMinutes(90_000)).toBe(2);
  });

  it('truncates a span no session can plausibly have held', () => {
    expect(visualSessionMinutes(Number.MAX_SAFE_INTEGER)).toBe(MAX_VISUAL_SESSION_MINUTES);
    expect(visualSessionMinutes(Number.NaN)).toBe(0);
    expect(visualSessionMinutes(-5)).toBe(0);
  });
});

describe('visual usage lines', () => {
  it('names the camera and the screen as separate ledger features', () => {
    expect(VISUAL_USAGE_FEATURE.camera).toBe('visual_camera_minute');
    expect(VISUAL_USAGE_FEATURE.screen).toBe('visual_screen_share_minute');
    expect(VISUAL_USAGE_FEATURE.window).toBe(VISUAL_USAGE_FEATURE.screen);
    for (const feature of Object.values(VISUAL_USAGE_FEATURE)) {
      expect(RATE_CARD_FEATURES).toContain(feature);
      expect(FEATURE_RATE_CARD[feature].unit).toBe('minute');
      expect(isVisualUsageFeature(feature)).toBe(true);
    }
    expect(isVisualUsageFeature('voice_live_minute')).toBe(false);
  });

  it('drops a session that never captured anything', () => {
    expect(visualUsageLine(usage({ capturedMs: 0 }))).toBeNull();
    expect(visualUsageLines([usage({ capturedMs: 0 })])).toEqual([]);
  });

  it('merges a shared window onto the screen line and keeps the camera apart', () => {
    const lines = visualUsageLines([
      usage({ source: 'camera', capturedMs: 60_000, sampledFrames: 5, sentFrames: 2 }),
      usage({ source: 'screen', capturedMs: 60_000, sampledFrames: 7, sentFrames: 3 }),
      usage({ source: 'window', capturedMs: 60_000, sampledFrames: 1, sentFrames: 1 }),
    ]);
    expect(lines).toHaveLength(2);
    const screen = lines.find((line) => line.feature === VISUAL_USAGE_FEATURE.screen);
    expect(screen?.minutes).toBe(2);
    expect(screen?.sampledFrames).toBe(8);
    expect(screen?.sentFrames).toBe(4);
    const camera = lines.find((line) => line.feature === VISUAL_USAGE_FEATURE.camera);
    expect(camera?.minutes).toBe(1);
  });

  it('derives usage from a session status and never claims more sent than sampled', () => {
    const status = { ...idleVisualSessionStatus('screen'), startedAtMs: 1_000, sampledFrames: 3 };
    const derived = visualUsageFromStatus(status, 121_000, 99);
    expect(derived.capturedMs).toBe(120_000);
    expect(derived.sentFrames).toBe(3);
    expect(visualUsageLine(derived)?.minutes).toBe(2);
  });
});

describe('visual usage charge', () => {
  it('leaves an unpriced deployment row unpriced rather than free', () => {
    const line = visualUsageLine(usage());
    expect(line).not.toBeNull();
    const charge = visualUsageCharge(line!);
    const rate = FEATURE_RATE_CARD[line!.feature];
    if (rate.customerMicrousd === null) {
      expect(charge.customerMicrousd).toBeNull();
      expect(visualUsageTotalCustomerMicrousd([line!])).toBeNull();
    } else {
      expect(charge.customerMicrousd).toBe(rate.customerMicrousd * line!.minutes);
    }
    expect(rate.customerBasis).toBe('deployment_metered');
    expect(rate.providerCogsBasis).toBe('deployment_metered');
  });

  it('is metered per minute and not per token', () => {
    expect(VISUAL_USAGE_OPERATION).toBe('visual');
    expect(visualUsageLine(usage())?.unit).toBe('minute');
  });
});
