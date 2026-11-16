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

jest.mock('@/services/cloudSyncEngine', () => ({
  syncNow: jest.fn().mockResolvedValue(undefined),
  markProjectForSync: (id: string) =>
    require('@/stores/projects/projectSyncStateStore')
      .useProjectSyncStateStore.getState()
      .markProjectDirty(id),
}));

jest.mock('@/src/features/projects/service', () => ({
  updateCloudProjectDetails: jest.fn(),
}));

jest.mock('@/src/shared/components/Toast', () => ({ showToast: jest.fn() }));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: jest.fn(),
  isCloudAccountEpochCurrent: jest.fn(),
  isStaleCloudAccountOperation: (error: unknown) =>
    error instanceof Error && error.name === 'StaleCloudAccountOperationError',
  assertCloudAccountEpochCurrent: jest.fn(),
}));

jest.mock('@/src/features/model-picker/service', () => ({
  getManagedDisplayName: (id: string) => id,
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { TextScaleBoundary } from '@/src/shared/components/TextScaleBoundary';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/ui/theme/tokens';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '@/test-utils/textScale';
import { ProjectEditorModal } from '../components/ProjectEditorModal';
import { useProjectEditor, type EditableProject } from '../useProjectEditor';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useProjectSyncStateStore } from '@/stores/projects/projectSyncStateStore';
import { updateCloudProjectDetails } from '@/src/features/projects/service';
import { showToast } from '@/src/shared/components/Toast';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

const updateDetails = updateCloudProjectDetails as jest.Mock;
const toast = showToast as jest.Mock;
const captureEpoch = captureCloudAccountEpoch as jest.Mock;
const epochIsCurrent = isCloudAccountEpochCurrent as unknown as jest.Mock;

const existing: EditableProject = {
  id: 'project-1',
  name: 'Billing rewrite',
  description: 'Move invoices',
  instructions: 'Be brief',
};

let editorRef: ReturnType<typeof useProjectEditor> | null = null;
function EditorHarness() {
  const editor = useProjectEditor();
  editorRef = editor;
  return <ProjectEditorModal editor={editor} />;
}

function setMode(mode: 'local' | 'cloud') {
  act(() => useChatAppModeStore.getState().setAppMode(mode));
}

function openCreateSheet() {
  render(<EditorHarness />);
  act(() => editorRef?.openCreate());
}

function chooseProjectOnlyAndConfirm() {
  fireEvent.press(screen.getByLabelText('Project settings'));
  fireEvent.press(screen.getByTestId('new-project-memory-projectOnly'));
  fireEvent.press(screen.getByTestId('new-project-settings-done'));
}

function createdProjectId(): string {
  const projects = useCloudProjectStore.getState().projects;
  return projects[projects.length - 1]?.id ?? '';
}

describe('the project settings control in the new project sheet', () => {
  beforeEach(() => {
    editorRef = null;
    setMode('cloud');
  });

  afterEach(() => setMode('local'));

  it('shows a 44 point Settings control labelled Project settings in Cloud', () => {
    openCreateSheet();

    const control = screen.getByLabelText('Project settings');
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(control.props.style).toEqual(expect.objectContaining({ minHeight: 44, minWidth: 44 }));
  });

  it('is hidden in Local Mode, where projects have no memory scope', () => {
    setMode('local');
    openCreateSheet();

    expect(screen.queryByLabelText('Project settings')).toBeNull();
    expect(screen.queryByText('Settings')).toBeNull();
  });

  it('is hidden when an existing project is edited', () => {
    render(<EditorHarness />);
    act(() => editorRef?.openEdit(existing));

    expect(screen.queryByLabelText('Project settings')).toBeNull();
  });

  it('opens the stacked sheet with Default memory selected', () => {
    openCreateSheet();
    fireEvent.press(screen.getByLabelText('Project settings'));

    expect(screen.getByText('Memory')).toBeTruthy();
    expect(screen.getByText('This project can use memories from your other chats.')).toBeTruthy();
    expect(screen.getByText('This project uses only its own memories.')).toBeTruthy();
    expect(screen.getByTestId('new-project-memory-default').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByTestId('new-project-memory-projectOnly').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });
});

describe('Done and Cancel in the project settings sheet', () => {
  beforeEach(() => {
    editorRef = null;
    setMode('cloud');
  });

  afterEach(() => setMode('local'));

  it('Done keeps the choice in the editor and closes only the settings sheet', () => {
    openCreateSheet();
    chooseProjectOnlyAndConfirm();

    expect(editorRef?.memoryScope).toBe('projectOnly');
    expect(editorRef?.visible).toBe(true);
    expect(screen.queryByTestId('new-project-settings-done')).toBeNull();
    expect(screen.getByTestId('project-editor-submit')).toBeTruthy();
  });

  it('Cancel drops the choice made in the sheet and closes only the settings sheet', () => {
    openCreateSheet();
    fireEvent.press(screen.getByLabelText('Project settings'));
    fireEvent.press(screen.getByTestId('new-project-memory-projectOnly'));
    fireEvent.press(screen.getByTestId('new-project-settings-cancel'));

    expect(editorRef?.memoryScope).toBe('default');
    expect(editorRef?.visible).toBe(true);
    expect(screen.queryByTestId('new-project-settings-cancel')).toBeNull();

    fireEvent.press(screen.getByLabelText('Project settings'));
    expect(screen.getByTestId('new-project-memory-default').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });

  it('Cancel restores the choice that was held when the sheet opened', () => {
    openCreateSheet();
    chooseProjectOnlyAndConfirm();

    fireEvent.press(screen.getByLabelText('Project settings'));
    expect(screen.getByTestId('new-project-memory-projectOnly').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    fireEvent.press(screen.getByTestId('new-project-memory-default'));
    fireEvent.press(screen.getByTestId('new-project-settings-cancel'));

    expect(editorRef?.memoryScope).toBe('projectOnly');
  });

  it('forgets the choice when the editor is opened again', () => {
    openCreateSheet();
    chooseProjectOnlyAndConfirm();
    act(() => editorRef?.close());
    act(() => editorRef?.openCreate());

    expect(editorRef?.memoryScope).toBe('default');
    fireEvent.press(screen.getByLabelText('Project settings'));
    expect(screen.getByTestId('new-project-memory-default').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });

  it.each([
    ['the default text size', 1],
    ['the largest text size', LARGEST_IOS_TEXT_SCALE],
  ])('keeps Cancel and Done whole at %s', (_size, scale) => {
    const startingScale = Dimensions.get('window').fontScale;
    setTextScale(scale);
    try {
      render(
        <TextScaleBoundary>
          <EditorHarness />
        </TextScaleBoundary>,
      );
      act(() => editorRef?.openCreate());
      fireEvent.press(screen.getByLabelText('Project settings'));

      const actions = screen.getByTestId('new-project-settings-actions');
      for (const action of ['Cancel', 'Done']) {
        expect(within(actions).getByText(action).props.maxFontSizeMultiplier).toBe(
          HEADER_TEXT_SCALE_LIMIT,
        );
      }
      const title = screen.getByText('Project settings');
      expect(title.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      if (scale === 1) {
        expect(within(actions).getByText('Project settings')).toBe(title);
        expect(screen.queryByTestId('new-project-settings-title-line')).toBeNull();
        return;
      }
      expect(within(actions).queryByText('Project settings')).toBeNull();
      expect(
        within(screen.getByTestId('new-project-settings-title-line')).getByText('Project settings'),
      ).toBe(title);
    } finally {
      setTextScale(startingScale);
    }
  });
});

describe('applying the memory scope after the project is created', () => {
  beforeEach(() => {
    editorRef = null;
    jest.clearAllMocks();
    updateDetails.mockResolvedValue(undefined);
    captureEpoch.mockReturnValue({ ownerId: 'user-1', epoch: 1 });
    epochIsCurrent.mockReturnValue(true);
    act(() => {
      useProjectSyncStateStore.getState().resetProjectSync();
      useCloudProjectStore.getState().clearCloudProjectData();
    });
    setMode('cloud');
  });

  afterEach(() => setMode('local'));

  function createWithName(name: string) {
    fireEvent.changeText(screen.getByLabelText('Project name'), name);
    fireEvent.press(screen.getByTestId('project-editor-submit'));
  }

  async function finishSync(id: string) {
    await act(async () => {
      useProjectSyncStateStore.getState().clearProjectDirty([id]);
    });
  }

  it('waits until the new project has left the sync queue, then sets project-only memory', async () => {
    openCreateSheet();
    chooseProjectOnlyAndConfirm();
    createWithName('Trip plan');

    const id = createdProjectId();
    expect(id).not.toBe('');
    expect(useProjectSyncStateStore.getState().dirtyProjectIds).toContain(id);
    await act(async () => undefined);
    expect(updateDetails).not.toHaveBeenCalled();

    await finishSync(id);

    expect(updateDetails).toHaveBeenCalledTimes(1);
    expect(updateDetails).toHaveBeenCalledWith(id, { usesGlobalMemory: false });
    expect(toast).not.toHaveBeenCalled();
  });

  it('leaves the account setting alone when Default memory stays chosen', async () => {
    openCreateSheet();
    createWithName('Trip plan');

    await finishSync(createdProjectId());

    expect(updateDetails).not.toHaveBeenCalled();
  });

  it('keeps the project and says the memory setting was not saved when the update fails', async () => {
    updateDetails.mockRejectedValue(new Error('offline'));
    openCreateSheet();
    chooseProjectOnlyAndConfirm();
    createWithName('Trip plan');

    const id = createdProjectId();
    await finishSync(id);

    expect(toast).toHaveBeenCalledWith(
      'Project created. Memory setting was not saved; change it in Project settings.',
    );
    expect(useCloudProjectStore.getState().projects.some((p) => p.id === id)).toBe(true);
  });

  it('puts the switch back to Default memory when the update fails after the optimistic write', async () => {
    updateDetails.mockImplementation(async (id: string) => {
      useCloudProjectStore.getState().patchCloudProjectDetails(id, { usesGlobalMemory: false });
      throw new Error('offline');
    });
    openCreateSheet();
    chooseProjectOnlyAndConfirm();
    createWithName('Trip plan');

    const id = createdProjectId();
    await finishSync(id);

    expect(useCloudProjectStore.getState().details[id]?.usesGlobalMemory).not.toBe(false);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('says nothing and sends nothing when the project is deleted before its first push finishes', async () => {
    openCreateSheet();
    chooseProjectOnlyAndConfirm();
    createWithName('Trip plan');

    const id = createdProjectId();
    await act(async () => {
      useCloudProjectStore.getState().hardDeleteCloudProject(id);
    });
    await finishSync(id);

    expect(updateDetails).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('does nothing when the account changed while the project waited to sync', async () => {
    openCreateSheet();
    chooseProjectOnlyAndConfirm();
    createWithName('Trip plan');
    epochIsCurrent.mockReturnValue(false);

    await finishSync(createdProjectId());

    expect(updateDetails).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
