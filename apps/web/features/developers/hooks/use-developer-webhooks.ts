'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { sendAuthorizedJson } from '@features/auth/step-up-fetch';

import type { DeveloperWebhookDelivery, DeveloperWebhookEndpoint } from '../types';
import { readDeveloperApiError } from './use-developer-projects';

const WEBHOOKS_PATH = '/api/developers/webhooks';
const WEBHOOKS_QUERY_KEY = ['developers', 'webhooks'] as const;
const FIRST_ATTEMPT_POLL_MS = 3000;

export interface WebhookEndpointDraft {
  url: string;
  description: string | null;
  eventTypes: string[];
}

function endpointPath(endpointId: string): string {
  return `${WEBHOOKS_PATH}/${encodeURIComponent(endpointId)}`;
}

function deliveriesQueryKey(endpointId: string) {
  return [...WEBHOOKS_QUERY_KEY, endpointId, 'deliveries'] as const;
}

async function readJson<T>(
  url: string,
  init: { method: string; body?: unknown },
  fallback: string,
): Promise<T> {
  const response = await sendAuthorizedJson(url, init);
  if (!response.ok) throw new Error(await readDeveloperApiError(response, fallback));
  return (await response.json()) as T;
}

export function useWebhookEndpoints() {
  return useQuery<DeveloperWebhookEndpoint[], Error>({
    queryKey: WEBHOOKS_QUERY_KEY,
    queryFn: async () =>
      (
        await readJson<{ endpoints: DeveloperWebhookEndpoint[] }>(
          WEBHOOKS_PATH,
          { method: 'GET' },
          'Webhook endpoints could not be loaded.',
        )
      ).endpoints,
  });
}

export function useCreateWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation<
    { endpoint: DeveloperWebhookEndpoint; secret: string },
    Error,
    WebhookEndpointDraft
  >({
    mutationFn: (draft) =>
      readJson(WEBHOOKS_PATH, { method: 'POST', body: draft }, 'The endpoint could not be added.'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WEBHOOKS_QUERY_KEY }),
  });
}

export function useUpdateWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation<
    DeveloperWebhookEndpoint,
    Error,
    { endpointId: string; patch: Partial<WebhookEndpointDraft> & { enabled?: boolean } }
  >({
    mutationFn: async ({ endpointId, patch }) =>
      (
        await readJson<{ endpoint: DeveloperWebhookEndpoint }>(
          endpointPath(endpointId),
          { method: 'PATCH', body: patch },
          'The endpoint could not be saved.',
        )
      ).endpoint,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WEBHOOKS_QUERY_KEY }),
  });
}

export function useDeleteWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (endpointId) =>
      readJson(
        endpointPath(endpointId),
        { method: 'DELETE' },
        'The endpoint could not be removed.',
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WEBHOOKS_QUERY_KEY }),
  });
}

export function useWebhookDeliveries(endpointId: string, enabled: boolean) {
  return useQuery<DeveloperWebhookDelivery[], Error>({
    queryKey: deliveriesQueryKey(endpointId),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.some((delivery) => delivery.status === 'pending' && delivery.attempts === 0)
        ? FIRST_ATTEMPT_POLL_MS
        : false,
    queryFn: async () =>
      (
        await readJson<{ deliveries: DeveloperWebhookDelivery[] }>(
          `${endpointPath(endpointId)}/deliveries`,
          { method: 'GET' },
          'Deliveries could not be loaded.',
        )
      ).deliveries,
  });
}

export function useSendWebhookTest(endpointId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ delivery: DeveloperWebhookDelivery }, Error, void>({
    mutationFn: () =>
      readJson(
        `${endpointPath(endpointId)}/test`,
        { method: 'POST' },
        'The test event could not be sent.',
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveriesQueryKey(endpointId) }),
  });
}

export function useRedeliverWebhook(endpointId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ delivery: DeveloperWebhookDelivery }, Error, string>({
    mutationFn: (deliveryId) =>
      readJson(
        `${endpointPath(endpointId)}/deliveries/${encodeURIComponent(deliveryId)}/redeliver`,
        { method: 'POST' },
        'The event could not be sent again.',
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveriesQueryKey(endpointId) }),
  });
}
