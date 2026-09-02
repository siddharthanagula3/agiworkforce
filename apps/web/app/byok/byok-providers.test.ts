import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { modelsCatalogJson } from '@agiworkforce/types';
import { BYOK_PROVIDER_IDS, byokProviderLabels } from './byok-providers';

const catalogProviderIds = Object.keys(modelsCatalogJson.providers);

describe('/byok provider chips', () => {
  it('only advertises providers the canonical catalog still carries', () => {
    for (const id of BYOK_PROVIDER_IDS) {
      expect(
        catalogProviderIds,
        `${id} is advertised on /byok but is not in models.json`,
      ).toContain(id);
    }
  });

  it('names every chip with the catalog label rather than a hand-typed string', () => {
    const labels = byokProviderLabels();

    expect(labels).toHaveLength(BYOK_PROVIDER_IDS.length);
    for (const label of labels) {
      expect(Object.values(modelsCatalogJson.providers).map((p) => p.label)).toContain(label);
    }
  });

  it('keeps retired providers out of the rendered page source', () => {
    const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

    expect(source, '/byok must not advertise the retired Mistral provider').not.toMatch(/Mistral/i);
    expect(source, '/byok must not advertise the retired Groq provider').not.toMatch(/Groq/i);
  });

  it('keeps the retired Mistral lane out of the shared BYOK provider list', () => {
    const source = readFileSync(join(__dirname, '../../lib/byok-providers.ts'), 'utf8');

    expect(source).not.toMatch(/label: 'Mistral'/);
    expect(source).toMatch(/label: 'Perplexity'/);
  });
});
