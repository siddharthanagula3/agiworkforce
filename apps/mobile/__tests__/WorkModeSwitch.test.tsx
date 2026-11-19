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

import {
  HEADER_TEXT_SCALE_LIMIT,
  WorkModeSwitch,
} from '../src/features/chat/components/WorkModeSwitch';
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

  it('caps the Chat and Work labels at the header text limit instead of turning scaling off', () => {
    useTierStore.setState({ tier: 'pro' });
    const screen = render(<WorkModeSwitch />);

    for (const label of ['Chat', 'Work']) {
      const text = screen.getByText(label);
      expect(text.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      expect(text.props.maxFontSizeMultiplier).toBeGreaterThan(1);
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.numberOfLines).toBe(1);
    }
  });

  it('shows Chat while Work is not ready and hands a Work tap to the caller', () => {
    useTierStore.setState({ tier: 'pro' });
    useChatStore.getState().setWorkMode('agiwork');
    const onSelectWork = jest.fn();
    const screen = render(<WorkModeSwitch workReady={false} onSelectWork={onSelectWork} />);

    expect(screen.getByTestId('chat.work-mode.chat').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('chat.work-mode.agiwork'));
    expect(onSelectWork).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('chat.work-mode.chat'));
    expect(useChatStore.getState().workMode).toBe('chat');
  });
});
