import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPost = jest.fn();
const mockGet = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/services/api', () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

const mockCopy = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => mockCopy(...args),
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

jest.mock('../MessageContentRenderer', () => ({
  renderMarkdownContent: () => null,
}));

jest.mock('../GeneratedFileCard', () => ({ GeneratedFileCard: () => null }));

import { ArtifactFullScreen, publishableKindFor } from '../ArtifactFullScreen';
import type { Artifact } from '@/types/chat';
import { ApiHttpError } from '@/services/apiErrors';
import { PUBLISH_FAILED_MESSAGE, usePublishedArtifactAudiences } from '../../services/artifactPublishing';
import { activateCloudAccount, captureCloudAccountEpoch, invalidateCloudAccount } from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '../../store/appModeStore';

const privateLabel = 'Private. Only you can open it until you publish it.';
const publishedUrl = `https://example.com/shared-artifact/${'a'.repeat(24)}`;
const publishReceipt = {
  artifactId: 'artifact-1', token: 'a'.repeat(24), shareUrl: publishedUrl,
  visibility: 'public', version: 1, publishedAt: '2026-11-07T00:00:00Z',
  kind: 'html', title: 'Landing page', sandboxed: true, workspace: { memberCount: 7 },
};
const audienceReceipt = {
  token: 'a'.repeat(24), shareUrl: publishedUrl, title: 'Landing page',
  visibility: 'organization', organizationId: 'org-1', updatedAt: '2026-11-07T00:00:00Z',
};
const uncertainLabel = 'A publish is unconfirmed. Any link shown is the last known publication and may contain an earlier version. No automatic retry was made.';

function lookupReply(artifactId = 'artifact-1') {
  return {
    artifact: {
      token: 'a'.repeat(24), artifactId, title: 'Landing page', kind: 'html',
      language: 'html', contentChars: 14, visibility: 'public',
      createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z',
      shareUrl: publishedUrl, sandboxed: true,
    },
    workspace: { memberCount: 7 },
  };
}

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const htmlArtifact: Artifact = {
  id: 'artifact-1',
  type: 'code',
  title: 'Landing page',
  content: '<h1>Hello</h1>',
  language: 'html',
};

function tapAlertButton(label: string, alertIndex = -1) {
  const spy = Alert.alert as unknown as jest.Mock;
  const buttons = spy.mock.calls.at(alertIndex)?.[2] as
    Array<{ text?: string; onPress?: () => void }> | undefined;
  const button = buttons?.find((candidate) => candidate.text === label);
  if (!button) throw new Error(`No "${label}" button in the last alert`);
  act(() => button.onPress?.());
}

describe('ArtifactFullScreen publish-to-link', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset().mockImplementation(() => new Promise(() => undefined));
    mockPatch.mockReset();
    mockDelete.mockReset();
    mockCopy.mockReset().mockResolvedValue(true);
    invalidateCloudAccount();
    activateCloudAccount('owner-a');
    useChatAppModeStore.setState({ appMode: 'local' });
    usePublishedArtifactAudiences.setState({ ownerId: null, byId: {} });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts the artifact to the publish endpoint and surfaces the hosted URL', async () => {
    mockPost.mockResolvedValue(publishReceipt);

    const view = render(
      <ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />,
    );

    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    tapAlertButton('Publish');

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/artifacts/publish', {
        artifactId: 'artifact-1',
        title: 'Landing page',
        kind: 'html',
        language: 'html',
        content: '<h1>Hello</h1>',
      }, { accountEpoch: captureCloudAccountEpoch(), auth401Recovery: 'caller-owned' }),
    );

    await waitFor(() =>
      expect(view.getByTestId('artifact-published-url').props.children).toBe(
        publishedUrl,
      ),
    );
    expect(mockCopy).toHaveBeenCalledWith(publishedUrl);
  });

  // UNRUN: receipt, ambiguity, clipboard and current-view regressions.
  it.each(['organization', 'invited'])('uses the acknowledged %s audience and records its badge', async (visibility) => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockPost.mockResolvedValue({ ...publishReceipt, visibility });
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(view.getByTestId('artifact-published-url')).toBeTruthy());
    expect(view.getByTestId('artifact-audience-public').props.accessibilityState.checked).toBe(false);
    expect(view.getByTestId('artifact-audience-organization').props.accessibilityState.checked)
      .toBe(visibility === 'organization');
    expect(usePublishedArtifactAudiences.getState().byId['artifact-1']).toBe(visibility);
    expect(mockCopy).toHaveBeenCalledWith(publishedUrl);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it.each(['present', 'absent', 'failed'] as const)('keeps the attempted publish uncertain after %s reconciliation', async (result) => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGet.mockResolvedValueOnce({ artifact: null, workspace: null });
    const readback = deferred();
    mockGet.mockReturnValueOnce(readback.promise);
    mockPost.mockRejectedValue(new ApiHttpError('Request timed out.', 408, null));
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    await waitFor(() => expect(view.getByText(privateLabel)).toBeTruthy());
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    await act(async () => {
      if (result === 'failed') readback.reject(new Error('offline'));
      else readback.resolve(result === 'present' ? lookupReply() : { artifact: null, workspace: null });
    });
    expect(view.getByText(uncertainLabel)).toBeTruthy();
    expect(view.queryByText(privateLabel)).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockCopy).not.toHaveBeenCalled();
    if (result === 'present') expect(view.getByTestId('artifact-published-url')).toBeTruthy();
  });

  it('keeps confirmed publication when copying throws, without re-publishing or readback', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockPost.mockResolvedValue(publishReceipt);
    mockCopy.mockRejectedValueOnce(new Error('clipboard unavailable'));
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Artifact published', expect.stringContaining('copying')));
    expect(view.getByTestId('artifact-published-url')).toBeTruthy();
    expect(view.queryByText(uncertainLabel)).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('allows a single read-only status retry after reconciliation failure without clearing uncertainty', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGet.mockResolvedValueOnce({ artifact: null, workspace: null })
      .mockRejectedValueOnce(new Error('offline'));
    mockPost.mockRejectedValueOnce(new Error('response lost'));
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    await waitFor(() => expect(view.getByText(privateLabel)).toBeTruthy());
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(view.getByLabelText('Check publication status').props.accessibilityState.disabled).toBe(false));
    const status = deferred();
    mockGet.mockReturnValueOnce(status.promise);
    fireEvent.press(view.getByLabelText('Check publication status'));
    fireEvent.press(view.getByLabelText('Check publication status'));
    expect(mockGet).toHaveBeenCalledTimes(3);
    await act(async () => { status.resolve({ artifact: null, workspace: null }); });
    expect(view.getByText(uncertainLabel)).toBeTruthy();
    expect(view.queryByText(privateLabel)).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('does not certify private after an uncertain publish followed by unpublish and null readback', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGet.mockResolvedValueOnce(lookupReply()).mockResolvedValueOnce(lookupReply())
      .mockResolvedValueOnce({ artifact: null, workspace: null });
    mockPost.mockRejectedValueOnce(new Error('response lost'));
    mockDelete.mockResolvedValueOnce(undefined);
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    await waitFor(() => expect(view.getByTestId('artifact-published-url')).toBeTruthy());
    fireEvent.press(view.getByLabelText('Republish artifact link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(view.getByText(uncertainLabel)).toBeTruthy());
    fireEvent.press(view.getByTestId('artifact-unpublish'));
    tapAlertButton('Unpublish');
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3));
    expect(view.getByText(uncertainLabel)).toBeTruthy();
    expect(view.queryByText(privateLabel)).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('does not let a pending uncertainty read replace a new confirmed receipt', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGet.mockResolvedValueOnce({ artifact: null, workspace: null });
    const oldRead = deferred();
    mockGet.mockReturnValueOnce(oldRead.promise);
    mockPost.mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ ...publishReceipt, visibility: 'organization' });
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    await waitFor(() => expect(view.getByText(privateLabel)).toBeTruthy());
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(view.getByText(uncertainLabel)).toBeTruthy());
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(view.getByTestId('artifact-published-url')).toBeTruthy());
    await act(async () => { oldRead.resolve({ artifact: null, workspace: null }); });
    expect(view.getByTestId('artifact-published-url')).toBeTruthy();
    expect(view.getByTestId('artifact-audience-organization').props.accessibilityState.checked).toBe(true);
    expect(view.queryByText(uncertainLabel)).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  it('discards a reconciliation after an A to B to A account epoch change', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGet.mockResolvedValueOnce({ artifact: null, workspace: null });
    const oldRead = deferred();
    mockGet.mockReturnValueOnce(oldRead.promise);
    mockPost.mockRejectedValueOnce(new Error('response lost'));
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    await waitFor(() => expect(view.getByText(privateLabel)).toBeTruthy());
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    act(() => { activateCloudAccount('owner-b'); activateCloudAccount('owner-a'); });
    await act(async () => { oldRead.resolve(lookupReply()); });
    expect(view.queryByTestId('artifact-published-url')).toBeNull();
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({});
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it.each(['audience', 'unpublish'] as const)('blocks status reads during a pending %s mutation, then allows recovery', async (operation) => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGet.mockResolvedValueOnce(lookupReply()).mockResolvedValueOnce(lookupReply());
    mockPost.mockRejectedValueOnce(new Error('response lost'));
    const mutation = deferred();
    mockPatch.mockReturnValueOnce(mutation.promise);
    mockDelete.mockReturnValueOnce(mutation.promise);
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    await waitFor(() => expect(view.getByTestId('artifact-published-url')).toBeTruthy());
    fireEvent.press(view.getByLabelText('Republish artifact link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(view.getByLabelText('Check publication status').props.accessibilityState.disabled).toBe(false));
    fireEvent.press(view.getByTestId(operation === 'audience' ? 'artifact-audience-organization' : 'artifact-unpublish'));
    tapAlertButton(operation === 'audience' ? 'Share with workspace' : 'Unpublish');
    await waitFor(() => expect(operation === 'audience' ? mockPatch : mockDelete).toHaveBeenCalledTimes(1));
    fireEvent.press(view.getByLabelText('Check publication status'));
    expect(mockGet).toHaveBeenCalledTimes(2);
    if (operation === 'unpublish') mockGet.mockResolvedValueOnce({ artifact: null, workspace: null });
    await act(async () => { mutation.resolve(audienceReceipt); });
    const priorReads = operation === 'unpublish' ? 3 : 2;
    expect(mockGet).toHaveBeenCalledTimes(priorReads);
    mockGet.mockResolvedValueOnce({ artifact: null, workspace: null });
    fireEvent.press(view.getByLabelText('Check publication status'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(priorReads + 1));
    expect(view.getByText(uncertainLabel)).toBeTruthy();
    expect(view.queryByText(privateLabel)).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('does not let an old-view read finalizer clear a newer uncertainty read', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const oldRead = deferred();
    const newRead = deferred();
    mockGet.mockResolvedValueOnce({ artifact: null, workspace: null })
      .mockReturnValueOnce(oldRead.promise)
      .mockResolvedValueOnce({ artifact: null, workspace: null })
      .mockReturnValueOnce(newRead.promise);
    mockPost.mockRejectedValue(new Error('response lost'));
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    await waitFor(() => expect(view.getByText(privateLabel)).toBeTruthy());
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    view.rerender(<ArtifactFullScreen artifact={{ ...htmlArtifact, id: 'artifact-2' }} visible onClose={() => undefined} />);
    await waitFor(() => expect(view.getByText(privateLabel)).toBeTruthy());
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(4));
    await act(async () => { oldRead.resolve(lookupReply()); });
    expect(view.getByLabelText('Check publication status').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(view.getByLabelText('Check publication status'));
    expect(mockGet).toHaveBeenCalledTimes(4);
    expect(view.queryByTestId('artifact-published-url')).toBeNull();
    await act(async () => { newRead.resolve({ artifact: null, workspace: null }); });
    expect(view.getByLabelText('Check publication status').props.accessibilityState.disabled).toBe(false);
    expect(view.getByText(uncertainLabel)).toBeTruthy();
    expect(view.queryByText(privateLabel)).toBeNull();
  });

  it('never uploads content until the user confirms the cloud publish', async () => {
    const view = render(
      <ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />,
    );

    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    tapAlertButton('Cancel');

    expect(mockPost).not.toHaveBeenCalled();
    expect(view.queryByTestId('artifact-published-url')).toBeNull();
  });

  it('reports a failed publish instead of showing a link', async () => {
    mockPost.mockRejectedValue(
      new ApiHttpError('Artifact publishing is not configured', 503, null, {
        requestId: 'req_7f3a',
      }),
    );

    const view = render(
      <ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />,
    );

    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    tapAlertButton('Publish');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Publish not confirmed',
        `Artifact publishing is not configured ${PUBLISH_FAILED_MESSAGE} Reference: req_7f3a`,
      ),
    );
    expect(view.queryByTestId('artifact-published-url')).toBeNull();
  });

  it('never shows what a dropped connection threw', async () => {
    mockPost.mockRejectedValue(new TypeError('Network request failed'));

    const view = render(
      <ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />,
    );

    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    tapAlertButton('Publish');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Publish not confirmed', PUBLISH_FAILED_MESSAGE),
    );
  });

  it('does not show one artifact’s link while a different artifact is open', async () => {
    mockPost.mockResolvedValue(publishReceipt);

    const view = render(
      <ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />,
    );

    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    tapAlertButton('Publish');
    await waitFor(() => expect(view.getByTestId('artifact-published-url')).toBeTruthy());

    view.rerender(
      <ArtifactFullScreen
        artifact={{ ...htmlArtifact, id: 'artifact-2', title: 'Other page' }}
        visible
        onClose={() => undefined}
      />,
    );

    expect(view.queryByTestId('artifact-published-url')).toBeNull();
  });

  it('hides publish for kinds the public renderer cannot serve', () => {
    const view = render(
      <ArtifactFullScreen
        artifact={{ id: 'a2', type: 'email', title: 'Draft', content: 'hi' }}
        visible
        onClose={() => undefined}
      />,
    );

    expect(view.queryByLabelText('Publish artifact to a public link')).toBeNull();
  });

  it('maps mobile artifact types onto the kinds the endpoint accepts', () => {
    expect(publishableKindFor(htmlArtifact)).toBe('html');
    expect(publishableKindFor({ ...htmlArtifact, language: 'tsx' })).toBe('react');
    expect(publishableKindFor({ ...htmlArtifact, language: 'python' })).toBe('code');
    expect(publishableKindFor({ ...htmlArtifact, type: 'research', language: undefined })).toBe(
      'markdown',
    );
    expect(publishableKindFor({ ...htmlArtifact, type: 'chart', language: undefined })).toBeNull();
  });

  it('does not infer private from an unrelated populated audience cache or a failed lookup', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    usePublishedArtifactAudiences.setState({ ownerId: 'owner-a', byId: { unrelated: 'public' } });
    const read = deferred();
    mockGet.mockReturnValueOnce(read.promise);
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    expect(view.queryByText(privateLabel)).toBeNull();
    await act(async () => { read.reject(new Error('Lookup unavailable')); });
    expect(view.queryByText(privateLabel)).toBeNull();
    expect(view.queryByTestId('artifact-published-url')).toBeNull();
    expect(usePublishedArtifactAudiences.getState().byId).toEqual({ unrelated: 'public' });
  });

  it.each([{}, { artifacts: [] }, { artifact: null }, lookupReply('other')])(
    'never claims private for an invalid lookup reply %p', async (reply) => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      mockGet.mockResolvedValueOnce(reply);
      const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
      await act(async () => undefined);
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(view.queryByText(privateLabel)).toBeNull();
      expect(view.queryByTestId('artifact-published-url')).toBeNull();
    },
  );

  it('shows private only after explicit validated absence', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const read = deferred();
    mockGet.mockReturnValueOnce(read.promise);
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    expect(view.queryByText(privateLabel)).toBeNull();
    await act(async () => { read.resolve({ artifact: null, workspace: null }); });
    expect(view.getByText(privateLabel)).toBeTruthy();
  });

  it.each(['artifact', 'close', 'mode', 'epoch'] as const)(
    'ignores an old lookup across a %s round trip, even when the same artifact returns', async (transition) => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      const oldRead = deferred();
      const newRead = deferred();
      mockGet.mockReturnValueOnce(oldRead.promise);
      const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
      if (transition === 'artifact') {
        view.rerender(<ArtifactFullScreen artifact={{ ...htmlArtifact, id: 'artifact-2' }} visible onClose={() => undefined} />);
      } else if (transition === 'close') {
        view.rerender(<ArtifactFullScreen artifact={htmlArtifact} visible={false} onClose={() => undefined} />);
      } else if (transition === 'mode') {
        act(() => useChatAppModeStore.setState({ appMode: 'local' }));
      } else {
        act(() => activateCloudAccount('owner-b'));
      }
      mockGet.mockReturnValueOnce(newRead.promise);
      if (transition === 'artifact' || transition === 'close') {
        view.rerender(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
      } else if (transition === 'mode') {
        act(() => useChatAppModeStore.setState({ appMode: 'cloud' }));
      } else {
        act(() => activateCloudAccount('owner-a'));
      }
      await act(async () => { oldRead.resolve(lookupReply()); });
      expect(view.queryByTestId('artifact-published-url')).toBeNull();
      expect(view.queryByText(privateLabel)).toBeNull();
      await act(async () => { newRead.resolve({ artifact: null, workspace: null }); });
      expect(view.getByText(privateLabel)).toBeTruthy();
    },
  );

  it('does not let a pre-publish absence overwrite a newly published link', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const read = deferred();
    mockGet.mockReturnValueOnce(read.promise);
    mockPost.mockResolvedValue(publishReceipt);
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(view.getByTestId('artifact-published-url')).toBeTruthy());
    await act(async () => { read.resolve({ artifact: null, workspace: null }); });
    expect(view.getByTestId('artifact-published-url').props.children).toBe(publishedUrl);
    expect(view.queryByText(privateLabel)).toBeNull();
  });

  it('ignores a publish completion after closing and reopening the same artifact', async () => {
    const mutation = deferred();
    mockPost.mockReturnValueOnce(mutation.promise);
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    view.rerender(<ArtifactFullScreen artifact={htmlArtifact} visible={false} onClose={() => undefined} />);
    view.rerender(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    await act(async () => { mutation.resolve(publishReceipt); });
    expect(view.queryByTestId('artifact-published-url')).toBeNull();
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it('does not resurrect an unpublished link from a pre-mutation read or claim private before readback', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const oldRead = deferred();
    const readback = deferred();
    mockGet.mockReturnValueOnce(oldRead.promise);
    mockPost.mockResolvedValueOnce(publishReceipt);
    mockDelete.mockResolvedValueOnce(undefined);
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    tapAlertButton('Publish');
    await waitFor(() => expect(view.getByTestId('artifact-published-url')).toBeTruthy());
    mockGet.mockReturnValueOnce(readback.promise);
    fireEvent.press(view.getByTestId('artifact-unpublish'));
    tapAlertButton('Unpublish');
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(view.queryByText(privateLabel)).toBeNull();
    await act(async () => { oldRead.resolve(lookupReply()); });
    expect(view.queryByTestId('artifact-published-url')).toBeNull();
    expect(view.queryByText(privateLabel)).toBeNull();
    await act(async () => { readback.resolve({ artifact: null, workspace: null }); });
    expect(view.getByText(privateLabel)).toBeTruthy();
  });

  it('invalidates a pending publish confirmation when the artifact changes', async () => {
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    view.rerender(<ArtifactFullScreen artifact={{ ...htmlArtifact, id: 'artifact-2' }} visible onClose={() => undefined} />);
    tapAlertButton('Publish');
    await act(async () => undefined);
    expect(mockPost).not.toHaveBeenCalled();
  });

  // UNRUN: current controls adopt only matching full audience acknowledgements.
  it.each(['public', 'organization'] as const)('adopts a current %s audience and badge after confirmation', async (visibility) => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const initial = lookupReply();
    initial.artifact.visibility = visibility === 'public' ? 'organization' : 'public';
    mockGet.mockResolvedValueOnce(initial);
    mockPatch.mockResolvedValueOnce({ ...audienceReceipt, visibility });
    const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
    await waitFor(() => expect(view.getByTestId('artifact-published-controls')).toBeTruthy());
    fireEvent.press(view.getByTestId(`artifact-audience-${visibility}`));
    expect(mockPatch).not.toHaveBeenCalled();
    tapAlertButton(visibility === 'public' ? 'Make public' : 'Share with workspace');
    await waitFor(() => expect(view.getByTestId(`artifact-audience-${visibility}`).props.accessibilityState.checked).toBe(true));
    expect(usePublishedArtifactAudiences.getState().byId['artifact-1']).toBe(visibility);
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith(`/api/artifacts/publish/${audienceReceipt.token}`, { visibility }, {
      accountEpoch: captureCloudAccountEpoch(), auth401Recovery: 'caller-owned',
    });
  });

  it.each(['malformed', 'wrong-audience', 'wrong-token', 'transport'])(
    'preserves the visible link and badge on a current %s audience failure', async (failure) => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      usePublishedArtifactAudiences.setState({ ownerId: 'owner-a', byId: { 'artifact-1': 'public' } });
      mockGet.mockResolvedValueOnce(lookupReply());
      if (failure === 'transport') mockPatch.mockRejectedValueOnce(new Error('offline'));
      else mockPatch.mockResolvedValueOnce(failure === 'malformed' ? {} : failure === 'wrong-audience'
        ? { ...audienceReceipt, visibility: 'public' }
        : { ...audienceReceipt, token: 'b'.repeat(24), shareUrl: publishedUrl.replace(/a{24}$/, 'b'.repeat(24)) });
      const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
      await waitFor(() => expect(view.getByTestId('artifact-published-controls')).toBeTruthy());
      fireEvent.press(view.getByTestId('artifact-audience-organization'));
      tapAlertButton('Share with workspace');
      await waitFor(() => expect(Alert.alert).toHaveBeenLastCalledWith('Could not change who can open this', PUBLISH_FAILED_MESSAGE));
      expect(view.getByTestId('artifact-published-url').props.children).toBe(publishedUrl);
      expect(view.getByTestId('artifact-audience-public').props.accessibilityState.checked).toBe(true);
      expect(view.getByTestId('artifact-audience-organization').props.accessibilityState.disabled).toBe(false);
      expect(usePublishedArtifactAudiences.getState().byId['artifact-1']).toBe('public');
      expect(mockPatch).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockPost).not.toHaveBeenCalled();
    },
  );

  it.each(['publish', 'audience'] as const)(
    'allows only the first confirmed %s owner when publish and audience dialogs overlap',
    async (first) => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      mockGet.mockResolvedValueOnce(lookupReply());
      const publish = deferred();
      const audience = deferred();
      mockPost.mockReturnValueOnce(publish.promise);
      mockPatch.mockReturnValueOnce(audience.promise);
      const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
      await waitFor(() => expect(view.getByTestId('artifact-published-controls')).toBeTruthy());
      fireEvent.press(view.getByLabelText('Republish artifact link'));
      fireEvent.press(view.getByTestId('artifact-audience-organization'));
      expect(Alert.alert).toHaveBeenCalledTimes(2);

      tapAlertButton(first === 'publish' ? 'Publish' : 'Share with workspace', first === 'publish' ? 0 : 1);
      await waitFor(() => expect(first === 'publish' ? mockPost : mockPatch).toHaveBeenCalledTimes(1));
      tapAlertButton(first === 'publish' ? 'Share with workspace' : 'Publish', first === 'publish' ? 1 : 0);
      await act(async () => undefined);
      expect(first === 'publish' ? mockPatch : mockPost).not.toHaveBeenCalled();

      await act(async () => {
        if (first === 'publish') publish.resolve(publishReceipt);
        else audience.resolve(audienceReceipt);
      });
      expect(view.getByTestId('artifact-published-url').props.children).toBe(publishedUrl);
      expect(view.getByTestId(`artifact-audience-${first === 'publish' ? 'public' : 'organization'}`)
        .props.accessibilityState.checked).toBe(true);
    },
  );

  it.each(['audience', 'unpublish'] as const)(
    'allows only the first confirmed %s owner when both controls await confirmation',
    async (first) => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      mockGet.mockResolvedValueOnce(lookupReply());
      const mutation = deferred();
      mockPatch.mockReturnValueOnce(mutation.promise);
      mockDelete.mockReturnValueOnce(mutation.promise);
      const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
      await waitFor(() => expect(view.getByTestId('artifact-published-controls')).toBeTruthy());
      fireEvent.press(view.getByTestId('artifact-audience-organization'));
      fireEvent.press(view.getByTestId('artifact-unpublish'));
      expect(Alert.alert).toHaveBeenCalledTimes(2);

      tapAlertButton(first === 'audience' ? 'Share with workspace' : 'Unpublish', first === 'audience' ? 0 : 1);
      await waitFor(() => expect(first === 'audience' ? mockPatch : mockDelete).toHaveBeenCalledTimes(1));
      tapAlertButton(first === 'audience' ? 'Unpublish' : 'Share with workspace', first === 'audience' ? 1 : 0);
      await act(async () => undefined);
      expect(first === 'audience' ? mockDelete : mockPatch).not.toHaveBeenCalled();

      await act(async () => { mutation.resolve(audienceReceipt); });
      if (first === 'audience') {
        expect(view.getByTestId('artifact-audience-organization').props.accessibilityState.checked).toBe(true);
        mockDelete.mockReset().mockResolvedValueOnce(undefined);
        fireEvent.press(view.getByTestId('artifact-unpublish'));
        tapAlertButton('Unpublish');
        await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
      }
      expect(view.queryByText(privateLabel)).toBeNull();
    },
  );

  it.each(['audience', 'unpublish'] as const)(
    'suppresses a stale %s failure after the view is replaced', async (operation) => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      mockGet.mockResolvedValueOnce(lookupReply());
      const mutation = deferred();
      mockPatch.mockReturnValueOnce(mutation.promise);
      mockDelete.mockReturnValueOnce(mutation.promise);
      const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
      await waitFor(() => expect(view.getByTestId('artifact-published-controls')).toBeTruthy());
      fireEvent.press(view.getByTestId(operation === 'audience' ? 'artifact-audience-organization' : 'artifact-unpublish'));
      tapAlertButton(operation === 'audience' ? 'Share with workspace' : 'Unpublish');
      await waitFor(() => expect(operation === 'audience' ? mockPatch : mockDelete).toHaveBeenCalledTimes(1));
      view.rerender(<ArtifactFullScreen artifact={{ ...htmlArtifact, id: 'artifact-2' }} visible onClose={() => undefined} />);
      const alertsBeforeFailure = jest.mocked(Alert.alert).mock.calls.length;
      await act(async () => { mutation.reject(new Error('Late transport failure')); });
      expect(Alert.alert).toHaveBeenCalledTimes(alertsBeforeFailure);
      expect(view.queryByTestId('artifact-published-url')).toBeNull();
      expect(usePublishedArtifactAudiences.getState().byId).toEqual({});
    },
  );

  it.each(['audience', 'unpublish'] as const)(
    'ignores an old %s mutation completion after an account round trip', async (operation) => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      mockGet.mockResolvedValueOnce(lookupReply());
      const mutation = deferred();
      mockPatch.mockReturnValueOnce(mutation.promise);
      mockDelete.mockReturnValueOnce(mutation.promise);
      const view = render(<ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />);
      await waitFor(() => expect(view.getByTestId('artifact-published-controls')).toBeTruthy());
      fireEvent.press(view.getByTestId(operation === 'audience' ? 'artifact-audience-organization' : 'artifact-unpublish'));
      if (operation === 'unpublish') {
        expect(Alert.alert).toHaveBeenLastCalledWith(
          'Unpublish this artifact?',
          expect.stringContaining('visitor data will be deleted'),
          expect.any(Array), expect.any(Object),
        );
      }
      tapAlertButton(operation === 'audience' ? 'Share with workspace' : 'Unpublish');
      await waitFor(() => expect(operation === 'audience' ? mockPatch : mockDelete).toHaveBeenCalledTimes(1));
      act(() => activateCloudAccount('owner-b'));
      act(() => activateCloudAccount('owner-a'));
      const callsBeforeCompletion = mockGet.mock.calls.length;
      await act(async () => { mutation.resolve(audienceReceipt); });
      expect(view.queryByTestId('artifact-published-url')).toBeNull();
      expect(view.queryByText(privateLabel)).toBeNull();
      expect(usePublishedArtifactAudiences.getState().byId).toEqual({});
      expect(mockGet).toHaveBeenCalledTimes(callsBeforeCompletion);
    },
  );
});
