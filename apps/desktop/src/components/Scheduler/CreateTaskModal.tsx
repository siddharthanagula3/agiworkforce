import { Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  type ScheduledTask,
  type TaskSchedule,
  useScheduledTaskStore,
} from '../../stores/scheduledTaskStore';
import { MODEL_PRESETS } from '../../constants/llm';
import { cn } from '../../lib/utils';
import { TaskScheduleInput } from './TaskScheduleInput';

interface CreateTaskModalProps {
  isOpen: boolean;
  editingTask?: ScheduledTask | null;
  onClose: () => void;
}

type Provider = keyof typeof MODEL_PRESETS;

const ALL_MODEL_OPTIONS: Array<{ value: string; label: string; group: string }> = (
  Object.entries(MODEL_PRESETS) as Array<[Provider, Array<{ value: string; label: string }>]>
)
  .filter(([, presets]) => presets.length > 0)
  .flatMap(([provider, presets]) =>
    presets.map((p) => ({ value: p.value, label: p.label, group: provider })),
  );

const DEFAULT_SCHEDULE: TaskSchedule = {
  type: 'recurring',
  interval: 'daily',
};

function fieldClass(extra?: string) {
  return cn(
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white',
    'placeholder-slate-500 outline-none transition',
    'focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30',
    extra,
  );
}

export function CreateTaskModal({ isOpen, editingTask, onClose }: CreateTaskModalProps) {
  const createTask = useScheduledTaskStore((s) => s.createTask);
  const updateTask = useScheduledTaskStore((s) => s.updateTask);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState('');
  const [schedule, setSchedule] = useState<TaskSchedule>(DEFAULT_SCHEDULE);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = editingTask != null;

  // Populate form when editing
  useEffect(() => {
    if (editingTask) {
      setName(editingTask.name);
      setDescription(editingTask.description);
      setPrompt(editingTask.prompt);
      setModelId(editingTask.modelId ?? '');
      setSchedule(editingTask.schedule);
    } else {
      setName('');
      setDescription('');
      setPrompt('');
      setModelId('');
      setSchedule(DEFAULT_SCHEDULE);
    }
  }, [editingTask, isOpen]);

  const handleClose = useCallback(() => {
    if (!isSaving) {
      onClose();
    }
  }, [isSaving, onClose]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();

    if (!trimmedName) {
      toast.error('Task name is required');
      return;
    }
    if (!trimmedPrompt) {
      toast.error('AI prompt is required');
      return;
    }
    if (schedule.type === 'once' && !schedule.runAt) {
      toast.error('Please select a date and time for the one-time run');
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && editingTask) {
        await updateTask(editingTask.id, {
          name: trimmedName,
          description: description.trim(),
          prompt: trimmedPrompt,
          modelId: modelId || undefined,
          schedule,
        });
        toast.success('Task updated');
      } else {
        await createTask({
          name: trimmedName,
          description: description.trim(),
          prompt: trimmedPrompt,
          modelId: modelId || undefined,
          schedule,
          status: 'active',
        });
        toast.success('Task created');
      }
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save task';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [
    name,
    description,
    prompt,
    modelId,
    schedule,
    isEditing,
    editingTask,
    createTask,
    updateTask,
    onClose,
  ]);

  // Keyboard shortcuts: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0c14] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="create-task-title" className="text-sm font-semibold text-white">
            {isEditing ? 'Edit Scheduled Task' : 'Create Scheduled Task'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          {/* Task name */}
          <div>
            <label htmlFor="task-name" className="mb-1.5 block text-sm font-medium text-slate-300">
              Task name <span className="text-red-400">*</span>
            </label>
            <input
              id="task-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daily news summary"
              disabled={isSaving}
              className={fieldClass()}
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="task-description"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Description <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              id="task-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this task does"
              disabled={isSaving}
              className={fieldClass()}
            />
          </div>

          {/* AI Prompt */}
          <div>
            <label
              htmlFor="task-prompt"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              AI Prompt <span className="text-red-400">*</span>
            </label>
            <textarea
              id="task-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the AI do? e.g. 'Summarize the top 5 AI news stories from today and format them as bullet points'"
              disabled={isSaving}
              rows={4}
              className={fieldClass()}
            />
          </div>

          {/* Model selector */}
          <div>
            <label htmlFor="task-model" className="mb-1.5 block text-sm font-medium text-slate-300">
              Model{' '}
              <span className="text-slate-500 font-normal">(optional — uses app default)</span>
            </label>
            <select
              id="task-model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={isSaving}
              className={cn(fieldClass(), 'cursor-pointer')}
            >
              <option value="" className="bg-slate-900">
                Use app default
              </option>
              {ALL_MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Schedule */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Schedule</label>
            <TaskScheduleInput value={schedule} onChange={setSchedule} disabled={isSaving} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
              isSaving
                ? 'cursor-not-allowed bg-teal-600/50 text-white/70'
                : 'bg-teal-600 text-white hover:bg-teal-500',
            )}
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? 'Save changes' : 'Create task'}
          </button>
        </div>
      </div>
    </div>
  );
}
