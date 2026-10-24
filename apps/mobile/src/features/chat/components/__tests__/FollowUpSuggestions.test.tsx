jest.mock('@/src/features/chat/services/followUps', () => ({
  fetchFollowUpSuggestions: jest.fn(),
}));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FollowUpSuggestions } from '@/src/features/chat/components/FollowUpSuggestions';
import { fetchFollowUpSuggestions } from '@/src/features/chat/services/followUps';

const mockFetchFollowUps = fetchFollowUpSuggestions as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('FollowUpSuggestions', () => {
  it('offers the first three follow-ups for the answer and asks one on tap', async () => {
    mockFetchFollowUps.mockResolvedValue([
      'How does it compare to lithium?',
      'What does it cost?',
      'Who makes it?',
      'x',
    ]);
    const onSelect = jest.fn();
    render(<FollowUpSuggestions conversationId="c-1" messageId="m-9" onSelect={onSelect} />);

    fireEvent.press(await screen.findByLabelText('Ask: What does it cost?'));
    expect(onSelect).toHaveBeenCalledWith('What does it cost?');
    expect(mockFetchFollowUps).toHaveBeenCalledWith('c-1', 'm-9', expect.any(Object));
    expect(screen.queryByLabelText('Ask: x')).toBeNull();
  });

  it('shows nothing when the request fails', async () => {
    mockFetchFollowUps.mockRejectedValue(new Error('offline'));
    render(<FollowUpSuggestions conversationId="c-1" messageId="m-9" onSelect={jest.fn()} />);
    await waitFor(() => expect(mockFetchFollowUps).toHaveBeenCalled());
    expect(screen.queryByTestId('follow-up-suggestions')).toBeNull();
  });
});
