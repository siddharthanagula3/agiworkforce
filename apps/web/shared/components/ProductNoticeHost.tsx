'use client';

import { useSyncExternalStore } from 'react';

let host: HTMLElement | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setHost(next: HTMLElement | null): void {
  host = next;
  listeners.forEach((listener) => listener());
}

function attachHost(element: HTMLDivElement | null) {
  if (!element) return;
  setHost(element);
  return () => {
    if (host === element) setHost(null);
  };
}

export function useProductNoticeHost(): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => host,
    () => null,
  );
}

export function ProductNoticeHost() {
  return <div ref={attachHost} className="contents" />;
}
