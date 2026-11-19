/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import type { CloudCodeChanges } from '@agiworkforce/cloud-contracts';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn().mockResolvedValue(true) }));
jest.mock('@/src/lib/Capabilities', () => ({ useCapability: () => true }));
jest.mock('../src/features/chat/components/MathBlock', () => ({ MathBlock: () => null }));
jest.mock('../src/features/chat/components/CodeBlockCopyButton', () => ({
  CodeBlockCopyButton: () => null,
}));

import { useCodePreferences } from '../src/features/settings/code/store';
import { CodeLinesScroller } from '../src/features/settings/code/CodeLinesScroller';
import CodeSettingsScreen from '../src/features/settings/code';
import { searchMobileDestinations } from '../src/features/search';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { renderMarkdownContent } from '../src/features/chat/components/MessageContentRenderer';
import { CloudCodeChangesSheet } from '../src/features/cloud-code/components/CloudCodeChangesSheet';

function ancestorWithProp(node: ReactTestInstance, prop: string): unknown {
  let current: ReactTestInstance | null = node;
  while (current) {
    const value = (current.props as Record<string, unknown> | undefined)?.[prop];
    if (value !== undefined) return value;
    current = current.parent;
  }
  return undefined;
}

const LONG_LINE = 'const veryLongName = computeSomethingThatIsFarWiderThanAPhoneScreen(argument);';

beforeEach(() => {
  useCodePreferences.setState({ wrapLongLines: false });
  useChatAppModeStore.setState({ appMode: 'local' });
  mockPush.mockClear();
});

describe('wrap long lines preference', () => {
  it('is off until the reader turns it on', () => {
    expect(useCodePreferences.getState().wrapLongLines).toBe(false);
  });

  it('keeps only a stored boolean when it loads', async () => {
    const options = useCodePreferences.persist.getOptions();
    const merge = options.merge as (
      persisted: unknown,
      current: object,
    ) => { wrapLongLines: boolean };
    const current = { wrapLongLines: false };

    expect(merge({ wrapLongLines: true }, current).wrapLongLines).toBe(true);
    expect(merge({ wrapLongLines: 'yes' }, current).wrapLongLines).toBe(false);
    expect(merge(undefined, current).wrapLongLines).toBe(false);
  });
});

describe('code settings page', () => {
  it('shows the Wrap long lines switch off by default and turns it on and off', () => {
    const screen = render(<CodeSettingsScreen />);
    const toggle = screen.getByTestId('code-wrap-long-lines');
    expect(toggle.props.value).toBe(false);

    fireEvent(toggle, 'valueChange', true);
    expect(useCodePreferences.getState().wrapLongLines).toBe(true);
    expect(screen.getByTestId('code-wrap-long-lines').props.value).toBe(true);

    fireEvent(screen.getByTestId('code-wrap-long-lines'), 'valueChange', false);
    expect(useCodePreferences.getState().wrapLongLines).toBe(false);
  });

  it('reflects a preference that is already on', () => {
    useCodePreferences.setState({ wrapLongLines: true });
    const screen = render(<CodeSettingsScreen />);

    expect(screen.getByTestId('code-wrap-long-lines').props.value).toBe(true);
  });

  it('links to the Remote control settings page in Cloud', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const screen = render(<CodeSettingsScreen />);

    fireEvent.press(screen.getByLabelText('Remote control'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/remote-control');
  });

  it('offers no Remote control link in Local', () => {
    const screen = render(<CodeSettingsScreen />);

    expect(screen.queryByLabelText('Remote control')).toBeNull();
    expect(screen.getByTestId('code-wrap-long-lines')).toBeTruthy();
  });

  it('is titled with the product name', () => {
    const screen = render(<CodeSettingsScreen />);

    expect(screen.getAllByText('AGI Code').length).toBeGreaterThan(0);
  });
});

describe('finding the code settings', () => {
  it.each(['wrap long lines', 'diff', 'AGI Code settings'])(
    'search for %s finds the page',
    (query) => {
      for (const mode of ['local', 'cloud'] as const) {
        expect(searchMobileDestinations(query, mode).map((result) => result.targetId)).toContain(
          '/(app)/settings/code',
        );
      }
    },
  );
});

describe('code lines scroller', () => {
  it('scrolls sideways by default', () => {
    const screen = render(
      <CodeLinesScroller testID="lines">
        <Text>{LONG_LINE}</Text>
      </CodeLinesScroller>,
    );

    expect(screen.getByTestId('lines').props.horizontal).toBe(true);
  });

  it('wraps once the preference is on, and follows a change while mounted', () => {
    const screen = render(
      <CodeLinesScroller testID="lines">
        <Text>{LONG_LINE}</Text>
      </CodeLinesScroller>,
    );

    act(() => useCodePreferences.setState({ wrapLongLines: true }));

    expect(screen.getByTestId('lines').props.horizontal).toBeUndefined();
    expect(screen.getByText(LONG_LINE)).toBeTruthy();
  });

  it('wraps when asked to whatever the preference says', () => {
    const screen = render(
      <CodeLinesScroller testID="lines" alwaysWrap>
        <Text>{LONG_LINE}</Text>
      </CodeLinesScroller>,
    );

    expect(screen.getByTestId('lines').props.horizontal).toBeUndefined();
  });
});

describe('code blocks in chat replies', () => {
  const content = ['```typescript', LONG_LINE, '```'].join('\n');

  function scrollsSideways(highlightCode = false) {
    const screen = render(<>{renderMarkdownContent(content, undefined, { highlightCode })}</>);
    return ancestorWithProp(screen.getByText(LONG_LINE), 'horizontal') === true;
  }

  it('scroll sideways by default', () => {
    expect(scrollsSideways()).toBe(true);
  });

  it('wrap when the preference is on', () => {
    useCodePreferences.setState({ wrapLongLines: true });

    expect(scrollsSideways()).toBe(false);
  });

  it('keep wrapping plain text whatever the preference says', () => {
    const plain = render(<>{renderMarkdownContent(['```text', LONG_LINE, '```'].join('\n'))}</>);

    expect(ancestorWithProp(plain.getByText(LONG_LINE), 'horizontal')).toBeUndefined();
  });
});

describe('diff in the coding session Changes view', () => {
  const session = {
    id: 's1',
    state: 'ready',
    archivedAt: null,
    repositoryUrl: 'https://github.com/acme/app',
    workingBranch: 'agi/work',
    baseBranch: 'main',
    repositoryBranch: 'main',
    pullRequestUrl: null,
  } as unknown as CloudCodeChanges['session'];

  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1 +1 @@',
    '-old',
    `+${LONG_LINE}`,
  ].join('\n');

  const view = {
    changes: {
      session,
      base: 'main',
      workingBranch: 'agi/work',
      files: [{ path: 'src/a.ts', state: 'modified' }],
      diff,
      diffTruncated: false,
    },
    loading: false,
    busy: null,
    error: null,
    notice: null,
    refresh: jest.fn(),
    commit: jest.fn(),
    discard: jest.fn(),
    createPullRequest: jest.fn(),
    runCommand: jest.fn(),
    loadPullRequestStatus: jest.fn().mockResolvedValue({}),
    dismissError: jest.fn(),
  };

  function openDiff() {
    const screen = render(
      <CloudCodeChangesSheet
        visible
        session={session}
        entries={[]}
        view={view as never}
        onClose={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByLabelText('Modified src/a.ts'));
    return screen;
  }

  it('scrolls sideways by default', () => {
    const screen = openDiff();

    expect(screen.getByTestId('cloud-code-diff').props.horizontal).toBe(true);
    expect(screen.getByText(`+${LONG_LINE}`)).toBeTruthy();
  });

  it('wraps when the preference is on', () => {
    useCodePreferences.setState({ wrapLongLines: true });
    const screen = openDiff();

    expect(screen.getByTestId('cloud-code-diff').props.horizontal).toBeUndefined();
    expect(screen.getByText(`+${LONG_LINE}`)).toBeTruthy();
  });
});
