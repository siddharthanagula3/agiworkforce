import type { EnhancedMessage } from '../../../stores/chat/types';
import type { WidgetData } from './WidgetList';

export function getMessageWidgets(message: EnhancedMessage): WidgetData[] {
  const metadata = message.metadata as Record<string, unknown> | undefined;
  if (Array.isArray(metadata?.['widgets'])) {
    return metadata['widgets'] as WidgetData[];
  }

  if (Array.isArray(metadata?.['toolWidgets'])) {
    return metadata['toolWidgets'] as WidgetData[];
  }

  return [];
}
