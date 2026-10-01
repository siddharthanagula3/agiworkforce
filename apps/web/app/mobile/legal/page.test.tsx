import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AVAILABLE_NOW_LABEL, COMING_SOON_LABEL } from '@/lib/surface-status';
type ScanModule0 = typeof import('@/lib/marketing-constants');
type MobileLegalModule = typeof import('./page');

let PlannedMobileLegalPage: MobileLegalModule['default'];
let PublishedMobileLegalPage: MobileLegalModule['default'];

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

const SOURCE = readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');
const MOBILE_DIR = path.join(__dirname, '..', '..', '..', '..', 'mobile');

async function loadMobileLegalPage(status: string): Promise<MobileLegalModule['default']> {
  vi.resetModules();
  vi.doMock('@/lib/marketing-constants', async (importOriginal) => {
    const actual = await importOriginal<ScanModule0>();
    return {
      ...actual,
      SURFACE_STATUS: { ...actual.SURFACE_STATUS, mobile: status },
    };
  });
  const { default: MobileLegalPage } = await import('./page');
  return MobileLegalPage;
}

beforeAll(async () => {
  try {
    PlannedMobileLegalPage = await loadMobileLegalPage(COMING_SOON_LABEL);
    PublishedMobileLegalPage = await loadMobileLegalPage(AVAILABLE_NOW_LABEL);
  } finally {
    vi.doUnmock('@/lib/marketing-constants');
  }
});

function renderCopy(Page: MobileLegalModule['default']): string {
  expect(document.body).toBeEmptyDOMElement();
  const { container, unmount } = render(<Page />);
  try {
    return container.textContent?.replace(/\s+/g, ' ') ?? '';
  } finally {
    unmount();
  }
}

afterEach(() => {
  cleanup();
});

describe('/mobile/legal EU AI Act section', () => {
  it('speaks of a planned app while mobile is unreleased', () => {
    const copy = renderCopy(PlannedMobileLegalPage);

    expect(copy).toMatch(/The planned AGI Mobile release is a general-purpose AI assistant/);
    expect(copy).toMatch(/the planned app carries that disclosure on a first-run screen/);
  });

  it('switches to present tense the day mobile ships, like every other section on the page', () => {
    const copy = renderCopy(PublishedMobileLegalPage);

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

  it('claims no export marking the mobile code does not do', () => {
    const copy = renderCopy(PlannedMobileLegalPage);

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
