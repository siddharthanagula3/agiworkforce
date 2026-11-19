import katex from 'katex';

export type MathMarkup = { ok: true; markup: string } | { ok: false; reason: string };

export function renderMathMarkup(tex: string, display: boolean): MathMarkup {
  try {
    return {
      ok: true,
      markup: katex.renderToString(tex, {
        displayMode: display,
        output: 'mathml',
        throwOnError: true,
        strict: 'ignore',
      }),
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
