import {
  Box,
  CheckCircle2,
  Clock,
  Code,
  Database,
  Edit3,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  HelpCircle,
  Image,
  ListTodo,
  MessageSquare,
  MousePointerClick,
  Search,
  Settings,
  Terminal,
  Video,
  Wrench,
} from 'lucide-react-native';
import { getToolIconName, type ToolDisplayCategory } from '@agiworkforce/types';

const BY_NAME: Record<string, typeof Terminal> = {
  Box,
  CheckCircle2,
  Clock,
  Code,
  Database,
  Edit3,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  HelpCircle,
  Image,
  ListTodo,
  MessageSquare,
  MousePointerClick,
  Search,
  Settings,
  Terminal,
  Video,
  Wrench,
};

export function lucideRNToolIcon(
  toolName: string | null | undefined,
  category?: ToolDisplayCategory | null,
): typeof Terminal {
  return BY_NAME[getToolIconName(toolName, category)] ?? Wrench;
}

export function lucideRNIconByName(iconName: string): typeof Terminal {
  return BY_NAME[iconName] ?? Wrench;
}
