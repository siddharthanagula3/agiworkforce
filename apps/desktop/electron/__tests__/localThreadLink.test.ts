import { describe, expect, it } from 'vitest';
import { approvedRootFor, readLocalThreadLink } from '../localThreadLink';

const FOLDER = '/Users/someone/project';

function link(threadId: string, folder: string | null): string {
  const query = folder === null ? '' : `?folder=${encodeURIComponent(folder)}`;
  return `agiworkforce-cloud://code/local/${threadId}${query}`;
}

describe('reading a CLI session hand-off link', () => {
  it('names the thread and the folder it runs in', () => {
    expect(readLocalThreadLink(link('1ea80b83-de37-440b-8815', FOLDER))).toEqual({
      kind: 'open',
      threadId: '1ea80b83-de37-440b-8815',
      folder: FOLDER,
    });
  });

  it('leaves every other link to the page', () => {
    for (const other of [
      'agiworkforce-cloud://code/home',
      'agiworkforce-cloud://code/abc123',
      'agiworkforce-cloud://chat/local/abc',
      'https://agiworkforce.com/code/local/abc?folder=%2Ftmp',
      'not a url',
    ]) {
      expect(readLocalThreadLink(other)).toEqual({ kind: 'not-local' });
    }
  });

  it('refuses a link without an absolute folder or with a thread id it cannot be', () => {
    expect(readLocalThreadLink(link('abc', null))).toEqual({ kind: 'invalid' });
    expect(readLocalThreadLink(link('abc', 'relative/path'))).toEqual({ kind: 'invalid' });
    expect(readLocalThreadLink(link('..%2F..%2Fetc', FOLDER))).toEqual({ kind: 'invalid' });
    expect(readLocalThreadLink(link('', FOLDER))).toEqual({ kind: 'invalid' });
    expect(readLocalThreadLink(link('a'.repeat(129), FOLDER))).toEqual({ kind: 'invalid' });
  });
});

describe('finding the approved folder a link names', () => {
  const roots = [
    { id: 'root-1', path: '/Users/someone/other' },
    { id: 'root-2', path: '/Users/someone/project' },
  ];

  it('matches the folder after resolving links in its path', () => {
    const resolve = (target: string) =>
      target === '/Users/someone/link-to-project' ? '/Users/someone/project' : target;
    expect(approvedRootFor('/Users/someone/link-to-project', roots, resolve)).toBe('root-2');
  });

  it('never matches a folder the user has not added, or one that does not exist', () => {
    expect(approvedRootFor('/Users/someone/project/sub', roots, (target) => target)).toBeNull();
    expect(
      approvedRootFor(FOLDER, roots, () => {
        throw new Error('ENOENT');
      }),
    ).toBeNull();
  });
});
