/**
 * How many trailing characters of `value` could still grow into `tag` once the
 * next chunk arrives. Text may be released up to that point; the retained
 * suffix is at most one character shorter than the tag, so a whole tag is
 * never withheld and text that could not be a tag is never held at all.
 */
export function longestTrailingTagPrefix(value: string, tag: string): number {
  const maxLength = Math.min(value.length, tag.length - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    if (value.endsWith(tag.slice(0, length))) return length;
  }
  return 0;
}
