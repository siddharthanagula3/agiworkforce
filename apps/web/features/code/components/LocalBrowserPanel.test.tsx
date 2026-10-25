import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSED_BROWSER_PANE, type BrowserPaneState } from '@agiworkforce/local-runtime-contract';
type DesktopHost = typeof import('@/features/desktop-host');

const openBrowserPane = vi.fn();
const navigateBrowserPane = vi.fn();
const stepBrowserPane = vi.fn();
const setBrowserPaneBounds = vi.fn();
const hideBrowserPane = vi.fn();
let emitState: (state: BrowserPaneState) => void = () => undefined;

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<DesktopHost>()),
  openBrowserPane,
  navigateBrowserPane,
  stepBrowserPane,
  setBrowserPaneBounds,
  hideBrowserPane,
  onBrowserPaneState: (listener: (state: BrowserPaneState) => void) => {
    emitState = listener;
    return () => undefined;
  },
}));

const { LocalBrowserPanel } = await import('./LocalBrowserPanel');

const OPEN: BrowserPaneState = {
  ...CLOSED_BROWSER_PANE,
  open: true,
  url: 'http://localhost:3000/',
  title: 'App',
  canGoBack: true,
};

beforeEach(() => {
  openBrowserPane.mockResolvedValue(OPEN);
  navigateBrowserPane.mockResolvedValue(OPEN);
  stepBrowserPane.mockResolvedValue(OPEN);
  setBrowserPaneBounds.mockResolvedValue(OPEN);
  hideBrowserPane.mockResolvedValue(CLOSED_BROWSER_PANE);
});

afterEach(() => vi.clearAllMocks());

describe('the browser panel in a coding session', () => {
  it('opens the address it was given and shows it in the bar', async () => {
    render(<LocalBrowserPanel address="http://localhost:3000/" addressKey={1} onClose={vi.fn()} />);
    await act(async () => undefined);
    expect(openBrowserPane).toHaveBeenCalledWith(
      expect.objectContaining({ width: expect.any(Number) }),
      'http://localhost:3000/',
    );
    expect(screen.getByLabelText('Web address')).toHaveValue('http://localhost:3000/');
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled();
  });

  it('shows the empty state with nothing open', async () => {
    openBrowserPane.mockResolvedValue({ ...CLOSED_BROWSER_PANE, open: true });
    render(<LocalBrowserPanel address={null} addressKey={0} onClose={vi.fn()} />);
    await act(async () => undefined);
    expect(screen.getByText('Browse the web')).toBeInTheDocument();
  });

  it('refuses what is not a web address before asking the shell', async () => {
    render(<LocalBrowserPanel address={null} addressKey={0} onClose={vi.fn()} />);
    await act(async () => undefined);
    const field = screen.getByLabelText('Web address');
    fireEvent.change(field, { target: { value: 'file:///etc/passwd' } });
    fireEvent.submit(field);
    expect(navigateBrowserPane).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a web address');

    fireEvent.change(field, { target: { value: 'example.com' } });
    await act(async () => {
      fireEvent.submit(field);
    });
    expect(navigateBrowserPane).toHaveBeenCalledWith('https://example.com/');
  });

  it('says when a site was not opened and offers to ask again', async () => {
    render(<LocalBrowserPanel address="https://example.com/" addressKey={1} onClose={vi.fn()} />);
    await act(async () => undefined);
    act(() => emitState({ ...CLOSED_BROWSER_PANE, open: true, refusedHost: 'example.com' }));
    expect(screen.getByText("example.com isn't allowed in the browser pane.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(navigateBrowserPane).toHaveBeenCalledWith('https://example.com/');
  });

  it('hides the pane when it unmounts', async () => {
    const { unmount } = render(
      <LocalBrowserPanel address={null} addressKey={0} onClose={vi.fn()} />,
    );
    await act(async () => undefined);
    unmount();
    expect(hideBrowserPane).toHaveBeenCalled();
  });
});
