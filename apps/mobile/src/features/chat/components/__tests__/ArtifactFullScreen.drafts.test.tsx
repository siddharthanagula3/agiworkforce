import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { chooseActionMenuItem } from '@/test-utils/actionMenu';
import { NavigationContext } from 'expo-router/react-navigation';

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

jest.mock('../GeneratedFileCard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { GeneratedFileCard: () => <View testID="generated-file-card" /> };
});

jest.mock('../SafeArtifactPreview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeArtifactPreview: () => <View testID="safe-artifact-preview" /> };
});

jest.mock('../MermaidDiagramView', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { MermaidDiagramView: () => <View testID="mermaid-diagram-view" /> };
});

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('@/src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => null,
}));

import { ArtifactFullScreen } from '../ArtifactFullScreen';
import { useArtifactStore } from '@/src/features/artifacts/store';
import type { MobileArtifact } from '@/src/features/artifacts/types';
import type { Artifact } from '@/types/chat';

const DOC_V1 = '# Plan\n\nShip on Friday.';
const DOC_V2 = '# Plan\n\nShip on Monday.';

const documentArtifact: Artifact = {
  id: 'artifact-doc',
  type: 'document',
  title: 'Plan',
  content: DOC_V1,
};

function storedDocument(content: string): MobileArtifact {
  return {
    id: documentArtifact.id,
    messageId: 'message-doc',
    title: documentArtifact.title,
    kind: 'document',
    content,
    ageLabel: 'just now',
    sourceLabel: 'Local chat',
    accentColor: '#21808d',
    previewLines: [content],
    provenance: { scope: 'local' },
  };
}

let alert: jest.SpyInstance;

function lastButtons(): AlertButton[] {
  const call = alert.mock.calls[alert.mock.calls.length - 1] ?? [];
  return (call[2] ?? []) as AlertButton[];
}

function press(text: string) {
  const button = lastButtons().find((candidate) => candidate.text === text);
  expect(button).toBeDefined();
  act(() => button?.onPress?.());
}

function openArtifact() {
  return render(<ArtifactFullScreen artifact={documentArtifact} visible onClose={jest.fn()} />);
}

function startEditing(screen: ReturnType<typeof openArtifact>, text: string) {
  fireEvent.press(screen.getByLabelText('More artifact actions'));
  chooseActionMenuItem('Edit source');
  fireEvent.changeText(screen.getByLabelText('Artifact source'), text);
}

beforeEach(() => {
  mockStore.clear();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useArtifactStore.setState({
    artifacts: [],
    versionsById: {},
    cloudArtifacts: [],
    cloudArtifactsOwnerId: null,
  });
  useArtifactStore.getState().addArtifacts([storedDocument(DOC_V1)]);
});

afterEach(() => alert.mockRestore());

describe('unsaved artifact edits', () => {
  it('gives an unsaved edit back after the app closed, and says so', () => {
    const first = openArtifact();
    startEditing(first, 'Ship on Tuesday.');
    first.unmount();

    const reopened = openArtifact();

    expect(reopened.getByLabelText('Artifact source').props.value).toBe('Ship on Tuesday.');
    expect(reopened.getByTestId('artifact-edit-restored')).toBeTruthy();
    expect(reopened.queryByTestId('artifact-edit-stale')).toBeNull();
  });

  it('warns when a newer version arrived after the kept edit was written', () => {
    const first = openArtifact();
    startEditing(first, 'Ship on Tuesday.');
    first.unmount();
    act(() => useArtifactStore.getState().addArtifacts([storedDocument(DOC_V2)]));

    const reopened = openArtifact();

    expect(reopened.getByLabelText('Artifact source').props.value).toBe('Ship on Tuesday.');
    expect(reopened.getByTestId('artifact-edit-stale')).toBeTruthy();
  });

  it('forgets the kept edit once it is saved or discarded', () => {
    const first = openArtifact();
    startEditing(first, 'Ship on Tuesday.');
    fireEvent.press(first.getByLabelText('Save as a new version'));
    expect(useArtifactStore.getState().artifacts[0]?.content).toBe('Ship on Tuesday.');
    first.unmount();
    expect(openArtifact().queryByLabelText('Artifact source')).toBeNull();

    const second = openArtifact();
    startEditing(second, 'Ship next week.');
    fireEvent.press(second.getByLabelText('Cancel editing'));
    press('Discard');
    second.unmount();
    expect(openArtifact().queryByLabelText('Artifact source')).toBeNull();
  });

  it('hides the editor with the full screen and keeps the edit for next time', () => {
    const screen = openArtifact();
    startEditing(screen, 'Ship on Tuesday.');

    screen.rerender(
      <ArtifactFullScreen artifact={documentArtifact} visible={false} onClose={jest.fn()} />,
    );
    expect(screen.queryByLabelText('Artifact source')).toBeNull();

    screen.rerender(<ArtifactFullScreen artifact={documentArtifact} visible onClose={jest.fn()} />);
    expect(screen.getByLabelText('Artifact source').props.value).toBe('Ship on Tuesday.');
  });
});

describe('a link that opens another route under an artifact being edited', () => {
  function openOnScreen(onClose: () => void) {
    const listeners: Record<string, () => void> = {};
    const navigation = {
      addListener: jest.fn((event: string, listener: () => void) => {
        listeners[event] = listener;
        return () => delete listeners[event];
      }),
    };
    const screen = render(
      <NavigationContext.Provider value={navigation as never}>
        <ArtifactFullScreen artifact={documentArtifact} visible onClose={onClose} />
      </NavigationContext.Provider>,
    );
    return { screen, blur: () => act(() => listeners.blur?.()) };
  }

  it('asks before dropping the unsaved edit, and keeps editing when asked to', () => {
    const onClose = jest.fn();
    const { screen, blur } = openOnScreen(onClose);
    startEditing(screen, 'Ship on Tuesday.');
    alert.mockClear();

    blur();

    expect(alert).toHaveBeenCalledWith(
      'Discard your edits?',
      'Your changes to “Plan” will be lost.',
      expect.any(Array),
    );
    expect(onClose).not.toHaveBeenCalled();
    press('Keep editing');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Artifact source').props.value).toBe('Ship on Tuesday.');
  });

  it('closes once the person discards the edit', () => {
    const onClose = jest.fn();
    const { screen, blur } = openOnScreen(onClose);
    startEditing(screen, 'Ship on Tuesday.');

    blur();
    press('Discard');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes without asking when nothing was changed', () => {
    const onClose = jest.fn();
    const { blur } = openOnScreen(onClose);
    alert.mockClear();

    blur();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });
});
