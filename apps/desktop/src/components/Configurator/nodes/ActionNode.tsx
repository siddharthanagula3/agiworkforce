import { NodeProps } from '@xyflow/react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { useConfiguratorStore } from '../../../stores/configuratorStore';

const defaultIcon: LucideIcon = Icons.Circle;

function resolveIcon(iconName?: string): LucideIcon {
  const icon = iconName ? (Icons as Record<string, unknown>)[iconName] : undefined;
  return typeof icon === 'function' ? (icon as LucideIcon) : defaultIcon;
}

type NodeStatus = 'idle' | 'running' | 'success' | 'error';

export function ActionNode({ data, selected, id }: NodeProps) {
  const deleteNode = useConfiguratorStore((state) => state.deleteNode);

  // Get icon from lucide-react based on icon name
  // Updated Nov 16, 2025: Improved type safety for dynamic icon lookup
  const IconComponent = resolveIcon(data['iconName'] as string | undefined);

  // Determine variant based on capability category
  const variant = data['category'] === 'data' ? 'data' : 'action';

  // Extract and type-assert status
  const status = (data['status'] as NodeStatus | undefined) ?? 'idle';

  return (
    <BaseNode
      data={{
        label: (data['label'] as string) ?? 'Action',
        icon: <IconComponent className="h-4 w-4" />,
        config: data['config'],
      }}
      selected={selected}
      onDelete={() => deleteNode(id)}
      variant={variant}
      showTargetHandle={true}
      showSourceHandle={true}
      status={status}
    />
  );
}
