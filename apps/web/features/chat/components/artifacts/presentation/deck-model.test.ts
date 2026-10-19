import { describe, it, expect } from 'vitest';
import {
  insertSlide,
  joinEditedSlide,
  moveSlide,
  parseDeck,
  removeSlide,
  replaceShapesBlock,
  replaceVisualBlock,
  serializeDeck,
  slideSegments,
  slideTitle,
  splitSlideForEditing,
} from './deck-model';
import { newShape, parseShapes, serializeShapes } from './deck-shapes';
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

  it('quotes meta values that hold spaces', () => {
    const content = serializeDeck({
      meta: { theme: 'custom', name: 'Acme Corp' },
      slides: ['# A'],
    });
    expect(parseDeck(content).meta['name']).toBe('Acme Corp');
  });

  it('adds, moves and removes slides without losing the last one', () => {
    let deck = parseDeck(DECK);
    deck = insertSlide(deck, 0, '## Inserted');
    expect(deck.slides[1]).toBe('## Inserted');
    deck = moveSlide(deck, 1, 0);
    expect(deck.slides[0]).toBe('## Inserted');
    expect(removeSlide({ meta: {}, slides: ['only'] }, 0).slides).toEqual(['only']);
  });

  it('splits visual blocks out of the text and puts them back', () => {
    const slide = '## Sales\n\nUp this year\n\n```chart\n{"data":[{"x":"a","y":1}]}\n```';
    const segments = slideSegments(slide);
    expect(segments.map((segment) => segment.kind)).toEqual(['markdown', 'chart']);
    const { text, visuals } = splitSlideForEditing(slide);
    expect(text).toBe('## Sales\n\nUp this year');
    expect(joinEditedSlide('## Revenue', visuals)).toBe(
      '## Revenue\n\n```chart\n{"data":[{"x":"a","y":1}]}\n```',
    );
    const chart = segments[1]!;
    expect(chart.kind).toBe('chart');
    if (chart.kind !== 'markdown')
      expect(replaceVisualBlock(slide, chart.start, null)).toBe('## Sales\n\nUp this year');
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

  it('names a slide by its heading', () => {
    expect(slideTitle('## **Roadmap**\n\ntext', 0)).toBe('Roadmap');
    expect(slideTitle('', 4)).toBe('Slide 5');
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
