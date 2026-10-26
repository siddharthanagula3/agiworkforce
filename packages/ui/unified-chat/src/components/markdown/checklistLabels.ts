const HYPHENATED_LABEL = /[A-Z][a-z]+(?:-[a-z]+)+/;
const TASK_LABEL =
  /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\][ \t]+)([A-Z][a-z]+(?:-[a-z]+)+)([ \t]*)$/gm;
const HTML_TEXT_LABEL = />(\s*)([A-Z][a-z]+(?:-[a-z]+)+)(\s*)</g;

function spaced(label: string): string {
  return label.replaceAll('-', ' ');
}

/**
 * A checklist label that was stored as a slug (`Verify-chat-rendering`) is shown
 * with the spaces the user asked for. Real hyphenated words that start in
 * lowercase, and labels that already have spaces, are left alone.
 */
export function restoreHyphenatedLabels(source: string): string {
  if (!HYPHENATED_LABEL.test(source)) return source;
  return source
    .replace(
      TASK_LABEL,
      (_match, lead: string, label: string, tail: string) => `${lead}${spaced(label)}${tail}`,
    )
    .replace(
      HTML_TEXT_LABEL,
      (_match, before: string, label: string, after: string) =>
        `>${before}${spaced(label)}${after}<`,
    );
}
