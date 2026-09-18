/**
 * Usage a live visual session produces, as its own ledger line.
 *
 * Camera and screen-share minutes are not token usage and not an image
 * generation: the session runs for a wall-clock span, samples frames on an
 * interval and sends only the ones the scene changed enough to justify. Pricing
 * it as tokens would put the cost of the most expensive thing a turn can carry
 * under the cheapest line in the ledger.
 *
 * @module visual-usage
 * @packageDocumentation
 */

import { resolveFeatureRate, type RateCardFeature } from './rate-card';
import {
  VISUAL_SOURCE_KINDS,
  type VisualSessionStatus,
  type VisualSourceKind,
} from './visual-session';

export const VISUAL_USAGE_OPERATION = 'visual';

/**
 * A shared window is a screen share by another name: the same capture API, the
 * same per-minute cost, so it settles on the same line.
 */
export const VISUAL_USAGE_FEATURE: Readonly<Record<VisualSourceKind, RateCardFeature>> = {
  camera: 'visual_camera_minute',
  screen: 'visual_screen_share_minute',
  window: 'visual_screen_share_minute',
};

export interface VisualSessionUsage {
  readonly source: VisualSourceKind;
  /** Wall-clock span the source was attached, in milliseconds. */
  readonly capturedMs: number;
  /** Frames admitted into the buffer. */
  readonly sampledFrames: number;
  /** Frames actually sent into a turn. Never more than were sampled. */
  readonly sentFrames: number;
}

export interface VisualUsageLine {
  readonly feature: RateCardFeature;
  readonly source: VisualSourceKind;
  readonly unit: 'minute';
  readonly minutes: number;
  readonly sampledFrames: number;
  readonly sentFrames: number;
}

const MS_PER_MINUTE = 60_000;

/** One session cannot plausibly exceed this, and a claim that does is truncated. */
export const MAX_VISUAL_SESSION_MINUTES = 480;

function bounded(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), max);
}

/**
 * Billed per started minute, the same convention the live voice minute uses, so
 * a ten second look at a whiteboard costs one minute and not a fraction nobody
 * can reconcile against an invoice.
 */
export function visualSessionMinutes(capturedMs: number): number {
  if (!Number.isFinite(capturedMs) || capturedMs <= 0) return 0;
  return Math.min(Math.ceil(capturedMs / MS_PER_MINUTE), MAX_VISUAL_SESSION_MINUTES);
}

export function visualUsageFromStatus(
  status: VisualSessionStatus,
  endedAtMs: number,
  sentFrames = 0,
): VisualSessionUsage {
  const startedAtMs = status.startedAtMs;
  const capturedMs = startedAtMs === null ? 0 : Math.max(0, endedAtMs - startedAtMs);
  return {
    source: status.source,
    capturedMs,
    sampledFrames: bounded(status.sampledFrames, Number.MAX_SAFE_INTEGER),
    sentFrames: Math.min(bounded(sentFrames, Number.MAX_SAFE_INTEGER), status.sampledFrames),
  };
}

export function visualUsageLine(usage: VisualSessionUsage): VisualUsageLine | null {
  const minutes = visualSessionMinutes(usage.capturedMs);
  if (minutes === 0) return null;
  return {
    feature: VISUAL_USAGE_FEATURE[usage.source],
    source: usage.source,
    unit: 'minute',
    minutes,
    sampledFrames: usage.sampledFrames,
    sentFrames: usage.sentFrames,
  };
}

/**
 * Merges the sessions of one turn onto their features, so a turn that shared a
 * screen and a camera settles two lines and not four.
 */
export function visualUsageLines(
  usages: readonly VisualSessionUsage[],
): readonly VisualUsageLine[] {
  const byFeature = new Map<RateCardFeature, VisualUsageLine>();
  for (const usage of usages) {
    const line = visualUsageLine(usage);
    if (!line) continue;
    const existing = byFeature.get(line.feature);
    byFeature.set(
      line.feature,
      existing
        ? {
            ...existing,
            minutes: Math.min(existing.minutes + line.minutes, MAX_VISUAL_SESSION_MINUTES),
            sampledFrames: existing.sampledFrames + line.sampledFrames,
            sentFrames: existing.sentFrames + line.sentFrames,
          }
        : line,
    );
  }
  return [...byFeature.values()];
}

export interface VisualUsageCharge {
  readonly customerMicrousd: number | null;
  readonly providerCogsMicrousd: number | null;
}

/**
 * Null on either side means the deployment has published no rate for that row
 * yet. An unpriced minute stays unpriced rather than being valued at zero.
 */
export function visualUsageCharge(line: VisualUsageLine): VisualUsageCharge {
  const rate = resolveFeatureRate(line.feature);
  return {
    customerMicrousd: rate.customerMicrousd === null ? null : rate.customerMicrousd * line.minutes,
    providerCogsMicrousd:
      rate.providerCogsMicrousd === null ? null : rate.providerCogsMicrousd * line.minutes,
  };
}

export function visualUsageTotalCustomerMicrousd(lines: readonly VisualUsageLine[]): number | null {
  let total = 0;
  for (const line of lines) {
    const charge = visualUsageCharge(line);
    if (charge.customerMicrousd === null) return null;
    total += charge.customerMicrousd;
  }
  return total;
}

export function isVisualUsageFeature(feature: RateCardFeature): boolean {
  return VISUAL_SOURCE_KINDS.some((source) => VISUAL_USAGE_FEATURE[source] === feature);
}
