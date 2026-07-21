import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_JSON = path.join(PACKAGE_ROOT, 'schema', 'registry.schema.json');
const REGISTRY_JSON = path.join(PACKAGE_ROOT, 'generated', 'registry.json');

test('generated registry satisfies the canonical JSON schema', () => {
  assert.ok(fs.existsSync(SCHEMA_JSON), 'canonical registry JSON schema must exist');

  const schema = JSON.parse(fs.readFileSync(SCHEMA_JSON, 'utf8'));
  const registry = JSON.parse(fs.readFileSync(REGISTRY_JSON, 'utf8'));
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);

  assert.equal(validate(registry), true, JSON.stringify(validate.errors, null, 2));

  const invalid = JSON.parse(JSON.stringify(registry));
  delete invalid.routes['openai/gpt-5.6-luna'].harnessId;
  assert.equal(validate(invalid), false, 'schema must reject a route without its harness binding');
  assert.ok(
    validate.errors?.some(
      (error) => error.keyword === 'required' && error.params.missingProperty === 'harnessId',
    ),
  );

  const invalidRuntimeProfile = JSON.parse(JSON.stringify(registry));
  delete invalidRuntimeProfile.runtimeProfiles['cli/byok-chat'].trustMode;
  assert.equal(
    validate(invalidRuntimeProfile),
    false,
    'schema must reject runtime admission without an explicit trust mode',
  );
});
