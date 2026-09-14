import { describe, expect, it } from 'vitest';
import {
  buildCliContextHandoffCommand,
  buildCliContextHandoffUri,
  buildVsCodeContextHandoffUri,
  encodeLocalContextHandoffQuery,
  MAX_CONTEXT_HANDOFF_SELECTION_CHARS,
  parseLocalContextHandoffQuery,
  VSCODE_CONTEXT_HANDOFF_AUTHORITY,
  type LocalContextHandoff,
} from '../context-handoff-uri';

const HANDOFF: LocalContextHandoff = {
  id: 'ctx_12345678',
  sourceUrl: 'https://example.com/docs',
  selectedText: "pick this up's & that",
};

describe('local context handoff links', () => {
  it('carries the whole selection back out of the link it minted', () => {
    expect(parseLocalContextHandoffQuery(encodeLocalContextHandoffQuery(HANDOFF))).toEqual(HANDOFF);
  });

  it('addresses the VS Code extension and the CLI flag', () => {
    expect(buildVsCodeContextHandoffUri(HANDOFF)).toContain(
      `vscode://${VSCODE_CONTEXT_HANDOFF_AUTHORITY}/handoff?`,
    );
    expect(buildCliContextHandoffCommand(HANDOFF)).toBe(
      `agi --context-url '${buildCliContextHandoffUri(HANDOFF)}'`,
    );
  });

  it('leaves no shell metacharacter unescaped inside the copied command', () => {
    const command = buildCliContextHandoffCommand({
      ...HANDOFF,
      selectedText: `a'b"c $(rm -rf /) \`id\` ; echo`,
    });

    expect(command.match(/'/g)).toHaveLength(2);
    expect(command).not.toContain('$(');
    expect(command).not.toContain('`');
  });

  it('refuses a link whose source page is not an http or https page', () => {
    expect(() =>
      encodeLocalContextHandoffQuery({ ...HANDOFF, sourceUrl: 'file:///etc/passwd' }),
    ).toThrow();
    expect(
      parseLocalContextHandoffQuery('v=1&id=ctx_12345678&url=javascript%3Aalert(1)&text=hi'),
    ).toBeNull();
  });

  it('refuses a source page that still carries a query or fragment', () => {
    expect(() =>
      encodeLocalContextHandoffQuery({ ...HANDOFF, sourceUrl: 'https://example.com/d?token=abc' }),
    ).toThrow();
  });

  it('refuses a version, an identifier, or a selection it does not recognise', () => {
    const query = encodeLocalContextHandoffQuery(HANDOFF);

    expect(parseLocalContextHandoffQuery(query.replace('v=1', 'v=2'))).toBeNull();
    expect(parseLocalContextHandoffQuery(query.replace('id=ctx_12345678', 'id=ctx_1'))).toBeNull();
    expect(
      parseLocalContextHandoffQuery('v=1&id=ctx_12345678&url=https%3A%2F%2Fe.com%2Fa'),
    ).toBeNull();
    expect(() =>
      encodeLocalContextHandoffQuery({
        ...HANDOFF,
        selectedText: 'x'.repeat(MAX_CONTEXT_HANDOFF_SELECTION_CHARS + 1),
      }),
    ).toThrow();
  });
});
