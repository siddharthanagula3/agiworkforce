'use client';

import { useId, useState } from 'react';
import { formatCredits } from '@agiworkforce/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Spinner,
  useConfirmAction,
  translateUiPlural,
} from '@agiworkforce/ui';
import { toast } from 'sonner';

import { useAPIKeys } from '@features/settings/hooks/use-settings-queries';
import { toUserMessage } from '@/lib/user-error-message';

import {
  useArchiveDeveloperProject,
  useCreateDeveloperProject,
  useDeveloperProjects,
  useUpdateDeveloperProject,
  type DeveloperProjectDraft,
} from '../hooks/use-developer-projects';
import { useDeveloperUsage } from '../hooks/use-developer-usage';
import type { DeveloperProject, DeveloperUsageFigures } from '../types';

const NAME_MAX = 100;

type EditorState = { mode: 'create' } | { mode: 'edit'; project: DeveloperProject } | null;

type LimitField = { valid: true; limit: number | null } | { valid: false };

function parseLimit(value: string): LimitField {
  const trimmed = value.trim();
  if (trimmed === '') return { valid: true, limit: null };
  const limit = Number(trimmed);
  return Number.isInteger(limit) && limit > 0 ? { valid: true, limit } : { valid: false };
}

function keyCountLabel(count: number): string {
  return translateUiPlural(
    'settings',
    'counts.apiKeys',
    count,
    { one: '{{value}} key', other: '{{value}} keys' },
    { value: count.toLocaleString() },
  );
}

function projectUsageLabel(
  usage: DeveloperUsageFigures | undefined,
  monthlyCreditLimit: number | null,
): string {
  const credits = usage?.credits ?? 0;
  const spent = formatCredits(credits, { maximumFractionDigits: 2 });
  if (monthlyCreditLimit === null) return `${spent} this month, no monthly limit`;
  return `${spent} of ${formatCredits(monthlyCreditLimit, { maximumFractionDigits: 0 })} this month`;
}

function ProjectEditor({
  state,
  pending,
  onClose,
  onSubmit,
}: {
  state: Exclude<EditorState, null>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (draft: DeveloperProjectDraft) => void;
}) {
  const fieldId = useId();
  const initial = state.mode === 'edit' ? state.project : null;
  const [name, setName] = useState(initial?.name ?? '');
  const [limit, setLimit] = useState(
    initial?.monthlyCreditLimit ? String(initial.monthlyCreditLimit) : '',
  );
  const parsedLimit = parseLimit(limit);
  const nameValid = name.trim().length > 0 && name.trim().length <= NAME_MAX;
  const canSave = nameValid && parsedLimit.valid && !pending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave || !parsedLimit.valid) return;
            onSubmit({ name: name.trim(), monthlyCreditLimit: parsedLimit.limit });
          }}
        >
          <DialogHeader>
            <DialogTitle>{initial ? `Edit ${initial.name}` : 'New project'}</DialogTitle>
            <DialogDescription>
              Keys you create in this project share its usage and its monthly limit.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-name`}>Name</Label>
              <Input
                id={`${fieldId}-name`}
                value={name}
                maxLength={NAME_MAX}
                onChange={(event) => setName(event.target.value)}
                placeholder="Production"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-limit`}>Monthly limit in credits</Label>
              <Input
                id={`${fieldId}-limit`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                placeholder="No limit"
                aria-invalid={!parsedLimit.valid}
                aria-describedby={`${fieldId}-limit-help`}
              />
              <p id={`${fieldId}-limit-help`} className="text-xs text-muted-foreground">
                {!parsedLimit.valid
                  ? 'Enter a whole number of credits, or leave it empty for no limit.'
                  : 'Once the project has used this many credits in a calendar month, its keys are refused until the month ends. Leave it empty for no limit.'}
              </p>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave} aria-busy={pending}>
              {pending ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
              {initial ? 'Save' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsPanel() {
  const projects = useDeveloperProjects();
  const apiKeys = useAPIKeys();
  const usage = useDeveloperUsage();
  const usageByProject = new Map(
    (usage.data?.projects ?? []).map((entry) => [entry.projectId, entry] as const),
  );
  const createProject = useCreateDeveloperProject();
  const updateProject = useUpdateDeveloperProject();
  const archiveProject = useArchiveDeveloperProject();
  const { confirm, dialog } = useConfirmAction();
  const [editor, setEditor] = useState<EditorState>(null);

  const keyCounts = new Map<string | null, number>();
  for (const key of apiKeys.data ?? []) {
    const projectId = key.project_id ?? null;
    keyCounts.set(projectId, (keyCounts.get(projectId) ?? 0) + 1);
  }

  const live = (projects.data ?? []).filter((project) => project.archivedAt === null);
  const archived = (projects.data ?? []).filter((project) => project.archivedAt !== null);

  const save = (draft: DeveloperProjectDraft) => {
    if (!editor) return;
    const onError = (error: Error) =>
      toast.error(toUserMessage(error, 'The project could not be saved.'));
    if (editor.mode === 'create') {
      createProject.mutate(draft, { onSuccess: () => setEditor(null), onError });
    } else {
      updateProject.mutate(
        { projectId: editor.project.id, patch: draft },
        { onSuccess: () => setEditor(null), onError },
      );
    }
  };

  const requestArchive = (project: DeveloperProject) => {
    const keys = keyCounts.get(project.id) ?? 0;
    confirm({
      title: `Archive ${project.name}?`,
      description:
        keys > 0
          ? translateUiPlural(
              'settings',
              'counts.archiveProjectKeys',
              keys,
              {
                one: 'Its {{value}} key is revoked, and requests made with it stop working at once. An archived project cannot be restored.',
                other:
                  'Its {{value}} keys are revoked, and requests made with them stop working at once. An archived project cannot be restored.',
              },
              { value: keys.toLocaleString() },
            )
          : 'An archived project cannot be restored, and no new key can be created in it.',
      confirmLabel: 'Archive project',
      onConfirm: async () => {
        try {
          await archiveProject.mutateAsync(project.id);
          toast.success(`${project.name} is archived.`);
        } catch (error) {
          toast.error(toUserMessage(error, 'The project could not be archived.'));
        }
      },
    });
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-foreground">Projects</CardTitle>
            <CardDescription>
              A project groups API keys, counts their usage together and can cap what they spend
              each month. Keys created without one are in the default project.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setEditor({ mode: 'create' })}
            disabled={projects.isLoading || projects.isError}
          >
            New project
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {projects.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner size="sm" aria-hidden="true" />
            Loading projects
          </div>
        ) : projects.isError ? (
          <div className="flex flex-wrap items-center gap-2 py-4">
            <p role="alert" className="text-sm text-danger">
              {toUserMessage(projects.error, 'Projects could not be loaded.')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void projects.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border" aria-label="Projects">
            <li className="flex flex-col gap-0.5 py-2.5">
              <span className="text-sm font-medium text-foreground">Default project</span>
              <span className="text-xs text-muted-foreground">
                {keyCountLabel(keyCounts.get(null) ?? 0)},{' '}
                {projectUsageLabel(usageByProject.get(null), null)}
              </span>
            </li>
            {live.map((project) => (
              <li
                key={project.id}
                className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">
                    {project.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {keyCountLabel(keyCounts.get(project.id) ?? 0)},{' '}
                    {projectUsageLabel(usageByProject.get(project.id), project.monthlyCreditLimit)}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditor({ mode: 'edit', project })}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => requestArchive(project)}
                  >
                    Archive
                  </Button>
                </div>
              </li>
            ))}
            {archived.map((project) => (
              <li key={project.id} className="flex flex-col gap-0.5 py-2.5">
                <span className="truncate text-sm text-muted-foreground">{project.name}</span>
                <span className="text-xs text-muted-foreground">
                  Archived{' '}
                  {new Date(project.archivedAt ?? project.createdAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editor ? (
        <ProjectEditor
          key={editor.mode === 'edit' ? editor.project.id : 'create'}
          state={editor}
          pending={createProject.isPending || updateProject.isPending}
          onClose={() => setEditor(null)}
          onSubmit={save}
        />
      ) : null}
      {dialog}
    </Card>
  );
}
