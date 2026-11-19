import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEVELOPER_RUNTIME_CAPABILITIES,
  type DeveloperRuntimeModels,
  type LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function capturedScreen(): File {
  const bytes = Uint8Array.from(atob(ONE_PIXEL_PNG), (character) => character.charCodeAt(0));
  return new File([bytes], 'simulator-capture.png', { type: 'image/png' });
}

const readDeveloperSession = vi.fn();
const capabilities = vi.fn(() => new Set<string>(DEVELOPER_RUNTIME_CAPABILITIES));
const browserPaneSupported = vi.fn(async () => false);
const simulatorPaneSupported = vi.fn(async () => false);

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
  browserPaneSupported,
  simulatorPaneSupported,
}));

vi.mock('./LocalBrowserPanel', () => ({
  LocalBrowserPanel: ({ onClose }: { onClose: () => void }) => (
    <aside aria-label="Browser">
      <button type="button" onClick={onClose}>
        Close the browser
      </button>
    </aside>
  ),
}));

vi.mock('./LocalSimulatorPane', () => ({
  LocalSimulatorPane: ({
    expanded,
    onToggleExpanded,
    floating,
    onToggleFloating,
    onClose,
    onAttachImage,
  }: {
    expanded: boolean;
    onToggleExpanded: () => void;
    floating: boolean;
    onToggleFloating: () => void;
    onClose: () => void;
    onAttachImage?: (file: File) => void;
  }) => (
    <aside aria-label="iOS Simulator" data-floating={floating} data-expanded={expanded}>
      <button type="button" onClick={onToggleExpanded}>
        Expand the simulator
      </button>
      <button type="button" onClick={onToggleFloating}>
        Float over the chat
      </button>
      <button type="button" onClick={onClose}>
        Close the simulator
      </button>
      {onAttachImage && (
        <button type="button" onClick={() => onAttachImage(capturedScreen())}>
          Add the screen to the chat
        </button>
      )}
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

function onDesktop({ simulator }: { simulator: boolean }) {
  browserPaneSupported.mockResolvedValue(true);
  simulatorPaneSupported.mockResolvedValue(simulator);
}

beforeEach(() => {
  vi.clearAllMocks();
  forgetLocalSession('root-1', 'thread-1');
  capabilities.mockImplementation(() => new Set<string>(DEVELOPER_RUNTIME_CAPABILITIES));
  browserPaneSupported.mockResolvedValue(false);
  simulatorPaneSupported.mockResolvedValue(false);
  readDeveloperSession.mockResolvedValue({
    session: null,
    messages: [],
    truncated: false,
    activeTurn: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the iOS Simulator pane of a local session', () => {
  it('is not offered where the desktop app cannot run it', async () => {
    onDesktop({ simulator: false });
    renderPanel();

    expect(await screen.findByRole('button', { name: 'Browser' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'iOS Simulator' })).not.toBeInTheDocument();
  });

  it('is not offered outside the desktop app', async () => {
    renderPanel();

    await vi.waitFor(() => expect(simulatorPaneSupported).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'iOS Simulator' })).not.toBeInTheDocument();
  });

  it('opens beside the session, one docked pane at a time', async () => {
    const user = userEvent.setup();
    onDesktop({ simulator: true });
    renderPanel();

    const toggle = await screen.findByRole('button', { name: 'iOS Simulator' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(screen.getByRole('complementary', { name: 'iOS Simulator' })).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Browser' }));
    expect(screen.getByRole('complementary', { name: 'Browser' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'iOS Simulator' })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole('complementary', { name: 'iOS Simulator' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Browser' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Changes' }));
    expect(screen.getByRole('complementary', { name: 'Changes' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'iOS Simulator' })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole('complementary', { name: 'iOS Simulator' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Changes' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close the simulator' }));
    expect(screen.queryByRole('complementary', { name: 'iOS Simulator' })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('stays beside another pane while it floats, and docks in that pane’s place', async () => {
    const user = userEvent.setup();
    onDesktop({ simulator: true });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'iOS Simulator' }));
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

  it('closes with the side panel when it is docked', async () => {
    const user = userEvent.setup();
    onDesktop({ simulator: true });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'iOS Simulator' }));
    await user.click(screen.getByRole('button', { name: 'Side panel' }));

    expect(screen.queryByRole('complementary', { name: 'iOS Simulator' })).not.toBeInTheDocument();
  });

  it('takes the whole row when expanded and brings the chat back for a capture', async () => {
    const user = userEvent.setup();
    onDesktop({ simulator: true });
    renderPanel();
    const column = screen.getByTestId('local-code-scroll').parentElement;

    await user.click(await screen.findByRole('button', { name: 'iOS Simulator' }));
    await user.click(screen.getByRole('button', { name: 'Expand the simulator' }));
    expect(screen.getByRole('complementary', { name: 'iOS Simulator' })).toHaveAttribute(
      'data-expanded',
      'true',
    );
    expect(column?.className).toMatch(/columnHidden/u);

    await user.click(screen.getByRole('button', { name: 'Add the screen to the chat' }));

    expect(column?.className).not.toMatch(/columnHidden/u);
    expect(await screen.findByAltText('simulator-capture.png')).toBeInTheDocument();
  });

  it('is given no way to add a picture when the session takes none', async () => {
    const user = userEvent.setup();
    capabilities.mockImplementation(
      () => new Set<string>(DEVELOPER_RUNTIME_CAPABILITIES.filter((name) => name !== 'images')),
    );
    onDesktop({ simulator: true });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'iOS Simulator' }));

    expect(
      screen.queryByRole('button', { name: 'Add the screen to the chat' }),
    ).not.toBeInTheDocument();
  });
});
