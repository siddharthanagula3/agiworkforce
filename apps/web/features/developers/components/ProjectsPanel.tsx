'use client';

import { useCallback, useId, useLayoutEffect, useMemo, useState } from 'react';
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
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  observeWorkspaceOwner,
  subscribeWorkspaceAdmission,
  workspaceOwnerIsCurrent,
  type WorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';

import {
  useArchiveDeveloperProject,
  useCreateDeveloperProject,
  useDeveloperProjects,
  useUpdateDeveloperProject,
  ProjectMutationRejectedError,
  type ProjectMutationScope,
  type DeveloperProjectDraft,
} from '../hooks/use-developer-projects';
import { useDeveloperUsage } from '../hooks/use-developer-usage';
import type { DeveloperProject, DeveloperUsageFigures } from '../types';

const NAME_MAX = 100;

type EditorState = { mode: 'create' } | { mode: 'edit'; project: DeveloperProject } | null;

type ProjectIntent = {
  id: number;
  generation: object;
  scope: ProjectMutationScope;
  editor: Exclude<EditorState, null> | null;
  phase: 'editing' | 'confirming' | 'writing' | 'done';
  dispatched: boolean;
};
type View = { intent: ProjectIntent | null; error: string | null; notice: string | null };
const EMPTY: View = { intent: null, error: null, notice: null };
const UNCERTAIN =
  'We could not confirm whether the project was updated. Check the project state before repeating this action.';

type LimitField = { valid: true; limit: number | null } | { valid: false };

function parseLimit(value: string): LimitField {
  const trimmed = value.trim();
  if (trimmed === '') return { valid: true, limit: null };
  const limit = Number(trimmed);
  return Number.isInteger(limit) && limit > 0 ? { valid: true, limit } : { valid: false };
}

function keyCountLabel(count: number, status: 'loading' | 'unavailable' | 'ready'): string {
  if (status === 'loading') return 'Loading key count';
  if (status === 'unavailable') return 'Key count unavailable';
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
  status: 'loading' | 'unavailable' | 'ready',
): string {
  if (status === 'loading') return 'Loading usage';
  if (status === 'unavailable') return 'Usage unavailable';
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
  error,
}: {
  state: Exclude<EditorState, null>;
  pending: boolean;
  error: string | null;
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
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
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

function OwnedProjectsPanel({
  owner,
  epoch,
  scopeKey,
  organizationId,
}: {
  owner: WorkspaceOwner;
  epoch: number;
  scopeKey: string;
  organizationId: string | null;
}) {
  const projects = useDeveloperProjects();
  const apiKeys = useAPIKeys();
  const usage = useDeveloperUsage();
  const keyStatus = apiKeys.isLoading
    ? 'loading'
    : apiKeys.isError || !apiKeys.data
      ? 'unavailable'
      : 'ready';
  const usageStatus = usage.isLoading
    ? 'loading'
    : usage.isError || !usage.data
      ? 'unavailable'
      : 'ready';
  const usageByProject = new Map(
    (usage.data?.projects ?? []).map((entry) => [entry.projectId, entry] as const),
  );
  const createProject = useCreateDeveloperProject();
  const updateProject = useUpdateDeveloperProject();
  const archiveProject = useArchiveDeveloperProject();
  const { confirm, dialog } = useConfirmAction();
  const lane = useMemo(
    () => ({
      active: false,
      nextIntentId: 0,
      generation: {} as object,
      intent: null as ProjectIntent | null,
      snapshot: null as object | null,
    }),
    [],
  );
  const [view, setView] = useState<View>(EMPTY);
  const ownerCurrent = useCallback(
    () =>
      owner.phase === 'admitted' &&
      owner.scopeKey === scopeKey &&
      workspaceOwnerIsCurrent(owner, epoch),
    [owner, epoch, scopeKey],
  );
  const current = (intent: ProjectIntent) =>
    lane.active &&
    lane.generation === intent.generation &&
    lane.intent === intent &&
    ownerCurrent();
  const snapshot = useMemo(
    () => ({}),
    [projects.data, projects.isLoading, projects.isError, apiKeys.data, keyStatus],
  );
  useLayoutEffect(() => {
    lane.snapshot = snapshot;
  }, [lane, snapshot]);
  useLayoutEffect(() => {
    lane.active = true;
    lane.generation = {};
    setView(EMPTY);
    const retire = () => {
      lane.active = false;
      lane.intent?.scope.request.retire();
      lane.intent = null;
    };
    const stop = subscribeWorkspaceAdmission(() => {
      if (!ownerCurrent()) {
        retire();
        setView(EMPTY);
      }
    });
    return () => {
      stop();
      retire();
    };
  }, [lane, ownerCurrent]);
  const finish = (
    intent: ProjectIntent,
    error: string | null = null,
    notice: string | null = null,
  ) => {
    if (!current(intent)) return;
    intent.phase = 'done';
    intent.scope.request.retire();
    lane.intent = null;
    setView({ intent: null, error, notice });
  };
  const openIntent = (editor: ProjectIntent['editor']) => {
    if (
      !lane.active ||
      !ownerCurrent() ||
      lane.intent ||
      lane.snapshot !== snapshot ||
      projects.isLoading ||
      projects.isError ||
      !projects.data
    )
      return null;
    let intent: ProjectIntent;
    const request = createRequestAuthority(
      owner.session,
      () => current(intent),
      () => {
        if (intent.phase !== 'writing') throw new Error('The project action is no longer ready.');
        intent.dispatched = true;
      },
    );
    const capturedEditor =
      editor?.mode === 'edit' ? { mode: 'edit' as const, project: { ...editor.project } } : editor;
    intent = {
      id: ++lane.nextIntentId,
      generation: lane.generation,
      scope: { request, organizationId },
      editor: capturedEditor,
      phase: editor ? 'editing' : 'confirming',
      dispatched: false,
    };
    lane.intent = intent;
    setView({ ...EMPTY, intent });
    return intent;
  };
  const closeEditor = (intent: ProjectIntent) => {
    finish(intent, null, intent.dispatched ? UNCERTAIN : null);
  };
  const editor = view.intent?.editor ?? null;

  const keyCounts = new Map<string | null, number>();
  for (const key of apiKeys.data ?? []) {
    const projectId = key.project_id ?? null;
    keyCounts.set(projectId, (keyCounts.get(projectId) ?? 0) + 1);
  }

  const live = (projects.data ?? []).filter((project) => project.archivedAt === null);
  const archived = (projects.data ?? []).filter((project) => project.archivedAt !== null);

  const save = async (intent: ProjectIntent, draft: DeveloperProjectDraft) => {
    if (!current(intent) || intent.phase !== 'editing' || !intent.editor) return;
    intent.phase = 'writing';
    intent.dispatched = false;
    setView({ ...EMPTY, intent });
    try {
      if (intent.editor.mode === 'create') {
        await createProject.mutateAsync({ scope: intent.scope, draft });
      } else {
        await updateProject.mutateAsync({
          scope: intent.scope,
          projectId: intent.editor.project.id,
          patch: draft,
        });
      }
      if (!intent.scope.request.isCurrent()) return;
      finish(intent);
    } catch (error) {
      if (!current(intent)) return;
      if (intent.dispatched && !(error instanceof ProjectMutationRejectedError)) {
        finish(intent, null, UNCERTAIN);
      } else {
        intent.phase = 'editing';
        intent.dispatched = false;
        setView({
          intent,
          notice: null,
          error: toUserMessage(
            error,
            'The project could not be saved. Check the details and try again.',
          ),
        });
      }
    }
  };

  const requestArchive = (project: DeveloperProject) => {
    if (keyStatus !== 'ready') return;
    const intent = openIntent(null);
    if (!intent) return;
    const projectId = project.id;
    const projectName = project.name;
    const keys = keyCounts.get(projectId) ?? 0;
    confirm({
      title: `Archive ${projectName}?`,
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
      onCancel: () => {
        if (intent.phase === 'confirming') finish(intent);
      },
      onConfirm: async () => {
        if (!current(intent) || intent.phase !== 'confirming') return;
        intent.phase = 'writing';
        setView({ ...EMPTY, intent });
        try {
          await archiveProject.mutateAsync({ scope: intent.scope, projectId });
          if (!intent.scope.request.isCurrent()) return;
          toast.success(`${projectName} is archived.`);
          finish(intent);
        } catch (error) {
          if (!current(intent)) return;
          if (intent.dispatched && !(error instanceof ProjectMutationRejectedError)) {
            finish(intent, null, UNCERTAIN);
          } else {
            finish(intent, toUserMessage(error, 'The project could not be archived. Try again.'));
          }
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
            onClick={() => openIntent({ mode: 'create' })}
            disabled={projects.isLoading || projects.isError || !!view.intent}
          >
            New project
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!editor && (view.error || view.notice) ? (
          <p role={view.error ? 'alert' : 'status'} className="mb-3 text-sm">
            {view.error ?? view.notice}
          </p>
        ) : null}
        {view.notice ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mb-3"
            disabled={projects.isFetching}
            onClick={() => {
              if (!lane.active || !ownerCurrent() || lane.intent || lane.snapshot !== snapshot)
                return;
              void projects.refetch();
            }}
          >
            Refresh projects
          </Button>
        ) : null}
        {apiKeys.isError ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p role="alert" className="text-xs text-danger">
              {toUserMessage(apiKeys.error, 'Key counts could not be loaded.')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void apiKeys.refetch()}
            >
              Retry key counts
            </Button>
          </div>
        ) : null}
        {usage.isError ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p role="alert" className="text-xs text-danger">
              {toUserMessage(usage.error, 'Usage could not be loaded.')}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void usage.refetch()}>
              Retry usage
            </Button>
          </div>
        ) : null}
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
                {keyCountLabel(keyCounts.get(null) ?? 0, keyStatus)},{' '}
                {projectUsageLabel(usageByProject.get(null), null, usageStatus)}
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
                    {keyCountLabel(keyCounts.get(project.id) ?? 0, keyStatus)},{' '}
                    {projectUsageLabel(
                      usageByProject.get(project.id),
                      project.monthlyCreditLimit,
                      usageStatus,
                    )}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!!view.intent}
                    onClick={() => openIntent({ mode: 'edit', project })}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={keyStatus !== 'ready' || !!view.intent}
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
      {editor && view.intent ? (
        <ProjectEditor
          key={view.intent.id}
          state={editor}
          pending={view.intent.phase === 'writing'}
          error={view.error}
          onClose={() => closeEditor(view.intent!)}
          onSubmit={(draft) => {
            void save(view.intent!, draft);
          }}
        />
      ) : null}
      {view.intent && !editor ? dialog : null}
    </Card>
  );
}

export function ProjectsPanel() {
  const workspace = useAccountWorkspaces();
  const capture = useSessionSnapshot();
  const owner = observeWorkspaceOwner(capture());
  const data = workspace.data;
  const scopeKey = data
    ? JSON.stringify([data.scope, data.activeWorkspaceId, data.activeOrganizationId])
    : null;
  if (
    !owner ||
    owner.phase !== 'admitted' ||
    !data ||
    scopeKey === null ||
    owner.scopeKey !== scopeKey ||
    !workspaceOwnerIsCurrent(owner, owner.epoch)
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            {workspace.requiresReload
              ? 'Reload this page to confirm the current workspace before managing projects.'
              : 'Your current workspace must finish loading before you can manage projects.'}
          </p>
          {workspace.isUnavailable && !workspace.requiresReload && !workspace.isSwitching ? (
            <Button
              onClick={() => {
                void workspace.refetch();
              }}
            >
              Retry loading workspace
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }
  return (
    <OwnedProjectsPanel
      key={`${owner.incarnation}:${owner.epoch}:${scopeKey}`}
      owner={owner}
      epoch={owner.epoch}
      scopeKey={scopeKey}
      organizationId={data.activeOrganizationId}
    />
  );
}
