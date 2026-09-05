import { render, screen } from '@testing-library/react';
import VoiceSettingsPage from './page';

describe('Web Voice settings', () => {
  it('shows only the dictation toggle and language select that work on web', () => {
    render(<VoiceSettingsPage />);

    expect(screen.getByRole('switch', { name: 'Dictation' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Dictation language' })).toBeInTheDocument();
    expect(screen.queryByText('Managed voice is not available')).not.toBeInTheDocument();
    expect(screen.queryByText(/Bring Your Own Key/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Learn about BYOK' })).not.toBeInTheDocument();
  });
});
