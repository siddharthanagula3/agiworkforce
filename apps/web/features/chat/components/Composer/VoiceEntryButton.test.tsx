import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VoiceEntryButton } from './VoiceEntryButton';
import { PHONE_TOUCH_HIT_AREA_CLASS } from './touchHitArea';

describe('VoiceEntryButton', () => {
  it('keeps its drawn size and widens only its touch area on a phone', () => {
    render(<VoiceEntryButton onStart={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Start voice mode' });
    expect(button).toHaveClass('relative', 'h-8', 'w-8', 'min-h-0');
    for (const token of PHONE_TOUCH_HIT_AREA_CLASS.split(' ')) expect(button).toHaveClass(token);
  });
});
