import { describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_CAPABILITY_LABELS,
  CONNECTORS_COMING_SOON_MESSAGE,
  billingPlanCapabilityPlanLabels,
} from '@agiworkforce/types';
import { AVAILABLE_NOW_LABEL, SURFACE_STATUS, type SurfaceStatusMap } from '@/lib/surface-status';
import {
  CURRENT_RELEASE_STATE,
  connectorFeatureNote,
  planCapabilityEntitlementHint,
  planCapabilityLabel,
  planCapabilityReleased,
  type ProductReleaseState,
} from './plan-capability-release';
import { getBillingPlanDisplay, summarizePlanChange } from './plan-display';

const EVERYTHING_RELEASED: ProductReleaseState = {
  surfaces: Object.fromEntries(
    Object.keys(SURFACE_STATUS).map((surface) => [surface, AVAILABLE_NOW_LABEL]),
  ) as SurfaceStatusMap,
  connectors: 'released',
};

describe('plan capability copy follows the release state', () => {
  it('describes the launch: web chat only, skills without connectors, no developer surfaces', () => {
    expect(CURRENT_RELEASE_STATE.connectors).toBe('coming_soon');
    expect(planCapabilityLabel('managed_chat')).toBe('Managed Cloud chat on the web');
    expect(planCapabilityLabel('skills_connectors')).toBe('Skills');
    expect(planCapabilityReleased('developer_surfaces')).toBe(false);
    expect(planCapabilityReleased('artifact_connectors')).toBe(false);
    expect(planCapabilityReleased('managed_chat')).toBe(true);
    expect(connectorFeatureNote()).toBe(CONNECTORS_COMING_SOON_MESSAGE);
  });

  it('names each surface as it ships and returns the catalog labels once everything has', () => {
    const desktop: ProductReleaseState = {
      ...CURRENT_RELEASE_STATE,
      surfaces: { ...SURFACE_STATUS, desktop: AVAILABLE_NOW_LABEL },
    };
    expect(planCapabilityLabel('managed_chat', desktop)).toBe(
      'Managed Cloud chat on the web and desktop',
    );
    expect(planCapabilityLabel('managed_chat', EVERYTHING_RELEASED)).toBe(
      'Managed Cloud chat on the web, desktop, mobile and Chrome',
    );
    expect(planCapabilityLabel('skills_connectors', EVERYTHING_RELEASED)).toBe(
      BILLING_PLAN_CAPABILITY_LABELS.skills_connectors,
    );
    expect(planCapabilityReleased('developer_surfaces', EVERYTHING_RELEASED)).toBe(true);
    expect(connectorFeatureNote(EVERYTHING_RELEASED)).toBeUndefined();
  });

  it('keeps unreleased capabilities and connector limits out of every plan feature list', () => {
    for (const plan of ['free', 'basic', 'pro', 'max', 'max_15x', 'team'] as const) {
      const features = getBillingPlanDisplay(plan).features.join('\n');
      expect(features, plan).not.toMatch(/custom MCP server|connector/i);
      expect(features, plan).not.toContain(BILLING_PLAN_CAPABILITY_LABELS.developer_surfaces);
      expect(features, plan).not.toContain(BILLING_PLAN_CAPABILITY_LABELS.managed_chat);
    }
    const released = getBillingPlanDisplay('pro', EVERYTHING_RELEASED).features;
    expect(released).toContain(BILLING_PLAN_CAPABILITY_LABELS.developer_surfaces);
    expect(released).toContain(BILLING_PLAN_CAPABILITY_LABELS.skills_connectors);
    expect(released.some((feature) => /custom MCP server/.test(feature))).toBe(true);
  });

  it('does not list losing what the account could never use on a downgrade', () => {
    const summary = summarizePlanChange('max', 'basic');
    expect(summary.lostCapabilities).not.toContain(
      BILLING_PLAN_CAPABILITY_LABELS.developer_surfaces,
    );
    expect(summary.limits.map((row) => row.label)).not.toContain('Custom MCP servers');
    expect(summary.limits.map((row) => row.label)).not.toContain('Connector tools');

    const released = summarizePlanChange('max', 'basic', EVERYTHING_RELEASED);
    expect(released.lostCapabilities).toContain(BILLING_PLAN_CAPABILITY_LABELS.developer_surfaces);
    expect(released.limits.map((row) => row.label)).toContain('Custom MCP servers');
  });

  it('names the plans that include a media capability from the catalog', () => {
    expect(planCapabilityEntitlementHint('image_generation')).toBe(
      `Image generation is available on ${billingPlanCapabilityPlanLabels('image_generation')}.`,
    );
    expect(planCapabilityEntitlementHint('video_generation')).toBe(
      `Video generation is available on ${billingPlanCapabilityPlanLabels('video_generation')}.`,
    );
  });
});
