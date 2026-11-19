import { fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { actionMenuLabels, cancelActionMenu, chooseActionMenuItem } from '@/test-utils/actionMenu';
import { artifactReplyFormat } from '@agiworkforce/unified-chat/artifact-edit-request';
import { buildSlideEditRequest } from '@agiworkforce/unified-chat/deck-request';
import { deckSlides } from '../artifact-viewers/presentation/deckContent';

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
import { useComposerPrefillStore } from '@/src/features/chat/store/composerPrefillStore';
import { useArtifactStore } from '@/src/features/artifacts/store';
import type { MobileArtifact } from '@/src/features/artifacts/types';
import type { Artifact } from '@/types/chat';

const V1 = '# Launch plan\n\nShip on Friday.';
const V2 = '# Launch plan\n\nShip on Monday.';
const DECK =
  '<!-- deck -->\n# Q3 review\n\nRevenue grew.\n\n---\n\n# Next steps\n\nHire two people.';

const documentArtifact: Artifact = {
  id: 'artifact-ask',
  type: 'document',
  title: 'Launch plan',
  content: V2,
};

function storeArtifact(content: string): MobileArtifact {
  return {
    id: documentArtifact.id,
    messageId: 'message-ask',
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

let alertSpy: jest.SpyInstance;

function moreMenu(screen: ReturnType<typeof render>): string[] {
  fireEvent.press(screen.getByLabelText('More artifact actions'));
  const labels = actionMenuLabels();
  cancelActionMenu();
  return labels;
}

function pressAsk(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByLabelText('More artifact actions'));
  if (!actionMenuLabels().includes('Ask for changes')) {
    throw new Error('Ask for changes is not in the More menu');
  }
  chooseActionMenuItem('Ask for changes');
}

beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useComposerPrefillStore.setState({ pending: {} });
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

describe('asking for changes to an artifact', () => {
  it("puts a change request naming the artifact in this chat's composer and closes", () => {
    const onClose = jest.fn();
    const screen = render(
      <ArtifactFullScreen
        artifact={documentArtifact}
        visible
        onClose={onClose}
        conversationId="conv-ask"
        messageId="message-ask"
      />,
    );

    pressAsk(screen);

    expect(useComposerPrefillStore.getState().pending['conv-ask']).toBe(
      [
        `Edit the artifact "Launch plan". Keep everything else as it is, including the title. ${artifactReplyFormat('document')}`,
        '',
        'Requested change: ',
      ].join('\n'),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks for a deck back as a presentation', () => {
    const deck: Artifact = {
      id: 'artifact-deck',
      type: 'document',
      title: 'Q3 review',
      content: DECK,
      language: 'markdown',
    };
    const screen = render(
      <ArtifactFullScreen artifact={deck} visible onClose={jest.fn()} conversationId="conv-deck" />,
    );

    pressAsk(screen);

    expect(useComposerPrefillStore.getState().pending['conv-deck']).toContain(
      artifactReplyFormat('presentation'),
    );
  });

  it('is not offered outside a chat or on an older version', () => {
    const outside = render(
      <ArtifactFullScreen artifact={documentArtifact} visible onClose={jest.fn()} />,
    );
    expect(moreMenu(outside)).not.toContain('Ask for changes');
    outside.unmount();

    const store = useArtifactStore.getState();
    store.addArtifacts([storeArtifact(V1)]);
    store.saveArtifactEdit(storeArtifact(V2));
    const older = render(
      <ArtifactFullScreen
        artifact={documentArtifact}
        visible
        onClose={jest.fn()}
        conversationId="conv-ask"
      />,
    );
    expect(moreMenu(older)).toContain('Ask for changes');
    fireEvent.press(older.getByLabelText('Previous version'));
    expect(moreMenu(older)).not.toContain('Ask for changes');
    expect(useComposerPrefillStore.getState().pending).toEqual({});
  });
});

describe('asking about a slide', () => {
  const deck: Artifact = {
    id: 'artifact-deck-slide',
    type: 'document',
    title: 'Q3 review',
    content: DECK,
    language: 'markdown',
  };

  it("puts the request for the slide on screen in this chat's composer and closes", () => {
    const onClose = jest.fn();
    const screen = render(
      <ArtifactFullScreen artifact={deck} visible onClose={onClose} conversationId="conv-slide" />,
    );

    fireEvent.press(screen.getByTestId('deck-ask-slide'));
    fireEvent.changeText(screen.getByTestId('deck-ask-input'), 'Add a chart');
    fireEvent.press(screen.getByTestId('deck-ask-send'));

    const slides = deckSlides(DECK);
    expect(useComposerPrefillStore.getState().pending['conv-slide']).toBe(
      buildSlideEditRequest({
        title: 'Q3 review',
        slideIndex: 0,
        slideCount: slides.length,
        slide: slides[0]!,
        instruction: 'Add a chart',
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is not offered outside a chat', () => {
    const screen = render(<ArtifactFullScreen artifact={deck} visible onClose={jest.fn()} />);
    expect(screen.getByTestId('artifact-fullscreen-deck')).toBeTruthy();
    expect(screen.queryByTestId('deck-ask-slide')).toBeNull();
  });
});
