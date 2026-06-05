import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import {
  FolderPlus,
  Folder,
  Code,
  FileText,
  Star,
  Briefcase,
  Rocket,
  BookOpen,
  Lightbulb,
  File,
  MessageSquare,
  Settings,
  Palette,
  Trash2,
  Upload,
  Brain,
  Database,
  ChevronDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import {
  useProjectStore,
  type Project,
  type ProjectFile,
  type KnowledgeBaseFile,
} from '../../stores/projectStore';
import type { ProjectAccentColor, PrivacyMode } from '@agiworkforce/types';
import { useChatStore, type ConversationSummary } from '../../stores/chat/chatStore';
import { invoke, isTauri } from '../../lib/tauri-mock';
import { cn } from '../../lib/utils';
import { MemoryManager } from '@/features/memory/MemoryManager';

// Supported knowledge base file extensions
const SUPPORTED_KB_EXTENSIONS = [
  '.txt',
  '.md',
  '.pdf',
  '.csv',
  '.json',
  '.py',
  '.js',
  '.ts',
  '.rs',
] as const;

// Project color options - defined as const tuple for type safety
const PROJECT_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Red', value: '#ef4444' },
] as const;

// Default values extracted for safe access
const DEFAULT_COLOR: string = PROJECT_COLORS[0].value;
const DEFAULT_ICON = 'folder';

// Canonical accent color options (6 values from ProjectAccentColor)
const ACCENT_COLORS: { label: string; value: ProjectAccentColor; bg: string }[] = [
  { label: 'Emerald', value: 'emerald', bg: 'bg-emerald-500' },
  { label: 'Sky', value: 'sky', bg: 'bg-sky-500' },
  { label: 'Amber', value: 'amber', bg: 'bg-amber-500' },
  { label: 'Rose', value: 'rose', bg: 'bg-rose-500' },
  { label: 'Violet', value: 'violet', bg: 'bg-violet-500' },
  { label: 'Zinc', value: 'zinc', bg: 'bg-zinc-500' },
];

// Project icon options - defined as const tuple for type safety
const PROJECT_ICONS = [
  { name: 'Folder', value: 'folder' },
  { name: 'Code', value: 'code' },
  { name: 'Document', value: 'document' },
  { name: 'Star', value: 'star' },
  { name: 'Briefcase', value: 'briefcase' },
  { name: 'Rocket', value: 'rocket' },
  { name: 'Book', value: 'book' },
  { name: 'Lightbulb', value: 'lightbulb' },
] as const;

const ICON_COMPONENT_MAP: Record<string, LucideIcon> = {
  folder: Folder,
  code: Code,
  document: FileText,
  star: Star,
  briefcase: Briefcase,
  rocket: Rocket,
  book: BookOpen,
  lightbulb: Lightbulb,
};

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  mode: 'create' | 'edit';
  onCreated?: (project: Project) => void;
}

export const ProjectSettingsDialog: React.FC<ProjectSettingsDialogProps> = ({
  open,
  onOpenChange,
  project,
  mode,
  onCreated,
}) => {
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [iconEmoji, setIconEmoji] = useState('');
  const [accentColor, setAccentColor] = useState<ProjectAccentColor | null>(null);
  const [defaultPrivacyMode, setDefaultPrivacyMode] = useState<PrivacyMode>('local');
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [conversationIds, setConversationIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [knowledgeBaseFiles, setKnowledgeBaseFiles] = useState<KnowledgeBaseFile[]>([]);
  const [isUploadingKb, setIsUploadingKb] = useState(false);
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const kbDropZoneRef = useRef<HTMLDivElement>(null);

  // Store actions
  const createProject = useProjectStore((state) => state.createProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  const conversations = useChatStore((state) => state.conversations);

  // Reset form when dialog opens/closes or project identity changes (projectId only to avoid loop from new object refs)
  const projectId = project?.id ?? null;
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && project != null) {
        setName(project.name);
        setDescription(project.description);
        setCustomInstructions(project.customInstructions);
        setColor(project.color || DEFAULT_COLOR);
        setIcon(project.icon || DEFAULT_ICON);
        setIconEmoji(project.iconEmoji ?? '');
        setAccentColor(project.accentColor ?? null);
        setDefaultPrivacyMode(project.defaultPrivacyMode ?? 'local');
        setFiles(project.files);
        setConversationIds(project.conversationIds);
        setKnowledgeBaseFiles(project.knowledgeBaseFiles ?? []);
        setShowCreateOptions(false);
      } else {
        setName('');
        setDescription('');
        setCustomInstructions('');
        setColor(DEFAULT_COLOR);
        setIcon(DEFAULT_ICON);
        setIconEmoji('');
        setAccentColor(null);
        setDefaultPrivacyMode('local');
        setFiles([]);
        setConversationIds([]);
        setKnowledgeBaseFiles([]);
        setShowCreateOptions(false);
      }
      setActiveTab('general');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, projectId]);

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      if (mode === 'create') {
        const createdProject = await createProject({
          name: name.trim(),
          description: description.trim(),
          customInstructions: customInstructions.trim(),
          color,
          icon,
          iconEmoji: iconEmoji.trim() || null,
          accentColor,
          defaultPrivacyMode,
          files,
          conversationIds,
          isArchived: false,
          knowledgeBaseFiles,
        });
        onCreated?.(createdProject);
      } else if (project) {
        await updateProject(project.id, {
          name: name.trim(),
          description: description.trim(),
          customInstructions: customInstructions.trim(),
          color,
          icon,
          iconEmoji: iconEmoji.trim() || null,
          accentColor,
          defaultPrivacyMode,
          files,
          conversationIds,
          knowledgeBaseFiles,
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error('[ProjectSettingsDialog] Failed to save project:', error);
      toast.error('Failed to save project settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFile = useCallback(async () => {
    if (!isTauri) {
      toast.error('File picker is only available in the desktop app');
      return;
    }
    try {
      const selected = await openFilePicker({ multiple: true, directory: false });
      if (selected) {
        const fileArray = Array.isArray(selected) ? selected : [selected];
        const newFiles: ProjectFile[] = fileArray.map((filePath) => ({
          id: crypto.randomUUID(),
          name: filePath.split('/').pop() ?? filePath,
          path: filePath,
          type: 'file',
          addedAt: new Date().toISOString(),
        }));
        setFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (err) {
      console.error('[ProjectSettingsDialog] File picker error:', err);
      toast.error('Failed to open file picker');
    }
  }, []);

  const handleRemoveFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const handleToggleConversation = useCallback((conversationId: string) => {
    setConversationIds((prev) =>
      prev.includes(conversationId)
        ? prev.filter((id) => id !== conversationId)
        : [...prev, conversationId],
    );
  }, []);

  const processKbFile = useCallback(async (filePath: string, fileName: string) => {
    try {
      const content = await invoke<string>('file_read', { path: filePath });
      const newFile: KnowledgeBaseFile = {
        id: crypto.randomUUID(),
        name: fileName,
        path: filePath,
        content: typeof content === 'string' ? content : undefined,
        addedAt: new Date().toISOString(),
      };
      setKnowledgeBaseFiles((prev) => {
        // Prevent duplicate paths
        if (prev.some((f) => f.path === filePath)) return prev;
        return [...prev, newFile];
      });
      // Store in project memory
      if (typeof content === 'string' && content.length > 0) {
        await invoke('memory_remember', {
          content: `[Knowledge Base: ${fileName}]\n${content.slice(0, 8000)}`,
          category: 'project',
        }).catch(() => {
          // Memory storage failure is non-fatal
        });
      }
    } catch {
      toast.error(`Failed to read file: ${fileName}`);
    }
  }, []);

  const handleAddKbFiles = useCallback(async () => {
    if (!isTauri) {
      toast.error('File picker is only available in the desktop app');
      return;
    }
    setIsUploadingKb(true);
    try {
      const selected = await openFilePicker({
        multiple: true,
        directory: false,
        filters: [
          {
            name: 'Knowledge Base Files',
            extensions: SUPPORTED_KB_EXTENSIONS.map((e) => e.replace('.', '')),
          },
        ],
      });
      if (selected) {
        const fileArray = Array.isArray(selected) ? selected : [selected];
        await Promise.all(fileArray.map((fp) => processKbFile(fp, fp.split('/').pop() ?? fp)));
      }
    } catch {
      toast.error('Failed to open file picker');
    } finally {
      setIsUploadingKb(false);
    }
  }, [processKbFile]);

  const handleKbDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsUploadingKb(true);
      try {
        const items = Array.from(e.dataTransfer.files);
        await Promise.all(
          items.map((file) => {
            // In Tauri webview, file.path gives the real FS path
            const fp = (file as File & { path?: string }).path ?? file.name;
            return processKbFile(fp, file.name);
          }),
        );
      } finally {
        setIsUploadingKb(false);
      }
    },
    [processKbFile],
  );

  const handleKbDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleRemoveKbFile = useCallback((fileId: string) => {
    setKnowledgeBaseFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  if (mode === 'create') {
    const projectPresets: Array<{
      label: string;
      name: string;
      description: string;
      icon: string;
      accentColor: ProjectAccentColor;
      Icon: LucideIcon;
    }> = [
      {
        label: 'Codebase',
        name: 'Codebase',
        description: 'Track implementation notes, architecture decisions, and open bugs.',
        icon: 'code',
        accentColor: 'sky',
        Icon: Code,
      },
      {
        label: 'Launch',
        name: 'Launch plan',
        description: 'Collect product decisions, demo tasks, feedback, and follow-ups.',
        icon: 'rocket',
        accentColor: 'amber',
        Icon: Rocket,
      },
      {
        label: 'Research',
        name: 'Research',
        description: 'Keep source notes, comparison findings, and unanswered questions together.',
        icon: 'book',
        accentColor: 'violet',
        Icon: BookOpen,
      },
      {
        label: 'Work',
        name: 'Work',
        description: 'Organize recurring tasks, stakeholders, documents, and project memory.',
        icon: 'briefcase',
        accentColor: 'emerald',
        Icon: Briefcase,
      },
    ];

    const privacyOptions: Array<{
      value: PrivacyMode;
      label: string;
      description: string;
    }> = [
      {
        value: 'local',
        label: 'Local',
        description: 'Runs on this machine. Best for private work.',
      },
      {
        value: 'byok',
        label: 'BYOK',
        description: 'Uses your provider key when the conversation needs cloud models.',
      },
      {
        value: 'managed',
        label: 'Cloud',
        description: 'Uses AGI managed compute when your account has access.',
      },
    ];

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[560px] overflow-hidden border-border bg-card p-0 shadow-2xl">
          <div className="px-7 pb-6 pt-7">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-[1.65rem] font-semibold tracking-tight text-foreground">
                Create a project
              </DialogTitle>
              <DialogDescription className="max-w-[440px] text-sm leading-6 text-muted-foreground">
                Projects keep related chats, files, instructions, and memory together.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="project-name" className="text-sm font-medium text-foreground">
                  What are you working on?
                </Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name your project"
                  className="h-12 rounded-xl border-border bg-background px-4 text-base text-foreground placeholder:text-muted-foreground"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Start from a preset</Label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {projectPresets.map((preset) => {
                    const PresetIcon = preset.Icon;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          if (!name.trim()) setName(preset.name);
                          if (!description.trim()) setDescription(preset.description);
                          setIcon(preset.icon);
                          setAccentColor(preset.accentColor);
                        }}
                        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/60"
                      >
                        <PresetIcon className="h-4 w-4 text-muted-foreground" />
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="project-description"
                  className="text-sm font-medium text-foreground"
                >
                  What are you trying to achieve?
                </Label>
                <Textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the goal, audience, constraints, or anything AGI should keep in mind."
                  className="min-h-[96px] resize-none rounded-xl border-border bg-background px-4 py-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="rounded-xl border border-border bg-muted/20">
                <button
                  type="button"
                  onClick={() => setShowCreateOptions((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-foreground"
                  aria-expanded={showCreateOptions}
                >
                  More options
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform',
                      showCreateOptions && 'rotate-180',
                    )}
                  />
                </button>

                {showCreateOptions && (
                  <div className="border-t border-border px-4 pb-4 pt-3">
                    <Label className="text-sm font-medium text-foreground">Default compute</Label>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {privacyOptions.map((option) => {
                        const selected = defaultPrivacyMode === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setDefaultPrivacyMode(option.value)}
                            className={cn(
                              'rounded-xl border px-3 py-3 text-left transition-colors',
                              selected
                                ? 'border-foreground/30 bg-foreground/[0.06]'
                                : 'border-border bg-background hover:bg-muted/50',
                            )}
                          >
                            <span className="block text-sm font-medium text-foreground">
                              {option.label}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {option.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border bg-muted/20 px-7 py-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-border text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || isSaving}
              className="bg-foreground px-5 text-background hover:bg-foreground/90"
            >
              {isSaving ? 'Creating...' : 'Create project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col overflow-hidden border-border bg-card p-0 sm:max-h-[calc(100dvh-3rem)]">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle className="text-foreground flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ backgroundColor: color }}
            >
              <FolderPlus className="w-4 h-4 text-white" />
            </div>
            Edit Project
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Update your project settings and organization.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="mt-4 flex min-h-0 flex-1 flex-col px-6"
        >
          <TabsList className="shrink-0 flex-nowrap justify-start overflow-x-auto border-border bg-muted">
            <TabsTrigger value="general" className="shrink-0 data-[state=active]:bg-accent">
              <Settings className="w-4 h-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="instructions" className="shrink-0 data-[state=active]:bg-accent">
              <FileText className="w-4 h-4 mr-2" />
              Instructions
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="shrink-0 data-[state=active]:bg-accent">
              <Database className="w-4 h-4 mr-2" />
              Knowledge
            </TabsTrigger>
            <TabsTrigger value="files" className="shrink-0 data-[state=active]:bg-accent">
              <File className="w-4 h-4 mr-2" />
              Files
            </TabsTrigger>
            <TabsTrigger value="memory" className="shrink-0 data-[state=active]:bg-accent">
              <Brain className="w-4 h-4 mr-2" />
              Memory
            </TabsTrigger>
            <TabsTrigger value="conversations" className="shrink-0 data-[state=active]:bg-accent">
              <MessageSquare className="w-4 h-4 mr-2" />
              Conversations
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2 pb-2">
            {/* General Tab */}
            <TabsContent value="general" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name" className="text-foreground">
                  Project Name
                </Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Awesome Project"
                  className="bg-muted border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-description" className="text-foreground">
                  Description
                </Label>
                <Textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A brief description of your project..."
                  className="bg-muted border-border text-foreground min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Color
                </Label>
                <div className="flex gap-2 flex-wrap">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c.value}
                      onClick={() => setColor(c.value)}
                      className={cn(
                        'w-8 h-8 rounded-full transition-all',
                        color === c.value &&
                          'ring-2 ring-white ring-offset-2 ring-offset-background',
                      )}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Icon</Label>
                <div className="flex gap-2 flex-wrap">
                  {PROJECT_ICONS.map((i) => {
                    const IconComponent = ICON_COMPONENT_MAP[i.value];
                    return (
                      <button
                        type="button"
                        key={i.value}
                        onClick={() => setIcon(i.value)}
                        className={cn(
                          'w-10 h-10 rounded-md bg-muted flex items-center justify-center transition-all text-muted-foreground hover:text-foreground',
                          icon === i.value && 'ring-2 ring-blue-500 text-foreground',
                        )}
                        title={i.name}
                      >
                        {IconComponent ? (
                          <IconComponent className="w-4 h-4" />
                        ) : (
                          <span className="text-sm capitalize">{i.value.charAt(0)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-icon-emoji" className="text-foreground">
                  Emoji Icon
                </Label>
                <p className="text-xs text-muted-foreground">
                  Single emoji shown on project cards. Overrides the icon above when set.
                </p>
                <Input
                  id="project-icon-emoji"
                  value={iconEmoji}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setIconEmoji('');
                      return;
                    }
                    // Cap to one grapheme cluster
                    const seg = new Intl.Segmenter();
                    const [first] = seg.segment(raw);
                    setIconEmoji(first?.segment ?? '');
                  }}
                  placeholder="e.g. 🚀"
                  className="bg-muted border-border text-foreground w-24 text-2xl text-center"
                  maxLength={8}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Accent Color
                </Label>
                <p className="text-xs text-muted-foreground">
                  Shown as a color dot on project cards.
                </p>
                <div className="flex gap-2 flex-wrap items-center">
                  <button
                    type="button"
                    onClick={() => setAccentColor(null)}
                    className={cn(
                      'w-8 h-8 rounded-full border-2 border-dashed border-border flex items-center justify-center text-xs text-muted-foreground transition-all',
                      accentColor === null &&
                        'ring-2 ring-white ring-offset-2 ring-offset-background',
                    )}
                    title="None"
                  >
                    —
                  </button>
                  {ACCENT_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c.value}
                      onClick={() => setAccentColor(c.value)}
                      className={cn(
                        'w-8 h-8 rounded-full transition-all',
                        c.bg,
                        accentColor === c.value &&
                          'ring-2 ring-white ring-offset-2 ring-offset-background',
                      )}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Default Privacy Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Privacy mode for new conversations in this project.
                </p>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="privacy-mode"
                      value="local"
                      checked={defaultPrivacyMode === 'local'}
                      onChange={() => setDefaultPrivacyMode('local')}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-foreground">Local</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      Runs on-device. No data leaves your machine.
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="privacy-mode"
                      value="byok"
                      checked={defaultPrivacyMode === 'byok'}
                      onChange={() => setDefaultPrivacyMode('byok')}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-foreground">BYOK</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      Your API key, provider servers.
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="privacy-mode"
                      value="managed"
                      checked={defaultPrivacyMode === 'managed'}
                      onChange={() => setDefaultPrivacyMode('managed')}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-foreground">Cloud Managed</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      AGI cloud with subscription controls.
                    </span>
                  </label>
                </div>
              </div>
            </TabsContent>

            {/* Instructions Tab */}
            <TabsContent value="instructions" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="custom-instructions" className="text-foreground">
                  Custom Instructions
                </Label>
                <p className="text-sm text-muted-foreground">
                  These instructions will be included in every conversation within this project.
                </p>
                <Textarea
                  id="custom-instructions"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="You are an expert in React and TypeScript. Always use functional components and hooks..."
                  className="bg-muted border-border text-foreground min-h-[200px] font-mono text-sm"
                />
              </div>
              <div className="p-3 bg-muted/50 rounded-lg border border-border">
                <p className="text-xs text-muted-foreground">
                  Tip: Use custom instructions to define coding standards, preferred libraries,
                  documentation style, or any context the AI should know about your project.
                </p>
              </div>
            </TabsContent>

            {/* Files Tab */}
            <TabsContent value="files" className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-foreground">Project Files & Knowledge</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddFile}
                  className="border-border text-foreground hover:bg-accent"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Add Files
                </Button>
              </div>

              <ScrollArea className="h-[220px] border border-border rounded-lg p-2">
                {files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <File className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">No files added yet</p>
                    <p className="text-xs">Add files to provide context for your conversations</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-2 bg-muted rounded-md group"
                      >
                        <div className="flex items-center gap-2">
                          <File className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-foreground">{file.name}</span>
                          <span className="text-xs text-muted-foreground">{file.path}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFile(file.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Knowledge Base Tab */}
            <TabsContent value="knowledge" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-foreground">Knowledge Base</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Upload files to give the AI persistent context about this project. Supported:
                    .txt .md .pdf .csv .json .py .js .ts .rs
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddKbFiles}
                  disabled={isUploadingKb}
                  className="border-border text-foreground hover:bg-accent"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploadingKb ? 'Reading...' : 'Browse Files'}
                </Button>
              </div>

              {/* Drag-and-drop zone */}
              <div
                ref={kbDropZoneRef}
                onDrop={handleKbDrop}
                onDragOver={handleKbDragOver}
                className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-muted-foreground transition-colors cursor-pointer"
                onClick={handleAddKbFiles}
              >
                <Database className="w-8 h-8 opacity-40" />
                <p className="text-sm">Drag & drop files here, or click to browse</p>
                <p className="text-xs opacity-60">Files are read and stored as project context</p>
              </div>

              {/* Knowledge base file list */}
              <ScrollArea className="h-[160px] border border-border rounded-lg p-2">
                {knowledgeBaseFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <Database className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm">No knowledge base files yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {knowledgeBaseFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-2 bg-muted rounded-md group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <File className="w-4 h-4 text-green-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-sm text-foreground truncate block">
                              {file.name}
                            </span>
                            {file.content && (
                              <span className="text-xs text-muted-foreground">
                                {file.content.length.toLocaleString()} chars
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveKbFile(file.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                <p className="text-xs text-blue-300">
                  Knowledge base files are read once and their content is stored locally. The AI
                  will reference this content when answering questions within this project.
                </p>
              </div>
            </TabsContent>

            {/* Memory Tab */}
            <TabsContent value="memory" className="space-y-4">
              <div className="space-y-4">
                {/* Memory Manager */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <MemoryManager
                    showCreateButton={true}
                    showImportExport={false}
                    maxHeight="350px"
                  />
                </div>

                {/* Info Box */}
                <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                  <p className="text-xs text-blue-300">
                    Memories help AGI remember important details about your project across sessions.
                    Architectural decisions, coding preferences, and project context are stored as
                    memories for continuity.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Conversations Tab */}
            <TabsContent value="conversations" className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-foreground">Linked Conversations</Label>
                <Badge variant="secondary" className="bg-muted">
                  {conversationIds.length} linked
                </Badge>
              </div>

              <ScrollArea className="h-[220px] border border-border rounded-lg p-2">
                {conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">No conversations available</p>
                    <p className="text-xs">Start a conversation to link it here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conv: ConversationSummary) => {
                      const isLinked = conversationIds.includes(conv.id);
                      return (
                        <button
                          type="button"
                          key={conv.id}
                          onClick={() => handleToggleConversation(conv.id)}
                          className={cn(
                            'w-full flex items-center justify-between p-2 rounded-md transition-colors',
                            isLinked
                              ? 'bg-blue-500/20 border border-blue-500/50'
                              : 'bg-muted hover:bg-accent',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-foreground text-left truncate max-w-[300px]">
                              {conv.title || 'Untitled Conversation'}
                            </span>
                          </div>
                          {isLinked && (
                            <Badge className="bg-blue-500 text-white text-xs">Linked</Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? (
              <>
                <span className="animate-spin mr-2">...</span>
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectSettingsDialog;
