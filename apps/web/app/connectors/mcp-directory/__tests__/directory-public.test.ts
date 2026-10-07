import { describe, expect, it } from 'vitest';

import { directoryRecordFixture } from '@/lib/connectors/__tests__/directory-record-fixture';
import {
  BASE_PATH,
  directoryRecordIdCandidates,
  directoryRecordPath,
  isIndexableDirectoryRecord,
  safeExternalUrl,
} from '../directory-public';

describe('public directory record paths', () => {
  it.each(['org/server', 'a server', 'literal%value', 'org/a server%'])('round trips %s', (id) => {
    const segments = directoryRecordPath(id)
      .slice(BASE_PATH.length + 1)
      .split('/');
    expect(directoryRecordIdCandidates(segments)).toContain(id);
    expect(directoryRecordIdCandidates(segments.map(decodeURIComponent))).toContain(id);
  });

  it('does not throw on malformed encoded text', () => {
    expect(directoryRecordIdCandidates(['%E0%A4%A'])).toEqual(['%E0%A4%A']);
  });
});

describe('public directory publisher links', () => {
  it.each(['javascript:alert(1)', 'data:text/html,test', '/relative', 'invalid', null])(
    'rejects %s',
    (value) => expect(safeExternalUrl(value)).toBeNull(),
  );

  it.each(['http://publisher.example/docs', 'https://publisher.example/docs'])(
    'accepts %s',
    (url) => {
      expect(safeExternalUrl(url)).toBe(url);
    },
  );

  it.each([
    { description: '', documentationUrl: 'https://publisher.example/docs', expected: false },
    { description: 'Description', documentationUrl: null, expected: false },
    { description: 'Description', documentationUrl: 'javascript:alert(1)', expected: false },
    {
      description: 'Description',
      documentationUrl: 'https://publisher.example/docs',
      expected: true,
    },
  ])('indexes only described records with a safe publisher link', ({ expected, ...fields }) => {
    expect(
      isIndexableDirectoryRecord(
        directoryRecordFixture({ id: 'server', name: 'Server', ...fields }),
      ),
    ).toBe(expected);
  });
});
