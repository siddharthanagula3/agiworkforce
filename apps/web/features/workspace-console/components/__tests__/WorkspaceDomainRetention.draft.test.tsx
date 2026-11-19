import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { RETENTION_DOMAINS } from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({ useDomainRetention: vi.fn() }));

vi.mock('../../hooks/use-domain-retention', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useDomainRetention: mocks.useDomainRetention,
  useSaveDomainRetention: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

import { WorkspaceDomainRetention } from '../WorkspaceDomainRetention';

function bind(overrides: Record<string, number> = {}) {
  mocks.useDomainRetention.mockReturnValue({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: {
      organizationId: 'org',
      canManageRetention: true,
      policies: RETENTION_DOMAINS.map((domain) => ({
        domain,
        retentionDays: overrides[domain] ?? 365,
        enforced: false,
        updatedAt: null,
      })),
      sweeps: [],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WorkspaceDomainRetention draft lifecycle', () => {
  it('keeps a row’s unsaved days when a refresh lands, and updates rows with no edit', () => {
    const [edited, untouched] = RETENTION_DOMAINS;
    bind();
    const { rerender, container } = render(<WorkspaceDomainRetention />);
    const days = (index: number) =>
      container.querySelectorAll<HTMLInputElement>('input[type="number"]')[index]!;

    fireEvent.change(days(0), { target: { value: '30' } });

    bind({ [edited!]: 90, [untouched!]: 120 });
    rerender(<WorkspaceDomainRetention />);

    expect(days(0)).toHaveValue(30);
    expect(days(1)).toHaveValue(120);
  });
});

type ImportedModule0 = typeof import('../../hooks/use-domain-retention');
