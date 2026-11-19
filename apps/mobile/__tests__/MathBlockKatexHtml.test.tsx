/* eslint-disable @typescript-eslint/no-require-imports */

const mockWebViewProps: Array<Record<string, unknown>> = [];

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return {
    WebView: (props: Record<string, unknown>) => {
      mockWebViewProps.push(props);
      return require('react').createElement(View, { testID: 'math-webview' });
    },
  };
});

const mockTheme = { isDark: false, colors: {} as Record<string, string> };

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    useTheme: () => mockTheme,
    useThemeColors: () => mockTheme.colors,
  };
});

import vm from 'vm';
import { render, screen } from '@testing-library/react-native';
import { renderMathMarkup } from '@agiworkforce/unified-chat/math-markup';
import { getColors } from '../src/ui/theme/tokens';
import { MathBlock, buildMathDocument } from '../src/features/chat/components/MathBlock';
import { katexFontFamilies, katexStylesFor } from '../src/features/chat/components/mathKatexStyles';
import { speakMathMarkup } from '../src/features/chat/utils/mathSpeech';
import vendoredStyles from '../assets/katex-math-styles.json';

const { buildKatexMathStyles } = require('../scripts/vendor-katex-math-styles.cjs') as {
  buildKatexMathStyles: () => unknown;
};

function lastDocument(): string {
  const props = mockWebViewProps[mockWebViewProps.length - 1];
  return (props?.source as { html: string }).html;
}

function drawn(latex: string, display: boolean): string {
  render(<MathBlock latex={latex} display={display} />);
  return lastDocument();
}

function fontFace(family: string): string {
  return `@font-face{font-display:block;font-family:${family};`;
}

function embeddedFaces(html: string): string[] {
  return [
    ...html.matchAll(
      /@font-face\{font-display:block;font-family:(\w+);font-style:(\w+);font-weight:(\w+);/g,
    ),
  ]
    .map(([, family, style, weight]) => `${family} ${style} ${weight}`)
    .sort();
}

function allFacesOf(...families: string[]): string[] {
  return embeddedFaces(
    families
      .flatMap(
        (family) => vendoredStyles.fontFaces[family as keyof typeof vendoredStyles.fontFaces],
      )
      .map((face) => face.rule)
      .join(''),
  );
}

function visiblePart(html: string): string {
  return html.slice(html.indexOf('class="katex-html"'));
}

beforeEach(() => {
  mockWebViewProps.length = 0;
  mockTheme.isDark = false;
  mockTheme.colors = getColors('light', 'light', false);
});

describe('matrices and cases draw with the KaTeX layout the web app uses', () => {
  it.each([
    ['pmatrix', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}'],
    ['bmatrix', '\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}'],
    ['vmatrix', '\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}'],
    ['matrix', '\\begin{matrix}a&b\\\\c&d\\end{matrix}'],
  ])('lays out %s columns with a gap between them, inline and as display math', (_name, latex) => {
    for (const display of [false, true]) {
      const html = visiblePart(drawn(latex, display));
      expect(html).toContain('class="mtable"');
      expect(html).toContain('class="arraycolsep"');
    }
    expect(lastDocument()).toContain('.katex .mtable .arraycolsep{display:inline-block}');
  });

  it('stretches the brackets of a matrix with the KaTeX delimiter fonts', () => {
    const pmatrix = renderMathMarkup(
      '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}',
      true,
      'htmlAndMathml',
    );
    if (!pmatrix.ok) throw new Error(pmatrix.reason);

    expect(pmatrix.markup).toContain('delimsizing size3');
    expect(katexFontFamilies(pmatrix.markup)).toContain('KaTeX_Size3');
    expect(drawn('\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', true)).toContain(
      fontFace('KaTeX_Size3'),
    );
  });

  it('draws a cases brace that spans every row and aligns the conditions in one column', () => {
    const html = drawn('f(x)=\\begin{cases}x&x\\ge0\\\\-x&x<0\\end{cases}', true);
    const visible = visiblePart(html);

    expect(visible).toContain('delimsizing size4');
    expect(visible).toContain('col-align-l');
    expect(visible).toContain('class="arraycolsep"');
    expect(html).toContain(fontFace('KaTeX_Size4'));
  });
});

describe('constructs WebKit and Chromium MathML draw differently', () => {
  it('colours, boxes, strikes and braces without MathML-only elements', () => {
    expect(visiblePart(drawn('\\color{red}{x}', false))).toContain('color:red');

    const boxed = drawn('\\boxed{E=mc^2}', false);
    expect(visiblePart(boxed)).toContain('fbox');
    expect(boxed).toContain('.katex .fbox,.katex .fcolorbox{border:.04em solid;');

    expect(visiblePart(drawn('\\cancel{x}', false))).toMatch(/<svg[^>]*>[\s\S]*<line/);

    const brace = visiblePart(drawn('\\overbrace{a+b}^{n}', true));
    expect(brace).toContain('brace-left');
    expect(brace).toContain('brace-right');
    expect(brace).toMatch(/<svg/);

    for (const html of [boxed, brace]) {
      expect(visiblePart(html)).not.toContain('<menclose');
    }
  });

  it('keeps reading the formula aloud from its MathML', () => {
    const latex = '\\cancel{x} + \\boxed{y}';
    const mathml = renderMathMarkup(latex, false);
    const drawnMarkup = renderMathMarkup(latex, false, 'htmlAndMathml');
    if (!mathml.ok) throw new Error(mathml.reason);
    if (!drawnMarkup.ok) throw new Error(drawnMarkup.reason);
    const words = speakMathMarkup(mathml.markup);
    const wordsWithLayout = speakMathMarkup(drawnMarkup.markup);

    render(<MathBlock latex={latex} display={false} />);

    expect(words).toContain('plus');
    expect(wordsWithLayout).not.toBe(words);
    expect(screen.getByLabelText(`Inline math: ${words}`)).toBeTruthy();
    expect(screen.queryByLabelText(`Inline math: ${wordsWithLayout}`)).toBeNull();
  });
});

describe('the KaTeX fonts', () => {
  it('allows only fonts embedded in the page', () => {
    const html = drawn('x^2', false);

    expect(html).toContain(
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:",
    );
    expect(html).not.toMatch(/url\((?!data:font\/woff2;base64,)/);
  });

  it('embeds only the font families the formula uses', () => {
    const plain = drawn('x^2', false);
    expect(plain).toContain(fontFace('KaTeX_Main'));
    expect(plain).toContain(fontFace('KaTeX_Math'));
    expect(plain).not.toContain(fontFace('KaTeX_Fraktur'));

    expect(drawn('\\mathfrak{g}', false)).toContain(fontFace('KaTeX_Fraktur'));
  });

  it('embeds only the regular and italic faces a plain formula draws with', () => {
    for (const latex of ['x^2', '\\frac{a+1}{b} = \\sqrt{c}']) {
      expect(embeddedFaces(drawn(latex, false))).toEqual([
        'KaTeX_Main normal 400',
        'KaTeX_Math italic 400',
      ]);
    }
  });

  it('adds the bold and italic faces only where the formula selects them', () => {
    expect(embeddedFaces(drawn('\\mathbf{v} = x\\boldsymbol{\\alpha}', false))).toEqual([
      'KaTeX_Main normal 400',
      'KaTeX_Main normal 700',
      'KaTeX_Math italic 400',
      'KaTeX_Math italic 700',
    ]);
    expect(embeddedFaces(drawn('\\textbf{a \\textit{b}}', false))).toEqual([
      'KaTeX_Main italic 700',
      'KaTeX_Main normal 400',
      'KaTeX_Main normal 700',
    ]);
    expect(embeddedFaces(drawn('\\mathit{f}', false))).toEqual([
      'KaTeX_Main italic 400',
      'KaTeX_Main normal 400',
    ]);
  });

  it('follows a face the markup inherits from an enclosing element', () => {
    const markup =
      '<span class="katex"><span class="textbf"><span class="mord textit">a</span></span></span>';

    expect(embeddedFaces(katexStylesFor(markup))).toEqual([
      'KaTeX_Main italic 700',
      'KaTeX_Main normal 400',
      'KaTeX_Main normal 700',
    ]);
  });

  it('embeds every face of a family when it cannot tell which ones the markup draws with', () => {
    expect(
      embeddedFaces(katexStylesFor('<span class="katex"><span class="mord mathnormal">x</span>')),
    ).toEqual(allFacesOf('KaTeX_Main', 'KaTeX_Math'));
    expect(
      embeddedFaces(
        katexStylesFor(
          '<span class="katex"><span class="mord mathnormal" style="font-weight:700">x</span></span>',
        ),
      ),
    ).toEqual(allFacesOf('KaTeX_Main', 'KaTeX_Math'));
    expect(
      embeddedFaces(
        katexStylesFor('<span class="katex"><span class="mord mathnormal mathrm">x</span></span>'),
      ),
    ).toEqual(['KaTeX_Main normal 400', ...allFacesOf('KaTeX_Math')].sort());
  });

  it('match the KaTeX build that renders the formulas', () => {
    expect(vendoredStyles).toEqual(buildKatexMathStyles());
  });
});

describe('the size report', () => {
  function runPage(fonts: { ready: Promise<unknown> } | undefined) {
    const html = buildMathDocument(
      '<span class="katex"></span>',
      false,
      getColors('light', 'light', false),
    );
    const script = html.match(/<script>([\s\S]*)<\/script(?:[\s/][^>]*)?>/i)?.[1] ?? '';
    const box = { bottom: 30, height: 30, width: 80 };
    const posted: string[] = [];
    vm.runInNewContext(script, {
      console,
      document: {
        fonts,
        getElementById: (id: string) =>
          id === 'math-root'
            ? { getBoundingClientRect: () => box, scrollHeight: 30 }
            : { getBoundingClientRect: () => ({ bottom: 26 }) },
      },
      window: { ReactNativeWebView: { postMessage: (data: string) => posted.push(data) } },
    });
    return posted;
  }

  it('waits for the KaTeX fonts before measuring', async () => {
    let loaded!: () => void;
    const ready = new Promise<void>((resolve) => {
      loaded = resolve;
    });

    const posted = runPage({ ready });
    expect(posted).toEqual([]);

    loaded();
    await ready;
    await Promise.resolve();

    expect(JSON.parse(posted[0]!)).toEqual({ type: 'size', height: 30, width: 80, descent: 4 });
  });

  it('still measures when font loading fails', async () => {
    const ready = Promise.reject(new Error('font failed'));

    const posted = runPage({ ready });
    await ready.catch(() => undefined);
    await Promise.resolve();

    expect(posted).toHaveLength(1);
  });

  it('measures at once where the page has no font loading API', () => {
    expect(runPage(undefined)).toHaveLength(1);
  });
});
