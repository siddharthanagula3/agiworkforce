import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEVELOPER_RUNTIME_CAPABILITIES,
  type DeveloperRuntimeModels,
  type LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import { safePlatform } from '@shared/utils/browser-utils';
import { hostBridgeStub } from '@/test/host-bridge-stub';
import type { BrowserPaneRequest } from '../browser-pane';

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function capturedPage(): File {
  const bytes = Uint8Array.from(atob(ONE_PIXEL_PNG), (character) => character.charCodeAt(0));
  return new File([bytes], 'browser-capture.png', { type: 'image/png' });
}

const readDeveloperSession = vi.fn();
const capabilities = vi.fn(() => new Set<string>(DEVELOPER_RUNTIME_CAPABILITIES));

vi.mock('../services/local-review-client', () => ({
  listLocalCheckpoints: vi.fn(async () => ({ threadId: 'thread-1', available: true, turns: [] })),
  readLocalCheckpointDiff: vi.fn(),
  revertLocalSections: vi.fn(),
  stageLocalSections: vi.fn(),
  rewindLocalThread: vi.fn(),
  applyLocalWorktree: vi.fn(),
  deleteLocalWorktree: vi.fn(),
  pinLocalWorktree: vi.fn(),
  runLocalWorktreeSetup: vi.fn(),
  localWorktreeKeep: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  usePathname: () => '/code',
}));

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readDeveloperSession,
  onDeveloperSessionEvent: () => () => undefined,
  useDeveloperCapabilities: () => capabilities(),
}));

vi.mock('./LocalBrowserPane', () => ({
  LocalBrowserPane: ({
    paneId,
    request,
    expanded,
    onToggleExpanded,
    onClose,
    onAttachImage,
  }: {
    paneId: string;
    request: BrowserPaneRequest | null;
    expanded: boolean;
    onToggleExpanded: () => void;
    onClose: () => void;
    onAttachImage?: (file: File) => void;
  }) => (
    <aside
      aria-label="Browser"
      data-pane-id={paneId}
      data-request={request?.url ?? ''}
      data-expanded={expanded}
    >
      <button type="button" onClick={onToggleExpanded}>
        Expand the browser
      </button>
      <button type="button" onClick={onClose}>
        Close the browser
      </button>
      {onAttachImage && (
        <button type="button" onClick={() => onAttachImage(capturedPage())}>
          Add the page to the chat
        </button>
      )}
    </aside>
  ),
}));

vi.mock('./LocalSimulatorPane', () => ({
  LocalSimulatorPane: ({
    floating,
    onToggleFloating,
    onClose,
  }: {
    floating: boolean;
    onToggleFloating: () => void;
    onClose: () => void;
  }) => (
    <aside aria-label="iOS Simulator" data-floating={floating}>
      <button type="button" onClick={onToggleFloating}>
        Float over the chat
      </button>
      <button type="button" onClick={onClose}>
        Close the simulator
      </button>
    </aside>
  ),
}));

vi.mock('./LocalChangesPanel', () => ({
  LocalChangesPanel: ({ onOpenPreview }: { onOpenPreview?: (url: string) => void }) => (
    <aside aria-label="Changes">
      {onOpenPreview && (
        <button type="button" onClick={() => onOpenPreview('http://localhost:5173/')}>
          Preview
        </button>
      )}
    </aside>
  ),
}));

const { LocalSessionPanel } = await import('./LocalSessionPanel');
const { forgetLocalSession } = await import('../local-session-memory');

const session: LocalDeveloperSession = {
  id: 'thread-1',
  rootId: 'root-1',
  title: 'Fix the build',
  cwd: '/work/qa-project',
  model: null,
  provider: null,
  trustMode: 'local',
  status: 'idle',
  createdAt: '2026-10-10T10:00:00Z',
  updatedAt: '2026-10-10T10:05:00Z',
  origin: 'desktop',
};

const runtime: DeveloperRuntimeModels = {
  models: [],
  hostModels: [],
  defaultModelId: null,
  defaultAgentMode: 'ask',
  defaultReasoningEffort: null,
  managedSignedIn: false,
};

function renderPanel() {
  return render(
    <LocalSessionPanel
      session={session}
      group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
      runtimeModels={runtime}
      verbose={false}
      onClose={vi.fn()}
    />,
  );
}

function inElectron(mac: boolean) {
  window.agiHost = hostBridgeStub({ platform: mac ? 'electron-darwin' : 'electron-win32' });
  vi.spyOn(safePlatform, 'isMac').mockReturnValue(mac);
}

beforeEach(() => {
  vi.clearAllMocks();
  forgetLocalSession('root-1', 'thread-1');
  capabilities.mockImplementation(() => new Set<string>(DEVELOPER_RUNTIME_CAPABILITIES));
  readDeveloperSession.mockResolvedValue({
    session: null,
    messages: [],
    truncated: false,
    activeTurn: null,
  });
});

afterEach(() => {
  delete window.agiHost;
  vi.restoreAllMocks();
});

describe('the browser and simulator panes of a local session', () => {
  it('offers neither outside the desktop app', () => {
    renderPanel();

    expect(screen.queryByRole('button', { name: 'Browser' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'iOS Simulator' })).not.toBeInTheDocument();
  });

  it('offers the browser but no simulator off macOS', () => {
    inElectron(false);
    renderPanel();

    expect(screen.getByRole('button', { name: 'Browser' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('button', { name: 'iOS Simulator' })).not.toBeInTheDocument();
  });

  it('opens one docked pane at a time, each for this session', async () => {
    const user = userEvent.setup();
    inElectron(true);
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Browser' }));
    expect(screen.getByRole('complementary', { name: 'Browser' })).toHaveAttribute(
      'data-pane-id',
      'thread-1',
    );
    expect(screen.getByRole('button', { name: 'Browser' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'iOS Simulator' }));
    expect(screen.getByRole('complementary', { name: 'iOS Simulator' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Browser' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Changes' }));
    expect(screen.getByRole('complementary', { name: 'Changes' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'iOS Simulator' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Browser' }));
    expect(screen.getByRole('complementary', { name: 'Browser' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Changes' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close the browser' }));
    expect(screen.queryByRole('complementary', { name: 'Browser' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browser' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('keeps a floating simulator beside another pane, and docks it in that pane’s place', async () => {
    const user = userEvent.setup();
    inElectron(true);
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'iOS Simulator' }));
    await user.click(screen.getByRole('button', { name: 'Float over the chat' }));
    expect(screen.getByRole('complementary', { name: 'iOS Simulator' })).toHaveAttribute(
      'data-floating',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Browser' }));
    expect(screen.getByRole('complementary', { name: 'Browser' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'iOS Simulator' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Float over the chat' }));
    expect(screen.getByRole('complementary', { name: 'iOS Simulator' })).toHaveAttribute(
      'data-floating',
      'false',
    );
    expect(screen.queryByRole('complementary', { name: 'Browser' })).not.toBeInTheDocument();
  });

  it('lists both in the side panel shortcuts', async () => {
    const user = userEvent.setup();
    inElectron(true);
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Side panel' }));
    const list = screen.getByRole('complementary', { name: 'Panel shortcuts' });
    await user.click(within(list).getByRole('button', { name: 'Browser' }));

    expect(screen.getByRole('complementary', { name: 'Browser' })).toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Panel shortcuts' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Side panel' }));
    expect(screen.queryByRole('complementary', { name: 'Browser' })).not.toBeInTheDocument();
  });

  it('shows a running dev server in the browser when Preview is pressed in Changes', async () => {
    const user = userEvent.setup();
    inElectron(true);
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Changes' }));
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.getByRole('complementary', { name: 'Browser' })).toHaveAttribute(
      'data-request',
      'http://localhost:5173/',
    );
    expect(screen.queryByRole('complementary', { name: 'Changes' })).not.toBeInTheDocument();
  });

  it('offers no Preview in Changes where there is no browser pane', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Changes' }));

    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
  });

  it('gives the whole row to an expanded pane and brings the chat back for a capture', async () => {
    const user = userEvent.setup();
    inElectron(true);
    renderPanel();
    const column = screen.getByTestId('local-code-scroll').parentElement;

    await user.click(screen.getByRole('button', { name: 'Browser' }));
    await user.click(screen.getByRole('button', { name: 'Expand the browser' }));
    expect(screen.getByRole('complementary', { name: 'Browser' })).toHaveAttribute(
      'data-expanded',
      'true',
    );
    expect(column?.className).toMatch(/columnHidden/u);

    await user.click(screen.getByRole('button', { name: 'Add the page to the chat' }));

    expect(column?.className).not.toMatch(/columnHidden/u);
    expect(await screen.findByAltText('browser-capture.png')).toBeInTheDocument();
  });

  it('hands the panes no way to add a picture when the session takes none', async () => {
    const user = userEvent.setup();
    capabilities.mockImplementation(
      () => new Set<string>(DEVELOPER_RUNTIME_CAPABILITIES.filter((name) => name !== 'images')),
    );
    inElectron(true);
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Browser' }));

    expect(
      screen.queryByRole('button', { name: 'Add the page to the chat' }),
    ).not.toBeInTheDocument();
  });
});
