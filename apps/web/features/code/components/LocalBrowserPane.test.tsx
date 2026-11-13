import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BROWSER_PANE_TAB_LIMIT,
  type BackgroundActivity,
  type BackgroundCommandRun,
  type BrowserPaneState,
  type BrowserPaneTab,
} from '@agiworkforce/local-runtime-contract';
type DesktopHostModule = typeof import('@/features/desktop-host');

const readBrowserPane = vi.fn();
const layoutBrowserPane = vi.fn();
const openBrowserPaneTab = vi.fn();
const closeBrowserPaneTab = vi.fn();
const selectBrowserPaneTab = vi.fn();
const navigateBrowserPane = vi.fn();
const moveBrowserPaneHistory = vi.fn();
const captureBrowserPane = vi.fn();
const readBackgroundActivity = vi.fn();
const openExternal = vi.fn();
let announce: ((state: BrowserPaneState) => void) | null = null;
const onBrowserPaneChanged = vi.fn(
  (_paneId: string, listener: (state: BrowserPaneState) => void) => {
    announce = listener;
    return () => {
      announce = null;
    };
  },
);

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<DesktopHostModule>()),
  readBrowserPane,
  layoutBrowserPane,
  openBrowserPaneTab,
  closeBrowserPaneTab,
  selectBrowserPaneTab,
  navigateBrowserPane,
  moveBrowserPaneHistory,
  captureBrowserPane,
  onBrowserPaneChanged,
  readBackgroundActivity,
  useDesktopHost: () => ({ shell: 'electron', openExternal }),
}));

vi.mock('./LocalCaptureAnnotator', () => ({
  LocalCaptureAnnotator: ({
    image,
    name,
    onAdd,
    onClose,
  }: {
    image: string;
    name: string;
    onAdd: (file: File) => void;
    onClose: () => void;
  }) => (
    <div data-testid="annotator" data-image={image}>
      <button
        type="button"
        onClick={() => onAdd(new File(['marked'], name, { type: 'image/png' }))}
      >
        Add to chat
      </button>
      <button type="button" onClick={onClose}>
        Close without adding
      </button>
    </div>
  ),
}));

const { LocalBrowserPane } = await import('./LocalBrowserPane');

const PANE = 'session-1';
const PAGE = 'http://localhost:3000/';
const PAGE_BOUNDS = { x: 400, y: 120, width: 600, height: 500 };

function tab(id: string, patch: Partial<BrowserPaneTab> = {}): BrowserPaneTab {
  return {
    id,
    title: `Page ${id}`,
    url: PAGE,
    loading: false,
    canGoBack: false,
    canGoForward: false,
    local: true,
    failure: null,
    ...patch,
  };
}

function paneState(tabs: BrowserPaneTab[], activeTabId: string | null = tabs[0]?.id ?? null) {
  return { tabs, activeTabId, notice: null } satisfies BrowserPaneState;
}

function run(runId: string, rootId: string, previewUrl?: string): BackgroundCommandRun {
  return {
    runId,
    command: `pnpm dev ${runId}`,
    rootId,
    rootName: rootId,
    startedAtMs: 0,
    background: true,
    ...(previewUrl ? { previewUrl } : {}),
  };
}

function activity(commands: BackgroundCommandRun[]): BackgroundActivity {
  return {
    codingRuntimes: [],
    commands,
    computerUse: 'idle',
    remoteControl: 'idle',
    browserPaired: false,
  };
}

function renderPane(props: Partial<Parameters<typeof LocalBrowserPane>[0]> = {}) {
  const onClose = vi.fn();
  const onToggleExpanded = vi.fn();
  const onRequestHandled = vi.fn();
  const view = render(
    <LocalBrowserPane
      paneId={PANE}
      rootId="root-1"
      request={null}
      onRequestHandled={onRequestHandled}
      expanded={false}
      onToggleExpanded={onToggleExpanded}
      onClose={onClose}
      {...props}
    />,
  );
  return { ...view, onClose, onToggleExpanded, onRequestHandled };
}

function lastLayout(): [string, typeof PAGE_BOUNDS, boolean] | undefined {
  return layoutBrowserPane.mock.calls.at(-1) as [string, typeof PAGE_BOUNDS, boolean] | undefined;
}

let covering: Element | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  announce = null;
  covering = null;
  readBrowserPane.mockResolvedValue(paneState([]));
  layoutBrowserPane.mockResolvedValue(true);
  navigateBrowserPane.mockResolvedValue(paneState([tab('a')]));
  openBrowserPaneTab.mockResolvedValue(paneState([tab('a')]));
  selectBrowserPaneTab.mockImplementation(async (_pane: string, id: string) =>
    paneState([tab('a'), tab('b')], id),
  );
  closeBrowserPaneTab.mockResolvedValue(paneState([]));
  moveBrowserPaneHistory.mockResolvedValue(paneState([tab('a')]));
  captureBrowserPane.mockResolvedValue({
    dataUrl: 'data:image/png;base64,AAAA',
    width: 1200,
    height: 1000,
    url: PAGE,
  });
  readBackgroundActivity.mockResolvedValue(activity([]));
  openExternal.mockResolvedValue(undefined);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measure(
    this: HTMLElement,
  ) {
    const box =
      this.getAttribute('role') === 'tabpanel' ? PAGE_BOUNDS : { x: 0, y: 0, width: 0, height: 0 };
    return {
      ...box,
      left: box.x,
      top: box.y,
      right: box.x + box.width,
      bottom: box.y + box.height,
      toJSON: () => box,
    };
  });
  document.elementFromPoint = () => covering ?? screen.queryByRole('tabpanel');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the browser pane with nothing open', () => {
  it('offers an address and the dev server, and keeps the page view hidden', async () => {
    renderPane({ onAttachImage: vi.fn() });

    expect(
      await screen.findByRole('heading', { name: 'Browse beside your session' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Find the dev server' })).toBeEnabled();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark up this page/u })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /your own browser/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDisabled();
    expect(layoutBrowserPane.mock.calls.every(([, , visible]) => visible === false)).toBe(true);
  });

  it('opens what is typed as an address, giving a bare local host its scheme', async () => {
    const user = userEvent.setup();
    renderPane();
    await screen.findByRole('heading', { name: 'Browse beside your session' });

    await user.type(screen.getByRole('textbox', { name: 'Web address' }), 'localhost:3000{Enter}');

    expect(navigateBrowserPane).toHaveBeenCalledWith(PANE, 'http://localhost:3000/');
    expect(await screen.findByRole('tab', { name: 'Page a' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Web address' })).toHaveValue(PAGE);
  });

  it.each(['hello world', 'javascript:alert(1)', 'file:///etc/passwd', 'notes'])(
    'opens nothing for %s and says why',
    async (typed) => {
      const user = userEvent.setup();
      renderPane();
      await screen.findByRole('heading', { name: 'Browse beside your session' });

      await user.type(screen.getByRole('textbox', { name: 'Web address' }), `${typed}{Enter}`);

      expect(await screen.findByRole('alert')).toHaveTextContent('That is not a web address');
      expect(navigateBrowserPane).not.toHaveBeenCalled();
      expect(openBrowserPaneTab).not.toHaveBeenCalled();
    },
  );

  it('opens the one dev server this folder is running', async () => {
    const user = userEvent.setup();
    readBackgroundActivity.mockResolvedValue(
      activity([
        run('here', 'root-1', 'http://localhost:5173/'),
        run('elsewhere', 'root-2', 'http://localhost:9999/'),
        run('no-address', 'root-1'),
      ]),
    );
    renderPane();

    await user.click(await screen.findByRole('button', { name: 'Find the dev server' }));

    await waitFor(() =>
      expect(navigateBrowserPane).toHaveBeenCalledWith(PANE, 'http://localhost:5173/'),
    );
  });

  it('says so when this folder runs no dev server', async () => {
    const user = userEvent.setup();
    readBackgroundActivity.mockResolvedValue(
      activity([run('elsewhere', 'root-2', 'http://localhost:9999/')]),
    );
    renderPane();

    await user.click(await screen.findByRole('button', { name: 'Find the dev server' }));

    expect(await screen.findByText(/No dev server is running in this folder/u)).toBeVisible();
    expect(navigateBrowserPane).not.toHaveBeenCalled();
  });

  it('lets the user pick when the folder runs several', async () => {
    const user = userEvent.setup();
    readBackgroundActivity.mockResolvedValue(
      activity([
        run('web', 'root-1', 'http://localhost:3000/'),
        run('docs', 'root-1', 'http://localhost:4000/'),
      ]),
    );
    renderPane();

    await user.click(await screen.findByRole('button', { name: 'Find the dev server' }));
    const choices = await screen.findByRole('list', { name: 'Dev servers running in this folder' });
    expect(navigateBrowserPane).not.toHaveBeenCalled();
    await user.click(within(choices).getByRole('button', { name: 'Open http://localhost:4000/' }));

    expect(navigateBrowserPane).toHaveBeenCalledWith(PANE, 'http://localhost:4000/');
  });

  it('reports a failure to read the running commands', async () => {
    const user = userEvent.setup();
    readBackgroundActivity.mockRejectedValue(new Error('The desktop did not answer.'));
    renderPane();

    await user.click(await screen.findByRole('button', { name: 'Find the dev server' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The desktop did not answer.');
  });
});

describe('the browser pane with pages open', () => {
  beforeEach(() => {
    readBrowserPane.mockResolvedValue(
      paneState([tab('a', { canGoBack: true }), tab('b', { url: 'https://example.com/' })]),
    );
  });

  it('draws the page over its place in the pane and hides it when the pane goes', async () => {
    const { unmount } = renderPane();

    await waitFor(() => expect(lastLayout()).toEqual([PANE, PAGE_BOUNDS, true]));
    unmount();

    expect(lastLayout()).toEqual([PANE, PAGE_BOUNDS, false]);
  });

  it('switches, closes and opens tabs', async () => {
    const user = userEvent.setup();
    renderPane();

    await user.click(await screen.findByRole('tab', { name: 'Page b' }));
    expect(selectBrowserPaneTab).toHaveBeenCalledWith(PANE, 'b');
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Page b' })).toHaveAttribute('aria-selected', 'true'),
    );

    await user.click(screen.getByRole('button', { name: 'Close Page a' }));
    expect(closeBrowserPaneTab).toHaveBeenCalledWith(PANE, 'a');

    await user.click(screen.getByRole('button', { name: 'New tab' }));
    expect(openBrowserPaneTab).toHaveBeenCalledWith(PANE, undefined);
  });

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    renderPane();

    (await screen.findByRole('tab', { name: 'Page a' })).focus();
    await user.keyboard('{ArrowRight}');

    expect(selectBrowserPaneTab).toHaveBeenCalledWith(PANE, 'b');
  });

  it('offers no new tab once the pane is full', async () => {
    readBrowserPane.mockResolvedValue(
      paneState(
        Array.from({ length: BROWSER_PANE_TAB_LIMIT }, (_unused, index) => tab(`t${index}`)),
      ),
    );
    renderPane();

    expect(await screen.findAllByRole('tab')).toHaveLength(BROWSER_PANE_TAB_LIMIT);
    expect(screen.queryByRole('button', { name: 'New tab' })).not.toBeInTheDocument();
  });

  it('goes back and reloads, and offers forward only when there is somewhere to go', async () => {
    const user = userEvent.setup();
    renderPane();

    await user.click(await screen.findByRole('button', { name: 'Back' }));
    expect(moveBrowserPaneHistory).toHaveBeenCalledWith(PANE, 'back');
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(moveBrowserPaneHistory).toHaveBeenLastCalledWith(PANE, 'reload');
  });

  it('turns reload into stop while a page loads', async () => {
    const user = userEvent.setup();
    readBrowserPane.mockResolvedValue(paneState([tab('a', { loading: true })]));
    renderPane();

    const stop = await screen.findByRole('button', { name: 'Stop loading' });
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
    await user.click(stop);

    expect(moveBrowserPaneHistory).toHaveBeenCalledWith(PANE, 'stop');
    expect(await screen.findByRole('button', { name: 'Reload' })).toBeEnabled();
  });

  it('follows what the desktop reports, including what it refused for a page', async () => {
    renderPane();
    await screen.findByRole('tab', { name: 'Page a' });

    act(() => {
      announce?.({
        tabs: [tab('a', { title: 'Renamed', url: 'http://localhost:3000/next' })],
        activeTabId: 'a',
        notice: 'Downloads are off in this pane.',
      });
    });

    expect(screen.getByRole('tab', { name: 'Renamed' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Web address' })).toHaveValue(
      'http://localhost:3000/next',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Downloads are off in this pane.');
  });

  it('shows why a page did not load, hides the view and retries', async () => {
    const user = userEvent.setup();
    readBrowserPane.mockResolvedValue(
      paneState([tab('a', { failure: 'Nothing answered at http://localhost:3000/.' })]),
    );
    renderPane();

    expect(await screen.findByRole('heading', { name: 'This page did not load' })).toBeVisible();
    expect(screen.getByText('Nothing answered at http://localhost:3000/.')).toBeVisible();
    expect(layoutBrowserPane.mock.calls.every(([, , visible]) => visible === false)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(moveBrowserPaneHistory).toHaveBeenCalledWith(PANE, 'reload');
  });

  it('opens the page in the user’s own browser', async () => {
    const user = userEvent.setup();
    renderPane();

    await user.click(await screen.findByRole('button', { name: /your own browser/u }));

    expect(openExternal).toHaveBeenCalledWith(PAGE);
  });

  it('hides the page while something is drawn over it, leaving a still of it', async () => {
    renderPane();
    await waitFor(() => expect(lastLayout()).toEqual([PANE, PAGE_BOUNDS, true]));

    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    covering = menu;
    act(() => {
      document.body.append(menu);
    });

    expect(
      await screen.findByRole('img', { name: 'The page as it was a moment ago' }),
    ).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(lastLayout()).toEqual([PANE, PAGE_BOUNDS, false]);
    expect(screen.queryByRole('button', { name: /Mark up this page/u })).not.toBeInTheDocument();

    covering = null;
    act(() => {
      menu.remove();
    });

    await waitFor(() => expect(lastLayout()).toEqual([PANE, PAGE_BOUNDS, true]));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('hides the page without a still when it cannot be captured', async () => {
    captureBrowserPane.mockRejectedValue(new Error('The page could not be captured.'));
    renderPane();
    await waitFor(() => expect(lastLayout()).toEqual([PANE, PAGE_BOUNDS, true]));

    const dialog = document.createElement('div');
    covering = dialog;
    act(() => {
      document.body.append(dialog);
    });

    expect(await screen.findByText(/paused while something is open over it/u)).toBeVisible();
    expect(lastLayout()).toEqual([PANE, PAGE_BOUNDS, false]);
    dialog.remove();
  });

  it('captures the page, lets it be marked up and adds it to the chat', async () => {
    const user = userEvent.setup();
    const onAttachImage = vi.fn();
    renderPane({ onAttachImage });
    await waitFor(() => expect(lastLayout()).toEqual([PANE, PAGE_BOUNDS, true]));

    await user.click(screen.getByRole('button', { name: /Mark up this page/u }));

    expect(await screen.findByTestId('annotator')).toHaveAttribute(
      'data-image',
      'data:image/png;base64,AAAA',
    );
    await waitFor(() => expect(lastLayout()).toEqual([PANE, PAGE_BOUNDS, false]));

    await user.click(screen.getByRole('button', { name: 'Add to chat' }));

    expect(onAttachImage).toHaveBeenCalledTimes(1);
    const [file] = onAttachImage.mock.calls[0] as [File];
    expect(file.name).toBe('browser-capture.png');
    expect(file.type).toBe('image/png');
    expect(screen.queryByTestId('annotator')).not.toBeInTheDocument();
    await waitFor(() => expect(lastLayout()).toEqual([PANE, PAGE_BOUNDS, true]));
  });

  it('leaves the mark-up control out where the session takes no pictures', async () => {
    renderPane();

    await screen.findByRole('tab', { name: 'Page a' });

    expect(screen.queryByRole('button', { name: /Mark up this page/u })).not.toBeInTheDocument();
  });

  it('says so when the page cannot be captured for marking up', async () => {
    const user = userEvent.setup();
    captureBrowserPane.mockRejectedValue(new Error('There is no page open to capture.'));
    renderPane({ onAttachImage: vi.fn() });

    await user.click(await screen.findByRole('button', { name: /Mark up this page/u }));

    expect(await screen.findByRole('alert')).toHaveTextContent('There is no page open to capture.');
    expect(screen.queryByTestId('annotator')).not.toBeInTheDocument();
  });

  it('reports the pane controls', async () => {
    const user = userEvent.setup();
    const { onClose, onToggleExpanded, rerender } = renderPane();

    const expand = await screen.findByRole('button', { name: 'Expand the browser' });
    expect(expand).toHaveAttribute('aria-pressed', 'false');
    await user.click(expand);
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);

    rerender(
      <LocalBrowserPane
        paneId={PANE}
        rootId="root-1"
        request={null}
        onRequestHandled={vi.fn()}
        expanded
        onToggleExpanded={onToggleExpanded}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('button', { name: 'Restore the browser' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Close the browser' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('a page the session asks the pane to show', () => {
  it('opens in the empty pane', async () => {
    const { onRequestHandled } = renderPane({
      request: { url: 'http://0.0.0.0:5173/', key: 1 },
    });

    await waitFor(() =>
      expect(navigateBrowserPane).toHaveBeenCalledWith(PANE, 'http://localhost:5173/'),
    );
    expect(onRequestHandled).toHaveBeenCalledTimes(1);
    expect(openBrowserPaneTab).not.toHaveBeenCalled();
  });

  it('opens in a new tab beside the pages already open', async () => {
    readBrowserPane.mockResolvedValue(paneState([tab('a', { url: 'https://example.com/' })]));
    renderPane({ request: { url: 'http://localhost:5173/', key: 1 } });

    await waitFor(() =>
      expect(openBrowserPaneTab).toHaveBeenCalledWith(PANE, 'http://localhost:5173/'),
    );
    expect(navigateBrowserPane).not.toHaveBeenCalled();
  });

  it('goes to the tab that already shows it', async () => {
    readBrowserPane.mockResolvedValue(
      paneState([tab('a', { url: 'https://example.com/' }), tab('b')], 'a'),
    );
    renderPane({ request: { url: PAGE, key: 1 } });

    await waitFor(() => expect(selectBrowserPaneTab).toHaveBeenCalledWith(PANE, 'b'));
    expect(openBrowserPaneTab).not.toHaveBeenCalled();
    expect(navigateBrowserPane).not.toHaveBeenCalled();
  });

  it('is handled once', async () => {
    const request = { url: 'http://localhost:5173/', key: 7 };
    const { rerender, onRequestHandled } = renderPane({ request });
    await waitFor(() => expect(navigateBrowserPane).toHaveBeenCalledTimes(1));

    rerender(
      <LocalBrowserPane
        paneId={PANE}
        rootId="root-1"
        request={request}
        onRequestHandled={onRequestHandled}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(navigateBrowserPane).toHaveBeenCalledTimes(1);
  });

  it('refuses something that is not a web address', async () => {
    renderPane({ request: { url: 'file:///etc/passwd', key: 1 } });

    expect(await screen.findByRole('alert')).toHaveTextContent('That is not a web address');
    expect(navigateBrowserPane).not.toHaveBeenCalled();
    expect(openBrowserPaneTab).not.toHaveBeenCalled();
  });
});
