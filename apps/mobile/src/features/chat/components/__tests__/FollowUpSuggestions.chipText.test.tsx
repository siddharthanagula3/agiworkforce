jest.mock('@/src/features/chat/services/followUps', () => ({
  fetchFollowUpSuggestions: jest.fn(),
}));

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FollowUpSuggestions } from '@/src/features/chat/components/FollowUpSuggestions';
import { followUpChipText } from '@/src/features/chat/utils/followUpChipText';

describe('followUpChipText', () => {
  it.each([
    [
      'How is the energy equation \\(E = mc^2\\) derived?',
      'How is the energy equation E = mc^2 derived?',
    ],
    ['Why does \\(\\sum_{i=1}^{3} I = 6\\) hold?', 'Why does \\sum_{i=1}^{3} I = 6 hold?'],
    ['Why is $x^2$ always positive?', 'Why is x^2 always positive?'],
    [
      'Can you explain **memory safety** in `unsafe` blocks?',
      'Can you explain memory safety in unsafe blocks?',
    ],
    ['Is it *really* faster than __Rust__?', 'Is it really faster than Rust?'],
    ['Is $5 cheaper than $10?', 'Is $5 cheaper than $10?'],
    [
      'What does the <script> tag do in zebrafish markup?',
      'What does the <script> tag do in zebrafish markup?',
    ],
    ['What does   the\nindex   do?', 'What does the index do?'],
    ['How do I center a <div>?', 'How do I center a <div>?'],
    ['What does the <a> tag do?', 'What does the <a> tag do?'],
    ['When should I use <p> or <span>?', 'When should I use <p> or <span>?'],
    ['Why close <script> with </script>?', 'Why close <script> with </script>?'],
    ['Why does <style> sit in <head>?', 'Why does <style> sit in <head>?'],
    [
      'When is a <br> tag or <!-- comment --> useful?',
      'When is a <br> tag or <!-- comment --> useful?',
    ],
    ['What does `<div>` do?', 'What does <div> do?'],
    ['Is **<details>** supported?', 'Is <details> supported?'],
    ['Is <https://example.com> still up?', 'Is https://example.com still up?'],
    ['Why is $a<b$ true?', 'Why is a<b true?'],
    [
      'What is the difference between $HOME and $PATH?',
      'What is the difference between $HOME and $PATH?',
    ],
    ['Why does \\( x \\) need padding?', 'Why does x need padding?'],
  ])('shows %p as %p', (raw, shown) => {
    expect(followUpChipText(raw)).toBe(shown);
  });
});

describe('FollowUpSuggestions chip text', () => {
  it('shows each chip as one plain line and asks the text the chip shows', () => {
    const onSelect = jest.fn();
    render(
      <FollowUpSuggestions
        conversationId="c-1"
        messageId="m-9"
        onSelect={onSelect}
        cached={[
          'How is the energy equation \\(E = mc^2\\) derived?',
          'Why is **bold** text used for `code` names?',
        ]}
      />,
    );

    expect(screen.getByText('How is the energy equation E = mc^2 derived?')).toBeTruthy();
    expect(screen.queryByText(/\\\(/)).toBeNull();
    fireEvent.press(screen.getByLabelText('Ask: Why is bold text used for code names?'));
    expect(onSelect).toHaveBeenCalledWith('Why is bold text used for code names?');
  });

  it('shows two suggestions that read the same once cleaned as one chip', () => {
    render(
      <FollowUpSuggestions
        conversationId="c-1"
        messageId="m-9"
        onSelect={jest.fn()}
        cached={['Why is **Rust** safe?', 'Why is Rust safe?']}
      />,
    );

    expect(screen.getAllByLabelText('Ask: Why is Rust safe?')).toHaveLength(1);
  });
});
