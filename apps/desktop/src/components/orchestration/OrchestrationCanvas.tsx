import React, { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useOrchestrationStore } from '../../stores/orchestrationStore';
import { nodeTypes } from './nodes/CustomNodes';
import type { WorkflowNode, WorkflowEdge } from '../../types/workflow';

interface OrchestrationCanvasProps {
  workflowId?: string;
}

export const OrchestrationCanvas: React.FC<OrchestrationCanvasProps> = ({
  workflowId: _workflowId,
}) => {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    addEdge: addStoreEdge,
    selectNode,
    updateNode,
  } = useOrchestrationStore();

  // Convert workflow nodes/edges to React Flow format
  const convertToReactFlowNodes = (nodes: WorkflowNode[]) => {
    return nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    }));
  };

  const convertToReactFlowEdges = (edges: WorkflowEdge[]) => {
    return edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.source_handle,
      targetHandle: edge.target_handle,
      label: edge.label,
      animated: true,
    }));
  };

  const [nodes, setNodes, onNodesChange] = useNodesState(
    convertToReactFlowNodes(storeNodes) as any,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    convertToReactFlowEdges(storeEdges) as any,
  );

  // Update React Flow nodes/edges when store changes
  useEffect(() => {
    setNodes(convertToReactFlowNodes(storeNodes) as any);
    setEdges(convertToReactFlowEdges(storeEdges) as any);
  }, [storeNodes, storeEdges, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge: WorkflowEdge = {
        id: `e${connection.source}-${connection.target}`,
        source: connection.source!,
        target: connection.target!,
        source_handle: connection.sourceHandle || undefined,
        target_handle: connection.targetHandle || undefined,
      };

      addStoreEdge(edge);
    },
    [addStoreEdge],
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: any) => {
      const workflowNode = storeNodes.find((n) => n.id === node.id);
      if (workflowNode) {
        selectNode(workflowNode);
      }
    },
    [storeNodes, selectNode],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: any) => {
      updateNode(node.id, { position: node.position });
    },
    [updateNode],
  );

  return (
    <div className="w-full h-full bg-gray-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        className="bg-gray-50"
      >
        <Background gap={16} size={1} color="#e5e7eb" />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case 'agent':
                return '#3b82f6';
              case 'decision':
                return '#eab308';
              case 'loop':
                return '#a855f7';
              case 'parallel':
                return '#22c55e';
              case 'wait':
                return '#f97316';
              case 'script':
                return '#ef4444';
              case 'tool':
                return '#6366f1';
              default:
                return '#9ca3af';
            }
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
};
