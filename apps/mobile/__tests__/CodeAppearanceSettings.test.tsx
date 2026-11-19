/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import type { CloudCodeChanges } from '@agiworkforce/cloud-contracts';

const mockAccess = { ready: true };

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
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

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { companion: false } }));

jest.mock('@/src/features/cloud-code/useCloudCodeAccess', () => ({
  useCloudCodeAccess: () => ({
    ready: mockAccess.ready,
    signedIn: true,
    accountKey: 'user_test',
    activate: jest.fn(),
  }),
}));

jest.mock('@/src/features/cloud-code/useCloudCodeSessions', () => ({
  useCloudCodeSessions: () => ({
    status: 'ready',
    availability: null,
    sessions: [],
    runtimes: [],
    error: null,
    refreshing: false,
    load: jest.fn(),
  }),
}));

jest.mock('@/src/features/cloud-code/githubInstall', () => ({
  fetchGitHubInstallations: jest.fn().mockResolvedValue([]),
  disconnectGitHubInstallation: jest.fn(),
  startGitHubInstallInApp: jest.fn(),
}));

jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn().mockResolvedValue(true) }));
jest.mock('@/src/lib/Capabilities', () => ({ useCapability: () => true }));

import CodeSettingsScreen from '@/src/features/settings/code';
import { useCodePreferences } from '@/src/features/settings/code/store';
import { CloudCodeChangesSheet } from '@/src/features/cloud-code/components/CloudCodeChangesSheet';
import { CodeSessionChangesSheet } from '@/src/features/companion/components/CodeSessionChangesSheet';
import {
  diffLineAccessibilityLabel,
  diffLineText,
} from '@/src/features/settings/code/codeAppearance';
import type { RemoteCodeThread } from '@/src/features/companion/remote-code/store';

type PlatformSpec = Record<string, unknown>;

function onPlatform(os: 'ios' | 'android') {
  jest
    .spyOn(Platform, 'select')
    .mockImplementation(((spec: PlatformSpec) =>
      os in spec ? spec[os] : spec.default) as typeof Platform.select);
}

function familyOf(node: { props: { style?: unknown } }): unknown {
  return StyleSheet.flatten(node.props.style as never)?.fontFamily;
}

beforeEach(() => {
  mockAccess.ready = true;
  useCodePreferences.setState({
    codeFont: 'default',
    transcriptFont: 'system',
    showDiffSigns: true,
    wrapLongLines: false,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AGI Code settings appearance group', () => {
  it('starts with Appearance above everything else and shows the current faces', () => {
    onPlatform('ios');
    const screen = render(<CodeSettingsScreen />);

    const headings = screen
      .getAllByRole('header')
      .map((node) => node.props.children)
      .filter((child): child is string => typeof child === 'string');
    expect(headings.indexOf('Appearance')).toBeLessThan(headings.indexOf('Connections'));
    expect(screen.getByText('Code font')).toBeTruthy();
    expect(screen.getByText('Transcript font')).toBeTruthy();
    expect(screen.getByLabelText('Code font. Menlo')).toBeTruthy();
    expect(screen.getByLabelText('Transcript font. System')).toBeTruthy();
  });

  it('lists the iOS code fonts, each in its own face, and saves the choice', () => {
    onPlatform('ios');
    const screen = render(<CodeSettingsScreen />);

    expect(screen.queryByTestId('code-font-courier')).toBeNull();
    fireEvent.press(screen.getByTestId('code-font'));

    expect(screen.getByTestId('code-font').props.accessibilityState).toEqual(
      expect.objectContaining({ expanded: true }),
    );
    expect(familyOf(screen.getByText('Courier New'))).toBe('Courier New');
    expect(familyOf(screen.getByText('System mono'))).toBe('ui-monospace');
    expect(screen.getByTestId('code-font-default').props.accessibilityState).toEqual({
      checked: true,
    });

    fireEvent.press(screen.getByTestId('code-font-courier'));

    expect(useCodePreferences.getState().codeFont).toBe('courier');
    expect(screen.queryByTestId('code-font-courier')).toBeNull();
    expect(screen.getByLabelText('Code font. Courier New')).toBeTruthy();
  });

  it('lists the Android code fonts', () => {
    onPlatform('android');
    const screen = render(<CodeSettingsScreen />);

    fireEvent.press(screen.getByTestId('code-font'));

    expect(screen.getByTestId('code-font-default')).toBeTruthy();
    expect(familyOf(screen.getByText('Serif monospace'))).toBe('serif-monospace');
    expect(screen.queryByTestId('code-font-courier')).toBeNull();

    fireEvent.press(screen.getByTestId('code-font-serif-monospace'));
    expect(useCodePreferences.getState().codeFont).toBe('serif-monospace');
  });

  it('lists the transcript fonts, each in its own face, and saves the choice', () => {
    onPlatform('ios');
    const screen = render(<CodeSettingsScreen />);

    fireEvent.press(screen.getByTestId('code-transcript-font'));

    expect(familyOf(screen.getByText('Serif'))).toBe('Georgia');
    expect(familyOf(screen.getByText('Mono'))).toBe('Menlo');
    screen.getAllByText('System').forEach((node) => expect(familyOf(node)).toBeUndefined());

    fireEvent.press(screen.getByTestId('code-transcript-font-serif'));

    expect(useCodePreferences.getState().transcriptFont).toBe('serif');
    expect(screen.getByLabelText('Transcript font. Serif')).toBeTruthy();
  });

  it('keeps the code font and the diff signs switch where there are no cloud sessions, and hides only the transcript font', () => {
    mockAccess.ready = false;
    onPlatform('ios');
    const screen = render(<CodeSettingsScreen />);

    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByText('Code font')).toBeTruthy();
    expect(screen.queryByText('Transcript font')).toBeNull();
    expect(screen.queryByTestId('code-transcript-font')).toBeNull();
    expect(screen.queryByText('Connections')).toBeNull();
    expect(screen.getByText('Show + and - signs in diffs')).toBeTruthy();
    expect(screen.getByTestId('code-wrap-long-lines')).toBeTruthy();

    fireEvent.press(screen.getByTestId('code-font'));
    fireEvent.press(screen.getByTestId('code-font-courier'));
    expect(useCodePreferences.getState().codeFont).toBe('courier');
    fireEvent(screen.getByTestId('code-show-diff-signs'), 'valueChange', false);
    expect(useCodePreferences.getState().showDiffSigns).toBe(false);
  });

  it('puts the diff signs switch under Wrap long lines, on by default', () => {
    const screen = render(<CodeSettingsScreen />);

    expect(screen.getByText('Show + and - signs in diffs')).toBeTruthy();
    expect(
      screen.getByText('Mark added and removed lines with + and -, as well as color.'),
    ).toBeTruthy();
    expect(screen.getByTestId('code-show-diff-signs').props.value).toBe(true);

    fireEvent(screen.getByTestId('code-show-diff-signs'), 'valueChange', false);

    expect(useCodePreferences.getState().showDiffSigns).toBe(false);
    expect(useCodePreferences.getState().wrapLongLines).toBe(false);
  });
});

describe('persisted code appearance', () => {
  const merge = (
    useCodePreferences.persist.getOptions() as unknown as {
      merge: (persisted: unknown, current: unknown) => Record<string, unknown>;
    }
  ).merge;
  const current = useCodePreferences.getState();

  it('restores saved choices', () => {
    expect(
      merge({ codeFont: 'courier', transcriptFont: 'serif', showDiffSigns: false }, current),
    ).toEqual(
      expect.objectContaining({
        codeFont: 'courier',
        transcriptFont: 'serif',
        showDiffSigns: false,
      }),
    );
  });

  it('ignores a saved value that is not a known choice', () => {
    expect(
      merge({ codeFont: 'comic', transcriptFont: 'rounded', showDiffSigns: 'no' }, current),
    ).toEqual(
      expect.objectContaining({
        codeFont: 'default',
        transcriptFont: 'system',
        showDiffSigns: true,
      }),
    );
  });
});

describe('diff line display', () => {
  it('replaces the sign of added and removed lines with a space and leaves the rest', () => {
    expect(diffLineText('+const a = 1;', 'added', true)).toBe('+const a = 1;');
    expect(diffLineText('+const a = 1;', 'added', false)).toBe(' const a = 1;');
    expect(diffLineText('-const a = 0;', 'removed', false)).toBe(' const a = 0;');
    expect(diffLineText('@@ -1 +1 @@', 'meta', false)).toBe('@@ -1 +1 @@');
    expect(diffLineText('+++ b/a.ts', 'meta', false)).toBe('+++ b/a.ts');
    expect(diffLineText(' context', 'context', false)).toBe(' context');
    expect(diffLineText('', 'context', false)).toBe(' ');
    expect(diffLineText('+', 'added', false)).toBe(' ');
  });

  it('labels added and removed lines whether or not the sign shows', () => {
    expect(diffLineAccessibilityLabel('+const a = 1;', 'added')).toBe('Added, const a = 1;');
    expect(diffLineAccessibilityLabel('-const a = 0;', 'removed')).toBe('Removed, const a = 0;');
    expect(diffLineAccessibilityLabel('+', 'added')).toBe('Added, blank line');
    expect(diffLineAccessibilityLabel('@@ -1 +1 @@', 'meta')).toBeUndefined();
    expect(diffLineAccessibilityLabel(' context', 'context')).toBeUndefined();
  });
});

describe('diff in the cloud session Changes sheet', () => {
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
    '+new',
    ' same',
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

  it('shows the signs by default', () => {
    const screen = openDiff();

    expect(screen.getByText('-old')).toBeTruthy();
    expect(screen.getByText('+new')).toBeTruthy();
    expect(screen.getByLabelText('Added, new')).toBeTruthy();
    expect(screen.getByLabelText('Removed, old')).toBeTruthy();
  });

  it('draws added and removed lines without their sign when it is off, keeping colour and labels', () => {
    useCodePreferences.setState({ showDiffSigns: false });
    const screen = openDiff();

    expect(screen.queryByText('-old')).toBeNull();
    expect(screen.queryByText('+new')).toBeNull();
    const added = screen.getByText(' new');
    const removed = screen.getByText(' old');
    expect(StyleSheet.flatten(added.props.style).color).not.toBe(
      StyleSheet.flatten(removed.props.style).color,
    );
    expect(screen.getByLabelText('Added, new')).toBeTruthy();
    expect(screen.getByLabelText('Removed, old')).toBeTruthy();
    expect(screen.getByText('@@ -1 +1 @@')).toBeTruthy();
    expect(screen.getByText('+++ b/src/a.ts')).toBeTruthy();
    expect(screen.getByText('--- a/src/a.ts')).toBeTruthy();
    expect(screen.getByText(' same')).toBeTruthy();
  });
});

describe('diff in the remote session Changes sheet', () => {
  const thread = {
    fileChanges: [],
    testRuns: [],
    diffs: [{ path: 'src/retry.ts', patch: '@@ -1 +1 @@\n-3\n+5\n same', truncated: false }],
  } as unknown as RemoteCodeThread;

  it('shows the signs by default', () => {
    const screen = render(<CodeSessionChangesSheet visible thread={thread} onClose={jest.fn()} />);

    expect(screen.getByText('-3')).toBeTruthy();
    expect(screen.getByText('+5')).toBeTruthy();
  });

  it('draws added and removed lines without their sign when it is off, keeping the labels', () => {
    useCodePreferences.setState({ showDiffSigns: false });
    const screen = render(<CodeSessionChangesSheet visible thread={thread} onClose={jest.fn()} />);

    expect(screen.queryByText('-3')).toBeNull();
    expect(screen.queryByText('+5')).toBeNull();
    expect(screen.getByText(' 3')).toBeTruthy();
    expect(screen.getByText(' 5')).toBeTruthy();
    expect(screen.getByLabelText('Added, 5')).toBeTruthy();
    expect(screen.getByLabelText('Removed, 3')).toBeTruthy();
    expect(screen.getByText('@@ -1 +1 @@')).toBeTruthy();
  });
});
