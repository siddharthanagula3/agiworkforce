import { NodeProps } from 'reactflow';
import { Play } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { useConfiguratorStore } from '../../../stores/configuratorStore';

export function TriggerNode({ data, selected, id }: NodeProps) {
  const deleteNode = useConfiguratorStore((state) => state.deleteNode);

  return (
    <BaseNode
      data={{
        ...data,
        icon: <Play className="h-4 w-4" />,
      }}
      selected={selected}
      onDelete={() => deleteNode(id)}
      variant="trigger"
      showTargetHandle={false}
      showSourceHandle={true}
    />
  );
}
