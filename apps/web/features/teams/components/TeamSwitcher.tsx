/**
 * TeamSwitcher - Header dropdown for switching between teams
 *
 * Features:
 * - Shows current team name with avatar initial
 * - Dropdown to switch between teams
 * - "Personal" option (no team)
 * - "Create Team" option with inline dialog
 */

'use client';

import { useState, useCallback } from 'react';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Label } from '@shared/ui/label';
import { Textarea } from '@shared/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shared/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/ui/dialog';
import { cn } from '@shared/lib/utils';
import { toast } from 'sonner';
import { ChevronDown, Users, Plus, User, Check, Settings } from 'lucide-react';
import { useTeamStore, type Team } from '../stores/team-store';
import { useAuth } from '@/stores/unified/auth';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TeamSwitcherProps {
  /** Called when the user wants to open team settings for a team. */
  onOpenTeamSettings?: (teamId: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TeamAvatar({ team, size = 'sm' }: { team: Team | null; size?: 'sm' | 'md' }) {
  const dimension = size === 'sm' ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-sm';

  if (!team) {
    return (
      <div
        className={cn('flex shrink-0 items-center justify-center rounded-full bg-muted', dimension)}
      >
        <User className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary',
        dimension,
      )}
    >
      {team.name.charAt(0).toUpperCase()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TeamSwitcher({ onOpenTeamSettings, className }: TeamSwitcherProps) {
  const { user } = useAuth();
  const teams = useTeamStore((s) => s.teams);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeam = useTeamStore((s) => s.setActiveTeam);
  const createTeam = useTeamStore((s) => s.createTeam);

  const activeTeam = activeTeamId ? (teams.find((t) => t.id === activeTeamId) ?? null) : null;

  // Create team dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');

  const handleSelectPersonal = useCallback(() => {
    setActiveTeam(null);
  }, [setActiveTeam]);

  const handleSelectTeam = useCallback(
    (teamId: string) => {
      setActiveTeam(teamId);
    },
    [setActiveTeam],
  );

  const handleCreateTeam = useCallback(() => {
    const name = newTeamName.trim();
    if (!name) {
      toast.error('Please enter a team name');
      return;
    }
    const teamId = createTeam(name, newTeamDescription.trim(), user?.id);
    setActiveTeam(teamId);
    setCreateOpen(false);
    setNewTeamName('');
    setNewTeamDescription('');
    toast.success(`Team "${name}" created`);
  }, [newTeamName, newTeamDescription, createTeam, setActiveTeam, user?.id]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn('flex items-center gap-2 px-2 py-1.5 h-auto font-normal', className)}
            aria-label="Switch team"
          >
            <TeamAvatar team={activeTeam} />
            <span className="max-w-[140px] truncate text-sm">
              {activeTeam ? activeTeam.name : 'Personal'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-[220px]">
          {/* Personal workspace */}
          <DropdownMenuItem className="flex items-center gap-2" onClick={handleSelectPersonal}>
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">Personal</span>
            {activeTeamId === null && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>

          {/* Team list */}
          {teams.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {teams.map((team) => (
                <DropdownMenuItem
                  key={team.id}
                  className="flex items-center gap-2"
                  onClick={() => handleSelectTeam(team.id)}
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 truncate">{team.name}</span>
                  <div className="flex items-center gap-1">
                    {activeTeamId === team.id && <Check className="h-4 w-4 text-primary" />}
                    {onOpenTeamSettings && (
                      <button
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTeamSettings(team.id);
                        }}
                        aria-label={`Settings for ${team.name}`}
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          )}

          {/* Create team */}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="flex items-center gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span>Create team</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* -------------------------------------------------------------- */}
      {/* Create Team dialog                                              */}
      {/* -------------------------------------------------------------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Create team
            </DialogTitle>
            <DialogDescription>
              Create a new team to collaborate with others. You will be the team admin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-team-name">Team name</Label>
              <Input
                id="create-team-name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g. Engineering"
                maxLength={100}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateTeam();
                  }
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-team-desc">Description (optional)</Label>
              <Textarea
                id="create-team-desc"
                value={newTeamDescription}
                onChange={(e) => setNewTeamDescription(e.target.value)}
                placeholder="What is this team working on?"
                rows={3}
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTeam} disabled={!newTeamName.trim()}>
              <Users className="mr-1.5 h-4 w-4" />
              Create team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
