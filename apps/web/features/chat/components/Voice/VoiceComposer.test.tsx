import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VoiceComposer } from './VoiceComposer';

const DEVICE = 'Built-in Microphone';

function renderComposer(overrides: Partial<Parameters<typeof VoiceComposer>[0]> = {}) {
  const props = {
    value: '',
    muted: false,
    deviceName: DEVICE,
    dockOpen: false,
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onToggleMute: vi.fn(),
    onToggleDock: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  render(<VoiceComposer {...props} />);
  return props;
}

describe('VoiceComposer', () => {
  it('offers the four controls the voice bar carries', () => {
    renderComposer();

    expect(screen.getByLabelText('Open this chat panel')).toBeInTheDocument();
    expect(screen.getByTestId('voice-composer-field')).toHaveAttribute('placeholder', 'Type');
    expect(screen.getByTestId('voice-mute-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('voice-exit-button')).toBeInTheDocument();
  });

  it('names the input device in the microphone tooltip', () => {
    renderComposer();
    expect(screen.getByTestId('voice-mute-toggle')).toHaveAttribute(
      'title',
      `Turn off microphone, ${DEVICE}`,
    );
  });

  it('shows the muted microphone as pressed and offers to turn it back on', () => {
    renderComposer({ muted: true });

    const toggle = screen.getByTestId('voice-mute-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAccessibleName('Turn on microphone');
  });

  it('sends the typed text on Enter', async () => {
    const user = userEvent.setup();
    const props = renderComposer({ value: 'hello there' });

    await user.click(screen.getByTestId('voice-composer-field'));
    await user.keyboard('{Enter}');

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('toggles mute on Space only while the field is empty', async () => {
    const user = userEvent.setup();
    const empty = renderComposer();

    await user.click(screen.getByTestId('voice-composer-field'));
    await user.keyboard(' ');
    expect(empty.onToggleMute).toHaveBeenCalledTimes(1);
  });

  it('leaves Space alone once the field has text', async () => {
    const user = userEvent.setup();
    const typed = renderComposer({ value: 'draft' });

    await user.click(screen.getByTestId('voice-composer-field'));
    await user.keyboard(' ');
    expect(typed.onToggleMute).not.toHaveBeenCalled();
  });

  it('exits on Escape and on the round close control', async () => {
    const user = userEvent.setup();
    const props = renderComposer();

    await user.click(screen.getByTestId('voice-composer-field'));
    await user.keyboard('{Escape}');
    expect(props.onExit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('voice-exit-button'));
    expect(props.onExit).toHaveBeenCalledTimes(2);
  });
});
