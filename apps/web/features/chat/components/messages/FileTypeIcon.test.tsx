import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FileTypeIcon, extensionOf } from './FileTypeIcon';

describe('extensionOf', () => {
  it('extracts the lowercased extension from a path', () => {
    expect(extensionOf('src/components/Resume.HTML')).toBe('html');
    expect(extensionOf('report.pdf')).toBe('pdf');
    expect(extensionOf('/a/b/c/data.CSV')).toBe('csv');
  });

  it('returns empty string when there is no usable extension', () => {
    expect(extensionOf('Makefile')).toBe('');
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('trailingdot.')).toBe('');
    expect(extensionOf('')).toBe('');
  });
});

describe('FileTypeIcon', () => {
  it('renders the composite extension label for code-ish types', () => {
    const { container } = render(<FileTypeIcon filename="Resume_Final.html" />);
    expect(container.textContent).toContain('HTML');
  });

  it('renders the composite label for .py and .md', () => {
    expect(render(<FileTypeIcon filename="train.py" />).container.textContent).toContain('PY');
    expect(render(<FileTypeIcon filename="README.md" />).container.textContent).toContain('MD');
  });

  it('renders a single glyph (no text label) for csv/image/archive types', () => {
    expect(render(<FileTypeIcon filename="rows.csv" />).container.textContent).toBe('');
    expect(render(<FileTypeIcon filename="photo.png" />).container.textContent).toBe('');
    expect(render(<FileTypeIcon filename="bundle.zip" />).container.textContent).toBe('');
  });

  it('falls back to a derived label for unknown extensions and a bare glyph for none', () => {
    expect(render(<FileTypeIcon filename="model.bin" />).container.textContent).toContain('BIN');
    expect(render(<FileTypeIcon filename="Makefile" />).container.textContent).toBe('');
  });

  it('renders an svg icon element', () => {
    const { container } = render(<FileTypeIcon filename="x.py" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
