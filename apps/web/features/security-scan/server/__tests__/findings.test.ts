import { describe, expect, it } from 'vitest';

import {
  anchorCandidate,
  buildUnifiedPatch,
  findingId,
  locateEvidence,
  parseScanResponse,
  parseVerificationResponse,
  type CandidateFinding,
} from '../findings';

const SOURCE = [
  "import { db } from './db';",
  '',
  'export async function findUser(req, res) {',
  '  const id = req.query.id;',
  '  const rows = await db.query(`select * from users where id = ${id}`);',
  '  res.json(rows);',
  '}',
  '',
].join('\n');

function candidate(overrides: Partial<CandidateFinding> = {}): CandidateFinding {
  return {
    path: 'src/users.ts',
    line: 5,
    severity: 'high',
    category: 'sql-injection',
    title: 'SQL injection in findUser',
    explanation: 'The id query parameter is interpolated into SQL.',
    evidence: '  const rows = await db.query(`select * from users where id = ${id}`);',
    fix: {
      original: 'db.query(`select * from users where id = ${id}`)',
      replacement: "db.query('select * from users where id = $1', [id])",
    },
    ...overrides,
  };
}

describe('parseScanResponse', () => {
  it('reads findings from a JSON answer wrapped in prose', () => {
    const text = `Here you go:\n${JSON.stringify({ findings: [candidate()] })}\nDone.`;
    expect(parseScanResponse(text)).toHaveLength(1);
  });

  it('refuses an answer outside the schema', () => {
    expect(parseScanResponse('{"findings":[{"path":"a"}]}')).toBeNull();
    expect(parseScanResponse('no json here')).toBeNull();
    expect(
      parseScanResponse(JSON.stringify({ findings: [candidate({ severity: 'info' as never })] })),
    ).toBeNull();
  });
});

describe('parseVerificationResponse', () => {
  it('maps verdicts by finding id', () => {
    const verdicts = parseVerificationResponse(
      JSON.stringify({
        verdicts: [{ id: 'abc', verdict: 'confirmed', reason: 'Reachable from the query.' }],
      }),
    );
    expect(verdicts?.get('abc')?.verdict).toBe('confirmed');
  });

  it('refuses a verdict it does not recognise', () => {
    expect(
      parseVerificationResponse(
        JSON.stringify({ verdicts: [{ id: 'abc', verdict: 'maybe', reason: 'x' }] }),
      ),
    ).toBeNull();
  });
});

describe('locateEvidence', () => {
  it('finds the evidence near the reported line, ignoring indentation', () => {
    expect(locateEvidence(SOURCE, 'const id = req.query.id;', 4)).toEqual({
      firstLine: 4,
      lastLine: 4,
    });
  });

  it('refuses evidence the file does not contain or that sits far from the line', () => {
    expect(locateEvidence(SOURCE, 'runUntrusted(input)', 4)).toBeNull();
    expect(locateEvidence(SOURCE, "import { db } from './db';", 7)).toBeNull();
    expect(locateEvidence(SOURCE, 'res.json(rows);', 400)).toBeNull();
  });
});

describe('buildUnifiedPatch', () => {
  it('emits one hunk with three lines of context', () => {
    const after = SOURCE.replace('res.json(rows);', 'res.json(rows ?? []);');
    expect(buildUnifiedPatch('src/users.ts', SOURCE, after)).toBe(
      [
        'diff --git a/src/users.ts b/src/users.ts',
        '--- a/src/users.ts',
        '+++ b/src/users.ts',
        '@@ -3,5 +3,5 @@',
        ' export async function findUser(req, res) {',
        '   const id = req.query.id;',
        '   const rows = await db.query(`select * from users where id = ${id}`);',
        '-  res.json(rows);',
        '+  res.json(rows ?? []);',
        ' }',
        '',
      ].join('\n'),
    );
  });

  it('marks a last line that has no newline', () => {
    const patch = buildUnifiedPatch('a.ts', 'one\ntwo', 'one\nthree');
    expect(patch).toContain(
      '-two\n\\ No newline at end of file\n+three\n\\ No newline at end of file',
    );
  });

  it('returns nothing when the text is unchanged', () => {
    expect(buildUnifiedPatch('a.ts', SOURCE, SOURCE)).toBeNull();
  });
});

describe('anchorCandidate', () => {
  it('builds a patch for a finding the file supports', () => {
    const outcome = anchorCandidate(candidate(), SOURCE);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.patch).toContain(
        "+  const rows = await db.query('select * from users where id = $1', [id]);",
      );
    }
  });

  it('drops a finding on a file that was not scanned or a line the evidence is not on', () => {
    expect(anchorCandidate(candidate(), undefined)).toEqual({ ok: false, reason: 'unanchored' });
    expect(anchorCandidate(candidate({ evidence: 'spawnShell(cmd)' }), SOURCE)).toEqual({
      ok: false,
      reason: 'unanchored',
    });
  });

  it('rejects a fix whose original text is missing, repeated or far from the evidence', () => {
    expect(
      anchorCandidate(candidate({ fix: { original: 'not in file', replacement: 'x' } }), SOURCE),
    ).toEqual({ ok: false, reason: 'patch-rejected' });
    expect(
      anchorCandidate(candidate({ fix: { original: 'res', replacement: 'r' } }), SOURCE),
    ).toEqual({ ok: false, reason: 'patch-rejected' });
    expect(
      anchorCandidate(
        candidate({ fix: { original: "from './db'", replacement: "from './safe-db'" } }),
        SOURCE,
      ),
    ).toEqual({ ok: false, reason: 'patch-rejected' });
  });

  it('rejects a no-op fix and a path it cannot quote safely', () => {
    expect(
      anchorCandidate(
        candidate({ fix: { original: 'res.json', replacement: 'res.json' } }),
        SOURCE,
      ),
    ).toEqual({ ok: false, reason: 'patch-rejected' });
    expect(anchorCandidate(candidate({ path: "src/it's.ts" }), SOURCE)).toEqual({
      ok: false,
      reason: 'patch-rejected',
    });
  });
});

describe('findingId', () => {
  it('is stable across wording case and punctuation', () => {
    expect(findingId({ path: 'a.ts', line: 3, title: 'SQL injection!' })).toBe(
      findingId({ path: 'a.ts', line: 3, title: 'sql injection' }),
    );
    expect(findingId({ path: 'a.ts', line: 3, title: 'x' })).toMatch(/^[0-9a-f]{16}$/);
  });
});
