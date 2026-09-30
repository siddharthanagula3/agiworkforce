import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockApi = { get: jest.fn(), patch: jest.fn(), delete: jest.fn(), post: jest.fn() };
jest.mock('@/services/api', () => ({
  get api() {
    return mockApi;
  },
}));

import { PublishedArtifactControls } from '@/src/features/chat/components/PublishedArtifactControls';
import {
  fetchArtifactPublication,
  readPublishedTokenFromUrl,
} from '@/src/features/chat/services/artifactPublishing';

const TOKEN = 'abcdefghijklmnopqrstuvwx';
const SHARE_URL = `https://agiworkforce.com/shared-artifact/${TOKEN}`;

function pressConfirm() {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.[buttons.length - 1]?.onPress?.();
  });
}

describe('published artifact controls', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('reads the publication and workspace audience for an artifact', async () => {
    mockApi.get.mockResolvedValue({
      artifacts: [{ artifactId: 'a1', shareUrl: SHARE_URL, visibility: 'organization' }],
      workspace: { memberCount: 4 },
    });

    await expect(fetchArtifactPublication('a1')).resolves.toEqual({
      publication: { shareUrl: SHARE_URL, visibility: 'organization' },
      workspaceMemberCount: 4,
    });
    expect(readPublishedTokenFromUrl(SHARE_URL)).toBe(TOKEN);
  });

  it('moves the link to the workspace after confirmation', async () => {
    pressConfirm();
    mockApi.patch.mockResolvedValue({ shareUrl: SHARE_URL, visibility: 'organization' });
    const onChanged = jest.fn();
    const { getByTestId } = render(
      <PublishedArtifactControls
        title="Report"
        publication={{ shareUrl: SHARE_URL, visibility: 'public' }}
        workspaceMemberCount={3}
        onChanged={onChanged}
        onUnpublished={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('artifact-audience-organization'));
    });

    expect(mockApi.patch).toHaveBeenCalledWith(`/api/artifacts/publish/${TOKEN}`, {
      visibility: 'organization',
    });
    expect(onChanged).toHaveBeenCalledWith({ shareUrl: SHARE_URL, visibility: 'organization' });
  });

  it('unpublishes only after confirmation', async () => {
    pressConfirm();
    mockApi.delete.mockResolvedValue({ success: true });
    const onUnpublished = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <PublishedArtifactControls
        title="Report"
        publication={{ shareUrl: SHARE_URL, visibility: 'public' }}
        workspaceMemberCount={null}
        onChanged={jest.fn()}
        onUnpublished={onUnpublished}
      />,
    );

    expect(queryByTestId('artifact-audience-organization')).toBeNull();
    await act(async () => {
      fireEvent.press(getByTestId('artifact-unpublish'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Unpublish this artifact?',
      expect.stringContaining('cannot be undone'),
      expect.any(Array),
      expect.any(Object),
    );
    expect(mockApi.delete).toHaveBeenCalledWith(`/api/artifacts/publish/${TOKEN}`);
    expect(onUnpublished).toHaveBeenCalled();
  });
});
