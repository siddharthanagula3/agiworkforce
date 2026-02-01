/**
 * CreateMemoryDialog Component
 *
 * Dialog for creating new memories with category selection,
 * topic input, content textarea, and importance slider.
 */
import { memo, useCallback, useState } from 'react';
import { Brain, Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { cn } from '@/lib/utils';
import type { MemoryCategory } from '@/stores/memoryStore';
import { useMemory } from '@/hooks/useMemory';

const CATEGORY_OPTIONS: { value: MemoryCategory; label: string; description: string }[] = [
  {
    value: 'preference',
    label: 'Preference',
    description: 'User preferences and settings',
  },
  {
    value: 'fact',
    label: 'Fact',
    description: 'Factual information about the user or project',
  },
  {
    value: 'decision',
    label: 'Decision',
    description: 'Past decisions and their context',
  },
  {
    value: 'context',
    label: 'Context',
    description: 'Contextual information for better understanding',
  },
];

export interface CreateMemoryDialogProps {
  /** Trigger element for the dialog */
  trigger?: React.ReactNode;
  /** Callback when memory is created successfully */
  onCreated?: (id: number) => void;
  /** Additional class names */
  className?: string;
}

export const CreateMemoryDialog = memo(function CreateMemoryDialog({
  trigger,
  onCreated,
  className,
}: CreateMemoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<MemoryCategory>('fact');
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [importance, setImportance] = useState(5);
  const [source, setSource] = useState('');

  const { store, isStoring } = useMemory({ autoLoad: false });

  const resetForm = useCallback(() => {
    setCategory('fact');
    setTopic('');
    setContent('');
    setImportance(5);
    setSource('');
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!topic.trim() || !content.trim()) {
        return;
      }

      try {
        const id = await store({
          category,
          topic: topic.trim(),
          content: content.trim(),
          importance,
          source: source.trim() || undefined,
        });

        onCreated?.(id);
        resetForm();
        setOpen(false);
      } catch {
        // Error is already handled by the hook with toast
      }
    },
    [category, topic, content, importance, source, store, onCreated, resetForm],
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (!isOpen) {
        resetForm();
      }
    },
    [resetForm],
  );

  const isValid = topic.trim().length > 0 && content.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className={cn('gap-2', className)}>
            <Plus className="h-4 w-4" />
            Add Memory
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Create Memory
          </DialogTitle>
          <DialogDescription>
            Add a new memory that AGI Workforce will remember across sessions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as MemoryCategory)}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Topic Input */}
          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Preferred coding style"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              A brief title for this memory ({topic.length}/100)
            </p>
          </div>

          {/* Content Textarea */}
          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe the memory in detail..."
              rows={4}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground">
              The full details of this memory ({content.length}/2000)
            </p>
          </div>

          {/* Importance Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="importance">Importance</Label>
              <span className="text-sm text-muted-foreground">{importance}/10</span>
            </div>
            <Slider
              id="importance"
              value={[importance]}
              onValueChange={(values) => setImportance(values[0] ?? 5)}
              min={1}
              max={10}
              step={1}
              className="py-2"
            />
            <p className="text-xs text-muted-foreground">
              Higher importance memories are recalled more often
            </p>
          </div>

          {/* Source Input (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="source">
              Source <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g., User preference, Conversation on Jan 15"
              maxLength={200}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isStoring}>
              {isStoring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Memory
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
});
