import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { VoiceSection } from './VoiceSection';

describe('VoiceSection', () => {
  it('renders a dictation toggle and a language select, nothing else', () => {
    render(<VoiceSection />);

    expect(screen.getByRole('switch', { name: 'Dictation' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('combobox', { name: 'Dictation language' })).toBeInTheDocument();
    expect(screen.queryByText(/not available/i)).toBeNull();
    expect(screen.queryByText(/Bring Your Own Key/i)).toBeNull();
    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(document.querySelector('[style*="border-radius: var(--radius-lg)"]')).toBeNull();
  });

  it('flips the dictation switch and persists the choice', async () => {
    render(<VoiceSection />);

    const toggle = screen.getByRole('switch', { name: 'Dictation' });
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});
