/**
 * Test utilities for React component testing
 * Provides custom render function with providers and helpers
 */

import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

interface AllTheProvidersProps {
  children: React.ReactNode;
}

function AllTheProviders({ children }: AllTheProvidersProps) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: AllTheProviders, ...options });

// Re-export everything except render from @testing-library/react
export { screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react';
export { customRender as render };

// Helper to wait for async state updates
export const waitForNextUpdate = () => new Promise((resolve) => setTimeout(resolve, 0));

// Helper to create mock Tauri invoke responses
export function createMockInvokeResponse<T>(data: T) {
  return vi.fn().mockResolvedValue(data);
}

// Helper to create mock Tauri event listener
export function createMockEventListener() {
  const listeners = new Map<string, Set<(data: any) => void>>();

  return {
    listen: vi.fn((event: string, handler: (data: any) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
      return Promise.resolve(() => {
        listeners.get(event)?.delete(handler);
      });
    }),
    emit: vi.fn((event: string, data: any) => {
      listeners.get(event)?.forEach((handler) => handler(data));
      return Promise.resolve();
    }),
    clear: () => {
      listeners.clear();
    },
  };
}
