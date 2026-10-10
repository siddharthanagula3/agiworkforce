import { describe, expect, it } from 'vitest';

import { DATA_REGION_IDS } from '../data-residency';
import {
  DEVELOPER_JURISDICTION_POLICIES,
  allowedDeveloperJurisdictions,
} from '../developer-jurisdiction';

describe('developer jurisdiction policy', () => {
  it('ships with the check off in every region', () => {
    for (const region of DATA_REGION_IDS) {
      expect(DEVELOPER_JURISDICTION_POLICIES[region].enforced).toBe(false);
      expect(allowedDeveloperJurisdictions(region)).toBeNull();
    }
  });

  it('checks nothing for an unknown or missing region', () => {
    expect(allowedDeveloperJurisdictions('mars')).toBeNull();
    expect(allowedDeveloperJurisdictions(null)).toBeNull();
  });

  it('answers the allowed countries once a region turns the check on', () => {
    const policies = {
      ...DEVELOPER_JURISDICTION_POLICIES,
      us: { ...DEVELOPER_JURISDICTION_POLICIES.us, enforced: true },
    };
    expect(allowedDeveloperJurisdictions('us', policies)).toEqual(new Set(['US']));
  });
});
