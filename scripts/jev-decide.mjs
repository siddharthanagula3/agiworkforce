#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  ENV,
  TypeSafeClient,
} from '@typesafe-ai/sdk';

export const config = Object.freeze(
  JSON.parse(readFileSync(new URL('./config/jev-decisions.json', import.meta.url), 'utf8')),
);
export const abstention = 'no_suitable_choice';
const envFile = new URL('../.env.local', import.meta.url);

export class DecisionError extends Error {}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isProbability = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const hasContent = (value) =>
  typeof value === 'string'
    ? value.trim().length > 0
    : (isObject(value) || Array.isArray(value)) && Object.keys(value).length > 0;
const sameKeys = (left, right) =>
  isObject(left) &&
  Object.keys(left).length === Object.keys(right).length &&
  Object.keys(right).every((key) => Object.hasOwn(left, key));

export function readCredential(environment = process.env, file = envFile) {
  if (environment.TYPESAFE_API_KEY?.trim()) return environment.TYPESAFE_API_KEY.trim();
  let values;
  try {
    values = parseEnv(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new DecisionError('Cannot read repository-root .env.local.');
  }
  const key = values?.TYPESAFE_API_KEY?.trim();
  if (!key) {
    throw new DecisionError(
      'Set TYPESAFE_API_KEY in repository-root .env.local or the environment.',
    );
  }
  return key;
}

export async function readInput(stream, maxBytes = config.maxInputBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes)
      throw new DecisionError('Decision input exceeds the configured byte limit.');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new DecisionError('Expected a JSON decision request on stdin.');
  }
}

export function validateInput(input) {
  if (
    !isObject(input) ||
    Object.keys(input).some((key) => !['state', 'questions'].includes(key)) ||
    !hasContent(input.state) ||
    !isObject(input.questions) ||
    Object.keys(input.questions).length === 0
  ) {
    throw new DecisionError('Provide only a nonempty state and a nonempty questions object.');
  }
  for (const [id, question] of Object.entries(input.questions)) {
    if (
      !id.trim() ||
      !isObject(question) ||
      Object.keys(question).some(
        (key) => !['type', 'instructions', 'criteria', 'minimumConfidence'].includes(key),
      ) ||
      question.type !== 'choice' ||
      !hasContent(question.instructions) ||
      !isObject(question.criteria) ||
      Object.keys(question.criteria).length < 2 ||
      !Object.hasOwn(question.criteria, abstention) ||
      !hasContent(question.criteria[abstention]) ||
      Object.entries(question.criteria).some(
        ([label, description]) =>
          !label.trim() || (description !== null && !hasContent(description)),
      ) ||
      (question.minimumConfidence !== undefined && !isProbability(question.minimumConfidence))
    ) {
      throw new DecisionError(
        'Each question needs type choice, instructions, criteria including a described no_suitable_choice, and an optional minimumConfidence between 0 and 1.',
      );
    }
  }
  return {
    state: input.state,
    questions: Object.fromEntries(
      Object.entries(input.questions).map(([id, { type, instructions, criteria }]) => [
        id,
        { type, instructions, criteria },
      ]),
    ),
  };
}

export function validateResponse(response, input) {
  if (
    !isObject(response) ||
    typeof response.model !== 'string' ||
    !response.model.trim() ||
    !sameKeys(response.answers, input.questions) ||
    !isObject(response.usage) ||
    !['input_tokens', 'output_tokens'].every(
      (key) => Number.isSafeInteger(response.usage[key]) && response.usage[key] >= 0,
    )
  ) {
    throw new DecisionError(
      'TypeSafe returned an invalid decision response; no selection is usable.',
    );
  }
  const decisions = Object.fromEntries(
    Object.entries(input.questions).map(([id, question]) => {
      const answer = response.answers[id];
      if (
        !isObject(answer) ||
        answer.type !== 'choice' ||
        typeof answer.choice !== 'string' ||
        !Object.hasOwn(question.criteria, answer.choice) ||
        !isProbability(answer.confidence) ||
        !sameKeys(answer.probabilities, question.criteria) ||
        !Object.values(answer.probabilities).every(isProbability)
      ) {
        throw new DecisionError(
          'TypeSafe returned an invalid Choice answer; no selection is usable.',
        );
      }
      const probabilities = Object.values(answer.probabilities);
      const maximum = Math.max(...probabilities);
      if (
        Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) >
          config.probabilitySumTolerance ||
        answer.probabilities[answer.choice] !== maximum
      ) {
        throw new DecisionError('TypeSafe returned an inconsistent probability distribution.');
      }
      let reason = null;
      if (answer.choice === abstention) reason = 'no_suitable_choice';
      else if (probabilities.filter((value) => value === maximum).length > 1)
        reason = 'tied_options';
      else if (answer.confidence < (question.minimumConfidence ?? 0))
        reason = 'below_minimum_confidence';
      return [
        id,
        {
          status: reason === null ? 'selected' : 'needs_review',
          choice: answer.choice,
          confidence: answer.confidence,
          probabilities: answer.probabilities,
          ...(reason === null ? {} : { reason }),
        },
      ];
    }),
  );
  return {
    status: Object.values(decisions).some((decision) => decision.status === 'needs_review')
      ? 'needs_review'
      : 'selected',
    requestHash: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    model: response.model,
    decisions,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

export function createClient(apiKey, fetchImpl = globalThis.fetch, environment = process.env) {
  if (environment[ENV.baseURL]?.trim() || environment[ENV.defaultModel]?.trim()) {
    throw new DecisionError(
      'Remove TypeSafe endpoint/model overrides to use the SDK Jev defaults.',
    );
  }
  return new TypeSafeClient({
    apiKey,
    logLevel: 'off',
    timeout: config.timeoutMs,
    retry: { maxRetries: config.maxRetries, apiConnectionError: false, apiTimeoutError: false },
    fetch: (url, options) => fetchImpl(url, { ...options, redirect: 'error' }),
  });
}

export async function decide(input, apiKey, client = createClient(apiKey)) {
  const request = validateInput(input);
  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized) > config.maxInputBytes) {
    throw new DecisionError('Decision input exceeds the configured byte limit.');
  }
  if (serialized.includes(apiKey)) {
    throw new DecisionError(
      'Decision input contains the TypeSafe credential; remove it before retrying.',
    );
  }
  const response = await client.systemOne(request, {
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  return validateResponse(response, input);
}

export function errorMessage(error) {
  if (error instanceof DecisionError) return error.message;
  if (error instanceof APIError)
    return `TypeSafe request failed (HTTP ${error.status}); decision paused.`;
  if (error instanceof APITimeoutError || error instanceof APIUserAbortError) {
    return 'TypeSafe request exceeded its deadline; decision paused.';
  }
  if (error instanceof APIConnectionError) return 'Cannot reach TypeSafe; decision paused.';
  return 'Jev decision failed; no fallback selection was made.';
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    console.log('Usage: pnpm -s agent:decide < decision.json');
    console.log(
      'Input: {state, questions: {id: {type: "choice", instructions, criteria, minimumConfidence?}}}',
    );
    console.log('Include a described no_suitable_choice criterion in every question.');
    console.log(
      'Direct Node exit codes: 0 selected; 2 needs review; 1 failure. No actions are executed.',
    );
    console.log('The pnpm wrapper may normalize nonzero exits; use the JSON status.');
    console.log('See docs/development/agent-workflow.md#jev-decisions.');
    return;
  }
  if (process.argv.length !== 2 || process.stdin.isTTY) {
    throw new DecisionError(
      'Pipe a JSON request to pnpm -s agent:decide; use --help for the interface.',
    );
  }
  const apiKey = readCredential();
  const result = await decide(await readInput(process.stdin), apiKey);
  console.log(JSON.stringify(result, null, 2).replaceAll(apiKey, '[REDACTED]'));
  process.exitCode = result.status === 'selected' ? 0 : 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(JSON.stringify({ status: 'error', error: errorMessage(error) }));
    process.exitCode = 1;
  });
}
