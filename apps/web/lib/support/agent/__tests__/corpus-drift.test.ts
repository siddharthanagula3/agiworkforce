import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..', '..', '..', '..');
const SCRIPT = join(WEB_ROOT, 'scripts', 'build-support-corpus.mjs');
const COMMITTED = join(WEB_ROOT, 'lib', 'support', 'agent', 'corpus.generated.json');

const workDir = mkdtempSync(join(tmpdir(), 'support-corpus-'));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

interface ProbeChunk {
  text: string;
  phoneText?: string | null;
}

function buildFromDocument(markdown: string): {
  ok: boolean;
  message: string;
  onPhone?: boolean;
  chunks?: ProbeChunk[];
} {
  const contentDir = mkdtempSync(join(workDir, 'content-'));
  const out = join(contentDir, 'out.json');
  writeFileSync(join(contentDir, 'probe.md'), markdown, 'utf8');
  try {
    execFileSync(process.execPath, [SCRIPT, '--content', contentDir, '--out', out], {
      cwd: WEB_ROOT,
      stdio: 'pipe',
    });
    const built = JSON.parse(readFileSync(out, 'utf8')) as {
      documents: { onPhone: boolean; chunks: ProbeChunk[] }[];
    };
    return {
      ok: true,
      message: '',
      onPhone: built.documents[0]?.onPhone,
      chunks: built.documents[0]?.chunks,
    };
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
    return { ok: false, message: stderr };
  }
}

function documentWithBody(body: string, overrides: Partial<Record<string, string>> = {}): string {
  return documentWith(overrides).replace(
    '## A section\n\nSome body text for the probe document.\n',
    `## A section\n\n${body}\n`,
  );
}

function documentWith(overrides: Partial<Record<string, string>> = {}): string {
  const frontmatter = {
    id: 'probe-doc',
    title: 'Probe document',
    path: '/help',
    category: 'probe',
    tags: 'probe, test',
    updated: '2026-08-05',
    scope: 'public',
    ...overrides,
  };
  const block = Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return `---\n${block}\n---\n\n## A section\n\nSome body text for the probe document.\n`;
}

describe('support corpus artifact', () => {
  it('is byte-identical to a fresh build', () => {
    const out = join(workDir, 'corpus.generated.json');
    execFileSync(process.execPath, [SCRIPT, '--out', out], { cwd: WEB_ROOT });
    expect(readFileSync(out, 'utf8')).toBe(readFileSync(COMMITTED, 'utf8'));
  });

  it('passes its own --check mode', () => {
    const output = execFileSync(process.execPath, [SCRIPT, '--check'], {
      cwd: WEB_ROOT,
      encoding: 'utf8',
    });
    expect(output).toContain('up to date');
  });
});

describe('corpus builder guards', () => {
  it('accepts a well-formed document (guards the negative cases below)', () => {
    expect(buildFromDocument(documentWith()).ok).toBe(true);
  });

  it('rejects a path that does not resolve to a real page', () => {
    const result = buildFromDocument(documentWith({ path: '/not-a-real-route' }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('does not resolve to a real page');
  });

  it.each(['/settings/billing', '/admin', '/api/support', '/dev', '/user/profile'])(
    'rejects the non-public path %s',
    (path) => {
      const result = buildFromDocument(documentWith({ path }));
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/non-public prefix|does not resolve/);
    },
  );

  it('rejects a document that is not scoped public', () => {
    const result = buildFromDocument(documentWith({ scope: 'internal' }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('scope must be "public"');
  });

  it('accepts an optional one-sentence description', () => {
    expect(buildFromDocument(documentWith({ description: 'What the probe covers.' })).ok).toBe(
      true,
    );
  });

  it.each([
    ['one that is not a sentence', 'What the probe covers'],
    ['one that is too long', `${'a'.repeat(200)}.`],
    ['one that holds a fact token', 'Works on {{SURFACES.names}}.'],
  ])('rejects a description %s', (_label, description) => {
    const result = buildFromDocument(documentWith({ description }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('description must be one plain sentence');
  });

  it('rejects unknown frontmatter keys', () => {
    const result = buildFromDocument(documentWith({ secretFlag: 'yes' }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('unknown frontmatter key');
  });

  it('rejects a document missing required frontmatter', () => {
    const result = buildFromDocument(
      '---\nid: probe\n---\n\n## Section\n\nBody.\n'.replace('probe', 'probe-doc'),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain('missing required frontmatter key');
  });

  it('rejects a path escaping the app directory', () => {
    const result = buildFromDocument(documentWith({ path: '/../../etc' }));
    expect(result.ok).toBe(false);
  });
});

describe('corpus builder purchase passages', () => {
  const PURCHASE_SENTENCE = 'A self-serve paid plan starts at checkout.';

  it('fails on an unmarked purchase sentence in an article the phone lists', () => {
    const result = buildFromDocument(documentWithBody(`Open the chat. ${PURCHASE_SENTENCE}`));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('"paid" is purchase vocabulary in an article the phone lists');
  });

  it.each([
    ['title', { title: 'Upgrading your plan' }],
    ['tags', { tags: 'probe, pricing' }],
    ['description', { description: 'How refunds work.' }],
  ])(
    'fails on purchase vocabulary in the %s of an article the phone lists',
    (_field, overrides) => {
      const result = buildFromDocument(documentWith(overrides));
      expect(result.ok).toBe(false);
      expect(result.message).toContain('purchase vocabulary in an article the phone lists');
    },
  );

  it('fails on purchase vocabulary in the heading of a section the phone keeps', () => {
    const result = buildFromDocument(documentWith().replace('## A section', '## Billing'));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('heading');
  });

  it('allows a plan name used only as a label', () => {
    expect(buildFromDocument(documentWithBody('The Free plan includes two models.')).ok).toBe(true);
  });

  it.each([
    ['a payment', 'Any payment still moving is kept.', '"payment"'],
    ['a renewal', 'Cancelling the deletion turns its renewal back on.', '"renewal"'],
    ['credits', 'Requests continue while you have credits.', '"credits"'],
    [
      'the list of plans a feature needs',
      'Managed cloud from the CLI requires one of these plans: {{PLANS.developer_surfaces}}.',
      '"{{PLANS."',
    ],
  ])('fails on %s in an article the phone lists', (_label, body, word) => {
    const result = buildFromDocument(documentWithBody(body));
    expect(result.ok).toBe(false);
    expect(result.message).toContain(`${word} is purchase vocabulary`);
  });

  it('allows a payment card named as a kind of personal data', () => {
    const body = 'Memory refuses passwords, payment card and bank account details.';
    expect(buildFromDocument(documentWithBody(body)).ok).toBe(true);
  });

  it('keeps a marked passage on the web and leaves it out for the phone', () => {
    const result = buildFromDocument(
      documentWithBody(
        `Open the chat.\n\n{{#purchase}}\n\n${PURCHASE_SENTENCE}\n\n{{/purchase}}\n\nSend a message.`,
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.onPhone).toBe(true);
    expect(result.chunks?.[0]?.text).toBe(
      `Open the chat.\n\n${PURCHASE_SENTENCE}\n\nSend a message.`,
    );
    expect(result.chunks?.[0]?.phoneText).toBe('Open the chat.\n\nSend a message.');
  });

  it('keeps a list tight on the web when one of its items is marked', () => {
    const result = buildFromDocument(
      documentWithBody(
        '- First item.\n\n{{#purchase}}\n- Upgrade item.\n\n{{/purchase}}\n- Last item.',
      ),
    );
    expect(result.chunks?.[0]?.text).toBe('- First item.\n- Upgrade item.\n- Last item.');
    expect(result.chunks?.[0]?.phoneText).toBe('- First item.\n- Last item.');
  });

  it('hides a section from the phone when the whole of it is marked', () => {
    const result = buildFromDocument(
      documentWithBody(`{{#purchase}}\n\n${PURCHASE_SENTENCE}\n\n{{/purchase}}`),
    );
    expect(result.ok).toBe(true);
    expect(result.chunks?.[0]?.text).toBe(PURCHASE_SENTENCE);
    expect(result.chunks?.[0]?.phoneText).toBeNull();
  });

  it.each([
    ['is never closed', `{{#purchase}}\n\n${PURCHASE_SENTENCE}`, 'is never closed'],
    ['is closed without being opened', `Open the chat.\n\n{{/purchase}}`, 'never opened'],
    [
      'sits inside a sentence',
      `Open the chat. {{#purchase}}${PURCHASE_SENTENCE}{{/purchase}}`,
      'must stand alone on its own line',
    ],
    [
      'touches the paragraph above it',
      `Open the chat.\n{{#purchase}}\n\n${PURCHASE_SENTENCE}\n\n{{/purchase}}`,
      'needs a blank line above it',
    ],
    [
      'touches the sentence below it',
      `Open the chat.\n\n{{#purchase}}\n${PURCHASE_SENTENCE}\n\n{{/purchase}}`,
      'must be followed by a blank line',
    ],
  ])('rejects a marker that %s', (_label, body, message) => {
    const result = buildFromDocument(documentWithBody(body));
    expect(result.ok).toBe(false);
    expect(result.message).toContain(message);
  });

  it('allows purchase vocabulary in an article about purchasing, which the phone does not list', () => {
    const result = buildFromDocument(
      documentWithBody(PURCHASE_SENTENCE, { category: 'billing', tags: 'pricing, billing' }),
    );
    expect(result.ok).toBe(true);
    expect(result.onPhone).toBe(false);
  });

  it('allows purchase vocabulary in an article marked as not listed on the phone', () => {
    const result = buildFromDocument(documentWithBody(PURCHASE_SENTENCE, { phone: 'unlisted' }));
    expect(result.ok).toBe(true);
    expect(result.onPhone).toBe(false);
  });

  it('accepts no other value for the phone key', () => {
    const result = buildFromDocument(documentWith({ phone: 'listed' }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('phone may only be "unlisted"');
  });
});
