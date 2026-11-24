const SLACK_DISPLAY_NAME_LIMIT = 64;
const SPOOFING_CONTROLS =
  /[\p{Cc}\u00ad\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff\u{E0000}-\u{E007F}\p{Zl}\p{Zp}]/gu;
const JOINERS = /[\u200c\u200d]/gu;
const WHITESPACE_RUN = /\s+/gu;
const JOINER_BEFORE = /(?:\p{L}|\p{M})$/u;
const JOINER_AFTER = /^(?:\p{L}|\p{M})/u;
const LATIN = /\p{Script=Latin}/u;
const EMOJI_BEFORE = /\p{Extended_Pictographic}️?\p{Emoji_Modifier}?$/u;
const EMOJI_AFTER = /^\p{Extended_Pictographic}/u;

function keepJoiner(joiner: string, before: string, after: string): boolean {
  if (joiner === '\u200d' && EMOJI_BEFORE.test(before) && EMOJI_AFTER.test(after)) return true;
  if (!JOINER_BEFORE.test(before) || !JOINER_AFTER.test(after)) return false;
  const previous = Array.from(before).pop() ?? '';
  const next = Array.from(after)[0] ?? '';
  return !LATIN.test(previous) && !LATIN.test(next);
}

export function sanitizeSlackDisplayName(name: string): string {
  const collapsed = name
    .replace(SPOOFING_CONTROLS, ' ')
    .replace(JOINERS, (joiner, offset: number, source: string) =>
      keepJoiner(joiner, source.slice(0, offset), source.slice(offset + 1)) ? joiner : '',
    )
    .replace(WHITESPACE_RUN, ' ')
    .trim();
  const characters = Array.from(collapsed);
  if (characters.length <= SLACK_DISPLAY_NAME_LIMIT) return collapsed;
  return `${characters
    .slice(0, SLACK_DISPLAY_NAME_LIMIT - 1)
    .join('')
    .trimEnd()}…`;
}
