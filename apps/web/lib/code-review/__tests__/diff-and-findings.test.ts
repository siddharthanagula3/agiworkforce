import { describe, expect, it } from 'vitest';

import { anchorableLines, chunkDiff, parseUnifiedDiff } from '../diff';
import {
  anchorFindings,
  fingerprintFinding,
  fingerprintMarker,
  fingerprintsInPostedComments,
  parseReviewResponse,
  renderFindingComment,
  sortFindings,
  type ReviewFinding,
} from '../findings';

const DIFF = [
  'diff --git a/src/auth.ts b/src/auth.ts',
  'index 1111111..2222222 100644',
  '--- a/src/auth.ts',
  '+++ b/src/auth.ts',
  '@@ -10,4 +10,6 @@ export function authorize(user) {',
  '   const role = user.role;',
  '-  if (role !== "admin") throw new Error("denied");',
  '+  if (role === "admin" || user.impersonating) {',
  '+    return true;',
  '+  }',
  '   return false;',
  ' }',
  'diff --git a/assets/logo.png b/assets/logo.png',
  'Binary files a/assets/logo.png and b/assets/logo.png differ',
].join('\n');

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    path: 'src/auth.ts',
    line: 12,
    severity: 'blocker',
    title: 'Impersonation bypasses the admin check',
    evidence: 'if (role === "admin" || user.impersonating) {',
    explanation: 'Any session with impersonating set is authorized as an admin.',
    ...overrides,
  };
}

describe('parsing a unified diff', () => {
  it('numbers each line as the head revision does', () => {
    const [file] = parseUnifiedDiff(DIFF);

    expect(file?.path).toBe('src/auth.ts');
    const lines = file?.hunks[0]?.lines ?? [];
    expect(lines.find((line) => line.text.includes('const role'))?.newLine).toBe(10);
    expect(lines.find((line) => line.kind === 'removed')?.newLine).toBeNull();
    expect(lines.find((line) => line.text.includes('user.impersonating'))?.newLine).toBe(11);
    expect(lines.find((line) => line.text === '    return true;')?.newLine).toBe(12);
  });

  it('marks a binary file so nothing tries to anchor to it', () => {
    const files = parseUnifiedDiff(DIFF);

    expect(files).toHaveLength(2);
    expect(files[1]?.binary).toBe(true);
    expect(anchorableLines(files).has('assets/logo.png')).toBe(false);
  });

  it('offers only head-side lines as anchors', () => {
    const anchors = anchorableLines(parseUnifiedDiff(DIFF));

    expect([...(anchors.get('src/auth.ts') ?? [])].sort((a, b) => a - b)).toEqual([
      10, 11, 12, 13, 14, 15,
    ]);
  });
});

describe('chunking a large diff', () => {
  it('carries whole hunks and stops at the chunk ceiling', () => {
    const big = Array.from({ length: 12 }, (_, index) =>
      [
        `diff --git a/src/f${index}.ts b/src/f${index}.ts`,
        '@@ -1,1 +1,2 @@',
        ' const a = 1;',
        `+const b${index} = ${'x'.repeat(400)};`,
      ].join('\n'),
    ).join('\n');

    const chunks = chunkDiff(parseUnifiedDiff(big), { maxBytes: 900, maxChunks: 4 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(4);
    for (const chunk of chunks) expect(chunk.text).toContain('@@');
  });

  it('prints the head line number beside every line so the model copies it', () => {
    const [chunk] = chunkDiff(parseUnifiedDiff(DIFF), { maxBytes: 8000, maxChunks: 2 });

    expect(chunk?.text).toContain('  12 +    return true;');
    expect(chunk?.text).toContain('     -  if (role !== "admin") throw new Error("denied");');
  });
});

describe('reading the model answer', () => {
  it('rejects an answer that is not the agreed shape', () => {
    expect(parseReviewResponse('This PR looks good to me.')).toBeNull();
    expect(parseReviewResponse('{"findings": [{"path": "a.ts"}]}')).toBeNull();
    expect(parseReviewResponse('{"findings": [], "verdict": "LGTM"}')).toBeNull();
  });

  it('accepts findings wrapped in prose or a code fence', () => {
    const answer = `Here you go:\n\`\`\`json\n${JSON.stringify({
      summary: 'one issue',
      findings: [finding()],
    })}\n\`\`\``;

    expect(parseReviewResponse(answer)?.findings).toHaveLength(1);
  });
});

describe('anchoring findings to the diff', () => {
  const files = parseUnifiedDiff(DIFF);

  it('keeps a finding whose line is in the diff', () => {
    const { anchored, fabricated } = anchorFindings([finding()], files, 'security');

    expect(fabricated).toHaveLength(0);
    expect(anchored[0]?.line).toBe(12);
    expect(anchored[0]?.pass).toBe('security');
  });

  it('drops a finding that names a line the diff does not contain', () => {
    const { anchored, fabricated } = anchorFindings([finding({ line: 400 })], files, 'correctness');

    expect(anchored).toHaveLength(0);
    expect(fabricated).toHaveLength(1);
  });

  it('drops a finding that names a file the diff does not contain', () => {
    const { anchored } = anchorFindings([finding({ path: 'src/invented.ts' })], files, 'security');

    expect(anchored).toHaveLength(0);
  });

  it('drops a finding on a removed line, which the head revision has not got', () => {
    const removedLine = finding({ line: 10, evidence: 'throw new Error("denied")' });
    const { anchored } = anchorFindings([removedLine], files, 'security');

    // Line 10 is a context line and does exist; the removed line has no number
    // at all, so no finding can name it.
    expect(anchored).toHaveLength(1);
    expect(anchorableLines(files).get('src/auth.ts')?.size).toBe(6);
  });
});

describe('not saying the same thing twice', () => {
  it('gives the same claim about the same line the same fingerprint', () => {
    expect(fingerprintFinding(finding())).toBe(
      fingerprintFinding(finding({ title: 'Impersonation  bypasses the ADMIN check!' })),
    );
    expect(fingerprintFinding(finding())).not.toBe(fingerprintFinding(finding({ line: 13 })));
  });

  it('reads the fingerprints out of comments already on the pull request', () => {
    const posted = renderFindingComment({
      ...finding(),
      pass: 'security',
      fingerprint: 'abc0123456789def',
    });

    expect(posted).toContain(fingerprintMarker('abc0123456789def'));
    expect(fingerprintsInPostedComments([posted, 'unrelated human comment'])).toEqual(
      new Set(['abc0123456789def']),
    );
  });

  it('orders the worst finding first', () => {
    const ordered = sortFindings([
      { ...finding({ severity: 'nit', line: 11 }), pass: 'correctness', fingerprint: 'a' },
      { ...finding({ severity: 'blocker' }), pass: 'security', fingerprint: 'b' },
    ]);

    expect(ordered.map((item) => item.severity)).toEqual(['blocker', 'nit']);
  });

  it('shows the evidence the claim rests on', () => {
    const rendered = renderFindingComment({ ...finding(), pass: 'security', fingerprint: 'c' });

    expect(rendered).toContain('**Evidence**');
    expect(rendered).toContain('user.impersonating');
    expect(rendered).toContain('Blocker · security');
  });
});
