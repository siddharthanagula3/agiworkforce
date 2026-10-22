import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_NAMES } from '@agiworkforce/types';

import type { ThirdPartyNotices } from './notices';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

const loadThirdPartyNotices = vi.hoisted(() => vi.fn<() => ThirdPartyNotices | null>());
vi.mock('./load-notices', () => ({
  GENERATED_NOTICES_FILE: 'public/legal/third-party-notices.json',
  NOTICES_URL: '/legal/third-party-notices.json',
  loadThirdPartyNotices,
}));

import OpenSourceLicensesPage from './page';

const NOTICES: ThirdPartyNotices = {
  texts: { mit: 'MIT License\n\nPermission is hereby granted.' },
  packages: [
    {
      ecosystem: 'npm',
      name: 'left-pad',
      version: '1.3.0',
      license: 'MIT',
      url: 'https://github.com/left-pad/left-pad',
      copyright: ['Copyright (c) 2018 Left Pad'],
      textIds: ['mit'],
      sources: ['web', 'desktop'],
    },
    {
      ecosystem: 'cargo',
      name: 'itoa',
      version: '1.0.0',
      license: 'MIT OR Apache-2.0',
      url: null,
      copyright: [],
      textIds: [],
      sources: ['cli'],
    },
  ],
};

function open(details: Element) {
  (details as HTMLDetailsElement).open = true;
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 503, json: async () => body } as Response;
}

describe('OpenSourceLicensesPage', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    loadThirdPartyNotices.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('renders only license summaries until a group is opened', () => {
    loadThirdPartyNotices.mockReturnValue(NOTICES);
    const { container } = render(<OpenSourceLicensesPage />);

    expect(
      screen.getByText(
        `Third-party notices for the 2 open source packages bundled in ${PRODUCT_NAMES.chat}, ${PRODUCT_NAMES.desktop}, ${PRODUCT_NAMES.cli}, generated from their dependency manifests.`,
      ),
    ).toBeInTheDocument();
    const groups = [...container.querySelectorAll('#packages details')];
    expect(groups.map((group) => group.querySelector('summary')?.textContent)).toEqual([
      'Apache-2.0 OR MIT1 package',
      'MIT1 package',
    ]);
    const texts = container.querySelectorAll('#license-texts details');
    expect(texts).toHaveLength(1);
    expect(texts[0]).toHaveAttribute('id', 'license-text-1');
    expect(texts[0]!.querySelector('summary')?.textContent).toBe('Text 1. MIT License1 package');
    expect(container.querySelector('pre')).toBeNull();
    expect(screen.queryByText('left-pad 1.3.0')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the notices once when a group opens and links each package to its text', async () => {
    loadThirdPartyNotices.mockReturnValue(NOTICES);
    fetchMock.mockResolvedValue(jsonResponse(NOTICES));
    const { container } = render(<OpenSourceLicensesPage />);

    const mitGroup = container.querySelectorAll('#packages details')[1]!;
    open(mitGroup);
    const leftPad = await within(mitGroup as HTMLElement).findByRole('link', {
      name: 'left-pad 1.3.0',
    });
    expect(leftPad).toHaveAttribute('href', 'https://github.com/left-pad/left-pad');
    expect(
      within(mitGroup as HTMLElement).getByText('Copyright (c) 2018 Left Pad'),
    ).toBeInTheDocument();
    expect(within(mitGroup as HTMLElement).getByRole('link', { name: 'Text 1' })).toHaveAttribute(
      'href',
      '#license-text-1',
    );

    const text = container.querySelector('#license-text-1')!;
    open(text);
    await waitFor(() => expect(text.querySelector('pre')?.textContent).toBe(NOTICES.texts['mit']));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/legal/third-party-notices.json');
  });

  it('offers a retry when the notices fail to load', async () => {
    loadThirdPartyNotices.mockReturnValue(NOTICES);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(null, false))
      .mockResolvedValueOnce(jsonResponse(NOTICES));
    const { container } = render(<OpenSourceLicensesPage />);

    const mitGroup = container.querySelectorAll('#packages details')[1]! as HTMLElement;
    open(mitGroup);
    expect(
      await within(mitGroup).findByText('The notices could not be loaded.'),
    ).toBeInTheDocument();
    fireEvent.click(within(mitGroup).getByRole('button', { name: 'Try again' }));
    expect(
      await within(mitGroup).findByRole('link', { name: 'left-pad 1.3.0' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('explains in development that notices come from the build when none were generated', () => {
    loadThirdPartyNotices.mockReturnValue(null);
    render(<OpenSourceLicensesPage />);
    expect(screen.getByText(/Notices are generated at build time\./)).toBeInTheDocument();
  });

  it('fails a production render rather than publish a page without notices', () => {
    vi.stubEnv('NODE_ENV', 'production');
    loadThirdPartyNotices.mockReturnValue(null);
    expect(() => render(<OpenSourceLicensesPage />)).toThrow(/is missing/);
  });
});
