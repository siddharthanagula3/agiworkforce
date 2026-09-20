import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  articleDigest,
  extractClaimUnits,
  readRegisteredDocIds,
  runSupportClaimsCheck,
  splitSentences,
} from './check-support-claims.mjs';

const INDEXED_ARTICLE = `---
id: approvals
title: Approvals
path: /agent-permissions
category: connectors
tags: approval
updated: 2026-09-20
scope: public
---

## The default

Every tool action waits for your approval. This is the default.

## Removing one

Removing a connector clears its saved verdicts.
`;

const PINNED_ARTICLE = `---
id: voice
title: Voice
path: /chat
category: voice
tags: voice
updated: 2026-09-20
scope: public
---

## Dictation

Dictation is never used in a temporary chat.
`;

const METADATA = `export const SUPPORT_DOC_METADATA = Object.freeze({
  approvals: metadata('ga', 'user', ALL_DOC_PLATFORMS, ALL_DOC_PLANS),
  voice: metadata('beta', 'user', ['web'], ALL_DOC_PLANS),
});
`;

function baseIndex() {
  return {
    articles: [
      { doc: 'approvals', indexed: true },
      { doc: 'voice', sha256: articleDigest(PINNED_ARTICLE) },
    ],
    claims: [
      {
        id: 'every-action-waits',
        doc: 'approvals',
        section: 'The default',
        kind: 'prose',
        sentence: 'Every tool action waits for your approval.',
        implementation: ['apps/web/lib/approvals.ts#resolvePolicy'],
        proof: [{ kind: 'guard', file: 'scripts/check-approvals.mjs' }],
      },
      {
        id: 'ask-is-the-default',
        doc: 'approvals',
        section: 'The default',
        kind: 'prose',
        sentence: 'This is the default.',
        implementation: ['apps/web/lib/approvals.ts'],
        proof: [
          { kind: 'test', file: 'apps/web/lib/approvals.test.ts', name: 'keeps asking by default' },
        ],
      },
      {
        id: 'removal-clears-verdicts',
        doc: 'approvals',
        section: 'Removing one',
        kind: 'prose',
        sentence: 'Removing a connector clears its saved verdicts.',
        implementation: ['apps/web/lib/approvals.ts'],
        proof: [
          {
            kind: 'copy',
            file: 'apps/web/lib/approvals.ts',
            text: 'clearConnectorToolPermissions',
          },
        ],
      },
    ],
    unproven: [],
    narrative: [],
  };
}

function makeRoot(mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'support-claims-'));
  const write = (relative, contents) => {
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };
  const state = {
    articles: { approvals: INDEXED_ARTICLE, voice: PINNED_ARTICLE },
    metadata: METADATA,
    index: baseIndex(),
  };
  mutate(state, write);
  for (const [docId, source] of Object.entries(state.articles)) {
    write(`apps/web/content/support/${docId}.md`, source);
  }
  write('apps/web/content/support/support-claims.json', JSON.stringify(state.index, null, 2));
  write('apps/web/lib/support/doc-metadata.ts', state.metadata);
  if (state.keepSources !== false) {
    write(
      'apps/web/lib/approvals.ts',
      'export function resolvePolicy() {}\nexport const clearConnectorToolPermissions = 1;\n',
    );
    write('apps/web/lib/approvals.test.ts', "it('keeps asking by default', () => {});\n");
    write('scripts/check-approvals.mjs', 'export default 1;\n');
    write('scripts/check-approvals.test.mjs', 'export default 1;\n');
  }
  return root;
}

function failuresFor(mutate) {
  return runSupportClaimsCheck(makeRoot(mutate));
}

test('a corpus whose indexed article is fully proved passes', () => {
  assert.deepEqual(
    failuresFor(() => {}),
    [],
  );
});

test('the extractor keeps quoted product copy in one sentence', () => {
  const quoted =
    'The share control refuses with "A temporary chat cannot be shared. Turn it off." Turn it off first.';
  assert.deepEqual(splitSentences(quoted), [quoted]);
  assert.deepEqual(splitSentences('It is off. It is the default.'), [
    'It is off.',
    'It is the default.',
  ]);
});

test('the extractor reads a section, its prose and its table rows', () => {
  const units = extractClaimUnits(INDEXED_ARTICLE);
  assert.equal(units.length, 3);
  assert.deepEqual(
    units.map((unit) => unit.section),
    ['The default', 'The default', 'Removing one'],
  );
});

test('a factual sentence added to an indexed article with no index entry fails', () => {
  const failures = failuresFor((state) => {
    state.articles.approvals = state.articles.approvals.replace(
      '## Removing one',
      '## Removing one\n\nA temporary chat never keeps a saved verdict.',
    );
  });
  assert.ok(
    failures.some((failure) => failure.includes('this claim has no entry in')),
    failures.join('\n'),
  );
});

test('a sentence rewritten in an indexed article without the index fails', () => {
  const failures = failuresFor((state) => {
    state.articles.approvals = state.articles.approvals.replace(
      'Every tool action waits for your approval.',
      'Every tool action runs without waiting for your approval.',
    );
  });
  assert.ok(
    failures.some((failure) => failure.includes('the article changed without the index')),
    failures.join('\n'),
  );
});

test('editing a pinned article fails until its claims are indexed', () => {
  const failures = failuresFor((state) => {
    state.articles.voice = state.articles.voice.replace(
      'Dictation is never used in a temporary chat.',
      'Dictation is always used in a temporary chat.',
    );
  });
  assert.ok(
    failures.some((failure) =>
      failure.includes('changed, so every factual sentence in it must be indexed'),
    ),
    failures.join('\n'),
  );
});

test('a proof file that has moved fails', () => {
  const failures = failuresFor((state) => {
    state.index.claims[0].proof = [{ kind: 'guard', file: 'scripts/check-gone.mjs' }];
  });
  assert.ok(
    failures.some((failure) =>
      failure.includes('proof file "scripts/check-gone.mjs" does not exist'),
    ),
    failures.join('\n'),
  );
});

test('a named test that no longer exists fails', () => {
  const failures = failuresFor((state) => {
    state.index.claims[1].proof = [
      { kind: 'test', file: 'apps/web/lib/approvals.test.ts', name: 'a test nobody wrote' },
    ];
  });
  assert.ok(
    failures.some((failure) => failure.includes('test "a test nobody wrote" is no longer in')),
    failures.join('\n'),
  );
});

test('quoted product copy that has left the source fails', () => {
  const failures = failuresFor((state) => {
    state.index.claims[2].proof = [
      { kind: 'copy', file: 'apps/web/lib/approvals.ts', text: 'wordingNobodyShipped' },
    ];
  });
  assert.ok(
    failures.some((failure) => failure.includes('product copy "wordingNobodyShipped"')),
    failures.join('\n'),
  );
});

test('a guard cited without its own self-test fails', () => {
  const failures = failuresFor((state, write) => {
    state.index.claims[0].proof = [{ kind: 'guard', file: 'scripts/check-lonely.mjs' }];
    write('scripts/check-lonely.mjs', 'export default 1;\n');
  });
  assert.ok(
    failures.some((failure) => failure.includes('has no self-test')),
    failures.join('\n'),
  );
});

test('an implementing symbol that has been renamed fails', () => {
  const failures = failuresFor((state) => {
    state.index.claims[0].implementation = ['apps/web/lib/approvals.ts#renamedAway'];
  });
  assert.ok(
    failures.some((failure) => failure.includes('no longer contains "renamedAway"')),
    failures.join('\n'),
  );
});

test('an article missing from the metadata registry fails', () => {
  const failures = failuresFor((state) => {
    state.metadata = state.metadata.replace(
      "  voice: metadata('beta', 'user', ['web'], ALL_DOC_PLANS),\n",
      '',
    );
  });
  assert.ok(
    failures.some((failure) => failure.includes('no entry in SUPPORT_DOC_METADATA')),
    failures.join('\n'),
  );
});

test('an article registered twice fails', () => {
  const failures = failuresFor((state) => {
    state.metadata = state.metadata.replace(
      "  voice: metadata('beta', 'user', ['web'], ALL_DOC_PLANS),\n",
      "  voice: metadata('beta', 'user', ['web'], ALL_DOC_PLANS),\n  voice: metadata('ga', 'user', ['web'], ALL_DOC_PLANS),\n",
    );
  });
  assert.ok(
    failures.some((failure) => failure.includes('is registered 2 times')),
    failures.join('\n'),
  );
});

test('a metadata entry with no article fails', () => {
  const failures = failuresFor((state) => {
    state.metadata = state.metadata.replace(
      '});',
      "  ghost: metadata('ga', 'user', ['web'], ALL_DOC_PLANS),\n});",
    );
  });
  assert.ok(
    failures.some((failure) => failure.includes('is registered but')),
    failures.join('\n'),
  );
});

test('an article with no entry in the claims index at all fails', () => {
  const failures = failuresFor((state, write) => {
    write(
      'apps/web/content/support/ghost.md',
      '---\nid: ghost\n---\n\n## A section\n\nNothing is ever stored.\n',
    );
    state.metadata = state.metadata.replace(
      '});',
      "  ghost: metadata('ga', 'user', ['web'], ALL_DOC_PLANS),\n});",
    );
  });
  assert.ok(
    failures.some((failure) => failure.includes('but has no "articles" entry')),
    failures.join('\n'),
  );
});

test('an unproven claim with no stated reason fails', () => {
  const failures = failuresFor((state) => {
    const [claim] = state.index.claims.splice(0, 1);
    delete claim.proof;
    state.index.unproven.push({ ...claim, reason: 'too short' });
  });
  assert.ok(
    failures.some((failure) => failure.includes('is unproven and states no reason')),
    failures.join('\n'),
  );
});

test('a narrative entry with a kind outside the vocabulary fails', () => {
  const failures = failuresFor((state) => {
    const [claim] = state.index.claims.splice(0, 1);
    delete claim.proof;
    state.index.narrative.push({ ...claim, why: 'because-we-say-so' });
  });
  assert.ok(
    failures.some((failure) => failure.includes('narrative "why" is "because-we-say-so"')),
    failures.join('\n'),
  );
});

test('a claim indexed under a section it is not in fails', () => {
  const failures = failuresFor((state) => {
    state.index.claims[0].section = 'Removing one';
  });
  assert.ok(
    failures.some((failure) => failure.includes('but the sentence is in "The default"')),
    failures.join('\n'),
  );
});

test('the registry reader returns every id in source order', () => {
  assert.deepEqual(readRegisteredDocIds(METADATA), ['approvals', 'voice']);
});

test('the repository index and every article it names pass the real check', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  assert.deepEqual(runSupportClaimsCheck(root), []);
});
