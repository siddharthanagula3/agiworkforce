import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FreeQuotaModelSection } from './FreeQuotaModelSection';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Free section in the composer', () => {
  it('selects an exact model and disables unavailable quota entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              {
                key: 'fixture-free',
                displayName: 'Example Flash',
                category: 'chat',
                expiresOn: '2026-11-25',
                status: 'account_check_required',
              },
              {
                key: 'fixture-exhausted',
                displayName: 'Exhausted Example',
                category: 'chat',
                status: 'exhausted',
              },
              {
                key: 'fixture-expired',
                displayName: 'Expired Example',
                category: 'chat',
                status: 'expired',
              },
              {
                key: 'fixture-media',
                displayName: 'Example image',
                category: 'image',
                status: 'account_check_required',
              },
            ],
          }),
        ),
      ),
    );
    const select = vi.fn();
    render(<FreeQuotaModelSection enabled selectedId="fixture-free" onSelect={select} />);
    expect(screen.getByRole('button', { name: 'Free' })).toHaveAttribute('aria-expanded', 'true');
    const free = await screen.findByRole('button', { name: /Example Flash/ });
    expect(free).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(free);
    expect(select).toHaveBeenCalledWith('fixture-free');
    expect(screen.getByRole('button', { name: /Expired Example/ })).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: /Exhausted Example Free quota exhausted · Choose another model/,
      }),
    ).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'image' } });
    fireEvent.click(screen.getByRole('button', { name: /Example image/ }));
    expect(select).toHaveBeenLastCalledWith('fixture-media');
  });

  it('does not fetch while the selector is closed', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(<FreeQuotaModelSection enabled={false} selectedId="auto" onSelect={vi.fn()} />);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
