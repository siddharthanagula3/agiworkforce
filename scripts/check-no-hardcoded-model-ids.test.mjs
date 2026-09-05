import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  MODEL_ID_OWNER_PATHS,
  REPO_ROOT,
  SPEECH_ARTIFACT_REGISTRY_PATH,
  discoverRepositoryFiles,
  loadCanonicalModelIdTokens,
  scanModelIdFiles,
} from './check-no-hardcoded-model-ids.mjs';
import { getLocalModelCatalog } from '../packages/platform/local-llm/src/catalog.ts';

const curation = JSON.parse(
  readFileSync(
    path.join(REPO_ROOT, 'packages/ai/model-registry/catalog/models.curation.json'),
    'utf8',
  ),
);
const synced = JSON.parse(
  readFileSync(
    path.join(REPO_ROOT, 'packages/ai/model-registry/catalog/models.synced.json'),
    'utf8',
  ),
);
const retired = JSON.parse(
  readFileSync(
    path.join(REPO_ROOT, 'packages/ai/model-registry/catalog/retired-models.json'),
    'utf8',
  ),
);
const speechArtifacts = JSON.parse(
  readFileSync(path.join(REPO_ROOT, SPEECH_ARTIFACT_REGISTRY_PATH), 'utf8'),
);
const generatedRegistry = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'packages/ai/model-registry/generated/registry.json'), 'utf8'),
);
const tokens = loadCanonicalModelIdTokens(REPO_ROOT);
const tokenIds = new Set(tokens.map((token) => token.id));
const canonicalId = Object.keys(curation.models)[0];
const canonicalDisplayName = Object.values(curation.models).find(
  (model) => typeof model.name === 'string' && /\d/.test(model.name),
)?.name;
const wordOnlyDisplayName = Object.values(curation.models).find(
  (model) => typeof model.name === 'string' && /^[A-Za-z]+$/.test(model.name),
)?.name;
const providerWireId = Object.values(curation.models).find(
  (model) => model.apiModelId && model.apiModelId !== model.id,
)?.apiModelId;
const modelAlias = Object.values(curation.providers)
  .flatMap((provider) => Object.keys(provider.canonicalization ?? {}))
  .find((alias) => tokenIds.has(alias));
const prefixPair = tokens
  .flatMap((shorter) =>
    tokens
      .filter(
        (longer) =>
          longer.id.length > shorter.id.length &&
          longer.id.startsWith(shorter.id) &&
          /[._:+/-]/.test(longer.id[shorter.id.length]),
      )
      .map((longer) => ({ shorter: shorter.id, longer: longer.id })),
  )
  .at(0);
const aliasFallbackPair = tokens
  .flatMap((shorter) =>
    tokens
      .filter(
        (longer) => longer.id.length > shorter.id.length && longer.id.startsWith(`${shorter.id}-`),
      )
      .map((longer) => ({ shorter: shorter.id, longer: longer.id })),
  )
  .at(0);
const wordLikeId = tokens.find((token) => /^[A-Za-z]+$/.test(token.id))?.id;
const numericGptTextId = Object.values(curation.models).find(
  (model) =>
    model.provider === 'openai' &&
    model.modelType === 'reasoning' &&
    /^gpt[-_. ]+[0-9]/iu.test(model.id),
)?.id;
const numericGptMediaId = Object.values(curation.models).find(
  (model) =>
    model.provider === 'openai' &&
    ['tts', 'stt'].includes(model.modelType) &&
    /^gpt[-_. ]+[0-9]/iu.test(model.id),
)?.id;
const nonnumericGptImageId = Object.values(curation.models).find(
  (model) =>
    model.provider === 'openai' &&
    model.modelType === 'image' &&
    /^gpt[-_. ]+[^0-9]/iu.test(model.id),
)?.id;

assert.ok(canonicalId, 'test requires at least one canonical model');
assert.ok(canonicalDisplayName, 'test requires at least one versioned model display name');
assert.ok(wordOnlyDisplayName, 'test requires at least one word-only model display name');
assert.ok(providerWireId, 'test requires a provider wire ID distinct from its canonical key');
assert.ok(modelAlias, 'test requires at least one concrete canonicalization alias');
assert.ok(prefixPair, 'test requires a longer model ID that shares a guarded prefix');
assert.ok(aliasFallbackPair, 'test requires a hyphen-extended model ID and shorter alias');
assert.ok(wordLikeId, 'test requires a word-like canonical ID for boundary discrimination');
assert.ok(numericGptTextId, 'test requires a catalog-derived numeric GPT text ID');
assert.ok(numericGptMediaId, 'test requires a catalog-derived numeric GPT media ID');
assert.ok(nonnumericGptImageId, 'test requires a catalog-derived nonnumeric GPT image ID');

const sandboxes = [];
after(() => {
  for (const sandbox of sandboxes) rmSync(sandbox, { recursive: true, force: true });
});

function createSandbox() {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'agi-model-id-guard-'));
  sandboxes.push(sandbox);
  return sandbox;
}

function writeFiles(root, files) {
  return Object.entries(files).map(([relativePath, contents]) => {
    const absolutePath = path.join(root, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, 'utf8');
    return absolutePath;
  });
}

test('derives canonical keys, display names, provider wire IDs, and aliases from registry metadata', () => {
  assert.ok(tokenIds.has(canonicalId));
  assert.ok(tokenIds.has(canonicalDisplayName));
  assert.ok(tokenIds.has(wordOnlyDisplayName));
  assert.ok(tokenIds.has(providerWireId));
  assert.ok(tokenIds.has(modelAlias));
  assert.ok(retired.retiredModelIds.length > 0, 'test requires retired model IDs');
  assert.deepEqual(
    retired.retiredModelIds.filter((id) => !tokenIds.has(id)),
    [],
    'every retired model ID must remain guarded after leaving the live catalog',
  );
  assert.ok(
    retired.guardedNonCanonicalModelIds.length > 0,
    'test requires discovery-only model IDs that consumers must not pin',
  );
  assert.deepEqual(
    retired.guardedNonCanonicalModelIds.filter((id) => !tokenIds.has(id)),
    [],
    'known discovery-only model IDs must remain guarded outside canonical owners',
  );

  const generatedIds = new Set();
  for (const model of Object.values(generatedRegistry.models)) {
    generatedIds.add(model.identity.key);
    generatedIds.add(model.identity.providerModelId);
  }
  for (const route of Object.values(generatedRegistry.routes)) {
    generatedIds.add(route.modelKey);
    generatedIds.add(route.providerModelId);
  }
  assert.deepEqual(
    [...generatedIds].filter((id) => !tokenIds.has(id)),
    [],
    'every generated canonical/provider wire ID must be guarded',
  );

  const concreteAliases = Object.values(curation.providers).flatMap((provider) =>
    Object.keys(provider.canonicalization ?? {}),
  );
  assert.deepEqual(
    concreteAliases.filter((alias) => !tokenIds.has(alias)),
    [],
    'every concrete legacy model alias must be guarded',
  );

  const curatedIds = new Set(Object.keys(curation.models));
  const syncedOnlyIds = Object.keys(synced.models).filter((id) => !curatedIds.has(id));
  assert.ok(syncedOnlyIds.length > 0, 'test requires at least one synced-only model ID');
  assert.deepEqual(
    syncedOnlyIds.filter((id) => !tokenIds.has(id)),
    [],
    'every synced-only provider model ID must be guarded',
  );

  const localModels = getLocalModelCatalog();
  const localModelTokens = localModels.flatMap((model) => [
    model.id,
    model.family,
    ...(model.executorchPreset?.modelName ? [model.executorchPreset.modelName] : []),
  ]);
  assert.ok(localModelTokens.length > 0, 'test requires canonical on-device model IDs');
  assert.deepEqual(
    localModelTokens.filter((id) => !tokenIds.has(id)),
    [],
    'every canonical on-device model and runtime preset ID must be guarded',
  );

  const speechArtifactTokens = [
    ...speechArtifacts.whisperModels.map((artifact) => artifact.filename),
    ...speechArtifacts.piperVoices.flatMap((artifact) => [
      artifact.id,
      artifact.modelFilename,
      artifact.configFilename,
    ]),
    ...speechArtifacts.piperBinaries.flatMap((artifact) => [artifact.id, artifact.archiveFilename]),
    ...speechArtifacts.replacements.flatMap((replacement) => [
      replacement.previousId,
      replacement.replacementId,
    ]),
  ];
  assert.ok(speechArtifactTokens.length > 0, 'test requires canonical speech artifact IDs');
  assert.deepEqual(
    speechArtifactTokens.filter((id) => !tokenIds.has(id)),
    [],
    'every unique local speech artifact identity must be guarded',
  );
});

test('rejects local speech artifact identities outside the canonical owner', () => {
  const sandbox = createSandbox();
  const speechArtifactId = speechArtifacts.piperVoices[0].id;
  const speechArtifactFilename = speechArtifacts.whisperModels[0].filename;
  const filePaths = writeFiles(sandbox, {
    [SPEECH_ARTIFACT_REGISTRY_PATH]: JSON.stringify({
      id: speechArtifactId,
      filename: speechArtifactFilename,
    }),
    'packages/ai/model-registry/catalog/copied-speech-artifacts.json': JSON.stringify({
      id: speechArtifactId,
      filename: speechArtifactFilename,
    }),
    'src/local-speech.ts':
      `const voice = ${JSON.stringify(speechArtifactId)};\n` +
      `const artifact = ${JSON.stringify(speechArtifactFilename)};\n`,
  });

  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths, tokens });
  assert.deepEqual(
    new Set(violations.map((violation) => violation.id)),
    new Set([speechArtifactId, speechArtifactFilename]),
  );
  assert.equal(violations.length, 4);
  assert.ok(!violations.some((violation) => violation.file === SPEECH_ARTIFACT_REGISTRY_PATH));
  assert.ok(
    violations.some((violation) => violation.file.endsWith('catalog/copied-speech-artifacts.json')),
  );
});

test('rejects injected code, test, fixture, snapshot, documentation, and comment literals', () => {
  const sandbox = createSandbox();
  const filePaths = writeFiles(sandbox, {
    'src/consumer.ts': `export const selected = ${JSON.stringify(canonicalId)};\n`,
    'src/consumer.rs': `const SELECTED: &str = ${JSON.stringify(canonicalId)};\n`,
    'src/display-name.ts': `export const label = ${JSON.stringify(canonicalDisplayName)};\n`,
    'src/word-display-name.ts': `export const label = ${JSON.stringify(wordOnlyDisplayName)};\n`,
    'src/__tests__/consumer.test.ts': `expect(selected).toBe(${JSON.stringify(canonicalId)});\n`,
    'src/__fixtures__/consumer.json': JSON.stringify({ model: canonicalId }),
    'src/__snapshots__/consumer.snap': `exports.model = ${JSON.stringify(canonicalId)};\n`,
    'src/nul-fixture.ts': `const separator = '${String.fromCharCode(0)}'; // ${canonicalId}\n`,
    'docs/model.md': `Pinned model: ${canonicalId}\n`,
    'src/comment.ts': `// Do not change ${canonicalId} without updating this consumer.\n`,
  });

  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths, tokens });
  assert.equal(violations.length, filePaths.length);
  assert.deepEqual(
    new Set(violations.map((violation) => path.extname(violation.file))),
    new Set(['.ts', '.rs', '.json', '.snap', '.md']),
  );
  assert.ok(violations.some((violation) => violation.file.includes('__tests__')));
  assert.ok(violations.some((violation) => violation.file.includes('__fixtures__')));
  assert.ok(violations.some((violation) => violation.file.includes('__snapshots__')));
  assert.ok(violations.some((violation) => violation.file.endsWith('comment.ts')));
});

test('skips vendored third-party skills but still scans first-party skills', () => {
  const sandbox = createSandbox();
  const filePaths = writeFiles(sandbox, {
    'skills-lock.json': JSON.stringify({
      skills: {
        vendored: { path: '.agents/skills/vendored', sourceType: 'github' },
        own: { path: '.agents/skills/own', sourceType: 'first-party' },
      },
    }),
    '.agents/skills/vendored/SKILL.md': `Upstream text naming ${canonicalId}\n`,
    '.agents/skills/own/SKILL.md': `Our text naming ${canonicalId}\n`,
  });
  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths, tokens });

  assert.deepEqual(
    violations.map((violation) => violation.file),
    ['.agents/skills/own/SKILL.md'],
  );
});

test('rejects provider wire IDs and legacy model aliases outside the owner', () => {
  const sandbox = createSandbox();
  const filePaths = writeFiles(sandbox, {
    'src/wire.ts': `export const wire = ${JSON.stringify(providerWireId)};\n`,
    'src/legacy.ts': `export const legacy = ${JSON.stringify(modelAlias)};\n`,
  });
  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths, tokens });

  assert.deepEqual(
    new Set(violations.map((violation) => violation.id)),
    new Set([providerWireId, modelAlias]),
  );
});

test('rejects a retired image-model family after its concrete ID leaves the catalog', () => {
  const sandbox = createSandbox();
  const retiredFamilyFixture = ['stable', 'image', 'fixture'].join('_');
  const filePaths = writeFiles(sandbox, {
    'src/retired-provider.ts': `const retired = '${retiredFamilyFixture}';\n`,
  });
  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths, tokens });

  assert.deepEqual(
    violations.map(({ id }) => id),
    ['retired-stability-image-family'],
  );
});

test('rejects retired and current GPT model-family literals outside canonical owners', () => {
  const sandbox = createSandbox();
  const currentFamilyFixture = numericGptTextId;
  const familyAliasFixture = numericGptTextId.split('-').slice(0, -1).join('-');
  const punctuationFixture = numericGptTextId.replaceAll('-', '.');
  const filePaths = writeFiles(sandbox, {
    'src/family-shaped-text-models.ts':
      `const familyAlias = '${familyAliasFixture}';\n` +
      `const punctuationVariant = '${punctuationFixture}';\n`,
    'src/current-text-model.ts': `const current = '${currentFamilyFixture}';\n`,
  });
  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths, tokens: [] });

  assert.deepEqual(
    violations.map(({ id }) => id),
    [
      'concrete-gpt-model-family-literal',
      'concrete-gpt-model-family-literal',
      'concrete-gpt-model-family-literal',
    ],
  );
  assert.ok(violations.some((violation) => violation.file.endsWith('current-text-model.ts')));
});

test('rejects numeric GPT media-family literals without confusing nonnumeric image IDs', () => {
  const sandbox = createSandbox();
  const filePaths = writeFiles(sandbox, {
    'src/current-speech.ts': `const speech = '${numericGptMediaId}';\n`,
    'src/punctuation-speech.ts': `const speech = '${numericGptMediaId.replaceAll('-', '.')}';\n`,
    'src/image-fixture.ts': `const image = '${nonnumericGptImageId}';\n`,
  });
  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths, tokens: [] });

  assert.deepEqual(
    violations.map(({ id }) => id),
    ['concrete-gpt-model-family-literal', 'concrete-gpt-model-family-literal'],
  );
  assert.ok(!violations.some((violation) => violation.file.endsWith('image-fixture.ts')));
});

test('rejects noncanonical provider-family model shapes without pinning real IDs', () => {
  const sandbox = createSandbox();
  const familyFixtures = [
    ['clau', 'de-9-fixture'].join(''),
    ['gem', 'ini-9'].join(''),
    ['deep', 'seek-r9-fixture'].join(''),
    ['lla', 'ma9-fixture'].join(''),
    ['gem', 'ma9-fixture'].join(''),
    ['qw', 'en-coder-fixture'].join(''),
    ['ima', 'gen-9-fixture'].join(''),
    ['ve', 'o-9-fixture'].join(''),
    ['gr', 'ok-9-fixture'].join(''),
    ['gl', 'm-9-fixture'].join(''),
    ['mis', 'tral-fixture-9'].join(''),
    ['code', 'stral-9-fixture'].join(''),
    ['ki', 'mi-k9-fixture'].join(''),
    ['see', 'dance-9-fixture'].join(''),
    ['gen', '9-fixture'].join(''),
    ['da', 'lle9-fixture'].join(''),
    ['whis', 'per-9-fixture'].join(''),
    ['t', 'ts-9-fixture'].join(''),
    ['text', '-embedding-9-fixture'].join(''),
    ['stable', '-diffusion-fixture'].join(''),
    ['sd', 'xl-fixture'].join(''),
    ['pplx', '-9b-fixture'].join(''),
  ];
  const filePaths = writeFiles(
    sandbox,
    Object.fromEntries(
      familyFixtures.map((model, index) => [
        `src/family-${index}.ts`,
        `const model = ${JSON.stringify(model)};\n`,
      ]),
    ),
  );

  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths, tokens: [] });
  assert.equal(violations.length, familyFixtures.length);
});

test('treats punctuation as a boundary while suppressing only direct alphanumeric embedding', () => {
  const sandbox = createSandbox();
  const filePaths = writeFiles(sandbox, {
    'src/synthetic.test.ts': "const model = 'fixture-model-id';\n",
    'src/embedded.ts': `const notAnId = ${JSON.stringify(`fixture${canonicalId}suffix`)};\n`,
    'src/extended-alias.ts': `const notAnId = ${JSON.stringify(`${aliasFallbackPair.longer}ution`)};\n`,
    'src/word-prefix.test.ts': `const fixture = ${JSON.stringify(`model-row-${wordLikeId}`)};\n`,
    'src/word-snapshot.snap': `model: ${wordLikeId}-snapshot\n`,
    'src/word-fixture.json': JSON.stringify({ key: `fixture_${wordLikeId}_value` }),
    'src/word-property.txt': `${wordLikeId}.naming\n`,
    'src/wrapped-fixture.test.ts': `const fixture = ${JSON.stringify(`fixture-prefix-${canonicalId}`)};\n`,
    'src/dated-snapshot.snap': `model: ${canonicalId}-2026-01-01\n`,
    'src/slash-qualified.ts': `const route = ${JSON.stringify(`fixture-provider/${canonicalId}`)};\n`,
    'src/colon-qualified.ts': `const route = ${JSON.stringify(`fixture-provider:${canonicalId}`)};\n`,
    'src/colon-label.ts': `${canonicalId}: fixture label\n`,
    'docs/sentence.md': `The selected model is ${canonicalId}.\n`,
    'scripts/default.sh': `MODEL=\${MODEL_OVERRIDE:-${canonicalId}}\n`,
  });
  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths, tokens });

  assert.equal(violations.length, 12);
  assert.ok(!violations.some((violation) => violation.file.endsWith('synthetic.test.ts')));
  assert.ok(!violations.some((violation) => violation.file.endsWith('embedded.ts')));
  assert.ok(violations.some((violation) => violation.file.endsWith('extended-alias.ts')));
  assert.ok(violations.some((violation) => violation.file.endsWith('wrapped-fixture.test.ts')));
  assert.ok(violations.some((violation) => violation.file.endsWith('dated-snapshot.snap')));
  assert.ok(violations.some((violation) => violation.file.endsWith('word-prefix.test.ts')));
  assert.ok(violations.some((violation) => violation.file.endsWith('word-snapshot.snap')));
  assert.ok(violations.some((violation) => violation.file.endsWith('word-fixture.json')));
  assert.ok(violations.some((violation) => violation.file.endsWith('word-property.txt')));
  assert.equal(violations.filter((violation) => violation.id === canonicalId).length, 7);
  assert.equal(violations.filter((violation) => violation.id === wordLikeId).length, 4);
});

test('longest-token-first matching reports a known extended ID only once', () => {
  const sandbox = createSandbox();
  const filePaths = writeFiles(sandbox, {
    'src/longest.ts': `const model = ${JSON.stringify(prefixPair.longer)};\n`,
  });
  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths, tokens });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].id, prefixPair.longer);
  assert.notEqual(violations[0].id, prefixPair.shorter);
});

test('allows only exact model-registry owner and generated mirror paths', () => {
  const sandbox = createSandbox();
  const exactOwner = MODEL_ID_OWNER_PATHS[0];
  const exactGenerated = MODEL_ID_OWNER_PATHS.find((relativePath) =>
    relativePath.endsWith('/models.json'),
  );
  assert.ok(exactGenerated);

  const filePaths = writeFiles(sandbox, {
    [exactOwner]: JSON.stringify({ model: canonicalId }),
    [exactGenerated]: JSON.stringify({ model: canonicalId }),
    'packages/ai/model-registry/catalog/copied-models.json': JSON.stringify({ model: canonicalId }),
    'packages/contracts/types/src/copied-models.json': JSON.stringify({ model: canonicalId }),
    'packages/ai/model-registry/tests/owner-lookalike.test.ts': `const id = ${JSON.stringify(canonicalId)};\n`,
  });
  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths, tokens });

  assert.equal(violations.length, 3);
  assert.ok(
    violations.every(
      (violation) => violation.file.includes('copied-models') || violation.file.includes('tests/'),
    ),
  );
  assert.ok(!violations.some((violation) => violation.file === exactOwner));
  assert.ok(!violations.some((violation) => violation.file === exactGenerated));
});

test('allows the compiler-owned skill analyzer registry but not sibling YAML files', () => {
  const sandbox = createSandbox();
  const generatedRegistry = MODEL_ID_OWNER_PATHS.find((relativePath) =>
    relativePath.endsWith('/skillspector/providers/openai/model_registry.yaml'),
  );
  assert.ok(generatedRegistry);

  const filePaths = writeFiles(sandbox, {
    [generatedRegistry]: `default_model: '${canonicalId}'\n`,
    'tools/skill-vetting/src/skillspector/providers/openai/copied_registry.yaml': `default_model: '${canonicalId}'\n`,
  });
  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths, tokens });

  assert.deepEqual(
    violations.map(({ file }) => file),
    ['tools/skill-vetting/src/skillspector/providers/openai/copied_registry.yaml'],
  );
});

test('fails closed instead of silently skipping a non-UTF-8 source file', () => {
  const sandbox = createSandbox();
  const invalidSource = path.join(sandbox, 'src/invalid.ts');
  mkdirSync(path.dirname(invalidSource), { recursive: true });
  writeFileSync(invalidSource, Buffer.from([0xff, 0xfe]));

  assert.throws(
    () => scanModelIdFiles({ repoRoot: sandbox, filePaths: [invalidSource], tokens }),
    /Cannot scan non-UTF-8 repository file/,
  );
});

test('scans a symlink target as repository text instead of following or skipping it', () => {
  const sandbox = createSandbox();
  const link = path.join(sandbox, 'src/model-link.ts');
  mkdirSync(path.dirname(link), { recursive: true });
  symlinkSync(canonicalId, link);

  const { violations } = scanModelIdFiles({ repoRoot: sandbox, filePaths: [link], tokens });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].id, canonicalId);
});

test('repository discovery includes tracked and untracked files but honors git ignores', () => {
  const sandbox = createSandbox();
  writeFiles(sandbox, {
    '.gitignore': 'ignored.ts\n',
    'tracked.ts': 'export const tracked = true;\n',
    'untracked.ts': 'export const untracked = true;\n',
    'ignored.ts': 'export const ignored = true;\n',
  });
  execFileSync('git', ['init', '--quiet'], { cwd: sandbox });
  execFileSync('git', ['add', '.gitignore', 'tracked.ts'], { cwd: sandbox });

  const relativeFiles = discoverRepositoryFiles(sandbox).map((file) =>
    path.relative(sandbox, file),
  );
  assert.ok(relativeFiles.includes('tracked.ts'));
  assert.ok(relativeFiles.includes('untracked.ts'));
  assert.ok(!relativeFiles.includes('ignored.ts'));
});
