const HIDDEN = /[\p{Cf}\p{Zl}\p{Zp}]|[^\P{Cc}\n\t]/gu;
const LINE_BREAK = /\r\n|\n/gu;
const TAB = /\t/gu;
/**
 * Characters that are letters or marks to Unicode and draw as nothing: the
 * Hangul fillers, the braille blank, the combining grapheme joiner and the
 * Khmer inherent vowels. None is a format character, so `HIDDEN` misses them.
 */
const FILLER = /\u034f|\u17b4|\u17b5|[\u115f\u1160\u2800\u3164\uffa0]/gu;
/** Every space that is not the ordinary one: no-break, en, em, ideographic and the rest. */
const ODD_SPACE = /(?! )\p{Zs}/gu;
const BLANK_RUN = /[ \u2423]{4,}/gu;

export const LINE_BREAK_MARK = '⏎';
export const TAB_MARK = '⇥';
export const HIDDEN_MARK = '�';
export const ODD_SPACE_MARK = '\u2423';

/**
 * Blank space as something that can be seen. A long run of blanks pushes what
 * follows it out of sight on the same line, where it reads as the end: a
 * command, then 1,400 spaces, then what it really does. A run is drawn as a
 * count, an unusual space as a mark, and a character that draws as nothing
 * as the replacement mark.
 */
function visibleBlanks(text: string): string {
  return text
    .replace(FILLER, HIDDEN_MARK)
    .replace(ODD_SPACE, ODD_SPACE_MARK)
    .replace(BLANK_RUN, (run) => ` [${run.length} blank characters] `);
}

/**
 * Text that did not come from this app, as a native dialog can be trusted to
 * show it. It stays on the one line the app gave it: a line break is drawn as
 * a return mark and a tab as a tab mark, so a value cannot start a line of its
 * own that reads as the app's. Every character that would hide or reorder what
 * follows it is drawn as a replacement mark, and blank space that could push
 * the rest of the line out of sight is drawn as a count.
 */
export function visibleInDialog(text: string): string {
  return visibleBlanks(
    text.replace(LINE_BREAK, LINE_BREAK_MARK).replace(TAB, TAB_MARK).replace(HIDDEN, HIDDEN_MARK),
  );
}

/**
 * Text of several lines, as a native dialog or notification can be trusted to
 * show it: its line breaks stay, and every character that would hide or
 * reorder what follows is drawn as a replacement mark. This is what every
 * native surface applies to all of its text on the way out, whoever wrote it.
 * It does not stop a value from starting a line of its own; `visibleInDialog`
 * does, and a value from outside the app goes through that first.
 */
export function visibleLines(text: string): string {
  return visibleBlanks(text.replace(HIDDEN, HIDDEN_MARK));
}

/**
 * Text too long for a dialog keeps both ends and says, in the app's own
 * words, how much of the middle is missing, rather than ending early as if
 * that were all of it: a command opens with what it runs, and what was
 * appended to it is at the end.
 */
export function headAndTail(
  text: string,
  shown: { head: number; tail: number },
  missing: (hidden: number) => string = (hidden) => ` [${hidden} characters not shown] `,
): string {
  if (text.length <= shown.head + shown.tail) return text;
  const hidden = text.length - shown.head - shown.tail;
  return `${text.slice(0, shown.head)}${missing(hidden)}${text.slice(-shown.tail)}`;
}

/** One value from outside this app, on one line, with both ends kept when it is long. */
export function shownValue(
  value: string,
  shown: { head: number; tail: number },
  missing?: (hidden: number) => string,
): string {
  return headAndTail(visibleInDialog(value), shown, missing);
}

/**
 * The line every dialog draws between what this app says and what it only
 * repeats. Text from a request, a project file or another program goes below
 * it, each value on a line this app labelled.
 */
export const APP_NAME = 'AGI Cloud';

export const NOT_THIS_APP = `Nothing below this line is ${APP_NAME} speaking.`;
