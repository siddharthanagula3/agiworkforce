import type { NodeProps, Node } from '@xyflow/react';
import { Play } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { useConfiguratorStore } from '../../../stores/configuratorStore';

interface TriggerNodeData {
  label: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

type TriggerNodeProps = NodeProps<Node<TriggerNodeData>>;

export function TriggerNode({ data, selected, id }: TriggerNodeProps) {
  const deleteNode = useConfiguratorStore((state) => state.deleteNode);

  return (
    <BaseNode
      data={{
        label: data.label,
        icon: <Play className="h-4 w-4" />,
        config: data.config,
      }}
      selected={selected}
      onDelete={() => deleteNode(id)}
      variant="trigger"
      showTargetHandle={false}
      showSourceHandle={true}
    />
  );
}
