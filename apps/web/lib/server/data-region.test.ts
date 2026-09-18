import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(async () => undefined),
  createDatabaseClient: vi.fn((config: Record<string, unknown>) => ({ config })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mocks.recordAuditEvent(...(args as [])),
}));
vi.mock('@/lib/server/db-pool-tuning', () => ({ SERVICE_POOL_TUNING: { poolSize: 10 } }));
vi.mock('@/lib/server/db-connection-error', () => ({ reportDatabaseConnectionError: vi.fn() }));
vi.mock('@agiworkforce/data-layer', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@agiworkforce/data-layer');
  return {
    ...actual,
    createDatabaseClient: (config: Record<string, unknown>) => mocks.createDatabaseClient(config),
  };
});

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { DataRegionUnavailableError } from '@agiworkforce/compliance';

import {
  CustomerKeyRegionError,
  assertCustomerKeyRegion,
  completeOrganizationRegionMove,
  getRegionDb,
  keyManagementRegions,
  regionExcludedTransports,
  regionInfrastructure,
  isRegionProvisioned,
  provisionedRegions,
  readOrganizationRegion,
  requestOrganizationRegionMove,
} from './data-region';

const ORG = '11111111-1111-4111-8111-111111111111';
const ACTOR = 'user_abc';

const HOME_ONLY = { AGI_DATABASE_URL: 'postgresql://u:p@us.example/db?sslmode=require' };

const TWO_REGIONS = {
  ...HOME_ONLY,
  AGI_DATA_REGION_EU_DATABASE_URL: 'postgresql://u:p@eu.example/db?sslmode=require',
  AGI_DATA_REGION_EU_OBJECT_STORAGE_ENDPOINT: 'https://eu.objects.example',
  AGI_DATA_REGION_EU_OBJECT_STORAGE_BUCKET: 'agi-eu-private',
  AGI_DATA_REGION_EU_LOG_DESTINATION: 'https://logs.eu.example/ingest',
  AGI_DATA_REGION_EU_KMS_REGION: 'eu-central-1',
  AGI_DATA_REGION_EU_INFERENCE_TRANSPORTS: 'mistral_eu',
};

function harness(row: Record<string, unknown> | null = null) {
  const query = vi.fn(async () => (row ? [row] : []));
  const execute = vi.fn(async () => undefined);
  return { db: { query, execute } as unknown as DatabaseAdapter, query, execute };
}

beforeEach(() => vi.clearAllMocks());

describe('which regions this deployment has', () => {
  it('has only the home region out of the box', () => {
    expect(provisionedRegions(HOME_ONLY)).toEqual(['us']);
    expect(isRegionProvisioned('eu', HOME_ONLY)).toBe(false);
  });

  it('has both once the second region names every piece it is made of', () => {
    expect(provisionedRegions(TWO_REGIONS)).toEqual(['us', 'eu']);
  });
});

describe('the database a region is served from', () => {
  it('opens one pool per region against that region’s own connection string', () => {
    getRegionDb('us', TWO_REGIONS);
    getRegionDb('eu', TWO_REGIONS);

    const strings = mocks.createDatabaseClient.mock.calls.map(
      ([config]) => (config as Record<string, string>)['connectionString'],
    );
    expect(strings).toEqual([
      TWO_REGIONS.AGI_DATABASE_URL,
      TWO_REGIONS.AGI_DATA_REGION_EU_DATABASE_URL,
    ]);
  });

  it('reuses the pool it already opened for a region', () => {
    const before = mocks.createDatabaseClient.mock.calls.length;
    getRegionDb('us', TWO_REGIONS);
    getRegionDb('us', TWO_REGIONS);
    expect(mocks.createDatabaseClient.mock.calls.length).toBe(before);
  });

  it('refuses a region this deployment cannot serve instead of opening the home pool', () => {
    expect(() => getRegionDb('eu', HOME_ONLY)).toThrow(DataRegionUnavailableError);
  });
});

describe('the region a workspace is in', () => {
  it('treats a workspace that never chose one as the home region', async () => {
    const h = harness({
      data_region: null,
      data_region_requested: null,
      data_region_requested_at: null,
    });
    const state = await readOrganizationRegion(h.db, ORG, HOME_ONLY);
    expect(state).toEqual({
      effective: 'us',
      requested: null,
      requestedAt: null,
      provisioned: true,
      missing: [],
    });
  });

  it('reports a pin this deployment cannot serve as unprovisioned, naming what is unset', async () => {
    const h = harness({
      data_region: 'eu',
      data_region_requested: null,
      data_region_requested_at: null,
    });
    const state = await readOrganizationRegion(h.db, ORG, HOME_ONLY);
    expect(state.effective).toBe('eu');
    expect(state.provisioned).toBe(false);
    expect(state.missing).toContain('AGI_DATA_REGION_EU_DATABASE_URL');
  });
});

describe('moving an existing workspace to another region', () => {
  it('refuses a move to a region that does not exist yet', async () => {
    const h = harness({
      data_region: null,
      data_region_requested: null,
      data_region_requested_at: null,
    });
    await expect(
      requestOrganizationRegionMove({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        target: 'eu',
        env: HOME_ONLY,
      }),
    ).rejects.toBeInstanceOf(DataRegionUnavailableError);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('records the request without claiming the data has moved', async () => {
    const h = harness({
      data_region: null,
      data_region_requested: null,
      data_region_requested_at: null,
    });

    const state = await requestOrganizationRegionMove({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      target: 'eu',
      env: TWO_REGIONS,
    });

    expect(state.effective).toBe('us');
    expect(state.requested).toBe('eu');
    const sql = String((h.execute.mock.calls[0] as unknown as [string])[0]);
    expect(sql).toMatch(/set data_region_requested = \$2/);
    expect(sql).not.toMatch(/set data_region =/);
    const [event] = mocks.recordAuditEvent.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(event['eventType']).toBe('data_region_change_requested');
  });

  it('will not cut over a move nobody requested', async () => {
    const h = harness({
      data_region: null,
      data_region_requested: null,
      data_region_requested_at: null,
    });
    await expect(
      completeOrganizationRegionMove({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        target: 'eu',
        env: TWO_REGIONS,
      }),
    ).rejects.toThrow(/no outstanding move/);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('cuts over once the copy is verified, clearing the request and auditing the move', async () => {
    const h = harness({
      data_region: null,
      data_region_requested: 'eu',
      data_region_requested_at: '2026-09-16T00:00:00.000Z',
    });

    const state = await completeOrganizationRegionMove({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      target: 'eu',
      env: TWO_REGIONS,
    });

    expect(state).toEqual({
      effective: 'eu',
      requested: null,
      requestedAt: null,
      provisioned: true,
      missing: [],
    });
    const sql = String((h.execute.mock.calls[0] as unknown as [string])[0]);
    expect(sql).toMatch(/set data_region = \$2/);
    expect(sql).toMatch(/data_region_requested = null/);
    const [event] = mocks.recordAuditEvent.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(event['eventType']).toBe('data_region_changed');
    expect((event['detail'] as Record<string, unknown>)['previousRegion']).toBe('us');
  });
});

describe('the objects, logs and keys a region pins', () => {
  it('names no storage jurisdiction for the home region, because it pins none', () => {
    const home = regionInfrastructure('us', HOME_ONLY);
    expect(home.objectStorageJurisdiction).toBeNull();
  });

  it('names the jurisdiction a pinned bucket must be created under, not an auto region', () => {
    const eu = regionInfrastructure('eu', TWO_REGIONS);
    expect(eu.objectStorageJurisdiction).toBe('eu');
    expect(eu.objectStorageBucket).toBe('agi-eu-private');
    expect(eu.logDestination).toBe('https://logs.eu.example/ingest');
    expect(eu.keyManagementRegion).toBe('eu-central-1');
  });

  it('excludes for the home region exactly what the product already excluded', () => {
    const excluded = regionExcludedTransports(['open_router', 'deepseek', 'qwen'], HOME_ONLY);
    expect(excluded.has('deepseek')).toBe(true);
    expect(excluded.has('open_router')).toBe(false);
  });

  it('excludes everything a pinned region does not name', () => {
    const excluded = regionExcludedTransports(['open_router', 'mistral_eu'], {
      ...TWO_REGIONS,
      AGI_DATA_REGION: 'eu',
    });
    expect(excluded.has('open_router')).toBe(true);
    expect(excluded.has('mistral_eu')).toBe(false);
  });
});

describe('where a customer-managed key may live', () => {
  const MULTI_VENDOR = {
    ...TWO_REGIONS,
    AGI_DATA_REGION_EU_KMS_REGION: 'eu-central-1, europe-west3 ,,westeurope',
  };

  it('reads the vendor regions a jurisdiction declares as a list, not as one string', () => {
    expect(keyManagementRegions('eu', MULTI_VENDOR)).toEqual([
      'eu-central-1',
      'europe-west3',
      'westeurope',
    ]);
  });

  it('declares none for a region that names none, rather than an empty-string region', () => {
    expect(keyManagementRegions('us', HOME_ONLY)).toEqual([]);
  });

  it('admits a key in a vendor region the workspace region declares', () => {
    expect(() => assertCustomerKeyRegion('eu', 'europe-west3', MULTI_VENDOR)).not.toThrow();
    expect(() => assertCustomerKeyRegion('eu', '  EU-Central-1 ', MULTI_VENDOR)).not.toThrow();
  });

  it('refuses a key outside them and names what the region does admit', () => {
    let thrown: unknown;
    try {
      assertCustomerKeyRegion('eu', 'us-east-1', MULTI_VENDOR);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CustomerKeyRegionError);
    const error = thrown as CustomerKeyRegionError;
    expect(error.region).toBe('eu');
    expect(error.keyRegion).toBe('us-east-1');
    expect(error.admitted).toEqual(['eu-central-1', 'europe-west3', 'westeurope']);
    expect(error.message).toContain('eu-central-1');
  });

  // A region that declares nothing must refuse rather than admit everything: an
  // unconfigured deployment is the case activation most needs to fail closed on.
  it('refuses outright when the region declares no key-management region at all', () => {
    expect(() => assertCustomerKeyRegion('us', 'us-east-1', HOME_ONLY)).toThrow(
      CustomerKeyRegionError,
    );
  });
});
