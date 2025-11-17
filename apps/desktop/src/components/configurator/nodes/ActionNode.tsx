import { NodeProps } from 'reactflow';
import * as Icons from 'lucide-react';
import { BaseNode } from './BaseNode';
import { useConfiguratorStore } from '../../../stores/configuratorStore';

export function ActionNode({ data, selected, id }: NodeProps) {
  const deleteNode = useConfiguratorStore((state) => state.deleteNode);

  // Get icon from lucide-react based on icon name
  // Updated Nov 16, 2025: Improved type safety for dynamic icon lookup
  const IconComponent = (Icons as Record<string, React.ComponentType>)[data.iconName || 'Circle'] || Icons.Circle;

  // Determine variant based on capability category
  const variant = data.category === 'data' ? 'data' : 'action';

  return (
    <BaseNode
      data={{
        ...data,
        icon: <IconComponent className="h-4 w-4" />,
      }}
      selected={selected}
      onDelete={() => deleteNode(id)}
      variant={variant}
      showTargetHandle={true}
      showSourceHandle={true}
      status={data.status}
    />
  );
}
