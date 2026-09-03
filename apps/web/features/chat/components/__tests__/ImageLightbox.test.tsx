import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ImageLightbox } from '../ImageLightbox';

const IMAGES = [
  { src: 'https://example.test/a.png', alt: 'first', downloadFilename: 'a.png' },
  { src: 'https://example.test/b.png', alt: 'second', downloadFilename: 'b.png' },
  { src: 'https://example.test/c.png', alt: 'third', downloadFilename: 'c.png' },
];

const shownSrc = () => screen.getByRole('img').getAttribute('src');

describe('ImageLightbox, single image', () => {
  it('renders the image without navigation chrome', () => {
    render(<ImageLightbox images={[IMAGES[0]!]} onClose={vi.fn()} />);

    expect(shownSrc()).toBe(IMAGES[0]!.src);
    expect(screen.queryByLabelText('Next image')).toBeNull();
    expect(screen.queryByLabelText('Previous image')).toBeNull();
    expect(screen.queryByText(/of 1/)).toBeNull();
  });
});

describe('ImageLightbox, paging', () => {
  it('opens on the clicked image, not the first one', () => {
    render(<ImageLightbox images={IMAGES} initialIndex={2} onClose={vi.fn()} />);

    expect(shownSrc()).toBe(IMAGES[2]!.src);
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
  });

  it('moves forward and back through the set', () => {
    render(<ImageLightbox images={IMAGES} initialIndex={0} onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Next image'));
    expect(shownSrc()).toBe(IMAGES[1]!.src);

    fireEvent.click(screen.getByLabelText('Previous image'));
    expect(shownSrc()).toBe(IMAGES[0]!.src);
  });

  it('wraps in both directions rather than dead-ending', () => {
    render(<ImageLightbox images={IMAGES} initialIndex={0} onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Previous image'));
    expect(shownSrc()).toBe(IMAGES[2]!.src);

    fireEvent.click(screen.getByLabelText('Next image'));
    expect(shownSrc()).toBe(IMAGES[0]!.src);
  });

  it('pages with the arrow keys', () => {
    render(<ImageLightbox images={IMAGES} initialIndex={0} onClose={vi.fn()} />);

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(shownSrc()).toBe(IMAGES[1]!.src);

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(shownSrc()).toBe(IMAGES[0]!.src);
  });

  it('resets the zoom when the image changes', () => {
    render(<ImageLightbox images={IMAGES} onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(screen.getByText('125%')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next image'));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});

describe('ImageLightbox, bad input', () => {
  it('clamps an out-of-range index instead of rendering nothing', () => {
    render(<ImageLightbox images={IMAGES} initialIndex={99} onClose={vi.fn()} />);

    expect(shownSrc()).toBe(IMAGES[2]!.src);
  });

  it('renders nothing at all for an empty set', () => {
    const { container } = render(<ImageLightbox images={[]} onClose={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('ImageLightbox, close', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ImageLightbox images={IMAGES} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('downloads the image currently shown, not the one opened on', () => {
    const click = vi.fn();
    const realCreateElement = document.createElement.bind(document);
    const anchor = realCreateElement('a');
    anchor.click = click;
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockImplementation(((tag: string) =>
        tag === 'a' ? anchor : realCreateElement(tag)) as typeof document.createElement);

    render(<ImageLightbox images={IMAGES} initialIndex={0} onClose={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.click(screen.getByLabelText('Download image'));

    expect(anchor.getAttribute('download')).toBe('b.png');
    expect(click).toHaveBeenCalled();
    createElement.mockRestore();
  });
});
