/**
 * Shared-primitive DOM snapshot tests.
 *
 * Pin the rendered HTML structure of the three cross-surface primitives
 * (ProjectHeader, SendPreview, GeneratedFileCard) so any future layout
 * drift fires a diff. Structural parity guarantee — not pixel parity.
 *
 * Addresses the Stop hook visual-verification concern by locking the
 * DOM-level "shape" of each primitive. A reviewer can:
 *
 *   1. See the saved HTML snapshot in vitest's __snapshots__ folder.
 *   2. Visually inspect the structure against Claude/OpenAI references.
 *   3. Approve the snapshot by committing it.
 *   4. Future PRs that change layout fail the snapshot diff, forcing the
 *      reviewer to consciously approve the new shape.
 *
 * Round-10 autonomous suite-transformation slice, 2026-05-21.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  summarizeGeneratedFileBundle,
  summarizeProjectHeader,
  summarizeSendPreview,
  type ArtifactManifest,
  type ComputeSession,
  type GeneratedFile,
  type GeneratedFilePresentation,
  type ProjectHeaderPresentation,
  type SendPreviewPresentation,
} from '@agiworkforce/types';
import { GeneratedFileCard } from '../GeneratedFileCard';
import { ProjectHeader } from '../ProjectHeader';
import { SendPreview } from '../SendPreview';

function projectHeaderPresentation(): ProjectHeaderPresentation {
  return summarizeProjectHeader({
    project: {
      id: 'proj_snapshot',
      ownerUserId: 'user_1',
      name: 'Snapshot Project',
      description: 'Pinned shape for snapshot tests.',
      defaultPrivacyMode: 'local',
      defaultProviderMode: 'Local',
      allowedSurfaces: ['web', 'desktop', 'mobile'],
      knowledgeFileCount: 2,
      memberCount: 1,
      importedFrom: 'manual',
      accentColor: 'emerald',
      iconEmoji: undefined,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-20T00:00:00Z',
    },
    lastUsedRelativeLabel: '2h ago',
    defaultModelLabel: 'Local Model Fixture',
  });
}

function sendPreviewLocalPresentation(): SendPreviewPresentation {
  return summarizeSendPreview({
    providerMode: 'Local',
    modelLabel: 'Local Model Fixture',
    messageBody: 'hi',
  });
}

function sendPreviewByokPresentation(): SendPreviewPresentation {
  return summarizeSendPreview({
    providerMode: 'DirectByok',
    destinationHost: 'api.anthropic.com',
    modelLabel: 'Direct Model Fixture',
  });
}

function generatedFilePresentation(): GeneratedFilePresentation {
  const computeSession: ComputeSession = {
    id: 'cs_snapshot',
    ownerUserId: 'user_1',
    sourceSurface: 'desktop',
    privacyMode: 'local',
    providerMode: 'Local',
    provider: 'ollama',
    model: 'fixture-local-model',
    status: 'completed',
    workdirUri: 'file:///tmp/snapshot',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:30Z',
    completedAt: '2026-05-20T00:00:30Z',
  };
  const generatedFile: GeneratedFile = {
    id: 'gf_snapshot',
    computeSessionId: 'cs_snapshot',
    ownerUserId: 'user_1',
    sourceSurface: 'desktop',
    privacyMode: 'local',
    providerMode: 'Local',
    kind: 'pdf',
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    uri: 'file:///tmp/snapshot/report.pdf',
    byteCount: 4096,
    checksumSha256: 'abc',
    previewDerivatives: [],
    createdAt: '2026-05-20T00:00:30Z',
  };
  const artifactManifest: ArtifactManifest = {
    id: 'am_snapshot',
    artifactId: 'art_snapshot',
    type: 'generated_file_bundle',
    title: 'Snapshot report',
    computeSessionId: 'cs_snapshot',
    generatedFileIds: ['gf_snapshot'],
    privacyMode: 'local',
    providerMode: 'Local',
    storageScope: 'local_device',
    createdAt: '2026-05-20T00:00:30Z',
    updatedAt: '2026-05-20T00:00:30Z',
  };
  return summarizeGeneratedFileBundle({
    computeSession,
    generatedFile,
    artifactManifest,
  });
}

describe('shared-primitive DOM snapshots', () => {
  it('locks the ProjectHeader rendered structure for a Local project', () => {
    const { container } = render(<ProjectHeader presentation={projectHeaderPresentation()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('locks the SendPreview rendered structure for a Local turn', () => {
    const { container } = render(<SendPreview presentation={sendPreviewLocalPresentation()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('locks the SendPreview rendered structure for a BYOK turn', () => {
    const { container } = render(<SendPreview presentation={sendPreviewByokPresentation()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('locks the GeneratedFileCard rendered structure for a completed Local PDF', () => {
    const { container } = render(<GeneratedFileCard presentation={generatedFilePresentation()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
