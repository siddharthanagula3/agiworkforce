import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ArtifactPreview, type ArtifactData } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';
import type { ArtifactCodeEditorProps } from './ArtifactCodeEditor';
import type { ArtifactDocumentEditorProps } from './ArtifactDocumentEditor';

// These fixtures exercise the real Preview and reactive store. Editor and Markdown
// boundaries are models, not proof of Tiptap, CodeMirror, or browser event ordering.
const boundaries = vi.hoisted(() => ({
  source: null as ((text: string) => void) | null,
  document: null as ((text: string) => void) | null,
  toggle: null as ((index: number) => void) | null,
}));

vi.mock('./ArtifactCodeEditor', () => ({
  ArtifactCodeEditor: ({ value, onChange }: ArtifactCodeEditorProps) => {
    boundaries.source = onChange;
    return (
      <textarea
        aria-label="Modeled source editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  },
}));

vi.mock('./ArtifactDocumentEditor', () => ({
  ArtifactDocumentEditor: ({ value, onChange }: ArtifactDocumentEditorProps) => {
    boundaries.document = onChange;
    return (
      <textarea
        aria-label="Modeled document editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  },
}));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/unified-chat')>();
  return {
    ...actual,
    MarkdownContent: ({
      content,
      onTaskToggle,
    }: {
      content: string;
      onTaskToggle?: (index: number) => void;
    }) => {
      boundaries.toggle = onTaskToggle ?? null;
      return <div data-testid="modeled-markdown">{content}</div>;
    },
  };
});

const A = 'draft-retention-a';
const B = 'draft-retention-b';
const key = (id = A) => `agi.artifact-draft:${id}`;
const stored = (id = A) => useArtifactsStore.getState().artifacts.find((a) => a.id === id)!;
const versions = (id = A) => useArtifactsStore.getState().getArtifactVersions(id);

function seed(id = A, fields: Partial<ArtifactData> = {}) {
  useArtifactsStore.getState().addArtifact({
    id,
    type: 'code',
    title: id,
    language: 'text',
    content: 'original',
    messageId: `message-${id}`,
    conversationId: `conversation-${id}`,
    ...fields,
  });
}

function ReactivePanel({ id = A }: { id?: string }) {
  const [open, setOpen] = useState(true);
  const artifact = useArtifactsStore((s) => s.artifacts.find((a) => a.id === id));
  const getVersions = useArtifactsStore((s) => s.getArtifactVersions);
  return open && artifact ? (
    <ArtifactPreview
      artifact={artifact}
      variant="panel"
      versionHistory={getVersions(id)}
      onClose={() => setOpen(false)}
    />
  ) : null;
}

function openMore() {
  fireEvent.click(screen.getByRole('button', { name: 'More artifact actions' }));
}

async function editSource() {
  act(() => useArtifactsStore.getState().openArtifactForEditing(A));
  return screen.findByLabelText('Modeled source editor');
}

function change(editor: HTMLElement, value: string) {
  fireEvent.change(editor, { target: { value } });
}

function advanceAfterUnmount() {
  act(() => vi.advanceTimersByTime(5000));
}

beforeEach(() => {
  localStorage.clear();
  useArtifactsStore.getState().reset();
  boundaries.source = null;
  boundaries.document = null;
  boundaries.toggle = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ items: [], comments: [] })),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ArtifactPreview recovery ownership', () => {
  it.each(['unmount', 'close'] as const)(
    'keeps the exact latest text before immediate %s, without a canonical save',
    async (exit) => {
      seed();
      const panel = render(<ReactivePanel />);
      const editor = await editSource();
      vi.useFakeTimers();
      change(editor, 'older draft');
      expect(localStorage.getItem(key())).toBe('older draft');
      change(editor, 'newest draft\nincluding trailing whitespace  ');
      if (exit === 'close') fireEvent.click(screen.getByLabelText('Close artifact viewer'));
      else panel.unmount();
      expect(localStorage.getItem(key())).toBe('newest draft\nincluding trailing whitespace  ');
      advanceAfterUnmount();
      expect(versions()).toHaveLength(1);
      expect(stored().content).toBe('original');
      panel.unmount();
      vi.useRealTimers();
      render(<ReactivePanel />);
      expect(await screen.findByLabelText('Modeled source editor')).toHaveValue(
        'newest draft\nincluding trailing whitespace  ',
      );
    },
  );

  it('keeps A separate from B across an unkeyed panel switch and rejects A callbacks', async () => {
    seed();
    seed(B, { content: 'B original' });
    const panel = render(<ReactivePanel />);
    change(await editSource(), 'A newest');
    const stale = boundaries.source!;
    panel.rerender(<ReactivePanel id={B} />);
    act(() => stale('A stale callback'));
    expect(localStorage.getItem(key())).toBe('A newest');
    expect(localStorage.getItem(key(B))).toBeNull();
    expect(stored(B).content).toBe('B original');
    expect(versions()).toHaveLength(1);
    panel.rerender(<ReactivePanel />);
    expect(await screen.findByLabelText('Modeled source editor')).toHaveValue('A newest');
  });

  it('invalidates callbacks after a reactive external version replacement without mutating canonical content on cleanup', async () => {
    seed();
    const panel = render(<ReactivePanel />);
    change(await editSource(), 'pending edit');
    const stale = boundaries.source!;
    act(() =>
      useArtifactsStore.getState().upsertArtifact({ ...stored(), content: 'external revision' }),
    );
    act(() => stale('stale revision callback'));
    expect(localStorage.getItem(key())).toBe('pending edit');
    panel.unmount();
    expect(stored().content).toBe('external revision');
    expect(versions().map((v) => v.content)).toEqual(['original', 'external revision']);
  });

  it.each(['save', 'cancel'] as const)(
    '%s ends the session without resurrection from stale callbacks or timers',
    async (action) => {
      seed();
      const panel = render(<ReactivePanel />);
      change(await editSource(), 'edited');
      const stale = boundaries.source!;
      vi.useFakeTimers();
      fireEvent.click(
        screen.getByTestId(
          action === 'save' ? 'artifact-save-source' : 'artifact-cancel-source-edit',
        ),
      );
      act(() => stale('late editor event'));
      panel.unmount();
      advanceAfterUnmount();
      expect(localStorage.getItem(key())).toBeNull();
      expect(stored().content).toBe(action === 'save' ? 'edited' : 'original');
      expect(versions()).toHaveLength(action === 'save' ? 2 : 1);
    },
  );

  it.each([false, true])(
    'Restore confirmation=%s retains the existing history discard warning and recovery semantics',
    async (confirm) => {
      seed();
      useArtifactsStore.getState().upsertArtifact({ ...stored(), content: 'second version' });
      const panel = render(<ReactivePanel />);
      change(await editSource(), 'unsaved work');
      fireEvent.click(screen.getByLabelText('Previous version'));
      openMore();
      fireEvent.click(screen.getByTestId('artifact-restore-version'));
      expect(screen.getByRole('alertdialog')).toHaveTextContent(/unsaved edits are discarded/i);
      fireEvent.click(
        screen.getByRole('button', { name: confirm ? 'Restore' : 'Cancel', exact: true }),
      );
      vi.useFakeTimers();
      panel.unmount();
      advanceAfterUnmount();
      expect(localStorage.getItem(key())).toBe(confirm ? null : 'unsaved work');
      expect(stored().content).toBe(confirm ? 'original' : 'second version');
      expect(versions()).toHaveLength(confirm ? 3 : 2);
    },
  );

  it.each([null, 'recovered text'])(
    'mount, edit entry, and restoration do not rewrite recovery storage (%s)',
    async (recovered) => {
      seed();
      if (recovered !== null) localStorage.setItem(key(), recovered);
      const writes = vi.spyOn(Storage.prototype, 'setItem');
      const panel = render(
        <StrictMode>
          <ReactivePanel />
        </StrictMode>,
      );
      if (recovered === null) await editSource();
      else expect(await screen.findByLabelText('Modeled source editor')).toHaveValue(recovered);
      vi.useFakeTimers();
      advanceAfterUnmount();
      panel.unmount();
      expect(writes.mock.calls.filter(([name]) => name.startsWith('agi.artifact-draft:'))).toEqual(
        [],
      );
      expect(versions()).toHaveLength(1);
    },
  );

  it('does not overwrite a newer foreign recovery value when the old owner closes', async () => {
    seed();
    const panel = render(<ReactivePanel />);
    change(await editSource(), 'old owner edit');
    localStorage.setItem(key(), 'foreign newer recovery');
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    vi.useFakeTimers();
    panel.unmount();
    advanceAfterUnmount();
    expect(localStorage.getItem(key())).toBe('foreign newer recovery');
    expect(writes.mock.calls.filter(([name]) => name.startsWith('agi.artifact-draft:'))).toEqual(
      [],
    );
  });

  it('rejects old callbacks when canonical text changes with the same version count', async () => {
    seed();
    const panel = render(<ReactivePanel />);
    change(await editSource(), 'pending edit');
    const stale = boundaries.source!;
    act(() => {
      useArtifactsStore.getState().removeArtifact(A);
      seed(A, { content: 'replacement with one version' });
    });
    expect(versions()).toHaveLength(1);
    act(() => stale('stale same-count callback'));
    panel.unmount();
    expect(localStorage.getItem(key())).toBe('pending edit');
    expect(stored().content).toBe('replacement with one version');
  });

  it('preserves newer failed-write text and status through history navigation', async () => {
    seed();
    useArtifactsStore.getState().upsertArtifact({ ...stored(), content: 'second version' });
    render(<ReactivePanel />);
    const editor = await editSource();
    change(editor, 'retained older text');
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      name,
      value,
    ) {
      if (name === key()) throw new DOMException('Full', 'QuotaExceededError');
      setItem.call(this, name, value);
    });
    change(editor, 'newest text not retained');
    fireEvent.click(screen.getByLabelText('Previous version'));
    fireEvent.click(screen.getByLabelText('Next version'));
    expect(await screen.findByLabelText('Modeled source editor')).toHaveValue(
      'newest text not retained',
    );
    expect(screen.getByText('Draft not kept')).toBeInTheDocument();
    expect(localStorage.getItem(key())).toBe('retained older text');
    expect(stored().content).toBe('second version');
  });

  it('reports a failed latest write instead of claiming the earlier retained text is current', async () => {
    seed();
    render(<ReactivePanel />);
    const editor = await editSource();
    change(editor, 'retained older text');
    expect(screen.getByText('Draft kept on this device')).toBeInTheDocument();
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      name,
      value,
    ) {
      if (name === key()) throw new DOMException('Full', 'QuotaExceededError');
      setItem.call(this, name, value);
    });
    change(editor, 'latest text that failed');
    expect(screen.getByText('Draft not kept')).toBeInTheDocument();
    expect(screen.queryByText('Draft kept on this device')).not.toBeInTheDocument();
    expect(localStorage.getItem(key())).toBe('retained older text');
  });

  it('persists the modeled rich-document editor callback before unmount', async () => {
    seed(A, { type: 'document', language: 'markdown', content: '# Notes' });
    const panel = render(<ReactivePanel />);
    fireEvent.click(screen.getByTestId('artifact-edit-document'));
    change(await screen.findByLabelText('Modeled document editor'), '# Notes\n\nNewest paragraph');
    panel.unmount();
    expect(localStorage.getItem(key())).toBe('# Notes\n\nNewest paragraph');
    expect(versions()).toHaveLength(1);
  });

  it('retains Markdown source edits through the same source boundary', async () => {
    seed(A, { type: 'document', language: 'markdown', content: '# Notes\n\n$x$' });
    const panel = render(<ReactivePanel />);
    change(await editSource(), '# Notes\n\n$x+y$');
    panel.unmount();
    expect(localStorage.getItem(key())).toBe('# Notes\n\n$x+y$');
    expect(versions()).toHaveLength(1);
  });

  it('combines rapid checklist callbacks in StrictMode and commits only after the separate four-second pause', () => {
    seed(A, { type: 'document', language: 'markdown', content: '- [ ] first\n- [ ] second' });
    vi.useFakeTimers();
    const panel = render(
      <StrictMode>
        <ReactivePanel />
      </StrictMode>,
    );
    const toggle = boundaries.toggle!;
    expect(toggle).toBeTypeOf('function');
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    act(() => {
      toggle(0);
      toggle(1);
    });
    const latest = '- [x] first\n- [x] second';
    expect(localStorage.getItem(key())).toBe(latest);
    expect(writes.mock.calls.filter(([name]) => name === key())).toHaveLength(2);
    expect(versions()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(3999));
    expect(versions()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(versions().map((v) => v.content)).toEqual(['- [ ] first\n- [ ] second', latest]);
    expect(localStorage.getItem(key())).toBeNull();
    panel.unmount();
    advanceAfterUnmount();
    expect(versions()).toHaveLength(2);
    expect(localStorage.getItem(key())).toBeNull();
  });

  it('keeps rapid checklist changes on immediate close without running the canonical commit', () => {
    seed(A, { type: 'document', language: 'markdown', content: '- [ ] first\n- [ ] second' });
    vi.useFakeTimers();
    render(<ReactivePanel />);
    const toggle = boundaries.toggle!;
    act(() => {
      toggle(0);
      toggle(1);
    });
    fireEvent.click(screen.getByLabelText('Close artifact viewer'));
    advanceAfterUnmount();
    expect(localStorage.getItem(key())).toBe('- [x] first\n- [x] second');
    expect(versions()).toHaveLength(1);
  });
});
