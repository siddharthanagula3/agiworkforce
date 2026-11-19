import React from 'react';
import { Alert, Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockApi = { get: jest.fn(), patch: jest.fn(), delete: jest.fn(), post: jest.fn() };
const mockApiFetch = jest.fn();
jest.mock('@/services/api', () => ({
  get api() {
    return mockApi;
  },
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { PublishedArtifactControls } from '@/src/features/chat/components/PublishedArtifactControls';
import {
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

const TOKEN = 'abcdefghijklmnopqrstuvwx';
const SHARE_URL = `https://agiworkforce.com/shared-artifact/${TOKEN}`;
const VIEWERS_PATH = `/api/artifacts/publish/${TOKEN}/viewers`;

const audienceReceipt = {
  token: TOKEN,
  shareUrl: SHARE_URL,
  title: 'Report',
  visibility: 'invited',
  organizationId: null,
  updatedAt: '2026-11-07T00:00:00Z',
};

const ann = { email: 'ann@example.com', invitedAt: '2026-11-10T00:00:00Z' };
const bob = { email: 'bob@example.com', invitedAt: '2026-11-11T00:00:00Z' };

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderControls(
  visibility: 'public' | 'organization' | 'invited',
  handlers: { onChanged?: jest.Mock } = {},
) {
  return render(
    <PublishedArtifactControls
      title="Report"
      publication={{ shareUrl: SHARE_URL, visibility }}
      workspaceMemberCount={null}
      onChanged={handlers.onChanged ?? jest.fn()}
      onUnpublished={jest.fn()}
    />,
  );
}

function lastAlertButtons() {
  const calls = (Alert.alert as unknown as jest.Mock).mock.calls;
  return calls[calls.length - 1][2] as Array<{ text?: string; onPress?: () => void }>;
}

function tapAlertButton(label: string) {
  const button = lastAlertButtons().find((candidate) => candidate.text === label);
  if (!button) throw new Error(`No "${label}" button in the last alert`);
  act(() => button.onPress?.());
}

describe('the invited audience', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    Object.values(mockApi).forEach((method) => method.mockReset());
    mockApiFetch.mockReset();
    invalidateCloudAccount();
    activateCloudAccount('viewers-owner');
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => invalidateCloudAccount());

  describe('the audience radio', () => {
    it('is always offered and checked for an artifact limited to invited people', () => {
      mockApiFetch.mockResolvedValue(reply(200, { viewers: [] }));
      const view = renderControls('invited');

      expect(view.getByTestId('artifact-audience-invited').props.accessibilityState).toMatchObject({
        checked: true,
      });
      expect(view.getByTestId('artifact-audience-public').props.accessibilityState).toMatchObject({
        checked: false,
      });
      expect(view.getByLabelText('Only people you invite')).toBeTruthy();
    });

    it('is offered when no workspace count is known and stays a 44 point target', () => {
      const view = renderControls('public');

      expect(view.queryByTestId('artifact-audience-organization')).toBeNull();
      expect(
        StyleSheet.flatten(view.getByTestId('artifact-audience-invited').props.style),
      ).toMatchObject({ minHeight: 44 });
      expect(view.queryByTestId('artifact-viewers')).toBeNull();
    });

    it('asks what stops working before it limits the link, then does it', async () => {
      mockApi.patch.mockResolvedValue(audienceReceipt);
      const onChanged = jest.fn();
      const view = renderControls('public', { onChanged });

      fireEvent.press(view.getByTestId('artifact-audience-invited'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Limit to invited people?',
        'Only people you invite can open the link; anyone else using it loses access.',
        expect.any(Array),
        expect.any(Object),
      );
      expect(lastAlertButtons().map((button) => button.text)).toEqual([
        'Cancel',
        'Limit to invited people',
      ]);
      expect(mockApi.patch).not.toHaveBeenCalled();
      tapAlertButton('Limit to invited people');

      await waitFor(() =>
        expect(mockApi.patch).toHaveBeenCalledWith(
          `/api/artifacts/publish/${TOKEN}`,
          { visibility: 'invited' },
          expect.objectContaining({ auth401Recovery: 'caller-owned' }),
        ),
      );
      await waitFor(() =>
        expect(onChanged).toHaveBeenCalledWith({ shareUrl: SHARE_URL, visibility: 'invited' }),
      );
    });

    it('changes nothing when the question is cancelled', () => {
      const onChanged = jest.fn();
      const view = renderControls('public', { onChanged });

      fireEvent.press(view.getByTestId('artifact-audience-invited'));
      tapAlertButton('Cancel');

      expect(mockApi.patch).not.toHaveBeenCalled();
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('keeps the previous selection and says so when the change fails', async () => {
      mockApi.patch.mockRejectedValue(new TypeError('Network request failed'));
      const onChanged = jest.fn();
      const view = renderControls('public', { onChanged });

      fireEvent.press(view.getByTestId('artifact-audience-invited'));
      tapAlertButton('Limit to invited people');

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenLastCalledWith(
          'Could not change who can open this',
          expect.any(String),
        ),
      );
      expect(onChanged).not.toHaveBeenCalled();
      expect(view.getByTestId('artifact-audience-public').props.accessibilityState).toMatchObject({
        checked: true,
      });
      expect(view.getByTestId('artifact-audience-invited').props.accessibilityState).toMatchObject({
        checked: false,
      });
    });
  });

  describe('the invited people list', () => {
    it('shows a spinner row while it loads, then the people with a Remove each', async () => {
      const pending = deferred<Response>();
      mockApiFetch.mockReturnValue(pending.promise);
      const view = renderControls('invited');

      expect(view.getByTestId('artifact-viewers-loading')).toBeTruthy();
      expect(mockApiFetch).toHaveBeenCalledWith(
        VIEWERS_PATH,
        { method: 'GET' },
        expect.objectContaining({ auth401Recovery: 'caller-owned' }),
      );

      await act(async () => {
        pending.resolve(reply(200, { viewers: [ann, bob] }));
      });

      expect(view.queryByTestId('artifact-viewers-loading')).toBeNull();
      expect(view.getByText('ann@example.com')).toBeTruthy();
      expect(view.getByText('bob@example.com')).toBeTruthy();
      expect(
        StyleSheet.flatten(view.getByLabelText('Remove ann@example.com').props.style),
      ).toMatchObject({ minHeight: 44 });
    });

    it('keeps a long list in a bounded scroll area so Unpublish stays reachable', async () => {
      const many = Array.from({ length: 40 }, (_, index) => ({
        email: `person${index}@example.com`,
        invitedAt: '2026-11-10T00:00:00Z',
      }));
      mockApiFetch.mockResolvedValue(reply(200, { viewers: many }));
      const view = renderControls('invited');

      const list = await waitFor(() => view.getByTestId('artifact-viewers-list'));

      expect(list.props.nestedScrollEnabled).toBe(true);
      const { maxHeight } = StyleSheet.flatten(list.props.style) as { maxHeight: number };
      expect(maxHeight).toBeGreaterThan(0);
      expect(maxHeight).toBeLessThan(Dimensions.get('window').height);
      expect(view.getByTestId('artifact-unpublish')).toBeTruthy();
    });

    it('says plainly that no one is invited yet', async () => {
      mockApiFetch.mockResolvedValue(reply(200, { viewers: [] }));
      const view = renderControls('invited');

      await waitFor(() =>
        expect(view.getByText('No one is invited yet. Only you can open it.')).toBeTruthy(),
      );
    });

    it('offers Retry when the list cannot be loaded, and retries', async () => {
      mockApiFetch
        .mockRejectedValueOnce(new TypeError('Network request failed'))
        .mockResolvedValueOnce(reply(200, { viewers: [ann] }));
      const view = renderControls('invited');

      await waitFor(() =>
        expect(view.getByText('Could not load who this is shared with')).toBeTruthy(),
      );
      expect(view.queryByText('Network request failed')).toBeNull();
      fireEvent.press(view.getByLabelText('Retry loading invited people'));

      await waitFor(() => expect(view.getByText('ann@example.com')).toBeTruthy());
      expect(view.queryByText('Could not load who this is shared with')).toBeNull();
    });

    it('does not show a list that arrives after the account changed', async () => {
      const pending = deferred<Response>();
      mockApiFetch.mockReturnValue(pending.promise);
      const view = renderControls('invited');

      act(() => activateCloudAccount('someone-else'));
      await act(async () => {
        pending.resolve(reply(200, { viewers: [ann] }));
      });

      expect(view.queryByText('ann@example.com')).toBeNull();
    });
  });

  describe('inviting', () => {
    it('keeps Invite disabled until the text is a valid address', async () => {
      mockApiFetch.mockResolvedValue(reply(200, { viewers: [] }));
      const view = renderControls('invited');
      await waitFor(() => expect(view.getByTestId('artifact-viewers-empty')).toBeTruthy());

      const invite = view.getByTestId('artifact-viewer-invite');
      expect(invite.props.accessibilityState).toMatchObject({ disabled: true });
      expect(StyleSheet.flatten(invite.props.style)).toMatchObject({ minHeight: 44 });

      fireEvent.changeText(view.getByTestId('artifact-viewer-email'), 'ann@');
      expect(view.getByTestId('artifact-viewer-invite').props.accessibilityState).toMatchObject({
        disabled: true,
      });

      fireEvent.changeText(view.getByTestId('artifact-viewer-email'), 'ann@example.com');
      expect(view.getByTestId('artifact-viewer-invite').props.accessibilityState).toMatchObject({
        disabled: false,
      });
    });

    it('sends the address, shows a spinner meanwhile, then lists it and clears the field', async () => {
      const sending = deferred<Response>();
      mockApiFetch.mockResolvedValueOnce(reply(200, { viewers: [] }));
      const view = renderControls('invited');
      await waitFor(() => expect(view.getByTestId('artifact-viewers-empty')).toBeTruthy());
      mockApiFetch.mockReturnValueOnce(sending.promise);

      fireEvent.changeText(view.getByTestId('artifact-viewer-email'), ' Ann@Example.com ');
      fireEvent.press(view.getByTestId('artifact-viewer-invite'));

      expect(mockApiFetch).toHaveBeenLastCalledWith(
        VIEWERS_PATH,
        { method: 'POST', body: JSON.stringify({ email: 'ann@example.com' }) },
        expect.objectContaining({ auth401Recovery: 'caller-owned' }),
      );
      expect(view.getByTestId('artifact-viewer-invite').props.accessibilityState).toMatchObject({
        busy: true,
        disabled: true,
      });

      await act(async () => {
        sending.resolve(reply(200, { viewers: [ann] }));
      });

      expect(view.getByText('ann@example.com')).toBeTruthy();
      expect(view.getByTestId('artifact-viewer-email').props.value).toBe('');
      expect(view.queryByTestId('artifact-viewers-empty')).toBeNull();
    });

    it('shows the server sentence under the field and keeps what was typed', async () => {
      mockApiFetch
        .mockResolvedValueOnce(reply(200, { viewers: [] }))
        .mockResolvedValueOnce(
          reply(409, { error: { code: 'conflict', message: 'You can invite up to 50 people.' } }),
        );
      const view = renderControls('invited');
      await waitFor(() => expect(view.getByTestId('artifact-viewers-empty')).toBeTruthy());

      fireEvent.changeText(view.getByTestId('artifact-viewer-email'), 'ann@example.com');
      fireEvent.press(view.getByTestId('artifact-viewer-invite'));

      await waitFor(() =>
        expect(view.getByTestId('artifact-viewer-add-error').props.children).toBe(
          'You can invite up to 50 people.',
        ),
      );
      expect(view.getByTestId('artifact-viewer-email').props.value).toBe('ann@example.com');
      expect(view.getByTestId('artifact-viewer-invite').props.accessibilityState).toMatchObject({
        disabled: false,
      });

      fireEvent.changeText(view.getByTestId('artifact-viewer-email'), 'ann@example.co');
      expect(view.queryByTestId('artifact-viewer-add-error')).toBeNull();
    });
  });

  describe('removing', () => {
    async function listedWithTwo() {
      mockApiFetch.mockResolvedValueOnce(reply(200, { viewers: [ann, bob] }));
      const view = renderControls('invited');
      await waitFor(() => expect(view.getByText('ann@example.com')).toBeTruthy());
      return view;
    }

    it('asks first and names the consequence, and does nothing on Cancel', async () => {
      const view = await listedWithTwo();

      fireEvent.press(view.getByLabelText('Remove ann@example.com'));

      expect(Alert.alert).toHaveBeenLastCalledWith(
        'Remove ann@example.com?',
        'They will lose access to the link right away.',
        expect.any(Array),
        expect.any(Object),
      );
      tapAlertButton('Cancel');
      await act(async () => undefined);

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(view.getByText('ann@example.com')).toBeTruthy();
    });

    it('removes the person after the question and shows the list the server returns', async () => {
      const view = await listedWithTwo();
      mockApiFetch.mockResolvedValueOnce(reply(200, { viewers: [bob] }));

      fireEvent.press(view.getByLabelText('Remove ann@example.com'));
      tapAlertButton('Remove');

      await waitFor(() => expect(view.queryByText('ann@example.com')).toBeNull());
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        VIEWERS_PATH,
        { method: 'DELETE', body: JSON.stringify({ email: 'ann@example.com' }) },
        expect.objectContaining({ auth401Recovery: 'caller-owned' }),
      );
      expect(view.getByText('bob@example.com')).toBeTruthy();
    });

    it('keeps the person listed and says so when the removal fails', async () => {
      const view = await listedWithTwo();
      mockApiFetch.mockResolvedValueOnce(
        reply(404, { error: { code: 'not_found', message: 'Published artifact not found' } }),
      );

      fireEvent.press(view.getByLabelText('Remove ann@example.com'));
      tapAlertButton('Remove');

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenLastCalledWith(
          'Could not remove this person',
          'Published artifact not found',
        ),
      );
      expect(view.getByText('ann@example.com')).toBeTruthy();
    });
  });
});
