import { MANAGED_MEMORY_MAX_PAGE_SIZE } from '@agiworkforce/types';
import { CLOUD_API_BASE_URL } from './cloudApi';
import {
  createManagedCloudRequestContext,
  type ManagedCloudRequestContext,
} from '../services/managedCloudRequestContext';

export interface CloudMemoryFact {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

function parseMemoryFact(value: unknown): CloudMemoryFact | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row['id'] !== 'string' ||
    typeof row['content'] !== 'string' ||
    typeof row['createdAt'] !== 'string' ||
    typeof row['updatedAt'] !== 'string'
  ) {
    return null;
  }
  return {
    id: row['id'],
    text: row['content'],
    createdAt: row['createdAt'],
    updatedAt: row['updatedAt'],
  };
}

function errorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const error = (payload as Record<string, unknown>)['error'];
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const message = (error as Record<string, unknown>)['message'];
    return typeof message === 'string' ? message : null;
  }
  const message = (payload as Record<string, unknown>)['message'];
  return typeof message === 'string' ? message : null;
}

async function request(
  path: string,
  init: RequestInit,
  context: ManagedCloudRequestContext,
): Promise<Response> {
  const response = await context.fetch(`${CLOUD_API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(await context.getHeaders()),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    context.assertBoundary();
    const message = errorMessage(payload);
    throw new Error(message ?? `Cloud memory request failed: HTTP ${response.status}`);
  }
  return response;
}

export async function listCloudMemories(): Promise<CloudMemoryFact[]> {
  const context = createManagedCloudRequestContext('Cloud memory');
  const result: CloudMemoryFact[] = [];
  let offset = 0;
  do {
    const response = await request(
      `/api/memory?limit=${MANAGED_MEMORY_MAX_PAGE_SIZE}&offset=${offset}`,
      { method: 'GET' },
      context,
    );
    const payload: unknown = await response.json();
    context.assertBoundary();
    const body =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null;
    const rows = body?.['memories'];
    if (!Array.isArray(rows)) throw new Error('Cloud memory returned an invalid list.');
    if (body && 'hasMore' in body && typeof body['hasMore'] !== 'boolean') {
      throw new Error('Cloud memory returned invalid continuation metadata.');
    }
    const page = rows.map(parseMemoryFact).filter((fact): fact is CloudMemoryFact => fact !== null);
    if (page.length !== rows.length) throw new Error('Cloud memory returned an invalid entry.');
    result.push(...page);
    const hasMore = body?.['hasMore'] ?? rows.length >= MANAGED_MEMORY_MAX_PAGE_SIZE;
    if (!hasMore) return result;
    if (rows.length === 0) break;
    offset += rows.length;
  } while (offset <= 10_000);
  throw new Error('The complete cloud memory list could not be loaded.');
}

export async function createCloudMemory(text: string): Promise<CloudMemoryFact> {
  const context = createManagedCloudRequestContext('Cloud memory creation');
  const response = await request(
    '/api/memory',
    {
      method: 'POST',
      body: JSON.stringify({ content: text, source: 'desktop' }),
    },
    context,
  );
  const payload: unknown = await response.json();
  context.assertBoundary();
  const fact =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? parseMemoryFact((payload as Record<string, unknown>)['memory'])
      : null;
  if (!fact) throw new Error('Cloud memory returned an invalid created entry.');
  return fact;
}

export async function updateCloudMemory(id: string, text: string): Promise<CloudMemoryFact> {
  const context = createManagedCloudRequestContext('Cloud memory update');
  const response = await request(
    `/api/memory/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ content: text }),
    },
    context,
  );
  const payload: unknown = await response.json();
  context.assertBoundary();
  const fact =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? parseMemoryFact((payload as Record<string, unknown>)['memory'])
      : null;
  if (!fact) throw new Error('Cloud memory returned an invalid updated entry.');
  return fact;
}

export async function deleteCloudMemory(id: string): Promise<void> {
  const context = createManagedCloudRequestContext('Cloud memory deletion');
  await request(`/api/memory/${encodeURIComponent(id)}`, { method: 'DELETE' }, context);
  context.assertBoundary();
}
