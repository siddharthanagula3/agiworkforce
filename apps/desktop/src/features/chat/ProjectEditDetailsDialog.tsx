import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { useProjectStore, type Project } from '../../stores/projectStore';

interface ProjectEditDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
}

export function ProjectEditDetailsDialog({
  open,
  onOpenChange,
  project,
}: ProjectEditDetailsDialogProps) {
  const updateProject = useProjectStore((state) => state.updateProject);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !project) return;
    setName(project.name);
    setDescription(project.description);
    setIsSaving(false);
  }, [open, project]);

  const nameValue = name.trim();
  const descriptionValue = description.trim();
  const canSave = Boolean(project && nameValue && descriptionValue && !isSaving);

  const handleSave = async () => {
    if (!project || !canSave) return;
    setIsSaving(true);
    try {
      await updateProject(project.id, {
        name: nameValue,
        description: descriptionValue,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update project details');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(520px,calc(100vw-40px))] max-w-none gap-0 rounded-2xl border-border/70 p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/70 px-6 py-5 text-left">
          <DialogTitle className="text-xl leading-tight">Edit details</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="project-details-name">Name *</Label>
            <Input
              id="project-details-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-details-description">Description *</Label>
            <Textarea
              id="project-details-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-28 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
