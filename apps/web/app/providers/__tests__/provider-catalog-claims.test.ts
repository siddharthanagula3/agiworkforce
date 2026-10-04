import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ProviderGrid,
  type ProviderTile,
} from '@/features/marketing/components/system/ProviderGrid';

const appDir = join(__dirname, '..', '..');
const read = (relative: string) => readFileSync(join(appDir, relative), 'utf8');

describe('provider catalog claims', () => {
  it.each(['byok/page.tsx', 'providers/page.tsx'])(
    '%s makes no per-token price promise',
    (relative) => {
      const source = read(relative);
      expect(source).not.toMatch(/per[- ]million/i);
      expect(source).not.toContain('moving a price');
    },
  );

  it('prints no currency amount and labels billing on every tile', () => {
    const tiles: ProviderTile[] = [
      {
        id: 'cloud',
        label: 'Cloud',
        defaultModel: 'cloud-default',
        modelCount: 3,
        billing: 'Billed by provider',
        kind: 'cloud',
      },
      {
        id: 'gateway',
        label: 'Gateway',
        defaultModel: 'gateway-default',
        modelCount: 1,
        billing: 'Billed by provider',
        kind: 'gateway',
      },
      {
        id: 'local',
        label: 'Local',
        defaultModel: '',
        modelCount: 0,
        billing: 'No key, no meter',
        kind: 'local',
      },
    ];
    const { container } = render(createElement(ProviderGrid, { tiles, label: 'Providers' }));
    expect(container.textContent).not.toMatch(/[$€£]\s?\d/);
    expect(screen.getAllByText('Billed by provider')).toHaveLength(2);
    expect(screen.queryByText('Provider rates')).toBeNull();
  });

  it('integrations hero primary action opens the public connector directory', () => {
    const source = read('integrations/page.tsx');
    const primary = source.match(/\{ href: '([^']+)'[^}]*variant: 'primary'/);
    expect(primary?.[1]).toBe('/connectors/mcp-directory');
  });
});
