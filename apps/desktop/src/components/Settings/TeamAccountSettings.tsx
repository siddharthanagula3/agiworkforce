/**
 * TeamAccountSettings
 *
 * Enhanced account/team/device visibility panel.
 * Renders inside SettingsPanel at the 'account' tab alongside AccountSettings.
 *
 * Sections:
 *  - Team Panel: members with roles + online status
 *  - Device Management: connected devices with last-seen + disconnect
 *  - Project Switcher: quick switch with name, description, member count
 */
import {
  CheckCircle2,
  Globe,
  Laptop2,
  Loader2,
  LogOut,
  Monitor,
  Phone,
  Puzzle,
  RefreshCw,
  Shield,
  Users2,
  Folders,
  Crown,
  Eye,
  Pencil,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { invoke } from '../../lib/tauri-mock';
import { Button } from '../ui/Button';
import { useTeamStore } from '../../stores/teamStore';
import { useProjectStore } from '../../stores/projectStore';
import { toast } from 'sonner';
import { TeamRole } from '../../types/teams';

// =============================================================================
// Types
// =============================================================================

interface ConnectedDevice {
  id: string;
  name: string;
  type: 'desktop' | 'mobile' | 'extension' | 'web';
  platform: string;
  lastSeen: string;
  current: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function formatLastSeen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function roleLabel(role: TeamRole): { text: string; icon: React.ElementType; color: string } {
  switch (role) {
    case TeamRole.Owner:
      return { text: 'Owner', icon: Crown, color: 'text-amber-500' };
    case TeamRole.Admin:
      return { text: 'Admin', icon: Shield, color: 'text-blue-500' };
    case TeamRole.Editor:
      return { text: 'Editor', icon: Pencil, color: 'text-green-500' };
    case TeamRole.Viewer:
    default:
      return { text: 'Viewer', icon: Eye, color: 'text-muted-foreground' };
  }
}

function deviceIcon(type: ConnectedDevice['type']): React.ElementType {
  switch (type) {
    case 'desktop':
      return Monitor;
    case 'mobile':
      return Phone;
    case 'extension':
      return Puzzle;
    case 'web':
    default:
      return Globe;
  }
}

// =============================================================================
// Team Panel
// =============================================================================

function TeamPanel() {
  const currentTeam = useTeamStore((s) => s.currentTeam);
  const members = useTeamStore((s) => s.members);
  const isLoadingMembers = useTeamStore((s) => s.isLoadingMembers);
  const getTeamMembers = useTeamStore((s) => s.getTeamMembers);

  useEffect(() => {
    if (currentTeam) {
      void getTeamMembers(currentTeam.id);
    }
  }, [currentTeam, getTeamMembers]);

  if (!currentTeam) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Users2 className="h-4 w-4" />
          Team Members
        </h4>
        <p className="text-sm text-muted-foreground">
          You are not part of any team. Create or join a team to collaborate.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Users2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{currentTeam.name}</span>
          <span className="text-xs text-muted-foreground">({members.length} members)</span>
        </div>
        {isLoadingMembers && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="divide-y divide-border">
        {members.length === 0 && !isLoadingMembers && (
          <p className="px-4 py-3 text-sm text-muted-foreground">No members found.</p>
        )}
        {members.map((member) => {
          const role = roleLabel(member.role);
          const RoleIcon = role.icon;
          // Derive initials from userId since we don't have display names in TeamMember
          const initials = member.userId.slice(0, 2).toUpperCase();

          return (
            <div key={member.userId} className="flex items-center gap-3 px-4 py-3">
              {/* Avatar */}
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white">
                {initials}
                {/* Online indicator — placeholder: show green for owner */}
                <span
                  className={cn(
                    'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card',
                    member.role === TeamRole.Owner ? 'bg-green-500' : 'bg-muted-foreground/30',
                  )}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{member.userId}</p>
                <p className="text-xs text-muted-foreground">
                  Joined {formatLastSeen(new Date(member.joinedAt).toISOString())}
                </p>
              </div>

              {/* Role badge */}
              <span
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted',
                  role.color,
                )}
              >
                <RoleIcon className="h-2.5 w-2.5" />
                {role.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Device Management
// =============================================================================

function DeviceManagement() {
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<ConnectedDevice[]>('account_list_devices').catch(() => {
        // Fallback: show current device only
        const current: ConnectedDevice = {
          id: 'current',
          name: 'This Desktop',
          type: 'desktop',
          platform: typeof navigator !== 'undefined' ? navigator.platform : 'Unknown',
          lastSeen: new Date().toISOString(),
          current: true,
        };
        return [current];
      });
      setDevices(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const handleDisconnect = useCallback(async (deviceId: string) => {
    setDisconnecting(deviceId);
    try {
      await invoke('account_disconnect_device', { deviceId });
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
      toast.success('Device disconnected');
    } catch (err) {
      console.error('[DeviceManagement] disconnect failed:', err);
      toast.error('Failed to disconnect device');
    } finally {
      setDisconnecting(null);
    }
  }, []);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Laptop2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Connected Devices</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => void loadDevices()}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="divide-y divide-border">
        {devices.length === 0 && !loading && (
          <p className="px-4 py-3 text-sm text-muted-foreground">No devices found.</p>
        )}
        {devices.map((device) => {
          const DeviceIcon = deviceIcon(device.type);
          return (
            <div key={device.id} className="flex items-center gap-3 px-4 py-3">
              {/* Icon */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <DeviceIcon className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{device.name}</p>
                  {device.current && (
                    <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-500">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Current
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {device.platform} · Last seen {formatLastSeen(device.lastSeen)}
                </p>
              </div>

              {/* Disconnect */}
              {!device.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => void handleDisconnect(device.id)}
                  disabled={disconnecting === device.id}
                >
                  {disconnecting === device.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <LogOut className="h-3 w-3 mr-1" />
                      Disconnect
                    </>
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Project Switcher
// =============================================================================

function ProjectSwitcher() {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const visibleProjects = projects.filter((p) => !p.isArchived).slice(0, 10);

  if (visibleProjects.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Folders className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm">Projects</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {visibleProjects.length} active
        </span>
      </div>

      <div className="divide-y divide-border max-h-64 overflow-y-auto">
        {visibleProjects.map((project) => {
          const isActive = project.id === activeProjectId;
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => setActiveProject(project.id)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                'hover:bg-accent',
                isActive && 'bg-accent/60',
              )}
            >
              {/* Color dot */}
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0 bg-primary"
                style={{ backgroundColor: project.color ?? undefined }}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{project.name}</p>
                {project.description && (
                  <p className="text-xs text-muted-foreground truncate">{project.description}</p>
                )}
              </div>

              {/* Conversation count */}
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {project.conversationIds.length} chats
              </span>

              {isActive && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Main export
// =============================================================================

export function TeamAccountSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Team & Collaboration</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Manage your team members, connected devices, and active projects.
        </p>
      </div>

      <TeamPanel />

      <DeviceManagement />

      <ProjectSwitcher />
    </div>
  );
}
