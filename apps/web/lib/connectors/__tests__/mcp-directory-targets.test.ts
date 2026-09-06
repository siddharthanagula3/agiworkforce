import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DirectoryRecord } from '@/lib/connectors/directory/types';
import { directoryRecordFixture, remoteRecordFixture } from './directory-record-fixture';

const mocks = vi.hoisted(() => ({
  records: [] as DirectoryRecord[],
  probe: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/connectors/directory/memory-cache', () => ({
  getSnapshotRecords: async () => mocks.records,
}));
vi.mock('@/lib/connectors/directory/auth-probe', () => ({
  resolveAuthModeForRecord: (...args: unknown[]) => mocks.probe(...args),
}));

import {
  DIRECTORY_SERVER_ID_PREFIX,
  directoryServerId,
  directoryTargetFor,
  findDirectoryTargetByRemoteUrl,
  isDirectoryServerId,
  normalizeRemoteUrl,
  resolveDirectoryConnectAuthMode,
  resolveDirectoryTarget,
} from '../mcp-directory-targets';

const OPEN_ID = 'ac.tandem/docs-mcp';
const OAUTH_ID = 'ch.cowork24/booking';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.records = [
    remoteRecordFixture(OPEN_ID, 'Tandem Docs MCP', 'https://tandem.ac/mcp', 'none'),
    remoteRecordFixture(OAUTH_ID, 'Cowork24', 'https://mcp.cowork24.ch/mcp', 'oauth', {
      documentationUrl: 'https://cowork24.ch/docs',
    }),
    remoteRecordFixture('notion', 'Notion', 'https://mcp.notion.com/mcp', 'oauth', {
      sourceRegistry: 'internal',
    }),
    directoryRecordFixture({
      id: 'io.github.someone/stdio-only',
      name: 'Stdio Only',
      remotes: [{ url: 'npx something', transport: 'stdio' }],
    }),
    remoteRecordFixture('com.example/bare-origin', 'Bare', 'https://mcp.example.com', 'unknown'),
  ];
});

describe('directoryServerId', () => {
  it('derives a stable, tool-name-safe server id from the record id', () => {
    const id = directoryServerId(OPEN_ID);
    expect(id).toMatch(new RegExp(`^${DIRECTORY_SERVER_ID_PREFIX}[0-9a-f]{12}$`));
    expect(directoryServerId(OPEN_ID)).toBe(id);
    expect(directoryServerId(OAUTH_ID)).not.toBe(id);
    expect(isDirectoryServerId(id)).toBe(true);
    expect(isDirectoryServerId(OPEN_ID)).toBe(false);
  });
});

describe('resolveDirectoryTarget', () => {
  it('resolves a record by its id and by its derived server id', async () => {
    const byId = await resolveDirectoryTarget(OPEN_ID);
    expect(byId).toMatchObject({
      connectorId: OPEN_ID,
      serverId: directoryServerId(OPEN_ID),
      mcpUrl: 'https://tandem.ac/mcp',
      transport: 'streamable-http',
      name: 'Tandem Docs MCP',
    });
    const byServerId = await resolveDirectoryTarget(directoryServerId(OPEN_ID));
    expect(byServerId?.connectorId).toBe(OPEN_ID);
  });

  it('never claims a curated connector id, even when the snapshot lists it', async () => {
    expect(await resolveDirectoryTarget('notion')).toBeNull();
    expect(directoryTargetFor(mocks.records[2]!)).toBeNull();
  });

  it('returns nothing for a record without a network remote', async () => {
    expect(await resolveDirectoryTarget('io.github.someone/stdio-only')).toBeNull();
    expect(await resolveDirectoryTarget('missing/record')).toBeNull();
    expect(await resolveDirectoryTarget('')).toBeNull();
  });

  it('carries the documentation link for the user-facing failure copy', async () => {
    expect((await resolveDirectoryTarget(OAUTH_ID))?.documentationUrl).toBe(
      'https://cowork24.ch/docs',
    );
  });
});

describe('findDirectoryTargetByRemoteUrl', () => {
  it('matches a stored connector url back to its directory record', async () => {
    expect((await findDirectoryTargetByRemoteUrl('https://tandem.ac/mcp'))?.connectorId).toBe(
      OPEN_ID,
    );
  });

  it('normalizes a bare origin the same way the custom connector store does', async () => {
    expect(normalizeRemoteUrl('https://mcp.example.com')).toBe('https://mcp.example.com/');
    expect((await findDirectoryTargetByRemoteUrl('https://mcp.example.com/'))?.connectorId).toBe(
      'com.example/bare-origin',
    );
    expect(await findDirectoryTargetByRemoteUrl('not a url')).toBeNull();
  });

  it('does not link a custom row to a curated connector by url', async () => {
    expect(await findDirectoryTargetByRemoteUrl('https://mcp.notion.com/mcp')).toBeNull();
  });
});

describe('resolveDirectoryConnectAuthMode', () => {
  it('returns the recorded auth mode without probing when it is known', async () => {
    const target = await resolveDirectoryTarget(OPEN_ID);
    expect(await resolveDirectoryConnectAuthMode(target!)).toBe('none');
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it('probes an unknown record before deciding how it connects', async () => {
    mocks.probe.mockImplementation(async (record: DirectoryRecord) => ({
      ...record,
      authMode: 'oauth',
    }));
    const target = await resolveDirectoryTarget('com.example/bare-origin');
    expect(await resolveDirectoryConnectAuthMode(target!)).toBe('oauth');
    expect(mocks.probe).toHaveBeenCalledWith(target!.record);
  });
});
