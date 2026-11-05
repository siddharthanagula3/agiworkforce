import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@features/auth/step-up-fetch', () => ({ sendAuthorizedJson: vi.fn() }));

import { sendAuthorizedJson } from '@features/auth/step-up-fetch';
import {
  useArchiveDeveloperProject,
  useCreateDeveloperProject,
  useUpdateDeveloperProject,
} from '../hooks/use-developer-projects';
import {
  useCreateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useRedeliverWebhook,
  useSendWebhookTest,
  useUpdateWebhookEndpoint,
} from '../hooks/use-developer-webhooks';

const project = {
  id: 'project-id',
  name: 'Project',
  monthlyCreditLimit: null,
  archivedAt: null,
  createdAt: '2026-11-05T00:00:00.000Z',
};
const endpoint = {
  id: 'endpoint-id',
  url: 'https://example.com/webhook',
  description: null,
  eventTypes: ['api_key.created'],
  secretPrefix: 'prefix',
  enabled: true,
  createdAt: '2026-11-05T00:00:00.000Z',
};
const delivery = { id: 'delivery-id' };

const operations = [
  {
    name: 'create project',
    response: { project },
    invalidations: 1,
    useAttempt() {
      const mutation = useCreateDeveloperProject();
      return () => mutation.mutateAsync({ name: 'Project', monthlyCreditLimit: null });
    },
  },
  {
    name: 'update project',
    response: { project },
    invalidations: 1,
    useAttempt() {
      const mutation = useUpdateDeveloperProject();
      return () => mutation.mutateAsync({ projectId: project.id, patch: { name: 'Renamed' } });
    },
  },
  {
    name: 'archive project',
    response: { project },
    invalidations: 2,
    useAttempt() {
      const mutation = useArchiveDeveloperProject();
      return () => mutation.mutateAsync(project.id);
    },
  },
  {
    name: 'create endpoint',
    response: { endpoint, secret: 'fixture-only-signing-secret' },
    invalidations: 1,
    useAttempt() {
      const mutation = useCreateWebhookEndpoint();
      return () => mutation.mutateAsync({
        url: endpoint.url,
        description: null,
        eventTypes: endpoint.eventTypes,
      });
    },
  },
  {
    name: 'update endpoint',
    response: { endpoint },
    invalidations: 1,
    useAttempt() {
      const mutation = useUpdateWebhookEndpoint();
      return () => mutation.mutateAsync({ endpointId: endpoint.id, patch: { enabled: false } });
    },
  },
  {
    name: 'delete endpoint',
    response: { deleted: true },
    invalidations: 1,
    useAttempt() {
      const mutation = useDeleteWebhookEndpoint();
      return () => mutation.mutateAsync(endpoint.id);
    },
  },
  {
    name: 'send test event',
    response: { delivery },
    invalidations: 1,
    useAttempt() {
      const mutation = useSendWebhookTest(endpoint.id);
      return () => mutation.mutateAsync();
    },
  },
  {
    name: 'redeliver event',
    response: { delivery },
    invalidations: 1,
    useAttempt() {
      const mutation = useRedeliverWebhook(endpoint.id);
      return () => mutation.mutateAsync(delivery.id);
    },
  },
];

beforeEach(() => {
  vi.mocked(sendAuthorizedJson).mockReset();
});

describe.each(operations)('$name', ({ useAttempt, response, invalidations }) => {
  function mount() {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: 1, retryDelay: 0 } },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const hook = renderHook(() => useAttempt(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    return { ...hook, client, invalidate };
  }

  it.each(['transport', 'response body'] as const)(
    'does not repeat a mutation after an uncertain %s failure',
    async (failure) => {
      const lostResponse = new Error('The server outcome is unknown');
      if (failure === 'transport') {
        vi.mocked(sendAuthorizedJson).mockRejectedValue(lostResponse);
      } else {
        vi.mocked(sendAuthorizedJson).mockImplementation(async () => {
          const result = new Response('{}', { status: 200 });
          vi.spyOn(result, 'json').mockRejectedValue(lostResponse);
          return result;
        });
      }
      const { result, unmount, client, invalidate } = mount();
      try {
        await act(async () => {
          await expect(result.current()).rejects.toBe(lostResponse);
        });
        expect(sendAuthorizedJson).toHaveBeenCalledTimes(1);
        expect(invalidate).not.toHaveBeenCalled();
      } finally {
        unmount();
        client.clear();
      }
    },
  );

  it('keeps successful cache invalidation and deliberate subsequent actions', async () => {
    vi.mocked(sendAuthorizedJson).mockImplementation(async () =>
      Response.json(response),
    );
    const { result, unmount, client, invalidate } = mount();
    try {
      await act(async () => { await result.current(); });
      expect(sendAuthorizedJson).toHaveBeenCalledTimes(1);
      expect(invalidate).toHaveBeenCalledTimes(invalidations);
      await act(async () => { await result.current(); });
      expect(sendAuthorizedJson).toHaveBeenCalledTimes(2);
      expect(invalidate).toHaveBeenCalledTimes(invalidations * 2);
    } finally {
      unmount();
      client.clear();
    }
  });
});
