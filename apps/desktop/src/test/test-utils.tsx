import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, type MockInstance } from 'vitest';

interface AllTheProvidersProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: any;
}

function AllTheProviders({ children }: AllTheProvidersProps) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): ReturnType<typeof render> => render(ui, { wrapper: AllTheProviders, ...options });

export { screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react';
export { customRender as render };

export const waitForNextUpdate = () => new Promise((resolve) => setTimeout(resolve, 0));

export function createMockInvokeResponse<T>(data: T): MockInstance<() => Promise<T>> {
  return vi.fn().mockResolvedValue(data);
}

export function createMockEventListener() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock: event data can be anything
  const listeners = new Map<string, Set<(data: any) => void>>();

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock: event handler
    listen: vi.fn((event: string, handler: (data: any) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
      return Promise.resolve(() => {
        listeners.get(event)?.delete(handler);
      });
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock: event data
    emit: vi.fn((event: string, data: any) => {
      listeners.get(event)?.forEach((handler) => handler(data));
      return Promise.resolve();
    }),
    clear: () => {
      listeners.clear();
    },
  };
}
