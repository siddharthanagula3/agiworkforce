/**
 * connectorData.ts
 *
 * Static connector definitions for the Connectors page.
 * Categories and services match the spec in docs/MOBILE_APP_SPEC.md.
 */

import {
  Cloud,
  GitBranch,
  MessageSquare,
  Mail,
  Calendar,
  FolderOpen,
  FileText,
  type LucideIcon,
} from 'lucide-react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectorCategory = 'cloud' | 'productivity' | 'communication' | 'email';

export interface Connector {
  id: string;
  name: string;
  description: string;
  category: ConnectorCategory;
}

export interface ConnectorCategoryInfo {
  key: ConnectorCategory;
  title: string;
  icon: LucideIcon;
  color: string;
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

export const CONNECTOR_CATEGORIES: ConnectorCategoryInfo[] = [
  { key: 'cloud', title: 'Cloud Storage', icon: Cloud, color: '#3b82f6' },
  { key: 'productivity', title: 'Productivity', icon: GitBranch, color: '#a855f7' },
  { key: 'communication', title: 'Communication', icon: MessageSquare, color: '#10b981' },
  { key: 'email', title: 'Email & Calendar', icon: Mail, color: '#f59e0b' },
];

// ---------------------------------------------------------------------------
// Icon + color registry for each connector
// ---------------------------------------------------------------------------

interface ConnectorMeta {
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

export const CONNECTOR_META: Record<string, ConnectorMeta> = {
  'google-drive': { icon: FolderOpen, color: '#4285F4', bgColor: 'rgba(66,133,244,0.15)' },
  dropbox: { icon: FolderOpen, color: '#0061FF', bgColor: 'rgba(0,97,255,0.15)' },
  onedrive: { icon: FolderOpen, color: '#0078D4', bgColor: 'rgba(0,120,212,0.15)' },
  github: { icon: GitBranch, color: '#8B5CF6', bgColor: 'rgba(139,92,246,0.15)' },
  linear: { icon: FileText, color: '#5E6AD2', bgColor: 'rgba(94,106,210,0.15)' },
  jira: { icon: FileText, color: '#0052CC', bgColor: 'rgba(0,82,204,0.15)' },
  notion: { icon: FileText, color: '#FFFFFF', bgColor: 'rgba(255,255,255,0.10)' },
  slack: { icon: MessageSquare, color: '#4A154B', bgColor: 'rgba(74,21,75,0.20)' },
  teams: { icon: MessageSquare, color: '#6264A7', bgColor: 'rgba(98,100,167,0.15)' },
  gmail: { icon: Mail, color: '#EA4335', bgColor: 'rgba(234,67,53,0.15)' },
  'google-calendar': { icon: Calendar, color: '#4285F4', bgColor: 'rgba(66,133,244,0.15)' },
};

// ---------------------------------------------------------------------------
// Full connector list (v1)
// ---------------------------------------------------------------------------

export const CONNECTORS: Connector[] = [
  // Cloud Storage
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Get in-depth answers from your Google Drive content',
    category: 'cloud',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Get in-depth answers from your Dropbox content',
    category: 'cloud',
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    description: 'Get in-depth answers from your OneDrive content',
    category: 'cloud',
  },

  // Productivity
  {
    id: 'github',
    name: 'GitHub',
    description: 'Search and manage your GitHub repositories',
    category: 'productivity',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Plan and track projects, issues, and team workflows',
    category: 'productivity',
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Plan and track projects, tasks, and team workflows',
    category: 'productivity',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Search and create content on your Notion pages',
    category: 'productivity',
  },

  // Communication
  {
    id: 'slack',
    name: 'Slack',
    description: 'Search and post messages across your Slack workspace',
    category: 'communication',
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    description: 'Search and send messages in Microsoft Teams',
    category: 'communication',
  },

  // Email & Calendar
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Search, create, and manage your emails',
    category: 'email',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Create and manage calendar events',
    category: 'email',
  },
];
