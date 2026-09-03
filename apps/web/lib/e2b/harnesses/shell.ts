const SINGLE_QUOTE = "'";
const ESCAPED_SINGLE_QUOTE = `'"'"'`;

export function quoteArgument(value: string): string {
  return `${SINGLE_QUOTE}${value.replaceAll(SINGLE_QUOTE, ESCAPED_SINGLE_QUOTE)}${SINGLE_QUOTE}`;
}

export function joinCommand(parts: readonly (string | null | undefined | false)[]): string {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
}
