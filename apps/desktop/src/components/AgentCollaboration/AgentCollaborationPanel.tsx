/**
 * AgentCollaborationPanel
 *
 * Multi-agent workspace showing agent-to-agent communication,
 * task delegation, and swarm progress. Users can observe and
 * intervene in multi-agent workflows.
 *
 * Features:
 * - Swarm initialization with configurable max agents
 * - Goal execution with real-time progress
 * - Task delegation: assign specific tasks to specific agents
 * - Results aggregation: combined output from all agents
 * - Agent-to-agent message feed
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  Loader2,
  Play,
  Square,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  Settings2,
  Activity,
  BarChart3,
  Send,
  ListChecks,
  FileOutput,
  Copy,
  Download,
} from 'lucide-react';
import { invoke, listen, isTauri } from '../../lib/tauri-mock';

// ─── Types ───

interface SwarmAgent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentTask?: string;
  progress: number;
}

interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  content: string;
  timestamp: number;
  type: 'task' | 'result' | 'error' | 'coordination';
}

interface SwarmStats {
  totalAgents: number;
  activeAgents: number;
  completedTasks: number;
  failedTasks: number;
  averageLatencyMs: number;
}

interface TaskDelegation {
  id: string;
  agentId: string;
  agentName: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  createdAt: number;
}

interface SwarmResult {
  success: boolean;
  goalId: string;
  output: unknown;
  summary: string;
  succeeded: number;
  failed: number;
  wallTime: number;
  speedupRatio: number;
  criticalPathLength: number;
  maxParallelism: number;
}

type PanelTab = 'messages' | 'tasks' | 'results';

// ─── Component ───

interface AgentCollaborationPanelProps {
  className?: string;
}

export function AgentCollaborationPanel({ className }: AgentCollaborationPanelProps) {
  const [initialized, setInitialized] = useState(false);
  const [agents, setAgents] = useState<SwarmAgent[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [stats, setStats] = useState<SwarmStats | null>(null);
  const [goal, setGoal] = useState('');
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [maxAgents, setMaxAgents] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('messages');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Task delegation state
  const [delegations, setDelegations] = useState<TaskDelegation[]>([]);
  const [delegateAgentId, setDelegateAgentId] = useState('');
  const [delegateTask, setDelegateTask] = useState('');

  // Results aggregation state
  const [results, setResults] = useState<SwarmResult[]>([]);
  const [resultsCopied, setResultsCopied] = useState(false);

  // Listen for swarm events
  useEffect(() => {
    if (!isTauri) return;

    let mounted = true;
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      try {
        const unlistenProgress = await listen<{
          agents: SwarmAgent[];
          progress: number;
          phase: string;
        }>('swarm:progress', (event) => {
          if (!mounted) return;
          setAgents(event.payload.agents ?? []);
        });
        if (mounted) unlisteners.push(unlistenProgress);
        else unlistenProgress();

        const unlistenMessage = await listen<AgentMessage>('swarm:agent_message', (event) => {
          if (!mounted) return;
          setMessages((prev) => [...prev.slice(-99), event.payload]);

          // Update delegation status from result messages
          if (event.payload.type === 'result') {
            setDelegations((prev) =>
              prev.map((d) =>
                d.agentId === event.payload.fromAgent && d.status === 'running'
                  ? { ...d, status: 'completed', result: event.payload.content }
                  : d,
              ),
            );
          }
        });
        if (mounted) unlisteners.push(unlistenMessage);
        else unlistenMessage();

        const unlistenComplete = await listen<{ result: SwarmResult }>(
          'swarm:complete',
          (event) => {
            if (!mounted) return;
            setExecuting(false);
            if (event.payload.result) {
              setResults((prev) => [event.payload.result, ...prev].slice(0, 20));
            }
            refreshStats();
          },
        );
        if (mounted) unlisteners.push(unlistenComplete);
        else unlistenComplete();
      } catch (e) {
        console.warn('[AgentCollaboration] Failed to setup listeners:', e);
      }
    };

    setup();

    return () => {
      mounted = false;
      unlisteners.forEach((u) => u());
    };
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const s = await invoke<SwarmStats>('swarm_get_stats');
      setStats(s);
    } catch {
      // Swarm may not be initialized yet
    }
  }, []);

  // Initialize swarm
  const handleInit = useCallback(async () => {
    setError(null);
    try {
      await invoke('swarm_init', {
        request: {
          maxAgents,
          autoSpawn: true,
          optimizeCriticalPath: true,
        },
      });
      setInitialized(true);
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [maxAgents, refreshStats]);

  // Execute goal
  const handleExecuteGoal = useCallback(async () => {
    if (!goal.trim()) return;
    setExecuting(true);
    setError(null);
    setMessages([]);

    try {
      const result = await invoke<SwarmResult>('swarm_execute_goal', {
        request: {
          goal: goal.trim(),
          priority: null,
        },
      });
      setExecuting(false);
      if (result) {
        setResults((prev) => [result, ...prev].slice(0, 20));
        setActiveTab('results');
      }
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setExecuting(false);
    }
  }, [goal, refreshStats]);

  // Stop swarm
  const handleStop = useCallback(async () => {
    try {
      await invoke('swarm_stop');
      setExecuting(false);
    } catch (err) {
      console.error('Failed to stop swarm:', err);
    }
  }, []);

  // Delegate a task to a specific agent
  const handleDelegateTask = useCallback(() => {
    if (!delegateTask.trim() || !delegateAgentId) return;

    const agent = agents.find((a) => a.id === delegateAgentId);
    if (!agent) return;

    const delegation: TaskDelegation = {
      id: `task-${Date.now()}`,
      agentId: delegateAgentId,
      agentName: agent.name,
      description: delegateTask.trim(),
      status: 'pending',
      createdAt: Date.now(),
    };

    setDelegations((prev) => [delegation, ...prev]);
    setDelegateTask('');

    // Execute the delegated task as a goal scoped to the agent
    invoke('swarm_execute_goal', {
      request: {
        goal: `[Agent: ${agent.name}] ${delegateTask.trim()}`,
        priority: 'medium',
      },
    })
      .then(() => {
        setDelegations((prev) =>
          prev.map((d) => (d.id === delegation.id ? { ...d, status: 'running' } : d)),
        );
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setDelegations((prev) =>
          prev.map((d) => (d.id === delegation.id ? { ...d, status: 'error', result: msg } : d)),
        );
      });
  }, [delegateTask, delegateAgentId, agents]);

  // Copy aggregated results to clipboard
  const handleCopyResults = useCallback(async () => {
    if (results.length === 0) return;

    const text = results
      .map(
        (r, i) =>
          `--- Result ${i + 1} ---\nSuccess: ${r.success}\nSummary: ${r.summary}\nSucceeded: ${r.succeeded}, Failed: ${r.failed}\nWall Time: ${typeof r.wallTime === 'number' ? `${(r.wallTime / 1000).toFixed(1)}s` : 'N/A'}\nSpeedup: ${typeof r.speedupRatio === 'number' ? `${r.speedupRatio.toFixed(1)}x` : 'N/A'}`,
      )
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(text);
      setResultsCopied(true);
      setTimeout(() => setResultsCopied(false), 2000);
    } catch {
      // clipboard write may fail in some contexts
    }
  }, [results]);

  // Export results as markdown
  const handleExportResults = useCallback(() => {
    if (results.length === 0) return;

    const markdown = `# Agent Collaboration Results\n\n${results
      .map(
        (r, i) =>
          `## Run ${i + 1}\n\n- **Success**: ${r.success ? 'Yes' : 'No'}\n- **Summary**: ${r.summary}\n- **Tasks succeeded**: ${r.succeeded}\n- **Tasks failed**: ${r.failed}\n- **Wall time**: ${typeof r.wallTime === 'number' ? `${(r.wallTime / 1000).toFixed(1)}s` : 'N/A'}\n- **Speedup ratio**: ${typeof r.speedupRatio === 'number' ? `${r.speedupRatio.toFixed(1)}x` : 'N/A'}\n- **Max parallelism**: ${r.maxParallelism ?? 'N/A'}\n`,
      )
      .join('\n')}`;

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-results-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [results]);

  const getStatusIcon = (status: SwarmAgent['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-3 w-3 animate-spin text-blue-400" />;
      case 'completed':
        return <CheckCircle2 className="h-3 w-3 text-green-400" />;
      case 'error':
        return <AlertCircle className="h-3 w-3 text-red-400" />;
      default:
        return <Clock className="h-3 w-3 text-zinc-500" />;
    }
  };

  const getMessageColor = (type: AgentMessage['type']) => {
    switch (type) {
      case 'task':
        return 'border-l-blue-500';
      case 'result':
        return 'border-l-green-500';
      case 'error':
        return 'border-l-red-500';
      case 'coordination':
        return 'border-l-purple-500';
      default:
        return 'border-l-zinc-500';
    }
  };

  const getDelegationStatusColor = (status: TaskDelegation['status']) => {
    switch (status) {
      case 'pending':
        return 'text-yellow-500 bg-yellow-500/10';
      case 'running':
        return 'text-blue-500 bg-blue-500/10';
      case 'completed':
        return 'text-green-500 bg-green-500/10';
      case 'error':
        return 'text-red-500 bg-red-500/10';
    }
  };

  // Scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={`flex flex-col h-full bg-background ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-purple-500" />
          <h2 className="text-sm font-semibold">Agent Collaboration</h2>
          {agents.length > 0 && (
            <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs text-purple-500">
              {agents.filter((a) => a.status === 'running').length}/{agents.length} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!initialized && (
            <button
              onClick={handleInit}
              className="inline-flex items-center gap-1 rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700"
            >
              <Zap className="h-3 w-3" />
              Init Swarm
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          {executing && (
            <button
              onClick={handleStop}
              className="p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"
              title="Stop swarm"
            >
              <Square className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="border-b border-border/30 px-4 py-2 bg-muted/30 text-xs space-y-2">
          <div className="flex items-center gap-3">
            <label className="text-muted-foreground">Max agents:</label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxAgents}
              onChange={(e) => setMaxAgents(parseInt(e.target.value) || 5)}
              className="w-14 rounded border border-input bg-background px-2 py-0.5 text-xs"
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 mx-4 mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Goal input */}
      <div className="flex gap-2 p-3 border-b border-border/30">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !executing && handleExecuteGoal()}
          placeholder="Describe a complex goal for the agent swarm..."
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground"
          disabled={executing}
        />
        <button
          onClick={handleExecuteGoal}
          disabled={!goal.trim() || executing}
          className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {executing ? 'Running...' : 'Execute'}
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border/30">
        <button
          onClick={() => setActiveTab('messages')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'messages'
              ? 'text-purple-500 border-b-2 border-purple-500'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="h-3 w-3" />
          Messages
          {messages.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-[10px]">{messages.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'tasks'
              ? 'text-purple-500 border-b-2 border-purple-500'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ListChecks className="h-3 w-3" />
          Tasks
          {delegations.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-[10px]">{delegations.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('results')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'results'
              ? 'text-purple-500 border-b-2 border-purple-500'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileOutput className="h-3 w-3" />
          Results
          {results.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-[10px]">{results.length}</span>
          )}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Agent list (left) */}
        <div className="w-48 border-r border-border/30 overflow-y-auto shrink-0">
          <div className="p-2 text-xs font-medium text-muted-foreground border-b border-border/20 flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Agents ({agents.length})
          </div>
          {agents.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">
              {initialized ? 'Waiting for tasks...' : 'Initialize swarm to start'}
            </div>
          ) : (
            <div className="space-y-0.5 p-1">
              {agents.map((agent) => (
                <div key={agent.id}>
                  <button
                    className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                      expandedAgent === agent.id ? 'bg-accent/70' : 'hover:bg-accent/40'
                    }`}
                    onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                  >
                    {getStatusIcon(agent.status)}
                    <span className="text-xs truncate flex-1">{agent.name}</span>
                    {expandedAgent === agent.id ? (
                      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  {expandedAgent === agent.id && (
                    <div className="px-2 py-1 ml-5 text-xs text-muted-foreground space-y-0.5">
                      <div>Role: {agent.role}</div>
                      <div>Progress: {agent.progress}%</div>
                      {agent.currentTask && (
                        <div className="truncate">Task: {agent.currentTask}</div>
                      )}
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            agent.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${agent.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tab content (right) */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Messages Tab */}
          {activeTab === 'messages' && (
            <>
              <div className="p-2 text-xs font-medium text-muted-foreground border-b border-border/20 flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                Agent Communication
              </div>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 p-4 text-muted-foreground">
                  <MessageSquare className="h-6 w-6 mb-2 opacity-50" />
                  <p className="text-xs">Agent messages will appear here</p>
                  <p className="text-xs opacity-60">
                    Execute a goal to see agent-to-agent communication
                  </p>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-md border-l-2 bg-muted/20 px-3 py-1.5 ${getMessageColor(msg.type)}`}
                    >
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">{msg.fromAgent}</span>
                        <span className="text-muted-foreground/50">&rarr;</span>
                        <span className="font-medium text-foreground/80">{msg.toAgent}</span>
                        <span className="ml-auto text-xs opacity-50">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5 text-foreground/70">{msg.content}</p>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </>
          )}

          {/* Tasks Tab — Task Delegation UI */}
          {activeTab === 'tasks' && (
            <>
              <div className="p-2 text-xs font-medium text-muted-foreground border-b border-border/20 flex items-center gap-1">
                <ListChecks className="h-3 w-3" />
                Task Delegation
              </div>

              {/* Delegate new task */}
              <div className="p-3 border-b border-border/20 space-y-2">
                <div className="flex gap-2">
                  <select
                    value={delegateAgentId}
                    onChange={(e) => setDelegateAgentId(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                    disabled={agents.length === 0}
                  >
                    <option value="">Select agent...</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    value={delegateTask}
                    onChange={(e) => setDelegateTask(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleDelegateTask()}
                    placeholder="Describe the task to delegate..."
                    className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground"
                    disabled={agents.length === 0}
                  />
                  <button
                    onClick={handleDelegateTask}
                    disabled={!delegateTask.trim() || !delegateAgentId}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" />
                    Assign
                  </button>
                </div>
              </div>

              {/* Delegations list */}
              {delegations.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 p-4 text-muted-foreground">
                  <ListChecks className="h-6 w-6 mb-2 opacity-50" />
                  <p className="text-xs">No tasks delegated yet</p>
                  <p className="text-xs opacity-60">Select an agent and assign a specific task</p>
                </div>
              ) : (
                <div className="space-y-1.5 p-2">
                  {delegations.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-md border border-border/30 bg-muted/10 p-2.5 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getDelegationStatusColor(d.status)}`}
                        >
                          {d.status}
                        </span>
                        <span className="text-xs font-medium text-foreground/80">
                          {d.agentName}
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {new Date(d.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/70">{d.description}</p>
                      {d.result && (
                        <div className="mt-1 rounded bg-muted/30 px-2 py-1.5 text-xs text-foreground/60">
                          {d.result}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Results Tab — Aggregated Results View */}
          {activeTab === 'results' && (
            <>
              <div className="p-2 text-xs font-medium text-muted-foreground border-b border-border/20 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <FileOutput className="h-3 w-3" />
                  Aggregated Results
                </span>
                {results.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleCopyResults}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                      title="Copy results"
                    >
                      {resultsCopied ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      onClick={handleExportResults}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                      title="Export as markdown"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {results.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 p-4 text-muted-foreground">
                  <FileOutput className="h-6 w-6 mb-2 opacity-50" />
                  <p className="text-xs">No results yet</p>
                  <p className="text-xs opacity-60">
                    Results will appear after goal execution completes
                  </p>
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {results.map((r, idx) => (
                    <div
                      key={`result-${idx}`}
                      className={`rounded-md border p-3 space-y-2 ${
                        r.success
                          ? 'border-green-500/30 bg-green-500/5'
                          : 'border-red-500/30 bg-red-500/5'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {r.success ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="text-xs font-medium">
                          {r.success ? 'Completed Successfully' : 'Completed with Failures'}
                        </span>
                      </div>

                      {r.summary && <p className="text-xs text-foreground/70">{r.summary}</p>}

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <div>
                          Tasks succeeded:{' '}
                          <span className="text-green-500 font-medium">{r.succeeded}</span>
                        </div>
                        <div>
                          Tasks failed: <span className="text-red-500 font-medium">{r.failed}</span>
                        </div>
                        <div>
                          Wall time:{' '}
                          <span className="text-foreground/80 font-medium">
                            {typeof r.wallTime === 'number'
                              ? `${(r.wallTime / 1000).toFixed(1)}s`
                              : 'N/A'}
                          </span>
                        </div>
                        <div>
                          Speedup:{' '}
                          <span className="text-foreground/80 font-medium">
                            {typeof r.speedupRatio === 'number'
                              ? `${r.speedupRatio.toFixed(1)}x`
                              : 'N/A'}
                          </span>
                        </div>
                        <div>
                          Max parallelism:{' '}
                          <span className="text-foreground/80 font-medium">
                            {r.maxParallelism ?? 'N/A'}
                          </span>
                        </div>
                        <div>
                          Critical path:{' '}
                          <span className="text-foreground/80 font-medium">
                            {r.criticalPathLength ?? 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-4 border-t border-border/30 px-4 py-1.5 text-xs text-muted-foreground bg-muted/20">
          <span className="flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />
            Stats:
          </span>
          <span>{stats.completedTasks} completed</span>
          <span>{stats.failedTasks} failed</span>
          <span>Avg latency: {stats.averageLatencyMs}ms</span>
        </div>
      )}
    </div>
  );
}
