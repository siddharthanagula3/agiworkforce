import { describe, it, expect } from 'vitest';
import {
  parseDeck,
  replaceShapesBlock,
  serializeDeck,
  slideSegments,
} from '@agiworkforce/unified-chat/deck-model';
import { SHAPE_KINDS, newShape, parseShapes, serializeShapes } from './deck-shapes';
import {
  DECK_THEMES,
  brandThemeMeta,
  contrastRatio,
  resolveDeckTheme,
  themeMeta,
} from './deck-themes';

const DECK = '# Title\n\nIntro\n\n---\n\n## Second\n\n- a\n- b\n\n---\n\n## Third\n\nEnd';

describe('deck model', () => {
  it('round-trips slides and a theme line', () => {
    const deck = parseDeck(DECK);
    expect(deck.slides).toHaveLength(3);
    const themed = serializeDeck({ ...deck, meta: themeMeta(deck.meta, 'midnight') });
    expect(themed.startsWith('<!-- deck theme=midnight -->')).toBe(true);
    const again = parseDeck(themed);
    expect(again.meta['theme']).toBe('midnight');
    expect(again.slides).toEqual(deck.slides);
  });

  it('keeps one shapes block per slide', () => {
    const first = newShape('rect', []);
    const second = newShape('oval', [first]);
    let slide = replaceShapesBlock('## Plan', serializeShapes([first]));
    slide = replaceShapesBlock(slide, serializeShapes([first, second]));
    const blocks = slideSegments(slide).filter((segment) => segment.kind === 'shapes');
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    const source = block.kind === 'markdown' ? '' : block.source;
    expect(parseShapes(source).map((shape) => shape.id)).toEqual(['shape-1', 'shape-2']);
    expect(replaceShapesBlock(slide, null)).toBe('## Plan');
  });

  it('round-trips every shape kind through the saved block', () => {
    const shapes = SHAPE_KINDS.reduce<ReturnType<typeof newShape>[]>(
      (list, kind) => [...list, newShape(kind, list)],
      [],
    );
    expect(parseShapes(serializeShapes(shapes)).map((shape) => shape.kind)).toEqual([
      ...SHAPE_KINDS,
    ]);
  });

  it('drops malformed shapes and clamps positions', () => {
    const shapes = parseShapes('{"shapes":[{"kind":"rect","x":500,"y":-4},{"kind":"star"}]}');
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.x).toBe(100);
    expect(shapes[0]!.y).toBe(0);
  });
});

describe('deck themes', () => {
  it('keeps body, muted and accent text readable on every theme', () => {
    for (const theme of DECK_THEMES) {
      expect(contrastRatio(theme.text, theme.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.muted, theme.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.accent, theme.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.text, theme.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('repairs a brand whose text would be unreadable', () => {
    const theme = resolveDeckTheme(
      brandThemeMeta({
        name: 'Acme',
        background: '#ffffff',
        text: '#eeeeee',
        accent: '#fafafa',
        headingFont: 'serif',
        bodyFont: 'sans',
      }),
    );
    expect(theme.text).toBe('#000000');
    expect(theme.accent).toBe('#000000');
    expect(theme.headingFont).toBe('serif');
    expect(contrastRatio(theme.muted, theme.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('falls back to the default theme for an unknown id', () => {
    expect(resolveDeckTheme({ theme: 'nope' }).id).toBe('paper');
  });
});
