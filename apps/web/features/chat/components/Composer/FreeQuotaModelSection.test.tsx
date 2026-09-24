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
                status: 'ready',
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
                key: 'fixture-withheld',
                displayName: 'Withheld Example',
                category: 'chat',
                status: 'unavailable',
              },
              {
                key: 'fixture-media',
                displayName: 'Example image',
                category: 'image',
                status: 'ready',
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
    expect(screen.queryByText(/Promotional chat routes support text only/)).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Text chat' })).toBeInTheDocument();
    expect(free).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(free);
    expect(select).toHaveBeenCalledWith('fixture-free');
    expect(screen.getByRole('button', { name: /Expired Example/ })).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: /Exhausted Example Free quota exhausted · Choose another model/,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Withheld Example Not available right now/ }),
    ).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'image' } });
    const image = screen.getByRole('button', { name: /Example image/ });
    expect(image).toHaveTextContent('Free quota · images');
    expect(image).not.toHaveTextContent('text chat');
    fireEvent.click(image);
    expect(select).toHaveBeenLastCalledWith('fixture-media');
  });

  it('links to data-use details without putting the long disclosure in the model picker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              models: [
                {
                  key: 'fixture-experiential',
                  displayName: 'Example Free',
                  category: 'chat',
                  status: 'ready',
                },
              ],
            }),
          ),
      ),
    );

    render(<FreeQuotaModelSection enabled selectedId="auto" onSelect={vi.fn()} />);

    expect(await screen.findByRole('link', { name: 'Data use' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.queryByText(/Experiential Labs captures prompts/)).not.toBeInTheDocument();
  });

  it('does not fetch while the selector is closed', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(<FreeQuotaModelSection enabled={false} selectedId="auto" onSelect={vi.fn()} />);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not offer media categories when a Free account only receives chat offerings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              {
                key: 'fixture-chat',
                displayName: 'Example Chat',
                category: 'chat',
                status: 'ready',
              },
            ],
          }),
        ),
      ),
    );

    render(<FreeQuotaModelSection enabled selectedId="auto" onSelect={vi.fn()} />);

    expect(await screen.findByRole('button', { name: /Example Chat/ })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Free model category' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Image and video offerings generate media/)).not.toBeInTheDocument();
  });

  it('shows the first permitted media category immediately when chat is not available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              {
                key: 'fixture-image',
                displayName: 'Example Image',
                category: 'image',
                status: 'ready',
              },
            ],
          }),
        ),
      ),
    );

    render(<FreeQuotaModelSection enabled selectedId="auto" onSelect={vi.fn()} />);

    expect(await screen.findByRole('button', { name: /Example Image/ })).toBeInTheDocument();
    expect(screen.queryByText('No free models match.')).not.toBeInTheDocument();
  });
});
