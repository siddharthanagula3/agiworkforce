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
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  fetchArtifactPublication,
  readPublishedTokenFromUrl,
  PUBLISH_FAILED_MESSAGE,
} from '@/src/features/chat/services/artifactPublishing';

const TOKEN = 'abcdefghijklmnopqrstuvwx';
const SHARE_URL = `https://agiworkforce.com/shared-artifact/${TOKEN}`;

const audienceReceipt = {
  token: TOKEN,
  shareUrl: SHARE_URL,
  title: 'Report',
  visibility: 'organization',
  organizationId: 'org-1',
  updatedAt: '2026-11-07T00:00:00Z',
};

function lookupReply(artifactId: string, visibility: string) {
  return {
    artifact: {
      token: TOKEN,
      artifactId,
      title: 'Report',
      kind: 'html',
      language: 'html',
      contentChars: 14,
      visibility,
      createdAt: '2026-11-07T00:00:00Z',
      updatedAt: '2026-11-07T00:00:00Z',
      shareUrl: SHARE_URL,
      sandboxed: true,
    },
    workspace: { memberCount: 4 },
  };
}

function pressConfirm() {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.[buttons.length - 1]?.onPress?.();
  });
}

describe('published artifact controls', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    Object.values(mockApi).forEach((method) => method.mockReset());
    invalidateCloudAccount();
    activateCloudAccount('publication-controls-owner');
  });

  afterEach(() => invalidateCloudAccount());

  it('reads the publication and workspace audience for an artifact', async () => {
    mockApi.get.mockResolvedValue(lookupReply('a1', 'organization'));

    await expect(fetchArtifactPublication('a1')).resolves.toEqual({
      publication: { shareUrl: SHARE_URL, visibility: 'organization' },
      workspaceMemberCount: 4,
    });
    expect(readPublishedTokenFromUrl(SHARE_URL)).toBe(TOKEN);
    expect(mockApi.get).toHaveBeenCalledWith('/api/artifacts/publish/lookup?artifactId=a1', {
      accountEpoch: captureCloudAccountEpoch(),
    });
  });

  it('never calls an invite-only or unrecognised audience public', async () => {
    mockApi.get
      .mockResolvedValueOnce(lookupReply('a1', 'invited'))
      .mockResolvedValueOnce(lookupReply('a2', 'something-new'));

    await expect(fetchArtifactPublication('a1')).resolves.toMatchObject({
      publication: { visibility: 'invited' },
    });
    await expect(fetchArtifactPublication('a2')).resolves.toMatchObject({
      publication: { visibility: 'invited' },
    });
  });

  it('moves the link to the workspace after confirmation', async () => {
    pressConfirm();
    mockApi.patch.mockResolvedValue(audienceReceipt);
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

    expect(mockApi.patch).toHaveBeenCalledWith(
      `/api/artifacts/publish/${TOKEN}`,
      {
        visibility: 'organization',
      },
      { accountEpoch: captureCloudAccountEpoch(), auth401Recovery: 'caller-owned' },
    );
    expect(onChanged).toHaveBeenCalledWith({ shareUrl: SHARE_URL, visibility: 'organization' });
  });

  // UNRUN: real service receipt rejection must not call the adoption callback.
  it.each([
    {},
    { shareUrl: SHARE_URL, visibility: 'organization' },
    { ...audienceReceipt, visibility: 'public' },
    { ...audienceReceipt, visibility: 'unknown' },
    {
      ...audienceReceipt,
      token: 'b'.repeat(24),
      shareUrl: `https://example.com/shared-artifact/${'b'.repeat(24)}`,
    },
  ])('keeps the current audience on invalid acknowledgement %p', async (reply) => {
    pressConfirm();
    mockApi.patch.mockResolvedValue(reply);
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
    expect(mockApi.patch).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Could not change who can open this',
      PUBLISH_FAILED_MESSAGE,
    );
    expect(getByTestId('artifact-audience-public').props.accessibilityState.checked).toBe(true);
    expect(getByTestId('artifact-audience-organization').props.accessibilityState.disabled).toBe(
      false,
    );
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
    expect(onUnpublished).toHaveBeenCalledWith();
  });
});
