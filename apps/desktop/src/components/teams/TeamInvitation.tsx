import React, { useState } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { useAuthStore } from '../../stores/authStore';
import type { TeamInvitation as TeamInvitationType, Team } from '../../types/teams';
import { Button } from '../ui/Button';
import { Mail, Copy, Check } from 'lucide-react';
import { validateUrl } from '../../utils/security';

interface TeamInvitationProps {
  invitations: TeamInvitationType[];
  currentTeam: Team;
  isLoading: boolean;
}

export const TeamInvitation: React.FC<TeamInvitationProps> = ({
  invitations,
  currentTeam,
  isLoading,
}) => {
  const { inviteMember } = useTeamStore();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('editor');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentUserId = useAuthStore((state) => state.getCurrentUserId());

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await inviteMember(currentTeam.id, email, role, currentUserId);
      setEmail('');
      setRole('editor');
    } catch (error) {
      console.error('Failed to invite member:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const copyInviteLink = async (token: string) => {
    // Updated Nov 16, 2025: Added URL validation for security
    const baseUrl = window.location.origin;
    const inviteUrl = `${baseUrl}/accept-invitation?token=${encodeURIComponent(token)}`;

    // Validate the generated URL
    const validation = validateUrl(inviteUrl);
    if (!validation.valid) {
      console.error('Invalid invite URL generated:', validation.error);
      return;
    }

    await navigator.clipboard.writeText(validation.sanitized || inviteUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
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

  const pendingInvitations = invitations.filter((inv) => !inv.accepted);

  return (
    <div className="space-y-6">
      {/* Invite Form */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold mb-4">Invite New Member</h2>
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="viewer">Viewer - Can view resources</option>
              <option value="editor">Editor - Can create and modify resources</option>
              <option value="admin">Admin - Full management access</option>
            </select>
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            <Mail className="mr-2 h-4 w-4" />
            {submitting ? 'Sending Invitation...' : 'Send Invitation'}
          </Button>
        </form>
      </div>

      {/* Pending Invitations */}
      <div>
        <h2 className="text-xl font-semibold mb-4">
          Pending Invitations ({pendingInvitations.length})
        </h2>
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading invitations...</p>
          </div>
        ) : pendingInvitations.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
            <Mail className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-600 dark:text-gray-400">No pending invitations</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Invited By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {pendingInvitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {invitation.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full capitalize ${getRoleBadgeColor(invitation.role)}`}
                      >
                        {invitation.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {invitation.invitedBy}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void copyInviteLink(invitation.token)}
                      >
                        {copiedToken === invitation.token ? (
                          <>
                            <Check className="mr-1 h-4 w-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1 h-4 w-4" />
                            Copy Link
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
