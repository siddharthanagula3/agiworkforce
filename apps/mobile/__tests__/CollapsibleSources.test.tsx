/* eslint-disable @typescript-eslint/no-require-imports */

import { Image, Modal } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';

const mockOpenBrowserAsync = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

const mockLinkingOpenURL = jest.fn();
jest.mock('expo-linking', () => ({
  openURL: (...args: unknown[]) => mockLinkingOpenURL(...args),
}));

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = ({ testID }: { testID?: string }) => <Text testID={testID}>icon</Text>;
  return { ExternalLink: icon, X: icon };
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

  it('shows one compact Sources control, not a list, under the answer', () => {
    const { getByText, getByTestId, queryByText } = render(
      <CollapsibleSources sources={MOCK_SOURCES} />,
    );

    expect(getByText('Sources')).toBeTruthy();
    expect(getByTestId('chat.sources')).toHaveStyle({ alignSelf: 'flex-start' });
    expect(queryByText('View 3 sources')).toBeNull();
    expect(queryByText('docs.example.com')).toBeNull();
    expect(queryByText('Getting Started Guide')).toBeNull();
  });

  it('marks the control with the first letter of up to three sites and loads no site icon', () => {
    const many = [...MOCK_SOURCES, { url: 'https://zeta.example.net/x', title: 'Fourth' }];
    const { getByTestId, UNSAFE_queryAllByType } = render(<CollapsibleSources sources={many} />);

    const marks = within(getByTestId('chat.sources')).getAllByText(/^[A-Z?]$/);
    expect(marks.map((mark) => mark.props.children)).toEqual(['D', 'B', 'W']);
    expect(UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });

  it('names the number of sources for assistive technology', () => {
    const one = render(<CollapsibleSources sources={[MOCK_SOURCES[0]!]} />);
    expect(one.getByLabelText('View 1 source')).toBeTruthy();
    const three = render(<CollapsibleSources sources={MOCK_SOURCES} />);
    expect(three.getByLabelText('View 3 sources')).toBeTruthy();
  });

  it('opens the list in a sheet that closes by its Close control or a swipe', () => {
    const { getByLabelText, getByText, queryByText, UNSAFE_getByType } = render(
      <CollapsibleSources sources={MOCK_SOURCES} />,
    );

    fireEvent.press(getByLabelText('View 3 sources'));

    const sheet = UNSAFE_getByType(Modal);
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.presentationStyle).toBe('pageSheet');
    expect(sheet.props.allowSwipeDismissal).toBe(true);
    expect(getByText('docs.example.com')).toBeTruthy();

    fireEvent.press(getByLabelText('Close'));
    expect(queryByText('docs.example.com')).toBeNull();

    fireEvent.press(getByLabelText('View 3 sources'));
    act(() => UNSAFE_getByType(Modal).props.onRequestClose());
    expect(queryByText('docs.example.com')).toBeNull();
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

  it('source with an empty title uses domain in accessibility label', () => {
    const sourcesNoTitle = [{ url: 'https://example.com/page', title: '' }];
    const { getByLabelText } = render(<CollapsibleSources sources={sourcesNoTitle} />);

    fireEvent.press(getByLabelText('View 1 source'));

    expect(getByLabelText('Source 1: example.com')).toBeTruthy();
  });
});
