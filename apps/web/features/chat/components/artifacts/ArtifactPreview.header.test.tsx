import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { toast } from 'sonner';
import type { ArtifactPickerSelection } from '@/lib/artifact-sandbox';
import { ArtifactPreview } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

type SonnerModule = typeof import('sonner');

vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<SonnerModule>()),
  toast: { error: vi.fn(), success: vi.fn() },
}));

const ARTIFACT_ID = 'artifact-header-1';
const SANDBOX = 'https://sandbox.agiworkforce.com';
const SELECTION: ArtifactPickerSelection = {
  selector: 'main > h1.title',
  text: 'Welcome',
  html: '<h1 class="title">Welcome</h1>',
  rect: { x: 10, y: 10, width: 100, height: 30 },
};

function seed(versions = 1) {
  const store = useArtifactsStore.getState();
  for (let version = 1; version <= versions; version += 1) {
    const input = {
      id: ARTIFACT_ID,
      type: 'html' as const,
      title: 'Landing page',
      language: 'html',
      content: `<main><h1 class="title">v${version}</h1></main>`,
      messageId: 'msg-1',
      conversationId: 'conv-1',
    };
    if (version === 1) store.addArtifact(input);
    else store.upsertArtifact(input);
  }
}

function renderPanel(onRequestEdits?: (prompt: string) => boolean) {
  const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
  return render(
    <ArtifactPreview
      artifact={artifact}
      variant="panel"
      onClose={vi.fn()}
      versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
      {...(onRequestEdits ? { onRequestEdits } : {})}
    />,
  );
}

function openMore() {
  fireEvent.click(screen.getByRole('button', { name: 'More artifact actions' }));
}

function reportFromSandbox(data: unknown, origin = SANDBOX) {
  const frame = document.querySelector('iframe');
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data, origin, source: frame?.contentWindow ?? null }),
    );
  });
}

beforeEach(() => {
  useArtifactsStore.getState().reset();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('artifact panel header', () => {
  it('keeps copy, expand, more and close in the bar and the rest in the More menu', () => {
    seed();
    renderPanel();

    expect(screen.getByRole('button', { name: 'Copy artifact' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close artifact viewer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh preview' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open in new tab' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download artifact' })).toBeNull();

    openMore();
    const menu = screen.getByRole('menu', { name: 'More artifact actions' });
    for (const name of [
      'Refresh preview',
      'Open in new tab',
      'Download as HTML',
      'Duplicate this artifact',
      'Save this artifact to your Library',
    ]) {
      expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
    }
  });

  it('does not wrap, so a narrow panel cannot push controls onto a second row', () => {
    seed();
    renderPanel();

    const bar = screen
      .getByRole('button', { name: 'More artifact actions' })
      .closest('.\\@container');

    expect(bar).not.toBeNull();
    expect(bar?.className).not.toContain('flex-wrap');
  });

  it('shows the title with a version stepper that moves between versions', () => {
    seed(2);
    renderPanel();

    expect(screen.getByText('Landing page')).toBeInTheDocument();
    expect(screen.getByTestId('artifact-version-history-toggle')).toHaveTextContent('v2/2');

    fireEvent.click(screen.getByRole('button', { name: 'Previous version' }));
    expect(screen.getByTestId('artifact-version-history-toggle')).toHaveTextContent('v1/2');

    openMore();
    expect(screen.getByRole('menuitem', { name: 'Restore version 1' })).toBeInTheDocument();
  });

  it('keeps Save and Cancel in the bar while a source edit is open', () => {
    seed();
    renderPanel();

    fireEvent.click(screen.getByLabelText('Source'));
    openMore();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit artifact source' }));

    expect(screen.getByTestId('artifact-save-source')).toBeInTheDocument();
    expect(screen.getByTestId('artifact-cancel-source-edit')).toBeInTheDocument();
  });
});

describe('request edits', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SANDBOX_ORIGIN', SANDBOX);
    seed();
  });

  it('is not offered when the host cannot send a chat turn', () => {
    renderPanel();

    expect(screen.queryByTestId('artifact-request-edits')).toBeNull();
    openMore();
    expect(screen.queryByTestId('artifact-request-edits-menu')).toBeNull();
  });

  it('is not offered without the sandboxed renderer, which is what picks elements', () => {
    vi.stubEnv('NEXT_PUBLIC_SANDBOX_ORIGIN', '');
    renderPanel(vi.fn(() => true));

    expect(screen.queryByTestId('artifact-request-edits')).toBeNull();
  });

  it('is not offered over source, or on an older version', () => {
    seed(2);
    renderPanel(vi.fn(() => true));
    expect(screen.getByTestId('artifact-request-edits')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous version' }));
    expect(screen.queryByTestId('artifact-request-edits')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next version' }));
    fireEvent.click(screen.getByLabelText('Source'));
    expect(screen.queryByTestId('artifact-request-edits')).toBeNull();
  });

  it('starts selection mode with the pill, and Cancel and Escape both leave it', () => {
    renderPanel(vi.fn(() => true));

    fireEvent.click(screen.getByTestId('artifact-request-edits'));
    expect(screen.getByTestId('artifact-edit-request-pill')).toHaveTextContent(
      'Select content and ask for changes',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('artifact-edit-request-layer')).toBeNull();

    fireEvent.click(screen.getByTestId('artifact-request-edits'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('artifact-edit-request-layer')).toBeNull();
  });

  it('sends a turn naming the artifact and the picked element, then leaves selection mode', () => {
    const onRequestEdits = vi.fn(() => true);
    renderPanel(onRequestEdits);

    fireEvent.click(screen.getByTestId('artifact-request-edits'));
    reportFromSandbox({ type: 'picker-selection', selection: SELECTION });
    fireEvent.change(screen.getByPlaceholderText('Describe the change...'), {
      target: { value: 'make the heading red' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send the change request' }));

    expect(onRequestEdits).toHaveBeenCalledOnce();
    const prompt = (onRequestEdits.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('Edit the artifact "Landing page"');
    expect(prompt).toContain('main > h1.title');
    expect(prompt).toContain('Requested change: make the heading red');
    expect(screen.queryByTestId('artifact-edit-request-layer')).toBeNull();
  });

  it('stays in selection mode and says so when the turn could not be sent', () => {
    renderPanel(vi.fn(() => false));

    fireEvent.click(screen.getByTestId('artifact-request-edits'));
    reportFromSandbox({ type: 'picker-selection', selection: SELECTION });
    fireEvent.change(screen.getByPlaceholderText('Describe the change...'), {
      target: { value: 'shrink it' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send the change request' }));

    expect(screen.getByTestId('artifact-edit-request-layer')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('The change request was not sent. Try again.');
  });

  it('ignores a selection forged from another origin', () => {
    renderPanel(vi.fn(() => true));

    fireEvent.click(screen.getByTestId('artifact-request-edits'));
    reportFromSandbox({ type: 'picker-selection', selection: SELECTION }, 'https://evil.example');

    expect(screen.queryByPlaceholderText('Describe the change...')).toBeNull();
  });

  it('is reachable from the More menu for a panel too narrow for the button', () => {
    renderPanel(vi.fn(() => true));

    openMore();
    fireEvent.click(screen.getByTestId('artifact-request-edits-menu'));

    expect(screen.getByTestId('artifact-edit-request-pill')).toBeInTheDocument();
  });
});
