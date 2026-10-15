import { AlertCircle, Check, Circle, Edit2, FileText, Plus, Save, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, isTauriContext } from '../../lib/tauri-mock';
import { useProjectStore } from '../../stores/projectStore';
import { Button } from '@/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/Dialog';
import { Spinner } from '@/ui/Spinner';
import { Textarea } from '@/ui/Textarea';

export const GLOBAL_INSTRUCTIONS_FILE = '~/.agiworkforce/INSTRUCTIONS.md';
export const PROJECT_INSTRUCTION_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.agi/instructions.md',
] as const;
const UNREAD_INSTRUCTION_FILES =
  'GEMINI.md, .cursorrules, .windsurfrules and .github/copilot-instructions.md';

interface InstructionFile {
  key: string;
  label: string;
  location: string;
  exists: () => Promise<boolean>;
  read: () => Promise<string>;
  write: (content: string) => Promise<void>;
}

interface FileStatus {
  found: boolean;
  checking: boolean;
}

interface EditState {
  file: InstructionFile;
  content: string;
  saving: boolean;
  error: string | null;
}

function joinFolderPath(folder: string, relative: string): string {
  const separator = folder.includes('\\') ? '\\' : '/';
  const trimmed = folder.replace(/[\\/]+$/, '');
  return `${trimmed}${separator}${relative.split('/').join(separator)}`;
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' && error ? error : fallback;
}

const GLOBAL_FILE: InstructionFile = {
  key: GLOBAL_INSTRUCTIONS_FILE,
  label: GLOBAL_INSTRUCTIONS_FILE,
  location: GLOBAL_INSTRUCTIONS_FILE,
  exists: async () => (await invoke<string>('dotfile_read_instructions')).trim() !== '',
  read: () => invoke<string>('dotfile_read_instructions'),
  write: (content) => invoke<void>('dotfile_write_instructions', { content }),
};

function projectFile(folder: string, name: string): InstructionFile {
  const path = joinFolderPath(folder, name);
  return {
    key: path,
    label: name,
    location: path,
    exists: () => invoke<boolean>('file_exists', { path }),
    read: () => invoke<string>('file_read', { path }),
    write: (content) => invoke<void>('file_write', { path, content }),
  };
}

interface InstructionFileRowsProps {
  files: InstructionFile[];
  statuses: Record<string, FileStatus>;
  disabled: boolean;
  onOpen: (file: InstructionFile, found: boolean) => void;
}

function InstructionFileRows({ files, statuses, disabled, onOpen }: InstructionFileRowsProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
      {files.map((file) => {
        const status = statuses[file.key];
        const checking = status?.checking ?? !disabled;
        const found = status?.found ?? false;
        return (
          <div
            key={file.key}
            className="px-4 py-3 grid grid-cols-[1fr_auto_auto] gap-4 items-center hover:bg-card transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-mono truncate">{file.label}</span>
            </div>

            <span className="flex items-center gap-1 text-xs whitespace-nowrap">
              {checking ? (
                <Spinner size="sm" />
              ) : found ? (
                <>
                  <Check className="h-3.5 w-3.5 text-success-text" />
                  <span className="text-success-text">Found</span>
                </>
              ) : (
                <>
                  <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Not found</span>
                </>
              )}
            </span>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onOpen(file, found)}
              disabled={checking || disabled}
            >
              {found ? (
                <>
                  <Edit2 className="h-3.5 w-3.5 mr-1" />
                  View / Edit
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create
                </>
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function InstructionFilesSettings() {
  const projectFolder = useProjectStore((state) => state.currentFolder);
  const projectFiles = useMemo(
    () =>
      projectFolder
        ? PROJECT_INSTRUCTION_FILES.map((name) => projectFile(projectFolder, name))
        : [],
    [projectFolder],
  );
  const [statuses, setStatuses] = useState<Record<string, FileStatus>>({});
  const [editState, setEditState] = useState<EditState | null>(null);
  const isNonTauri = !isTauriContext();

  useEffect(() => {
    if (isNonTauri) return;
    let current = true;
    const files = [GLOBAL_FILE, ...projectFiles];
    setStatuses(
      Object.fromEntries(files.map((file) => [file.key, { found: false, checking: true }])),
    );
    void Promise.all(
      files.map(async (file) => {
        const found = await file.exists().catch(() => false);
        return [file.key, { found, checking: false }] as const;
      }),
    ).then((entries) => {
      if (current) setStatuses(Object.fromEntries(entries));
    });
    return () => {
      current = false;
    };
  }, [isNonTauri, projectFiles]);

  const handleOpen = useCallback(async (file: InstructionFile, found: boolean) => {
    if (!found) {
      setEditState({ file, content: '', saving: false, error: null });
      return;
    }
    try {
      const content = await file.read();
      setEditState({ file, content, saving: false, error: null });
    } catch (error) {
      setEditState({
        file,
        content: '',
        saving: false,
        error: errorText(error, 'Failed to read file'),
      });
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!editState) return;
    const { file, content } = editState;
    setEditState({ ...editState, saving: true, error: null });
    try {
      await file.write(content);
      setStatuses((previous) => ({
        ...previous,
        [file.key]: {
          found: file === GLOBAL_FILE ? content.trim() !== '' : true,
          checking: false,
        },
      }));
      setEditState(null);
    } catch (error) {
      setEditState({
        file,
        content,
        saving: false,
        error: errorText(error, 'Failed to save file'),
      });
    }
  }, [editState]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-h3 mb-1">Instruction Files</h3>
        <p className="text-sm text-muted-foreground">
          The files the agent reads before it answers a chat on this device. Edits here reach the
          next message.
        </p>
      </div>

      {isNonTauri && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card rounded-md p-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          File detection requires the desktop app. Shown for preview only.
        </div>
      )}

      <section className="space-y-2" aria-labelledby="instruction-files-all-chats">
        <h4 id="instruction-files-all-chats" className="text-sm font-medium">
          All chats
        </h4>
        <InstructionFileRows
          files={[GLOBAL_FILE]}
          statuses={statuses}
          disabled={isNonTauri}
          onOpen={(file, found) => void handleOpen(file, found)}
        />
        <p className="text-xs text-muted-foreground">
          Applies to every local chat and to the CLI. A project&apos;s own instruction files and
          your custom instructions take precedence over it.
        </p>
      </section>

      <section className="space-y-2" aria-labelledby="instruction-files-project">
        <h4 id="instruction-files-project" className="text-sm font-medium">
          This project
        </h4>
        {projectFolder ? (
          <>
            <InstructionFileRows
              files={projectFiles}
              statuses={statuses}
              disabled={isNonTauri}
              onOpen={(file, found) => void handleOpen(file, found)}
            />
            <p className="text-xs text-muted-foreground">
              Read from <code className="rounded bg-muted px-1 py-0.5">{projectFolder}</code> in the
              order shown, and from each parent folder up to the repository root. The nearest folder
              wins.
            </p>
          </>
        ) : (
          <p className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
            Open a project folder to manage the instruction files the agent reads there:{' '}
            {PROJECT_INSTRUCTION_FILES.join(', ')}.
          </p>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        {UNREAD_INSTRUCTION_FILES} are not read. Move their content into one of the files above.
      </p>

      <Dialog
        open={editState !== null}
        onOpenChange={(open) => {
          if (!open) setEditState(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {editState?.file.label ?? ''}
            </DialogTitle>
            <DialogDescription>
              Review or edit the instructions before saving them to this file.
            </DialogDescription>
          </DialogHeader>

          {editState && (
            <div className="space-y-4 pt-2">
              {editState.error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {editState.error}
                </div>
              )}

              <p className="text-xs text-muted-foreground break-all">{editState.file.location}</p>

              <Textarea
                className="font-mono text-xs min-h-[400px] resize-y"
                value={editState.content}
                onChange={(event) =>
                  setEditState((previous) =>
                    previous ? { ...previous, content: event.target.value } : null,
                  )
                }
                placeholder="Add your instructions here..."
                aria-label={`Instructions in ${editState.file.label}`}
                spellCheck={false}
              />

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditState(null)}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button onClick={() => void handleSave()} disabled={editState.saving}>
                  {editState.saving ? (
                    <>
                      <Spinner size="sm" className="mr-1" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-1" />
                      Save File
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default InstructionFilesSettings;
