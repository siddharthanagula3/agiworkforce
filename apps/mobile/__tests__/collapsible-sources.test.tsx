/* eslint-disable @typescript-eslint/no-require-imports */

import { render, fireEvent } from '@testing-library/react-native';

const mockOpenBrowserAsync = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

const mockLinkingOpenURL = jest.fn();
jest.mock('expo-linking', () => ({
  openURL: (...args: unknown[]) => mockLinkingOpenURL(...args),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: ({ children, style }: { children: React.ReactNode; style?: object }) => (
        <View style={style}>{children}</View>
      ),
    },
    useAnimatedStyle: (fn: () => object) => fn(),
    useSharedValue: (initial: number) => ({ value: initial }),
    withTiming: (toValue: number) => toValue,
    Easing: {
      bezier: () => ({}),
    },
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = ({ testID }: { testID?: string }) => <Text testID={testID}>icon</Text>;
  return {
    Paperclip: icon,
    Globe: icon,
    ChevronRight: icon,
    ChevronDown: icon,
    ExternalLink: icon,
  };
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { CollapsibleSources } from '../src/features/chat/components/CollapsibleSources';

const MOCK_SOURCES = [
  {
    url: 'https://docs.example.com/guide',
    title: 'Getting Started Guide',
  },
  {
    url: 'https://blog.test.org/article',
    title: 'Deep Dive into Testing',
  },
  {
    url: 'https://www.wikipedia.org/wiki/test',
    title: 'Wikipedia Article',
  },
];

describe('CollapsibleSources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when sources array is empty', () => {
    const { toJSON } = render(<CollapsibleSources sources={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('renders "View N sources" when collapsed (plural)', () => {
    const { getByText } = render(<CollapsibleSources sources={MOCK_SOURCES} />);
    expect(getByText('View 3 sources')).toBeTruthy();
  });

  it('renders "View 1 source" for single source (singular)', () => {
    const { getByText } = render(<CollapsibleSources sources={[MOCK_SOURCES[0]!]} />);
    expect(getByText('View 1 source')).toBeTruthy();
  });

  it('toggles to show source list when header is pressed', () => {
    const { getByLabelText, getByText } = render(<CollapsibleSources sources={MOCK_SOURCES} />);

    fireEvent.press(getByLabelText('View 3 sources'));

    expect(getByText('Sources')).toBeTruthy();
  });

  it('each source shows domain extracted from URL', () => {
    const { getByLabelText, getByText } = render(<CollapsibleSources sources={MOCK_SOURCES} />);

    fireEvent.press(getByLabelText('View 3 sources'));

    expect(getByText('docs.example.com')).toBeTruthy();
    expect(getByText('blog.test.org')).toBeTruthy();
    expect(getByText('wikipedia.org')).toBeTruthy();
  });

  it('each source shows its title', () => {
    const { getByLabelText, getByText } = render(<CollapsibleSources sources={MOCK_SOURCES} />);

    fireEvent.press(getByLabelText('View 3 sources'));

    expect(getByText('Getting Started Guide')).toBeTruthy();
    expect(getByText('Deep Dive into Testing')).toBeTruthy();
    expect(getByText('Wikipedia Article')).toBeTruthy();
  });

  it('tapping a source opens the URL in the in-app browser, not Safari', () => {
    mockOpenBrowserAsync.mockReset().mockResolvedValue({ type: 'dismiss' });
    mockLinkingOpenURL.mockReset();

    const { getByLabelText } = render(<CollapsibleSources sources={MOCK_SOURCES} />);

    fireEvent.press(getByLabelText('View 3 sources'));

    fireEvent.press(getByLabelText('Source 1: Getting Started Guide'));

    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://docs.example.com/guide',
      expect.objectContaining({ presentationStyle: 'pageSheet' }),
    );
    expect(mockLinkingOpenURL).not.toHaveBeenCalled();
  });

  it('source without title uses domain in accessibility label', () => {
    const sourcesNoTitle = [{ url: 'https://example.com/page' }];
    const { getByLabelText } = render(<CollapsibleSources sources={sourcesNoTitle} />);

    fireEvent.press(getByLabelText('View 1 source'));

    expect(getByLabelText('Source 1: example.com')).toBeTruthy();
  });

  it('can collapse after expanding', () => {
    const { getByLabelText, getByText } = render(<CollapsibleSources sources={MOCK_SOURCES} />);

    fireEvent.press(getByLabelText('View 3 sources'));
    expect(getByText('Sources')).toBeTruthy();

    fireEvent.press(getByLabelText('Hide 3 sources'));
    expect(getByText('View 3 sources')).toBeTruthy();
  });
});
