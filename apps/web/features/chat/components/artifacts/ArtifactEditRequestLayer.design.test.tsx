import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ArtifactPickerSelection } from '@/lib/artifact-sandbox';
import {
  ArtifactEditRequestLayer,
  COMMENT_ON_ELEMENT_LABEL,
  REPLACE_IMAGE_LABEL,
} from './ArtifactEditRequestLayer';

const IMAGE: ArtifactPickerSelection = {
  selector: 'main > img.hero',
  text: '',
  html: '<img class="hero" src="hero.png">',
  rect: { x: 0, y: 0, width: 100, height: 50 },
};

const HEADING: ArtifactPickerSelection = {
  ...IMAGE,
  selector: 'h1',
  html: '<h1>Hi</h1>',
  text: 'Hi',
};

describe('ArtifactEditRequestLayer · design actions', () => {
  it('offers Replace image only for a picked image', () => {
    const onReplaceImage = vi.fn();
    const { rerender } = render(
      <ArtifactEditRequestLayer
        selection={HEADING}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onReplaceImage={onReplaceImage}
      />,
    );
    expect(screen.queryByRole('button', { name: REPLACE_IMAGE_LABEL })).toBeNull();
    rerender(
      <ArtifactEditRequestLayer
        selection={IMAGE}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onReplaceImage={onReplaceImage}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: REPLACE_IMAGE_LABEL }));
    expect(onReplaceImage).toHaveBeenCalledWith(IMAGE);
  });

  it('pins a comment to the picked element with its position', () => {
    const onComment = vi.fn();
    render(
      <ArtifactEditRequestLayer
        selection={HEADING}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onComment={onComment}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: COMMENT_ON_ELEMENT_LABEL }));
    expect(onComment).toHaveBeenCalledWith(expect.objectContaining({ selection: HEADING }));
  });
});
