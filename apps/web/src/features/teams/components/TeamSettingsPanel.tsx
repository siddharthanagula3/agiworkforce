/**
 * TeamSettingsPanel - Team management with RBAC
 *
 * Features:
 * - Edit team name and description
 * - Member list with role badges (admin=purple, editor=blue, viewer=gray)
 * - Invite member form (email + role dropdown)
 * - Change role dropdown per member
 * - Remove member button (admin only)
 * - Role permissions info section
 */

'use client';

import { useState, useCallback } from 'react';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Label } from '@shared/ui/label';
import { Textarea } from '@shared/ui/textarea';
import { Badge } from '@shared/ui/badge';
import { ScrollArea } from '@shared/ui/scroll-area';
import { Separator } from '@shared/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@shared/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/ui/tooltip';
import { cn } from '@shared/lib/utils';
import { toast } from 'sonner';
import {
  Users,
  UserPlus,
  Shield,
  Pencil,
  Eye,
  Trash2,
  Info,
  Crown,
  Mail,
  Save,
} from 'lucide-react';
import { useTeamStore, type Team, type TeamMember, type TeamRole } from '../stores/team-store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<TeamRole, { label: string; color: string; icon: React.ReactNode }> = {
  admin: {
    label: 'Admin',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    icon: <Shield className="h-3 w-3" />,
  },
  editor: {
    label: 'Editor',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    icon: <Pencil className="h-3 w-3" />,
  },
  viewer: {
    label: 'Viewer',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
    icon: <Eye className="h-3 w-3" />,
  },
};

const ROLE_PERMISSIONS: Array<{
  role: TeamRole;
  description: string;
  permissions: string[];
}> = [
  {
    role: 'admin',
    description: 'Full access to all team features',
    permissions: [
      'Manage team members (invite, remove, change roles)',
      'Create, edit, and delete projects and conversations',
      'Delete team',
      'Change team settings',
    ],
  },
  {
    role: 'editor',
    description: 'Create and edit content',
    permissions: [
      'Create and edit projects and conversations',
      'View all team content',
      'Cannot manage members or delete the team',
    ],
  },
  {
    role: 'viewer',
    description: 'Read-only access',
    permissions: [
      'View shared projects and conversations',
      'Cannot create, edit, or delete any content',
      'Cannot manage members',
    ],
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TeamSettingsPanelProps {
  teamId: string;
  /** The current user's ID, used to determine permission level. */
  currentUserId: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: TeamRole }) {
  const config = ROLE_CONFIG[role];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        config.color,
      )}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function MemberRow({
  member,
  isOwner,
  isCurrentUser,
  canManage,
  onRoleChange,
  onRemove,
}: {
  member: TeamMember;
  isOwner: boolean;
  isCurrentUser: boolean;
  canManage: boolean;
  onRoleChange: (memberId: string, role: TeamRole) => void;
  onRemove: (memberId: string) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card p-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar placeholder */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{member.name}</span>
              {isOwner && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    </TooltipTrigger>
                    <TooltipContent>Team owner</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {isCurrentUser && <span className="text-xs text-muted-foreground">(you)</span>}
            </div>
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canManage && !isOwner ? (
            <Select
              value={member.role}
              onValueChange={(value: string) => onRoleChange(member.id, value as TeamRole)}
            >
              <SelectTrigger
                className="h-8 w-[110px] text-xs"
                aria-label={`Role for ${member.name}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <RoleBadge role={member.role} />
          )}

          {canManage && !isOwner && !isCurrentUser && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmRemove(true)}
                    aria-label={`Remove ${member.name} from team`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove member</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Remove confirmation dialog */}
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{member.name}</strong> ({member.email}) from
              this team? They will lose access to all team resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onRemove(member.id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RolePermissionsInfo() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Role permissions</h4>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {ROLE_PERMISSIONS.map(({ role, description, permissions }) => {
          return (
            <div key={role} className="rounded-lg border border-border/50 bg-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <RoleBadge role={role} />
              </div>
              <p className="text-xs text-muted-foreground">{description}</p>
              <ul className="space-y-1">
                {permissions.map((perm) => (
                  <li key={perm} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {perm}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TeamSettingsPanel({ teamId, currentUserId, className }: TeamSettingsPanelProps) {
  const teams = useTeamStore((s) => s.teams);
  const updateTeam = useTeamStore((s) => s.updateTeam);
  const inviteMember = useTeamStore((s) => s.inviteMember);
  const updateMemberRole = useTeamStore((s) => s.updateMemberRole);
  const removeMember = useTeamStore((s) => s.removeMember);
  const canManageMembers = useTeamStore((s) => s.canManageMembers);

  const team = teams.find((t) => t.id === teamId);
  const isAdmin = canManageMembers(teamId, currentUserId);

  // Team info editing state
  const [editName, setEditName] = useState(team?.name ?? '');
  const [editDescription, setEditDescription] = useState(team?.description ?? '');
  const [nameChanged, setNameChanged] = useState(false);
  const [descChanged, setDescChanged] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('viewer');

  const handleSaveTeamInfo = useCallback(() => {
    if (!team) return;
    const updates: Partial<Pick<Team, 'name' | 'description'>> = {};
    if (nameChanged) updates.name = editName.trim();
    if (descChanged) updates.description = editDescription.trim();
    if (Object.keys(updates).length === 0) return;
    updateTeam(teamId, updates);
    setNameChanged(false);
    setDescChanged(false);
    toast.success('Team settings updated');
  }, [team, teamId, editName, editDescription, nameChanged, descChanged, updateTeam]);

  const handleInvite = useCallback(() => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      toast.error('Please enter an email address');
      return;
    }
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    // Check for duplicate
    if (team?.members.some((m) => m.email.toLowerCase() === email)) {
      toast.error('This person is already a member of this team');
      return;
    }
    inviteMember(teamId, email, inviteRole);
    setInviteEmail('');
    setInviteRole('viewer');
    toast.success(`Invited ${email} as ${inviteRole}`);
  }, [inviteEmail, inviteRole, teamId, team, inviteMember]);

  const handleRoleChange = useCallback(
    (memberId: string, role: TeamRole) => {
      updateMemberRole(teamId, memberId, role);
      toast.success('Member role updated');
    },
    [teamId, updateMemberRole],
  );

  const handleRemoveMember = useCallback(
    (memberId: string) => {
      removeMember(teamId, memberId);
      toast.success('Member removed from team');
    },
    [teamId, removeMember],
  );

  if (!team) {
    return (
      <div className={cn('flex items-center justify-center p-8 text-muted-foreground', className)}>
        Team not found
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* ------------------------------------------------------------------ */}
      {/* Team info section                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" />
          Team settings
        </h3>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Team name</Label>
            <Input
              id="team-name"
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
                setNameChanged(e.target.value !== team.name);
              }}
              placeholder="My team"
              disabled={!isAdmin}
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-description">Description</Label>
            <Textarea
              id="team-description"
              value={editDescription}
              onChange={(e) => {
                setEditDescription(e.target.value);
                setDescChanged(e.target.value !== team.description);
              }}
              placeholder="What is this team about?"
              disabled={!isAdmin}
              rows={3}
              maxLength={500}
            />
          </div>

          {isAdmin && (nameChanged || descChanged) && (
            <Button size="sm" onClick={handleSaveTeamInfo}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save changes
            </Button>
          )}
        </div>
      </section>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Invite member section (admin only)                                  */}
      {/* ------------------------------------------------------------------ */}
      {isAdmin && (
        <>
          <section className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Invite member
            </h3>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="invite-email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="pl-9"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleInvite();
                      }
                    }}
                  />
                </div>
              </div>

              <div className="w-full sm:w-[140px] space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(value: string) => setInviteRole(value as TeamRole)}
                >
                  <SelectTrigger id="invite-role" aria-label="Select role for new member">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleInvite} className="shrink-0">
                <UserPlus className="mr-1.5 h-4 w-4" />
                Invite
              </Button>
            </div>
          </section>

          <Separator />
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Member list                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            Members
          </h3>
          <Badge variant="secondary" className="text-xs">
            {team.members.length} {team.members.length === 1 ? 'member' : 'members'}
          </Badge>
        </div>

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2">
            {team.members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isOwner={member.userId === team.ownerId}
                isCurrentUser={member.userId === currentUserId}
                canManage={isAdmin}
                onRoleChange={handleRoleChange}
                onRemove={handleRemoveMember}
              />
            ))}
          </div>
        </ScrollArea>
      </section>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Role permissions info                                               */}
      {/* ------------------------------------------------------------------ */}
      <RolePermissionsInfo />
    </div>
  );
}
