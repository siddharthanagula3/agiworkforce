import { codeRanges, normalizeMathDelimiters } from '@agiworkforce/utils/markdown-source';

// remark-math reads `$$x$$` written on one line as inline math, while `\[x\]`
// normalizes to a fenced block and renders as display math. Models emit both
// for the same intent, so the one-line form is lifted onto its own fence too.
const SINGLE_LINE_DISPLAY_MATH =
  /(^|\n)[ \t]*\$\$(?!\s*$)([^\n$](?:[^\n]*[^\n$])?)\$\$[ \t]*(?=\n|$)/g;

export function preprocessMath(content: string): string {
  const normalized = normalizeMathDelimiters(content);
  const code = codeRanges(normalized);
  return normalized.replace(
    SINGLE_LINE_DISPLAY_MATH,
    (match: string, lead: string, body: string, offset: number) => {
      const open = offset + match.indexOf('$$', lead.length);
      if (body.includes('$$') || code.some(([start, end]) => open >= start && open < end)) {
        return match;
      }
      return `${lead}\n$$\n${body.trim()}\n$$\n`;
    },
  );
}
