import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { settleAppIdentity, USER_DATA_FOLDER } from '../userDataLocation';

function fakeApp() {
  const calls: string[] = [];
  const paths = new Map<string, string>();
  return {
    calls,
    paths,
    getPath: (name: 'appData') => {
      calls.push(`getPath:${name}`);
      return '/Users/someone/Library/Application Support';
    },
    setPath: (name: 'userData', value: string) => {
      calls.push(`setPath:${name}`);
      paths.set(name, value);
    },
    setName: (name: string) => {
      calls.push(`setName:${name}`);
    },
  };
}

describe('settleAppIdentity', () => {
  it('keeps existing installs on the data folder they already use', () => {
    const app = fakeApp();
    settleAppIdentity(app);
    expect(USER_DATA_FOLDER).toBe('AGI Cloud');
    expect(app.paths.get('userData')).toBe(
      path.join('/Users/someone/Library/Application Support', 'AGI Cloud'),
    );
  });

  it('pins the data folder before the new name could move it', () => {
    const app = fakeApp();
    settleAppIdentity(app);
    expect(app.calls).toEqual(['getPath:appData', 'setPath:userData', 'setName:AGI Desktop']);
  });
});
