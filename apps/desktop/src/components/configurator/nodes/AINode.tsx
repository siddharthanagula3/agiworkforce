import * as React from 'react';
import { NodeProps } from 'reactflow';
import { Sparkles } from 'lucide-react';
import * as Icons from 'lucide-react';
import { BaseNode } from './BaseNode';
import { useConfiguratorStore } from '../../../stores/configuratorStore';

export function AINode({ data, selected, id }: NodeProps) {
  const deleteNode = useConfiguratorStore((state) => state.deleteNode);

  // Get icon from lucide-react based on icon name or use Sparkles as default
  const IconComponent = (Icons as any)[data.iconName || 'Sparkles'] || Icons.Sparkles;

  return (
    <BaseNode
      data={{
        ...data,
        icon: <IconComponent className="h-4 w-4" />,
      }}
      selected={selected}
      onDelete={() => deleteNode(id)}
      variant="ai"
      showTargetHandle={true}
      showSourceHandle={true}
      status={data.status}
    />
  );
}
