/**
 * WorkflowBuilder — minimal visual workflow editor
 *
 * Canvas-based node editor with:
 *  - Drag-to-position nodes
 *  - Click output port → click input port to connect
 *  - Sidebar palette of node types (trigger, action, condition, output)
 *  - Properties panel on node selection
 *  - Save/load from workflowStore
 *
 * Uses only built-in browser APIs + React — no additional deps.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  ArrowRight,
  CircleDot,
  Filter,
  Loader2,
  Play,
  Save,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useWorkflowStore, type WorkflowNode, type WorkflowEdge } from '../../stores/workflowStore';
import { useAuthStore } from '../../stores/auth';

// ── Security constants ────────────────────────────────────────────────────────

const MAX_LABEL_LENGTH = 200;
const MAX_COMMAND_LENGTH = 1000;

/**
 * Patterns considered dangerous when used as workflow action commands.
 * Mirrors the CLI safety tier classification in apps/cli/src/safety.rs.
 */
const DANGEROUS_COMMAND_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/,
  /\brmdir\b/,
  /\bdd\b.*\bif=/,
  /\bmkfs\b/,
  /\bformat\b/,
  /\bsudo\b/,
  /\bchmod\s+[0-7]*7[0-7][0-7]\b/, // world-writable
  />\s*\/dev\/(sd|hd|nvme)/, // writes to raw disk
  /\bcurl\b.*\|\s*(bash|sh|zsh)/, // curl-pipe-shell
  /\bwget\b.*\|\s*(bash|sh|zsh)/,
  /\beval\b/,
  /\bexec\b/,
  /\bkillall\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\binit\s+[0-6]\b/,
  /\biptables\b/,
  /\bnohup\b.*&\s*$/, // detached background processes
];

/**
 * Returns the first dangerous pattern found in a command string, or null
 * if the command appears safe.
 */
function detectDangerousPattern(command: string): RegExp | null {
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(command)) return pattern;
  }
  return null;
}

/**
 * Validate all action node commands in the workflow against the blocklist.
 * Returns an array of warning messages (empty = safe to save).
 */
function validateWorkflowCommands(nodes: WorkflowNode[]): string[] {
  const warnings: string[] = [];
  for (const node of nodes) {
    if (node.type !== 'action') continue;
    const command = typeof node.data['command'] === 'string' ? node.data['command'] : '';
    if (!command) continue;
    const match = detectDangerousPattern(command);
    if (match) {
      const label = typeof node.data['label'] === 'string' ? node.data['label'] : node.id;
      warnings.push(`Node "${label}": command matches dangerous pattern (${match.source})`);
    }
  }
  return warnings;
}

// ── Node palette definitions ──────────────────────────────────────────────────

interface NodeTypeDef {
  type: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  defaultData: Record<string, unknown>;
}

const NODE_TYPES: NodeTypeDef[] = [
  {
    type: 'trigger',
    label: 'Trigger',
    description: 'Starts the workflow',
    icon: Play,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/40',
    defaultData: { triggerType: 'manual', label: 'Trigger' },
  },
  {
    type: 'action',
    label: 'Action',
    description: 'Executes a task',
    icon: Terminal,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/40',
    defaultData: { actionType: 'run_command', command: '', label: 'Action' },
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branches the flow',
    icon: Filter,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/40',
    defaultData: { expression: '', label: 'Condition' },
  },
  {
    type: 'output',
    label: 'Output',
    description: 'Captures results',
    icon: CircleDot,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/40',
    defaultData: { outputKey: 'result', label: 'Output' },
  },
];

function getNodeTypeDef(type: string): NodeTypeDef {
  return NODE_TYPES.find((n) => n.type === type) ?? NODE_TYPES[1]!;
}

// ── Port types ────────────────────────────────────────────────────────────────

interface PortRef {
  nodeId: string;
  portType: 'output' | 'input';
}

// ── SVG edge path helper ──────────────────────────────────────────────────────

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1) / 2;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// ── Node dimensions (must match rendered size) ────────────────────────────────

const NODE_W = 160;
const NODE_H = 60;
const PORT_RADIUS = 6;

function outputPortPos(node: WorkflowNode) {
  return { x: node.position.x + NODE_W, y: node.position.y + NODE_H / 2 };
}
function inputPortPos(node: WorkflowNode) {
  return { x: node.position.x, y: node.position.y + NODE_H / 2 };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface WorkflowBuilderProps {
  workflowId?: string;
  className?: string;
  onSaved?: (id: string) => void;
}

export function WorkflowBuilder({ workflowId, className, onSaved }: WorkflowBuilderProps) {
  // ── Store ──────────────────────────────────────────────────────────────────
  const { getWorkflow, createWorkflow, updateWorkflow, isLoading } = useWorkflowStore(
    useShallow((s) => ({
      getWorkflow: s.getWorkflow,
      createWorkflow: s.createWorkflow,
      updateWorkflow: s.updateWorkflow,
      isLoading: s.isLoading,
    })),
  );
  const userId = useAuthStore((s) => s.getCurrentUserId()) ?? 'local';

  // ── Local state ────────────────────────────────────────────────────────────
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [workflowName, setWorkflowName] = useState('New Workflow');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pendingPort, setPendingPort] = useState<PortRef | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Drag state (pointer-based, canvas-relative)
  const canvasRef = useRef<SVGSVGElement>(null);
  const dragNodeRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);

  // ── Load existing workflow ─────────────────────────────────────────────────
  useEffect(() => {
    if (!workflowId) return;

    const load = async () => {
      try {
        const def = await getWorkflow(workflowId);
        setNodes(def.nodes);
        setEdges(def.edges);
        setWorkflowName(def.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(msg);
        toast.error('Failed to load workflow: ' + msg);
      }
    };

    void load();
  }, [workflowId, getWorkflow]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const canvasPos = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: clientX, y: clientY };
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const addNode = useCallback((typeDef: NodeTypeDef) => {
    const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // Place new nodes in a cascading fashion
    setNodes((prev) => {
      const offset = prev.length * 30;
      return [
        ...prev,
        {
          id,
          type: typeDef.type,
          position: { x: 120 + offset, y: 80 + offset },
          data: { ...typeDef.defaultData },
        },
      ];
    });
    setSelectedNodeId(id);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
  }, []);

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, []);

  const handlePortClick = useCallback(
    (port: PortRef) => {
      if (!pendingPort) {
        // First click: record output port
        if (port.portType === 'output') {
          setPendingPort(port);
        }
        return;
      }

      // Second click: must be input port on a different node
      if (port.portType === 'input' && port.nodeId !== pendingPort.nodeId) {
        const newEdge: WorkflowEdge = {
          id: `edge_${Date.now()}`,
          source: pendingPort.nodeId,
          target: port.nodeId,
        };
        // Avoid duplicate edges
        setEdges((prev) => {
          const dup = prev.some((e) => e.source === newEdge.source && e.target === newEdge.target);
          if (dup) return prev;
          return [...prev, newEdge];
        });
      }

      setPendingPort(null);
    },
    [pendingPort],
  );

  const handleCanvasClick = useCallback((e: ReactMouseEvent<SVGSVGElement>) => {
    if (e.target === canvasRef.current) {
      setSelectedNodeId(null);
      setPendingPort(null);
    }
  }, []);

  // ── Pointer-based drag for nodes ───────────────────────────────────────────

  const handleNodePointerDown = useCallback(
    (e: ReactPointerEvent<SVGGElement>, nodeId: string) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const pos = canvasPos(e.clientX, e.clientY);
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      dragNodeRef.current = {
        nodeId,
        offsetX: pos.x - node.position.x,
        offsetY: pos.y - node.position.y,
      };
      setSelectedNodeId(nodeId);
    },
    [canvasPos, nodes],
  );

  const handleNodePointerMove = useCallback(
    (e: ReactPointerEvent<SVGGElement>) => {
      if (!dragNodeRef.current) return;
      const { nodeId, offsetX, offsetY } = dragNodeRef.current;
      const pos = canvasPos(e.clientX, e.clientY);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId ? { ...n, position: { x: pos.x - offsetX, y: pos.y - offsetY } } : n,
        ),
      );
    },
    [canvasPos],
  );

  const handleNodePointerUp = useCallback(() => {
    dragNodeRef.current = null;
  }, []);

  // ── Node property update ───────────────────────────────────────────────────

  const updateNodeData = useCallback((nodeId: string, key: string, value: string) => {
    // Enforce length limits per field type
    const maxLen = key === 'command' ? MAX_COMMAND_LENGTH : MAX_LABEL_LENGTH;
    const clamped = value.slice(0, maxLen);
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, [key]: clamped } } : n)),
    );
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    // Validate commands before saving
    const commandWarnings = validateWorkflowCommands(nodes);
    if (commandWarnings.length > 0) {
      for (const warning of commandWarnings) {
        toast.warning(`Dangerous command detected: ${warning}`);
      }
      // Show the warnings but still allow the user to make an informed decision —
      // a blocking error here would prevent legitimate power-user commands.
      // The warning is surfaced so the operator can review.
    }

    setSaving(true);
    try {
      const definition = {
        id: workflowId ?? '',
        userId,
        name: workflowName,
        description: null,
        nodes,
        edges,
        triggers: [{ type: 'manual', config: {} }],
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (workflowId) {
        await updateWorkflow(workflowId, definition);
        toast.success('Workflow saved');
        onSaved?.(workflowId);
      } else {
        const newId = await createWorkflow(definition);
        toast.success('Workflow created');
        onSaved?.(newId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Failed to save workflow: ' + msg);
    } finally {
      setSaving(false);
    }
  }, [workflowId, userId, workflowName, nodes, edges, updateWorkflow, createWorkflow, onSaved]);

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading && workflowId) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center gap-3', className)}>
        {/* Skeleton loading — not a spinner */}
        <div className="w-full max-w-md space-y-3 px-8">
          <div className="h-6 w-2/5 animate-pulse rounded bg-muted" />
          <div className="h-48 w-full animate-pulse rounded-lg bg-muted" />
          <div className="flex gap-2">
            <div className="h-9 w-24 animate-pulse rounded bg-muted" />
            <div className="h-9 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center gap-4', className)}>
        <p className="text-sm text-destructive">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoadError(null);
            if (workflowId) void getWorkflow(workflowId);
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Retry
        </button>
      </div>
    );
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className={cn('flex h-full flex-col overflow-hidden bg-surface-base', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 shrink-0">
        <Zap className="h-4 w-4 text-primary" />
        <input
          type="text"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="flex-1 bg-transparent text-sm font-semibold focus:outline-none text-foreground"
          placeholder="Workflow name"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </button>
      </div>

      {/* Main area: sidebar + canvas + properties */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Node Palette Sidebar */}
        <div className="flex w-40 flex-col gap-1 border-r border-border bg-surface-raised p-2 shrink-0 overflow-y-auto">
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Node types
          </p>
          {NODE_TYPES.map((def) => {
            const Icon = def.icon;
            return (
              <button
                key={def.type}
                type="button"
                onClick={() => addNode(def)}
                title={def.description}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition hover:brightness-110 active:scale-95',
                  def.bgColor,
                  def.borderColor,
                  def.color,
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">{def.label}</span>
              </button>
            );
          })}
        </div>

        {/* Canvas */}
        <div className="relative flex-1 overflow-hidden bg-[#0d0d0f]">
          {/* Grid background */}
          <svg
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            onClick={handleCanvasClick}
          >
            {/* Grid pattern */}
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path
                  d="M 24 0 L 0 0 0 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Edges */}
            <g>
              {edges.map((edge) => {
                const src = nodes.find((n) => n.id === edge.source);
                const tgt = nodes.find((n) => n.id === edge.target);
                if (!src || !tgt) return null;
                const sp = outputPortPos(src);
                const tp = inputPortPos(tgt);
                return (
                  <g key={edge.id}>
                    <path
                      d={edgePath(sp.x, sp.y, tp.x, tp.y)}
                      fill="none"
                      stroke="rgba(99,102,241,0.6)"
                      strokeWidth={2}
                    />
                    {/* Clickable invisible wider path for easier deletion */}
                    <path
                      d={edgePath(sp.x, sp.y, tp.x, tp.y)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteEdge(edge.id);
                      }}
                    />
                    {/* Arrow head */}
                    <circle cx={tp.x} cy={tp.y} r={3} fill="rgba(99,102,241,0.8)" />
                  </g>
                );
              })}
            </g>

            {/* Pending connection preview */}
            {pendingPort &&
              (() => {
                const srcNode = nodes.find((n) => n.id === pendingPort.nodeId);
                if (!srcNode) return null;
                const sp = outputPortPos(srcNode);
                return (
                  <circle
                    cx={sp.x}
                    cy={sp.y}
                    r={PORT_RADIUS + 2}
                    fill="rgba(99,102,241,0.3)"
                    stroke="rgba(99,102,241,0.8)"
                    strokeWidth={1.5}
                    className="animate-pulse"
                  />
                );
              })()}

            {/* Nodes */}
            {nodes.map((node) => {
              const def = getNodeTypeDef(node.type);
              const Icon = def.icon;
              const isSelected = node.id === selectedNodeId;
              const label = typeof node.data['label'] === 'string' ? node.data['label'] : def.label;
              const sp = outputPortPos(node);
              const ip = inputPortPos(node);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.position.x}, ${node.position.y})`}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                  onPointerMove={handleNodePointerMove}
                  onPointerUp={handleNodePointerUp}
                >
                  {/* Node body */}
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill={isSelected ? 'rgba(30,30,40,0.95)' : 'rgba(20,20,30,0.9)'}
                    stroke={isSelected ? 'rgba(99,102,241,0.8)' : 'rgba(255,255,255,0.1)'}
                    strokeWidth={isSelected ? 2 : 1}
                  />

                  {/* Icon area */}
                  <rect
                    x={10}
                    y={10}
                    width={38}
                    height={38}
                    rx={6}
                    fill={def.bgColor.replace('bg-', '').replace('/10', '')}
                    fillOpacity={0.15}
                  />

                  {/* Icon placeholder (SVG foreignObject for React icon) */}
                  <foreignObject x={18} y={18} width={22} height={22}>
                    <Icon className={cn('h-full w-full', def.color)} />
                  </foreignObject>

                  {/* Label */}
                  <text
                    x={56}
                    y={NODE_H / 2 - 4}
                    fontSize={11}
                    fontWeight={600}
                    fill="rgba(255,255,255,0.9)"
                    dominantBaseline="middle"
                    style={{ fontFamily: 'inherit' }}
                  >
                    {label.length > 14 ? label.slice(0, 13) + '\u2026' : label}
                  </text>
                  <text
                    x={56}
                    y={NODE_H / 2 + 10}
                    fontSize={9}
                    fill="rgba(255,255,255,0.35)"
                    dominantBaseline="middle"
                    style={{ fontFamily: 'inherit' }}
                  >
                    {def.type}
                  </text>

                  {/* Output port (right) */}
                  <circle
                    cx={sp.x - node.position.x}
                    cy={sp.y - node.position.y}
                    r={PORT_RADIUS}
                    fill={
                      pendingPort?.nodeId === node.id ? 'rgba(99,102,241,0.8)' : 'rgba(40,40,55,1)'
                    }
                    stroke="rgba(99,102,241,0.6)"
                    strokeWidth={1.5}
                    style={{ cursor: 'crosshair' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePortClick({ nodeId: node.id, portType: 'output' });
                    }}
                  />

                  {/* Input port (left) */}
                  <circle
                    cx={ip.x - node.position.x}
                    cy={ip.y - node.position.y}
                    r={PORT_RADIUS}
                    fill="rgba(40,40,55,1)"
                    stroke="rgba(99,102,241,0.6)"
                    strokeWidth={1.5}
                    style={{ cursor: 'crosshair' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePortClick({ nodeId: node.id, portType: 'input' });
                    }}
                  />
                </g>
              );
            })}
          </svg>

          {/* Empty state hint */}
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
              <ArrowRight className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground/40">
                Add nodes from the sidebar to build your workflow
              </p>
            </div>
          )}

          {/* Connection hint */}
          {pendingPort && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600/80 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
              Now click an input port on another node to connect
            </div>
          )}
        </div>

        {/* Properties Panel */}
        <div className="flex w-52 flex-col border-l border-border bg-surface-raised shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Properties
            </p>
          </div>

          {selectedNode ? (
            <NodePropertiesPanel
              node={selectedNode}
              onUpdateData={updateNodeData}
              onDelete={deleteNode}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <p className="text-xs text-muted-foreground">Select a node to edit its properties</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Node Properties Panel ─────────────────────────────────────────────────────

interface NodePropertiesPanelProps {
  node: WorkflowNode;
  onUpdateData: (nodeId: string, key: string, value: string) => void;
  onDelete: (nodeId: string) => void;
}

function NodePropertiesPanel({ node, onUpdateData, onDelete }: NodePropertiesPanelProps) {
  const def = getNodeTypeDef(node.type);
  const Icon = def.icon;

  // Build editable fields based on node type
  const fields: { key: string; label: string; placeholder: string; multiline?: boolean }[] = [
    { key: 'label', label: 'Label', placeholder: def.label },
  ];

  if (node.type === 'action') {
    fields.push({
      key: 'command',
      label: 'Command',
      placeholder: 'shell command…',
      multiline: true,
    });
    fields.push({ key: 'actionType', label: 'Action type', placeholder: 'run_command' });
  } else if (node.type === 'trigger') {
    fields.push({ key: 'triggerType', label: 'Trigger type', placeholder: 'manual' });
  } else if (node.type === 'condition') {
    fields.push({
      key: 'expression',
      label: 'Expression',
      placeholder: '{{value}} > 0',
      multiline: true,
    });
  } else if (node.type === 'output') {
    fields.push({ key: 'outputKey', label: 'Output key', placeholder: 'result' });
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border p-2',
          def.bgColor,
          def.borderColor,
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', def.color)} />
        <span className={cn('text-xs font-semibold', def.color)}>{def.label}</span>
      </div>

      {/* Fields */}
      {fields.map(({ key, label, placeholder, multiline }) => (
        <div key={key} className="flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </label>
          {multiline ? (
            <textarea
              value={typeof node.data[key] === 'string' ? (node.data[key] as string) : ''}
              onChange={(e) => onUpdateData(node.id, key, e.target.value)}
              placeholder={placeholder}
              rows={3}
              maxLength={key === 'command' ? MAX_COMMAND_LENGTH : MAX_LABEL_LENGTH}
              className="w-full resize-none rounded-md border border-border bg-surface-base px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          ) : (
            <input
              type="text"
              value={typeof node.data[key] === 'string' ? (node.data[key] as string) : ''}
              onChange={(e) => onUpdateData(node.id, key, e.target.value)}
              placeholder={placeholder}
              maxLength={MAX_LABEL_LENGTH}
              className="w-full rounded-md border border-border bg-surface-base px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
        </div>
      ))}

      {/* Node ID (read-only) */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Node ID
        </label>
        <p className="truncate rounded bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
          {node.id}
        </p>
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={() => onDelete(node.id)}
        className="mt-auto flex items-center justify-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete node
      </button>
    </div>
  );
}

export default WorkflowBuilder;
