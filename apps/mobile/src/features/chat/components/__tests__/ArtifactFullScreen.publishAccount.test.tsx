import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('@/services/api', () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  apiFetch: jest.fn(),
}));

jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn().mockResolvedValue(true) }));

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

jest.mock('../MessageContentRenderer', () => ({
  renderMarkdownContent: () => null,
}));

jest.mock('../GeneratedFileCard', () => ({ GeneratedFileCard: () => null }));

import { ArtifactFullScreen } from '../ArtifactFullScreen';
import type { Artifact } from '@/types/chat';
import {
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { usePublishedArtifactAudiences } from '../../services/artifactPublishing';
import { useChatAppModeStore } from '../../store/appModeStore';

const TOKEN = 'a'.repeat(24);
const publishedUrl = `https://example.com/shared-artifact/${TOKEN}`;
const publishLabel = 'Publish artifact to a public link';

const htmlArtifact: Artifact = {
  id: 'artifact-1',
  type: 'code',
  title: 'Landing page',
  content: '<h1>Hello</h1>',
  language: 'html',
};

function lookupReply() {
  return {
    artifact: {
      token: TOKEN,
      artifactId: 'artifact-1',
      title: 'Landing page',
      kind: 'html',
      language: 'html',
      contentChars: 14,
      visibility: 'public',
      createdAt: '2026-11-07T00:00:00Z',
      updatedAt: '2026-11-07T00:00:00Z',
      shareUrl: publishedUrl,
      sandboxed: true,
    },
    workspace: { memberCount: 7 },
  };
}

function lastAlert() {
  const calls = (Alert.alert as unknown as jest.Mock).mock.calls;
  const call = calls[calls.length - 1] as [
    string,
    string,
    Array<{ text?: string; onPress?: () => void }>,
  ];
  return { title: call[0], message: call[1], buttons: call[2] };
}

function tapAlertButton(label: string) {
  const button = lastAlert().buttons.find((candidate) => candidate.text === label);
  if (!button) throw new Error(`No "${label}" button in the last alert`);
  act(() => button.onPress?.());
}

describe('ArtifactFullScreen publish by account state', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset().mockImplementation(() => new Promise(() => undefined));
    (router.push as jest.Mock).mockClear();
    invalidateCloudAccount();
    useChatAppModeStore.setState({ appMode: 'local' });
    usePublishedArtifactAudiences.setState({ ownerId: null, byId: {} });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('with no AGI Cloud account', () => {
    it('asks to sign in and uploads nothing', async () => {
      const view = render(
        <ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />,
      );

      fireEvent.press(view.getByLabelText(publishLabel));

      await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
      expect(lastAlert().title).toBe('Sign in to AGI Cloud to publish');
      expect(lastAlert().buttons.map((button) => button.text)).toEqual(['Cancel', 'Sign in']);
      expect(mockPost).not.toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('leaves everything as it was on Cancel', async () => {
      const onClose = jest.fn();
      const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={onClose} />);

      fireEvent.press(view.getByLabelText(publishLabel));
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      tapAlertButton('Cancel');

      expect(router.push).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('opens the sign-in route from Sign in', async () => {
      const onClose = jest.fn();
      const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={onClose} />);

      fireEvent.press(view.getByLabelText(publishLabel));
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      tapAlertButton('Sign in');

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/(auth)/login' }),
      );
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('signed in while in Local mode', () => {
    beforeEach(() => activateCloudAccount('owner-a'));

    it('explains that publishing needs AGI Cloud mode, without asking consent or uploading', async () => {
      const view = render(
        <ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />,
      );

      fireEvent.press(view.getByLabelText(publishLabel));

      await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
      expect(lastAlert().title).toBe('Switch to AGI Cloud to publish');
      expect(lastAlert().message).toBe(
        'This device is in Local mode. Publishing puts a copy of this artifact on AGI Cloud, so switch to AGI Cloud mode first. Nothing has been uploaded.',
      );
      expect(Alert.alert).not.toHaveBeenCalledWith(
        'Publish to a public link?',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(mockPost).not.toHaveBeenCalled();
      expect(view.queryByTestId('artifact-published-url')).toBeNull();
    });

    it('does not look up a link while the phone is in Local mode', async () => {
      mockGet.mockResolvedValue(lookupReply());
      const view = render(
        <ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />,
      );

      await act(async () => undefined);

      expect(mockGet).not.toHaveBeenCalled();
      expect(view.queryByTestId('artifact-published-url')).toBeNull();
    });
  });

  describe('signed in while in AGI Cloud mode', () => {
    beforeEach(() => {
      activateCloudAccount('owner-a');
      useChatAppModeStore.setState({ appMode: 'cloud' });
    });

    it('says the artifact leaves the phone before it publishes', async () => {
      mockPost.mockResolvedValue({
        artifactId: 'artifact-1',
        token: TOKEN,
        shareUrl: publishedUrl,
        visibility: 'public',
        version: 1,
        publishedAt: '2026-11-07T00:00:00Z',
        kind: 'html',
        title: 'Landing page',
        sandboxed: true,
        workspace: { memberCount: 7 },
      });
      const view = render(
        <ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />,
      );

      fireEvent.press(view.getByLabelText(publishLabel));
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      expect(lastAlert().title).toBe('Publish to a public link?');
      expect(lastAlert().message).toBe(
        '“Landing page” will be uploaded from this device to AGI Cloud, and anyone with the link can open it.',
      );
      expect(mockPost).not.toHaveBeenCalled();
      tapAlertButton('Publish');

      await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(view.getByTestId('artifact-published-url').props.children).toBe(publishedUrl),
      );
    });

    it('shows the link of an artifact published earlier when it is reopened', async () => {
      mockGet.mockResolvedValue(lookupReply());
      const view = render(
        <ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />,
      );

      await waitFor(() =>
        expect(view.getByTestId('artifact-published-url').props.children).toBe(publishedUrl),
      );
      expect(mockGet).toHaveBeenCalledWith('/api/artifacts/publish/lookup?artifactId=artifact-1', {
        accountEpoch: expect.objectContaining({ ownerId: 'owner-a' }),
      });
      expect(view.getByTestId('artifact-published-controls')).toBeTruthy();
    });
  });
});
