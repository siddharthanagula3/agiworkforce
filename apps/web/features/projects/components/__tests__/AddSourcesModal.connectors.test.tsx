import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const connectorRelease = vi.hoisted(() => ({ released: false }));
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<TypesModule>()),
  connectorsReleased: () => connectorRelease.released,
}));

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { AddSourcesModal } from '../AddSourcesModal';

type TypesModule = typeof import('@agiworkforce/types');

function renderModal() {
  const onAddFromGoogleDrive = vi.fn(async () => 'added' as const);
  render(
    <AddSourcesModal
      open
      onClose={vi.fn()}
      onUploadFile={vi.fn(async () => undefined)}
      onUploadText={vi.fn(async () => undefined)}
      onAddFromGoogleDrive={onAddFromGoogleDrive}
    />,
  );
  return { onAddFromGoogleDrive };
}

afterEach(() => {
  cleanup();
  connectorRelease.released = false;
  router.push.mockReset();
});

describe('AddSourcesModal Google Drive while connectors are coming soon', () => {
  it('shows Google Drive locked and coming soon, and adds nothing from it', () => {
    const { onAddFromGoogleDrive } = renderModal();

    const drive = screen.getByRole('button', { name: 'Google Drive, Coming soon' });
    expect((drive as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(drive);
    expect(onAddFromGoogleDrive).not.toHaveBeenCalled();
    expect(screen.getByTestId('add-sources-connectors-coming-soon').textContent).toBe(
      'Connecting Gmail, Google Drive, Calendar and other apps is coming soon.',
    );
    expect(screen.queryByRole('button', { name: /Set up connectors/ })).toBeNull();
  });

  it('keeps the live Drive picker and its setup link once connectors are released', () => {
    connectorRelease.released = true;
    const { onAddFromGoogleDrive } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Google Drive/ }));
    expect(onAddFromGoogleDrive).toHaveBeenCalled();
    expect(screen.queryByTestId('add-sources-connectors-coming-soon')).toBeNull();
    expect(screen.getByRole('button', { name: /Set up connectors/ })).toBeTruthy();
  });
});
