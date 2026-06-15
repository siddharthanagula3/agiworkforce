/**
 * DOM (lucide-react) resolver for the cross-surface tool-call icon registry.
 *
 * The icon NAME is decided by the platform-agnostic registry in
 * `@agiworkforce/types` (getToolIconName); this maps that name to a concrete
 * lucide-react component for desktop + web. Mobile has its own resolver against
 * lucide-react-native using the SAME names, so all surfaces show one icon set.
 *
 * Explicit map (not `import * as`) so only the icons we use are bundled.
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

/** Map a lucide icon NAME (from `getToolIconName`) to a lucide-react component. */
export function lucideToolIcon(iconName: string): LucideIcon {
  return BY_NAME[iconName] ?? Wrench;
}
