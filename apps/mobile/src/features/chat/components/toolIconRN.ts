/**
 * React Native (lucide-react-native) resolver for the cross-surface tool-call
 * icon registry.
 *
 * The icon NAME is decided by the platform-agnostic registry in
 * `@agiworkforce/types` (getToolIconName) — the SAME registry desktop/web use
 * via lucide-react. This maps that name to a lucide-react-native component so
 * mobile renders the identical icon for the same tool. Replaces the per-file
 * ad-hoc substring `getToolIcon` mappings that previously drifted apart.
 */
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

/** Resolve a tool name (or friendly label) to a lucide-react-native icon. */
export function lucideRNToolIcon(
  toolName: string | null | undefined,
  category?: ToolDisplayCategory | null,
): typeof Terminal {
  return BY_NAME[getToolIconName(toolName, category)] ?? Wrench;
}

/** Resolve an already-known icon name (e.g. from getFileExtensionIconName) directly. */
export function lucideRNIconByName(iconName: string): typeof Terminal {
  return BY_NAME[iconName] ?? Wrench;
}
