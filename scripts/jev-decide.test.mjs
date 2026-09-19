import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import {
  config,
  createClient,
  decide,
  errorMessage,
  readCredential,
  readInput,
  validateInput,
  validateResponse,
} from './jev-decide.mjs';

const credential = 'test-credential';
const makeInput = () => ({
  state: { task: 'Choose which failing check to investigate first.' },
  questions: {
    priority: {
      type: 'choice',
      instructions: 'Which check should be investigated first?',
      criteria: {
        authentication: 'Authentication no longer rejects expired sessions.',
        appearance: 'A heading has incorrect spacing.',
        no_suitable_choice: 'Neither option is justified by the available evidence.',
      },
    },
  },
});
const makeResponse = () => ({
  model: 'test-model',
  answers: {
    priority: {
      type: 'choice',
      choice: 'authentication',
      confidence: 0.9,
      probabilities: { authentication: 0.9, appearance: 0.05, no_suitable_choice: 0.05 },
    },
  },
  usage: { input_tokens: 30, output_tokens: 12 },
});

test('loads only the credential from dotenv, without executing shell text or mutating the environment', () => {
  const directory = mkdtempSync(join(tmpdir(), 'jev-env-'));
  try {
    const file = join(directory, '.env.local');
    const environment = {};
    writeFileSync(file, 'TYPESAFE_API_KEY="file-credential"\nUNRELATED_SECRET="$(exit 1)"\n');
    assert.equal(readCredential(environment, file), 'file-credential');
    assert.deepEqual(environment, {});
    assert.equal(
      readCredential({ TYPESAFE_API_KEY: ' environment-credential ' }, file),
      'environment-credential',
    );
    assert.throws(() => readCredential({}, join(directory, 'missing')), /Set TYPESAFE_API_KEY/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('caps stdin bytes and reports malformed JSON without echoing its contents', async () => {
  await assert.rejects(readInput(Readable.from(['1234', '5678']), 6), /byte limit/);
  await assert.rejects(readInput(Readable.from(['{"private":"sensitive-text",}'])), (error) => {
    assert.equal(error.message.includes('sensitive-text'), false);
    return /JSON decision request/.test(error.message);
  });
  assert.deepEqual(await readInput(Readable.from([JSON.stringify(makeInput())])), makeInput());
});

test('requires explicit state, options and an abstention; rejects provider overrides', () => {
  for (const mutate of [
    (input) => {
      input.state = null;
    },
    (input) => {
      input.questions = {};
    },
    (input) => {
      delete input.questions.priority.criteria.no_suitable_choice;
    },
    (input) => {
      input.questions.priority.type = 'noul';
    },
    (input) => {
      input.questions.priority.instructions = '';
    },
    (input) => {
      input.questions.priority.minimumConfidence = 2;
    },
    (input) => {
      input.model = 'unapproved-model';
    },
  ]) {
    const input = makeInput();
    mutate(input);
    assert.throws(() => validateInput(input));
  }
});

test('uses the real SDK request format, its default model, and a bounded signal', async () => {
  let calls = 0;
  const input = makeInput();
  input.questions.priority.minimumConfidence = 0.8;
  const client = createClient(credential, async (_url, options) => {
    calls += 1;
    const sent = JSON.parse(options.body);
    assert.equal(sent.model, client.defaultModel);
    assert.deepEqual(sent.state, input.state);
    assert.equal(sent.questions.priority.minimumConfidence, undefined);
    assert.equal(options.headers.Authorization, `Bearer ${credential}`);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(makeResponse());
  });
  const result = await decide(input, credential, client);
  assert.equal(calls, 1);
  assert.equal(client.logLevel, 'off');
  assert.equal(client.retry.apiConnectionError, false);
  assert.equal(client.retry.apiTimeoutError, false);
  assert.equal(result.status, 'selected');
  assert.equal(result.decisions.priority.choice, 'authentication');
  assert.equal(result.requestHash.length, 64);
  assert.deepEqual(result.usage, makeResponse().usage);
});

test('invalid or secret-bearing input never reaches the transport', async () => {
  let called = false;
  const client = {
    systemOne: () => {
      called = true;
    },
  };
  const input = makeInput();
  input.state = { accidentallyPastedKey: credential };
  await assert.rejects(decide(input, credential, client), /contains the TypeSafe credential/);
  input.state = 'x'.repeat(config.maxInputBytes);
  await assert.rejects(decide(input, credential, client), /byte limit/);
  await assert.rejects(decide({}, credential, client), /state/);
  assert.equal(called, false);
});

test('abstention, ties and user-supplied confidence thresholds pause the affected choice', () => {
  for (const [choice, confidence, probabilities, expected] of [
    [
      'no_suitable_choice',
      0.9,
      { authentication: 0.05, appearance: 0.05, no_suitable_choice: 0.9 },
      'no_suitable_choice',
    ],
    [
      'authentication',
      0.1,
      { authentication: 0.5, appearance: 0.5, no_suitable_choice: 0 },
      'tied_options',
    ],
    [
      'authentication',
      0.5,
      { authentication: 0.7, appearance: 0.2, no_suitable_choice: 0.1 },
      'below_minimum_confidence',
    ],
  ]) {
    const input = makeInput();
    input.questions.priority.minimumConfidence = 0.8;
    const response = makeResponse();
    response.answers.priority = { type: 'choice', choice, confidence, probabilities };
    const result = validateResponse(response, input);
    assert.equal(result.status, 'needs_review');
    assert.equal(result.decisions.priority.reason, expected);
    assert.equal(result.decisions.priority.choice, choice);
  }
});

test('a batch preserves independent decisions when one question abstains', () => {
  const input = makeInput();
  input.questions.secondary = structuredClone(input.questions.priority);
  const response = makeResponse();
  response.answers.secondary = {
    type: 'choice',
    choice: 'no_suitable_choice',
    confidence: 1,
    probabilities: { authentication: 0, appearance: 0, no_suitable_choice: 1 },
  };
  const result = validateResponse(response, input);
  assert.equal(result.status, 'needs_review');
  assert.equal(result.decisions.priority.status, 'selected');
  assert.equal(result.decisions.secondary.status, 'needs_review');
});

test('rejects missing answers, unknown options, and malformed or inconsistent probabilities', () => {
  for (const mutate of [
    (response) => {
      delete response.answers.priority;
    },
    (response) => {
      response.answers.extra = response.answers.priority;
    },
    (response) => {
      response.answers.priority.choice = 'invented';
    },
    (response) => {
      response.answers.priority.choice = 'appearance';
    },
    (response) => {
      response.answers.priority.confidence = -1;
    },
    (response) => {
      response.answers.priority.probabilities.authentication = 0.1;
    },
    (response) => {
      response.answers.priority.probabilities.appearance = NaN;
    },
    (response) => {
      delete response.answers.priority.probabilities.no_suitable_choice;
    },
    (response) => {
      response.usage.input_tokens = -1;
    },
  ]) {
    const response = makeResponse();
    mutate(response);
    assert.throws(() => validateResponse(response, makeInput()));
  }
});

test('rejects endpoint and model overrides instead of changing providers silently', () => {
  assert.throws(
    () => createClient(credential, undefined, { TYPESAFE_BASE_URL: 'https://example.invalid' }),
    /overrides/,
  );
  assert.throws(
    () => createClient(credential, undefined, { TYPESAFE_DEFAULT_MODEL: 'other-model' }),
    /overrides/,
  );
});

test('authentication failure produces no fallback and never displays the provider error body', async () => {
  let calls = 0;
  const client = createClient(credential, async () => {
    calls += 1;
    return Response.json(
      { error: `do not print ${credential} or confidential context` },
      { status: 401 },
    );
  });
  await assert.rejects(decide(makeInput(), credential, client), (error) => {
    assert.equal(errorMessage(error), 'TypeSafe request failed (HTTP 401); decision paused.');
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(errorMessage(new Error(credential)).includes(credential), false);
});

test('CLI help is offline and invalid input exits with a safe error', () => {
  const cli = new URL('./jev-decide.mjs', import.meta.url);
  const environment = { PATH: process.env.PATH, TYPESAFE_API_KEY: credential };
  const help = execFileSync(process.execPath, [cli.pathname, '--help'], {
    env: environment,
    encoding: 'utf8',
  });
  assert.match(help, /no_suitable_choice/);
  const result = spawnSync(process.execPath, [cli.pathname], {
    env: environment,
    input: '{}',
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).status, 'error');
  assert.equal(result.stderr.includes(credential), false);
});

test('persistent instructions name the executable helper and its failure behavior', () => {
  const instructions = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  assert.match(instructions, /pnpm -s agent:decide/);
  assert.match(instructions, /never silently replace/);
});
