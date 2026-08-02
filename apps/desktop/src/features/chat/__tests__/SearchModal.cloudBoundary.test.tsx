import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accountId: 'account-a',
  assertBoundary: vi.fn(),
  close: vi.fn(),
  createManagedCloudRequestContext: vi.fn(),
  fetch: vi.fn(),
  getHeaders: vi.fn(),
  isOpen: true,
  privacyMode: 'managed',
  sessionEpoch: 1,
  signedIn: true,
}));

vi.mock('../../../hooks/useSearchModal', () => ({
  useSearchModal: (selector: (state: unknown) => unknown) =>
    selector({ isOpen: mocks.isOpen, close: mocks.close }),
}));

vi.mock('../../../stores/chat/chatStore', () => ({
  useChatStore: (selector: (state: unknown) => unknown) =>
    selector({ conversations: [], selectConversation: vi.fn() }),
}));

vi.mock('../../../stores/projectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({ projects: [], setActiveProject: vi.fn() }),
}));

vi.mock('../../../stores/artifactStore', () => ({
  useArtifactStore: (selector: (state: unknown) => unknown) =>
    selector({ summaries: [], setActiveArtifact: vi.fn(), openPanel: vi.fn() }),
}));

vi.mock('../../../stores/appModeStore', () => ({
  selectPrivacyMode: (state: { privacyMode: string }) => state.privacyMode,
  useAppModeStore: (selector: (state: unknown) => unknown) =>
    selector({ privacyMode: mocks.privacyMode }),
}));

vi.mock('../../../stores/auth', () => ({
  selectHasCloudAccountSession: () => mocks.signedIn,
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      cloudSessionEpoch: mocks.sessionEpoch,
      user: mocks.accountId ? { id: mocks.accountId } : null,
    }),
}));

vi.mock('../../../services/managedCloudRequestContext', () => ({
  createManagedCloudRequestContext: (...args: unknown[]) =>
    mocks.createManagedCloudRequestContext(...args),
}));

vi.mock('../../../api/cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://agiworkforce.com',
}));

vi.mock('@agiworkforce/unified-chat', () => ({ useReducedMotion: () => true }));

import { SearchModal } from '../SearchModal';

function libraryItem(id: string, fileName: string) {
  return {
    id,
    file_name: fileName,
    mime_type: 'text/plain',
    kind: 'file',
    byte_count: 12,
    uri: `/api/files/${id}`,
    surface: 'file',
    previewable: false,
    origin: 'generated',
    source_surface: 'desktop',
    provider: null,
    model: null,
    prompt: null,
    created_at: '2026-08-01T12:00:00.000Z',
  };
}

function libraryResponse(id: string, fileName: string): Response {
  return new Response(
    JSON.stringify({
      items: [libraryItem(id, fileName)],
      has_more: false,
      next_offset: null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

async function searchFor(value: string): Promise<void> {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('SearchModal Managed Cloud library boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.accountId = 'account-a';
    mocks.isOpen = true;
    mocks.privacyMode = 'managed';
    mocks.sessionEpoch = 1;
    mocks.signedIn = true;
    mocks.getHeaders.mockResolvedValue({ Authorization: 'Bearer account-a-token' });
    mocks.fetch.mockImplementation(async () => libraryResponse('file-a', 'Account A report'));
    mocks.createManagedCloudRequestContext.mockReturnValue({
      assertBoundary: mocks.assertBoundary,
      fetch: mocks.fetch,
      getHeaders: mocks.getHeaders,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('searches only while open and sends the captured account bearer', async () => {
    render(<SearchModal />);
    await searchFor('report');

    expect(screen.getByText('Account A report')).toBeInTheDocument();
    expect(mocks.createManagedCloudRequestContext).toHaveBeenCalledWith(
      'Managed Cloud library search',
    );
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://agiworkforce.com/api/library?q=report&limit=10&offset=0');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer account-a-token');
    expect(init.credentials).toBe('include');
  });

  it('cancels a pending debounced search when the modal closes', async () => {
    const rendered = render(<SearchModal />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'hidden' } });

    mocks.isOpen = false;
    rendered.rerender(<SearchModal />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('drops a deferred account A result after switching to account B', async () => {
    let resolveAccountA!: (response: Response) => void;
    const accountAResponse = new Promise<Response>((resolve) => {
      resolveAccountA = resolve;
    });
    mocks.createManagedCloudRequestContext.mockImplementation(() => {
      const accountId = mocks.accountId;
      const epoch = mocks.sessionEpoch;
      return {
        getHeaders: async () => ({ Authorization: `Bearer ${accountId}-token` }),
        assertBoundary: () => {
          if (mocks.accountId !== accountId || mocks.sessionEpoch !== epoch) {
            throw new Error(
              'The Managed Cloud account changed while this request was in progress.',
            );
          }
        },
        fetch: vi.fn(async () =>
          accountId === 'account-a'
            ? accountAResponse
            : libraryResponse('file-b', 'Account B report'),
        ),
      };
    });

    const rendered = render(<SearchModal />);
    await searchFor('report');

    mocks.accountId = 'account-b';
    mocks.sessionEpoch = 2;
    rendered.rerender(<SearchModal />);
    resolveAccountA(libraryResponse('file-a', 'Account A report'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('Account A report')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Account B report')).toBeInTheDocument();
    expect(screen.queryByText('Account A report')).not.toBeInTheDocument();
  });
});
