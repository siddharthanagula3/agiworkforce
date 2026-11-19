/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { AgentActivityEntry, AgentActivityState } from '@agiworkforce/client-runtime';

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

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

const mockOpenInApp = jest.fn();
jest.mock('@/lib/safeOpenURL', () => ({
  ...jest.requireActual('@/lib/safeOpenURL'),
  openUntrustedUrlInAppBrowser: (url: string) => mockOpenInApp(url),
}));

const mockDownload = jest.fn();
const mockShare = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  ...jest.requireActual('@/services/fileCreation'),
  downloadGeneratedFile: (...args: unknown[]) => mockDownload(...args),
  shareFile: (...args: unknown[]) => mockShare(...args),
}));

import { API_URL } from '@/lib/constants';
import { AgentActivityTimeline } from '@/src/features/chat/components/AgentActivityTimeline';
import type { Artifact } from '@/types/chat';

function unavailableTool(id: string, summary: string): AgentActivityEntry {
  return {
    kind: 'tool',
    id: `tool:${id}`,
    toolCallId: id,
    name: 'execute_code',
    category: 'code-execution',
    summary,
    status: 'failed',
    unavailable: true,
    startedAtMs: 1_100,
  };
}

function artifact(uri: string): AgentActivityEntry {
  return {
    kind: 'artifact',
    id: 'artifact:a1',
    artifactId: 'a1',
    name: 'report.csv',
    mimeType: 'text/csv',
    uri,
    emittedAtMs: 1_300,
  };
}

function activity(entries: AgentActivityEntry[]): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    turnId: 'turn-1',
    lastSequence: entries.length,
    status: 'completed',
    startedAtMs: 1_000,
    updatedAtMs: 2_000,
    completedAtMs: 2_000,
    entries,
  } as AgentActivityState;
}

describe('AgentActivityTimeline rows', () => {
  beforeEach(() => mockOpenInApp.mockReset());

  it('shows a tool that never ran as one quiet notice per sentence, not a failed step', () => {
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activity([
          unavailableTool('a', 'Running code is not available in this chat'),
          unavailableTool('b', 'Running code is not available in this chat'),
          unavailableTool('c', 'Web search is turned off'),
        ])}
      />,
    );
    const notices = view.getAllByTestId('agent-activity.unavailable');
    expect(notices).toHaveLength(2);
    expect(view.getAllByText('Running code is not available in this chat')).toHaveLength(1);
    expect(view.getByText('Web search is turned off')).toBeTruthy();
    expect(view.queryByLabelText(/Running code is not available in this chat, /)).toBeNull();
  });

  it('opens a created file with a web address in the in-app browser', () => {
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activity([artifact('https://files.example.com/report.csv')])}
      />,
    );
    fireEvent.press(view.getByLabelText('Open report.csv'));
    expect(mockOpenInApp).toHaveBeenCalledWith('https://files.example.com/report.csv');
  });

  describe('a created file the server addressed as a path on AGI Cloud', () => {
    const sameFile: Artifact = {
      id: 'a1',
      type: 'document',
      title: 'report.csv',
      content: '',
    };

    beforeEach(() => {
      mockDownload.mockReset();
      mockShare.mockReset();
      jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('opens the same file card the answer shows when an artifact in the message matches', () => {
      const onOpenArtifact = jest.fn();
      const view = render(
        <AgentActivityTimeline
          messageId="m1"
          defaultExpanded
          activity={activity([artifact('/api/files/a1')])}
          artifacts={[sameFile]}
          onOpenArtifact={onOpenArtifact}
        />,
      );
      expect(view.getByLabelText('Open report.csv').props.accessibilityRole).toBe('link');
      fireEvent.press(view.getByLabelText('Open report.csv'));

      expect(onOpenArtifact).toHaveBeenCalledWith(sameFile);
      expect(mockDownload).not.toHaveBeenCalled();
    });

    it('matches an artifact by the stored file address when its id differs', () => {
      const onOpenArtifact = jest.fn();
      const stored: Artifact = {
        ...sameFile,
        id: 'other',
        generatedFile: {
          uri: `${API_URL}/api/files/a1`,
        } as NonNullable<Artifact['generatedFile']>,
      };
      const view = render(
        <AgentActivityTimeline
          messageId="m1"
          defaultExpanded
          activity={activity([artifact('/api/files/a1')])}
          artifacts={[stored]}
          onOpenArtifact={onOpenArtifact}
        />,
      );
      fireEvent.press(view.getByLabelText('Open report.csv'));

      expect(onOpenArtifact).toHaveBeenCalledWith(stored);
    });

    it('downloads it with the signed-in session and shares it when no artifact matches', async () => {
      mockDownload.mockResolvedValue('file:///cache/report.csv');
      mockShare.mockResolvedValue(undefined);
      const view = render(
        <AgentActivityTimeline
          messageId="m1"
          defaultExpanded
          activity={activity([artifact('/api/files/a1')])}
          artifacts={[]}
          onOpenArtifact={jest.fn()}
        />,
      );
      await act(async () => {
        fireEvent.press(view.getByLabelText('Open report.csv'));
      });

      expect(mockDownload).toHaveBeenCalledWith(`${API_URL}/api/files/a1`, 'report.csv');
      expect(mockShare).toHaveBeenCalledWith('file:///cache/report.csv');
      expect(mockOpenInApp).not.toHaveBeenCalled();
    });

    it('starts one download when it is tapped twice in the same frame', async () => {
      mockDownload.mockResolvedValue('file:///cache/report.csv');
      mockShare.mockResolvedValue(undefined);
      const view = render(
        <AgentActivityTimeline
          messageId="m1"
          defaultExpanded
          activity={activity([artifact('/api/files/a1')])}
          artifacts={[]}
          onOpenArtifact={jest.fn()}
        />,
      );
      const row = view.getByLabelText('Open report.csv');
      await act(async () => {
        fireEvent.press(row);
        fireEvent.press(row);
      });

      expect(mockDownload).toHaveBeenCalledTimes(1);
      expect(mockShare).toHaveBeenCalledTimes(1);

      await act(async () => {
        fireEvent.press(view.getByLabelText('Open report.csv'));
      });
      expect(mockDownload).toHaveBeenCalledTimes(2);
    });

    it('says so when the file cannot be downloaded', async () => {
      mockDownload.mockRejectedValue(new Error('offline'));
      const view = render(
        <AgentActivityTimeline
          messageId="m1"
          defaultExpanded
          activity={activity([artifact('/api/files/a1')])}
        />,
      );
      await act(async () => {
        fireEvent.press(view.getByLabelText('Open report.csv'));
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Download failed',
        'Could not download or share this file. Try again.',
      );
      expect(mockShare).not.toHaveBeenCalled();
    });

    it('stays plain text when the address is neither a path nor a web address', () => {
      const view = render(
        <AgentActivityTimeline
          messageId="m1"
          defaultExpanded
          activity={activity([artifact('//evil.example/report.csv')])}
          artifacts={[]}
          onOpenArtifact={jest.fn()}
        />,
      );

      expect(view.getByText('report.csv')).toBeTruthy();
      expect(view.queryByTestId('agent-activity.artifact-link')).toBeNull();
    });
  });

  it('keeps a created file without a web address as plain text', () => {
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activity([artifact('javascript:alert(1)')])}
      />,
    );
    expect(view.getByText('report.csv')).toBeTruthy();
    expect(view.queryByTestId('agent-activity.artifact-link')).toBeNull();
  });

  it('shows the bubble status label in place of the running summary', () => {
    const running = {
      ...activity([]),
      status: 'running',
      completedAtMs: undefined,
    } as AgentActivityState;
    const view = render(
      <AgentActivityTimeline messageId="m1" activity={running} statusLabel="Reconnecting" />,
    );
    expect(view.getByLabelText('Show agent activity: Reconnecting')).toBeTruthy();
  });

  it('keeps the run summary once the turn is no longer running', () => {
    const view = render(
      <AgentActivityTimeline messageId="m1" activity={activity([])} statusLabel="Stopping" />,
    );
    expect(view.queryByLabelText(/Stopping/)).toBeNull();
  });

  it('offers Retry as a 44 point button when the error is retryable', () => {
    const onRetry = jest.fn();
    const failed = {
      ...activity([
        {
          kind: 'error',
          id: 'error:1',
          message: 'The connection dropped.',
          retryable: true,
          emittedAtMs: 1_500,
        },
      ]),
      status: 'failed',
    } as AgentActivityState;
    const view = render(
      <AgentActivityTimeline messageId="m1" defaultExpanded activity={failed} onRetry={onRetry} />,
    );
    const retry = view.getByTestId('agent-activity.retry');
    expect(retry.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(retry.props.style)).toEqual(
      expect.objectContaining({ minHeight: 44, minWidth: 44 }),
    );
    fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('opens every source from the +N more sources button', () => {
    const sources = Array.from({ length: 8 }, (_, index) => ({
      url: `https://example.com/${index + 1}`,
      title: `Source ${index + 1}`,
    }));
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activity([{ kind: 'sources', id: 'sources:1', sources, emittedAtMs: 1_200 }])}
      />,
    );
    expect(view.queryByText('Source 6')).toBeNull();
    const more = view.getByTestId('agent-activity.more-sources');
    expect(more.props.accessibilityRole).toBe('button');
    expect(more.props.accessibilityLabel).toBe('Show 3 more sources');
    expect(view.getByText('+3 more sources')).toBeTruthy();
    expect(StyleSheet.flatten(more.props.style)).toEqual(
      expect.objectContaining({ minHeight: 44, minWidth: 44 }),
    );
    fireEvent.press(more);
    expect(view.getByText('Source 6')).toBeTruthy();
    expect(view.getByText('Source 8')).toBeTruthy();
    const fewer = view.getByTestId('agent-activity.more-sources');
    expect(fewer.props.accessibilityLabel).toBe('Show fewer sources');
    expect(view.getByText('Show fewer')).toBeTruthy();
    fireEvent.press(fewer);
    expect(view.queryByText('Source 6')).toBeNull();
    expect(view.getByText('+3 more sources')).toBeTruthy();
  });

  it('opens every source of an expanded search step from its more button', () => {
    const sources = Array.from({ length: 7 }, (_, index) => ({
      url: `https://example.com/${index + 1}`,
      title: `Result ${index + 1}`,
    }));
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activity([
          {
            kind: 'tool',
            id: 'tool:s1',
            toolCallId: 's1',
            name: 'web_search',
            category: 'web-search',
            summary: 'Searched the web',
            status: 'completed',
            startedAtMs: 1_100,
            sources,
          } as AgentActivityEntry,
        ])}
      />,
    );
    fireEvent.press(view.getByLabelText(/^Searched the web, /));
    expect(view.getByText('Result 5')).toBeTruthy();
    expect(view.queryByText('Result 6')).toBeNull();
    fireEvent.press(view.getByLabelText('Show 2 more sources'));
    expect(view.getByText('Result 6')).toBeTruthy();
    expect(view.getByText('Result 7')).toBeTruthy();
  });
});
