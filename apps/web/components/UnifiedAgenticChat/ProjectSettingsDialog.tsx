/**
 * Project Settings Dialog
 *
 * A dialog for creating and editing project settings including:
 * - Project name and description
 * - Custom instructions
 * - File/knowledge management
 * - Associated conversations
 */
import React, { useState, useEffect, useCallback } from 'react';
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
  File,
  MessageSquare,
  FileText,
  Settings,
  Palette,
  Trash2,
  Plus,
  Upload,
  Brain,
} from 'lucide-react';
import { useProjectStore, type Project, type ProjectFile } from '@/stores/unified/projectStore';
import { useUnifiedChatStore, type ConversationSummary } from '@/stores/unified/unifiedChatStore';
import { cn } from '@/lib/utils';
import { MemoryManager } from '../Memory/MemoryManager';

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

const SURFACE_INPUT_CLASS =
  'border-border/70 bg-muted/40 text-foreground placeholder:text-muted-foreground';
const SURFACE_PANEL_CLASS = 'rounded-xl border border-border/70 bg-muted/30';
const SURFACE_MUTED_TEXT_CLASS = 'text-muted-foreground';

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

  // Store actions
  const createProject = useProjectStore((state: any) => state.createProject);
  const updateProject = useProjectStore((state: any) => state.updateProject);
  const conversations = useUnifiedChatStore((state: any) => state.conversations);

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
        setFiles(project.files);
        setConversationIds(project.conversationIds);
      } else {
        // Reset for create mode
        setName('');
        setDescription('');
        setCustomInstructions('');
        setColor(DEFAULT_COLOR);
        setIcon(DEFAULT_ICON);
        setFiles([]);
        setConversationIds([]);
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
        await createProject({
          name: name.trim(),
          description: description.trim(),
          customInstructions: customInstructions.trim(),
          color,
          icon,
          files,
          conversationIds,
          isArchived: false,
        });
      } else if (project) {
        await updateProject(project.id, {
          name: name.trim(),
          description: description.trim(),
          customInstructions: customInstructions.trim(),
          color,
          icon,
          files,
          conversationIds,
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error('[ProjectSettingsDialog] Failed to save project:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFile = useCallback(() => {
    // In a real implementation, this would open a file picker
    // For now, we'll add a placeholder
    const newFile: ProjectFile = {
      id: crypto.randomUUID(),
      name: 'New File',
      path: '/path/to/file',
      type: 'file',
      addedAt: new Date().toISOString(),
    };
    setFiles((prev) => [...prev, newFile]);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div
              className="flex h-6 w-6 items-center justify-center rounded-md"
              style={{ backgroundColor: color }}
            >
              <FolderPlus className="w-4 h-4 text-white" />
            </div>
            {mode === 'create' ? 'Create New Project' : 'Edit Project'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Create a new project to organize your conversations and files.'
              : 'Update your project settings and organization.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-border/70 bg-muted/30 p-1">
            <TabsTrigger value="general" className="rounded-lg">
              <Settings className="w-4 h-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="instructions" className="rounded-lg">
              <FileText className="w-4 h-4 mr-2" />
              Instructions
            </TabsTrigger>
            <TabsTrigger value="files" className="rounded-lg">
              <File className="w-4 h-4 mr-2" />
              Files
            </TabsTrigger>
            <TabsTrigger value="memory" className="rounded-lg">
              <Brain className="w-4 h-4 mr-2" />
              Memory
            </TabsTrigger>
            <TabsTrigger value="conversations" className="rounded-lg">
              <MessageSquare className="w-4 h-4 mr-2" />
              Conversations
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 min-h-[300px]">
            {/* General Tab */}
            <TabsContent value="general" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Awesome Project"
                  className={SURFACE_INPUT_CLASS}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-description">Description</Label>
                <Textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A brief description of your project..."
                  className={cn('min-h-[80px]', SURFACE_INPUT_CLASS)}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Color
                </Label>
                <div className="flex gap-2 flex-wrap">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setColor(c.value)}
                      className={cn(
                        'h-8 w-8 rounded-full border border-black/10 transition-all dark:border-white/10',
                        color === c.value &&
                          'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                      )}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="flex gap-2 flex-wrap">
                  {PROJECT_ICONS.map((i) => (
                    <button
                      key={i.value}
                      onClick={() => setIcon(i.value)}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground transition-all hover:bg-accent hover:text-foreground',
                        icon === i.value && 'border-primary/50 bg-primary/10 text-primary',
                      )}
                      title={i.name}
                    >
                      <span className="text-sm capitalize">{i.value.charAt(0)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Instructions Tab */}
            <TabsContent value="instructions" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="custom-instructions">Custom Instructions</Label>
                <p className={cn('text-sm', SURFACE_MUTED_TEXT_CLASS)}>
                  These instructions will be included in every conversation within this project.
                </p>
                <Textarea
                  id="custom-instructions"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="You are an expert in React and TypeScript. Always use functional components and hooks..."
                  className={cn('min-h-[200px] font-mono text-sm', SURFACE_INPUT_CLASS)}
                />
              </div>
              <div className={cn('p-3', SURFACE_PANEL_CLASS)}>
                <p className={cn('text-xs', SURFACE_MUTED_TEXT_CLASS)}>
                  Tip: Use custom instructions to define coding standards, preferred libraries,
                  documentation style, or any context the AI should know about your project.
                </p>
              </div>
            </TabsContent>

            {/* Files Tab */}
            <TabsContent value="files" className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Project Files & Knowledge</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddFile}
                  className="border-border/70"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Add Files
                </Button>
              </div>

              <ScrollArea className="h-[220px] rounded-xl border border-border/70 bg-muted/20 p-2">
                {files.length === 0 ? (
                  <div
                    className={cn(
                      'flex h-full flex-col items-center justify-center',
                      SURFACE_MUTED_TEXT_CLASS,
                    )}
                  >
                    <File className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">No files added yet</p>
                    <p className="text-xs">Add files to provide context for your conversations</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="group flex items-center justify-between rounded-lg border border-border/60 bg-background/60 p-2"
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
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Memory Tab */}
            <TabsContent value="memory" className="space-y-4">
              <div className="space-y-4">
                {/* Auto-save Toggle */}
                <div className={cn('flex items-center justify-between p-3', SURFACE_PANEL_CLASS)}>
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-blue-400" />
                    <div className="flex flex-col">
                      <Label className="font-medium">Auto-save Memories</Label>
                      <p className={cn('text-xs', SURFACE_MUTED_TEXT_CLASS)}>
                        Automatically save architectural decisions and important context
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAutoSaveMemories(!autoSaveMemories)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      autoSaveMemories ? 'bg-blue-600' : 'bg-muted-foreground/40',
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
                <div className="overflow-hidden rounded-xl border border-border/70">
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
                <Label>Linked Conversations</Label>
                <Badge
                  variant="secondary"
                  className="border border-border/70 bg-muted text-muted-foreground"
                >
                  {conversationIds.length} linked
                </Badge>
              </div>

              <ScrollArea className="h-[220px] rounded-xl border border-border/70 bg-muted/20 p-2">
                {conversations.length === 0 ? (
                  <div
                    className={cn(
                      'flex h-full flex-col items-center justify-center',
                      SURFACE_MUTED_TEXT_CLASS,
                    )}
                  >
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
                          key={conv.id}
                          onClick={() => handleToggleConversation(conv.id)}
                          className={cn(
                            'w-full flex items-center justify-between rounded-lg border p-2 transition-colors',
                            isLinked
                              ? 'border-blue-500/40 bg-blue-500/10'
                              : 'border-border/60 bg-background/60 hover:bg-accent/50',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-muted-foreground" />
                            <span className="max-w-[300px] truncate text-left text-sm text-foreground">
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
            className="border-border/70"
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
