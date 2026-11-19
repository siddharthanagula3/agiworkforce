jest.mock('@/src/features/chat/services/followUps', () => ({
  fetchFollowUpSuggestions: jest.fn(),
}));

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import { deriveFollowUps, followUpAsksForWebSearch } from '@agiworkforce/unified-chat/follow-ups';
import {
  FollowUpSuggestions,
  cachedFollowUpSuggestions,
  type FollowUpFallbackTurn,
} from '@/src/features/chat/components/FollowUpSuggestions';
import { fetchFollowUpSuggestions } from '@/src/features/chat/services/followUps';

const mockFetchFollowUps = fetchFollowUpSuggestions as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useCloudSyncStateStore.getState().reset();
});

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

  it('waits for the answer to reach the server and then asks once', async () => {
    mockFetchFollowUps.mockResolvedValue(['What does it cost?']);
    useCloudSyncStateStore.getState().markMessageDirty('c-1', 'm-9');
    render(<FollowUpSuggestions conversationId="c-1" messageId="m-9" onSelect={jest.fn()} />);

    await act(async () => undefined);
    expect(mockFetchFollowUps).not.toHaveBeenCalled();

    act(() => {
      useCloudSyncStateStore
        .getState()
        .clearDirty([], [{ conversationId: 'c-1', messageId: 'm-9' }]);
    });
    expect(await screen.findByLabelText('Ask: What does it cost?')).toBeTruthy();
    expect(mockFetchFollowUps).toHaveBeenCalledTimes(1);
    expect(mockFetchFollowUps).toHaveBeenCalledWith('c-1', 'm-9', expect.any(Object));

    act(() => {
      useCloudSyncStateStore.getState().markMessageDirty('c-1', 'm-9');
      useCloudSyncStateStore
        .getState()
        .clearDirty([], [{ conversationId: 'c-1', messageId: 'm-9' }]);
    });
    await act(async () => undefined);
    expect(mockFetchFollowUps).toHaveBeenCalledTimes(1);
  });

  it('asks at once when only another answer is still waiting to sync', async () => {
    mockFetchFollowUps.mockResolvedValue([]);
    useCloudSyncStateStore.getState().markMessageDirty('c-1', 'm-2');
    render(<FollowUpSuggestions conversationId="c-1" messageId="m-9" onSelect={jest.fn()} />);

    await waitFor(() => expect(mockFetchFollowUps).toHaveBeenCalledTimes(1));
  });

  it('never asks once it has gone away before the answer synced', async () => {
    mockFetchFollowUps.mockResolvedValue([]);
    useCloudSyncStateStore.getState().markMessageDirty('c-1', 'm-9');
    const view = render(
      <FollowUpSuggestions conversationId="c-1" messageId="m-9" onSelect={jest.fn()} />,
    );
    view.unmount();

    act(() => {
      useCloudSyncStateStore
        .getState()
        .clearDirty([], [{ conversationId: 'c-1', messageId: 'm-9' }]);
    });
    await act(async () => undefined);
    expect(mockFetchFollowUps).not.toHaveBeenCalled();
  });

  it('hides the chips for this answer when the reader asks', async () => {
    mockFetchFollowUps.mockResolvedValue(['What does it cost?']);
    render(<FollowUpSuggestions conversationId="c-1" messageId="m-9" onSelect={jest.fn()} />);

    const hide = await screen.findByRole('button', { name: 'Hide suggestions' });
    expect(hide).toHaveStyle({ minHeight: 44 });
    fireEvent.press(hide);

    expect(screen.queryByTestId('follow-up-suggestions')).toBeNull();
  });

  it('steps aside while the composer has text and comes back after', async () => {
    mockFetchFollowUps.mockResolvedValue(['What does it cost?']);
    const view = render(
      <FollowUpSuggestions conversationId="c-1" messageId="m-9" onSelect={jest.fn()} />,
    );
    expect(await screen.findByLabelText('Ask: What does it cost?')).toBeTruthy();

    view.rerender(
      <FollowUpSuggestions conversationId="c-1" messageId="m-9" onSelect={jest.fn()} hidden />,
    );
    expect(screen.queryByTestId('follow-up-suggestions')).toBeNull();

    view.rerender(
      <FollowUpSuggestions conversationId="c-1" messageId="m-9" onSelect={jest.fn()} />,
    );
    expect(screen.getByLabelText('Ask: What does it cost?')).toBeTruthy();
    expect(mockFetchFollowUps).toHaveBeenCalledTimes(1);
  });

  it('shows the suggestions the answer already stored and asks the server for none', () => {
    render(
      <FollowUpSuggestions
        conversationId="c-1"
        messageId="m-9"
        onSelect={jest.fn()}
        cached={['Stored one?', 'Stored two?', 'Stored three?', 'Stored four?']}
      />,
    );
    expect(screen.getByLabelText('Ask: Stored one?')).toBeTruthy();
    expect(screen.queryByLabelText('Ask: Stored four?')).toBeNull();
    expect(mockFetchFollowUps).not.toHaveBeenCalled();
  });

  it('treats an empty stored list as an answer with no suggestions', () => {
    render(
      <FollowUpSuggestions conversationId="c-1" messageId="m-9" onSelect={jest.fn()} cached={[]} />,
    );
    expect(screen.queryByTestId('follow-up-suggestions')).toBeNull();
    expect(mockFetchFollowUps).not.toHaveBeenCalled();
  });

  it('hands the fetched list back so it can be stored with the answer', async () => {
    mockFetchFollowUps.mockResolvedValue(['What does it cost?', 'Who makes it?']);
    const onFetched = jest.fn();
    render(
      <FollowUpSuggestions
        conversationId="c-1"
        messageId="m-9"
        onSelect={jest.fn()}
        onFetched={onFetched}
      />,
    );
    await screen.findByLabelText('Ask: Who makes it?');
    expect(onFetched).toHaveBeenCalledWith('m-9', ['What does it cost?', 'Who makes it?']);
  });

  const CODE_TURN: FollowUpFallbackTurn = {
    assistantContent: 'Here is a function that parses the file and returns its rows.',
    userContent: 'Write a function to parse the file',
    messageCount: 2,
  };

  it('offers the follow-ups web derives from the answer when the server has none', async () => {
    mockFetchFollowUps.mockResolvedValue([]);
    render(
      <FollowUpSuggestions
        conversationId="c-1"
        messageId="m-9"
        onSelect={jest.fn()}
        fallbackTurn={CODE_TURN}
      />,
    );
    const derived = deriveFollowUps(
      CODE_TURN.assistantContent,
      CODE_TURN.messageCount,
      CODE_TURN.userContent,
    ).map((followUp) => followUp.text);
    expect(derived.length).toBeGreaterThan(0);
    for (const text of derived) {
      expect(await screen.findByLabelText(`Ask: ${text}`)).toBeTruthy();
    }
  });

  it('falls back to the derived follow-ups when the request fails or the stored list is empty', async () => {
    mockFetchFollowUps.mockRejectedValue(new Error('offline'));
    const view = render(
      <FollowUpSuggestions
        conversationId="c-1"
        messageId="m-9"
        onSelect={jest.fn()}
        fallbackTurn={CODE_TURN}
      />,
    );
    expect(await screen.findByLabelText('Ask: Can you add unit tests for this?')).toBeTruthy();
    view.unmount();

    render(
      <FollowUpSuggestions
        conversationId="c-1"
        messageId="m-10"
        onSelect={jest.fn()}
        cached={[]}
        fallbackTurn={CODE_TURN}
      />,
    );
    expect(screen.getByLabelText('Ask: Can you add unit tests for this?')).toBeTruthy();
  });

  it('shows no derived follow-ups while the server is still answering', async () => {
    let resolve: (value: string[]) => void = () => undefined;
    mockFetchFollowUps.mockReturnValue(
      new Promise<string[]>((done) => {
        resolve = done;
      }),
    );
    render(
      <FollowUpSuggestions
        conversationId="c-1"
        messageId="m-9"
        onSelect={jest.fn()}
        fallbackTurn={CODE_TURN}
      />,
    );
    await act(async () => undefined);
    expect(screen.queryByTestId('follow-up-suggestions')).toBeNull();

    await act(async () => resolve(['What does it cost?']));
    expect(screen.getByLabelText('Ask: What does it cost?')).toBeTruthy();
    expect(screen.queryByLabelText('Ask: Can you add unit tests for this?')).toBeNull();
  });

  it('drops a follow-up that asks for a web search when search is unavailable', () => {
    const asksForSearch = 'Can you search the web for the latest numbers?';
    expect(followUpAsksForWebSearch(asksForSearch)).toBe(true);
    render(
      <FollowUpSuggestions
        conversationId="c-1"
        messageId="m-9"
        onSelect={jest.fn()}
        cached={[asksForSearch, 'What does it cost?']}
        searchUnavailable
      />,
    );
    expect(screen.queryByLabelText(`Ask: ${asksForSearch}`)).toBeNull();
    expect(screen.getByLabelText('Ask: What does it cost?')).toBeTruthy();
  });

  it('reads the stored list from the answer metadata, keeping only text', () => {
    expect(cachedFollowUpSuggestions({ followUpSuggestions: ['A?', 3, 'B?'] })).toEqual([
      'A?',
      'B?',
    ]);
    expect(cachedFollowUpSuggestions({})).toBeUndefined();
    expect(cachedFollowUpSuggestions(undefined)).toBeUndefined();
  });
});
