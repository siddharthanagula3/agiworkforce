import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SyncSettingsPage from './page';

describe('/settings/sync', () => {
  it('reports live Desktop Cloud sync without implying Local or BYOK egress', () => {
    render(<SyncSettingsPage />);

    expect(screen.getByText('Settings and chat history sync (Desktop Cloud)')).toBeInTheDocument();
    expect(screen.getAllByText('Live')).toHaveLength(2);
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Desktop Local and BYOK modes keep chat and settings on your machine/),
    ).toBeInTheDocument();
  });
});
