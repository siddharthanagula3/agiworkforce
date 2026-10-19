jest.mock('@/services/api', () => ({ api: { post: jest.fn() } }));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api } from '@/services/api';
import {
  FollowUpSuggestions,
  followUpsPath,
} from '@/src/features/chat/components/FollowUpSuggestions';

beforeEach(() => jest.clearAllMocks());

describe('FollowUpSuggestions', () => {
  it('offers the follow-ups the server wrote for the answer and asks one on tap', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      suggestions: ['How does it compare to lithium?', 'What does it cost?', 'Who makes it?', 'x'],
    });
    const onSelect = jest.fn();
    render(<FollowUpSuggestions conversationId="c-1" messageId="m-9" onSelect={onSelect} />);

    fireEvent.press(await screen.findByLabelText('Ask: What does it cost?'));
    expect(onSelect).toHaveBeenCalledWith('What does it cost?');
    expect(api.post).toHaveBeenCalledWith(
      '/api/chat/conversations/c-1/messages/m-9/follow-ups',
      undefined,
      expect.objectContaining({ signal: expect.any(Object) }),
    );
    expect(screen.queryByLabelText('Ask: x')).toBeNull();
  });

  it('shows nothing when there are no suggestions or the request fails', async () => {
    (api.post as jest.Mock).mockRejectedValue(new Error('offline'));
    render(<FollowUpSuggestions conversationId="c-1" messageId="m-9" onSelect={jest.fn()} />);
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(screen.queryByTestId('follow-up-suggestions')).toBeNull();
    expect(followUpsPath('a b', 'm/1')).toBe(
      '/api/chat/conversations/a%20b/messages/m%2F1/follow-ups',
    );
  });
});
