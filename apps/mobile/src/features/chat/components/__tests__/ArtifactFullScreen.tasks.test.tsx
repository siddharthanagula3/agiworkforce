import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@clerk/expo', () => ({ getClerkInstance: jest.fn() }));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/fileCreation', () => ({
  shareFile: jest.fn(),
  exportToText: jest.fn(),
  exportToMarkdown: jest.fn(),
  downloadGeneratedFile: jest.fn(),
  downloadFailureMessage: (_error: unknown, fallback: string) => fallback,
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

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('@/src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => null,
}));

import { ArtifactFullScreen } from '../ArtifactFullScreen';
import { useArtifactStore } from '@/src/features/artifacts/store';
import type { MobileArtifact } from '@/src/features/artifacts/types';
import type { Artifact } from '@/types/chat';

const CHECKLIST = '# Launch\n\n- [ ] Draft the note\n- [x] Book the room\n';

const checklistArtifact: Artifact = {
  id: 'artifact-checklist',
  type: 'document',
  title: 'Launch',
  content: CHECKLIST,
};

function stored(content: string): MobileArtifact {
  return {
    id: checklistArtifact.id,
    messageId: 'message-checklist',
    title: checklistArtifact.title,
    kind: 'document',
    content,
    ageLabel: 'just now',
    sourceLabel: 'Local chat',
    accentColor: '#21808d',
    previewLines: [content],
    provenance: { scope: 'local' },
  };
}

beforeEach(() => {
  useArtifactStore.setState({
    artifacts: [],
    versionsById: {},
    cloudArtifacts: [],
    cloudArtifactsOwnerId: null,
  });
});

describe('task lists in a document artifact', () => {
  it('ticks a task in place and keeps the earlier text as a version', () => {
    useArtifactStore.getState().addArtifacts([stored(CHECKLIST)]);
    const screen = render(
      <ArtifactFullScreen artifact={checklistArtifact} visible onClose={jest.fn()} />,
    );

    const draft = screen.getByRole('checkbox', { name: 'Draft the note' });
    expect(draft.props.accessibilityState).toEqual({ checked: false });

    fireEvent.press(draft);

    const ticked = '# Launch\n\n- [x] Draft the note\n- [x] Book the room\n';
    expect(useArtifactStore.getState().artifacts[0]?.content).toBe(ticked);
    expect(
      useArtifactStore
        .getState()
        .getArtifactVersions(checklistArtifact.id)
        .map((version) => version.content),
    ).toEqual([CHECKLIST, ticked]);
    expect(
      screen.getByRole('checkbox', { name: 'Draft the note' }).props.accessibilityState,
    ).toEqual({ checked: true });
  });

  it('unticks a done task', () => {
    useArtifactStore.getState().addArtifacts([stored(CHECKLIST)]);
    const screen = render(
      <ArtifactFullScreen artifact={checklistArtifact} visible onClose={jest.fn()} />,
    );

    fireEvent.press(screen.getByRole('checkbox', { name: 'Book the room' }));

    expect(useArtifactStore.getState().artifacts[0]?.content).toBe(
      '# Launch\n\n- [ ] Draft the note\n- [ ] Book the room\n',
    );
  });

  it('shows the boxes read only when the artifact cannot be edited here', () => {
    const screen = render(
      <ArtifactFullScreen artifact={checklistArtifact} visible onClose={jest.fn()} />,
    );

    expect(
      screen.getByRole('checkbox', { name: 'Draft the note' }).props.accessibilityState,
    ).toEqual({ checked: false, disabled: true });
    expect(useArtifactStore.getState().artifacts).toEqual([]);
  });
});
