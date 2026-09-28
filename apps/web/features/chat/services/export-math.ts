import katex from 'katex';
import {
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSubSuperScript,
  MathSuperScript,
  type MathComponent,
} from 'docx';

export interface LinearMathPiece {
  readonly text: string;
  readonly italic: boolean;
  readonly rise: number;
  readonly scale: number;
}

const SCRIPT_SCALE = 0.72;
const SUPERSCRIPT_RISE = 0.38;
const SUBSCRIPT_RISE = -0.22;
const SPACED_OPERATORS: ReadonlySet<string> = new Set([
  '=',
  '+',
  '-',
  '−',
  '±',
  '×',
  '÷',
  '⋅',
  '<',
  '>',
  '≤',
  '≥',
  '≠',
  '≈',
  '≡',
  '∝',
  '→',
  '⇒',
  '⇔',
  '∈',
  '∉',
  '⊂',
  '⊆',
  '∪',
  '∩',
]);
const ACCENT_GLYPHS: Readonly<Record<string, string>> = {
  '⃗': '→',
  '→': '→',
  '^': '^',
  ˆ: '^',
  '¯': '¯',
  '‾': '¯',
  '~': '~',
  '˜': '~',
  '˙': '·',
};
const SINGLE_LETTER = /^\p{L}$/u;

function mathElement(tex: string, displayMode: boolean): Element | null {
  let markup: string;
  try {
    markup = katex.renderToString(tex, { output: 'mathml', throwOnError: true, displayMode });
  } catch {
    return null;
  }
  const math = new DOMParser().parseFromString(markup, 'text/html').querySelector('math');
  const semantics = math?.firstElementChild;
  return semantics?.localName === 'semantics' ? semantics : (math ?? null);
}

function childElements(element: Element): Element[] {
  return Array.from(element.children).filter(
    (child) => child.localName !== 'annotation' && child.localName !== 'annotation-xml',
  );
}

function toDocx(element: Element): MathComponent[] {
  const children = childElements(element);
  const [first, second, third] = children;
  switch (element.localName) {
    case 'mphantom':
    case 'mspace':
      return [];
    case 'mi':
    case 'mn':
    case 'mo':
    case 'mtext':
    case 'ms': {
      const text = element.textContent ?? '';
      return text ? [new MathRun(text)] : [];
    }
    case 'mfrac':
      return first && second
        ? [new MathFraction({ numerator: toDocx(first), denominator: toDocx(second) })]
        : children.flatMap(toDocx);
    case 'msqrt':
      return [new MathRadical({ children: children.flatMap(toDocx) })];
    case 'mroot':
      return first && second
        ? [new MathRadical({ children: toDocx(first), degree: toDocx(second) })]
        : children.flatMap(toDocx);
    case 'msup':
    case 'mover':
      return first && second
        ? [new MathSuperScript({ children: toDocx(first), superScript: toDocx(second) })]
        : children.flatMap(toDocx);
    case 'msub':
    case 'munder':
      return first && second
        ? [new MathSubScript({ children: toDocx(first), subScript: toDocx(second) })]
        : children.flatMap(toDocx);
    case 'msubsup':
    case 'munderover':
      return first && second && third
        ? [
            new MathSubSuperScript({
              children: toDocx(first),
              subScript: toDocx(second),
              superScript: toDocx(third),
            }),
          ]
        : children.flatMap(toDocx);
    case 'mtable':
      return children.flatMap((row, index) => [
        ...(index > 0 ? [new MathRun(';  ')] : []),
        ...toDocx(row),
      ]);
    case 'mtr':
      return children.flatMap((cell, index) => [
        ...(index > 0 ? [new MathRun('  ')] : []),
        ...toDocx(cell),
      ]);
    default:
      return children.flatMap(toDocx);
  }
}

export function texToDocxMath(tex: string, displayMode: boolean): MathComponent[][] {
  const root = mathElement(tex, displayMode);
  if (!root) return [[new MathRun(tex)]];
  const [only] = childElements(root);
  if (displayMode && only?.localName === 'mtable' && childElements(root).length === 1) {
    return childElements(only).map(toDocx);
  }
  return [childElements(root).flatMap(toDocx)];
}

interface LinearContext {
  readonly rise: number;
  readonly scale: number;
}

function piece(text: string, context: LinearContext, italic = false): LinearMathPiece {
  return { text, italic, rise: context.rise, scale: context.scale };
}

function scripted(context: LinearContext, rise: number): LinearContext {
  return { rise: context.rise + rise * context.scale, scale: context.scale * SCRIPT_SCALE };
}

function grouped(pieces: LinearMathPiece[], context: LinearContext): LinearMathPiece[] {
  const text = pieces
    .map((entry) => entry.text)
    .join('')
    .trim();
  if ([...text].length <= 1) return pieces;
  return [piece('(', context), ...pieces, piece(')', context)];
}

function toLinear(element: Element, context: LinearContext): LinearMathPiece[] {
  const children = childElements(element);
  const [first, second, third] = children;
  const text = element.textContent ?? '';
  switch (element.localName) {
    case 'mphantom':
      return [];
    case 'mspace':
      return [piece(' ', context)];
    case 'mi':
      return text
        ? [
            piece(
              text,
              context,
              element.getAttribute('mathvariant') !== 'normal' && SINGLE_LETTER.test(text),
            ),
          ]
        : [];
    case 'mo':
      if (!text) return [];
      if (context.scale === 1 && SPACED_OPERATORS.has(text)) return [piece(` ${text} `, context)];
      return [piece(text === ',' ? ', ' : text, context)];
    case 'mn':
    case 'mtext':
    case 'ms':
      return text ? [piece(text, context)] : [];
    case 'mfrac':
      return first && second
        ? [
            ...grouped(toLinear(first, context), context),
            piece('/', context),
            ...grouped(toLinear(second, context), context),
          ]
        : children.flatMap((child) => toLinear(child, context));
    case 'msqrt':
      return [
        piece('√', context),
        ...grouped(
          children.flatMap((child) => toLinear(child, context)),
          context,
        ),
      ];
    case 'mroot':
      return first && second
        ? [
            ...toLinear(second, scripted(context, SUPERSCRIPT_RISE)),
            piece('√', context),
            ...grouped(toLinear(first, context), context),
          ]
        : children.flatMap((child) => toLinear(child, context));
    case 'mover':
      if (first && second && element.getAttribute('accent') === 'true') {
        const accent = ACCENT_GLYPHS[(second.textContent ?? '').trim()] ?? second.textContent ?? '';
        return [...toLinear(first, context), piece(accent, scripted(context, SUPERSCRIPT_RISE))];
      }
      return first && second
        ? [...toLinear(first, context), ...toLinear(second, scripted(context, SUPERSCRIPT_RISE))]
        : children.flatMap((child) => toLinear(child, context));
    case 'msup':
      return first && second
        ? [...toLinear(first, context), ...toLinear(second, scripted(context, SUPERSCRIPT_RISE))]
        : children.flatMap((child) => toLinear(child, context));
    case 'msub':
    case 'munder':
      return first && second
        ? [...toLinear(first, context), ...toLinear(second, scripted(context, SUBSCRIPT_RISE))]
        : children.flatMap((child) => toLinear(child, context));
    case 'msubsup':
    case 'munderover':
      return first && second && third
        ? [
            ...toLinear(first, context),
            ...toLinear(second, scripted(context, SUBSCRIPT_RISE)),
            ...toLinear(third, scripted(context, SUPERSCRIPT_RISE)),
          ]
        : children.flatMap((child) => toLinear(child, context));
    case 'mtable':
      return children.flatMap((row, index) => [
        ...(index > 0 ? [piece(';  ', context)] : []),
        ...toLinear(row, context),
      ]);
    case 'mtr':
      return children.flatMap((cell, index) => [
        ...(index > 0 ? [piece('  ', context)] : []),
        ...toLinear(cell, context),
      ]);
    default:
      return children.flatMap((child) => toLinear(child, context));
  }
}

export function texToLinearMath(tex: string, displayMode: boolean): LinearMathPiece[][] {
  const base: LinearContext = { rise: 0, scale: 1 };
  const root = mathElement(tex, displayMode);
  if (!root) return [[piece(tex, base)]];
  const [only] = childElements(root);
  if (displayMode && only?.localName === 'mtable' && childElements(root).length === 1) {
    return childElements(only).map((row) => toLinear(row, base));
  }
  return [childElements(root).flatMap((child) => toLinear(child, base))];
}
