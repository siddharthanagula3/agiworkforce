import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Cpu, Layers3, ListChecks, Pause, Play, X } from 'lucide-react';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { useOrchestrationStore } from '../../stores/orchestrationStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { ScrollArea } from '../ui/ScrollArea';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Progress } from '../ui/Progress';
import { cn } from '../../lib/utils';
import type { WorkflowNode } from '../../types/workflow';

interface MissionControlPanelProps {
  className?: string;
  onClose?: () => void;
}

interface TimelineEvent {
  id: string;
  label: string;
  status: 'pending' | 'success' | 'error' | 'running';
  detail?: string;
  timestamp?: string;
}

type PlanStepStatus = 'pending' | 'running' | 'success';

interface PlanStep {
  id: string;
  label: string;
  description: string;
  status: PlanStepStatus;
}

const statusBadgeStyles: Record<TimelineEvent['status'], string> = {
  pending: 'bg-muted text-muted-foreground',
  running: 'bg-sky-500/15 text-sky-400',
  success: 'bg-emerald-500/15 text-emerald-400',
  error: 'bg-destructive/15 text-destructive',
};

const describeWorkflowNode = (node: WorkflowNode): string => {
  switch (node.type) {
    case 'agent':
      return node.data.agent_name ?? node.data.label ?? 'Agent execution';
    case 'decision':
      return `Decision (${node.data.condition_type})`;
    case 'loop':
      return `Loop (${node.data.loop_type})`;
    case 'parallel':
      return `Parallel branches (${node.data.branches.length})`;
    case 'wait':
      return `Wait (${node.data.wait_type})`;
    case 'script':
      return `Run ${node.data.language} script`;
    case 'tool':
      return `Tool: ${node.data.tool_name || 'custom invocation'}`;
    default:
      return 'Workflow node';
  }
};

export function MissionControlPanel({ className, onClose }: MissionControlPanelProps) {
  const { selectedWorkflow, currentExecution, executionLogs } = useOrchestrationStore((state) => ({
    selectedWorkflow: state.selectedWorkflow,
    currentExecution: state.currentExecution,
    executionLogs: state.executionLogs,
  }));

  const conversations = useUnifiedChatStore((state) => state.conversations);
  const activeConversationId = useUnifiedChatStore((state) => state.activeConversationId);

  const [activeTab, setActiveTab] = useState('plan');
  const lastUpdateTimestamp =
    currentExecution?.completed_at ?? currentExecution?.started_at ?? null;
  const lastUpdateLabel = lastUpdateTimestamp
    ? new Date(lastUpdateTimestamp).toLocaleTimeString()
    : 'moments ago';

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  const planSteps = useMemo<PlanStep[]>(() => {
    if (selectedWorkflow?.nodes?.length) {
      return selectedWorkflow.nodes.slice(0, 6).map((node, index) => ({
        id: node.id || `node-${index}`,
        label: node.data?.label || node.type || `Step ${index + 1}`,
        description: describeWorkflowNode(node),
        status:
          currentExecution?.status === 'running' && index === 0
            ? 'running'
            : currentExecution?.status === 'completed'
              ? 'success'
              : 'pending',
      }));
    }

    return [
      {
        id: 'context',
        label: 'Gather project context',
        description: 'Scan repo + docs',
        status: 'pending',
      },
      {
        id: 'plan',
        label: 'Synthesize execution plan',
        description: 'Break work into stages',
        status: 'pending',
      },
      {
        id: 'code',
        label: 'Generate code draft',
        description: 'Apply reusable patterns',
        status: 'pending',
      },
      {
        id: 'diff',
        label: 'Review diffs & apply',
        description: 'Safeguard critical files',
        status: 'pending',
      },
      {
        id: 'tests',
        label: 'Run fast tests',
        description: 'Validate critical paths',
        status: 'pending',
      },
      {
        id: 'handoff',
        label: 'Prepare hand-off',
        description: 'Summaries, follow-ups',
        status: 'pending',
      },
    ];
  }, [selectedWorkflow, currentExecution]);

  const timeline = useMemo<TimelineEvent[]>(() => {
    if (executionLogs?.length) {
      return executionLogs.slice(-8).map((log) => ({
        id: log.id,
        label: `Node ${log.node_id || 'unknown'} ${log.event_type}`,
        detail: typeof log.data === 'string' ? log.data : undefined,
        timestamp: new Date(log.timestamp).toLocaleTimeString(),
        status:
          log.event_type === 'failed'
            ? 'error'
            : log.event_type === 'started'
              ? 'running'
              : 'success',
      }));
    }

    return [
      {
        id: 'timeline-1',
        label: 'Initialized repo fingerprint',
        status: 'success',
        timestamp: '09:14:02',
      },
      {
        id: 'timeline-2',
        label: 'Generated architectural plan',
        status: 'success',
        timestamp: '09:14:12',
      },
      {
        id: 'timeline-3',
        label: 'Synthesized code patch',
        detail: 'smartChunk.ts',
        status: 'running',
        timestamp: '09:14:33',
      },
    ];
  }, [executionLogs]);

  const latestArtifacts = useMemo(() => {
    const codeArtifacts: { id: string; title: string; language?: string; excerpt: string }[] = [];

    // TODO: Re-implement artifacts when the unified message structure supports them
    // For now, return sample data
    codeArtifacts.push({
      id: 'sample-artifact',
      title: 'VectorRouter.ts',
      language: 'typescript',
      excerpt: `export function routeProvider(task: TaskDescription): ProviderChoice {\n  if (task.type === 'code_review') {\n    return Providers.DeepCode;\n  }\n  return Providers.Omni;\n}`,
    });

    return codeArtifacts;
  }, []);

  return (
    <aside
      className={cn(
        'flex h-full w-[420px] flex-col border-l bg-card/70 backdrop-blur-xl',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
              Mission Control
            </h3>
          </div>
          <p className="text-base font-medium text-foreground">
            {activeConversation?.title || 'Autonomous session'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            className={cn(
              'px-2 py-0.5 text-xs',
              currentExecution?.status === 'running'
                ? 'bg-sky-500/15 text-sky-400'
                : currentExecution?.status === 'completed'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {currentExecution?.status ? currentExecution.status : 'Idle'}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="Collapse Mission Control"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b px-4 py-3 text-sm">
        <div>
          <p className="text-muted-foreground">Plan steps</p>
          <p className="font-semibold">{planSteps.length}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Last update</p>
          <p className="font-semibold">{lastUpdateLabel}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
        <TabsList className="grid grid-cols-4 bg-transparent">
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
          <TabsTrigger value="signals">Signals</TabsTrigger>
        </TabsList>

        <TabsContent value="plan" className="flex-1 px-4 pb-4">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-3 py-2">
              {planSteps.map((step, index) => (
                <div
                  key={step.id}
                  className="rounded-xl border bg-background/80 p-3 shadow-sm backdrop-blur"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {index + 1}
                      </Badge>
                      <p className="font-semibold text-sm">{step.label}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {step.status ?? 'pending'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="timeline" className="flex-1 px-4 pb-4">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-3 py-2">
              {timeline.map((event) => (
                <div key={event.id} className="rounded-xl border bg-background/80 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn('h-2.5 w-2.5 rounded-full', statusBadgeStyles[event.status])}
                      />
                      <p className="text-sm font-medium">{event.label}</p>
                    </div>
                    {event.timestamp ? (
                      <span className="text-xs text-muted-foreground">{event.timestamp}</span>
                    ) : null}
                  </div>
                  {event.detail ? (
                    <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="artifacts" className="flex-1 px-4 pb-4">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-3 py-2">
              {latestArtifacts.map((artifact) => (
                <div key={artifact.id} className="rounded-xl border bg-background/80 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{artifact.title}</p>
                    {artifact.language ? (
                      <Badge variant="secondary" className="text-xs">
                        {artifact.language}
                      </Badge>
                    ) : null}
                  </div>
                  <pre className="mt-2 max-h-36 overflow-hidden rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
                    {artifact.excerpt}
                    {artifact.excerpt.endsWith('...') ? '' : '…'}
                  </pre>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="signals" className="flex-1 px-4 pb-4">
          <div className="space-y-4 py-4">
            <div className="rounded-xl border bg-background/80 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4 text-primary" />
                Runtime health
              </div>
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>LLM tokens</span>
                    <span>71% of budget</span>
                  </div>
                  <Progress value={71} className="mt-1" />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Tool success</span>
                    <span>92%</span>
                  </div>
                  <Progress value={92} className="mt-1 bg-emerald-500/10" />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Cost runtime</span>
                    <span>$1.42 / $4.00</span>
                  </div>
                  <Progress value={35} className="mt-1 bg-amber-500/20" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-background/80 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Cpu className="h-4 w-4 text-primary" />
                Automation controls
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Pause className="h-3.5 w-3.5" />
                  Pause run
                </Button>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </Button>
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Guardrails
                </Button>
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                  <ListChecks className="h-3.5 w-3.5" />
                  QA tasks
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
