import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPost = jest.fn();
jest.mock('@/services/api', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

const mockCopy = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => mockCopy(...args),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

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

const htmlArtifact: Artifact = {
  id: 'artifact-1',
  type: 'code',
  title: 'Landing page',
  content: '<h1>Hello</h1>',
  language: 'html',
};

function tapAlertButton(label: string) {
  const spy = Alert.alert as unknown as jest.Mock;
  const buttons = spy.mock.calls.at(-1)?.[2] as
    | Array<{ text?: string; onPress?: () => void }>
    | undefined;
  const button = buttons?.find((candidate) => candidate.text === label);
  if (!button) throw new Error(`No "${label}" button in the last alert`);
  act(() => button.onPress?.());
}

describe('ArtifactFullScreen publish-to-link', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockCopy.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts the artifact to the publish endpoint and surfaces the hosted URL', async () => {
    mockPost.mockResolvedValue({ shareUrl: 'https://agiworkforce.ai/a/tok3n' });

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
      }),
    );

    await waitFor(() =>
      expect(view.getByTestId('artifact-published-url').props.children).toBe(
        'https://agiworkforce.ai/a/tok3n',
      ),
    );
    expect(mockCopy).toHaveBeenCalledWith('https://agiworkforce.ai/a/tok3n');
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
    mockPost.mockRejectedValue(new Error('Artifact publishing is not configured'));

    const view = render(
      <ArtifactFullScreen artifact={htmlArtifact} visible onClose={() => undefined} />,
    );

    fireEvent.press(view.getByLabelText('Publish artifact to a public link'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    tapAlertButton('Publish');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Publish failed',
        'Artifact publishing is not configured',
      ),
    );
    expect(view.queryByTestId('artifact-published-url')).toBeNull();
  });

  it('does not show one artifact’s link while a different artifact is open', async () => {
    mockPost.mockResolvedValue({ shareUrl: 'https://agiworkforce.ai/a/tok3n' });

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
});
