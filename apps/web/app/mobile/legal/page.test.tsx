import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AVAILABLE_NOW_LABEL, COMING_SOON_LABEL } from '@/lib/surface-status';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

const SOURCE = readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');
const MOBILE_DIR = path.join(__dirname, '..', '..', '..', '..', 'mobile');

async function renderWithMobileStatus(status: string): Promise<string> {
  vi.resetModules();
  vi.doMock('@/lib/marketing-constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/marketing-constants')>();
    return {
      ...actual,
      SURFACE_STATUS: { ...actual.SURFACE_STATUS, mobile: status },
    };
  });
  const { default: MobileLegalPage } = await import('./page');
  render(<MobileLegalPage />);
  return document.body.textContent?.replace(/\s+/g, ' ') ?? '';
}

afterEach(() => {
  cleanup();
  vi.doUnmock('@/lib/marketing-constants');
});

describe('/mobile/legal EU AI Act section', () => {
  it('speaks of a planned app while mobile is unreleased', async () => {
    const copy = await renderWithMobileStatus(COMING_SOON_LABEL);

    expect(copy).toMatch(/The planned AGI Mobile release is a general-purpose AI assistant/);
    expect(copy).toMatch(/the planned app carries that disclosure on a first-run screen/);
  });

  it('switches to present tense the day mobile ships, like every other section on the page', async () => {
    const copy = await renderWithMobileStatus(AVAILABLE_NOW_LABEL);

    expect(copy).toMatch(/AGI Mobile is a general-purpose AI assistant/);
    expect(copy).not.toMatch(/The planned AGI Mobile release is a general-purpose AI assistant/);
    expect(copy).toMatch(/the app carries that disclosure on a first-run screen/);
  });

  it('reads the release flag in the AI Act section rather than in its siblings alone', () => {
    const section = /EU AI Act disclosures\.<\/h3>([\s\S]*?)<\/Stack>/.exec(SOURCE)?.[1];

    expect(
      section,
      'the EU AI Act section moved and this assertion no longer reads it',
    ).toBeTruthy();
    expect(section).toContain('MOBILE_UNRELEASED');
  });

  it('claims no export marking the mobile code does not do', async () => {
    const copy = await renderWithMobileStatus(COMING_SOON_LABEL);

    expect(copy).not.toMatch(/human-readable disclosure block/);
    expect(copy).toMatch(
      /on-device data export marks each chat transcript with a machine-readable/,
    );
    expect(copy).toMatch(/PDF, text, Markdown and copy-to-clipboard routes carry no marker/);

    const dataExport = readFileSync(path.join(MOBILE_DIR, 'services/dsarExport.ts'), 'utf8');
    const conversationExport = readFileSync(
      path.join(MOBILE_DIR, 'services/fileCreation.ts'),
      'utf8',
    );

    expect(dataExport).toContain('wrapTextExportWithMarker');
    expect(conversationExport).not.toContain('agi:ai-generated');
    expect(conversationExport).not.toContain('wrapTextExportWithMarker');
  });
});
