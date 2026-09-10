import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockCapabilities } = vi.hoisted(() => ({ mockCapabilities: vi.fn() }));

vi.mock('../hooks/use-capabilities-preferences', () => ({
  useCapabilitiesPreferences: () => mockCapabilities(),
}));

vi.mock('@/features/settings/components/MemoryExclusions', () => ({
  MemoryExclusions: () => null,
}));

vi.mock('@/features/settings/components/ImportMemoryDialog', () => ({
  ImportMemoryDialog: () => null,
  useImportMemoryDialog: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

vi.mock('@agiworkforce/unified-chat', () => ({
  MemoryEditor: () => null,
  useMemoryStore: (selector: (state: unknown) => unknown) =>
    selector({ memories: [], clear: vi.fn(), hydrateFromServer: vi.fn() }),
  selectMemoryCount: () => 0,
}));

import { MemorySection } from './MemorySection';

const TOGGLES = [
  'Persistent memory',
  'Generate from past chats',
  'Search past chats',
  'Allow memory generation from tool-assisted chats',
];

function capabilities(organizationMemoryAllowed: boolean) {
  return {
    settings: {
      memory: true,
      generateFromHistory: true,
      allowToolAssistedGeneration: false,
      searchPastChats: true,
      cloudCodeExecution: true,
    },
    organizationMemoryAllowed,
    saving: false,
    saveError: null,
    savedAt: null,
    loadError: null,
    retry: vi.fn(),
    retrySave: null,
    setBoolean: vi.fn(),
  };
}

describe('MemorySection under a workspace policy', () => {
  beforeEach(() => mockCapabilities.mockReset());

  it('says the workspace turned memory off and names where it changes', () => {
    mockCapabilities.mockReturnValue(capabilities(false));
    render(<MemorySection />);

    expect(screen.getByText(/workspace has memory turned off/i)).toBeInTheDocument();
    expect(screen.getByText(/Workspace → Policy/)).toBeInTheDocument();
  });

  it('disables every memory toggle while the workspace gate is closed', () => {
    mockCapabilities.mockReturnValue(capabilities(false));
    render(<MemorySection />);

    for (const label of TOGGLES) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
  });

  it('leaves the toggles usable when the workspace allows memory', () => {
    mockCapabilities.mockReturnValue(capabilities(true));
    render(<MemorySection />);

    expect(screen.queryByText(/workspace has memory turned off/i)).toBeNull();
    for (const label of TOGGLES) {
      expect(screen.getByLabelText(label)).toBeEnabled();
    }
  });
});
