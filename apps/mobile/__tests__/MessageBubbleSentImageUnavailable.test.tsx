import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { SENT_FILE_UNAVAILABLE_MESSAGE } from '@/src/features/chat/utils/sentAttachment';
import type { ChatMessage } from '@/types/chat';

type FileSystemLegacyModule = typeof import('expo-file-system/legacy');

const mockGetInfoAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  ...jest.requireActual<FileSystemLegacyModule>('expo-file-system/legacy'),
  documentDirectory: 'file:///documents/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
}));

const mockFileViewer = jest.fn();
jest.mock('@/src/features/chat/components/artifact-viewers/FileViewerScreen', () => ({
  FileViewerScreen: (props: { source: unknown }) => {
    mockFileViewer(props.source);
    return null;
  },
}));

const mockExpoImage = jest.fn();
jest.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => {
    mockExpoImage(props);
    return null;
  },
}));

const mockViewer = jest.fn();
const mockViewerImages = jest.fn();
jest.mock('@/src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: (props: { visible: boolean; images?: unknown }) => {
    mockViewer(props.visible);
    mockViewerImages(props.images);
    return null;
  },
}));

type SentAttachment = NonNullable<ChatMessage['attachments']>[number];

const BEACH: SentAttachment = {
  url: 'file:///tmp/beach.jpg',
  mimeType: 'image/jpeg',
  fileName: 'beach.jpg',
};

function sentImage(attachment: SentAttachment = BEACH): ChatMessage {
  return {
    id: 'question-1',
    conversationId: 'conversation-1',
    role: 'user',
    content: 'What is in this picture?',
    createdAt: '2026-11-15T00:00:00.000Z',
    attachments: [attachment],
  };
}

function show(attachment?: SentAttachment) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <MessageBubble message={sentImage(attachment)} />
    </SafeAreaProvider>,
  );
}

describe('a sent image tile', () => {
  beforeEach(() => {
    mockExpoImage.mockClear();
    mockViewer.mockClear();
    mockViewerImages.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('opens the viewer while its picture loads', () => {
    show();

    const tile = screen.getByRole('button', { name: 'Attached image: beach.jpg' });
    expect(tile.props.accessibilityHint).toBe('Opens full screen');
    fireEvent.press(tile);

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockViewer).toHaveBeenLastCalledWith(true);
  });

  it('says the file is no longer available instead of opening a viewer that cannot load it', () => {
    show();

    act(() => mockExpoImage.mock.calls.at(-1)![0].onError());
    const tile = screen.getByRole('button', { name: 'Attached image: beach.jpg, unavailable' });
    expect(tile.props.accessibilityHint).toBeUndefined();
    expect(screen.getByText('Unavailable')).toBeOnTheScreen();
    fireEvent.press(tile);

    expect(Alert.alert).toHaveBeenCalledWith('beach.jpg is no longer available');
    expect(mockViewer).not.toHaveBeenCalledWith(true);
  });

  it('hands the viewer each picture with its type when the file name has no extension', () => {
    show({ url: 'file:///tmp/diagram', mimeType: 'image/svg+xml', fileName: 'diagram' });

    expect(mockViewerImages).toHaveBeenLastCalledWith([
      {
        url: 'file:///tmp/diagram',
        kind: 'attachment',
        name: 'diagram',
        mimeType: 'image/svg+xml',
      },
    ]);
  });
});

const OLD_DOCUMENTS = 'file:///var/old-container/documents/';
const KEPT = 'chat-attachments/conversation-1/copy-1/';

describe('a Local copy kept before an app update moved the app folder', () => {
  beforeEach(() => {
    mockExpoImage.mockClear();
    mockViewer.mockClear();
    mockViewerImages.mockClear();
    mockFileViewer.mockClear();
    mockGetInfoAsync.mockReset();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows and opens the picture from the current documents folder', () => {
    show({
      url: `${OLD_DOCUMENTS}${KEPT}beach.jpg`,
      mimeType: 'image/jpeg',
      fileName: 'beach.jpg',
    });

    expect(mockExpoImage).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: { uri: `file:///documents/${KEPT}beach.jpg` } }),
    );
    expect(mockViewerImages).toHaveBeenLastCalledWith([
      expect.objectContaining({ url: `file:///documents/${KEPT}beach.jpg` }),
    ]);
    fireEvent.press(screen.getByRole('button', { name: 'Attached image: beach.jpg' }));
    expect(mockViewer).toHaveBeenLastCalledWith(true);
  });

  it('opens a sent file from the current documents folder', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    show({
      url: `${OLD_DOCUMENTS}${KEPT}lease.pdf`,
      mimeType: 'application/pdf',
      fileName: 'lease.pdf',
    });

    fireEvent.press(screen.getByTestId('sent-file-chip'));

    await waitFor(() =>
      expect(mockFileViewer).toHaveBeenLastCalledWith(
        expect.objectContaining({
          url: `file:///documents/${KEPT}lease.pdf`,
          fileName: 'lease.pdf',
        }),
      ),
    );
    expect(mockGetInfoAsync).toHaveBeenCalledWith(`file:///documents/${KEPT}lease.pdf`);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('says a sent file is no longer on the phone instead of opening a viewer that cannot read it', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    show({
      url: `file:///documents/${KEPT}lease.pdf`,
      mimeType: 'application/pdf',
      fileName: 'lease.pdf',
    });

    fireEvent.press(screen.getByTestId('sent-file-chip'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not open file',
        SENT_FILE_UNAVAILABLE_MESSAGE,
      ),
    );
    expect(mockFileViewer).not.toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'lease.pdf' }),
    );
  });
});
