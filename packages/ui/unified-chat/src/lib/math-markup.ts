import katex from 'katex';

export type MathOutput = 'mathml' | 'htmlAndMathml';

export type MathMarkup =
  { ok: true; markup: string; mathml: string } | { ok: false; reason: string };

const MATHML_START = '<math';
const MATHML_END = '</math>';

function mathmlPart(markup: string): string {
  const start = markup.indexOf(MATHML_START);
  const end = markup.lastIndexOf(MATHML_END);
  return start >= 0 && end > start ? markup.slice(start, end + MATHML_END.length) : '';
}

export function renderMathMarkup(
  tex: string,
  display: boolean,
  output: MathOutput = 'mathml',
): MathMarkup {
  try {
    const markup = katex.renderToString(tex, {
      displayMode: display,
      output,
      throwOnError: true,
      strict: 'ignore',
    });
    return { ok: true, markup, mathml: output === 'mathml' ? markup : mathmlPart(markup) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
