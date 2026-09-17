import { describe, expect, it } from 'vitest';

import {
  DATA_REGION_IDS,
  DEFAULT_DATA_REGION,
  DataRegionUnavailableError,
  configuredDataRegions,
  dataRegionEnvName,
  dataRegionEnvNames,
  excludedTransportsFor,
  inferenceRouteSetAdmits,
  normaliseDataRegion,
  resolveDataRegion,
  selectDataRegion,
} from '../data-residency';
import { NON_US_VENDOR_TRANSPORTS } from '../transport-residency';

const HOME_ENV = { AGI_DATABASE_URL: 'postgresql://u:p@us.example/db?sslmode=require' };

/**
 * The second region the whole design has to be testable against. It is a
 * fixture, not a deployment: no Neon project, bucket, log sink or KMS key
 * behind any of these values exists.
 */
function euEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    ...HOME_ENV,
    AGI_DATA_REGION_EU_DATABASE_URL: 'postgresql://u:p@eu.example/db?sslmode=require',
    AGI_DATA_REGION_EU_OBJECT_STORAGE_ENDPOINT: 'https://eu.objects.example',
    AGI_DATA_REGION_EU_OBJECT_STORAGE_BUCKET: 'agi-eu-private',
    AGI_DATA_REGION_EU_LOG_DESTINATION: 'https://logs.eu.example/ingest',
    AGI_DATA_REGION_EU_KMS_REGION: 'eu-central-1',
    AGI_DATA_REGION_EU_INFERENCE_TRANSPORTS: 'eu_gateway, mistral_eu',
    ...overrides,
  };
}

describe('region env naming', () => {
  it('derives every facet name from the region id, so a third region adds no literals', () => {
    expect(dataRegionEnvName('eu', 'databaseUrl')).toBe('AGI_DATA_REGION_EU_DATABASE_URL');
    expect(dataRegionEnvNames('eu')).toEqual([
      'AGI_DATA_REGION_EU_DATABASE_URL',
      'AGI_DATA_REGION_EU_OBJECT_STORAGE_ENDPOINT',
      'AGI_DATA_REGION_EU_OBJECT_STORAGE_BUCKET',
      'AGI_DATA_REGION_EU_LOG_DESTINATION',
      'AGI_DATA_REGION_EU_KMS_REGION',
      'AGI_DATA_REGION_EU_INFERENCE_TRANSPORTS',
    ]);
  });
});

describe('normalising a stored region', () => {
  it('accepts the declared ids in any case', () => {
    expect(normaliseDataRegion('EU')).toBe('eu');
    expect(normaliseDataRegion(' us ')).toBe('us');
  });

  it('answers null for a region this build does not declare rather than the home region', () => {
    expect(normaliseDataRegion('ap-southeast')).toBeNull();
    expect(normaliseDataRegion(null)).toBeNull();
    expect(normaliseDataRegion(undefined)).toBeNull();
  });
});

describe('resolving the home region', () => {
  it('is provisioned from the deployment database the app already has', () => {
    const resolution = resolveDataRegion('us', HOME_ENV);
    expect(resolution.provisioned).toBe(true);
    if (!resolution.provisioned) return;
    expect(resolution.runtime.databaseUrl).toBe(HOME_ENV.AGI_DATABASE_URL);
    expect(resolution.runtime.definition.jurisdiction).toBe('US');
  });

  it('excludes exactly the transports the residency contract places outside the country', () => {
    const resolution = resolveDataRegion('us', HOME_ENV);
    if (!resolution.provisioned) throw new Error('home region should resolve');
    const { inferenceRouteSet } = resolution.runtime;
    expect(inferenceRouteSet.mode).toBe('exclude');
    expect([...inferenceRouteSet.transports].sort()).toEqual([...NON_US_VENDOR_TRANSPORTS].sort());
    expect(inferenceRouteSetAdmits(inferenceRouteSet, 'open_router')).toBe(true);
    expect(inferenceRouteSetAdmits(inferenceRouteSet, 'deepseek')).toBe(false);
  });

  it('is unprovisioned with no database at all', () => {
    const resolution = resolveDataRegion('us', {});
    expect(resolution).toEqual({
      provisioned: false,
      region: 'us',
      missing: ['AGI_DATA_REGION_US_DATABASE_URL'],
    });
  });
});

describe('resolving a second region', () => {
  it('is unprovisioned out of the box, naming every var that would make it real', () => {
    const resolution = resolveDataRegion('eu', HOME_ENV);
    expect(resolution.provisioned).toBe(false);
    if (resolution.provisioned) return;
    expect(resolution.missing).toEqual(dataRegionEnvNames('eu'));
  });

  it('is all-or-nothing: one missing facet leaves the region unprovisioned', () => {
    const resolution = resolveDataRegion(
      'eu',
      euEnv({ AGI_DATA_REGION_EU_LOG_DESTINATION: undefined }),
    );
    expect(resolution.provisioned).toBe(false);
    if (resolution.provisioned) return;
    expect(resolution.missing).toEqual(['AGI_DATA_REGION_EU_LOG_DESTINATION']);
  });

  it('carries its own database, bucket, logs and keys once every facet is set', () => {
    const resolution = resolveDataRegion('eu', euEnv());
    expect(resolution.provisioned).toBe(true);
    if (!resolution.provisioned) return;
    const { runtime } = resolution;
    expect(runtime.databaseUrl).toContain('eu.example');
    expect(runtime.objectStorageBucket).toBe('agi-eu-private');
    expect(runtime.logDestination).toBe('https://logs.eu.example/ingest');
    expect(runtime.keyManagementRegion).toBe('eu-central-1');
    expect(runtime.definition.objectStorageJurisdiction).toBe('eu');
  });

  it('admits only the transports it names, because unpublished is not the same as inside', () => {
    const resolution = resolveDataRegion('eu', euEnv());
    if (!resolution.provisioned) throw new Error('fixture region should resolve');
    const { inferenceRouteSet } = resolution.runtime;
    expect(inferenceRouteSet.mode).toBe('allow');
    expect(inferenceRouteSetAdmits(inferenceRouteSet, 'mistral_eu')).toBe(true);
    expect(inferenceRouteSetAdmits(inferenceRouteSet, 'open_router')).toBe(false);
    expect(inferenceRouteSetAdmits(inferenceRouteSet, 'deepseek')).toBe(false);
  });

  it('treats an empty inference list as no route set rather than every route', () => {
    const resolution = resolveDataRegion(
      'eu',
      euEnv({ AGI_DATA_REGION_EU_INFERENCE_TRANSPORTS: '  ,  ' }),
    );
    expect(resolution.provisioned).toBe(false);
    if (resolution.provisioned) return;
    expect(resolution.missing).toEqual(['AGI_DATA_REGION_EU_INFERENCE_TRANSPORTS']);
  });
});

describe('the exclusion set a routing request speaks', () => {
  it('passes the home region exclusions through unchanged', () => {
    const resolution = resolveDataRegion('us', HOME_ENV);
    if (!resolution.provisioned) throw new Error('home region should resolve');
    const excluded = excludedTransportsFor(resolution.runtime.inferenceRouteSet, [
      'open_router',
      'deepseek',
    ]);
    expect([...excluded].sort()).toEqual([...NON_US_VENDOR_TRANSPORTS].sort());
  });

  it('subtracts an allow region from the catalog it is given', () => {
    const resolution = resolveDataRegion('eu', euEnv());
    if (!resolution.provisioned) throw new Error('fixture region should resolve');
    const excluded = excludedTransportsFor(resolution.runtime.inferenceRouteSet, [
      'open_router',
      'mistral_eu',
      'bedrock',
    ]);
    expect([...excluded].sort()).toEqual(['bedrock', 'open_router']);
  });
});

describe('selecting the region a request runs in', () => {
  it('lists only the regions actually provisioned', () => {
    expect(configuredDataRegions(HOME_ENV)).toEqual(['us']);
    expect(configuredDataRegions(euEnv())).toEqual(['us', 'eu']);
    expect(DATA_REGION_IDS).toContain(DEFAULT_DATA_REGION);
  });

  it('serves a workspace with no stored region from the home region', () => {
    expect(selectDataRegion(null, HOME_ENV).region).toBe('us');
  });

  it('refuses a workspace pinned to an unprovisioned region instead of serving it elsewhere', () => {
    expect(() => selectDataRegion('eu', HOME_ENV)).toThrow(DataRegionUnavailableError);
    try {
      selectDataRegion('eu', HOME_ENV);
    } catch (error) {
      expect((error as DataRegionUnavailableError).region).toBe('eu');
      expect((error as DataRegionUnavailableError).missing).toEqual(dataRegionEnvNames('eu'));
      expect(String(error)).not.toMatch(/us\.example/);
    }
  });

  it('serves a pinned workspace from its own region once that region exists', () => {
    const runtime = selectDataRegion('eu', euEnv());
    expect(runtime.region).toBe('eu');
    expect(runtime.databaseUrl).toContain('eu.example');
  });

  it('refuses a region name this build never declared rather than serving it from home', () => {
    expect(() => selectDataRegion('ap-southeast', HOME_ENV)).toThrow(DataRegionUnavailableError);
    expect(selectDataRegion('   ', HOME_ENV).region).toBe('us');
  });
});
