import { useRef, type ReactNode } from 'react';
import { Keyboard, View } from 'react-native';
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
import { renderMarkdownContent } from '../MessageContentRenderer';
import { ChatScrollIntoView, type ScrollableChatList } from '../cards/ChatScrollIntoView';
import { lightColors } from '@/src/ui/theme/tokens';
import type { Artifact } from '@/types/chat';

type MeasureDone = (x: number, y: number, width: number, height: number) => void;
type Measured = { props: { testID?: string } };
const MockedView = jest.requireMock<{
  default: { prototype: { measureInWindow: (this: Measured, done: MeasureDone) => void } };
}>('react-native/Libraries/Components/View/View').default;

const FORM = '```form\ntitle: Trip\ntext: Name *\nsubmit: Apply\n```';

function formDocument(): Artifact {
  return { id: 'artifact-form', type: 'document', title: 'Trip form', content: FORM };
}

function Thread({ list, children }: { list: ScrollableChatList; children: ReactNode }) {
  const viewport = useRef<View>(null);
  const listRef = useRef<ScrollableChatList>(list);
  return (
    <View ref={viewport} testID="chat-viewport">
      <ChatScrollIntoView list={listRef} viewport={viewport}>
        {children}
      </ChatScrollIntoView>
    </View>
  );
}

function makeList() {
  return { getAbsoluteLastScrollOffset: () => 400, scrollToOffset: jest.fn() };
}

beforeEach(() => {
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
  jest.spyOn(MockedView.prototype, 'measureInWindow').mockImplementation(function measure(
    this: Measured,
    done: MeasureDone,
  ) {
    if (this.props.testID === 'chat-viewport') done(0, 100, 320, 600);
    else done(0, 900, 320, 60);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fields in the full-screen artifact', () => {
  it('scroll the chat list when the same form sits in the thread', () => {
    const list = makeList();
    const screen = render(
      <Thread list={list}>
        <View>{renderMarkdownContent(FORM, lightColors)}</View>
      </Thread>,
    );

    fireEvent(screen.getByLabelText('Name, required'), 'focus');

    expect(list.scrollToOffset).toHaveBeenCalled();
  });

  it('leave the hidden chat list behind the full-screen artifact where it is', () => {
    const list = makeList();
    const screen = render(
      <Thread list={list}>
        <ArtifactFullScreen artifact={formDocument()} visible onClose={jest.fn()} />
      </Thread>,
    );

    fireEvent(screen.getByLabelText('Name, required'), 'focus');

    expect(list.scrollToOffset).not.toHaveBeenCalled();
  });
});
