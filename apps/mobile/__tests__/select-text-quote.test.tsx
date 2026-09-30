import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SelectTextSheet } from '@/src/features/chat/components/SelectTextSheet';

describe('select text sheet', () => {
  it('quotes only the selected span in the reply', () => {
    const onQuoteSelection = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <SelectTextSheet
        visible
        text="The first point. The second point."
        onClose={onClose}
        onQuoteSelection={onQuoteSelection}
      />,
    );

    act(() => {
      getByTestId('select-text-input').props.onSelectionChange({
        nativeEvent: { selection: { start: 17, end: 33 } },
      });
    });
    fireEvent.press(getByTestId('select-text-quote'));

    expect(onQuoteSelection).toHaveBeenCalledWith('The second point');
    expect(onClose).toHaveBeenCalled();
  });

  it('does not quote without a selection', () => {
    const onQuoteSelection = jest.fn();
    const { getByTestId } = render(
      <SelectTextSheet
        visible
        text="Nothing chosen"
        onClose={jest.fn()}
        onQuoteSelection={onQuoteSelection}
      />,
    );

    fireEvent.press(getByTestId('select-text-quote'));

    expect(onQuoteSelection).not.toHaveBeenCalled();
  });

  it('keeps the plain selectable view when quoting is not offered', () => {
    const { queryByTestId, getByText } = render(
      <SelectTextSheet visible text="Just read me" onClose={jest.fn()} />,
    );

    expect(queryByTestId('select-text-input')).toBeNull();
    expect(getByText('Just read me')).toBeTruthy();
  });
});
