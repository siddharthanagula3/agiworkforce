import {
  Folder,
  FolderOpen,
  Code,
  Code2,
  Terminal,
  TerminalSquare,
  FileText,
  FileCode,
  FileSpreadsheet,
  BookOpen,
  LibraryBig,
  Brain,
  Database,
  Globe,
  Calendar,
  CalendarClock,
  GitBranch,
  GitFork,
  Palette,
  Image,
  Camera,
  Video,
  Monitor,
  MessageSquare,
  ListChecks,
  Sparkles,
  ShieldCheck,
  Plug,
  LayoutList,
  Star,
} from '@agiworkforce/icons';
import type { SidebarIconComponent } from './types';

export interface ProjectIconEntry {
  id: string;
  label: string;
  Icon: SidebarIconComponent;
}

export const DEFAULT_PROJECT_ICON_ID = 'folder';

export const PROJECT_ICON_REGISTRY: readonly ProjectIconEntry[] = [
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

const PROJECT_ICON_MAP: ReadonlyMap<string, SidebarIconComponent> = new Map(
  PROJECT_ICON_REGISTRY.map((entry) => [entry.id, entry.Icon]),
);

export function resolveProjectIcon(iconId?: string | null): SidebarIconComponent {
  if (iconId && PROJECT_ICON_MAP.has(iconId)) {
    return PROJECT_ICON_MAP.get(iconId) as SidebarIconComponent;
  }
  return Folder;
}

export function hasKnownProjectIcon(iconId?: string | null): boolean {
  return Boolean(iconId) && PROJECT_ICON_MAP.has(iconId as string);
}

export interface ProjectAccentEntry {
  id: string;
  label: string;
  hex: string;
}

export const PROJECT_ACCENT_REGISTRY: readonly ProjectAccentEntry[] = [
  { id: 'emerald', label: 'Emerald', hex: '#10b981' },
  { id: 'sky', label: 'Sky', hex: '#0ea5e9' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6' },
  { id: 'zinc', label: 'Zinc', hex: '#71717a' },
];

const PROJECT_ACCENT_MAP: ReadonlyMap<string, string> = new Map(
  PROJECT_ACCENT_REGISTRY.map((entry) => [entry.id, entry.hex]),
);

export const DEFAULT_PROJECT_ACCENT_ID = 'zinc';

export function resolveProjectAccentHex(accentId?: string | null): string {
  if (accentId && PROJECT_ACCENT_MAP.has(accentId)) {
    return PROJECT_ACCENT_MAP.get(accentId) as string;
  }
  return PROJECT_ACCENT_MAP.get(DEFAULT_PROJECT_ACCENT_ID) as string;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export function nearestProjectAccentId(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  let bestId = DEFAULT_PROJECT_ACCENT_ID;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of PROJECT_ACCENT_REGISTRY) {
    const [er, eg, eb] = hexToRgb(entry.hex);
    const distance = (r - er) ** 2 + (g - eg) ** 2 + (b - eb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = entry.id;
    }
  }
  return bestId;
}
