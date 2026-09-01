import { Clock, FolderOpen, MessageSquare, Search, Settings } from '@agiworkforce/icons';
import {
  Box,
  CheckCircle2,
  Code,
  Database,
  Edit3,
  FileText,
  GitBranch,
  Globe,
  HelpCircle,
  Image,
  ListTodo,
  MousePointerClick,
  Terminal,
  Video,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

const BY_NAME: Record<string, LucideIcon> = {
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

export const TOOL_ICON_NAMES = Object.keys(BY_NAME);

export function lucideToolIcon(iconName: string): LucideIcon {
  return BY_NAME[iconName] ?? Wrench;
}
