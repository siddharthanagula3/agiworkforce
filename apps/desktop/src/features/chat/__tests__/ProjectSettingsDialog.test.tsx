import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: false as boolean,
  prefersReducedMotion: false as boolean,
}));

vi.mock('../../../lib/tauri-mock', () => ({
  invoke: host.invoke,
  get isTauri() {
    return host.isTauri;
  },
}));

vi.mock('@agiworkforce/unified-chat', () => ({
  useReducedMotion: () => host.prefersReducedMotion,
}));

import { useAppModeStore } from '../../../stores/appModeStore';
import { useChatStore } from '../../../stores/chat/chatStore';
import type { Project } from '../../../stores/projectStore';
import { ProjectSettingsDialog } from '../ProjectSettingsDialog';

const EDIT_PROJECT: Project = {
  id: 'project-1',
  name: 'Native project',
  description: 'A project used to exercise the edit dialog.',
  customInstructions: '',
  files: [],
  conversationIds: [],
  isArchived: false,
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
};

describe('ProjectSettingsDialog host-aware rendering', () => {
  beforeEach(() => {
    host.isTauri = false;
    host.prefersReducedMotion = false;
    useAppModeStore.setState({ mode: 'local' });
    useChatStore.setState({ conversations: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each(
    [
      {
        host: 'Tauri',
        isTauri: true,
        prefersReducedMotion: false,
        animationDisabled: true,
      },
      {
        host: 'non-Tauri',
        isTauri: false,
        prefersReducedMotion: false,
        animationDisabled: false,
      },
      {
        host: 'reduced-motion',
        isTauri: false,
        prefersReducedMotion: true,
        animationDisabled: true,
      },
    ].flatMap((hostCase) => [
      {
        ...hostCase,
        mode: 'create' as const,
        project: undefined,
        title: 'Create a project',
      },
      {
        ...hostCase,
        mode: 'edit' as const,
        project: EDIT_PROJECT,
        title: 'Edit Project',
      },
    ]),
  )(
    '$host renders the $mode branch with the correct motion policy and dismisses on Escape',
    async ({ isTauri, prefersReducedMotion, animationDisabled, mode, project, title }) => {
      host.isTauri = isTauri;
      host.prefersReducedMotion = prefersReducedMotion;
      const onOpenChange = vi.fn();

      render(
        <ProjectSettingsDialog open mode={mode} project={project} onOpenChange={onOpenChange} />,
      );

      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
      const dialog = screen.getByRole('dialog');
      const overlay = dialog.previousElementSibling as HTMLElement | null;

      expect(overlay).not.toBeNull();
      if (animationDisabled) {
        expect(dialog.className).not.toContain('animate-in');
        expect(overlay?.className).not.toContain('animate-in');
      } else {
        expect(dialog.className).toContain('animate-in');
        expect(overlay?.className).toContain('animate-in');
      }

      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    },
  );
});

describe('ProjectSettingsDialog memory scoping', () => {
  beforeEach(() => {
    host.isTauri = true;
    host.prefersReducedMotion = false;
    useAppModeStore.setState({ mode: 'local' });
    useChatStore.setState({ conversations: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('offers no project-scoped memory tab, because memories are not project-scoped', () => {
    render(
      <ProjectSettingsDialog open mode="edit" project={EDIT_PROJECT} onOpenChange={vi.fn()} />,
    );

    expect(screen.queryByRole('tab', { name: /memory/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /memory manager/i })).toBeNull();
  });

  it('tells the user memories are device-wide rather than per project', async () => {
    render(
      <ProjectSettingsDialog open mode="edit" project={EDIT_PROJECT} onOpenChange={vi.fn()} />,
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: /instructions/i }));

    const scopeNote = await screen.findByText(/saved for this device, not for this project/i);
    expect(scopeNote).toBeInTheDocument();
    expect(scopeNote.textContent).toMatch(/memories from outside chats/i);
  });
});

describe('ProjectSettingsDialog knowledge-base ingestion', () => {
  beforeEach(() => {
    host.isTauri = true;
    host.prefersReducedMotion = false;
    useAppModeStore.setState({ mode: 'local' });
    useChatStore.setState({ conversations: [] });
    host.invoke.mockResolvedValue('extracted text');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  async function dropKnowledgeFile(fileName: string, mimeType: string) {
    render(
      <ProjectSettingsDialog open mode="edit" project={EDIT_PROJECT} onOpenChange={vi.fn()} />,
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: /knowledge/i }));

    const dropHint = await screen.findByText(/drag & drop files here/i);
    const dropZone = dropHint.parentElement as HTMLElement;

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [new File(['ignored'], fileName, { type: mimeType })] },
    });
  }

  it.each([
    { fileName: 'handbook.pdf', mimeType: 'application/pdf' },
    {
      fileName: 'handbook.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
  ])('extracts $fileName through the document extractor, not file_read', async (fileCase) => {
    await dropKnowledgeFile(fileCase.fileName, fileCase.mimeType);

    await waitFor(() =>
      expect(host.invoke).toHaveBeenCalledWith('document_extract_text', {
        filePath: fileCase.fileName,
      }),
    );
    expect(host.invoke).not.toHaveBeenCalledWith('file_read', expect.anything());
  });

  it('still reads plain text files with file_read', async () => {
    await dropKnowledgeFile('notes.txt', 'text/plain');

    await waitFor(() =>
      expect(host.invoke).toHaveBeenCalledWith('file_read', { path: 'notes.txt' }),
    );
    expect(host.invoke).not.toHaveBeenCalledWith('document_extract_text', expect.anything());
  });

  it('advertises only formats the extractor can actually read', async () => {
    render(
      <ProjectSettingsDialog open mode="edit" project={EDIT_PROJECT} onOpenChange={vi.fn()} />,
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: /knowledge/i }));

    const supported = await screen.findByText(/Supported: \.txt/);
    expect(supported.textContent).toContain('.pdf');
    expect(supported.textContent).toContain('.docx');
  });
});
