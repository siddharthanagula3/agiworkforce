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
  markProjectForSync: jest.fn(),
}));

jest.mock('@/src/features/projects/service', () => ({
  updateCloudProjectDetails: jest.fn().mockResolvedValue(undefined),
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

import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CloudProjectOverview } from '../components/CloudProjectOverview';
import { ProjectEditorModal } from '../components/ProjectEditorModal';
import { useProjectEditor, type EditableProject } from '../useProjectEditor';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import { useProjectSyncStateStore } from '@/stores/projects/projectSyncStateStore';
import type { CloudProject } from '@/stores/projects/cloudProjectStore';

const project: CloudProject = {
  id: 'project-1',
  name: 'Billing rewrite',
  description: null,
  instructions: null,
  color: null,
  isArchived: false,
  metadata: null,
  source: 'web',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
};

function syncLine(): string {
  const node = screen.getByText(/^Last used/);
  return String(node.props.children);
}

describe('the project header sync line', () => {
  beforeEach(() => {
    act(() => {
      useCloudSyncStateStore.getState().setStatus('idle');
      useProjectSyncStateStore.getState().resetProjectSync();
    });
  });

  it('says synced when the last project sync worked and nothing waits', () => {
    render(<CloudProjectOverview project={project} details={undefined} />);
    expect(syncLine()).toMatch(/\. Synced across your devices\.$/);
  });

  it('says not synced while project sync is failing', () => {
    act(() => {
      useCloudSyncStateStore.getState().setStatus('error', 'offline', ['projects']);
    });
    render(<CloudProjectOverview project={project} details={undefined} />);
    expect(syncLine()).toMatch(
      /\. Could not sync\. Changes made on your other devices may be missing\.$/,
    );
    expect(syncLine()).not.toContain('Synced across your devices');
  });

  it('says the change has not reached other devices while it waits on a failing sync', () => {
    act(() => {
      useProjectSyncStateStore.getState().markProjectDirty('project-1');
      useCloudSyncStateStore.getState().setStatus('error', 'offline', ['projects']);
    });
    render(<CloudProjectOverview project={project} details={undefined} />);
    expect(syncLine()).toMatch(
      /\. Not synced\. Your other devices get these changes when sync works again\.$/,
    );
  });

  it('says not synced yet while this project waits to be pushed', () => {
    act(() => {
      useProjectSyncStateStore.getState().markProjectDirty('project-1');
    });
    render(<CloudProjectOverview project={project} details={undefined} />);
    expect(syncLine()).toMatch(/\. Not synced yet\.$/);
  });

  it('ignores a failure in a step other than projects', () => {
    act(() => {
      useCloudSyncStateStore.getState().setStatus('error', 'offline', ['memory']);
    });
    render(<CloudProjectOverview project={project} details={undefined} />);
    expect(syncLine()).toMatch(/\. Synced across your devices\.$/);
  });
});

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

describe('closing the project editor', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    editorRef = null;
    alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterEach(() => alert.mockRestore());

  it('closes at once when nothing changed', () => {
    render(<EditorHarness />);
    act(() => editorRef?.openEdit(existing));

    fireEvent.press(screen.getByLabelText('Close project editor'));

    expect(alert).not.toHaveBeenCalled();
    expect(editorRef?.visible).toBe(false);
  });

  it('asks before discarding a typed change, and keeps the sheet on Keep Editing', () => {
    render(<EditorHarness />);
    act(() => editorRef?.openEdit(existing));

    fireEvent.changeText(screen.getByLabelText('Project name'), 'Billing rewrite v2');
    fireEvent.press(screen.getByLabelText('Close project editor'));

    expect(alert).toHaveBeenCalledWith('Discard changes?', 'You have unsaved changes.', [
      expect.objectContaining({ text: 'Discard', style: 'destructive' }),
      expect.objectContaining({ text: 'Keep Editing', style: 'cancel' }),
    ]);
    expect(editorRef?.visible).toBe(true);
    expect(editorRef?.formName).toBe('Billing rewrite v2');
  });

  it('discards the change when the person chooses Discard', () => {
    render(<EditorHarness />);
    act(() => editorRef?.openCreate());

    fireEvent.changeText(screen.getByLabelText('Project name'), 'Trip plan');
    fireEvent.press(screen.getByLabelText('Close project editor'));
    const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    act(() => buttons.find((button) => button.text === 'Discard')?.onPress?.());

    expect(editorRef?.visible).toBe(false);
    expect(editorRef?.formName).toBe('');
  });
});
