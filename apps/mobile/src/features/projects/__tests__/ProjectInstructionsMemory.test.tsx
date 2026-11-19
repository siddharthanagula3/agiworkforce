/* eslint-disable @typescript-eslint/no-require-imports */
const mockPush = jest.fn();
const mockMarkProjectForSync = jest.fn();

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
  markProjectForSync: (id: string) => mockMarkProjectForSync(id),
  markMemoryForSync: jest.fn(),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: jest.fn(() => ({ ownerId: 'user-1', epoch: 1 })),
  assertCloudAccountEpochCurrent: jest.fn(),
}));

jest.mock('@/src/features/projects/service', () => ({
  loadMissingCloudProject: jest.fn().mockResolvedValue(undefined),
  refreshCloudProjectDetails: jest.fn().mockResolvedValue(undefined),
  updateCloudProjectDetails: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ isClerkSignedIn: true, clerkUserId: 'user-1' }),
}));

jest.mock('@/src/features/auth/services/accountScopedUiState', () => ({
  accountScopedUiStateKey: (state: { scope: string } | null) => state?.scope ?? 'unavailable',
  captureAccountScopedUiState: (scope: 'local' | 'cloud') => ({ scope }),
  isAccountScopedUiStateCurrent: (state: { scope: string } | null, mode: string) =>
    state?.scope === mode,
}));

jest.mock('@/src/features/projects/components/ProjectChatsTab', () => ({
  ProjectChatsTab: () => null,
}));
jest.mock('@/src/features/projects/components/ProjectSourcesTab', () => ({
  ProjectSourcesTab: () => null,
}));
jest.mock('@/src/features/projects/components/ProjectWorkTab', () => ({
  ProjectWorkTab: () => null,
}));
jest.mock('@/src/features/projects/components/ProjectArtifactsTab', () => ({
  ProjectArtifactsTab: () => null,
}));
jest.mock('@/src/features/projects/components/ProjectRoutinesTab', () => ({
  ProjectRoutinesTab: () => null,
}));
jest.mock('@/src/features/projects/components/CloudProjectOverview', () => ({
  CloudProjectOverview: () => null,
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'project-1' }),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

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

jest.mock('@/src/navigation/openNearestDrawer', () => ({ openNearestDrawer: jest.fn() }));

import React from 'react';
import { Alert, Modal } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import ProjectDetailScreen from '@/app/(app)/projects/[id]';
import { api } from '@/services/api';
import { syncNow } from '@/services/cloudSyncEngine';
import { useProjectStore } from '@/src/features/projects/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';
import { useCloudMemoryStore, type CloudMemoryEntry } from '@/stores/memory/cloudMemoryStore';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import { PROJECT_INSTRUCTIONS_MAX_LENGTH } from '@agiworkforce/cloud-contracts';

const NOW = '2026-07-20T10:00:00.000Z';
const PLACEHOLDER = 'e.g. Use a professional tone. Keep answers short.';

function cloudProject(overrides: Partial<CloudProject> = {}): CloudProject {
  return {
    id: 'project-1',
    name: 'Billing rewrite',
    description: null,
    instructions: null,
    color: null,
    isArchived: false,
    metadata: null,
    source: 'web',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    serverVersion: '1',
    ...overrides,
  };
}

function memory(overrides: Partial<CloudMemoryEntry>): CloudMemoryEntry {
  return {
    id: 'm-1',
    content: 'Targets the EU market',
    category: null,
    source: 'web',
    pinned: false,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    isDeleted: false,
    projectId: 'project-1',
    projectName: 'Billing rewrite',
    ...overrides,
  };
}

function setLocalProject(instructions: string) {
  useChatAppModeStore.setState({ appMode: 'local' });
  useCloudProjectStore.setState({ projects: [], activeProjectId: null, details: {} });
  useProjectStore.setState({
    projects: [
      {
        id: 'project-1',
        name: 'Launch demo',
        description: '',
        instructions,
        sources: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    activeProjectId: null,
  });
}

function setCloudProject(project: CloudProject, details: Record<string, unknown> = {}) {
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useProjectStore.setState({ projects: [], activeProjectId: null });
  useCloudProjectStore.setState({
    projects: [project],
    activeProjectId: null,
    details: { [project.id]: details as never },
  });
}

function lastAlertButtons() {
  return (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as {
    text?: string;
    onPress?: () => void;
  }[];
}

function pressAlertButton(text: string) {
  act(() =>
    lastAlertButtons()
      .find((button) => button.text === text)
      ?.onPress?.(),
  );
}

function openInstructions(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByTestId('project-instructions-add'));
}

beforeEach(() => {
  jest.clearAllMocks();
  useCloudMemoryStore.setState({ entries: [] });
  useCloudSyncStateStore.setState({ status: 'idle', failedSyncSteps: [], lastError: null });
  jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
});

describe('Project page instructions control', () => {
  it('offers Add instructions in Local mode and no memory button', () => {
    setLocalProject('');
    const screen = render(<ProjectDetailScreen />);

    expect(screen.getByLabelText('Add instructions')).toBeTruthy();
    expect(screen.queryByTestId('project-instructions-row')).toBeNull();
    expect(screen.queryByLabelText('View memory')).toBeNull();
  });

  it('turns into a row with a two-line preview once instructions exist', () => {
    setLocalProject('Use a professional tone.');
    const screen = render(<ProjectDetailScreen />);

    expect(screen.queryByTestId('project-instructions-add')).toBeNull();
    expect(screen.getByText('Instructions')).toBeTruthy();
    expect(screen.getByTestId('project-instructions-preview').props.numberOfLines).toBe(2);
    expect(screen.getByText('Use a professional tone.')).toBeTruthy();
  });

  it('opens the sheet pre-filled with the placeholder, helper text and the editor limit', () => {
    setLocalProject('Use a professional tone.');
    const screen = render(<ProjectDetailScreen />);

    fireEvent.press(screen.getByTestId('project-instructions-row'));

    const input = screen.getByLabelText('Project instructions');
    expect(input.props.value).toBe('Use a professional tone.');
    expect(input.props.placeholder).toBe(PLACEHOLDER);
    expect(input.props.maxLength).toBe(PROJECT_INSTRUCTIONS_MAX_LENGTH);
    expect(screen.getByText('Tell AGI how to behave and respond within Launch demo.')).toBeTruthy();
  });

  it('keeps the save check disabled until the text differs from the saved value', () => {
    setLocalProject('Use a professional tone.');
    const screen = render(<ProjectDetailScreen />);
    fireEvent.press(screen.getByTestId('project-instructions-row'));

    const check = () => screen.getByLabelText('Save instructions');
    expect(check().props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('project-instructions-input'), 'Keep answers short.');
    expect(check().props.accessibilityState.disabled).toBe(false);

    fireEvent.changeText(
      screen.getByTestId('project-instructions-input'),
      'Use a professional tone.',
    );
    expect(check().props.accessibilityState.disabled).toBe(true);
  });

  it('saves a Local project and closes the sheet', () => {
    setLocalProject('');
    const screen = render(<ProjectDetailScreen />);
    openInstructions(screen);

    fireEvent.changeText(
      screen.getByTestId('project-instructions-input'),
      '  Keep answers short.  ',
    );
    fireEvent.press(screen.getByLabelText('Save instructions'));

    expect(useProjectStore.getState().projects[0]?.instructions).toBe('Keep answers short.');
    expect(screen.queryByTestId('project-instructions-input')).toBeNull();
    expect(screen.getByTestId('project-instructions-preview')).toBeTruthy();
  });

  it('clears the instructions when the field is emptied and saved', () => {
    setLocalProject('Use a professional tone.');
    const screen = render(<ProjectDetailScreen />);
    fireEvent.press(screen.getByTestId('project-instructions-row'));

    fireEvent.changeText(screen.getByTestId('project-instructions-input'), '');
    expect(screen.getByLabelText('Save instructions').props.accessibilityState.disabled).toBe(
      false,
    );
    fireEvent.press(screen.getByLabelText('Save instructions'));

    expect(useProjectStore.getState().projects[0]?.instructions).toBe('');
    expect(screen.getByTestId('project-instructions-add')).toBeTruthy();
  });

  it('closes at once when nothing changed', () => {
    setLocalProject('Use a professional tone.');
    const screen = render(<ProjectDetailScreen />);
    fireEvent.press(screen.getByTestId('project-instructions-row'));

    fireEvent.press(screen.getByLabelText('Close instructions'));

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.queryByTestId('project-instructions-input')).toBeNull();
  });

  it('asks before discarding edits and keeps them on Keep editing', () => {
    setLocalProject('Use a professional tone.');
    const screen = render(<ProjectDetailScreen />);
    fireEvent.press(screen.getByTestId('project-instructions-row'));
    fireEvent.changeText(screen.getByTestId('project-instructions-input'), 'Something else');

    fireEvent.press(screen.getByLabelText('Close instructions'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard changes to the instructions?',
      expect.any(String),
      expect.any(Array),
    );
    expect(lastAlertButtons().map((button) => button.text)).toEqual(['Keep editing', 'Discard']);
    pressAlertButton('Keep editing');
    expect(screen.getByTestId('project-instructions-input').props.value).toBe('Something else');
    expect(useProjectStore.getState().projects[0]?.instructions).toBe('Use a professional tone.');
  });

  it('closes without saving on Discard', () => {
    setLocalProject('Use a professional tone.');
    const screen = render(<ProjectDetailScreen />);
    fireEvent.press(screen.getByTestId('project-instructions-row'));
    fireEvent.changeText(screen.getByTestId('project-instructions-input'), 'Something else');

    fireEvent.press(screen.getByLabelText('Close instructions'));
    pressAlertButton('Discard');

    expect(screen.queryByTestId('project-instructions-input')).toBeNull();
    expect(useProjectStore.getState().projects[0]?.instructions).toBe('Use a professional tone.');
  });

  it('asks the same question on the Android back gesture', () => {
    setLocalProject('');
    const screen = render(<ProjectDetailScreen />);
    openInstructions(screen);
    fireEvent.changeText(screen.getByTestId('project-instructions-input'), 'Draft');

    act(() => {
      for (const sheet of screen.UNSAFE_getAllByType(Modal)) {
        (sheet.props.onRequestClose as (() => void) | undefined)?.();
      }
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard changes to the instructions?',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('keeps the sheet open with an error when the save throws', () => {
    setLocalProject('');
    const original = useProjectStore.getState().updateProject;
    useProjectStore.setState({
      updateProject: () => {
        throw new Error('Storage is full');
      },
    });
    try {
      const screen = render(<ProjectDetailScreen />);
      openInstructions(screen);

      fireEvent.changeText(screen.getByTestId('project-instructions-input'), 'Draft');
      fireEvent.press(screen.getByLabelText('Save instructions'));

      expect(screen.getByTestId('project-instructions-input').props.value).toBe('Draft');
      expect(screen.getByText('Could not save the instructions. Try again.')).toBeTruthy();
    } finally {
      useProjectStore.setState({ updateProject: original });
    }
  });

  it('saves a Cloud project through the sync push and clears it with an empty save', () => {
    setCloudProject(cloudProject({ instructions: 'Be brief.' }));
    const screen = render(<ProjectDetailScreen />);
    fireEvent.press(screen.getByTestId('project-instructions-row'));

    fireEvent.changeText(screen.getByTestId('project-instructions-input'), 'Be formal.');
    fireEvent.press(screen.getByLabelText('Save instructions'));
    expect(useCloudProjectStore.getState().projects[0]?.instructions).toBe('Be formal.');
    expect(mockMarkProjectForSync).toHaveBeenCalledWith('project-1');

    fireEvent.press(screen.getByTestId('project-instructions-row'));
    fireEvent.changeText(screen.getByTestId('project-instructions-input'), '');
    fireEvent.press(screen.getByLabelText('Save instructions'));
    expect(useCloudProjectStore.getState().projects[0]?.instructions).toBeNull();
  });

  it('hides the control on an archived project', () => {
    setCloudProject(cloudProject({ isArchived: true }));
    const screen = render(<ProjectDetailScreen />);

    expect(screen.queryByTestId('project-instructions-add')).toBeNull();
    expect(screen.queryByTestId('project-instructions-row')).toBeNull();
    expect(screen.queryByTestId('project-instructions-readonly')).toBeNull();
  });

  it('still shows the instructions of an archived project, without a way to open the sheet', () => {
    setCloudProject(cloudProject({ isArchived: true, instructions: 'Be brief.' }));
    const screen = render(<ProjectDetailScreen />);

    const readOnly = screen.getByTestId('project-instructions-readonly');
    expect(within(readOnly).getByText('Be brief.')).toBeTruthy();
    expect(screen.queryByTestId('project-instructions-row')).toBeNull();
    expect(screen.queryByLabelText('Add instructions')).toBeNull();
  });

  it('labels the row Instructions and keeps the long text out of the label', () => {
    const long = 'Use a professional tone. '.repeat(100);
    setLocalProject(long);
    const screen = render(<ProjectDetailScreen />);

    const row = screen.getByTestId('project-instructions-row');
    expect(row.props.accessibilityLabel).toBe('Instructions');
    expect(String(row.props.accessibilityValue.text).length).toBeLessThanOrEqual(200);
  });

  it('keeps the header and the controls in one scroll area capped at half the screen', () => {
    setCloudProject(cloudProject({ instructions: 'Be brief.' }));
    const screen = render(<ProjectDetailScreen />);

    const header = screen.getByTestId('project-detail-header-scroll');
    expect(header.props.style).toEqual(expect.objectContaining({ flexGrow: 0, maxHeight: '50%' }));
    expect(within(header).getByTestId('project-quick-actions')).toBeTruthy();
    expect(within(header).queryByLabelText('Chats')).toBeNull();
    expect(screen.getByLabelText('Chats')).toBeTruthy();
  });

  it('hides the control and memory on a project shared with the user', () => {
    setCloudProject(cloudProject(), { isOrgShared: true, sharedAccess: 'read' });
    const screen = render(<ProjectDetailScreen />);

    expect(screen.queryByTestId('project-instructions-add')).toBeNull();
    expect(screen.queryByLabelText('View memory')).toBeNull();
  });

  it('shows both controls on a Cloud project the user owns, even when org-shared', () => {
    setCloudProject(cloudProject(), { isOrgShared: true, sharedAccess: null });
    const screen = render(<ProjectDetailScreen />);

    expect(screen.getByTestId('project-instructions-add')).toBeTruthy();
    expect(screen.getByLabelText('View memory')).toBeTruthy();
  });
});

describe('Project memory sheet', () => {
  beforeEach(() => {
    setCloudProject(cloudProject());
  });

  function openMemory(screen: ReturnType<typeof render>) {
    fireEvent.press(screen.getByLabelText('View memory'));
  }

  it('lists the project memories with pinned first and then newest', () => {
    useCloudMemoryStore.setState({
      entries: [
        memory({ id: 'old', content: 'Oldest note', createdAt: '2026-09-01T00:00:00.000Z' }),
        memory({ id: 'new', content: 'Newest note', createdAt: '2026-10-05T00:00:00.000Z' }),
        memory({
          id: 'pin',
          content: 'Pinned note',
          pinned: true,
          createdAt: '2026-08-01T00:00:00.000Z',
        }),
        memory({ id: 'other', content: 'Another project', projectId: 'project-2' }),
      ],
    });
    const screen = render(<ProjectDetailScreen />);
    openMemory(screen);

    const labels = screen
      .getAllByLabelText(/^Delete project memory: /)
      .map((node) => String(node.props.accessibilityLabel));
    expect(labels).toEqual([
      'Delete project memory: Pinned note',
      'Delete project memory: Newest note',
      'Delete project memory: Oldest note',
    ]);
    expect(screen.getByText('Memory')).toBeTruthy();
    expect(syncNow).toHaveBeenCalled();
  });

  it('shows the empty state', () => {
    const screen = render(<ProjectDetailScreen />);
    openMemory(screen);

    expect(screen.getByTestId('project-memory-empty')).toBeTruthy();
    expect(screen.getByText('No memory yet')).toBeTruthy();
    expect(screen.getByText("AGI saves what it learns in this project's chats here.")).toBeTruthy();
  });

  it('shows a spinner while the first load runs', () => {
    (syncNow as jest.Mock).mockReturnValueOnce(new Promise(() => undefined));
    useCloudSyncStateStore.setState({ status: 'syncing' });
    const screen = render(<ProjectDetailScreen />);
    openMemory(screen);

    expect(screen.getByLabelText('Loading memory')).toBeTruthy();
    expect(screen.queryByTestId('project-memory-empty')).toBeNull();
  });

  it('keeps the empty state when a background sync starts after the first load', async () => {
    const screen = render(<ProjectDetailScreen />);
    openMemory(screen);
    await waitFor(() => expect(syncNow).toHaveBeenCalled());
    await act(async () => undefined);

    act(() => useCloudSyncStateStore.setState({ status: 'syncing' }));

    expect(screen.queryByLabelText('Loading memory')).toBeNull();
    expect(screen.getByTestId('project-memory-empty')).toBeTruthy();
  });

  it('says it could not load and retries with Try again', () => {
    useCloudSyncStateStore.setState({ status: 'error', failedSyncSteps: ['memory'] });
    const screen = render(<ProjectDetailScreen />);
    openMemory(screen);
    (syncNow as jest.Mock).mockClear();

    expect(screen.getByText('Memory could not be loaded.')).toBeTruthy();
    expect(screen.queryByTestId('project-memory-empty')).toBeNull();
    fireEvent.press(screen.getByLabelText('Try again'));

    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('keeps showing saved memories when a later sync fails', () => {
    useCloudSyncStateStore.setState({ status: 'error', failedSyncSteps: ['memory'] });
    useCloudMemoryStore.setState({ entries: [memory({})] });
    const screen = render(<ProjectDetailScreen />);
    openMemory(screen);

    expect(screen.queryByText('Memory could not be loaded.')).toBeNull();
    expect(screen.getByLabelText('Delete project memory: Targets the EU market')).toBeTruthy();
  });

  it('deletes a memory only after the confirmation names what is lost', async () => {
    (api.delete as jest.Mock).mockResolvedValue({});
    useCloudMemoryStore.setState({ entries: [memory({})] });
    const screen = render(<ProjectDetailScreen />);
    openMemory(screen);

    fireEvent.press(screen.getByLabelText('Delete project memory: Targets the EU market'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete this project memory?',
      expect.stringContaining('It cannot be restored'),
      expect.any(Array),
    );
    expect(api.delete).not.toHaveBeenCalled();
    pressAlertButton('Delete memory');

    await waitFor(() => expect(useCloudMemoryStore.getState().entries).toHaveLength(0));
    expect(api.delete).toHaveBeenCalledWith('/api/memory/m-1');
  });

  it('shows a one-line error when a delete fails and keeps the memory', async () => {
    (api.delete as jest.Mock).mockRejectedValue(new Error('offline'));
    useCloudMemoryStore.setState({ entries: [memory({})] });
    const screen = render(<ProjectDetailScreen />);
    openMemory(screen);

    fireEvent.press(screen.getByLabelText('Delete project memory: Targets the EU market'));
    pressAlertButton('Delete memory');

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(useCloudMemoryStore.getState().entries).toHaveLength(1);
  });

  it('opens the project memory settings from the footer link', () => {
    jest.useFakeTimers();
    const screen = render(<ProjectDetailScreen />);
    openMemory(screen);

    fireEvent.press(screen.getByLabelText('Memory settings'));
    act(() => {
      for (const sheet of screen.UNSAFE_getAllByType(Modal)) {
        (sheet.props.onDismiss as (() => void) | undefined)?.();
      }
      jest.runAllTimers();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/projects/settings/[id]',
      params: { id: 'project-1' },
    });
    jest.useRealTimers();
  });
});
