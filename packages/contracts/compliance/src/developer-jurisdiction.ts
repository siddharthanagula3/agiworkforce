/**
 * @file Which countries a model's developer may be headquartered in, per data region.
 *
 * A third question beside the two `transport-residency.ts` separates: not where a
 * request is processed, and not which vendor operates an endpoint, but which
 * company built the model. A US gateway can serve a model developed in China; a
 * rule that the United States may adopt about using such models is a rule about
 * this field, and a transport exclusion cannot express it.
 *
 * The country each developer is headquartered in is recorded in the model
 * catalog (`packages/ai/model-registry/catalog/developers.json`) with its source.
 * This file only says, per region, whether that country is checked and which
 * countries pass. Every region ships with the check off (owner decision of
 * 2026-10-10, "build the switch, keep it off"), so routing and the picker are
 * unchanged until a region turns it on. A developer with no recorded country
 * fails an enforced check rather than passing it.
 */

import type { DataRegionId } from './data-residency';

export interface DeveloperJurisdictionPolicy {
  enforced: boolean;
  allowedJurisdictions: readonly string[];
  decidedOn: string;
  reason: string;
}

export const DEVELOPER_JURISDICTION_POLICIES: Readonly<
  Record<DataRegionId, DeveloperJurisdictionPolicy>
> = Object.freeze({
  us: Object.freeze({
    enforced: false,
    allowedJurisdictions: Object.freeze(['US']),
    decidedOn: '2026-10-10',
    reason:
      'owner decision: be ready to serve only US-developed models in the US if US rules require it; built and off',
  }),
  eu: Object.freeze({
    enforced: false,
    allowedJurisdictions: Object.freeze([]),
    decidedOn: '2026-10-10',
    reason: 'no list has been decided for the EU region, which is not provisioned',
  }),
});

/**
 * The developer countries a request in `region` may use, or null when nothing is
 * checked there. An unknown region checks nothing, exactly as it does today.
 */
export function allowedDeveloperJurisdictions(
  region: string | null | undefined,
  policies: Readonly<Record<string, DeveloperJurisdictionPolicy>> = DEVELOPER_JURISDICTION_POLICIES,
): ReadonlySet<string> | null {
  const policy = region ? policies[region] : undefined;
  if (!policy?.enforced) return null;
  return new Set(policy.allowedJurisdictions);
}
