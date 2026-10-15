import { describe, expect, it } from 'vitest';
import {
  parseElicitationInputRequests,
  safeElicitationUrl,
  validateElicitationResponses,
  type ElicitationPrompt,
} from '../mcp-elicitation';

const formRequest = {
  method: 'elicitation/create',
  params: {
    mode: 'form',
    message: 'Which repository should I use?',
    requestedSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', title: 'Repository', minLength: 3, maxLength: 40 },
        email: { type: 'string', format: 'email' },
        count: { type: 'integer', minimum: 1, maximum: 5 },
        private: { type: 'boolean', default: false },
        branch: { type: 'string', enum: ['main', 'dev'] },
        tier: {
          type: 'string',
          oneOf: [
            { const: 'a', title: 'Alpha' },
            { const: 'b', title: 'Beta' },
          ],
        },
        labels: {
          type: 'array',
          minItems: 1,
          maxItems: 2,
          items: { type: 'string', enum: ['bug', 'docs', 'ui'] },
        },
      },
      required: ['repo', 'count'],
    },
  },
};

const urlRequest = {
  method: 'elicitation/create',
  params: {
    mode: 'url',
    message: 'Connect your billing account',
    url: 'https://pay.example.com/x',
  },
};

function prompts(raw: Record<string, unknown>): ElicitationPrompt[] {
  const parsed = parseElicitationInputRequests(raw);
  if (!parsed) throw new Error('expected prompts');
  return parsed;
}

describe('parseElicitationInputRequests', () => {
  it('renders a flat primitive form schema field by field', () => {
    const [prompt] = prompts({ k1: formRequest });
    expect(prompt?.mode).toBe('form');
    if (prompt?.mode !== 'form') return;
    expect(prompt.fields.map((field) => [field.name, field.kind, field.required])).toEqual([
      ['repo', 'string', true],
      ['email', 'string', false],
      ['count', 'integer', true],
      ['private', 'boolean', false],
      ['branch', 'enum', false],
      ['tier', 'enum', false],
      ['labels', 'multi_enum', false],
    ]);
  });

  it('refuses a nested object property', () => {
    expect(
      parseElicitationInputRequests({
        k1: {
          method: 'elicitation/create',
          params: {
            message: 'nested',
            requestedSchema: {
              type: 'object',
              properties: { address: { type: 'object', properties: {} } },
            },
          },
        },
      }),
    ).toBeNull();
  });

  it('refuses a required name the schema does not define', () => {
    expect(
      parseElicitationInputRequests({
        k1: {
          ...formRequest,
          params: {
            ...formRequest.params,
            requestedSchema: { ...formRequest.params.requestedSchema, required: ['ghost'] },
          },
        },
      }),
    ).toBeNull();
  });

  it('refuses sampling and roots requests, which no card can answer', () => {
    expect(parseElicitationInputRequests({ k1: { method: 'roots/list' } })).toBeNull();
    expect(
      parseElicitationInputRequests({ k1: formRequest, k2: { method: 'sampling/createMessage' } }),
    ).toBeNull();
  });

  it('accepts an https URL step and names its host', () => {
    const [prompt] = prompts({ k1: urlRequest });
    expect(prompt).toMatchObject({ mode: 'url', host: 'pay.example.com' });
  });

  it.each([
    'http://pay.example.com/x',
    'javascript:alert(1)',
    'https://user:secret@pay.example.com/x',
    'data:text/html,hi',
    'not a url',
  ])('refuses the URL step %s', (url) => {
    expect(
      parseElicitationInputRequests({
        k1: { ...urlRequest, params: { ...urlRequest.params, url } },
      }),
    ).toBeNull();
  });
});

describe('safeElicitationUrl', () => {
  it('keeps only https without credentials', () => {
    expect(safeElicitationUrl('https://a.example/p?q=1')).toEqual({
      url: 'https://a.example/p?q=1',
      host: 'a.example',
    });
    expect(safeElicitationUrl('https://u@a.example')).toBeNull();
  });
});

describe('validateElicitationResponses', () => {
  const form = prompts({ k1: formRequest });

  it('accepts content that satisfies every field', () => {
    const result = validateElicitationResponses(form, {
      k1: {
        action: 'accept',
        content: { repo: 'agi/web', count: 2, labels: ['bug'], tier: 'b', private: true },
      },
    });
    expect(result).toEqual({
      ok: true,
      responses: {
        k1: {
          action: 'accept',
          content: { repo: 'agi/web', count: 2, labels: ['bug'], tier: 'b', private: true },
        },
      },
    });
  });

  it.each([
    [{ count: 2 }, 'repo'],
    [{ repo: 'ab', count: 2 }, 'repo'],
    [{ repo: 'agi/web', count: 2.5 }, 'count'],
    [{ repo: 'agi/web', count: 9 }, 'count'],
    [{ repo: 'agi/web', count: 2, email: 'nope' }, 'email'],
    [{ repo: 'agi/web', count: 2, email: 'a@b' }, 'email'],
    [{ repo: 'agi/web', count: 2, email: 'a@b.' }, 'email'],
    [{ repo: 'agi/web', count: 2, email: `!@!.${'!.'.repeat(1_990)} ` }, 'email'],
    [{ repo: 'agi/web', count: 2, branch: 'prod' }, 'branch'],
    [{ repo: 'agi/web', count: 2, labels: ['bug', 'docs', 'ui'] }, 'labels'],
    [{ repo: 'agi/web', count: 2, extra: 'x' }, 'extra'],
  ])('refuses %j', (content, name) => {
    const result = validateElicitationResponses(form, { k1: { action: 'accept', content } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(name);
  });

  it('accepts a dotted email address', () => {
    const result = validateElicitationResponses(form, {
      k1: {
        action: 'accept',
        content: { repo: 'agi/web', count: 2, email: 'first.last@mail.example.co' },
      },
    });
    expect(result.ok).toBe(true);
  });

  it.each(['decline', 'cancel'] as const)(
    'passes an explicit %s through without content',
    (action) => {
      expect(validateElicitationResponses(form, { k1: { action } })).toEqual({
        ok: true,
        responses: { k1: { action } },
      });
    },
  );

  it('refuses content on a decline', () => {
    expect(
      validateElicitationResponses(form, { k1: { action: 'decline', content: { repo: 'x' } } }).ok,
    ).toBe(false);
  });

  it('refuses a missing or an extra answer key', () => {
    expect(validateElicitationResponses(form, {}).ok).toBe(false);
    expect(
      validateElicitationResponses(form, { k1: { action: 'cancel' }, k2: { action: 'cancel' } }).ok,
    ).toBe(false);
  });

  it('accepts a URL step only without content', () => {
    const url = prompts({ k1: urlRequest });
    expect(validateElicitationResponses(url, { k1: { action: 'accept' } }).ok).toBe(true);
    expect(
      validateElicitationResponses(url, { k1: { action: 'accept', content: { token: 'x' } } }).ok,
    ).toBe(false);
  });
});
