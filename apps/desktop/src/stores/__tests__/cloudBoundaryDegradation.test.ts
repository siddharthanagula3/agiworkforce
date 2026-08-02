/**
 * DES-C10 — a transient conversation- or project-list failure must not blank
 * the whole Desktop Cloud app.
 *
 * The cloud hydration in `App.tsx` awaited
 * `Promise.all([loadConversations(...), loadProjects({ throwOnError: true })])`
 * and turned EITHER rejection into a full-screen "Could not open Cloud Mode"
 * alert, so a 429/500/cold-start on `/api/projects` — which has nothing to do
 * with chat — took down chat, composer, sidebar and history at once.
 *
 * Web precedent (`apps/web/e2e/authenticated-flows.spec.ts`): a failing
 * background sync must NOT take down the chat UI.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  isTauri: false,
  isTauriContext: vi.fn(() => false),
}));

vi.mock('../../utils/localStorage', () => ({
  safeGetJSON: vi.fn().mockReturnValue({ dbIdToUuid: {}, uuidToDbId: {} }),
  safeSetJSON: vi.fn().mockReturnValue(true),
  storageFallback: {
    length: 0,
    clear: vi.fn(),
    getItem: vi.fn().mockReturnValue(null),
    key: vi.fn().mockReturnValue(null),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

const { listProjects } = vi.hoisted(() => ({ listProjects: vi.fn() }));
vi.mock('../../services/desktopCloudProjects', () => ({
  desktopCloudProjects: {
    listProjects,
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
  },
}));

import { useAppModeStore } from '../appModeStore';
import { useAuthStore } from '../auth';
import { useProjectStore } from '../projectStore';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function signInCloud(): void {
  useAppModeStore.setState({ mode: 'cloud', hasOnboarded: true, hasSelectedMode: true });
  const auth = useAuthStore.getState();
  auth.setUser({ id: 'user_demo', email: '', name: 'demo' });
  auth.setAccount({
    id: 'user_demo',
    accessToken: 'device-bearer',
    isLocalDeviceAccount: false,
    plan: 'free',
    subscriptionFetchStatus: 'succeeded',
  });
}

describe('DES-C10: a project-list failure stays scoped to projects', () => {
  beforeEach(() => {
    listProjects.mockReset();
    useAuthStore.getState().reset();
    useProjectStore.setState({
      projects: [],
      activeProjectId: null,
      isLoading: false,
      error: null,
    });
    signInCloud();
  });

  it('records the failure on the project store without rejecting', async () => {
    listProjects.mockRejectedValue(new Error('projects unavailable (503)'));

    // No throwOnError: the caller in App.tsx awaits this inside a Promise.all
    // whose rejection would set the conversation-boundary error.
    await expect(useProjectStore.getState().loadProjects()).resolves.toBeUndefined();

    const state = useProjectStore.getState();
    expect(state.error).toContain('projects unavailable');
    expect(state.isLoading).toBe(false);
  });

  it('still rejects for callers that explicitly opt in to throwOnError', async () => {
    listProjects.mockRejectedValue(new Error('projects unavailable (503)'));

    await expect(useProjectStore.getState().loadProjects({ throwOnError: true })).rejects.toThrow(
      /projects unavailable/,
    );
  });

  it('does not let the chat boundary hydration opt in to that rejection', () => {
    const app = readFileSync(path.join(SRC, 'App.tsx'), 'utf8');

    expect(
      app.includes('loadProjects({ throwOnError: true })'),
      'a project-list failure must not be able to set the conversation-boundary error',
    ).toBe(false);
    expect(app).toContain('loadProjects()');
  });

  it('reports a conversation-list failure inline instead of replacing the shell', () => {
    const app = readFileSync(path.join(SRC, 'App.tsx'), 'utf8');

    // The full-screen takeover returned early, before the shell (and therefore
    // ChatInterface) was ever mounted.
    expect(app).not.toContain('Could not open {isCloudMode');
    expect(app).toContain('data-testid="conversation-boundary-error"');
    // …and it stays retryable and dismissible rather than terminal.
    expect(app).toContain('setConversationBoundaryRetry');
    expect(app).toContain('Dismiss conversation loading error');
  });
});
