import { fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { actionMenuLabels, cancelActionMenu, chooseActionMenuItem } from '@/test-utils/actionMenu';
import { buildChangeReview, resolveReview } from '@agiworkforce/artifacts';

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

const V1 = 'The team met on Monday. Sales rose in the north. Hiring stays paused.';
const V2 = 'The team met on Tuesday. Sales rose in every region. Hiring stays paused.';

const viewerArtifact: Artifact = {
  id: 'artifact-review',
  type: 'document',
  title: 'Weekly notes',
  content: V2,
};

function storeArtifact(content: string): MobileArtifact {
  return {
    id: viewerArtifact.id,
    messageId: 'message-review',
    title: viewerArtifact.title,
    kind: 'document',
    content,
    ageLabel: 'just now',
    sourceLabel: 'Local chat',
    accentColor: '#21808d',
    previewLines: [content],
    provenance: { scope: 'local' },
  };
}

function versions(): string[] {
  return useArtifactStore
    .getState()
    .getArtifactVersions(viewerArtifact.id)
    .map((version) => version.content);
}

let alertSpy: jest.SpyInstance;

function moreMenu(screen: ReturnType<typeof render>): string[] {
  fireEvent.press(screen.getByLabelText('More artifact actions'));
  const labels = actionMenuLabels();
  cancelActionMenu();
  return labels;
}

function openReview(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByLabelText('More artifact actions'));
  if (!actionMenuLabels().includes('Review changes')) {
    throw new Error('Review changes is not in the More menu');
  }
  chooseActionMenuItem('Review changes');
  alertSpy.mockClear();
}

function renderRevised() {
  const store = useArtifactStore.getState();
  store.addArtifacts([storeArtifact(V1)]);
  store.saveArtifactEdit(storeArtifact(V2));
  return render(<ArtifactFullScreen artifact={viewerArtifact} visible onClose={jest.fn()} />);
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

describe('reviewing the changes to a revised document', () => {
  it('lists each change with Undo, and says how many are kept', () => {
    const screen = renderRevised();
    openReview(screen);

    expect(screen.getByTestId('artifact-changes-review')).toBeTruthy();
    expect(screen.getByTestId('artifact-review-summary').props.children).toBe(
      'Version 2 against version 1: 2 changes, keeping 2',
    );
    expect(screen.getByLabelText('Undo change 1')).toBeTruthy();
    expect(screen.getByLabelText('Undo change 2')).toBeTruthy();
    expect(screen.getByLabelText('Save my choices').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('undoes only the chosen change and saves the result as a new version', () => {
    const screen = renderRevised();
    openReview(screen);

    fireEvent.press(screen.getByLabelText('Undo change 2'));
    expect(screen.getByTestId('artifact-review-summary').props.children).toBe(
      'Version 2 against version 1: 2 changes, keeping 1',
    );
    expect(screen.getByLabelText('Keep change 2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Save my choices'));

    const review = buildChangeReview(V1, V2)!;
    const expected = resolveReview(review, new Set([1]));
    expect(expected).toBe('The team met on Tuesday. Sales rose in the north. Hiring stays paused.');
    expect(versions()).toEqual([V1, V2, expected]);
    expect(alertSpy).toHaveBeenCalledWith('Saved your choices as a new version');
    expect(screen.queryByTestId('artifact-changes-review')).toBeNull();
  });

  it('Undo all then Save my choices returns the earlier text as a new version', () => {
    const screen = renderRevised();
    openReview(screen);

    fireEvent.press(screen.getByLabelText('Undo all'));
    expect(screen.getByLabelText('Keep change 1')).toBeTruthy();
    expect(screen.getByLabelText('Keep change 2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Save my choices'));

    expect(versions()).toEqual([V1, V2, V1]);
  });

  it('Keep all clears the choices, and Cancel leaves the document as it was', () => {
    const screen = renderRevised();
    openReview(screen);

    fireEvent.press(screen.getByLabelText('Undo all'));
    fireEvent.press(screen.getByLabelText('Keep all'));
    expect(screen.getByLabelText('Save my choices').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    fireEvent.press(screen.getByLabelText('Cancel'));

    expect(screen.queryByTestId('artifact-changes-review')).toBeNull();
    expect(versions()).toEqual([V1, V2]);
  });

  it('is not offered on an older version, a single version or source code', () => {
    useArtifactStore.getState().addArtifacts([storeArtifact(V1)]);
    const single = render(
      <ArtifactFullScreen artifact={viewerArtifact} visible onClose={jest.fn()} />,
    );
    expect(moreMenu(single)).not.toContain('Review changes');
    single.unmount();

    useArtifactStore.getState().saveArtifactEdit(storeArtifact(V2));
    const older = render(
      <ArtifactFullScreen artifact={viewerArtifact} visible onClose={jest.fn()} />,
    );
    fireEvent.press(older.getByLabelText('Previous version'));
    expect(moreMenu(older)).not.toContain('Review changes');
    older.unmount();

    const code: Artifact = { ...viewerArtifact, type: 'code', language: 'typescript' };
    const codeScreen = render(<ArtifactFullScreen artifact={code} visible onClose={jest.fn()} />);
    expect(moreMenu(codeScreen)).not.toContain('Review changes');
  });
});
