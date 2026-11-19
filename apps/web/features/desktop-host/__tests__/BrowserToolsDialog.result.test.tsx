import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { BrowserPairingState } from '@agiworkforce/local-runtime-contract';

const readPairedPage = vi.fn();
const listPairedTabs = vi.fn();
const capturePairedBrowser = vi.fn();
const readBrowserPairing = vi.fn();
const readBrowserActivity = vi.fn(async () => []);

vi.mock('../lib/runtime-client', async (importOriginal) => {
  const actual = await importOriginal<ImportedModule0>();
  return {
    ...actual,
    readPairedPage,
    listPairedTabs,
    capturePairedBrowser,
    readBrowserPairing,
    readBrowserActivity,
  };
});

const { BrowserToolsDialog } = await import('../components/BrowserToolsDialog');

const PAIRED: BrowserPairingState = {
  bridgePort: 47811,
  bridgeListening: true,
  paired: true,
  extensionId: 'a'.repeat(32),
  fingerprint: null,
  pairedAtMs: null,
  connected: true,
  hostInstalled: true,
  installedManifestPaths: [],
  pendingRequest: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const PAGE_A = { title: 'Page A', url: 'https://a.example/', text: 'alpha' };

function renderDialog(open = true) {
  const props = { onClose: vi.fn(), onAttach: vi.fn() };
  const view = render(<BrowserToolsDialog open={open} {...props} />);
  return {
    ...props,
    rerender: (next: boolean) => view.rerender(<BrowserToolsDialog open={next} {...props} />),
  };
}

async function startRead() {
  fireEvent.click(await screen.findByRole('button', { name: 'Run' }));
}

async function pickTabB() {
  fireEvent.click(await screen.findByRole('button', { name: 'Choose a tab' }));
  const select = await screen.findByRole('combobox');
  fireEvent.change(select, { target: { value: '2' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  readBrowserPairing.mockResolvedValue(PAIRED);
  listPairedTabs.mockResolvedValue([
    { tabId: 1, title: 'Page A', url: 'https://a.example/' },
    { tabId: 2, title: 'Page B', url: 'https://b.example/' },
  ]);
});

describe('BrowserToolsDialog result ownership', () => {
  it('shows a read that finishes while its view is still current', async () => {
    readPairedPage.mockResolvedValue(PAGE_A);
    renderDialog();

    await startRead();

    expect(await screen.findByLabelText('Browser result')).toHaveTextContent('alpha');
    expect(screen.getByRole('button', { name: 'Add to chat' })).toBeInTheDocument();
  });

  it('drops a read that finishes after another tab was chosen', async () => {
    const pending = deferred<typeof PAGE_A>();
    readPairedPage.mockReturnValue(pending.promise);
    renderDialog();

    await startRead();
    await pickTabB();
    await act(async () => {
      pending.resolve(PAGE_A);
    });

    expect(screen.queryByLabelText('Browser result')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to chat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  it('drops a read that finishes after the action changed', async () => {
    const pending = deferred<typeof PAGE_A>();
    readPairedPage.mockReturnValue(pending.promise);
    renderDialog();

    await startRead();
    fireEvent.click(screen.getByRole('button', { name: 'Screenshot' }));
    await act(async () => {
      pending.resolve(PAGE_A);
    });

    expect(screen.queryByLabelText('Browser result')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to chat' })).not.toBeInTheDocument();
  });

  it('drops a read that finishes after the dialog was closed and reopened', async () => {
    const pending = deferred<typeof PAGE_A>();
    readPairedPage.mockReturnValue(pending.promise);
    const dialog = renderDialog();

    await startRead();
    dialog.rerender(false);
    dialog.rerender(true);
    await act(async () => {
      pending.resolve(PAGE_A);
    });

    expect(screen.queryByLabelText('Browser result')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to chat' })).not.toBeInTheDocument();
  });

  it('drops a failure from a retired read', async () => {
    const pending = deferred<typeof PAGE_A>();
    readPairedPage.mockReturnValue(pending.promise);
    renderDialog();

    await startRead();
    fireEvent.click(screen.getByRole('button', { name: 'Screenshot' }));
    await act(async () => {
      pending.reject(new Error('page is gone'));
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

type ImportedModule0 = typeof import('../lib/runtime-client');
