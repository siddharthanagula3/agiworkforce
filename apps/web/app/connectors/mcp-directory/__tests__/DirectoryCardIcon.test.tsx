import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DirectoryCardIcon } from '../DirectoryCardIcon';

const SRC = '/api/connectors/directory/icon?id=brighthire';

function stubImageState(complete: boolean, naturalWidth: number): () => void {
  const completeDescriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    'complete',
  );
  const widthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    'naturalWidth',
  );
  Object.defineProperty(HTMLImageElement.prototype, 'complete', {
    configurable: true,
    get: () => complete,
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => naturalWidth,
  });
  return () => {
    if (completeDescriptor) {
      Object.defineProperty(HTMLImageElement.prototype, 'complete', completeDescriptor);
    }
    if (widthDescriptor) {
      Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', widthDescriptor);
    }
  };
}

describe('DirectoryCardIcon', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    cleanup();
    restore?.();
    restore = null;
  });

  it('shows the monogram when the image errors', () => {
    const { container } = render(<DirectoryCardIcon src={SRC} monogram="B" />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('shows the monogram when the image already finished empty at mount', () => {
    restore = stubImageState(true, 0);

    const { container } = render(<DirectoryCardIcon src={SRC} monogram="B" />);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('keeps a loaded image', () => {
    restore = stubImageState(true, 28);

    const { container } = render(<DirectoryCardIcon src={SRC} monogram="B" />);

    expect(container.querySelector('img')?.getAttribute('src')).toBe(SRC);
    expect(screen.queryByText('B')).toBeNull();
  });
});
