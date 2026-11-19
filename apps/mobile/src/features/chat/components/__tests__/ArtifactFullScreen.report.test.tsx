import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import {
  actionMenuLabels,
  actionMenuTitle,
  cancelActionMenu,
  chooseActionMenuItem,
  isActionMenuOpen,
} from '@/test-utils/actionMenu';

const mockReportSheet = jest.fn();

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

jest.mock('../ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheet(props);
    return null;
  },
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('@/src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => null,
}));

import { ArtifactFullScreen } from '../ArtifactFullScreen';
import type { Artifact } from '@/types/chat';

function pressReportInMoreMenu(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByLabelText('More artifact actions'));
  expect(actionMenuLabels()).toContain('Report this artifact');
  chooseActionMenuItem('Report this artifact');
}

const artifact: Artifact = {
  id: 'artifact-report-1',
  type: 'code',
  title: 'sort.ts',
  content: 'export const sortAll = (values: number[]) => [...values].sort();',
  language: 'typescript',
};

describe('reporting an artifact opened from a chat', () => {
  beforeEach(() => mockReportSheet.mockClear());

  it('keeps Report in the More menu rather than as a visible flag', () => {
    const screen = render(<ArtifactFullScreen artifact={artifact} visible onClose={jest.fn()} />);

    expect(screen.queryByLabelText('Report this artifact')).toBeNull();
    expect(screen.getByLabelText('More artifact actions')).toBeTruthy();
  });

  it('opens the report sheet for the message and conversation that made it', () => {
    const screen = render(
      <ArtifactFullScreen
        artifact={artifact}
        visible
        onClose={jest.fn()}
        messageId="msg-42"
        conversationId="conv-42"
      />,
    );
    expect(mockReportSheet).not.toHaveBeenCalled();

    pressReportInMoreMenu(screen);

    expect(mockReportSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        title: 'Report this artifact',
        target: {
          messageId: 'msg-42',
          conversationId: 'conv-42',
          contentExcerpt: `sort.ts\n\n${artifact.content}`,
          subject: { kind: 'artifact', id: 'artifact-report-1' },
        },
      }),
    );
  });

  it('names the artifact itself when it was opened without a message', () => {
    const screen = render(<ArtifactFullScreen artifact={artifact} visible onClose={jest.fn()} />);

    pressReportInMoreMenu(screen);

    expect(mockReportSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          messageId: 'artifact:artifact-report-1',
          conversationId: 'artifact:artifact-report-1',
        }),
      }),
    );
  });

  it('closes the report sheet without leaving the artifact', () => {
    const onClose = jest.fn();
    const screen = render(<ArtifactFullScreen artifact={artifact} visible onClose={onClose} />);

    pressReportInMoreMenu(screen);
    const sheet = mockReportSheet.mock.calls[mockReportSheet.mock.calls.length - 1]?.[0] as {
      onClose: () => void;
    };
    mockReportSheet.mockClear();
    act(() => sheet.onClose());

    expect(mockReportSheet).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the artifact More menu on Android', () => {
  let alert: jest.SpyInstance;
  let platform: jest.ReplaceProperty<typeof Platform.OS>;

  beforeEach(() => {
    jest.useFakeTimers();
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    mockReportSheet.mockClear();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alert.mockRestore();
    platform.restore();
    jest.useRealTimers();
  });

  function openMore(onRegenerate = jest.fn(), onClose = jest.fn()) {
    const screen = render(
      <ArtifactFullScreen
        artifact={artifact}
        visible
        onClose={onClose}
        onRegenerate={onRegenerate}
        messageId="msg-42"
        conversationId="conv-42"
      />,
    );
    fireEvent.press(screen.getByLabelText('More artifact actions'));
    return { screen, onRegenerate, onClose };
  }

  it('lists every action in the app sheet instead of a three-button alert', () => {
    openMore();

    expect(alert).not.toHaveBeenCalled();
    expect(actionMenuTitle()).toBe('sort.ts');
    expect(actionMenuLabels().slice(-2)).toEqual(['Regenerate', 'Report this artifact']);
    expect(actionMenuLabels().length).toBeGreaterThan(2);
  });

  it('reports the artifact from the sheet', () => {
    openMore();
    chooseActionMenuItem('Report this artifact');

    expect(mockReportSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        target: expect.objectContaining({ messageId: 'msg-42', conversationId: 'conv-42' }),
      }),
    );
  });

  it('regenerates and closes the artifact from the sheet', () => {
    const { onRegenerate, onClose } = openMore();
    chooseActionMenuItem('Regenerate');

    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Cancel without running an action', () => {
    const { onRegenerate, onClose } = openMore();
    cancelActionMenu();

    expect(isActionMenuOpen()).toBe(false);
    expect(onRegenerate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockReportSheet).not.toHaveBeenCalled();
  });
});
