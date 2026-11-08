import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emitAppCommand } from '@shared/lib/app-commands';
import { PageFindBar } from '../components/PageFindBar';

function Harness() {
  return (
    <>
      <p>alpha beta alpha</p>
      <PageFindBar />
    </>
  );
}

describe('the page find bar', () => {
  it('opens from Find, steps the matches, and ignores its own buttons', async () => {
    render(<Harness />);

    await act(async () => {
      emitAppCommand('find');
    });
    const field = await screen.findByRole('textbox', { name: 'Find in page' });
    fireEvent.change(field, { target: { value: 'alpha' } });

    expect(await screen.findByText('1 of 2')).toBeTruthy();
    expect(document.getSelection()?.toString().toLowerCase()).toBe('alpha');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('2 of 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('1 of 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('2 of 2')).toBeTruthy();

    fireEvent.change(field, { target: { value: 'Next' } });
    expect(await screen.findByText('No matches')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('textbox', { name: 'Find in page' })).toBeNull();
  });

  it('steps back to the previous match when Find Previous is chosen', async () => {
    render(<Harness />);

    await act(async () => {
      emitAppCommand('find');
    });
    fireEvent.change(await screen.findByRole('textbox', { name: 'Find in page' }), {
      target: { value: 'alpha' },
    });
    expect(await screen.findByText('1 of 2')).toBeTruthy();

    await act(async () => {
      emitAppCommand('find-next');
    });
    expect(await screen.findByText('2 of 2')).toBeTruthy();

    await act(async () => {
      emitAppCommand('find-previous');
    });
    expect(await screen.findByText('1 of 2')).toBeTruthy();
  });

  it('opens on the first match from Find Next when the bar is closed', async () => {
    render(<Harness />);

    await act(async () => {
      emitAppCommand('find-next');
    });
    const field = await screen.findByRole('textbox', { name: 'Find in page' });
    fireEvent.change(field, { target: { value: 'beta' } });

    expect(await screen.findByText('1 of 1')).toBeTruthy();
  });
});
