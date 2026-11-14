import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useForm, useFormState, type Control, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Checkbox,
  Input,
  Spinner,
  translateUiPlural,
  useConfirmAction,
} from '@agiworkforce/ui';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@shared/ui/Form';
import { Plus, Key, Copy, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  API_KEY_EXPIRY_CHOICES,
  API_KEY_EXPIRY_LABELS,
  createApiKeySchema,
  type CreateApiKeyFormData,
} from '@features/settings/schemas/settings-validation';
import {
  useAPIKeys,
  useCreateAPIKey,
  useDeleteAPIKey,
  type APIKeyMutationScope,
  APIKeyMutationRejectedError,
} from '@features/settings/hooks/use-settings-queries';
import { formatCredits } from '@agiworkforce/types';
import { useDeveloperProjects } from '@/features/developers/hooks/use-developer-projects';
import { useDeveloperUsage } from '@/features/developers/hooks/use-developer-usage';
import type { DeveloperUsageFigures } from '@/features/developers/types';
import { API_KEY_SCOPE_OPTIONS, type ApiKeyScope } from '@/lib/api-key-scopes';
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
import { StepUpCancelledError } from '@/features/auth/step-up-fetch';

const DEFAULT_PROJECT_LABEL = 'Default project';

function keyUsageLabel(usage: DeveloperUsageFigures | undefined): string {
  if (!usage || usage.requests + usage.unsettledRequests === 0) return 'No requests this month';
  const requests = translateUiPlural(
    'settings',
    'counts.usageRequests',
    usage.requests,
    { one: '{{value}} request', other: '{{value}} requests' },
    { value: usage.requests.toLocaleString() },
  );
  return `This month: ${requests}, ${formatCredits(usage.credits, { maximumFractionDigits: 2 })}`;
}

function projectLabel(
  projectId: string | null | undefined,
  projects: readonly { id: string; name: string }[],
): React.ReactNode {
  const name = projectId
    ? projects.find((project) => project.id === projectId)?.name
    : DEFAULT_PROJECT_LABEL;
  return name ? <p className="text-xs text-muted-foreground">{name}</p> : null;
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: ApiKeyScope[];
  project_id?: string | null;
  created_at: string;
  last_used_at?: string | null;
  expires_at?: string | null;
}

interface ApiKeyProject {
  id: string;
  name: string;
}

interface ApiKeysPanelProps {
  apiKeys: ApiKey[];
  projects?: readonly ApiKeyProject[];
  usageByKey?: ReadonlyMap<string, DeveloperUsageFigures> | null;
  apiKeyForm: UseFormReturn<CreateApiKeyFormData>;
  showAPIKeyDialog: boolean;
  generatedAPIKey: string;
  busy?: boolean;
  formError?: string | null;
  isCreatePending: boolean;
  isLoading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  onSetShowAPIKeyDialog: (open: boolean) => void;
  onSetKeyToDelete: (id: string | null) => void;
  onGenerateAPIKey: (data: CreateApiKeyFormData) => void;
  onCopyAPIKey: (key: string) => void;
  onDismissGeneratedKey: () => void;
}

interface ApiKeySubmitButtonProps {
  control: Control<CreateApiKeyFormData>;
  isCreatePending: boolean;
}

function ApiKeySubmitButton({ control, isCreatePending }: ApiKeySubmitButtonProps) {
  const { isValid } = useFormState({ control });

  return (
    <Button
      type="submit"
      disabled={isCreatePending || !isValid}
      className="bg-success-fill text-success-on-fill hover:brightness-95"
    >
      {isCreatePending ? (
        <Spinner size="sm" className="me-2" aria-hidden="true" />
      ) : (
        <Key className="me-2 h-4 w-4" />
      )}
      Generate Key
    </Button>
  );
}

export const ApiKeysPanel: React.FC<ApiKeysPanelProps> = ({
  apiKeys,
  projects = [],
  usageByKey = null,
  apiKeyForm,
  showAPIKeyDialog,
  generatedAPIKey,
  busy = false,
  formError = null,
  isCreatePending,
  isLoading = false,
  loadError = null,
  onRetry,
  onSetShowAPIKeyDialog,
  onSetKeyToDelete,
  onGenerateAPIKey,
  onCopyAPIKey,
  onDismissGeneratedKey,
}) => (
  <>
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground">API Keys</CardTitle>
            <CardDescription className="text-xs">
              Manage API keys for external integrations
            </CardDescription>
          </div>
          <Button
            onClick={() => onSetShowAPIKeyDialog(true)}
            className="bg-success-fill text-success-on-fill hover:brightness-95"
            size="sm"
            disabled={Boolean(loadError) || isLoading || busy}
          >
            <Plus className="me-2 h-4 w-4" />
            New Key
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner size="sm" aria-hidden="true" />
              Loading API keys...
            </div>
          ) : loadError ? (
            <div className="space-y-3 py-6 text-center">
              <p role="alert" className="text-sm text-danger">
                {loadError}
              </p>
              {onRetry ? (
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  <RefreshCw className="me-2 h-4 w-4" />
                  Retry
                </Button>
              ) : null}
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Key className="mx-auto mb-2 h-12 w-12 opacity-50" />
              <p>No API keys yet</p>
              <p className="text-sm">Generate your first API key to get started</p>
            </div>
          ) : (
            apiKeys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="flex items-center justify-between rounded-lg border border-border bg-accent/50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{apiKey.name}</p>
                  <p className="font-mono text-sm text-muted-foreground">{apiKey.key_prefix}...</p>
                  {projectLabel(apiKey.project_id, projects)}
                  {usageByKey ? (
                    <p className="text-xs text-muted-foreground">
                      {keyUsageLabel(usageByKey.get(apiKey.id))}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {apiKey.scopes
                      .map(
                        (scope) =>
                          API_KEY_SCOPE_OPTIONS.find((option) => option.value === scope)?.label ??
                          scope,
                      )
                      .join(' · ')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Created: {new Date(apiKey.created_at).toLocaleDateString()}
                    {apiKey.last_used_at &&
                      ` - Last used: ${new Date(apiKey.last_used_at).toLocaleDateString()}`}
                    {apiKey.expires_at
                      ? ` - ${new Date(apiKey.expires_at).getTime() <= Date.now() ? 'Expired' : 'Expires'}: ${new Date(apiKey.expires_at).toLocaleDateString()}`
                      : ' - Never expires'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSetKeyToDelete(apiKey.id)}
                    disabled={busy}
                    aria-label={`Delete ${apiKey.name}`}
                    className="text-danger hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>

    {/* API Key Generation Dialog */}
    <AlertDialog open={showAPIKeyDialog} onOpenChange={onSetShowAPIKeyDialog}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] border-border bg-popover p-4 sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">
            {generatedAPIKey ? 'API Key Generated' : 'Generate New API Key'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="min-w-0 text-muted-foreground">
              {generatedAPIKey ? (
                <div className="space-y-4">
                  <p className="text-warning-text">
                    <AlertTriangle className="me-2 inline h-4 w-4" />
                    Save this key now. You will not be able to see it again!
                  </p>
                  <div className="break-all rounded-compact border border-border bg-background/50 p-3 font-mono text-sm text-success-text">
                    {generatedAPIKey}
                  </div>
                  <Button onClick={() => onCopyAPIKey(generatedAPIKey)} className="w-full">
                    <Copy className="me-2 h-4 w-4" />
                    Copy to Clipboard
                  </Button>
                </div>
              ) : (
                <Form {...apiKeyForm}>
                  <form
                    onSubmit={apiKeyForm.handleSubmit(onGenerateAPIKey)}
                    className="space-y-4 pt-4"
                  >
                    <FormField
                      control={apiKeyForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Key Name</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="e.g., Production API"
                              className="border-border bg-background text-foreground"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            A descriptive name to identify this API key
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={apiKeyForm.control}
                      name="scopes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Scopes</FormLabel>
                          <FormDescription className="text-xs">
                            Choose only the public API capabilities this key needs.
                          </FormDescription>
                          <div className="space-y-3 rounded-md border border-border p-3">
                            {API_KEY_SCOPE_OPTIONS.map((option) => (
                              <label
                                key={option.value}
                                className="flex cursor-pointer items-start gap-3"
                              >
                                <Checkbox
                                  checked={field.value.includes(option.value)}
                                  onCheckedChange={(checked) => {
                                    field.onChange(
                                      checked === true
                                        ? [...field.value, option.value]
                                        : field.value.filter((scope) => scope !== option.value),
                                    );
                                  }}
                                />
                                <span>
                                  <span className="block text-sm font-medium text-foreground">
                                    {option.label}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    {option.description}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={apiKeyForm.control}
                      name="projectId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Project</FormLabel>
                          <FormControl>
                            <select
                              value={field.value ?? ''}
                              onChange={(event) => field.onChange(event.target.value || null)}
                              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                            >
                              <option value="">{DEFAULT_PROJECT_LABEL}</option>
                              {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                  {project.name}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormDescription className="text-xs">
                            Usage counts toward this project. A key cannot move projects later.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={apiKeyForm.control}
                      name="expiresInDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Expires</FormLabel>
                          <FormControl>
                            <select
                              value={field.value ?? 'never'}
                              onChange={(event) => field.onChange(event.target.value)}
                              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                            >
                              {API_KEY_EXPIRY_CHOICES.map((choice) => (
                                <option key={choice} value={choice}>
                                  {API_KEY_EXPIRY_LABELS[choice]}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormDescription className="text-xs">
                            Expired keys are refused. You can revoke a key any time.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {formError ? (
                      <p role="alert" className="text-sm text-danger">
                        {formError}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          onSetShowAPIKeyDialog(false);
                        }}
                        className="border-border bg-secondary text-foreground hover:bg-secondary/80"
                      >
                        Cancel
                      </Button>
                      <ApiKeySubmitButton
                        control={apiKeyForm.control}
                        isCreatePending={isCreatePending}
                      />
                    </div>
                  </form>
                </Form>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {generatedAPIKey && (
          <AlertDialogFooter>
            <AlertDialogAction onClick={onDismissGeneratedKey}>Done</AlertDialogAction>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  </>
);

const DEFAULT_API_KEY_FORM: CreateApiKeyFormData = {
  name: '',
  scopes: ['models:read', 'inference:write'],
  expiresInDays: 'never',
  projectId: null,
};

type KeyIntent = {
  id: number;
  generation: object;
  scope: APIKeyMutationScope;
  keyId: string | null;
  phase: 'editing' | 'confirming' | 'writing' | 'receipt' | 'done';
  dispatched: boolean;
  copying: boolean;
  release: () => void;
};
type KeyView = {
  intent: KeyIntent | null;
  secret: string;
  error: string | null;
  notice: string | null;
};
const EMPTY_VIEW: KeyView = { intent: null, secret: '', error: null, notice: null };
const UNCERTAIN =
  'We could not confirm whether this API key action completed. Refresh API keys before repeating it. A generated secret cannot be recovered.';

function IntentFormPanel(props: Omit<ApiKeysPanelProps, 'apiKeyForm'>) {
  const apiKeyForm = useForm<CreateApiKeyFormData>({
    resolver: zodResolver(createApiKeySchema),
    mode: 'onChange',
    defaultValues: { ...DEFAULT_API_KEY_FORM, scopes: [...DEFAULT_API_KEY_FORM.scopes] },
  });
  return <ApiKeysPanel {...props} apiKeyForm={apiKeyForm} />;
}

function OwnedApiKeysManager({
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
  const { data: apiKeys = [], isLoading, isError, error, refetch } = useAPIKeys();
  const projectQuery = useDeveloperProjects();
  const usageQuery = useDeveloperUsage();
  const projects = projectQuery.isSuccess ? (projectQuery.data ?? []) : [];
  const usage = usageQuery.isSuccess ? usageQuery.data : undefined;
  const createMutation = useCreateAPIKey();
  const deleteMutation = useDeleteAPIKey();
  const { confirm, dialog } = useConfirmAction();
  const lane = useMemo(
    () => ({
      active: false,
      generation: {} as object,
      nextId: 0,
      intent: null as KeyIntent | null,
      lastCreate: null as KeyIntent | null,
      snapshot: null as object | null,
      secret: '',
    }),
    [],
  );
  const [view, setView] = useState<KeyView>(EMPTY_VIEW);
  const ownerCurrent = useCallback(
    () =>
      owner.phase === 'admitted' &&
      owner.scopeKey === scopeKey &&
      workspaceOwnerIsCurrent(owner, epoch),
    [owner, epoch, scopeKey],
  );
  const current = (intent: KeyIntent) =>
    lane.active &&
    lane.generation === intent.generation &&
    lane.intent === intent &&
    ownerCurrent();
  const snapshot = useMemo(
    () => Object.assign({}, { binding: { apiKeys, isError, isLoading } }),
    [apiKeys, isLoading, isError],
  );
  useLayoutEffect(() => {
    lane.snapshot = snapshot;
  }, [lane, snapshot]);
  const resetCreate = createMutation.reset;
  useLayoutEffect(() => {
    lane.active = true;
    lane.generation = {};
    setView(EMPTY_VIEW);
    const retire = () => {
      lane.active = false;
      lane.intent?.release();
      lane.intent?.scope.request.retire();
      lane.intent = null;
      lane.secret = '';
      lane.lastCreate = null;
      resetCreate();
    };
    const stop = subscribeWorkspaceAdmission(() => {
      if (!ownerCurrent()) {
        retire();
        setView(EMPTY_VIEW);
      }
    });
    return () => {
      stop();
      retire();
    };
  }, [lane, ownerCurrent, resetCreate]);
  const finish = (intent: KeyIntent, error: string | null = null, notice: string | null = null) => {
    if (!current(intent)) return;
    intent.phase = 'done';
    intent.release();
    intent.scope.request.retire();
    lane.intent = null;
    lane.secret = '';
    if (lane.lastCreate === intent) resetCreate();
    setView({ ...EMPTY_VIEW, error, notice });
  };
  const close = (intent: KeyIntent) =>
    finish(intent, null, intent.phase === 'writing' && intent.dispatched ? UNCERTAIN : null);
  const open = (keyId: string | null) => {
    if (
      !lane.active ||
      !ownerCurrent() ||
      lane.intent ||
      lane.snapshot !== snapshot ||
      isLoading ||
      isError
    )
      return null;
    let captured: KeyIntent | null = null;
    const request = createRequestAuthority(
      owner.session,
      () =>
        captured === null
          ? lane.active && ownerCurrent() && lane.intent === null
          : current(captured),
      () => {
        if (!captured || captured.phase !== 'writing')
          throw new Error('The API key action is no longer ready.');
        captured.dispatched = true;
      },
    );
    const intent: KeyIntent = {
      id: ++lane.nextId,
      generation: lane.generation,
      keyId,
      phase: keyId ? 'confirming' : 'editing',
      dispatched: false,
      copying: false,
      release: () => undefined,
      scope: {
        request,
        organizationId,
        onStepUpRequired: () => {
          if (current(intent) && intent.phase === 'writing') intent.dispatched = false;
        },
      },
    };
    captured = intent;
    lane.intent = intent;
    setView({ ...EMPTY_VIEW, intent });
    intent.release =
      owner.session.subscribe?.(() => {
        if (lane.intent !== intent || ownerCurrent()) return;
        intent.release();
        intent.scope.request.retire();
        lane.intent = null;
        lane.secret = '';
        if (lane.lastCreate === intent) {
          lane.lastCreate = null;
          resetCreate();
        }
        setView(EMPTY_VIEW);
      }) ?? (() => undefined);
    if (lane.intent !== intent) {
      intent.release();
      return null;
    }
    return intent;
  };
  const generate = async (intent: KeyIntent, data: CreateApiKeyFormData) => {
    if (!current(intent) || intent.phase !== 'editing' || intent.keyId !== null) return;
    const draft = { ...data, scopes: [...data.scopes] };
    intent.phase = 'writing';
    intent.dispatched = false;
    lane.lastCreate = intent;
    setView({ ...EMPTY_VIEW, intent });
    try {
      const result = await createMutation.mutateAsync({ scope: intent.scope, draft });
      if (!current(intent) || !intent.scope.request.isCurrent()) return;
      intent.phase = 'receipt';
      lane.secret = result.fullKey;
      setView({ ...EMPTY_VIEW, intent, secret: result.fullKey });
    } catch (error) {
      if (!current(intent)) return;
      if (intent.dispatched && !(error instanceof APIKeyMutationRejectedError)) {
        finish(intent, null, UNCERTAIN);
      } else {
        intent.phase = 'editing';
        intent.dispatched = false;
        setView({
          ...EMPTY_VIEW,
          intent,
          error:
            error instanceof StepUpCancelledError
              ? null
              : toUserMessage(
                  error,
                  'The API key could not be created. Check the details and try again.',
                ),
        });
      }
    } finally {
      if (lane.lastCreate === intent) resetCreate();
    }
  };
  const requestDelete = (keyId: string) => {
    const intent = open(keyId);
    if (!intent) return;
    confirm({
      title: 'Delete API Key',
      description:
        'Requests made with this key are refused from now on, so any application using it stops working. A deleted key cannot be restored.',
      confirmLabel: 'Delete Key',
      onCancel: () => {
        if (intent.phase === 'confirming') finish(intent);
      },
      onConfirm: async () => {
        if (!current(intent) || intent.phase !== 'confirming') return;
        intent.phase = 'writing';
        setView({ ...EMPTY_VIEW, intent });
        try {
          await deleteMutation.mutateAsync({ scope: intent.scope, keyId });
          if (!current(intent) || !intent.scope.request.isCurrent()) return;
          toast.success('API key deleted');
          finish(intent);
        } catch (error) {
          if (!current(intent)) return;
          if (intent.dispatched && !(error instanceof APIKeyMutationRejectedError))
            finish(intent, null, UNCERTAIN);
          else finish(intent, toUserMessage(error, 'The API key could not be deleted. Try again.'));
        }
      },
    });
  };
  const copy = async (intent: KeyIntent, secret: string) => {
    const canCopy = () => current(intent) && intent.phase === 'receipt' && lane.secret === secret;
    if (!canCopy() || intent.copying) return;
    intent.copying = true;
    try {
      await navigator.clipboard.writeText(secret);
      if (canCopy()) toast.success('API key copied to clipboard');
    } catch {
      if (canCopy()) toast.error('Could not copy the API key');
    } finally {
      intent.copying = false;
    }
  };
  const intent = view.intent;
  const readCurrent = () => lane.active && ownerCurrent() && lane.snapshot === snapshot;

  return (
    <>
      {projectQuery.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading project choices
        </p>
      ) : projectQuery.isError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-danger">
            {toUserMessage(projectQuery.error, 'Project choices could not be loaded.')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (readCurrent()) void projectQuery.refetch();
            }}
          >
            Retry project choices
          </Button>
        </div>
      ) : null}
      {usageQuery.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading key usage
        </p>
      ) : usageQuery.isError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-danger">
            {toUserMessage(usageQuery.error, 'Key usage could not be loaded.')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (readCurrent()) void usageQuery.refetch();
            }}
          >
            Retry key usage
          </Button>
        </div>
      ) : null}
      {(!intent || intent.keyId !== null) && (view.error || view.notice) ? (
        <p role={view.error ? 'alert' : 'status'}>{view.error ?? view.notice}</p>
      ) : null}
      {view.notice ? (
        <Button
          onClick={() => {
            if (readCurrent() && !lane.intent) void refetch();
          }}
        >
          Refresh API keys
        </Button>
      ) : null}
      <IntentFormPanel
        key={intent?.id ?? 'idle'}
        apiKeys={apiKeys}
        projects={projects.filter((project) => project.archivedAt === null)}
        usageByKey={
          usage ? new Map(usage.keys.map((entry) => [entry.apiKeyId, entry] as const)) : null
        }
        showAPIKeyDialog={!!intent && intent.keyId === null}
        generatedAPIKey={view.secret}
        busy={!!intent}
        formError={view.error}
        isCreatePending={intent?.phase === 'writing'}
        isLoading={isLoading}
        loadError={isError ? toUserMessage(error, 'Unable to load API keys. Try again.') : null}
        onRetry={() => {
          if (readCurrent()) void refetch();
        }}
        onSetShowAPIKeyDialog={(isOpen) => {
          if (isOpen) open(null);
          else if (intent) close(intent);
        }}
        onSetKeyToDelete={(id) => {
          if (id) requestDelete(id);
        }}
        onGenerateAPIKey={(draft) => {
          if (intent) void generate(intent, draft);
        }}
        onCopyAPIKey={(secret) => {
          if (intent) void copy(intent, secret);
        }}
        onDismissGeneratedKey={() => {
          if (intent) close(intent);
        }}
      />
      {intent?.keyId && intent.phase === 'confirming' ? dialog : null}
      {intent?.keyId && intent.phase === 'writing' ? (
        <div>
          <p role="status">Deleting API key…</p>
          <Button type="button" variant="outline" onClick={() => close(intent)}>
            Cancel waiting
          </Button>
        </div>
      ) : null}
      {createMutation.stepUpDialog}
    </>
  );
}

export function ApiKeysManager() {
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
          <CardTitle>API Keys</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            {workspace.requiresReload
              ? 'Reload this page to confirm the current workspace before managing API keys.'
              : 'Your current workspace must finish loading before you can manage API keys.'}
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
    <OwnedApiKeysManager
      key={`${owner.incarnation}:${owner.epoch}:${scopeKey}`}
      owner={owner}
      epoch={owner.epoch}
      scopeKey={scopeKey}
      organizationId={data.activeOrganizationId}
    />
  );
}
