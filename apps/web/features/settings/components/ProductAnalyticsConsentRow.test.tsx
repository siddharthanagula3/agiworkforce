import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductAnalyticsConsentRow } from './ProductAnalyticsConsentRow';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('product analytics choice loading', () => {
  it('announces loading until the privacy choice is available', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
    );
    render(<ProductAnalyticsConsentRow />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your product analytics choice');
    expect(screen.getByRole('switch')).toBeDisabled();
    finish(new Response(JSON.stringify({ noticeVersion: 'test-version' }), { status: 200 }));
    expect(await screen.findByRole('switch')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('clears loading and keeps the choice disabled after a read failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    render(<ProductAnalyticsConsentRow />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your product analytics choice could not be loaded.',
    );
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
