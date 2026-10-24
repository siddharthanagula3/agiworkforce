import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { WorkModeSwitch } from '../src/features/chat/components/WorkModeSwitch';
import { useTierStore } from '../src/features/billing/store';
import { useChatStore } from '../stores/chatStore';

describe('WorkModeSwitch', () => {
  beforeEach(() => {
    useChatStore.getState().setWorkMode('chat');
  });

  it('renders nothing for a plan without Work', () => {
    useTierStore.setState({ tier: 'free' });
    const screen = render(<WorkModeSwitch />);

    expect(screen.queryByTestId('chat.work-mode.chat')).toBeNull();
    expect(screen.queryByTestId('chat.work-mode.agiwork')).toBeNull();
  });

  it('lets a plan with Work pick Work', () => {
    useTierStore.setState({ tier: 'pro' });
    const screen = render(<WorkModeSwitch />);

    expect(screen.getByTestId('chat.work-mode.chat').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('chat.work-mode.agiwork'));
    expect(useChatStore.getState().workMode).toBe('agiwork');
  });
});
