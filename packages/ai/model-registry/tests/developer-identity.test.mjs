import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..', '..');
const registry = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'generated', 'registry.json'), 'utf8'),
);
const developers = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'catalog', 'developers.json'), 'utf8'),
);
const compatibility = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, 'packages', 'contracts', 'types', 'src', 'models.json'),
    'utf8',
  ),
);

const HOST_ONLY_PROVIDERS = ['groq', 'open_router'];

test('every model identity names a developer that the registry labels', () => {
  for (const [modelKey, model] of Object.entries(registry.models)) {
    const developer = model.identity.developer;
    assert.ok(
      typeof developer === 'string' && developer.length > 0,
      `${modelKey} has no developer`,
    );
    assert.ok(registry.developers[developer], `${modelKey} developer ${developer} has no label`);
  }
});

test('a first-party provider inherits its developer from providerDeveloper', () => {
  for (const [providerId, developerId] of Object.entries(developers.providerDeveloper)) {
    for (const modelKey of registry.providerModelKeys[providerId] ?? []) {
      assert.equal(registry.models[modelKey].identity.developer, developerId, modelKey);
    }
  }
});

test('a host that serves other developers never becomes the developer', () => {
  for (const providerId of HOST_ONLY_PROVIDERS) {
    assert.equal(developers.providerDeveloper[providerId], undefined);
    for (const modelKey of registry.providerModelKeys[providerId] ?? []) {
      assert.notEqual(registry.models[modelKey].identity.developer, providerId, modelKey);
    }
  }
});

test('the author segment of a hosted wire id resolves through the alias table', () => {
  const hosted = Object.entries(registry.models).filter(([, model]) =>
    HOST_ONLY_PROVIDERS.includes(model.identity.provider),
  );
  assert.ok(hosted.length > 0);
  for (const [modelKey, model] of hosted) {
    const rawSegment = model.identity.providerModelId.split('/')[0];
    const segment = rawSegment.startsWith('~') ? rawSegment.slice(1) : rawSegment;
    const known = Object.entries(developers.developers).find(([id, developer]) =>
      [id, ...(developer.aliases ?? [])].some(
        (alias) => alias.toLowerCase() === segment.toLowerCase(),
      ),
    );
    const expected = known ? known[0] : segment.toLowerCase();
    assert.equal(model.identity.developer, expected, modelKey);
  }
});

test('the compatibility catalog mirrors developers and their labels', () => {
  assert.deepEqual(compatibility.developers, registry.developers);
  for (const [modelKey, model] of Object.entries(compatibility.models)) {
    assert.equal(model.developer, registry.models[modelKey].identity.developer, modelKey);
  }
});

test('the qwen provider is labelled as the cloud that serves it, not as the developer', () => {
  assert.equal(compatibility.providers.qwen.label, 'Alibaba Model Studio');
  assert.equal(registry.developers.qwen.label, 'Qwen');
});
