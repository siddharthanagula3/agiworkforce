import React, { useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { useUnsavedChangesGuard } from '../src/shared/hooks/useUnsavedChangesGuard';

const mockLeave = jest.fn();

function DraftScreen() {
  const [dirty, setDirty] = useState(false);
  const guardLeave = useUnsavedChangesGuard(dirty);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setDirty(true)}>
        <Text>Type</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => guardLeave(mockLeave)}>
        <Text>Cancel</Text>
      </Pressable>
    </>
  );
}

function Home() {
  return <Text>Home</Text>;
}

describe('Unsaved changes guard', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alert.mockRestore();
  });

  it('renders inside the app navigator instead of throwing for a missing navigation object', () => {
    renderRouter({ index: Home, draft: DraftScreen }, { initialUrl: '/draft' });

    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('leaves at once while nothing has changed', () => {
    renderRouter({ index: Home, draft: DraftScreen }, { initialUrl: '/draft' });

    fireEvent.press(screen.getByText('Cancel'));

    expect(alert).not.toHaveBeenCalled();
    expect(mockLeave).toHaveBeenCalledTimes(1);
  });

  it('asks before a screen-owned cancel discards changes, and leaves only on Discard', () => {
    renderRouter({ index: Home, draft: DraftScreen }, { initialUrl: '/draft' });

    fireEvent.press(screen.getByText('Type'));
    fireEvent.press(screen.getByText('Cancel'));

    expect(mockLeave).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Discard changes?', 'You have unsaved changes.', [
      expect.objectContaining({ text: 'Discard' }),
      expect.objectContaining({ text: 'Keep Editing' }),
    ]);
    const buttons = alert.mock.lastCall?.[2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Discard')?.onPress?.();
    expect(mockLeave).toHaveBeenCalledTimes(1);
  });

  it('asks before the navigator removes a screen with changes', () => {
    renderRouter({ index: Home, draft: DraftScreen }, { initialUrl: '/' });
    testRouter.push('/draft');

    fireEvent.press(screen.getByText('Type'));
    testRouter.back();

    expect(alert).toHaveBeenCalledWith(
      'Discard changes?',
      'You have unsaved changes.',
      expect.any(Array),
    );
    expect(screen.getByText('Cancel')).toBeTruthy();
  });
});
