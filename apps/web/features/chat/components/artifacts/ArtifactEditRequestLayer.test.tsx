import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ArtifactPickerSelection } from '@/lib/artifact-sandbox';
import {
  ArtifactEditRequestLayer,
  CANCEL_EDIT_REQUEST,
  DESCRIBE_CHANGE_PLACEHOLDER,
  SELECT_CONTENT_PROMPT,
  SEND_EDIT_REQUEST_LABEL,
} from './ArtifactEditRequestLayer';

const SELECTION: ArtifactPickerSelection = {
  selector: 'main > h1.title',
  text: 'Welcome',
  html: '<h1 class="title">Welcome</h1>',
  rect: { x: 20, y: 30, width: 200, height: 40 },
};

function renderLayer(selection: ArtifactPickerSelection | null = null) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ArtifactEditRequestLayer selection={selection} onSubmit={onSubmit} onCancel={onCancel} />,
  );
  return { ...view, onSubmit, onCancel };
}

describe('ArtifactEditRequestLayer', () => {
  it('shows the selection pill with Cancel and no input until an element is picked', () => {
    renderLayer();

    expect(screen.getByTestId('artifact-edit-request-pill')).toHaveTextContent(
      SELECT_CONTENT_PROMPT,
    );
    expect(screen.getByRole('button', { name: CANCEL_EDIT_REQUEST })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(DESCRIBE_CHANGE_PLACEHOLDER)).toBeNull();
  });

  it('cancels from the pill button and from Escape anywhere in the window', () => {
    const { onCancel } = renderLayer();

    fireEvent.click(screen.getByRole('button', { name: CANCEL_EDIT_REQUEST }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('stops listening for Escape once it unmounts', () => {
    const { onCancel, unmount } = renderLayer();
    unmount();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('asks for the change next to the picked element and focuses the field', () => {
    renderLayer(SELECTION);

    expect(screen.getByPlaceholderText(DESCRIBE_CHANGE_PLACEHOLDER)).toHaveFocus();
    expect(screen.getByRole('button', { name: SEND_EDIT_REQUEST_LABEL })).toBeDisabled();
  });

  it('submits the trimmed instruction and refuses an empty one', () => {
    const { onSubmit } = renderLayer(SELECTION);
    const field = screen.getByPlaceholderText(DESCRIBE_CHANGE_PLACEHOLDER);

    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.submit(field.closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: '  make it bigger  ' } });
    fireEvent.click(screen.getByRole('button', { name: SEND_EDIT_REQUEST_LABEL }));
    expect(onSubmit).toHaveBeenCalledWith('make it bigger');
  });

  it('clears the field when a different element is picked', () => {
    const { rerender, onSubmit, onCancel } = renderLayer(SELECTION);
    fireEvent.change(screen.getByPlaceholderText(DESCRIBE_CHANGE_PLACEHOLDER), {
      target: { value: 'old text' },
    });

    rerender(
      <ArtifactEditRequestLayer
        selection={{ ...SELECTION, selector: 'main > p' }}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByPlaceholderText(DESCRIBE_CHANGE_PLACEHOLDER)).toHaveValue('');
  });
});
