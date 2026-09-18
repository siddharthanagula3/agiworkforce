import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  CONNECTOR_HEALTH_STATES,
  CONNECTOR_SURFACES,
  CONNECTOR_POLICY_PATH,
  ConnectorHttpError,
  ConnectorPolicyError,
  connectorEndpoints,
  createConnectorRuntime,
  evaluateConnectorAccess,
  type ConnectorHttpClient,
  type ConnectorSurface,
} from '../index';

const CONNECTORS_PATH = '/api/connectors';
const OAUTH_START_PATH = '/api/connectors/oauth/start';
const ENDPOINTS = connectorEndpoints({
  connectors: CONNECTORS_PATH,
  oauthStart: OAUTH_START_PATH,
});

const BLOCKED = 'slack';
const PERMITTED = 'github';

interface Call {
  method: string;
  path: string;
}

/**
 * One workspace row, served to every surface: nothing below re-states the
 * block, each client reaches it through the same runtime.
 */
function server(calls: Call[]): ConnectorHttpClient {
  const policyBody = {
    organizationId: 'org_1',
    configured: true,
    policy: {
      allowedConnectors: [],
      blockedConnectors: [BLOCKED],
      allowCustomConnectors: false,
      allowedPlugins: [],
      blockedPlugins: ['payroll-pack'],
      allowedMcpHosts: ['mcp.example.com'],
      updatedAt: '2026-09-17T00:00:00.000Z',
    },
  };
  const listBody = {
    connectors: [
      {
        id: 'row_1',
        connectorId: PERMITTED,
        authType: 'oauth',
        connectedAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        source: 'oauth',
      },
    ],
    available: [PERMITTED, BLOCKED],
  };
  const record = (method: string, path: string) => calls.push({ method, path });
  return {
    async get(path) {
      record('GET', path);
      if (path === ENDPOINTS.policy) return policyBody;
      if (path === CONNECTORS_PATH) return listBody;
      if (path.startsWith(OAUTH_START_PATH)) {
        return { connectorId: BLOCKED, authorizeUrl: 'https://slack.com/oauth' };
      }
      throw new ConnectorHttpError(404, `unexpected GET ${path}`);
    },
    async post(path) {
      record('POST', path);
      return { connector: { id: 'x', shortId: 'x', name: 'x', url: 'https://x' } };
    },
    async put(path) {
      record('PUT', path);
      return {};
    },
    async delete(path) {
      record('DELETE', path);
      return {};
    },
  };
}

function runtimeFor(surface: ConnectorSurface, calls: Call[], local?: boolean) {
  const localConnect = vi.fn(async () => {});
  const runtime = createConnectorRuntime({
    surface,
    http: server(calls),
    endpoints: ENDPOINTS,
    ...(local
      ? {
          local: {
            list: async () => [PERMITTED, BLOCKED],
            connect: localConnect,
            disconnect: async () => {},
          },
        }
      : {}),
  });
  return { runtime, localConnect };
}

const SURFACES: ReadonlyArray<{ surface: ConnectorSurface; local: boolean }> = [
  { surface: 'web', local: false },
  { surface: 'mobile', local: false },
  { surface: 'desktop', local: true },
  { surface: 'cli', local: false },
];

describe('an org block reaches every surface', () => {
  for (const { surface, local } of SURFACES) {
    it(`${surface}: refuses the blocked connector before any credential is exchanged`, async () => {
      const calls: Call[] = [];
      const { runtime, localConnect } = runtimeFor(surface, calls, local);

      await expect(runtime.connect(BLOCKED)).rejects.toBeInstanceOf(ConnectorPolicyError);
      await expect(runtime.startOAuth(BLOCKED)).rejects.toBeInstanceOf(ConnectorPolicyError);

      expect(localConnect).not.toHaveBeenCalled();
      expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
      expect(calls.some((call) => call.path.startsWith(OAUTH_START_PATH))).toBe(false);
      expect(calls.some((call) => call.path === ENDPOINTS.policy)).toBe(true);
    });

    it(`${surface}: reports the same refusal code and reason`, async () => {
      const calls: Call[] = [];
      const { runtime } = runtimeFor(surface, calls, local);
      const decision = await runtime.checkConnector(BLOCKED);
      expect(decision).toEqual({
        allowed: false,
        code: 'connector_blocked',
        reason: `Your workspace administrator has blocked the "${BLOCKED}" connector.`,
      });
    });

    it(`${surface}: still permits a connector the policy does not name`, async () => {
      const calls: Call[] = [];
      const { runtime, localConnect } = runtimeFor(surface, calls, local);
      await expect(runtime.connect(PERMITTED)).resolves.toEqual({ kind: 'connected' });
      if (local) {
        expect(localConnect).toHaveBeenCalledWith(PERMITTED, 'oauth');
      } else {
        expect(calls).toContainEqual({ method: 'POST', path: CONNECTORS_PATH });
      }
    });

    it(`${surface}: marks the blocked connector in the directory it renders`, async () => {
      const calls: Call[] = [];
      const { runtime } = runtimeFor(surface, calls, local);
      const directory = await runtime.loadDirectory();
      const blocked = directory.entries.find((entry) => entry.connectorId === BLOCKED);
      const permitted = directory.entries.find((entry) => entry.connectorId === PERMITTED);
      expect(blocked?.access.allowed).toBe(false);
      expect(blocked?.access.code).toBe('connector_blocked');
      expect(permitted?.access.allowed).toBe(true);
      expect(permitted?.connection?.health).toBe('connected');
    });

    it(`${surface}: refuses a blocked plugin and an off-allowlist MCP host`, async () => {
      const calls: Call[] = [];
      const { runtime } = runtimeFor(surface, calls, local);
      await expect(runtime.checkPlugin('payroll-pack')).resolves.toMatchObject({
        allowed: false,
        code: 'plugin_blocked',
      });
      await expect(runtime.checkMcpHost('https://elsewhere.example/mcp')).resolves.toMatchObject({
        allowed: false,
        code: 'mcp_host_not_allowed',
      });
      await expect(runtime.checkMcpHost('https://mcp.example.com/sse')).resolves.toMatchObject({
        allowed: true,
      });
    });

    it(`${surface}: refuses a custom connector when the workspace disallows them`, async () => {
      const calls: Call[] = [];
      const { runtime } = runtimeFor(surface, calls, local);
      await expect(
        runtime.addCustomConnector({ name: 'internal', url: 'https://mcp.example.com/sse' }),
      ).rejects.toBeInstanceOf(ConnectorPolicyError);
      expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
    });
  }

  it('an unreadable policy endpoint leaves every surface working', async () => {
    const runtime = createConnectorRuntime({
      surface: 'web',
      endpoints: ENDPOINTS,
      http: {
        async get(path) {
          if (path === ENDPOINTS.policy) throw new ConnectorHttpError(500, 'policy unavailable');
          if (path === CONNECTORS_PATH) return { connectors: [], available: [BLOCKED] };
          throw new ConnectorHttpError(404, path);
        },
        async post() {
          return {};
        },
        async put() {
          return {};
        },
        async delete() {
          return {};
        },
      },
    });
    await expect(runtime.connect(BLOCKED)).resolves.toEqual({ kind: 'connected' });
  });

  it('hands an install-flow connector back as install-required when the server names the path', async () => {
    const runtime = createConnectorRuntime({
      surface: 'mobile',
      endpoints: ENDPOINTS,
      http: {
        async get() {
          return {};
        },
        async post() {
          throw Object.assign(new ConnectorHttpError(409, 'install required'), {
            body: { installStartPath: '/api/github/install/start' },
          });
        },
        async put() {
          return {};
        },
        async delete() {
          return {};
        },
      },
    });
    await expect(runtime.connect(PERMITTED)).resolves.toEqual({
      kind: 'install-required',
      connectorId: PERMITTED,
      installUrl: '/api/github/install/start',
    });
  });

  it('the policy is read once per window, not once per question', async () => {
    const calls: Call[] = [];
    const { runtime } = runtimeFor('web', calls, false);
    await Promise.all([
      runtime.checkConnector(BLOCKED),
      runtime.checkConnector(PERMITTED),
      runtime.checkPlugin('payroll-pack'),
    ]);
    expect(calls.filter((call) => call.path === ENDPOINTS.policy)).toHaveLength(1);
  });
});

describe('the connector contract every surface compiles against', () => {
  const contract = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../connectors/connector-contract.json', import.meta.url)),
      'utf8',
    ),
  ) as {
    surfaces: string[];
    accessCodes: string[];
    healthStates: string[];
    policyPath: string;
    policyPrecedence: string[];
  };

  it('names the same surfaces and health states the runtime does', () => {
    expect(contract.surfaces).toEqual([...CONNECTOR_SURFACES]);
    expect(contract.healthStates).toEqual([...CONNECTOR_HEALTH_STATES]);
    expect(contract.policyPath).toBe(CONNECTOR_POLICY_PATH);
  });

  it('names every refusal code the evaluator can produce', () => {
    const produced = new Set<string>();
    produced.add(evaluateConnectorAccess(null, { connectorId: 'x' }).code);
    produced.add(
      evaluateConnectorAccess(
        { allowedConnectors: [], blockedConnectors: [], allowCustomConnectors: true },
        { connectorId: 'x' },
      ).code,
    );
    produced.add(
      evaluateConnectorAccess(
        { allowedConnectors: [], blockedConnectors: ['x'], allowCustomConnectors: true },
        { connectorId: 'x' },
      ).code,
    );
    produced.add(
      evaluateConnectorAccess(
        { allowedConnectors: ['y'], blockedConnectors: [], allowCustomConnectors: true },
        { connectorId: 'x' },
      ).code,
    );
    produced.add(
      evaluateConnectorAccess(
        { allowedConnectors: [], blockedConnectors: [], allowCustomConnectors: false },
        { connectorId: 'x', isCustom: true },
      ).code,
    );
    produced.add(
      evaluateConnectorAccess(
        {
          allowedConnectors: [],
          blockedConnectors: [],
          allowCustomConnectors: true,
          allowedMcpHosts: ['a.example'],
        },
        { connectorId: 'x', isCustom: true, url: 'https://b.example/sse' },
      ).code,
    );
    for (const code of produced) expect(contract.accessCodes).toContain(code);
    expect(contract.policyPrecedence.every((code) => contract.accessCodes.includes(code))).toBe(
      true,
    );
  });
});
