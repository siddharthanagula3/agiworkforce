import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LinkedBanks } from './LinkedBanks';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('linked bank response states', () => {
  it('shows an empty result only after a successful bank listing', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
    );
    render(<LinkedBanks onChanged={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your linked banks');
    expect(screen.queryByText('No banks linked yet.')).not.toBeInTheDocument();
    finish(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    expect(await screen.findByText('No banks linked yet.')).toBeInTheDocument();
    expect(screen.queryByText('Loading your linked banks')).not.toBeInTheDocument();
  });

  it('does not describe an unavailable listing as an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    render(<LinkedBanks onChanged={vi.fn()} />);
    expect(await screen.findByText('Your linked banks could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('No banks linked yet.')).not.toBeInTheDocument();
  });
});
