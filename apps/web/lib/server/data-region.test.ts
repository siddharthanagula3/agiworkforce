import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mocks.recordAuditEvent(...(args as [])),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { DataRegionUnavailableError } from '@agiworkforce/compliance';

import {
  CustomerKeyRegionError,
  assertCustomerKeyRegion,
  cancelOrganizationRegionMove,
  completeOrganizationRegionMove,
  keyManagementRegions,
  isRegionProvisioned,
  readOrganizationRegion,
  readStoredOrganizationRegion,
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
  const execute = vi.fn(async () => 1);
  return { db: { query, execute } as unknown as DatabaseAdapter, query, execute };
}

function racingHarness(readBefore: Record<string, unknown>, readAfter: Record<string, unknown>) {
  const query = vi.fn().mockResolvedValueOnce([readBefore]).mockResolvedValue([readAfter]);
  const execute = vi.fn(async () => 0);
  return { db: { query, execute } as unknown as DatabaseAdapter, query, execute };
}

beforeEach(() => vi.clearAllMocks());

describe('which regions this deployment has', () => {
  it('has only the home region out of the box', () => {
    expect(isRegionProvisioned('us', HOME_ONLY)).toBe(true);
    expect(isRegionProvisioned('eu', HOME_ONLY)).toBe(false);
  });

  it('has both once the second region names every piece it is made of', () => {
    expect(isRegionProvisioned('us', TWO_REGIONS)).toBe(true);
    expect(isRegionProvisioned('eu', TWO_REGIONS)).toBe(true);
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

describe('the stored region a residency check relies on', () => {
  it('is unknown when the workspace row cannot be read, not the home region', async () => {
    const h = harness(null);
    await expect(readStoredOrganizationRegion(h.db, ORG, HOME_ONLY)).resolves.toBeNull();
    await expect(readOrganizationRegion(h.db, ORG, HOME_ONLY)).resolves.toMatchObject({
      effective: 'us',
    });
  });

  it('is unknown when the stored pin names no region this build declares', async () => {
    const h = harness({
      data_region: 'mars',
      data_region_requested: null,
      data_region_requested_at: null,
    });
    await expect(readStoredOrganizationRegion(h.db, ORG, HOME_ONLY)).resolves.toBeNull();
  });

  it('keeps a workspace that never chose a region in the home region', async () => {
    const h = harness({
      data_region: null,
      data_region_requested: null,
      data_region_requested_at: null,
    });
    await expect(readStoredOrganizationRegion(h.db, ORG, HOME_ONLY)).resolves.toEqual({
      effective: 'us',
      requested: null,
      requestedAt: null,
      provisioned: true,
      missing: [],
    });
  });

  it('reports a stored pin with its provisioning', async () => {
    const h = harness({
      data_region: 'eu',
      data_region_requested: null,
      data_region_requested_at: null,
    });
    const state = await readStoredOrganizationRegion(h.db, ORG, TWO_REGIONS);
    expect(state?.effective).toBe('eu');
    expect(state?.provisioned).toBe(true);
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
    expect(sql).toMatch(/and data_region_requested = \$2/);
    const [event] = mocks.recordAuditEvent.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(event['eventType']).toBe('data_region_changed');
    expect((event['detail'] as Record<string, unknown>)['previousRegion']).toBe('us');
  });

  it('refuses a cutover whose request was cancelled after it was read', async () => {
    const h = racingHarness(
      {
        data_region: null,
        data_region_requested: 'eu',
        data_region_requested_at: '2026-09-16T00:00:00.000Z',
      },
      { data_region: null, data_region_requested: null, data_region_requested_at: null },
    );

    await expect(
      completeOrganizationRegionMove({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        target: 'eu',
        env: TWO_REGIONS,
      }),
    ).rejects.toThrow(/no outstanding move/);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('clears only the request it read when cancelling', async () => {
    const h = harness({
      data_region: null,
      data_region_requested: 'eu',
      data_region_requested_at: '2026-09-16T00:00:00.000Z',
    });

    const state = await cancelOrganizationRegionMove({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      env: TWO_REGIONS,
    });

    expect(state).toMatchObject({ effective: 'us', requested: null, requestedAt: null });
    const [sql, params] = h.execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/and data_region_requested = \$2/);
    expect(params).toEqual([ORG, 'eu']);
    const [event] = mocks.recordAuditEvent.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(event['eventType']).toBe('data_region_change_cancelled');
  });

  it('reports the committed state when a cutover won the race against a cancel', async () => {
    const h = racingHarness(
      {
        data_region: null,
        data_region_requested: 'eu',
        data_region_requested_at: '2026-09-16T00:00:00.000Z',
      },
      { data_region: 'eu', data_region_requested: null, data_region_requested_at: null },
    );

    const state = await cancelOrganizationRegionMove({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      env: TWO_REGIONS,
    });

    expect(state).toMatchObject({ effective: 'eu', requested: null });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
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
