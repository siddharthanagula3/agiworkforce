import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  canUseBillingPlanCapability,
  getRoutingSlotModel,
  modelsCatalog,
  NOTEBOOK_TEMPLATE_ID,
  PRODUCT_NAMES,
  type BillingPlanTier,
  type CloudCodeSession,
} from '@agiworkforce/types';
import {
  DEVELOPER_RUNTIME_CAPABILITIES,
  DesktopRuntimeError,
  worktreeRootId,
  type DeveloperHostModel,
  type DeveloperSessionGroup,
  type DeveloperSessionListOptions,
  type LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import { emitAppCommand, onAppCommand } from '@shared/lib/app-commands';
import { hostBridgeStub } from '@/test/host-bridge-stub';
import { LOCAL_MODELS_SETTINGS_SECTION } from '@/features/settings/lib/web-settings-sections';
import {
  LOCAL_CODE_COPY,
  LOCAL_MODEL_UPGRADE_HEADING,
  LOCAL_MODELS_HELP_ARTICLE,
  localCloudModelsPlanLine,
} from './local-code';
import { helpArticlePath } from '@/lib/support/help-paths';
import { useUIStore } from '@shared/stores/layout-store';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { getModelMetadata } from '@shared/config/llm';
import {
  canAccessModelForSubscriptionTier,
  getSelectableModels,
  type CloudCodeRuntime,
} from '@agiworkforce/types';
import { CODE_COPY, contextWindowLabel, environmentChipLabel } from './code-surface';
import {
  TOOL_APPROVAL_POLICY_OPTIONS,
  WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_PREFERENCES,
  type ToolApprovalPreferences,
} from '@shared/types/toolApprovalPolicy';
import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import { listLocalBranches, switchLocalBranch } from '@/features/desktop-host';
import { CloudCodePage } from './CloudCodePage';
import { CodeComposerDraftProvider } from './CodeComposerDrafts';
import { forgetLocalSession } from './local-session-memory';
import {
  CloudCodeApiError,
  type CloudCodeAgentTurn,
  type CloudCodeApi,
} from '@agiworkforce/cloud-contracts';
import { IME_PROCESSING_KEY_CODE } from '@agiworkforce/unified-chat/ime-composition';
type ScanModule0 = typeof import('@/features/desktop-host');

const push = vi.fn();
const replace = vi.fn();
const router = { push, replace };
const navigationState = vi.hoisted(() => ({ search: '' }));
const codeIdentity = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'account-a', sessionId: 'auth-session-a' },
  sdk: {
    loaded: true,
    user: { id: 'account-a' },
    session: { id: 'auth-session-a', user: { id: 'account-a' }, getToken: async () => 'token-a' },
    addListener: () => () => undefined,
  },
}));
vi.mock('@clerk/nextjs', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => codeIdentity.auth,
  useClerk: () => codeIdentity.sdk,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/code',
  useSearchParams: () => new URLSearchParams(navigationState.search || window.location.search),
}));

vi.mock('@shared/components/layout/WebAppShell', () => ({
  WebAppShell: ({
    children,
    narrowHeaderSlot,
    rail = true,
  }: {
    children: React.ReactNode;
    narrowHeaderSlot?: React.ReactNode;
    rail?: boolean;
  }) => (
    <div data-testid="web-app-shell" data-rail={String(rail)}>
      <div data-testid="app-bar">{narrowHeaderSlot}</div>
      {children}
    </div>
  ),
}));

let greetingName: string | undefined = 'Ada';
let greetingResolved = true;
vi.mock('@features/chat/components/GreetingBanner/useGreeting', () => ({
  useGreeting: () => ({
    headline: 'Good morning',
    firstName: greetingName,
    nameResolved: greetingResolved,
  }),
}));

vi.mock('@/features/notebook/NotebookPanel', () => ({
  NotebookPanel: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="notebook-panel">{sessionId}</div>
  ),
}));

vi.mock('./components/CodeUsageDashboard', () => ({
  CodeUsageDashboard: ({
    planTier,
    linkOnly,
    collapsed,
  }: {
    planTier: string | null;
    linkOnly?: boolean;
    collapsed?: boolean;
  }) => (
    <div
      data-testid="code-usage-dashboard"
      data-plan-tier={planTier ?? ''}
      data-link-only={String(Boolean(linkOnly))}
      data-collapsed={String(Boolean(collapsed))}
    />
  ),
}));

const composerFooter = vi.hoisted(() => ({
  onUpgradeRequest: undefined as (() => void) | undefined,
}));
vi.mock('@features/chat/components/Composer/ComposerFooter', () => ({
  ComposerFooter: ({ onUpgradeRequest }: { onUpgradeRequest?: () => void }) => {
    composerFooter.onUpgradeRequest = onUpgradeRequest;
    return <div data-testid="model-trigger" />;
  },
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: vi.fn(async (_namespace: string, fallback: unknown) => fallback),
  savePreferenceNamespace: vi.fn(async () => undefined),
}));

type FakeHost = { shell?: 'electron' } | null;
let host: FakeHost = null;
let hostAfterHydration: FakeHost = null;
const mockDraftBrowserSupported = vi.fn(async () => false);
const mockDraftSimulatorSupported = vi.fn(async () => false);
let localModeHost = false;
const localSession: LocalDeveloperSession = {
  id: 'thread-1',
  rootId: 'root-recent',
  title: 'Quote the readme',
  cwd: '/work/qa-project',
  model: 'qa-provider/qa-model',
  provider: 'qa-provider',
  trustMode: 'byok',
  status: 'idle',
  createdAt: '2026-09-14T11:00:00Z',
  updatedAt: '2026-09-14T11:05:00Z',
  origin: 'cli',
};
let localGroups: DeveloperSessionGroup[] = [];
const workspaceChanges = new Set<() => void>();
const listDeveloperSessions = vi.fn(async (_options?: DeveloperSessionListOptions) => ({
  groups: localGroups,
}));
const lookupDeveloperSession =
  vi.fn<(rootId: string, threadId: string) => Promise<LocalDeveloperSession | null>>();
const startDeveloperSession = vi.fn(async (rootId: string, _model?: string) => ({
  ...localSession,
  rootId,
}));
const startDeveloperTurn = vi.fn(async () => ({ turnId: 'turn-1' }));
const readDeveloperSession = vi.fn(async () => ({
  session: localSession,
  messages: [],
  truncated: false,
  activeTurn: null,
}));
const pickWorkspaceRoot = vi.fn(async (_kind?: string) => ({ id: 'root-added' }));
let localHostModels: Array<
  Pick<DeveloperHostModel, 'id' | 'provider' | 'reachable' | 'unreachable'> &
    Partial<Pick<DeveloperHostModel, 'trustMode'>>
> = [];
let localDefaultModelId: string | null = null;
const listDeveloperModels = vi.fn(async () => ({
  models: [],
  hostModels: localHostModels,
  defaultModelId: localDefaultModelId,
}));

const WORKTREE_ROOT_ID = 'root-recent::worktree::0a1b2c3d';
const deleteLocalWorktree = vi.fn();
vi.mock('./services/local-review-client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listLocalCheckpoints: vi.fn(async () => ({ threadId: 'thread-1', available: true, turns: [] })),
  deleteLocalWorktree: (...args: unknown[]) => deleteLocalWorktree(...args),
}));

const deleteDeveloperThread = vi.fn();
const archiveDeveloperThread = vi.fn();
const unarchiveDeveloperThread = vi.fn();
const renameDeveloperThread = vi.fn();
const allowDeveloperSessions = vi.fn();
const reviewDeveloperMcpServer = vi.fn();
vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  readDeveloperSessionChanges: vi.fn(async () => ({
    files: [{ path: 'src/edit.ts', state: 'modified', originalPath: null }],
    diff: '',
    diffTruncated: false,
    folderPrefix: '',
  })),
  readWorkspaceText: vi.fn(async (_rootId: string, path: string) => ({
    path,
    text: path === 'package.json' ? '{}' : 'original',
    sizeBytes: 8,
    modifiedAtMs: 1,
    truncated: false,
    sha256: 'a'.repeat(64),
  })),
  ContinueOnDesktop: ({
    label,
    fallbackHref,
    className,
  }: {
    label: string;
    fallbackHref: string;
    className?: string;
  }) => (
    <a href={fallbackHref} className={className}>
      {label}
    </a>
  ),
  useDesktopHost: () => host,
  browserPaneSupported: () => mockDraftBrowserSupported(),
  simulatorPaneSupported: () => mockDraftSimulatorSupported(),
  useLocalModeHost: () => (localModeHost ? host : null),
  isDesktopHost: () => host !== null || hostAfterHydration !== null,
  archiveDeveloperThread: (...args: unknown[]) => archiveDeveloperThread(...args),
  unarchiveDeveloperThread: (...args: unknown[]) => unarchiveDeveloperThread(...args),
  renameDeveloperThread: (...args: unknown[]) => renameDeveloperThread(...args),
  allowDeveloperSessions: (...args: unknown[]) => allowDeveloperSessions(...args),
  onWorkspaceChanged: (listener: () => void) => {
    workspaceChanges.add(listener);
    return () => {
      workspaceChanges.delete(listener);
    };
  },
  deleteDeveloperThread: (...args: unknown[]) => deleteDeveloperThread(...args),
  forkDeveloperThread: vi.fn(),
  CODE_AGENT_MODE_CYCLE_SHORTCUT: { key: 'M', ctrl: true, meta: true, shift: true },
  compactDeveloperThread: vi.fn(),
  cancelDeveloperThreadSummary: vi.fn(),
  answerDeveloperApproval: vi.fn(async () => true),
  answerDeveloperUserInput: vi.fn(async () => true),
  interruptDeveloperTurn: vi.fn(async () => true),
  listWorkspaceFiles: vi.fn(async () => []),
  listDeveloperModels: (...args: unknown[]) => listDeveloperModels(...(args as [])),
  listDeveloperSessions: (options?: DeveloperSessionListOptions) => listDeveloperSessions(options),
  lookupDeveloperSession: (rootId: string, threadId: string) =>
    lookupDeveloperSession(rootId, threadId),
  listLocalBranches: vi.fn(async () => null),
  switchLocalBranch: vi.fn(async (_rootId: string, branch: string) => branch),
  onDeveloperSessionEvent: () => () => undefined,
  openWorkspaceInEditor: vi.fn(async () => true),
  pickWorkspaceRoot: (kind?: string) => pickWorkspaceRoot(kind),
  readDeveloperSession: () => readDeveloperSession(),
  reviewDeveloperMcpServer: (...args: unknown[]) => reviewDeveloperMcpServer(...args),
  startDeveloperSession: (rootId: string, model?: string) => startDeveloperSession(rootId, model),
  startDeveloperTurn: (...args: unknown[]) => startDeveloperTurn(...(args as [])),
  steerDeveloperTurn: vi.fn(async () => ({ turnId: 'turn-1' })),
  useDeveloperCapabilities: () => new Set(DEVELOPER_RUNTIME_CAPABILITIES),
}));

beforeEach(() => {
  localModeHost = false;
  codeIdentity.auth = {
    isLoaded: true,
    isSignedIn: true,
    userId: 'account-a',
    sessionId: 'auth-session-a',
  };
  codeIdentity.sdk.loaded = true;
  codeIdentity.sdk.user = { id: 'account-a' };
  codeIdentity.sdk.session = {
    id: 'auth-session-a',
    user: { id: 'account-a' },
    getToken: async () => 'token-a',
  };
  navigationState.search = '';
  useSettingsStore.setState({
    codeFirstRunCompleted: true,
    codeRailPins: {},
    dictationEnabled: true,
  });
  host = null;
  hostAfterHydration = null;
  mockDraftBrowserSupported.mockReset().mockResolvedValue(false);
  mockDraftSimulatorSupported.mockReset().mockResolvedValue(false);
  for (const rootId of ['root-recent', 'root-older', WORKTREE_ROOT_ID]) {
    for (const threadId of ['thread-1', 'thread-2']) forgetLocalSession(rootId, threadId);
  }
  localGroups = [];
  localHostModels = [];
  localDefaultModelId = null;
  composerFooter.onUpgradeRequest = undefined;
  listDeveloperSessions.mockReset().mockImplementation(async () => ({ groups: localGroups }));
  lookupDeveloperSession.mockReset().mockResolvedValue(null);
  startDeveloperSession.mockClear();
  startDeveloperTurn.mockClear();
  renameDeveloperThread.mockReset();
  pickWorkspaceRoot.mockClear();
});

const openSettings = vi.fn();
vi.mock('@/features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings, closeSettings: vi.fn() }),
}));

vi.mock('@shared/stores/web-auth-store', () => {
  const state = {
    user: {
      id: 'user-1',
      email: 'person@example.com',
      name: 'Ada Lovelace',
      profile: { display_name: 'Ada Lovelace', preferred_name: 'Ada' },
    },
    subscription: { display_name: 'Pro' },
    disabledFeatures: [],
  };
  return {
    useBillingStore: Object.assign(
      (selector: (value: Record<string, unknown>) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

const session: CloudCodeSession = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Run the test suite',
  repositoryUrl: null,
  repositoryBranch: null,
  networkAccess: 'none',
  runtimeId: null,
  extraHosts: [],
  state: 'ready',
  workspacePath: '/home/user',
  workingBranch: null,
  baseBranch: null,
  pullRequestUrl: null,
  pullRequestNumber: null,
  archivedAt: null,
  contextInputTokens: 0,
  contextOutputTokens: 0,
  lastError: null,
  createdAt: '2026-07-30T12:00:00.000Z',
  updatedAt: '2026-07-30T12:00:00.000Z',
  closedAt: null,
};

const repositoryPage = {
  repositories: [
    {
      installationId: 42,
      owner: 'owner',
      name: 'public-one',
      fullName: 'owner/public-one',
      defaultBranch: 'main',
      isPrivate: false,
    },
    {
      installationId: 42,
      owner: 'owner',
      name: 'private-two',
      fullName: 'owner/private-two',
      defaultBranch: 'trunk',
      isPrivate: true,
    },
  ],
  installationCount: 1,
  truncated: false,
  unreachable: [],
};

const availability = {
  deploymentEnabled: true,
  planEntitled: true,
  planTier: 'pro',
  maxSessions: 5,
};

function createApi(overrides: Partial<CloudCodeApi> = {}): CloudCodeApi {
  return {
    list: vi.fn(async () => ({ availability, sessions: [], runtimes: [] })),
    listRepositories: vi.fn(async () => ({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
    })),
    listBranches: vi.fn(async () => ({ branches: [], truncated: false })),
    changes: vi.fn(async () => ({
      session,
      base: null,
      workingBranch: null,
      files: [],
      diff: '',
      diffTruncated: false,
    })),
    createPullRequest: vi.fn(async () => ({
      session,
      url: 'https://github.com/owner/repository/pull/7',
      number: 7,
      alreadyOpen: false,
    })),
    pullRequestStatus: vi.fn(async () => ({
      number: 7,
      url: 'https://github.com/owner/repository/pull/7',
      state: 'open' as const,
      draft: false,
      merged: false,
      checksState: 'passing' as const,
      failedChecks: [],
      reviewState: 'none' as const,
    })),
    get: vi.fn(async () => ({ session, terminalEntries: [], turns: [] })),
    setSharing: vi.fn(async () => session),
    openShared: vi.fn(async () => ({
      visibility: 'public' as const,
      ownerName: null,
      title: session.title,
      repositoryUrl: null,
      workingBranch: null,
      baseBranch: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      terminalEntries: [],
      turns: [],
    })),
    create: vi.fn(async () => ({ session, terminalEntries: [], turns: [] })),
    run: vi.fn(async () => ({
      session,
      terminalEntry: {
        id: '1',
        sessionId: session.id,
        command: 'pwd',
        stdout: '/home/user\n',
        stderr: '',
        exitCode: 0,
        startedAt: '2026-07-30T12:01:00.000Z',
        completedAt: '2026-07-30T12:01:00.200Z',
      },
    })),
    cancelAgentTurn: vi.fn(async () => ({
      turnId: '22222222-2222-4222-8222-222222222222',
      requestedAt: '2026-07-30T12:02:00.000Z',
    })),
    close: vi.fn(async (): Promise<CloudCodeSession> => ({ ...session, state: 'closed' })),
    rename: vi.fn(async (_sessionId: string, title: string) => ({ ...session, title })),
    setArchived: vi.fn(async (_sessionId: string, archived: boolean) => ({
      ...session,
      archivedAt: archived ? '2026-07-30T12:10:00.000Z' : null,
    })),
    deleteSession: vi.fn(async () => undefined),
    discardChanges: vi.fn(async () => ({ session, discarded: [] })),
    commit: vi.fn(async () => ({
      session,
      push: { ok: true, output: 'pushed to origin/main', exitCode: 0 },
    })),
    startAgentTurn: vi.fn(async () => ({
      turnId: '22222222-2222-4222-8222-222222222222',
      stopReason: 'done' as const,
      stepsUsed: 2,
      finalMessage: 'Installed dependencies and ran the tests.',
      steps: [],
    })),
    listApprovals: vi.fn(async () => []),
    decideApproval: vi.fn(async () => ({
      turnId: '22222222-2222-4222-8222-222222222222',
      stopReason: 'done' as const,
      stepsUsed: 3,
      finalMessage: 'Tests pass.',
      steps: [],
    })),
    ...overrides,
  };
}

function codeDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function enabledComposer(): Promise<HTMLElement> {
  const field = await screen.findByRole('textbox', { name: CODE_COPY.composerPlaceholder });
  await waitFor(() => expect(field).toBeEnabled());
  return field;
}

function changeCodeIdentity(userId: string, sessionId: string) {
  codeIdentity.auth = { ...codeIdentity.auth, userId, sessionId };
  codeIdentity.sdk.user = { id: userId };
  codeIdentity.sdk.session = {
    id: sessionId,
    user: { id: userId },
    getToken: async () => 'token-b',
  };
}

async function openSession(user: ReturnType<typeof userEvent.setup>, title: string) {
  const rail = await screen.findByRole('navigation', { name: 'Cloud sessions' });
  await user.click(within(rail).getByRole('button', { name: title }));
}

async function openEnvironment(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^(Cloud · .+|Local)$/ }));
  return screen.findByRole('menu');
}

/** The tier radios and the harness picker live in the Edit environment dialog. */
async function openEnvironmentSettings(user: ReturnType<typeof userEvent.setup>) {
  await openEnvironment(user);
  await user.click(await screen.findByRole('menuitem', { name: 'Edit environment' }));
  return screen.findByRole('dialog');
}

describe('CloudCodePage', () => {
  it('keeps a separate unsent task for each Cloud session and for New session', async () => {
    const user = userEvent.setup();
    const other = { ...session, id: '22222222-2222-4222-8222-222222222222', title: 'Review build' };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session, other], runtimes: [] })),
      get: vi.fn(async (id) => ({
        session: id === other.id ? other : session,
        terminalEntries: [],
        turns: [],
      })),
    });
    render(<CloudCodePage api={api} />);

    await user.type(await enabledComposer(), 'New session draft');
    await openSession(user, session.title);
    expect(await enabledComposer()).toHaveValue('');
    await user.type(await enabledComposer(), 'Test suite follow-up');
    await openSession(user, other.title);
    expect(await enabledComposer()).toHaveValue('');
    await user.type(await enabledComposer(), 'Build review follow-up');
    await openSession(user, session.title);
    expect(await enabledComposer()).toHaveValue('Test suite follow-up');
    await user.click(screen.getByRole('button', { name: 'New' }));
    expect(await enabledComposer()).toHaveValue('New session draft');
    await openSession(user, other.title);
    expect(await enabledComposer()).toHaveValue('Build review follow-up');
    expect(api.startAgentTurn).not.toHaveBeenCalled();
  });

  it('keeps drafts across Code page mounts and drops them on account change', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    const route = (id?: string) => (
      <CodeComposerDraftProvider>
        <CloudCodePage key={id ?? 'new'} api={api} sessionId={id} />
      </CodeComposerDraftProvider>
    );
    const { rerender } = render(route());
    await user.type(await enabledComposer(), 'First account new task');
    rerender(route(session.id));
    expect(await enabledComposer()).toHaveValue('');
    await user.type(await enabledComposer(), 'First account session draft');

    rerender(route());
    expect(await enabledComposer()).toHaveValue('First account new task');
    rerender(route(session.id));
    expect(await enabledComposer()).toHaveValue('First account session draft');

    changeCodeIdentity('account-b', 'auth-session-b');
    rerender(route(session.id));
    expect(await enabledComposer()).toHaveValue('');
    rerender(route());
    expect(await enabledComposer()).toHaveValue('');
  });

  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    greetingName = 'Ada';
    greetingResolved = true;
  });

  it.each(['account', 'session'] as const)(
    'drops a late list after an authenticated %s switch',
    async (switchKind) => {
      const old = codeDeferred<Awaited<ReturnType<CloudCodeApi['list']>>>();
      const api = createApi({
        list: vi.fn(() =>
          codeIdentity.auth.sessionId === 'auth-session-a'
            ? old.promise
            : Promise.resolve({ availability, sessions: [], runtimes: [] }),
        ),
      });
      const { rerender } = render(<CloudCodePage api={api} />);
      await waitFor(() => expect(api.list).toHaveBeenCalled());
      changeCodeIdentity(switchKind === 'account' ? 'account-b' : 'account-a', 'auth-session-b');
      rerender(<CloudCodePage api={api} />);
      await screen.findByText('No cloud sessions yet.');
      await act(async () => {
        old.resolve({
          availability,
          sessions: [{ ...session, title: 'Old account private session' }],
          runtimes: [],
        });
      });
      expect(screen.queryByText('Old account private session')).not.toBeInTheDocument();
      expect(screen.getByText('No cloud sessions yet.')).toBeInTheDocument();
    },
  );

  it('does not publish an old turn approval or task into another selected session', async () => {
    const user = userEvent.setup();
    const old = codeDeferred<CloudCodeAgentTurn>();
    const nextSession: CloudCodeSession = {
      ...session,
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Second session',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session, nextSession], runtimes: [] })),
      get: vi.fn(async (id) => ({
        session: id === session.id ? session : nextSession,
        terminalEntries: [],
        turns: [],
      })),
      startAgentTurn: vi.fn(() => old.promise),
    });
    const { rerender } = render(<CloudCodePage api={api} sessionId={session.id} />);
    await screen.findByRole('heading', { name: session.title });
    await user.type(await enabledComposer(), 'Old session task');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));
    await waitFor(() => expect(api.startAgentTurn).toHaveBeenCalled());
    rerender(<CloudCodePage api={api} sessionId={nextSession.id} />);
    await screen.findByRole('heading', { name: nextSession.title });
    await act(async () => {
      old.resolve({
        turnId: '22222222-2222-4222-8222-222222222222',
        stopReason: 'awaiting_approval',
        stepsUsed: 1,
        finalMessage: 'Old session result',
        steps: [],
        pendingApproval: {
          stepIndex: 0,
          toolUseId: 'old-tool',
          command: 'old-private-command',
          reason: 'Old session approval reason',
        },
      });
    });
    expect(screen.queryByText('Old session approval reason')).not.toBeInTheDocument();
    expect(screen.queryByText('Old session result')).not.toBeInTheDocument();
    expect(screen.queryByText('Old session task')).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).not.toHaveValue('Old session task');
  });

  it.each(['resolve', 'reject'] as const)(
    'keeps the replacement turn busy after an A-to-B-to-A old %s',
    async (outcome) => {
      const user = userEvent.setup();
      const old = codeDeferred<CloudCodeAgentTurn>();
      const replacement = codeDeferred<CloudCodeAgentTurn>();
      const nextSession: CloudCodeSession = {
        ...session,
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Second session',
      };
      const api = createApi({
        list: vi.fn(async () => ({ availability, sessions: [session, nextSession], runtimes: [] })),
        get: vi.fn(async (id) => ({
          session: id === session.id ? session : nextSession,
          terminalEntries: [],
          turns: [],
        })),
        startAgentTurn: vi
          .fn()
          .mockReturnValueOnce(old.promise)
          .mockReturnValueOnce(replacement.promise),
      });
      const { rerender } = render(<CloudCodePage api={api} sessionId={session.id} />);
      await screen.findByRole('heading', { name: session.title });
      await user.type(await enabledComposer(), 'Original task');
      await user.click(screen.getByRole('button', { name: CODE_COPY.send }));
      await waitFor(() => expect(api.startAgentTurn).toHaveBeenCalledTimes(1));
      rerender(<CloudCodePage api={api} sessionId={nextSession.id} />);
      await screen.findByRole('heading', { name: nextSession.title });
      rerender(<CloudCodePage api={api} sessionId={session.id} />);
      await screen.findByRole('heading', { name: session.title });
      const field = await enabledComposer();
      await user.clear(field);
      await user.type(field, 'Replacement task');
      await user.click(screen.getByRole('button', { name: CODE_COPY.send }));
      await waitFor(() => expect(api.startAgentTurn).toHaveBeenCalledTimes(2));
      await user.type(field, 'Unsent next task');
      await act(async () => {
        if (outcome === 'reject') old.reject(new Error('The original turn failed.'));
        else
          old.resolve({
            turnId: '22222222-2222-4222-8222-222222222222',
            stopReason: 'awaiting_approval',
            stepsUsed: 1,
            finalMessage: 'Original result',
            steps: [],
            pendingApproval: {
              stepIndex: 0,
              toolUseId: 'old-tool',
              command: 'old-command',
              reason: 'Original approval',
            },
          });
      });
      expect(screen.getByRole('button', { name: CODE_COPY.stopTurn })).toBeEnabled();
      expect(field).toHaveValue('Unsent next task');
      expect(screen.queryByText('Original approval')).not.toBeInTheDocument();
      expect(screen.queryByText('Original result')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: CODE_COPY.stopTurn }));
      await waitFor(() => expect(api.cancelAgentTurn).toHaveBeenCalledWith(session.id));
      await act(async () =>
        replacement.resolve({
          turnId: '44444444-4444-4444-8444-444444444444',
          stopReason: 'done',
          stepsUsed: 1,
          finalMessage: 'Replacement result',
          steps: [],
        }),
      );
      expect(await screen.findByText('Replacement result')).toBeInTheDocument();
    },
  );

  it.each(['creating', 'provisioning'] as const)(
    'preserves an edited draft while %s and does not auto-start the old task',
    async (phase) => {
      const user = userEvent.setup();
      const creation = codeDeferred<Awaited<ReturnType<CloudCodeApi['create']>>>();
      const readiness = codeDeferred<Awaited<ReturnType<CloudCodeApi['get']>>>();
      const api = createApi({
        create: vi.fn(() => creation.promise),
        get: vi.fn(() => readiness.promise),
      });
      render(<CloudCodePage api={api} />);
      const field = await enabledComposer();
      await user.type(field, 'Original task');
      await user.click(screen.getByRole('button', { name: CODE_COPY.send }));
      await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
      if (phase === 'provisioning') {
        await act(async () =>
          creation.resolve({ session: { ...session, state: 'provisioning' }, terminalEntries: [] }),
        );
        await waitFor(() => expect(api.get).toHaveBeenCalledWith(session.id));
      }
      await user.clear(field);
      await user.type(field, 'Edited task');
      await act(async () => {
        if (phase === 'creating')
          creation.resolve({ session: { ...session, state: 'provisioning' }, terminalEntries: [] });
        else readiness.resolve({ session, terminalEntries: [], turns: [] });
      });
      expect(api.startAgentTurn).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: CODE_COPY.composerPlaceholder })).toHaveValue(
        'Edited task',
      );
      expect(screen.getByRole('button', { name: CODE_COPY.send })).toBeEnabled();
      if (phase === 'creating') {
        expect(api.get).not.toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
      }
    },
  );

  it('does not open or start the task of a session created after the person moved to another session', async () => {
    const user = userEvent.setup();
    const creation = codeDeferred<Awaited<ReturnType<CloudCodeApi['create']>>>();
    const other: CloudCodeSession = {
      ...session,
      id: '44444444-4444-4444-8444-444444444444',
      title: 'Other session',
    };
    const api = createApi({
      create: vi.fn(() => creation.promise),
      list: vi.fn(async () => ({ availability, sessions: [other], runtimes: [] })),
      get: vi.fn(async (id: string) => ({
        session: id === other.id ? other : session,
        terminalEntries: [],
        turns: [],
      })),
    });
    const { rerender } = render(<CloudCodePage api={api} />);
    const field = await enabledComposer();
    await user.type(field, 'Original task');
    await user.click(screen.getByRole('button', { name: CODE_COPY.send }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));

    rerender(<CloudCodePage api={api} sessionId={other.id} />);
    await screen.findByRole('heading', { name: other.title });
    await act(async () => creation.resolve({ session, terminalEntries: [] }));

    expect(push).not.toHaveBeenCalledWith(`/code/${session.id}`);
    expect(api.startAgentTurn).not.toHaveBeenCalled();
  });

  it.each([
    ['delete', 'selection'],
    ['close', 'selection'],
    ['delete', 'account'],
    ['close', 'account'],
  ] as const)(
    'does not dispatch an old %s confirmation after %s changes',
    async (action, change) => {
      const user = userEvent.setup();
      const original = { ...session, archivedAt: '2026-07-30T12:10:00.000Z' };
      const nextSession: CloudCodeSession = {
        ...session,
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Second session',
      };
      const api = createApi({
        list: vi.fn(async () => ({
          availability,
          sessions: [original, nextSession],
          runtimes: [],
        })),
        get: vi.fn(async (id) => ({
          session: id === session.id ? original : nextSession,
          terminalEntries: [],
          turns: [],
        })),
      });
      const { rerender } = render(<CloudCodePage api={api} sessionId={session.id} />);
      await screen.findByRole('heading', { name: session.title });
      await user.click(screen.getByRole('button', { name: CODE_COPY.sessionMenu }));
      await user.click(
        await screen.findByRole('menuitem', {
          name: action === 'delete' ? CODE_COPY.deleteSession : CODE_COPY.closeSession,
        }),
      );
      await screen.findByRole('alertdialog');
      if (change === 'selection') {
        rerender(<CloudCodePage api={api} sessionId={nextSession.id} />);
        await waitFor(() =>
          expect(api.get).toHaveBeenCalledWith(nextSession.id, expect.anything()),
        );
      } else {
        codeIdentity.sdk.user = { id: 'account-b' };
        codeIdentity.sdk.session = {
          id: 'auth-session-b',
          user: { id: 'account-b' },
          getToken: async () => 'token-b',
        };
      }
      const dialog = screen.getByRole('alertdialog');
      await user.click(
        within(dialog).getByRole('button', {
          name:
            action === 'delete' ? CODE_COPY.deleteSessionConfirm : CODE_COPY.closeSessionConfirm,
        }),
      );
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(api.deleteSession).not.toHaveBeenCalled();
      expect(api.close).not.toHaveBeenCalled();
    },
  );

  it('does not persist first-run completion from an old account response', async () => {
    useSettingsStore.setState({ codeFirstRunCompleted: false });
    const old = codeDeferred<Awaited<ReturnType<CloudCodeApi['list']>>>();
    const api = createApi({
      list: vi.fn(() =>
        codeIdentity.auth.sessionId === 'auth-session-a'
          ? old.promise
          : Promise.resolve({ availability, sessions: [], runtimes: [] }),
      ),
    });
    const { rerender } = render(<CloudCodePage api={api} />);
    await waitFor(() => expect(api.listRepositories).toHaveBeenCalled());
    changeCodeIdentity('account-b', 'auth-session-b');
    rerender(<CloudCodePage api={api} />);
    await screen.findByTestId('code-first-run');
    await act(async () => {
      old.resolve({ availability, sessions: [session], runtimes: [] });
    });
    expect(useSettingsStore.getState().codeFirstRunCompleted).toBe(false);
    expect(screen.getByTestId('code-first-run')).toBeInTheDocument();
  });

  it('shows an upgrade screen, not a composer, when the plan does not include Code', async () => {
    const api = createApi({
      list: vi.fn(async () => ({
        availability: { ...availability, planEntitled: false, planTier: 'free', maxSessions: 1 },
        sessions: [],
        runtimes: [],
      })),
    });
    render(<CloudCodePage api={api} />);

    expect(
      await screen.findByRole('heading', { name: `${PRODUCT_NAMES.code} is on paid plans` }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/upgrade');
    expect(
      screen.queryByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /What's up next/ })).not.toBeInTheDocument();
  });

  it('shows no upgrade screen to a plan that includes Code', async () => {
    render(<CloudCodePage api={createApi()} />);

    await screen.findByRole('heading', { name: "What's up next, Ada?" });
    expect(screen.queryByRole('link', { name: 'Upgrade' })).not.toBeInTheDocument();
  });

  it('opens on the home column with the greeting and the composer, not a create form', async () => {
    render(<CloudCodePage api={createApi()} />);

    expect(
      await screen.findByRole('heading', { name: "What's up next, Ada?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Build in an isolated cloud workspace/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Managed Code/i)).not.toBeInTheDocument();
  });

  it('opens the MCP servers page from the composer menu when this computer serves them', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Add to this session' }));
    await user.click(await screen.findByRole('menuitem', { name: 'MCP servers' }));
    expect(openSettings).toHaveBeenCalledWith('local-mcp');
  });

  it('places the usage card under the home greeting with the account plan', async () => {
    render(<CloudCodePage api={createApi()} />);

    await screen.findByRole('heading', { name: "What's up next, Ada?" });
    await waitFor(() =>
      expect(screen.getByTestId('code-usage-dashboard')).toHaveAttribute('data-plan-tier', 'pro'),
    );
  });

  it('keeps the full usage card on a wide screen', async () => {
    render(<CloudCodePage api={createApi()} />);

    await waitFor(() =>
      expect(screen.getByTestId('code-usage-dashboard')).toHaveAttribute('data-link-only', 'false'),
    );
  });

  it('puts folder setup ahead of collapsed usage in Electron and selects the folder that was picked', async () => {
    const user = userEvent.setup();
    host = { shell: 'electron' };
    const pickedFolder = folder({ rootId: 'root-added', name: 'picked project', sessions: [] });
    pickWorkspaceRoot.mockImplementationOnce(async () => {
      localGroups = [folder(), pickedFolder];
      return { id: pickedFolder.rootId };
    });
    render(<CloudCodePage api={createApi()} />);

    const home = within(await screen.findByTestId('code-home'));
    const choose = await home.findByRole('button', { name: LOCAL_CODE_COPY.chooseFolder });
    expect(home.getByTestId('code-usage-dashboard')).toHaveAttribute('data-collapsed', 'true');
    await user.click(choose);
    expect(pickWorkspaceRoot).toHaveBeenCalledWith('folder');
    expect(
      await screen.findByRole('button', { name: 'Change the folder: picked project' }),
    ).toBeInTheDocument();
    expect(
      home.queryByRole('button', { name: LOCAL_CODE_COPY.chooseFolder }),
    ).not.toBeInTheDocument();
  });

  describe('on a phone', () => {
    const wideWidth = window.innerWidth;
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
      window.matchMedia = ((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
    });

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: wideWidth });
      window.matchMedia = originalMatchMedia;
    });

    it('puts the button that opens the Code drawer before the title in the app header', async () => {
      render(<CloudCodePage api={createApi()} />);

      const slot = await screen.findByTestId('code-app-bar');
      const drawerButton = within(slot).getByRole('button', { name: 'Open session list' });
      expect(slot.firstElementChild).toBe(drawerButton);
      expect(drawerButton).toHaveAttribute('aria-expanded', 'false');
      expect(drawerButton).toHaveAttribute('aria-controls', 'code-rail-drawer');
      expect(slot).toHaveTextContent('Code');
    });

    it('puts the desktop tools button in the phone app header without a second Code title', async () => {
      const user = userEvent.setup();
      host = { shell: 'electron' };
      render(<CloudCodePage api={createApi()} />);

      const appBar = await screen.findByTestId('code-app-bar');
      const tools = within(appBar).getByRole('button', { name: 'Side panel' });
      expect(screen.getAllByText('Code', { exact: true })).toHaveLength(1);

      await user.click(tools);
      expect(screen.getByRole('complementary', { name: 'Panel shortcuts' })).toBeVisible();
      expect(tools).toHaveAttribute('aria-pressed', 'true');
    });

    it('swaps the usage card for a link to the usage page', async () => {
      render(<CloudCodePage api={createApi()} />);

      await screen.findByRole('heading', { name: "What's up next, Ada?" });
      await waitFor(() =>
        expect(screen.getByTestId('code-usage-dashboard')).toHaveAttribute(
          'data-link-only',
          'true',
        ),
      );
    });

    it('does not put the composer in focus when the home opens', async () => {
      render(<CloudCodePage api={createApi()} />);

      const composer = await screen.findByRole('textbox', {
        name: 'Describe a task or ask a question',
      });
      expect(composer).not.toHaveFocus();
    });
  });

  it('opens the microphone on the first press with no notice in between', async () => {
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => undefined));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    window.localStorage.clear();

    render(<CloudCodePage api={createApi()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start voice input' }));

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('explains when Voice settings disable the microphone without hiding it', async () => {
    useSettingsStore.setState({ dictationEnabled: false });
    render(<CloudCodePage api={createApi()} />);

    const microphone = await screen.findByRole('button', { name: CODE_COPY.startDictation });
    expect(microphone).toBeVisible();
    expect(microphone).toBeDisabled();
    expect(microphone).toHaveAccessibleDescription('Dictation is off in Voice settings');
  });

  it('shows the microphone beside the draft and only adds Send when the draft has content', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    const field = await enabledComposer();
    const attach = screen.getByRole('button', { name: 'Add to this session' });
    const mic = screen.getByRole('button', { name: 'Start voice input' });
    const send = () => screen.queryByRole('button', { name: 'Start the task' });
    expect(field.previousElementSibling).toBe(attach);
    expect(field.parentElement).toContainElement(mic);
    const frame = screen.getByTestId('code-composer-field');
    expect(frame.nextElementSibling).toBe(screen.getByTestId('code-composer-footer'));
    expect(send()).toBeNull();
    await user.type(field, '  ');
    expect(send()).toBeNull();
    await user.type(field, 'Run the tests');
    expect(send()).toBeEnabled();
    expect(send()?.nextElementSibling).toBe(mic);
    await user.clear(field);
    expect(send()).toBeNull();
    expect(mic).toBeVisible();
  });

  it('renders inside the shared app shell and keeps the rail destinations as links', async () => {
    render(<CloudCodePage api={createApi()} />);

    expect(await screen.findByTestId('web-app-shell')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Artifacts' })).toHaveAttribute(
      'href',
      '/chat/library?surface=artifact',
    );
    expect(screen.queryByRole('link', { name: 'Customize' })).not.toBeInTheDocument();
  });

  it('opens the existing Plugins settings from the Code sidebar', async () => {
    const user = userEvent.setup();
    openSettings.mockClear();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Plugins' }));
    expect(openSettings).toHaveBeenCalledExactlyOnceWith('plugins');
  });

  it('opens More as a menu beside the rail with the unpinned destinations', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    const more = await screen.findByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(more);

    const menu = await screen.findByRole('menu');
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(more.className).toContain('railRowActive');
    expect(within(menu).getByRole('menuitem', { name: 'Scheduled' })).toHaveAttribute(
      'href',
      '/chat/schedules',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Your computer' })).toHaveAttribute(
      'href',
      '/code/computer',
    );
    expect(within(menu).getByRole('link', { name: 'Work with local code' })).toHaveAttribute(
      'href',
      '/download',
    );
    expect(
      within(menu).getByRole('menuitem', { name: 'Open in the editor extension' }),
    ).toHaveAttribute('href', '/vscode-extension');
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
    const items = within(menu).getAllByRole('menuitem');
    expect(items[items.length - 1]).toHaveTextContent('Edit sidebar');
  });

  it('closes the More menu on Escape and drops the open highlight', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    const more = await screen.findByRole('button', { name: 'More' });
    await user.click(more);
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more.className).not.toContain('railRowActive');
  });

  it('pins and unpins rail items from the Customize sidebar dialog', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit sidebar' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit sidebar' });
    expect(within(dialog).getByText('Choose which items appear in your sidebar.')).toBeVisible();
    expect(within(dialog).getByRole('checkbox', { name: 'Artifacts' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Scheduled' })).not.toBeChecked();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Scheduled' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Artifacts' }));
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Scheduled' })).toHaveAttribute(
      'href',
      '/chat/schedules',
    );
    expect(screen.queryByRole('link', { name: 'Artifacts' })).not.toBeInTheDocument();
    expect(useSettingsStore.getState().codeRailPins).toEqual({ routines: true, artifacts: false });

    await user.click(screen.getByRole('button', { name: 'More' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Artifacts' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Scheduled' })).not.toBeInTheDocument();
  });

  it('closes the Customize sidebar dialog with its close button', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit sidebar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit sidebar' });

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toHaveFocus());
  });

  it('offers the other places to code from on an empty home', async () => {
    render(<CloudCodePage api={createApi()} />);

    const setup = await screen.findByRole('navigation', { name: 'Also code from' });
    expect(within(setup).getByRole('link', { name: 'Terminal' })).toHaveAttribute('href', '/cli');
    expect(within(setup).getByRole('link', { name: 'VS Code' })).toHaveAttribute(
      'href',
      '/vscode-extension',
    );
    expect(within(setup).getByRole('link', { name: 'Desktop app' })).toHaveAttribute(
      'href',
      '/download',
    );
  });

  it('drops the setup links once the account has a session', async () => {
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await screen.findAllByText(session.title);
    expect(screen.queryByRole('navigation', { name: 'Also code from' })).not.toBeInTheDocument();
  });

  it('shows the first-run setup to a new account with no sessions and no GitHub app', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ codeFirstRunCompleted: false });
    const api = createApi();
    render(<CloudCodePage api={api} />);

    const wizard = await screen.findByTestId('code-first-run');
    expect(
      within(wizard).getByRole('heading', { name: `Set up ${PRODUCT_NAMES.code}` }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith('all', expect.anything());

    await user.click(within(wizard).getByRole('button', { name: 'Get started' }));
    await user.click(within(wizard).getByRole('button', { name: 'Continue' }));
    await user.click(within(wizard).getByRole('button', { name: 'Skip this step' }));

    expect(await screen.findByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(screen.queryByTestId('code-first-run')).not.toBeInTheDocument();
    expect(useSettingsStore.getState().codeFirstRunCompleted).toBe(true);
  });

  it('skips the first-run setup and remembers it when the account already has sessions', async () => {
    useSettingsStore.setState({ codeFirstRunCompleted: false });
    const api = createApi({
      list: vi.fn(async (status?: string) => ({
        availability,
        sessions: status === 'all' ? [session] : [],
        runtimes: [],
      })),
    });
    render(<CloudCodePage api={api} />);

    expect(await screen.findByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(screen.queryByTestId('code-first-run')).not.toBeInTheDocument();
    await waitFor(() => expect(useSettingsStore.getState().codeFirstRunCompleted).toBe(true));
  });

  it('skips the first-run setup without remembering it when the plan has no environments', async () => {
    useSettingsStore.setState({ codeFirstRunCompleted: false });
    const api = createApi({
      list: vi.fn(async () => ({
        availability: { ...availability, planEntitled: false },
        sessions: [],
        runtimes: [],
      })),
    });
    render(<CloudCodePage api={api} />);

    expect(await screen.findByTestId('code-upgrade')).toBeInTheDocument();
    expect(screen.queryByTestId('code-first-run')).not.toBeInTheDocument();
    expect(useSettingsStore.getState().codeFirstRunCompleted).toBe(false);
  });

  it('says there are no sessions yet rather than showing an empty list', async () => {
    render(<CloudCodePage api={createApi()} />);

    const rail = await screen.findByRole('navigation', { name: 'Cloud sessions' });
    expect(within(rail).getByText('No cloud sessions yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show closed sessions' })).not.toBeInTheDocument();
  });

  it('hides closed sessions until the filter asks for them', async () => {
    const user = userEvent.setup();
    const closed: CloudCodeSession = {
      ...session,
      id: 'closed-1',
      title: 'Old run',
      state: 'closed',
    };
    const api = createApi({
      list: vi.fn(async (status?: string) => ({
        availability,
        sessions: status === 'open' ? [] : [closed],
        runtimes: [],
      })),
    });
    render(<CloudCodePage api={api} />);

    const rail = await screen.findByRole('navigation', { name: 'Cloud sessions' });
    expect(await within(rail).findByText('No open sessions.')).toBeInTheDocument();

    await user.click(await within(rail).findByRole('button', { name: 'Show closed sessions' }));

    expect(within(rail).getByRole('button', { name: 'Old run' })).toBeInTheDocument();
  });

  it('creates a session from the composer and starts the task as the first turn', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    const field = await enabledComposer();
    await user.type(field, 'Install dependencies and run the test suite');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryUrl: null,
          repositoryBranch: null,
          networkAccess: 'none',
          runtimeId: null,
        }),
      ),
    );
    await waitFor(() =>
      expect(api.startAgentTurn).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({
          goal: 'Install dependencies and run the test suite',
          model: getRoutingSlotModel('coding_balanced'),
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    expect(vi.mocked(api.create)).toHaveBeenCalledBefore(vi.mocked(api.startAgentTurn));
  });

  it('sends on Enter and keeps Shift+Enter for a newline', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    const field = await enabledComposer();
    await user.type(field, 'first line{Shift>}{Enter}{/Shift}second line');
    expect(api.create).not.toHaveBeenCalled();

    await user.type(field, '{Enter}');
    await waitFor(() => expect(api.create).toHaveBeenCalled());
  });

  it('leaves Enter to an input method while it composes and sends on the Enter after it', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    const field = await enabledComposer();
    await user.type(field, 'テストを実行して');
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(field, { key: 'Enter', keyCode: IME_PROCESSING_KEY_CODE });

    expect(api.create).not.toHaveBeenCalled();
    expect(field).toHaveValue('テストを実行して');

    fireEvent.compositionEnd(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() =>
      expect(api.startAgentTurn).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({ goal: 'テストを実行して' }),
      ),
    );
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it('leaves the slash command menu alone while an input method composes', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    const field = await enabledComposer();
    await user.type(field, '/');
    const menu = await screen.findByRole('listbox', { name: 'Slash command suggestions' });
    expect(within(menu).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(field, { key: 'ArrowDown', isComposing: true });
    fireEvent.keyDown(field, { key: 'Enter', keyCode: IME_PROCESSING_KEY_CODE });
    fireEvent.keyDown(field, { key: 'Escape', isComposing: true });

    expect(field).toHaveValue('/');
    const options = within(
      screen.getByRole('listbox', { name: 'Slash command suggestions' }),
    ).getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(
      within(screen.getByRole('listbox', { name: 'Slash command suggestions' })).getAllByRole(
        'option',
      )[1],
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('renders an agent reply as prose and the commands as one collapsible row', async () => {
    const user = userEvent.setup();
    const entry = {
      id: 'entry-1',
      sessionId: session.id,
      command: 'pnpm test',
      stdout: 'all green',
      stderr: '',
      exitCode: 0,
      startedAt: '2026-07-30T12:01:00.000Z',
      completedAt: '2026-07-30T12:01:02.000Z',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({ session, terminalEntries: [entry], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    const row = await screen.findByRole('button', { name: 'Ran a command' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('pnpm test')).not.toBeInTheDocument();

    await user.click(row);
    expect(screen.getByText('pnpm test')).toBeInTheDocument();
    expect(screen.getByText('all green')).toBeInTheDocument();
  });

  it('says earlier turns are missing only when the server returned the newest window', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({
        session,
        terminalEntries: [],
        turns: [],
        turnsTruncated: true,
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    expect(
      await screen.findByText('Earlier turns of this session are not shown here.'),
    ).toBeTruthy();
  });

  it('shows no earlier-turns notice for a complete transcript', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({ session, terminalEntries: [], turns: [], turnsTruncated: false })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText('Earlier turns of this session are not shown here.')).toBeNull();
  });

  it('groups consecutive commands into one row', async () => {
    const user = userEvent.setup();
    const entries = ['pnpm install', 'pnpm test', 'pnpm lint'].map((command, index) => ({
      id: `entry-${index}`,
      sessionId: session.id,
      command,
      stdout: '',
      stderr: '',
      exitCode: 0,
      startedAt: `2026-07-30T12:0${index + 1}:00.000Z`,
      completedAt: `2026-07-30T12:0${index + 1}:01.000Z`,
    }));
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({ session, terminalEntries: entries, turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    expect(await screen.findByRole('button', { name: 'Ran 3 commands' })).toBeInTheDocument();
  });

  it('prints a failed command on one line without expanding the group', async () => {
    const user = userEvent.setup();
    const entry = {
      id: 'entry-1',
      sessionId: session.id,
      command: 'pnpm test',
      stdout: '',
      stderr: 'boom',
      exitCode: 1,
      startedAt: '2026-07-30T12:01:00.000Z',
      completedAt: '2026-07-30T12:01:02.000Z',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({ session, terminalEntries: [entry], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    expect(await screen.findByText('pnpm test exited 1')).toBeInTheDocument();
  });

  it('shows every command the agent ran, with its output', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      startAgentTurn: vi.fn(async () => ({
        turnId: '22222222-2222-4222-8222-222222222222',
        stopReason: 'done' as const,
        stepsUsed: 1,
        finalMessage: 'Node 22 is installed.',
        steps: [
          {
            index: 1,
            toolName: 'run_command',
            label: 'node --version',
            output: 'v22.11.0\n[exit 0]',
            isError: false,
          },
        ],
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    const field = await enabledComposer();
    await user.type(field, 'print the node version');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    const row = await screen.findByRole('button', { name: 'node --version' });
    await user.click(row);
    expect(await screen.findByText(/v22\.11\.0/)).toBeInTheDocument();
  });

  it('keeps a live turn when the session read lands after it', async () => {
    const user = userEvent.setup();
    let releaseDetail = () => {};
    const detail = new Promise<void>((resolve) => {
      releaseDetail = resolve;
    });
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => {
        await detail;
        return { session, terminalEntries: [], turns: [] };
      }),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    const field = await enabledComposer();
    await user.type(field, 'run the tests');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));
    await waitFor(() => expect(api.startAgentTurn).toHaveBeenCalled());

    releaseDetail();

    expect(
      await screen.findByText('Installed dependencies and ran the tests.'),
    ).toBeInTheDocument();
  });

  it('keeps a failed turn in the transcript with a retry, and the task in the composer', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      startAgentTurn: vi.fn(async () => {
        throw new CloudCodeApiError('Code session is busy; wait and try again', 409);
      }),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    const field = await enabledComposer();
    await user.type(field, 'run the tests');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    expect(await screen.findByText('Code session is busy; wait and try again')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Run this task again' })).toBeInTheDocument();
    await waitFor(() => expect(field).toHaveValue('run the tests'));
  });

  it('stops a turn started elsewhere and follows cancellation after reopening', async () => {
    const user = userEvent.setup();
    const turn = {
      turnId: '33333333-3333-4333-8333-333333333333',
      goal: 'Continue a task from another window',
      mode: 'agent' as const,
      stepsUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
      finalMessage: '',
      errorMessage: null,
      createdAt: '2026-07-30T12:05:00.000Z',
      steps: [],
    };
    let cancelRequestedAt: string | null = null;
    let finished = false;
    const api = createApi({
      get: vi.fn(async () => ({
        session: { ...session, state: finished ? ('ready' as const) : ('running' as const) },
        terminalEntries: [],
        turns: [
          { ...turn, stopReason: finished ? ('cancelled' as const) : null, cancelRequestedAt },
        ],
      })),
      cancelAgentTurn: vi.fn(async () => {
        cancelRequestedAt = '2026-07-30T12:05:03.000Z';
        return { turnId: turn.turnId, requestedAt: cancelRequestedAt, durable: true };
      }),
    });
    const first = render(<CloudCodePage api={api} sessionId={session.id} />);
    const stop = await screen.findByRole('button', { name: 'Stop the task' });
    const field = await enabledComposer();
    await user.type(field, 'Keep this draft{Enter}');
    expect(api.startAgentTurn).not.toHaveBeenCalled();
    expect(field).toHaveValue('Keep this draft');
    await user.click(stop);
    expect(api.cancelAgentTurn).toHaveBeenCalledExactlyOnceWith(session.id, turn.turnId);
    expect(screen.getByRole('button', { name: 'Stopping the task' })).toBeDisabled();
    first.unmount();

    render(<CloudCodePage api={api} sessionId={session.id} />);
    expect(await screen.findByRole('button', { name: 'Stopping the task' })).toBeDisabled();
    finished = true;
    expect(await screen.findByText('Cancelled', undefined, { timeout: 6000 })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Stop(?:ping)? the task/ })).toBeNull();
    expect(api.cancelAgentTurn).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the transcript of a session it did not run in this tab', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({
        session,
        terminalEntries: [],
        turns: [
          {
            turnId: '33333333-3333-4333-8333-333333333333',
            goal: 'print the node version',
            mode: 'agent' as const,
            stopReason: 'done' as const,
            stepsUsed: 1,
            inputTokens: 1200,
            outputTokens: 340,
            cancelRequestedAt: null,
            finalMessage: 'Node 22 is installed.',
            errorMessage: null,
            createdAt: '2026-07-30T12:05:00.000Z',
            steps: [
              {
                index: 1,
                toolName: 'run_command',
                label: 'node --version',
                output: 'v22.11.0',
                isError: false,
              },
            ],
          },
        ],
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    expect(await screen.findByText('print the node version')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'node --version' })).toBeInTheDocument();
    expect(await screen.findByText('Node 22 is installed.')).toBeInTheDocument();
  });

  it('surfaces a pending approval inline and resumes the turn on approve', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      startAgentTurn: vi.fn(async () => ({
        turnId: '22222222-2222-4222-8222-222222222222',
        stopReason: 'awaiting_approval' as const,
        stepsUsed: 1,
        finalMessage: '',
        steps: [],
        pendingApproval: {
          stepIndex: 0,
          toolUseId: 'tool-1',
          command: 'pnpm install',
          reason: 'Installing dependencies writes to the workspace.',
        },
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    const field = await enabledComposer();
    await user.type(field, 'install deps');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    expect(await screen.findByText('Approval required')).toBeInTheDocument();
    expect(
      screen.getByText('Installing dependencies writes to the workspace.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve and continue' }));

    await waitFor(() =>
      expect(api.decideApproval).toHaveBeenCalledWith(session.id, {
        turnId: '22222222-2222-4222-8222-222222222222',
        stepIndex: 0,
        decision: 'approve',
      }),
    );
    expect(await screen.findByText('Tests pass.')).toBeInTheDocument();
  });

  it('re-reads approvals persisted by an earlier tab when a session is opened', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      listApprovals: vi.fn(async () => [
        {
          turnId: '33333333-3333-4333-8333-333333333333',
          stepIndex: 2,
          command: 'rm -rf build',
          reason: 'Deleting files is destructive.',
          goal: 'clean the build',
          expiresAt: '2026-07-30T12:30:00.000Z',
          createdAt: '2026-07-30T12:00:00.000Z',
        },
      ]),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    expect(await screen.findByText('Deleting files is destructive.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CODE_COPY.reject })).toBeEnabled();
  });

  it('shows the closed banner in the composer slot and no composer', async () => {
    const user = userEvent.setup();
    const closed: CloudCodeSession = { ...session, state: 'closed' };
    const api = createApi({
      list: vi.fn(async (status?: string) => ({
        availability,
        sessions: status === 'open' ? [] : [closed],
        runtimes: [],
      })),
      get: vi.fn(async () => ({ session: closed, terminalEntries: [], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    const rail = await screen.findByRole('navigation', { name: 'Cloud sessions' });
    await user.click(await within(rail).findByRole('button', { name: 'Show closed sessions' }));
    await user.click(await within(rail).findByRole('button', { name: closed.title }));

    expect(
      await screen.findByText('This session is closed. Start a new one to keep working.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New session' }));
    expect(
      await screen.findByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).toBeInTheDocument();
  });

  it('asks what closing a session destroys before closing it', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Close session' }));

    expect(await screen.findByText(/Uncommitted work is lost/)).toBeInTheDocument();
    expect(api.close).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Close session' }));
    await waitFor(() => expect(api.close).toHaveBeenCalledWith(session.id));
  });

  it('keeps the terminal and the run field behind the changes panel', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    expect(screen.queryByRole('textbox', { name: 'Command' })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Terminal' }));

    const command = await screen.findByRole('textbox', { name: 'Command' });
    await user.type(command, 'pwd');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(api.run).toHaveBeenCalledWith(session.id, 'pwd'));
    expect(await screen.findByText('/home/user')).toBeInTheDocument();
  });

  it('offers commit and push in the changes panel for a session with a repository', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/owner/repository',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [], turns: [] })),
      commit: vi.fn(async () => ({
        session: repoSession,
        push: { ok: true, output: 'pushed to origin/main', exitCode: 0 },
      })),
      changes: vi.fn(async () => ({
        session: repoSession,
        base: null,
        workingBranch: null,
        files: [],
        diff: '',
        diffTruncated: false,
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);
    expect(await screen.findByText('Isolated · owner/repository')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Changes' }));
    const message = await screen.findByRole('textbox', { name: 'Commit message' });
    await user.type(message, 'wire the settings toggle');
    await user.click(screen.getByRole('button', { name: 'Commit and push' }));

    await waitFor(() =>
      expect(api.commit).toHaveBeenCalledWith(repoSession.id, {
        message: 'wire the settings toggle',
      }),
    );
    expect(await screen.findByText('Pushed to the repository.')).toBeInTheDocument();
  });

  it('names the missing GitHub write record on a refused push and offers the reconnect action', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/owner/repository',
    };
    const reconnectMessage =
      'Reconnect GitHub to push or open pull requests. This connection was made before AGI recorded which repositories your GitHub account can write to.';
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [], turns: [] })),
      commit: vi.fn(async () => {
        throw new CloudCodeApiError(reconnectMessage, 400, 'github_reconnect_required');
      }),
      changes: vi.fn(async () => ({
        session: repoSession,
        base: null,
        workingBranch: null,
        files: [],
        diff: '',
        diffTruncated: false,
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);
    await user.click(screen.getByRole('button', { name: 'Changes' }));
    await user.type(await screen.findByRole('textbox', { name: 'Commit message' }), 'wire it');
    await user.click(screen.getByRole('button', { name: 'Commit and push' }));

    expect(await screen.findByText(reconnectMessage)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reconnect GitHub' })).toHaveAttribute(
      'href',
      '/api/github/install/start?returnPath=%2Fcode',
    );
  });

  it('offers no reconnect action when a push fails for another reason', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/owner/repository',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [], turns: [] })),
      commit: vi.fn(async () => {
        throw new CloudCodeApiError('Code session is busy; wait and try again', 409);
      }),
      changes: vi.fn(async () => ({
        session: repoSession,
        base: null,
        workingBranch: null,
        files: [],
        diff: '',
        diffTruncated: false,
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);
    await user.click(screen.getByRole('button', { name: 'Changes' }));
    await user.type(await screen.findByRole('textbox', { name: 'Commit message' }), 'wire it');
    await user.click(screen.getByRole('button', { name: 'Commit and push' }));

    expect(await screen.findByText('Code session is busy; wait and try again')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reconnect GitHub' })).not.toBeInTheDocument();
  });

  it('does not offer commit and push for a session with no repository', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Changes' }));

    expect(screen.queryByRole('textbox', { name: 'Commit message' })).not.toBeInTheDocument();
  });

  it('names the three network tiers on the environment chip and requires the full-internet acknowledgement', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    await openEnvironmentSettings(user);
    const tiers = await screen.findByRole('radiogroup', { name: 'Network access' });
    expect(within(tiers).getByText('Isolated')).toBeInTheDocument();
    expect(within(tiers).getByText('Trusted hosts')).toBeInTheDocument();

    await user.click(within(tiers).getByText('Full internet'));
    expect(screen.getByRole('button', { name: 'Open an empty environment' })).toBeDisabled();
    expect(screen.queryByLabelText('Extra allowed hosts')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Open an empty environment' })).toBeEnabled();
  });

  it('sends parsed extra hosts and omits them under full internet', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    await openEnvironmentSettings(user);
    const hosts = await screen.findByLabelText('Extra allowed hosts');
    await user.type(hosts, 'api.example.com, *.internal.example.com ,');
    await user.click(screen.getByRole('button', { name: 'Open an empty environment' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          networkAccess: 'none',
          extraHosts: ['api.example.com', '*.internal.example.com'],
        }),
      ),
    );
  });

  it('raises an isolated environment to trusted hosts when a repository is chosen', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));
    await user.click(await screen.findByRole('button', { name: 'Use a repository URL instead' }));
    await user.type(
      await screen.findByLabelText('Repository URL'),
      'https://github.com/owner/repository',
    );
    await user.click(screen.getByRole('button', { name: 'Use this repository' }));

    expect(await screen.findByRole('button', { name: /owner\/repository/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trusted hosts/ })).toBeInTheDocument();

    const field = await enabledComposer();
    await user.type(field, 'run the tests{Enter}');

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryUrl: 'https://github.com/owner/repository.git',
          networkAccess: 'trusted',
        }),
      ),
    );
  });

  it('offers the account’s sandbox images and sends the chosen one', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({
        availability,
        sessions: [],
        runtimes: [
          {
            id: 'tpl-base',
            name: 'base',
            kind: 'image' as const,
            summary: 'Plain Linux.',
            agentCommand: null,
            cpuCount: 2,
            memoryMB: 4096,
            diskSizeMB: 20480,
            isPublic: true,
          },
          {
            id: 'tpl-codex',
            name: 'codex',
            kind: 'harness' as const,
            summary: 'A coding agent CLI.',
            agentCommand: 'codex',
            cpuCount: 4,
            memoryMB: 8192,
            diskSizeMB: 40960,
            isPublic: true,
          },
        ],
      })),
    });
    render(<CloudCodePage api={api} />);

    await openEnvironmentSettings(user);
    const picker = await screen.findByLabelText('Coding harness');
    expect(picker).toBeEnabled();
    expect(
      screen.getByRole('option', { name: 'codex, A coding agent CLI · 4 vCPU, 8 GB RAM' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Coding agents' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Environments' })).toBeInTheDocument();

    await user.selectOptions(picker, 'tpl-codex');
    await user.click(screen.getByRole('button', { name: 'Open an empty environment' }));

    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(vi.mocked(api.create).mock.calls[0]![0]).toMatchObject({ runtimeId: 'tpl-codex' });
  });

  it('explains an empty catalogue instead of offering a picker that does nothing', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await openEnvironmentSettings(user);
    expect(await screen.findByLabelText('Coding harness')).toBeDisabled();
    expect(
      screen.getByText(/Managed Code is not configured for this deployment/i),
    ).toBeInTheDocument();
  });

  it('shows the exact headless command and the harness budget for a runtime with a registered runner', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({
        availability,
        sessions: [],
        runtimes: [
          {
            id: 'codex',
            name: 'Codex',
            kind: 'harness' as const,
            summary: 'A coding agent CLI.',
            agentCommand: 'codex',
            cpuCount: 4,
            memoryMB: 8192,
            diskSizeMB: 40960,
            isPublic: true,
          },
        ],
      })),
    });
    render(<CloudCodePage api={api} />);

    await openEnvironmentSettings(user);
    await user.selectOptions(await screen.findByLabelText('Coding harness'), 'codex');

    expect(
      screen.getByText(/codex exec --sandbox workspace-write --skip-git-repo-check --json/),
    ).toBeInTheDocument();
    expect(screen.getByText(/capped at 9 minutes/)).toBeInTheDocument();
  });

  it('falls back to the generic-loop copy when the runtime has no registered harness runner', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({
        availability,
        sessions: [],
        runtimes: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            kind: 'harness' as const,
            summary: 'Open-source agent harness.',
            agentCommand: 'openclaw',
            cpuCount: 2,
            memoryMB: 4096,
            diskSizeMB: 20480,
            isPublic: true,
          },
        ],
      })),
    });
    render(<CloudCodePage api={api} />);

    await openEnvironmentSettings(user);
    await user.selectOptions(await screen.findByLabelText('Coding harness'), 'openclaw');

    expect(screen.getByText(/generic tool-calling loop/)).toBeInTheDocument();
    expect(screen.queryByText(/capped at \d+ minutes/)).not.toBeInTheDocument();
  });

  it('is capability-honest when the deployment has no managed environment', async () => {
    const api = createApi({
      list: vi.fn(async () => ({
        availability: { ...availability, deploymentEnabled: false },
        sessions: [],
        runtimes: [],
      })),
    });
    render(<CloudCodePage api={api} />);

    expect(
      await screen.findByText(/Managed environments are not enabled on this deployment/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Start the task' })).toBeNull();
  });

  it('does not offer command execution for readable history when managed compute is unavailable', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({
        availability: { ...availability, deploymentEnabled: false },
        sessions: [session],
        runtimes: [],
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Terminal' }));

    const command = await screen.findByRole('textbox', { name: 'Command' });
    expect(command).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    expect(api.run).not.toHaveBeenCalled();
  });

  it('offers Retry on a failed load and reloads on click', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockResolvedValue({ availability, sessions: [], runtimes: [] });
    render(<CloudCodePage api={createApi({ list })} />);

    expect(
      await screen.findByText('You are going a little fast. Wait a moment and try again.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Retry/i }));

    await waitFor(() =>
      expect(list.mock.calls.filter((call) => call[0] === 'open')).toHaveLength(2),
    );
    expect(
      screen.queryByText('You are going a little fast. Wait a moment and try again.'),
    ).not.toBeInTheDocument();
  });

  it('offers status, environment and sort filters and clears them', async () => {
    const user = userEvent.setup();
    const trusted: CloudCodeSession = {
      ...session,
      id: 'trusted-1',
      title: 'Trusted run',
      networkAccess: 'trusted',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session, trusted], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    const rail = await screen.findByRole('navigation', { name: 'Cloud sessions' });
    expect(within(rail).getAllByRole('button')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Filter sessions' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Trusted hosts' }));

    expect(within(rail).getAllByRole('button')).toHaveLength(1);
    expect(within(rail).getByRole('button', { name: 'Trusted run' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter sessions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Clear filters' }));

    expect(within(rail).getAllByRole('button')).toHaveLength(2);
  });

  it('sorts the session list by title when asked', async () => {
    const user = userEvent.setup();
    const older: CloudCodeSession = {
      ...session,
      id: 'a-1',
      title: 'Alpha task',
      updatedAt: '2026-07-29T12:00:00.000Z',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session, older], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    const rail = await screen.findByRole('navigation', { name: 'Cloud sessions' });
    expect(within(rail).getAllByRole('button')[0]).toHaveTextContent(session.title);

    await user.click(screen.getByRole('button', { name: 'Filter sessions' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Title' }));

    expect(within(rail).getAllByRole('button')[0]).toHaveTextContent('Alpha task');
  });

  it('marks a running session with a dot instead of the archive glyph', async () => {
    const running: CloudCodeSession = { ...session, state: 'running' };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [running], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    expect(await screen.findByLabelText('Running')).toBeInTheDocument();
  });

  it('collapses the session column and offers a way back', async () => {
    const user = userEvent.setup();
    const openSearch = vi.fn();
    window.addEventListener('agi:open-search', openSearch, { once: true });
    render(<CloudCodePage api={createApi()} />);

    const collapse = await screen.findByRole('button', { name: 'Collapse the session list' });
    await user.click(collapse);

    expect(screen.queryByRole('navigation', { name: 'Cloud sessions' })).not.toBeInTheDocument();
    const expand = screen.getByRole('button', { name: 'Expand the session list' });
    expect(expand).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(openSearch).toHaveBeenCalledTimes(1);

    await user.click(expand);

    expect(await screen.findByRole('navigation', { name: 'Cloud sessions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse the session list' })).toHaveFocus();
  });

  it('restores the session list without closing the active local session', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    render(<CloudCodePage api={createApi()} />);

    const rail = within(await screen.findByTestId('local-code-section'));
    await user.click(await rail.findByRole('button', { name: /^Quote the readme/u }));
    const composer = within(await screen.findByTestId('local-code-composer')).getByRole('textbox');
    await user.type(composer, 'Keep this draft');
    await user.click(screen.getByRole('button', { name: 'Collapse the session list' }));
    await user.click(screen.getByRole('button', { name: 'Expand the session list' }));

    expect(await screen.findByTestId('local-code-section')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quote the readme' })).toBeInTheDocument();
    expect(composer).toHaveValue('Keep this draft');
  });

  it('handles the desktop sidebar command without changing the Chat sidebar preference', async () => {
    useUIStore.getState().setSidebarCollapsed(false);
    render(<CloudCodePage api={createApi()} />);
    await screen.findByRole('button', { name: 'Collapse the session list' });

    act(() => window.dispatchEvent(new Event('agi:toggle-sidebar', { cancelable: true })));

    expect(screen.getByRole('button', { name: 'Expand the session list' })).toHaveFocus();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('opens the session drawer at tablet widths from both Code home and a local session', async () => {
    const user = userEvent.setup();
    const width = window.innerWidth;
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 840 });
    window.matchMedia = (query) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    });
    host = {};
    localGroups = [folder()];
    try {
      render(<CloudCodePage api={createApi()} />);
      expect(await screen.findByRole('button', { name: 'Open session list' })).toBeInTheDocument();
      expect(screen.queryByTestId('code-app-bar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('local-code-section')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Open session list' }));
      const drawer = await screen.findByRole('dialog');
      await user.click(await within(drawer).findByRole('button', { name: /^Quote the readme/u }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(await screen.findByRole('heading', { name: 'Quote the readme' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Open session list' }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Open session list' })).toHaveFocus();
    } finally {
      window.matchMedia = originalMatchMedia;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    }
  });

  it('names the environment and the repository in one header chip', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      networkAccess: 'trusted',
      repositoryUrl: 'https://github.com/owner/repository',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);

    expect(await screen.findByText('Trusted hosts · owner/repository')).toBeInTheDocument();
  });

  it('lists what provisioning did behind the initialized session row', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/owner/repository',
      runtimeId: 'tpl-codex',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);
    await user.click(await screen.findByRole('button', { name: 'Initialized session' }));

    expect(screen.getByText('Set up a cloud container')).toBeInTheDocument();
    expect(screen.getByText('Cloned the repository')).toBeInTheDocument();
    expect(screen.getByText('Started the coding agent')).toBeInTheDocument();
  });

  it('says which provisioning steps were skipped for a bare session', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Initialized session' }));

    expect(screen.getByText('No repository was attached')).toBeInTheDocument();
    expect(screen.getByText('No coding agent was installed')).toBeInTheDocument();
  });

  it('reports a failed session in the initialized row instead of a clean checklist', async () => {
    const user = userEvent.setup();
    const failed: CloudCodeSession = {
      ...session,
      state: 'failed',
      lastError: 'The sandbox could not be attached',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [failed], runtimes: [] })),
      get: vi.fn(async () => ({ session: failed, terminalEntries: [], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, `${failed.title} Needs attention`);
    await user.click(await screen.findByRole('button', { name: 'Provisioning did not finish' }));

    expect(screen.getByText('The sandbox could not be attached')).toBeInTheDocument();
  });

  it('expands a command group into one card per command', async () => {
    const user = userEvent.setup();
    const entries = ['pnpm install', 'pnpm test'].map((command, index) => ({
      id: `entry-${index}`,
      sessionId: session.id,
      command,
      stdout: `output for ${command}`,
      stderr: '',
      exitCode: 0,
      startedAt: `2026-07-30T12:0${index + 1}:00.000Z`,
      completedAt: `2026-07-30T12:0${index + 1}:01.000Z`,
    }));
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({ session, terminalEntries: entries, turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Ran 2 commands' }));

    expect(screen.getByRole('button', { name: 'pnpm install' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pnpm test' })).toBeInTheDocument();
    expect(screen.getByText('output for pnpm install')).toBeInTheDocument();
  });

  it('expands every command row when the transcript view is verbose', async () => {
    const user = userEvent.setup();
    const entry = {
      id: 'entry-1',
      sessionId: session.id,
      command: 'pnpm test',
      stdout: 'all green',
      stderr: '',
      exitCode: 0,
      startedAt: '2026-07-30T12:01:00.000Z',
      completedAt: '2026-07-30T12:01:02.000Z',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({ session, terminalEntries: [entry], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    expect(screen.queryByText('all green')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    // Radix opens a submenu on hover or ArrowRight; a click on the trigger closes
    // the whole menu, so the keyboard path is the one a test can drive.
    (await screen.findByRole('menuitem', { name: 'Transcript view' })).focus();
    await user.keyboard('{ArrowRight}');
    await user.click(await screen.findByRole('menuitemradio', { name: 'Verbose' }));

    expect(await screen.findByText('all green')).toBeInTheDocument();
  });

  it('lists the changed files and their diff from the changes route', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/owner/repository',
      repositoryBranch: 'main',
      workingBranch: 'agi/run-the-test-suite',
    };
    const changes: CloudCodeApi['changes'] = vi.fn(async () => ({
      session: repoSession,
      base: 'main',
      workingBranch: 'agi/run-the-test-suite',
      files: [
        { path: 'apps/web/page.tsx', state: 'modified' as const },
        { path: 'notes.md', state: 'untracked' as const },
      ],
      diff: [
        'diff --git a/apps/web/page.tsx b/apps/web/page.tsx',
        '--- a/apps/web/page.tsx',
        '+++ b/apps/web/page.tsx',
        '@@ -1 +1 @@',
        '-const old = true;',
        '+const fresh = true;',
      ].join('\n'),
      diffTruncated: false,
    }));
    const api = createApi({
      changes,
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);
    await user.click(await screen.findByRole('button', { name: 'Changes' }));

    await waitFor(() => expect(changes).toHaveBeenCalledWith(repoSession.id, expect.anything()));
    expect(await screen.findByText('main')).toBeInTheDocument();
    expect(screen.getByText('agi/run-the-test-suite')).toBeInTheDocument();
    expect(screen.getByText('apps/web/page.tsx')).toBeInTheDocument();
    expect(screen.getByText('Untracked')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Modified apps/web/page.tsx' }));
    expect(await screen.findByText('+const fresh = true;')).toBeInTheDocument();
  });

  it('says there is nothing to show when the working tree is clean', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/owner/repository',
      workingBranch: 'agi/run-the-test-suite',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [], turns: [] })),
      changes: vi.fn(async () => ({
        session: repoSession,
        base: 'main',
        workingBranch: 'agi/run-the-test-suite',
        files: [],
        diff: '',
        diffTruncated: false,
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);
    await user.click(await screen.findByRole('button', { name: 'Changes' }));

    expect(await screen.findByText('No changes to show')).toBeInTheDocument();
  });

  it('opens a pull request and then links to the one it opened', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/owner/repository',
      workingBranch: 'agi/run-the-test-suite',
    };
    const opened: CloudCodeSession = {
      ...repoSession,
      pullRequestUrl: 'https://github.com/owner/repository/pull/7',
      pullRequestNumber: 7,
    };
    const createPullRequest: CloudCodeApi['createPullRequest'] = vi.fn(async () => ({
      session: opened,
      url: opened.pullRequestUrl ?? '',
      number: 7,
      alreadyOpen: false,
    }));
    const api = createApi({
      createPullRequest,
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [], turns: [] })),
      changes: vi.fn(async () => ({
        session: repoSession,
        base: 'main',
        workingBranch: 'agi/run-the-test-suite',
        files: [],
        diff: '',
        diffTruncated: false,
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);
    await user.click(await screen.findByRole('button', { name: 'Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));

    await waitFor(() => expect(createPullRequest).toHaveBeenCalledWith(repoSession.id));
    expect(await screen.findByRole('link', { name: 'Pull request #7' })).toHaveAttribute(
      'href',
      'https://github.com/owner/repository/pull/7',
    );
  });

  it('refuses a pull request without a working branch and says why', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/owner/repository',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [], turns: [] })),
      changes: vi.fn(async () => ({
        session: repoSession,
        base: 'main',
        workingBranch: null,
        files: [],
        diff: '',
        diffTruncated: false,
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);
    await user.click(await screen.findByRole('button', { name: 'Changes' }));

    expect(await screen.findByRole('button', { name: 'Create pull request' })).toBeDisabled();
    expect(
      screen.getByText('A pull request needs a repository and a working branch.'),
    ).toBeInTheDocument();
  });

  it('offers a stop while a turn runs and records the cancelled turn', async () => {
    const user = userEvent.setup();
    let finishTurn: (turn: CloudCodeAgentTurn) => void = () => undefined;
    const startAgentTurn: CloudCodeApi['startAgentTurn'] = vi.fn(
      () =>
        new Promise<CloudCodeAgentTurn>((resolve) => {
          finishTurn = resolve;
        }),
    );
    const cancelAgentTurn: CloudCodeApi['cancelAgentTurn'] = vi.fn(async () => ({
      turnId: 'turn-1',
      requestedAt: '2026-07-30T12:02:00.000Z',
    }));
    const api = createApi({
      startAgentTurn,
      cancelAgentTurn,
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.type(await enabledComposer(), 'run the tests{Enter}');

    const stop = await screen.findByRole('button', { name: 'Stop the task' });
    expect(screen.queryByRole('button', { name: 'Start the task' })).not.toBeInTheDocument();

    await user.click(stop);
    await waitFor(() => expect(cancelAgentTurn).toHaveBeenCalledWith(session.id));

    await act(async () => {
      finishTurn({
        turnId: 'turn-1',
        stopReason: 'cancelled',
        stepsUsed: 1,
        finalMessage: '',
        steps: [],
      });
    });

    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run this task again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start the task' })).toBeNull();
  });

  it('renames a session inline from the more menu', async () => {
    const user = userEvent.setup();
    const rename: CloudCodeApi['rename'] = vi.fn(async (_sessionId, title) => ({
      ...session,
      title,
    }));
    const api = createApi({
      rename,
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const field = await screen.findByRole('textbox', { name: 'Session title' });
    await user.clear(field);
    await user.type(field, 'Rewrite the changes panel{Enter}');

    await waitFor(() =>
      expect(rename).toHaveBeenCalledWith(session.id, 'Rewrite the changes panel'),
    );
    expect(
      await screen.findByRole('heading', { name: 'Rewrite the changes panel' }),
    ).toBeInTheDocument();
  });

  it('links a repository session to its security scan and hides it otherwise', async () => {
    const user = userEvent.setup();
    const repositorySession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/acme/app.git',
    };
    const api = createApi({
      list: vi.fn(async () => ({
        availability,
        sessions: [repositorySession],
        runtimes: [],
      })),
      get: vi.fn(async () => ({ session: repositorySession, terminalEntries: [], turns: [] })),
      changes: vi.fn(async () => ({
        session: repositorySession,
        base: null,
        workingBranch: null,
        files: [],
        diff: '',
        diffTruncated: false,
      })),
    });
    const { unmount } = render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Security scan' })).toHaveAttribute(
      'href',
      `/code/${session.id}/security`,
    );
    unmount();

    render(
      <CloudCodePage
        api={createApi({
          list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
        })}
      />,
    );
    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    await screen.findByRole('menuitem', { name: 'Rename' });
    expect(screen.queryByRole('menuitem', { name: 'Security scan' })).toBeNull();
  });

  it('keeps the rename field open long enough to type in it', async () => {
    const user = userEvent.setup();
    const rename: CloudCodeApi['rename'] = vi.fn(async (_sessionId, title) => ({
      ...session,
      title,
    }));
    const api = createApi({
      rename,
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const field = await screen.findByRole('textbox', { name: 'Session title' });
    await user.clear(field);
    await user.type(field, 'Committed by clicking away');
    await user.click(screen.getByRole('button', { name: 'Session actions' }));

    await waitFor(() =>
      expect(rename).toHaveBeenCalledWith(session.id, 'Committed by clicking away'),
    );
  });

  it('keeps what was typed when the rename field selects its title late', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    const frames: FrameRequestCallback[] = [];
    const frameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => frames.push(callback));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const field = await screen.findByRole('textbox', { name: 'Session title' });
    await user.clear(field);
    await user.type(field, 'A');
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    frameSpy.mockRestore();

    expect(field).toHaveValue('A');
    expect(field).toHaveProperty('selectionStart', 1);
    expect(field).toHaveProperty('selectionEnd', 1);
  });

  it('leaves Enter and Escape to an input method while the session title composes', async () => {
    const user = userEvent.setup();
    const rename: CloudCodeApi['rename'] = vi.fn(async (_sessionId, title) => ({
      ...session,
      title,
    }));
    const api = createApi({
      rename,
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const field = await screen.findByRole('textbox', { name: 'Session title' });
    await user.clear(field);
    await user.type(field, 'テストの修正');
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(field, { key: 'Escape', keyCode: IME_PROCESSING_KEY_CODE });

    expect(rename).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Session title' })).toHaveValue('テストの修正');

    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(rename).toHaveBeenCalledWith(session.id, 'テストの修正'));
  });

  it('archives a session and offers unarchive where the composer was', async () => {
    const user = userEvent.setup();
    const archived: CloudCodeSession = { ...session, archivedAt: '2026-07-30T12:10:00.000Z' };
    const setArchived: CloudCodeApi['setArchived'] = vi.fn(async (_sessionId, next) =>
      next ? archived : session,
    );
    const api = createApi({
      setArchived,
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));

    await waitFor(() => expect(setArchived).toHaveBeenCalledWith(session.id, true));
    expect(
      await screen.findByText(
        'This session is archived. Unarchive it to keep working in this session.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unarchive' }));

    await waitFor(() => expect(setArchived).toHaveBeenCalledWith(session.id, false));
    expect(
      await screen.findByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).toBeInTheDocument();
  });

  it('withholds delete until the session is closed or archived', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Session actions' }));

    const remove = await screen.findByRole('menuitem', { name: 'Delete' });
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText('Close or archive the session before deleting it.'),
    ).toBeInTheDocument();
  });

  it('deletes an archived session through the confirmation', async () => {
    const user = userEvent.setup();
    const archived: CloudCodeSession = { ...session, archivedAt: '2026-07-30T12:10:00.000Z' };
    const deleteSession: CloudCodeApi['deleteSession'] = vi.fn(async () => undefined);
    const api = createApi({
      deleteSession,
      list: vi.fn(async () => ({ availability, sessions: [archived], runtimes: [] })),
      get: vi.fn(async () => ({ session: archived, terminalEntries: [], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, archived.title);
    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(await screen.findByText('Delete this session?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The transcript, every command it ran and its approvals go with it. Nothing here can be recovered.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete session' }));

    await waitFor(() => expect(deleteSession).toHaveBeenCalledWith(archived.id));
    expect(await screen.findByRole('heading', { name: /What's up next/ })).toBeInTheDocument();
  });

  it('offers archived as a status filter and asks the route for it', async () => {
    const user = userEvent.setup();
    const list = vi.fn(async () => ({ availability, sessions: [], runtimes: [] }));
    render(<CloudCodePage api={createApi({ list })} />);

    await user.click(await screen.findByRole('button', { name: 'Filter sessions' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Archived' }));

    await waitFor(() => expect(list).toHaveBeenCalledWith('archived', expect.anything()));
  });

  it('reads the session context against the model window in the usage popover', async () => {
    const user = userEvent.setup();
    const used: CloudCodeSession = {
      ...session,
      contextInputTokens: 48000,
      contextOutputTokens: 13234,
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [used], runtimes: [] })),
      get: vi.fn(async () => ({ session: used, terminalEntries: [], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, used.title);
    await user.click(await screen.findByRole('button', { name: 'Usage' }));

    expect(await screen.findByText('Context window')).toBeInTheDocument();
    const window = getModelMetadata(getRoutingSlotModel('coding_balanced'))?.contextWindow;
    expect(window).toBeGreaterThan(0);
    expect(screen.getByText(contextWindowLabel(61234, window ?? 0))).toBeInTheDocument();
  });

  it('shows no context line on the home screen where no session is selected', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Usage' }));

    expect(await screen.findByText('Plan usage limits')).toBeInTheDocument();
    expect(screen.queryByText('Context window')).not.toBeInTheDocument();
  });

  it('waits for the stored approval mode rather than painting the default first', async () => {
    let resolvePolicy: (value: ToolApprovalPreferences) => void = () => undefined;
    vi.mocked(fetchPreferenceNamespace).mockReturnValueOnce(
      new Promise<ToolApprovalPreferences>((resolve) => {
        resolvePolicy = resolve;
      }) as ReturnType<typeof fetchPreferenceNamespace>,
    );
    render(<CloudCodePage api={createApi()} />);

    const trigger = await screen.findByRole('button', { name: 'Approval mode' });
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    expect(trigger).not.toHaveTextContent('Ask');
    expect(trigger).not.toHaveTextContent('Auto');

    await act(async () => {
      resolvePolicy({ defaultPolicy: 'auto_approve_read_only' });
    });

    await waitFor(() => expect(trigger).toHaveTextContent('Auto'));
    expect(trigger).toHaveAttribute('aria-busy', 'false');
  });

  it('opens a session at its own route', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/code/${session.id}`));
  });

  it('selects the session named in the url on a cold load', async () => {
    const get: CloudCodeApi['get'] = vi.fn(async () => ({
      session,
      terminalEntries: [],
      turns: [],
    }));
    const api = createApi({
      get,
      list: vi.fn(async () => ({ availability, sessions: [], runtimes: [] })),
    });
    render(<CloudCodePage api={api} sessionId={session.id} />);

    await waitFor(() => expect(get).toHaveBeenCalledWith(session.id, expect.anything()));
    expect(await screen.findByRole('heading', { name: session.title })).toBeInTheDocument();
  });

  it('sends an unknown session back to the home and says why', async () => {
    const api = createApi({
      get: vi.fn(async () => {
        throw new CloudCodeApiError('Not found', 404);
      }),
      list: vi.fn(async () => ({ availability, sessions: [], runtimes: [] })),
    });
    render(<CloudCodePage api={api} sessionId="55555555-5555-4555-8555-555555555555" />);

    expect(
      await screen.findByText('That session is not available. It may have been deleted.'),
    ).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/code?missing=1');
    expect(await screen.findByRole('heading', { name: /What's up next/ })).toBeInTheDocument();
    const notice = screen
      .getByText('That session is not available. It may have been deleted.')
      .closest('[role="status"]');
    expect(within(notice as HTMLElement).getByRole('button', { name: /Dismiss/ })).toBeVisible();
  });

  it('sends a session belonging to somebody else back to the home', async () => {
    const api = createApi({
      get: vi.fn(async () => {
        throw new CloudCodeApiError('Forbidden', 403);
      }),
      list: vi.fn(async () => ({ availability, sessions: [], runtimes: [] })),
    });
    render(<CloudCodePage api={api} sessionId="66666666-6666-4666-8666-666666666666" />);

    expect(
      await screen.findByText('That session is not available. It may have been deleted.'),
    ).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/code?missing=1');
  });

  it('navigates to the session it just created', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    await user.type(await enabledComposer(), 'run the tests{Enter}');

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/code/${session.id}`));
  });

  it('returns to the home route when a session is closed and left', async () => {
    const user = userEvent.setup();
    const closed: CloudCodeSession = { ...session, state: 'closed' };
    const api = createApi({
      list: vi.fn(async (status?: string) => ({
        availability,
        sessions: status === 'open' ? [] : [closed],
        runtimes: [],
      })),
      get: vi.fn(async () => ({ session: closed, terminalEntries: [], turns: [] })),
    });
    render(<CloudCodePage api={api} sessionId={closed.id} />);

    await user.click(await screen.findByRole('button', { name: 'New session' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/code'));
  });

  it('says so when the link cannot be copied rather than claiming it was', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {
      throw new Error('clipboard unavailable');
    });
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText,
    } as unknown as Clipboard);
    const shared = {
      ...session,
      shareVisibility: 'public' as const,
      shareAudience: 'public' as const,
      shareToken: 'AbCdEfGhIjKlMnOpQrStUvWx',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [shared], runtimes: [] })),
      get: vi.fn(async () => ({ session: shared, terminalEntries: [], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Share' }));
    await user.click(await screen.findByRole('button', { name: 'Copy link' }));

    expect(await screen.findByRole('button', { name: 'Could not copy the link' })).toBeVisible();
  });

  it('puts the error notice in the composer column, directly above the composer', async () => {
    const list = vi.fn().mockRejectedValue(new Error('HTTP 429'));
    render(<CloudCodePage api={createApi({ list })} />);

    const alert = await screen.findByRole('alert');
    const notices = screen.getByTestId('code-notices');
    const composerArea = screen.getByTestId('code-composer-area');

    expect(notices).toContainElement(alert);
    expect(notices.nextElementSibling).toBe(composerArea);
    expect(notices.parentElement).toBe(composerArea.parentElement);
    expect(screen.queryByTestId('code-scroll')).not.toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /Retry/ })).toBeVisible();
    expect(within(alert).getByRole('button', { name: /Dismiss/ })).toBeVisible();
  });

  it('keeps the notice out of the transcript scroll in a session', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/owner/repository',
      workingBranch: 'agi/run-the-test-suite',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [], turns: [] })),
      changes: vi.fn(async () => {
        throw new CloudCodeApiError('HTTP 429', 429);
      }),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);
    await user.click(await screen.findByRole('button', { name: 'Changes' }));

    const alert = await screen.findByRole('alert');
    const notices = screen.getByTestId('code-notices');
    const scroll = screen.getByTestId('code-scroll');

    expect(notices).toContainElement(alert);
    expect(scroll).not.toContainElement(alert);
    expect(notices.nextElementSibling).toBe(screen.getByTestId('code-composer-area'));
  });

  it.each([
    ['error' as const, 'Failed'],
    ['cancelled' as const, 'Cancelled'],
  ])('leaves no indicator behind after a turn that ended %s', async (stopReason, label) => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({
        session,
        terminalEntries: [],
        turns: [
          {
            turnId: '44444444-4444-4444-8444-444444444444',
            goal: 'run the tests',
            mode: 'agent' as const,
            stopReason,
            stepsUsed: 1,
            inputTokens: 0,
            outputTokens: 0,
            cancelRequestedAt: null,
            finalMessage: '',
            errorMessage: stopReason === 'error' ? 'The sandbox went away.' : null,
            createdAt: '2026-07-30T12:05:00.000Z',
            steps: [],
          },
        ],
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    const transcript = await screen.findByTestId('code-transcript');
    expect(within(transcript).getByText(label)).toBeInTheDocument();
    expect(transcript.querySelectorAll('[role="presentation"]')).toHaveLength(0);
    expect(within(transcript).queryByRole('status')).not.toBeInTheDocument();
  });

  it('says there is nothing to push for a session with no repository', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Changes' }));

    expect(
      await screen.findByText('This session has no repository, so there is nothing to push.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create pull request' })).not.toBeInTheDocument();
  });

  it('names the approval modes the capabilities settings define, with shortcuts', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Approval mode' }));

    expect(await screen.findByText('Mode')).toBeInTheDocument();
    expect(screen.getByText('Ask before every action')).toBeInTheDocument();
    expect(screen.getByText('Run read-only actions without asking')).toBeInTheDocument();
    expect(screen.queryByText('Steps per task')).not.toBeInTheDocument();
  });

  it('starts Cloud tasks without a step count from the composer', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);
    await user.type(await enabledComposer(), 'Read the project README{Enter}');

    await waitFor(() => expect(api.startAgentTurn).toHaveBeenCalledTimes(1));
    const input = vi.mocked(api.startAgentTurn).mock.calls[0]?.[1];
    expect(input).toEqual(expect.objectContaining({ goal: 'Read the project README' }));
    expect(input).not.toHaveProperty('maxSteps');
  });

  it('keeps a Cloud turn active when its session is opened from the new-task composer', async () => {
    const completion = codeDeferred<Awaited<ReturnType<CloudCodeApi['startAgentTurn']>>>();
    const approval = {
      turnId: 'turn-background',
      stepIndex: 0,
      command: 'Inspect the project files',
      reason: 'Reading the folder needs review',
      goal: 'Read the project README',
      expiresAt: '2026-11-24T08:00:00.000Z',
      createdAt: '2026-11-24T07:00:00.000Z',
    };
    let readyForApproval = false;
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      startAgentTurn: vi.fn(() => completion.promise),
      listApprovals: vi.fn(async () => (readyForApproval ? [approval] : [])),
    });
    const user = userEvent.setup();
    const { unmount } = render(<CloudCodePage api={api} />);
    const composer = await enabledComposer();
    await user.type(composer, 'Read the project README{Meta>}{Enter}{/Meta}');

    await waitFor(() => expect(composer).toHaveValue(''));
    expect(api.startAgentTurn).toHaveBeenCalledExactlyOnceWith(
      session.id,
      expect.objectContaining({ goal: approval.goal, idempotencyKey: expect.any(String) }),
    );
    expect(push).not.toHaveBeenCalled();
    unmount();

    render(<CloudCodePage api={api} sessionId={session.id} />);
    await user.click(await screen.findByRole('button', { name: 'Stop the task' }));
    expect(api.cancelAgentTurn).toHaveBeenCalledExactlyOnceWith(session.id);
    await act(async () => {
      readyForApproval = true;
      completion.resolve({
        turnId: approval.turnId,
        stopReason: 'awaiting_approval',
        stepsUsed: 1,
        finalMessage: '',
        steps: [],
      });
    });

    expect(await screen.findByText(approval.command)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Stop the task' })).toBeNull();
    expect(api.startAgentTurn).toHaveBeenCalledTimes(1);
  });

  it('restores an unedited Cloud draft when the turn fails before it is recorded', async () => {
    const api = createApi({
      startAgentTurn: vi.fn(async () => {
        throw new Error('The Cloud workspace did not start');
      }),
    });
    const user = userEvent.setup();
    render(<CloudCodePage api={api} />);
    const composer = await enabledComposer();
    await user.type(composer, 'Read the project README');
    await user.click(screen.getByRole('button', { name: 'Send options' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Send and stay here' }));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(session.id));
    await waitFor(() => expect(composer).toHaveValue('Read the project README'));
    expect(push).not.toHaveBeenCalled();
  });

  it('shows the repository and its branch as two chips plus a change control', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));
    await user.click(await screen.findByRole('button', { name: 'Use a repository URL instead' }));
    await user.type(
      await screen.findByLabelText('Repository URL'),
      'https://github.com/owner/repository',
    );
    await user.type(await screen.findByLabelText('Branch'), 'release');
    await user.click(screen.getByRole('button', { name: 'Use this repository' }));

    expect(await screen.findByRole('button', { name: 'owner/repository' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change the branch' })).toHaveTextContent('release');
    expect(screen.getByRole('button', { name: 'Change repository' })).toBeInTheDocument();
  });

  it('offers the two first-run steps when no github app is installed', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));

    expect(await screen.findByText('Two steps to work in your repository')).toBeInTheDocument();
    expect(screen.getByText('Connect your GitHub account')).toBeInTheDocument();
    expect(screen.getByText('Install the GitHub app')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect GitHub' })).toHaveAttribute(
      'href',
      '/api/github/install/start?returnPath=%2Fcode',
    );
    expect(screen.queryByLabelText('Repository URL')).not.toBeInTheDocument();
  });

  it('sends a typed repository URL with the task without a separate apply click', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));
    await user.click(await screen.findByRole('button', { name: 'Use a repository URL instead' }));
    await user.type(
      await screen.findByLabelText('Repository URL'),
      'https://github.com/owner/repository.git/',
    );
    await user.type(await screen.findByLabelText('Branch'), 'release');
    await user.type(await enabledComposer(), 'run the tests');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: null,
          repositoryUrl: 'https://github.com/owner/repository.git',
          repositoryBranch: 'release',
          networkAccess: 'trusted',
        }),
      ),
    );
    await waitFor(() =>
      expect(api.startAgentTurn).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({ goal: 'run the tests' }),
      ),
    );
  });

  it('keeps the task and does not create a session for an unsupported repository URL', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));
    await user.click(await screen.findByRole('button', { name: 'Use a repository URL instead' }));
    await user.type(
      await screen.findByLabelText('Repository URL'),
      'https://example.com/owner/repo',
    );
    await user.type(await enabledComposer(), 'run the tests');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only public HTTPS GitHub repository URLs in owner/repository form are supported.',
    );
    expect(api.create).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Describe a task or ask a question' })).toHaveValue(
      'run the tests',
    );
  });

  it('uses a newly typed URL instead of a repository chosen earlier', async () => {
    const user = userEvent.setup();
    const api = createApi({ listRepositories: vi.fn(async () => repositoryPage) });
    render(<CloudCodePage api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));
    await user.click(await screen.findByRole('button', { name: /owner\/public-one/ }));
    await user.click(await screen.findByRole('button', { name: 'owner/public-one' }));
    await user.click(await screen.findByRole('button', { name: 'Use a repository URL instead' }));
    await user.type(
      await screen.findByLabelText('Repository URL'),
      'https://github.com/other/private',
    );
    await user.type(await enabledComposer(), 'run the tests{Enter}');

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: null,
          repositoryUrl: 'https://github.com/other/private.git',
          networkAccess: 'trusted',
        }),
      ),
    );
  });

  it('starts the task once a provisioning session becomes ready', async () => {
    const user = userEvent.setup();
    const api = createApi({
      create: vi.fn(async () => ({
        session: {
          ...session,
          state: 'provisioning' as const,
          repositoryUrl: 'https://github.com/owner/repository.git',
        },
        terminalEntries: [],
        turns: [],
      })),
      get: vi.fn(async () => ({ session, terminalEntries: [], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await user.type(await enabledComposer(), 'run the tests{Enter}');

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(session.id));
    await waitFor(() => expect(api.startAgentTurn).toHaveBeenCalled());
  });

  it('does not send a second task while the first submission is still running', async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const api = createApi({
      create: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<CloudCodeApi['create']>>>((resolve) => {
            release = () => resolve({ session, terminalEntries: [] });
          }),
      ),
    });
    render(<CloudCodePage api={api} />);

    const field = await enabledComposer();
    await user.type(field, 'run the tests');
    const send = screen.getByRole('button', { name: 'Start the task' });
    await user.click(send);
    await user.click(send);
    release?.();

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
  });

  it('explains that GitHub is not configured instead of offering the install flow', async () => {
    const user = userEvent.setup();
    render(
      <CloudCodePage
        api={createApi({
          listRepositories: vi.fn(async () => ({
            repositories: [],
            installationCount: 0,
            truncated: false,
            unreachable: [],
            connection: { status: 'unconfigured' as const },
          })),
        })}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));

    expect(await screen.findByText('GitHub is not configured')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Connect GitHub' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Repository URL')).toBeInTheDocument();
  });

  it('asks to finish authorization when GitHub is installed but not confirmed', async () => {
    const user = userEvent.setup();
    render(
      <CloudCodePage
        api={createApi({
          listRepositories: vi.fn(async () => ({
            repositories: [],
            installationCount: 0,
            truncated: false,
            unreachable: [],
            connection: { status: 'authorization-pending' as const },
          })),
        })}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));

    expect(await screen.findByText('Finish connecting GitHub')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Finish GitHub authorization' })).toHaveAttribute(
      'href',
      '/api/github/install/start?returnPath=%2Fcode',
    );
    expect(screen.queryByText('Connect your GitHub account')).not.toBeInTheDocument();
  });

  it('offers reconnection when GitHub authorization can no longer list repositories', async () => {
    const user = userEvent.setup();
    render(
      <CloudCodePage
        api={createApi({
          listRepositories: vi.fn(async () => ({
            repositories: [],
            installationCount: 1,
            truncated: false,
            unreachable: [{ installationId: 11, accountLogin: 'acme' }],
            connection: { status: 'reauthorization-required' as const },
          })),
        })}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));

    expect(
      await screen.findByText(
        'GitHub authorization expired, was revoked, or has to be confirmed again before repositories can be listed.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reconnect GitHub' })).toHaveAttribute(
      'href',
      '/api/github/install/start?returnPath=%2Fcode',
    );
  });

  it('shows the GitHub result after returning from authorization', async () => {
    navigationState.search = 'github=connected';
    render(<CloudCodePage api={createApi()} />);

    expect(await screen.findByText('GitHub connected.')).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/code');
  });

  it('lists the installation repositories and sends the chosen one as a reference', async () => {
    const user = userEvent.setup();
    const api = createApi({ listRepositories: vi.fn(async () => repositoryPage) });
    render(<CloudCodePage api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));
    await user.click(await screen.findByRole('button', { name: /owner\/public-one/ }));

    expect(await screen.findByRole('button', { name: 'owner/public-one' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change the branch' })).toHaveTextContent('main');
    expect(screen.getByRole('button', { name: /Trusted hosts/ })).toBeInTheDocument();

    await user.type(await enabledComposer(), 'run the tests{Enter}');

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: { installationId: 42, fullName: 'owner/public-one', branch: 'main' },
          repositoryUrl: null,
          networkAccess: 'trusted',
        }),
      ),
    );
  });

  it('marks a private repository in the list', async () => {
    const user = userEvent.setup();
    render(
      <CloudCodePage api={createApi({ listRepositories: vi.fn(async () => repositoryPage) })} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));

    const row = await screen.findByRole('button', { name: /owner\/private-two/ });
    expect(within(row).getByLabelText('Private')).toBeInTheDocument();
  });

  it('passes the search text to the repositories route', async () => {
    const user = userEvent.setup();
    const listRepositories = vi.fn(async () => repositoryPage);
    render(<CloudCodePage api={createApi({ listRepositories })} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));
    await user.type(await screen.findByLabelText('Search repositories'), 'private');

    await waitFor(() =>
      expect(listRepositories).toHaveBeenCalledWith('private', expect.anything()),
    );
  });

  it('offers a retry when the repository list cannot be read', async () => {
    const user = userEvent.setup();
    const listRepositories = vi
      .fn<CloudCodeApi['listRepositories']>()
      .mockRejectedValueOnce(new CloudCodeApiError('Request failed (500).', 500))
      .mockResolvedValue(repositoryPage);
    render(<CloudCodePage api={createApi({ listRepositories })} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));

    expect(await screen.findByText('Repositories could not be loaded.')).toBeInTheDocument();
    expect(await screen.findByLabelText('Repository URL')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('button', { name: /owner\/public-one/ })).toBeInTheDocument();
  });

  it('edits the branch of a chosen repository from its chip', async () => {
    const user = userEvent.setup();
    const api = createApi({
      listRepositories: vi.fn(async () => repositoryPage),
      listBranches: vi.fn(async () => ({
        branches: [
          { name: 'main', isProtected: true },
          { name: 'release', isProtected: false },
        ],
        truncated: false,
      })),
    });
    render(<CloudCodePage api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));
    await user.click(await screen.findByRole('button', { name: /owner\/public-one/ }));
    await user.click(await screen.findByRole('button', { name: 'Change the branch' }));

    await user.click(await screen.findByRole('button', { name: /^release/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Change the branch' })).toHaveTextContent(
        'release',
      ),
    );
  });

  it('does not choose a searched branch while an input method composes', async () => {
    const user = userEvent.setup();
    const api = createApi({
      listRepositories: vi.fn(async () => repositoryPage),
      listBranches: vi.fn(async () => ({
        branches: [{ name: 'main', isProtected: true }],
        truncated: false,
      })),
    });
    render(<CloudCodePage api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));
    await user.click(await screen.findByRole('button', { name: /owner\/public-one/ }));
    await user.click(await screen.findByRole('button', { name: 'Change the branch' }));
    const search = await screen.findByRole('textbox', { name: 'Search branches' });
    await user.type(search, '機能');
    fireEvent.keyDown(search, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(search, { key: 'Enter', keyCode: IME_PROCESSING_KEY_CODE });

    expect(screen.getByRole('textbox', { name: 'Search branches' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change the branch' })).toHaveTextContent('main');

    fireEvent.keyDown(search, { key: 'Enter' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Change the branch' })).toHaveTextContent('機能'),
    );
  });

  it('does not apply a typed branch while an input method composes', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));
    await user.click(await screen.findByRole('button', { name: 'Use a repository URL instead' }));
    await user.type(
      await screen.findByLabelText('Repository URL'),
      'https://github.com/owner/repository',
    );
    await user.type(await screen.findByLabelText('Branch'), 'release');
    await user.click(screen.getByRole('button', { name: 'Use this repository' }));
    await user.click(await screen.findByRole('button', { name: 'Change the branch' }));

    const field = await screen.findByRole('textbox', { name: 'Branch' });
    await user.clear(field);
    await user.type(field, '修正');
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(field, { key: 'Enter', keyCode: IME_PROCESSING_KEY_CODE });

    expect(screen.getByRole('button', { name: 'Change the branch' })).toHaveTextContent('release');

    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Change the branch' })).toHaveTextContent('修正'),
    );
  });

  it('asks the shell for no rail and leaves the reader collapse choice alone', async () => {
    const { setSidebarCollapsed } = useUIStore.getState();
    setSidebarCollapsed(false);

    const view = render(<CloudCodePage api={createApi()} />);
    await screen.findByRole('heading', { name: /What's up next/ });

    expect(screen.getByTestId('web-app-shell').dataset['rail']).toBe('false');
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);

    view.unmount();

    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('keeps the approval rows to one line of guidance each', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Approval mode' }));

    const rows = (await screen.findAllByRole('menuitemradio')).filter((row) =>
      TOOL_APPROVAL_POLICY_OPTIONS.some((option) => row.textContent?.includes(option.label)),
    );
    expect(rows).toHaveLength(TOOL_APPROVAL_POLICY_OPTIONS.length);
    for (const option of TOOL_APPROVAL_POLICY_OPTIONS) {
      expect(screen.getByText(option.hint)).toBeInTheDocument();
      expect(screen.queryByText(option.description)).not.toBeInTheDocument();
    }
    const defaultIndex = TOOL_APPROVAL_POLICY_OPTIONS.findIndex(
      (option) => option.policy === WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_PREFERENCES.defaultPolicy,
    );
    expect(rows[defaultIndex]).toHaveAttribute('aria-checked', 'true');
  });

  it('holds the greeting until the account name resolves', async () => {
    greetingName = undefined;
    greetingResolved = false;
    render(<CloudCodePage api={createApi()} />);

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).not.toHaveTextContent("What's up next?");
  });

  it('shows the notebook panel for a code-interpreter session', async () => {
    const user = userEvent.setup();
    const notebookSession: CloudCodeSession = { ...session, runtimeId: NOTEBOOK_TEMPLATE_ID };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [notebookSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: notebookSession, terminalEntries: [], turns: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, notebookSession.title);

    expect(await screen.findByTestId('notebook-panel')).toHaveTextContent(notebookSession.id);
  });

  it('does not show the notebook panel for a harness session', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await screen.findByRole('button', { name: 'Changes' });

    expect(screen.queryByTestId('notebook-panel')).not.toBeInTheDocument();
  });
});

function folder(overrides: Partial<DeveloperSessionGroup> = {}): DeveloperSessionGroup {
  return {
    rootId: 'root-recent',
    name: 'qa-project',
    path: '/work/qa-project',
    branch: 'main',
    sessions: [localSession],
    ...overrides,
  };
}

describe('the environment the composer starts a session in', () => {
  it('filters Local Code sessions from the sidebar and opens the matched task', async () => {
    host = {};
    const other = { ...localSession, id: 'other-thread', title: 'Fix the tests' };
    localGroups = [folder({ sessions: [localSession, other] })];
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    const rail = within(await screen.findByTestId('code-rail-session-scroll'));
    expect(await rail.findByRole('button', { name: /^Fix the tests/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Search sessions' }));
    const field = screen.getByRole('searchbox', { name: 'Search sessions' });
    await user.type(field, 'unknown title');
    expect(await rail.findByText('No sessions match that search.')).toBeVisible();
    expect(rail.queryByRole('button', { name: /^Fix the tests/ })).toBeNull();
    expect(rail.queryByRole('button', { name: /^Quote the readme/ })).toBeNull();

    await user.clear(field);
    await user.type(field, 'QUOTE');
    expect(rail.queryByText('No sessions match that search.')).toBeNull();
    expect(rail.queryByRole('button', { name: /^Fix the tests/ })).toBeNull();
    await user.click(await rail.findByRole('button', { name: /^Quote the readme/ }));
    expect(
      await screen.findByRole('heading', { name: 'Quote the readme', level: 1 }),
    ).toBeVisible();
  });

  it('opens an older session found by the sidebar title search', async () => {
    host = {};
    localGroups = [folder()];
    const older = { ...localSession, id: 'older-task', title: 'Earlier build notes' };
    listDeveloperSessions.mockImplementation(async (options) => ({
      groups: options?.titleQuery ? [folder({ sessions: [older] })] : localGroups,
    }));
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    const rail = within(await screen.findByTestId('code-rail-session-scroll'));
    expect(rail.queryByRole('button', { name: /^Earlier build notes/u })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Search sessions' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search sessions' }), 'Earlier');
    await user.click(await rail.findByRole('button', { name: /^Earlier build notes/u }));
    expect(listDeveloperSessions).toHaveBeenCalledWith({
      titleQuery: 'Earlier',
      includeArchived: false,
    });
    expect(await screen.findByRole('heading', { level: 1, name: older.title })).toBeVisible();
  });

  it('names the cloud environment and keeps the network level under it, in a browser', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    expect(await screen.findByRole('button', { name: 'Cloud · Isolated' })).toBeInTheDocument();

    const menu = await openEnvironment(user);

    expect(within(menu).getByText('Cloud')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: /Isolated/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: /Trusted hosts/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: /Full internet/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Edit environment' })).toBeInTheDocument();
  });

  it('offers no local or remote row in a browser, where neither can be acted on', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    const menu = await openEnvironment(user);

    expect(within(menu).queryByText('Local')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Remote control')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Desktop only')).not.toBeInTheDocument();
    expect(within(menu).queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the host permission profile on a local draft instead of cloud approval settings', async () => {
    host = {};
    localGroups = [folder()];
    listDeveloperModels.mockImplementationOnce(async () => ({
      models: [],
      hostModels: [],
      defaultModelId: null,
      defaultAgentMode: 'auto' as const,
    }));
    render(<CloudCodePage api={createApi()} />);

    const permissions = await screen.findByText('Permissions: Auto');
    expect(permissions).toHaveAttribute(
      'title',
      'Edits files without asking. Asks before commands and git hook or MCP changes.',
    );
    expect(screen.queryByRole('button', { name: 'Approval mode' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ask before every action')).not.toBeInTheDocument();
  });

  it('starts a shell session in the folder used last, named on the chip', async () => {
    host = {};
    localGroups = [
      folder({ rootId: 'root-older', name: 'older-project', sessions: [localSession] }),
      folder({
        rootId: 'root-recent',
        sessions: [{ ...localSession, updatedAt: '2026-09-14T18:00:00Z' }],
      }),
    ];
    render(<CloudCodePage api={createApi()} />);

    expect(
      await screen.findByRole('button', { name: 'Change the folder: qa-project' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select repository' })).not.toBeInTheDocument();
  });

  it('opens supported tools on a new desktop draft without creating a coding session', async () => {
    const user = userEvent.setup();
    host = { shell: 'electron' };
    mockDraftBrowserSupported.mockResolvedValue(true);
    mockDraftSimulatorSupported.mockResolvedValue(true);
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Side panel' }));
    const launcher = within(screen.getByRole('complementary', { name: 'Panel shortcuts' }));
    expect(launcher.getByRole('button', { name: 'Browser' })).toBeVisible();
    expect(launcher.getByRole('button', { name: 'iOS Simulator' })).toBeVisible();
    expect(startDeveloperSession).not.toHaveBeenCalled();
    expect(startDeveloperTurn).not.toHaveBeenCalled();
  });

  it('explains that Terminal needs a folder and hides unsupported desktop tools', async () => {
    const user = userEvent.setup();
    host = { shell: 'electron' };
    render(<CloudCodePage api={createApi()} />);
    await user.click(await screen.findByRole('button', { name: 'Side panel' }));
    const launcher = within(screen.getByRole('complementary', { name: 'Panel shortcuts' }));

    expect(launcher.getByRole('button', { name: 'Terminal' })).toBeDisabled();
    expect(launcher.getByRole('button', { name: 'Terminal' })).toHaveAccessibleDescription(
      LOCAL_CODE_COPY.chooseFolder,
    );
    expect(launcher.getByText(LOCAL_CODE_COPY.chooseFolder)).toBeVisible();
    expect(launcher.queryByRole('button', { name: 'Browser' })).toBeNull();
    expect(launcher.queryByRole('button', { name: 'iOS Simulator' })).toBeNull();
  });

  it('reopens the selected Browser after collapsing the draft tools pane', async () => {
    const user = userEvent.setup();
    host = { shell: 'electron' };
    mockDraftBrowserSupported.mockResolvedValue(true);
    render(<CloudCodePage api={createApi()} />);

    const toggle = await screen.findByRole('button', { name: 'Side panel' });
    await user.click(toggle);
    await user.click(await screen.findByRole('button', { name: 'Browser' }));
    const browserPane = () => screen.queryByRole('complementary', { name: 'Browser' });
    expect(browserPane()).toBeVisible();
    await user.click(toggle);
    expect(browserPane()).toBeNull();
    await user.click(toggle);
    expect(browserPane()).toBeVisible();

    await user.click(within(browserPane()!).getByRole('button', { name: 'Close browser' }));
    expect(screen.getByRole('complementary', { name: 'Panel shortcuts' })).toBeVisible();
  });

  it('opens a terminal in the current folder and keeps a draft unsent', async () => {
    const user = userEvent.setup();
    host = { shell: 'electron' };
    localGroups = [folder()];
    render(<CloudCodePage api={createApi()} />);

    const composer = await enabledComposer();
    await user.type(composer, 'Keep this task in the draft');
    await user.click(screen.getByRole('button', { name: 'Side panel' }));
    await user.click(screen.getByRole('button', { name: 'Terminal' }));

    const dock = within(screen.getByTestId('local-terminal-dock'));
    expect(dock.getByRole('tab', { name: 'qa-project' })).toBeVisible();
    expect(composer).toHaveValue('Keep this task in the draft');
    expect(startDeveloperSession).not.toHaveBeenCalled();
    expect(startDeveloperTurn).not.toHaveBeenCalled();
  });

  it('keeps each workspace terminal mounted and only shows the active folder dock', async () => {
    const user = userEvent.setup();
    host = { shell: 'electron' };
    const other = {
      ...localSession,
      id: 'other-thread',
      rootId: 'other-root',
      title: 'Inspect the other folder',
      cwd: '/work/other-project',
    };
    localGroups = [
      folder(),
      folder({
        rootId: other.rootId,
        name: 'other-project',
        path: other.cwd,
        sessions: [other],
      }),
    ];
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      render(<CloudCodePage api={createApi()} />);
      await screen.findByRole('heading', { name: localSession.title });
      await user.click(screen.getByRole('button', { name: 'Terminal panel' }));
      const firstDock = screen.getByTestId('local-terminal-dock');
      await user.click(within(firstDock).getByRole('button', { name: 'New terminal' }));
      expect(within(firstDock).getAllByRole('tab')).toHaveLength(2);

      const rail = within(screen.getByTestId('code-rail-session-scroll'));
      await user.click(rail.getByRole('button', { name: /^Inspect the other folder/ }));
      await screen.findByRole('heading', { name: other.title });
      expect(firstDock).toBeInTheDocument();
      expect(firstDock).not.toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Terminal panel' }));
      expect(screen.getByRole('tab', { name: 'other-project' })).toBeVisible();
      const otherDock = screen
        .getAllByTestId('local-terminal-dock')
        .find((dock) => dock !== firstDock);
      expect(otherDock).toBeDefined();
      expect(firstDock).not.toBeVisible();

      await user.click(rail.getByRole('button', { name: /^Quote the readme/ }));
      await screen.findByRole('heading', { name: localSession.title });
      expect(firstDock).toBeVisible();
      expect(within(firstDock).getAllByRole('tab')).toHaveLength(2);
      expect(screen.queryByRole('tab', { name: 'other-project' })).toBeNull();

      const otherFolder = localGroups[1]!;
      localGroups = [
        folder({ unavailable: { message: 'Session list unavailable', hint: 'Try again.' } }),
        { ...otherFolder, sessionsWithheld: true, sessions: [] },
      ];
      act(() => workspaceChanges.forEach((notify) => notify()));
      await waitFor(() => expect(otherDock).not.toBeInTheDocument());
      expect(firstDock).toBeInTheDocument();
      expect(firstDock).not.toBeVisible();

      localGroups = [folder()];
      act(() => workspaceChanges.forEach((notify) => notify()));
      await waitFor(() => expect(firstDock).toBeVisible());
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('opens Terminal from an active Browser without hiding the browser or sending the draft', async () => {
    const user = userEvent.setup();
    host = { shell: 'electron' };
    localGroups = [folder()];
    mockDraftBrowserSupported.mockResolvedValue(true);
    render(<CloudCodePage api={createApi()} />);

    const composer = await enabledComposer();
    await user.type(composer, 'Keep this task in the draft');
    await user.click(screen.getByRole('button', { name: 'Side panel' }));
    await user.click(await screen.findByRole('button', { name: 'Browser' }));
    const browser = screen.getByRole('complementary', { name: 'Browser' });
    const tools = within(browser).getByRole('group', { name: 'Panel shortcuts' });
    expect(within(tools).getByRole('button', { name: 'Browser' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(tools).queryByRole('button', { name: 'iOS Simulator' })).toBeNull();
    await user.click(within(tools).getByRole('button', { name: 'Terminal' }));

    expect(await screen.findByTestId('local-terminal-dock')).toBeVisible();
    expect(browser).toBeVisible();
    expect(composer).toHaveValue('Keep this task in the draft');
    expect(startDeveloperTurn).not.toHaveBeenCalled();
  });

  it('toggles the desktop draft terminal from the shortcut and the View menu', async () => {
    const user = userEvent.setup();
    const setTerminalState = vi.fn();
    window.agiHost = hostBridgeStub({ setTerminalState });
    host = { shell: 'electron' };
    localGroups = [folder()];
    const view = render(<CloudCodePage api={createApi()} />);
    try {
      const composer = await enabledComposer();
      await user.type(composer, 'Keep this unsent task');
      expect(setTerminalState).toHaveBeenLastCalledWith({ available: true, open: false });
      fireEvent.keyDown(composer, { key: '`', ctrlKey: true });
      const terminal = await screen.findByTestId('local-terminal-dock');
      expect(terminal).toBeVisible();
      expect(setTerminalState).toHaveBeenLastCalledWith({ available: true, open: true });

      act(() => emitAppCommand('toggle-terminal'));
      expect(terminal).not.toBeVisible();
      expect(setTerminalState).toHaveBeenLastCalledWith({ available: true, open: false });
      expect(composer).toHaveValue('Keep this unsent task');
    } finally {
      view.unmount();
      delete window.agiHost;
    }
  });

  it('shows the folder, Local and the branch as three chips above the composer', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder({ branch: 'feature/a-very-long-branch-name-that-needs-clipping' })];
    render(<CloudCodePage api={createApi()} />);

    const folderChip = await screen.findByRole('button', {
      name: 'Change the folder: qa-project',
    });
    expect(folderChip).toHaveTextContent('qa-project');
    expect(screen.getByRole('button', { name: 'Local' })).toBeInTheDocument();
    const branchText = within(screen.getByRole('button', { name: 'Change the branch' })).getByText(
      'feature/a-very-long-branch-name-that-needs-clipping',
    );
    expect(branchText).toHaveClass('truncate');
    expect(branchText).toHaveAttribute(
      'title',
      'feature/a-very-long-branch-name-that-needs-clipping',
    );

    await user.click(folderChip);
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitemradio', { name: /qa-project/ })).toBeChecked();
  });

  it('checks out the branch picked from the public code page', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder({ branch: 'main' })];
    vi.mocked(listLocalBranches).mockResolvedValueOnce({
      current: 'main',
      branches: ['main', 'release'],
      remoteUrl: null,
      baseBranch: 'main',
    });
    vi.mocked(switchLocalBranch).mockClear();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Change the branch' }));
    await user.click(await screen.findByRole('button', { name: 'release' }));

    await waitFor(() => expect(switchLocalBranch).toHaveBeenCalledWith('root-recent', 'release'));
  });

  it('opens the local session a link names, on a cold load', async () => {
    replace.mockClear();
    host = {};
    localGroups = [folder({ rootId: 'root-recent', sessions: [localSession] })];
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      render(<CloudCodePage api={createApi()} />);

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Quote the readme' }),
      ).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalledWith('/code');
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('opens the local run named by the router after Code has mounted', async () => {
    host = {};
    localGroups = [folder()];
    const api = createApi();
    const { rerender } = render(<CloudCodePage api={api} />);
    await screen.findByRole('button', { name: /^Quote the readme/ });
    expect(screen.queryByRole('heading', { level: 1, name: 'Quote the readme' })).toBeNull();

    navigationState.search = 'local=root-recent&thread=thread-1';
    rerender(<CloudCodePage api={api} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Quote the readme' }),
    ).toBeVisible();
  });

  it('waits for the session list before calling a linked local session gone', async () => {
    replace.mockClear();
    hostAfterHydration = {};
    localGroups = [folder({ rootId: 'root-recent', sessions: [localSession] })];
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      const { rerender } = render(<CloudCodePage api={createApi()} />);
      await act(async () => {});
      expect(screen.queryByText('That coding session is not on this device any more.')).toBeNull();

      host = hostAfterHydration;
      rerender(<CloudCodePage api={createApi()} />);

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Quote the readme' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('That coding session is not on this device any more.')).toBeNull();
      expect(replace).not.toHaveBeenCalledWith('/code');
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('keeps a linked local session when its folder could not be read, and opens it on retry', async () => {
    const user = userEvent.setup();
    replace.mockClear();
    host = {};
    localGroups = [folder({ rootId: 'root-recent', sessions: [localSession] })];
    listDeveloperSessions.mockResolvedValueOnce({
      groups: [
        folder({
          rootId: 'root-recent',
          sessions: [],
          unavailable: { message: 'The session list timed out.', hint: 'Try again.' },
        }),
      ],
    });
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      render(<CloudCodePage api={createApi()} />);

      expect(await screen.findByText('The session list timed out. Try again.')).toBeInTheDocument();
      expect(screen.queryByText('That coding session is not on this device any more.')).toBeNull();
      expect(replace).not.toHaveBeenCalledWith('/code');

      await user.click(await screen.findByRole('button', { name: 'Retry' }));

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Quote the readme' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('The session list timed out. Try again.')).toBeNull();
      expect(replace).not.toHaveBeenCalledWith('/code');
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('keeps a linked local session when the whole list read fails, then opens it on retry', async () => {
    const user = userEvent.setup();
    replace.mockClear();
    host = {};
    localGroups = [folder({ rootId: 'root-recent', sessions: [localSession] })];
    listDeveloperSessions.mockRejectedValueOnce(new Error('bridge closed'));
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      render(<CloudCodePage api={createApi()} />);

      expect(
        await screen.findByText(
          'The coding sessions on this device could not be read, so that one is not open yet.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText('That coding session is not on this device any more.')).toBeNull();
      expect(replace).not.toHaveBeenCalledWith('/code');

      await user.click(await screen.findByRole('button', { name: 'Retry' }));

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Quote the readme' }),
      ).toBeInTheDocument();
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it.each([
    ['folder', 'root-linked'],
    ['worktree', worktreeRootId('root-linked', '0a1b2c3d')],
  ])('opens a linked local session in a %s after granting folder access', async (_, rootId) => {
    const user = userEvent.setup();
    replace.mockClear();
    host = {};
    const linkedSession = { ...localSession, rootId };
    const linkedFolder = folder({
      rootId: 'root-linked',
      name: 'linked-project',
      path: '/work/linked-project',
      sessions: [],
    });
    localGroups = [folder(), { ...linkedFolder, sessionsWithheld: true }];
    allowDeveloperSessions.mockImplementationOnce(async () => {
      const listed = { ...linkedFolder, rootId, sessions: [linkedSession] };
      localGroups =
        rootId === linkedFolder.rootId ? [folder(), listed] : [folder(), linkedFolder, listed];
      return true;
    });
    window.history.replaceState(
      {},
      '',
      `/code?local=${encodeURIComponent(rootId)}&thread=thread-1`,
    );
    try {
      render(<CloudCodePage api={createApi()} />);

      const notices = within(await screen.findByTestId('code-notices'));
      expect(await notices.findByText(LOCAL_CODE_COPY.sessionWithheld)).toBeInTheDocument();
      expect(screen.queryByText('That coding session is not on this device any more.')).toBeNull();
      expect(replace).not.toHaveBeenCalledWith('/code');
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();

      await user.click(
        notices.getByRole('button', { name: 'Allow running commands in linked-project' }),
      );

      expect(allowDeveloperSessions).toHaveBeenCalledExactlyOnceWith('root-linked');
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Quote the readme' }),
      ).toBeVisible();
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('shows one Capabilities action when the linked folder is also the refused draft folder', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder({ sessions: [], sessionsWithheld: true, commandAccessRefused: true })];
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      render(<CloudCodePage api={createApi()} />);

      const notices = within(await screen.findByTestId('code-notices'));
      expect(await notices.findByText(LOCAL_CODE_COPY.startCommandAccessDenied)).toBeVisible();
      expect(notices.queryByRole('button', { name: /Allow running commands/u })).toBeNull();
      await user.click(notices.getByRole('button', { name: LOCAL_CODE_COPY.reviewCommandAccess }));
      expect(openSettings).toHaveBeenCalledWith('capabilities');
      expect(allowDeveloperSessions).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('finds a linked local session outside the recent list and retries an interrupted lookup', async () => {
    const user = userEvent.setup();
    replace.mockClear();
    host = {};
    localGroups = [folder({ sessions: [] })];
    lookupDeveloperSession.mockRejectedValueOnce(new Error('bridge closed'));
    lookupDeveloperSession.mockResolvedValueOnce(localSession);
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      render(<CloudCodePage api={createApi()} />);
      await user.click(await screen.findByRole('button', { name: 'Retry' }));
      expect(lookupDeveloperSession).toHaveBeenCalledTimes(2);
      expect(lookupDeveloperSession).toHaveBeenLastCalledWith('root-recent', 'thread-1');
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Quote the readme' }),
      ).toBeVisible();
      expect(replace).not.toHaveBeenCalledWith('/code');
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('says a linked local session is gone after its workspace lookup confirms it', async () => {
    replace.mockClear();
    host = {};
    localGroups = [folder({ rootId: 'root-recent', sessions: [] })];
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      render(<CloudCodePage api={createApi()} />);

      expect(
        await screen.findByText('That coding session is not on this device any more.'),
      ).toBeInTheDocument();
      expect(lookupDeveloperSession).toHaveBeenCalledExactlyOnceWith('root-recent', 'thread-1');
      expect(replace).toHaveBeenCalledWith('/code');
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('keeps what was typed in a local session for when it is opened again', async () => {
    const user = userEvent.setup();
    host = {};
    const other = { ...localSession, id: 'thread-2', title: 'Fix the build' };
    localGroups = [folder({ rootId: 'root-recent', sessions: [localSession, other] })];
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      render(<CloudCodePage api={createApi()} />);
      await screen.findByRole('heading', { level: 1, name: 'Quote the readme' });
      const box = () =>
        within(screen.getByTestId('local-code-composer')).getByRole('textbox') as HTMLElement;
      await user.type(box(), 'half a thought');

      await user.click(screen.getByRole('button', { name: /^Fix the build/u }));
      await screen.findByRole('heading', { level: 1, name: 'Fix the build' });
      expect(box()).toHaveValue('');

      await user.click(screen.getByRole('button', { name: /^Quote the readme/u }));
      await screen.findByRole('heading', { level: 1, name: 'Quote the readme' });
      expect(box()).toHaveValue('half a thought');
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('shows where the removed work is kept after a worktree session closes', async () => {
    const user = userEvent.setup();
    host = {};
    const inWorktree = { ...localSession, rootId: WORKTREE_ROOT_ID };
    localGroups = [
      folder({ sessions: [] }),
      folder({
        rootId: WORKTREE_ROOT_ID,
        name: 'qa-project · worktree 0a1b2c3d',
        branch: null,
        sessions: [inWorktree],
        worktree: {
          id: '0a1b2c3d',
          rootId: 'root-recent',
          path: '/home/qa/.agiworkforce/worktrees/qa/0a1b2c3d/checkout',
          label: null,
          start: { kind: 'ref', name: 'HEAD' },
          baseCommit: 'abc',
          createdAt: '2026-10-10T10:00:00Z',
          threadId: 'thread-1',
          pinned: false,
          active: true,
          missing: false,
          setupScript: null,
          setupExitCode: null,
          setupRanAt: null,
        },
      }),
    ];
    deleteLocalWorktree.mockResolvedValueOnce({
      snapshotRef: 'refs/agiworkforce/worktree-archive/thread-1/0a1b2c3d',
    });
    window.history.replaceState(
      {},
      '',
      `/code?local=${encodeURIComponent(WORKTREE_ROOT_ID)}&thread=thread-1`,
    );
    try {
      render(<CloudCodePage api={createApi()} />);

      await user.click(await screen.findByRole('button', { name: 'Review changes' }));
      await user.click(await screen.findByRole('button', { name: 'Remove worktree' }));
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
      );

      const notice = await screen.findByTestId('local-worktree-removed');
      expect(notice).toHaveTextContent(
        'Everything it held is kept in refs/agiworkforce/worktree-archive/thread-1/0a1b2c3d.',
      );
      expect(screen.queryByTestId('local-review-pane')).not.toBeInTheDocument();
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('starts each local session with its own empty message box', async () => {
    const user = userEvent.setup();
    host = {};
    const other = { ...localSession, id: 'thread-2', title: 'Fix the build' };
    localGroups = [folder({ rootId: 'root-recent', sessions: [localSession, other] })];
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      render(<CloudCodePage api={createApi()} />);
      await screen.findByRole('heading', { level: 1, name: 'Quote the readme' });
      const box = () =>
        within(screen.getByTestId('local-code-composer')).getByRole('textbox') as HTMLElement;
      await user.type(box(), 'only for the first session');

      await user.click(screen.getByRole('button', { name: /^Fix the build/u }));

      await screen.findByRole('heading', { level: 1, name: 'Fix the build' });
      expect(box()).toHaveValue('');
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('deletes a local session, says what was kept, and discards archives only on a second ask', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder({ rootId: 'root-recent', sessions: [localSession] })];
    deleteDeveloperThread
      .mockResolvedValueOnce({
        acknowledged: true,
        keptWorktreeArchives: ['refs/agi/archive/a1', 'refs/agi/archive/b2'],
        removedWorktreeArchives: [],
        releasedWorktrees: ['a1b2c3d4'],
      })
      .mockResolvedValueOnce({
        acknowledged: true,
        keptWorktreeArchives: [],
        removedWorktreeArchives: ['refs/agi/archive/a1', 'refs/agi/archive/b2'],
        releasedWorktrees: [],
      });
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      render(<CloudCodePage api={createApi()} />);

      await user.click(await screen.findByRole('button', { name: CODE_COPY.sessionMenu }));
      await user.click(
        within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Delete session' }),
      );
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Delete session',
        }),
      );

      const notice = await screen.findByTestId('local-session-deleted');
      expect(notice).toHaveTextContent('Session deleted.');
      expect(notice).toHaveTextContent('The worktree it used is free for another session.');
      expect(notice).toHaveTextContent('2 worktree archives with uncommitted work were kept.');
      expect(deleteDeveloperThread).toHaveBeenCalledTimes(1);
      expect(deleteDeveloperThread).toHaveBeenLastCalledWith({
        rootId: 'root-recent',
        threadId: 'thread-1',
      });

      await user.click(within(notice).getByRole('button', { name: 'Delete them too' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveTextContent('uncommitted work in them cannot be recovered');
      expect(deleteDeveloperThread).toHaveBeenCalledTimes(1);

      await user.click(within(dialog).getByRole('button', { name: 'Delete archives' }));
      await waitFor(() =>
        expect(deleteDeveloperThread).toHaveBeenLastCalledWith({
          rootId: 'root-recent',
          threadId: 'thread-1',
          discardWorktreeArchives: true,
        }),
      );
      expect(await screen.findByText(/2 worktree archives were deleted\./u)).toBeInTheDocument();
      expect(
        within(screen.getByTestId('local-session-deleted')).queryByRole('button', {
          name: 'Delete them too',
        }),
      ).not.toBeInTheDocument();
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('asks to run commands in a folder whose sessions are withheld, then lists them', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder({ sessions: [], sessionsWithheld: true })];
    allowDeveloperSessions.mockImplementationOnce(async () => {
      localGroups = [folder()];
      return true;
    });
    render(<CloudCodePage api={createApi()} />);

    const rail = within(await screen.findByTestId('local-code-section'));
    expect(await rail.findByText(LOCAL_CODE_COPY.sessionsWithheld)).toBeInTheDocument();
    expect(listDeveloperModels).not.toHaveBeenCalled();
    await user.click(rail.getByRole('button', { name: 'Allow running commands' }));

    expect(allowDeveloperSessions).toHaveBeenCalledWith('root-recent');
    await waitFor(() => expect(listDeveloperModels).toHaveBeenCalledWith('root-recent', {}));
    expect(await rail.findByText('Quote the readme')).toBeInTheDocument();
    expect(rail.queryByText(/to see its sessions/)).not.toBeInTheDocument();
  });

  it('says a refusal lasts, and treats a dismissed prompt as nothing decided', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder({ sessions: [], sessionsWithheld: true })];
    allowDeveloperSessions
      .mockRejectedValueOnce(
        new DesktopRuntimeError({ code: 'cancelled', message: 'Nothing was allowed.' }),
      )
      .mockRejectedValueOnce(
        new DesktopRuntimeError({
          code: 'permission-denied',
          message: 'Permission to shell execute in qa-project was not granted.',
        }),
      );
    render(<CloudCodePage api={createApi()} />);
    const rail = within(await screen.findByTestId('local-code-section'));

    await user.click(await rail.findByRole('button', { name: 'Allow running commands' }));
    await waitFor(() => expect(allowDeveloperSessions).toHaveBeenCalledTimes(1));
    expect(rail.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(rail.getByRole('button', { name: 'Allow running commands' }));
    expect(await rail.findByRole('alert')).toHaveTextContent(
      'Running commands in this folder was refused.',
    );
  });

  it('opens the shell review for a project MCP server that waits, then drops the row once it is allowed', async () => {
    const user = userEvent.setup();
    host = {};
    const github = { name: 'github', scope: 'project' as const };
    localGroups = [folder({ mcpAwaitingApproval: [github] })];
    reviewDeveloperMcpServer.mockImplementationOnce(async () => {
      localGroups = [folder()];
      return { outcome: 'approved' };
    });
    render(<CloudCodePage api={createApi()} />);
    const rail = within(await screen.findByTestId('local-code-section'));

    expect(await rail.findByText(/The MCP server github has not started\./u)).toBeInTheDocument();
    await user.click(rail.getByRole('button', { name: 'Review github…' }));

    expect(reviewDeveloperMcpServer).toHaveBeenCalledWith('root-recent', github);
    await waitFor(() =>
      expect(rail.queryByText(/The MCP server github has not started\./u)).not.toBeInTheDocument(),
    );
    expect(rail.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the row and says why when a review is declined or the CLI refuses it', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder({ mcpAwaitingApproval: [{ name: 'github', scope: 'project' }] })];
    reviewDeveloperMcpServer.mockResolvedValueOnce({ outcome: 'declined' }).mockResolvedValueOnce({
      outcome: 'refused',
      message: "MCP server 'github' is no longer declared by this project",
    });
    render(<CloudCodePage api={createApi()} />);
    const rail = within(await screen.findByTestId('local-code-section'));

    await user.click(await rail.findByRole('button', { name: 'Review github…' }));
    await waitFor(() => expect(reviewDeveloperMcpServer).toHaveBeenCalledTimes(1));
    expect(await rail.findByRole('button', { name: 'Review github…' })).toBeEnabled();
    expect(rail.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(rail.getByRole('button', { name: 'Review github…' }));
    expect(await rail.findByRole('alert')).toHaveTextContent('no longer declared by this project');
  });

  it('renames the open local session in the header and sidebar without leaving the session', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    renameDeveloperThread.mockImplementationOnce(async (_rootId, _threadId, title) => {
      const renamed = { ...localSession, title };
      localGroups = [folder({ sessions: [renamed] })];
      return renamed;
    });
    render(<CloudCodePage api={createApi()} />);

    const rail = within(await screen.findByTestId('local-code-section'));
    await user.click(await rail.findByRole('button', { name: /^Quote the readme/u }));
    const composer = within(await screen.findByTestId('local-code-composer')).getByRole('textbox');
    await user.type(composer, 'Still drafting');
    await user.click(screen.getByRole('button', { name: 'Rename: Quote the readme' }));
    const input = screen.getByRole('textbox', { name: 'Session name' });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, 'Readme follow-up{Enter}');

    expect(await screen.findByRole('heading', { name: 'Readme follow-up' })).toBeInTheDocument();
    expect(await rail.findByRole('button', { name: /^Readme follow-up/u })).toBeInTheDocument();
    expect(renameDeveloperThread).toHaveBeenCalledExactlyOnceWith(
      localSession.rootId,
      localSession.id,
      'Readme follow-up',
    );
    expect(composer).toHaveValue('Still drafting');
  });

  it('keeps a refused sidebar rename editable and returns focus to the saved row action', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    const first = codeDeferred<LocalDeveloperSession>();
    renameDeveloperThread
      .mockReturnValueOnce(first.promise)
      .mockImplementationOnce(async (_rootId, _threadId, title) => {
        const renamed = { ...localSession, title };
        localGroups = [folder({ sessions: [renamed] })];
        return renamed;
      });
    render(<CloudCodePage api={createApi()} />);

    const rail = within(await screen.findByTestId('local-code-section'));
    await user.click(
      await rail.findByRole('button', { name: 'More actions for Quote the readme' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const input = rail.getByRole('textbox', { name: 'Session name' });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, 'Readme follow-up{Enter}');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Readme follow-up');
    expect(input).toHaveAttribute('readonly');
    await user.keyboard('{Enter}');
    expect(renameDeveloperThread).toHaveBeenCalledTimes(1);

    await act(async () => first.reject(new Error('Could not write the title. Try again.')));
    expect(await rail.findByRole('alert')).toHaveTextContent('Could not write the title');
    expect(input).toHaveValue('Readme follow-up');
    expect(input).toHaveFocus();
    expect(input).not.toHaveAttribute('readonly');
    await user.tab();
    expect(renameDeveloperThread).toHaveBeenCalledTimes(1);
    await user.click(input);
    await user.keyboard('{Enter}');

    const actions = await rail.findByRole('button', { name: 'More actions for Readme follow-up' });
    expect(actions).toHaveFocus();
    expect(renameDeveloperThread).toHaveBeenCalledTimes(2);
  });

  it('archives a local session, closes it, and says how to bring it back', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder({ rootId: 'root-recent', sessions: [localSession] })];
    archiveDeveloperThread.mockResolvedValueOnce(true);
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      render(<CloudCodePage api={createApi()} />);

      await user.click(await screen.findByRole('button', { name: CODE_COPY.sessionMenu }));
      await user.click(
        within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Archive session' }),
      );
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Archive session',
        }),
      );

      const notice = await screen.findByTestId('local-session-archived');
      expect(notice).toHaveTextContent('Session archived.');
      expect(notice).toHaveTextContent('choose Show archived in the sidebar, then Restore');
      expect(archiveDeveloperThread).toHaveBeenCalledWith('root-recent', 'thread-1');

      await user.click(within(notice).getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByTestId('local-session-archived')).not.toBeInTheDocument();
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('archives the selected Local session from the sidebar and allows a read-only review before Restore', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    archiveDeveloperThread.mockImplementationOnce(async () => {
      localGroups = [folder({ sessions: [] })];
      return true;
    });
    unarchiveDeveloperThread.mockImplementationOnce(async () => {
      localGroups = [folder()];
      return true;
    });
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-1');
    try {
      render(<CloudCodePage api={createApi()} />);
      await user.type(
        within(await screen.findByTestId('local-code-composer')).getByRole('textbox'),
        'Keep this follow-up through Archive',
      );
      const rail = within(screen.getByTestId('local-code-section'));
      const actions = () => rail.getByRole('button', { name: 'More actions for Quote the readme' });
      const requestArchive = async () => {
        await user.click(actions());
        await user.click(await screen.findByRole('menuitem', { name: 'Archive session' }));
        return within(await screen.findByRole('alertdialog'));
      };

      await user.click((await requestArchive()).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(actions()).toHaveFocus());
      expect(archiveDeveloperThread).not.toHaveBeenCalled();
      await user.click((await requestArchive()).getByRole('button', { name: 'Archive session' }));

      expect(await screen.findByTestId('local-session-archived')).toBeVisible();
      expect(screen.queryByTestId('local-code-composer')).not.toBeInTheDocument();
      const showArchived = rail.getByRole('button', { name: 'Show archived' });
      await waitFor(() => expect(showArchived).toHaveFocus());
      expect(archiveDeveloperThread).toHaveBeenCalledExactlyOnceWith(
        localSession.rootId,
        localSession.id,
      );

      localGroups = [folder({ sessions: [{ ...localSession, status: 'archived' }] })];
      await user.click(showArchived);
      await user.click(await rail.findByRole('button', { name: /^Quote the readme/ }));
      expect(
        await screen.findByText('Restore this session before sending another message.'),
      ).toBeVisible();
      expect(screen.getByTestId('local-code-composer')).not.toBeVisible();
      await user.click(actions());
      await user.click(await screen.findByRole('menuitem', { name: 'Restore' }));

      await waitFor(() => expect(screen.getByTestId('local-code-composer')).toBeVisible());
      expect(within(screen.getByTestId('local-code-composer')).getByRole('textbox')).toHaveValue(
        'Keep this follow-up through Archive',
      );
      expect(unarchiveDeveloperThread).toHaveBeenCalledExactlyOnceWith(
        localSession.rootId,
        localSession.id,
      );
      expect(startDeveloperTurn).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('says a linked local session is gone instead of opening something else', async () => {
    replace.mockClear();
    host = {};
    localGroups = [folder({ rootId: 'root-recent', sessions: [localSession] })];
    window.history.replaceState({}, '', '/code?local=root-recent&thread=thread-gone');
    try {
      render(<CloudCodePage api={createApi()} />);

      expect(
        await screen.findByText('That coding session is not on this device any more.'),
      ).toBeInTheDocument();
      expect(replace).toHaveBeenCalledWith('/code');
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('stays on cloud in the shell when no folder is open to AGI', async () => {
    host = {};
    localGroups = [];
    render(<CloudCodePage api={createApi()} />);

    expect(await screen.findByRole('button', { name: 'Cloud · Isolated' })).toBeInTheDocument();
  });

  it('never proposes a folder whose runtime cannot start a session', async () => {
    host = {};
    localGroups = [
      folder({ unavailable: { message: 'The AGI CLI is missing.', hint: 'Install it.' } }),
    ];
    render(<CloudCodePage api={createApi()} />);

    expect(await screen.findByRole('button', { name: 'Cloud · Isolated' })).toBeInTheDocument();
  });

  it('lists the approved folders and the folder action above cloud, in the shell', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder(), folder({ rootId: 'root-two', name: 'second-project', sessions: [] })];
    render(<CloudCodePage api={createApi()} />);

    const menu = await openEnvironment(user);

    expect(within(menu).getByText('Local')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: /qa-project/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: /second-project/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Add a folder' })).toBeInTheDocument();
    expect(within(menu).getByText('Cloud')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Edit environment' })).toBeInTheDocument();
  });

  it('makes the other folder the one a new session starts in from Make primary', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder(), folder({ rootId: 'root-two', name: 'second-project', sessions: [] })];
    render(<CloudCodePage api={createApi()} />);

    await screen.findByRole('button', { name: 'Change the folder: qa-project' });
    const menu = await openEnvironment(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Make primary' }));

    expect(
      await screen.findByRole('button', { name: 'Change the folder: second-project' }),
    ).toBeInTheDocument();
  });

  it('asks the host for a folder from the environment menu', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    render(<CloudCodePage api={createApi()} />);

    const menu = await openEnvironment(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Add a folder' }));

    await waitFor(() => expect(pickWorkspaceRoot).toHaveBeenCalled());
  });

  it('switches to the cloud environment, which brings the repository chip back', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    render(<CloudCodePage api={createApi()} />);

    const menu = await openEnvironment(user);
    await user.click(within(menu).getByRole('menuitemradio', { name: /Trusted hosts/ }));

    expect(
      await screen.findByRole('button', { name: 'Cloud · Trusted hosts' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select repository' })).toBeInTheDocument();
  });

  it('sends a local task through the host, never through the managed API', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    const api = createApi();
    render(<CloudCodePage api={api} />);

    await screen.findByRole('button', { name: 'Change the folder: qa-project' });
    await user.type(await enabledComposer(), 'quote the readme');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    await waitFor(() =>
      expect(startDeveloperSession).toHaveBeenCalledWith('root-recent', 'qa-provider/qa-model'),
    );
    await waitFor(() =>
      expect(startDeveloperTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          rootId: 'root-recent',
          threadId: 'thread-1',
          text: 'quote the readme',
        }),
      ),
    );
    expect(api.create).not.toHaveBeenCalled();
  });

  it.each(['shortcut', 'menu', 'keyboard menu'])(
    'can send a new Local task and stay here via %s',
    async (method) => {
      host = {};
      localGroups = [folder()];
      const api = createApi();
      const user = userEvent.setup();
      render(<CloudCodePage api={api} />);
      const composer = await enabledComposer();
      await user.type(composer, 'Read the project README');
      if (method === 'shortcut') {
        await user.keyboard('{Meta>}{Enter}{/Meta}');
      } else if (method === 'keyboard menu') {
        const trigger = screen.getByRole('button', { name: 'Send options' });
        expect(composer).toHaveAttribute('aria-keyshortcuts', 'Enter Meta+Enter Control+Enter');
        await user.tab();
        expect(trigger).toHaveFocus();
        await user.keyboard('{Enter}{ArrowDown}');
        const sendAndStay = await screen.findByRole('menuitem', { name: 'Send and stay here' });
        expect(sendAndStay).toHaveFocus();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(composer).toHaveValue('Read the project README');
        await user.tab();
        expect(screen.getByRole('button', { name: 'Start the task' })).toHaveFocus();
        await user.tab({ shift: true });
        await user.keyboard('{Enter}{ArrowDown}{Enter}');
        await waitFor(() => expect(composer).toHaveFocus());
      } else {
        await user.click(screen.getByRole('button', { name: 'Send options' }));
        await user.click(await screen.findByRole('menuitem', { name: 'Send and stay here' }));
      }

      await waitFor(() =>
        expect(startDeveloperTurn).toHaveBeenCalledExactlyOnceWith({
          rootId: 'root-recent',
          threadId: 'thread-1',
          text: 'Read the project README',
          model: 'qa-provider/qa-model',
          agentMode: 'ask',
        }),
      );
      await waitFor(() => expect(composer).toHaveValue(''));
      expect(composer).toBeInTheDocument();
      expect(screen.queryByTestId('local-code-composer')).toBeNull();
      expect(api.create).not.toHaveBeenCalled();
      expect(api.startAgentTurn).not.toHaveBeenCalled();
    },
  );

  it('keeps the Local draft if the background turn cannot start', async () => {
    host = {};
    localGroups = [folder()];
    startDeveloperTurn.mockRejectedValueOnce(new Error('The model could not start'));
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);
    const composer = await enabledComposer();
    await user.type(composer, 'Read the project README{Control>}{Enter}{/Control}');

    expect(await screen.findByText('The model could not start')).toBeVisible();
    expect(composer).toHaveValue('Read the project README');
    expect(screen.queryByTestId('local-code-composer')).toBeNull();
  });

  it('keeps the cloud isolation claim off the screen while the environment is local', async () => {
    host = {};
    localGroups = [folder()];
    render(<CloudCodePage api={createApi()} />);

    await screen.findByRole('button', { name: 'Change the folder: qa-project' });

    expect(screen.queryByText(CODE_COPY.firstRunHint)).not.toBeInTheDocument();
  });
});

describe('the model a local session starts on', () => {
  const reachable = (id: string) => ({
    id,
    provider: 'qa-provider',
    reachable: true,
    unreachable: null,
  });

  it('names the model that will answer instead of the cloud model selector', async () => {
    host = {};
    localGroups = [folder()];
    localHostModels = [reachable('qa-provider/first'), reachable('qa-provider/second')];
    render(<CloudCodePage api={createApi()} />);

    await screen.findByRole('button', { name: 'Change the folder: qa-project' });

    expect(await screen.findByRole('button', { name: /qa-provider\/first/ })).toBeInTheDocument();
    expect(screen.queryByTestId('model-trigger')).not.toBeInTheDocument();
  });

  it('starts the session on the model chosen in the composer', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    localHostModels = [reachable('qa-provider/first'), reachable('qa-provider/second')];
    render(<CloudCodePage api={createApi()} />);

    await screen.findByRole('button', { name: 'Change the folder: qa-project' });
    await user.click(await screen.findByRole('button', { name: /qa-provider\/first/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'qa-provider/second' }));

    await user.type(await enabledComposer(), 'quote the readme');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    await waitFor(() =>
      expect(startDeveloperSession).toHaveBeenCalledWith('root-recent', 'qa-provider/second'),
    );
  });

  it('keeps the cloud model selector on the cloud environment', async () => {
    render(<CloudCodePage api={createApi()} />);

    expect(await screen.findByRole('button', { name: 'Cloud · Isolated' })).toBeInTheDocument();
    expect(screen.getByTestId('model-trigger')).toBeInTheDocument();
  });
});

describe('a cloud session open while the draft is local', () => {
  it('continues the cloud session rather than starting a local one', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await screen.findByRole('button', { name: 'Change the folder: qa-project' });
    await openSession(user, session.title);
    await screen.findByRole('button', { name: 'Changes' });

    await user.type(await enabledComposer(), 'run the tests');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    await waitFor(() => expect(api.startAgentTurn).toHaveBeenCalled());
    expect(startDeveloperSession).not.toHaveBeenCalled();
  });

  it('reports a local start failure once, above the composer', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    startDeveloperSession.mockRejectedValueOnce(new Error('the runtime refused'));
    render(<CloudCodePage api={createApi()} />);

    await screen.findByRole('button', { name: 'Change the folder: qa-project' });
    await user.type(await enabledComposer(), 'quote the readme');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    const notices = await screen.findByTestId('code-notices');
    expect(await within(notices).findByRole('alert')).toHaveTextContent('the runtime refused');
    expect(screen.getAllByText('the runtime refused')).toHaveLength(1);
  });

  it('explains rejected folder access and keeps the draft without starting a cloud task', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    startDeveloperSession.mockRejectedValueOnce(
      new DesktopRuntimeError({
        code: 'permission-denied',
        capability: 'shell.execute',
        message: 'Permission to shell execute in qa-project was not granted.',
      }),
    );
    const api = createApi();
    render(<CloudCodePage api={api} />);

    const notices = await screen.findByTestId('code-notices');
    const composer = await enabledComposer();
    await user.type(composer, 'quote the readme');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    expect(await within(notices).findByRole('alert')).toHaveTextContent(
      LOCAL_CODE_COPY.startCommandAccessDenied,
    );
    expect(screen.getAllByText(LOCAL_CODE_COPY.startCommandAccessDenied)).toHaveLength(1);
    expect(composer).toHaveValue('quote the readme');
    expect(startDeveloperTurn).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
    await user.click(
      within(notices).getByRole('button', { name: LOCAL_CODE_COPY.reviewCommandAccess }),
    );
    expect(openSettings).toHaveBeenCalledWith('capabilities');
  });

  it('grants command access beside the composer and keeps the start action explicit', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder({ sessions: [], sessionsWithheld: true })];
    const grant = codeDeferred<boolean>();
    allowDeveloperSessions.mockImplementationOnce(() => grant.promise);
    render(<CloudCodePage api={createApi()} />);

    const notices = within(await screen.findByTestId('code-notices'));
    const allow = await notices.findByRole('button', { name: LOCAL_CODE_COPY.allowSessions });
    const composer = await enabledComposer();
    await user.type(composer, 'quote the readme{Enter}');
    expect(composer).toHaveAccessibleDescription(LOCAL_CODE_COPY.startNeedsCommandAccess);
    expect(screen.getByRole('button', { name: 'Start the task' })).toBeDisabled();
    expect(startDeveloperSession).not.toHaveBeenCalled();

    await user.click(allow);
    expect(allowDeveloperSessions).toHaveBeenCalledWith('root-recent');
    expect(notices.getByRole('button', { name: LOCAL_CODE_COPY.allowingSessions })).toBeDisabled();
    localGroups = [folder()];
    grant.resolve(true);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start the task' })).toBeEnabled(),
    );
    expect(composer).toHaveValue('quote the readme');
    expect(startDeveloperSession).not.toHaveBeenCalled();
  });

  it('keeps the microphone visible in Local Code without requesting Cloud audio capture', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    render(<CloudCodePage api={createApi()} />);

    await screen.findByRole('button', { name: 'Change the folder: qa-project' });
    const microphone = screen.getByRole('button', { name: CODE_COPY.startDictation });
    expect(microphone).toBeVisible();
    expect(microphone).toBeDisabled();
    expect(microphone).toHaveAccessibleDescription(CODE_COPY.dictationRequiresCloud);
    await user.click(microphone);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('routes a saved refusal to Capabilities without offering a blocked prompt', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder({ sessions: [], sessionsWithheld: true, commandAccessRefused: true })];
    render(<CloudCodePage api={createApi()} />);

    const notices = within(await screen.findByTestId('code-notices'));
    expect(await notices.findByText(LOCAL_CODE_COPY.startCommandAccessDenied)).toBeInTheDocument();
    expect(notices.queryByRole('button', { name: LOCAL_CODE_COPY.allowSessions })).toBeNull();
    await user.click(notices.getByRole('button', { name: LOCAL_CODE_COPY.reviewCommandAccess }));
    expect(openSettings).toHaveBeenCalledWith('capabilities');
    expect(allowDeveloperSessions).not.toHaveBeenCalled();
  });
});

describe('what the local chip row and menu say about a folder', () => {
  it('follows the folder with its branch, and drops the chip when there is none', async () => {
    host = {};
    localGroups = [folder({ branch: 'release-1' })];
    const { unmount } = render(<CloudCodePage api={createApi()} />);

    await screen.findByRole('button', { name: 'Change the folder: qa-project' });
    expect(
      within(screen.getByTestId('code-composer-area')).getByText('release-1'),
    ).toBeInTheDocument();
    unmount();

    localGroups = [folder({ branch: null })];
    render(<CloudCodePage api={createApi()} />);

    await screen.findByRole('button', { name: 'Change the folder: qa-project' });
    expect(
      within(screen.getByTestId('code-composer-area')).queryByText('release-1'),
    ).not.toBeInTheDocument();
  });

  it('says why an unavailable folder cannot run, and refuses to send into it', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [
      folder(),
      folder({
        rootId: 'root-gone',
        name: 'moved-project',
        sessions: [],
        unavailable: { message: 'moved-project is no longer on this Mac.', hint: 'Add it again.' },
      }),
    ];
    render(<CloudCodePage api={createApi()} />);

    const menu = await openEnvironment(user);
    const row = within(menu).getByRole('menuitemradio', { name: /moved-project/ });
    expect(row).toHaveTextContent('Cannot run here');
    expect(row).not.toHaveTextContent('Add it again');
    await user.click(row);

    expect(
      await screen.findByRole('button', { name: 'Change the folder: moved-project' }),
    ).toBeInTheDocument();
    const notices = await screen.findByTestId('code-notices');
    expect(within(notices).getByText(/no longer on this Mac\. Add it again\./)).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).toBeDisabled();
  });
});

describe('leaving unsaved local edits', () => {
  it.each([
    'Changes',
    'Back to cloud sessions',
    'Another local session',
    'Cloud session',
    'New',
    'New session in qa-project',
  ])('confirms %s at its navigation owner', async (destination) => {
    const user = userEvent.setup();
    host = {};
    const other = { ...localSession, id: 'another-local', title: 'Another local session' };
    localGroups = [folder({ sessions: [localSession, other] })];
    if (destination === 'New session in qa-project')
      startDeveloperSession.mockResolvedValueOnce({
        ...localSession,
        id: 'new-local',
        title: 'New local session',
      });
    const api = createApi({
      list: vi.fn(async () => ({
        availability,
        sessions: [{ ...session, title: 'Cloud session' }],
        runtimes: [],
      })),
    });
    render(<CloudCodePage api={api} />);
    await user.click(
      await screen.findByRole('button', { name: new RegExp(`^${localSession.title}`) }),
    );
    await user.click(await screen.findByRole('button', { name: 'Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Edit src/edit.ts' }));
    const field = await screen.findByLabelText('src/edit.ts');
    fireEvent.change(field, { target: { value: 'unsaved' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    if (destination === 'Cloud session') {
      await openSession(user, destination);
    } else {
      await user.click(
        screen.getByRole('button', {
          name: destination === 'Another local session' ? /^Another local session/ : destination,
        }),
      );
    }
    const dialog = await screen.findByRole('alertdialog');
    expect(field).toHaveValue('unsaved');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(field).toHaveValue('unsaved');
    if (destination === 'Cloud session') await openSession(user, destination);
    else
      await user.click(
        screen.getByRole('button', {
          name: destination === 'Another local session' ? /^Another local session/ : destination,
        }),
      );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
    );
    await waitFor(() => expect(screen.queryByLabelText('src/edit.ts')).not.toBeInTheDocument());
  });
});

describe('CloudCodePage, a coding agent that runs on the person’s own key', () => {
  const ownKeyAgent: CloudCodeRuntime = {
    id: 'droid',
    name: 'Droid',
    kind: 'harness',
    summary: 'Factory’s agent CLI.',
    agentCommand: 'droid',
    cpuCount: 0,
    memoryMB: 0,
    diskSizeMB: 0,
    isPublic: true,
    needsUserCredential: true,
  };
  const managedAgent: CloudCodeRuntime = {
    ...ownKeyAgent,
    id: 'claude',
    name: 'Claude Code',
    agentCommand: 'claude',
    needsUserCredential: false,
  };

  it('asks for the key only for that agent and sends it when the session starts', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({
        availability,
        sessions: [],
        runtimes: [managedAgent, ownKeyAgent],
      })),
    });
    render(<CloudCodePage api={api} />);

    await user.click(
      await screen.findByRole('button', { name: environmentChipLabel('cloud', 'none') }),
    );
    await user.click(await screen.findByRole('menuitem', { name: CODE_COPY.editEnvironment }));
    const agent = await screen.findByRole('combobox', { name: CODE_COPY.environmentImageHeading });
    await user.selectOptions(agent, 'claude');
    expect(screen.queryByLabelText(CODE_COPY.harnessCredentialLabel)).not.toBeInTheDocument();

    await user.selectOptions(agent, 'droid');
    await user.type(screen.getByLabelText(CODE_COPY.harnessCredentialLabel), 'fd-own-key');
    await user.keyboard('{Escape}');

    await user.type(await enabledComposer(), 'Run the test suite');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({ runtimeId: 'droid', harnessCredential: 'fd-own-key' }),
      ),
    );
  });
});

describe('CloudCodePage, the model a coding agent runs', () => {
  const claudeCode: CloudCodeRuntime = {
    id: 'claude',
    name: 'Claude Code',
    kind: 'harness',
    summary: 'Anthropic’s agentic CLI.',
    agentCommand: 'claude',
    cpuCount: 0,
    memoryMB: 0,
    diskSizeMB: 0,
    isPublic: true,
    modelProvider: 'anthropic',
    runsOwnAgent: true,
  };
  const anthropicOnPlan = getSelectableModels().filter(
    (model) =>
      model.provider === 'anthropic' &&
      canAccessModelForSubscriptionTier(model.id, availability.planTier),
  );

  it('offers only the agent provider’s models the plan includes, and runs the one picked', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [], runtimes: [claudeCode] })),
      create: vi.fn(async () => ({
        session: { ...session, runtimeId: 'claude' },
        terminalEntries: [],
        turns: [],
      })),
    });
    render(<CloudCodePage api={api} />);

    await user.click(
      await screen.findByRole('button', { name: environmentChipLabel('cloud', 'none') }),
    );
    await user.click(await screen.findByRole('menuitem', { name: CODE_COPY.editEnvironment }));
    await user.selectOptions(
      await screen.findByRole('combobox', { name: CODE_COPY.environmentImageHeading }),
      'claude',
    );
    const model = screen.getByRole('combobox', { name: CODE_COPY.harnessModelLabel });
    const offered = within(model)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);

    expect(anthropicOnPlan.length).toBeGreaterThan(0);
    expect(offered).toEqual(['', ...anthropicOnPlan.map((choice) => choice.id)]);

    const picked = anthropicOnPlan.find(
      (choice) => choice.id !== getRoutingSlotModel('coding_balanced'),
    )!.id;
    await user.selectOptions(model, picked);
    await user.keyboard('{Escape}');
    await user.type(await enabledComposer(), 'Run the test suite');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    await waitFor(() =>
      expect(api.startAgentTurn).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({ model: picked }),
      ),
    );
  });
});

describe('local Code on a plan without cloud models on this computer', () => {
  const PLAN_WITHOUT = (Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]).find(
    (plan) =>
      plan !== 'local-only' &&
      plan !== 'byok' &&
      !canUseBillingPlanCapability(plan, 'developer_surfaces'),
  ) as BillingPlanTier;
  const MANAGED_MODEL = Object.keys(modelsCatalog.models).find((id) => {
    const metadata = getModelMetadata(id);
    return (
      metadata !== undefined &&
      metadata !== null &&
      metadata.qualityTier !== 'best' &&
      metadata.inputCost + metadata.outputCost > 0
    );
  }) as string;
  const LOCAL_MODEL = 'qa-runner/qa-local';
  const managedReady = {
    id: MANAGED_MODEL,
    provider: 'qa-vendor',
    reachable: true,
    trustMode: 'managed' as const,
    unreachable: null,
  };
  const localReady = {
    id: LOCAL_MODEL,
    provider: 'ollama',
    reachable: true,
    trustMode: 'local' as const,
    unreachable: null,
  };

  function planApi() {
    return createApi({
      list: vi.fn(async () => ({
        availability: { ...availability, planEntitled: false, planTier: PLAN_WITHOUT },
        sessions: [],
        runtimes: [],
      })),
    });
  }

  it('opens the folder draft from the rail instead of starting a session no model can run', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    localHostModels = [managedReady];
    render(<CloudCodePage api={planApi()} />);

    await screen.findByRole('button', { name: LOCAL_CODE_COPY.chooseModel });
    const menu = await openEnvironment(user);
    await user.click(within(menu).getByRole('menuitemradio', { name: /Trusted hosts/ }));
    await screen.findByRole('button', { name: 'Cloud · Trusted hosts' });
    await user.click(screen.getByRole('button', { name: 'New session in qa-project' }));

    expect(
      await screen.findByRole('button', { name: 'Change the folder: qa-project' }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('local-plan-required')).toHaveTextContent(
      localCloudModelsPlanLine(),
    );
    expect(startDeveloperSession).not.toHaveBeenCalled();
    expect(
      screen.getByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).toBeDisabled();
  });

  it('opens the draft for a folder whose only history ran on the account, on a CLI with no verdicts', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [
      folder({
        sessions: [
          {
            ...localSession,
            model: MANAGED_MODEL,
            provider: 'managed_cloud',
            trustMode: 'managed',
          },
        ],
      }),
    ];
    render(<CloudCodePage api={planApi()} />);

    await waitFor(() => expect(listDeveloperModels).toHaveBeenCalledWith('root-recent', {}));
    await act(async () => {});
    const menu = await openEnvironment(user);
    await user.click(within(menu).getByRole('menuitemradio', { name: /Trusted hosts/ }));
    await screen.findByRole('button', { name: 'Cloud · Trusted hosts' });
    await user.click(screen.getByRole('button', { name: 'New session in qa-project' }));

    expect(await screen.findByTestId('local-plan-required')).toHaveTextContent(
      localCloudModelsPlanLine(),
    );
    expect(startDeveloperSession).not.toHaveBeenCalled();
    expect(
      screen.getByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).toBeDisabled();
  });

  it('starts a rail session on a model on this computer, not the CLI default the plan refuses', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    localHostModels = [managedReady, localReady];
    localDefaultModelId = MANAGED_MODEL;
    render(<CloudCodePage api={planApi()} />);

    await screen.findByRole('button', { name: LOCAL_MODEL });
    await user.click(screen.getByRole('button', { name: 'New session in qa-project' }));

    await waitFor(() =>
      expect(startDeveloperSession).toHaveBeenCalledWith('root-recent', LOCAL_MODEL),
    );
  });

  it('keeps the model chip and its rows reachable, and offers the upgrade and a local model', async () => {
    const user = userEvent.setup();
    const upgrade = vi.fn();
    const release = onAppCommand('open-upgrade', upgrade);
    openSettings.mockClear();
    host = {};
    localGroups = [folder()];
    localHostModels = [managedReady];
    render(<CloudCodePage api={planApi()} />);

    const chip = await screen.findByRole('button', { name: LOCAL_CODE_COPY.chooseModel });
    expect(chip).toBeEnabled();
    await user.click(chip);
    expect(await screen.findByText(LOCAL_MODEL_UPGRADE_HEADING)).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Cloud/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    const notice = await screen.findByTestId('local-plan-required');
    await user.click(within(notice).getByRole('button', { name: CODE_COPY.upgradeAction }));
    expect(upgrade).toHaveBeenCalledTimes(1);
    const setUp = within(notice).getByRole('link', { name: LOCAL_CODE_COPY.setUpLocalModel });
    expect(setUp).toHaveAttribute('href', helpArticlePath(LOCAL_MODELS_HELP_ARTICLE));
    expect(setUp).toHaveAttribute('target', '_blank');
    expect(openSettings).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalledWith('/pricing');
    release();
  });

  it('offers the upgrade beside the cloud environment a plan does not include', async () => {
    const user = userEvent.setup();
    const upgrade = vi.fn();
    const release = onAppCommand('open-upgrade', upgrade);
    host = {};
    render(<CloudCodePage api={planApi()} />);

    const notice = await screen.findByTestId('code-unavailable');
    expect(notice).toHaveTextContent(CODE_COPY.planNotEntitled);
    await user.click(within(notice).getByRole('button', { name: CODE_COPY.upgradeAction }));
    expect(upgrade).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalledWith('/pricing');
    release();
  });

  it('opens the local models settings where the host runs local models itself', async () => {
    const user = userEvent.setup();
    openSettings.mockClear();
    host = {};
    localModeHost = true;
    localGroups = [folder()];
    localHostModels = [managedReady];
    render(<CloudCodePage api={planApi()} />);

    const notice = await screen.findByTestId('local-plan-required');
    await user.click(within(notice).getByRole('button', { name: LOCAL_CODE_COPY.setUpLocalModel }));
    expect(openSettings).toHaveBeenCalledWith(LOCAL_MODELS_SETTINGS_SECTION);
  });

  it('starts a new session for a model in another trust boundary from the draft', async () => {
    const user = userEvent.setup();
    host = {};
    localGroups = [folder()];
    localHostModels = [
      {
        id: localSession.model!,
        provider: 'qa-provider',
        reachable: true,
        trustMode: 'byok',
        unreachable: null,
      },
      localReady,
    ];
    render(<CloudCodePage api={planApi()} />);

    await user.click(
      await screen.findByRole('button', { name: new RegExp(`^${localSession.title}`) }),
    );
    const panel = within(await screen.findByTestId('local-code-composer'));
    await user.click(await panel.findByRole('button', { name: localSession.model! }));
    expect(screen.queryByRole('menuitemradio', { name: LOCAL_MODEL })).toBeNull();
    await user.click(
      screen.getByRole('menuitem', { name: LOCAL_CODE_COPY.newSessionWith(LOCAL_MODEL) }),
    );

    expect(
      await screen.findByRole('button', { name: 'Change the folder: qa-project' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: LOCAL_MODEL })).toBeInTheDocument();
    expect(startDeveloperTurn).not.toHaveBeenCalled();
    await user.type(await enabledComposer(), 'quote the readme');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    await waitFor(() =>
      expect(startDeveloperSession).toHaveBeenCalledWith('root-recent', LOCAL_MODEL),
    );
  });
});

describe('the cloud model picker in the Code composer', () => {
  it('opens the plan dialog for a model the plan does not include', async () => {
    const upgrade = vi.fn();
    const release = onAppCommand('open-upgrade', upgrade);
    render(<CloudCodePage api={createApi()} />);

    await screen.findByTestId('model-trigger');
    expect(composerFooter.onUpgradeRequest).toBeTypeOf('function');
    act(() => composerFooter.onUpgradeRequest?.());

    expect(upgrade).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalledWith('/pricing');
    release();
  });
});
