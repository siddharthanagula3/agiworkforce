import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { describeOutboundRefusal } from '../core/outboundContentGuard';

const realpath = vi.hoisted(() => vi.fn<(path: string) => string>());

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<MockedModule0>()),
  realpathSync: realpath,
}));

function documentAt(path: string, scheme = 'file'): vscode.TextDocument {
  return {
    uri: vscode.Uri.file(path).with({ scheme }),
    getText: vi.fn(),
  } as unknown as vscode.TextDocument;
}

beforeEach(() => {
  vscode.workspace.isTrusted = true;
  realpath.mockReset().mockImplementation((path) => path);
});

afterEach(() => {
  vscode.workspace.isTrusted = true;
});

describe('outbound content path policy', () => {
  it('refuses an untrusted workspace before examining any document or resolving paths', () => {
    vscode.workspace.isTrusted = false;

    expect(describeOutboundRefusal()).toMatch(/not trusted/);
    expect(describeOutboundRefusal(documentAt('/workspace/src/app.ts'))).toMatch(/not trusted/);
    expect(describeOutboundRefusal(documentAt('Untitled-1', 'untitled'))).toMatch(/not trusted/);
    expect(realpath).not.toHaveBeenCalled();
  });

  it('allows document-free operations in a trusted workspace without resolving a path', () => {
    expect(describeOutboundRefusal()).toBeNull();
    expect(realpath).not.toHaveBeenCalled();
  });

  it.each(['untitled', 'git', 'vscode-notebook-cell', 'custom-provider'])(
    'preserves the existing %s document behavior without filesystem resolution',
    (scheme) => {
      expect(describeOutboundRefusal(documentAt('/workspace/.env', scheme))).toBeNull();
      expect(realpath).not.toHaveBeenCalled();
    },
  );

  describe.each(['file', 'vscode-remote'])('%s documents', (scheme) => {
    it('rejects the visible credential path even if its target would be ordinary source', () => {
      realpath.mockReturnValue('/workspace/src/app.ts');

      expect(describeOutboundRefusal(documentAt('/workspace/.env', scheme))).toMatch(
        /credential-file policy/,
      );
      expect(realpath).not.toHaveBeenCalled();
    });

    it.each([
      ['/workspace/src/app.ts', '/workspace/.env'],
      ['/workspace/linked/config', '/home/example/.ssh/config'],
      ['/workspace/.env.example', '/workspace/.env.production'],
      ['C:\\workspace\\src\\app.ts', 'C:\\Users\\example\\.ssh\\config'],
    ])('rejects a credential target for %s', (visiblePath, resolvedPath) => {
      realpath.mockReturnValue(resolvedPath);
      const document = documentAt(visiblePath, scheme);

      expect(describeOutboundRefusal(document)).toMatch(/credential-file policy/);
      expect(realpath).toHaveBeenCalledWith(visiblePath);
      expect(document.getText).not.toHaveBeenCalled();
    });

    it.each(['/workspace/src/app.ts', '/workspace/.env.example'])(
      'allows a safely resolved ordinary source or environment template: %s',
      (path) => {
        expect(describeOutboundRefusal(documentAt(path, scheme))).toBeNull();
        expect(realpath).toHaveBeenCalledWith(path);
      },
    );

    it('allows a non-credential alias without replacing the document URI', () => {
      const document = documentAt('/workspace/linked/app.ts', scheme);
      const uri = document.uri.with({ authority: 'ssh-remote+fixture', query: 'version=1' });
      const withAuthority = { ...document, uri } as vscode.TextDocument;
      realpath.mockReturnValue('/workspace/src/app.ts');

      expect(describeOutboundRefusal(withAuthority)).toBeNull();
      expect(realpath).toHaveBeenCalledWith(uri.fsPath);
      expect(withAuthority.uri).toBe(uri);
    });

    it.each(['ENOENT', 'EACCES', 'ELOOP'])(
      'fails closed when filesystem resolution reports %s',
      (code) => {
        realpath.mockImplementation(() => {
          throw Object.assign(new Error('Synthetic filesystem failure'), { code });
        });
        const document = documentAt('/workspace/src/app.ts', scheme);

        expect(describeOutboundRefusal(document)).toMatch(/could not be safely resolved/);
        expect(document.getText).not.toHaveBeenCalled();
      },
    );
  });
});

type MockedModule0 = typeof import('node:fs');
