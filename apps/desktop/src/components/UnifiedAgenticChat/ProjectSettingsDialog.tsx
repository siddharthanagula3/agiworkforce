/**
 * Project Settings Dialog
 *
 * A dialog for creating and editing project settings including:
 * - Project name and description
 * - Custom instructions
 * - File/knowledge management
 * - Associated conversations
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Label } from '../ui/Label';
import { ScrollArea } from '../ui/ScrollArea';
import { Badge } from '../ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
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
  Plus,
  Upload,
  Brain,
  Database,
  Cpu,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import {
  useProjectStore,
  type Project,
  type ProjectFile,
  type KnowledgeBaseFile,
} from '../../stores/projectStore';
import { useChatStore, type ConversationSummary } from '../../stores/chat/chatStore';
import { invoke, isTauri } from '../../lib/tauri-mock';
import { cn } from '../../lib/utils';
import { MemoryManager } from '../Memory/MemoryManager';
import { getAllModels } from '../../constants/llm';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';

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

// BUG-PS-05: Icon name → Lucide component lookup map
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
}

export const ProjectSettingsDialog: React.FC<ProjectSettingsDialogProps> = ({
  open,
  onOpenChange,
  project,
  mode,
}) => {
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [conversationIds, setConversationIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [autoSaveMemories, setAutoSaveMemories] = useState(true);
  const [preferredModel, setPreferredModel] = useState<string>('');
  const [knowledgeBaseFiles, setKnowledgeBaseFiles] = useState<KnowledgeBaseFile[]>([]);
  const [isUploadingKb, setIsUploadingKb] = useState(false);
  const kbDropZoneRef = useRef<HTMLDivElement>(null);

  // Store actions
  const createProject = useProjectStore((state) => state.createProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  // BUG-PS-04: replaced deprecated useUnifiedChatStore with useChatStore
  const conversations = useChatStore((state) => state.conversations);

  // Reset form when dialog opens/closes or project identity changes (projectId only to avoid loop from new object refs)
  const projectId = project?.id ?? null;
  // BUG-PS-01: load project settings (including autoSaveMemories) from store on open
  const getProjectSettings = useProjectStore((state) => state.getProjectSettings);
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && project != null) {
        setName(project.name);
        setDescription(project.description);
        setCustomInstructions(project.customInstructions);
        setColor(project.color || DEFAULT_COLOR);
        setIcon(project.icon || DEFAULT_ICON);
        setFiles(project.files);
        setConversationIds(project.conversationIds);
        setPreferredModel(project.preferredModel ?? '');
        setKnowledgeBaseFiles(project.knowledgeBaseFiles ?? []);
        // BUG-PS-01: load persisted autoSaveMemories from project settings
        const settings = getProjectSettings(project.id);
        setAutoSaveMemories(settings.autoSaveMemories ?? false);
      } else {
        // Reset for create mode
        setName('');
        setDescription('');
        setCustomInstructions('');
        setColor(DEFAULT_COLOR);
        setIcon(DEFAULT_ICON);
        setFiles([]);
        setConversationIds([]);
        setPreferredModel('');
        setKnowledgeBaseFiles([]);
        setAutoSaveMemories(false);
      }
      setActiveTab('general');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, projectId]);

  // BUG-PS-01: also grab updateProjectSettings so autoSaveMemories can be persisted
  const updateProjectSettings = useProjectStore((state) => state.updateProjectSettings);

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      if (mode === 'create') {
        const newProject = await createProject({
          name: name.trim(),
          description: description.trim(),
          customInstructions: customInstructions.trim(),
          color,
          icon,
          files,
          conversationIds,
          isArchived: false,
          preferredModel: preferredModel || undefined,
          knowledgeBaseFiles,
        });
        // BUG-PS-01: persist autoSaveMemories for newly created project
        await updateProjectSettings(newProject.id, { autoSaveMemories });
      } else if (project) {
        await updateProject(project.id, {
          name: name.trim(),
          description: description.trim(),
          customInstructions: customInstructions.trim(),
          color,
          icon,
          files,
          conversationIds,
          preferredModel: preferredModel || undefined,
          knowledgeBaseFiles,
        });
        // BUG-PS-01: persist autoSaveMemories for edited project
        await updateProjectSettings(project.id, { autoSaveMemories });
      }
      onOpenChange(false);
    } catch (error) {
      console.error('[ProjectSettingsDialog] Failed to save project:', error);
      // BUG-PS-03: show user-visible error instead of silent console.error only
      toast.error('Failed to save project settings');
    } finally {
      setIsSaving(false);
    }
  };

  // BUG-PS-02: real file picker via @tauri-apps/plugin-dialog
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ backgroundColor: color }}
            >
              <FolderPlus className="w-4 h-4 text-white" />
            </div>
            {mode === 'create' ? 'Create New Project' : 'Edit Project'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {mode === 'create'
              ? 'Create a new project to organize your conversations and files.'
              : 'Update your project settings and organization.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="bg-muted border-border flex-wrap">
            <TabsTrigger value="general" className="data-[state=active]:bg-accent">
              <Settings className="w-4 h-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="instructions" className="data-[state=active]:bg-accent">
              <FileText className="w-4 h-4 mr-2" />
              Instructions
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="data-[state=active]:bg-accent">
              <Database className="w-4 h-4 mr-2" />
              Knowledge
            </TabsTrigger>
            <TabsTrigger value="files" className="data-[state=active]:bg-accent">
              <File className="w-4 h-4 mr-2" />
              Files
            </TabsTrigger>
            <TabsTrigger value="memory" className="data-[state=active]:bg-accent">
              <Brain className="w-4 h-4 mr-2" />
              Memory
            </TabsTrigger>
            <TabsTrigger value="conversations" className="data-[state=active]:bg-accent">
              <MessageSquare className="w-4 h-4 mr-2" />
              Conversations
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 min-h-[300px]">
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
                    // BUG-PS-05: render actual Lucide icon; fall back to first letter if not in map
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
                <Label className="text-foreground flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  Preferred Model
                </Label>
                <p className="text-xs text-muted-foreground">
                  When set, this model will be auto-selected when entering a conversation in this
                  project. Leave blank to use the global default.
                </p>
                <Select value={preferredModel} onValueChange={setPreferredModel}>
                  <SelectTrigger className="bg-muted border-border text-foreground">
                    <SelectValue placeholder="Use global default" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border max-h-60">
                    <SelectItem value="" className="text-foreground">
                      Use global default
                    </SelectItem>
                    {getAllModels()
                      .filter((m) => m.id !== 'auto' && !m.id.startsWith('auto:'))
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-foreground">
                          {m.name ?? m.id}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
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
                {/* Auto-save Toggle */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-blue-400" />
                    <div className="flex flex-col">
                      <Label className="text-foreground font-medium">Auto-save Memories</Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically save architectural decisions and important context
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoSaveMemories(!autoSaveMemories)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      autoSaveMemories ? 'bg-blue-600' : 'bg-accent',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                        autoSaveMemories ? 'translate-x-6' : 'translate-x-1',
                      )}
                    />
                  </button>
                </div>

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
                    Memories help AGI Workforce remember important details about your project across
                    sessions. Architectural decisions, coding preferences, and project context are
                    all stored as memories for continuous improvement.
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

        <DialogFooter className="mt-6">
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
            ) : mode === 'create' ? (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create Project
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
