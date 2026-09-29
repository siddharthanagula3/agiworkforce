import jsPDF from 'jspdf';
import {
  RIGHT_TO_LEFT_TEXT,
  documentDirection,
  type DocumentAlign,
  type DocumentBlock,
  type DocumentDirection,
  type DocumentInline,
  type DocumentListItem,
} from '@agiworkforce/unified-chat/markdown-document';
import { texToLinearMath, type LinearMathPiece } from './export-math';

type Rgb = readonly [number, number, number];

function canvasColor(color: Rgb): string {
  return `#${color.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}
type PdfFont = 'helvetica' | 'courier' | 'symbol' | 'zapfdingbats';
type LineAlign = 'left' | 'center' | 'right';

export interface PdfHeader {
  readonly title?: string;
  readonly author?: string;
  readonly date: string;
}

const PAGE_MARGIN = 56;
const BODY_SIZE = 10.5;
const LINE_HEIGHT = 1.45;
const HEADING_SIZES = [18, 15, 13, 11.5, 11, 10.5] as const;
const TITLE_SIZE = 20;
const META_SIZE = 9.5;
const CODE_SIZE = 9;
const TABLE_SIZE = 9.5;
const INLINE_CODE_SCALE = 0.92;
const DISPLAY_MATH_SCALE = 1.05;
const BLOCK_GAP = 7;
const LIST_ITEM_GAP = 2;
const HEADING_GAP = 10;
const LIST_INDENT = 18;
const MARKER_GAP = 5;
const QUOTE_INDENT = 14;
const QUOTE_BAR_WIDTH = 2;
const CELL_PADDING = 4;
const CODE_PADDING = 8;
const RULE_SPACE = 8;
const CHECKBOX_SIZE = 7;
const TAB_SPACES = '    ';
const MIN_TABLE_SLICE = 24;

const TEXT_COLOR: Rgb = [24, 24, 27];
const MUTED_COLOR: Rgb = [92, 92, 100];
const LINK_COLOR: Rgb = [5, 99, 193];
const RULE_COLOR: Rgb = [200, 200, 206];
const CODE_BACKGROUND: Rgb = [245, 245, 247];
const INLINE_CODE_BACKGROUND: Rgb = [236, 236, 240];
const TABLE_HEADER_BACKGROUND: Rgb = [242, 242, 245];
const TABLE_BORDER: Rgb = [206, 206, 212];
const QUOTE_BAR_COLOR: Rgb = [206, 206, 212];

const WIN_ANSI_EXTRAS: ReadonlySet<string> = new Set([
  ...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–˜™š›œžŸ',
  String.fromCodePoint(0x2014),
]);

const SUBSTITUTES: Readonly<Record<string, string>> = {
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '―': '–',
  '‛': "'",
  '‟': '"',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '​': '',
  '‌': '',
  '‍': '',
  '⁠': '',
  '﻿': '',
  '️': '',
};

const SYMBOL_CODES: Readonly<Record<string, number>> = {
  α: 0x61,
  β: 0x62,
  γ: 0x67,
  δ: 0x64,
  ε: 0x65,
  ϵ: 0x65,
  ζ: 0x7a,
  η: 0x68,
  θ: 0x71,
  ϑ: 0x4a,
  ι: 0x69,
  κ: 0x6b,
  λ: 0x6c,
  μ: 0x6d,
  ν: 0x6e,
  ξ: 0x78,
  ο: 0x6f,
  π: 0x70,
  ϖ: 0x76,
  ρ: 0x72,
  ς: 0x56,
  σ: 0x73,
  τ: 0x74,
  υ: 0x75,
  φ: 0x66,
  ϕ: 0x6a,
  χ: 0x63,
  ψ: 0x79,
  ω: 0x77,
  Α: 0x41,
  Β: 0x42,
  Γ: 0x47,
  Δ: 0x44,
  Ε: 0x45,
  Ζ: 0x5a,
  Η: 0x48,
  Θ: 0x51,
  Ι: 0x49,
  Κ: 0x4b,
  Λ: 0x4c,
  Μ: 0x4d,
  Ν: 0x4e,
  Ξ: 0x58,
  Ο: 0x4f,
  Π: 0x50,
  Ρ: 0x52,
  Σ: 0x53,
  Τ: 0x54,
  Υ: 0x55,
  Φ: 0x46,
  Χ: 0x43,
  Ψ: 0x59,
  Ω: 0x57,
  '∀': 0x22,
  '∃': 0x24,
  '∋': 0x27,
  '∗': 0x2a,
  '−': 0x2d,
  '≅': 0x40,
  '⊥': 0x5e,
  '∴': 0x5c,
  '∼': 0x7e,
  '′': 0xa2,
  '≤': 0xa3,
  '⁄': 0xa4,
  '∞': 0xa5,
  '♣': 0xa7,
  '♦': 0xa8,
  '♥': 0xa9,
  '♠': 0xaa,
  '↔': 0xab,
  '←': 0xac,
  '↑': 0xad,
  '→': 0xae,
  '↓': 0xaf,
  '″': 0xb2,
  '≥': 0xb3,
  '∝': 0xb5,
  '∂': 0xb6,
  '≠': 0xb9,
  '≡': 0xba,
  '≈': 0xbb,
  '↵': 0xbf,
  ℵ: 0xc0,
  ℑ: 0xc1,
  ℜ: 0xc2,
  '℘': 0xc3,
  '⊗': 0xc4,
  '⊕': 0xc5,
  '∅': 0xc6,
  '∩': 0xc7,
  '∪': 0xc8,
  '⊃': 0xc9,
  '⊇': 0xca,
  '⊄': 0xcb,
  '⊂': 0xcc,
  '⊆': 0xcd,
  '∈': 0xce,
  '∉': 0xcf,
  '∠': 0xd0,
  '∇': 0xd1,
  '∏': 0xd5,
  '√': 0xd6,
  '⋅': 0xd7,
  '∧': 0xd9,
  '∨': 0xda,
  '⇔': 0xdb,
  '⇐': 0xdc,
  '⇑': 0xdd,
  '⇒': 0xde,
  '⇓': 0xdf,
  '◊': 0xe0,
  '⟨': 0xe1,
  '∑': 0xe5,
  '⟩': 0xf1,
  '∫': 0xf2,
};

const DINGBAT_CODES: Readonly<Record<string, number>> = {
  '✓': 0x33,
  '✔': 0x34,
  '✗': 0x37,
  '✘': 0x38,
  '★': 0x48,
  '●': 0x6c,
  '■': 0x6e,
  '▲': 0x73,
  '▼': 0x74,
  '◆': 0x75,
};

const CHECKMARK_DINGBAT = String.fromCharCode(DINGBAT_CODES['✔'] ?? 0x34);
const BREAK_ANYWHERE = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/u;
const LEFT_TO_RIGHT_TEXT = /[\p{L}\p{N}]/u;
const WHITESPACE = /\s/u;
const UNRENDERABLE = '?';
const RASTER_SCALE = 3;
const SANS_STACK = 'Helvetica, Arial, sans-serif';
const MONO_STACK = '"Courier New", Courier, monospace';

interface RunStyle {
  readonly mono: boolean;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly size: number;
  readonly rise: number;
  readonly color: Rgb;
  readonly href?: string;
  readonly strike?: boolean;
  readonly shade?: Rgb;
}

interface StyledText {
  readonly text: string;
  readonly style: RunStyle;
}

interface Glyphs {
  readonly raster: boolean;
  readonly font: PdfFont;
  readonly text: string;
  readonly style: RunStyle;
  readonly width: number;
}

interface Token {
  readonly glyphs: readonly Glyphs[];
  readonly width: number;
  readonly space: boolean;
  readonly lineBreak: boolean;
  readonly size: number;
}

interface Line {
  readonly tokens: readonly Token[];
  readonly width: number;
  readonly height: number;
  readonly size: number;
}

type Marker =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'checkbox'; readonly checked: boolean };

interface PendingMarker {
  readonly marker: Marker;
  readonly x: number;
  readonly width: number;
  readonly direction: DocumentDirection;
}

interface BlockContext {
  readonly x: number;
  readonly width: number;
  readonly bars: readonly number[];
  readonly color: Rgb;
  readonly listDepth: number;
  readonly direction: DocumentDirection;
}

function startAlign(context: BlockContext): LineAlign {
  return context.direction === 'rtl' ? 'right' : 'left';
}

function baseStyle(size: number, color: Rgb): RunStyle {
  return { mono: false, bold: false, italic: false, size, rise: 0, color };
}

function fontStyle(style: RunStyle): string {
  if (style.bold && style.italic) return 'bolditalic';
  if (style.bold) return 'bold';
  if (style.italic) return 'italic';
  return 'normal';
}

function isWinAnsi(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.has(char)
  );
}

type RunKey = Pick<Glyphs, 'raster' | 'font' | 'style'>;

function sameRun(left: RunKey, right: RunKey): boolean {
  return left.raster === right.raster && left.font === right.font && left.style === right.style;
}

function mergeRuns(glyphs: readonly Glyphs[]): Glyphs[] {
  const merged: Glyphs[] = [];
  for (const entry of glyphs) {
    const last = merged[merged.length - 1];
    if (last && sameRun(last, entry)) {
      merged[merged.length - 1] = {
        ...last,
        text: last.text + entry.text,
        width: last.width + entry.width,
      };
    } else {
      merged.push(entry);
    }
  }
  return merged;
}

function isRightToLeft(token: Token): boolean {
  return token.glyphs.some((entry) => entry.raster && RIGHT_TO_LEFT_TEXT.test(entry.text));
}

function isLeftToRight(token: Token): boolean {
  return token.glyphs.some(
    (entry) => LEFT_TO_RIGHT_TEXT.test(entry.text) && !RIGHT_TO_LEFT_TEXT.test(entry.text),
  );
}

function reverseRuns(tokens: readonly Token[], inRun: (token: Token) => boolean): Token[] {
  const ordered: Token[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token || !inRun(token)) {
      if (token) ordered.push(token);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < tokens.length) {
      const next = tokens[end];
      const after = tokens[end + 1];
      if (next && inRun(next)) {
        end += 1;
      } else if (next?.space && after && inRun(after)) {
        end += 2;
      } else {
        break;
      }
    }
    ordered.push(...tokens.slice(index, end).reverse());
    index = end;
  }
  return ordered;
}

function visualOrder(tokens: readonly Token[], direction: DocumentDirection): Token[] {
  if (direction === 'ltr') return reverseRuns(tokens, isRightToLeft);
  return reverseRuns(tokens, isLeftToRight).reverse();
}

function quoteContext(context: BlockContext): BlockContext {
  const rightToLeft = context.direction === 'rtl';
  return {
    ...context,
    x: rightToLeft ? context.x : context.x + QUOTE_INDENT,
    width: context.width - QUOTE_INDENT,
    bars: [
      ...context.bars,
      rightToLeft ? context.x + context.width - 1 - QUOTE_BAR_WIDTH : context.x + 1,
    ],
    color: MUTED_COLOR,
  };
}

function textColumnWidths(
  natural: readonly number[],
  minimum: readonly number[],
  available: number,
): number[] {
  const naturalTotal = natural.reduce((sum, width) => sum + width, 0);
  if (naturalTotal <= available) {
    return natural.map((width) => (width * available) / Math.max(naturalTotal, 1));
  }
  const minimumTotal = minimum.reduce((sum, width) => sum + width, 0);
  if (minimumTotal >= available) {
    return minimum.map((width) => (width * available) / Math.max(minimumTotal, 1));
  }
  const flex = natural.map((width, index) => width - (minimum[index] ?? 0));
  const flexTotal = flex.reduce((sum, width) => sum + width, 0) || 1;
  return minimum.map(
    (width, index) => width + ((available - minimumTotal) * (flex[index] ?? 0)) / flexTotal,
  );
}

class PdfTextKit {
  private readonly canvas: CanvasRenderingContext2D | null;

  constructor(private readonly pdf: jsPDF) {
    this.canvas =
      typeof document === 'undefined'
        ? null
        : (document.createElement('canvas').getContext('2d') ?? null);
  }

  applyFont(font: PdfFont, style: RunStyle): void {
    this.pdf.setFont(
      font,
      font === 'helvetica' || font === 'courier' ? fontStyle(style) : 'normal',
    );
    this.pdf.setFontSize(style.size);
  }

  cssFont(style: RunStyle): string {
    return `${style.italic ? 'italic ' : ''}${style.bold ? '700' : '400'} ${style.size}px ${
      style.mono ? MONO_STACK : SANS_STACK
    }`;
  }

  private measure(raster: boolean, font: PdfFont, text: string, style: RunStyle): number {
    if (raster && this.canvas) {
      this.canvas.font = this.cssFont(style);
      return this.canvas.measureText(text).width;
    }
    this.applyFont(font, style);
    return this.pdf.getTextWidth(text);
  }

  private glyph(char: string, style: RunStyle): { raster: boolean; font: PdfFont; text: string } {
    const substitute = SUBSTITUTES[char];
    const resolved = substitute ?? char;
    if (!resolved) return { raster: false, font: 'helvetica', text: '' };
    if (isWinAnsi(resolved)) {
      return { raster: false, font: style.mono ? 'courier' : 'helvetica', text: resolved };
    }
    const symbol = SYMBOL_CODES[resolved];
    if (symbol !== undefined)
      return { raster: false, font: 'symbol', text: String.fromCharCode(symbol) };
    const dingbat = DINGBAT_CODES[resolved];
    if (dingbat !== undefined) {
      return { raster: false, font: 'zapfdingbats', text: String.fromCharCode(dingbat) };
    }
    if (this.canvas) return { raster: true, font: 'helvetica', text: resolved };
    return { raster: false, font: style.mono ? 'courier' : 'helvetica', text: UNRENDERABLE };
  }

  private token(glyphs: readonly Omit<Glyphs, 'width'>[], space: boolean): Token {
    const measured = glyphs.map((entry) => ({
      ...entry,
      width: this.measure(entry.raster, entry.font, entry.text, entry.style),
    }));
    return {
      glyphs: measured,
      width: measured.reduce((sum, entry) => sum + entry.width, 0),
      space,
      lineBreak: false,
      size: Math.max(...measured.map((entry) => entry.style.size)),
    };
  }

  tokenize(texts: readonly StyledText[], preserveSpaces: boolean): Token[] {
    const tokens: Token[] = [];
    let word: Omit<Glyphs, 'width'>[] = [];
    const flush = () => {
      if (word.length > 0) tokens.push(this.token(word, false));
      word = [];
    };
    for (const { text, style } of texts) {
      for (const char of text.normalize('NFC')) {
        if (char === '\n') {
          flush();
          tokens.push({ glyphs: [], width: 0, space: false, lineBreak: true, size: style.size });
          continue;
        }
        if (WHITESPACE.test(char) && !(char in SUBSTITUTES && SUBSTITUTES[char] === '')) {
          flush();
          const spaces = char === '\t' && preserveSpaces ? TAB_SPACES : ' ';
          const previous = tokens[tokens.length - 1];
          if (preserveSpaces || !previous?.space) {
            tokens.push(
              this.token(
                [
                  {
                    raster: false,
                    font: style.mono ? 'courier' : 'helvetica',
                    text: spaces,
                    style,
                  },
                ],
                true,
              ),
            );
          }
          continue;
        }
        const glyph: Omit<Glyphs, 'width'> = { ...this.glyph(char, style), style };
        if (!glyph.text) continue;
        if (preserveSpaces || BREAK_ANYWHERE.test(char)) {
          flush();
          word.push(glyph);
          flush();
          continue;
        }
        const last = word[word.length - 1];
        if (last && sameRun(last, glyph)) {
          word[word.length - 1] = { ...last, text: last.text + glyph.text };
        } else {
          word.push(glyph);
        }
      }
    }
    flush();
    return tokens;
  }

  splitWide(token: Token, width: number): Token[] {
    const parts: Token[] = [];
    let current: Omit<Glyphs, 'width'>[] = [];
    let currentWidth = 0;
    for (const entry of token.glyphs) {
      for (const char of entry.text) {
        const charWidth = this.measure(entry.raster, entry.font, char, entry.style);
        if (currentWidth + charWidth > width && current.length > 0) {
          parts.push(this.token(current, false));
          current = [];
          currentWidth = 0;
        }
        const last = current[current.length - 1];
        if (last && sameRun(last, entry)) {
          current[current.length - 1] = { ...last, text: last.text + char };
        } else {
          current.push({ raster: entry.raster, font: entry.font, text: char, style: entry.style });
        }
        currentWidth += charWidth;
      }
    }
    if (current.length > 0) parts.push(this.token(current, false));
    return parts;
  }

  rasterize(
    text: string,
    style: RunStyle,
  ): { url: string; width: number; height: number; ascent: number } | null {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;
    const font = this.cssFont(style);
    context.font = font;
    const metrics = context.measureText(text);
    const ascent = metrics.fontBoundingBoxAscent || style.size * 0.9;
    const descent = metrics.fontBoundingBoxDescent || style.size * 0.3;
    const width = Math.max(metrics.width, 1);
    canvas.width = Math.ceil(width * RASTER_SCALE);
    canvas.height = Math.ceil((ascent + descent) * RASTER_SCALE);
    context.scale(RASTER_SCALE, RASTER_SCALE);
    context.font = font;
    context.textBaseline = 'alphabetic';
    context.fillStyle = canvasColor(style.color);
    context.fillText(text, 0, ascent);
    return { url: canvas.toDataURL('image/png'), width, height: ascent + descent, ascent };
  }
}

function breakLines(
  kit: PdfTextKit,
  tokens: readonly Token[],
  width: number,
  preserveSpaces: boolean,
  emptySize: number,
): Line[] {
  const lines: Line[] = [];
  let current: Token[] = [];
  let currentWidth = 0;
  const finish = () => {
    while (!preserveSpaces && current.length > 0 && current[current.length - 1]?.space) {
      const dropped = current.pop();
      currentWidth -= dropped?.width ?? 0;
    }
    const size = current.length > 0 ? Math.max(...current.map((token) => token.size)) : emptySize;
    lines.push({ tokens: current, width: currentWidth, height: size * LINE_HEIGHT, size });
    current = [];
    currentWidth = 0;
  };
  const place = (token: Token) => {
    if (currentWidth + token.width > width && current.some((entry) => !entry.space)) {
      finish();
      if (token.space && !preserveSpaces) return;
    }
    if (token.space && !preserveSpaces && current.length === 0) return;
    current.push(token);
    currentWidth += token.width;
  };
  for (const token of tokens) {
    if (token.lineBreak) {
      finish();
      continue;
    }
    if (token.width > width && !token.space) {
      for (const part of kit.splitWide(token, width)) place(part);
      continue;
    }
    place(token);
  }
  if (current.length > 0 || lines.length === 0) finish();
  return lines;
}

function inlineTexts(inlines: readonly DocumentInline[], style: RunStyle): StyledText[] {
  const texts: StyledText[] = [];
  for (const inline of inlines) {
    if (inline.kind === 'break') {
      texts.push({ text: '\n', style });
    } else if (inline.kind === 'math') {
      const [line = []] = texToLinearMath(inline.tex, false);
      texts.push(...mathTexts(line, style));
    } else {
      const { marks } = inline;
      texts.push({
        text: inline.text,
        style: {
          ...style,
          bold: style.bold || Boolean(marks.bold),
          italic: style.italic || Boolean(marks.italic),
          strike: style.strike || Boolean(marks.strike),
          mono: style.mono || Boolean(marks.code),
          size: marks.code ? style.size * INLINE_CODE_SCALE : style.size,
          shade: marks.code ? INLINE_CODE_BACKGROUND : style.shade,
          href: marks.href ?? style.href,
          color: marks.href ? LINK_COLOR : style.color,
        },
      });
    }
  }
  return texts;
}

function mathTexts(pieces: readonly LinearMathPiece[], style: RunStyle): StyledText[] {
  return pieces.map((piece) => ({
    text: piece.text,
    style: {
      ...style,
      italic: piece.italic,
      size: style.size * piece.scale,
      rise: style.size * piece.rise,
    },
  }));
}

class PdfDocumentRenderer {
  private readonly kit: PdfTextKit;
  private readonly bottom: number;
  private readonly contentWidth: number;
  private y = PAGE_MARGIN;
  private pendingMarker: PendingMarker | null = null;

  constructor(
    private readonly pdf: jsPDF,
    private readonly direction: DocumentDirection,
  ) {
    this.kit = new PdfTextKit(pdf);
    this.bottom = pdf.internal.pageSize.getHeight() - PAGE_MARGIN;
    this.contentWidth = pdf.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
  }

  private rootContext(): BlockContext {
    return {
      x: PAGE_MARGIN,
      width: this.contentWidth,
      bars: [],
      color: TEXT_COLOR,
      listDepth: 0,
      direction: this.direction,
    };
  }

  private newPage(): void {
    this.pdf.addPage();
    this.y = PAGE_MARGIN;
  }

  private ensureSpace(height: number): void {
    if (this.y + height > this.bottom && this.y > PAGE_MARGIN) this.newPage();
  }

  private fill(color: Rgb, x: number, y: number, width: number, height: number): void {
    this.pdf.setFillColor(color[0], color[1], color[2]);
    this.pdf.rect(x, y, width, height, 'F');
  }

  private stroke(color: Rgb, x1: number, y1: number, x2: number, y2: number, width = 0.6): void {
    this.pdf.setDrawColor(color[0], color[1], color[2]);
    this.pdf.setLineWidth(width);
    this.pdf.line(x1, y1, x2, y2);
  }

  private drawBars(context: BlockContext, top: number, height: number): void {
    for (const x of context.bars) this.fill(QUOTE_BAR_COLOR, x, top, QUOTE_BAR_WIDTH, height);
  }

  private drawMarker(pending: PendingMarker, baseline: number, size: number): void {
    const { marker, x, width, direction } = pending;
    const trailingSlot = x + width - LIST_INDENT + MARKER_GAP;
    if (marker.kind === 'checkbox') {
      const boxX =
        direction === 'rtl' ? trailingSlot : x + LIST_INDENT - MARKER_GAP - CHECKBOX_SIZE;
      const boxY = baseline - CHECKBOX_SIZE;
      this.pdf.setDrawColor(MUTED_COLOR[0], MUTED_COLOR[1], MUTED_COLOR[2]);
      this.pdf.setLineWidth(0.6);
      this.pdf.rect(boxX, boxY, CHECKBOX_SIZE, CHECKBOX_SIZE, 'S');
      if (marker.checked) {
        this.pdf.setFont('zapfdingbats', 'normal');
        this.pdf.setFontSize(CHECKBOX_SIZE);
        this.pdf.setTextColor(TEXT_COLOR[0], TEXT_COLOR[1], TEXT_COLOR[2]);
        this.pdf.text(CHECKMARK_DINGBAT, boxX + 0.8, baseline - 1.2);
      }
      return;
    }
    const style = baseStyle(size, TEXT_COLOR);
    const [token] = this.kit.tokenize([{ text: marker.text, style }], false);
    if (!token) return;
    this.drawGlyphs(
      token.glyphs,
      direction === 'rtl' ? trailingSlot : x + LIST_INDENT - MARKER_GAP - token.width,
      baseline,
      0,
    );
  }

  private drawGlyphs(
    glyphs: readonly Glyphs[],
    x: number,
    baseline: number,
    lineTop: number,
  ): number {
    let cursor = x;
    for (const entry of mergeRuns(glyphs)) {
      const { style } = entry;
      const glyphBaseline = baseline - style.rise;
      if (style.shade) {
        this.fill(
          style.shade,
          cursor,
          glyphBaseline - style.size * 0.8,
          entry.width,
          style.size * 1.05,
        );
      }
      if (entry.raster) {
        const image = this.kit.rasterize(entry.text, style);
        if (image) {
          this.pdf.addImage(
            image.url,
            'PNG',
            cursor,
            glyphBaseline - image.ascent,
            entry.width,
            image.height,
          );
        }
      } else if (entry.text.trim()) {
        this.kit.applyFont(entry.font, style);
        this.pdf.setTextColor(style.color[0], style.color[1], style.color[2]);
        this.pdf.text(entry.text, cursor, glyphBaseline);
      }
      if (style.href) {
        this.stroke(
          style.color,
          cursor,
          glyphBaseline + 1.4,
          cursor + entry.width,
          glyphBaseline + 1.4,
          0.5,
        );
        if (lineTop > 0) {
          this.pdf.link(cursor, lineTop, entry.width, style.size * LINE_HEIGHT, {
            url: style.href,
          });
        }
      }
      if (style.strike) {
        const strikeY = glyphBaseline - style.size * 0.28;
        this.stroke(style.color, cursor, strikeY, cursor + entry.width, strikeY, 0.5);
      }
      cursor += entry.width;
    }
    return cursor;
  }

  private drawLine(
    line: Line,
    context: BlockContext,
    x: number,
    width: number,
    align: LineAlign,
  ): void {
    const top = this.y;
    const baseline = top + (line.height - line.size) / 2 + line.size * 0.8;
    this.drawBars(context, top, line.height);
    if (this.pendingMarker) {
      this.drawMarker(this.pendingMarker, baseline, Math.max(line.size, BODY_SIZE * 0.9));
      this.pendingMarker = null;
    }
    const slack = Math.max(0, width - line.width);
    const start = x + (align === 'center' ? slack / 2 : align === 'right' ? slack : 0);
    this.drawGlyphs(
      visualOrder(line.tokens, context.direction).flatMap((token) => token.glyphs),
      start,
      baseline,
      top,
    );
  }

  private flowLines(
    lines: readonly Line[],
    context: BlockContext,
    align: LineAlign,
    inset = 0,
  ): void {
    for (const line of lines) {
      this.ensureSpace(line.height);
      this.drawLine(line, context, context.x + inset, context.width - inset * 2, align);
      this.y += line.height;
    }
  }

  private flowTexts(
    texts: readonly StyledText[],
    context: BlockContext,
    align: LineAlign,
    size: number,
  ): void {
    const tokens = this.kit.tokenize(texts, false);
    this.flowLines(breakLines(this.kit, tokens, context.width, false, size), context, align);
  }

  renderHeader(header: PdfHeader): void {
    const context = this.rootContext();
    if (header.title) {
      this.flowTexts(
        [{ text: header.title, style: { ...baseStyle(TITLE_SIZE, TEXT_COLOR), bold: true } }],
        context,
        startAlign(context),
        TITLE_SIZE,
      );
      this.y += 4;
    }
    const meta = [header.author ? `By ${header.author}` : '', header.date]
      .filter(Boolean)
      .join('  ·  ');
    this.flowTexts(
      [{ text: meta, style: baseStyle(META_SIZE, MUTED_COLOR) }],
      context,
      startAlign(context),
      META_SIZE,
    );
    this.y += BLOCK_GAP * 2;
  }

  renderDocument(blocks: readonly DocumentBlock[]): void {
    this.renderBlocks(blocks, this.rootContext(), BLOCK_GAP);
  }

  private renderBlocks(blocks: readonly DocumentBlock[], context: BlockContext, gap: number): void {
    blocks.forEach((block, index) => {
      this.renderBlock(block, context);
      if (index < blocks.length - 1 && this.y + gap <= this.bottom) {
        this.drawBars(context, this.y, gap);
        this.y += gap;
      }
    });
  }

  private renderBlock(block: DocumentBlock, context: BlockContext): void {
    switch (block.kind) {
      case 'heading':
        this.renderHeading(block.level, block.inlines, context);
        return;
      case 'paragraph':
        this.flowTexts(
          inlineTexts(block.inlines, baseStyle(BODY_SIZE, context.color)),
          context,
          startAlign(context),
          BODY_SIZE,
        );
        return;
      case 'list':
        this.renderList(block.ordered, block.start, block.items, context);
        return;
      case 'code':
        this.renderCode(block.text, context);
        return;
      case 'quote':
        this.renderBlocks(block.blocks, quoteContext(context), BLOCK_GAP);
        return;
      case 'table':
        this.renderTable(block.align, block.rows, context);
        return;
      case 'math':
        for (const line of texToLinearMath(block.tex, true)) {
          this.flowTexts(
            mathTexts(line, baseStyle(BODY_SIZE * DISPLAY_MATH_SCALE, context.color)),
            { ...context, direction: 'ltr' },
            'center',
            BODY_SIZE,
          );
        }
        return;
      case 'rule':
        this.ensureSpace(RULE_SPACE * 2);
        this.y += RULE_SPACE;
        this.stroke(RULE_COLOR, context.x, this.y, context.x + context.width, this.y);
        this.y += RULE_SPACE;
        return;
    }
  }

  private renderHeading(
    level: number,
    inlines: readonly DocumentInline[],
    context: BlockContext,
  ): void {
    const size = HEADING_SIZES[Math.min(Math.max(level, 1), HEADING_SIZES.length) - 1] ?? BODY_SIZE;
    const tokens = this.kit.tokenize(
      inlineTexts(inlines, { ...baseStyle(size, context.color), bold: true }),
      false,
    );
    const lines = breakLines(this.kit, tokens, context.width, false, size);
    const height = lines.reduce((sum, line) => sum + line.height, 0);
    if (this.y > PAGE_MARGIN) this.y += HEADING_GAP;
    this.ensureSpace(height + BODY_SIZE * LINE_HEIGHT * 2);
    this.flowLines(lines, context, startAlign(context));
  }

  private renderList(
    ordered: boolean,
    start: number,
    items: readonly DocumentListItem[],
    context: BlockContext,
  ): void {
    const bullet = context.listDepth % 2 === 0 ? '•' : '–';
    items.forEach((item, index) => {
      const marker: Marker =
        item.checked !== null
          ? { kind: 'checkbox', checked: item.checked }
          : { kind: 'text', text: ordered ? `${start + index}.` : bullet };
      this.pendingMarker = {
        marker,
        x: context.x,
        width: context.width,
        direction: context.direction,
      };
      const itemContext: BlockContext = {
        ...context,
        x: context.direction === 'rtl' ? context.x : context.x + LIST_INDENT,
        width: context.width - LIST_INDENT,
        listDepth: context.listDepth + 1,
      };
      if (item.blocks.length === 0) {
        this.flowTexts(
          [{ text: ' ', style: baseStyle(BODY_SIZE, context.color) }],
          itemContext,
          startAlign(itemContext),
          BODY_SIZE,
        );
      } else {
        this.renderBlocks(item.blocks, itemContext, LIST_ITEM_GAP);
      }
      this.pendingMarker = null;
      if (index < items.length - 1 && this.y + LIST_ITEM_GAP <= this.bottom) {
        this.drawBars(context, this.y, LIST_ITEM_GAP);
        this.y += LIST_ITEM_GAP;
      }
    });
  }

  private renderCode(text: string, context: BlockContext): void {
    const style: RunStyle = { ...baseStyle(CODE_SIZE, TEXT_COLOR), mono: true };
    const tokens = this.kit.tokenize([{ text: text.replace(/\t/g, TAB_SPACES), style }], true);
    const lines = breakLines(this.kit, tokens, context.width - CODE_PADDING * 2, true, CODE_SIZE);
    this.ensureSpace(CODE_PADDING + (lines[0]?.height ?? CODE_SIZE * LINE_HEIGHT));
    this.drawBars(context, this.y, CODE_PADDING);
    this.fill(CODE_BACKGROUND, context.x, this.y, context.width, CODE_PADDING);
    this.y += CODE_PADDING;
    for (const line of lines) {
      this.ensureSpace(line.height);
      this.fill(CODE_BACKGROUND, context.x, this.y, context.width, line.height);
      this.drawLine(
        line,
        { ...context, direction: 'ltr' },
        context.x + CODE_PADDING,
        context.width - CODE_PADDING * 2,
        'left',
      );
      this.y += line.height;
    }
    this.ensureSpace(CODE_PADDING);
    this.drawBars(context, this.y, CODE_PADDING);
    this.fill(CODE_BACKGROUND, context.x, this.y, context.width, CODE_PADDING);
    this.y += CODE_PADDING;
  }

  private renderTable(
    align: readonly DocumentAlign[],
    rows: readonly (readonly (readonly DocumentInline[])[])[],
    context: BlockContext,
  ): void {
    const columnCount = Math.max(0, ...rows.map((row) => row.length));
    if (columnCount === 0) return;
    const cellTokens = rows.map((row, rowIndex) =>
      Array.from({ length: columnCount }, (_, column) =>
        this.kit.tokenize(
          inlineTexts(row[column] ?? [], {
            ...baseStyle(TABLE_SIZE, context.color),
            bold: rowIndex === 0,
          }),
          false,
        ),
      ),
    );
    const natural = Array.from(
      { length: columnCount },
      (_, column) =>
        Math.max(
          ...cellTokens.map((row) =>
            (row[column] ?? []).reduce((sum, token) => sum + token.width, 0),
          ),
        ) +
        CELL_PADDING * 2,
    );
    const minimum = Array.from({ length: columnCount }, (_, column) =>
      Math.min(
        Math.max(
          ...cellTokens.map((row) =>
            Math.max(0, ...(row[column] ?? []).map((token) => token.width)),
          ),
        ) +
          CELL_PADDING * 2,
        context.width / columnCount,
      ),
    );
    const widths = textColumnWidths(natural, minimum, context.width);
    const layouts = cellTokens.map((row) =>
      row.map((tokens, column) =>
        breakLines(this.kit, tokens, (widths[column] ?? 0) - CELL_PADDING * 2, false, TABLE_SIZE),
      ),
    );
    const aligns = Array.from(
      { length: columnCount },
      (_, column): LineAlign => align[column] ?? startAlign(context),
    );
    const header = layouts[0];
    layouts.forEach((cells, rowIndex) => {
      this.drawTableRow(cells, widths, aligns, rowIndex === 0, context, () => {
        if (header && rowIndex > 0) this.drawTableRow(header, widths, aligns, true, context, null);
      });
    });
  }

  private drawTableRow(
    cells: readonly (readonly Line[])[],
    widths: readonly number[],
    aligns: readonly LineAlign[],
    header: boolean,
    context: BlockContext,
    repeatHeader: (() => void) | null,
  ): void {
    const cursors = cells.map(() => 0);
    const pageContent = this.bottom - PAGE_MARGIN;
    const remainingHeight = (cell: readonly Line[], from: number) =>
      cell.slice(from).reduce((sum, line) => sum + line.height, 0);
    let first = true;
    let onFreshPage = false;
    while (first || cells.some((cell, index) => (cursors[index] ?? 0) < cell.length)) {
      const needed =
        Math.max(0, ...cells.map((cell, index) => remainingHeight(cell, cursors[index] ?? 0))) +
        CELL_PADDING * 2;
      const available = this.bottom - this.y;
      if (
        needed > available &&
        !onFreshPage &&
        this.y > PAGE_MARGIN &&
        (needed <= pageContent || available < MIN_TABLE_SLICE)
      ) {
        this.newPage();
        repeatHeader?.();
        onFreshPage = true;
        continue;
      }
      first = false;
      const sliceHeight = Math.min(needed, available);
      const top = this.y;
      this.drawBars(context, top, sliceHeight);
      let offset = 0;
      cells.forEach((cell, index) => {
        const width = widths[index] ?? 0;
        const x =
          context.direction === 'rtl'
            ? context.x + context.width - offset - width
            : context.x + offset;
        if (header) this.fill(TABLE_HEADER_BACKGROUND, x, top, width, sliceHeight);
        this.pdf.setDrawColor(TABLE_BORDER[0], TABLE_BORDER[1], TABLE_BORDER[2]);
        this.pdf.setLineWidth(0.6);
        this.pdf.rect(x, top, width, sliceHeight, 'S');
        let lineTop = top + CELL_PADDING;
        const sliceStart = cursors[index] ?? 0;
        let cursor = sliceStart;
        while (cursor < cell.length) {
          const line = cell[cursor];
          if (!line) break;
          if (
            lineTop + line.height > top + sliceHeight - CELL_PADDING + 0.01 &&
            cursor > sliceStart
          ) {
            break;
          }
          this.y = lineTop;
          this.drawLine(
            line,
            { ...context, bars: [] },
            x + CELL_PADDING,
            width - CELL_PADDING * 2,
            aligns[index] ?? startAlign(context),
          );
          lineTop += line.height;
          cursor += 1;
        }
        cursors[index] = cursor;
        offset += width;
      });
      this.y = top + sliceHeight;
      if (cells.some((cell, index) => (cursors[index] ?? 0) < cell.length)) {
        this.newPage();
        repeatHeader?.();
        onFreshPage = true;
      }
    }
  }
}

export function renderPdfDocument(blocks: readonly DocumentBlock[], header: PdfHeader): jsPDF {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const renderer = new PdfDocumentRenderer(pdf, documentDirection(blocks, header.title));
  renderer.renderHeader(header);
  renderer.renderDocument(blocks);
  return pdf;
}
