import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { toast } from 'sonner';
import { SonnerToaster } from '../SonnerToaster';

describe('SonnerToaster', () => {
  it('renders without crashing', () => {
    const { container } = render(<SonnerToaster theme="dark" />);
    expect(container).toBeTruthy();
  });

  it('renders an active toast with the injected theme applied', async () => {
    const { findByText, container } = render(<SonnerToaster theme="dark" />);
    toast('Hello from sonner');
    expect(await findByText('Hello from sonner')).toBeTruthy();
    expect(
      container.querySelector('[data-sonner-toaster]')?.getAttribute('data-sonner-theme'),
    ).toBe('dark');
  });
});
