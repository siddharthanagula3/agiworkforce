// @vitest-environment node
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = path.resolve(__dirname, '..');
const LINT_TIMEOUT_MS = 120_000;

const eslint = new ESLint({ cwd: WEB_ROOT });

const BAN_TAGS = {
  'WEB-13': 'math-random',
  'WEB-18': 'auth-get-session',
  'WEB-37': 'inner-html',
  'text/html in a Blob': 'blob-html',
  'egress guard': 'mcp-discovery-fetch',
  'under their own names': 'mcp-discovery-alias',
} as const;

type BanTag = (typeof BAN_TAGS)[keyof typeof BAN_TAGS];

function tagOf(message: string): BanTag {
  const match = Object.entries(BAN_TAGS).find(([needle]) => message.includes(needle));
  if (!match) throw new Error(`Unrecognised no-restricted-syntax message: ${message}`);
  return match[1];
}

async function restrictedSyntaxTags(relativePath: string, code: string): Promise<BanTag[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(WEB_ROOT, relativePath) });
  const fatal = result?.messages.find((message) => message.fatal);
  if (fatal) throw new Error(`${relativePath} did not parse: ${fatal.message}`);
  const tags = (result?.messages ?? [])
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => tagOf(message.message));
  return [...new Set(tags)].sort();
}

const SINKS = `
import { discoverOAuthServerInfo } from '@modelcontextprotocol/client';
declare const client: { auth: { getSession(): Promise<unknown> } };
export const token = Math.random();
export const download = new Blob([''], { type: 'text/html' });
export const session = client.auth.getSession();
export const discovery = discoverOAuthServerInfo('https://example.com');
`;

const RAW_HTML_ATTRIBUTE = ['dangerously', 'Set', 'Inner', 'HTML'].join('');

const SINKS_WITH_JSX = `${SINKS}
export const Markup = () => <div ${RAW_HTML_ATTRIBUTE}={{ __html: '' }} />;
`;

function sinksFor(relativePath: string): string {
  return relativePath.endsWith('.tsx') ? SINKS_WITH_JSX : SINKS;
}

const SHARED: BanTag[] = ['blob-html', 'mcp-discovery-fetch'];

describe('apps/web no-restricted-syntax coverage', () => {
  it.each<[string, BanTag[]]>([
    ['lib/connectors/directory/auth-probe.ts', [...SHARED, 'math-random']],
    ['lib/e2b/session-store.ts', [...SHARED, 'math-random']],
    ['lib/secure-random.ts', SHARED],
    ['app/api/connectors/route.ts', [...SHARED, 'math-random']],
    ['app/api/connectors/page.tsx', [...SHARED, 'auth-get-session', 'math-random']],
    ['app/(app)/chat/page.tsx', [...SHARED, 'auth-get-session']],
    ['app/(app)/chat/layout.tsx', [...SHARED, 'auth-get-session']],
    ['app/(app)/chat/ChatShell.tsx', SHARED],
    ['components/chat/Card.tsx', [...SHARED, 'inner-html']],
    ['features/notebook/NotebookCellView.tsx', [...SHARED, 'inner-html']],
    ['features/chat/services/stream.tsx', [...SHARED, 'inner-html', 'math-random']],
    ['features/chat/hooks/useStream.tsx', [...SHARED, 'inner-html', 'math-random']],
    ['shared/utils/format.ts', SHARED],
    ['lib/__tests__/probe.test.ts', []],
    ['components/chat/__tests__/Card.test.tsx', []],
  ])(
    'applies every ban scoped to %s',
    async (relativePath, expected) => {
      await expect(restrictedSyntaxTags(relativePath, sinksFor(relativePath))).resolves.toEqual(
        [...expected].sort(),
      );
    },
    LINT_TIMEOUT_MS,
  );

  it.each([
    'lib/e2b/session-store.ts',
    'lib/support/handoff/resend-client.ts',
    'features/chat/components/cards/CalculationCard.tsx',
    'features/notebook/NotebookCellView.tsx',
  ])(
    'keeps %s free of restricted syntax and unused disable directives',
    async (relativePath) => {
      const [result] = await eslint.lintFiles([path.join(WEB_ROOT, relativePath)]);
      const findings = (result?.messages ?? [])
        .filter(
          (message) =>
            message.ruleId === 'no-restricted-syntax' ||
            (message.ruleId === null && message.message.includes('eslint-disable')),
        )
        .map((message) => `${message.line}: ${message.message}`);
      expect(findings).toEqual([]);
    },
    LINT_TIMEOUT_MS,
  );
});

const PROTECTED_RESOURCE_PREAMBLE = `
import { discoverOAuthProtectedResourceMetadata } from '@modelcontextprotocol/client';
declare const mcpOAuthFetch: typeof fetch;
declare const deps: { mcpOAuthFetch: typeof fetch };
declare function wrapFetch(fetchFn: typeof fetch): typeof fetch;
declare const useGuard: boolean;
const url = new URL('https://example.com');
`;

describe('MCP protected resource discovery must pass a fetch', () => {
  it.each([
    ['a bare identifier', 'mcpOAuthFetch'],
    ['a member expression', 'deps.mcpOAuthFetch'],
    ['an inline wrapper', '(input, init) => mcpOAuthFetch(input, init)'],
    ['a wrapper call', 'wrapFetch(mcpOAuthFetch)'],
    ['a conditional', 'useGuard ? mcpOAuthFetch : deps.mcpOAuthFetch'],
  ])(
    'accepts %s as the third argument',
    async (_label, fetchArgument) => {
      const code = `${PROTECTED_RESOURCE_PREAMBLE}
export const metadata = discoverOAuthProtectedResourceMetadata(url, undefined, ${fetchArgument});
`;
      await expect(restrictedSyntaxTags('lib/connectors/probe.ts', code)).resolves.not.toContain(
        'mcp-discovery-fetch',
      );
    },
    LINT_TIMEOUT_MS,
  );

  it.each([
    ['no third argument', 'url'],
    ['an undefined third argument', 'url, undefined, undefined'],
    ['a void third argument', 'url, undefined, void 0'],
  ])(
    'rejects %s',
    async (_label, args) => {
      const code = `${PROTECTED_RESOURCE_PREAMBLE}
export const metadata = discoverOAuthProtectedResourceMetadata(${args});
`;
      await expect(restrictedSyntaxTags('lib/connectors/probe.ts', code)).resolves.toContain(
        'mcp-discovery-fetch',
      );
    },
    LINT_TIMEOUT_MS,
  );
});
