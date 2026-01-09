import type { NodeProps, Node } from '@xyflow/react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { useConfiguratorStore } from '../../../stores/configuratorStore';

interface ActionNodeData {
  label: string;
  iconName?: string;
  category?: 'data' | 'action';
  config?: Record<string, unknown>;
  status?: 'idle' | 'running' | 'success' | 'error';
  [key: string]: unknown;
}

type ActionNodeProps = NodeProps<Node<ActionNodeData>>;

const defaultIcon: LucideIcon = Icons.Circle;

function resolveIcon(iconName?: string): LucideIcon {
  const icon = iconName ? (Icons as Record<string, unknown>)[iconName] : undefined;
  return typeof icon === 'function' ? (icon as LucideIcon) : defaultIcon;
}

export function ActionNode({ data, selected, id }: ActionNodeProps) {
  const deleteNode = useConfiguratorStore((state) => state.deleteNode);

  const IconComponent = resolveIcon(data.iconName);

  const variant = data.category === 'data' ? 'data' : 'action';

  return (
    <BaseNode
      data={{
        label: data.label,
        icon: <IconComponent className="h-4 w-4" />,
        config: data.config,
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
