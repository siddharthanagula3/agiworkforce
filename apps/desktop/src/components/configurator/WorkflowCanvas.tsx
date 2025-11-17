import * as React from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  ReactFlowInstance,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Layout, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { useConfiguratorStore } from '../../stores/configuratorStore';
import { TriggerNode } from './nodes/TriggerNode';
import { ActionNode } from './nodes/ActionNode';
import { ConditionNode } from './nodes/ConditionNode';
import { LoopNode } from './nodes/LoopNode';
import { AINode } from './nodes/AINode';
import type { Capability } from '../../types/configurator';

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  loop: LoopNode,
  ai: AINode,
};

interface WorkflowCanvasProps {
  className?: string;
}

function WorkflowCanvasInner({ className }: WorkflowCanvasProps) {
  const reactFlowWrapper = React.useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = React.useState<ReactFlowInstance | null>(null);

  const workflowNodes = useConfiguratorStore((state) => state.workflowNodes);
  const workflowEdges = useConfiguratorStore((state) => state.workflowEdges);
  const setNodes = useConfiguratorStore((state) => state.setNodes);
  const setEdges = useConfiguratorStore((state) => state.setEdges);
  const addEdgeToStore = useConfiguratorStore((state) => state.addEdge);
  const setSelectedNode = useConfiguratorStore((state) => state.setSelectedNode);
  const clearWorkflow = useConfiguratorStore((state) => state.clearWorkflow);
  const autoLayoutWorkflow = useConfiguratorStore((state) => state.autoLayoutWorkflow);

  const [nodes, setLocalNodes, onNodesChange] = useNodesState(workflowNodes);
  const [edges, setLocalEdges, onEdgesChange] = useEdgesState(workflowEdges);

  // Updated Nov 16, 2025: Fixed circular dependency with proper synchronization
  const syncingRef = React.useRef(false);

  // Sync local state with store (only when store changes externally)
  React.useEffect(() => {
    if (!syncingRef.current) {
      syncingRef.current = true;
      setLocalNodes(workflowNodes);
      // Use setTimeout to break out of the sync cycle
      setTimeout(() => {
        syncingRef.current = false;
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowNodes]);

  React.useEffect(() => {
    if (!syncingRef.current) {
      syncingRef.current = true;
      setLocalEdges(workflowEdges);
      setTimeout(() => {
        syncingRef.current = false;
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowEdges]);

  // Update store when nodes change (with debouncing to prevent rapid updates)
  const nodesChanged = React.useRef(false);
  React.useEffect(() => {
    if (nodesChanged.current && !syncingRef.current) {
      const timer = setTimeout(() => {
        setNodes(nodes);
        nodesChanged.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, setNodes]);

  // Update store when edges change (with debouncing to prevent rapid updates)
  const edgesChanged = React.useRef(false);
  React.useEffect(() => {
    if (edgesChanged.current && !syncingRef.current) {
      const timer = setTimeout(() => {
        setEdges(edges);
        edgesChanged.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, setEdges]);

  const onConnect = React.useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        id: `edge-${Date.now()}`,
        source: params.source!,
        target: params.target!,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
      };
      setLocalEdges((eds) => addEdge(params, eds));
      addEdgeToStore(newEdge);
      edgesChanged.current = true;
    },
    [setLocalEdges, addEdgeToStore],
  );

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const capabilityData = event.dataTransfer.getData('application/reactflow');
      if (!capabilityData || !reactFlowInstance) return;

      const capability: Capability = JSON.parse(capabilityData);
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `node-${Date.now()}`,
        type: capability.nodeType,
        position,
        data: {
          label: capability.name,
          iconName: capability.icon,
          category: capability.category,
          config: {},
          capabilityId: capability.id,
        },
      };

      setLocalNodes((nds) => nds.concat(newNode));
      setNodes([...nodes, newNode]);
      nodesChanged.current = true;
    },
    [reactFlowInstance, nodes, setLocalNodes, setNodes],
  );

  const onNodeClick = React.useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
    },
    [setSelectedNode],
  );

  const onPaneClick = React.useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const handleClearCanvas = React.useCallback(() => {
    if (confirm('Are you sure you want to clear the workflow? This cannot be undone.')) {
      clearWorkflow();
      setLocalNodes([]);
      setLocalEdges([]);
    }
  }, [clearWorkflow, setLocalNodes, setLocalEdges]);

  const handleAutoLayout = React.useCallback(() => {
    autoLayoutWorkflow();
  }, [autoLayoutWorkflow]);

  return (
    <div ref={reactFlowWrapper} className={className} style={{ height: '100%', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-right"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case 'trigger':
                return '#f97316'; // orange
              case 'action':
                return '#22c55e'; // green
              case 'condition':
                return '#eab308'; // yellow
              case 'loop':
                return '#eab308'; // yellow
              case 'ai':
                return '#a855f7'; // purple
              default:
                return '#6b7280'; // gray
            }
          }}
          maskColor="rgb(240, 240, 240, 0.6)"
        />

        {/* Canvas Toolbar */}
        <div className="absolute left-4 top-4 z-10 flex gap-2">
          <Button variant="outline" size="sm" onClick={handleAutoLayout}>
            <Layout className="mr-2 h-4 w-4" />
            Auto Layout
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearCanvas}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>

        {/* Empty State */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="mb-2 text-lg font-semibold text-muted-foreground">
                No workflow yet
              </div>
              <div className="text-sm text-muted-foreground">
                Drag capabilities from the left panel to get started
              </div>
            </div>
          </div>
        )}
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
