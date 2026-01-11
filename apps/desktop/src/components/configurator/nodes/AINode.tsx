import { NodeProps } from 'reactflow';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { useConfiguratorStore } from '../../../stores/configuratorStore';

function resolveIcon(iconName?: string): LucideIcon {
  const icon = iconName ? (Icons as Record<string, unknown>)[iconName] : undefined;
  return typeof icon === 'function' ? (icon as LucideIcon) : Icons.Sparkles;
}

export function AINode({ data, selected, id }: NodeProps) {
  const deleteNode = useConfiguratorStore((state) => state.deleteNode);

  // Get icon from lucide-react based on icon name or use Sparkles as default
  // Updated Nov 16, 2025: Improved type safety for dynamic icon lookup
  const IconComponent = resolveIcon(data.iconName);

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
