/* eslint-disable @typescript-eslint/no-require-imports */
import React, { type ReactElement } from 'react';
import { Modal, Platform, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import type { CloudCodeChanges } from '@agiworkforce/cloud-contracts';

jest.mock('@/src/features/chat/components/WorkModeSwitch', () => ({ HEADER_TEXT_SCALE_LIMIT: 2 }));
jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

jest.mock('@/src/lib/Capabilities', () => ({ useCapability: () => true }));

jest.mock('@/src/features/voice/components/VoiceInputButton', () => ({
  VoiceInputButton: () => null,
}));

jest.mock('@/src/features/model-picker/service', () => ({
  getManagedDisplayName: () => 'Fixture model',
  getSelectableModelById: () => undefined,
}));

jest.mock('@/lib/models', () => ({ getModelById: () => undefined, MODEL_LIST: [] }));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (select: (state: { clerkUserId: string | null }) => unknown) =>
    select({ clerkUserId: null }),
}));

jest.mock('@/src/features/settings/cloud-usage/store', () => ({
  useCloudUsageStore: (select: (state: Record<string, unknown>) => unknown) =>
    select({ ownerId: null, snapshot: null, loading: false, refresh: jest.fn() }),
}));

jest.mock('@/src/features/cloud-code/service', () => ({
  cloudCodeApi: {
    listRepositories: jest.fn().mockResolvedValue({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
    }),
    listBranches: jest.fn().mockResolvedValue({ branches: [], truncated: false }),
    create: jest.fn(),
  },
  newCloudCodeIdempotencyKey: () => 'request-1',
  describeCloudCodeError: (_error: unknown, fallback: string) => fallback,
}));

jest.mock('@/src/features/cloud-code/githubInstall', () => ({
  startGitHubInstallInApp: jest.fn(),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
}));

jest.mock('@/src/features/companion/remote-code/service', () => ({
  listCodeSessions: jest.fn(),
  startCodeSession: jest.fn(),
}));

jest.mock('@/services/fileCreation', () => ({
  downloadGeneratedFile: jest.fn().mockResolvedValue('file:///exports/notes.md'),
  viewerFileCopy: jest.fn().mockResolvedValue('file:///exports/notes.md'),
  shareFile: jest.fn(),
  exportSourceFile: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue('# Plan'),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'user-1', epoch: 1 }),
}));

jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { lightColors } from '@/src/ui/theme/tokens';
import { ResponseRatingDetails } from '@/src/features/chat/components/ResponseRatingDetails';
import { ToolCallDetailsSheet } from '@/src/features/chat/components/ToolCallTimeline';
import { ContextDetailsSheet } from '@/src/features/chat/components/ContextDetailsSheet';
import { ArtifactVersionHistorySheet } from '@/src/features/chat/components/ArtifactVersionHistorySheet';
import { TimezonePickerField } from '@/src/features/schedules/components/TimezonePickerField';
import { CloudCodeChangesSheet } from '@/src/features/cloud-code/components/CloudCodeChangesSheet';
import { CloudCodeTaskOptionsSheet } from '@/src/features/cloud-code/components/CloudCodeTaskOptionsSheet';
import { NewCloudCodeSessionSheet } from '@/src/features/cloud-code/components/NewCloudCodeSessionSheet';
import { CodeSessionChangesSheet } from '@/src/features/companion/components/CodeSessionChangesSheet';
import { TableFullScreen } from '@/src/features/chat/components/TableFullScreen';
import { FileViewerScreen } from '@/src/features/chat/components/artifact-viewers/FileViewerScreen';
import { ProjectEditorModal } from '@/src/features/projects/components/ProjectEditorModal';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 37, left: 0, right: 0, bottom: 53 },
};

const originalOS = Platform.OS;

function setPlatform(os: 'ios' | 'android'): void {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
});

interface SheetCase {
  name: string;
  closes: (onClose: jest.Mock) => ReactElement;
  open?: (screen: ReturnType<typeof render>) => void;
  iosKeepsBottomPadding?: boolean;
}

const session = {
  id: 's1',
  state: 'ready',
  archivedAt: null,
  repositoryUrl: 'https://github.com/acme/app',
  workingBranch: 'agi/work',
  baseBranch: 'main',
  repositoryBranch: 'main',
  pullRequestUrl: null,
  contextInputTokens: 0,
  contextOutputTokens: 0,
} as unknown as CloudCodeChanges['session'];

const changesView = {
  changes: {
    session,
    base: 'main',
    workingBranch: 'agi/work',
    files: [],
    diff: '',
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

const thread = {
  rootId: 'root',
  threadId: 'thread',
  title: 'Fix the build',
  fileChanges: [],
  diffs: [],
  testRuns: [],
} as never;

function editor(onClose: jest.Mock) {
  return {
    visible: true,
    editingProject: null,
    isCloud: false,
    formName: '',
    setFormName: jest.fn(),
    formDescription: '',
    setFormDescription: jest.fn(),
    formInstructions: '',
    setFormInstructions: jest.fn(),
    selectedTemplateId: '',
    setSelectedTemplateId: jest.fn(),
    requestClose: onClose,
    save: jest.fn(),
  } as never;
}

const CASES: SheetCase[] = [
  {
    name: 'ResponseRatingDetails',
    closes: (onClose) => <ResponseRatingDetails visible onSubmit={jest.fn()} onClose={onClose} />,
  },
  {
    name: 'ToolCallDetailsSheet',
    closes: (onClose) => (
      <ToolCallDetailsSheet
        tool={{ id: 'tool-1', name: 'web_search', status: 'succeeded' } as never}
        onClose={onClose}
      />
    ),
  },
  {
    name: 'ContextDetailsSheet',
    closes: (onClose) => (
      <ContextDetailsSheet visible modelId="fixture-model" messages={[]} onClose={onClose} />
    ),
  },
  {
    name: 'ArtifactVersionHistorySheet',
    closes: (onClose) => (
      <ArtifactVersionHistorySheet
        visible
        versions={[{ content: 'one' }, { content: 'one\ntwo' }]}
        shownIndex={1}
        onOpen={jest.fn()}
        onRestore={jest.fn()}
        onClose={onClose}
      />
    ),
  },
  {
    name: 'TimezonePickerField',
    closes: () => <TimezonePickerField value="UTC" deviceTimezone="UTC" onChange={jest.fn()} />,
    open: (screen) => fireEvent.press(screen.getByLabelText('Time zone: UTC')),
  },
  {
    name: 'CloudCodeChangesSheet',
    closes: (onClose) => (
      <CloudCodeChangesSheet
        visible
        session={session}
        entries={[]}
        view={changesView as never}
        onClose={onClose}
      />
    ),
  },
  {
    name: 'CloudCodeTaskOptionsSheet',
    closes: (onClose) => (
      <CloudCodeTaskOptionsSheet
        visible
        session={session}
        model="fixture-model"
        turnControls
        mode="agent"
        onModeChange={jest.fn()}
        onClose={onClose}
      />
    ),
  },
  {
    name: 'NewCloudCodeSessionSheet',
    closes: (onClose) => (
      <NewCloudCodeSessionSheet visible onClose={onClose} onCreated={jest.fn()} />
    ),
  },
  {
    name: 'CodeSessionChangesSheet',
    closes: (onClose) => <CodeSessionChangesSheet visible thread={thread} onClose={onClose} />,
  },
  {
    name: 'TableFullScreen',
    iosKeepsBottomPadding: true,
    closes: (onClose) => (
      <TableFullScreen visible onClose={onClose} actions={null} colors={lightColors as never}>
        <Text>cell</Text>
      </TableFullScreen>
    ),
  },
  {
    name: 'FileViewerScreen',
    iosKeepsBottomPadding: true,
    closes: (onClose) => (
      <FileViewerScreen
        source={{
          title: 'notes.md',
          fileName: 'notes.md',
          mimeType: 'text/markdown',
          url: 'https://files.example.test/api/files/f1',
          byteCount: 2048,
        }}
        onClose={onClose}
      />
    ),
  },
  {
    name: 'ProjectEditorModal',
    iosKeepsBottomPadding: true,
    closes: (onClose) => <ProjectEditorModal editor={editor(onClose)} />,
  },
];

function hostStyles(root: ReactTestInstance): Record<string, unknown>[] {
  return root
    .findAll((node) => typeof node.type === 'string')
    .map((node) => (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>);
}

function renderSheet(testCase: SheetCase, onClose: jest.Mock) {
  const screen = render(
    <SafeAreaProvider initialMetrics={METRICS}>{testCase.closes(onClose)}</SafeAreaProvider>,
  );
  testCase.open?.(screen);
  return screen;
}

it('keeps mobile Code task mode and usage without a step-count picker', () => {
  const sheet = CASES.find((testCase) => testCase.name === 'CloudCodeTaskOptionsSheet')!;
  const screen = renderSheet(sheet, jest.fn());
  expect(screen.getByRole('radio', { name: /Agent/ })).toBeTruthy();
  expect(screen.getByRole('radio', { name: /Plan/ })).toBeTruthy();
  expect(screen.getByText('Usage')).toBeTruthy();
  expect(screen.queryByText('Steps per task')).toBeNull();
});

describe.each(CASES)('$name page sheet', (testCase) => {
  it('pads its content by the dialog window insets on Android, where the sheet fills the window', () => {
    setPlatform('android');
    const screen = renderSheet(testCase, jest.fn());
    const styles = hostStyles(screen.UNSAFE_getByType(Modal));

    expect(
      styles.filter(
        (style) =>
          style.paddingTop === METRICS.insets.top && style.paddingBottom === METRICS.insets.bottom,
      ),
    ).toHaveLength(1);
    expect(styles.filter((style) => style.paddingBottom === METRICS.insets.bottom)).toHaveLength(1);
    expect(styles.filter((style) => style.paddingTop === METRICS.insets.top)).toHaveLength(1);
  });

  it('leaves the iOS page sheet as UIKit lays it out', () => {
    setPlatform('ios');
    const screen = renderSheet(testCase, jest.fn());
    const styles = hostStyles(screen.UNSAFE_getByType(Modal));

    expect(styles.filter((style) => style.paddingTop === METRICS.insets.top)).toHaveLength(0);
    expect(styles.filter((style) => style.paddingBottom === METRICS.insets.bottom)).toHaveLength(
      testCase.iosKeepsBottomPadding ? 1 : 0,
    );
  });

  it('closes on the hardware Back button', () => {
    const onClose = jest.fn();
    const screen = renderSheet(testCase, onClose);
    const sheet = screen.UNSAFE_getByType(Modal);

    expect(typeof sheet.props.onRequestClose).toBe('function');
    act(() => sheet.props.onRequestClose());

    if (testCase.name === 'TimezonePickerField') {
      expect(screen.queryByLabelText('Close time zones')).toBeNull();
    } else {
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });
});

describe('ProjectEditorModal footer spacing', () => {
  const FOOTER_MINIMUM = 16;

  function gapUnderSubmit(os: 'ios' | 'android', bottomInset: number): number {
    setPlatform(os);
    const metrics: Metrics = {
      frame: METRICS.frame,
      insets: { ...METRICS.insets, bottom: bottomInset },
    };
    const screen = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ProjectEditorModal editor={editor(jest.fn())} />
      </SafeAreaProvider>,
    );
    const styles = hostStyles(screen.UNSAFE_getByType(Modal));
    const footer = styles.find((style) => style.borderTopWidth === 1);
    const wrapper = styles.find(
      (style) => style.flex === 1 && style.paddingTop === METRICS.insets.top,
    );
    return (
      Number(footer?.paddingBottom ?? 0) +
      (os === 'android' ? Number(wrapper?.paddingBottom ?? 0) : 0)
    );
  }

  it.each([0, 8, 16, 24, 53])(
    'keeps the larger of the window inset and 16 under the button on Android (inset %i)',
    (inset) => {
      expect(gapUnderSubmit('android', inset)).toBe(Math.max(inset, FOOTER_MINIMUM));
    },
  );

  it.each([0, 8, 34])(
    'keeps the larger of the safe area and 16 under the button on iOS (inset %i)',
    (inset) => {
      expect(gapUnderSubmit('ios', inset)).toBe(Math.max(inset, FOOTER_MINIMUM));
    },
  );
});
