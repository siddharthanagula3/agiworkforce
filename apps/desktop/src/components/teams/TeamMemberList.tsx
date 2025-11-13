import React, { useState } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import type { TeamMember, Team, TeamRole } from '../../types/teams';
import { hasPermission, Permission, canModifyRole, canRemoveRole } from '../../types/teams';
import { Button } from '../ui/Button';
import { UserMinus, Shield, Edit2 } from 'lucide-react';

interface TeamMemberListProps {
  members: TeamMember[];
  currentTeam: Team;
  isLoading: boolean;
}

export const TeamMemberList: React.FC<TeamMemberListProps> = ({
  members,
  currentTeam,
  isLoading,
}) => {
  const { removeMember, updateMemberRole } = useTeamStore();
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const currentUserId = 'default-user'; // TODO: Get from auth context
  const currentUserMember = members.find((m) => m.userId === currentUserId);
  const currentUserRole = currentUserMember?.role || ('viewer' as TeamRole);

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;
    try {
      await removeMember(currentTeam.id, userId, currentUserId);
    } catch (error) {
      console.error('Failed to remove member:', error);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      await updateMemberRole(currentTeam.id, userId, newRole, currentUserId);
      setEditingMemberId(null);
    } catch (error) {
      console.error('Failed to update role:', error);
    }
  };

  const getRoleBadgeColor = (role: TeamRole) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'admin':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'editor':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'viewer':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading members...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Team Members ({members.length})</h2>
        {hasPermission(currentUserRole, Permission.InviteMembers) && (
          <Button>
            <Shield className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                User ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Joined
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Invited By
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {members.map((member) => (
              <tr key={member.userId}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                      {member.userId.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {member.userId}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingMemberId === member.userId ? (
                    <select
                      value={member.role}
                      onChange={(e) => void handleUpdateRole(member.userId, e.target.value)}
                      className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                      autoFocus
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                      {currentUserRole === 'owner' && <option value="owner">Owner</option>}
                    </select>
                  ) : (
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full capitalize ${getRoleBadgeColor(member.role)}`}
                    >
                      {member.role}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {new Date(member.joinedAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {member.invitedBy || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end space-x-2">
                    {canModifyRole(currentUserRole, member.role) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditingMemberId(
                            editingMemberId === member.userId ? null : member.userId,
                          )
                        }
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                    {canRemoveRole(currentUserRole, member.role) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRemoveMember(member.userId)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
