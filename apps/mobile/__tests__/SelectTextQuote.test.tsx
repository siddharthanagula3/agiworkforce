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

  it('shows code fence lines exactly and quotes a selected code line', () => {
    const onQuoteSelection = jest.fn();
    const code = '# setup\n- name: run\ndef __init__(self):';
    const { getByTestId } = render(
      <SelectTextSheet
        visible
        text={`Try **this**:\n\n\`\`\`python\n${code}\n\`\`\``}
        onClose={jest.fn()}
        onQuoteSelection={onQuoteSelection}
      />,
    );

    const input = getByTestId('select-text-input');
    expect(input.props.value).toBe(`Try this:\n\n${code}`);
    const start = input.props.value.indexOf('def __init__');
    act(() => {
      input.props.onSelectionChange({
        nativeEvent: { selection: { start, end: input.props.value.length } },
      });
    });
    fireEvent.press(getByTestId('select-text-quote'));

    expect(onQuoteSelection).toHaveBeenCalledWith('def __init__(self):');
  });

  it('shows the words of the answer rather than its markup', () => {
    const { getByText } = render(
      <SelectTextSheet
        visible
        text={'Tom &amp; Jerry[^1] said <b>hi</b> with $x^2$\n\n[^1]: A note.'}
        onClose={jest.fn()}
      />,
    );

    expect(
      getByText('Tom & Jerry\u00b9 said hi with x^2\n\n1. A note.', { normalizer: (t) => t }),
    ).toBeTruthy();
  });

  it('shows what a person wrote exactly as they wrote it', () => {
    const { getByText } = render(
      <SelectTextSheet visible verbatim text="Keep *my* stars" onClose={jest.fn()} />,
    );

    expect(getByText('Keep *my* stars')).toBeTruthy();
  });
});
