import 'server-only';

const FENCE_RE =
  /^<mcp_tool_(?:title|description)\s[^>]*>\n([^\n]*)\n([\s\S]*)\n<\/mcp_tool_(?:title|description)>$/;

const PREAMBLE_PREFIX = 'This text was published by a remote MCP server';

const XML_ENTITIES: ReadonlyArray<readonly [string, string]> = [
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&apos;', "'"],
  ['&amp;', '&'],
];

function unescapeXmlText(value: string): string {
  let result = value;
  for (const [entity, character] of XML_ENTITIES) {
    result = result.replaceAll(entity, character);
  }
  return result;
}

export function plainMcpServerText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const match = FENCE_RE.exec(value);
  if (!match) return value;
  const preamble = match[1];
  const body = match[2];
  if (preamble === undefined || body === undefined) return value;
  if (!preamble.startsWith(PREAMBLE_PREFIX)) return value;
  const plain = unescapeXmlText(body).trim();
  return plain.length > 0 ? plain : undefined;
}
