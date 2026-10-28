const LINE_BREAK = /\r?\n/;
const HEADING_MARKER = /^\s{0,3}#{1,6}\s+/;
const QUOTE_MARKER = /^\s*>\s?/;
const INLINE_MARKERS = /\*\*|__|`+/g;
const WHITESPACE_RUN = /\s+/g;

const SERVER_PROVISIONAL_LENGTH = 50;
const CLIENT_PROVISIONAL_LENGTH = 60;

export function plainTitleText(content: string): string {
  return content
    .split(LINE_BREAK)
    .map((line) => line.replace(HEADING_MARKER, '').replace(QUOTE_MARKER, '').trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(INLINE_MARKERS, '')
    .replace(WHITESPACE_RUN, ' ')
    .trim();
}

export function serverProvisionalTitle(firstUserContent: string): string {
  const plain = plainTitleText(firstUserContent);
  return plain.length > SERVER_PROVISIONAL_LENGTH
    ? `${plain.slice(0, SERVER_PROVISIONAL_LENGTH)}...`
    : plain;
}

export function clientProvisionalTitle(firstUserContent: string): string {
  return plainTitleText(firstUserContent).slice(0, CLIENT_PROVISIONAL_LENGTH);
}
