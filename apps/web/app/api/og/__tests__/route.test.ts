import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  ImageResponse: vi.fn(function (this: { element: unknown; options: unknown }, element, options) {
    this.element = element;
    this.options = options;
  }),
}));

vi.mock('next/og', () => ({ ImageResponse: mocks.ImageResponse }));

import { GET } from '../route';

describe('GET /api/og', () => {
  it('renders the 1200x630 brand card', () => {
    const response = GET() as unknown as { element: ReactElement; options: unknown };

    expect(mocks.ImageResponse).toHaveBeenCalledTimes(1);
    expect(response.options).toEqual({ width: 1200, height: 630 });

    const markup = renderToStaticMarkup(response.element);
    expect(markup).toContain('AGI');
    expect(markup).toContain('One AI workspace across models and tools.');
    expect(markup).toContain('agiworkforce.com');
    expect(markup.match(/<line /g)).toHaveLength(12);
  });
});
