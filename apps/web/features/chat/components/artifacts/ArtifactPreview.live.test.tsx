import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useLiveArtifactRuntime: vi.fn(),
  frameProps: [] as Array<Record<string, unknown>>,
  host: { handle: vi.fn() },
}));

vi.mock('@/app/chat/live-artifacts/useLiveArtifactRuntime', () => ({
  LIVE_MANUAL_REFRESH: 'manual',
  LIVE_STORAGE_UNAVAILABLE: 'storage',
  useLiveArtifactRuntime: mocks.useLiveArtifactRuntime,
}));
vi.mock('@/app/chat/live-artifacts/LiveArtifactControls', () => ({
  LiveArtifactControls: () => <div data-testid="live-controls" />,
}));
vi.mock('../SandboxedIframe', () => ({
  SandboxedIframe: (props: Record<string, unknown>) => {
    mocks.frameProps.push(props);
    return <div data-testid="sandboxed-frame" />;
  },
}));

import { ArtifactPreview, type ArtifactData } from './ArtifactPreview';

const HTML: ArtifactData = {
  id: 'artifact-live-1',
  type: 'html',
  title: 'Weekly growth',
  content: '<p>Signups</p>',
};

function runtime(host: unknown) {
  return {
    host,
    binding: null,
    asking: null,
    answer: vi.fn(),
    refreshKey: 3,
    refresh: vi.fn(),
    setRefreshPolicy: vi.fn(),
    stopLive: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.frameProps.length = 0;
});

describe('ArtifactPreview live runtime', () => {
  it('lets a managed-cloud HTML artifact in the panel reach AI and connected apps', async () => {
    mocks.useLiveArtifactRuntime.mockReturnValue(runtime(mocks.host));
    render(<ArtifactPreview artifact={HTML} variant="panel" liveRuntime />);

    await screen.findByTestId('sandboxed-frame');
    expect(mocks.useLiveArtifactRuntime).toHaveBeenCalledWith('artifact-live-1');
    expect(screen.getByTestId('live-controls')).toBeInTheDocument();
    const props = mocks.frameProps[mocks.frameProps.length - 1]!;
    expect(props['runtime']).toBe(mocks.host);
    expect(props['refreshKey']).toBe(3);
  });

  it('gives an artifact from a chat outside the managed cloud no runtime', async () => {
    mocks.useLiveArtifactRuntime.mockReturnValue(runtime(undefined));
    render(<ArtifactPreview artifact={HTML} variant="panel" />);

    await screen.findByTestId('sandboxed-frame');
    expect(mocks.useLiveArtifactRuntime).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId('live-controls')).toBeNull();
    expect(mocks.frameProps[mocks.frameProps.length - 1]!['runtime']).toBeUndefined();
  });

  it('gives an SVG no runtime even from a managed-cloud chat', () => {
    mocks.useLiveArtifactRuntime.mockReturnValue(runtime(undefined));
    render(
      <ArtifactPreview
        artifact={{ ...HTML, type: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg"/>' }}
        variant="panel"
        liveRuntime
      />,
    );
    expect(mocks.useLiveArtifactRuntime).toHaveBeenCalledWith(null);
  });
});
