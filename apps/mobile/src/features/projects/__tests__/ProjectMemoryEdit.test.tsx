/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/src/features/chat/components/WorkModeSwitch', () => ({ HEADER_TEXT_SCALE_LIMIT: 2 }));
jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

jest.mock('@/services/cloudSyncEngine', () => ({
  syncNow: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: jest.fn(() => ({ ownerId: 'user-1', epoch: 1 })),
  assertCloudAccountEpochCurrent: jest.fn(),
}));

jest.mock('@/src/features/projects/components/ProjectSettingsScreen', () => ({
  confirmDelete: jest.fn(),
}));

jest.mock('@/src/lib/Capabilities', () => ({ useCapability: () => true }));

jest.mock('@/src/features/voice/components/VoiceInputButton', () => {
  const RN = require('react-native');
  return {
    VoiceInputButton: ({
      onTranscription,
      disabled,
    }: {
      onTranscription: (text: string, intent: 'insert' | 'send') => void;
      disabled?: boolean;
    }) => (
      <RN.Pressable
        accessibilityRole="button"
        accessibilityLabel="Dictate"
        accessibilityState={{ disabled: Boolean(disabled) }}
        onPress={() => onTranscription('deadline is March', 'insert')}
      />
    ),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? true : (props: Record<string, unknown>) => <RN.View {...props} />,
    },
  );
});

import React from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ProjectMemorySheet } from '@/src/features/projects/components/ProjectMemorySheet';
import {
  PROJECT_MEMORY_EDIT_PLACEHOLDER,
  PROJECT_MEMORY_NOTHING_CHANGED,
  PROJECT_MEMORY_OFF,
  PROJECT_MEMORY_SERVER_FAILED,
  PROJECT_MEMORY_UNKNOWN_OUTCOME,
  PROJECT_MEMORY_UNREACHABLE,
  PROJECT_MEMORY_UNREADABLE,
} from '@/src/features/projects/components/ProjectMemoryEditComposer';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import { syncNow } from '@/services/cloudSyncEngine';
import { TIMEOUTS } from '@/lib/constants';
import { useCloudMemoryStore, type CloudMemoryEntry } from '@/stores/memory/cloudMemoryStore';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import { useMemorySyncStateStore } from '@/stores/memory/memorySyncStateStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';

const PROJECT_ID = 'project-1';
const EDIT_PATH = `/api/projects/${PROJECT_ID}/memory/edit`;
const LIMIT = 2_000;

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;
const mockDelete = api.delete as jest.Mock;

function memory(overrides: Partial<CloudMemoryEntry> = {}): CloudMemoryEntry {
  return {
    id: 'm-1',
    content: 'The deadline is February',
    category: null,
    source: 'web',
    pinned: false,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    isDeleted: false,
    projectId: PROJECT_ID,
    projectName: 'Billing rewrite',
    ...overrides,
  };
}

function renderSheet() {
  return render(
    <ProjectMemorySheet
      visible
      projectId={PROJECT_ID}
      onClose={jest.fn()}
      onOpenSettings={jest.fn()}
    />,
  );
}

function lastAlert() {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1) as
    [string, string, { text?: string; onPress?: () => void }[]] | undefined;
  return call;
}

function pressAlertButton(text: string) {
  act(() =>
    lastAlert()?.[2]
      .find((button) => button.text === text)
      ?.onPress?.(),
  );
}

async function openComposer() {
  const screen = renderSheet();
  const input = await screen.findByLabelText(PROJECT_MEMORY_EDIT_PLACEHOLDER);
  return { screen, input };
}

beforeEach(() => {
  jest.clearAllMocks();
  useCloudMemoryStore.setState({ entries: [memory()] });
  useCloudSyncStateStore.setState({ status: 'idle', failedSyncSteps: [], lastError: null });
  useMemorySyncStateStore.setState({ accountMemoryEnabled: true });
  useCloudSettingsStore.setState({ memoryEnabled: true, memoryPolicyInitialized: true });
  mockGet.mockResolvedValue({ maxMessageChars: LIMIT });
  jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(jest.fn());
});

async function sendAndRead(message: string) {
  const { screen, input } = await openComposer();
  fireEvent.changeText(input, message);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Send'));
  });
  return { screen, note: screen.getByTestId('project-memory-edit-note') };
}

describe('Project memory edit composer', () => {
  it('stays hidden while the server has no edit route', async () => {
    mockGet.mockRejectedValue(new ApiHttpError('Not found', 404));
    const screen = renderSheet();

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(EDIT_PATH, expect.anything()));
    await act(async () => {});

    expect(screen.queryByLabelText(PROJECT_MEMORY_EDIT_PLACEHOLDER)).toBeNull();
    expect(screen.queryByLabelText('Send')).toBeNull();
    expect(screen.getByText('The deadline is February')).toBeTruthy();
  });

  it('stays hidden when the server answers with something it cannot read', async () => {
    mockGet.mockResolvedValue('<html>Not found</html>');
    const screen = renderSheet();

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    await act(async () => {});

    expect(screen.queryByLabelText(PROJECT_MEMORY_EDIT_PLACEHOLDER)).toBeNull();
  });

  it('shows the composer once the route answers, with the server limit and Send off while empty', async () => {
    const { screen, input } = await openComposer();

    expect(input.props.maxLength).toBe(LIMIT);
    expect(screen.getByLabelText('Send').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByLabelText('Dictate')).toBeTruthy();
  });

  it('sends the request, shows a spinner, then the reply, and adds the memory', async () => {
    let answer: (value: unknown) => void = () => undefined;
    mockPost.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { screen, input } = await openComposer();

    fireEvent.changeText(input, '  Add that the deadline is March  ');
    fireEvent.press(screen.getByLabelText('Send'));

    expect(mockPost).toHaveBeenCalledWith(
      EDIT_PATH,
      { message: 'Add that the deadline is March' },
      expect.objectContaining({ timeout: TIMEOUTS.STREAMING }),
    );
    expect(screen.getByLabelText('Changing memory')).toBeTruthy();
    expect(screen.queryByLabelText('Send')).toBeNull();

    await act(async () => {
      answer({
        changed: [{ id: 'm-2', action: 'added', content: 'The deadline is March' }],
        removals: [],
        reply: 'Added: deadline is March',
      });
    });

    expect(screen.getByTestId('project-memory-edit-note').props.children).toBe(
      'Added: deadline is March',
    );
    expect(screen.getByLabelText(PROJECT_MEMORY_EDIT_PLACEHOLDER).props.value).toBe('');
    expect(screen.getByText('The deadline is March')).toBeTruthy();
    expect(
      useCloudMemoryStore.getState().entries.find((entry) => entry.id === 'm-2'),
    ).toMatchObject({ projectId: PROJECT_ID, isDeleted: false });
    expect(syncNow).toHaveBeenCalled();
  });

  it('says nothing was changed and keeps the text when nothing changed', async () => {
    mockPost.mockResolvedValue({ changed: [], removals: [], reply: 'I could not do that.' });
    const { screen, input } = await openComposer();

    fireEvent.changeText(input, 'Make it nicer');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send'));
    });

    expect(screen.getByTestId('project-memory-edit-note').props.children).toBe(
      PROJECT_MEMORY_NOTHING_CHANGED,
    );
    expect(screen.getByLabelText(PROJECT_MEMORY_EDIT_PLACEHOLDER).props.value).toBe(
      'Make it nicer',
    );
  });

  it('keeps the text and says nothing changed when AGI cannot be reached', async () => {
    mockPost.mockRejectedValue(new TypeError('Network request failed'));
    const { screen, input } = await openComposer();

    fireEvent.changeText(input, 'Change the deadline to March');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send'));
    });

    const note = screen.getByTestId('project-memory-edit-note');
    expect(note.props.children).toBe(PROJECT_MEMORY_UNREACHABLE);
    expect(note.props.accessibilityRole).toBe('alert');
    expect(screen.getByLabelText(PROJECT_MEMORY_EDIT_PLACEHOLDER).props.value).toBe(
      'Change the deadline to March',
    );
    expect(screen.getByLabelText('Send')).toBeTruthy();
  });

  it('announces the note to VoiceOver once the change is made', async () => {
    mockPost.mockResolvedValue({
      changed: [{ id: 'm-2', action: 'added', content: 'The deadline is March' }],
      removals: [],
      reply: 'Added: deadline is March',
    });

    await sendAndRead('Add that the deadline is March');

    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Added: deadline is March',
    );
  });

  it('says the outcome is unknown when the request times out, even without an Error object', async () => {
    mockPost.mockRejectedValue({ name: 'AbortError', message: 'Aborted' });

    const { screen, note } = await sendAndRead('Change the deadline to March');

    expect(note.props.children).toBe(PROJECT_MEMORY_UNKNOWN_OUTCOME);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      PROJECT_MEMORY_UNKNOWN_OUTCOME,
    );
    expect(screen.getByLabelText(PROJECT_MEMORY_EDIT_PLACEHOLDER).props.value).toBe(
      'Change the deadline to March',
    );
  });

  it('does not claim nothing changed when the answer cannot be read, and refreshes the list', async () => {
    mockPost.mockResolvedValue({ changed: 'yes', reply: 'Updated' });

    const { note } = await sendAndRead('Change the deadline to March');

    expect(note.props.children).toBe(PROJECT_MEMORY_UNREADABLE);
    expect(syncNow).toHaveBeenCalled();
  });

  it('says AGI could not change memory when the server answered with an error', async () => {
    mockPost.mockRejectedValue(
      new ApiHttpError(
        'AGI could not change memory right now. Nothing was changed.',
        503,
        'SERVICE_UNAVAILABLE',
      ),
    );

    const { note } = await sendAndRead('Change the deadline to March');

    expect(note.props.children).toBe(PROJECT_MEMORY_SERVER_FAILED);
    expect(note.props.children).not.toBe(PROJECT_MEMORY_UNREACHABLE);
  });

  it('asks before deleting, naming the memory, and deletes only on confirmation', async () => {
    mockPost.mockResolvedValue({
      changed: [{ id: 'm-2', action: 'added', content: 'The deadline is March' }],
      removals: [{ id: 'm-1', content: 'The deadline is February' }],
      reply: 'Updated: deadline is March',
    });
    mockDelete.mockResolvedValue(undefined);
    const { screen, input } = await openComposer();

    fireEvent.changeText(input, 'Change the deadline to March');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send'));
    });

    const [title, message] = lastAlert() ?? [];
    expect(title).toBe('Delete this project memory?');
    expect(message).toContain('“The deadline is February”');
    expect(message).toContain('cannot be restored');
    expect(mockDelete).not.toHaveBeenCalled();

    await act(async () => {
      pressAlertButton('Delete memory');
    });

    expect(mockDelete).toHaveBeenCalledWith('/api/memory/m-1');
    expect(screen.getByTestId('project-memory-edit-note').props.children).toBe(
      'Updated: deadline is March',
    );
    expect(screen.queryByText('The deadline is February')).toBeNull();
  });

  it('keeps the memory when the deletion is cancelled', async () => {
    mockPost.mockResolvedValue({
      changed: [],
      removals: [{ id: 'm-1', content: 'The deadline is February' }],
      reply: 'Removed: deadline is February',
    });
    const { screen, input } = await openComposer();

    fireEvent.changeText(input, 'Forget the deadline');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send'));
    });
    await act(async () => {
      pressAlertButton('Cancel');
    });

    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByTestId('project-memory-edit-note').props.children).toBe(
      PROJECT_MEMORY_NOTHING_CHANGED,
    );
    expect(screen.getByText('The deadline is February')).toBeTruthy();
  });

  it('adds dictated words to the field through the chat dictation button', async () => {
    const { screen, input } = await openComposer();

    fireEvent.changeText(input, 'Change the');
    fireEvent.press(screen.getByLabelText('Dictate'));

    expect(screen.getByLabelText(PROJECT_MEMORY_EDIT_PLACEHOLDER).props.value).toBe(
      'Change the deadline is March',
    );
  });

  it('shows the memory off message in place of the composer', async () => {
    useMemorySyncStateStore.setState({ accountMemoryEnabled: false });
    const screen = renderSheet();

    expect(await screen.findByText(PROJECT_MEMORY_OFF)).toBeTruthy();
    expect(screen.queryByLabelText(PROJECT_MEMORY_EDIT_PLACEHOLDER)).toBeNull();
  });
});
