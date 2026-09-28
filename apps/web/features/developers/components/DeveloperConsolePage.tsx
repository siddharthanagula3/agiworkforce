'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@agiworkforce/ui';

import { ApiKeysManager } from '@features/settings/components/Settings/ApiKeys';
import type { DeveloperRateLimit } from '../types';
import { RateLimitsPanel } from './RateLimitsPanel';
import { RequestPlayground } from './RequestPlayground';

const REFERENCE_LINKS = [
  {
    href: '/api-docs',
    label: 'API docs',
    description: 'Credentials, scopes and a first request',
  },
  {
    href: '/api-docs#migrating',
    label: 'Migration guides',
    description: 'From the OpenAI or Anthropic API, and between models',
  },
  {
    href: '/api-docs#deprecations',
    label: 'Deprecations',
    description: 'Models scheduled to leave, with their dates',
  },
  {
    href: '/models',
    label: 'Models',
    description: 'Every model your plan can call, with its capabilities and context',
  },
  {
    href: '/settings/usage',
    label: 'Usage',
    description: 'Credits used this period by chats and API calls',
  },
] as const;

const OPENAPI_BUNDLE_PATH = '/openapi.json';

const LINK_CLASS =
  'flex flex-col gap-0.5 rounded-md px-2 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11';

export function DeveloperConsolePage({
  rateLimits,
}: {
  rateLimits: readonly DeveloperRateLimit[];
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-h2 text-foreground">Developer console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keys, limits and a place to try requests against the OpenAI-compatible gateway.
        </p>
      </header>
      <div className="mt-6 flex flex-col gap-6">
        <ApiKeysManager />
        <RequestPlayground />
        <RateLimitsPanel rateLimits={rateLimits} />
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Reference</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {REFERENCE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={LINK_CLASS}>
                    <span className="text-sm font-medium text-foreground">{link.label}</span>
                    <span className="text-xs text-muted-foreground">{link.description}</span>
                  </Link>
                </li>
              ))}
              <li>
                <a href={OPENAPI_BUNDLE_PATH} className={LINK_CLASS}>
                  <span className="text-sm font-medium text-foreground">OpenAPI bundle</span>
                  <span className="text-xs text-muted-foreground">
                    Every endpoint and the credential it takes
                  </span>
                </a>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
