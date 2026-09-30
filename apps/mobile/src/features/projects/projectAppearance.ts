import {
  BookOpen,
  Brain,
  Calendar,
  CalendarClock,
  Camera,
  Code,
  Code2,
  Database,
  FileCode,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  GitFork,
  Globe,
  Image,
  LayoutList,
  LibraryBig,
  ListChecks,
  MessageSquare,
  Monitor,
  Palette,
  Plug,
  ShieldCheck,
  Sparkles,
  Star,
  Terminal,
  TerminalSquare,
  Video,
  type LucideIcon,
} from 'lucide-react-native';
import { agiProjectAccents } from '@agiworkforce/design-tokens';
import type { ManagedCloudProject } from '@agiworkforce/cloud-contracts';

export type ProjectAccentId = NonNullable<ManagedCloudProject['accentColor']>;

export const PROJECT_ICONS: readonly { id: string; label: string; Icon: LucideIcon }[] = [
  { id: 'folder', label: 'Folder', Icon: Folder },
  { id: 'code', label: 'Code', Icon: Code },
  { id: 'code-2', label: 'Code blocks', Icon: Code2 },
  { id: 'terminal', label: 'Terminal', Icon: Terminal },
  { id: 'terminal-square', label: 'Console', Icon: TerminalSquare },
  { id: 'file-text', label: 'Document', Icon: FileText },
  { id: 'file-code', label: 'Source file', Icon: FileCode },
  { id: 'file-spreadsheet', label: 'Spreadsheet', Icon: FileSpreadsheet },
  { id: 'book-open', label: 'Reading', Icon: BookOpen },
  { id: 'library', label: 'Library', Icon: LibraryBig },
  { id: 'brain', label: 'Research', Icon: Brain },
  { id: 'database', label: 'Data', Icon: Database },
  { id: 'globe', label: 'Web', Icon: Globe },
  { id: 'calendar', label: 'Calendar', Icon: Calendar },
  { id: 'calendar-clock', label: 'Schedule', Icon: CalendarClock },
  { id: 'git-branch', label: 'Branch', Icon: GitBranch },
  { id: 'git-fork', label: 'Fork', Icon: GitFork },
  { id: 'palette', label: 'Design', Icon: Palette },
  { id: 'image', label: 'Image', Icon: Image },
  { id: 'camera', label: 'Camera', Icon: Camera },
  { id: 'video', label: 'Video', Icon: Video },
  { id: 'monitor', label: 'Screen', Icon: Monitor },
  { id: 'message-square', label: 'Chat', Icon: MessageSquare },
  { id: 'list-checks', label: 'Tasks', Icon: ListChecks },
  { id: 'sparkles', label: 'Highlights', Icon: Sparkles },
  { id: 'shield-check', label: 'Security', Icon: ShieldCheck },
  { id: 'plug', label: 'Integrations', Icon: Plug },
  { id: 'layout-list', label: 'Outline', Icon: LayoutList },
  { id: 'star', label: 'Favorite', Icon: Star },
  { id: 'folder-open', label: 'Open folder', Icon: FolderOpen },
];

export const PROJECT_ACCENTS: readonly { id: ProjectAccentId; label: string; hex: string }[] =
  agiProjectAccents;

export function projectIcon(iconId: string | null | undefined): LucideIcon {
  return PROJECT_ICONS.find((entry) => entry.id === iconId)?.Icon ?? Folder;
}

export function projectAccentHex(accentId: string | null | undefined): string | null {
  return PROJECT_ACCENTS.find((entry) => entry.id === accentId)?.hex ?? null;
}
