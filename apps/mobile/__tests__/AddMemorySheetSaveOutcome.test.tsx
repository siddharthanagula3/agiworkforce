import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AddMemorySheet } from '@/src/features/settings/components/AddMemorySheet';

function renderSheet(onSave: jest.Mock, onClose: jest.Mock = jest.fn()) {
  return render(
    <AddMemorySheet
      editingMemory={null}
      onClose={onClose}
      onSave={onSave}
      onUpdate={jest.fn()}
      open
    />,
  );
}

describe('AddMemorySheet save outcome', () => {
  it('keeps the typed memory and shows the failure when the save is refused', async () => {
    const onSave = jest.fn().mockResolvedValue('Could not add this memory. Try again.');
    const onClose = jest.fn();
    renderSheet(onSave, onClose);

    fireEvent.changeText(screen.getByLabelText('Memory content'), 'I prefer morning appointments');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save memory'));
    });

    expect(onSave).toHaveBeenCalledWith('I prefer morning appointments');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Memory content').props.value).toBe(
      'I prefer morning appointments',
    );
    expect(screen.getByText('Could not add this memory. Try again.')).toBeOnTheScreen();
  });

  it('keeps the typed memory when the save callback throws', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('database is locked'));
    const onClose = jest.fn();
    renderSheet(onSave, onClose);

    fireEvent.changeText(screen.getByLabelText('Memory content'), 'Keep this draft');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save memory'));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Memory content').props.value).toBe('Keep this draft');
    expect(screen.getByText('Could not save this memory. Try again.')).toBeOnTheScreen();
  });

  it('saves the retained draft on the next attempt and closes once', async () => {
    const onSave = jest
      .fn()
      .mockResolvedValueOnce('Could not add this memory. Try again.')
      .mockResolvedValueOnce(null);
    const onClose = jest.fn();
    renderSheet(onSave, onClose);

    fireEvent.changeText(screen.getByLabelText('Memory content'), 'Keep this draft');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save memory'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save memory'));
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith('Keep this draft');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not submit a second save while the first is pending', async () => {
    let finish: ((failure: string | null) => void) | undefined;
    const onSave = jest.fn().mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          finish = resolve;
        }),
    );
    const onClose = jest.fn();
    renderSheet(onSave, onClose);

    fireEvent.changeText(screen.getByLabelText('Memory content'), 'One memory');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save memory'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save memory'));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      finish?.(null);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
