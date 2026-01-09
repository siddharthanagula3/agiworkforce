import type { NodeProps, Node } from '@xyflow/react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { useConfiguratorStore } from '../../../stores/configuratorStore';

interface AINodeData {
  label: string;
  iconName?: string;
  config?: Record<string, unknown>;
  status?: 'idle' | 'running' | 'success' | 'error';
  [key: string]: unknown;
}

type AINodeProps = NodeProps<Node<AINodeData>>;

function resolveIcon(iconName?: string): LucideIcon {
  const icon = iconName ? (Icons as Record<string, unknown>)[iconName] : undefined;
  return typeof icon === 'function' ? (icon as LucideIcon) : Icons.Sparkles;
}

export function AINode({ data, selected, id }: AINodeProps) {
  const deleteNode = useConfiguratorStore((state) => state.deleteNode);

  const IconComponent = resolveIcon(data.iconName);

  return (
    <BaseNode
      data={{
        label: data.label,
        icon: <IconComponent className="h-4 w-4" />,
        config: data.config,
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
