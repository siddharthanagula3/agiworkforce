import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
const declaration = program.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'composerUploadFetch',
);
if (!declaration) throw new Error('composerUploadFetch was not found in the side panel');

const GATEWAY = 'https://agi.example';

function composerUploadFetch(fetchImpl: typeof fetch) {
  const compiled = ts.transpileModule(
    `${declaration!.getText(program)}\nreturn composerUploadFetch;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned side panel code inside this isolated test fixture.
  return new Function('FREE_TRIAL_GATEWAY', 'fetch', compiled.outputText)(GATEWAY, fetchImpl) as (
    getHeaders: () => Promise<HeadersInit>,
  ) => typeof fetch;
}

describe('composer attachment uploads', () => {
  it('signs the same-origin relay upload with the account session', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const upload = composerUploadFetch(fetchImpl as unknown as typeof fetch)(async () => ({
      Authorization: 'Bearer session-token',
      'X-Requested-With': 'XMLHttpRequest',
    }));

    await upload(`${GATEWAY}/api/uploads/chat-attachment/put?key=chat-attachments%2Fu%2Ff.txt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain', 'x-csrf-token': '' },
      body: 'memo',
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${GATEWAY}/api/uploads/chat-attachment/put?key=chat-attachments%2Fu%2Ff.txt`);
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer session-token');
    expect(headers.get('content-type')).toBe('text/plain');
    expect(init.method).toBe('PUT');
  });

  it('never sends the session to a storage host', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const getHeaders = vi.fn(async () => ({ Authorization: 'Bearer session-token' }));
    const upload = composerUploadFetch(fetchImpl as unknown as typeof fetch)(getHeaders);

    await upload('https://bucket.r2.cloudflarestorage.com/object?signature=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'memo',
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBeNull();
    expect(getHeaders).not.toHaveBeenCalled();
  });
});
