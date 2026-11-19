import katexMathStyles from '@/assets/katex-math-styles.json';

interface KatexFontFace {
  style: string;
  weight: string;
  rule: string;
}

interface KatexFaceRule {
  className: string;
  root: boolean;
  family: string | null;
  style: string | null;
  weight: string | null;
}

interface KatexMathStyles {
  katexVersion: string;
  stylesheet: string;
  fontFaces: Record<string, KatexFontFace[]>;
  fontClasses: ReadonlyArray<{ family: string; classes: readonly string[] }>;
  faceRules: readonly KatexFaceRule[];
}

interface ComputedFace {
  family: string;
  style: string;
  weight: string;
}

const styles: KatexMathStyles = katexMathStyles;
const CLASS_ATTRIBUTE = /\bclass="([^"]*)"/g;
const TAG = /<(\/?)([A-Za-z][^\s/>]*)([^>]*)>/g;
const FONT_IN_STYLE_ATTRIBUTE = /\bstyle="[^"]*\bfont/;
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

function classesIn(markup: string): Set<string> {
  const classes = new Set<string>();
  CLASS_ATTRIBUTE.lastIndex = 0;
  for (let match = CLASS_ATTRIBUTE.exec(markup); match; match = CLASS_ATTRIBUTE.exec(markup)) {
    for (const name of match[1]!.split(/\s+/)) if (name) classes.add(name);
  }
  return classes;
}

export function katexFontFamilies(markup: string): string[] {
  const classes = classesIn(markup);
  const families = new Set<string>();
  for (const { family, classes: required } of styles.fontClasses) {
    if (required.every((name) => classes.has(name))) families.add(family);
  }
  return [...families];
}

function faceOf(parent: ComputedFace | null, classes: Set<string>): ComputedFace | null {
  let face = parent;
  for (const rule of styles.faceRules) {
    if (!classes.has(rule.className) || (!face && !rule.root)) continue;
    face = {
      family: rule.family ?? face?.family ?? '',
      style: rule.style ?? face?.style ?? 'normal',
      weight: rule.weight ?? face?.weight ?? '400',
    };
  }
  return face;
}

function computedFaces(markup: string): ComputedFace[] | null {
  const open: Array<{ tag: string; face: ComputedFace | null }> = [];
  const faces: ComputedFace[] = [];
  TAG.lastIndex = 0;
  for (let match = TAG.exec(markup); match; match = TAG.exec(markup)) {
    const [, closing, name, attributes = ''] = match;
    const tag = name!.toLowerCase();
    if (closing) {
      if (open.pop()?.tag !== tag) return null;
      continue;
    }
    if (FONT_IN_STYLE_ATTRIBUTE.test(attributes)) return null;
    const face = faceOf(open[open.length - 1]?.face ?? null, classesIn(attributes));
    if (face) faces.push(face);
    if (!VOID_ELEMENTS.has(tag) && !attributes.endsWith('/')) open.push({ tag, face });
  }
  return open.length === 0 ? faces : null;
}

function fontFacesFor(family: string, used: ComputedFace[] | null): string[] {
  const all = styles.fontFaces[family] ?? [];
  const wanted = used?.filter((face) => face.family === family) ?? [];
  const matches = (face: KatexFontFace) =>
    wanted.some((want) => want.style === face.style && want.weight === face.weight);
  const everyWantedFaceExists = wanted.every((want) =>
    all.some((face) => want.style === face.style && want.weight === face.weight),
  );
  const chosen = wanted.length > 0 && everyWantedFaceExists ? all.filter(matches) : all;
  return chosen.map((face) => face.rule);
}

export function katexStylesFor(markup: string): string {
  const used = computedFaces(markup);
  const faces = katexFontFamilies(markup).flatMap((family) => fontFacesFor(family, used));
  return faces.join('') + styles.stylesheet;
}
