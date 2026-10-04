import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DirectoryCard, type SettingsConnector } from '@agiworkforce/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { CONNECTOR_STATE_NEEDS_SETUP } from '@/features/directory/constants';
import { toCuratedConnectorEntry } from '@/features/directory/services/connectors-directory';
import { CONNECTOR_CAPABILITIES } from '@/lib/connectors/catalog';
import { MCP_ENDPOINTS } from '@/lib/connectors/mcp-endpoints';
import {
  CONNECTOR_OAUTH_PROVIDERS_ENV,
  CONNECTOR_OAUTH_REDIRECT_BASE_ENV,
  __resetConnectorOAuthRegistryCacheForTests,
  connectorOAuthCredentialEnvNames,
} from '@/lib/connectors/oauth-registry';
import { CONNECTOR_OAUTH_SCOPE_CEILINGS } from '@/lib/connectors/oauth-scope-allowlist';
import { describeConnectorSetup } from '@/lib/connectors/oauth-setup';

const PAGE = path.resolve(__dirname, '..', 'page.tsx');

const NEEDS_REGISTRATION = /including the ([^.]+?) ones, depend on an app registration/u;
const PROVIDER_SEPARATOR = /,\s*|\s+and\s+/u;
const ASKS_PROVIDER_TO_REVOKE = /asks the provider to revoke/iu;
const REVOCATION_CONDITION = /where the connector has a revocation endpoint configured/iu;

const CONNECTORS_SECTION = 'connectors';
const NO_CONNECTED_IDS: ReadonlySet<string> = new Set();
const DIRECTORY_CONNECTOR: SettingsConnector = {
  id: 'claims-fixture',
  name: 'Claims fixture',
  description: 'A connector the directory lists.',
  category: 'Productivity',
  authType: 'oauth2',
  actionCount: 1,
  phase: 1,
  iconBg: '',
  iconText: 'C',
};

function directoryCard(canConnect: boolean): Document {
  const markup = renderToStaticMarkup(
    createElement(DirectoryCard, {
      section: CONNECTORS_SECTION,
      entry: toCuratedConnectorEntry({ ...DIRECTORY_CONNECTOR, canConnect }, NO_CONNECTED_IDS),
      onOpen: () => undefined,
      onInstall: () => undefined,
    }),
  );
  return new DOMParser().parseFromString(markup, 'text/html');
}

function cardActionLabels(card: Document): string[] {
  return [...card.querySelectorAll('button[title]')].map(
    (button) => button.getAttribute('title') ?? '',
  );
}

function cardLines(card: Document): string[] {
  return [...card.querySelectorAll('p')].map((line) => line.textContent ?? '');
}

function publishedProse(): string {
  return readFileSync(PAGE, 'utf8')
    .replace(/&ldquo;|&rdquo;/gu, '"')
    .replace(/&rsquo;|\\u2019/gu, "'")
    .replace(/\s+/gu, ' ');
}

function providersNamedAsNeedingRegistration(): string[] {
  const named = publishedProse().match(NEEDS_REGISTRATION)?.[1] ?? '';
  return named
    .split(PROVIDER_SEPARATOR)
    .map((provider) => provider.trim())
    .filter(Boolean);
}

function connectorIdsOfProvider(provider: string): string[] {
  const needle = provider.toLowerCase();
  return Object.keys(CONNECTOR_CAPABILITIES).filter((id) => {
    if (id.includes(needle)) return true;
    const ceiling = CONNECTOR_OAUTH_SCOPE_CEILINGS[id];
    return (
      ceiling !== undefined &&
      typeof ceiling !== 'string' &&
      ceiling.some((scope) => scope.toLowerCase().includes(needle))
    );
  });
}

describe('/agent-permissions, connector claims', () => {
  it.each(['no such flow exists', 'only surface today', 'exactly three'])(
    'no longer says "%s"',
    (retired) => {
      expect(publishedProse().toLowerCase()).not.toContain(retired);
    },
  );

  it('quotes the action the directory card renders for a connectable connector', () => {
    const labels = cardActionLabels(directoryCard(true));

    expect(labels).toHaveLength(1);
    expect(publishedProse()).toContain(`shows "${labels[0]}"`);
  });

  it('quotes the state the directory card renders for a connector that needs setup', () => {
    const card = directoryCard(false);

    expect(cardActionLabels(card)).toEqual([]);
    expect(cardLines(card)).toContain(CONNECTOR_STATE_NEEDS_SETUP);
    expect(publishedProse()).toContain(`marks those "${CONNECTOR_STATE_NEEDS_SETUP}"`);
  });

  it('promises provider-side revocation only where a revocation endpoint is configured', () => {
    const promises = publishedProse()
      .split(/(?<=\.)\s+/u)
      .filter((sentence) => ASKS_PROVIDER_TO_REVOKE.test(sentence));

    expect(promises.length).toBeGreaterThan(0);
    for (const sentence of promises) {
      expect(sentence).toMatch(REVOCATION_CONDITION);
    }
  });
});

describe('/agent-permissions, connectors named as needing an app registration', () => {
  const providers = providersNamedAsNeedingRegistration();
  const connectorIds = providers.flatMap(connectorIdsOfProvider);
  const stubbedEnv = [
    CONNECTOR_OAUTH_PROVIDERS_ENV,
    ...connectorIds.flatMap((id) => {
      const names = connectorOAuthCredentialEnvNames(id);
      return [names.clientId, names.clientSecret];
    }),
  ];

  beforeEach(() => {
    for (const name of stubbedEnv) vi.stubEnv(name, '');
    vi.stubEnv(CONNECTOR_OAUTH_REDIRECT_BASE_ENV, 'https://app.example.com');
    __resetConnectorOAuthRegistryCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetConnectorOAuthRegistryCacheForTests();
  });

  it('names at least one provider, and each one resolves to catalog connectors', () => {
    expect(providers.length).toBeGreaterThan(0);
    for (const provider of providers) {
      expect(
        connectorIdsOfProvider(provider),
        `${provider} matches no catalog connector`,
      ).not.toEqual([]);
    }
  });

  it('names no connector that has a bundled MCP endpoint', () => {
    const bundled = connectorIds.filter((id) => id in MCP_ENDPOINTS);
    expect(bundled, `named as needing setup but bundled: ${bundled.join(', ')}`).toEqual([]);
  });

  it('names only connectors the setup decision holds back for a client pair', () => {
    const connectableWithoutRegistration = connectorIds.filter(
      (id) => describeConnectorSetup(id)?.kind !== 'oauth-client-pair',
    );
    expect(
      connectableWithoutRegistration,
      `named as needing setup but not gated on a client pair: ${connectableWithoutRegistration.join(', ')}`,
    ).toEqual([]);
  });
});
