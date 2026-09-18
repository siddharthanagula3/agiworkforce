import { TOOL_STATUS_PRESENTATION } from '@agiworkforce/types';
import type { ToolStatus, ToolStatusTone } from '@agiworkforce/types';
import type { ColorScheme } from '@/src/ui/theme';

export function toneColor(tone: ToolStatusTone, colors: ColorScheme): string {
  if (tone === 'active') return colors.agentActive;
  if (tone === 'success') return colors.agentSuccess;
  if (tone === 'warning') return colors.agentWarning;
  if (tone === 'error') return colors.agentError;
  return colors.textMuted;
}

export function toolStatusColor(status: ToolStatus, colors: ColorScheme): string {
  return toneColor(TOOL_STATUS_PRESENTATION[status].tone, colors);
}
