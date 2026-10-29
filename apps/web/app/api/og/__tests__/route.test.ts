import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { APP_NAV_DESTINATIONS } from '@shared/components/layout/app-nav-items';

const mocks = vi.hoisted(() => ({
  ImageResponse: vi.fn(function (this: { element: unknown; options: unknown }, element, options) {
    this.element = element;
    this.options = options;
  }),
}));

vi.mock('next/og', () => ({ ImageResponse: mocks.ImageResponse }));

import { OG_ACTION, OG_DOMAIN, OG_HEADLINE, OG_HEADLINE_CLOSE, OG_NAV } from '../Card';
import { GET, OG_FONT_FILES } from '../route';

describe('GET /api/og', () => {
  it('renders the 1200x630 card with its copy and every font it draws with', async () => {
    const response = (await GET()) as unknown as {
      element: ReactElement;
      options: {
        width: number;
        height: number;
        fonts: Array<{ name: string; weight: number; data: Buffer }>;
      };
    };

    expect(mocks.ImageResponse).toHaveBeenCalledTimes(1);
    expect(response.options.width).toBe(1200);
    expect(response.options.height).toBe(630);
    expect(response.options.fonts.map((font) => `${font.name} ${font.weight}`)).toEqual(
      OG_FONT_FILES.map((font) => `${font.name} ${font.weight}`),
    );
    for (const font of response.options.fonts) {
      expect(font.data.byteLength).toBeGreaterThan(10_000);
    }

    const markup = renderToStaticMarkup(response.element);
    for (const line of [...OG_HEADLINE, OG_HEADLINE_CLOSE, OG_ACTION, OG_DOMAIN]) {
      expect(markup).toContain(line.replace('&', '&amp;'));
    }
    expect(markup).toContain('ChatGPT, Claude,');
    expect(markup.match(/data:image\/png;base64,/g)).toHaveLength(3);
    expect(markup).not.toMatch(/<line[\s>/]/);
    expect(markup).not.toContain('Ask anything');
  });

  it('draws the rail from the app navigation, without admin or health entries', () => {
    const expected = APP_NAV_DESTINATIONS.filter(
      (destination) => !destination.adminOnly && !destination.requiresHealthSpace,
    ).map((destination) => destination.label);

    expect(OG_NAV).toEqual(expected);
    expect(OG_NAV[0]).toBe('Chat');
  });
});
