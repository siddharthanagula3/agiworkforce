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
import { useProjectStore, type Project, type ProjectFile } from '../../stores/projectStore';
import { useUnifiedChatStore, type ConversationSummary } from '../../stores/unifiedChatStore';
import { cn } from '../../lib/utils';
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
  const createProject = useProjectStore((state) => state.createProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  const conversations = useUnifiedChatStore((state) => state.conversations);

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
      <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ backgroundColor: color }}
            >
              <FolderPlus className="w-4 h-4 text-white" />
            </div>
            {mode === 'create' ? 'Create New Project' : 'Edit Project'}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {mode === 'create'
              ? 'Create a new project to organize your conversations and files.'
              : 'Update your project settings and organization.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="bg-zinc-800 border-zinc-700">
            <TabsTrigger value="general" className="data-[state=active]:bg-zinc-700">
              <Settings className="w-4 h-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="instructions" className="data-[state=active]:bg-zinc-700">
              <FileText className="w-4 h-4 mr-2" />
              Instructions
            </TabsTrigger>
            <TabsTrigger value="files" className="data-[state=active]:bg-zinc-700">
              <File className="w-4 h-4 mr-2" />
              Files
            </TabsTrigger>
            <TabsTrigger value="memory" className="data-[state=active]:bg-zinc-700">
              <Brain className="w-4 h-4 mr-2" />
              Memory
            </TabsTrigger>
            <TabsTrigger value="conversations" className="data-[state=active]:bg-zinc-700">
              <MessageSquare className="w-4 h-4 mr-2" />
              Conversations
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 min-h-[300px]">
            {/* General Tab */}
            <TabsContent value="general" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name" className="text-zinc-300">
                  Project Name
                </Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Awesome Project"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-description" className="text-zinc-300">
                  Description
                </Label>
                <Textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A brief description of your project..."
                  className="bg-zinc-800 border-zinc-700 text-white min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-300 flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Color
                </Label>
                <div className="flex gap-2 flex-wrap">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setColor(c.value)}
                      className={cn(
                        'w-8 h-8 rounded-full transition-all',
                        color === c.value && 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900',
                      )}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-300">Icon</Label>
                <div className="flex gap-2 flex-wrap">
                  {PROJECT_ICONS.map((i) => (
                    <button
                      key={i.value}
                      onClick={() => setIcon(i.value)}
                      className={cn(
                        'w-10 h-10 rounded-md bg-zinc-800 flex items-center justify-center transition-all text-zinc-400 hover:text-white',
                        icon === i.value && 'ring-2 ring-blue-500 text-white',
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
                <Label htmlFor="custom-instructions" className="text-zinc-300">
                  Custom Instructions
                </Label>
                <p className="text-sm text-zinc-500">
                  These instructions will be included in every conversation within this project.
                </p>
                <Textarea
                  id="custom-instructions"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="You are an expert in React and TypeScript. Always use functional components and hooks..."
                  className="bg-zinc-800 border-zinc-700 text-white min-h-[200px] font-mono text-sm"
                />
              </div>
              <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <p className="text-xs text-zinc-400">
                  Tip: Use custom instructions to define coding standards, preferred libraries,
                  documentation style, or any context the AI should know about your project.
                </p>
              </div>
            </TabsContent>

            {/* Files Tab */}
            <TabsContent value="files" className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-zinc-300">Project Files & Knowledge</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddFile}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Add Files
                </Button>
              </div>

              <ScrollArea className="h-[220px] border border-zinc-700 rounded-lg p-2">
                {files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                    <File className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">No files added yet</p>
                    <p className="text-xs">Add files to provide context for your conversations</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-2 bg-zinc-800 rounded-md group"
                      >
                        <div className="flex items-center gap-2">
                          <File className="w-4 h-4 text-zinc-400" />
                          <span className="text-sm text-zinc-300">{file.name}</span>
                          <span className="text-xs text-zinc-500">{file.path}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFile(file.id)}
                          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400"
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
                <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-blue-400" />
                    <div className="flex flex-col">
                      <Label className="text-zinc-300 font-medium">Auto-save Memories</Label>
                      <p className="text-xs text-zinc-500">
                        Automatically save architectural decisions and important context
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAutoSaveMemories(!autoSaveMemories)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      autoSaveMemories ? 'bg-blue-600' : 'bg-zinc-700',
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
                <div className="border border-zinc-700 rounded-lg overflow-hidden">
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
                <Label className="text-zinc-300">Linked Conversations</Label>
                <Badge variant="secondary" className="bg-zinc-800">
                  {conversationIds.length} linked
                </Badge>
              </div>

              <ScrollArea className="h-[220px] border border-zinc-700 rounded-lg p-2">
                {conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500">
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
                            'w-full flex items-center justify-between p-2 rounded-md transition-colors',
                            isLinked
                              ? 'bg-blue-500/20 border border-blue-500/50'
                              : 'bg-zinc-800 hover:bg-zinc-700',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-zinc-400" />
                            <span className="text-sm text-zinc-300 text-left truncate max-w-[300px]">
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
            className="border-zinc-700 text-zinc-300"
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
