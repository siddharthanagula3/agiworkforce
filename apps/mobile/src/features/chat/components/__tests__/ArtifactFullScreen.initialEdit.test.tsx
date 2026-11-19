import { fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockStore = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  mmkvStorage: {
    getItem: (key: string) => mockStore.get(key) ?? null,
    setItem: (key: string, value: string) => void mockStore.set(key, value),
    removeItem: (key: string) => void mockStore.delete(key),
  },
  storage: { getAllKeys: () => [...mockStore.keys()] },
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn(),
}));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native-webview', () => ({ WebView: () => null }));

jest.mock('../MessageContentRenderer', () => ({ renderMarkdownContent: () => null }));

jest.mock('../SafeArtifactPreview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeArtifactPreview: () => <View testID="safe-artifact-preview" /> };
});

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('@/src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => null,
}));

import { ArtifactFullScreen } from '../ArtifactFullScreen';
import { keepArtifactDraft } from '@/src/features/artifacts/artifactDrafts';
import { useArtifactStore } from '@/src/features/artifacts/store';
import type { MobileArtifact } from '@/src/features/artifacts/types';
import type { Artifact } from '@/types/chat';

const SOURCE = 'def add(a, b):\n    return a + b';

const codeArtifact: Artifact = {
  id: 'artifact-code',
  type: 'code',
  title: 'Code',
  content: SOURCE,
  language: 'python',
};

const storedCode: MobileArtifact = {
  id: codeArtifact.id,
  messageId: 'message-code',
  title: codeArtifact.title,
  kind: 'code',
  language: 'python',
  content: SOURCE,
  ageLabel: 'just now',
  sourceLabel: 'Local chat',
  accentColor: '#21808d',
  previewLines: [SOURCE],
  provenance: { scope: 'local' },
};

function openInEditor(artifact: Artifact = codeArtifact) {
  return render(
    <ArtifactFullScreen artifact={artifact} visible onClose={jest.fn()} initialMode="edit" />,
  );
}

let alert: jest.SpyInstance;

beforeEach(() => {
  mockStore.clear();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useArtifactStore.setState({
    artifacts: [],
    versionsById: {},
    cloudArtifacts: [],
    cloudArtifactsOwnerId: null,
    pendingCloudPushes: {},
  });
  useArtifactStore.getState().addArtifacts([storedCode]);
});

afterEach(() => alert.mockRestore());

describe('opening an artifact straight into Edit source', () => {
  it('starts editing the stored source on open', () => {
    const screen = openInEditor();

    expect(screen.getByLabelText('Artifact source').props.value).toBe(SOURCE);
    expect(screen.queryByTestId('artifact-edit-restored')).toBeNull();
  });

  it('saves the edit as a new version', () => {
    const screen = openInEditor();

    fireEvent.changeText(screen.getByLabelText('Artifact source'), 'def add(a, b): ...');
    fireEvent.press(screen.getByLabelText('Save as a new version'));

    expect(useArtifactStore.getState().artifacts[0]?.content).toBe('def add(a, b): ...');
    expect(useArtifactStore.getState().versionsById[codeArtifact.id]).toHaveLength(2);
    expect(screen.queryByLabelText('Artifact source')).toBeNull();
  });

  it('leaves the stored artifact in place when editing is cancelled without changes', () => {
    const screen = openInEditor();

    fireEvent.press(screen.getByLabelText('Cancel editing'));

    expect(screen.queryByLabelText('Artifact source')).toBeNull();
    expect(alert).not.toHaveBeenCalled();
    expect(useArtifactStore.getState().artifacts.map((row) => row.id)).toEqual([codeArtifact.id]);
  });

  it('gives back a kept unsaved edit instead of starting over', () => {
    keepArtifactDraft(codeArtifact.id, storedCode.provenance!, {
      base: SOURCE,
      content: 'def add(a, b): pass',
    });

    const screen = openInEditor();

    expect(screen.getByLabelText('Artifact source').props.value).toBe('def add(a, b): pass');
    expect(screen.getByTestId('artifact-edit-restored')).toBeTruthy();
  });

  it('does not start editing an artifact that is not stored', () => {
    const screen = openInEditor({ ...codeArtifact, id: 'artifact-not-stored' });

    expect(screen.queryByLabelText('Artifact source')).toBeNull();
  });

  it('does not start editing without the edit mode', () => {
    const screen = render(
      <ArtifactFullScreen artifact={codeArtifact} visible onClose={jest.fn()} />,
    );

    expect(screen.queryByLabelText('Artifact source')).toBeNull();
  });
});
