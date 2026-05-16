import { useMemo, useEffect, useState } from 'react';
import Fuse from 'fuse.js';
import { useChatStore } from '../stores/chat/chatStore';
import { useProjectStore } from '../stores/projectStore';
import { useSkillMarketplaceStore } from '../stores/skillMarketplaceStore';
import { useConnectorsStore } from '../stores/connectorsStore';
import { CONNECTORS } from '../components/Connectors/connectorDefinitions';

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  onClick?: () => void;
}

export interface SearchResultGroup {
  group: 'Chats' | 'Projects' | 'Skills' | 'Connectors' | 'Settings';
  items: SearchResultItem[];
}

const STATIC_SETTINGS: SearchResultItem[] = [
  { id: 'settings-general', title: 'General settings', subtitle: 'Settings' },
  { id: 'settings-appearance', title: 'Appearance', subtitle: 'Settings' },
  { id: 'settings-voice', title: 'Voice settings', subtitle: 'Settings' },
  { id: 'settings-byok', title: 'BYOK & local models', subtitle: 'Settings' },
  { id: 'settings-providers', title: 'Providers', subtitle: 'Settings' },
  { id: 'settings-account', title: 'Account & billing', subtitle: 'Settings' },
  { id: 'settings-notifications', title: 'Notifications', subtitle: 'Settings' },
  { id: 'settings-privacy', title: 'Privacy & security', subtitle: 'Settings' },
];

function fuseSearch<T>(items: T[], keys: string[], query: string): T[] {
  if (!query.trim()) return items;
  const fuse = new Fuse(items, { keys, threshold: 0.4, includeScore: false });
  return fuse.search(query).map((r) => r.item);
}

export function useGlobalSearch(query: string): SearchResultGroup[] {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(id);
  }, [query]);

  const conversations = useChatStore((s) => s.conversations);
  const projects = useProjectStore((s) => s.projects);
  const skills = useSkillMarketplaceStore((s) => s.skills);
  const connectedIds = useConnectorsStore((s) => s.connectedIds);

  return useMemo<SearchResultGroup[]>(() => {
    const q = debouncedQuery.trim();
    const groups: SearchResultGroup[] = [];

    // Chats
    const chatItems = (
      q ? fuseSearch(conversations, ['title', 'lastMessage'], q) : conversations.slice(0, 10)
    ).map((c) => ({
      id: c.id,
      title: c.title || 'Untitled conversation',
      subtitle: c.updatedAt
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'short' }).format(new Date(c.updatedAt))
        : undefined,
    }));
    if (chatItems.length > 0) groups.push({ group: 'Chats', items: chatItems });

    // Projects
    const activeProjects = projects.filter((p) => !p.isArchived);
    const projectItems = (
      q ? fuseSearch(activeProjects, ['name', 'description'], q) : activeProjects.slice(0, 8)
    ).map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: p.description || 'Project',
    }));
    if (projectItems.length > 0) groups.push({ group: 'Projects', items: projectItems });

    // Skills
    const skillItems = (
      q ? fuseSearch(skills, ['name', 'description'], q) : skills.slice(0, 8)
    ).map((s) => ({
      id: `skill-${s.name}`,
      title: s.name,
      subtitle: s.description || 'Skill',
    }));
    if (skillItems.length > 0) groups.push({ group: 'Skills', items: skillItems });

    // Connectors — only connected ones, or all when there's a query
    const relevantConnectors = q
      ? CONNECTORS
      : CONNECTORS.filter((c) => connectedIds.includes(c.id));
    const connectorPool = q
      ? fuseSearch(relevantConnectors, ['name', 'description'], q)
      : relevantConnectors.slice(0, 8);
    const connectorItems = connectorPool.map((c) => ({
      id: `connector-${c.id}`,
      title: c.name,
      subtitle: connectedIds.includes(c.id) ? 'Connector · Connected' : 'Connector',
    }));
    if (connectorItems.length > 0) groups.push({ group: 'Connectors', items: connectorItems });

    // Settings
    const settingsItems = q
      ? fuseSearch(STATIC_SETTINGS, ['title'], q)
      : STATIC_SETTINGS.slice(0, 6);
    if (settingsItems.length > 0) groups.push({ group: 'Settings', items: settingsItems });

    return groups;
  }, [debouncedQuery, conversations, projects, skills, connectedIds]);
}
