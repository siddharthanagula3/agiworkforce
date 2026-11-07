'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getCsrfToken } from '@/lib/client/csrf';
import type { RequestAuthority } from '@/lib/identity/request-authority';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';

import type { DeveloperWebhookDelivery, DeveloperWebhookEndpoint } from '../types';
import { readDeveloperApiError } from './use-developer-projects';
import { useDeveloperQuery, type DeveloperQueryScope } from './use-developer-query';

const WEBHOOKS_PATH = '/api/developers/webhooks';
export const WEBHOOKS_QUERY_KEY = ['developers', 'webhooks'] as const;
const FIRST_ATTEMPT_POLL_MS = 3000;

export interface WebhookEndpointDraft {
  url: string;
  description: string | null;
  eventTypes: string[];
}

export interface WebhookMutationScope {
  readonly request: RequestAuthority;
  readonly organizationId: string | null;
}

export class WebhookMutationRejectedError extends Error {}

const UNCONFIRMED_RECEIPT = 'The webhook action receipt could not be confirmed.';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function endpointReceipt(value: unknown, expectedId?: string): DeveloperWebhookEndpoint {
  const endpoint = record(record(value)?.endpoint);
  if (
    typeof endpoint?.id !== 'string' ||
    !endpoint.id ||
    (expectedId !== undefined && endpoint.id !== expectedId)
  )
    throw new Error(UNCONFIRMED_RECEIPT);
  return endpoint as unknown as DeveloperWebhookEndpoint;
}

function deliveryReceipt(
  value: unknown,
  redeliveryOf?: string,
): { delivery: DeveloperWebhookDelivery } {
  const delivery = record(record(value)?.delivery);
  if (
    typeof delivery?.id !== 'string' ||
    !delivery.id ||
    (redeliveryOf !== undefined && delivery.redeliveryOf !== redeliveryOf)
  ) {
    throw new Error(UNCONFIRMED_RECEIPT);
  }
  return { delivery: delivery as unknown as DeveloperWebhookDelivery };
}

function endpointPath(endpointId: string): string {
  return `${WEBHOOKS_PATH}/${encodeURIComponent(endpointId)}`;
}

function deliveriesQueryKey(endpointId: string) {
  return [...WEBHOOKS_QUERY_KEY, endpointId, 'deliveries'] as const;
}

async function writeJson(
  scope: WebhookMutationScope,
  url: string,
  init: { method: string; body?: unknown },
  fallback: string,
): Promise<unknown> {
  scope.request.assertCurrent();
  // Snapshot the submitted payload before CSRF/token waits can outlive its editor.
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  const csrfToken = await getCsrfToken();
  scope.request.assertCurrent();
  const response = await scope.request.fetch(url, {
    method: init.method,
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      [MANAGED_CLOUD_ORGANIZATION_HEADER]:
        scope.organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    },
    ...(body === undefined ? {} : { body }),
  });
  if (!response.ok) {
    const message = await readDeveloperApiError(response, fallback);
    scope.request.assertCurrent();
    if (response.status >= 400 && response.status < 500) {
      throw new WebhookMutationRejectedError(message);
    }
    throw new Error(message);
  }
  const payload: unknown = await response.json();
  scope.request.assertCurrent();
  return payload;
}

async function readOwnedJson<T>(
  { request, headers }: DeveloperQueryScope,
  url: string,
  fallback: string,
): Promise<T> {
  const response = await request.fetch(url, { method: 'GET', cache: 'no-store', headers });
  if (!response.ok) throw new Error(await readDeveloperApiError(response, fallback));
  return (await response.json()) as T;
}

export function useWebhookEndpoints() {
  return useDeveloperQuery(
    WEBHOOKS_QUERY_KEY,
    async (scope) =>
      (
        await readOwnedJson<{ endpoints: DeveloperWebhookEndpoint[] }>(
          scope,
          WEBHOOKS_PATH,
          'Webhook endpoints could not be loaded.',
        )
      ).endpoints,
  );
}

export function useCreateWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation<
    { endpoint: DeveloperWebhookEndpoint; secret: string },
    Error,
    { scope: WebhookMutationScope; draft: WebhookEndpointDraft }
  >({
    retry: false,
    // The UI resets its observer when the intent ends. Do not retain once-only
    // secret receipts in an unobserved mutation cache for the default GC period.
    gcTime: 0,
    mutationFn: async ({ scope, draft }) => {
      const payload = await writeJson(
        scope,
        WEBHOOKS_PATH,
        { method: 'POST', body: draft },
        'The endpoint could not be added.',
      );
      scope.request.assertCurrent();
      const endpoint = endpointReceipt(payload);
      const secret = record(payload)?.secret;
      if (typeof secret !== 'string' || !secret) throw new Error(UNCONFIRMED_RECEIPT);
      return { endpoint, secret };
    },
    onSuccess: (_receipt, { scope }) => {
      if (scope.request.isCurrent()) {
        void queryClient.invalidateQueries({ queryKey: WEBHOOKS_QUERY_KEY });
      }
    },
    onError: () => undefined,
  });
}

export function useUpdateWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation<
    DeveloperWebhookEndpoint,
    Error,
    {
      scope: WebhookMutationScope;
      endpointId: string;
      patch: Partial<WebhookEndpointDraft> & { enabled?: boolean };
    }
  >({
    retry: false,
    mutationFn: async ({ scope, endpointId, patch }) => {
      const payload = await writeJson(
        scope,
        endpointPath(endpointId),
        { method: 'PATCH', body: patch },
        'The endpoint could not be saved.',
      );
      scope.request.assertCurrent();
      return endpointReceipt(payload, endpointId);
    },
    onSuccess: (_receipt, { scope }) => {
      if (scope.request.isCurrent()) {
        void queryClient.invalidateQueries({ queryKey: WEBHOOKS_QUERY_KEY });
      }
    },
    onError: () => undefined,
  });
}

export function useDeleteWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation<{ deleted: true }, Error, { scope: WebhookMutationScope; endpointId: string }>(
    {
      retry: false,
      mutationFn: async ({ scope, endpointId }) => {
        const payload = await writeJson(
          scope,
          endpointPath(endpointId),
          { method: 'DELETE' },
          'The endpoint could not be removed.',
        );
        scope.request.assertCurrent();
        if (record(payload)?.deleted !== true) throw new Error(UNCONFIRMED_RECEIPT);
        return { deleted: true };
      },
      onSuccess: (_receipt, { scope }) => {
        if (scope.request.isCurrent()) {
          void queryClient.invalidateQueries({ queryKey: WEBHOOKS_QUERY_KEY });
        }
      },
      onError: () => undefined,
    },
  );
}

export function useWebhookDeliveries(endpointId: string, enabled: boolean) {
  return useDeveloperQuery(
    deliveriesQueryKey(endpointId),
    async (scope) =>
      (
        await readOwnedJson<{ deliveries: DeveloperWebhookDelivery[] }>(
          scope,
          `${endpointPath(endpointId)}/deliveries`,
          'Deliveries could not be loaded.',
        )
      ).deliveries,
    {
      enabled: enabled && endpointId.trim().length > 0,
      refetchInterval: (data) =>
        data?.some((delivery) => delivery.status === 'pending' && delivery.attempts === 0)
          ? FIRST_ATTEMPT_POLL_MS
          : false,
    },
  );
}

export function useSendWebhookTest() {
  const queryClient = useQueryClient();
  return useMutation<
    { delivery: DeveloperWebhookDelivery },
    Error,
    { scope: WebhookMutationScope; endpointId: string }
  >({
    retry: false,
    mutationFn: async ({ scope, endpointId }) => {
      const payload = await writeJson(
        scope,
        `${endpointPath(endpointId)}/test`,
        { method: 'POST' },
        'The test event could not be sent.',
      );
      scope.request.assertCurrent();
      return deliveryReceipt(payload);
    },
    onSuccess: (_receipt, { scope, endpointId }) => {
      if (scope.request.isCurrent()) {
        void queryClient.invalidateQueries({ queryKey: deliveriesQueryKey(endpointId) });
      }
    },
    onError: () => undefined,
  });
}

export function useRedeliverWebhook() {
  const queryClient = useQueryClient();
  return useMutation<
    { delivery: DeveloperWebhookDelivery },
    Error,
    { scope: WebhookMutationScope; endpointId: string; deliveryId: string }
  >({
    retry: false,
    mutationFn: async ({ scope, endpointId, deliveryId }) => {
      const payload = await writeJson(
        scope,
        `${endpointPath(endpointId)}/deliveries/${encodeURIComponent(deliveryId)}/redeliver`,
        { method: 'POST' },
        'The event could not be sent again.',
      );
      scope.request.assertCurrent();
      return deliveryReceipt(payload, deliveryId);
    },
    onSuccess: (_receipt, { scope, endpointId }) => {
      if (scope.request.isCurrent()) {
        void queryClient.invalidateQueries({ queryKey: deliveriesQueryKey(endpointId) });
      }
    },
    onError: () => undefined,
  });
}
