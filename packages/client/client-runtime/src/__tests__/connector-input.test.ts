import { describe, expect, it } from 'vitest';
import {
  readConnectorInputPrompts,
  readConnectorInputLink,
  validateConnectorInputResponses,
} from '../connectors/input-request';

function form(properties: Record<string, unknown>, required: unknown = ['repo']) {
  return {
    details: {
      method: 'elicitation/create',
      params: {
        mode: 'form',
        message: 'Choose details',
        requestedSchema: { type: 'object', properties, required },
      },
    },
  };
}

describe('connector input schema ownership', () => {
  it('refuses a required property absent from the actual form schema', () => {
    expect(readConnectorInputPrompts(form({ repo: { type: 'string' } }, ['missing']))).toEqual([
      { key: 'details', mode: 'unsupported' },
    ]);
  });

  it('does not count inherited object properties as declared required fields', () => {
    expect(readConnectorInputPrompts(form({ repo: { type: 'string' } }, ['toString']))).toEqual([
      { key: 'details', mode: 'unsupported' },
    ]);
  });

  it('keeps declared optional and required fields with their existing bounds', () => {
    expect(
      readConnectorInputPrompts(
        form({
          repo: { type: 'string', minLength: 3, maxLength: 100 },
          count: { type: 'integer', minimum: 1, maximum: 3 },
          urgent: { type: 'boolean' },
        }),
      ),
    ).toMatchObject([
      {
        mode: 'form',
        fields: [
          { key: 'repo', kind: 'text', required: true, minLength: 3, maxLength: 100 },
          { key: 'count', kind: 'number', integer: true, required: false, minimum: 1, maximum: 3 },
          { key: 'urgent', kind: 'boolean', required: false },
        ],
      },
    ]);
  });

  it('still refuses nested form fields', () => {
    expect(readConnectorInputPrompts(form({ repo: { type: 'object', properties: {} } }))).toEqual([
      { key: 'details', mode: 'unsupported' },
    ]);
  });

  it.each([
    'http://example.test/path',
    'https://user:pass@example.test/path',
    'javascript:alert(1)',
  ])('does not make an unsafe URL openable: %s', (url) => {
    expect(readConnectorInputLink(url)?.openable).toBe(false);
  });

  it('keeps the explicit HTTPS link host and punycode warning policy', () => {
    expect(readConnectorInputLink('https://xn--bcher-kva.example/path')).toMatchObject({
      openable: true,
      punycode: true,
      host: 'xn--bcher-kva.example',
    });
  });
});

const request = form(
  {
    repo: { type: 'string', minLength: 3, maxLength: 20 },
    count: { type: 'integer', minimum: 1, maximum: 3 },
    email: { type: 'string', format: 'email' },
    tier: { type: 'string', enum: ['low', 'high'] },
    labels: {
      type: 'array',
      items: { type: 'string', enum: ['bug', 'docs'] },
      minItems: 1,
      maxItems: 2,
    },
    urgent: { type: 'boolean' },
  },
  ['repo', 'count'],
);
const prompts = readConnectorInputPrompts(request);
const valid = { repo: 'agi/web', count: 2, tier: 'high', labels: ['bug'], urgent: false };
const answer = (content: unknown) => ({ details: { action: 'accept', content } });

describe('server-owned connector response validation', () => {
  it('accepts typed content without losing explicit false or number values', () => {
    expect(validateConnectorInputResponses(prompts, answer(valid))).toEqual({
      ok: true,
      responses: answer(valid),
    });
  });

  it.each([
    { ...valid, count: '2' },
    { ...valid, count: 2.5 },
    { ...valid, count: 4 },
    { ...valid, repo: 'ab' },
    { ...valid, repo: 'a'.repeat(21) },
    { ...valid, urgent: 'false' },
    { ...valid, email: 'nope' },
    { ...valid, tier: 'unlisted' },
    { ...valid, labels: ['unlisted'] },
    { ...valid, labels: ['bug', 'bug'] },
    { ...valid, labels: [] },
    { ...valid, extra: 'unrequested' },
    { count: 2 },
  ])('rejects malformed, unrequested or out-of-bounds content %j', (content) => {
    expect(validateConnectorInputResponses(prompts, answer(content)).ok).toBe(false);
  });

  it.each(['decline', 'cancel'] as const)(
    'accepts an explicit %s without content only',
    (action) => {
      expect(validateConnectorInputResponses(prompts, { details: { action } })).toEqual({
        ok: true,
        responses: { details: { action } },
      });
      expect(
        validateConnectorInputResponses(prompts, { details: { action, content: {} } }).ok,
      ).toBe(false);
    },
  );

  it('rejects missing, extra and unknown response/action keys', () => {
    expect(validateConnectorInputResponses([], {}).ok).toBe(false);
    for (const raw of [
      {},
      { ...answer(valid), extra: { action: 'cancel' } },
      { details: { action: 'proceed' } },
      { details: { action: 'accept', content: valid, extra: true } },
    ]) {
      expect(validateConnectorInputResponses(prompts, raw).ok).toBe(false);
    }
  });

  it('accepts only a permitted URL acknowledgement without form content', () => {
    const link = (url: string) =>
      readConnectorInputPrompts({
        details: {
          method: 'elicitation/create',
          params: { mode: 'url', message: 'Continue', url },
        },
      });
    const safe = link('https://example.test/continue');
    expect(validateConnectorInputResponses(safe, { details: { action: 'accept' } }).ok).toBe(true);
    expect(validateConnectorInputResponses(safe, answer({ token: 'fixture' })).ok).toBe(false);
    expect(
      validateConnectorInputResponses(link('http://example.test'), {
        details: { action: 'accept' },
      }).ok,
    ).toBe(false);
  });
});
