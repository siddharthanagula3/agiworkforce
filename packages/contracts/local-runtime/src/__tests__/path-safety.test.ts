import { describe, expect, it } from 'vitest';
import {
  isAbsolutePath,
  isGrantableRoot,
  isPathInside,
  isUncPath,
  relativeWithinRoot,
  toComparableSegments,
} from '../path-safety';

const posix = { platform: 'posix' } as const;
const win32 = { platform: 'win32' } as const;

describe('isPathInside on posix', () => {
  it('accepts the root itself and its descendants', () => {
    expect(isPathInside('/home/u/proj', '/home/u/proj', posix)).toBe(true);
    expect(isPathInside('/home/u/proj', '/home/u/proj/src/index.ts', posix)).toBe(true);
  });

  it('rejects a sibling whose name merely extends the root', () => {
    expect(isPathInside('/home/u/proj', '/home/u/proj-secrets', posix)).toBe(false);
    expect(isPathInside('/home/u/proj', '/home/u/project/src', posix)).toBe(false);
  });

  it('rejects an ancestor of the root', () => {
    expect(isPathInside('/home/u/proj', '/home/u', posix)).toBe(false);
    expect(isPathInside('/home/u/proj', '/', posix)).toBe(false);
  });

  it('rejects a candidate that still carries traversal segments', () => {
    expect(isPathInside('/home/u/proj', '/home/u/proj/../secrets', posix)).toBe(false);
    expect(isPathInside('/home/u/proj', '/home/u/proj/./src', posix)).toBe(false);
  });

  it('rejects a relative candidate rather than resolving it', () => {
    expect(isPathInside('/home/u/proj', 'src/index.ts', posix)).toBe(false);
    expect(isPathInside('home/u/proj', '/home/u/proj/src', posix)).toBe(false);
  });

  it('rejects a NUL-truncation attempt', () => {
    expect(isPathInside('/home/u/proj', '/home/u/proj\0/../../etc/passwd', posix)).toBe(false);
  });

  it('is case-sensitive by default on posix', () => {
    expect(isPathInside('/home/u/proj', '/home/u/PROJ/src', posix)).toBe(false);
    expect(
      isPathInside('/home/u/proj', '/home/u/PROJ/src', { ...posix, caseSensitive: false }),
    ).toBe(true);
  });

  it('tolerates redundant separators', () => {
    expect(isPathInside('/home/u/proj/', '/home/u/proj//src', posix)).toBe(true);
  });
});

describe('isPathInside on win32', () => {
  it('accepts descendants and normalises separators', () => {
    expect(isPathInside('C:\\work\\proj', 'C:\\work\\proj\\src\\a.ts', win32)).toBe(true);
    expect(isPathInside('C:\\work\\proj', 'C:/work/proj/src/a.ts', win32)).toBe(true);
  });

  it('is case-insensitive by default', () => {
    expect(isPathInside('C:\\work\\proj', 'c:\\WORK\\Proj\\src', win32)).toBe(true);
  });

  it('rejects a sibling extending the root name', () => {
    expect(isPathInside('C:\\work\\proj', 'C:\\work\\proj-old\\a.ts', win32)).toBe(false);
  });

  it('rejects a different drive', () => {
    expect(isPathInside('C:\\work\\proj', 'D:\\work\\proj\\a.ts', win32)).toBe(false);
  });

  it('rejects a drive-relative path', () => {
    expect(isPathInside('C:\\work\\proj', 'C:work\\proj\\a.ts', win32)).toBe(false);
  });
});

describe('toComparableSegments', () => {
  it('returns null for a bare windows drive with no root separator', () => {
    expect(toComparableSegments('C:', 'win32', false)).toBeNull();
  });

  it('keeps the drive as the first segment', () => {
    expect(toComparableSegments('C:\\work', 'win32', false)).toEqual(['c:', 'work']);
  });

  it('returns an empty segment list for the posix root', () => {
    expect(toComparableSegments('/', 'posix', true)).toEqual([]);
  });
});

describe('relativeWithinRoot', () => {
  it('returns an empty string for the root itself', () => {
    expect(relativeWithinRoot('/home/u/proj', '/home/u/proj', posix)).toBe('');
  });

  it('returns a posix-separated relative path on both platforms', () => {
    expect(relativeWithinRoot('/home/u/proj', '/home/u/proj/src/a.ts', posix)).toBe('src/a.ts');
    expect(relativeWithinRoot('C:\\work\\proj', 'C:\\work\\proj\\src\\a.ts', win32)).toBe(
      'src/a.ts',
    );
  });

  it('returns null when outside', () => {
    expect(relativeWithinRoot('/home/u/proj', '/home/u/other', posix)).toBeNull();
  });
});

describe('isUncPath and isAbsolutePath', () => {
  it('recognises UNC in both slash styles', () => {
    expect(isUncPath('\\\\server\\share')).toBe(true);
    expect(isUncPath('//server/share')).toBe(true);
    expect(isUncPath('C:\\work')).toBe(false);
  });

  it('classifies absolute paths per platform', () => {
    expect(isAbsolutePath('/home', 'posix')).toBe(true);
    expect(isAbsolutePath('C:\\work', 'win32')).toBe(true);
    expect(isAbsolutePath('/home', 'win32')).toBe(false);
    expect(isAbsolutePath('work', 'posix')).toBe(false);
  });
});

describe('isGrantableRoot', () => {
  it('refuses network shares', () => {
    expect(isGrantableRoot('\\\\server\\share', 'win32')).toBe(false);
  });

  it('refuses the filesystem root', () => {
    expect(isGrantableRoot('/', 'posix')).toBe(false);
    expect(isGrantableRoot('C:\\', 'win32')).toBe(false);
  });

  it('refuses the home directory itself but allows a folder inside it', () => {
    expect(isGrantableRoot('/Users/sid', 'posix', '/Users/sid')).toBe(false);
    expect(isGrantableRoot('/Users/sid/code', 'posix', '/Users/sid')).toBe(true);
  });

  // Each of these was grantable: the folder of every user, the system's own,
  // the home folder under its other path, and the places keys are kept.
  it.each([
    '/Users',
    '/home',
    '/private',
    '/private/var',
    '/tmp',
    '/Library',
    '/Applications',
    '/Volumes',
    '/System/Volumes/Data',
    '/System/Volumes/Data/Users',
    '/System/Volumes/Data/Users/sid',
    '/USERS/SID',
    '/Users/sid/Library',
    '/Users/sid/Library/Application Support',
    '/Users/sid/Library/Keychains',
    '/Users/sid/.ssh',
    '/Users/sid/.ssh/keys',
    '/Users/sid/.config',
    '/Users/sid/.aws',
    '/Users/sid/.claude',
    '/System/Volumes/Data/Users/sid/.ssh',
  ])('refuses %s', (root) => {
    expect(isGrantableRoot(root, 'posix', ['/Users/sid'])).toBe(false);
  });

  it('refuses the home folder by any spelling it is given under, and what is above each', () => {
    const homes = ['/Users/sid', '/Volumes/External/homes/sid'];
    for (const root of ['/Users/sid', '/Volumes/External/homes/sid', '/Volumes/External/homes']) {
      expect(isGrantableRoot(root, 'posix', homes), root).toBe(false);
    }
    expect(isGrantableRoot('/Volumes/External/homes/sid/code', 'posix', homes)).toBe(true);
  });

  it.each([
    '/Users/sid/code',
    '/Users/sid/Documents/notes',
    '/Users/sid/.config/nvim',
    '/Users/sid/.claude/skills/mine',
    '/Users/sid/Library/Mobile Documents/com~apple~CloudDocs/project',
    '/System/Volumes/Data/Users/sid/code',
    '/Users/other/shared-project',
    '/Volumes/External/project',
    '/opt/work/app',
    '/tmp/scratch-project',
    '/workspace',
  ])('still allows %s', (root) => {
    expect(isGrantableRoot(root, 'posix', ['/Users/sid'])).toBe(true);
  });

  it('refuses the Windows system folders and the folder of every user', () => {
    for (const root of ['C:\\Windows', 'C:\\Users', 'C:\\Program Files', 'c:\\programdata']) {
      expect(isGrantableRoot(root, 'win32', 'C:\\Users\\sid'), root).toBe(false);
    }
    expect(isGrantableRoot('C:\\Users\\sid\\.ssh', 'win32', 'C:\\Users\\sid')).toBe(false);
    expect(isGrantableRoot('C:\\Users\\sid\\code', 'win32', 'C:\\Users\\sid')).toBe(true);
  });

  it('allows an ordinary project directory', () => {
    expect(isGrantableRoot('/Users/sid/code/app', 'posix', '/Users/sid')).toBe(true);
    expect(isGrantableRoot('C:\\work\\app', 'win32', 'C:\\Users\\sid')).toBe(true);
  });
});
