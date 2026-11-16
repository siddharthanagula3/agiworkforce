import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { actionMenuLabels, cancelActionMenu, chooseActionMenuItem } from '@/test-utils/actionMenu';

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

jest.mock('@/services/fileCreation', () => ({
  shareFile: jest.fn(),
  exportToText: jest.fn(),
  exportToMarkdown: jest.fn(),
  downloadGeneratedFile: jest.fn(),
}));

jest.mock('../MessageContentRenderer', () => ({ renderMarkdownContent: () => null }));

jest.mock('../GeneratedFileCard', () => ({ GeneratedFileCard: () => null }));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('@/src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => null,
}));

import { ArtifactFullScreen } from '../ArtifactFullScreen';
import { useArtifactStore } from '@/src/features/artifacts/store';
import type { MobileArtifact } from '@/src/features/artifacts/types';
import type { Artifact } from '@/types/chat';

const V1 = 'const answer = 1;';
const V2 = 'const answer = 2;';
const V3 = 'const answer = 3;';

const viewerArtifact: Artifact = {
  id: 'artifact-undo',
  type: 'code',
  title: 'answer.ts',
  content: V3,
  language: 'typescript',
};

function storeArtifact(content: string): MobileArtifact {
  return {
    id: viewerArtifact.id,
    messageId: 'message-undo',
    title: viewerArtifact.title,
    kind: 'code',
    language: 'typescript',
    content,
    ageLabel: 'just now',
    sourceLabel: 'Local chat',
    accentColor: '#21808d',
    previewLines: [content],
    provenance: { scope: 'local' },
  };
}

function latestContent(): string | undefined {
  return useArtifactStore.getState().artifacts[0]?.content;
}

let alertSpy: jest.SpyInstance;

function pressMenuItem(screen: ReturnType<typeof render>, label: string) {
  fireEvent.press(screen.getByLabelText('More artifact actions'));
  if (!actionMenuLabels().includes(label)) throw new Error(`${label} is not in the More menu`);
  chooseActionMenuItem(label);
}

function menuLabels(screen: ReturnType<typeof render>): string[] {
  fireEvent.press(screen.getByLabelText('More artifact actions'));
  const labels = actionMenuLabels();
  cancelActionMenu();
  return labels;
}

beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useArtifactStore.setState({
    artifacts: [],
    versionsById: {},
    cloudArtifacts: [],
    cloudArtifactsOwnerId: null,
  });
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('undo and redo in the artifact More menu', () => {
  it('reverts the last change and keeps the undone text as a version', () => {
    const store = useArtifactStore.getState();
    store.addArtifacts([storeArtifact(V1)]);
    store.saveArtifactEdit(storeArtifact(V2));
    const screen = render(
      <ArtifactFullScreen artifact={viewerArtifact} visible onClose={jest.fn()} />,
    );

    expect(menuLabels(screen)).toContain('Undo last change');
    expect(menuLabels(screen)).not.toContain('Redo change');

    pressMenuItem(screen, 'Undo last change');

    expect(latestContent()).toBe(V1);
    expect(
      useArtifactStore
        .getState()
        .getArtifactVersions(viewerArtifact.id)
        .map((version) => version.content),
    ).toEqual([V1, V2, V1]);
  });

  it('steps back twice and forward again through the same changes', () => {
    const store = useArtifactStore.getState();
    store.addArtifacts([storeArtifact(V1)]);
    store.saveArtifactEdit(storeArtifact(V2));
    store.saveArtifactEdit(storeArtifact(V3));
    const screen = render(
      <ArtifactFullScreen artifact={viewerArtifact} visible onClose={jest.fn()} />,
    );

    pressMenuItem(screen, 'Undo last change');
    expect(latestContent()).toBe(V2);
    pressMenuItem(screen, 'Undo last change');
    expect(latestContent()).toBe(V1);
    expect(menuLabels(screen)).not.toContain('Undo last change');

    pressMenuItem(screen, 'Redo change');
    expect(latestContent()).toBe(V2);
    pressMenuItem(screen, 'Redo change');
    expect(latestContent()).toBe(V3);
    expect(menuLabels(screen)).not.toContain('Redo change');
  });

  it('forgets the redo step when a new version arrives', () => {
    const store = useArtifactStore.getState();
    store.addArtifacts([storeArtifact(V1)]);
    store.saveArtifactEdit(storeArtifact(V2));
    const screen = render(
      <ArtifactFullScreen artifact={viewerArtifact} visible onClose={jest.fn()} />,
    );

    pressMenuItem(screen, 'Undo last change');
    expect(menuLabels(screen)).toContain('Redo change');

    act(() => useArtifactStore.getState().saveArtifactEdit(storeArtifact(V3)));

    expect(menuLabels(screen)).not.toContain('Redo change');
  });

  it('offers neither while the artifact has a single version', () => {
    useArtifactStore.getState().addArtifacts([storeArtifact(V1)]);
    const screen = render(
      <ArtifactFullScreen artifact={viewerArtifact} visible onClose={jest.fn()} />,
    );

    const labels = menuLabels(screen);
    expect(labels).not.toContain('Undo last change');
    expect(labels).not.toContain('Redo change');
  });

  it('offers neither for an artifact that is not kept on this device', () => {
    const screen = render(
      <ArtifactFullScreen artifact={viewerArtifact} visible onClose={jest.fn()} />,
    );

    const labels = menuLabels(screen);
    expect(labels).not.toContain('Undo last change');
    expect(labels).not.toContain('Redo change');
  });
});
