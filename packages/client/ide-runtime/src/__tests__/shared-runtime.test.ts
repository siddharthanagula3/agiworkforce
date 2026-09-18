import { describe, expect, it } from 'vitest';
import {
  countPorcelainStatus,
  describeGitHead,
  doctorReportIsHealthy,
  formatDoctorReport,
  GIT_OPERATION_PROBES,
  globToRegExp,
  grepLines,
  isDetachedHead,
  isSkippedDirectory,
  joinWorkspacePath,
  looksBinary,
  matchesGlob,
  parseAheadBehind,
  parseDoctorReport,
  summarizeDoctorChecks,
  toPosixPath,
} from '../index';

describe('workspace file semantics', () => {
  it('keeps a single star inside one path segment and lets a double star cross', () => {
    expect(globToRegExp('*.ts').test('index.ts')).toBe(true);
    expect(globToRegExp('*.ts').test('src/index.ts')).toBe(false);
    expect(globToRegExp('**/*.ts').test('src/nested/deep.ts')).toBe(true);
    expect(matchesGlob('src/**', 'src\\nested\\a.ts')).toBe(true);
  });

  it('escapes regex metacharacters rather than honouring them', () => {
    expect(globToRegExp('a+b.txt').test('a+b.txt')).toBe(true);
    expect(globToRegExp('a+b.txt').test('aab.txt')).toBe(false);
    expect(globToRegExp('file.(1)').test('file.(1)')).toBe(true);
    expect(globToRegExp('a?.ts').test('ab.ts')).toBe(true);
    expect(globToRegExp('a?.ts').test('abc.ts')).toBe(false);
  });

  it('calls a file binary on a NUL byte in its opening bytes', () => {
    expect(looksBinary(new Uint8Array([0x61, 0x62, 0x00]))).toBe(true);
    expect(looksBinary(new Uint8Array([0x61, 0x62, 0x63]))).toBe(false);
    expect(looksBinary(new Uint8Array())).toBe(false);
  });

  it('joins and normalises workspace paths the same way on every platform', () => {
    expect(joinWorkspacePath('', 'a.ts')).toBe('a.ts');
    expect(joinWorkspacePath('src', 'a.ts')).toBe('src/a.ts');
    expect(toPosixPath('src\\deep\\a.ts')).toBe('src/deep/a.ts');
    expect(isSkippedDirectory('node_modules')).toBe(true);
    expect(isSkippedDirectory('src')).toBe(false);
  });

  it('reports 1-based grep coordinates and bounds the preview', () => {
    const matches = grepLines('src/a.ts', 'alpha\nbeta alpha\n', 'alpha');
    expect(matches).toEqual([
      { path: 'src/a.ts', line: 1, column: 1, preview: 'alpha' },
      { path: 'src/a.ts', line: 2, column: 6, preview: 'beta alpha' },
    ]);
    expect(grepLines('a.ts', 'x'.repeat(50), 'x', { previewLimit: 10 })[0]?.preview).toHaveLength(
      10,
    );
    expect(grepLines('a.ts', 'a\na\na\n', 'a', { limit: 2 })).toHaveLength(2);
    expect(grepLines('a.ts', 'anything', '')).toEqual([]);
  });
});

describe('git semantics', () => {
  /**
   * The counts were inverted in a live run: an unstaged edit arrives with a
   * leading space, so trimming the line reported every worktree change as
   * staged.
   */
  it('reads the index column and the worktree column separately', () => {
    expect(countPorcelainStatus([' M README.md'])).toEqual({
      staged: 0,
      unstaged: 1,
      untracked: 0,
      conflicted: 0,
    });
    expect(countPorcelainStatus(['A  staged.ts']).staged).toBe(1);
    expect(countPorcelainStatus(['MM both.ts'])).toEqual({
      staged: 1,
      unstaged: 1,
      untracked: 0,
      conflicted: 0,
    });
    expect(countPorcelainStatus(['?? new.txt']).untracked).toBe(1);
    expect(countPorcelainStatus(['', 'M'])).toEqual({
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicted: 0,
    });
  });

  it('counts an unmerged path as conflicted, not as staged and unstaged', () => {
    expect(countPorcelainStatus(['UU app.txt'])).toEqual({
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicted: 1,
    });
    expect(countPorcelainStatus(['AA a', 'DU b', 'UA c']).conflicted).toBe(3);
  });

  it('reads behind from the left count and ahead from the right', () => {
    expect(parseAheadBehind('2\t5')).toEqual({ ahead: 5, behind: 2 });
    expect(parseAheadBehind('0\t0')).toEqual({ ahead: 0, behind: 0 });
    expect(parseAheadBehind(null)).toEqual({ ahead: 0, behind: 0 });
    expect(parseAheadBehind('nonsense')).toEqual({ ahead: 0, behind: 0 });
  });

  it('asks about the more specific in-progress operation first', () => {
    const order = GIT_OPERATION_PROBES.map(([, operation]) => operation);
    expect(order.indexOf('rebase')).toBeLessThan(order.indexOf('merge'));
    expect(order).toContain('bisect');
  });

  it('names a head the same way a detached checkout and an empty branch need', () => {
    expect(describeGitHead({ branch: 'main', headSha: 'abc123def456' })).toBe('main');
    expect(describeGitHead({ branch: 'main', headSha: null })).toBe('main (no commits yet)');
    expect(describeGitHead({ branch: null, headSha: 'abc123def456' })).toBe('detached at abc123d');
    expect(describeGitHead({ branch: null, headSha: null })).toBe('HEAD (no commits yet)');
    expect(isDetachedHead({ branch: null, headSha: 'abc' })).toBe(true);
    expect(isDetachedHead({ branch: 'main', headSha: 'abc' })).toBe(false);
  });
});

describe('doctor report', () => {
  const payload = {
    version: '1.7.1',
    generated_at: '2026-09-18T00:00:00Z',
    cwd: '/work/project',
    summary: { overall: 'warn', pass: 1, warn: 1, fail: 0, unknown: 0 },
    checks: [
      { id: 'runtime.git', title: 'runtime dependency: git', status: 'pass', message: 'found' },
      {
        id: 'git.repository',
        title: 'git repository',
        status: 'warn',
        message: 'HEAD detached at 1a2b3c4',
        details: ['root: /work/project'],
      },
    ],
  };

  it('reads the report the CLI serialises, snake_case field included', () => {
    const report = parseDoctorReport(payload);
    expect(report?.generatedAt).toBe('2026-09-18T00:00:00Z');
    expect(report?.checks).toHaveLength(2);
    expect(report?.checks[0]?.details).toEqual([]);
    expect(report?.summary.overall).toBe('warn');
    expect(doctorReportIsHealthy(report!)).toBe(false);
  });

  it('recomputes a missing summary instead of defaulting to healthy', () => {
    const report = parseDoctorReport({ ...payload, summary: undefined });
    expect(report?.summary).toEqual({ overall: 'warn', pass: 1, warn: 1, fail: 0, unknown: 0 });
  });

  it('treats an unknown status as unknown and drops a check with no id', () => {
    const report = parseDoctorReport({
      checks: [{ id: 'a', title: 'A', status: 'exploded', message: '' }, { title: 'no id' }],
    });
    expect(report?.checks).toHaveLength(1);
    expect(report?.checks[0]?.status).toBe('unknown');
    expect(report?.summary.overall).toBe('unknown');
    expect(parseDoctorReport({ checks: 'not an array' })).toBeNull();
  });

  it('renders the text the CLI prints so a panel and a terminal read alike', () => {
    const text = formatDoctorReport(parseDoctorReport(payload)!);
    expect(text).toContain('AGI doctor');
    expect(text).toContain('  overall: Warn');
    expect(text).toContain('[Pass] runtime dependency: git - found');
    expect(text).toContain('[Warn] git repository - HEAD detached at 1a2b3c4');
    expect(text).toContain('  - root: /work/project');
  });

  it('lets the worst status decide the overall one', () => {
    expect(
      summarizeDoctorChecks([
        { id: 'a', title: 'A', status: 'pass', message: '', details: [] },
        { id: 'b', title: 'B', status: 'unknown', message: '', details: [] },
        { id: 'c', title: 'C', status: 'fail', message: '', details: [] },
      ]).overall,
    ).toBe('fail');
  });
});
