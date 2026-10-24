import { render } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/marketing/components/WaitlistModal', () => ({
  WaitlistModalProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import Providers from '../Providers';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }),
});

describe('Providers toaster', () => {
  it('opens toasts below the 48px app header so they never cover the conversation title', async () => {
    const { container, findByText } = render(<Providers>{null}</Providers>);
    toast.info('Our Terms of Service were updated.');
    await findByText('Our Terms of Service were updated.');

    const toaster = container.ownerDocument.querySelector<HTMLElement>('[data-sonner-toaster]');
    expect(toaster?.getAttribute('data-y-position')).toBe('top');
    expect(toaster?.style.getPropertyValue('--offset-top')).toBe('56px');
    expect(toaster?.style.getPropertyValue('--mobile-offset-top')).toBe('56px');
  });
});
