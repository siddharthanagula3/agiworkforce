/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Share } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { detectCardType } from '@agiworkforce/unified-chat/message-format';
import { parseRecipe, parseSteps } from '@agiworkforce/unified-chat/message-format-cards';
import {
  MessageFormatCard,
  stepsProgressKey,
} from '@/src/features/chat/components/MessageFormatCard';
import { storage } from '@/lib/mmkv';

jest.mock('@/lib/mmkv', () => {
  const values = new Map<string, string>();
  return {
    whenMmkvReady: jest.fn((cb) => cb()),
    rehydrateWhenMmkvReady: jest.fn((store) => {
      if (store?.persist?.rehydrate) store.persist.rehydrate();
    }),
    mmkvStorage: {
      getItem: jest.fn().mockReturnValue(null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
    storage: {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
      delete: (key: string) => values.delete(key),
    },
  };
});

const mockMath = jest.fn();
jest.mock('@/src/features/chat/components/MathBlock', () => {
  const RN = require('react-native');
  return {
    MathBlock: (props: { latex: string; display: boolean }) => {
      mockMath(props);
      return <RN.Text testID="math-block">{props.latex}</RN.Text>;
    },
  };
});

const RECIPE = [
  '# Pancakes',
  '',
  'Servings: 4',
  '',
  '## Ingredients',
  '- 200g flour',
  '- 2 eggs',
  '',
  '## Instructions',
  '1. Mix everything',
  '2. Cook on a hot pan',
  '',
  '## Storage',
  '- Keeps for two days in the fridge.',
].join('\n');

const STEPS = [
  '# Deploy the service',
  '',
  'Follow these steps to ship a release.',
  '',
  '## Step 1: Build the image',
  '- Run the build script',
  '',
  '## Step 2: Push the tag',
  '- Tag with the release number',
  '',
  '## Step 3: Roll out',
  '- Watch the error rate',
].join('\n');

const COMPARISON = [
  '# Postgres vs MySQL',
  '',
  '## Postgres',
  '### Pros',
  '- Rich type system',
  '### Cons',
  '- Heavier to run',
  '',
  '## MySQL',
  '### Pros',
  '- Simple replication',
  '',
  '## Winner',
  'Overall, Postgres wins on correctness.',
].join('\n');

const CALCULATION = [
  '## Monthly burn',
  '',
  '$$burn = salaries + hosting$$',
  '',
  'Step 1: Salaries = 42000',
  'Step 2: Hosting = 3000',
  'Result: 45000 USD',
].join('\n');

function openCard(label: string) {
  fireEvent.press(screen.getByRole('button', { name: label }));
}

describe('MessageFormatCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.delete(stepsProgressKey('chat-1', 'answer-1'));
  });

  it('keeps the card closed under the answer until the reader asks for it', () => {
    render(
      <MessageFormatCard
        content={RECIPE}
        cardType="recipe"
        conversationId="chat-1"
        messageId="answer-1"
      />,
    );
    expect(detectCardType(RECIPE)).toBe('recipe');
    expect(screen.queryByTestId('message-format-card.recipe')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'View as recipe' });
    expect(toggle).toHaveStyle({ minHeight: 44 });

    openCard('View as recipe');
    expect(screen.getByTestId('message-format-card.recipe')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Hide recipe view' })).toBeOnTheScreen();

    openCard('Hide recipe view');
    expect(screen.queryByTestId('message-format-card.recipe')).toBeNull();
  });

  it('shows the recipe parts web shows and lets the reader tick off ingredients', () => {
    const recipe = parseRecipe(RECIPE);
    render(
      <MessageFormatCard
        content={RECIPE}
        cardType="recipe"
        conversationId="chat-1"
        messageId="answer-1"
      />,
    );
    openCard('View as recipe');

    expect(screen.getByText('Pancakes')).toBeOnTheScreen();
    expect(screen.getByText(`Servings: ${recipe.servings}`)).toBeOnTheScreen();
    expect(screen.getByText('Ingredients (0/2)')).toBeOnTheScreen();
    for (const step of recipe.instructions) expect(screen.getByText(step)).toBeOnTheScreen();
    expect(screen.getAllByTestId('card-extra-section')).toHaveLength(
      recipe.extraSections.filter((section) => section.lines.length > 0).length,
    );

    const flour = screen.getByRole('checkbox', { name: 'Mark 200g flour as gathered' });
    expect(flour).toHaveStyle({ minHeight: 44 });
    fireEvent.press(flour);
    expect(flour).toBeChecked();
    expect(screen.getByText('Ingredients (1/2)')).toBeOnTheScreen();
  });

  it('keeps ticked steps for this answer after the card is closed and opened again', () => {
    const steps = parseSteps(STEPS);
    const view = render(
      <MessageFormatCard
        content={STEPS}
        cardType="steps"
        conversationId="chat-1"
        messageId="answer-1"
      />,
    );
    openCard('View as steps');
    expect(screen.getByTestId('message-format-card.steps-progress')).toHaveTextContent(
      `0/${steps.steps.length} · 0% complete`,
    );

    fireEvent.press(screen.getByRole('checkbox', { name: 'Mark step 2 complete' }));
    expect(screen.getByRole('checkbox', { name: 'Mark step 2 incomplete' })).toBeChecked();
    expect(storage.getString(stepsProgressKey('chat-1', 'answer-1'))).toBe('[1]');
    view.unmount();

    render(
      <MessageFormatCard
        content={STEPS}
        cardType="steps"
        conversationId="chat-1"
        messageId="answer-1"
      />,
    );
    openCard('View as steps');
    expect(screen.getByRole('checkbox', { name: 'Mark step 2 incomplete' })).toBeChecked();

    for (const index of [1, 3]) {
      fireEvent.press(screen.getByRole('checkbox', { name: `Mark step ${index} complete` }));
    }
    expect(screen.getByTestId('message-format-card.steps-progress')).toHaveTextContent(
      'All steps completed!',
    );
  });

  it('opens a step’s details on tap, with the first step open to begin with', () => {
    render(
      <MessageFormatCard
        content={STEPS}
        cardType="steps"
        conversationId="chat-1"
        messageId="answer-1"
      />,
    );
    openCard('View as steps');
    expect(screen.getByText('Run the build script')).toBeOnTheScreen();
    expect(screen.queryByText('Tag with the release number')).toBeNull();

    fireEvent.press(screen.getByText('Push the tag'));
    expect(screen.getByText('Tag with the release number')).toBeOnTheScreen();
    expect(screen.queryByText('Run the build script')).toBeNull();
  });

  it('shows both sides of a comparison and names the winner', () => {
    render(
      <MessageFormatCard
        content={COMPARISON}
        cardType="comparison"
        conversationId="chat-1"
        messageId="answer-1"
      />,
    );
    openCard('View as comparison');

    expect(screen.getByText('Postgres vs MySQL')).toBeOnTheScreen();
    expect(screen.getByText('Postgres · Winner')).toBeOnTheScreen();
    expect(screen.getByText('Rich type system')).toBeOnTheScreen();
    expect(screen.getByText('Heavier to run')).toBeOnTheScreen();
    expect(screen.getByText('Simple replication')).toBeOnTheScreen();
  });

  it('draws formulas as math, and copies or shares the exact result', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    render(
      <MessageFormatCard
        content={CALCULATION}
        cardType="calculation"
        conversationId="chat-1"
        messageId="answer-1"
      />,
    );
    openCard('View as calculation');

    expect(mockMath).toHaveBeenCalledWith(
      expect.objectContaining({ latex: 'burn = salaries + hosting', display: true }),
    );
    const result = screen.getByTestId('message-format-card.result');
    expect(result.props.children).toContain('45000');

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy result' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(result.props.children);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Share result' }));
    expect(share).toHaveBeenCalledWith({ message: result.props.children });

    fireEvent.press(screen.getByRole('button', { name: 'Toggle calculation steps' }));
    expect(screen.getByText('Salaries')).toBeOnTheScreen();
    share.mockRestore();
  });

  it('draws inline math in the calculation prose instead of printing its source', () => {
    const content = [
      '## Right triangle formula',
      '',
      'For a right triangle, $a^2+b^2=c^2$ holds.',
      '',
      '$$c = \\sqrt{a^2+b^2}$$',
      '',
      'Step 1: Square the legs = $3^2+4^2$',
      '',
      '## Note',
      'It needs $C = 90^\\circ$.',
    ].join('\n');
    render(
      <MessageFormatCard
        content={content}
        cardType="calculation"
        conversationId="chat-1"
        messageId="answer-1"
      />,
    );
    openCard('View as calculation');
    fireEvent.press(screen.getByRole('button', { name: 'Toggle calculation steps' }));

    for (const latex of ['a^2+b^2=c^2', '3^2+4^2', 'C = 90^\\circ']) {
      expect(mockMath).toHaveBeenCalledWith(expect.objectContaining({ latex, display: false }));
    }
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it('draws only the mathematics when the answer also holds a code fence', () => {
    const content = [
      '## Totals',
      '',
      '$$a + b = c$$',
      '',
      '```ts:sec/a.ts',
      'const total: number = items.length;',
      '```',
      '',
      '~~~python',
      'result = 1 + 2',
      '~~~',
    ].join('\n');
    render(
      <MessageFormatCard
        content={content}
        cardType="calculation"
        conversationId="chat-1"
        messageId="answer-1"
      />,
    );
    openCard('View as calculation');

    expect(mockMath).toHaveBeenCalledWith(expect.objectContaining({ latex: 'a + b = c' }));
    expect(screen.queryByTestId('message-format-card.result')).toBeNull();
    expect(screen.queryByText(/`|~~~|const|items\.length|result = /)).toBeNull();
  });

  it('drops a code fence that is never closed and keeps the prose after a closed one', () => {
    const content = [
      '## Sum',
      '',
      '````',
      '```',
      'not a close',
      '````',
      '',
      'Total: 7 apples',
      '',
      '```js',
      'const unfinished = 1;',
    ].join('\n');
    render(
      <MessageFormatCard
        content={content}
        cardType="calculation"
        conversationId="chat-1"
        messageId="answer-1"
      />,
    );
    openCard('View as calculation');

    expect(screen.getByTestId('message-format-card.result').props.children).toContain('7');
    expect(screen.queryByText(/`|not a close|unfinished/)).toBeNull();
  });

  function openCalculation(content: string) {
    render(
      <MessageFormatCard
        content={content}
        cardType="calculation"
        conversationId="chat-1"
        messageId="answer-1"
      />,
    );
    openCard('View as calculation');
  }

  it('drops a code fence nested under a list item indented four columns', () => {
    openCalculation(
      [
        '## Totals',
        '',
        '$$a + b = c$$',
        '',
        '1. Compute:',
        '    ```python',
        '    total = 1 + 2',
        '    ```',
      ].join('\n'),
    );

    expect(mockMath).toHaveBeenCalledWith(expect.objectContaining({ latex: 'a + b = c' }));
    expect(screen.queryByTestId('message-format-card.result')).toBeNull();
    expect(screen.queryByText(/`|python|total = 1 \+ 2/)).toBeNull();
  });

  it('drops a code fence nested in a block quote', () => {
    openCalculation(
      ['## Totals', '', '$$a + b = c$$', '', '> ```', '> total = 1 + 2', '> ```'].join('\n'),
    );

    expect(mockMath).toHaveBeenCalledWith(expect.objectContaining({ latex: 'a + b = c' }));
    expect(screen.queryByTestId('message-format-card.result')).toBeNull();
    expect(screen.queryByText(/`|total = 1 \+ 2/)).toBeNull();
  });

  it('keeps the formula and the result after a line that only starts with three backticks', () => {
    openCalculation(
      [
        '## Totals',
        '',
        '```x = 5``` is the code form',
        '',
        '$$a + b = c$$',
        '',
        'Result: 9 apples',
      ].join('\n'),
    );

    expect(mockMath).toHaveBeenCalledWith(expect.objectContaining({ latex: 'a + b = c' }));
    expect(screen.getByTestId('message-format-card.result').props.children).toContain('9');
  });

  it('draws a math fence as a formula', () => {
    openCalculation(
      [
        '## Totals',
        '',
        '```math',
        'a + b = c',
        '```',
        '',
        '```latex-display',
        'x^2 = 4',
        '```',
      ].join('\n'),
    );

    expect(mockMath).toHaveBeenCalledWith(expect.objectContaining({ latex: 'a + b = c' }));
    expect(mockMath).toHaveBeenCalledWith(expect.objectContaining({ latex: 'x^2 = 4' }));
    expect(screen.queryByText(/`|latex-display/)).toBeNull();
  });

  it('offers no calculation view when the only calculation signal sits in a code fence', () => {
    render(
      <MessageFormatCard
        content={['## Calculation', '', '```', 'Total = 60', '```'].join('\n')}
        cardType="calculation"
        conversationId="chat-1"
        messageId="answer-1"
      />,
    );

    expect(screen.queryByRole('button', { name: 'View as calculation' })).toBeNull();
    expect(screen.queryByTestId('message-format-card')).toBeNull();
  });
});
