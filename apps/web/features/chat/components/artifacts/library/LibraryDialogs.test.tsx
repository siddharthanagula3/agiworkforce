import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
  getCsrfToken: vi.fn(async () => 't'),
}));

const { BrandKitDialog, LibraryManagerDialog, SaveTemplateDialog } =
  await import('./LibraryDialogs');
const { NewArtifactMenu } = await import('../templates/NewArtifactMenu');
const { resetStudioLibrary } = await import('./studio-library-client');
const { useArtifactsStore } = await import('../../../stores/artifacts-store');

let server: Array<Record<string, unknown>> = [];
const requests: Array<{ method: string; body: unknown }> = [];

beforeEach(() => {
  server = [];
  requests.length = 0;
  resetStudioLibrary();
  useArtifactsStore.getState().reset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method, body });
      if (method === 'GET') return new Response(JSON.stringify({ items: server }));
      if (method === 'POST') {
        const item = {
          id: `00000000-0000-4000-8000-00000000000${server.length + 1}`,
          createdAt: 'now',
          ...body,
        };
        server.push(item);
        return new Response(JSON.stringify({ item }), { status: 201 });
      }
      const id = String(input).split('/').pop();
      server = server.filter((item) => item['id'] !== id);
      return new Response(null, { status: 204 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('templates and brands', () => {
  it('saves the open deck as a template', async () => {
    render(
      <SaveTemplateDialog
        open
        onOpenChange={vi.fn()}
        kind="deck_template"
        defaultName="Board deck"
        title="Board deck"
        content="# Board"
      />,
    );
    fireEvent.click(screen.getByTestId('save-template-submit'));
    await waitFor(() => expect(requests.find((r) => r.method === 'POST')).toBeTruthy());
    expect(requests.find((r) => r.method === 'POST')!.body).toEqual({
      kind: 'deck_template',
      name: 'Board deck',
      payload: { title: 'Board deck', content: '# Board' },
    });
  });

  it('warns when a brand text colour is unreadable and still saves the brand', async () => {
    const onSaved = vi.fn();
    render(<BrandKitDialog open onOpenChange={vi.fn()} onSaved={onSaved} />);
    const dialog = screen.getByTestId('brand-kit-dialog');
    fireEvent.change(within(dialog).getByLabelText('Brand name'), { target: { value: 'Acme' } });
    fireEvent.change(within(dialog).getByLabelText('text'), { target: { value: '#fafafa' } });
    expect(within(dialog).getByRole('status')).toHaveTextContent('too faint');
    fireEvent.click(within(dialog).getByTestId('brand-kit-submit'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(requests.find((r) => r.method === 'POST')!.body).toMatchObject({
      kind: 'brand',
      name: 'Acme',
      payload: { text: '#fafafa', headingFont: 'sans' },
    });
  });

  it('starts a document from a saved template in the New menu', async () => {
    server = [
      {
        id: 'a0000000-0000-4000-8000-000000000001',
        kind: 'document_template',
        name: 'Our memo',
        payload: { title: 'Memo', content: '# Memo\n\nBody' },
        createdAt: 'x',
      },
    ];
    render(<NewArtifactMenu conversationId="3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a99" />);
    fireEvent.click(screen.getByTestId('artifact-new-menu'));
    const saved = await screen.findByTestId(
      'deck-menu-template-saved-a0000000-0000-4000-8000-000000000001',
    );
    fireEvent.click(saved);
    expect(useArtifactsStore.getState().artifacts[0]).toMatchObject({
      type: 'document',
      title: 'Memo',
    });
  });

  it('deletes a saved item only after confirming', async () => {
    server = [
      {
        id: 'b0000000-0000-4000-8000-000000000002',
        kind: 'brand',
        name: 'Acme',
        payload: {},
        createdAt: 'x',
      },
    ];
    render(<LibraryManagerDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Acme' }));
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false);
    const confirm = await screen
      .findByRole('alertdialog')
      .catch(() => screen.getAllByRole('dialog').at(-1)!);
    expect(confirm).toHaveTextContent('for good');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(requests.some((r) => r.method === 'DELETE')).toBe(true));
  });
});
