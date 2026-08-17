import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StepsCard, clampToSentence } from './StepsCard';

const LONG_PREAMBLE =
  'Follow these steps to get your new laptop online before your first day. ' +
  'Reach out to your manager or IT if you hit any blockers along the way. ' +
  'The VPN client has to be installed before you can reach internal tools.';

const GUIDE = `# Laptop setup

${LONG_PREAMBLE}

## Step 1: Unbox the laptop
- Check the accessories against the packing list

## Step 2: Sign in
- Use your corporate account
`;

const SHORT_GUIDE = `# Laptop setup

Two quick things before you start.

## Step 1: Unbox the laptop
- Check the accessories against the packing list

## Step 2: Sign in
- Use your corporate account
`;

function descriptionText(): string {
  const paragraph = screen.getByText(/Follow these steps/);
  return paragraph.textContent ?? '';
}

describe('StepsCard description truncation', () => {
  it('stops the preamble on a sentence instead of mid-phrase', () => {
    render(<StepsCard content={GUIDE} />);

    const shown = descriptionText();
    expect(shown).toBe(
      'Follow these steps to get your new laptop online before your first day. ' +
        'Reach out to your manager or IT if you hit any blockers along the way. …',
    );
    expect(shown).not.toContain('VPN client');
  });

  it('keeps the full preamble reachable on the truncated element', () => {
    render(<StepsCard content={GUIDE} />);

    expect(screen.getByText(/Follow these steps/)).toHaveAttribute('title', LONG_PREAMBLE);
  });

  it('renders a short preamble whole, with no ellipsis or tooltip', () => {
    render(<StepsCard content={SHORT_GUIDE} />);

    const paragraph = screen.getByText(/Two quick things/);
    expect(paragraph.textContent).toBe('Two quick things before you start.');
    expect(paragraph).not.toHaveAttribute('title');
  });
});

describe('StepsCard checklist persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/chat/conversation-1');
  });

  async function tickFirstStep(): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: 'Mark step 1 complete' }));
    expect(screen.getByRole('button', { name: 'Mark step 1 incomplete' })).toBeInTheDocument();
  }

  it('keeps two byte-identical checklists in one conversation independent', async () => {
    render(<StepsCard content={SHORT_GUIDE} messageId="message-a" />);
    await tickFirstStep();
    cleanup();

    render(<StepsCard content={SHORT_GUIDE} messageId="message-b" />);

    expect(screen.getByRole('button', { name: 'Mark step 1 complete' })).toBeInTheDocument();
  });

  it('restores the same checklist on remount', async () => {
    render(<StepsCard content={SHORT_GUIDE} messageId="message-a" />);
    await tickFirstStep();
    cleanup();

    render(<StepsCard content={SHORT_GUIDE} messageId="message-a" />);

    expect(screen.getByRole('button', { name: 'Mark step 1 incomplete' })).toBeInTheDocument();
  });

  it('falls back to a content-derived key when no message id is supplied', async () => {
    render(<StepsCard content={SHORT_GUIDE} />);
    await tickFirstStep();
    cleanup();

    render(<StepsCard content={SHORT_GUIDE} />);

    expect(screen.getByRole('button', { name: 'Mark step 1 incomplete' })).toBeInTheDocument();
  });
});

describe('clampToSentence', () => {
  it('returns text within budget untouched', () => {
    const short = 'Two short steps. Nothing more to say.';
    expect(clampToSentence(short)).toBe(short);
  });

  it('never cuts a word in half when one sentence exceeds the budget', () => {
    const runOn = `${'word '.repeat(60)}end`.trim();
    const clamped = clampToSentence(runOn);
    const visible = clamped.replace(/…$/, '');

    expect(clamped.endsWith('…')).toBe(true);
    expect(runOn.startsWith(visible)).toBe(true);
    expect(runOn.charAt(visible.length)).toBe(' ');
  });

  it('does not leave a dangling comma at the cut', () => {
    const runOn = `${'alpha beta gamma delta, '.repeat(12)}omega.`;
    expect(clampToSentence(runOn)).not.toMatch(/[,;:]…$/);
  });
});
