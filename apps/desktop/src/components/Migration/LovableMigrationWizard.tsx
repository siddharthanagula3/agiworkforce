import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Badge } from '../ui/Badge';
import { Separator } from '../ui/Separator';
import { Switch } from '../ui/Switch';
import { ScrollArea } from '../ui/ScrollArea';
import { cn } from '../../lib/utils';
import {
  launchLovableMigration,
  listLovableWorkflows,
  testLovableConnection,
} from '../../api/migration';
import type {
  LovableConnectionResponse,
  LovableMigrationLaunchRequest,
  LovableMigrationLaunchResponse,
  LovableWorkflow,
  LovableWorkflowStatus,
} from '../../types/migration';

type WizardStep = 'connect' | 'select' | 'configure' | 'review';

const LOVABLE_MILESTONES = [
  {
    label: 'Day 0-15',
    description: 'Audit Lovable gaps, capture top 200 workflows, prep migration scripts.',
  },
  {
    label: 'Day 16-45',
    description: 'Ship parity MCPs, deliver migration wizard, onboard alpha Lovable teams.',
  },
  {
    label: 'Day 46-90',
    description: 'Automation marketplace launch, Scale tier billing, concierge migrations.',
  },
  {
    label: 'Day 91-150',
    description: '$100M ARR run-rate, Lovable displacement outbound, enterprise control plane.',
  },
];

const DEFAULT_WORKFLOWS: LovableWorkflow[] = [
  {
    id: 'wf-accural',
    name: 'Monthly Accrual Journal',
    owner: 'Finance Ops',
    lastRun: 'Oct 26 • 08:41',
    status: 'healthy',
    estimatedMinutes: 6,
  },
  {
    id: 'wf-ticket-routing',
    name: 'CS Ticket Routing',
    owner: 'Support Automation',
    lastRun: 'Oct 26 • 05:12',
    status: 'healthy',
    estimatedMinutes: 4,
  },
  {
    id: 'wf-salesforce-sync',
    name: 'Salesforce → HubSpot Sync',
    owner: 'RevOps',
    lastRun: 'Oct 25 • 21:05',
    status: 'broken',
    estimatedMinutes: 12,
  },
  {
    id: 'wf-google-sheets',
    name: 'Daily Metrics Sheet',
    owner: 'Analytics',
    lastRun: 'Oct 25 • 18:32',
    status: 'deprecated',
    estimatedMinutes: 3,
  },
];

const STEP_ORDER: WizardStep[] = ['connect', 'select', 'configure', 'review'];

const StepIndicator = ({
  label,
  description,
  status,
  onSelect,
}: {
  label: string;
  description: string;
  status: 'complete' | 'current' | 'upcoming';
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={cn(
      'w-full rounded-lg border px-4 py-3 text-left transition-colors',
      status === 'current' && 'border-primary bg-primary/5',
      status === 'complete' && 'border-emerald-500/60 bg-emerald-50 text-emerald-900',
      status === 'upcoming' && 'border-border/70 bg-muted/40 hover:bg-muted',
    )}
  >
    <div className="flex items-center gap-2">
      {status === 'complete' ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      ) : status === 'current' ? (
        <Sparkles className="h-4 w-4 text-primary" />
      ) : (
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-sm font-semibold">{label}</span>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">{description}</p>
  </button>
);

const STATUS_BADGES: Record<LovableWorkflowStatus, { label: string; className: string }> = {
  healthy: { label: 'Healthy', className: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  broken: { label: 'Needs Attention', className: 'bg-amber-100 text-amber-900 border-amber-200' },
  deprecated: { label: 'Deprecated', className: 'bg-slate-200 text-slate-700 border-slate-300' },
};

export function LovableMigrationWizard() {
  const [activeStep, setActiveStep] = useState<WizardStep>('connect');
  const [apiKey, setApiKey] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'testing' | 'passed' | 'failed'
  >('idle');
  const [connectionInfo, setConnectionInfo] = useState<LovableConnectionResponse | null>(null);
  const [workflows, setWorkflows] = useState<LovableWorkflow[]>(DEFAULT_WORKFLOWS);
  const [workflowsSource, setWorkflowsSource] = useState<'fallback' | 'api'>('fallback');
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>(
    DEFAULT_WORKFLOWS.filter((workflow) => workflow.status === 'healthy').map(
      (workflow) => workflow.id,
    ),
  );
  const [targetWorkspace, setTargetWorkspace] = useState('Finance Automation Hub');
  const [namingPrefix, setNamingPrefix] = useState('Lovable → AGI');
  const [autoEnableSchedules, setAutoEnableSchedules] = useState(true);
  const [includeAuditLogs, setIncludeAuditLogs] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [importResult, setImportResult] = useState<LovableMigrationLaunchResponse | null>(null);

  const stepStatuses = useMemo(() => {
    return STEP_ORDER.map<
      ['connect' | 'select' | 'configure' | 'review', 'complete' | 'current' | 'upcoming']
    >((step) => {
      if (STEP_ORDER.indexOf(step) < STEP_ORDER.indexOf(activeStep)) {
        return [step, 'complete'];
      }
      if (step === activeStep) {
        return [step, 'current'];
      }
      return [step, 'upcoming'];
    });
  }, [activeStep]);

  const selectedWorkflowDetails = useMemo(
    () => workflows.filter((workflow) => selectedWorkflows.includes(workflow.id)),
    [workflows, selectedWorkflows],
  );

  const updateSelectedWorkflows = (list: LovableWorkflow[]) => {
    const healthy = list
      .filter((workflow) => workflow.status === 'healthy')
      .map((workflow) => workflow.id);
    if (healthy.length > 0) {
      setSelectedWorkflows(healthy);
    } else {
      setSelectedWorkflows(list.map((workflow) => workflow.id));
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim() || !workspaceSlug.trim()) {
      toast.error('Please provide both the Lovable API key and workspace slug.');
      return;
    }

    setConnectionStatus('testing');
    setLoadingWorkflows(false);
    try {
      const response = await testLovableConnection({
        apiKey: apiKey.trim(),
        workspaceSlug: workspaceSlug.trim(),
      });
      setConnectionInfo(response);
      setConnectionStatus('passed');
      toast.success(`Connected to ${response.workspaceName}.`);
      setActiveStep('select');
      setLoadingWorkflows(true);
      const listResponse = await listLovableWorkflows(workspaceSlug.trim());
      if (listResponse.workflows.length > 0) {
        setWorkflows(listResponse.workflows);
        setWorkflowsSource('api');
        updateSelectedWorkflows(listResponse.workflows);
      } else {
        setWorkflows(DEFAULT_WORKFLOWS);
        setWorkflowsSource('fallback');
        updateSelectedWorkflows(DEFAULT_WORKFLOWS);
        toast.info(
          'No workflows returned from Lovable. Loaded sample workflows to continue planning.',
        );
      }
    } catch (error) {
      console.error('[LovableMigrationWizard] connection failed', error);
      setConnectionStatus('failed');
      setWorkflows(DEFAULT_WORKFLOWS);
      setWorkflowsSource('fallback');
      updateSelectedWorkflows(DEFAULT_WORKFLOWS);
      toast.error('Connection failed. Validate your API key or workspace slug.');
    } finally {
      setLoadingWorkflows(false);
    }
  };

  const toggleWorkflow = (id: string) => {
    setSelectedWorkflows((current) =>
      current.includes(id) ? current.filter((workflowId) => workflowId !== id) : [...current, id],
    );
  };

  const selectHealthyWorkflows = () => {
    const healthy = workflows
      .filter((workflow) => workflow.status === 'healthy')
      .map((workflow) => workflow.id);
    setSelectedWorkflows(healthy);
  };

  const handleImport = async () => {
    if (!workspaceSlug.trim()) {
      toast.error('Lovable workspace slug missing.');
      return;
    }
    if (!targetWorkspace.trim()) {
      toast.error('Target workspace name is required.');
      return;
    }
    if (selectedWorkflows.length === 0) {
      toast.error('Select at least one workflow to migrate.');
      return;
    }

    setImporting(true);
    try {
      const trimmedNamingPrefix = namingPrefix.trim();
      const migrationRequest: LovableMigrationLaunchRequest = {
        workspaceSlug: workspaceSlug.trim(),
        targetWorkspace: targetWorkspace.trim(),
        autoEnableSchedules,
        includeAuditLogs,
        workflowIds: selectedWorkflows,
      };

      if (trimmedNamingPrefix) {
        migrationRequest.namingPrefix = trimmedNamingPrefix;
      }

      const response = await launchLovableMigration(migrationRequest);
      setImportResult(response);
      setImportComplete(true);
      toast.success(
        `Queued ${response.queued} workflow${response.queued === 1 ? '' : 's'} for migration. ETA ≈ ${response.estimateMinutes} mins.`,
      );
    } catch (error) {
      console.error('[LovableMigrationWizard] failed to launch migration', error);
      toast.error('Failed to queue migration. Please retry or contact concierge.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b border-border/70 px-6 py-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Lovable Migration Wizard</h1>
            <p className="text-sm text-muted-foreground">
              Import Lovable workflows, map automation primitives, and launch migrations that feed
              the $100M ARR displacement program.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            SOC 2 prep in progress • Migration SLA 24h • Concierge support included
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-80 border-r border-border/70 bg-muted/40 p-4 lg:block">
          <div className="space-y-3">
            {stepStatuses.map(([step, status]) => (
              <StepIndicator
                key={step}
                label={
                  step === 'connect'
                    ? '1. Connect Lovable'
                    : step === 'select'
                      ? '2. Select Workflows'
                      : step === 'configure'
                        ? '3. Configure Mapping'
                        : '4. Review & Import'
                }
                description={
                  step === 'connect'
                    ? 'Authorize Lovable workspace, test API access.'
                    : step === 'select'
                      ? 'Choose workflows to migrate and assess health.'
                      : step === 'configure'
                        ? 'Map owners, prefixes, and scheduling rules.'
                        : 'Finalize migration batch and launch imports.'
                }
                status={status}
                onSelect={() => setActiveStep(step)}
              />
            ))}
          </div>

          <Separator className="my-6" />

          <div className="space-y-4">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Hypergrowth Roadmap
              </h2>
              <div className="mt-3 space-y-3">
                {LOVABLE_MILESTONES.map((milestone) => (
                  <Card key={milestone.label} className="border-border/70 bg-background">
                    <CardHeader className="py-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{milestone.label}</Badge>
                      </div>
                      <CardDescription>{milestone.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/60 p-3 text-xs text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                <AlertCircle className="h-3.5 w-3.5 text-primary" />
                Migration Guardrails
              </div>
              <ul className="space-y-1.5">
                <li>• API keys encrypted with AES-256 via automation vault.</li>
                <li>• Dry-run diff preview before enabling live schedules.</li>
                <li>• Automated rollback to Lovable if failures exceed 5%.</li>
              </ul>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 bg-muted/20">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
            {activeStep === 'connect' && (
              <Card className="border-border/70 bg-background">
                <CardHeader>
                  <CardTitle>Step 1 · Connect Lovable Workspace</CardTitle>
                  <CardDescription>
                    Provide a Lovable API key with workflow read access and specify the workspace
                    slug. We only use this connection for migration and auditing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Lovable API Key
                      </label>
                      <Input
                        type="password"
                        placeholder="lovable_live_..."
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Generate in Lovable → Settings → API Keys. The key never leaves your
                        encrypted device vault.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Workspace Slug
                      </label>
                      <Input
                        placeholder="acme-ops"
                        value={workspaceSlug}
                        onChange={(event) => setWorkspaceSlug(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Find this in the Lovable URL: lovable.so/w/acme-ops
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground">Security snapshot</p>
                      <p>
                        Scopes: workflow.read, workspace.read. Keys stored with AES-256 + OS
                        keychain.
                      </p>
                    </div>
                    <ShieldCheck className="h-5 w-5 text-primary" />
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleTestConnection}
                      disabled={connectionStatus === 'testing'}
                    >
                      {connectionStatus === 'testing' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Testing connection
                        </>
                      ) : (
                        <>
                          Test & Continue
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                    {connectionStatus === 'passed' && (
                      <div className="flex items-center gap-2 text-sm text-emerald-600">
                        <Check className="h-4 w-4" />
                        Connection verified
                        {connectionInfo ? ` • ${connectionInfo.workspaceName}` : ''}
                      </div>
                    )}
                    {connectionStatus === 'failed' && (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        Connection failed. Try again.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {activeStep === 'select' && (
              <Card className="border-border/70 bg-background">
                <CardHeader>
                  <CardTitle>Step 2 · Select Workflows for Migration</CardTitle>
                  <CardDescription>
                    Choose the Lovable flows you want to migrate. We’ll analyze differences, suggest
                    MCP mappings, and flag risky automations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="secondary" className="gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Target: 5 Lovable takeovers / weekday
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectHealthyWorkflows}
                      disabled={workflows.length === 0 || loadingWorkflows}
                    >
                      Select healthy workflows
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {selectedWorkflows.length} workflow{selectedWorkflows.length === 1 ? '' : 's'}{' '}
                      selected
                      {workflowsSource === 'fallback' && ' • sample data'}
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {loadingWorkflows && (
                      <div className="col-span-full flex items-center justify-center rounded-xl border border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
                        <Loader2 className="mr-3 h-4 w-4 animate-spin" />
                        Fetching Lovable workflows…
                      </div>
                    )}
                    {!loadingWorkflows && workflows.length === 0 && (
                      <div className="col-span-full rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                        No workflows found for this Lovable workspace yet. Run a migration audit or
                        try again later.
                      </div>
                    )}
                    {workflows.map((workflow) => {
                      const isSelected = selectedWorkflows.includes(workflow.id);
                      const badge = STATUS_BADGES[workflow.status];

                      return (
                        <button
                          key={workflow.id}
                          type="button"
                          onClick={() => toggleWorkflow(workflow.id)}
                          className={cn(
                            'flex h-full flex-col rounded-xl border p-4 text-left transition-all',
                            isSelected
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border/70 bg-muted/20 hover:border-primary/40',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {workflow.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Owner: {workflow.owner}
                              </p>
                            </div>
                            <Badge className={cn('border', badge.className)} variant="outline">
                              {badge.label}
                            </Badge>
                          </div>
                          <Separator className="my-3" />
                          <div className="mt-auto space-y-1 text-xs text-muted-foreground">
                            <p>Last run: {workflow.lastRun}</p>
                            <p>Estimated migration time: ~{workflow.estimatedMinutes} min</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setActiveStep('connect')}>
                      Back
                    </Button>
                    <Button
                      onClick={() => setActiveStep('configure')}
                      disabled={selectedWorkflows.length === 0}
                    >
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeStep === 'configure' && (
              <Card className="border-border/70 bg-background">
                <CardHeader>
                  <CardTitle>Step 3 · Configure Target Workspace</CardTitle>
                  <CardDescription>
                    Map owners, naming conventions, and automation policies. We’ll apply these rules
                    when generating the new MCP-backed workflows.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Target Workspace
                      </label>
                      <Input
                        value={targetWorkspace}
                        onChange={(event) => setTargetWorkspace(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Choose an existing workspace or type a new name—we’ll create it
                        automatically.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Naming Prefix
                      </label>
                      <Input
                        value={namingPrefix}
                        onChange={(event) => setNamingPrefix(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Helpful for tracking migrations (e.g., “Lovable → AGI” or “Legacy
                        Automation”).
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Enable schedules after import
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Switch off to run dry-runs first. Recommended for high-risk workflows.
                        </p>
                      </div>
                      <Switch
                        checked={autoEnableSchedules}
                        onCheckedChange={setAutoEnableSchedules}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Include Lovable audit logs
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Import historic run metadata for root-cause analysis and compliance.
                        </p>
                      </div>
                      <Switch checked={includeAuditLogs} onCheckedChange={setIncludeAuditLogs} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Additional Notes
                    </label>
                    <Textarea
                      rows={4}
                      placeholder="Document migration nuances, manual steps, or Lovable gaps you want to address..."
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setActiveStep('select')}>
                      Back
                    </Button>
                    <Button onClick={() => setActiveStep('review')}>
                      Review migration
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeStep === 'review' && (
              <Card className="border-border/70 bg-background">
                <CardHeader>
                  <CardTitle>Step 4 · Review & Launch Migration</CardTitle>
                  <CardDescription>
                    Confirm the workflows, mappings, and automation policies. We’ll queue the
                    migration and notify you when the new AGI workflows are ready.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Summary • {selectedWorkflows.length} workflow
                      {selectedWorkflows.length === 1 ? '' : 's'} selected
                    </p>
                    <ul className="mt-2 space-y-1.5 text-xs">
                      <li>• Target workspace: {targetWorkspace || 'Not set'}</li>
                      <li>• Naming prefix: {namingPrefix || 'Not set'}</li>
                      <li>
                        • Auto-enable schedules: {autoEnableSchedules ? 'Yes' : 'No (dry-run only)'}
                      </li>
                      <li>• Include audit logs: {includeAuditLogs ? 'Yes' : 'Skipped'}</li>
                      <li>• Lovable workspace slug: {workspaceSlug || 'Not set'}</li>
                      <li>
                        • Connection:{' '}
                        {connectionInfo ? connectionInfo.workspaceName : 'Not verified'}
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      Workflows ready to migrate
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      {selectedWorkflowDetails.map((workflow) => {
                        const badge = STATUS_BADGES[workflow.status];
                        return (
                          <div
                            key={workflow.id}
                            className="rounded-lg border border-border/70 bg-muted/10 p-3 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-foreground">{workflow.name}</p>
                              <Badge className={cn('border', badge.className)} variant="outline">
                                {badge.label}
                              </Badge>
                            </div>
                            <p className="mt-1 text-muted-foreground">Owner: {workflow.owner}</p>
                            <p className="text-muted-foreground">Last run: {workflow.lastRun}</p>
                            <p className="text-muted-foreground">
                              Est. rebuild time in MCPs: {workflow.estimatedMinutes} min
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Next steps</p>
                    <ul className="mt-2 space-y-1.5">
                      <li>
                        • Migration queue runs in order of submission. You will receive status
                        updates in the activity feed.
                      </li>
                      <li>
                        • Concierge team reviews high-risk workflows (
                        <span className="font-medium">broken</span> or{' '}
                        <span className="font-medium">deprecated</span>) before enabling schedules.
                      </li>
                      <li>
                        • SLA: All Lovable takeovers completed within 24 hours (faster for{' '}
                        <Badge variant="outline">Priority</Badge> accounts).
                      </li>
                      {importResult && (
                        <li>
                          • Latest batch queued {importResult.queued} workflow
                          {importResult.queued === 1 ? '' : 's'} • ETA ~
                          {importResult.estimateMinutes} minutes.
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setActiveStep('configure')}>
                      Back
                    </Button>
                    <Button onClick={handleImport} disabled={importing || importComplete}>
                      {importing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Queuing migration…
                        </>
                      ) : importComplete ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Migration queued
                        </>
                      ) : (
                        <>
                          Launch migration
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export default LovableMigrationWizard;
