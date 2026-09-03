import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddMarketplaceDialog } from '../AddMarketplaceDialog';
import type { DirectoryMarketplaceResult } from '../types';

afterEach(cleanup);

const RESULT: DirectoryMarketplaceResult = {
  id: 'source-1',
  name: 'Example marketplace',
  entries: [{ id: 'entry-1', name: 'Reviewer', description: 'Reviews pull requests' }],
};

const REPO_URL = 'https://github.com/example/plugins';

function renderDialog(props: Partial<Parameters<typeof AddMarketplaceDialog>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(RESULT);
  const onClose = vi.fn();
  render(<AddMarketplaceDialog open onClose={onClose} onSubmit={onSubmit} {...props} />);
  return { onSubmit, onClose };
}

async function openRepositoryForm() {
  fireEvent.click(screen.getByRole('button', { name: /Add from a repository/ }));
  return screen.findByLabelText('Repository url');
}

describe('AddMarketplaceDialog', () => {
  it('offers the repository choice and hides the curated one without a handler', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /Add from a repository/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Browse AGI sources/ })).toBeNull();
  });

  it('offers the curated choice when the surface supplies one', () => {
    const onBrowseSources = vi.fn();
    const { onClose } = renderDialog({ onBrowseSources });
    fireEvent.click(screen.getByRole('button', { name: /Browse AGI sources/ }));
    expect(onBrowseSources).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('closes from cancel without submitting', () => {
    const { onClose, onSubmit } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the submit control disabled until a url is typed', async () => {
    renderDialog();
    await openRepositoryForm();
    const submit = screen.getByRole('button', { name: 'Sync marketplace' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Repository url'), { target: { value: REPO_URL } });
    expect(submit.disabled).toBe(false);
  });

  it('submits the url with an optional ref and lists the synced plugins', async () => {
    const { onSubmit } = renderDialog();
    await openRepositoryForm();
    fireEvent.change(screen.getByLabelText('Repository url'), { target: { value: REPO_URL } });
    fireEvent.change(screen.getByLabelText('Branch or tag (optional)'), {
      target: { value: 'main' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sync marketplace' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ repositoryUrl: REPO_URL, ref: 'main' }),
    );
    expect(await screen.findByText('Example marketplace')).toBeTruthy();
    expect(screen.getByText('Reviewer')).toBeTruthy();
  });

  it('omits the ref when it is left blank', async () => {
    const { onSubmit } = renderDialog();
    await openRepositoryForm();
    fireEvent.change(screen.getByLabelText('Repository url'), { target: { value: REPO_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Sync marketplace' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ repositoryUrl: REPO_URL }));
  });

  it('shows a failure inline and stays on the form', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Manifest invalid'));
    renderDialog({ onSubmit });
    await openRepositoryForm();
    fireEvent.change(screen.getByLabelText('Repository url'), { target: { value: REPO_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Sync marketplace' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Manifest invalid');
    expect(screen.getByLabelText('Repository url')).toBeTruthy();
  });

  it('reports a marketplace that synced no plugins', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ...RESULT, entries: [] });
    renderDialog({ onSubmit });
    await openRepositoryForm();
    fireEvent.change(screen.getByLabelText('Repository url'), { target: { value: REPO_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Sync marketplace' }));
    expect(await screen.findByText('This marketplace lists no plugins yet.')).toBeTruthy();
  });

  it('confirms before removing a marketplace it just added', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onRemove });
    await openRepositoryForm();
    fireEvent.change(screen.getByLabelText('Repository url'), { target: { value: REPO_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Sync marketplace' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove marketplace' }));
    expect(await screen.findByText('Remove marketplace?')).toBeTruthy();
    expect(onRemove).not.toHaveBeenCalled();
    const dialogButtons = screen.getAllByRole('button', { name: 'Remove marketplace' });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]!);
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('source-1'));
  });
});
