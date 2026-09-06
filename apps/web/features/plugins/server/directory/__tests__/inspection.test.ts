import { describe, expect, it, vi } from 'vitest';

import {
  classifyPluginTree,
  EMPTY_COMPONENTS,
  fetchRepositoryTree,
  inspectionKey,
  inspectPluginSource,
  parseMcpServers,
  parsePluginMetadata,
  rawFileUrl,
  runtimeFitFor,
} from '../inspection';
import {
  RUNTIME_NOTE_COWORK_ONLY,
  RUNTIME_NOTE_HOOKS,
  RUNTIME_NOTE_LSP,
  RUNTIME_NOTE_NOT_INSPECTED,
  RUNTIME_NOTE_NO_SKILLS,
  RUNTIME_NOTE_SOURCE_UNKNOWN,
  RUNTIME_NOTE_STDIO_MCP,
} from '../constants';
import { LOCATION, SHA } from './fixtures';

const TREE = [
  { path: 'plugins/creative-cloud/adobe-for-creativity/.claude-plugin/plugin.json', type: 'blob' },
  {
    path: 'plugins/creative-cloud/adobe-for-creativity/skills/background-removal/SKILL.md',
    type: 'blob',
  },
  { path: 'plugins/creative-cloud/adobe-for-creativity/skills/vectorize/SKILL.md', type: 'blob' },
  {
    path: 'plugins/creative-cloud/adobe-for-creativity/skills/vectorize/reference.md',
    type: 'blob',
  },
  { path: 'plugins/creative-cloud/adobe-for-creativity/commands/retouch.md', type: 'blob' },
  { path: 'plugins/creative-cloud/adobe-for-creativity/agents/reviewer.md', type: 'blob' },
  { path: 'plugins/creative-cloud/adobe-for-creativity/skills', type: 'tree' },
  { path: 'plugins/other/skills/elsewhere/SKILL.md', type: 'blob' },
];

describe('classifyPluginTree', () => {
  it('counts skills, commands and agents under the plugin path only', () => {
    const classified = classifyPluginTree(TREE, LOCATION.path);
    expect(classified.components.skills).toEqual(['background-removal', 'vectorize']);
    expect(classified.components.skillPaths).toEqual([
      'skills/background-removal/SKILL.md',
      'skills/vectorize/SKILL.md',
    ]);
    expect(classified.components.commands).toBe(1);
    expect(classified.components.agents).toBe(1);
    expect(classified.components.hooks).toBe(false);
    expect(classified.hasMetadata).toBe(true);
    expect(classified.hasMcpFile).toBe(false);
  });

  it('adds declared skill directories that exist outside the skills folder', () => {
    const entries = [
      { path: 'custom/extra/SKILL.md', type: 'blob' },
      { path: 'hooks/hooks.json', type: 'blob' },
      { path: '.mcp.json', type: 'blob' },
    ];
    const classified = classifyPluginTree(entries, null, ['./custom/extra']);
    expect(classified.components.skills).toEqual(['extra']);
    expect(classified.components.hooks).toBe(true);
    expect(classified.hasMcpFile).toBe(true);
  });
});

describe('metadata parsers', () => {
  it('reads version, description, skills, hooks, mcp and lsp from plugin.json', () => {
    const metadata = parsePluginMetadata({
      version: ' 1.2.3 ',
      description: 'Desc',
      skills: ['./skills/a'],
      hooks: { PreToolUse: [] },
      mcpServers: { remote: { url: 'https://mcp.example.com' } },
      lspServers: { ts: {} },
    });
    expect(metadata).toEqual({
      version: '1.2.3',
      description: 'Desc',
      skills: ['./skills/a'],
      hooks: true,
      mcpServers: [{ name: 'remote', transport: 'http' }],
      lspServers: ['ts'],
    });
    expect(parsePluginMetadata(null).hooks).toBe(false);
  });

  it('classifies mcp transports from type, transport, command and url', () => {
    expect(
      parseMcpServers({
        mcpServers: {
          local: { command: 'npx', args: ['x'] },
          typed: { type: 'sse', url: 'https://x' },
          streamable: { type: 'http', url: 'https://x' },
          bare: {},
        },
      }),
    ).toEqual([
      { name: 'local', transport: 'stdio' },
      { name: 'typed', transport: 'sse' },
      { name: 'streamable', transport: 'http' },
      { name: 'bare', transport: 'unknown' },
    ]);
  });
});

describe('runtimeFitFor', () => {
  const skills = { ...EMPTY_COMPONENTS, skills: ['a'], skillPaths: ['skills/a/SKILL.md'] };
  const inspected = { inspected: true, coworkOnly: false, sourceKnown: true };

  it('marks a skills-only plugin web installable', () => {
    expect(runtimeFitFor(skills, inspected)).toMatchObject({ webInstallable: true, note: null });
  });

  it('names the blocking reason in one sentence', () => {
    expect(runtimeFitFor(skills, { ...inspected, coworkOnly: true }).note).toBe(
      RUNTIME_NOTE_COWORK_ONLY,
    );
    expect(runtimeFitFor(skills, { ...inspected, sourceKnown: false }).note).toBe(
      RUNTIME_NOTE_SOURCE_UNKNOWN,
    );
    expect(runtimeFitFor(skills, { ...inspected, inspected: false }).note).toBe(
      RUNTIME_NOTE_NOT_INSPECTED,
    );
    expect(runtimeFitFor({ ...skills, hooks: true }, inspected).note).toBe(RUNTIME_NOTE_HOOKS);
    expect(runtimeFitFor({ ...skills, lspServers: ['ts'] }, inspected).note).toBe(RUNTIME_NOTE_LSP);
    expect(
      runtimeFitFor({ ...skills, mcpServers: [{ name: 'x', transport: 'stdio' }] }, inspected).note,
    ).toBe(RUNTIME_NOTE_STDIO_MCP);
    expect(runtimeFitFor(EMPTY_COMPONENTS, inspected).note).toBe(RUNTIME_NOTE_NO_SKILLS);
  });

  it('accepts remote mcp servers', () => {
    expect(
      runtimeFitFor({ ...skills, mcpServers: [{ name: 'x', transport: 'http' }] }, inspected)
        .webInstallable,
    ).toBe(true);
  });
});

describe('github access', () => {
  it('builds raw urls at the pinned sha and keys inspections by repo, ref and path', () => {
    expect(rawFileUrl(LOCATION, 'skills/a/SKILL.md')).toBe(
      `https://raw.githubusercontent.com/adobe/skills/${SHA}/plugins/creative-cloud/adobe-for-creativity/skills/a/SKILL.md`,
    );
    expect(inspectionKey(LOCATION)).toBe(
      `https://github.com/adobe/skills@${SHA}#plugins/creative-cloud/adobe-for-creativity`,
    );
    expect(inspectionKey({ ...LOCATION, sha: null })).toBe(
      'https://github.com/adobe/skills@main#plugins/creative-cloud/adobe-for-creativity',
    );
  });

  it('reports rate limiting, missing refs and malformed trees', async () => {
    const limited = new Response('', {
      status: 403,
      headers: { 'x-ratelimit-remaining': '0' },
    });
    await expect(fetchRepositoryTree(LOCATION, async () => limited)).resolves.toEqual({
      status: 'rate-limited',
    });
    await expect(
      fetchRepositoryTree(LOCATION, async () => new Response('', { status: 404 })),
    ).resolves.toEqual({ status: 'missing' });
    await expect(
      fetchRepositoryTree(LOCATION, async () => new Response('', { status: 401 }), 'bad-token'),
    ).resolves.toEqual({ status: 'unauthorized' });
    await expect(
      fetchRepositoryTree(LOCATION, async () => new Response('', { status: 401 })),
    ).resolves.toMatchObject({ status: 'failed' });
    await expect(
      fetchRepositoryTree(LOCATION, async () => new Response('{}', { status: 200 })),
    ).resolves.toMatchObject({ status: 'failed' });
  });

  it('sends the token only when one is configured', async () => {
    const sentHeaders: Array<Record<string, string>> = [];
    const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => {
      sentHeaders.push((init?.headers ?? {}) as Record<string, string>);
      return Response.json({ sha: SHA, tree: TREE, truncated: false });
    });
    await fetchRepositoryTree(LOCATION, fetchImpl, 'secret-token');
    expect(sentHeaders[0]?.['Authorization']).toBe('Bearer secret-token');
    await fetchRepositoryTree(LOCATION, fetchImpl);
    expect(sentHeaders[1]?.['Authorization']).toBeUndefined();
  });
});

describe('inspectPluginSource', () => {
  it('combines the tree, plugin.json and .mcp.json into one record', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/git/trees/')) {
        return Response.json({
          sha: SHA,
          tree: [
            ...TREE,
            { path: 'plugins/creative-cloud/adobe-for-creativity/.mcp.json', type: 'blob' },
          ],
          truncated: false,
        });
      }
      if (url.endsWith('plugin.json')) {
        return Response.json({
          version: '2.0.0',
          description: 'From metadata',
          skills: ['skills/vectorize'],
        });
      }
      if (url.endsWith('.mcp.json')) {
        return Response.json({ mcpServers: { adobe: { url: 'https://mcp.adobe.com' } } });
      }
      return new Response('', { status: 404 });
    });
    const result = await inspectPluginSource(LOCATION, { fetchImpl, now: () => 0 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.record).toEqual({
      key: inspectionKey(LOCATION),
      treeSha: SHA,
      inspectedAt: '1970-01-01T00:00:00.000Z',
      version: '2.0.0',
      description: 'From metadata',
      components: {
        skills: ['background-removal', 'vectorize'],
        skillPaths: ['skills/background-removal/SKILL.md', 'skills/vectorize/SKILL.md'],
        commands: 1,
        agents: 1,
        hooks: false,
        mcpServers: [{ name: 'adobe', transport: 'http' }],
        lspServers: [],
      },
    });
  });

  it('reuses a provided tree without fetching it', async () => {
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: string) => {
      requested.push(input);
      return new Response('', { status: 404 });
    });
    const result = await inspectPluginSource(
      { ...LOCATION, sha: null },
      { fetchImpl, tree: { sha: SHA, entries: TREE, truncated: false } },
    );
    expect(result.status).toBe('ok');
    expect(requested.every((url) => !url.includes('/git/trees/'))).toBe(true);
    if (result.status === 'ok') expect(result.record.treeSha).toBe(SHA);
  });
});
