import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf') }));

import { createSecurityScanApi } from './security-scan-api';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function apiWithReply() {
  const fetchImpl = vi.fn(async () => Response.json({ report: { status: 'completed' } }));
  const api = createSecurityScanApi({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    getCsrfToken: async () => 'csrf',
  });
  const bodyOfLastCall = () =>
    JSON.parse((fetchImpl.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string);
  return { api, bodyOfLastCall };
}

describe('starting a scan', () => {
  it('sends consent alone when no scope, model or effort is chosen', async () => {
    const { api, bodyOfLastCall } = apiWithReply();
    await api.scan(SESSION_ID, { scope: null, model: null, effort: null });
    expect(bodyOfLastCall()).toEqual({ consent: true });
  });

  it('sends the scope, the model and an effort for that model', async () => {
    const { api, bodyOfLastCall } = apiWithReply();
    await api.scan(SESSION_ID, { scope: 'src', model: 'model-one', effort: 'high' });
    expect(bodyOfLastCall()).toEqual({
      consent: true,
      scope: 'src',
      model: 'model-one',
      effort: 'high',
    });
  });

  it('never sends an effort without a model', async () => {
    const { api, bodyOfLastCall } = apiWithReply();
    await api.scan(SESSION_ID, { scope: null, model: null, effort: 'high' });
    expect(bodyOfLastCall()).toEqual({ consent: true });
  });
});
