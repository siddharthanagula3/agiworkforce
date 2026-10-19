'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  STUDIO_LIBRARY_PATH,
  studioLibraryItemPath,
  type StudioLibraryBrandPayload,
  type StudioLibraryKind,
  type StudioLibraryTemplatePayload,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';

export type { StudioLibraryKind };
export type TemplatePayload = StudioLibraryTemplatePayload;
export type BrandPayload = StudioLibraryBrandPayload;

export type StudioLibraryItem =
  | {
      id: string;
      kind: 'document_template' | 'deck_template';
      name: string;
      payload: TemplatePayload;
      createdAt: string;
    }
  | { id: string; kind: 'brand'; name: string; payload: BrandPayload; createdAt: string };

type LibraryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; items: StudioLibraryItem[] }
  | { status: 'failed' };

const IDLE: LibraryState = { status: 'idle' };
let state: LibraryState = IDLE;
const listeners = new Set<() => void>();

function write(next: LibraryState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function items(): StudioLibraryItem[] {
  return state.status === 'ready' ? state.items : [];
}

async function failure(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string | { message?: string };
  };
  const message = typeof body.error === 'string' ? body.error : body.error?.message;
  return new Error(message || fallback);
}

export async function loadStudioLibrary(force = false): Promise<void> {
  if (state.status === 'loading' || (state.status === 'ready' && !force)) return;
  write({ status: 'loading' });
  try {
    const response = await fetch(STUDIO_LIBRARY_PATH, { credentials: 'include' });
    if (!response.ok) throw await failure(response, 'Your templates could not be loaded');
    const body = (await response.json()) as { items?: StudioLibraryItem[] };
    write({ status: 'ready', items: Array.isArray(body.items) ? body.items : [] });
  } catch {
    write({ status: 'failed' });
  }
}

export async function saveStudioLibraryItem(
  input: Omit<StudioLibraryItem, 'id' | 'createdAt'>,
): Promise<StudioLibraryItem> {
  const response = await fetch(STUDIO_LIBRARY_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await failure(response, 'That was not saved');
  const item = ((await response.json()) as { item: StudioLibraryItem }).item;
  write({ status: 'ready', items: [item, ...items()] });
  return item;
}

export async function deleteStudioLibraryItem(id: string): Promise<void> {
  const response = await fetch(studioLibraryItemPath(id), {
    method: 'DELETE',
    credentials: 'include',
    headers: await addCsrfHeaders(),
  });
  if (!response.ok) throw await failure(response, 'That was not deleted');
  write({ status: 'ready', items: items().filter((item) => item.id !== id) });
}

export function resetStudioLibrary(): void {
  write(IDLE);
}

export function useStudioLibrary() {
  const current = useSyncExternalStore(
    useCallback((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }, []),
    () => state,
    () => IDLE,
  );
  return {
    state: current,
    items: current.status === 'ready' ? current.items : [],
    load: loadStudioLibrary,
  };
}
