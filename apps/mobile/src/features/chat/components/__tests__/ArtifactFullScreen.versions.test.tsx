import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

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
  id: 'artifact-versioned',
  type: 'code',
  title: 'answer.ts',
  content: V3,
  language: 'typescript',
};

function storeArtifact(content: string): MobileArtifact {
  return {
    id: viewerArtifact.id,
    messageId: 'message-1',
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

function resetStore() {
  useArtifactStore.setState({
    artifacts: [],
    versionsById: {},
    cloudArtifacts: [],
    cloudArtifactsOwnerId: null,
  });
}

describe('mobile artifact store versioning', () => {
  beforeEach(resetStore);

  it('appends a version when the same artifact id arrives with new content', () => {
    const store = useArtifactStore.getState();
    store.addArtifacts([storeArtifact(V1)]);
    store.addArtifacts([storeArtifact(V2)]);

    const versions = useArtifactStore.getState().getArtifactVersions(viewerArtifact.id);
    expect(versions.map((version) => version.content)).toEqual([V1, V2]);
    expect(useArtifactStore.getState().artifacts[0]?.content).toBe(V2);
  });

  it('stays idempotent when identical content is re-derived', () => {
    const store = useArtifactStore.getState();
    store.addArtifacts([storeArtifact(V1)]);
    store.addArtifacts([storeArtifact(V1)]);

    expect(useArtifactStore.getState().getArtifactVersions(viewerArtifact.id)).toHaveLength(1);
    expect(useArtifactStore.getState().artifacts).toHaveLength(1);
  });

  it('restores an older version by appending it as the newest', () => {
    const store = useArtifactStore.getState();
    store.addArtifacts([storeArtifact(V1)]);
    store.addArtifacts([storeArtifact(V2)]);

    expect(useArtifactStore.getState().restoreArtifactVersion(viewerArtifact.id, 0)).toBe(true);

    const versions = useArtifactStore.getState().getArtifactVersions(viewerArtifact.id);
    expect(versions.map((version) => version.content)).toEqual([V1, V2, V1]);
    expect(useArtifactStore.getState().artifacts[0]?.content).toBe(V1);
  });

  it('refuses to restore the version that is already current', () => {
    const store = useArtifactStore.getState();
    store.addArtifacts([storeArtifact(V1)]);
    store.addArtifacts([storeArtifact(V2)]);

    expect(useArtifactStore.getState().restoreArtifactVersion(viewerArtifact.id, 1)).toBe(false);
    expect(useArtifactStore.getState().getArtifactVersions(viewerArtifact.id)).toHaveLength(2);
  });

  it('drops version history for artifacts that are removed', () => {
    const store = useArtifactStore.getState();
    store.addArtifacts([storeArtifact(V1)]);
    store.addArtifacts([storeArtifact(V2)]);
    useArtifactStore.getState().removeArtifact(viewerArtifact.id);

    expect(useArtifactStore.getState().versionsById[viewerArtifact.id]).toBeUndefined();
  });
});

describe('ArtifactFullScreen version history', () => {
  beforeEach(resetStore);

  it('hides the version chip until real edit history exists', () => {
    useArtifactStore.getState().addArtifacts([storeArtifact(V1)]);

    const view = render(
      <ArtifactFullScreen artifact={viewerArtifact} visible onClose={() => undefined} />,
    );

    expect(view.queryByTestId('artifact-version-chip')).toBeNull();
  });

  it('navigates to an earlier version and renders that version’s source', () => {
    const store = useArtifactStore.getState();
    store.addArtifacts([storeArtifact(V1)]);
    store.addArtifacts([storeArtifact(V2)]);
    store.addArtifacts([storeArtifact(V3)]);

    const view = render(
      <ArtifactFullScreen artifact={viewerArtifact} visible onClose={() => undefined} />,
    );

    expect(view.getByTestId('artifact-version-label').props.children).toBe('v3/3');
    expect(view.getByText(V3)).toBeTruthy();

    fireEvent.press(view.getByLabelText('Previous version'));

    expect(view.getByTestId('artifact-version-label').props.children).toBe('v2/3');
    expect(view.getByText(V2)).toBeTruthy();
    expect(view.queryByText(V3)).toBeNull();

    fireEvent.press(view.getByLabelText('Next version'));
    expect(view.getByTestId('artifact-version-label').props.children).toBe('v3/3');
  });

  it('restores the viewed version through the store and snaps back to latest', () => {
    const store = useArtifactStore.getState();
    store.addArtifacts([storeArtifact(V1)]);
    store.addArtifacts([storeArtifact(V2)]);

    const view = render(
      <ArtifactFullScreen artifact={viewerArtifact} visible onClose={() => undefined} />,
    );

    fireEvent.press(view.getByLabelText('Previous version'));
    fireEvent.press(view.getByTestId('artifact-restore-version'));

    expect(useArtifactStore.getState().artifacts[0]?.content).toBe(V1);
    expect(view.getByTestId('artifact-version-label').props.children).toBe('v3/3');
    expect(view.getByText(V1)).toBeTruthy();
  });

  it('offers Restore only while an older version is being viewed', () => {
    const store = useArtifactStore.getState();
    store.addArtifacts([storeArtifact(V1)]);
    store.addArtifacts([storeArtifact(V2)]);

    const view = render(
      <ArtifactFullScreen artifact={viewerArtifact} visible onClose={() => undefined} />,
    );

    expect(view.queryByTestId('artifact-restore-version')).toBeNull();
    fireEvent.press(view.getByLabelText('Previous version'));
    expect(view.getByTestId('artifact-restore-version')).toBeTruthy();
  });
});
