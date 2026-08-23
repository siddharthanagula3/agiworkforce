import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HostBridgeContext } from '../../lib/hostBridge';
import { getProviderSurface, PROVIDERS_IN_ORDER } from '@agiworkforce/types';
import {
  MessageGeneratedFiles,
  generatedFileFromEntry,
  generatedFileTrustBoundary,
  messageTrustBoundary,
} from '../MessageGeneratedFiles';
import { generatedFileFromLibraryItem } from '../library/LibraryView';
import type { GeneratedFileEntry } from '../../lib/types';

function requireProviderFixture(surface: 'local' | 'byok'): string {
  for (const provider of PROVIDERS_IN_ORDER) {
    if (getProviderSurface(provider) === surface) return provider;
  }
  throw new Error(`Canonical model registry is missing a ${surface} provider fixture`);
}

const LOCAL_PROVIDER = requireProviderFixture('local');
const BYOK_PROVIDER = requireProviderFixture('byok');

const entry: GeneratedFileEntry = {
  id: 'gf-private',
  fileName: 'salary-review.pdf',
  mimeType: 'application/pdf',
  uri: 'https://cloud.example/api/files/gf-private',
  byteCount: 2048,
  kind: 'pdf',
  checksumSha256: 'b'.repeat(64),
  previewable: true,
};

afterEach(cleanup);

describe('generated-file provenance follows the turn trust boundary', () => {
  it.each([
    ['byok', 'DirectByok'],
    ['local', 'Local'],
  ] as const)('labels a %s turn as %s rather than managed', (privacyMode, providerMode) => {
    const file = generatedFileFromEntry(
      entry,
      '2026-08-21T00:00:00.000Z',
      messageTrustBoundary({ privacyMode }),
    );
    expect(file.privacyMode).toBe(privacyMode);
    expect(file.providerMode).toBe(providerMode);
  });

  it('ignores a providerMode that contradicts the declared privacy mode', () => {
    expect(messageTrustBoundary({ privacyMode: 'byok', providerMode: 'ManagedGateway' })).toEqual({
      privacyMode: 'byok',
      providerMode: 'DirectByok',
    });
  });

  it('ignores unrecognized wire values instead of trusting them', () => {
    expect(messageTrustBoundary({ privacyMode: 'anything', providerMode: 'anything' })).toEqual({
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
    });
  });

  it('honors a declared providerMode on a turn that carries no privacyMode', () => {
    expect(messageTrustBoundary({ providerMode: 'Local' })).toEqual({
      privacyMode: 'local',
      providerMode: 'Local',
    });
    expect(messageTrustBoundary({ providerMode: 'DirectByok' })).toEqual({
      privacyMode: 'byok',
      providerMode: 'DirectByok',
    });
  });

  it('classifies an unlabeled turn from the model that served it', () => {
    expect(messageTrustBoundary(undefined, `${LOCAL_PROVIDER}/fixture-local-model`)).toEqual({
      privacyMode: 'local',
      providerMode: 'Local',
    });
    expect(messageTrustBoundary({ model: `${BYOK_PROVIDER}/fixture-byok-model` })).toEqual({
      privacyMode: 'byok',
      providerMode: 'DirectByok',
    });
  });

  it('keeps managed only for a turn with no boundary signal at all', () => {
    expect(generatedFileTrustBoundary({})).toEqual({
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
    });
  });

  it('labels a Library row by the provider that produced it', () => {
    const row = {
      id: 'lib-1',
      file_name: 'notes.html',
      mime_type: 'text/html',
      kind: 'html',
      byte_count: 12,
      uri: '/api/files/lib-1',
      surface: 'artifact' as const,
      previewable: true,
      origin: 'generated' as const,
      source_surface: 'web',
      provider: LOCAL_PROVIDER,
      model: `${LOCAL_PROVIDER}/fixture-local-model`,
      prompt: null,
      created_at: '2026-08-21T00:00:00.000Z',
    };
    expect(generatedFileFromLibraryItem(row)).toMatchObject({
      privacyMode: 'local',
      providerMode: 'Local',
    });
    expect(generatedFileFromLibraryItem({ ...row, provider: null, model: null })).toMatchObject({
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
    });
  });

  it('renders the BYOK provenance chip for a BYOK turn', () => {
    render(
      <HostBridgeContext.Provider value={null}>
        <MessageGeneratedFiles
          message={{
            generatedFiles: [entry],
            createdAt: '2026-08-21T00:00:00.000Z',
            metadata: { privacyMode: 'byok', providerMode: 'DirectByok' },
          }}
        />
      </HostBridgeContext.Provider>,
    );
    expect(screen.getAllByText(/BYOK/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Managed/i)).toBeNull();
  });
});
