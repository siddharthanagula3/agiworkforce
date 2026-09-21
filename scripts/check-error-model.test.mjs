import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ERRORS_MODULE,
  MIN_LOCAL_CODES,
  REMEDY_MODULE,
  TAXONOMY_JSON,
  TAXONOMY_MODULE,
  applyRetryBaseline,
  checkErrorModel,
  findClientRetryTables,
  readCodeRegistry,
  readVocabulary,
} from './check-error-model.mjs';

const CLASSES = ['authentication', 'internal'];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function fixture(overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'error-model-'));
  write(
    root,
    ERRORS_MODULE,
    overrides.errors ??
      `export const ErrorCode = {\n  UNAUTHORIZED: 'UNAUTHORIZED',\n  INTERNAL_ERROR: 'INTERNAL_ERROR',\n} as const;\n\n` +
        `export const DenialErrorCode = {\n  POLICY_BLOCKED: 'POLICY_BLOCKED',\n} as const;\n\n` +
        `export const DomainErrorCode = {\n  TOOL_ERROR: 'TOOL_ERROR',\n} as const;\n`,
  );
  write(
    root,
    REMEDY_MODULE,
    overrides.remedies ?? `export const SURFACE_REMEDIES = ['sign_in', 'retry'] as const;\n`,
  );
  write(
    root,
    TAXONOMY_MODULE,
    overrides.module ??
      `export const ERROR_CLASSES = [${CLASSES.map((name) => `'${name}'`).join(', ')}] as const;\n`,
  );
  write(
    root,
    TAXONOMY_JSON,
    JSON.stringify(
      overrides.taxonomy ?? {
        classes: {
          authentication: {
            why: 'the caller has not proved who they are',
            retryable: false,
            providerDetail: 'hidden',
            suggestedAction: 'sign_in',
            codes: ['UNAUTHORIZED', 'POLICY_BLOCKED'],
          },
          internal: {
            why: 'a defect on our side',
            retryable: true,
            providerDetail: 'hidden',
            suggestedAction: 'retry',
            codes: ['INTERNAL_ERROR', 'TOOL_ERROR'],
          },
        },
        unraisedCodes: [],
      },
    ),
  );
  spawnSync('git', ['-C', root, 'init', '-q'], { encoding: 'utf8' });
  return root;
}

function run(root) {
  const { errors } = checkErrorModel(root);
  return errors.join('\n');
}

test('a complete taxonomy passes', () => {
  const root = fixture();
  try {
    assert.equal(run(root), '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a code no class names fails', () => {
  const root = fixture({
    taxonomy: {
      classes: {
        authentication: {
          why: 'identity',
          retryable: false,
          providerDetail: 'hidden',
          suggestedAction: 'sign_in',
          codes: ['UNAUTHORIZED', 'POLICY_BLOCKED'],
        },
        internal: {
          why: 'a defect',
          retryable: true,
          providerDetail: 'hidden',
          suggestedAction: 'retry',
          codes: ['INTERNAL_ERROR'],
        },
      },
      unraisedCodes: [],
    },
  });
  try {
    assert.match(run(root), /DomainErrorCode\.TOOL_ERROR belongs to no class/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('one code in two classes fails', () => {
  const root = fixture({
    taxonomy: {
      classes: {
        authentication: {
          why: 'identity',
          retryable: false,
          providerDetail: 'hidden',
          suggestedAction: 'sign_in',
          codes: ['UNAUTHORIZED', 'POLICY_BLOCKED', 'TOOL_ERROR'],
        },
        internal: {
          why: 'a defect',
          retryable: true,
          providerDetail: 'hidden',
          suggestedAction: 'retry',
          codes: ['INTERNAL_ERROR', 'TOOL_ERROR'],
        },
      },
      unraisedCodes: [],
    },
  });
  try {
    assert.match(run(root), /TOOL_ERROR is classified as both/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a deleted code still named by a class fails', () => {
  const root = fixture({
    errors:
      `export const ErrorCode = {\n  INTERNAL_ERROR: 'INTERNAL_ERROR',\n} as const;\n\n` +
      `export const DenialErrorCode = {\n  POLICY_BLOCKED: 'POLICY_BLOCKED',\n} as const;\n\n` +
      `export const DomainErrorCode = {\n  TOOL_ERROR: 'TOOL_ERROR',\n} as const;\n`,
  });
  try {
    assert.match(run(root), /names UNAUTHORIZED, which no canonical registry declares/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a class with no reason, no retry answer or an invented remedy fails', () => {
  const root = fixture({
    taxonomy: {
      classes: {
        authentication: {
          why: '',
          providerDetail: 'hidden',
          suggestedAction: 'shrug',
          codes: ['UNAUTHORIZED', 'POLICY_BLOCKED'],
        },
        internal: {
          why: 'a defect',
          retryable: true,
          providerDetail: 'hidden',
          suggestedAction: 'retry',
          codes: ['INTERNAL_ERROR', 'TOOL_ERROR'],
        },
      },
      unraisedCodes: [],
    },
  });
  try {
    const report = run(root);
    assert.match(report, /carries no reason for existing/);
    assert.match(report, /does not say whether repeating the request can work/);
    assert.match(report, /suggests "shrug"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a class the type cannot name fails', () => {
  const root = fixture({ module: `export const ERROR_CLASSES = ['authentication'] as const;\n` });
  try {
    assert.match(run(root), /ERROR_CLASSES omits "internal"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unraised entry whose code is now raised fails', () => {
  const root = fixture({
    taxonomy: {
      classes: {
        authentication: {
          why: 'identity',
          retryable: false,
          providerDetail: 'hidden',
          suggestedAction: 'sign_in',
          codes: ['UNAUTHORIZED', 'POLICY_BLOCKED'],
        },
        internal: {
          why: 'a defect',
          retryable: true,
          providerDetail: 'hidden',
          suggestedAction: 'retry',
          codes: ['INTERNAL_ERROR', 'TOOL_ERROR'],
        },
      },
      unraisedCodes: [{ code: 'TOOL_ERROR', why: 'nothing raises it', raisedBy: 'the tool path' }],
    },
  });
  write(root, 'apps/web/lib/tools/run.ts', `throw new Error('TOOL_ERROR');\n`);
  try {
    assert.match(run(root), /TOOL_ERROR is now raised by apps\/web\/lib\/tools\/run\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a code named as a fragment of another identifier is not a raiser', () => {
  const root = fixture({
    taxonomy: {
      classes: {
        authentication: {
          why: 'identity',
          retryable: false,
          providerDetail: 'hidden',
          suggestedAction: 'sign_in',
          codes: ['UNAUTHORIZED', 'POLICY_BLOCKED'],
        },
        internal: {
          why: 'a defect',
          retryable: true,
          providerDetail: 'hidden',
          suggestedAction: 'retry',
          codes: ['INTERNAL_ERROR', 'TOOL_ERROR'],
        },
      },
      unraisedCodes: [{ code: 'TOOL_ERROR', why: 'nothing raises it', raisedBy: 'the tool path' }],
    },
  });
  write(root, 'apps/web/lib/tools/card.ts', `const TOOL_ERROR_LABEL = /^Tool error:/;\n`);
  try {
    assert.equal(run(root), '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a client that keeps its own retry table is found', () => {
  const codes = new Map([
    ['TIMEOUT', 'ErrorCode'],
    ['NETWORK_ERROR', 'ErrorCode'],
    ['FORBIDDEN', 'ErrorCode'],
  ]);
  const root = mkdtempSync(path.join(tmpdir(), 'error-model-client-'));
  try {
    write(
      root,
      'apps/web/shared/lib/retry.ts',
      `const RETRYABLE = ['TIMEOUT', 'NETWORK_ERROR'];\nexport const shouldRetry = (code: string) => RETRYABLE.includes(code) && code !== 'FORBIDDEN';\n`,
    );
    const violations = findClientRetryTables({
      repoRoot: root,
      files: ['apps/web/shared/lib/retry.ts'],
      codes,
    });
    assert.equal(violations.length, 1);
    assert.ok(violations[0].named.length >= MIN_LOCAL_CODES);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a client that reads the taxonomy is not a violation', () => {
  const codes = new Map([
    ['TIMEOUT', 'ErrorCode'],
    ['NETWORK_ERROR', 'ErrorCode'],
    ['FORBIDDEN', 'ErrorCode'],
  ]);
  const root = mkdtempSync(path.join(tmpdir(), 'error-model-client-ok-'));
  try {
    write(
      root,
      'apps/web/shared/lib/retry.ts',
      `import { isRetryableErrorCode } from '@agiworkforce/types';\n` +
        `const LABELS = { TIMEOUT: 'a', NETWORK_ERROR: 'b', FORBIDDEN: 'c' };\n` +
        `export const shouldRetry = (code: string) => isRetryableErrorCode(code);\n`,
    );
    assert.deepEqual(
      findClientRetryTables({ repoRoot: root, files: ['apps/web/shared/lib/retry.ts'], codes }),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a baseline entry that no longer describes a violation has to be deleted', () => {
  const result = applyRetryBaseline({
    violations: [],
    baseline: {
      retryDecidedByClient: [
        { file: 'apps/web/shared/lib/retry.ts', why: 'legacy', fix: 'read the envelope' },
      ],
    },
  });
  assert.match(result.errors.join('\n'), /no longer decides retryability/);
});

test('a baseline entry without a reason or a fix fails', () => {
  const result = applyRetryBaseline({
    violations: [{ file: 'apps/web/shared/lib/retry.ts', named: ['TIMEOUT'] }],
    baseline: { retryDecidedByClient: [{ file: 'apps/web/shared/lib/retry.ts' }] },
  });
  const report = result.errors.join('\n');
  assert.match(report, /carries no reason/);
  assert.match(report, /does not name the change that removes it/);
});

test('the registry reader follows a rename rather than reading nothing', () => {
  assert.equal(
    readCodeRegistry(`export const Other = {\n  A: 'A',\n} as const;\n`, 'ErrorCode'),
    null,
  );
  assert.deepEqual(
    readCodeRegistry(
      `export const ErrorCode = {\n  A: 'A',\n  B: 'B',\n} as const;\n`,
      'ErrorCode',
    ),
    ['A', 'B'],
  );
  assert.deepEqual(
    readVocabulary(
      `export const SURFACE_REMEDIES = ['wait', 'retry'] as const;`,
      'SURFACE_REMEDIES',
    ),
    ['wait', 'retry'],
  );
});
