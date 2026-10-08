import { beforeEach, describe, expect, it, vi } from 'vitest';
import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import { listCanonicalModels } from '@agiworkforce/types';
type ProviderAdapterServiceModule = typeof import('@/lib/services/provider-adapter-service');
type CloudCodeSessionServiceModule = typeof import('@/lib/services/cloud-code-session-service');
type LoggerModule = typeof import('@/lib/logger');

const mocks = vi.hoisted(() => ({
  resolveProvider: vi.fn<(model: string) => string>(),
  getSession: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<ProviderAdapterServiceModule>()),
  resolveProviderFromModel: (model: string) => mocks.resolveProvider(model),
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => ({
  ...(await importOriginal<CloudCodeSessionServiceModule>()),
  getCloudCodeSession: mocks.getSession,
}));

import {
  CloudCodeModelMayTrainError,
  prepareCloudCodeAgentTurn,
} from '@/lib/services/cloud-code-agent-service';

const canonical = listCanonicalModels();
const KEEPS_OUT = canonical.find((model) => providerKeepsInputsOutOfTraining(model.provider))!;
const MAY_TRAIN = canonical.find((model) => !providerKeepsInputsOutOfTraining(model.provider))!;
const OWNER = { userId: 'user-1', organizationId: null };
const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function dbFor(optedOut: boolean | Error) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('from public.user_settings')) {
        if (optedOut instanceof Error) throw optedOut;
        return [{ opted_out: optedOut }];
      }
      if (sql.includes('insert into cloud_code_agent_turns')) return [{ id: 'turn-1' }];
      return [];
    }),
  };
}

function prepare(db: ReturnType<typeof dbFor>, model: string) {
  return prepareCloudCodeAgentTurn({
    db: db as never,
    owner: OWNER,
    sessionId: SESSION_ID,
    goal: 'fix the failing test',
    model,
    planTier: 'pro',
    idempotencyKey: 'key-1',
    signal: new AbortController().signal,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ state: 'ready', archivedAt: null, runtimeId: null });
  mocks.resolveProvider.mockImplementation(
    (model) => canonical.find((entry) => entry.id === model)!.provider,
  );
});

describe('AGI Code turns honour the provider-training opt-out', () => {
  it('opens a turn on a model that may train when the account has not opted out', async () => {
    const db = dbFor(false);

    await expect(prepare(db, MAY_TRAIN.id)).resolves.toMatchObject({ turnId: 'turn-1' });
  });

  it('refuses a model that may train for an account that opted out, before opening a turn', async () => {
    const db = dbFor(true);

    await expect(prepare(db, MAY_TRAIN.id)).rejects.toBeInstanceOf(CloudCodeModelMayTrainError);
    expect(db.query.mock.calls.some(([sql]) => sql.includes('cloud_code_agent_turns'))).toBe(false);
  });

  it('refuses a no-training model that would be served through a provider that may train', async () => {
    mocks.resolveProvider.mockReturnValue('openrouter');
    const db = dbFor(true);

    await expect(prepare(db, KEEPS_OUT.id)).rejects.toBeInstanceOf(CloudCodeModelMayTrainError);
  });

  it('refuses when the setting cannot be read', async () => {
    const db = dbFor(new Error('settings unavailable'));

    await expect(prepare(db, MAY_TRAIN.id)).rejects.toBeInstanceOf(CloudCodeModelMayTrainError);
  });

  it('runs a model that keeps inputs out of training without reading the setting', async () => {
    const db = dbFor(true);

    await expect(prepare(db, KEEPS_OUT.id)).resolves.toMatchObject({ turnId: 'turn-1' });
    expect(db.query.mock.calls.some(([sql]) => sql.includes('user_settings'))).toBe(false);
  });
});
