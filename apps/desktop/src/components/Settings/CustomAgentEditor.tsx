/**
 * CustomAgentEditor
 *
 * Form for creating or editing a custom agent configuration.
 * Writes the agent config to disk via the Rust backend.
 */

import { Lock, Loader2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { getAllModels } from '../../constants/llm';
import { type CustomAgentConfig, useCustomAgentsStore } from '../../stores/customAgentsStore';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';

// ---- Constants ---------------------------------------------------------------

const INHERIT_OPTION = { value: '', label: 'Inherit from settings', provider: undefined };

const TOOL_OPTIONS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'WebSearch',
  'WebFetch',
  'TodoRead',
  'TodoWrite',
  'Glob',
  'Grep',
  'LS',
] as const;

type ToolOption = (typeof TOOL_OPTIONS)[number];

// ---- Types -------------------------------------------------------------------

interface CustomAgentEditorProps {
  /** Existing agent to edit, or undefined to create a new one. */
  initialAgent?: CustomAgentConfig;
  onClose: () => void;
}

// ---- Helpers -----------------------------------------------------------------

function createEmpty(): CustomAgentConfig {
  return {
    name: '',
    model: undefined,
    description: '',
    systemPrompt: '',
    allowedTools: undefined,
    scope: 'global',
  };
}

// ---- Component ---------------------------------------------------------------

export function CustomAgentEditor({ initialAgent, onClose }: CustomAgentEditorProps) {
  const { saveAgent, deleteAgent, isLoading } = useCustomAgentsStore(
    useShallow((s) => ({
      saveAgent: s.saveAgent,
      deleteAgent: s.deleteAgent,
      isLoading: s.isLoading,
    })),
  );

  const modelOptions = useMemo(
    () => [
      INHERIT_OPTION,
      ...getAllModels()
        .filter(
          (m) =>
            m.modelType === 'chat' ||
            m.modelType === 'code' ||
            m.modelType === 'reasoning' ||
            m.modelType === 'multimodal',
        )
        .map((m) => ({ value: m.id, label: m.name, provider: m.provider })),
    ],
    [],
  );

  const [form, setForm] = useState<CustomAgentConfig>(() =>
    initialAgent ? { ...initialAgent } : createEmpty(),
  );
  const [selectedTools, setSelectedTools] = useState<Set<ToolOption>>(() => {
    const tools = initialAgent?.allowedTools ?? [];
    return new Set(
      tools.filter((t): t is ToolOption => (TOOL_OPTIONS as readonly string[]).includes(t)),
    );
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isEditing = Boolean(initialAgent);

  // Keep form in sync if the parent passes a different initialAgent (e.g. tab switch)
  useEffect(() => {
    if (initialAgent) {
      setForm({ ...initialAgent });
      const tools = initialAgent.allowedTools ?? [];
      setSelectedTools(
        new Set(
          tools.filter((t): t is ToolOption => (TOOL_OPTIONS as readonly string[]).includes(t)),
        ),
      );
    }
  }, [initialAgent]);

  const handleFieldChange = useCallback(
    <K extends keyof CustomAgentConfig>(field: K, value: CustomAgentConfig[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const toggleTool = useCallback((tool: ToolOption) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) {
        next.delete(tool);
      } else {
        next.add(tool);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error('Agent name is required');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(form.name.trim())) {
      toast.error('Agent name may only contain letters, numbers, hyphens, and underscores');
      return;
    }

    if (!form.systemPrompt || !form.systemPrompt.trim()) {
      toast.error('System prompt is required');
      return;
    }

    setIsSaving(true);
    try {
      const config: CustomAgentConfig = {
        ...form,
        allowedTools: selectedTools.size > 0 ? Array.from(selectedTools) : undefined,
      };
      await saveAgent(config);
      toast.success(isEditing ? 'Agent updated' : 'Agent created');
      onClose();
    } catch (err) {
      toast.error(`Failed to save agent: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  }, [form, selectedTools, isEditing, saveAgent, onClose]);

  const handleDelete = useCallback(async () => {
    if (!initialAgent) return;
    setIsDeleting(true);
    try {
      await deleteAgent(initialAgent.name, initialAgent.scope);
      toast.success('Agent deleted');
      onClose();
    } catch (err) {
      toast.error(`Failed to delete agent: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsDeleting(false);
    }
  }, [initialAgent, deleteAgent, onClose]);

  const busy = isSaving || isDeleting || isLoading;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {isEditing ? `Edit Agent: ${initialAgent?.name}` : 'Create Custom Agent'}
        </h3>
        {isEditing && (
          <div>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-destructive">Delete permanently?</span>
                <Button
                  variant="destructive"
                  size="xs"
                  disabled={busy}
                  onClick={() => void handleDelete()}
                >
                  {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm'}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={busy}
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="agent-name" className="flex items-center gap-1">
            Name <span className="text-destructive">*</span>
            {isEditing && <Lock className="w-3 h-3 text-muted-foreground" />}
          </Label>
          <Input
            id="agent-name"
            placeholder="e.g. frontend-engineer"
            value={form.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            disabled={busy || isEditing}
            title={isEditing ? 'Agent name cannot be changed after creation' : undefined}
          />
          <p className="text-xs text-muted-foreground">
            Used as the filename. Use lowercase letters, hyphens, and underscores only. Cannot be
            changed after creation.
          </p>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="agent-description">Description</Label>
          <Input
            id="agent-description"
            placeholder="A short summary of what this agent does"
            value={form.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            disabled={busy}
          />
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <Label htmlFor="agent-model">Model</Label>
          <Select
            value={form.model ?? ''}
            onValueChange={(v) => handleFieldChange('model', v || undefined)}
            disabled={busy}
          >
            <SelectTrigger id="agent-model">
              <SelectValue placeholder="Inherit from settings" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Override the default model for this agent. Leave blank to inherit from your settings.
          </p>
        </div>

        {/* Scope */}
        <div className="space-y-1.5">
          <Label>Scope</Label>
          <div className="flex gap-3">
            {(['global', 'project'] as const).map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="agent-scope"
                  value={s}
                  checked={form.scope === s}
                  onChange={() => handleFieldChange('scope', s)}
                  disabled={busy || isEditing}
                />
                <span className="text-sm capitalize">{s}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Global agents are saved to{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">~/.claude/agents/</code>. Project
            agents are saved to{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">.claude/agents/</code> in the
            current directory.
          </p>
        </div>

        {/* Allowed Tools */}
        <div className="space-y-1.5">
          <Label>Allowed Tools</Label>
          <div className="flex flex-wrap gap-2">
            {TOOL_OPTIONS.map((tool) => {
              const checked = selectedTools.has(tool);
              return (
                <button
                  key={tool}
                  type="button"
                  disabled={busy}
                  onClick={() => toggleTool(tool)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    checked
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:bg-muted',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  ].join(' ')}
                  aria-pressed={checked}
                >
                  {tool}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Leave all unselected to allow all tools. Click to toggle which tools this agent can use.
          </p>
        </div>

        {/* System Prompt */}
        <div className="space-y-1.5">
          <Label htmlFor="agent-system-prompt">System Prompt</Label>
          <Textarea
            id="agent-system-prompt"
            placeholder="You are a specialized AI agent that..."
            value={form.systemPrompt}
            onChange={(e) => handleFieldChange('systemPrompt', e.target.value)}
            disabled={busy}
            rows={12}
            className="font-mono text-sm resize-y"
          />
          <p className="text-xs text-muted-foreground">
            The system prompt injected when this agent is invoked. Supports Markdown.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => void handleSave()} disabled={busy}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          {isEditing ? 'Save Changes' : 'Create Agent'}
        </Button>
      </div>
    </div>
  );
}

export default CustomAgentEditor;
