import { render, screen } from '@testing-library/react';
import VoiceSettingsPage from './page';

describe('Web Voice settings', () => {
  it('shows working dictation and a truthful managed-voice boundary without inert controls', () => {
    render(<VoiceSettingsPage />);

    expect(screen.getByText('Composer dictation works today')).toBeInTheDocument();
    expect(screen.getByText('Managed voice is not available')).toBeInTheDocument();
    expect(
      screen.getByText(/This page does not show disabled settings that the runtime cannot consume/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Not available yet')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn about BYOK' })).toHaveAttribute('href', '/byok');
  });
});
